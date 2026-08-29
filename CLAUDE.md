# 푸른노무법인 ERP 시스템 - Claude Code 가이드

## 프로젝트 개요
푸른노무법인의 ERP 시스템 - 인사노무 전문 업무 자동화 플랫폼

## 검사(테스트)를 쓰는 규칙 — 「지금 값」이 아니라 「규칙」을 못 박는다

2026-08-16 하루에 검사 다섯 개가 **기능이 망가져서가 아니라 멀쩡한 개선 때문에** 깨졌다.
전부 같은 까닭이다 — 검사가 «지금 값» 을 글자 그대로 박아 두었다.

| ✗ 이렇게 박지 말 것 | ✓ 이렇게 본다 |
|---|---|
| `maxHeight:'calc(100vh - 340px)'` | 높이 «한도가 있는가» |
| `<script src="js/x.js"></script>` | 캐시 번호가 «붙어 있는가» (`\?v=\d+`) |
| `ref:_ldBoxRef` | 손잡이가 «달렸는가` (`ref:[A-Za-z_$][\w$]*\.ref`) |
| `'2건 ×'` · `'업태 없음'` | 숫자와 단추가 «갈라져 있는가» |
| `boxes.length === 2` | `>= 2` (표가 늘어도 안 깨지게) |

**왜 나쁜가**: 깨진 검사를 본 다음 사람은 「내가 뭘 잘못했나」를 한참 찾는다.
몇 번 겪으면 검사를 «고칠 것» 이 아니라 «지울 것» 으로 여기게 된다 — 그게 진짜 손해다.

**값 자체가 규칙일 때**(세율 8.8%, 지급액 820,800원 등)는 박는 게 맞다.
그때는 같은 줄에 `검사고정-허용` 과 **왜 규칙인지**를 함께 적는다.

`tests/test-pin-guard.test.js` 가 이 규칙을 기계로 지킨다 —
새로 박아 두면 그 자리에서 걸리고, 어떻게 고칠지도 함께 알려 준다.

## 파이어베이스 보안규칙은 «채팅에» 올린다 (대표 지시 2026-08-29)

규칙을 고쳤으면 **파일 첨부로 끝내지 말고 채팅 본문에 전문을 코드블록으로 올린다.**
대표가 콘솔에 붙여넣는 것이 마지막 한 걸음인데, 파일을 내려받아 여는 단계가
그 사이에 끼면 「나중에」가 된다 — 그러면 고친 규칙이 영영 안 올라간다.

- 만들 때: `node scripts/make-firebase-rules.js > docs/firebase-rules-전체-적용본.json`
- 고칠 곳은 **만들개**(`scripts/make-firebase-rules.js`)다. JSON을 손으로 고치면
  다음에 만들 때 조용히 사라진다 (`tests/firebase-rules-apply.test.js` 가 막는다).
- 채팅에 올릴 때는 **무엇이 바뀌었는지 먼저 한 줄**, 그다음 전문.

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

---

## 기금 시스템(fund.html) 작업 규칙 — 계정·PC 간 이어가기
근로복지기금 관리(`fund.html`, Firebase RTDB)는 여러 로그인/PC에서 이어서 개발한다.
AI 개인 메모리는 계정마다 다르므로 **공용 상태 파일이 유일한 기준**이다.

- **세션 시작 시**: `fund-erp/STATUS.md`를 읽고 `git log --oneline -20`으로 최근 변경을 확인한 뒤 이어간다.
- **세션 종료 시**: 바뀐 내용을 `fund-erp/STATUS.md`(진행률·다음 할 일·변경 로그)에 반영하고 commit/push 한다.
- **push 전 반드시** `git pull --rebase origin main` (원격에 급여·명함첩·달력 등 다른 작업이 자주 올라옴).
- 실데이터(fund.db·사업장 실데이터·templates 서식엑셀·backups)는 저장소에 올리지 않는다.
