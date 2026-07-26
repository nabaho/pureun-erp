# -*- coding: utf-8 -*-
"""핵심 6종 HWP → fund_forms.js 생성 + 실데이터 혼입 검사"""
import io, sys, os, re, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from hwp2html import convert, to_html   # 이 모듈이 stdout을 utf-8로 이미 감쌈

B1 = r"C:\Users\fair0\OneDrive\바탕 화면\8. 공동기금\03_과거자료\설립관련과거자료\1. 노동부인가시필요서류"
FORMS = [
    ('inka',      '설립인가신청서(별지 제7호)', os.path.join(B1, '1 .설립인가신청서.hwp')),
    ('agreement', '설립합의서',                 os.path.join(B1, '2. 설립합의서.hwp')),
    ('charter',   '정관',                       os.path.join(B1, '3. 공동기금 정관.hwp')),
    ('minutes',   '설립준비위원회 회의록',       os.path.join(B1, '4. 설립준비위원회 회의록.hwp')),
    ('contrib',   '기금출연확인서',             os.path.join(B1, '5. 기금출연확인서.hwp')),
    ('bizplan',   '사업계획서(연도)',           os.path.join(B1, '6. 사내근로복지기금 사업계획서.hwp')),
    # 사내기금 전용 정관 (공동 정관과 별개)
    ('charter_sane','정관(사내)',               os.path.join(B1, '1. 노동부 인가시 필요서류', '2-1.정관(사내근복).hwp')),
]

# 실데이터(실제 회사·기금명) 혼입 탐지용 — 알려진 실제 이름 조각
REAL_HINTS = ['더행복한','충남공동','경기공동','참살이','이비공동','안전공사','청신','배경','일원','현재기업',
              '캔탑스','비앤오','엘케이','플러스','디와이','나래','수공건설','다움','가치를만들']

def bindify(h):
    """원본 자리표시자 → 데이터 바인딩 토큰"""
    # 기금명 (○○/0000 접두 형태 모두)
    h = re.sub(r'○{2,}\s*(공동|사내)근로복지기금법인', '{{FUND}}', h)
    h = re.sub(r'○{2,}\s*(공동|사내)근로복지기금', '{{FUND}}', h)
    h = re.sub(r'0{4}\s*(공동|사내)근로복지기금', '{{FUND}}', h)
    h = re.sub(r'0{4}\s*(?=공동근로복지기금)', '', h)
    return h

out = {}
print('=' * 72)
for key, label, path in FORMS:
    if not os.path.exists(path):
        print('MISSING', label, path); continue
    blocks = convert(path)
    h = to_html(blocks)
    h = bindify(h)
    hits = [w for w in REAL_HINTS if w in h]
    nt = h.count('<table>')
    print('%-12s %-24s 길이=%6d 표=%d 바인딩=%d %s' % (
        key, label, len(h), nt, h.count('{{FUND}}'),
        ('⚠실데이터?: ' + ','.join(hits)) if hits else '✓ 실데이터 없음'))
    out[key] = h

js = "// 자동생성 — 03_과거자료 원본 .hwp에서 변환한 법정서식 템플릿(빈 양식). 수정 시 build_forms.py 재실행.\n"
js += "window.HWP_FORMS = " + json.dumps(out, ensure_ascii=False, indent=0) + ";\n"
dest = r"C:\Users\fair0\Documents\pureunall\fund_forms.js"
open(dest, 'w', encoding='utf-8').write(js)
print('=' * 72)
print('→ 저장:', dest, os.path.getsize(dest), 'bytes')
