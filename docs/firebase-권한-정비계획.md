# Firebase 권한 정비 계획

작성일: 2026-07-30  
상태: 코드 전환 진행 중 · 운영 규칙 미게시

## 목표

1. 로그인 여부만 확인하는 광범위한 쓰기 권한을 역할별 권한으로 좁힌다.
2. 개인 설정과 알림은 이메일 문자열이 아니라 Firebase Authentication UID로 분리한다.
3. 기존 사용자 데이터가 사라지지 않도록 구 경로를 읽어 새 경로로 자동 이전한다.
4. 모든 계정의 `uid_roles` 등록과 역할별 시뮬레이션이 끝난 뒤 운영 규칙을 게시한다.

## 확인된 주요 데이터 영역

| 영역 | 주요 경로 | 현재 상태 | 목표 권한 |
|---|---|---|---|
| 재무·급여 | `data/finance_*`, `data/payroll_*`, `data/funds` 등 | `fin` 권한 적용 | 현행 유지, `fin` 자가부여 방지 유지 |
| 직원 명부 | `data/user_dir`, `data/user_accounts` | 공개용/민감용 분리 | 공개 명부는 로그인 사용자 읽기, 수정은 관리자·위임관리인 |
| 포털 개인 설정 | `data/portal_prefs` | 이메일 키, 로그인 사용자 전체 쓰기 | `data/portal_prefs_uid/{uid}`, 본인만 읽기·쓰기 |
| 건의 원문 | `data/suggestions` | 로그인 사용자 전체 쓰기 | 작성자는 신규 등록만, 상태·답변 수정은 관리자만 |
| 건의 요약 | `data/sg_meta` | 로그인 사용자 전체 쓰기 | 신규 등록은 작성자, 수정은 관리자만 |
| 해결 알림 | `data/sg_resolved` | 이메일 키, 로그인 사용자 전체 쓰기 | `data/sg_resolved_uid/{uid}`, 본인 읽기·확인 및 관리자 처리 |
| 서버 백업 | `serverBackups*` | 로그인 사용자 쓰기 | 관리자·위임관리인만 읽기·쓰기 |
| 업무관리 | `work_erp` | 로그인 사용자 전체 읽기·쓰기 | 업무 담당 범위 확정 후 세분화 |
| 컨설팅 | `scal_*` | 로그인 사용자 전체 읽기·쓰기 | 컨설팅 담당 범위 확정 후 세분화 |
| 기금 | `fund_erp` | 로그인 사용자 전체 읽기·쓰기 | 기금 담당 범위 확정 후 세분화 |
| 명함·업체 | `pucards`, `companies` | 로그인 사용자 전체 읽기·쓰기 | 사내 공용 유지 여부 확인 후 삭제 권한 우선 제한 |
| 취업규칙 | `rules_mgmt`, `chwieop` | 일부 소유자 규칙 적용 | 소유자·관리자 기준 유지 및 빈 경로 보강 |

## `data` 내부 동적 저장 키

푸른이알피는 아래 키를 `data/{키}` 형태로 동적으로 동기화한다. 따라서 현재의
`data/$other` 허용을 바로 제거하면 업무가 중단될 수 있다.

- 계약·사건·컨설팅: `contracts`, `cases`, `consultings`, `other_projects`, `biz_cases`
- 업체·인사: `companies`, `company_info`, `user_accounts`, `user_dir`, `external_staff`
- 근태·휴가: `attendance_records`, `my_schedules`, `leave_grants`, `leave_of_absence`,
  `leave_ledger`, `overtime_records`, `special_leave_grants`, `comp_leave_records`
- 재무·급여: `finance_income`, `finance_expense`, `finance_invoice`, `payroll_monthly`,
  `payroll_irregular`, `funds`, `mgr_rates`, `pay_items`, `dc_contributions`,
  `retirement_settlements`, `recurring_expenses`, `expense_budget`, `finance_bank_fee`
- 정책·환경설정: `policy_*`, `security_perms`, `app_settings`, `insurance_rates`,
  `withholding_brackets`, `holidays`, `min_wage` 등

각 키의 실제 담당 역할을 확정하기 전까지는 `data/$other`를 유지하고, 포털 관련
고위험 경로를 명시 규칙으로 먼저 분리한다. 마지막 단계에서 전체 키를 허용 목록으로
전환한다.

## 단계별 게시 순서

1. 포털 코드의 UID 경로 전환 배포
2. 직원들이 로그인하면서 기존 설정·알림을 UID 경로로 자동 이전
3. 모든 Authentication UID가 `uid_roles`에 등록됐는지 확인
4. 포털 개인 설정·건의함·백업 경로의 명시 규칙 게시
5. 일반 직원·재무 담당자·관리자 계정으로 회귀 테스트
6. 업무관리·컨설팅·기금 담당 범위를 확정해 역할 규칙 게시
7. 마지막으로 `data/$other`를 기본 거부로 전환

## 게시 전 필수 확인

- 현재 Firebase 규칙 전체 백업
- 관리자, 위임관리인, 재무 담당자, 일반 직원 테스트 계정 확보
- `uid_roles`에서 권한 필드 자가부여가 모두 차단되는지 확인
- 포털 타일 순서와 자동 바로가기 설정이 다른 기기에서도 유지되는지 확인
- 건의 등록, 관리자 답변, 사용자 해결 알림 확인이 정상인지 확인
- 서버 일간·수시·저녁 백업이 관리자 계정에서 정상 생성되는지 확인

