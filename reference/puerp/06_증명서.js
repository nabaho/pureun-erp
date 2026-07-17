// ============================================================
// 증명서 발급 (Certificate) - 재직/경력/연봉증명서
// ============================================================
function Certificate(){
  var users = getActiveUsers();
  var company = dbGet('company_info', { name:'푸른노무법인', ceo:'권형하', bizNum:'312-81-52792',
    addr:'충청남도 천안시 서북구 원두정8길 6', phone:'041-XXX-XXXX' });

  var ks = useState('employment'); var kind = ks[0]; var setKind = ks[1];
  var ss = useState(users[0] ? users[0].sid : ''); var sid = ss[0]; var setSid = ss[1];
  var ps = useState(''); var purpose = ps[0]; var setPurpose = ps[1];
  var ds = useState(todayYMD()); var issueDate = ds[0]; var setIssueDate = ds[1];
  // 담당자 - company_info 기본값, 발급 시 변경 가능
  var cn = useState(company.contactName || ''); var contactName = cn[0]; var setContactName = cn[1];
  var ct = useState(company.contactTitle || ''); var contactTitle = ct[0]; var setContactTitle = ct[1];
  var cp = useState(company.contactPhone || ''); var contactPhone = cp[0]; var setContactPhone = cp[1];
  var ds2 = useState(''); var dutyInput = ds2[0]; var setDutyInput = ds2[1];

  var KINDS = [
    { v:'employment', label:'재직증명서', desc:'현재 재직 중임을 증명' },
    { v:'career',     label:'경력증명서', desc:'근무 이력 및 경력 증명' }
  ];

  var retiredUsers = sortUsers(dbGet('user_accounts', USERS_SEED).filter(function(x){return x.status==='retired';}));
  var u = users.concat(retiredUsers).find(function(x){return x.sid===sid;}) || users[0];
  var kindLabel = (KINDS.find(function(k){return k.v===kind;})||{}).label;

  // 연봉 계산 (전년도 12개월 합계)
  function calcAnnualSalary(targetSid){
    var prevYear = String((new Date()).getFullYear()-1);
    var pms = dbGet('payroll_monthly', []);
    var total = 0;
    for(var m=1; m<=12; m++){
      var ym = prevYear + '-' + String(m).padStart(2,'0');
      var rec = pms.find(function(x){return x.sid===targetSid && x.ym===ym;});
      if(rec){
        total += (rec.baseSalary||0) + (rec.mealAllowance||0) + (rec.vehicleAllowance||0) + (rec.bonus||0) + (rec.perfBonus||0);
        (rec.otherAllowances||[]).forEach(function(a){ total += a.amount||0; });
      }
    }
    return total;
  }

  // 근속 기간 계산
  

  // 발급 로그 저장
  function saveLog(method){
    if(!u) return;
    var log = dbGet('cert_log', []);
    log.unshift({
      id: 'cl-' + Date.now().toString(36)+Math.random().toString(36).slice(2,5),
      issuedAt: (new Date()).toISOString(),
      kind: kind,
      kindLabel: kindLabel,
      targetSid: sid,
      targetName: u.name,
      targetTitle: u.title || '',
      purpose: purpose || '(미기재)',
      issuedBy: (typeof CURRENT_USER !== 'undefined' ? CURRENT_USER.name : null) || (dbGet('current_user', {}) || {}).name || '관리자',
      contactName: contactName || company.contactName || '',
      method: method  // 'print' | 'download'
    });
    dbSet('cert_log', log);
  }

  function printCert(){
    var w = window.open('', '_blank', 'width=800,height=900');
    if(!w){ showToast('팝업 차단을 해제하세요'); return; }
    var __cp = document.getElementById('cert-preview');
    if(!__cp){ try{ w.close(); }catch(e){} showToast('미리보기가 준비되지 않았습니다'); return; }
    var content = __cp.innerHTML;
    w.document.write('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>'+kindLabel+'</title>'
      + '<style>'
      + '@page { size: A4; margin: 25mm 20mm; }'
      + 'body { font-family: "Malgun Gothic","맑은 고딕",sans-serif; padding:0; margin:0; color:#202124; }'
      + '.cert-doc { max-width: 700px; margin: 0 auto; }'
      + 'h1 { text-align:center; font-size: 28px; letter-spacing: 1em; margin: 20px 0 35px; padding-right: 0; }'
      + '.cert-table { width:100%; border-collapse:collapse; margin: 20px 0; }'
      + '.cert-table th, .cert-table td { border: 1px solid #333; padding: 12px 14px; font-size: 13px; }'
      + '.cert-table th { background:#f3f4f6; font-weight:600; width: 25%; text-align:center; }'
      + '.cert-purpose { margin: 30px 0; padding: 16px; border: 1px solid #333; font-size: 13px; line-height: 1.7; }'
      + '.cert-stamp { text-align:center; margin-top: 50px; font-size: 14px; line-height: 2.2; }'
      + '.cert-company { font-size: 18px; font-weight: 700; }'
      + '.cert-ceo { font-size: 16px; font-weight: 600; margin-top: 8px; }'
      + '.cert-stamp-box { display: inline-block; width: 80px; height: 80px; border: 2px solid #c00; color:#c00; '
      + '   border-radius: 50%; line-height: 76px; font-weight: 700; margin-left: 8px; vertical-align: middle; }'
      + '@media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }'
      + '</style></head><body><div class="cert-doc">' + content + '</div>'
      + '<script>setTimeout(function(){window.print();}, 200);<\/script></body></html>');
    w.document.close();
    saveLog('print');
    showToast('📃 ' + kindLabel + ' 인쇄 - 발급 이력 저장됨');
  }

  function downloadHTML(){
    var __cp = document.getElementById('cert-preview');
    if(!__cp){ showToast('미리보기가 준비되지 않았습니다'); return; }
    var content = __cp.outerHTML;
    var html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>'+kindLabel+'_'+(u?u.name:'')+'</title>'
      + '<style>body{font-family:"Malgun Gothic",sans-serif;padding:30px;}table{border-collapse:collapse;width:100%;}'
      + 'th,td{border:1px solid #333;padding:12px;}th{background:#f3f4f6;}'
      + 'h1{text-align:center;font-size:28px;letter-spacing:1em;}</style></head><body>' + content + '</body></html>';
    var blob = new Blob([html], { type:'text/html;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = kindLabel+'_'+(u?u.name:'')+'_'+issueDate+'.html'; a.click();
    URL.revokeObjectURL(url);
    saveLog('download');
    showToast('📥 다운로드 - 발급 이력 저장됨');
  }

  // 증명서 본문 데이터
  function renderCertContent(){
    if(!u) return h('div', { style:{ padding:'40px', textAlign:'center', color:'#94a3b8' } }, '직원을 선택하세요');

    // 발급일 한글 포맷
    function formatKDate(s){
      if(!s) return '-';
      var p = s.split('-');
      return p[0]+'년 '+parseInt(p[1],10).toString().padStart(2,'0')+'월 '+parseInt(p[2],10).toString().padStart(2,'0')+'일';
    }

    // 재직기간 표시
    var hireDateText = u.hireDate ? formatKDate(u.hireDate) : '-';
    var endDateText;
    if(kind === 'employment'){
      // 재직증명서: 항상 "현재"
      endDateText = '현재';
    } else if(kind === 'career'){
      // 경력증명서: 퇴직자면 퇴직일, 재직자면 발급일
      endDateText = u.retireDate ? formatKDate(u.retireDate) : formatKDate(issueDate);
    } else {
      endDateText = '현재';
    }

    // 증명 문구
    var statementText;
    if(kind === 'employment'){
      statementText = '상기 자는 위와 같이 당 법인에 재직하였음을 증명함.';
    } else if(kind === 'career'){
      statementText = u.retireDate
        ? '상기 자는 위와 같이 당 법인에 근무하였음을 증명함.'
        : '상기 자는 위와 같이 당 법인에 근무하고 있음을 증명함.';
    } else {
      var prevYear = String((new Date()).getFullYear()-1);
      statementText = '상기 자의 ' + prevYear + '년 연봉이 위와 같음을 증명함.';
    }

    // 본문 표 행 (kind에 따라)
    var bodyRows = [];
    if(kind === 'employment' || kind === 'career'){
      bodyRows.push({ label:'직장명', value: company.name || '-' });
      bodyRows.push({ label:'직명 및 직위', value: u.title || '-' });
      bodyRows.push({
        label: kind==='employment' ? '재직기간' : '근무기간',
        value: h('div', null,
          h('div', null, hireDateText),
          h('div', { style:{ marginTop:'4px' } }, '~  ' + endDateText)
        )
      });
      // 경력증명서 - 담당업무 추가 (있는 경우)
      if(kind === 'career'){
        if(u.retireDate){
          bodyRows.push({ label:'퇴직일', value: formatKDate(u.retireDate) });
        }
        var dutyText = dutyInput || u.duties || (u.title === '대표노무사' ? '노무법인 운영, 노무자문' : u.title==='노무사' ? '노무자문, 사건수임, 컨설팅' : (u.title||'-'));
        bodyRows.push({ label:'담당업무', value: dutyText });
      }
    } else if(kind === 'salary'){
      var annual = calcAnnualSalary(u.sid);
      var prevYear = String((new Date()).getFullYear()-1);
      bodyRows.push({ label:'직장명', value: company.name || '-' });
      bodyRows.push({ label:'직명 및 직위', value: u.title || '-' });
      bodyRows.push({ label:'입사일', value: hireDateText });
      bodyRows.push({ label: prevYear + '년 연봉', value: annual.toLocaleString() + ' 원' });
      bodyRows.push({ label:'월 평 균', value: Math.round(annual/12).toLocaleString() + ' 원' });
    }

    var documentBorder = '1px solid #000';
    var labelCellStyle = { border:documentBorder, padding:'18px 14px', background:'#fff', fontWeight:700, width:'30%', textAlign:'center', fontSize:'14px', letterSpacing:'1px', verticalAlign:'middle' };
    var valueCellStyle = { border:documentBorder, padding:'18px 18px', fontSize:'14px', verticalAlign:'middle', lineHeight:'1.6' };

    return h('div', { id:'cert-preview', className:'cert-doc',
      style:{ fontFamily:'"Malgun Gothic", "맑은 고딕", sans-serif', color:'#000', minHeight:'1050px' } },

      // 제목 (가운데 + 글자간격 + 밑줄)
      h('div', { style:{ textAlign:'center', margin:'30px 0 30px' } },
        h('h1', { style:{ display:'inline-block', fontSize:'28px', fontWeight:700, letterSpacing:'10px',
          paddingBottom:'5px', borderBottom:'2px solid #000', margin:0 } },
          kindLabel.split('').join(' '))
      ),

      // 헤더 박스 (개인정보 + 담당자)
      h('div', { style:{ border:documentBorder, borderBottom:'none', padding:'18px 20px', fontSize:'13.5px', lineHeight:'2.0' } },
        h('div', { style:{ display:'flex' } },
          h('div', { style:{ width:'100px', fontWeight:700, textAlignLast:'justify' } }, '성명'),
          h('div', { style:{ marginRight:'8px' } }, ': '),
          h('div', { style:{ letterSpacing:'0.5em', fontWeight:600 } }, u.name || '-')
        ),
        h('div', { style:{ display:'flex' } },
          h('div', { style:{ width:'100px', fontWeight:700, textAlignLast:'justify' } }, '생년월일'),
          h('div', { style:{ marginRight:'8px' } }, ': '),
          h('div', { style:{ fontFamily:'monospace' } }, u.birthDate || '-')
        ),
        h('div', { style:{ display:'flex' } },
          h('div', { style:{ width:'100px', fontWeight:700, textAlignLast:'justify' } }, '담당자'),
          h('div', { style:{ marginRight:'8px' } }, ': '),
          h('div', null,
            (contactName || company.contactName || '김보람')
              + ' ' + (contactTitle || company.contactTitle || '과장')
              + ((contactPhone || company.contactPhone) ? '  (☎ ' + (contactPhone || company.contactPhone) + ')' : '')
          )
        )
      ),

      // 본문 표
      h('table', { style:{ width:'100%', borderCollapse:'collapse', margin:'0' } },
        h('tbody', null,
          bodyRows.map(function(r, i){
            return h('tr', { key:i },
              h('th', { style:labelCellStyle }, r.label),
              h('td', { style:valueCellStyle }, r.value)
            );
          })
        )
      ),

      // 증명 문구 + 직인 (테두리 안)
      h('div', { style:{ border:documentBorder, borderTop:'none', padding:'50px 20px 60px', textAlign:'center', fontSize:'14px', lineHeight:'2' } },
        h('div', { style:{ marginBottom:'40px', letterSpacing:'1px' } }, statementText),
        purpose && h('div', { style:{ fontSize:'12px', color:'#444', marginBottom:'30px', letterSpacing:'0.5px' } },
          '※ 용도 : ' + purpose),
        h('div', { style:{ fontSize:'15px', marginBottom:'30px', letterSpacing:'2px' } }, formatKDate(issueDate)),
        h('div', { style:{ display:'inline-flex', alignItems:'center', justifyContent:'center', position:'relative' } },
          h('span', { style:{ fontSize:'22px', fontWeight:700, letterSpacing:'8px' } }, company.name || '푸른노무법인'),
          (function(){
            var stamp = company.stampDataUrl || (typeof DEFAULT_STAMP_DATAURL !== 'undefined' ? DEFAULT_STAMP_DATAURL : '');
            return stamp ? h(AsyncImg, { src:stamp, alt:'직인',
              style:{ width:'72px', height:'72px', marginLeft:'12px', marginRight:'-30px',
                position:'relative', top:'4px', objectFit:'contain' } }) : null;
          })()
        )
      )
    );
  }

  return h('div', { className:'page' },
    h('div', { style:{ display:'grid', gridTemplateColumns:'1fr 380px', gap:'14px', alignItems:'start' } },

      // ── 좌: 발급 폼 + 미리보기 ──
      h('div', null,
        // 입력 폼
        h('div', { style:{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:'10px', padding:'10px', marginBottom:'10px' } },
          h('div', { style:{ display:'grid', gridTemplateColumns:'repeat(2, 1fr)', gap:'6px' } },
            h('div', null,
              h('label', { style:{ fontSize:'10.5px', fontWeight:600, color:'#475569', display:'block', marginBottom:'2px' } }, '증명서 종류'),
              h('select', { value:kind, onChange:function(e){setKind(e.target.value);},
                style:{ width:'100%', padding:'5px 8px', border:'1px solid #cbd5e1', borderRadius:'4px', fontSize:'11.5px' } },
                KINDS.map(function(k){return h('option', { key:k.v, value:k.v }, k.label);})
              )
            ),
            h('div', null,
              h('label', { style:{ fontSize:'10.5px', fontWeight:600, color:'#475569', display:'block', marginBottom:'2px' } }, '재직직원'),
              h('select', { value: users.some(function(x){return x.sid===sid;}) ? sid : '', onChange:function(e){ if(e.target.value) setSid(e.target.value); },
                style:{ width:'100%', padding:'5px 8px', border:'1px solid #cbd5e1', borderRadius:'4px', fontSize:'11.5px' } },
                [h('option', { key:'__none', value:'' }, '재직직원 선택')].concat(
                  users.map(function(x){return h('option', { key:x.sid, value:x.sid }, x.name+' ('+x.title+')');}))
              )
            ),
            h('div', null,
              h('label', { style:{ fontSize:'10.5px', fontWeight:600, color:'#475569', display:'block', marginBottom:'2px' } }, '퇴직직원'),
              h('select', { value: retiredUsers.some(function(x){return x.sid===sid;}) ? sid : '', onChange:function(e){ if(e.target.value){ setSid(e.target.value); setKind('career'); } },
                style:{ width:'100%', padding:'5px 8px', border:'1px solid #cbd5e1', borderRadius:'4px', fontSize:'11.5px' } },
                [h('option', { key:'__none', value:'' }, retiredUsers.length ? '퇴직직원 선택' : '퇴직직원 없음')].concat(
                  retiredUsers.map(function(x){return h('option', { key:x.sid, value:x.sid }, x.name+' ('+x.title+')');}))
              )
            ),
            h('div', null,
              h('label', { style:{ fontSize:'10.5px', fontWeight:600, color:'#475569', display:'block', marginBottom:'2px' } }, '발급일'),
              h(KoreanDatePicker, { value:issueDate, onChange:function(e){setIssueDate(e.target.value);},
                style:{ width:'100%', padding:'7px 10px', border:'1px solid #cbd5e1', borderRadius:'6px', fontSize:'12.5px' } })
            )
          ),
          h('div', { style:{ marginTop:'6px' } },
            h('label', { style:{ fontSize:'10.5px', fontWeight:600, color:'#475569', display:'block', marginBottom:'2px' } }, '용도·제출처 *'),
            h('input', { type:'text', value:purpose, onChange:function(e){setPurpose(e.target.value);},
              placeholder:'예) 은행 대출 신청용, 비자 발급용, 정부지원사업 신청용 등',
              style:{ width:'100%', padding:'5px 8px', border:'1px solid #cbd5e1', borderRadius:'4px', fontSize:'12.5px' } })
          ),
          // 담당자 변경
          h('div', { style:{ marginTop:'6px', display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'4px' } },
            h('div', null,
              h('label', { style:{ fontSize:'10.5px', fontWeight:600, color:'#475569', display:'block', marginBottom:'2px' } }, '담당자 이름'),
              h('input', { type:'text', value:contactName, onChange:function(e){setContactName(e.target.value);},
                placeholder:'예) 김보람',
                style:{ width:'100%', padding:'5px 8px', border:'1px solid #cbd5e1', borderRadius:'4px', fontSize:'11.5px' } })
            ),
            h('div', null,
              h('label', { style:{ fontSize:'10.5px', fontWeight:600, color:'#475569', display:'block', marginBottom:'2px' } }, '직위'),
              h('input', { type:'text', value:contactTitle, onChange:function(e){setContactTitle(e.target.value);},
                placeholder:'예) 과장',
                style:{ width:'100%', padding:'5px 8px', border:'1px solid #cbd5e1', borderRadius:'4px', fontSize:'11.5px' } })
            ),
            h('div', null,
              h('label', { style:{ fontSize:'10.5px', fontWeight:600, color:'#475569', display:'block', marginBottom:'2px' } }, '연락처'),
              h('input', { type:'text', value:contactPhone, onChange:function(e){setContactPhone(e.target.value);},
                placeholder:'예) 041-556-0035',
                style:{ width:'100%', padding:'5px 8px', border:'1px solid #cbd5e1', borderRadius:'4px', fontSize:'12px' } })
            )
          ),
          kind === 'career' && h('div', { style:{ marginTop:'10px' } },
            h('label', { style:{ fontSize:'10.5px', fontWeight:600, color:'#475569', display:'block', marginBottom:'2px' } }, '담당업무 (직접 입력)'),
            h('input', { type:'text', value:dutyInput, onChange:function(e){setDutyInput(e.target.value);},
              placeholder:'비워두면 직위에 따라 자동 입력 (예: 노무자문, 사건수임, 컨설팅)',
              style:{ width:'100%', padding:'5px 8px', border:'1px solid #cbd5e1', borderRadius:'4px', fontSize:'12px' } })
          ),
          h('div', { style:{ marginTop:'8px', display:'flex', gap:'6px' } },
            h('button', { onClick:printCert,
              style:{ padding:'5px 12px', background:'#1e40af', color:'#fff', border:'none', borderRadius:'4px', cursor:'pointer', fontSize:'11.5px', fontWeight:700 } }, '🖨️ 인쇄/PDF'),
            h('button', { onClick:downloadHTML,
              style:{ padding:'5px 12px', background:'#fff', color:'#1e40af', border:'1px solid #1e40af', borderRadius:'4px', cursor:'pointer', fontSize:'12px', fontWeight:700 } }, '⬇ HTML 저장'),
            h('div', { style:{ flex:1 } }),
            h('div', { style:{ fontSize:'10.5px', color:'#94a3b8', alignSelf:'center' } },
              '💡 인쇄 시 "PDF로 저장" 선택 → PDF 파일')
          )
        ),
        // 미리보기
        h('div', { style:{ fontSize:'11px', color:'#94a3b8', fontWeight:600, marginBottom:'6px' } }, '── 미리보기 ──'),
        h('div', { style:{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:'10px', padding:'30px 40px',
          boxShadow:'0 2px 8px rgba(0,0,0,0.04)' } },
          renderCertContent()
        )
      ),

      // ── 우: 발급 이력 ──
      h(CertLog, null)
    )
  );
}

// ── 발급 이력 컴포넌트 ──
function CertLog(){
  var ls = useState(dbGet('cert_log', [])); var log = ls[0]; var setLog = ls[1];
  
  var fs = useState(''); var filter = fs[0]; var setFilter = fs[1];

  var KIND_COLOR = { employment:'#1e40af', career:'#059669', salary:'#d97706' };
  var KIND_BG    = { employment:'#dbeafe', career:'#dcfce7', salary:'#fef3c7' };
  var METHOD_LABEL = { print:'🖨️ 인쇄', download:'⬇ 다운' };

  var filtered = log.filter(function(r){
    if(!filter) return true;
    return (r.targetName||'').indexOf(filter) >= 0
      || (r.kindLabel||'').indexOf(filter) >= 0
      || (r.purpose||'').indexOf(filter) >= 0
      || (r.issuedBy||'').indexOf(filter) >= 0;
  });

  async function delLog(id){
    if(!(await popConfirm('이 발급 이력을 삭제하시겠습니까?'))) return;
    var _prev=log.slice(); var updated = log.filter(function(r){return r.id!==id;});
    dbSet('cert_log', updated);
    setLog(updated);
    showToastUndo('🗑️ 삭제됨', function(){dbSet('cert_log',_prev); setLog(_prev);});
  }

  function downloadLogCSV(){
    var rows = [['발급일시','종류','대상직원','직위','용도·제출처','발급자','방법']];
    log.forEach(function(r){
      rows.push([
        (r.issuedAt||'').replace('T',' ').slice(0,16),
        r.kindLabel||r.kind, r.targetName, r.targetTitle||'',
        r.purpose, r.issuedBy,
        r.method==='print'?'인쇄':'다운로드'
      ]);
    });
    var csv = '\uFEFF' + rows.map(function(r){
      return r.map(function(c){return '"'+(c||'').replace(/"/g,'""')+'"';}).join(',');
    }).join('\n');
    var blob = new Blob([csv],{type:'text/csv;charset=utf-8'});
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a'); a.href=url; a.download='증명서_발급이력.csv'; a.click();
    URL.revokeObjectURL(url);
    showToast('CSV 다운로드');
  }

  var thS = { padding:'7px 8px', textAlign:'left', fontWeight:700, fontSize:'10.5px', color:'#475569', background:'#f8fafc', borderBottom:'1px solid #e2e8f0' };
  var tdS = { padding:'6px 8px', borderBottom:'1px solid #f1f5f9', fontSize:'10.5px', verticalAlign:'top' };

  return h('div', null,
    h('div', { style:{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'8px' } },
      h('div', { style:{ fontWeight:700, fontSize:'13px', color:'#1e293b' } },
        '📋 발급 이력',
        h('span', { style:{ fontSize:'11px', color:'#94a3b8', fontWeight:400, marginLeft:'6px' } }, '총 '+log.length+'건')
      ),
      h('button', { onClick:downloadLogCSV,
        style:{ padding:'4px 10px', background:'#fff', border:'1px solid #cbd5e1', borderRadius:'4px', cursor:'pointer', fontSize:'10.5px', color:'#475569', fontWeight:600 } },
        '⬇ CSV')
    ),
    h('input', { type:'text', placeholder:'🔍 이름·종류·용도·발급자 검색', value:filter,
      onChange:function(e){setFilter(e.target.value);},
      style:{ width:'100%', padding:'7px 10px', border:'1px solid #e2e8f0', borderRadius:'6px', fontSize:'11.5px', marginBottom:'8px', boxSizing:'border-box' } }),

    filtered.length === 0
      ? h('div', { style:{ background:'#f8fafc', borderRadius:'8px', padding:'40px', textAlign:'center', color:'#94a3b8', fontSize:'12px' } },
          log.length === 0 ? '발급 이력이 없습니다.\n증명서 발급 시 자동 기록됩니다.' : '검색 결과가 없습니다')
      : h('div', { style:{ border:'1px solid #e2e8f0', borderRadius:'8px', overflow:'hidden', maxHeight:'600px', overflowY:'auto' } },
          h('table', { style:{ width:'100%', borderCollapse:'collapse' } },
            h('thead', null, h('tr', null,
              h('th', { style:Object.assign({},thS,{width:'40px',textAlign:'center'}) }, '#'),
              h('th', { style:thS }, '발급 일시'),
              h('th', { style:thS }, '종류'),
              h('th', { style:thS }, '대상'),
              h('th', { style:thS }, '용도·제출처'),
              h('th', { style:thS }, '발급자'),
              h('th', { style:Object.assign({},thS,{width:'24px'}) }, '')
            )),
            h('tbody', null,
              filtered.map(function(r, idx){
                var dt = (r.issuedAt||'').replace('T',' ').slice(0,16);
                var color = KIND_COLOR[r.kind] || '#475569';
                var bg = KIND_BG[r.kind] || '#f1f5f9';
                return h('tr', { key:r.id, style:{ borderBottom:'1px solid #f1f5f9' } },
                  h('td', { style:Object.assign({},tdS,{textAlign:'center',color:'#94a3b8',fontFamily:'monospace',fontSize:'11px'}) }, idx+1),
                  h('td', { style:Object.assign({},tdS,{fontFamily:'monospace',fontSize:'10px',color:'#64748b',whiteSpace:'nowrap'}) },
                    dt.slice(0,10),
                    h('div', { style:{ fontSize:'10px', color:'#94a3b8' } }, dt.slice(11)),
                    h('div', { style:{ fontSize:'10px', color:'#94a3b8', marginTop:'1px' } }, METHOD_LABEL[r.method]||r.method)
                  ),
                  h('td', { style:tdS },
                    h('span', { style:{ background:bg, color:color, fontSize:'10.5px', padding:'1px 6px', borderRadius:'8px', fontWeight:700, whiteSpace:'nowrap' } },
                      r.kindLabel||r.kind)
                  ),
                  h('td', { style:Object.assign({},tdS,{fontWeight:600}) },
                    r.targetName,
                    r.targetTitle && h('div', { style:{ fontSize:'10px', color:'#94a3b8' } }, r.targetTitle)
                  ),
                  h('td', { style:Object.assign({},tdS,{color:'#475569',maxWidth:'100px',wordBreak:'break-all'}) },
                    r.purpose || '-'),
                  h('td', { style:Object.assign({},tdS,{color:'#64748b',whiteSpace:'nowrap'}) }, r.issuedBy||'-'),
                  h('td', { style:Object.assign({},tdS,{textAlign:'center',padding:'4px'}) },
                    h('button', { onClick:function(){delLog(r.id);},
                      style:{ background:'none', border:'none', color:'#dc2626', fontSize:'12px', cursor:'pointer' } }, '×'))
                );
              })
            )
          )
        ),
    h('div', { style:{ marginTop:'8px', fontSize:'10px', color:'#94a3b8', lineHeight:'1.6' } },
      '💡 인쇄·다운로드 시 자동 기록 | 발급자 = 로그인 계정')
  );
}

