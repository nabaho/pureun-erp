# -*- coding: utf-8 -*-
"""
전수 폴더 감사 — 모든 급여업체(사업장)를 폴더째 재검토
- 담당자 3인 폴더의 '모든 사업장'을 나열(파서가 다룬 것뿐 아니라 전부).
- 사업장별: 파일 구성(xlsx/xls/pdf/jpg/hwp), 연도범위, 급여대장 파싱 여부.
- 상태 분류: 파싱완료 / 엑셀있으나미파싱 / 이미지·PDF만(OCR필요) / xls구형만 / 급여대장없음.
- 목적: 빠진 사업장·못 읽는 사업장 색출.
- 결과: _harness_out/audit_sites.txt, audit_sites.json
"""
import os, json, re
from collections import defaultdict, Counter

DATA_ROOT = os.environ.get(
    "PAYROLL_DATA_ROOT",
    r"C:\Users\fair0\OneDrive\바탕 화면\급여아웃소싱 서류들",
)
OUT_DIR = os.path.join(DATA_ROOT, "_harness_out")
HANDLERS = ["주민정", "박은비", "김보람"]
WRAP = {"급여", "1. 급여", "급여자료", "기타", "급여관리"}
LEDGER_HINT = ["급여", "급상여", "임금", "명세", "노무비", "일용", "사업소득", "지급"]


def site_of(rel):
    """파일 경로 → (담당자, 사업장). 래퍼·번호접두·괄호suffix 제거."""
    parts = rel.replace("/", "\\").split("\\")
    handler = parts[0]
    rest = parts[1:]
    i = 0
    while i < len(rest) - 1 and rest[i] in WRAP:
        i += 1
    if i >= len(rest):
        return handler, None
    s = re.sub(r'^\d+\s*[.\-]\s*', '', rest[i]).strip()
    s = re.sub(r'\s*[\(\[].*?[\)\]]\s*$', '', s).strip()
    return handler, (s or None)


def main():
    # 파싱 성공한 (사업장) 집합 + 파일경로
    parsed = json.load(open(os.path.join(OUT_DIR, "parser_output.json"), encoding="utf-8"))
    parsed_ok_paths = set(r["path"] for r in parsed if r["ok"])

    # 전 파일 스캔
    sites = defaultdict(lambda: {"handler": None, "files": 0, "ext": Counter(),
                                 "years": set(), "ledger_xlsx": 0, "ledger_parsed": 0,
                                 "ledger_pdf": 0, "ledger_img": 0, "ledger_hwp": 0, "ledger_xls": 0})
    yre = re.compile(r'20(\d\d)|(\b\d\d)년')
    for h in HANDLERS:
        hdir = os.path.join(DATA_ROOT, h)
        if not os.path.isdir(hdir):
            continue
        for root, dirs, fnames in os.walk(hdir):
            for fn in fnames:
                if fn.startswith("~$"):
                    continue
                full = os.path.join(root, fn)
                rel = os.path.relpath(full, DATA_ROOT)
                handler, sb = site_of(rel)
                if not sb:
                    continue
                ext = os.path.splitext(fn)[1].lower()
                d = sites[sb]
                d["handler"] = d["handler"] or handler
                d["files"] += 1
                d["ext"][ext] += 1
                m = yre.search(rel)
                if m:
                    yy = m.group(1) or m.group(2)
                    if yy:
                        y = 2000 + int(yy)
                        if 2010 <= y <= 2027:
                            d["years"].add(y)
                # 급여대장성 파일 판정(파일명/폴더 힌트)
                is_ledger = any(k in rel for k in LEDGER_HINT)
                if is_ledger:
                    if ext in (".xlsx", ".xlsm"):
                        d["ledger_xlsx"] += 1
                        if rel in parsed_ok_paths:
                            d["ledger_parsed"] += 1
                    elif ext == ".xls":
                        d["ledger_xls"] += 1
                    elif ext == ".pdf":
                        d["ledger_pdf"] += 1
                    elif ext in (".jpg", ".jpeg", ".png", ".tif", ".tiff"):
                        d["ledger_img"] += 1
                    elif ext in (".hwp", ".hwpx"):
                        d["ledger_hwp"] += 1

    # 상태 분류
    def status(d):
        if d["ledger_parsed"] > 0:
            return "✅ 파싱완료"
        if d["ledger_xlsx"] > 0:
            return "⚠ 엑셀있으나 미파싱"
        if d["ledger_xls"] > 0 and (d["ledger_pdf"] + d["ledger_img"]) == 0:
            return "🔶 .xls 구형만"
        if (d["ledger_pdf"] + d["ledger_img"] + d["ledger_hwp"]) > 0:
            return "📷 이미지·PDF·한글만(OCR 필요)"
        return "❓ 급여대장 안보임"

    rows = []
    for sb, d in sites.items():
        d["status"] = status(d)
        d["years"] = sorted(d["years"])
        rows.append((sb, d))
    rows.sort(key=lambda kv: -kv[1]["files"])

    stat_cnt = Counter(d["status"] for _, d in rows)
    handler_cnt = Counter(d["handler"] for _, d in rows)

    L = []
    L.append("=" * 62)
    L.append(f"전수 폴더 감사 — 급여업체(사업장) 총 {len(rows)}곳")
    L.append("=" * 62)
    L.append("[담당자별 사업장 수]  " + ", ".join(f"{h} {handler_cnt[h]}" for h in HANDLERS))
    L.append("")
    L.append("[상태 분포]")
    for s, n in stat_cnt.most_common():
        L.append(f"  {s}: {n}곳")
    L.append("")
    L.append("[사업장별 상세]  (파일수 · 연도 · 급여대장 xlsx/파싱/pdf/img/hwp/xls)")
    for sb, d in rows:
        yr = f"{d['years'][0]}~{d['years'][-1]}" if d["years"] else "?"
        L.append(f"  {d['status']}  [{d['handler']}] {sb}  ({d['files']}건, {yr})")
        L.append(f"        급여대장 xlsx {d['ledger_xlsx']}/파싱 {d['ledger_parsed']} · pdf {d['ledger_pdf']} · img {d['ledger_img']} · hwp {d['ledger_hwp']} · xls {d['ledger_xls']}")

    out = "\n".join(L)
    with open(os.path.join(OUT_DIR, "audit_sites.txt"), "w", encoding="utf-8") as f:
        f.write(out)
    with open(os.path.join(OUT_DIR, "audit_sites.json"), "w", encoding="utf-8") as f:
        json.dump({sb: d for sb, d in rows}, f, ensure_ascii=False, indent=1)
    try:
        print(out[:2000])
    except UnicodeEncodeError:
        print("(audit_sites.txt 참조)")


if __name__ == "__main__":
    main()
