'use strict';
// 거래내역 쌓아 두기 · 중복 무시 — node --test tests/erp-ledger-accumulate.test.js
//
// 왜: 올린 파일이 저장되지 않았다. 새 파일을 올리면 앞의 것을 통째로 덮어써서,
//     달마다 올리면 앞 달이 사라지고 달끼리 견줄 수가 없었다.
//     (달로 나눠 보는 machinery(ldMonths)는 이미 있었다 — 쌓이지 않는 것이 문제였다)
//     그리고 담당자가 실수로 같은 파일을 또 올리면 그대로 두 배가 됐다.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const app = fs.readFileSync(path.join(__dirname, '..', 'pu-erp.html'), 'utf8').replace(/\r\n/g, '\n');
const FL = app.slice(app.indexOf('function FinanceLedger(){'), app.indexOf('function FinanceIncome'));

function grab(name){
  const i = app.indexOf('function ' + name + '(');
  assert.ok(i >= 0, name + ' 를 찾지 못했다');
  let d = 0, j = i;
  for(;;j++){ if(app[j] === '{') d++; else if(app[j] === '}'){ d--; if(!d){ j++; break; } } }
  return app.slice(i, j);
}

const sandbox = {
  window: {},
  erpNormName: s => String(s || '').replace(/\s+/g, '').toLowerCase(),
  erpCleanMemo: s => String(s || ''),
};
vm.createContext(sandbox);
vm.runInContext(grab('erpBankRowKey') + '\n' + grab('erpBankMergeDraft')
  + '\nvar BANK_DRAFT_MAX = 4000;\nthis.merge = erpBankMergeDraft;\nthis.rowKey = erpBankRowKey;', sandbox);
const merge = sandbox.merge;

const R = (o) => Object.assign({ _k:'0', type:'income', src:'bank', date:'2026-04-01', amount:100000, memo:'' }, o);
const FILE1 = [
  R({ _k:'0', date:'2026-04-01', amount:220000, memo:'광제' }),
  R({ _k:'1', date:'2026-04-02', amount:330000, memo:'노리시스템' }),
];
const copy = (rows) => rows.map(r => Object.assign({}, r));

/* ── 쌓인다 ── */
test('첫 업로드는 그대로 들어간다', () => {
  const m = merge([], copy(FILE1));
  assert.equal(m.rows.length, 2);
  assert.equal(m.dup, 0);
});

test('다음 달 파일을 올려도 앞 달이 남는다', () => {
  const a = merge([], copy(FILE1));
  const b = merge(a.rows, [R({ _k:'0', date:'2026-05-10', amount:110000, memo:'새달' })]);
  assert.equal(b.rows.length, 3);
  const months = [...new Set(b.rows.map(r => r.date.slice(0, 7)))].sort();
  assert.deepEqual(months, ['2026-04', '2026-05'], '달끼리 견주려면 둘 다 있어야 한다');
});

test('통장 순서대로 (오래된 것이 위)', () => {
  const m = merge([], [R({ date:'2026-06-01', amount:1 }), R({ date:'2026-04-01', amount:2 }),
                       R({ date:'2026-05-01', amount:3 })]);
  // vm 밖으로 나온 배열은 이쪽 Array 와 겨레가 달라 deepEqual 이 걸린다 — 글자로 견준다
  assert.equal(Array.from(m.rows).map(r => r.date).join(','), '2026-04-01,2026-05-01,2026-06-01');
});

/* ── 중복은 무시한다 ── */
test('같은 파일을 또 올리면 하나도 늘지 않는다', () => {
  const a = merge([], copy(FILE1));
  const b = merge(a.rows, copy(FILE1));
  assert.equal(b.rows.length, 2, '두 배가 되면 안 된다');
  assert.equal(b.dup, 2, '무시한 건수를 알려 줘야 한다');
});

test('기간이 겹쳐도 새 행만 들어간다', () => {
  const a = merge([], copy(FILE1));
  const b = merge(a.rows, [
    R({ _k:'0', date:'2026-04-02', amount:330000, memo:'노리시스템' }),   // 겹침
    R({ _k:'1', date:'2026-04-20', amount:550000, memo:'새 건' }),        // 새것
  ]);
  assert.equal(b.rows.length, 3);
  assert.equal(b.dup, 1);
});

test('적요를 다듬은 뒤 견준다 (띄어쓰기·대소문자)', () => {
  const a = merge([], [R({ amount:220000, memo:'노리 시스템' })]);
  const b = merge(a.rows, [R({ _k:'9', amount:220000, memo:'노리시스템' })]);
  assert.equal(b.rows.length, 1, '같은 행으로 봐야 한다');
});

test('⚠ 한 파일 안의 «진짜» 같은 행 둘은 살린다', () => {
  // 같은 곳에서 같은 값을 같은 날 두 번 보내는 일이 있다. 지우면 돈이 사라진다.
  const twice = [
    R({ _k:'0', date:'2026-04-02', amount:330000, memo:'노리' }),
    R({ _k:'1', date:'2026-04-02', amount:330000, memo:'노리' }),
  ];
  const a = merge([], copy(twice));
  assert.equal(a.rows.length, 2, '둘 다 남아야 한다');
  // 그런데 그 파일을 다시 올리면 늘지 않아야 한다
  const b = merge(a.rows, copy(twice));
  assert.equal(b.rows.length, 2);
  assert.equal(b.dup, 2);
});

test('통장과 카드는 따로 쌓는다', () => {
  const a = merge([], [R({ src:'bank', amount:220000, memo:'광제' })]);
  const b = merge(a.rows, [R({ _k:'9', src:'card', amount:220000, memo:'광제' })]);
  assert.equal(b.rows.length, 2, '금액·날짜·적요가 같아도 다른 통이다');
  assert.equal(b.dup, 0);
});

test('입금과 출금도 섞지 않는다', () => {
  const a = merge([], [R({ type:'income', amount:220000, memo:'ㄱ' })]);
  const b = merge(a.rows, [R({ _k:'9', type:'expense', amount:220000, memo:'ㄱ' })]);
  assert.equal(b.rows.length, 2);
});

test('날짜가 없어 가릴 수 없는 행은 버리고, 몇 건인지 알려 준다', () => {
  // ⚠ erpBankRowKey 는 빈 날짜에도 '|0|' 을 돌려준다. 그대로 두면 날짜 없는 행이
  //   죄다 같은 열쇠가 되어 서로를 지운다 — 소리 없이 돈이 사라진다.
  const m = merge([], [R({ date:'', amount:0, memo:'' }), R({ _k:'1', amount:5000, memo:'ㄴ' })]);
  assert.equal(m.rows.length, 1);
  assert.equal(m.skip, 1);
});

test('날짜 없는 행 둘이 서로를 지우지 않는다', () => {
  const m = merge([], [R({ _k:'0', date:'', amount:1000, memo:'ㄱ' }),
                       R({ _k:'1', date:'', amount:2000, memo:'ㄴ' })]);
  assert.equal(m.rows.length, 0);
  assert.equal(m.skip, 2, '둘 다 «못 넣었다»고 말해야 한다 — 하나는 중복으로 세면 거짓말이다');
  assert.equal(m.dup, 0);
});

/* ── 골라 둔 일이 날아가지 않는다 ── */
test('있던 행의 열쇠를 새 열쇠로 옮겨 준다', () => {
  // 열쇠가 «파일 행번호»에서 «지문»으로 바뀌므로, 옮겨 주지 않으면 골라 둔 짝이 다 풀린다
  // 대응표는 «있던 행»에 대한 것이다 — 첫 업로드에는 있던 행이 없다
  const a = merge([], [R({ _k:'0', amount:220000, memo:'광제' })]);
  assert.deepEqual(Object.keys(a.remap), [], '첫 업로드에는 옮길 것이 없다');
  const oldK = a.rows[0]._k;
  const b = merge(a.rows, [R({ _k:'0', date:'2026-05-01', amount:5000, memo:'새것' })]);
  assert.equal(b.remap[oldK], oldK, '이미 지문 열쇠면 그대로 이어진다');
  // 옛 초안(파일 행번호 열쇠)도 새 열쇠로 이어져야 한다
  const c = merge([{ _k:'17', type:'income', src:'bank', date:'2026-04-01', amount:220000, memo:'광제' }], []);
  assert.ok(c.remap['17'], '옛 열쇠 → 새 열쇠 대응표가 있어야 골라 둔 짝이 안 풀린다');
  assert.equal(c.remap['17'], c.rows[0]._k);
});

test('있던 것이 먼저 들어간다 (그래야 뒤에 온 같은 행이 버려진다)', () => {
  const src = FL.indexOf('addAll(curRows, false);');
  const dst = FL.indexOf('addAll(newRows, true);');
  const body = grab('erpBankMergeDraft');
  assert.ok(body.indexOf('addAll(curRows, false);') < body.indexOf('addAll(newRows, true);'));
});

/* ── 용량 ── */
test('한도를 넘으면 오래된 것부터 버리고 몇 건인지 알려 준다', () => {
  const many = [];
  for(let i = 0; i < 4100; i++) many.push(R({ _k:String(i), date:'2026-04-01', amount:i + 1, memo:'m' + i }));
  const m = merge([], many);
  assert.equal(m.rows.length, 4000);
  assert.equal(m.cut, 100);
});

/* ── 화면 쪽 ── */
test('올릴 때 덮어쓰지 않고 합친다', () => {
  assert.match(FL, /var _mg = erpBankMergeDraft\(_cur, _new\);/);
  assert.ok(FL.indexOf('setRows(result); setDetected(result.colMap);') < 0, '통째로 갈아끼우면 앞 달이 사라진다');
});

test('파일을 못 읽어도 앞서 올린 것이 남는다', () => {
  assert.ok(FL.indexOf("setBusy(true); setFName(file.name); setRows(null);") < 0);
  assert.match(FL, /setBusy\(true\); setFName\(file\.name\); setDetected\(null\);/);
});

test('골라 둔 짝·카테고리를 새 열쇠로 살린다', () => {
  assert.match(FL, /Object\.keys\(inMatch\|\|\{\}\)\.forEach\(function\(k\)\{ var nk=_mg\.remap\[k\]; if\(nk\) _keep\[nk\]=inMatch\[k\]; \}\);/);
  assert.match(FL, /Object\.keys\(expCat\|\|\{\}\)\.forEach\(function\(k\)\{ var nk=_mg\.remap\[k\]; if\(nk\) _keepC\[nk\]=expCat\[k\]; \}\);/);
  assert.ok(FL.indexOf('setExpCat({});                            // 이전 파일의 카테고리 선택 초기화') < 0);
});

test('자동 짝짓기는 이번에 새로 들어온 행에만 한다', () => {
  // 쌓인 옛 행까지 매번 다시 자동으로 짝지으면, 사람이 고쳐 둔 것을 덮어쓴다
  assert.match(FL, /if\(!_newKeys\[row\._k\]\) return;/);
});

test('무시한 중복 건수를 사람에게 말해 준다', () => {
  assert.match(FL, /🔁 이미 올라와 있던 '\+_mg\.dup\+'건은 무시했습니다/);
  assert.match(FL, /🗄 보관 한도\('\+BANK_DRAFT_MAX\+'행\)를 넘어 오래된 '\+_mg\.cut\+'건을 버렸습니다/);
});

test('src 를 저장한다 (없으면 통장·카드를 가를 수 없다)', () => {
  assert.match(app, /function _bankDraftSlimRow\(r, type, src\)\{/);
  assert.match(app, /src:\(src\|\|r\.src\|\|'bank'\)/);
  assert.match(FL, /flat\.push\(_bankDraftSlimRow\(x,'income',x\.src\)\)/);
});

test('보는 화면은 고른 종류만 보여준다', () => {
  assert.match(FL, /var _ldSrc = fileType === 'card' \? 'card' : 'bank';/);
  assert.match(FL, /var incAll = rows \? \(rows\.inc\|\|\[\]\)\.filter\(function\(r\)\{return _srcOf\(r\)===_ldSrc;\}\) : \[\];/);
  assert.match(FL, /function _srcOf\(r\)\{ return \(r && r\.src\) \|\| 'bank'; \}/, '옛 초안은 통장으로 본다');
});

test('종류 라디오가 쌓인 것을 지우지 않는다', () => {
  // 통장·카드를 함께 쌓으므로 라디오는 «비우기»가 아니라 «보는 쪽 바꾸기»다
  const radios = FL.slice(FL.indexOf("name:'ledgerType'"), FL.indexOf('나이스빌 CMS'));
  assert.ok(radios.indexOf('setRows(null)') < 0);
});

test('한 달만 비울 수 있다', () => {
  // 쌓아 두기 시작했으니 «전부 비우기» 하나로는 못 쓴다
  assert.match(FL, /async function clearMonth\(ym\)\{/);
  assert.match(FL, /'🗑 이 달'/);
  assert.match(FL, /return !\(_srcOf\(r\)===_ldSrc && String\(r\.date\|\|''\)\.slice\(0,7\)===ym\);/);
});

test('한 달 비우기는 지울 것과 남을 것을 미리 말한다', () => {
  const cm = FL.slice(FL.indexOf('async function clearMonth(ym){'), FL.indexOf('// ── 유연한 컬럼 감지 파서'));
  assert.match(cm, /이미 확정·등록한 입금\/출금은 그대로 유지됩니다/);
  assert.match(cm, /다른 달은 그대로 남습니다/);
  assert.match(cm, /if\(!\(await popConfirm\(/);
});
