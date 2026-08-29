'use strict';
/* 잘못 온 자료를 다른 사람에게 넘기기 (대표 지시 2026-08-29)
   실행: node --test tests/*.test.js

   대표: 「만약 잘못 갈라 보내면 다른 사람에게 보낼 수 있게 시스템 만들어야 한다」

   ── 왜 없었나 ──────────────────────────────────────────────
   자료가 내 대기 칸에 있으면 나는 지우거나 서랍에 담을 수만 있었다.
   **남의 칸에는 못 쓴다** — 콘솔 규칙이 「자기 자리와 대리인만」으로 막는다.
   그래서 잘못 온 자료는 **버리거나 그냥 떠안는** 수밖에 없었다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const R = path.join(__dirname, '..');
const HTML = fs.readFileSync(path.join(R, 'pu-paydata.html'), 'utf8');
const SRC = fs.readFileSync(path.join(R, 'js', 'pu-paydata-store.js'), 'utf8');
const FN = fs.readFileSync(path.join(R, 'functions', 'index.js'), 'utf8');

function cut(name) {
  const m = HTML.match(new RegExp('function ' + name + '\\s*\\([\\s\\S]*?\\n\\}'));
  assert.ok(m, name + ' 을 찾을 수 없습니다');
  return m[0];
}
function fnBody() {
  const i = FN.indexOf('exports.handPaydataItem');
  assert.ok(i > 0, 'handPaydataItem 이 없습니다');
  return FN.slice(i, i + 5200);
}
/* 자리층을 실제로 돌린다 — 무엇을 보내는지가 이 일의 핵심이다 */
function store() {
  const sent = [];
  const sandbox = {
    console, JSON, Object, Array, String, Number, Math, Date, Promise, Error, RegExp,
    fetch: function (url, opt) {
      sent.push({ url: url, body: JSON.parse((opt && opt.body) || '{}') });
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, moved: 1 }) });
    }
  };
  /* 자리층은 로그인 표를 **전역 firebase** 에서 가져온다(화면과 같은 길) */
  sandbox.firebase = { auth: () => ({ currentUser: { getIdToken: () => Promise.resolve('T') } }) };
  sandbox.window = sandbox; sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  new vm.Script(SRC, { filename: 'store.js' }).runInContext(sandbox);
  const S = sandbox.PuPaydataStore;
  S.init({ uid: 'u1' });
  return { S: S, sent: sent };
}

/* ══════ 자리층 ══════ */

test('★ 넘길 자료·보내는 자리·받는 자리·까닭을 함께 보낸다', async () => {
  const { S, sent } = store();
  await S.handItem(['a', 'b'], 'u1', 'u2', '유원에프앤비는 김보람 담당입니다');
  const b = sent[0].body;
  assert.match(sent[0].url, /handPaydataItem$/);
  assert.equal(b.ids.length, 2);
  assert.equal(b.from, 'u1');
  assert.equal(b.to, 'u2');
  assert.match(b.why, /김보람 담당/);
});

test('★ 까닭 없이는 아예 안 보낸다 — 받는 사람이 「왜 나한테」를 알아야 한다', async () => {
  const { S, sent } = store();
  await assert.rejects(() => S.handItem(['a'], 'u1', 'u2', ''), /왜 넘기는지/);
  await assert.rejects(() => S.handItem(['a'], 'u1', 'u2', '   '), /왜 넘기는지/);
  assert.equal(sent.length, 0);
});

test('고를 것이 없으면 막는다', async () => {
  const { S } = store();
  await assert.rejects(() => S.handItem([], 'u1', 'u2', '까닭'), /고르/);
});

test('★ 받는 사람이 없으면 공용 칸으로 되돌린다는 뜻이다', async () => {
  const { S, sent } = store();
  await S.handItem('a', 'u1', '', '임자를 모르겠습니다');
  assert.equal(sent[0].body.to, '');
  assert.equal(sent[0].body.ids.length, 1, '한 건도 목록으로 보내야 합니다');
});

/* ══════ 서버 ══════ */

test('★ 넘기는 함수가 있다', () => {
  assert.match(FN, /exports\.handPaydataItem/);
});

test('★ 갖고 있는 사람이나 총괄관리자만 — 남의 칸을 아무나 뒤지면 안 된다', () => {
  const b = fnBody();
  assert.match(b, /me\.uid !== from/);
  assert.match(b, /isAdmin !== true/);
  assert.match(b, /requireStaff/);
});

test('★ 아직 이 함에 안 들어온 사람에게는 못 넘긴다 — 아무도 안 여는 자리다', () => {
  const b = fnBody();
  assert.match(b, /"\/owners\/" \+ to/);
  assert.match(b, /한 번 열어야 자리가 생깁니다/);
});

test('★ 까닭을 서버에서도 막는다 — 화면만 믿지 않는다', () => {
  const b = fnBody();
  assert.match(b, /왜 넘기는지 적어 주십시오/);
});

test('★ 옮기는 것은 한 줄뿐 — 창고 파일은 그대로 둔다', () => {
  const b = fnBody();
  assert.equal(/bucket|storage|\.save\(/.test(b), false, '파일을 옮기고 있습니다');
  assert.match(b, /"\/u\/" \+ from \+ "\/pending\/" \+ id\] = null/, '보내는 자리에서 안 뺍니다');
});

test('★ 받는 자리가 없으면 공용 칸으로 — 아무에게나 떠넘기지 않는다', () => {
  const b = fnBody();
  assert.match(b, /"\/pending_shared\/" \+ id\]/);
  assert.match(b, /사람이 되돌림/);
});

test('★ 누가·언제·누구에게·왜를 남긴다 — 돌고 돌면 어디서 어긋났는지 찾아야 한다', () => {
  const b = fnBody();
  assert.match(b, /handoff_log/);
  assert.match(b, /by: me\.uid/);
  assert.match(b, /why: why/);
});

test('★ 받은 줄에 누가 왜 넘겼는지 함께 담는다', () => {
  const b = fnBody();
  assert.match(b, /handedFrom: from/);
  assert.match(b, /handWhy: why/);
});

test('★ 같은 자리로는 못 넘긴다 — 아무 일도 안 일어나는 헛걸음이다', () => {
  assert.match(fnBody(), /to === from/);
});

test('그 사이 누가 처리했으면 조용히 건너뛴다 — 없는 것을 옮기지 않는다', () => {
  assert.match(fnBody(), /if \(!rec\) continue;/);
});

/* ══════ 화면 ══════ */

test('★ 줄마다 넘기기가 있고, 고른 것을 한꺼번에도 넘긴다', () => {
  assert.match(HTML, /onclick="openHand\(/);
  assert.match(HTML, /고른 것 넘기기/);
});

test('★ 넘기기 전에 까닭을 적게 한다', () => {
  const fn = cut('saveHand');
  assert.match(fn, /왜 넘기는지 적어 주세요/);
  assert.match(fn, /if \(!f \|\| f\.busy\) return;/, '두 번 눌림을 막아야 합니다');
});

test('★ 받는 사람은 이 함에 들어온 사람만 고를 수 있다', () => {
  const fn = cut('handHtml');
  assert.match(fn, /App\.owners/);
  assert.match(fn, /uid !== App\.viewingUid/, '자기 자리가 목록에 나옵니다');
});

test('★ 공용 칸으로 되돌리는 길도 둔다 — 임자를 모를 때', () => {
  assert.match(cut('handHtml'), /공용 칸으로 되돌리기/);
  assert.match(cut('saveHand'), /__shared/);
});

test('★ 받은 사람 화면에 누가 왜 넘겼는지 보인다', () => {
  assert.match(HTML, /rec\.handedFrom/);
  assert.match(HTML, /handtag/);
  assert.match(HTML, /rec\.handWhy/);
});

test('★ 넘기는 자리는 지금 보고 있는 자리다 — 총괄관리자가 남의 자리를 열 수 있다', () => {
  assert.match(cut('saveHand'), /App\.viewingUid/);
});

test('★ 서랍은 화면에 얹힌다 — 만들고 안 부르면 없는 것과 같다', () => {
  assert.match(HTML, /\+ handHtml\(\)/);
});

test('★ 넘기기 단추는 「서랍으로」와 색이 다르다 — 하나는 내 일, 하나는 남에게 보내는 일', () => {
  assert.match(HTML, /\.btn\.hand\{/);
});
