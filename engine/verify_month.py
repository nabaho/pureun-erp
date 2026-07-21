# -*- coding: utf-8 -*-
"""
파일럿 검증 세트 — 실제 한 달치를 사람이 10분 안에 신뢰 판정하도록.
- 한 사업장/월의 명세서 + '독립 재계산 대조표'를 한 HTML로.
- 대조표는 골든(대장) 값이 스스로 앞뒤가 맞는지 3가지 독립 검산:
    ① 지방세 = 소득세 × 10% (10원 절사)   ← 엔진 실측규칙
    ② 공제총액 = 6항목 합(+기타공제)        ← 구성 정합
    ③ 실수령 = 임금총액 − 공제총액           ← 행 합계
  세 개가 다 맞으면 그 직원 데이터는 '내부 정합' = 믿을 수 있음.
- 사람이 할 일: 원본 엑셀을 열어 직원 2~3명 숫자를 명세서와 눈으로 대조.
- 개인정보: 성명만. 결과물은 자료폴더 _harness_out(깃 밖).
사용: python engine/verify_month.py "제이앤드씨" "7월" "(주)제이앤드씨 25년 7월 급여대장.xlsx"
"""
import os, sys, json, math

DATA_ROOT = os.environ.get("PAYROLL_DATA_ROOT",
    r"C:\Users\fair0\OneDrive\바탕 화면\급여아웃소싱 서류들")
OUT_DIR = os.path.join(DATA_ROOT, "_harness_out")
sys.path.insert(0, os.path.dirname(__file__))
from payslip_html import slip_html, won, CSS, DED_ROWS


def floor10(x):
    return int(math.floor(x / 10.0)) * 10


def recheck(e):
    """3가지 독립 검산 → (판정 dict). None=해당 항목 데이터 없어 검산 불가."""
    r = {}
    # ① 지방세 = 소득세×10% 10원절사
    it, lt = e.get("소득세"), e.get("지방세")
    if it is not None and lt is not None:
        exp = floor10(it * 0.1)
        r["지방세"] = ("일치" if abs(exp - lt) <= 0 else f"불일치(예상 {won(exp)})", exp, lt)
    # ② 공제총액 = 6항목합(+기타공제)
    comp = ["소득세","지방세","국민연금","건강보험","장기요양","고용보험"]
    have = [e[k] for k in comp if e.get(k) is not None]
    dt = e.get("공제총액")
    if dt is not None and have:
        s = sum(have) + (e.get("기타공제") or 0)
        diff = dt - s
        # 차액 있으면 미등록 추가공제(상조 등) 가능성 — 표시
        r["공제합"] = ("일치" if abs(diff) <= 1 else f"차액 {won(diff)}(추가공제?)", s, dt)
    # ③ 임금총액 정합: 추출한 지급총액 vs (실수령+공제). 명세서는 실수령+공제를 임금총액으로 씀.
    #   - 같으면 일치. 추출값이 더 작으면 그 차이 = 비과세(식대 등)로 정상. 더 크면 진짜 이상.
    captured = e.get("지급총액") or e.get("과세총액") or e.get("기본급")
    net = e.get("실수령")
    if captured is not None and dt is not None and net is not None:
        true_gross = net + dt
        gap = true_gross - captured
        if abs(gap) <= 1:
            r["실수령"] = ("일치", true_gross, net)
        elif gap > 0:
            r["실수령"] = (f"비과세 +{won(gap)}", true_gross, net)  # 정상(식대 등)
        else:
            r["실수령"] = (f"이상(추출>실지급 {won(-gap)})", true_gross, net)
    return r


def cell(v):
    if v is None:
        return '<td class="na">—</td>'
    txt = v[0]
    ok = txt == "일치"
    warn = ("차액" in txt) or ("비과세" in txt)  # 정상 설명(주황): 추가공제·비과세
    cls = "ok" if ok else ("warn" if warn else "bad")
    return f'<td class="{cls}">{txt}</td>'


def gen(site, month, fname=None):
    pilot = json.load(open(os.path.join(OUT_DIR, "pilot_payroll.json"), encoding="utf-8"))
    recs = [r for r in pilot["sites"].get(site, []) if r["월"] == month
            and (fname is None or fname in r["파일"])]
    if not recs:
        print(f"해당 월/파일 없음: {site} {month} {fname}"); return
    # fname 미지정 시 직원 많은 레코드 우선
    rec = max(recs, key=lambda r: r.get("직원수", 0))
    emps = rec.get("직원") or []

    # 검증 요약
    n_ok = {"지방세":0,"공제합":0,"실수령":0}
    n_chk = {"지방세":0,"공제합":0,"실수령":0}
    rows_html = ""
    for e in emps:
        r = recheck(e)
        for k in n_ok:
            if k in r:
                n_chk[k] += 1
                if r[k][0] == "일치":
                    n_ok[k] += 1
        rows_html += (f'<tr><td class="nm">{e.get("성명","")}</td>'
                      f'<td class="num">{won(e.get("지급총액") or e.get("과세총액") or e.get("기본급"))}</td>'
                      f'<td class="num">{won(e.get("공제총액"))}</td>'
                      f'<td class="num">{won(e.get("실수령"))}</td>'
                      f'{cell(r.get("지방세"))}{cell(r.get("공제합"))}{cell(r.get("실수령"))}</tr>')

    def rate(k):
        return f'{n_ok[k]}/{n_chk[k]}' if n_chk[k] else '—'
    summary = (f'<div class="vsum"><h2>검증 요약 — {site} {month} · 직원 {len(emps)}명</h2>'
        f'<p>원본 파일: <b>{rec["파일"]}</b></p>'
        f'<div class="badges">'
        f'<span class="b">지방세 재계산 일치 <b>{rate("지방세")}</b></span>'
        f'<span class="b">공제항목 합 일치 <b>{rate("공제합")}</b></span>'
        f'<span class="b">임금총액 정합(비과세 제외 일치) <b>{rate("실수령")}</b></span></div>'
        f'<table class="vtb"><tr><th>성명</th><th>임금총액</th><th>공제총액</th><th>실수령</th>'
        f'<th>①지방세=소득세×10%</th><th>②공제=항목합</th><th>③임금총액 정합(비과세)</th></tr>{rows_html}</table>'
        f'<div class="vnote"><b>사람이 확인할 것(10분):</b> 원본 엑셀 <b>{rec["파일"]}</b>을 열고 위 직원 중 '
        f'2~3명을 골라, 명세서에 찍힌 임금총액·공제·실수령이 엑셀과 같은지 눈으로 대조하세요. '
        f'①②③이 모두 "일치"면 데이터가 스스로 앞뒤가 맞는다는 뜻이고, 남은 건 "추출이 원본과 같은가"뿐입니다. '
        f'"차액"은 상조·기숙사 등 대장에만 있는 추가공제일 수 있어 설정카드에 등록하면 됩니다.</div></div>')

    # 명세서(이 달 전원). 확정 전이므로 검토용 안내를 명세서 안내문구로 전달.
    draft_notice = "※ 검토용(미확정) — 앱에서 확정 후 정식 명세서로 발행하세요."
    slips = "".join(slip_html(site, month, e, "", draft_notice) for e in emps)

    extra_css = """
.vsum{background:#fff;border:1px solid #E3E5EF;border-radius:10px;max-width:960px;margin:0 auto 22px;padding:22px 26px}
.vsum h2{color:#2E3A8C;font-size:17px;margin:0 0 4px}.vsum p{color:#6B6F87;font-size:12.5px;margin:0 0 12px}
.badges{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px}
.badges .b{background:#F5F6FA;border:1px solid #E3E5EF;border-radius:8px;padding:7px 12px;font-size:12.5px}
.badges .b b{color:#2E7D4F;font-size:14px;margin-left:4px}
.vtb{width:100%;border-collapse:collapse;font-size:12.5px}
.vtb th{background:#2E3A8C;color:#fff;padding:7px 8px;font-weight:600;font-size:11.5px}
.vtb td{border:1px solid #E3E5EF;padding:6px 8px;text-align:center}
.vtb .nm{font-weight:700;text-align:left}.vtb .num{text-align:right;font-variant-numeric:tabular-nums}
.vtb .ok{color:#2E7D4F;font-weight:700}.vtb .bad{color:#C43D3D;font-weight:700}
.vtb .warn{color:#B26A00;font-weight:700}.vtb .na{color:#c3c7d6}
.vnote{margin-top:14px;font-size:12.5px;background:#FBF1DE;border-radius:8px;padding:12px 14px;color:#7A5200;line-height:1.6}
@media print{.vsum{display:none}}
"""
    html = ("<!DOCTYPE html><html lang='ko'><head><meta charset='UTF-8'>"
            f"<title>검증세트 {site} {month}</title><style>{CSS}{extra_css}</style></head><body>"
            "<div class='bar'><button onclick='window.print()'>명세서만 인쇄 / PDF</button>"
            f"<span style='font-size:12.5px;color:#6B6F87'>검증 요약은 화면 전용(인쇄 제외) · {site} {month}</span></div>"
            + summary + slips + "</body></html>")
    safe = f"검증세트_{site}_{month}".replace("/", "_").replace(" ", "")
    out = os.path.join(OUT_DIR, safe + ".html")
    with open(out, "w", encoding="utf-8") as f:
        f.write(html)
    print("OK", out)
    print(f"직원 {len(emps)}명 / 지방세 {rate('지방세')} · 공제합 {rate('공제합')} · 실수령 {rate('실수령')}")


def main():
    site = sys.argv[1] if len(sys.argv) > 1 else "제이앤드씨"
    month = sys.argv[2] if len(sys.argv) > 2 else "7월"
    fname = sys.argv[3] if len(sys.argv) > 3 else None
    gen(site, month, fname)


if __name__ == "__main__":
    main()
