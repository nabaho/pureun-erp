# -*- coding: utf-8 -*-
"""
핵심루프용 파일럿 급여 데이터 생성 — 화담원·제이앤드씨·늘봄 3곳
- parser_output(직원별) → 사업장/월(시트)별로 묶고, 엔진 규칙으로 신호(3색) 부여.
- 앱(payroll-os.html)이 payroll_os/payroll 에 올려 급여 처리 화면에 표시.
- 주민번호 없음(성명만). 결과: _harness_out/pilot_payroll.json
"""
import os, json, re
DATA_ROOT = os.environ.get("PAYROLL_DATA_ROOT",
    r"C:\Users\fair0\OneDrive\바탕 화면\급여아웃소싱 서류들")
OUT_DIR = os.path.join(DATA_ROOT, "_harness_out")
PILOTS = ["화담원", "제이앤드씨", "제이앤씨", "늘봄"]


def pilot_of(path):
    for p in PILOTS:
        if p in path:
            return "제이앤드씨" if p in ("제이앤드씨", "제이앤씨") else p
    return None


def signal(emps):
    """검토 2차그물(간이): 실수령<=0 or 공제>지급 있으면 red, 결측 많으면 orange, else green."""
    issues = []
    bad = 0
    for e in emps:
        net = e.get("실수령")
        gross = e.get("지급총액") or e.get("기본급")
        ded = e.get("공제총액")
        if net is not None and net <= 0:
            bad += 1
        if gross and ded and ded > gross:
            bad += 1
    if bad:
        issues.append(f"실수령/공제 이상 {bad}명")
        return "red", issues
    # 성명 없는 등 결측
    miss = sum(1 for e in emps if not e.get("실수령") and not e.get("공제총액"))
    if miss > len(emps) * 0.5:
        issues.append("금액 결측 다수")
        return "orange", issues
    return "green", issues


def main():
    res = json.load(open(os.path.join(OUT_DIR, "parser_output.json"), encoding="utf-8"))
    # 사업장 → [{월, 직원[], 신호, 이슈}]
    out = {}
    DRAFT = ["(안)", "(안 ", "초안", "검토용", "비교", "(수정전"]  # 초안·비교 파일 제외
    for r in res:
        if not r.get("ok"):
            continue
        site = pilot_of(r["path"])
        if not site:
            continue
        base = os.path.basename(r["path"])
        if any(d in base for d in DRAFT):
            continue  # 초안(시나리오 여러 줄) 파일은 제외 — 확정본만
        for s in r["sheets"]:
            # 서식·양식·견본 시트 제외(샘플 데이터 — 명세서 발행 사고 방지)
            if any(k in s["sheet"] for k in ("서식", "양식", "견본", "샘플", "sample")):
                continue
            raw = [{k: v for k, v in e.items()} for e in s["employees"] if e.get("성명")]
            # 일용 명단의 '해당월 무근무' 행(금액 전부 0/없음) 제외 — 급여 레코드 아님
            AMT = ("기본급", "과세총액", "지급총액", "실수령", "공제총액", "소득세", "고용보험")
            raw = [e for e in raw if any(e.get(k) for k in AMT)]
            if not raw:
                continue
            # 사람당 1줄로 정리(같은 성명 중복 시 마지막=확정본 유지)
            seen = {}
            for e in raw:
                seen[e["성명"]] = e
            emps = list(seen.values())
            sig, iss = signal(emps)
            month = s["sheet"]
            rec = {"월": month, "파일": os.path.basename(r["path"]),
                   "직원수": len(emps), "신호": sig, "이슈": "; ".join(iss),
                   "확정": False, "직원": emps[:60]}  # 표시용 상한
            out.setdefault(site, []).append(rec)
    # 사업장별 정렬(직원수 큰 시트 먼저)
    for site in out:
        out[site].sort(key=lambda x: -x["직원수"])

    payload = {"pilots": list(out.keys()),
               "sites": out,
               "생성": "파일럿 3곳 · 엔진 신호 부여 · 주민번호 미포함"}
    with open(os.path.join(OUT_DIR, "pilot_payroll.json"), "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False)
    for site, recs in out.items():
        tot = sum(x["직원수"] for x in recs)
        print(f"{site}: {len(recs)}개월/시트, 직원 연 {tot}건")


if __name__ == "__main__":
    main()
