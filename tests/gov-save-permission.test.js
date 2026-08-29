/* 일정관리 저장이 막힌 일 (2026-08-17 대표 신고: "김동현이 수정 일정삽입이 전혀 안된다")

   ★ 뿌리 —
     규칙에서 scal_* «부모» 노드의 .write 가 「관리자만」으로 조여졌는데(2026-08 초),
     앱은 예전부터 부모 노드에 «통째로» 쓴다(ref('scal_scheds').transaction/set).
     실시간DB는 «자식($k) 규칙으로 부모 쓰기를 허락하지 않는다» —
     그래서 관리자 한 사람(권형하) 말고는 아무도 저장이 안 됐다.
     읽기는 열려 있어 화면은 멀쩡해 보였고, 그래서 아무도 몰랐다.

   ★ 여기서 검사하는 것 —
     ①「권한 없음」과 「연결 안 됨」을 «다른 말» 로 알리는가(뭉개면 인터넷만 확인하며 다시 누른다)
     ② 붙여넣기용 규칙 파일이 직원 저장을 실제로 허용하는가 */
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'gov-consulting.html'), 'utf8');
const bare = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
const S = bare(SRC);

/* ── ① 두 고장을 가려서 말한다 ── */

// 함수를 실제로 떼어내 돌린다 — 「글자가 있나」가 아니라 「가려내나」를 본다
function loadIsDenied() {
  const a = S.indexOf('function _isDeniedErr');
  assert.ok(a > 0, '_isDeniedErr 가 없다');
  const src = S.slice(a, S.indexOf('\nconst _SAVE_DENIED_MSG', a));
  const ctx = { String };
  vm.createContext(ctx);
  vm.runInContext(src + '\nthis.fn = _isDeniedErr;', ctx);
  return ctx.fn;
}

test('권한 거부를 알아본다 — 실시간DB가 주는 실제 모양들', () => {
  const f = loadIsDenied();
  assert.strictEqual(f({ code: 'PERMISSION_DENIED' }), true, 'code 대문자');
  assert.strictEqual(f({ code: 'permission_denied' }), true);
  assert.strictEqual(f(new Error('PERMISSION_DENIED: Permission denied')), true, 'message 안');
  assert.strictEqual(f('permission denied'), true, '빈칸 낀 꼴');
});

test('연결 문제를 권한 문제로 잘못 읽지 않는다', () => {
  /* 여기가 뒤바뀌면, 인터넷이 끊긴 사람에게 「권한이 없다」고 해서
     쓸데없이 관리자를 찾게 만든다. */
  const f = loadIsDenied();
  assert.strictEqual(f(new Error('Failed to fetch')), false);
  assert.strictEqual(f({ code: 'NETWORK_ERROR' }), false);
  assert.strictEqual(f(null), false);
  assert.strictEqual(f(undefined), false);
});

test('권한 안내는 「다시 시도」를 권하지 않는다', () => {
  /* ★ 이 고장의 핵심. 다시 눌러도 절대 저장되지 않는데
     「다시 시도해 주세요」라고 하면 사람이 몇 주를 헛되게 누른다. */
  const m = S.match(/_SAVE_DENIED_MSG\s*=\s*'([^']+)'/);
  assert.ok(m, '권한 안내 문구가 없다');
  const msg = m[1];
  assert.strictEqual(/다시 시도/.test(msg), false, '권한 안내가 다시 시도를 권한다');
  assert.strictEqual(/인터넷|연결/.test(msg), false, '권한 안내가 인터넷 탓을 한다');
  assert.strictEqual(/저장되지 않습니다|저장 권한/.test(msg), true, '무엇이 안 되는지 안 말한다');
  assert.strictEqual(/관리자/.test(msg), true, '누구에게 말해야 하는지 안 알려 준다');
});

test('두 저장 길 «모두» 권한 문구를 쓴다', () => {
  /* 병합 저장(fbPushRecordDelta)과 통째 저장(fbPush) 둘 다 쓰인다.
     한쪽만 고치면 다른 쪽에서 여전히 「인터넷 확인」이라 한다. */
  /* ★ 이름 «앞부분» 으로 찾으면 fbPush 가 fbPushRecordDelta 에 걸려
     두 번 같은 함수를 보게 된다(2026-08-17 실제로 그렇게 놓쳤다). 여는 괄호까지 본다. */
  ['fbPushRecordDelta(', 'fbPush('].forEach(function (name) {
    const a = S.indexOf('function ' + name);
    assert.ok(a > 0, name + ' 가 없다');
    const b = S.indexOf('\nfunction ', a + 5);
    const fn = S.slice(a, b < 0 ? S.length : b);
    assert.strictEqual(/_saveFailMsg\(\s*node\s*,\s*e\s*\)/.test(fn), true,
      name + ' 가 실패 이유를 안 알린다');
  });
});

test('실패는 «어느 칸이» 막혔는지 말한다', () => {
  /* 「scal_scheds」만 보여 주면 아무도 못 읽는다. 사람 말로 적어야
     대표님이 「일정이 막혔다 / 담당자가 막혔다」를 구별해 알려 줄 수 있다. */
  const m = S.match(/const _NODE_KO=\{([^}]+)\}/);
  assert.ok(m, '칸 이름표가 없다');
  ['scal_scheds', 'scal_cos', 'scal_staff'].forEach(function (n) {
    assert.strictEqual(m[1].indexOf(n + ':') >= 0, true, n + ' 이름표가 없다');
  });
});

test('권한이 «아닌» 실패는 이유를 그대로 보여 준다', () => {
  /* ★ 이 고장에서 가장 뼈아픈 대목 — 「다시 시도해 주세요」만 뜨는 동안
     대표님도 나도 무엇이 막혔는지 알 수 없었다. 이유를 적으면 한 번에 잡힌다. */
  const a = S.indexOf('function _saveFailMsg');
  const fn = S.slice(a, S.indexOf('\nfunction ', a + 5));
  assert.ok(a > 0, '_saveFailMsg 가 없다');
  assert.strictEqual(/e\.code\|\|e\.message/.test(fn), true, '오류 내용을 안 읽는다');
  assert.strictEqual(/알려 주세요/.test(fn), true, '알려 달라는 말이 없다');
  assert.strictEqual(/다시 시도/.test(fn), false, '아직 「다시 시도」를 권한다');
});

test('되돌려진 저장은 «되돌려졌다» 고 말한다', () => {
  /* 서버가 저장을 되돌리면 이유가 안 온다. 전에는 영문 한 줄만 던져
     화면이 「다시 시도해 주세요」로 뭉갰다. */
  const a = S.indexOf('function fbPushRecordDelta(');
  const fn = S.slice(a, S.indexOf('\nfunction ', a + 5));
  assert.strictEqual(/되돌렸습니다|되돌려졌습니다/.test(fn), true, '되돌려진 것을 사람 말로 안 적는다');
  assert.strictEqual(/TX_NOT_COMMITTED/.test(fn), true, '되돌려진 것을 가릴 표가 없다');
});

test('저장 실패 뒤처리가 «오류를 받아» 판단한다', () => {
  /* 오류를 안 넘기면 무엇 때문에 실패했는지 알 길이 없어
     배지가 늘 「인터넷 확인」으로 남는다. */
  const a = S.indexOf('function _saveFinish');
  const fn = S.slice(a, S.indexOf('\nfunction ', a + 5));
  assert.strictEqual(/function _saveFinish\(\s*ok\s*,/.test(fn), true, '오류를 받지 않는다');
  assert.strictEqual(/_isDeniedErr\(\s*err\s*\)/.test(fn), true, '받은 오류를 안 본다');
  assert.strictEqual(/저장 권한 없음/.test(fn), true, '배지가 권한 문제를 말하지 않는다');
});

/* ── ② 붙여넣기용 규칙이 직원 저장을 허용하나 ── */

const RULES_FILE = 'docs/firebase-rules-전체-적용본.json';
const SCAL = ['scal_staff', 'scal_types', 'scal_cos', 'scal_scheds', 'scal_env',
  'scal_fieldState', 'scal_conflictMatrix', 'scal_roundlog', 'scal_erpTypeMap'];

test('붙여넣기용 규칙 파일이 문법부터 온전하다', () => {
  /* 규칙은 콘솔이 진짜다 — 이 파일은 «붙여넣을 원고» 다.
     문법이 깨진 원고를 붙이면 모든 앱이 한꺼번에 막힌다. */
  const raw = fs.readFileSync(path.join(ROOT, RULES_FILE), 'utf8');
  const doc = JSON.parse(raw);
  assert.ok(doc.rules && Object.keys(doc.rules).length > 30, '노드가 너무 적다 — 통째로 날아간 원고다');
});

test('일정관리 아홉 자리 모두 직원이 저장할 수 있다', () => {
  /* 하나만 빠뜨려도 그 하나 때문에 저장 전체가 실패한다
     (사업장·일정·유형이 함께 바뀌는 저장이 있다). */
  const doc = JSON.parse(fs.readFileSync(path.join(ROOT, RULES_FILE), 'utf8'));
  SCAL.forEach(function (n) {
    const w = doc.rules[n] && doc.rules[n]['.write'];
    assert.ok(w, n + ' 규칙이 없다');
    assert.strictEqual(/sign_in_provider|passkey/.test(w), true,
      n + ' 는 아직 관리자만 쓸 수 있다');
  });
});

test('통째로 지우는 것은 여전히 관리자만', () => {
  /* 조여 둔 뜻을 지킨다 — 직원이 실수로 노드를 «날려» 버리는 것은 막는다. */
  const doc = JSON.parse(fs.readFileSync(path.join(ROOT, RULES_FILE), 'utf8'));
  SCAL.forEach(function (n) {
    const w = doc.rules[n]['.write'];
    assert.strictEqual(/newData\.exists\(\)/.test(w), true, n + ' 에 지우기 방어가 없다');
    assert.strictEqual(/isAdmin/.test(w), true, n + ' 에 관리자 예외가 없다');
  });
});

test('규칙 원고가 일정관리 밖을 건드리지 않았다', () => {
  /* ★ 2026-08-05 에 옛 규칙 파일을 올려 사진첩·성과확인이 막힌 일이 있다.
     이 원고는 «살아 있는 규칙» 을 바탕으로 아홉 줄만 바꾼 것이어야 한다. */
  const doc = JSON.parse(fs.readFileSync(path.join(ROOT, RULES_FILE), 'utf8'));
  ['billing', 'presence', 'activeWriter', 'appBuild', 'uid_roles'].forEach(function (n) {
    assert.ok(doc.rules[n], n + ' 가 원고에서 사라졌다 — 붙이면 그 기능이 막힌다');
  });
});
