/* 사건 심급·단계 카드 — 계열 묶음 · 한 줄 요약 · 영문 코드 제거
   대표가 보는 화면에 case-dismiss 같은 코드가 나오면 무슨 유형인지 알 수 없다.
   그리고 그 코드가 저장된 유형 목록에 없으면 적용 유형이 실제로 걸리지 않는다 — 그걸 숨기면 안 된다. */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const HTML = path.join(__dirname, '..', 'pu-erp.html');
const src = fs.readFileSync(HTML, 'utf8');

function slice(a, b){
  const i = src.indexOf(a);
  if(i < 0) throw new Error('시작 표식 못찾음: ' + a);
  const j = src.indexOf(b, i);
  if(j < 0) throw new Error('끝 표식 못찾음: ' + b);
  return src.slice(i, j);
}

let pass = 0, fail = 0;
const t = (name, got, want) => {
  const G = JSON.stringify(got), W = JSON.stringify(want);
  if(G === W) pass++;
  else { fail++; console.log('FAIL ' + name + '\n  got  = ' + G + '\n  want = ' + W); }
};

/* ── 도우미 함수 샌드박스 ── */
const ctx = (function(){
  let store = {};
  const c = {
    console, Date, Math, Object, JSON, Array, String, Number, parseInt, isNaN, RegExp,
    window:{}, showToast(){}, todayYMD(){ return '2026-08-04'; },
    dbGet(k, d){ return (k in store) ? store[k] : d; }, dbSet(k, v){ store[k] = v; return true; }
  };
  vm.createContext(c);
  vm.runInContext(slice('var BIZ_CASE_SEED = [', 'var BIZ_CONS_SEED'), c);
  vm.runInContext(slice('var CASE_STAGE_ORGS = [', '// 카테고리별 색상'), c);
  vm.runInContext(slice('var CASE_STAGE_LINES = [', 'function CaseStageCard()'), c);
  return c;
})();

const SEED_TYPES = ctx.BIZ_CASE_SEED;

/* ═══ 1. ★ 영문 코드가 화면에 나오지 않는다 ═══ */
t('★ 부해등', ctx.caseTypeLabel('case-dismiss', SEED_TYPES), '부해등');
t('★ 노사',   ctx.caseTypeLabel('case-relation', SEED_TYPES), '노사');
t('★ 징계',   ctx.caseTypeLabel('case-discipline', SEED_TYPES), '징계');
t('★ 산재등', ctx.caseTypeLabel('case-injury', SEED_TYPES), '산재등');
t('★ 체불',   ctx.caseTypeLabel('case-wage', SEED_TYPES), '체불');
t('★ 체당금', ctx.caseTypeLabel('case-subsidy', SEED_TYPES), '체당금');
// 저장된 유형 목록이 비었을 때도 시드 이름으로 떨어진다 (지금 화면에 코드가 나오던 원인)
t('★ 유형 목록이 비어도 한글', ctx.caseTypeLabel('case-dismiss', []), '부해등');
t('★ 유형 목록이 null 이어도 한글', ctx.caseTypeLabel('case-injury', null), '산재등');
// 저장된 이름이 시드와 다르면 저장된 쪽을 쓴다 (대표가 이름을 바꿨을 수 있다)
t('대표가 바꾼 이름이 우선',
  ctx.caseTypeLabel('case-dismiss', [{ code:'case-dismiss', name:'부당해고등' }]), '부당해고등');
// 시드에도 없는 코드는 코드 그대로 — 없는 것을 있는 것처럼 꾸미지 않는다
t('정말 모르는 코드는 그대로', ctx.caseTypeLabel('case-zzz', []), 'case-zzz');
t('빈 코드는 빈 문자열', ctx.caseTypeLabel('', SEED_TYPES), '');
t('null 코드도 빈 문자열', ctx.caseTypeLabel(null, SEED_TYPES), '');
// 시드에 있는 코드 전부가 한글 이름을 가진다 (하나라도 코드로 새면 화면에 영문이 뜬다)
t('★ 시드 전부 한글 이름',
  SEED_TYPES.every(s => ctx.caseTypeLabel(s.code, []) === s.name), true);
t('★ 어느 코드도 case- 로 시작하는 이름이 아니다',
  SEED_TYPES.every(s => !/^case-/.test(ctx.caseTypeLabel(s.code, []))), true);

/* ═══ 2. ★ 없는 유형은 숨기지 않고 알린다 ═══ */
t('★ 저장 목록에 없으면 없는 유형', ctx.caseTypeMissing('case-dismiss', []), true);
t('있으면 정상', ctx.caseTypeMissing('case-dismiss', SEED_TYPES), false);
t('null 목록도 없는 유형', ctx.caseTypeMissing('case-dismiss', null), true);
t('빈 코드는 판정하지 않는다', ctx.caseTypeMissing('', SEED_TYPES), false);
t('★ 시드 이름이 있어도 저장 목록에 없으면 알린다',
  ctx.caseTypeLabel('case-dismiss', []) === '부해등' && ctx.caseTypeMissing('case-dismiss', []), true);

/* ═══ 3. 기한 한 칸 요약 ═══ */
t('송달일 기준', ctx.caseStageDueText({ dueDays:10, dueFrom:'notice' }), '송달일 + 10일');
t('판정일 기준', ctx.caseStageDueText({ dueDays:90, dueFrom:'result' }), '판정일 + 90일');
t('기한 0이면 없음', ctx.caseStageDueText({ dueDays:0, dueFrom:'notice' }), '기한 없음');
t('기한 없는 단계', ctx.caseStageDueText({ dueDays:0, dueFrom:'' }), '기한 없음');
t('★ 기산 없이 일수만 있으면 그렇게 밝힌다',
  ctx.caseStageDueText({ dueDays:15, dueFrom:'' }), '15일 (기산 없음)');
t('음수는 없음', ctx.caseStageDueText({ dueDays:-5, dueFrom:'notice' }), '기한 없음');
t('문자열 일수도 읽는다', ctx.caseStageDueText({ dueDays:'10', dueFrom:'notice' }), '송달일 + 10일');
t('빈 객체', ctx.caseStageDueText({}), '기한 없음');
t('null 은 빈 문자열', ctx.caseStageDueText(null), '');

/* ═══ 4. ★ 계열 묶음 — 구분이 되는가 ═══ */
const stageSeed = (function(){
  const c = { console, Date, Math, Object, JSON, Array, String, Number, parseInt, isNaN, RegExp,
    window:{}, showToast(){}, dbGet:(k,d)=>d, dbSet:()=>true, todayYMD:()=>'2026-08-04' };
  vm.createContext(c);
  vm.runInContext(slice('var BIZ_CASE_STAGE_SEED = [', '// 기관 종류별 색'), c);
  return c.BIZ_CASE_STAGE_SEED;
})();

const G = ctx.caseStageGrouped(stageSeed);
t('★ 아홉 단계가 계열로 갈린다', G.map(g => g.line.name),
  ['노동위원회 계열','법원','산재 계열','노동청 계열']);
t('빈 묶음은 그리지 않는다', G.some(g => g.items.length === 0), false);
t('노동위원회에 2개', G[0].items.map(x => x.short), ['지노위','중노위']);
t('법원에 1개', G[1].items.map(x => x.short), ['행소']);
t('★ 산재 3개가 순서대로', G[2].items.map(x => x.short), ['요양','심사','재심']);
t('★ 노동청 3개가 순서대로', G[3].items.map(x => x.short), ['진정','조사','확정']);
t('단계 총합이 보존된다', G.reduce((s,g) => s + g.items.length, 0), stageSeed.length);
t('★ 같은 단계가 두 묶음에 겹치지 않는다', (function(){
  const seen = {};
  let dup = false;
  G.forEach(g => g.items.forEach(x => { if(seen[x.code]) dup = true; seen[x.code] = 1; }));
  return dup;
})(), false);

// 묶음마다 흐름이 머리에 적혀 있다 — 이게 없으면 순서를 알 수 없다
t('노동위원회 흐름', G[0].line.flow, '지노위 → 중노위 → 행정소송');
t('산재 흐름', G[2].line.flow, '요양신청 → 심사청구 → 재심사청구 → 행정소송');
t('노동청 흐름', G[3].line.flow, '진정·신고 → 조사·수사 → 확정·지급');
t('★ 법원이 두 계열 공용임을 밝힌다', /노동위원회·산재/.test(G[1].line.flow), true);
t('★ 묶음마다 색이 다르다', (function(){
  const bgs = G.map(g => g.line.bg);
  return new Set(bgs).size === bgs.length;
})(), true);

// 묶음 머리의 적용 유형 요약
t('★ 노동위원회 묶음 유형', G[0].types.map(c => ctx.caseTypeLabel(c, SEED_TYPES)), ['부해등','노사','징계']);
t('산재 묶음 유형', G[2].types.map(c => ctx.caseTypeLabel(c, SEED_TYPES)), ['산재등']);
t('노동청 묶음 유형', G[3].types.map(c => ctx.caseTypeLabel(c, SEED_TYPES)), ['체불','체당금']);
t('유형이 중복되지 않는다', G[0].types.length, new Set(G[0].types).size);
t('전체 유형 단계가 없으면 표시 안 함', G[0].anyAll, false);
// 적용 유형을 비운 단계가 섞이면 '전체 유형' 으로 알린다
{
  const g2 = ctx.caseStageGrouped([
    { code:'a', short:'가', orgKind:'lrc', forTypes:[], sortOrder:10 },
    { code:'b', short:'나', orgKind:'lrc', forTypes:['case-dismiss'], sortOrder:20 }
  ]);
  t('★ 전체 유형 단계를 알린다', g2[0].anyAll, true);
  t('나머지 유형도 함께 보인다', g2[0].types, ['case-dismiss']);
}
// 모르는 기관은 '그 밖의 단계' 로 흘려보낸다 (사라지지 않는다)
{
  const g3 = ctx.caseStageGrouped([
    { code:'x', short:'엑', orgKind:'없는기관', forTypes:[], sortOrder:10 },
    { code:'y', short:'와이', orgKind:'', forTypes:[], sortOrder:20 }
  ]);
  t('★ 모르는 기관도 사라지지 않는다', g3.map(g => g.line.name), ['그 밖의 단계']);
  t('★ 두 건 모두 남는다', g3[0].items.map(x => x.code), ['x','y']);
}
t('빈 목록은 빈 배열', ctx.caseStageGrouped([]), []);
t('null 도 빈 배열', ctx.caseStageGrouped(null), []);
t('null 항목이 섞여도 안 터진다', ctx.caseStageGrouped([null, { code:'z', orgKind:'lrc' }])[0].items.length, 1);
// 묶음 안 정렬은 sortOrder — 저장 순서가 뒤섞여도 흐름대로 보인다
t('★ 묶음 안은 sortOrder 순', ctx.caseStageGrouped([
  { code:'b', short:'나', orgKind:'lrc', sortOrder:20 },
  { code:'a', short:'가', orgKind:'lrc', sortOrder:10 }
])[0].items.map(x => x.short), ['가','나']);

/* ═══ 5. ★ 화면이 실제로 그려지는가 (없는 변수를 부르면 여기서 터진다) ═══ */
function renderCard(stages, savedTypes){
  const nodes = [], texts = [], titles = [], tips = [];
  let store = { biz_case_stages:stages, biz_case_types:savedTypes, cases:[] };
  const rc = {
    console, Date, Math, Object, JSON, Array, String, Number, parseInt, isNaN, RegExp,
    window:{ innerWidth:1600 }, showToast(){}, showConfirm(){ return Promise.resolve(false); },
    todayYMD(){ return '2026-08-04'; },
    dbGet(k, d){ return (k in store) ? store[k] : d; },
    dbSet(k, v){ store[k] = v; return true; },
    useState(v){ return [ (typeof v === 'function' ? v() : v), function(){} ]; },
    getCaseTypes(){ return savedTypes; },
    caseStageColor(k){
      const o = rc.CASE_STAGE_ORGS.find(x => x.v === (k||'')) || { fg:'#475569', bg:'#f1f5f9' };
      return o;
    },
    getCaseStagesAll(){ return stages; },
    BIZ_CASE_STAGE_KEY:'biz_case_stages',
    h(tag, props){
      const kids = Array.prototype.slice.call(arguments, 2);
      const node = { tag:(typeof tag === 'function' ? (tag.name||'fn') : tag), props:props||{}, kids:kids };
      nodes.push(node);
      if(props && props.title) titles.push(String(props.title));
      if(props && props['data-tip']) tips.push(String(props['data-tip']));
      kids.forEach(function walk(c){
        if(typeof c === 'string' || typeof c === 'number') texts.push(String(c));
        else if(Array.isArray(c)) c.forEach(walk);
      });
      return node;
    }
  };
  vm.createContext(rc);
  vm.runInContext(slice('var BIZ_CASE_SEED = [', 'var BIZ_CONS_SEED'), rc);
  vm.runInContext(slice('var BIZ_CASE_STAGE_SEED = [', '// 기관 종류별 색'), rc);
  vm.runInContext(slice('var CASE_STAGE_ORGS = [', '// 카테고리별 색상'), rc);
  vm.runInContext(slice('var CASE_STAGE_LINES = [', 'function BizMasters()'), rc);
  const tree = rc.CaseStageCard();
  return { tree, nodes, texts, titles, tips, all:texts.join(' | '), tipAll:tips.join(' | ') };
}

// 대표 데이터에 사건유형이 제대로 있는 경우
{
  let threw = '';
  let r = null;
  try { r = renderCard(stageSeed, SEED_TYPES); } catch(e){ threw = String(e && e.message); }
  t('★ 카드가 터지지 않고 그려진다', threw, '');
  if(!r){ console.log('렌더 실패 — 이후 검사 생략'); process.exit(1); }
  t('네 묶음 이름이 다 보인다',
    ['노동위원회 계열','법원','산재 계열','노동청 계열'].every(n => r.all.indexOf(n) >= 0), true);
  t('흐름이 보인다', r.all.indexOf('지노위 → 중노위 → 행정소송') >= 0, true);
  t('★ 화면 어디에도 case- 코드가 없다', /case-[a-z]/.test(r.all), false);
  t('★ 한글 유형 이름이 보인다',
    ['부해등','노사','징계','산재등','체불','체당금'].every(n => r.all.indexOf(n) >= 0), true);
  t('기한이 한 칸으로 요약된다', r.all.indexOf('송달일 + 10일') >= 0, true);
  t('★ 확인 안 된 기한을 알린다', r.all.indexOf('확인 필요') >= 0, true);
  t('기한 없는 단계도 표시', r.all.indexOf('기한 없음') >= 0, true);
  t('★ 접힌 상태에선 입력칸이 없다', r.nodes.filter(n => n.tag === 'input').length, 2);  // 아래 추가폼 2개뿐
  t('★ 단계마다 ✏ 가 있다', r.nodes.filter(n => n.kids[0] === '✏').length, stageSeed.length);
  t('삭제 버튼도 단계마다', r.nodes.filter(n => n.kids[0] === '×').length, stageSeed.length);
  t('묶음이 접기 대상이 아니라 항상 보인다', r.all.indexOf('항목 없음') >= 0, false);
  t('없는 유형 경고가 뜨지 않는다', /사건유형 목록에 없는 코드/.test(r.tipAll), false);
}
// ★ 지금 대표 화면에서 코드가 나오던 상황 — 저장된 사건유형이 시드와 다른 경우
{
  const otherTypes = [
    { code:'t-aaa', short:'부해', name:'부당해고' },
    { code:'t-bbb', short:'산재', name:'산업재해' }
  ];
  const r = renderCard(stageSeed, otherTypes);
  t('★ 유형 코드가 달라도 영문이 안 나온다', /case-[a-z]/.test(r.all), false);
  t('★ 시드 한글 이름으로 대신 보여준다', r.all.indexOf('부해등') >= 0, true);
  t('★ 걸리지 않는 유형임을 알린다', /사건유형 목록에 없는 코드/.test(r.tipAll), true);
  t('★ 경고 표시가 붙는다', r.all.indexOf('⚠') >= 0, true);
  // 유형 드롭다운은 ✏ 로 펼쳤을 때만 있다 — 대표가 만든 유형이 거기 나와야 고칠 수 있다
  const ro = renderCardOpen(stageSeed, otherTypes, 'lrc-local');
  t('★ 대표의 유형이 펼친 칸의 드롭다운에 나온다',
    ro.nodes.some(n => n.tag === 'option' && n.kids[0] === '부당해고'), true);
  t('★ 펼쳐도 영문 코드가 안 나온다', /case-[a-z]/.test(ro.all), false);
  t('없는 유형 칩에 경고가 붙는다', ro.all.indexOf('⚠') >= 0, true);
}
// 펼쳤을 때만 편집 칸이 나온다
{
  const r = renderCardOpen(stageSeed, SEED_TYPES, 'lrc-local');
  t('★ 펼치면 입력칸이 생긴다', r.nodes.filter(n => n.tag === 'input').length > 2, true);
  t('펼친 단계에 확인함 스위치', r.all.indexOf('법정 기한 확인함') >= 0, true);
  t('★ 달력일 기준임을 밝힌다', r.all.indexOf('달력일 기준') >= 0, true);
  t('기산 선택칸이 한글', ['기산 없음','송달일부터','판정일부터'].every(n => r.all.indexOf(n) >= 0), true);
  t('적용 유형 편집칸', r.all.indexOf('적용 유형') >= 0, true);
  t('★ 펼친 줄은 접기 버튼으로 바뀐다', r.nodes.filter(n => n.kids[0] === '▲').length, 1);
  t('나머지는 ✏ 그대로', r.nodes.filter(n => n.kids[0] === '✏').length, stageSeed.length - 1);
}
function renderCardOpen(stages, savedTypes, openCode){
  // useState 를 두 번째 호출(editCode)에만 openCode 를 돌려주게 바꿔 펼친 상태를 만든다
  const orig = src;
  const nodes = [], texts = [];
  let store = { biz_case_stages:stages, biz_case_types:savedTypes, cases:[] };
  let nth = 0;
  const rc = {
    console, Date, Math, Object, JSON, Array, String, Number, parseInt, isNaN, RegExp,
    window:{ innerWidth:1600 }, showToast(){}, showConfirm(){ return Promise.resolve(false); },
    todayYMD(){ return '2026-08-04'; },
    dbGet(k, d){ return (k in store) ? store[k] : d; },
    dbSet(k, v){ store[k] = v; return true; },
    useState(v){
      nth++;
      // CaseStageCard 의 네 번째 useState 가 editCode (list, nameIn, shortIn, orgIn, editCode)
      if(nth === 5) return [ openCode, function(){} ];
      return [ (typeof v === 'function' ? v() : v), function(){} ];
    },
    getCaseTypes(){ return savedTypes; },
    caseStageColor(k){ return rc.CASE_STAGE_ORGS.find(x => x.v === (k||'')) || { fg:'#475569', bg:'#f1f5f9' }; },
    getCaseStagesAll(){ return stages; },
    BIZ_CASE_STAGE_KEY:'biz_case_stages',
    h(tag, props){
      const kids = Array.prototype.slice.call(arguments, 2);
      const node = { tag:(typeof tag === 'function' ? (tag.name||'fn') : tag), props:props||{}, kids:kids };
      nodes.push(node);
      kids.forEach(function walk(c){
        if(typeof c === 'string' || typeof c === 'number') texts.push(String(c));
        else if(Array.isArray(c)) c.forEach(walk);
      });
      return node;
    }
  };
  vm.createContext(rc);
  vm.runInContext(slice('var BIZ_CASE_SEED = [', 'var BIZ_CONS_SEED'), rc);
  vm.runInContext(slice('var BIZ_CASE_STAGE_SEED = [', '// 기관 종류별 색'), rc);
  vm.runInContext(slice('var CASE_STAGE_ORGS = [', '// 카테고리별 색상'), rc);
  vm.runInContext(slice('var CASE_STAGE_LINES = [', 'function BizMasters()'), rc);
  rc.CaseStageCard();
  return { nodes, texts, all:texts.join(' | ') };
}

/* ═══ 6. 배선 ═══ */
t('묶음 함수를 밖에서 쓸 수 있다', /window\.caseStageGrouped\s*=/.test(src), true);
t('유형 이름 함수도', /window\.caseTypeLabel\s*=/.test(src), true);
t('★ 카드가 묶음 함수를 실제로 쓴다', /caseStageGrouped\(list\)\.map/.test(src), true);
t('★ 유형 칩이 한글 함수를 쓴다', /caseTypeLabel\(tc, caseTypes\)/.test(src), true);
t('★ 없는 유형을 표시한다', /caseTypeMissing\(tc, caseTypes\)/.test(src), true);
t('★ 옛 두 줄 배치가 사라졌다', /'적용 유형'\),\s*[\r\n]+\s*\(x\.forTypes\|\|\[\]\)\.length === 0/.test(
  src.slice(src.indexOf('function CaseStageCard'), src.indexOf('function BizMasters'))
  .replace(/open \? h\('div'[\s\S]*/, '')), false);
t('안내에 계열로 묶었다고 적혀 있다', /기관 계열로 묶어 두었습니다/.test(src), true);
t('안내가 ✏ 를 가리킨다', /고칠 때는 ✏ 를 누르세요/.test(src), true);

console.log('\n  === ' + pass + ' 통과 / ' + fail + ' 실패 ===');
process.exit(fail ? 1 : 0);
