# 푸른노무법인 ERP 시스템 - Claude Code 가이드

## 프로젝트 개요
푸른노무법인의 ERP 시스템 - 인사노무 전문 업무 자동화 플랫폼

## MCP Skills

### korean-law-mcp
한국 법령·판례·행정규칙 검색 MCP 서버 (87개 도구)

**설치:**
```bash
claude mcp add korean-law npx -y korean-law-mcp
```

**주요 도구:**
- `search_law` - 법령 검색 (근로기준법, 노동조합법, 산업안전보건법 등)
- `get_law_text` - 조문 직접 조회
- `search_precedent` - 판례 검색
- `search_ordinance` - 자치법규(조례/규칙) 검색
- `search_interpretation` - 법령해석례 검색
- `search_admin_rule` - 행정규칙 검색

**환경변수:**
```
LAW_OC=<법제처 API 키>  # https://open.law.go.kr 에서 발급
```

**노무법인 주요 활용 예시:**
```bash
# 근로기준법 조문 조회
korean-law "근로기준법 제60조 연차휴가"

# 부당해고 판례 검색
korean-law "부당해고 원직복직 판례"

# 최저임금 관련 법령 검색
korean-law "최저임금법 위반 처벌"

# 산업재해 관련 조문
korean-law "산업안전보건법 중대재해"
```

**JO Code 규칙:**
- 조문번호 6자리 코드 (AAAABB)
- AAAA: 조번호(zero-padded), BB: 의X번호(없으면 00)
- 예: 제38조 → 003800, 제10조의2 → 001002

## 개발 환경

### 기술 스택
- 인사노무 ERP 시스템
- 주요 업무: 임금계산, 인사관리, 노무컨설팅, 산재/고용보험

### 코딩 규칙
- 한국어 주석 사용
- 노무 도메인 용어 준수 (급여→임금, 직원→근로자 등)
