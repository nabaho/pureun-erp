'use strict';
/* 📄 등록증 요청 메일 (대표 승인 2026-09-02, 목업 안 ㉯ 「나」)
   ═══════════════════════════════════════════════════════════════════════════
   ㉮(이알피 번호 가져오기)로도 안 채워지는 곳 — 이알피에도 번호가 없는 회사 — 에
   사업자등록증 사본을 청한다.

   ■ ⚠⚠ 여기서 가장 센 규칙 — «여기서 보내지 않는다»
     밖으로 나가는 일이다. 이 길은 받는 곳을 골라 **메일 쓰기 화면으로 데려가는 것**까지다.
     글을 보고 「보내기」를 누르는 것은 사람이 한다. 기계가 스스로 보내는 길을 두지 않는다.

   ■ 새 발송기를 만들지 않았다
     이미 있는 묶음 메일(bulkMailStart)을 그대로 쓴다 — 15초 간격·시험 발송·예약 목록·
     수신거부·퇴사 걸러내기가 다 그쪽에 있다. 두 벌이 되면 한쪽만 고쳐진다.

   ■ 그 밖에 못 박는 것
     ① 이알피에도 번호가 없는 곳만 — ㉮ 로 채워질 곳에 메일을 보내면 안 된다
     ② 이미 청한 곳은 «다시 안 청한다» — 두 번 가면 그 뒤로 아무도 안 연다
     ③ 담당자 메일이 없으면 빠지고 «세어서 말한다»
     ④ 한 회사에 한 통 — 담당자가 여럿이어도 첫 사람에게만
     ⑤ 「청했다」는 **걸린 뒤에만** 적는다(실패했으면 다시 청할 수 있어야 한다)
     ⑥ 청함 표시는 기업정보함 제 자리에 — 이알피 원장에는 안 쓴다

   실행: node --test tests/cards-co-bizask.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { cutFn } = require('./cut-fn');

const R = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(R, 'pu-cards.html'), 'utf8');

function load(list, over) {
  const said = [];
  const ctx = {
    console, Object, Array, String, Number, Boolean, Math, Date, JSON, RegExp,
    digits: v => String(v || '').replace(/\D/g, ''),
    state: { mailBlock: {}, view: 'co', mailSent: false },
    toast: m => said.push(String(m)),
    render: () => {},
    coFilteredList: () => list || [],
    coListBust: () => {}, renderCoSoon: () => {},
    /* 걸러개는 «진짜»를 쓴다 — 대역으로 두면 수신거부·퇴사가 새어도 안 걸린다 */
    inLockedGroup: () => false,
    normEmail: v => String(v || '').trim().toLowerCase(),
    emailKey: v => String(v || '').trim().toLowerCase(),
    ErpMatch: { leftOfCard: it => !!(it && it.left) },
    Store: { mode: 'firebase', db: null }
  };
  Object.assign(ctx, over || {});
  ctx._said = said;
  vm.createContext(ctx);
  vm.runInContext([
    cutFn(SRC, 'function mailTargets('),
    cutFn(SRC, 'function coErpPinOf('),
    cutFn(SRC, 'function coBiznoFromErp('),
    cutFn(SRC, 'function coNoBizSplit('),
    cutFn(SRC, 'function coBizAskSplit('),
    SRC.match(/^const BIZ_ASK_SUBJECT = [^\n]*$/m)[0],
    SRC.match(/^const BIZ_ASK_BODY = \[[\s\S]*?\]\.join\('\\n'\);$/m)[0],
    'var _compose = null;',
    cutFn(SRC, 'function coBizAskStart(')
  ].join('\n'), ctx);
  return ctx;
}

/* 회사 하나 — cards 는 그 회사 명함들 */
const CO = (o) => Object.assign({ key: 'k1', name: '가나', bizno: '', erp: null,
  extra: {}, cards: [] }, o);
const CARD = (o) => Object.assign({ name: '홍길동', email: 'a@b.com', company: '가나' }, o);

/* ══════════ ⚠⚠ 여기서 보내지 않는다 ══════════ */

test('★★★ 「등록증 요청」이 «메일을 보내지 않는다» — 메일 쓰기로 데려갈 뿐이다', () => {
  const src = cutFn(SRC, 'function coBizAskStart(');
  assert.doesNotMatch(src, /postBulkMail|fetch\(|BULK_FN_URL|sendCompose|bulkSendAll/,
    '★★★ 누르면 메일이 바로 나갑니다 — 밖으로 나가는 일은 사람이 보고 누릅니다');
  assert.match(src, /state\.view='mail'/, '메일 쓰기로 데려가지 않습니다');
});

test('★★★ 새 발송기를 만들지 않았다 — 묶음 메일 길을 그대로 쓴다', () => {
  const src = cutFn(SRC, 'function coBizAskStart(');
  assert.match(src, /bulk:\s*to/, '★★★ 묶음 메일 자리(bulk)를 안 씁니다 — 두 벌이 되면 한쪽만 고쳐집니다');
  assert.match(src, /bulkStat:/, '묶음 셈을 안 넘깁니다 — 화면이 몇 곳인지 못 말합니다');
});

/* ══════════ ① 대상 가리기 ══════════ */

test('★★ 이알피에 번호가 있는 곳은 «청하지 않는다» — ㉮ 로 채워질 곳이다', () => {
  const c = load([
    CO({ key: 'a', erp: { id: 'co-1', company: '가나', bizNo: '1111111111' }, cards: [CARD()] }),
    CO({ key: 'b', erp: null, cards: [CARD()] })
  ]);
  const s = c.coBizAskSplit(c.coFilteredList());
  assert.deepEqual(Array.from(s.ok.map(x => x.co.key)), ['b'],
    '★★ 이알피에 번호가 있는 곳에 메일을 보냅니다 — 물어볼 필요가 없는 곳입니다');
});

test('★ 이미 번호가 있는 회사는 아예 안 든다', () => {
  const c = load([CO({ bizno: '111-11-11111', cards: [CARD()] })]);
  const s = c.coBizAskSplit(c.coFilteredList());
  assert.equal(s.ok.length, 0);
  assert.equal(s.noMail.length, 0);
});

/* ══════════ ② 두 번 안 청한다 ══════════ */

test('★★★ 이미 청한 곳은 «다시 안 청한다» — 두 번 가면 그 뒤로 아무도 안 연다', () => {
  const c = load([
    CO({ key: 'a', extra: { bizAskAt: 1756000000000 }, cards: [CARD()] }),
    CO({ key: 'b', cards: [CARD({ email: 'c@d.com' })] })
  ]);
  const s = c.coBizAskSplit(c.coFilteredList());
  assert.deepEqual(Array.from(s.ok.map(x => x.co.key)), ['b'],
    '★★★ 같은 요청이 두 번 나갑니다');
  assert.deepEqual(Array.from(s.already.map(o => o.key)), ['a']);
});

/* ══════════ ③④ 받는 곳 ══════════ */

test('★★ 담당자 메일이 없으면 빠지고 «세어서 말한다» — 조용히 빼면 왜 안 갔는지 모른다', () => {
  const c = load([
    CO({ key: 'a', cards: [CARD({ email: '' })] }),
    CO({ key: 'b', cards: [] }),
    CO({ key: 'c', cards: [CARD({ email: 'x@y.com' })] })
  ]);
  const s = c.coBizAskSplit(c.coFilteredList());
  assert.deepEqual(Array.from(s.ok.map(x => x.co.key)), ['c']);
  assert.deepEqual(Array.from(s.noMail.map(o => o.key)), ['a', 'b']);
  /* 화면에도 그 수가 나가야 한다 */
  c.coBizAskStart();
  assert.match(c._said.join(' '), /담당자 메일 없음 2/,
    '★★ 빠진 곳 수를 안 말합니다: ' + c._said.join(' '));
});

test('★ 한 회사에 «한 통»이다 — 담당자가 여럿이어도 첫 사람에게만', () => {
  const c = load([CO({ cards: [CARD({ name: '가', email: 'a@a.com' }),
                              CARD({ name: '나', email: 'b@b.com' })] })]);
  const s = c.coBizAskSplit(c.coFilteredList());
  assert.equal(s.ok.length, 1);
  assert.equal(s.ok[0].targets.length, 1, '★ 한 회사에 두 통이 갑니다');
  assert.equal(s.ok[0].targets[0].email, 'a@a.com');
});

test('★★★ 수신거부·퇴사는 «이미 있는 걸러개»가 막는다 — 새로 만들지 않았다', () => {
  const src = cutFn(SRC, 'function coBizAskSplit(');
  assert.match(src, /mailTargets\(/,
    '★★★ 수신거부·퇴사 걸러내기를 새로 짰습니다 — 두 벌이 되면 한쪽만 고쳐집니다');
  /* 그리고 진짜로 막히는지 돌려 본다 */
  const c = load([
    CO({ key: 'a', cards: [CARD({ noMail: true })] }),
    CO({ key: 'b', cards: [CARD({ left: true })] }),
    CO({ key: 'c', cards: [CARD({ email: 'ok@x.com' })] })
  ]);
  const s = c.coBizAskSplit(c.coFilteredList());
  assert.deepEqual(Array.from(s.ok.map(x => x.co.key)), ['c'],
    '★★★ 수신거부·퇴사한 사람에게 메일이 갑니다');
});

test('★★ 수신거부 목록도 실제로 막는다', () => {
  const c = load([CO({ cards: [CARD({ email: 'no@x.com' })] })],
    { state: { mailBlock: { 'no@x.com': 1 }, view: 'co', mailSent: false } });
  assert.equal(c.coBizAskSplit(c.coFilteredList()).ok.length, 0);
});

/* ══════════ 청할 곳이 없을 때 ══════════ */

test('★★ 청할 곳이 없으면 «데려가지 않고» 없다고 말한다 — 빈 편지창을 열지 않는다', () => {
  const c = load([CO({ cards: [CARD({ email: '' })] })]);
  c.coBizAskStart();
  assert.match(c._said.join(' '), /청할 곳이 없습니다/);
  assert.notEqual(c.state.view, 'mail', '★★ 받는 곳이 없는데 편지창을 열었습니다');
});

/* ══════════ 글 ══════════ */

test('★ 청하는 글이 «곳마다 바뀌는 자리»를 쓴다 — 묶음 메일 규칙 그대로', () => {
  const c = load([CO({ cards: [CARD()] })]);
  c.coBizAskStart();
  assert.match(c._compose.subject, /\{회사\}/, '제목에 회사 자리가 없습니다');
  assert.match(c._compose.body, /\{이름\}/, '본문에 이름 자리가 없습니다');
  assert.match(c._compose.body, /사업자등록증/, '무엇을 청하는지 안 적혀 있습니다');
  assert.match(c._compose.subject, /푸른노무법인/, '누가 보내는지 안 적혀 있습니다');
});

test('★ 받는 곳을 잡고 메일 쓰기로 간다', () => {
  const c = load([CO({ key: 'a', cards: [CARD({ email: 'a@a.com' })] }),
                  CO({ key: 'b', cards: [CARD({ email: 'b@b.com' })] })]);
  c.coBizAskStart();
  assert.equal(c.state.view, 'mail');
  assert.equal(c._compose.bulk.length, 2);
  assert.deepEqual(Array.from(c._compose.bizAskKeys), ['a', 'b'],
    '★ 어느 회사에 청했는지 안 들고 갑니다 — 「청했다」를 적을 수 없습니다');
});

/* ══════════ ⑤⑥ 「청했다」 표시 ══════════ */

test('★★★ 「청했다」는 보내기가 «걸린 뒤에만» 적는다', () => {
  const send = cutFn(SRC, 'async function bulkSendAll(');
  const at = send.indexOf('coBizAskStamp(');
  const okAt = send.indexOf('await postBulkMail(');
  assert.ok(at > 0, '★★★ 보낸 뒤 「청했다」를 안 적습니다 — 같은 요청이 또 나갑니다');
  assert.ok(at > okAt,
    '★★★ 보내기 «전»에 적습니다 — 실패했는데 청한 것으로 남아 다시 청할 수 없습니다');
  /* 실패 길(catch)에서는 안 적어야 한다 */
  const catchAt = send.indexOf('}catch(e){');
  assert.ok(at < catchAt, '★★★ 실패 길에서도 적습니다');
});

test('★★ 청함 표시는 기업정보함 제 자리에 — 이알피 원장에는 안 쓴다', () => {
  const src = cutFn(SRC, 'function coBizAskStamp(');
  assert.match(src, /coInfo\/'\s*\+\s*k\s*\+\s*'\/bizAskAt/,
    '★ 기업정보함 제 자리에 안 적습니다');
  assert.doesNotMatch(src, /data\/companies|data\/cases|data\/contracts/,
    '★★ 푸른이알피 원장을 건드립니다');
});

test('★ 적을 것이 없으면 서버를 안 만진다', () => {
  const hits = [];
  const c = load([], { Store: { mode: 'firebase',
    db: { ref: () => ({ update: u => { hits.push(u); return Promise.resolve(); } }) } } });
  vm.runInContext(cutFn(SRC, 'function coBizAskStamp(') + '\nvar DB_ROOT="pucards";', c);
  c.coBizAskStamp([]);
  assert.equal(hits.length, 0);
});

/* ══════════ 도구줄 ══════════ */

test('★ 단추는 «이알피에도 번호가 없는 곳»이 있을 때만 뜬다', () => {
  const bar = cutFn(SRC, 'function coNoBizBarHtml(');
  assert.match(bar, /s\.none\.length \?[\s\S]*coBizAskStart\(\)/,
    '★ 청할 곳이 없는데도 단추가 뜹니다');
});

test('★ 단추가 무엇을 하는지 말한다 — 밖으로 나가는 일이다', () => {
  const bar = cutFn(SRC, 'function coNoBizBarHtml(');
  assert.match(bar, /title="[^"]*사람이 보냅니다/,
    '★ 눌러도 바로 안 나간다는 것을 말하지 않습니다');
});
