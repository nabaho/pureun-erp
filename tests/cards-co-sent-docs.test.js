/* 📤 이 회사에 보낸 서류 — 1걸음 (대표 지시 2026-09-03)
   「취업규칙 이후에 근로계약서와 연차 관련 기타 서류 등 모든 사업장에 송부되었던 서류를
    한번에 데이터함에 보관하려고 한다」

   ★ 1걸음의 약속 — «서버에 새로 쓰는 것이 하나도 없다». 이미 쌓여 있는 보낸 기록
     (pucards/sendLog)을 «회사 눈»으로 모아 보여 줄 뿐이다.

   ⚠ 이 검사는 글자를 찾지 않고 «떠서 돌린다». 원문에서 글자만 찾는 검사는 기능을
     꺼 버려도 통과한다(이 저장소가 하루에 세 번 겪은 실수).

     node --test tests/cards-co-sent-docs.test.js */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'pu-cards.html'), 'utf8').split('\r\n').join('\n');

function fnBody(name) {
  const i = SRC.indexOf('\nfunction ' + name + '(');
  assert.ok(i >= 0, name + ' 을 찾지 못했습니다');
  const open = SRC.indexOf('{', i);
  let d = 0;
  for (let k = open; k < SRC.length; k++) {
    if (SRC[k] === '{') d++;
    else if (SRC[k] === '}') { d--; if (!d) return SRC.slice(i, k + 1); }
  }
  assert.fail(name + ' 의 끝을 찾지 못했습니다');
}
function slice(from, to) {
  const a = SRC.indexOf(from), b = SRC.indexOf(to, a + 1);
  assert.ok(a > 0 && b > a, '표식을 못 찾았다: ' + from);
  return SRC.slice(a, b);
}

/* 📤 한 벌을 통째로 떠서 돌린다.
   ⚠ window 도 PuRulesHistory 도 «일부러 안 넣는다» — 취업규칙을 여기서 또 그리면
     ReferenceError 로 터진다(위 업무 이력 표와 두 번 그리는 것을 막는 장치다). */
function load(extra) {
  const ctx = Object.assign({
    esc: s => String(s == null ? '' : s).replace(/[&<>"']/g,
      c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
    state: { sendLog: {} },
    console
  }, extra || {});
  /* ⚠ 2026-09-03: 칸이 «한 줄 설명»(hintLine)을 부른다 — 진짜를 함께 싣는다 */
  const code = fnBody('hintLine') + '\n' + fnBody('sendLogList') + '\n'
    + slice('const CO_SENT_MAX_CARDS = 30;', 'function coDetailPanelHtml(o){');
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  return ctx;
}

const card = (id, name, t) => ({ id, name, updatedAt: t || 0 });
const log = (at, o) => Object.assign({ at, by: '', to: '', names: [], set: '' }, o || {});

/* ── 여러 사람의 기록이 «한 회사»로 모인다 ── */

test('★ 두 사람에게 흩어진 보낸 기록이 한 줄기로 모인다 — 최근 것이 위', () => {
  const c = load();
  const rows = c.coSentList(
    [card('c1', '김대리', 200), card('c2', '이과장', 100)],
    {
      c1: { a: log(1000, { names: ['제안서'], by: 'na@pureun.kr' }) },
      c2: { b: log(3000, { names: ['계약서'], by: 'ha@pureun.kr' }) }
    });
  assert.equal(rows.length, 2, '두 사람 몫이 다 모여야 한다');
  assert.equal(rows[0].what, '계약서', '최근 것이 위다');
  assert.equal(rows[0].who, '이과장', '누구에게 갔는지가 줄에 남아야 한다');
  assert.equal(rows[0].by, 'ha', '보낸 사람은 메일 앞부분만');
  assert.equal(rows[1].what, '제안서');
  assert.equal(rows[1].who, '김대리');
});

test('묶음으로 보낸 것은 묶음 이름이 남는다 · 자료 이름이 없으면 「자료」', () => {
  const c = load();
  const rows = c.coSentList([card('c1', '김대리')], {
    c1: { a: log(2000, { set: '신규계약 묶음', names: ['제안서', '계약서'] }),
          b: log(1000, { names: [] }) }
  });
  assert.equal(rows[0].set, '신규계약 묶음');
  assert.equal(rows[0].what, '제안서 · 계약서');
  assert.equal(rows[1].what, '자료', '이름이 없다고 빈 줄을 그리면 안 된다');
});

test('보낸 날은 YYYY-MM-DD 글자로 짓는다 · 시각이 없으면 빈 글자', () => {
  const c = load();
  const d = new Date(2026, 8, 3, 14, 20);      /* 2026-09-03 */
  assert.equal(c.coSentDay(d.getTime()), '2026-09-03');
  assert.equal(c.coSentDay(0), '', '시각이 없으면 1970년을 적으면 안 된다');
  assert.equal(c.coSentDay(null), '');
});

/* ── 서버를 몇 번 부르나 ── */

test('★ 이미 읽어 둔 명함은 다시 안 물어본다 — 두 번째로 열 때는 조회가 0번', () => {
  const c = load();
  const cards = [card('c1', '김'), card('c2', '이')];
  assert.deepEqual(c.coSentToRead(cards, {}), ['c1', 'c2']);
  assert.deepEqual(c.coSentToRead(cards, { c1: {}, c2: {} }), [],
    '받아 둔 것을 또 부르면 패널을 열 때마다 돈이 나간다');
  assert.deepEqual(c.coSentToRead(cards, { c1: {} }), ['c2']);
});

test('★ 사람이 아주 많은 회사는 최근 30명분만 읽는다', () => {
  const c = load();
  const many = [];
  for (let i = 0; i < 31; i++) many.push(card('c' + i, '사람' + i, i));  /* i 클수록 최근 */
  const ids = c.coSentToRead(many, {});
  assert.equal(ids.length, 30, '패널 한 번 여는 데 서른한 번 물어보면 안 된다');
  assert.equal(ids[0], 'c30', '최근 명함부터 읽는다');
  assert.ok(ids.indexOf('c0') < 0, '가장 오래된 것이 잘린다');
});

test('자른 사실을 «화면에 적는다» — 안 적으면 안 읽은 몫이 「안 보냈다」로 보인다', () => {
  const c = load();
  const many = [];
  for (let i = 0; i < 31; i++) many.push(card('c' + i, '사람' + i, i));
  const html = c.coSentHtml({ cards: many });
  assert.match(html, /31명 가운데 최근 30명분만/);

  const few = c.coSentHtml({ cards: [card('c1', '김')] });
  assert.doesNotMatch(few, /명분만/, '다 읽었는데 잘랐다고 말하면 안 된다');
});

test('세는 수와 그리는 줄 수가 같다 — 안 읽은 명함 몫을 세면 안 된다', () => {
  const c = load();
  const many = [];
  const logs = {};
  for (let i = 0; i < 31; i++) { many.push(card('c' + i, '사람' + i, i)); logs['c' + i] = { a: log(1000 + i) }; }
  c.state.sendLog = logs;
  const html = c.coSentHtml({ cards: many });
  assert.match(html, /보낸 서류 30건/, '읽어 온 30명분만 센다');
  assert.equal(html.split('<div class="cof">').length - 1, 30, '개수와 줄 수가 어긋나면 안 된다');
});

/* ── 없는 것을 있는 척하지 않는다 ── */

test('★ 기록이 없으면 그렇게 말한다 — 그리고 «무엇이 안 잡히는지»도 말한다', () => {
  const c = load();
  const html = c.coSentHtml({ cards: [card('c1', '김대리')] });
  assert.match(html, /보낸 서류 0건/);
  assert.match(html, /아직 보낸 기록이 없습니다/);
  /* ⚠ 2026-09-03 대표 지시로 설명이 «한 줄 + 말풍선»이 됐다.
     화면에는 한 마디만 나오고, 나머지는 말풍선(title)에 담긴다 — 둘 다 있어야 한다.
     말풍선에서 빠지면 「기록 없음」이 「안 보냈다」로 읽힌다. */
  const 말풍선 = (html.match(/title="([^"]*)"/) || [])[1] || '';
  assert.match(html, /자료함에서 보낸 것만 잡힙니다/, '화면에 나갈 한 마디가 없다');
  assert.match(말풍선, /단체 메일/, '단체 메일은 기록이 안 남는다 — 이 말이 없으면 「안 보냈다」로 읽힌다');
  assert.match(말풍선, /취업규칙 회차는 위/, '취업규칙을 어디서 보는지 길을 알려 준다');
  assert.ok(html.indexOf('<i class="hq">?</i>') > 0, '말풍선이 있다는 표시가 없으면 아무도 안 올려 본다');
});

test('★ 취업규칙을 여기서 다시 그리지 않는다 — 이미 업무 이력 표에 갈래로 있다', () => {
  /* window 도 PuRulesHistory 도 없는 자리에서 돌렸는데 살아 있다 = 안 부른다는 뜻이다.
     ⚠ 글자 찾기로는 못 잡는다(주석에 적힌 이름까지 걸린다). */
  const c = load();
  assert.equal(typeof c.window, 'undefined');
  const html = c.coSentHtml({ cards: [card('c1', '김')] });
  assert.doesNotMatch(html, /취업규칙 \d+회차|rules\.html/, '회차 목록을 두 번 그리면 안 된다');
  assert.ok(html.length > 0);
});

/* ── 읽어 오기 ── */

test('★ 안 읽은 명함 수만큼만 부르고, 다 오면 콜백은 «한 번»만', () => {
  const seen = [];
  let done = 0;
  const c = load({ loadSendLog: (id, cb) => { seen.push(id); cb(); } });
  c.state.sendLog = { c1: {} };
  c.loadCoSent({ cards: [card('c1', '김'), card('c2', '이'), card('c3', '박')] }, () => { done++; });
  assert.deepEqual(seen.sort(), ['c2', 'c3'], '받아 둔 c1 은 안 부른다');
  assert.equal(done, 1, '콜백이 여러 번이면 칸을 여러 번 그린다');
});

test('부를 것이 하나도 없어도 콜백은 온다 — 안 오면 칸이 영영 비어 있다', () => {
  let done = 0;
  const c = load({ loadSendLog: () => { assert.fail('부를 것이 없는데 불렀다'); } });
  c.state.sendLog = { c1: {} };
  c.loadCoSent({ cards: [card('c1', '김')] }, () => { done++; });
  assert.equal(done, 1);
});

test('늦게 오는 답도 다 기다린다 — 하나라도 안 왔는데 그리면 줄이 빠진다', () => {
  const waits = [];
  let done = 0;
  const c = load({ loadSendLog: (id, cb) => waits.push(cb) });
  c.loadCoSent({ cards: [card('c1', '김'), card('c2', '이')] }, () => { done++; });
  assert.equal(done, 0, '아직 하나도 안 왔다');
  waits[0]();
  assert.equal(done, 0, '하나만 왔는데 그리면 안 된다');
  waits[1]();
  assert.equal(done, 1);
});

/* ── 패널에 놓인 자리 ── */

test('★ 「보낸 것」 칸은 「받은 것」 «바로 아래»에 있다 — 두 축이 나란히 보여야 한다', () => {
  const body = slice('function coDetailPanelHtml(o){', 'function openCoDetailPanel(');
  const got = body.indexOf('coDocsHtml(o)');
  const sent = body.indexOf('id="coSentBox"');
  const people = body.indexOf('이 회사 사람');
  assert.ok(got > 0 && sent > got, '보낸 것이 받은 것보다 위면 축이 뒤집힌다');
  assert.ok(people > sent, '사람 목록보다는 위다');
  assert.equal(body.split('id="coSentBox"').length - 1, 1, '칸이 둘이면 하나는 늘 비어 있다');
});

test('★ 받은 것에 📥 · 보낸 것에 📤 — 두 축임을 이름으로 안다', () => {
  const docs = fnBody('coDocsHtml');
  assert.match(docs, /📥 읽어 온 서류/);
  const c = load();
  assert.match(c.coSentHtml({ cards: [] }), /📤 보낸 서류/);
});

test('★ 보여 주는 자리는 서버에 «쓰지» 않는다 — 읽기만 한다', () => {
  const block = slice('const CO_SENT_MAX_CARDS = 30;', 'function coDetailPanelHtml(o){');
  /* ⚠ 「.push(」 하나로 재면 안 된다 — 배열에 담는 out.push 까지 걸린다.
     서버 쓰기는 반드시 «자리»(ref)를 거치므로 그것으로 잰다.
     ⚠ 2걸음(2026-09-03)부터 이 토막이 회사 기록을 «읽는다» — 읽기는 괜찮다. */
  assert.ok(!/\.set\(|\.update\(|\.remove\(|Store\.(put|del)/.test(block),
    '보여 주기만 하는 자리에 쓰기가 들어 있다');
  assert.ok(!/\.ref\([^)]*\)\s*\n?\s*\.push\(/.test(block), '서버에 새 줄을 밀어 넣는다');
  assert.match(block, /once\('value'\)/, '읽기는 «한 번»만 한다');
  assert.ok(!/\.ref\([^)]*\)\.on\(/.test(block),
    '살아 있는 구독을 걸면 패널을 닫아도 계속 돈다 — 돈이 샌다');
  const body = slice('function coDetailPanelHtml(o){', 'function openCoDetailPanel(');
  assert.ok(!/Store\.(put|del|db)/.test(body), '패널을 그리면서 쓰기가 나가면 안 된다');
});

test('★ 회사를 바꾸면 늦게 온 답을 «다른 회사» 칸에 안 쓴다', () => {
  const body = slice('function openCoDetailPanel(key){', '\nfunction ');
  assert.match(body, /loadCoSent\(o, \(\)=>\{ if\(state\.coPick===key\)/,
    '안전장치가 콜백 «안»에 걸려 있어야 한다 — 함수 어딘가에 그 글자가 있다로는 부족하다');
});
