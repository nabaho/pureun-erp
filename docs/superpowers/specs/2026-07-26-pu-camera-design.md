# 푸른카메라 (pu-camera) 설계문서

- 작성일: 2026-07-26
- 대상: 명함 촬영 전용 웹앱(PWA), 명함첩(pu-cards)과 데이터 공유

## 1. 목적
직원·대표 누구나 스마트폰에서 명함을 빠르게 찍으면, 글자가 자동 인식되어
사무실 공유 명함첩(Firebase `pucards`)에 즉시 등록되는 **촬영 전용 앱**.
관리(목록·검색·폴더·자료보내기)는 기존 명함첩이 담당한다.

## 2. 사용자 / 역할
- **직원·대표(촬영자)**: 푸른카메라로 찍기·저장만. 전체 명함 목록은 보지 않음.
- **사무실(관리자)**: 기존 명함첩으로 정리·검색. 푸른카메라로 찍힌 명함이 자동 유입됨.

## 3. 배포 방식
- **PWA(웹앱)**. 앱스토어 미사용. 폰에서 주소 접속 → "홈 화면에 추가" → `푸른카메라` 아이콘.
- 자체 manifest(`pu-camera-manifest.json`)로 이름·아이콘·전체화면(standalone) 지정.
- 서비스워커(`pu-camera-sw.js`)로 설치 가능(오프라인 셸 최소).

## 4. 로그인
- 기존 명함첩과 동일하게 **포털 세션 공유**(Firebase Auth).
- 미로그인 시 "포털에서 로그인"(`enter.html`) 안내 화면. 로그인(이메일)되면 자동 진입.
- 구글 로그인은 v1 범위 밖(후속 확장 여지만 남김).

## 5. 화면 흐름
1. **카메라**: 전체화면, 명함 가이드틀. 하단 버튼 — 촬영 / 사진첩에서 고르기 / (설정).
2. **인식·확인**: 촬영/선택 이미지 → Gemini OCR로 이름·회사·부서·직책·휴대폰·직통·이메일·
   회사대표번호·회사팩스·회사주소·홈페이지·메모 자동 채움. 편집 가능한 확인 카드.
   - (선택) "뒷면 사진 추가".
3. **저장**: `저장` 누르면 명함첩과 동일 스키마로 `pucards/items/{id}` 기록 +
   원본사진 `pucards/photos/{id}`. 저장 후 다시 카메라 대기(연속 촬영).

## 6. 데이터 (명함첩과 동일 스키마 재사용)
- item: `{ id, kind:'card', group:'', thumb, createdAt, updatedAt, fav:false,
  name, company, dept, title, mobile, tel, email, fax, companyTel, companyFax,
  companyAddr, website, owner, address, memo,
  source:'pu-camera', capturedBy:<로그인 이메일/이름> }`
- 신규 필드 2개만 추가: `source`(등록수단), `capturedBy`(등록자). 명함첩은 이 값을
  읽어 "푸른카메라" 배지·등록자 표기에 활용(명함첩 변경은 후속, 데이터는 미리 남김).
- 사진: `shrink`(최대 1400px) 원본 + `makeThumb`(320px) 썸네일. 기존 함수 재사용.

## 7. 중복 처리
- 카메라 앱은 **전체 목록(5,710장)을 내려받지 않는다**(폰 부담·트래픽 회피) → 앱은 경량 유지.
- 따라서 자동 중복검사는 하지 않고, **중복 정리는 기존 명함첩의 중복정리 기능**에 맡긴다.
- 대신 등록 데이터에 `source:'pu-camera'`, `capturedBy`를 남겨 사무실이 유입 명함을 식별.

## 8. AI 키(Gemini) 편의
- 우선순위: ①로컬 `pucards_gemini_key` → ②Firebase 공유 `pucards/config/geminiKey`.
- 설정 화면에서 키 입력 시 로컬 저장, "모든 기기에 공유" 선택 시 공유 위치에도 저장.
- 키 없어도 **수동 입력 저장은 항상 가능**(OCR은 부가기능).

## 9. 재사용하는 기존 자산 (pu-cards.html)
- Firebase 설정/AppCheck, `DB_ROOT='pucards'`, Store.init/put/putPhoto 패턴
- `openCamera/camShot/afterShot`(가이드틀 크롭), `fileToImage/shrink/makeThumb`
- `aiExtract`(Gemini 2.0 flash) 프롬프트/호출
- 로그인 상태 전환(onAuthStateChanged) 패턴

## 10. 범위 밖 (YAGNI, v1 제외)
- 목록·검색·폴더·정렬·자료보내기·사업자등록증 탭
- 구글 연락처(주소록) 동기화 / 구글 로그인
- 대량 연속 스캔(여러 장 자동 분할)

## 11. 완료 기준
- 폰에서 주소 접속→홈화면 추가→아이콘 실행 시 전체화면 카메라.
- 명함 1장 촬영→자동입력→저장 시 사무실 명함첩 목록에 실시간 등장.
- 사진첩 기존 사진으로도 동일 동작. 미로그인 시 포털 로그인 유도.
