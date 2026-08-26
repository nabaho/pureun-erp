/* 세 가지 — 기업정보함 정보만 · 보류함 다시 보기 · 세금계산서 입금 대조
   ★ 기업정보함에서 사진까지 가져와 계약 기록에 base64 로 박혔다 — 레코드가 부풀어
     저장이 조용히 실패한다(예전 「계약 저장 실패」의 원인). 사진은 기업정보함에 이미 있다.
   ★ 사무관리에 기록이 없어 보류함에 넣은 줄은, 나중에 기록을 만들어도 아무도 알려 주지
     않아 쌓이기만 했다.
   ★ 「끊어 놓고 안 들어온 계산서」·「들어왔는데 안 끊은 입금」을 볼 자리가 없어
     부가세 신고 전에 훑을 수가 없었다. */
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

/* ══════ ① 기업정보함 — 정보만 가져온다 ══════ */
t('사진 읽어 오는 함수를 걷어냈다', /function pcFetchImages\(/.test(src), false);
t('회사정보는 그대로 가져온다', /if\(row\.bizNo   && !cur\.bizNo\)   info\.bizNo   = row\.bizNo;/.test(src), true);
t('업태·종목도 가져온다', /info\.bizType     = row\.bizType;/.test(src), true);
t('담당자도 그대로 가져온다', /var mg = mergeCompanyContacts\(cur\.contacts \|\| \[\], newContacts\);/.test(src), true);
t('계약 기록에 사진을 넣지 않는다', /next\.bizLicenseImg   = img\.bizLicenseImg;/.test(src), false);
t('명함 사진도 넣지 않는다', /next\.businessCardImg = img\.businessCardImg;/.test(src), false);
t('가져올 정보가 없으면 그렇게 말한다', /이 회사에서 새로 가져올 정보가 없습니다/.test(src), true);
t('단추 글자가 「정보 가져오기」', /'📇 기업정보함 정보 가져오기'/.test(src), true);
t('사진은 기업정보함에서 보라고 길을 준다', /'기업정보함에서 보기'/.test(src), true);
t('그 길이 기업정보함으로 간다', /href:'pu-cards\.html', target:'_blank'/.test(src), true);
// OCR 로 글자를 뽑으면 원본을 지우는 규칙은 그대로여야 한다 (같은 원칙이다)
t('OCR 뒤 원본 정리는 그대로', /if\(filled > 0 && \(field === 'bizLicenseImg' \|\| field === 'businessCardImg'\)\)\{ nc\[field\] = ''; \}/.test(src), true);

/* ══════ ② 보류함 다시 보기 ══════ */
const FL = slice('function FinanceLedger(', '\nfunction FinanceIncome');
t('열 때만 다시 맞춰 본다', /if\(heldOpen && Array\.isArray\(_heldList\)\) _heldList\.forEach/.test(FL), true);
t('지금 후보로 다시 맞춘다', /erpMatchTxnToPending\(\{date:x\.date, amount:x\.amount, memo:x\.memo\}, pending, 6\)/.test(FL), true);
t('업체 묶기를 거쳐 본다', /var _g = erpGroupPendByCompany\(_sug\);/.test(FL), true);
t('금액까지 맞는지도 잰다', /fits:\(_exp > 0 && Math\.abs\(_amt - _exp\) <= 1100\)/.test(FL), true);
t('짝이 생긴 것을 맨 위에서 알린다', /'✅ 다시 보니 '\+_heldReady\.length\+'건은 이제 짝을 찾았습니다/.test(FL), true);
t('줄마다 무엇과 맞는지 적는다', /'✅ '\+_rd\.grp\[0\]\.company\+' · '\+erpKindLabel\(_rd\.grp\[0\]\)/.test(FL), true);
t('금액이 안 맞으면 그렇게 말한다', /\(_rd\.fits\?'':' \(금액 확인\)'\)/.test(FL), true);
t('단추 글자가 바뀐다', /_rd\?'되돌려 확정':'목록으로'/.test(FL), true);
t('짝이 생긴 줄은 색으로도 구분', /background:_rd\?'#f0fdf4':'transparent'/.test(FL), true);
t('안내 문구가 바뀐다', /사무관리에 기록을 만들면 여기서 «짝을 찾았습니다» 로 바뀝니다/.test(FL), true);

/* ══════ ③ 세금계산서 입금 대조 ══════ */
const ctx = { console, Object, JSON, Array, String, Number, parseInt, isNaN, Math, Date };
vm.createContext(ctx);
vm.runInContext(slice('function erpNormName(', '\nfunction erpLcsLen('), ctx);
vm.runInContext(slice('function erpInvoiceMatchAll(invs, incs, asOf){', '\nif(typeof window !== \'undefined\') window.erpInvoiceMatchAll'), ctx);

const INV = [
  { id:'a', companyName:'노리시스템', amount:300000, issueDate:'2026-06-01', vatType:'separate', status:'발행' },
  { id:'b', companyName:'㈜한엘',     amount:550000, issueDate:'2026-05-01', vatType:'included', status:'발행' },
  { id:'c', companyName:'대성물류',   amount:100000, issueDate:'2026-07-01', vatType:'included', status:'미발행' }
];
const INC = [
  { companyName:'노리시스템', amount:330000, date:'2026-06-10', kind:'컨설팅(잔금)' },   // 300,000 ×1.1
  { companyName:'세창이엔지', amount:220000, date:'2026-06-20', kind:'사건(착수)' },     // 계산서 없음
  { companyName:'가나상사',   amount:110000, date:'2026-06-20', sourceKind:'company' }   // 자문료 — 제외
];
const R = ctx.erpInvoiceMatchAll(INV, INC, '2026-07-31');

t('부가세 별도는 ×1.1 로 맞춘다', R.paid.length, 1);
t('맞은 것은 노리시스템', R.paid[0].inv.id, 'a');
t('예상 입금액을 함께 준다', R.paid[0].expect, 330000);
t('안 들어온 계산서를 센다', R.unpaid.length, 1);
t('안 들어온 것은 ㈜한엘', R.unpaid[0].inv.id, 'b');
t('며칠 지났는지 센다', R.unpaid[0].days, 91);
t('미입금 합계', R.sumUnpaid, 550000);
t('★ 미발행(예정)은 대조하지 않는다',
  R.paid.concat(R.unpaid).some(function(x){ return x.inv.id === 'c'; }), false);
t('계산서 없는 입금을 센다', R.noInvoice.length, 1);
t('그것은 세창이엔지', R.noInvoice[0].inc.companyName, '세창이엔지');
t('★ 자문료는 계산서 없음에서 뺀다',
  R.noInvoice.some(function(x){ return x.inc.companyName === '가나상사'; }), false);
t('탭 뱃지에 쓸 수 있게 todo 를 준다', R.todo, 1);

// 발행일보다 «먼저» 들어온 돈은 그 계산서의 짝이 아니다
const R2 = ctx.erpInvoiceMatchAll(
  [{ id:'x', companyName:'가나', amount:100000, issueDate:'2026-06-10', vatType:'included', status:'발행' }],
  [{ companyName:'가나', amount:100000, date:'2026-06-01' }], '2026-06-30');
t('★ 발행 전 입금은 짝이 아니다', R2.unpaid.length, 1);

// 같은 입금이 두 계산서에 두 번 붙지 않는다
const R3 = ctx.erpInvoiceMatchAll(
  [{ id:'p', companyName:'가나', amount:100000, issueDate:'2026-06-01', vatType:'included', status:'발행' },
   { id:'q', companyName:'가나', amount:100000, issueDate:'2026-06-02', vatType:'included', status:'발행' }],
  [{ companyName:'가나', amount:100000, date:'2026-06-10' }], '2026-06-30');
t('★ 한 입금이 두 번 쓰이지 않는다', R3.paid.length, 1);
t('나머지는 미입금으로 남는다', R3.unpaid.length, 1);

t('빈 값도 안 터진다', ctx.erpInvoiceMatchAll(null, null, '2026-07-31').todo, 0);

/* ══════ ③-2 계산서 «색인» 도 부가세 별도를 ×1.1 한다 ══════
   거래내역 줄의 🧾 표시가 이 색인을 쓴다. 변이 검사를 짜다 이 줄에 검사가
   하나도 없다는 것을 알게 됐다 — 여기서 함께 고정한다.
   (같은 셈이 두 곳에 있으니 한쪽만 고치면 두 화면이 다른 말을 하게 된다) */
const IDX = slice('  // 1) 수동 발행분 (동기)', '  // 2) 홈택스 업로드분');
t('색인도 부가세 별도면 ×1.1', /var exp = \(iv\.vatType === 'separate' \|\| iv\.vatType === 'exclusive'\) \? Math\.round\(amt \* 1\.1\) : amt;/.test(IDX), true);
t('색인도 미발행은 넣지 않는다', /if\(iv\.status && iv\.status !== '발행'\) return;/.test(IDX), true);
// 대조와 색인이 같은 셈을 쓰는가 (한쪽만 바뀌면 두 화면이 다른 말을 한다)
const MATCH = slice('function erpInvoiceMatchAll(invs, incs, asOf){', '\nif(typeof window !== \'undefined\') window.erpInvoiceMatchAll');
t('대조도 같은 셈', /\(iv\.vatType === 'separate' \|\| iv\.vatType === 'exclusive'\) \? Math\.round\(amt \* 1\.1\) : amt/.test(MATCH), true);

const IVS = slice('function FinanceInvoice(){', '\n// ══');
t('대조 탭이 있다', /\{ v:'match', label:'💰 입금 대조'/.test(IVS), true);
t('탭 뱃지에 미입금 수를 붙인다', /_ivmSum\.todo\?\(' · 미입금 '\+_ivmSum\.todo\):''/.test(IVS), true);
t('대조를 실제로 그린다', /tab === 'match' && renderMatch\(\)/.test(IVS), true);
t('오늘 날짜를 넘겨 센다 (기계에 묻지 않는다)',
  /erpInvoiceMatchAll\(invoices, dbGet\('finance_income', \[\]\) \|\| \[\], todayYMD\(\)\)/.test(IVS), true);
t('30일 넘으면 빨갛게', /x\.days >= 30 \? '#dc2626' : '#854d0e'/.test(IVS), true);
t('오래된 것부터 보여준다', /sort\(function\(a,b\)\{ return b\.days - a\.days; \}\)/.test(IVS), true);
t('자문료를 왜 뺐는지 적어 둔다', /자문료는 업체 주기로 끊으므로 제외합니다/.test(IVS), true);

console.log('\n  === ' + pass + ' 통과 / ' + fail + ' 실패 ===');
process.exit(fail ? 1 : 0);
