'use strict';
/* 참고 캡처를 «붙여넣기»로 넣는다 — 대표 지시 2026-08-23 「붙여넣기도」

   포털에서 Win+Shift+S 로 오려 낸 뒤 컨설팅 건 편집 창에서 Ctrl+V — 한 걸음에.

   지켜야 하는 것:
   ① **사진첩에 먼저 올린다.** 컨설팅 기록에는 «가리키는 표»만 담기 때문이고,
      사진첩에 두어야 판독(제목·기업명·사업자번호·매출액·상근로자수)이 붙고
      사업자번호로 기업정보함에 모인다. 이 건에만 붙이면 다른 건에서 못 본다.
   ② **쓰기에는 계정을 넘긴다.** 저장 층은 담을 자리를 uid 로 정한다 — 안 넘기면
      「사진을 담을 계정을 알 수 없습니다」로 통째로 막힌다(읽기만 할 때와 다르다).
   ③ **크기 기준은 저장 층이 정한다**(uploadSpec). 여기서 숫자를 박으면 사진첩과
      갈려, 새로 올린 서식이 「원본이 작습니다」로 쌓인다.
   ④ **서류(doc)로 올린다.** 캡처는 글자를 읽는 물건이다 — 사진으로 올리면 긴 변이
      1600 으로 줄어 판독이 흐려진다.
   ⑤ **글자 붙여넣기는 건드리지 않는다.** 메모 칸에 글을 붙이는 일을 막으면 안 된다.
   ⑥ 저장 방식(창고/실시간DB)은 넘기지 않는다 — 앱마다 갈리면 이 앱만 다른 저장소를 본다.

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

/* 저장 층·화면을 가짜로 두고 실제로 돌린다 */
function run(o) {
  o = o || {};
  const log = [];
  const calls = { init: null, saved: null, refs: null, spec: null };
  let scheds = [{ id: 's1', refCaps: null }];
  const ctx = {
    getScheds: function () { return scheds; },
    setScheds: function (v) { scheds = v; },
    getStaff: function () { return [{ id: 'u1', name: '권형하' }]; },
    myId: function () { return 'u1'; },
    canEdit: function () { return o.canEdit !== false; },
    toast: function (m, k) { log.push((k === 'err' ? 'err:' : 'toast:') + m); },
    q: function () { return null; },
    escAttr: function (s) { return String(s == null ? '' : s); },
    photoStorage: function () { return { S: 1 }; },
    firebase: { database: function () { return { D: 1 }; },
      auth: function () { return { currentUser: o.noUser ? null : { uid: 'U9', email: 'a@b.c' } }; } },
    addRefCaps: function (sid, refs) { calls.refs = { sid: sid, refs: refs }; },
    refShrink: function (file, sizes) {
      calls.spec = sizes;
      return Promise.resolve(sizes.map(function (s) {
        return { dataUrl: 'data:image/jpeg;base64,X', w: s.maxEdge, h: s.maxEdge };
      }));
    },
    PuPhotoStore: {
      init: function (d) { calls.init = d; return 'storage'; },
      uploadSpec: function (isDoc) {
        calls.isDoc = isDoc;
        return isDoc ? { maxEdge: 2000, quality: 0.92, thumbEdge: 240 }
          : { maxEdge: 1600, quality: 0.85, thumbEdge: 240 };
      },
      newId: function () { return 'NEW1'; },
      savePhoto: function (p) {
        calls.saved = p;
        /* ⚠ 올해와 «다른» 해를 돌려준다. 올해로 두면 「저장 층이 준 해를 쓰는지」를
           가릴 수 없다 — new Date().getFullYear() 로 지어내도 같은 값이 나온다
           (되돌림 시험에서 그 뮤테이션이 살아남아 이렇게 바꿨다). */
        return o.saveFails ? Promise.reject(new Error('막힘'))
          : Promise.resolve({ year: '2019', id: p.id });
      }
    },
    Date, Promise, Object, String, Number, Array, Boolean, URL: { createObjectURL: function () { return 'b:'; },
      revokeObjectURL: function () {} },
    Image: function () {}, document: { createElement: function () { return {}; } },
    console: { warn: function () {} }
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(fnOf('refCapFileName') + '\n' + fnOf('uploadRefCap'), ctx);
  return { ctx, log, calls, scheds: function () { return scheds; } };
}
const settle = function () { return new Promise(function (r) { setTimeout(r, 20); }); };

/* ══════ ① 사진첩에 먼저 올린다 ══════ */

test('★ 사진첩에 올린 뒤 그 표를 붙인다 — 이 건에만 붙이면 다른 건에서 못 본다', async () => {
  const r = run();
  r.ctx.uploadRefCap('s1', { type: 'image/png' });
  await settle();
  assert.ok(r.calls.saved, '★ 사진첩에 안 올렸습니다');
  assert.ok(r.calls.refs, '★ 올리고 표를 안 붙였습니다');
  assert.equal(r.calls.refs.sid, 's1');
  assert.equal(r.calls.refs.refs[0].id, 'NEW1');
  assert.equal(r.calls.refs.refs[0].year, '2019',
    '★ 저장 층이 알려 준 해를 써야 찾을 수 있습니다 — 올해로 짐작하면 못 찾습니다');
  assert.equal(r.calls.refs.refs[0].owner, 'U9');
});

test('★ 서류로 올린다 — 사진으로 올리면 긴 변이 줄어 판독이 흐려진다', async () => {
  const r = run();
  r.ctx.uploadRefCap('s1', {});
  await settle();
  assert.equal(r.calls.isDoc, true, '★ uploadSpec(true) 로 부르지 않았습니다');
  assert.equal(r.calls.saved.meta.kind, 'doc', "★ meta.kind 가 'doc' 이어야 합니다");
});

test('★ 크기 기준을 저장 층에서 받아 쓴다 — 숫자를 박으면 사진첩과 갈린다', async () => {
  const r = run();
  r.ctx.uploadRefCap('s1', {});
  await settle();
  assert.equal(r.calls.spec[0].maxEdge, 2000, '★ 저장 층의 값(2000)을 안 썼습니다');
  assert.equal(r.calls.spec[0].quality, 0.92);
  assert.equal(r.calls.spec[1].maxEdge, 240, '미리보기 크기도 저장 층에서 받아야 합니다');
  const fn = fnOf('uploadRefCap');
  assert.match(fn, /PuPhotoStore\.uploadSpec\(true\)/);
  assert.ok(!/maxEdge:\s*\d/.test(fn), '★ 여기서 크기를 박았습니다');
});

/* ══════ ② 쓰기에는 계정을 넘긴다 ══════ */

test('★ 계정을 넘긴다 — 안 넘기면 「담을 계정을 알 수 없습니다」로 막힌다', async () => {
  const r = run();
  r.ctx.uploadRefCap('s1', {});
  await settle();
  assert.equal(r.calls.init.uid, 'U9', '★ uid 를 안 넘겼습니다');
  assert.equal(r.calls.init.name, '권형하', '올린 이 이름이 없으면 목록에서 누구 것인지 모릅니다');
  assert.ok(r.calls.init.db && r.calls.init.storage, 'db·창고를 안 넘겼습니다');
});

test('★ 저장 방식은 넘기지 않는다 — 앱마다 갈리면 이 앱만 다른 저장소를 본다', async () => {
  const r = run();
  r.ctx.uploadRefCap('s1', {});
  await settle();
  assert.equal(r.calls.init.mode, undefined, '★ mode 를 넘겼습니다');
  assert.ok(!/mode\s*:/.test(fnOf('uploadRefCap')), '★ 코드에 mode 가 있습니다');
});

test('올린 이·때를 남긴다 — 나중에 「누가 왜 넣었지」에 답해야 한다', async () => {
  const r = run();
  r.ctx.uploadRefCap('s1', {});
  await settle();
  const m = r.calls.saved.meta;
  assert.equal(m.by, 'U9');
  assert.equal(m.byName, '권형하');
  assert.ok(m.upAt > 0 && m.takenAt > 0);
  assert.ok(m.w > 0 && m.h > 0, '크기를 안 남기면 「원본이 작다」 판정이 못 돕니다');
});

/* ══════ ③ 안 될 때 ══════ */

test('★ 본인 컨설팅이 아니면 올리지 않는다', async () => {
  const r = run({ canEdit: false });
  r.ctx.uploadRefCap('s1', {});
  await settle();
  assert.equal(r.calls.saved, null, '★ 남의 일정에 올렸습니다');
  assert.ok(r.log.some(function (l) { return /^err:본인 컨설팅만/.test(l); }));
});

test('로그인이 풀렸으면 올리지 않고 말해 준다', async () => {
  const r = run({ noUser: true });
  r.ctx.uploadRefCap('s1', {});
  await settle();
  assert.equal(r.calls.saved, null);
  assert.ok(r.log.some(function (l) { return /^err:/.test(l); }));
});

test('★ 올리다 막히면 조용히 넘어가지 않는다 — 올라간 줄 알면 증빙이 빈다', async () => {
  const r = run({ saveFails: true });
  r.ctx.uploadRefCap('s1', {});
  await settle();
  assert.equal(r.calls.refs, null, '못 올렸는데 표를 붙였습니다');
  assert.ok(r.log.some(function (l) { return /^err:올리지 못했습니다/.test(l); }),
    '실패를 안 알려 줍니다: ' + r.log.join(' | '));
});

/* ══════ ④ 글자 붙여넣기는 건드리지 않는다 ══════ */

function pasteCtx(o) {
  o = o || {};
  const ctx = {
    q: function () { return o.open === false ? { classList: { contains: function () { return false; } } }
      : { classList: { contains: function () { return true; } } }; },
    Object, String, Array, Boolean
  };
  vm.createContext(ctx);
  vm.runInContext(fnOf('refPasteImage'), ctx);
  return ctx;
}
const ev = function (items) { return { clipboardData: { items: items } }; };

test('★ 그림이 없으면 아무것도 안 한다 — 메모에 글 붙이는 일을 막으면 안 된다', () => {
  const c = pasteCtx();
  assert.equal(c.refPasteImage(ev([{ kind: 'string', type: 'text/plain' }])), null);
  assert.equal(c.refPasteImage(ev([])), null);
  assert.equal(c.refPasteImage({ }), null);
});

test('★ 편집 창이 닫혀 있으면 아무것도 안 한다', () => {
  const c = pasteCtx({ open: false });
  assert.equal(c.refPasteImage(ev([{ kind: 'file', type: 'image/png',
    getAsFile: function () { return { f: 1 }; } }])), null);
});

test('그림이면 그 파일을 준다', () => {
  const c = pasteCtx();
  const f = c.refPasteImage(ev([{ kind: 'string', type: 'text/html' },
    { kind: 'file', type: 'image/png', getAsFile: function () { return { f: 1 }; } }]));
  assert.deepEqual(f && f.f, 1);
});

/* ══════ ⑤ 배선 ══════ */

test('★ 붙여넣기를 받는 곳이 있고, 열린 일정으로 보낸다', () => {
  const i = app.indexOf("document.addEventListener('paste'");
  assert.ok(i > 0, '★ 붙여넣기를 받지 않으면 Ctrl+V 가 아무 일도 안 합니다');
  const seg = app.slice(i, i + 400);
  assert.match(seg, /refPasteImage\(e\)/);
  assert.match(seg, /uploadRefCap\(edit_id, f\)/, '★ 어느 일정에 붙일지 안 정했습니다');
  assert.match(seg, /if\(!f\) return;/, '★ 글자 붙여넣기를 막고 있습니다');
  assert.match(seg, /if\(!edit_id\) return;/, '열린 일정이 없을 때를 안 가립니다');
});

test('★ 붙여넣기가 된다는 것을 화면에 적는다 — 안 적으면 아무도 눌러 보지 않는다', () => {
  assert.match(app, /Ctrl\+V 로 붙여넣어도 됩니다/);
  assert.match(app, /Win\+Shift\+S/, '어떻게 오려 내는지 안 알려 줍니다');
});

test('한 번만 풀어 두 크기를 만든다 — 두 번 풀면 큰 캡처에서 화면이 멎는다', () => {
  const fn = fnOf('refShrink');
  assert.equal((fn.match(/new Image\(\)/g) || []).length, 1, '★ 그림을 두 번 풉니다');
  assert.match(fn, /sizes\.map/);
  /* ⚠ revokeObjectURL 은 이 함수에 «세 번» 나온다(성공·실패·못 열림). 「있나」로만
     보면 성공 길에서 지워도 통과한다 — 그때가 가장 많이 새는 길이다
     (되돌림 시험에서 살아남아 이렇게 조였다). 세 길을 다 못박는다. */
  assert.equal((fn.match(/revokeObjectURL/g) || []).length, 3,
    '★ 주소를 놓는 곳이 세 길(성공·실패·못 열림) 다 있어야 기억이 안 샙니다');
  assert.match(fn, /URL\.revokeObjectURL\(url\);\s*\r?\n\s*ok\(out\);/,
    '★ 성공한 길에서 주소를 안 놓았습니다 — 가장 많이 지나는 길입니다');
});
