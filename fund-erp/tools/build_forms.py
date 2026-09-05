# -*- coding: utf-8 -*-
"""원본 HWP → fund_forms.js 생성 + 실데이터(회사·기금명·주민번호) 혼입 검사
   실행: python fund-erp/tools/build_forms.py
   ※ 원본 .hwp는 로컬 전용(저장소에 없음). 생성물 fund_forms.js만 커밋한다."""
import io, sys, os, re, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from hwp2html import convert, to_html   # 이 모듈이 stdout을 utf-8로 이미 감쌈

# 원본 위치(로컬 전용)
B1 = r"C:\Users\fair0\OneDrive\바탕 화면\8. 공동기금\03_과거자료\설립관련과거자료\1. 노동부인가시필요서류"
B2 = r"C:\Users\fair0\Documents\공동기금_서식정리"

FORMS = [
    # ① 노동부 설립인가
    ('inka',      '설립인가신청서(별지 제7호)', os.path.join(B1, '1 .설립인가신청서.hwp')),
    ('agreement', '설립합의서',                 os.path.join(B1, '2. 설립합의서.hwp')),
    ('charter',   '정관(공동)',                 os.path.join(B1, '3. 공동기금 정관.hwp')),
    ('charter_sane','정관(사내)',               os.path.join(B1, '1. 노동부 인가시 필요서류', '2-1.정관(사내근복).hwp')),
    ('minutes',   '설립준비위원회 회의록',       os.path.join(B1, '4. 설립준비위원회 회의록.hwp')),
    ('contrib',   '기금출연확인서',             os.path.join(B1, '5. 기금출연확인서.hwp')),
    ('bizplan',   '사업계획서(연도)',           os.path.join(B1, '6. 사내근로복지기금 사업계획서.hwp')),
    # ② 법인 설립등기
    ('reg_apply',     '특수법인 설립등기신청서', os.path.join(B2, '2_법인설립등기', '1. 특수법인설립등기신청서.hwp')),
    ('reg_accept',    '취임승낙서',             os.path.join(B2, '2_법인설립등기', '2. 취임승낙서.hwp')),
    ('reg_roster',    '협의회 명부',            os.path.join(B2, '2_법인설립등기', '3. 협의회명부.hwp')),
    ('reg_seal',      '인감·개인 신고서',       os.path.join(B2, '2_법인설립등기', '4. 인감·개인신고서-양식.hwp')),
    ('reg_sealpaper', '인감대지',               os.path.join(B2, '2_법인설립등기', '5. 인감대지-양식.hwp')),
    ('reg_sealcard',  '인감카드 (재)발급신청서', os.path.join(B2, '2_법인설립등기', '6. 인감카드등(재)발급신청서-양식.hwp')),
    ('reg_proxy',     '위임장(등기)',           os.path.join(B2, '2_법인설립등기', '7. 위임장.hwp')),
    ('reg_license',   '등록면허세 신고서',      os.path.join(B2, '2_법인설립등기', '8. 등록면허세+신고서.hwp')),
    # ③ 고유번호증(세무서)
    ('tax_bizreg',   '법인설립신고 및 사업자등록신청서', os.path.join(B2, '3_고유번호증', '1. 법인설립신고서및사업자등록신청서.hwp')),
    ('tax_lease',    '임대차계약서(사무소)',    os.path.join(B2, '3_고유번호증', '2. 임대차계약서.hwp')),
    ('tax_sublease', '부동산 전대 사용동의서',  os.path.join(B2, '3_고유번호증', '2. 부동산 전대 사용동의서.hwp')),
    ('tax_hometax',  '홈택스 이용신청서',       os.path.join(B2, '3_고유번호증', '홈텍스이용신청서.hwp')),
    # ④ 운영
    ('ops_asset_change',    '재산변동상황보고서', os.path.join(B2, '6_운영', '1. 재산변동상황고서(설립이후-노동부제출).hwp')),
    ('ops_minutes_use',     '협의회 회의록(기금사용내용)', os.path.join(B2, '6_운영', '4. 근로복지기금협의회 회의록-기금사용내용.hwp')),
    ('ops_minutes_scope',   '협의회 회의록(사용범위 변경)', os.path.join(B2, '6_운영', '3. 근로복지기금협의회 회의록-기금사용범위변경 - 복사본.hwp')),
    # ※ 기부금영수증·발급명세서 제외(2026-07-26) — 원본이 타 법인(고려인삼연구) 서류였음
    # ⑤ 지원금 신청(공동 전용)
    ('sub_required',    '지원금 신청 시 필요서류', os.path.join(B2, '4_지원금신청', '00. 지원금 신청시 필요서류.hwp')),
    ('subsidy',         '공동근로복지기금 지원신청서', os.path.join(B2, '4_지원금신청', '1. 공동근로복지기금지원신청서.hwp')),
    ('sub_checklist',   '공동자율점검 체크리스트', os.path.join(B2, '4_지원금신청', '7. 공동자율체크리스트.hwp')),
    ('sub_contrib',     '기금출연확인서(지원신청용)', os.path.join(B2, '4_지원금신청', '8. 기금출연확인서.hwp')),
    ('sub_oath',        '서약서',                os.path.join(B2, '4_지원금신청', '9. 서약서.hwp')),
    ('sub_welfare_plan','복지사업계획서',        os.path.join(B2, '4_지원금신청', '10. 복지사업계획서.hwp')),
    # ※ 지원금 '11. 사업계획서'는 ①인가 bizplan과 동일 서식(일치율 78.8%, 차이는 빈양식↔2020년 작성예시)
    #    → 빈 양식인 bizplan을 정본으로 쓰고 중복 변환하지 않는다. DOC_SUB에서도 bizplan 키를 참조.
    ('sub_assets',      '재산목록표',            os.path.join(B2, '4_지원금신청', '12. 재산목록표.hwp')),
    ('sub_payment',     '지원금 지급신청서(계좌)', os.path.join(B2, '4_지원금신청', '13. 사내(공동)근로복지기금 지원금 지급신청서(계좌 작성할것).hwp')),
    # ⑥ 공단 인센티브
    ('incent_cost', '비용청구서(별지 제11호의2)', os.path.join(B2, '5_공단인센티브', '〔별지 제11호의2서식〕비용청구서.hwp')),
]

# 실사례 상호·기금명(빈 양식에 있으면 안 됨) — 발견 시 토큰으로 치환
REAL_NAMES = ['비앤오소프트', '이벌브소프트', '이비공동근로복지기금', '이비공동',
              '더행복한충남공동근로복지기금', '충남공동근로복지기금', '경기공동근로복지기금',
              'T공동', 'Y공동', 'X공동', 'Z공동', 'V공동', 'N사내', 'P사내']
WATCH = REAL_NAMES + ['충남', '경기', '더행복한']        # 치환 후 잔존 경고용
RRN = re.compile(r'\b\d{6}\s*-\s*[1-4]\d{6}\b')          # 주민등록번호

# ── 실사례(이비공동기금 등)에서 딸려온 개인정보·실체정보 ──
# 원본 서식이 '작성 예시'라 실제 임원 성명·주소·연락처·법인번호가 박혀 있다. 빈 양식이 되도록 마스킹.
# 이름·단체명은 원본에서 '전    석    정'처럼 글자마다 공백이 끼어 있다.
# 고정 문자열로 지우면 그 변형이 그대로 남는다(2026-08-03 reg_seal에서 실제로 남아 있었음) → 정규식으로 처리.
REAL_PERSONS = ['박준희', '전석정', '노옥희']
REAL_ORGS = ['고려인삼연구']
BLANK = '＿＿＿＿＿＿'
SPACED = lambda w: re.compile(r'[\s ]*'.join(map(re.escape, w)))
PERSON_RE = [SPACED(w) for w in REAL_PERSONS]
ORG_RE = [SPACED(w) for w in REAL_ORGS]
SCRUB = [
    # 상세주소(시도+시군구+번지까지) — 태그 경계 전까지
    (re.compile(r'(서울|경기|인천|부산|대구|광주|대전|울산|세종|강원|충북|충남|전북|전남|경북|경남|제주)'
                r'\s*(특별시|광역시|특별자치시|특별자치도|도)?\s*[가-힣]{1,10}\s*(시|군|구)\s*[^<{]{4,60}'), BLANK),
    # ※ \b 금지 — "전화02-6959-8865"처럼 한글에 붙으면 단어경계가 성립하지 않는다
    (re.compile(r'(?<!\d)0\d{1,2}[-)]\s?\d{3,4}-\d{4}(?!\d)'), '＿＿-＿＿＿＿-＿＿＿＿'),      # 전화
    (re.compile(r'(?<!\d)01[016789][-)]?\s?\d{3,4}-?\d{4}(?!\d)'), '＿＿＿-＿＿＿＿-＿＿＿＿'),  # 휴대폰
    (re.compile(r'(?<!\d)\d{6}-\d{7}(?!\d)'), '＿＿＿＿＿＿-＿＿＿＿＿＿＿'),                    # 법인등록번호
    (re.compile(r'(?<!\d)\d{3}-\d{2}-\d{5}(?!\d)'), '＿＿＿-＿＿-＿＿＿＿＿'),                   # 사업자등록번호
    (re.compile(r'(?<!\d)\d{4}-20\d{2}-\d{1,3}(?!\d)'), '＿＿＿＿-＿＿＿＿-＿'),                 # 기금 인가번호
    # 시·군·구 없이 시도명만 든 칸(소재지 예시) — <td>경기도</td> 같은 잔재
    (re.compile(r'(?<=>)\s*(서울|경기|인천|부산|대구|광주|대전|울산|세종|강원|충북|충남|전북|전남|경북|경남|제주)'
                r'(특별시|광역시|특별자치시|특별자치도|도)?\s*(?=</)'), BLANK),
]


def bindify(h):
    """자리표시자 → 바인딩 토큰, 실사례 상호·개인정보 제거"""
    h = re.sub(r'○{2,}\s*(공동|사내)근로복지기금법인', '{{FUND}}', h)
    h = re.sub(r'○{2,}\s*(공동|사내)근로복지기금', '{{FUND}}', h)
    h = re.sub(r'0{4}\s*(공동|사내)근로복지기금', '{{FUND}}', h)
    h = re.sub(r'0{4}\s*(?=공동근로복지기금)', '', h)
    for nm in REAL_NAMES:
        h = h.replace(nm + '근로복지기금', '{{FUND}}').replace(nm, '{{FUND}}')
    for pat in ORG_RE:                                      # 실사례 단체명(공백 변형 포함)
        h = pat.sub('{{FUND}}', h)
    h = RRN.sub('______-_______', h)
    for pat, rep in SCRUB:                                  # 주소·연락처·번호류
        h = pat.sub(rep, h)
    for pat in PERSON_RE:                                   # 실명(공백 변형 포함)
        h = pat.sub(BLANK, h)
    return h


def main():
    out, warn = {}, []
    print('=' * 78)
    for key, label, path in FORMS:
        if not os.path.exists(path):
            print('  %-20s %-24s ✗ 원본 없음' % (key, label)); warn.append((key, '원본없음')); continue
        try:
            h = bindify(to_html(convert(path)))
        except Exception as e:
            print('  %-20s %-24s ✗ 변환실패 %s' % (key, label, e)); warn.append((key, '변환실패')); continue
        hits = sorted({w for w in WATCH if w in h})
        rrn = len(RRN.findall(h))
        flag = '✓' if not hits and not rrn else ('⚠ ' + ','.join(hits[:3]) + (' RRN%d' % rrn if rrn else ''))
        print('  %-20s %-24s %5d자 표%-2d 토큰%-2d %s' % (
            key, label, len(h), h.count('<table>'), h.count('{{FUND}}'), flag))
        if hits or rrn: warn.append((key, flag))
        out[key] = h
    # ── PII 게이트 ──
    # 개인정보가 남았으면 **쓰지 않고 실패**한다. 이 생성물은 공개 저장소에 커밋되므로
    # 경고만 하고 지나가면 실명·주민번호가 그대로 올라간다(실제로 '전    석    정'이 남아 있었다).
    leaks = []
    for key, h in out.items():
        for w, pat in zip(REAL_PERSONS + REAL_ORGS, PERSON_RE + ORG_RE):
            m = pat.search(h)
            if m: leaks.append('%s: %s → %r' % (key, w, m.group(0)))
        for m in RRN.finditer(h):
            leaks.append('%s: 주민번호 → %r' % (key, m.group(0)))
    if leaks:
        print('\n✗ 개인정보가 남아 생성을 중단합니다 (%d건):' % len(leaks))
        for x in leaks: print('   -', x)
        sys.exit(1)

    js = "// 자동생성 — 원본 .hwp 변환 법정서식(빈 양식). 재생성: python fund-erp/tools/build_forms.py\n"
    js += "window.HWP_FORMS = " + json.dumps(out, ensure_ascii=False, indent=0) + ";\n"
    dest = r"C:\Users\fair0\Documents\pureunall\fund_forms.js"
    open(dest, 'w', encoding='utf-8').write(js)
    print('=' * 78)
    print('서식 %d종 → %s (%d bytes)' % (len(out), dest, os.path.getsize(dest)))
    if warn:
        print('\n⚠ 확인 필요:')
        for k, w in warn: print('   -', k, ':', w)


if __name__ == '__main__':
    main()
