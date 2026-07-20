# -*- coding: utf-8 -*-
"""
혼자 써보기용 앱 생성 — 앱 골격 + 대표님 실제 자료(설정카드·급여요약) 주입
- 출력은 자료폴더 _harness_out/ 에만(개인정보 포함 → git·외부 금지, 대표님 PC 전용).
- 앱의 샘플 데이터를 실제 사업장으로 교체해서, 열면 바로 내 사업장이 보임.
- 결과: _harness_out/급여앱_내자료.html  (크롬에서 더블클릭)
"""
import os, json, re
from collections import defaultdict

DATA_ROOT = os.environ.get(
    "PAYROLL_DATA_ROOT",
    r"C:\Users\fair0\OneDrive\바탕 화면\급여아웃소싱 서류들",
)
OUT_DIR = os.path.join(DATA_ROOT, "_harness_out")
SHELL = os.path.join(os.path.dirname(__file__), "..", "app", "payroll_app.html")
WRAP = {"급여", "1. 급여", "급여자료", "기타", "급여관리"}


def site_base(rel):
    parts = rel.replace("/", "\\").split("\\")
    rest = parts[1:]
    i = 0
    while i < len(rest) and rest[i] in WRAP:
        i += 1
    if i >= len(rest):
        return None
    s = re.sub(r'^\d+\s*[.\-]\s*', '', rest[i]).strip()
    return re.sub(r'\s*[\(\[].*?[\)\]]\s*$', '', s).strip() or s


def main():
    cards = json.load(open(os.path.join(OUT_DIR, "site_cards.json"), encoding="utf-8"))
    parsed = json.load(open(os.path.join(OUT_DIR, "parser_output.json"), encoding="utf-8"))

    # 카드 배열(앱이 읽는 형태) — site_cards 값 그대로(여분 필드는 앱이 무시)
    card_list = sorted(cards.values(), key=lambda c: -c["규모"]["직원레코드"])

    # 급여 처리 요약: 사업장별 직원수·신호(확인필요 있으면 주황, 없으면 초록)
    emp_by_site = defaultdict(int)
    for r in parsed:
        if not r.get("ok"):
            continue
        sb = site_base(r["path"])
        if sb:
            for s in r["sheets"]:
                emp_by_site[sb] += s["n_emp"]
    payroll = []
    for c in card_list:
        sb = c["사업장"]
        need = c.get("확인필요") or []
        payroll.append({
            "사업장": sb, "ym": "최근", "직원": emp_by_site.get(sb, c["규모"]["직원레코드"]),
            "신호": "orange" if need else "green",
            "이슈": (", ".join(need)[:40] if need else ""), "확정": False,
        })

    shell = open(os.path.abspath(SHELL), encoding="utf-8").read()

    # SAMPLE / PAYROLL_SAMPLE 배열을 실제 데이터로 교체
    def inject(src, varname, arr):
        pat = re.compile(r'var ' + varname + r' = \[.*?\];', re.S)
        return pat.sub('var ' + varname + ' = ' + json.dumps(arr, ensure_ascii=False) + ';', src, count=1)

    shell = inject(shell, "SAMPLE", card_list)
    shell = inject(shell, "PAYROLL_SAMPLE", payroll)
    # 별도 저장공간(샘플앱과 충돌 방지) — 실데이터 전용 네임스페이스
    shell = shell.replace(
        "var ENV = (location.search.indexOf('env=prod') >= 0) ? 'prod' : 'dev';",
        "var ENV = 'mydata';")
    # 로그인 스텁 담당자 기본값을 관리자로(혼자 다 보게)
    shell = shell.replace("role: 'staff',", "role: 'admin',")
    # 샘플 표시 문구 숨김(실제 데이터이므로)
    shell = shell.replace("isSample?' · <b style=\"color:#B26A00\">샘플 데이터</b>':''",
                          "false?'':''")
    shell = shell.replace("isSample?' · <b style=\"color:#B26A00\">샘플</b>':''",
                          "false?'':''")
    shell = shell.replace("<title>푸른노무법인 급여 — 앱 골격(3단계)</title>",
                          "<title>푸른노무법인 급여 — 내 자료(로컬)</title>")

    out = os.path.join(OUT_DIR, "급여앱_내자료.html")
    with open(out, "w", encoding="utf-8") as f:
        f.write(shell)
    print("생성:", out)
    print(f"  사업장 카드 {len(card_list)}개, 급여 요약 {len(payroll)}개 주입")


if __name__ == "__main__":
    main()
