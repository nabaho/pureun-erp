# -*- coding: utf-8 -*-
"""
파생신고 1호: 일용직 근로내용확인신고(매월) 자동 초안 — 개발순서 ③ 첫 조각
- 근거 양식: 고용·산재보험 근로내용확인신고서(실물 PDF 대조: 알오엠 근로내용확인신고서).
  필요한 값 = 성명·근로일수·보수지급기초일수·보수총액(과세소득)·임금총액·소득세·지방소득세
  → 전부 파싱된 일용 데이터(일당·근무일수·과세총액·소득세·지방세)에 존재.
- 주민번호는 시스템에 없음(설계상 미저장) → 초안에는 성명만. 공단 제출 시 담당자가
  대행기관 명부에서 매칭(이 원칙을 초안 하단에 명시).
- 검산: 일당×근무일수 = 보수총액 (다르면 '확인' 플래그 — 주휴·비과세 섞임 가능).
- 출력: _harness_out/daily_report.json + 신고초안_<사업장>_<월>.html(파일럿 표본)
"""
import os, sys, json

DATA_ROOT = os.environ.get("PAYROLL_DATA_ROOT",
    r"C:\Users\fair0\OneDrive\바탕 화면\급여아웃소싱 서류들")
OUT_DIR = os.path.join(DATA_ROOT, "_harness_out")


def won(n):
    return "-" if n is None else f"{int(round(n)):,}"


def daily_rows(emps):
    """일용 직원만 골라 신고 초안 행으로 변환.
    - 일당제(화담원류): 일당×근무일수 = 보수총액 검산
    - 시급제(제이앤드씨류): 시급×총근무시간 검산(주휴·야간 있으면 초과가 정상 → 표시만)"""
    rows = []
    for e in emps or []:
        days = e.get("근무일수")
        if not days:
            continue
        daily, hourly = e.get("일당"), e.get("시급")
        if not (daily or hourly):
            continue
        pay = e.get("과세총액") or e.get("지급총액")
        if daily:
            expect = daily * days
            unit, kind = daily, "일당"
        else:
            hrs = e.get("근무시간")
            expect = (hourly * hrs) if hrs else None
            unit, kind = hourly, "시급"
        if pay is None:
            pay = expect                       # 대장에 총액 칸이 없으면 계산값을 초안으로
        if expect is None:
            chk = "확인(시간 미상)"
        elif abs(expect - pay) <= 1:
            chk = "일치"
        elif pay > expect:
            chk = f"확인(+{won(pay - expect)} 주휴·야간?)"
        else:
            chk = f"확인({kind}×근무={won(expect)})"
        rows.append({
            "성명": e.get("성명", ""),
            "근로일수": days,
            "보수지급기초일수": days,
            "단가구분": kind,
            "단가": unit,
            "일평균시간": e.get("평균시간"),   # 신고서 '일평균 근로시간'
            "보수총액": pay,                    # 과세소득
            "임금총액": e.get("지급총액") or pay,
            "소득세": e.get("소득세"),
            "지방소득세": e.get("지방세"),
            "검산": chk,
        })
    return rows


def build(pilot_path=None):
    pilot_path = pilot_path or os.path.join(OUT_DIR, "pilot_payroll.json")
    pilot = json.load(open(pilot_path, encoding="utf-8"))
    report = {}     # site -> [{월, 파일, 직원[], 검산요약}]
    for site, recs in pilot["sites"].items():
        for r in recs:
            rows = daily_rows(r.get("직원"))
            if not rows:
                continue
            n_ok = sum(1 for x in rows if x["검산"] == "일치")
            report.setdefault(site, []).append({
                "월": r["월"], "파일": r["파일"], "직원수": len(rows),
                "검산일치": n_ok, "직원": rows,
            })
    return report


CSS = """
body{font-family:'Noto Sans KR','Malgun Gothic',sans-serif;background:#F5F6FA;color:#23263B;margin:0;padding:22px}
.box{background:#fff;border:1px solid #E3E5EF;border-radius:10px;max-width:1060px;margin:0 auto 20px;padding:22px 26px}
h1{font-size:17px;color:#2E3A8C;margin:0 0 4px}
.sub{font-size:12.5px;color:#6B6F87;margin-bottom:12px}
table{width:100%;border-collapse:collapse;font-size:12.5px}
th{background:#2E3A8C;color:#fff;padding:7px 8px;font-weight:600;font-size:11.5px}
td{border:1px solid #E3E5EF;padding:6px 8px;text-align:right}
td.l{text-align:left;font-weight:700} td.c{text-align:center}
.ok{color:#2E7D4F;font-weight:700}.warn{color:#B26A00;font-weight:700}
.note{margin-top:12px;font-size:12px;background:#FBF1DE;border-radius:8px;padding:10px 12px;color:#7A5200;line-height:1.6}
"""


def render_html(site, rec):
    rows = ""
    for i, x in enumerate(rec["직원"], 1):
        cls = "ok" if x["검산"] == "일치" else "warn"
        avg = x.get("일평균시간")
        rows += (f'<tr><td class="c">{i}</td><td class="l">{x["성명"]}</td>'
                 f'<td class="c">{x["근로일수"]}</td><td class="c">{x["보수지급기초일수"]}</td>'
                 f'<td class="c">{avg if avg is not None else "-"}</td>'
                 f'<td>{won(x["단가"])}<span style="color:#9aa0b5;font-size:10.5px">/{x["단가구분"]}</span></td>'
                 f'<td>{won(x["보수총액"])}</td><td>{won(x["임금총액"])}</td>'
                 f'<td>{won(x["소득세"])}</td><td>{won(x["지방소득세"])}</td>'
                 f'<td class="c {cls}">{x["검산"]}</td></tr>')
    return (f'<div class="box"><h1>근로내용확인신고 초안 — {site} {rec["월"]}</h1>'
            f'<div class="sub">원본: {rec["파일"]} · 일용 {rec["직원수"]}명 · 검산 일치 {rec["검산일치"]}/{rec["직원수"]}</div>'
            f'<table><tr><th>연번</th><th>성명</th><th>근로일수</th><th>보수지급기초일수</th><th>일평균시간</th>'
            f'<th>단가</th><th>보수총액(과세소득)</th><th>임금총액</th><th>소득세</th><th>지방소득세</th><th>검산</th></tr>'
            f'{rows}</table>'
            f'<div class="note"><b>초안 사용법</b>: 주민등록번호는 시스템에 저장하지 않으므로 공단 제출 시 '
            f'대행기관 명부에서 성명으로 매칭해 채우세요. "확인" 표시는 일당×일수와 보수총액이 달라 '
            f'주휴·비과세 등이 섞였을 수 있는 행입니다(원본 대장 확인). 근로일자(달력 o표시)는 '
            f'원본 대장의 출역표를 그대로 옮기세요 — 다음 단계에서 자동화 예정.</div></div>')


def main():
    report = build()
    with open(os.path.join(OUT_DIR, "daily_report.json"), "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False)
    total = sum(len(v) for v in report.values())
    pages, picked = [], []
    for site, recs in report.items():
        best = max(recs, key=lambda r: r["직원수"])
        pages.append(render_html(site, best))
        picked.append(f"{site} {best['월']}({best['직원수']}명)")
        safe = f"신고초안_{site}_{best['월']}".replace("/", "_").replace(" ", "")
        with open(os.path.join(OUT_DIR, safe + ".html"), "w", encoding="utf-8") as f:
            f.write(f"<!DOCTYPE html><html lang='ko'><head><meta charset='UTF-8'>"
                    f"<title>신고초안 {site}</title><style>{CSS}</style></head><body>"
                    + render_html(site, best) + "</body></html>")
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
    print(f"OK daily_report.json — 사업장 {len(report)}곳 · 신고월 {total}건")
    for site, recs in report.items():
        n = sum(r["직원수"] for r in recs)
        ok = sum(r["검산일치"] for r in recs)
        print(f"  {site}: 신고월 {len(recs)}건 · 일용 연 {n}명 · 검산일치 {ok}/{n}")
    print("표본 HTML:", " · ".join(picked))


if __name__ == "__main__":
    main()
