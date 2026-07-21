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
- 데이터: `fund_erp/funds/{fid}`(+`years/{yr}/subsidy`,`years/{yr}/opening`, +담당 `mgr_main{sid,name}`·`mgr_subs[]`·`manager`문자열), `/sites/{fid}/{sid}`, `/annual/{fid}/{yr}/{code}`, `/welfare/{fid}/{yr}/{id}`, `/events/{fid}/{eid}`, `/txns/{fid}/{yr}/{hkey}`, `/billings/{id}`.
- **담당자 명단은 pu-erp와 공유**: `data/user_accounts/v`(pu-erp 직원계정 배열) 읽어 재직(active)만 사용. ⚠️ RTDB 규칙이 `data` 경로 auth 읽기를 허용해야 함(pu-erp가 쓰므로 대개 허용됨). 담당 모달에서 "명단 로드 실패" 뜨면 규칙에 `data/user_accounts` 읽기 추가 필요.

## 3. fund.html 진행률
**완성 ✅**: 홈(**그룹 탭** 지역/공동/사내/지난, 계약관계 인라인 드롭다운, **정보 채우기 토글**=핵심6필드 인라인입력, 검색 — 기금 대장 흡수) · 기금대장(인라인) · 청구관리 · 기금정보 · 참여사업장 · 연간일정 · 지원금(공동) · 목적사업·대부 · 변경이벤트 · **회계·결산**(통장 SheetJS 파싱→자동분개→승인→결산관문→재무상태표·운영성과표·시산표→별지15호 인쇄) · **서식 자료실**(설립·지원신청서 원본 엑셀 데이터 채움, ExcelJS) · **담당자 지정**(주/부담당, pu-erp 재직자 선택)
**미완성 ⬜**: docgen HTML 서류(참고용 미리보기 — 인터넷판 미이전, 실제 제출은 서식 자료실 엑셀 사용)

- 구조: 전역 `S`(view/fundId/tab/year/*For 캐시)·`fbDb`·`funds`·`esc()`·`num()`·`showModal/closeM`. 탭: `infoForm/sitesTab/annualTab/subsidyTab/welfareTab/eventsTab/closingTab`. 회계: `parseBank/proposeAcct/computeFin/finPanel/openForm15`. 서식: `renderForms/pickTpl/fillForm/fillSetup/fillSubsidy`(ExcelJS+IndexedDB `fundErpTpl`). 상수: `ACCT_CHART/ACCT_RULES/ANNUAL_TMPL/EVENT_KINDS/WELF_CATS/TPL`. head: SheetJS(xlsx 0.18.5, 통장파싱)+ExcelJS(4.4.0, 서식채움) 로드.
- 코덱스(codex CLI) 검증 반영: XSS esc, saveInfo update, 비동기 레이스 가드(`_fid/_k` 캡처 후 `S.*For` 일치), 통장 재가져오기 보존, parseBank 건수열 제외, num 소수·부호, saveSubsidy 사내 차단. (미해결 낮음: 인라인 onclick 키 이스케이프 — Firebase 키가 안전문자만이라 무해)

## 4. 다음 할 일 (우선순위)
1. **서식 자료실 사용자 검증** — 원본 엑셀 등록 방식 확정(파일선택+IndexedDB, Firebase Storage 대신). 사용자가 로컬 `02_프로그램/fund-erp/templates/` 2개 파일을 서식 자료실에서 [원본 엑셀 등록] → 대상 기금 선택 → [데이터 채워 받기]로 실제 채움 확인 필요. node 검증은 통과(설립 21건·수식/병합 보존).
2. **미완비 14개 기금 기본정보** — 스캔 OCR/수기(사용자). 완비 28/42. (채워야 서식 엑셀도 완성됨)
3. **docgen HTML 미리보기**(선택) — 참고용 화면. 실제 제출은 서식 자료실 엑셀이므로 우선순위 낮음.
4. **코덱스 2차 검증 잔여(보류분, 위험 낮음~중간)** — 2026-07-21 전체 재점검 25건 중 16건 수정 완료(변경 로그 참조). 남은 것: ⑷통장 잔액(balance) 대사 기능, ⑻시산표에 전기이월 표시, ⑼목적사업 분류(WELF_CATS)와 회계 계정 불일치(계정과목 확장은 사용자 결정 필요), ⑿`.once()` 캐시 수동 새로고침 버튼, ⒁루트 value 리스너 재렌더 시 미저장 입력 소실(디바운스/포커스 보존 필요), ㉕객체 키 inline-JS 삽입(현재 키는 push()/FUND-NNNN이라 실위험 낮음 — JSON 가져오기 키 검증 추가 시 해소).

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
- 서식 원본 엑셀은 **각 사용자가 브라우저 IndexedDB(`fundErpTpl`)에 로컬 등록** — 저장소·Firebase에 안 올라감. 로컬 원본 위치 `02_프로그램/fund-erp/templates/` 2종.
- 시드용(로컬 gitignore): `02_프로그램/fund-erp/backups/fund_funds_export.json`(42기금), `fund_sites_export.json`(563사업장, **2026-07-21 contacts 담당자 포함 재생성** — 이전 export가 contacts 누락) → fund.html 참여사업장 [📥 가져오기]로 Firebase 업로드. ⚠️ 담당자 연락처 반영하려면 이 재생성본으로 **재가져오기 1회 필요**(sites/{fid} 통째 덮어씀, site_id 동일키라 안전).
- 실데이터 이전 현황: funds·sites는 Firebase에 올라감. annual/welfare/txns/subsidy는 사용 시 생성.
- PII(주민번호·인감·비번) 스키마 미저장. `Downloads/푸른노무법인(4).xlsx`에 평문 비번·주민번호 — 통째 공유 금지.

---
## 변경 로그 (세션 끝에 한 줄씩 추가)
- 2026-07-20: 인터넷판 회계 결산(재무제표+별지15호)까지 완성. 코덱스 1차 검증 반영. STATUS 공용화.
- 2026-07-21: 코덱스 2차 전체 재점검(25건 발견) → 회계 정합성 재작성(computeFin 유형별 전 계정 집계·부채/자본계정 반영·대차일치 칩·전기이월에 준비금 추가·별지15호 준비금/기타비용 행·불일치 시 출력 경고), 통장 파싱 6건(합계행 제외·잔액열 오인·다단헤더·날짜 정규화·입출 동시행 분리·같은날 동일거래 키 충돌), import 레이스 2건(기금/연도 경로 고정·서버 최신본 중복검사), 동일 차/대 승인 차단, 로그아웃 시 Firebase signOut, 쓰기실패 catch+복원 일괄, num() 음수/지수 표기. 로컬 파이썬판(accounting.py·docgen.py 결산서 준비금=순이익 임의대입 버그)도 동일 수정. node 단위테스트 23건 통과. 보류 6건은 §4-4. 사용자 실화면 검증 후 홈·대장 호수순 정렬 수정(localeCompare numeric — 충남 10호가 1호보다 앞에 오던 문제). 참고: 홈 '미완비 42개'는 버그 아님 — 완비 기준 5항목 중 인가일(inka_date)이 지원신청서 원본에 없어 충남1~7도 4/5, 대장에서 수기 입력 필요.
- 2026-07-21: **서식 자료실 이전 완료** — 파이썬 setup-excel/subsidy-excel 로직을 브라우저로 이식. 원본 법정서식 엑셀(빈 양식)을 IndexedDB에 1회 등록 후 ExcelJS(CDN 4.4.0)로 채움 — 테두리·병합셀 1110개·VLOOKUP 수식(설립165·지원721) 전부 보존(SheetJS 커뮤니티판은 저장 시 스타일 소실하므로 ExcelJS 선택). 사이드바 '서식 자료실' 활성화. node 검증 21건 통과. 사용자 실화면 검증(원본 등록→채워받기) 대기.
- 2026-07-21: **담당자 주/부담당 지정 + 홈 그룹 탭** — (담당) 기금 상세 헤더 [👤 담당 ✎]→모달에서 주담당1·부담당다수를 pu-erp 재직자에서 선택, `mgr_main/mgr_subs/manager` 저장, `mgrText()`로 표시. (홈) 세로 3그룹 나열→상단 탭 지역/공동/사내 전환(S.homeTab)으로 스크롤 축소, 검색 시 전체결과. node 검증. 커밋 adcf742 push.
- 2026-07-21: **담당자 명단 로드 안정화** — 재직자 명단을 동일출처 localStorage(`pureun_v6_user_accounts`, pu-erp가 채움) 우선 로드 → Firebase 규칙 의존 제거, 실패 시 `data/user_accounts/v` 폴백. `_normStaff`(배열/id객체형·퇴사·중복·휴직 필터). **기금 정보 탭에 주담당 드롭다운+부담당 체크박스 셀 분리**(자유입력 제거, 재직자 선택). 커밋 9ae4a18. (전제: 그 브라우저에서 pu-erp 1회 실행돼 localStorage에 명단 존재)
- 2026-07-21: **지원금 3종(일괄보드·전년복사·서류함)** — ①사이드바 '🎁 지원금 관리' 신설: 연도 선택→공동기금(운영중) 전체 한 표에서 신청액·결정액·교부일·집행액 인라인 입력(patchSub 자동저장)·정산대사·합계, 기금명 클릭→해당 기금 지원금탭(openFundSubsidy). ②각 기금 지원금탭 [↩ 작년 값 불러오기](copyPrevSubsidy, 전년 subsidy 프리필·교부일만 비움). ③지원금 서류함(subsidyDocsPanel): 연도별 파일 업로드(공고/신청서/결정통지/정산보고 등 7종), **Firebase Storage 필요** — SDK(storage-compat)·`storageBucket:'pureun-erp.appspot.com'` 추가, fbStore. RTDB 메타 `fund_erp/subsidy_docs/{fid}/{yr}/{id}`{kind,name,url,path,uploaded}, 파일 `fund_erp/subsidy_docs/{fid}/{yr}/`. 커밋 77b58ed. **⚠️ 사용자 설정 필요: Firebase 콘솔에서 Storage 활성화 + 규칙(fund_erp 경로 auth 읽기/쓰기) 게시. storageBucket 이름이 다르면(.firebasestorage.app) 수정. 미설정 시 업로드만 실패(나머지 기능 정상).**
- 2026-07-21: **참여사업장 담당자 연락처 채움(원본 재추출)** — 원본 `Downloads/푸른노무법인 (4).xlsx`의 `2026/2025지역공근사업장` 시트(상호·사업자번호·담당자·직무·전화·휴대폰·이메일·상시근로자수·업종)를 `import_site_contacts.py`(사업자번호 매칭, 2026 우선)로 fund.db sites.contacts에 채움 + 빈 상시근로자수/업종/대표자/소재지 보완. **563/563 전량 매칭·연락처 채움(523 이메일)**. `fund_sites_export.json` 재생성. ⚠️ **사용자 작업: 인터넷판 참여사업장 [📥 사업장 데이터 가져오기]로 재가져오기 1회 → 담당자·이메일 표시**(Firebase는 auth 필요라 코드가 직접 못 씀). 참고: (5) 파일 없어 최신 (4) 사용.
- 2026-07-21: **기금 대장 → 기금 현황 흡수 + 지난기금 상태별 분류** — (통합)사이드바 '기금 대장' 제거, 기금 현황에 [✏️ 정보 채우기] 토글(켜면 목록이 핵심6필드 인라인 입력표=옛 대장 기능, 자동저장·미완비필터·완성도). fundTable(list,edit)/fundEditRow/LED_COLS 재사용, renderLedger 삭제. (지난기금)📄계약종료·🗄기록보관 상태별 섹션+각 안에서 동종(지역/공동/사내). 커밋 76ed5e0·6cdcc2b.
- 2026-07-21: **공통 편의 4종 추가** — ①`confirmM(msg,opts)` 통일 확인 모달(모든 confirm 대체, 삭제=danger 빨강, Esc취소/Enter확인)+남은 alert 전부 `toast`화(openForm15 대차확인 confirm만 팝업 제스처 위해 native 유지). ②저장 안 한 변경 이탈 경고: infoForm 입력 `markDirty`, 저장 `clearDirty`, go/goTab/goBack `_leaveGuard`, 새로고침·닫기 `beforeunload`. ③`loadingHTML()` 회전 스피너(불러오는중 8곳 통일, @keyframes spin). ④단축키 Esc 닫기·Ctrl/Cmd+S 저장(모달 primary or 기금정보). 커밋 30f24bd. 이 유틸들은 향후 전 기능 재사용.
- 2026-07-21: **공통 편의 기능(전 화면 공유)** — ①`toast(msg,type)` 알림(#app 밖 body, 재렌더에도 유지) → 저장 클릭 시 '저장되었습니다' 표시(기존 saveInfo가 #msg 세팅 직후 renderFund로 지워 안 보이던 문제 해결). 주요 저장/삭제/가져오기 전반 연결. ②브라우저 히스토리 통합(go/goTab pushState, popstate 복원) → **브라우저 뒤로가기 동작**, `goBack()`+기금상세 [← 뒤로]. 향후 기능도 toast/goTab/goBack 재사용. 커밋 494a7a9. **방침(사용자): 추가 기능보다 전 시스템 공통 편의기능 우선.**
- 2026-07-21: **기금 생애주기 관리(계약종료·기록보관)** — 파이썬 mgmt_type 개념 이식. funds에 `lifecycle`(운영/계약종료/기록보관)+`end_date`·`end_reason`. 기금 상세 [🔖 상태]→모달(상태·종료일·사유), 상단 안내 배너. 홈: 지난 기금을 3그룹 탭에서 분리→'🗂 지난 기금' 탭, 운영/지난 개수 표시, 오늘할일(미완비) 집계 제외, 검색은 포함. 계약종료=재개 가능(운영으로 되돌림). `isPast()`. 커밋 f491ab8. node 검증. (미적용: 대장·서식 기금선택은 지난 기금도 노출 — 의도, 필요 시 필터 추가)
- 2026-07-21: **참여사업장 푸른이알피 업체 연결(모기업 당겨오기)** — 참여사업장 [🔗 푸른이알피 업체 연결]→업체 검색 모달(동일출처 localStorage `pureun_v6_companies` 우선→Firebase `data/companies/v` 폴백)→선택 시 사업장 편집기에 업체정보(상호·대표자·사업자번호·업종·소재지·담당자연락처) 프리필→검토 후 저장. `companyToSite`(contacts 배열/primaryContact 필드 모두 매핑), `puerp_co_id` 연결키 보존. 사내기금 모기업이 pu-erp에 이미 있으면 재입력 불필요. 커밋 cd487bb. node 검증.
- 2026-07-21: **참여사업장 담당자(연락처) 필드 반영** — 이전 export가 `contacts` 누락→Firebase sites에 담당자 없음이 원인. ①`fund_sites_export.json` contacts(담당자명·직위·휴대폰·이메일·isPrimary)+corp_no·note 포함 재생성(526/563건 담당자). ②편집 모달에 담당자명/직위/휴대폰/이메일+연번/법인번호/비고 필드, 목록에 담당자·이메일 컬럼. saveSite는 contacts 대표항목만 갱신(부담당 보존). ③[📥 사업장 데이터 가져오기] 버튼 항상 노출. 커밋 a742c9e·b338d58. **사용자 작업 필요: 참여사업장 탭에서 재생성 export 재가져오기 1회→담당자 채워짐.** node 검증(연락처 파싱·병합).
