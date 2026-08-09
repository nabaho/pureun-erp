# Firebase 규칙 — 콘솔과 저장소 파일의 차이 (2026-08-09 실측)

**규칙은 코드 배포로 적용되지 않는다.** Firebase 콘솔 [규칙] 탭에 직접 붙여넣어야 한다.
그래서 `docs/firebase-rules-현재적용본.json` 은 「이렇게 되어야 한다」는 기록일 뿐,
**실제로 돌아가는 것은 콘솔**이다. 둘은 어긋날 수 있고, 실제로 어긋나 있었다.

이 문서는 **콘솔 원문을 받아 한 칸씩 맞춰 본 결과**다. 짐작이 아니다.

---

## 최상위 39칸 중 38칸은 같았다

`docs/firebase-rules-현재적용본.json` 과 콘솔이 글자까지 같았다. 아래 두 가지만 달랐다.

## ① `pucards_private` — 콘솔에 **없었다** (2026-08-09 발견)

명함첩 「🔒 개인 폴더 열기」가 이 오류로 막혔다.

```
permission_denied at /pucards_private/<uid>/lock
```

최상위에는 catch-all(`$other`)이 없다 — 규칙에 적히지 않은 칸은 그대로 막힌다.
개인 창고를 만든 커밋(e3de693)이 저장소 파일만 고치고 콘솔 게시를 안 한 것이다.

넣어야 할 것:

```json
"pucards_private": {
  "$uid": {
    ".read": "auth != null && auth.uid === $uid",
    ".write": "auth != null && auth.uid === $uid"
  }
}
```

## ② `puphotos` 사진 공유 — 콘솔에 없었다 (대표 지시로 ①과 함께 넣음)

저장소 파일에는 있고 콘솔에는 없던 칸:

- `puphotos/sharedTo` (와 그 아래 `$uid`, `$pid`)
- `puphotos/u/$uid/items/$year/$id/.read` (shareWith 조건)
- `puphotos/u/$uid/blobs/$year/$id/.read`
- `puphotos/u/$uid/thumbs/$year/$id/.read`

사진첩 「같이 볼 사람 고르기」를 **받는 쪽이 실제로 읽게** 해 주는 규칙이다.
없으면 공유해도 받는 사람 화면에서 사진이 안 열린다.

허용 범위는 **사진 한 장씩**이다. 남의 사진첩이 통째로 열리는 것이 아니라,
그 사진에 `shareWith/{내 uid}` 가 적혀 있을 때만 그 한 장을 읽는다.
앱이 쓰는 이름과 맞는 것도 확인했다 —
`items/{해}/{id}/shareWith/{받는사람}` · `sharedTo/{받는사람}/{id}` = {owner, year, at}.

---

## 게시하면 콘솔 = 저장소 파일

①②를 넣으면 `docs/firebase-rules-현재적용본.json` 과 **글자까지 같아진다**(확인함).
어긋나 있던 것은 이 둘뿐이었다.

---

## 다음에 규칙을 만질 때

1. **저장소 파일을 통째로 붙여넣지 말 것.** 콘솔이 더 최신인 칸이 있을 수 있다.
2. 먼저 콘솔 [규칙] 탭 내용을 받아, 한 칸씩 맞춰 보고 **필요한 덩어리만** 더한다.
3. 규칙 안에는 주석을 쓸 수 없다 — 설명 한 줄이 게시를 막은 적이 있다(4ceb241).
