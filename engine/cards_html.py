# -*- coding: utf-8 -*-
"""
설정 카드 화면(HTML) 생성 — site_cards.json → 담당자용 카드 보드
- 담당자 필터, 확인필요 배지, 사업장별 카드. 개인정보(개별 성명·급여) 미포함.
- 결과: _harness_out/site_cards.html
"""
import os, json, html

DATA_ROOT = os.environ.get(
    "PAYROLL_DATA_ROOT",
    r"C:\Users\fair0\OneDrive\바탕 화면\급여아웃소싱 서류들",
)
OUT_DIR = os.path.join(DATA_ROOT, "_harness_out")


def esc(x):
    return html.escape(str(x))


def main():
    cards = json.load(open(os.path.join(OUT_DIR, "site_cards.json"), encoding="utf-8"))
    items = sorted(cards.values(), key=lambda c: (-c["규모"]["직원레코드"]))

    NAVY, VIOLET, OK, WARN, BAD = "#2E3A8C", "#7C6CE0", "#2E7D4F", "#B26A00", "#C43D3D"
    handlers = sorted({c.get("담당자") or "미상" for c in items})
    ready = sum(1 for c in items if not c["확인필요"])

    def card_html(c):
        need = c["확인필요"]
        badge = (f'<span class="b ok">확인 완료</span>' if not need
                 else f'<span class="b warn">확인필요 {len(need)}</span>')
        gi = c["공제항목"]["공제총액_대조"]
        gap = ""
        if gi.get("판정") == "미등록 공제 존재":
            gap = f'<div class="gap">💡 미등록 공제 ~{gi.get("미등록공제_중앙값","?"):,}원대 등록 필요 (완결율 {gi.get("완결율","-")})</div>'
        elif gi.get("완결율"):
            gap = f'<div class="gapok">공제총액 표준6종 완결율 {gi.get("완결율")}</div>'
        dupe = c["주의"].get("동명이인_후보") or {}
        dupe_h = ""
        if dupe:
            dupe_h = '<div class="dupe">👥 동명이인 후보: ' + esc(", ".join(dupe.keys())) + '</div>'
        need_h = ""
        if need:
            need_h = '<ul class="need">' + "".join(f'<li>{esc(x)}</li>' for x in need) + '</ul>'
        return f"""<div class="card" data-h="{esc(c.get('담당자') or '미상')}" data-need="{1 if need else 0}">
      <div class="ch"><span class="site">{esc(c['사업장'])}</span>{badge}</div>
      <div class="meta">{esc(c.get('담당자') or '미상')} · 직원 {c['규모']['직원레코드']:,}건 · {c['규모']['월수']}개월</div>
      <div class="grid">
        <div><b>급여일</b>{esc(c['급여일'])}</div>
        <div><b>산정기간</b>{esc(c['산정기간'])}</div>
        <div><b>고용보험</b>{esc(c['고용보험']['단수처리'])} / {esc(c['고용보험']['요율'])}</div>
        <div><b>추출필드</b>{len(c['추출필드'])}종</div>
      </div>
      {gap}{dupe_h}{need_h}
    </div>"""

    body = "\n".join(card_html(c) for c in items)
    btns = '<button class="f on" data-f="all">전체</button>' + \
           "".join(f'<button class="f" data-f="{esc(h)}">{esc(h)}</button>' for h in handlers) + \
           '<button class="f" data-f="need">확인필요만</button>'

    doc = f"""<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>사업장 설정 카드 — 푸른노무법인</title>
<style>
:root{{--navy:{NAVY};--violet:{VIOLET};--ok:{OK};--warn:{WARN};--bad:{BAD};
--ink:#23263B;--sub:#6B6F87;--line:#E3E5EF;--paper:#F5F6FA;--card:#FFF;}}
*{{box-sizing:border-box;margin:0}}
body{{font-family:'Malgun Gothic',sans-serif;background:var(--paper);color:var(--ink);font-size:14px}}
.wrap{{max-width:1100px;margin:0 auto;padding:24px 16px 80px}}
h1{{font-size:22px;letter-spacing:-.02em}}
.sub{{color:var(--sub);font-size:13px;margin:4px 0 6px}}
.priv{{display:inline-block;font-size:11px;color:var(--violet);border:1px solid var(--violet);border-radius:99px;padding:2px 10px}}
.bar{{display:flex;gap:14px;margin:16px 0;flex-wrap:wrap}}
.kpi{{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:10px 16px}}
.kpi b{{font-size:22px;color:var(--navy)}} .kpi span{{font-size:12px;color:var(--sub);display:block}}
.filters{{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0 18px}}
.f{{border:1px solid var(--line);background:#fff;border-radius:99px;padding:6px 14px;cursor:pointer;font-size:13px}}
.f.on{{background:var(--navy);color:#fff;border-color:var(--navy)}}
.cards{{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:14px}}
.card{{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:15px}}
.ch{{display:flex;justify-content:space-between;align-items:center;gap:8px}}
.site{{font-size:15px;font-weight:700;color:var(--navy)}}
.b{{font-size:11px;border-radius:99px;padding:2px 9px;white-space:nowrap}}
.b.ok{{background:#E8F3EC;color:var(--ok)}} .b.warn{{background:#FBF1DE;color:var(--warn)}}
.meta{{font-size:12px;color:var(--sub);margin:4px 0 10px}}
.grid{{display:grid;grid-template-columns:1fr 1fr;gap:8px 12px}}
.grid div{{font-size:13px}} .grid b{{display:block;font-size:11px;color:var(--sub);font-weight:600}}
.gap{{margin-top:10px;background:#FBF1DE;color:var(--warn);border-radius:8px;padding:7px 10px;font-size:12.5px}}
.gapok{{margin-top:10px;color:var(--ok);font-size:12px}}
.dupe{{margin-top:8px;font-size:12px;color:var(--bad)}}
.need{{margin:10px 0 0;padding-left:18px}} .need li{{font-size:12.5px;color:var(--warn);margin:2px 0}}
</style></head><body><div class="wrap">
<h1>사업장 설정 카드</h1>
<div class="sub">푸른노무법인 · 하네스 자동 초안 (담당자 확인용) · 개별 급여/주민번호 미포함</div>
<span class="priv">🔒 집계·설정값만 표시</span>
<div class="bar">
  <div class="kpi"><b>{len(items)}</b><span>사업장</span></div>
  <div class="kpi"><b>{ready}</b><span>확인 완료</span></div>
  <div class="kpi"><b>{len(items)-ready}</b><span>확인 필요</span></div>
  <div class="kpi"><b>{len(handlers)}</b><span>담당자</span></div>
</div>
<div class="filters">{btns}</div>
<div class="cards" id="cards">
{body}
</div>
</div>
<script>
const btns=document.querySelectorAll('.f'), cards=document.querySelectorAll('.card');
btns.forEach(b=>b.onclick=()=>{{
  btns.forEach(x=>x.classList.remove('on')); b.classList.add('on');
  const f=b.dataset.f;
  cards.forEach(c=>{{
    let show = f==='all' || (f==='need'&&c.dataset.need==='1') || c.dataset.h===f;
    c.style.display = show?'':'none';
  }});
}});
</script>
</body></html>"""

    p = os.path.join(OUT_DIR, "site_cards.html")
    with open(p, "w", encoding="utf-8") as f:
        f.write(doc)
    print("생성:", p)


if __name__ == "__main__":
    main()
