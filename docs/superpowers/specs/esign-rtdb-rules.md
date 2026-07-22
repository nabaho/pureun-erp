# esign RTDB 보안 규칙 (Firebase 콘솔 게시본 기록)

게시 위치: Firebase 콘솔 → pureun-erp → Realtime Database → 규칙
**기존 규칙 JSON의 "rules" 아래에 "esign" 키를 추가**한다 (다른 노드 규칙은 절대 수정하지 않는다).

```json
"esign": {
  "cases": {
    ".read": "auth != null && auth.token.email != null",
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
          "iv": { ".validate": "newData.isString() && newData.val().length < 100" },
          "reviewState": { ".validate": "newData.isString() && newData.val().matches(/^(pending|confirmed|hold)$/)" }
        }
      }
    }
  }
}
```

설계 의도:
- `cases` 상위에 직원 `.read` 부여: 관리자 화면이 사건 **목록**을 조회(`db.ref('esign/cases').on`)하려면 상위 경로 read가 필요. 이게 없으면 목록이 "불러오는 중…"에서 멈춘다. 직원 read는 하위(meta·submissions·secret·arrears)로 cascade되며, 익명은 이 상위 read를 만족하지 못하므로 목록·제출을 읽을 수 없다(익명의 meta 개별 읽기는 하위 `meta/.read`로만 허용).
- 익명 인증 사용자는 사건 meta를 읽고(폼 표시·pubKey·linkToken), 제출을 **생성만** 할 수 있다.
  기존 제출을 읽거나(read 불가) 수정·삭제할 수 없다 → 근로자 간 개인정보 노출 원천 차단.
- 생성 시 `t`(링크 토큰)가 meta/linkToken과 일치해야 하고 사건이 active여야 한다 → 무작위 스팸 완화.
- `enc` 400KB 상한: 서명 PNG 포함 제출 데이터 크기 제한.
- 직원(이메일 계정)은 검토상태 갱신·삭제 가능.
- `reviewState`는 `pending|confirmed|hold` 3종으로 값 자체를 제한(정규식 검증) — 근로자 제출 시 'pending' 고정, 직원 cycleReview가 3종을 순환하며 기록. 클라이언트를 거치지 않은 직접 쓰기로 임의 문자열(XSS 페이로드 등)을 주입할 수 없도록 데이터 계층에서도 차단(심층 방어).
- encPrivKey는 secret/ 하위 — 익명 사용자에게 노출되지 않음 (그 자체도 암호문이지만 심층 방어).
