// ============ 보상휴가제 (근로기준법 57조) ============
// 가산율 자동 적용: 연장 ×1.5, 야간 ×0.5(가산분), 휴일 8h이내 ×1.5 / 8h초과 ×2.0
function calcCompHoursForOT(otRec){
  if(!otRec) return 0;
  var hrs = parseFloat(otRec.hours)||0;
  if(otRec.kind === 'overtime') return hrs * 1.5;
  if(otRec.kind === 'night')    return hrs * 0.5;
  if(otRec.kind === 'holiday'){
    if(hrs <= 8) return hrs * 1.5;
    return 8 * 1.5 + (hrs - 8) * 2.0;
  }
  return hrs;
}
// 직원의 보상휴가 잔여 시간 (발생 - 사용)
function getCompLeaveBalance(sid){
  var ots = dbGet('overtime_records', []);
  var generated = ots.filter(function(r){return r.sid===sid && r.convertedToComp;})
    .reduce(function(s,r){return s + (parseFloat(r.compHours)||0);}, 0);
  var uses = dbGet('comp_leave_records', []);
  var used = uses.filter(function(r){return r.sid===sid;})
    .reduce(function(s,r){return s + (parseFloat(r.hours)||0);}, 0);
  return { generated:generated, used:used, balance:Math.max(0, generated - used) };
}


// ============================================================
// 근태관리 (AttendanceManagement)
// 데이터: attendance_records [{id,date,sid,type,hours,note,createdAt}]
// 타입: leave/halfday-am/halfday-pm/leave-hour/sick/public/late/early/absent/trip
// ============================================================
function AttendanceManagement(){
  var users = getActiveUsers();
  var rs = useState(dbGet('attendance_records', [])); var records = rs[0]; var setRecords = rs[1];
  var atzS = usePersistedState('attendance_zoom', 100); var attZoom = atzS[0]; var setAttZoom = atzS[1];
  // 마운트 시점 id 집합 (의도적 삭제 vs 외부 추가 구분)
  var iis = useState(function(){ var ids={}; (dbGet('attendance_records',[])||[]).forEach(function(r){if(r&&r.id)ids[r.id]=true;}); return ids; });
  var initialIds = iis[0];
  function persist(arr){
    setRecords(arr);
    // 머지: 마운트 후 다른 화면이 추가한 레코드는 보존 (마운트 시점에 있던 id의 삭제는 그대로)
    var latest = dbGet('attendance_records', []) || [];
    var arrIds = {};
    arr.forEach(function(r){ if(r && r.id) arrIds[r.id] = true; });
    var external = latest.filter(function(r){ return r && r.id && !arrIds[r.id] && !initialIds[r.id]; });
    dbSet('attendance_records', arr.concat(external));
  }

  var now = new Date();
  var initYM = now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0');
  var yms = useState(initYM); var selYM = yms[0]; var setSelYM = yms[1];
  // 선택 직원 (기본: 첫 번째)
  var ss = useState(users[0]?users[0].sid:''); var selSid = ss[0]; var setSelSid = ss[1];
  // 탭 (개별/매트릭스/집계)
  var tbs = useState('individual'); var tab = tbs[0]; var setTab = tbs[1];
  // 일자 더블클릭 등록 모달
  var dms = useState(null); var dayModal = dms[0]; var setDayModal = dms[1];

  var TYPES = [
    { v:'leave',       label:'연차',     icon:'🏖️', color:'#16a34a', bg:'#dcfce7', deductLeave:true,  hours:8 },
    { v:'halfday-am',  label:'연차(오전)', icon:'🌅', color:'#2563eb', bg:'#cffafe', deductLeave:true,  hours:4, legacy:true },
    { v:'halfday-pm',  label:'연차(오후)', icon:'🌇', color:'#2563eb', bg:'#cffafe', deductLeave:true,  hours:4, legacy:true },
    { v:'leave-hour',  label:'시간연차', icon:'⏱️', color:'#0d9488', bg:'#ccfbf1', deductLeave:true,  hours:0 },
    { v:'sick',        label:'병가',     icon:'🤒', color:'#dc2626', bg:'#fee2e2' },
    { v:'public',      label:'공가',     icon:'📋', color:'#2563eb', bg:'#ede9fe' },
    { v:'telework',    label:'재택근무', icon:'🏠', color:'#2563eb', bg:'#ede9fe' },
    { v:'late',        label:'지각',     icon:'⏰', color:'#ea580c', bg:'#fff7ed' },
    { v:'early',       label:'조퇴',     icon:'🚪', color:'#ea580c', bg:'#fff7ed' },
    { v:'absent',      label:'결근',     icon:'❌', color:'#991b1b', bg:'#fef2f2' },
    { v:'trip',        label:'출장',     icon:'🚗', color:'#1e40af', bg:'#dbeafe', legacy:true },
    { v:'eum-work',    label:'이음센터', icon:'🏛️', color:'#2563eb', bg:'#ede9fe', legacy:true }
  ];
  var TYPE_MAP = {};
  TYPES.forEach(function(t){ TYPE_MAP[t.v]=t; });
  // 시간대 표시 접미사 + (유형,시간대)→저장형 변환 (연차+오전/오후는 기존 반차 코드로 저장: 차감계산 무변경)
  function periodSfx(r){ return r && r.period==='am' ? '(오전)' : r && r.period==='pm' ? '(오후)' : ''; }
  function resolveTypePeriod(t, p){
    p = p || 'full';
    if(t === 'leave' && p === 'am') return { type:'halfday-am', period:'full' };
    if(t === 'leave' && p === 'pm') return { type:'halfday-pm', period:'full' };
    if(t === 'leave-hour') return { type:t, period:'full' };
    return { type:t, period:p };
  }

  // 빠른 입력 form
  var fs = useState({ date:todayYMD(), type:'leave', hours:1, note:'', period:'full' });
  var form = fs[0]; var setForm = fs[1];

  // 드래그 state
  var dgs = useState(null); var dragId = dgs[0]; var setDragId = dgs[1];
  var dvs = useState(null); var dragOver = dvs[0]; var setDragOver = dvs[1];
  // 팔레트에서 드래그 중인 신규 항목 (type:'leave', hours:0 등)
  var dnts = useState(null); var dragNewItem = dnts[0]; var setDragNewItem = dnts[1];

  function monthPrev(){ var d=new Date(selYM+'-01'); d.setMonth(d.getMonth()-1); setSelYM(d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')); }
  function monthNext(){ var d=new Date(selYM+'-01'); d.setMonth(d.getMonth()+1); setSelYM(d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')); }

  var selUser = users.find(function(u){return u.sid===selSid;});
  // 선택된 직원의 이번 달 기록 (selSid='all'이면 전체 직원)
  var monthRecs = records.filter(function(r){
    if((r.date||'').slice(0,7) !== selYM) return false;
    if(r.type==='eum-work') return false;
    return selSid === 'all' ? true : r.sid === selSid;
  });

  // 이번 달 연차 사용 통계
  var leaveCnt = monthRecs.filter(function(r){return r.type==='leave';}).length;
  var halfCnt  = monthRecs.filter(function(r){return r.type==='halfday-am'||r.type==='halfday-pm';}).length;
  var hourTotal= monthRecs.filter(function(r){return r.type==='leave-hour';}).reduce(function(s,r){return s+(r.hours||0);},0);
  var _selDayH = selUser ? (selUser.scheduledHours || 8) : 8;
  var leaveUsed= leaveCnt + halfCnt*0.5 + hourTotal/_selDayH;

  // 연장/야간/휴일 (payroll_monthly에서)
  function getOT(field){
    // overtime_records가 있으면 우선
    var rec = getOTRecords();
    var fieldToKind = { overtimeHours:'overtime', nightHours:'night', holidayHours:'holiday' };
    var k = fieldToKind[field];
    if(rec.length > 0){
      return rec.filter(function(r){return r.kind===k;}).reduce(function(s,r){return s+(parseFloat(r.hours)||0);}, 0);
    }
    var pms = dbGet('payroll_monthly',[]);
    var pRec = pms.find(function(r){return r.sid===selSid&&r.ym===selYM;});
    return pRec ? (pRec[field]||0) : 0;
  }
  // 초과근로 일자별 기록 (selSid + selYM 기준)
  function getOTRecords(){
    var all = dbGet('overtime_records', []);
    return all.filter(function(r){ return r.sid===selSid && (r.date||'').slice(0,7)===selYM; });
  }
  // 일자별 합계 → payroll_monthly의 overtimeHours/nightHours/holidayHours로 동기화
  // 보상휴가 전환된 항목은 임금 지급 대신 휴가로 보상되므로 제외
  function syncOTToPayroll(){
    var recs = getOTRecords().filter(function(r){return !r.convertedToComp;});
    var sums = { overtimeHours:0, nightHours:0, holidayHours:0 };
    recs.forEach(function(r){
      var f = r.kind==='overtime' ? 'overtimeHours' : r.kind==='night' ? 'nightHours' : r.kind==='holiday' ? 'holidayHours' : null;
      if(f) sums[f] += parseFloat(r.hours)||0;
    });
    var pms = dbGet('payroll_monthly', []);
    var idx = pms.findIndex(function(r){return r.sid===selSid&&r.ym===selYM;});
    if(idx>=0){
      pms[idx] = Object.assign({}, pms[idx], sums);
    } else if(recs.length > 0){
      pms.push(Object.assign({sid:selSid, ym:selYM, status:'draft'}, sums));
    }
    dbSet('payroll_monthly', pms);
  }
  function addOTRecord(date, kind, hours, note){
    var all = dbGet('overtime_records', []);
    all.push({
      id:'ot-'+Date.now().toString(36)+Math.random().toString(36).slice(2,5)+'-'+Math.random().toString(36).slice(2,5),
      sid:selSid, date:date, kind:kind, hours:parseFloat(hours)||0, note:note||'',
      createdAt:(new Date()).toISOString()
    });
    dbSet('overtime_records', all);
    syncOTToPayroll();
  }
  function deleteOTRecord(id){
    var all = dbGet('overtime_records', []);
    dbSet('overtime_records', all.filter(function(r){return r.id!==id;}));
    syncOTToPayroll();
  }
  // 모달 state
  var oms = useState(false); var otModal = oms[0]; var setOtModal = oms[1];
  var oafs = useState({ date:todayYMD(), kind:'overtime', hours:1, note:'' });
  var otAddForm = oafs[0]; var setOtAddForm = oafs[1];
  function setOT(field, val){
    var pms = dbGet('payroll_monthly',[]);
    var idx = pms.findIndex(function(r){return r.sid===selSid&&r.ym===selYM;});
    var v = parseFloat(val)||0;
    if(idx>=0){ pms[idx]=Object.assign({},pms[idx]); pms[idx][field]=v; }
    else pms.push({sid:selSid,ym:selYM,status:'draft',[field]:v});
    dbSet('payroll_monthly',pms);
  }

  // 등록
  async function addRecord(ds){
    if(!selSid || selSid==='all'){ showToast('개별 직원을 선택하세요'); return; }
    var _rp = resolveTypePeriod(form.type, form.period);
    var type = _rp.type;
    var period = _rp.period;
    var hours = 0;
    if(type==='leave-hour'){
      var _sh = users.find(function(u){return u.sid===selSid;});
      var _maxH = (_sh && _sh.scheduledHours ? _sh.scheduledHours : 8) - 1;
      hours = parseFloat(form.hours);
      if(!isFinite(hours)||hours<1||hours>_maxH||hours!==Math.floor(hours)){ showToast('시간연차 1~'+_maxH+' 정수 (소정'+(_maxH+1)+'h)'); return; }
    }
    var date = ds || form.date;
    // 중복 검사
    var dup = records.find(function(r){
      if(r.sid!==selSid||r.date!==date||r.type!==type) return false;
      if((r.period||'full') !== period) return false;
      if(type==='leave-hour') return (r.hours||0)===hours;
      return true;
    });
    if(dup && !await popConfirm('같은 항목이 이미 있습니다. 추가할까요?')) return;
    var rec = { id:'att-'+Date.now().toString(36)+Math.random().toString(36).slice(2,5),
      date:date, sid:selSid, type:type, note:form.note||'',
      createdAt:(new Date()).toISOString() };
    if(type==='leave-hour') rec.hours=hours;
    if(period!=='full') rec.period=period;
    persist([rec].concat(records));
    showToast(type==='leave-hour'?'시간연차 '+hours+'h 등록':'등록 완료');
  }

  function delRecord(id){
    var _ud=records.slice(); persist(records.filter(function(r){return r.id!==id;}));
    showToastUndo('🗑️ 근태기록 삭제됨', function(){persist(_ud);});
  }

  // 캘린더 더블클릭 모달 등록
  async function submitDayModal(){
    if(!dayModal) return;
    if(!selSid || selSid==='all'){ showToast('개별 직원을 선택하세요'); return; }
    var _rp2 = resolveTypePeriod(dayModal.type, dayModal.period);
    var attType = dayModal.type ? _rp2.type : '';
    var attPeriod = _rp2.period;
    var otOver = parseFloat(dayModal.otOvertime)||0;
    var otNight = parseFloat(dayModal.otNight)||0;
    var otHoliday = parseFloat(dayModal.otHoliday)||0;
    var hasOT = otOver>0 || otNight>0 || otHoliday>0;
    if(!attType && !hasOT){ showToast('근태 유형 또는 초과근로 시간을 입력하세요'); return; }
    var msgs = [];
    if(attType){
      var hours = 0;
      if(attType==='leave-hour'){
        var _su2 = users.find(function(u){return u.sid===selSid;});
        var _mh2 = (_su2 && _su2.scheduledHours ? _su2.scheduledHours : 8) - 1;
        hours = parseFloat(dayModal.hours);
        if(!isFinite(hours)||hours<1||hours>_mh2||hours!==Math.floor(hours)){ showToast('시간연차 1~'+_mh2+' 정수'); return; }
      }
      var dup = records.find(function(r){
        if(r.sid!==selSid||r.date!==dayModal.date||r.type!==attType) return false;
        if((r.period||'full') !== attPeriod) return false;
        if(attType==='leave-hour') return (r.hours||0)===hours;
        return true;
      });
      var skip = false;
      if(dup && !await popConfirm('같은 근태 항목이 이미 있습니다. 추가할까요?')) skip = true;
      if(!skip){
        var rec = { id:'att-'+Date.now().toString(36)+Math.random().toString(36).slice(2,5),
          date:dayModal.date, sid:selSid, type:attType, note:dayModal.note||'',
          createdAt:(new Date()).toISOString() };
        if(attType==='leave-hour') rec.hours=hours;
        if(attPeriod!=='full') rec.period=attPeriod;
        persist([rec].concat(records));
        msgs.push(((TYPE_MAP[attType]||{}).label||attType)+periodSfx(rec));
      }
    }
    if(otOver>0){ addOTRecord(dayModal.date, 'overtime', otOver, dayModal.note||''); msgs.push('연장'+otOver+'h'); }
    if(otNight>0){ addOTRecord(dayModal.date, 'night', otNight, dayModal.note||''); msgs.push('야간'+otNight+'h'); }
    if(otHoliday>0){ addOTRecord(dayModal.date, 'holiday', otHoliday, dayModal.note||''); msgs.push('휴일'+otHoliday+'h'); }
    setDayModal(null);
    if(msgs.length>0) showToast(msgs.join(', ')+' 등록');
  }

  function moveRecord(id, newDate){
    var rec = records.find(function(r){return r.id===id;});
    if(!rec||rec.date===newDate) return;
    persist(records.map(function(r){ return r.id===id?Object.assign({},r,{date:newDate}):r; }));
    showToast((rec.date||'').slice(5)+'→'+newDate.slice(5)+' 이동됨');
  }

  // 팔레트에서 드롭한 신규 항목 등록
  function dropNewItem(item, date){
    if(!selSid){ showToast('직원 먼저 선택'); return; }
    if(!item || !item.type) return;
    var rec = { id:'att-'+Date.now().toString(36)+Math.random().toString(36).slice(2,5),
      date:date, sid:selSid, type:item.type, note:'',
      createdAt:(new Date()).toISOString() };
    if(item.type==='leave-hour') rec.hours = item.hours || 1;
    if(item.type==='special-leave') rec.days = item.days || 1;
    persist([rec].concat(records));
    var t = TYPE_MAP[item.type];
    var lbl = (t?t.icon+' '+t.label:item.type) + periodSfx(item) + (item.type==='leave-hour'?' '+(item.hours||1)+'h':'') + ' · ' + date.slice(5);
    showToast('등록 ' + lbl);
  }

  // 달력 렌더
  function renderPersonCalendar(){
    var year = parseInt(selYM.split('-')[0]);
    var month = parseInt(selYM.split('-')[1]);
    var firstDay = new Date(year, month-1, 1).getDay();
    var lastDay  = new Date(year, month, 0).getDate();
    var holidays = dbGet('holidays',[]) || [];
    var hMap = {}; holidays.forEach(function(h){ hMap[h.date]=h.name; });

    var dayMap = {};
    monthRecs.forEach(function(r){
      var d = (r.date||'').slice(8,10);
      if(!dayMap[d]) dayMap[d]=[];
      dayMap[d].push(r);
    });

    var cells = [];
    for(var i=0;i<firstDay;i++) cells.push(null);
    for(var d=1;d<=lastDay;d++) cells.push(d);
    while(cells.length%7!==0) cells.push(null);

    var dayNames = ['일','월','화','수','목','금','토'];
    var today = todayYMD();

    return h('div', null,
      // 캘린더 상단 월 네비
      h('div',{style:{display:'flex',justifyContent:'center',alignItems:'center',gap:'8px',marginBottom:'10px',paddingBottom:'8px',borderBottom:'1px solid #f1f5f9'}},
        h(MonthNav, { onPrev:monthPrev, onNext:monthNext, label:selYM,
          onToday:function(){setSelYM(todayYM());},
          todayActive: selYM===todayYM() })
      ),
      h('div',{style:{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:'4px',marginBottom:'4px'}},
        dayNames.map(function(n,i){
          return h('div',{key:i,style:{textAlign:'center',fontSize:'11px',fontWeight:700,padding:'5px',
            color:i===0?'#dc2626':i===6?'#1e40af':'#475569'}},n);
        })
      ),
      h('div',{style:{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:'4px'}},
        cells.map(function(d,idx){
          if(d===null) return h('div',{key:idx,style:{minHeight:window.innerWidth<=768?'52px':'90px',background:'#f8fafc',border:'1px solid #f1f5f9',borderRadius:'8px'}});
          var ds = selYM+'-'+String(d).padStart(2,'0');
          var dow = (firstDay+d-1)%7;
          var isWeekend = dow===0||dow===6;
          var isHoliday = !!hMap[ds];
          var isToday = ds===today;
          var isDragOver = dragOver===ds;
          var recs = dayMap[String(d).padStart(2,'0')] || [];

          return h('div',{key:idx,
            onClick:function(){ if(!dragId && !dragNewItem){ setForm(Object.assign({},form,{date:ds})); } },
            onDoubleClick:function(){ if(!selSid || selSid==='all'){ showToast('개별 직원을 선택하세요'); return; } setDayModal({date:ds, type:'leave', hours:1, note:'', period:'full', otOvertime:0, otNight:0, otHoliday:0}); },
            onDragOver:function(e){ if(selSid==='all') return; e.preventDefault(); setDragOver(ds); },
            onDragLeave:function(){ setDragOver(null); },
            onDrop:function(e){
              if(selSid==='all') return;
              e.preventDefault();
              if(dragId) moveRecord(dragId,ds);
              else if(dragNewItem) dropNewItem(dragNewItem, ds);
              setDragId(null); setDragNewItem(null); setDragOver(null);
            },
            style:{minHeight:window.innerWidth<=768?'52px':'90px', border:'2px solid '+(isDragOver?'#3b82f6':isToday?'#1e40af':'#e2e8f0'),
              borderRadius:'8px', padding:'3px 4px', cursor:(dragId||dragNewItem)?'copy':'pointer',
              background:isDragOver?'#dbeafe':isToday?'#eff6ff':isWeekend||isHoliday?'#f8fafc':'#fff',
              transition:'background 0.1s, border-color 0.1s', overflow:'hidden'}
          },
            h('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'2px'}},
              h('div',{style:{fontSize:'10.5px',fontWeight:isToday?800:600,
                color:dow===0||isHoliday?'#dc2626':dow===6?'#1e40af':'#64748b'}},d),
              isHoliday&&h('div',{style:{fontSize:'10px',color:'#dc2626',fontWeight:600,maxWidth:'38px',overflow:'hidden',whiteSpace:'nowrap',textOverflow:'ellipsis'}},hMap[ds])
            ),
            recs.slice(0,4).map(function(r,ri){
              var t = TYPE_MAP[r.type]||{color:'#64748b',bg:'#f1f5f9',icon:'?',label:r.type};
              // selSid='all'에서는 직원명 prefix
              var empName = '';
              if(selSid === 'all'){
                var emp = users.find(function(u){return u.sid===r.sid;});
                empName = (emp ? emp.name : r.sid) + ' ';
              }
              var label = empName+t.icon+' '+t.label+periodSfx(r)+(r.type==='leave-hour'?' '+(r.hours||0)+'h':'')+(r.note?' ('+r.note+')':'');
              var isDragging = dragId===r.id;
              var isAllView = selSid === 'all';
              return h('div',{key:ri,draggable:!isAllView,
                onDragStart:function(e){ if(isAllView){ e.preventDefault(); return; } e.stopPropagation(); setDragId(r.id); e.dataTransfer.effectAllowed='move'; },
                onDragEnd:function(){ setDragId(null); setDragOver(null); },
                onClick:async function(e){ e.stopPropagation(); if(isAllView){ showToast('전체 보기에서는 삭제/이동 불가 (개별 직원 선택)'); return; } if(await popConfirm(label+'\n\n삭제하시겠습니까?')) delRecord(r.id); },
                title:label+(isAllView?'\n전체 보기 (개별 직원 선택 후 편집 가능)':'\n클릭: 삭제 / 드래그: 날짜 이동'),
                style:{fontSize:'10.5px',background:isDragging?'#94a3b8':t.color,color:'#fff',
                  padding:'2px 5px',borderRadius:'8px',marginTop:'1px',whiteSpace:'nowrap',overflow:'hidden',
                  textOverflow:'ellipsis',fontWeight:600,cursor:isAllView?'default':'grab',opacity:isDragging?0.5:1,userSelect:'none'}},label);
            }),
            recs.length>4&&h('div',{style:{fontSize:'10px',color:'#94a3b8',marginTop:'1px'}},'+'+( recs.length-4)+'건')
          );
        })
      )
    );
  }

  var thS={padding:'6px 8px',fontWeight:700,color:'#475569',fontSize:'10.5px',background:'#f8fafc',borderBottom:'1px solid #e2e8f0'};
  var tdS={padding:'5px 8px',borderBottom:'1px solid #f1f5f9',fontSize:'11px'};
  var inputS={padding:'7px 10px',border:'1px solid #cbd5e1',borderRadius:'4px',fontSize:'12px'};

  return h('div',{className:'page'},
    // ─ 탭
    h('div',{style:{display:'flex',gap:'4px',marginBottom:'10px',borderBottom:'1px solid #e2e8f0'}},
      [{v:'individual',label:'👤 개별'},{v:'matrix',label:'📅 월별 매트릭스 + 집계'}].map(function(t){
        return h('button',{key:t.v,onClick:function(){setTab(t.v);},
          style:{padding:'8px 16px',background:tab===t.v?'#1e40af':'transparent',color:tab===t.v?'#fff':'#475569',
            border:'none',borderBottom:tab===t.v?'2px solid #1e40af':'2px solid transparent',
            borderRadius:'4px 4px 0 0',fontSize:'12.5px',fontWeight:600,cursor:'pointer'}},t.label);
      })
    ),

    tab==='individual' && (window.innerWidth <= 768
  // ━━━━━━━━━━━━━━━ 모바일 레이아웃 ━━━━━━━━━━━━━━━
  ? h('div', null,
      // 줄1: 직원 드롭다운
      h('div', {style:{display:'flex',gap:'6px',marginBottom:'8px',alignItems:'center'}},
        h('select', {value:selSid, onChange:function(e){setSelSid(e.target.value);},
          style:{flex:1,padding:'7px 10px',border:'1px solid #cbd5e1',borderRadius:'8px',fontSize:'13px',fontWeight:600}},
          h('option',{value:'all'},'👥 전체 직원 ('+users.length+'명)'),
          users.map(function(u){
            var myRecs=records.filter(function(r){return r.sid===u.sid&&(r.date||'').slice(0,7)===selYM&&r.type!=='eum-work';});
            return h('option',{key:u.sid,value:u.sid},u.name+' ('+u.title+')' + (myRecs.length?' · '+myRecs.length+'건':''));
          })
        )
      ),
      // 달력 (전체 폭)
      h('div', {style:{background:'#fff',border:'1px solid #e2e8f0',borderRadius:'8px',padding:'8px',marginBottom:'8px'}},
        renderPersonCalendar()
      ),
      // 입력폼 (개별 직원 선택 시만)
      selUser && h('div', {style:{background:'#fff',border:'1px solid #e2e8f0',borderRadius:'8px',padding:'10px',marginBottom:'6px'}},
        // 직원명 + 월
        h('div', {style:{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'8px'}},
          h('span', {style:{fontWeight:700,fontSize:'13px',color:'#1e293b'}}, selUser.name),
          h('span', {style:{fontSize:'11px',color:'#94a3b8',fontFamily:'monospace'}}, selYM)
        ),
        // 날짜 + 휴가구분 (2열)
        h('div', {style:{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'6px',marginBottom:'6px'}},
          h('div', null,
            h('label', {style:{fontSize:'11px',color:'#64748b',fontWeight:600,display:'block',marginBottom:'1px'}}, '날짜'),
            h(KoreanDatePicker, {value:form.date, onChange:function(e){setForm(Object.assign({},form,{date:e.target.value}));},
              style:{width:'100%',padding:'6px 8px',border:'1px solid #cbd5e1',borderRadius:'5px',fontSize:'12px'}})
          ),
          h('div', null,
            h('label', {style:{fontSize:'11px',color:'#64748b',fontWeight:600,display:'block',marginBottom:'1px'}}, '휴가구분'),
            h('select', {value:form.type, onChange:function(e){setForm(Object.assign({},form,{type:e.target.value}));},
              style:{width:'100%',padding:'6px 8px',border:'1px solid #cbd5e1',borderRadius:'5px',fontSize:'12px'}},
              TYPES.filter(function(t){return !t.legacy;}).map(function(t){return h('option',{key:t.v,value:t.v},t.icon+' '+t.label);}))
          )
        ),
        // 비고 + 등록 (2열)
        h('div', {style:{display:'grid',gridTemplateColumns:'1fr auto',gap:'6px',marginBottom:'8px'}},
          h('input', {type:'text',value:form.note,placeholder:'비고',onChange:function(e){setForm(Object.assign({},form,{note:e.target.value}));},
            onKeyDown:function(e){if(e.key==='Enter') addRecord();},
            style:{padding:'6px 8px',border:'1px solid #cbd5e1',borderRadius:'5px',fontSize:'12px'}}),
          h('button', {onClick:function(){addRecord();},
            style:{padding:'7px 14px',background:'#1e40af',color:'#fff',border:'none',borderRadius:'5px',fontSize:'12px',fontWeight:700,whiteSpace:'nowrap'}},
            '+ 등록')
        ),
        // 초과근로 3열
        h('div', {style:{borderTop:'1px solid #f1f5f9',paddingTop:'6px'}},
          h('div', {style:{fontSize:'10px',color:'#64748b',fontWeight:700,marginBottom:'4px'}}, '이달 초과근로'),
          h('div', {style:{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'4px'}},
            ['overtimeHours','nightHours','holidayHours'].map(function(field,fi){
              var labels=['연장','야간','휴일'];
              return h('div', {key:field, style:{background:'#fefce8',borderRadius:'5px',padding:'4px 6px',border:'1px solid #fde68a'}},
                h('div', {style:{fontSize:'10px',color:'#854d0e',fontWeight:700,marginBottom:'2px'}}, labels[fi]),
                h('div', {style:{display:'flex',alignItems:'center',gap:'4px'}},
                  h('input', {type:'number',min:0,step:'0.5',value:getOT(field),readOnly:getOTRecords().length>0,
                    onChange:function(e){if(getOTRecords().length===0){setOT(field,e.target.value);}},
                    style:{flex:1,padding:'3px 4px',border:'1px solid #fde68a',borderRadius:'5px',fontSize:'11px',textAlign:'right',background:getOTRecords().length>0?'#fef9c3':'#fff'}}),
                  h('span', {style:{fontSize:'10px',color:'#854d0e'}}, 'h')
                )
              );
            }),
            h('div', {colSpan:3, style:{gridColumn:'1/-1'}},
              h('button', {onClick:function(){setOtModal(true);},
                style:{width:'100%',marginTop:'4px',padding:'4px',background:'#2563eb',color:'#fff',border:'none',borderRadius:'4px',fontSize:'10.5px',fontWeight:700}},
                '⏱ 상세 기록')
            )
          )
        )
      ),
      // 이달 기록 목록
      selSid && selSid!=='all' && monthRecs.length>0 && h('div', {style:{background:'#fff',border:'1px solid #e2e8f0',borderRadius:'8px',overflow:'hidden'}},
        h('div', {style:{padding:'6px 10px',background:'#f8fafc',borderBottom:'1px solid #e2e8f0',fontSize:'11px',fontWeight:700,color:'#1e293b'}},
          '📋 '+selYM+' 기록 ('+monthRecs.length+'건)'),
        h('div', {style:{maxHeight:'160px',overflowY:'auto'}},
          monthRecs.map(function(r){
            var t=TYPE_MAP[r.type]||{color:'#64748b',bg:'#f1f5f9',icon:'?',label:r.type};
            return h('div', {key:r.id, style:{display:'flex',alignItems:'center',gap:'6px',padding:'5px 10px',borderBottom:'1px solid #f1f5f9'}},
              h('span', {style:{fontFamily:'monospace',fontSize:'11px',color:'#475569',minWidth:'45px'}}, (r.date||'').slice(5)),
              h('span', {style:{background:t.color,color:'#fff',fontSize:'10px',padding:'2px 6px',borderRadius:'8px',fontWeight:600}}, t.icon+' '+t.label+periodSfx(r)),
              r.note && h('span', {style:{fontSize:'10px',color:'#94a3b8',flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}, r.note),
              h('button', {onClick:function(){delRecord(r.id);}, style:{background:'none',border:'none',color:'#dc2626',fontSize:'14px',cursor:'pointer',padding:'0 2px'}}, '×')
            );
          })
        )
      )
    )
  // ━━━━━━━━━━━━━━━ PC 레이아웃 ━━━━━━━━━━━━━━━
  : h('div',{style:{display:'grid',gridTemplateColumns:'130px 190px 1fr',gap:'10px',alignItems:'start'}},

      // ─ 좌: 직원 목록
      h('div',null,
        h('div',{style:{fontWeight:700,fontSize:'11px',color:'#1e293b',marginBottom:'4px',padding:'0 2px'}},'👥 직원 선택'),
        h('div',{style:{border:'1px solid #e2e8f0',borderRadius:'8px',overflow:'hidden'}},
          // 전체 직원 옵션 (selSid='all')
          (function(){
            var allRecs = records.filter(function(r){return (r.date||'').slice(0,7)===selYM;});
            var isSel = selSid === 'all';
            return h('div',{key:'__all__',onClick:function(){setSelSid('all');},
              style:{padding:'6px 8px',cursor:'pointer',borderBottom:'2px solid #e2e8f0',
                background:isSel?'#2563eb':'#faf5ff',
                borderLeft:'3px solid '+(isSel?'#93c5fd':'transparent')}},
              h('div',{style:{fontWeight:800,fontSize:'11px',color:isSel?'#fff':'#2563eb'}},'👥 전체 직원'),
              h('div',{style:{fontSize:'10px',color:isSel?'#e9d5ff':'#60a5fa',marginTop:'2px'}},
                '이달 기록 '+allRecs.length+'건 · '+users.length+'명')
            );
          })(),
          users.map(function(u){
            var myRecs = records.filter(function(r){return r.sid===u.sid&&(r.date||'').slice(0,7)===selYM;});
            var lv = myRecs.filter(function(r){return r.type==='leave';}).length
              + myRecs.filter(function(r){return r.type==='halfday-am'||r.type==='halfday-pm';}).length*0.5
              + myRecs.filter(function(r){return r.type==='leave-hour';}).reduce(function(s,r){return s+(r.hours||0);},0)/(u.scheduledHours||8);
            var ab = myRecs.filter(function(r){return r.type==='absent';}).length;
            var la = myRecs.filter(function(r){return r.type==='late';}).length;
            var tr = myRecs.filter(function(r){return r.type==='trip';}).length;
            var isSel = u.sid===selSid;
            return h('div',{key:u.sid,onClick:function(){setSelSid(u.sid);},
              style:{padding:'6px 8px',cursor:'pointer',borderBottom:'1px solid #f1f5f9',
                background:isSel?'#1e40af':'#fff',
                borderLeft:'3px solid '+(isSel?'#60a5fa':'transparent'),
                transition:'background 0.1s'}},
              h('div',{style:{fontWeight:700,fontSize:'11px',color:isSel?'#fff':'#1e293b'}},u.name),
              h('div',{style:{fontSize:'10px',color:isSel?'#bfdbfe':'#94a3b8',marginTop:'2px'}},u.title),
              myRecs.length>0&&h('div',{style:{display:'flex',gap:'4px',marginTop:'4px',flexWrap:'wrap'}},
                lv>0&&h('span',{style:{fontSize:'10px',background:isSel?'rgba(255,255,255,0.2)':'#dcfce7',color:isSel?'#fff':'#166534',padding:'1px 5px',borderRadius:'8px',fontWeight:700}},'🏖️'+lv),
                ab>0&&h('span',{style:{fontSize:'10px',background:isSel?'rgba(255,255,255,0.2)':'#fee2e2',color:isSel?'#fff':'#991b1b',padding:'1px 5px',borderRadius:'8px',fontWeight:700}},'❌'+ab),
                la>0&&h('span',{style:{fontSize:'10px',background:isSel?'rgba(255,255,255,0.2)':'#fff7ed',color:isSel?'#fff':'#ea580c',padding:'1px 5px',borderRadius:'8px',fontWeight:700}},'⏰'+la),
                tr>0&&h('span',{style:{fontSize:'10px',background:isSel?'rgba(255,255,255,0.2)':'#dbeafe',color:isSel?'#fff':'#1e40af',padding:'1px 5px',borderRadius:'8px',fontWeight:700}},'🚗'+tr)
              )
            );
          })
        )
      ),

      // ─ 가운데: 입력 폼 (세로로 길게)
      h('div',null,
        // 전체 직원 모드 안내
        selSid === 'all' && h('div',{style:{background:'#faf5ff',border:'1px solid #93c5fd',borderRadius:'8px',padding:'12px 14px',marginBottom:'12px'}},
          h('div',{style:{fontWeight:800,fontSize:'13px',color:'#2563eb',marginBottom:'4px'}},'👥 전체 직원 통합 보기'),
          h('div',{style:{fontSize:'11px',background:'#ede9fe',color:'#1d4ed8',padding:'2px 8px',borderRadius:'10px',fontWeight:700,display:'inline-block',marginBottom:'6px'}},
            '이달 '+monthRecs.length+'건 / '+users.length+'명'),
          h('div',{style:{fontSize:'11px',color:'#2563eb',marginTop:'4px'}},'※ 읽기 전용 (편집은 개별 직원 선택)')
        ),
        // 직원 헤더 + 입력 폼 (개별 직원 선택 시만) — 세로 레이아웃
        selUser && h('div',{style:{background:'#fff',border:'1px solid #e2e8f0',borderRadius:'8px',padding:'8px'}},
          // 직원 헤더
          h('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:'12px',paddingBottom:'10px',borderBottom:'1px solid #f1f5f9'}},
            h('div',null,
              h('div',{style:{fontWeight:700,fontSize:'13px',color:'#1e293b'}},selUser.name),
              h('div',{style:{fontSize:'11px',color:'#94a3b8',marginTop:'2px'}},selUser.title)
            ),
            h('div',{style:{fontSize:'11px',color:'#64748b',fontFamily:'monospace'}},selYM)
          ),
          leaveUsed>0 && h('div',{style:{fontSize:'11px',background:'#dcfce7',color:'#166534',padding:'4px 8px',borderRadius:'4px',fontWeight:700,marginBottom:'6px',textAlign:'center'}},'이달 연차 '+Math.round(leaveUsed*10)/10+'일'),
          // 잔여 연차 + 소정근로시간
          (function(){
            var yr = new Date().getFullYear();
            var lb = getLeaveRemain(selSid, yr);
            var sh = selUser.scheduledHours || 8;
            return h('div',{style:{display:'flex',gap:'6px',marginBottom:'10px',flexWrap:'wrap'}},
              h('div',{style:{flex:1,background:'#eff6ff',border:'1px solid #bfdbfe',borderRadius:'6px',padding:'6px 8px',textAlign:'center'}},
                h('div',{style:{fontSize:'10.5px',color:'#3b82f6',fontWeight:700,marginBottom:'2px'}},'잔여 연차'),
                h('div',{style:{fontSize:'14px',fontWeight:800,color:lb.remain>0?'#1d4ed8':'#dc2626',fontFamily:'monospace'}},lb.remain+'일'),
                h('div',{style:{fontSize:'10px',color:'#64748b'}}, '사용 '+lb.used+'/'+lb.total+'일')
              ),
              h('div',{style:{flex:1,background:'#f0fdf4',border:'1px solid #bbf7d0',borderRadius:'6px',padding:'6px 8px',textAlign:'center'}},
                h('div',{style:{fontSize:'10.5px',color:'#16a34a',fontWeight:700,marginBottom:'2px'}},'소정근로시간'),
                h('div',{style:{fontSize:'14px',fontWeight:800,color:'#15803d',fontFamily:'monospace'}},sh+'h/일'),
                h('div',{style:{fontSize:'10px',color:'#64748b'}},'반차 '+(sh/2)+'h·연차 '+sh+'h')
              )
            );
          })(),
          // 빠른 입력 - 세로 배치
          h('div',{style:{display:'flex',flexDirection:'column',gap:'4px'}},
            h('div',null,
              h('label',{style:{fontSize:'11px',color:'#64748b',fontWeight:600,display:'block',marginBottom:'1px'}},'날짜'),
              h(KoreanDatePicker, {value:form.date,onChange:function(e){setForm(Object.assign({},form,{date:e.target.value}));},style:Object.assign({width:'100%'},inputS)})
            ),
            h('div',null,
              h('label',{style:{fontSize:'11px',color:'#64748b',fontWeight:600,display:'block',marginBottom:'1px'}},'휴가 구분'),
              h('select',{value:form.type,onChange:function(e){setForm(Object.assign({},form,{type:e.target.value}));},style:Object.assign({width:'100%'},inputS)},
                TYPES.filter(function(t){return !t.legacy;}).map(function(t){return h('option',{key:t.v,value:t.v},t.icon+' '+t.label);}))
            ),
            form.type!=='leave-hour' && h('div',null,
              h('label',{style:{fontSize:'11px',color:'#64748b',fontWeight:600,display:'block',marginBottom:'1px'}},'시간대'),
              h('div',{style:{display:'flex',gap:'4px'}},
                [{v:'full',l:'종일'},{v:'am',l:'오전'},{v:'pm',l:'오후'}].map(function(p){
                  var on=(form.period||'full')===p.v;
                  return h('button',{key:p.v,
                    onClick:function(){setForm(Object.assign({},form,{period:p.v}));},
                    className:'erp-tip','data-tip': p.v==='full' ? '하루 전체' : (form.type==='leave' ? '연차 0.5일 차감 ('+p.l+'반차)' : p.l+' 반일'),
                    style:{flex:1,padding:'5px 0',fontSize:'11px',fontWeight:on?700:500,
                      background:on?'#1e40af':'#fff',color:on?'#fff':'#475569',
                      border:'1px solid '+(on?'#1e40af':'#cbd5e1'),borderRadius:'4px',cursor:'pointer'}},p.l);
                }))
            ),
            form.type==='leave-hour' && h('div',null,
              h('label',{style:{fontSize:'10.5px',color:'#0d9488',fontWeight:600,display:'block',marginBottom:'3px'}},
                '시간 (1~'+ ((selUser && selUser.scheduledHours ? selUser.scheduledHours : 8)-1) +')'),
              h('div',{style:{display:'flex',alignItems:'center',gap:'4px',background:'#ccfbf1',padding:'5px 8px',borderRadius:'4px'}},
                h('input',{type:'number', min:1, max:(selUser && selUser.scheduledHours ? selUser.scheduledHours : 8)-1, step:1,
                  value:form.hours||1,
                  onChange:function(e){setForm(Object.assign({},form,{hours:parseInt(e.target.value)||1}));},
                  onKeyDown:function(e){if(e.key==='Enter') addRecord();},
                  style:{flex:1,padding:'4px 8px',border:'1px solid #bfdbfe',borderRadius:'4px',fontSize:'13px',fontWeight:700,fontFamily:'monospace',textAlign:'center',background:'#fff'}}),
                h('span',{style:{fontSize:'11px',color:'#0d9488',fontWeight:700}},'시간'))
            ),
            h('div',null,
              h('label',{style:{fontSize:'11px',color:'#64748b',fontWeight:600,display:'block',marginBottom:'1px'}},'비고'),
              h('input',{type:'text',value:form.note,placeholder:'비고',onChange:function(e){setForm(Object.assign({},form,{note:e.target.value}));},
                onKeyDown:function(e){if(e.key==='Enter') addRecord();},style:Object.assign({width:'100%'},inputS)})
            ),
            h('button',{onClick:function(){addRecord();},style:{padding:'6px 12px',background:'#1e40af',color:'#fff',border:'none',borderRadius:'4px',cursor:'pointer',fontSize:'12.5px',fontWeight:700,marginTop:'2px'}},'+ 등록')
          ),
          // 초과근로 - 세로
          h('div',{style:{marginTop:'8px',paddingTop:'8px',borderTop:'1px solid #f1f5f9'}},
            h('div',{style:{fontSize:'10px',color:'#64748b',fontWeight:700,marginBottom:'4px'}},'이달 초과근로'),
            h('div',{style:{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'4px'}},
              ['overtimeHours','nightHours','holidayHours'].map(function(field,fi){
                var labels=['연장','야간','휴일'];
                return h('div',{key:field,style:{display:'flex',flexDirection:'column',gap:'4px',background:'#fefce8',padding:'5px 8px',borderRadius:'4px'}},
                  h('span',{style:{fontSize:'10.5px',color:'#854d0e',fontWeight:700}},labels[fi]),
                  h('input',{type:'number',min:0,step:'0.5',value:getOT(field), readOnly:getOTRecords().length>0,
                    onChange:function(e){if(getOTRecords().length===0){setOT(field,e.target.value);}},
                    title:getOTRecords().length>0?'일자별 기록이 있어 자동 합계 (수정은 상세 모달에서)':'',
                    style:{width:'100%',padding:'3px 4px',border:'1px solid #fde68a',borderRadius:'5px',fontSize:'11px',textAlign:'right',fontFamily:'monospace',background:getOTRecords().length>0?'#fef9c3':'#fff'}}),
                  h('span',{style:{fontSize:'10px',color:'#854d0e'}},'h'));
              }),
              h('button',{onClick:function(){setOtModal(true);},
                style:{marginTop:'4px',padding:'5px 10px',background:'#2563eb',color:'#fff',border:'none',borderRadius:'4px',cursor:'pointer',fontSize:'10.5px',fontWeight:700}}, '📋 상세'),
              h('div',{style:{fontSize:'10px',color:'#94a3b8',marginTop:'4px',textAlign:'center'}},'→ 월별급여 자동반영')
            )
          )
        )
      ),

      // ─ 우: 캘린더 + 이달 기록 목록 (위로 넓게)
      h('div',null,
        // 달력
        h('div',{style:{background:'#fff',border:'1px solid #e2e8f0',borderRadius:'8px',padding:'10px'}},
          renderPersonCalendar()
        ),

        // 이달 기록 목록
        monthRecs.length>0&&h('div',{style:{marginTop:'10px'}},
          h('div',{style:{fontWeight:700,fontSize:'12px',color:'#1e293b',marginBottom:'6px'}},
            '📋 '+selYM+' 기록 ('+monthRecs.length+'건)',
            h('span',{style:{fontSize:'10.5px',color:'#94a3b8',fontWeight:400,marginLeft:'6px'}},'뱃지 클릭으로 삭제 가능')),
          h('div',{style:{border:'1px solid #e2e8f0',borderRadius:'6px',overflow:'hidden',maxHeight:'200px',overflowY:'auto'}},
            h('table',{style:{width:'100%',borderCollapse:'collapse'}},
              h('thead',null,h('tr',null,
                h('th',{style:Object.assign({},thS,{width:'40px',textAlign:'center'})},'#'),
                h('th',{style:Object.assign({},thS,{width:'90px'})},  '날짜'),
                h('th',{style:thS},'유형'),
                h('th',{style:thS},'비고'),
                h('th',{style:Object.assign({},thS,{width:'32px'})},  '')
              )),
              h('tbody',null,
                monthRecs.length === 0
                  ? h('tr', null, h('td', { colSpan:99, style:{ textAlign:'center', padding:'40px', color:'#94a3b8', fontSize:'13px' } }, '등록된 데이터가 없습니다'))
                  : monthRecs.map(function(r,i){
                  var t=TYPE_MAP[r.type]||{label:r.type,icon:'?',color:'#64748b',bg:'#f1f5f9'};
                  return h('tr',{key:r.id,style:{background:i%2===0?'#fff':'#f8fafc'}},
                    h('td',{style:Object.assign({},tdS,{textAlign:'center',color:'#94a3b8',fontFamily:'monospace',fontSize:'11px'})},i+1),
                    h('td',{style:Object.assign({},tdS,{fontFamily:'monospace',color:'#475569'})},r.date.slice(5)),
                    h('td',{style:tdS},
                      h('span',{style:{background:t.color,color:'#fff',fontSize:'10px',padding:'2px 6px',borderRadius:'8px',fontWeight:700}},
                        t.icon+' '+t.label+periodSfx(r)+(r.type==='leave-hour'?' '+(r.hours||0)+'h':''))),
                    h('td',{style:Object.assign({},tdS,{fontSize:'10.5px',color:'#64748b'})},r.note||'-'),
                    h('td',{style:Object.assign({},tdS,{textAlign:'center',padding:'2px'})},
                      h('button',{onClick:function(){delRecord(r.id);},style:{background:'none',border:'none',color:'#dc2626',fontSize:'13px',cursor:'pointer'}},'×'))
                  );
                })
              )
            )
          )
        )
      )
    )),

    // ─ 매트릭스 + 집계 통합 탭 (행=직원, 열=일자 1~31 + 집계 9개)
    tab==='matrix' && (function(){
      var year = parseInt(selYM.split('-')[0]);
      var month = parseInt(selYM.split('-')[1]);
      var daysInMonth = new Date(year, month, 0).getDate();
      var days = [];
      for(var i=1; i<=daysInMonth; i++) days.push(i);
      var otAll = dbGet('overtime_records', []).filter(function(r){return (r.date||'').slice(0,7)===selYM;});
      var monthAtt = records.filter(function(r){return (r.date||'').slice(0,7)===selYM && r.type!=='eum-work';});
      // 집계 통계 (이어붙일 9개 컬럼)
      function stat(sid){
        var my = monthAtt.filter(function(r){return r.sid===sid;});
        var myOt = otAll.filter(function(r){return r.sid===sid;});
        return {
          leave: my.filter(function(r){return r.type==='leave';}).length,
          half:  my.filter(function(r){return r.type==='halfday-am'||r.type==='halfday-pm';}).length,
          hourLv:my.filter(function(r){return r.type==='leave-hour';}).reduce(function(s,r){return s+(parseFloat(r.hours)||0);},0),
          sick:  my.filter(function(r){return r.type==='sick';}).length,
          absent:my.filter(function(r){return r.type==='absent';}).length,
          trip:  my.filter(function(r){return r.type==='trip';}).length,
          ot:    myOt.filter(function(r){return r.kind==='overtime';}).reduce(function(s,r){return s+(parseFloat(r.hours)||0);},0),
          night: myOt.filter(function(r){return r.kind==='night';}).reduce(function(s,r){return s+(parseFloat(r.hours)||0);},0),
          holiday:myOt.filter(function(r){return r.kind==='holiday';}).reduce(function(s,r){return s+(parseFloat(r.hours)||0);},0)
        };
      }
      var totals = users.reduce(function(acc,u){
        var s = stat(u.sid);
        Object.keys(s).forEach(function(k){acc[k]=(acc[k]||0)+s[k];});
        return acc;
      }, {});
      // 집계 셀 공통 스타일
      var sumTh = {padding:'2px 3px',borderBottom:'1px solid #e2e8f0',borderRight:'1px solid #e2e8f0',fontSize:'10.5px',fontWeight:700,textAlign:'center',minWidth:'34px',whiteSpace:'nowrap'};
      var sumTd = {padding:'3px 4px',borderBottom:'1px solid #f1f5f9',borderRight:'1px solid #f1f5f9',fontSize:'10px',textAlign:'center',fontWeight:600,fontFamily:'monospace'};
      var SUM_COLS = [
        { k:'leave',   label:'🏖️연차',   bg:'#dcfce7', color:'#166534', unit:'일' },
        { k:'half',    label:'🌅반차',   bg:'#cffafe', color:'#2563eb', unit:'회' },
        { k:'hourLv',  label:'⏱️시연',   bg:'#ccfbf1', color:'#0d9488', unit:'h' },
        { k:'sick',    label:'🤒병가',   bg:'#fee2e2', color:'#991b1b', unit:'일' },
        { k:'absent',  label:'❌결근',   bg:'#fef2f2', color:'#991b1b', unit:'일' },
        { k:'trip',    label:'🚗출장',   bg:'#dbeafe', color:'#1e40af', unit:'일' },
        { k:'ot',      label:'⏰연장',   bg:'#fff7ed', color:'#ea580c', unit:'h' },
        { k:'night',   label:'🌙야간',   bg:'#ede9fe', color:'#2563eb', unit:'h' },
        { k:'holiday', label:'🎌휴일',   bg:'#fef2f2', color:'#dc2626', unit:'h' }
      ];
      return h('div',{className:'card',style:{padding:'8px',overflow:'auto'}},
        h('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'6px',gap:'6px'}},
          h('div',{style:{fontWeight:700,fontSize:'11.5px',color:'#1e293b',flex:1}}, '📅 '+selYM+' 매트릭스 ('+users.length+'명)'),
          h('div',{style:{display:'flex',alignItems:'center',gap:'3px'}},
            zoomControl(attZoom, setAttZoom),
            h('button',{onClick:monthPrev,style:{padding:'3px 8px',background:'#f1f5f9',border:'1px solid #e2e8f0',borderRadius:'4px',cursor:'pointer',fontSize:'12px'}},'◀'),
            h('span',{style:{padding:'2px 4px',fontWeight:700,fontSize:'11px'}},selYM),
            h('button',{onClick:monthNext,style:{padding:'3px 8px',background:'#f1f5f9',border:'1px solid #e2e8f0',borderRadius:'4px',cursor:'pointer',fontSize:'12px'}},'▶')
          )
        ),
        h('div',{style:{overflowX:'auto',border:'1px solid #e2e8f0',borderRadius:'6px',zoom:attZoom/100}},
          h('table',{style:{borderCollapse:'collapse',fontSize:'10px',width:'100%',tableLayout:'auto'}},
            h('thead',null,
              // 1행: 그룹 헤더 (📅 일자별 / 📊 월 합계)
              h('tr',null,
                h('th',{rowSpan:2,
                  style:{padding:'4px 6px',background:'#f1f5f9',borderBottom:'2px solid #94a3b8',borderRight:'3px solid #64748b',position:'sticky',left:0,zIndex:3,minWidth:'90px',textAlign:'left',fontSize:'11.5px',fontWeight:800,color:'#1e293b',verticalAlign:'middle'}},
                  '직원'),
                h('th',{colSpan:days.length,
                  style:{padding:'3px 5px',background:'#dbeafe',borderBottom:'1px solid #bfdbfe',borderRight:'3px solid #64748b',textAlign:'center',fontSize:'11.5px',fontWeight:800,color:'#3730a3'}},
                  '📅 일자별 체크 (' + days.length + '일)'),
                h('th',{colSpan:SUM_COLS.length,
                  style:{padding:'3px 5px',background:'#fef3c7',borderBottom:'1px solid #fde68a',textAlign:'center',fontSize:'11.5px',fontWeight:800,color:'#92400e'}},
                  '📊 월 합계 (' + SUM_COLS.length + '개 항목)')
              ),
              // 2행: 세부 컬럼 (1~31일 / 연차·반차·...)
              h('tr',null,
                days.map(function(d){
                  var dt = new Date(year, month-1, d);
                  var dow = dt.getDay();
                  var isWk = dow===0||dow===6;
                  return h('th',{key:d,style:{padding:'2px 1px',background:isWk?'#fef2f2':'#f8fafc',borderBottom:'2px solid #94a3b8',borderRight: d===days.length ? '3px solid #64748b' : '1px solid #e2e8f0',color:isWk?'#dc2626':'#475569',minWidth:'22px',fontSize:'10px',fontWeight:700}},d);
                }),
                // ── 집계 컬럼 헤더
                SUM_COLS.map(function(c){
                  return h('th',{key:'sum-'+c.k, style:Object.assign({},sumTh,{background:c.bg,color:c.color,borderBottom:'2px solid #94a3b8'})}, c.label);
                })
              )
            ),
            h('tbody',null,users.map(function(u){
              var s = stat(u.sid);
              return h('tr',{key:u.sid},
                h('td',{onClick:function(){setSelSid(u.sid);setTab('individual');},
                  style:{padding:'4px 6px',background:'#fff',borderBottom:'1px solid #f1f5f9',borderRight:'3px solid #64748b',position:'sticky',left:0,fontWeight:600,fontSize:'12px',cursor:'pointer',whiteSpace:'nowrap'}},
                  u.name),
                days.map(function(d){
                  var dateStr = selYM+'-'+String(d).padStart(2,'0');
                  var rec = monthAtt.find(function(r){return r.sid===u.sid && r.date===dateStr;});
                  var ot = otAll.filter(function(r){return r.sid===u.sid && r.date===dateStr;});
                  var otSum = ot.reduce(function(s,r){return s+(parseFloat(r.hours)||0);},0);
                  var t = rec ? TYPE_MAP[rec.type] : null;
                  var dt = new Date(year, month-1, d);
                  var isWk = dt.getDay()===0||dt.getDay()===6;
                  var title = (rec?t.label+periodSfx(rec):'') + (otSum>0?(rec?' / ':'')+'연장 '+otSum+'h':'');
                  return h('td',{key:d,
                    onClick:function(){setSelSid(u.sid);setTab('individual');},
                    title:title||'-',
                    style:{padding:'2px',borderBottom:'1px solid #f1f5f9',borderRight: d===days.length ? '3px solid #64748b' : '1px solid #f1f5f9',
                      background:rec?t.bg:(isWk?'#f8fafc':'#fff'),
                      textAlign:'center',cursor:'pointer',minWidth:'22px',height:'30px',lineHeight:'1'}},
                    rec && h('div',{style:{fontSize:'11px'}},t.icon),
                    otSum>0 && h('div',{style:{fontSize:'10px',color:'#92400e',fontWeight:700,marginTop:rec?'1px':'2px'}},'+'+otSum+'h')
                  );
                }),
                // ── 집계 셀 (이어붙임) — 배경 음영(#fff5f5)으로 일자 영역과 구분
                SUM_COLS.map(function(c){
                  var v = s[c.k] || 0;
                  return h('td',{key:'sum-'+c.k, onClick:function(){setSelSid(u.sid);setTab('individual');},
                    style:Object.assign({}, sumTd, { background:'#fff5f5', color: v>0 ? c.color : '#cbd5e1', cursor:'pointer' })},
                    v>0 ? v : '-');
                })
              );
            })),
            // ── 합계 행 (tfoot)
            h('tfoot',null,
              h('tr',{style:{borderTop:'2px solid #94a3b8'}},
                h('td',{style:{padding:'4px 6px',position:'sticky',left:0,background:'#f1f5f9',fontWeight:800,fontSize:'12px',color:'#1e293b',borderRight:'3px solid #64748b',borderTop:'2px solid #94a3b8'}}, '합계'),
                h('td',{colSpan:days.length, style:{background:'#f8fafc',borderRight:'3px solid #64748b',borderTop:'2px solid #94a3b8'}}),
                SUM_COLS.map(function(c){
                  var v = totals[c.k] || 0;
                  return h('td',{key:'tot-'+c.k, style:Object.assign({}, sumTd, { fontWeight:800, fontSize:'12.5px', padding:'8px 6px', color: v>0 ? c.color : '#cbd5e1', background: c.bg, borderTop:'2px solid #94a3b8' })},
                    v>0 ? v : '-');
                })
              )
            )
          )
        ),
        h('div',{style:{marginTop:'10px',padding:'8px 12px',background:'#f8fafc',border:'1px solid #e2e8f0',borderRadius:'5px',fontSize:'10.5px',color:'#64748b'}},
          '범례: ', TYPES.filter(function(t){return !t.legacy;}).map(function(t,i){return h('span',{key:t.v,style:{marginRight:'10px',display:'inline-block'}},t.icon+' '+t.label);}),
          h('span',{style:{marginLeft:'10px',color:'#92400e',fontWeight:700}},'+Xh = 연장근로 시간'))
      );
    })(),


    // 일자 더블클릭 등록 모달
    dayModal && selUser && h('div',{className:'modal-bg',onClick:function(){setDayModal(null);}},
      h('div',{className:'modal',style:{width:'480px',maxWidth:'92vw'},onClick:function(e){e.stopPropagation();}},
        h('div',{className:'modal-h'},
          h('div',{className:'t'},'📝 근태 등록 - '+selUser.name+' / '+dayModal.date),
          h('button',{className:'x',onClick:function(){setDayModal(null);}},'×')
        ),
        h('div',{className:'modal-b'},
          h('div',{className:'fld'},
            h('label',null,'근태 유형'),
            h('select',{value:dayModal.type,
              onChange:function(e){setDayModal(Object.assign({},dayModal,{type:e.target.value}));},
              style:{width:'100%'}},
              h('option',{value:''},'— 등록 안 함 (초과근로만 입력) —'),
              TYPES.filter(function(t){return !t.legacy;}).map(function(t){return h('option',{key:t.v,value:t.v},t.icon+' '+t.label);}))
          ),
          dayModal.type && dayModal.type!=='leave-hour' && h('div',{className:'fld'},
            h('label',null,'시간대'),
            h('div',{style:{display:'flex',gap:'6px'}},
              [{v:'full',l:'종일'},{v:'am',l:'오전'},{v:'pm',l:'오후'}].map(function(p){
                var on=(dayModal.period||'full')===p.v;
                return h('button',{key:p.v,
                  onClick:function(){setDayModal(Object.assign({},dayModal,{period:p.v}));},
                  style:{flex:1,padding:'7px 0',fontSize:'12px',fontWeight:on?700:500,
                    background:on?'#1e40af':'#fff',color:on?'#fff':'#475569',
                    border:'1px solid '+(on?'#1e40af':'#cbd5e1'),borderRadius:'5px',cursor:'pointer'}},p.l);
              }))
          ),
          dayModal.type==='leave-hour' && h('div',{className:'fld'},
            h('label',null,(function(){
              var su = users.find(function(u){return u.sid===selSid;});
              var mh = (su && su.scheduledHours ? su.scheduledHours : 8) - 1;
              return '⏱ 시간연차 — 시간 입력 (1~'+mh+'h)';
            })()),
            h('input',{type:'number', min:1,
              max:(function(){ var su=users.find(function(u){return u.sid===selSid;}); return (su&&su.scheduledHours?su.scheduledHours:8)-1; })(),
              step:1, value:dayModal.hours||1,
              onChange:function(e){setDayModal(Object.assign({},dayModal,{hours:parseInt(e.target.value)||1}));},
              style:{width:'100%',padding:'10px',border:'2px solid #bfdbfe',borderRadius:'6px',fontSize:'16px',fontWeight:700,fontFamily:'monospace',textAlign:'center',background:'#ccfbf1',boxSizing:'border-box'}})
          ),
          h('div',{style:{margin:'10px 0 6px',padding:'8px 12px',background:'#fff7ed',border:'1px solid #fed7aa',borderRadius:'5px'}},
            h('div',{style:{fontSize:'11.5px',fontWeight:700,color:'#9a3412',marginBottom:'6px'}},'⏰ 초과근로 시간 (선택)'),
            h('div',{style:{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'8px'}},
              h('div',null,
                h('label',{style:{fontSize:'10.5px',color:'#ea580c',fontWeight:600,display:'block',marginBottom:'2px'}},'연장 (h)'),
                h('input',{type:'number',min:'0',step:'0.5',value:dayModal.otOvertime,
                  onChange:function(e){setDayModal(Object.assign({},dayModal,{otOvertime:parseFloat(e.target.value)||0}));},
                  style:{width:'100%',padding:'5px 8px',border:'1px solid #fdba74',borderRadius:'4px',fontSize:'12px'}})),
              h('div',null,
                h('label',{style:{fontSize:'10.5px',color:'#2563eb',fontWeight:600,display:'block',marginBottom:'2px'}},'야간 (h)'),
                h('input',{type:'number',min:'0',step:'0.5',value:dayModal.otNight,
                  onChange:function(e){setDayModal(Object.assign({},dayModal,{otNight:parseFloat(e.target.value)||0}));},
                  style:{width:'100%',padding:'5px 8px',border:'1px solid #93c5fd',borderRadius:'4px',fontSize:'12px'}})),
              h('div',null,
                h('label',{style:{fontSize:'10.5px',color:'#dc2626',fontWeight:600,display:'block',marginBottom:'2px'}},'휴일 (h)'),
                h('input',{type:'number',min:'0',step:'0.5',value:dayModal.otHoliday,
                  onChange:function(e){setDayModal(Object.assign({},dayModal,{otHoliday:parseFloat(e.target.value)||0}));},
                  style:{width:'100%',padding:'5px 8px',border:'1px solid #fca5a5',borderRadius:'4px',fontSize:'12px'}}))
            )
          ),
          h('div',{className:'fld'},
            h('label',null,'비고 (선택)'),
            h('input',{type:'text',value:dayModal.note,
              onChange:function(e){setDayModal(Object.assign({},dayModal,{note:e.target.value}));},
              placeholder:'사유 등 메모',style:{width:'100%'}})
          )
        ),
        h('div',{className:'modal-f'},
          h('div',{style:{flex:1}}),
          h('button',{className:'btn-secondary',onClick:function(){setDayModal(null);}},'취소'),
          h('button',{className:'btn-primary',onClick:submitDayModal},'+ 등록')
        )
      )
    ),

    // 초과근로 상세 모달
    otModal && selUser && (function(){
      var otRecs = getOTRecords().slice().sort(function(a,b){return (a.date||'').localeCompare(b.date||'');});
      var OT_KINDS = [
        { v:'overtime', label:'연장', color:'#ea580c', bg:'#fff7ed' },
        { v:'night',    label:'야간', color:'#2563eb', bg:'#ede9fe' },
        { v:'holiday',  label:'휴일', color:'#dc2626', bg:'#fef2f2' }
      ];
      var kindMap = {}; OT_KINDS.forEach(function(k){kindMap[k.v]=k;});
      var sums = {overtime:0,night:0,holiday:0};
      otRecs.forEach(function(r){ if(sums[r.kind]!=null) sums[r.kind] += parseFloat(r.hours)||0; });
      async function doAdd(){
        if(!otAddForm.date){ showToast('날짜 입력'); return; }
        if(!(parseFloat(otAddForm.hours)>0)){ showToast('시간 입력 (>0)'); return; }
        if((otAddForm.date||'').slice(0,7) !== selYM){
          if(!(await popConfirm('선택한 달('+selYM+')과 다른 날짜입니다. 그래도 추가할까요?'))) return;
        }
        addOTRecord(otAddForm.date, otAddForm.kind, otAddForm.hours, otAddForm.note);
        setOtAddForm({date:todayYMD(), kind:'overtime', hours:1, note:''});
        showToast('추가됨');
      }
      return h('div',{className:'modal-bg',onClick:function(){setOtModal(false);}},
        h('div',{className:'modal',style:{width:'620px',maxWidth:'92vw'},onClick:function(e){e.stopPropagation();}},
          h('div',{className:'modal-h'},
            h('div',{className:'t'},'⏰ '+selUser.name+' - '+selYM+' 초과근로 상세'),
            h('button',{className:'x',onClick:function(){setOtModal(false);}},'×')
          ),
          h('div',{className:'modal-b'},
            // 보상휴가 잔여 (근로기준법 57조)
            (function(){
              var bal = getCompLeaveBalance(selSid);
              return h('div',{style:{background:'#f0f9ff',border:'1px solid #bfdbfe',borderRadius:'6px',padding:'10px 14px',marginBottom:'10px',display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:'8px'}},
                h('div',null,
                  h('span',{style:{fontSize:'11px',color:'#1d4ed8',fontWeight:700}},'💎 보상휴가 잔여 (근기법 57조)'),
                  h('span',{style:{fontSize:'10px',color:'#1d4ed8',marginLeft:'6px'}},'발생 '+bal.generated.toFixed(1)+'h · 사용 '+bal.used.toFixed(1)+'h')
                ),
                h('div',{style:{fontSize:'20px',fontWeight:800,color:bal.balance>0?'#1d4ed8':'#94a3b8',fontFamily:'monospace'}},
                  bal.balance.toFixed(1)+'h')
              );
            })(),
            // 합계 카드
            h('div',{style:{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:'8px',marginBottom:'12px'}},
              OT_KINDS.map(function(k){
                return h('div',{key:k.v,style:{background:k.bg,border:'1px solid '+k.color+'66',borderRadius:'6px',padding:'8px 12px',textAlign:'center'}},
                  h('div',{style:{fontSize:'10.5px',color:k.color,fontWeight:600}}, k.label),
                  h('div',{style:{fontSize:'18px',fontWeight:800,color:k.color,marginTop:'2px'}}, sums[k.v].toFixed(1)+'h')
                );
              })
            ),
            // 추가 폼
            h('div',{style:{background:'#f8fafc',border:'1px solid #e2e8f0',borderRadius:'6px',padding:'10px 12px',marginBottom:'10px'}},
              h('div',{style:{fontSize:'11px',fontWeight:700,color:'#475569',marginBottom:'8px'}},'➕ 항목 추가'),
              h('div',{style:{display:'grid',gridTemplateColumns:'130px 100px 80px 1fr 60px',gap:'6px',alignItems:'center'}},
                h(KoreanDatePicker,{value:otAddForm.date,
                  onChange:function(e){var v=(e&&e.target)?e.target.value:e; setOtAddForm(Object.assign({},otAddForm,{date:v}));},
                  style:{width:'100%'}}),
                h('select',{value:otAddForm.kind,
                  onChange:function(e){setOtAddForm(Object.assign({},otAddForm,{kind:e.target.value}));},
                  style:{padding:'5px 8px',border:'1px solid #cbd5e1',borderRadius:'4px',fontSize:'12px'}},
                  OT_KINDS.map(function(k){return h('option',{key:k.v,value:k.v},k.label);})),
                h('input',{type:'number',min:0,step:'0.5',value:otAddForm.hours,placeholder:'시간',
                  onChange:function(e){setOtAddForm(Object.assign({},otAddForm,{hours:e.target.value}));},
                  style:{padding:'5px 8px',border:'1px solid #cbd5e1',borderRadius:'4px',fontSize:'12px',textAlign:'right',fontFamily:'monospace'}}),
                h('input',{type:'text',value:otAddForm.note,placeholder:'사유 (선택)',
                  onChange:function(e){setOtAddForm(Object.assign({},otAddForm,{note:e.target.value}));},
                  onKeyDown:function(e){if(e.key==='Enter') doAdd();},
                  style:{padding:'5px 8px',border:'1px solid #cbd5e1',borderRadius:'4px',fontSize:'12px'}}),
                h('button',{onClick:doAdd,
                  style:{padding:'5px 10px',background:'#1e40af',color:'#fff',border:'none',borderRadius:'4px',cursor:'pointer',fontSize:'12px',fontWeight:700}},'+ 추가')
              )
            ),
            // 일자별 리스트
            h('div',{style:{border:'1px solid #e2e8f0',borderRadius:'6px',maxHeight:'320px',overflowY:'auto'}},
              otRecs.length === 0
                ? h('div',{style:{padding:'30px',textAlign:'center',color:'#94a3b8',fontSize:'12px'}},'기록 없음 — 위에서 항목을 추가하세요')
                : h('table',{style:{width:'100%',borderCollapse:'collapse',fontSize:'12px'}},
                    h('thead',null,
                      h('tr',{style:{background:'#f8fafc'}},
                        h('th',{style:{padding:'8px',textAlign:'left',fontSize:'10.5px',color:'#64748b',fontWeight:700,width:'100px'}},'날짜'),
                        h('th',{style:{padding:'8px',textAlign:'center',fontSize:'10.5px',color:'#64748b',fontWeight:700,width:'70px'}},'종류'),
                        h('th',{style:{padding:'8px',textAlign:'right',fontSize:'10.5px',color:'#64748b',fontWeight:700,width:'60px'}},'시간'),
                        h('th',{style:{padding:'8px',textAlign:'left',fontSize:'10.5px',color:'#64748b',fontWeight:700}},'사유'),
                        h('th',{style:{padding:'8px',textAlign:'center',fontSize:'10.5px',color:'#64748b',fontWeight:700,width:'120px'}},'보상휴가'),
                        h('th',{style:{padding:'8px',textAlign:'center',fontSize:'10.5px',color:'#64748b',fontWeight:700,width:'40px'}},'삭제')
                      )
                    ),
                    h('tbody',null,
                      otRecs.map(function(r){
                        var k = kindMap[r.kind] || {label:r.kind,color:'#64748b',bg:'#f1f5f9'};
                        var isConv = !!r.convertedToComp;
                        return h('tr',{key:r.id,style:{borderTop:'1px solid #f1f5f9',background:isConv?'#f0f9ff':'transparent'}},
                          h('td',{style:{padding:'6px 8px',fontFamily:'monospace',color:'#475569'}}, r.date),
                          h('td',{style:{padding:'6px 8px',textAlign:'center'}},
                            h('span',{style:{background:k.bg,color:k.color,padding:'2px 8px',borderRadius:'8px',fontSize:'10.5px',fontWeight:700}}, k.label)
                          ),
                          h('td',{style:{padding:'6px 8px',textAlign:'right',fontFamily:'monospace',fontWeight:700,color:isConv?'#94a3b8':k.color,textDecoration:isConv?'line-through':'none'}}, parseFloat(r.hours).toFixed(1)+'h'),
                          h('td',{style:{padding:'6px 8px',color:'#64748b'}}, r.note || '-'),
                          h('td',{style:{padding:'6px 8px',textAlign:'center'}},
                            isConv
                              ? h('div',{style:{display:'flex',alignItems:'center',justifyContent:'center',gap:'4px'}},
                                  h('span',{style:{color:'#1d4ed8',fontWeight:700,fontFamily:'monospace',fontSize:'11.5px'}},'✓ '+(parseFloat(r.compHours)||0).toFixed(1)+'h'),
                                  h('button',{title:'전환 취소',
                                    onClick:async function(){
                                      if(!(await popConfirm('보상휴가 전환을 취소합니까?\n→ 이 시간은 다시 임금 지급 대상이 됩니다.'))) return;
                                      var all = dbGet('overtime_records',[]);
                                      var idx = all.findIndex(function(x){return x.id===r.id;});
                                      if(idx>=0){
                                        all[idx] = Object.assign({}, all[idx], {convertedToComp:false, compHours:0});
                                        dbSet('overtime_records', all);
                                        syncOTToPayroll();
                                        showToast('전환 취소됨');
                                      }
                                    },
                                    style:{background:'none',border:'none',color:'#dc2626',fontSize:'12px',cursor:'pointer',padding:'0 4px'}},'↩'))
                              : h('button',{
                                  onClick:async function(){
                                    var ch = calcCompHoursForOT(r);
                                    if(!(await popConfirm('보상휴가로 전환합니까?\n\n원본: '+k.label+' '+parseFloat(r.hours).toFixed(1)+'h\n보상휴가: '+ch.toFixed(1)+'h (가산율 자동)\n\n※ 임금 지급 대신 휴가로 보상됩니다.'))) return;
                                    var all = dbGet('overtime_records',[]);
                                    var idx = all.findIndex(function(x){return x.id===r.id;});
                                    if(idx>=0){
                                      all[idx] = Object.assign({}, all[idx], {convertedToComp:true, compHours:ch, convertedAt:(new Date()).toISOString()});
                                      dbSet('overtime_records', all);
                                      syncOTToPayroll();
                                      showToast('💎 보상휴가 '+ch.toFixed(1)+'h 발생');
                                    }
                                  },
                                  style:{padding:'2px 8px',background:'#1d4ed8',color:'#fff',border:'none',borderRadius:'4px',cursor:'pointer',fontSize:'10.5px',fontWeight:700}},'💱 전환')
                          ),
                          h('td',{style:{padding:'6px 8px',textAlign:'center'}},
                            h('button',{onClick:async function(){ if(await popConfirm('삭제하시겠습니까?')) deleteOTRecord(r.id); },
                              style:{background:'none',border:'none',color:'#dc2626',fontSize:'14px',cursor:'pointer'}},'×')
                          )
                        );
                      })
                    )
                  )
            ),
            h('div',{style:{marginTop:'10px',fontSize:'10.5px',color:'#94a3b8'}},
              '※ 항목 추가/삭제 시 ', selYM, ' 월별급여 합계 자동 갱신. 💱 전환 시 임금 대신 보상휴가(휴가관리 탭)로 적립됩니다.')
          ),
          h('div',{className:'modal-f'},
            h('button',{className:'btn-primary',onClick:function(){setOtModal(false);}},'닫기')
          )
        )
      );
    })()
  );
}

