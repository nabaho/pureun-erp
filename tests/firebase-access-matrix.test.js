const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const rules = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, '..', 'docs', 'firebase-rules-전체-적용본.json'),
    'utf8',
  ),
).rules;

class Snap {
  constructor(value) {
    this.value = value;
  }
  child(pathValue) {
    let current = this.value;
    for (const part of String(pathValue).split('/')) {
      current = current && typeof current === 'object' ? current[part] : undefined;
    }
    return new Snap(current);
  }
  val() {
    return this.value;
  }
  exists() {
    return this.value !== undefined && this.value !== null;
  }
  hasChildren(keys) {
    return keys.every((key) => this.child(key).exists());
  }
  isString() {
    return typeof this.value === 'string';
  }
}

const roleData = {
  adminUid: { isAdmin: true, isSubAdmin: false },
  subUid: { isAdmin: false, isSubAdmin: true },
  staffUid: { isAdmin: false, isSubAdmin: false },
  otherUid: { isAdmin: false, isSubAdmin: false },
};
const root = new Snap({ uid_roles: roleData });

function auth(uid) {
  return {
    uid,
    token: {
      firebase: { sign_in_provider: 'password' },
      email: `${uid}@pureun.kr`,
    },
  };
}

function evaluate(expression, options = {}) {
  const names = ['auth', 'root', 'data', 'newData', '$uid', '$id'];
  const values = [
    options.auth || null,
    root,
    new Snap(options.data),
    new Snap(options.newData),
    options.$uid || '',
    options.$id || '',
  ];
  return Function(...names, `"use strict"; return Boolean(${expression});`)(...values);
}

/* ⚠ data/portal_prefs_uid 칸이 규칙에서 사라졌다 — firebase-rules-stage3 의 같은 검사 참고 */
test('★ 역할표: 포털 개인 설정 자리가 규칙에 없다', () => {
  assert.equal(rules.data.portal_prefs_uid, undefined,
    '★ 되살아났다 — data/$other 에 걸려 직원 누구나 읽는다');
});

test('역할표: 일반 직원은 본인 UID로 건의를 새로 등록할 수 있다', () => {
  const rule = rules.suggestions_private.$id['.write'];
  const ownSuggestion = { authorUid: 'staffUid', status: 'new' };
  const forgedSuggestion = { authorUid: 'otherUid', status: 'new' };

  assert.equal(
    evaluate(rule, { auth: auth('staffUid'), data: undefined, newData: ownSuggestion }),
    true,
  );
  assert.equal(
    evaluate(rule, { auth: auth('staffUid'), data: undefined, newData: forgedSuggestion }),
    false,
  );
});

test('역할표: 건의 원문과 목록은 관리자만 읽는다', () => {
  for (const rule of [rules.suggestions_private['.read'], rules.suggestions_meta_private['.read']]) {
    assert.equal(evaluate(rule, { auth: auth('adminUid') }), true);
    assert.equal(evaluate(rule, { auth: auth('staffUid') }), false);
  }
  assert.equal(evaluate(rules.suggestions_resolved_private.$uid['.read'], { auth: auth('otherUid'), $uid: 'staffUid' }), false);
});

test('역할표: 일반 직원은 기존 건의를 수정하지 못하고 관리자만 수정한다', () => {
  const rule = rules.suggestions_private.$id['.write'];
  const before = { authorUid: 'staffUid', status: 'new' };
  const after = { authorUid: 'staffUid', status: 'done' };

  assert.equal(
    evaluate(rule, { auth: auth('staffUid'), data: before, newData: after }),
    false,
  );
  assert.equal(
    evaluate(rule, { auth: auth('adminUid'), data: before, newData: after }),
    true,
  );
});

test('역할표: 해결 알림은 대상자와 관리자만 접근한다', () => {
  const rule = rules.suggestions_resolved_private.$uid['.read'];
  assert.equal(evaluate(rule, { auth: auth('staffUid'), $uid: 'staffUid' }), true);
  assert.equal(evaluate(rule, { auth: auth('adminUid'), $uid: 'staffUid' }), true);
  assert.equal(evaluate(rule, { auth: auth('otherUid'), $uid: 'staffUid' }), false);
});

test('역할표: 서버 백업은 관리자와 위임관리인만 허용한다', () => {
  const rule = rules.serverBackups['.write'];
  assert.equal(evaluate(rule, { auth: auth('adminUid') }), true);
  assert.equal(evaluate(rule, { auth: auth('subUid') }), true);
  assert.equal(evaluate(rule, { auth: auth('staffUid') }), false);
});

test('역할표: 장애 알림은 총괄관리자만 조회하고 처리한다', () => {
  const readRule = rules.systemAlerts['.read'];
  const writeRule = rules.systemAlerts.$uid.$id['.write'];
  const event = { uid: 'staffUid', kind: 'save', message: 'failed', page: 'work.html', createdAt: 1, status: 'new' };

  assert.equal(evaluate(readRule, { auth: auth('adminUid') }), true);
  /* 2026-08-29 — 위임관리인도 «보게» 열었다. 장애는 빨리 봐야 한다.
     고치는 것은 아래처럼 본인과 관리자뿐이다. */
  assert.equal(evaluate(readRule, { auth: auth('subUid') }), true);
  assert.equal(evaluate(writeRule, { auth: auth('staffUid'), $uid: 'staffUid', data: undefined, newData: event }), true);
  /* 위임관리인도 «처리»까지 한다 — 보기만 되고 처리는 못 하면 알림이 쌓이기만 한다 */
  assert.equal(evaluate(writeRule, { auth: auth('subUid'), $uid: 'staffUid', data: event, newData: { ...event, status: 'resolved' } }), true);
  /* ★ 그래도 «남의 알림을 새로 만드는 것»은 여전히 안 된다 — 이것이 남은 알맹이다 */
  assert.equal(evaluate(writeRule, { auth: auth('otherUid'), $uid: 'staffUid', data: undefined, newData: { ...event, uid: 'otherUid' } }), false);
  assert.equal(evaluate(writeRule, { auth: auth('adminUid'), $uid: 'staffUid', data: event, newData: { ...event, status: 'resolved' } }), true);
});

/* ⚠ hr 칸은 규칙에서 없어졌다(2026-08-29). 남은 권한 칸만 본다. */
test('역할표: 일반 직원은 권한을 스스로 true로 바꾸지 못한다', () => {
  for (const field of ['fin', 'isAdmin', 'isSubAdmin']) {
    const validation = rules.uid_roles.$uid[field]['.validate'];
    assert.equal(
      evaluate(validation, { auth: auth('staffUid'), data: false, newData: true }),
      false,
    );
    assert.equal(
      evaluate(validation, { auth: auth('staffUid'), data: false, newData: false }),
      true,
    );
    assert.equal(
      evaluate(validation, { auth: auth('adminUid'), data: false, newData: true }),
      true,
    );
  }
});

