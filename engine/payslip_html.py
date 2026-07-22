# -*- coding: utf-8 -*-
"""
명세서(임금명세서) 미리보기 생성 — 핵심루프 마지막 조각(수신함→엔진→검토→확정→명세서)
- pilot_payroll.json(실데이터)로 3사업장 명세서를 렌더 → _harness_out/payslips_preview.html
- 렌더 규칙은 payroll-os.html의 screenPayslip()과 동일하게 유지할 것(이 파일이 원본 스펙).
- 법정 기재사항(근로기준법 시행령 27조의2): 성명·지급일·임금총액·구성항목별 금액·
  공제항목별 금액·(일용) 계산방법. 없는 항목은 지어내지 않고 표기 생략,
  차액은 '그 외 지급(합산)'/'기타 공제(차액)'로 산출근거를 라벨에 명시.
- 개인정보: 성명만(주민번호 없음). 결과물은 자료폴더 _harness_out(깃 밖).
"""
import os, json

DATA_ROOT = os.environ.get("PAYROLL_DATA_ROOT",
    r"C:\Users\fair0\OneDrive\바탕 화면\급여아웃소싱 서류들")
OUT_DIR = os.path.join(DATA_ROOT, "_harness_out")

PAY_KEYS = ["기본급", "과세총액", "지급총액"]
DED_ROWS = [("소득세", "소득세"), ("지방세", "지방소득세"), ("국민연금", "국민연금"),
            ("건강보험", "건강보험"), ("장기요양", "장기요양보험"), ("고용보험", "고용보험"),
            ("연말정산", "연말정산 정산액"),  # 부호 그대로(음수=환급) — 공제란에 표시
            ("기타공제", "기타 공제")]


def won(n):
    if n is None:
        return "-"
    return f"{int(round(n)):,}"


def slip_rows(e):
    """직원 1명 → (지급행[], 공제행[], 임금총액, 공제총액, 실수령, 계산방법)"""
    ded_rows = [(label, e[k]) for k, label in DED_ROWS if e.get(k) is not None]
    ded_sum = sum(v for _, v in ded_rows)
    ded_total = e.get("공제총액")
    if ded_total is None and ded_rows:
        ded_total = ded_sum
    if ded_total is not None and ded_total > ded_sum:
        ded_rows.append(("기타 공제(차액)", ded_total - ded_sum))
    net = e.get("실수령")
    # 임금총액 = 반드시 (실수령 + 공제총액). 이 둘은 대장의 확정 하단값이라,
    # 이걸 임금총액으로 삼으면 명세서가 항상 '임금총액 − 공제 = 실수령'으로 맞아떨어진다.
    # (기본급/과세총액엔 비과세 식대 등이 빠져 있어 그대로 쓰면 20만원씩 안 맞는 사고가 남)
    if net is not None and ded_total is not None:
        gross = net + ded_total
    elif e.get("지급총액") is not None:
        gross = e.get("지급총액")
    else:
        gross = e.get("과세총액") or e.get("기본급")
    if net is None and gross is not None and ded_total is not None:
        net = gross - ded_total
    if ded_total is None and gross is not None and net is not None and gross >= net:
        ded_total = gross - net
    pay_rows, calc = [], None
    if e.get("일당") and e.get("근무일수"):
        pay_rows.append(("노무비(일당제)", gross if gross is not None else e["일당"] * e["근무일수"]))
        calc = f"일당 {won(e['일당'])}원 × {e['근무일수']}일"
    else:
        if e.get("기본급") is not None:
            pay_rows.append(("기본급", e["기본급"]))
        if gross is not None and e.get("기본급") is not None and gross > e["기본급"]:
            # 기본급과 임금총액 차 = 수당·비과세(식대 등) 합
            pay_rows.append(("그 외 지급(수당·비과세 등)", gross - e["기본급"]))
        elif gross is not None and e.get("기본급") is None:
            pay_rows.append(("지급액", gross))
    return pay_rows, ded_rows, gross, ded_total, net, calc


def slip_html(site, month, e, payday="", notice=""):
    pay_rows, ded_rows, gross, ded_total, net, calc = slip_rows(e)
    def rows(rs):
        return "".join(f'<tr><td>{k}</td><td class="n">{won(v)}</td></tr>' for k, v in rs)
    return f"""
<div class="slip">
  <div class="head"><div class="co">{site}</div><div class="ttl">임 금 명 세 서</div></div>
  <table class="meta"><tr>
    <td><b>성명</b> {e.get('성명','')}</td><td><b>귀속</b> {month}</td>
    <td><b>지급일</b> {payday or '-'}</td></tr></table>
  <div class="cols">
    <div><div class="sec">지급 내역</div>
      <table class="tb">{rows(pay_rows)}
        <tr class="tot"><td>임금총액</td><td class="n">{won(gross)}</td></tr></table></div>
    <div><div class="sec">공제 내역</div>
      <table class="tb">{rows(ded_rows)}
        <tr class="tot"><td>공제총액</td><td class="n">{won(ded_total)}</td></tr></table></div>
  </div>
  <div class="net">실수령액 <b>{won(net)}</b> 원</div>
  {f'<div class="calc">계산방법: {calc} = {won(gross)}원</div>' if calc else ''}
  {f'<div class="notice">{notice}</div>' if notice else ''}
  <div class="foot">본 명세서는 근로기준법 제48조제2항에 따라 교부됩니다. · 문의: 급여 담당자</div>
</div>"""


CSS = """
body{font-family:'Noto Sans KR','Malgun Gothic',sans-serif;background:#F5F6FA;color:#23263B;margin:0;padding:20px}
.bar{max-width:840px;margin:0 auto 14px;display:flex;gap:10px;align-items:center}
.bar button{background:#2E3A8C;color:#fff;border:none;border-radius:10px;padding:9px 16px;cursor:pointer;font-size:13px}
.slip{background:#fff;border:1px solid #E3E5EF;border-radius:8px;max-width:840px;margin:0 auto 18px;padding:34px 40px;page-break-after:always}
.head{display:flex;justify-content:space-between;align-items:baseline;border-bottom:2px solid #2E3A8C;padding-bottom:10px}
.head .co{font-weight:800;font-size:15px;color:#2E3A8C}
.head .ttl{font-size:19px;font-weight:800;letter-spacing:6px}
.meta{width:100%;border-collapse:collapse;margin:12px 0 16px;font-size:13px}
.meta td{padding:4px 0}.meta b{color:#6B6F87;font-weight:600;margin-right:6px}
.cols{display:flex;gap:22px}.cols>div{flex:1}
.sec{font-weight:700;font-size:13px;color:#2E3A8C;margin-bottom:6px}
.tb{width:100%;border-collapse:collapse;font-size:13px}
.tb td{border:1px solid #E3E5EF;padding:7px 10px}.tb .n{text-align:right;font-variant-numeric:tabular-nums}
.tb .tot td{font-weight:800;background:#F5F6FA}
.net{margin-top:16px;text-align:right;font-size:15px}.net b{font-size:20px;color:#2E3A8C}
.calc{margin-top:10px;font-size:12.5px;color:#6B6F87}
.notice{margin-top:12px;font-size:12px;background:#FBF1DE;border-radius:8px;padding:10px 12px;color:#7A5200;white-space:pre-wrap}
.foot{margin-top:18px;border-top:1px solid #E3E5EF;padding-top:8px;font-size:11px;color:#9aa0b5}
@media print{body{background:#fff;padding:0}.bar{display:none}.slip{border:none;border-radius:0;max-width:none;margin:0}}
"""


def main():
    pilot = json.load(open(os.path.join(OUT_DIR, "pilot_payroll.json"), encoding="utf-8"))
    cards = []
    cpath = os.path.join(OUT_DIR, "site_cards.json")
    if os.path.exists(cpath):
        cards = json.load(open(cpath, encoding="utf-8"))
        if isinstance(cards, dict):
            cards = list(cards.values())
    def payday_of(site):
        for c in cards:
            if site in str(c.get("사업장", "")):
                return c.get("급여일") or ""
        return ""
    notice = "연차유급휴가 사용촉진: 미사용 연차는 소멸될 수 있으니 기한 내 사용 바랍니다.(예시 문구 — 화면에서 수정)"
    slips, picked = [], []
    for site, recs in pilot["sites"].items():
        done = 0
        for r in sorted(recs, key=lambda x: -x["직원수"]):
            if done >= 2:
                break
            emps = r.get("직원") or []
            if not emps:
                continue
            for e in emps[:3]:
                slips.append(slip_html(site, r["월"], e, payday_of(site), notice))
            picked.append(f"{site}/{r['월']}({min(3,len(emps))}명)")
            done += 1
    html = ("<!DOCTYPE html><html lang='ko'><head><meta charset='UTF-8'>"
            "<title>명세서 미리보기</title><style>" + CSS + "</style></head><body>"
            "<div class='bar'><button onclick='window.print()'>인쇄 / PDF 저장</button>"
            "<span style='font-size:12.5px;color:#6B6F87'>실데이터 표본: " + " · ".join(picked) + "</span></div>"
            + "".join(slips) + "</body></html>")
    out = os.path.join(OUT_DIR, "payslips_preview.html")
    with open(out, "w", encoding="utf-8") as f:
        f.write(html)
    print("OK", out, len(slips), "slips")


if __name__ == "__main__":
    main()
