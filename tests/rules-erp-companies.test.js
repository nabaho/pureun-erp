'use strict';
/* 규정관리 ← 푸른이알피 업체관리(data/companies) 읽기

   왜: 화면 콘솔에 「ERP 업체 2건 로드」가 찍혔고(2026-09-05 실측), 씨티에스㈜를
   ERP 에서 못 찾는다고 나왔다. 업체가 2곳이라서가 아니다.

   pu-erp 동기화는 data/{키} 를 «포장»해 올린다 — { v: 값, u: 갱신시각 }.
   (pu-erp.html: updates['data/'+k] = { v: JSON.parse(raw), u: ts })
   규정관리는 포장을 안 벗기고 Object.values 를 했다 → [업체지도 통째, 시각 숫자]
   → 길이 2. ERP_COS[0] 은 업체가 아니라 «업체 지도 전체», [1] 은 숫자라
   findErpCompany 의 c.name·c.bizNo 가 늘 undefined — 어떤 사업장도 못 찾았다.

   같은 파일의 resolveUserName 은 raw.v!==undefined ? raw.v : raw 로 제대로 벗긴다.
   한 곳은 알고 한 곳은 잊은 것이다. 이 검사는 두 곳이 다시 어긋나지 않게 못 박는다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'rules.html'), 'utf8').replace(/\r\n/g, '\n');

function fn(name) {
  const marker = 'function ' + name + '(';
  let start = src.indexOf(marker);
  if (start < 0) throw new Error('함수 못찾음: ' + name);
  if (src.slice(start - 6, start) === 'async ') start -= 6;
  let pd = 0, pEnd = -1;
  for (let i = start + marker.length - 1; i < src.length; i++) {
    if (src[i] === '(') pd++;
    else if (src[i] === ')') { pd--; if (pd === 0) { pEnd = i; break; } }
  }
  const bodyStart = src.indexOf('{', pEnd + 1);
  let d = 0;
  for (let i = bodyStart; i < src.length; i++) {
    if (src[i] === '{') d++;
    else if (src[i] === '}') { d--; if (d === 0) return src.slice(start, i + 1); }
  }
  throw new Error('함수 끝 못찾음: ' + name);
}
function line(re, what) {
  const m = src.match(re);
  if (!m) throw new Error(what + ' 를 못 찾았습니다');
  return m[0].replace(/^const /, 'var ');
}

/* pu-erp 가 실제로 올리는 모양 그대로 */
const WRAPPED = {
  v: {
    c1: { id: 'c1', name: '씨티에스㈜', bizNo: '123-45-67890', ceo: '홍길동' },
    c2: { id: 'c2', name: '주식회사 한빛산업', bizNo: '2223344556' },
    c3: { id: 'c3', name: '㈜미래테크', bizNo: '' }
  },
  u: 1725000000000
};

function ctxWith(extra) {
  const c = vm.createContext(Object.assign({ Object, Array, String }, extra || {}));
  vm.runInContext(fn('erpCompaniesFrom'), c);
  return c;
}

test('★ 포장({v,u})을 벗겨 업체만 돌려준다 — 시각 숫자가 업체로 세이면 안 된다', () => {
  const out = ctxWith().erpCompaniesFrom(WRAPPED);
  assert.equal(out.length, 3, '「2건」이 나오면 포장을 안 벗긴 것입니다');
  assert.ok(out.every(c => c && typeof c === 'object' && typeof c.name === 'string'),
    '업체 아닌 것(숫자·지도 통째)이 섞였습니다: ' + JSON.stringify(out.map(x => typeof x)));
  assert.ok(out.some(c => c.name === '씨티에스㈜'));
});

test('포장 안이 배열이어도 된다', () => {
  const out = ctxWith().erpCompaniesFrom({ v: Object.values(WRAPPED.v), u: 1 });
  assert.equal(out.length, 3);
});

test('포장 없는 옛 모양(배열·객체)도 그대로 읽는다', () => {
  const c = ctxWith();
  assert.equal(c.erpCompaniesFrom(Object.values(WRAPPED.v)).length, 3);
  assert.equal(c.erpCompaniesFrom(WRAPPED.v).length, 3);
});

test('비어 있으면 빈 배열', () => {
  /* vm 안에서 만든 배열은 원형(prototype)이 달라 deepEqual 이 걸린다 — 값으로 견준다
     (이 저장소의 다른 검사도 같은 이유로 JSON.stringify 로 견준다) */
  const c = ctxWith();
  for (const raw of [null, undefined, '', { v: null, u: 1 }]) {
    const out = c.erpCompaniesFrom(raw);
    assert.ok(Array.isArray(out) && out.length === 0, '빈 입력 ' + JSON.stringify(raw) + ' → ' + JSON.stringify(out));
  }
});

test('업체 자리에 낀 쓰레기(null·숫자·글자)는 걷어낸다', () => {
  const out = ctxWith().erpCompaniesFrom({ v: { a: WRAPPED.v.c1, b: null, c: 0, d: 'x', e: WRAPPED.v.c2 }, u: 1 });
  assert.equal(out.length, 2);
});

/* ── 진짜로 찾아지는가 — findErpCompany 까지 함께 돌린다 ── */
function ctxFind(erpRaw) {
  const c = ctxWith();
  vm.runInContext(line(/^const _norm=.*$/m, '_norm'), c);
  vm.runInContext(line(/^const _digits=.*$/m, '_digits'), c);
  vm.runInContext(fn('findErpCompany'), c);
  c.ERP_COS = c.erpCompaniesFrom(erpRaw);
  return c;
}

test('★ 씨티에스㈜를 상호로 찾는다 — 화면에서 못 찾던 바로 그 경우', () => {
  const c = ctxFind(WRAPPED);
  const hit = c.findErpCompany('🏢 씨티에스㈜', '');
  assert.ok(hit, 'ERP 업체관리에서 찾지 못했습니다 — 포장이 안 벗겨진 채입니다');
  assert.equal(hit.ceo, '홍길동');
});

test('★ 사업자번호로도 찾는다 — 하이픈 표기가 달라도', () => {
  const c = ctxFind(WRAPPED);
  assert.equal((c.findErpCompany('', '1234567890') || {}).name, '씨티에스㈜');
  assert.equal((c.findErpCompany('', '222-33-44556') || {}).name, '주식회사 한빛산업');
});

test('법인격 표기가 달라도 맞춘다 — 「한빛산업」 ↔ 「주식회사 한빛산업」', () => {
  const c = ctxFind(WRAPPED);
  assert.equal((c.findErpCompany('한빛산업', '') || {}).bizNo, '2223344556');
});

test('★ 옛 방식이 왜 실패했는지 남겨 둔다 — [지도 통째, 숫자] 로는 아무도 못 찾는다', () => {
  const c = ctxWith();
  vm.runInContext(line(/^const _norm=.*$/m, '_norm'), c);
  vm.runInContext(line(/^const _digits=.*$/m, '_digits'), c);
  vm.runInContext(fn('findErpCompany'), c);
  c.ERP_COS = Object.values(WRAPPED).filter(Boolean);          // 고치기 전 코드가 만들던 것
  assert.equal(c.ERP_COS.length, 2, '이것이 화면의 「ERP 업체 2건 로드」다');
  assert.equal(c.findErpCompany('씨티에스㈜', ''), null);
  assert.equal(c.findErpCompany('', '1234567890'), null);
});

/* ── 배선 ── */
test('★ loadErpCompanies 가 벗기기 함수를 쓴다', () => {
  const body = fn('loadErpCompanies');
  assert.match(body, /erpCompaniesFrom\(/, '직접 Object.values 를 하면 포장이 또 업체로 세입니다');
  assert.ok(!/Object\.values\(v\|\|\{\}\)/.test(body), '옛 한 줄이 남아 있습니다');
});

test('resolveUserName 의 벗기기 방식과 어긋나지 않는다', () => {
  assert.match(fn('resolveUserName'), /raw\.v!==undefined\)\?raw\.v:raw/,
    '이름 조회 쪽 벗기기가 바뀌었습니다 — erpCompaniesFrom 과 함께 맞춰야 합니다');
});
