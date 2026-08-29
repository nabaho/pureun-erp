const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const rulesPath = path.join(__dirname, '..', 'docs', 'firebase-rules-전체-적용본.json');
const rules = JSON.parse(fs.readFileSync(rulesPath, 'utf8')).rules;

/* ⚠ 2026-08-29 — data/portal_prefs_uid 칸이 규칙에서 «사라졌다».
   사라졌다는 것은 안전해졌다는 뜻이 아니다: data/$other 가 받아
   «재직 직원 누구나» 읽고 쓴다. 그러니 「없다」를 못 박아,
   누가 그 자리를 되살릴 때 제 규칙 없이 되살리지 못하게 한다. */
/* 2026-08-29 — 이름을 적었다. 권한은 그때 열려 있던 그대로다(재직 직원).
   ⚠ 좁힐지는 대표 판단으로 남아 있다 — 「내 타일 순서를 남이 바꾼다」가 지금 상태다.
     좁히려면 auth.uid === $uid 로 바꾸면 된다. 여기서 조용히 정하지 않는다. */
test('개인 포털 설정 자리에 이름이 있다 (권한은 아직 재직 직원)', () => {
  const node = rules.data.portal_prefs_uid;
  assert.ok(node, '★ 이름이 없어졌다 — $other 로 떨어져 아무도 세지 못하게 된다');
  assert.match(node['.read'], /sign_in_provider|passkey/);
  assert.match(node['.write'], /sign_in_provider|passkey/);
});

test('건의 수정과 답변은 관리자만 가능하고 신규 작성자는 UID를 남긴다', () => {
  assert.match(rules.suggestions_private['.read'], /isAdmin/);
  assert.match(rules.suggestions_meta_private['.read'], /isAdmin/);
  const write = rules.suggestions_private.$id['.write'];
  assert.match(write, /isAdmin/);
  assert.match(write, /!data\.exists\(\)/);
  assert.match(write, /authorUid/);
  assert.match(write, /auth\.uid/);
});

/* ⚠ 옛 건의 자리(data/sg_resolved · data/suggestions)도 규칙에서 사라졌다.
   지금 건의는 suggestions_private 로 옮겨 갔다(그쪽은 아래에서 지킨다).
   ★ 옛 자리에 «자료가 남아 있다면» data/$other 로 직원 누구나 읽는다 —
     콘솔 데이터 탭에서 그 두 자리가 비었는지 확인이 필요하다(대표 보고 2026-08-29). */
/* 2026-08-29 — 이름을 적었다. 이 넷은 «옛 건의 원문»이 남아 있을 수 있는 자리다.
   관리자가 포털에 들어오면 suggestions_private 로 옮기고 여기를 지운다
   (enter.html 의 sgEnsurePrivateMigration). 이사가 끝나면 빈 자리가 된다.
   ⚠ 좁힐 «첫 후보»다 — 건의는 직원이 대표께 올린 글이다(대표 판단 대기). */
test('옛 건의 자리 넷에 이름이 있다 (이사가 끝나면 빈 자리가 된다)', () => {
  ['suggestions', 'sg_meta', 'sg_resolved', 'sg_resolved_uid'].forEach(k => {
    assert.ok(rules.data[k], '★ ' + k + ' 의 이름이 없어졌다 — $other 로 떨어진다');
  });
});

test('해결 알림은 대상 UID와 관리자만 접근한다', () => {
  const node = rules.suggestions_resolved_private.$uid;
  assert.match(node['.read'], /auth\.uid === \$uid/);
  assert.match(node['.read'], /isAdmin/);
  assert.match(node['.write'], /auth\.uid === \$uid/);
  assert.match(node['.write'], /isAdmin/);
});

/* ⚠ 넷이 «같은 문»이 아니게 되었다(2026-08-29 대조).
   ·  본체(serverBackups)는 «관리자만» 읽는다 — 백업에는 자료가 통째로 들어 있다.
   ·  색인(…Index)은 직원도 읽는다 — 「언제 백업됐나」만 있어 자료가 없다.
   쓰기는 넷 다 관리자·위임관리인이다. 이 «다름»이 규칙의 뜻이므로 그대로 못 박는다. */
test('서버 백업: 본체는 관리자만 읽고, 색인은 직원도 읽는다', () => {
  assert.match(rules.serverBackups['.read'], /isAdmin/);
  assert.doesNotMatch(rules.serverBackups['.read'], /isSubAdmin/,
    '★ 백업 «본체»가 위임관리인에게 열렸다 — 자료가 통째로 들어 있는 자리다');
  assert.match(rules.serverBackupsRecent['.read'], /isSubAdmin/);
  for (const key of ['serverBackupsIndex', 'serverBackupsRecentIndex']) {
    assert.match(rules[key]['.read'], /sign_in_provider|passkey/,
      key + ' 은 색인이라 직원도 읽는다');
  }
  for (const key of ['serverBackups', 'serverBackupsIndex',
                     'serverBackupsRecent', 'serverBackupsRecentIndex']) {
    assert.match(rules[key]['.write'], /isAdmin/, key + ' 쓰기가 열렸다');
    assert.match(rules[key]['.write'], /isSubAdmin/);
  }
});

/* ⚠ 2026-08-29 — 장애 알림을 «위임관리인도» 보게 열었다(콘솔에서 확인).
   장애는 빨리 봐야 하는 것이라, 대표 한 사람만 보면 늦는다.
   다만 «남의 알림을 고치는 것»은 여전히 본인과 관리자뿐이다 — 그것을 지킨다. */
test('장애 알림: 관리자·위임관리인이 보고, 고치는 것은 본인과 관리자뿐', () => {
  assert.match(rules.systemAlerts['.read'], /isAdmin/);
  assert.match(rules.systemAlerts['.read'], /isSubAdmin/);
  assert.match(rules.systemAlerts.$uid.$id['.write'], /auth\.uid === \$uid/,
    '★ 본인 것이라는 조건이 사라졌다 — 남의 알림을 지울 수 있게 된다');
});

/* ⚠ hr · isFullViewer · sid · role · status 는 규칙에서 «없어졌다»(2026-08-29 대조).
   지금 권한 칸은 셋뿐이다. 셋을 지키고, «새 권한 칸이 생기면 반드시 걸리게» 한다 —
   지키는 목록을 손으로 적어 두면 새 칸이 조용히 무방비로 들어온다. */
test('★ 권한 칸은 저 스스로 못 켠다 — 새 권한 칸이 생겨도 마찬가지', () => {
  const node = rules.uid_roles.$uid;
  const fields = Object.keys(node).filter(k => !k.startsWith('.'));
  assert.deepEqual(fields.sort(), ['fin', 'isAdmin', 'isSubAdmin'],
    '★ uid_roles 의 칸이 달라졌다 — 새 권한 칸은 자가부여 막기를 함께 넣을 것: ' + fields);
  for (const key of fields) {
    const validation = node[key]['.validate'];
    assert.match(validation, /isAdmin/, key + ' 이 관리자 확인 없이 바뀐다');
    assert.match(validation, /newData\.val\(\) === false/,
      '★ ' + key + ' 을 직원이 스스로 true 로 켤 수 있다');
  }
});

