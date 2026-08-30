'use strict';
/* 자동 판독 · 한 줄 요약 (대표 지시 2026-08-29) — 실행: node --test tests/*.test.js

   대표: 「첨부메일을 자동으로 인식해서 어떤 내용인지 요약정리」

   대기 칸에 예순 건 넘게 쌓이는데 무엇인지 알려면 **하나씩 열어 봐야** 했다.
   파일 이름이 「직현병국퇴.pdf」·「@@근로계약서(2026)-텃골팜--.xls」 라
   이름만으로는 아무것도 알 수 없다.

   ⚠ 표 판독(readTableText)과 **다른 일**이다. 그것은 사람별 금액을 값으로 만드는
     무거운 일이고, 이것은 「무엇인가」 한 줄이다.
   ⚠ 값으로 쓰지 않는다 — 보고 고르는 데만 쓴다. 틀려도 자료가 안 망가진다.
   ⚠ 한 번만 읽고 적어 둔다. 화면을 열 때마다 다시 읽으면 그것이 그대로 요금이다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const R = path.join(__dirname, '..');
const HTML = fs.readFileSync(path.join(R, 'pu-paydata.html'), 'utf8');
const STORE = fs.readFileSync(path.join(R, 'js', 'pu-paydata-store.js'), 'utf8');
const READ = fs.readFileSync(path.join(R, 'js', 'pu-doc-read.js'), 'utf8');

function cut(name) {
  const m = HTML.match(new RegExp('function ' + name + '\\s*\\([\\s\\S]*?\\n\\}'));
  assert.ok(m, name + ' 을 찾을 수 없습니다');
  return m[0];
}

/* 판독기를 진짜로 돌린다 — 무엇을 보내고 무엇을 돌려주는지가 이 일의 핵심 */
function reader(reply) {
  const sent = [];
  const sandbox = {
    console, JSON, Object, Array, String, Number, Math, Date, Promise, Error, RegExp, Buffer,
    setTimeout, TextDecoder,
    fetch: function (url, opt) {
      sent.push(JSON.parse((opt && opt.body) || '{}'));
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(reply) });
    }
  };
  sandbox.window = sandbox; sandbox.globalThis = sandbox; sandbox.self = sandbox;
  vm.createContext(sandbox);
  new vm.Script(READ, { filename: 'read.js' }).runInContext(sandbox);
  const D = sandbox.PuDocRead;
  D.init({ fetch: sandbox.fetch, getKey: () => 'K' });
  return { D: D, sent: sent, sandbox: sandbox };
}
const reply = (obj) => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] });

/* ══════ 판독기 ══════ */

test('★ 한 줄 요약을 돌려준다 — 열지 않고도 무엇인지 안다', async () => {
  const { D } = reader(reply({ sum: '8월 급여대장 · 12명', kind: 'ledger',
    month: '2026-08', company: '평해식품', people: 12, amount: '32,400,000' }));
  const r = await D.summarizeText('이름\t기본급\n김철수\t2400000', '급여대장.xlsx');
  assert.equal(r.ok, true);
  assert.equal(r.sum, '8월 급여대장 · 12명');
  assert.equal(r.kind, 'ledger');
  assert.equal(r.month, '2026-08');
  assert.equal(r.people, 12);
});

test('★ 주민번호는 AI 로 안 나간다 — 요약이라고 덜 지키지 않는다', async () => {
  const { D, sandbox, sent } = reader(reply({ sum: '가' }));
  sandbox.PuRrnMask = { maskRrnInText: (t) => ({ text: t.replace(/\d{6}-\d{7}/g, '******-*******'), count: 1 }) };
  await D.summarizeText('김철수 900101-1234567 입사', 'a.xlsx');
  const body = JSON.stringify(sent[0]);
  assert.equal(/900101-1234567/.test(body), false, '주민번호가 그대로 나갔습니다');
  assert.match(body, /\*\*\*\*\*\*/);
});

test('★ 아주 긴 글은 앞부분만 보낸다 — 통째로 보내면 느리고 요금이다', async () => {
  const { D, sent } = reader(reply({ sum: '가' }));
  await D.summarizeText('가'.repeat(20000), 'a.xlsx');
  const body = JSON.stringify(sent[0]);
  assert.ok(body.length < 12000, '통째로 보냈습니다: ' + body.length);
  assert.match(body, /뒤는 줄임/);
});

test('빈 글자로는 AI 를 안 부른다 — 헛돈이고 답도 못 쓴다', async () => {
  const { D, sent } = reader(reply({ sum: '가' }));
  const r = await D.summarizeText('   ', 'a.xlsx');
  assert.equal(r.ok, false);
  assert.equal(sent.length, 0);
});

test('★ 없는 것을 지어내지 말라고 못 박는다', () => {
  assert.match(READ, /글자에 없는 것은 지어내지 마십시오/);
  assert.match(READ, /주민등록번호·계좌번호는 답에 \*\*옮기지 마십시오\.\*\*/);
});

test('말이 안 되는 답은 걸러 담는다 — 사람 수가 만 명일 수는 없다', async () => {
  const { D } = reader(reply({ sum: '가', people: 99999, month: '엉뚱' }));
  const r = await D.summarizeText('글자', 'a.xlsx');
  assert.equal(r.people, 0);
  assert.equal(r.month, '');
});

test('AI 가 알아볼 수 없는 답을 보내면 그렇다고 한다 — 터지지 않는다', async () => {
  const { D } = reader({ candidates: [{ content: { parts: [{ text: '뭔 소리' }] } }] });
  const r = await D.summarizeText('글자', 'a.xlsx');
  assert.equal(r.ok, false);
  assert.match(r.error, /알아볼 수 없는/);
});

/* ══════ 적어 두기 ══════ */

function store() {
  const wrote = [];
  const sandbox = { console, JSON, Object, Array, String, Number, Math, Date, Promise, Error, RegExp };
  sandbox.window = sandbox; sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  new vm.Script(STORE, { filename: 'store.js' }).runInContext(sandbox);
  const S = sandbox.PuPaydataStore;
  S.init({ uid: 'u1',
    db: { ref: () => ({ update: (m) => { wrote.push(m); return Promise.resolve(); } }) } });
  return { S: S, wrote: wrote };
}

test('★ 내 대기 칸의 요약은 내 자리에 적는다 — 남의 자리에는 못 쓴다', () => {
  const { S } = store();
  assert.match(S.sumPath('x', 'u9'), /paydata\/u\/u9\/pending\/x\/sum$/);
});

test('★ 공용 칸의 요약은 공용 칸에 적는다', () => {
  const { S } = store();
  assert.match(S.sumPath('x', ''), /paydata\/pending_shared\/x\/sum$/);
});

test('★ 못 읽은 것도 적어 둔다 — 안 적으면 화면을 열 때마다 다시 읽는다', async () => {
  const { S, wrote } = store();
  await S.saveSum('x', 'u1', { ok: false, error: '글자가 없는 파일입니다' });
  const rec = wrote[0]['paydata/u/u1/pending/x/sum'];
  assert.equal(rec.ok, false);
  assert.match(rec.err, /글자가 없는/);
  assert.ok(rec.at > 0, '언제 읽었는지 없으면 또 읽습니다');
});

test('★ 이미 읽은 줄은 다시 안 읽는다', () => {
  const { S } = store();
  const rows = [
    { id: 'a', sum: { at: 1, ok: true } },
    { id: 'b' },
    { id: 'c', sum: { at: 2, ok: false } }   // 실패한 것도 다시 안 읽는다
  ];
  assert.equal(S.needSum(rows).length, 1);
  assert.equal(S.needSum(rows)[0].id, 'b');
});

test('★ 읽을 수 없는 줄은 아예 안 고른다 — 사진은 뽑을 글자가 없다', () => {
  const { S } = store();
  const rows = [{ id: 'a', filename: 'x.jpg' }, { id: 'b', filename: 'y.xlsx' }];
  const can = (r) => /\.xlsx$/.test(r.filename);
  assert.equal(S.needSum(rows, can).length, 1);
});

test('다시 읽기는 적어 둔 것을 지운다', async () => {
  const { S, wrote } = store();
  await S.clearSum('x', 'u1');
  assert.equal(wrote[0]['paydata/u/u1/pending/x/sum'], null);
});

/* ══════ 화면 ══════ */

test('★ 대기 칸을 열면 저절로 읽는다 — 사람이 누를 것이 하나 더 늘면 안 한다', () => {
  assert.match(HTML, /screen === 'pending'.*autoSum/s);
});

test('★ 한 번에 하나씩 — 예순 건을 한꺼번에 보내면 느리고 끊기면 어디까지인지 모른다', () => {
  const fn = cut('autoSum');
  assert.match(fn, /todo\[0\]/, '한 줄씩이 아닙니다');
  assert.match(fn, /setTimeout\(autoSum/, '다음 것으로 안 넘어갑니다');
  assert.match(fn, /if \(App\.sumBusy \|\| App\.sumStop\) return;/, '겹쳐 돌 수 있습니다');
});

test('★ 한 번 열 때 읽는 수에 한도가 있다 — 저절로 도는 것에 끝이 있어야 한다', () => {
  assert.match(HTML, /SUM_MAX_PER_VISIT/);
  assert.match(cut('autoSum'), /App\.sumDone >= SUM_MAX_PER_VISIT/);
});

test('★ 사람이 멈출 수 있다 — 저절로 도는 것을 못 멈추면 무섭다', () => {
  assert.match(cut('sumBarHtml'), /stopSum/);
  assert.match(cut('sumBarHtml'), /남은 것/, '몇 건 남았는지 안 알려 줍니다');
  assert.match(cut('stopSum'), /App\.sumStop = true/);
  assert.match(cut('restartSum'), /App\.sumStop = false/);
});

test('★ 남의 자리에서는 안 읽는다 — 거기에 쓸 수 없다', () => {
  assert.match(cut('autoSum'), /if \(!canWrite\(\)\) return;/);
});

test('★ 엑셀은 첫 시트만 본다 — 요약에 스무 장을 다 볼 까닭이 없다', () => {
  assert.match(cut('readOneSum'), /wb\.SheetNames\[0\]/);
});

test('★ 글자 파일은 도구를 안 내려받는다 — 2MB 를 받을 까닭이 없다', () => {
  assert.match(cut('readOneSum'), /kind === 'text' \? Promise\.resolve\(\)/);
});

test('★ 읽다 실패해도 그 줄만 넘어간다 — 하나 때문에 예순 건이 멈추면 안 된다', () => {
  assert.match(cut('readOneSum'), /\.catch\(e => \(\{ ok: false/);
  assert.match(cut('autoSum'), /\.catch\(/);
});

test('★ 그 줄에 요약이 보이고, 틀리면 다시 읽을 수 있다', () => {
  const fn = cut('sumTagHtml');
  assert.match(fn, /sumtag/);
  assert.match(fn, /resumOne/);
  assert.match(fn, /못 읽음/, '실패를 안 알려 줍니다');
});

test('★ 사람 수·금액이 있으면 함께 보여 준다 — 그것이 고르는 데 쓰인다', () => {
  const fn = cut('sumTagHtml');
  assert.match(fn, /s\.people/);
  assert.match(fn, /s\.amount/);
});

test('★ 요약 줄이 화면에 붙는다 — 만들고 안 부르면 없는 것과 같다', () => {
  assert.match(HTML, /sumTagHtml\(Object\.assign\(\{ id: id \}, rec\)\)/);
  assert.match(HTML, /\+ sumBarHtml\(\)/);
});

test('★ 값으로 쓰지 않는다 — 사업장·귀속월·종류를 요약으로 덮어쓰지 않는다', () => {
  /* 덮어쓰면 AI 가 틀렸을 때 자료가 망가진다. 사람이 고르는 것이 여전히 주인공이다. */
  const fn = cut('autoSum');
  assert.equal(/setPendTag/.test(fn), false, '요약으로 이름표를 덮고 있습니다');
  assert.equal(/drawerUpdate/.test(fn), false, '요약만으로 서랍에 담고 있습니다');
});

test('★ 자리층을 고쳤으니 부르는 화면의 ?v= 를 올렸다', () => {
  const m = HTML.match(/pu-paydata-store\.js\?v=(\d+)/);
  assert.ok(m && Number(m[1]) >= 9, '?v= 를 안 올리면 고쳐도 배포에 안 실립니다: ' + (m && m[1]));
});

test('★ 판독기를 고쳤으니 그 ?v= 도 올렸다', () => {
  const m = HTML.match(/pu-doc-read\.js\?v=(\d+)/);
  assert.ok(m, 'pu-doc-read.js 를 안 부릅니다');
  assert.ok(Number(m[1]) >= 13, '?v= 를 안 올렸습니다: ' + m[1]);
});
