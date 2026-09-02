/* 「이 사진 어디에 썼는지」를 화면에 보여준다 (대표 승인 목업 2026-08-26)
   docs/mockups/photos-used-where.html

   ── 왜 ──
   보유기간은 **증빙 5년 / 나머지 1년**으로 갈리고, 그 갈림을 정하는 표시(used)는
   2026-08-13 부터 저장하고 있었다. 그런데 **화면 어디에도 안 보여 줬다.**
   그래서 정리할 때 「이 사진 지워도 되나」를 판단할 길이 없었다 — 증빙으로 쓴
   사진을 모르고 지우면 감사·세무조사 때 내놓을 원본이 사라진다.

   ── 세 자리 ──
   ① 격자 칸 : 📌 증빙 딱지 — 훑기만 해도 보인다
   ② 크게 보기 제목줄 : 📌 증빙으로 씀 · 어디에
   ③ 지우기 물음 : 어디에 썼는지 + 보관기한. ⚠ **막지는 않는다** —
     잘못 붙였거나 계약이 취소된 사진도 있다. 판단은 사람이 한다. */

'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const R = path.join(__dirname, '..');
const APP = fs.readFileSync(path.join(R, 'pu-photos.html'), 'utf8');

function fnOf(name) {
  const m = APP.match(new RegExp('function ' + name + '\\([\\s\\S]*?\\r?\\n\\}'));
  assert.ok(m, name + ' 를 찾지 못했습니다');
  return m[0];
}

/* 「어디에 썼는지」 함수들을 그대로 떠서 돌린다 */
function load(over) {
  const ctx = Object.assign({
    Date, String, Number, Math, Object, Array, isFinite, console,
    KEEP_USED_YEARS: +(APP.match(/KEEP_USED_YEARS = (\d+)/) || [, 0])[1],
    KEEP_PLAIN_YEARS: +(APP.match(/KEEP_PLAIN_YEARS = (\d+)/) || [, 0])[1],
    gridItems: []
  }, over || {});
  vm.createContext(ctx);
  ['isUsed', 'usedWhere', 'usedWhereShort', 'keepMonthsOf', 'keepUntil', 'keepUntilText', 'usedWarnText']
    .forEach(function (n) { vm.runInContext(fnOf(n), ctx); });
  return ctx;
}

const used = (where, at) => ({ takenAt: Date.now(), used: { at: at || Date.now(), where: where, by: 'U1' } });
const plain = () => ({ takenAt: Date.now() });

/* ── 말 만들기 ── */

test('★ 어디에 썼는지를 꺼내 온다', () => {
  const c = load();
  assert.equal(c.usedWhere(used('푸른이알피 계약 — 가야엔지니어링')), '푸른이알피 계약 — 가야엔지니어링');
  assert.equal(c.usedWhere(plain()), '', '안 쓴 사진에 무언가를 적으면 안 됩니다');
  assert.equal(c.usedWhere({ used: { where: '어딘가' } }), '',
    '언제 썼는지가 없으면 증빙으로 안 봅니다 — 보유기간을 그것으로 셉니다');
});

test('긴 이름은 줄여서 칸에 넣는다 — 안 줄이면 글자가 칸을 다 먹는다', () => {
  const c = load();
  const long = '근로복지기금 참여사업장 제출서류 — 아주 긴 사업장 이름 주식회사 2026';
  const s = c.usedWhereShort(used(long), 20);
  assert.ok(s.length <= 20, '안 줄었습니다: ' + s);
  assert.match(s, /…$/, '줄였으면 줄였다고 보여야 합니다');
  assert.equal(c.usedWhereShort(used('짧다'), 20), '짧다', '짧은 것까지 건드리면 안 됩니다');
});

test('★ 보관기한을 사람 말로 적는다 — 「5년」만으로는 안 와닿는다', () => {
  const c = load();
  const at = Date.parse('2026-08-13T00:00:00Z');
  const t = c.keepUntilText(used('어딘가', at));
  assert.match(t, /^2031년 \d+월$/, '증빙은 쓴 날부터 5년이어야 합니다: ' + t);
  /* 안 쓴 사진은 찍은 날부터 1년 */
  const p = c.keepUntilText({ takenAt: at });
  assert.match(p, /^2027년 \d+월$/, '나머지는 1년이어야 합니다: ' + p);
});

/* ── ③ 지우기 물음 ── */

test('★ 증빙으로 쓴 사진을 지우려 하면 어디에 썼는지 보여 준다', () => {
  const c = load({ gridItems: [{ id: 'a', meta: used('푸른이알피 계약 — 가야엔지니어링') }] });
  const t = c.usedWarnText(['a']);
  assert.match(t, /증빙으로 쓰였습니다/, '★ 아무 말 없이 지우면 모르고 지웁니다');
  assert.match(t, /가야엔지니어링/, '어디에 썼는지를 안 적었습니다');
  assert.match(t, /보관기한/, '언제까지 갖고 있어야 하는지를 안 적었습니다');
});

test('★ 안 쓴 사진에는 아무 말도 안 붙인다 — 늘 뜨면 아무도 안 읽는다', () => {
  const c = load({ gridItems: [{ id: 'a', meta: plain() }] });
  assert.equal(c.usedWarnText(['a']), '');
  assert.equal(c.usedWarnText([]), '');
  assert.equal(c.usedWarnText(['없는번호']), '', '없는 사진에 대고 경고하면 안 됩니다');
});

test('여러 장이면 몇 장인지와 어디에 썼는지 몇 개만', () => {
  const c = load({ gridItems: [
    { id: 'a', meta: used('푸른이알피 계약 — 가') },
    { id: 'b', meta: used('기금 거래 증빙 — 나') },
    { id: 'c', meta: plain() },
    { id: 'd', meta: used('정부사업일정 — 다') },
    { id: 'e', meta: used('기금 서류함 — 라') }
  ] });
  const t = c.usedWarnText(['a', 'b', 'c', 'd', 'e']);
  assert.match(t, /4장은 증빙/, '안 쓴 사진까지 세었습니다: ' + t);
  assert.match(t, /그 밖 1장/, '다 나열하면 물음창이 길어집니다: ' + t);
});

test('어디에 썼는지가 안 적혀 있어도 증빙이라는 사실은 말한다', () => {
  const c = load({ gridItems: [{ id: 'a', meta: { takenAt: 1, used: { at: 2 } } }] });
  const t = c.usedWarnText(['a']);
  assert.match(t, /증빙으로 쓰였습니다/);
  assert.match(t, /안 적혀 있습니다/, '빈칸을 그냥 두면 왜 경고가 뜬지 모릅니다');
});

/* ── 화면에 실제로 붙였는가 ── */

test('★ 지우기 두 길 모두에 붙였다 — 한쪽만 하면 그 길로는 모르고 지운다', () => {
  ['deleteOne', 'deleteSelected'].forEach(function (n) {
    assert.match(fnOf(n), /usedWarnText\(/, '★ ' + n + ' 에서는 증빙 사진을 말없이 지웁니다');
  });
});

test('★ 지우지 못하게 «막지는» 않는다 — 판단은 사람이 한다', () => {
  /* 잘못 붙였거나 계약이 취소된 사진도 있다. 막으면 그것들을 영영 못 지운다. */
  ['deleteOne', 'deleteSelected'].forEach(function (n) {
    const f = fnOf(n);
    const at = f.indexOf('usedWarnText(');
    const after = f.slice(at, at + 260);
    assert.ok(!/return;?\s*\}?\s*$/.test(after.split('confirm')[0].replace(/[\s\S]*usedWarnText\([^)]*\);?/, '')),
      '★ ' + n + ' 이 증빙 사진을 아예 못 지우게 막습니다');
    assert.match(after, /confirm\(/, '물어보고 나서 지워야 합니다');
  });
});

test('★ 격자 칸에 📌 증빙 딱지를 그린다', () => {
  const g = fnOf('renderGrid');
  assert.match(g, /isUsed\(it\.meta\)/, '★ 칸에서 증빙 여부를 안 봅니다');
  assert.match(g, /class="pf"/, '딱지를 안 만듭니다');
  assert.match(g, /\+ proof \+/, '★ 만들어 놓고 안 붙이면 화면에 없습니다');
  /* 서류 카드·일반 사진 **둘 다** — 한쪽만 하면 그 모양의 칸에서는 안 보인다 */
  assert.equal((g.match(/\+ proof \+/g) || []).length, 2,
    '★ 서류 카드와 일반 사진 가운데 한쪽에만 붙였습니다');
  assert.match(APP, /#grid \.cell \.pf\{/, '딱지 꾸밈이 없습니다');
});

test('★ 딱지 셋이 한 모서리에 겹치지 않는다 — 겹치면 아무것도 안 읽힌다', () => {
  /* 서류(왼위) · 쪽수(오른위) · 증빙 — 세 자리가 서로 달라야 한다. */
  const cornerOf = function (sel) {
    const m = APP.match(new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\{([^}]*)\\}'));
    assert.ok(m, sel + ' 규칙이 없습니다');
    const s = m[1];
    return ['left', 'right', 'top', 'bottom'].filter(function (k) {
      return new RegExp('(^|;)\\s*' + k + ':\\s*\\d').test(s);
    }).sort().join('+');
  };
  const tagC = cornerOf('#grid .cell .tag');
  const pgsC = cornerOf('#grid .cell .pgs');
  const pfC = cornerOf('#grid .cell .pf');
  assert.notEqual(pfC, tagC, '★ 증빙 딱지가 「서류」 딱지와 같은 모서리입니다(' + pfC + ')');
  assert.notEqual(pfC, pgsC, '★ 증빙 딱지가 쪽수와 같은 모서리입니다(' + pfC + ')');
});

test('★ 크게 보기 제목줄에 「증빙으로 씀」을 적는다', () => {
  const f = fnOf('renderViewerTitle');
  assert.match(f, /isUsed\(it\.meta\)/, '증빙 여부를 안 봅니다');
  assert.match(f, /증빙으로 씀/, '무엇인지 말을 안 합니다');
  assert.match(f, /usedWhereShort\(/, '어디에 썼는지를 안 적습니다');
  assert.match(f, /\+ used;/, '★ 만들어 놓고 안 붙이면 화면에 없습니다');
  assert.match(APP, /#viewer \.bar #viewerInfo \.u\{/,
    '★ 힘(#viewer .bar)을 한 번 더 안 얹으면 위 규칙이 이겨 글씨가 딸려 갑니다');
});

test('★ 「어디에 썼는지」는 esc 를 거친다 — 업체 이름에 꺾쇠가 들어올 수 있다', () => {
  const g = fnOf('renderGrid');
  assert.match(g, /esc\('증빙으로 씀 · ' \+/, '칸 설명이 날것으로 들어갑니다');
  assert.match(fnOf('renderViewerTitle'), /esc\(where\)/, '제목줄이 날것으로 들어갑니다');
});
