// ============================================================
// 휴가 잔여일수 통합 헬퍼 (#3 단일 위치)
// ============================================================
// 푸른노무법인 5인이상 사업장 전환일 (근로기준법 연차 적용 시작일)
var PUREUN_5IN_DATE = '2021-06-01';

// 연차 실질 기산일: 2021-06-01 이전 입사자는 2021-06-01부터 기산
function getLeaveStartDate(hireDate){
  if(!hireDate) return hireDate;
  return hireDate < PUREUN_5IN_DATE ? PUREUN_5IN_DATE : hireDate;
}

function getLeaveRemain(sid, year){
  var policy = dbGet('policy_leave', { baseAfterOneYear:15, bonusEvery:2, bonusStart:3, maxDays:25, carryOverLimit:5, monthlyForFirstYear:true });
  var grants = dbGet('leave_grants', {});
  var users = dbGet('user_accounts', USERS_SEED);
  var u = users.find(function(x){return x.sid===sid;});
  if(!u || !u.hireDate) return { total:0, used:0, remain:0 };
  // 실질 기산일 적용 (2021-06-01 이전 입사자는 2021-06-01부터)
  var effectiveHire = getLeaveStartDate(u.hireDate);
  var hire = new Date(effectiveHire);
  if(isNaN(hire.getTime())) return { total:0, used:0, remain:0 };
  var y = String(year);
  var yearEnd = new Date(parseInt(y), 11, 31);
  if(u.leaveDate){ var ld=new Date(u.leaveDate); if(!isNaN(ld.getTime())&&ld<yearEnd) yearEnd=ld; }
  var autoDays = 0;
  if(hire <= yearEnd){
    var yrs = (yearEnd-hire)/(365.25*86400000);
    if(yrs < 1){
      if(policy.monthlyForFirstYear){ autoDays = Math.min(Math.floor((yearEnd-hire)/(30.44*86400000)), 11); }
    } else {
      var fy = Math.floor(yrs);
      var bs = policy.bonusStart||3, be = policy.bonusEvery||2;
      var bn = fy < bs ? 0 : Math.floor((fy-bs)/be)+1;
      autoDays = Math.min((policy.baseAfterOneYear||15)+bn, policy.maxDays||25);
    }
  }
  var ov = grants[sid] && grants[sid][y] ? grants[sid][y] : null;
  var total = ov && ov.total!=null ? ov.total : autoDays;
  var carry = ov ? (ov.carryOver||0) : 0;
  var grant = total + carry;
  var atts = dbGet('attendance_records', []);
  var lc=0, hc=0, hr=0;
  atts.forEach(function(r){
    if(r.sid!==sid || (r.date||'').slice(0,4)!==y) return;
    if(r.type==='leave') lc++;
    else if(r.type==='halfday-am'||r.type==='halfday-pm') hc++;
    else if(r.type==='leave-hour') hr+=parseFloat(r.hours)||0;
  });
  var dayHours = u.scheduledHours || 8;
  var used = lc + hc*0.5 + hr/dayHours;
  // 기산일 정보 포함해서 반환
  var isOldEmployee = u.hireDate < PUREUN_5IN_DATE;
  return { total:grant, used:Math.round(used*10)/10, remain:Math.round((grant-used)*10)/10,
    effectiveHire:effectiveHire, actualHire:u.hireDate, isOldEmployee:isOldEmployee };
}

// ============================================================
// 휴직(별도) 컴포넌트 - 휴가관리 탭 #2 (#1 출산·육아·병가)
// 데이터: 구 LOA 시스템 사용 (leave_of_absence 키) - 캘린더/월별급여/대시보드 자동연동
// 4종 노출: 출산휴직(maternity) / 육아휴직(parental-leave) / 병가(sick-leave) / 기타(personal)
// ============================================================
function LeaveOfAbsenceTab(){
  // 정책 마이그레이션: maternity(출산전후휴가) 없으면 자동 추가
  var pol0 = getLoaPolicy();
  if(!pol0.find(function(p){return p.code==='maternity';})){
    var migrated = pol0.concat([{
      code:'maternity', name:'출산전후휴가', kind:'법정', maxMonths:3, splitCount:0,
      paidType:'고용보험', payrollPause:true, childRequired:true,
      note:'90일(다태아 120일). 출산 후 45일 이상 보장'
    }]);
    setLoaPolicy(migrated);
  }

  var users = getActiveUsers();
  var ls = useState(getLoaList()); var leaves = ls[0]; var setLeaves = ls[1];
  var ms = useState(null); var modal = ms[0]; var setModal = ms[1];
  var sts = useState('list'); var subTab = sts[0]; var setSubTab = sts[1];   // list | parental
  var pss = useState(''); var selEmpSid = pss[0]; var setSelEmpSid = pss[1];  // 육아휴직 현황 선택 직원
  var pys = useState(String(new Date().getFullYear())); var selYear = pys[0]; var setSelYear = pys[1];
  function persist(arr){ setLeaves(arr); setLoaList(arr); }

  // 4종만 노출 (정책 code와 매핑)
  var TYPES = [
    { code:'maternity',      label:'출산휴직' },
    { code:'parental-leave', label:'육아휴직' },
    { code:'sick-leave',     label:'병가' },
    { code:'personal',       label:'기타' }
  ];
  var policyMap = getLoaPolicy().reduce(function(o,p){o[p.code]={name:p.name,paidType:p.paidType,payrollPause:p.payrollPause,childRequired:p.childRequired}; return o;}, {});

  function openAdd(){
    setModal({ isNew:true, item:{
      id:'lv-'+Date.now(),
      sid: users[0]?users[0].sid:'',
      code:'parental-leave',
      startDate:'', endDate:'', reason:'',
      childBirthDate:'',
      unit:'month',
      status:'active',
      createdAt:(new Date()).toISOString(),
      createdBy: CURRENT_USER ? CURRENT_USER.name : ''
    }});
  }
  function openEdit(it){ setModal({ isNew:false, item:Object.assign({}, it) }); }

  // user_accounts status 동기화 헬퍼
  function syncUserStatus(sid, on, extra){
    var users0 = dbGet('user_accounts', USERS_SEED);
    var updated = users0.map(function(u){
      if(u.sid !== sid) return u;
      if(on){
        // 휴직 시작
        return Object.assign({}, u, {
          status:'leave',
          leaveStartDate: (extra && extra.startDate) || u.leaveStartDate || todayYMD(),
          leaveEndDate: (extra && extra.endDate) || u.leaveEndDate || '',
          leaveReason: (extra && extra.reason) || u.leaveReason || ''
        });
      } else {
        // 휴직 종료 → 재직 복귀
        return Object.assign({}, u, {
          status:'active',
          leaveStartDate:'', leaveEndDate:'', leaveReason:''
        });
      }
    });
    dbSet('user_accounts', updated);
  }

  function save(){
    if(!modal) return;
    var it = modal.item;
    if(!it.sid){ showToast('직원을 선택하세요'); return; }
    if(!it.startDate){ showToast('시작일을 입력하세요'); return; }
    var pinfo = policyMap[it.code] || {};
    // 정책 기반 자동 필드 동기화
    it.typeLabel = pinfo.name || it.code;
    if(it.code === 'sick-leave' && it.paidType){
      it.payrollPause = (it.paidType !== '유급');
    } else {
      it.paidType  = pinfo.paidType || '';
      it.payrollPause = !!pinfo.payrollPause;
    }
    var next = modal.isNew
      ? leaves.concat([it])
      : leaves.map(function(x){return x.id===it.id?it:x;});
    persist(next);
    // ★ user_accounts status 자동 동기화 (status='active' 진행중일 때만)
    if(it.status !== 'ended'){
      syncUserStatus(it.sid, true, { startDate:it.startDate, endDate:it.endDate, reason:it.reason });
    } else {
      syncUserStatus(it.sid, false);
    }
    setModal(null);
    showToast(modal.isNew ? '휴직 등록 (사용자 상태 자동 휴직 변경 + 캘린더·월별급여 자동연동)' : '휴직 수정');
  }
  async function del(id){
    if(!(await popConfirm('이 휴직 기록을 삭제하시겠습니까?\n\n→ 해당 직원 상태도 [재직]으로 복원됩니다.'))) return;
    var target = leaves.find(function(x){return x.id===id;});
    persist(leaves.filter(function(x){return x.id!==id;}));
    // ★ user_accounts status 복원
    if(target && target.sid){
      // 해당 직원의 다른 활성 휴직이 없으면 active로
      var others = leaves.filter(function(x){return x.id!==id && x.sid===target.sid && x.status!=='ended';});
      if(others.length === 0){
        syncUserStatus(target.sid, false);
      }
    }
    showToast('삭제됨 (사용자 상태도 복원)');
  }
  // 휴직 종료 처리 (상태만 변경, 기록은 보존)
  async function endLeave(it){
    if(!(await popConfirm('"' + (users.find(function(u){return u.sid===it.sid;})||{}).name + '" 휴직을 종료(복귀) 처리하시겠습니까?\n\n→ 휴직 상태: 종료\n→ 직원 상태: 재직'))) return;
    var today = todayYMD();
    persist(leaves.map(function(x){
      return x.id===it.id ? Object.assign({}, x, { status:'ended', endDate: x.endDate || today }) : x;
    }));
    syncUserStatus(it.sid, false);
    showToast('휴직 종료 → 재직 복귀');
  }

  var thS = {padding:'7px 10px',fontWeight:700,color:'#475569',fontSize:'11.5px',background:'#f8fafc',borderBottom:'1px solid #e2e8f0',textAlign:'left'};
  var tdS = {padding:'7px 10px',borderBottom:'1px solid #f1f5f9',fontSize:'11.5px'};
  var TYPE_BG = {'maternity':'#fef3c7','parental-leave':'#dcfce7','sick-leave':'#fee2e2','personal':'#dbeafe'};
  var TYPE_FG = {'maternity':'#92400e','parental-leave':'#166534','sick-leave':'#991b1b','personal':'#3730a3'};

  // ── 육아휴직 현황 렌더 (선택 직원 1명) ──
  function renderParentalStatus(){
    var allUsers = dbGet('user_accounts', USERS_SEED);
    var pLeaves = leaves.filter(function(x){ return x.code==='parental-leave' && x.status!=='rejected' && x.status!=='pending'; });
    var empSids = [];
    pLeaves.forEach(function(x){ if(empSids.indexOf(x.sid)<0) empSids.push(x.sid); });
    var empOpts = empSids.map(function(sid){
      var u = allUsers.find(function(z){return z.sid===sid;}) || {};
      return { sid:sid, name:u.name||sid, title:u.title||'' };
    });
    var curSid = selEmpSid || (empOpts[0] ? empOpts[0].sid : '');
    var yearNum = selYear==='all' ? null : parseInt(selYear,10);
    var selUser = allUsers.find(function(z){return z.sid===curSid;}) || {};
    var limitM = selUser.parentalLeaveLimit || 12;
    var limitW = Math.round(limitM*4.345*10)/10;
    var recs = pLeaves.filter(function(x){ return x.sid===curSid && x.startDate && x.endDate; })
      .sort(function(a,b){ return (a.startDate<b.startDate)?-1:1; });
    var usedDays=0, usedWeeksSum=0, usedMonths=0, rows=[];
    recs.forEach(function(r){
      var seg = yearNum ? clampToYear(r.startDate, r.endDate, yearNum) : { start:r.startDate, end:r.endDate };
      if(!seg) return;
      var bdays = countBusinessDays(seg.start, seg.end);
      var wk = Math.round((bdays/5)*10)/10;
      var mo = monthsBetween(seg.start, seg.end);
      usedDays += bdays; usedWeeksSum += wk; usedMonths += mo;
      rows.push({ n:(rows.length+1), period:seg.start+' ~ '+seg.end, bdays:bdays, wk:wk, mo:mo,
        status: r.status==='ended' ? '종료' : '진행중' });
    });
    usedWeeksSum = Math.round(usedWeeksSum*10)/10;
    usedMonths = Math.round(usedMonths*10)/10;
    var remainM = Math.round(Math.max(0, limitM - usedMonths)*10)/10;
    var remainW = Math.round(Math.max(0, limitW - usedWeeksSum)*10)/10;
    var pct = limitM>0 ? Math.min(100, Math.round(usedMonths/limitM*100)) : 0;
    var limitLabel = limitM===18 ? '한도 1년 6개월 (18개월)' : '한도 1년 ('+limitM+'개월)';
    var rbStyle = function(bg,fg){ return { flex:1, minWidth:'140px', borderRadius:'10px', padding:'12px', textAlign:'center', background:bg, color:fg }; };

    return h('div', null,
      h('div', { style:{display:'flex',alignItems:'center',gap:'10px',flexWrap:'wrap',background:'#fff',border:'1px solid #e2e8f0',borderRadius:'10px',padding:'12px 14px',marginBottom:'14px'} },
        h('label',{style:{fontSize:'12px',fontWeight:700,color:'#475569'}},'👤 직원'),
        empOpts.length===0
          ? h('span',{style:{fontSize:'12px',color:'#94a3b8'}},'육아휴직 기록이 있는 직원이 없습니다')
          : h('select', { value:curSid, onChange:function(e){setSelEmpSid(e.target.value);},
              style:{padding:'7px 12px',border:'1px solid #cbd5e1',borderRadius:'7px',fontSize:'13px',background:'#fff',cursor:'pointer'} },
              empOpts.map(function(o){ return h('option',{key:o.sid,value:o.sid}, o.name + (o.title?' · '+o.title:'')); })),
        h('label',{style:{fontSize:'12px',fontWeight:700,color:'#475569'}},'📅 연도'),
        h('select', { value:selYear, onChange:function(e){setSelYear(e.target.value);},
            style:{padding:'7px 12px',border:'1px solid #cbd5e1',borderRadius:'7px',fontSize:'13px',background:'#fff',cursor:'pointer'} },
          h('option',{value:String(new Date().getFullYear())}, new Date().getFullYear()+'년'),
          h('option',{value:String(new Date().getFullYear()-1)}, (new Date().getFullYear()-1)+'년'),
          h('option',{value:'all'},'전체 기간'))
      ),
      h('div', { style:{background:'#eff6ff',border:'1px solid #bfdbfe',borderRadius:'8px',padding:'9px 12px',fontSize:'11.5px',color:'#1e40af',marginBottom:'14px'} },
        '📐 주수 = 사용 평일(월~금) ÷ 5 · 개월 = 캘린더 기준 · 잔여 = 한도 − 사용'),
      empOpts.length===0 ? null : h('div', { style:{background:'#fff',border:'1px solid #e2e8f0',borderRadius:'12px',overflow:'hidden'} },
        h('div', { style:{display:'flex',alignItems:'center',gap:'10px',padding:'14px 16px',background:'#f8fafc',borderBottom:'1px solid #e2e8f0'} },
          h('div', { style:{fontSize:'15px',fontWeight:800} }, (selUser.name||curSid), selUser.title?h('span',{style:{fontSize:'11px',color:'#94a3b8',fontWeight:500,marginLeft:'6px'}},selUser.title):null),
          h('span', { style:{marginLeft:'auto',fontSize:'11px',fontWeight:700,padding:'4px 11px',borderRadius:'20px',background:'#dbeafe',color:'#1e40af'} }, limitLabel)
        ),
        h('div',{style:{display:'flex',gap:'12px',padding:'14px',flexWrap:'wrap'}},
          h('div',{style:rbStyle('#eff6ff','#1e40af')},
            h('div',{style:{fontSize:'11px',fontWeight:700,opacity:.85,marginBottom:'4px'}},'총 한도'),
            h('div',{style:{fontSize:'22px',fontWeight:800,fontFamily:'monospace'}},limitM.toFixed(1)),
            h('div',{style:{fontSize:'10px',marginTop:'3px',opacity:.75}},'개월 (= 약 '+limitW+'주)')),
          h('div',{style:rbStyle('#fef3c7','#92400e')},
            h('div',{style:{fontSize:'11px',fontWeight:700,opacity:.85,marginBottom:'4px'}},'사용'),
            h('div',{style:{fontSize:'22px',fontWeight:800,fontFamily:'monospace'}},usedMonths.toFixed(1)),
            h('div',{style:{fontSize:'10px',marginTop:'3px',opacity:.75}},'개월 ('+usedDays+'평일 = '+usedWeeksSum.toFixed(1)+'주)')),
          h('div',{style:rbStyle('#dcfce7','#065f46')},
            h('div',{style:{fontSize:'11px',fontWeight:700,opacity:.85,marginBottom:'4px'}},'✅ 잔여'),
            h('div',{style:{fontSize:'22px',fontWeight:800,fontFamily:'monospace'}},remainM.toFixed(1)),
            h('div',{style:{fontSize:'10px',marginTop:'3px',opacity:.75}},'개월 (= 약 '+remainW+'주)'))
        ),
        h('div', { style:{padding:'0 16px 14px'} },
          h('div', { style:{display:'flex',justifyContent:'space-between',fontSize:'11px',color:'#64748b',marginBottom:'5px'} },
            h('span', null, '사용 '+pct+'%'), h('span', null, remainM.toFixed(1)+'개월 · '+remainW+'주 남음')),
          h('div', { style:{height:'14px',background:'#f1f5f9',borderRadius:'8px',overflow:'hidden'} },
            h('div', { style:{height:'100%',width:pct+'%',background:'linear-gradient(90deg,#f59e0b,#f97316)',borderRadius:'8px'} }))
        ),
        h('div', { style:{padding:'0 16px 16px'} },
          h('div', { style:{fontSize:'12px',fontWeight:800,color:'#7c3aed',marginBottom:'8px'} }, '👶 분할 사용 내역'+(yearNum?' ('+yearNum+'년)':' (전체)')),
          h('table', { style:{width:'100%',borderCollapse:'collapse'} },
            h('thead', null, h('tr', null,
              h('th',{style:{background:'#faf5ff',color:'#6b21a8',fontSize:'11px',fontWeight:700,padding:'6px 8px',textAlign:'left',borderBottom:'1px solid #e9d5ff',width:'50px'}},'회차'),
              h('th',{style:{background:'#faf5ff',color:'#6b21a8',fontSize:'11px',fontWeight:700,padding:'6px 8px',textAlign:'left',borderBottom:'1px solid #e9d5ff'}},'사용 기간'),
              h('th',{style:{background:'#faf5ff',color:'#6b21a8',fontSize:'11px',fontWeight:700,padding:'6px 8px',textAlign:'right',borderBottom:'1px solid #e9d5ff',width:'60px'}},'평일'),
              h('th',{style:{background:'#faf5ff',color:'#6b21a8',fontSize:'11px',fontWeight:700,padding:'6px 8px',textAlign:'right',borderBottom:'1px solid #e9d5ff',width:'60px'}},'주'),
              h('th',{style:{background:'#faf5ff',color:'#6b21a8',fontSize:'11px',fontWeight:700,padding:'6px 8px',textAlign:'right',borderBottom:'1px solid #e9d5ff',width:'70px'}},'개월'),
              h('th',{style:{background:'#faf5ff',color:'#6b21a8',fontSize:'11px',fontWeight:700,padding:'6px 8px',textAlign:'left',borderBottom:'1px solid #e9d5ff',width:'60px'}},'상태')
            )),
            h('tbody', null,
              (rows.length===0
                ? [h('tr', {key:'e'}, h('td', {colSpan:6, style:{textAlign:'center',color:'#94a3b8',padding:'24px',fontSize:'12px'}}, '해당 기간에 육아휴직 기록이 없습니다'))]
                : rows.map(function(r){ return h('tr', {key:r.n},
                    h('td',{style:{padding:'7px 8px',fontFamily:'monospace',fontWeight:700,fontSize:'11.5px',borderBottom:'1px solid #f5f3ff'}},r.n+'차'),
                    h('td',{style:{padding:'7px 8px',fontSize:'11.5px',borderBottom:'1px solid #f5f3ff'}},r.period),
                    h('td',{style:{padding:'7px 8px',fontFamily:'monospace',fontWeight:700,fontSize:'11.5px',textAlign:'right',borderBottom:'1px solid #f5f3ff'}},r.bdays),
                    h('td',{style:{padding:'7px 8px',fontFamily:'monospace',fontWeight:700,fontSize:'11.5px',textAlign:'right',color:'#2563eb',borderBottom:'1px solid #f5f3ff'}},r.wk.toFixed(1)),
                    h('td',{style:{padding:'7px 8px',fontFamily:'monospace',fontWeight:700,fontSize:'11.5px',textAlign:'right',borderBottom:'1px solid #f5f3ff'}},r.mo.toFixed(1)),
                    h('td',{style:{padding:'7px 8px',fontSize:'10px',color:r.status==='진행중'?'#dc2626':'#059669',borderBottom:'1px solid #f5f3ff'}},r.status)
                  ); }).concat([h('tr', {key:'tot'},
                    h('td',{colSpan:2,style:{padding:'7px 8px',background:'#faf5ff',fontWeight:800,color:'#6b21a8',borderTop:'2px solid #d8b4fe'}},'사용 합계'),
                    h('td',{style:{padding:'7px 8px',background:'#faf5ff',fontFamily:'monospace',fontWeight:800,color:'#6b21a8',textAlign:'right',borderTop:'2px solid #d8b4fe'}},usedDays),
                    h('td',{style:{padding:'7px 8px',background:'#faf5ff',fontFamily:'monospace',fontWeight:800,color:'#6b21a8',textAlign:'right',borderTop:'2px solid #d8b4fe'}},usedWeeksSum.toFixed(1)),
                    h('td',{style:{padding:'7px 8px',background:'#faf5ff',fontFamily:'monospace',fontWeight:800,color:'#6b21a8',textAlign:'right',borderTop:'2px solid #d8b4fe'}},usedMonths.toFixed(1)),
                    h('td',{style:{background:'#faf5ff',borderTop:'2px solid #d8b4fe'}})
                  )])
              )
            )
          ),
          h('div', { style:{background:'#fffbeb',border:'1px solid #fde68a',borderRadius:'6px',padding:'8px 12px',fontSize:'11px',color:'#92400e',marginTop:'10px'} },
            '⚙️ 한도(1년/1년6개월)는 근로자명부 → 해당 직원 → 육아휴직 한도에서 지정합니다.')
        )
      )
    );
  }

  return h('div', null,
    h('div', { style:{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'12px'} },
      h('div', null,
        h('div', { style:{fontSize:'14px',fontWeight:700,color:'#1e293b'} }, '🏠 휴직 관리'),
        h('div', { style:{fontSize:'11.5px',color:'#94a3b8',marginTop:'2px'} }, '출산휴직 · 육아휴직 · 병가 · 기타 — LoA 시스템 + 환경설정 status=\'leave\' 통합 동기화')
      ),
      h('button', { onClick:openAdd,
        style:{padding:'6px 12px',background:'#1e40af',color:'#fff',border:'none',borderRadius:'5px',cursor:'pointer',fontSize:'11.5px',fontWeight:600} },
        '+ 휴직 등록')
    ),
    // 서브탭
    h('div', { style:{display:'flex',gap:'4px',marginBottom:'14px',borderBottom:'2px solid #e2e8f0'} },
      [{v:'list',label:'📋 전체 목록'},{v:'parental',label:'👶 육아휴직 현황'}].map(function(t){
        var on = subTab===t.v;
        return h('button', { key:t.v, onClick:function(){setSubTab(t.v);},
          style:{padding:'8px 14px',fontSize:'12px',fontWeight:700,cursor:'pointer',border:'none',background:'none',
            color:on?'#2563eb':'#94a3b8',borderBottom:'2px solid '+(on?'#2563eb':'transparent'),marginBottom:'-2px'} }, t.label);
      })
    ),
    subTab==='parental' ? renderParentalStatus() : null,
    subTab!=='list' ? null : (function(){ return h('div', null,
    // 통합 통계
    (function(){
      var allUsers = dbGet('user_accounts', USERS_SEED);
      var statusLeaveUsers = allUsers.filter(function(u){return u.status==='leave';});
      var activeLoa = leaves.filter(function(x){return x.status!=='ended';});
      var endedLoa = leaves.filter(function(x){return x.status==='ended';});
      // 동기화 불일치 감지 (status=leave인데 활성 LoA 없는 사용자)
      var inconsistent = statusLeaveUsers.filter(function(u){
        return !activeLoa.find(function(l){return l.sid===u.sid;});
      });
      return h('div', { style:{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:'5px',marginBottom:'8px'} },
        h('div', { style:{background:'#fff7ed',border:'1px solid #fed7aa',borderRadius:'6px',padding:'5px 8px'} },
          h('div', { style:{fontSize:'9px',color:'#9a3412',fontWeight:600} }, '🏠 현재 휴직중'),
          h('div', { style:{fontSize:'11px',fontWeight:800,color:'#9a3412'} }, activeLoa.length+'명')),
        h('div', { style:{background:'#f1f5f9',border:'1px solid #cbd5e1',borderRadius:'6px',padding:'5px 8px'} },
          h('div', { style:{fontSize:'9px',color:'#475569',fontWeight:600} }, '✓ 휴직 종료(복귀)'),
          h('div', { style:{fontSize:'11px',fontWeight:800,color:'#475569'} }, endedLoa.length+'건')),
        h('div', { style:{background:'#ecfeff',border:'1px solid #bfdbfe',borderRadius:'6px',padding:'5px 8px'} },
          h('div', { style:{fontSize:'9px',color:'#2563eb',fontWeight:600} }, '⚙️ status=leave'),
          h('div', { style:{fontSize:'11px',fontWeight:800,color:'#2563eb'} }, statusLeaveUsers.length+'명')),
        inconsistent.length > 0
          ? h('div', { style:{background:'#fef2f2',border:'1px solid #fca5a5',borderRadius:'6px',padding:'5px 8px'} },
              h('div', { style:{fontSize:'9px',color:'#991b1b',fontWeight:600} }, '⚠️ 동기화 불일치'),
              h('div', { style:{fontSize:'11px',fontWeight:800,color:'#991b1b'} }, inconsistent.length+'명'),
              h('div', { style:{fontSize:'9px',color:'#991b1b',marginTop:'3px',marginBottom:'5px'} },
                inconsistent.map(function(u){return u.name||u.sid;}).join(', ')),
              h('div', { style:{display:'flex',gap:'4px',marginTop:'4px'} },
                // 옵션 1: 재직 복귀 (LoA 기록 없음 → user 상태도 active로)
                h('button', { onClick:async function(){
                    if(!(await popConfirm(inconsistent.length+'명의 사용자를 [재직]으로 변경하시겠습니까?\n\n→ '+inconsistent.map(function(u){return u.name||u.sid;}).join(', ')+'\n\n※ LoA 기록 없으니 휴직 상태 해제됩니다.'))) return;
                    var allUsers2 = dbGet('user_accounts', USERS_SEED);
                    var updated = allUsers2.map(function(u){
                      if(inconsistent.find(function(i){return i.sid===u.sid;})){
                        return Object.assign({}, u, { status:'active', leaveReason:'', leaveStartDate:'', leaveEndDate:'' });
                      }
                      return u;
                    });
                    dbSet('user_accounts', updated);
                    // 감사 로그
                    if(typeof AuditLog !== 'undefined' && AuditLog.write){
                      inconsistent.forEach(function(u){
                        AuditLog.write('user', u.sid, 'status', 'leave', 'active', '동기화 불일치 정리 (LoA 없음 → 재직 복귀)');
                      });
                    }
                    showToast(inconsistent.length+'명 재직 복귀 — 새로고침 시 반영');
                    setTimeout(function(){ window.location.reload(); }, 600);
                  },
                  style:{flex:1,padding:'4px 6px',background:'#dcfce7',color:'#166534',border:'1px solid #86efac',borderRadius:'5px',cursor:'pointer',fontSize:'10.5px',fontWeight:700} },
                  '✓ 재직 복귀'),
                // 옵션 2: LoA 자동 등록 (기존 동작)
                h('button', { onClick:async function(){
                    if(!(await popConfirm(inconsistent.length+'명에 대해 LoA(휴직 기록)을 자동 등록하시겠습니까?\n\n→ 기타 사유로 등록됩니다.'))) return;
                    var today = todayYMD();
                    var add = inconsistent.map(function(u){
                      return {
                        id:'lv-auto-'+u.sid+'-'+Date.now(),
                        sid:u.sid, code:'personal',
                        startDate: u.leaveStartDate || today,
                        endDate: u.leaveEndDate || '',
                        reason: u.leaveReason || '환경설정에서 자동 동기화',
                        status:'active',
                        createdAt:(new Date()).toISOString(),
                        createdBy: CURRENT_USER ? CURRENT_USER.name : '',
                        typeLabel:'기타', paidType:'', payrollPause:false
                      };
                    });
                    persist(leaves.concat(add));
                    showToast(add.length+'건 LoA 자동 등록');
                  },
                  style:{flex:1,padding:'4px 6px',background:'#fef3c7',color:'#854d0e',border:'1px solid #fde68a',borderRadius:'5px',cursor:'pointer',fontSize:'10.5px',fontWeight:700} },
                  '🏠 LoA 등록')))
          : h('div', { style:{background:'#f0fdf4',border:'1px solid #bbf7d0',borderRadius:'6px',padding:'10px 12px'} },
              h('div', { style:{fontSize:'10.5px',color:'#16a34a',fontWeight:600} }, '✓ 동기화 정상'),
              h('div', { style:{fontSize:'13px',fontWeight:800,color:'#16a34a'} }, '✓'))
      );
    })(),
    h('div', { style:{border:'1px solid #e2e8f0',borderRadius:'8px',overflow:'hidden',background:'#fff'} },
      h('table', { style:{width:'100%',borderCollapse:'collapse',fontSize:'11.5px'} },
        h('thead', null, h('tr', null,
          h('th', { style:thS }, '직원'),
          h('th', { style:thS }, '종류'),
          h('th', { style:thS }, '시작일'),
          h('th', { style:thS }, '종료일'),
          h('th', { style:thS }, '사유'),
          h('th', { style:Object.assign({},thS,{textAlign:'center'}) }, '상태'),
          h('th', { style:Object.assign({},thS,{textAlign:'center',width:'92px'}) }, '관리')
        )),
        h('tbody', null,
          leaves.length === 0
            ? h('tr', null, h('td', { colSpan:7, style:{padding:'30px',textAlign:'center',color:'#94a3b8'} }, '휴직 기록 없음'))
            : leaves.slice().sort(function(a,b){return (b.startDate||'').localeCompare(a.startDate||'');}).map(function(it){
                var u = users.find(function(x){return x.sid===it.sid;});
                if(!u){ u = dbGet('user_accounts', USERS_SEED).find(function(x){return x.sid===it.sid;}); }
                var name = u ? u.name : it.sid;
                var label = (policyMap[it.code] && policyMap[it.code].name) || it.typeLabel || it.code || '-';
                return h('tr', { key:it.id },
                  h('td', { style:Object.assign({},tdS,{fontWeight:700}) }, name,
                    h('span', { style:{color:'#94a3b8',fontSize:'10px',marginLeft:'5px',fontWeight:400} }, it.sid)),
                  h('td', { style:tdS },
                    h('span', { style:{background:TYPE_BG[it.code]||'#f1f5f9',color:TYPE_FG[it.code]||'#475569',padding:'2px 8px',borderRadius:'8px',fontSize:'10.5px',fontWeight:700} }, label)),
                  h('td', { style:Object.assign({},tdS,{fontFamily:'monospace'}) }, it.startDate||'-'),
                  h('td', { style:Object.assign({},tdS,{fontFamily:'monospace'}) }, it.endDate||'-',
                    it.code==='parental-leave' && it.startDate && it.endDate && h('div', { style:{fontSize:'10px',color:'#2563eb',fontWeight:700,marginTop:'1px',fontFamily:'inherit'} },
                      '🍼 ' + loaUsageText(it.startDate, it.endDate, it.unit||'month'))),
                  h('td', { style:Object.assign({},tdS,{color:'#64748b',maxWidth:'240px',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}) }, it.reason||'-'),
                  h('td', { style:Object.assign({},tdS,{textAlign:'center'}) },
                    h('span', { style:{background:it.status==='ended'?'#f1f5f9':'#dcfce7',color:it.status==='ended'?'#64748b':'#166534',padding:'2px 8px',borderRadius:'8px',fontSize:'10.5px',fontWeight:700} }, it.status==='ended'?'종료':'진행중')),
                  h('td', { style:Object.assign({},tdS,{textAlign:'center',whiteSpace:'nowrap'}) },
                    h('div', { style:{display:'inline-flex',gap:'3px',alignItems:'center'} },
                      it.status !== 'ended' && h('button', { onClick:function(){endLeave(it);},
                        title:'휴직 종료 → 재직 복귀',
                        style:{padding:'2px 7px',background:'#dcfce7',color:'#166534',border:'1px solid #86efac',borderRadius:'5px',fontSize:'10.5px',fontWeight:600,cursor:'pointer'} }, '↩ 복귀'),
                      h('button', { onClick:function(){openEdit(it);},
                        style:{padding:'2px 7px',background:'#dbeafe',color:'#1e40af',border:'1px solid #93c5fd',borderRadius:'5px',fontSize:'10.5px',fontWeight:600,cursor:'pointer'} }, '수정'),
                      h('button', { onClick:function(){del(it.id);},
                        style:{padding:'2px 7px',background:'#fee2e2',color:'#991b1b',border:'1px solid #fca5a5',borderRadius:'5px',fontSize:'10.5px',fontWeight:600,cursor:'pointer'} }, '삭제')
                    ))
                );
              })
        )
      )
    )
    ); })(),
    modal && h('div', { className:'modal-bg', onClick:function(){setModal(null);} },
      h('div', { className:'modal', style:{width:'460px'}, onClick:function(e){e.stopPropagation();} },
        h('div', { className:'modal-h' },
          h('div', { className:'t' }, modal.isNew ? '🏠 휴직 등록' : '🏠 휴직 수정'),
          h('button', { className:'x', onClick:function(){setModal(null);} }, '×')
        ),
        h('div', { className:'modal-b' },
          // ★ 선택된 직원 기본정보 카드 (신규 등록 시 select 통합)
          (function(){
            var selUser = users.find(function(u){return u.sid===modal.item.sid;});
            if(!selUser) return null;
            var infoS = { display:'flex', alignItems:'center', gap:'6px', fontSize:'11px' };
            var labelS = { color:'#94a3b8', fontWeight:600, minWidth:'52px' };
            var valS = { color:'#1e293b', fontWeight:600 };
            return h('div', { style:{background:'#f8fafc',border:'1px solid #e2e8f0',borderRadius:'6px',padding:'10px 14px',marginBottom:'10px'} },
              h('div', { style:{display:'flex',alignItems:'center',gap:'8px',marginBottom:'8px',paddingBottom:'8px',borderBottom:'1px solid #e2e8f0'} },
                h('div', { style:{width:'32px',height:'32px',borderRadius:'50%',background:'#dbeafe',color:'#1e40af',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:800,fontSize:'13px',flexShrink:0} },
                  (selUser.name||'?').slice(0,1)),
                h('div', { style:{flex:1,minWidth:0} },
                  modal.isNew
                    ? h('select', { value:modal.item.sid,
                        onChange:function(e){setModal({isNew:modal.isNew,item:Object.assign({},modal.item,{sid:e.target.value})});},
                        style:{width:'100%',padding:'4px 6px',border:'1px solid #cbd5e1',borderRadius:'4px',fontSize:'13px',fontWeight:700,color:'#1e293b',background:'#fff'} },
                        users.map(function(u){ return h('option', { key:u.sid, value:u.sid }, u.name+' ('+u.sid+')'); }))
                    : h('div', { style:{fontSize:'13px',fontWeight:700,color:'#1e293b'} },
                        selUser.name,
                        h('span', { style:{fontSize:'10px',color:'#64748b',marginLeft:'6px',fontWeight:500,fontFamily:'monospace'} }, selUser.sid)),
                  h('div', { style:{fontSize:'10.5px',color:'#64748b',marginTop:'3px'} },
                    (selUser.title||'-') + ' · ' + (selUser.branch||'-')))),
              h('div', { style:{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'5px 14px'} },
                selUser.hireDate && h('div', { style:infoS },
                  h('span', { style:labelS }, '입사일'),
                  h('span', { style:valS }, selUser.hireDate)),
                selUser.birthDate && h('div', { style:infoS },
                  h('span', { style:labelS }, '생년월일'),
                  h('span', { style:valS }, selUser.birthDate)),
                selUser.phone && h('div', { style:infoS },
                  h('span', { style:labelS }, '연락처'),
                  h('span', { style:valS }, selUser.phone)),
                selUser.email && h('div', { style:infoS },
                  h('span', { style:labelS }, '이메일'),
                  h('span', { style:valS }, selUser.email)),
                selUser.contractType && h('div', { style:infoS },
                  h('span', { style:labelS }, '고용형태'),
                  h('span', { style:valS }, selUser.contractType)),
                selUser.dependents != null && h('div', { style:infoS },
                  h('span', { style:labelS }, '부양가족'),
                  h('span', { style:valS }, selUser.dependents+'명'))));
          })(),
          h('div', { className:'fld' },
            h('label', null, '종류'),
            h('select', { value:modal.item.code,
              onChange:function(e){setModal({isNew:modal.isNew,item:Object.assign({},modal.item,{code:e.target.value})});},
              style:{width:'100%'} },
              TYPES.map(function(t){ return h('option', { key:t.code, value:t.code }, t.label); }))
          ),
          (policyMap[modal.item.code] && policyMap[modal.item.code].childRequired) && h('div', { className:'fld' },
            h('label', null, '자녀 출생일'),
            h('input', { type:'date', value:modal.item.childBirthDate||'',
              onChange:function(e){setModal({isNew:modal.isNew,item:Object.assign({},modal.item,{childBirthDate:e.target.value})});},
              style:{width:'100%'} })
          ),
          modal.item.code === 'sick-leave' && h('div', { className:'fld' },
            h('label', null, '유급 / 무급'),
            h('select', { value: modal.item.paidType==='유급' ? '유급' : '무급',
              onChange:function(e){
                var pt = e.target.value;
                setModal({isNew:modal.isNew, item:Object.assign({}, modal.item, {paidType:pt, payrollPause: pt!=='유급'})});
              },
              style:{width:'100%'} },
              h('option', { value:'무급' }, '무급 (월별급여 자동 정지)'),
              h('option', { value:'유급' }, '유급 (기본급·성과급 정상 반영)'))
          ),
          modal.item.code === 'sick-leave' && modal.item.paidType === '유급' && h('div', { className:'fld' },
            h('label', null, '유급 종료일 (선택)'),
            h('input', { type:'date', value:modal.item.paidUntil||'',
              onChange:function(e){setModal({isNew:modal.isNew,item:Object.assign({},modal.item,{paidUntil:e.target.value})});},
              style:{width:'100%'} }),
            h('div', { style:{fontSize:'10px',color:'#64748b',marginTop:'3px'} },
              '비워두면 휴직 종료일까지 전체 유급. 지정 시 해당일까지 유급, 이후 무급(월 단위 판정).')
          ),
          h('div', { className:'fld' },
            h('label', null, '시작일'),
            h('input', { type:'date', value:modal.item.startDate||'',
              onChange:function(e){setModal({isNew:modal.isNew,item:Object.assign({},modal.item,{startDate:e.target.value})});},
              style:{width:'100%'} })
          ),
          h('div', { className:'fld' },
            h('label', null, '종료일'),
            h('input', { type:'date', value:modal.item.endDate||'',
              onChange:function(e){setModal({isNew:modal.isNew,item:Object.assign({},modal.item,{endDate:e.target.value})});},
              style:{width:'100%'} })
          ),
          modal.item.code === 'parental-leave' && h('div', { className:'fld' },
            h('label', null, '사용 단위'),
            h('select', { value:modal.item.unit||'month',
              onChange:function(e){setModal({isNew:modal.isNew,item:Object.assign({},modal.item,{unit:e.target.value})});},
              style:{width:'100%'} },
              h('option', { value:'day' },   '일 단위'),
              h('option', { value:'week' },  '주 단위'),
              h('option', { value:'month' }, '월 단위')),
            modal.item.startDate && modal.item.endDate && h('div', { style:{marginTop:'6px',padding:'8px 12px',background:'#fef3c7',border:'1px solid #fde68a',borderRadius:'5px',fontSize:'11px',color:'#854d0e'} },
              '🍼 이번 회차 사용량: ', h('strong', null, loaUsageText(modal.item.startDate, modal.item.endDate, modal.item.unit||'month')),
              (function(){
                var used = getLoaSplitUsed(modal.item.sid, 'parental-leave', modal.item.childBirthDate);
                var usedDays = getLoaSplitUsedDays(modal.item.sid, 'parental-leave', modal.item.childBirthDate);
                return h('div', { style:{marginTop:'4px',fontSize:'10px',color:'#92400e'} },
                  '누적 사용(같은 자녀 기준): ' + usedDays + '일 · ' + Math.round(used*10)/10 + '개월');
              })())
          ),
          h('div', { className:'fld' },
            h('label', null, '상태'),
            h('select', { value:modal.item.status||'active',
              onChange:function(e){setModal({isNew:modal.isNew,item:Object.assign({},modal.item,{status:e.target.value})});},
              style:{width:'100%'} },
              h('option', { value:'active' }, '진행중'),
              h('option', { value:'ended' }, '종료'))
          ),
          h('div', { className:'fld' },
            h('label', null, '사유'),
            h('textarea', { value:modal.item.reason||'',
              onChange:function(e){setModal({isNew:modal.isNew,item:Object.assign({},modal.item,{reason:e.target.value})});},
              rows:3, style:{width:'100%'} })
          ),
          policyMap[modal.item.code] && h('div', { style:{padding:'8px 12px',background:'#f0f9ff',borderRadius:'5px',fontSize:'10.5px',color:'#1e40af',marginTop:'4px'} },
            '💡 ', h('strong', null, ((modal.item.code==='sick-leave' && modal.item.paidType) ? modal.item.paidType : (policyMap[modal.item.code].paidType||'-'))),
            ' / 월별급여 ',
            (((modal.item.code==='sick-leave' && modal.item.paidType) ? (modal.item.paidType !== '유급') : policyMap[modal.item.code].payrollPause)
              ? h('strong', {style:{color:'#dc2626'}}, '자동 정지')
              : h('strong', null, '계속 지급')))
        ),
        h('div', { className:'modal-f' },
          h('div', { style:{flex:1} }),
          h('button', { className:'btn-secondary', onClick:function(){setModal(null);} }, '취소'),
          h('button', { className:'btn-primary', onClick:save }, '저장')
        )
      )
    )
  );
}

// ============================================================
// 휴가관리 (LeaveManagement) - 연차 자동부여 + 사용/잔여 관리
// 데이터: leave_grants {sid: {2026: {total:15, carryOver:0}}} (수동 오버라이드)
//        attendance_records 에서 연차/반차/시간연차 집계
//        policy_leave 정책 (입사일 기준 자동 부여)
// ============================================================
var LEAVE_LEDGER_SEED = [{"name": "최기운", "year": 2022, "granted": 26, "used": 13, "remain": 4, "monthly": "2월:1, 5월:1, 11월:5, 12월:6", "note": "23.05까지 / 회계기준 13.8일"}, {"name": "박성수", "year": 2022, "granted": 25, "used": 10.5, "remain": 10, "monthly": "2월:0.5, 3월:1, 6월:0.5, 8월:2, 10월:0.5, 11월:1, 12월:5", "note": "23.05까지 / 회계기준 13.8일"}, {"name": "김보람", "year": 2022, "granted": 26, "used": 10.5, "remain": 10, "monthly": "3월:1, 5월:2, 7월:3, 9월:0.5, 11월:1, 12월:3", "note": "23.05까지 / 회계기준 13.8일"}, {"name": "장한돌", "year": 2022, "granted": 26, "used": 10.5, "remain": 11, "monthly": "1월:1, 2월:0.5, 3월:1, 4월:0.5, 6월:2, 8월:1, 9월:1.5, 11월:1, 12월:2", "note": "23.05까지 / 회계기준 13.8일"}, {"name": "신욱임", "year": 2022, "granted": 15, "used": 5, "remain": 10, "monthly": "11월:2, 12월:3", "note": "23.05까지"}, {"name": "주민정", "year": 2022, "granted": 6, "used": 4, "remain": 2, "monthly": "10월:1, 11월:1, 12월:2", "note": "23.06까지"}, {"name": "최기운", "year": 2023, "granted": 15, "used": 15, "remain": 0, "monthly": "3월:1, 8월:4, 11월:4, 12월:6", "note": ""}, {"name": "박성수", "year": 2023, "granted": 15, "used": 11, "remain": 4, "monthly": "1월:2, 2월:0.5, 6월:0.5, 7월:1, 8월:1, 9월:1, 10월:1, 12월:4", "note": ""}, {"name": "김보람", "year": 2023, "granted": 15, "used": 12.5, "remain": 2.5, "monthly": "2월:1, 3월:1.5, 4월:1, 5월:0.5, 7월:1, 8월:1.5, 9월:0.5, 10월:3.5, 12월:2", "note": ""}, {"name": "장한돌", "year": 2023, "granted": 15, "used": 22.5, "remain": -7.5, "monthly": "1월:1.5, 2월:1, 3월:0.5, 4월:0.5, 6월:1, 7월:0.5, 8월:1, 10월:0.5, 11월:1, 12월:15", "note": ""}, {"name": "신욱임", "year": 2023, "granted": 15, "used": 22, "remain": -4, "monthly": "1월:7, 4월:1.5, 5월:3, 6월:0.5, 8월:4, 10월:6", "note": "대체휴가 3일 추가하여 초과사용 4일"}, {"name": "주민정", "year": 2023, "granted": 15, "used": 21.5, "remain": -6.5, "monthly": "1월:1, 2월:1, 3월:1, 4월:2, 5월:1, 6월:1, 7월:2, 8월:3, 9월:6, 10월:1, 11월:1.5, 12월:1", "note": ""}, {"name": "남정의", "year": 2023, "granted": 6, "used": 8, "remain": -2, "monthly": "4월:1, 5월:1, 7월:1, 8월:0.5, 9월:0.5, 10월:2, 11월:2", "note": ""}, {"name": "박지호", "year": 2023, "granted": 9, "used": 9.5, "remain": -0.5, "monthly": "4월:1, 6월:1, 7월:1, 8월:1, 9월:2, 10월:0.5, 11월:2, 12월:1", "note": ""}, {"name": "최기운", "year": 2024, "granted": 15, "used": 12, "remain": 3, "monthly": "1월:1, 3월:1, 5월:1, 8월:1, 9월:2, 12월:6", "note": ""}, {"name": "박성수", "year": 2024, "granted": 15, "used": 15.5, "remain": -0.5, "monthly": "1월:4, 2월:0.5, 3월:0.5, 4월:1.5, 5월:1, 6월:0.5, 8월:4, 10월:1.5, 12월:2", "note": ""}, {"name": "김보람", "year": 2024, "granted": 15, "used": 11, "remain": 4, "monthly": "1월:0.5, 2월:1, 4월:1, 5월:1, 6월:0.5, 7월:1.5, 8월:0.5, 9월:1.5, 10월:1, 11월:1, 12월:1.5", "note": ""}, {"name": "신욱임", "year": 2024, "granted": 15, "used": 15, "remain": 0, "monthly": "1월:2, 2월:2, 4월:1, 6월:5, 8월:1, 9월:1, 10월:1, 12월:2", "note": ""}, {"name": "주민정", "year": 2024, "granted": 15, "used": 15.5, "remain": -0.5, "monthly": "1월:2, 2월:2, 4월:0.5, 5월:3, 6월:3, 7월:3, 8월:1, 11월:1", "note": ""}, {"name": "박지호", "year": 2024, "granted": 15, "used": 16.5, "remain": 0, "monthly": "1월:1, 2월:1.5, 3월:3.5, 4월:8.5, 5월:2", "note": ""}, {"name": "박한별", "year": 2024, "granted": 13, "used": 6.5, "remain": 6.5, "monthly": "3월:0.5, 5월:0.5, 8월:1, 9월:1.5, 10월:1.5, 11월:1.5", "note": "23년 1일 + 24년 12일"}, {"name": "김동근", "year": 2024, "granted": 10, "used": 8, "remain": 2, "monthly": "6월:0.5, 7월:1, 8월:4, 9월:0.5, 11월:1, 12월:1", "note": "24년 2월 집체교육으로 휴직"}, {"name": "김정현", "year": 2024, "granted": 7, "used": 11.5, "remain": -4.5, "monthly": "6월:1, 7월:2, 8월:1, 10월:3.5, 11월:2.5, 12월:1.5", "note": "25년 1월 1일 14일"}, {"name": "최기운", "year": 2025, "granted": 16, "used": 17, "remain": 2, "monthly": "1월:1, 2월:1, 3월:2, 4월:1, 5월:2, 9월:1, 11월:2, 12월:7", "note": ""}, {"name": "박성수", "year": 2025, "granted": 16, "used": 35.5, "remain": -20, "monthly": "1월:1.5, 3월:1, 4월:2, 5월:1, 6월:1.5, 8월:5, 9월:2, 10월:3, 11월:1.5, 12월:17", "note": "배우자 출산휴가 20일 추가 (사용완료)"}, {"name": "김보람", "year": 2025, "granted": 16, "used": 15.5, "remain": 4.5, "monthly": "1월:1, 2월:1.5, 3월:2, 5월:1.5, 6월:1, 7월:2.5, 9월:1, 10월:1.5, 11월:2, 12월:1.5", "note": "보상휴가 계산해볼것"}, {"name": "신욱임", "year": 2025, "granted": 16, "used": 25, "remain": -9, "monthly": "1월:2, 2월:2/11 반차(보상휴가), 3월:1, 4월:5.5, 5월:1, 6월:1, 7월:1, 8월:2, 9월:1, 10월:3.5, 11월:5, 12월:2", "note": "2월 외에 보상휴가 계산해보고 적용할것  → 11/3 연장 3.5시간 보상휴가 *1.5 = 5.25시간"}, {"name": "주민정", "year": 2025, "granted": 15, "used": 16, "remain": -1.5, "monthly": "2월:1.5, 3월:2, 4월:1, 5월:5.5, 7월:1.5, 9월:3, 10월:1, 12월:0.5", "note": ""}, {"name": "박한별", "year": 2025, "granted": 15, "used": 14, "remain": 7.5, "monthly": "1월:3, 4월:1.5, 5월:1, 6월:1.5, 7월:0.5, 9월:1.5, 11월:2, 12월:3", "note": ""}, {"name": "김동근", "year": 2025, "granted": 15, "used": 17, "remain": 0, "monthly": "1월:1, 2월:2, 3월:14", "note": "전년합산하여 잔여연차 없음"}, {"name": "김정현", "year": 2025, "granted": 3, "used": -1.5, "remain": 0, "monthly": "2월:2, 3월:-3.5", "note": "전년합산하여 잔여연차 없음"}, {"name": "김혜민", "year": 2025, "granted": 10, "used": 11, "remain": -1, "monthly": "4월:1.5, 5월:0.5, 6월:2, 7월:1.5, 8월:1, 9월:1, 10월:1, 11월:2, 12월:0.5", "note": "12/22 육아휴직 → 일정 조정 여쭤볼 것"}, {"name": "박재원", "year": 2025, "granted": 9, "used": 8, "remain": 1, "monthly": "6월:1, 7월:1, 8월:1.5, 9월:1, 10월:1, 11월:1.5, 12월:1", "note": ""}, {"name": "박은비", "year": 2025, "granted": 9, "used": 7.5, "remain": 1.5, "monthly": "4월:1, 7월:0.5, 8월:0.5, 9월:3.5, 11월:1, 12월:1", "note": ""}, {"name": "최기운", "year": 2026, "granted": 16, "used": 9, "remain": 12, "monthly": "1월:1, 2월:5, 3월:2, 4월:1", "note": "잔여연차 24년 3일 + 25년 2일"}, {"name": "박성수", "year": 2026, "granted": 16, "used": 16, "remain": 0, "monthly": "6월:16", "note": "이월 잔여연차 없음"}, {"name": "김보람", "year": 2026, "granted": 16, "used": 5, "remain": 19.5, "monthly": "1월:0.5, 3월:2, 4월:1.5, 5월:1", "note": "잔여연차 24년 4일 + 25년 4.5일"}, {"name": "신욱임", "year": 2026, "granted": 16, "used": 13.25, "remain": 2.75, "monthly": "1월:1, 2월:4.5, 3월:1, 4월:1.5, 5월:0.25, 6월:5", "note": ""}, {"name": "주민정", "year": 2026, "granted": 16, "used": 7, "remain": 9, "monthly": "2월:2, 3월:0.5, 4월:3.5, 6월:1", "note": ""}, {"name": "박한별", "year": 2026, "granted": 15, "used": 19, "remain": 10, "monthly": "1월:2, 3월:17", "note": "잔여연차 24년 6.5일 + 25년 7.5일"}, {"name": "김혜민", "year": 2026, "granted": 14.5, "used": 5.5, "remain": 9, "monthly": "5월:4.5, 6월:1", "note": ""}, {"name": "박재원", "year": 2026, "granted": 14.5, "used": 3.5, "remain": 11, "monthly": "1월:1, 4월:1, 5월:1.5", "note": ""}, {"name": "박은비", "year": 2026, "granted": 14.5, "used": 4.5, "remain": 10, "monthly": "1월:0.5, 2월:1.5, 3월:1, 4월:1, 5월:0.5", "note": ""}, {"name": "임혜미", "year": 2026, "granted": 3, "used": 3, "remain": 0, "monthly": "4월:1, 5월:2", "note": ""}, {"name": "김동현", "year": 2026, "granted": 9, "used": 0, "remain": 9, "monthly": "", "note": ""}];

function LeaveLedgerTab(){
  var s = useState(dbGet('leave_ledger', [])); var ledger = s[0]; var setLedger = s[1];
  function persist(next){ setLedger(next); dbSet('leave_ledger', next); }
  function importSeed(){
    if(ledger.length && !confirm('이미 연차대장 '+ledger.length+'건이 있습니다. 엑셀 대장('+LEAVE_LEDGER_SEED.length+'건, 2022~2026)으로 덮어쓸까요?')) return;
    persist(LEAVE_LEDGER_SEED.map(function(r){ return Object.assign({}, r); }));
    showToast('연차대장 '+LEAVE_LEDGER_SEED.length+'건 불러왔습니다');
  }
  function updField(name, year, field, value){
    persist(ledger.map(function(r){ if(r.name===name && r.year===year){ var c=Object.assign({},r); c[field]=value; return c; } return r; }));
  }
  var years = ledger.reduce(function(acc,r){ if(acc.indexOf(r.year)<0) acc.push(r.year); return acc; }, []).sort(function(a,b){ return b-a; });
  var th = {padding:'5px 8px',background:'#f8fafc',color:'#475569',fontWeight:700,fontSize:'11px',textAlign:'left',borderBottom:'2px solid #e2e8f0',whiteSpace:'nowrap'};
  var td = {padding:'3px 6px',borderBottom:'1px solid #f1f5f9',fontSize:'11.5px',verticalAlign:'top'};
  var inS = {width:'100%',padding:'2px 4px',border:'1px solid transparent',borderRadius:'4px',fontSize:'11.5px',textAlign:'right',fontFamily:'monospace',background:'transparent',boxSizing:'border-box'};
  function numInput(r, field){
    return h('input',{type:'text', value:(r[field]==null?'':r[field]),
      onFocus:function(e){ try{ e.target.select(); }catch(_){} },
      onChange:function(e){ var v=(e.target.value||'').trim(); updField(r.name,r.year,field, v===''?null:(isNaN(Number(v))?v:Number(v))); },
      style:inS});
  }
  return h('div',null,
    h('div',{style:{display:'flex',alignItems:'center',gap:'10px',marginBottom:'8px',flexWrap:'wrap'}},
      h('div',{style:{fontWeight:700,fontSize:'14px',color:'#1e293b'}},'📋 연차대장 (연도별 요약)'),
      h('button',{onClick:importSeed,style:{padding:'6px 12px',background:'#1e40af',color:'#fff',border:'none',borderRadius:'6px',cursor:'pointer',fontSize:'12px',fontWeight:700}},'📥 엑셀 대장 불러오기 (2022~2026)'),
      h('span',{style:{fontSize:'11px',color:'#94a3b8'}}, ledger.length ? ('총 '+ledger.length+'건') : '아직 비어 있음 — 불러오기를 누르세요')
    ),
    h('div',{style:{fontSize:'11px',color:'#64748b',marginBottom:'12px'}}, '※ 부여·사용·잔여·비고 칸을 클릭하면 바로 수정됩니다. 월별 내역은 참고용(읽기 전용).'),
    years.length===0
      ? h('div',{style:{padding:'24px',textAlign:'center',color:'#94a3b8',background:'#fff',border:'1px dashed #cbd5e1',borderRadius:'8px'}}, '데이터가 없습니다. 위 "엑셀 대장 불러오기"를 누르면 2022~2026 연차대장이 들어옵니다.')
      : years.map(function(y){
          var rows = ledger.filter(function(r){ return r.year===y; });
          var usedSum = rows.reduce(function(a,r){ return a+(typeof r.used==='number'?r.used:0); }, 0);
          return h('div',{key:y,style:{marginBottom:'18px'}},
            h('div',{style:{fontWeight:700,fontSize:'13px',color:'#1e40af',marginBottom:'4px'}}, y+'년  ·  '+rows.length+'명  ·  사용합계 '+(Math.round(usedSum*10)/10)+'일'),
            h('div',{style:{border:'1px solid #e2e8f0',borderRadius:'8px',overflow:'auto'}},
              h('table',{style:{width:'100%',borderCollapse:'collapse'}},
                h('thead',null,h('tr',null,
                  h('th',{style:Object.assign({},th,{width:'88px'})},'이름'),
                  h('th',{style:Object.assign({},th,{width:'62px',textAlign:'right'})},'부여'),
                  h('th',{style:Object.assign({},th,{width:'62px',textAlign:'right',background:'#fefce8'})},'사용'),
                  h('th',{style:Object.assign({},th,{width:'62px',textAlign:'right',background:'#ecfeff'})},'잔여'),
                  h('th',{style:Object.assign({},th,{minWidth:'230px'})},'월별 내역'),
                  h('th',{style:Object.assign({},th,{minWidth:'130px'})},'비고')
                )),
                h('tbody',null, rows.map(function(r,ri){
                  return h('tr',{key:r.name+'-'+ri},
                    h('td',{style:Object.assign({},td,{fontWeight:600,whiteSpace:'nowrap'})}, r.name),
                    h('td',{style:Object.assign({},td,{padding:'2px 4px'})}, numInput(r,'granted')),
                    h('td',{style:Object.assign({},td,{padding:'2px 4px',background:'#fefce8'})}, numInput(r,'used')),
                    h('td',{style:Object.assign({},td,{padding:'2px 4px',background:'#ecfeff'})}, numInput(r,'remain')),
                    h('td',{style:Object.assign({},td,{fontSize:'10.5px',color:'#64748b',whiteSpace:'normal'})}, r.monthly||'-'),
                    h('td',{style:Object.assign({},td,{padding:'2px 4px'})},
                      h('input',{type:'text',value:(r.note||''),
                        onFocus:function(e){ try{ e.target.select(); }catch(_){} },
                        onChange:function(e){ updField(r.name,r.year,'note', e.target.value); },
                        style:Object.assign({},inS,{textAlign:'left'})}))
                  );
                }))
              )
            )
          );
        })
  );
}

// 연차 사용촉진 단계·만료일 계산 (사용촉진 탭 + 연차/반차 목록 공용)
//   같은 leave_ledger·policy_leave·leave_promotion 데이터를 읽으므로 양쪽 결과가 항상 일치
function calcLeavePromoStage(hireDate, year){
  var pol = dbGet('policy_leave', {}) || {};
  var basis = pol.basis || 'joinDate';
  var fiscalMonth = Number(pol.fiscalMonth || 1) || 1;
  function pad(n){ return (n<10?'0':'')+n; }
  function fmt(d){ return d ? (d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())) : '—'; }
  function addMonths(d, m){ var x=new Date(d.getTime()); var day=x.getDate(); x.setMonth(x.getMonth()+m); if(x.getDate()<day) x.setDate(0); return x; }
  function lastDayOfMonth(y, mIdx){ return new Date(y, mIdx+1, 0); }
  function fiscalEnd(y){ if(fiscalMonth===1) return new Date(y, 11, 31); return lastDayOfMonth(y+1, fiscalMonth-2); }
  function joinExpiry(hd0, ref){
    if(!hd0) return null;
    var hd = new Date(hd0); if(isNaN(hd.getTime())) return null;
    var cand = new Date(ref.getFullYear(), hd.getMonth(), hd.getDate());
    if(cand.getTime() <= ref.getTime()) cand = new Date(ref.getFullYear()+1, hd.getMonth(), hd.getDate());
    return cand;
  }
  var today = new Date(); today.setHours(0,0,0,0);
  var expiry = (basis==='fiscalYear') ? fiscalEnd(Number(year)) : joinExpiry(hireDate, today);
  var p1=null, p2=null;
  if(expiry){ p1 = addMonths(expiry, -6); p2 = addMonths(expiry, -2); }
  var stage, sc;
  if(!expiry){ stage='입사일 없음'; sc='#94a3b8'; }
  else if(today < p1){ stage='대기'; sc='#94a3b8'; }
  else if(today < p2){ stage='1차 통보 시기'; sc='#d97706'; }
  else if(today < expiry){ stage='2차 통보 시기'; sc='#dc2626'; }
  else { stage='만료'; sc='#991b1b'; }
  var dday = expiry ? Math.ceil((expiry.getTime()-today.getTime())/86400000) : null;
  return { expiry:expiry, expiryStr:fmt(expiry), p1:p1, p2:p2, stage:stage, sc:sc, dday:dday };
}

// 사용촉진 통보서 인쇄창 (연차/반차 우측 상세 + 사용촉진 탭 공용)
//   r: {name, remain, expiry(Date)}, round: 1|2, opts.assign(2차 지정일)
//   반환: 인쇄 후 기록에 쓸 { todayStr } — 호출측이 통보일 기록
function printLeaveNotice(r, round, opts){
  opts = opts || {};
  function pad(n){ return (n<10?'0':'')+n; }
  function fmt(d){ return d ? (d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())) : '—'; }
  var today = new Date(); today.setHours(0,0,0,0);
  var todayStr = fmt(today);
  var remain = r.remain;
  var expS = fmt(r.expiry);
  var company = '푸른노무법인';
  var titleTxt, bodyHtml;
  if(round===1){
    var dl = new Date(today.getTime()); dl.setDate(dl.getDate()+10); var dlS = fmt(dl);
    titleTxt = '연차유급휴가 사용촉진 통보서 (1차)';
    bodyHtml = '<p>근로기준법 제61조에 따라 귀하의 미사용 연차유급휴가 사용을 촉진합니다. 아래 잔여 휴가에 대하여 <b>사용시기를 정하여 회신 기한까지 통보</b>하여 주시기 바랍니다.</p>'
      + '<table><tr><th>미사용 연차</th><td>' + remain + '일</td></tr>'
      + '<tr><th>사용기간(만료일)</th><td>' + expS + ' 까지</td></tr>'
      + '<tr><th>회신 기한</th><td>' + dlS + ' 까지 (사용시기 지정·통보)</td></tr></table>'
      + '<p class="warn">※ 회신 기한까지 사용시기를 통보하지 않으시면, 근로기준법 제61조에 따라 <b>사용자가 사용시기를 지정하여 통보</b>할 수 있습니다.</p>';
  } else {
    var assign = opts.assign || '';
    titleTxt = '연차유급휴가 사용시기 지정 통보서 (2차)';
    bodyHtml = '<p>근로기준법 제61조에 따라, 1차 사용촉진에도 사용시기를 통보하지 아니한 귀하의 미사용 연차유급휴가에 대하여 <b>사용자가 아래와 같이 사용시기를 지정</b>하여 통보합니다.</p>'
      + '<table><tr><th>미사용 연차</th><td>' + remain + '일</td></tr>'
      + '<tr><th>지정 사용일</th><td>' + assign + '</td></tr>'
      + '<tr><th>사용기간(만료일)</th><td>' + expS + ' 까지</td></tr></table>'
      + '<p class="warn">※ 지정된 사용일에 휴가를 사용하지 않을 경우, 해당 연차유급휴가는 소멸될 수 있습니다.</p>';
  }
  var w = window.open('', '_blank');
  if(!w){ try{ showToast('팝업이 차단되었습니다 — 팝업 허용 후 다시 시도하세요.'); }catch(_){ } return null; }
  var doc = '<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"><title>' + titleTxt + ' - ' + r.name + '</title>'
    + '<style>'
    + 'body{font-family:"맑은 고딕","Malgun Gothic","Apple SD Gothic Neo",sans-serif;color:#111;margin:25mm 20mm;line-height:1.7;font-size:13.5px;}'
    + '.title{font-size:20px;font-weight:800;text-align:center;letter-spacing:2px;margin:0 0 4px;}'
    + '.bar{height:3px;background:#1e40af;margin:0 0 18px;}'
    + '.meta{margin:0 0 12px;font-size:13px;} .meta b{display:inline-block;width:60px;}'
    + 'table{width:100%;border-collapse:collapse;margin:14px 0;}'
    + 'th,td{border:1px solid #333;padding:8px 12px;font-size:13.5px;} th{background:#f1f5f9;width:160px;text-align:left;}'
    + '.warn{color:#b91c1c;font-size:12.5px;} .foot{margin-top:36px;text-align:right;} .foot .d{margin-bottom:14px;} .foot .c{font-size:16px;font-weight:800;}'
    + '.noprint{text-align:right;margin-bottom:10px;} @media print{.noprint{display:none;} body{margin:18mm 16mm;}}'
    + '</style></head><body>'
    + '<div class="noprint"><button onclick="window.print()" style="padding:8px 16px;font-size:14px;cursor:pointer;">🖨 인쇄 / PDF 저장</button></div>'
    + '<div class="title">' + titleTxt + '</div><div class="bar"></div>'
    + '<div class="meta"><div><b>수신</b> ' + r.name + ' 귀하</div><div><b>발신</b> ' + company + '</div><div><b>통보일</b> ' + todayStr + '</div></div>'
    + bodyHtml
    + '<div class="foot"><div class="d">' + todayStr + '</div><div class="c">' + company + '  (직인)</div><div>대표 권형하</div></div>'
    + '</body></html>';
  w.document.write(doc); w.document.close();
  return { todayStr: todayStr };
}

function LeavePromotion(){
  var nowY = new Date().getFullYear();
  var pol = dbGet('policy_leave', {}) || {};
  var basis = pol.basis || 'joinDate';
  var fiscalMonth = Number(pol.fiscalMonth || 1) || 1;
  var users = getActiveUsers();
  var ledger = dbGet('leave_ledger', []) || [];

  var ys = useState(nowY); var selYear = ys[0]; var setSelYear = ys[1];
  var ps = useState(dbGet('leave_promotion', []) || []); var promo = ps[0]; var setPromo = ps[1];
  var ex = useState(''); var openSid = ex[0]; var setOpenSid = ex[1];

  function persistPromo(next){ setPromo(next); dbSet('leave_promotion', next); }
  function recOf(sid){
    for(var i=0;i<promo.length;i++){ if(promo[i].sid===sid && Number(promo[i].year)===Number(selYear)) return promo[i]; }
    return null;
  }
  function patchRec(sid, patch){
    var next = promo.slice(); var found=false;
    for(var i=0;i<next.length;i++){
      if(next[i].sid===sid && Number(next[i].year)===Number(selYear)){ next[i]=Object.assign({}, next[i], patch); found=true; break; }
    }
    if(!found){ next.push(Object.assign({ sid:sid, year:Number(selYear) }, patch)); }
    persistPromo(next);
  }

  function pad(n){ return (n<10?'0':'')+n; }
  function fmt(d){ return d ? (d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())) : '—'; }
  function addMonths(d, m){ var x=new Date(d.getTime()); var day=x.getDate(); x.setMonth(x.getMonth()+m); if(x.getDate()<day) x.setDate(0); return x; }
  function lastDayOfMonth(y, mIdx){ return new Date(y, mIdx+1, 0); }
  function fiscalEnd(year){
    if(fiscalMonth===1) return new Date(year, 11, 31);
    return lastDayOfMonth(year+1, fiscalMonth-2);
  }
  function joinExpiry(hireDate, ref){
    if(!hireDate) return null;
    var hd = new Date(hireDate); if(isNaN(hd.getTime())) return null;
    var cand = new Date(ref.getFullYear(), hd.getMonth(), hd.getDate());
    if(cand.getTime() <= ref.getTime()) cand = new Date(ref.getFullYear()+1, hd.getMonth(), hd.getDate());
    return cand;
  }

  var today = new Date(); today.setHours(0,0,0,0);
  var todayStr = fmt(today);
  var meName = (typeof CURRENT_USER!=='undefined' && CURRENT_USER && CURRENT_USER.name) ? CURRENT_USER.name : '';

  var rows = []; var unmatched = [];
  users.forEach(function(u){
    var lr = ledger.find(function(r){ return r.name===u.name && Number(r.year)===Number(selYear); });
    if(!lr){ unmatched.push(u.name + (basis==='joinDate' && !u.hireDate ? '(입사일 없음)' : '')); return; }
    var remain = (lr.remain!=null && !isNaN(Number(lr.remain))) ? Number(lr.remain) : null;
    if(remain==null || remain<=0) return;
    var expiry = (basis==='fiscalYear') ? fiscalEnd(Number(selYear)) : joinExpiry(u.hireDate, today);
    var p1=null, p2=null;
    if(expiry){ p1 = addMonths(expiry, -6); p2 = addMonths(expiry, -2); }
    var stage, sc;
    if(!expiry){ stage='입사일 없음'; sc='#94a3b8'; }
    else if(today < p1){ stage='대기'; sc='#94a3b8'; }
    else if(today < p2){ stage='1차 통보 시기'; sc='#d97706'; }
    else if(today < expiry){ stage='2차 통보 시기'; sc='#dc2626'; }
    else { stage='만료'; sc='#991b1b'; }
    rows.push({ sid:u.sid, name:u.name, email:u.email||'', remain:remain, expiry:expiry, p1:p1, p2:p2, stage:stage, sc:sc });
  });

  var order = {'2차 통보 시기':0,'1차 통보 시기':1,'대기':2,'만료':3,'입사일 없음':4};
  rows.sort(function(a,b){ var d=(order[a.stage]==null?9:order[a.stage])-(order[b.stage]==null?9:order[b.stage]); if(d!==0) return d; return (a.expiry?a.expiry.getTime():0)-(b.expiry?b.expiry.getTime():0); });

  var years = ledger.reduce(function(acc,r){ var y=Number(r.year); if(acc.indexOf(y)<0) acc.push(y); return acc; }, []).sort(function(a,b){ return b-a; });
  if(years.indexOf(Number(selYear))<0) years.unshift(Number(selYear));

  var th = {padding:'6px 8px',background:'#f8fafc',color:'#475569',fontWeight:700,fontSize:'11px',textAlign:'left',borderBottom:'2px solid #e2e8f0',whiteSpace:'nowrap'};
  var td = {padding:'5px 8px',borderBottom:'1px solid #f1f5f9',fontSize:'12px',verticalAlign:'middle'};
  function badge(text, bg, fg){ return h('span',{style:{display:'inline-block',fontSize:'10.5px',fontWeight:700,padding:'1px 6px',borderRadius:'8px',marginRight:'4px',background:bg,color:fg}}, text); }
  var lbl = {display:'inline-block',width:'62px',fontSize:'11px',fontWeight:700,color:'#475569',flexShrink:0};
  var inp = {flex:'1',minWidth:'120px',padding:'4px 8px',border:'1px solid #cbd5e1',borderRadius:'6px',fontSize:'12px',fontFamily:'inherit',boxSizing:'border-box'};
  var recBtn = {padding:'4px 10px',background:'#1e40af',color:'#fff',border:'none',borderRadius:'6px',cursor:'pointer',fontSize:'11.5px',fontWeight:700};
  var xBtn = {marginLeft:'8px',padding:'1px 6px',background:'#fff',border:'1px solid #fca5a5',borderRadius:'5px',cursor:'pointer',fontSize:'10.5px',color:'#b91c1c'};
  var erow = {display:'flex',alignItems:'center',gap:'8px',flexWrap:'wrap',marginBottom:'7px'};
  var noticeBtn = {padding:'4px 10px',background:'#0d9488',color:'#fff',border:'none',borderRadius:'6px',cursor:'pointer',fontSize:'11.5px',fontWeight:700};

  // 통보서 본문 HTML 생성 (인쇄·이메일 공용)
  function buildNoticeBody(r, round, opts){
    opts = opts || {};
    var remain = r.remain;
    var expS = fmt(r.expiry);
    var titleTxt, bodyHtml;
    if(round===1){
      var dl = new Date(today.getTime()); dl.setDate(dl.getDate()+10); var dlS = fmt(dl);
      titleTxt = '연차유급휴가 사용촉진 통보서 (1차)';
      bodyHtml = '<p>근로기준법 제61조에 따라 귀하의 미사용 연차유급휴가 사용을 촉진합니다. 아래 잔여 휴가에 대하여 <b>사용시기를 정하여 회신 기한까지 통보</b>하여 주시기 바랍니다.</p>'
        + '<table><tr><th>미사용 연차</th><td>' + remain + '일</td></tr>'
        + '<tr><th>사용기간(만료일)</th><td>' + expS + ' 까지</td></tr>'
        + '<tr><th>회신 기한</th><td>' + dlS + ' 까지 (사용시기 지정·통보)</td></tr></table>'
        + '<p class="warn">※ 회신 기한까지 사용시기를 통보하지 않으시면, 근로기준법 제61조에 따라 <b>사용자가 사용시기를 지정하여 통보</b>할 수 있습니다.</p>';
    } else {
      var assign = opts.assign || (r._rec && r._rec.n2Assign) || '';
      titleTxt = '연차유급휴가 사용시기 지정 통보서 (2차)';
      bodyHtml = '<p>근로기준법 제61조에 따라, 1차 사용촉진에도 사용시기를 통보하지 아니한 귀하의 미사용 연차유급휴가에 대하여 <b>사용자가 아래와 같이 사용시기를 지정</b>하여 통보합니다.</p>'
        + '<table><tr><th>미사용 연차</th><td>' + remain + '일</td></tr>'
        + '<tr><th>지정 사용일</th><td>' + assign + '</td></tr>'
        + '<tr><th>사용기간(만료일)</th><td>' + expS + ' 까지</td></tr></table>'
        + '<p class="warn">※ 지정된 사용일에 휴가를 사용하지 않을 경우, 해당 연차유급휴가는 소멸될 수 있습니다.</p>';
    }
    return { titleTxt:titleTxt, bodyHtml:bodyHtml };
  }
  // 이메일용 통보서 HTML (인라인 스타일)
  function noticeEmailHtml(r, round, opts){
    var nb = buildNoticeBody(r, round, opts);
    return '<div style="font-family:\'맑은 고딕\',sans-serif;color:#111;line-height:1.7;font-size:14px;max-width:640px">'
      + '<div style="font-size:19px;font-weight:800;text-align:center;letter-spacing:1px;margin:0 0 4px">' + nb.titleTxt + '</div>'
      + '<div style="height:3px;background:#1e40af;margin:0 0 16px"></div>'
      + '<div style="margin:0 0 12px"><div><b style="display:inline-block;width:56px">수신</b> ' + r.name + ' 귀하</div>'
      + '<div><b style="display:inline-block;width:56px">발신</b> 푸른노무법인</div>'
      + '<div><b style="display:inline-block;width:56px">통보일</b> ' + todayStr + '</div></div>'
      + nb.bodyHtml.replace(/<table>/g,'<table style="width:100%;border-collapse:collapse;margin:14px 0">')
                   .replace(/<th>/g,'<th style="border:1px solid #333;padding:8px 12px;background:#f1f5f9;width:160px;text-align:left">')
                   .replace(/<td>/g,'<td style="border:1px solid #333;padding:8px 12px">')
                   .replace(/class="warn"/g,'style="color:#b91c1c;font-size:12.5px"')
      + '<div style="margin-top:32px;text-align:right"><div style="margin-bottom:12px">' + todayStr + '</div>'
      + '<div style="font-size:16px;font-weight:800">푸른노무법인 (직인)</div><div>대표 권형하</div></div></div>';
  }
  var PROMO_FN_URL = 'https://us-central1-pureun-erp.cloudfunctions.net/sendPayslip';
  // 사용촉진 통보 이메일 발송 + 발송기록 저장
  function sendNoticeEmail(r, round, opts){
    opts = opts || {};
    var allUsers = getActiveUsers();
    var u = allUsers.find(function(x){ return x.sid===r.sid; }) || {};
    var email = (u.email||'').trim();
    if(!email){ showToast('⚠ ' + r.name + ' 개인 이메일이 없습니다 — 근로자명부에서 입력하세요'); return Promise.resolve(false); }
    var nb = buildNoticeBody(r, round, opts);
    var subject = '[푸른노무법인] ' + nb.titleTxt + ' (' + r.name + ')';
    var html = noticeEmailHtml(r, round, opts);
    showToast('📤 ' + r.name + '님에게 ' + (round===1?'1차':'2차') + ' 통보 발송 중...');
    return fetch(PROMO_FN_URL, {
      method:'POST', headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ to: email, name: u.name, ym: String(selYear), subject: subject, html: html })
    }).then(function(res){ return res.json(); }).then(function(d){
      if(d && d.ok){
        var now = new Date();
        var stampStr = fmt(now) + ' ' + pad(now.getHours()) + ':' + pad(now.getMinutes());
        var patch = {};
        if(round===1){ patch.n1Date = todayStr; patch.n1By = meName; patch.n1SentAt = stampStr; patch.n1SentTo = email; patch.n1ResendId = (d.id||''); patch.n1Method = 'email'; }
        else { patch.n2Date = todayStr; patch.n2By = meName; patch.n2SentAt = stampStr; patch.n2SentTo = email; patch.n2ResendId = (d.id||''); patch.n2Method = 'email'; if(opts.assign) patch.n2Assign = opts.assign; }
        patchRec(r.sid, patch);
        showToast('✅ ' + r.name + '님 ' + (round===1?'1차':'2차') + ' 통보 발송 완료 → ' + email);
        return true;
      } else {
        showToast('⚠ 발송 실패: ' + JSON.stringify((d && d.error) || d));
        return false;
      }
    }).catch(function(e){ showToast('⚠ 호출 실패: ' + ((e && e.message) || e)); return false; });
  }

  function printNotice(r, round){
    var rec = recOf(r.sid);
    var remain = r.remain;
    var expS = fmt(r.expiry);
    var company = '푸른노무법인';
    var titleTxt, bodyHtml;
    if(round===1){
      if(!(rec&&rec.n1Date)){ patchRec(r.sid, { n1Date:todayStr, n1By:meName }); }
      var dl = new Date(today.getTime()); dl.setDate(dl.getDate()+10); var dlS = fmt(dl);
      titleTxt = '연차유급휴가 사용촉진 통보서 (1차)';
      bodyHtml = '<p>근로기준법 제61조에 따라 귀하의 미사용 연차유급휴가 사용을 촉진합니다. 아래 잔여 휴가에 대하여 <b>사용시기를 정하여 회신 기한까지 통보</b>하여 주시기 바랍니다.</p>'
        + '<table><tr><th>미사용 연차</th><td>' + remain + '일</td></tr>'
        + '<tr><th>사용기간(만료일)</th><td>' + expS + ' 까지</td></tr>'
        + '<tr><th>회신 기한</th><td>' + dlS + ' 까지 (사용시기 지정·통보)</td></tr></table>'
        + '<p class="warn">※ 회신 기한까지 사용시기를 통보하지 않으시면, 근로기준법 제61조에 따라 <b>사용자가 사용시기를 지정하여 통보</b>할 수 있습니다.</p>';
    } else {
      var assign = (rec&&rec.n2Assign) || '';
      if(!assign){ assign = window.prompt('회사가 지정한 사용일을 입력하세요 (예: 2026-08-10 ~ 08-14)', ''); if(assign==null || !String(assign).trim()){ return; } assign=String(assign).trim(); }
      patchRec(r.sid, { n2Date:todayStr, n2By:meName, n2Assign:assign });
      titleTxt = '연차유급휴가 사용시기 지정 통보서 (2차)';
      bodyHtml = '<p>근로기준법 제61조에 따라, 1차 사용촉진에도 사용시기를 통보하지 아니한 귀하의 미사용 연차유급휴가에 대하여 <b>사용자가 아래와 같이 사용시기를 지정</b>하여 통보합니다.</p>'
        + '<table><tr><th>미사용 연차</th><td>' + remain + '일</td></tr>'
        + '<tr><th>지정 사용일</th><td>' + assign + '</td></tr>'
        + '<tr><th>사용기간(만료일)</th><td>' + expS + ' 까지</td></tr></table>'
        + '<p class="warn">※ 지정된 사용일에 휴가를 사용하지 않을 경우, 해당 연차유급휴가는 소멸될 수 있습니다.</p>';
    }
    var w = window.open('', '_blank');
    if(!w){ try{ showToast('팝업이 차단되었습니다 — 팝업 허용 후 다시 시도하세요.'); }catch(_){ } return; }
    var doc = '<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"><title>' + titleTxt + ' - ' + r.name + '</title>'
      + '<style>'
      + 'body{font-family:"맑은 고딕","Malgun Gothic","Apple SD Gothic Neo",sans-serif;color:#111;margin:25mm 20mm;line-height:1.7;font-size:13.5px;}'
      + '.title{font-size:20px;font-weight:800;text-align:center;letter-spacing:2px;margin:0 0 4px;}'
      + '.bar{height:3px;background:#1e40af;margin:0 0 18px;}'
      + '.meta{margin:0 0 12px;font-size:13px;}'
      + '.meta b{display:inline-block;width:60px;}'
      + 'table{width:100%;border-collapse:collapse;margin:14px 0;}'
      + 'th,td{border:1px solid #333;padding:8px 12px;font-size:13.5px;}'
      + 'th{background:#f1f5f9;width:160px;text-align:left;}'
      + '.warn{color:#b91c1c;font-size:12.5px;}'
      + '.foot{margin-top:36px;text-align:right;}'
      + '.foot .d{margin-bottom:14px;}'
      + '.foot .c{font-size:16px;font-weight:800;}'
      + '.noprint{text-align:right;margin-bottom:10px;}'
      + '@media print{.noprint{display:none;} body{margin:18mm 16mm;}}'
      + '</style></head><body>'
      + '<div class="noprint"><button onclick="window.print()" style="padding:8px 16px;font-size:14px;cursor:pointer;">🖨 인쇄 / PDF 저장</button></div>'
      + '<div class="title">' + titleTxt + '</div><div class="bar"></div>'
      + '<div class="meta"><div><b>수신</b> ' + r.name + ' 귀하</div><div><b>발신</b> ' + company + '</div><div><b>통보일</b> ' + todayStr + '</div></div>'
      + bodyHtml
      + '<div class="foot"><div class="d">' + todayStr + '</div><div class="c">' + company + '  (직인)</div><div>대표 권형하</div></div>'
      + '</body></html>';
    w.document.write(doc); w.document.close();
  }

  function editorPanel(r){
    var rec = recOf(r.sid);
    function stamp(field, byField){ var p={}; p[field]=todayStr; if(byField) p[byField]=meName; patchRec(r.sid, p); }
    function clear2(field, byField){ var p={}; p[field]=null; if(byField) p[byField]=null; patchRec(r.sid, p); }
    return h('div',{style:{padding:'10px 12px',background:'#f8fafc',border:'1px solid #e2e8f0',borderRadius:'8px'}},
      h('div',{style:erow},
        h('span',{style:lbl},'1차 촉진'),
        (rec&&rec.n1Date)
          ? h('span',{style:{fontSize:'12px',color:'#166534',fontWeight:700}}, '✓ '+rec.n1Date+(rec.n1By?(' · '+rec.n1By):''),
              rec.n1SentAt ? h('span',{title:'메일 발송: '+rec.n1SentAt+' → '+(rec.n1SentTo||''),style:{marginLeft:'6px',fontSize:'10.5px',color:'#2563eb',fontWeight:700,background:'#eff6ff',border:'1px solid #bfdbfe',borderRadius:'6px',padding:'1px 6px'}}, '📧 '+rec.n1SentAt) : null,
              h('button',{style:xBtn,onClick:function(){ clear2('n1Date','n1By'); }},'취소'))
          : [
              h('button',{key:'r1',style:recBtn,onClick:function(){ stamp('n1Date','n1By'); }},'오늘 1차 기록'),
              h('button',{key:'e1',style:noticeBtn,onClick:function(){ sendNoticeEmail(r, 1); }},'📧 메일 통보 발송')
            ]
      ),
      h('div',{style:erow},
        h('span',{style:lbl},'2차 촉진'),
        (rec&&rec.n2Date)
          ? h('span',{style:{fontSize:'12px',color:'#166534',fontWeight:700}}, '✓ '+rec.n2Date+(rec.n2By?(' · '+rec.n2By):''),
              rec.n2SentAt ? h('span',{title:'메일 발송: '+rec.n2SentAt+' → '+(rec.n2SentTo||''),style:{marginLeft:'6px',fontSize:'10.5px',color:'#2563eb',fontWeight:700,background:'#eff6ff',border:'1px solid #bfdbfe',borderRadius:'6px',padding:'1px 6px'}}, '📧 '+rec.n2SentAt) : null,
              h('button',{style:xBtn,onClick:function(){ clear2('n2Date','n2By'); }},'취소'))
          : [
              h('button',{key:'r2',style:recBtn,onClick:function(){ stamp('n2Date','n2By'); }},'오늘 2차 기록'),
              h('button',{key:'e2',style:noticeBtn,onClick:function(){
                  var assign = window.prompt('회사가 지정한 사용일을 입력하세요 (예: 2026-08-10 ~ 08-14)', (rec&&rec.n2Assign)||'');
                  if(assign==null || !String(assign).trim()) return;
                  sendNoticeEmail(r, 2, { assign:String(assign).trim() });
                }},'📧 메일 통보 발송')
            ]
      ),
      h('div',{style:erow},
        h('span',{style:lbl},'사용 신청'),
        h('input',{type:'text', value:(rec&&rec.request)||'', placeholder:'예: 8/15~8/19, 5일',
          onChange:function(e){ var v=e.target.value; var cur=recOf(r.sid); patchRec(r.sid,{ request:v, requestDate:(v?((cur&&cur.requestDate)||todayStr):null) }); },
          style:inp}),
        (rec&&rec.requestDate) ? h('span',{style:{fontSize:'11px',color:'#64748b'}}, '신청일 '+rec.requestDate) : null
      ),
      h('div',{style:erow},
        h('span',{style:lbl},'비고'),
        h('input',{type:'text', value:(rec&&rec.note)||'', placeholder:'메모(선택)',
          onChange:function(e){ patchRec(r.sid,{ note:e.target.value }); }, style:inp})
      ),
      h('div',{style:erow},
        h('span',{style:lbl},'통보서'),
        h('button',{style:noticeBtn,onClick:function(){ printNotice(r,1); }},'🖨 1차 통보서'),
        h('button',{style:noticeBtn,onClick:function(){ printNotice(r,2); }},'🖨 2차 통보서'),
        h('span',{style:{fontSize:'10.5px',color:'#94a3b8'}},'인쇄 시 해당 회차 자동 기록')
      ),
      h('div',{style:{fontSize:'11px',color:(r.email?'#64748b':'#dc2626')}}, '이메일: '+(r.email||'미등록 (근로자명부에서 입력)'))
    );
  }

  var body=[];
  rows.forEach(function(r){
    var rec = recOf(r.sid);
    var hasReq = !!(rec && rec.request);
    body.push(h('tr',{key:r.sid},
      h('td',{style:td}, r.name),
      h('td',{style:Object.assign({},td,{textAlign:'right',fontFamily:'monospace',fontWeight:700})}, r.remain),
      h('td',{style:Object.assign({},td,{fontFamily:'monospace'})}, fmt(r.expiry)),
      h('td',{style:Object.assign({},td,{fontFamily:'monospace'})}, fmt(r.p1)),
      h('td',{style:Object.assign({},td,{fontFamily:'monospace'})}, fmt(r.p2)),
      h('td',{style:td}, h('span',{style:{color:r.sc,fontWeight:700,fontSize:'11.5px'}}, r.stage)),
      h('td',{style:Object.assign({},td,{cursor:'pointer',whiteSpace:'nowrap'}), onClick:function(){ setOpenSid(openSid===r.sid?'':r.sid); }},
        badge((rec&&rec.n1Date)?'1차 ✓':'1차 –', (rec&&rec.n1Date)?'#dcfce7':'#f1f5f9', (rec&&rec.n1Date)?'#166534':'#94a3b8'),
        badge((rec&&rec.n2Date)?'2차 ✓':'2차 –', (rec&&rec.n2Date)?'#dcfce7':'#f1f5f9', (rec&&rec.n2Date)?'#166534':'#94a3b8'),
        hasReq ? badge('신청','#dbeafe','#1e40af') : null,
        h('span',{style:{color:'#94a3b8',fontSize:'11px'}}, openSid===r.sid?' ▾':' ▸')
      )
    ));
    if(openSid===r.sid){
      body.push(h('tr',{key:r.sid+'_x'}, h('td',{colSpan:7, style:{padding:'4px 8px 12px'}}, editorPanel(r))));
    }
  });

  return h('div',null,
    h('div',{style:{display:'flex',alignItems:'center',gap:'10px',marginBottom:'6px',flexWrap:'wrap'}},
      h('div',{style:{fontWeight:700,fontSize:'15px',color:'#1e293b'}},'📣 연차사용촉진'),
      h('span',{style:{fontSize:'11px',padding:'2px 8px',borderRadius:'10px',background:'#eef2ff',color:'#3730a3',fontWeight:700}}, '기준: '+(basis==='fiscalYear'?'회계연도':'입사일')),
      h('label',{style:{fontSize:'12px',color:'#475569',marginLeft:'auto'}}, '대상 연도 ',
        h('select',{value:String(selYear),onChange:function(e){ setSelYear(Number(e.target.value)); setOpenSid(''); },
          style:{padding:'4px 8px',border:'1px solid #cbd5e1',borderRadius:'4px',fontSize:'12px',fontFamily:'inherit'}},
          years.map(function(y){ return h('option',{key:y,value:String(y)}, y+'년'); })
        ))
    ),
    h('div',{style:{fontSize:'11px',color:'#64748b',marginBottom:'10px'}},
      (basis==='fiscalYear'
        ? '※ 회계연도 기준 · 만료 = '+(fiscalMonth===1?'12/31':((fiscalMonth-1)+'월 말일'))+' · 1차 통보 만료 6개월 전 · 2차 만료 2개월 전.'
        : '※ 입사일 기준 · 만료 = 각자 입사일의 다음 도래일(오늘 기준) · 1차 6개월 전 · 2차 2개월 전.')
      + ' 미사용 잔여(연차대장 '+selYear+'년) > 0 인 재직자만 표시. 행을 누르면 촉진 기록·사용신청을 입력합니다.'
    ),
    rows.length===0
      ? h('div',{style:{padding:'24px',textAlign:'center',color:'#94a3b8',background:'#fff',border:'1px dashed #cbd5e1',borderRadius:'8px'}}, '대상자가 없습니다 (선택 연도에 잔여 > 0 인 재직자 없음).')
      : h('div',{style:{border:'1px solid #e2e8f0',borderRadius:'8px',overflow:'auto'}},
          h('table',{style:{width:'100%',borderCollapse:'collapse'}},
            h('thead',null,h('tr',null,
              h('th',{style:Object.assign({},th,{width:'90px'})},'이름'),
              h('th',{style:Object.assign({},th,{width:'66px',textAlign:'right',background:'#ecfeff'})},'미사용'),
              h('th',{style:Object.assign({},th,{width:'108px'})},'만료일'),
              h('th',{style:Object.assign({},th,{width:'108px'})},'1차 통보일'),
              h('th',{style:Object.assign({},th,{width:'108px'})},'2차 통보일'),
              h('th',{style:Object.assign({},th,{width:'112px'})},'현재 단계'),
              h('th',{style:Object.assign({},th,{minWidth:'150px'})},'촉진 기록 (행 클릭)')
            )),
            h('tbody',null, body)
          )
        ),
    (unmatched.length>0) && h('div',{style:{marginTop:'12px',fontSize:'11px',color:'#b45309',background:'#fffbeb',border:'1px solid #fde68a',borderRadius:'6px',padding:'8px 10px'}},
      '⚠ 연차대장('+selYear+'년)에 행이 없는 재직자 '+unmatched.length+'명: '+unmatched.join(', ')+' — 이름이 대장과 다르거나 미입력일 수 있습니다.'
    )
  );
}

function LeaveManagement(){
  var tbs = useState('annual'); var tab = tbs[0]; var setTab = tbs[1];
  var srS = useState(true); var showRetired = srS[0]; var setShowRetired = srS[1];  // 퇴사자 포함 기본값(근무연도 필터로 근무한 해만 표시)
  var qS = useState(''); var query = qS[0]; var setQuery = qS[1];
  var _isAdminView = !!(CURRENT_USER && (CURRENT_USER.isAdmin || CURRENT_USER.isSubAdmin));
  var users = (function(){
    var _q = (query||'').trim().toLowerCase();
    // 퇴사자도 항상 후보에 포함 — 근무 연도 필터(leaveUsers)에서 선택연도 기준으로 거른다
    var all = sortUsers(dbGet('user_accounts', USERS_SEED).filter(function(u){return u.status==='active'||u.status==='retired'||u.status==='leave';}));
    if(!_isAdminView) all = all.filter(function(u){return u.sid===CURRENT_USER.sid;});
    if(_q) all = all.filter(function(u){return (u.name||'').toLowerCase().indexOf(_q)>=0;});
    return all;
  })();
  var policy = dbGet('policy_leave', { basis:'joinDate', baseAfterOneYear:15, bonusEvery:2, bonusStart:3, maxDays:25, carryOverLimit:5, monthlyForFirstYear:true });
  var grants  = dbGet('leave_grants', {});
  var ats = useState(dbGet('attendance_records', [])); var attendance = ats[0]; var setAttendance = ats[1];

  var nowY = String((new Date()).getFullYear());
  var now  = new Date();
  var nowM = String(now.getMonth()+1).padStart(2,'0');
  var ys = useState(nowY); var selYear = ys[0]; var setSelYear = ys[1];
  // 선택 직원
  var ss = useState(users[0]?users[0].sid:''); var selSid = ss[0]; var setSelSid = ss[1];
  // 월달력
  var cms = useState(nowM); var calMonth = cms[0]; var setCalMonth = cms[1];
  // 부여 오버라이드 모달
  var ms = useState(null); var modalSid = ms[0]; var setModalSid = ms[1];
  var mfs = useState({total:0,carryOver:0,autoDays:0}); var mForm = mfs[0]; var setMForm = mfs[1];
  // 연도별 이력 펼침
  var es = useState({}); var expanded = es[0]; var setExpanded = es[1];
  function toggleYear(y){ var nx = Object.assign({}, expanded); nx[y] = !nx[y]; setExpanded(nx); }
  // 섹션 접기 (kpi/yearly/heatmap/timeline)
  var scS = useState({heatmap:true,timeline:true}); var secCollapsed = scS[0]; var setSecCollapsed = scS[1];
  function toggleSec(k){ var nx = Object.assign({}, secCollapsed); nx[k] = !nx[k]; setSecCollapsed(nx); }
  // 하이브리드 뷰 모드 ('single' = 연도 탭, 'multi' = 다년 비교)
  var vmS = useState('single'); var viewMode = vmS[0]; var setViewMode = vmS[1];
  var syS = useState((new Date()).getFullYear()); var selSingleYear = syS[0]; var setSelSingleYear = syS[1];
  // 보상휴가 사용 추가 폼
  var caS = useState({ sid:'', date:todayYMD(), hours:1, note:'' });
  var compAddForm = caS[0]; var setCompAddForm = caS[1];
  var rfS = useState(0); var compRefresh = rfS[0]; var setCompRefresh = rfS[1]; // 강제 리렌더
  // 사용촉진 통보 기록 (연차/반차 목록 인라인 기록용 — 사용촉진 탭과 동일 데이터)
  var lpS = useState(dbGet('leave_promotion', []) || []); var leavePromo = lpS[0]; var setLeavePromo = lpS[1];
  function promoRecOf(sid){
    for(var i=0;i<leavePromo.length;i++){ if(leavePromo[i].sid===sid && Number(leavePromo[i].year)===Number(selYear)) return leavePromo[i]; }
    return null;
  }
  function promoPatch(sid, patch){
    var next = leavePromo.slice(); var found=false;
    for(var i=0;i<next.length;i++){
      if(next[i].sid===sid && Number(next[i].year)===Number(selYear)){ next[i]=Object.assign({}, next[i], patch); found=true; break; }
    }
    if(!found){ next.push(Object.assign({ sid:sid, year:Number(selYear) }, patch)); }
    setLeavePromo(next); dbSet('leave_promotion', next);
  }
  // 목록에서 사용촉진 통보 메일 발송 + 기록 (사용촉진 탭과 동일 데이터)
  var LM_PROMO_FN_URL = 'https://us-central1-pureun-erp.cloudfunctions.net/sendPayslip';
  function lmPad(n){ return (n<10?'0':'')+n; }
  function lmFmt(d){ return d ? (d.getFullYear()+'-'+lmPad(d.getMonth()+1)+'-'+lmPad(d.getDate())) : '—'; }
  function sendPromoFromList(u, round, remain, expiryStr){
    var email = (u.email||'').trim();
    if(!email){ showToast('⚠ ' + u.name + ' 개인 이메일이 없습니다 — 근로자명부에서 입력하세요'); return; }
    var assign = '';
    if(round===2){
      assign = window.prompt('회사가 지정한 사용일을 입력하세요 (예: 2026-08-10 ~ 08-14)', '');
      if(assign==null || !String(assign).trim()) return;
      assign = String(assign).trim();
    }
    var titleTxt = round===1 ? '연차유급휴가 사용촉진 통보서 (1차)' : '연차유급휴가 사용시기 지정 통보서 (2차)';
    var tS = todayYMD();
    var body;
    if(round===1){
      var dl = new Date(); dl.setDate(dl.getDate()+10); var dlS = lmFmt(dl);
      body = '<p>근로기준법 제61조에 따라 귀하의 미사용 연차유급휴가 사용을 촉진합니다. 아래 잔여 휴가에 대하여 <b>사용시기를 정하여 회신 기한까지 통보</b>하여 주시기 바랍니다.</p>'
        + '<table style="width:100%;border-collapse:collapse;margin:14px 0">'
        + '<tr><th style="border:1px solid #333;padding:8px 12px;background:#f1f5f9;text-align:left;width:160px">미사용 연차</th><td style="border:1px solid #333;padding:8px 12px">'+remain+'일</td></tr>'
        + '<tr><th style="border:1px solid #333;padding:8px 12px;background:#f1f5f9;text-align:left">사용기간(만료일)</th><td style="border:1px solid #333;padding:8px 12px">'+expiryStr+' 까지</td></tr>'
        + '<tr><th style="border:1px solid #333;padding:8px 12px;background:#f1f5f9;text-align:left">회신 기한</th><td style="border:1px solid #333;padding:8px 12px">'+dlS+' 까지</td></tr></table>'
        + '<p style="color:#b91c1c;font-size:12.5px">※ 회신 기한까지 사용시기를 통보하지 않으시면, 사용자가 사용시기를 지정하여 통보할 수 있습니다.</p>';
    } else {
      body = '<p>근로기준법 제61조에 따라, 1차 사용촉진에도 사용시기를 통보하지 아니한 귀하의 미사용 연차유급휴가에 대하여 <b>사용자가 아래와 같이 사용시기를 지정</b>하여 통보합니다.</p>'
        + '<table style="width:100%;border-collapse:collapse;margin:14px 0">'
        + '<tr><th style="border:1px solid #333;padding:8px 12px;background:#f1f5f9;text-align:left;width:160px">미사용 연차</th><td style="border:1px solid #333;padding:8px 12px">'+remain+'일</td></tr>'
        + '<tr><th style="border:1px solid #333;padding:8px 12px;background:#f1f5f9;text-align:left">지정 사용일</th><td style="border:1px solid #333;padding:8px 12px">'+assign+'</td></tr>'
        + '<tr><th style="border:1px solid #333;padding:8px 12px;background:#f1f5f9;text-align:left">사용기간(만료일)</th><td style="border:1px solid #333;padding:8px 12px">'+expiryStr+' 까지</td></tr></table>'
        + '<p style="color:#b91c1c;font-size:12.5px">※ 지정된 사용일에 휴가를 사용하지 않을 경우, 해당 연차유급휴가는 소멸될 수 있습니다.</p>';
    }
    var meName2 = (typeof CURRENT_USER!=='undefined' && CURRENT_USER) ? CURRENT_USER.name : '';
    var html = '<div style="font-family:\'맑은 고딕\',sans-serif;color:#111;line-height:1.7;font-size:14px;max-width:640px">'
      + '<div style="font-size:19px;font-weight:800;text-align:center;margin:0 0 4px">'+titleTxt+'</div>'
      + '<div style="height:3px;background:#1e40af;margin:0 0 16px"></div>'
      + '<div style="margin:0 0 12px"><div><b style="display:inline-block;width:56px">수신</b> '+u.name+' 귀하</div>'
      + '<div><b style="display:inline-block;width:56px">발신</b> 푸른노무법인</div>'
      + '<div><b style="display:inline-block;width:56px">통보일</b> '+tS+'</div></div>'
      + body
      + '<div style="margin-top:32px;text-align:right"><div style="margin-bottom:12px">'+tS+'</div>'
      + '<div style="font-size:16px;font-weight:800">푸른노무법인 (직인)</div><div>대표 권형하</div></div></div>';
    var subject = '[푸른노무법인] '+titleTxt+' ('+u.name+')';
    popConfirm(u.name+' 님('+email+')에게\n'+(round===1?'1차':'2차')+' 사용촉진 통보서를 메일로 발송할까요?\n\n발송 시 통보일이 자동 기록되고 사용촉진 탭에도 반영됩니다.').then(function(ok){
      if(!ok) return;
      showToast('📤 '+u.name+'님에게 발송 중...');
      fetch(LM_PROMO_FN_URL, { method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ to:email, name:u.name, ym:String(selYear), subject:subject, html:html })
      }).then(function(res){ return res.json(); }).then(function(d){
        if(d && d.ok){
          var now=new Date(); var stampStr = lmFmt(now)+' '+lmPad(now.getHours())+':'+lmPad(now.getMinutes());
          var patch={};
          if(round===1){ patch.n1Date=tS; patch.n1By=meName2; patch.n1SentAt=stampStr; patch.n1SentTo=email; patch.n1ResendId=(d.id||''); patch.n1Method='email'; }
          else { patch.n2Date=tS; patch.n2By=meName2; patch.n2SentAt=stampStr; patch.n2SentTo=email; patch.n2ResendId=(d.id||''); patch.n2Method='email'; patch.n2Assign=assign; }
          promoPatch(u.sid, patch);
          showToast('✅ '+u.name+'님 '+(round===1?'1차':'2차')+' 통보 발송 완료 → '+email);
        } else { showToast('⚠ 발송 실패: '+JSON.stringify((d&&d.error)||d)); }
      }).catch(function(e){ showToast('⚠ 호출 실패: '+((e&&e.message)||e)); });
    });
  }
  function bumpComp(){ setCompRefresh(compRefresh+1); }

  // 연차 자동 부여 계산
  function calcBonus(fullYears){
    var bonusStart = policy.bonusStart||3;
    var bonusEvery = policy.bonusEvery||2;
    if(fullYears < bonusStart) return 0;
    return Math.floor((fullYears - bonusStart) / bonusEvery) + 1;
  }
  function calcGrantDays(hireDate, year, leaveDate){
    if(!hireDate) return {days:0, reason:'입사일 없음'};
    // 2021-06-01 이전 입사자는 연차 기산일을 2021-06-01로 적용
    var effectiveHire = (hireDate < PUREUN_5IN_DATE) ? PUREUN_5IN_DATE : hireDate;
    var isOldEmp = effectiveHire !== hireDate;
    var hire = new Date(effectiveHire);
    if(isNaN(hire.getTime())) return {days:0, reason:'입사일 형식 오류'};
    var yearEnd = new Date(parseInt(year), 11, 31);
    if(leaveDate){ var ld=new Date(leaveDate); if(!isNaN(ld.getTime())&&ld<yearEnd) yearEnd=ld; }
    if(hire > yearEnd) return {days:0, reason: isOldEmp ? '기산일 이전 (기산일: '+PUREUN_5IN_DATE+')' : '입사 전'};
    var yearsAtEnd = (yearEnd-hire)/(365.25*86400000);
    var prefix = isOldEmp ? '[기산일:'+PUREUN_5IN_DATE+'] ' : '';
    if(yearsAtEnd < 1){
      if(!policy.monthlyForFirstYear) return {days:0, reason:prefix+'1년 미만(정책 미적용)'};
      var mo = Math.floor((yearEnd-hire)/(30.44*86400000));
      return {days:Math.min(mo,11), reason:prefix+'1년 미만('+mo+'개월)'+(leaveDate?' [퇴직일 기준]':''), isOldEmp:isOldEmp, effectiveHire:effectiveHire};
    }
    var fullYears = Math.floor(yearsAtEnd);
    var bonus = calcBonus(fullYears);
    var total = Math.min((policy.baseAfterOneYear||15)+bonus, policy.maxDays||25);
    return {days:total, reason:prefix+fullYears+'년차 (기본'+(policy.baseAfterOneYear||15)+'+가산'+bonus+')'+(leaveDate?' [퇴직일 기준]':''), isOldEmp:isOldEmp, effectiveHire:effectiveHire};
  }

  function calcUsed(sid, year){
    var rec = attendance.filter(function(r){ return r.sid===sid&&(r.date||'').slice(0,4)===year; });
    var leaveCnt  = rec.filter(function(r){return r.type==='leave';}).length;
    var halfCnt   = rec.filter(function(r){return r.type==='halfday-am'||r.type==='halfday-pm';}).length;
    var hourTotal = rec.filter(function(r){return r.type==='leave-hour';}).reduce(function(s,r){return s+(parseFloat(r.hours)||0);},0);
    return {used:leaveCnt+halfCnt*0.5+hourTotal/8, fullDays:leaveCnt, halfDays:halfCnt, hourTotal:hourTotal};
  }

  var selUser = users.find(function(u){return u.sid===selSid;});

  // 선택 직원 연차 정보
  var auto = selUser ? calcGrantDays(selUser.hireDate, selYear, selUser.leaveDate||null) : {days:0,reason:''};
  var override = selSid && grants[selSid] && grants[selSid][selYear] ? grants[selSid][selYear] : null;
  var total = override && override.total!=null ? override.total : auto.days;
  var carryOver = override ? (override.carryOver||0) : 0;
  var grant = total + carryOver;
  var used  = selUser ? calcUsed(selSid, selYear) : {used:0,fullDays:0,halfDays:0,hourTotal:0};
  var remain = grant - used.used;

  // 오버라이드 저장
  function openOverride(){
    setMForm({total:override?override.total:auto.days, carryOver:carryOver, autoDays:auto.days});
    setModalSid(selSid);
  }
  function saveOverride(){
    var g = dbGet('leave_grants',{});
    if(!g[modalSid]) g[modalSid]={};
    g[modalSid][selYear]={total:parseInt(mForm.total)||0, carryOver:parseInt(mForm.carryOver)||0};
    dbSet('leave_grants',g);
    setModalSid(null);
    showToast('부여일수 수정됨');
  }
  async function resetOverride(){
    if(!(await popConfirm('자동 계산값으로 되돌릴까요?'))) return;
    var g = dbGet('leave_grants',{});
    if(g[selSid]&&g[selSid][selYear]) delete g[selSid][selYear];
    dbSet('leave_grants',g);
    setModalSid(null);
    showToast('자동 계산으로 복원');
  }

  // 월달력
  
  

  function moveLeaveRec(id, newDate){
    var all = dbGet('attendance_records',[]);
    var rec = all.find(function(r){return r.id===id;});
    if(!rec||rec.date===newDate) return;
    var updated = all.map(function(r){return r.id===id?Object.assign({},r,{date:newDate}):r;});
    dbSet('attendance_records',updated);
    setAttendance(updated);
    showToast((rec.date||'').slice(5)+'→'+newDate.slice(5)+' 이동됨');
  }

  

  // 선택 연도에 재직(입사연도 ≤ 선택연도)인 직원만 — 입사 전 연도는 목록에서 제외
  var leaveUsers = users.filter(function(u){
    var y = parseInt(selYear,10);
    var isRetired = (u.status==='retired' || u.status==='resigned');
    // "퇴사자 제외" 체크 시(showRetired=false): 검색 중이 아니면 퇴사자 완전 숨김
    if(isRetired && !showRetired && !(query||'').trim()) return false;
    // 입사연도 이후만
    if(u.hireDate){
      var hy = parseInt(String(u.hireDate).slice(0,4),10);
      if(!isNaN(hy) && y < hy) return false;
    }
    // 퇴사자: 근무한 해(입사~퇴사 연도)에만 표시. 퇴사 연도 이후엔 제외
    if(isRetired){
      var rd = u.retireDate || u.lastWorkDate || '';
      if(rd){
        var ry = parseInt(String(rd).slice(0,4),10);
        if(!isNaN(ry) && y > ry) return false;
      }
    }
    return true;
  });

  // CSV 다운로드
  function downloadCSV(){
    var rows = [['직원','직위','입사일','부여(자동)','이월','총부여','사용','잔여','비고']];
    leaveUsers.forEach(function(u){
      var a=calcGrantDays(u.hireDate,selYear,u.leaveDate||null);
      var ov=grants[u.sid]&&grants[u.sid][selYear]?grants[u.sid][selYear]:null;
      var t=ov&&ov.total!=null?ov.total:a.days;
      var co=ov?(ov.carryOver||0):0;
      var us=calcUsed(u.sid,selYear);
      rows.push([u.name,u.title,u.hireDate||'',a.days,co,t+co,Math.round(us.used*10)/10,Math.round((t+co-us.used)*10)/10,ov?'수동':'자동']);
    });
    var csv='\uFEFF'+rows.map(function(r){return r.join(',');}).join('\n');
    var blob=new Blob([csv],{type:'text/csv;charset=utf-8'});
    var url=URL.createObjectURL(blob);
    var a=document.createElement('a');a.href=url;a.download='연차현황_'+selYear+'.csv';a.click();
    URL.revokeObjectURL(url);
    showToast('CSV 다운로드');
  }

  var thS={padding:'4px 6px',fontWeight:700,color:'#475569',fontSize:'10.5px',background:'#f8fafc',borderBottom:'1px solid #e2e8f0'};
  var tdS={padding:'3px 6px',borderBottom:'1px solid #f1f5f9',fontSize:'11px'};

  return h('div',{className:'page',style:{overflowX:'hidden'}},
    // 헤더
    h('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'5px',gap:'4px',flexWrap:'nowrap'}},
      h('div',{style:{display:'flex',alignItems:'center',gap:'6px',minWidth:0}},
        (function(){
          var isFiscal = policy.basis === 'fiscalYear';
          var fm = policy.fiscalMonth || 1;
          var label = isFiscal ? '회계('+fm+'월)' : '입사일기준';
          var bg = isFiscal ? '#fef3c7' : '#dbeafe';
          var fg = isFiscal ? '#92400e' : '#1e40af';
          var bd = isFiscal ? '#fcd34d' : '#93c5fd';
          return h('span', {
            title: '환경설정 → 휴가 정책에서 변경',
            style:{ fontSize:'10px', fontWeight:700, background:bg, color:fg, border:'1px solid '+bd,
              padding:'1px 5px', borderRadius:'6px', whiteSpace:'nowrap' }
          }, label);
        })(),
        h('button',{onClick:function(){setSelYear(String(parseInt(selYear)-1));},style:{border:'1px solid #cbd5e1',background:'#fff',borderRadius:'4px',padding:'2px 7px',cursor:'pointer',fontSize:'13px'}},'◀'),
        h('span',{style:{fontWeight:700,fontSize:'13px',minWidth:'40px',textAlign:'center'}},selYear+'년'),
        h('button',{onClick:function(){setSelYear(String(parseInt(selYear)+1));},style:{border:'1px solid #cbd5e1',background:'#fff',borderRadius:'4px',padding:'2px 7px',cursor:'pointer',fontSize:'13px'}},'▶')
      ),
      h('div',{style:{display:'flex',gap:'3px',alignItems:'center',flexShrink:0}},
        _isAdminView && h('label',{style:{display:'inline-flex',alignItems:'center',gap:'4px',fontSize:'10.5px',color:!showRetired?'#dc2626':'#94a3b8',cursor:'pointer',userSelect:'none',padding:'2px 5px',borderRadius:'8px',background:!showRetired?'#fef2f2':'#f1f5f9',fontWeight:600,border:'1px solid '+(!showRetired?'#fecaca':'#e2e8f0')}},
          h('input',{type:'checkbox',checked:!showRetired,onChange:function(e){setShowRetired(!e.target.checked);},style:{width:'10px',height:'10px',cursor:'pointer',margin:0}}),
          h('span',null,'퇴사자 제외')
        ),
        // ★ 퇴직자 연차 재산정 미완료 경고
        (function(){
          var allU = dbGet('user_accounts', USERS_SEED);
          var retiredNoRecalc = allU.filter(function(u){
            if(!(u.status==='retired' && u.retireDate && !u.leaveRecalcApplied)) return false;
            var _g = grants[u.sid];
            var _hasGrant = _g && Object.keys(_g).length > 0;
            var _hasUse = attendance.some(function(r){ return r.sid===u.sid && (r.type==='leave'||r.type==='halfday-am'||r.type==='halfday-pm'||r.type==='leave-hour'); });
            return _hasGrant || _hasUse;
          });
          if(retiredNoRecalc.length === 0) return null;
          return h('button', { onClick:function(){ setShowRetired(true); },
            title:'연차 재산정이 완료되지 않은 퇴직자 '+retiredNoRecalc.length+'명\n퇴사 처리 시 입사일 기준 연차 재산정 체크가 필요합니다.',
            style:{ padding:'2px 7px', background:'#fff7ed', color:'#c2410c',
              border:'1px solid #fed7aa', borderRadius:'8px', cursor:'pointer',
              fontSize:'10.5px', fontWeight:700, display:'flex', alignItems:'center', gap:'3px' } },
            '⚠️ 재산정 미완료 '+retiredNoRecalc.length+'명');
        })(),
        _isAdminView && h('button',{onClick:downloadCSV,style:{padding:'2px 6px',background:'#fff',border:'1px solid #cbd5e1',borderRadius:'4px',cursor:'pointer',fontSize:'11px',fontWeight:600,color:'#475569'}},'⬇CSV')
      )
    ),

    // 탭 바 (#1 연차 / 휴직 / 보상휴가)
    h('div', { style:{display:'flex',gap:'4px',marginBottom:'6px',borderBottom:'1px solid #e2e8f0',overflowX:'auto',WebkitOverflowScrolling:'touch'} },
      ['annual','loa','comp','aledger'].map(function(t){
        var label = t==='annual' ? '🏖️ 연차/반차' : t==='loa' ? '🏠 휴직' : t==='comp' ? '💎 보상휴가' : '📋 연차대장';
        var on = tab===t;
        return h('button', { key:t, onClick:function(){setTab(t);},
          style:{padding:'5px 10px',background:'transparent',border:'none',borderBottom:'2px solid '+(on?'#1e40af':'transparent'),color:on?'#1e40af':'#64748b',fontWeight:on?700:500,fontSize:'13px',cursor:'pointer',marginBottom:'-1px',flexShrink:0,whiteSpace:'nowrap'} }, label);
      })
    ),
    tab==='aledger' && h(LeaveLedgerTab, null),
    tab==='annual' && h('div',{style:_isAdminView?{display:'grid',gridTemplateColumns:'1fr 1.6fr',gap:'10px',alignItems:'start'}:{}},

      // ─ 좌: 직원별 연차 현황 테이블
      _isAdminView && h('div',null,
        h('div',{style:{fontWeight:700,fontSize:'11px',color:'#1e293b',marginBottom:'3px'}},'👥 직원별 연차 현황'),
        h('input',{type:'text',value:query,placeholder:'이름 검색 (퇴사자 포함)',onInput:function(e){setQuery(e.target.value);},style:{width:'100%',padding:'4px 8px',border:'1px solid #cbd5e1',borderRadius:'6px',fontSize:'11.5px',marginBottom:'5px',boxSizing:'border-box'}}),
        h('div',{style:{border:'1px solid #e2e8f0',borderRadius:'8px',overflow:'hidden'}},
          h('table',{style:{width:'100%',borderCollapse:'collapse',fontSize:'11.5px'}},
            h('thead',null,
              h('tr',null,
                h('th',{rowSpan:2,style:Object.assign({},thS,{width:'40px',textAlign:'center',verticalAlign:'middle'})},'#'),
                h('th',{rowSpan:2,style:Object.assign({},thS,{verticalAlign:'middle'})},'직원'),
                h('th',{rowSpan:2,style:Object.assign({},thS,{textAlign:'right',verticalAlign:'middle'})},'부여'),
                h('th',{rowSpan:2,style:Object.assign({},thS,{textAlign:'right',verticalAlign:'middle'})},'이월'),
                h('th',{rowSpan:2,style:Object.assign({},thS,{textAlign:'right',background:'#eff6ff',verticalAlign:'middle'})},'총'),
                h('th',{rowSpan:2,style:Object.assign({},thS,{textAlign:'right',background:'#fefce8',verticalAlign:'middle'})},'사용'),
                h('th',{rowSpan:2,style:Object.assign({},thS,{textAlign:'right',background:'#ecfeff',verticalAlign:'middle'})},'잔여'),
                h('th',{colSpan:2,style:Object.assign({},thS,{textAlign:'center',background:'#fff7ed',color:'#9a3412',borderBottom:'1px solid #fed7aa'})},'\uD83D\uDCE2 \uC0AC\uC6A9\uCD09\uC9C4\uC2DC\uD589'),
                h('th',{rowSpan:2,style:Object.assign({},thS,{textAlign:'center',width:'36px',verticalAlign:'middle'})},'⚙️')
              ),
              h('tr',null,
                h('th',{style:Object.assign({},thS,{textAlign:'center',background:'#fff7ed',color:'#9a3412',width:'88px'})},'1차 통보'),
                h('th',{style:Object.assign({},thS,{textAlign:'center',background:'#fff7ed',color:'#9a3412',width:'88px'})},'2차 통보')
              )
            ),
            h('tbody',null,
              leaveUsers.map(function(u,i){
                var a  = calcGrantDays(u.hireDate,selYear,u.leaveDate||null);
                var ov = grants[u.sid]&&grants[u.sid][selYear]?grants[u.sid][selYear]:null;
                var t  = ov&&ov.total!=null?ov.total:a.days;
                var co = ov?(ov.carryOver||0):0;
                var gr = t+co;
                var us = calcUsed(u.sid,selYear);
                var re = gr-us.used;
                var ratio = gr>0?us.used/gr:0;
                var color = ratio>=0.8?'#dc2626':ratio>=0.5?'#ea580c':'#16a34a';
                var isSel = u.sid===selSid;
                return h('tr',{key:u.sid,onClick:function(){setSelSid(u.sid);},
                  style:{background:isSel?'#eff6ff':i%2===0?'#fff':'#f8fafc',
                    cursor:'pointer',borderLeft:'3px solid '+(isSel?'#1e40af':'transparent'),
                    borderBottom:'1px solid #f1f5f9'}},
                  h('td',{style:Object.assign({},tdS,{textAlign:'center',color:'#94a3b8',fontFamily:'monospace',fontSize:'11px'})},i+1),
                  h('td',{style:Object.assign({},tdS,{fontWeight:700})},
                    u.name,
                    (u.status==='retired'||u.status==='resigned') && h('span', { style:{ marginLeft:'4px', fontSize:'10px', background:'#fee2e2', color:'#991b1b', padding:'1px 5px', borderRadius:'6px', fontWeight:700, verticalAlign:'middle' } }, '퇴사'),
                    u.leaveRecalcApplied && h('span', { title:'퇴직 시 입사일 기준 연차 재산정 적용됨',
                      style:{ marginLeft:'4px', fontSize:'10px', background:'#e0f2fe', color:'#1d4ed8',
                        padding:'1px 5px', borderRadius:'6px', fontWeight:700, verticalAlign:'middle' } }, '🔄재산정'),
                    h('div',{style:{fontSize:'10.5px',color:'#94a3b8',fontWeight:400}},u.title)),
                  h('td',{style:Object.assign({},tdS,{textAlign:'right',fontFamily:'monospace'})},
                    ov?h('span',{style:{color:'#2563eb',fontWeight:700},title:'수동 설정 (자동:'+a.days+'일)'},t+'⚙'):t),
                  h('td',{style:Object.assign({},tdS,{textAlign:'right',fontFamily:'monospace',color:co>0?'#2563eb':'#cbd5e1'})},co>0?co:'-'),
                  h('td',{style:Object.assign({},tdS,{textAlign:'right',fontFamily:'monospace',fontWeight:700,background:'#eff6ff'})},gr),
                  h('td',{style:Object.assign({},tdS,{textAlign:'right',fontFamily:'monospace',fontWeight:700,color:color,background:'#fefce8'}),title:'연'+us.fullDays+'·반'+us.halfDays+'·시'+us.hourTotal+'h'},
                    Math.round(us.used*10)/10),
                  h('td',{style:Object.assign({},tdS,{textAlign:'right',fontFamily:'monospace',fontWeight:800,fontSize:'13px',color:re<0?'#dc2626':'#2563eb',background:'#ecfeff'})},
                    Math.round(re*10)/10),
                  // ── 1차/2차 통보 (사용촉진 데이터 인라인) ──
                  (function(){
                    var pstage = calcLeavePromoStage(u.hireDate, selYear);
                    var prec = promoRecOf(u.sid);
                    var hasRemain = re > 0;   // 잔여 있을 때만 촉진 대상
                    var isRetiredU = (u.status==='retired' || u.status==='resigned');  // 퇴사자는 촉진 불필요
                    if(isRetiredU) hasRemain = false;
                    // 통보 셀 렌더: 완료(날짜+✎) / 시기도래(＋기록) / 아직(—)
                    function noticeCell(round){
                      if(isRetiredU) return h('span',{style:{fontSize:'10px',color:'#cbd5e1'}, title:'퇴사자 — 사용촉진 불필요'},'—');
                      var dateVal = prec ? (round===1 ? prec.n1Date : prec.n2Date) : null;
                      var byVal   = prec ? (round===1 ? prec.n1By   : prec.n2By)   : null;
                      var sentAt  = prec ? (round===1 ? prec.n1SentAt : prec.n2SentAt) : null;
                      var planned = round===1 ? pstage.p1 : pstage.p2;   // 예정일
                      var plannedStr = planned ? lmFmt(planned) : null;
                      var reached = hasRemain && (round===1
                        ? (pstage.stage==='1차 통보 시기' || pstage.stage==='2차 통보 시기' || pstage.stage==='만료')
                        : (pstage.stage==='2차 통보 시기' || pstage.stage==='만료'));
                      if(dateVal){
                        return h('span',{title:(byVal?('기록자: '+byVal):'')+(sentAt?(' · 메일발송 '+sentAt):'')+' · 클릭하여 날짜 수정',
                            onClick:function(e){ e.stopPropagation();
                              var nd = window.prompt((round===1?'1차':'2차')+' 통보일 (YYYY-MM-DD, 비우면 기록 삭제)', dateVal);
                              if(nd===null) return;
                              nd = nd.trim();
                              if(nd===''){ var pp={}; pp[round===1?'n1Date':'n2Date']=null; pp[round===1?'n1By':'n2By']=null; promoPatch(u.sid, pp); }
                              else if(/^\d{4}-\d{2}-\d{2}$/.test(nd)){ var pp2={}; pp2[round===1?'n1Date':'n2Date']=nd; pp2[round===1?'n1By':'n2By']=(CURRENT_USER?CURRENT_USER.name:''); promoPatch(u.sid, pp2); }
                              else showToast('날짜 형식은 YYYY-MM-DD');
                            },
                            style:{display:'inline-flex',alignItems:'center',gap:'3px',fontSize:'10px',fontWeight:700,color:'#16a34a',background:'#f0fdf4',border:'1px solid #bbf7d0',borderRadius:'6px',padding:'2px 6px',fontFamily:'monospace',cursor:'pointer'}},
                          '✓ '+dateVal.slice(5), sentAt ? h('span',{style:{color:'#2563eb',fontSize:'9px'}},'📧') : h('span',{style:{color:'#94a3b8',fontSize:'9px'}},'✎'));
                      }
                      if(reached){
                        return h('span',{style:{display:'inline-flex',flexDirection:'column',gap:'2px',alignItems:'center'}},
                          plannedStr ? h('span',{style:{fontSize:'9px',color:'#c2410c',fontFamily:'monospace',fontWeight:700}}, plannedStr.slice(5)+' 예정') : null,
                          h('span',{style:{display:'flex',gap:'3px'}},
                            h('button',{title:'통보서 메일 발송 + 통보일 기록',
                              onClick:function(e){ e.stopPropagation(); sendPromoFromList(u, round, Math.round(re*10)/10, pstage.expiryStr); },
                              style:{fontSize:'9.5px',fontWeight:700,color:'#fff',background:'#ea580c',border:'none',borderRadius:'6px',padding:'2px 7px',cursor:'pointer',whiteSpace:'nowrap'}},'📧 발송'),
                            h('button',{title:'메일 없이 통보일만 기록 (Shift+클릭: 날짜 입력)',
                              onClick:function(e){ e.stopPropagation();
                                var d = todayYMD();
                                if(e.shiftKey){ var nd=window.prompt((round===1?'1차':'2차')+' 통보일 (YYYY-MM-DD)', d); if(nd===null) return; nd=nd.trim(); if(!/^\d{4}-\d{2}-\d{2}$/.test(nd)){ showToast('날짜 형식은 YYYY-MM-DD'); return; } d=nd; }
                                var pp={}; pp[round===1?'n1Date':'n2Date']=d; pp[round===1?'n1By':'n2By']=(CURRENT_USER?CURRENT_USER.name:'');
                                promoPatch(u.sid, pp);
                                showToast((round===1?'1차':'2차')+' 통보 기록 ('+d+')');
                              },
                              style:{fontSize:'9.5px',fontWeight:700,color:'#64748b',background:'#fff',border:'1px dashed #cbd5e1',borderRadius:'6px',padding:'2px 6px',cursor:'pointer'}},'기록')
                          )
                        );
                      }
                      // 아직 시기 전 — 예정일 흐리게
                      return plannedStr && hasRemain
                        ? h('span',{style:{fontSize:'9.5px',color:'#cbd5e1',fontFamily:'monospace'}}, plannedStr.slice(5)+' 예정')
                        : h('span',{style:{fontSize:'10px',color:'#cbd5e1'}},'—');
                    }
                    return [
                      h('td',{key:'n1',style:Object.assign({},tdS,{textAlign:'center',padding:'3px'})}, noticeCell(1)),
                      h('td',{key:'n2',style:Object.assign({},tdS,{textAlign:'center',padding:'3px'})}, noticeCell(2))
                    ];
                  })(),
                  h('td',{style:Object.assign({},tdS,{textAlign:'center',padding:'3px'})},
                    h('button',{onClick:function(e){e.stopPropagation();setSelSid(u.sid);openOverride();},
                      style:{padding:'2px 6px',background:'#f1f5f9',color:'#475569',border:'1px solid #cbd5e1',borderRadius:'5px',cursor:'pointer',fontSize:'10px'}},'수정'))
                );
              }),
              // 합계
              h('tr',{style:{background:'#1e40af',color:'#fff'}},
                h('td',{style:{padding:'7px 10px',fontWeight:800}},'합계'),
                h('td',{colSpan:2,style:{padding:'7px',textAlign:'right',fontFamily:'monospace'}},''),
                h('td',{style:{padding:'7px 10px',textAlign:'right',fontFamily:'monospace',fontWeight:800}},
                  leaveUsers.reduce(function(s,u){var a=calcGrantDays(u.hireDate,selYear);var ov=grants[u.sid]&&grants[u.sid][selYear];var t=ov&&ov.total!=null?ov.total:a.days;var co=ov?(ov.carryOver||0):0;return s+t+co;},0)),
                h('td',{style:{padding:'7px 10px',textAlign:'right',fontFamily:'monospace',fontWeight:800}},
                  Math.round(leaveUsers.reduce(function(s,u){return s+calcUsed(u.sid,selYear).used;},0)*10)/10),
                h('td',{style:{padding:'7px 10px',textAlign:'right',fontFamily:'monospace',fontWeight:800}},
                  Math.round(leaveUsers.reduce(function(s,u){var a=calcGrantDays(u.hireDate,selYear);var ov=grants[u.sid]&&grants[u.sid][selYear];var t=ov&&ov.total!=null?ov.total:a.days;var co=ov?(ov.carryOver||0):0;return s+(t+co-calcUsed(u.sid,selYear).used);},0)*10)/10),
                h('td',null),
                h('td',null),
                h('td',null)
              )
            )
          )
        ),
        h('div',{style:{fontSize:'10.5px',color:'#94a3b8',marginTop:'6px'}},
          '💡 직원 클릭 → 우측에서 상세 분석 보기 | ⚙️ = 수동 설정값')
      ),

      // ─ 우: 선택 직원 개인 달력
      h('div',null,
        selUser&&h('div',{style:{background:'#fff',border:'1px solid #e2e8f0',borderRadius:'8px',padding:'12px 14px',marginBottom:'10px'}},
          // 직원 정보 + 연차 현황 바
          h('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom: auto.isOldEmp ? '6px' : '10px'}},
            h('div',null,
              h('span',{style:{fontWeight:800,fontSize:'16px',color:'#1e293b'}},selUser.name),
              h('span',{style:{fontSize:'12px',color:'#64748b',marginLeft:'6px'}},selUser.title),
              h('span',{style:{fontSize:'11px',color:'#94a3b8',marginLeft:'6px'}},'입사 '+(selUser.hireDate||'-'))
            ),
            h('div',{style:{display:'flex',gap:'8px',fontSize:'12px'}},
              h('span',{style:{background:'#eff6ff',color:'#1e40af',padding:'3px 10px',borderRadius:'6px',fontWeight:700}},'총 '+grant+'일'),
              h('span',{style:{background:'#fefce8',color:'#854d0e',padding:'3px 10px',borderRadius:'6px',fontWeight:700}},'사용 '+Math.round(used.used*10)/10+'일'),
              h('span',{style:{background:'#ecfeff',color:'#2563eb',padding:'3px 10px',borderRadius:'6px',fontWeight:800,fontSize:'13px'}},'잔여 '+Math.round(remain*10)/10+'일'),
              h('button',{onClick:openOverride,style:{padding:'3px 8px',background:'#f1f5f9',border:'1px solid #cbd5e1',borderRadius:'4px',cursor:'pointer',fontSize:'11px',color:'#475569'}},'부여일수 수정')
            )
          ),
          // 5인이상 전환 안내 (2021-06-01 이전 입사자만)
          auto.isOldEmp && h('div',{style:{background:'#fff7ed',border:'1px solid #fed7aa',borderRadius:'6px',padding:'8px 12px',marginBottom:'10px',fontSize:'11.5px',color:'#9a3412'}},
            h('span',{style:{fontWeight:700,marginRight:'4px'}},'📋 연차 기산일 안내'),
            '실제 입사일('+selUser.hireDate+')과 연차 기산일이 다릅니다.',
            h('br',null),
            '푸른노무법인은 ',h('strong',null,'2021년 06월 01일'),' 5인이상 사업장으로 전환되어 근로기준법상 연차가 적용되었습니다.',
            h('br',null),
            '이전 입사자의 연차는 ',h('strong',null,'2021-06-01'),
            '부터 기산하며, 실제 입사일('+selUser.hireDate+')로부터 2021-05-31까지는 연차 미발생 기간입니다.'
          ),
          // 잔여 프로그레스 바
          h('div',{style:{background:'#e2e8f0',borderRadius:'4px',height:'8px',overflow:'hidden'}},
            h('div',{style:{width:Math.min(100,grant>0?used.used/grant*100:0)+'%',height:'100%',
              background:used.used/grant>=0.8?'#dc2626':used.used/grant>=0.5?'#ea580c':'#16a34a',
              transition:'width 0.3s'}}))
        ),

        // ── 사용촉진 관리 (사용촉진 탭 통합) ──
        selUser && (function(){
          // 퇴사자는 사용촉진 불필요 — 카드 자체를 표시하지 않음
          if(selUser.status==='retired' || selUser.status==='resigned') return null;
          var pst = calcLeavePromoStage(selUser.hireDate, selYear);
          var prec = promoRecOf(selUser.sid);
          var remainNum = Math.round(remain*10)/10;
          var noP = remainNum <= 0;
          var rObj = { name:selUser.name, remain:remainNum, expiry:pst.expiry };
          var kS = {width:'64px',fontSize:'11px',fontWeight:700,color:'#475569',flexShrink:0};
          var rowS = {display:'flex',alignItems:'center',gap:'8px',padding:'8px 12px',borderBottom:'1px solid #f5f7fa',flexWrap:'wrap'};
          var btnO = {padding:'5px 11px',background:'#ea580c',color:'#fff',border:'none',borderRadius:'6px',fontSize:'11px',fontWeight:700,cursor:'pointer'};
          var btnW = {padding:'5px 11px',background:'#fff',color:'#0d9488',border:'1px solid #5eead4',borderRadius:'6px',fontSize:'11px',fontWeight:700,cursor:'pointer'};
          function noticeRow(round){
            var dateVal = prec ? (round===1?prec.n1Date:prec.n2Date) : null;
            var sentAt  = prec ? (round===1?prec.n1SentAt:prec.n2SentAt) : null;
            var planned = round===1 ? pst.p1 : pst.p2;
            var plannedStr = planned ? lmFmt(planned) : null;
            var reached = !noP && (round===1
              ? (pst.stage==='1차 통보 시기'||pst.stage==='2차 통보 시기'||pst.stage==='만료')
              : (pst.stage==='2차 통보 시기'||pst.stage==='만료'));
            var left;
            if(dateVal){
              left = h('span',{style:{display:'inline-flex',alignItems:'center',gap:'5px',fontSize:'11px',fontWeight:700,color:'#166534'}},
                '✓ '+dateVal, sentAt ? h('span',{style:{fontSize:'10px',color:'#2563eb',background:'#eff6ff',border:'1px solid #bfdbfe',borderRadius:'6px',padding:'1px 6px',fontWeight:700}},'📧 '+sentAt) : null);
            } else if(reached){
              left = h('span',{style:{display:'inline-flex',gap:'6px',alignItems:'center'}},
                plannedStr ? h('span',{style:{fontSize:'11px',color:'#c2410c',fontFamily:'monospace',fontWeight:700}}, plannedStr+' 예정') : null,
                h('button',{style:btnO,onClick:function(){ sendPromoFromList(selUser, round, remainNum, pst.expiryStr); }},'📧 발송'));
            } else {
              left = h('span',{style:{fontSize:'11px',color:'#cbd5e1'}}, plannedStr && !noP ? (plannedStr+' 예정') : '—');
            }
            return h('div',{style:rowS},
              h('span',{style:kS}, round===1?'1차 통보':'2차 통보'),
              left,
              h('button',{style:Object.assign({},btnW,{marginLeft:'auto'}),onClick:function(){
                  var opts = {};
                  if(round===2){ var a=window.prompt('회사가 지정한 사용일을 입력하세요 (예: 2026-08-10 ~ 08-14)', (prec&&prec.n2Assign)||''); if(a==null||!String(a).trim()) return; opts.assign=String(a).trim(); }
                  var res = printLeaveNotice(rObj, round, opts);
                  if(res){ var pp={}; if(round===1){ if(!(prec&&prec.n1Date)){ pp.n1Date=res.todayStr; pp.n1By=(CURRENT_USER?CURRENT_USER.name:''); } } else { pp.n2Date=res.todayStr; pp.n2By=(CURRENT_USER?CURRENT_USER.name:''); pp.n2Assign=opts.assign; } if(Object.keys(pp).length) promoPatch(selUser.sid, pp); }
                }},'🖨 '+(round===1?'1차':'2차')+' 통보서')
            );
          }
          return h('div',{style:{background:'#fff',border:'1.5px solid #fdba74',borderRadius:'8px',overflow:'hidden',marginBottom:'10px'}},
            h('div',{style:{display:'flex',alignItems:'center',gap:'8px',padding:'9px 12px',background:'#fff7ed',borderBottom:'1px solid #fed7aa'}},
              h('span',null,'📣'), h('div',{style:{fontSize:'12.5px',fontWeight:800,color:'#9a3412'}},'연차 사용촉진'),
              h('span',{style:{marginLeft:'auto',fontSize:'10.5px',fontWeight:800,color:pst.sc,background:'#fff',border:'1px solid '+pst.sc,borderRadius:'11px',padding:'2px 9px'}}, pst.stage)),
            noP
              ? h('div',{style:{padding:'12px',fontSize:'11.5px',color:'#94a3b8',textAlign:'center'}}, '잔여 연차가 없어 촉진 대상이 아닙니다')
              : h('div',null,
                  noticeRow(1),
                  noticeRow(2),
                  h('div',{style:rowS},
                    h('span',{style:kS},'사용 신청'),
                    h('input',{type:'text', value:(prec&&prec.request)||'', placeholder:'예: 8/15~8/19, 5일',
                      onChange:function(e){ var v=e.target.value; var cur=promoRecOf(selUser.sid); promoPatch(selUser.sid,{ request:v, requestDate:(v?((cur&&cur.requestDate)||todayYMD()):null) }); },
                      style:{flex:1,minWidth:'150px',padding:'6px 9px',border:'1px solid #cbd5e1',borderRadius:'6px',fontSize:'11.5px'}}),
                    (prec&&prec.requestDate) ? h('span',{style:{fontSize:'10.5px',color:'#64748b'}}, '신청일 '+prec.requestDate) : null),
                  h('div',{style:Object.assign({},rowS,{borderBottom:'none'})},
                    h('span',{style:kS},'비고'),
                    h('input',{type:'text', value:(prec&&prec.note)||'', placeholder:'메모(선택)',
                      onChange:function(e){ promoPatch(selUser.sid,{ note:e.target.value }); },
                      style:{flex:1,minWidth:'150px',padding:'6px 9px',border:'1px solid #cbd5e1',borderRadius:'6px',fontSize:'11.5px'}}))
                )
          );
        })(),

        // 연도별 사용 이력 + 시각화 대시보드
        selUser&&(function(){
          var hire = selUser.hireDate ? new Date(selUser.hireDate) : null;
          if(!hire || isNaN(hire.getTime())) return h('div',{style:{marginTop:'14px',padding:'14px',background:'#fef3c7',border:'1px solid #fde68a',borderRadius:'8px',fontSize:'11.5px',color:'#92400e'}},'⚠️ 입사일이 없어 이력을 표시할 수 없습니다');
          // 2021-06-01 이전 입사자는 연차 이력 표시를 2021년부터 시작
          var effectiveHireStr = (selUser.hireDate < PUREUN_5IN_DATE) ? PUREUN_5IN_DATE : selUser.hireDate;
          var startY = new Date(effectiveHireStr).getFullYear();
          var endY = (new Date()).getFullYear();
          var thisY = endY;
          var allRecs = (attendance||[]).filter(function(r){
            return r.sid===selUser.sid && r.date &&
              (r.type==='leave' || r.type==='halfday-am' || r.type==='halfday-pm' || r.type==='leave-hour');
          });
          function calcYearStat(y){
            var ystr = String(y);
            var grantInfo = calcGrantDays(selUser.hireDate, y, selUser.leaveDate);
            var override = (grants[selUser.sid]||{})[ystr];
            var grantDays = override && typeof override.total==='number' ? override.total : grantInfo.days;
            var carry = override && typeof override.carryOver==='number' ? override.carryOver : 0;
            var totalGrant = grantDays + carry;
            var recs = allRecs.filter(function(r){return r.date.startsWith(ystr+'-');});
            var lc = recs.filter(function(r){return r.type==='leave';}).length;
            var hc = recs.filter(function(r){return r.type==='halfday-am' || r.type==='halfday-pm';}).length;
            var ht = recs.filter(function(r){return r.type==='leave-hour';}).reduce(function(s,r){return s+(Number(r.hours)||0);},0);
            var used = lc + hc*0.5 + ht/8;
            return { y:y, totalGrant:totalGrant, grantDays:grantDays, carry:carry, used:used, remain:Math.max(0,totalGrant-used), recs:recs };
          }
          var years = [];
          for(var y=endY; y>=startY; y--) years.push(y);
          var yearStats = years.map(calcYearStat);
          var thisYStat = yearStats[0] || { totalGrant:0, grantDays:0, carry:0, used:0, remain:0 };
          var totalUsed = yearStats.reduce(function(s,x){return s+x.used;},0);
          var avgPerYear = totalUsed / Math.max(1, years.length);
          // 뷰모드별 선택 연도 stat
          var selY = (viewMode === 'single') ? selSingleYear : thisY;
          var selYStat = yearStats.find(function(s){return s.y===selY;}) || calcYearStat(selY);
          var leaveAll = allRecs.filter(function(r){return r.type==='leave';}).length;
          var halfAll = allRecs.filter(function(r){return r.type==='halfday-am' || r.type==='halfday-pm';}).length;
          var hourAll = allRecs.filter(function(r){return r.type==='leave-hour';}).reduce(function(s,r){return s+(Number(r.hours)||0);},0);
          // 월별 히트맵 데이터
          var monthData = {};
          allRecs.forEach(function(r){ var ym = r.date.slice(0,7); monthData[ym] = (monthData[ym]||0) + 1; });
          var allCnts = []; for(var k in monthData){ allCnts.push(monthData[k]); }
          var maxMonth = allCnts.length>0 ? Math.max.apply(null, allCnts) : 1;
          function heatColor(cnt){
            if(cnt===0) return '#fff';
            var ratio = cnt / maxMonth;
            if(ratio < 0.25) return '#dcfce7';
            if(ratio < 0.5) return '#86efac';
            if(ratio < 0.75) return '#22c55e';
            return '#16a34a';
          }
          // 뷰모드별 타임라인 대상 기록
          var viewRecs = (viewMode === 'single')
            ? allRecs.filter(function(r){return r.date.startsWith(selY+'-');})
            : allRecs;
          var sortedRecs = viewRecs.slice().sort(function(a,b){return b.date.localeCompare(a.date);});
          // ── 사용촉진 이벤트를 타임라인에 병합 (연도별) ──
          (function(){
            var allPromo = dbGet('leave_promotion', []) || [];
            var mine = allPromo.filter(function(p){ return p.sid===selUser.sid; });
            var evts = [];
            mine.forEach(function(p){
              if(p.n1Date) evts.push({ id:'promo-n1-'+p.year, date:p.n1Date, type:'promo-n1', note:'사용촉진 1차 통보'+(p.n1SentAt?' · 메일발송':'') });
              if(p.n2Date) evts.push({ id:'promo-n2-'+p.year, date:p.n2Date, type:'promo-n2', note:'사용시기 지정 통보'+(p.n2Assign?(' ('+p.n2Assign+')'):'')+(p.n2SentAt?' · 메일발송':'') });
              if(p.request && p.requestDate) evts.push({ id:'promo-req-'+p.year, date:p.requestDate, type:'promo-req', note:'사용시기 회신: '+p.request });
            });
            // single 모드면 해당 연도만
            if(viewMode==='single') evts = evts.filter(function(e){ return (e.date||'').startsWith(selY+'-'); });
            if(evts.length){
              sortedRecs = sortedRecs.concat(evts).sort(function(a,b){return (b.date||'').localeCompare(a.date||'');});
            }
          })();
          var viewLeave = viewRecs.filter(function(r){return r.type==='leave';}).length;
          var viewHalf  = viewRecs.filter(function(r){return r.type==='halfday-am' || r.type==='halfday-pm';}).length;
          var viewHour  = viewRecs.filter(function(r){return r.type==='leave-hour';}).reduce(function(s,r){return s+(Number(r.hours)||0);},0);
          var TYPE_BADGES = {
            'leave':       { label:'연차',     color:'#166534', bg:'#dcfce7' },
            'halfday-am':  { label:'오전반차', color:'#2563eb', bg:'#cffafe' },
            'halfday-pm':  { label:'오후반차', color:'#2563eb', bg:'#cffafe' },
            'leave-hour':  { label:'시간연차', color:'#1e40af', bg:'#ede9fe' },
            'promo-n1':    { label:'1차 촉진', color:'#ea580c', bg:'#ffedd5' },
            'promo-n2':    { label:'2차 촉진', color:'#dc2626', bg:'#fee2e2' },
            'promo-req':   { label:'사용신청', color:'#1e40af', bg:'#dbeafe' }
          };
          return h('div',{style:{marginTop:'14px',display:'flex',flexDirection:'column',gap:'12px'}},
            // ── 모드 토글 + (single) 연도 탭
            h('div',{style:{background:'#fff',border:'1px solid #e2e8f0',borderRadius:'8px',padding:'10px 12px',display:'flex',gap:'10px',alignItems:'center',flexWrap:'wrap'}},
              h('div',{style:{display:'inline-flex',gap:'4px',background:'#f1f5f9',padding:'3px',borderRadius:'7px'}},
                ['single','multi'].map(function(m){
                  var on = viewMode === m;
                  return h('button',{key:m,onClick:function(){setViewMode(m);},
                    style:{padding:'5px 12px',border:'none',background:on?'#1e40af':'transparent',color:on?'#fff':'#64748b',borderRadius:'5px',fontSize:'12px',fontWeight:on?700:500,cursor:'pointer'}},
                    m==='single'?'📅 연도별':'📊 다년 비교');
                })
              ),
              viewMode === 'single' && h('select',{
                value:selSingleYear,
                onChange:function(e){setSelSingleYear(parseInt(e.target.value,10));},
                style:{padding:'6px 10px',border:'1px solid #cbd5e1',borderRadius:'5px',fontSize:'12px',fontWeight:700,color:'#1e40af',background:'#fff',cursor:'pointer'}
              },
                years.map(function(y){
                  return h('option',{key:y, value:y}, y+'년'+(y===thisY?' (현재)':''));
                })
              )
            ),
            // ── 1. KPI 4개 (한 줄 compact) ──
            h('div',{style:{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:'4px',padding:'2px 0'}},
              [
                {bg:'#eff6ff',bd:'#bfdbfe',fc:'#1e40af', label:'📋 부여', val:selYStat.totalGrant.toFixed(1)+'일', sub:'기본'+selYStat.grantDays+(selYStat.carry>0?'+이월'+selYStat.carry:'')},
                {bg:'#f0fdf4',bd:'#bbf7d0',fc:'#16a34a', label:'✅ 사용', val:selYStat.used.toFixed(1)+'일',        sub:selYStat.totalGrant>0?(selYStat.used/selYStat.totalGrant*100).toFixed(0)+'%':'-'},
                {bg:selYStat.remain<=0?'#fef2f2':selYStat.remain<3?'#fff7ed':'#f8fafc',
                 bd:selYStat.remain<=0?'#fecaca':selYStat.remain<3?'#fed7aa':'#e2e8f0',
                 fc:selYStat.remain<=0?'#dc2626':selYStat.remain<3?'#ea580c':'#1e293b',
                 label:'⏳ 잔여', val:selYStat.remain.toFixed(1)+'일', sub:'12-31소멸'},
                {bg:'#f5f3ff',bd:'#ddd6fe',fc:'#2563eb', label:'📆 누적', val:totalUsed.toFixed(1)+'일', sub:'평균'+avgPerYear.toFixed(1)+'/년'}
              ].map(function(k){
                return h('div',{key:k.label, title:k.sub, style:{background:k.bg,border:'1px solid '+k.bd,borderRadius:'5px',padding:'3px 5px',textAlign:'center'}},
                  h('div',{style:{fontSize:'10px',color:k.fc,fontWeight:700,whiteSpace:'nowrap'}}, k.label),
                  h('div',{style:{fontSize:'11px',fontWeight:800,color:k.fc,lineHeight:1.4}}, k.val)
                );
              })
            ),
            // ── 2. 연도별 가로 막대 (multi 모드 전용) ──
            viewMode === 'multi' && h('div',{style:{background:'#fff',border:'1px solid #e2e8f0',borderRadius:'8px'}},
              h('div',{onClick:function(){toggleSec('yearly');},
                style:{padding:'10px 14px',cursor:'pointer',fontSize:'12px',fontWeight:700,color:'#475569',display:'flex',justifyContent:'space-between',alignItems:'center',borderBottom: secCollapsed.yearly?'none':'1px solid #f1f5f9'}},
                h('span',null,'📊 연도별 부여·사용·잔여'),
                h('div',{style:{display:'flex',alignItems:'center',gap:'8px'}},
                  h('span',{style:{fontSize:'10px',color:'#94a3b8',fontWeight:500}},'연도 클릭: 월별 타임라인'),
                  h('span',{style:{color:'#94a3b8',fontSize:'11px'}}, secCollapsed.yearly?'▶':'▼')
                )
              ),
              !secCollapsed.yearly && h('div',{style:{padding:'12px 14px'}},
              h('div',{style:{display:'flex',flexDirection:'column',gap:'4px'}},
                yearStats.map(function(s){
                  var ystr = String(s.y);
                  var isOpen = !!expanded[ystr];
                  var isCurrent = s.y === thisY;
                  var usedPct = s.totalGrant>0 ? (s.used/s.totalGrant*100) : 0;
                  var remainPct = s.totalGrant>0 ? (s.remain/s.totalGrant*100) : 0;
                  return h('div',{key:ystr},
                    h('div',{onClick:function(){toggleYear(ystr);},
                      style:{display:'flex',alignItems:'center',gap:'8px',padding:'5px 6px',cursor:'pointer',borderRadius:'4px',background:isCurrent?'#fef3c7':(isOpen?'#eff6ff':'transparent')}},
                      h('span',{style:{width:'66px',fontSize:'11.5px',color:isCurrent?'#92400e':'#1e293b',fontWeight:isCurrent?700:500}}, s.y+(isCurrent?' (현재)':'')),
                      h('div',{style:{flex:1,height:'18px',background:'#f1f5f9',borderRadius:'5px',overflow:'hidden',display:'flex'}},
                        s.totalGrant>0 && h('div',{style:{width:usedPct+'%',height:'100%',background:'#16a34a'}}),
                        s.totalGrant>0 && h('div',{style:{width:remainPct+'%',height:'100%',background:'#fee2e2'}})
                      ),
                      h('span',{style:{fontFamily:'monospace',fontSize:'11px',color:'#16a34a',width:'40px',textAlign:'right',fontWeight:700}}, s.used.toFixed(1)),
                      h('span',{style:{color:'#94a3b8',fontSize:'10px',width:'52px'}}, '/ '+s.totalGrant.toFixed(1)+'일'),
                      h('span',{style:{fontSize:'10px',color:'#94a3b8',width:'18px',textAlign:'center'}}, s.recs.length>0?(isOpen?'▼':'▶'):'-')
                    ),
                    // 연도 펼침: 12개월 그리드 타임라인
                    isOpen && s.recs.length>0 && (function(){
                      var byMonth = {};
                      s.recs.forEach(function(r){
                        var m = r.date.slice(5,7);
                        if(!byMonth[m]) byMonth[m] = [];
                        byMonth[m].push(r);
                      });
                      Object.keys(byMonth).forEach(function(m){ byMonth[m].sort(function(a,b){return a.date.localeCompare(b.date);}); });
                      return h('div',{style:{background:'#f8fafc',borderRadius:'4px',marginTop:'4px',padding:'10px 12px'}},
                        h('div',{style:{fontSize:'10.5px',color:'#64748b',fontWeight:700,marginBottom:'8px'}}, '📅 '+s.y+'년 월별 사용 타임라인'),
                        h('div',{style:{display:'grid',gridTemplateColumns:'repeat(12, 1fr)',gap:'4px'}},
                          [1,2,3,4,5,6,7,8,9,10,11,12].map(function(mn){
                            var mkey = String(mn).padStart(2,'0');
                            var items = byMonth[mkey] || [];
                            var hasItems = items.length > 0;
                            return h('div',{key:mn,style:{background:hasItems?'#fff':'#f8fafc',border:'1px solid '+(hasItems?'#cbd5e1':'#f1f5f9'),borderRadius:'4px',padding:'6px 4px',minHeight:'60px'}},
                              h('div',{style:{fontSize:'10px',fontWeight:700,color:hasItems?'#1e293b':'#cbd5e1',textAlign:'center',marginBottom:'4px',paddingBottom:'3px',borderBottom:'1px solid '+(hasItems?'#e2e8f0':'#f1f5f9')}}, mn+'월'),
                              hasItems
                                ? h('div',{style:{display:'flex',flexDirection:'column',gap:'4px'}},
                                    items.map(function(r,i){
                                      var b0 = TYPE_BADGES[r.type]||{label:r.type,color:'#64748b',bg:'#f1f5f9'};
                                      var detail = r.type==='leave-hour' ? r.hours+'h' : (r.type==='halfday-am'||r.type==='halfday-pm' ? '½' : '');
                                      return h('div',{key:i,title:r.date+' '+b0.label+(r.note?' / '+r.note:''),
                                        style:{background:b0.bg,color:b0.color,fontSize:'10px',padding:'1px 4px',borderRadius:'5px',fontFamily:'monospace',fontWeight:700,textAlign:'center',cursor:'help'}},
                                        r.date.slice(8,10)+(detail?' '+detail:''));
                                    })
                                  )
                                : h('div',{style:{textAlign:'center',color:'#cbd5e1',fontSize:'10px',marginTop:'10px'}},'-')
                            );
                          })
                        )
                      );
                    })()
                  );
                })
              ),
              h('div',{style:{display:'flex',gap:'12px',marginTop:'10px',fontSize:'10px',color:'#64748b',paddingTop:'8px',borderTop:'1px solid #f1f5f9'}},
                h('span',null, h('span',{style:{display:'inline-block',width:'10px',height:'10px',background:'#16a34a',borderRadius:'2px',verticalAlign:'middle',marginRight:'4px'}}), '사용'),
                h('span',null, h('span',{style:{display:'inline-block',width:'10px',height:'10px',background:'#fee2e2',borderRadius:'2px',verticalAlign:'middle',marginRight:'4px'}}), '잔여'),
                h('span',null, h('span',{style:{display:'inline-block',width:'10px',height:'10px',background:'#f1f5f9',borderRadius:'2px',verticalAlign:'middle',marginRight:'4px'}}), '미부여')
              )
              )
            ),
            // ── 3. 월별 히트맵 ──
            h('div',{style:{background:'#fff',border:'1px solid #e2e8f0',borderRadius:'8px'}},
              h('div',{onClick:function(){toggleSec('heatmap');},
                style:{padding:'10px 14px',cursor:'pointer',fontSize:'12px',fontWeight:700,color:'#475569',display:'flex',justifyContent:'space-between',alignItems:'center',borderBottom: secCollapsed.heatmap?'none':'1px solid #f1f5f9'}},
                h('span',null, viewMode==='single' ? '🗓️ '+selY+'년 월별 사용 히트맵' : '🗓️ 월별 사용 히트맵 (최근 6년)'),
                h('span',{style:{color:'#94a3b8',fontSize:'11px'}}, secCollapsed.heatmap?'▶':'▼')
              ),
              !secCollapsed.heatmap && h('div',{style:{padding:'12px 14px'}},
              viewMode === 'single'
                ? h('div',{style:{display:'grid',gridTemplateColumns:'repeat(12, 1fr)',gap:'4px'}},
                    [1,2,3,4,5,6,7,8,9,10,11,12].map(function(m){
                      var ym = selY+'-'+String(m).padStart(2,'0');
                      var cnt = monthData[ym]||0;
                      return h('div',{key:ym,title:ym+': '+cnt+'건',
                        style:{height:'52px',background:heatColor(cnt),border:cnt===0?'1px solid #f1f5f9':'1px solid '+heatColor(cnt),borderRadius:'4px',display:'flex',flexDirection:'column',justifyContent:'center',alignItems:'center',gap:'4px'}},
                        h('div',{style:{fontSize:'10px',color:cnt>0?'#fff':'#94a3b8',fontWeight:700,textShadow:cnt>0?'0 1px 2px rgba(0,0,0,0.2)':'none'}}, m+'월'),
                        cnt>0 && h('div',{style:{fontSize:'13px',color:'#fff',fontWeight:800,textShadow:'0 1px 2px rgba(0,0,0,0.2)'}}, cnt)
                      );
                    })
                  )
                : h('div',{style:{display:'grid',gridTemplateColumns:'40px repeat(12, 1fr)',gap:'4px',fontSize:'10px'}},
                    [h('div',{key:'corner'})].concat(
                      ['1','2','3','4','5','6','7','8','9','10','11','12'].map(function(m){
                        return h('div',{key:'h'+m,style:{textAlign:'center',color:'#94a3b8'}}, m);
                      })
                    ).concat(
                      years.slice(0, 6).map(function(y){
                        var cells = [h('div',{key:'lbl-'+y,style:{fontWeight:700,color:'#475569',fontSize:'10.5px',display:'flex',alignItems:'center'}}, "'"+String(y).slice(2))];
                        for(var m=1; m<=12; m++){
                          var ym = y+'-'+String(m).padStart(2,'0');
                          var cnt = monthData[ym]||0;
                          cells.push(h('div',{key:ym,title:ym+': '+cnt+'건',style:{height:'18px',background:heatColor(cnt),borderRadius:'2px',border:cnt===0?'1px solid #f1f5f9':'none'}}));
                        }
                        return cells;
                      }).reduce(function(a,b){return a.concat(b);},[])
                    )
                  ),
              h('div',{style:{display:'flex',justifyContent:'flex-end',gap:'4px',marginTop:'8px',fontSize:'10px',color:'#94a3b8',alignItems:'center'}},
                h('span',null,'적음'),
                h('div',{style:{width:'14px',height:'14px',background:'#fff',border:'1px solid #e2e8f0',borderRadius:'2px'}}),
                h('div',{style:{width:'14px',height:'14px',background:'#dcfce7',borderRadius:'2px'}}),
                h('div',{style:{width:'14px',height:'14px',background:'#86efac',borderRadius:'2px'}}),
                h('div',{style:{width:'14px',height:'14px',background:'#22c55e',borderRadius:'2px'}}),
                h('div',{style:{width:'14px',height:'14px',background:'#16a34a',borderRadius:'2px'}}),
                h('span',null,'많음')
              )
              )
            ),
            // ── 4. 통합 타임라인 ──
            h('div',{style:{background:'#fff',border:'1px solid #e2e8f0',borderRadius:'8px'}},
              h('div',{onClick:function(){toggleSec('timeline');},
                style:{padding:'10px 14px',cursor:'pointer',fontSize:'12px',fontWeight:700,color:'#475569',display:'flex',justifyContent:'space-between',alignItems:'center',borderBottom: secCollapsed.timeline?'none':'1px solid #f1f5f9',flexWrap:'wrap',gap:'6px'}},
                h('span',null, '📋 '+(viewMode==='single'?selY+'년':'전체')+' 사용 타임라인 ('+sortedRecs.length+'건, 최신순)'),
                h('div',{style:{display:'flex',gap:'4px',fontSize:'10px',alignItems:'center'}},
                  h('span',{style:{padding:'2px 8px',background:'#dcfce7',color:'#166534',borderRadius:'8px',fontWeight:700}}, '연차 '+viewLeave),
                  h('span',{style:{padding:'2px 8px',background:'#cffafe',color:'#2563eb',borderRadius:'8px',fontWeight:700}}, '반차 '+viewHalf),
                  h('span',{style:{padding:'2px 8px',background:'#ede9fe',color:'#1e40af',borderRadius:'8px',fontWeight:700}}, '시간 '+viewHour+'h'),
                  h('span',{style:{color:'#94a3b8',fontSize:'11px',marginLeft:'4px'}}, secCollapsed.timeline?'▶':'▼')
                )
              ),
              !secCollapsed.timeline && h('div',{style:{padding:'12px 14px'}},
              sortedRecs.length === 0
                ? h('div',{style:{textAlign:'center',color:'#94a3b8',padding:'24px',fontSize:'11.5px'}}, '사용 기록 없음')
                : h('div',{style:{maxHeight:'320px',overflowY:'auto',display:'flex',flexDirection:'column',gap:'4px'}},
                    sortedRecs.map(function(r,i){
                      var b0 = TYPE_BADGES[r.type]||{label:r.type,color:'#64748b',bg:'#f1f5f9'};
                      var detail = r.type==='leave-hour' ? ' '+r.hours+'h' : '';
                      return h('div',{key:r.id||i,style:{display:'flex',gap:'10px',alignItems:'center',padding:'6px 8px',borderBottom:'1px solid #f1f5f9',fontSize:'11.5px'}},
                        h('span',{style:{fontFamily:'monospace',color:'#94a3b8',width:'82px',flexShrink:0}}, r.date),
                        h('span',{style:{background:b0.bg,color:b0.color,padding:'1px 8px',borderRadius:'8px',fontWeight:700,fontSize:'10.5px',flexShrink:0}}, b0.label+detail),
                        h('span',{style:{color:'#64748b',flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}, r.note||'-')
                      );
                    })
                  )
              )
            )
          );
        })()
      )
    ),

    tab==='loa' && h(LeaveOfAbsenceTab, null),

    // ============ 💎 보상휴가 탭 ============
    tab==='comp' && (function(){
      var ots = dbGet('overtime_records', []);
      var uses = dbGet('comp_leave_records', []);
      // 직원별 잔여 + 발생/사용 통계
      var rows = users.map(function(u){
        var gen = ots.filter(function(r){return r.sid===u.sid && r.convertedToComp;});
        var generated = gen.reduce(function(s,r){return s+(parseFloat(r.compHours)||0);},0);
        var use = uses.filter(function(r){return r.sid===u.sid;});
        var used = use.reduce(function(s,r){return s+(parseFloat(r.hours)||0);},0);
        return { sid:u.sid, name:u.name, title:u.title, generated:generated, used:used, balance:Math.max(0,generated-used), genCount:gen.length, useCount:use.length };
      });
      var totalGen = rows.reduce(function(s,r){return s+r.generated;},0);
      var totalUse = rows.reduce(function(s,r){return s+r.used;},0);
      var totalBal = rows.reduce(function(s,r){return s+r.balance;},0);
      // 선택된 직원의 상세
      var selRow = rows.find(function(r){return r.sid===selSid;});
      var selUses = uses.filter(function(r){return r.sid===selSid;}).sort(function(a,b){return (b.date||'').localeCompare(a.date||'');});
      var selGen = ots.filter(function(r){return r.sid===selSid && r.convertedToComp;}).sort(function(a,b){return (b.date||'').localeCompare(a.date||'');});

      async function doUseAdd(){
        if(!selSid){ showToast('직원을 선택하세요'); return; }
        if(!compAddForm.date){ showToast('날짜 입력'); return; }
        var hrs = parseFloat(compAddForm.hours)||0;
        if(hrs <= 0){ showToast('시간 입력 (>0)'); return; }
        var bal = getCompLeaveBalance(selSid).balance;
        if(hrs > bal){
          if(!(await popConfirm('잔여 ('+bal.toFixed(1)+'h)를 초과합니다. 그래도 등록할까요?'))) return;
        }
        var all = dbGet('comp_leave_records', []);
        all.push({
          id:'comp-'+Date.now().toString(36)+Math.random().toString(36).slice(2,5)+'-'+Math.random().toString(36).slice(2,5),
          sid:selSid, date:compAddForm.date, hours:hrs, note:compAddForm.note||'',
          createdAt:(new Date()).toISOString()
        });
        dbSet('comp_leave_records', all);
        setCompAddForm(Object.assign({},compAddForm,{hours:1,note:''}));
        bumpComp();
        showToast('💎 보상휴가 '+hrs.toFixed(1)+'h 사용 등록');
      }
      async function delUse(id){
        if(!(await popConfirm('이 사용 기록을 삭제합니까?\n→ 보상휴가 잔여가 복원됩니다.'))) return;
        var all = dbGet('comp_leave_records', []);
        var _prev=all.slice(); dbSet('comp_leave_records', all.filter(function(r){return r.id!==id;}));
        bumpComp();
        showToastUndo('🗑️ 삭제됨', function(){dbSet('comp_leave_records',_prev);});
      }

      return h('div',{style:{display:'grid',gridTemplateColumns:'1fr 1.8fr',gap:'14px',alignItems:'start'}},
        // ─ 좌: 직원별 잔여 테이블
        h('div',null,
          h('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'8px'}},
            h('div',{style:{fontWeight:700,fontSize:'12.5px',color:'#1e293b'}},'💎 직원별 보상휴가'),
            h('div',{style:{fontSize:'10.5px',color:'#1d4ed8',fontWeight:700}}, '전사 잔여 '+totalBal.toFixed(1)+'h')
          ),
          // 전사 요약
          h('div',{style:{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:'6px',marginBottom:'10px'}},
            h('div',{style:{background:'#dcfce7',border:'1px solid #86efac',borderRadius:'6px',padding:'8px',textAlign:'center'}},
              h('div',{style:{fontSize:'10px',color:'#166534'}},'발생'),
              h('div',{style:{fontSize:'14px',fontWeight:800,color:'#166534'}},totalGen.toFixed(1)+'h')),
            h('div',{style:{background:'#fef3c7',border:'1px solid #fde68a',borderRadius:'6px',padding:'8px',textAlign:'center'}},
              h('div',{style:{fontSize:'10px',color:'#92400e'}},'사용'),
              h('div',{style:{fontSize:'14px',fontWeight:800,color:'#92400e'}},totalUse.toFixed(1)+'h')),
            h('div',{style:{background:'#dbeafe',border:'1px solid #93c5fd',borderRadius:'6px',padding:'8px',textAlign:'center'}},
              h('div',{style:{fontSize:'10px',color:'#1e40af'}},'잔여'),
              h('div',{style:{fontSize:'14px',fontWeight:800,color:'#1e40af'}},totalBal.toFixed(1)+'h'))
          ),
          h('div',{style:{border:'1px solid #e2e8f0',borderRadius:'8px',overflow:'hidden',background:'#fff'}},
            h('table',{style:{width:'100%',borderCollapse:'collapse',fontSize:'11.5px'}},
              h('thead',null,h('tr',null,
                h('th',{style:thS},'직원'),
                h('th',{style:Object.assign({},thS,{textAlign:'right'})},'발생'),
                h('th',{style:Object.assign({},thS,{textAlign:'right'})},'사용'),
                h('th',{style:Object.assign({},thS,{textAlign:'right'})},'잔여')
              )),
              h('tbody',null, rows.map(function(r){
                var isSel = r.sid===selSid;
                return h('tr',{key:r.sid, onClick:function(){setSelSid(r.sid);},
                  style:{cursor:'pointer',background:isSel?'#eff6ff':'transparent'}},
                  h('td',{style:tdS},
                    h('div',{style:{fontWeight:700,color:isSel?'#1e40af':'#1e293b'}},r.name),
                    h('div',{style:{fontSize:'10.5px',color:'#94a3b8'}},r.title)),
                  h('td',{style:Object.assign({},tdS,{textAlign:'right',fontFamily:'monospace',color:'#166534'})}, r.generated.toFixed(1)+'h'),
                  h('td',{style:Object.assign({},tdS,{textAlign:'right',fontFamily:'monospace',color:'#92400e'})}, r.used.toFixed(1)+'h'),
                  h('td',{style:Object.assign({},tdS,{textAlign:'right',fontFamily:'monospace',fontWeight:800,color:r.balance>0?'#1e40af':'#94a3b8'})}, r.balance.toFixed(1)+'h')
                );
              }))
            )
          )
        ),
        // ─ 우: 선택 직원 상세
        h('div',null,
          !selRow
            ? h('div',{style:{padding:'40px',textAlign:'center',color:'#94a3b8'}},'좌측에서 직원을 선택하세요')
            : h('div',null,
                // 잔여 카드
                h('div',{style:{background:'#f0f9ff',border:'1px solid #bfdbfe',borderRadius:'8px',padding:'14px 18px',marginBottom:'12px',display:'flex',justifyContent:'space-between',alignItems:'center'}},
                  h('div',null,
                    h('div',{style:{fontSize:'13px',fontWeight:800,color:'#1d4ed8'}}, '💎 '+selRow.name+' - 보상휴가'),
                    h('div',{style:{fontSize:'10.5px',color:'#1d4ed8',marginTop:'2px'}}, '발생 '+selRow.generated.toFixed(1)+'h ('+selRow.genCount+'건) · 사용 '+selRow.used.toFixed(1)+'h ('+selRow.useCount+'건)')
                  ),
                  h('div',{style:{fontSize:'24px',fontWeight:800,color:selRow.balance>0?'#1d4ed8':'#94a3b8',fontFamily:'monospace'}}, selRow.balance.toFixed(1)+'h')
                ),
                // 사용 추가 폼
                h('div',{style:{background:'#f8fafc',border:'1px solid #e2e8f0',borderRadius:'8px',padding:'10px 12px',marginBottom:'12px'}},
                  h('div',{style:{fontSize:'11.5px',fontWeight:700,color:'#475569',marginBottom:'8px'}},'➕ 보상휴가 사용 등록'),
                  h('div',{style:{display:'grid',gridTemplateColumns:'130px 80px 1fr 70px',gap:'6px',alignItems:'center'}},
                    h(KoreanDatePicker,{value:compAddForm.date,
                      onChange:function(e){var v=(e&&e.target)?e.target.value:e; setCompAddForm(Object.assign({},compAddForm,{date:v}));},
                      style:{width:'100%'}}),
                    h('input',{type:'number',min:0,step:'0.5',value:compAddForm.hours,placeholder:'시간',
                      onChange:function(e){setCompAddForm(Object.assign({},compAddForm,{hours:e.target.value}));},
                      style:{padding:'5px 8px',border:'1px solid #cbd5e1',borderRadius:'4px',fontSize:'12px',textAlign:'right',fontFamily:'monospace'}}),
                    h('input',{type:'text',value:compAddForm.note,placeholder:'사유 (선택)',
                      onChange:function(e){setCompAddForm(Object.assign({},compAddForm,{note:e.target.value}));},
                      onKeyDown:function(e){if(e.key==='Enter') doUseAdd();},
                      style:{padding:'5px 8px',border:'1px solid #cbd5e1',borderRadius:'4px',fontSize:'12px'}}),
                    h('button',{onClick:doUseAdd,
                      style:{padding:'5px 10px',background:'#1d4ed8',color:'#fff',border:'none',borderRadius:'4px',cursor:'pointer',fontSize:'12px',fontWeight:700}},'+ 사용')
                  )
                ),
                // 발생 이력
                h('div',{style:{marginBottom:'12px'}},
                  h('div',{style:{fontSize:'11.5px',fontWeight:700,color:'#475569',marginBottom:'6px'}}, '📥 발생 이력 ('+selGen.length+'건)'),
                  h('div',{style:{border:'1px solid #e2e8f0',borderRadius:'6px',overflow:'hidden',maxHeight:'200px',overflowY:'auto',background:'#fff'}},
                    selGen.length===0
                      ? h('div',{style:{padding:'20px',textAlign:'center',color:'#94a3b8',fontSize:'11.5px'}},'발생 이력 없음 — 근태관리 > 초과근로 상세에서 [💱 전환]')
                      : h('table',{style:{width:'100%',borderCollapse:'collapse',fontSize:'11.5px'}},
                          h('thead',null,h('tr',{style:{background:'#f8fafc'}},
                            h('th',{style:Object.assign({},thS,{width:'100px'})},'발생일'),
                            h('th',{style:Object.assign({},thS,{textAlign:'center',width:'70px'})},'종류'),
                            h('th',{style:Object.assign({},thS,{textAlign:'right',width:'70px'})},'원본'),
                            h('th',{style:Object.assign({},thS,{textAlign:'right',width:'70px'})},'보상휴가'),
                            h('th',thS,'사유')
                          )),
                          h('tbody',null, selGen.map(function(r){
                            var label = r.kind==='overtime'?'연장':r.kind==='night'?'야간':'휴일';
                            var color = r.kind==='overtime'?'#ea580c':r.kind==='night'?'#2563eb':'#dc2626';
                            return h('tr',{key:r.id,style:{borderTop:'1px solid #f1f5f9'}},
                              h('td',{style:Object.assign({},tdS,{fontFamily:'monospace',color:'#475569'})}, r.date),
                              h('td',{style:Object.assign({},tdS,{textAlign:'center'})},
                                h('span',{style:{background:color+'22',color:color,padding:'1px 8px',borderRadius:'8px',fontSize:'10px',fontWeight:700}},label)),
                              h('td',{style:Object.assign({},tdS,{textAlign:'right',fontFamily:'monospace',color:'#94a3b8'})}, parseFloat(r.hours).toFixed(1)+'h'),
                              h('td',{style:Object.assign({},tdS,{textAlign:'right',fontFamily:'monospace',fontWeight:700,color:'#1d4ed8'})}, parseFloat(r.compHours||0).toFixed(1)+'h'),
                              h('td',{style:Object.assign({},tdS,{color:'#64748b'})}, r.note||'-')
                            );
                          }))
                        )
                  )
                ),
                // 사용 이력
                h('div',null,
                  h('div',{style:{fontSize:'11.5px',fontWeight:700,color:'#475569',marginBottom:'6px'}}, '📤 사용 이력 ('+selUses.length+'건)'),
                  h('div',{style:{border:'1px solid #e2e8f0',borderRadius:'6px',overflow:'hidden',maxHeight:'240px',overflowY:'auto',background:'#fff'}},
                    selUses.length===0
                      ? h('div',{style:{padding:'20px',textAlign:'center',color:'#94a3b8',fontSize:'11.5px'}},'사용 이력 없음')
                      : h('table',{style:{width:'100%',borderCollapse:'collapse',fontSize:'11.5px'}},
                          h('thead',null,h('tr',{style:{background:'#f8fafc'}},
                            h('th',{style:Object.assign({},thS,{width:'100px'})},'사용일'),
                            h('th',{style:Object.assign({},thS,{textAlign:'right',width:'70px'})},'시간'),
                            h('th',thS,'사유'),
                            h('th',{style:Object.assign({},thS,{textAlign:'center',width:'40px'})},'삭제')
                          )),
                          h('tbody',null, selUses.map(function(r){
                            return h('tr',{key:r.id,style:{borderTop:'1px solid #f1f5f9'}},
                              h('td',{style:Object.assign({},tdS,{fontFamily:'monospace',color:'#475569'})}, r.date),
                              h('td',{style:Object.assign({},tdS,{textAlign:'right',fontFamily:'monospace',fontWeight:700,color:'#92400e'})}, parseFloat(r.hours).toFixed(1)+'h'),
                              h('td',{style:Object.assign({},tdS,{color:'#64748b'})}, r.note||'-'),
                              h('td',{style:Object.assign({},tdS,{textAlign:'center'})},
                                h('button',{onClick:function(){delUse(r.id);},
                                  style:{background:'none',border:'none',color:'#dc2626',fontSize:'14px',cursor:'pointer'}},'×'))
                            );
                          }))
                        )
                  )
                )
              )
        )
      );
    })(),

    // 부여 오버라이드 모달
    modalSid&&h('div',{className:'modal-bg',onClick:function(){setModalSid(null);}},
      h('div',{className:'modal',style:{width:'480px'},onClick:function(e){e.stopPropagation();}},
        h('div',{className:'modal-h'},
          h('div',{className:'t'},'연차 부여일수 수정 - '+(users.find(function(u){return u.sid===modalSid;})||{}).name),
          h('button',{className:'x',onClick:function(){setModalSid(null);}},'×')
        ),
        h('div',{className:'modal-b'},
          h('div',{style:{background:'#eff6ff',border:'1px solid #bfdbfe',borderRadius:'6px',padding:'10px 14px',marginBottom:'14px',fontSize:'11.5px',color:'#1e40af'}},
            '자동 계산값: ',h('strong',null,mForm.autoDays+'일'),
            h('br',null),'수동 입력 시 자동 계산값 무시. "자동으로 복원"으로 되돌릴 수 있습니다.'),
          h('div',{className:'fld'},h('label',null,'부여일수'),
            h('input',{type:'number',min:0,max:99,value:mForm.total,onChange:function(e){setMForm(Object.assign({},mForm,{total:parseInt(e.target.value)||0}));},style:{fontFamily:'monospace',textAlign:'right'}})),
          h('div',{className:'fld'},h('label',null,'전년도 이월'),
            h('input',{type:'number',min:0,max:10,value:mForm.carryOver,onChange:function(e){setMForm(Object.assign({},mForm,{carryOver:parseInt(e.target.value)||0}));},style:{fontFamily:'monospace',textAlign:'right'}}),
            h('div',{style:{fontSize:'10.5px',color:'#94a3b8',marginTop:'3px'}},'최대 '+(policy.carryOverLimit||5)+'일까지 이월'))
        ),
        h('div',{className:'modal-f'},
          h('button',{className:'btn-secondary',onClick:resetOverride},'자동으로 복원'),
          h('div',{style:{flex:1}}),
          h('button',{className:'btn-secondary',onClick:function(){setModalSid(null);}},'취소'),
          h('button',{className:'btn-primary',onClick:saveOverride},'저장')
        )
      )
    )
  );
}
