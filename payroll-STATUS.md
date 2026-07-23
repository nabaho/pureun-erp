# 급여 아웃소싱 시스템 — 공용 상태 (STATUS)

> **모든 세션(어느 로그인·어느 PC든) 규칙**
> 1. **시작 시**: 이 파일을 읽고 `git log --oneline -20`으로 최근 변경 확인 후 이어간다.
> 2. **끝날 때**: 이 파일의 "진행률·다음 할 일·변경 로그"를 갱신하고 commit/push 한다.
> 3. **AI 개인 메모리에 의존 말 것 — 계정마다 다르다. 이 파일이 유일한 공용 뇌.**
> (기금 시스템은 `fund-erp/STATUS.md` 별도. 원격에 급여·명함첩·달력·기금 작업 자주 올라옴 → 항상 `git pull --rebase` 먼저.)

---

## 0. 한 줄
푸른노무법인의 **약 110개 외부 고객 사업장 급여·노동법 아웃소싱 자동화**. 자료(엑셀·PDF·사진)를 읽어 계산→검토(3색)→확정→명세서→파생신고까지. 담당자는 확인·확정만.

## 1. 아키텍처 (A안 — 통합시스템 통합)
- 런처 `enter.html`(nabaho.github.io/pureunall) **급여관리 타일** → `payroll-os.html`(라이브).
- **같은 Firebase `pureun-erp`** 공유 → pu-erp 직원이 **같은 이메일/비번 로그인(SSO)**·권한(`uid_roles`) 공유.
- 데이터는 **`payroll_os` 노드만** 사용(pu-erp data 미접촉 — kcareer·ieum·fund_erp와 동일 앱별 칸 분리).
- 계산 코어·기준값은 pu-erp에서 이식(공유), 데이터 분리.

## 2. Firebase
- 프로젝트 `pureun-erp`, RTDB `https://pureun-erp-default-rtdb.asia-southeast1.firebasedatabase.app`, SDK **10.13.2 compat** + App Check reCAPTCHA v3(키 `6Ldu1hEt...`).
- 인증: **이메일/비번**(pu-erp 공유). 로그인 후 `uid_roles/{uid}`(isAdmin/fin) 권한 판별.
- **규칙에 `payroll_os` 블록 게시됨**(`auth!=null && (fin || isAdmin)`). 그 외 pu-erp 규칙 불변.
- 데이터 키: `payroll_os/site_cards`(설정카드 배열)·`/payroll`(급여, 사업장→시트/월→직원)·`/payroll_locked`(확정잠금맵 `사업장|월`).
- 앱의 "가져오기" 버튼으로 `_harness_out`의 JSON을 payroll_os에 업로드.
- ⚠️ 처음 열면 서버가 비어 "0곳"으로 보임 → 아래 4-데이터 재업로드로 복구(정상).

## 3. 앱 진행률 — payroll-os.html (5개 화면)
- **① 설정 카드** ✅ — 69개 사업장 카드(급여일·산정기간·단수처리·확인필요). JSON 가져와 서버 저장.
- **② 수신함** ⬜ 골격만 — 자료 자동태깅·D-7 독촉 미구현.
- **③ 급여 처리** ✅ — 사업장→월→직원별 표(10항목)·3색 신호·확정/되돌리기(red=최저임금 등 이상 시 확정 차단). 중복 이름 정리+순번.
- **④ 명세서** ✅ — 임금명세서 인쇄/PDF(근로기준법 48조), 확정=정식·미확정=워터마크, 화이트라벨, 하단 안내(연차촉진 등). 임금총액=실수령+공제.
- **⑤ 신고** ✅(초안) — 파생신고 **1호 일용 근로내용확인**(근로일수·보수총액 등)·**2호 4대보험 취득·상실**(입/퇴사일 파싱). EDI 붙여넣기용 TSV 복사. 주민번호는 성명만→담당자가 대행기관 명부 매칭.

## 4. 하네스·엔진·데이터 (워크트리 = C:\Users\fair0\Documents\pureunall-harness, 브랜치 harness-payroll)
- **harness/**: classify·profile·parser_v1(3종 양식+일용 시급 파싱)·analyze·period·matching·report.
- **engine/**: payroll_core.js(엔진: 지방세 10원절사·고지액모드·연도별 요율)·check_golden·validate_multi·build_site_cards·build_pilot·verify_month(사업장/월 일괄 명세서+독립재계산 대조)·payslip_html·build_daily_report(파생신고1호)·cards_html/cards_edit_html·audit_sites·ocr_triage·**ocr_pipeline(Gemini 연결+주민번호 마스킹+3중검산 실구현)**·rates.json(연도별 기준값).
- **결과물** `_harness_out/`(깃 밖, 개인정보 O): parser_output·site_cards·pilot_payroll·daily_report·coverage_report 등.
- 검증: 3사업장 교차 **지방세 100%·고용보험 99~100%·실수령 100%**. 직원 2.7만명 추출(엑셀분). 주민번호 미저장.
- OCR: 텍스트PDF 좌표추출+마스킹 구현, Gemini 비전 연결코드+3중검산(행합계·2모델·확신도). 이미지 대량(467)은 키·유료티어로 실행.

## 5. 파일럿·결정 (확정)
- 파일럿 3곳: **화담원·제이앤드씨·늘봄**.
- 일용직 분해 **포함** / 세후부담 **사업장별 설정** / 명세서 법정항목·연차촉진 **우선 모두 포함** / OCR 외부전송 **동의(유료 티어)**.
- 개발순서: ①핵심루프(자료→계산→검토→확정→명세서) ✅ → ②OCR·어댑터(진행) → ③파생신고(1·2호 ✅) → ④부가모듈.
- 유지보수: 담당자는 코드 아닌 **설정카드만** 수정.

## 6. 다음 할 일 (우선순위)
1. **데이터 재업로드**(항상 첫 액션): 앱에서 site_cards.json·pilot_payroll.json 올리기(§2). daily_report는 신고 탭이 payroll에서 파생.
2. **화담원 일용 지급항목 결측** 보완(기본급/과세/공제총액 "-").
3. **파생신고 3호**: 퇴직정산(평균임금·퇴직소득세) 또는 원천세 집계표.
4. **수신함 실구현**(메일 웹훅·자동태깅·D-7) — 법인 메일 도메인 필요.
5. **OCR 이미지 대량 실행**(Gemini 키 `engine/.secrets/gemini.key` + 유료티어) → 커버리지 확대.
6. 부가: 서식함·암묵지·실시간기록·사업주 포털.

## 7. 알려진 이슈
- 화담원 일용: 지급항목 결측(양식 보완). 늘봄: 공제항목 결측.
- 처음 로그인 시 payroll_os 비어있음 → 재업로드 필요(정상).
- 인앱 브라우저 프리뷰는 file:// 대화형에서 멈춤 → 크롬 직접/배포본으로 확인.
- 콘솔(cp949) 파이썬 print의 —·⚠️ 특수문자 시 UnicodeEncodeError(파일 출력은 정상).
- 워크트리 미커밋 상태 유지 금지(브랜치전환 유실 이력) → 매 단계 커밋.

## 8. 작업/배포 흐름
```
cd ~/Documents/pureunall
git pull --rebase origin main          # ⚠️ 반드시 먼저 (원격에 여러 작업 올라옴)
# payroll-os.html / enter.html 편집  → main = 라이브(push 시 nabaho.github.io 즉시 반영)
git add payroll-os.html && git commit -m "..." && git push origin main
# 하네스/엔진/데이터생성 = 워크트리(pureunall-harness, harness-payroll 브랜치)에서 커밋
# 실제 급여자료(주민번호)·_harness_out = 깃 커밋 금지(.gitignore)
```

## 9. 변경 로그 (최신순 — 끝낼 때 추가)
- 2026-07-22: 파생신고 2호(4대보험 취득·상실, 입/퇴사일 파싱)·1호(일용 근로내용확인)·근로일자 달력추출·명세서(임금명세서 인쇄)·OCR Gemini 연결+마스킹·연말정산 정산액 처리·verify_month 일괄생성·직원표 중복정리.
- 2026-07-20: 급여관리 타일 추가·payroll-os.html(급여처리 드릴다운·3색·확정)·pu-erp 기준값 이식(rates.json)·설정카드 자동생성·엔진 3사업장 검증·하네스 목표0~7·A안 확정.
