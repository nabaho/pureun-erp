# pu-erp 인사관리 모듈 추출본 (급여아웃소싱 검토용)

원본: pu-erp.html (BUILD_SEQ 58, 2026-07-02) — 단일 HTML / Preact + Firebase RTDB
추출일: 2026-07-02

## 파일 구성

| 파일 | 내용 | 주요 함수/데이터 |
|---|---|---|
| 00_공통_인사마스터_요율_세액표_날짜피커.js | 임금항목 마스터, 4대보험 요율(연도별), 국세청 간이세액표, 사용자 정렬/통합 화면, 한국식 날짜피커 | PAY_CATEGORIES, INSURANCE_RATES, getInsuranceRates(), SIMPLIFIED_TAX_TABLE, calcSimplifiedTax(), sortUsers(), KoreanDatePicker |
| 01_근로자명부.js | 명부 메인 화면 + 등록/수정 모달 + 상세 + 근로계약서 관리 모달 + 인사기록카드(인쇄) | StaffRoster(), StaffRosterModal(), StaffRosterDetail(), EmploymentContractModal(), PersonnelCardModal() |
| 02_급여관리.js | 4대보험·소득세 계산 헬퍼 + 급여대장(정규직 매트릭스) + 급여명세서(개별) + 비정규직(일용/기타/사업소득) | PAYROLL_RATES_2026, calcDeductions 계열, PayrollManagement(), calcIrregularTax(), 비정규직 명세서 모달 |
| 03_근태관리.js | 근태 기록(연차/반차/시간연차/병가/지각·조퇴·결근/출장) + 보상휴가 가산율 헬퍼 | AttendanceManagement(), calcCompHoursForOT() |
| 04_휴가관리.js | 연차 자동부여(입사일 기준) + 사용/잔여 집계 + 휴직(출산/육아/병가/기타) + 보상휴가 탭 | LeaveManagement(), 잔여일수 통합 헬퍼, 휴직(LOA) 컴포넌트 |
| 05_퇴직정산.js | 퇴직금(평균임금) 자동 산정 + DC 적립금 엑셀 파서 + 정산 화면 | RetirementSettlement(), parseDCWide() |
| 06_증명서.js | 재직/경력증명서 발급 + 발급대장 | Certificate(), CertLog() |

## 데이터 저장 키 (Firebase RTDB / localStorage 미러)

- user_accounts — 직원 마스터 (sid, name, position, hireDate, leaveDate, status, branch, salary...)
- payroll_monthly — 월별 급여 [{sid, ym, baseSalary, allowances, deductions, netPay, status...}]
- attendance_records — 근태 [{id, date, sid, type, hours, note}]
- leave_grants — 연차 수동 오버라이드 {sid: {연도: {total, carryOver}}}
- leave_of_absence — 휴직
- irregular_payroll — 비정규직 급여
- retirement_* / dc_deposits — 퇴직정산·DC 적립금
- cert_log — 증명서 발급대장

## 이 조각들이 기대하는 외부 의존성 (새 앱에서 준비 필요)

1. 렌더링: `h` = React.createElement (Preact + preact/compat UMD), `useState/useRef/useEffect`
2. 저장소: `dbGet(key, fallback)` / `dbSet(key, value)` — 원본은 localStorage+Firebase RTDB 동기화 래퍼. 새 앱에서는 이 두 함수만 자기 저장소로 구현하면 대부분 동작
3. UI 공통: `showToast(msg)`, `popConfirm(msg)`(Promise), `useEscClose(fn)`, `useEnterSave(fn)`, 모달 CSS 클래스(.modal-bg/.modal/.modal-h/.modal-b/.modal-f/.btn-primary/.btn-secondary)
4. 포맷/날짜: `todayYMD()/todayYM()`, `localYMD()`, 콤마 포맷 헬퍼
5. 사용자 유틸: `getActiveUsers()`, `getAssignableUsers()`, `USERS_SEED` (원본 9459행 근처 — 한 줄짜리라 새 앱에서 직접 작성 권장)
6. 엑셀: XLSX (SheetJS UMD) — 급여/퇴직정산의 엑셀 가져오기·DC 파서에 필요
7. 성과급 연동부(급여관리 내 applyPerfOverride 등)는 ERP의 입금관리(finance_income)에 의존 — 급여아웃소싱에는 불필요하므로 해당 호출부 삭제 대상

## 재사용 시 주의

- 이 파일들은 실행 가능한 독립 앱이 아니라 원본에서 라인 단위로 잘라낸 검토용 조각입니다. 그대로 합쳐도 위 의존성이 없으면 동작하지 않습니다.
- 요율/세액표는 2026년 기준. 급여아웃소싱은 연도별 요율 테이블 구조(getInsuranceRates)를 그대로 가져가는 것을 권장.
- ERP 전용 개념(성과급, 지점 필터, 담당 노무사 마스킹)은 아웃소싱 앱에서는 "사업장(client) 단위" 개념으로 치환 필요 — 현재 구조는 '우리 직원' 1개 회사 전제.
