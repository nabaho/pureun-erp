'use strict';
/* 코덱스가 짚은 «거래가 조용히 사라지는» 두 길 — 2026-08-30

   대표 지시로 코덱스 검토를 돌렸고, 그중 «치명» 둘이 진짜였다.
   둘 다 「돈이 한 건 사라지는데 아무도 모른다」는 같은 모양이다.

   ① 중복막이가 «시각을 버린다»
      「12:00 스타벅스 10,000원」을 먼저 가져온 뒤 진짜 다른 결제인
      「13:00 스타벅스 10,000원」이 오면 열쇠가 같아져 뒤엣것이 버려진다.
      게다가 그 서버 기록을 처리완료(ack)로 찍어 다시 가져올 길도 없앤다.

   ② 대기함 200건 제한을 «거르기 전에» 걸었다
      최근 200건이 모두 처리완료면 그보다 오래된 대기 거래가 영영 안 나온다.

   실행: node --test tests/*.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { cutFn } = require('./cut-fn.js');

const R = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(R, 'pu-erp.html'), 'utf8').replace(/\r\n/g, '\n');
const fn = fs.readFileSync(path.join(R, 'functions', 'index.js'), 'utf8').replace(/\r\n/g, '\n');
const bare = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

const ctx = {
  window: {},
  erpNormName: (s) => String(s || '').replace(/\s+/g, '').toLowerCase(),
  erpCleanMemo: (s) => String(s || ''),
};
vm.createContext(ctx);
vm.runInContext(
  cutFn(app, 'function erpBankRowKey(') + '\n'
  + cutFn(app, 'function erpDupHintPair(') + '\n'
  + cutFn(app, 'function erpMarkDupHints(') + '\n'
  + cutFn(app, 'function erpBankMergeDraft(') + '\n'
  + 'var BANK_DRAFT_MAX = 4000;\nthis.merge = erpBankMergeDraft; this.rowKey = erpBankRowKey;', ctx);
const { merge, rowKey } = ctx;

const C = (o) => Object.assign(
  { _k: '0', type: 'expense', src: 'card', amount: 10000, memo: '스타벅스' }, o);

/* ══════ ① 같은 날·같은 금액·같은 가게의 «다른 시각» 결제 ══════ */

test('★★ 12:00 과 13:00 은 «다른 결제»다 — 나중 것이 버려지면 장부에서 한 건이 사라진다', () => {
  /* 코덱스 재현 그대로: 먼저 12:00 을 담고, 나중에 13:00 이 온다 */
  const had = merge([], [C({ _k: 'a', date: '2026-08-30 12:00' })]).rows;
  const m = merge(had, [C({ _k: 'b', date: '2026-08-30 13:00' })]);
  assert.equal(m.rows.length, 2,
    '★★ 진짜 결제 한 건이 사라집니다 — 게다가 서버에 처리완료로 찍혀 다시 못 가져옵니다');
  assert.equal(m.dup, 0, '★ 다른 결제를 중복으로 셌습니다');
});

test('★★ 같은 문자를 다시 가져와도 두 줄이 되지 않는다 — 시각까지 같으면 하나다', () => {
  const had = merge([], [C({ _k: 'a', date: '2026-08-30 12:00' })]).rows;
  const m = merge(had, [C({ _k: 'b', date: '2026-08-30 12:00' })]);
  assert.equal(m.rows.length, 1, '★ 같은 결제가 두 줄이 됐습니다');
  assert.equal(m.dup, 1);
});

test('★ 시각이 없는 줄(통장 엑셀)은 «예전 그대로» — 같은 파일을 또 올려도 안 늘어난다', () => {
  const B = (o) => Object.assign({ _k: '0', type: 'income', src: 'bank',
    date: '2026-08-30', amount: 220000, memo: '주원테' }, o);
  const had = merge([], [B({ _k: 'a' })]).rows;
  const m = merge(had, [B({ _k: 'b' })]);
  assert.equal(m.rows.length, 1, '★ 통장 엑셀을 다시 올리면 두 배가 됩니다');
});

test('★ 같은 파일 «안»의 같은 값 두 줄은 예전처럼 둘 다 남는다', () => {
  const B = (o) => Object.assign({ _k: '0', type: 'income', src: 'bank',
    date: '2026-08-30', amount: 100000, memo: '홍길동' }, o);
  const m = merge([], [B({ _k: 'a' }), B({ _k: 'b' })]);
  assert.equal(m.rows.length, 2, '★ 한 파일 안의 진짜 두 건이 하나로 줄었습니다');
});

test('★ 처리 지문(erpBankRowKey)은 «안 바꿨다» — 바꾸면 처리한 줄이 죄다 되살아난다', () => {
  /* bank_processed 가 이 열쇠로 쌓여 있다. 모양이 바뀌면 이미 처리한 줄이
     미처리로 돌아와 두 번 처리하게 된다. */
  assert.equal(rowKey({ date: '2026-08-30 12:00', amount: 10000, memo: '스타벅스' }),
    rowKey({ date: '2026-08-30 13:00', amount: 10000, memo: '스타벅스' }),
    '★ 처리 지문에 시각이 섞여 들어갔습니다 — 이미 처리한 줄이 미처리로 돌아옵니다');
});

/* ══════ ② 대기함 200건 제한 ══════ */

test('★★ 대기중을 «거른 뒤에» 자른다 — 먼저 자르면 오래된 대기건이 영영 안 나온다', () => {
  const at = fn.indexOf('if (action === "list")');
  assert.ok(at > 0, 'list 갈래를 못 찾았습니다');
  const body = bare(fn.slice(at, fn.indexOf('if (action === "ack")', at)));
  assert.ok(!/limitToLast\(\s*200\s*\)/.test(body),
    '★★ 최근 200건을 먼저 자르고 있습니다 — 그 200건이 다 처리완료면 오래된 대기건이 영영 안 옵니다');
  const iFilter = body.indexOf('status === "pending"');
  const iSlice = body.indexOf('.slice(0, LIST_MAX)');
  assert.ok(iFilter > 0 && iSlice > iFilter,
    '★★ 거르기보다 자르기가 «먼저»입니다 — 순서가 뒤집히면 같은 사고가 돌아옵니다');
});

test('★★ 자르고 남은 것이 있으면 «몇 건 남았는지» 알려 준다', () => {
  const at = fn.indexOf('if (action === "list")');
  const body = bare(fn.slice(at, fn.indexOf('if (action === "ack")', at)));
  assert.match(body, /more\s*=\s*Math\.max\(0,\s*pending\.length\s*-\s*LIST_MAX\)/,
    '★ 남은 수를 안 세면 화면이 「다 가져왔다」고 잘못 말합니다');
  assert.match(body, /\{\s*ok:\s*true,\s*items,\s*more\s*\}/,
    '★★ 세어 놓고 안 보내면 화면은 여전히 모릅니다');
});

test('★ 오래된 것부터 준다 — 새것부터 주면 오래된 것이 늘 뒤로 밀린다', () => {
  const at = fn.indexOf('if (action === "list")');
  const body = bare(fn.slice(at, fn.indexOf('if (action === "ack")', at)));
  assert.match(body, /Number\(a\.receivedAt \|\| 0\) - Number\(b\.receivedAt \|\| 0\)/,
    '★ 오래된 것부터가 아니면, 밀린 거래가 영영 순서를 못 받습니다');
});
