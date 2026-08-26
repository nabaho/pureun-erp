/* 제출본 대조 — 실제로 노동부에 낸 결산서의 «재무제표 줄»을 앱이 그대로 만들어 내는지 본다.
   check_closing.js 는 «엔진»(현금·준비금·자산총계)을 보고, 여기서는 «표»를 본다:
   손익계산서 열 단계와 재무상태표 세 총계.

   ⚠ 거래는 제출된 잔액에서 «되짚어» 만든 것이다(원본 결산서의 분개 시트는
     여러 파일에서 자기 시산표와 어긋나 있어 쓸 수 없었다).
       준비금2 설정 = 준비금2 기말잔액 + 준비금2 환입
       출연         = 기본재산 기말잔액 + 준비금2 설정
     되짚기가 옳은지는 «현금이 제출본과 같은가»로 먼저 확인한다.
     그래서 이 검사는 이월과 당기출연을 가르지 않는다 — 기말 수치만 본다.

   기금 이름은 익명이다(이 저장소에 실명을 넣지 않는다). */
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const src = fs.readFileSync(path.join(ROOT, 'fund.html'), 'utf8');
function grabFn(n){const i=src.indexOf('function '+n+'(');if(i<0)throw new Error('없음:'+n);let d=0;
  for(let k=src.indexOf('{',i);k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(!d)return src.slice(i,k+1);}}}
function grabVar(n){const i=src.indexOf('var '+n+'=');if(i<0)throw new Error('없음:'+n);let d=0;
  for(let k=src.indexOf('=',i);k<src.length;k++){const c=src[k];
    if(c==='{'||c==='[')d++;else if(c==='}'||c===']'){d--;if(!d)return src.slice(i,src.indexOf(';',k)+1);}}}
global.num = v => { if (v === '' || v == null) return ''; const n = Number(String(v).replace(/,/g, '')); return isFinite(n) ? n : '' };
global.S = { fundId: 'X', year: 2020 };
global.funds = { X: { fund_type: '공동', years: {} } };
(0, eval)(['ACCT_CHART','PURPOSE_ACCTS','ADMIN_ACCTS','OPEN_ACCT','RESERVE_ACCTS','CF_INVEST','CF_FINANCE','IE_TREE'].map(grabVar).join('\n')
  + '\n' + ['_openingOf','_splitsOf','_splitSum','_txnDone','expandSplits','journalOf','acctMoves','computeFin',
     '_contribOf','_reserveRate','_rsvSwapOf','_rsvRoles','_reserveAcct','reserveAdjust','_reserveEntry',
     '_reserveEntries','_openAssets','_retLabel','_retVal','stmtBS','stmtIS','stmtRE','stmtChk',
     'cashMoves','cashFlowRows','ieRows','stmtNotes','notesChk'].map(grabFn).join('\n'));

const W = v => String(Math.round(v || 0).toLocaleString()).padStart(16);
let fail = 0, n = 0;
function ok(label, got, want) {
  n++;
  if (Math.round(got || 0) !== Math.round(want || 0)) {
    fail++; console.log('FAIL ' + label + W(got) + '  제출본' + W(want));
  }
}

const CASES = [
 {
  "name": "P공동 2020",
  "tag": "제1기 · 재난지원금",
  "year": 2020,
  "contrib": 20000000.0,
  "interest": 8119.0,
  "purpose": [
   [
    "재난구호금",
    12430500.0
   ],
   [
    "경조사비",
    1005000.0
   ]
  ],
  "admin": [
   [
    "지급수수료",
    173000.0
   ]
  ],
  "loan": 0,
  "setup": 16000000.0,
  "rev2": 13600381.0,
  "unknown": [],
  "want": {
   "step1": 8119.0,
   "step2": 13435500.0,
   "step3": -13427381.0,
   "step4": 173000.0,
   "step5": -13600381.0,
   "step6": 13608500.0,
   "step7": 8119.0,
   "step10": 0.0,
   "assets": 6399619.0,
   "liab": 2399619.0,
   "equity": 4000000.0,
   "cash": 6399619.0,
   "loan": 0
  }
 },
 {
  "name": "Q사내 2019",
  "tag": "대부금 6천만",
  "year": 2019,
  "contrib": 300000000.0,
  "interest": 54701.0,
  "purpose": [
   [
    "경조사비",
    20750000.0
   ],
   [
    "동호회비",
    1780900.0
   ],
   [
    "기타복지비",
    5783120.0
   ],
   [
    "생활안정자금",
    15000000.0
   ]
  ],
  "admin": [
   [
    "지급수수료",
    4400.0
   ]
  ],
  "loan": 60000000.0,
  "setup": 240000000.0,
  "rev2": 43263719.0,
  "unknown": [],
  "want": {
   "step1": 54701.0,
   "step2": 43314020.0,
   "step3": -43259319.0,
   "step4": 4400.0,
   "step5": -43263719.0,
   "step6": 43318420.0,
   "step7": 54701.0,
   "step10": 0.0,
   "assets": 256736281.0,
   "liab": 196736281.0,
   "equity": 60000000.0,
   "cash": 196736281.0,
   "loan": 60000000.0
  }
 },
 {
  "name": "Q사내 2020",
  "tag": "대부금 2.3억 · 의료비",
  "year": 2020,
  "contrib": 671736281.0,
  "interest": 173852.0,
  "purpose": [
   [
    "기념품비",
    49681000.0
   ],
   [
    "의료비",
    5500000.0
   ],
   [
    "기타복지비",
    20151752.0
   ]
  ],
  "admin": [
   [
    "세금과공과",
    466000.0
   ],
   [
    "지급수수료",
    562900.0
   ]
  ],
  "loan": 234888880.0,
  "setup": 531736281.0,
  "rev2": 76187800.0,
  "unknown": [],
  "want": {
   "step1": 173852.0,
   "step2": 75332752.0,
   "step3": -75158900.0,
   "step4": 1028900.0,
   "step5": -76187800.0,
   "step6": 76361652.0,
   "step7": 173852.0,
   "step10": 0.0,
   "assets": 595548481.0,
   "liab": 455548481.0,
   "equity": 140000000.0,
   "cash": 360659601.0,
   "loan": 234888880.0
  }
 },
 {
  "name": "R공동 2020",
  "tag": "복리후생 위주",
  "year": 2020,
  "contrib": 400000000.0,
  "interest": 202452.0,
  "purpose": [
   [
    "복리후생",
    46434960.0
   ],
   [
    "기념품비",
    61883200.0
   ],
   [
    "기타복지비",
    2620700.0
   ]
  ],
  "admin": [
   [
    "지급수수료",
    5119400.0
   ]
  ],
  "loan": 0,
  "setup": 320000000.0,
  "rev2": 115855808.0,
  "unknown": [],
  "want": {
   "step1": 202452.0,
   "step2": 110938860.0,
   "step3": -110736408.0,
   "step4": 5119400.0,
   "step5": -115855808.0,
   "step6": 116058260.0,
   "step7": 202452.0,
   "step10": 0.0,
   "assets": 284144192.0,
   "liab": 204144192.0,
   "equity": 80000000.0,
   "cash": 284144192.0,
   "loan": 0
  }
 },
 {
  "name": "S사내 2019",
  "tag": "⚠ 제출본 손익이 스스로 안 맞물림",
  "year": 2019,
  "contrib": 300000000.0,
  "interest": 54701.0,
  "purpose": [
   [
    "경조사비",
    20750000.0
   ],
   [
    "동호회비",
    1780900.0
   ],
   [
    "기타복지비",
    5783120.0
   ]
  ],
  "admin": [
   [
    "지급수수료",
    4400.0
   ]
  ],
  "loan": 75000000.0,
  "setup": 240000000.0,
  "rev2": 28263719.0,
  "unknown": [
   "근로자대부"
  ],
  "want": {
   "step1": 54701.0,
   "step2": 28314020.0,
   "step3": -28259319.0,
   "step4": 4400.0,
   "step5": -28254919.0,
   "step6": 28318420.0,
   "step7": 54701.0,
   "step10": 0.0,
   "assets": 271736281.0,
   "liab": 211736281.0,
   "equity": 60000000.0,
   "cash": 196736281.0,
   "loan": 75000000.0
  }
 }
];

CASES.forEach(c => {
  S.year = c.year;
  funds.X.years = { [c.year]: { opening: {}, reserve_auto: false } };  // 준비금 분개를 직접 넣는다
  const T = [];
  const add = (d, cr, amt, nocash) => { if (!amt) return;
    T.push({ _id: 'T' + (T.length + 1), date: c.year + '-06-30', approved: true,
      deposit: d === '현금성자산' ? amt : 0, withdraw: cr === '현금성자산' ? amt : 0,
      amount: amt, debit: d, credit: cr, nocash: nocash ? 1 : 0 }); };
  add('현금성자산', '기본재산', c.contrib);
  add('현금성자산', '이자수익', c.interest);
  c.purpose.forEach(([a, v]) => add(a, '현금성자산', v));
  c.admin.forEach(([a, v]) => add(a, '현금성자산', v));
  add('근로자대부금', '현금성자산', c.loan);
  add('고유목적사업준비금전입액', '고유목적사업준비금1', c.interest, true);
  add('고유목적사업준비금1', '고유목적사업준비금환입', c.interest, true);
  add('기본재산', '고유목적사업준비금2', c.setup, true);
  add('고유목적사업준비금2', '고유목적사업준비금환입', c.rev2, true);

  const fin = computeFin(T, 'X', c.year);
  const zero = {}; Object.keys(fin).forEach(k => { zero[k] = typeof fin[k] === 'number' ? 0 : fin[k]; });
  zero.tb = {};
  const bs = stmtBS(fin, zero), is = stmtIS(fin, zero, fin.tb, {});
  const gb = l => (bs.find(r => r.lbl === l) || {}).cur;
  const gi = p => (is.find(r => r.lbl.startsWith(p)) || {}).cur;
  const w = c.want, T2 = c.name + ' ';

  /* 되짚기가 옳은지 먼저 — 현금이 제출본과 다르면 아래는 볼 것도 없다 */
  ok(T2 + '현금(되짚기 검산)', fin.cash, w.cash);

  ok(T2 + '1.사업수익      ', gi('1. 사업수익'), w.step1);
  ok(T2 + '2.고유목적사업비용', gi('2. 고유목적사업비용'), w.step2);
  ok(T2 + '3.사업총이익    ', gi('3. 사업총이익'), w.step3);
  ok(T2 + '4.일반관리비    ', gi('4. 일반관리비'), w.step4);
  ok(T2 + '6.사업외수익    ', gi('6. 사업외수익'), w.step6);
  ok(T2 + '7.사업외비용    ', gi('7. 사업외비용'), w.step7);
  ok(T2 + '10.당기순이익   ', gi('10. 당기순이익'), w.step10);
  ok(T2 + '자산총계        ', gb('자 산 총 계'), w.assets);
  ok(T2 + '부채총계        ', gb('부 채 총 계'), w.liab);
  ok(T2 + '자본총계        ', gb('자 본 총 계'), w.equity);
  ok(T2 + '대부금          ', fin.loan, w.loan);
  /* 제출본은 대부금을 «비유동자산 › 투자자산»에 놓았다 —
     유동자산에 섞으면 총계는 같아도 표가 달라진다. */
  ok(T2 + 'Ⅰ.유동자산     ', gb('Ⅰ. 유동자산'), w.cash);
  ok(T2 + 'Ⅱ.비유동자산   ', gb('Ⅱ. 비유동자산'), w.loan);
  ok(T2 + 'Ⅱ.비유동부채   ', gb('Ⅱ. 비유동부채'), w.liab);

  /* 5.사업이익은 «제출본이 틀린» 사례가 있어 앱의 셈을 기준으로 본다.
     S사내 2019 는 제출본이 3-4 와 8=5+6-7 을 모두 어겼다(8,800원). */
  const step5 = Math.round(w.step3 - w.step4);
  ok(T2 + '5.사업이익(3-4) ', gi('5. 사업이익'), step5);

  // 표 셋이 재무상태표와 맞물리는지
  n++; const e1 = stmtChk(fin);
  if (e1.length) { fail++; console.log('FAIL ' + T2 + '손익 열 단계: ' + e1.join(',')); }
  n++; const cf = cashFlowRows(T, 'X', c.year);
  if (Math.round(cf.end) !== Math.round(fin.cash)) { fail++; console.log('FAIL ' + T2 + '현금흐름 기말' + W(cf.end)); }
  /* 대부금은 «투자활동»이다 — 영업활동에 섞으면 본디 활동이 부풀어 보인다 */
  const inv = (cf.rows.find(r => r.lbl.startsWith('Ⅱ. 투자활동')) || {}).cur;
  ok(T2 + '투자활동 현금흐름', inv, -w.loan);
  n++; const ie = ieRows(T, 'X', c.year);
  if (Math.round(ie.end) !== Math.round(fin.cash)) { fail++; console.log('FAIL ' + T2 + '차기이월금' + W(ie.end)); }
  n++; const e2 = notesChk(stmtNotes(T, fin, { tb: {}, purpose: 0 }, 'X', c.year));
  if (e2.length) { fail++; console.log('FAIL ' + T2 + '주석 맞물림: ' + e2.join(',')); }
  n++; const ta = gb('자 산 총 계'), tl = gb('부채와 자본총계');
  if (Math.round(ta) !== Math.round(tl)) { fail++; console.log('FAIL ' + T2 + '대차 불일치' + W(ta - tl)); }
});

console.log(fail ? '\nFAILURES ' + fail + ' / ' + n : 'ALL PASS (' + n + '건 · 제출본 ' + CASES.length + '건 대조)');
process.exit(fail ? 1 : 0);
