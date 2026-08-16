/* 「지난번처럼 나눠담기」
   (2026-08-09) 비즈사업비 2,100,000원은 달마다 같은 네 곳으로 갈라진다.
   그런데 한 입금이 «여러 곳» 으로 나뉘는 것이라 적요→업체 학습(1:1)이 못 잡아,
   매달 손으로 처음부터 다시 골랐다 —「후보 없음 39건」의 큰 몫.
   한 번 나눈 내용을 적어 두었다가 되풀이한다. 단, 곧바로 확정하지는 «않는다». */
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'pu-erp.html'), 'utf8').replace(/\r\n/g, '\n');

let pass = 0, fail = 0;
function t(name, got, want){
  const G = JSON.stringify(got), W = JSON.stringify(want);
  if(G === W){ pass++; console.log('  PASS ' + name + '  (' + G + ')'); }
  else { fail++; console.log('  FAIL ' + name + '\n    받음 ' + G + '\n    기대 ' + W); }
}

/* 순수함수를 실제로 돌려본다. erpNormName·erpCleanMemo 도 함께 들여온다 —
   적요 열쇠가 그 둘에 기대므로 흉내로 대신하면 진짜 동작을 못 지킨다. */
const vm = require('vm');
const ctx = { console:console };
ctx.window = ctx;
vm.createContext(ctx);
const grab = (from, to) => src.slice(src.indexOf(from), src.indexOf(to));
vm.runInContext(grab('function erpNormName(', 'function erpIsClinicItem('), ctx);
vm.runInContext(grab('var SPLIT_RECIPE_KEY =', 'if(typeof window !== \'undefined\'){\n  window.erpRecipeKey'), ctx);

console.log('\n[① 적요가 열쇠 — 달마다 그대로 찍히는 글자]');
t('같은 적요는 같은 열쇠', ctx.erpRecipeKey('비즈사업비2건') === ctx.erpRecipeKey('비즈사업비2건'), true);
t('띄어쓰기가 달라도 같은 열쇠',
  ctx.erpRecipeKey('비즈 사업비 2건') === ctx.erpRecipeKey('비즈사업비2건'), true);
t('다른 적요는 다른 열쇠',
  ctx.erpRecipeKey('비즈사업비2건') === ctx.erpRecipeKey('더빌이체3572'), false);
t('빈 적요는 열쇠가 없다 (다음에 알아볼 길이 없다)', ctx.erpRecipeKey(''), '');
t('없는 값도 안 터진다', ctx.erpRecipeKey(null), '');

console.log('\n[② 기억할 꼴 — 후보 번호가 아니라 업체·항목으로 적는다]');
/* 후보 번호(id)는 달마다 새로 생긴다. 번호로 적어 두면 다음 달엔 아무것도 못 찾는다. */
const row = { memo:'비즈사업비2건', amount:2100000, date:'2026-07-14' };
const parts = [
  { co:'중원대학교',       label:'착수금', store:'cases',        amount:600000 },
  { co:'충남사회서비스원', label:'자문료', store:'companies',    amount:500000 },
  { co:'청아미즈산부인과', label:'컨설팅', store:'consultings',  amount:600000 },
  { co:'(주)토탈방재',     label:'착수금', store:'cases',        amount:400000 }
];
const rec = ctx.erpMakeRecipe(row, parts);
t('네 곳을 적었다', rec.parts.length, 4);
t('업체 이름을 적는다', rec.parts[0].co, '중원대학교');
t('항목도 적는다 (같은 업체에 건이 여럿일 수 있다)', rec.parts[0].label, '착수금');
t('금액도 적는다', rec.parts[0].amount, 600000);
t('그때 입금액을 적어 둔다 (금액이 다르면 알려야 한다)', rec.amount, 2100000);
t('후보 번호는 적지 않는다', 'id' in rec.parts[0], false);
t('빈 목록이면 기억하지 않는다', ctx.erpMakeRecipe(row, []), null);
t('업체 이름이 없는 조각은 버린다', ctx.erpMakeRecipe(row, [{ label:'착수금', amount:1 }]), null);
t('적요가 없으면 기억하지 않는다 (열쇠가 없다)',
  ctx.erpMakeRecipe({ memo:'', amount:100 }, parts), null);

console.log('\n[③ 목록에 넣기 — 가장 최근을 믿는다]');
let list = ctx.erpPutRecipe([], rec);
t('하나 들어갔다', list.length, 1);
const rec2 = ctx.erpMakeRecipe(row, parts.slice(0, 2));
list = ctx.erpPutRecipe(list, rec2);
t('★ 같은 적요·같은 금액이면 갈아 끼운다 (쌓이면 어느 것이 맞는지 모른다)', list.length, 1);
t('새것이 남았다', list[0].parts.length, 2);
const recSmall = ctx.erpMakeRecipe({ memo:'비즈사업비2건', amount:210000 }, parts.slice(0, 1));
list = ctx.erpPutRecipe(list, recSmall);
t('★ 같은 적요라도 금액이 다르면 따로 쌓는다 (2,100,000과 210,000은 나누는 곳이 다르다)', list.length, 2);
t('빈 기억은 넣지 않는다', ctx.erpPutRecipe(list, null).length, 2);

console.log('\n[④ 찾기 — 금액까지 같은 것을 먼저]');
const both = [rec, recSmall];
t('금액까지 같으면 딱 맞다고 알린다',
  ctx.erpFindRecipe(both, { memo:'비즈사업비2건', amount:2100000 }).exact, true);
t('그 금액의 기억을 준다',
  ctx.erpFindRecipe(both, { memo:'비즈사업비2건', amount:210000 }).parts.length, 1);
t('금액이 다르면 다르다고 알리고 내준다 (업체만이라도 맞으면 낫다)',
  ctx.erpFindRecipe(both, { memo:'비즈사업비2건', amount:999999 }).exact, false);
t('모르는 적요는 기억이 없다',
  ctx.erpFindRecipe(both, { memo:'노리시스템(주)', amount:330000 }), null);
t('적요가 비면 기억이 없다', ctx.erpFindRecipe(both, { memo:'', amount:1 }), null);
t('조각이 없는 기억은 내주지 않는다',
  ctx.erpFindRecipe([{ key:ctx.erpRecipeKey('비즈사업비2건'), parts:[] }], { memo:'비즈사업비2건', amount:1 }), null);

console.log('\n[⑤ 기억한 업체를 지금 후보에서 다시 찾는다]');
/* ★ 「잔금」을 «먼저» 둔다 — 항목을 안 보고 첫 것을 집으면 착수금 자리에 잔금이 들어간다.
   순서를 뒤집어 두지 않으면 항목을 보든 안 보든 같은 답이 나와 검사가 아무것도 못 지킨다. */
const pend = [
  { id:'p2', companyName:'중원대학교',       label:'잔금'   },
  { id:'p1', companyName:'중원대학교',       label:'착수금' },
  { id:'p3', companyName:'충남사회서비스원', label:'자문료' },
  { id:'p4', companyName:'청아미즈산부인과', label:'컨설팅' }
];
const m = ctx.erpMatchRecipe(rec, pend);
t('세 곳을 찾았다', m.found.length, 3);
t('★ 항목까지 맞는 후보를 고른다 (같은 업체에 착수금·잔금이 둘 다 있다)', m.found[0].id, 'p1');
t('기억한 금액을 그대로 들고 온다', m.found[0].amount, 600000);
t('★ 못 찾은 곳을 «못 찾았다고» 돌려준다 (조용히 빼면 모자란 채로 확정한다)', m.missing.length, 1);
t('못 찾은 곳의 이름을 남긴다', m.missing[0].co, '(주)토탈방재');
/* 같은 업체가 기억에 두 번 있으면(착수금·잔금) 후보도 «서로 다른 두 건» 이어야 한다.
   한 후보를 두 번 담으면 같은 건에 돈이 두 번 들어간 것으로 적힌다. */
t('한 후보를 두 번 담지 않는다 (서로 다른 건으로 간다)',
  ctx.erpMatchRecipe(ctx.erpMakeRecipe(row, [parts[0], parts[0]]), pend).found.map(function(f){ return f.id; }),
  ['p1', 'p2']);
t('그 업체 후보가 하나뿐이면 나머지는 못 찾은 것으로 남긴다',
  ctx.erpMatchRecipe(ctx.erpMakeRecipe(row, [parts[0], parts[0]]),
    [{ id:'p1', companyName:'중원대학교', label:'착수금' }]).missing.length, 1);
t('항목이 안 맞아도 이름이 맞으면 쓴다 (항목 이름은 바뀔 수 있다)',
  ctx.erpMatchRecipe(ctx.erpMakeRecipe(row, [{ co:'중원대학교', label:'없는항목', amount:1 }]), pend).found.length, 1);
t('후보가 하나도 없으면 전부 못 찾은 것', ctx.erpMatchRecipe(rec, []).missing.length, 4);

console.log('\n[⑥ 화면 — 곧바로 확정하지 않는다]');
/* 금액이 달라졌을 수도, 없어진 업체가 있을 수도 있다(대표 선택: "창이 채워진 채 열림") */
const OPEN = grab('function openRecipe(row, rec){', '/* 보류함은 저장소가 진짜다');
t('openRecipe 구역을 잘라냈다', OPEN.length > 200 && OPEN.length < 1200, true);
t('창을 연다', /setSpOpen\(row\._k\)/.test(OPEN), true);
t('찾은 곳을 미리 담아 둔다', /m\.found\.forEach\(function\(f\)\{ sel\[f\.id\] = f\.amount; \}\)/.test(OPEN), true);
t('★ 여기서 저장(saveIncome)하지 않는다 — 사람이 보고 확정한다',
  /saveIncome/.test(OPEN), false);
t('못 찾은 곳을 창에 넘긴다', /missing:m\.missing/.test(OPEN), true);
t('금액이 같은지도 넘긴다', /exact:!!rec\.exact/.test(OPEN), true);

console.log('\n[⑦ 창의 안내 — 못 찾은 곳을 반드시 알린다]');
t('몇 곳을 채웠는지 적는다', /지난번 나눈 대로 '\+spRecipe\.found\+'곳을 채웠습니다/.test(src), true);
t('못 찾은 곳의 이름을 적는다',
  /spRecipe\.missing\.map\(function\(m\)\{ return m\.co; \}\)\.join\(', '\)/.test(src), true);
t('금액이 다르면 지난번 금액을 적는다', /지난번 입금액은 '\+\(\(spRecipe\.rec\.amount\)\|\|0\)/.test(src), true);
t('창을 닫으면 안내도 치운다', /setSpKind\(''\);setSpRecipe\(null\);/.test(src), true);

console.log('\n[⑧ 확정하면 기억한다]');
const SAVE = grab('/* ── 나눈 내용을 기억해 둔다', '// 묶은 통장 행은 «하나도 빠짐없이»');
t('기억 저장 구역을 잘라냈다', SAVE.length > 400 && SAVE.length < 1800, true);
t('★ 묶어서 처리(통장 여러 행)는 기억하지 않는다 — 다음 달 같은 꼴로 들어온다는 보장이 없다',
  /if\(!manyIn && ok\)\{/.test(SAVE), true);
t('한 건도 확정 못 했으면 기억하지 않는다', /&& ok\)/.test(SAVE), true);
t('업체·항목·저장소·금액을 적는다',
  /co:p\.companyName,label:p\.label\|\|'',store:p\.store\|\|'',[\s\S]{0,60}?amount:parseInt\(spSel\[id\],10\)\|\|0/.test(SAVE), true);
t('목록에 넣어 저장한다', /dbSet\(SPLIT_RECIPE_KEY, erpPutRecipe\(dbGet\(SPLIT_RECIPE_KEY,\[\]\)\|\|\[\], _rec\)\)/.test(SAVE), true);
t('저장이 터져도 확정은 이어진다 (기억은 덤이다)', /catch\(_re\)\{ if\(window\._erpErrLog\)/.test(SAVE), true);
t('무한히 쌓이지 않는다', /out\.slice\(0, SPLIT_RECIPE_MAX\)/.test(src), true);

console.log('\n[⑨ 표에서 내미는 자리]');
t('후보가 없는 줄에만 내민다', /var _rec=\(_st\.state==='none' && !isCms\) \? recipeFor\(row\) : null;/.test(src), true);
t('CMS 줄에는 안 내민다 (명세가 정답이다)', /_st\.state==='none' && !isCms/.test(src), true);
t('상담료 짐작보다 앞선다 (손으로 나눈 적이 있으면 그것이 확실하다)',
  /var _cm=\(_st\.state==='none' && !isCms && !_rec\)/.test(src), true);
/* 조건까지 함께 본다 — 단추 글자만 확인하면, 조건을 false 로 막아 놔도 검사가 통과한다 */
t('기억이 있을 때만 단추를 그린다', /: \(_rec \? h\('button',\{/.test(src), true);
t('몇 곳인지 적는다', /'🕘 지난번처럼 '\+_rec\.parts\.length\+'곳'/.test(src), true);
t('금액이 다르면 단추에도 적는다', /\(_rec\.exact\?'':' \(금액 다름\)'\)/.test(src), true);
t('줄 전체 누르기와 섞이지 않게 막는다', /e\.stopPropagation\(\); openRecipe\(row,_rec\)/.test(src), true);
t('Enter 도 같은 길로 간다 (표 단추와 다른 일을 하면 안 된다)',
  /var _r = recipeFor\(row\);\s*\n\s*if\(_r\)\{ openRecipe\(row, _r\); return false; \}/.test(src), true);
t('기억을 적요별로 한 번만 묶는다 (줄마다 목록 전체를 훑으면 505줄 × 200기억)',
  /var _recByKey = \{\};/.test(src), true);

console.log('\n[⑩ 나이스빌 CMS 표 틀고정]');
/* 대표 지시: "거래내역에 캡쳐부분 틀고정해줘" — 도구줄·요약칩·머리줄이 통째로 딸려 올라갔다 */
const NB = grab('/* ── 정산예정일별 표 ──', "nbSortTh('todo','처리','처리',thS)");
t('나이스빌 표 구역을 잘라냈다', NB.length > 400, true);
// 손잡이 이름은 2026-08-16 에 공용 도우미(useFillHeight)로 바뀌었다 — 「같은 상자를 쓴다」만 본다
t('통장 표와 같은 상자를 쓴다', /h\('div',\{ref:_ldFill\.ref,style:_ldBox\}/.test(NB), true);
t('옛 감싸개(높이 없는 overflowX)를 안 쓴다', /overflowX:'auto'/.test(NB), false);
t('테두리를 떼어 놓는다 (합치면 붙은 머리줄의 선이 지워진다)',
  /borderCollapse:'separate',borderSpacing:0/.test(NB), true);

console.log('\n  === ' + pass + ' 통과 / ' + fail + ' 실패 ===\n');
process.exit(fail ? 1 : 0);
