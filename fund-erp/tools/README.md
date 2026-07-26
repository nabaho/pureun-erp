# 서식 변환기 (HWP → fund_forms.js)

`fund.html`의 생성 서식은 **03_과거자료 원본 .hwp를 실제로 변환**한 것이다.
손으로 쓴 근사본이 아니라 원본의 문단·표 격자·칸 너비를 그대로 옮긴다.

## 왜 이게 있나
이전에는 `docBody()`가 사람이 눈대중으로 작성한 초안이라 폴더의 진짜 서식과 문구·표가 달랐다.
(예: 설립합의서 실제=「○○주식회사…임시 노사협의회」+서명란 4개 ↔ 초안=제1~4조 창작)
2026-07-26에 원본 파싱으로 교체했다.

## 실행
```bash
python fund-erp/tools/build_forms.py       # → pureunall/fund_forms.js 생성
```
- 원본 경로는 `build_forms.py` 상단 `B1` 상수(로컬 `03_과거자료\설립관련과거자료\...`).
  **원본 .hwp는 저장소에 없다**(로컬 전용). 다른 PC에서 재생성하려면 그 폴더가 있어야 한다.
- 생성물 `fund_forms.js`(window.HWP_FORMS)만 저장소에 커밋한다. 빈 양식이라 실데이터 없음
  (스크립트가 실제 회사·기금명 혼입을 자동 검사해 경고한다).

## 변환 범위 (현재 7종)
inka(별지 제7호) · agreement · charter(공동) · charter_sane(사내) · minutes · contrib · bizplan

나머지 24종(등기·고유번호증·운영·지원금·인센티브)은 아직 옛 초안(docBody 폴백).
`build_forms.py`의 FORMS 배열에 `(키, 이름, 경로)`를 추가하면 같은 방식으로 확장된다.

## 구현 메모 (hwp2html.py)
- HWP 5.0 = OLE2 복합문서. `BodyText/Section*` 스트림을 zlib(-15)로 풀고 레코드 트리를 순회.
- 태그: PARA_TEXT=67, LIST_HEADER(셀)=72, TABLE=77. 레코드 헤더에 level(10bit)이 있다.
- **주의 1**: LIST_HEADER·PARA_HEADER는 TABLE과 **같은 레벨**이다. 표를 닫을 때
  `level <= top`으로 하면 첫 셀에서 바로 닫혀버린다 → 일반 레코드는 `<`, 새 TABLE만 `<=`.
- **주의 2**: 처리절차표처럼 **표 안에 표**가 있다(별지7호는 lvl2 표 안에 lvl4 표).
  중첩을 형제로 빼면 순서가 뒤집힌다 → 닫을 때 부모 셀(`pcell`)로 되돌려 넣는다.
- **주의 3**: 셀 레코드 오프셋 — col/row/colspan/rowspan은 8, width/height는 16 (HWPUNIT=1/7200inch).
  이 width로 `<colgroup>` 열 폭을 복원해야 칸이 원본 비율로 나온다(안 하면 균등폭이라 글자가 세로로 깨짐).
