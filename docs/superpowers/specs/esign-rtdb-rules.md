# esign RTDB 보안 규칙 (Firebase 콘솔 게시본 기록)

게시 위치: Firebase 콘솔 → pureun-erp → Realtime Database → 규칙
**기존 규칙 JSON의 "rules" 아래에 "esign" 키를 추가**한다 (다른 노드 규칙은 절대 수정하지 않는다).

```json
"esign": {
  "cases": {
    "$caseId": {
      "meta": {
        ".read": "auth != null",
        ".write": "auth != null && auth.token.email != null"
      },
      "secret": {
        ".read": "auth != null && auth.token.email != null",
        ".write": "auth != null && auth.token.email != null"
      },
      "arrears": {
        ".read": "auth != null && auth.token.email != null",
        ".write": "auth != null && auth.token.email != null"
      },
      "submissions": {
        ".read": "auth != null && auth.token.email != null",
        "$subId": {
          ".write": "(auth != null && !data.exists() && newData.child('t').val() === root.child('esign/cases/' + $caseId + '/meta/linkToken').val() && root.child('esign/cases/' + $caseId + '/meta/status').val() === 'active') || (auth != null && auth.token.email != null)",
          ".validate": "newData.hasChildren(['enc','encKey','iv','t','submittedAt','reviewState']) || (auth != null && auth.token.email != null)",
          "enc": { ".validate": "newData.isString() && newData.val().length < 400000" },
          "encKey": { ".validate": "newData.isString() && newData.val().length < 1000" },
          "iv": { ".validate": "newData.isString() && newData.val().length < 100" }
        }
      }
    }
  }
}
```

설계 의도:
- 익명 인증 사용자는 사건 meta를 읽고(폼 표시·pubKey·linkToken), 제출을 **생성만** 할 수 있다.
  기존 제출을 읽거나(read 불가) 수정·삭제할 수 없다 → 근로자 간 개인정보 노출 원천 차단.
- 생성 시 `t`(링크 토큰)가 meta/linkToken과 일치해야 하고 사건이 active여야 한다 → 무작위 스팸 완화.
- `enc` 400KB 상한: 서명 PNG 포함 제출 데이터 크기 제한.
- 직원(이메일 계정)은 검토상태 갱신·삭제 가능.
- encPrivKey는 secret/ 하위 — 익명 사용자에게 노출되지 않음 (그 자체도 암호문이지만 심층 방어).
