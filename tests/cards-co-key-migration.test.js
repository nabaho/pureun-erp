/* 회사 열쇠가 이름 열쇠(n...)에서 사업자번호 열쇠로 바뀌면, 옛 이름 열쇠에 있던
   folder·tags 가 안 보이게 된다 — 사업자등록증이 나중에 들어온 회사가 이 경우다.
   조용한 배경 쓰기로 옮기지 않는다. 읽을 때 두 열쇠의 값을 합쳐 보여준다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'pu-cards.html'), 'utf8');

function loadCoEffectiveExtra(){
  const normAt = source.indexOf('const _norm = s =>');
  assert.ok(normAt > 0, '_norm 정의를 찾지 못했습니다');
  const normEnd = source.indexOf('\n', normAt);
  const at = source.indexOf('function coEffectiveExtra');
  assert.ok(at > 0, 'coEffectiveExtra 를 찾지 못했습니다');
  /* coEffectiveExtra 는 coKeyOf 뒤, coList() 앞에 넣는다 — 그 사이만 자른다 */
  const end = source.indexOf('\nfunction coList', at);
  assert.ok(end > at, 'coEffectiveExtra 끝(coList 시작)을 찾지 못했습니다');
  const code = source.slice(normAt, normEnd) + '\n' + source.slice(at, end);
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  return ctx.coEffectiveExtra;
}

test('이름 열쇠와 사업자번호 열쇠가 같은 회사면 옛 기록을 합친다', () => {
  const fn = loadCoEffectiveExtra();
  const map = {
    'n한서정공': { tags:{'2026 통합기술보호지원반':true}, folder:'f1' },
    '3128100001': { docName:'사업자등록증' }
  };
  const r = fn('3128100001', '한서정공', map);
  assert.equal(r.folder, 'f1', '옛 열쇠의 폴더가 안 보인다');
  /* r.tags 는 vm 컨텍스트 안에서 만든 객체라 원형(prototype)이 달라 deepEqual 이
     그대로는 실패한다 — JSON 을 거쳐 원형을 지우고 견준다. */
  assert.deepEqual(JSON.parse(JSON.stringify(r.tags)), {'2026 통합기술보호지원반':true}, '옛 열쇠의 탭이 안 보인다');
  assert.equal(r.docName, '사업자등록증', '새 열쇠의 값이 없어졌다');
});

test('새 열쇠에도 같은 이름의 값이 있으면 새 열쇠가 이긴다', () => {
  /* 사람이 새 열쇠에서 폴더를 다시 정했으면 그것을 따라야 한다 */
  const fn = loadCoEffectiveExtra();
  const map = {
    'n한서정공': { folder:'f1' },
    '3128100001': { folder:'f2' }
  };
  const r = fn('3128100001', '한서정공', map);
  assert.equal(r.folder, 'f2');
});

test('탭은 옛 열쇠·새 열쇠 것을 모두 합친다', () => {
  const fn = loadCoEffectiveExtra();
  const map = {
    'n한서정공': { tags:{'옛탭':true} },
    '3128100001': { tags:{'새탭':true} }
  };
  const r = fn('3128100001', '한서정공', map);
  assert.deepEqual(JSON.parse(JSON.stringify(r.tags)), {'옛탭':true, '새탭':true});
});

test('지금 열쇠가 이미 이름 열쇠면 그대로 돌려준다 — 합칠 상대가 없다', () => {
  const fn = loadCoEffectiveExtra();
  const map = { 'n한서정공': { folder:'f1' } };
  const r = fn('n한서정공', '한서정공', map);
  assert.equal(r.folder, 'f1');
});

test('둘 다 없으면 null', () => {
  const fn = loadCoEffectiveExtra();
  assert.equal(fn('3128100001', '한서정공', {}), null);
});

test('옛 열쇠만 있고 새 열쇠는 없으면 옛 열쇠 것을 그대로', () => {
  const fn = loadCoEffectiveExtra();
  const map = { 'n한서정공': { folder:'f1', docName:'서식' } };
  const r = fn('3128100001', '한서정공', map);
  assert.equal(r.folder, 'f1');
  assert.equal(r.docName, '서식');
});

test('상호에 (주)·띄어쓰기가 있어도 같은 이름 열쇠로 찾는다', () => {
  const fn = loadCoEffectiveExtra();
  const map = { 'n한서정공': { folder:'f1' } };
  const r = fn('3128100001', '(주) 한서정공', map);
  assert.equal(r.folder, 'f1', '_norm 을 안 거쳐 못 찾았다');
});
