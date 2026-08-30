'use strict';
// 푸른노무법인 ERP 공용 유틸 — pu-erp.html에서 분리 (이동만, 동작 동일)
// 전역(window) 스코프 함수로 노출: 메인 스크립트/인라인 핸들러에서 접근 가능

// ============ 토스트 ============
var toastTimer = null;
function showToast(msg, duration){
  var ex = document.querySelector('.toast'); if(ex) ex.remove();
  var d = document.createElement('div'); d.className='toast'; d.textContent = msg;
  document.body.appendChild(d);
  if(toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(function(){ d.remove(); }, duration||2000);
}

// ★ 삭제 후 취소(Undo) 토스트 — 5초 내 취소 가능
var _undoTimer = null;
var _undoCallback = null;
function showToastUndo(msg, onUndo, duration){
  duration = duration || 5000;
  // 기존 undo 토스트 제거
  var ex = document.querySelector('.toast-undo'); if(ex) ex.remove();
  if(_undoTimer) clearTimeout(_undoTimer);

  var d = document.createElement('div');
  d.className = 'toast-undo';
  d.style.cssText = [
    'position:fixed','bottom:24px','left:50%','transform:translateX(-50%)',
    'background:#1e293b','color:#fff','padding:12px 16px','border-radius:10px',
    'font-size:13px','font-weight:600','z-index:99999','display:flex',
    'align-items:center','gap:12px','box-shadow:0 4px 20px rgba(0,0,0,0.35)',
    'animation:toastIn 0.2s ease','min-width:260px','max-width:480px'
  ].join(';');

  // 진행바 div
  var bar = document.createElement('div');
  bar.style.cssText = 'position:absolute;bottom:0;left:0;height:3px;background:#f97316;border-radius:0 0 10px 10px;width:100%;transition:width linear '+duration+'ms';
  d.appendChild(bar);

  var txt = document.createElement('span');
  txt.style.flex = '1';
  txt.textContent = msg;
  d.appendChild(txt);

  var btn = document.createElement('button');
  btn.textContent = '↩ 취소';
  btn.style.cssText = [
    'padding:5px 12px','background:#f97316','color:#fff','border:none',
    'border-radius:6px','font-size:12px','font-weight:800','cursor:pointer',
    'flex-shrink:0','white-space:nowrap'
  ].join(';');
  btn.onclick = function(){
    clearTimeout(_undoTimer);
    d.remove();
    if(onUndo) onUndo();
    showToast('↩ 취소되었습니다');
  };
  d.appendChild(btn);
  document.body.appendChild(d);

  // 진행바 애니메이션 (width 0으로)
  requestAnimationFrame(function(){
    requestAnimationFrame(function(){ bar.style.width = '0%'; });
  });

  _undoTimer = setTimeout(function(){
    if(d.parentNode) d.remove();
    _undoCallback = null;
  }, duration);
  _undoCallback = onUndo;
}
// 금액 → 한글: 1234567 → "일백이십삼만사천오백육십칠"
function numToKorMoney(num){
  num = parseInt(String(num||0).replace(/[^0-9]/g, ''), 10);
  if(!num || isNaN(num)) return '영';
  var DIGITS = ['','일','이','삼','사','오','육','칠','팔','구'];
  var SMALL = ['','십','백','천'];
  var BIG = ['','만','억','조','경'];
  var s = String(num);
  var out = '';
  var grpIdx = 0;
  for(var g = s.length; g > 0; g -= 4){
    var grp = s.slice(Math.max(0, g-4), g);
    var grpStr = '';
    for(var i = 0; i < grp.length; i++){
      var d = parseInt(grp[i], 10);
      if(d > 0){
        var pos = grp.length - 1 - i;
        // '일십'·'일백'·'일천'은 '십'·'백'·'천'으로 (단, 만 단위 시작의 '일만'은 생략 가능)
        if(d === 1 && pos > 0) grpStr += SMALL[pos];
        else grpStr += DIGITS[d] + SMALL[pos];
      }
    }
    if(grpStr) out = grpStr + BIG[grpIdx] + out;
    grpIdx++;
  }
  return out || '영';
}
// 클립보드 복사
function copyToClipboard(text){
  if(!text) return;
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(text).then(function(){ showToast('📋 복사됨: ' + text); });
  } else {
    var ta = document.createElement('textarea');
    ta.value = text; ta.style.position='fixed'; ta.style.opacity='0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); showToast('📋 복사됨: ' + text); } catch(e){ window._erpErrLog && window._erpErrLog(e); }
    ta.remove();
  }
}
// 로컬(KST 등) 기준 날짜 헬퍼 — toISOString(UTC) 월/일 경계 오차 방지
function localYMD(d){ d = d || new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
// 엑셀 셀 값 → ISO 날짜(YYYY-MM-DD). Date 객체·엑셀 일련번호(45292 등)·"YYYY.MM.DD" 모두 처리
function _excelToISO(v){
  if(v instanceof Date && !isNaN(v)){ return v.getUTCFullYear()+'-'+String(v.getUTCMonth()+1).padStart(2,'0')+'-'+String(v.getUTCDate()).padStart(2,'0'); }
  var s = String(v==null?'':v).trim();
  if(/^\d{4,6}$/.test(s)){ var n=parseInt(s,10); if(n>=20000 && n<=80000){ var d=new Date(Math.round((n-25569)*86400000)); if(!isNaN(d)) return d.getUTCFullYear()+'-'+String(d.getUTCMonth()+1).padStart(2,'0')+'-'+String(d.getUTCDate()).padStart(2,'0'); } }
  return s.replace(/\./g,'-').trim();
}
function todayYMD(){ return localYMD(new Date()); }
function todayYM(){ return todayYMD().slice(0,7); }
// 정렬 헬퍼: 배열 + 키 + 방향(asc/desc) → 새 배열
function sortArray(arr, key, dir){
  if(!Array.isArray(arr) || !key) return arr;
  var sorted = arr.slice().sort(function(a, b){
    var va = a[key], vb = b[key];
    if(va == null) va = '';
    if(vb == null) vb = '';
    // 숫자 자동 인식
    var na = parseFloat(va), nb = parseFloat(vb);
    if(!isNaN(na) && !isNaN(nb) && String(va).match(/^-?[0-9.,]+$/)){
      return na - nb;
    }
    return String(va).localeCompare(String(vb), 'ko');
  });
  return dir === 'desc' ? sorted.reverse() : sorted;
}
// 엑셀 클립보드 파싱 (탭 구분 + 줄바꿈) → 2차원 배열
// 사용: textarea/input의 onPaste에서 e.clipboardData.getData('text') → parseExcelPaste
function parseExcelPaste(text){
  if(!text) return [];
  var lines = String(text).replace(/\r/g, '').split('\n').filter(function(l){ return l.length > 0; });
  return lines.map(function(line){ return line.split('\t').map(function(c){ return c.trim(); }); });
}
// ============ 모바일 친화 confirm (콜백 기반) ============
// 사용: customConfirm('정말 삭제?', function(){ /* OK */ }, function(){ /* 취소 */ });
// 기존 if(!confirm('msg')) return; 을 점진적으로 customConfirm로 교체 권장
function customConfirm(msg, onYes, onNo){
  // 기존 모달 제거
  var ex = document.getElementById('cc-modal'); if(ex) ex.remove();

  var bg = document.createElement('div');
  bg.id = 'cc-modal';
  bg.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,0.55);z-index:10000;display:flex;align-items:center;justify-content:center;padding:20px;';

  var box = document.createElement('div');
  box.style.cssText = 'background:#fff;border-radius:10px;max-width:420px;width:100%;box-shadow:0 25px 50px rgba(0,0,0,0.3);overflow:hidden;';
  box.innerHTML =
    '<div style="padding:20px 22px;border-bottom:1px solid #e5e7eb;font-size:15px;font-weight:700;color:#1e293b;">⚠️ 확인</div>'
    + '<div style="padding:20px 22px;font-size:13.5px;color:#334155;line-height:1.6;white-space:pre-wrap;"></div>'
    + '<div style="padding:14px 22px;border-top:1px solid #e5e7eb;display:flex;gap:8px;justify-content:flex-end;background:#f8fafc;">'
    + '<button id="cc-no" style="padding:8px 18px;border-radius:6px;background:#f1f5f9;color:#475569;border:1px solid #cbd5e1;font-size:13px;font-weight:600;cursor:pointer;">취소</button>'
    + '<button id="cc-yes" style="padding:8px 18px;border-radius:6px;background:#2563eb;color:#fff;border:none;font-size:13px;font-weight:700;cursor:pointer;">확인</button>'
    + '</div>';
  box.querySelector('div:nth-child(2)').textContent = msg;

  bg.appendChild(box);
  document.body.appendChild(bg);
  box.querySelector('#cc-yes').focus();

  function close(){ bg.remove(); document.removeEventListener('keydown', onKey); }
  function onKey(e){
    if(e.key === 'Escape'){ close(); if(onNo) onNo(); }
    else if(e.key === 'Enter'){ close(); if(onYes) onYes(); }
  }
  box.querySelector('#cc-yes').onclick = function(){ close(); if(onYes) onYes(); };
  box.querySelector('#cc-no').onclick  = function(){ close(); if(onNo) onNo(); };
  bg.onclick = function(e){ if(e.target === bg){ close(); if(onNo) onNo(); } };
  document.addEventListener('keydown', onKey);
}
