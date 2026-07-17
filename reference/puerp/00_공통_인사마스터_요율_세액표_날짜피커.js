// ============ 인사 마스터 ============
var PAY_CATEGORIES = [
  { v:'base',      label:'기본급' },
  { v:'allowance', label:'수당' },
  { v:'bonus',     label:'상여' },
  { v:'overtime',  label:'시간외' },
  { v:'support',   label:'지원금' },
  { v:'deduction', label:'공제' },
  { v:'other',     label:'기타' }
];
var INPUT_TYPES = [
  { v:'fixed',      label:'고정' },
  { v:'monthly',    label:'매월입력' },
  { v:'formula',    label:'수식' },
  { v:'attendance', label:'근태연동' }
];
var PAY_ITEM_SEED = [
  { code:'base',        name:'기본급',       category:'base',      taxable:true,  taxFreeLimit:0,      isOrdinary:true,  isAverage:true,  inputType:'fixed',      sortOrder:10,  color:'#2563eb', deletable:false },
  { code:'meal',        name:'식대',         category:'allowance', taxable:false, taxFreeLimit:200000, isOrdinary:false, isAverage:true,  inputType:'fixed',      sortOrder:20,  color:'#059669', deletable:false },
  { code:'car',         name:'차량유지비',   category:'allowance', taxable:false, taxFreeLimit:200000, isOrdinary:false, isAverage:true,  inputType:'fixed',      sortOrder:30,  color:'#2563eb', deletable:false },
  { code:'childcare',   name:'출산보육수당', category:'allowance', taxable:false, taxFreeLimit:100000, isOrdinary:false, isAverage:true,  inputType:'fixed',      sortOrder:35,  color:'#ec4899', deletable:true  },
  { code:'duty',        name:'직책수당',     category:'allowance', taxable:true,  taxFreeLimit:0,      isOrdinary:true,  isAverage:true,  inputType:'fixed',      sortOrder:40,  color:'#2563eb', deletable:true  },
  { code:'cert',        name:'자격수당',     category:'allowance', taxable:true,  taxFreeLimit:0,      isOrdinary:true,  isAverage:true,  inputType:'fixed',      sortOrder:50,  color:'#d97706', deletable:true  },
  { code:'risk',        name:'위험수당',     category:'allowance', taxable:true,  taxFreeLimit:0,      isOrdinary:true,  isAverage:true,  inputType:'fixed',      sortOrder:60,  color:'#dc2626', deletable:true  },
  { code:'longservice', name:'장기근속수당', category:'allowance', taxable:true,  taxFreeLimit:0,      isOrdinary:false, isAverage:true,  inputType:'fixed',      sortOrder:70,  color:'#84cc16', deletable:true  },
  { code:'overtime',    name:'연장근로수당', category:'overtime',  taxable:true,  taxFreeLimit:0,      isOrdinary:false, isAverage:true,  inputType:'attendance', sortOrder:80,  color:'#f59e0b', deletable:false },
  { code:'night',       name:'야간근로수당', category:'overtime',  taxable:true,  taxFreeLimit:0,      isOrdinary:false, isAverage:true,  inputType:'attendance', sortOrder:90,  color:'#6366f1', deletable:false },
  { code:'holiday',     name:'휴일근로수당', category:'overtime',  taxable:true,  taxFreeLimit:0,      isOrdinary:false, isAverage:true,  inputType:'attendance', sortOrder:100, color:'#ef4444', deletable:false },
  { code:'bonus',       name:'성과급',       category:'bonus',     taxable:true,  taxFreeLimit:0,      isOrdinary:false, isAverage:true,  inputType:'monthly',    sortOrder:110, color:'#3b82f6', deletable:false },
  { code:'holidaybonus',name:'명절상여금',   category:'bonus',     taxable:true,  taxFreeLimit:0,      isOrdinary:false, isAverage:false, inputType:'monthly',    sortOrder:120, color:'#3b82f6', deletable:true  },
  { code:'yearend',     name:'연말상여금',   category:'bonus',     taxable:true,  taxFreeLimit:0,      isOrdinary:false, isAverage:false, inputType:'monthly',    sortOrder:130, color:'#2563eb', deletable:true  },
  { code:'researchexp', name:'연구활동비',   category:'allowance', taxable:false, taxFreeLimit:200000, isOrdinary:false, isAverage:false, inputType:'monthly',    sortOrder:140, color:'#10b981', deletable:true  },
  { code:'absent',      name:'결근공제',     category:'deduction', taxable:false, taxFreeLimit:0,      isOrdinary:false, isAverage:false, inputType:'monthly',    sortOrder:145, color:'#dc2626', deletable:true  },
  { code:'etc',         name:'기타수당',     category:'allowance', taxable:true,  taxFreeLimit:0,      isOrdinary:false, isAverage:true,  inputType:'monthly',    sortOrder:999, color:'#64748b', deletable:false }
];

function payCatLabel(v){ var x = PAY_CATEGORIES.find(function(c){return c.v===v;}); return x ? x.label : v; }
function inputTypeLabel(v){ var x = INPUT_TYPES.find(function(c){return c.v===v;}); return x ? x.label : v; }
function fmtNum(n){ return (n||0).toLocaleString('ko-KR'); }

function PayItemModal(props){
  useEscClose(props.onClose);
  useEnterSave(function(){ var saveBtn=document.querySelector('.modal-bg .modal .btn-primary'); if(saveBtn) saveBtn.click(); });
  var init = props.item || { code:'', name:'', category:'allowance', taxable:true, taxFreeLimit:0, isOrdinary:false, isAverage:true, inputType:'fixed', sortOrder:100, color:'#2563eb' };
  var s = useState(init); var f = s[0]; var setF = s[1];
  function set(k){ return function(e){
    var v;
    if(e.target.type === 'number') v = parseInt(e.target.value||0, 10);
    else if(e.target.type === 'checkbox') v = e.target.checked;
    else v = e.target.value;
    setF(function(prev){ return Object.assign({}, prev, (function(){var x={}; x[k]=v; return x;})()); });
  }; }
  function save(){
    if(!f.name){ showToast('이름 필수'); return; }
    if(!props.item && !f.code){ f.code = 'pay-' + Date.now().toString(36)+Math.random().toString(36).slice(2,5); }
    props.onSave(f);
  }
  return h('div', { className:'modal-bg', onClick:props.onClose },
    h('div', { className:'modal', style:{ width:'520px' }, onClick:function(e){ e.stopPropagation(); } },
      h('div', { className:'modal-h' },
        h('div', { className:'t' }, props.item ? '임금항목 수정' : '임금항목 추가'),
        h('button', { className:'x', onClick:props.onClose }, '×')
      ),
      h('div', { className:'modal-b' },
        h('div', { className:'fld' }, h('label', null, '이름'),
          h('input', { type:'text', value:f.name, onChange:set('name'),
            placeholder: f.category === 'deduction' ? '예: 결근공제, 지각공제, 무단결근 등' : '',
            style: f.category === 'deduction' ? { color:'#dc2626', fontWeight:700 } : {} })),
        h('div', { className:'fld' }, h('label', null, '분류'),
          h('select', { value:f.category,
            onChange:function(e){
              var v = e.target.value;
              var next = Object.assign({}, f, { category:v });
              // 공제로 변경 시: 색상 빨강 자동 + 통상/평균임금/과세 자동 해제
              if(v === 'deduction'){
                if(!props.item){ // 신규일 때만 색상 자동
                  next.color = '#dc2626';
                }
                next.isOrdinary = false;
                next.isAverage = false;
                next.taxable = false;
              }
              setF(next);
            },
            style: f.category === 'deduction'
              ? { borderColor:'#dc2626', color:'#dc2626', fontWeight:700, background:'#fef2f2' }
              : {} },
            PAY_CATEGORIES.map(function(c){ return h('option', { key:c.v, value:c.v }, c.label); }))),
        // 공제 분류 선택 시 안내 박스
        f.category === 'deduction' && h('div', { style:{
          background:'#fef2f2', border:'1px solid #fecaca', borderLeft:'3px solid #dc2626',
          borderRadius:'4px', padding:'9px 12px', margin:'2px 0 10px',
          fontSize:'12px', color:'#991b1b', display:'flex', alignItems:'center', gap:'8px'
        } },
          h('span', { style:{ fontSize:'18px', fontWeight:900, color:'#dc2626', fontFamily:'monospace' } }, '−'),
          h('div', null,
            h('div', { style:{ fontWeight:700, marginBottom:'2px' } }, '공제 항목 — 지급액에서 차감됩니다'),
            h('div', { style:{ fontSize:'11px', color:'#7f1d1d' } }, '금액은 양수로 입력 → 자동으로 차감 처리 (예: 100,000 입력 → −100,000원)')
          )
        ),
        h('div', { className:'fld' }, h('label', null, '입력방식'),
          h('select', { value:f.inputType, onChange:set('inputType') },
            INPUT_TYPES.map(function(c){ return h('option', { key:c.v, value:c.v }, c.label); }))),
        h('div', { className:'fld' }, h('label', null, '과세 여부'),
          h('label', { style:{ display:'grid', gridTemplateColumns:'18px 1fr', alignItems:'center', gap:'10px', fontWeight:500, cursor:'pointer' } },
            h('input', { type:'checkbox', checked:f.taxable, onChange:set('taxable'), style:{ margin:0, width:'16px', height:'16px' } }),
            h('span', null, '과세'))),
        h('div', { className:'fld' }, h('label', null, '비과세 한도'),
          h(NumberInput, { value:f.taxFreeLimit, onChange:set('taxFreeLimit'), placeholder:'월 비과세 한도(원)',
            style:{ width:'100%', padding:'7px 10px', border:'1px solid #cbd5e1', borderRadius:'6px', fontSize:'12.5px', fontFamily:'monospace', textAlign:'right' } })),
        h('div', { className:'fld' }, h('label', null, '통상임금'),
          h('label', { style:{ display:'grid', gridTemplateColumns:'18px 1fr', alignItems:'center', gap:'10px', fontWeight:500, cursor:'pointer' } },
            h('input', { type:'checkbox', checked:f.isOrdinary, onChange:set('isOrdinary'), style:{ margin:0, width:'16px', height:'16px' } }),
            h('span', null, '포함 (연장·야간·휴일수당 산정)'))),
        h('div', { className:'fld' }, h('label', null, '평균임금'),
          h('label', { style:{ display:'grid', gridTemplateColumns:'18px 1fr', alignItems:'center', gap:'10px', fontWeight:500, cursor:'pointer' } },
            h('input', { type:'checkbox', checked:f.isAverage, onChange:set('isAverage'), style:{ margin:0, width:'16px', height:'16px' } }),
            h('span', null, '포함 (퇴직금 산정)'))),
        h('div', { className:'fld' }, h('label', null, '색상'),
          h('input', { type:'color', value:f.color, onChange:set('color'), style:{ width:'80px', padding:'2px', height:'32px' } })),
        h('div', { className:'fld' }, h('label', null, '정렬'),
          h('input', { type:'number', value:f.sortOrder, onChange:set('sortOrder') }))
      ),
      h('div', { className:'modal-f' },
        h('button', { className:'btn-secondary', onClick:props.onClose }, '취소'),
        h('button', { className:'btn-primary', onClick:save }, '저장')
      )
    )
  );
}

function PayItemSection(){
  var existing = dbGet('pay_items', null);
  if(!existing){ dbSet('pay_items', PAY_ITEM_SEED); existing = PAY_ITEM_SEED; }
  var u = useState(existing); var list = u[0]; var setList = u[1];
  var m = useState(null); var modal = m[0]; var setModal = m[1];

  function persist(arr){
    arr.sort(function(a,b){ return (a.sortOrder||0) - (b.sortOrder||0); });
    setList(arr); dbSet('pay_items', arr);
  }
  function openAdd(){ setModal({ mode:'add', item:null }); }
  function openEdit(it){ setModal({ mode:'edit', item:it }); }
  function close(){ setModal(null); }
  function save(form){
    if(modal.mode === 'add'){
      if(list.find(function(x){ return x.code === form.code; })){ showToast('코드 중복'); return; }
      persist(list.concat([form])); showToast('추가됨');
    } else {
      persist(list.map(function(x){ return x.code === form.code ? form : x; })); showToast('수정됨');
    }
    close();
  }
  function del(code){
    var t = list.find(function(x){ return x.code===code; });
    if(t && t.deletable===false){ showToast('시스템 기본 항목 삭제 불가'); return; }
    (function(){var _ud=list.slice(); persist(list.filter(function(x){ return x.code !== code; })); showToastUndo('🗑️ 삭제됨', function(){persist(_ud);});})();
  }
  function reseed(){ persist(PAY_ITEM_SEED.slice()); showToast('시드 복원됨'); }
  function moveItem(code, dir){
    var sorted = list.slice().sort(function(a,b){ return (a.sortOrder||0)-(b.sortOrder||0); });
    var idx = sorted.findIndex(function(x){ return x.code===code; });
    var swapIdx = idx + dir;
    if(idx < 0 || swapIdx < 0 || swapIdx >= sorted.length) return;
    var a = sorted[idx], b = sorted[swapIdx];
    var newA = Object.assign({}, a, { sortOrder: b.sortOrder });
    var newB = Object.assign({}, b, { sortOrder: a.sortOrder });
    var next = list.map(function(x){
      if(x.code===a.code) return newA;
      if(x.code===b.code) return newB;
      return x;
    });
    persist(next);
  }
  function toggleHidden(code){
    var next = list.map(function(x){
      if(x.code===code) return Object.assign({}, x, { hidden: !x.hidden });
      return x;
    });
    persist(next);
  }
  // 드래그 앤 드롭 정렬
  var dc = useState(null); var dragCode = dc[0]; var setDragCode = dc[1];
  var hc = useState(null); var hoverCode = hc[0]; var setHoverCode = hc[1];
  function handleDrop(srcCode, dstCode){
    if(!srcCode || srcCode === dstCode) return;
    var sorted = list.slice().sort(function(a,b){ return (a.sortOrder||0)-(b.sortOrder||0); });
    var srcIdx = sorted.findIndex(function(it){return it.code===srcCode;});
    var dstIdx = sorted.findIndex(function(it){return it.code===dstCode;});
    if(srcIdx<0 || dstIdx<0) return;
    var moved = sorted.splice(srcIdx, 1)[0];
    sorted.splice(dstIdx, 0, moved);
    // sortOrder 재할당 (10단위) — 새 항목 끼워넣을 여유 확보
    var renumbered = sorted.map(function(it, idx){ return Object.assign({}, it, { sortOrder: (idx+1)*10 }); });
    persist(renumbered);
  }

  return h('div', { style:{ marginBottom:'12px' } },
    h('div', { style:{ fontSize:'12px', fontWeight:700, color:'#475569', padding:'6px 0 4px', borderBottom:'2px solid #1e40af', marginBottom:'10px', display:'flex', alignItems:'center', gap:'8px', userSelect:'none' } },
      h('span', null, '임금항목'),
      h('span', { style:{ background:'#e2e8f0', color:'#475569', fontSize:'11px', padding:'2px 8px', borderRadius:'10px', fontWeight:600 } }, list.length + '개'),
      h('div', { style:{ flex:1 } }),
      h('button', { className:'btn-primary', onClick:function(e){ e.stopPropagation(); openAdd(); }, style:{ padding:'5px 12px', fontSize:'11.5px' } }, '+ 추가'),
      h('button', { className:'btn-secondary', onClick:function(e){ e.stopPropagation(); reseed(); }, style:{ padding:'5px 12px', fontSize:'11.5px' } }, '시드 복원')
    ),
    h('div', null,
    h('table', { className:'dt' },
      h('thead', null, h('tr', null,
        h('th', { style:{ width:'24px' } }, ''),
        h('th', null, '항목명'),
        h('th', null, '분류'),
        h('th', null, '입력'),
        h('th', null, '과세'),
        h('th', { className:'ar' }, '비과세 한도'),
        h('th', { className:'ac' }, '통상'),
        h('th', { className:'ac' }, '평균'),
        h('th', { className:'ar' }, '정렬'),
        h('th', { className:'ac' }, '표시'),
        h('th', { className:'ac' }, '관리')
      )),
      h('tbody', null,
        list.map(function(x, i){
          var hidden = !!x.hidden;
          var isDragging = dragCode === x.code;
          var isHovered = hoverCode === x.code && dragCode && dragCode !== x.code;
          return h('tr', {
            key:x.code,
            draggable: true,
            onDragStart: function(e){
              e.dataTransfer.effectAllowed = 'move';
              try { e.dataTransfer.setData('text/plain', x.code); } catch(_){}
              setDragCode(x.code);
            },
            onDragOver: function(e){
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              if(hoverCode !== x.code) setHoverCode(x.code);
            },
            onDragLeave: function(){
              if(hoverCode === x.code) setHoverCode(null);
            },
            onDrop: function(e){
              e.preventDefault();
              handleDrop(dragCode, x.code);
              setDragCode(null);
              setHoverCode(null);
            },
            onDragEnd: function(){
              setDragCode(null);
              setHoverCode(null);
            },
            style: Object.assign({},
              hidden ? { opacity:0.45, background:'#f8fafc' } : {},
              isDragging ? { opacity:0.4, background:'#dbeafe' } : {},
              isHovered ? { background:'#eff6ff', borderTop:'2px solid #3b82f6' } : {},
              { cursor:'grab' }
            )
          },
            h('td', null,
              h('div', { style:{ display:'flex', alignItems:'center', gap:'4px' } },
                h('span', { title:'드래그로 순서 변경', style:{ color:'#cbd5e1', fontSize:'11px', userSelect:'none', cursor:'grab' } }, '⋮⋮'),
                h('div', { style:{ width:'12px', height:'12px', borderRadius:'50%', background:x.color || '#94a3b8' } })
              )
            ),
            h('td', null,
              x.category === 'deduction' && h('span', { style:{ color:'#dc2626', fontWeight:900, fontFamily:'monospace', marginRight:'4px' } }, '−'),
              h('span', { style: x.category === 'deduction' ? { color:'#dc2626', fontWeight:700 } : {} }, x.name),
              hidden && h('span', { style:{ marginLeft:'5px', fontSize:'10px', color:'#94a3b8' } }, '(숨김)')),
            h('td', null,
              x.category === 'deduction'
                ? h('span', { style:{ padding:'2px 8px', background:'#fef2f2', color:'#dc2626', borderRadius:'10px', fontSize:'10.5px', fontWeight:700, border:'1px solid #fecaca' } }, '− 공제')
                : payCatLabel(x.category)),
            h('td', null, inputTypeLabel(x.inputType)),
            h('td', null, h('span', { className:'tag '+(x.taxable ? 'tag-member' : 'tag-active') }, x.taxable ? '과세' : '비과세')),
            h('td', { className:'ar', style:{ fontFamily:'monospace' } }, x.taxFreeLimit > 0 ? fmtNum(x.taxFreeLimit) : '-'),
            h('td', { className:'ac' }, x.isOrdinary ? '✓' : ''),
            h('td', { className:'ac' }, x.isAverage ? '✓' : ''),
            h('td', { className:'ar' },
              h('div', { style:{ display:'inline-flex', gap:'4px', alignItems:'center' } },
                h('button', { onClick:function(){moveItem(x.code, -1);}, disabled:i===0,
                  title:'위로',
                  style:{ padding:'1px 3px', background:i===0?'#f1f5f9':'#fff', border:'1px solid #cbd5e1', borderRadius:'5px', cursor:i===0?'not-allowed':'pointer', fontSize:'10px', color:i===0?'#cbd5e1':'#475569' } }, '▲'),
                h('button', { onClick:function(){moveItem(x.code, 1);}, disabled:i===list.length-1,
                  title:'아래로',
                  style:{ padding:'2px 5px', background:i===list.length-1?'#f1f5f9':'#fff', border:'1px solid #cbd5e1', borderRadius:'5px', cursor:i===list.length-1?'not-allowed':'pointer', fontSize:'10px', color:i===list.length-1?'#cbd5e1':'#475569' } }, '▼'),
                h('span', { style:{ marginLeft:'4px', color:'#94a3b8', fontSize:'10px' } }, x.sortOrder)
              )
            ),
            h('td', { className:'ac' },
              h('button', { onClick:function(){ toggleHidden(x.code); },
                title: hidden ? '월별급여에 표시' : '월별급여에서 숨김',
                style:{ padding:'3px 9px', background: hidden?'#fef2f2':'#dcfce7', border:'1px solid '+(hidden?'#fca5a5':'#86efac'), borderRadius:'4px', cursor:'pointer', fontSize:'11px', fontWeight:600, color: hidden?'#b91c1c':'#166534' } },
                hidden ? '🚫 숨김' : '👁 표시'
              )
            ),
            h('td', { className:'ac' },
              h('button', { className:'dt-row-btn edit', onClick:function(){ openEdit(x); } }, '수정'),
              x.deletable !== false && h('button', { className:'dt-row-btn del', onClick:function(){ del(x.code); } }, '삭제')
            )
          );
        })
      )
    ),
    modal && h(PayItemModal, { item:modal.item, onSave:save, onClose:close })
    ) // end coll.open (pay)
  );
}

function MinWageSection(){
  var DEFAULT = { id:'min-wage-2026', year:2026, hourlyMin:10320, weeklyMin:495360, monthlyMin209:2156880, monthlyMin226:2332320, effectiveFrom:'2026-01-01' };
  var existing = dbGet('min_wage', null);
  if(!existing){ dbSet('min_wage', DEFAULT); existing = DEFAULT; }
  var s = useState(existing); var f = s[0]; var setF = s[1];
  function set(k){ return function(e){
    var v = e.target.type === 'number' ? parseInt(e.target.value||0,10) : e.target.value;
    var next = Object.assign({}, f, (function(){var x={}; x[k]=v; return x;})());
    if(k === 'hourlyMin'){
      next.weeklyMin = v * 48;
      next.monthlyMin209 = v * 209;
      next.monthlyMin226 = v * 226;
    }
    setF(next);
  }; }
  function save(){ dbSet('min_wage', f); showToast('저장됨'); }
  function reset(){ setF(DEFAULT); showToast('기본값 복원'); }

  var _nowY = (new Date()).getFullYear(), _nowM = (new Date()).getMonth()+1;
  var _alert = null;
  if((f.year||0) < _nowY){
    _alert = { msg:'⚠️ 현재 '+ (f.year||'?') +'년 기준입니다. '+_nowY+'년 최저임금으로 갱신하세요.', bg:'#fee2e2', bd:'#fca5a5', fg:'#b91c1c' };
  } else if(_nowM >= 7 && (f.year||0) <= _nowY){
    _alert = { msg:'📅 내년('+(_nowY+1)+') 최저임금이 고시되었는지 확인하세요. (매년 8월 고시 → 1/1 시행)', bg:'#fffbeb', bd:'#fde68a', fg:'#92400e' };
  }

  return h('div', { style:{ marginBottom:'12px' } },
    _alert && h('div', { style:{ background:_alert.bg, border:'1px solid '+_alert.bd, color:_alert.fg, borderRadius:'6px', padding:'8px 12px', fontSize:'11.5px', fontWeight:700, marginBottom:'10px' } }, _alert.msg),
    h('div', { style:{ fontSize:'12px', fontWeight:700, color:'#475569', padding:'6px 0 4px', borderBottom:'2px solid #1e40af', marginBottom:'12px', display:'flex', alignItems:'center', gap:'8px', userSelect:'none' } },
      h('span', null, '최저임금'),
      h('div', { style:{ flex:1 } }),
      h('button', { className:'btn-secondary', onClick:function(e){ e.stopPropagation(); reset(); }, style:{ padding:'5px 12px', fontSize:'11.5px' } }, '기본값 복원')
    ),
    h('div', null,
    h('div', { style:{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'5px 12px', maxWidth:'640px' } },
      h('div', { className:'fld' }, h('label', null, '적용연도'),
        h('input', { type:'number', value:f.year, onChange:set('year') })),
      h('div', { className:'fld' }, h('label', null, '시급'),
        h(NumberInput, { value:f.hourlyMin, onChange:set('hourlyMin'),
          style:{ width:'100%', padding:'7px 10px', border:'1px solid #cbd5e1', borderRadius:'6px', fontSize:'12.5px', fontFamily:'monospace', textAlign:'right' } })),
      h('div', { className:'fld' }, h('label', null, '주급(48h)'),
        h(NumberInput, { value:f.weeklyMin, onChange:set('weeklyMin'),
          readOnly:true,
          style:{ width:'100%', padding:'7px 10px', border:'1px solid #cbd5e1', borderRadius:'6px', fontSize:'12.5px', fontFamily:'monospace', textAlign:'right', background:'#f8fafc' } })),
      h('div', { className:'fld' }, h('label', null, '월급(209h)'),
        h(NumberInput, { value:f.monthlyMin209, onChange:set('monthlyMin209'),
          readOnly:true,
          style:{ width:'100%', padding:'7px 10px', border:'1px solid #cbd5e1', borderRadius:'6px', fontSize:'12.5px', fontFamily:'monospace', textAlign:'right', background:'#f8fafc' } })),
      h('div', { className:'fld' }, h('label', null, '월급(226h)'),
        h(NumberInput, { value:f.monthlyMin226, onChange:set('monthlyMin226'),
          readOnly:true,
          style:{ width:'100%', padding:'7px 10px', border:'1px solid #cbd5e1', borderRadius:'6px', fontSize:'12.5px', fontFamily:'monospace', textAlign:'right', background:'#f8fafc' } })),
      h('div', { className:'fld' }, h('label', null, '시행일'),
        h(KoreanDatePicker, { value:f.effectiveFrom, onChange:set('effectiveFrom') }))
    ),
    h('div', { style:{ marginTop:'6px' } },
      h('button', { className:'btn-primary', onClick:save }, '저장')
    )
    ) // end coll.open (minwage)
  );
}

var HOLIDAY_KINDS = ['법정공휴일','대체공휴일','선거일','임시공휴일','회사휴일'];
var HOLIDAY_SEED = [
  { date:'2026-01-01', name:'신정',           kind:'법정공휴일' },
  { date:'2026-02-16', name:'설날 연휴',      kind:'법정공휴일' },
  { date:'2026-02-17', name:'설날',           kind:'법정공휴일' },
  { date:'2026-02-18', name:'설날 연휴',      kind:'법정공휴일' },
  { date:'2026-03-01', name:'삼일절',         kind:'법정공휴일' },
  { date:'2026-03-02', name:'대체공휴일(삼일절)', kind:'대체공휴일' },
  { date:'2026-05-05', name:'어린이날',       kind:'법정공휴일' },
  { date:'2026-05-24', name:'부처님오신날',   kind:'법정공휴일' },
  { date:'2026-05-25', name:'대체공휴일(부처님오신날)', kind:'대체공휴일' },
  { date:'2026-06-03', name:'제9회 전국동시지방선거', kind:'선거일' },
  { date:'2026-06-06', name:'현충일',         kind:'법정공휴일' },
  { date:'2026-08-15', name:'광복절',         kind:'법정공휴일' },
  { date:'2026-08-17', name:'대체공휴일(광복절)', kind:'대체공휴일' },
  { date:'2026-09-24', name:'추석 연휴',      kind:'법정공휴일' },
  { date:'2026-09-25', name:'추석',           kind:'법정공휴일' },
  { date:'2026-09-26', name:'추석 연휴',      kind:'법정공휴일' },
  { date:'2026-10-03', name:'개천절',         kind:'법정공휴일' },
  { date:'2026-10-05', name:'대체공휴일(개천절)', kind:'대체공휴일' },
  { date:'2026-10-09', name:'한글날',         kind:'법정공휴일' },
  { date:'2026-12-25', name:'성탄절',         kind:'법정공휴일' }
];

function HolidayModal(props){
  useEscClose(props.onClose);
  var init = props.holiday || { date:'', name:'', kind:'법정공휴일' };
  var s = useState(init); var f = s[0]; var setF = s[1];
  function set(k){ return function(e){ setF(function(prev){ return Object.assign({}, prev, (function(){var x={}; x[k]=e.target.value; return x;})()); }); }; }
  function save(){
    if(!f.date || !f.name){ showToast('날짜·이름 필수'); return; }
    props.onSave(f);
  }
  return h('div', { className:'modal-bg', onClick:props.onClose },
    h('div', { className:'modal', onClick:function(e){ e.stopPropagation(); } },
      h('div', { className:'modal-h' },
        h('div', { className:'t' }, props.holiday ? '공휴일 수정' : '공휴일 추가'),
        h('button', { className:'x', onClick:props.onClose }, '×')
      ),
      h('div', { className:'modal-b' },
        h('div', { className:'fld' }, h('label', null, '날짜'),
          h(KoreanDatePicker, { value:f.date, onChange:set('date') })),
        h('div', { className:'fld' }, h('label', null, '이름'),
          h('input', { type:'text', value:f.name, onChange:set('name') })),
        h('div', { className:'fld' }, h('label', null, '종류'),
          h('select', { value:f.kind, onChange:set('kind') },
            HOLIDAY_KINDS.map(function(k){ return h('option', { key:k, value:k }, k); })))
      ),
      h('div', { className:'modal-f' },
        h('button', { className:'btn-secondary', onClick:props.onClose }, '취소'),
        h('button', { className:'btn-primary', onClick:save }, '저장')
      )
    )
  );
}

function HolidaySection(){
  var existing = dbGet('holidays', null);
  if(!existing){ dbSet('holidays', HOLIDAY_SEED); existing = HOLIDAY_SEED; }
  var u = useState(existing); var list = u[0]; var setList = u[1];
  var m = useState(null); var modal = m[0]; var setModal = m[1];
  var y = useState((new Date()).getFullYear()); var year = y[0]; var setYear = y[1];

  function persist(arr){
    arr.sort(function(a,b){ return a.date.localeCompare(b.date); });
    setList(arr); dbSet('holidays', arr);
  }
  function openAdd(){ setModal({ mode:'add', holiday:null }); }
  function openEdit(it){ setModal({ mode:'edit', holiday:it }); }
  function close(){ setModal(null); }
  function save(form){
    if(modal.mode === 'add'){
      persist(list.concat([form])); showToast('추가됨');
    } else {
      persist(list.map(function(x){ return x.date === modal.holiday.date && x.name === modal.holiday.name ? form : x; })); showToast('수정됨');
    }
    close();
  }
  function del(d, n){ (function(){var _ud=list.slice(); persist(list.filter(function(x){ return !(x.date === d && x.name === n); })); showToastUndo('🗑️ 삭제됨', function(){persist(_ud);});})(); }
  function reseed(){ persist(HOLIDAY_SEED.slice()); showToast('시드 복원됨'); }

  var filtered = list.filter(function(x){ return x.date.indexOf(year + '-') === 0; });
  var years = Array.from(new Set(list.map(function(x){ return parseInt(x.date.slice(0,4),10); }))).sort();
  if(years.indexOf(year) < 0) years.push(year);

  function dow(dateStr){
    var d = new Date(dateStr + 'T00:00:00');
    return ['일','월','화','수','목','금','토'][d.getDay()];
  }
  function kindTag(k){
    var color = k === '법정공휴일' ? 'tag-active'
      : k === '대체공휴일' ? 'tag-delegate'
      : k === '선거일' ? 'tag-admin'
      : 'tag-member';
    return h('span', { className:'tag ' + color }, k);
  }

  return h('div', { style:{ marginBottom:'12px' } },
    h('div', { style:{ fontSize:'12px', fontWeight:700, color:'#475569', padding:'6px 0 4px', borderBottom:'2px solid #1e40af', marginBottom:'10px', display:'flex', alignItems:'center', gap:'8px', userSelect:'none' } },
      h('span', null, '공휴일'),
      h('span', { style:{ background:'#e2e8f0', color:'#475569', fontSize:'11px', padding:'2px 8px', borderRadius:'10px', fontWeight:600 } }, filtered.length + '개'),
      h('select', { value:year, onClick:function(e){ e.stopPropagation(); }, onChange:function(e){ setYear(parseInt(e.target.value,10)); }, style:{ marginLeft:'8px', padding:'5px 8px', border:'1px solid #cbd5e1', borderRadius:'4px', fontSize:'12px' } },
        years.sort().map(function(yy){ return h('option', { key:yy, value:yy }, yy + '년'); })),
      h('div', { style:{ flex:1 } }),
      h('button', { className:'btn-primary', onClick:function(e){ e.stopPropagation(); openAdd(); }, style:{ padding:'5px 12px', fontSize:'11.5px' } }, '+ 추가'),
      h('button', { className:'btn-secondary', onClick:function(e){ e.stopPropagation(); reseed(); }, style:{ padding:'5px 12px', fontSize:'11.5px' } }, '시드 복원')
    ),
    h('div', null,
    h('table', { className:'dt' },
      h('thead', null, h('tr', null,
        h('th', null, '날짜'),
        h('th', { className:'ac' }, '요일'),
        h('th', null, '이름'),
        h('th', null, '종류'),
        h('th', { className:'ac' }, '관리')
      )),
      h('tbody', null,
        filtered.length === 0
          ? h('tr', null, h('td', { colSpan:5, className:'ac', style:{ color:'#94a3b8', padding:'30px' } }, year + '년 공휴일 없음'))
          : filtered.map(function(x, idx){
              var d = dow(x.date);
              var weekend = d === '일' || d === '토';
              return h('tr', { key:x.date + '-' + x.name + '-' + idx },
                h('td', { style:{ fontFamily:'monospace', color: weekend ? '#dc2626' : '#1e293b' } }, x.date),
                h('td', { className:'ac', style:{ color: weekend ? '#dc2626' : '#475569', fontWeight:600 } }, d),
                h('td', null, x.name),
                h('td', null, kindTag(x.kind)),
                h('td', { className:'ac' },
                  h('button', { className:'dt-row-btn edit', onClick:function(){ openEdit(x); } }, '수정'),
                  h('button', { className:'dt-row-btn del',  onClick:function(){ del(x.date, x.name); } }, '삭제')
                )
              );
            })
      )
    ),
    modal && h(HolidayModal, { holiday:modal.holiday, onSave:save, onClose:close })
    ) // end coll.open (holiday)
  );
}


// ============ 4대보험 요율 ============
// 연도별 요율 관리 (국민연금/건강보험/장기요양/고용보험/산재보험)
// 캡쳐 기준 2026년 요율로 시드
var INSURANCE_DEFAULT = {
  pension:    { ee:4.5,   er:4.5   },              // 국민연금
  health:     { ee:3.545, er:3.545 },              // 건강보험
  longterm:   { rate:12.81 },                      // 장기요양 (건강보험 대비 %)
  employment: { ee:0.9,   er:1.3   },              // 고용보험
  injury:     { rate:0.7 }                         // 산재보험 (사업주 전액)
};

function InsuranceSection(){
  var existing = dbGet('insurance_rates', null);
  if(!existing){ existing = { '2026': INSURANCE_DEFAULT }; dbSet('insurance_rates', existing); }
  var r = useState(existing); var rates = r[0]; var setRates = r[1];

  var thisYear = (new Date()).getFullYear();
  var years = Object.keys(rates).map(function(y){ return parseInt(y,10); }).sort();
  if(years.length === 0){ years = [thisYear]; }

  var y = useState(years[years.length-1]); var year = y[0]; var setYear = y[1];

  var cur = rates[year] || INSURANCE_DEFAULT;

  function persist(next){ setRates(next); dbSet('insurance_rates', next); }
  function set(group, key, v){
    var num = parseFloat(v);
    if(isNaN(num)) num = 0;
    var next = Object.assign({}, rates);
    next[year] = Object.assign({}, next[year]);
    next[year][group] = Object.assign({}, next[year][group]);
    next[year][group][key] = num;
    persist(next);
  }
  function addNextYear(){
    var ny = year + 1;
    if(rates[ny]){ showToast(ny + '년 이미 있음'); return; }
    var next = Object.assign({}, rates);
    next[ny] = JSON.parse(JSON.stringify(cur));
    persist(next);
    setYear(ny);
    showToast(ny + '년 추가됨');
  }
  function resetThisYear(){
    var next = Object.assign({}, rates);
    next[year] = JSON.parse(JSON.stringify(INSURANCE_DEFAULT));
    persist(next);
    showToast(year + '년 기본값 복원');
  }

  function rowDouble(label, hint, group, eeKey, erKey){
    return h('div', { style:{ display:'grid', gridTemplateColumns:'180px 1fr 1fr', gap:'8px', alignItems:'center', padding:'5px 4px', borderBottom:'1px solid #f1f5f9' } },
      h('div', null,
        h('div', { style:{ fontSize:'11px', fontWeight:600, color:'#1e293b' } }, label),
        hint && h('div', { style:{ fontSize:'10.5px', color:'#94a3b8', marginTop:'2px' } }, hint)
      ),
      h('div', { style:{ textAlign:'center', background:'#f0f9ff', borderRadius:'5px', padding:'4px 6px', border:'1px solid #bfdbfe' } },
        h('input', { type:'number', step:'0.001', value:cur[group][eeKey],
          onChange:function(e){ set(group, eeKey, e.target.value); },
          style:{ width:'72px', padding:'5px 7px', border:'1px solid #93c5fd', borderRadius:'4px', fontSize:'12px', textAlign:'center', fontFamily:'inherit', fontWeight:700, color:'#1e40af', background:'#fff' } }),
        h('span', { style:{ marginLeft:'3px', fontSize:'10.5px', color:'#1e40af', fontWeight:600 } }, '%')
      ),
      h('div', { style:{ textAlign:'center', background:'#fff7ed', borderRadius:'5px', padding:'4px 6px', border:'1px solid #fed7aa' } },
        h('input', { type:'number', step:'0.001', value:cur[group][erKey],
          onChange:function(e){ set(group, erKey, e.target.value); },
          style:{ width:'72px', padding:'5px 7px', border:'1px solid #fb923c', borderRadius:'4px', fontSize:'12px', textAlign:'center', fontFamily:'inherit', fontWeight:700, color:'#c2410c', background:'#fff' } }),
        h('span', { style:{ marginLeft:'3px', fontSize:'10.5px', color:'#c2410c', fontWeight:600 } }, '%')
      )
    );
  }
  function rowSingle(label, hint, group, key, suffix){
    var isEROnly = suffix && suffix.indexOf('사업주') >= 0;
    return h('div', { style:{ display:'grid', gridTemplateColumns:'180px 1fr 1fr', gap:'8px', alignItems:'center', padding:'5px 4px', borderBottom:'1px solid #f1f5f9' } },
      h('div', null,
        h('div', { style:{ fontSize:'11px', fontWeight:600, color:'#1e293b' } }, label),
        hint && h('div', { style:{ fontSize:'10.5px', color:'#94a3b8', marginTop:'2px' } }, hint)
      ),
      isEROnly
        ? h('div', { style:{ textAlign:'center', color:'#cbd5e1', fontSize:'11px' } }, '—')
        : h('div', { style:{ textAlign:'center', background:'#f0f9ff', borderRadius:'5px', padding:'4px 6px', border:'1px solid #bfdbfe' } },
            h('input', { type:'number', step:'0.001', value:cur[group][key],
              onChange:function(e){ set(group, key, e.target.value); },
              style:{ width:'72px', padding:'5px 7px', border:'1px solid #93c5fd', borderRadius:'4px', fontSize:'12px', textAlign:'center', fontFamily:'inherit', fontWeight:700, color:'#1e40af', background:'#fff' } }),
            h('span', { style:{ marginLeft:'3px', fontSize:'10px', color:'#1e40af', fontWeight:600 } }, '% ' + (suffix||''))
          ),
      h('div', { style:{ textAlign:'center', background:'#fff7ed', borderRadius:'5px', padding:'4px 6px', border:'1px solid #fed7aa' } },
        h('input', { type:'number', step:'0.001', value:cur[group][key],
          onChange:function(e){ set(group, key, e.target.value); },
          style:{ width:'72px', padding:'5px 7px', border:'1px solid #fb923c', borderRadius:'4px', fontSize:'12px', textAlign:'center', fontFamily:'inherit', fontWeight:700, color:'#c2410c', background:'#fff' } }),
        h('span', { style:{ marginLeft:'3px', fontSize:'10px', color:'#c2410c', fontWeight:600 } }, '% ' + (suffix||''))
      )
    );
  }

  var coll = useCollapse('insurance', false);
  return h('div', { style:{ marginBottom:'12px' } },
    h('div', { style:{ fontSize:'12px', fontWeight:700, color:'#475569', padding:'6px 0 4px', borderBottom:'2px solid #1e40af', marginBottom:'12px', display:'flex', alignItems:'center', gap:'8px', userSelect:'none' } },
      h('span', null, '4대보험 요율')
    ),
    h('div', null,
    h('div', { style:{ background:'#eff6ff', border:'1px solid #bfdbfe', borderRadius:'8px', padding:'7px 10px', marginBottom:'8px' } },
      h('div', { style:{ fontSize:'11px', fontWeight:700, color:'#1e40af', marginBottom:'3px' } }, '🛡️ 4대보험 요율 안내'),
      h('div', { style:{ fontSize:'10px', color:'#1e3a8a', lineHeight:1.3 } },
        h('div', null, '• 연도별 요율을 관리하여 급여대장·퇴직정산에서 정확한 계산에 사용'),
        h('div', null, '• 국민연금·건강보험은 보건복지부, 고용·산재는 고용노동부 고시 기준'),
        h('div', null, '• 월별급여 모듈이 이 설정을 자동 참조합니다')
      )
    ),
    h('div', { style:{ display:'flex', alignItems:'center', gap:'6px', flexWrap:'wrap', marginBottom:'8px' } },
      h('label', { style:{ fontSize:'11px', fontWeight:600, color:'#475569' } }, '연도:'),
      h('select', { value:year, onChange:function(e){ setYear(parseInt(e.target.value,10)); },
        style:{ padding:'4px 7px', border:'1px solid #cbd5e1', borderRadius:'4px', fontSize:'11.5px', fontFamily:'inherit', fontWeight:600 } },
        years.map(function(yy){ return h('option', { key:yy, value:yy }, yy + '년'); })),
      h('button', { onClick:addNextYear,
        style:{ background:'#dbeafe', color:'#1e40af', padding:'3px 8px', borderRadius:'4px', fontSize:'11px', fontWeight:600, cursor:'pointer', border:'1px solid #bfdbfe' } }, '+ 내년 요율 추가'),
      h('div', { style:{ flex:1 } }),
      h('button', { onClick:resetThisYear,
        style:{ background:'#fef2f2', color:'#dc2626', padding:'3px 8px', borderRadius:'4px', fontSize:'11px', fontWeight:600, cursor:'pointer', border:'1px solid #fecaca' } },
        '↻ ' + year + '년 기본값 복원')
    ),
    h('div', { style:{ background:'#fff', border:'1px solid #e5e7eb', borderRadius:'6px', padding:'6px 8px' } },
      h('div', { style:{ display:'flex', alignItems:'center', gap:'4px', marginBottom:'5px' } },
        h('span', { style:{ fontSize:'13px' } }, '💼'),
        h('span', { style:{ fontSize:'12px', fontWeight:700, color:'#1e293b' } }, year + '년 요율 (%)')
      ),
      h('div', { style:{ display:'grid', gridTemplateColumns:'180px 1fr 1fr', gap:'8px', padding:'6px 4px', borderBottom:'2px solid #e5e7eb', fontSize:'10px', fontWeight:700, color:'#64748b' } },
        h('div', null, '보험'),
        h('div', { style:{ textAlign:'center', background:'#eff6ff', color:'#1e40af', padding:'5px 8px', borderRadius:'6px', border:'1px solid #bfdbfe', fontWeight:700, fontSize:'11px' } }, '👤 근로자 부담 (EE)'),
        h('div', { style:{ textAlign:'center', background:'#fff7ed', color:'#c2410c', padding:'5px 8px', borderRadius:'6px', border:'1px solid #fed7aa', fontWeight:700, fontSize:'11px' } }, '🏢 사업주 부담 (ER)')
      ),
      rowDouble('국민연금',     null,                   'pension', 'ee', 'er'),
      rowDouble('건강보험',     null,                   'health',  'ee', 'er'),
      rowSingle('장기요양',     '건강보험 대비',        'longterm','rate', '(건강보험료 × 12.81%)'),
      rowDouble('고용보험',     null,                   'employment','ee','er'),
      rowSingle('산재보험',     '업종 평균',            'injury',  'rate', '(사업주 전액)')
    )
    ) // end coll.open (insurance)
  );
}

// ============ 간이세액표 (근로소득세 구간) ============
// 국세청 간이세액표 요약 - 과세급여 기준 누진 구간
// 지방소득세는 소득세의 10%
var WITHHOLDING_DEFAULT = [
  { upto:1060000,  base:0,      rate:0,  note:'비과세' },
  { upto:1500000,  base:0,      rate:6,  note:'기본 0원 + 초과분 6%' },
  { upto:3000000,  base:26400,  rate:15, note:'기본 26,400원 + 초과분 15%' },
  { upto:4500000,  base:251400, rate:24, note:'기본 251,400원 + 초과분 24%' },
  { upto:null,     base:611400, rate:35, note:'기본 611,400원 + 초과분 35%' }
];

function WithholdingTaxSection(){
  var existing = dbGet('withholding_brackets', null);
  if(!existing){ dbSet('withholding_brackets', WITHHOLDING_DEFAULT); existing = WITHHOLDING_DEFAULT; }
  var b = useState(existing); var brackets = b[0]; var setBrackets = b[1];

  function persist(arr){ setBrackets(arr); dbSet('withholding_brackets', arr); }
  function setRow(idx, key, v){
    var num;
    if(key === 'note'){ num = v; }
    else if(key === 'upto'){ num = (v === '' || v == null) ? null : parseInt(v.replace(/,/g,'')||0, 10); }
    else { num = parseFloat(v); if(isNaN(num)) num = 0; }
    var next = brackets.slice();
    next[idx] = Object.assign({}, next[idx], (function(){var x={}; x[key]=num; return x;})());
    persist(next);
  }
  function reset(){ persist(WITHHOLDING_DEFAULT.slice()); showToast('기본값 복원'); }

  return h('div', { style:{ marginBottom:'12px' } },
    h('div', { style:{ fontSize:'12px', fontWeight:700, color:'#475569', padding:'6px 0 4px', borderBottom:'2px solid #1e40af', marginBottom:'12px', display:'flex', alignItems:'center', gap:'8px', userSelect:'none' } },
      h('span', null, '📊'),
      h('span', null, '간이세액표 (근로소득세 구간)'),
      h('div', { style:{ flex:1 } }),
      h('button', { onClick:function(e){ e.stopPropagation(); reset(); },
        style:{ background:'#fef2f2', color:'#dc2626', padding:'3px 8px', borderRadius:'4px', fontSize:'11px', fontWeight:600, cursor:'pointer', border:'1px solid #fecaca' } }, '기본값 복원')
    ),
    h('div', null,
    h('div', { style:{ fontSize:'10.5px', color:'#64748b', marginBottom:'5px', lineHeight:1.3 } },
      '과세급여 기준 · 국세청 간이세액표 · 지방소득세=소득세×10%'
    ),
    h('table', { className:'dt' },
      h('thead', null, h('tr', null,
        h('th', null, '과세급여 구간 (원)'),
        h('th', { className:'ar' }, '기본 세액 (원)'),
        h('th', { className:'ar' }, '초과분 세율 (%)'),
        h('th', null, '비고')
      )),
      h('tbody', null,
        brackets.map(function(b, idx){
          var prev = idx === 0 ? 0 : brackets[idx-1].upto;
          var rangeText = b.upto == null
            ? fmtNum(prev) + ' 초과 ~'
            : (idx === 0 ? '~ ' + fmtNum(b.upto) : fmtNum(prev) + ' 초과 ~ ' + fmtNum(b.upto));
          return h('tr', { key:idx },
            h('td', { style:{ fontFamily:'monospace', fontSize:'10.5px', padding:'4px 6px' } }, rangeText),
            h('td', { className:'ar' },
              h('input', { type:'text', value:fmtNum(b.base),
                onChange:function(e){ setRow(idx, 'base', e.target.value.replace(/,/g,'')); },
                style:{ width:'120px', padding:'5px 8px', border:'1px solid #cbd5e1', borderRadius:'4px', fontSize:'12px', textAlign:'right', fontFamily:'monospace' } })),
            h('td', { className:'ar' },
              h('input', { type:'number', step:'0.1', value:b.rate,
                onChange:function(e){ setRow(idx, 'rate', e.target.value); },
                style:{ width:'70px', padding:'5px 8px', border:'1px solid #cbd5e1', borderRadius:'4px', fontSize:'12px', textAlign:'right', fontFamily:'monospace' } })),
            h('td', { style:{ fontSize:'11.5px', color:'#64748b' } }, b.note || '')
          );
        })
      )
    )
    ) // end coll.open (tax)
  );
}

// ============ 사용자 + 성과% 통합 ============
// 사용자 마스터(사번/이름/직책/권한/지사/상태) + 담당자 성과%
// 캡쳐와 같은 형태: 테이블에서 모든 정보를 한 번에 보고 수정

// 사용자 정렬: sortOrder가 있으면 그대로, 없으면 사번 자연 정렬 (P-001 < P-002 < ... < A-001 < A-002)
function sortUsers(arr){
  return arr.slice().sort(function(a, b){
    // P-(노무사) 먼저, A-(직원/사무) 다음, 각 그룹 내 번호 순
    function key(sid){
      var m = (sid||'').match(/^([A-Z]+)-?0*(\d+)$/);
      if(!m) return [99, 9999];
      var prefix = m[1] === 'P' ? 0 : m[1] === 'A' ? 1 : 2;
      return [prefix, parseInt(m[2], 10)];
    }
    var ka = key(a.sid); var kb = key(b.sid);
    if(ka[0] !== kb[0]) return ka[0] - kb[0];
    return ka[1] - kb[1];
  });
}

// 사번 체계 마이그레이션 (1회 실행)


function UserWithRateSection(){
  // 누락된 시드 직원 자동 보정 (sid 또는 이름 기준으로 검사)
  (function ensureSeedUsers(){
    try {
      var current = dbGet('user_accounts', null);
      if(!current || !Array.isArray(current)){ if(fbSeedAllowed()) dbSet('user_accounts', USERS_SEED.slice()); return; }
      var sidSet = {}, nameSet = {};
      current.forEach(function(u){
        if(u.sid) sidSet[u.sid] = true;
        if(u.name) nameSet[u.name] = true;
      });
      var added = false;
      USERS_SEED.forEach(function(seed){
        if(!sidSet[seed.sid]){
          // sid가 없을 때: 이름 같은 항목이 있으면 sid/loginId만 업데이트
          var existByName = current.find(function(u){ return u.name === seed.name; });
          if(existByName){
            existByName.sid = seed.sid;
            existByName.loginId = seed.loginId;
          } else {
            current.push(Object.assign({}, seed));
          }
          added = true;
        }
      });
      if(added){
        current.sort(function(a,b){ return (a.sortOrder||999) - (b.sortOrder||999); });
        if(fbSeedAllowed()) dbSet('user_accounts', current);
      }
    } catch(e){ window._erpErrLog && window._erpErrLog(e); }
  })();

  var existing = dbGet('user_accounts', null);
  if(!existing){ if(fbSeedAllowed()){ dbSet('user_accounts', USERS_SEED); existing = USERS_SEED; } else { existing = USERS_SEED.slice(); } }
  var u = useState(existing); var users = u[0]; var setUsers = u[1];

  var savedRates = dbGet('mgr_rates', null) || {};
  var rt = useState(savedRates); var rates = rt[0]; var setRates = rt[1];

  var q = useState(''); var query = q[0]; var setQuery = q[1];
  var fl = useState('all'); var filter = fl[0]; var setFilter = fl[1];
  var sr = useState(true); var showRetired = sr[0]; var setShowRetired = sr[1];
  var m = useState(null); var modal = m[0]; var setModal = m[1];
  // 휴직 입력 모달
  var lm = useState(null); var leaveModal = lm[0]; var setLeaveModal = lm[1];

  // 드래그 state
  var d = useState(null); var dragSid = d[0]; var setDragSid = d[1];
  var o = useState(null); var overSid = o[0]; var setOverSid = o[1];

  function persistUsers(list){
    // 정렬 후 sortOrder 부여 (드래그 결과 유지)
    var ordered = sortUsers(list);
    ordered.forEach(function(u, i){ u.sortOrder = (i+1) * 10; });
    setUsers(ordered); dbSet('user_accounts', ordered);
  }
  function persistRates(next){ setRates(next); dbSet('mgr_rates', next); }

  // 성과율 로컬 입력값 (onChange로 자유 편집, blur/Enter 시에만 setPct 팝업)
  var lp = useState({}); var localPct = lp[0]; var setLocalPct = lp[1];

  // 드래그&드롭: 행 순서 변경
  function onDragStart(sid){ return function(e){
    setDragSid(sid);
    e.dataTransfer.effectAllowed = 'move';
  }; }
  function onDragOver(sid){ return function(e){
    e.preventDefault();
    if(sid !== overSid) setOverSid(sid);
  }; }
  function onDragLeave(){ setOverSid(null); }
  function onDrop(targetSid){ return function(e){
    e.preventDefault();
    if(!dragSid || dragSid === targetSid){ setDragSid(null); setOverSid(null); return; }
    var srcIdx = users.findIndex(function(u){ return u.sid === dragSid; });
    var dstIdx = users.findIndex(function(u){ return u.sid === targetSid; });
    if(srcIdx < 0 || dstIdx < 0){ setDragSid(null); setOverSid(null); return; }
    var next = users.slice();
    var moved = next.splice(srcIdx, 1)[0];
    next.splice(dstIdx, 0, moved);
    // sortOrder 재부여
    next.forEach(function(u, i){ u.sortOrder = (i+1) * 10; });
    setUsers(next); dbSet('user_accounts', next);
    setDragSid(null); setOverSid(null);
  }; }
  function onDragEnd(){ setDragSid(null); setOverSid(null); }

  // 성과율 헬퍼: 사용자 → 기본값 + 시드 + 저장값
  function pctOf(user){
    if(rates[user.sid] != null && rates[user.sid].pct != null) return rates[user.sid].pct;
    if(MGR_PCT_SEED[user.sid] != null) return MGR_PCT_SEED[user.sid];
    if(isLawyerByUser(user)) return DEFAULT_MGR_PCT['노무사'];
    return DEFAULT_MGR_PCT['직원'];
  }
  function setPct(sid, v, opts){
    opts = opts || {};
    var num = Math.max(0, Math.min(100, parseInt(v||0,10)));
    if(isNaN(num)) return;
    var u2 = users.find(function(x){ return x.sid === sid; });
    var role = u2 && isLawyerByUser(u2) ? '노무사' : '직원';
    var oldPct = (rates[sid] && rates[sid].pct);
    if(oldPct === num){ return; } // 변경 없음
    var oldHistory = (rates[sid] && Array.isArray(rates[sid].history)) ? rates[sid].history : [];
    // 적용일 자동 = 오늘 (prompt 제거)
    var effectiveFrom = todayYMD();
    // 오늘 같은 효력일 항목은 덮어쓰기 (매 keystroke 누적 방지)
    var historyWithoutToday = oldHistory.filter(function(h){ return h.effectiveFrom !== effectiveFrom; });
    // history는 최신 변경이 맨 앞 (effectiveFrom 내림차순)
    var newHistory = [{ effectiveFrom:effectiveFrom, pct:num, changedAt:(new Date()).toISOString(), prevPct:(oldPct!=null?oldPct:null) }].concat(historyWithoutToday);
    var next = Object.assign({}, rates);
    next[sid] = { sid:sid, name:(u2?u2.name:''), role:role, pct:num, history:newHistory };
    persistRates(next);
    if(!opts.silent){
      showToast((u2?u2.name:sid) + ' 성과율: ' + (oldPct!=null?oldPct:'-') + '% → ' + num + '% (오늘부터 적용)');
    }
  }

  function openAdd(){ setModal({ mode:'add', user:null }); }
  function openEdit(user){ setModal({ mode:'edit', user:user }); }
  function close(){ setModal(null); }
  function save(form){
    if(modal.mode === 'add'){
      if(users.find(function(x){ return x.sid === form.sid; })){ showToast('사번 중복'); return; }
      persistUsers(users.concat([form]));
      // 신규 사용자 기본 성과율도 자동 설정
      setPct(form.sid, isLawyerByUser(form) ? 15 : 13);
      showToast('추가됨');
    } else {
      // A안: 사용자관리는 계정 필드(권한·로그인ID·비밀번호)만 수정한다.
      // 이름·직책·지사·상태·주민번호 등 인사정보는 근로자명부 소관 →
      // 최신 저장본을 다시 읽어 인사필드를 절대 덮어쓰지 않도록 병합 저장.
      var latest = dbGet('user_accounts', users) || users;
      persistUsers(latest.map(function(x){ return x.sid === form.sid
        ? Object.assign({}, x, { role: form.role, loginId: form.loginId, loginPw: form.loginPw })
        : x; }));
      showToast('수정됨');
    }
    close();
  }
  function del(sid){
    persistUsers(users.filter(function(x){ return x.sid !== sid; }));
    var nextRates = Object.assign({}, rates); delete nextRates[sid];
    persistRates(nextRates);
    // 보안 권한도 같이 정리
    var perms = dbGet('security_perms', null) || {};
    if(perms[sid]){ delete perms[sid]; dbSet('security_perms', perms); }
    showToast('삭제됨');
  }
  function reseed(){
    persistUsers(USERS_SEED.slice());
    // 시드 성과율로 초기화
    var seedRates = {};
    USERS_SEED.forEach(function(u){
      var p = MGR_PCT_SEED[u.sid] != null ? MGR_PCT_SEED[u.sid] : (isLawyerByUser(u) ? 15 : 13);
      var roleLabel = isAdminByUser(u) ? '관리자' : isLawyerByUser(u) ? '노무사' : '직원';
      seedRates[u.sid] = { sid:u.sid, name:u.name, role: roleLabel, pct:p };
    });
    persistRates(seedRates);
    showToast('시드 12명 + 성과율 복원됨');
  }

  var sorted = sortUsers(users);
  var filtered = sorted.filter(function(x){
    // 퇴사자 숨김 (토글 시에만 표시)
    if(x.status === 'retired' && !showRetired) return false;
    // 관리자/노무사/직원 필터
    if(filter === 'admin'  && !isAdminByUser(x))  return false;
    if(filter === 'lawyer' && !isLawyerByUser(x)) return false;
    if(filter === 'staff'  && !isStaffByUser(x))  return false;
    // 검색 필터
    if(!query) return true;
    var qq = query.toLowerCase();
    return x.sid.toLowerCase().indexOf(qq)>=0
        || x.name.indexOf(query)>=0
        || (x.title||'').indexOf(query)>=0;
  });

  // 카운트 (3그룹 정확히, 퇴사자 제외)
  var activeUsers = users.filter(function(u){ return u.status !== 'retired'; });
  var retiredCount2 = users.filter(function(u){ return u.status === 'retired'; }).length;
  var adminCount  = activeUsers.filter(isAdminByUser).length;
  var lawyerCount = activeUsers.filter(isLawyerByUser).length;
  var staffCount  = activeUsers.filter(isStaffByUser).length;
  var coll = useCollapse('user', true);

  return h('div', { style:{ marginBottom:'12px' } },
    h('div', { style:{ fontSize:'12px', fontWeight:700, color:'#475569', padding:'6px 0 4px', borderBottom:'2px solid #1e40af', marginBottom:'12px', display:'flex', alignItems:'center', gap:'8px', userSelect:'none' } },
      h('span', null, '👥'),
      h('span', null, '사용자 관리'),
      h('span', { style:{ background:'#e2e8f0', color:'#475569', fontSize:'11px', padding:'2px 8px', borderRadius:'10px', fontWeight:600 } }, users.length + '명'),
      h('div', { style:{ flex:1 } })
    ),
    h('div', null,
    h('div', { style:{ fontSize:'10.5px', color:'#64748b', marginBottom:'6px' } },
      '계정·권한·성과% 관리 (성과%는 입금 시 자동 분배)'),
    h('div', { className:'dt-toolbar' },
      h('span', { style:{ fontSize:'11px', color:'#94a3b8', marginRight:'4px' }, title:'신규 직원은 근로자명부에서 등록하세요' }, '👤 신규 등록 → 근로자명부'),
      h('input', { className:'dt-search', placeholder:'🔍 사번·이름·직책 검색', value:query, onChange:function(e){ setQuery(e.target.value); } }),
      // 필터 토글
      h('div', { style:{ display:'inline-flex', gap:'4px', marginLeft:'8px' } },
        [
          { v:'all',    label:'전체',   count: activeUsers.length, color:'#475569' },
          { v:'admin',  label:'👑 관리자', count: adminCount,  color:'#dc2626' },
          { v:'lawyer', label:'⚖️ 노무사', count: lawyerCount, color:'#2563eb' },
          { v:'staff',  label:'👜 직원',   count: staffCount, color:'#2563eb' }
        ].map(function(o){
          var active = filter === o.v;
          return h('button', { key:o.v,
            onClick:function(){ setFilter(o.v); },
            style:{
              background: active ? o.color : '#fff',
              color: active ? '#fff' : o.color,
              border: '1px solid '+o.color,
              padding:'3px 7px', borderRadius:'4px',
              fontSize:'10.5px', fontWeight:600, cursor:'pointer'
            } },
            o.label + ' (' + o.count + ')'
          );
        })
      ),
      h('div', { className:'sp' }),
      h('button', { onClick:function(){ setShowRetired(!showRetired); },
        style:{ padding:'3px 8px', fontSize:'10.5px', fontWeight:600, cursor:'pointer', borderRadius:'4px',
          border:'1px solid '+(showRetired?'#dc2626':'#cbd5e1'),
          background:showRetired?'#fee2e2':'#f8fafc',
          color:showRetired?'#dc2626':'#64748b' } },
        (showRetired?'👁 퇴사자 숨기기':'👁 퇴사자 '+retiredCount2+'명 보기')),
      h('button', { className:'btn-secondary', onClick:reseed, title:'시드 12명 + 성과율로 복원' }, '시드 복원')
    ),
    h('table', { className:'dt user-tbl' },
      h('thead', null, h('tr', null,
        h('th', { style:{ width:'18px' } }, ''),
        h('th', null, '사번'),
        h('th', null, '이름'),
        h('th', null, '직책'),
        h('th', null, '권한'),
        h('th', null, '지사'),
        h('th', null, '상태'),
        h('th', { className:'ac' }, '담당'),
        h('th', { className:'ac' }, '성과%'),
        h('th', { className:'ac' }, '아이디'),
        h('th', { className:'ac' }, '비번'),
        h('th', { className:'ac' }, '관리')
      )),
      h('tbody', null,
        filtered.length === 0
          ? h('tr', null, h('td', { colSpan:12, className:'ac', style:{ color:'#94a3b8', padding:'30px' } }, '등록된 데이터가 없습니다'))
          : filtered.map(function(x){
              var ri = roleInfo(x.role);
              var isAdmin = isAdminByUser(x);
              var isLawyer = isLawyerByUser(x);
              var pctColor = (isAdmin || isLawyer) ? '#2563eb' : '#2563eb';
              var isDragging = dragSid === x.sid;
              var isOver = overSid === x.sid && dragSid && dragSid !== x.sid;
              return h('tr', { key:x.sid,
                draggable: true,
                onDragStart: onDragStart(x.sid),
                onDragOver: onDragOver(x.sid),
                onDragLeave: onDragLeave,
                onDrop: onDrop(x.sid),
                onDragEnd: onDragEnd,
                style: {
                  opacity: isDragging ? .5 : 1,
                  background: isOver ? '#dbeafe' : undefined,
                  cursor: 'grab'
                } },
                h('td', { style:{ color:'#94a3b8', textAlign:'center', userSelect:'none' } }, '⋮⋮'),
                h('td', { style:{ fontFamily:'monospace', fontWeight:600 } }, x.sid),
                h('td', { style:{ fontWeight:600 } }, x.name),
                h('td', null, x.title || '-'),
                h('td', null, h('span', { className:'tag '+ri.tag }, ri.label)),
                h('td', null, x.branch),
                h('td', null,
                  h('select', {
                    value: x.status || 'active',
                    onChange: async function(e){
                      var newStatus = e.target.value;
                      // 휴직 선택 시 → 모달 열기 (시작일·종료예정일·사유 입력)
                      if(newStatus === 'leave'){
                        setLeaveModal({
                          sid: x.sid,
                          name: x.name,
                          leaveStartDate: x.leaveStartDate || todayYMD(),
                          leaveEndDate: x.leaveEndDate || '',
                          leaveReason: x.leaveReason || ''
                        });
                        return;
                      }
                      // ★ 퇴사 처리 시 다단계 확인 + 자동 차단
                      if(newStatus === 'retired' && x.status !== 'retired'){
                        var confirmMsg = '"' + x.name + '" (' + x.sid + ') 직원을 퇴사 처리하시겠습니까?\n\n→ 즉시 시스템 접근 차단\n→ 비밀번호 자동 무효화\n→ 자동 로그인 키 삭제\n→ 감사 로그 기록\n\n이 작업은 되돌릴 수 있지만, 비밀번호는 재설정해야 합니다.';
                        if(!(await popConfirm(confirmMsg))) return;
                      }
                      var prevStatus = x.status || 'active';
                      var updated = users.map(function(u){
                        if(u.sid !== x.sid) return u;
                        var next = Object.assign({}, u, { status: newStatus });
                        if(newStatus === 'retired'){
                          if(!next.retireDate) next.retireDate = todayYMD();
                          // 비밀번호 무효화 (랜덤 토큰으로 변경)
                          next.password = 'RETIRED-' + Math.random().toString(36).slice(2,12).toUpperCase();
                          // 자동 로그인 키 삭제 (해당 사용자가 자동 로그인된 경우)
                          if(getAutoLogin() === x.sid) clearAutoLogin();
                          // 현재 로그인 세션이 본인이면 강제 로그아웃
                          if(getSessionSid() === x.sid){
                            setTimeout(function(){ forceLogout('본인이 퇴사 처리되어 로그아웃됩니다.'); }, 500);
                          }
                        }
                        if(newStatus === 'active'){
                          next.retireDate = '';
                          next.leaveReason = '';
                          next.leaveStartDate = '';
                          next.leaveEndDate = '';
                        }
                        return next;
                      });
                      persist(updated);
                      // ★ LoA(휴직 기록) 자동 양방향 동기화
                      try {
                        var allLoa = dbGet('leave_of_absence', []);
                        var today = todayYMD();
                        if(newStatus === 'leave'){
                          // status='leave'로 변경: 활성 LoA 없으면 자동 생성
                          var hasActive = allLoa.find(function(l){return l.sid===x.sid && l.status!=='ended';});
                          if(!hasActive){
                            allLoa.push({
                              id:'lv-auto-'+x.sid+'-'+Date.now(),
                              sid:x.sid, code:'personal',
                              startDate: today, endDate: '',
                              reason:'환경설정에서 자동 동기화',
                              status:'active',
                              createdAt:(new Date()).toISOString(),
                              createdBy: CURRENT_USER ? CURRENT_USER.name : '',
                              typeLabel:'기타', paidType:'', payrollPause:false
                            });
                            dbSet('leave_of_absence', allLoa);
                          }
                        } else if(prevStatus === 'leave' && newStatus !== 'leave'){
                          // status='leave' → 다른 상태로 변경: 활성 LoA 자동 종료
                          var changed = false;
                          allLoa = allLoa.map(function(l){
                            if(l.sid===x.sid && l.status!=='ended'){
                              changed = true;
                              return Object.assign({}, l, { status:'ended', endedDate:today });
                            }
                            return l;
                          });
                          if(changed) dbSet('leave_of_absence', allLoa);
                        }
                      } catch(e){ console.error('[LoA sync]', e && e.message); }
                      // ★ 감사 로그
                      if(typeof AuditLog !== 'undefined' && AuditLog.write){
                        AuditLog.write('user', x.sid, 'status', prevStatus, newStatus,
                          newStatus==='retired' ? '퇴사 처리 (비번 무효화 + 자동로그인 삭제)' :
                          newStatus==='active'  ? '재직 복귀 (LoA 자동 종료)' :
                          newStatus==='leave'   ? '휴직 변경 (LoA 자동 등록)' :
                          '상태 변경');
                      }
                      if(newStatus === 'retired'){
                        showToast('🔒 ' + x.name + ' 퇴사 처리 — 시스템 접근 차단됨');
                      }
                    },
                    style: {
                      padding:'2px 3px', borderRadius:'4px', fontSize:'10.5px', fontWeight:700, maxWidth:'60px',
                      border:'1px solid '+(x.status==='active'?'#86efac':x.status==='leave'?'#fdba74':'#cbd5e1'),
                      background: x.status==='active'?'#d1fae5':x.status==='leave'?'#ffedd5':'#f1f5f9',
                      color: x.status==='active'?'#0f766e':x.status==='leave'?'#9a3412':'#6b7280',
                      cursor:'pointer'
                    },
                    title: x.status==='leave' ? '휴직 - 담당자/캘린더에서 자동 제외 (status 기반)' : ''
                  },
                    h('option', { value:'active' }, '재직'),
                    h('option', { value:'leave' }, '휴직'),
                    h('option', { value:'retired' }, '퇴직')
                  )
                ),
                // 담당 토글 (active일 때만 의미 있음)
                h('td', { className:'ac' },
                  (function(){
                    var assignStatus = getUserAssignStatus(x.sid);
                    var excluded = !!x.excludeFromAssign;
                    var onLeave = assignStatus.reason === 'leave';
                    if(x.status !== 'active'){
                      return h('span', { style:{ color:'#94a3b8', fontSize:'10.5px' } }, '-');
                    }
                    return h('div', { style:{ display:'inline-flex', flexDirection:'column', alignItems:'center', gap:'4px' } },
                      h('button', {
                        onClick: function(){
                          var updated = users.map(function(u){
                            if(u.sid !== x.sid) return u;
                            return Object.assign({}, u, { excludeFromAssign: !u.excludeFromAssign });
                          });
                          persist(updated);
                        },
                        title: excluded ? '담당 가능으로 변경' : '담당 배제 (드롭다운에서 숨김)',
                        style: {
                          padding:'2px 5px', borderRadius:'10px', fontSize:'10.5px', fontWeight:700,
                          border:'1px solid '+(excluded?'#fca5a5':'#86efac'),
                          background: excluded?'#fef2f2':'#dcfce7',
                          color: excluded?'#b91c1c':'#166534',
                          cursor:'pointer', whiteSpace:'nowrap'
                        }
                      }, excluded ? '🚫 배제' : '💼 가능'),
                      onLeave && h('span', { style:{ fontSize:'10px', color:'#2563eb', fontWeight:700 }, title:assignStatus.label }, '🏠 휴직중')
                    );
                  })()
                ),
                h('td', { className:'ac' },
                  x.status === 'active'
                    ? h('div', { style:{ display:'inline-flex', alignItems:'center', gap:'4px' } },
                        h('input', { type:'number',
                          className:'no-spinner',
                          value: localPct[x.sid] != null ? localPct[x.sid] : pctOf(x),
                          onChange:function(e){
                            var v = e.target.value;
                            // 화면용 localPct 업데이트
                            var nxt = Object.assign({}, localPct);
                            nxt[x.sid] = v;
                            setLocalPct(nxt);
                            // ★ 즉시 저장 (silent — 토스트 없음). 빈 값은 저장 안 함.
                            if(v !== '' && v != null){
                              setPct(x.sid, v, {silent:true});
                            }
                          },
                          onBlur:function(e){
                            // 입력 완료: localPct 정리 + 토스트 한 번
                            var v = localPct[x.sid] != null ? localPct[x.sid] : pctOf(x);
                            var nxt = Object.assign({}, localPct);
                            delete nxt[x.sid];
                            setLocalPct(nxt);
                            if(String(v) !== String(pctOf(x))) setPct(x.sid, v);
                          },
                          onKeyDown:function(e){
                            if(e.key === 'Enter') e.target.blur();
                            if(e.key === 'Escape'){
                              var nxt = Object.assign({}, localPct);
                              delete nxt[x.sid];
                              setLocalPct(nxt);
                            }
                          },
                          style:{ width:'40px', padding:'3px 4px', border:'2px solid '+pctColor, borderRadius:'4px', fontSize:'11.5px', fontWeight:700, textAlign:'center', color:pctColor, fontFamily:'inherit' } }),
                        h('span', { style:{ fontSize:'11px', color:'#64748b' } }, '%'))
                    : h('span', { style:{ color:'#94a3b8', fontSize:'11px' } }, '-')
                ),
                h('td', { className:'ac' },
                  h('span', { style:{fontSize:'11px',color:'#475569',fontFamily:'monospace',fontWeight:600} },
                    x.loginId || x.sid)
                ),
                h('td', { className:'ac' },
                  x.sid === 'P-001'
                    ? h('span', { style:{fontSize:'10.5px',color:'#16a34a',fontWeight:700,background:'#dcfce7',padding:'2px 6px',borderRadius:'4px'} }, '자동')
                    : h('div', { style:{display:'inline-flex',alignItems:'center',gap:'4px'} },
                        h('span', { style:{fontSize:'10px', color: x.loginPw ? '#16a34a':'#dc2626', fontWeight:600} },
                          x.loginPw ? '🔒 설정됨':'⚠️ 미설정'),
                        h('button', { className:'dt-row-btn',
                          style:{fontSize:'10px',padding:'2px 6px',background:'#f1f5f9',color:'#475569',border:'1px solid #cbd5e1',borderRadius:'5px',cursor:'pointer'},
                          title:'비번을 1234로 초기화',
                          onClick:async function(){
                            if(!(await popConfirm(x.name+'님 비번을 1234로 초기화할까요?'))) return;
                            var arr = dbGet('user_accounts', USERS_SEED).slice();
                            var idx = arr.findIndex(function(u){ return u.sid === x.sid; });
                            if(idx < 0){ showToast('사용자 없음'); return; }
                            arr[idx] = Object.assign({}, arr[idx], { loginPw:defaultLoginPw() });
                            window._pwResetIntent = x.sid; // 의도적 초기화 — 비번보호 가드 1회 우회
                            persistUsers(arr);
                            setUsers(arr);
                            showToast(x.name+' 비번 1234로 초기화 완료');
                          } }, '🔄')
                      )
                ),
                h('td', { className:'ac' },
                  h('button', { className:'dt-row-btn edit', onClick:function(){ openEdit(x); } }, '수정'),
                  h('button', { className:'dt-row-btn del',  onClick:function(){ del(x.sid); } }, '삭제')
                )
              );
            })
      )
    ),
    modal && h(UserAccountModal, { user:modal.user, allUsers:users, onSave:save, onClose:close }),
    // 휴직 입력 모달
    leaveModal && h('div', { className:'modal-bg',
      onClick:function(e){ if(e.target===e.currentTarget) setLeaveModal(null); } },
      h('div', { className:'modal', style:{ width:'480px' }, onClick:function(e){e.stopPropagation();} },
        h('div', { className:'modal-h' },
          h('div', { className:'t' }, '🏠 휴직 처리 - ' + leaveModal.name),
          h('button', { className:'x', onClick:function(){ setLeaveModal(null); } }, '×')
        ),
        h('div', { className:'modal-b' },
          h('div', { style:{ background:'#fff7ed', border:'1px solid #fed7aa', borderRadius:'6px', padding:'8px 12px', marginBottom:'14px', fontSize:'11.5px', color:'#9a3412' } },
            '⚠️ 휴직 처리 시 담당자 드롭다운·캘린더에서 자동 제외됩니다. 활성으로 복귀할 때 [재직]으로 변경하세요.'),
          h('div', { className:'fld' }, h('label', null, '휴직 시작일 *'),
            h(KoreanDatePicker, { value: leaveModal.leaveStartDate,
              onChange: function(e){ setLeaveModal(Object.assign({}, leaveModal, { leaveStartDate: e.target.value })); } })),
          h('div', { className:'fld' }, h('label', null, '복귀 예정일 (선택)'),
            h(KoreanDatePicker, { value: leaveModal.leaveEndDate,
              onChange: function(e){ setLeaveModal(Object.assign({}, leaveModal, { leaveEndDate: e.target.value })); } })),
          h('div', { className:'fld' }, h('label', null, '사유 (선택)'),
            h('textarea', { value: leaveModal.leaveReason||'',
              placeholder: '육아휴직 / 병가 / 개인사정 등',
              onChange: function(e){ setLeaveModal(Object.assign({}, leaveModal, { leaveReason: e.target.value })); },
              rows: 3, style:{ width:'100%' } }))
        ),
        h('div', { className:'modal-f' },
          h('button', { className:'btn-secondary', onClick:function(){ setLeaveModal(null); } }, '취소'),
          h('button', { className:'btn-primary',
            style:{ background:'#ea580c', borderColor:'#ea580c' },
            onClick: function(){
              if(!leaveModal.leaveStartDate){ showToast('시작일 입력'); return; }
              var updated = users.map(function(u){
                if(u.sid !== leaveModal.sid) return u;
                return Object.assign({}, u, {
                  status: 'leave',
                  leaveStartDate: leaveModal.leaveStartDate,
                  leaveEndDate: leaveModal.leaveEndDate,
                  leaveReason: leaveModal.leaveReason
                });
              });
              persistUsers(updated);
              setLeaveModal(null);
              showToast(leaveModal.name + ' 휴직 처리됨');
            } }, '🏠 휴직 처리')
        )
      )
    )
    ) // end coll.open
  );
}


// ============ 한국식 커스텀 Date Picker ============
// input[type=date] 대체용. props: value(YYYY-MM-DD), onChange(e: {target:{value}}), style, placeholder, disabled
// 전역 캘린더 ID: 동시에 하나만 열리게
var _dpOpenId = { current: null };

function KoreanDatePicker(props){
  var idRef = useRef(Math.random().toString(36).slice(2));
  var myId = idRef.current;
  var openS = useState(false); var open = openS[0]; var setOpen = openS[1];
  var refEl = useRef(null); // 위치 계산용
  var openUpS = useState(false); var openUp = openUpS[0]; var setOpenUp = openUpS[1];
  var posS = useState({top:0,left:0}); var pos = posS[0]; var setPos = posS[1];
  var v = props.value || '';
  var initYM = v ? v.slice(0,7) : todayYM();
  var ymS = useState(initYM); var viewYM = ymS[0]; var setViewYM = ymS[1];

  // 외부 클릭 시 닫기 + 하나만 열리게
  useEffect(function(){
    if(!open) return;
    _dpOpenId.current = myId;
    function onDocDown(e){
      var tg = e.target;
      if(tg && tg.closest && (tg.closest('[data-datepicker-popup]') || tg.closest('[data-datepicker-field]'))) return;
      setOpen(false);
      if(_dpOpenId.current === myId) _dpOpenId.current = null;
    }
    document.addEventListener('mousedown', onDocDown);
    return function(){ document.removeEventListener('mousedown', onDocDown); };
  }, [open]);

  // 열릴 위치 계산 (화면 아래쪽 공간 부족하면 위로)
  function calcOpenUp(){
    if(!refEl.current) return false;
    var rect = refEl.current.getBoundingClientRect();
    var spaceBelow = window.innerHeight - rect.bottom;
    return spaceBelow < 280; // 캘린더 높이 약 260px
  }

  function handleToggle(){
    if(props.disabled) return;
    // 다른 캘린더 닫기 (커스텀 이벤트)
    if(_dpOpenId.current && _dpOpenId.current !== myId){
      document.dispatchEvent(new CustomEvent('dp-close-others', { detail: myId }));
    }
    var nextOpen = !open;
    if(nextOpen){ setOpenUp(calcOpenUp()); setPos(calcPos()); }
    setOpen(nextOpen);
  }

  useEffect(function(){
    function onCloseOthers(e){
      if(e.detail !== myId) setOpen(false);
    }
    document.addEventListener('dp-close-others', onCloseOthers);
    return function(){ document.removeEventListener('dp-close-others', onCloseOthers); };
  }, [myId]);

  function fmtKo(d){
    if(!d) return '';
    var p = (d||'').split('-');
    if(p.length<3) return d;
    return p[0]+'.'+p[1]+'.'+p[2];
  }
  function changeMonth(delta){
    var y = parseInt(viewYM.slice(0,4),10), m = parseInt(viewYM.slice(5,7),10);
    var d = new Date(y, m-1+delta, 1);
    setViewYM(d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'));
  }
  function selectDate(d){
    if(props.onChange) props.onChange({ target:{ value:d }, currentTarget:{ value:d } });
    setOpen(false);
  }
  function clearDate(){
    if(props.onChange) props.onChange({ target:{ value:'' }, currentTarget:{ value:'' } });
    setOpen(false);
  }
  function buildGrid(){
    var y = parseInt(viewYM.slice(0,4),10), m = parseInt(viewYM.slice(5,7),10);
    var startDay = (new Date(y, m-1, 1)).getDay();
    var totalDays = (new Date(y, m, 0)).getDate();
    var cells = [];
    for(var i=0; i<startDay; i++) cells.push(null);
    for(var d=1; d<=totalDays; d++){
      cells.push(y+'-'+String(m).padStart(2,'0')+'-'+String(d).padStart(2,'0'));
    }
    while(cells.length % 7 !== 0) cells.push(null);
    return cells;
  }

  var cells = buildGrid();
  var vy = parseInt(viewYM.slice(0,4),10), vm = parseInt(viewYM.slice(5,7),10);
  var todayStr = todayYMD();

  // 입력 필드 스타일 - 외부 style의 width 적용
  var fieldStyle = Object.assign({
    padding:'7px 10px', border:'1px solid #cbd5e1', borderRadius:'4px', fontSize:'12px',
    cursor: props.disabled?'not-allowed':'pointer', background:'#fff',
    display:'flex', alignItems:'center', gap:'6px', minWidth:'130px',
    userSelect:'none', boxSizing:'border-box', fontFamily:'inherit'
  }, props.style||{});

  // 좌우 위치: 오른쪽 공간 부족하면 right:0 (left:auto)
  var openLeftS = useState(true); var openLeft = openLeftS[0]; var setOpenLeft = openLeftS[1];
  function calcOpenLeft(){
    if(!refEl.current) return true;
    var rect = refEl.current.getBoundingClientRect();
    return (rect.left + 260) <= window.innerWidth - 8;
  }
  // 팝업(달력) 뷰포트 고정 좌표 — 모달 overflow/transform에 상관없이 화면 안에 표시
  function calcPos(){
    if(!refEl.current) return {top:0,left:0};
    var rect = refEl.current.getBoundingClientRect();
    var W = 260, H = 316, M = 8;
    var left = rect.left;
    if(left + W > window.innerWidth - M) left = Math.max(M, rect.right - W);
    if(left < M) left = M;
    var top = rect.bottom + 4;
    if(top + H > window.innerHeight - M){
      var up = rect.top - H - 4;
      top = (up >= M) ? up : Math.max(M, window.innerHeight - M - H);
    }
    return { top: top, left: left };
  }
  // handleToggle에 left 계산 추가는 useEffect로 처리
  useEffect(function(){
    if(open){ setOpenLeft(calcOpenLeft()); setPos(calcPos()); }
  }, [open]);

  return h('div', { ref:refEl, style:{ position:'relative', display: (props.style && props.style.width === '100%') ? 'block' : 'inline-block', width: (props.style && props.style.width === '100%') ? '100%' : 'auto' } },
    h('div', { 'data-datepicker-field':'1', onClick:handleToggle, style:fieldStyle },
      h('span', { style:{ flex:1, color: v?'#1e293b':'#94a3b8' } }, v ? fmtKo(v) : (props.placeholder||'날짜 선택')),
      v && !props.disabled && h('span', { title:'날짜 초기화',
        onClick:function(e){ e.stopPropagation(); clearDate(); },
        style:{ fontSize:'11px', color:'#94a3b8', cursor:'pointer', padding:'0 2px',
          lineHeight:1, borderRadius:'50%', fontWeight:700,
          ':hover':{ color:'#ef4444' } } }, '✕'),
      h('span', { style:{ fontSize:'12px', color:'#64748b' } }, '📅')
    ),
    open && React.createPortal(h('div', { 'data-datepicker-popup':'1', onClick:function(e){e.stopPropagation();},
      style:{ position:'fixed',
        top: pos.top + 'px',
        left: pos.left + 'px',
        zIndex:10001,
        background:'#fff', border:'1px solid #e2e8f0', borderRadius:'8px',
        boxShadow:'0 8px 24px rgba(0,0,0,0.18)', padding:'12px', width:'260px' } },
        h('div', { style:{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'10px' } },
          h('div', { style:{ display:'flex', alignItems:'center', gap:'4px' } },
            h('button', { onClick:function(){changeMonth(-12);}, title:'이전 해',
              style:{ background:'none', border:'none', cursor:'pointer', fontSize:'13px', color:'#64748b', padding:'4px 6px', borderRadius:'4px', fontFamily:'inherit' } }, '«'),
            h('button', { onClick:function(){changeMonth(-1);}, title:'이전 달',
              style:{ background:'none', border:'none', cursor:'pointer', fontSize:'15px', color:'#64748b', padding:'4px 6px', borderRadius:'4px', fontFamily:'inherit' } }, '‹'),
            h('span', { style:{ fontSize:'13px', fontWeight:700, color:'#1e293b', padding:'0 4px' } }, vy+'년')
          ),
          h('div', { style:{ display:'flex', alignItems:'center', gap:'4px' } },
            h('select', { value:vm, onChange:function(e){ setViewYM(vy+'-'+String(parseInt(e.target.value,10)).padStart(2,'0')); },
              style:{ padding:'3px 6px', border:'1px solid #e2e8f0', borderRadius:'4px', fontSize:'12px', cursor:'pointer', background:'#fff', fontFamily:'inherit' } },
              [1,2,3,4,5,6,7,8,9,10,11,12].map(function(n){
                return h('option', { key:n, value:n }, n+'월');
              })),
            h('button', { onClick:function(){changeMonth(1);}, title:'다음 달',
              style:{ background:'none', border:'none', cursor:'pointer', fontSize:'15px', color:'#64748b', padding:'4px 6px', borderRadius:'4px', fontFamily:'inherit' } }, '›'),
            h('button', { onClick:function(){changeMonth(12);}, title:'다음 해',
              style:{ background:'none', border:'none', cursor:'pointer', fontSize:'13px', color:'#64748b', padding:'4px 6px', borderRadius:'4px', fontFamily:'inherit' } }, '»')
          )
        ),
        h('div', { style:{ display:'grid', gridTemplateColumns:'repeat(7, 1fr)', marginBottom:'4px' } },
          ['일','월','화','수','목','금','토'].map(function(dw, i){
            return h('div', { key:i, style:{ padding:'4px', textAlign:'center', fontSize:'11px', fontWeight:700,
              color: i===0?'#dc2626':i===6?'#1e40af':'#64748b' } }, dw);
          })
        ),
        h('div', { style:{ display:'grid', gridTemplateColumns:'repeat(7, 1fr)', gap:'4px' } },
          cells.map(function(c, i){
            if(!c) return h('div', { key:'e-'+i });
            var dow = i % 7;
            var isSelected = c === v;
            var isToday = c === todayStr;
            return h('button', { key:c, onClick:function(){selectDate(c);},
              style:{ padding:'6px 2px', border: isSelected?'2px solid #1e40af':'1px solid transparent',
                background: isSelected?'#dbeafe':(isToday?'#fef3c7':'#fff'), borderRadius:'4px',
                cursor:'pointer', fontSize:'12px', fontFamily:'inherit',
                color: dow===0?'#dc2626':dow===6?'#1e40af':'#1e293b',
                fontWeight: (isSelected||isToday)?700:500 },
              onMouseEnter:function(e){ if(!isSelected) e.currentTarget.style.background='#f1f5f9'; },
              onMouseLeave:function(e){ if(!isSelected) e.currentTarget.style.background = isToday?'#fef3c7':'#fff'; }
            }, parseInt(c.slice(8),10));
          })
        )
      ), document.body)
  );
}

