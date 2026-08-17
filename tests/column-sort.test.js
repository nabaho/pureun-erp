/* 제목 클릭 정렬 — 거래내역 표 · 나이스빌 CMS 표가 같은 부품을 쓴다
   대표 지시: "이런 필터 말고 제목클릭으로 위아래 정렬하는 방식으로 해라 체크 방식 말고".
   지켜야 할 것:
   ① 한 번 오름 ▲ → 다시 내림 ▼ → 한 번 더 원래 순서
   ② 흔들리지 않는 정렬(stable) — 값이 같으면 원래 순서를 지킨다
   ③ 빈 값은 어느 쪽으로 세우든 늘 맨 아래
   ④ 숫자는 숫자로, 글자는 한국어 순서로
   ⑤ 정렬은 줄을 «감추지 않는다» — 확정·입금표시 대상은 그대로 (거르기와 다른 점) */
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
vm.runInContext(slice('function erpNextSort(cur, col){', '\nif(typeof window !== \'undefined\'){\n  window.erpNextSort'), ctx);

/* 누를 때마다 도는 차례 */
t('처음 누르면 오름차순', ctx.erpNextSort(null, 'co'), { col:'co', dir:'asc' });
t('다시 누르면 내림차순', ctx.erpNextSort({ col:'co', dir:'asc' }, 'co'), { col:'co', dir:'desc' });
t('★ 한 번 더 누르면 원래 순서', ctx.erpNextSort({ col:'co', dir:'desc' }, 'co'), null);
t('다른 열을 누르면 그 열 오름차순부터',
  ctx.erpNextSort({ col:'co', dir:'desc' }, 'staff'), { col:'staff', dir:'asc' });

/* 정렬 */
/* 금액은 «글자로 견주면 틀리는» 값으로 골랐다 —
   숫자로는 3 < 20 < 100 인데 글자로는 "100" < "20" < "3" 이다. */
const R = [
  { n:'다', a:3,  i:0 },
  { n:'가', a:20, i:1 },
  { n:'나', a:20, i:2 },
  { n:'',   a:100,i:3 },
  { n:'라', a:20, i:4 }
];
const byN = function(r){ return r.n; };
const byA = function(r){ return r.a; };

t('오름차순 (한국어 순서)', ctx.erpSortRows(R, byN, 'asc').map(byN), ['가','나','다','라','']);
t('내림차순', ctx.erpSortRows(R, byN, 'desc').map(byN), ['라','다','나','가','']);
t('★ 빈 값은 내림차순에서도 맨 아래', ctx.erpSortRows(R, byN, 'desc').map(byN).pop(), '');
t('★ 안 세우면 원래 순서 그대로', ctx.erpSortRows(R, byN, null).map(byN), ['다','가','나','','라']);

// 글자로 견주면 "100","20","3" 이 되므로 이 줄이 숫자 견주기를 지켜 준다
t('★ 숫자는 숫자로 (3 < 20 < 100)', ctx.erpSortRows(R, byA, 'asc').map(byA), [3,20,20,20,100]);
t('★ 값이 같으면 원래 순서를 지킨다 (흔들리지 않는 정렬)',
  ctx.erpSortRows(R, byA, 'asc').filter(function(r){ return r.a === 20; }).map(function(r){ return r.i; }),
  [1, 2, 4]);
t('내림차순에서도 같은 값은 원래 순서',
  ctx.erpSortRows(R, byA, 'desc').filter(function(r){ return r.a === 20; }).map(function(r){ return r.i; }),
  [1, 2, 4]);
/* 흔들리지 않는 정렬은 요즘 브라우저가 이미 보장하지만, 순서 열쇠(i)를 명시해 두면
   견주는 값이 바뀌어도 안 흔들린다 — 코드에 그것이 있는지도 함께 못 박는다. */
const SORTFN = slice('function erpSortRows(rows, getVal, dir){', '\n/* 머리줄에 붙는 표시');
t('★ 원래 순서를 열쇠로 들고 다닌다', /keyed = arr\.map\(function\(r, i\)\{ return \{ r:r, i:i, v:getVal\(r\) \}; \}\);/.test(SORTFN), true);
t('★ 같으면 그 열쇠로 되짚는다', /return a\.i - b\.i;                             \/\/ 같으면 원래 순서/.test(SORTFN), true);

t('★ 원본을 건드리지 않는다', (function(){
  var before = R.map(byN).join(',');
  ctx.erpSortRows(R, byN, 'asc');
  return R.map(byN).join(',') === before;
})(), true);
t('원본을 복사해서 다룬다', /var arr = \(rows \|\| \[\]\)\.slice\(\);/.test(SORTFN), true);
t('빈 목록도 안 터진다', ctx.erpSortRows(null, byN, 'asc').length, 0);

/* 머리줄 표시 */
t('안 세운 열은 ↕', ctx.erpSortMark(null, 'co'), '↕');
t('오름차순은 ▲', ctx.erpSortMark({ col:'co', dir:'asc' }, 'co'), '▲');
t('내림차순은 ▼', ctx.erpSortMark({ col:'co', dir:'desc' }, 'co'), '▼');
t('다른 열은 ↕', ctx.erpSortMark({ col:'co', dir:'asc' }, 'staff'), '↕');

/* ══════ ② 거래내역 표 ══════ */
const FL = slice('function FinanceLedger(', '\nfunction FinanceIncome');
t('정렬 상태를 둔다', /var ldSort=ldSortS\[0\]/.test(FL), true);
t('값 꺼내는 법을 한 곳에 모았다', /var LD_SORT = \{/.test(FL), true);
['state','amount','date','memo','co','kind','staff'].forEach(function(c){
  t('거래내역 ' + c + ' 열로 세울 수 있다', new RegExp("colSortTh\\('" + c + "'").test(FL), true);
});
t('실제로 세운다', /if\(ldSort && LD_SORT\[ldSort\.col\]\) incList = erpSortRows\(incList, LD_SORT\[ldSort\.col\], ldSort\.dir\);/.test(FL), true);
t('누르면 차례가 돈다', /setLdSort\(erpNextSort\(ldSort, col\)\)/.test(FL), true);
t('머리줄에 ▲▼ 를 붙인다', /erpSortMark\(ldSort, col\)/.test(FL), true);
t('세운 열은 색으로도 표시', /on \? \{ background:'#eff6ff', color:'#2563eb' \} : \{\}/.test(FL), true);
// 세웠을 때만 나온다 — 늘 떠 있으면 안 세운 상태에서도 눌러야 하나 헷갈린다
t('원래 순서로 돌아가는 길', /ldSort && h\('button',\{onClick:function\(\)\{ setLdSort\(null\); \}/.test(FL), true);
// 상태는 글자 순이 아니라 일하는 순서
t('★ 상태는 일하는 순서로 센다', /\(\{ready:1, check:2, none:3, done:4\}\)\[i\.st\.state\]/.test(FL), true);
t('금액은 숫자로', /amount:function\(r\)\{ return parseInt\(r\.amount,10\)\|\|0; \}/.test(FL), true);
t('rowInfo 를 그대로 쓴다 (정렬하느라 다시 계산하지 않는다)', /var i=rowInfo\[r\._k\]/.test(FL), true);

/* ══════ ③ 나이스빌 표 ══════ */
t('나이스빌 정렬 상태를 둔다', /var nbSort=nbSortS\[0\]/.test(FL), true);
t('나이스빌 값 꺼내는 법', /var NB_SORT = \{/.test(FL), true);
['wdate','setdate','name','amount','status','ymbase','todo'].forEach(function(c){
  t('나이스빌 ' + c + ' 열로 세울 수 있다', new RegExp("nbSortTh\\('" + c + "'").test(FL), true);
});
t('★ 묶음 안에서 세운다 (정산예정일 묶음 자체는 그대로)',
  /if\(nbSort && NB_SORT\[nbSort\.col\]\) list = erpSortRows\(list, NB_SORT\[nbSort\.col\], nbSort\.dir\);/.test(FL), true);
t('★ 상태는 손볼 것부터 (실패 → 진행 → 성공)',
  /status:  function\(r\)\{ return r\.status==='fail' \? 1 : r\.status==='ok' \? 3 : 2; \}/.test(FL), true);
t('나이스빌도 원래 순서로 돌아가는 길', /onClick:function\(\)\{ setNbSort\(null\); \}/.test(FL), true);

/* ══════ ④ 정렬은 줄을 감추지 않는다 ══════ */
t('★ 입금표시 대상이 그대로다',
  /var nbOkLinked = nb \? nb\.rows\.filter\(function\(r\)\{ return r\.status==='ok' && r\.co; \}\) : \[\];/.test(FL), true);
t('★ 확정 대상을 줄이지 않는다', /readyRows = readyRows\.filter\(function\(r\)\{ return _vis\[r\.row\._k\]; \}\);/.test(FL), false);

/* ══════ ⑤ 체크 거르기는 걷어냈다 ══════ */
t('거르기 창이 없다', /function ErpColFilterPopup/.test(src), false);
t('거르기 셈이 없다', /function erpApplyColFilters/.test(src), false);
t('값 세기도 없다', /function erpColValues/.test(src), false);
t('거르기 상태도 없다', /var colF=colFS\[0\]/.test(src), false);
t('머리줄 ▾ 도 없다', /colFilterTh\(/.test(src), false);
t('나이스빌 ▾ 도 없다', /nbFilterTh\(/.test(src), false);

console.log('\n  === ' + pass + ' 통과 / ' + fail + ' 실패 ===');
process.exit(fail ? 1 : 0);
