# -*- coding: utf-8 -*-
import json, re, os
from collections import defaultdict
DATA = os.environ.get("PAYROLL_DATA_ROOT", r"C:\Users\fair0\OneDrive\바탕 화면\급여아웃소싱 서류들")
res = json.load(open(os.path.join(DATA, "_harness_out", "parser_output.json"), encoding="utf-8"))
WRAP = {"급여", "1. 급여", "급여자료", "기타", "급여관리"}
def site(rel):
    p = rel.replace("/", "\\").split("\\"); r = p[1:]; i = 0
    while i < len(r) and r[i] in WRAP: i += 1
    if i >= len(r): return None
    s = re.sub(r'^\d+\s*[.\-]\s*', '', r[i]).strip()
    return re.sub(r'\s*[\(\[].*?[\)\]]\s*$', '', s).strip() or s
agg = defaultdict(lambda: [0, 0, 0])
for r in res:
    if not r["ok"] or not r["path"].startswith("주민정"): continue
    sb = site(r["path"])
    for s in r["sheets"]:
        for e in s["employees"]:
            a = agg[sb]; a[0] += 1
            if e.get("과세총액") is not None: a[1] += 1
            if e.get("지급총액") is not None: a[2] += 1
top = sorted(agg.items(), key=lambda kv: -kv[1][0])[:12]
print("주민정 담당 사업장 (직원레코드 / 과세총액보유 / 지급총액보유):")
for s, a in top:
    print(f"  {a[0]:4} / 과세{a[1]:4} / 지급{a[2]:4}  {s}")
