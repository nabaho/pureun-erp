/* 사업자번호 칸 점검 — 읽기 전용으로 «무엇이 들었는지»만 갈라 본다.
   왜 생겼나: 사무대행 엑셀 가져오기가 공단 사업장관리번호를 사업자번호 칸(bizNo)에
   그대로 넣는다. 그 칸으로 업체를 이으면 엉뚱한 곳에 붙는다.
   대표 지시(2026-09-03): 옮기기 전에 «실제 값을 먼저 뽑아 본다». */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const erp = fs.readFileSync(path.join(__dirname, '..', 'pu-erp.html'), 'utf8');

/* 화면에서 판별 함수와 검증식을 그대로 떼어 내 돌린다 — 화면과 다른 규칙을 검사하지 않으려고. */
function loadFromScreen(){
  const kind = /function bizFieldKind\(v\)\{[\s\S]*?\n\}/.exec(erp);
  assert.ok(kind, '★ 판별 함수(bizFieldKind)를 화면에서 찾지 못했습니다');
  const sum = /window\.bizNoChecksum = function\(b\)\{[\s\S]*?\n  \};/.exec(erp);
  assert.ok(sum, '★ 사업자번호 검증식(bizNoChecksum)을 화면에서 찾지 못했습니다');
  return new Function('window', sum[0] + '\n' + kind[0] + '\nreturn bizFieldKind;')({});
}

const bizFieldKind = loadFromScreen();

test('열 자리 + 검증숫자가 맞으면 사업자번호로 본다', () => {
  /* 검사고정-허용: 사업자등록번호 검증식은 국세청이 정한 «규칙»이다(가중치 1,3,7,1,3,7,1,3,5).
     아래 두 값은 그 규칙을 만족하는 번호라서 값 자체가 규칙 확인이다. */
  assert.equal(bizFieldKind('220-81-62517'), 'ok');
  assert.equal(bizFieldKind('2208162517'), 'ok', '하이픈이 없어도 같게 봐야 한다');
});

test('열한 자리 이상은 사업자번호일 수 없다 — 공단 관리번호로 본다', () => {
  assert.equal(bizFieldKind('41512345670'), 'mgmt');
  assert.equal(bizFieldKind('415-12-34567-0'), 'mgmt', '공단 관리번호 표기도 같게 봐야 한다');
});

test('열 자리인데 검증숫자가 틀리면 오타로 본다', () => {
  assert.equal(bizFieldKind('220-81-62518'), 'bad', '끝자리 하나만 틀려도 걸러야 한다');
});

test('덜 적힌 값과 빈 칸을 가른다', () => {
  assert.equal(bizFieldKind('220-81'), 'short');
  assert.equal(bizFieldKind(''), 'empty');
  assert.equal(bizFieldKind(null), 'empty');
  assert.equal(bizFieldKind(undefined), 'empty');
  assert.equal(bizFieldKind('   '), 'empty');
  assert.equal(bizFieldKind('없음'), 'empty', '숫자가 없는 글자는 빈 칸과 같게 본다');
});

test('갈래마다 이름과 «어떻게 갈랐나»가 화면에 적혀 있다', () => {
  const block = /var BIZ_KINDS = \[[\s\S]*?\n\];/.exec(erp);
  assert.ok(block, '★ 갈래 목록(BIZ_KINDS)이 없습니다');
  ['ok', 'mgmt', 'bad', 'short', 'empty'].forEach(k => {
    assert.ok(new RegExp("k:'" + k + "'").test(block[0]), k + ': 갈래가 빠졌습니다');
  });
  const hows = [...block[0].matchAll(/how:'([^']+)'/g)].map(m => m[1]);
  assert.equal(hows.length, 5, '★ 갈래마다 «어떻게 갈랐나»를 적으세요 — 대표가 판단할 근거입니다');
  hows.forEach(h => assert.ok(h.length > 6, '설명이 너무 짧습니다: ' + h));
});

test('점검 화면은 값을 옮기지도 고치지도 않는다', () => {
  const from = erp.indexOf('function BizNoAuditPanel()');
  const to = erp.indexOf('function DataLogMasters()');
  assert.ok(from > 0 && to > from, '★ 점검 화면을 찾지 못했습니다');
  /* 주석을 먼저 걷는다 — 「고치지 않는다」고 쓴 주석이 검사를 통과시켜서는 안 된다. */
  const body = erp.slice(from, to)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  ['dbSet', 'dbUpsert', 'dbDelete', 'fbDb.ref', '.set(', '.update(', '.remove(', '.push('].forEach(bad => {
    assert.ok(body.indexOf(bad) < 0,
      '★ 읽기 전용이어야 하는 점검 화면에 쓰기 명령이 있습니다: ' + bad);
  });
  assert.ok(/dbGet\('companies'/.test(body), '업체 목록을 읽어야 합니다');
});

test('지워진 업체는 세지 않는다', () => {
  const from = erp.indexOf('function BizNoAuditPanel()');
  const body = erp.slice(from, erp.indexOf('function DataLogMasters()'));
  assert.ok(/_deleted/.test(body),
    '★ 지운 업체를 걸러야 합니다 — 안 그러면 「고칠 곳」 수가 부풀려집니다');
});

test('환경설정에서 실제로 열 수 있다', () => {
  /* ⚠ 고정 폭으로 자르지 않는다 — 함수가 길어지면 창이 끝에 못 닿아 검사가 조용히 통과한다
     (tests/test-pin-guard.test.js 가 그 버릇을 막는다). 목록의 «괄호»를 찾아 자른다. */
  const at = erp.indexOf('function DataLogMasters()');
  assert.ok(at > 0, '★ 환경설정 화면을 찾지 못했습니다');
  const open = erp.indexOf('var TABS = [', at);
  const close = erp.indexOf('];', open);
  assert.ok(open > at && close > open, '★ 탭 목록을 찾지 못했습니다');
  const tabs = erp.slice(open, close);
  assert.ok(/comp:\s*BizNoAuditPanel/.test(tabs), '★ 탭에 안 걸려 있어 아무도 못 엽니다');
});
