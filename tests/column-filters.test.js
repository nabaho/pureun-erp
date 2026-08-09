/* 엑셀식 열 거르기 — 거래내역 표 · 나이스빌 CMS 표가 같은 부품을 쓴다
   대표 요청: "엑셀의 필터링 기능 넣을 수 있나?" · "캡쳐2에도 넣을 수 있나?"
   지켜야 할 것:
   ① 거름은 화면에만 — 처리는 «보이는 줄» 에만 돌고, 단추 글자에 그 사실이 적힌다
   ② 값이 많은 열은 잘라 그리되 «잘랐다» 고 말한다 (444곳을 다 그리면 창이 멈춘다)
   ③ 새로고침하면 풀린다 (기억하지 않는다 — 켜둔 걸 잊고 「왜 안 보이지」 하는 사고 방지)
   ④ CMS 묶음 머리의 건수·합계는 «거른 뒤» 로 다시 센다 */
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const HTML = path.join(__dirname, '..', 'pu-erp.html');
const src = fs.readFileSync(HTML, 'utf8').replace(/\r\n/g, '\n');

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

/* ══════ ① 셈 — 순수 함수 ══════ */
const ctx = { console, Object, JSON, Array, String, Number, parseInt, isNaN, Math };
vm.createContext(ctx);
vm.runInContext(slice('function erpColValues(rows, getVal, q, cap){', '\nif(typeof window !== \'undefined\'){\n  window.erpColValues'), ctx);

const ROWS = [
  { co:'노리시스템', staff:'박한별', amt:330000 },
  { co:'팔천식품',   staff:'최기운', amt:165000 },
  { co:'노리시스템', staff:'박한별', amt:330000 },
  { co:'중원공영',   staff:'박한별', amt:110000 },
  { co:'',           staff:'',       amt:10000  }
];
const byCo    = function(r){ return r.co; };
const byStaff = function(r){ return r.staff; };

const V = ctx.erpColValues(ROWS, byCo, '', 200);
// 많은 것부터, 건수가 같으면 이름 가나다순(중원 < 팔천), 「(없음)」은 늘 맨 아래
t('값마다 건수를 센다', V.list.map(function(x){ return x.v + ':' + x.n; }),
  ['노리시스템:2', '중원공영:1', '팔천식품:1', '(없음):1']);
t('많은 것부터 선다', V.list[0].v, '노리시스템');
t('건수가 같으면 이름순', [V.list[1].v, V.list[2].v], ['중원공영', '팔천식품']);
t('★ 빈 값은 「(없음)」 으로 맨 아래', V.list[V.list.length - 1].v, '(없음)');
t('몇 가지인지 알려 준다', V.total, 4);

const V2 = ctx.erpColValues(ROWS, byCo, '노리', 200);
t('찾기로 좁힌다', V2.list.map(function(x){ return x.v; }), ['노리시스템']);
const V3 = ctx.erpColValues(ROWS, byCo, '', 2);
t('★ 많으면 잘라 그린다', V3.list.length, 2);
t('★ 몇 가지를 잘랐는지 알려 준다', V3.more, 2);
t('빈 목록도 안 터진다', ctx.erpColValues(null, byCo, '', 200).total, 0);

vm.runInContext(slice('function erpApplyColFilters(rows, filters, cols){', '\n/* 켜진 거름이 몇 개인가'), ctx);
vm.runInContext(slice('function erpColFilterCount(filters){', '\n/* 한 값을 켜고 끈다'), ctx);
vm.runInContext(slice('function erpToggleColFilter(filters, col, value){', '\nif(typeof window'), ctx);

const COLS = { co:byCo, staff:byStaff };
t('거름이 없으면 다 보인다', ctx.erpApplyColFilters(ROWS, {}, COLS).length, 5);
t('한 열로 거른다', ctx.erpApplyColFilters(ROWS, { co:{ '노리시스템':1 } }, COLS).length, 2);
t('두 열은 «둘 다» 맞아야 한다',
  ctx.erpApplyColFilters(ROWS, { co:{ '노리시스템':1 }, staff:{ '최기운':1 } }, COLS).length, 0);
t('한 열에 여러 값은 «어느 하나»',
  ctx.erpApplyColFilters(ROWS, { co:{ '노리시스템':1, '팔천식품':1 } }, COLS).length, 3);
t('★ 빈 값도 「(없음)」 으로 거를 수 있다',
  ctx.erpApplyColFilters(ROWS, { co:{ '(없음)':1 } }, COLS).length, 1);
t('★ 켜진 값이 없는 열은 안 거른다', ctx.erpApplyColFilters(ROWS, { co:{} }, COLS).length, 5);
t('모르는 열은 무시한다', ctx.erpApplyColFilters(ROWS, { 없는열:{ 'x':1 } }, COLS).length, 5);
t('원본을 건드리지 않는다', ROWS.length, 5);

t('켜진 열 수를 센다', ctx.erpColFilterCount({ co:{ a:1 }, staff:{} }), 1);
t('빈 값도 안 터진다', ctx.erpColFilterCount(null), 0);

const F1 = ctx.erpToggleColFilter({}, 'co', '노리시스템');
t('켜면 들어간다', F1.co['노리시스템'], 1);
const F2 = ctx.erpToggleColFilter(F1, 'co', '노리시스템');
t('★ 다시 누르면 꺼지고 그 열이 비면 열째로 지운다', F2.co, undefined);
t('★ 새 객체를 돌려준다 (그대로 고치면 화면이 다시 안 그려진다)', F1 === F2, false);

/* ══════ ② 거래내역 표에 붙었는가 ══════ */
const FL = slice('function FinanceLedger(){', '\nfunction FinanceIncome');
t('값 꺼내는 법을 한 곳에 모았다', /var LD_COLS = \{/.test(FL), true);
['state', 'memo', 'co', 'kind', 'staff'].forEach(function(c){
  t('거래내역 ' + c + ' 열을 거를 수 있다', new RegExp("colFilterTh\\('" + c + "'").test(FL), true);
});
t('거르기 전 목록을 따로 둔다 (목록 만들 때 쓴다)', /var incAllRows = incList;/.test(FL), true);
t('실제로 거른다', /incList = erpApplyColFilters\(incList, colF, LD_COLS\);/.test(FL), true);
t('★ 처리도 보이는 줄에만', /readyRows = readyRows\.filter\(function\(r\)\{ return _vis\[r\.row\._k\]; \}\);/.test(FL), true);
t('몇 건 보이는지 알린다', /'⛃ 거름 '\+colFn\+'개 · '\+incList\.length\+'건 보임'/.test(FL), true);
t('모두 지우는 길이 있다', /onClick:function\(\)\{ setColF\(\{\}\); \}/.test(FL), true);
t('걸린 열은 머리줄이 색으로 표시된다', /on \? \{ background:'#eff6ff', color:'#2563eb' \} : \{\}/.test(FL), true);
t('rowInfo 를 그대로 쓴다 (거르느라 다시 계산하지 않는다)', /var i=rowInfo\[r\._k\]/.test(FL), true);

/* ══════ ③ 나이스빌 표에도 붙었는가 ══════ */
t('나이스빌 값 꺼내는 법도 있다', /var NB_COLS = \{/.test(FL), true);
['wdate', 'setdate', 'name', 'status', 'ymbase', 'todo'].forEach(function(c){
  t('나이스빌 ' + c + ' 열을 거를 수 있다', new RegExp("nbFilterTh\\('" + c + "'").test(FL), true);
});
t('★ NB_COLS 가 nbOkLinked 보다 앞에 있다 (뒤면 undefined 라 터진다)',
  FL.indexOf('var NB_COLS = {') < FL.indexOf('var nbOkLinked ='), true);
t('★ 입금표시도 보이는 줄에만',
  /var nbOkLinked = nb \? erpApplyColFilters\(nb\.rows, nbF, NB_COLS\)/.test(FL), true);
t('단추 글자에 그 사실을 적는다', /\(nbFn>0\?' \(보이는 것만\)':''\)/.test(FL), true);
t('표도 거른다', /list = erpApplyColFilters\(list, nbF, NB_COLS\);/.test(FL), true);
t('★ 묶음 머리 건수·합계를 거른 뒤로 다시 센다', /var _gok=0, _gfail=0, _gpend=0, _gamt=0;/.test(FL), true);
// 세어 놓고 안 쓰면 뜻이 없다 — 머리줄이 그 값을 쓰는지까지 본다
t('★ 머리줄이 다시 센 값을 쓴다',
  /\+ \(_gok \? ' · 출금성공 '\+_gok\+'건 합계 '\+_gamt\.toLocaleString\(\)\+'원' : ''\)/.test(FL), true);
t('★ 거르기 전 값을 쓰지 않는다', /g\.ok \? ' · 출금성공 '\+g\.ok\+'건 합계 '/.test(FL), false);
t('실패·진행 수도 다시 센 값', /\+ \(_gfail \? ' · 실패 '\+_gfail\+'건' : ''\)/.test(FL), true);
t('거른 뒤라고 적어 준다', /\(nbFn>0 \? ' · 거른 뒤' : ''\)/.test(FL), true);
t('나이스빌도 거름 지우는 길이 있다', /onClick:function\(\)\{ setNbF\(\{\}\); \}/.test(FL), true);

/* ══════ ④ 창 — 두 표가 같은 부품을 쓴다 ══════ */
const POP = slice('function ErpColFilterPopup(props){', '\nfunction FinanceLedger(){');
t('창이 하나뿐이다', (src.match(/function ErpColFilterPopup\(props\)\{/g) || []).length, 1);
t('찾기 상자가 있다', /placeholder:'찾기'/.test(POP), true);
t('전체·해제가 있다', /'전체'\)/.test(POP) && /'해제'\)/.test(POP), true);
t('이 열만 지우는 길이 있다', /'이 열 지우기'/.test(POP), true);
t('★ 잘렸으면 잘렸다고 말한다', /'… 외 ' \+ vals\.more \+ '가지 — 찾기로 좁혀 보세요'/.test(POP), true);
t('바깥을 누르면 닫힌다', /if\(e\.target === e\.currentTarget\) props\.onClose\(\)/.test(POP), true);
t('화면 밖으로 나가지 않게 막는다', /\(window\.innerWidth \|\| 1200\) - 262/.test(FL), true);
t('두 표가 같은 창을 연다', /var isNb = colPop\.scope === 'nb';/.test(FL), true);

/* ══════ ⑤ 기억하지 않는다 ══════ */
t('★ 거름을 저장소에 남기지 않는다', /usePersistedState\('ledger_colf/.test(src), false);
t('거름은 화면 상태로만 둔다', /var colFS=useState\(\{\}\);/.test(FL), true);
t('나이스빌도 마찬가지', /var nbFS=useState\(\{\}\);/.test(FL), true);

console.log('\n  === ' + pass + ' 통과 / ' + fail + ' 실패 ===');
process.exit(fail ? 1 : 0);
