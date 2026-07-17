// ============================================================
// 근로자명부 (StaffRoster)
// ============================================================
var CONTRACT_TYPES = ['정규직','계약직','파트타임','일용직'];
var EDUCATION_LIST = ['고졸','전문대졸','대졸','대학원졸(석사)','대학원졸(박사)','기타'];
var BANK_LIST = ['국민은행','신한은행','하나은행','우리은행','농협','기업은행','SC제일은행','카카오뱅크','토스뱅크','케이뱅크','새마을금고','기타'];

function StaffRosterModal(props){
  useEscClose(props.onClose);
  useEnterSave(function(){ var saveBtn=document.querySelector('.modal-bg .modal .btn-primary'); if(saveBtn) saveBtn.click(); });
  var bob = useState(false); var bankOcrBusy = bob[0]; var setBankOcrBusy = bob[1];
  var u = props.user;
  var init = u ? Object.assign({}, u) : {
    sid:'', name:'', title:'노무사', role:'member', branch:'천안본사', status:'active',
    gender:'M', birthDate:'', rrn:'', nationality:'내국인',
    phone:'', homePhone:'', email:'',
    zipCode:'', address:'', addressDetail:'',
    emergencyContact:'', emergencyPhone:'',
    hireDate:'', probationEnd:'', retireDate:'', leaveReason:'', lastWorkDate:'', contractType:'정규직', contractEnd:'',
    scheduledHours: 8,
    parentalLeaveLimit: 12,        // ★ 육아휴직 한도(개월): 12=1년 / 18=1년6개월
    jobDuty:'',                    // ★ 담당 직무 (근기법 §41 종사업무 종류)
    wageType:'월급제',             // ★ 임금 계산방법 (§17)
    payDay:25,                     // ★ 임금 지급일 (§17)
    workStart:'09:00',             // ★ 시업시각 (§17)
    workEnd:'18:00',               // ★ 종업시각 (§17)
    breakMinutes:60,               // ★ 휴게시간(분) (§17)
    dependents:1,                  // ★ 부양가족 수 → 급여 소득세 자동 반영
    pensionAcquireDate:'',         // 국민연금 취득일
    healthAcquireDate:'',          // 건강보험 취득일
    employmentAcquireDate:'',      // 고용보험 취득일
    injuryNo:'',                   // 산재보험 관리번호
    isDisabled:false,              // 장애인 여부
    disabledGrade:'',              // 장애 등급
    foreignerRegNo:'',             // 외국인등록번호 (국적=외국인 시)
    visaType:'',                   // 체류자격/비자 종류
    visaExpiry:'',                 // 체류 만료일
    prevCareers:[],                // 직전 경력 [{id,company,duty,startDate,endDate,reason,note}]
    baseSalary:0, bankName:'국민은행', accountNo:'', accountHolder:'',
    pensionNo:'', healthNo:'', employmentNo:'',
    education:'대졸', memo:''
  };
  var s = useState(init); var f = s[0]; var setF = s[1];
  var tb = useState(props.initialTab || 'basic'); var tab = tb[0]; var setTab = tb[1];
  useEffect(function(){ if(props.initialTab) setTab(props.initialTab); }, [props.initialTab]);
  // 부모가 user 갱신 시 폼 state 동기화 (저장 후 다음 탭 이동 시)
  useEffect(function(){ if(props.user && props.user.sid) setF(Object.assign({}, props.user)); }, [props.user && props.user.sid, props.initialTab]);
  function set(k){ return function(e){ setF(function(prev){ return Object.assign({}, prev, (function(){var x={}; x[k]=e.target.value; return x;})()); }); }; }
  function setNum(k){ return function(e){ setF(function(prev){ return Object.assign({}, prev, (function(){var x={}; x[k]=parseInt(e.target.value.replace(/[^0-9]/g,''))||0; return x;})()); }); }; }
  function setSidType(type){ // type: 'P'(노무사) | 'A'(직원)
    if((props.mode === 'add') || !props.user){
      var newRole = type === 'A' ? 'staff' : 'member';
      var newTitle = type === 'A' ? '사무직' : '노무사';
      var newSid = nextSid(type, props.allUsers || []);
      setF(function(prev){ return Object.assign({}, prev, { role: newRole, title: newTitle, sid: newSid }); });
    }
  }

  function save(opts){
    var goNext = opts && opts.next;
    props.onSave(f, { keepOpen: goNext, nextTab: goNext ? opts.nextTab : null });
    if(goNext){ var _tab=tabs2.find(function(t){return t.id===tab;}); showToast((_tab?_tab.label:'') + ' 저장됨'); }
  }

  var tabs2 = [
    { id:'basic', label:'기본정보' },
    { id:'contract', label:'계약·급여' },
    { id:'insurance', label:'4대보험' },
    { id:'history', label:'이력관리' },
    { id:'etc', label:'기타' }
  ];

  function fld(label, content){
    return h('div', { style:{ marginBottom:'12px' } },
      h('label', { style:{ display:'block', fontSize:'11px', fontWeight:600, color:'#475569', marginBottom:'4px' } }, label),
      content
    );
  }
  function inp(k, type, placeholder){
    return h('input', { type:type||'text', value:f[k]||'', onChange:set(k), placeholder:placeholder||'',
      title: '✏️ ' + (placeholder || k) + ' — 클릭하여 수정',
      style:{ width:'100%', padding:'7px 10px', border:'1px solid #cbd5e1', borderRadius:'4px', fontSize:'12.5px', boxSizing:'border-box' } });
  }
  function sel(k, options){
    return h('select', { value:f[k]||'', onChange:set(k),
      title: '✏️ 클릭하여 선택',
      style:{ width:'100%', padding:'7px 10px', border:'1px solid #cbd5e1', borderRadius:'4px', fontSize:'12.5px' } },
      options.map(function(o){
        var v = typeof o === 'string' ? o : o.v;
        var l = typeof o === 'string' ? o : o.label;
        return h('option', { key:v, value:v }, l);
      })
    );
  }

  var TITLE_LIST = ['대표노무사','노무사','사무장','차장','과장','대리','주임','사무직','인턴'];
  var isNew = (props.mode === 'add') || !props.user;
  var sidType = (f.sid||'').startsWith('A') ? 'A' : 'P';

  var bodyContent;
  if(tab === 'basic'){
    bodyContent = h('div', null,
      h('div', { style:{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px' } },
        fld('사번', h('div', null,
          isNew && h('div', { style:{ display:'flex', gap:'6px', marginBottom:'6px' } },
            h('button', { onClick:function(){ setSidType('P'); },
              style:{ flex:1, padding:'6px', borderRadius:'6px', fontSize:'12px', cursor:'pointer', fontWeight: sidType==='P'?700:400,
                background: sidType==='P'?'#1e40af':'#f8fafc', color: sidType==='P'?'#fff':'#475569',
                border:'1px solid '+(sidType==='P'?'#1e40af':'#cbd5e1') } }, '노무사 (P-)'),
            h('button', { onClick:function(){ setSidType('A'); },
              style:{ flex:1, padding:'6px', borderRadius:'6px', fontSize:'12px', cursor:'pointer', fontWeight: sidType==='A'?700:400,
                background: sidType==='A'?'#059669':'#f8fafc', color: sidType==='A'?'#fff':'#475569',
                border:'1px solid '+(sidType==='A'?'#059669':'#cbd5e1') } }, '직원 (A-)')
          ),
          h('input', { type:'text', value:f.sid||'', readOnly:true,
            style:{ width:'100%', padding:'7px 10px', border:'1px solid #e5e7eb', borderRadius:'4px', fontSize:'12.5px', background:'#f8fafc', fontFamily:'monospace', boxSizing:'border-box' } })
        )),
        fld('이름 *', inp('name'))
      ),
      fld('담당 직무 *', h('input', { type:'text', value:f.jobDuty||'', onChange:set('jobDuty'),
        placeholder:'예: 노무 컨설팅·임금계산·4대보험 업무',
        title:'✏️ 근기법 §41 종사 업무의 종류 (법적 필수 기재)',
        style:{ width:'100%', padding:'7px 10px', border:'1px solid #bfdbfe', borderRadius:'4px', fontSize:'12.5px', boxSizing:'border-box', background:'#eff6ff' } })),
      h('div', { style:{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px' } },
        fld('직책', sel('title', TITLE_LIST)),
        fld('지사', sel('branch', BRANCHES))
      ),
      h('div', { style:{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'12px' } },
        fld('성별', sel('gender', [{v:'M',label:'남'},{v:'F',label:'여'}])),
        fld('생년월일', inp('birthDate','date')),
        fld('국적', sel('nationality', ['내국인','외국인']))
      ),
      fld('주민등록번호', h('input', { type:'text', value:f.rrn||'', onChange:set('rrn'),
        placeholder:'000000-0000000 (자동 하이픈)', maxLength:14,
        style:{ width:'100%', padding:'7px 10px', border:'1px solid #cbd5e1', borderRadius:'4px', fontSize:'12.5px', fontFamily:'monospace', boxSizing:'border-box' } })),
      h('div', { style:{ fontSize:'11px', fontWeight:700, color:'#475569', margin:'8px 0 4px', paddingBottom:'4px', borderBottom:'1px solid #e5e7eb' } }, '연락처'),
      h('div', { style:{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px' } },
        fld('휴대전화', inp('phone','tel','010-0000-0000')),
        fld('자택전화', inp('homePhone','tel','041-000-0000'))
      ),
      fld('이메일', inp('email','email','이메일 주소')),
      h('div', { style:{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px' } },
        fld('비상연락처 (성명)', inp('emergencyContact','text','비상연락처 성명')),
        fld('비상연락처 (전화)', inp('emergencyPhone','tel','010-0000-0000'))
      ),
      h('div', { style:{ fontSize:'11px', fontWeight:700, color:'#475569', margin:'8px 0 4px', paddingBottom:'4px', borderBottom:'1px solid #e5e7eb' } }, '주소'),
      fld('주소', h('div', { style:{ display:'flex', gap:'6px', alignItems:'center' } },
        h('input', { type:'text', value:f.zipCode||'', onChange:function(e){ setF(function(prev){ return Object.assign({},prev,{zipCode:e.target.value}); }); }, placeholder:'우편번호', maxLength:7,
          style:{ width:'90px', fontFamily:'monospace', textAlign:'center', flexShrink:0, padding:'7px 8px', border:'1px solid #cbd5e1', borderRadius:'4px', fontSize:'12.5px', boxSizing:'border-box' } }),
        h('button', { type:'button',
          onClick:function(){
            openAddressSearch(function(r){
              if(!r || (!r.zipcode && !r.address)){ showToast('⚠️ 주소 정보 없음'); return; }
              setF(function(prev){ return Object.assign({}, prev, { zipCode: r.zipcode, address: r.address }); });
              showToast('✓ 주소 입력됨: ' + (r.zipcode||'') + ' ' + r.address);
            });
          },
          style:{ padding:'7px 12px', background:'#1e40af', color:'#fff', border:'none', borderRadius:'4px', fontSize:'12px', fontWeight:600, cursor:'pointer', flexShrink:0, whiteSpace:'nowrap' } }, '🔍 검색'),
        h('input', { type:'text', value:f.address||'', onChange:function(e){ setF(function(prev){ return Object.assign({},prev,{address:e.target.value}); }); }, placeholder:'도로명 주소',
          style:{ flex:1, padding:'7px 10px', border:'1px solid #cbd5e1', borderRadius:'4px', fontSize:'12.5px', boxSizing:'border-box' } })
      )),
      fld('상세주소', inp('addressDetail','text','')),
      // 장애인 여부 (고용의무 확인용)
      h('div', { style:{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'12px', padding:'8px 10px', background:'#f0fdf4', border:'1px solid #bbf7d0', borderRadius:'6px' } },
        h('label', { style:{ display:'flex', alignItems:'center', gap:'7px', cursor:'pointer', fontSize:'12.5px' } },
          h('input', { type:'checkbox', checked:!!f.isDisabled, onChange:function(e){ setF(function(p){ return Object.assign({},p,{isDisabled:e.target.checked}); }); }, style:{ width:'15px', height:'15px', cursor:'pointer' } }),
          h('span', { style:{ fontWeight:600, color:'#166534' } }, '♿ 장애인')),
        f.isDisabled && h('input', { type:'text', value:f.disabledGrade||'', onChange:set('disabledGrade'),
          placeholder:'등급/구분 (예: 지체장애 3급)',
          style:{ flex:1, padding:'5px 9px', border:'1px solid #86efac', borderRadius:'4px', fontSize:'12px', boxSizing:'border-box' } })
      ),
      // 외국인 추가 필드 (국적=외국인 조건부)
      f.nationality === '외국인' && h('div', { style:{ background:'#fef9c3', border:'1px solid #fde68a', borderRadius:'6px', padding:'10px 12px', marginBottom:'4px' } },
        h('div', { style:{ fontSize:'11px', fontWeight:700, color:'#854d0e', marginBottom:'8px' } }, '🌏 외국인 추가 정보 (법적 의무)'),
        h('div', { style:{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px' } },
          fld('외국인등록번호', h('input', { type:'text', value:f.foreignerRegNo||'', onChange:set('foreignerRegNo'), placeholder:'000000-0000000',
            style:{ width:'100%', padding:'7px 10px', border:'1px solid #fde68a', borderRadius:'4px', fontSize:'12.5px', fontFamily:'monospace', boxSizing:'border-box' } })),
          fld('체류자격(비자)', h('input', { type:'text', value:f.visaType||'', onChange:set('visaType'), placeholder:'E-3, F-2, H-2 등',
            style:{ width:'100%', padding:'7px 10px', border:'1px solid #fde68a', borderRadius:'4px', fontSize:'12.5px', boxSizing:'border-box' } }))
        ),
        fld('체류 만료일', h('input', { type:'date', value:f.visaExpiry||'', onChange:set('visaExpiry'),
          style:{ width:'100%', padding:'7px 10px', border:'1px solid #fde68a', borderRadius:'4px', fontSize:'12.5px', boxSizing:'border-box' } }))
      )
    );
  } else if(tab === 'contract'){
    bodyContent = h('div', null,
      h('div', { style:{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px' } },
        fld('고용형태', sel('contractType', CONTRACT_TYPES)),
        fld('상태', sel('status', [{v:'scheduled',label:'입사예정'},{v:'active',label:'재직'},{v:'leave',label:'휴직'},{v:'standby',label:'대기'},{v:'retired',label:'퇴직'}]))
      ),
      f.status === 'leave' && h('div', { style:{ marginBottom:'12px', padding:'8px 10px', background:'#fff7ed', border:'1px solid #fdba74', borderRadius:'6px', display:'flex', alignItems:'center', gap:'8px' } },
        h('input', { type:'checkbox', checked: !!f.leaveLoginAllowed, onChange:function(e){ var v=e.target.checked; setF(function(prev){ return Object.assign({}, prev, { leaveLoginAllowed: v }); }); },
          style:{ width:'16px', height:'16px', cursor:'pointer' } }),
        h('div', null,
          h('div', { style:{ fontSize:'12.5px', fontWeight:600, color:'#9a3412' } }, '휴직 중 로그인 허용'),
          h('div', { style:{ fontSize:'11px', color:'#b45309' } }, '체크 시 휴직 중에도 본인 담당 자료를 조회할 수 있습니다 (재직자와 동일 권한).'))
      ),
      // 소정근로시간 (연차·시간연차 계산 기준)
      h('div', { style:{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px' } },
        fld('소정근로시간 (시간/일)', h('div', { style:{ display:'flex', alignItems:'center', gap:'6px' } },
          h('input', { type:'number', min:1, max:24, value: f.scheduledHours || 8,
            onChange: setNum('scheduledHours'),
            title:'✏️ 소정근로시간 — 연차 1일=N시간, 시간연차 상한 기준',
            style:{ width:'100%', padding:'7px 10px', border:'1px solid #cbd5e1', borderRadius:'4px', fontSize:'12.5px', boxSizing:'border-box', textAlign:'right', fontFamily:'monospace' } }),
          h('span', { style:{ fontSize:'11.5px', color:'#475569', whiteSpace:'nowrap' } }, '시간')
        )),
        fld('입사일 *', inp('hireDate','date'))
      ),
      h('div', { style:{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px' } },
        fld('수습종료일', inp('probationEnd','date')),
        fld('육아휴직 한도', h('select', {
            value: f.parentalLeaveLimit || 12,
            onChange: setNum('parentalLeaveLimit'),
            title:'육아휴직 총 사용 가능 기간 (부부 동시사용 등은 1년6개월)',
            style:{ width:'100%', padding:'7px 10px', border:'1px solid #cbd5e1', borderRadius:'4px', fontSize:'12.5px', boxSizing:'border-box', background:'#fff' } },
          h('option', { value:12 }, '1년 (12개월)'),
          h('option', { value:18 }, '1년 6개월 (18개월)')
        ))
      ),
      // 수습 근로자 체크 + 기간 (성과급 자동 미반영)
      h('div', { style:{ padding:'10px 12px', background:'#fef3c7', border:'1px solid #fde68a', borderRadius:'6px', marginBottom:'10px' } },
        h('label', { style:{ display:'flex', alignItems:'center', gap:'8px', cursor:'pointer', marginBottom: f.isProbationary ? '10px' : '0' } },
          h('input', { type:'checkbox', checked:!!f.isProbationary,
            onChange:function(e){
              var on = e.target.checked;
              var next = Object.assign({}, f, { isProbationary: on });
              // 체크 시 기본값: 시작=입사일, 종료=입사일+3개월
              if(on && !f.probationStart && f.hireDate){
                next.probationStart = f.hireDate;
                if(!f.probationEnd){
                  var d = new Date(f.hireDate); d.setMonth(d.getMonth()+3);
                  next.probationEnd = d.toISOString().slice(0,10);
                }
              }
              setF(next);
            } }),
          h('span', { style:{ fontWeight:700, fontSize:'12.5px', color:'#854d0e' } }, '🎓 수습 근로자'),
          h('span', { style:{ fontSize:'10.5px', color:'#a16207' } }, '(수습기간 동안 입금확정 시 성과급 자동 미반영)')
        ),
        f.isProbationary && h('div', { style:{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px' } },
          fld('수습 시작일', inp('probationStart','date')),
          fld('수습 종료일', inp('probationEnd','date'))
        )
      ),
      h('div', { style:{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px' } },
        fld('계약만료일', inp('contractEnd','date')),
        fld('퇴직일', inp('retireDate','date'))
      ),
      f.status === 'retired' && fld('퇴직사유', sel('leaveReason', ['자발적 퇴사','권고사직','계약만료','해고','사망','기타'])),
      f.status === 'retired' && fld('마지막 근무일', h('input', { type:'date', value:f.lastWorkDate||'',
        title:'✏️ 마지막 근무일 — 입력 시 퇴직일이 비어있으면 다음 날로 자동 설정',
        onChange:function(e){
          var v = e.target.value;
          setF(function(prev){
            var next = Object.assign({}, prev, { lastWorkDate:v });
            if(v && !prev.retireDate){
              var d = new Date(v); d.setDate(d.getDate()+1);
              next.retireDate = d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
            }
            return next;
          });
        },
        style:{ width:'100%', padding:'7px 10px', border:'1px solid #cbd5e1', borderRadius:'4px', fontSize:'12.5px', boxSizing:'border-box' } })),
      // 퇴직 정산 스냅샷 — 분쟁·증명서 대응용 최소 기록 (임금채권·퇴직급여 시효 3년 대비)
      f.status === 'retired' && h('div', { style:{ background:'#fffbeb', border:'1px solid #fde68a', borderRadius:'6px', padding:'10px 12px', marginBottom:'12px' } },
        h('div', { style:{ fontSize:'11px', fontWeight:700, color:'#92400e', marginBottom:'8px' } }, '📋 퇴직 정산 스냅샷 (시효 3년 대비 기록 — 원본 서류는 자료보관소에)'),
        h('div', { style:{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px', marginBottom:'8px' } },
          fld('평균임금 (월 환산)', h('input', { type:'text', value:(f.settleAvgWage||0).toLocaleString(), onChange:setNum('settleAvgWage'),
            placeholder:'마지막 3개월 평균',
            style:{ width:'100%', padding:'7px 10px', border:'1px solid #fde68a', borderRadius:'4px', fontSize:'12.5px', textAlign:'right', fontFamily:'monospace', boxSizing:'border-box' } })),
          fld('퇴직금 지급액', h('input', { type:'text', value:(f.settleSeverance||0).toLocaleString(), onChange:setNum('settleSeverance'),
            style:{ width:'100%', padding:'7px 10px', border:'1px solid #fde68a', borderRadius:'4px', fontSize:'12.5px', textAlign:'right', fontFamily:'monospace', boxSizing:'border-box' } })),
          fld('퇴직금 지급일', inp('settleSeverancePaidDate','date')),
          fld('연차 미사용수당', h('input', { type:'text', value:(f.settleLeavePay||0).toLocaleString(), onChange:setNum('settleLeavePay'),
            style:{ width:'100%', padding:'7px 10px', border:'1px solid #fde68a', borderRadius:'4px', fontSize:'12.5px', textAlign:'right', fontFamily:'monospace', boxSizing:'border-box' } })),
          fld('4대보험 상실신고일', inp('settleInsLossDate','date')),
          fld('정산 비고', h('input', { type:'text', value:f.settleNote||'', onChange:set('settleNote'), placeholder:'예: 미사용 연차 5일 정산 포함',
            style:{ width:'100%', padding:'7px 10px', border:'1px solid #fde68a', borderRadius:'4px', fontSize:'12.5px', boxSizing:'border-box' } }))
        )
      ),
      fld('기본급 (원)', h('input', { type:'text', value:(f.baseSalary||0).toLocaleString(), onChange:setNum('baseSalary'),
        style:{ width:'100%', padding:'7px 10px', border:'1px solid #cbd5e1', borderRadius:'4px', fontSize:'12.5px', textAlign:'right', fontFamily:'monospace', boxSizing:'border-box' } })),
      // 임금 계산방법·지급일
      h('div', { style:{ background:'#eff6ff', border:'1px solid #bfdbfe', borderRadius:'6px', padding:'10px 12px', marginBottom:'12px' } },
        h('div', { style:{ fontSize:'11px', fontWeight:700, color:'#1e40af', marginBottom:'8px' } }, '💰 임금 조건 (근기법 §17 명시 필수)'),
        h('div', { style:{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px', marginBottom:'8px' } },
          fld('임금 계산방법', h('select', { value:f.wageType||'월급제', onChange:set('wageType'),
            style:{ width:'100%', padding:'7px 10px', border:'1px solid #bfdbfe', borderRadius:'4px', fontSize:'12.5px' } },
            ['월급제','시급제','일급제','연봉제'].map(function(v){ return h('option',{key:v,value:v},v); })
          )),
          fld('임금 지급일', h('div',{style:{display:'flex',alignItems:'center',gap:'6px'}},
            h('input', { type:'number', min:1, max:31, value:f.payDay||25, onChange:setNum('payDay'),
              style:{ width:'80px', padding:'7px 10px', border:'1px solid #bfdbfe', borderRadius:'4px', fontSize:'12.5px', textAlign:'right', fontFamily:'monospace', boxSizing:'border-box' } }),
            h('span', { style:{ fontSize:'12px', color:'#475569' } }, '일 지급')
          ))
        ),
        h('div', { style:{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'10px' } },
          fld('시업 시각', h('input', { type:'time', value:f.workStart||'09:00', onChange:set('workStart'),
            style:{ width:'100%', padding:'7px 8px', border:'1px solid #bfdbfe', borderRadius:'4px', fontSize:'12.5px', boxSizing:'border-box' } })),
          fld('종업 시각', h('input', { type:'time', value:f.workEnd||'18:00', onChange:set('workEnd'),
            style:{ width:'100%', padding:'7px 8px', border:'1px solid #bfdbfe', borderRadius:'4px', fontSize:'12.5px', boxSizing:'border-box' } })),
          fld('휴게시간', h('div',{style:{display:'flex',alignItems:'center',gap:'4px'}},
            h('input', { type:'number', min:0, max:480, value:f.breakMinutes||60, onChange:setNum('breakMinutes'),
              style:{ width:'70px', padding:'7px 8px', border:'1px solid #bfdbfe', borderRadius:'4px', fontSize:'12.5px', textAlign:'right', fontFamily:'monospace', boxSizing:'border-box' } }),
            h('span', { style:{ fontSize:'12px', color:'#475569' } }, '분')
          ))
        )
      ),
      // 부양가족 수 (소득세 자동 반영)
      fld('부양가족 수 (소득세 공제)', h('div',{style:{display:'flex',alignItems:'center',gap:'8px'}},
        h('input', { type:'number', min:0, max:20, value:f.dependents||1, onChange:setNum('dependents'),
          title:'✏️ 부양가족 수 → 급여대장 소득세 원천징수 자동 반영',
          style:{ width:'80px', padding:'7px 10px', border:'1px solid #cbd5e1', borderRadius:'4px', fontSize:'12.5px', textAlign:'right', fontFamily:'monospace', boxSizing:'border-box' } }),
        h('span', { style:{ fontSize:'12px', color:'#475569' } }, '명 (본인 포함)'),
        h('span', { style:{ fontSize:'10.5px', color:'#3b82f6', fontWeight:600 } }, '→ 급여 소득세 자동 반영')
      )),
      // ── 퇴직급여 (퇴직연금 또는 법정퇴직금) ──
      (function(){
        var isEnrolled = f.pensionType === 'DC' || f.pensionType === 'DB';
        return h('div', { style:{ marginTop:'8px', marginBottom:'8px', padding:'10px 12px', background:'#fef3c7', border:'1px solid #fcd34d', borderRadius:'6px' } },
          h('label', { style:{ display:'flex', alignItems:'center', gap:'8px', cursor:'pointer' } },
            h('input', { type:'checkbox', checked:isEnrolled,
              onChange:function(e){
                var en = e.target.checked;
                setF(function(prev){ return Object.assign({}, prev, { pensionType: en ? (prev.pensionType==='DB'?'DB':'DC') : 'NONE' }); });
              },
              style:{ width:'16px', height:'16px', cursor:'pointer' } }),
            h('span', { style:{ fontWeight:700, fontSize:'12.5px', color:'#854d0e' } }, '💼 퇴직연금 가입'),
            isEnrolled && h('span', { style:{ fontSize:'10.5px', color:'#a16207' } }, '(퇴직정산에서 매월 납입금 관리)')
          ),
          isEnrolled
            ? h('div', { style:{ marginTop:'8px', paddingLeft:'24px', display:'flex', alignItems:'center', gap:'14px' } },
                h('label', { style:{ display:'flex', alignItems:'center', gap:'4px', cursor:'pointer', fontSize:'12px' } },
                  h('input', { type:'radio', name:'pensionType_'+(f.sid||'new'), checked:f.pensionType==='DC',
                    onChange:function(){ setF(function(prev){ return Object.assign({}, prev, { pensionType:'DC' }); }); },
                    style:{ cursor:'pointer' } }),
                  h('span', null, 'DC형 (확정기여형)')),
                h('label', { style:{ display:'flex', alignItems:'center', gap:'4px', cursor:'pointer', fontSize:'12px' } },
                  h('input', { type:'radio', name:'pensionType_'+(f.sid||'new'), checked:f.pensionType==='DB',
                    onChange:function(){ setF(function(prev){ return Object.assign({}, prev, { pensionType:'DB' }); }); },
                    style:{ cursor:'pointer' } }),
                  h('span', null, 'DB형 (확정급여형)'))
              )
            : h('div', { style:{ marginTop:'6px', paddingLeft:'24px', fontSize:'11.5px', color:'#a16207' } },
                '⚖️ 법정퇴직금 적용 (근로기준법 §34) — 퇴직 시 평균임금×30일×재직년수')
        );
      })(),
      h('div', { style:{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'6px' } },
        h('span', { style:{ fontSize:'12px', fontWeight:700, color:'#1e293b' } }, '💳 급여계좌'),
        h('label', { title:'통장 사본 사진 업로드 → 계좌정보 자동 입력',
          style:{ display:'inline-flex', alignItems:'center', gap:'4px', padding:'4px 10px',
            background: bankOcrBusy ? '#94a3b8' : '#1d4ed8', color:'#fff', borderRadius:'5px',
            fontSize:'11px', fontWeight:700, cursor: bankOcrBusy ? 'not-allowed' : 'pointer' } },
          bankOcrBusy ? '⏳ OCR...' : '🏦 통장 사본 OCR',
          h('input', { type:'file', accept:'image/*', disabled:bankOcrBusy,
            onChange:function(e){
              var file = e.target.files && e.target.files[0];
              if(!file) return;
              setBankOcrBusy(true);
              var reader = new FileReader();
              reader.onload = function(ev){
                ocrExtract(ev.target.result).then(function(res){
                  var parsed = parseBankbook(res.text || '');
                  var updates = {};
                  if(parsed.bank) updates.bankName = parsed.bank;
                  if(parsed.accountNo) updates.accountNo = parsed.accountNo;
                  if(parsed.holder) updates.accountHolder = parsed.holder;
                  if(Object.keys(updates).length > 0){
                    setF(function(prev){ return Object.assign({}, prev, updates); });
                    showToast('✅ 통장 OCR: ' + Object.keys(updates).join('·') + ' 자동 입력');
                  } else {
                    showToast('⚠️ OCR 추출 결과 없음 — 직접 입력');
                  }
                  setBankOcrBusy(false);
                }).catch(function(err){
                  showToast('OCR 실패: '+(err.message||'오류'));
                  setBankOcrBusy(false);
                });
              };
              reader.readAsDataURL(file);
            },
            style:{ display:'none' } })
        )
      ),
      h('div', { style:{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px' } },
        fld('은행', sel('bankName', BANK_LIST)),
        fld('계좌번호', inp('accountNo','text','계좌번호'))
      ),
      fld('예금주', h('input', { type:'text', value:f.accountHolder||'', onChange:set('accountHolder'), placeholder:'예금주 이름',
        style:{ width:'100%', padding:'7px 10px', border:'1px solid #cbd5e1', borderRadius:'4px', fontSize:'12.5px', boxSizing:'border-box' } })),
      fld('최종학력', sel('education', EDUCATION_LIST))
    );
  } else if(tab === 'insurance'){
    bodyContent = h('div', null,
      h('div', { style:{ background:'#f0fdf4', border:'1px solid #bbf7d0', borderRadius:'6px', padding:'10px 12px', marginBottom:'12px' } },
        h('div', { style:{ fontSize:'11px', fontWeight:700, color:'#166534', marginBottom:'8px' } }, '🛡️ 가입 번호'),
        fld('국민연금 사업장가입자번호', inp('pensionNo','text','연금번호')),
        fld('건강보험 증번호', inp('healthNo','text','건강보험번호')),
        fld('고용보험 피보험자번호', inp('employmentNo','text','고용보험번호')),
        fld('산재보험 관리번호', h('input', { type:'text', value:f.injuryNo||'', onChange:set('injuryNo'), placeholder:'산재보험 관리번호',
          style:{ width:'100%', padding:'7px 10px', border:'1px solid #cbd5e1', borderRadius:'4px', fontSize:'12.5px', boxSizing:'border-box' } }))
      ),
      h('div', { style:{ background:'#fef9c3', border:'1px solid #fde68a', borderRadius:'6px', padding:'10px 12px' } },
        h('div', { style:{ fontSize:'11px', fontWeight:700, color:'#854d0e', marginBottom:'8px' } }, '📅 취득일 (퇴직 정산·상실신고 기준)'),
        h('div', { style:{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px' } },
          fld('국민연금 취득일', inp('pensionAcquireDate','date')),
          fld('건강보험 취득일', inp('healthAcquireDate','date'))
        ),
        fld('고용보험 취득일', inp('employmentAcquireDate','date'))
      )
    );
  } else if(tab === 'history'){
    var hist = f.history || [];
    var HISTORY_TYPES = [
      { v:'salary',   label:'💰 급여인상',     color:'#16a34a' },
      { v:'perfRate', label:'⭐ 성과급률 변경', color:'#2563eb' },
      { v:'promote',  label:'📈 진급',         color:'#1e40af' },
      { v:'transfer', label:'🔀 부서이동',     color:'#2563eb' },
      { v:'contract', label:'📝 계약변경',     color:'#ea580c' },
      { v:'other',    label:'📌 기타',         color:'#64748b' }
    ];
    function addHist(){
      var newItem = {
        id:'h-'+Date.now().toString(36)+Math.random().toString(36).slice(2,5),
        date:todayYMD(),
        type:'salary',
        beforeValue:'',
        afterValue:'',
        note:''
      };
      setF(function(prev){ return Object.assign({}, prev, { history: hist.concat([newItem]) }); });
    }
    function updHist(idx, key, val){
      var next = hist.slice();
      next[idx] = Object.assign({}, next[idx], (function(){var x={}; x[key]=val; return x;})());
      setF(function(prev){ return Object.assign({}, prev, { history: next }); });
    }
    async function delHist(idx){
      if(!(await popConfirm('이 이력을 삭제할까요?'))) return;
      var next = hist.slice(); next.splice(idx,1);
      setF(function(prev){ return Object.assign({}, prev, { history: next }); });
    }
    var sortedHist = hist.slice().sort(function(a,b){return (b.date||'').localeCompare(a.date||'');});
    var inputS = { padding:'5px 8px', border:'1px solid #cbd5e1', borderRadius:'4px', fontSize:'11.5px', boxSizing:'border-box' };
    bodyContent = h('div', null,
      h('div', { style:{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'10px' } },
        h('div', { style:{ fontSize:'12px', color:'#64748b' } }, '급여인상·성과급률 변경·진급 등 변동 이력 관리'),
        h('button', { onClick:addHist,
          style:{ padding:'6px 14px', background:'#1e40af', color:'#fff', border:'none', borderRadius:'4px', cursor:'pointer', fontSize:'11.5px', fontWeight:700 } }, '+ 이력 추가')
      ),
      hist.length === 0
        ? h('div', { style:{ background:'#f8fafc', borderRadius:'8px', padding:'40px', textAlign:'center', color:'#94a3b8', fontSize:'12px' } }, '등록된 이력이 없습니다')
        : h('div', { style:{ display:'flex', flexDirection:'column', gap:'8px' } },
            sortedHist.map(function(item){
              var realIdx = hist.indexOf(item);
              var typeInfo = HISTORY_TYPES.find(function(t){return t.v===item.type;}) || HISTORY_TYPES[5];
              return h('div', { key:item.id, style:{ border:'1px solid #e2e8f0', borderLeft:'3px solid '+typeInfo.color, borderRadius:'6px', padding:'10px 12px', background:'#fff' } },
                h('div', { style:{ display:'grid', gridTemplateColumns:'110px 130px 1fr auto', gap:'8px', alignItems:'center', marginBottom:'7px' } },
                  // 날짜
                  h(KoreanDatePicker, { value:item.date||'',
                    onChange:function(e){ updHist(realIdx, 'date', e.target.value); },
                    style:Object.assign({}, inputS, { fontFamily:'monospace' }) }),
                  // 유형
                  h('select', { value:item.type||'salary',
                    onChange:function(e){ updHist(realIdx, 'type', e.target.value); },
                    style:Object.assign({}, inputS, { color:typeInfo.color, fontWeight:700 }) },
                    HISTORY_TYPES.map(function(t){ return h('option', { key:t.v, value:t.v }, t.label); })
                  ),
                  // 메모
                  h('input', { type:'text', value:item.note||'', placeholder:'비고 (예: 정기 인상, 평가 결과 등)',
                    onChange:function(e){ updHist(realIdx, 'note', e.target.value); },
                    style:inputS }),
                  // 삭제
                  h('button', { onClick:function(){ delHist(realIdx); },
                    style:{ padding:'4px 8px', background:'#fef2f2', color:'#dc2626', border:'1px solid #fca5a5', borderRadius:'4px', cursor:'pointer', fontSize:'10.5px', fontWeight:600 } }, '삭제')
                ),
                // 변경 전/후
                h('div', { style:{ display:'grid', gridTemplateColumns:'1fr 24px 1fr', gap:'6px', alignItems:'center' } },
                  h('div', null,
                    h('label', { style:{ fontSize:'10px', color:'#94a3b8', display:'block', marginBottom:'2px' } }, '변경 전'),
                    h('input', { type:'text', value:item.beforeValue||'',
                      onChange:function(e){ updHist(realIdx, 'beforeValue', e.target.value); },
                      placeholder:item.type==='salary'?'예: 3,000,000원':item.type==='perfRate'?'예: 13%':item.type==='promote'?'예: 사무직':'',
                      style:Object.assign({}, inputS, { width:'100%' }) })
                  ),
                  h('div', { style:{ textAlign:'center', color:'#94a3b8', fontSize:'14px' } }, '→'),
                  h('div', null,
                    h('label', { style:{ fontSize:'10px', color:typeInfo.color, fontWeight:600, display:'block', marginBottom:'2px' } }, '변경 후'),
                    h('input', { type:'text', value:item.afterValue||'',
                      onChange:function(e){ updHist(realIdx, 'afterValue', e.target.value); },
                      placeholder:item.type==='salary'?'예: 3,200,000원':item.type==='perfRate'?'예: 15%':item.type==='promote'?'예: 사무장':'',
                      style:Object.assign({}, inputS, { width:'100%', borderColor:typeInfo.color }) })
                  )
                )
              );
            })
          )
    );
  } else {
    var prevC = f.prevCareers || [];
    function addCareer(){
      var item = { id:'pc-'+Date.now().toString(36), company:'', duty:'', startDate:'', endDate:'', reason:'', note:'' };
      setF(function(p){ return Object.assign({},p,{ prevCareers:(p.prevCareers||[]).concat([item]) }); });
    }
    function updCareer(idx, key, val){
      var next = prevC.slice(); next[idx] = Object.assign({},next[idx]); next[idx][key]=val;
      setF(function(p){ return Object.assign({},p,{ prevCareers:next }); });
    }
    function delCareer(idx){
      var next = prevC.slice(); next.splice(idx,1);
      setF(function(p){ return Object.assign({},p,{ prevCareers:next }); });
    }
    var inpS = { padding:'5px 8px', border:'1px solid #cbd5e1', borderRadius:'4px', fontSize:'11.5px', boxSizing:'border-box' };
    bodyContent = h('div', null,
      // 직전 경력 (근기법 §41 이력)
      h('div', { style:{ marginBottom:'16px' } },
        h('div', { style:{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'8px' } },
          h('div', { style:{ fontSize:'12px', fontWeight:700, color:'#1e40af' } }, '📋 직전 경력 (근기법 §41 이력)'),
          h('button', { onClick:addCareer,
            style:{ padding:'5px 14px', background:'#1e40af', color:'#fff', border:'none', borderRadius:'4px', cursor:'pointer', fontSize:'11.5px', fontWeight:700 } }, '+ 경력 추가')
        ),
        prevC.length === 0
          ? h('div', { style:{ background:'#f8fafc', borderRadius:'6px', padding:'24px', textAlign:'center', color:'#94a3b8', fontSize:'12px' } }, '등록된 경력 없음')
          : h('div', { style:{ display:'flex', flexDirection:'column', gap:'8px' } },
              prevC.map(function(item, idx){
                return h('div', { key:item.id, style:{ border:'1px solid #e2e8f0', borderLeft:'3px solid #1e40af', borderRadius:'6px', padding:'10px 12px', background:'#fff' } },
                  h('div', { style:{ display:'grid', gridTemplateColumns:'1fr 1fr auto', gap:'8px', marginBottom:'6px', alignItems:'center' } },
                    h('input', { type:'text', value:item.company||'', placeholder:'회사명', onChange:function(e){ updCareer(idx,'company',e.target.value); }, style:Object.assign({},inpS,{fontWeight:600}) }),
                    h('input', { type:'text', value:item.duty||'', placeholder:'담당 직무', onChange:function(e){ updCareer(idx,'duty',e.target.value); }, style:inpS }),
                    h('button', { onClick:function(){ delCareer(idx); }, style:{ padding:'4px 8px', background:'#fef2f2', color:'#dc2626', border:'1px solid #fca5a5', borderRadius:'4px', cursor:'pointer', fontSize:'10.5px' } }, '삭제')
                  ),
                  h('div', { style:{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'8px', marginBottom:'4px' } },
                    h('input', { type:'date', value:item.startDate||'', placeholder:'입사일', onChange:function(e){ updCareer(idx,'startDate',e.target.value); }, style:inpS }),
                    h('input', { type:'date', value:item.endDate||'', placeholder:'퇴직일', onChange:function(e){ updCareer(idx,'endDate',e.target.value); }, style:inpS }),
                    h('input', { type:'text', value:item.reason||'', placeholder:'퇴직 사유', onChange:function(e){ updCareer(idx,'reason',e.target.value); }, style:inpS })
                  ),
                  h('input', { type:'text', value:item.note||'', placeholder:'비고',
                    onChange:function(e){ updCareer(idx,'note',e.target.value); }, style:Object.assign({},inpS,{width:'100%'}) })
                );
              })
          )
      ),
      fld('메모', h('textarea', { value:f.memo||'', onChange:set('memo'), rows:4,
        style:{ width:'100%', padding:'7px 10px', border:'1px solid #cbd5e1', borderRadius:'4px', fontSize:'12.5px', resize:'vertical', boxSizing:'border-box' } }))
    );
  }

  return h('div', { className:'modal-bg', onClick:props.onClose },
    h('div', { className:'modal', onClick:function(e){ e.stopPropagation(); }, style:{ width:tab==='history'?'720px':'520px', maxWidth:'96vw', maxHeight:'90vh', display:'flex', flexDirection:'column' } },
      h('div', { className:'modal-h' },
        h('div', { className:'t' }, u ? '근로자 수정 — ' + u.name : '근로자 등록'),
        h('button', { className:'x', onClick:props.onClose }, '×')
      ),
      // 탭
      h('div', { style:{ display:'flex', gap:'4px', padding:'0 16px', background:'#f8fafc', borderBottom:'1px solid #e5e7eb' } },
        tabs2.map(function(t){
          var on = tab === t.id;
          return h('button', { key:t.id, onClick:function(){ setTab(t.id); },
            style:{ padding:'8px 14px', fontSize:'12px', cursor:'pointer', fontWeight:on?700:400,
              background:'transparent', border:'none', borderBottom: on?'2px solid #1e40af':'2px solid transparent',
              color: on?'#1e40af':'#64748b' } }, t.label);
        })
      ),
      h('div', { className:'modal-b', style:{ flex:1, overflowY:'auto' } }, bodyContent),
      (function(){
        var idx = tabs2.findIndex(function(t){return t.id===tab;});
        var isFirst = idx === 0;
        var isLast  = idx === tabs2.length - 1;
        return h('div', { className:'modal-f', style:{ display:'flex', gap:'6px', alignItems:'center' } },
          h('button', { className:'btn-secondary', onClick:props.onClose }, '취소'),
          h('div', { style:{ flex:1, textAlign:'center', fontSize:'11px', color:'#94a3b8' } },
            (idx+1) + ' / ' + tabs2.length + ' · ' + tabs2[idx].label),
          !isFirst && h('button', { className:'btn-secondary',
            onClick:function(){ setTab(tabs2[idx-1].id); } }, '← 이전'),
          !isLast && h('button', { className:'btn-primary',
            style:{ background:'#2563eb' },
            onClick:function(){ save({ next:true, nextTab: tabs2[idx+1].id }); } }, '저장하고 다음 →'),
          h('button', { className:'btn-primary',
            onClick:function(){ save(); } }, isLast ? '저장 완료' : '전체 저장')
        );
      })()
    )
  );
}

function StaffRosterDetail(props){
  var u = props.user;
  var srS = useState(false); var showRRN = srS[0]; var setShowRRN = srS[1];
  function row(label, val){
    if(!val && val !== 0) return null;
    return h('div', { style:{ display:'flex', gap:'8px', padding:'6px 0', borderBottom:'1px solid #f1f5f9', fontSize:'12.5px' } },
      h('span', { style:{ color:'#94a3b8', minWidth:'110px', flexShrink:0 } }, label),
      h('span', { style:{ color:'#1e293b', fontWeight:500 } }, val)
    );
  }
  var contractTypeColor = { '정규직':'#1e40af', '계약직':'#854d0e', '파트타임':'#059669', '일용직':'#1e40af' };
  return h('div', { className:'modal-bg', onClick:props.onClose },
    h('div', { className:'modal', onClick:function(e){ e.stopPropagation(); }, style:{ width:'480px', maxWidth:'96vw', maxHeight:'88vh', display:'flex', flexDirection:'column' } },
      h('div', { className:'modal-h' },
        h('div', { className:'t' }, '👤 ' + u.name + ' · ' + u.title),
        h('button', { className:'x', onClick:props.onClose }, '×')
      ),
      h('div', { className:'modal-b', style:{ flex:1, overflowY:'auto' } },
        // 배지
        h('div', { style:{ display:'flex', gap:'6px', marginBottom:'14px', flexWrap:'wrap' } },
          h('span', { style:{
            background: u.status==='active'?'#dcfce7':u.status==='leave'?'#ffedd5':'#fee2e2',
            color: u.status==='active'?'#166534':u.status==='leave'?'#9a3412':'#991b1b',
            fontSize:'11px', padding:'3px 10px', borderRadius:'10px', fontWeight:700 } },
            u.status==='active'?'재직':u.status==='leave'?'휴직':'퇴직'),
          u.contractType && h('span', { style:{ background:'#eff6ff', color:contractTypeColor[u.contractType]||'#1e40af', fontSize:'11px', padding:'3px 10px', borderRadius:'10px', fontWeight:700 } }, u.contractType),
          (function(){
            if(!u.isProbationary) return null;
            var today = todayYMD();
            var ps = u.probationStart || u.hireDate || '';
            var pe = u.probationEnd || '';
            var inProb = ps && pe && today >= ps && today <= pe;
            return h('span', {
              title: '수습 ' + (ps||'?') + ' ~ ' + (pe||'?') + (inProb ? ' (현재 수습 중 - 성과급 미반영)' : ' (수습 종료)'),
              style:{ background: inProb ? '#fef3c7' : '#f1f5f9',
                color: inProb ? '#854d0e' : '#94a3b8',
                fontSize:'11px', padding:'3px 10px', borderRadius:'10px', fontWeight:700 } },
              '🎓 수습' + (inProb ? ' (성과 미반영)' : ' 종료'));
          })(),
          h('span', { style:{ background:'#f1f5f9', color:'#475569', fontSize:'11px', padding:'3px 10px', borderRadius:'10px', fontWeight:600 } }, u.branch||'')
        ),
        h('div', { style:{ fontSize:'11.5px', fontWeight:700, color:'#475569', marginBottom:'4px', paddingBottom:'4px', borderBottom:'2px solid #e5e7eb' } }, '기본 정보'),
        row('사번', u.sid),
        row('생년월일', u.birthDate),
        row('성별', u.gender==='M'?'남':'여'),
        u.rrn && h('div', { style:{ display:'flex', gap:'8px', padding:'6px 0', borderBottom:'1px solid #f1f5f9', fontSize:'12.5px', alignItems:'center' } },
          h('span', { style:{ color:'#94a3b8', minWidth:'110px', flexShrink:0 } }, '주민등록번호'),
          h('span', { style:{ color:'#1e293b', fontWeight:500, fontFamily:'monospace', flex:1 } }, showRRN ? (typeof fmtRRN==='function'?fmtRRN(u.rrn):u.rrn) : (typeof maskRRN==='function'?maskRRN(u.rrn):(u.rrn||'').slice(0,7)+'******')),
          h('button', { onClick:function(){ setShowRRN(!showRRN); },
            style:{ padding:'2px 8px', fontSize:'10.5px', background: showRRN?'#fef2f2':'#f1f5f9', border:'1px solid '+(showRRN?'#fca5a5':'#cbd5e1'), borderRadius:'4px', color: showRRN?'#dc2626':'#475569', cursor:'pointer', fontWeight:600 } },
            showRRN ? '🙈 가리기' : '👁 공개')
        ),
        row('국적', u.nationality),
        u.nationality==='외국인' && u.foreignerRegNo && row('외국인등록번호', u.foreignerRegNo),
        u.nationality==='외국인' && u.visaType && row('체류자격(비자)', u.visaType),
        u.nationality==='외국인' && u.visaExpiry && row('체류 만료일', u.visaExpiry),
        u.isDisabled && row('장애인', '♿ ' + (u.disabledGrade ? u.disabledGrade + '급' : '해당')),
        h('div', { style:{ fontSize:'11px', fontWeight:700, color:'#64748b', margin:'8px 0 2px' } }, '연락처'),
        row('휴대전화', u.phone),
        row('자택전화', u.homePhone),
        row('이메일', u.email),
        row('비상연락처', u.emergencyContact ? u.emergencyContact + (u.emergencyPhone ? '  ' + u.emergencyPhone : '') : null),
        h('div', { style:{ fontSize:'11px', fontWeight:700, color:'#64748b', margin:'8px 0 2px' } }, '주소'),
        row('우편번호', u.zipCode),
        row('주소', u.address ? (u.address + (u.addressDetail ? ' ' + u.addressDetail : '')) : null),
        h('div', { style:{ fontSize:'11.5px', fontWeight:700, color:'#475569', margin:'10px 0 4px', paddingBottom:'4px', borderBottom:'2px solid #e5e7eb' } }, '계약·급여'),
        row('입사일', u.hireDate),
        row('소정근로시간', (u.scheduledHours || 8) + '시간/일'),
        row('수습종료일', u.probationEnd),
        row('퇴직일', u.retireDate),
        row('계약만료일', u.contractEnd),
        row('기본급', u.baseSalary ? u.baseSalary.toLocaleString() + '원' : null),
        u.wageType && row('임금 계산방법', u.wageType + (u.payDay ? ' · 매월 '+u.payDay+'일 지급' : '')),
        (u.workStart || u.workEnd) && row('근무시간', (u.workStart||'')+' ~ '+(u.workEnd||'')+(u.breakMinutes ? ' (휴게 '+u.breakMinutes+'분)' : '')),
        row('부양가족', u.dependents != null ? u.dependents+'명 (본인 포함)' : null),
        row('담당 직무', u.jobDuty),
        row('은행/계좌', u.bankName && u.accountNo ? u.bankName + ' ' + u.accountNo : (u.bankName||null)),
        row('예금주', u.accountHolder||null),
        row('최종학력', u.education),
        h('div', { style:{ fontSize:'11.5px', fontWeight:700, color:'#475569', margin:'10px 0 4px', paddingBottom:'4px', borderBottom:'2px solid #e5e7eb' } }, '4대보험'),
        row('국민연금', u.pensionNo),
        u.pensionAcquireDate && row('국민연금 취득일', u.pensionAcquireDate),
        row('건강보험', u.healthNo),
        u.healthAcquireDate && row('건강보험 취득일', u.healthAcquireDate),
        row('고용보험', u.employmentNo),
        u.employmentAcquireDate && row('고용보험 취득일', u.employmentAcquireDate),
        row('산재보험', u.injuryNo),
        (u.prevCareers&&u.prevCareers.length>0) && h('div', { style:{ marginTop:'10px' } },
          h('div', { style:{ fontSize:'11.5px', fontWeight:700, color:'#475569', marginBottom:'6px', paddingBottom:'4px', borderBottom:'2px solid #e5e7eb' } }, '📋 직전 경력'),
          u.prevCareers.map(function(c, i){
            return h('div', { key:i, style:{ fontSize:'12px', padding:'6px 8px', background:'#f8fafc', borderRadius:'4px', marginBottom:'4px', borderLeft:'2px solid #cbd5e1' } },
              h('div', { style:{ fontWeight:600, color:'#1e293b' } }, (c.company||'회사미기재') + (c.duty?' · '+c.duty:'')),
              h('div', { style:{ color:'#64748b', marginTop:'2px' } }, (c.startDate||'')+' ~ '+(c.endDate||'재직중') + (c.reason?' ('+c.reason+')':''))
            );
          })
        ),
        u.memo && h('div', { style:{ marginTop:'10px' } },
          h('div', { style:{ fontSize:'11.5px', fontWeight:700, color:'#475569', marginBottom:'4px', paddingBottom:'4px', borderBottom:'2px solid #e5e7eb' } }, '메모'),
          h('div', { style:{ fontSize:'12.5px', color:'#475569', lineHeight:'1.6', padding:'6px 0' } }, u.memo)
        ),
        // 이력 (있을 때만)
        (u.history||[]).length>0 && (function(){
          var TYPE_INFO = {
            salary:   { label:'💰 급여인상', color:'#16a34a' },
            perfRate: { label:'⭐ 성과급률 변경', color:'#2563eb' },
            promote:  { label:'📈 진급', color:'#1e40af' },
            transfer: { label:'🔀 부서이동', color:'#2563eb' },
            contract: { label:'📝 계약변경', color:'#ea580c' },
            other:    { label:'📌 기타', color:'#64748b' }
          };
          var sortedHist = (u.history||[]).slice().sort(function(a,b){ return (b.date||'').localeCompare(a.date||''); });
          return h('div', { style:{ marginTop:'12px' } },
            h('div', { style:{ fontSize:'11.5px', fontWeight:700, color:'#475569', marginBottom:'8px', paddingBottom:'4px', borderBottom:'2px solid #e5e7eb' } }, '📋 이력 (' + sortedHist.length + '건)'),
            h('div', { style:{ display:'flex', flexDirection:'column', gap:'6px' } },
              sortedHist.map(function(item){
                var ti = TYPE_INFO[item.type] || TYPE_INFO.other;
                return h('div', { key:item.id, style:{ borderLeft:'3px solid '+ti.color, padding:'6px 10px', background:'#f8fafc', borderRadius:'0 4px 4px 0', fontSize:'11.5px' } },
                  h('div', { style:{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'3px' } },
                    h('div', null,
                      h('span', { style:{ color:ti.color, fontWeight:700, marginRight:'8px' } }, ti.label),
                      h('span', { style:{ color:'#94a3b8', fontFamily:'monospace', fontSize:'10.5px' } }, item.date||'')
                    )
                  ),
                  (item.beforeValue||item.afterValue) && h('div', { style:{ fontSize:'11px', color:'#475569', marginBottom:'2px' } },
                    h('span', { style:{ color:'#94a3b8' } }, (item.beforeValue||'-')),
                    h('span', { style:{ margin:'0 6px', color:'#cbd5e1' } }, '→'),
                    h('span', { style:{ color:ti.color, fontWeight:600 } }, (item.afterValue||'-'))
                  ),
                  item.note && h('div', { style:{ fontSize:'10.5px', color:'#64748b', fontStyle:'italic' } }, item.note)
                );
              })
            )
          );
        })(),
        // ───── 퇴사 후 현황 (retired만) ─────
        u.status === 'retired' && (function(){
          // 퇴사일 이후 발생한 본인 성과급 (미정산 = paid 플래그가 false/없음)
          var unsettled = [];
          (dbGet('finance_income', [])||[]).forEach(function(fi){
            if(!u.retireDate || (fi.date||'') < u.retireDate) return;
            (fi.perfShares||[]).forEach(function(ps){
              var match = ps.sid === u.sid || ps.sid === u.name || (ps.name && ps.name === u.name);
              if(match && !ps.paid){
                unsettled.push({ date:fi.date, companyName:fi.companyName||'-', amount:ps.amount||0, role:ps.role||'' });
              }
            });
          });
          // 인계 내역: mgrHistory에 본인 이름이 before로 남아있는 사무관리 항목
          var handovers = [];
          [['cases','사건'],['consultings','컨설팅'],['funds','기금'],['other_projects','기타사업'],['companies','업체']].forEach(function(p){
            (dbGet(p[0], [])||[]).forEach(function(it){
              var hist = it.mgrHistory || [];
              var moved = hist.some(function(h0){ return h0.before === u.name && (h0.field||'').indexOf('담당')>=0; });
              if(moved){
                handovers.push({ module:p[1], name:it.companyName||it.name||'-',
                  to: it.managerMain ? (function(){var x=dbGet('user_accounts',[]).find(function(z){return z.sid===it.managerMain;}); return x?x.name:it.managerMain;})() : '-' });
              }
            });
          });
          return h('div', { style:{ marginTop:'14px', padding:'12px', background:'#fef2f2', border:'1px solid #fecaca', borderRadius:'6px' } },
            h('div', { style:{ fontSize:'12.5px', fontWeight:700, color:'#991b1b', marginBottom:'10px', paddingBottom:'6px', borderBottom:'1px solid #fecaca' } }, '🚪 퇴사 후 현황'),
            // 미정산 성과급
            h('div', { style:{ marginBottom:'10px' } },
              h('div', { style:{ fontSize:'11.5px', color:'#dc2626', fontWeight:700, marginBottom:'4px' } },
                '💰 미정산 성과급 (' + unsettled.length + '건)' + (unsettled.length>0 ? ' · 권형하 결재 필요' : '')),
              unsettled.length===0
                ? h('div', { style:{ fontSize:'11px', color:'#94a3b8', padding:'4px 0' } }, '없음')
                : unsettled.slice(0,20).map(function(x, i){
                    return h('div', { key:'u'+i, style:{ fontSize:'11px', padding:'4px 8px', background:'#fff', borderRadius:'5px', marginBottom:'4px', display:'flex', justifyContent:'space-between' } },
                      h('span', null, x.date + ' · ' + x.companyName + (x.role?' ('+x.role+')':'')),
                      h('span', { style:{ fontFamily:'monospace', fontWeight:700, color:'#dc2626' } }, x.amount.toLocaleString() + '원'));
                  })
            ),
            // 인계 내역
            h('div', { style:{ marginBottom:'10px' } },
              h('div', { style:{ fontSize:'11.5px', color:'#dc2626', fontWeight:700, marginBottom:'4px' } }, '🔀 인계 내역 (' + handovers.length + '건)'),
              handovers.length===0
                ? h('div', { style:{ fontSize:'11px', color:'#94a3b8', padding:'4px 0' } }, '없음')
                : handovers.slice(0,15).map(function(x, i){
                    return h('div', { key:'h'+i, style:{ fontSize:'11px', padding:'4px 8px', background:'#fff', borderRadius:'5px', marginBottom:'3px' } },
                      h('span', { style:{ color:'#94a3b8', marginRight:'6px' } }, '['+x.module+']'),
                      x.name + ' → ' + x.to);
                  })
            ),
            // 후속업무 체크리스트
            h('div', { style:{ paddingTop:'8px', borderTop:'1px dashed #fca5a5' } },
              h('div', { style:{ fontSize:'11.5px', color:'#dc2626', fontWeight:700, marginBottom:'4px' } }, '✅ 후속업무 체크리스트'),
              h('div', { style:{ fontSize:'11px', color:'#475569', lineHeight:'1.7' } },
                '• 4대보험 자격상실 신고 (다음달 15일까지)', h('br'),
                '• 퇴직금 14일 내 지급 (근기법 §36)', h('br'),
                '• 퇴직소득세 원천징수', h('br'),
                '• 임금명세서 마지막 발행', h('br'),
                '• 경력증명서·이직확인서 발급')
            )
          );
        })()
      ),
      h('div', { className:'modal-f' },
        h('button', { className:'btn-secondary', onClick:props.onClose }, '닫기'),
        props.onDelete && h('button', { onClick:function(){ props.onDelete(); },
          style:{ padding:'7px 12px', background:'#fef2f2', color:'#b91c1c', border:'1px solid #fca5a5', borderRadius:'5px', fontSize:'12px', fontWeight:700, cursor:'pointer' } },
          '🗑 삭제'),
        props.onContract && h('button', { onClick:function(){ props.onContract(); },
          style:{ padding:'7px 12px', background:'#fff7ed', color:'#9a3412', border:'1px solid #fed7aa', borderRadius:'5px', fontSize:'12px', fontWeight:700, cursor:'pointer' } },
          '📝 계약서'),
        props.onCard && h('button', { onClick:function(){ props.onCard(); },
          style:{ padding:'7px 12px', background:'#dbeafe', color:'#1e40af', border:'1px solid #93c5fd', borderRadius:'5px', fontSize:'12px', fontWeight:700, cursor:'pointer' } },
          '🪪 인사기록카드'),
        u.status === 'retired' && h('button', { onClick:function(){ props.onReinstate(); },
          style:{ padding:'7px 16px', background:'#dcfce7', color:'#166534', border:'1px solid #86efac', borderRadius:'5px', fontSize:'12px', fontWeight:700, cursor:'pointer' } },
          '↩ 재직 복귀'),
        u.status === 'retired' && h('button', { onClick:function(){
          // 이직확인서 자동 작성 — 새 탭 출력
          var name = u.name||''; var rrn = u.rrn||''; var hd = u.hireDate||''; var rd = u.retireDate||''; var lr = u.leaveReason||'';
          var sal = (u.baseSalary||0).toLocaleString();
          var html='<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"><title>이직확인서</title>'
            +'<style>body{font-family:"맑은 고딕",sans-serif;font-size:12px;margin:20mm}table{width:100%;border-collapse:collapse}td,th{border:1px solid #000;padding:6px 10px}th{background:#f1f3f4;text-align:center;font-weight:bold;white-space:nowrap;width:130px}.title{font-size:18px;font-weight:bold;text-align:center;margin:10px 0 4px}.sub{text-align:center;font-size:11px;color:#555;margin-bottom:14px}@media print{.noprint{display:none}}</style>'
            +'</head><body>'
            +'<div class="title">고용보험 피보험자격 이직확인서</div>'
            +'<div class="sub">고용보험법 시행규칙 제91조</div>'
            +'<div class="noprint" style="text-align:right;margin-bottom:8px"><button onclick="window.print()">🖨 인쇄</button></div>'
            +'<table>'
            +'<tr><th>사업장명</th><td>푸른노무법인</td><th>사업장관리번호</th><td>'+( u.employmentNo||'' )+'</td></tr>'
            +'<tr><th>피보험자 성명</th><td>'+name+'</td><th>주민등록번호</th><td>'+rrn+'</td></tr>'
            +'<tr><th>취득(입사)일</th><td>'+hd+'</td><th>이직(퇴사)일</th><td>'+rd+'</td></tr>'
            +'<tr><th>이직사유</th><td colspan="3">'+lr+'</td></tr>'
            +'<tr><th>이직 전 1일 소정근로시간</th><td>'+(u.scheduledHours||8)+'시간</td><th>마지막 월 급여</th><td>'+sal+'원</td></tr>'
            +'<tr><th>기본급</th><td>'+sal+'원</td><th>담당업무</th><td>'+(u.jobDuty||'')+'</td></tr>'
            +'</table>'
            +'<br><p style="font-size:11px;color:#666">※ 위 내용이 사실과 다름없음을 확인합니다.</p>'
            +'<br><p style="text-align:right">'+new Date().toLocaleDateString('ko-KR')+'</p>'
            +'<p style="text-align:right">사업주: 권형하 (서명)</p>'
            +'</body></html>';
          var w=window.open('','_blank'); if(w){ w.document.write(html); w.document.close(); }
        },
          style:{ padding:'7px 12px', background:'#f0f9ff', color:'#1d4ed8', border:'1px solid #93c5fd', borderRadius:'5px', fontSize:'12px', fontWeight:700, cursor:'pointer' } },
          '📋 이직확인서'),
        u.status === 'active' && h('button', { onClick:function(){ props.onRetire(); },
          style:{ padding:'7px 16px', background:'#fee2e2', color:'#dc2626', border:'1px solid #fca5a5', borderRadius:'5px', fontSize:'12px', fontWeight:700, cursor:'pointer' } },
          '🚪 퇴사 처리'),
        h('button', { className:'btn-primary', onClick:function(){ props.onEdit(); } }, '✏️ 수정')
      )
    )
  );
}

var LEAVE_REASONS = ['자발적 퇴사','권고사직','계약만료','해고','사망','기타'];
var DOC_LABELS = { settlement:'퇴직정산서', career:'경력증명서', employment:'이직확인서 (고용보험)', withholding:'근로소득 원천징수영수증', dismissal:'해고예고수당 정산서' };

// ★ 퇴직자 입사일 기준 연차 재산정 헬퍼 (근기법 §60)
// 회계년도 기준 정책이라도 퇴직자는 입사일 기준 비례 계산이 원칙
function calcRetirementLeaveJoinBasis(hireDate, retireDateStr, policy){
  if(!hireDate || !retireDateStr) return null;
  var hire = new Date(hireDate);
  var retire = new Date(retireDateStr);
  if(isNaN(hire.getTime()) || isNaN(retire.getTime())) return null;
  var p = policy || dbGet('policy_leave', { baseAfterOneYear:15, bonusEvery:2, bonusStart:3, maxDays:25, monthlyForFirstYear:true });
  var yearsWorked = (retire - hire) / (365.25 * 86400000);
  if(yearsWorked < 0) return null;
  // 1년 미만: 월 1일 (최대 11일)
  if(yearsWorked < 1){
    var months = Math.floor((retire - hire) / (30.44 * 86400000));
    var days = Math.min(months, 11);
    return { days:days, basis:'joinDate', fullEntitlement:days,
      reason:'1년 미만 · 입사일 기준 '+months+'개월 → '+days+'일 (근기법 §60①)' };
  }
  // 1년 이상: 마지막 기념일 기준 비례 계산
  var fullYears = Math.floor(yearsWorked);
  var lastAnn = new Date(hire); lastAnn.setFullYear(lastAnn.getFullYear() + fullYears);
  var nextAnn = new Date(hire); nextAnn.setFullYear(nextAnn.getFullYear() + fullYears + 1);
  var nextFY = fullYears + 1;
  var bs = p.bonusStart||3; var be = p.bonusEvery||2;
  var bonus = nextFY < bs ? 0 : Math.floor((nextFY - bs) / be) + 1;
  var entitlement = Math.min((p.baseAfterOneYear||15) + bonus, p.maxDays||25);
  var periodDays = Math.round((nextAnn - lastAnn) / 86400000);
  var workedInPeriod = Math.max(0, Math.round((retire - lastAnn) / 86400000));
  var proRated = Math.round(entitlement * workedInPeriod / periodDays * 10) / 10;
  return { days:proRated, basis:'joinDate', fullEntitlement:entitlement,
    workedInPeriod:workedInPeriod, periodDays:periodDays,
    lastAnn:lastAnn.toISOString().slice(0,10), nextAnn:nextAnn.toISOString().slice(0,10),
    fullYears:fullYears, nextFullYears:nextFY,
    reason:fullYears+'→'+nextFY+'년차 구간 ('+workedInPeriod+'/'+periodDays+'일 × '+entitlement+'일 = '+proRated+'일)' };
}

function RetireModal(props){
  useEscClose(props.onClose);
  var u = props.user;
  var today = todayYMD();
  var sp = useState(1); var step = sp[0]; var setStep = sp[1];
  var f1s = useState({ retireDate:today, lastWorkDate:today, leaveReason:'자발적 퇴사' });
  var f1 = f1s[0]; var setF1 = f1s[1];
  var f2s = useState({ annualLeaveRemain:0, leaveRecalcApplied:false });
  var f2 = f2s[0]; var setF2 = f2s[1];
  var dcs = useState({ settlement:true, career:true, employment:true, withholding:false, dismissal:false });
  var docs = dcs[0]; var setDocs = dcs[1];

  function set1(k){ return function(e){ setF1(Object.assign({},f1,(function(){var x={};x[k]=e.target.value;return x;}()))); }; }
  function toggleDoc(k){ setDocs(Object.assign({},docs,(function(){var x={};x[k]=!docs[k];return x;}()))); }

  // 자동계산
  function calcYears(from, to){
    if(!from||!to) return 0;
    return (new Date(to)-new Date(from))/(365.25*24*3600*1000);
  }
  var years = calcYears(u.hireDate, f1.retireDate);
  var isSev = years >= 1;
  var base = u.baseSalary || 0;
  var daily = Math.round(base/30);

  function calcProrated(){
    if(!f1.retireDate || !base) return 0;
    var d = new Date(f1.retireDate);
    var dim = new Date(d.getFullYear(), d.getMonth()+1, 0).getDate();
    return Math.round(base * d.getDate() / dim);
  }
  var prorated = calcProrated();
  var annualPay = Math.round(daily * 8 * (f2.annualLeaveRemain||0));
  var severance = isSev ? Math.round(daily*30*years) : 0;
  var total = prorated + annualPay + severance;

  var tenureText = (function(){
    if(!u.hireDate||!f1.retireDate) return '-';
    var yrs = Math.floor(years); var mos = Math.floor((years-yrs)*12);
    return yrs+'년 '+mos+'개월';
  })();

  function goStep2(){ if(!f1.retireDate){ showToast('퇴직일을 입력하세요'); return; } setStep(2); }
  function save(){
    var selDocs = Object.keys(docs).filter(function(k){ return docs[k]; });
    props.onSave(Object.assign({}, u, {
      status:'retired', retireDate:f1.retireDate, lastWorkDate:f1.lastWorkDate, leaveReason:f1.leaveReason,
      retireChecklist:{ isSeveranceTarget:isSev, workYears:Math.round(years*10)/10, proratedPay:prorated, annualLeaveRemain:f2.annualLeaveRemain, annualLeavePay:annualPay, severancePay:severance, totalPay:total },
      retireDocs:selDocs, retiredAt:today,
      leaveRecalcBasis: f2.leaveRecalcApplied ? 'joinDate' : (dbGet('policy_leave',{}).basis||'joinDate'),
      leaveRecalcApplied: f2.leaveRecalcApplied
    }));
  }

  function card(children){ return h('div', { style:{ background:'#f8fafc', border:'1px solid #e5e7eb', borderRadius:'8px', padding:'12px 16px', marginBottom:'10px' } }, children); }
  function lbl(t, v, mono, color){ return h('div', null, h('div', { style:{ fontSize:'11px', color:'#64748b', fontWeight:600, marginBottom:'2px' } }, t), h('div', { style:{ fontSize:'13px', fontWeight:700, color:color||'#1e293b', fontFamily:mono?'monospace':undefined } }, v)); }
  function fld(label, content){ return h('div', { style:{ marginBottom:'12px' } }, h('label', { style:{ display:'block', fontSize:'11px', fontWeight:600, color:'#475569', marginBottom:'4px' } }, label), content); }
  function inp(val, fn, type){ return h('input', { type:type||'text', value:val, onChange:fn, style:{ width:'100%', padding:'7px 10px', border:'1px solid #cbd5e1', borderRadius:'4px', fontSize:'12.5px', boxSizing:'border-box' } }); }
  function row(label, right){ return h('div', { style:{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'7px 0', borderBottom:'1px solid #f1f5f9' } }, h('span', { style:{ fontSize:'12px', color:'#475569' } }, label), right); }

  var body1 = h('div', null,
    h('div', { style:{ background:'#fff7ed', border:'1px solid #fed7aa', borderRadius:'6px', padding:'10px 14px', marginBottom:'14px', fontSize:'12px', color:'#9a3412' } }, '⚠️ 퇴사 처리 후 해당 직원은 퇴직 탭으로 이동됩니다.'),
    card(h('div', { style:{ display:'flex', gap:'20px' } },
      lbl('이름', u.name),
      lbl('직책', u.title||'-'),
      lbl('입사일', u.hireDate||'-', true)
    )),
    fld('퇴직일 *', inp(f1.retireDate, set1('retireDate'), 'date')),
    fld('마지막 근무일', inp(f1.lastWorkDate, set1('lastWorkDate'), 'date')),
    fld('퇴직사유', h('select', { value:f1.leaveReason, onChange:set1('leaveReason'), style:{ width:'100%', padding:'7px 10px', border:'1px solid #cbd5e1', borderRadius:'4px', fontSize:'12.5px' } },
      LEAVE_REASONS.map(function(r){ return h('option',{key:r,value:r},r); })
    ))
  );

  var body2 = h('div', null,
    card(h('div', { style:{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'12px' } },
      lbl('퇴직일', f1.retireDate, true),
      lbl('퇴직사유', f1.leaveReason),
      lbl('근속기간', tenureText, false, isSev?'#166534':'#991b1b')
    )),
    h('div', { style:{ fontSize:'11.5px', fontWeight:700, color:'#475569', marginBottom:'6px' } }, '📋 정산 항목'),
    card(h('div', null,
      row('마지막 월 급여 (일할)', h('span', { style:{ fontFamily:'monospace', fontWeight:700 } }, prorated.toLocaleString()+'원')),
      row('잔여연차 수당', h('div', { style:{ display:'flex', alignItems:'center', gap:'6px' } },
        h('input', { type:'number', min:0, max:99, value:f2.annualLeaveRemain,
          onChange:function(e){ setF2(Object.assign({},f2,{annualLeaveRemain:parseInt(e.target.value||0,10)})); },
          style:{ width:'55px', padding:'3px 6px', border:'1px solid #cbd5e1', borderRadius:'4px', fontSize:'12px', textAlign:'center' } }),
        h('span', { style:{ fontSize:'11.5px', color:'#64748b' } }, '일'),
        h('span', { style:{ fontFamily:'monospace', fontWeight:700 } }, annualPay.toLocaleString()+'원')
      )),
      // ★ 연차 재산정 박스
      (function(){
        var policy = dbGet('policy_leave', { basis:'joinDate', baseAfterOneYear:15, bonusEvery:2, bonusStart:3, maxDays:25 });
        var curBasis = policy.basis || 'joinDate';
        var recalc = calcRetirementLeaveJoinBasis(u.hireDate, f1.retireDate, policy);
        // 회계년도 기준이거나, 입사일 기준이더라도 비례 재산정이 다를 수 있음
        var policyLabel = curBasis === 'fiscal' ? '회계년도 기준' : '입사일 기준(정책)';
        return h('div', { style:{ marginTop:'8px', background:'#f0f9ff', border:'1px solid #bfdbfe', borderRadius:'6px', padding:'10px 14px' } },
          h('div', { style:{ fontSize:'11.5px', fontWeight:700, color:'#1d4ed8', marginBottom:'8px', display:'flex', alignItems:'center', gap:'6px' } },
            '🔄 퇴직자 연차 재산정 (근기법 §60)',
            h('span', { style:{ fontSize:'10px', background:'#e0f2fe', color:'#1d4ed8', padding:'2px 7px', borderRadius:'8px', fontWeight:600 } }, policyLabel+' → 입사일 기준 비례')
          ),
          recalc ? h('div', null,
            h('div', { style:{ fontSize:'11px', color:'#1e3a8a', marginBottom:'8px', padding:'6px 10px', background:'#e0f2fe', borderRadius:'5px' } },
              h('div', { style:{ fontWeight:700, marginBottom:'3px' } }, '📐 입사일 기준 비례 연차 계산'),
              h('div', null, recalc.reason),
              recalc.lastAnn && h('div', { style:{ marginTop:'4px', color:'#1d4ed8' } },
                '기준 구간: '+recalc.lastAnn+' ~ '+recalc.nextAnn+
                ' ('+recalc.workedInPeriod+'/'+recalc.periodDays+'일 근무)')
            ),
            h('div', { style:{ display:'flex', alignItems:'center', justifyContent:'space-between' } },
              h('label', { style:{ display:'flex', alignItems:'center', gap:'8px', cursor:'pointer', fontSize:'12.5px', fontWeight:700, color:'#1e3a8a' } },
                h('input', { type:'checkbox', checked:!!f2.leaveRecalcApplied,
                  onChange:function(e){
                    var checked = e.target.checked;
                    setF2(Object.assign({},f2,{
                      leaveRecalcApplied: checked,
                      annualLeaveRemain: checked ? recalc.days : f2.annualLeaveRemain
                    }));
                  },
                  style:{ width:'15px', height:'15px', cursor:'pointer', accentColor:'#1d4ed8' } }),
                '입사일 기준 재산정 적용 ('+recalc.days+'일)'
              ),
              f2.leaveRecalcApplied && h('span', { style:{ fontSize:'10.5px', color:'#16a34a', fontWeight:700, background:'#dcfce7', padding:'2px 8px', borderRadius:'6px' } }, '✔ 재산정 적용됨')
            ),
            f2.leaveRecalcApplied && h('div', { style:{ marginTop:'6px', fontSize:'11px', color:'#475569', background:'#fff', padding:'6px 10px', borderRadius:'4px', border:'1px solid #e0f2fe' } },
              '잔여연차 일수가 자동으로 '+recalc.days+'일로 설정됩니다. 위 잔여연차 입력란에서 수동 조정도 가능합니다.'
            )
          ) : h('div', { style:{ fontSize:'11px', color:'#94a3b8' } }, '퇴직일을 입력하면 자동 계산됩니다.')
        );
      })(),
      row('퇴직금'+(isSev?'':' (1년 미만)'), h('span', { style:{ fontFamily:'monospace', fontWeight:700, color:isSev?'#1e40af':'#94a3b8' } }, isSev?severance.toLocaleString()+'원':'-')),
      h('div', { style:{ display:'flex', justifyContent:'space-between', padding:'10px 0 4px', borderTop:'2px solid #e5e7eb', marginTop:'4px' } },
        h('span', { style:{ fontSize:'12.5px', fontWeight:700 } }, '예상 합계'),
        h('span', { style:{ fontFamily:'monospace', fontSize:'16px', fontWeight:800, color:'#1e40af' } }, total.toLocaleString()+'원')
      )
    )),
    h('div', { style:{ fontSize:'11.5px', fontWeight:700, color:'#475569', margin:'12px 0 6px' } }, '📄 발급할 문서 선택'),
    card(Object.keys(DOC_LABELS).map(function(k){
      return h('label', { key:k, style:{ display:'flex', alignItems:'center', gap:'8px', padding:'5px 0', cursor:'pointer', fontSize:'12.5px', color:'#1e293b' } },
        h('input', { type:'checkbox', checked:!!docs[k], onChange:function(){ toggleDoc(k); }, style:{ width:'15px', height:'15px', cursor:'pointer' } }),
        DOC_LABELS[k]
      );
    }))
  );

  return h('div', { className:'modal-bg', onClick:props.onClose },
    h('div', { className:'modal', onClick:function(e){ e.stopPropagation(); }, style:{ width:'520px', maxWidth:'96vw', maxHeight:'92vh', display:'flex', flexDirection:'column' } },
      h('div', { className:'modal-h' },
        h('div', { className:'t' }, '\ud83d\udeaa 퇴사 처리 \u2014 '+u.name),
        h('button', { className:'x', onClick:props.onClose }, '\xd7')
      ),
      h('div', { style:{ display:'flex', padding:'10px 20px', background:'#f8fafc', borderBottom:'1px solid #e5e7eb', gap:'8px', alignItems:'center' } },
        h('span', { style:{ padding:'3px 12px', borderRadius:'10px', fontSize:'11.5px', fontWeight:700, background:step===1?'#1e40af':'#dcfce7', color:step===1?'#fff':'#166534' } }, '1 기본정보'),
        h('span', { style:{ color:'#cbd5e1' } }, '\u2192'),
        h('span', { style:{ padding:'3px 12px', borderRadius:'10px', fontSize:'11.5px', fontWeight:700, background:step===2?'#1e40af':'#f1f5f9', color:step===2?'#fff':'#94a3b8' } }, '2 정산\xb7문서')
      ),
      h('div', { className:'modal-b', style:{ flex:1, overflowY:'auto' } }, step===1 ? body1 : body2),
      h('div', { className:'modal-f' },
        step===1
          ? h('div', { style:{ display:'flex', gap:'8px', width:'100%' } },
              h('button', { className:'btn-secondary', onClick:props.onClose, style:{ flex:1 } }, '취소'),
              h('button', { className:'btn-primary', onClick:goStep2, style:{ flex:2 } }, '다음 \u2192'))
          : h('div', { style:{ display:'flex', gap:'8px', width:'100%' } },
              h('button', { className:'btn-secondary', onClick:function(){ setStep(1); }, style:{ flex:1 } }, '\u2190 이전'),
              h('button', { onClick:save, style:{ flex:2, padding:'8px', background:'#dc2626', color:'#fff', border:'none', borderRadius:'5px', fontSize:'13px', fontWeight:700, cursor:'pointer' } }, '퇴사 처리 완료'))
      )
    )
  );
}



// ============================================================
// 📝 근로계약서 관리 모달
// ============================================================
function EmploymentContractModal(props){
  useEscClose(props.onClose);
  var u = props.user;
  var listS = useState(dbGet('employment_contracts', []).filter(function(c){return c.sid===u.sid;}));
  var list = listS[0]; var setList = listS[1];
  var fs = useState(null); var form = fs[0]; var setForm = fs[1];

  function persistList(arr){
    // 전체 employment_contracts에서 해당 sid 항목 교체
    var all = dbGet('employment_contracts', []).filter(function(c){return c.sid!==u.sid;});
    dbSet('employment_contracts', all.concat(arr));
    setList(arr);
  }
  function openNew(){
    setForm({
      isNew: true,
      id: 'ec-'+u.sid+'-'+Date.now(),
      sid: u.sid, name: u.name,
      type: '근로계약서',
      signedDate: todayYMD(),
      startDate: '',
      endDate: '',
      salary: 0,
      position: u.title||'',
      workHours: '주 40시간',
      workDays: '월~금',
      probationPeriod: '',
      status: 'active',
      notes: ''
    });
  }
  function openEdit(c){ setForm(Object.assign({}, c, {isNew:false})); }
  function save(){
    if(!form.signedDate || !form.startDate){
      showToast('체결일·시작일은 필수');
      return;
    }
    var next = form.isNew
      ? [form].concat(list)
      : list.map(function(c){return c.id===form.id ? form : c;});
    // 시간순 정렬
    next.sort(function(a,b){return (b.signedDate||'').localeCompare(a.signedDate||'');});
    persistList(next);
    if(typeof AuditLog !== 'undefined' && AuditLog.write){
      AuditLog.write('contract', form.id, 'contract', '', form.type+' '+(form.startDate||''), '근로계약 ' + (form.isNew?'등록':'수정'));
    }
    setForm(null);
    showToast('계약서 저장됨');
  }
  async function del(id){
    if(!(await popConfirm('이 계약서를 삭제하시겠습니까?'))) return;
    var _ud=list.slice(); persistList(list.filter(function(c){return c.id!==id;}));
    showToastUndo('🗑️ 계약서 삭제됨', function(){persistList(_ud);});
  }
  async function expire(id){
    if(!(await popConfirm('이 계약을 만료 처리하시겠습니까? (status: expired)'))) return;
    persistList(list.map(function(c){return c.id===id ? Object.assign({}, c, {status:'expired'}) : c;}));
  }

  // 만료 임박 체크 (1개월 이내)
  var today = new Date();
  var oneMonth = new Date(); oneMonth.setMonth(oneMonth.getMonth()+1);
  function getExpiryStatus(c){
    if(c.status !== 'active' || !c.endDate) return null;
    var ed = new Date(c.endDate);
    if(ed < today) return { color:'#dc2626', bg:'#fee2e2', label:'⚠️ 만료됨' };
    if(ed <= oneMonth) return { color:'#9a3412', bg:'#fff7ed', label:'⏰ 1개월 내 만료' };
    return null;
  }

  return h('div', { className:'modal-bg', onClick:function(e){if(e.target===e.currentTarget)props.onClose();} },
    h('div', { className:'modal', style:{width:'700px', maxHeight:'92vh', display:'flex', flexDirection:'column'}, onClick:function(e){e.stopPropagation();} },
      h('div', { className:'modal-h' },
        h('div', { className:'t' }, '📝 근로계약서 관리 - ' + u.name),
        h('button', { className:'x', onClick:props.onClose }, '×')
      ),
      h('div', { className:'modal-b', style:{flex:1, overflowY:'auto'} },
        // 목록 / 폼 전환
        !form ? (
          h('div', null,
            h('div', { style:{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'10px'} },
              h('div', { style:{fontSize:'11.5px', color:'#64748b'} }, '계약 이력 ' + list.length + '건'),
              h('button', { onClick:openNew,
                style:{padding:'6px 14px', background:'#1e40af', color:'#fff', border:'none', borderRadius:'5px', fontSize:'11.5px', fontWeight:700, cursor:'pointer'} }, '+ 새 계약')
            ),
            list.length === 0
              ? h('div', { style:{textAlign:'center', padding:'40px', color:'#94a3b8', fontSize:'12px', background:'#f8fafc', borderRadius:'6px'} }, '등록된 계약서가 없습니다.')
              : h('table', { style:{width:'100%', borderCollapse:'collapse', fontSize:'11.5px'} },
                  h('thead', null, h('tr', { style:{background:'#f8fafc'} },
                    h('th', { style:{padding:'7px 8px', textAlign:'left', borderBottom:'1px solid #e2e8f0', fontWeight:700, color:'#475569'} }, '종류'),
                    h('th', { style:{padding:'7px 8px', textAlign:'left', borderBottom:'1px solid #e2e8f0', fontWeight:700, color:'#475569'} }, '체결일'),
                    h('th', { style:{padding:'7px 8px', textAlign:'left', borderBottom:'1px solid #e2e8f0', fontWeight:700, color:'#475569'} }, '기간'),
                    h('th', { style:{padding:'7px 8px', textAlign:'right', borderBottom:'1px solid #e2e8f0', fontWeight:700, color:'#475569'} }, '연봉'),
                    h('th', { style:{padding:'7px 8px', textAlign:'center', borderBottom:'1px solid #e2e8f0', fontWeight:700, color:'#475569'} }, '상태'),
                    h('th', { style:{padding:'7px 8px', textAlign:'center', borderBottom:'1px solid #e2e8f0', fontWeight:700, color:'#475569'} }, '관리')
                  )),
                  h('tbody', null,
                    list.map(function(c){
                      var ex = getExpiryStatus(c);
                      return h('tr', { key:c.id, style:{borderTop:'1px solid #f1f5f9'} },
                        h('td', { style:{padding:'7px 8px', fontWeight:600} }, c.type),
                        h('td', { style:{padding:'7px 8px', fontFamily:'monospace', fontSize:'11px'} }, c.signedDate||'-'),
                        h('td', { style:{padding:'7px 8px', fontSize:'11px', color:'#475569'} },
                          (c.startDate||'-') + ' ~ ' + (c.endDate||'기한없음')),
                        h('td', { style:{padding:'7px 8px', textAlign:'right', fontFamily:'monospace'} },
                          c.salary ? (c.salary).toLocaleString()+'원' : '-'),
                        h('td', { style:{padding:'7px 8px', textAlign:'center'} },
                          ex
                            ? h('span', { style:{background:ex.bg, color:ex.color, padding:'2px 7px', borderRadius:'8px', fontSize:'10px', fontWeight:700} }, ex.label)
                            : h('span', { style:{background: c.status==='active'?'#dcfce7':'#f1f5f9', color: c.status==='active'?'#166534':'#94a3b8', padding:'2px 7px', borderRadius:'8px', fontSize:'10px', fontWeight:700} },
                                c.status==='active'?'유효':c.status==='expired'?'만료':'해지')),
                        h('td', { style:{padding:'7px 8px', textAlign:'center'} },
                          h('button', { onClick:function(){openEdit(c);},
                            style:{padding:'2px 7px', background:'#dbeafe', color:'#1e40af', border:'1px solid #93c5fd', borderRadius:'5px', fontSize:'10.5px', cursor:'pointer', fontWeight:600, marginRight:'2px'} }, '수정'),
                          c.status==='active' && h('button', { onClick:function(){expire(c.id);},
                            style:{padding:'2px 7px', background:'#fef3c7', color:'#854d0e', border:'1px solid #fde68a', borderRadius:'5px', fontSize:'10.5px', cursor:'pointer', fontWeight:600, marginRight:'2px'} }, '만료'),
                          h('button', { onClick:function(){del(c.id);},
                            style:{padding:'2px 7px', background:'#fee2e2', color:'#991b1b', border:'1px solid #fca5a5', borderRadius:'5px', fontSize:'10.5px', cursor:'pointer', fontWeight:600} }, '✕'))
                      );
                    })
                  )
                )
          )
        ) : (
          // 폼
          h('div', null,
            h('div', { style:{fontSize:'12.5px', fontWeight:700, color:'#1e293b', marginBottom:'12px', paddingBottom:'6px', borderBottom:'2px solid #e2e8f0'} },
              form.isNew ? '➕ 새 계약서 등록' : '✏️ 계약서 수정'),
            (function(){
              var rs = {display:'flex', gap:'8px', marginBottom:'10px', alignItems:'center'};
              var lS = {minWidth:'100px', fontSize:'11.5px', color:'#475569', fontWeight:600};
              var iS = {flex:1, padding:'5px 10px', border:'1px solid #cbd5e1', borderRadius:'4px', fontSize:'12px', fontFamily:'inherit'};
              function set(k, v){ setForm(Object.assign({}, form, (function(){var o={};o[k]=v;return o;})())); }
              return h('div', null,
                h('div', { style:rs }, h('label', { style:lS }, '종류 *'),
                  h('select', { value:form.type, onChange:function(e){set('type',e.target.value);}, style:iS },
                    h('option', null, '근로계약서'),
                    h('option', null, '연봉계약서'),
                    h('option', null, '갱신'),
                    h('option', null, '변경'),
                    h('option', null, '기간제 → 정규직 전환'),
                    h('option', null, '기타'))),
                h('div', { style:rs }, h('label', { style:lS }, '체결일 *'),
                  h('div', { style:{flex:1} }, h(KoreanDatePicker, { value:form.signedDate||'',
                    onChange:function(e){set('signedDate',e.target.value);} }))),
                h('div', { style:rs }, h('label', { style:lS }, '시작일 *'),
                  h('div', { style:{flex:1} }, h(KoreanDatePicker, { value:form.startDate||'',
                    onChange:function(e){set('startDate',e.target.value);} }))),
                h('div', { style:rs }, h('label', { style:lS }, '종료일'),
                  h('div', { style:{flex:1} }, h(KoreanDatePicker, { value:form.endDate||'',
                    onChange:function(e){set('endDate',e.target.value);} })),
                  h('span', { style:{fontSize:'10.5px', color:'#94a3b8'} }, '비워두면 기한 없음')),
                h('div', { style:rs }, h('label', { style:lS }, '직책'),
                  h('input', { type:'text', value:form.position||'', onChange:function(e){set('position',e.target.value);}, style:iS, placeholder:'노무사 / 사무장 / ...' })),
                h('div', { style:rs }, h('label', { style:lS }, '연봉'),
                  h('input', { type:'text', value:form.salary?form.salary.toLocaleString():'',
                    onChange:function(e){set('salary',parseInt(e.target.value.replace(/[^0-9]/g,''))||0);},
                    style:Object.assign({},iS,{fontFamily:'monospace',textAlign:'right'}), placeholder:'0' }),
                  h('span', { style:{fontSize:'11px', color:'#64748b'} }, '원')),
                h('div', { style:rs }, h('label', { style:lS }, '근무시간'),
                  h('input', { type:'text', value:form.workHours||'', onChange:function(e){set('workHours',e.target.value);}, style:iS, placeholder:'주 40시간' })),
                h('div', { style:rs }, h('label', { style:lS }, '근무일'),
                  h('input', { type:'text', value:form.workDays||'', onChange:function(e){set('workDays',e.target.value);}, style:iS, placeholder:'월~금' })),
                h('div', { style:rs }, h('label', { style:lS }, '수습 기간'),
                  h('input', { type:'text', value:form.probationPeriod||'', onChange:function(e){set('probationPeriod',e.target.value);}, style:iS, placeholder:'예: 3개월' })),
                h('div', { style:rs }, h('label', { style:lS }, '상태'),
                  h('select', { value:form.status, onChange:function(e){set('status',e.target.value);}, style:iS },
                    h('option', { value:'active' }, '유효'),
                    h('option', { value:'expired' }, '만료'),
                    h('option', { value:'terminated' }, '해지'))),
                h('div', { style:Object.assign({},rs,{alignItems:'flex-start'}) }, h('label', { style:lS }, '특이사항'),
                  h('textarea', { value:form.notes||'', onChange:function(e){set('notes',e.target.value);},
                    rows:3, style:Object.assign({},iS,{resize:'vertical'}), placeholder:'성과급 조건·복리후생·기타' }))
              );
            })()
          )
        )
      ),
      h('div', { className:'modal-f' },
        form ? [
          h('button', { key:'c', className:'btn-secondary', onClick:function(){setForm(null);} }, '취소'),
          h('button', { key:'s', className:'btn-primary', onClick:save }, '💾 저장')
        ] : h('button', { className:'btn-primary', onClick:props.onClose }, '닫기')
      )
    )
  );
}

// ============================================================
// 🪪 인사기록카드 통합 모달 (인쇄 가능)
// ============================================================
function PersonnelCardModal(props){
  useEscClose(props.onClose);
  var u = props.user;
  var CUR_YEAR = new Date().getFullYear();

  // trainingChecks 구조: { [key]: [ {year, done, date}, ... ] }
  // 구버전(단일 객체) 자동 마이그레이션
  function migrateTrainings(raw){
    if(!raw) return {};
    var out = {};
    Object.keys(raw).forEach(function(k){
      var v = raw[k];
      if(Array.isArray(v)){ out[k] = v; }
      else { out[k] = [{ year:CUR_YEAR, done:!!v.done, date:v.date||'' }]; }
    });
    return out;
  }

  var edS = useState({
    education:   u.education   || '대졸',
    schoolName:  u.schoolName  || '',
    major:       u.major       || '',
    schoolName2: u.schoolName2 || '',
    major2:      u.major2      || '',
    trainingChecks: migrateTrainings(u.trainingChecks)
  });
  var ed = edS[0]; var setEd = edS[1];

  function setField(key){ return function(e){ var v=e.target.value; setEd(function(p){ var n=Object.assign({},p); n[key]=v; return n; }); }; }

  // 연도별 교육 행 토글/입력
  function setTrainingYear(name, year, key){ return function(e){
    var v = e.target.type==='checkbox'?e.target.checked:e.target.value;
    setEd(function(p){
      var tc = Object.assign({}, p.trainingChecks);
      var arr = (tc[name]||[]).slice();
      var idx = arr.findIndex(function(r){return r.year===year;});
      if(idx<0){ arr.push({year:year, done:false, date:''}); idx=arr.length-1; }
      arr[idx] = Object.assign({}, arr[idx]); arr[idx][key]=v;
      tc[name] = arr.sort(function(a,b){return b.year-a.year;});
      return Object.assign({},p,{trainingChecks:tc});
    });
  }; }

  // 연도 추가
  function addYear(name){ setEd(function(p){
    var tc = Object.assign({},p.trainingChecks);
    var arr = (tc[name]||[]).slice();
    var minY = arr.reduce(function(m,r){return Math.min(m,r.year);}, CUR_YEAR);
    arr.push({year:minY-1, done:false, date:''});
    tc[name] = arr.sort(function(a,b){return b.year-a.year;});
    return Object.assign({},p,{trainingChecks:tc});
  }); }

  var TRAININGS = [
    { key:'성희롱예방교육',    label:'성희롱 예방교육',     law:'남녀고용평등법 §13 (연1회 의무)' },
    { key:'장애인인식개선교육', label:'장애인 인식개선 교육', law:'장애인고용법 §5의2 (연1회 의무)' },
    { key:'개인정보보호교육',  label:'개인정보 보호교육',   law:'개인정보보호법 §28 (연1회 의무)' },
    { key:'산업안전보건교육',  label:'산업안전보건교육',    law:'산업안전보건법 §29 (분기별)' },
    { key:'직장내괴롭힘예방교육', label:'직장 내 괴롭힘 예방', law:'근기법 §76의3 (연1회 의무)' }
  ];

  // 교육 미이수 연도 수 계산 (당해 연도 기준)
  

  function doPrint(){ window.print(); }
  function doSave(){
    if(props.onSave){
      props.onSave(Object.assign({}, u, {
        education:   ed.education,  schoolName:  ed.schoolName,
        major:       ed.major,      schoolName2: ed.schoolName2,
        major2:      ed.major2,     trainingChecks: ed.trainingChecks
      }));
    }
  }

  var contracts = dbGet('employment_contracts', []).filter(function(c){return c.sid===u.sid;});
  var payrolls  = dbGet('payroll_monthly', []).filter(function(p){return p.sid===u.sid;});
  var sS = { background:'#fff', border:'1px solid #e2e8f0', borderRadius:'6px', padding:'12px 16px', marginBottom:'10px' };
  var tS = { fontSize:'12.5px', fontWeight:700, color:'#1e40af', marginBottom:'8px', paddingBottom:'4px', borderBottom:'1px solid #dbeafe' };
  var rowS = { display:'flex', padding:'4px 0', fontSize:'11.5px', borderBottom:'1px dashed #f1f5f9', alignItems:'center' };
  var lblS = { minWidth:'110px', color:'#64748b', fontWeight:600 };
  var valS = { flex:1, color:'#1e293b' };
  var inpS = { padding:'5px 8px', border:'1px solid #cbd5e1', borderRadius:'4px', fontSize:'11.5px', boxSizing:'border-box' };
  function row(label,val){ if(!val&&val!==0) return null; return h('div',{style:rowS},h('span',{style:lblS},label),h('span',{style:valS},val)); }

  var hireDate = u.hireDate||''; var retireDate = u.retireDate||'';
  var workYears=''; if(hireDate){ var d1=new Date(hireDate); var d2=retireDate?new Date(retireDate):new Date(); var dy=Math.floor((d2-d1)/86400000); workYears=Math.floor(dy/365)+'년 '+Math.floor((dy%365)/30)+'개월'; }
  var isCollege = ['전문대졸','대졸','대학원졸(석사)','대학원졸(박사)'].indexOf(ed.education)>=0;
  var isGrad    = ['대학원졸(석사)','대학원졸(박사)'].indexOf(ed.education)>=0;

  return h('div', { className:'modal-bg', onClick:function(e){if(e.target===e.currentTarget)props.onClose();} },
    h('div', { className:'modal', style:{width:'820px', maxHeight:'94vh', display:'flex', flexDirection:'column'}, onClick:function(e){e.stopPropagation();} },
      h('div', { className:'modal-h' },
        h('div', { className:'t' }, '🪪 인사기록카드 — ' + u.name + ' (' + u.sid + ')'),
        h('button', { className:'x', onClick:props.onClose }, '×')
      ),
      h('div', { className:'modal-b', style:{flex:1, overflowY:'auto', background:'#f8fafc', padding:'14px'} },

        // 헤더
        h('div', { style:{background:'#202124', color:'#fff', borderRadius:'8px', padding:'16px 20px', marginBottom:'12px', display:'flex', justifyContent:'space-between', alignItems:'center'} },
          h('div', null,
            h('div', { style:{fontSize:'20px', fontWeight:800} }, u.name),
            h('div', { style:{fontSize:'11.5px', color:'#94a3b8', marginTop:'4px', fontFamily:'monospace'} }, u.sid+' · '+(u.title||'')+' · '+(u.branch||'')),
            workYears && h('div', { style:{fontSize:'11px', color:'#cbd5e1', marginTop:'4px'} }, '재직기간: '+workYears+' ('+hireDate+(retireDate?' ~ '+retireDate:' ~ 현재')+')')
          ),
          h('span', { style:{padding:'4px 14px', borderRadius:'10px', fontSize:'11px', fontWeight:700, background:u.status==='active'?'#16a34a':u.status==='retired'?'#dc2626':'#854d0e', color:'#fff'} },
            u.status==='active'?'재직':u.status==='retired'?'퇴직':u.status==='leave'?'휴직':'기타')
        ),

        // 1. 기본정보
        h('div', { style:sS },
          h('div', { style:tS }, '📋 1. 기본 정보'),
          row('생년월일', u.birthDate), row('성별', u.gender==='M'?'남':'여'),
          row('국적', u.nationality),
          u.foreignerRegNo && row('외국인등록번호', u.foreignerRegNo),
          row('휴대전화', u.phone), row('이메일', u.email),
          row('주소', u.address?(u.address+(u.addressDetail?' '+u.addressDetail:'')):null),
          row('비상연락처', u.emergencyContact?(u.emergencyContact+(u.emergencyPhone?' '+u.emergencyPhone:'')):null),
          row('담당 직무', u.jobDuty), row('입사일', hireDate),
          retireDate && row('퇴사일', retireDate)
        ),

        // 2. 학력
        h('div', { style:sS },
          h('div', { style:tS }, '📚 2. 학력'),
          h('div', { style:Object.assign({},rowS,{marginBottom:'8px'}) },
            h('span', { style:Object.assign({},lblS,{alignSelf:'center'}) }, '최종 학력'),
            h('select', { value:ed.education, onChange:setField('education'), style:Object.assign({},inpS,{width:'160px'}) },
              ['고졸','전문대졸','대졸','대학원졸(석사)','대학원졸(박사)','기타'].map(function(v){ return h('option',{key:v,value:v},v); })
            )
          ),
          isCollege && h('div', { style:{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px', marginBottom:'6px'} },
            h('div', null, h('label',{style:{fontSize:'10.5px',color:'#64748b',display:'block',marginBottom:'3px'}},'대학교명'), h('input',{type:'text',value:ed.schoolName,onChange:setField('schoolName'),placeholder:'예: 충남대학교',style:Object.assign({},inpS,{width:'100%'})})),
            h('div', null, h('label',{style:{fontSize:'10.5px',color:'#64748b',display:'block',marginBottom:'3px'}},'전공(학과)'), h('input',{type:'text',value:ed.major,onChange:setField('major'),placeholder:'예: 법학과',style:Object.assign({},inpS,{width:'100%'})}))
          ),
          isGrad && h('div', { style:{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px', marginBottom:'6px'} },
            h('div', null, h('label',{style:{fontSize:'10.5px',color:'#64748b',display:'block',marginBottom:'3px'}},'대학원명'), h('input',{type:'text',value:ed.schoolName2,onChange:setField('schoolName2'),placeholder:'예: 한국방송통신대학원',style:Object.assign({},inpS,{width:'100%'})})),
            h('div', null, h('label',{style:{fontSize:'10.5px',color:'#64748b',display:'block',marginBottom:'3px'}},'대학원 전공'), h('input',{type:'text',value:ed.major2,onChange:setField('major2'),placeholder:'예: 노동법학',style:Object.assign({},inpS,{width:'100%'})}))
          ),
          h('div', { style:{marginTop:'6px', padding:'7px 10px', background:'#f0f9ff', borderRadius:'5px', fontSize:'11.5px', color:'#1d4ed8'} },
            '✔ '+ed.education+(ed.schoolName?' · '+ed.schoolName+(ed.major?' ('+ed.major+')':''):'')+(isGrad&&ed.schoolName2?' → '+ed.schoolName2+(ed.major2?' ('+ed.major2+')':''):'')
          )
        ),

        // 3. 직전 경력
        (u.prevCareers&&u.prevCareers.length>0) && h('div', { style:sS },
          h('div', { style:tS }, '💼 3. 직전 경력'),
          u.prevCareers.map(function(c,i){
            return h('div', { key:i, style:rowS },
              h('span',{style:lblS},(c.startDate||'')+(c.endDate?' ~ '+c.endDate:'')),
              h('span',{style:valS},(c.company||'')+(c.duty?' / '+c.duty:'')+(c.reason?' ('+c.reason+')':'')));
          })
        ),

        // 4. 법정의무교육 — 연도별 기록
        h('div', { style:sS },
          h('div', { style:tS }, '📖 4. 법정의무교육 이수 현황 (연도별)'),
          h('div', { style:{fontSize:'10.5px', color:'#94a3b8', marginBottom:'12px'} }, '연도별로 이수 여부를 체크하고 날짜를 입력하세요. "+ 연도 추가" 로 과거 연도 기록을 소급 입력할 수 있습니다.'),

          TRAININGS.map(function(t){
            var arr = ed.trainingChecks[t.key] || [];
            // 당해 연도 행이 없으면 자동 추가
            if(!arr.find(function(r){return r.year===CUR_YEAR;})){
              arr = [{year:CUR_YEAR, done:false, date:''}].concat(arr);
            }
            arr = arr.slice().sort(function(a,b){return b.year-a.year;});
            var undone = arr.filter(function(r){return !r.done;}).length;

            return h('div', { key:t.key, style:{marginBottom:'10px', border:'1px solid #e5e7eb', borderRadius:'7px', overflow:'hidden'} },
              // 교육명 헤더 행
              h('div', { style:{display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 12px',
                background: undone===0&&arr.length>0?'#f0fdf4':'#f8fafc',
                borderBottom:'1px solid #e5e7eb'} },
                h('div', null,
                  h('span', { style:{fontSize:'12px', fontWeight:700, color:'#1e293b'} }, t.label),
                  h('span', { style:{fontSize:'10px', color:'#94a3b8', marginLeft:'8px'} }, t.law)
                ),
                h('div', { style:{display:'flex', alignItems:'center', gap:'8px'} },
                  undone > 0 && h('span', { style:{fontSize:'10px', color:'#dc2626', fontWeight:700,
                    background:'#fef2f2', padding:'2px 8px', borderRadius:'8px', border:'1px solid #fca5a5'} },
                    '미이수 '+undone+'년'),
                  undone === 0 && arr.length > 0 && h('span', { style:{fontSize:'10px', color:'#16a34a', fontWeight:700} }, '✔ 전년도 완료'),
                  h('button', { onClick:function(){addYear(t.key);},
                    style:{padding:'3px 10px', fontSize:'10.5px', background:'#eff6ff', color:'#1e40af',
                      border:'1px solid #bfdbfe', borderRadius:'4px', cursor:'pointer', fontWeight:600} },
                    '+ 연도 추가')
                )
              ),
              // 연도별 행
              h('table', { style:{width:'100%', borderCollapse:'collapse', fontSize:'11.5px'} },
                h('thead', null,
                  h('tr', { style:{background:'#f8fafc'} },
                    h('th', { style:{padding:'5px 12px', textAlign:'left', color:'#64748b', fontWeight:600, width:'80px', borderBottom:'1px solid #e5e7eb'} }, '연도'),
                    h('th', { style:{padding:'5px 12px', textAlign:'center', color:'#64748b', fontWeight:600, width:'70px', borderBottom:'1px solid #e5e7eb'} }, '이수'),
                    h('th', { style:{padding:'5px 12px', textAlign:'left', color:'#64748b', fontWeight:600, borderBottom:'1px solid #e5e7eb'} }, '이수일'),
                    h('th', { style:{padding:'5px 12px', textAlign:'center', color:'#64748b', fontWeight:600, width:'50px', borderBottom:'1px solid #e5e7eb'} }, '상태')
                  )
                ),
                h('tbody', null,
                  arr.map(function(r){
                    var isCur = r.year===CUR_YEAR;
                    return h('tr', { key:r.year, style:{background:r.done?'#f0fdf4':isCur?'#fef3c7':'#fff',
                      borderBottom:'1px solid #f1f5f9'} },
                      h('td', { style:{padding:'6px 12px', fontWeight:isCur?700:500, color:isCur?'#1e40af':'#1e293b'} },
                        r.year+'년'+(isCur?' (올해)':'')),
                      h('td', { style:{padding:'6px 12px', textAlign:'center'} },
                        h('input', { type:'checkbox', checked:!!r.done, onChange:setTrainingYear(t.key,r.year,'done'),
                          style:{width:'15px',height:'15px',cursor:'pointer',accentColor:'#16a34a'} })
                      ),
                      h('td', { style:{padding:'6px 12px'} },
                        h('input', { type:'date', value:r.date||'', onChange:setTrainingYear(t.key,r.year,'date'),
                          disabled:!r.done,
                          style:{padding:'4px 7px', border:'1px solid '+(r.done?'#86efac':'#e2e8f0'),
                            borderRadius:'4px', fontSize:'11.5px', background:r.done?'#fff':'#f8fafc',
                            color:r.done?'#1e293b':'#94a3b8', boxSizing:'border-box', width:'140px'} })
                      ),
                      h('td', { style:{padding:'6px 12px', textAlign:'center'} },
                        r.done
                          ? h('span',{style:{color:'#16a34a',fontSize:'11px',fontWeight:700}},'✔ 완료')
                          : h('span',{style:{color:'#ef4444',fontSize:'11px',fontWeight:700}},'✗ 미이수')
                      )
                    );
                  })
                )
              )
            );
          })
        ),

        // 5. 근로계약 이력
        contracts.length>0 && h('div', { style:sS },
          h('div', { style:tS }, '📝 5. 근로계약 이력 ('+contracts.length+'건)'),
          contracts.slice().sort(function(a,b){return (b.startDate||'').localeCompare(a.startDate||'');}).map(function(c,i){
            return h('div',{key:i,style:rowS},
              h('span',{style:lblS},(c.startDate||'')+(c.endDate?' ~ '+c.endDate:'')),
              h('span',{style:valS},(c.contractType||c.type||'')+(c.baseSalary?' / '+c.baseSalary.toLocaleString()+'원':'')+(c.status&&c.status!=='active'?' ('+c.status+')':'')));
          })
        ),

        // 6. 4대보험
        h('div', { style:sS },
          h('div', { style:tS }, '🛡️ 6. 4대보험'),
          row('국민연금', u.pensionNo?(u.pensionNo+(u.pensionAcquireDate?' (취득: '+u.pensionAcquireDate+')':'')):null),
          row('건강보험', u.healthNo?(u.healthNo+(u.healthAcquireDate?' (취득: '+u.healthAcquireDate+')':'')):null),
          row('고용보험', u.employmentNo?(u.employmentNo+(u.employmentAcquireDate?' (취득: '+u.employmentAcquireDate+')':'')):null),
          row('산재보험', u.injuryNo),
          row('부양가족', u.dependents!=null?(u.dependents+'명'):null)
        )
      ),
      h('div', { className:'modal-f' },
        h('button', { className:'btn-secondary', onClick:props.onClose }, '닫기'),
        h('button', { onClick:doPrint,
          style:{padding:'7px 14px', background:'#475569', color:'#fff', border:'none', borderRadius:'5px', fontSize:'12px', fontWeight:700, cursor:'pointer'} },
          '🖨️ 인쇄'),
        h('button', { onClick:doSave,
          style:{padding:'7px 16px', background:'#16a34a', color:'#fff', border:'none', borderRadius:'5px', fontSize:'12px', fontWeight:700, cursor:'pointer'} },
          '💾 저장')
      )
    )
  );
}

function StaffRoster(){
  var existing = dbGet('user_accounts', null);
  if(!existing){ if(fbSeedAllowed()){ dbSet('user_accounts', USERS_SEED); existing = USERS_SEED; } else { existing = USERS_SEED.slice(); } }
  var s = useState(existing); var users = s[0]; var setUsers = s[1];
  function persist(arr){ setUsers(arr); dbSet('user_accounts', arr); }

  // 입사예정자 자동 active 전환
  var todayStr = todayYMD();
  var autoActivated = (function(){
    var toActivate = existing.filter(function(u){
      return u.status==='scheduled' && u.hireDate && u.hireDate <= todayStr;
    });
    if(toActivate.length > 0){
      var updated = existing.map(function(u){
        return (u.status==='scheduled' && u.hireDate && u.hireDate <= todayStr)
          ? Object.assign({}, u, { status:'active' }) : u;
      });
      persist(updated);
      return toActivate;
    }
    return [];
  })();

  var stf = useState('active'); var statusTab = stf[0]; var setStatusTab = stf[1];
  var rtb = useState('all'); var roleTab = rtb[0]; var setRoleTab = rtb[1];
  var q = useState(''); var query = q[0]; var setQuery = q[1];
  var mo = useState(null); var modal = mo[0]; var setModal = mo[1];
  var dm = useState(null); var detailModal = dm[0]; var setDetailModal = dm[1];
  var rm = useState(null); var retireModal = rm[0]; var setRetireModal = rm[1];
  // 근로계약서 모달 / 인사기록카드 모달
  var cm = useState(null); var contractModal = cm[0]; var setContractModal = cm[1];
  var pc = useState(null); var cardModal = pc[0]; var setCardModal = pc[1];
  var ctx = useState(null); var ctxMenu = ctx[0]; var setCtxMenu = ctx[1];   // 우클릭 메뉴

  // 근로계약서 만료 임박 통계 (1개월 이내 만료)
  var contracts = dbGet('employment_contracts', []);
  var today = new Date();
  var oneMonthLater = new Date(); oneMonthLater.setMonth(oneMonthLater.getMonth()+1);
  var expiringContracts = contracts.filter(function(c){
    if(c.status !== 'active') return false;
    if(!c.endDate) return false;
    var ed = new Date(c.endDate);
    return ed >= today && ed <= oneMonthLater;
  });
  var contractsBySid = {};
  contracts.forEach(function(c){
    if(!contractsBySid[c.sid]) contractsBySid[c.sid] = [];
    contractsBySid[c.sid].push(c);
  });

  function openRetire(u){ setDetailModal(null); setRetireModal(u); }
  function saveRetire(data){
    persist(users.map(function(u){ return u.sid === data.sid ? data : u; }));
    setRetireModal(null);
    setStatusTab('retired');
    showToast(data.name + ' 퇴사 처리 완료');
  }

  // 휴직 자동연동(A): 오늘이 LOA(휴가관리 휴직) 기간이면 재직을 휴직으로 표시 — 데이터는 변경하지 않음
  function effStatus(u){ return (u && u.status==='active' && getLoaStatus(u.sid)) ? 'leave' : (u?u.status:''); }
  var activeCount    = users.filter(function(u){return effStatus(u)==='active';}).length;
  var leaveCount     = users.filter(function(u){return effStatus(u)==='leave';}).length;
  var standbyCount   = users.filter(function(u){return u.status==='standby';}).length;
  var retiredCount   = users.filter(function(u){return u.status==='retired';}).length;
  var scheduledCount = users.filter(function(u){return u.status==='scheduled';}).length;
  var lawyerCount   = users.filter(function(u){return effStatus(u)==='active' && (u.sid||'').startsWith('P-');}).length;
  var staffCount    = users.filter(function(u){return effStatus(u)==='active' && (u.sid||'').startsWith('A-');}).length;

  var filtered = users.filter(function(u){
    if(statusTab !== 'all' && effStatus(u) !== statusTab) return false;
    if(roleTab === 'lawyer' && !(u.sid||'').startsWith('P-')) return false;
    if(roleTab === 'staff'  && !(u.sid||'').startsWith('A-')) return false;
    if(query){
      var qq = query.toLowerCase();
      return (u.name||'').indexOf(query) >= 0
          || (u.title||'').indexOf(query) >= 0
          || (u.sid||'').toLowerCase().indexOf(qq) >= 0
          || (u.branch||'').indexOf(query) >= 0
          || (u.phone||'').indexOf(query) >= 0
          || (u.email||'').toLowerCase().indexOf(qq) >= 0;
    }
    return true;
  }).sort(function(a,b){
    // 환경설정 사용자관리와 동기화: sortOrder 우선, 같으면 sid 보조
    var so = (a.sortOrder||0) - (b.sortOrder||0);
    if(so !== 0) return so;
    return (a.sid||'').localeCompare(b.sid||'');
  });

  function openAdd(){
    // 사번 자동 생성
    var prefix = 'P';
    var maxP = 0, maxA = 0;
    users.forEach(function(u){
      var mp = (u.sid||'').match(/^P-(\d+)$/); if(mp) maxP = Math.max(maxP, parseInt(mp[1],10));
      var ma = (u.sid||'').match(/^A-(\d+)$/); if(ma) maxA = Math.max(maxA, parseInt(ma[1],10));
    });
    var newSidP = 'P-' + ('00'+(maxP+1)).slice(-3);
    setModal({ mode:'add', user:{ sid:newSidP, name:'', title:'노무사', role:'member', branch:'천안본사', status:'active',
      gender:'M', birthDate:'', nationality:'내국인',
      phone:'', homePhone:'', email:'',
      zipCode:'', address:'', addressDetail:'',
      emergencyContact:'', emergencyPhone:'',
      hireDate:'', probationEnd:'', retireDate:'', leaveReason:'', lastWorkDate:'', contractType:'정규직', contractEnd:'',
      baseSalary:0, bankName:'국민은행', accountNo:'', accountHolder:'',
      pensionNo:'', healthNo:'', employmentNo:'',
      education:'대졸', memo:'' }});
  }
  function openEdit(u){ setDetailModal(null); setModal({ mode:'edit', user:u }); }

  // ── 퇴사자 사번 T-번호 일괄 정리 (모든 저장소의 sid 일괄 교체, 같은 사람의 여러 옛 사번을 하나로 통합) ──
  function convertRetiredSids(){
    // 퇴직자 전원을 입사일 빠른 순으로 정렬해 T-001부터 다시 부여.
    // (입사일 빈 사람은 맨 뒤, 입사일 동률이면 이름순. 재직자 A-는 건드리지 않음.)
    var curUsers = dbGet('user_accounts', []) || [];
    var retired = curUsers.filter(function(u){ return u.status==='retired'; }).slice();
    retired.sort(function(a,b){
      var ha=a.hireDate||'9999-99-99', hb=b.hireDate||'9999-99-99';
      if(ha!==hb) return ha<hb?-1:1;
      return (a.name||'')<(b.name||'')?-1:((a.name||'')>(b.name||'')?1:0);
    });
    var sidMap = {};
    var tName = {};
    retired.forEach(function(u,i){
      var nt='T-'+('00'+(i+1)).slice(-3);
      tName[nt]=u.name;
      if(u.sid!==nt) sidMap[u.sid]=nt;
    });
    // 옛 급여데이터에만 남은 고아 사번(EMP-*, 옛 P- 등) → 같은 이름의 새 T (현재 누구도 안 쓰는 사번만)
    var heldSids = {};
    curUsers.forEach(function(u){ if(u.sid) heldSids[u.sid]=1; });
    var nameToNewT = {};
    retired.forEach(function(u,i){ nameToNewT[u.name]='T-'+('00'+(i+1)).slice(-3); });
    (dbGet('payroll_monthly', []) || []).forEach(function(r){
      var sx = r.empSid;
      if(sx && !heldSids[sx] && !sidMap[sx] && r.empName && nameToNewT[r.empName]){
        sidMap[sx] = nameToNewT[r.empName];
      }
    });
    // 미리보기용 MAP 재구성 (새 T사번별로 묶음, 입사일 순)
    var byNew = {};
    Object.keys(sidMap).forEach(function(o){ (byNew[sidMap[o]]=byNew[sidMap[o]]||[]).push(o); });
    var MAP = Object.keys(byNew).sort(function(a,b){ return parseInt(a.split('-')[1],10)-parseInt(b.split('-')[1],10); }).map(function(t){
      return { name:tName[t]||'', newSid:t, oldSids:byNew[t] };
    });
    var oldList = Object.keys(sidMap);
    if(oldList.length===0){ showToast('이미 입사일 순으로 정리됨 (변경 없음)'); return; }
    // 영향 건수 집계 (미리보기)
    
    var fi = dbGet('finance_income', []) || [];
    var pay = dbGet('payroll_monthly', []) || [];
    var ot = dbGet('overtime_records', []) || [];
    var att = dbGet('attendance_records', []) || [];
    var cnt = { 직원계정:0, 성과입금:0, 급여:0, 근태:0, 업체사건:0 };
    curUsers.forEach(function(u){ if(sidMap[u.sid]) cnt.직원계정++; });
    fi.forEach(function(x){ if(sidMap[x.managerSid]||(x.perfShares||[]).some(function(p){return sidMap[p.sid];})) cnt.성과입금++; });
    pay.forEach(function(x){ if(sidMap[x.empSid]) cnt.급여++; });
    ot.forEach(function(x){ if(sidMap[x.sid]) cnt.근태++; });
    att.forEach(function(x){ if(sidMap[x.sid]) cnt.근태++; });
    ['companies','cases','consultings','funds','other_projects'].forEach(function(k){
      (dbGet(k,[])||[]).forEach(function(x){ if(sidMap[x.managerMain]||(x.managerSubs||[]).some(function(s){return sidMap[s];})) cnt.업체사건++; });
    });
    var preview = MAP.filter(function(m){return m.oldSids.length>0;}).map(function(m){ return '· '+m.name+': '+m.oldSids.join(', ')+' → '+m.newSid; }).join('\n');
    showConfirm('[퇴사자 사번 T-정리]\n\n'+preview+'\n\n영향: 직원계정 '+cnt.직원계정+' / 성과·입금 '+cnt.성과입금+' / 급여 '+cnt.급여+' / 근태 '+cnt.근태+' / 업체·사건 '+cnt.업체사건+'건\n\n모든 저장소의 사번을 일괄 교체합니다. (변경 전 콘솔에 백업 출력)\n진행할까요?',
      { title:'퇴사자 사번 정리', confirmText:'일괄 변환', danger:true }).then(function(ok){
      if(!ok) return;
      try {
        console.log('[사번정리 백업] user_accounts', JSON.stringify(curUsers));
        console.log('[사번정리 백업] finance_income', JSON.stringify(fi));
        console.log('[사번정리 백업] payroll_monthly', JSON.stringify(pay));
        console.log('[사번정리 백업] overtime_records', JSON.stringify(ot));
        console.log('[사번정리 백업] attendance_records', JSON.stringify(att));
        ['companies','cases','consultings','funds','other_projects'].forEach(function(k){ console.log('[사번정리 백업] '+k, JSON.stringify(dbGet(k,[]))); });
      } catch(_){}
      // 1) user_accounts
      dbSet('user_accounts', curUsers.map(function(u){ return sidMap[u.sid] ? Object.assign({}, u, { sid:sidMap[u.sid] }) : u; }));
      // 2) finance_income (managerSid·perfShares·managerSidAtRecord·managerSidCurrent)
      dbSet('finance_income', fi.map(function(x){
        var n = Object.assign({}, x);
        if(sidMap[n.managerSid]) n.managerSid = sidMap[n.managerSid];
        if(sidMap[n.managerSidAtRecord]) n.managerSidAtRecord = sidMap[n.managerSidAtRecord];
        if(sidMap[n.managerSidCurrent]) n.managerSidCurrent = sidMap[n.managerSidCurrent];
        if(n.perfShares) n.perfShares = n.perfShares.map(function(p){ return sidMap[p.sid] ? Object.assign({}, p, { sid:sidMap[p.sid] }) : p; });
        return n;
      }));
      // 3) payroll_monthly (empSid)
      dbSet('payroll_monthly', pay.map(function(x){ return sidMap[x.empSid] ? Object.assign({}, x, { empSid:sidMap[x.empSid] }) : x; }));
      // 4) overtime_records / attendance_records (sid)
      dbSet('overtime_records', ot.map(function(x){ return sidMap[x.sid] ? Object.assign({}, x, { sid:sidMap[x.sid] }) : x; }));
      dbSet('attendance_records', att.map(function(x){ return sidMap[x.sid] ? Object.assign({}, x, { sid:sidMap[x.sid] }) : x; }));
      // 5) 업체·사건·컨설팅·기금·기타 (managerMain, managerSubs)
      ['companies','cases','consultings','funds','other_projects'].forEach(function(k){
        var arr = dbGet(k,[]) || [];
        dbSet(k, arr.map(function(x){
          var n = Object.assign({}, x);
          if(sidMap[n.managerMain]) n.managerMain = sidMap[n.managerMain];
          if(n.managerSubs) n.managerSubs = n.managerSubs.map(function(s){ return sidMap[s] || s; });
          return n;
        }));
      });
      showToast('✅ 퇴사자 사번 정리 완료 — 모든 데이터 갱신됨');
      setTimeout(function(){ try{ location.reload(); }catch(_){} }, 1200);
    });
  }

  // ── 급여대장 엑셀 가져오기 (안전: 빈 칸만 채움 / 주민번호·이름 매칭 / 핵심 계정정보 불변) ──
  // 매칭 우선순위: ① 주민번호(숫자) ② 이름. 기존 직원은 hireDate·rrn이 비어있을 때만 채움(덮어쓰기 안 함).
  // 신규(매칭 안 됨)는 status=retired 가정 없이 추가하지 않고, 별도 표시만 — 단 사용자가 올린 명단의 '퇴직' 표시는 신규 추가.
  function importPayrollStaff(e){
    var file = e.target.files && e.target.files[0]; if(!file) return;
    if(typeof XLSX === 'undefined'){ showToast('엑셀 모듈 로딩중'); return; }
    var reader = new FileReader();
    reader.onload = function(ev){
      try {
        var wb = XLSX.read(ev.target.result, { type:'array' });
        // 입력표 시트(이름/계정ID/입사일/주민등록번호/상태/퇴사일) 또는 첫 시트
        var sn = wb.SheetNames.indexOf('근로자명부 입력') >= 0 ? '근로자명부 입력' : wb.SheetNames[0];
        var ws = wb.Sheets[sn];
        var data = XLSX.utils.sheet_to_json(ws, { header:1, defval:'' });
        var hi = data.findIndex(function(row){ return row.some(function(x){ return String(x).indexOf('주민')>=0; }) && row.some(function(x){ return String(x).indexOf('입사')>=0; }); });
        if(hi<0){ showToast('⚠️ 헤더(이름·입사일·주민) 행 없음'); e.target.value=''; return; }
        var hdr = data[hi].map(function(x){ return String(x).trim(); });
        function col(ns){ for(var i=0;i<hdr.length;i++){ for(var j=0;j<ns.length;j++){ if(hdr[i].indexOf(ns[j])>=0) return i; } } return -1; }
        var cName=col(['이름','성명']), cRrn=col(['주민']), cHire=col(['입사']), cStatus=col(['상태']), cRetire=col(['퇴사','퇴직일']);
        if(cName<0 || cRrn<0){ showToast('⚠️ 이름·주민번호 컬럼 없음'); e.target.value=''; return; }
        function digits(x){ return String(x||'').replace(/[^0-9]/g,''); }
        function fmtDate(x){ var s=String(x||'').trim().replace(' 00:00:00',''); return s ? s.slice(0,10) : ''; }
        // 백업 (콘솔에 1회 출력 — 만약 문제 시 복구용)
        try { console.log('[근로자명부 가져오기 백업]', JSON.stringify(users)); } catch(_){}
        var arr = users.map(function(u){ return Object.assign({}, u); });
        var byRrn = {}, byName = {};
        arr.forEach(function(u){ var d=digits(u.rrn); if(d) byRrn[d]=u; if(u.name) byName[u.name.trim()]=u; });
        var maxA = 0;
        arr.forEach(function(u){ var m=/^A-(\d+)$/.exec(u.sid||''); if(m){ var n=parseInt(m[1],10); if(n>maxA) maxA=n; } });
        var filled=0, added=0, skipped=0;
        for(var r=hi+1;r<data.length;r++){
          var row=data[r]; if(!row||!row.length) continue;
          var nm=cName>=0?String(row[cName]||'').trim():'';
          if(!nm || nm.charAt(0)==='【') continue;       // 섹션 헤더 행 스킵
          var rrn=cRrn>=0?String(row[cRrn]||'').trim():'';
          var rrnD=digits(rrn);
          var hire=cHire>=0?fmtDate(row[cHire]):'';
          var statusTxt=cStatus>=0?String(row[cStatus]||'').trim():'';
          var retire=cRetire>=0?fmtDate(row[cRetire]):'';
          var isRetired = statusTxt.indexOf('퇴')>=0;
          // 매칭: 주민 우선, 없으면 이름
          var hit = (rrnD && byRrn[rrnD]) ? byRrn[rrnD] : byName[nm];
          if(hit){
            // 기존 직원: 빈 칸만 채움 (덮어쓰기 금지)
            var did=false;
            if(hire && !hit.hireDate){ hit.hireDate=hire; did=true; }
            if(rrn && !hit.rrn){ hit.rrn=rrn; did=true; }
            if(isRetired){
              if(hit.status!=='retired'){ hit.status='retired'; did=true; }
              if(retire && !hit.retireDate){ hit.retireDate=retire; did=true; }
            }
            if(did) filled++; else skipped++;
          } else {
            // 신규: 명단에서 '퇴직'으로 표시된 경우에만 추가 (재직 신규는 권한 영향 커서 수동 등록 권장)
            if(isRetired){
              maxA++;
              arr.push({
                sid:'A-'+('00'+maxA).slice(-3), name:nm, title:'직원', role:'staff', branch:'천안본사',
                status:'retired', gender:'', birthDate:'', rrn:rrn, nationality:'내국인',
                phone:'', homePhone:'', email:'', zipCode:'', address:'', addressDetail:'',
                emergencyContact:'', emergencyPhone:'',
                hireDate:hire, probationEnd:'', retireDate:retire, leaveReason:'', lastWorkDate:retire,
                contractType:'정규직', contractEnd:'',
                baseSalary:0, bankName:'', accountNo:'', accountHolder:'',
                pensionNo:'', healthNo:'', employmentNo:'', education:'', memo:'급여대장 가져오기 — 퇴사일 임시',
                loginId:'', loginPw:'', sortOrder:900+maxA
              });
              added++;
            } else {
              skipped++;
            }
          }
        }
        persist(arr);
        showToast('📥 근로자명부: 빈칸 채움 '+filled+'명 / 퇴사자 신규 '+added+'명 / 변경없음 '+skipped+'명');
      } catch(err){ showToast('가져오기 실패: '+(err&&err.message)); }
      e.target.value='';
    };
    reader.readAsArrayBuffer(file);
  }
  function save(data, opts){
    if(modal.mode === 'add'){
      persist(users.concat([data]));
    } else {
      persist(users.map(function(u){ return u.sid === data.sid ? data : u; }));
    }
    if(opts && opts.keepOpen){
      // 단계별 저장: 모달 유지 + 다음 탭으로 전환 (편집 모드로 전환해 다음 저장도 update 처리)
      setModal({ mode:'edit', user:data, initialTab: opts.nextTab });
    } else {
      setModal(null);
      showToast(modal.mode==='add' ? '등록 완료' : '수정 완료');
    }
  }
  // 사번이 다른 데이터(급여·근태·성과·업체)에 연결돼 있는지 집계 — 오입력(빈 레코드) 판별용
  function countSidRefs(sid){
    var pay = (dbGet('payroll_monthly', []) || []).filter(function(x){ return x.empSid === sid; }).length;
    var ot  = (dbGet('overtime_records', []) || []).filter(function(x){ return x.sid === sid; }).length;
    var att = (dbGet('attendance_records', []) || []).filter(function(x){ return x.sid === sid; }).length;
    var fi  = (dbGet('finance_income', []) || []).filter(function(x){
      return x.managerSid === sid || (x.perfShares || []).some(function(p){ return p.sid === sid; });
    }).length;
    var biz = 0;
    ['companies','cases','consultings','funds','other_projects'].forEach(function(k){
      (dbGet(k, []) || []).forEach(function(x){
        if(x.managerMain === sid || (x.managerSubs || []).some(function(s){ return s === sid; })) biz++;
      });
    });
    return { 급여:pay, 근태:ot + att, 성과입금:fi, 업체사건:biz };
  }
  async function del(sid){
    var victim = users.find(function(u){ return u.sid === sid; });
    var nm = (victim && victim.name) || sid;
    var r = countSidRefs(sid);
    var total = r.급여 + r.근태 + r.성과입금 + r.업체사건;
    var warn = total > 0
      ? '\n⚠ 연결된 데이터: 급여 ' + r.급여 + ' · 근태 ' + r.근태 + ' · 성과/입금 ' + r.성과입금 + ' · 업체/사건 ' + r.업체사건 + '건\n(데이터는 지워지지 않고 사번만 사라져 고아 데이터가 됩니다)\n'
      : '\n연결된 데이터 없음 — 안전하게 삭제 가능\n';
    if(!(await popConfirm(nm + ' (' + sid + ') 삭제하시겠습니까?\n' + warn + '명부에서만 제거됩니다.'))) return;
    var _backup = users.slice();
    persist(users.filter(function(u){ return u.sid !== sid; }));
    setDetailModal(null);
    showToastUndo('🗑 ' + nm + ' 삭제됨', function(){ persist(_backup); });
  }
  async function reinstate(sid){
    if(!(await popConfirm('재직으로 복귀시키겠습니까?'))) return;
    persist(users.map(function(u){ return u.sid === sid ? Object.assign({}, u, { status:'active', retireDate:'', leaveReason:'' }) : u; }));
    setDetailModal(null);
    showToast('재직 복귀됨');
  }

  var contractColor = { '정규직':'#1e40af', '계약직':'#854d0e', '파트타임':'#059669', '일용직':'#1e40af' };
  var contractBg    = { '정규직':'#eff6ff', '계약직':'#fef3c7', '파트타임':'#dcfce7', '일용직':'#ede9fe' };

  return h('div', { className:'page' },
    // KPI — 4열 2행 grid (모바일/PC 공통)
    h('div', { className:'staff-kpi', style:{ display:'grid', gridTemplateColumns:'repeat(6, 1fr)', gap:'4px', marginBottom:'8px' } },
        [
          { bg:'#dcfce7', bd:'#bbf7d0', fg:'#166534', label:'✓ 재직', val:activeCount, sub:'명', fn:function(){setStatusTab('active');setRoleTab('all');} },
          { bg:'#fff7ed', bd:'#fed7aa', fg:'#9a3412', label:'🏠 휴직', val:leaveCount, sub:'명', fn:function(){setStatusTab('leave');setRoleTab('all');} },
          { bg:'#fee2e2', bd:'#fecaca', fg:'#dc2626', label:'퇴직', val:retiredCount, sub:'명', fn:function(){setStatusTab('retired');setRoleTab('all');} },
          { bg:'#f0fdf4', bd:'#86efac', fg:'#15803d', label:'📅 입사예정', val:scheduledCount, sub:'명', fn:function(){setStatusTab('scheduled');setRoleTab('all');} },
          { bg:'#faf5ff', bd:'#e9d5ff', fg:'#2563eb', label:'⚖️ 노무사', val:lawyerCount, sub:'재직', fn:function(){setStatusTab('active');setRoleTab('lawyer');} },
          { bg:'#fff7ed', bd:'#fed7aa', fg:'#c2410c', label:'🗂️ 직원', val:staffCount, sub:'재직', fn:function(){setStatusTab('active');setRoleTab('staff');} }
        ].map(function(k,i){
          return h('div', { key:i, onClick:k.fn||undefined,
            style:{ background:k.bg, border:'1px solid '+k.bd,
              borderRadius:'6px', padding:'6px 5px', cursor:k.fn?'pointer':'default', textAlign:'center' } },
            h('div', { style:{ fontSize:'10.5px', color:k.fg, fontWeight:700, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', marginBottom:'1px' } }, k.label),
            h('div', { style:{ fontSize:'14px', fontWeight:800, color:k.fg, lineHeight:1.1 } }, k.val),
            h('div', { style:{ fontSize:'10px', color:k.fg, opacity:0.75 } }, k.sub)
          );
        })
      ),

    // 📅 입사예정 → 재직 자동전환 알림
    autoActivated.length > 0 && h('div', {
      style:{ marginBottom:'12px', background:'#dcfce7', border:'1px solid #86efac',
        borderRadius:'8px', padding:'10px 16px', display:'flex', alignItems:'center', gap:'10px' } },
      h('span', { style:{ fontSize:'13px', fontWeight:700, color:'#15803d' } }, '✅ 입사 처리 완료'),
      h('span', { style:{ fontSize:'12px', color:'#166534' } },
        autoActivated.map(function(u){ return u.name; }).join(', ') +
        ' — 입사일(' + autoActivated[0].hireDate + ') 도래로 재직 상태로 자동 전환되었습니다.')
    ),

    // ⏰ 근로계약 만료 임박 알림 (1개월 이내)
    expiringContracts.length > 0 && h('div', {
      style:{ marginBottom:'14px', background:'#fff7ed', border:'1px solid #fed7aa',
        borderRadius:'8px', padding:'12px 18px' } },
      h('div', { style:{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'8px' } },
        h('div', { style:{ fontSize:'13px', fontWeight:700, color:'#9a3412' } }, '⏰ 근로계약 만료 임박'),
        h('div', { style:{ fontSize:'10.5px', color:'#9a3412' } },
          expiringContracts.length + '건 · 1개월 이내 · 갱신 여부 확인 필요')),
      h('div', { style:{ display:'flex', gap:'6px', flexWrap:'wrap' } },
        expiringContracts.slice(0,10).map(function(c){
          var u = users.find(function(x){return x.sid===c.sid;});
          var dleft = Math.ceil((new Date(c.endDate) - today) / 86400000);
          return h('div', { key:c.id,
            onClick:function(){ if(u) setContractModal(u); },
            style:{ cursor:'pointer', padding:'6px 12px',
              background:'#fff', color:'#9a3412', border:'1px solid #fed7aa',
              borderRadius:'5px', fontSize:'11.5px', fontWeight:600,
              display:'inline-flex', gap:'8px', alignItems:'center' } },
            h('span', { style:{ fontWeight:700 } }, (u?u.name:c.sid)),
            h('span', { style:{ fontSize:'10.5px', color:'#78350f' } }, c.endDate),
            h('span', { style:{ background:'#dc2626', color:'#fff', padding:'1px 6px',
              borderRadius:'8px', fontSize:'10px', fontWeight:700 } }, 'D-'+dleft));
        })
      )
    ),

    // 🗓️ 고용계약 종료일 D-day 알림 (계약직·파트타임 contractEnd 60일 이내)
    (function(){
      var sixtyLater = new Date(); sixtyLater.setDate(sixtyLater.getDate()+60);
      var expEmp = users.filter(function(u){
        if(u.status !== 'active') return false;
        if(!u.contractEnd) return false;
        if(u.contractType === '정규직') return false;
        var ed = new Date(u.contractEnd);
        return ed >= today && ed <= sixtyLater;
      }).map(function(u){
        var d = Math.ceil((new Date(u.contractEnd) - today) / 86400000);
        return Object.assign({}, u, { _daysLeft: d });
      }).sort(function(a,b){ return a._daysLeft - b._daysLeft; });
      if(expEmp.length === 0) return null;
      return h('div', { style:{ marginBottom:'14px', background:'#fef3c7', border:'1px solid #fde68a', borderRadius:'8px', padding:'12px 18px' } },
        h('div', { style:{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'8px' } },
          h('div', { style:{ fontSize:'13px', fontWeight:700, color:'#854d0e' } }, '🗓️ 고용계약 만료 예정 직원'),
          h('div', { style:{ fontSize:'10.5px', color:'#854d0e' } }, expEmp.length + '명 · 60일 이내 · 갱신/종료 확인 필요')),
        h('div', { style:{ display:'flex', gap:'6px', flexWrap:'wrap' } },
          expEmp.map(function(u){
            var d = u._daysLeft;
            var badge = d <= 7 ? '#dc2626' : d <= 30 ? '#ea580c' : '#d97706';
            return h('div', { key:u.sid,
              onClick:function(){ setDetailModal(u); },
              style:{ cursor:'pointer', padding:'6px 12px', background:'#fff',
                color:'#854d0e', border:'1px solid #fde68a', borderRadius:'5px',
                fontSize:'11.5px', fontWeight:600, display:'inline-flex', gap:'8px', alignItems:'center' } },
              h('span', { style:{ fontWeight:700 } }, u.name),
              h('span', { style:{ fontSize:'10px', color:'#92400e' } }, u.contractType + ' · ' + u.contractEnd),
              h('span', { style:{ background:badge, color:'#fff', padding:'1px 6px', borderRadius:'8px', fontSize:'10px', fontWeight:700 } }, 'D-'+d));
          })
        )
      );
    })(),

    // 📅 입사예정 D-day 알림 (30일 이내)
    (function(){
      var today2 = new Date(); today2.setHours(0,0,0,0);
      var upcoming = users.filter(function(u){
        if(u.status !== 'scheduled' || !u.hireDate) return false;
        var hd = new Date(u.hireDate);
        var diff = Math.round((hd - today2)/(1000*60*60*24));
        return diff >= 0 && diff <= 30;
      }).map(function(u){
        var hd = new Date(u.hireDate);
        var diff = Math.round((hd - today2)/(1000*60*60*24));
        return { u:u, diff:diff };
      }).sort(function(a,b){ return a.diff - b.diff; });
      if(!upcoming.length) return null;
      return h('div', { style:{ marginBottom:'14px', background:'#f0fdf4', border:'1px solid #86efac', borderRadius:'8px', padding:'12px 18px' } },
        h('div', { style:{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'8px' } },
          h('div', { style:{ fontSize:'13px', fontWeight:700, color:'#15803d' } }, '📅 입사 예정자 (30일 이내)'),
          h('div', { style:{ fontSize:'10.5px', color:'#166534' } }, upcoming.length + '명 · 입사일 임박')),
        h('div', { style:{ display:'flex', gap:'8px', flexWrap:'wrap' } },
          upcoming.map(function(item){
            return h('div', { key:item.u.sid,
              onClick:function(){ setDetailModal(item.u); },
              style:{ cursor:'pointer', padding:'6px 14px', background:'#fff', color:'#15803d',
                border:'1px solid #86efac', borderRadius:'6px', fontSize:'11.5px', fontWeight:600,
                display:'inline-flex', gap:'8px', alignItems:'center' } },
              h('span', { style:{ fontWeight:700 } }, item.u.name),
              h('span', { style:{ fontSize:'10.5px', color:'#64748b' } }, item.u.hireDate),
              h('span', { style:{ background: item.diff===0?'#16a34a':'#22c55e', color:'#fff',
                padding:'1px 6px', borderRadius:'8px', fontSize:'10px', fontWeight:700 } },
                item.diff === 0 ? 'D-Day' : 'D-'+item.diff));
          })
        )
      );
    })(),

    // 툴바 — 모바일 compact
    window.innerWidth <= 768
    ? h('div', { style:{ display:'flex', flexDirection:'column', gap:'6px', marginBottom:'10px' } },
        // 검색 + 등록
        h('div', { style:{ display:'flex', gap:'6px' } },
          h('div', { style:{ position:'relative', flex:1 } },
            h('input', { placeholder:'🔍 이름·사번·직책', value:query,
              onChange:function(e){ setQuery(e.target.value); },
              style:{ width:'100%', fontSize:'14px', padding:'9px 12px', paddingRight:query?'50px':'12px',
                border:'1px solid #cbd5e1', borderRadius:'8px', boxSizing:'border-box' } }),
            query && h('button', { onClick:function(){ setQuery(''); },
              style:{ position:'absolute', right:'6px', top:'50%', transform:'translateY(-50%)',
                background:'#f1f5f9', color:'#475569', border:'none', borderRadius:'10px',
                fontSize:'10px', fontWeight:700, padding:'2px 7px', cursor:'pointer' } },
              filtered.length + '×')
          ),
          h('button', { onClick:openAdd,
            style:{ padding:'9px 12px', background:'#1e40af', color:'#fff', border:'none',
              borderRadius:'8px', fontSize:'12px', fontWeight:700, cursor:'pointer', flexShrink:0 } }, '+ 등록')
        ),
        // 상태탭 + 역할탭 가로 스크롤
        h('div', { style:{ display:'flex', gap:'4px', overflowX:'auto', WebkitOverflowScrolling:'touch', paddingBottom:'2px', alignItems:'center' } },
          h('div', { style:{ display:'inline-flex', gap:'3px', flexShrink:0, background:'#f1f5f9', borderRadius:'8px', padding:'2px' } },
            [{v:'active',label:'재직'},{v:'leave',label:'🏠 휴직'},{v:'retired',label:'퇴직'},{v:'all',label:'전체'}].map(function(t){
              var on = statusTab === t.v;
              return h('button', { key:t.v, onClick:function(){ setStatusTab(t.v); },
                style:{ padding:'5px 10px', borderRadius:'6px', fontSize:'11px', cursor:'pointer', fontWeight:on?700:500,
                  background:on?'#1e40af':'transparent', color:on?'#fff':'#64748b', border:'none', whiteSpace:'nowrap' } }, t.label);
            })
          ),
          h('div', { style:{ width:'1px', height:'20px', background:'#e2e8f0', flexShrink:0 } }),
          [{v:'all',label:'전체'},{v:'lawyer',label:'⚖️ 노무사'},{v:'staff',label:'🗂️ 직원'}].map(function(t){
            var on = roleTab === t.v;
            return h('button', { key:t.v, onClick:function(){ setRoleTab(t.v); },
              style:{ padding:'5px 10px', borderRadius:'20px', fontSize:'11px', cursor:'pointer', fontWeight:on?700:500,
                background:on?'#475569':'#f8fafc', color:on?'#fff':'#64748b',
                border:'1px solid '+(on?'#475569':'#e2e8f0'), flexShrink:0, whiteSpace:'nowrap' } }, t.label);
          })
        )
      )
    : h('div', null,
        h('div', { style:{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'6px' } },
          h('div', { style:{ display:'flex', gap:'4px' } },
            [{v:'active',label:'재직 ('+activeCount+')'},{v:'leave',label:'🏠 휴직 ('+leaveCount+')'},{v:'retired',label:'퇴직 ('+retiredCount+')'},{v:'all',label:'전체 ('+users.length+')'}].map(function(t){
              var on = statusTab === t.v;
              return h('button', { key:t.v, onClick:function(){ setStatusTab(t.v); },
                style:{ padding:'6px 16px', borderRadius:'6px', fontSize:'12px', cursor:'pointer', fontWeight:on?700:500,
                  background:on?'#1e40af':'#fff', color:on?'#fff':'#475569', border:'1px solid '+(on?'#1e40af':'#cbd5e1') } }, t.label);
            })
          ),
          h('input', { className:'dt-search', placeholder:'🔍 이름·사번·직책·연락처·이메일 검색',
            value:query, onChange:function(e){ setQuery(e.target.value); }, style:{ width:'260px' } }),
          h('div', { style:{ flex:1 } }),
          h('label', { style:{ background:'#eff6ff', color:'#1d4ed8', border:'1px solid #bfdbfe', padding:'7px 12px', borderRadius:'6px', fontSize:'12px', fontWeight:600, cursor:'pointer', whiteSpace:'nowrap', marginRight:'6px' } },
            '📥 급여대장 가져오기', h('input', { type:'file', accept:'.xlsx,.xls', onChange:importPayrollStaff, style:{ display:'none' } })),
          h('button', { onClick:convertRetiredSids,
            style:{ background:'#fff', color:'#b45309', border:'1px solid #fed7aa', padding:'7px 12px', borderRadius:'6px', fontSize:'12px', fontWeight:600, cursor:'pointer', whiteSpace:'nowrap', marginRight:'6px' } }, '🔖 퇴사자 사번정리(T-)'),
          h('button', { className:'btn-primary', onClick:openAdd }, '+ 근로자 등록')
        ),
        h('div', { style:{ display:'flex', gap:'4px', marginBottom:'12px' } },
          [{v:'all',label:'전체'},{v:'lawyer',label:'⚖️ 노무사 (P-)'},{v:'staff',label:'🗂️ 직원 (A-)'}].map(function(t){
            var on = roleTab === t.v;
            return h('button', { key:t.v, onClick:function(){ setRoleTab(t.v); },
              style:{ padding:'4px 14px', borderRadius:'5px', fontSize:'11.5px', cursor:'pointer', fontWeight:on?700:400,
                background:on?'#475569':'#f8fafc', color:on?'#fff':'#64748b', border:'1px solid '+(on?'#475569':'#e2e8f0') } }, t.label);
          })
        )
      ),
    // 테이블 — 모바일 카드뷰 / PC 기존
    window.innerWidth <= 768
    ? h('div', { style:{ display:'flex', flexDirection:'column', gap:'6px' } },
        filtered.length === 0
          ? h('div', { style:{ textAlign:'center', color:'#94a3b8', padding:'40px', fontSize:'12px' } }, '등록된 데이터가 없습니다')
          : filtered.map(function(u, idx){
              var es = effStatus(u);
              var stColor = es==='leave'?'#ea580c':es==='retired'?'#dc2626':es==='scheduled'?'#16a34a':'#1e40af';
              var stBg = es==='leave'?'#ffedd5':es==='retired'?'#fee2e2':es==='scheduled'?'#dcfce7':'#dbeafe';
              var stLabel = es==='leave'?'🏠 휴직':es==='retired'?'퇴직':es==='scheduled'?'📅 입사예정':'재직';
              var isLawyer = u.sid && u.sid.startsWith('P-');
              return h('div', { key:u.sid, onClick:function(){ setDetailModal(u); },
                style:{ background:'#fff', border:'1px solid #e2e8f0',
                  borderLeft:'4px solid '+stColor,
                  borderRadius:'8px', padding:'10px 12px', cursor:'pointer',
                  boxShadow:'0 1px 3px rgba(0,0,0,0.05)' } },
                h('div', { style:{ display:'flex', alignItems:'center', gap:'6px', marginBottom:'4px' } },
                  h('span', { style:{ fontWeight:800, color:'#fff', fontSize:'10px', background:'#475569',
                    borderRadius:'4px', padding:'1px 5px', flexShrink:0 } }, idx+1),
                  h('span', { style:{ fontFamily:'monospace', fontSize:'11px', color:'#64748b', flexShrink:0 } }, u.sid),
                  h('span', { style:{ fontSize:'10px', background: isLawyer?'#faf5ff':'#fff7ed',
                    color: isLawyer?'#2563eb':'#c2410c', padding:'1px 7px', borderRadius:'10px', fontWeight:700, flexShrink:0 } },
                    isLawyer?'⚖️ 노무사':'🗂️ 직원'),
                  h('span', { style:{ fontSize:'10px', background:stBg, color:stColor,
                    padding:'1px 7px', borderRadius:'10px', fontWeight:700, marginLeft:'auto', flexShrink:0 } }, stLabel)
                ),
                h('div', { style:{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'3px' } },
                  h('span', { style:{ fontWeight:800, fontSize:'14px', color:'#1e293b' } }, u.name),
                  h('span', { style:{ fontSize:'12px', color:'#475569' } }, u.title||''),
                  u.branch && h('span', { style:{ fontSize:'11px', color:'#94a3b8' } }, '· '+u.branch)
                ),
                h('div', { style:{ display:'flex', gap:'10px', fontSize:'11.5px', color:'#64748b' } },
                  h('span', null, u.hireDate ? '입사 '+u.hireDate : ''),
                  u.status==='retired' && u.retireDate && h('span', { style:{color:'#dc2626'} }, '퇴직 '+u.retireDate)
                )
              );
            })
      )
    : h('div', { style:{ overflow:'auto', background:'#fff', border:'1px solid #e5e7eb', borderRadius:'6px' } },
      h('table', { className:'dt' },
        h('thead', null, h('tr', null,
          h('th', { className:'ac', style:{ width:'36px' } }, 'No'),
          h('th', null, '사번'),
          h('th', null, '이름'),
          h('th', null, '직책'),
          h('th', null, '지사'),
          h('th', null, '연락처'),
          h('th', null, '이메일'),
          h('th', null, '주소'),
          h('th', null, '입사일'),
          statusTab === 'retired' && h('th', null, '퇴직일'),
          h('th', null, '고용형태'),
          h('th', { className:'ar' }, '기본급'),
          h('th', { className:'ac' }, '관리')
        )),
        h('tbody', null,
          filtered.length === 0
            ? h('tr', null, h('td', { colSpan:13, className:'ac', style:{ color:'#94a3b8', padding:'40px' } }, '등록된 데이터가 없습니다'))
            : filtered.map(function(u, idx){
                return h('tr', { key:u.sid, style:{ cursor:'pointer' },
                  onClick:function(){ setDetailModal(u); },
                  onContextMenu:function(ev){ ev.preventDefault(); setCtxMenu({ x:ev.clientX, y:ev.clientY, item:u }); } },
                  h('td', { className:'ac', style:{ color:'#94a3b8', fontSize:'11px', fontWeight:500 } }, idx+1),
                  h('td', { style:{ fontFamily:'monospace', fontWeight:700, fontSize:'11.5px', color:'#475569' } }, u.sid),
                  h('td', { style:{ fontWeight:700, color:'#1e293b' } }, u.name,
                    effStatus(u)==='leave' && h('span', {
                      style:{marginLeft:'6px',padding:'1px 6px',borderRadius:'8px',background:'#ffedd5',color:'#9a3412',fontSize:'10.5px',fontWeight:700,verticalAlign:'middle'}
                    }, '🏠 휴직'),
                    u.status==='retired' && h('span', {
                      style:{marginLeft:'6px',padding:'1px 6px',borderRadius:'8px',background:'#fee2e2',color:'#991b1b',fontSize:'10.5px',fontWeight:700,verticalAlign:'middle'}
                    }, '퇴직'),
                    u.status==='scheduled' && h('span', {
                      style:{marginLeft:'6px',padding:'1px 6px',borderRadius:'8px',background:'#dcfce7',color:'#15803d',fontSize:'10.5px',fontWeight:700,verticalAlign:'middle'}
                    }, '📅 입사예정')),
                  h('td', null, u.title||'-'),
                  h('td', { style:{ fontSize:'12px' } }, u.branch||'-'),
                  h('td', { style:{ fontSize:'12px' } }, u.phone||'-'),
                  h('td', { style:{ fontSize:'12px', color:'#475569' } }, u.email||'-'),
                  h('td', { style:{ fontSize:'11.5px', color:'#475569', maxWidth:'140px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' } },
                    u.address ? (u.address + (u.addressDetail ? ' '+u.addressDetail : '')) : '-'),
                  h('td', { style:{ fontFamily:'monospace', fontSize:'11.5px' } }, u.hireDate||'-'),
                  statusTab === 'retired' && h('td', { style:{ fontFamily:'monospace', fontSize:'11.5px', color:'#dc2626' } }, u.retireDate||'-'),
                  h('td', null,
                    u.contractType
                      ? h('span', { style:{ background:contractBg[u.contractType]||'#f1f5f9', color:contractColor[u.contractType]||'#475569', fontSize:'11px', padding:'2px 8px', borderRadius:'10px', fontWeight:700 } }, u.contractType)
                      : h('span', { style:{ color:'#cbd5e1' } }, '-')
                  ),
                  h('td', { className:'ar', style:{ fontFamily:'monospace', fontSize:'11.5px' } },
                    u.baseSalary ? u.baseSalary.toLocaleString() : '-'),
                  h('td', { className:'ac' },
                    statusTab === 'retired' && h('button', { onClick:function(e){ e.stopPropagation(); reinstate(u.sid); },
                      style:{ background:'#dcfce7', color:'#166534', border:'1px solid #86efac', padding:'2px 8px', borderRadius:'5px', fontSize:'10.5px', fontWeight:600, cursor:'pointer', marginRight:'4px' } }, '↩ 복귀'),
                    h('button', { onClick:function(e){ e.stopPropagation(); openEdit(u); },
                      style:{ background:'#dbeafe', color:'#1e40af', border:'1px solid #93c5fd', padding:'2px 8px', borderRadius:'5px', fontSize:'10.5px', fontWeight:600, cursor:'pointer' } }, '수정')
                  )
                );
              })
        )
      )
    ),
    // 우클릭 컨텍스트 메뉴
    ctxMenu && h('div', { onClick:function(){ setCtxMenu(null); }, onContextMenu:function(e){ e.preventDefault(); setCtxMenu(null); },
      style:{ position:'fixed', inset:0, zIndex:9000 } },
      h('div', { onClick:function(e){ e.stopPropagation(); },
        style:{ position:'fixed', left:Math.min(ctxMenu.x, (typeof window!=='undefined'?window.innerWidth:1200)-180), top:ctxMenu.y, background:'#fff', border:'1px solid #e2e8f0', borderRadius:'8px', boxShadow:'0 8px 24px rgba(0,0,0,0.15)', padding:'4px', minWidth:'160px', fontSize:'13px' } },
        h('div', { onClick:function(){ setDetailModal(ctxMenu.item); setCtxMenu(null); },
          style:{ padding:'8px 12px', cursor:'pointer', borderRadius:'5px' },
          onMouseEnter:function(e){ e.currentTarget.style.background='#f1f5f9'; }, onMouseLeave:function(e){ e.currentTarget.style.background=''; } }, '👁 상세 보기'),
        h('div', { onClick:function(){ openEdit(ctxMenu.item); setCtxMenu(null); },
          style:{ padding:'8px 12px', cursor:'pointer', borderRadius:'5px' },
          onMouseEnter:function(e){ e.currentTarget.style.background='#f1f5f9'; }, onMouseLeave:function(e){ e.currentTarget.style.background=''; } }, '✏️ 수정'),
        h('div', { style:{ height:'1px', background:'#e2e8f0', margin:'4px 0' } }),
        h('div', { onClick:function(){ try{ navigator.clipboard.writeText(ctxMenu.item.name||''); showToast('이름 복사됨'); }catch(e){} setCtxMenu(null); },
          style:{ padding:'8px 12px', cursor:'pointer', borderRadius:'5px' },
          onMouseEnter:function(e){ e.currentTarget.style.background='#f1f5f9'; }, onMouseLeave:function(e){ e.currentTarget.style.background=''; } }, '📋 이름 복사'),
        h('div', { onClick:function(){ try{ navigator.clipboard.writeText(ctxMenu.item.phone||''); showToast(ctxMenu.item.phone?'연락처 복사됨':'연락처 없음'); }catch(e){} setCtxMenu(null); },
          style:{ padding:'8px 12px', cursor:'pointer', borderRadius:'5px' },
          onMouseEnter:function(e){ e.currentTarget.style.background='#f1f5f9'; }, onMouseLeave:function(e){ e.currentTarget.style.background=''; } }, '📞 연락처 복사'),
        h('div', { onClick:function(){ try{ navigator.clipboard.writeText(ctxMenu.item.email||''); showToast(ctxMenu.item.email?'이메일 복사됨':'이메일 없음'); }catch(e){} setCtxMenu(null); },
          style:{ padding:'8px 12px', cursor:'pointer', borderRadius:'5px' },
          onMouseEnter:function(e){ e.currentTarget.style.background='#f1f5f9'; }, onMouseLeave:function(e){ e.currentTarget.style.background=''; } }, '✉️ 이메일 복사')
      )
    ),
    // 상세 모달
    detailModal && h(StaffRosterDetail, {
      user: detailModal,
      onClose: function(){ setDetailModal(null); },
      onEdit: function(){ openEdit(detailModal); },
      onRetire: function(){ openRetire(detailModal); },
      onReinstate: function(){ reinstate(detailModal.sid); },
      onContract: function(){ setContractModal(detailModal); setDetailModal(null); },
      onCard: function(){ setCardModal(detailModal); setDetailModal(null); },
      onDelete: function(){ del(detailModal.sid); }
    }),
    // 근로계약서 모달
    contractModal && h(EmploymentContractModal, {
      user: contractModal,
      onClose: function(){ setContractModal(null); }
    }),
    // 인사기록카드 모달
    cardModal && h(PersonnelCardModal, {
      user: cardModal,
      onSave: function(updated){ persist(users.map(function(u){ return u.sid===updated.sid?updated:u; })); setCardModal(updated); showToast('인사기록카드 저장 완료'); },
      onClose: function(){ setCardModal(null); }
    }),
    // 등록/수정 모달
    modal && h(StaffRosterModal, {
      mode: modal.mode,
      user: modal.user,
      initialTab: modal.initialTab,
      allUsers: users,
      onSave: save,
      onClose: function(){ setModal(null); }
    }),
    // 퇴사 처리 모달
    retireModal && h(RetireModal, {
      user: retireModal,
      onSave: saveRetire,
      onClose: function(){ setRetireModal(null); }
    })
  );
}

