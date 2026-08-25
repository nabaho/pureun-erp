'use strict';
/* 컨설팅 건의 📎 참고 캡처 — 대표 승인 목업 2026-08-23

   "기술보호컨설팅과 현장클리닉의 경우 화면캡처로 사업장의 정보를 저장해야 할
    경우가 많이 있다. 이럴 경우 별도로 저장셀을 만들 거다." → "만들어라."

   위 「현장 사진」은 **방문 증빙**이다 — 타임스탬프가 찍히고, 최대회차·의무방문
   규칙이 그 장수를 센다. 포털 캡처를 그 칸에 넣으면 증빙과 섞여, 나중에 어느 것이
   증빙인지 가릴 수 없다. 그래서 자리를 갈랐다.

   지켜야 하는 것:
   ① **사진 본문을 담지 않는다** — 가리키는 표만. 기록에 그림을 박으면 목록이
      느려진다(급여자료함에서 겪은 문제).
   ② **증빙 판정에 세지 않는다** — photoSlotDefs·extraPhotoCount 를 안 건드린다.
   ③ 타임스탬프를 안 찍고, 장수 제한이 없다(터무니없이 쌓이는 것만 막는다).
   ④ 표를 떼도 사진첩 원본은 남는다 — 그 말을 사람에게 해 준다.

   실행: node --test tests/*.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const R = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(R, 'gov-consulting.html'), 'utf8');

function fnOf(name) {
  const i = app.indexOf('function ' + name + '(');
  assert.ok(i >= 0, name + ' 를 찾지 못했습니다');
  let d = 0;
  for (let k = app.indexOf('{', i); k < app.length; k++) {
    if (app[k] === '{') d++;
    else if (app[k] === '}') { d--; if (!d) return app.slice(i, k + 1); }
  }
  throw new Error(name + ' 의 끝을 찾지 못했습니다');
}

/* 판정·저장 함수를 실제로 돌린다 — 글자만 보면 무엇이 담기는지 못 잡는다. */
function run(o) {
  o = o || {};
  const log = [];
  let scheds = o.scheds || [{ id: 's1', refCaps: o.refCaps || null }];
  const ctx = {
    getScheds: function () { return scheds; },
    setScheds: function (v) { scheds = v; log.push('save'); },
    getStaff: function () { return [{ id: 'u1', name: '권형하' }]; },
    myId: function () { return o.me === undefined ? 'u1' : o.me; },
    canEdit: function () { return o.canEdit !== false; },
    toast: function (m, k) { log.push((k === 'err' ? 'err:' : 'toast:') + m); },
    q: function () { return null; },
    escAttr: function (s) { return String(s == null ? '' : s); },
    firebase: { database: function () { return {}; } },
    photoStorage: function () { return {}; },
    window: {},
    Date, Array, Object, String, Number, Boolean, encodeURIComponent
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(
    app.match(/^const REF_CAP_MAX = \d+;.*$/m)[0] + '\n' +
    ['refCapsOf', 'refCapKey', 'saveRefCaps', 'addRefCaps', 'delRefCap',
      'fmtRefWhen', 'renderRefCaps', 'loadRefCapThumbs'].map(fnOf).join('\n'), ctx);
  return { ctx, log, scheds: function () { return scheds; } };
}
const REF = function (id, name) { return { year: '2026', id: id, owner: 'U1', name: name || '캡처' }; };

/* ══════ ① 표만 담는다 ══════ */

test('★ 사진 본문을 담지 않는다 — 가리키는 표만', () => {
  const r = run();
  r.ctx.addRefCaps('s1', [REF('p1', '통합 기술보호지원반 신청서')]);
  const saved = r.scheds()[0].refCaps;
  assert.equal(saved.length, 1);
  const row = saved[0];
  assert.deepEqual(Object.keys(row).sort().join(','), 'at,by,id,nm,own,y');
  assert.equal(row.nm, '통합 기술보호지원반 신청서', '이름표가 서류 제목이어야 찾을 수 있습니다');
  assert.equal(row.by, '권형하', '붙인 이가 없으면 「누가 왜 넣었지」에 못 답합니다');
  assert.ok(row.at > 0, '붙인 때가 없습니다');
  /* 그림이 들어갈 자리가 아예 없어야 한다 */
  const j = JSON.stringify(saved);
  assert.ok(j.indexOf('data:') < 0 && j.length < 400,
    '★ 기록에 그림이 박히면 목록이 느려집니다: ' + j.length + '자');
});

test('★ 여러 장을 한꺼번에 붙인다 — 상담 한 건에 캡처가 여러 장 나온다', () => {
  const r = run();
  r.ctx.addRefCaps('s1', [REF('p1'), REF('p2'), REF('p3')]);
  assert.equal(r.scheds()[0].refCaps.length, 3);
});

test('★ 같은 사진을 두 번 붙이지 않는다 — 두 벌이 되면 무엇이 진짜인지 모른다', () => {
  const r = run();
  r.ctx.addRefCaps('s1', [REF('p1')]);
  r.ctx.addRefCaps('s1', [REF('p1'), REF('p2')]);
  assert.equal(r.scheds()[0].refCaps.length, 2, '이미 있는 것을 또 붙였습니다');
  assert.ok(r.log.some(function (l) { return /건너뜀/.test(l); }), '건너뛴 것을 안 알려 줍니다');
});

test('터무니없이 쌓이는 것만 막는다 — 장수 규칙이 아니다', () => {
  const m = app.match(/^const REF_CAP_MAX = (\d+);/m);
  assert.ok(m && Number(m[1]) >= 20, '★ 상한을 낮게 잡으면 상담 한 건도 못 담습니다');
});

/* ══════ ② 떼도 원본은 남는다 ══════ */

test('★ 표를 떼면 그 말을 해 준다 — 사진을 지운 줄 알고 걱정한다', () => {
  const r = run({ refCaps: [{ y: '2026', id: 'p1', own: 'U1', nm: 'ㄱ', at: 1, by: '나' }] });
  r.ctx.delRefCap('s1', '2026/p1');
  assert.equal(r.scheds()[0].refCaps, null, '지운 뒤 빈 값은 null 이어야 옛 값이 안 살아납니다');
  assert.ok(r.log.some(function (l) { return /사진첩 원본은 그대로/.test(l); }),
    '★ 원본이 남는다는 말이 없습니다: ' + r.log.join(' | '));
});

test('빈 배열이 아니라 null 로 지운다 — 실시간DB 가 빈 배열을 아예 안 적는다', () => {
  const fn = fnOf('saveRefCaps');
  assert.match(fn, /else scheds\[i\]\.refCaps=null;/,
    '★ 빈 배열로 두면 다음에 읽을 때 옛 값이 되살아납니다');
});

test('없는 칸을 읽어도 안 죽는다 — 옛 기록에는 refCaps 가 없다', () => {
  const r = run();
  assert.equal(r.ctx.refCapsOf({}).length, 0);
  assert.equal(r.ctx.refCapsOf(null).length, 0);
  assert.equal(r.ctx.refCapsOf({ refCaps: '이상한값' }).length, 0);
});

/* ══════ ③ 남의 것은 못 건드린다 ══════ */

test('★ 본인 컨설팅만 붙이고 뗀다', () => {
  const a = run({ canEdit: false });
  a.ctx.addRefCaps('s1', [REF('p1')]);
  assert.equal(a.scheds()[0].refCaps, null, '★ 남의 일정에 붙였습니다');
  assert.ok(a.log.some(function (l) { return /^err:본인 컨설팅만/.test(l); }));
  const b = run({ canEdit: false, refCaps: [{ y: '2026', id: 'p1', own: '', nm: 'ㄱ', at: 1, by: '' }] });
  b.ctx.delRefCap('s1', '2026/p1');
  assert.equal(b.scheds()[0].refCaps.length, 1, '★ 남의 일정에서 뗐습니다');
});

/* ══════ ④ 증빙과 섞이지 않는다 — 이 검사가 핵심이다 ══════ */

test('★ 증빙 판정에 참고 캡처가 안 섞인다 — 최대회차·의무방문 규칙이 어긋난다', () => {
  for (const n of ['photoSlotDefs', 'extraPhotoCount', 'baseSlotCount']) {
    const i = app.indexOf('function ' + n + '(');
    if (i < 0) continue;
    const fn = fnOf(n);
    assert.ok(!/refCap/i.test(fn),
      '★ ' + n + ' 이 참고 캡처를 봅니다 — 증빙 장수가 어긋납니다');
  }
});

test('★ 타임스탬프를 안 찍는다 — 방문 시각이 아니다', () => {
  const fn = fnOf('addRefCaps');
  assert.ok(!/stamp|simpleStampFile|insertAlbumFull/i.test(fn),
    '★ 참고 캡처에 방문 시각을 찍으면 증빙으로 오해합니다');
});

test('★ 원본을 받아 오지 않는다 — 표만 붙이므로 기다림이 없다', () => {
  const fn = fnOf('addRefCaps');
  assert.ok(!/loadFull/.test(fn), '★ 원본을 받으면 캡처 열 장에 수십 MB 입니다');
  /* 미리보기는 «작은 것»만 받는다 */
  assert.match(fnOf('loadRefCapThumbs'), /loadThumb/, '미리보기를 원본으로 받고 있습니다');
});

/* ══════ ⑤ 배선 ══════ */

test('★ 사진 칸을 그릴 때 참고 캡처도 함께 그린다 — 안 부르면 없는 것과 같다', () => {
  assert.match(fnOf('renderEditPhotos'), /renderRefCaps\(sid, sc\)/,
    '★ 만들고 안 부르면 화면에 아무것도 없습니다');
});

test('★ 고르기 창은 하나를 같이 쓴다 — 창을 두 벌 만들면 한쪽만 고쳐진다', () => {
  /* ⚠ 빈칸까지 못 박지 않는다 — 코드가 `albumPickTarget={ …` 로 붙여 쓰면서 이 검사가
     깨져 main 이 빨개졌다(2026-08-25, 아무도 손대지 않은 채). 여기서 볼 것은
     «세 칸(sid·slotIdx·ref)을 담아 두는가»이지 빈칸을 어디에 두었는가가 아니다. */
  assert.match(fnOf('openAlbumPicker'),
    /albumPickTarget\s*=\s*\{\s*sid\s*:\s*sid\s*,\s*slotIdx\s*:\s*slotIdx\s*,\s*ref\s*:\s*!!ref\s*\}/);
  assert.match(fnOf('openRefCapPicker'), /openAlbumPicker\(sid, null, true\)/);
  /* 고른 뒤 참고 캡처 쪽으로 갈라지는 자리 */
  assert.match(fnOf('pickAlbumPhoto'), /if\(target\.ref\)\{/,
    '★ 갈라지지 않으면 참고 캡처가 증빙 칸으로 들어갑니다');
  assert.match(fnOf('pickAlbumPhoto'), /rf\.docName\|\|rf\.company/,
    '이름표를 서류 제목부터 쓰지 않습니다');
});

test('★ 끌어다 놓기는 «고른 전부»를 받는다', () => {
  assert.match(fnOf('dropRefCap'), /PuDrag\.readAll\(e\.dataTransfer\)/,
    '★ read() 로 받으면 여덟 장을 끌어도 한 장만 들어갑니다');
});

test('화면에 칸과 제목이 있다 — 증빙과 갈라 보이게', () => {
  assert.match(app, /id="mEditRefWrap"/, '참고 캡처 칸이 없습니다');
  assert.match(app, /id="mEditRefGrid"/);
  assert.match(app, /📎 참고 캡처/, '제목이 없으면 무엇을 넣는 칸인지 모릅니다');
  /* ⚠ 「증빙 아님」이라는 낱말은 «주석»에도 여러 번 나온다(왜 갈랐는지 적어 뒀다).
     그것만 보면 화면 글자를 지워도 통과한다(되돌림 시험에서 살아남았다).
     그래서 «제목 줄의 markup» 을 그대로 못박는다. */
  assert.match(app, /📷 현장 사진 <span class="ph-sub">— 방문 증빙\(타임스탬프\)<\/span>/,
    '현장 사진이 증빙이라는 말이 화면에 없습니다');
  assert.match(app, /📎 참고 캡처 <span class="ph-sub">— 증빙 아님 · 몇 장이든<\/span>/,
    '★ 두 칸이 나란한데 어느 것이 증빙인지 화면에 안 적혀 있습니다');
  assert.match(app, /\.ref-grid\{/, '참고 캡처 칸 모양 규칙이 없습니다');
});

test('사진첩에서 그 사진을 열 수 있다 — 어느 캡처였는지 확인해야 한다', () => {
  const fn = fnOf('openRefCapPhoto');
  assert.match(fn, /pu-photos\.html\?photo=/);
  assert.match(fn, /&year=/);
});
