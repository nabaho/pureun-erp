# -*- coding: utf-8 -*-
"""
하네스 1차 - 목표 0: 파일 자동 분류
- 코드는 pureunall/harness/ 에, 실제 자료는 별도 자료폴더에 있음(개인정보 분리).
- 대상: 담당자 3인 폴더(주민정/박은비/김보람). '2.급여관리'(과거 아카이브)는 제외.
- 분류: 급여대장 / 근태 / 근로계약서 / 퇴직금산정 / 공단신고 / 기타
- 판별 = 폴더+파일명 키워드 + (엑셀은) 내용 검증. 내용은 '급여대장 승격'에만 사용(오강등 방지).
- 결과: {자료폴더}/_harness_out/  (직원명 포함 → 자료 쪽에 보관, git 제외)
"""
import os, glob, json, re, warnings
warnings.filterwarnings("ignore")

# ── 경로 설정 (코드/자료 분리) ─────────────────────────────
# 자료폴더 위치. 환경변수 PAYROLL_DATA_ROOT 로 덮어쓸 수 있음.
DATA_ROOT = os.environ.get(
    "PAYROLL_DATA_ROOT",
    r"C:\Users\fair0\OneDrive\바탕 화면\급여아웃소싱 서류들",
)
OUT_DIR = os.path.join(DATA_ROOT, "_harness_out")  # 결과물(개인정보) = 자료 쪽 보관
# ──────────────────────────────────────────────────────────

HANDLERS = ["주민정", "박은비", "김보람"]
ARCHIVE = "2.급여관리"  # 제외

KEYWORDS = [
    ("근로계약서", ["근로계약", "계약서", "취업규칙", "연봉계약"]),
    ("퇴직금산정", ["퇴직금", "퇴직정산", "퇴직소득", "퇴직연금", "퇴직자정산", "퇴직 정산"]),
    ("공단신고",   ["취득", "상실", "공단", "보수총액", "보수변경", "이직확인", "피부양자",
                   "4대보험", "사대보험", "정정신고", "납부유예", "연말정산", "지급명세",
                   "근로내용확인", "특례고용", "출입국"]),
    ("근태",       ["근태", "출근부", "출퇴근", "근무일", "근로시간", "근무기록", "근태기록",
                   "근태수치", "월별근태", "출근"]),
    ("급여대장",   ["급여대장", "급여", "급상여", "임금대장", "급여명세", "봉급", "월급", "상여",
                   "급여자료", "급여체크", "급여관리"]),
]

LEDGER_HDR = ["기본급", "과세", "공제", "실수령", "실지급", "소득세", "지방소득세", "국민연금",
              "건강보험", "고용보험", "장기요양", "차인지급", "지급총액", "비과세", "상여금"]
ATT_HDR = ["출근", "결근", "지각", "조퇴", "연장근로", "야간근로", "휴일근로", "근로시간",
           "근무일수", "총근로", "소정근로", "연장", "야간", "특근"]

EXCEL_EXT = {".xlsx", ".xlsm"}
SKIP_HIDDEN = "~$"


# 급여대장으로 오분류되기 쉬운 비급여 파일 (최우선 판정 — 급여대장에서 제외)
NONLEDGER_HARD = [
    ("기타",     ["연차대장", "연차 대장", "명부", "명단", "주소록", "근로자정보", "직원정보",
                 "직원 정보", "근로자 정보", "입금내역", "신규거래", "지급명세서_양식",
                 "노무비대장양식", "_양식", "양식.xlsx"]),
    ("근태",     ["근무표", "근무 표"]),
    ("공단신고", ["피부양"]),
]


def name_classify(path):
    hay = path.replace("\\", "/")
    base = os.path.basename(hay)
    # 0) 비급여 강제 판정 (파일명 기준, 최우선)
    for label, kws in NONLEDGER_HARD:
        for kw in kws:
            if kw in base:
                return label, f"비급여규칙:{kw}"
    for label, kws in KEYWORDS:
        for kw in kws:
            if kw in base:
                return label, f"파일명:{kw}"
    for label, kws in KEYWORDS:
        for kw in kws:
            if kw in hay:
                return label, f"폴더:{kw}"
    return "기타", "키워드없음"


def content_classify(path):
    try:
        import openpyxl
        wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    except Exception as e:
        return None, f"열기실패:{type(e).__name__}"
    ledger_hits, att_hits = set(), set()
    try:
        for ws in wb.worksheets[:6]:
            cnt = 0
            for row in ws.iter_rows(min_row=1, max_row=12, max_col=40, values_only=True):
                for c in row:
                    if c is None:
                        continue
                    s = str(c)
                    for k in LEDGER_HDR:
                        if k in s:
                            ledger_hits.add(k)
                    for k in ATT_HDR:
                        if k in s:
                            att_hits.add(k)
                cnt += 1
                if cnt >= 12:
                    break
    finally:
        wb.close()
    if len(ledger_hits) >= 3 and len(ledger_hits) >= len(att_hits):
        return "급여대장", f"내용:급여헤더{sorted(ledger_hits)[:5]}"
    if len(att_hits) >= 3 and len(att_hits) > len(ledger_hits):
        return "근태", f"내용:근태헤더{sorted(att_hits)[:5]}"
    return None, f"내용불충분(급여{len(ledger_hits)}/근태{len(att_hits)})"


def main():
    if not os.path.isdir(DATA_ROOT):
        raise SystemExit(f"자료폴더를 찾을 수 없음: {DATA_ROOT}\n"
                         f"→ 환경변수 PAYROLL_DATA_ROOT 로 경로를 지정하세요.")
    records = []
    for h in HANDLERS:
        hdir = os.path.join(DATA_ROOT, h)
        if not os.path.isdir(hdir):
            continue
        for path in glob.glob(os.path.join(hdir, "**", "*"), recursive=True):
            if not os.path.isfile(path):
                continue
            base = os.path.basename(path)
            if SKIP_HIDDEN in base:
                continue
            ext = os.path.splitext(base)[1].lower()
            rel = os.path.relpath(path, DATA_ROOT)
            name_label, name_reason = name_classify(rel)
            final_label, final_reason, conflict = name_label, name_reason, False
            # 내용은 '급여대장 승격'에만 사용, 이름 명확한 파일의 근태 강등 금지
            if ext in EXCEL_EXT:
                c_label, c_reason = content_classify(path)
                if c_label == "급여대장":
                    if name_label != "급여대장":
                        conflict = True
                        final_label = "급여대장"
                        final_reason = c_reason + f" (파일명은 '{name_label}')"
                    else:
                        final_reason = name_reason + " + " + c_reason
                elif c_label == "근태" and name_label == "기타":
                    conflict = True
                    final_label = "근태"
                    final_reason = c_reason + " (파일명은 '기타')"
            records.append({
                "path": rel, "handler": h, "ext": ext,
                "label": final_label, "reason": final_reason,
                "name_label": name_label, "conflict": conflict,
            })

    os.makedirs(OUT_DIR, exist_ok=True)
    with open(os.path.join(OUT_DIR, "file_classification.json"), "w", encoding="utf-8") as f:
        json.dump(records, f, ensure_ascii=False, indent=1)

    from collections import Counter, defaultdict
    total = len(records)
    by_label = Counter(r["label"] for r in records)
    by_label_handler = defaultdict(Counter)
    for r in records:
        by_label_handler[r["handler"]][r["label"]] += 1
    ledger = [r for r in records if r["label"] == "급여대장"]
    ledger_ext = Counter(r["ext"] for r in ledger)
    conflicts = [r for r in records if r["conflict"]]

    lines = [f"총 파일(담당자 3인, 아카이브 제외): {total}", "", "[분류별 개수]"]
    for lab, n in by_label.most_common():
        lines.append(f"  {lab}: {n}")
    lines += ["", "[담당자별 분류]"]
    for h in HANDLERS:
        c = by_label_handler[h]
        lines.append(f"  {h} (합 {sum(c.values())}): " +
                     ", ".join(f"{k} {v}" for k, v in c.most_common()))
    lines += ["", f"[급여대장 확장자별] 총 {len(ledger)}"]
    for e, n in ledger_ext.most_common():
        lines.append(f"  {e or '(없음)'}: {n}")
    lines += ["", f"[폴더명↔내용 불일치(내용 우선 재분류)]: {len(conflicts)}건"]
    for r in conflicts[:15]:
        lines.append(f"  {r['name_label']} → {r['label']} | {r['path']}")
    if len(conflicts) > 15:
        lines.append(f"  ... 외 {len(conflicts)-15}건")

    summary = "\n".join(lines)
    with open(os.path.join(OUT_DIR, "classify_summary.txt"), "w", encoding="utf-8") as f:
        f.write(summary)
    print(summary)


if __name__ == "__main__":
    main()
