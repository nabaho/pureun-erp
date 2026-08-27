'use strict';
/* 막힌 자리를 그 줄에서 바로 잇는다 (대표 결정 2026-08-27) — 실행: node --test tests/*.test.js

   대표: 「푸른이알피에 담당자 연락시킬 수 없나」

   여태는 급여데이터함에 **빨간 까닭만** 보이고, 고치려면 푸른이알피를 따로 열어
   그 사업장을 찾아가야 했다 — 공용 칸 55건을 그렇게 할 수는 없다.

   까닭이 곧 할 일이다:
     주소를 모른다        → ✉️ 그 사업장 담당자로 주소 넣기
     주담당이 없다        → 👤 직원 골라 주담당 정하기
     주담당이 안 들어왔다 → 그 사람이 한 번 열면 된다(사람 몫이라 단추를 안 둔다) */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const R = path.join(__dirname, '..');
const HTML = fs.readFileSync(path.join(R, 'pu-paydata.html'), 'utf8');
const STORE = fs.readFileSync(path.join(R, 'js', 'pu-paydata-store.js'), 'utf8');

function cutHtml(name) {
  const m = HTML.match(new RegExp('function ' + name + '\\s*\\([\\s\\S]*?\\n\\}'));
  assert.ok(m, name + ' 을 찾을 수 없습니다');
  return m[0];
}

/* 자리층을 실제로 돌린다 — 무엇을 적어 내는지가 이 일의 핵심이다 */
function store() {
  const sandbox = { console, JSON, Object, Array, String, Number, Math, Date, Promise, Error, RegExp };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  new vm.Script(STORE, { filename: 'store.js' }).runInContext(sandbox);
  const S = sandbox.PuPaydataStore;
  const wrote = [];
  S.init({
    uid: 'u1', email: 'a001@pureun.kr',
    db: { ref: function () { return { update: function (m) { wrote.push(m); return Promise.resolve(); } }; } }
  });
  return { S: S, wrote: wrote };
}

/* ══════ 주담당 정하기 ══════ */

test('★ 주담당은 사번으로 적는다 — 그 사업장 한 칸만', async () => {
  const { S, wrote } = store();
  await S.setCompanyOwner('co_1', 'A-003');
  const up = wrote[0];
  assert.equal(up['data/companies/v/co_1/managerMain'], 'A-003');
  assert.ok(up['data/companies/u'], '갱신시각을 안 올리면 다른 화면이 못 알아챕니다');
  assert.equal(Object.keys(up).length, 2, '업체 한 줄을 통째로 덮었습니다');
});

test('★ 사번이 아니면 아예 안 적는다 — 이름을 넣으면 사람과 안 이어진다', async () => {
  const { S, wrote } = store();
  await assert.rejects(() => S.setCompanyOwner('co_1', '김보람'), /사번이 아닙니다/);
  await assert.rejects(() => S.setCompanyOwner('co_1', '김보람(박은비)'), /사번이 아닙니다/);
  await assert.rejects(() => S.setCompanyOwner('co_1', ''), /사번이 아닙니다/);
  assert.equal(wrote.length, 0, '틀린 값을 적어 냈습니다');
});

test('사업장을 안 골랐으면 막는다', async () => {
  const { S } = store();
  await assert.rejects(() => S.setCompanyOwner('', 'A-003'), /사업장/);
});

/* ══════ 주소 넣기 ══════ */

test('★ 담당자 칸과 딸림값 셋을 함께 적는다 — 딸림값만 고치면 되돌아간다', async () => {
  const { S, wrote } = store();
  await S.addCompanyEmail({ id: 'co_2', name: '가람떡집' }, 'a@naver.com', '나은석');
  const up = wrote[0];
  assert.equal(up['data/companies/v/co_2/contacts'].length, 1);
  assert.equal(up['data/companies/v/co_2/contacts'][0].email, 'a@naver.com');
  assert.equal(up['data/companies/v/co_2/primaryContactName'], '나은석');
  assert.equal(up['data/companies/v/co_2/primaryContactEmail'], 'a@naver.com');
});

test('★ 이미 있는 사람을 덮지 않는다 — 손으로 적어 둔 것이 있다', async () => {
  const { S, wrote } = store();
  const co = { id: 'co_2', name: '가람떡집',
    contacts: [{ name: '기존담당', position: '실장', phone: '010-1', email: 'old@n.kr', isPrimary: true }] };
  await S.addCompanyEmail(co, 'new@n.kr', '새사람');
  const arr = wrote[0]['data/companies/v/co_2/contacts'];
  assert.equal(arr.length, 2, '한 줄로 뭉갰습니다');
  assert.equal(arr[0].name, '기존담당');
  assert.equal(arr[0].position, '실장', '직책을 지웠습니다');
  assert.equal(wrote[0]['data/companies/v/co_2/primaryContactName'], '기존담당',
    '멀쩡한 대표 담당자를 밀어냈습니다');
});

test('같은 주소를 다시 넣으면 줄이 안 늘고 빈 이름만 채운다', async () => {
  const { S, wrote } = store();
  const co = { id: 'co_2', name: '가', contacts: [{ name: '', email: 'a@n.kr', isPrimary: true }] };
  await S.addCompanyEmail(co, 'A@N.KR', '나은석');
  const arr = wrote[0]['data/companies/v/co_2/contacts'];
  assert.equal(arr.length, 1, '대소문자만 다른데 두 줄이 됐습니다');
  assert.equal(arr[0].name, '나은석');
});

test('딸림값만 있던 옛 업체도 담당자 칸으로 옮겨 담는다', async () => {
  const { S, wrote } = store();
  const co = { id: 'co_3', name: '나', primaryContactName: '옛담당', primaryContactEmail: 'old@n.kr' };
  await S.addCompanyEmail(co, 'new@n.kr', '새사람');
  const arr = wrote[0]['data/companies/v/co_3/contacts'];
  assert.equal(arr.length, 2);
  assert.equal(arr[0].email, 'old@n.kr', '옛 담당자를 잃었습니다');
});

test('★ 메일 주소가 아니면 안 적는다', async () => {
  const { S, wrote } = store();
  await assert.rejects(() => S.addCompanyEmail({ id: 'c', name: 'x' }, '주소아님'), /메일 주소/);
  await assert.rejects(() => S.addCompanyEmail({ id: 'c', name: 'x' }, ''), /메일 주소/);
  assert.equal(wrote.length, 0);
});

test('사업장 없이 부르면 막는다', async () => {
  const { S } = store();
  await assert.rejects(() => S.addCompanyEmail(null, 'a@b.kr'), /사업장/);
});

/* ══════ 화면 ══════ */

test('★ 까닭에 맞는 단추만 나온다 — 할 수 없는 것을 보여 주면 헛걸음이다', () => {
  const fn = cutHtml('fixBtnsHtml');
  assert.match(fn, /없는 주소|사업장/, '주소를 모를 때가 없습니다');
  assert.match(fn, /주담당이 없음/);
  assert.match(fn, /openFixMail/);
  assert.match(fn, /openFixOwner/);
});

test('★ 주담당이 아직 안 들어온 것에는 고치는 단추를 안 둔다 — 사람이 열어야 풀린다', () => {
  const fn = cutHtml('fixBtnsHtml');
  assert.equal(/안 들어온/.test(fn), false, '고칠 수 없는 것에 단추를 뒀습니다');
});

test('★ 사업장을 알면 푸른이알피로 가는 길도 둔다', () => {
  assert.match(cutHtml('fixBtnsHtml'), /goErpCompany/);
  assert.match(cutHtml('goErpCompany'), /pu-erp\.html\?co=/);
  assert.match(cutHtml('goErpCompany'), /encodeURIComponent/, '이름에 &가 있으면 주소가 깨집니다');
});

test('★ 넣은 뒤 업체 명단을 다시 읽는다 — 안 읽으면 방금 넣은 것이 안 보인다', () => {
  const fn = cutHtml('saveFix');
  assert.match(fn, /S\.listCompanies\(\)/);
  assert.match(fn, /refreshMailAndPending\(\)/);
});

test('★ 다시 갈라 보내기를 저절로 누르지 않는다 — 무엇이 어디로 가는지 보고 눌러야 한다', () => {
  const fn = cutHtml('saveFix');
  assert.equal(/regroupShared\(/.test(fn), false, '몰래 남의 칸으로 자료를 옮깁니다');
  assert.match(fn, /다시 갈라 보내기/, '다음에 무엇을 할지 안 알려 줍니다');
});

test('★ 두 번 눌림을 막는다', () => {
  assert.match(cutHtml('saveFix'), /if \(!f \|\| f\.busy\) return;/);
});

test('★ 못 넣었으면 까닭을 그 자리에 보여 준다 — 창이 닫히면 왜 안 됐는지 모른다', () => {
  const fn = cutHtml('saveFix');
  assert.match(fn, /f\.err =/);
  assert.match(cutHtml('fixHtml'), /fxerr/);
});

test('★ 사번이 아닌 사람은 고를 수 없다 — 골라도 이어지지 않는다', () => {
  assert.match(cutHtml('fixPeople'), /!p\.badSid/);
});

test('직원 명단을 담아 두지 않고 그때그때 세운다 — 담아 두면 한쪽만 낡는다', () => {
  assert.match(cutHtml('fixPeople'), /S\.managerRoster\(/);
});

test('★ 서랍이 화면에 얹힌다 — 만들고 안 부르면 없는 것과 같다', () => {
  assert.match(HTML, /\+ fixHtml\(\)/);
});

test('★ 자리층을 고쳤으니 부르는 화면의 ?v= 를 올렸다', () => {
  const m = HTML.match(/pu-paydata-store\.js\?v=(\d+)/);
  assert.ok(m && Number(m[1]) >= 5, '?v= 를 안 올리면 고쳐도 배포에 안 실립니다: ' + (m && m[1]));
});
