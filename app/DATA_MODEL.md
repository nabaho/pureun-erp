# 급여 아웃소싱 — 데이터 모델 & 3단계 구조 (초안)

> 설계 원칙: **하나의 앱, 하나의 창고(DB)**. 사업장별로 앱·DB를 쪼개지 않고,
> DB 안에서 **사업장 칸막이(clients/{사업장})** + 서버 보안규칙으로 격리.

## 저장 구조 (Firebase RTDB, 서울 asia-northeast3)

```
roles/{uid}                    = "admin" | "staff"
acl/{사업장}/staff/{uid}        = true            # 담당자
acl/{사업장}/deputy/{uid}       = true            # 부담당
acl/{사업장}/delegate/{uid}     = { until: ts }   # 위임기간 대행

clients/{사업장}/
  card                         = 설정 카드(급여일·산정기간·단수처리·공제항목…)  ← 담당자 수정 대상
  payroll_monthly/{YYYY-MM}/   = 월별 급여 [{성명, 지급, 공제, 실수령, locked, ...}]
  attendance/{YYYY-MM}/        = 근태
  corrections/{id}            = 소급 정정(원본월 참조+방식+사유+승인자) ← 불변+버전체인
  inbox/{id}                  = 수신 자료(자동태깅·상태)

audit/{log}                    = 감사로그(추가만, 수정·삭제 금지)
```

## 보안 (firebase.rules.json 초안 — 설계 보안 7겹 중 ④DB규칙 서버강제)

- **읽기·쓰기 = 배정자만**: 담당자 ∨ 부담당 ∨ 위임기간 내 대행 ∨ 관리자
- **확정월 잠금(D4)**: `locked` 걸린 월은 관리자만(소급 정정 절차로만) 수정
- **감사로그**: append-only (한번 쓰면 수정·삭제 불가)
- 나머지 경로 기본 차단(deny by default)

## 개발 / 운영 분리 (3-5, 설계 D5 첫 규칙)

- **환경 네임스페이스**: 키 앞에 `pu:dev:` / `pu:prod:` (앱 골격에 적용됨).
  Firebase 전환 시 별도 프로젝트(dev/prod) 또는 최상위 노드 분리.
- **테스트 띠**: DEV 환경은 화면 상단에 경고 띠 표시 → 실데이터 오염 방지.
- `?env=prod` 파라미터로만 운영 접근.

## dbGet/dbSet 교체 계획 (로컬 → 서버)

현재 `app/payroll_app.html`의 `dbGet/dbSet`은 localStorage 구현.
**서버 전환 = 이 두 함수 내부만 Firebase RTDB 호출로 교체** (pu-erp와 동일 방식).
화면·로직은 그대로 → 위험 최소.

## 권한 2단계 (3-2, 로그인 스텁 → 구글 OAuth)

- 현재: 앱 골격의 역할 선택(담당자/관리자) = 스텁
- 전환: 구글 로그인 + `roles/{uid}` 조회 → 담당자는 `acl`로 배정 사업장만
- 이관(안1): 직원 요청 → 관리자 승인 → acl 이전 + 인계 패키지
- 부재: `delegate/{uid}/until` 기간 위임

## 대표님 준비 필요 (제가 못 하는 것 — 계정·보안)

1. Firebase 프로젝트 생성(서울 리전) + dev/prod 분리
2. 구글 OAuth(로그인) 설정
3. 법인 메일 도메인(수신함 웹훅용)
4. 배포 인증(GitHub Pages / Firebase Hosting)

→ 준비되면 `dbGet/dbSet` 교체 + 규칙 업로드 + 로그인 연결로 서버화.
