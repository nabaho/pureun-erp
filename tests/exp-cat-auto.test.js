/* 출금 카테고리 — 한 번 등록하면 «다른 달에도» 저절로 (대표 지시 2026-08-29)
 *
 * 대표: 「출금관리에 카테고리 한번 등록하면 자동으로 연결되게 해라.
 *        내용 확인후 자동등록되면 검토가 필요없다.
 *        세금 등 매월 자동으로 이체되는 내용은 등록이후 다른 달에 이체되는것도
 *        모두 같이 처리되게 해라」
 *
 * 여태 막힌 곳: 기억하는 «열쇠»에 달 이름이 들어 있었다 —
 * 「박성수_12월급여」와 「박성수_1월급여」가 다른 지출로 갈렸다.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ERP = fs.readFileSync(path.join(__dirname, '..', 'pu-erp.html'), 'utf8');
function bare(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}
function cutBlock(src, header) {
  const i = src.indexOf(header);
  assert.ok(i >= 0, '못 찾음: ' + header);
  let d = 0;
  for (let k = src.indexOf('{', i); k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (d === 0) return src.slice(i, k + 1); }
  }
  throw new Error('닫는 괄호 없음: ' + header);
}
function cutDecl(src, pre) {
  const i = src.indexOf(pre);
  assert.ok(i >= 0, '못 찾음: ' + pre);
  return src.slice(i, src.indexOf(';', src.indexOf(']', i)) + 1);
}

/* 열쇠 만드는 길을 통째로 돌려 본다 — 글자로 보면 실제로 묶이는지 알 수 없다. */
const ctx = { window: {}, _erpCleanCache: {}, console };
vm.createContext(ctx);
vm.runInContext(cutDecl(ERP, 'var ERP_MEMO_NOISE ='), ctx);
vm.runInContext(cutDecl(ERP, 'var ERP_BANK_WORDS ='), ctx);
['function _erpStripNoiseWord(', 'function erpNormName(', 'function erpCleanMemo(', 'function erpExpCatKey(']
  .forEach((h) => vm.runInContext(cutBlock(ERP, h), ctx));
const key = ctx.erpExpCatKey;

test('★★ 달이 달라도 «같은 지출»로 본다 — 급여', () => {
  assert.strictEqual(key('박성수_12월급여'), key('박성수_1월급여'),
    '★ 달이 바뀌면 안 묶인다 — 매달 손으로 다시 골라야 한다');
  assert.strictEqual(key('김보람_12월급여'), key('김보람_3월급여'));
});

test('★★ 달이 달라도 «같은 지출»로 본다 — 매달 나가는 수수료', () => {
  assert.strictEqual(key('12월 문자수수료'), key('1월 문자수수료'));
});

test('★★ «다른 사람»끼리는 안 묶인다 (달만 빼고 나머지는 그대로 본다)', () => {
  assert.notStrictEqual(key('박성수_1월급여'), key('김보람_1월급여'),
    '★ 사람이 달라도 같다고 하면 남의 급여를 엉뚱한 카테고리로 등록한다');
});

test('★ 달 이름밖에 없는 적요도 열쇠가 «빈 글자»가 되지 않는다', () => {
  const k = key('12월');
  assert.ok(k && k.length > 0,
    '★ 빈 열쇠는 아무 적요와나 맞는다 — 전혀 다른 지출이 한 덩이가 된다');
});

test('★ 빈 적요는 그대로 빈 글자', () => {
  assert.strictEqual(key(''), '');
  assert.strictEqual(key(null), '');
});

/* ── 화면이 실제로 저절로 채우고, 저절로 등록하는가 ── */
test('★★ 배운 것을 «버튼 없이» 채운다', () => {
  const src = bare(ERP);
  assert.ok(/useEffect\(function\(\)\{[\s\S]{0,600}?if\(add\) setExpCat\(/.test(src),
    '★ 여전히 「🤖 카테고리 자동」을 눌러야 채워진다 — 매달 누르는 일이 남는다');
  assert.ok(/if\(row\._dup \|\| expCat\[row\._k\]\) return;/.test(src),
    '★★ 사람이 고른 것을 덮어쓴다 — 고르던 것이 바뀌면 그보다 나쁜 일이 없다');
  assert.ok(/if\(add\) setExpCat/.test(src),
    '★ 채울 것이 없어도 다시 그린다 — 그리면 또 부르고, 끝없이 돈다');
});

test('★★ 「저절로 등록」은 «처음에 꺼져» 있고, 기억된다', () => {
  const src = bare(ERP);
  assert.ok(/usePersistedState\('ledger_exp_auto_reg', false\)/.test(src),
    '★ 묻지도 않고 켜져 있으면, 대표가 모르는 사이에 장부에 적힌다');
});

test('★★ 「저절로 등록」은 «배운 것»만 등록한다', () => {
  const src = bare(ERP);
  const seg = src.slice(src.indexOf('if(!rows || ldTabEff!==\'exp\' || !expAutoReg) return;'));
  assert.ok(seg.length > 0, '저절로 등록하는 덩이를 못 찾았다');
  assert.ok(/if\(!g \|\| g\.category !== cat\) return;/.test(seg.slice(0, 900)),
    '★★ 사람이 고르다 만 것까지 대신 눌러 버린다 — 배운 것과 같을 때만 등록해야 한다');
  assert.ok(/if\(row\._dup\) return;/.test(seg.slice(0, 900)),
    '★ 이미 처리된 줄을 다시 등록한다');
});

test('★ 스위치가 화면에 «보인다» (숨은 채로 도는 자동은 안 된다)', () => {
  const src = bare(ERP);
  assert.ok(src.indexOf('배운 것은 저절로 등록') >= 0,
    '★ 켜고 끄는 자리가 안 보이면, 저절로 등록되는 까닭을 아무도 모른다');
  assert.ok(/onChange:function\(\)\{ setExpAutoReg\(!expAutoReg\); \}/.test(src),
    '★ 끌 수가 없다');
});
