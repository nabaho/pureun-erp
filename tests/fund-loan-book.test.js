/* 대부 대장 — 누가 얼마 빌려 얼마 남았나
 *
 * 대표 검토 2026-08-24 ④: 근로자대부금이 여태 «자산 계정 한 줄»로만 있었다.
 * 별지15호 ㉗ 「근로자 대부」에 금액은 들어가는데 그 근거 내역이 어디에도 없었다.
 *
 * ⚠ 이 저장소는 통째로 github.io 로 공개된다 — 실제 이름·금액 금지. 여기 자료는 전부 가짜다.
 *
 * 지켜야 하는 것
 *  ① 대장은 «연도 아래» 두지 않는다 — 대부는 여러 해에 걸쳐 갚는다. 연도 아래 두면
 *    이듬해에 잔액이 통째로 사라진다
 *  ② 잔액 = 대부액 − 갚은 것 «전부» (그 해 것만 빼면 이월된 대부가 매년 되살아난다)
 *  ③ 주민등록번호·계좌번호는 «칸 자체를» 두지 않는다
 *  ④ 장부와 견준다 — 별지15호 ㉗ 는 장부에서 나오므로 어긋나면 낸 숫자의 근거가 없다
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'fund.html'), 'utf8');

function grabFn(name) {
  const i = SRC.indexOf('function ' + name + '(');
  assert.ok(i >= 0, 'fund.html 에 함수가 없다: ' + name);
  let d = 0, on = false;
  for (let j = i; j < SRC.length; j++) {
    if (SRC[j] === '{') { d++; on = true; }
    else if (SRC[j] === '}') { d--; if (on && !d) return SRC.slice(i, j + 1); }
  }
  throw new Error('함수 끝을 못 찾음: ' + name);
}
function grabDecl(name) {
  const i = SRC.indexOf('var ' + name + '=');
  assert.ok(i >= 0, 'fund.html 에 상수가 없다: ' + name);
  let d = 0, on = false;
  for (let j = SRC.indexOf('=', i); j < SRC.length; j++) {
    const c = SRC[j];
    if (c === '{' || c === '[') { d++; on = true; }
    else if (c === '}' || c === ']') { d--; if (on && !d) return SRC.slice(i, j + 1) + ';'; }
  }
  throw new Error('상수 끝을 못 찾음: ' + name);
}

function calc() {
  const box = {};
  new Function([grabFn('num'), grabFn('loanSum'), grabFn('loanBal'),
    'this.o={sum:loanSum,bal:loanBal};'].join('\n')).call(box);
  return box.o;
}

/* 2024년에 1,000만원 빌려 2024년 200만·2025년 300만 갚은 사람 */
const L1 = { _id: 'L1', name: '가나다', site: '가나다산업', date: '2024-03-15', amount: 10000000,
             paid: { 2024: 2000000, 2025: 3000000 } };
/* 2025년에 500만원 빌려 아직 안 갚은 사람 */
const L2 = { _id: 'L2', name: '라마바', site: '라마바물산', date: '2025-07-01', amount: 5000000 };
/* 2023년에 빌려 다 갚은 사람 */
const L3 = { _id: 'L3', name: '사아자', date: '2023-01-10', amount: 3000000,
             paid: { 2023: 1000000, 2024: 2000000 } };

test('잔액은 갚은 것 «전부»를 뺀다 — 그 해 것만 빼면 안 된다', () => {
  const C = calc();
  assert.equal(C.bal(L1), 5000000, '2024·2025년 상환을 모두 빼야 500만원이 남는다');
  assert.equal(C.bal(L2), 5000000, '안 갚았으면 그대로 남는다');
  assert.equal(C.bal(L3), 0, '다 갚았으면 0 이다');
  assert.equal(C.bal({}), 0);
  assert.equal(C.bal(null), 0);
});

test('합계 — 대부액·그 해 상환·상환 누계·잔액', () => {
  const C = calc();
  const t = C.sum([L1, L2, L3], 2025);
  assert.equal(t.amount, 18000000, '대부액 합계');
  assert.equal(t.paidYr, 3000000, '2025년에 갚은 것은 가나다의 300만뿐이다');
  assert.equal(t.paidAll, 8000000, '갚은 것 전부(200+300+100+200만)');
  assert.equal(t.balance, 10000000, '잔액 합계(500+500+0만)');
  assert.equal(t.open, 2, '아직 남은 사람은 둘');
});

test('그 해 «실행»은 실행일이 그 해인 것만', () => {
  const C = calc();
  const a = C.sum([L1, L2, L3], 2025);
  assert.equal(a.newCnt, 1, '2025년에 실행한 것은 라마바 한 건');
  assert.equal(a.newAmt, 5000000);
  const b = C.sum([L1, L2, L3], 2024);
  assert.equal(b.newCnt, 1, '2024년에 실행한 것은 가나다 한 건');
  assert.equal(b.newAmt, 10000000);
  assert.equal(b.paidYr, 4000000, '2024년 상환은 가나다 200만 + 사아자 200만');
});

test('빈 대장·이상한 값에도 무너지지 않는다', () => {
  const C = calc();
  const t = C.sum([], 2025);
  assert.deepEqual([t.amount, t.balance, t.open, t.newCnt], [0, 0, 0, 0]);
  const u = C.sum([{ amount: 'abc', paid: { 2025: '' } }, { }], 2025);
  assert.equal(u.amount, 0, '숫자가 아닌 값은 0 으로 본다');
  assert.equal(u.balance, 0);
});

/* 더 갚은 것으로 잘못 적으면 잔액이 음수가 된다 — 감추지 않고 그대로 보여 준다 */
test('더 갚은 것으로 적히면 음수 잔액이 그대로 드러난다', () => {
  const C = calc();
  assert.equal(C.bal({ amount: 1000000, paid: { 2025: 1500000 } }), -500000,
    '음수를 0 으로 감추면 잘못 적은 것을 영영 못 찾는다');
  const tab = grabFn('loanTab');
  assert.match(tab, /bal<0\?';color:var\(--danger\)'/, '음수 잔액을 눈에 띄게 하지 않는다');
});

/* ══════ 담지 않는 것 ══════ */
test('주민등록번호·계좌번호는 칸 자체를 두지 않는다', () => {
  const F = grabDecl('LOAN_FIELDS');
  ['주민', 'rrn', '계좌', 'account', 'bank'].forEach(k =>
    assert.ok(!F.includes(k), '대장에 담아서는 안 되는 칸이 있다: ' + k));
  assert.ok(F.includes("'name'") && F.includes("'amount'") && F.includes("'date'"),
    '대장에 꼭 있어야 할 칸이 빠졌다');
});

/* ══════ 자리 ══════ */
test('대장은 연도 아래 두지 않는다 — 이듬해에 잔액이 사라진다', () => {
  const load = grabFn('loanLoad');
  assert.match(load, /ref\(NS\+'\/loans\/'\+fid\)/, '대장을 기금 아래 통째로 읽어야 한다');
  assert.ok(!/loans\/'\+fid\+'\/'\+yr/.test(SRC), '대장을 연도 아래 두면 이월된 대부가 사라진다');
  /* 상환만 «갚은 해»별로 담는다 */
  assert.match(grabFn('loanPaySet'), /loans\/'\+fid\+'\/'\+id\+'\/paid\/'\+yr/,
    '상환액을 그 해 칸에만 넣어야 다른 해 기록이 안 지워진다');
});

test('그 해 상환을 고쳐도 다른 해 기록은 그대로다', () => {
  const p = grabFn('loanPaySet');
  assert.ok(!/\.set\(\{/.test(p), '한 벌을 통째로 덮어쓰면 지난 해 상환이 날아간다');
  assert.match(p, /\.set\(val\|\|null\)/, '0 을 넣으면 그 해 칸을 지워야 한다');
});

test('대부 내용을 고칠 때 상환 기록을 덮어쓰지 않는다', () => {
  const sv = grabFn('saveLoan');
  assert.match(sv, /ref\.update\(o\)/, '기존 대부는 update 여야 상환 기록(paid)이 살아남는다');
  assert.ok(!/paid/.test(sv.replace(/\/\*[\s\S]*?\*\//g, '')), '저장할 때 상환액을 손대면 안 된다');
  assert.match(sv, /차용자를 입력하세요/, '이름 없는 대부는 대장이 안 된다');
  assert.match(sv, /대부액을 입력하세요/, '금액 없는 대부는 대장이 안 된다');
});

/* ══════ 장부와 대조 ══════ */
test('대장 잔액과 장부를 견준다 — 별지15호 ㉗ 의 근거다', () => {
  const tab = grabFn('loanTab');
  assert.match(tab, /S\.loanFin\.loan/, '장부의 근로자대부금을 안 본다');
  assert.match(tab, /대장 잔액이 장부와 다릅니다/, '어긋나도 말없이 넘어간다');
  assert.match(tab, /별지15호 ㉗/, '왜 중요한지 말해 주지 않는다');
  /* 장부를 «못 읽었을 때» 0 과 견주면 모든 기금이 틀린 것으로 뜬다 */
  assert.match(tab, /book!=null/, '장부를 못 읽었는데 0 과 견준다');
});

test('대장과 장부를 «같은 기금·같은 해»로 읽는다', () => {
  const load = grabFn('loanLoad');
  assert.match(load, /S\.loanFor===key/, '이미 읽었는지 안 보고 다시 읽는다');
  assert.match(load, /if\(S\.loanFor!==_k\) return/, '기금을 옮겼는데 늦게 온 답을 화면에 쓴다');
  assert.match(load, /computeFin\(r\[1\],fid,yr\)/, '그 해 장부로 견줘야 한다');
});

test('대장이 비었는데 장부에 대부금이 있으면 짚어 준다', () => {
  const tab = grabFn('loanTab');
  assert.match(tab, /장부에는 근로자대부금[\s\S]{0,60}누구에게 빌려준 것인지/,
    '빈 대장을 말없이 두면 근거 없는 숫자가 그대로 남는다');
});

/* ══════ 화면 배선 ══════ */
test('목적사업 탭 아래 하위 탭으로 들어간다', () => {
  assert.match(SRC, /var WELF_SUBS=\[\['prog','목적사업'\],\['loan','대부 대장'\]\]/, '하위 탭이 없다');
  assert.match(grabFn('welfareTab'), /S\.welfSub==='loan'\) return loanTab/, '대부 대장으로 안 간다');
  assert.ok(SRC.includes('welfSubBar()'), '하위 탭 줄이 화면에 안 붙었다');
  assert.ok(SRC.includes("'loan.book':{t:"), 'ⓘ 설명이 등록되지 않았다');
  /* 입력 칸이라 onchange 다 — 사업장 연도별 기록(sySet)과 같은 방식이다 */
  assert.ok(SRC.includes('onchange="loanPaySet('), '그 해 상환을 표에서 못 넣는다');
});

test('대부는 기본재산으로만 — 그것을 말해 준다', () => {
  const h = SRC.slice(SRC.indexOf("'loan.book':{t:"), SRC.indexOf("'loan.book':{t:") + 1400);
  assert.match(h, /기본재산으로만/, '대부의 재원 제한을 안 알려 준다');
  assert.match(h, /제62조/, '근거 법령이 없다');
  assert.match(h, /주민등록번호·계좌번호는 칸을 두지 않았습니다/, '무엇을 안 담는지 말해야 한다');
});

test('기금관리는 남의 원장을 건드리지 않는다', () => {
  /* loans 는 fund_erp 안이어야 한다 — 뿌리의 funds/data 는 푸른이알피 것이다 */
  const code = SRC.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(!/ref\('loans/.test(code), '네임스페이스 밖에 대장을 쓰고 있다');
  assert.ok(/ref\(NS\+'\/loans/.test(code), 'fund_erp 아래에 두어야 한다');
});
