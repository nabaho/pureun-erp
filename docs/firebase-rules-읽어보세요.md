# 실시간DB 규칙 — 지금은 저장소에서 배포하지 않습니다

> ## ⚠ 지금은 이렇게 합니다 (2026-08-29 부터)
>
> **규칙의 진짜는 만들개 하나입니다.**
>
> ```
> scripts/make-firebase-rules.js          ← 여기만 고친다
>          ↓ node scripts/make-firebase-rules.js > docs/firebase-rules-전체-적용본.json
> docs/firebase-rules-전체-적용본.json     ← 콘솔에 붙여넣을 것
> ```
>
> 한 칸만 더할 때는 「한 칸만 넣기」 글을 씁니다 —
> `firebase-rules-반출기록-한칸만-넣기.txt` · `firebase-rules-메일함-한칸만-넣기.txt`
>
> **아래 글에 나오는 옛 조각 파일들(`현재적용본.json` · `3순위-포털권한.json` 등)은
> 2026-08-29 에 지웠습니다.** 스물두 개까지 흩어져 있어 어느 것을 붙여넣을지 알 수 없었고,
> 검사 열아홉이 그 «얼어붙은 파일»을 보며 「지켜지고 있다」고 말하고 있었습니다.
> 지운 것은 git 이력에 그대로 남아 있습니다.
>
> 아래는 그때의 **기록**입니다 — 무엇이 왜 그렇게 됐는지 알아야 할 때 읽으십시오.

---

> **2026-08-15 게시 완료.** 삭제 권한 16칸과 웹푸시 `fcm_tokens` 를 콘솔에 붙여넣어
> 게시했습니다. 최상위 40칸 → 41칸. 없어진 칸은 없습니다.
> `docs/firebase-rules-현재적용본.json` 을 그때 게시한 내용과 같게 맞춰 두었습니다.


## 한 줄 요약

**`firebase deploy` 로 규칙을 올리지 마세요.** 진짜 규칙은 Firebase 콘솔에만 있고,
저장소의 규칙 파일들은 그보다 낡았습니다. 그대로 올리면 살아 있는 규칙이 지워집니다.

## 무슨 일이 있었나

`firebase.json` 에 이렇게 적혀 있었습니다.

```json
"database": { "rules": "docs/firebase-rules-3순위-포털권한.json" }
```

이 상태로 `firebase deploy --only database` 를 실행하면 그 파일 하나가 콘솔의 규칙을
**통째로 덮어씁니다.** 그런데 그 파일에는 실제로 쓰이고 있는 노드가 빠져 있었습니다.

| 노드 | 쓰는 곳 | 배포 대상 파일에 |
|---|---|---|
| `puphotos` | `pu-photos.html` (푸른사진첩) | 없었음 → 지금은 합쳐 넣음 |
| `pucards_private` | `pu-cards.html` (명함첩 개인 창고) | 없었음 → 지금은 합쳐 넣음 |
| `paydata` | `js/pu-paydata-store.js` (급여데이터함) | **아직 없음** |

Firebase 규칙은 없으면 **거부**입니다. 그대로 배포했다면 해당 앱들이 통째로 먹통이
됐을 것입니다.

`paydata` 는 저장소의 어느 규칙 파일에도 없습니다. 그 앱의 저장소 코드에도 근거가
남아 있습니다 — `js/pu-paydata-store.js` 의 「휴가 대리」 주석:

> 콘솔 규칙이 이 칸의 쓰기를 **주인만**으로 막아 둔다(대리인이 자기 기간을 늘리지 못하게).

즉 **콘솔이 원본이고 저장소 파일은 사본**입니다. 사본이 원본을 덮어쓰면 안 됩니다.

## 그래서 무엇을 했나

`firebase.json` 에서 `database` 항목을 **뺐습니다.** 이제 `firebase deploy` 는
함수만 올리고 규칙은 건드리지 않습니다. 실수로 규칙이 날아갈 일이 없습니다.

## 규칙을 다시 저장소에서 관리하려면 (권장)

순서를 지켜야 합니다. **먼저 내려받고, 그다음에 올립니다.**

1. Firebase 콘솔 → Realtime Database → **규칙** 탭
2. 화면의 규칙 전체를 복사해서 `docs/firebase-rules-현재적용본.json` 에 **덮어쓰기**
   (이게 원본을 사본으로 가져오는 단계입니다)
3. 그 파일에 `paydata` · `puphotos` · `pucards_private` · `fcm_tokens` 가 모두
   들어 있는지 눈으로 확인
4. `firebase.json` 에 아래를 다시 넣습니다

   ```json
   "database": { "rules": "docs/firebase-rules-현재적용본.json" }
   ```

5. 그다음부터는 규칙을 **파일에서만** 고치고 `firebase deploy --only database` 로
   올립니다. 콘솔에서 직접 고치면 다시 어긋납니다.

## 지금 당장 규칙 하나만 넣어야 할 때 (웹푸시)

새 건의 폰 알림이 동작하려면 `fcm_tokens` 규칙이 필요합니다. 위 정리를 하기 전이라면
**콘솔에서 직접** 아래 블록을 기존 규칙 안에 붙여 넣으세요.

```json
"fcm_tokens": {
  "$uid": {
    ".read": "auth != null && auth.uid == $uid",
    ".write": "auth != null && auth.token.firebase.sign_in_provider === 'password' && auth.uid == $uid",
    "$token": {
      ".validate": "newData.hasChild('at')",
      "at":   { ".validate": "newData.isNumber()" },
      "name": { ".validate": "newData.isString() && newData.val().length <= 60" },
      "ua":   { ".validate": "newData.isString() && newData.val().length <= 200" },
      "$other": { ".validate": false }
    }
  }
}
```

## 삭제 권한 (2026-08 추가)

「로그인만 하면 전부 지울 수 있던」 공용 칸 16개에 삭제 권한을 넣었습니다.
넣은 파일은 **`firebase-rules-급여데이터함-포함(붙여넣기용).json`** 입니다.

| 무엇을 | 누가 |
|---|---|
| 레코드 하나 추가·수정·삭제 (3단계 이하) | 지금까지처럼 **직원** |
| 섹션 통째로 다시 쓰기 (예: 명함첩 색인 재생성) | 지금까지처럼 **직원** |
| 섹션 통째로 **비우기** (예: 명함 5,710건 전부) | **관리자만** |
| 노드 통째로 지우거나 갈아엎기 | **관리자만** |

적용한 칸: `pucards` `fund_erp` `work_erp` `companies` `chwieop` `payroll_os`
`improve_requests` `scal_*`(9개)

왜 이 모양인가 — 실시간DB 규칙은 **위에서 하나라도 참이면 아래가 전부 열립니다.**
그래서 「레코드는 되고 통째 삭제만 막기」를 하려면 층마다 따로 적어야 합니다.
2단계 쓰기 자체를 막으면 안 됩니다. 명함첩이 `pucards/idx` 를 통째로 `set` 하기
때문에, 막으면 색인 재생성이 죽습니다.

이미 사람별 소유자 검증이 있는 칸(`kcareer` `puphotos` `paydata` `pucards_private`
`rules_mgmt`)과 관리자 전용·휘발성 칸은 건드리지 않았습니다.

### 검증

추측으로 넣지 않았습니다. 실제 Firebase 규칙 엔진(에뮬레이터)에 물어 **15개 항목
전부 통과**를 확인했습니다. 다시 돌리는 방법은
`tests/firebase-rules-delete-permission.emulator.mjs` 머리말에 있습니다.

## 규칙 파일이 여러 개인 것도 정리 대상입니다

`docs/` 안에 규칙 파일이 6개 있습니다. 어느 것이 진짜인지 이름만으로는 알 수 없고,
이번 사고의 원인이기도 합니다. 위 4번까지 끝내면 **`현재적용본.json` 하나만 남기고**
나머지는 `docs/archive/` 로 옮기시길 권합니다.
