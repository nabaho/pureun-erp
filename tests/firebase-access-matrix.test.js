const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const rules = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, '..', 'docs', 'firebase-rules-3순위-포털권한.json'),
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

test('역할표: 포털 개인 설정은 본인만 허용한다', () => {
  const rule = rules.data.portal_prefs_uid.$uid['.write'];
  assert.equal(evaluate(rule, { auth: auth('staffUid'), $uid: 'staffUid' }), true);
  assert.equal(evaluate(rule, { auth: auth('otherUid'), $uid: 'staffUid' }), false);
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

test('역할표: 일반 직원은 fin과 hr 권한을 스스로 true로 바꾸지 못한다', () => {
  for (const field of ['fin', 'hr']) {
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

