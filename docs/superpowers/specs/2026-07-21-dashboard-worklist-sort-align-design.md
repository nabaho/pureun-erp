# 법인 대시보드 진행 항목 — 정렬·열 정렬 개선

날짜: 2026-07-21
대상: `pu-erp.html` — `renderSection()` (약 37205행), 우측 "법인 전체 진행 항목" 패널

## 문제
- 각 섹션(계약·사건·컨설팅·기금·기타) 안에서 항목 **정렬이 없어** 같은 유형이 섞여 있음.
- 행이 `flex` 레이아웃이라 제목 너비에 따라 **유형 배지·담당자정보·담당자 위치가 항목마다 어긋남**.

## 해결
### 1. 정렬 (유형 → 업체명순)
`renderSection` 내부에서 필터링된 항목을 정렬한다.
- 1차 키: 유형(`_sectionType`) — 유형 없는 항목은 뒤로.
- 2차 키: 표시 제목(`it[titleKey] || title || companyName || name`).
- 비교: `localeCompare('ko', {numeric:true})` (기존 호수 정렬과 동일 규칙).

유형 추출 `_sectionType(it, menuId)`:
- `biz/contract` → `contractType`
- `biz/case` → `_typeLabel()` || `caseType`
- `biz/consulting` → `_typeLabel()` || `consultingType`
- `biz/fund` → `fundType`
- `biz/other` → `projectType`

### 2. 고정 열 (grid)
행을 `display:grid`로 바꾸고 5개 열을 고정한다:
`제목(140px) · 유형(82px) · 의뢰인(70px) · 담당자정보(1fr) · 담당자(130px)`
- 모든 행에 5개 셀을 항상 렌더(배지 없으면 빈 `span`)해 세로 정렬 유지.
- 배지는 `justifySelf:start` + `inline-block` + `max-width:100%` + ellipsis → 알약 모양 유지하며 열 왼쪽에 정렬.
- 유형은 이제 배지 열로 이동하므로 `line1Parts`(담당자정보 줄)에서는 유형을 뺀다. 업체명(제목과 다를 때)·날짜는 담당자정보 열에 유지.
- 담당자정보 없으면 열은 유지하고 "담당자정보 미입력" 안내문 표시.

## 범위 밖
- 좌측 직원 비교 표는 변경하지 않음.
- 모바일 전용 레이아웃 분기는 추가하지 않음(데스크톱 기준; truncation으로 넘침 방지).
