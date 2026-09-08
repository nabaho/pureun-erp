# AGENTS.md — 이 저장소에서 일하는 에이전트가 «먼저» 읽는 것

푸른노무법인 ERP. 빌드 단계가 없는 **순수 HTML/JS 앱 열아홉 개**를
GitHub Pages 로 배포하고, 뒤는 Firebase(RTDB·Functions)가 받는다.

- **자세한 규칙과 그 «까닭»은 `CLAUDE.md` 에 있다.** 이 파일은 그 요약이자,
  Codex·Copilot 처럼 `CLAUDE.md` 를 안 읽는 도구를 위한 같은 내용의 문이다.
- 두 파일이 어긋나면 **`CLAUDE.md` 가 이긴다.** 고칠 때는 둘 다 고친다.
- **한국어로 쓴다** — 주석·커밋·검사 이름·화면 글자 전부. 노무 용어를 지킨다
  (급여→임금, 직원→근로자).

---

## ★ 어기면 되돌려지는 것 여섯

### ① 검사는 「지금 값」이 아니라 「규칙」을 박는다
`maxHeight:'calc(100vh - 340px)'` 가 아니라 «높이 한도가 있는가»,
`boxes.length === 2` 가 아니라 `>= 2` 를 본다.
값 자체가 규칙일 때(세율 8.8%, 지급액 820,800원)만 박고, 같은 줄에
`검사고정-허용` 과 **왜 규칙인지**를 적는다.
→ `tests/test-pin-guard.test.js` 가 기계로 막는다.

### ② 표의 한 칸은 «한 줄»이다
자리가 넓으면 절대 두 줄로 쌓지 않는다. 빈 값은 아예 안 그린다
(`erpNoteWorth`). 한 줄이 두 줄이 되면 300줄짜리 표가 두 배로 길어진다.
→ `tests/one-line-cells.test.js`

### ③ 파이어베이스 규칙은 «만들개»에서 고친다
`scripts/make-firebase-rules.js` 를 고치고 다시 만든다. JSON 을 손으로 고치면
다음에 만들 때 조용히 사라진다. 올리는 것은 `node scripts/rules-deploy.js --deploy` 다
(살아 있는 콘솔을 읽어 견주고, 사라질 규칙이 있으면 멈춘다).
→ `tests/firebase-rules-apply.test.js`

**창고(Storage) 규칙은 딴 길이다** (2026-09-08) — `docs/firebase-storage-전체(붙여넣기용).txt`
하나를 고치고 `node scripts/storage-rules-deploy.js --deploy` 로 창고 «세 곳»에 올린다.
- ⚠ 창고 규칙은 **CLI 로 읽을 수 없어** 기준이 「대표님이 옮겨 주신 파일」이다
  (`docs/firebase-storage-콘솔원문-YYYY-MM-DD.txt` 중 최신) — 실시간DB 보다 «약한» 안전장치다.
- ⚠ **루트 `firebase.json` 에 `storage`·`database` 를 넣지 말 것** — 넣으면 다른 세션이
  그냥 `firebase deploy` 할 때 규칙이 함께 나간다. 올리개가 임시 설정을 만들어 쓴다.
- ⚠ `--force` 같은 빠져나가는 길을 만들지 말 것 — 그 멈춤 하나가 창고의 안전장치 전부다.
→ `tests/storage-rules-deploy.test.js`

### ④ 색은 5계열 27색 팔레트 안에서 고른다
새 색을 만들지 않는다. 일부러 넣어야 하면 `tests/color-palette-apps.test.js`
의 `EXCEPT` 에 **까닭과 함께** 적는다.

### ⑤ 새 프로그램·자료는 온톨로지에 먼저 등록한다
`js/pu-ontology.js` 의 `PROGRAMS`·`READ_ADAPTERS`·`TERMS`.
사람은 `sid`, 업체는 `companyId`, 각 업무는 영구 `id` 로 잇는다 —
**이름을 열쇠로 쓰지 않는다.** 민감 자료는 억지로 열지 말고
`strategy:'in_app'` 으로 선언한다.
새 화면은 `js/pu-ontology-write.js`를 싣고 `PROGRAMS.writeContracts`에 저장 경로와
개체 종류를 적는다. 2026-09-06 이전 운영 앱만 관찰 유예를 받으며, 새 앱은 선언을
빼거나 `data-mode="observe"`를 적어도 기본 강제다. 구조 변경은 새 `schemaVersion`을
추가해 한 판 전을 함께 읽고, 이관 완료 뒤 옛 판 쓰기를 닫는다. 물리 삭제 대신
삭제 표식, 동시 수정은 `revision` 트랜잭션을 쓴다.
→ `tests/ontology-contract.test.js` · `tests/ontology-write-gate.test.js`

### ⑥ `.js` 를 고쳤으면 부르는 쪽의 `?v=` 를 올린다
안 올리면 브라우저가 옛 파일을 계속 쓴다 — **고쳤는데 안 고쳐진다.**
→ `scripts/check-cache-version.js` (`git config core.hooksPath .githooks` 로 켠다)

---

## 반드시 돌리는 것

```bash
node --test tests/*.test.js      # 11,400개 넘는다. 하나라도 깨지면 배포가 멈춘다
```

검사가 깨지면 **검사를 지우지 말고** 무엇이 규칙인지 다시 본다.
「지금 값」을 박아 둔 검사였다면 ①에 맞춰 **되겨눈다**(고친 까닭을 주석에 적는다).

---

## 두면 안 되는 자리 — 배포 게이트

`.github/workflows/deploy-pages.yml` 이 배포 직전에 아래를 **통째로 지운다.**
GitHub Pages 는 저장소를 통째로 올리므로, 여기 없는 새 폴더는 **인터넷에 공개된다.**

```
지움: tests fund-erp docs harness scripts engine app tools reference functions
      _scan_out node_modules .github .claude .agents .githooks .superpowers .codex-worktrees
      최상위 *.md *.bat firebase.json .firebaserc .mcp.json package-lock.json
남김: js css vendor 최상위 *.html *.js *.png manifest*.json hana-bridge.apk
```

- 개발용 파일·문서·실데이터는 **위 「지움」 목록 안에** 둔다.
- 앱이 실행 중에 부르는 것을 새로 만들면 `js/`·`css/`·`vendor/` 에 둔다.
- **실데이터는 저장소에 올리지 않는다** (fund.db·사업장 실데이터·templates 서식엑셀·backups).

---

## 브랜치·푸시

- `git pull --rebase origin main` 을 **먼저** 한다 (여러 사람이 같은 main 에 올린다).
- 기금 시스템(`fund.html`)을 만졌으면 `fund-erp/STATUS.md` 를 갱신한다 —
  계정·PC 가 바뀌어도 이어가는 **유일한 기준**이다.
- ⚠★ **손댄 기록은 `status/` 에 «새 파일 하나»로 적는다** — `status/날짜-가지이름.md`
  (2026-09-07 부터). 뿌리 `STATUS.md` 안의 표에 덧붙이지 **말 것.**
  까닭: 여러 방이 같은 끝줄에 덧붙이다 **부딪혔다**(PR #1087 은 3줄 덧붙였을 뿐인데 막혔다).
  이름이 겹치지 않으므로 두 방이 같은 순간에 끝내도 부딪힐 수가 없다.
  한 화면으로 몰아 보려면 `node scripts/status-log.js`.
  ⚠ `STATUS.md` 의 「2. 지금 손이 필요한 것」 은 **그대로 그 파일에 고친다** — 거기서
    부딪히는 것은 «뜻이 있는» 부딪힘이라 사람이 봐야 한다.
- 커밋 메시지는 한국어로, **무엇을 왜 고쳤는지**를 적는다.

---

## 붙여 둔 도구 — 설치 단계가 없다

계정·PC 가 바뀌어도 같은 도구로 시작하도록 저장소에 붙여 두었다.

| 무엇 | 어디 |
|---|---|
| 한글(.hwp/.hwpx) 변환·양식 채우기 | `.claude/skills/hwpx/scripts/` (`convert_hwp.py`·`fill_hwpx.py`·`secure_fill.py`) |
| 브라우저에서 서식 채우기(주민번호가 서버로 안 간다) | `js/pu-form-fill.js` · `js/pu-form-auto.js` |
| 인사(HRMCP)·법령(korean-law) MCP | `.mcp.json` (법령은 `LAW_OC` 필요) |
| 화면 실측(폰 411px) | `playwright-core` + `/opt/pw-browsers/chromium-*/chrome-linux/chrome` |

한 번만: `python3 -m pip install python-hwpx lxml --break-system-packages`

---

## 개인정보 — 이 저장소가 여러 겹으로 막아 온 것

노무법인이라 **주민번호·계좌·신분증**이 자료에 섞인다. 아래를 우회하지 않는다.

- 판독 전에 주민번호를 지운다 (`rrnScrub`) — 지우개가 없으면 **거절한다**
- 사진 판독을 붙인 화면은 가림 층도 함께 싣는다 → `tests/read-fence-apps.test.js`
- 민감 갈래(신분증·통장 등)는 원본 주소를 오래 남기지 않는다
- 온톨로지 색인에 사진 원본·문서 본문·급여 금액·메일 본문을 넣지 않는다
