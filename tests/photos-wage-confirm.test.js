'use strict';
/* 💰 근로계약서의 임금 — 읽되, «사람이 확인해야» 산다 (대표 지시 2026-09-02)

   「임금 읽고 사람 확인하는 단계」

   ■ 왜 확인 단계가 있어야 하나
   계약서 금액은 **1만 배 틀리게 읽힌 자리**다 — 「월 100만원」을 기계가 1,000 으로
   읽으면 아무도 모르게 1,000원이 들어간다. 계약관리가 금액 자동채움을 막아 둔 것이
   그 까닭이다(pu-erp.html 의 erpContractPhotoApplyPatch).

   ■ 이 검사가 지키는 것
   ① 판독기는 **적힌 그대로** 담는다 — 숫자로 고치지 말라고 못박혀 있는가
   ② 읽은 값과 확인한 값을 **둘 다** 담는다(판독값을 덮지 않는다)
   ③ 확인 안 된 값은 **아무 데도 안 나간다**(wageUsable)
   ④ 「확인했음」(ack)으로 **못 치운다** — ack 는 값을 안 담는다
   ⑤ 임금이 «안 적힌» 계약서는 묻지 않는다 — 치울 수 없는 ⚠ 를 안 만든다

   실행: node --test tests/*.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { cutFn } = require('./cut-fn');

const R = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(R, 'pu-photos.html'), 'utf8');
const reader = fs.readFileSync(path.join(R, 'js', 'pu-doc-read.js'), 'utf8');

function ctx() {
  const c = { String, Object, Number, Boolean };
  vm.createContext(c);
  vm.runInContext([
    (app.match(/^const WAGE_TYPES = \[[^\]]*\];/m) || [''])[0].replace('const ', 'var '),
    cutFn(app, 'function wageRead('),
    cutFn(app, 'function wageOkOf('),
    cutFn(app, 'function wageBoxOn('),
    cutFn(app, 'function wageNeedsOk('),
    cutFn(app, 'function wageUsable(')
  ].join('\n'), c);
  return c;
}
const W = ctx();

const wc = (fields, extra) => Object.assign({ kind: 'wcontract', fields: fields || {} }, extra || {});

/* ══════ ① 판독기는 적힌 그대로 담는다 ══════ */

test('★★★ 판독기에 «숫자로 고치지 마세요»가 못박혀 있다 — 여기가 1만 배 틀리는 자리다', () => {
  assert.match(reader, /wage\(임금액 — \*\*적힌 그대로\*\*/,
    '★★★ 「적힌 그대로」가 없으면 AI 가 「월 100만원」을 1000000 이나 1000 으로 옮깁니다');
  assert.match(reader, /숫자만 남기거나 단위를 바꾸지 마세요/,
    '★★★ 단위를 해석하는 순간 1만 배 사고가 납니다 — 해석은 사람이 합니다');
  assert.match(reader, /wageType\(임금 형태/,
    '★ 월급인지 시급인지 없으면 금액만으로는 아무것도 못 합니다');
});

test('★★ 임금이 늘었어도 주민번호·주소·연락처는 그대로 «안» 읽는다', () => {
  const i = reader.indexOf('kind=wcontract 이면 키:');
  const line = reader.slice(i, reader.indexOf('\n', i));
  ['rrn', '주민', 'address', '주소', 'phone', '연락처', 'pairs'].forEach(function (k) {
    assert.ok(line.indexOf(k) < 0,
      '★★ 키 목록에 「' + k + '」이 들어왔습니다 — 이번에 늘리기로 한 것은 «임금 하나»입니다');
  });
  assert.match(reader, /kind=wcontract 에서 \*\*주민등록번호·주소·연락처는 한 글자도 담지 마세요/,
    '★★ 못박음이 사라졌습니다');
});

test('★★ 물음 판을 올렸다 — 안 올리면 이미 읽어 둔 근로계약서에 임금이 «영영» 안 잡힌다', () => {
  const pv = Number((/var PROMPT_VERSION = (\d+);/.exec(reader) || [])[1]);
  assert.ok(pv >= 15, '★★ 물음이 바뀌었으면 판을 올려야 스스로 다시 읽힙니다 (지금 ' + pv + ')');
  const rv = Number((/var READ_VERSION = (\d+);/.exec(reader) || [])[1]);
  assert.ok(rv >= pv, '★ 판독기 판이 물음 판보다 낮습니다');
});

/* ══════ ② 확인 안 된 값은 아무 데도 안 나간다 ══════ */

test('★★★ 확인 «전»에는 임금을 아무도 못 쓴다 — 확인 단계를 만든 뜻이 거기 있다', () => {
  const r = wc({ wage: '월 2,500,000원', wageType: '월급' });
  assert.equal(W.wageUsable(r), '',
    '★★★ 확인 안 된 판독값을 내주면 사람 확인이 «있으나 마나»가 됩니다');
  assert.equal(W.wageNeedsOk(r), true, '★★ 확인할 것이 있는데 할 일로 안 잡힙니다');
});

test('★★ 확인 «뒤»에는 확인된 값이 나온다 — 판독값이 아니라', () => {
  const r = wc({ wage: '월 100만원', wageType: '월급' },
    { wageOk: { at: 1, by: '권형하', wage: '월 1,000,000원', wageType: '월급' } });
  assert.equal(W.wageUsable(r), '월급 월 1,000,000원',
    '★★ 사람이 고친 값이 아니라 판독값이 나옵니다 — 고친 뜻이 없어집니다');
  assert.equal(W.wageNeedsOk(r), false, '★ 확인했는데 할 일로 남습니다');
});

test('★★★ 판독값을 «덮지 않는다» — 나중에 「이 금액 어디서 나왔지」에 답해야 한다', () => {
  const fn = cutFn(app, 'function wageConfirm(');
  assert.match(fn, /Object\.assign\(\{\}, it\.meta\.read, \{\s*wageOk:/,
    '★★★ 확인한 값을 wageOk 에 «따로» 담아야 합니다 — fields.wage 를 덮으면\n' +
    '  판독이 무엇으로 읽었는지 영영 알 수 없습니다');
  assert.ok(fn.indexOf('fields.wage') < 0 && !/fields:/.test(fn),
    '★★★ 판독 결과(fields)를 손대고 있습니다');
});

test('★★ 누가·언제 확인했는지 남는다 — 안 남기면 「확인된 값」이라는 말이 빈말이다', () => {
  const fn = cutFn(app, 'function wageConfirm(');
  assert.match(fn, /at: Date\.now\(\)/, '★★ 언제 확인했는지가 없습니다');
  assert.match(fn, /by: PuPhotoStore\.myName\(\)/, '★★ 누가 확인했는지가 없습니다');
  assert.match(fn, /PuPhotoStore\.saveRead\(/, '★★★ 저장을 안 하면 새로고침에 사라집니다');
});

/* ══════ ③ 할 일에서 어떻게 사라지나 ══════ */

test('★★★ 「확인했음」(ack)으로는 못 치운다 — ack 는 값을 안 담는다', () => {
  const why = cutFn(app, 'function checkWhy(');
  const iWage = why.indexOf('wageNeedsOk(r)');
  const iAck = why.indexOf('if (r.ack) return');
  assert.ok(iWage > 0, '★★★ 임금 확인이 할 일 까닭에 없습니다 — ⚠ 가 안 뜹니다');
  assert.ok(iWage < iAck,
    '★★★ ack 가 먼저 걸리면 「봤다」 한 번으로 ⚠ 만 사라지고 임금은 영영 확인 안 된 채\n' +
    '  남습니다 — 「확인된 임금만 쓴다」는 규칙이 조용히 비어 버립니다');
});

test('★★ 임금이 «안 적힌» 계약서는 묻지 않는다 — 치울 수 없는 ⚠ 를 안 만든다', () => {
  assert.equal(W.wageNeedsOk(wc({ name: '박선희' })), false,
    '★★ 임금이 없는 계약서에까지 할 일을 달면 치울 수 없는 ⚠ 가 쌓입니다');
  assert.equal(W.wageNeedsOk(wc({ wageType: '월급' })), true,
    '★ 형태만 읽혀도 금액을 물어야 합니다');
});

test('★★ «빈 칸으로 확인»할 길이 있다 — 그 길이 없으면 영영 못 치운다', () => {
  const box = cutFn(app, 'function wageBox(');
  assert.match(box, /적혀 있지 않으면 비워 둔 채로 확인/,
    '★★ 임금이 안 적힌 계약서를 만나면 사람이 막힙니다');
  const r = wc({ wage: '월 250만원' }, { wageOk: { at: 1, by: '나', wage: '', wageType: '' } });
  assert.equal(W.wageNeedsOk(r), false, '★★ 빈 칸으로 확인했는데 계속 할 일입니다');
  assert.equal(W.wageUsable(r), '', '★ 빈 확인은 「임금 없음」이지 판독값이 아닙니다');
});

/* ══════ ④ 다른 갈래를 건드리지 않는다 ══════ */

test('★★ 근로계약서에만 묻는다 — 다른 서류에 임금 칸이 뜨면 안 된다', () => {
  assert.equal(W.wageBoxOn({ kind: 'contract', fields: { fee: '1000' } }), false,
    '★★ 우리 사무소 계약서에 임금 확인이 뜨면 엉뚱한 값을 확인하게 됩니다');
  assert.equal(W.wageBoxOn({ kind: 'payslip', fields: {} }), false);
  assert.equal(W.wageBoxOn({ kind: 'wcontract', fields: {} }), true);
  assert.equal(W.wageBoxOn({ kind: 'wcontract', error: 'AI가 잠시 바쁩니다' }), false,
    '★ 판독이 실패했는데 임금을 확인하라고 하면 안 됩니다');
});

test('★★ 남의 사진에는 «확인 단추»를 안 내준다 — 눌러도 아무 일이 안 일어난다', () => {
  const box = cutFn(app, 'function wageBox(');
  assert.match(box, /viewingOther\(\)/,
    '★★ 남의 사진에 단추를 내주면 저장이 막혀 「고장」으로 보입니다');
  const fn = cutFn(app, 'function wageConfirm(');
  assert.match(fn, /blockedIfOther\(/, '★★ 저장하는 쪽에도 막는 자리가 있어야 합니다');
});

test('★ 확인을 «되돌릴» 길이 있다 — 잘못 확인했을 때 다시 읽지 않고 고친다', () => {
  const fn = cutFn(app, 'function wageRedo(');
  assert.match(fn, /delete read\.wageOk/, '★ 확인 표시만 걷어야 합니다');
  assert.ok(fn.indexOf('fields') < 0, '★ 되돌리면서 판독값까지 지우면 다시 읽어야 합니다');
  assert.match(cutFn(app, 'function wageBox('), /wageRedo\(\)/,
    '★ 화면에 되돌리는 단추가 없으면 함수만 있고 쓸 수 없습니다');
});

/* ══════ ⑤ 화면에 실제로 붙었나 ══════ */

test('★★ 판독 판에 임금 칸이 «실제로» 그려진다 — 함수만 있고 안 부르면 소용없다', () => {
  const fn = cutFn(app, 'function renderReadPanel(');
  assert.match(fn, /wageBox\(it\)/, '★★ 판에 안 붙으면 아무도 확인할 수 없습니다');
});

test('★ 읽은 칸들이 표에 이름표를 갖는다 — 없으면 「안 읽혔다」로 보인다', () => {
  const m = /const READ_ROWS = \[([\s\S]*?)\];/.exec(app);
  assert.ok(m, 'READ_ROWS 를 못 찾았습니다');
  ['position', 'hireDate', 'termType'].forEach(function (k) {
    assert.ok(m[1].indexOf("'" + k + "'") > 0,
      '★ 「' + k + '」에 이름표가 없어 판독 표에서 통째로 빠집니다');
  });
});
