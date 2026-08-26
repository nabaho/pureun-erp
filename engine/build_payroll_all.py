# -*- coding: utf-8 -*-
"""
전체 사업장 급여 데이터 생성 — 파일럿 3곳에서 **전부**로 넓힌 것 (대표 지시 2026-08-17)

build_pilot.py 와 **같은 규칙**으로 묶는다. 다른 것은 둘 —
  ① 사업장을 「파일럿 목록에 있나」로 고르지 않고 **경로에서 이름을 뽑는다.**
  ② 결과를 **얇은 목록(index)과 직원 표(emp)로 나눠** 낸다.

⚠ ②를 왜 나누나 — 급여관리는 payroll_os **전체**를 한 번에 읽고 같은 자리에
  구독까지 건다. 파일럿 3곳(342KB)일 때는 티가 안 났지만, 70곳이면 6.9MB라
  **열 때마다 14MB**, 누가 확정을 누를 때마다 **열려 있는 모든 사람에게 7MB**가
  다시 간다. 목록만 먼저 받고 직원 표는 그 달을 열 때 받으면 그 일이 없어진다.

⚠ 이름 뽑는 규칙(raw_site·site_base)은 **새로 쓰지 않고** build_site_cards 에서
  가져다 쓴다. 같은 규칙이 두 군데 있으면 설정카드의 사업장과 급여 화면의
  사업장이 어느 날 다른 이름이 되어, 카드가 안 붙는 사업장이 조용히 생긴다.
  3색 신호도 build_pilot 것을 그대로 가져다 쓴다 — 같은 까닭이다.
⚠ 결과물은 실데이터다 — 깃에 올리지 않는다(저장소 밖 _harness_out).
  주민번호는 담기지 않는다(성명만) — 파서가 애초에 안 뽑는다.

⚠ 알려진 문제(2026-08-17): 담당자 폴더 밑에 **사업장 폴더 없이 파일이 바로**
  놓인 경우, 이름 뽑는 규칙이 **파일 이름을 사업장으로** 집는다(70곳 중 31곳,
  직원 380명분 1.5%). 설정카드도 같은 규칙이라 같은 이름이 들어 있다.
  고치는 것은 raw_site 쪽 일이라 여기서 손대지 않는다 — 여기서는 **몇 곳이
  그런지 세어 알린다**(조용히 넘어가면 화면에 .xlsx 가 사업장으로 뜬다).

실행:  python engine/build_payroll_all.py
결과:  _harness_out/payroll_all.json  → 앱(payroll-os.html)의 「가져오기」로 올린다
"""
import os
import re
import sys
import json

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_site_cards import raw_site, site_base          # 이름 뽑는 규칙 한 곳
from build_pilot import signal, OUT_DIR                   # 3색 신호 규칙 한 곳

DRAFT = ["(안)", "(안 ", "초안", "검토용", "비교", "(수정전"]   # 확정본만
SKIP_SHEET = ("서식", "양식", "견본", "샘플", "sample")        # 샘플로 명세서 나가는 사고 방지
AMT = ("기본급", "과세총액", "지급총액", "실수령", "공제총액", "소득세", "고용보험")
KEYS = ("기본급", "과세총액", "소득세", "지방세", "국민연금", "건강보험",
        "장기요양", "고용보험", "공제총액", "실수령")
CORE_GROSS = ("과세총액", "지급총액", "기본급")

# 한 시트에 담을 직원 수 상한. build_pilot 은 60명에서 잘랐다(표시용).
# ⚠ 자르면 **잘랐다고 적는다**(끊긴수) — 조용히 사라지면 그 사람 명세서가 안 나오는데
#   화면에는 아무 표시도 없다.
CAP = int(os.environ.get("PAYROLL_EMP_CAP", "300"))


def best_per_name(raw):
    """사람당 1줄 — 앱의 dedupeEmps() 와 같은 기준(항목 많고 지급−공제=실수령 우대)."""
    def score(e):
        s = sum(1 for k in KEYS if e.get(k) is not None)
        g = e.get("지급총액") or e.get("과세총액") or e.get("기본급")
        d = e.get("공제총액")
        n = e.get("실수령")
        if g is not None and d is not None and n is not None and abs(g - d - n) <= 1:
            s += 5
        return s

    seen = {}
    for e in raw:
        nm = str(e.get("성명") or "").strip()
        if not nm:
            continue
        if nm not in seen or score(e) > score(seen[nm]):
            seen[nm] = e
    return list(seen.values())


def shown_signal(sig, emps):
    """화면이 보여 줄 신호 — 앱의 effSig() 와 같은 셈.

    ⚠ 앱은 이것을 **직원 표를 보고** 셌다. 이제 직원 표는 그 달을 열 때만
      받으므로, 목록 화면이 쓸 수 있게 **여기서 미리 세어 둔다.**
      (직원 표를 받은 뒤에는 앱이 다시 세므로 값이 어긋날 일은 없다.)
    """
    if sig == "red":
        return "red"
    if not emps:
        return "gray"
    ok = 0
    for e in emps:
        if (e.get("실수령") is not None and e.get("공제총액") is not None
                and any(e.get(k) is not None for k in CORE_GROSS)):
            ok += 1
    if ok < -(-len(emps) // 2):        # ceil(len/2)
        return "gray"
    return sig or "green"


def main():
    with open(os.path.join(OUT_DIR, "parser_output.json"), encoding="utf-8") as f:
        res = json.load(f)

    index = {}          # 사업장 → [얇은 줄]
    emp = {}            # 줄 번호 → [직원...]
    dropped = 0
    nosite = 0
    seq = 0

    for r in res:
        if not r.get("ok"):
            continue
        site = site_base(raw_site(r["path"]))
        if not site:
            nosite += 1
            continue
        base = os.path.basename(r["path"])
        if any(d in base for d in DRAFT):
            continue
        for s in (r.get("sheets") or []):
            if any(k in s["sheet"] for k in SKIP_SHEET):
                continue
            raw = [e for e in (s.get("employees") or []) if e.get("성명")]
            # 일용 명단의 「해당월 무근무」 행(금액이 전부 비었다) 제외 — 급여 레코드가 아니다
            raw = [e for e in raw if any(e.get(k) for k in AMT)]
            if not raw:
                continue
            emps = best_per_name(raw)
            sig, iss = signal(emps)
            cut = max(0, len(emps) - CAP)
            dropped += cut
            kept = emps[:CAP]

            seq += 1
            # ⚠ 줄 번호는 **실시간DB 열쇠로 쓸 수 있는 글자만** 쓴다.
            #   사업장 이름을 열쇠로 쓰면 . $ # [ ] / 가 든 이름에서 쓰기가 통째로 막힌다.
            rid = "r%05d" % seq
            row = {
                "id": rid,
                "월": s["sheet"],
                "파일": base,
                "직원수": len(emps),
                "신호": sig,
                "표시신호": shown_signal(sig, kept),
                "이슈": "; ".join(iss),
                "확정": False,
            }
            if cut:
                row["끊긴수"] = cut       # 몇 명이 안 담겼는지 화면이 알 수 있게
            index.setdefault(site, []).append(row)
            emp[rid] = kept

    for site in index:
        index[site].sort(key=lambda x: -x["직원수"])

    payload = {
        "index": index,
        "emp": emp,
        "생성": "전체 사업장 · 목록과 직원 표를 나눔 · 주민번호 미포함",
    }
    path = os.path.join(OUT_DIR, "payroll_all.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False)

    # 목록만 따로도 재 본다 — 앱이 열 때 받는 것이 이만큼이다.
    idx_mb = len(json.dumps(index, ensure_ascii=False).encode("utf-8")) / 1048576.0
    tot = sum(sum(x["직원수"] for x in v) for v in index.values())
    sheets = sum(len(v) for v in index.values())
    mb = os.path.getsize(path) / 1048576.0
    print("사업장 %d곳 · 시트 %d개 · 직원 연 %d건 · 전체 %.1fMB (앱이 열 때 받는 목록 %.2fMB)"
          % (len(index), sheets, tot, mb, idx_mb))

    bad = [k for k in index if re.search(r"\.(xlsx|xls|xlsm)$", k, re.I)]
    if bad:
        n = sum(sum(x["직원수"] for x in index[k]) for k in bad)
        print("[주의] 사업장 이름 자리에 **파일 이름**이 올라온 곳 %d곳 (직원 %d건) - "
              "담당자 폴더 밑에 사업장 폴더 없이 파일이 바로 놓인 경우다. "
              "설정카드도 같은 규칙이라 같은 이름이 들어 있다." % (len(bad), n))
    if dropped:
        print("[주의] 상한(%d명)에 걸려 안 담긴 직원 줄 %d건 - PAYROLL_EMP_CAP 로 늘릴 수 있다"
              % (CAP, dropped))
    if nosite:
        print("[주의] 경로에서 사업장을 못 뽑은 파일 %d건" % nosite)


if __name__ == "__main__":
    main()
