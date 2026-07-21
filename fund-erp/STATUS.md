# 기금 시스템 — 공용 상태 (STATUS)

> **모든 세션(어느 로그인·어느 PC든) 규칙**
> 1. **시작 시**: 이 파일을 읽고, `git log --oneline -20`으로 최근 변경 확인 후 이어간다.
> 2. **끝날 때**: 이 파일의 "진행률·다음 할 일"을 갱신하고 commit/push 한다.
> 3. AI 개인 메모리에 의존하지 말 것 — 계정마다 다르다. **이 파일이 유일한 공용 뇌.**

---

## 0. 한 줄 요약
푸른노무법인 근로복지기금 42개(충남·경기 지역공동 16 / 개별공동 / 사내) 통합 운영 시스템. **두 버전 병행, 현재 주력은 "인터넷판(정적+Firebase)".**

## 1. 두 버전
| | 로컬 파이썬판 | 인터넷판 (주력) |
|---|---|---|
| 위치 | (로컬 전용) `바탕화면/8. 공동기금/02_프로그램/fund-erp/` | 이 저장소 `fund.html` |
| 구조 | FastAPI + SQLite + 단일 HTML | 정적 HTML + Firebase RTDB (서버 없음) |
| 실행 | `실행.bat` (localhost:8777) | https://nabaho.github.io/pureunall/fund.html |
| 기능 | 전 기능 완성(M1~M17) | 이전 중(§3) |

- 포털 `enter.html` "기금관리" 타일 → fund.html (`?user=&role=` 전달).
- ⚠️ `fund-erp/` 이 폴더는 로컬 파이썬판을 저장소에 보관한 사본. 실행에는 fund.db·templates 별도 필요(비공개).

## 2. Firebase (인터넷판)
- 프로젝트 `pureun-erp`, Realtime DB `https://pureun-erp-default-rtdb.asia-southeast1.firebasedatabase.app`, SDK 10.13.2 compat + App Check reCAPTCHA v3.
- 로그인은 pu-erp와 공유(같은 도메인 auth).
- **네임스페이스 `fund_erp/*` 필수**(루트 `funds`는 pu-erp 계약용, 충돌 금지).
- RTDB 규칙: `fund_erp` `.read/.write:"auth != null"` 게시됨.
- 데이터: `fund_erp/funds/{fid}`(+`years/{yr}/subsidy`,`years/{yr}/opening`), `/sites/{fid}/{sid}`, `/annual/{fid}/{yr}/{code}`, `/welfare/{fid}/{yr}/{id}`, `/events/{fid}/{eid}`, `/txns/{fid}/{yr}/{hkey}`, `/billings/{id}`.

## 3. fund.html 진행률
**완성 ✅**: 홈(3그룹·오늘할일) · 기금대장(인라인) · 청구관리 · 기금정보 · 참여사업장 · 연간일정 · 지원금(공동) · 목적사업·대부 · 변경이벤트 · **회계·결산**(통장 SheetJS 파싱→자동분개→승인→결산관문→재무상태표·운영성과표·시산표→별지15호 인쇄)
**미완성 ⬜**: 서류 생성(설립/지원 서식), 서식 자료실 메뉴

- 구조: 전역 `S`(view/fundId/tab/year/*For 캐시)·`fbDb`·`funds`·`esc()`·`num()`·`showModal/closeM`. 탭: `infoForm/sitesTab/annualTab/subsidyTab/welfareTab/eventsTab/closingTab`. 회계: `parseBank/proposeAcct/computeFin/finPanel/openForm15`. 상수: `ACCT_CHART/ACCT_RULES/ANNUAL_TMPL/EVENT_KINDS/WELF_CATS`. SheetJS(xlsx 0.18.5) head 로드됨.
- 코덱스(codex CLI) 검증 반영: XSS esc, saveInfo update, 비동기 레이스 가드(`_fid/_k` 캡처 후 `S.*For` 일치), 통장 재가져오기 보존, parseBank 건수열 제외, num 소수·부호, saveSubsidy 사내 차단. (미해결 낮음: 인라인 onclick 키 이스케이프 — Firebase 키가 안전문자만이라 무해)

## 4. 다음 할 일 (우선순위)
1. **전체 재점검(코덱스)** — `cd ~/Documents/pureunall && codex exec "fund.html 전체 검증..." -C . -s read-only -c 'model_reasoning_effort="high"'`. 특히 computeFin 회계정합성(대변 부채/준비금 미반영 → 자산≠자본 가능성).
2. **서류 생성** — docgen(HTML) JS 이식 + 설립/지원 서식 엑셀 채움(SheetJS). ⚠️ 원본 서식 엑셀은 사업장 실데이터 포함 → 공개 github 금지 → **Firebase Storage(로그인 보호)**에 올려 불러오기(사용자 1회 업로드). 로컬 원본: `02_프로그램/fund-erp/templates/`, 로직: 로컬 setup-excel/subsidy-excel.
3. **서식 자료실** 메뉴(현재 '준비중').
4. **미완비 14개 기금 기본정보** — 스캔 OCR/수기(사용자). 완비 28/42.

## 5. 작업/배포 흐름
```
cd ~/Documents/pureunall
git pull --rebase origin main      # ⚠️ 원격에 급여·명함첩·달력 작업 자주 올라옴 — 반드시 먼저
# fund.html 편집
git add fund.html && git commit -m "..." && git push origin main
# github.io 재배포 1~2분. 확인 Ctrl+Shift+R
```
- JS 문법: `<script>` 추출 후 `node --check`.
- 브라우저 실검증은 로그인 필요 → 사용자가 fund.html 열어 확인.

## 6. 보안 주의 (중요)
- **저장소 금지**: `fund.db`, 사업장 실데이터, `templates/` 서식엑셀, `backups/`. (로컬 .gitignore·export FORBID로 차단.)
- 시드용(로컬 gitignore): `02_프로그램/fund-erp/backups/fund_funds_export.json`(42기금), `fund_sites_export.json`(563사업장) → fund.html [가져오기]로 Firebase 1회 업로드.
- 실데이터 이전 현황: funds·sites는 Firebase에 올라감. annual/welfare/txns/subsidy는 사용 시 생성.
- PII(주민번호·인감·비번) 스키마 미저장. `Downloads/푸른노무법인(4).xlsx`에 평문 비번·주민번호 — 통째 공유 금지.

---
## 변경 로그 (세션 끝에 한 줄씩 추가)
- 2026-07-20: 인터넷판 회계 결산(재무제표+별지15호)까지 완성. 코덱스 1차 검증 반영. STATUS 공용화.
