# -*- coding: utf-8 -*-
"""
하네스 1차 - 목표 4/6 조사 (파서 결과 기반)
- 목표4 동명이인(D2): 같은 시트(한 달) 안에 동일 성명 2회+ = 확실한 동명이인.
  (주민번호 미저장 → 여러 달의 동일인과 구분 위해 '시트 내 중복'만 신뢰.
   연간누적/요약 시트 오탐 방지: 반복 이름 비율 30%+ 시트는 제외)
- 목표6 급여일 분포: 사업장 폴더명의 (N일)/(말일) 추출.
- 결과: _harness_out/analyze_summary.txt
"""
import os, json, re
from collections import Counter, defaultdict

DATA_ROOT = os.environ.get(
    "PAYROLL_DATA_ROOT",
    r"C:\Users\fair0\OneDrive\바탕 화면\급여아웃소싱 서류들",
)
OUT_DIR = os.path.join(DATA_ROOT, "_harness_out")
WRAP = {"급여", "1. 급여", "급여자료", "기타", "급여관리"}


def raw_site(rel):
    """번호접두 제거한 사업장 폴더명(급여일 suffix 포함)."""
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
    """급여일 등 괄호 suffix 제거한 사업장 키."""
    if not s:
        return s
    return re.sub(r'\s*[\(\[].*?[\)\]]\s*$', '', s).strip() or s


def payday_of(s):
    """폴더명 괄호에서 급여일 추출: (5일)(10일)(25일)(말일)."""
    if not s:
        return None
    m = re.search(r'[\(\[]\s*(말일|\d{1,2})\s*일?\s*[\)\]]', s)
    if m:
        v = m.group(1)
        return "말일" if v == "말일" else f"{int(v)}일"
    return None


def main():
    res = json.load(open(os.path.join(OUT_DIR, "parser_output.json"), encoding="utf-8"))
    ok = [r for r in res if r["ok"]]

    # ── 목표4: 동명이인 (시트 내 동일성명 2회+, 요약시트 제외) ──
    dupe_by_site = defaultdict(Counter)
    for r in ok:
        sb = site_base(raw_site(r["path"]))
        for s in r["sheets"]:
            names = [e["성명"] for e in s["employees"] if e.get("성명")]
            if len(names) < 2:
                continue
            cnt = Counter(names)
            repeated = sum(1 for c in cnt.values() if c >= 2)
            if repeated / max(len(cnt), 1) > 0.3:   # 요약/누적 시트 제외
                continue
            for nm, c in cnt.items():
                if c >= 2:
                    dupe_by_site[sb][nm] = max(dupe_by_site[sb][nm], c)

    # ── 목표6: 급여일 분포 ──
    site_payday = {}
    for r in ok:
        rs = raw_site(r["path"])
        sb = site_base(rs)
        pd = payday_of(rs)
        if sb and pd and sb not in site_payday:
            site_payday[sb] = pd
    payday_dist = Counter(site_payday.values())
    no_payday = sorted({site_base(raw_site(r["path"])) for r in ok
                        if site_base(raw_site(r["path"])) not in site_payday})

    lines = []
    lines.append("=" * 50)
    lines.append("목표4. 동명이인 조사 (한 시트 내 동일성명 2회+ = 확실)")
    lines.append("=" * 50)
    total_dupe = sum(len(v) for v in dupe_by_site.values() if v)
    if total_dupe == 0:
        lines.append("→ 시트 내 동일성명 중복 없음.")
    for sb in sorted(dupe_by_site, key=lambda x: -len(dupe_by_site[x])):
        names = dupe_by_site[sb]
        if not names:
            continue
        lines.append(f"[{sb}] 동명이인 의심 {len(names)}건: " +
                     ", ".join(f"{n}×{c}" for n, c in names.most_common()))
    lines.append(f"\n합계: 사업장 {len([s for s in dupe_by_site if dupe_by_site[s]])}곳, 이름 {total_dupe}건")
    lines.append("※ 주민번호 미저장이라 '여러 달의 동일인'은 제외됨. 여기 목록은 한 달 안 중복이라 진짜 동명이인.")
    lines.append("※ 확정 판정은 주민번호 대조 필요(설계 D2). 여기 목록은 '사람 확인 대상'.")

    lines.append("")
    lines.append("=" * 50)
    lines.append("목표6. 급여일 분포 (사업장 폴더명 기준)")
    lines.append("=" * 50)
    for pd, n in payday_dist.most_common():
        sites = sorted(s for s, p in site_payday.items() if p == pd)
        lines.append(f"  {pd}: {n}곳 - {', '.join(sites[:8])}{' 외' if len(sites) > 8 else ''}")
    lines.append(f"\n급여일 확인된 사업장: {len(site_payday)}곳 / 미확인: {len(no_payday)}곳")
    if no_payday:
        lines.append("미확인(폴더명에 급여일 없음): " + ", ".join(no_payday[:20]) +
                     (" ..." if len(no_payday) > 20 else ""))

    out = "\n".join(lines)
    with open(os.path.join(OUT_DIR, "analyze_summary.txt"), "w", encoding="utf-8") as f:
        f.write(out)
    try:
        print(out)
    except UnicodeEncodeError:
        print("(콘솔 인코딩 문제: analyze_summary.txt 참조)")


if __name__ == "__main__":
    main()
