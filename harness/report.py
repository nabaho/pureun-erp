# -*- coding: utf-8 -*-
"""
하네스 1차 - 목표 7: 커버리지 리포트 (HTML 1장)
- 개인정보(개별 성명·주민번호·개인 급여) 미포함. 집계만.
- 결과: _harness_out/coverage_report.html
"""
import os, json, html
from collections import Counter, defaultdict

DATA_ROOT = os.environ.get(
    "PAYROLL_DATA_ROOT",
    r"C:\Users\fair0\OneDrive\바탕 화면\급여아웃소싱 서류들",
)
OUT_DIR = os.path.join(DATA_ROOT, "_harness_out")

NONLEDGER = ["연차", "명부", "근로자정보", "직원정보", "직원 정보", "정보(", "양식",
             "근무표", "피부양", "취득", "상실", "주소록", "수습", "명단"]


def kind(rel):
    b = rel.split("\\")[-1] if "\\" in rel else rel.split("/")[-1]
    if any(k in b for k in NONLEDGER):
        return "비급여(오분류)"
    if "일용" in rel:
        return "일용직"
    if "사업소득" in rel:
        return "사업소득"
    return "상용"


def bar(pct, color):
    return f'<div class="bar"><div class="fill" style="width:{pct}%;background:{color}"></div><span>{pct}%</span></div>'


def main():
    cls = json.load(open(os.path.join(OUT_DIR, "file_classification.json"), encoding="utf-8"))
    res = json.load(open(os.path.join(OUT_DIR, "parser_output.json"), encoding="utf-8"))

    # 분류 집계
    by_label = Counter(r["label"] for r in cls)
    # 파서 집계
    targets = res
    ok = [r for r in targets if r["ok"]]
    err = [r for r in targets if not r["ok"] and r.get("err")]
    norec = [r for r in targets if not r["ok"] and not r.get("err")]
    total_emp = sum(r.get("n_emp_total", 0) for r in ok)
    total_sheets = sum(len(r["sheets"]) for r in ok)
    flagged = sum(r.get("n_flagged", 0) for r in targets)
    mode_cnt = Counter(r.get("mode", "?") for r in ok)

    # 종류별
    kinds = defaultdict(lambda: [0, 0])
    for r in targets:
        k = kind(r["path"])
        kinds[k][1] += 1
        if r["ok"]:
            kinds[k][0] += 1

    # 담당자별 직원수(집계)
    handler_emp = Counter()
    for r in ok:
        h = r["path"].split("\\")[0] if "\\" in r["path"] else r["path"].split("/")[0]
        handler_emp[h] += r.get("n_emp_total", 0)

    # 필드 채움률
    field_files = Counter()
    for r in ok:
        fs = set()
        for s in r["sheets"]:
            fs |= set(s["fields"])
        for f in fs:
            field_files[f] += 1
    FIELD_ORDER = ["성명", "기본급", "과세총액", "소득세", "지방세", "국민연금",
                   "건강보험", "장기요양", "고용보험", "공제총액", "실수령"]

    # 실패 사유 분류
    fail_cat = Counter()
    for r in (norec + err):
        b = r["path"].split("\\")[-1] if "\\" in r["path"] else r["path"].split("/")[-1]
        if any(k in b for k in NONLEDGER):
            fail_cat["비급여 파일(연차·명부·양식 등)"] += 1
        elif "일용" in r["path"] or "임금지급대장" in b:
            fail_cat["일용/특수 명세서(값 검증 탈락 포함)"] += 1
        elif r.get("err"):
            fail_cat["파일 손상"] += 1
        else:
            fail_cat["기타 특수양식"] += 1

    NAVY, VIOLET, OK, WARN, BAD = "#2E3A8C", "#7C6CE0", "#2E7D4F", "#B26A00", "#C43D3D"
    okpct = 100 * len(ok) // max(len(targets), 1)

    def kv_rows(items, total, color):
        out = []
        mx = max((v for _, v in items), default=1)
        for k, v in items:
            w = 100 * v // max(mx, 1)
            out.append(f'<div class="row"><div class="lbl">{html.escape(str(k))}</div>'
                       f'<div class="bar"><div class="fill" style="width:{w}%;background:{color}"></div></div>'
                       f'<div class="num">{v:,}</div></div>')
        return "".join(out)

    kind_rows = ""
    KCOLOR = {"상용": OK, "일용직": VIOLET, "사업소득": NAVY, "비급여(오분류)": WARN}
    for k in ["상용", "일용직", "사업소득", "비급여(오분류)"]:
        if k not in kinds:
            continue
        okc, tot = kinds[k]
        pct = 100 * okc // max(tot, 1)
        kind_rows += (f'<div class="row"><div class="lbl">{k}</div>'
                      f'<div class="bar"><div class="fill" style="width:{pct}%;background:{KCOLOR.get(k,NAVY)}"></div>'
                      f'<span>{pct}%</span></div><div class="num">{okc}/{tot}</div></div>')

    field_rows = ""
    for f in FIELD_ORDER:
        n = field_files.get(f, 0)
        pct = 100 * n // max(len(ok), 1)
        col = OK if pct >= 85 else (WARN if pct >= 50 else BAD)
        field_rows += (f'<div class="row"><div class="lbl">{f}</div>'
                       f'<div class="bar"><div class="fill" style="width:{pct}%;background:{col}"></div>'
                       f'<span>{pct}%</span></div><div class="num">{n}</div></div>')

    html_out = f"""<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>급여 하네스 커버리지 리포트</title>
<style>
:root{{--navy:{NAVY};--violet:{VIOLET};--ok:{OK};--warn:{WARN};--bad:{BAD};
--ink:#23263B;--sub:#6B6F87;--line:#E3E5EF;--paper:#F5F6FA;--card:#FFF;}}
*{{box-sizing:border-box;margin:0}}
body{{font-family:'Malgun Gothic',-apple-system,sans-serif;background:var(--paper);color:var(--ink);line-height:1.5;font-size:15px}}
.wrap{{max-width:960px;margin:0 auto;padding:28px 18px 80px}}
h1{{font-size:24px;letter-spacing:-.02em}}
.sub{{color:var(--sub);font-size:13px;margin-top:4px}}
.priv{{display:inline-block;font-size:11px;color:var(--violet);border:1px solid var(--violet);border-radius:99px;padding:2px 10px;margin-top:10px}}
.cards{{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:22px 0}}
.card{{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:16px}}
.card .n{{font-size:26px;font-weight:800;color:var(--navy);letter-spacing:-.02em}}
.card .l{{font-size:12px;color:var(--sub);margin-top:2px}}
section{{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:18px 20px;margin-bottom:16px}}
h2{{font-size:15px;color:var(--navy);margin-bottom:14px}}
.row{{display:flex;align-items:center;gap:10px;margin:7px 0}}
.lbl{{width:120px;font-size:13px;flex-shrink:0}}
.bar{{flex:1;background:#EEF0F7;border-radius:8px;height:20px;position:relative;overflow:hidden}}
.fill{{height:100%;border-radius:8px}}
.bar span{{position:absolute;right:8px;top:0;line-height:20px;font-size:11px;font-weight:700;color:#333}}
.num{{width:80px;text-align:right;font-size:13px;font-weight:700;font-variant-numeric:tabular-nums}}
.big{{font-size:34px;font-weight:800;color:var(--ok)}}
.note{{font-size:12.5px;color:var(--sub);margin-top:8px;line-height:1.7}}
.pill{{display:inline-block;background:#EEF0F7;border-radius:8px;padding:2px 9px;font-size:12px;margin:2px 3px}}
</style></head><body><div class="wrap">
<h1>급여 하네스 1차 — 커버리지 리포트</h1>
<div class="sub">푸른노무법인 · 급여대장 자동 추출 현황 (담당자 3인, 과거 아카이브 제외)</div>
<div class="priv">🔒 개인정보(개별 성명·주민번호·개인 급여) 미포함 · 집계만 표시</div>

<div class="cards">
  <div class="card"><div class="n">{by_label['급여대장']:,}</div><div class="l">급여대장 분류(전체)</div></div>
  <div class="card"><div class="n">{len(targets):,}</div><div class="l">파싱 대상 엑셀</div></div>
  <div class="card"><div class="n">{total_emp:,}</div><div class="l">추출 직원 레코드</div></div>
  <div class="card"><div class="n">{total_sheets:,}</div><div class="l">월별 시트(월탭 분해)</div></div>
</div>

<section>
  <h2>전체 파싱 성공률</h2>
  <div style="display:flex;align-items:baseline;gap:14px">
    <div class="big">{okpct}%</div>
    <div class="note">성공 {len(ok):,} / 대상 {len(targets):,}<br>
    파서 종류: 가로 표형 {mode_cnt.get('horizontal',0)} · 세로 명세서형 {mode_cnt.get('vertical',0)}<br>
    ⚠️ 값 검증 탈락(사람 확인 대상): {flagged}건 — 틀린 숫자 유입 차단</div>
  </div>
</section>

<section>
  <h2>급여대장 종류별 성공률 (진짜 성공률 = 상용 기준)</h2>
  {kind_rows}
  <div class="note">일용직·세로형은 값 검증을 통과한 것만 채택. 비급여는 원래 급여대장이 아님.</div>
</section>

<section>
  <h2>파일 분류 결과 (5,265개)</h2>
  {kv_rows(by_label.most_common(), sum(by_label.values()), VIOLET)}
</section>

<section>
  <h2>핵심 필드 추출률 (성공 파일 기준)</h2>
  {field_rows}
</section>

<section>
  <h2>담당자별 추출 직원 레코드</h2>
  {kv_rows(handler_emp.most_common(), total_emp, NAVY)}
</section>

<section>
  <h2>미추출 사유 (남은 {len(norec)+len(err)}개)</h2>
  {"".join(f'<span class="pill">{html.escape(k)}: {v}</span>' for k,v in fail_cat.most_common())}
  <div class="note">대부분 급여대장이 아닌 파일(연차·명부·양식 등)이거나, 값이 미심쩍어 안전하게 사람 확인으로 넘긴 특수 양식입니다.</div>
</section>

<div class="sub" style="text-align:center;margin-top:20px">
  하네스 v2.2 · 가로표형+세로명세서형+사업소득형 파서 · 주민번호 미저장 · 전량 로컬 처리
</div>
</div></body></html>"""

    out_path = os.path.join(OUT_DIR, "coverage_report.html")
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(html_out)
    print("생성:", out_path)


if __name__ == "__main__":
    main()
