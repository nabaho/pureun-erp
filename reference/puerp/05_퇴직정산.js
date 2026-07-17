// ============================================================
// DC 적립금 가로형 엑셀 파서: 1행 헤더(이름|2025-01|2025-02…), 이름으로 직원 매칭
function parseDCWide(file, allUsers, cb){
  try{
    var rd = new FileReader();
    rd.onload = function(ev){
      try{
        var wb = XLSX.read(ev.target.result, { type:'array' });
        var sheet = wb.Sheets[wb.SheetNames[0]];
        var raw = XLSX.utils.sheet_to_json(sheet, { header:1, defval:'' });
        if(!raw || raw.length < 2){ cb(null, '데이터가 없습니다'); return; }
        var header = raw[0];
        function toYM(v){ var s=String(v).replace(/[^0-9]/g,''); if(s.length>=6) return s.slice(0,4)+'-'+s.slice(4,6); return ''; }
        var ymCols = [];
        for(var c=1;c<header.length;c++){ var ym=toYM(header[c]); if(ym) ymCols.push({ c:c, ym:ym }); }
        if(!ymCols.length){ cb(null, '년월 열(예: 2025-01)을 찾지 못했습니다. 1행 헤더를 확인하세요'); return; }
        var nameToSid = {};
        (allUsers||[]).forEach(function(u){ nameToSid[String(u.name).replace(/\s/g,'')] = u.sid; });
        var resRows=[], unmatched=[], totalEntries=0, totalAmount=0;
        for(var r=1;r<raw.length;r++){
          var row=raw[r]; if(!row) continue;
          var nmRaw=String(row[0]||'').trim(); var nm=nmRaw.replace(/\s/g,''); if(!nm) continue;
          var sid=nameToSid[nm]||null;
          var entries=[];
          ymCols.forEach(function(col){ var amt=parseInt(String(row[col.c]).replace(/[^0-9-]/g,''))||0; if(amt>0) entries.push({ ym:col.ym, amount:amt }); });
          if(!entries.length) continue;
          if(sid){ totalEntries+=entries.length; totalAmount+=entries.reduce(function(s,e){return s+e.amount;},0); }
          else unmatched.push(nmRaw);
          resRows.push({ name:nmRaw, sid:sid, matched:!!sid, entries:entries });
        }
        cb({ rows:resRows, unmatched:unmatched, totalEntries:totalEntries, totalAmount:totalAmount }, null);
      }catch(e){ cb(null, '엑셀 파싱 오류: '+e.message); }
    };
    rd.onerror = function(){ cb(null, '파일 읽기 실패'); };
    rd.readAsArrayBuffer(file);
  }catch(e){ cb(null, e.message); }
}

// 퇴직정산 (RetirementSettlement)
// - DC형 퇴직연금 적립금 추적
// - 매월 자동 적립 (월별급여 확정 시)
// - 법정 퇴직금 자동 계산 (DC 미가입자)
// ============================================================
function RetirementSettlement(){
  var users = getActiveUsers();
  var allUsers = dbGet('user_accounts', USERS_SEED);  // 퇴사자 포함 전체
  var ts = useState('balance'); var tab = ts[0]; var setTab = ts[1];
  var rtzS = usePersistedState('retire_zoom', 100); var retZoom = rtzS[0]; var setRetZoom = rtzS[1];
  var ys = useState(String((new Date()).getFullYear())); var selYear = ys[0]; var setSelYear = ys[1];
  var rfk = useState(0); var refresh = rfk[0]; var setRefresh = rfk[1];
  var setupS = useState(null); var setupModal = setupS[0]; var setSetupModal = setupS[1];
  var contribS = useState(null); var contribModal = contribS[0]; var setContribModal = contribS[1];
  var calcS = useState(null); var calcModal = calcS[0]; var setCalcModal = calcS[1];
  // 퇴사자 정산 state
  var settleS = useState(null); var settleModal = settleS[0]; var setSettleModal = settleS[1];
  // 적립금 엑셀 가져오기 미리보기
  var dcImpS = useState(null); var dcImp = dcImpS[0]; var setDcImp = dcImpS[1];

  var policy = getPensionPolicy();

  // 직원별 정보 빌드
  var allPayroll = dbGet('payroll_monthly', []);
  function calcLifetimeWage(sid){
    return allPayroll.filter(function(p){return p.empSid===sid;})
      .reduce(function(s, p){
        var gross = (+p.baseSalary||0) + (+p.allowFood||0) + (+p.allowCar||0) + (+p.allowChild||0) + (+p.allowEtc||0) + (+p.bonus||0);
        var ded = (+p.dedPension||0)+(+p.dedHealth||0)+(+p.dedLtc||0)+(+p.dedEmp||0)+(+p.dedIncome||0)+(+p.dedLocal||0)+(+p.dedEtc||0);
        return s + Math.max(0, gross - ded);
      }, 0);
  }
  function calcPayrollMonths(sid){
    return allPayroll.filter(function(p){return p.empSid===sid;}).length;
  }
  var rows = users.map(function(u){
    var pension = getStaffPension(u.sid);
    var contribs = getDCContributions(u.sid);
    var balance = contribs.reduce(function(s,x){return s+(parseInt(x.amount)||0);},0);
    var lastContrib = contribs.slice().sort(function(a,b){return (b.ym||'').localeCompare(a.ym||'');})[0];
    return {
      u:u, pension:pension, balance:balance, contribCount:contribs.length,
      lastYM: lastContrib ? lastContrib.ym : '',
      lastAmount: lastContrib ? lastContrib.amount : 0,
      lifetimeWage: calcLifetimeWage(u.sid),
      payrollMonths: calcPayrollMonths(u.sid)
    };
  });

  // 적립금 엑셀 반영: 같은 (직원,년월)은 덮어쓰기
  function commitDCImport(){
    if(!dcImp) return;
    var list = getDCContributions();
    dcImp.rows.forEach(function(R){
      if(!R.sid) return;
      R.entries.forEach(function(e){
        list = list.filter(function(x){ return !(x.sid===R.sid && x.ym===e.ym); });
        list.push({ id:'dc-imp-'+R.sid+'-'+e.ym, sid:R.sid, ym:e.ym, amount:e.amount, paidDate:'', note:'엑셀 import', auto:false });
      });
    });
    setDCContributions(list);
    var cnt = dcImp.rows.filter(function(r){return r.sid;}).reduce(function(s,r){return s+r.entries.length;},0);
    setDcImp(null);
    setRefresh(refresh+1);
    showToast('✅ 적립금 ' + cnt + '건 반영');
  }
  function pickDCFile(f){ if(f) parseDCWide(f, allUsers, function(d,err){ if(err){ showToast('⚠ '+err); return; } setDcImp(d); }); }

  var dcCount = rows.filter(function(r){return r.pension.type==='DC';}).length;
  var dbCount = rows.filter(function(r){return r.pension.type==='DB';}).length;
  var noneCount = rows.filter(function(r){return r.pension.type==='NONE';}).length;
  var totalBalance = rows.reduce(function(s,r){return s+r.balance;}, 0);

  function persistContrib(list){
    setDCContributions(list);
    setRefresh(refresh+1);
  }

  
  function saveSetup(){
    if(!setupModal) return;
    setStaffPension(setupModal.sid, {
      type: setupModal.type,
      provider: setupModal.provider,
      account: setupModal.account,
      startDate: setupModal.startDate
    });
    setSetupModal(null);
    setRefresh(refresh+1);
    showToast('✅ 퇴직연금 정보 저장');
  }

  function openContribAdd(u, presetYM){
    var ym = presetYM || todayYM();
    // 통상임금 기반 자동 추천: 월급여 합산 × 1/12
    var suggestedAmount = 0;
    try{
      var monthlyWage = (u.baseSalary||0) + (u.fixedAllowance||0) + (u.bonus||0);
      // allowances 합산
      if(u.allowances && typeof u.allowances === 'object'){
        Object.keys(u.allowances).forEach(function(k){ monthlyWage += parseInt(u.allowances[k])||0; });
      }
      suggestedAmount = Math.round(monthlyWage / 12);
    }catch(e){ window._erpErrLog && window._erpErrLog(e); }
    setContribModal({
      sid:u.sid, name:u.name, isNew:true,
      ym: ym,
      amount: suggestedAmount,
      paidDate: ym + '-15',
      note: '',
      auto: false
    });
  }
  function openContribEdit(c, u){
    setContribModal(Object.assign({}, c, { name:u.name, isNew:false }));
  }
  function saveContrib(){
    var m = contribModal;
    if(!m) return;
    if(!m.ym || !m.amount){ showToast('년월·금액 필수'); return; }
    var list = getDCContributions();
    if(m.isNew){
      list.unshift({
        id: 'dc-'+Date.now().toString(36)+Math.random().toString(36).slice(2,5),
        sid: m.sid, ym: m.ym,
        amount: parseInt(m.amount)||0,
        paidDate: m.paidDate || '',
        note: m.note || '',
        auto: false,
        createdAt: (new Date()).toISOString()
      });
    } else {
      var idx = list.findIndex(function(x){return x.id===m.id;});
      if(idx>=0){
        list[idx] = Object.assign({}, list[idx], {
          ym: m.ym, amount: parseInt(m.amount)||0,
          paidDate: m.paidDate || '', note: m.note || ''
        });
      }
    }
    persistContrib(list);
    setContribModal(null);
    showToast('✅ 적립 기록 저장');
  }
  async function deleteContrib(id){
    if(!(await popConfirm('이 적립 기록을 삭제하시겠습니까?'))) return;
    var _ud=getDCContributions().slice(); persistContrib(_ud.filter(function(x){return x.id!==id;}));
    showToastUndo('🗑️ 적립기록 삭제됨', function(){persistContrib(_ud);});
  }

  function openCalcModal(u){
    var hireDate = u.hireDate || '';
    var today = todayYMD();
    setCalcModal({
      sid: u.sid, name: u.name, title: u.title,
      hireDate: hireDate,
      retireDate: today,
      pension: getStaffPension(u.sid)
    });
  }

  // ── 렌더 ──
  var TYPE_LABEL = { DC:'DC형', DB:'DB형', NONE:'미가입' };
  var TYPE_COLOR = { DC:'#1e40af', DB:'#2563eb', NONE:'#dc2626' };
  var TYPE_BG = { DC:'#dbeafe', DB:'#ede9fe', NONE:'#fee2e2' };

  return h('div', { className:'page' },
    // KPI
    window.innerWidth <= 768
    ? h('div', { style:{ display:'flex', overflowX:'auto', gap:'4px', marginBottom:'8px', WebkitOverflowScrolling:'touch', paddingBottom:'4px' } },
        [
          { bg:'#dbeafe', bd:'#93c5fd', fg:'#1e40af', label:'🏦 DC 가입자', val:dcCount+'명' },
          { bg:'#ede9fe', bd:'#c4b5fd', fg:'#2563eb', label:'🏛️ DB 가입자', val:dbCount+'명' },
          { bg:'#fee2e2', bd:'#fca5a5', fg:'#dc2626', label:'⚠️ 미가입', val:noneCount+'명' },
          { bg:'#dcfce7', bd:'#86efac', fg:'#166534', label:'💰 DC 적립금', val:totalBalance.toLocaleString()+'원' }
        ].map(function(k,i){
          return h('div', { key:i, style:{ flexShrink:0, minWidth:'80px', background:k.bg, border:'1px solid '+k.bd, borderRadius:'6px', padding:'5px 8px', textAlign:'center' } },
            h('div', { style:{ fontSize:'9px', color:k.fg, fontWeight:700, whiteSpace:'nowrap', marginBottom:'1px' } }, k.label),
            h('div', { style:{ fontSize:'12px', fontWeight:800, color:k.fg, fontFamily:'monospace', whiteSpace:'nowrap' } }, k.val));
        })
      )
    : h('div', { style:{ display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:'4px', marginBottom:'10px' } },
      h('div', { style:{ background:'#dbeafe', border:'1px solid #93c5fd', borderRadius:'6px', padding:'4px 6px', textAlign:'center' } },
        h('div', { style:{ fontSize:'10px', color:'#1e40af', fontWeight:700, whiteSpace:'nowrap' } }, '🏦 DC 가입자'),
        h('div', { style:{ fontSize:'13px', fontWeight:800, color:'#1e40af', lineHeight:1.2 } }, dcCount+'명')),
      h('div', { style:{ background:'#ede9fe', border:'1px solid #93c5fd', borderRadius:'6px', padding:'4px 6px', textAlign:'center' } },
        h('div', { style:{ fontSize:'10px', color:'#2563eb', fontWeight:700, whiteSpace:'nowrap' } }, '🏛️ DB 가입자'),
        h('div', { style:{ fontSize:'13px', fontWeight:800, color:'#2563eb', lineHeight:1.2 } }, dbCount+'명')),
      h('div', { style:{ background:'#fee2e2', border:'1px solid #fca5a5', borderRadius:'6px', padding:'4px 6px', textAlign:'center' } },
        h('div', { style:{ fontSize:'10px', color:'#dc2626', fontWeight:700, whiteSpace:'nowrap' } }, '⚠️ 미가입'),
        h('div', { style:{ fontSize:'13px', fontWeight:800, color:'#dc2626', lineHeight:1.2 } }, noneCount+'명')),
      h('div', { style:{ background:'#dcfce7', border:'1px solid #86efac', borderRadius:'6px', padding:'4px 6px', textAlign:'center' } },
        h('div', { style:{ fontSize:'10px', color:'#166534', fontWeight:700, whiteSpace:'nowrap' } }, '💰 DC 적립금'),
        h('div', { style:{ fontSize:'11px', fontWeight:800, color:'#166534', lineHeight:1.4, fontFamily:'monospace' } }, totalBalance.toLocaleString()+'원'))
    ),

    // 안내 박스
    h('div', { style:{ background:'#fef3c7', border:'1px solid #fde68a', borderRadius:'7px', padding: window.innerWidth<=768?'7px 10px':'10px 14px', marginBottom: window.innerWidth<=768?'10px':'14px', fontSize: window.innerWidth<=768?'10px':'11.5px', color:'#451a03', lineHeight: window.innerWidth<=768?'1.5':'1.7' } },
      h('strong', null, '💡 퇴직연금 자동 적립: '), 'DC 가입자는 ',
      h('strong', null, '월별급여 일괄확정'), ' 시 그 달치 적립금이 자동 누적됩니다 (월 임금 × ',
      h('strong', null, (policy.contributionRate*100).toFixed(2)+'%'), '). 미가입자는 퇴직 시 ',
      h('strong', null, '법정 퇴직금'), '이 자동 계산됩니다.'
    ),

    // 탭
    h('div', { style:{ display:'flex', gap:'4px', marginBottom:'14px', borderBottom:'2px solid #e5e7eb', overflowX:'auto', overflowY:'hidden', cursor:'grab', userSelect:'none', scrollbarWidth:'thin', WebkitOverflowScrolling:'touch', flexWrap:'nowrap' },
      ref: function(el){
        if(!el || el._dragInit) return;
        el._dragInit = true;
        var isDown=false, startX=0, sLeft=0, moved=false;
        el.addEventListener('mousedown', function(e){
          if(e.button !== 0) return;
          isDown=true; moved=false; el.style.cursor='grabbing';
          startX = e.pageX - el.offsetLeft;
          sLeft = el.scrollLeft;
        });
        el.addEventListener('mouseleave', function(){ isDown=false; el.style.cursor='grab'; });
        el.addEventListener('mouseup',    function(){ isDown=false; el.style.cursor='grab'; });
        el.addEventListener('mousemove',  function(e){
          if(!isDown) return;
          var x = e.pageX - el.offsetLeft;
          var walk = x - startX;
          if(Math.abs(walk) > 3) moved = true;
          el.scrollLeft = sLeft - walk;
        });
        el.addEventListener('click', function(e){
          if(moved){ e.stopPropagation(); e.preventDefault(); moved=false; }
        }, true);
        el.addEventListener('wheel', function(e){
          if(e.deltaY !== 0 && e.deltaX === 0){ el.scrollLeft += e.deltaY; e.preventDefault(); }
        }, { passive:false });
      } },
      [
        { v:'balance', label:'💰 적립금 현황' },
        { v:'monthly', label:'📅 월별 누계' },
        { v:'calc',    label:'🧮 퇴직금 계산' },
        { v:'settle',  label:'💼 퇴사자 정산' }
      ].map(function(x){
        var on = tab === x.v;
        return h('button', { key:x.v, onClick:function(){setTab(x.v);},
          style:{ padding:'9px 14px', borderRadius:'5px', fontSize:'12.5px', cursor:'pointer', fontWeight:on?700:500,
            background: on?'#1e40af':'transparent', color: on?'#fff':'#475569',
            border:'none', borderBottom:'none',
            marginBottom:'0', flexShrink:0, whiteSpace:'nowrap' } }, x.label);
      })
    ),
    h('div', { style:{ display:'flex', justifyContent:'flex-end', marginBottom:'8px' } }, zoomControl(retZoom, setRetZoom)),

    // ─── 적립금 엑셀 가져오기 (드래그앤드롭) ───
    tab === 'balance' && h('div', { style:{ marginBottom:'10px' } },
      !dcImp ? h('div', {
          onDragOver:function(e){ e.preventDefault(); },
          onDrop:function(e){ e.preventDefault(); pickDCFile(e.dataTransfer.files && e.dataTransfer.files[0]); },
          onClick:function(){ var inp=document.getElementById('dcImpFile'); if(inp) inp.click(); },
          style:{ border:'2px dashed #93c5fd', background:'#f0f9ff', borderRadius:'8px', padding:'12px', textAlign:'center', cursor:'pointer' } },
        h('div', { style:{ fontSize:'12.5px', fontWeight:700, color:'#1e40af' } }, '📥 적립금 엑셀 가져오기 — 파일을 끌어다 놓거나 클릭'),
        h('div', { style:{ fontSize:'10.5px', color:'#64748b', marginTop:'4px' } }, '양식: 1행 헤더(이름 | 2025-01 | 2025-02 …), 각 칸에 월 적립금. 이름으로 직원 매칭. 같은 직원·월은 덮어씀.'),
        h('input', { id:'dcImpFile', type:'file', accept:'.xlsx,.xls,.csv', style:{ display:'none' },
          onChange:function(e){ pickDCFile(e.target.files && e.target.files[0]); e.target.value=''; } })
      ) : h('div', { style:{ border:'1px solid #93c5fd', background:'#fff', borderRadius:'8px', padding:'12px' } },
        h('div', { style:{ fontSize:'12.5px', fontWeight:700, color:'#1e40af', marginBottom:'6px' } }, '📋 가져오기 미리보기'),
        h('div', { style:{ fontSize:'11px', color:'#334155', marginBottom:'8px' } },
          '매칭 ' + dcImp.rows.filter(function(r){return r.sid;}).length + '명 · 적립 ' + dcImp.totalEntries + '건 · 합계 ' + dcImp.totalAmount.toLocaleString() + '원'
          + (dcImp.unmatched.length ? '   ⚠ 매칭실패(제외): ' + dcImp.unmatched.join(', ') : '')),
        h('div', { style:{ maxHeight:'160px', overflow:'auto', border:'1px solid #e2e8f0', borderRadius:'6px', marginBottom:'8px' } },
          h('table', { style:{ width:'100%', borderCollapse:'collapse', fontSize:'10.5px' } },
            h('tbody', null, dcImp.rows.map(function(R,i){
              return h('tr', { key:i, style:{ borderBottom:'1px solid #f1f5f9', background: R.sid?'#fff':'#fef2f2' } },
                h('td', { style:{ padding:'4px 8px', fontWeight:600 } }, R.name + (R.sid?'':' (매칭실패)')),
                h('td', { style:{ padding:'4px 8px', color:'#64748b' } }, R.entries.length + '건'),
                h('td', { style:{ padding:'4px 8px', textAlign:'right', fontWeight:600 } }, R.entries.reduce(function(s,e){return s+e.amount;},0).toLocaleString()+'원')
              );
            }))
          )),
        h('div', { style:{ display:'flex', gap:'8px', justifyContent:'flex-end' } },
          h('button', { onClick:function(){ setDcImp(null); }, style:{ padding:'7px 14px', borderRadius:'6px', border:'1px solid #cbd5e1', background:'#fff', fontSize:'12px', cursor:'pointer' } }, '취소'),
          h('button', { onClick:commitDCImport, style:{ padding:'7px 14px', borderRadius:'6px', border:'none', background:'#1e40af', color:'#fff', fontSize:'12px', fontWeight:700, cursor:'pointer' } }, '✅ 반영')
        )
      )
    ),

    // ─── 탭 1: 적립금 현황 ───
    tab === 'balance' && h('div', { style:{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:'8px', overflow:'auto', zoom:retZoom/100 } },
      h('table', { style:{ width:'100%', borderCollapse:'collapse', fontSize:'11px' } },
        h('thead', null, h('tr', { style:{ background:'#f8fafc' } },
          h('th', { style:{ padding:'5px 8px', textAlign:'left', fontWeight:700, color:'#475569', borderBottom:'1px solid #e2e8f0' } }, '직원'),
          h('th', { style:{ padding:'5px 8px', textAlign:'right', fontWeight:700, color:'#475569', borderBottom:'1px solid #e2e8f0', background:'#dcfce7' } }, '적립금'),
          h('th', { style:{ padding:'5px 8px', textAlign:'right', fontWeight:700, color:'#475569', borderBottom:'1px solid #e2e8f0', background:'#dbeafe' } }, '예상퇴직금'),
          h('th', { style:{ padding:'5px 8px', textAlign:'right', fontWeight:700, color:'#475569', borderBottom:'1px solid #e2e8f0', background:'#fef3c7' } }, '부족분')
        )),
        h('tbody', null,
          rows.map(function(r, idx){
            var expected = r.lifetimeWage > 0 ? Math.round(r.lifetimeWage / 12) : 0;
            var gap = r.pension.type==='DC' ? Math.max(0, expected - (r.balance||0)) : 0;
            return h('tr', { key:r.u.sid, style:{ background: idx%2===0?'#fff':'#f8fafc', borderBottom:'1px solid #f1f5f9' } },
              h('td', { style:{ padding:'5px 8px' } },
                h('div', { style:{ fontWeight:600, fontSize:'11px' } }, r.u.name),
                h('div', { style:{ display:'flex', alignItems:'center', gap:'4px', marginTop:'2px' } },
                  h('span', { style:{ fontSize:'10px', color:'#64748b' } }, r.u.title),
                  h('span', { style:{ padding:'1px 5px', borderRadius:'8px', fontSize:'10px', fontWeight:700,
                    background:TYPE_BG[r.pension.type], color:TYPE_COLOR[r.pension.type] } }, TYPE_LABEL[r.pension.type])
                )
              ),
              h('td', { style:{ padding:'5px 8px', textAlign:'right', fontFamily:'monospace', fontWeight:700, color: r.balance>0?'#16a34a':'#94a3b8', background:'#f0fdf4', fontSize:'11px' } },
                r.pension.type==='DC' ? r.balance.toLocaleString()+'원' : '-'
              ),
              h('td', { style:{ padding:'5px 8px', textAlign:'right', fontFamily:'monospace', fontWeight:700, color:'#1e40af', background:'#eff6ff', fontSize:'11px' } },
                r.pension.type==='DC' && r.lifetimeWage > 0 ? expected.toLocaleString()+'원' : '-'
              ),
              h('td', { style:{ padding:'5px 8px', textAlign:'right', fontFamily:'monospace', fontWeight:700, background:'#fef3c7', fontSize:'11px',
                color: r.pension.type!=='DC'?'#94a3b8': gap>0?'#c2410c':'#16a34a' } },
                r.pension.type==='DC' && r.lifetimeWage > 0
                  ? (gap>0 ? gap.toLocaleString()+'원' : '✓')
                  : '-'
              )
            );
          })
        )
      )
    ),

    // ─── 탭 2: 적립 내역 ───
    // ─── 탭: 월별 누계 ───
    tab === 'monthly' && (function(){
      var allContribs = getDCContributions();
      // 가용 연도 (데이터 있는 연도들)
      var availYears = {};
      allContribs.forEach(function(c){
        if(c.ym) availYears[c.ym.slice(0,4)] = true;
      });
      var nowY = String((new Date()).getFullYear());
      availYears[nowY] = true;
      var yearList = Object.keys(availYears).sort();

      // 직원 × 월 매트릭스 빌드
      var matrix = {};  // matrix[sid][month] = amount
      users.forEach(function(u){ matrix[u.sid] = {}; });
      allContribs.forEach(function(c){
        if(!c.ym || c.ym.slice(0,4) !== selYear) return;
        if(!matrix[c.sid]) matrix[c.sid] = {};
        var mo = parseInt(c.ym.slice(5,7), 10);
        matrix[c.sid][mo] = (matrix[c.sid][mo] || 0) + (parseInt(c.amount)||0);
      });

      // 직원별 연합계 + 누계잔액(전체)
      var employeeRows = users.map(function(u){
        var monthAmts = [];
        var yearTotal = 0;
        for(var m=1; m<=12; m++){
          var amt = matrix[u.sid][m] || 0;
          monthAmts.push(amt);
          yearTotal += amt;
        }
        var totalBalance = allContribs
          .filter(function(c){return c.sid===u.sid;})
          .reduce(function(s,c){return s+(parseInt(c.amount)||0);}, 0);
        var pension = getStaffPension(u.sid);
        return { u:u, pension:pension, monthAmts:monthAmts, yearTotal:yearTotal, totalBalance:totalBalance };
      });

      // DC만 표시 (전체 보기 옵션도)
      var dcRows = employeeRows.filter(function(r){return r.pension.type==='DC' || r.yearTotal>0;});

      // 월별 합계
      var monthSums = [];
      for(var m=0; m<12; m++){
        monthSums.push(dcRows.reduce(function(s,r){return s+r.monthAmts[m];}, 0));
      }
      var grandYearTotal = dcRows.reduce(function(s,r){return s+r.yearTotal;}, 0);
      var grandBalance = dcRows.reduce(function(s,r){return s+r.totalBalance;}, 0);

      // 셀 스타일
      var thMo = { padding:'7px 4px', textAlign:'right', fontWeight:700, color:'#475569', borderBottom:'1px solid #e2e8f0', fontSize:'10.5px', minWidth:'68px', background:'#f8fafc' };
      var tdMo = { padding:'6px 4px', textAlign:'right', fontFamily:'monospace', fontSize:'10.5px', borderBottom:'1px solid #f1f5f9' };

      function changeYear(d){
        var y = parseInt(selYear, 10) + d;
        setSelYear(String(y));
      }

      return h('div', null,
        // 연도 선택 + 안내
        h('div', { style:{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:'8px', padding:'12px 14px', marginBottom:'10px',
          display:'flex', gap:'10px', alignItems:'center', flexWrap:'wrap' } },
          h('button', { onClick:function(){changeYear(-1);},
            style:{ padding:'5px 10px', border:'1px solid #cbd5e1', borderRadius:'4px', background:'#fff', cursor:'pointer', fontSize:'12px' } }, '◀'),
          h('span', { style:{ fontSize:'15px', fontWeight:700, color:'#1e293b', minWidth:'70px', textAlign:'center' } }, selYear + '년'),
          h('button', { onClick:function(){changeYear(1);},
            style:{ padding:'5px 10px', border:'1px solid #cbd5e1', borderRadius:'4px', background:'#fff', cursor:'pointer', fontSize:'12px' } }, '▶'),
          h('select', { value:selYear, onChange:function(e){setSelYear(e.target.value);},
            style:{ padding:'5px 8px', border:'1px solid #cbd5e1', borderRadius:'4px', fontSize:'12px' } },
            yearList.map(function(y){return h('option', { key:y, value:y }, y+'년');})
          ),
          h('div', { style:{ flex:1 } }),
          h('div', { style:{ fontSize:'11px', color:'#64748b' } },
            '※ 연 합계: ', h('strong', { style:{ color:'#1e40af', fontFamily:'monospace' } }, grandYearTotal.toLocaleString()), '원',
            ' / 누계 잔액: ', h('strong', { style:{ color:'#16a34a', fontFamily:'monospace' } }, grandBalance.toLocaleString()), '원')
        ),
        // 매트릭스 표
        dcRows.length === 0
          ? h('div', { style:{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:'8px', padding:'40px', textAlign:'center', color:'#94a3b8', fontSize:'12px' } },
              h('div', { style:{ fontSize:'30px', marginBottom:'8px' } }, '📅'),
              selYear + '년 적립 기록이 없습니다.')
          : h('div', { style:{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:'8px', overflow:'auto', zoom:retZoom/100 } },
              h('table', { style:{ width:'100%', borderCollapse:'collapse', fontSize:'11px', minWidth:'1100px' } },
                h('thead', null,
                  h('tr', null,
                    h('th', { style:{ padding:'7px 10px', textAlign:'left', fontWeight:700, color:'#475569', borderBottom:'1px solid #e2e8f0', background:'#f8fafc', position:'sticky', left:0, zIndex:2, minWidth:'90px' } }, '직원'),
                    h('th', { style:{ padding:'7px', textAlign:'center', fontWeight:700, color:'#475569', borderBottom:'1px solid #e2e8f0', background:'#f8fafc', minWidth:'48px' } }, '구분'),
                    [1,2,3,4,5,6,7,8,9,10,11,12].map(function(m){
                      // 그 월의 DC 직원 전원 입금 여부
                      var monthStr = String(m).padStart(2,'0');
                      var dcOnlyRows = dcRows.filter(function(r){return r.pension.type==='DC';});
                      var paidCount = dcOnlyRows.filter(function(r){return r.monthAmts[m-1] > 0;}).length;
                      var allPaid = dcOnlyRows.length>0 && paidCount === dcOnlyRows.length;
                      var anyPaid = paidCount > 0;
                      return h('th', { key:m, style:Object.assign({}, thMo, { textAlign:'center', padding:'4px 2px' }) },
                        h('div', { style:{ display:'flex', flexDirection:'column', alignItems:'center', gap:'1px' } },
                          h('div', null, m+'월'),
                          h('input', { type:'checkbox',
                            checked: allPaid,
                            ref: function(el){ if(el) el.indeterminate = anyPaid && !allPaid; },
                            onChange: async function(e){
                              var willCheck = e.target.checked;
                              if(willCheck){
                                // 입사일 이전 / 퇴사일 이후 자동 제외
                                var eligible = dcOnlyRows.filter(function(r){
                                  if(r.monthAmts[m-1] > 0) return false; // 이미 적립됨
                                  var hireYM = (r.u.hireDate||'').slice(0,7);
                                  if(hireYM && (selYear+'-'+monthStr) < hireYM) return false;
                                  var retireYM = (r.u.retireDate||'').slice(0,7);
                                  if(retireYM && (selYear+'-'+monthStr) > retireYM) return false;
                                  return true;
                                });
                                if(eligible.length === 0){ showToast('대상 직원 없음 (이미 적립 완료 또는 입사 전/퇴사 후)'); return; }
                                if(!(await popConfirm(selYear+'-'+monthStr+' 당월 일괄 적립?\n\n대상: '+eligible.length+'명\n직전월 금액으로 채움 (없으면 통상임금×1/12)'))) return;
                                var list = getDCContributions();
                                var added = 0;
                                eligible.forEach(function(r){
                                  // 직전월 금액 우선
                                  var amt = 0;
                                  for(var mm=m-1; mm>=1; mm--){
                                    if(r.monthAmts[mm-1] > 0){ amt = r.monthAmts[mm-1]; break; }
                                  }
                                  if(amt === 0){
                                    // 직전월 없으면 통상임금×1/12
                                    var monthlyWage = (r.u.baseSalary||0) + (r.u.fixedAllowance||0) + (r.u.bonus||0);
                                    if(r.u.allowances && typeof r.u.allowances === 'object'){
                                      Object.keys(r.u.allowances).forEach(function(k){ monthlyWage += parseInt(r.u.allowances[k])||0; });
                                    }
                                    amt = Math.round(monthlyWage/12);
                                  }
                                  if(amt <= 0) return;
                                  list.push({
                                    id:'dc-'+Date.now().toString(36)+Math.random().toString(36).slice(2,5)+'-'+r.u.sid,
                                    sid:r.u.sid, ym:selYear+'-'+monthStr, amount:amt,
                                    paidDate:selYear+'-'+monthStr+'-15', note:'일괄 적립',
                                    auto:true, createdAt:(new Date()).toISOString()
                                  });
                                  added++;
                                });
                                persistContrib(list);
                                showToast('✅ '+selYear+'-'+monthStr+' '+added+'명 일괄 적립');
                              } else {
                                if(!(await popConfirm(selYear+'-'+monthStr+' 일괄 취소?\n\n해당 월 모든 DC 직원의 적립 기록이 삭제됩니다.'))) return;
                                var ymTarget = selYear+'-'+monthStr;
                                var removed = 0;
                                var list2 = getDCContributions().filter(function(c){
                                  if(c.ym === ymTarget && dcOnlyRows.find(function(r){return r.u.sid===c.sid;})){ removed++; return false; }
                                  return true;
                                });
                                persistContrib(list2);
                                showToast('🗑️ '+ymTarget+' '+removed+'건 취소');
                              }
                            },
                            title: anyPaid ? (paidCount+'/'+dcOnlyRows.length+'명 적립') : '일괄 적립',
                            style:{ width:'13px', height:'13px', cursor:'pointer', accentColor:'#16a34a' } })
                        ));
                    }),
                    h('th', { style:Object.assign({}, thMo, { background:'#dbeafe', color:'#1e40af', minWidth:'90px' }) }, '연합계'),
                    h('th', { style:Object.assign({}, thMo, { background:'#dcfce7', color:'#166534', minWidth:'105px' }) }, '누계잔액')
                  )
                ),
                h('tbody', null,
                  dcRows.map(function(r, idx){
                    return h('tr', { key:r.u.sid,
                      style:{ background: idx%2===0?'#fff':'#f8fafc' } },
                      h('td', { style:{ padding:'6px 10px', fontWeight:600, position:'sticky', left:0, background: idx%2===0?'#fff':'#f8fafc', zIndex:1, borderBottom:'1px solid #f1f5f9' } },
                        h('div', { style:{ fontWeight:600 } }, r.u.name),
                        h('div', { style:{ fontSize:'10px', color:'#94a3b8' } }, r.u.title)
                      ),
                      h('td', { style:{ padding:'5px 7px', textAlign:'center', borderBottom:'1px solid #f1f5f9' } },
                        h('span', { style:{ padding:'1px 6px', borderRadius:'10px',
                          background: r.pension.type==='DC'?'#dbeafe':'#fee2e2',
                          color: r.pension.type==='DC'?'#1e40af':'#dc2626',
                          fontSize:'10px', fontWeight:700 } },
                          r.pension.type==='DC'?'DC':r.pension.type==='DB'?'DB':'미가입')
                      ),
                      r.monthAmts.map(function(amt, mi){
                        var monthStr = String(mi+1).padStart(2,'0');
                        var cellYM = selYear+'-'+monthStr;
                        var rec = allContribs.find(function(c){ return c.sid===r.u.sid && c.ym===cellYM; });
                        var paidMMDD = rec && rec.paidDate ? rec.paidDate.slice(5).replace('-','/') : '';
                        var checked = amt > 0;
                        // 입사일 이전 체크 (입사일 미설정 시 모두 허용)
                        var hireYM = (r.u.hireDate||'').slice(0,7);
                        var beforeHire = hireYM && cellYM < hireYM;
                        // 퇴사일 이후 체크
                        var retireYM = (r.u.retireDate||'').slice(0,7);
                        var afterRetire = retireYM && cellYM > retireYM;
                        var canEdit = r.pension.type === 'DC' && !beforeHire && !afterRetire;
                        var disabled = beforeHire || afterRetire;
                        return h('td', { key:mi,
                          onClick: canEdit ? function(){
                            if(rec) openContribEdit(rec, r.u);
                            else openContribAdd(r.u, cellYM);
                          } : null,
                          title: beforeHire ? ('입사일('+r.u.hireDate+') 이전') : afterRetire ? ('퇴사일('+r.u.retireDate+') 이후') : '',
                          style:Object.assign({}, tdMo, {
                            cursor: canEdit?'pointer':'not-allowed',
                            background: disabled?'#f8fafc':(checked?'#f0fdf4':'transparent'),
                            textAlign:'center', padding:'4px 2px',
                            opacity: disabled ? 0.3 : 1 }) },
                          disabled
                            ? h('div', { style:{ fontSize:'10px', color:'#cbd5e1' } }, beforeHire?'입사전':'퇴사후')
                            : h('div', { style:{ display:'flex', flexDirection:'column', alignItems:'center', gap:'1px' } },
                                h('input', { type:'checkbox', checked:checked, readOnly:true,
                                  style:{ width:'14px', height:'14px', accentColor:'#16a34a',
                                    cursor: canEdit?'pointer':'not-allowed', pointerEvents:'none' } }),
                                paidMMDD && h('div', { style:{ fontSize:'10px', color:'#94a3b8', fontFamily:'monospace' } }, paidMMDD),
                                amt>0 && h('div', { style:{ fontSize:'10.5px', color:'#166534', fontWeight:700, fontFamily:'monospace' } }, amt.toLocaleString())
                              )
                        );
                      }),
                      h('td', { style:Object.assign({}, tdMo, { background:'#eff6ff', fontWeight:700, color:'#1e40af' }) },
                        r.yearTotal.toLocaleString()),
                      h('td', { style:Object.assign({}, tdMo, { background:'#f0fdf4', fontWeight:700, color:'#166534' }) },
                        r.totalBalance.toLocaleString())
                    );
                  })
                ),
                // 합계 행
                h('tfoot', null,
                  h('tr', { style:{ background:'#f8fafc', borderTop:'2px solid #cbd5e1' } },
                    h('td', { style:{ padding:'8px 10px', fontWeight:700, color:'#1e293b', position:'sticky', left:0, background:'#f8fafc', zIndex:1 } }, '합계'),
                    h('td', { style:{ padding:'7px', textAlign:'center', color:'#64748b', fontSize:'10px' } }, dcRows.length+'명'),
                    monthSums.map(function(s, mi){
                      return h('td', { key:mi, style:Object.assign({}, tdMo, { fontWeight:700, color: s>0?'#1e293b':'#cbd5e1' }) },
                        s>0 ? s.toLocaleString() : '-');
                    }),
                    h('td', { style:Object.assign({}, tdMo, { background:'#dbeafe', fontWeight:800, color:'#1e40af', fontSize:'11.5px' }) },
                      grandYearTotal.toLocaleString()),
                    h('td', { style:Object.assign({}, tdMo, { background:'#dcfce7', fontWeight:800, color:'#166534', fontSize:'11.5px' }) },
                      grandBalance.toLocaleString())
                  )
                )
              )
            ),
        h('div', { style:{ marginTop:'8px', fontSize:'10.5px', color:'#94a3b8', lineHeight:'1.6' } },
          '💡 ',h('strong',null,'연합계'),'는 해당 연도 적립금 합계, ',
          h('strong',null,'누계잔액'),'은 가입 후 전 기간 누적 적립금입니다. ',
          'DC 가입자만 매월 자동 적립되며, 미가입자/DB는 적립금이 표시되지 않습니다.')
      );
    })(),

    // ─── 탭 4: 퇴직금 계산 ───
    tab === 'calc' && h('div', { style:{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:'8px', padding:'14px' } },
      h('div', { style:{ fontSize:'12px', color:'#475569', marginBottom:'10px' } },
        '직원별 [🧮 계산] 버튼을 클릭하면 퇴직일 입력 후 ',
        h('strong', null, 'DC 가입자는 적립금 잔액'), ', ',
        h('strong', null, '미가입자는 법정 퇴직금'), '이 자동 계산됩니다.'),
      h('div', { style:{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(220px, 1fr))', gap:'10px' } },
        rows.map(function(r){
          return h('div', { key:r.u.sid,
            style:{ border:'1px solid '+TYPE_BG[r.pension.type], borderRadius:'7px', padding:'10px 12px', background:'#fff' } },
            h('div', { style:{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'5px' } },
              h('div', { style:{ fontWeight:700, fontSize:'12.5px' } }, r.u.name),
              h('span', { style:{ padding:'2px 7px', borderRadius:'10px',
                background:TYPE_BG[r.pension.type], color:TYPE_COLOR[r.pension.type],
                fontSize:'10.5px', fontWeight:700 } }, TYPE_LABEL[r.pension.type])
            ),
            h('div', { style:{ fontSize:'10.5px', color:'#94a3b8', marginBottom:'8px' } }, r.u.title),
            r.pension.type === 'DC'
              ? h('div', { style:{ fontSize:'14px', fontWeight:700, color:'#16a34a', fontFamily:'monospace' } }, r.balance.toLocaleString()+'원')
              : h('div', { style:{ fontSize:'10.5px', color:'#dc2626', fontWeight:600 } }, '⚠️ 법정퇴직금 발생'),
            h('button', { onClick:function(){openCalcModal(r.u);},
              style:{ marginTop:'8px', width:'100%', padding:'5px', background:'#1e40af', color:'#fff', border:'none', borderRadius:'4px', cursor:'pointer', fontSize:'11px', fontWeight:600 } }, '🧮 계산하기')
          );
        })
      )
    ),

    // ─── 모달: 퇴직연금 정보 설정 ───
    setupModal && h('div', { className:'modal-bg', onClick:function(){setSetupModal(null);} },
      h('div', { className:'modal', style:{ width:'480px' }, onClick:function(e){e.stopPropagation();} },
        h('div', { className:'modal-h' },
          h('div', { className:'t' }, '⚙️ 퇴직연금 정보 - ' + setupModal.name),
          h('button', { className:'x', onClick:function(){setSetupModal(null);} }, '×')
        ),
        h('div', { className:'modal-b' },
          h('div', { className:'fld' },
            h('label', null, '가입 유형'),
            h('select', { value:setupModal.type,
              onChange:function(e){setSetupModal(Object.assign({},setupModal,{type:e.target.value}));},
              style:{ width:'100%' } },
              h('option', { value:'NONE' }, '미가입 (→ 법정 퇴직금)'),
              h('option', { value:'DC' }, 'DC형 (확정기여)'),
              h('option', { value:'DB' }, 'DB형 (확정급여)')
            ),
            h('div', { style:{ fontSize:'10.5px', color:'#94a3b8', marginTop:'3px' } },
              setupModal.type==='DC' ? '💡 매월 임금의 1/12 이상을 적립. 월별급여 확정 시 자동 누적.'
              : setupModal.type==='DB' ? '💡 회사가 운용 책임. 퇴직 시 평균임금 30일분×근속연수 지급.'
              : '⚠️ 퇴직 시 근로기준법에 따라 법정 퇴직금 지급 의무 발생')
          ),
          (setupModal.type==='DC' || setupModal.type==='DB') && h('div', null,
            h('div', { className:'fld' },
              h('label', null, '금융기관'),
              h('input', { type:'text', value:setupModal.provider||'',
                onChange:function(e){setSetupModal(Object.assign({},setupModal,{provider:e.target.value}));},
                placeholder:'예: 신한은행 / 미래에셋증권', style:{ width:'100%' } })
            ),
            h('div', { className:'fld' },
              h('label', null, '계좌번호'),
              h('input', { type:'text', value:setupModal.account||'',
                onChange:function(e){setSetupModal(Object.assign({},setupModal,{account:e.target.value}));},
                placeholder:'예: 110-123-456789', style:{ width:'100%', fontFamily:'monospace' } })
            ),
            h('div', { className:'fld' },
              h('label', null, '가입일'),
              h(KoreanDatePicker, { value:setupModal.startDate||'',
                onChange:function(e){setSetupModal(Object.assign({},setupModal,{startDate:e.target.value}));},
                style:{ width:'100%' } })
            )
          )
        ),
        h('div', { className:'modal-f' },
          h('button', { className:'btn-secondary', onClick:function(){setSetupModal(null);} }, '취소'),
          h('button', { className:'btn-primary', onClick:saveSetup }, '✅ 저장')
        )
      )
    ),

    // ─── 모달: 적립 추가/수정 ───
    contribModal && h('div', { className:'modal-bg', onClick:function(){setContribModal(null);} },
      h('div', { className:'modal', style:{ width:'480px' }, onClick:function(e){e.stopPropagation();} },
        h('div', { className:'modal-h' },
          h('div', { className:'t' }, (contribModal.isNew?'+ 적립 추가':'적립 수정') + ' - ' + contribModal.name),
          h('button', { className:'x', onClick:function(){setContribModal(null);} }, '×')
        ),
        h('div', { className:'modal-b' },
          h('div', { style:{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px' } },
            h('div', { className:'fld' },
              h('label', null, '귀속 년월'),
              h('input', { type:'month', value:contribModal.ym,
                onChange:function(e){setContribModal(Object.assign({},contribModal,{ym:e.target.value}));},
                style:{ width:'100%' } })
            ),
            h('div', { className:'fld' },
              h('label', null, '입금일'),
              h(KoreanDatePicker, { value:contribModal.paidDate||'',
                onChange:function(e){setContribModal(Object.assign({},contribModal,{paidDate:e.target.value}));},
                style:{ width:'100%' } })
            )
          ),
          h('div', { className:'fld' },
            h('label', null, '적립금액'),
            h('input', { type:'text', value:parseInt(contribModal.amount||0).toLocaleString(),
              onChange:function(e){setContribModal(Object.assign({},contribModal,{amount:parseInt(e.target.value.replace(/[^0-9]/g,''))||0}));},
              placeholder:'0', style:{ width:'100%', fontFamily:'monospace', textAlign:'right' } })
          ),
          h('div', { className:'fld' },
            h('label', null, '비고'),
            h('input', { type:'text', value:contribModal.note||'',
              onChange:function(e){setContribModal(Object.assign({},contribModal,{note:e.target.value}));},
              placeholder:'예: 연말정산 추가 적립', style:{ width:'100%' } })
          )
        ),
        h('div', { className:'modal-f' },
          !contribModal.isNew && h('button', {
            onClick:function(){
              deleteContrib(contribModal.id);
              setContribModal(null);
            },
            style:{ padding:'7px 14px', background:'#fee2e2', color:'#991b1b', border:'1px solid #fca5a5', borderRadius:'4px', cursor:'pointer', fontSize:'12px', fontWeight:700, marginRight:'auto' }
          }, '🗑 적립 취소'),
          h('button', { className:'btn-secondary', onClick:function(){setContribModal(null);} }, '취소'),
          h('button', { className:'btn-primary', onClick:saveContrib }, '✅ 저장')
        )
      )
    ),

    // ─── 모달: 퇴직금 계산 ───
    calcModal && (function(){
      var calc = calcLegalSeverance(calcModal.sid, calcModal.hireDate, calcModal.retireDate);
      var dcBalance = getDCBalance(calcModal.sid);
      return h('div', { className:'modal-bg', onClick:function(){setCalcModal(null);} },
        h('div', { className:'modal', style:{ width:'620px' }, onClick:function(e){e.stopPropagation();} },
          h('div', { className:'modal-h' },
            h('div', { className:'t' }, '🧮 퇴직금 계산 - ' + calcModal.name + ' (' + calcModal.title + ')'),
            h('button', { className:'x', onClick:function(){setCalcModal(null);} }, '×')
          ),
          h('div', { className:'modal-b' },
            h('div', { style:{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px' } },
              h('div', { className:'fld' },
                h('label', null, '입사일'),
                h(KoreanDatePicker, { value:calcModal.hireDate||'',
                  onChange:function(e){setCalcModal(Object.assign({},calcModal,{hireDate:e.target.value}));},
                  style:{ width:'100%' } })
              ),
              h('div', { className:'fld' },
                h('label', null, '퇴직(예정)일'),
                h(KoreanDatePicker, { value:calcModal.retireDate||'',
                  onChange:function(e){setCalcModal(Object.assign({},calcModal,{retireDate:e.target.value}));},
                  style:{ width:'100%' } })
              )
            ),
            // DC 가입자
            calcModal.pension.type === 'DC' && h('div', { style:{ background:'#dbeafe', border:'1px solid #93c5fd', borderRadius:'7px', padding:'14px', marginTop:'10px' } },
              h('div', { style:{ fontSize:'12px', color:'#1e40af', fontWeight:700, marginBottom:'6px' } }, '🏦 DC형 퇴직연금 적립금'),
              h('div', { style:{ fontSize:'10.5px', color:'#1e3a8a', marginBottom:'8px' } },
                '※ DC형은 회사가 매월 적립한 금액 + 운용 수익이 퇴직급여가 됩니다. (실제 수령액은 운용성과에 따라 변동)'),
              h('div', { style:{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 0', borderTop:'1px solid #93c5fd' } },
                h('div', { style:{ fontSize:'12px', color:'#1e40af', fontWeight:600 } }, '회사 적립 누계'),
                h('div', { style:{ fontSize:'18px', fontWeight:800, color:'#1e40af', fontFamily:'monospace' } }, dcBalance.toLocaleString()+'원')
              ),
              h('div', { style:{ fontSize:'10.5px', color:'#64748b', marginTop:'4px' } },
                '➕ 운용수익은 ',(calcModal.pension.provider||'금융기관'),' (',(calcModal.pension.account||'-'),')에서 조회')
            ),
            // DB / NONE → 법정퇴직금 계산
            (calcModal.pension.type === 'NONE' || calcModal.pension.type === 'DB') && calc && (
              !calc.eligible
                ? h('div', { style:{ background:'#fee2e2', border:'1px solid #fca5a5', borderRadius:'7px', padding:'14px', marginTop:'10px' } },
                    h('div', { style:{ fontSize:'12.5px', color:'#991b1b', fontWeight:700 } }, '⚠️ '+calc.reason),
                    h('div', { style:{ fontSize:'11px', color:'#7f1d1d', marginTop:'4px' } }, '근속기간 1년 미만은 퇴직금 지급 대상이 아닙니다.')
                  )
                : h('div', { style:{ marginTop:'10px' } },
                    h('div', { style:{ background:'#fef3c7', border:'1px solid #fde68a', borderRadius:'7px', padding:'12px', marginBottom:'10px' } },
                      h('div', { style:{ fontSize:'11.5px', color:'#854d0e', fontWeight:700, marginBottom:'8px' } },
                        '📐 법정 퇴직금 계산식 (근로기준법 §34, 시행령 §2)'),
                      h('div', { style:{ fontSize:'11px', color:'#451a03', lineHeight:'1.7', fontFamily:'monospace' } },
                        h('div', null, '퇴직금 = ', h('strong',null,'1일 평균임금'), ' × ', h('strong',null,'30일'), ' × ', h('strong',null,'근속연수')),
                        h('div', { style:{ fontSize:'10px', color:'#78350f', marginTop:'4px' } },
                          '* 1일 평균임금 = 퇴직 전 3개월 임금총액 / 그 기간의 총일수'),
                        h('div', { style:{ fontSize:'10px', color:'#78350f' } },
                          '* 통상일급이 평균일급보다 클 경우 통상일급 적용 (근로자 유리)')
                      )
                    ),
                    h('table', { style:{ width:'100%', borderCollapse:'collapse', fontSize:'11.5px', marginBottom:'10px' } },
                      h('tbody', null,
                        h('tr', null,
                          h('td', { style:{ padding:'6px 10px', background:'#f8fafc', fontWeight:600, color:'#475569', width:'140px' } }, '근속기간'),
                          h('td', { style:{ padding:'6px 10px', fontFamily:'monospace', fontWeight:700 } },
                            calc.yearMonths.y+'년 '+calc.yearMonths.m+'개월 ('+calc.years+'년)')
                        ),
                        h('tr', null,
                          h('td', { style:{ padding:'6px 10px', background:'#f8fafc', fontWeight:600, color:'#475569' } }, '평균임금 산정 기간'),
                          h('td', { style:{ padding:'6px 10px', fontFamily:'monospace' } },
                            calc.averageWage.days + '일 (' + calc.averageWage.months.length + '개월분)')
                        ),
                        h('tr', null,
                          h('td', { style:{ padding:'6px 10px', background:'#f8fafc', fontWeight:600, color:'#475569' } }, '3개월 임금총액'),
                          h('td', { style:{ padding:'6px 10px', fontFamily:'monospace', fontWeight:600 } },
                            calc.averageWage.totalWage.toLocaleString()+'원')
                        ),
                        h('tr', null,
                          h('td', { style:{ padding:'6px 10px', background:'#f8fafc', fontWeight:600, color:'#475569' } }, '1일 평균임금'),
                          h('td', { style:{ padding:'6px 10px', fontFamily:'monospace', fontWeight:600 } },
                            calc.averageWage.dailyAvg.toLocaleString()+'원')
                        ),
                        h('tr', null,
                          h('td', { style:{ padding:'6px 10px', background:'#f8fafc', fontWeight:600, color:'#475569' } }, '1일 통상임금'),
                          h('td', { style:{ padding:'6px 10px', fontFamily:'monospace' } },
                            calc.ordinaryDailyWage.toLocaleString()+'원')
                        ),
                        h('tr', null,
                          h('td', { style:{ padding:'6px 10px', background:'#dbeafe', fontWeight:700, color:'#1e40af' } }, '적용 1일임금'),
                          h('td', { style:{ padding:'6px 10px', fontFamily:'monospace', fontWeight:700, color:'#1e40af' } },
                            calc.dailyApplied.toLocaleString()+'원 ('+(calc.basis==='ordinary'?'통상임금':'평균임금')+' 적용)')
                        )
                      )
                    ),
                    h('div', { style:{ background:'#dcfce7', border:'2px solid #86efac', borderRadius:'7px', padding:'14px' } },
                      h('div', { style:{ fontSize:'11.5px', color:'#166534', fontWeight:700, marginBottom:'5px' } }, '💰 법정 퇴직금'),
                      h('div', { style:{ fontSize:'10.5px', color:'#16a34a', fontFamily:'monospace', marginBottom:'8px' } },
                        calc.dailyApplied.toLocaleString()+' × 30일 × '+calc.years+'년'),
                      h('div', { style:{ fontSize:'24px', fontWeight:800, color:'#166534', fontFamily:'monospace', textAlign:'right' } },
                        calc.severance.toLocaleString()+'원')
                    ),
                    calc.averageWage.months.length > 0 && h('div', { style:{ marginTop:'10px', fontSize:'10.5px', color:'#64748b' } },
                      '📋 산정 기준 월별 임금: ',
                      calc.averageWage.months.map(function(m){return m.ym+' '+m.wage.toLocaleString();}).join(' / ')
                    )
                  )
            )
          ),
          h('div', { className:'modal-f' },
            h('button', { className:'btn-primary', onClick:function(){setCalcModal(null);} }, '닫기')
          )
        )
      );
    })(),

    // ─── 탭 5: 퇴사자 정산 ───
    tab === 'settle' && (function(){
      var retiredList = allUsers.filter(function(u){return u.status==='retired';});
      var settlements = dbGet('retirement_settlements', []);
      var settleByUser = {};
      settlements.forEach(function(s){ settleByUser[s.sid] = s; });

      function openSettle(u){
        var existing = settleByUser[u.sid];
        var joinDate = u.hireDate || u.joinDate || '';
        var retireDate = u.retireDate || todayYMD();
        var workDays = 0, workYears = 0;
        if(joinDate){
          var d1 = new Date(joinDate); var d2 = new Date(retireDate);
          workDays = Math.floor((d2-d1)/86400000);
          workYears = Math.floor(workDays/365 * 10) / 10;
        }

        // 최근 3개월 평균임금 자동 계산
        var avgWageBase = 0;
        try {
          var ym = retireDate.slice(0,7);
          var pms = dbGet('payroll_monthly', []).filter(function(p){return p.sid===u.sid;});
          var sorted = pms.filter(function(p){return p.ym < ym;}).sort(function(a,b){return b.ym.localeCompare(a.ym);}).slice(0,3);
          if(sorted.length > 0){
            var totalGross = sorted.reduce(function(s,p){
              var r = calcPayroll(p);
              return s + (r.averageBase || r.grossPay || 0);
            }, 0);
            avgWageBase = Math.round(totalGross / Math.max(1, sorted.length * 30));  // 1일 평균임금
          }
        } catch(e){ window._erpErrLog && window._erpErrLog(e); }

        // 법정 퇴직금 자동 계산
        var severancePay = (workYears >= 1) ? Math.round(avgWageBase * 30 * workYears) : 0;

        setSettleModal(existing
          ? Object.assign({}, existing, { isNew:false })
          : {
              isNew: true,
              id: 'rsett-'+u.sid+'-'+Date.now(),
              sid: u.sid, name: u.name,
              joinDate: joinDate, retireDate: retireDate,
              workDays: workDays, workYears: workYears,
              avgWageBase: avgWageBase,
              avgWageBaseOverride: '',
              severancePay: severancePay,
              severancePayOverride: '',
              unpaidSalary: 0,
              unpaidSalaryNote: '',
              annualLeaveRemain: 0,
              annualLeavePay: 0,
              consolation: 0,
              customItems: [],
              incomeTax: 0,
              localTax: 0,
              insuranceAdjust: 0,
              customDeducts: [],
              status: 'draft',
              paidDate: '',
              note: '',
              createdAt: (new Date()).toISOString(),
              createdBy: (CURRENT_USER && CURRENT_USER.name) || ''
            });
      }

      return h('div', null,
        h('div', { style:{background:'#fef2f2', border:'1px solid #fca5a5', borderRadius:'7px', padding:'10px 14px', marginBottom:'12px', fontSize:'11.5px', color:'#991b1b'} },
          '💼 ', h('strong', null, '퇴사자 정산 시스템'),
          h('div', { style:{marginTop:'4px', color:'#7f1d1d', fontSize:'11px'} },
            '재직 기간 자동 계산 + 평균임금/퇴직금 자동 산정. 모든 항목은 수동 조정 가능. 정산 확정 시 출금관리에 자동 연동(예정).')
        ),

        // 통계
        (function(){
          var draft = settlements.filter(function(s){return s.status==='draft';}).length;
          var confirmed = settlements.filter(function(s){return s.status==='confirmed';}).length;
          var paid = settlements.filter(function(s){return s.status==='paid';}).length;
          return h('div', { style:{display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'8px', marginBottom:'12px'} },
            h('div', { style:{background:'#fef3c7', border:'1px solid #fde68a', borderRadius:'6px', padding:'10px 12px'} },
              h('div', { style:{fontSize:'10.5px', color:'#854d0e', fontWeight:600} }, '👥 퇴사자 총 수'),
              h('div', { style:{fontSize:'13px', fontWeight:800, color:'#854d0e'} }, retiredList.length+'명')),
            h('div', { style:{background:'#f1f5f9', border:'1px solid #cbd5e1', borderRadius:'6px', padding:'10px 12px'} },
              h('div', { style:{fontSize:'10.5px', color:'#475569', fontWeight:600} }, '📝 정산 작성중'),
              h('div', { style:{fontSize:'13px', fontWeight:800, color:'#475569'} }, draft+'건')),
            h('div', { style:{background:'#dbeafe', border:'1px solid #93c5fd', borderRadius:'6px', padding:'10px 12px'} },
              h('div', { style:{fontSize:'10.5px', color:'#1e40af', fontWeight:600} }, '✓ 정산 확정'),
              h('div', { style:{fontSize:'13px', fontWeight:800, color:'#1e40af'} }, confirmed+'건')),
            h('div', { style:{background:'#dcfce7', border:'1px solid #bbf7d0', borderRadius:'6px', padding:'10px 12px'} },
              h('div', { style:{fontSize:'10.5px', color:'#166534', fontWeight:600} }, '💰 지급 완료'),
              h('div', { style:{fontSize:'13px', fontWeight:800, color:'#166534'} }, paid+'건'))
          );
        })(),

        // 퇴사자 목록 테이블
        retiredList.length === 0
          ? h('div', { style:{textAlign:'center', padding:'40px', color:'#94a3b8', fontSize:'12px', background:'#fff', border:'1px solid #e2e8f0', borderRadius:'8px'} },
              '퇴사자가 없습니다. 환경설정 → 사용자관리에서 상태를 [퇴직]으로 변경하면 여기 표시됩니다.')
          : h('div', { style:{background:'#fff', border:'1px solid #e2e8f0', borderRadius:'8px', overflow:'hidden'} },
              h('table', { style:{width:'100%', borderCollapse:'collapse', fontSize:'11.5px'} },
                h('thead', null, h('tr', { style:{background:'#f8fafc'} },
                  h('th', { style:{padding:'8px', textAlign:'left', fontWeight:700, color:'#475569', borderBottom:'1px solid #e2e8f0'} }, '직원'),
                  h('th', { style:{padding:'8px', textAlign:'left', fontWeight:700, color:'#475569', borderBottom:'1px solid #e2e8f0'} }, '직책'),
                  h('th', { style:{padding:'8px', textAlign:'left', fontWeight:700, color:'#475569', borderBottom:'1px solid #e2e8f0'} }, '입사일'),
                  h('th', { style:{padding:'8px', textAlign:'left', fontWeight:700, color:'#475569', borderBottom:'1px solid #e2e8f0'} }, '퇴사일'),
                  h('th', { style:{padding:'8px', textAlign:'right', fontWeight:700, color:'#475569', borderBottom:'1px solid #e2e8f0'} }, '순지급액'),
                  h('th', { style:{padding:'8px', textAlign:'center', fontWeight:700, color:'#475569', borderBottom:'1px solid #e2e8f0'} }, '상태'),
                  h('th', { style:{padding:'8px', textAlign:'center', fontWeight:700, color:'#475569', borderBottom:'1px solid #e2e8f0'} }, '관리')
                )),
                h('tbody', null,
                  retiredList.map(function(u){
                    var st = settleByUser[u.sid];
                    var statusLabel = '미작성';
                    var statusColor = '#94a3b8'; var statusBg = '#f1f5f9';
                    if(st){
                      if(st.status==='paid'){ statusLabel='지급완료'; statusColor='#166534'; statusBg='#dcfce7'; }
                      else if(st.status==='confirmed'){ statusLabel='확정'; statusColor='#1e40af'; statusBg='#dbeafe'; }
                      else { statusLabel='작성중'; statusColor='#854d0e'; statusBg='#fef3c7'; }
                    }
                    return h('tr', { key:u.sid, style:{borderTop:'1px solid #e2e8f0'} },
                      h('td', { style:{padding:'7px 8px', fontWeight:600} }, u.name),
                      h('td', { style:{padding:'7px 8px', color:'#64748b'} }, u.title||'-'),
                      h('td', { style:{padding:'7px 8px', fontFamily:'monospace', color:'#475569'} }, u.hireDate||u.joinDate||'-'),
                      h('td', { style:{padding:'7px 8px', fontFamily:'monospace', color:'#dc2626', fontWeight:600} }, u.retireDate||'-'),
                      h('td', { style:{padding:'7px 8px', textAlign:'right', fontFamily:'monospace', fontWeight:700} },
                        st ? (st.netPay||0).toLocaleString()+'원' : '-'),
                      h('td', { style:{padding:'7px 8px', textAlign:'center'} },
                        h('span', { style:{background:statusBg, color:statusColor, padding:'2px 8px', borderRadius:'10px', fontSize:'10.5px', fontWeight:700} }, statusLabel)),
                      h('td', { style:{padding:'7px 8px', textAlign:'center'} },
                        h('button', { onClick:function(){openSettle(u);},
                          style:{padding:'3px 10px', background:st?'#dbeafe':'#1e40af', color:st?'#1e40af':'#fff', border:'none', borderRadius:'4px', cursor:'pointer', fontSize:'11px', fontWeight:600} },
                          st ? '📝 수정/조회' : '➕ 정산 작성'))
                    );
                  })
                )
              )
            )
      );
    })(),

    // ─── 퇴사자 정산 모달 ───
    settleModal && (function(){
      var avgWage = parseInt(settleModal.avgWageBaseOverride) || parseInt(settleModal.avgWageBase) || 0;
      var severance = parseInt(settleModal.severancePayOverride) || parseInt(settleModal.severancePay) || 0;
      var unpaid = parseInt(settleModal.unpaidSalary)||0;
      var annualPay = parseInt(settleModal.annualLeavePay)||0;
      var consolation = parseInt(settleModal.consolation)||0;
      var customSum = (settleModal.customItems||[]).reduce(function(s,x){return s+(parseInt(x.amount)||0);},0);
      var totalGross = severance + unpaid + annualPay + consolation + customSum;
      var incomeTax = parseInt(settleModal.incomeTax)||0;
      var localTax = parseInt(settleModal.localTax)||0;
      var insAdj = parseInt(settleModal.insuranceAdjust)||0;
      var customDeductSum = (settleModal.customDeducts||[]).reduce(function(s,x){return s+(parseInt(x.amount)||0);},0);
      var totalDeduct = incomeTax + localTax + insAdj + customDeductSum;
      var netPay = totalGross - totalDeduct;

      function upd(field, v){ setSettleModal(Object.assign({}, settleModal, {_:Math.random()}, (function(){var o={};o[field]=v;return o;})())); }
      function addCustom(){
        var list = (settleModal.customItems||[]).concat([{name:'', amount:0}]);
        upd('customItems', list);
      }
      function delCustom(idx){
        var list = (settleModal.customItems||[]).filter(function(_,i){return i!==idx;});
        upd('customItems', list);
      }
      function updCustom(idx, field, v){
        var list = (settleModal.customItems||[]).map(function(x,i){return i===idx ? Object.assign({},x,(function(){var o={};o[field]=v;return o;})()) : x;});
        upd('customItems', list);
      }
      function addCustomDeduct(){
        var list = (settleModal.customDeducts||[]).concat([{name:'', amount:0}]);
        upd('customDeducts', list);
      }
      function delCustomDeduct(idx){
        var list = (settleModal.customDeducts||[]).filter(function(_,i){return i!==idx;});
        upd('customDeducts', list);
      }
      function updCustomDeduct(idx, field, v){
        var list = (settleModal.customDeducts||[]).map(function(x,i){return i===idx ? Object.assign({},x,(function(){var o={};o[field]=v;return o;})()) : x;});
        upd('customDeducts', list);
      }
      function saveSettle(s){
        var arr = dbGet('retirement_settlements', []);
        var idx = arr.findIndex(function(x){return x.id===settleModal.id;});
        var nextItem = Object.assign({}, settleModal, {
          totalGross:totalGross, totalDeduct:totalDeduct, netPay:netPay,
          status: s || settleModal.status || 'draft',
          updatedAt: (new Date()).toISOString()
        });
        if(s === 'paid' && !nextItem.paidDate) nextItem.paidDate = todayYMD();
        if(idx >= 0) arr[idx] = nextItem; else arr.unshift(nextItem);
        dbSet('retirement_settlements', arr);
        if(typeof AuditLog !== 'undefined' && AuditLog.write){
          AuditLog.write('retirement', settleModal.sid, 'settlement', '', netPay, '퇴사자 정산 ' + (s==='paid'?'지급완료':s==='confirmed'?'확정':'저장'));
        }
        setSettleModal(null);
        setRefresh(refresh+1);
        showToast('💼 ' + settleModal.name + ' 정산 ' + (s==='paid'?'지급 완료':s==='confirmed'?'확정':'저장됨'));
      }

      var lblS = {minWidth:'120px', color:'#475569', fontWeight:600, fontSize:'11.5px'};
      var rowS = {display:'flex', alignItems:'center', gap:'8px', padding:'5px 0', borderBottom:'1px dashed #e2e8f0'};
      var inS = {flex:1, padding:'4px 8px', border:'1px solid #cbd5e1', borderRadius:'4px', fontSize:'12px', fontFamily:'monospace', textAlign:'right'};

      return h('div', { className:'modal-bg', onClick:function(e){if(e.target===e.currentTarget)setSettleModal(null);} },
        h('div', { className:'modal', style:{width:'640px', maxHeight:'92vh', overflowY:'auto'}, onClick:function(e){e.stopPropagation();} },
          h('div', { className:'modal-h' },
            h('div', { className:'t' }, '💼 퇴사자 정산 - ' + settleModal.name),
            h('button', { className:'x', onClick:function(){setSettleModal(null);} }, '×')
          ),
          h('div', { className:'modal-b' },
            // 기본 정보
            h('div', { style:{background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:'6px', padding:'10px 14px', marginBottom:'12px'} },
              h('div', { style:{fontSize:'12px', fontWeight:700, color:'#475569', marginBottom:'8px'} }, '📋 기본 정보'),
              h('div', { style:rowS }, h('span', { style:lblS }, '입사일'),
                h(KoreanDatePicker, { value:settleModal.joinDate||'', onChange:function(e){upd('joinDate', e.target.value);} })),
              h('div', { style:rowS }, h('span', { style:lblS }, '퇴사일'),
                h(KoreanDatePicker, { value:settleModal.retireDate||'', onChange:function(e){upd('retireDate', e.target.value);} })),
              h('div', { style:rowS }, h('span', { style:lblS }, '재직 기간'),
                h('span', { style:{fontWeight:700, color:'#1e293b'} }, settleModal.workYears + '년 (' + settleModal.workDays + '일)'))
            ),
            // 평균임금 + 퇴직금
            h('div', { style:{background:'#fff7ed', border:'1px solid #fed7aa', borderRadius:'6px', padding:'10px 14px', marginBottom:'12px'} },
              h('div', { style:{fontSize:'12px', fontWeight:700, color:'#9a3412', marginBottom:'8px'} }, '💰 평균임금 · 퇴직금'),
              h('div', { style:rowS }, h('span', { style:lblS }, '1일 평균임금 (자동)'),
                h('span', { style:{fontWeight:700, color:'#475569', fontFamily:'monospace'} }, (settleModal.avgWageBase||0).toLocaleString()+'원')),
              h('div', { style:rowS }, h('span', { style:lblS }, '평균임금 수동 조정'),
                h('input', { type:'text', value:settleModal.avgWageBaseOverride||'',
                  placeholder:'(빈칸=자동값 사용)',
                  onChange:function(e){upd('avgWageBaseOverride', e.target.value.replace(/[^0-9]/g,''));},
                  style:inS })),
              h('div', { style:rowS }, h('span', { style:lblS }, '법정 퇴직금 (자동)'),
                h('span', { style:{fontWeight:700, color:'#475569', fontFamily:'monospace'} }, (settleModal.severancePay||0).toLocaleString()+'원')),
              h('div', { style:rowS }, h('span', { style:lblS }, '퇴직금 수동 조정'),
                h('input', { type:'text', value:settleModal.severancePayOverride||'',
                  placeholder:'(빈칸=자동값 사용)',
                  onChange:function(e){upd('severancePayOverride', e.target.value.replace(/[^0-9]/g,''));},
                  style:inS })),
              h('div', { style:{fontSize:'10.5px', color:'#9a3412', marginTop:'6px', fontStyle:'italic'} },
                '* 자동값은 최근 3개월 평균임금 기반. 실제 평균임금과 차이 있으면 수동 조정')
            ),
            // 미지급 항목
            h('div', { style:{background:'#dbeafe', border:'1px solid #93c5fd', borderRadius:'6px', padding:'10px 14px', marginBottom:'12px'} },
              h('div', { style:{fontSize:'12px', fontWeight:700, color:'#1e40af', marginBottom:'8px'} }, '💵 미지급 항목'),
              h('div', { style:rowS }, h('span', { style:lblS }, '미지급 급여'),
                h('input', { type:'text', value:settleModal.unpaidSalary||'',
                  placeholder:'마지막 월 일할 금액',
                  onChange:function(e){upd('unpaidSalary', e.target.value.replace(/[^0-9]/g,''));}, style:inS })),
              h('div', { style:rowS }, h('span', { style:lblS }, '잔여 연차 (일)'),
                h('input', { type:'text', value:settleModal.annualLeaveRemain||'',
                  onChange:function(e){upd('annualLeaveRemain', e.target.value.replace(/[^0-9]/g,''));}, style:Object.assign({},inS,{width:'80px',flex:'none'}) })),
              h('div', { style:rowS }, h('span', { style:lblS }, '연차수당'),
                h('input', { type:'text', value:settleModal.annualLeavePay||'',
                  placeholder:'잔여일 × 통상시급 × 8',
                  onChange:function(e){upd('annualLeavePay', e.target.value.replace(/[^0-9]/g,''));}, style:inS })),
              h('div', { style:rowS }, h('span', { style:lblS }, '위로금'),
                h('input', { type:'text', value:settleModal.consolation||'',
                  onChange:function(e){upd('consolation', e.target.value.replace(/[^0-9]/g,''));}, style:inS }))
            ),
            // 사용자 정의 항목
            h('div', { style:{background:'#f1f5f9', border:'1px solid #cbd5e1', borderRadius:'6px', padding:'10px 14px', marginBottom:'12px'} },
              h('div', { style:{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'8px'} },
                h('div', { style:{fontSize:'12px', fontWeight:700, color:'#475569'} }, '➕ 추가 지급 항목 (사용자 정의)'),
                h('button', { onClick:addCustom,
                  style:{padding:'3px 10px', background:'#1e40af', color:'#fff', border:'none', borderRadius:'4px', cursor:'pointer', fontSize:'10.5px', fontWeight:600} }, '+ 추가')),
              (settleModal.customItems||[]).length === 0
                ? h('div', { style:{fontSize:'10.5px', color:'#94a3b8', fontStyle:'italic', padding:'4px 0'} }, '없음. [+ 추가] 클릭해서 항목 입력')
                : (settleModal.customItems||[]).map(function(it, i){
                    return h('div', { key:i, style:{display:'flex', gap:'6px', marginBottom:'4px'} },
                      h('input', { type:'text', value:it.name||'', placeholder:'항목명 (예: 인센티브)',
                        onChange:function(e){updCustom(i,'name',e.target.value);},
                        style:{flex:1, padding:'4px 8px', border:'1px solid #cbd5e1', borderRadius:'4px', fontSize:'11.5px'} }),
                      h('input', { type:'text', value:it.amount||'', placeholder:'금액',
                        onChange:function(e){updCustom(i,'amount',e.target.value.replace(/[^0-9]/g,''));},
                        style:{width:'120px', padding:'4px 8px', border:'1px solid #cbd5e1', borderRadius:'4px', fontSize:'11.5px', textAlign:'right', fontFamily:'monospace'} }),
                      h('button', { onClick:function(){delCustom(i);},
                        style:{padding:'2px 8px', background:'#fee2e2', color:'#991b1b', border:'1px solid #fca5a5', borderRadius:'5px', cursor:'pointer', fontSize:'10.5px'} }, '✕')
                    );
                  })
            ),
            // 공제
            h('div', { style:{background:'#fee2e2', border:'1px solid #fca5a5', borderRadius:'6px', padding:'10px 14px', marginBottom:'12px'} },
              h('div', { style:{fontSize:'12px', fontWeight:700, color:'#991b1b', marginBottom:'8px'} }, '➖ 공제 항목'),
              h('div', { style:rowS }, h('span', { style:lblS }, '소득세'),
                h('input', { type:'text', value:settleModal.incomeTax||'',
                  onChange:function(e){upd('incomeTax', e.target.value.replace(/[^0-9]/g,''));}, style:inS })),
              h('div', { style:rowS }, h('span', { style:lblS }, '지방소득세'),
                h('input', { type:'text', value:settleModal.localTax||'',
                  onChange:function(e){upd('localTax', e.target.value.replace(/[^0-9]/g,''));}, style:inS })),
              h('div', { style:rowS }, h('span', { style:lblS }, '4대보험 정산'),
                h('input', { type:'text', value:settleModal.insuranceAdjust||'',
                  placeholder:'정산금액 (- 환급, + 추가납부)',
                  onChange:function(e){upd('insuranceAdjust', e.target.value.replace(/[^0-9]/g,''));}, style:inS })),
              // 사용자 정의 공제
              h('div', { style:{display:'flex', justifyContent:'space-between', alignItems:'center', margin:'8px 0 4px'} },
                h('div', { style:{fontSize:'11px', color:'#7f1d1d', fontWeight:600} }, '➕ 기타 공제 (가불금·대출상환 등)'),
                h('button', { onClick:addCustomDeduct,
                  style:{padding:'3px 10px', background:'#7f1d1d', color:'#fff', border:'none', borderRadius:'4px', cursor:'pointer', fontSize:'10.5px', fontWeight:600} }, '+ 추가')),
              (settleModal.customDeducts||[]).map(function(it, i){
                return h('div', { key:i, style:{display:'flex', gap:'6px', marginBottom:'4px'} },
                  h('input', { type:'text', value:it.name||'', placeholder:'공제명',
                    onChange:function(e){updCustomDeduct(i,'name',e.target.value);},
                    style:{flex:1, padding:'4px 8px', border:'1px solid #fca5a5', borderRadius:'4px', fontSize:'11.5px'} }),
                  h('input', { type:'text', value:it.amount||'', placeholder:'금액',
                    onChange:function(e){updCustomDeduct(i,'amount',e.target.value.replace(/[^0-9]/g,''));},
                    style:{width:'120px', padding:'4px 8px', border:'1px solid #fca5a5', borderRadius:'4px', fontSize:'11.5px', textAlign:'right', fontFamily:'monospace'} }),
                  h('button', { onClick:function(){delCustomDeduct(i);},
                    style:{padding:'2px 8px', background:'#fee2e2', color:'#991b1b', border:'1px solid #fca5a5', borderRadius:'5px', cursor:'pointer', fontSize:'10.5px'} }, '✕')
                );
              })
            ),
            // 합계
            h('div', { style:{background:'#202124', color:'#fff', borderRadius:'7px', padding:'14px 18px', marginBottom:'12px'} },
              h('div', { style:{display:'flex', justifyContent:'space-between', alignItems:'center', padding:'4px 0', fontSize:'12px', color:'#cbd5e1'} },
                h('span', null, '지급 총액'),
                h('span', { style:{fontFamily:'monospace', fontWeight:700} }, totalGross.toLocaleString()+'원')),
              h('div', { style:{display:'flex', justifyContent:'space-between', alignItems:'center', padding:'4px 0', fontSize:'12px', color:'#cbd5e1'} },
                h('span', null, '공제 총액'),
                h('span', { style:{fontFamily:'monospace', fontWeight:700} }, '-'+totalDeduct.toLocaleString()+'원')),
              h('div', { style:{display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 0 0', borderTop:'1px solid #475569', marginTop:'4px'} },
                h('span', { style:{fontSize:'13px', fontWeight:700} }, '💰 순지급액'),
                h('span', { style:{fontFamily:'monospace', fontWeight:800, fontSize:'22px', color:'#4ade80'} }, netPay.toLocaleString()+'원'))
            ),
            // 메모 + 지급일
            h('div', { style:rowS }, h('span', { style:lblS }, '지급일'),
              h(KoreanDatePicker, { value:settleModal.paidDate||'', onChange:function(e){upd('paidDate', e.target.value);} })),
            h('div', { style:{marginTop:'8px'} },
              h('label', { style:{display:'block', fontSize:'11.5px', color:'#475569', fontWeight:600, marginBottom:'4px'} }, '메모'),
              h('textarea', { value:settleModal.note||'',
                onChange:function(e){upd('note', e.target.value);},
                placeholder:'특이사항·지급방법 등',
                rows:2, style:{width:'100%', padding:'6px 8px', border:'1px solid #cbd5e1', borderRadius:'4px', fontSize:'11.5px', fontFamily:'inherit'} }))
          ),
          h('div', { className:'modal-f', style:{justifyContent:'space-between'} },
            h('div', null,
              !settleModal.isNew && h('button', { onClick:async function(){
                if(!(await popConfirm('이 정산 내역을 삭제하시겠습니까?'))) return;
                var _prev=dbGet('retirement_settlements',[]); var arr = _prev.filter(function(x){return x.id!==settleModal.id;});
                dbSet('retirement_settlements', arr);
                setSettleModal(null); setRefresh(refresh+1);
                showToastUndo('🗑️ 퇴직정산 삭제됨', function(){dbSet('retirement_settlements',_prev);});
              },
                style:{padding:'6px 14px', background:'#fee2e2', color:'#991b1b', border:'1px solid #fca5a5', borderRadius:'5px', cursor:'pointer', fontSize:'11.5px', fontWeight:600} }, '🗑️ 삭제')
            ),
            h('div', { style:{display:'flex', gap:'6px'} },
              h('button', { className:'btn-secondary', onClick:function(){setSettleModal(null);} }, '취소'),
              h('button', { onClick:function(){saveSettle('draft');},
                style:{padding:'6px 14px', background:'#f1f5f9', color:'#475569', border:'1px solid #cbd5e1', borderRadius:'5px', cursor:'pointer', fontSize:'11.5px', fontWeight:600} }, '💾 임시 저장'),
              h('button', { onClick:function(){saveSettle('confirmed');},
                style:{padding:'6px 14px', background:'#1e40af', color:'#fff', border:'none', borderRadius:'5px', cursor:'pointer', fontSize:'11.5px', fontWeight:700} }, '✓ 확정'),
              h('button', { onClick:async function(){
                if(!(await popConfirm('지급 완료 처리하시겠습니까?\n\n→ 출금관리에 자동 반영(예정)\n→ 감사 로그 기록'))) return;
                saveSettle('paid');
              },
                style:{padding:'6px 14px', background:'#16a34a', color:'#fff', border:'none', borderRadius:'5px', cursor:'pointer', fontSize:'11.5px', fontWeight:700} }, '💰 지급완료')
            )
          )
        )
      );
    })()
  );
}

