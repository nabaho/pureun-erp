# 문서관리 → 집단체불 계약서 전자송부 — 설계 문서 (v2)

- 작성일: 2026-07-21 (v2: 전체 코드베이스 스캔 반영 — 재사용 패턴·신분증 OCR·법적 검토 추가)
- 대상 시스템: 푸른노무법인 ERP(`nabaho/pureunall`, GitHub Pages + Firebase `pureun-erp`)
- 담당: 대표노무사(권형하) 요청

## 1. 목적 (무엇을 / 왜)

임금체불 **집단사건** 발생 시, 개별 근로자에게 **위임계약서(전자위임장)** 를 카톡/문자 링크로
송부하여 근로자가 휴대폰에서 직접 인적사항 입력·손서명 후 제출하게 하고, 노무사는 취합된
명단을 검토·관리하며 필요한 서류(위임장·연명부·개인정보동의서·체불/체당금 정리)를 일괄 생성한다.

기존 종이/엑셀 수집 방식을 대체하여, 다수 근로자의 위임장 수집을 온라인으로 처리한다.

## 2. 범위 (Scope)

포털(`enter.html`)에 **'문서관리'** 타일을 신설하고, 그 첫 기능으로 **'집단체불 계약서 전자송부'**
를 구현한다. 문서관리는 향후 다른 문서 기능으로 확장 가능한 상위 개념으로 둔다.

### 이번 범위에 포함
- 관리자 페이지(`docs-esign.html`, 로그인 필요): 사건 관리·제출 명단·검토·서류 생성
- 근로자 페이지(`sign.html`, 익명 인증, 모바일): 인적사항 입력·손서명·제출
- **신분증 촬영 자동입력(옵션)**: 온디바이스 OCR로 이름·주민번호 자동 채움, 사진은 즉시 폐기 (§7)
- 종단간 암호화(E2E): 주민번호 등 개인정보 평문은 서버에 저장하지 않음
- 서류 생성: 개인별 위임장 PDF, 진정인 연명부(엑셀), 개인정보동의서 PDF, 체불/체당금 정리(엑셀)
- `enter.html` `APPS` 배열에 타일 1개 추가

### 이번 범위에서 제외 (YAGNI)
- 공동인증서/공인전자서명 연동 (손서명 이미지로 갈음)
- SMS/카카오 API 자동 발송 (링크는 수동 카톡/문자 전송 + Web Share API; 이메일은 기존 Resend 옵션)
- 체불금액을 근로자가 직접 입력 (노무사가 관리화면에서 입력/엑셀 붙여넣기)
- 신분증 사진 원본 보관 (§7의 사건별 옵션 설계만 남기고 기본 미구현 — 노동청이 사본을 요구하는
  사건이 실제 발생하면 활성화)
- 진정서·CMS신청서 등 파생 서류 자동생성 (추후 문서관리 확장에서 검토)
- pu-erp 사건관리(cases)로의 자동 이관 (추후 — 기존 계약 '이관' 퍼널 패턴 참고)
- 진정취하서·위임철회 전자화 (추후)

## 3. 기존 시스템 제약·규칙 (반드시 준수)

- **스택**: 단일 HTML 파일 + 바닐라 JS(전역 함수), 프레임워크 없음. `css/pu-erp.css`, `js/utils.js` 재사용.
- **데이터**: Firebase 프로젝트 `pureun-erp` RTDB(asia-southeast1) 공유. 설정은 각 페이지에 인라인.
- **인증**: Firebase Auth. 사번→`<사번>@pureun.kr`. 관리자 페이지는 로그인 필수.
  근로자 페이지는 **익명 인증(`signInAnonymously`)** — `ieum-view.html:172` 패턴.
- **메일**: Firebase Functions `sendPayslip`(Resend, `payroll@fairrunlabor.com`, base64 첨부) 재사용.
  호출 패턴은 `pu-erp.html:50005` (`fetch` + JSON + `attachments:[{filename, content:b64}]`).
- **코딩 규칙**(CLAUDE.md): 한국어 주석, 노무 도메인 용어(직원→근로자, 급여→임금 등).
- **git**: push 전 `git pull --rebase origin main`. 실데이터(주민번호 등)는 저장소에 커밋 금지.
- 공용 유틸 사용: `showToast`, `customConfirm`, `numToKorMoney`, `copyToClipboard`, `localYMD`,
  `parseExcelPaste`, `showToastUndo` 등.

## 4. 기존 코드 재사용 맵 (v2 신규 — 전체 스캔 결과)

| 필요 기능 | 기존 자산 | 위치 | 재사용 방식 |
|---|---|---|---|
| **위임장 법적 문구** | 체당금 사건 양식 4종 `CASE_CHEDANG_FORMS`: 위임약정서-임금체불, 위임장, 개인정보제공동의서, 효성CMS 신청서 | `pu-erp.html:19946-19971` | 문구 원본으로 사용. `{{변수}}` 치환은 `fillContractVars` 패턴(`:20254`) 준용 |
| **PDF 생성(한글)** | 급여명세서 PDF: HTML 렌더 → html2canvas → jsPDF 이미지 삽입 (`buildPayslipPdfBase64`) | `pu-erp.html:49897-49992` | 동일 패턴. 폰트 임베드 불필요('맑은 고딕' 렌더 후 래스터화). 서명 이미지는 HTML에 `<img>`로 삽입 |
| **직인 자동 날인** | `applyStampHtml` + `getCompanyStamp()` (base64 직인 PNG) | `pu-erp.html:20487, :10250` | 위임계약서의 "푸른노무법인 (인)"에 직인 자동 삽입 |
| **무인증 공개 페이지** | 이음센터 공개 조회: 익명 인증 + 공개 노드 + `?k=토큰` 개인화 링크 | `ieum-view.html:72-181` | `sign.html`의 골격. 모바일 우선 CSS(max-width 480px, tap-highlight 제거)도 동일 |
| **클라이언트 암호화** | 신분증 보관함: PBKDF2-SHA256(150k) → AES-GCM 256, PIN 분실 시 복구 불가 경고 UX | `kcareer.html:3894-3963` | 사건 비밀번호 → 개인키 암호화에 동일 패턴. Web Crypto 네이티브(외부 라이브러리 없음) |
| **주민번호 마스킹** | `maskRRN`/`fmtRRN`, 민감값 자동 감지 정규식 | `pu-erp.html:863-896` | 관리 명단 화면에서 기본 마스킹 표시 |
| **신분증 OCR** | 3-tier OCR: Google Vision → Tesseract.js(kor+eng, 온디바이스) → Claude Vision. 신분증 파싱 프롬프트(주민번호 앞7자리 추출) 기존재 | `pu-erp.html:44605-44673`, `kcareer.html:3358-3424` | §7. 신분증은 **Tesseract(온디바이스)만** 사용 — 외부 API로 신분증 이미지 전송 금지 |
| **카메라 촬영** | `<input accept="image/*" capture="environment">` + `getUserMedia` 스트림 | `pu-cards.html:447, :1761` | 신분증 촬영 입력 |
| **엑셀 내보내기** | SheetJS `json_to_sheet`→`writeFile` | `pu-cards.html:2349-2352` | 연명부·체불정리 XLSX 생성 |
| **엑셀 서식 채움** | ExcelJS 4.4.0: 기존 서식 load → 값 채움 → writeBuffer (테두리·병합·수식 보존) | `fund.html:13, :610` | (선택) 기존 소액체당금청구서 .xlsx 서식에 직접 채울 때 |
| **링크 공유** | `copyLink`, Web Share API(`navigator.share`) — 카톡 공유 시트 호출 가능 | `pu-erp.html:38733`, `pu-cards.html:1647` | 사건 링크 공유 버튼 |
| **메일 발송** | `sendPayslipRow` fetch 패턴 | `pu-erp.html:49995-50014` | 링크 안내 메일(선택) |
| **위임장 HTML 서식 참고** | `docgen.py` `reg_proxy` 위임장(등기) — 빈 값 밑줄 처리 등 인쇄 서식 관례 | `fund-erp/docgen.py:414-426` | 문구·레이아웃 참고 |

**신규 개발이 필요한 것 (기존에 없음):** 손서명 canvas, QR 생성(qrcode CDN), RSA-OAEP 하이브리드
암호화(kcareer는 대칭키만 사용), RTDB `esign` 노드·보안 규칙.

## 5. 데이터 모델 (Firebase RTDB)

최상위 키 `esign/` 사용 (공개 접근 노드는 `ieum_public`처럼 `data/` 밖 최상위에 두는 기존 컨벤션).

```
esign/
  cases/
    {caseId}/
      meta/
        title            # "○○산업 임금체불(2026)"
        company          # 피진정인(회사명)
        respondent       # 피진정인 대표/주소 등
        ownerSid         # 담당 노무사 사번
        pubKey           # 사건 공개키 (JWK, 공개 정보)
        encPrivKey       # 사건 비밀번호로 암호화된 개인키 (base64) — 복구용
        linkToken        # 링크 추측 방지 토큰 (random 128bit, URL의 t= 값)
        createdAt
        status           # active | closed | purged
      submissions/
        {subId}/
          enc            # AES-GCM 암호문 (base64) — 근로자 입력 전체(서명 이미지 포함)
          encKey         # 사건 공개키로 감싼 AES 키 (base64)
          iv             # base64
          submittedAt    # 서버 타임스탬프 (평문, 개인정보 아님)
          reviewState    # (노무사가 갱신) pending | confirmed | hold
      arrears/           # 노무사가 나중에 입력하는 체불금액 (로그인 사용자 전용)
        {subId}/ ...
```

- 근로자 입력 원본(이름·주민번호·연락처·주소·계좌·서명이미지)은 **`enc`에만** 존재하며 평문 저장 없음.
- `submittedAt`, `reviewState` 등 비민감 메타만 평문.
- **RTDB 보안 규칙** (콘솔 게시 — 저장소에 rules 파일 없음, `fund-erp/STATUS.md` 관례에 따라
  STATUS/설계 문서에 기록):
  - `esign/cases/{caseId}/meta/pubKey`·`title`·`company`·`status`: 익명 인증 read 허용 (폼 표시용)
  - `esign/cases/{caseId}/submissions`: 익명 인증 **create만** 허용(read/update/delete 불가),
    `.validate`로 `linkToken` 일치·필드 크기 상한(서명 포함 ≤ 300KB) 검사
  - `meta/encPrivKey`·`arrears`·`reviewState` 쓰기: 로그인(정식 계정) 사용자만
  - 정확한 규칙 JSON은 구현 계획에서 확정 후 콘솔 게시

## 6. 종단간 암호화(E2E) 설계

- **키쌍**: 사건 생성 시 관리자 브라우저에서 RSA-OAEP(2048) 키쌍 생성(Web Crypto).
  - 공개키(JWK) → `meta/pubKey` 저장(공개).
  - 개인키 → 노무사가 정한 **사건 비밀번호**로 파생한 키(PBKDF2-SHA256 150,000회, AES-GCM —
    `kcareer.html:3894` 기존 파라미터와 동일)로 암호화 → `meta/encPrivKey` 저장.
- **근로자 제출(암호화)**: 폼이 `pubKey`를 읽어, 랜덤 AES-GCM 키로 입력 JSON을 암호화(`enc`,`iv`),
  그 AES 키를 공개키로 감싸(`encKey`) 함께 저장. (하이브리드 암호)
- **노무사 열람(복호화)**: 사건 비밀번호 입력 → `encPrivKey` 복호화로 개인키 복원 →
  각 제출의 `encKey`를 풀어 AES 키 획득 → `enc` 복호화. 전 과정 관리자 브라우저 내에서만.
- **트레이드오프**: 사건 비밀번호 분실 시 복구 불가 → (a) 생성 시 "PIN 분실 시 영구 복구 불가"
  경고 UX(kcareer 기존 문구 준용), (b) 사건 종료 시 서류 다운로드 보관 안내로 실무 보완.

## 7. 신분증 촬영 자동입력 (v2 신규 — 법적 검토 포함)

### 법적 근거·제약
- 개인정보보호법 **제24조의2**: 주민등록번호는 법령상 근거 있을 때만 처리 가능. 노무사의
  진정·대지급금(체당금) 대리 업무는 공인노무사법상 직무 수행으로 수집 근거 있음.
  단, 수집·이용 동의서에 처리 근거·목적·보유기간을 명시(기존 개인정보제공동의서 양식 활용).
- **신분증 이미지 보관은 고위험**(주민번호+얼굴사진+주소 결합): 최소수집 원칙상
  "필요 데이터만 추출, 사진 즉시 폐기"가 원칙.

### 설계: ①수동 입력(기본) + ②촬영 자동입력(옵션)
- 폼 상단에 **[📷 신분증 촬영으로 자동 입력]** 버튼(선택 사항).
  `<input accept="image/*" capture="environment">`로 촬영/선택.
- **OCR은 온디바이스 Tesseract.js(kor)만 사용** — 신분증 이미지는 어떤 외부 서버(Google Vision
  포함)로도 전송하지 않는다. 기존 `loadTesseract()` 지연 로드(~10MB 안내 문구) 재사용.
- 인식 결과(이름·주민번호·주소)를 폼 필드에 채우고 **근로자가 확인·수정** → 확인 후
  **사진과 canvas를 즉시 폐기**(변수 해제, 저장·전송 없음). UI에 "사진은 저장되지 않습니다" 명시.
- 인식 실패 시 조용히 수동 입력으로 폴백(오류로 흐름을 막지 않음).
- **(사건별 옵션, 기본 꺼짐) 신분증 사본 보관**: 노동청이 위임장에 신분증 사본 첨부를 요구하는
  사건에서만 노무사가 활성화. 활성 시 사진을 리사이즈 후 제출 데이터와 함께 **E2E 암호화**하여
  저장(별도 동의 문구 표시). 이번 구현에서는 UI 자리만 설계하고 실제 구현은 요구 발생 시.

## 8. 화면 설계

### 8.1 관리자 (`docs-esign.html`)
- 로그인 가드(미로그인 시 `enter.html`로, 기존 `?sso=1` 패턴).
- **사건 목록**: 카드/리스트. 각 카드에 진행률(제출 n명), 상태, 링크·QR 복사 버튼.
- **새 사건 만들기**: 회사명·피진정인·사건명 입력 → 사건 비밀번호 설정(분실 경고) → 키쌍 생성 →
  공유 링크(`sign.html?case={caseId}&t={linkToken}`)·QR 발급. 링크 공유는 복사 + `navigator.share`
  (카톡 공유 시트).
- **사건 상세**:
  - 사건 비밀번호 입력 → 복호화 세션 시작(세션 내 메모리만, 저장 안 함).
  - 제출 명단 테이블(순번·이름(복호화)·연락처·검토상태·제출일시). 주민번호는 기본 마스킹
    (`maskRRN`), 클릭 시 전체 표시.
  - 행 클릭 상세: 전체 인적사항 + 손서명 이미지 미리보기. 동일 주민번호 **중복 제출 감지 표시**.
  - 검토상태 토글(확인/보류), 삭제(`showToastUndo` 실행취소).
  - **체불내역 입력**: 근로자별 월별 임금·퇴직금·대지급금 입력 또는 엑셀 붙여넣기(`parseExcelPaste`).
  - **[서류 일괄 생성]**: §9의 4종 생성·다운로드.
  - **사건 종료·파기**: status→closed 후, 보유기간 경과 시 [제출 데이터 파기] 버튼(→purged,
    submissions 삭제). 개인정보보호법 파기 의무 대응.

### 8.2 근로자 (`sign.html?case=..&t=..`, 모바일)
1. 안내: 푸른노무법인 + 사건명(회사) 표시, 무엇에 대한 위임인지 설명(위임약정서 요지).
2. 인적사항: 이름·주민등록번호(**외국인등록번호 허용** — 형식 검증 분기)·연락처·주소·
   은행/계좌번호·입사일·퇴사일. 상단에 [📷 신분증 촬영으로 자동 입력](§7).
3. (체불내역은 받지 않음 — 노무사가 입력)
4. 개인정보 수집·이용 동의(필수 체크, 기존 개인정보제공동의서 문구) + 위임 내용 동의(위임약정서 문구).
5. 손서명: `<canvas>` 터치 서명(`touch-action:none`) → PNG data URL. 빈 서명 제출 방지(획 수 검사).
6. 제출: 입력 검증 → 브라우저에서 암호화 → RTDB `submissions` 기록 → **완료 화면에서 본인 제출본
   (위임장 양식+서명) PDF 저장 버튼 제공**(전자문서 사본 교부 관행, 클라이언트 생성이라 추가 비용 없음).
- 유효성: 주민/외국인등록번호 형식, 필수값, 서명 유무. 이미 제출한 기기(localStorage 플래그)엔
  재제출 확인 안내.

## 9. 서류 생성 (관리자 브라우저, 클라이언트)

| 서류 | 형식 | 방식 | 비고 |
|---|---|---|---|
| 개인별 위임장(위임약정서+위임장) | PDF(1인 1건) | HTML 렌더 → html2canvas → jsPDF (`buildPayslipPdfBase64` 패턴) | `CASE_CHEDANG_FORMS` 문구 + 서명 이미지 + 직인(`applyStampHtml`) |
| 진정인 연명부 | XLSX | SheetJS `json_to_sheet`→`writeFile` | 순번·이름·주민번호·연락처·주소·입퇴사일 |
| 개인정보 수집·이용 동의서 | PDF | 위임장과 동일 패턴 | 동의 일시·서명 포함 |
| 체불/체당금 정리 | XLSX | SheetJS 신규 생성(1차). 기존 청구서 서식 직접 채움은 ExcelJS로 추후 | 기존 소액체당금 엑셀 열 구조에 맞춤 |

- 한글 폰트: 임베드 불필요 — html2canvas 래스터화가 기존 검증된 패턴(`pu-erp.html:49896` 주석
  "한글 깨짐 없음"). pdf-lib+폰트 임베드(v1 안)는 폐기.
- 라이브러리 CDN: html2canvas 1.4.1, jsPDF 2.5.1, xlsx 0.18.5, qrcode — 기존 pu-erp와 동일 버전.

## 10. 링크 전달
- 사건 공유 링크·QR을 관리화면에서 생성 → 노무사가 **카톡/문자로 수동 전송**
  (복사 버튼 + `navigator.share`).
- 근로자 이메일을 아는 경우 기존 `sendPayslip`(Resend)로 링크 안내 메일 발송 옵션.

## 11. 컴포넌트 분해 (단일 책임)
- `sign.html`: 근로자 입력·서명·(옵션)신분증 OCR·암호화·제출. 익명 인증.
  의존: RTDB meta read, submissions create, `js/esign-crypto.js`.
- `docs-esign.html`: 관리자 UI(사건·명단·검토·체불입력·서류생성·파기).
  의존: Auth, RTDB, `js/esign-crypto.js`, `js/esign-docs.js`.
- `js/esign-crypto.js`(신규, 공용): 키쌍 생성, 하이브리드 암·복호화, PBKDF2 개인키 보호. 양쪽 공유.
- `js/esign-docs.js`(신규): 위임장/동의서 HTML 템플릿(기존 양식 문구), PDF·XLSX 생성 함수.
- `enter.html`: `APPS`에 `{ key:'docs', name:'문서관리', desc:'계약서 전자송부', icon:'📄',
  url:'docs-esign.html', roles:null }` 1줄 추가.

## 12. 에러 처리·엣지 케이스
- 잘못된/만료 링크(토큰 불일치, status≠active): 안내 후 종료.
- 오프라인/RTDB 쓰기 실패: 재시도 + 로컬 임시보관(localStorage) 후 재전송.
- 사건 비밀번호 오입력: 복호화 실패 명확 안내.
- 중복 제출: 서버는 암호문이라 비교 불가 → 관리 화면 복호화 후 동일 주민번호 중복 표시 +
  기기 localStorage 재제출 안내(1차 방어).
- 스팸/무작위 제출: linkToken 검증 + `.validate` 크기 상한 + 익명 인증 필수로 완화.
  대량 오염 시 노무사가 명단에서 일괄 보류/삭제.
- 서명 미입력/빈 canvas 제출 방지(획 카운트).
- OCR 인식 실패/저품질 사진: 수동 입력 폴백, 흐름 차단 없음.

## 13. 테스트 관점
- 암호화 라운드트립: 근로자 입력 → 암호화 → 복호화 결과 일치.
- 개인키 비밀번호 오입력 시 복호화 실패.
- 서류 생성물의 필드 매핑 정확성(이름·주민번호·금액·서명·직인 위치).
- RTDB 규칙: 익명으로 submissions read 시도 → 거부, create → 허용, encPrivKey read → 거부 검증.
- 모바일 서명 canvas 터치 동작(iOS Safari·안드로이드 크롬).
- 신분증 OCR: 인식 후 사진 객체 폐기 확인(메모리·스토리지에 잔존 없음), 외부 네트워크 요청 없음 확인.
- 외국인등록번호 형식 검증 분기.

## 14. 구현 계획에서 확정할 사항
- RTDB 보안 규칙 정확한 JSON(콘솔 게시 절차 포함).
- ~~위임장 법적 문구~~ → **해결: `CASE_CHEDANG_FORMS` 기존 4종 양식 문구 사용** (노무사 최종 검토만).
- ~~링크 토큰 필요 여부~~ → **해결: `linkToken`(random 128bit) 채택**.
- ~~한글 폰트 임베드~~ → **해결: html2canvas 래스터화 패턴 채택**.
- 체불/체당금 XLSX의 정확한 열 구조(기존 `2.진정자-집단위임장-체불신청서-소액체당금지급청구서.xlsm` 대조).
- 개인정보 보유기간 문구(동의서)와 파기 시점 기본값.
