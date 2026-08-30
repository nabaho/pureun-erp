'use strict';
/* 폰에서 한 건은 «한 줄» 이다 (대표 화면 2026-08-30)
   「폰 화면에서는 좀 컴팩트하게 … 한 줄씩, 2중 3중으로 만들지 말고」

   출금 내역 322건이 모두 «석 줄» 이었다. 까닭이 둘이었다 —
     ① 날짜 「2026-01-12 04:50:40」이 좁은 칸에서 세 조각으로 접혔다
     ② 적요 아래에 「0」이 한 줄씩 더 붙어 있었다
   ②는 꾸밈이 아니라 «틀린 값» 이다. 은행이 메모 칸을 0 으로 채워 보내는데
   우리는 그것을 사람이 적은 메모로 알고 그려 왔다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const app = fs.readFileSync(path.join(__dirname, '..', 'pu-erp.html'), 'utf8');

/* 도우미를 실제로 꺼내 돌려 본다 — 글자 검사가 아니라 «무엇을 지우나» 를 본다 */
function loadCleanNote() {
  const from = app.indexOf('function erpCleanNote(');
  assert.ok(from > 0, 'erpCleanNote 를 찾을 수 없습니다');
  const to = app.indexOf('window.erpCleanNote', from);
  const ctx = { String, window: {} };
  vm.createContext(ctx);
  vm.runInContext(app.slice(from, to), ctx);
  return ctx.erpCleanNote;
}

test('★ 은행이 채워 보낸 「0」은 메모가 아니다 — 그리지 않는다', () => {
  const clean = loadCleanNote();
  assert.equal(clean('0'), '', '★ 0 하나 때문에 322건이 모두 한 줄씩 길어졌습니다.');
  assert.equal(clean(0), '');
  assert.equal(clean(' 0 '), '');
  assert.equal(clean('-'), '');
  assert.equal(clean(null), '');
  assert.equal(clean(undefined), '');
});

test('★ 사람이 적은 메모는 «그대로» 둔다 — 다 지우면 적어 둔 것까지 사라진다', () => {
  const clean = loadCleanNote();
  assert.equal(clean('0원 확인'), '0원 확인');
  assert.equal(clean('10'), '10');
  assert.equal(clean('교보01-047'), '교보01-047');
  assert.equal(clean('  최차일  '), '최차일', '앞뒤 빈칸만 다듬습니다');
});

test('★ 통장 줄을 만들 때 «그 자리에서» 지운다 — 그려질 때 지우면 새는 곳이 남는다', () => {
  assert.match(app, /note:\s*erpCleanNote\(x\.note\)/,
    '★ 줄을 만드는 자리에서 안 지우면, 적요·메모를 쓰는 다른 화면에 0 이 그대로 남습니다.');
});

test('★ 출금 표의 날짜가 «접히지 않는다» — 연도와 초를 뺀다', () => {
  /* 「2026-01-12 04:50:40」(19자) 는 좁은 칸에서 석 줄이 된다.
     ⚠ 줄바꿈만 막으면 칸이 넓어져 옆 칸이 밀려난다 — 글자 자체를 줄여야 한 줄이 된다.
     ⚠ 온전한 값은 title 에 남긴다(초까지 봐야 할 때가 있다). */
  const at = app.indexOf("'💸 '+(incMon?");
  assert.ok(at > 0, '출금 내역 표를 찾을 수 없습니다');
  const block = app.slice(at, at + 6000);
  assert.match(block, /whiteSpace:'nowrap'[^}]*\}\),\s*\n?\s*title:row\.date\|\|''\}, String\(row\.date\|\|''\)\.slice\(5,\s*16\)/,
    '★ 날짜 칸이 아직 통째로 그려집니다 — 폰에서 석 줄이 됩니다.');
});

test('★ 자른 값은 «온전히» 볼 수 있어야 한다 — 자르고 감추면 안 된다', () => {
  const at = app.indexOf("'💸 '+(incMon?");
  const block = app.slice(at, at + 6000);
  assert.match(block, /title:row\.date/,
    '★ 초까지 봐야 할 때가 있습니다. 자른 값은 title 로 남겨야 합니다.');
});
