/* 도구줄 — 아이콘만, 그리고 «읽을 글자가 없는 사진»에는 판독을 안 보여 준다
   (대표 지시 2026-08-29)

   "가리고 사진 이부분 글자가 아니라 아이콘으로 확인할 수 있게 해달라.
    그리고 그림의 경우 기본적으로 다시 판독을 할 필요가 없다 …
    판독이 필요없는경우 다시판독 단어가 필요없지 않나?"

   ■ 무엇이 문제였나
   ① 단추 셋이 글자를 달고 있어 좁은 판에서 **잘렸다** — 「다시 ...」 「가리고 ...」
      「사진 ...」. 무엇인지 알 수가 없다. (실측: 아이콘만 두니 단추가 27~36px,
      가장 붐비는 경우 7개에 256px 로 260px 판에 들어간다)
   ② 회의·현장 사진에도 「다시 판독」이 늘 떠 있었다. 그 사진은 **읽을 글자가 없다** —
      눌러도 같은 답이 다시 나올 뿐이고 **요금만 나간다.**

   ■ 그래도 길을 «없애지는» 않는다
   명함을 사진으로 올렸다가 회의사진으로 읽힌 일이 있었다(2026-08-03). 그때 다시
   읽을 방법이 아예 없어 막혔다. 그래서 도구줄에서만 빼고 판 안에 «작은 한 줄»로
   남긴다 — 평소엔 안 보이고 필요할 때는 있다. */

'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { cutFn } = require('./cut-fn');
/* 색은 «값»이 아니라 «뜻»으로 본다 — 팔레트를 정리해도 안 깨지게 */
const P = require('./lib-palette.js');

const R = path.join(__dirname, '..');
const APP = fs.readFileSync(path.join(R, 'pu-photos.html'), 'utf8');

/* 도구줄을 «실제로» 그려 본다 — 글자가 있나 없나는 그려 봐야 안다 */
function row(read, showAck, over) {
  const ctx = Object.assign({
    viewerId: 'p1',
    canShareFiles: function () { return false; },
    mayTouch: function () { return true; },
    docNavBtns: function () { return ''; },
    esc: function (s) { return String(s); },
    Object: Object, String: String
  }, over || {});
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(APP.match(/const PIC_KINDS = \{[^}]*\};/)[0] + '\n' +
    cutFn(APP, 'function noTextKind(') + '\n' + cutFn(APP, 'function actsRow('), ctx);
  return ctx.actsRow(read ? '다시 판독' : '글자 판독하기', !!showAck, { meta: { read: read } });
}
/* 단추 안에 «사람이 읽는 글자»가 남아 있나 (아이콘·기호는 글자가 아니다) */
function wordsIn(html) {
  return [].concat.apply([], (html.match(/<button[^>]*>([^<]*)</g) || []).map(function (m) {
    const t = m.slice(m.lastIndexOf('>', m.length - 2) + 1, -1).trim();
    return /[가-힣a-zA-Z]/.test(t) ? [t] : [];
  }));
}

/* ── ① 아이콘만 ── */

test('★★ 도구줄 단추에 «글자가 없다» — 좁은 판에서 잘려 무엇인지 알 수 없었다', () => {
  [[{ kind: 'card', auto: true }, false],
   [{ kind: 'contract', auto: true }, false],
   [{ kind: 'form', auto: true }, true],
   [null, false]].forEach(function (c) {
    const w = wordsIn(row(c[0], c[1]));
    assert.deepEqual(w, [],
      '★★ 아직 글자가 달린 단추가 있습니다: ' + w.join(' / ') +
      '\n  좁은 판에서 「다시 ...」 「가리고 ...」로 잘려 무엇인지 알 수 없습니다.');
  });
});

test('★★ 글자를 «없애기만» 하지 않는다 — title 로 내려야 무엇인지 알 수 있다', () => {
  const html = row({ kind: 'card', auto: true });
  const btns = html.match(/<button[^>]*>/g) || [];
  const noTitle = btns.filter(function (b) { return b.indexOf('title=') < 0; });
  assert.deepEqual(noTitle, [],
    '★★ 글자도 없고 설명도 없는 단추가 있습니다 — 눌러 보기 전에는 모릅니다:\n' + noTitle.join('\n'));
  /* 설명에는 «그 단추가 무엇인지»가 들어야 한다 */
  assert.match(html, /title="🔒 가리고 판독 —/, '★ 자물쇠가 무슨 뜻인지 안 적혀 있습니다');
  assert.match(html, /title="🖍 사진 편집 —/, '★ 붓이 무슨 뜻인지 안 적혀 있습니다');
  assert.match(html, /title="다시 판독 —/, '★ 판독 단추의 설명이 없습니다');
});

test('★★ 셋을 «색으로» 갈라 둔다 — 아이콘만 남으면 한 덩어리로 보인다', () => {
  const html = row({ kind: 'card', auto: true });
  assert.match(html, /class="rd"/, '판독');
  assert.match(html, /class="rd mask"/, '가리고 판독');
  assert.match(html, /class="rd edit"/, '사진 편집');
  const css = APP.replace(/\/\*[\s\S]*?\*\//g, '');
  /* ⚠ 색값을 박지 않는다 — 지켜야 할 것은 「셋이 서로 다른가」다.
     팔레트를 정리하면 값은 바뀌지만 «갈라져 있어야 한다»는 규칙은 그대로다. */
  const pick = (sel) => {
    const m = css.match(new RegExp('\\.acts \\.rd' + sel + '\\{[^}]*color:(#[0-9a-fA-F]{3,8})'));
    return m && m[1].toLowerCase();
  };
  const base = pick(''), mask = pick('\\.mask'), edit_ = pick('\\.edit');
  assert.ok(mask, '★ 가리고 판독의 색 규칙이 없어졌습니다');
  assert.ok(edit_, '★ 사진 편집의 색 규칙이 없어졌습니다');
  /* ⚠ 기본 단추는 «제 색 규칙이 없다» — 물려받는다. 그러니 있는 것끼리만 견준다.
     셋이 다 정해져 있어야 한다고 박으면 물려받는 쪽이 억울하게 걸린다. */
  const got = [base, mask, edit_].filter(Boolean);
  assert.notEqual(mask, edit_,
    '★ 「가리고 판독」과 「사진 편집」이 같은 색입니다: ' + mask);
  assert.equal(new Set(got).size, got.length,
    '★ 겹치는 색이 있습니다 — 아이콘만 남으면 한 덩어리로 보입니다: ' + got.join(' '));
});

test('★ 판독 단추가 «남은 자리를 다 먹지» 않는다 — 이제 한 글자다', () => {
  const css = APP.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.match(css, /#readPanel \.acts \.rd\{flex:0 0 auto\}/,
    '★ 아직 늘었다 줄었다 합니다 — 아이콘 하나는 자리를 다툴 까닭이 없습니다');
});

/* ── ② 읽을 글자가 없는 사진 ── */

test('★★ 회의·현장 사진에는 판독 단추를 «안 보여 준다» — 눌러도 요금만 나간다', () => {
  ['meeting', 'other'].forEach(function (k) {
    const html = row({ kind: k, auto: true });
    assert.ok(html.indexOf('readAgain()') < 0,
      '★★ 「' + k + '」에 판독 단추가 있습니다 — 같은 답이 다시 나올 뿐이고 요금만 나갑니다');
    assert.ok(html.indexOf('startPhotoMask()') < 0,
      '★★ 「' + k + '」에 「가리고 판독」이 있습니다 — 읽을 글자가 없습니다');
    /* 나머지는 그대로여야 한다 — 사진은 여전히 받고·복사하고·고치고·지운다 */
    ['downloadOne', 'copyPhotoImage', 'startPhotoEdit', 'deleteOne'].forEach(function (f) {
      assert.ok(html.indexOf(f) > 0, '★ 「' + k + '」에서 ' + f + ' 까지 없어졌습니다');
    });
  });
});

test('★★ 판독이 «실패»한 것은 그림이 아니다 — 그건 다시 눌러야 한다', () => {
  const html = row({ kind: 'meeting', error: '한도 초과' });
  assert.ok(html.indexOf('readAgain()') > 0,
    '★★ 실패한 사진에서 다시 읽을 길이 막혔습니다 — 그때는 눌러야 합니다');
});

test('★ 서류에는 그대로 있다 — 필요한 곳에서 사라지면 안 된다', () => {
  ['card', 'contract', 'form', 'bizreg', 'timesheet'].forEach(function (k) {
    const html = row({ kind: k, auto: true });
    assert.ok(html.indexOf('readAgain()') > 0, '★ 「' + k + '」에서 판독이 없어졌습니다');
    assert.ok(html.indexOf('startPhotoMask()') > 0, '★ 「' + k + '」에서 가리고 판독이 없어졌습니다');
  });
  /* 아직 안 읽은 것에도 있어야 한다 — 그것이 판독을 시작하는 유일한 길이다 */
  assert.ok(row(null).indexOf('readAgain()') > 0, '★★ 아직 안 읽은 사진에서 판독을 시작할 길이 없습니다');
});

test('★★ 판단하는 곳이 «하나»다 — 저마다 재면 한 곳이 꼭 어긋난다', () => {
  const fn = cutFn(APP, 'function noTextKind(');
  assert.match(fn, /!read\.error/, '★★ 실패한 것까지 그림으로 봅니다');
  assert.match(fn, /PIC_KINDS\[read\.kind\]/);
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(APP.match(/const PIC_KINDS = \{[^}]*\};/)[0] + '\n' + cutFn(APP, 'function noTextKind('), ctx);
  assert.equal(ctx.noTextKind({ kind: 'meeting' }), true);
  assert.equal(ctx.noTextKind({ kind: 'other' }), true);
  assert.equal(ctx.noTextKind({ kind: 'card' }), false);
  assert.equal(ctx.noTextKind({ kind: 'meeting', error: '한도' }), false, '★★ 실패는 그림이 아닙니다');
  assert.equal(ctx.noTextKind(null), false, '아직 안 읽은 것은 판독을 시작할 수 있어야 합니다');
});

/* ── ③ 길은 남긴다 ── */

test('★★ 도구줄에서 뺐지만 «길은 남긴다» — 잘못 읽힌 명함을 되살릴 수 있어야 한다', () => {
  /* 2026-08-03: 명함을 사진으로 올렸더니 판독할 방법이 아예 없었다. */
  const fn = cutFn(APP, 'function renderReadPanel(');
  assert.match(fn, /noTextKind\(read\)/, '★★ 판 안에서 그림인지 안 봅니다');
  assert.match(fn, /읽을 글자가 없는 사진이라 판독을 안 씁니다/,
    '★★ 왜 단추가 없는지 안 알려 줍니다 — 「왜 안 되지」로 시간을 버립니다');
  assert.match(fn, /서류였다면 다시 읽기/, '★★ 되살릴 길이 아예 없어졌습니다');
  assert.match(fn, /class="lk" onclick="readAgain\(\)"/, '★ 그 한 줄이 실제로 판독을 안 부릅니다');
  /* 눈에 띄지 않게 — 작고 흐리게 */
  const css = APP.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.match(css, /#readPanel \.note\.nore\{[^}]*color:var\(--sub\)/,
    '★ 작은 한 줄이어야 합니다 — 도구줄에서 뺀 뜻이 없어집니다');
});
