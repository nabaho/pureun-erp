'use strict';
/* 글자 속 주민번호 지우기 (대표 결정 2026-08-23) — 실행: node --test tests/*.test.js

   엑셀·한글은 사진으로 안 만들고 **글자로** AI 에 보낸다. 사진은 사람이 칠할 자리를
   손으로 골라야 했고 좌표를 틀리면 주민번호가 그대로 나갔다. 글자는 **정확히 지울
   수 있다** — 자리를 틀릴 일이 없다. 이 검사가 그 마지막 문지기다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function load() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'pu-rrn-mask.js'), 'utf8');
  const sandbox = { window: {}, console };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  new vm.Script(src, { filename: 'rrn.js' }).runInContext(sandbox);
  return sandbox.window.PuRrnMask;
}

test('★ 하이픈 있는 주민번호를 지운다', () => {
  const M = load();
  const r = M.maskRrnInText('김철수\t900101-1234567\t22');
  assert.equal(r.text.indexOf('1234567'), -1, '뒷자리가 그대로 남았습니다');
  assert.equal(r.text.indexOf('900101'), -1, '앞자리가 그대로 남았습니다');
  assert.equal(r.count, 1);
});

test('★ 하이픈 없는 13자리도 지운다 (대표 결정 — 못 지우면 그대로 나간다)', () => {
  const M = load();
  const r = M.maskRrnInText('이영희 9001011234567 근무');
  assert.equal(/\d{13}/.test(r.text), false);
  assert.equal(r.count, 1);
});

test('빈칸이 섞인 꼴도 지운다', () => {
  const M = load();
  assert.equal(M.maskRrnInText('900101- 1234567').count, 1);
});

test('긴 붙임표(–—)도 지운다', () => {
  const M = load();
  assert.equal(M.maskRrnInText('900101–1234567').count, 1);
  assert.equal(M.maskRrnInText('900101—1234567').count, 1);
});

test('★ 여러 개가 있으면 다 지운다 — 하나라도 남으면 나간다', () => {
  const M = load();
  const r = M.maskRrnInText('김철수 900101-1234567\n이영희 950505-2345678\n박민수 8803033456789');
  assert.equal(/\d{6}[-–—]\s?\d{7}/.test(r.text), false);
  assert.equal(/\d{13}/.test(r.text), false);
  assert.equal(r.count, 3);
});

test('★ 옆 칸 값은 그대로 남는다 — 지운다고 표가 망가지면 안 된다', () => {
  const M = load();
  const r = M.maskRrnInText('김철수\t900101-1234567\t22\t12');
  assert.ok(r.text.indexOf('김철수') >= 0);
  assert.ok(r.text.indexOf('\t22\t12') >= 0, '뒤 칸이 사라졌습니다: ' + r.text);
});

test('★ 주민번호가 아닌 숫자는 건드리지 않는다', () => {
  const M = load();
  const r = M.maskRrnInText('기본급 2400000\n근무일수 22\n귀속월 2026-08');
  assert.equal(r.count, 0);
  assert.ok(r.text.indexOf('2400000') >= 0);
  assert.ok(r.text.indexOf('2026-08') >= 0);
});

test('14자리 이상을 13자리로 잘라 지우지 않는다', () => {
  const M = load();
  // 계좌번호처럼 더 긴 숫자를 앞 13자리만 지우면 남은 한 자리로 무엇인지 알 수 없게 된다
  const r = M.maskRrnInText('계좌 12345678901234');
  assert.equal(r.count, 0);
  assert.ok(r.text.indexOf('12345678901234') >= 0);
});

test('빈 글자·없는 값도 안 터진다', () => {
  const M = load();
  assert.equal(M.maskRrnInText('').count, 0);
  assert.equal(M.maskRrnInText(null).text, '');
  assert.equal(M.maskRrnInText(undefined).count, 0);
});

test('사진 가림 함수들은 그대로 있다 — 이 파일은 함께 쓰는 곳이 있다', () => {
  const M = load();
  assert.equal(typeof M.maskToDataUrl, 'function');
  assert.equal(typeof M.looksLikeRrn, 'function');
  assert.equal(typeof M.boxesFromWords, 'function');
});
