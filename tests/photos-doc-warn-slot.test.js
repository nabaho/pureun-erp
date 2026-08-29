'use strict';
/* 서류 칸의 ⚠ 가 제 줄을 차지하지 않게 (대표 승인 안 ①, 2026-08-21)

   "서류 밑에 경고 표시 이거 안 보이게 할 수 있나? 아니면 한 줄 일부러 차지
    안 해도 되는데 어떻게 관리해야 하나?"

   브라우저에서 실제 CSS 로 재 보니 서류 카드 138px 중 **아래 20px 이 늘 비어**
   있었다 — 모서리 ⚠ 가 마지막 줄 글자를 덮지 않게 비운 자리인데, 경고가 «없는»
   카드도 똑같이 비웠다. 그것이 「일부러 차지한 한 줄」이었다.

   고른 길: 숨기지 않고 **「서류」 딱지에 합친다**. 파란 「서류」 → 주황 「⚠ 서류」.
   이미 딱지가 있던 자리라 새 자리를 안 쓰고, 빈 20px 이 글자 자리로 돌아온다.
   ⚠ 숨기는 길(안 ②)은 대표가 안 고르셨다 — 8/15 지시가 「경고 표시를 보이게
     해달라」였기 때문이다. 이 검사가 그 되돌림을 막는다.

   실행: node --test tests/*.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const R = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(R, 'pu-photos.html'), 'utf8');
const css = (app.match(/<style>([\s\S]*?)<\/style>/) || [, ''])[1];

/* ── 칸을 그리는 대목만 떼어내 «실제로 돌려» 본다 ──
   글자 모양만 보면 «어떤 짝에서» 무엇이 그려지는지를 못 잡는다. 여기서 보고 싶은
   것이 바로 그 짝(서류/사진 × 경고/없음 × 걸러보기/전체)이다. */
const SLICE = (function () {
  /* 미리보기 주소(t)부터 담아야 한다 — 슬라이스 안에서 쓰이는 값이다. */
  const a = app.indexOf('const t = safeSrc(it.thumb);');
  assert.ok(a > 0, '칸을 그리는 대목을 찾지 못했습니다');
  /* ⚠ 칸을 닫는 글자는 «두 번» 나온다 — 서류 카드와 일반 사진. 첫 번째에서
     자르면 if/else 가 반토막 나 「Unexpected end of input」이 된다(여기서 한 번
     당했다). 서류 분기의 여닫는 중괄호를 세어 else 까지 온전히 담는다. */
  const ifAt = app.indexOf("if (it.meta.kind === 'doc') {", a);
  assert.ok(ifAt > a, '서류/사진 갈림길을 찾지 못했습니다');
  let d = 0, end = -1;
  for (let k = app.indexOf('{', ifAt); k < app.length; k++) {
    if (app[k] === '{') d++;
    else if (app[k] === '}') { d--; if (!d) { end = k + 1; break; } }
  }
  assert.ok(end > 0, '서류 분기의 끝을 찾지 못했습니다');
  /* else 가 붙어 있으면 그 덩이까지 함께 담는다. */
  const rest = app.slice(end);
  const m = rest.match(/^\s*else\s*\{/);
  if (!m) return app.slice(a, end);
  d = 0;
  for (let k = end + rest.indexOf('{'); k < app.length; k++) {
    if (app[k] === '{') d++;
    else if (app[k] === '}') { d--; if (!d) return app.slice(a, k + 1); }
  }
  throw new Error('else 덩이의 끝을 찾지 못했습니다');
})();

/* it 하나를 넣으면 그 칸의 html 을 돌려준다. */
function cellFor(o) {
  const ctx = {
    it: o.it,
    needOnly: !!o.needOnly,
    byTitle: false,
    selected: new Set(),
    html: '',
    esc: function (s) { return String(s == null ? '' : s); },
    safeSrc: function () { return 'x.png'; },
    idsOf: function () { return [1]; },
    needsCheck: function () { return !!o.need; },
    checkWhy: function () { return '업체 이름이 비어 있습니다'; },
    docLabel: function () { return ''; },
    docTitle: function () { return o.title || ''; },
    /* 📌 증빙 딱지가 늘었다(2026-08-26) — 안 주면 칸이 통째로 안 그려진다 */
    isUsed: function () { return !!o.used; },
    usedWhere: function () { return o.used ? '푸른이알피 계약 — 가나' : ''; },
    /* 👤 공유 칩이 늘었다(2026-08-29) — 「내 사진」에 공유받은 것이 섞이면서 칸이
       「누가 열어 줬는지」를 적는다. 안 주면 칸이 통째로 안 그려진다. */
    sharedByName: function () { return o.sharedBy || ''; },
    ALL_OWNERS: '__all__', gridOwner: null,
    String: String, Set: Set, Boolean: Boolean
  };
  vm.createContext(ctx);
  /* 떼어낸 대목은 forEach 안의 몸통이라 if/else 가 짝이 맞다 — 그대로 돌린다. */
  vm.runInContext(SLICE, ctx);
  return ctx.html;
}

const DOC = { id: 'p1', thumb: 't', meta: { kind: 'doc', company: '그린파이', read: { kind: 'bizreg' } } };
const MEET = { id: 'p2', thumb: 't', meta: { kind: 'doc', company: '', read: { kind: 'meeting' } } };
const PHOTO = { id: 'p3', thumb: 't', meta: { kind: 'photo', company: '오색농산물', read: { kind: 'meeting' } } };

/* ══════ ① 서류 카드: 딱지가 그대로 경고가 된다 ══════ */

test('★ 확인 필요한 서류 카드 — 딱지가 주황 「⚠ 서류」가 되고 모서리 표는 없다', () => {
  const h = cellFor({ it: DOC, need: true, title: '사업자등록증명' });
  assert.match(h, /class="tag need">⚠ 서류</, '★ 딱지에 경고를 안 얹었습니다');
  assert.ok(!/class="wn"/.test(h),
    '★ 모서리 표를 같이 그리면 같은 말이 두 번이고 20px 을 또 내줍니다');
});

test('★ 그 카드는 아래를 안 비운다 — 되찾은 한 줄이 이 검사의 목적이다', () => {
  const h = cellFor({ it: DOC, need: true, title: '사업자등록증명' });
  assert.ok(!/wnpad/.test(h),
    '★ 자리를 그대로 비우면 딱지에 합친 뜻이 없어집니다 — 한 줄이 또 빕니다');
});

test('★ 경고가 «없는» 서류 카드도 아래를 안 비운다 — 예전엔 여기가 그냥 빈 줄이었다', () => {
  const h = cellFor({ it: DOC, need: false, title: '명함' });
  assert.ok(!/wnpad/.test(h), '★ 경고도 없는데 한 줄을 비웁니다 — 대표가 지적한 그것입니다');
  assert.match(h, /class="tag">서류</, '평소 딱지는 그대로여야 합니다');
  assert.ok(!/⚠/.test(h), '경고가 없는데 ⚠ 가 보입니다');
});

/* ══════ ② 합치지 «않는» 자리 — 얹을 딱지가 없거나, 이유를 적어야 할 때 ══════ */

test('★ 딱지가 없는 서류 칸(회의로 읽힌 것)은 모서리 표를 쓰고, 그때만 비운다', () => {
  const h = cellFor({ it: MEET, need: true });
  assert.ok(!/class="tag/.test(h), '회의로 읽힌 서류에는 딱지를 안 붙입니다(8/17 지시)');
  assert.match(h, /class="wn">⚠/, '★ 얹을 딱지가 없는데 경고까지 사라지면 놓칩니다');
  assert.match(h, /wnpad/, '★ 모서리 표가 마지막 줄 글자를 덮습니다');
});

test('★ 「확인 필요」만 볼 때는 합치지 않는다 — 왜 걸렸는지가 더 중요하다', () => {
  const h = cellFor({ it: DOC, need: true, needOnly: true, title: '사업자등록증명' });
  assert.match(h, /class="wn why">업체 이름이 비어 있습니다/,
    '★ 이유 띠를 없애면 한 장씩 열어 봐야 압니다(8/10 지시)');
  assert.ok(!/tag need/.test(h), '이유 띠가 있는데 딱지까지 주황이면 두 번 말합니다');
  assert.match(h, /wnpad/, '이유 띠가 마지막 줄 글자를 덮습니다');
});

test('일반 사진은 손대지 않았다 — 그림이 칸을 꽉 채워 빈 줄이 없었다', () => {
  const h = cellFor({ it: PHOTO, need: true });
  assert.match(h, /class="wn">⚠/, '일반 사진의 모서리 표는 그대로여야 합니다');
  assert.ok(!/cell doc/.test(h), '일반 사진이 서류 카드로 그려집니다');
});

/* ══════ ③ 숨기지 않았다 ══════ */

test('★ 칸에서 경고를 아예 없애지 않았다 — 8/15 「보이게 해달라」를 되돌리지 말 것', () => {
  const on = cellFor({ it: DOC, need: true, title: '명함' });
  assert.match(on, /⚠/, '★ 확인 필요한 서류인데 칸에 아무 표시가 없습니다');
});

/* ══════ ④ 색·자리 규칙 ══════ */

test('★ 주황 딱지 규칙이 있고, 비우기는 .wnpad 에만 걸린다', () => {
  assert.match(css, /#grid \.cell \.tag\.need\{background:#b45309/,
    '★ .need 색 규칙이 없으면 「⚠ 서류」가 파란 딱지 그대로라 안 보입니다');
  assert.match(css, /#grid \.cell\.doc\.wnpad \.bd\{padding-bottom:20px\}/,
    '★ 비우기가 .wnpad 에 안 걸리면 모든 카드가 다시 한 줄을 잃습니다');
  assert.ok(!/#grid \.cell\.doc \.bd\{padding-bottom:20px\}/.test(css),
    '★ 모든 서류 카드를 비우는 옛 규칙이 남아 있습니다 — 고친 것이 묻힙니다');
});

test('경고 딱지 색은 모서리 표와 같은 주황이다 — 한 색이 한 뜻이어야 한다', () => {
  const wn = css.match(/#grid \.cell \.wn\{[^}]*background:(#[0-9a-f]{6})/i);
  const need = css.match(/#grid \.cell \.tag\.need\{background:(#[0-9a-f]{6})/i);
  assert.ok(wn && need, '두 규칙을 다 찾지 못했습니다');
  assert.equal(need[1].toLowerCase(), wn[1].toLowerCase(),
    '색이 다르면 「주황은 확인할 것」이라는 약속이 깨집니다');
});
