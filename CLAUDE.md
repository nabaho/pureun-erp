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

---

### superpowers (obra/superpowers)
GitHub 별 130k - 에이전트 스킬 프레임워크 & 소프트웨어 개발 방법론 (⭐ 130,000+)

**설치 (Claude Code 공식 마켓플레이스):**
```
plugin install superpowers@claude-plugins-official
```

**또는 마켓플레이스 수동 등록 후 설치:**
```
plugin marketplace add obra/superpowers-marketplace
plugin install superpowers@superpowers-marketplace
```

**업데이트:**
```
plugin update superpowers
```

**주요 스킬 (자동 트리거):**
- brainstorming - 코드 작성 전 아이디어 정제, 설계 검토
- writing-plans - 상세 구현 계획 수립 (2-5분 단위 태스크)
- subagent-driven-development - 서브에이전트 기반 병렬 개발
- test-driven-development - RED-GREEN-REFACTOR TDD 사이클
- systematic-debugging - 4단계 근본 원인 분석 프로세스
- requesting-code-review - 코드 리뷰 요청 전 체크리스트
- using-git-worktrees - 병렬 개발 브랜치 관리
- finishing-a-development-branch - 머지/PR 결정 워크플로우

**특징:**
- 스킬이 자동으로 트리거됨 (별도 호출 불필요)
- TDD, YAGNI, DRY 원칙 강제 적용
- 서브에이전트 기반으로 수 시간 자율 작업 가능
- 저장소: https://github.com/obra/superpowers

---

## 개발 환경

### 기술 스택
- 인사노무 ERP 시스템
- 주요 업무: 임금계산, 인사관리, 노무컨설팅, 산재/고용보험

### 코딩 규칙
- 한국어 주석 사용
- 노무 도메인 용어 준수 (급여→임금, 직원→근로자 등)
