/* 규칙 일괄 분류 — 틀리는 방향이 둘이다.
   놓치면 5,000장이 그대로 남고, 지나치면 손으로 정리해 둔 폴더를 덮어쓴다.
   특히 '미분류만 건드린다'와 '먼저 맞은 규칙 하나만'은 조용히 어긋나기 쉽다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const HTML = path.join(__dirname, '..', 'pu-cards.html');
const src = fs.readFileSync(HTML, 'utf8');

function slice(a, b){
  const i = src.indexOf(a);
  if(i < 0) throw new Error('시작 표식 못찾음: ' + a);
  const j = src.indexOf(b, i);
  if(j < 0) throw new Error('끝 표식 못찾음: ' + b);
  return src.slice(i, j);
}

/* 순수 로직 토막만 떼어 돌린다. 화면·저장은 들어오지 않는다. */
function load(){
  const code = slice(
    '/* ══════ 규칙 분류 — 순수 로직 (테스트 대상) ══════',
    '/* ══════ 규칙 분류 — 화면 ══════');
  const ctx = {
    console, Object, Array, String, JSON, Date, Math, RegExp,
    /* 파일 위쪽(1037행)에 있는 것과 같은 정의 — 앞의 번호를 떼고 공백을 지운다 */
    _canon: s => String(s||'').replace(/^\s*\d+\s*[.)\-]?\s*/,'').replace(/\s/g,''),
    state: { rules:{} },
    Store: { mode:'local' }
  };
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  /* const 로 선언한 값은 샌드박스 전역 객체에 붙지 않는다 (function 선언만 붙는다).
     식을 평가해 꺼내 온다. */
  ctx.read = expr => vm.runInContext(expr, ctx);
  return ctx;
}

/* _atMs 는 화면 토막(watchClassifyLog 근처)에 따로 마커로 감싸 둔 별도 슬라이스다 —
   순수 로직이지만 되돌리기 화면 함수들 사이에 자연스럽게 붙어 있어 그 자리를 그대로 두고
   슬라이스만 하나 더 뗀다. */
function loadAtMs(){
  const code = slice(
    '/* ══════ _atMs — 순수 로직 (테스트 대상) ══════',
    '/* ══════ _atMs 끝 ══════ */');
  const ctx = { console, Date };
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  return ctx;
}

/* 샌드박스가 만든 배열·객체는 바깥 realm 의 Array 를 상속하지 않아
   assert.deepEqual(=strict) 이 "구조는 같은데 다르다"며 떨어진다.
   이 파일 옆 dup-sweep.test.js 와 같이 글자로 바꿔 비교한다. */
const S = v => JSON.stringify(v);
const ids = list => Array.from(list||[]).map(x=>x.id).join(',');

const card = (id, company, group) => ({ id, kind:'card', company, name:'', group:group||'' });

test('기본 규칙 4개는 모두 갈 곳과 단어를 갖는다', () => {
  const c = load();
  const D = c.read('CLASSIFY_DEFAULTS');
  assert.equal(D.length, 4);
  D.forEach(r => {
    assert.ok(r.key, '규칙에 key가 있어야 한다');
    assert.ok(r.toGroupName, r.key + ' 에 보낼 폴더 이름이 없다');
    assert.ok(r.words && r.words.length, r.key + ' 에 단어가 없다');
  });
  /* 짧은 '청'은 청소·청과에도 걸린다 — 들어가 있으면 안 된다 */
  const pub = D.find(r => r.key === 'public');
  assert.equal(Array.from(pub.words).indexOf('청'), -1);
});

test('회사명에 단어가 있으면 걸린다', () => {
  const c = load();
  const r = { key:'nomu', enabled:true, words:['노무법인'] };
  assert.equal(c.ruleHit(card('a','노무법인로율'), r), true);
  assert.equal(c.ruleHit(card('b','좋은상사'), r), false);
});

test('꺼 둔 규칙은 걸리지 않는다', () => {
  const c = load();
  assert.equal(c.ruleHit(card('a','노무법인로율'), { key:'nomu', enabled:false, words:['노무법인'] }), false);
});

test('이름 칸에만 있어도 걸린다 — 회사 칸이 비어 들어온 명함이 많다', () => {
  const c = load();
  const it = { id:'a', kind:'card', company:'', name:'동북아노무법인', group:'' };
  assert.equal(c.ruleHit(it, { key:'nomu', enabled:true, words:['노무법인'] }), true);
});

test('미분류만 대상 — 이미 폴더에 든 명함은 건드리지 않는다', () => {
  const c = load();
  const items = [
    card('a','노무법인로율'),            /* 미분류 → 대상 */
    card('b','노무법인다솔','g-지인')     /* 이미 지인 폴더 → 손대면 안 됨 */
  ];
  const out = c.classifyTargets(items, c.read('CLASSIFY_DEFAULTS'), 'card');
  assert.equal(ids(out.byKey.nomu), 'a');
});

test('먼저 맞은 규칙 하나만 — 여러 규칙에 걸려도 위쪽이 이긴다', () => {
  const c = load();
  /* '세무법인 공단로' 는 expert(세무)와 public(공단)에 둘 다 걸린다 */
  const items = [ card('a','세무법인 공단로') ];
  const out = c.classifyTargets(items, c.read('CLASSIFY_DEFAULTS'), 'card');
  assert.equal(ids(out.byKey.expert), 'a');
  assert.equal(ids(out.byKey.public), '');
});

test('order 를 바꾸면 이기는 규칙도 바뀐다', () => {
  const c = load();
  const rules = [
    { key:'public', order:1, enabled:true, toGroupName:'기관·공공', words:['공단'] },
    { key:'expert', order:2, enabled:true, toGroupName:'전문가',   words:['세무'] }
  ];
  const out = c.classifyTargets([card('a','세무법인 공단로')], rules, 'card');
  assert.equal(ids(out.byKey.public), 'a');
});

test('명함과 사업자등록증은 섞이지 않는다', () => {
  const c = load();
  const items = [
    card('a','노무법인로율'),
    { id:'b', kind:'biz', company:'노무법인다솔', name:'', group:'' }
  ];
  const D = c.read('CLASSIFY_DEFAULTS');
  assert.equal(ids(c.classifyTargets(items, D, 'card').byKey.nomu), 'a');
  assert.equal(ids(c.classifyTargets(items, D, 'biz').byKey.nomu), 'b');
});

test('아무 규칙에도 안 걸리면 남는 쪽으로 간다', () => {
  const c = load();
  const out = c.classifyTargets([card('a','그냥회사')], c.read('CLASSIFY_DEFAULTS'), 'card');
  assert.equal(ids(out.unmatched), 'a');
});

test('두 번 적용해도 안전 — 폴더가 정해진 뒤에는 대상이 0장', () => {
  const c = load();
  const D = c.read('CLASSIFY_DEFAULTS');
  const items = [ card('a','노무법인로율') ];
  assert.equal(c.classifyTargets(items, D, 'card').byKey.nomu.length, 1);
  items[0].group = 'g-노무사';           /* 적용된 뒤의 모습 */
  assert.equal(c.classifyTargets(items, D, 'card').byKey.nomu.length, 0);
});

test('보낼 폴더를 이름으로 찾는다 — 앞 번호는 무시한다', () => {
  const c = load();
  const groups = { g1:{ id:'g1', name:'1. 노무사', kind:'card' } };
  const r = { key:'nomu', toGroupName:'노무사' };
  assert.equal(S(c.findRuleGroup(groups, r, 'card')), S({ gid:'g1' }));
});

test('폴더가 없으면 만들어야 한다고 알린다', () => {
  const c = load();
  const r = { key:'public', toGroupName:'기관·공공' };
  assert.equal(c.findRuleGroup({}, r, 'card').missing, true);
});

test('잠긴 폴더로는 보내지 않는다', () => {
  const c = load();
  const groups = { g1:{ id:'g1', name:'노무사', kind:'card', locked:true, lockOwner:'남@x.com' } };
  const got = c.findRuleGroup(groups, { key:'nomu', toGroupName:'노무사' }, 'card');
  assert.equal(got.locked, true);
  assert.equal(got.gid, null);
});

test('같은 이름이라도 명함용 폴더와 사업자용 폴더는 다르다', () => {
  const c = load();
  const groups = {
    g1:{ id:'g1', name:'노무사', kind:'card' },
    g2:{ id:'g2', name:'노무사', kind:'biz' }
  };
  const r = { key:'nomu', toGroupName:'노무사' };
  assert.equal(c.findRuleGroup(groups, r, 'card').gid, 'g1');
  assert.equal(c.findRuleGroup(groups, r, 'biz').gid, 'g2');
});

/* Blocker 2 — 규칙이 만든 폴더를 누가 이름을 바꿔도, 결정적 id 자리에 남아 있는 그
   폴더를 '없다'고 오판해 통째로 덮어쓰면 안 된다. */
test('이름을 바꾼 규칙 폴더도 id로 다시 찾아 재사용한다 — 없는 걸로 보고 새로 만들면 안 된다', () => {
  const c = load();
  const gid = c.ruleFolderId('card', '노무사');
  const groups = { [gid]: { id:gid, name:'노무사 명함', kind:'card', order:7, parent:'p1' } };
  const r = { key:'nomu', toGroupName:'노무사' };
  const got = c.findRuleGroup(groups, r, 'card');
  assert.equal(got.gid, gid);              /* 이름은 놓쳤어도 id로 찾아 그대로 재사용 */
  assert.equal(got.missing, undefined);    /* '없다'고 보고 새로 만들면 안 된다 */
});

test('이름을 바꾸고 잠근 규칙 폴더는 id로 찾아도 여전히 보낼 수 없다', () => {
  const c = load();
  const gid = c.ruleFolderId('card', '노무사');
  const groups = { [gid]: { id:gid, name:'노무사 명함', kind:'card', locked:true, pw:'1234', lockOwner:'me@x.com' } };
  const r = { key:'nomu', toGroupName:'노무사' };
  const got = c.findRuleGroup(groups, r, 'card');
  assert.equal(got.locked, true);
  assert.equal(got.gid, null);
});

/* ruleFolderId — Blocker 2 의 결정적 id 생성기. Firebase 키에 못 쓰는 글자가 새면
   update() 자체가 통째로 실패한다. */
test('ruleFolderId 는 Firebase 금지문자를 절대 포함하지 않는다', () => {
  const c = load();
  const names = ['노무사', '기관·공공', 'R&D', '  ', '', 'a/b.c#d$e[f]g', '이름\t\n있음'];
  const forbidden = /[.$#[\]/\x00-\x1f\x7f]/;
  names.forEach(name=>{
    const id = c.ruleFolderId('card', name);
    assert.equal(forbidden.test(id), false, `"${name}" → "${id}" 에 금지문자가 남았다`);
    assert.ok(id.length > 0);
  });
});

test('ruleFolderId 는 빈 이름·공백 이름이라도 쓸 수 있는 id를 만든다', () => {
  const c = load();
  assert.equal(c.ruleFolderId('card', ''), 'rule_card_g');
  assert.equal(c.ruleFolderId('card', '   '), 'rule_card_g');
});

test('ruleFolderId 는 uid() 가 만드는 id 형태(i로 시작)와 절대 겹치지 않는다', () => {
  const c = load();
  ['노무사', '', '  ', 'R&D', 'i노무사'].forEach(name=>{
    const id = c.ruleFolderId('card', name);
    assert.equal(id.startsWith('i'), false, `"${name}" → "${id}" 가 uid() 형태와 겹친다`);
    assert.equal(id.startsWith('rule_'), true);
  });
});

/* _atMs — 되돌리기 정렬·프루닝의 기준. at 이 없거나 이상하면 가장 오래된 것(0)으로
   봐야지, '지금'으로 보면 기록 없는 항목이 되돌리기 버튼에 영원히 눌러앉는다. */
test('_atMs — 숫자면 그대로 통과시킨다', () => {
  const c = loadAtMs();
  assert.equal(c._atMs(1700000000000), 1700000000000);
  assert.equal(c._atMs(0), 0);
});

test('_atMs — 서버 타임스탬프 placeholder는 지금으로 본다', () => {
  const c = loadAtMs();
  const before = Date.now();
  const got = c._atMs({ '.sv': 'timestamp' });
  const after = Date.now();
  assert.ok(got >= before && got <= after, 'placeholder는 Date.now() 범위 안이어야 한다');
});

test('_atMs — at 이 없거나 이상하면 가장 오래된 것(0)으로 본다', () => {
  const c = loadAtMs();
  assert.equal(c._atMs(undefined), 0);
  assert.equal(c._atMs(null), 0);
  assert.equal(c._atMs('2024-01-01'), 0);
  assert.equal(c._atMs({}), 0);              /* placeholder 모양이 아닌 임의 객체 */
  assert.equal(c._atMs({ foo:'bar' }), 0);
});
