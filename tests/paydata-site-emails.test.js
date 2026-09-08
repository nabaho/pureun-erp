'use strict';
/* 사업장 담당자 메일이 급여데이터함에서 보인다 (대표 지적 2026-08-29)
   실행: node --test tests/*.test.js

   대표: 「담당자와 관련된 이메일주소가 정리되고… 왜 여기에서는 확인이 어려운가」

   ── 까닭 ────────────────────────────────────────────────────
   업체관리에는 넣어 두었는데 **급여데이터함이 그 칸을 안 가져왔다.**
   normalizeCompanies 가 이름·유형·주담당만 담고 contacts·primaryContactEmail·
   taxEmail 을 통째로 버렸다. 그래서 어디에도 안 보였고, 「정리됐나」를 확인하려면
   업체관리를 따로 열어 그 사업장을 찾아가야 했다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const R = path.join(__dirname, '..');
const HTML = fs.readFileSync(path.join(R, 'pu-paydata.html'), 'utf8');
const SRC = fs.readFileSync(path.join(R, 'js', 'pu-paydata-store.js'), 'utf8');

function store() {
  const sandbox = { console, JSON, Object, Array, String, Number, Math, Date, Promise, Error, RegExp };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  new vm.Script(SRC, { filename: 'store.js' }).runInContext(sandbox);
  const S = sandbox.PuPaydataStore;
  S.init({ uid: 'u1', email: 'a001@pureun.kr' });
  return S;
}
function cut(name) {
  const m = HTML.match(new RegExp('function ' + name + '\\s*\\([\\s\\S]*?\\n\\}'));
  assert.ok(m, name + ' 을 찾을 수 없습니다');
  return m[0];
}

/* ══════ 자리층이 메일 칸을 실어 온다 ══════ */

test('★ 업체를 당겨올 때 메일 칸을 함께 담는다 — 안 담아서 어디에도 안 보였다', () => {
  const S = store();
  const got = S.normalizeCompanies({ v: { a: {
    id: 'c1', name: '㈜정일제지', typeCode: '급여', status: 'active', managerMain: 'A-002',
    contacts: [{ name: '임남용', position: '', email: 'cust12@naver.com', isPrimary: true }],
    primaryContactName: '임남용', primaryContactEmail: 'cust12@naver.com',
    taxOfficeName: '윤병수회계사무소', taxEmail: 'cust01@hanmail.net'
  } } });
  const co = got[0];
  assert.equal(co.contacts.length, 1);
  assert.equal(co.contacts[0].email, 'cust12@naver.com');
  assert.equal(co.primaryContactEmail, 'cust12@naver.com');
  assert.equal(co.taxEmail, 'cust01@hanmail.net');
});

test('★ 무겁게 담지 않는다 — 371곳을 그릴 때마다 전화·주소까지 따라오면 안 된다', () => {
  const S = store();
  const co = S.normalizeCompanies({ v: { a: {
    id: 'c1', name: '가', contacts: [{ name: '나', email: 'a@b.kr',
      phone: '010-1', addr: '아주 긴 주소', memo: '아주 긴 메모' }]
  } } })[0];
  assert.deepEqual(Object.keys(co.contacts[0]).sort(), ['email', 'isPrimary', 'name', 'position']);
});

test('이름도 메일도 없는 줄은 안 담는다 — 빈 줄이 화면을 어지럽힌다', () => {
  const S = store();
  const co = S.normalizeCompanies({ v: { a: { id: 'c1', name: '가',
    contacts: [{ phone: '010-1' }, { name: '나', email: 'a@b.kr' }] } } })[0];
  assert.equal(co.contacts.length, 1);
});

test('담당자 칸이 없는 옛 업체도 안 터진다', () => {
  const S = store();
  const co = S.normalizeCompanies({ v: { a: { id: 'c1', name: '가' } } })[0];
  /* vm 안에서 만든 배열은 deepEqual 로 못 견준다 — 길이로 본다 */
  assert.equal(co.contacts.length, 0);
  assert.equal(co.taxEmail, '');
});

/* ══════ 화면에 그릴 줄 ══════ */

test('★ 대표 담당자가 맨 위에 온다 — 이 주소로 오면 여기로 온다', () => {
  const S = store();
  const rows = S.companyMails({
    contacts: [{ name: '경리', email: 'b@n.kr', isPrimary: false },
               { name: '임남용', email: 'a@n.kr', isPrimary: true }]
  });
  assert.equal(rows[0].email, 'a@n.kr');
  assert.equal(rows[1].email, 'b@n.kr');
});

test('★ 같은 주소가 담당자 칸과 딸림값에 둘 다 있어도 한 번만 보인다', () => {
  const S = store();
  const rows = S.companyMails({
    contacts: [{ name: '임남용', email: 'a@n.kr', isPrimary: true }],
    primaryContactName: '임남용', primaryContactEmail: 'A@N.KR'
  });
  assert.equal(rows.length, 1);
});

test('★ 세무사무소는 갈라서 보여 준다 — 업체 담당자와 뜻이 다르다', () => {
  const S = store();
  const rows = S.companyMails({
    primaryContactName: '임남용', primaryContactEmail: 'a@n.kr',
    taxOfficeName: '윤병수회계사무소', taxEmail: 't@n.kr'
  });
  assert.equal(rows.length, 2);
  assert.equal(rows[1].kind, 'tax');
  assert.equal(rows[0].kind, 'contact');
});

test('딸림값만 있던 옛 업체도 보인다', () => {
  const S = store();
  const rows = S.companyMails({ primaryContactName: '가', primaryContactEmail: 'a@n.kr' });
  assert.equal(rows.length, 1);
});

test('아무것도 없으면 빈손 — 없는 것을 지어내지 않는다', () => {
  const S = store();
  assert.equal(S.companyMails({}).length, 0);
  assert.equal(S.companyMails(null).length, 0);
});

/* ══════ 사업장 화면 ══════ */

/* ══════ 머리를 두 줄로 (대표 지시 2026-08-29) ══════

   대표: 「탭이나 달력 메일 등 전체적으로 깔끔하게… 한두 줄 정도로.
         담당자 메일주소도 모두 볼 것은 아니고 이름만 보면 될 것 같다」

   주소 세 줄을 늘 펴 두었더니 자리 띠·이름줄·메일 셋·달력·탭 = **여섯 줄**이라
   정작 자료는 일곱째 줄에서야 보였다. 이름 한 조각으로 접고, 달력을 탭 줄에 넣는다.
   ⚠ 지우는 것은 없다 — 주소도 「이 주소로 오면 여기로」도 눌러서 편다. */

test('★ 머리줄에는 이름만 나온다 — 주소를 늘 펴 두지 않는다', () => {
  const fn = cut('coMailChip');
  assert.match(fn, /first\.name/, '이름을 안 보여 줍니다');
  assert.equal(/companyMails\(co\)[\s\S]*?\.email[\s\S]*?join/.test(fn), false,
    '주소를 줄줄이 그리고 있습니다');
  assert.match(fn, /외 ' \+ more/, '몇 명 더 있는지 안 알려 줍니다');
});

test('★ 이름이 없으면 주소라도 보여 준다 — 빈 조각은 누를 데가 없다', () => {
  assert.match(cut('coMailChip'), /first\.name \|\| first\.email/);
});

test('★ 눌러야 주소가 펴진다 — 접힘이 기본이다', () => {
  const drop = cut('coMailDropHtml');
  assert.match(drop, /App\.coMailOpen !== coId/, '늘 펴져 있습니다');
  assert.match(drop, /이 주소로 오면 여기로/, '펴도 안 알려 주면 뜻이 없습니다');
  assert.match(drop, /세무/);
});

test('★ 같은 것을 다시 누르면 접힌다', () => {
  assert.match(cut('toggleCoMail'), /App\.coMailOpen === coId\) \? ''/);
});

test('★ 메일이 없으면 한 줄에서 바로 눈에 띈다 — 그래야 채운다', () => {
  const fn = cut('coMailChip');
  assert.match(fn, /담당자 메일 없음/);
  assert.match(fn, /comail none/, '없는 것과 있는 것이 같은 색이면 안 보입니다');
});

test('★ 펼치면 누구 칸으로 갈지도 적는다', () => {
  const drop = cut('coMailDropHtml');
  assert.match(drop, /담당자 메일이 없습니다/);
  assert.match(drop, /coOwnerName/);
});

test('★ 머리줄에 조각이 붙고, 펼침 칸은 그 아래에 붙는다', () => {
  assert.match(HTML, /\+ coMailChip\(App\.companyId\)/);
  assert.match(HTML, /\+ coMailDropHtml\(App\.companyId\)/);
});

test('★ 달력이 탭·찾기와 같은 줄에 선다 — 줄 하나를 통째로 먹지 않는다', () => {
  const m = HTML.match(/id="findBar" class="foldfind">'[\s\S]{0,160}/);
  assert.ok(m, 'findBar 를 찾을 수 없습니다');
  assert.match(m[0], /monthStripHtml\(\)/, '달력이 아직 딴 줄입니다');
});

test('근로계약서 탭에는 달력을 안 붙인다 — 그 칸은 월과 상관없다', () => {
  const m = HTML.match(/id="findBar" class="foldfind">'[\s\S]{0,160}/);
  assert.match(m[0], /keepKind \? '' : monthStripHtml\(\)/);
});

test('★ 달력 줄이 같은 줄에 서도 아래 여백이 두 번 안 생긴다', () => {
  assert.match(HTML, /\.foldfind \.mstrip\{margin-bottom:0/);
});

test('★ 그 자리에서 넣을 길을 함께 둔다 — 업체관리를 따로 열게 하지 않는다', () => {
  assert.match(cut('coMailDropHtml'), /openFixCo/);
  assert.match(cut('openFixCo'), /fromCo: true/);
});

test('★ 서랍은 한 벌만 쓴다 — 두 벌 만들면 한쪽만 고쳐진다', () => {
  assert.equal((HTML.match(/function saveFix\(/g) || []).length, 1);
});

test('★ 사업장에서 열면 주소를 적어야 넣을 수 있다 — 사업장은 이미 정해졌다', () => {
  const fn = cut('fixHtml');
  assert.match(fn, /f\.fromCo/);
  assert.match(fn, /String\(f\.from \|\| ''\)\.trim\(\)/, '빈 주소로 넣을 수 있습니다');
});

test('★ 볼 수만 있는 사람에게는 넣기 단추를 안 보인다', () => {
  assert.match(cut('coMailDropHtml'), /canWrite\(\)/);
});

test('★ 자리층을 고쳤으니 부르는 화면의 ?v= 를 올렸다', () => {
  const m = HTML.match(/pu-paydata-store\.js\?v=(\d+)/);
  assert.ok(m && Number(m[1]) >= 7, '?v= 를 안 올리면 고쳐도 배포에 안 실립니다: ' + (m && m[1]));
});

