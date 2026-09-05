'use strict';
/* 📗 사건 명부에 «통장에서» 계좌를 채운다 (대표 결정 2026-09-03 ㉡)

   ■ 왜 여기인가 — 근로자 정보함에는 «안» 담는다
   대표께 세 갈래를 여쭈어 ㉡ 을 고르셨다:
     ㉠ 사진첩에만 / **㉡ 이알피 사건 명부에만** / ㉢ 근로자 정보함에도
   근로자 정보함(기업정보함 아래)은 **재직 직원 누구나** 본다 — 거기에 계좌를 담으면
   「주민번호·주소는 안 담는다」고 정해 둔 원칙과 어긋난다. 사건 명부는 그 사건을
   보는 사람만 보고, 은행·계좌·예금주 칸이 이미 있다.

   ■ 이 검사가 지키는 것
   ① **말없이 안 채운다** — 이름이 같은 사람이 여럿일 수 있고 회사 통장이 섞인다.
      계좌를 잘못 채우면 **남의 계좌로 돈이 나간다**(되돌릴 수 없다)
   ② **이름이 맞는 것만** 후보다 — 회사만 맞는 것을 섞으면 사업장 통장이 들어온다
   ③ **계좌를 합쳐 적지 않는다** — 정식 계좌와 평생계좌를 따로 고르게 한다
   ④ 근로자 정보함으로는 **여전히 안 간다**

   실행: node --test tests/erp-bank-from-photo.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { cutFn } = require('./cut-fn');

const R = path.join(__dirname, '..');
const erp = fs.readFileSync(path.join(R, 'pu-erp.html'), 'utf8');
const docFile = fs.readFileSync(path.join(R, 'js', 'pu-doc-file.js'), 'utf8');

function load() {
  const c = { String, Object, Array, Number, Boolean };
  vm.createContext(c);
  vm.runInContext([
    cutFn(erp, 'function erpWkSafe('),
    cutFn(erp, 'function erpWkNorm('),
    cutFn(erp, 'function erpBankNameKey('),
    cutFn(erp, 'function erpBankPickFor('),
    cutFn(erp, 'function erpBankFill(')
  ].join('\n'), c);
  return c;
}
const B = load();

const 통장 = (o) => Object.assign({
  id: 'p1', year: '2026', owner: '', bankName: '중소기업은행',
  bankAcct: '547-000000-00-000', bankAcctAlt: '', bankHolder: '김도경',
  acctType: '기업자유예금', company: '', at: 100
}, o || {});

/* ══════ ① 이름이 맞는 것만 ══════ */

test('★★★ 예금주 이름이 맞는 것만 후보다 — 회사만 맞으면 «사업장 통장»이 들어온다', () => {
  const list = [
    통장({ id: 'a', bankHolder: '김도경', company: '가나상사' }),
    통장({ id: 'b', bankHolder: '가나상사', company: '가나상사' })   // 법인 통장
  ];
  const out = B.erpBankPickFor(list, '김도경', '가나상사');
  assert.equal(out.length, 1, '★★★ 사업장 통장이 근로자 계좌 자리에 들어옵니다 — 그 돈은 사람에게 안 갑니다');
  assert.equal(out[0].id, 'a');
});

test('★★★ 이름을 «아직 안 적었으면» 아무것도 안 내놓는다 — 아무나 골라 채우게 된다', () => {
  const list = [통장({}), 통장({ id: 'b', bankHolder: '박선희' })];
  assert.deepEqual(Array.prototype.slice.call(B.erpBankPickFor(list, '', '가나상사')), []);
  assert.deepEqual(Array.prototype.slice.call(B.erpBankPickFor(list, '   ', '')), []);
});

test('★ 띄어쓰기가 달라도 같은 사람이다 — 「김 도경」·「김도경」', () => {
  const list = [통장({ bankHolder: '김 도경' })];
  assert.equal(B.erpBankPickFor(list, '김도경', '').length, 1);
});

test('★★ 같은 사업장 통장이 «먼저» 온다 — 동명이인이면 그것이 가르는 실마리다', () => {
  const list = [
    통장({ id: 'old', company: '딴회사', at: 900 }),
    통장({ id: 'same', company: '(주)가나상사', at: 100 })
  ];
  const out = B.erpBankPickFor(list, '김도경', '가나상사');
  assert.equal(out[0].id, 'same', '★★ 최근 것만 보면 딴 회사 통장이 맨 위에 옵니다');
  assert.equal(out[0].sameCo, true);
  assert.equal(out[1].sameCo, false);
});

test('★ 같은 무리 안에서는 최근 것이 먼저다', () => {
  const list = [통장({ id: 'old', at: 100 }), 통장({ id: 'new', at: 900 })];
  assert.equal(B.erpBankPickFor(list, '김도경', '')[0].id, 'new');
});

/* ══════ ② 채우는 값 ══════ */

test('★★★ 계좌를 «합쳐» 적지 않는다 — 그 값으로는 이체가 안 된다', () => {
  const b = 통장({ bankAcct: '547-000000-00-000', bankAcctAlt: '10-0000-0000' });
  const main = B.erpBankFill(b, false);
  assert.equal(main.account, '547-000000-00-000');
  assert.ok(main.account.indexOf('10-0000-0000') < 0,
    '★★★ 두 계좌를 한 칸에 넣으면 그 값으로 이체할 수가 없습니다');
  const alt = B.erpBankFill(b, true);
  assert.equal(alt.account, '10-0000-0000', '★★ 평생계좌를 고를 길이 없습니다');
  /* ⚠ 값만 낼 줄 알아도 «화면에 안 그리면» 고를 수가 없다 — 돌연변이가 그 빈틈을 드러냈다 */
  const fn = cutFn(erp, 'function BankPickModal(');
  assert.match(fn, /line\(b, false\), line\(b, true\)/,
    '★★★ 평생계좌 줄을 안 그리면 그 계좌를 고를 길이 아예 없습니다');
});

test('★★ 은행·계좌·예금주 셋만 채운다 — 다른 칸을 건드리지 않는다', () => {
  const v = B.erpBankFill(통장({}), false);
  assert.deepEqual(Object.keys(v).sort(), ['account', 'bank', 'holder'],
    '★★ 채우는 칸이 늘었습니다 — 사람이 적어 둔 값을 덮을 수 있습니다: ' + Object.keys(v));
});

test('★ 채운 뒤에도 «고칠 수 있다»고 말해 준다 — 판독은 틀릴 수 있다', () => {
  assert.match(erp, /값은 언제든 고칠 수 있습니다/,
    '★ 채워 놓고 아무 말이 없으면 사람이 그대로 믿습니다');
});

/* ══════ ③ 말없이 안 채운다 ══════ */

test('★★★ 자동으로 «안» 채운다 — 사람이 고른 것만 들어간다', () => {
  const fn = cutFn(erp, 'function bankFillRow(');
  assert.match(fn, /if\(!bankPick \|\| !v\) return;/,
    '★★★ 고른 것이 없으면 아무것도 안 채워야 합니다');
  /* 창을 안 거치고 채우는 길이 생기면 이 결정이 조용히 뒤집힌다 */
  assert.ok(erp.indexOf('erpBankFill(') > 0, 'erpBankFill 을 못 찾았습니다');
  const calls = erp.split(/\r?\n/).filter(function (l) { return l.indexOf('erpBankFill(') >= 0; });
  calls.forEach(function (l) {
    assert.ok(/onClick|props\.onPick|function erpBankFill/.test(l),
      '★★★ 사람이 누르지 않았는데 계좌가 채워지는 자리가 있습니다: ' + l.trim().slice(0, 90));
  });
});

test('★★ 이름을 안 적은 줄에는 단추를 «안» 낸다 — 찾을 열쇠가 없다', () => {
  const fn = cutFn(erp, 'function bankBtn(');
  assert.match(fn, /if\(!String\(w\.name \|\| ''\)\.trim\(\)\) return null;/,
    '★★ 이름 없이 열면 아무것도 안 나오는 빈 창이 뜹니다');
});

test('★★ 두 명부 «모두»에 단추가 있다 — 사건 창의 근로자 줄은 둘이다', () => {
  /* ⚠ 만든 자리(function bankBtn)는 «세지 않는다» — 그것까지 세면 한 명부에서 빼도
     둘로 남아 통과한다(돌연변이가 살아남아 드러났다). 부르는 자리만 센다. */
  const n = erp.split(/\r?\n/)
    .filter(function (l) { return /bankBtn\(w, wi\)/.test(l) && !/function bankBtn\(/.test(l); })
    .length;
  assert.ok(n >= 2, '★★ 단추를 «부르는» 자리가 ' + n + '곳입니다 — 의뢰인형·회사형 둘 다여야 합니다');
  assert.match(erp, /bankPick && h\(BankPickModal/, '★★ 창을 안 띄우면 단추가 눌러도 아무 일이 없습니다');
});

/* ══════ ④ 근로자 정보함으로는 여전히 안 간다 ══════ */

test('★★★ 통장은 근로자 정보함으로 «안» 간다 — 거기는 직원 전원이 본다', () => {
  const m = /WORKER_DOC_KINDS = \{([\s\S]*?)\};/.exec(docFile);
  assert.ok(m, 'WORKER_DOC_KINDS 를 못 찾았습니다');
  const keys = m[1].split(',').map(function (x) { return x.split(':')[0].trim(); }).filter(Boolean);
  assert.ok(keys.indexOf('bankbook') < 0,
    '★★★ 통장이 근로자 정보함으로 갑니다 — 재직 직원 «전원»이 계좌를 보게 됩니다.\n' +
    '  대표 결정 ㉡ 은 「이알피 사건 명부에만」입니다.');
});

/* ══════ ⑤ 요금·기록 ══════ */

test('★★ 사진첩 목록을 «한 번만» 읽는다 — 창을 여닫을 때마다 받으면 그것이 요금이다', () => {
  const fn = cutFn(erp, 'function erpLoadBankPhotos(');
  assert.match(fn, /if\(_erpBankPhotos\)\{ cb && cb\(_erpBankPhotos\); return; \}/,
    '★★ 읽어 둔 것을 안 쓰고 매번 다시 읽습니다');
  assert.match(fn, /_erpBankWaiters\.push\(cb\)/,
    '★ 읽는 도중에 또 부르면 두 번 내려받습니다');
});

test('★★ 원본은 «눌러야» 연다 — 목록을 여는 것만으로 받지 않는다', () => {
  const fn = cutFn(erp, 'function BankPickModal(');
  assert.ok(fn.indexOf('loadFullDetail') < 0,
    '★★ 고르는 창이 원본을 받고 있습니다 — 열 때마다 민감 서류를 통째로 내려받습니다');
  assert.match(fn, /viewIt && h\(WorkerDocViewModal/,
    '★★ 원본 보기가 없으면 어느 통장인지 확인할 길이 없습니다');
  /* 원본은 저장 층을 거친다 — 민감이라 서버를 지나고 그 자리에서 열람 기록이 남는다 */
  assert.match(cutFn(erp, 'function WorkerDocViewModal('), /PuPhotoStore\.loadFullDetail\(/,
    '★★ 저장 층을 안 거치면 열람 기록이 안 남습니다');
});

test('★ 판독이 실패한 통장은 후보에 안 넣는다 — 빈 값을 골라도 채울 것이 없다', () => {
  const fn = cutFn(erp, 'function erpLoadBankPhotos(');
  assert.match(fn, /r\.kind !== 'bankbook' \|\| r\.error/,
    '★ 실패한 것까지 담으면 빈 줄이 목록에 섞입니다');
});

test('★ 사람이 고쳐 적은 상호가 이긴다 — 사진첩과 같은 규칙이다', () => {
  const fn = cutFn(erp, 'function erpLoadBankPhotos(');
  assert.match(fn, /fx\.company \|\| f\.company/,
    '★ 사진첩에서 고쳐 적은 상호를 안 보면, 같은 사업장인데 아니라고 나옵니다');
});
