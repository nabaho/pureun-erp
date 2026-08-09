/* 나이스빌 CMS ↔ 통장 잇기
   ★ 「몇 월분 자문료인가」는 업체마다 다르다(대표 확인) — 6월분을 7/5에 걷어 7/6에 받으면
     어떤 업체는 6월분(걷은 달), 어떤 업체는 7월분(들어온 달)이다.
     종전에는 무조건 정산일(들어온 달)이라 걷은 달로 잡는 업체가 한 달씩 밀려 기록됐다.
   ★ 나이스빌은 건당 수수료를 뗀다 — 명세에 금액이 있는데 안 쓰고 있어서
     통장 잔액과 장부가 수수료만큼 계속 어긋났다.
   ★ 출금실패분은 미수로 남아야 한다 — 화면에 그렇게 적어 준다. */
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

const ctx = { console, Object, JSON, Array, String, Number, parseInt, isNaN, Math };
vm.createContext(ctx);
vm.runInContext(slice('function erpCmsYmBase(co){', '\nif(typeof window !== \'undefined\'){\n  window.erpCmsYmBase'), ctx);

/* ══════ ① 업체마다 기준이 다르다 ══════ */
t('기본은 들어온 달 (종전 동작)', ctx.erpCmsYmBase({}), 'setdate');
t('업체가 걷은 달로 정하면 그대로', ctx.erpCmsYmBase({cmsYmBase:'wdate'}), 'wdate');
t('엉뚱한 값은 들어온 달로 본다', ctx.erpCmsYmBase({cmsYmBase:'아무거나'}), 'setdate');
t('업체가 없어도 안 터진다', ctx.erpCmsYmBase(null), 'setdate');

// 6월분을 7/5에 걷어 7/6에 정산받은 줄
const R = { wdate:'2026-07-05', setdate:'2026-07-06' };
t('들어온 달 기준', ctx.erpCmsYmOf(R, 'setdate'), '2026-07');
t('걷은 달 기준', ctx.erpCmsYmOf(R, 'wdate'), '2026-07');

// 달을 넘겨 정산되는 경우 — 6/30 출금, 7/1 정산 (여기서 갈린다)
const R2 = { wdate:'2026-06-30', setdate:'2026-07-01' };
t('★ 달을 넘기면 갈린다 — 걷은 달', ctx.erpCmsYmOf(R2, 'wdate'), '2026-06');
t('★ 달을 넘기면 갈린다 — 들어온 달', ctx.erpCmsYmOf(R2, 'setdate'), '2026-07');

t('고른 쪽이 비면 다른 쪽으로 물러난다',
  ctx.erpCmsYmOf({wdate:'2026-06-30', setdate:''}, 'setdate'), '2026-06');
t('반대도 마찬가지',
  ctx.erpCmsYmOf({wdate:'', setdate:'2026-07-01'}, 'wdate'), '2026-07');
t('둘 다 없으면 빈 값', ctx.erpCmsYmOf({wdate:'', setdate:''}, 'wdate'), '');
t('빈 줄도 안 터진다', ctx.erpCmsYmOf(null, 'wdate'), '');

t('쓸 날짜도 기준을 따른다', ctx.erpCmsDateOf(R2, 'wdate'), '2026-06-30');
t('쓸 날짜 — 들어온 달', ctx.erpCmsDateOf(R2, 'setdate'), '2026-07-01');
t('쓸 날짜가 비면 물러난다', ctx.erpCmsDateOf({wdate:'2026-06-30', setdate:''}, 'setdate'), '2026-06-30');

/* ══════ ② 수수료 ══════ */
t('성공분 수수료만 더한다',
  ctx.erpCmsFeeSum([{status:'ok', fee:300}, {status:'fail', fee:300}, {status:'ok', fee:250}]), 550);
t('수수료가 없으면 0', ctx.erpCmsFeeSum([{status:'ok'}]), 0);
t('빈 목록도 안 터진다', ctx.erpCmsFeeSum(null), 0);

/* ══════ ③ 화면에 제대로 붙었는지 ══════ */
const FL = slice('function FinanceLedger(){', '\nfunction FinanceIncome');

t('입금표시가 업체별 기준을 쓴다', /var base = erpCmsYmBase\(r\.co\);/.test(FL), true);
t('그 기준으로 달을 잡는다', /var ym = erpCmsYmOf\(r, base\);/.test(FL), true);
t('그 기준으로 날짜를 잡는다', /var d = erpCmsDateOf\(r, base\);/.test(FL), true);
t('옛 「정산일 우선」 하드코딩이 없다', /var d = r\.setdate \|\| r\.wdate;/.test(FL), false);
t('어느 기준으로 넣었는지 기록에 남긴다', /'걷은 달' : '들어온 달'\) \+ ' 기준'/.test(FL), true);
t('걷은 달로 넣은 건수를 알려 준다', /' · 걷은 달 기준 '\+wN\+'건'/.test(FL), true);

t('수수료를 지출로 적는다', /var feeSum = erpCmsFeeSum\(doneRows\);/.test(FL), true);
t('이체수수료 계정으로 적는다', /category:'exp-bankfee', payee:'나이스빌 CMS'/.test(FL), true);
t('수수료 기록 실패를 조용히 삼키지 않는다', /⚠️ 수수료 기록 실패/.test(FL), true);

t('업체별 기준을 저장하는 길이 있다', /function setCmsYmBase\(co, base\)/.test(FL), true);
t('업체 기록에 남긴다', /dbPatch\('companies', co\.id, \{ cmsYmBase:base \}\)/.test(FL), true);
t('저장 실패를 알린다', /showToast\('❌ 저장에 실패했습니다'\)/.test(FL), true);
t('명세 줄마다 체크칸이 있다', /onChange:function\(\)\{ setCmsYmBase\(r\.co, _b==='wdate' \? 'setdate' : 'wdate'\); \}/.test(FL), true);
t('머리칸에 「몇 월분」 이 있다', /'몇 월분'/.test(FL), true);

t('출금실패는 미수로 남는다고 적는다', /'❌ 미수로 남음'/.test(FL), true);
t('실패 사유를 도움말로 보여준다', /사유: '\+\(r\.reason\|\|r\.statusRaw\|\|'-'\)/.test(FL), true);

t('통장 CMS 줄에 명세 요약이 뜬다', /var _nbHit = isCms \? erpCmsLedgerForDeposit\(row\.date, row\.amount\) : null;/.test(FL), true);
t('몇 곳인지 줄에서 보여준다', /'🏦 나이스빌 '\+_nbHit\.rows\.length\+'곳/.test(FL), true);
t('합계가 맞는지 줄에서 보여준다', /_nbHit\.exact\?' · 합계 일치'/.test(FL), true);
t('명세를 못 찾으면 그렇게 말한다', /명세를 못 찾았습니다/.test(FL), true);

/* 표 칸 수가 늘었으니 빈 줄·묶음 머리도 함께 늘어야 한다 */
const _nbHead = FL.indexOf("h('th',{style:Object.assign({},thS,{width:'34px',textAlign:'right'})},'#')");
const _nbBody = FL.indexOf("h('tbody',null, (function(){", _nbHead);
const NBT = FL.slice(_nbHead, _nbBody);
// 명세 표의 몸통 — 빈 줄·묶음 머리의 칸 수는 여기서 본다
const NBB = FL.slice(_nbBody, FL.indexOf("\n          })())", _nbBody));
// 세울 수 있는 열은 nbSortTh 가 머리칸을 만든다 — 둘 다 세야 실제 칸 수가 나온다
const th = (NBT.match(/h\('th'/g) || []).length
         + (NBT.match(/nbSortTh\(/g) || []).length;
t('명세 표 머리가 여덟 칸', th, 8);
t('빈 줄이 표 전체를 덮는다', /colSpan:8,style:\{padding:'26px'/.test(NBB), true);
t('묶음 머리도 표 전체를 덮는다', /fontSize:'11px'\}\),colSpan:8\}/.test(NBB), true);
t('몸통에 옛 일곱 칸이 남아 있지 않다', /colSpan:7/.test(NBB), false);

console.log('\n  === ' + pass + ' 통과 / ' + fail + ' 실패 ===');
process.exit(fail ? 1 : 0);
