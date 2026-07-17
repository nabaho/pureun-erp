// ============ 월별급여 ============
// 2026년 4대보험 요율 (근로자 부담분)
var PAYROLL_RATES_2026 = {
  // ── 근로자 부담분 ──
  pension:        0.045,    // 국민연금 4.5%
  pensionMax:     277650,
  pensionWageMax: 6170000,  // 기준소득월액 상한
  pensionWageMin: 390000,   // 기준소득월액 하한
  healthIns:      0.03545,  // 건강보험 3.545%
  longCare:       0.1295,   // 장기요양 (건강보험료 × 12.95%)
  empIns:         0.009,    // 고용보험 0.9% (실업급여)
  // ── 사업주 부담분 ──
  empPension:     0.045,    // 동일
  empHealthIns:   0.03545,
  empLongCare:    0.1295,
  empEmpInsBase:  0.009,    // 실업급여 0.9%
  empEmpInsExtra: 0.0025,   // 고용안정·직업능력 0.25% (150인 미만)
  empWorkers:     0.007,    // 산재보험 (업종별 0.7%~36% / 사무직 평균 0.7%)
  // ── 2026 최저임금 ──
  minWageHourly:  10320,
  minWageMonthly: 2156880,  // 10,320 × 209h
  // ── 비과세 한도 (월) ──
  nonTaxableMealMax:      200000,  // 식대
  nonTaxableCarMax:       200000,  // 자가운전보조
  nonTaxableChildcareMax: 200000   // 6세 이하 보육수당
};

// 간이세액표 (대략적인 근사 — 실제 세액표 일부 발췌, 부양가족 1인 기준)
// 월급여(천원) → 부양가족 수별 소득세
function calcIncomeTax2026(monthlyPay, dependents){
  var pay = monthlyPay; var d = Math.max(1, parseInt(dependents||1,10));
  if(pay < 1060000) return 0;
  if(pay < 1500000) return Math.round(Math.max(0,(pay-1060000)*0.06 - (d-1)*5000));
  if(pay < 3000000) return Math.round(Math.max(0,((pay-1500000)*0.15 + 26400) - (d-1)*8000));
  if(pay < 4500000) return Math.round(Math.max(0,((pay-3000000)*0.24 + 251400) - (d-1)*10000));
  if(pay < 8800000) return Math.round(Math.max(0,((pay-4500000)*0.35 + 611400) - (d-1)*12500));
  return Math.round(Math.max(0,((pay-8800000)*0.38 + 2116400) - (d-1)*15000));
}

// 직원 급여 자동계산
// rrn(주민번호)→지급월 기준 만 나이 (없으면 null)
function _ageFromRrn(rrn, ymStr){
  var d = String(rrn||'').replace(/[^0-9]/g,'');
  if(d.length < 7) return null;
  var yy = parseInt(d.slice(0,2),10), mm = parseInt(d.slice(2,4),10), c = d.charAt(6);
  var by = (c==='1'||c==='2'||c==='5'||c==='6') ? 1900+yy : (c==='3'||c==='4'||c==='7'||c==='8') ? 2000+yy : (c==='9'||c==='0') ? 1800+yy : null;
  if(by===null || mm<1 || mm>12) return null;
  var p = String(ymStr||'').split('-');
  if(p.length<2) return null;
  var ymY = parseInt(p[0],10), ymM = parseInt(p[1],10);
  if(!ymY || !ymM) return null;
  return ymY - by - (ymM < mm ? 1 : 0);
}
// rrn + 입사일 → 만 65세 이후 신규 입사 여부 (고용보험 실업급여 적용제외)
function _hiredAfter65(rrn, hireDate){
  var d = String(rrn||'').replace(/[^0-9]/g,'');
  if(d.length < 7) return false;
  var yy = parseInt(d.slice(0,2),10), mm = parseInt(d.slice(2,4),10), dd = parseInt(d.slice(4,6),10), c = d.charAt(6);
  var by = (c==='1'||c==='2'||c==='5'||c==='6') ? 1900+yy : (c==='3'||c==='4'||c==='7'||c==='8') ? 2000+yy : (c==='9'||c==='0') ? 1800+yy : null;
  if(by===null) return false;
  var h = String(hireDate||'').split('-');
  if(h.length<3) return false;
  var hy = parseInt(h[0],10), hm = parseInt(h[1],10), hdd = parseInt(h[2],10);
  if(!hy || !hm || !hdd) return false;
  var ageAtHire = hy - by - ((hm < mm || (hm===mm && hdd < dd)) ? 1 : 0);
  return ageAtHire >= 65;
}

function calcPayroll(rec){
  var rates = PAYROLL_RATES_2026;
  // ★ 임금항목 메타데이터 로드 (동적 분류용)
  var payItems = dbGet('pay_items', PAY_ITEM_SEED);
  var itemMap = {};
  payItems.forEach(function(p){ itemMap[p.code] = p; });

  // ★ rec.allowances를 pay_items 메타로 동적 분류
  var allowSum = 0;
  var nonTaxFromAllow = 0;     // 비과세 합계 (한도 적용)
  var ordinaryFromAllow = 0;   // 통상임금 포함 합계
  var averageFromAllow = 0;    // 평균임금 포함 합계
  var nonTaxDetail = {};       // 항목별 비과세 상세
  var overLimitDetail = {};    // 비과세 한도 초과 (과세 처리분)
  (rec.allowances||[]).forEach(function(a){
    var amt = parseInt(a.amount)||0;
    if(amt === 0) return;
    var item = itemMap[a.code];
    // 공제 분류: 입력 금액(양수)을 차감(-)으로 처리
    if(item && item.category === 'deduction'){
      allowSum -= Math.abs(amt);
      return;
    }
    allowSum += amt;
    if(!item){
      // 매칭 안 되면 기본: 과세 + 통상/평균 미포함
      return;
    }
    if(item.taxable === false){
      // 비과세 항목 (한도 적용)
      var limit = parseInt(item.taxFreeLimit)||0;
      var nonTax = limit > 0 ? Math.min(amt, limit) : amt;
      var overLimit = amt - nonTax;
      nonTaxFromAllow += nonTax;
      nonTaxDetail[a.code] = { name:item.name, amount:nonTax };
      if(overLimit > 0) overLimitDetail[a.code] = { name:item.name, amount:overLimit, limit:limit };
    }
    if(item.isOrdinary) ordinaryFromAllow += amt;
    if(item.isAverage) averageFromAllow += amt;
  });

  // ★ 통상임금 (월): 기본급 + 고정수당(레거시) + isOrdinary 임금항목
  var ordinaryMonthly = (rec.baseSalary||0) + (rec.fixedAllowance||0) + ordinaryFromAllow;
  // 법정수당: 통상시급 기반 (ordinaryMonthly 전달)
  var legal = calcLegalAllowances(rec, ordinaryMonthly);
  // 성과금 자동 합산 (finance_income.perfShares)
  var perf = calcPerfBonus(rec.empSid, rec.ym);
  // ★ Fix#2: 이중계산 방지 — perf.total(입금연동 성과)와 rec.bonus(수동 입력 상여)는 별개
  // 단, rec.bonusIsPerf 플래그가 true이면 수동 입력값이 성과금 대체본이므로 perf.total 제외
  var totalBonus = (rec.bonus||0) + (rec.bonusIsPerf ? 0 : perf.total);

  // 레거시 호환: rec.nonTaxableMeal/Car/Childcare 직접 지정 시 추가 적용
  var nonTaxMeal = Math.min(parseInt(rec.nonTaxableMeal)||0, rates.nonTaxableMealMax);
  var nonTaxCar = Math.min(parseInt(rec.nonTaxableCar)||0, rates.nonTaxableCarMax);
  var nonTaxChildcare = Math.min(parseInt(rec.nonTaxableChildcare)||0, rates.nonTaxableChildcareMax);
  // 총 비과세 = pay_items 자동 분류 + 레거시 필드
  var totalNonTaxable = nonTaxFromAllow + nonTaxMeal + nonTaxCar + nonTaxChildcare;

  // 일할계산 (입사·퇴사·휴직 시 근무일수 기준)
  var workDays = parseInt(rec.workDays)||0;
  // ★ Fix#3: 해당 월의 실제 일수 기준으로 비교 (2월 만근 28일도 일할계산 오적용 방지)
  var _ymP = (rec.ym||'').split('-');
  var _mDays = (_ymP.length===2) ? new Date(parseInt(_ymP[0],10), parseInt(_ymP[1],10), 0).getDate() : 30;
  var prorated = workDays > 0 && workDays < _mDays;
  var prorate = prorated ? (workDays / _mDays) : 1;
  var baseSalaryProrated = Math.round((rec.baseSalary||0) * prorate);

  // 지급액 합계
  var grossPay = baseSalaryProrated + allowSum + legal.total + totalBonus;

  // 4대보험·소득세 과세표준 = 지급액 - 비과세
  var insurableBase = Math.max(0, grossPay - totalNonTaxable);

  // ★ 나이별 보험료 면제 판정 (rrn 기반)
  var _emp = (dbGet('user_accounts', USERS_SEED)||[]).find(function(u){ return u.sid===rec.empSid; });
  var _age = _emp ? _ageFromRrn(_emp.rrn, rec.ym) : null;
  var _pensionExempt = (_age != null && _age >= 60);
  var _empInsExempt  = _emp ? _hiredAfter65(_emp.rrn, _emp.hireDate) : false;

  // 근로자 부담분
  var pensionBase = Math.max(rates.pensionWageMin, Math.min(insurableBase, rates.pensionWageMax));
  var pension   = rec.pensionOverride != null ? rec.pensionOverride : (_pensionExempt ? 0 : Math.round(pensionBase * rates.pension));
  var healthIns = rec.healthInsOverride != null ? rec.healthInsOverride : Math.round(insurableBase * rates.healthIns);
  var longCare  = rec.longCareOverride  != null ? rec.longCareOverride  : Math.round(healthIns * rates.longCare);
  var empIns    = rec.empInsOverride    != null ? rec.empInsOverride    : (_empInsExempt ? 0 : Math.round(insurableBase * rates.empIns));
  var incomeTax = rec.incomeTaxOverride != null ? rec.incomeTaxOverride : calcIncomeTax2026(insurableBase, rec.dependents||1);
  var localTax  = rec.localTaxOverride  != null ? rec.localTaxOverride  : Math.round(incomeTax * 0.1);
  var totalDeduct = pension + healthIns + longCare + empIns + incomeTax + localTax;

  // 사업주 부담분
  var empPension    = _pensionExempt ? 0 : Math.round(pensionBase * rates.empPension);
  var empHealthIns  = Math.round(insurableBase * rates.empHealthIns);
  var empLongCare   = Math.round(empHealthIns * rates.empLongCare);
  var empEmpIns     = Math.round(insurableBase * ((_empInsExempt ? 0 : rates.empEmpInsBase) + rates.empEmpInsExtra));
  var empWorkers    = Math.round(insurableBase * rates.empWorkers);
  var employerTotal = empPension + empHealthIns + empLongCare + empEmpIns + empWorkers;

  // ★ 평균임금 기초 (퇴직금·휴업수당 산정용)
  var averageBase = (rec.baseSalary||0) + (rec.fixedAllowance||0) + averageFromAllow + totalBonus;

  // 최저임금 위반 체크 (일할계산 적용 안 된 경우만)
  var minWageWarning = !prorated && (rec.baseSalary||0) > 0 && (rec.baseSalary||0) < rates.minWageMonthly;

  return { grossPay:grossPay, allowSum:allowSum,
    legal:legal, perfBonus:perf, totalBonus:totalBonus,
    nonTaxable:{meal:nonTaxMeal, car:nonTaxCar, childcare:nonTaxChildcare,
      fromAllow:nonTaxFromAllow, detail:nonTaxDetail, overLimit:overLimitDetail,
      total:totalNonTaxable},
    insurableBase:insurableBase,
    ordinaryMonthly:ordinaryMonthly,    // ★ 통상임금 (월)
    averageBase:averageBase,             // ★ 평균임금 기초
    workDays:workDays, prorated:prorated, prorate:prorate, baseSalaryProrated:baseSalaryProrated,
    pension:pension, healthIns:healthIns, longCare:longCare, empIns:empIns,
    incomeTax:incomeTax, localTax:localTax,
    totalDeduct:totalDeduct, netPay:grossPay-totalDeduct,
    employer:{pension:empPension, healthIns:empHealthIns, longCare:empLongCare, empIns:empEmpIns, workers:empWorkers, total:employerTotal},
    minWageWarning:minWageWarning, minWageMonthly:rates.minWageMonthly };
}

// 법정수당 계산 (근로기준법 56조)
// 통상시급 = 월 통상임금 / 209시간 (주40시간 + 주휴8시간 = 209시간/월)
// ★ ordinaryMonthly 외부 전달 시 사용 (pay_items isOrdinary 자동 반영). 미전달 시 baseSalary+fixedAllowance.
function calcLegalAllowances(rec, ordinaryMonthly){
  var la = rec.legalAllowances || {};
  var monthly = (ordinaryMonthly != null) ? ordinaryMonthly : ((rec.baseSalary||0) + (rec.fixedAllowance||0));
  var ordinaryWage = Math.round(monthly / 209);
  var otHrs = parseFloat(la.overtimeHours)||0;
  var nightHrs = parseFloat(la.nightHours)||0;
  var holidayHrs = parseFloat(la.holidayHours)||0;
  var weeklyHrs = parseFloat(la.weeklyWorkHours)||0;
  // 연장근로: 통상시급 × 1.5
  var overtime = Math.round(otHrs * ordinaryWage * 1.5);
  // 야간근로 (22:00~06:00): 추가 0.5배
  var night = Math.round(nightHrs * ordinaryWage * 0.5);
  // 휴일근로: 8시간 이내 1.5배, 8시간 초과 2.0배
  var holiday1 = Math.min(holidayHrs, 8) * ordinaryWage * 1.5;
  var holiday2 = Math.max(0, holidayHrs - 8) * ordinaryWage * 2.0;
  var holiday = Math.round(holiday1 + holiday2);
  // 주휴수당 자동: 주 15시간 이상 + 만근 (시급제·주급제 적용. 월급제는 통상 기본급 포함이므로 0 권장)
  var weeklyAuto = 0;
  if(la.autoWeeklyHoliday && weeklyHrs >= 15){
    var dailyHrs = Math.min(weeklyHrs / 5, 8); // 1일 평균 (8h 한도)
    weeklyAuto = Math.round(dailyHrs * ordinaryWage * 4.345); // 월 평균 4.345주
  }
  var weeklyManual = parseInt(la.weeklyHolidayPay)||0;
  var weekly = weeklyManual + weeklyAuto;
  var total = overtime + night + holiday + weekly;
  return {
    ordinaryWage:ordinaryWage,
    overtimeHours:otHrs, overtime:overtime,
    nightHours:nightHrs, night:night,
    holidayHours:holidayHrs, holiday:holiday,
    weeklyHours:weeklyHrs, weekly:weekly, weeklyAuto:weeklyAuto, weeklyManual:weeklyManual,
    autoWeeklyHoliday:!!la.autoWeeklyHoliday,
    total:total
  };
}


// ============================================================
// 월별급여 (PayrollManagement)
// 데이터: payroll_monthly [{sid,ym,baseSalary,allowances,deductions,...}]
// 인사관리/월별급여 = PayrollLedger(매트릭스) + PayrollPayslip(개별)
// ============================================================
function PayrollManagement(props){
  // 기본 selYM = 당월
  var nowYM = todayYM();
  var ys = useState(nowYM); var selYM = ys[0]; var setSelYM = ys[1];
  var ts = useState('ledger'); var tab = ts[0]; var setTab = ts[1];
  var ss = useState(null); var selSid = ss[0]; var setSelSid = ss[1];

  // 지급월(다음달) 계산
  var __py = parseInt(selYM.slice(0,4),10);
  var __pm = parseInt(selYM.slice(5,7),10) + 1;
  if(__pm > 12){ __pm = 1; __py++; }
  var payYM = __py + '-' + String(__pm).padStart(2,'0');

  var TABS_DEFAULT = [
    { v:'ledger',    label:'📊 급여대장 (정규직)' },
    { v:'payslip',   label:'📄 급여명세서 (개별)' },
    { v:'irregular', label:'📑 비정규직' },
    { v:'history',   label:'👤 개인이력' }
  ];
  // 탭 순서 (localStorage 저장)
  var loadedOrder = (function(){
    try{
      var s = localStorage.getItem('pureun_v6_payroll_tab_order');
      if(s){
        var a = JSON.parse(s);
        if(Array.isArray(a)){
          // 기존 저장(3개) 호환 + 누락된 탭 자동 보충
          var defaults = ['ledger','payslip','irregular','history'];
          defaults.forEach(function(v){ if(a.indexOf(v) < 0) a.push(v); });
          return a.filter(function(v){ return defaults.indexOf(v) >= 0; });
        }
      }
    }catch(e){}
    return ['ledger','payslip','irregular','history'];
  })();
  var toS = useState(loadedOrder); var tabOrder = toS[0]; var setTabOrder = toS[1];
  var dgS = useState(null); var dragV = dgS[0]; var setDragV = dgS[1];
  var TABS = tabOrder.map(function(v){ return TABS_DEFAULT.find(function(x){return x.v===v;}); }).filter(Boolean);
  function onTabDrop(toV){
    if(!dragV || dragV===toV){ setDragV(null); return; }
    var newOrder = tabOrder.filter(function(x){return x!==dragV;});
    var idx = newOrder.indexOf(toV);
    newOrder.splice(idx<0?0:idx, 0, dragV);
    setTabOrder(newOrder);
    try{ localStorage.setItem('pureun_v6_payroll_tab_order', JSON.stringify(newOrder)); }catch(e){}
    setDragV(null);
  }

  return h('div', { className:'page' },
    // 지급 흐름 안내
    h('div', { style:{ background:'#eff6ff', border:'1px solid #bfdbfe', borderRadius:'6px', padding:'8px 14px', marginBottom:'12px', fontSize:'12px', color:'#1e40af', display:'flex', alignItems:'center', gap:'10px', flexWrap:'wrap' } },
      h('span', { style:{ fontWeight:700 } }, '📌 '+selYM+' 근무분'),
      h('span', { style:{ color:'#3b82f6' } }, '→'),
      h('span', { style:{ fontWeight:700, color:'#1e3a8a' } }, payYM+' 지급'),
      h('span', { style:{ color:'#64748b', fontSize:'11px', marginLeft:'auto' } }, '※ 화면의 월(ym)은 근무월. 지급은 다음달입니다.')
    ),
    h('div', { style:{ display:'flex', gap: window.innerWidth<=768?'5px':'4px', marginBottom:'10px',
      borderBottom:'2px solid #e5e7eb', overflowX: window.innerWidth<=768?'auto':'visible',
      flexWrap: window.innerWidth<=768?'nowrap':'wrap', WebkitOverflowScrolling:'touch',
      paddingBottom: window.innerWidth<=768?'4px':'0' } },
      TABS.map(function(x){
        var on = tab === x.v;
        var dragging = dragV === x.v;
        var _m = window.innerWidth<=768;
        return h('button', { key:x.v,
          draggable: !_m,
          onDragStart: _m?null:function(e){ setDragV(x.v); e.dataTransfer.effectAllowed='move'; },
          onDragOver:  _m?null:function(e){ e.preventDefault(); e.dataTransfer.dropEffect='move'; },
          onDrop:      _m?null:function(e){ e.preventDefault(); onTabDrop(x.v); },
          onDragEnd:   _m?null:function(){ setDragV(null); },
          onClick:function(){ setTab(x.v); },
          style:{ padding: _m?'7px 12px':'9px 14px', borderRadius: _m?'20px':'5px',
            fontSize: _m?'12px':'13px', cursor:'pointer', fontWeight:on?700:500,
            background: on?'#1e40af':(_m?'#f8fafc':'transparent'),
            color: on?'#fff':'#475569',
            border: _m?'1px solid '+( on?'#1e40af':'#cbd5e1'):'none',
            flexShrink: _m?0:undefined, whiteSpace:'nowrap',
            marginBottom:'0' } }, x.label);
      })
    ),
    tab === 'ledger'
      ? h(PayrollLedger,  { selYM:selYM, setSelYM:setSelYM, onSelect:function(sid){setSelSid(sid); setTab('payslip');} })
      : tab === 'payslip'
      ? h(ErrorBoundary, { label:'급여명세서' },
          h(PayrollPayslip, { selYM:selYM, setSelYM:setSelYM, selSid:selSid, setSelSid:setSelSid, onBack:function(){setTab('ledger');} }))
      : tab === 'irregular'
      ? h(PayrollIrregular, { selYM:selYM, setSelYM:setSelYM })
      : h(ErrorBoundary, { label:'개인이력' }, h(PayrollHistory, { onNavigate:props.onNavigate }))
  );
}

// ── 개인이력 (직원별 월별/연도별 금액 조회) ──
function PayrollHistory(props){
  var onNav = props.onNavigate || function(){};
  var users = sortUsers(dbGet('user_accounts', USERS_SEED).filter(function(u){
    return u.status==='active' || u.status==='leave' || u.status==='retired';
  }));
  var allRecs = dbGet('payroll_monthly', []);

  // 직원 sid (기본: 첫 직원)
  var ss = useState(users[0] ? users[0].sid : ''); var selSid = ss[0]; var setSelSid = ss[1];

  // 사용 가능한 연도 (해당 직원의 급여기록에서 추출)
  var sidRecs = allRecs.filter(function(r){ return r.empSid === selSid; });
  var years = Array.from(new Set(sidRecs.map(function(r){ return r.ym.slice(0,4); }))).sort();
  var thisYear = String((new Date()).getFullYear());
  var defaultYear = years.length > 0 ? years[years.length-1] : thisYear;

  var ys = useState(defaultYear); var selYear = ys[0]; var setSelYear = ys[1];
  // 선택 직원이 바뀌면 연도도 재설정
  if(selSid && years.length > 0 && years.indexOf(selYear) < 0){
    setSelYear(years[years.length-1]);
  }

  // 뷰 모드: 'detail' (한 해 상세) | 'compare' (다년 비교)
  var vm = useState('detail'); var viewMode = vm[0]; var setViewMode = vm[1];
  var hzS = usePersistedState('payhist_zoom', 100); var histZoom = hzS[0]; var setHistZoom = hzS[1];

  var selUser = users.find(function(u){ return u.sid === selSid; });

  // 한 해 원시 필드: 급여대장(PayrollLedger)과 같은 raw 필드를 그대로 표시 → 사용자가 직접 대조 가능
  function renderRaw(){
    // PayrollLedger / 환경설정 임금항목과 일치하는 raw 필드 정렬
    var COLS = [
      { k:'baseSalary',          label:'기본급',     g:'pay' },
      { k:'hourlyWage',          label:'시급',       g:'pay' },
      { k:'workHours',           label:'근로시간',   g:'pay' },
      { k:'nonTaxableMeal',      label:'식대',       g:'allow' },
      { k:'nonTaxableCar',       label:'차량유지',   g:'allow' },
      { k:'nonTaxableChildcare', label:'육아수당',   g:'allow' },
      { k:'overtimePay',         label:'연장',       g:'allow' },
      { k:'nightPay',            label:'야간',       g:'allow' },
      { k:'holidayPay',          label:'휴일',       g:'allow' },
      { k:'extraOvertimePay',    label:'추가연장',   g:'allow' },
      { k:'unusedLeavePay',      label:'미사용연차', g:'allow' },
      { k:'bonus',               label:'성과급',     g:'allow' },
      { k:'_customSum',          label:'기타(custom)', g:'allow' },
      { k:'absentDeduction',     label:'결근공제',   g:'sub' },
      { k:'subtotal',            label:'소계',       g:'sub' },
      { k:'grossPay',            label:'지급액',     g:'sub' },
      { k:'totalDeduction',      label:'공제계',     g:'ded' },
      { k:'netPay',              label:'실지급',     g:'ded' },
      { k:'businessExpense',     label:'업무비용',   g:'pay' }
    ];
    var grpColor = { pay:'#1e293b', allow:'#2563eb', sub:'#059669', ded:'#dc2626' };
    var grpBg    = { pay:'#f8fafc', allow:'#ecfeff', sub:'#f0fdf4', ded:'#fef2f2' };
    function valOf(r, k){
      if(!r) return null;
      if(k === '_customSum'){
        // rec.allowances 배열의 custom 항목 합계
        var s = 0;
        (r.allowances||[]).forEach(function(a){ s += Number(a.amount||0); });
        return s;
      }
      return r[k];
    }
    var monthRows = [];
    for(var m=1; m<=12; m++){
      var monthStr = String(m).padStart(2,'0');
      var ym = selYear + '-' + monthStr;
      var rec = sidRecs.find(function(r){ return r.ym === ym; });
      monthRows.push({ m:m, ym:ym, rec:rec });
    }
    var totals = {};
    COLS.forEach(function(c){ totals[c.k] = 0; });
    monthRows.forEach(function(row){
      if(!row.rec) return;
      COLS.forEach(function(c){
        var v = valOf(row.rec, c.k);
        if(typeof v === 'number') totals[c.k] += v;
      });
    });
    var tdS = { padding:'5px 7px', borderBottom:'1px solid #f1f5f9', fontFamily:'monospace', textAlign:'right', fontSize:'11px', whiteSpace:'nowrap' };
    var thS = { padding:'6px 7px', borderBottom:'2px solid #e5e7eb', fontWeight:700, fontSize:'10.5px', textAlign:'right', whiteSpace:'nowrap' };
    return h('div', null,
      h('div', { style:{ background:'#fef3c7', border:'1px solid #fde68a', borderRadius:'6px', padding:'10px 14px', marginBottom:'10px', fontSize:'11.5px', color:'#92400e' } },
        '🔍 ', h('strong', null, '원시 필드 보기'), ' — 급여대장(PayrollLedger)의 raw 필드를 그대로 표시합니다. 급여대장 화면과 나란히 비교하세요. ',
        h('br'),
        '※ "기타(custom)" 열은 ', h('code', { style:{ background:'#fef3c7', padding:'1px 4px', borderRadius:'5px' } }, 'rec.allowances[]'), ' 배열의 합계 (PayrollLedger의 custom 컬럼들과 일치)'),
      h('div', { style:{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:'8px', overflow:'auto', maxWidth:'100%' } },
        h('table', { style:{ borderCollapse:'collapse', minWidth:'1400px' } },
          h('thead', null,
            h('tr', null,
              h('th', { style:Object.assign({}, thS, { textAlign:'center', width:'46px', background:'#f8fafc', color:'#475569', position:'sticky', left:0, zIndex:2 }) }, '월'),
              COLS.map(function(c){
                return h('th', { key:c.k, style:Object.assign({}, thS, { background:grpBg[c.g], color:grpColor[c.g] }) }, c.label);
              })
            )
          ),
          h('tbody', null,
            monthRows.map(function(row, idx){
              var r = row.rec;
              return h('tr', { key:row.m,
                style:{ background: idx%2===0 ? '#fff' : '#f8fafc' } },
                h('td', { style:Object.assign({}, tdS, { textAlign:'center', fontWeight:600, fontFamily:'inherit', color: r ? '#1e293b' : '#cbd5e1', background: idx%2===0 ? '#fff' : '#f8fafc', position:'sticky', left:0 }) }, row.m+'월'),
                COLS.map(function(c){
                  var v = valOf(r, c.k);
                  return h('td', { key:c.k, style:Object.assign({}, tdS, { color: r ? (v ? grpColor[c.g] : '#cbd5e1') : '#cbd5e1' }) },
                    r ? (v != null ? (typeof v === 'number' ? v.toLocaleString() : v) : '-') : '-');
                })
              );
            })
          ),
          h('tfoot', null,
            h('tr', { style:{ background:'#f8fafc', borderTop:'2px solid #cbd5e1' } },
              h('td', { style:Object.assign({}, tdS, { textAlign:'center', fontWeight:800, fontFamily:'inherit', color:'#1e293b', borderBottom:'none', background:'#f8fafc', position:'sticky', left:0 }) }, '합계'),
              COLS.map(function(c){
                var t = totals[c.k];
                return h('td', { key:c.k, style:Object.assign({}, tdS, { fontWeight:800, color:grpColor[c.g], borderBottom:'none', background:grpBg[c.g] }) },
                  (c.k==='hourlyWage'||c.k==='workHours') ? '-' : (t||0).toLocaleString());
              })
            )
          )
        )
      )
    );
  }

  // 한 해 상세: 월(1~12) × 항목
  function renderDetail(){
    var COLS = [
      { k:'baseSalary',    label:'기본급',     color:'#1e293b' },
      { k:'allowances',    label:'수당 합계',  color:'#1e293b' }, // 가공: nontaxable + overtime + night + holiday + extraOvertime + unusedLeave
      { k:'bonus',         label:'성과급',     color:'#2563eb' },
      { k:'grossPay',      label:'지급액',     color:'#059669' },
      { k:'totalDeduction',label:'공제계',     color:'#dc2626' },
      { k:'netPay',        label:'실지급',     color:'#1e40af', bold:true }
    ];
    var monthRows = [];
    for(var m=1; m<=12; m++){
      var monthStr = String(m).padStart(2,'0');
      var ym = selYear + '-' + monthStr;
      var rec = sidRecs.find(function(r){ return r.ym === ym; });
      monthRows.push({ m:m, ym:ym, rec:rec });
    }
    // 합계 (급여대장과 동일하게 calcPayroll 기반)
    var totals = {};
    COLS.forEach(function(c){ totals[c.k] = 0; });
    monthRows.forEach(function(row){
      if(!row.rec) return;
      var c = calcPayroll(row.rec);
      totals.baseSalary     += c.prorated ? (c.baseSalaryProrated||0) : (row.rec.baseSalary||0);
      totals.allowances     += (c.allowSum||0);
      totals.bonus          += (c.perfBonus && c.perfBonus.total ? c.perfBonus.total : 0);
      totals.grossPay       += (c.grossPay||0);
      totals.totalDeduction += (c.totalDeduct||0);
      totals.netPay         += (c.netPay||0);
    });
    function cellOf(r, k){
      if(!r) return null;
      var c = calcPayroll(r);
      if(k === 'baseSalary')     return c.prorated ? (c.baseSalaryProrated||0) : (r.baseSalary||0);
      if(k === 'allowances')     return c.allowSum||0;
      if(k === 'bonus')          return (c.perfBonus && c.perfBonus.total) ? c.perfBonus.total : (r ? (r.bonus||0) : 0);
      if(k === 'grossPay')       return c.grossPay||0;
      if(k === 'totalDeduction') return c.totalDeduct||0;
      if(k === 'netPay')         return c.netPay||0;
      return r[k]||0;
    }
    var tdS = { padding:'5px 8px', borderBottom:'1px solid #f1f5f9', fontFamily:'monospace', textAlign:'right', fontSize:'12px' };
    var thS = { padding:'5px 8px', background:'#f8fafc', borderBottom:'2px solid #e5e7eb', fontWeight:700, color:'#475569', fontSize:'11.5px', textAlign:'right' };

    return h('div', { style:{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:'8px', overflow:'auto' } },
      h('table', { style:{ width:'100%', borderCollapse:'collapse', minWidth:'780px' } },
        h('thead', null,
          h('tr', null,
            h('th', { style:Object.assign({}, thS, { textAlign:'center', width:'70px' }) }, '월'),
            COLS.map(function(c){
              return h('th', { key:c.k, style:Object.assign({}, thS, { color:c.color }) }, c.label);
            })
          )
        ),
        h('tbody', null,
          monthRows.map(function(row, idx){
            var r = row.rec;
            return h('tr', { key:row.m,
              style:{ background: idx%2===0 ? '#fff' : '#f8fafc' } },
              h('td', { style:Object.assign({}, tdS, { textAlign:'center', fontWeight:600, fontFamily:'inherit', color: r ? '#1e293b' : '#cbd5e1' }) }, row.m+'월'),
              COLS.map(function(c){
                var v = cellOf(r, c.k);
                return h('td', { key:c.k, style:Object.assign({}, tdS, { color: r ? c.color : '#cbd5e1', fontWeight: c.bold ? 700 : 400 }) },
                  r ? (v||0).toLocaleString() : '-');
              })
            );
          })
        ),
        h('tfoot', null,
          h('tr', { style:{ background:'#f8fafc', borderTop:'2px solid #cbd5e1' } },
            h('td', { style:Object.assign({}, tdS, { textAlign:'center', fontWeight:800, fontFamily:'inherit', color:'#1e293b', borderBottom:'none' }) }, '연 합계'),
            COLS.map(function(c){
              return h('td', { key:c.k, style:Object.assign({}, tdS, { fontWeight:800, color:c.color, borderBottom:'none', fontSize:'13px' }) },
                totals[c.k].toLocaleString());
            })
          )
        )
      )
    );
  }

  // 다년 비교: 월(1~12) × 연도들 (실지급)
  function renderCompare(){
    if(years.length === 0){
      return h('div', { style:{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:'8px', padding:'40px', textAlign:'center', color:'#94a3b8' } }, '급여 기록이 없습니다.');
    }
    var tdS = { padding:'5px 8px', borderBottom:'1px solid #f1f5f9', fontFamily:'monospace', textAlign:'right', fontSize:'12px' };
    var thS = { padding:'5px 8px', background:'#f8fafc', borderBottom:'2px solid #e5e7eb', fontWeight:700, color:'#475569', fontSize:'11.5px', textAlign:'right' };
    // 월별 × 연도별 [세전(grossPay), 세후(netPay)] — 급여대장과 동일하게 calcPayroll 기반
    var yearTotalsGross = {}; var yearTotalsNet = {};
    years.forEach(function(y){ yearTotalsGross[y] = 0; yearTotalsNet[y] = 0; });
    var rows = [];
    for(var m=1; m<=12; m++){
      var monthStr = String(m).padStart(2,'0');
      var cells = years.map(function(y){
        var rec = sidRecs.find(function(r){ return r.ym === y+'-'+monthStr; });
        if(!rec) return { g:null, n:null };
        var c = calcPayroll(rec);
        var g = c.grossPay||0;
        var n = c.netPay||0;
        yearTotalsGross[y] += g;
        yearTotalsNet[y]   += n;
        return { g:g, n:n };
      });
      rows.push({ m:m, cells:cells });
    }
    return h('div', { style:{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:'8px', overflow:'auto' } },
      h('div', { style:{ padding:'10px 14px', background:'#eff6ff', borderBottom:'1px solid #bfdbfe', fontSize:'11.5px', color:'#1e40af' } },
        '※ ', h('span', { style:{ color:'#059669', fontWeight:700 } }, '세전(지급액)'), ' / ', h('span', { style:{ color:'#1e40af', fontWeight:700 } }, '세후(실지급액)'), ' 연도별 비교 (단위: 원)'),
      h('table', { style:{ width:'100%', borderCollapse:'collapse', minWidth:'720px' } },
        h('thead', null,
          h('tr', null,
            h('th', { rowSpan:2, style:Object.assign({}, thS, { textAlign:'center', width:'70px', verticalAlign:'middle' }) }, '월'),
            years.map(function(y){
              return h('th', { key:y, colSpan:2, style:Object.assign({}, thS, { color:'#1e40af', textAlign:'center', borderLeft:'1px solid #e5e7eb' }) }, y+'년');
            })
          ),
          h('tr', null,
            years.map(function(y){
              return [
                h('th', { key:y+'-g', style:Object.assign({}, thS, { color:'#059669', fontSize:'10.5px', borderLeft:'1px solid #e5e7eb' }) }, '세전'),
                h('th', { key:y+'-n', style:Object.assign({}, thS, { color:'#1e40af', fontSize:'10.5px' }) }, '세후')
              ];
            })
          )
        ),
        h('tbody', null,
          rows.map(function(row, idx){
            return h('tr', { key:row.m,
              style:{ background: idx%2===0 ? '#fff' : '#f8fafc' } },
              h('td', { style:Object.assign({}, tdS, { textAlign:'center', fontWeight:600, fontFamily:'inherit' }) }, row.m+'월'),
              row.cells.map(function(c, ci){
                var ym = years[ci] + '-' + String(row.m).padStart(2,'0');
                var hasVal = c.n !== null;
                return [
                  h('td', { key:ci+'-g',
                    style:Object.assign({}, tdS, {
                      color: c.g===null ? '#cbd5e1' : '#059669',
                      borderLeft:'1px solid #f1f5f9'
                    }) },
                    c.g===null ? '-' : c.g.toLocaleString()),
                  h('td', { key:ci+'-n',
                    onClick: hasVal ? function(){ onNav('hr/pay'); } : null,
                    title: hasVal ? ym + ' 월별급여로 이동' : '',
                    style:Object.assign({}, tdS, {
                      color: c.n===null ? '#cbd5e1' : '#1e40af',
                      fontWeight: 600,
                      cursor: hasVal ? 'pointer' : 'default',
                      textDecoration: hasVal ? 'underline dotted #93c5fd' : 'none'
                    }) },
                    c.n===null ? '-' : c.n.toLocaleString())
                ];
              })
            );
          })
        ),
        h('tfoot', null,
          h('tr', { style:{ background:'#f8fafc', borderTop:'2px solid #cbd5e1' } },
            h('td', { style:Object.assign({}, tdS, { textAlign:'center', fontWeight:800, fontFamily:'inherit', color:'#1e293b', borderBottom:'none' }) }, '연 합계'),
            years.map(function(y, yi){
              return [
                h('td', { key:y+'-g', style:Object.assign({}, tdS, { fontWeight:800, color:'#059669', borderBottom:'none', fontSize:'13px', borderLeft:'1px solid #f1f5f9' }) },
                  yearTotalsGross[y].toLocaleString()),
                h('td', { key:y+'-n', style:Object.assign({}, tdS, { fontWeight:800, color:'#1e40af', borderBottom:'none', fontSize:'13px' }) },
                  yearTotalsNet[y].toLocaleString())
              ];
            })
          )
        )
      )
    );
  }

  return h('div', null,
    // 조회전용 배너
    h('div', { style:{ display:'flex', alignItems:'center', gap:'6px', padding:'5px 10px',
      background:'#f0fdf4', border:'1px solid #86efac', borderRadius:'6px', marginBottom:'8px' } },
      h('span', { style:{ fontSize:'11px', color:'#15803d', fontWeight:700, whiteSpace:'nowrap' } }, '👁 조회 전용'),
      h('span', { style:{ fontSize:'11px', color:'#16a34a', flex:1 } }, '수정은 월별급여에서'),
      h('button', { onClick:function(){ onNav('hr/pay'); },
        style:{ fontSize:'11px', padding:'3px 10px', borderRadius:'6px',
          background:'#16a34a', color:'#fff', border:'none', cursor:'pointer', fontWeight:700, whiteSpace:'nowrap' }
      }, '✏️ 이동 →')
    ),
    // 컨트롤 바 (모바일 compact)
    h('div', { style:{ marginBottom:'10px' } },
      // 줄1: 직원선택 + 연도선택 한 줄
      h('div', { style:{ display:'flex', gap:'6px', alignItems:'center', marginBottom:'6px' } },
        h('select', { value:selSid, onChange:function(e){ setSelSid(e.target.value); },
          style:{ flex:2, padding:'6px 8px', border:'1px solid #cbd5e1', borderRadius:'5px', fontSize:'12px' } },
          users.map(function(u){
            var statusTag = u.status==='leave' ? ' [휴직]' : u.status==='retired' ? ' [퇴사]' : '';
            return h('option', { key:u.sid, value:u.sid }, u.name + (u.title?' ('+u.title+')':'') + statusTag);
          })
        ),
        viewMode !== 'compare' && h('select', { value:selYear, onChange:function(e){ setSelYear(e.target.value); },
          style:{ flex:1, padding:'6px 8px', border:'1px solid #cbd5e1', borderRadius:'5px', fontSize:'12px' } },
          (years.length > 0 ? years : [thisYear]).map(function(y){
            return h('option', { key:y, value:y }, y+'년');
          })
        )
      ),
      // 줄2: 뷰 모드 탭
      h('div', { style:{ display:'flex', gap:'4px', overflowX:'auto', WebkitOverflowScrolling:'touch', alignItems:'center' } },
        ['detail','raw','compare'].map(function(v){
          var on = viewMode === v;
          var label = v === 'detail' ? '한 해 상세' : v === 'raw' ? '🔍 원시 필드' : '다년 비교';
          return h('button', { key:v, onClick:function(){ setViewMode(v); },
            style:{ padding:'6px 12px', background: on ? '#1e40af' : '#f8fafc',
              color: on ? '#fff' : '#475569', border:'1px solid '+(on?'#1e40af':'#cbd5e1'),
              borderRadius:'20px', cursor:'pointer', fontSize:'11.5px', fontWeight: on?700:500,
              flexShrink:0, whiteSpace:'nowrap' } }, label);
        }),
        h('div',{style:{marginLeft:'auto',flexShrink:0}}, zoomControl(histZoom, setHistZoom))
      )
    ),
    // 선택 직원 요약 (compact)
    selUser && h('div', { style:{ background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:'6px', padding:'5px 10px', marginBottom:'8px', display:'flex', gap:'8px', alignItems:'center', fontSize:'11.5px', flexWrap:'wrap' } },
      h('strong', { style:{ color:'#1e293b', fontSize:'13px' } }, selUser.name),
      selUser.title && h('span', { style:{ color:'#64748b' } }, '('+selUser.title+')'),
      h('span', { style:{ fontFamily:'monospace', color:'#475569' } }, selUser.sid),
      selUser.hireDate && h('span', { style:{ color:'#64748b' } }, '입사 '+selUser.hireDate),
      h('span', { style:{ fontWeight:700, color:'#1e40af', marginLeft:'auto' } }, '급여 '+sidRecs.length+'개월')
    ),
    // 매트릭스
    h('div', { style:{ zoom:histZoom/100 } },
    !selSid || sidRecs.length === 0
      ? h('div', { style:{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:'8px', padding:'40px', textAlign:'center', color:'#94a3b8', fontSize:'12px' } },
          h('div', { style:{ fontSize:'30px', marginBottom:'8px' } }, '📋'),
          '급여 기록이 없습니다.')
      : viewMode === 'detail' ? renderDetail()
      : viewMode === 'raw'    ? renderRaw()
      : renderCompare()
    )
  );
}

// ── 월별급여대장 (전직원 매트릭스) ──
function PayrollLedger(props){
  // 휴직자도 포함 (급여대장에 [휴직] 표시)
  var rawRecs = dbGet('payroll_monthly', []);
  // 해당 월 재직 여부 판단 헬퍼
  var _ym = props.selYM || todayYM();
  var _ymFirst = _ym + '-01';
  var _ymLast  = _ym + '-' + new Date(parseInt(_ym.slice(0,4),10), parseInt(_ym.slice(5,7),10), 0).getDate();
  function isActiveInYM(u){
    // 입사일이 해당 월 마지막 날보다 이후면 미입사
    if(u.hireDate && u.hireDate > _ymLast) return false;
    // 퇴사일이 해당 월 첫 날보다 이전이면 퇴직 후
    var rd = u.resignDate || u.retireDate || '';
    if(rd && rd < _ymFirst) return false;
    return true;
  }
  var sr = useState(true); var showResigned = sr[0]; var setShowResigned = sr[1]; // 퇴사자 포함 토글
  var users = sortUsers(dbGet('user_accounts', USERS_SEED).filter(function(u){
    if(u.status==='active' || u.status==='leave') return isActiveInYM(u);
    // 퇴직자: 해당 월 급여기록이 있으면 입·퇴사일과 무관하게 표시(근무 증빙). 토글 시 재직기간 내 빈 달도.
    if(u.status==='retired'||u.status==='resigned'){
      if(rawRecs.some(function(r){ return r.empSid===u.sid && r.ym===_ym; })) return true;
      return showResigned && isActiveInYM(u);
    }
    return false;
  }));
  var rs = useState(rawRecs); var recs = rs[0]; var setRecs = rs[1];
  var bm = useState(false); var bulkModal = bm[0]; var setBulkModal = bm[1];
  var sc = useState(true); var showDeduct = sc[0]; var setShowDeduct = sc[1]; // 공제 컬럼 접기 (기본 펼침)
  // 전월복사 확인 모달 { prevYM, count, newRecs, backup }
  var cm = useState(null); var copyModal = cm[0]; var setCopyModal = cm[1];
  // 복사 취소(되돌리기)용 백업 { ym, recs }
  var cb = useState(null); var copyBackup = cb[0]; var setCopyBackup = cb[1];
  // #2 성과급 출처 모달
  var pms = useState(null); var perfModal = pms[0]; var setPerfModal = pms[1];
  // 표 확대(돋보기) 배율 (저장됨, 80~200%)
  var exmS = useState(false); var exportMenu = exmS[0]; var setExportMenu = exmS[1];
  var immS = useState(false); var importMenu = immS[0]; var setImportMenu = immS[1];
  useEffect(function(){
    if(!exportMenu && !importMenu) return;
    function _payMenuDocDown(e){
      if(e.target && e.target.closest && e.target.closest('[data-pay-menu]')) return;
      setExportMenu(false); setImportMenu(false);
    }
    document.addEventListener('mousedown', _payMenuDocDown);
    return function(){ document.removeEventListener('mousedown', _payMenuDocDown); };
  }, [exportMenu, importMenu]);
  var emS = useState(false); var emailModal = emS[0]; var setEmailModal = emS[1];
  var eilS = useState(false); var emailIncludeLeave = eilS[0]; var setEmailIncludeLeave = eilS[1];  // 휴직자 포함(예외 발송) 토글
  // 급여명세서 이메일: 휴직자(status==='leave' 또는 해당 근무월 휴직 활성) 기본 제외, 토글 시 포함
  var _emailLoaRef = (props.selYM || (typeof todayYMD==='function' ? todayYMD().slice(0,7) : '')) + '-01';
  function _emailOnLeave(u){ return !!(u && (u.status === 'leave' || (typeof getLoaStatus === 'function' && getLoaStatus(u.sid, _emailLoaRef)))); }
  var emailLeaveCount = (users||[]).filter(_emailOnLeave).length;
  var emailUsers = (users||[]).filter(function(u){ return emailIncludeLeave || !_emailOnLeave(u); });
  // [자동발송 테스트 — A안] 배포한 Firebase 함수로 본인 메일에 명세서 발송 (도메인 인증 전이라 본인 메일로만 발송됨)
  var PAYSLIP_FN_URL = 'https://us-central1-pureun-erp.cloudfunctions.net/sendPayslip';
  var PAYSLIP_TEST_TO = 'babylawyer11111@gmail.com';
  function payslipTestHtml(u){
    var rec = getRec(u.sid); var calc = calcPayroll(rec);
    return '<div style="font-family:sans-serif;font-size:14px;line-height:1.8;color:#1e293b">'
      + '<p>' + u.name + ' 님 안녕하세요. 푸른노무법인입니다.</p>'
      + '<p><b>\u25b6 ' + props.selYM + ' \uae09\uc5ec\uba85\uc138\uc11c</b></p>'
      + '<table style="border-collapse:collapse;font-size:13px">'
      + '<tr><td style="padding:3px 16px 3px 0">\uc9c0\uae09\uc561 \ud569\uacc4</td><td style="text-align:right;font-weight:700">' + calc.grossPay.toLocaleString() + '\uc6d0</td></tr>'
      + '<tr><td style="padding:3px 16px 3px 0">\uacf5\uc81c \ud569\uacc4</td><td style="text-align:right">' + calc.totalDeduct.toLocaleString() + '\uc6d0</td></tr>'
      + '<tr><td style="padding:6px 16px 3px 0;border-top:1px solid #e5e7eb;font-weight:700">\uc2e4\uc9c0\uae09\uc561</td><td style="text-align:right;border-top:1px solid #e5e7eb;font-weight:700;color:#16a34a">' + calc.netPay.toLocaleString() + '\uc6d0</td></tr>'
      + '</table>'
      + '<p style="color:#94a3b8;font-size:12px;margin-top:18px">\u203b \uc790\ub3d9\ubc1c\uc1a1 \ud14c\uc2a4\ud2b8 \uba54\uc77c\uc785\ub2c8\ub2e4.</p></div>';
  }
  function sendPayslipTest(){
    var list = emailUsers || [];
    if(list.length === 0){ showToast('\ub300\uc0c1 \uc9c1\uc6d0\uc774 \uc5c6\uc2b5\ub2c8\ub2e4'); return; }
    var u = list[0];
    showToast('\ud568\uc218\ub85c \ubc1c\uc1a1 \uc911...');
    fetch(PAYSLIP_FN_URL, {
      method:'POST', headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ to: PAYSLIP_TEST_TO, name: u.name, ym: props.selYM,
        subject: '[\ud478\ub978\ub178\ubb34\ubc95\uc778] ' + props.selYM + ' \uae09\uc5ec\uba85\uc138\uc11c(\ud14c\uc2a4\ud2b8) \u2014 ' + u.name, html: payslipTestHtml(u) })
    }).then(function(r){ return r.json(); }).then(function(d){
      if(d && d.ok){ showToast('\u2705 \uc790\ub3d9\ubc1c\uc1a1 \uc131\uacf5 \u2014 ' + PAYSLIP_TEST_TO + ' \uba54\uc77c\ud568 \ud655\uc778'); }
      else { showToast('\u26a0 \ubc1c\uc1a1 \uc2e4\ud328: ' + JSON.stringify((d && d.error) || d)); }
    }).catch(function(e){ showToast('\u26a0 \ud638\ucd9c \uc2e4\ud328: ' + ((e && e.message) || e)); });
  }
  // [PDF 생성] 명세서를 화면 렌더 → 이미지 → PDF(base64). 한글 깨짐 없음(html2canvas).
  function buildPayslipPdfBase64(u){
    return new Promise(function(resolve, reject){
      if(!window.html2canvas || !window.jspdf){ reject(new Error('PDF 라이브러리 로딩 안됨 (새로고침 후 재시도)')); return; }
      var rec = getRec(u.sid); var calc = calcPayroll(rec); var ym = props.selYM;
      var num = function(n){ return (n||0).toLocaleString(); };
      var payTr = function(label, val, color){ var c = color?(';color:'+color):''; return '<tr><td style="padding:4px 8px'+c+'">'+label+'</td><td style="padding:4px 8px;text-align:right;font-family:monospace'+c+'">'+val+'</td></tr>'; };
      var payRows = payTr('기본급', num(rec.baseSalary));
      (rec.allowances||[]).forEach(function(a){ payRows += payTr(a.name, num(a.amount)); });
      if(calc.legal.overtime>0) payRows += payTr('연장근로수당 ('+calc.legal.overtimeHours+'h)', num(calc.legal.overtime), '#854d0e');
      if(calc.legal.night>0)    payRows += payTr('야간근로수당 ('+calc.legal.nightHours+'h)', num(calc.legal.night), '#854d0e');
      if(calc.legal.holiday>0)  payRows += payTr('휴일근로수당 ('+calc.legal.holidayHours+'h)', num(calc.legal.holiday), '#854d0e');
      if(calc.perfBonus.total>0) payRows += '<tr><td style="padding:4px 8px;color:#2563eb">성과금 ('+calc.perfBonus.details.length+'건)</td><td style="padding:4px 8px;text-align:right;font-family:monospace;color:#2563eb;font-weight:700">'+num(calc.perfBonus.total)+'</td></tr>';
      if((rec.bonus||0)>0) payRows += payTr('기타상여', num(rec.bonus));
      payRows += '<tr style="background:#f0fdf4;font-weight:700"><td style="padding:5px 8px">지급액 합계</td><td style="padding:5px 8px;text-align:right;font-family:monospace;color:#166534">'+num(calc.grossPay)+'</td></tr>';
      var dedRows = payTr('국민연금', num(calc.pension)) + payTr('건강보험', num(calc.healthIns)) + payTr('장기요양', num(calc.longCare)) + payTr('고용보험', num(calc.empIns)) + payTr('소득세', num(calc.incomeTax)) + payTr('지방세', num(calc.localTax)) + '<tr style="background:#fef3c7;font-weight:700"><td style="padding:5px 8px">공제 합계</td><td style="padding:5px 8px;text-align:right;font-family:monospace;color:#854d0e">'+num(calc.totalDeduct)+'</td></tr>';
      var perfHtml = '';
      if(calc.perfBonus.total>0){
        var prRows = calc.perfBonus.details.map(function(d){
          return '<tr style="border-top:1px solid #ede9fe">'
            + '<td style="padding:4px 6px;font-family:monospace;font-size:10.5px">'+d.date+'</td>'
            + '<td style="padding:4px 6px">'+d.source+'</td>'
            + '<td style="padding:4px 6px;text-align:right;font-family:monospace;color:#475569">'+num(d.incomeAmount)+'</td>'
            + '<td style="padding:4px 6px;text-align:right;font-family:monospace;color:'+(((d.taxDeduction||0)>0)?'#dc2626':'#cbd5e1')+'">'+(((d.taxDeduction||0)>0)?('-'+num(d.taxDeduction)):'-')+'</td>'
            + '<td style="padding:4px 6px;text-align:right;font-family:monospace;font-weight:600">'+num(d.baseAmount)+'</td>'
            + '<td style="padding:4px 6px;text-align:center"><span style="background:'+((d.role==='주담당')?'#ede9fe':'#dbeafe')+';color:#1e40af;font-size:10.5px;padding:1px 6px;border-radius:8px;font-weight:600">'+d.role+'</span></td>'
            + '<td style="padding:4px 6px;text-align:right;font-family:monospace;color:#64748b">'+d.pct+'%</td>'
            + '<td style="padding:4px 6px;text-align:right;font-family:monospace;font-weight:700;color:#2563eb">'+num(d.amount)+'</td>'
            + '</tr>';
        }).join('');
        perfHtml = '<div style="margin-bottom:16px"><div style="background:#ede9fe;padding:7px 10px;font-weight:700;font-size:12px;color:#1e40af;border-radius:4px 4px 0 0">🌟 성과금 발생내역 ('+calc.perfBonus.details.length+'건 / 합계 '+num(calc.perfBonus.total)+'원)</div><table style="width:100%;font-size:11px;border-collapse:collapse;border:1px solid #e5e7eb"><thead><tr style="background:#faf5ff"><th style="padding:4px 6px;text-align:left;font-weight:700;color:#1e40af">발생일</th><th style="padding:4px 6px;text-align:left;font-weight:700;color:#1e40af">발생원</th><th style="padding:4px 6px;text-align:right;font-weight:700;color:#1e40af">입금금액</th><th style="padding:4px 6px;text-align:right;font-weight:700;color:#1e40af">세금공제</th><th style="padding:4px 6px;text-align:right;font-weight:700;color:#1e40af">산정기준</th><th style="padding:4px 6px;text-align:center;font-weight:700;color:#1e40af">역할</th><th style="padding:4px 6px;text-align:right;font-weight:700;color:#1e40af">요율</th><th style="padding:4px 6px;text-align:right;font-weight:700;color:#1e40af">성과금</th></tr></thead><tbody>'+prRows+'</tbody></table></div>';
      }
      var ntHtml = '';
      if(calc.nonTaxable.total>0){
        var ntParts = '';
        if(calc.nonTaxable.meal>0) ntParts += '<span style="margin-right:14px">식대 '+num(calc.nonTaxable.meal)+'</span>';
        if(calc.nonTaxable.car>0) ntParts += '<span style="margin-right:14px">자가운전 '+num(calc.nonTaxable.car)+'</span>';
        if(calc.nonTaxable.childcare>0) ntParts += '<span style="margin-right:14px">보육 '+num(calc.nonTaxable.childcare)+'</span>';
        ntHtml = '<div style="margin-bottom:12px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:5px;padding:8px 12px;font-size:11px"><div style="font-weight:700;color:#065f46;margin-bottom:4px">🟢 비과세 항목 (4대보험·소득세 산정 시 제외)</div><div style="color:#0f766e;font-family:monospace">'+ntParts+'<span style="font-weight:700">비과세계 '+num(calc.nonTaxable.total)+'원</span></div><div style="font-size:10.5px;color:#065f46;margin-top:2px">과세표준 = 지급액 '+num(calc.grossPay)+' - 비과세 '+num(calc.nonTaxable.total)+' = '+num(calc.insurableBase)+'원</div></div>';
      }
      var reimbList = rec.reimbursements||[];
      var reimbTotal = reimbList.reduce(function(s,r){return s+(parseInt(r.amount)||0);},0);
      var reimbHtml = '';
      if(reimbTotal>0){
        var rbRows = reimbList.map(function(rb){ return '<tr style="border-top:1px solid #fef3c7"><td style="padding:3px 6px;font-family:monospace;font-size:10.5px">'+(rb.date||'-')+'</td><td style="padding:3px 6px">'+(rb.category||'-')+'</td><td style="padding:3px 6px;color:#64748b">'+(rb.note||'-')+'</td><td style="padding:3px 6px;text-align:right;font-family:monospace">'+num(rb.amount)+'</td></tr>'; }).join('');
        reimbHtml = '<div style="margin-top:12px"><div style="background:#fef3c7;padding:7px 10px;font-weight:700;font-size:12px;color:#854d0e;border-radius:4px 4px 0 0">💵 실비변상 (비과세 - 4대보험·소득세 산정 제외)</div><table style="width:100%;font-size:11px;border-collapse:collapse;border:1px solid #fde68a"><thead><tr style="background:#fef3c7"><th style="padding:4px 6px;text-align:left;font-weight:700;color:#854d0e">발생일</th><th style="padding:4px 6px;text-align:left;font-weight:700;color:#854d0e">구분</th><th style="padding:4px 6px;text-align:left;font-weight:700;color:#854d0e">내용</th><th style="padding:4px 6px;text-align:right;font-weight:700;color:#854d0e">금액</th></tr></thead><tbody>'+rbRows+'<tr style="background:#fef3c7;font-weight:700"><td colspan="3" style="padding:5px 6px">실비 합계</td><td style="padding:5px 6px;text-align:right;font-family:monospace;color:#854d0e">'+num(reimbTotal)+'</td></tr></tbody></table></div><div style="margin-top:10px;background:#854d0e;color:#fff;padding:12px 20px;border-radius:6px;display:flex;justify-content:space-between;align-items:center"><div style="font-size:14px;font-weight:700">💵 실비 입금 (비과세)</div><div style="font-size:22px;font-weight:800;font-family:monospace">'+num(reimbTotal)+' 원</div></div>';
      }
      var leaveHtml = '';
      try {
        var _ly = (ym||'').slice(0,4);
        var _lf = function(v){ return (v==null||v==='')?'-':v; };
        var _llRows = (dbGet('leave_ledger',[])||[]).filter(function(x){ return x.name===u.name && Number(x.year)<=Number(_ly); }).sort(function(a,b){ return a.year-b.year; }).slice(-3).map(function(x){
          var _mo = (x.monthly||'-'); if(x.note) _mo += ' <span style="color:#94a3b8">('+x.note+')</span>';
          var _hi = (String(x.year)===_ly) ? ' style="background:#f0fdfa;font-weight:700"' : '';
          return '<tr'+_hi+'><td style="padding:3px 6px;text-align:center">'+x.year+'년</td><td style="padding:3px 6px;text-align:right;font-family:monospace">'+_lf(x.granted)+'</td><td style="padding:3px 6px;text-align:right;font-family:monospace">'+_lf(x.used)+'</td><td style="padding:3px 6px;text-align:right;font-family:monospace">'+_lf(x.remain)+'</td><td style="padding:3px 6px;font-size:10px;color:#475569">'+_mo+'</td></tr>';
        }).join('');
        if(_llRows){ leaveHtml = '<div style="margin-top:12px;background:#ecfeff;border:1px solid #a5f3fc;border-radius:6px;padding:10px 14px"><div style="font-size:12px;font-weight:700;color:#0e7490;margin-bottom:6px">🏖️ 연차 현황 (연도별)</div><table style="width:100%;font-size:11px;border-collapse:collapse;border:1px solid #a5f3fc"><thead><tr style="background:#cffafe"><th style="padding:4px 6px;text-align:center;color:#0e7490">연도</th><th style="padding:4px 6px;text-align:right;color:#0e7490">발생</th><th style="padding:4px 6px;text-align:right;color:#0e7490">사용</th><th style="padding:4px 6px;text-align:right;color:#0e7490">잔여</th><th style="padding:4px 6px;text-align:left;color:#0e7490">월별 사용내역</th></tr></thead><tbody>'+_llRows+'</tbody></table></div>'; }
      } catch(_e){}
      var _payBasis = (calc.prorated ? ('· 기본급(일할): 기본급 × '+calc.workDays+'/30일 = '+num(calc.baseSalaryProrated)+'원<br>') : ('· 기본급: '+num(rec.baseSalary)+'원<br>'));
      if((rec.allowances||[]).length>0) _payBasis += '· 수당(고정): '+(rec.allowances||[]).map(function(a){return a.name+' '+num(a.amount);}).join(', ')+'원<br>';
      if(calc.legal.total>0) _payBasis += '· 통상시급: (기본급 + 고정수당) ÷ 209h = '+num(calc.legal.ordinaryWage)+'원<br>· 법정수당: 연장 ×1.5 / 야간 추가 ×0.5 / 휴일 8h이내 ×1.5, 초과 ×2.0 / 주휴(주 15h↑)<br>';
      if(calc.perfBonus.total>0){ _payBasis += '· 성과금(성과관리): 발생 입금액 × 담당요율<br>'; calc.perfBonus.details.forEach(function(d){ _payBasis += '&nbsp;&nbsp;- '+d.source+': '+num(d.baseAmount)+' × '+d.pct+'% = '+num(d.amount)+'원 ('+d.role+')<br>'; }); }
      if((rec.bonus||0)>0) _payBasis += '· 기타상여: '+num(rec.bonus)+'원<br>';
      var _dedBasis = '· 과세표준: '+num(calc.insurableBase)+'원<br>· 국민연금: 과세표준 × 4.5% (상한월 6,170,000원)<br>· 건강보험: 과세표준 × 3.545%<br>· 장기요양: 건강보험 × 12.95%<br>· 고용보험: 과세표준 × 0.9%<br>· 소득세: 근로소득 간이세액표 (부양가족 '+(rec.dependents||1)+'명)<br>· 지방세: 소득세 × 10%';
      var basisHtml = '<table style="width:100%;border-collapse:collapse;margin-top:12px"><tr><td style="width:50%;vertical-align:top;padding-right:7px"><div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:5px;padding:8px 12px;font-size:10px;color:#166534;line-height:1.7"><div style="font-weight:700;color:#065f46;margin-bottom:3px">📋 지급 근거</div>'+_payBasis+'</div></td><td style="width:50%;vertical-align:top;padding-left:7px"><div style="background:#fef3c7;border:1px solid #fde68a;border-radius:5px;padding:8px 12px;font-size:10px;color:#854d0e;line-height:1.7"><div style="font-weight:700;color:#854d0e;margin-bottom:3px">📋 공제 근거</div>'+_dedBasis+'</div></td></tr></table>'+(calc.minWageWarning?('<div style="margin-top:8px;background:#fef2f2;border:1px solid #fecaca;border-radius:5px;padding:6px 12px;font-size:10px;color:#dc2626;font-weight:700">⚠️ 최저임금 위반: 2026년 시급 10,320원 / 월 209h '+num(calc.minWageMonthly)+'원 미달</div>'):'');
      var _pn2 = getLeavePromoNotice(u.name);
      var promoHtml = _pn2 ? ('<div style="margin-top:12px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:6px;padding:10px 14px"><div style="font-size:12px;font-weight:700;color:#1e40af;margin-bottom:4px">📣 연차 사용촉진 안내</div><div style="font-size:11.5px;color:#1e3a8a;line-height:1.6">미사용 연차 <b>'+_pn2.remain+'일</b> · 사용기간 ~'+_pn2.expiryStr+' 까지 · 사용시기를 지정해 주세요.</div></div>') : '';
      var el = document.createElement('div');
      el.style.cssText = "position:absolute;left:-9999px;top:0;width:700px;box-sizing:border-box;background:#fff;padding:30px;font-family:'Malgun Gothic','맑은 고딕',sans-serif;color:#1e293b";
      el.innerHTML =
        '<div style="text-align:center;margin-bottom:24px;border-bottom:2px solid #1e40af;padding-bottom:12px"><div style="font-size:11px;color:#64748b;margin-bottom:4px">푸른노무법인</div><div style="font-size:22px;font-weight:800;color:#1e293b">'+ym+' 급여명세서</div></div>'
        + '<table style="width:100%;margin-bottom:18px;font-size:12.5px;border-collapse:collapse"><tbody>'
        + '<tr><td style="padding:5px 8px;background:#f8fafc;width:90px;font-weight:700">성명</td><td style="padding:5px 8px;border-right:1px solid #e5e7eb">'+u.name+'</td><td style="padding:5px 8px;background:#f8fafc;width:90px;font-weight:700">사번</td><td style="padding:5px 8px">'+u.sid+'</td></tr>'
        + '<tr><td style="padding:5px 8px;background:#f8fafc;font-weight:700">직책</td><td style="padding:5px 8px;border-right:1px solid #e5e7eb">'+u.title+'</td><td style="padding:5px 8px;background:#f8fafc;font-weight:700">소속</td><td style="padding:5px 8px">'+(u.branch||'천안본사')+'</td></tr>'
        + '<tr><td style="padding:5px 8px;background:#f8fafc;font-weight:700">입사일</td><td style="padding:5px 8px;border-right:1px solid #e5e7eb">'+(u.hireDate||'-')+'</td><td style="padding:5px 8px;background:#f8fafc;font-weight:700">지급일</td><td style="padding:5px 8px">'+(rec.paidDate||(ym+'-25'))+'</td></tr>'
        + '</tbody></table>'
        + '<table style="width:100%;border-collapse:collapse;margin-bottom:16px"><tr><td style="width:50%;vertical-align:top;padding-right:7px"><div style="background:#dcfce7;padding:7px 10px;font-weight:700;font-size:12.5px;color:#166534;border-radius:4px 4px 0 0">지급</div><table style="width:100%;font-size:12px;border-collapse:collapse;border:1px solid #e5e7eb"><tbody>'+payRows+'</tbody></table></td><td style="width:50%;vertical-align:top;padding-left:7px"><div style="background:#fef3c7;padding:7px 10px;font-weight:700;font-size:12.5px;color:#854d0e;border-radius:4px 4px 0 0">공제</div><table style="width:100%;font-size:12px;border-collapse:collapse;border:1px solid #e5e7eb"><tbody>'+dedRows+'</tbody></table></td></tr></table>'
        + perfHtml + ntHtml
        + '<div style="background:#2563eb;color:#fff;padding:14px 20px;border-radius:6px;display:flex;justify-content:space-between;align-items:center"><div style="font-size:14px;font-weight:700">실지급액 (급여)</div><div style="font-size:22px;font-weight:800;font-family:monospace">'+num(calc.netPay)+' 원</div></div>'
        + reimbHtml + basisHtml + leaveHtml + promoHtml
        + '<div style="text-align:center;margin-top:12px;font-size:10.5px;color:#94a3b8;border-top:1px solid #e5e7eb;padding-top:8px">본 명세서는 '+todayYMD()+' 발행되었습니다.</div>';
      document.body.appendChild(el);
      window.html2canvas(el, { scale: 1.3, backgroundColor: '#ffffff' }).then(function(canvas){
        try { document.body.removeChild(el); } catch(_e){}
        var imgData = canvas.toDataURL('image/jpeg', 0.75);
        var JsPDF = window.jspdf.jsPDF;
        var pdf = new JsPDF('p', 'mm', 'a4');
        var pageW = pdf.internal.pageSize.getWidth();
        var imgW = pageW - 20;
        var imgH = canvas.height * imgW / canvas.width;
        pdf.addImage(imgData, 'JPEG', 10, 10, imgW, imgH);
        var uri = pdf.output('datauristring');
        var base64 = uri.substring(uri.indexOf('base64,') + 7);
        try { console.log('[급여PDF] 첨부 크기 약 ' + Math.round(base64.length * 3 / 4 / 1024) + ' KB'); } catch(_k){}
        resolve(base64);
      }).catch(function(e){ try { document.body.removeChild(el); } catch(_e2){} reject(e); });
    });
  }
  // [행별 실제 발송] 각 직원 📧 버튼: PDF 첨부 + 본문, 함수로 그 직원 이메일에 발송 (확인창 포함)
  function sendPayslipRow(u, email, subjectText, bodyText){
    popConfirm(u.name + ' 님에게\n' + email + ' (으)로\n' + props.selYM + ' 급여명세서를 PDF로 발송할까요?').then(function(ok){
      if(!ok) return;
      showToast('📄 ' + u.name + '님 명세서 PDF 만드는 중...');
      buildPayslipPdfBase64(u).then(function(pdfB64){
        var html = '<pre style="font-family:monospace;font-size:13px;line-height:1.6;color:#1e293b;white-space:pre-wrap;margin:0">'
          + bodyText.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</pre>'
          + '<p style="font-size:12px;color:#64748b">\u203b \ucca8\ubd80\ub41c PDF \ud30c\uc77c\uc5d0\uc11c\ub3c4 \ub3d9\uc77c\ud55c \uba85\uc138\uc11c\ub97c \ud655\uc778\ud558\uc2e4 \uc218 \uc788\uc2b5\ub2c8\ub2e4.</p>';
        var fname = '\uae09\uc5ec\uba85\uc138\uc11c_' + props.selYM + '_' + u.name + '.pdf';
        showToast('📤 ' + u.name + '님에게 발송 중...');
        fetch(PAYSLIP_FN_URL, {
          method:'POST', headers:{ 'Content-Type':'application/json' },
          body: JSON.stringify({ to: email, name: u.name, ym: props.selYM, subject: subjectText, html: html,
            attachments: [{ filename: fname, content: pdfB64 }] })
        }).then(function(r){ return r.json(); }).then(function(d){
          if(d && d.ok){ showToast('✅ ' + u.name + '님 PDF 발송 완료 → ' + email); }
          else { showToast('⚠ ' + u.name + ' 발송 실패: ' + JSON.stringify((d && d.error) || d)); }
        }).catch(function(e){ showToast('⚠ 호출 실패: ' + ((e && e.message) || e)); });
      }).catch(function(e){ showToast('⚠ PDF 생성 실패: ' + ((e && e.message) || e)); });
    });
  }
  var toS = useState(false); var toolsOpen = toS[0]; var setToolsOpen = toS[1];
  function clampZoom(v){ return Math.max(80, Math.min(200, v)); }

  // 임금항목 SSOT → 동적 컬럼 (환경설정 sortOrder/hidden 반영)
  var __payItems = dbGet('pay_items', PAY_ITEM_SEED);
  // 숨김 제외 + sortOrder 정렬
  var visiblePayItems = __payItems
    .filter(function(p){ return !p.hidden; })
    .slice()
    .sort(function(a,b){ return (a.sortOrder||0)-(b.sortOrder||0); });
  // 매핑된 9개 셀 - code → cell key
  var CODE_TO_KEY = {
    base:'base', meal:'meal', car:'car',
    overtime:'overtime', night:'night', holiday:'holiday',
    etc:'etc',
    holidaybonus:'bonus_lump', yearend:'bonus_lump',  // 둘 다 '상여' 컬럼으로 합산
    bonus:'perf'
  };
  // colSpec: { key, type:'mapped'|'custom', item }
  var colSpec = [];
  var seenKeys = {};
  visiblePayItems.forEach(function(p){
    var mappedKey = CODE_TO_KEY[p.code];
    if(mappedKey){
      if(seenKeys[mappedKey]) return; // bonus_lump 중복 방지
      seenKeys[mappedKey] = true;
      colSpec.push({ key:mappedKey, type:'mapped', item:p });
    } else {
      // 신규 임금항목: rec.allowances 배열에 저장
      colSpec.push({ key:'custom-'+p.code, type:'custom', item:p });
    }
  });


  function persist(arr){ setRecs(arr); dbSet('payroll_monthly', arr); }
  function importPay45(){
    var NEW = [{"id": "pay-P-001-2026-04", "empSid": "P-001", "empName": "권형하", "ym": "2026-04", "dependents": 2, "baseSalary": 2000000, "allowances": [], "bonus": 0, "bonusIsPerf": true, "pensionOverride": 116800, "healthInsOverride": -168700, "longCareOverride": 9440, "empInsOverride": -54000, "incomeTaxOverride": 19520, "localTaxOverride": 1950, "status": "paid", "note": "2026 급여대장 가져오기(확정)"}, {"id": "pay-A-001-2026-04", "empSid": "A-001", "empName": "최기운", "ym": "2026-04", "dependents": 1, "baseSalary": 3150000, "allowances": [{"code": "meal", "name": "식대", "amount": 200000}, {"code": "car", "name": "차량유지비", "amount": 200000}], "bonus": 182078, "bonusIsPerf": true, "pensionOverride": 0, "healthInsOverride": 79370, "longCareOverride": 15730, "empInsOverride": 29980, "incomeTaxOverride": 105210, "localTaxOverride": 10520, "status": "paid", "note": "2026 급여대장 가져오기(확정)"}, {"id": "pay-A-003-2026-04", "empSid": "A-003", "empName": "김보람", "ym": "2026-04", "dependents": 1, "baseSalary": 3250000, "allowances": [], "bonus": 0, "bonusIsPerf": true, "pensionOverride": 139980, "healthInsOverride": 184810, "longCareOverride": 15350, "empInsOverride": 29250, "incomeTaxOverride": 95430, "localTaxOverride": 9540, "status": "paid", "note": "2026 급여대장 가져오기(확정)"}, {"id": "pay-A-004-2026-04", "empSid": "A-004", "empName": "주민정", "ym": "2026-04", "dependents": 1, "baseSalary": 2650000, "allowances": [], "bonus": 637000, "bonusIsPerf": true, "pensionOverride": 111720, "healthInsOverride": 209480, "longCareOverride": 15520, "empInsOverride": 29580, "incomeTaxOverride": 100320, "localTaxOverride": 10030, "status": "paid", "note": "2026 급여대장 가져오기(확정)"}, {"id": "pay-A-002-2026-04", "empSid": "A-002", "empName": "신욱임", "ym": "2026-04", "dependents": 1, "baseSalary": 2250000, "allowances": [], "bonus": 0, "bonusIsPerf": true, "pensionOverride": 93950, "healthInsOverride": 124740, "longCareOverride": 10620, "empInsOverride": 20250, "incomeTaxOverride": 27560, "localTaxOverride": 2750, "status": "paid", "note": "2026 급여대장 가져오기(확정)"}, {"id": "pay-A-006-2026-04", "empSid": "A-006", "empName": "김석우", "ym": "2026-04", "dependents": 1, "baseSalary": 2022180, "allowances": [], "bonus": 0, "bonusIsPerf": true, "pensionOverride": 0, "healthInsOverride": 0, "longCareOverride": 0, "empInsOverride": 0, "incomeTaxOverride": 20170, "localTaxOverride": 2010, "status": "paid", "note": "2026 급여대장 가져오기(확정)"}, {"id": "pay-P-003-2026-04", "empSid": "P-003", "empName": "박한별", "ym": "2026-04", "dependents": 1, "baseSalary": 3700000, "allowances": [], "bonus": 540000, "bonusIsPerf": true, "pensionOverride": 195790, "healthInsOverride": 612350, "longCareOverride": 20020, "empInsOverride": 38160, "incomeTaxOverride": 228000, "localTaxOverride": 22800, "status": "paid", "note": "2026 급여대장 가져오기(확정)"}, {"id": "pay-P-004-2026-04", "empSid": "P-004", "empName": "김혜민", "ym": "2026-04", "dependents": 1, "baseSalary": 2900000, "allowances": [{"code": "etc", "name": "업무분담수당", "amount": 290000}], "bonus": 1766678, "bonusIsPerf": true, "pensionOverride": 99560, "healthInsOverride": 512690, "longCareOverride": 23410, "empInsOverride": 44610, "incomeTaxOverride": 327050, "localTaxOverride": 32700, "status": "paid", "note": "2026 급여대장 가져오기(확정)"}, {"id": "pay-P-005-2026-04", "empSid": "P-005", "empName": "박재원", "ym": "2026-04", "dependents": 1, "baseSalary": 3000000, "allowances": [{"code": "etc", "name": "업무분담수당", "amount": 300000}], "bonus": 1913895, "bonusIsPerf": true, "pensionOverride": 99560, "healthInsOverride": 471470, "longCareOverride": 24620, "empInsOverride": 46920, "incomeTaxOverride": 363520, "localTaxOverride": 36350, "status": "paid", "note": "2026 급여대장 가져오기(확정)"}, {"id": "pay-A-005-2026-04", "empSid": "A-005", "empName": "박은비", "ym": "2026-04", "dependents": 1, "baseSalary": 2250000, "allowances": [], "bonus": 234000, "bonusIsPerf": true, "pensionOverride": 99560, "healthInsOverride": 82000, "longCareOverride": 11730, "empInsOverride": 22350, "incomeTaxOverride": 34950, "localTaxOverride": 3490, "status": "paid", "note": "2026 급여대장 가져오기(확정)"}, {"id": "pay-P-006-2026-04", "empSid": "P-006", "empName": "임혜미", "ym": "2026-04", "dependents": 0, "baseSalary": 2156880, "allowances": [], "bonus": 0, "bonusIsPerf": true, "pensionOverride": 102410, "healthInsOverride": 77530, "longCareOverride": 10180, "empInsOverride": 19410, "incomeTaxOverride": 24340, "localTaxOverride": 2430, "status": "paid", "note": "2026 급여대장 가져오기(확정)"}, {"id": "pay-P-007-2026-04", "empSid": "P-007", "empName": "김동현", "ym": "2026-04", "dependents": 0, "baseSalary": 2156880, "allowances": [], "bonus": 0, "bonusIsPerf": true, "pensionOverride": 102410, "healthInsOverride": 77530, "longCareOverride": 10180, "empInsOverride": 19410, "incomeTaxOverride": 24340, "localTaxOverride": 2430, "status": "paid", "note": "2026 급여대장 가져오기(확정)"}, {"id": "pay-P-001-2026-05", "empSid": "P-001", "empName": "권형하", "ym": "2026-05", "dependents": 2, "baseSalary": 2000000, "allowances": [], "bonus": 0, "bonusIsPerf": true, "pensionOverride": 116800, "healthInsOverride": 71900, "longCareOverride": 9440, "empInsOverride": 0, "incomeTaxOverride": 19520, "localTaxOverride": 1950, "status": "paid", "note": "2026 급여대장 가져오기(확정)"}, {"id": "pay-A-001-2026-05", "empSid": "A-001", "empName": "최기운", "ym": "2026-05", "dependents": 1, "baseSalary": 3150000, "allowances": [{"code": "meal", "name": "식대", "amount": 200000}, {"code": "car", "name": "차량유지비", "amount": 200000}], "bonus": 166363, "bonusIsPerf": true, "pensionOverride": 0, "healthInsOverride": 119220, "longCareOverride": 15660, "empInsOverride": 29840, "incomeTaxOverride": 102770, "localTaxOverride": 10270, "status": "paid", "note": "2026 급여대장 가져오기(확정)"}, {"id": "pay-A-003-2026-05", "empSid": "A-003", "empName": "김보람", "ym": "2026-05", "dependents": 1, "baseSalary": 3250000, "allowances": [], "bonus": 0, "bonusIsPerf": true, "pensionOverride": 139980, "healthInsOverride": 116830, "longCareOverride": 15350, "empInsOverride": 29250, "incomeTaxOverride": 95430, "localTaxOverride": 9540, "status": "paid", "note": "2026 급여대장 가져오기(확정)"}, {"id": "pay-A-004-2026-05", "empSid": "A-004", "empName": "주민정", "ym": "2026-05", "dependents": 1, "baseSalary": 2650000, "allowances": [], "bonus": 78000, "bonusIsPerf": true, "pensionOverride": 111720, "healthInsOverride": 98070, "longCareOverride": 12880, "empInsOverride": 24550, "incomeTaxOverride": 49960, "localTaxOverride": 4990, "status": "paid", "note": "2026 급여대장 가져오기(확정)"}, {"id": "pay-A-002-2026-05", "empSid": "A-002", "empName": "신욱임", "ym": "2026-05", "dependents": 1, "baseSalary": 2250000, "allowances": [], "bonus": 0, "bonusIsPerf": true, "pensionOverride": 93950, "healthInsOverride": 80880, "longCareOverride": 10620, "empInsOverride": 20250, "incomeTaxOverride": 27560, "localTaxOverride": 2750, "status": "paid", "note": "2026 급여대장 가져오기(확정)"}, {"id": "pay-A-006-2026-05", "empSid": "A-006", "empName": "김석우", "ym": "2026-05", "dependents": 1, "baseSalary": 2022180, "allowances": [], "bonus": 0, "bonusIsPerf": true, "pensionOverride": 0, "healthInsOverride": 0, "longCareOverride": 0, "empInsOverride": 0, "incomeTaxOverride": 20170, "localTaxOverride": 2010, "status": "paid", "note": "2026 급여대장 가져오기(확정)"}, {"id": "pay-P-004-2026-05", "empSid": "P-004", "empName": "김혜민", "ym": "2026-05", "dependents": 1, "baseSalary": 2806452, "allowances": [{"code": "etc", "name": "업무분담수당", "amount": 280645}], "bonus": 1253217, "bonusIsPerf": true, "pensionOverride": 99560, "healthInsOverride": 156030, "longCareOverride": 20500, "empInsOverride": 39060, "incomeTaxOverride": 241350, "localTaxOverride": 24130, "status": "paid", "note": "2026 급여대장 가져오기(확정)"}, {"id": "pay-P-005-2026-05", "empSid": "P-005", "empName": "박재원", "ym": "2026-05", "dependents": 1, "baseSalary": 3000000, "allowances": [{"code": "etc", "name": "업무분담수당", "amount": 300000}], "bonus": 336818, "bonusIsPerf": true, "pensionOverride": 99560, "healthInsOverride": 130740, "longCareOverride": 17170, "empInsOverride": 32730, "incomeTaxOverride": 141890, "localTaxOverride": 14180, "status": "paid", "note": "2026 급여대장 가져오기(확정)"}, {"id": "pay-A-005-2026-05", "empSid": "A-005", "empName": "박은비", "ym": "2026-05", "dependents": 1, "baseSalary": 2250000, "allowances": [], "bonus": 0, "bonusIsPerf": true, "pensionOverride": 99560, "healthInsOverride": 80880, "longCareOverride": 10620, "empInsOverride": 20250, "incomeTaxOverride": 27560, "localTaxOverride": 2750, "status": "paid", "note": "2026 급여대장 가져오기(확정)"}, {"id": "pay-P-006-2026-05", "empSid": "P-006", "empName": "임혜미", "ym": "2026-05", "dependents": 0, "baseSalary": 1568640, "allowances": [], "bonus": 0, "bonusIsPerf": true, "pensionOverride": 102410, "healthInsOverride": 45070, "longCareOverride": 5920, "empInsOverride": 14110, "incomeTaxOverride": -48680, "localTaxOverride": -4860, "status": "paid", "note": "2026 급여대장 가져오기(확정)"}, {"id": "pay-P-007-2026-05", "empSid": "P-007", "empName": "김동현", "ym": "2026-05", "dependents": 0, "baseSalary": 2156880, "allowances": [], "bonus": 0, "bonusIsPerf": true, "pensionOverride": 102410, "healthInsOverride": 77530, "longCareOverride": 10180, "empInsOverride": 19410, "incomeTaxOverride": 24340, "localTaxOverride": 2430, "status": "paid", "note": "2026 급여대장 가져오기(확정)"}];
    if(!confirm('2026년 4·5월 급여 ' + NEW.length + '건(4월 12·5월 11)을 가져옵니다.\n같은 직원·월이 이미 있으면 그 건만 교체하고, 1~3월 등 나머지는 그대로 둡니다.\n무급 달(박성수 4·5월·박한별 5월)은 제외됩니다.\n\n진행할까요?')) return;
    var arr = (dbGet('payroll_monthly', []) || []).slice();
    var idx = {};
    arr.forEach(function(r,i){ idx[(r.empSid||r.sid)+'|'+r.ym] = i; });
    var added=0, replaced=0;
    NEW.forEach(function(rec){
      var k = rec.empSid+'|'+rec.ym;
      if(idx[k]!=null){ arr[idx[k]] = rec; replaced++; } else { arr.push(rec); added++; }
    });
    persist(arr);
    showToast('급여 4·5월 반영 완료: 추가 '+added+' · 교체 '+replaced+' (새로고침 후 명세서 확인)');
  }


  // ── 급여대장 엑셀 가져오기 (전체 월별 시트 → payroll_monthly, 이미 있는 직원·월은 건너뛰기) ──
  function importPayrollLedger(e){
    var file = e.target.files && e.target.files[0]; if(!file) return;
    if(typeof XLSX === 'undefined'){ showToast('엑셀 모듈 로딩중'); return; }
    var allUsers = dbGet('user_accounts', USERS_SEED) || [];
    // 이름 → sid (전체 직원, 재직·퇴직 포함)
    var name2sid = {};
    allUsers.forEach(function(u){ if(u.name) name2sid[u.name.trim()] = u.sid; });
    function num(v){ if(v===null||v===undefined||v==='') return 0; var n=parseFloat(String(v).replace(/[^0-9.\-]/g,'')); return isNaN(n)?0:Math.round(n); }
    // 엑셀 col(1-base) → payroll 필드
    var MAP = { 6:'dependents',7:'hourlyWage',9:'workHours',10:'baseSalary',12:'overtimePay',
      14:'nightPay',16:'holidayPay',19:'extraOvertimePay',21:'unusedLeavePay',
      25:'nonTaxableMeal',26:'nonTaxableCar',27:'nonTaxableChildcare',28:'bonus',
      31:'subtotal',33:'absentDeduction',34:'grossPay',35:'taxableIncome',
      36:'incomeTax',37:'localTax',38:'nationalPension',39:'healthInsurance',
      40:'longTermCare',41:'employmentInsurance',42:'healthInsuranceAdj',43:'longTermCareAdj',44:'otherDeduction',
      45:'totalDeduction',46:'netPay',47:'businessExpense' };
    var reader = new FileReader();
    reader.onload = function(ev){
      try {
        var wb = XLSX.read(ev.target.result, { type:'array' });
        var monthSheets = wb.SheetNames.filter(function(n){ return /^20\d\d[.\-]\d{1,2}$/.test(n.trim()); });
        if(monthSheets.length === 0){ showToast('⚠️ 월별 시트(예: 2025.07) 없음'); e.target.value=''; return; }
        try { console.log('[급여 가져오기 백업]', JSON.stringify(dbGet('payroll_monthly',[]))); } catch(_){}
        var arr = (recs||[]).slice();
        var have = {}; arr.forEach(function(r){ have[(r.empSid||r.sid)+'|'+r.ym] = true; });
        // 연장/야간/휴일 근로 → overtime_records (월 1일자, 시간 소수점 그대로)
        var otAll = dbGet('overtime_records', []) || [];
        var otHave = {}; otAll.forEach(function(r){ otHave[r.sid+'|'+r.date+'|'+r.kind] = true; });
        var otAdded = 0;
        var added=0, skipped=0, nomatch={};
        monthSheets.forEach(function(sn){
          var ym = sn.trim().replace('.','-');
          var parts = ym.split('-'); ym = parts[0]+'-'+('0'+parts[1]).slice(-2);  // 2025-7 → 2025-07
          var ws = wb.Sheets[sn];
          var data = XLSX.utils.sheet_to_json(ws, { header:1, defval:'' });
          // 헤더(연번/성명) 행 탐색
          var hi = data.findIndex(function(row){ return row.some(function(x){ return String(x).indexOf('성명')>=0; }) && row.some(function(x){ return String(x).indexOf('주민')>=0; }); });
          if(hi<0) return;
          var _siCol = data[hi].findIndex(function(x){ var s=String(x).trim(); return s==='실비'||s==='실비변상'; });  // 실비(reimbursements) 컬럼(있으면)
          for(var r=hi+1;r<data.length;r++){
            var row=data[r]; if(!row) continue;
            var nm=String(row[1]||'').trim();
            if(!/^[가-힣]{2,4}$/.test(nm)) continue;       // 사람 이름만
            var base=num(row[9]);                          // 기본급(col10, 0-base 9)
            if(!base) continue;                            // 급여 없는 행 스킵
            var sid=name2sid[nm];
            if(!sid){ nomatch[nm]=true; continue; }
            if(have[sid+'|'+ym]){ skipped++; continue; }   // 이미 있으면 건너뛰기
            var rec={ id:'pay-'+sid+'-'+ym, empSid:sid, empName:nm, ym:ym, note:'',
              dependents:0,hourlyWage:0,workHours:0,baseSalary:0,overtimePay:0,nightPay:0,holidayPay:0,
              extraOvertimePay:0,unusedLeavePay:0,nonTaxableMeal:0,nonTaxableCar:0,nonTaxableChildcare:0,
              bonus:0,subtotal:0,absentDeduction:0,grossPay:0,taxableIncome:0,incomeTax:0,localTax:0,
              nationalPension:0,healthInsurance:0,longTermCare:0,employmentInsurance:0,healthInsuranceAdj:0,longTermCareAdj:0,
              otherDeduction:0,yearEndAdj:0,totalDeduction:0,netPay:0,businessExpense:0,
              legalAllowances:{},
              status:'paid', paidDate:'' };
            Object.keys(MAP).forEach(function(col){ rec[MAP[col]] = num(row[parseInt(col,10)-1]); });
            if(_siCol>=0){ var _rb=num(row[_siCol]); if(_rb>0) rec.reimbursements=[{ amount:_rb, note:'실비변상' }]; }
            // 연장/야간/휴일 수당(금액) → ERP 통상시급 기준으로 시간 역산 → legalAllowances
            // (ERP가 시간×시급×배율로 재계산 시 엑셀 수당이 ±1원 재현됨)
            var _ordWage = Math.round((rec.baseSalary||0) / 209);
            function _hrsFromPay(pay, mult){
              var p = num(pay);
              if(p<=0 || _ordWage<=0) return 0;
              return p / (_ordWage * mult);
            }
            rec.legalAllowances = {
              overtimeHours: _hrsFromPay(row[11], 1.5),   // col12 연장수당
              nightHours:    _hrsFromPay(row[13], 0.5),   // col14 야간수당
              holidayHours:  _hrsFromPay(row[15], 1.5)    // col16 휴일수당
            };
            arr.push(rec); have[sid+'|'+ym]=true; added++;
            // 연장/야간/휴일 → overtime_records (월 1일자, legalAllowances와 동일한 역산 시간)
            var otDate = ym + '-01';
            [['overtimeHours','overtime'],['nightHours','night'],['holidayHours','holiday']].forEach(function(p){
              var h = rec.legalAllowances[p[0]]; if(!isFinite(h) || h<=0) return;
              if(otHave[sid+'|'+otDate+'|'+p[1]]) return;
              otAll.push({ id:'ot-'+sid+'-'+ym+'-'+p[1], sid:sid, date:otDate, kind:p[1],
                hours:h, note:'급여대장 가져오기', createdAt:(new Date()).toISOString() });
              otHave[sid+'|'+otDate+'|'+p[1]] = true; otAdded++;
            });
          }
        });
        persist(arr);
        if(otAdded > 0) dbSet('overtime_records', otAll);
        var nm = Object.keys(nomatch);
        showToast('📥 급여대장: 추가 '+added+'건 / 건너뜀 '+skipped+'건 / 연장근로 '+otAdded+'건'+(nm.length?' / 미매칭: '+nm.join(','):''));
      } catch(err){ showToast('가져오기 실패: '+(err&&err.message)); }
      e.target.value='';
    };
    reader.readAsArrayBuffer(file);
  }
  function getRec(sid){
    var _recs = recs || []; var _users = users || [];
    var rec = _recs.find(function(r){return r.empSid===sid && r.ym===props.selYM;});
    if(rec) return rec;
    var u = _users.find(function(x){return x.sid===sid;});
    return {
      id:'pay-'+sid+'-'+props.selYM, empSid:sid, empName:u?u.name:sid,
      deptName:(u&&u.branch)||'', position:(u&&u.title)||'',
      ym:props.selYM,
      baseSalary:(u&&u.baseSalary)||0,
      allowances:(u&&u.allowances)||[],
      bonus:0,
      dependents:(u&&u.dependents)||1,
      nonTaxableMeal:(u&&u.nonTaxableMeal)||0,
      nonTaxableCar:(u&&u.nonTaxableCar)||0,
      nonTaxableChildcare:(u&&u.nonTaxableChildcare)||0,
      workDays:0,
      legalAllowances:{},
      status:'draft'
    };
  }
  function updateRec(sid, patch){
    if(isPayrollLocked(props.selYM)){ showToast('🔒 '+props.selYM+'은 잠겨있어 수정 불가'); return; }
    var existing = recs.find(function(r){return r.empSid===sid && r.ym===props.selYM;});
    // 변경된 필드별 감사로그
    var beforeRec = existing || getRec(sid);
    Object.keys(patch).forEach(function(k){
      if(beforeRec[k] !== patch[k]){
        addPayrollAudit(sid, props.selYM, k, beforeRec[k], patch[k]);
      }
    });
    var next = existing
      ? recs.map(function(r){ return (r.empSid===sid&&r.ym===props.selYM) ? Object.assign({},r,patch) : r; })
      : recs.concat([Object.assign({}, getRec(sid), patch)]);
    persist(next);
  }
  function changeMonth(delta){
    var d = new Date(props.selYM+'-01'); d.setMonth(d.getMonth()+delta);
    props.setSelYM(d.toISOString().slice(0,7));
  }
  function copyPrev(){
    if(isPayrollLocked(props.selYM)){ showToast('🔒 잠긴 월은 수정 불가'); return; }
    var prev = new Date(props.selYM+'-01'); prev.setMonth(prev.getMonth()-1);
    var prevYM = prev.toISOString().slice(0,7);
    var prevRecs = recs.filter(function(r){return r.ym===prevYM;});
    if(!prevRecs.length){ showToast('전월('+prevYM+') 데이터 없음'); return; }
    // confirm() 대신 커스텀 모달
    var newRecs = prevRecs.map(function(r){
      return Object.assign({}, r, {
        id:'pay-'+r.empSid+'-'+props.selYM, ym:props.selYM,
        bonus:0, status:'draft', paidDate:''
      });
    });
    setCopyModal({ prevYM:prevYM, count:prevRecs.length, newRecs:newRecs });
  }
  function confirmCopy(){
    if(!copyModal) return;
    // 현재 월 데이터 백업 (되돌리기용)
    var backup = recs.filter(function(r){return r.ym===props.selYM;});
    setCopyBackup({ ym:props.selYM, recs:backup });
    var others = recs.filter(function(r){return r.ym!==props.selYM;});
    persist(others.concat(copyModal.newRecs));
    setCopyModal(null);
    showToast('전월 복사 완료 ('+copyModal.newRecs.length+'건) · 되돌리기 가능');
  }
  function undoCopy(){
    if(!copyBackup) return;
    var others = recs.filter(function(r){return r.ym!==copyBackup.ym;});
    persist(others.concat(copyBackup.recs));
    setCopyBackup(null);
    showToast('복사 취소됨 · 이전 데이터로 복원');
  }

  async function confirmAll(){
    if(isPayrollLocked(props.selYM)){ showToast('🔒 '+props.selYM+'은 이미 잠금 처리됨'); return; }
    var today = todayYMD(); // ★ Fix#1: today 선언 (미정의 버그 수정)
    // 미확정/누락 직원 체크
    var missing = users.filter(function(u){
      var r = recs.find(function(x){return x.empSid===u.sid && x.ym===props.selYM;});
      if(!r) return true;
      if((r.baseSalary||0) <= 0) return true;
      return false;
    });
    if(missing.length > 0){
      var msg = '⚠️ 다음 '+missing.length+'명은 데이터 누락 또는 기본급 0원입니다:\n\n'
              + missing.map(function(u){return '· '+u.name+' ('+u.title+')';}).join('\n')
              + '\n\n그래도 일괄 확정하시겠습니까? (해당 직원은 0원으로 처리됩니다)';
      if(!(await popConfirm(msg))) return;
    } else {
      if(!(await popConfirm('이번 달 전직원 급여를 일괄 확정하시겠습니까?\n→ finance_expense에 급여 + 사업주부담분(4대보험·산재) 자동 기록됩니다.'))) return;
    }
    // paidDate 자동 계산: ym의 다음달 5일 (4월 근무분 → 5월 5일 지급)
    var __py = parseInt(props.selYM.slice(0,4),10);
    var __pm = parseInt(props.selYM.slice(5,7),10) + 1;
    if(__pm > 12){ __pm = 1; __py++; }
    var autoPaidDate = __py + '-' + String(__pm).padStart(2,'0') + '-05';
    // #4 요율 스냅샷: 확정 시점의 4대보험·최저임금·세액표를 함께 저장 → 추후 환경설정 변경되어도 과거 명세서 보호
    var ratesSnap = RatesSnapshot.capture();
    var newRecs = users.map(function(u){
      var rec = getRec(u.sid);
      var calc = calcPayroll(rec);
      // rec 입력 필드는 그대로 두고, 확정 시점의 결과 스냅샷과 상태만 추가 저장
      return Object.assign({}, rec, {
        status:'confirmed', paidDate:autoPaidDate,
        ratesSnapshot: ratesSnap,
        snapshot:{
          grossPay:calc.grossPay, totalDeduct:calc.totalDeduct, netPay:calc.netPay,
          employerTotal:calc.employer.total
        }
      });
    });
    // 퇴직연금 DC 자동 적립 (DC 가입자만)
    var dcAccrued = 0;
    newRecs.forEach(function(r){
      if(autoAccrueDCFromPayroll(r)) dcAccrued++;
    });
    var others = recs.filter(function(r){return r.ym!==props.selYM;});
    persist(others.concat(newRecs));
    // finance_expense 기록 (급여 + 사업주부담분 별도)
    var fe = dbGet('finance_expense', []);
    // ★ Fix#5: 기존 동일 ym 급여 관련 기록 제거 — id 기반 (note 문자열 의존 제거)
    var _salaryIds = ['fe-salary-','fe-employer-','fe-reimburse-','fe-bankfee-'].map(function(p){return p+props.selYM;});
    fe = fe.filter(function(e){ return _salaryIds.indexOf(e.id) < 0; });
    // newRecs에서 calcPayroll 재계산하여 합계 집계 (snapshot은 표시용)
    var calcs = newRecs.map(function(r){return calcPayroll(r);});
    var totalNet = calcs.reduce(function(s,c){return s+c.netPay;},0);
    var totalEmployer = calcs.reduce(function(s,c){return s+c.employer.total;},0);
    var totalEmpPension   = calcs.reduce(function(s,c){return s+c.employer.pension;},0);
    var totalEmpHealth    = calcs.reduce(function(s,c){return s+c.employer.healthIns;},0);
    var totalEmpLongCare  = calcs.reduce(function(s,c){return s+c.employer.longCare;},0);
    var totalEmpEmpIns    = calcs.reduce(function(s,c){return s+c.employer.empIns;},0);
    var totalEmpWorkers   = calcs.reduce(function(s,c){return s+c.employer.workers;},0);
    // 실비 합계 (직원별 reimbursements 합산)
    var totalReimburse = newRecs.reduce(function(s,r){
      return s + (r.reimbursements||[]).reduce(function(ss,rb){return ss+(parseInt(rb.amount)||0);},0);
    },0);
    var reimbursees = newRecs.filter(function(r){
      return (r.reimbursements||[]).reduce(function(s,rb){return s+(parseInt(rb.amount)||0);},0) > 0;
    });
    // ① 급여 실지급
    fe.unshift({
      id:'fe-salary-'+props.selYM, date:autoPaidDate, amount:totalNet, category:'exp-salary',
      payee:'직원 '+newRecs.length+'명', note:'급여 '+props.selYM+' 일괄지급',
      confirmedAt:today,
      createdAt:(new Date()).toISOString()
    });
    // ② 사업주 부담분 (4대보험 + 산재) — 향후 재무관리에서 분류·납부 처리 가능
    fe.unshift({
      id:'fe-employer-'+props.selYM, date:autoPaidDate, amount:totalEmployer, category:'exp-employer-burden',
      payee:'4대보험·산재 사업주분', note:'사업주부담 '+props.selYM+' (국민연금'+totalEmpPension.toLocaleString()+' + 건강'+totalEmpHealth.toLocaleString()+' + 장기요양'+totalEmpLongCare.toLocaleString()+' + 고용'+totalEmpEmpIns.toLocaleString()+' + 산재'+totalEmpWorkers.toLocaleString()+')',
      breakdown:{ pension:totalEmpPension, healthIns:totalEmpHealth, longCare:totalEmpLongCare, empIns:totalEmpEmpIns, workers:totalEmpWorkers },
      confirmedAt:today,
      createdAt:(new Date()).toISOString()
    });
    // ③ 실비변상 (비과세, 급여와 함께 송금) — 있을 때만
    if(totalReimburse > 0){
      var reimbNote = '실비변상 '+props.selYM+' ('+reimbursees.length+'명: '+reimbursees.map(function(r){
        var sum = (r.reimbursements||[]).reduce(function(s,rb){return s+(parseInt(rb.amount)||0);},0);
        return r.empName+' '+sum.toLocaleString();
      }).join(', ')+')';
      fe.unshift({
        id:'fe-reimburse-'+props.selYM, date:autoPaidDate, amount:totalReimburse, category:'exp-reimburse',
        payee:'직원 '+reimbursees.length+'명', note:reimbNote,
        confirmedAt:today,
        createdAt:(new Date()).toISOString()
      });
    }
    // ④ 이체수수료 (환경설정 기본값 × 직원 수) — 별도 출금건
    var bankFeePerTx = dbGet('finance_bank_fee', null);
    if(bankFeePerTx == null) bankFeePerTx = 1000;
    var totalBankFee = bankFeePerTx * newRecs.length;
    if(totalBankFee > 0){
      // ★ Fix#5: fe-bankfee는 이미 위 _salaryIds 필터에서 제거됨 — 중복 제거 로직 불필요
      fe.unshift({
        id:'fe-bankfee-'+props.selYM, date:autoPaidDate, amount:totalBankFee, category:'exp-bankfee',
        payee:'은행 이체수수료', note:'급여 '+props.selYM+' 이체수수료 ('+newRecs.length+'건 × '+bankFeePerTx.toLocaleString()+'원)',
        confirmedAt:today,
        createdAt:(new Date()).toISOString()
      });
    }
    dbSet('finance_expense', fe);
    // 감사로그
    addPayrollAudit('', props.selYM, '일괄확정', '', newRecs.length+'명', '급여 '+totalNet.toLocaleString()+(totalReimburse>0?' + 실비 '+totalReimburse.toLocaleString():'')+' + 사업주부담 '+totalEmployer.toLocaleString()+(totalBankFee>0?' + 이체수수료 '+totalBankFee.toLocaleString():''));
    // 자동 잠금 여부 (옵션)
    if(await popConfirm('확정 완료. 이 달을 잠금 처리할까요?\n(잠금 시 수정·재확정 불가, 권한자만 해제 가능)')){
      setPayrollLock(props.selYM, true);
      addPayrollAudit('', props.selYM, '잠금', '미잠금', '잠금', '일괄확정 후 자동 잠금');
    }
    showToast('확정 완료 (급여 '+totalNet.toLocaleString()+'원' + (totalReimburse>0?' + 실비 '+totalReimburse.toLocaleString()+'원':'') + ' + 사업주부담 '+totalEmployer.toLocaleString()+'원' + (totalBankFee>0?' + 수수료 '+totalBankFee.toLocaleString()+'원':'') + ')' + (dcAccrued>0?' / DC 적립 '+dcAccrued+'명':''));
  }

  function downloadExcel(){
    var rows = [['사번','이름','직책','기본급','수당','상여','지급액','국민연금','건강보험','장기요양','고용보험','소득세','지방세','공제계','실지급액','상태']];
    users.forEach(function(u){
      var rec = getRec(u.sid);
      var calc = calcPayroll(rec);
      rows.push([u.sid, u.name, u.title, rec.baseSalary, calc.allowSum, rec.bonus||0, calc.grossPay,
        calc.pension, calc.healthIns, calc.longCare, calc.empIns, calc.incomeTax, calc.localTax,
        calc.totalDeduct, calc.netPay, rec.status||'draft']);
    });
    var csv = '\uFEFF' + rows.map(function(r){return r.join(',');}).join('\n');
    var blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a'); a.href = url; a.download = '급여대장_'+props.selYM+'.csv'; a.click();
    URL.revokeObjectURL(url);
    showToast('다운로드 완료');
  }

  // 합계 계산
  var totals = users.reduce(function(t,u){
    var calc = calcPayroll(getRec(u.sid));
    var reimb = (getRec(u.sid).reimbursements||[]).reduce(function(s,r){return s+(parseInt(r.amount)||0);},0);
    return {
      gross: t.gross+calc.grossPay, deduct: t.deduct+calc.totalDeduct,
      net: t.net+calc.netPay, count: t.count+1,
      perf: t.perf+calc.perfBonus.total, reimb: t.reimb+reimb
    };
  }, {gross:0,deduct:0,net:0,count:0,perf:0,reimb:0});

  var thStyle = {padding:'3px 3px',background:'#f8fafc',borderBottom:'2px solid #e2e8f0',fontSize:'10px',fontWeight:700,color:'#475569',whiteSpace:'nowrap',position:'sticky',top:0};
  var tdNum = {padding:'2px 4px',textAlign:'right',fontFamily:'monospace',fontSize:'10.5px',whiteSpace:'nowrap'};
  var IS_M = window.innerWidth <= 768;
  var inputNum = {width:'65px',padding:'1px 3px',border:'1px solid #e2e8f0',borderRadius:'5px',fontSize:'10px',fontFamily:'monospace',textAlign:'right'};

  return h('div', null,
    // KPI + 툴바
    window.innerWidth <= 768
    ? h('div', { style:{ display:'flex', overflowX:'auto', gap:'4px', marginBottom:'6px', WebkitOverflowScrolling:'touch', paddingBottom:'4px' } },
        [
          { bg:'#eff6ff', bd:'#bfdbfe', fg:'#1e40af', label:'👥 대상', val:totals.count+'명' },
          { bg:'#f5f3ff', bd:'#ddd6fe', fg:'#2563eb', label:'⭐ 성과급', val:totals.perf.toLocaleString()+'원' },
          { bg:'#fff7ed', bd:'#fed7aa', fg:'#c2410c', label:'🧾 실비', val:totals.reimb.toLocaleString()+'원' },
          { bg:'#dcfce7', bd:'#bbf7d0', fg:'#166534', label:'💵 총지급', val:totals.gross.toLocaleString()+'원' },
          { bg:'#fef3c7', bd:'#fde68a', fg:'#854d0e', label:'📉 공제', val:totals.deduct.toLocaleString()+'원' },
          { bg:'#cffafe', bd:'#bfdbfe', fg:'#2563eb', label:'✅ 실지급', val:totals.net.toLocaleString()+'원' }
        ].map(function(k,i){
          return h('div', { key:i,
            style:{ flexShrink:0, minWidth:'72px', background:k.bg, border:'1px solid '+k.bd,
              borderRadius:'6px', padding:'5px 6px' } },
            h('div', { style:{ fontSize:'8.5px', color:k.fg, fontWeight:700, marginBottom:'1px', whiteSpace:'nowrap' } }, k.label),
            h('div', { style:{ fontSize:'12px', fontWeight:800, color:k.fg, fontFamily:'monospace', wordBreak:'break-all' } }, k.val)
          );
        })
      )
    : h('div', { style:{ display:'grid', gridTemplateColumns:'repeat(6,1fr)', gap:'8px', marginBottom:'10px' } },
        h('div', { style:{ background:'#eff6ff', border:'1px solid #bfdbfe', borderRadius:'8px', padding:'9px 12px' } },
          h('div', { style:{ fontSize:'10.5px', color:'#1e40af', fontWeight:600 } }, '👥 대상 직원'),
          h('div', { style:{ fontSize:'13px', fontWeight:800, color:'#1e40af' } }, totals.count+'명')),
        h('div', { style:{ background:'#f5f3ff', border:'1px solid #ddd6fe', borderRadius:'8px', padding:'9px 12px' } },
          h('div', { style:{ fontSize:'10.5px', color:'#2563eb', fontWeight:600 } }, '⭐ 성과급 합계'),
        h('div', { style:{ fontSize:'14px', fontWeight:800, color:'#2563eb', fontFamily:'monospace' } }, totals.perf.toLocaleString()+'원')),
      h('div', { style:{ background:'#fff7ed', border:'1px solid #fed7aa', borderRadius:'8px', padding:'9px 12px' } },
        h('div', { style:{ fontSize:'10.5px', color:'#c2410c', fontWeight:600 } }, '🧾 실비 합계'),
        h('div', { style:{ fontSize:'14px', fontWeight:800, color:'#c2410c', fontFamily:'monospace' } }, totals.reimb.toLocaleString()+'원')),
      h('div', { style:{ background:'#dcfce7', border:'1px solid #bbf7d0', borderRadius:'8px', padding:'9px 12px' } },
        h('div', { style:{ fontSize:'10.5px', color:'#166534', fontWeight:600 } }, '💵 총 지급액'),
        h('div', { style:{ fontSize:'14px', fontWeight:800, color:'#166534', fontFamily:'monospace' } }, totals.gross.toLocaleString()+'원')),
      h('div', { style:{ background:'#fef3c7', border:'1px solid #fde68a', borderRadius:'8px', padding:'9px 12px' } },
        h('div', { style:{ fontSize:'10.5px', color:'#854d0e', fontWeight:600 } }, '📉 공제액'),
        h('div', { style:{ fontSize:'14px', fontWeight:800, color:'#854d0e', fontFamily:'monospace' } }, totals.deduct.toLocaleString()+'원')),
      h('div', { style:{ background:'#cffafe', border:'1px solid #bfdbfe', borderRadius:'8px', padding:'9px 12px' } },
        h('div', { style:{ fontSize:'10.5px', color:'#2563eb', fontWeight:600 } }, '✅ 실지급액'),
        h('div', { style:{ fontSize:'14px', fontWeight:800, color:'#2563eb', fontFamily:'monospace' } }, totals.net.toLocaleString()+'원'))
    ),
    h('div', { style:{ display:'flex', alignItems:'center', gap:'6px', flexWrap:'wrap', marginBottom:'6px' } },
      // ── 월 이동 + 잠금 (한 줄 통합) ──
      h('div', { style:{ display:'flex', alignItems:'center', gap:'6px', flexShrink:0 } },
        h(MonthNav, { onPrev:function(){changeMonth(-1);}, onNext:function(){changeMonth(1);}, label:props.selYM, onToday:function(){props.setSelYM(todayYM());}, todayActive: props.selYM===todayYM() }),
        h('label', { style:{ display:'flex', alignItems:'center', gap:'3px', fontSize:'11px', color:'#64748b', cursor:'pointer', whiteSpace:'nowrap' } },
          h('input', { type:'checkbox', checked:!showResigned, onChange:function(e){ setShowResigned(!e.target.checked); } }), '퇴사자 제외'),
        isPayrollLocked(props.selYM)
          ? h('button',{ onClick:async function(){
                if(!(await popConfirm('🔒 '+props.selYM+' 잠금을 해제할까요?'))) return;
                setPayrollLock(props.selYM, false);
                addPayrollAudit('', props.selYM, '잠금해제', '잠금', '미잠금', '');
                setRecs(dbGet('payroll_monthly', []));
              },
              style:{padding:'6px 10px',background:'#dc2626',color:'#fff',border:'none',borderRadius:'6px',cursor:'pointer',fontSize:'12px',fontWeight:700,whiteSpace:'nowrap'} }, '🔒 마감됨')
          : h('button',{ onClick:async function(){
                if(!(await popConfirm(props.selYM+' 마감 잠금할까요?'))) return;
                setPayrollLock(props.selYM, true);
                addPayrollAudit('', props.selYM, '잠금', '미잠금', '잠금', '수동 잠금');
                setRecs(dbGet('payroll_monthly', []));
              },
              style:{padding:'6px 10px',background:'#fff',color:'#475569',border:'1px solid #cbd5e1',borderRadius:'6px',cursor:'pointer',fontSize:'12px',fontWeight:600,whiteSpace:'nowrap'} }, '🔓 마감 잠금')
      ),
      // ── 보조액션 + 확정 (월이동 옆 같은 줄) ──
      h('div', { style:{ display:'flex', alignItems:'center', gap:'6px', flexWrap: IS_M?'wrap':'nowrap', flex:1, minWidth:0 } },
        IS_M && h('button', { onClick:function(){ setToolsOpen(!toolsOpen); },
          style:{padding:'6px 10px',background:toolsOpen?'#1e40af':'#f1f5f9',color:toolsOpen?'#fff':'#475569',border:'1px solid '+(toolsOpen?'#1e40af':'#cbd5e1'),borderRadius:'6px',cursor:'pointer',fontSize:'12px',fontWeight:700,whiteSpace:'nowrap',flexShrink:0} }, toolsOpen?'도구 ▴':'🛠 도구 ▾'),
        h('div', { style:{ display: (IS_M && !toolsOpen)?'none':'flex', gap:'4px', alignItems:'center', flexWrap: IS_M?'wrap':'nowrap', flex:1, paddingBottom:'2px', minWidth:0, width: IS_M?'100%':'auto', order: IS_M?3:0 } },
          h('button', { onClick:copyPrev,
            style:{padding:'6px 10px',background:'#f59e0b',color:'#fff',border:'none',borderRadius:'6px',cursor:'pointer',fontSize:'12px',fontWeight:700,whiteSpace:'nowrap',flexShrink:0} }, '📋 전월복사'),
          copyBackup && copyBackup.ym === props.selYM && h('button', { onClick:undoCopy,
            style:{padding:'6px 10px',background:'#ef4444',color:'#fff',border:'none',borderRadius:'6px',cursor:'pointer',fontSize:'12px',fontWeight:700,whiteSpace:'nowrap',flexShrink:0} }, '↩ 취소'),
          h('button',{ onClick:function(){ setEmailModal(true); },
            style:{padding:'6px 10px',background:'#16a34a',color:'#fff',border:'none',borderRadius:'6px',cursor:'pointer',fontSize:'12px',fontWeight:700,whiteSpace:'nowrap',flexShrink:0,marginLeft:IS_M?undefined:'auto'} }, '📧 이메일 발송'),
          h('div', { 'data-pay-menu':'1', style:{ position:'relative', flexShrink:0 } },
            h('button', { onClick:function(){ setExportMenu(!exportMenu); setImportMenu(false); },
              style:{padding:'6px 10px',background:'#2563eb',color:'#fff',border:'none',borderRadius:'6px',cursor:'pointer',fontSize:'12px',fontWeight:700,whiteSpace:'nowrap',flexShrink:0} }, '📤 내보내기 ▾'),
            exportMenu && h('div', { style:{ position:'absolute', top:'100%', right:0, marginTop:'4px', zIndex:60, background:'#fff', border:'1px solid #cbd5e1', borderRadius:'8px', boxShadow:'0 8px 24px rgba(0,0,0,0.18)', padding:'4px', display:'flex', flexDirection:'column', gap:'3px', minWidth:'150px' } },
          h('button', { onClick:downloadExcel,
            style:{padding:'6px 10px',background:'#2563eb',color:'#fff',border:'none',borderRadius:'6px',cursor:'pointer',fontSize:'12px',fontWeight:700,whiteSpace:'nowrap',flexShrink:0} }, '📤 엑셀'),
          h('button',{ onClick:function(){
              var html='<html><head><meta charset="utf-8"><title>'+props.selYM+' 급여명세서</title>'
                +'<style>body{font-family:"Malgun Gothic",sans-serif;background:#fff;padding:20px;}'
                +'.slip{max-width:700px;margin:0 auto 30px;border:1px solid #cbd5e1;border-radius:8px;padding:25px;page-break-after:always;}'
                +'h2{text-align:center;border-bottom:2px solid #1e40af;padding-bottom:10px;margin-bottom:18px;}'
                +'table{width:100%;border-collapse:collapse;margin-bottom:12px;font-size:12px;}'
                +'th,td{padding:4px 8px;border:1px solid #e5e7eb;}'
                +'.summary{background:#2563eb;color:#fff;padding:10px 16px;border-radius:5px;display:flex;justify-content:space-between;font-weight:700;font-size:14px;}'
                +'@media print{.slip{page-break-after:always;}}</style></head><body>';
              users.forEach(function(u){
                var rec=getRec(u.sid); var calc=calcPayroll(rec);
                html+='<div class="slip"><h2>푸른노무법인 '+props.selYM+' 급여명세서</h2>';
                html+='<table><tr><th>성명</th><td>'+u.name+'</td><th>사번</th><td>'+u.sid+'</td></tr><tr><th>직책</th><td>'+u.title+'</td><th>소속</th><td>'+(u.branch||'')+'</td></tr></table>';
                html+='<table><tr><th colspan="2" style="background:#dcfce7">지급</th></tr><tr><td>기본급</td><td style="text-align:right">'+(rec.baseSalary||0).toLocaleString()+'</td></tr><tr><td>수당</td><td style="text-align:right">'+calc.allowSum.toLocaleString()+'</td></tr><tr><td>법정수당</td><td style="text-align:right">'+calc.legal.total.toLocaleString()+'</td></tr><tr><td>성과금</td><td style="text-align:right">'+calc.perfBonus.total.toLocaleString()+'</td></tr><tr><th>지급액 합계</th><th style="text-align:right">'+calc.grossPay.toLocaleString()+'</th></tr></table>';
                html+='<table><tr><th colspan="2" style="background:#fef3c7">공제</th></tr><tr><td>국민연금</td><td style="text-align:right">'+calc.pension.toLocaleString()+'</td></tr><tr><td>건강+장기요양</td><td style="text-align:right">'+(calc.healthIns+calc.longCare).toLocaleString()+'</td></tr><tr><td>고용보험</td><td style="text-align:right">'+calc.empIns.toLocaleString()+'</td></tr><tr><td>소득세+지방세</td><td style="text-align:right">'+(calc.incomeTax+calc.localTax).toLocaleString()+'</td></tr><tr><th>공제 합계</th><th style="text-align:right">'+calc.totalDeduct.toLocaleString()+'</th></tr></table>';
                html+='<div class="summary"><span>실지급액</span><span>'+calc.netPay.toLocaleString()+' 원</span></div>';
                var _rbP=(rec.reimbursements||[]).reduce(function(s,x){return s+(parseInt(x.amount)||0);},0);
                if(_rbP>0){ html+='<div class="summary" style="background:#854d0e;margin-top:8px"><span>💵 실비 입금 (비과세·별도)</span><span>'+_rbP.toLocaleString()+' 원</span></div>'; }
                html+='</div>';
              });
              html+='<scr'+'ipt>window.onload=function(){window.print();};</scr'+'ipt></body></html>';
              var w=window.open('','_blank'); if(!w){ showToast('팝업 차단을 해제하세요'); return; }
              w.document.write(html); w.document.close();
            },
            style:{padding:'6px 10px',background:'#1e40af',color:'#fff',border:'none',borderRadius:'6px',cursor:'pointer',fontSize:'12px',fontWeight:700,whiteSpace:'nowrap',flexShrink:0} }, '🖨 PDF'),
            )
          ),
          h('div', { 'data-pay-menu':'1', style:{ position:'relative', flexShrink:0 } },
            h('button', { onClick:function(){ setImportMenu(!importMenu); setExportMenu(false); },
              style:{padding:'6px 10px',background:'#eff6ff',color:'#1d4ed8',border:'1px solid #bfdbfe',borderRadius:'6px',cursor:'pointer',fontSize:'12px',fontWeight:700,whiteSpace:'nowrap',flexShrink:0} }, '📥 가져오기 ▾'),
            importMenu && h('div', { style:{ position:'absolute', top:'100%', right:0, marginTop:'4px', zIndex:60, background:'#fff', border:'1px solid #cbd5e1', borderRadius:'8px', boxShadow:'0 8px 24px rgba(0,0,0,0.18)', padding:'4px', display:'flex', flexDirection:'column', gap:'3px', minWidth:'180px' } },
          h('div', {
            title:'CSV 파일을 끌어다 놓으세요',
            onDragOver:function(e){ e.preventDefault(); e.currentTarget.style.outline='2px solid #1e40af'; e.currentTarget.style.borderRadius='6px'; },
            onDragLeave:function(e){ e.currentTarget.style.outline=''; },
            onDrop:function(e){
              e.preventDefault(); e.currentTarget.style.outline='';
              var files=e.dataTransfer.files;
              if(!files||!files[0]) return;
              var fakeEvt={target:{files:files,value:''}};
              (function(file){
                if(!file) return;
                if(isPayrollLocked(props.selYM)){ showToast('🔒 잠긴 월은 수정 불가'); return; }
                var rdr=new FileReader();
                rdr.onload=function(ev){
                  try{
                    var text=ev.target.result.replace(/^\uFEFF/,'');
                    var lines=text.split(/\r?\n/).filter(function(l){return l.trim();});
                    if(lines.length<2){ showToast('등록된 데이터가 없습니다'); return; }
                    var hdr=lines[0].split(',').map(function(s){return s.trim();});
                    var idx={};
                    ['사번','기본급','수당','상여','부양가족','식대','자가운전','보육','근무일수'].forEach(function(k){ idx[k]=hdr.indexOf(k); });
                    // 기존 CSV 처리 로직 재사용을 위해 파일 input onChange 트리거
                    var label = e.currentTarget.querySelector('label');
                    if(label) showToast('📥 CSV 드래그 업로드됨 — 파일을 처리합니다');
                  }catch(err){ showToast('CSV 처리 오류: '+err.message); }
                };
                rdr.readAsText(file,'UTF-8');
                // 실제로는 hidden input에 파일 할당 후 change 이벤트 발생
                try{
                  var dt=new DataTransfer(); dt.items.add(file);
                  var inp=e.currentTarget.querySelector('input[type=file]');
                  if(inp){ inp.files=dt.files; inp.dispatchEvent(new Event('change',{bubbles:true})); }
                }catch(ex){}
              })(files[0]);
            }
          },
          h('label', { style:{padding:'6px 10px',background:'#fff',color:'#475569',border:'1px solid #cbd5e1',borderRadius:'6px',cursor:'pointer',fontSize:'12px',fontWeight:600,whiteSpace:'nowrap',flexShrink:0,display:'block'} },
            '📥 CSV',
            h('input',{type:'file',accept:'.csv',style:{display:'none'},
              onChange:function(e){
                var file=e.target.files[0]; if(!file) return;
                if(isPayrollLocked(props.selYM)){ showToast('🔒 잠긴 월은 수정 불가'); return; }
                var rdr=new FileReader();
                rdr.onload=function(ev){
                  try{
                    var text=ev.target.result.replace(/^\uFEFF/,'');
                    var lines=text.split(/\r?\n/).filter(function(l){return l.trim();});
                    if(lines.length<2){ showToast('등록된 데이터가 없습니다'); return; }
                    var hdr=lines[0].split(',').map(function(s){return s.trim();});
                    var idx={};
                    ['사번','기본급','수당','상여','부양가족','식대','자가운전','보육','근무일수'].forEach(function(k){ idx[k]=hdr.indexOf(k); });
                    var imported=0;
                    lines.slice(1).forEach(function(ln){
                      var c=ln.split(',').map(function(s){return s.trim();});
                      if(!c[idx['사번']]) return;
                      var sid=c[idx['사번']];
                      var u=users.find(function(x){return x.sid===sid;}); if(!u) return;
                      var num=function(i){return i>=0?parseInt((c[i]||'').replace(/[^0-9]/g,''))||0:0;};
                      var patch={ baseSalary:num(idx['기본급']), bonus:num(idx['상여']), dependents:num(idx['부양가족'])||1, nonTaxableMeal:num(idx['식대']), nonTaxableCar:num(idx['자가운전']), nonTaxableChildcare:num(idx['보육']), workDays:num(idx['근무일수'])||0 };
                      var allowanceAmt=num(idx['수당']);
                      if(allowanceAmt>0){ var existRec=recs.find(function(r){return r.empSid===sid&&r.ym===props.selYM;}); var prevA=(existRec&&existRec.allowances)?existRec.allowances.filter(function(a){return a.code!=='etc';}):[];  patch.allowances=prevA.concat([{code:'etc',amount:allowanceAmt}]); }
                      updateRec(sid,patch); imported++;
                    });
                    showToast('CSV 가져오기 완료 ('+imported+'명)');
                  }catch(err){ showToast('CSV 파싱 오류: '+err.message); }
                  e.target.value='';
                };
                rdr.readAsText(file,'UTF-8');
              }})
          )
          ),
          h('label', { style:{padding:'6px 10px',background:'#eff6ff',color:'#1d4ed8',border:'1px solid #bfdbfe',borderRadius:'6px',cursor:'pointer',fontSize:'12px',fontWeight:600,whiteSpace:'nowrap',flexShrink:0,display:'block'} },
            '📥 급여대장 가져오기',
            h('input',{type:'file',accept:'.xlsx,.xls',style:{display:'none'},onChange:importPayrollLedger})),
          h('button', { onClick:importPay45,
            title:'2026년 4·5월 급여(파일 확정 숫자)를 가져옵니다. 1~3월·나머지는 그대로.',
            style:{padding:'6px 10px',background:'#dcfce7',color:'#166534',border:'1px solid #86efac',borderRadius:'6px',cursor:'pointer',fontSize:'12px',fontWeight:600,whiteSpace:'nowrap',flexShrink:0} },
            '📥 4·5월 급여(확정)'),
          h('div', {
            title:'JSON 백업 파일을 끌어다 놓으세요',
            onDragOver:function(e){ e.preventDefault(); e.currentTarget.style.outline='2px solid #16a34a'; e.currentTarget.style.borderRadius='6px'; },
            onDragLeave:function(e){ e.currentTarget.style.outline=''; },
            onDrop:function(e){
              e.preventDefault(); e.currentTarget.style.outline='';
              var files=e.dataTransfer.files;
              if(!files||!files[0]) return;
              try{
                var dt=new DataTransfer(); dt.items.add(files[0]);
                var inp=e.currentTarget.querySelector('input[type=file]');
                if(inp){ inp.files=dt.files; inp.dispatchEvent(new Event('change',{bubbles:true})); }
              }catch(ex){ showToast('드롭 처리 오류: '+ex.message); }
            }
          },
          h('label', { style:{padding:'6px 10px',background:'#fff',color:'#64748b',border:'1px solid #cbd5e1',borderRadius:'6px',cursor:'pointer',fontSize:'12px',fontWeight:600,whiteSpace:'nowrap',flexShrink:0,display:'block'} },
            '📂 복원',
            h('input',{type:'file',accept:'.json',style:{display:'none'},
              onChange:async function(e){
                var file=e.target.files[0]; if(!file) return;
                if(!(await popConfirm('백업 파일로 현재 데이터를 덮어씁니다. 계속?'))) return;
                var rdr=new FileReader();
                rdr.onload=function(ev){
                  try{
                    var data=JSON.parse(ev.target.result);
                    if(data.payroll_monthly) dbSet('payroll_monthly', data.payroll_monthly);
                    if(data.locked_payroll_months) dbSet('locked_payroll_months', data.locked_payroll_months);
                    if(data.payroll_audit_log) dbSet('payroll_audit_log', data.payroll_audit_log);
                    setRecs(dbGet('payroll_monthly',[])); showToast('복원 완료');
                  }catch(err){ showToast('복원 실패: '+err.message); }
                  e.target.value='';
                };
                rdr.readAsText(file,'UTF-8');
              }})
          )
          )
            )
          )
        ),
        h('button', { onClick:confirmAll,
          style:{padding:'8px 14px',background:'#059669',color:'#fff',border:'none',borderRadius:'8px',cursor:'pointer',fontSize:'13px',fontWeight:800,whiteSpace:'nowrap',flexShrink:0,boxShadow:'0 2px 6px rgba(5,150,105,0.3)'} }, '✅ 확정')
      )
    ),
    IS_M
    ? h('div', { style:{ display:'flex', flexDirection:'column', gap:'6px' } },
        users.map(function(u, idx){
          var rec = getRec(u.sid);
          var calc = calcPayroll(rec);
          var st = rec.status||'draft';
          var stBg = st==='confirmed'?'#dcfce7':st==='paid'?'#cffafe':'#fef9c3';
          var stFg = st==='confirmed'?'#166534':st==='paid'?'#2563eb':'#854d0e';
          var stLb = st==='confirmed'?'확정':st==='paid'?'지급':'대기';
          return h('div', { key:u.sid, onClick:function(){ props.onSelect(u.sid); },
            style:{ background:'#fff', border:'1px solid #e2e8f0', borderLeft:'4px solid '+stFg,
              borderRadius:'8px', padding:'10px 12px', cursor:'pointer', boxShadow:'0 1px 3px rgba(0,0,0,0.05)' } },
            h('div', { style:{ display:'flex', alignItems:'center', gap:'6px', marginBottom:'6px' } },
              h('span', { style:{ fontWeight:800, color:'#fff', fontSize:'10px', background:'#475569', borderRadius:'4px', padding:'1px 5px', flexShrink:0 } }, idx+1),
              h('span', { style:{ fontWeight:700, color:'#1e293b', fontSize:'13px', flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' } }, u.name),
              u.status==='leave' && h('span', { style:{ fontSize:'9.5px', background:'#fef3c7', color:'#92400e', padding:'1px 5px', borderRadius:'8px', fontWeight:700, flexShrink:0 } }, '휴직'),
              (u.status==='resigned'||u.status==='retired') && h('span', { style:{ fontSize:'9.5px', background:'#fee2e2', color:'#991b1b', padding:'1px 5px', borderRadius:'8px', fontWeight:700, flexShrink:0 } }, '퇴사'),
              u.title && h('span', { style:{ fontSize:'10px', color:'#64748b', flexShrink:0 } }, u.title),
              h('span', { style:{ fontSize:'10px', background:stBg, color:stFg, padding:'1px 7px', borderRadius:'10px', fontWeight:700, flexShrink:0 } }, stLb)
            ),
            h('div', { style:{ display:'flex', gap:'6px' } },
              h('div', { style:{ flex:1, background:'#f0fdf4', borderRadius:'6px', padding:'5px 7px', textAlign:'center' } },
                h('div', { style:{ fontSize:'9px', color:'#166534', fontWeight:700, marginBottom:'1px' } }, '지급액'),
                h('div', { style:{ fontSize:'12px', fontWeight:800, color:'#166534', fontFamily:'monospace' } }, calc.grossPay.toLocaleString())
              ),
              h('div', { style:{ flex:1, background:'#fef3c7', borderRadius:'6px', padding:'5px 7px', textAlign:'center' } },
                h('div', { style:{ fontSize:'9px', color:'#854d0e', fontWeight:700, marginBottom:'1px' } }, '공제'),
                h('div', { style:{ fontSize:'12px', fontWeight:800, color:'#854d0e', fontFamily:'monospace' } }, calc.totalDeduct.toLocaleString())
              ),
              h('div', { style:{ flex:1, background:'#ecfeff', borderRadius:'6px', padding:'5px 7px', textAlign:'center' } },
                h('div', { style:{ fontSize:'9px', color:'#2563eb', fontWeight:700, marginBottom:'1px' } }, '실지급'),
                h('div', { style:{ fontSize:'12px', fontWeight:800, color:'#2563eb', fontFamily:'monospace' } }, calc.netPay.toLocaleString())
              )
            )
          );
        })
      )
    : h('div', { style:{ background:'#fff', border:'1px solid #e5e7eb', borderRadius:'6px', overflow:'auto', maxHeight:'calc(100vh - 280px)' } },
      h('table', { style:{ width:'100%', borderCollapse:'collapse', fontSize:'11px' } },
        h('thead', null, h('tr', null,
          h('th', { style:thStyle }, '#'),
          h('th', { style:Object.assign({},thStyle,{textAlign:'left',minWidth:'52px'}, IS_M?{position:'sticky',left:0,zIndex:3}:{}) }, '이름'),
          h('th', { style:Object.assign({},thStyle,{textAlign:'left',minWidth:'52px'}) }, '직책'),
          // 지급 항목
          h('th', { style:Object.assign({},thStyle,{textAlign:'right',minWidth:'62px',color:'#1e40af'}) }, '시급'),
          // 동적 임금항목 컬럼 (환경설정 sortOrder 순 + hidden 제외 + 신규 항목 자동 추가)
          colSpec.map(function(c){
            if(c.type === 'mapped'){
              switch(c.key){
                case 'base':       return h('th', { key:c.key, style:Object.assign({},thStyle,{textAlign:'right',minWidth:'80px'}) }, '기본급');
                case 'meal':       return h('th', { key:c.key, style:Object.assign({},thStyle,{textAlign:'right',minWidth:'68px',color:'#065f46'}) }, '식대');
                case 'car':        return h('th', { key:c.key, style:Object.assign({},thStyle,{textAlign:'right',minWidth:'72px',color:'#065f46'}) }, '차량유지');
                case 'overtime':   return h('th', { key:c.key, style:Object.assign({},thStyle,{textAlign:'right',minWidth:'68px',color:'#92400e'}) }, '연장수당');
                case 'night':      return h('th', { key:c.key, style:Object.assign({},thStyle,{textAlign:'right',minWidth:'60px',color:'#92400e'}) }, '야간수당');
                case 'holiday':    return h('th', { key:c.key, style:Object.assign({},thStyle,{textAlign:'right',minWidth:'68px',color:'#92400e'}) }, '휴일수당');
                case 'etc':        return h('th', { key:c.key, style:Object.assign({},thStyle,{textAlign:'right',minWidth:'68px'}) }, '기타수당');
                case 'bonus_lump': return h('th', { key:c.key, style:Object.assign({},thStyle,{textAlign:'right',minWidth:'60px'}) }, '상여');
                case 'perf':       return h('th', { key:c.key, style:Object.assign({},thStyle,{textAlign:'right',minWidth:'72px',background:'#ede9fe',color:'#2563eb'}) }, '⭐성과급');
              }
            }
            // custom: 신규 임금항목 (allowances 배열에 저장)
            var isDed = c.item.category === 'deduction';
            return h('th', { key:c.key, style:Object.assign({},thStyle,{textAlign:'right',minWidth:'68px',
              background: isDed ? '#fef2f2' : ((c.item.color||'#94a3b8')+'18'),
              color: isDed ? '#dc2626' : (c.item.color||'#475569'),
              fontWeight: isDed ? 700 : undefined }),
              title:'신규 임금항목 ('+(isDed ? '공제 - 지급액 차감' : (c.item.taxable?'과세':'비과세'))+')' },
              isDed ? '− ' + c.item.name : c.item.name);
          }),
          h('th', { style:Object.assign({},thStyle,{textAlign:'right',minWidth:'80px',background:'#dcfce7'}) }, '지급액'),
          // 공제 헤더 (접기/펼치기 — 펼침 시 각 항목별 컬럼명)
          showDeduct
            ? [
                h('th', { key:'d1', style:Object.assign({},thStyle,{textAlign:'right',minWidth:'60px',background:'#fef9c3',cursor:'pointer',userSelect:'none'}),
                  onClick:function(){setShowDeduct(false);}, title:'클릭: 공제 컬럼 접기' }, '국민연금 ▾'),
                h('th', { key:'d2', style:Object.assign({},thStyle,{textAlign:'right',minWidth:'60px',background:'#fef9c3'}) }, '건강'),
                h('th', { key:'d3', style:Object.assign({},thStyle,{textAlign:'right',minWidth:'60px',background:'#fef9c3'}) }, '장기요양'),
                h('th', { key:'d4', style:Object.assign({},thStyle,{textAlign:'right',minWidth:'60px',background:'#fef9c3'}) }, '고용'),
                h('th', { key:'d5', style:Object.assign({},thStyle,{textAlign:'right',minWidth:'60px',background:'#fef9c3'}) }, '소득세'),
                h('th', { key:'d6', style:Object.assign({},thStyle,{textAlign:'right',minWidth:'60px',background:'#fef9c3'}) }, '지방세')
              ]
            : h('th', { style:Object.assign({},thStyle,{textAlign:'center',background:'#fef9c3',cursor:'pointer',userSelect:'none',minWidth:'72px'}),
                onClick:function(){setShowDeduct(true);} },
                h('span',null,'공제 ▸ 펼치기')),
          showDeduct && h('th', { style:Object.assign({},thStyle,{textAlign:'right',minWidth:'72px',background:'#fef3c7'}) }, '공제계'),
          h('th', { style:Object.assign({},thStyle,{textAlign:'right',minWidth:'80px',background:'#cffafe'}) }, '실지급'),
          h('th', { style:Object.assign({},thStyle,{textAlign:'right',minWidth:'78px',background:'#fff7ed',color:'#c2410c',borderLeft:'2px solid #fb923c'}), title:'비과세 실비변상 — 임금·4대보험·소득세와 무관 (별도 송금)' }, h('div',null, h('div',null,'🧾 실비'), h('div',{style:{fontSize:'8.5px',fontWeight:600,color:'#ea580c'}},'비과세'))),
          h('th', { style:thStyle }, '상태'),
          h('th', { style:thStyle }, '명세'),
          h('th', { style:thStyle }, '📧')
        )),
        h('tbody', null,
          users.map(function(u, idx){
            // 퇴직자는 해당 월 급여 기록 없으면 행 숨김
            if(u.status==='resigned'||u.status==='retired'){
              var hasRec = recs.some(function(r){ return r.empSid===u.sid && r.ym===props.selYM; });
              if(!hasRec) return null;
            }
            var rec = getRec(u.sid);
            var calc = calcPayroll(rec);
            var st = rec.status||'draft';
            // 휴직 상태 (해당 월 1일 기준)
            var ymFirst = props.selYM + '-01';
            var loaActive = (typeof getLoaStatus === 'function') ? getLoaStatus(u.sid, ymFirst) : null;
            var loaPolicy = loaActive ? (typeof getLoaPolicy === 'function' ? getLoaPolicy().find(function(p){return p.code===loaActive.code;}) : null) : null;
            var effectivePause = (function(){
              if(!loaActive) return false;
              var base = loaActive.payrollPause != null ? loaActive.payrollPause : (loaPolicy ? loaPolicy.payrollPause : false);
              // 병가 유급 + paidUntil 지정 시: 해당 월 1일이 paidUntil 초과면 무급
              if(loaActive.code==='sick-leave' && loaActive.paidType==='유급' && loaActive.paidUntil){
                return ymFirst > loaActive.paidUntil;
              }
              return base;
            })();
            return h('tr', { key:u.sid, style:{borderBottom:'1px solid #f1f5f9', background: effectivePause ? '#fef3c7' : 'transparent'} },
              h('td', {style:{padding:'4px',textAlign:'center',color:'#94a3b8',fontSize:'10.5px'}}, idx+1),
              h('td', {style:Object.assign({padding:'4px 6px',fontWeight:600,fontSize:'11px',whiteSpace:'nowrap'}, IS_M?{position:'sticky',left:0,zIndex:1,background:effectivePause?'#fef3c7':'#fff'}:{})},
                u.name,
                loaActive && h('span', {
                  title:'휴직: '+(loaPolicy?loaPolicy.name:loaActive.code)+(loaActive.plannedEndDate?' (~'+loaActive.plannedEndDate+')':''),
                  style:{marginLeft:'5px',padding:'1px 5px',borderRadius:'5px',background:effectivePause?'#dc2626':'#2563eb',color:'#fff',fontSize:'8.5px',fontWeight:700}
                }, '🏠 '+(loaPolicy?loaPolicy.name.slice(0,4):'휴직')),
                // LoA 없이 status='leave'만 설정된 경우에도 배지 표시
                !loaActive && u.status==='leave' && h('span', {
                  title:'휴직 (환경설정 상태)',
                  style:{marginLeft:'5px',padding:'1px 5px',borderRadius:'5px',background:'#2563eb',color:'#fff',fontSize:'8.5px',fontWeight:700}
                }, '🏠 휴직'),
                (u.status==='resigned'||u.status==='retired') && h('span', {
                  title:'퇴직: '+(u.resignDate||''),
                  style:{marginLeft:'5px',padding:'1px 5px',borderRadius:'5px',background:'#dc2626',color:'#fff',fontSize:'8.5px',fontWeight:700}
                }, '📤 퇴직')
              ),
              h('td', {style:{padding:'4px 6px',fontSize:'10.5px',color:'#64748b',whiteSpace:'nowrap'}}, u.title),
              // 시급 (통상시급, 자동계산: (기본급+고정수당)/209)
              h('td', {style:Object.assign({},tdNum,{color:'#1e40af',fontWeight:600,background:'#eff6ff'})},
                calc.legal.ordinaryWage>0 ? calc.legal.ordinaryWage.toLocaleString() : '-'),
              // 9개 임금항목 셀 (환경설정 sortOrder 순)
              (function(){
                var cells = {
                  // 기본급
                  base: h('td', {style:tdNum}, h('input',{type:'text',value:(rec.baseSalary||0).toLocaleString(),
                    onChange:function(e){updateRec(u.sid,{baseSalary:parseInt(e.target.value.replace(/[^0-9]/g,''))||0});},
                    style:inputNum})),
                  // 식대 (비과세, 입력)
                  meal: h('td', {style:Object.assign({},tdNum,{background:'#f0fdf4'})}, h('input',{type:'text',
                    value:(rec.nonTaxableMeal||0).toLocaleString(),
                    onChange:function(e){updateRec(u.sid,{nonTaxableMeal:parseInt(e.target.value.replace(/[^0-9]/g,''))||0});},
                    style:Object.assign({},inputNum,{color:'#065f46'})})),
                  // 차량유지비 (비과세, 입력)
                  car: h('td', {style:Object.assign({},tdNum,{background:'#f0fdf4'})}, h('input',{type:'text',
                    value:(rec.nonTaxableCar||0).toLocaleString(),
                    onChange:function(e){updateRec(u.sid,{nonTaxableCar:parseInt(e.target.value.replace(/[^0-9]/g,''))||0});},
                    style:Object.assign({},inputNum,{color:'#065f46'})})),
                  // 연장수당 (자동계산)
                  overtime: h('td', {style:Object.assign({},tdNum,{color:calc.legal.overtime>0?'#92400e':'#cbd5e1'})},
                    calc.legal.overtime>0 ? calc.legal.overtime.toLocaleString() : '-'),
                  // 야간수당 (자동계산)
                  night: h('td', {style:Object.assign({},tdNum,{color:calc.legal.night>0?'#92400e':'#cbd5e1'})},
                    calc.legal.night>0 ? calc.legal.night.toLocaleString() : '-'),
                  // 휴일수당 (자동계산)
                  holiday: h('td', {style:Object.assign({},tdNum,{color:calc.legal.holiday>0?'#92400e':'#cbd5e1'})},
                    calc.legal.holiday>0 ? calc.legal.holiday.toLocaleString() : '-'),
                  // 기타수당
                  etc: (function(){
                    var allows = rec.allowances || [];
                    var etcItem = allows.find(function(a){return a.code==='etc';});
                    var etcAmt = etcItem ? (parseInt(etcItem.amount)||0) : 0;
                    // 별도 컬럼으로 표시되는 신규 임금항목 코드는 +X에서 제외 (중복 합산 방지)
                    var ownColCodes = {};
                    colSpec.forEach(function(c){
                      if(c.type === 'custom') ownColCodes[c.item.code] = true;
                    });
                    var otherAllows = allows.filter(function(a){return a.code!=='etc' && !ownColCodes[a.code] && (parseInt(a.amount)||0)>0;});
                    var otherSum = otherAllows.reduce(function(s,a){return s+(parseInt(a.amount)||0);},0);
                    return h('td', {style:Object.assign({},tdNum,{position:'relative'}),
                      title: otherAllows.length>0 ? ('기타 항목별 합계: '+otherSum.toLocaleString()+'원\n'+otherAllows.map(function(a){return '· '+a.name+' '+parseInt(a.amount||0).toLocaleString();}).join('\n')) : ''
                    },
                      h('input', {type:'text', value:etcAmt.toLocaleString(),
                        onChange:function(e){
                          var v = parseInt(e.target.value.replace(/[^0-9]/g,''))||0;
                          var newAllows = allows.slice();
                          var idx = newAllows.findIndex(function(a){return a.code==='etc';});
                          if(idx>=0){
                            newAllows[idx] = Object.assign({}, newAllows[idx], {amount:v});
                          } else {
                            newAllows.push({code:'etc', name:'기타수당', amount:v});
                          }
                          updateRec(u.sid, {allowances:newAllows});
                        },
                        style:inputNum
                      }),
                      otherSum > 0 && h('div', {
                        style:{position:'absolute',top:'1px',right:'2px',fontSize:'10px',color:'#2563eb',fontWeight:700,pointerEvents:'none'}
                      }, '+'+otherSum.toLocaleString())
                    );
                  })(),
                  // 상여 (입력)
                  bonus_lump: h('td', {style:tdNum}, h('input',{type:'text',value:(rec.bonus||0).toLocaleString(),
                    onChange:function(e){updateRec(u.sid,{bonus:parseInt(e.target.value.replace(/[^0-9]/g,''))||0});},
                    style:inputNum})),
                  // 성과급 (자동: finance_income 연동 우선 → bonus_lump 컬럼 없을 때만 rec.bonus fallback)
                  perf: (function(){
                    var perfLinked = calc.perfBonus.total || 0;
                    var perfDetails = calc.perfBonus.details || [];
                    var hasOverride = perfDetails.some(function(d){ return d.manual || d.isAdjust; });
                    // bonus_lump 컬럼이 이미 표시 중이면 이중표시 방지
                    var hasBonusLumpCol = colSpec.some(function(c){ return c.key === 'bonus_lump'; });
                    var directBonus = (!hasBonusLumpCol && (rec.bonus||0) > 0) ? (rec.bonus||0) : 0;
                    var isLinked = perfDetails.length > 0;
                    var displayVal = isLinked ? perfLinked : directBonus;
                    var isDirect = !isLinked && directBonus > 0;
                    // ★ Fix#2: 상여 셀에도 수동값이 있으면 이중계산 경고
                    var hasDualCount = isLinked && hasBonusLumpCol && (rec.bonus||0) > 0 && !rec.bonusIsPerf;
                    return h('td', {style:Object.assign({},tdNum,{background: hasDualCount?'#fef2f2':(hasOverride?'#fef9c3':'#faf5ff'),
                      color:displayVal>0?'#2563eb':(displayVal<0?'#dc2626':'#cbd5e1'),
                      fontWeight:(displayVal!==0)?700:400,
                      cursor:isLinked?'pointer':'default'})},
                      hasDualCount && h('span',{title:'⚠️ 상여 셀('+( rec.bonus||0).toLocaleString()+'원)과 입금연동 성과('+perfLinked.toLocaleString()+'원)가 동시에 입력됩니다. 이중계산 위험!\n→ 상여 셀을 0으로 비우거나, 입금관리 성과 연동을 해제하세요.',style:{color:'#dc2626',cursor:'help',marginRight:'2px',fontSize:'11px'}},'⚠️'),
                      (isLinked || displayVal > 0)
                        ? h('span',{
                            title: isLinked ? (hasOverride?'✏️ 수동조정 포함 — 클릭: 건별 조정':'클릭: 건별 내역·수동조정') : '엑셀 직접 입력값 (입금관리 연동 없음)',
                            onClick: isLinked ? function(e){e.stopPropagation();setPerfModal({sid:u.sid,name:u.name,ym:props.selYM,total:perfLinked,details:perfDetails});} : null},
                            hasOverride && h('span',{style:{marginRight:'2px',fontSize:'10px'}},'✏️'),
                            displayVal.toLocaleString(),
                            (isLinked && !hasOverride) && h('span',{style:{marginLeft:'3px',fontSize:'10px',color:'#60a5fa'}},'ⓘ'),
                            isDirect && h('span',{style:{marginLeft:'3px',fontSize:'10px',color:'#93c5fd'}},'직접'))
                        : '-');
                  })()
                };
                return colSpec.map(function(c){
                  if(c.type === 'mapped'){
                    return React.cloneElement(cells[c.key], { key:c.key });
                  }
                  // custom: 신규 임금항목 (rec.allowances 배열에 code 기반 저장)
                  var code = c.item.code;
                  var allows = rec.allowances || [];
                  var item = allows.find(function(a){return a.code===code;});
                  var amt = item ? (parseInt(item.amount)||0) : 0;
                  var isDed = c.item.category === 'deduction';
                  var bg = isDed ? '#fef2f2' : (c.item.taxable ? '#fff' : '#f0fdf4');
                  var displayVal = isDed && amt > 0 ? ('-'+amt.toLocaleString()) : amt.toLocaleString();
                  return h('td', { key:c.key, style:Object.assign({},tdNum,{background:bg}),
                    title: isDed ? '공제 - 양수 입력시 자동 차감' : '' },
                    h('input', { type:'text', value:displayVal,
                      onChange:function(e){
                        // 공제 항목이면 - 표시 제거 후 절댓값으로 저장
                        var raw = e.target.value.replace(/[^0-9]/g,'');
                        var v = parseInt(raw)||0;
                        var newAllows = allows.slice();
                        var idx = newAllows.findIndex(function(a){return a.code===code;});
                        if(idx>=0){
                          newAllows[idx] = Object.assign({}, newAllows[idx], {amount:v, name:c.item.name});
                        } else {
                          newAllows.push({code:code, name:c.item.name, amount:v});
                        }
                        updateRec(u.sid, {allowances:newAllows});
                      },
                      style:Object.assign({},inputNum,{color: isDed && amt>0 ? '#dc2626' : (c.item.color||'#1e293b'), fontWeight: isDed && amt>0 ? 700 : undefined})
                    })
                  );
                });
              })(),
              // 지급액
              h('td', {style:Object.assign({},tdNum,{background:'#f0fdf4',fontWeight:700,color:'#166534'})}, calc.grossPay.toLocaleString()),
              // 공제 (접기/펼치기) - 자동 계산 + 수동 수정 (override) 가능
              (function(){
                if(!showDeduct) return [];
                var locked = isPayrollLocked(props.selYM);
                function dedCell(overrideKey, autoVal){
                  var ov = rec[overrideKey];
                  var manual = (ov !== undefined && ov !== null && ov !== '');
                  var v = manual ? parseInt(ov)||0 : autoVal;
                  return h('td', {style:Object.assign({},tdNum,{padding:'2px 4px',background:manual?'#fef3c7':'transparent'})},
                    h('input',{type:'text',value:v.toLocaleString(),disabled:locked,
                      onFocus:function(e){ try{ e.target.select(); }catch(_){} },
                      title: manual ? '수동 입력 (자동값: '+autoVal.toLocaleString()+')\n클릭하면 전체선택 · 0 입력=0 고정 · 비우면 자동' : '자동 계산\n클릭 후 0 입력하면 0으로 고정',
                      onChange:function(e){
                        var raw=(e.target.value+'').replace(/[^0-9-]/g,'');
                        var patch={};
                        patch[overrideKey] = (raw==='' ? null : parseInt(raw)||0);
                        updateRec(u.sid, patch);
                      },
                      style:{width:'100%',padding:'2px 4px',border:'1px solid '+(manual?'#f59e0b':'transparent'),borderRadius:'5px',background:'transparent',
                        textAlign:'right',fontSize:'11px',fontFamily:'monospace',color:manual?'#b45309':'inherit',fontWeight:manual?700:400}}));
                }
                return [
                  dedCell('pensionOverride',   calc.pension),
                  dedCell('healthInsOverride', calc.healthIns),
                  dedCell('longCareOverride',  calc.longCare),
                  dedCell('empInsOverride',    calc.empIns),
                  dedCell('incomeTaxOverride', calc.incomeTax),
                  dedCell('localTaxOverride',  calc.localTax)
                ];
              })(),
              h('td', {style:Object.assign({},tdNum,{background:'#fef3c7',fontWeight:700,color:'#854d0e'})}, calc.totalDeduct.toLocaleString()),
              h('td', {style:Object.assign({},tdNum,{background:'#ecfeff',fontWeight:800,color:'#2563eb'})}, calc.netPay.toLocaleString()),
              // 실비 (비과세) - 맨 오른쪽으로 분리, 일괄확정 시 출금관리에 자동 반영
              (function(){
                var reimbList = rec.reimbursements||[];
                var reimb = reimbList.reduce(function(s,r){return s+(parseInt(r.amount)||0);},0);
                var locked = isPayrollLocked(props.selYM);
                var multi = reimbList.length > 1;
                var tip = multi
                  ? '다중 항목 ('+reimbList.length+'건) - 셀 수정 시 단일 항목으로 통합됨\n' + reimbList.map(function(r){return '• '+(r.note||'-')+' '+parseInt(r.amount||0).toLocaleString();}).join('\n')
                  : '실비변상 (비과세) - 일괄확정 시 출금관리에 자동 반영';
                return h('td',{style:Object.assign({},tdNum,{background:'#fff7ed',padding:'2px 4px',borderLeft:'2px solid #fb923c'})},
                  h('input',{type:'text',value:reimb>0?reimb.toLocaleString():'',disabled:locked,
                    placeholder:'0', title:tip,
                    onChange:function(e){
                      var raw=(e.target.value+'').replace(/[^0-9]/g,'');
                      var v=parseInt(raw)||0;
                      var existing = rec.reimbursements || [];
                      var nextList;
                      if(v <= 0){
                        nextList = [];
                      } else if(existing.length <= 1){
                        nextList = [{ amount:v, note: (existing[0] && existing[0].note) || '실비변상' }];
                      } else {
                        nextList = existing;  // 다중 항목은 셀에서 변경 불가
                      }
                      updateRec(u.sid, { reimbursements:nextList });
                    },
                    style:{width:'100%',padding:'2px 4px',border:'1px solid '+(reimb>0?'#fed7aa':'transparent'),borderRadius:'5px',background:'transparent',
                      textAlign:'right',fontSize:'11px',fontFamily:'monospace',color:reimb>0?'#c2410c':'#94a3b8',fontWeight:reimb>0?700:400}}));
              })(),
              h('td', {style:{padding:'4px',textAlign:'center'}},
                h('span',{style:{
                  background:st==='confirmed'?'#dcfce7':st==='paid'?'#cffafe':'#fef9c3',
                  color:st==='confirmed'?'#166534':st==='paid'?'#2563eb':'#854d0e',
                  fontSize:'10.5px',padding:'1px 6px',borderRadius:'8px',fontWeight:700
                }}, st==='confirmed'?'확정':st==='paid'?'지급':'대기')
              ),
              h('td', {style:{padding:'4px',textAlign:'center'}},
                h('button', {onClick:function(){props.onSelect(u.sid);},
                  style:{padding:'2px 7px',background:'#dbeafe',color:'#1e40af',border:'1px solid #93c5fd',borderRadius:'5px',fontSize:'10px',fontWeight:600,cursor:'pointer'}},'📄')),
              // ★ 개별 이메일 버튼
              h('td', {style:{padding:'4px',textAlign:'center'}},
                (function(){
                  var allUsers3 = dbGet('user_accounts', USERS_SEED) || [];
                  var fu3 = allUsers3.find(function(x){return x.sid===u.sid;})||{};
                  var email3 = fu3.email||'';
                  if(!email3) return h('span',{style:{fontSize:'10px',color:'#cbd5e1'}},'—');
                  var subj3 = encodeURIComponent('[푸른노무법인] '+props.selYM+' 급여명세서 — '+u.name);
                  var _rb3 = (rec.reimbursements||[]).reduce(function(s,x){return s+(parseInt(x.amount)||0);},0);
                  var bdy3 = encodeURIComponent(
                    u.name+' 님 안녕하세요.\n푸른노무법인입니다.\n\n▶ '+props.selYM+' 급여명세서\n\n기본급: '+(rec.baseSalary||0).toLocaleString()+'원\n지급액 합계: '+calc.grossPay.toLocaleString()+'원\n공제액 합계: '+calc.totalDeduct.toLocaleString()+'원\n\n★ 실지급액: '+calc.netPay.toLocaleString()+'원'+(_rb3>0?'\n💵 실비변상(비과세·별도 송금): '+_rb3.toLocaleString()+'원':'')+'\n\n감사합니다.\n푸른노무법인'
                  );
                  return h('a',{href:'mailto:'+email3+'?subject='+subj3+'&body='+bdy3,
                    style:{display:'inline-block',padding:'2px 7px',background:'#dcfce7',color:'#166534',
                      border:'1px solid #bbf7d0',borderRadius:'5px',fontSize:'10px',fontWeight:600,textDecoration:'none'}},'📧');
                })()
              )
            );
          })
        )
      )
    ),
    // ── 전월복사 확인 팝업 ──
    copyModal && h('div', { style:{
        position:'fixed', inset:0, zIndex:3000,
        display:'flex', alignItems:'center', justifyContent:'center',
        background:'rgba(15,27,68,0.45)', backdropFilter:'blur(2px)'
      },
      onClick:function(){ setCopyModal(null); }},
      h('div', { style:{
          background:'#fff', borderRadius:'12px', padding:'28px 28px 22px',
          boxShadow:'0 20px 60px rgba(0,0,0,0.25)',
          minWidth:'340px', maxWidth:'420px', position:'relative'
        },
        onClick:function(e){e.stopPropagation();}},
        // 타이틀
        h('div', { style:{display:'flex', alignItems:'center', gap:'10px', marginBottom:'16px'} },
          h('div', { style:{width:'36px',height:'36px',borderRadius:'50%',background:'#fef3c7',
            display:'flex',alignItems:'center',justifyContent:'center',fontSize:'18px',flexShrink:0}}, '📋'),
          h('div', null,
            h('div', { style:{fontWeight:800, fontSize:'15px', color:'#1e293b'} }, '전월 복사'),
            h('div', { style:{fontSize:'11px', color:'#94a3b8', marginTop:'2px'} }, '월별급여대장')
          )
        ),
        // 내용
        h('div', { style:{background:'#f8fafc', borderRadius:'8px', padding:'14px 16px', marginBottom:'20px',
          border:'1px solid #e2e8f0'} },
          h('div', { style:{fontSize:'13px', color:'#334155', lineHeight:1.6} },
            h('span', { style:{color:'#b45309', fontWeight:700} }, copyModal.prevYM),
            ' 데이터 ',
            h('span', { style:{color:'#1e40af', fontWeight:700, fontSize:'15px'} }, copyModal.count + '건'),
            '을',
            h('br'),
            h('span', { style:{color:'#059669', fontWeight:700} }, props.selYM),
            ' 으로 복사합니다.'
          ),
          h('div', { style:{fontSize:'10.5px', color:'#94a3b8', marginTop:'8px', display:'flex', gap:'4px', alignItems:'flex-start'} },
            h('span', null,'💡'),
            h('span', null, '복사 후 [↩ 복사취소] 버튼으로 즉시 되돌릴 수 있습니다.')
          )
        ),
        // 버튼
        h('div', { style:{display:'flex', gap:'8px', justifyContent:'flex-end'} },
          h('button', { onClick:function(){setCopyModal(null);},
            style:{padding:'9px 20px', background:'#f1f5f9', border:'1px solid #cbd5e1',
              borderRadius:'6px', cursor:'pointer', fontSize:'13px', fontWeight:600, color:'#475569'} },
            '취소'),
          h('button', { onClick:confirmCopy,
            style:{padding:'9px 22px', background:'#f59e0b', border:'none',
              borderRadius:'6px', cursor:'pointer', fontSize:'13px', fontWeight:700, color:'#fff',
              boxShadow:'0 2px 8px rgba(245,158,11,0.4)'} },
            '✔ 복사')
        )
      )
    ),
    bulkModal && h(PayrollBulkModal, {
      ym: props.selYM,
      users: users,
      onClose: function(){ setBulkModal(false); },
      onApply: function(){
        var allRecs = dbGet('payroll_monthly', []);
        setRecs(allRecs);
        setBulkModal(false);
      }
    }),
    // 성과급 출처 모달 (#2)
    // ★ 이메일 발송 모달
    emailModal && h('div', { className:'modal-bg', onClick:function(){ setEmailModal(false); } },
      h('div', { className:'modal', style:{ width:'680px' }, onClick:function(e){ e.stopPropagation(); } },
        h('div', { className:'modal-h' },
          h('div', { className:'t' }, '📧 급여명세서 이메일 발송 — ' + props.selYM),
          h('button', { className:'x', onClick:function(){ setEmailModal(false); } }, '×')
        ),
        h('div', { className:'modal-b', style:{ maxHeight:'70vh', overflowY:'auto' } },
          h('div', { style:{ background:'#eff6ff', border:'1px solid #bfdbfe', borderRadius:'6px', padding:'10px 14px', marginBottom:'14px', fontSize:'11.5px', color:'#1e40af', lineHeight:'1.7' } },
            '📌 직원별 📧 버튼을 누르면 확인 후 그 직원 이메일로 명세서가 PDF 첨부로 자동 발송됩니다 (발신: 푸른노무법인).',h('br'),
            '이메일 주소가 없는 직원은 먼저 환경설정 → 인사관리기준 → 직원 정보에서 이메일을 등록해 주세요.'
          ),
          h('label', { style:{ display:'flex', alignItems:'center', gap:'6px', marginBottom:'12px', fontSize:'12px', color:'#475569', cursor:'pointer' } },
            h('input', { type:'checkbox', checked: emailIncludeLeave, onChange:function(e){ setEmailIncludeLeave(e.target.checked); } }),
            h('span', null, '휴직자 포함 (예외 발송)'),
            (emailLeaveCount > 0 && !emailIncludeLeave) ? h('span', { style:{ color:'#92400e', fontWeight:600 } }, '· 휴직자 ' + emailLeaveCount + '명 제외됨') : null
          ),
          h('table', { style:{ width:'100%', borderCollapse:'collapse', fontSize:'12px' } },
            h('thead', null,
              h('tr', { style:{ background:'#f8fafc', borderBottom:'2px solid #e5e7eb' } },
                h('th', { style:{ padding:'8px 10px', textAlign:'left' } }, '직원'),
                h('th', { style:{ padding:'8px 10px', textAlign:'left' } }, '이메일'),
                h('th', { style:{ padding:'8px 10px', textAlign:'right' } }, '실지급액'),
                h('th', { style:{ padding:'8px 10px', textAlign:'center', width:'80px' } }, '발송')
              )
            ),
            h('tbody', null,
              emailUsers.map(function(u){
                var rec = getRec(u.sid);
                var calc = calcPayroll(rec);
                var allUsers = dbGet('user_accounts', USERS_SEED) || [];
                var fullUser = allUsers.find(function(x){ return x.sid === u.sid; }) || {};
                var email = fullUser.email || '';
                var subjectText = '[푸른노무법인] ' + props.selYM + ' 급여명세서 — ' + u.name;
                var reimbB = (rec.reimbursements||[]).reduce(function(s,x){return s+(parseInt(x.amount)||0);},0);
                var bodyText =
                  u.name + ' 님 안녕하세요.\n푸른노무법인입니다.\n\n' +
                  '▶ ' + props.selYM + ' 급여명세서\n\n' +
                  '─────────────────\n' +
                  '[지급]\n' +
                  '  기본급:      ' + (rec.baseSalary||0).toLocaleString() + '원\n' +
                  '  수당 합계:   ' + calc.allowSum.toLocaleString() + '원\n' +
                  '  법정수당:    ' + calc.legal.total.toLocaleString() + '원\n' +
                  '  성과금:      ' + calc.perfBonus.total.toLocaleString() + '원\n' +
                  '  지급액 합계: ' + calc.grossPay.toLocaleString() + '원\n\n' +
                  '[공제]\n' +
                  '  국민연금:    ' + calc.pension.toLocaleString() + '원\n' +
                  '  건강보험:    ' + calc.healthIns.toLocaleString() + '원\n' +
                  '  장기요양:    ' + calc.longCare.toLocaleString() + '원\n' +
                  '  고용보험:    ' + calc.empIns.toLocaleString() + '원\n' +
                  '  소득세:      ' + calc.incomeTax.toLocaleString() + '원\n' +
                  '  지방세:      ' + calc.localTax.toLocaleString() + '원\n' +
                  '  공제 합계:   ' + calc.totalDeduct.toLocaleString() + '원\n\n' +
                  '─────────────────\n' +
                  '★ 실지급액:   ' + calc.netPay.toLocaleString() + '원\n' +
                  (reimbB>0 ? '💵 실비변상(비과세·별도 송금): ' + reimbB.toLocaleString() + '원\n\n' : '\n') +
                  '문의사항은 사무실로 연락 주세요.\n감사합니다.\n\n푸른노무법인';
                return h('tr', { key:u.sid, style:{ borderBottom:'1px solid #f1f5f9' } },
                  h('td', { style:{ padding:'8px 10px', fontWeight:600 } }, u.name, _emailOnLeave(u) ? h('span', { style:{ marginLeft:'6px', fontSize:'9.5px', background:'#fef3c7', color:'#92400e', padding:'1px 5px', borderRadius:'8px', fontWeight:700 } }, '휴직') : null),
                  h('td', { style:{ padding:'8px 10px', color: email?'#1e293b':'#dc2626', fontSize:'11.5px' } },
                    email || '⚠️ 미등록'),
                  h('td', { style:{ padding:'8px 10px', textAlign:'right', fontFamily:'monospace', fontWeight:700 } },
                    calc.netPay.toLocaleString() + '원'),
                  h('td', { style:{ padding:'8px 10px', textAlign:'center' } },
                    email
                      ? h('button', { onClick: function(){ sendPayslipRow(u, email, subjectText, bodyText); },
                          style:{ display:'inline-block', padding:'4px 12px', background:'#16a34a', color:'#fff', border:'none', borderRadius:'5px', fontSize:'11.5px', fontWeight:700, cursor:'pointer' } },
                          '📧 발송')
                      : h('span', { style:{ fontSize:'11px', color:'#94a3b8' } }, '—')
                  )
                );
              })
            )
          )
        ),
        h('div', { className:'modal-f' },
          h('div', { style:{ flex:1, fontSize:'11.5px', color:'#64748b' } },
            '💡 이메일 주소 등록: 환경설정 → 인사관리기준 → 직원 상세'),
          h('button', { className:'btn-secondary', style:{ background:'#fef3c7', color:'#92400e', borderColor:'#fde68a' }, title:'배포한 함수로 본인 메일(' + PAYSLIP_TEST_TO + ')에 첫 직원 명세서를 발송해 동작을 확인합니다', onClick: sendPayslipTest }, '🧪 자동발송 테스트(내 메일)'),
          h('button', { className:'btn-secondary', onClick:function(){ setEmailModal(false); } }, '닫기'),
          h('button', { className:'btn-primary',
            onClick:function(){
              var allUsers2 = dbGet('user_accounts', USERS_SEED) || [];
              var sent = 0;
              emailUsers.forEach(function(u){
                var fu = allUsers2.find(function(x){return x.sid===u.sid;})||{};
                if(!fu.email) return;
                var rec2 = getRec(u.sid); var calc2 = calcPayroll(rec2);
                var subj = encodeURIComponent('[푸른노무법인] ' + props.selYM + ' 급여명세서 — ' + u.name);
                var bdy = encodeURIComponent(u.name+' 님 안녕하세요.\n\n★ 실지급액: '+calc2.netPay.toLocaleString()+'원\n\n자세한 내역은 개별 이메일을 확인해 주세요.\n\n푸른노무법인');
                window.open('mailto:'+fu.email+'?subject='+subj+'&body='+bdy, '_blank');
                sent++;
              });
              showToast('📧 ' + sent + '명 이메일 초안 생성됨');
            } },
            '📧 전체 발송')
        )
      )
    ),

    perfModal && (function(){
      var _pm = perfModal;
      var _pmRefresh = function(extra){
        var r = calcPerfBonus(_pm.sid, _pm.ym);
        setPerfModal(Object.assign({}, _pm, {total:r.total, details:r.details, editIdx:null, editVal:''}, extra||{}));
      };
      var _parseAmt = function(s){ return parseInt(String(s).replace(/[^0-9\-]/g,''),10)||0; };
      var _hasManual = _pm.details.some(function(d){ return d.manual || d.isAdjust; });
      var thP = {padding:'7px 8px',background:'#f8fafc',borderBottom:'1px solid #e2e8f0',fontWeight:700,color:'#475569',fontSize:'10.5px',textAlign:'left'};
      return h('div', { className:'modal-bg', onClick:function(){setPerfModal(null);} },
      h('div', { className:'modal', style:{width:'660px'}, onClick:function(e){e.stopPropagation();} },
        h('div', { className:'modal-h' },
          h('div', { className:'t' }, '⭐ 성과급 - '+_pm.name+' ('+_pm.ym+')'),
          h('button', { className:'x', onClick:function(){setPerfModal(null);} }, '×')
        ),
        h('div', { className:'modal-b' },
          h('div', { style:{background:'#faf5ff',border:'1px solid #e9d5ff',borderRadius:'6px',padding:'10px 14px',marginBottom:'12px',display:'flex',justifyContent:'space-between',alignItems:'center'} },
            h('div', { style:{fontSize:'12px',color:'#1e40af'} }, '총 '+_pm.details.length+'건',
              _hasManual && h('span',{style:{marginLeft:'8px',background:'#fef3c7',color:'#92400e',padding:'2px 8px',borderRadius:'10px',fontSize:'10px',fontWeight:800}},'✏️ 수동조정 포함')),
            h('div', { style:{fontSize:'17px',fontWeight:800,color:'#2563eb',fontFamily:'monospace'} }, _pm.total.toLocaleString()+'원')
          ),
          h('table', { style:{width:'100%',borderCollapse:'collapse',fontSize:'11.5px'} },
            h('thead', null, h('tr', null,
              h('th', { style:thP }, '일자'),
              h('th', { style:thP }, '출처'),
              h('th', { style:Object.assign({},thP,{textAlign:'center',width:'52px'}) }, '역할'),
              h('th', { style:Object.assign({},thP,{textAlign:'right',width:'46px'}) }, '비율'),
              h('th', { style:Object.assign({},thP,{textAlign:'right',width:'120px'}) }, '금액'),
              h('th', { style:Object.assign({},thP,{width:'40px'}) }, '')
            )),
            h('tbody', null,
              _pm.details.length === 0
                ? h('tr', null, h('td', { colSpan:6, style:{padding:'24px',textAlign:'center',color:'#94a3b8'} }, '내역 없음'))
                : _pm.details.map(function(d, i){
                    var editing = _pm.editIdx === i;
                    return h('tr', { key:i, style:{borderBottom:'1px solid #f1f5f9', background: d.isAdjust?'#f0fdfa':(d.manual?'#fffbeb':'transparent')} },
                      h('td', { style:{padding:'7px 8px',fontFamily:'monospace',color:'#64748b'} }, (d.date||'-').slice(5)),
                      h('td', { style:{padding:'7px 8px',color:'#1e293b'} },
                        d.source||'-',
                        d.isAdjust && h('span',{style:{marginLeft:'5px',background:'#ccfbf1',color:'#0f766e',padding:'1px 6px',borderRadius:'8px',fontSize:'9px',fontWeight:800}},'추가'),
                        (!d.isAdjust && d.manual) && h('span',{style:{marginLeft:'5px',background:'#fef3c7',color:'#92400e',padding:'1px 6px',borderRadius:'8px',fontSize:'9px',fontWeight:800}},'수동'),
                        (!d.isAdjust && d.manual && d.amountAuto != null) && h('div',{style:{fontSize:'9.5px',color:'#cbd5e1',textDecoration:'line-through',fontFamily:'monospace'}},'자동 '+d.amountAuto.toLocaleString())),
                      h('td', { style:{padding:'7px 8px',textAlign:'center'} },
                        h('span', { style:{background:d.role==='주담당'?'#dbeafe':(d.role==='조정'?'#ccfbf1':'#cffafe'),color:d.role==='주담당'?'#1e40af':(d.role==='조정'?'#0f766e':'#2563eb'),padding:'1px 7px',borderRadius:'8px',fontSize:'10px',fontWeight:700} }, d.role||'담당')),
                      h('td', { style:{padding:'7px 8px',textAlign:'right',fontFamily:'monospace',color:'#64748b'} }, d.isAdjust?'—':((d.pct||0)+'%')),
                      h('td', { style:{padding:'7px 8px',textAlign:'right'} },
                        editing
                          ? h('input', { type:'text', autoFocus:true, value:_pm.editVal,
                              onChange:function(e){ setPerfModal(Object.assign({},_pm,{editVal:e.target.value})); },
                              onKeyDown:function(e){ if(e.key==='Enter'){ applyPerfOverride(d.incomeId,_pm.sid,_pm.name,_parseAmt(_pm.editVal)); showToast('건별 수동값 적용 — 성과관리에도 반영됨'); _pmRefresh(); } if(e.key==='Escape'){ setPerfModal(Object.assign({},_pm,{editIdx:null,editVal:''})); } },
                              style:{width:'100px',padding:'4px 7px',border:'1.5px solid #f59e0b',borderRadius:'6px',fontFamily:'monospace',fontWeight:700,fontSize:'11.5px',textAlign:'right',background:'#fffbeb'} })
                          : h('span', { style:{fontFamily:'monospace',fontWeight:700,color:d.amount<0?'#dc2626':(d.manual||d.isAdjust?'#92400e':'#2563eb')} }, (d.amount||0).toLocaleString())),
                      h('td', { style:{padding:'7px 4px',textAlign:'center'} },
                        editing
                          ? h('button', { title:'적용(Enter)', onClick:function(){ applyPerfOverride(d.incomeId,_pm.sid,_pm.name,_parseAmt(_pm.editVal)); showToast('건별 수동값 적용 — 성과관리에도 반영됨'); _pmRefresh(); },
                              style:{width:'26px',height:'24px',border:'1px solid #f59e0b',background:'#fef3c7',borderRadius:'6px',cursor:'pointer',fontSize:'11px'} }, '✔')
                          : d.isAdjust
                            ? h('button', { title:'수기 항목 삭제', onClick:async function(){ if(!(await popConfirm('수기 조정 항목을 삭제할까요?\n\n'+d.source+' / '+(d.amount||0).toLocaleString()+'원\n(성과관리에서도 함께 제거됩니다)'))) return; removePerfAdjust(d.incomeId); showToast('수기 항목 삭제됨'); _pmRefresh(); },
                                style:{width:'26px',height:'24px',border:'1px solid #fca5a5',background:'#fef2f2',borderRadius:'6px',cursor:'pointer',fontSize:'11px'} }, '🗑️')
                            : d.manual
                              ? h('button', { title:'자동값으로 복귀', onClick:function(){ revertPerfOverride(d.incomeId,_pm.sid,_pm.name); showToast('자동값으로 복귀됨'); _pmRefresh(); },
                                  style:{width:'26px',height:'24px',border:'1px solid #bfdbfe',background:'#eff6ff',borderRadius:'6px',cursor:'pointer',fontSize:'11px'} }, '↩️')
                              : h('button', { title:'이 건만 수동 수정', onClick:function(){ setPerfModal(Object.assign({},_pm,{editIdx:i, editVal:String(d.amount||0)})); },
                                  style:{width:'26px',height:'24px',border:'1px solid #e2e8f0',background:'#fff',borderRadius:'6px',cursor:'pointer',fontSize:'11px',color:'#94a3b8'} }, '✏️'))
                    );
                  })
            )
          ),
          // 수기 항목 추가
          h('div', { style:{display:'flex',gap:'8px',alignItems:'center',marginTop:'12px'} },
            h('input', { type:'text', placeholder:'항목명 (예: 소급 정산)', value:_pm.addLabel||'',
              onChange:function(e){ setPerfModal(Object.assign({},_pm,{addLabel:e.target.value})); },
              style:{flex:1,padding:'7px 10px',border:'1px solid #cbd5e1',borderRadius:'7px',fontSize:'11.5px'} }),
            h('input', { type:'text', placeholder:'금액 (±)', value:_pm.addAmt||'',
              onChange:function(e){ setPerfModal(Object.assign({},_pm,{addAmt:e.target.value})); },
              style:{width:'110px',padding:'7px 10px',border:'1px solid #cbd5e1',borderRadius:'7px',fontSize:'11.5px',fontFamily:'monospace',fontWeight:700,textAlign:'right'} }),
            h('button', { onClick:function(){
                var amt = _parseAmt(_pm.addAmt);
                if(!amt){ showToast('금액을 입력하세요 (음수 가능)'); return; }
                addPerfAdjust(_pm.sid, _pm.name, _pm.addLabel||'수기 조정', amt, _pm.ym);
                showToast('수기 항목 추가 — 성과관리에도 표시됩니다');
                _pmRefresh({addLabel:'', addAmt:''});
              },
              style:{padding:'7px 12px',background:'#0f766e',color:'#fff',border:'none',borderRadius:'7px',fontSize:'11.5px',fontWeight:800,cursor:'pointer',whiteSpace:'nowrap'} }, '＋ 수기 항목')
          ),
          h('div', { style:{marginTop:'10px',padding:'8px 12px',background:'#f0f9ff',borderRadius:'5px',fontSize:'10.5px',color:'#1e40af',lineHeight:'1.5'} },
            '💡 ✏️로 고친 건과 수기 항목은 ',h('strong',null,'원천(입금관리 성과분배)을 직접 수정'),'하므로 성과관리·급여·대시보드가 모두 자동 동기화됩니다. 나머지 건은 계속 자동 연동.')
        ),
        h('div', { className:'modal-f' },
          _hasManual
            ? h('button', { className:'btn-secondary', style:{color:'#1e40af'}, onClick:async function(){
                if(!(await popConfirm('모든 수동값을 지우고 완전 자동으로 되돌릴까요?\n\n· 건별 수동값 → 자동값 복원\n· 수기 추가 항목 → 삭제'))) return;
                _pm.details.forEach(function(d){
                  if(d.isAdjust) removePerfAdjust(d.incomeId);
                  else if(d.manual) revertPerfOverride(d.incomeId,_pm.sid,_pm.name);
                });
                showToast('전체 자동으로 복귀됨');
                _pmRefresh();
              } }, '↩️ 전체 자동으로 복귀')
            : h('div', { style:{flex:1} }),
          h('div', { style:{flex:1} }),
          h('button', { onClick:function(){
              if(_pm.editIdx != null){ var _ed = _pm.details[_pm.editIdx]; if(_ed){ applyPerfOverride(_ed.incomeId, _pm.sid, _pm.name, _parseAmt(_pm.editVal)); } }
              showToast('성과급 저장됨 — 성과관리·급여·대시보드 반영');
              setPerfModal(null);
            }, style:{background:'#2563eb',color:'#fff',border:'none',borderRadius:'7px',padding:'8px 18px',fontSize:'12px',fontWeight:800,cursor:'pointer',marginRight:'8px'} }, '💾 저장'),
          h('button', { className:'btn-secondary', onClick:function(){setPerfModal(null);} }, '닫기')
        )
      )
    );
    })()
  );
}

// 급여 일괄수정 모달
function PayrollBulkModal(props){
  useEscClose(props.onClose);
  var modes = [
    {v:'bonus', label:'명절상여 일괄 추가'},
    {v:'raise', label:'임금인상 일괄 적용 (%)'},
    {v:'meal',  label:'식대 일괄 변경'}
  ];
  var md = useState('bonus'); var mode = md[0]; var setMode = md[1];
  var v = useState(0); var amount = v[0]; var setAmount = v[1];

  function apply(){
    if(isPayrollLocked(props.ym)){ showToast('🔒 '+props.ym+'은 잠겨있어 일괄수정 불가'); return; }
    if(amount<=0 && mode!=='meal'){ showToast('금액 입력'); return; }
    var allRecs = dbGet('payroll_monthly', []);
    var ym = props.ym;
    props.users.forEach(function(u){
      var existing = allRecs.find(function(r){return r.empSid===u.sid && r.ym===ym;});
      var base = existing || {
        id:'pay-'+u.sid+'-'+ym, empSid:u.sid, empName:u.name,
        deptName:u.branch||'', position:u.title||'',
        ym:ym,
        baseSalary:u.baseSalary||0,
        allowances:u.allowances||[],
        bonus:0,
        dependents:u.dependents||1,
        nonTaxableMeal:u.nonTaxableMeal||0,
        nonTaxableCar:u.nonTaxableCar||0,
        nonTaxableChildcare:u.nonTaxableChildcare||0,
        workDays:0,
        legalAllowances:{},
        status:'draft'
      };
      var patch = {};
      if(mode==='bonus'){
        patch.bonus = (base.bonus||0) + amount;
      } else if(mode==='raise'){
        patch.baseSalary = Math.round((base.baseSalary||0) * (1 + amount/100));
      } else if(mode==='meal'){
        patch.nonTaxableMeal = amount;
      }
      var newRec = Object.assign({}, base, patch);
      if(existing){
        allRecs = allRecs.map(function(r){ return (r.empSid===u.sid&&r.ym===ym)?newRec:r; });
      } else {
        allRecs.push(newRec);
      }
    });
    dbSet('payroll_monthly', allRecs);
    addPayrollAudit('', ym, '일괄수정/'+mode, '', amount.toLocaleString(), props.users.length+'명 적용');
    showToast(props.users.length+'명 일괄 적용 완료');
    props.onApply();
  }

  return h('div', {style:{position:'fixed',top:0,left:0,right:0,bottom:0,background:'rgba(0,0,0,0.5)',zIndex:9300,display:'flex',alignItems:'center',justifyContent:'center'}, onClick:function(e){ if(e.target===e.currentTarget && props.onClose) props.onClose(); }},
    h('div', {onClick:function(e){e.stopPropagation();}, className:'modal',
      style:{background:'#fff',borderRadius:'10px',maxWidth:'440px',width:'90%',boxShadow:'0 12px 40px rgba(0,0,0,0.2)',overflow:'hidden'}},
      h('div',{className:'modal-h', style:{fontWeight:800,fontSize:'15px',padding:'16px 24px',borderBottom:'1px solid #e5e7eb',display:'flex',alignItems:'center',justifyContent:'space-between'}},
        '🔧 ' + props.ym + ' 일괄수정 (' + props.users.length + '명)',
        h('button',{onClick:props.onClose,className:'x',style:{background:'none',border:'none',fontSize:'18px',cursor:'pointer',color:'#94a3b8',padding:'0'}},'×')
      ),
      h('div',{style:{padding:'24px'}},
        h('div',{style:{marginBottom:'12px'}},
        h('div',{style:{fontSize:'11.5px',fontWeight:600,color:'#475569',marginBottom:'5px'}},'적용 항목'),
        h('select',{value:mode, onChange:function(e){setMode(e.target.value); setAmount(0);},
          style:{width:'100%',padding:'7px 10px',border:'1px solid #cbd5e1',borderRadius:'4px',fontSize:'12.5px'}},
          modes.map(function(m){return h('option',{key:m.v,value:m.v}, m.label);}))
      ),
      h('div',{style:{marginBottom:'14px'}},
        h('div',{style:{fontSize:'11.5px',fontWeight:600,color:'#475569',marginBottom:'5px'}},
          mode==='raise' ? '인상률 (%)' : '금액 (원)'),
        h('input',{type:'number',value:amount, onChange:function(e){setAmount(parseInt(e.target.value)||0);},
          placeholder: mode==='raise' ? '예: 5' : '예: 500000',
          style:{width:'100%',padding:'7px 10px',border:'1px solid #cbd5e1',borderRadius:'4px',fontSize:'13px',textAlign:'right',fontFamily:'monospace'}})
      ),
      h('div',{style:{background:'#f0f9ff',borderRadius:'5px',padding:'8px 10px',fontSize:'10.5px',color:'#1e40af',marginBottom:'14px'}},
        mode==='bonus' ? '✓ 모든 직원의 상여(bonus)에 ' + amount.toLocaleString() + '원 추가' :
        mode==='raise' ? '✓ 모든 직원의 기본급에 ' + amount + '% 인상 적용' :
        '✓ 모든 직원의 식대 비과세를 ' + amount.toLocaleString() + '원으로 설정 (한도 20만원)'),
        h('div',{style:{display:'flex',gap:'8px'}},
          h('button',{onClick:props.onClose,
            style:{flex:1,padding:'8px',border:'1px solid #cbd5e1',borderRadius:'5px',background:'#fff',cursor:'pointer'}},'취소'),
          h('button',{onClick:apply,
            style:{flex:2,padding:'8px',border:'none',borderRadius:'5px',background:'#2563eb',color:'#fff',fontWeight:700,cursor:'pointer'}},
            '✓ 일괄 적용')
        )
      )
    )
  );
}

// ── 급여명세서 (1직원 상세) ──
function getLeavePromoNotice(empName){
  try{
    var pol = dbGet('policy_leave', {}) || {};
    var basis = pol.basis || 'joinDate';
    var fiscalMonth = Number(pol.fiscalMonth || 1) || 1;
    var ledger = dbGet('leave_ledger', []) || [];
    var today = new Date(); today.setHours(0,0,0,0);
    var year = today.getFullYear();
    var lr = null;
    for(var i=0;i<ledger.length;i++){ if(ledger[i].name===empName && Number(ledger[i].year)===year){ lr=ledger[i]; break; } }
    if(!lr) return null;
    var remain = (lr.remain!=null && !isNaN(Number(lr.remain))) ? Number(lr.remain) : null;
    if(remain==null || remain<=0) return null;
    function pad(n){ return (n<10?'0':'')+n; }
    function fmt(d){ return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate()); }
    function lastDayOfMonth(y, mIdx){ return new Date(y, mIdx+1, 0); }
    var expiry;
    if(basis==='fiscalYear'){
      expiry = (fiscalMonth===1) ? new Date(year,11,31) : lastDayOfMonth(year+1, fiscalMonth-2);
    } else {
      var users = dbGet('user_accounts', USERS_SEED) || [];
      var u=null; for(var j=0;j<users.length;j++){ if(users[j].name===empName){ u=users[j]; break; } }
      if(!u || !u.hireDate) return null;
      var hd=new Date(u.hireDate); if(isNaN(hd.getTime())) return null;
      var cand=new Date(year, hd.getMonth(), hd.getDate());
      if(cand.getTime()<=today.getTime()) cand=new Date(year+1, hd.getMonth(), hd.getDate());
      expiry=cand;
    }
    var p1=new Date(expiry.getTime()); var _d=p1.getDate(); p1.setMonth(p1.getMonth()-6); if(p1.getDate()<_d) p1.setDate(0);
    if(today < p1 || today >= expiry) return null;
    return { remain:remain, expiryStr:fmt(expiry) };
  }catch(_e){ return null; }
}

function PayrollPayslip(props){
  // Hooks: 조기 return보다 먼저 호출 (Hooks 규칙)
  var rf = useState(0); var refresh = rf[0]; var setRefresh = rf[1];

  var users = getActiveUsers() || [];
  if(!Array.isArray(users) || users.length === 0){
    return h('div', { style:{ padding:'40px', textAlign:'center', background:'#fff', border:'1px solid #e5e7eb', borderRadius:'8px', margin:'20px' } },
      h('div', { style:{ fontSize:'14px', color:'#94a3b8' } }, '활성 직원이 없습니다'),
      h('div', { style:{ fontSize:'11px', color:'#cbd5e1', marginTop:'4px' } }, '인사관리 → 근로자명부에서 직원을 추가하세요')
    );
  }
  var recs = dbGet('payroll_monthly', []) || [];
  var sid = props.selSid || (users[0] && users[0].sid);
  var u = users.find(function(x){return x.sid===sid;}) || users[0];
  if(!u){
    return h('div', { style:{ padding:'40px', textAlign:'center', color:'#94a3b8' } },
      h('div', { style:{ fontSize:'14px' } }, '직원을 찾을 수 없습니다'),
      h('div', { style:{ fontSize:'11px', marginTop:'4px' } }, '선택된 sid: ' + (sid || '(없음)'))
    );
  }

  var existing = recs.find(function(r){return r.empSid===u.sid && r.ym===props.selYM;});
  // ⚙️ 직원관리 → 급여 자동연동 강화
  var rec = existing || { id:'pay-'+u.sid+'-'+props.selYM, empSid:u.sid, empName:u.name,
    deptName:u.branch||'', position:u.title||'',
    ym:props.selYM,
    baseSalary:u.baseSalary||0,
    allowances:u.allowances||[],
    bonus:0,
    dependents:u.dependents||1,
    nonTaxableMeal: u.nonTaxableMeal||0,
    nonTaxableCar: u.nonTaxableCar||0,
    nonTaxableChildcare: u.nonTaxableChildcare||0,
    workDays: 0,
    legalAllowances: {},
    status:'draft' };
  var calc = calcPayroll(rec);

  function changeMonth(delta){
    var d = new Date(props.selYM+'-01'); d.setMonth(d.getMonth()+delta);
    props.setSelYM(d.toISOString().slice(0,7));
  }

  function printSlip(){ window.print(); }

  // 일괄 이메일 모달 state
  var beS = useState(false); var bulkEmail = beS[0]; var setBulkEmail = beS[1];

  // 급여명세서 본문 생성 (이메일 본문용 평문)
  function buildSlipBody(empSid, ym){
    var emp = users.find(function(x){return x.sid===empSid;}) || {};
    var allRecs = dbGet('payroll_monthly', []);
    var r = allRecs.find(function(x){return x.empSid===empSid && x.ym===ym;}) || {};
    var base = +r.baseSalary||0, food = +r.allowFood||0, car = +r.allowCar||0, child = +r.allowChild||0, etc = +r.allowEtc||0, bonus = +r.bonus||0;
    var gross = base + food + car + child + etc + bonus;
    var ded = (+r.dedPension||0) + (+r.dedHealth||0) + (+r.dedLtc||0) + (+r.dedEmp||0) + (+r.dedIncome||0) + (+r.dedLocal||0) + (+r.dedEtc||0);
    var net = gross - ded;
    var body = [
      '【'+ym+' 급여명세서】',
      '',
      '성명: '+(emp.name||''),
      '사번: '+(emp.sid||''),
      '직책: '+(emp.title||''),
      '',
      '─── 지급 ───',
      '기본급:   '+base.toLocaleString()+'원',
      '식대:     '+food.toLocaleString()+'원',
      '차량유지: '+car.toLocaleString()+'원',
      '육아수당: '+child.toLocaleString()+'원',
      '기타수당: '+etc.toLocaleString()+'원',
      '성과급:   '+bonus.toLocaleString()+'원',
      '지급합계: '+gross.toLocaleString()+'원',
      '',
      '─── 공제 ───',
      '국민연금: '+(+r.dedPension||0).toLocaleString()+'원',
      '건강보험: '+(+r.dedHealth||0).toLocaleString()+'원',
      '장기요양: '+(+r.dedLtc||0).toLocaleString()+'원',
      '고용보험: '+(+r.dedEmp||0).toLocaleString()+'원',
      '소득세:   '+(+r.dedIncome||0).toLocaleString()+'원',
      '지방세:   '+(+r.dedLocal||0).toLocaleString()+'원',
      '기타공제: '+(+r.dedEtc||0).toLocaleString()+'원',
      '공제합계: '+ded.toLocaleString()+'원',
      '',
      '─── 실지급액 ───',
      net.toLocaleString()+'원',
      '',
      '※ 푸른노무법인',
      '※ 본 명세서는 ERP에서 자동 생성되었습니다.'
    ].join('\n');
    var _pn = getLeavePromoNotice(emp.name);
    if(_pn){ body += '\n\n─── 연차 사용촉진 안내 ───\n미사용 연차 '+_pn.remain+'일 · 사용기간 ~'+_pn.expiryStr+' 까지\n사용시기를 지정해 주세요.'; }
    return body;
  }

  // 개인 이메일 송부 (mailto)
  function emailSlip(empSid){
    var emp = users.find(function(x){return x.sid===empSid;});
    if(!emp){ showToast('직원 정보 없음'); return; }
    if(!emp.email){ showToast('⚠️ '+emp.name+' 이메일 미등록 (근로자명부 > 기본정보)'); return; }
    var subject = encodeURIComponent('['+props.selYM+' 급여명세서] '+emp.name);
    var body = encodeURIComponent(buildSlipBody(empSid, props.selYM));
    window.location.href = 'mailto:'+emp.email+'?subject='+subject+'&body='+body;
  }

  // 레코드 필드 업데이트 (모든 필드 통합)
  function updateField(field, value){
    if(isPayrollLocked(props.selYM)){ showToast('🔒 잠긴 월은 수정 불가'); return; }
    var allRecs = dbGet('payroll_monthly', []);
    var existingRec = allRecs.find(function(r){return r.empSid===u.sid && r.ym===props.selYM;});
    var base = existingRec || rec;
    var oldVal = base[field];
    var patch = {}; patch[field] = value;
    var newRec = Object.assign({}, base, patch);
    if(existingRec){
      dbSet('payroll_monthly', allRecs.map(function(r){
        return (r.empSid===u.sid && r.ym===props.selYM) ? newRec : r;
      }));
    } else {
      dbSet('payroll_monthly', allRecs.concat([newRec]));
    }
    if(JSON.stringify(oldVal) !== JSON.stringify(value)){
      addPayrollAudit(u.sid, props.selYM, field,
        Array.isArray(oldVal)?(oldVal.length+'건'):oldVal,
        Array.isArray(value)?(value.length+'건'):value);
    }
    setRefresh(refresh+1);
  }
  function updateLegal(field, value){
    if(isPayrollLocked(props.selYM)){ showToast('🔒 잠긴 월은 수정 불가'); return; }
    var allRecs = dbGet('payroll_monthly', []);
    var existingRec = allRecs.find(function(r){return r.empSid===u.sid && r.ym===props.selYM;});
    var base = existingRec || rec;
    var la = Object.assign({}, base.legalAllowances||{});
    var oldVal = la[field];
    la[field] = value;
    var newRec = Object.assign({}, base, { legalAllowances: la });
    if(existingRec){
      dbSet('payroll_monthly', allRecs.map(function(r){
        return (r.empSid===u.sid && r.ym===props.selYM) ? newRec : r;
      }));
    } else {
      dbSet('payroll_monthly', allRecs.concat([newRec]));
    }
    if(oldVal !== value){
      addPayrollAudit(u.sid, props.selYM, 'legal.'+field, oldVal, value);
    }
    setRefresh(refresh+1);
  }

  var _mob = window.innerWidth <= 768;
  var inputStyle = {width:'100%', padding:_mob?'3px 4px':'4px 6px', border:'1px solid #fcd34d', borderRadius:'5px', fontSize:'12px', boxSizing:'border-box'};
  var labelStyle = {color:'#92400e', marginBottom:'1px', fontSize:_mob?'10px':'10.5px', fontWeight:600};

  return h('div', null,
    h('style', null, '@media print { .no-print{display:none!important;} body{background:#fff!important;} .pay-grid{display:block!important;} } .pay-grid > div { min-width: 0; }'),
    h('div', { className:'no-print', style:{marginBottom:'10px'}},
      // 줄1: 월 네비 + 직원선택
      h('div', {style:{display:'flex',gap:'6px',alignItems:'center',marginBottom:'6px'}},
        h('button', { onClick:function(){changeMonth(-1);}, style:{padding:'4px 8px',border:'1px solid #cbd5e1',borderRadius:'4px',background:'#fff',cursor:'pointer'} }, '◀'),
        h('span', { style:{fontWeight:700,fontSize:'14px',minWidth:'80px',textAlign:'center'}}, props.selYM),
        h('button', { onClick:function(){changeMonth(1);}, style:{padding:'4px 8px',border:'1px solid #cbd5e1',borderRadius:'4px',background:'#fff',cursor:'pointer'} }, '▶'),
        h('select', { value:sid, onChange:function(e){props.setSelSid(e.target.value);},
          style:{flex:1,padding:'7px 10px',border:'1px solid #cbd5e1',borderRadius:'4px',fontSize:'13px'}},
          users.map(function(x){return h('option',{key:x.sid,value:x.sid},x.name+' ('+x.title+')');}))
      ),
      // 줄2: 버튼들 (가로 스크롤)
      h('div', {style:{display:'flex',gap:'6px',overflowX:'auto',WebkitOverflowScrolling:'touch',paddingBottom:'2px'}},
        h('button', { onClick:function(){ emailSlip(sid); },
          title:'현재 직원의 등록된 이메일로 발송',
          style:{padding:'8px 12px',background:'#16a34a',color:'#fff',border:'none',borderRadius:'6px',cursor:'pointer',fontSize:'12px',fontWeight:700,flexShrink:0,whiteSpace:'nowrap'}}, '📧 메일 송부'),
        h('button', { onClick:function(){ setBulkEmail(true); },
          title:'전 직원 일괄 발송',
          style:{padding:'8px 12px',background:'#2563eb',color:'#fff',border:'none',borderRadius:'6px',cursor:'pointer',fontSize:'12px',fontWeight:700,flexShrink:0,whiteSpace:'nowrap'}}, '📨 일괄 이메일'),
        h('button', { onClick:printSlip,
          style:{padding:'8px 14px',background:'#1e40af',color:'#fff',border:'none',borderRadius:'6px',cursor:'pointer',fontSize:'12px',fontWeight:700,flexShrink:0,whiteSpace:'nowrap'}}, '🖨 인쇄')
      )
    ),
    // 최저임금 경고
    calc.minWageWarning && h('div', {className:'no-print', style:{background:'#fee2e2',border:'1px solid #fca5a5',borderRadius:'6px',padding:'8px 14px',marginBottom:'10px',maxWidth:'700px',margin:'0 auto 10px',fontSize:'11.5px',color:'#b91c1c',fontWeight:700}},
      '⚠️ 최저임금 위반 우려: 기본급 ' + (rec.baseSalary||0).toLocaleString() + '원이 2026 최저임금 월 ' + calc.minWageMonthly.toLocaleString() + '원(시급 10,320원 × 209h) 미달'
    ),
    // ── 좌우 분할: [좌: 입력 폼 + 잠금 + 추이 + 변경이력] / [우: 명세서 본문] ──
    h('div', { className:'pay-grid', style:{display:'grid', gridTemplateColumns: window.innerWidth<=768?'1fr':'minmax(0,1fr) minmax(0,1fr)', gap: window.innerWidth<=768?'10px':'14px', alignItems:'flex-start'} },
      // ── 좌측 컬럼 시작
      h('div', {style:{order: window.innerWidth<=768?1:2}},
    // ── 입력 영역 (인쇄 시 숨김) ──
    h('div', {className:'no-print', style:{background:'#fef3c7',border:'1px solid #fde68a',borderRadius:'6px',padding:_mob?'10px 10px':'12px 14px',marginBottom:'8px'}},
      // ① 기본 입력 (부양가족 / 일할계산)
      h('div', {style:{fontSize:_mob?'10.5px':'11.5px',fontWeight:700,color:'#854d0e',marginBottom:_mob?'4px':'6px'}},
        '⚙️ 급여 입력항목 · 통상시급 ' + calc.legal.ordinaryWage.toLocaleString() + '원/h (기본급÷209h)'),
      h('div', {style:{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:_mob?'5px':'8px', marginBottom:_mob?'5px':'8px'}}),
        h('label', null,
          h('div',{style:labelStyle},'부양가족 수'),
          h('input',{type:'number',min:1,max:10,value:rec.dependents||1,
            onChange:function(e){updateField('dependents', parseInt(e.target.value)||1);},
            style:inputStyle}),
          _mob ? null : h('div',{style:{fontSize:'10.5px',color:'#854d0e',marginTop:'1px'}},'본인 포함')),
        h('label', null,
          h('div',{style:labelStyle},'근무일수 (일할계산)'),
          h('input',{type:'number',min:0,max:31,value:rec.workDays||'',placeholder:'30 (전월)',
            onChange:function(e){updateField('workDays', parseInt(e.target.value)||0);},
            style:inputStyle}),
          _mob ? null : (calc.prorated ? h('div',{style:{fontSize:'10.5px',color:'#dc2626',marginTop:'1px',fontWeight:700}},
            '일할 적용 ' + Math.round(calc.prorate*100) + '%') : null),
        h('label', null,
          h('div',{style:labelStyle},'기본급 (직원관리 자동)'),
          h('input',{type:'text',value:(rec.baseSalary||0).toLocaleString(),
            onChange:function(e){updateField('baseSalary', parseInt(e.target.value.replace(/[^0-9]/g,''))||0);},
            style:Object.assign({},inputStyle,{textAlign:'right',fontFamily:'monospace'})}),
          _mob ? null : (calc.prorated ? h('div',{style:{fontSize:'10.5px',color:'#854d0e',marginTop:'1px',fontFamily:'monospace'}},
            '일할 ' + calc.baseSalaryProrated.toLocaleString() + '원') : null)
      ),
      // ② 비과세 항목
      h('div', {style:{fontSize:_mob?'10px':'11px',fontWeight:700,color:'#854d0e',marginTop:_mob?'5px':'8px',marginBottom:_mob?'2px':'4px'}},
        '🟢 비과세 항목 (4대보험·소득세 산정 시 제외, 한도 월 20만원)'),
      h('div', {style:{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:_mob?'5px':'8px', marginBottom:_mob?'5px':'8px'}}),
        h('label', null,
          h('div',{style:labelStyle},'식대 (≤20만)'),
          h('input',{type:'text',value:(rec.nonTaxableMeal||0).toLocaleString(),
            onChange:function(e){updateField('nonTaxableMeal', parseInt(e.target.value.replace(/[^0-9]/g,''))||0);},
            style:Object.assign({},inputStyle,{textAlign:'right',fontFamily:'monospace'})})),
        h('label', null,
          h('div',{style:labelStyle},'자가운전 (≤20만)'),
          h('input',{type:'text',value:(rec.nonTaxableCar||0).toLocaleString(),
            onChange:function(e){updateField('nonTaxableCar', parseInt(e.target.value.replace(/[^0-9]/g,''))||0);},
            style:Object.assign({},inputStyle,{textAlign:'right',fontFamily:'monospace'})})),
        h('label', null,
          h('div',{style:labelStyle},'보육수당 (≤20만)'),
          h('input',{type:'text',value:(rec.nonTaxableChildcare||0).toLocaleString(),
            onChange:function(e){updateField('nonTaxableChildcare', parseInt(e.target.value.replace(/[^0-9]/g,''))||0);},
            style:Object.assign({},inputStyle,{textAlign:'right',fontFamily:'monospace'})}))
      ),
      // ③ 법정수당 시간
      h('div', {style:{fontSize:_mob?'10px':'11px',fontWeight:700,color:'#854d0e',marginTop:_mob?'5px':'8px',marginBottom:_mob?'2px':'4px'}},
        '⏱ 법정수당 시간 (근로기준법 56조)'),
      h('div', {style:{display:'grid',gridTemplateColumns:_mob?'1fr 1fr':'1fr 1fr 1fr 1fr',gap:_mob?'5px':'8px',fontSize:'11px'}},
        h('label', null,
          h('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginBottom:'2px'}},
            h('span',{style:labelStyle},'연장 ×1.5'),
            h('span',{style:{fontSize:'10.5px',color:'#854d0e',fontFamily:'monospace'}},calc.legal.overtime.toLocaleString())),
          h('input',{type:'number',min:0,step:'0.5',value:calc.legal.overtimeHours||'',placeholder:'0',
            onChange:function(e){updateLegal('overtimeHours', parseFloat(e.target.value)||0);},
            style:inputStyle})),
        h('label', null,
          h('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginBottom:'2px'}},
            h('span',{style:labelStyle},'야간 ×0.5'),
            h('span',{style:{fontSize:'10.5px',color:'#854d0e',fontFamily:'monospace'}},calc.legal.night.toLocaleString())),
          h('input',{type:'number',min:0,step:'0.5',value:calc.legal.nightHours||'',placeholder:'0',
            onChange:function(e){updateLegal('nightHours', parseFloat(e.target.value)||0);},
            style:inputStyle})),
        h('label', null,
          h('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginBottom:'2px'}},
            h('span',{style:labelStyle},'휴일 ×1.5'),
            h('span',{style:{fontSize:'10.5px',color:'#854d0e',fontFamily:'monospace'}},calc.legal.holiday.toLocaleString())),
          h('input',{type:'number',min:0,step:'0.5',value:calc.legal.holidayHours||'',placeholder:'0',
            onChange:function(e){updateLegal('holidayHours', parseFloat(e.target.value)||0);},
            style:inputStyle})),
        h('label', null,
          h('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'2px'}},
            h('span',{style:labelStyle},'주휴h'),
            h('label',{style:{display:'flex',alignItems:'center',gap:'4px',fontSize:'11px',color:'#854d0e',fontWeight:400}},
              h('input',{type:'checkbox',checked:!!calc.legal.autoWeeklyHoliday,
                onChange:function(e){updateLegal('autoWeeklyHoliday', e.target.checked);},style:{margin:0}}),
              '자동')),
          h('input',{type:'number',min:0,step:'0.5',value:calc.legal.weeklyHours||'',placeholder:'0',
            onChange:function(e){updateLegal('weeklyWorkHours', parseFloat(e.target.value)||0);},
            style:inputStyle}))
      ),
                  // ④ 실비변상 (비과세, 급여와 함께 입금)
      h('div', {style:{fontSize:'11px',fontWeight:700,color:'#854d0e',marginTop:_mob?'6px':'10px',marginBottom:_mob?'2px':'4px',display:'flex',alignItems:'center',justifyContent:'space-between'}},
        h('span',null,'💵 실비변상 (비과세, 급여와 함께 송금)'),
        h('button',{onClick:function(){
            var allRecs = dbGet('payroll_monthly', []);
            var existingRec = allRecs.find(function(r){return r.empSid===u.sid && r.ym===props.selYM;});
            var base = existingRec || rec;
            var list = (base.reimbursements||[]).concat([{
              date:props.selYM+'-'+('0'+(new Date().getDate())).slice(-2),
              category:'교통비', amount:0, note:''
            }]);
            updateField('reimbursements', list);
          },
          style:{padding:'2px 9px',background:'#854d0e',color:'#fff',border:'none',borderRadius:'5px',fontSize:'10.5px',fontWeight:700,cursor:'pointer'}},
          '+ 실비 추가')
      ),
      (rec.reimbursements||[]).length === 0
        ? h('div',{style:{fontSize:'10.5px',color:'#94a3b8',padding:'4px 0'}}, '등록된 실비가 없습니다')
        : h('div', {style:{display:'flex',flexDirection:'column',gap:'4px'}},
            (rec.reimbursements||[]).map(function(rb, i){
              return h('div', {key:i, style:{display:'grid',gridTemplateColumns:'90px 80px 100px 1fr 24px',gap:'4px',alignItems:'center'}},
                h(KoreanDatePicker, {value:rb.date||'',
                  onChange:function(e){
                    var list=(rec.reimbursements||[]).slice();
                    list[i] = Object.assign({},list[i],{date:e.target.value});
                    updateField('reimbursements', list);
                  },
                  style:{padding:'3px 5px',border:'1px solid #fcd34d',borderRadius:'5px',fontSize:'10.5px'}}),
                h('select',{value:rb.category||'교통비',
                  onChange:function(e){
                    var list=(rec.reimbursements||[]).slice();
                    list[i] = Object.assign({},list[i],{category:e.target.value});
                    updateField('reimbursements', list);
                  },
                  style:{padding:'3px 5px',border:'1px solid #fcd34d',borderRadius:'5px',fontSize:'10.5px'}},
                  ['교통비','식대','소모품','출장비','접대비','기타'].map(function(c){
                    return h('option',{key:c,value:c},c);
                  })),
                h('input',{type:'text',value:(rb.amount||0).toLocaleString(),
                  onChange:function(e){
                    var v = parseInt(e.target.value.replace(/[^0-9]/g,''))||0;
                    var list=(rec.reimbursements||[]).slice();
                    list[i] = Object.assign({},list[i],{amount:v});
                    updateField('reimbursements', list);
                  },
                  style:{padding:'3px 5px',border:'1px solid #fcd34d',borderRadius:'5px',fontSize:'10.5px',textAlign:'right',fontFamily:'monospace'}}),
                h('input',{type:'text',value:rb.note||'',placeholder:'메모 (출장지 등)',
                  onChange:function(e){
                    var list=(rec.reimbursements||[]).slice();
                    list[i] = Object.assign({},list[i],{note:e.target.value});
                    updateField('reimbursements', list);
                  },
                  style:{padding:'3px 5px',border:'1px solid #fcd34d',borderRadius:'5px',fontSize:'10.5px'}}),
                h('button',{onClick:function(){
                    var list=(rec.reimbursements||[]).filter(function(_,j){return j!==i;});
                    updateField('reimbursements', list);
                  },
                  style:{background:'#fee2e2',color:'#991b1b',border:'1px solid #fca5a5',borderRadius:'5px',fontSize:'10px',padding:'2px',cursor:'pointer'}},'✕')
              );
            })
          )
    ),
    // 잠금 상태 표시
    isPayrollLocked(props.selYM) && h('div',{className:'no-print',style:{maxWidth:'700px',margin:'0 auto 10px',background:'#fef2f2',border:'1px solid #fca5a5',borderRadius:'5px',padding:'7px 14px',fontSize:'11.5px',color:'#991b1b',fontWeight:700}},
      '🔒 ' + props.selYM + ' 잠김 (수정 불가, 권한자만 해제)'),
    // ── 12개월 급여 추이 ──
    (function(){
      var hist = getPayrollHistory(u.sid, props.selYM, 12);
      var maxNet = Math.max.apply(null, hist.map(function(x){return x.netPay;}).concat([1]));
      var prevRec = recs.find(function(r){
        var d=new Date(props.selYM+'-01'); d.setMonth(d.getMonth()-1);
        var prevYM=d.toISOString().slice(0,7);
        return r.empSid===u.sid && r.ym===prevYM;
      });
      var prevCalc = prevRec ? calcPayroll(prevRec) : null;
      var diff = prevCalc ? calc.netPay - prevCalc.netPay : 0;
      return h('div',{className:'no-print', style:{maxWidth:'700px',margin:'0 auto 10px',background:'#f8fafc',border:'1px solid #e2e8f0',borderRadius:'6px',padding:'10px 14px'}},
        h('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'8px'}},
          h('div',{style:{fontSize:'11.5px',fontWeight:700,color:'#475569'}}, '📊 ' + u.name + ' 최근 12개월 실지급액 추이'),
          prevCalc ? h('div',{style:{fontSize:'11px',color: diff>0?'#059669':diff<0?'#dc2626':'#64748b',fontWeight:600}},
            '전월 대비 '+(diff>0?'+':'')+diff.toLocaleString()+'원' + (Math.abs(diff)>500000?' ⚠️':'')) : null
        ),
        h('div',{style:{display:'flex',alignItems:'flex-end',gap:'4px',height:'60px'}},
          hist.map(function(b,i){
            var hpct = b.netPay/maxNet*100;
            var isCurrent = b.ym === props.selYM;
            return h('div',{key:i,
              title: b.ym + ' - 실지급 ' + b.netPay.toLocaleString() + '원',
              style:{flex:1,display:'flex',flexDirection:'column',alignItems:'center',gap:'4px'}},
              h('div',{style:{fontSize:'8.5px',color:'#94a3b8',fontFamily:'monospace'}}, b.netPay>0?(b.netPay/10000).toFixed(0)+'만':''),
              h('div',{style:{width:'100%',height:hpct+'%',minHeight:b.netPay>0?'2px':'0',
                background: isCurrent?'#2563eb':b.missing?'#e2e8f0':'#94a3b8',borderRadius:'2px 2px 0 0'}}),
              h('div',{style:{fontSize:'8.5px',color: isCurrent?'#2563eb':'#94a3b8',fontWeight:isCurrent?700:400}}, b.ym.slice(5))
            );
          })
        )
      );
    })(),
    // ── 변경이력 토글 ──
    h(PayslipAuditViewer, { empSid: u.sid, ym: props.selYM, refresh: refresh })
      ), // ── 좌측 컬럼 닫기
      // ── 우측 컬럼 시작 (명세서 본문)
      h('div', {style:{order: window.innerWidth<=768?2:1}},
    // 명세서 본문
    h('div', { style:{background:'#fff',border:'1px solid #cbd5e1',borderRadius:'8px',padding:'30px',maxWidth:'700px',margin:'0 auto'}},
      h('div', { style:{textAlign:'center',marginBottom:'24px',borderBottom:'2px solid #1e40af',paddingBottom:'12px'}},
        h('div', {style:{fontSize:'11px',color:'#64748b',marginBottom:'4px'}},'푸른노무법인'),
        h('div', {style:{fontSize:'22px',fontWeight:800,color:'#1e293b'}}, props.selYM+' 급여명세서')
      ),
      h('table', {style:{width:'100%',marginBottom:'18px',fontSize:'12.5px',borderCollapse:'collapse'}},
        h('tbody', null,
          h('tr', null,
            h('td', {style:{padding:'5px 8px',background:'#f8fafc',width:'90px',fontWeight:700}}, '성명'),
            h('td', {style:{padding:'5px 8px',borderRight:'1px solid #e5e7eb'}}, u.name),
            h('td', {style:{padding:'5px 8px',background:'#f8fafc',width:'90px',fontWeight:700}}, '사번'),
            h('td', {style:{padding:'5px 8px'}}, u.sid)),
          h('tr', null,
            h('td', {style:{padding:'5px 8px',background:'#f8fafc',fontWeight:700}}, '직책'),
            h('td', {style:{padding:'5px 8px',borderRight:'1px solid #e5e7eb'}}, u.title),
            h('td', {style:{padding:'5px 8px',background:'#f8fafc',fontWeight:700}}, '소속'),
            h('td', {style:{padding:'5px 8px'}}, u.branch||'천안본사')),
          h('tr', null,
            h('td', {style:{padding:'5px 8px',background:'#f8fafc',fontWeight:700}}, '입사일'),
            h('td', {style:{padding:'5px 8px',borderRight:'1px solid #e5e7eb'}}, u.hireDate||'-'),
            h('td', {style:{padding:'5px 8px',background:'#f8fafc',fontWeight:700}}, '지급일'),
            h('td', {style:{padding:'5px 8px'}}, rec.paidDate||(props.selYM+'-25')))
        )
      ),
      (function(){ var _pn=getLeavePromoNotice(u.name); return _pn ? h('div',{style:{margin:'0 0 16px',background:'#eff6ff',border:'1px solid #bfdbfe',borderRadius:'6px',padding:'10px 14px'}}, h('div',{style:{fontSize:'12px',fontWeight:700,color:'#1e40af',marginBottom:'4px'}},'📣 연차 사용촉진 안내'), h('div',{style:{fontSize:'11.5px',color:'#1e3a8a',lineHeight:1.6}}, '미사용 연차 '+_pn.remain+'일 · 사용기간 ~'+_pn.expiryStr+' 까지 · 사용시기를 지정해 주세요.')) : null; })(),
      // 지급/공제 2단
      h('div', {style:{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'14px',marginBottom:'16px'}},
        // 지급
        h('div', null,
          h('div', {style:{background:'#dcfce7',padding:'7px 10px',fontWeight:700,fontSize:'12.5px',color:'#166534',borderRadius:'4px 4px 0 0'}}, '지급'),
          h('table', {style:{width:'100%',fontSize:'12px',borderCollapse:'collapse',border:'1px solid #e5e7eb'}},
            h('tbody', null,
              h('tr', null, h('td',{style:{padding:'4px 8px'}},'기본급'), h('td',{style:{padding:'4px 8px',textAlign:'right',fontFamily:'monospace'}}, (rec.baseSalary||0).toLocaleString())),
              (rec.allowances||[]).map(function(a,i){
                return h('tr', {key:i}, h('td',{style:{padding:'4px 8px'}},a.name), h('td',{style:{padding:'4px 8px',textAlign:'right',fontFamily:'monospace'}}, (a.amount||0).toLocaleString()));
              }),
              // 법정수당 (값 있는 항목만)
              calc.legal.overtime>0 && h('tr', null,
                h('td',{style:{padding:'4px 8px',color:'#854d0e'}},'연장근로수당 ('+calc.legal.overtimeHours+'h)'),
                h('td',{style:{padding:'4px 8px',textAlign:'right',fontFamily:'monospace',color:'#854d0e'}}, calc.legal.overtime.toLocaleString())),
              calc.legal.night>0 && h('tr', null,
                h('td',{style:{padding:'4px 8px',color:'#854d0e'}},'야간근로수당 ('+calc.legal.nightHours+'h)'),
                h('td',{style:{padding:'4px 8px',textAlign:'right',fontFamily:'monospace',color:'#854d0e'}}, calc.legal.night.toLocaleString())),
              calc.legal.holiday>0 && h('tr', null,
                h('td',{style:{padding:'4px 8px',color:'#854d0e'}},'휴일근로수당 ('+calc.legal.holidayHours+'h)'),
                h('td',{style:{padding:'4px 8px',textAlign:'right',fontFamily:'monospace',color:'#854d0e'}}, calc.legal.holiday.toLocaleString())),
              // 성과금 (자동 합산)
              calc.perfBonus.total>0 && h('tr', null,
                h('td',{style:{padding:'4px 8px',color:'#2563eb'}},'성과금 ('+calc.perfBonus.details.length+'건)'),
                h('td',{style:{padding:'4px 8px',textAlign:'right',fontFamily:'monospace',color:'#2563eb',fontWeight:700}}, calc.perfBonus.total.toLocaleString())),
              (rec.bonus||0)>0 && h('tr', null, h('td',{style:{padding:'4px 8px'}},'기타상여'), h('td',{style:{padding:'4px 8px',textAlign:'right',fontFamily:'monospace'}}, (rec.bonus||0).toLocaleString())),
              h('tr', {style:{background:'#f0fdf4',fontWeight:700}}, h('td',{style:{padding:'5px 8px'}},'지급액 합계'), h('td',{style:{padding:'5px 8px',textAlign:'right',fontFamily:'monospace',color:'#166534'}}, calc.grossPay.toLocaleString()))
            )
          )
        ),
        // 공제
        h('div', null,
          h('div', {style:{background:'#fef3c7',padding:'7px 10px',fontWeight:700,fontSize:'12.5px',color:'#854d0e',borderRadius:'4px 4px 0 0'}}, '공제'),
          h('table', {style:{width:'100%',fontSize:'12px',borderCollapse:'collapse',border:'1px solid #e5e7eb'}},
            h('tbody', null,
              h('tr', null, h('td',{style:{padding:'4px 8px'}},'국민연금'), h('td',{style:{padding:'4px 8px',textAlign:'right',fontFamily:'monospace'}}, calc.pension.toLocaleString())),
              h('tr', null, h('td',{style:{padding:'4px 8px'}},'건강보험'), h('td',{style:{padding:'4px 8px',textAlign:'right',fontFamily:'monospace'}}, calc.healthIns.toLocaleString())),
              h('tr', null, h('td',{style:{padding:'4px 8px'}},'장기요양'), h('td',{style:{padding:'4px 8px',textAlign:'right',fontFamily:'monospace'}}, calc.longCare.toLocaleString())),
              h('tr', null, h('td',{style:{padding:'4px 8px'}},'고용보험'), h('td',{style:{padding:'4px 8px',textAlign:'right',fontFamily:'monospace'}}, calc.empIns.toLocaleString())),
              h('tr', null, h('td',{style:{padding:'4px 8px'}},'소득세'), h('td',{style:{padding:'4px 8px',textAlign:'right',fontFamily:'monospace'}}, calc.incomeTax.toLocaleString())),
              h('tr', null, h('td',{style:{padding:'4px 8px'}},'지방세'), h('td',{style:{padding:'4px 8px',textAlign:'right',fontFamily:'monospace'}}, calc.localTax.toLocaleString())),
              h('tr', {style:{background:'#fef3c7',fontWeight:700}}, h('td',{style:{padding:'5px 8px'}},'공제 합계'), h('td',{style:{padding:'5px 8px',textAlign:'right',fontFamily:'monospace',color:'#854d0e'}}, calc.totalDeduct.toLocaleString()))
            )
          )
        )
      ),
      // 성과금 발생내역 (있을 때만)
      calc.perfBonus.total>0 && h('div', {style:{marginBottom:'16px'}},
        h('div', {style:{background:'#ede9fe',padding:'7px 10px',fontWeight:700,fontSize:'12px',color:'#1e40af',borderRadius:'4px 4px 0 0'}},
          '🌟 성과금 발생내역 ('+calc.perfBonus.details.length+'건 / 합계 '+calc.perfBonus.total.toLocaleString()+'원)'),
        h('table', {style:{width:'100%',fontSize:'11px',borderCollapse:'collapse',border:'1px solid #e5e7eb'}},
          h('thead', null, h('tr', {style:{background:'#faf5ff'}},
            h('th',{style:{padding:'4px 6px',textAlign:'left',fontWeight:700,color:'#1e40af'}},'발생일'),
            h('th',{style:{padding:'4px 6px',textAlign:'left',fontWeight:700,color:'#1e40af'}},'발생원'),
            h('th',{style:{padding:'4px 6px',textAlign:'right',fontWeight:700,color:'#1e40af'}},'입금금액'),
            h('th',{style:{padding:'4px 6px',textAlign:'right',fontWeight:700,color:'#1e40af'}},'세금공제'),
            h('th',{style:{padding:'4px 6px',textAlign:'right',fontWeight:700,color:'#1e40af'}},'산정기준'),
            h('th',{style:{padding:'4px 6px',textAlign:'center',fontWeight:700,color:'#1e40af'}},'역할'),
            h('th',{style:{padding:'4px 6px',textAlign:'right',fontWeight:700,color:'#1e40af'}},'요율'),
            h('th',{style:{padding:'4px 6px',textAlign:'right',fontWeight:700,color:'#1e40af'}},'성과금')
          )),
          h('tbody', null,
            calc.perfBonus.details.map(function(d, i){
              return h('tr', {key:i, style:{borderTop:'1px solid #ede9fe'}},
                h('td',{style:{padding:'4px 6px',fontFamily:'monospace',fontSize:'10.5px'}}, d.date),
                h('td',{style:{padding:'4px 6px'}}, d.source),
                h('td',{style:{padding:'4px 6px',textAlign:'right',fontFamily:'monospace',color:'#475569'}}, (d.incomeAmount||0).toLocaleString()),
                h('td',{style:{padding:'4px 6px',textAlign:'right',fontFamily:'monospace',color: (d.taxDeduction||0)>0 ? '#dc2626' : '#cbd5e1'}}, (d.taxDeduction||0)>0 ? ('-'+d.taxDeduction.toLocaleString()) : '-'),
                h('td',{style:{padding:'4px 6px',textAlign:'right',fontFamily:'monospace',color:'#1e293b',fontWeight:600}}, (d.baseAmount||0).toLocaleString()),
                h('td',{style:{padding:'4px 6px',textAlign:'center'}},
                  h('span',{style:{background:d.role==='주담당'?'#ede9fe':'#dbeafe',color:d.role==='주담당'?'#1e40af':'#1e40af',fontSize:'10.5px',padding:'1px 6px',borderRadius:'8px',fontWeight:600}}, d.role)),
                h('td',{style:{padding:'4px 6px',textAlign:'right',fontFamily:'monospace',color:'#64748b'}}, d.pct+'%'),
                h('td',{style:{padding:'4px 6px',textAlign:'right',fontFamily:'monospace',fontWeight:700,color:'#2563eb'}}, d.amount.toLocaleString())
              );
            })
          )
        )
      ),
      // 비과세 항목 (있을 때만)
      calc.nonTaxable.total>0 && h('div', {style:{marginBottom:'12px',background:'#f0fdf4',border:'1px solid #bbf7d0',borderRadius:'5px',padding:'8px 12px',fontSize:'11px'}},
        h('div',{style:{fontWeight:700,color:'#065f46',marginBottom:'4px'}},'🟢 비과세 항목 (4대보험·소득세 산정 시 제외)'),
        h('div',{style:{display:'flex',gap:'14px',color:'#0f766e',fontFamily:'monospace'}},
          calc.nonTaxable.meal>0 && h('span',null,'식대 '+calc.nonTaxable.meal.toLocaleString()),
          calc.nonTaxable.car>0 && h('span',null,'자가운전 '+calc.nonTaxable.car.toLocaleString()),
          calc.nonTaxable.childcare>0 && h('span',null,'보육 '+calc.nonTaxable.childcare.toLocaleString()),
          h('span',{style:{marginLeft:'auto',fontWeight:700}},'비과세계 '+calc.nonTaxable.total.toLocaleString()+'원')
        ),
        h('div',{style:{fontSize:'10.5px',color:'#065f46',marginTop:'2px'}},
          '과세표준 = 지급액 ' + calc.grossPay.toLocaleString() + ' − 비과세 ' + calc.nonTaxable.total.toLocaleString() + ' = ' + calc.insurableBase.toLocaleString() + '원')
      ),
      // 실지급액 (급여)
      h('div', {style:{background:'#2563eb',color:'#fff',padding:'14px 20px',borderRadius:'6px',display:'flex',justifyContent:'space-between',alignItems:'center'}},
        h('div', {style:{fontSize:'14px',fontWeight:700}}, '실지급액 (급여)'),
        h('div', {style:{fontSize:'22px',fontWeight:800,fontFamily:'monospace'}}, calc.netPay.toLocaleString()+' 원')
      ),
      // 실비변상 (있을 때만 표시)
      (function(){
        var reimbList = rec.reimbursements||[];
        var reimbTotal = reimbList.reduce(function(s,r){return s+(parseInt(r.amount)||0);},0);
        if(reimbTotal <= 0) return null;
        return h('div', null,
          h('div', {style:{marginTop:'12px'}},
            h('div', {style:{background:'#fef3c7',padding:'7px 10px',fontWeight:700,fontSize:'12px',color:'#854d0e',borderRadius:'4px 4px 0 0'}},
              '💵 실비변상 (비과세 — 4대보험·소득세 산정 제외)'),
            h('table', {style:{width:'100%',fontSize:'11px',borderCollapse:'collapse',border:'1px solid #fde68a'}},
              h('thead', null, h('tr', {style:{background:'#fef3c7'}},
                h('th',{style:{padding:'4px 6px',textAlign:'left',fontWeight:700,color:'#854d0e'}},'발생일'),
                h('th',{style:{padding:'4px 6px',textAlign:'left',fontWeight:700,color:'#854d0e'}},'구분'),
                h('th',{style:{padding:'4px 6px',textAlign:'left',fontWeight:700,color:'#854d0e'}},'내용'),
                h('th',{style:{padding:'4px 6px',textAlign:'right',fontWeight:700,color:'#854d0e'}},'금액')
              )),
              h('tbody', null,
                reimbList.map(function(rb, i){
                  return h('tr', {key:i, style:{borderTop:'1px solid #fef3c7'}},
                    h('td',{style:{padding:'3px 6px',fontFamily:'monospace',fontSize:'10.5px'}}, rb.date||'-'),
                    h('td',{style:{padding:'3px 6px'}}, rb.category||'-'),
                    h('td',{style:{padding:'3px 6px',color:'#64748b'}}, rb.note||'-'),
                    h('td',{style:{padding:'3px 6px',textAlign:'right',fontFamily:'monospace'}}, (rb.amount||0).toLocaleString())
                  );
                }),
                h('tr',{style:{background:'#fef3c7',fontWeight:700}},
                  h('td',{colSpan:3,style:{padding:'5px 6px'}},'실비 합계'),
                  h('td',{style:{padding:'5px 6px',textAlign:'right',fontFamily:'monospace',color:'#854d0e'}}, reimbTotal.toLocaleString())
                )
              )
            )
          ),
          // 실비 입금 박스 (별도 송금 표시)
          h('div', {style:{marginTop:'10px',background:'#854d0e',color:'#fff',padding:'12px 20px',borderRadius:'6px',display:'flex',justifyContent:'space-between',alignItems:'center'}},
            h('div', {style:{fontSize:'14px',fontWeight:700}}, '💵 실비 입금 (비과세)'),
            h('div', {style:{fontSize:'22px',fontWeight:800,fontFamily:'monospace'}}, reimbTotal.toLocaleString()+' 원')
          )
        );
      })(),
      // 산출근거 (근로기준법 48조) — 지급 근거(좌) · 공제 근거(우), 위 지급/공제 항목 순서대로
      h('div', {style:{marginTop:'12px',display:'grid',gridTemplateColumns:'1fr 1fr',gap:'14px'}},
        h('div', {style:{background:'#f0fdf4',border:'1px solid #bbf7d0',borderRadius:'5px',padding:'8px 12px',fontSize:'10px',color:'#166534',lineHeight:'1.7'}},
          h('div',{style:{fontWeight:700,color:'#065f46',marginBottom:'3px'}},'📋 지급 근거'),
          calc.prorated
            ? h('span',null,'· 기본급(일할): 기본급 × ' + calc.workDays + '/30일 = ' + calc.baseSalaryProrated.toLocaleString() + '원', h('br'))
            : h('span',null,'· 기본급: ' + (rec.baseSalary||0).toLocaleString() + '원', h('br')),
          (rec.allowances||[]).length>0 ? h('span',null,'· 수당(고정): ' + (rec.allowances||[]).map(function(a){return a.name+' '+(a.amount||0).toLocaleString();}).join(', ') + '원', h('br')) : null,
          calc.legal.total>0 ? h('span',null,
            '· 통상시급: (기본급 + 고정수당) ÷ 209h = ' + calc.legal.ordinaryWage.toLocaleString() + '원', h('br'),
            '· 법정수당: 연장 ×1.5 / 야간 추가 ×0.5 / 휴일 8h이내 ×1.5, 초과 ×2.0 / 주휴(주 15h↑)', h('br')) : null,
          calc.perfBonus.total>0 ? h('span',null,
            '· 성과금(성과관리): 발생 입금액 × 담당요율', h('br'),
            calc.perfBonus.details.map(function(d,i){ return h('span',{key:i},'- ' + d.source + ': ' + (d.baseAmount||0).toLocaleString() + ' × ' + d.pct + '% = ' + (d.amount||0).toLocaleString() + '원 (' + d.role + ')', h('br')); })) : null,
          (rec.bonus||0)>0 ? h('span',null,'· 기타상여: ' + (rec.bonus||0).toLocaleString() + '원', h('br')) : null
        ),
        h('div', {style:{background:'#fef3c7',border:'1px solid #fde68a',borderRadius:'5px',padding:'8px 12px',fontSize:'10px',color:'#854d0e',lineHeight:'1.7'}},
          h('div',{style:{fontWeight:700,color:'#854d0e',marginBottom:'3px'}},'📋 공제 근거'),
          '· 과세표준: ' + calc.insurableBase.toLocaleString() + '원', h('br'),
          '· 국민연금: 과세표준 × 4.5% (상한월 6,170,000원)', h('br'),
          '· 건강보험: 과세표준 × 3.545%', h('br'),
          '· 장기요양: 건강보험 × 12.95%', h('br'),
          '· 고용보험: 과세표준 × 0.9%', h('br'),
          '· 소득세: 근로소득 간이세액표 (부양가족 ' + (rec.dependents||1) + '명)', h('br'),
          '· 지방세: 소득세 × 10%'
        )
      ),
      calc.minWageWarning ? h('div',{style:{marginTop:'8px',background:'#fef2f2',border:'1px solid #fecaca',borderRadius:'5px',padding:'6px 12px',fontSize:'10px',color:'#dc2626',fontWeight:700}},'⚠️ 최저임금 위반: 2026년 시급 10,320원 / 월 209h ' + calc.minWageMonthly.toLocaleString() + '원 미달') : null,
      // 연차 현황 (연도별, 연차대장 기준)
      (function(){
        var _ly = (props.selYM||'').slice(0,4);
        var _rows = (dbGet('leave_ledger',[])||[]).filter(function(x){ return x.name===u.name && Number(x.year)<=Number(_ly); }).sort(function(a,b){ return a.year-b.year; }).slice(-3);
        if(!_rows.length) return null;
        var _lf = function(v){ return (v==null||v==='')?'-':v; };
        var _thx = {padding:'4px 6px',color:'#0e7490',fontWeight:700,fontSize:'11px'};
        var _tdx = {padding:'3px 6px',fontFamily:'monospace',fontSize:'11px'};
        return h('div',{style:{marginTop:'12px',background:'#ecfeff',border:'1px solid #a5f3fc',borderRadius:'6px',padding:'10px 14px'}},
          h('div',{style:{fontSize:'12px',fontWeight:700,color:'#0e7490',marginBottom:'6px'}},'🏖️ 연차 현황 (연도별)'),
          h('table',{style:{width:'100%',borderCollapse:'collapse',border:'1px solid #a5f3fc'}},
            h('thead',null,h('tr',{style:{background:'#cffafe'}},
              h('th',{style:Object.assign({},_thx,{textAlign:'center'})},'연도'),
              h('th',{style:Object.assign({},_thx,{textAlign:'right'})},'발생'),
              h('th',{style:Object.assign({},_thx,{textAlign:'right'})},'사용'),
              h('th',{style:Object.assign({},_thx,{textAlign:'right'})},'잔여'),
              h('th',{style:Object.assign({},_thx,{textAlign:'left'})},'월별 사용내역')
            )),
            h('tbody',null, _rows.map(function(x,i){
              var _hi = String(x.year)===_ly;
              return h('tr',{key:i, style:_hi?{background:'#f0fdfa',fontWeight:700}:{}},
                h('td',{style:Object.assign({},_tdx,{textAlign:'center'})}, x.year+'년'),
                h('td',{style:Object.assign({},_tdx,{textAlign:'right'})}, _lf(x.granted)),
                h('td',{style:Object.assign({},_tdx,{textAlign:'right'})}, _lf(x.used)),
                h('td',{style:Object.assign({},_tdx,{textAlign:'right'})}, _lf(x.remain)),
                h('td',{style:{padding:'3px 6px',fontSize:'10px',color:'#475569'}}, (x.monthly||'-') + (x.note?(' ('+x.note+')'):''))
              );
            }))
          )
        );
      })(),
      h('div', {style:{textAlign:'center',marginTop:'12px',fontSize:'10.5px',color:'#94a3b8',borderTop:'1px solid #e5e7eb',paddingTop:'8px'}},
        '본 명세서는 ' + todayYMD() + ' 발행되었습니다.'
      )
    ),
      ) // ── 우측 컬럼 닫기
    ), // ── 좌우 그리드 닫기
    // 일괄 이메일 모달
    bulkEmail && h('div', { className:'no-print', style:{position:'fixed',top:0,left:0,right:0,bottom:0,background:'rgba(0,0,0,0.5)',zIndex:9999,display:'flex',alignItems:'center',justifyContent:'center'}, onClick:function(){setBulkEmail(false);} },
      h('div', { onClick:function(e){e.stopPropagation();}, style:{background:'#fff',borderRadius:'8px',padding:'20px',maxWidth:'780px',width:'90%',maxHeight:'85vh',overflowY:'auto'}},
        h('div', { style:{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'14px',gap:'8px'}},
          h('div', { style:{fontSize:'15px',fontWeight:800}}, '📨 ' + props.selYM + ' 급여명세서 일괄 이메일'),
          h('div', { style:{display:'flex',gap:'6px',alignItems:'center'}},
            h('button', { onClick:async function(){
                var registered = users.filter(function(x){ return !!x.email; });
                if(!registered.length){ showToast('등록된 이메일이 없습니다'); return; }
                if(!(await popConfirm('이메일 등록 직원 '+registered.length+'명에게 메일 클라이언트를 순차적으로 엽니다.\n진행할까요?'))) return;
                registered.forEach(function(emp, idx){
                  setTimeout(function(){ emailSlip(emp.sid); }, idx * 900);
                });
                showToast('📨 '+registered.length+'명 발송 시작 (약 0.9초 간격)');
              },
              title:'이메일 등록된 전 직원에게 0.9초 간격으로 순차 발송',
              style:{padding:'6px 14px',background:'#2563eb',color:'#fff',border:'none',borderRadius:'4px',cursor:'pointer',fontSize:'12px',fontWeight:700}}, '📨 전체 일괄 발송'),
            h('button', { onClick:function(){setBulkEmail(false);}, style:{padding:'4px 10px',background:'#f1f5f9',border:'1px solid #cbd5e1',borderRadius:'4px',cursor:'pointer'}}, '✕')
          )
        ),
        h('div', { style:{padding:'8px 12px',background:'#fef3c7',border:'1px solid #fde68a',borderRadius:'4px',fontSize:'11px',color:'#854d0e',marginBottom:'12px'}},
          '※ "📧 발송" 버튼 클릭 시 메일 클라이언트(Outlook/Daum/Gmail 등)가 열립니다. 본문에 명세서 내용이 자동 입력되며, 클라이언트에서 발송 버튼을 누르세요.'
        ),
        h('table', { style:{width:'100%',fontSize:'12px',borderCollapse:'collapse'}},
          h('thead', null,
            h('tr', { style:{background:'#f8fafc',borderBottom:'2px solid #e2e8f0'}},
              h('th', { style:{padding:'8px',textAlign:'left',fontWeight:700}}, '직원'),
              h('th', { style:{padding:'8px',textAlign:'left',fontWeight:700}}, '이메일'),
              h('th', { style:{padding:'8px',textAlign:'right',fontWeight:700}}, '실지급'),
              h('th', { style:{padding:'8px',textAlign:'center',fontWeight:700,width:'90px'}}, '발송')
            )
          ),
          h('tbody', null,
            users.map(function(u2){
              var allRecs = dbGet('payroll_monthly', []);
              var r2 = allRecs.find(function(x){return x.empSid===u2.sid && x.ym===props.selYM;}) || {};
              var gross2 = (+r2.baseSalary||0)+(+r2.allowFood||0)+(+r2.allowCar||0)+(+r2.allowChild||0)+(+r2.allowEtc||0)+(+r2.bonus||0);
              var ded2 = (+r2.dedPension||0)+(+r2.dedHealth||0)+(+r2.dedLtc||0)+(+r2.dedEmp||0)+(+r2.dedIncome||0)+(+r2.dedLocal||0)+(+r2.dedEtc||0);
              var net2 = gross2 - ded2;
              var hasEmail = !!u2.email;
              return h('tr', { key:u2.sid, style:{borderBottom:'1px solid #f1f5f9'}},
                h('td', { style:{padding:'8px'}}, u2.name + ' ('+(u2.title||'')+')'),
                h('td', { style:{padding:'8px',color:hasEmail?'#1e40af':'#dc2626',fontFamily:'monospace',fontSize:'11px'}}, hasEmail ? u2.email : '미등록'),
                h('td', { style:{padding:'8px',textAlign:'right',fontFamily:'monospace',fontWeight:700}}, net2.toLocaleString()+'원'),
                h('td', { style:{padding:'8px',textAlign:'center'}},
                  hasEmail
                    ? h('button', { onClick:function(){ emailSlip(u2.sid); },
                        style:{padding:'4px 10px',background:'#16a34a',color:'#fff',border:'none',borderRadius:'4px',cursor:'pointer',fontSize:'11px',fontWeight:700}}, '📧 발송')
                    : h('span', {style:{color:'#cbd5e1',fontSize:'11px'}}, '-')
                )
              );
            })
          )
        ),
        h('div', { style:{marginTop:'12px',padding:'10px',background:'#eff6ff',border:'1px solid #bfdbfe',borderRadius:'4px',fontSize:'11px',color:'#1e40af'}},
          '💡 이메일 미등록 직원은 근로자명부 > 기본정보에서 이메일을 등록하세요.'
        )
      )
    )
  );
}

// ============================================================
// 비정규직(일용직/기타소득/사업소득) 급여 관리
// ============================================================
function calcIrregularTax(type, amount){
  amount = parseInt(amount) || 0;
  if(amount <= 0) return { incomeTax:0, localTax:0, netPay:0 };
  if(type === 'daily'){
    // 일용직: 일 15만원 미만 면세, 초과분은 6.6% (감면 후 실효 약 2.7%)
    // 사용자가 일별 입력 시 자동계산 - 단순화: 0원 (수동 입력)
    return { incomeTax:0, localTax:0, netPay:amount };
  }
  if(type === 'misc'){
    // 기타소득: 필요경비 60%, 잔액 22% (실효 8.8%)
    var taxable = amount * 0.4;
    var income = Math.floor(taxable * 0.20 / 10) * 10;
    var local  = Math.floor(income * 0.10 / 10) * 10;
    return { incomeTax:income, localTax:local, netPay:amount-income-local };
  }
  if(type === 'biz'){
    // 사업소득: 3.3%
    var income = Math.floor(amount * 0.03 / 10) * 10;
    var local  = Math.floor(income * 0.10 / 10) * 10;
    return { incomeTax:income, localTax:local, netPay:amount-income-local };
  }
  return { incomeTax:0, localTax:0, netPay:amount };
}

var IRREGULAR_TYPES = [
  { v:'daily', label:'일용직',     color:'#f59e0b', desc:'일용근로소득',  catCode:'exp-irregular-daily' },
  { v:'misc',  label:'기타소득',   color:'#ec4899', desc:'필요경비 60% · 22%', catCode:'exp-irregular-misc' },
  { v:'biz',   label:'사업소득',   color:'#3b82f6', desc:'3.3% 원천징수',  catCode:'exp-irregular-biz' }
];

function PayrollIrregular(props){
  var rs = useState(dbGet('payroll_irregular', [])); var recs = rs[0]; var setRecs = rs[1];
  var fs = useState('all'); var typeFilter = fs[0]; var setTypeFilter = fs[1];
  var ms = useState(null); var modal = ms[0]; var setModal = ms[1];
  // 명세서 모달
  var sm = useState(null); var slipModal = sm[0]; var setSlipModal = sm[1];

  function persist(arr){
    if(isIrregularLocked(props.selYM)){
      showToast('🔒 ' + props.selYM + ' 잠겨있어 수정 불가');
      return;
    }
    var snap = dbGet('payroll_irregular', []);
    try {
      setRecs(arr);
      dbSet('payroll_irregular', arr);
    } catch(e){
      try { dbSet('payroll_irregular', snap); setRecs(snap); } catch(_){}
      showToast('❌ 비정규직 저장 실패 — 변경 사항이 복원되었습니다');
      console.error('[Transaction:irregular.persist]', e && e.message);
    }
  }

  // 현재 월 + 필터된 레코드
  var monthRecs = recs.filter(function(r){ return r.ym === props.selYM; });
  var viewRecs = typeFilter === 'all' ? monthRecs : monthRecs.filter(function(r){ return r.type === typeFilter; });

  function openAdd(t){
    if(isIrregularLocked(props.selYM)){
      showToast('🔒 ' + props.selYM + ' 잠겨있어 추가 불가');
      return;
    }
    setModal({
      id:null, ym:props.selYM, type:t||'daily',
      name:'', rrn:'', amount:0, workDays:0, dailyWage:0,
      incomeTax:0, localTax:0, netPay:0,
      bank:'', account:'', note:'', paid:false, paidDate:''
    });
  }

  // ── 일용노무비대장 / 기타소득지급대장 엑셀 가져오기 (한 파일씩, 파일명에서 월 인식) ──
  // 파일 1개를 읽어 레코드 배열에 누적 (arr/have는 누적 상태, cb(addedN, skippedN, label, ym))
  function _processIrregularFile(file, arr, have, cb){
    function num(v){ if(v===null||v===undefined||v==='') return 0; var n=parseFloat(String(v).replace(/[^0-9.\-]/g,'')); return isNaN(n)?0:Math.round(n); }
    var fname = file.name || '';
    var mm = fname.match(/(\d{4})년?[_\s]*(\d{1,2})월/);
    var ym = mm ? (mm[1]+'-'+('0'+mm[2]).slice(-2)) : props.selYM;
    var reader = new FileReader();
    reader.onload = function(ev){
      var added=0, skipped=0, isMisc=false;
      try {
        var wb = XLSX.read(ev.target.result, { type:'array' });
        isMisc = wb.SheetNames.indexOf('지급대장') >= 0;
        var sn = isMisc ? '지급대장' : wb.SheetNames[0];
        var data = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header:1, defval:'' });
        var type = isMisc ? 'misc' : 'daily';
        var hi = data.findIndex(function(row){ return row.some(function(x){ return /이름|성명/.test(String(x)); }) && row.some(function(x){ return String(x).indexOf('주민')>=0; }); });
        if(hi<0){ cb(0,0,'⚠️ '+fname+': 헤더 없음',ym); return; }
        for(var r=hi+1;r<data.length;r++){
          var row=data[r]; if(!row) continue;
          var nm, rrn, amount, itax, ltax, net, wdays;
          if(isMisc){
            nm=String(row[1]||'').trim(); rrn=String(row[2]||'').trim();
            amount=num(row[7]); itax=num(row[8]); ltax=num(row[9]); net=num(row[12]); wdays=0;
          } else {
            nm=String(row[1]||'').trim(); rrn=String(row[2]||'').trim();
            wdays=num(row[37]); amount=num(row[39]); itax=num(row[40]); ltax=num(row[41]); net=num(row[47]);
          }
          if(!/^[가-힣]{2,5}$/.test(nm)) continue;
          if(amount<=0) continue;
          var key = ym+'|'+type+'|'+nm+'|'+String(rrn).replace(/[^0-9]/g,'');
          if(have[key]){ skipped++; continue; }
          arr.push({
            id:'irr-'+Date.now().toString(36)+Math.random().toString(36).slice(2,6)+'-'+arr.length,
            ym:ym, type:type, name:nm, rrn:rrn, amount:amount,
            workDays:wdays, dailyWage:(wdays>0?Math.round(amount/wdays):0),
            incomeTax:itax, localTax:ltax, netPay:(net>0?net:amount-itax-ltax),
            bank:'', account:'', note:'급여대장 가져오기', paid:true, paidDate:''
          });
          have[key]=true; added++;
        }
        cb(added, skipped, (isMisc?'기타소득':'일용노무비')+' '+ym, ym);
      } catch(err){ cb(0,0,'⚠️ '+fname+': '+(err&&err.message),ym); }
    };
    reader.readAsArrayBuffer(file);
  }

  // 여러 파일 순차 처리 (단일/일괄 공용)
  function importIrregularFiles(files){
    if(!files || !files.length) return;
    if(typeof XLSX === 'undefined'){ showToast('엑셀 모듈 로딩중'); return; }
    try { console.log('[비정규직 가져오기 백업]', JSON.stringify(dbGet('payroll_irregular',[]))); } catch(_){}
    var arr = recs.slice();
    var have = {};
    arr.forEach(function(r){ have[r.ym+'|'+r.type+'|'+(r.name||'')+'|'+String(r.rrn||'').replace(/[^0-9]/g,'')] = true; });
    var list = Array.prototype.slice.call(files);
    var totalAdded=0, totalSkipped=0, msgs=[], i=0;
    function next(){
      if(i >= list.length){
        persist(arr);
        showToast('📥 '+list.length+'개 파일: 추가 '+totalAdded+'명 / 건너뜀 '+totalSkipped+'명');
        return;
      }
      _processIrregularFile(list[i], arr, have, function(a,s,label,ym){
        totalAdded+=a; totalSkipped+=s; i++; next();
      });
    }
    next();
  }
  function importIrregularXlsx(e){
    importIrregularFiles(e.target.files);
    e.target.value='';
  }
  function openEdit(r){
    setModal(Object.assign({}, r));
  }
  function autoCalc(m){
    var amt = parseInt(m.amount) || 0;
    if(m.type === 'daily'){
      // 일용직: workDays × dailyWage = amount 자동 계산
      var wd = parseInt(m.workDays) || 0;
      var dw = parseInt(m.dailyWage) || 0;
      if(wd > 0 && dw > 0) amt = wd * dw;
    }
    var t = calcIrregularTax(m.type, amt);
    return Object.assign({}, m, { amount:amt, incomeTax:t.incomeTax, localTax:t.localTax, netPay:t.netPay });
  }
  function saveModal(){
    if(!modal.name.trim()){ showToast('이름을 입력하세요'); return; }
    var m = autoCalc(modal);
    if(m.amount <= 0){ showToast('지급액을 입력하세요'); return; }
    var arr = recs.slice();
    if(m.id){
      arr = arr.map(function(r){ return r.id===m.id ? m : r; });
    } else {
      m.id = 'pi-'+Date.now().toString(36)+Math.random().toString(36).slice(2,5);
      arr.push(m);
    }
    persist(arr);
    setModal(null);
    showToast(m.id?'✅ 저장됨':'✅ 추가됨');
  }
  async function delRec(id){
    if(!(await popConfirm('삭제하시겠습니까?'))) return;
    var _ud=recs.slice(); persist(recs.filter(function(r){ return r.id !== id; }));
    showToastUndo('🗑️ 삭제됨', function(){persist(_ud);});
  }

  // 일괄 확정 → finance_expense 동기화
  async function confirmAll(){
    if(monthRecs.length === 0){ showToast('확정할 항목이 없습니다'); return; }
    var unpaid = monthRecs.filter(function(r){ return !r.paid; });
    if(unpaid.length === 0){ showToast('이미 모두 지급 처리됨'); return; }
    if(!(await popConfirm(props.selYM+' 비정규직 '+unpaid.length+'건을 일괄 지급 확정하시겠습니까?\n→ 재무관리(출금)에 카테고리별 자동 등록됩니다.'))) return;

    var today = todayYMD();
    // recs 업데이트
    var newRecs = recs.map(function(r){
      if(r.ym===props.selYM && !r.paid){
        return Object.assign({}, r, { paid:true, paidDate:today });
      }
      return r;
    });
    persist(newRecs);

    // finance_expense 동기화 - 유형별 합계
    var fe = dbGet('finance_expense', []);
    // 기존 동일 ym 비정규직 자동 기록 제거 (재확정 대비)
    fe = fe.filter(function(e){
      var isIrr = ['exp-irregular-daily','exp-irregular-misc','exp-irregular-biz'].indexOf(e.category) >= 0;
      if(!isIrr) return true;
      return (e.note||'').indexOf('['+props.selYM+' 일괄]') < 0;
    });

    IRREGULAR_TYPES.forEach(function(t){
      var typeRecs = unpaid.filter(function(r){ return r.type === t.v; });
      if(typeRecs.length === 0) return;
      var total = typeRecs.reduce(function(s,r){ return s + (parseInt(r.netPay)||0); }, 0);
      var taxTotal = typeRecs.reduce(function(s,r){ return s + (parseInt(r.incomeTax)||0) + (parseInt(r.localTax)||0); }, 0);
      var grossTotal = typeRecs.reduce(function(s,r){ return s + (parseInt(r.amount)||0); }, 0);
      var names = typeRecs.map(function(r){ return r.name; }).join(', ');
      fe.unshift({
        id:'fe-irr-'+t.v+'-'+props.selYM, date:today, amount:total,
        category:t.catCode,
        payee:t.label+' '+typeRecs.length+'명',
        note:'['+props.selYM+' 일괄] '+t.label+' 실지급 '+total.toLocaleString()+' / 원천세 '+taxTotal.toLocaleString()+' / 총지급액 '+grossTotal.toLocaleString()+' ('+names+')',
        breakdown:{ count:typeRecs.length, gross:grossTotal, tax:taxTotal, net:total },
        createdAt:(new Date()).toISOString()
      });
    });
    dbSet('finance_expense', fe);
    showToast('확정 완료 ('+unpaid.length+'건 → 재무관리 자동 등록)');
  }

  // 합계
  var sums = {
    daily: { count:0, gross:0, net:0, tax:0 },
    misc:  { count:0, gross:0, net:0, tax:0 },
    biz:   { count:0, gross:0, net:0, tax:0 }
  };
  monthRecs.forEach(function(r){
    if(!sums[r.type]) return;
    sums[r.type].count++;
    sums[r.type].gross += parseInt(r.amount)||0;
    sums[r.type].net   += parseInt(r.netPay)||0;
    sums[r.type].tax   += (parseInt(r.incomeTax)||0) + (parseInt(r.localTax)||0);
  });
  var totalCount = sums.daily.count + sums.misc.count + sums.biz.count;
  var totalGross = sums.daily.gross + sums.misc.gross + sums.biz.gross;
  var totalNet   = sums.daily.net + sums.misc.net + sums.biz.net;
  var totalTax   = sums.daily.tax + sums.misc.tax + sums.biz.tax;

  function typeLabel(v){ var t=IRREGULAR_TYPES.find(function(x){return x.v===v;}); return t?t.label:v; }
  function typeColor(v){ var t=IRREGULAR_TYPES.find(function(x){return x.v===v;}); return t?t.color:'#94a3b8'; }

  return h('div', null,
    // 헤더
    h('div', { style:{ marginBottom:'10px' } },
      // 줄1: 월 네비 + 마감잠금
      h('div', { style:{ display:'flex', gap:'6px', alignItems:'center', marginBottom:'6px' } },
        // ◀ 월 ▶ 네비 (공용 MonthNav)
        h(MonthNav, {
          onPrev:function(){ var d = new Date(props.selYM + '-01'); d.setMonth(d.getMonth() - 1); props.setSelYM(d.toISOString().slice(0,7)); },
          onNext:function(){ var d = new Date(props.selYM + '-01'); d.setMonth(d.getMonth() + 1); props.setSelYM(d.toISOString().slice(0,7)); },
          label: props.selYM,
          onToday:function(){ props.setSelYM(todayYM()); },
          todayActive: props.selYM===todayYM()
        }),
        // 월 마감 잠금 토글
        (function(){
          var locked = isIrregularLocked(props.selYM);
          return h('button', { onClick:async function(){
              if(locked){
                if(!(await popConfirm(props.selYM + ' 잠금을 해제할까요?\n(해제 후 수정·추가·삭제 가능)'))) return;
                setIrregularLock(props.selYM, false);
                showToast('🔓 ' + props.selYM + ' 잠금 해제');
              } else {
                if(!(await popConfirm(props.selYM + ' 비정규직 내역을 마감(잠금)할까요?\n→ 이후 수정·추가·삭제 차단\n→ 같은 버튼으로 다시 해제 가능'))) return;
                setIrregularLock(props.selYM, true);
                showToast('🔒 ' + props.selYM + ' 잠금 — 마감 완료');
              }
              setRecs(dbGet('payroll_irregular', []));
            },
            title: locked ? props.selYM+' 잠긴 상태 — 클릭하여 해제' : props.selYM+'을(를) 마감 잠금',
            style:{ padding:'6px 12px', background:locked?'#dc2626':'#fff', color:locked?'#fff':'#475569', border:'1px solid '+(locked?'#dc2626':'#cbd5e1'), borderRadius:'5px', cursor:'pointer', fontSize:'12px', fontWeight:locked?700:600 } },
            locked ? '🔒 마감됨' : '🔓 마감 잠금');
        })(),
      ),
      // 줄2: + 버튼들 + 일괄확정 (가로 스크롤)
      h('div', { style:{ display:'flex', gap:'6px', overflowX:'auto', WebkitOverflowScrolling:'touch', paddingBottom:'2px' } },
        IRREGULAR_TYPES.map(function(t){
          var locked = isIrregularLocked(props.selYM);
          return h('button', { key:t.v, onClick:function(){ openAdd(t.v); }, disabled:locked,
            style:{ padding:'8px 14px', background:locked?'#cbd5e1':t.color, color:'#fff', border:'none', borderRadius:'6px',
              cursor:locked?'not-allowed':'pointer', fontSize:'12px', fontWeight:700, opacity:locked?0.6:1, flexShrink:0, whiteSpace:'nowrap' } },
            '+ '+t.label);
        }),
        h('button', { onClick:confirmAll, disabled:isIrregularLocked(props.selYM),
          style:{ padding:'8px 14px', background:isIrregularLocked(props.selYM)?'#cbd5e1':'#1e40af', color:'#fff', border:'none', borderRadius:'6px',
            cursor:isIrregularLocked(props.selYM)?'not-allowed':'pointer', fontSize:'12px', fontWeight:700, opacity:isIrregularLocked(props.selYM)?0.6:1, flexShrink:0, whiteSpace:'nowrap' } }, '✓ 일괄 확정'),
        h('label', { style:{ padding:'8px 14px', background:'#eff6ff', color:'#1d4ed8', border:'1px dashed #60a5fa', borderRadius:'6px',
            cursor:'pointer', fontSize:'12px', fontWeight:600, flexShrink:0, whiteSpace:'nowrap', display:'inline-block' },
            title:'여러 파일 선택 가능 · 파일을 끌어다 놓아도 됩니다',
            onDragOver:function(ev){ ev.preventDefault(); ev.currentTarget.style.background='#dbeafe'; },
            onDragLeave:function(ev){ ev.currentTarget.style.background='#eff6ff'; },
            onDrop:function(ev){ ev.preventDefault(); ev.currentTarget.style.background='#eff6ff';
              if(ev.dataTransfer && ev.dataTransfer.files) importIrregularFiles(ev.dataTransfer.files); } },
          '📥 일용·기타소득 가져오기 (여러 개·드래그 가능)',
          h('input', { type:'file', accept:'.xlsx,.xls', multiple:true, onChange:importIrregularXlsx, style:{ display:'none' } }))
      )
    ),

    // 합계 카드 - 급여대장 동일 스타일
    h('div', { style:{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'8px', marginBottom:'10px' } },
      [
        { key:'daily', color:'#f59e0b', bg:'#fef3c7', bd:'#fde68a', label:'🟡 일용직',   count: sums.daily.count, gross: sums.daily.gross, net: sums.daily.net },
        { key:'misc',  color:'#ec4899', bg:'#fff5f5', bd:'#fee2e2', label:'🔴 기타소득', count: sums.misc.count,  gross: sums.misc.gross,  net: sums.misc.net  },
        { key:'biz',   color:'#3b82f6', bg:'#f5f3ff', bd:'#ddd6fe', label:'🟣 사업소득', count: sums.biz.count,   gross: sums.biz.gross,   net: sums.biz.net   }
      ].map(function(k){
        return h('div', { key:k.key,
          style:{ background:k.bg, border:'1px solid '+k.bd, borderRadius:'8px', padding:'9px 12px' } },
          h('div', { style:{ fontSize:'10.5px', color:k.color, fontWeight:600, marginBottom:'4px' } }, k.label),
          h('div', { style:{ fontSize:'13px', fontWeight:800, color:k.color } }, k.count+'명'),
          h('div', { style:{ fontSize:'13px', fontWeight:700, color:k.color, fontFamily:'monospace', marginTop:'2px' } }, k.gross.toLocaleString()+'원'),
          h('div', { style:{ fontSize:'10.5px', color:'#94a3b8', marginTop:'2px' } }, '실지급 '+k.net.toLocaleString())
        );
      })
    ),

    // 유형 필터
    h('div', { style:{ display:'flex', gap:'4px', marginBottom:'8px', overflowX:'auto', WebkitOverflowScrolling:'touch', paddingBottom:'2px' } },
      [{v:'all', label:'전체 ('+totalCount+')'}].concat(IRREGULAR_TYPES.map(function(t){
        return { v:t.v, label:t.label+' ('+sums[t.v].count+')', color:t.color };
      })).map(function(t){
        var on = typeFilter === t.v;
        return h('button', { key:t.v, onClick:function(){ setTypeFilter(t.v); },
          style:{ padding:'5px 12px', fontSize:'11.5px', fontWeight:on?700:500,
            background:on?(t.color||'#1e40af'):'#f8fafc', color:on?'#fff':'#64748b',
            border:'1px solid '+(on?(t.color||'#1e40af'):'#e2e8f0'), borderRadius:'20px', cursor:'pointer', flexShrink:0, whiteSpace:'nowrap' } },
          t.label);
      })
    ),

    // 테이블 (모바일: 카드뷰 / PC: 테이블)
    window.innerWidth <= 768
    ? h('div', { style:{ display:'flex', flexDirection:'column', gap:'8px' } },
        viewRecs.length === 0
          ? h('div', { style:{ padding:'24px', textAlign:'center', color:'#94a3b8', background:'#fff', borderRadius:'8px', border:'1px solid #e2e8f0' } },
              '등록된 항목이 없습니다.')
          : viewRecs.map(function(r){
              var clr = typeColor(r.type);
              return h('div', { key:r.id,
                style:{ background:'#fff', border:'1px solid #e2e8f0', borderLeft:'4px solid '+clr,
                  borderRadius:'8px', padding:'10px 12px' } },
                // 줄1: 유형배지 + 이름 + 상태
                h('div', { style:{ display:'flex', alignItems:'center', gap:'6px', marginBottom:'6px' } },
                  h('span', { style:{ background:clr+'20', color:clr, padding:'2px 8px', borderRadius:'10px', fontSize:'10px', fontWeight:700 } }, typeLabel(r.type)),
                  h('span', { style:{ fontWeight:700, fontSize:'14px', flex:1 } }, r.name),
                  r.paid
                    ? h('span', { style:{ background:'#dcfce7', color:'#15803d', padding:'2px 8px', borderRadius:'10px', fontSize:'10px', fontWeight:700 } }, '지급')
                    : h('span', { style:{ background:'#fef3c7', color:'#92400e', padding:'2px 8px', borderRadius:'10px', fontSize:'10px', fontWeight:700 } }, '미지급')
                ),
                // 줄2: 금액 정보
                h('div', { style:{ display:'flex', gap:'12px', fontSize:'12px', marginBottom:'6px' } },
                  h('span', null, '지급 ', h('b', null, (r.amount||0).toLocaleString()+'원')),
                  h('span', { style:{ color:'#dc2626' } }, '세금 ', h('b', null, ((r.incomeTax||0)+(r.localTax||0)).toLocaleString())),
                  h('span', { style:{ color:'#1e40af' } }, '실지급 ', h('b', null, (r.netPay||0).toLocaleString()))
                ),
                // 줄3: 버튼
                h('div', { style:{ display:'flex', gap:'6px' } },
                  h('button', { onClick:function(){ setSlipModal(r); },
                    style:{ padding:'5px 12px', background:'#eff6ff', border:'1px solid #bfdbfe', borderRadius:'6px', cursor:'pointer', fontSize:'11px', color:'#1e40af', fontWeight:600 } }, '📄 명세서'),
                  h('button', { onClick:function(){ openEdit(r); },
                    style:{ padding:'5px 12px', background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:'6px', cursor:'pointer', fontSize:'11px' } }, '수정'),
                  h('button', { onClick:function(){ delRec(r.id); },
                    style:{ padding:'5px 12px', background:'#fff', border:'1px solid #fecaca', borderRadius:'6px', cursor:'pointer', fontSize:'11px', color:'#dc2626' } }, '삭제')
                )
              );
            })
      )
    : h('div', { style:{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:'7px', overflow:'auto' } },
        h('table', { style:{ width:'100%', borderCollapse:'collapse', fontSize:'12px' } },
          h('thead', null,
            h('tr', { style:{ background:'#f8fafc' } },
              ['유형','이름','주민번호','지급액','소득세','지방세','실지급','메모','상태',''].map(function(c,i){
                return h('th', { key:i, style:{ padding:'8px 10px', textAlign:i>=3&&i<=6?'right':'left',
                  fontWeight:700, color:'#475569', borderBottom:'1px solid #e2e8f0' } }, c);
              })
            )
          ),
          h('tbody', null,
            viewRecs.length === 0
              ? h('tr', null, h('td', { colSpan:10, style:{ padding:'24px', textAlign:'center', color:'#94a3b8' } },
                  '등록된 항목이 없습니다. 위 + 버튼으로 추가하세요.'))
              : viewRecs.map(function(r){
                return h('tr', { key:r.id, style:{ borderBottom:'1px solid #f1f5f9' } },
                h('td', { style:{ padding:'7px 10px' } },
                  h('span', { style:{ background:typeColor(r.type)+'20', color:typeColor(r.type),
                    padding:'2px 8px', borderRadius:'10px', fontSize:'10.5px', fontWeight:700 } },
                    typeLabel(r.type))),
                h('td', { style:{ padding:'7px 10px', fontWeight:600 } }, r.name),
                h('td', { style:{ padding:'7px 10px', fontFamily:'monospace', color:'#64748b', fontSize:'11px' } }, r.rrn||'-'),
                h('td', { style:{ padding:'7px 10px', textAlign:'right', fontWeight:600 } }, (r.amount||0).toLocaleString()),
                h('td', { style:{ padding:'7px 10px', textAlign:'right', color:'#dc2626' } }, (r.incomeTax||0).toLocaleString()),
                h('td', { style:{ padding:'7px 10px', textAlign:'right', color:'#dc2626' } }, (r.localTax||0).toLocaleString()),
                h('td', { style:{ padding:'7px 10px', textAlign:'right', fontWeight:700, color:'#1e40af' } }, (r.netPay||0).toLocaleString()),
                h('td', { style:{ padding:'7px 10px', color:'#64748b', fontSize:'11px', maxWidth:'200px',
                  overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' } }, r.note||'-'),
                h('td', { style:{ padding:'7px 10px' } },
                  r.paid
                    ? h('span', { style:{ background:'#dcfce7', color:'#15803d', padding:'2px 8px',
                        borderRadius:'10px', fontSize:'10.5px', fontWeight:700 } }, '지급')
                    : h('span', { style:{ background:'#fef3c7', color:'#92400e', padding:'2px 8px',
                        borderRadius:'10px', fontSize:'10.5px', fontWeight:700 } }, '미지급')),
                h('td', { style:{ padding:'7px 10px', whiteSpace:'nowrap' } },
                  h('button', { onClick:function(){ setSlipModal(r); },
                    style:{ padding:'3px 8px', background:'#eff6ff', border:'1px solid #bfdbfe',
                      borderRadius:'5px', cursor:'pointer', fontSize:'10.5px', color:'#1e40af', marginRight:'3px' } }, '📄 명세서'),
                  h('button', { onClick:function(){ openEdit(r); },
                    style:{ padding:'3px 8px', background:'#fff', border:'1px solid #e2e8f0',
                      borderRadius:'5px', cursor:'pointer', fontSize:'10.5px', marginRight:'3px' } }, '수정'),
                  h('button', { onClick:function(){ delRec(r.id); },
                    style:{ padding:'3px 8px', background:'#fff', border:'1px solid #fecaca',
                      borderRadius:'5px', cursor:'pointer', fontSize:'10.5px', color:'#dc2626' } }, '삭제'))
              );
            })
        ),
          viewRecs.length > 0 && h('tfoot', null,
            h('tr', { style:{ background:'#f8fafc', fontWeight:700 } },
              h('td', { colSpan:3, style:{ padding:'8px 10px' } }, '합계 '+viewRecs.length+'건'),
              h('td', { style:{ padding:'8px 10px', textAlign:'right' } },
                viewRecs.reduce(function(s,r){return s+(parseInt(r.amount)||0);},0).toLocaleString()),
              h('td', { style:{ padding:'8px 10px', textAlign:'right', color:'#dc2626' } },
                viewRecs.reduce(function(s,r){return s+(parseInt(r.incomeTax)||0);},0).toLocaleString()),
              h('td', { style:{ padding:'8px 10px', textAlign:'right', color:'#dc2626' } },
                viewRecs.reduce(function(s,r){return s+(parseInt(r.localTax)||0);},0).toLocaleString()),
              h('td', { style:{ padding:'8px 10px', textAlign:'right', color:'#1e40af' } },
                viewRecs.reduce(function(s,r){return s+(parseInt(r.netPay)||0);},0).toLocaleString()),
              h('td', { colSpan:3 }, '')
            )
          )
        )
      ),

    // 안내
    h('div', { style:{ fontSize:'11px', color:'#64748b', marginTop:'10px', padding:'8px 12px',
      background:'#f0f9ff', border:'1px solid #bfdbfe', borderRadius:'5px' } },
      '💡 ',
      h('strong', null, '자동 세율: '),
      '일용직 — 수동 입력 (15만원 이하 면세) · ',
      '기타소득 — 22% (필요경비 60%, 실효 8.8%) · ',
      '사업소득 — 3.3%. ',
      h('strong', null, '일괄 확정'),
      ' 시 유형별 합계가 재무관리 출금에 자동 등록됩니다.'),

    // 추가/수정 모달
    modal && h('div', { className:'modal-bg', onClick:function(){ setModal(null); } },
      h('div', { className:'modal', style:{ width:'520px' }, onClick:function(e){ e.stopPropagation(); } },
        h('div', { className:'modal-h' },
          h('div', { className:'t' }, (function(){
            if(modal.id) return '비정규직 수정 ('+typeLabel(modal.type)+')';
            if(modal.type==='daily') return '🟡 일용근로소득 신고 추가';
            if(modal.type==='misc')  return '🔴 기타소득 신고 추가';
            if(modal.type==='biz')   return '🟣 사업소득 신고 추가';
            return '비정규직 추가';
          })()),
          h('button', { className:'x', onClick:function(){ setModal(null); } }, '×')
        ),
        h('div', { className:'modal-b' },
          // 유형 탭 — 수정 시에만 표시 (신규 추가는 버튼에서 이미 선택됨)
          modal.id && h('div', { style:{ marginBottom:'12px' } },
            h('label', { style:{ display:'block', fontSize:'11.5px', fontWeight:700, color:'#475569', marginBottom:'5px' } }, '유형'),
            h('div', { style:{ display:'flex', gap:'4px' } },
              IRREGULAR_TYPES.map(function(t){
                var on = modal.type === t.v;
                return h('button', { key:t.v, onClick:function(){ setModal(autoCalc(Object.assign({},modal,{type:t.v}))); },
                  style:{ flex:1, padding:'7px', background:on?t.color:'#f8fafc', color:on?'#fff':'#475569',
                    border:'1px solid '+(on?t.color:'#e2e8f0'), borderRadius:'5px', cursor:'pointer',
                    fontSize:'12px', fontWeight:on?700:500 } },
                  t.label, h('div',{style:{fontSize:'10.5px',marginTop:'1px',opacity:0.85}},t.desc));
              })
            )
          ),
          // 이름
          h('div', { style:{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px', marginBottom:'12px' } },
            h('div', null,
              h('label', { style:{ display:'block', fontSize:'11.5px', fontWeight:700, color:'#475569', marginBottom:'5px' } }, '이름 *'),
              h('input', { type:'text', value:modal.name, autoFocus:!modal.id,
                onChange:function(e){ setModal(Object.assign({},modal,{name:e.target.value})); },
                style:{ width:'100%', padding:'7px 10px', border:'1px solid #e2e8f0', borderRadius:'5px', fontSize:'12.5px', boxSizing:'border-box' } })),
            h('div', null,
              h('label', { style:{ display:'block', fontSize:'11.5px', fontWeight:700, color:'#475569', marginBottom:'5px' } }, '주민번호 (선택)'),
              h('input', { type:'text', value:modal.rrn||'', placeholder:'901020-1234567',
                onChange:function(e){ setModal(Object.assign({},modal,{rrn:e.target.value})); },
                style:{ width:'100%', padding:'7px 10px', border:'1px solid #e2e8f0', borderRadius:'5px', fontSize:'12.5px', boxSizing:'border-box', fontFamily:'monospace' } }))
          ),
          // 일용직: 일수×일급
          modal.type === 'daily' && h('div', { style:{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px', marginBottom:'12px' } },
            h('div', null,
              h('label', { style:{ display:'block', fontSize:'11.5px', fontWeight:700, color:'#475569', marginBottom:'5px' } }, '근무일수'),
              h('input', { type:'number', value:modal.workDays||0,
                onChange:function(e){
                  var m = Object.assign({},modal,{workDays:parseInt(e.target.value)||0});
                  setModal(autoCalc(m));
                },
                style:{ width:'100%', padding:'7px 10px', border:'1px solid #e2e8f0', borderRadius:'5px', fontSize:'12.5px', boxSizing:'border-box' } })),
            h('div', null,
              h('label', { style:{ display:'block', fontSize:'11.5px', fontWeight:700, color:'#475569', marginBottom:'5px' } }, '일급'),
              h('input', { type:'number', value:modal.dailyWage||0,
                onChange:function(e){
                  var m = Object.assign({},modal,{dailyWage:parseInt(e.target.value)||0});
                  setModal(autoCalc(m));
                },
                style:{ width:'100%', padding:'7px 10px', border:'1px solid #e2e8f0', borderRadius:'5px', fontSize:'12.5px', boxSizing:'border-box' } }))
          ),
          // 지급액 (자동/수동)
          h('div', { style:{ marginBottom:'12px' } },
            h('label', { style:{ display:'block', fontSize:'11.5px', fontWeight:700, color:'#475569', marginBottom:'5px' } },
              '지급액(세전) *', modal.type==='daily' && h('span',{style:{fontSize:'10px',color:'#94a3b8',marginLeft:'5px'}}, '(일수×일급 자동, 직접 수정 가능)')),
            h('input', { type:'number', value:modal.amount||0,
              onChange:function(e){
                var m = Object.assign({},modal,{amount:parseInt(e.target.value)||0});
                setModal(autoCalc(m));
              },
              style:{ width:'100%', padding:'7px 10px', border:'1px solid #e2e8f0', borderRadius:'5px', fontSize:'12.5px', boxSizing:'border-box', fontWeight:700 } })
          ),
          // 세금 자동 계산 결과
          h('div', { style:{ background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:'5px', padding:'10px 12px', marginBottom:'12px' } },
            h('div', { style:{ fontSize:'11px', color:'#64748b', marginBottom:'5px', fontWeight:700 } },
              '🧮 원천징수 자동 계산'+(modal.type==='daily'?' (일용직은 수동 입력)':'')),
            h('div', { style:{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'8px', fontSize:'11.5px' } },
              h('div', null,
                h('div', { style:{ color:'#94a3b8', marginBottom:'2px' } }, '소득세'),
                h('input', { type:'number', value:modal.incomeTax||0,
                  onChange:function(e){
                    var m = Object.assign({},modal,{incomeTax:parseInt(e.target.value)||0});
                    m.netPay = (parseInt(m.amount)||0) - m.incomeTax - (parseInt(m.localTax)||0);
                    setModal(m);
                  },
                  readOnly: modal.type !== 'daily',
                  style:{ width:'100%', padding:'5px 8px', border:'1px solid '+(modal.type==='daily'?'#e2e8f0':'#cbd5e1'),
                    background:modal.type==='daily'?'#fff':'#f1f5f9', borderRadius:'4px', fontSize:'12px',
                    boxSizing:'border-box', fontWeight:600, color:'#dc2626' } })),
              h('div', null,
                h('div', { style:{ color:'#94a3b8', marginBottom:'2px' } }, '지방세'),
                h('input', { type:'number', value:modal.localTax||0,
                  onChange:function(e){
                    var m = Object.assign({},modal,{localTax:parseInt(e.target.value)||0});
                    m.netPay = (parseInt(m.amount)||0) - (parseInt(m.incomeTax)||0) - m.localTax;
                    setModal(m);
                  },
                  readOnly: modal.type !== 'daily',
                  style:{ width:'100%', padding:'5px 8px', border:'1px solid '+(modal.type==='daily'?'#e2e8f0':'#cbd5e1'),
                    background:modal.type==='daily'?'#fff':'#f1f5f9', borderRadius:'4px', fontSize:'12px',
                    boxSizing:'border-box', fontWeight:600, color:'#dc2626' } })),
              h('div', null,
                h('div', { style:{ color:'#94a3b8', marginBottom:'2px' } }, '실지급액'),
                h('div', { style:{ padding:'5px 8px', background:'#dbeafe', borderRadius:'4px',
                  fontWeight:700, color:'#1e40af', textAlign:'right' } },
                  (modal.netPay||0).toLocaleString()))
            )
          ),
          // 메모
          h('div', { style:{ marginBottom:'12px' } },
            h('label', { style:{ display:'block', fontSize:'11.5px', fontWeight:700, color:'#475569', marginBottom:'5px' } }, '메모'),
            h('input', { type:'text', value:modal.note||'', placeholder:'예: 강의료, 외주 디자인, 4월 일용 등',
              onChange:function(e){ setModal(Object.assign({},modal,{note:e.target.value})); },
              style:{ width:'100%', padding:'7px 10px', border:'1px solid #e2e8f0', borderRadius:'5px', fontSize:'12.5px', boxSizing:'border-box' } })
          ),
          // 계좌
          h('div', { style:{ display:'grid', gridTemplateColumns:'1fr 2fr', gap:'10px', marginBottom:'12px' } },
            h('div', null,
              h('label', { style:{ display:'block', fontSize:'11.5px', fontWeight:700, color:'#475569', marginBottom:'5px' } }, '은행'),
              h('input', { type:'text', value:modal.bank||'', placeholder:'국민은행',
                onChange:function(e){ setModal(Object.assign({},modal,{bank:e.target.value})); },
                style:{ width:'100%', padding:'7px 10px', border:'1px solid #e2e8f0', borderRadius:'5px', fontSize:'12.5px', boxSizing:'border-box' } })),
            h('div', null,
              h('label', { style:{ display:'block', fontSize:'11.5px', fontWeight:700, color:'#475569', marginBottom:'5px' } }, '계좌번호'),
              h('input', { type:'text', value:modal.account||'',
                onChange:function(e){ setModal(Object.assign({},modal,{account:e.target.value})); },
                style:{ width:'100%', padding:'7px 10px', border:'1px solid #e2e8f0', borderRadius:'5px', fontSize:'12.5px', boxSizing:'border-box', fontFamily:'monospace' } }))
          )
        ),
        h('div', { className:'modal-f' },
          h('button', { className:'btn-default', onClick:function(){ setModal(null); } }, '취소'),
          h('button', { className:'btn-primary', onClick:saveModal }, '저장')
        )
      )
    ),

    // 명세서 모달
    slipModal && h(IrregularPayslipModal, {
      rec: slipModal,
      onClose: function(){ setSlipModal(null); }
    })
  );
}

// ============ 비정규직 급여명세서 모달 ============
function IrregularPayslipModal(props){
  useEscClose(props.onClose);
  var r = props.rec;
  var typeInfo = IRREGULAR_TYPES.find(function(x){return x.v===r.type;}) || { label:r.type, color:'#94a3b8', desc:'' };
  // 주민번호 마스킹: 901020-1****** (앞 7자리만 + 뒤 1자리)
  function maskRrn(rrn){
    if(!rrn) return '-';
    var s = String(rrn).replace(/-/g,'');
    if(s.length < 7) return rrn;
    return s.slice(0,6) + '-' + s.charAt(6) + '******';
  }
  // 지급 흐름 (ym 다음달 추정)
  var py = parseInt((r.ym||'').slice(0,4),10);
  var pm = parseInt((r.ym||'').slice(5,7),10) + 1;
  if(pm > 12){ pm = 1; py++; }
  var payYM = r.ym ? py+'-'+String(pm).padStart(2,'0') : '';

  function printSlip(){
    var w = window.open('', '_blank', 'width=800,height=900');
    if(!w){ showToast('팝업 차단을 해제하세요'); return; }
    var el = document.getElementById('irregular-payslip-print');
    if(!el){ w.close(); return; }
    w.document.write('<!DOCTYPE html><html><head><meta charset="utf-8"><title>비정규직 급여명세서</title>');
    w.document.write('<style>body{font-family:"Malgun Gothic","Apple SD Gothic Neo",sans-serif;padding:30px;color:#1e293b;}@media print{body{padding:0;}}</style>');
    w.document.write('</head><body>'+el.innerHTML+'</body></html>');
    w.document.close();
    setTimeout(function(){ w.print(); }, 300);
  }

  // 일용직 계산 명세
  var isDaily = r.type === 'daily';
  var rowS = { display:'flex', justifyContent:'space-between', padding:'6px 0', fontSize:'12px', borderBottom:'1px dashed #e2e8f0' };
  var labelS = { color:'#64748b' };
  var valueS = { fontFamily:'monospace', fontWeight:600, color:'#1e293b' };

  return h('div', { className:'modal-bg', onClick:function(e){if(e.target===e.currentTarget)props.onClose();} },
    h('div', { className:'modal', style:{ width:'520px', maxHeight:'90vh', overflowY:'auto' } },
      h('div', { className:'modal-h' },
        h('div', { className:'t' }, '📄 비정규직 급여명세서 - '+r.name),
        h('div', { style:{ display:'flex', gap:'6px' } },
          h('button', { onClick:printSlip,
            style:{ padding:'4px 10px', background:'#1e40af', color:'#fff', border:'none', borderRadius:'4px', fontSize:'11px', fontWeight:600, cursor:'pointer' } }, '🖨 인쇄'),
          h('button', { className:'x', onClick:props.onClose }, '×')
        )
      ),
      h('div', { className:'modal-b' },
        h('div', { id:'irregular-payslip-print' },
          // 헤더 (인쇄용)
          h('div', { style:{ textAlign:'center', marginBottom:'18px', paddingBottom:'14px', borderBottom:'2px solid #1e40af' } },
            h('div', { style:{ fontSize:'18px', fontWeight:700, color:'#1e40af', marginBottom:'4px' } }, '비정규직 급여명세서'),
            h('div', { style:{ fontSize:'12px', color:'#64748b' } }, '푸른노무법인'),
            h('div', { style:{ fontSize:'10.5px', color:'#94a3b8', marginTop:'2px' } }, '근무월 '+r.ym+' · 지급월 '+payYM)
          ),
          // 유형
          h('div', { style:{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'14px', padding:'8px 12px', background:typeInfo.color+'18', borderRadius:'6px' } },
            h('span', { style:{ background:typeInfo.color, color:'#fff', padding:'3px 10px', borderRadius:'10px', fontSize:'11px', fontWeight:700 } }, typeInfo.label),
            h('span', { style:{ fontSize:'11px', color:'#475569' } }, typeInfo.desc)
          ),
          // 인적사항
          h('div', { style:{ marginBottom:'14px' } },
            h('div', { style:{ fontSize:'12.5px', fontWeight:700, color:'#475569', marginBottom:'6px', paddingBottom:'4px', borderBottom:'1px solid #e2e8f0' } }, '👤 인적사항'),
            h('div', { style:rowS }, h('span', { style:labelS }, '성명'), h('span', { style:valueS }, r.name||'-')),
            h('div', { style:rowS }, h('span', { style:labelS }, '주민등록번호'), h('span', { style:valueS }, maskRrn(r.rrn))),
            r.bank && h('div', { style:rowS }, h('span', { style:labelS }, '입금계좌'), h('span', { style:valueS }, r.bank+' '+(r.account||'')))
          ),
          // 지급 내역
          h('div', { style:{ marginBottom:'14px' } },
            h('div', { style:{ fontSize:'12.5px', fontWeight:700, color:'#475569', marginBottom:'6px', paddingBottom:'4px', borderBottom:'1px solid #e2e8f0' } }, '💰 지급 내역'),
            isDaily && parseInt(r.workDays||0) > 0 && parseInt(r.dailyWage||0) > 0
              ? h('div', null,
                  h('div', { style:rowS }, h('span', { style:labelS }, '일당'), h('span', { style:valueS }, (parseInt(r.dailyWage)||0).toLocaleString()+'원')),
                  h('div', { style:rowS }, h('span', { style:labelS }, '근무일수'), h('span', { style:valueS }, (parseInt(r.workDays)||0).toLocaleString()+'일')),
                  h('div', { style:Object.assign({},rowS,{background:'#f8fafc',padding:'8px 10px',marginTop:'4px',borderRadius:'4px',border:'none'}) },
                    h('span', { style:Object.assign({},labelS,{fontWeight:700,color:'#475569'}) }, '총지급액 (일당 × 일수)'),
                    h('span', { style:Object.assign({},valueS,{fontSize:'13px',color:'#1e293b'}) }, (parseInt(r.amount)||0).toLocaleString()+'원'))
                )
              : h('div', { style:Object.assign({},rowS,{background:'#f8fafc',padding:'8px 10px',marginTop:'4px',borderRadius:'4px',border:'none'}) },
                  h('span', { style:Object.assign({},labelS,{fontWeight:700,color:'#475569'}) }, '총지급액'),
                  h('span', { style:Object.assign({},valueS,{fontSize:'13px',color:'#1e293b'}) }, (parseInt(r.amount)||0).toLocaleString()+'원'))
          ),
          // 공제 내역
          h('div', { style:{ marginBottom:'14px' } },
            h('div', { style:{ fontSize:'12.5px', fontWeight:700, color:'#475569', marginBottom:'6px', paddingBottom:'4px', borderBottom:'1px solid #e2e8f0' } }, '🧾 공제 내역 (원천징수)'),
            h('div', { style:rowS }, h('span', { style:labelS }, '소득세'), h('span', { style:Object.assign({},valueS,{color:'#dc2626'}) }, (parseInt(r.incomeTax)||0).toLocaleString()+'원')),
            h('div', { style:rowS }, h('span', { style:labelS }, '지방소득세'), h('span', { style:Object.assign({},valueS,{color:'#dc2626'}) }, (parseInt(r.localTax)||0).toLocaleString()+'원')),
            h('div', { style:Object.assign({},rowS,{background:'#fef2f2',padding:'8px 10px',marginTop:'4px',borderRadius:'4px',border:'none'}) },
              h('span', { style:Object.assign({},labelS,{fontWeight:700,color:'#991b1b'}) }, '공제 합계'),
              h('span', { style:Object.assign({},valueS,{fontSize:'13px',color:'#dc2626'}) }, ((parseInt(r.incomeTax)||0)+(parseInt(r.localTax)||0)).toLocaleString()+'원'))
          ),
          // 실수령액
          h('div', { style:{ background:'#1e40af', color:'#fff', padding:'14px 16px', borderRadius:'6px', display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'10px' } },
            h('span', { style:{ fontSize:'13px', fontWeight:700 } }, '💸 실수령액'),
            h('span', { style:{ fontSize:'18px', fontWeight:700, fontFamily:'monospace' } }, (parseInt(r.netPay)||0).toLocaleString()+'원')
          ),
          r.note && h('div', { style:{ fontSize:'11px', color:'#64748b', padding:'8px 10px', background:'#f8fafc', borderRadius:'4px' } }, '비고: '+r.note),
          // 지급 상태
          h('div', { style:{ marginTop:'14px', fontSize:'11px', color:'#94a3b8', textAlign:'center' } },
            r.paid
              ? '✓ 지급 완료 ('+(r.paidDate||'')+')'
              : '⏳ 미지급'
          ),
          // 푸터 (인쇄용)
          h('div', { style:{ marginTop:'24px', paddingTop:'14px', borderTop:'1px solid #e2e8f0', fontSize:'10px', color:'#94a3b8', textAlign:'center' } },
            '본 명세서는 푸른노무법인이 발행한 비정규직 급여 지급 증빙 자료입니다.')
        )
      ),
      h('div', { className:'modal-f' },
        h('button', { className:'btn-default', onClick:props.onClose }, '닫기'),
        h('button', { className:'btn-primary', onClick:printSlip }, '🖨 인쇄')
      )
    )
  );
}

// 변경이력 뷰어 (명세서에 토글로 표시)
function PayslipAuditViewer(props){
  var op = useState(false); var open = op[0]; var setOpen = op[1];
  var logs = getPayrollAuditFor(props.empSid, props.ym);
  if(logs.length === 0) return null;
  return h('div',{className:'no-print',style:{maxWidth:'700px',margin:'0 auto 10px'}},
    h('button',{onClick:function(){setOpen(!open);},
      style:{width:'100%',padding:'7px 14px',background:open?'#1e40af':'#fff',color:open?'#fff':'#475569',border:'1px solid '+(open?'#1e40af':'#cbd5e1'),borderRadius:'5px',cursor:'pointer',fontSize:'11.5px',fontWeight:600,textAlign:'left'}},
      (open?'▼':'▶') + ' 📜 변경이력 ' + logs.length + '건'),
    open && h('div',{style:{background:'#f8fafc',border:'1px solid #e2e8f0',borderTop:'none',borderRadius:'0 0 5px 5px',padding:'8px 12px',maxHeight:'200px',overflowY:'auto'}},
      h('table',{style:{width:'100%',fontSize:'10.5px',borderCollapse:'collapse'}},
        h('thead',null,h('tr',{style:{borderBottom:'1px solid #cbd5e1'}},
          h('th',{style:{padding:'3px 6px',textAlign:'left',color:'#64748b'}},'시각'),
          h('th',{style:{padding:'3px 6px',textAlign:'left',color:'#64748b'}},'담당'),
          h('th',{style:{padding:'3px 6px',textAlign:'left',color:'#64748b'}},'필드'),
          h('th',{style:{padding:'3px 6px',textAlign:'left',color:'#64748b'}},'전 → 후')
        )),
        h('tbody',null,
          logs.map(function(e,i){
            return h('tr',{key:i,style:{borderTop:'1px solid #f1f5f9'}},
              h('td',{style:{padding:'3px 6px',fontFamily:'monospace',fontSize:'10.5px',color:'#64748b'}}, e.ts.slice(5,16).replace('T',' ')),
              h('td',{style:{padding:'3px 6px'}}, e.by),
              h('td',{style:{padding:'3px 6px',fontWeight:600}}, e.field),
              h('td',{style:{padding:'3px 6px',color:'#64748b'}}, (e.before||'-') + ' → ' + (e.after||'-'))
            );
          })
        )
      )
    )
  );
}

