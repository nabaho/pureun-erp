# -*- coding: utf-8 -*-
"""
설정 카드 편집 화면(HTML) — 담당자가 값 수정·확인·저장(localStorage)
- 자동 초안(site_cards.json)을 불러와 편집 가능한 카드로 렌더.
- 급여일/산정기간/고용보험 단수처리/미등록공제/동명이인 메모를 수정 → 브라우저에 저장.
- '이 사업장 확인완료' 토글, 전체 내보내기(JSON 다운로드).
- 설계 스택(단일 HTML + localStorage 미러) 그대로. 개인정보 미포함.
- 결과: _harness_out/site_cards_edit.html
"""
import os, json

DATA_ROOT = os.environ.get(
    "PAYROLL_DATA_ROOT",
    r"C:\Users\fair0\OneDrive\바탕 화면\급여아웃소싱 서류들",
)
OUT_DIR = os.path.join(DATA_ROOT, "_harness_out")


def main():
    cards = json.load(open(os.path.join(OUT_DIR, "site_cards.json"), encoding="utf-8"))
    data_js = json.dumps(cards, ensure_ascii=False)

    doc = """<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>사업장 설정 카드 (편집) — 푸른노무법인</title>
<style>
:root{--navy:#2E3A8C;--violet:#7C6CE0;--ok:#2E7D4F;--warn:#B26A00;--bad:#C43D3D;
--ink:#23263B;--sub:#6B6F87;--line:#E3E5EF;--paper:#F5F6FA;--card:#FFF;}
*{box-sizing:border-box;margin:0}
body{font-family:'Malgun Gothic',sans-serif;background:var(--paper);color:var(--ink);font-size:14px}
.wrap{max-width:1100px;margin:0 auto;padding:22px 16px 90px}
h1{font-size:22px;letter-spacing:-.02em}
.sub{color:var(--sub);font-size:13px;margin:4px 0 6px}
.priv{display:inline-block;font-size:11px;color:var(--violet);border:1px solid var(--violet);border-radius:99px;padding:2px 10px}
.bar{display:flex;gap:12px;margin:16px 0;flex-wrap:wrap;align-items:center}
.kpi{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:8px 14px}
.kpi b{font-size:20px;color:var(--navy)} .kpi span{font-size:11px;color:var(--sub);display:block}
.exp{margin-left:auto;background:var(--navy);color:#fff;border:none;border-radius:10px;padding:10px 16px;cursor:pointer;font-size:13px}
.filters{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0 18px}
.f{border:1px solid var(--line);background:#fff;border-radius:99px;padding:6px 14px;cursor:pointer;font-size:13px}
.f.on{background:var(--navy);color:#fff;border-color:var(--navy)}
.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:14px}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:15px;transition:border-color .15s}
.card.done{border-color:var(--ok);box-shadow:0 0 0 1px var(--ok) inset}
.ch{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:2px}
.site{font-size:15px;font-weight:700;color:var(--navy)}
.b{font-size:11px;border-radius:99px;padding:2px 9px;white-space:nowrap}
.b.ok{background:#E8F3EC;color:var(--ok)} .b.warn{background:#FBF1DE;color:var(--warn)}
.meta{font-size:12px;color:var(--sub);margin:2px 0 10px}
.row{display:flex;align-items:center;gap:8px;margin:6px 0}
.row label{width:78px;font-size:12px;color:var(--sub);flex-shrink:0}
.row input,.row select{flex:1;border:1px solid var(--line);border-radius:8px;padding:6px 8px;font-size:13px;font-family:inherit}
.row input.chg,.row select.chg{border-color:var(--violet);background:#FAF9FF}
.dupe{margin-top:8px;font-size:12px;color:var(--bad)}
.gap{margin-top:6px;font-size:12px;color:var(--warn)}
.cf{margin-top:12px;display:flex;gap:8px;align-items:center}
.cf button{border:1px solid var(--line);background:#fff;border-radius:8px;padding:7px 12px;cursor:pointer;font-size:12.5px}
.cf button.done{background:var(--ok);color:#fff;border-color:var(--ok)}
.saved{font-size:11px;color:var(--ok)}
</style></head><body><div class="wrap">
<h1>사업장 설정 카드 <span style="font-size:14px;color:var(--sub)">(편집)</span></h1>
<div class="sub">담당자가 값을 확인·수정하면 이 브라우저에 저장됩니다. 개별 급여/주민번호 미포함.</div>
<span class="priv">🔒 설정값만 · 로컬 저장</span>
<div class="bar">
  <div class="kpi"><b id="k-total">0</b><span>사업장</span></div>
  <div class="kpi"><b id="k-done">0</b><span>확인완료</span></div>
  <div class="kpi"><b id="k-left">0</b><span>남음</span></div>
  <button class="exp" onclick="exportAll()">전체 설정 내보내기(JSON)</button>
</div>
<div class="filters" id="filters"></div>
<div class="cards" id="cards"></div>
</div>
<script>
const DRAFT = __DATA__;
const KEY = 'pu_site_cards_v1';
const store = JSON.parse(localStorage.getItem(KEY) || '{}');
const PAYDAYS=['1일','5일','10일','15일','20일','25일','26일','말일','미확인(사람 지정 필요)'];
const PERIODS=['1일~말일','26일~25일','25일~24일','24일~23일','21일~20일','11일~10일','미확인(사람 지정 필요)'];
const ROUNDS=['절사','올림','반올림','면제(고용보험 0)','미판정(사람 확인)'];

function val(site, field, def){ return (store[site]&&store[site][field]!=null)?store[site][field]:def; }
function setVal(site, field, v){ store[site]=store[site]||{}; store[site][field]=v; localStorage.setItem(KEY,JSON.stringify(store)); render(); }

function opts(arr, cur){ return arr.map(o=>`<option ${o===cur?'selected':''}>${o}</option>`).join(''); }

function cardHtml(c){
  const s=c.사업장, st=store[s]||{};
  const done = !!st.__done;
  const payday=val(s,'급여일',c.급여일), period=val(s,'산정기간',c.산정기간), round=val(s,'고용보험단수처리',c.고용보험.단수처리);
  const gapInfo=c.공제항목.공제총액_대조||{};
  const gapNeed=gapInfo.판정==='미등록 공제 존재';
  const extra=val(s,'미등록공제',gapNeed?(gapInfo.미등록공제_중앙값||''):'');
  const dupe=Object.keys(c.주의.동명이인_후보||{});
  const chg=(f,d)=> (st[f]!=null && st[f]!==d)?'chg':'';
  return `<div class="card ${done?'done':''}" data-h="${c.담당자||'미상'}" data-done="${done?1:0}">
    <div class="ch"><span class="site">${s}</span>${done?'<span class="b ok">확인완료</span>':'<span class="b warn">확인필요</span>'}</div>
    <div class="meta">${c.담당자||'미상'} · 직원 ${c.규모.직원레코드.toLocaleString()}건 · ${c.규모.월수}개월</div>
    <div class="row"><label>급여일</label><select class="${chg('급여일',c.급여일)}" onchange="setVal('${s}','급여일',this.value)">${opts(PAYDAYS,payday)}</select></div>
    <div class="row"><label>산정기간</label><select class="${chg('산정기간',c.산정기간)}" onchange="setVal('${s}','산정기간',this.value)">${opts(PERIODS,period)}</select></div>
    <div class="row"><label>고용보험</label><select class="${chg('고용보험단수처리',c.고용보험.단수처리)}" onchange="setVal('${s}','고용보험단수처리',this.value)">${opts(ROUNDS,round)}</select><span style="font-size:11px;color:var(--sub)">${c.고용보험.요율}</span></div>
    ${gapNeed?`<div class="gap">💡 미등록 공제 감지 (완결율 ${gapInfo.완결율})</div>`:''}
    <div class="row"><label>특수공제</label><input class="${chg('미등록공제',gapNeed?(gapInfo.미등록공제_중앙값||''):'')}" value="${extra}" placeholder="상조·기숙사 등 금액/메모" onchange="setVal('${s}','미등록공제',this.value)"></div>
    ${dupe.length?`<div class="dupe">👥 동명이인 후보: ${dupe.join(', ')}</div>`:''}
    <div class="cf">
      <button class="${done?'done':''}" onclick="toggleDone('${s}')">${done?'✓ 확인완료':'이 사업장 확인완료'}</button>
      ${st.__savedAt?`<span class="saved">저장됨</span>`:''}
    </div>
  </div>`;
}

function toggleDone(s){ store[s]=store[s]||{}; store[s].__done=!store[s].__done; store[s].__savedAt=Date.now(); localStorage.setItem(KEY,JSON.stringify(store)); render(); }

let filter='all';
function render(){
  const arr=Object.values(DRAFT).sort((a,b)=>b.규모.직원레코드-a.규모.직원레코드);
  const cont=document.getElementById('cards');
  cont.innerHTML=arr.filter(c=>{
    if(filter==='all')return true;
    if(filter==='left')return !(store[c.사업장]&&store[c.사업장].__done);
    return (c.담당자||'미상')===filter;
  }).map(cardHtml).join('');
  const done=arr.filter(c=>store[c.사업장]&&store[c.사업장].__done).length;
  document.getElementById('k-total').textContent=arr.length;
  document.getElementById('k-done').textContent=done;
  document.getElementById('k-left').textContent=arr.length-done;
}
function exportAll(){
  const merged={};
  Object.values(DRAFT).forEach(c=>{ merged[c.사업장]=Object.assign({},c,{편집:store[c.사업장]||{}}); });
  const blob=new Blob([JSON.stringify(merged,null,1)],{type:'application/json'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='설정카드_확정.json'; a.click();
}
// 필터 버튼
const handlers=[...new Set(Object.values(DRAFT).map(c=>c.담당자||'미상'))].sort();
document.getElementById('filters').innerHTML=
  `<button class="f on" data-f="all">전체</button>`+
  handlers.map(h=>`<button class="f" data-f="${h}">${h}</button>`).join('')+
  `<button class="f" data-f="left">남은 것만</button>`;
document.querySelectorAll('.f').forEach(b=>b.onclick=()=>{
  document.querySelectorAll('.f').forEach(x=>x.classList.remove('on')); b.classList.add('on');
  filter=b.dataset.f; render();
});
render();
</script></body></html>"""
    doc = doc.replace("__DATA__", data_js)
    p = os.path.join(OUT_DIR, "site_cards_edit.html")
    with open(p, "w", encoding="utf-8") as f:
        f.write(doc)
    print("생성:", p)


if __name__ == "__main__":
    main()
