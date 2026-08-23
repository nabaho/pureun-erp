/* 월말 마감 — 순서 잠금 + 근태 마감월 관문
   되돌릴 수 없는 쪽은 "해제 순서"다. 급여가 잠긴 채로 근태를 열면 급여의 근거가 흔들린다.
   그 한 가지를 여러 각도에서 확인한다. */
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

/* ── 샌드박스: 잠금 헬퍼 + 마감 엔진 + 근태 관문 ── */
function makeCtx(){
  let store = {};
  const toasts = [];
  const ctx = {
    console, Date, Math, Object, JSON, Array, String, Number,
    parseInt, parseFloat, isNaN, RegExp,
    window: {}, CURRENT_USER: { sid:'S001', name:'권형하' },
    showToast(m){ toasts.push(String(m)); },
    todayYMD(){ return '2026-08-04'; },
    dbGet(k, d){ return (k in store) ? store[k] : d; },
    dbSet(k, v){ store[k] = v; return true; },
    dbUpsert(k, rec){
      if(!rec || !rec.id) return false;
      const arr = (store[k] || []).slice();
      const i = arr.findIndex(x => x && x.id === rec.id);
      if(i >= 0) arr[i] = rec; else arr.push(rec);
      store[k] = arr; return true;
    },
    dbRemove(k, id){
      store[k] = (store[k] || []).filter(x => !(x && x.id === id));
      return true;
    }
  };
  vm.createContext(ctx);
  vm.runInContext(slice('// ===== 급여 편의기능 헬퍼 =====', '// 감사 로그'), ctx);
  ctx.__store = () => store;
  ctx.__reset = (s) => { store = s || {}; toasts.length = 0; };
  ctx.__toasts = toasts;
  return ctx;
}
const ctx = makeCtx();

const KEYS = {
  attend:'locked_attend_months', payroll:'locked_payroll_months',
  irregular:'locked_irregular_months', contract:'locked_contract_months',
  income:'locked_income_months', expense:'locked_expense_months'
};
const ORDER = ['attend','payroll','irregular','contract','income','expense'];
const YM = '2026-07';
function lockUpTo(n){                            // 앞 n 단계를 잠긴 상태로 만든다
  const s = {};
  ORDER.slice(0, n).forEach(k => { s[KEYS[k]] = [YM]; });
  ctx.__reset(s);
}
const stOf = (key, ym) => {
  const all = ctx.monthCloseState(ym || YM);
  return all.find(x => x.key === key) || null;
};

/* ═══ 1. 단계 정의 ═══ */
lockUpTo(0);
t('여섯 단계', ctx.monthCloseState(YM).map(s => s.key), ORDER);
t('번호 1~6', ctx.monthCloseState(YM).map(s => s.no), [1,2,3,4,5,6]);
t('근태가 급여보다 앞', ORDER.indexOf('attend') < ORDER.indexOf('payroll'), true);
t('계약이 입금보다 앞', ORDER.indexOf('contract') < ORDER.indexOf('income'), true);
t('급여가 출금보다 앞', ORDER.indexOf('payroll') < ORDER.indexOf('expense'), true);
t('단계마다 이동할 화면이 있다', ctx.monthCloseState(YM).every(s => !!s.goto), true);
t('잘못된 월은 빈 목록', ctx.monthCloseState('2026-13').length, 0);
t('월 아닌 값도 빈 목록', ctx.monthCloseState('아무거나').length, 0);
t('00월 거부', ctx.monthCloseState('2026-00').length, 0);

/* ═══ 2. 잠그는 순서 ═══ */
lockUpTo(0);
t('처음엔 1단계만 잠글 수 있다',
  ctx.monthCloseState(YM).filter(s => s.canLock).map(s => s.key), ['attend']);
t('2단계는 1단계가 막고 있다', stOf('payroll').blockedBy.key, 'attend');
t('6단계도 1단계가 막고 있다', stOf('expense').blockedBy.key, 'attend');
t('순서 어긴 잠금은 거부', ctx.monthCloseLock('payroll', YM).ok, false);
t('거부 이유에 먼저 할 단계가 나온다', /근태·휴가/.test(ctx.monthCloseLock('payroll', YM).why), true);
t('거부했으면 실제로 안 잠긴다', ctx.__store()[KEYS.payroll], undefined);

t('1단계 잠금 성공', ctx.monthCloseLock('attend', YM).ok, true);
t('잠긴 뒤 2단계가 열린다', stOf('payroll').canLock, true);
t('3단계는 아직 2단계가 막는다', stOf('irregular').blockedBy.key, 'payroll');
t('이미 잠근 걸 또 잠글 수 없다', ctx.monthCloseLock('attend', YM).ok, false);
t('없는 단계는 거부', ctx.monthCloseLock('없는거', YM).ok, false);
t('월 형식 틀리면 거부', ctx.monthCloseLock('attend', '26-7').ok, false);

// 여섯 단계를 차례로
lockUpTo(0);
ORDER.forEach(function(k, i){
  t('순서대로 '+(i+1)+'단계 잠금', ctx.monthCloseLock(k, YM).ok, true);
});
t('여섯 단계 모두 마감', ctx.monthCloseDone(YM), { done:6, total:6, all:true });

/* ═══ 3. ★ 해제는 뒤에서부터만 (되돌릴 수 없는 쪽) ═══ */
lockUpTo(6);
t('★ 근태 해제 거부 — 뒤가 잠겨 있다', ctx.monthCloseUnlock('attend', YM).ok, false);
t('★ 급여 해제 거부', ctx.monthCloseUnlock('payroll', YM).ok, false);
t('★ 계약 해제 거부', ctx.monthCloseUnlock('contract', YM).ok, false);
t('★ 입금 해제 거부', ctx.monthCloseUnlock('income', YM).ok, false);
t('마지막 단계만 풀 수 있다',
  ctx.monthCloseState(YM).filter(s => s.canUnlock).map(s => s.key), ['expense']);
t('★ 거부됐으면 실제로 안 풀린다', ctx.__store()[KEYS.attend], [YM]);
t('막고 있는 단계를 알려준다', stOf('attend').heldBy.key, 'payroll');
t('거부 이유에 뒤에서부터라고 나온다', /뒤에서부터/.test(ctx.monthCloseUnlock('attend', YM).why), true);

// 역순으로 전부 풀기
lockUpTo(6);
ORDER.slice().reverse().forEach(function(k, i){
  t('역순으로 '+k+' 해제', ctx.monthCloseUnlock(k, YM).ok, true);
});
t('전부 해제됨', ctx.monthCloseDone(YM).done, 0);

// 중간을 건너뛴 해제
lockUpTo(6);
t('출금 해제', ctx.monthCloseUnlock('expense', YM).ok, true);
t('★ 출금만 풀린 뒤 근태는 여전히 거부', ctx.monthCloseUnlock('attend', YM).ok, false);
t('입금 해제', ctx.monthCloseUnlock('income', YM).ok, true);
t('★ 아직도 계약이 근태를 막는다', stOf('attend').heldBy.key, 'payroll');
t('안 잠긴 걸 풀 수 없다', ctx.monthCloseUnlock('expense', YM).ok, false);

/* ═══ 4. force 로도 해제 순서는 못 뚫는다 ═══ */
lockUpTo(6);
t('★ force 인자를 줘도 해제는 안 뚫린다', ctx.monthCloseUnlock('attend', YM, true).ok, false);
t('★ 그래도 안 풀렸다', ctx.__store()[KEYS.attend], [YM]);
// 잠금은 force 로 앞질러 갈 수 있다 (개별 화면의 기존 버튼용)
lockUpTo(0);
t('force 잠금은 순서를 앞지른다', ctx.monthCloseLock('income', YM, true).ok, true);
t('앞질러 잠근 뒤에도 근태는 잠글 수 있다', ctx.monthCloseLock('attend', YM).ok, true);
t('★ 앞지른 뒤에도 근태 해제는 막힌다', ctx.monthCloseUnlock('attend', YM).ok, false);

/* ═══ 5. 마감 기록 (누가·언제) ═══ */
lockUpTo(0);
ctx.monthCloseLock('attend', YM);
const lg = ctx.__store()['month_close_log'][0];
t('기록 id', lg.id, 'mc-attend-2026-07');
t('기록 단계', lg.step, 'attend');
t('기록 월', lg.ym, YM);
t('기록 처리자 사번', lg.by, 'S001');
t('기록 처리자 이름', lg.byName, '권형하');
t('기록에 시각이 있다', /^\d{4}-\d{2}-\d{2}T/.test(lg.at), true);
t('화면이 기록을 읽는다', stOf('attend').info.byName, '권형하');
ctx.monthCloseUnlock('attend', YM);
t('해제하면 기록도 지운다', (ctx.__store()['month_close_log'] || []).length, 0);
t('해제 후 info 없음', stOf('attend').info, null);
// 다른 달 기록이 섞이지 않는가
lockUpTo(0);
ctx.monthCloseLock('attend', '2026-06');
ctx.monthCloseLock('attend', '2026-07');
t('달마다 기록이 따로', (ctx.__store()['month_close_log'] || []).length, 2);
t('6월 마감이 7월에 안 보인다', stOf('attend', '2026-07').locked, true);
ctx.monthCloseUnlock('attend', '2026-06');
t('6월만 풀렸다', ctx.__store()[KEYS.attend], ['2026-07']);

/* ═══ 6. 달끼리 섞이지 않는가 ═══ */
ctx.__reset({ [KEYS.attend]:['2026-06'] });
t('6월 잠금이 7월에 영향 없음', stOf('attend', '2026-07').locked, false);
t('7월 1단계는 여전히 열려 있다', stOf('attend', '2026-07').canLock, true);
t('6월은 잠겨 있다', stOf('attend', '2026-06').locked, true);

/* ═══ 7. 점검 항목 — 실제 데이터로 세는가 ═══ */
// 초과근로 합계가 급여 시간과 다르면
ctx.__reset({
  overtime_records:[
    { id:'ot1', sid:'S009', date:'2026-07-03', kind:'overtime', hours:3 },
    { id:'ot2', sid:'S009', date:'2026-07-04', kind:'overtime', hours:2 }
  ],
  payroll_monthly:[ { id:'p1', empSid:'S009', ym:YM, overtimeHours:5, nightHours:0, holidayHours:0, status:'confirmed', baseSalary:3000000 } ]
});
t('합계가 맞으면 지적 없음', ctx.monthCloseIssues('attend', YM), []);
ctx.__store().payroll_monthly[0].overtimeHours = 4;
t('★ 합계가 다르면 지적한다', /초과근로 기록과 급여의 시간이 다른/.test(ctx.monthCloseIssues('attend', YM)[0]), true);
// 보상휴가로 전환된 건은 임금이 아니라 휴가로 보상되므로 세지 않는다
ctx.__reset({
  overtime_records:[ { id:'ot1', sid:'S009', date:'2026-07-03', kind:'overtime', hours:3, convertedToComp:true } ],
  payroll_monthly:[ { id:'p1', empSid:'S009', ym:YM, overtimeHours:0, status:'confirmed', baseSalary:1 } ]
});
t('보상휴가 전환분은 급여 시간에서 뺀다', ctx.monthCloseIssues('attend', YM), []);
// 시간 0
ctx.__reset({ overtime_records:[ { id:'ot0', sid:'S009', date:'2026-07-05', kind:'overtime', hours:0 } ] });
t('시간이 0인 초과근로를 지적', ctx.monthCloseIssues('attend', YM).some(x => /시간이 0인/.test(x)), true);
// 다른 달은 안 센다
ctx.__reset({ overtime_records:[ { id:'ot0', sid:'S009', date:'2026-06-05', kind:'overtime', hours:0 } ] });
t('다른 달 초과근로는 세지 않는다', ctx.monthCloseIssues('attend', YM), []);

// 급여
ctx.__reset({ payroll_monthly:[
  { id:'p1', empSid:'S001', empName:'권형하', ym:YM, status:'confirmed', baseSalary:5000000 },
  { id:'p2', empSid:'S002', empName:'김동현', ym:YM, status:'draft',     baseSalary:3000000 },
  { id:'p3', empSid:'S003', empName:'박재원', ym:YM, status:'confirmed', baseSalary:0 }
]});
const payIss = ctx.monthCloseIssues('payroll', YM);
t('미확정 급여를 지적', payIss.some(x => /확정 안 된 급여 1건/.test(x)), true);
t('지적에 이름이 나온다', payIss.some(x => /김동현/.test(x)), true);
t('기본급 0원을 지적', payIss.some(x => /기본급이 0원인 급여 1건/.test(x)), true);
ctx.__reset({ payroll_monthly:[] });
t('급여 기록이 없으면 알려준다', ctx.monthCloseIssues('payroll', YM), ['이 달 급여 기록이 없다']);

// 비정규직 — status 가 아니라 paid 로 판단해야 한다
ctx.__reset({ payroll_irregular:[
  { id:'i1', ym:YM, name:'홍길동', amount:500000, paid:true },
  { id:'i2', ym:YM, name:'이순신', amount:300000, paid:false },
  { id:'i3', ym:YM, name:'강감찬', amount:0,      paid:true }
]});
const irrIss = ctx.monthCloseIssues('irregular', YM);
t('★ 지급 표시 안 된 비정규직을 paid 로 찾는다', irrIss.some(x => /지급 표시가 안 된 비정규직 1건/.test(x)), true);
t('그 사람 이름이 나온다', irrIss.some(x => /이순신/.test(x)), true);
t('금액 0원 비정규직을 지적', irrIss.some(x => /금액이 0원인 비정규직 1건/.test(x)), true);

// 계약 — 금액은 c.amounts[종류] 에 있다
ctx.__reset({ contracts:[
  { id:'c1', signDate:'2026-07-05', companyName:'유원에프앤비', managerMain:'권형하', amounts:{ consult:500000 } },
  { id:'c2', signDate:'2026-07-06', companyName:'가야엔지니어링', managerMain:'',      amounts:{ consult:300000 } },
  { id:'c3', signDate:'2026-07-07', companyName:'남양인텍',      managerMain:'권형하', amounts:{} },
  { id:'c4', signDate:'2026-07-08', companyName:'옛계약',        managerMain:'권형하', contractAmount:900000 },
  { id:'c5', signDate:'2026-06-30', companyName:'지난달',        managerMain:'',       amounts:{} }
]});
const ctIss = ctx.monthCloseIssues('contract', YM);
t('★ 계약금액을 amounts 에서 읽는다', ctIss.some(x => /계약금액이 0원인 계약 1건/.test(x)), true);
t('금액 없는 계약 이름', ctIss.some(x => /남양인텍/.test(x)), true);
t('옛 계약의 contractAmount 도 인정', ctIss.some(x => /옛계약/.test(x)), false);
t('담당자 빈 계약을 지적', ctIss.some(x => /담당자가 비어 있는 계약 1건/.test(x)), true);
t('★ 지난달 계약은 세지 않는다', ctIss.some(x => /지난달/.test(x)), false);
// 성공보수만 있는 사건 계약은 계약금액 0원이어도 정상이다
ctx.__reset({ contracts:[ { id:'c1', signDate:'2026-07-05', companyName:'사건건', managerMain:'권형하', amounts:{}, successFee:3000000 } ]});
t('성공보수가 있으면 0원으로 지적하지 않는다', ctx.monthCloseIssues('contract', YM), []);

// 입금
ctx.__reset({ finance_income:[
  { id:'i1', date:'2026-07-01', amount:100000, companyName:'유원에프앤비' },
  { id:'i2', date:'2026-07-02', amount:50000,  companyName:'' }
]});
t('업체 빈 입금을 지적', ctx.monthCloseIssues('income', YM).some(x => /업체가 비어 있는 입금 1건/.test(x)), true);

// 보류함(가수금) — 달로 자르지 않고 잔량 전체로 경고한다
ctx.__reset({ finance_income:[ { id:'i1', date:'2026-07-01', amount:100000, companyName:'유원에프앤비' } ],
  ledger_held:[ { k:'h1', amount:30000, date:'2026-06-20' } ] });
t('★ 보류함에 남은 입금을 지적', ctx.monthCloseIssues('income', YM).some(x => /보류함에 남아 있는 입금 1건/.test(x)), true);
ctx.__reset({ finance_income:[ { id:'i1', date:'2026-07-01', amount:100000, companyName:'유원에프앤비' } ], ledger_held:[] });
t('보류함이 비었으면 지적하지 않는다', ctx.monthCloseIssues('income', YM).some(x => /보류함/.test(x)), false);

// 출금
ctx.__reset({ finance_expense:[
  { id:'e1', date:'2026-07-01', amount:100000, category:'exp-rent' },
  { id:'e2', date:'2026-07-02', amount:50000,  category:'' },
  { id:'e3', date:'2026-07-03', amount:0,      category:'exp-other' }
]});
const exIss = ctx.monthCloseIssues('expense', YM);
t('분류 빈 출금을 지적', exIss.some(x => /분류가 비어 있는 출금 1건/.test(x)), true);
t('금액 0원 출금을 지적', exIss.some(x => /금액이 0원인 출금 1건/.test(x)), true);

// 점검 항목이 마감을 막지는 않는다
ctx.__reset({ payroll_monthly:[ { id:'p1', empSid:'S002', ym:YM, status:'draft', baseSalary:0 } ] });
t('점검할 게 있어도 1단계는 잠글 수 있다', stOf('attend').canLock, true);
ctx.monthCloseLock('attend', YM);
t('★ 점검할 게 있어도 급여를 잠글 수 있다 (막지 않는다)', ctx.monthCloseLock('payroll', YM).ok, true);

// 잠긴 단계는 점검을 다시 세지 않는다
lockUpTo(1);
t('잠긴 단계의 점검은 빈 목록', stOf('attend').issues, []);

// 데이터가 깨져 있어도 화면이 죽지 않는다
ctx.__reset({ contracts:'배열아님', payroll_monthly:null, overtime_records:{ a:1 } });
t('깨진 데이터에도 목록이 나온다', ctx.monthCloseState(YM).length, 6);
t('깨진 데이터에 점검이 터지지 않는다', Array.isArray(ctx.monthCloseIssues('contract', YM)), true);

/* ═══ 8. 저장이 실패하면 마감했다고 기록하지 않는다 ═══ */
{
  const c2 = makeCtx();
  c2.__reset({});
  c2.dbSet = function(){ return false; };          // 저장이 안 되는 상황
  const r = c2.monthCloseLock('attend', YM);
  t('★ 저장 실패면 마감 실패로 알린다', r.ok, false);
  t('★ 실패 이유가 저장 실패', /저장 실패/.test(r.why), true);
  t('★ 실패했으면 마감 기록을 남기지 않는다', (c2.__store()['month_close_log'] || []).length, 0);
}

/* ═══ 9. ★ 근태 마감월 관문 — 저장 함수 한 자리에서 막는가 ═══ */
function gateCtx(){
  let store = {
    locked_attend_months:['2026-07'],
    attendance_records:[
      { id:'a1', sid:'S001', date:'2026-07-10', type:'leave', hours:8 },
      { id:'a2', sid:'S001', date:'2026-08-10', type:'leave', hours:8 }
    ],
    overtime_records:[ { id:'o1', sid:'S001', date:'2026-07-11', kind:'overtime', hours:2 } ],
    comp_leave_records:[ { id:'k1', sid:'S001', date:'2026-07-12', hours:8 } ],
    my_schedules:[ { id:'s1', date:'2026-07-13', type:'eum-work' } ]
  };
  const toasts = [];
  const c = {
    console, Date, Math, Object, JSON, Array, String, Number, parseInt, isNaN, RegExp,
    window:{}, CURRENT_USER:{ sid:'S001', name:'권형하' },
    showToast(m){ toasts.push(String(m)); },
    dbGet(k, d){ return (k in store) ? store[k] : d; },
    dbSet(k, v){ store[k] = v; return true; },
    _recStamp(x){ return x; },
    _recCanDirect(){ return false; },
    _REC_BADKEY: /[.#$/[\]]/,
    isAttendLocked(ym){ return (store.locked_attend_months || []).indexOf(ym) >= 0; }
  };
  vm.createContext(c);
  vm.runInContext(slice('// ── 근태·휴가 마감월 관문', '\nfunction erpNormName('), c);
  c.__store = () => store;
  c.__toasts = toasts;
  return c;
}
const g = gateCtx();
const attOf = id => (g.__store().attendance_records || []).find(x => x.id === id);

t('★ 잠긴 달에 근태 추가 거부',
  g.dbUpsert('attendance_records', { id:'new1', sid:'S001', date:'2026-07-20', type:'leave' }), false);
t('★ 실제로 안 들어갔다', attOf('new1'), undefined);
t('거부하면 알려준다', /근태·휴가 마감/.test(g.__toasts.join('|')), true);

t('★ 잠긴 달 근태 수정 거부', g.dbPatch('attendance_records', 'a1', { hours:4 }), false);
t('★ 시간이 그대로', attOf('a1').hours, 8);
t('★ 잠긴 달 근태 삭제 거부', g.dbRemove('attendance_records', 'a1'), false);
t('★ 지워지지 않았다', !!attOf('a1'), true);

// 잠긴 달에서 열린 달로 날짜만 옮겨 빼내는 것도 막아야 한다
t('★ 잠긴 달 → 열린 달로 날짜 옮기기 거부', g.dbPatch('attendance_records', 'a1', { date:'2026-08-01' }), false);
t('★ 날짜가 그대로', attOf('a1').date, '2026-07-10');
// 반대 방향 — 열린 달 기록을 잠긴 달로 밀어 넣는 것도 막는다
t('★ 열린 달 → 잠긴 달로 날짜 옮기기 거부', g.dbPatch('attendance_records', 'a2', { date:'2026-07-01' }), false);
t('★ 열린 달 기록의 날짜가 그대로', attOf('a2').date, '2026-08-10');
t('★ upsert 로 잠긴 달에 밀어넣기 거부',
  g.dbUpsert('attendance_records', { id:'a2', sid:'S001', date:'2026-07-02', type:'leave' }), false);
t('★ 그래도 8월', attOf('a2').date, '2026-08-10');

// 열린 달은 그대로 된다
t('열린 달은 추가된다',
  g.dbUpsert('attendance_records', { id:'new2', sid:'S001', date:'2026-08-20', type:'leave' }), true);
t('열린 달 기록이 들어갔다', !!attOf('new2'), true);
t('열린 달은 수정된다', g.dbPatch('attendance_records', 'a2', { hours:4 }), true);
t('열린 달은 삭제된다', g.dbRemove('attendance_records', 'new2'), true);

// 초과근로·보상휴가도 같은 관문을 지난다
t('★ 잠긴 달 초과근로 추가 거부',
  g.dbUpsert('overtime_records', { id:'o9', sid:'S001', date:'2026-07-15', kind:'overtime', hours:1 }), false);
t('★ 잠긴 달 초과근로 삭제 거부', g.dbRemove('overtime_records', 'o1'), false);
t('★ 잠긴 달 보상휴가 삭제 거부', g.dbRemove('comp_leave_records', 'k1'), false);

// 여러 건 — 한 건이라도 잠긴 달이면 전부 거부 (일부만 들어가면 어디까지 됐는지 알 수 없다)
t('★ 섞인 여러 건은 전부 거부', g.dbUpsertMany('attendance_records', [
  { id:'m1', sid:'S001', date:'2026-08-01', type:'leave' },
  { id:'m2', sid:'S001', date:'2026-07-01', type:'leave' }
]), false);
t('★ 열린 달 건도 안 들어갔다', attOf('m1'), undefined);
t('전부 열린 달이면 들어간다', g.dbUpsertMany('attendance_records', [
  { id:'m3', sid:'S001', date:'2026-08-02', type:'leave' },
  { id:'m4', sid:'S001', date:'2026-08-03', type:'leave' }
]), true);
t('★ 잠긴 달 건이 섞인 일괄삭제 거부', g.dbRemoveMany('attendance_records', ['m3','a1']), false);
t('★ 열린 달 건도 안 지워졌다', !!attOf('m3'), true);
t('열린 달만이면 일괄삭제된다', g.dbRemoveMany('attendance_records', ['m3','m4']), true);

// 근태가 아닌 표는 이 관문을 지나지 않는다
t('계약은 관문 대상이 아니다',
  g.dbUpsert('contracts', { id:'c1', signDate:'2026-07-01', companyName:'가나' }), true);
t('입금도 아니다', g.dbUpsert('finance_income', { id:'f1', date:'2026-07-01', amount:1 }), true);

// 날짜가 없는 근태 레코드는 어느 달인지 알 수 없으니 막지 않는다
t('날짜 없는 근태는 막지 않는다',
  g.dbUpsert('attendance_records', { id:'nd1', sid:'S001', type:'leave' }), true);
t('날짜 형식이 아닌 것도 막지 않는다',
  g.dbUpsert('attendance_records', { id:'nd2', sid:'S001', date:'미정', type:'leave' }), true);

// 잠금이 풀리면 다시 된다
g.__store().locked_attend_months = [];
t('해제하면 근태 수정된다', g.dbPatch('attendance_records', 'a1', { hours:4 }), true);
t('수정이 반영됐다', attOf('a1').hours, 4);
t('해제하면 삭제된다', g.dbRemove('attendance_records', 'a1'), true);

/* ═══ 10. 화면 배선 — 한쪽만 넣으면 안 보인다 ═══ */
t('메뉴에 월말 마감이 있다', /\{ id:'fin\/close',\s+icon:'🔐', text:'월말 마감' \}/.test(src), true);
t('라우터가 MonthClose 를 연결한다', /current === 'fin\/close'[\s\S]{0,120}h\(MonthClose/.test(src), true);
t('MonthClose 화면이 있다', /^function MonthClose\(props\)\{/m.test(src), true);
t('도움말이 있다', /'fin\/close':\s+'월말 마감 화면입니다/.test(src), true);
t('새 잠금 키가 동기화 목록에 있다', /'locked_attend_months'/.test(src.slice(0, src.indexOf('FB_APPCHECK_KEY'))), true);
t('마감 기록 키가 동기화 목록에 있다', /'month_close_log',/.test(src.slice(0, src.indexOf('FB_APPCHECK_KEY'))), true);

// 개별 화면 다섯 개가 모두 마감 엔진을 거치는가 (직접 setXLock 을 부르면 순서가 무너진다)
['contract','income','expense','payroll','irregular','attend'].forEach(function(k){
  t(k + ' 화면이 마감 엔진을 거친다', new RegExp("monthCloseLockAsk\\('" + k + "'").test(src), true);
  t(k + ' 화면 해제도 엔진을 거친다', new RegExp("monthCloseUnlockAsk\\('" + k + "'").test(src), true);
});
// 잠금 버튼에서 직접 setXLock(…, true) 을 부르는 자리가 남아 있지 않은가
t('★ 화면에서 직접 잠그는 자리가 없다',
  /set(Contract|Income|Expense|Payroll|Irregular|Attend)Lock\([^)]*,\s*true\)/.test(
    src.replace(/function monthCloseLock\([\s\S]*?\n\}/, '')), false);
t('★ 화면에서 직접 해제하는 자리가 없다',
  /set(Contract|Income|Expense|Payroll|Irregular|Attend)Lock\([^)]*,\s*false\)/.test(
    src.replace(/function monthCloseUnlock\([\s\S]*?\n\}/, '')), false);

// 근태관리 화면에 잠금 버튼이 있는가
t('근태관리에 마감 버튼이 있다', /isAttendLocked\(selYM\)/.test(src), true);

// 이음센터 이관이 마감월을 건드리지 않는가 — 그리고 못 옮긴 일정을 지우지 않는가
t('이음센터 이관이 마감월을 건너뛴다', /eumLocked/.test(src), true);
// 지우는 그 자리에서 _moved 를 확인해야 한다 (대입만 있고 안 쓰면 못 옮긴 일정이 사라진다)
t('★ 이관하지 못한 일정을 지우지 않는다',
  /s\.type !== 'eum-work' \|\| !_moved\[s\.id\]/.test(src), true);

/* ═══ 11. ★ 화면이 실제로 그려지는가 (없는 변수를 부르면 여기서 터진다) ═══ */
function renderMonthClose(store, showYM){
  const ym = showYM || YM;
  const nodes = [];
  const texts = [];
  const rc = {
    console, Date, Math, Object, JSON, Array, String, Number, parseInt, isNaN, RegExp,
    window:{ innerWidth:1440 }, CURRENT_USER:{ sid:'S001', name:'권형하' },
    showToast(){}, popConfirm(){ return Promise.resolve(true); },
    todayYMD(){ return '2026-08-04'; },
    dbGet(k, d){ return (k in store) ? store[k] : d; },
    dbSet(k, v){ store[k] = v; return true; },
    dbUpsert(k, r){ store[k] = (store[k]||[]).concat([r]); return true; },
    dbRemove(k, id){ store[k] = (store[k]||[]).filter(x => x.id !== id); return true; },
    useState(v){ return [v, function(){}]; },
    // 화면이 보고 있는 달을 검사에서 정한다 (기본값은 이번 달이라 7월 잠금이 안 보인다)
    usePersistedState(key, v){ return [ key === 'month_close_ym' ? ym : v, function(){} ]; },
    h(tag, props){
      const kids = Array.prototype.slice.call(arguments, 2);
      const node = { tag: (typeof tag === 'function' ? (tag.name || 'fn') : tag), props: props || {}, kids: kids };
      nodes.push(node);
      kids.forEach(function walk(c){
        if(typeof c === 'string') texts.push(c);
        else if(Array.isArray(c)) c.forEach(walk);
      });
      return node;
    }
  };
  vm.createContext(rc);
  vm.runInContext(slice('// ===== 급여 편의기능 헬퍼 =====', '// 감사 로그'), rc);
  vm.runInContext(slice('// ============ 월말 마감 ============', 'function FinanceVAT()'), rc);
  const tree = rc.MonthClose({ onNavigate: function(){} });
  return { tree, nodes, texts, all: texts.join(' ') };
}

// 아무것도 잠기지 않은 달
{
  let threw = '';
  let r = null;
  try { r = renderMonthClose({}); } catch(e){ threw = String(e && e.message); }
  t('★ 화면이 터지지 않고 그려진다', threw, '');
  t('여섯 단계 이름이 다 보인다',
    ['근태·휴가','급여','비정규직','계약','입금','출금'].every(n => r.all.indexOf(n) >= 0), true);
  t('진행이 0/6 로 보인다', r.all.indexOf('0 / 6 단계 마감') >= 0, true);
  t('마감 버튼이 여섯 개', r.nodes.filter(n => n.kids[0] === '마감').length, 6);
  t('1단계 마감 버튼은 눌린다', r.nodes.find(n => n.kids[0] === '마감').props.disabled, false);
  t('해제 버튼은 아직 없다', r.nodes.filter(n => n.kids[0] === '해제').length, 0);
  t('막힌 단계 안내가 보인다', r.all.indexOf('1. 근태·휴가 먼저') >= 0, true);
}
// 전부 잠긴 달 — 해제는 마지막 하나만 열린다
{
  const s = {};
  ORDER.forEach(k => { s[KEYS[k]] = [YM]; });
  s['month_close_log'] = [{ id:'mc-attend-2026-07', step:'attend', ym:YM,
    at:'2026-07-31T09:00:00.000Z', by:'S001', byName:'권형하' }];
  const r = renderMonthClose(s);
  t('마감 완료 표시', r.all.indexOf('✓ 2026-07 마감 완료') >= 0, true);
  t('진행이 6/6', r.all.indexOf('6 / 6 단계 마감') >= 0, true);
  t('해제 버튼이 여섯 개', r.nodes.filter(n => n.kids[0] === '해제').length, 6);
  const unlockable = r.nodes.filter(n => n.kids[0] === '해제' && n.props.disabled === false);
  t('★ 화면에서도 마지막 하나만 해제된다', unlockable.length, 1);
  t('막고 있는 단계를 말풍선으로 알려준다',
    r.nodes.some(n => n.kids[0] === '해제' && /먼저 해제해야 한다/.test(n.props.title || '')), true);
  t('누가 언제 마감했는지 보인다', r.all.indexOf('07-31 권형하') >= 0, true);
}
// 점검할 것이 있는 달
{
  const r = renderMonthClose({ payroll_monthly:[] , overtime_records:[
    { id:'o1', sid:'S009', date:'2026-07-02', kind:'overtime', hours:0 } ]});
  t('점검 건수 배지', r.all.indexOf('점검 1건') >= 0, true);
  t('점검 내용이 펼쳐져 보인다', /시간이 0인 초과근로/.test(r.all), true);
  t('막지 않는다고 알린다', r.all.indexOf('막는 것은 아니다') >= 0, true);
  t('점검이 있어도 마감 버튼은 눌린다',
    r.nodes.find(n => n.kids[0] === '마감').props.disabled, false);
}
// 잘못된 월
{
  const r = renderMonthClose({});
  t('월 목록에 18개월이 있다', r.nodes.filter(n => n.tag === 'option').length >= 18, true);
}

console.log('\n  === ' + pass + ' 통과 / ' + fail + ' 실패 ===');
process.exit(fail ? 1 : 0);
