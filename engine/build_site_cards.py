# -*- coding: utf-8 -*-
"""
설정 카드 자동 초안 생성 (인수인계 로드맵: "과거 대장에서 설정 카드 자동 초안")
- 하네스 산출물을 사업장별 1장 카드(JSON)로 통합:
  담당자 / 급여일 / 산정기간 / 고용보험 단수처리·요율 / 감지된 공제항목 /
  동명이인 주의 / 근태 매칭키 / 직원수·개월수 / 사람확인 필요 항목
- 실제 운영 시스템의 '설정 카드'(사업장별 데이터) 초안. 담당자가 화면에서 확인·수정.
- 결과: _harness_out/site_cards.json, site_cards_summary.txt
"""
import os, json, re
from collections import defaultdict

DATA_ROOT = os.environ.get(
    "PAYROLL_DATA_ROOT",
    r"C:\Users\fair0\OneDrive\바탕 화면\급여아웃소싱 서류들",
)
OUT_DIR = os.path.join(DATA_ROOT, "_harness_out")
WRAP = {"급여", "1. 급여", "급여자료", "기타", "급여관리"}


def raw_site(rel):
    parts = rel.replace("/", "\\").split("\\")
    rest = parts[1:]
    i = 0
    while i < len(rest) and rest[i] in WRAP:
        i += 1
    if i >= len(rest):
        return None
    s = re.sub(r'^\d+\s*[.\-]\s*', '', rest[i]).strip()
    return s or None


def site_base(s):
    if not s:
        return s
    return re.sub(r'\s*[\(\[].*?[\)\]]\s*$', '', s).strip() or s


def load(name, default):
    p = os.path.join(OUT_DIR, name)
    if os.path.exists(p):
        return json.load(open(p, encoding="utf-8"))
    return default


def main():
    res = load("parser_output.json", [])
    analyze = load("analyze.json", {})
    period = load("period.json", {})
    rounding = analyze.get("rounding", {})
    payday = analyze.get("payday", {})
    dupe = analyze.get("dupe", {})

    STD_DED = ["소득세", "지방세", "국민연금", "건강보험", "장기요양", "고용보험"]

    # 사업장별 집계
    cards = {}
    agg = defaultdict(lambda: {"handler": None, "emp": 0, "months": set(),
                               "fields": set(), "has_extra_ded": 0, "gaps": []})
    for r in res:
        if not r.get("ok"):
            continue
        sb = site_base(raw_site(r["path"]))
        if not sb:
            continue
        a = agg[sb]
        handler = r.get("handler") or r["path"].replace("/", "\\").split("\\")[0]
        a["handler"] = a["handler"] or handler
        for s in r["sheets"]:
            a["months"].add((os.path.basename(r["path"]), s["sheet"]))
            for e in s["employees"]:
                a["emp"] += 1
                a["fields"].update(e.keys())
                if "기타공제" in e:
                    a["has_extra_ded"] += 1
                # 미등록 공제 차액 = 골든 공제총액 − (표준6 + 기타공제 합)
                if e.get("공제총액") is not None:
                    parts = sum(e[f] for f in STD_DED if e.get(f) is not None) + (e.get("기타공제") or 0)
                    if sum(1 for f in STD_DED if e.get(f) is not None) >= 4:
                        a["gaps"].append(e["공제총액"] - parts)

    def gap_summary(gaps):
        if not gaps:
            return {"판정": "공제총액 대조 불가(항목 부족)", "일치율": None}
        n = len(gaps)
        zero = sum(1 for g in gaps if g == 0)
        nonzero = [g for g in gaps if g != 0]
        pct = round(100 * zero / n)
        info = {"판정": "표준6종으로 완결" if pct >= 90 else "미등록 공제 존재",
                "완결율": f"{pct}%", "표본": n}
        if nonzero:
            nonzero.sort()
            med = nonzero[len(nonzero) // 2]
            info["미등록공제_중앙값"] = med
            info["안내"] = "위 금액대의 사업장 특수공제(상조·기숙사·조합비 등)를 카드에 등록 필요"
        return info

    for sb, a in agg.items():
        rnd = rounding.get(sb, {})
        gapinfo = gap_summary(a["gaps"])
        card = {
            "사업장": sb,
            "담당자": a["handler"],
            "규모": {"직원레코드": a["emp"], "월수": len(a["months"])},
            "급여일": payday.get(sb) or "미확인(사람 지정 필요)",
            "산정기간": period.get(sb) or "미확인(사람 지정 필요)",
            "고용보험": {
                "단수처리": rnd.get("method", "미판정(사람 확인)"),
                "요율": rnd.get("rate", "연도별 자동"),
                "판정근거": f"{rnd.get('match','-')}/{rnd.get('n','-')}명 일치" if rnd else "-",
            },
            "공제항목": {
                "기본6종": ["소득세", "지방세", "국민연금", "건강보험", "장기요양", "고용보험"],
                "기타공제_감지": a["has_extra_ded"] > 0,
                "공제총액_대조": gapinfo,
            },
            "추출필드": sorted(a["fields"]),
            "주의": {
                "동명이인_후보": dupe.get(sb, {}),
            },
            "확인필요": [],
        }
        # 사람 확인 플래그
        if card["급여일"].startswith("미확인"):
            card["확인필요"].append("급여일")
        if card["산정기간"].startswith("미확인"):
            card["확인필요"].append("산정기간")
        if card["고용보험"]["단수처리"].startswith("미판정"):
            card["확인필요"].append("고용보험 단수처리")
        if dupe.get(sb):
            card["확인필요"].append("동명이인 → 주민번호/보조키 매칭")
        if gapinfo.get("판정") == "미등록 공제 존재":
            card["확인필요"].append(f"미등록 공제 등록(추정 {gapinfo.get('미등록공제_중앙값','?')}원대)")
        cards[sb] = card

    with open(os.path.join(OUT_DIR, "site_cards.json"), "w", encoding="utf-8") as f:
        json.dump(cards, f, ensure_ascii=False, indent=1)

    # 요약
    L = []
    L.append("=" * 56)
    L.append(f"설정 카드 자동 초안 — {len(cards)}개 사업장")
    L.append("=" * 56)
    ready = [c for c in cards.values() if not c["확인필요"]]
    L.append(f"바로 사용 가능(확인필요 0): {len(ready)}곳 / 사람 확인 필요: {len(cards)-len(ready)}곳")
    L.append("")
    for sb, c in sorted(cards.items(), key=lambda kv: -kv[1]["규모"]["직원레코드"])[:20]:
        L.append(f"■ {sb}  [{c['담당자']}]  직원{c['규모']['직원레코드']}·{c['규모']['월수']}개월")
        L.append(f"   급여일 {c['급여일']} | 산정 {c['산정기간']} | 고용보험 {c['고용보험']['단수처리']}({c['고용보험']['요율']})")
        if c["확인필요"]:
            L.append(f"   ⚠ 확인필요: {', '.join(c['확인필요'])}")
    if len(cards) > 20:
        L.append(f"... 외 {len(cards)-20}곳 (site_cards.json에 전체)")

    out = "\n".join(L)
    with open(os.path.join(OUT_DIR, "site_cards_summary.txt"), "w", encoding="utf-8") as f:
        f.write(out)
    try:
        print(out[:1500])
    except UnicodeEncodeError:
        print("(site_cards_summary.txt 참조)")


if __name__ == "__main__":
    main()
