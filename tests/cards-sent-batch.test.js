/* 전 사업장 배포 — 3걸음 (대표 지시 2026-09-03)
 *   「취업규칙 이후에 근로계약서와 연차 관련 기타 서류 등 모든 사업장에 송부되었던
 *    서류를 한번에 데이터함에 보관하려고 한다.」
 *
 * ■ 1·2걸음이 «보낸 것을 회사 눈으로» 보게 했다. 이 걸음은 «한번에 보내고 한번에 남긴다».
 *
 * ■ ★★ 이 저장소가 이미 배운 것을 그대로 지킨다
 *   ① 여기서 «보내지 않는다» — 밖으로 나가는 일이라 사람이 「보내기」를 누른다
 *      (2026-09-02 등록증 요청에서 세운 규칙)
 *   ② 기록은 «보내기가 걸린 뒤에만» — 실패했으면 안 적어야 다시 보낼 수 있다
 *   ③ ★ 모아서 쓴다 — 312곳을 한 곳씩 쓰면 2026-08-16 이 되풀이된다
 *   ④ ★ 계약이 끝난 곳은 뺀다 — 끝난 곳에 서식을 보내면 안 된다
 *   ⑤ ★ 못 보낸 곳을 «세어서 말한다» — 조용히 빠뜨리면 아무도 모른다
 *   ⑥ 걸러개를 새로 짜지 않는다 — mailTargets 가 수신거부·퇴사·잠긴 폴더를 이미 본다
 *   ⑦ 회사 열쇠를 새로 만들지 않는다 — 이름으로 맞추면 남의 회사에 붙는다
 * 실행: node --test tests/cards-sent-batch.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'pu-cards.html'), 'utf8');

function 떼어오기(이름들, extra) {
  const ctx = Object.assign({ console, Date, Math, Number, String, Object, Array, Error }, extra || {});
  vm.createContext(ctx);
  for (const n of 이름들) {
    const at = src.indexOf('function ' + n + '(');
    assert.ok(at > 0, n + ' 을 찾지 못했습니다');
    let d = 0, i = src.indexOf('{', at);
    for (; i < src.length; i++) {
      if (src[i] === '{') d++;
      else if (src[i] === '}') { d--; if (!d) break; }
    }
    vm.runInContext(src.slice(at, i + 1), ctx);
  }
  return ctx;
}

/* ── 대상 가르기 ── */
function 가르개(opts) {
  const 잠김 = (opts || {}).locked || {};
  /* ⚠ 곁 함수는 «떼어오지 않고» 세워 둔다 — 진짜 것을 떼어오면 그것이 또 다른
     전역을 찾아 조용히 빗나간다. 여기서 재려는 것은 sentBatchSplit·mailTargets 둘뿐이다. */
  return 떼어오기(['sentBatchSplit', 'mailTargets'], {
    state: { mailBlock: {} },
    ErpMatch: { match: (co) => ({ left: !!co.closed }), leftOfCard: (c) => !!c.left },
    inLockedGroup: (it) => !!잠김[it.id],
    normEmail: (v) => String(v || '').trim().toLowerCase(),
    emailKey: (v) => String(v || '')
  });
}

const 회사 = (key, cards, closed) => ({ key, name: key, cards, closed: !!closed });

test('★④⑤ 계약이 끝난 곳은 «빼고», 못 보낸 곳은 «세어서» 말한다', () => {
  const ctx = 가르개();
  const list = [
    회사('co1', [{ id: 'c1', email: 'a@b.c', name: '홍길동' }]),
    회사('co2', [{ id: 'c2', email: '', name: '메일없음' }]),
    회사('co3', [{ id: 'c3', email: 'd@e.f', name: '끝난곳' }], true)
  ];
  const s = ctx.sentBatchSplit(list);
  /* ⚠ vm 안에서 만들어진 배열은 «다른 realm» 의 Array 다 — deepStrictEqual 은 내용이
     같아도 프로토타입이 달라 틀렸다고 한다. Array.from 으로 이쪽 realm 으로 옮긴다.
     (실제로 여기서 「['co1'] 인데 ['co1'] 과 다르다」를 만났다.) */
  assert.deepEqual(Array.from(s.ok, (x) => x.co.key), ['co1'], '★ 보낼 곳을 잘못 골랐습니다');
  assert.equal(s.closed.length, 1, '★ 계약 끝난 곳에 서식이 나갑니다');
  assert.equal(s.noMail.length, 1, '★ 못 보낸 곳을 안 셉니다 — 조용히 빠지면 아무도 모릅니다');
});

test('★⑥ 걸러개를 새로 짜지 않는다 — 잠긴 폴더·퇴사가 그대로 걸린다', () => {
  const ctx = 가르개({ locked: { c9: 1 } });
  const s = ctx.sentBatchSplit([
    회사('co9', [{ id: 'c9', email: 'x@y.z', name: '잠긴폴더' }]),
    회사('co8', [{ id: 'c8', email: 'p@q.r', name: '퇴사', left: true }])
  ]);
  assert.equal(s.ok.length, 0, '★ 잠긴 폴더·퇴사 담당자에게 나갑니다');
  assert.equal(s.noMail.length, 2, '빠진 곳을 안 셉니다');
});

test('한 회사에 «한 통»만 — 담당자가 여럿이어도', () => {
  const ctx = 가르개();
  const s = ctx.sentBatchSplit([회사('co1', [
    { id: 'c1', email: 'a@b.c', name: '첫사람' }, { id: 'c2', email: 'x@y.z', name: '둘째' }])]);
  assert.equal(s.ok.length, 1);
  assert.equal(s.ok[0].target.email, 'a@b.c', '★ 한 회사에 두 통이 갑니다');
});

/* ── 쓰기 지도 ── */
function 지도(n) {
  const ctx = 떼어오기(['sentBatchWrites', 'sentKindOf'], { SENT_KINDS: [
    '자료', '취업규칙', '근로계약서', '연차', '임금', '4대보험', '그 밖'] });
  vm.runInContext('var SENT_BATCH_CHUNK = ' + (src.match(/SENT_BATCH_CHUNK = (\d+)/) || [, '200'])[1] + ';', ctx);
  const rows = [];
  for (let i = 0; i < n; i++) rows.push({ coKey: 'co' + i, card: 'c' + i, who: '담당' + i });
  return { ctx, rows, plan: ctx.sentBatchWrites(
    { id: 'b1', kind: '근로계약서', at: 1757000000000, by: 'me@x.kr', names: ['2026 근로계약서'],
      missNoMail: 4, missClosed: 2 }, rows) };
}

test('★★③ 모아서 쓴다 — 312곳을 한 곳씩 쓰면 2026-08-16 이 되풀이된다', () => {
  const { plan } = 지도(312);
  const 묶음쓰기 = plan.writes.filter((w) => !w.path);
  assert.ok(묶음쓰기.length >= 2 && 묶음쓰기.length <= 4,
    '★★ 312곳을 ' + 묶음쓰기.length + '번에 씁니다 — 한 곳씩이면 312번입니다');
  for (const w of 묶음쓰기) {
    assert.equal(w.merge, true, '★ set 으로 쓰면 앞서 쓴 조각이 통째로 지워집니다');
    assert.ok(Object.keys(w.value).length <= 200, '한 번에 너무 많이 담습니다');
  }
  /* 모든 회사가 빠짐없이 담겼는가 */
  const 담긴것 = new Set();
  묶음쓰기.forEach((w) => Object.keys(w.value).forEach((k) => 담긴것.add(k.split('/')[1])));
  assert.equal(담긴것.size, 312, '★ 쪼개면서 ' + (312 - 담긴것.size) + '곳을 잃었습니다');
});

test('★⑤ 묶음이 «못 보낸 수»를 들고 있다 — 나중에도 셀 수 있게', () => {
  const { plan } = 지도(3);
  assert.equal(plan.head.sent, 3);
  assert.equal(plan.head.missNoMail, 4, '★ 담당자 메일 없어 빠진 수를 안 남깁니다');
  assert.equal(plan.head.missClosed, 2, '★ 계약 끝나 빠진 수를 안 남깁니다');
  assert.equal(plan.head.kind, '근로계약서');
});

test('★ 회사 줄이 «묶음 번호»를 들고 있다 — 되돌릴 수 있으려면', () => {
  const { plan } = 지도(2);
  const 줄 = plan.writes.find((w) => !w.path).value;
  for (const k of Object.keys(줄)) {
    assert.match(k, /^sentDocs\/co\d+\/bb1$/, '★ 자리 이름이 묶음을 안 가리킵니다: ' + k);
    assert.equal(줄[k].batch, 'b1', '★ 묶음 번호가 없으면 한꺼번에 되돌릴 수 없습니다');
  }
});

test('★ 받는 «메일 주소»는 회사 쪽에 안 남긴다 — 전 직원이 보는 자리다', () => {
  const { plan } = 지도(2);
  const 글 = JSON.stringify(plan.writes);
  assert.ok(글.indexOf('@') < 0 || 글.indexOf('me@x.kr') >= 0,
    '주소가 새고 있습니다');
  const 줄 = plan.writes.find((w) => !w.path).value;
  for (const k of Object.keys(줄)) {
    assert.ok(!('to' in 줄[k]) && !('email' in 줄[k]),
      '★ 회사 기록에 받는 주소가 남았습니다 — 이름이면 됩니다');
  }
});

/* ── 화면이 지키는 것 ── */
test('★★① 여기서 «보내지 않는다» — 사람이 「보내기」를 누른다', () => {
  const at = src.indexOf('function sentBatchStart(');
  assert.ok(at > 0, '배포 준비 함수가 없습니다');
  const fn = src.slice(at, src.indexOf('\nconst SENT_BATCH_BODY', at));
  assert.ok(!/postBulkMail|fetch\(/.test(fn),
    '★★ 누르면 바로 나갑니다 — 밖으로 나가는 일은 사람이 눌러야 합니다');
  assert.match(fn, /state\.view = 'mail'/, '메일 쓰기로 데려가지 않습니다');
  assert.match(fn, /_compose/, '묶음 메일 길을 안 씁니다 — 발송기를 새로 만들면 안 됩니다');
  /* 못 보낸 곳을 화면이 말하는가 */
  assert.match(fn, /담당자 메일 없음/, '★ 빠진 곳을 안 알려 줍니다');
  assert.match(fn, /계약 끝남/, '★ 계약 끝나 빠진 곳을 안 알려 줍니다');
});

test('★★② 기록은 «보내기가 걸린 뒤에만»', () => {
  const at = src.indexOf('async function bulkSendAll()');
  const fn = src.slice(at, src.indexOf('\nasync function sendCompose', at));
  const 보낸자리 = fn.indexOf('await postBulkMail');
  const 적는자리 = fn.indexOf('sentBatchStamp(');
  assert.ok(보낸자리 > 0 && 적는자리 > 보낸자리,
    '★★ 보내기 «전»에 기록합니다 — 실패해도 「보냈다」가 남아 다시 못 보냅니다');
  /* 배포 준비 자리에서는 아예 안 적어야 한다 */
  const st = src.indexOf('function sentBatchStart(');
  assert.ok(src.slice(st, src.indexOf('\nconst SENT_BATCH_BODY', st)).indexOf('sentBatchStamp') < 0,
    '★★ 준비하면서 기록합니다');
});

test('★⑦ 회사 열쇠를 새로 만들지 않는다 — 이름으로 맞추면 남의 회사에 붙는다', () => {
  const at = src.indexOf('function sentBatchStart(');
  const fn = src.slice(at, src.indexOf('\nconst SENT_BATCH_BODY', at));
  assert.match(fn, /x\.co\.key/, '★ 회사 열쇠를 안 씁니다');
  assert.ok(!/normName|linkName|companyName ===|\.name ===/.test(fn),
    '★ 이름으로 회사를 맞추고 있습니다');
  /* 열쇠가 빈 줄은 아예 안 넣는다 — 남의 회사에 붙느니 없는 편이 낫다 */
  assert.match(fn, /filter\(r => r\.coKey\)/, '★ 열쇠 없는 줄이 섞입니다');
});

test('배포 띠는 «지금 보이는 목록»이 대상임을 수로 말하고, 관리자에게만 보인다', () => {
  const at = src.indexOf('function coSentBatchBarHtml()');
  assert.ok(at > 0, '배포 띠가 없습니다');
  const fn = src.slice(at, src.indexOf('\nfunction ', at + 10));
  assert.match(fn, /state\.isAdmin/, '★ 전 사업장에 나가는 일인데 아무나 봅니다');
  assert.match(fn, /coFilteredList/, '★ 지금 보이는 목록이 아닌 것을 대상으로 삼습니다');
  assert.match(fn, /곳<\/span>/, '★ 몇 곳에 가는지 안 적으면 4,147곳에 갈 뻔합니다');
  assert.match(fn, /여기서 보내지 않습니다/, '누르면 바로 나가는 줄 압니다');
});
