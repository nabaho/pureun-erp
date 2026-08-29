'use strict';
/* 실시간DB 보안규칙 — 실제로 «돌려 보고» 확인한다 (대표 지시 2026-08-29 「전체 다시 만들어달라」)

   ★ 규칙은 글자로 읽어서는 못 믿는다. 같은 조건식이 백 번 넘게 되풀이되고,
     한 곳만 어긋나도 그 자리가 곧 구멍이다. 그래서 사람과 상황을 넣어 «답» 을 본다.

   ★ 이 검사가 지키는 것 —
     ① 백업은 아무나 못 지운다 (마지막 방패를 아무나 부수면 방패가 아니다)
     ② 백업 열쇠는 관리자만 읽고, 한 번 만들면 «아무도 못 바꾼다»
        (바꾸면 옛 백업 스무 벌을 영영 못 푼다)
     ③ 재무 자료는 재무 권한자만
     ④ 자기 역할을 스스로 못 올린다
     ⑤ 열람 기록은 덧붙이기만 된다(고칠 수 있으면 기록이 아니다)
     ⑥ 규칙 파일이 만들어 내는 것과 «같다»(손으로 고쳐 놓고 잊는 일을 막는다) */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const FILE = path.join(ROOT, 'docs', 'firebase-rules-전체-적용본.json');
const rules = JSON.parse(fs.readFileSync(FILE, 'utf8')).rules;

/* ── 규칙식을 돌려 보는 아주 작은 흉내 ────────────────────────────────── */
class Snap {
  constructor(v) { this.value = v; }
  child(p) { let c = this.value; for (const s of String(p).split('/')) c = (c && typeof c === 'object') ? c[s] : undefined; return new Snap(c); }
  val() { return this.value === undefined ? null : this.value; }
  exists() { return this.value !== undefined && this.value !== null; }
  hasChildren(ks) { return (ks || []).every((k) => this.child(k).exists()); }
  hasChild(k) { return this.child(k).exists(); }
  isString() { return typeof this.value === 'string'; }
  isNumber() { return typeof this.value === 'number'; }
  isBoolean() { return typeof this.value === 'boolean'; }
}
const ROLES = { ad: { isAdmin: true }, sub: { isSubAdmin: true }, fin: { fin: true }, st: {} };
const TREE = {
  uid_roles: ROLES,
  backup_key: { v1: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=' },
  paydata: { u: { st: { deputy: { ad: { to: 9e15 } } } } },
};
function auth(uid, prov) {
  if (!uid) return null;
  const t = { firebase: { sign_in_provider: prov || 'password' }, email: uid + '@pureun.kr' };
  if (prov === 'custom') t.passkey = true;
  return { uid, token: t };
}
const VARS = ['auth', 'root', 'data', 'newData', 'now', '$uid', '$id', '$owner', '$ym', '$sid', '$fid',
  '$caseId', '$subId', '$site', '$rev', '$k', '$k2', '$v', '$year', '$pid', '$deputy', '$token', '$i', '$other'];
function ev(expr, o) {
  o = o || {};
  if (typeof expr !== 'string') return expr;
  const vals = VARS.map((n) => {
    if (n === 'auth') return o.auth === undefined ? null : o.auth;
    if (n === 'root') return new Snap(o.tree || TREE);
    if (n === 'data') return new Snap(o.data);
    if (n === 'newData') return new Snap(o.newData);
    if (n === 'now') return o.now || Date.now();
    return o[n] === undefined ? '' : o[n];
  });
  /* ⚠ 로그인 전에는 auth 가 null 이라 `auth.uid` 가 터진다. 실시간DB 는 그럴 때
     규칙을 «거짓» 으로 본다 — 흉내도 그렇게 해야 맞다(안 그러면 검사만 터진다). */
  try {
    return Boolean(Function(...VARS, '"use strict"; return (' + expr + ');')(...vals));
  } catch (e) { return false; }
}
const 관리자 = auth('ad'), 위임 = auth('sub'), 재무 = auth('fin'), 직원 = auth('st'), 지문직원 = auth('st', 'custom');

/* ══════════════════════════════════════════════════════════════════════ */
test('★ 백업을 «지울 수 있는 사람» 은 관리자·위임관리인뿐이다', () => {
  /* 전에는 전 직원이 쓸 수 있었다 — 계정 하나가 털리면 스무 벌이 통째로 날아간다. */
  for (const 칸 of ['serverBackups', 'serverBackupsIndex', 'serverBackupsRecent',
                    'serverBackupsRecentIndex', 'systemBackups', 'scal_serverBackups']) {
    const w = rules[칸]['.write'];
    assert.equal(ev(w, { auth: 관리자 }), true, 칸 + ': 관리자가 못 씁니다 — 백업이 아예 안 떠집니다');
    assert.equal(ev(w, { auth: 위임 }), true, 칸 + ': 위임관리인이 못 씁니다');
    assert.equal(ev(w, { auth: 직원 }), false,
      '★ ' + 칸 + ' 를 일반 직원이 쓸 수 있습니다 — 백업을 통째로 지울 수 있다는 뜻입니다.');
    assert.equal(ev(w, { auth: null }), false, 칸 + ': 로그인 안 해도 씁니다');
  }
  assert.equal(ev(rules.serverBackups['.read'], { auth: 직원 }), false,
    '★ 백업 본문을 일반 직원이 읽습니다 — 그 안에 재무·급여가 다 들어 있습니다.');
});

test('★ 백업 열쇠 — 관리자만 읽고, 한 번 만들면 «아무도 못 바꾼다»', () => {
  const k = rules.backup_key;
  assert.ok(k, '★ backup_key 칸이 없습니다 — 이러면 백업이 아예 안 떠집니다(열쇠 없이는 안 씁니다).');
  assert.equal(ev(k['.read'], { auth: 관리자 }), true);
  assert.equal(ev(k['.read'], { auth: 위임 }), true);
  assert.equal(ev(k['.read'], { auth: 직원 }), false,
    '★ 직원이 열쇠를 읽으면 백업을 잠근 뜻이 사라집니다.');
  assert.equal(ev(k['.read'], { auth: 재무 }), false);

  const w = k.$v['.write'];
  assert.equal(ev(w, { auth: 관리자, data: undefined }), true, '처음 만들 때는 돼야 합니다');
  assert.equal(ev(w, { auth: 관리자, data: 'AAAA' }), false,
    '★ 이미 있는 열쇠를 관리자가 갈아치울 수 있습니다 — 옛 백업 스무 벌을 영영 못 풉니다.');
  assert.equal(ev(w, { auth: 직원, data: undefined }), false);
});

test('★ 재무 자료는 재무 권한자만 — 「아래로 흐르는」 성질까지 본다', () => {
  for (const 칸 of ['finance_income', 'payroll_monthly', 'user_accounts', 'funds', 'mgr_rates']) {
    assert.equal(ev(rules.data[칸]['.read'], { auth: 재무 }), true, 칸);
    assert.equal(ev(rules.data[칸]['.read'], { auth: 직원 }), false,
      '★ data/' + 칸 + ' 를 재무 아닌 직원이 읽습니다.');
  }
  /* ⚠ data 자체의 읽기를 전 직원으로 열면 «아래로 흘러» 위의 잠금이 전부 풀린다 */
  assert.equal(ev(rules.data['.read'], { auth: 직원 }), false,
    '★ data 의 읽기가 전 직원에게 열려 있습니다 — 아래 재무 잠금이 전부 무의미해집니다.');
  /* 이름 없는 업무 칸은 전 직원이 본다(업무가 그렇게 돌아간다) */
  assert.equal(ev(rules.data.$other['.read'], { auth: 직원 }), true);
  assert.equal(ev(rules.data.$other['.read'], { auth: 지문직원 }), true, '지문 로그인도 같아야 합니다');
  assert.equal(ev(rules.data.$other['.read'], { auth: null }), false);
});

test('★ 자기 역할을 스스로 못 올린다', () => {
  const g = rules.uid_roles.$uid.isAdmin['.validate'];
  assert.equal(ev(g, { auth: 직원, data: false, newData: true }), false,
    '★ 직원이 스스로 관리자가 됩니다.');
  assert.equal(ev(g, { auth: 직원, data: undefined, newData: false }), true, '내려 적는 것은 됩니다');
  assert.equal(ev(g, { auth: 관리자, data: false, newData: true }), true, '관리자는 올릴 수 있어야 합니다');
});

test('★ 열람 기록은 «덧붙이기만» — 고칠 수 있으면 기록이 아니다', () => {
  for (const 칸 of ['access_log', 'handoff_log']) {
    const w = rules.paydata[칸].$id['.write'];
    assert.equal(ev(w, { auth: 직원, data: undefined }), true, '새 줄은 적을 수 있어야 합니다');
    assert.equal(ev(w, { auth: 직원, data: { a: 1 } }), false, '★ ' + 칸 + ' 의 적힌 줄을 고칠 수 있습니다.');
    assert.equal(ev(w, { auth: 관리자, data: { a: 1 } }), false, '★ 관리자도 기록을 고치면 안 됩니다.');
  }
});

test('★ 요금 눈금은 관리자가 정할 수 있다 — 전에는 아무도 못 정했다', () => {
  assert.equal(rules.billing['.write'], false, '금액은 서버만 적어야 합니다');
  assert.equal(ev(rules.billing.limit['.write'], { auth: 관리자 }), true,
    '★ 화면에 눈금을 정하는 기능이 있는데 규칙이 막고 있었습니다.');
  assert.equal(ev(rules.billing.limit['.write'], { auth: 직원 }), false);
  assert.equal(ev(rules.billing['.read'], { auth: 직원 }), false);
});

test('★ 로그인하지 않으면 «업무 자료» 는 아무것도 못 읽는다', () => {
  const 열린곳 = [];
  (function walk(node, at) {
    if (!node || typeof node !== 'object') return;
    if (node['.read'] !== undefined && ev(node['.read'], { auth: null })) 열린곳.push(at || '/');
    Object.keys(node).forEach((k) => { if (k[0] !== '.') walk(node[k], (at ? at + '/' : '') + k); });
  })(rules, '');
  /* appBuild 만 일부러 열려 있다 — 로그인 «전» 에 새 판이 나왔는지 보는 칸이다 */
  assert.deepEqual(열린곳, ['appBuild'],
    '★ 로그인 없이 읽히는 칸이 늘었습니다: ' + 열린곳.join(' · '));
});

test('★ 파일이 만들개(scripts/make-firebase-rules.js)가 내놓는 것과 같다', () => {
  /* 손으로 고쳐 놓고 만들개를 안 고치면, 다음에 만들 때 그 고침이 조용히 사라진다. */
  const out = cp.execFileSync('node', [path.join(ROOT, 'scripts', 'make-firebase-rules.js')], { encoding: 'utf8' });
  /* ⚠ 줄끝을 맞춰 견준다. 만들개는 LF 를 내놓는데 깃이 윈도우에서 파일을 CRLF 로
       받아 두므로, 맞추지 않으면 «윈도우에서만» 깨진다 — 글자는 한 자도 안 다른데.
       CI(리눅스)는 초록불이라 「내가 뭘 건드렸나」를 한참 찾게 된다(2026-08-29 실제로 겪음).
       검사가 도는 곳에 따라 답이 달라지면 그 검사는 못 믿는다. */
  const eol = (v) => String(v).split('\r\n').join('\n').trim();
  assert.equal(eol(out), eol(fs.readFileSync(FILE, 'utf8')),
    '★ 규칙 파일과 만들개가 어긋났습니다.\n' +
    '  고칠 곳은 scripts/make-firebase-rules.js 이고, 그 뒤\n' +
    '  node scripts/make-firebase-rules.js > docs/firebase-rules-전체-적용본.json 을 다시 돌립니다.');
});
