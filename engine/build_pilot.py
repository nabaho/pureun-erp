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

# ── 지점 분리 (2026-09-05) ──────────────────────────────────────────
# 화담원(서산·아산·천안)·늘봄(매장 3곳)·제이앤드씨(니쿠미야·삼산회관)는
# 사업장관리번호가 각각 다른 **별개 사업장**이다. 예전엔 이름 앞부분만 보고
# 한 덩어리로 묶었는데, 그러면 어느 지점 파일이 한 달 빠졌을 때 그 지점 직원이
# 전원 퇴사한 것처럼 보였다(상실추정 노이즈). 신고·연차·퇴직정산은 모두
# 사업장 단위라 여기서 갈라 두어야 한다.
# ⚠ 이름은 설정카드(site_cards)와 맞춘다 — 「화담원」은 아산점(급여일 10일),
#   서산점·천안점은 말일. 이름이 어긋나면 급여일·수신함 매칭이 끊긴다.
# ⚠ **파일명을 먼저** 본다 — 「제이앤드씨 (삼산회관)」 폴더 안에 니쿠미야 자료가
#   섞여 있어, 경로부터 보면 니쿠미야가 삼산회관으로 잡힌다.
BRANCHES = [
    ("화담원 서산점",       ["화담원 서산", "서산점"]),
    ("화담원 천안점",       ["화담원 천안", "천안점"]),
    ("화담원",              ["화담원 아산", "아산점", "화담원 (10일)"]),   # 아산점 = 카드의 「화담원」
    ("늘봄반찬 배방월천점", ["배방월천", "배방"]),
    ("늘봄반찬 모종점",     ["모종"]),
    ("하나로마트(늘봄)",    ["하나로마트"]),
    ("사계절찬",            ["사계절찬"]),
    ("니쿠미야",            ["니쿠미야"]),
    ("삼산회관",            ["삼산회관"]),
    ("제이앤드씨",          ["제이앤드씨", "제이앤씨"]),
]


def pilot_of(path):
    """파일 하나가 어느 사업장 것인지. 지점까지 갈라서 돌려준다."""
    if not any(k in path for k in PILOTS):
        return None                      # 파일럿 3그룹 밖이면 대상 아님
    base = os.path.basename(path)
    for name, keys in BRANCHES:          # ① 파일명 우선(폴더에 딴 업체가 섞여 있다)
        if any(k in base for k in keys):
            return name
    for name, keys in BRANCHES:          # ② 파일명에 없으면 경로로
        if any(k in path for k in keys):
            return name
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
            # 사람당 1줄로 정리(같은 성명 중복 시 '가장 잘 맞아떨어지는' 행 유지).
            # 앱의 dedupeEmps()와 동일 기준: 항목 많고 (임금총액−공제=실수령) tie-out 우대.
            def _score(e):
                keys = ("기본급","과세총액","소득세","지방세","국민연금","건강보험",
                        "장기요양","고용보험","공제총액","실수령")
                s = sum(1 for k in keys if e.get(k) is not None)
                g = e.get("지급총액") or e.get("과세총액") or e.get("기본급")
                d, n = e.get("공제총액"), e.get("실수령")
                if g is not None and d is not None and n is not None and abs(g - d - n) <= 1:
                    s += 5
                return s
            seen = {}
            for e in raw:
                nm = e["성명"].strip()
                if nm not in seen or _score(e) > _score(seen[nm]):
                    seen[nm] = e
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
