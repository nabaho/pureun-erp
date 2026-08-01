# kcareer 실적관리 재설계 — pu-erp 동기화 + 내·외부 실적 분리

- 작성일: 2026-08-01
- 대상 앱: `kcareer.html` (푸른노무법인 경력관리)
- 선행 작업: 2026-07-31 서류 일괄등록(로컬 폴더 참조) — 같은 패턴(순수 모듈 + node 테스트 + 미리보기 + 되돌리기)을 따른다

## 1. 목표

pu-erp의 종료된 업무(사건·컨설팅·기금·기타)를 담당노무사와 함께 kcareer 실적으로
**자동 동기화**하고, 실적을 두 종류로 나누어 관리한다:

| 종류 | 정의 | 용도 |
|---|---|---|
| **푸른 자체 실적** | 푸른노무법인 이름으로 직접 수행 (수행기관 없음) | 푸른노무법인 명의 실적·경력증명서 발급 |
| **외부기관 실적** | 외부 컨설팅기관(경제진흥원·능률협회 등)을 통해 수행 | 그 기관이 실적증명·경력증명서를 발급 — 기관별로 묶어 관리 |

## 2. 확정 결정 (사용자)

1. **자동 동기화 우선** — 종료 건은 전부 들어오고, 불필요한 건은 본인(대표) 또는 담당자가 **배제**로 정리
2. 내·외부 구분은 **수행기관(`agency`) 필드로 자동** — 있으면 외부, 없으면 내부
3. 화면은 **탭 2개로 분리** — 기존 실적 탭들(내부) + 외부기관 실적 탭(신설)
4. 동기화 대상은 **4종 전부** (cases·consultings·funds·other_projects)
5. **종료·완료된 건만** 자동으로 들어온다 (진행 중 건은 종료되면 다음 동기화 때)

## 3. 현황 (2026-08-01 실측)

- kcareer에는 이미 pu-erp **보기 전용** 연동이 있다: `PU_COLLS`(4696행 부근)가
  `data/{consultings,cases,funds,other_projects}`를 읽어 주담당별로 묶어 각 실적 페이지의
  참고 박스에 표시하고 localStorage에 캐시한다. **레코드는 만들지 않는다.**
- kcareer 실적 스토어: `case`·`consult`·`fund`·`etc` (+ `lecture`는 동기화 대상 아님).
  `consult` 79건에는 이미 `agency` 필드가 있다(예: `한국능률협회`, `충남경제진흥원`) —
  내·외부가 한 목록에 섞여 있는 것이 현재 문제다.
- 주담당 판별 `_puMainMgr`: `managerMain` → 없으면 `workers`의 `isPrimary` → 첫 번째.
  sid→이름 변환은 `_puUserMap`.
- pu-erp의 상태값은 혼재한다: `status:'closed'`(6곳)·`'done'`(3곳)·`closedDate`(79곳) 등.
  UI 상태(`active`·`saving` 등)와 레코드 상태가 같은 필드명을 쓰므로 **판별 함수를 하나로 못 박는다**(§5).

## 4. 데이터 모델 — 새 스토어를 만들지 않는다

기존 4개 스토어에 동기화 꼬리표만 추가한다. 기존 레코드·시드는 변경하지 않는다.

```js
{
  ...기존 필드 (type, org, project, year, main, sub, agency, status, note ...),
  puRef: 'cases/-Nx3kAbC',    // pu-erp 컬렉션/키 — 중복 유입 방지의 열쇠 (유일키)
  src: 'pu',                  // pu-erp에서 왔다는 표시 (수동 등록과 구분)
  syncId: 'PS20260801-1234',  // 이번 동기화 묶음 — 되돌리기 단위
  excluded: false             // 배제 = 숨김. 삭제하면 다음 동기화 때 되살아나므로 금지
}
```

- **배제는 삭제가 아니다.** `excluded:true`로 두어야 (a) 재동기화 때 puRef가 남아 다시 안 들어오고
  (b) 복원이 가능하다. 목록·증명서 발급·중복검사에서 `excluded`는 걸러낸다.
- 내·외부 판별은 저장하지 않고 **표시할 때 계산**한다: `agency`가 비면 내부, 있으면 외부.
  건별로 수행기관을 채우면 그 순간 외부기관 탭으로 넘어간다(데이터 이동 없음).

### 필드 매핑 (pu-erp → kcareer)

| pu-erp | case | consult | fund | etc |
|---|---|---|---|---|
| 유형 | `caseType` | `consultingType`\|`programName` | `fundType`\|`programName` | `programName`\|`projectType` |
| 기관/고객 | `companyName` | `companyName` | `companyName` | `companyName`\|`payee` |
| 내용 | `title`\|`caseNo` | `title`\|`programName` | `title` | `title` |
| 연도 | `closedDate`\|`endDate` 앞 4자리 | 〃 | 〃 | 〃 |
| 담당 | `_puMainMgr` → 이름 | 〃 | 〃 | 〃 |
| 상태 | `'완료'` 고정 | 〃 | 〃 | 〃 |

`agency`는 pu-erp에 대응 필드가 없으므로 **비워서 들어온다(= 내부)**. 외부기관 건은
사용자가 건별로 수행기관을 채워 옮긴다.

## 5. 종료 판별 — 순수 함수로 못 박는다

```js
/* js/kcareer-pusync.js */
function isClosed(c){
  if(!c) return false;
  if(c.closedDate) return true;                          // 종료일이 있으면 종료
  var s = String(c.status||'').toLowerCase();
  return s==='closed' || s==='done' || s==='완료' || s==='종료';
}
```

`active`·`open`·`progress`·`pending`·`draft`·`idle` 등은 전부 미종료다.
⚠ `endDate`만 있는 건은 **종료가 아니다** — 예정일일 수 있다(기존 `_puItemFields`가
`endDate`를 "(예정)"으로 표시하는 것과 같은 해석).

## 6. 동기화 흐름

```
로그인 → (하루 1회 자동) data/* 4종 읽기
  → isClosed()로 종료 건만
  → puRef 이미 있으면 건너뜀 (excluded 포함)
  → 첫 실행이면: 미리보기 모달 (컬렉션별 유입 수 · 내부/외부 나뉨) → [등록] 눌러야 저장
  → 이후 자동 실행: 조용히 추가 + "실적 N건 새로 들어옴" 토스트
  → syncId 부여, 마지막 동기화 시각 저장
```

- 자동 1회/일: `LS 'pu_sync_last'`(ISO 날짜)로 판단. 수동 "지금 동기화" 버튼은 언제나 가능.
- **추가만 한다.** 기존 레코드를 덮어쓰지 않는다(수동 수정 보존). pu-erp에서 이후 내용이
  바뀌어도 kcareer 스냅샷은 고정 — 증명서는 발급 시점 사실이어야 하기 때문.
- 레코드에서 "pu-erp 원본 보기" = puRef로 `data/{coll}/{key}`를 그 자리에서 읽어
  **읽기 전용 팝업**으로 현재 값을 보여준다(pu-erp 화면 딥링크는 없으므로 값 조회로 확정).
- 순수 로직(종료 판별·필드 매핑·중복 병합·미리보기 집계)은 `js/kcareer-pusync.js`
  (브라우저 `window.KcareerPuSync` / Node `module.exports` 겸용, DOM·Firebase 미사용)로 분리하고
  `tests/kcareer-pusync.test.js`로 검증한다. Firebase 읽기·저장·UI는 kcareer.html에 둔다.

## 7. 화면

```
실적관리
├─ 사건실적 · 컨설팅실적 · 기금실적 · 기타실적   ← 푸른 자체 실적 (agency 없는 것만 표시)
├─ 강의실적                                    ← 그대로 (동기화 무관)
├─ 🏛 외부기관 실적                             ★ 신설 — agency 있는 것 전부, 기관별 묶음
└─ 제출서류                                    ← 그대로
```

- 기존 4개 탭의 목록 필터에 `!r.agency && !r.excluded` 조건이 추가된다.
  **컨설팅실적 79건 중 agency가 있는 건은 외부기관 탭으로 옮겨 보인다**(데이터 이동 없음).
- 신설 `page-puagency`(외부기관 실적): 4개 스토어를 합쳐 `agency`별 그룹.
  그룹 헤더 = `기관명 (N건 · 연도범위)`. 펼치면 실적 행(유형·고객사·내용·담당·연도).
- `src:'pu'` 행에는 `pu` 배지. 각 행에 **배제** 버튼(excluded=true).
  각 탭 하단에 "배제된 건 N개" 접이식 구역 — **복원** 버튼.
- 배제 권한: 대표(isAdmin)는 전체, 담당자는 `main`이 본인 이름인 건만
  (기존 `applyPerfAccess`/`_me` 구조 재사용).

### 기관별 증명서 연결 (외부기관 탭)

기관 그룹 안에 **"이 기관이 발급한 증명서"** 줄을 자동으로 붙인다:
`certdoc` 스토어(경력증명서 보관 — 스캔으로 실적증명서들이 들어가 있음)에서
`org`(발급기관)가 기관명과 부분일치하는 레코드를 찾아 나열하고, 각각 원본 열기
(`openOriginal` — base64·로컬 경로 모두 지원, 이미 구현됨)를 단다.
자동 매칭이 놓친 것은 "증명서 연결" 버튼으로 certdoc 목록에서 골라 `agencyKey`를 손으로 붙인다.

## 8. 안전장치 · 검증

1. **첫 동기화는 미리보기 → [등록]** (위촉장 스캔과 동일한 저장 전 확인).
2. **`syncId` 단위 되돌리기** — "이번 동기화 되돌리기"는 그 동기화가 만든 레코드를
   통째로 지운다(그중 배제해 둔 것도 포함). 다음 동기화 때 처음처럼 다시 들어온다.
   수동 등록 레코드와 다른 syncId 레코드는 건드리지 않는다.
3. 동기화는 `set()` 스토어별 단일 쓰기(일괄등록 때 확립한 규칙 — 반복 쓰기 금지).
4. node 테스트(신규 `tests/kcareer-pusync.test.js`):
   - `isClosed`: closedDate·closed·done·완료 → true / active·endDate만 → false
   - 필드 매핑: 4종 각각 대표 케이스
   - 병합: puRef 중복 건너뜀 · excluded 유지 · 기존 레코드 불변
   - 미리보기 집계: 컬렉션별 수 · 내부/외부 나뉨
5. HTML 정적 테스트(`tests/kcareer-html.test.js`에 추가):
   - 기존 4개 탭 필터에 excluded·agency 제외가 들어갔는지
   - 동기화 함수가 반복문 안에서 `set()`을 부르지 않는지
   - 신설 탭·NAV 항목 존재
6. 실데이터 검증: 첫 미리보기 모달의 컬렉션별 숫자를 pu-erp 화면의 종료 건수와 눈으로 대조.

## 9. 범위 밖 (이번에 하지 않는 것)

- pu-erp 쪽 코드 수정 (kcareer는 `data/`를 읽기만)
- 양방향 동기화·자동 갱신 (kcareer 스냅샷은 고정, 원본 보기 링크만)
- 진행 중 건 유입 (종료되면 자동으로 들어옴)
- 강의실적(`lecture`) 동기화 (pu-erp에 대응 컬렉션 없음)
- 외부기관 연락처·담당자 관리 (기관 그룹은 실적·증명서 묶음까지만 — 필요해지면 별도 설계)
- 배제 이력 감사로그

## 10. 가정

- pu-erp `data/` 읽기 권한은 현 보안규칙에서 로그인 사용자에게 허용돼 있다
  (기존 `loadPuPerf`가 이미 같은 경로를 읽고 있으므로 성립).
- `uid_roles` 기반 권한 판별(2026-07-31 `e4ccdf0`)이 배포돼 있어 대표는 isAdmin으로 인식된다.
