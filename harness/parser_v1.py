# -*- coding: utf-8 -*-
"""
하네스 1차 - 목표 1: 골든 파서 v1 (가로 표형 급여대장 → 직원별 dict)
- 급여대장 시트 자동 선택 + 2~3줄 병합 헤더 평탄화 + 컬럼 자동 인식.
- 주민번호는 '데이터 행 판별'에만 사용하고 절대 저장하지 않음(성명만).
- v1 범위: 가로 표형(한 줄 = 직원). 명세서(세로)형·일용 블록형은 다음 확장.
- 테스트 모드: `python harness/parser_v1.py --test` → 샘플 몇 개를 뽑아 결과 출력.
"""
import os, json, re, sys, warnings
warnings.filterwarnings("ignore")

DATA_ROOT = os.environ.get(
    "PAYROLL_DATA_ROOT",
    r"C:\Users\fair0\OneDrive\바탕 화면\급여아웃소싱 서류들",
)
OUT_DIR = os.path.join(DATA_ROOT, "_harness_out")

FIELDS = {
    "성명":     ["성명", "이름", "성 명", "직원명"],
    "기본급":   ["기본급", "기본 급"],
    "과세총액": ["과세총액", "과세대상", "과세소득", "과세금액", "과세계"],
    "소득세":   ["소득세", "갑근세"],
    "지방세":   ["지방소득세", "지방세", "주민세"],
    "국민연금": ["국민연금"],
    "건강보험": ["건강보험"],
    "장기요양": ["장기요양", "요양보험"],
    "고용보험": ["고용보험"],
    "공제총액": ["공제총액", "공제계", "공제합계", "공제금액", "공제 계"],
    "실수령":   ["차인지급액", "차인지급", "실지급액", "실수령액", "실수령", "실지급", "차감지급", "실지급총액"],
}
JUMIN_RE = re.compile(r'\d{6}\s*[-]?\s*\d{6,7}')
NAME_RE = re.compile(r'^[가-힣]{2,4}$')
NUM_RE = re.compile(r'^-?[\d,]+(\.\d+)?$')

# 급여대장 시트로 볼 이름 힌트 / 제외할 시트
SHEET_GOOD = ["급여대장", "급상여", "급여", "임금대장", "명세"]
SHEET_BAD = ["세율", "세액표", "base", "data", "설명", "근로기준법", "사업자", "연차", "안내"]


def flatten_cols(rows, col_count):
    """여러 헤더행을 컬럼별로 세로 결합."""
    out = []
    for c in range(col_count):
        parts = []
        for row in rows:
            v = row[c] if c < len(row) else None
            if v is not None and str(v).strip():
                parts.append(str(v).strip())
        out.append(" ".join(parts))
    return out


def match_field(header_text):
    for canon, syns in FIELDS.items():
        for s in syns:
            if s in header_text:
                return canon
    return None


def parse_num(v):
    if v is None:
        return None
    s = str(v).replace(",", "").replace(" ", "").strip()
    if s in ("", "-", "—"):
        return None
    try:
        f = float(s)
        return int(f) if f == int(f) else f
    except ValueError:
        return None


def score_sheet(ws):
    """시트가 가로 표형 급여대장인지 점수화. (헤더행, 필드매핑, 데이터시작행) or None.
    주민번호가 있으면 그 행을, 없으면 헤더(성명+급여항목) 다음 행을 데이터 시작으로 본다."""
    rows = list(ws.iter_rows(min_row=1, max_row=min(ws.max_row, 25), max_col=min(ws.max_column, 60), values_only=True))
    if not rows:
        return None

    def field_hits(row):
        joined = " ".join(str(c) for c in row if c is not None)
        f = set()
        for canon, syns in FIELDS.items():
            if any(s in joined for s in syns):
                f.add(canon)
        return f

    # 1) 후보 헤더행 = 핵심필드가 가장 많은 행
    best_i, best_f = None, set()
    for i, row in enumerate(rows):
        f = field_hits(row)
        if len(f) > len(best_f):
            best_f, best_i = f, i
    if best_i is None or len(best_f) < 4:
        return None

    # 2) 데이터 시작행: 헤더 이후 첫 주민번호행, 없으면 헤더+1
    data_start = None
    for i in range(best_i, len(rows)):
        joined = " ".join(str(c) for c in rows[i] if c is not None)
        if JUMIN_RE.search(joined):
            data_start = i
            break
    if data_start is None or data_start <= best_i:
        data_start = best_i + 1

    # 3) 헤더 결합(2~3줄 병합 대응) → 컬럼→필드 매핑
    hstart = max(0, min(best_i, data_start - 1) - 2)
    header_rows = rows[hstart:data_start]
    col_count = max(len(r) for r in rows)
    flat = flatten_cols(header_rows, col_count)
    colmap = {}
    for ci, htext in enumerate(flat):
        f = match_field(htext)
        if f and f not in colmap.values():
            colmap[ci] = f
    fields = set(colmap.values())
    if len(fields) < 4:
        return None
    return {"data_start": data_start, "header_rows": (hstart, data_start),
            "colmap": colmap, "fields": fields, "col_count": col_count}


def pick_and_parse(wb):
    """워크북에서 급여대장 시트들을 골라 파싱. 시트별 결과 리스트."""
    out = []
    for ws in wb.worksheets:
        nm = ws.title.lower()
        if any(b in nm for b in SHEET_BAD):
            continue
        sc = score_sheet(ws)
        if not sc:
            continue
        rows = list(ws.iter_rows(min_row=1, max_row=ws.max_row, max_col=sc["col_count"], values_only=True))
        colmap = sc["colmap"]
        # 성명 컬럼: 헤더매핑 우선, 없으면 데이터에서 한글이름 최빈 컬럼 추정
        name_col = next((c for c, f in colmap.items() if f == "성명"), None)
        employees = []
        for row in rows[sc["header_rows"][1]:]:
            joined = " ".join(str(c) for c in row if c is not None)
            # 합계행 등 제외
            if any(k in joined for k in ["합계", "총계", "소계", "합 계"]):
                continue
            has_jumin = bool(JUMIN_RE.search(joined))
            # 성명 후보
            nm = None
            if name_col is not None and name_col < len(row) and row[name_col]:
                cand = str(row[name_col]).strip()
                if NAME_RE.match(cand):
                    nm = cand
            if nm is None and has_jumin:
                # 주민번호 왼쪽 첫 한글이름 셀
                for c in row:
                    if c and NAME_RE.match(str(c).strip()):
                        nm = str(c).strip(); break
            if not nm:
                continue
            emp = {"성명": nm}
            for c, f in colmap.items():
                if f == "성명":
                    continue
                if c < len(row):
                    val = parse_num(row[c])
                    if val is not None:
                        emp[f] = val
            if len(emp) >= 3:  # 성명 + 숫자필드 2개+
                employees.append(emp)
        if employees:
            out.append({"sheet": ws.title, "fields": sorted(sc["fields"]),
                        "n_emp": len(employees), "employees": employees})
    return out


def extract(path):
    import openpyxl
    res = {"path": os.path.relpath(path, DATA_ROOT), "ok": False, "sheets": [], "err": None}
    try:
        wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
        sheets = pick_and_parse(wb)
        wb.close()
        res["sheets"] = sheets
        res["ok"] = len(sheets) > 0
        res["n_emp_total"] = sum(s["n_emp"] for s in sheets)
    except Exception as e:
        res["err"] = f"{type(e).__name__}: {e}"
    return res


def test_mode():
    prof = json.load(open(os.path.join(OUT_DIR, "profile.json"), encoding="utf-8"))
    keys = ["가람떡집", "일등한우(주)", "니쿠미야", "선우기술", "파보네", "제스트"]
    picked = []
    for k in keys:
        for r in prof:
            if k in r["path"] and r["path"].endswith(".xlsx") and r not in picked:
                picked.append(r); break
    lines = []
    for r in picked:
        res = extract(os.path.join(DATA_ROOT, r["path"]))
        base = r["path"].split("\\")[-1] if "\\" in r["path"] else r["path"].split("/")[-1]
        lines.append(f"\n#### {base}")
        if res["err"]:
            lines.append("   ERR: " + res["err"]); continue
        if not res["ok"]:
            lines.append("   [실패] 급여대장 표 인식 실패"); continue
        for s in res["sheets"][:2]:
            lines.append(f"   시트'{s['sheet']}' 필드{s['fields']} 직원{s['n_emp']}명")
            for e in s["employees"][:3]:
                lines.append("     - " + str({k: v for k, v in e.items()}))
    out = "\n".join(lines)
    os.makedirs(OUT_DIR, exist_ok=True)
    with open(os.path.join(OUT_DIR, "parser_test.txt"), "w", encoding="utf-8") as f:
        f.write(out)
    try:
        print(out)
    except UnicodeEncodeError:
        print("(콘솔 인코딩 문제로 생략 — parser_test.txt 참조)")


# ══════════════════════════════════════════════════════════════
#  세로 명세서형 파서 (에스에스테크·화인마취류)
#  지급항목|금액 / 공제항목|금액 세로배치. 주민번호 없이 라벨로 인식.
# ══════════════════════════════════════════════════════════════
PAY_LABEL = ["지급항목", "지급내역", "지 급 항 목"]
DED_LABEL = ["공제항목", "공제내역", "공 제 항 목"]
NAME_LABEL = ["성명", "성 명", "성  명", "성    명", "직원명", "근로자명"]
FIELDS_VERT = dict(FIELDS)
FIELDS_VERT["지급총액"] = ["지급총액", "지급 총액", "지급계", "지급합계", "지 급 총 액"]


def _cellstr(v):
    return "" if v is None else str(v).strip()


def _norm(s):
    """공백(자간 벌리기 포함) 전부 제거해 라벨 매칭."""
    return re.sub(r"\s+", "", str(s)) if s is not None else ""

NAME_KEYS = {"성명", "사원명", "직원명", "근로자명", "성함", "이름", "사원성명", "근로자성명"}
# 공백 제거한 필드 동의어(성명 제외)
FIELDS_VN = {k: [_norm(s) for s in v] for k, v in FIELDS_VERT.items() if k != "성명"}


def extract_vertical(path):
    """세로 명세서형: 공백무시 + '성명' 앵커 기준 블록 단위 추출(좌우·상하 다중 블록 대응)."""
    import openpyxl
    res = {"path": os.path.relpath(path, DATA_ROOT), "ok": False, "sheets": [], "err": None, "mode": "vertical"}
    try:
        wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    except Exception as e:
        res["err"] = f"{type(e).__name__}: {e}"
        return res
    for ws in wb.worksheets:
        low = ws.title.lower()
        if any(b in low for b in SHEET_BAD):
            continue
        grid = list(ws.iter_rows(min_row=1, max_row=min(ws.max_row, 250),
                                 max_col=min(ws.max_column, 40), values_only=True))
        if not grid:
            continue
        R = len(grid)
        norm = [[_norm(c) for c in row] for row in grid]

        # 1) 성명 앵커 수집
        anchors = []
        for r in range(R):
            for c in range(len(norm[r])):
                if norm[r][c] in NAME_KEYS:
                    val = None
                    for k in range(c + 1, min(c + 4, len(grid[r]))):
                        cell = grid[r][k]
                        s = "" if cell is None else str(cell).strip()
                        if s and _norm(s) not in NAME_KEYS and not s.endswith("명"):
                            val = s
                            break
                    if val and re.match(r"^[가-힣A-Za-z]", val) and len(val) <= 12:
                        anchors.append((r, c, val))
        if not anchors:
            continue
        anchors.sort()

        # 2) 앵커별 영역 경계(하단/우측 다음 블록 전까지) → 필드 수집
        emps = []
        for (ar, ac, nm) in anchors:
            row_end, col_end = R, len(grid[0]) if grid[0] else ac + 12
            for (br, bc, _n) in anchors:
                if br > ar and abs(bc - ac) <= 2:
                    row_end = min(row_end, br)
                if bc > ac + 2 and abs(br - ar) <= 3:
                    col_end = min(col_end, bc)
            row_end = min(row_end, ar + 30)
            col_end = min(col_end, ac + 12)
            emp = {"성명": nm}
            for canon, syns in FIELDS_VN.items():
                got = None
                for r in range(ar, min(row_end, R)):
                    ln = len(norm[r])
                    for c in range(ac, min(col_end, ln)):
                        cell = norm[r][c]
                        if cell and any(s and s in cell for s in syns):
                            for k in range(c + 1, min(c + 3, len(grid[r]))):
                                v = parse_num(grid[r][k])
                                if v is not None:
                                    got = v
                                    break
                        if got is not None:
                            break
                    if got is not None:
                        break
                if got is not None:
                    emp[canon] = got
            if len(emp) >= 3:
                emps.append(emp)
        if emps:
            fields = sorted({k for e in emps for k in e})
            res["sheets"].append({"sheet": ws.title, "fields": fields, "n_emp": len(emps), "employees": emps})
    wb.close()
    res["ok"] = len(res["sheets"]) > 0
    res["n_emp_total"] = sum(s["n_emp"] for s in res["sheets"])
    return res


def extract_any(path):
    """가로형(검증됨) 우선. 세로형은 값 정확도 미검증 → 기본 비활성(환경변수로만 실험).

    ⚠️ 세로 명세서형(extract_vertical)은 병합 셀 값-위치 매핑이 아직 부정확해
       숫자를 틀리게 읽을 수 있음. HARNESS_VERTICAL=1 일 때만 실험적으로 사용.
       (급여 시스템에서 틀린 숫자는 위험 → 검증 완료 전 기본 사용 금지)
    """
    r = extract(path)
    if r["ok"]:
        r["mode"] = "horizontal"
        return r
    if os.environ.get("HARNESS_VERTICAL") == "1":
        v = extract_vertical(path)
        if v["ok"]:
            v["mode"] = "vertical(experimental)"
            return v
    r["mode"] = "none"
    return r


def run_all():
    """전체 급여대장 엑셀에 파서 적용 → 커버리지 산출."""
    from collections import Counter
    cls = json.load(open(os.path.join(OUT_DIR, "file_classification.json"), encoding="utf-8"))
    targets = [r for r in cls if r["label"] == "급여대장" and r["ext"] in (".xlsx", ".xlsm")]

    # 모수 종류 분류: 비급여(오분류) / 일용(확장대상) / 상용(가로표 기대)
    NONLEDGER = ["연차", "명부", "근로자정보", "직원정보", "직원 정보", "정보(", "양식",
                 "근무표", "피부양", "취득", "상실", "주소록", "수습", "명단"]
    def kind(rel):
        b = rel.split("\\")[-1] if "\\" in rel else rel.split("/")[-1]
        if any(k in b for k in NONLEDGER):
            return "비급여(오분류)"
        if "일용" in rel:
            return "일용직"
        return "상용"
    for r in targets:
        r["_kind"] = kind(r["path"])

    results = []
    for r in targets:
        rr = extract_any(os.path.join(DATA_ROOT, r["path"]))
        rr["_kind"] = r["_kind"]
        results.append(rr)

    ok = [r for r in results if r["ok"]]
    err = [r for r in results if not r["ok"] and r["err"]]
    norec = [r for r in results if not r["ok"] and not r["err"]]
    total_emp = sum(r.get("n_emp_total", 0) for r in ok)
    total_sheets = sum(len(r["sheets"]) for r in ok)
    mode_cnt = Counter(r.get("mode", "?") for r in ok)

    # 필드 채움률(성공 파일 기준, 시트 union)
    field_files = Counter()
    for r in ok:
        fs = set()
        for s in r["sheets"]:
            fs |= set(s["fields"])
        for f in fs:
            field_files[f] += 1

    # 결과 저장(개인정보 포함 → 자료 쪽)
    with open(os.path.join(OUT_DIR, "parser_output.json"), "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False)

    lines = []
    lines.append(f"대상 급여대장 엑셀(.xlsx/.xlsm): {len(targets)}")
    lines.append(f"  파싱 성공(직원 1명+ 추출): {len(ok)}  ({100*len(ok)//max(len(targets),1)}%)")
    lines.append(f"    - 가로 표형: {mode_cnt.get('horizontal',0)}  / 세로 명세서형: {mode_cnt.get('vertical',0)}")
    lines.append(f"  표 인식 실패(열림·표없음): {len(norec)}")
    lines.append(f"  열기 실패(손상 등): {len(err)}")
    lines.append(f"  추출 직원 레코드 총: {total_emp}")
    lines.append(f"  추출 급여대장 시트(월탭 분해 포함) 총: {total_sheets}")
    lines.append("")
    lines.append("[모수 종류별 성공률] — 진짜 성공률은 '상용' 기준")
    for kd in ["상용", "일용직", "비급여(오분류)"]:
        grp = [r for r in results if r.get("_kind") == kd]
        gok = [r for r in grp if r["ok"]]
        lines.append(f"  {kd}: {len(gok)}/{len(grp)} 성공 ({100*len(gok)//max(len(grp),1)}%)")
    lines.append("")
    lines.append("[성공 파일의 필드 포함률]")
    for f in FIELDS:
        n = field_files[f]
        lines.append(f"  {f}: {n} ({100*n//max(len(ok),1)}%)")
    lines.append("")
    lines.append("[실패 파일 예시 20]")
    for r in (norec + err)[:20]:
        base = r["path"].split("\\")[-1] if "\\" in r["path"] else r["path"].split("/")[-1]
        lines.append(f"  {'ERR:'+r['err'][:30] if r['err'] else '표없음'} | {base}")

    out = "\n".join(lines)
    with open(os.path.join(OUT_DIR, "parser_coverage.txt"), "w", encoding="utf-8") as f:
        f.write(out)
    try:
        print(out)
    except UnicodeEncodeError:
        print("(콘솔 인코딩 — parser_coverage.txt 참조)")


if __name__ == "__main__":
    if "--test" in sys.argv:
        test_mode()
    elif "--all" in sys.argv:
        run_all()
    else:
        print("사용: --test (샘플 검증) | --all (전체 커버리지)")
