# -*- coding: utf-8 -*-
"""설립서류 생성 (M6) — 기금 마스터 + 일괄수정(profile) 값 자동 대입 → 인쇄용 HTML
초안 수준(기금설립자동화 doc_templates 계승). 실서식 재현은 서식 트랙(계획서 §18).
빈 값은 밑줄 공란으로 표시되어 인쇄 후 수기 기입 가능.
"""
import json
import re
from datetime import date

KINDS = {
    "inka":      "설립인가신청서",
    "agreement": "설립합의서",
    "charter":   "정관",
    "minutes":   "설립준비위원회 회의록",
    "contrib":   "기금출연확인서",
    "bizplan":   "사업계획서",
    # ── 등기 서류 8종 (M7) ──
    "reg_apply": "특수법인 설립등기신청서",
    "reg_accept": "취임승낙서",
    "reg_roster": "협의회 명부",
    "reg_seal": "법인인감·개인(인감) 신고서",
    "reg_sealpaper": "인감대지",
    "reg_sealcard": "인감카드 (재)발급신청서",
    "reg_license": "등록면허세 신고서",
    "reg_proxy": "위임장(등기)",
    # ── 지원금 (M14, 공동기금 전용) ──
    "subsidy": "공동근로복지기금 지원신청서",
    # ── 운영상황보고서 (M13, 별지 제15호 4쪽) ──
    "form15": "운영상황보고서(별지 제15호)",
    # ── 결산서 (별지15호 첨부: 재무상태표·운영성과표·시산표) ──
    "settlement": "결산서(재무제표)",
}
# 설립 서류 세트 (사내기금은 설립합의서·사업장별 출연확인서 다수 제외)
SET_GONGDONG = ["inka", "charter", "contrib", "bizplan", "minutes", "agreement"]
SET_SANE = ["inka", "charter", "contrib", "bizplan", "minutes"]
# 등기 서류 세트 (사내·공동 공통, 2026 충남11호 실사례 순서)
SET_REG = ["reg_apply", "reg_accept", "reg_roster", "reg_seal",
           "reg_sealpaper", "reg_sealcard", "reg_license", "reg_proxy"]


def _v(x, width=8):
    """값 또는 밑줄 공란"""
    s = str(x or "").strip()
    return s if s else "＿" * width


def _won(x):
    try:
        return f"{int(x):,}"
    except (TypeError, ValueError):
        return "＿" * 10


def _css():
    return """<style>
    body{font-family:'Batang','바탕',serif;max-width:760px;margin:24px auto;line-height:1.9;
         font-size:13.5px;color:#111;padding:0 20px}
    h1{text-align:center;font-size:22px;letter-spacing:8px;margin:30px 0}
    h2{font-size:15px;margin:22px 0 6px;text-align:center;letter-spacing:4px}
    .right{text-align:right}.center{text-align:center}
    table{border-collapse:collapse;width:100%;margin:10px 0}
    td,th{border:1px solid #333;padding:6px 10px;font-size:13px}
    th{background:#f3f3f3;font-weight:700;width:150px}
    .toolbar{position:fixed;top:10px;right:10px;font-family:sans-serif}
    .toolbar button{padding:8px 16px;font-size:13px;cursor:pointer}
    .page{page-break-after:always}
    .sign{margin-top:34px;text-align:right;line-height:2.4}
    .note{color:#888;font-size:11px;font-family:sans-serif}
    @media print{.toolbar,.note{display:none}body{margin:0}}
    </style>"""


def _head(title, fund_name):
    return (f"<!DOCTYPE html><html lang='ko'><head><meta charset='utf-8'>"
            f"<title>{title} - {fund_name}</title>{_css()}</head><body>"
            f"<div class='toolbar'><button onclick='window.print()'>🖨 인쇄 / PDF 저장</button></div>"
            f"<p class='note'>※ 초안 자동생성본 — 제출 전 담당자 검토 필수 (밑줄 공란은 수기 기입)</p>")


def _foot():
    return "</body></html>"


def _today():
    t = date.today()
    return f"{t.year}년    {t.month}월    {t.day}일"


def _form15_biz(welfare, purpose_from_journal, admin, loan, thou):
    """별지15호 사업실적 표 — 목적사업(M10) 실적 우선, 없으면 분개 복지비 합계 fallback"""
    rows = [
        ("주택구입·임차자금", "주택자금"), ("생활안정자금", "생활안정자금"),
        ("장학금", "장학금"), ("재난구호금", "재난구호금"),
        ("체육·문화활동 지원", "체육문화활동"), ("모성보호·일가정양립", "모성보호"),
        ("근로자의 날 행사", "근로자의날"), ("근로복지시설", "근로복지시설"),
        ("그 밖의 복지비", "그밖의복지비"),
    ]
    has_welfare = any(welfare.get(k, {}).get("amt") for _, k in rows)
    body, subtotal, ben_total = "", 0, 0
    for label, key in rows:
        e = welfare.get(key, {})
        amt = e.get("amt", 0)
        ben = e.get("ben", 0)
        # 목적사업 실적이 전혀 없으면 그밖의복지비에 분개 복지비 합계 표시
        if not has_welfare and key == "그밖의복지비":
            amt = purpose_from_journal
        subtotal += amt
        ben_total += ben
        body += (f"<tr><td>{label}</td><td class='right'>{thou(amt) if amt else '-'}</td>"
                 f"<td class='center'>{ben if ben else '-'}</td></tr>")
    loan_row = welfare.get("대부사업", {})
    loan_amt = loan_row.get("amt") or loan
    note = ("" if has_welfare else
            "<p class='note'>※ 목적사업(M10) 실적 미입력 — 승인 분개의 복지비 합계를 '그 밖의 복지비'에 임시 집계. "
            "목적사업 탭에서 항목별 지급·수혜자를 입력하면 자동 세분됩니다.</p>")
    return (f"<table><tr><th>구분</th><th>금액(천원)</th><th>수혜자 수</th></tr>{body}"
            f"<tr><th>소계(목적사업비)</th><td class='right'><b>{thou(subtotal)}</b></td>"
            f"<td class='center'>{ben_total if ben_total else '-'}</td></tr>"
            f"<tr><th>기금 운영비</th><td class='right'>{thou(admin)}</td><td></td></tr>"
            f"<tr><th>근로자 대부(대부사업)</th><td class='right'>{thou(loan_amt)}</td>"
            f"<td class='center'>{loan_row.get('ben') or '-'}</td></tr></table>{note}")


def render(kind, fund, sites, fs=None, year=None):
    p = json.loads(fund.get("profile") or "{}")
    # 연도별 데이터(예산·지원금)를 p에 병합해 서류에서 그대로 참조
    if year is not None:
        yd = (p.get("years") or {}).get(str(year)) or {}
        for k, v in yd.items():
            if k != "subsidy" and v not in (None, ""):
                p[k] = v
        if yd.get("subsidy"):
            p["subsidy"] = yd["subsidy"]
    ftype = fund.get("fund_type") or "공동"
    fname = fund.get("name") or ""
    officers = p.get("officers") or []
    chairman = fund.get("chairman") or next(
        (o.get("name") for o in officers if "이사장" in (o.get("role") or "")), "")

    if kind == "inka":
        chk_s = "[V]" if ftype == "사내" else "[ ]"
        chk_g = "[V]" if ftype == "공동" else "[ ]"
        # 설립준비위원회 위원 (근로자측/사용자측) — 각 성명·생년월일·직책
        wk = [x.strip() for x in re.split(r"[,/·]", p.get("worker_committee") or "") if x.strip()]
        er = [x.strip() for x in re.split(r"[,/·]", p.get("emp_committee") or "") if x.strip()]
        def _wrows(side, names):
            if not names:
                names = [""]
            return "".join(
                f"<tr><td class='center'>{side if i == 0 else ''}</td>"
                f"<td>{_v(nm, 6)}</td><td>＿＿＿＿＿＿</td><td>＿＿＿＿</td></tr>"
                for i, nm in enumerate(names))
        return _head("설립인가신청서", fname) + f"""
<p class='right'>■ 근로복지기본법 시행규칙 [별지 제7호서식] &lt;개정 2025. 4. 14.&gt;</p>
<h1>{chk_s} 사내근로복지기금법인 &nbsp; {chk_g} 공동근로복지기금법인<br>설립인가신청서</h1>
<p class='note'>※ 아래의 작성방법을 읽고 작성하시기 바랍니다. · 처리기간 20일</p>
<table>
<tr><th colspan='4' style='background:#e8e8e8'>기금법인</th></tr>
<tr><th>명칭</th><td>{_v(fname, 16)}</td><th>전화번호</th><td>{_v(fund.get('phone'), 8)}</td></tr>
<tr><th>주사무소 소재지</th><td colspan='3'>{_v(fund.get('address'), 24)}</td></tr>
<tr><th colspan='4' style='background:#e8e8e8'>대표자</th></tr>
<tr><th>성명(한글)</th><td>{_v(chairman)}</td><th>성명(한자)</th><td>＿＿＿＿</td></tr>
<tr><th>생년월일</th><td>＿＿＿＿＿＿</td><th>직책</th><td>{_v(p.get('rep_position') or '이사장', 4)}</td></tr>
<tr><th>주소</th><td colspan='3'>＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿</td></tr>
</table>
<h2>기금법인 설립준비위원회 위원</h2>
<table>
<tr><th style='width:70px'>구분</th><th>성명</th><th>생년월일</th><th>직책</th></tr>
{_wrows('근로자측', wk)}{_wrows('사용자측', er)}
</table>
<p class='note'>※ 근로자·사용자 대표 위원이 각 4명 이상이면 별지에 작성하여 첨부합니다.</p>
<p>「근로복지기본법」 제52조제5항ㆍ제86조의15 및 같은 법 시행규칙 제20조에 따라 위와 같이
{chk_s} 사내근로복지기금법인 {chk_g} 공동근로복지기금법인의 설립인가를 신청합니다.</p>
<p class='center'>{_today()}</p>
<div class='sign'>신청인 대표:  {_v(chairman)}  (서명 또는 인)</div>
<p>{_v(fund.get('labor_office') or '○○지방고용노동청(○○○○지청)', 10)}장 귀하</p>
<h2>첨부서류</h2>
<p>1. 정관 1부<br>
2. 기금법인 설립준비위원회 위원의 재직증명서나 그 밖에 신분을 증명하는 서류(근로계약서 등) 1부<br>
3. 사내(공동)근로복지기금 출연확인서 또는 재산목록 1부<br>
4. 사업계획서 및 예산서 1부&nbsp;&nbsp;<span class='note'>(수수료 없음)</span></p>""" + _foot()

    if kind == "agreement":
        return _head("설립합의서", fname) + f"""
<h1>설 립 합 의 서</h1>
<p>아래 당사자들은 「근로복지기본법」 제62조의2에 따라 <b>{_v(fname, 14)}</b>을(를) 설립하기로 합의한다.</p>
<h2>제1조 (명칭)</h2><p>이 기금법인의 명칭은 "{_v(fname, 14)}"이라 한다.</p>
<h2>제2조 (목적사업)</h2><p>{_v(p.get('purpose') or '근로자의 생활안정 및 복지증진을 위한 사업', 24)}</p>
<h2>제3조 (출연금)</h2><p>참여사업장은 기금법인 설립 시 합계 {_won(p.get('contribution_total'))}원을 출연한다.</p>
<h2>제4조 (기금협의회)</h2><p>기금협의회는 노사 동수로 구성하며, 이사장은 {_v(chairman)}(으)로 한다.</p>
<p class='center'>{_today()}</p>
<div class='sign'>참여사업장 대표 (별첨 명부와 같음) 각 (인)<br>근로자대표:  ＿＿＿＿＿＿  (인)</div>
<h2>별첨: 참여사업장 명부 ({len(sites)}개소)</h2>
<table><tr><th style='width:40px'>번호</th><th>상호</th><th>대표자</th><th>사업자등록번호</th></tr>
{''.join(f"<tr><td class='center'>{i+1}</td><td>{s['name']}</td><td>{_v(s.get('ceo'),4)}</td><td>{_v(s.get('biz_no'),12)}</td></tr>" for i, s in enumerate(sites))}
</table>""" + _foot()

    if kind == "charter":
        arts = p.get("welfare_items") or ["근로자의 생활안정자금 및 주택자금 등의 대부",
                                          "장학금·재난구호금의 지급", "경조사비 및 의료비 지원",
                                          "체육·문화활동 및 근로자의 날 행사 지원",
                                          "그 밖에 근로자의 생활안정과 복지증진에 필요한 사업"]
        return _head("정관", fname) + f"""
<h1>{fname} 정관</h1>
<h2>제1장 총칙</h2>
<p><b>제1조(명칭)</b> 이 기금법인의 명칭은 "{_v(fname, 14)}"이라 한다.</p>
<p><b>제2조(목적)</b> 이 기금법인은 「근로복지기본법」에 따라 참여사업장 근로자의 생활안정과 복지증진에 기여함을 목적으로 한다.</p>
<p><b>제3조(사무소)</b> 이 기금법인의 주된 사무소는 {_v(fund.get('address'), 20)}에 둔다.</p>
<p><b>제4조(사업)</b> 이 기금법인은 다음 각 호의 사업을 행한다.</p>
<p>{'<br>'.join(f'&nbsp;&nbsp;{i+1}. {a}' for i, a in enumerate(arts))}</p>
<h2>제2장 기금 및 회계</h2>
<p><b>제5조(기본재산)</b> 이 기금법인의 기본재산은 참여사업장 출연금으로 하며, 설립 시 출연금은 {_won(p.get('contribution_total'))}원으로 한다.</p>
<p><b>제6조(회계연도)</b> 이 기금법인의 회계연도는 매년 1월 1일부터 12월 31일까지로 한다.</p>
<h2>제3장 임원 및 협의회</h2>
<p><b>제7조(임원)</b> 이 기금법인에 이사장 1명을 포함한 이사와 감사를 둔다.</p>
<table><tr><th style='width:110px'>직위</th><th>성명</th></tr>
{''.join(f"<tr><td class='center'>{_v(o.get('role'),4)}</td><td>{_v(o.get('name'),4)}</td></tr>" for o in (officers or [{'role': '이사장', 'name': chairman}]))}
</table>
<p><b>제8조(협의회)</b> 기금협의회는 노사 각 동수로 구성하며, 예산·결산·사업계획 등 주요 사항을 심의·의결한다.</p>
<h2>부칙</h2>
<p>이 정관은 고용노동부장관의 설립인가를 받은 날부터 시행한다.</p>
<p class='center'>{_today()}</p>""" + _foot()

    if kind == "minutes":
        return _head("설립준비위원회 회의록", fname) + f"""
<h1>설립준비위원회 회의록</h1>
<table>
<tr><th>일시</th><td>{_v(p.get('meeting_date'), 12)}</td></tr>
<tr><th>장소</th><td>{_v(p.get('meeting_place') or fund.get('address'), 18)}</td></tr>
<tr><th>참석</th><td>사용자측 위원 {_v(p.get('emp_committee'), 10)} / 근로자측 위원 {_v(p.get('worker_committee'), 10)}</td></tr>
</table>
<h2>안건</h2>
<p>1. {fname} 설립에 관한 사항<br>2. 정관 제정에 관한 사항<br>3. 임원 선출에 관한 사항<br>
4. 기금출연 확정에 관한 사항<br>5. 기타 설립 관련 사항</p>
<h2>심의 결과</h2>
<p>제1호: 위원 전원 찬성으로 "{fname}" 설립을 의결하였다.<br>
제2호: 정관(안)을 원안대로 의결하였다.<br>
제3호: 이사장에 {_v(chairman)}을(를) 선출하였다{('· 임원 ' + ', '.join(f"{o.get('role')} {o.get('name')}" for o in officers if o.get('name'))) if officers else ''}.<br>
제4호: 설립 출연금을 {_won(p.get('contribution_total'))}원으로 확정하였다.<br>
제5호: 기타 설립 관련 제반 사항은 이사장에게 위임하기로 의결하였다.</p>
<p class='center'>{_today()}</p>
<div class='sign'>위원장(이사장):  {_v(chairman)}  (인)<br>근로자대표:  ＿＿＿＿＿＿  (인)<br>사용자대표:  ＿＿＿＿＿＿  (인)</div>""" + _foot()

    if kind == "contrib":
        pages = []
        target = sites if (ftype == "공동" and sites) else [{"name": fund.get("rep_org") or "", "ceo": "", "biz_no": "", "address": ""}]
        for i, s in enumerate(target):
            amt = s.get("contribution")
            pages.append(f"""
<div class="{'page' if i < len(target) - 1 else ''}">
<h1>기금출연확인서</h1>
<table>
<tr><th>출연 사업장</th><td>{_v(s.get('name'), 14)}</td></tr>
<tr><th>대표자</th><td>{_v(s.get('ceo'))} (인)</td></tr>
<tr><th>사업자등록번호</th><td>{_v(s.get('biz_no'), 13)}</td></tr>
<tr><th>소재지</th><td>{_v(s.get('address'), 20)}</td></tr>
<tr><th>기금법인명</th><td>{fname}</td></tr>
<tr><th>출연금액</th><td>{_won(amt)} 원</td></tr>
<tr><th>출연 예정일</th><td>{_v(p.get('estab_date'), 12)}</td></tr>
<tr><th>출연 방법</th><td>금전 출연 (기금법인 계좌 입금)</td></tr>
</table>
<p>위와 같이 기금출연을 확약·확인합니다.</p>
<p class='center'>{_today()}</p>
<div class='sign'>출연자:  {_v(s.get('name'), 10)}  대표  {_v(s.get('ceo'))}  (인)</div>
</div>""")
        return _head("기금출연확인서", fname) + "".join(pages) + _foot()

    if kind == "bizplan":
        yr = year or date.today().year
        return _head("사업계획서", fname) + f"""
<h1>{fname}<br>사 업 계 획 서 ({yr}년도)</h1>
<h2>Ⅰ. 기금법인 개요</h2>
<table>
<tr><th>기금법인명</th><td>{fname}</td></tr>
<tr><th>소재지</th><td>{_v(fund.get('address'), 20)}</td></tr>
<tr><th>대표자(이사장)</th><td>{_v(chairman)}</td></tr>
<tr><th>참여사업장</th><td>{len(sites)}개소</td></tr>
<tr><th>수혜 근로자 수</th><td>{sum(s.get('employees') or 0 for s in sites):,}명</td></tr>
<tr><th>기본재산(출연금)</th><td>{_won(p.get('contribution_total'))} 원</td></tr>
</table>
<h2>Ⅱ. 목적사업 계획</h2>
<p>{_v(p.get('biz_plan') or '1. 명절 선물비 등 복리후생비 지급<br>2. 경조사비 지원<br>3. 체육·문화활동비 지원', 30)}</p>
<h2>Ⅲ. 수지예산 (단위: 원)</h2>
<table>
<tr><th>수입 — 출연금</th><td class='right'>{_won(p.get('contribution_total'))}</td></tr>
<tr><th>수입 — 이자수익(예상)</th><td class='right'>{_won(p.get('interest_est'))}</td></tr>
<tr><th>지출 — 목적사업비</th><td class='right'>{_won(p.get('purpose_budget'))}</td></tr>
<tr><th>지출 — 일반관리비</th><td class='right'>{_won(p.get('admin_budget'))}</td></tr>
</table>
<p class='center'>{_today()}</p>
<div class='sign'>{fname}<br>이사장  {_v(chairman)}  (인)</div>""" + _foot()

    # ═══════════ 등기 서류 8종 (M7) ═══════════
    reg = p.get("reg") or {}          # 등기 전용정보 (일괄수정 ②-등기)
    directors = [o for o in officers if "이사" in (o.get("role") or "") or "감사" in (o.get("role") or "")]
    if not directors:
        directors = [{"role": "이사장", "name": chairman}]

    if kind == "reg_apply":
        return _head("특수법인 설립등기신청서", fname) + f"""
<h1>특수법인 설립등기신청서</h1>
<table>
<tr><th>등기의 목적</th><td>{_v(reg.get('purpose') or (('사내' if ftype=='사내' else '공동') + '근로복지기금법인 설립'), 16)}</td></tr>
<tr><th>등기의 사유</th><td>{_v(reg.get('reason') or '설립인가를 받았으므로 아래 사항의 등기를 신청함', 20)}</td></tr>
<tr><th>법인의 명칭</th><td>{_v(fname, 14)}</td></tr>
<tr><th>주사무소</th><td>{_v(fund.get('address'), 20)}</td></tr>
<tr><th>설립인가 연월일</th><td>{_v(fund.get('inka_date') or p.get('estab_date'), 12)}</td></tr>
<tr><th>인가번호</th><td>{_v(fund.get('inka_no'), 12)}</td></tr>
<tr><th>목적</th><td>근로자의 생활안정과 복지증진에 관한 사업</td></tr>
<tr><th>이사장(대표권자)</th><td>{_v(chairman)}</td></tr>
<tr><th>등록면허세</th><td>{_won(reg.get('license_tax'))} 원 · 지방교육세 {_won(reg.get('edu_tax'))} 원</td></tr>
<tr><th>관할 등기소</th><td>{_v(fund.get('registry_office'), 14)}</td></tr>
</table>
<h2>임원(등기사항)</h2>
<table><tr><th style='width:110px'>직위</th><th>성명</th><th>비고</th></tr>
{''.join(f"<tr><td class='center'>{_v(o.get('role'),4)}</td><td>{_v(o.get('name'),4)}</td><td>{'대표권 있음' if '이사장' in (o.get('role') or '') else ''}</td></tr>" for o in directors)}
</table>
<p>「근로복지기본법」 및 「비송사건절차법」에 따라 위와 같이 설립등기를 신청합니다.</p>
<p class='center'>{_today()}</p>
<div class='sign'>신청인(대표자):  {_v(chairman)}  (인)<br>{_v(fund.get('registry_office'), 10)} 귀중</div>
<h2 class='note'>첨부: 설립인가서·정관·창립총회(준비위)의사록·재산목록·취임승낙서·인감신고서 등</h2>""" + _foot()

    if kind == "reg_accept":
        pages = []
        for i, o in enumerate(directors):
            pages.append(f"""
<div class="{'page' if i < len(directors) - 1 else ''}">
<h1>취 임 승 낙 서</h1>
<table>
<tr><th>법인명</th><td>{_v(fname, 14)}</td></tr>
<tr><th>직위</th><td>{_v(o.get('role'), 6)}</td></tr>
<tr><th>성명</th><td>{_v(o.get('name'))} (인)</td></tr>
<tr><th>주소</th><td>＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿</td></tr>
<tr><th>주민등록번호</th><td>＿＿＿＿＿＿ - ＿＿＿＿＿＿＿</td></tr>
</table>
<p>본인은 {fname}의 {_v(o.get('role'), 6)}(으)로 취임할 것을 승낙합니다.</p>
<p class='center'>{_today()}</p>
<div class='sign'>승낙인:  {_v(o.get('name'))}  (인)</div>
<p class='note'>※ 주소·주민등록번호는 인감증명서와 일치하도록 수기 기입</p>
</div>""")
        return _head("취임승낙서", fname) + "".join(pages) + _foot()

    if kind == "reg_roster":
        return _head("협의회 명부", fname) + f"""
<h1>{'기금협의회' if ftype=='공동' else '복지기금협의회'} 명부</h1>
<table><tr><th style='width:40px'>번호</th><th>구분</th><th>직위</th><th>성명</th><th>비고</th></tr>
{''.join(f"<tr><td class='center'>{i+1}</td><td class='center'>{('사용자' if '사용자' in (o.get('role') or '') else '근로자' if '근로자' in (o.get('role') or '') else '임원')}</td><td class='center'>{_v(o.get('role'),4)}</td><td>{_v(o.get('name'),4)}</td><td></td></tr>" for i, o in enumerate(officers or directors))}
</table>
<p class='center'>{_today()}</p>
<div class='sign'>{fname}<br>이사장  {_v(chairman)}  (인)</div>""" + _foot()

    if kind == "reg_seal":
        return _head("법인인감·개인(인감) 신고서", fname) + f"""
<h1>인감 신고서</h1>
<table>
<tr><th>법인명</th><td>{_v(fname, 14)}</td></tr>
<tr><th>주사무소</th><td>{_v(fund.get('address'), 20)}</td></tr>
<tr><th>인감 제출인(대표자)</th><td>{_v(reg.get('seal_person') or chairman)}</td></tr>
<tr><th>자격</th><td>이사장</td></tr>
<tr><th>주민등록번호</th><td>＿＿＿＿＿＿ - ＿＿＿＿＿＿＿</td></tr>
</table>
<div style='display:flex;gap:20px;margin-top:20px'>
<div style='flex:1;border:1px solid #333;height:130px;text-align:center;padding-top:10px'>법인인감 날인란</div>
<div style='flex:1;border:1px solid #333;height:130px;text-align:center;padding-top:10px'>개인(제출인)인감 날인란</div>
</div>
<p class='center'>{_today()}</p>
<div class='sign'>신고인:  {_v(reg.get('seal_person') or chairman)}  (인)<br>{_v(fund.get('registry_office'), 10)} 귀중</div>""" + _foot()

    if kind == "reg_sealpaper":
        return _head("인감대지", fname) + f"""
<h1>인 감 대 지</h1>
<table><tr><th>법인명</th><td>{_v(fname, 14)}</td><th>대표자</th><td>{_v(chairman)}</td></tr></table>
<div style='display:flex;gap:16px;margin-top:24px'>
<div style='flex:1;border:1.5px solid #333;height:180px;text-align:center;padding-top:14px'>법인인감<br><span class='note'>(인영 부착)</span></div>
<div style='flex:1;border:1.5px solid #333;height:180px;text-align:center;padding-top:14px'>사용인감<br><span class='note'>(해당 시)</span></div>
</div>
<p class='center' style='margin-top:24px'>{_today()}</p>""" + _foot()

    if kind == "reg_sealcard":
        return _head("인감카드 (재)발급신청서", fname) + f"""
<h1>인감카드 (재)발급신청서</h1>
<table>
<tr><th>법인명</th><td>{_v(fname, 14)}</td></tr>
<tr><th>등기번호/등록번호</th><td>{_v(fund.get('corp_reg_no'), 14)}</td></tr>
<tr><th>대표자</th><td>{_v(chairman)}</td></tr>
<tr><th>신청 구분</th><td>[ V ] 신규발급  [   ] 재발급</td></tr>
<tr><th>발급 매수</th><td>{_v(reg.get('card_count') or '1', 3)} 매</td></tr>
</table>
<p class='center'>{_today()}</p>
<div class='sign'>신청인:  {_v(chairman)}  (인)<br>{_v(fund.get('registry_office'), 10)} 귀중</div>""" + _foot()

    if kind == "reg_license":
        lt = reg.get("license_tax")
        edu = reg.get("edu_tax")
        try:
            total = int(lt or 0) + int(edu or 0)
        except (TypeError, ValueError):
            total = None
        return _head("등록면허세 신고서", fname) + f"""
<h1>등록면허세 신고서</h1>
<table>
<tr><th>납세의무자(법인)</th><td>{_v(fname, 14)}</td></tr>
<tr><th>주사무소</th><td>{_v(fund.get('address'), 20)}</td></tr>
<tr><th>등록원인</th><td>법인 설립등기</td></tr>
<tr><th>과세표준</th><td>{_won(reg.get('tax_base'))} 원</td></tr>
<tr><th>등록면허세</th><td class='right'>{_won(lt)} 원</td></tr>
<tr><th>지방교육세</th><td class='right'>{_won(edu)} 원</td></tr>
<tr><th>합계</th><td class='right'>{_won(total)} 원</td></tr>
<tr><th>관할 지자체</th><td>{_v(reg.get('tax_office') or '', 14)}</td></tr>
</table>
<p class='center'>{_today()}</p>
<div class='sign'>신고인:  {_v(chairman)}  (인)</div>""" + _foot()

    if kind == "reg_proxy":
        agent = reg.get("agent") or {}
        return _head("위임장(등기)", fname) + f"""
<h1>위 임 장</h1>
<h2>수임인</h2>
<table>
<tr><th>성명</th><td>{_v(agent.get('name') if isinstance(agent, dict) else reg.get('agent_name'), 8)}</td></tr>
<tr><th>주소/사무소</th><td>{_v(reg.get('agent_addr'), 18)}</td></tr>
</table>
<h2>위임 사항</h2>
<p>위 사람에게 <b>{fname}</b>의 설립등기 신청 및 이에 부수하는 일체의 행위(인감카드 발급, 등기부등본 발급 등)를 위임합니다.</p>
<p class='center'>{_today()}</p>
<div class='sign'>위임인:  {fname}<br>이사장  {_v(chairman)}  (인)</div>""" + _foot()

    # ═══════════ 공단 지원신청서 (M14, 공동기금 전용) ═══════════
    if kind == "subsidy":
        sup = p.get("subsidy") or {}
        emp_total = sum(s.get("employees") or 0 for s in sites)
        contrib_total = sum(s.get("contribution") or 0 for s in sites) or p.get("contribution_total")
        rows_html = "".join(
            f"<tr><td class='center'>{i+1}</td><td>{s['name']}</td><td>{_v(s.get('biz_no'),12)}</td>"
            f"<td class='right'>{s.get('employees') or ''}</td>"
            f"<td class='right'>{_won(s.get('contribution')) if s.get('contribution') else ''}</td></tr>"
            for i, s in enumerate(sites))
        return _head("공동근로복지기금 지원신청서", fname) + f"""
<p class='right'>■ 근로복지기본법 시행규칙 [별지 제1호의2서식] (초안)</p>
<h1>공동근로복지기금 지원신청서</h1>
<table>
<tr><th>기금법인명</th><td>{_v(fname, 14)}</td></tr>
<tr><th>대표자(이사장)</th><td>{_v(chairman)}</td></tr>
<tr><th>인가번호</th><td>{_v(fund.get('inka_no'), 12)}</td></tr>
<tr><th>법인등록번호</th><td>{_v(fund.get('corp_reg_no'), 14)}</td></tr>
<tr><th>고유번호</th><td>{_v(fund.get('tax_id_no'), 12)}</td></tr>
<tr><th>소재지</th><td>{_v(fund.get('address'), 20)}</td></tr>
<tr><th>사무국</th><td>{_v(fund.get('rep_org'), 12)}</td></tr>
<tr><th>지원 사업연도</th><td>{sup.get('year') or date.today().year}년</td></tr>
</table>
<h2>신청 규모 (자동 집계)</h2>
<table>
<tr><th>참여사업장 수</th><td>{len(sites)}개소</td></tr>
<tr><th>수혜 근로자 수</th><td>{emp_total:,}명</td></tr>
<tr><th>기금 출연 규모</th><td>{_won(contrib_total)} 원</td></tr>
<tr><th>신청 지원금액</th><td>{_won(sup.get('request_amount'))} 원</td></tr>
</table>
<h2>참여사업장 명세 ({len(sites)}개소)</h2>
<table><tr><th style='width:36px'>번호</th><th>사업장명</th><th>사업자등록번호</th><th>근로자수</th><th>출연액(원)</th></tr>
{rows_html}
<tr><th colspan='3' class='center'>합계</th><td class='right'>{emp_total:,}</td><td class='right'>{_won(contrib_total)}</td></tr>
</table>
<p>「근로복지기본법」 제62조의2 및 관련 지원사업 공고에 따라 위와 같이 지원을 신청합니다.</p>
<p class='center'>{_today()}</p>
<div class='sign'>신청인:  {fname}<br>이사장  {_v(chairman)}  (인)</div>
<p class='note'>※ subsidy_autofill(별지 제1호의2, 충남 1~7호 실데이터)와 항목 정합 — 공고별 요건은 지원금 탭 공고 버전으로 관리</p>""" + _foot()

    # ═══════════ 운영상황보고서 (별지 제15호, 2025.10.1 개정 4쪽) — M13 ═══════════
    if kind == "form15":
        fs = fs or {}
        yr = year or (date.today().year - 1)
        emp = sum(s.get("employees") or 0 for s in sites)

        def thou(x):  # 천원 단위 표기
            try:
                return f"{int(round(int(x) / 1000)):,}"
            except (TypeError, ValueError):
                return "＿＿"
        basic = fs.get("basic", 0)
        interest = fs.get("interest", 0)
        loan = fs.get("loan", 0)
        purpose = fs.get("purpose_exp", 0)
        admin = fs.get("admin_exp", 0)
        chk_sane = "[V]" if ftype == "사내" else "[ ]"
        chk_gong = "[V]" if ftype == "공동" else "[ ]"
        return _head("운영상황보고서", fname) + f"""
<p class='right'>■ 근로복지기본법 시행규칙 [별지 제15호서식] &lt;개정 2025. 10. 1.&gt;</p>
<h1>{chk_sane} 사내 · {chk_gong} 공동 근로복지기금법인<br>운영상황 보고서 ({yr}년도분)</h1>
<p class='note'>※ 통장거래 → 승인 분개 → 재무제표에서 자동 매핑된 값(단위: 천원). 제출 전 담당자 확인 필수.</p>
<h2 class='center'>(4쪽 중 1쪽)</h2>
<table>
<tr><th>① 기금법인명</th><td>{_v(fname, 14)}</td><th>② 인가번호</th><td>{_v(fund.get('inka_no'), 8)}</td></tr>
<tr><th>③ 설립등기일</th><td>{_v(fund.get('reg_date'), 8)}</td><th>④ 전화번호</th><td>{_v(fund.get('phone'), 8)}</td></tr>
<tr><th>⑤ 소재지</th><td colspan='3'>{_v(fund.get('address'), 20)}</td></tr>
<tr><th>⑥ 회계연도</th><td colspan='3'>{yr}. 1. 1. ~ {yr}. 12. 31.</td></tr>
</table>
<h2>사업체</h2>
<table>
<tr><th>⑦ 대표자</th><td>{_v(fund.get('chairman'), 6)}</td><th>⑧ 업종</th><td>{_v(p.get('industry'), 8)}</td></tr>
<tr><th>⑨ 소속근로자 수</th><td>{emp:,} 명</td><th>⑩ 협력업체근로자 수</th><td>{_v(p.get('subcon_emp'), 4)} 명</td></tr>
<tr><th>⑪ 납입자본금(천원)</th><td colspan='3'>{_v(p.get('paid_capital'), 8)}</td></tr>
</table>
<h2>기본재산 현황 (천원)</h2>
<table>
<tr><th>⑫ 직전 회계연도말 기본재산 총액</th><td class='right'>{thou(p.get('prev_basic') or 0)}</td></tr>
<tr><th>당기변동 — 증가(⑬사업주출연·⑭수익금전입·⑮사업주외출연·⑯합병)</th><td class='right'>{thou((basic or 0) - (p.get('prev_basic') or 0) if basic else 0)}</td></tr>
<tr><th>당기변동 — 감소</th><td class='right'>0</td></tr>
<tr><th>⑳ 당기말 기본재산 총액</th><td class='right'><b>{thou(basic)}</b></td></tr>
</table>
<h2>기금 운용 및 관리 (천원)</h2>
<table>
<tr><th>㉗ 근로자 대부</th><td class='right'>{thou(loan)}</td></tr>
<tr><th>㉘ 합계</th><td class='right'>{thou(loan)}</td></tr>
</table>
<h2>기금 사업 재원 (천원)</h2>
<table>
<tr><th>㉙ 당기 기금운용 수익금(이자 등)</th><td class='right'>{thou(interest)}</td></tr>
<tr><th>㉞ 합계</th><td class='right'><b>{thou(interest)}</b></td></tr>
</table>
<div class='page'></div>
<h2 class='center'>(4쪽 중 2쪽)</h2>
<h2>사업 실적 (천원, 명)</h2>
{_form15_biz(fs.get('welfare') or {}, purpose, admin, loan, thou)}
<p class='center' style='margin-top:30px'>{_today()}</p>
<div class='sign'>{_v(fund.get('labor_office') or '고용노동청', 8)}장 귀하</div>
<h2>첨부서류</h2>
<p>1. 해당 연도 결산서 1부<br>2. 다음 연도 사업계획서(추정재무제표 포함) 1부</p>""" + _foot()

    # ═══════════ 결산서 (재무상태표·운영성과표·합계잔액시산표) ═══════════
    if kind == "settlement":
        fs = fs or {}
        tb = fs.get("trial_balance") or {}
        yr = year or (date.today().year - 1)

        def w(x):
            try:
                return f"{int(x):,}"
            except (TypeError, ValueError):
                return "0"
        cash = fs.get("cash", 0)
        savings = fs.get("savings", 0)
        loan = fs.get("loan", 0)
        total_assets = fs.get("total_assets", 0)
        basic = fs.get("basic", 0)
        retained = fs.get("retained", 0)
        net_income = fs.get("net_income", 0)
        interest = fs.get("interest", 0)
        purpose = fs.get("purpose_exp", 0)
        admin = fs.get("admin_exp", 0)
        total_equity = fs.get("total_equity", 0)
        # 시산표 행
        tb_rows = ""
        td = tc = 0
        for name, v in tb.items():
            td += v.get("debit", 0)
            tc += v.get("credit", 0)
            tb_rows += (f"<tr><td class='right'>{w(v.get('debit'))}</td>"
                        f"<td class='right'>{w(v.get('bal_d'))}</td>"
                        f"<td>{name}</td>"
                        f"<td class='right'>{w(v.get('bal_c'))}</td>"
                        f"<td class='right'>{w(v.get('credit'))}</td></tr>")
        return _head("결산서", fname) + f"""
<h1>{fname}<br>{yr}년도 결산서</h1>
<p class='note'>※ 승인된 분개 기준 자동 산출 — 제출 전 담당자·감사 확인 필수</p>

<h2>1. 재무상태표 ({yr}. 12. 31. 현재 · 원)</h2>
<table>
<tr><th>자산</th><th class='right'>금액</th><th>부채·자본</th><th class='right'>금액</th></tr>
<tr><td>현금및현금성자산</td><td class='right'>{w(cash)}</td><td>고유목적사업준비금</td><td class='right'>{w(max(net_income,0))}</td></tr>
<tr><td>정기예금</td><td class='right'>{w(savings)}</td><td>부채 합계</td><td class='right'>{w(max(net_income,0))}</td></tr>
<tr><td>근로자대부금</td><td class='right'>{w(loan)}</td><td>기본재산</td><td class='right'>{w(basic)}</td></tr>
<tr><td></td><td></td><td>이월잉여금</td><td class='right'>{w(retained)}</td></tr>
<tr><th>자산 합계</th><td class='right'><b>{w(total_assets)}</b></td><th>부채·자본 합계</th><td class='right'><b>{w(total_equity + max(net_income,0))}</b></td></tr>
</table>

<h2>2. 운영성과표 ({yr}. 1. 1. ~ {yr}. 12. 31. · 원)</h2>
<table>
<tr><th>과목</th><th class='right'>금액</th></tr>
<tr><td>Ⅰ. 사업수익 — 이자수익</td><td class='right'>{w(interest)}</td></tr>
<tr><td>Ⅱ. 고유목적사업비용</td><td class='right'>{w(purpose)}</td></tr>
<tr><td>Ⅲ. 일반관리비</td><td class='right'>{w(admin)}</td></tr>
<tr><th>당기순이익</th><td class='right'><b>{w(net_income)}</b></td></tr>
</table>

<h2>3. 합계잔액시산표 ({yr}. 12. 31. · 원)</h2>
<table>
<tr><th class='right'>차변 합계</th><th class='right'>차변 잔액</th><th>계정과목</th><th class='right'>대변 잔액</th><th class='right'>대변 합계</th></tr>
{tb_rows or "<tr><td colspan='5' class='center'>승인된 분개가 없습니다</td></tr>"}
<tr><th class='right'>{w(td)}</th><th></th><th class='center'>합계</th><th></th><th class='right'>{w(tc)}</th></tr>
</table>
<p class='center' style='margin-top:26px'>{_today()}</p>
<div class='sign'>{fname}<br>이사장  {_v(fund.get('chairman'))}  (인)<br>감사  ＿＿＿＿＿  (인)</div>""" + _foot()

    raise KeyError(kind)
