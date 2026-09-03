/* 등록부 계약 — 새 화면·새 저장 자리가 온톨로지를 «건너뛰지» 못하게 한다.
   왜 생겼나: 2026-09-03 까지 검사는 「포털 타일 목록」만 봤다. 그래서 타일 없이
   주소로 들어가는 화면 넷(근로자 제출·이음센터 보기·취업규칙 작성기·카메라)과
   주인 없는 저장 자리 스물넷이 검사를 통째로 안 지났다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const O = require('../js/pu-ontology.js');

const root = path.join(__dirname, '..');
const src = f => fs.readFileSync(path.join(root, f), 'utf8');

/* 화면 파일 목록 — 저장소 뿌리의 .html 이 곧 「사람이 열 수 있는 화면」이다. */
function screenFiles(){
  return fs.readdirSync(root).filter(f => f.endsWith('.html')).sort();
}

/* 앱과 서버가 실제로 쓰는 저장 자리. 화면·공용 스크립트·서버 함수를 모두 훑는다.
   ⚠ 주석을 먼저 걷는다 — 잘 쓴 주석 안의 예시가 검사를 통과시켜서는 안 된다. */
function usedRoots(){
  const files = screenFiles()
    .concat(fs.readdirSync(path.join(root, 'js')).filter(f => f.endsWith('.js')).map(f => 'js/' + f))
    .concat(fs.existsSync(path.join(root, 'functions/index.js')) ? ['functions/index.js'] : []);
  const roots = new Set();
  for(const f of files){
    const bare = src(f).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
    for(const m of bare.matchAll(/ref\(\s*['"]([A-Za-z_][A-Za-z0-9_]*)/g)) roots.add(m[1]);
  }
  return [...roots].sort();
}

function portalApps(){
  const portal = src('enter.html');
  const at = portal.indexOf('var APPS = [');
  const end = portal.indexOf('];', at);
  assert.ok(at > 0 && end > at, '포털 APPS 목록을 찾지 못했습니다');
  return [...portal.slice(at, end).matchAll(/key:'([^']+)'/g)].map(m => m[1]);
}

test('사람이 열 수 있는 모든 화면이 등록부·딸린 화면·제외 중 하나다', () => {
  const seen = O.auditScreens(screenFiles());
  assert.deepEqual(seen.unknown, [],
    '★ 등록부에 없는 화면입니다. PROGRAMS(자기 저장 자리가 있음) 또는 ' +
    'SATELLITES(주인 프로그램의 자리에 쓰는 딸린 화면) 또는 EXCLUDED_SCREENS(사유와 함께) 에 넣으세요');
  assert.deepEqual(seen.ghosts, [],
    '★ 등록부에 적혀 있는데 파일이 없습니다. 지운 화면이면 등록부에서도 빼세요');
});

test('앱과 서버가 쓰는 모든 저장 자리에 주인이 있다', () => {
  const seen = O.auditRoots(usedRoots());
  assert.deepEqual(seen.unowned, [],
    '★ 주인 없는 저장 자리입니다. 업무 자료면 그 프로그램의 primaryRoots 에 적고, ' +
    '권한·백업·요금 같은 살림이면 INFRA_ROOTS 에 뜻을 적으세요 — ' +
    '안 적으면 온톨로지가 그 자료를 영영 못 봅니다');
  assert.deepEqual(seen.doubleOwned, [],
    '★ 한 저장 자리를 두 프로그램이 소유합니다. 주인은 하나여야 하고, 나머지는 sharedRoots(빌려 읽기)입니다');
});

test('딸린 화면은 자기 저장 자리를 갖지 않고 주인 프로그램을 가리킨다', () => {
  const owned = new Set();
  Object.values(O.PROGRAMS).forEach(p => (p.primaryRoots || []).forEach(r => owned.add(r.split('/')[0])));
  Object.entries(O.SATELLITES).forEach(([key, s]) => {
    assert.ok(s.name && s.file, key + ': 이름 또는 파일 없음');
    assert.ok(O.PROGRAMS[s.program], key + ': 주인 프로그램이 등록부에 없습니다 — ' + s.program);
    assert.ok(s.note, key + ': 무슨 일을 하는 화면인지 한 줄로 적으세요');
    assert.ok(!Array.isArray(s.primaryRoots),
      key + ': 딸린 화면이 자기 저장 자리를 가졌습니다 — 그러면 딸린 화면이 아니라 프로그램입니다');
  });
});

test('포털 타일은 모두 등록되고, 타일 없는 프로그램은 그 사실을 밝힌다', () => {
  const keys = portalApps();
  const result = O.auditPrograms(keys);
  assert.deepEqual(result.missing, [], '★ 포털 타일이 등록부에 없습니다');
  assert.deepEqual(result.undeclared, [],
    '★ 타일이 없는 등록 프로그램입니다. 근로자 전용·공개 화면이라면 portal:false 로 밝히세요');
  assert.equal(result.ok, true);
});

test('사전에 적은 관계어는 코드가 만들거나 미루는 사유가 적혀 있다', () => {
  /* 사전 블록을 걷어 내고 «코드에서» 쓰는지 본다 — 사전에 말만 늘어나는 것을 막는다.
     ⚠ 「마지막 관계어 이름으로 끝을 찾는」 방법을 쓰지 않는다 — 그 뒤에 하나를 더 적으면
       걷어 내는 자리가 어긋나 검사가 조용히 통과한다. 중괄호를 세어 끝을 찾는다. */
  const whole = src('js/pu-ontology.js');
  const from = whole.indexOf('predicates: {');
  assert.ok(from > 0, '사전의 관계어 블록을 찾지 못했습니다');
  let depth = 0, to = from;
  for(let i = whole.indexOf('{', from); i < whole.length; i++){
    if(whole[i] === '{') depth++;
    else if(whole[i] === '}'){ depth--; if(depth === 0){ to = i + 1; break; } }
  }
  assert.ok(to > from, '관계어 블록의 끝을 찾지 못했습니다');
  const code = whole.slice(0, from) + whole.slice(to);
  const planned = O.PREDICATES_PLANNED;
  Object.keys(O.TERMS.predicates).forEach(p => {
    const made = new RegExp("['\"]" + p + "['\"]").test(code);
    assert.ok(made || planned[p],
      '★ ' + p + ': 사전에만 있고 코드가 만들지 않습니다. 만들거나, PREDICATES_PLANNED 에 왜 미루는지 적으세요');
    if(planned[p]) assert.ok(planned[p].length > 10, p + ': 미루는 사유를 한 줄로 적으세요');
  });
  Object.keys(planned).forEach(p => {
    assert.ok(O.TERMS.predicates[p], '★ ' + p + ': 미루는 목록에 있는데 사전에 없는 관계어입니다');
  });
});

test('등록부 진단은 구멍을 찾고 원본을 읽거나 쓰지 않는다', () => {
  const reg = O.auditRegistry();
  assert.equal(reg.readOnly, true);
  assert.equal(reg.sourceMutation, 'never');
  assert.ok(reg.counts.programs >= 14, '등록 프로그램 수');
  assert.ok(reg.counts.satellites >= 1, '딸린 화면 수');
  assert.ok(reg.counts.infraRoots >= 1, '밑바탕 자리 수');
  /* 소유는 밝혔지만 통합 진단이 아직 안 읽는 자리는 «숨기지 않고» 알린다. */
  assert.ok(reg.issues.some(x => x.code === 'root_not_read'),
    '아직 안 읽는 소유 자리를 알려야 합니다');
  assert.ok(reg.issues.every(x => x.severity && x.code && x.detail), '모든 줄에 위험도·사유가 있다');
});

test('등록부 구멍이 검증센터의 「등록·계약」 칸에 담긴다', () => {
  assert.ok(O.VALIDATION_CATEGORIES.registry, '등록·계약 칸이 없습니다');
  const reg = O.auditRegistry();
  const queue = O.buildValidationQueue({ readOnly: true, entities: {}, edges: [], issues: reg.issues });
  assert.equal(queue.total, reg.issues.length);
  assert.equal(queue.counts.categories.registry, reg.issues.length,
    '★ 등록부 구멍이 「등록·계약」 칸으로 안 갑니다');
  queue.items.forEach(it => {
    assert.ok(it.advice && it.advice.length > 5, it.code + ': 권장 절차가 없습니다');
    assert.ok(it.programName, it.code + ': 어느 프로그램의 일인지 안 나옵니다');
    assert.equal(it.readOnly, true);
  });
});

test('푸른ERP 화면이 등록 현황과 구멍을 실제로 보여 준다', () => {
  /* ⚠ 큰 파일에 assert.match 를 쓰면 실패할 때 4MB 가 쏟아진다 — 참·거짓만 본다. */
  const erp = src('pu-erp.html');
  const has = (re, why) => assert.ok(re.test(erp), why);
  has(/auditRegistry\s*\(/, '★ 화면이 등록부 진단을 부르지 않습니다');
  has(/딸린 화면/, '★ 딸린 화면 수를 화면에 안 보여 줍니다');
  has(/PREDICATES_PLANNED/, '★ 「아직 만들지 않는 관계어」 수를 화면에 안 보여 줍니다');
  /* 등록·계약 줄의 이름표 — 코드만 뜨면 대표가 무슨 말인지 모른다. */
  O.VALIDATION_CATEGORIES.registry.codes.forEach(code => {
    has(new RegExp(code + "\\s*:\\s*'"), '★ ' + code + ': 화면에 우리말 이름표가 없습니다');
  });
});
