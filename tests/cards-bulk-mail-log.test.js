/* 단체 메일이 «회사에도» 기록을 남긴다 (대표 지시 2026-09-03 「단체메일로 기록 남게」)

   여태 단체 메일은 기록을 하나도 안 남겼다 — 그래서 기업 상세의 「📤 보낸 서류」에
   「단체 메일로 보낸 것은 아직 기록이 남지 않습니다」라고 적어 두어야 했다.

   ★ 지켜야 하는 것
     ① 3걸음의 길(sentBatch + sentDocs)을 «그대로» 쓴다 — 새 자리를 만들면 기업 상세도
        「못 받은 곳」 거르개도 그 자리를 모른다.
     ② «걸린 뒤에만» 적는다 — 없는 발송 사실을 만들지 않는다.
     ③ «메일이 실제로 나간» 명함의 회사만 센다.
     ④ 기록에 실패해도 메일 보내기를 막지 않되, «조용히 넘기지도» 않는다.

     node --test tests/cards-bulk-mail-log.test.js */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'pu-cards.html'), 'utf8').split('\r\n').join('\n');

function fnBody(name) {
  const i = SRC.search(new RegExp('(?:^|\\n)(?:async )?function ' + name + '\\('));
  assert.ok(i >= 0, name + ' 을 찾지 못했습니다');
  const open = SRC.indexOf('{', i);
  let d = 0;
  for (let k = open; k < SRC.length; k++) {
    if (SRC[k] === '{') d++;
    else if (SRC[k] === '}') { d--; if (!d) return SRC.slice(i, k + 1); }
  }
  assert.fail(name + ' 의 끝을 찾지 못했습니다');
}
/* ⚠ 주석을 걷어 내고 본다 — 안 걷으면 «내가 쓴 설명»을 코드로 착각해 통과한다 */
const bare = s => String(s).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');

function load(extra) {
  const ctx = Object.assign({
    console,
    normEmail: e => String(e == null ? '' : e).trim().toLowerCase(),
    emailKey: e => String(e == null ? '' : e).trim().toLowerCase()
  }, extra || {});
  vm.createContext(ctx);
  vm.runInContext(fnBody('coCardKeyMap') + '\n' + fnBody('bulkCoKeys')
    + '\n' + fnBody('bulkSentName'), ctx);
  return ctx;
}

/* ── 명함 번호 → 회사 열쇠 ── */

test('★ 회사 열쇠 표를 «한 번에» 만든다 — 명함마다 4,159곳을 훑으면 백만 번이 넘는다', () => {
  const c = load({ coList: () => [
    { key: 'kA', cards: [{ id: 'c1' }, { id: 'c2' }] },
    { key: 'kB', cards: [{ id: 'c3' }] },
    { key: 'kC', cards: [] }
  ] });
  const m = c.coCardKeyMap();
  assert.equal(m.c1, 'kA');
  assert.equal(m.c2, 'kA');
  assert.equal(m.c3, 'kB');
  assert.equal(m.c9, undefined);
  /* «한 번만» 훑는지 — 부르는 함수가 coList 하나뿐인지 본다 */
  assert.ok(!/coKeyOfCard/.test(bare(fnBody('coCardKeyMap'))),
    '★ 명함마다 coKeyOfCard 를 부르면 회사 목록을 명함 수만큼 훑는다');
});

test('회사 목록이 아직 없어도 안 터진다', () => {
  const c = load({ coList: undefined });
  assert.equal(Object.keys(c.coCardKeyMap()).length, 0);
});

/* ── 실제로 나간 곳만 센다 ── */

const CARDS = [
  { id: 'c1', email: 'a@x.kr' },      /* kA — 나간다 */
  { id: 'c2', email: 'b@x.kr' },      /* kA — 나간다 (같은 회사, 한 번만 센다) */
  { id: 'c3', email: 'c@x.kr' },      /* kB — 수신거부라 ok 에 없다 */
  { id: 'c4', email: '' },            /* 주소 없음 */
  { id: 'c9', email: 'z@x.kr' }       /* 회사를 못 가림 */
];
const BYCARD = { c1: 'kA', c2: 'kA', c3: 'kB', c4: 'kC' };

test('★★ «메일이 실제로 나간» 명함의 회사만 센다 — 빠진 명함의 회사까지 세면 거짓이 된다', () => {
  const c = load();
  const ok = [{ email: 'a@x.kr' }, { email: 'b@x.kr' }];
  assert.equal(c.bulkCoKeys(CARDS, ok, BYCARD).join(','), 'kA',
    '★ 수신거부(c3)·주소없음(c4)의 회사가 「받았다」로 들어갔다');
});

test('★ 한 회사에 두 사람이면 «한 줄»만 — 같은 곳을 두 번 세지 않는다', () => {
  const c = load();
  const keys = c.bulkCoKeys(CARDS, [{ email: 'a@x.kr' }, { email: 'b@x.kr' }], BYCARD);
  assert.equal(keys.length, 1);
});

test('★ 회사를 못 가린 명함은 안 센다 — 어디에 남길지 알 수 없다', () => {
  const c = load();
  assert.equal(c.bulkCoKeys(CARDS, [{ email: 'z@x.kr' }], BYCARD).join(','), '');
});

test('보낼 곳이 없으면 빈 목록', () => {
  const c = load();
  assert.equal(c.bulkCoKeys(CARDS, [], BYCARD).length, 0);
  assert.equal(c.bulkCoKeys([], [{ email: 'a@x.kr' }], BYCARD).length, 0);
  assert.equal(c.bulkCoKeys(null, null, null).length, 0);
});

/* ── 기록에 남길 이름 ── */

test('★ 제목의 {회사}·{이름} 자리는 «빼고» 남긴다 — 곳마다 달라지는 자리다', () => {
  const c = load();
  assert.equal(c.bulkSentName('{회사} 2026년 근로계약서 안내'), '2026년 근로계약서 안내');
  assert.equal(c.bulkSentName('{이름} 님께 {회사} 연차 안내'), '님께 연차 안내');
});

test('다 빼서 남는 것이 없으면 「단체 메일」로 둔다 — 이름 없는 줄은 나중에 못 읽는다', () => {
  const c = load();
  assert.equal(c.bulkSentName('{회사}'), '단체 메일');
  assert.equal(c.bulkSentName(''), '단체 메일');
  assert.equal(c.bulkSentName(null), '단체 메일');
});

/* ── 걸린 뒤에만 적는다 ── */

test('★★ «걸린 뒤에만» 적는다 — 누르기만 하고 실패했으면 안 남는다', () => {
  const send = bare(fnBody('bulkSendAll'));
  const 걸기 = send.indexOf('await postBulkMail(');
  const 적기 = send.indexOf('logBulkMailSent(');
  assert.ok(걸기 > 0 && 적기 > 걸기,
    '★ 보내기보다 «먼저» 적으면 실패한 발송이 기록으로 남는다');
  /* try 안에 있어야 한다 — catch 로 빠지면 안 적힌다 */
  const catch자리 = send.indexOf('}catch(e){');
  assert.ok(적기 < catch자리, '★ 적는 자리가 catch 뒤에 있다');
});

test('★ 3걸음의 «그 길»을 쓴다 — 새 자리를 만들면 기업 상세도 거르개도 모른다', () => {
  const log = bare(fnBody('logBulkMailSent'));
  assert.match(log, /coSentBatchRec\(/, '묶음 줄을 3걸음의 모양으로 만들어야 한다');
  assert.match(log, /coSentBatchWrites\(/, '쓰는 길도 3걸음의 것이어야 한다');
  assert.match(log, /BULK_PATCH_CHUNK/, '모아서 써야 한다');
  assert.ok(!/sentDocs\/|sentBatch\/\$\{[^}]*\}\/`/.test(log.replace(/sentBatch`/g, '')),
    '자리를 손으로 다시 적으면 3걸음과 어긋난다');
});

test('★ 남긴 뒤 받아 둔 것을 버린다 — 안 버리면 방금 보낸 것이 안 보인다', () => {
  const log = bare(fnBody('logBulkMailSent'));
  assert.match(log, /delete _coSent\[k\]/, '기업 상세가 옛 기록을 그대로 본다');
  assert.match(log, /coBatchesBust\(\)/, '「못 받은 곳」 거르개가 새 묶음을 못 본다');
});

test('★★ 기록에 실패해도 «조용히 넘기지» 않는다 — 메일은 나갔는데 기록이 없으면 「안 보냈다」로 읽힌다', () => {
  const log = bare(fnBody('logBulkMailSent'));
  assert.match(log, /catch\(e\)\{[\s\S]*toast\(/, '★ 실패를 삼킨다');
  assert.match(log, /메일은 나갔지만/);
});

test('★ 보낼 곳이 없거나 서버가 아니면 아무것도 안 쓴다', () => {
  const log = bare(fnBody('logBulkMailSent'));
  assert.match(log, /if\(!keys\.length\) return;/);
  assert.match(log, /if\(Store\.mode !== 'firebase'\) return;/);
});

/* ── 누르기 전에 말한다 ── */

test('★ 몇 곳에 기록이 남는지 «누르기 전»에 말한다 — 모르고 누르면 안 된다', () => {
  const send = fnBody('bulkSendAll');
  assert.match(send, /「📤 보낸 서류」에 기록이 남습니다/);
  assert.match(send, /c\.bulkCoKeys && c\.bulkCoKeys\.length/,
    '남길 곳이 없으면 그 말을 안 해야 한다');
});

test('★ 묶음을 «만들 때» 회사 열쇠를 적어 둔다 — 보낼 때는 명함 번호가 없다', () => {
  const start = bare(fnBody('bulkMailStart'));
  assert.match(start, /bulkCoKeys: bulkCoKeys\(/);
  assert.match(start, /coCardKeyMap\(\)/);
  /* mailTargets 가 명함 번호를 안 담는다는 것이 이 설계의 까닭이다 — 그대로인지 본다 */
  const mt = fnBody('mailTargets');
  assert.ok(!/id\s*:\s*it\.id/.test(mt),
    '★ mailTargets 에 명함 번호를 담으면 그 값이 서버로 나간다');
});

/* ── 기업 상세의 각주가 사실을 말한다 ── */

test('★★ 「단체 메일은 기록이 안 남는다」는 각주를 «고쳤다» — 이제 남는다', () => {
  const html = fnBody('coSentHtml');
  assert.ok(!/단체 메일로 보낸 것은 아직 기록이 남지 않습니다/.test(html),
    '★ 이제 남는데 안 남는다고 적혀 있다 — 화면이 거짓말을 한다');
  assert.match(html, /단체 메일과 전 사업장 배포도 여기 함께 나옵니다/);
});
