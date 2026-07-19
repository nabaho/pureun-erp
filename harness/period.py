# -*- coding: utf-8 -*-
"""
하네스 1차 - 목표 3: 산정 기간 자동 감지 (D1)
- 급여대장 상단(제목/머릿말)에서 날짜 범위(예: 25.01.01 ~ 25.01.31 / 산정기간 : ...)를 찾아
  시작일·종료일의 '일(day)' 패턴으로 산정기간 유형 판별:
  · 1일~말일  · 26일~25일  · 21일~20일 등
- 사업장별 다수결로 대표 패턴 확정, 감지 실패는 사유 기록.
- 결과: _harness_out/period_summary.txt
"""
import os, json, re, calendar, warnings
from collections import Counter, defaultdict
warnings.filterwarnings("ignore")

DATA_ROOT = os.environ.get(
    "PAYROLL_DATA_ROOT",
    r"C:\Users\fair0\OneDrive\바탕 화면\급여아웃소싱 서류들",
)
OUT_DIR = os.path.join(DATA_ROOT, "_harness_out")
WRAP = {"급여", "1. 급여", "급여자료", "기타", "급여관리"}

# 날짜 두 개가 ~ 로 이어진 범위: 25.01.01~25.01.31, 2025-01-26 ~ 2025-02-25 등
DATE = r'(\d{2,4})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})\s*일?'
RANGE_RE = re.compile(DATE + r'\s*[~∼〜–\-]\s*' + DATE)


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


def classify_range(y1, m1, d1, y2, m2, d2):
    """(시작일, 종료일) → 산정기간 유형 문자열."""
    try:
        y2n = int(y2) + (2000 if len(str(y2)) == 2 else 0)
        last = calendar.monthrange(y2n, int(m2))[1]
    except Exception:
        last = None
    d1, d2i = int(d1), int(d2)
    if d1 == 1 and (last is not None and d2i == last):
        return "1일~말일"
    if last is not None and d2i == last:
        return f"{d1}일~말일"
    return f"{d1}일~{d2i}일"


def detect_file(path):
    """파일 상단 텍스트에서 산정기간 범위 탐지. (유형, 근거) or (None, 사유)."""
    import openpyxl
    try:
        wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    except Exception as e:
        return None, f"열기실패:{type(e).__name__}"
    found = Counter()
    try:
        for ws in wb.worksheets[:12]:
            n = 0
            for row in ws.iter_rows(min_row=1, max_row=8, max_col=25, values_only=True):
                for c in row:
                    if c is None:
                        continue
                    s = str(c)
                    for m in RANGE_RE.finditer(s):
                        g = m.groups()
                        # 월이 1~12 범위인 것만 (오탐 방지)
                        if 1 <= int(g[1]) <= 12 and 1 <= int(g[4]) <= 12 \
                           and 1 <= int(g[2]) <= 31 and 1 <= int(g[5]) <= 31:
                            found[classify_range(*g)] += 1
                n += 1
                if n >= 8:
                    break
    finally:
        wb.close()
    if not found:
        return None, "날짜범위 없음(상단 8행)"
    return found.most_common(1)[0][0], f"{dict(found)}"


def main():
    cls = json.load(open(os.path.join(OUT_DIR, "file_classification.json"), encoding="utf-8"))
    targets = [r for r in cls if r["label"] == "급여대장" and r["ext"] in (".xlsx", ".xlsm")]

    site_patterns = defaultdict(Counter)
    site_fail = defaultdict(Counter)
    for r in targets:
        sb = site_base(raw_site(r["path"]))
        if not sb:
            continue
        kind, why = detect_file(os.path.join(DATA_ROOT, r["path"]))
        if kind:
            site_patterns[sb][kind] += 1
        else:
            site_fail[sb][why] += 1

    lines = []
    lines.append("=" * 50)
    lines.append("목표3. 산정 기간 자동 감지 (D1)")
    lines.append("=" * 50)
    dist = Counter()
    for sb in sorted(site_patterns, key=lambda x: -sum(site_patterns[x].values())):
        top, n = site_patterns[sb].most_common(1)[0]
        total = sum(site_patterns[sb].values())
        dist[top] += 1
        others = {k: v for k, v in site_patterns[sb].items() if k != top}
        extra = f"  (기타 감지: {others})" if others else ""
        lines.append(f"  [{sb}] {top}  - 파일 {n}/{total}건 근거{extra}")
    lines.append("")
    lines.append("[산정기간 유형 분포(사업장 기준)]")
    for k, v in dist.most_common():
        lines.append(f"  {k}: {v}곳")
    detected = set(site_patterns)
    only_fail = {s for s in site_fail if s not in detected}
    lines.append(f"\n감지 성공: {len(detected)}곳 / 감지 실패: {len(only_fail)}곳")
    if only_fail:
        lines.append("실패 사업장(대장 상단에 날짜범위 표기 없음):")
        for s in sorted(only_fail)[:25]:
            why = site_fail[s].most_common(1)[0][0]
            lines.append(f"  {s} - {why}")
        if len(only_fail) > 25:
            lines.append(f"  ... 외 {len(only_fail)-25}곳")
    lines.append("\n※ 실패 사업장은 대장에 기간 표기가 없는 곳 - 설정 카드에서 사람이 지정(설계 D1 대로).")

    out = "\n".join(lines)
    with open(os.path.join(OUT_DIR, "period_summary.txt"), "w", encoding="utf-8") as f:
        f.write(out)
    try:
        print(out[:1500])
    except UnicodeEncodeError:
        print("(period_summary.txt 참조)")


if __name__ == "__main__":
    main()
