/* 일정관리 편집 잠금이 «거짓말» 을 한 일 (2026-08-17)
   실제 화면: 「🔒 다른 사용자님이 이 사업장을 다른 창에서 편집 중입니다」
   실제 서버: activeWriter/gov_consulting 에 «살아 있는 잠금이 하나도 없었다»
             (김동현 것 101초·146초 전 = 이미 만료)

   ★ 뿌리 — 잠금 규칙이 두 벌이었다.
     · 획득(acquire): 「남의 것이 살아 있지 않으면 가져온다」  ← 맞다
     · 저장 전 확인(verify): 「내 것 «그리고» 신선할 때만 통과」 ← 더 엄하다
     내 잠금이 사라지거나(연결 끊김·onDisconnect) 낡으면 verify 가 거부하고,
     그 자리에서 holder(=null)를 「다른 사용자」로 둔갑시켜 남 탓을 했다.
   ★ 배경 탭은 브라우저가 타이머를 1분 이상으로 늦춘다 — 12초 심장박동은 안 뛴다.
     그러니 「내 것이 낡았다」는 흔한 일이고, 저장을 막을 이유가 아니다. */
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'gov-consulting.html'), 'utf8');
const bare = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
const S = bare(SRC);

const TTL = 45000;
function load() {
  const a = S.indexOf('function _canTakeEditLock');
  assert.ok(a > 0, '_canTakeEditLock 이 없다 — 규칙이 한 곳에 모이지 않았다');
  const b = S.indexOf('function _loseCompanyEditLock');
  const src = S.slice(a, b);
  const ctx = {
    Date, String,
    EDIT_TAB_ID: 'MY_TAB',
    EDIT_LOCK_TTL: TTL,
    _editLockFresh: (v) => !!(v && v.tabId && Date.now() - (+v.at || 0) < TTL),
  };
  vm.createContext(ctx);
  vm.runInContext(src + '\nthis.canTake=_canTakeEditLock; this.msg=_editLockedMessage;', ctx);
  return ctx;
}

/* ── 언제 막고 언제 통과하나 ── */

test('남의 «살아 있는» 잠금만 막는다', () => {
  const { canTake } = load();
  assert.strictEqual(canTake({ tabId: 'OTHER', at: Date.now(), owner: '권형하' }), false,
    '남이 지금 잡고 있는데 가져간다 — 동시 수정이 뚫린다');
});

test('남의 «낡은» 잠금은 가져온다', () => {
  const { canTake } = load();
  assert.strictEqual(canTake({ tabId: 'OTHER', at: Date.now() - TTL - 1000, owner: '권형하' }), true,
    '만료된 잠금 때문에 영영 막힌다');
});

test('내 잠금이 «낡아도» 가져온다 — 배경 탭에서 흔한 일이다', () => {
  /* ★ 이 한 줄이 이번 고장의 핵심. 전에는 여기서 막고 남 탓을 했다. */
  const { canTake } = load();
  assert.strictEqual(canTake({ tabId: 'MY_TAB', at: Date.now() - TTL - 1000 }), true,
    '내 잠금이 낡았다고 내 저장을 막는다');
});

test('잠금이 «사라졌으면» 다시 세운다', () => {
  /* 연결이 한 번 끊기면 onDisconnect 가 서버 잠금을 지운다.
     그때 「못 세운다」고 하면 다시 열기 전까지 저장이 영영 막힌다. */
  const { canTake } = load();
  assert.strictEqual(canTake(null), true, '없는 잠금 때문에 막힌다');
  assert.strictEqual(canTake(undefined), true);
  assert.strictEqual(canTake({}), true, '빈 기록 때문에 막힌다');
});

test('내 잠금이 신선하면 당연히 통과', () => {
  const { canTake } = load();
  assert.strictEqual(canTake({ tabId: 'MY_TAB', at: Date.now() }), true);
});

/* ── 문구가 거짓말을 하지 않나 ── */

test('누가 잡았는지 «모를» 때 남 탓을 하지 않는다', () => {
  /* ★ 서버에 잠금이 하나도 없는데 「다른 사용자님이 편집 중」이라고 했다.
     그 말을 믿으면 사람은 기다리기만 하고, 영영 못 고친다. */
  const { msg } = load();
  [null, undefined, {}, { tabId: 'x' }].forEach(function (v) {
    const m = msg(v);
    assert.strictEqual(/다른 사용자/.test(m), false, '아직 남 탓을 한다: ' + m);
    assert.strictEqual(/편집 중/.test(m), false, '아직 누군가 편집 중이라고 한다: ' + m);
    assert.strictEqual(/만료/.test(m), true, '무슨 일인지 안 알려 준다: ' + m);
  });
});

test('정말 남이 잡고 있으면 «이름을 대고» 말한다', () => {
  const { msg } = load();
  const m = msg({ tabId: 'OTHER', at: Date.now(), owner: '권형하' });
  assert.strictEqual(/권형하/.test(m), true, '누가 잡고 있는지 안 알려 준다');
  assert.strictEqual(/편집 중/.test(m), true);
});

/* ── 세 곳이 «같은» 규칙을 쓰나 ── */

test('획득·저장 전 확인·심장박동이 모두 한 규칙을 쓴다', () => {
  /* 규칙이 두 벌이면 반드시 어긋난다 — 이번 고장이 바로 그것이다. */
  ['acquireCompanyEditLock', 'verifyCompanyEditLock', '_startCompanyEditHeartbeat'].forEach(function (n) {
    const a = S.indexOf('function ' + n);
    assert.ok(a > 0, n + ' 이 없다');
    const b = S.indexOf('\nfunction ', a + 5);
    const e = S.indexOf('\nasync function ', a + 5);
    const end = Math.min(b < 0 ? S.length : b, e < 0 ? S.length : e);
    const fn = S.slice(a, end);
    assert.strictEqual(/_canTakeEditLock\(/.test(fn), true, n + ' 이 제 규칙을 따로 쓴다');
  });
});

test('잠금 판단을 손으로 다시 쓴 자리가 없다', () => {
  /* 같은 판단을 베껴 쓰면 한쪽만 고쳐지고 또 어긋난다. */
  const hand = (S.match(/tabId\s*===\s*EDIT_TAB_ID/g) || []).length;
  const inCanTake = (S.slice(S.indexOf('function _canTakeEditLock'),
    S.indexOf('function _editLockedMessage')).match(/tabId\s*===\s*EDIT_TAB_ID/g) || []).length;
  /* 남는 것은 «내 것인지» 만 보는 자리(지역 잠금 확인·해제)까지다.
     잠금을 «가져올지» 판단하는 자리는 _canTakeEditLock 하나여야 한다. */
  assert.strictEqual(inCanTake, 1, '_canTakeEditLock 안에 판단이 없다');
  assert.ok(hand <= 4, '잠금 판단을 손으로 쓴 자리가 너무 많다 (지금 ' + hand + '곳)');
});
