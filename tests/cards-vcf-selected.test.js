'use strict';
/* 📱 고른 명함을 «폰 연락처»로 — 한 번에 (대표 지시 2026-08-30)

   "내 폰에서 저장한 명함들 자동으로 내 폰 연락처로 저장되게 할 수 있나" → 「고른 것만」
   (대표 승인 목업 docs/mockups/cards-vcf-selected.html)

   ■ 왜 이렇게밖에 못 만드나
   **웹은 폰 연락처에 직접 쓸 수 없다.** 그래서 파일 하나를 만들어 드리고, 그것을 한 번
   여시면 폰이 전부 한꺼번에 넣는다 — 3명이든 200명이든 여는 것은 한 번이다.

   ■ 가장 위험한 자리
   ① **글자를 안 다듬으면 조용히 틀린다.** vCard 는 `;` `,` 로 칸을 가른다. 회사 이름에
      쉼표가 하나만 있어도 그 뒤가 딴 칸으로 밀려 폰 연락처에 이상한 값이 들어앉는다.
      화면에는 아무 표시가 없다.
   ② **되돌릴 수 없다.** 한 번 폰에 들어가면 이 앱에서는 못 지운다 — 묻지 않고 만들면 안 된다.
   ③ **빈 사람을 만들면 안 된다.** 이름도 번호도 메일도 없는 명함이 들어가면,
      그것을 찾아 지우는 일이 넣는 일보다 크다.
   ④ **한 장짜리와 여러 장이 같은 것을 써야 한다.** 두 벌이면 한쪽만 고쳐진다.

   실행: node --test tests/*.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { cutFn } = require('./cut-fn');

const R = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(R, 'pu-cards.html'), 'utf8');

/* 만드는 층을 노드에서 그대로 돌린다 */
function maker() {
  const ctx = { String: String, Array: Array };
  vm.createContext(ctx);
  ['function vcEsc(', 'function vcardLines(', 'function vcUsable(']
    .forEach(function (f) { vm.runInContext(cutFn(app, f), ctx); });
  return ctx;
}
const M = maker();
function card(it) { return M.vcardLines(it).join('\r\n'); }

/* ══════ ① 글자 다듬기 — 조용히 틀리는 자리 ══════ */

test('★★ 쉼표가 든 회사 이름이 «칸을 밀지 않는다» — 폰 연락처에 이상한 값이 들어앉는다', () => {
  const v = card({ name: '김성호', company: '(주)대운토건, 서울지사' });
  assert.match(v, /ORG:\(주\)대운토건\\,\s?서울지사/,
    '★★ 쉼표를 안 다듬으면 그 뒤가 딴 칸으로 밀립니다 — 화면에는 아무 표시가 없습니다');
});

test('★★ 세미콜론도 다듬는다 — vCard 가 «칸을 가르는» 글자다', () => {
  const v = card({ name: '이정미', title: '대리;과장대행' });
  assert.match(v, /TITLE:대리\\;과장대행/);
});

test('★★ 줄바꿈이 든 메모가 «파일을 깨뜨리지 않는다» — 뒷사람이 통째로 사라진다', () => {
  const v = card({ name: '박태진', memo: '첫 줄\n둘째 줄' });
  assert.ok(v.indexOf('NOTE:첫 줄\\n둘째 줄') > 0,
    '★★ 메모의 줄바꿈이 그대로 들어가면 그 줄부터 vCard 가 깨져,\n' +
    '  같은 파일에 담긴 뒷사람이 통째로 안 들어갑니다');
  assert.equal(v.split(/\r\n/).filter(function (l) { return /^END:VCARD$/.test(l); }).length, 1);
});

test('★ 역슬래시를 «먼저» 다듬는다 — 나중에 하면 방금 넣은 것까지 또 다듬는다', () => {
  const v = card({ name: '최기운', company: 'A\\B' });
  assert.match(v, /ORG:A\\\\B/);
});

test('★ 이름도 «다듬는다» — 두 자리(N·FN)가 함께 가야 한다', () => {
  const v = card({ name: '홍,길동' });
  assert.match(v, /N:홍\\,길동;;;;/);
  assert.match(v, /FN:홍\\,길동/);
});

test('★★ 주소는 «칸을 가르는 ;» 를 남긴다 — 다 다듬으면 주소가 한 덩어리로 들어간다', () => {
  const v = card({ name: '주민정', address: '충남 아산시 배방읍, 희망로 46' });
  assert.match(v, /ADR;TYPE=WORK:;;충남 아산시 배방읍\\,\s?희망로 46;;;;/,
    '★ 칸을 가르는 세미콜론은 그대로, 안쪽 글자만 다듬어야 합니다');
});

/* ══════ ② 빈 사람을 안 만든다 ══════ */

test('★★ 이름·번호·메일이 «모두» 없으면 넣지 않는다 — 빈 사람은 지우기가 더 일이다', () => {
  assert.equal(M.vcUsable({ company: '어느 회사', memo: '메모만' }), false);
  assert.equal(M.vcUsable({}), false);
  assert.equal(M.vcUsable(null), false);
});

test('★ 하나라도 있으면 넣는다 — 이름이 없어도 번호가 있으면 쓸모가 있다', () => {
  [{ name: '김' }, { mobile: '010-0000-0000' }, { tel: '041-000-0000' },
    { companyTel: '041-000-0000' }, { email: 'a@b.c' }].forEach(function (it) {
    assert.equal(M.vcUsable(it), true, JSON.stringify(it) + ' 를 뺐습니다');
  });
});

/* ══════ ③ 여러 장이 한 파일에 ══════ */

test('★★ 여러 사람이 «한 파일»에 이어 붙는다 — 그래야 한 번만 열면 된다', () => {
  const fn = cutFn(app, 'function vcfSave(');
  assert.match(fn, /items\.map\(vcardLines\)/,
    '★★ 한 장짜리와 다른 것으로 만들면 한쪽만 고쳐집니다');
  assert.match(fn, /\.join\('\\r\\n'\)/);
  /* 실제로 이어 붙여 본다 */
  const two = [{ name: '가' }, { name: '나' }].map(function (it) { return card(it); }).join('\r\n');
  assert.equal((two.match(/BEGIN:VCARD/g) || []).length, 2);
  assert.equal((two.match(/END:VCARD/g) || []).length, 2);
});

test('★★ 한 장짜리도 «같은 것»을 쓴다 — 두 벌이면 한쪽만 고쳐진다', () => {
  const one = cutFn(app, 'async function downloadVcf(');
  assert.match(one, /vcfSave\(\[it\]/,
    '★★ 한 장짜리가 제 벌로 만들고 있습니다 — 다듬기 고침이 한쪽에만 들어갑니다');
  assert.ok(!/BEGIN:VCARD/.test(one), '★ 만드는 글이 두 곳에 있습니다');
});

/* ══════ ④ 되돌릴 수 없다고 «말하고» 묻는다 ══════ */

/* ⚠ 「confirm( 이라는 글자가 있나」로는 못 잡는다 — 돌려서 본다 */
function selCtx(over) {
  const calls = { saved: [], toast: [], asked: [], exported: [] };
  const ctx = Object.assign({
    Object: Object, String: String, Date: Date, Promise: Promise, JSON: JSON,
    state: { sel: { a: 1, b: 1, c: 1 }, items: {
      a: { name: '김성호', mobile: '010-1111-1111' },
      b: { name: '이정미', email: 'lee@x.kr' },
      c: { company: '이름도 번호도 없음' }          /* 빠져야 한다 */
    } },
    confirm: function (m) { calls.asked.push(m); return true; },
    toast: function (m) { calls.toast.push(m); },
    puExport: function (kind, n, why) { calls.exported.push({ kind: kind, n: n, why: why }); return Promise.resolve(true); },
    vcfSave: function (items, name) { calls.saved.push({ items: items, name: name }); },
    vcUsable: M.vcUsable,
    _calls: calls
  }, over || {});
  vm.createContext(ctx);
  vm.runInContext(cutFn(app, 'async function selVcf('), ctx);
  return ctx;
}

test('★★ 「아니오」면 «아무 파일도 안 만든다»', async () => {
  const c = selCtx({ confirm: function () { return false; } });
  await c.selVcf();
  assert.equal(c._calls.saved.length, 0);
  assert.equal(c._calls.exported.length, 0, '★ 안 만들었는데 기록만 남으면 안 됩니다');
});

test('★★ 되돌릴 수 «없다는 것»을 말하고 묻는다 — 폰에 들어가면 우리가 못 지운다', async () => {
  const c = selCtx();
  await c.selVcf();
  const q = c._calls.asked.join(' ');
  assert.match(q, /못 지웁니다/,
    '★★ 한 번 폰에 들어가면 이 앱에서는 못 지웁니다 — 그 말을 안 하면 안 됩니다');
  assert.match(q, /두 벌/, '★ 이미 폰에 있는 사람이 겹친다는 것을 알려야 합니다');
  assert.match(q, /한꺼번에/);
});

test('★★ 빈 사람은 빼고, «몇 장 뺐는지» 말한다 — 말 안 하면 왜 수가 다른지 모른다', async () => {
  const c = selCtx();
  await c.selVcf();
  assert.equal(c._calls.saved.length, 1);
  assert.equal(c._calls.saved[0].items.length, 2, '★★ 빈 사람이 파일에 들어갔습니다');
  assert.match(c._calls.toast.join(' '), /1장 제외/,
    '★ 조용히 빼면 「3명 골랐는데 왜 2명이지」가 됩니다');
  /* ⚠ 아무 데나 「2명」이 있으면 통과하게 두면 안 된다 — 맨 앞 «몇 명을 만듭니다»가
     고른 수(3)로 적혀도 뒷줄의 2 때문에 통과한다(2026-08-30 되돌림에서 실제로 샜다). */
  assert.match(c._calls.asked[0], /^2명을 /,
    '★★ 「3명을 저장합니다」로 묻고 2명만 담으면, 한 명이 빠진 것을 아무도 모릅니다');
});

test('★ 담을 사람이 하나도 없으면 «묻지도 않는다»', async () => {
  const c = selCtx({ state: { sel: { c: 1 }, items: { c: { company: '빈 명함' } } } });
  await c.selVcf();
  assert.equal(c._calls.asked.length, 0, '★ 만들 수 없는 것을 물으면 헛걸음입니다');
  assert.equal(c._calls.saved.length, 0);
  assert.match(c._calls.toast.join(' '), /넣을 값이 없습니다/);
});

test('★ 아무것도 안 골랐으면 먼저 고르라고 한다', async () => {
  const c = selCtx({ state: { sel: {}, items: {} } });
  await c.selVcf();
  assert.equal(c._calls.saved.length, 0);
  assert.match(c._calls.toast.join(' '), /선택/);
});

test('★★ 내보내기 «기록»에 남는다 — 명함 정보가 밖으로 나가는 일이다', async () => {
  const c = selCtx();
  await c.selVcf();
  assert.equal(c._calls.exported.length, 1);
  assert.equal(c._calls.exported[0].kind, 'vcf');
  assert.equal(c._calls.exported[0].n, 2, '★ 고른 수가 아니라 «실제로 담긴 수»여야 합니다');
});

test('★★ 기록을 거절하면 «파일을 안 만든다» — 막아 놓고 나가면 막은 것이 아니다', async () => {
  const c = selCtx({ puExport: function () { return Promise.resolve(false); } });
  await c.selVcf();
  assert.equal(c._calls.saved.length, 0);
});

test('★ 파일 이름에 «몇 명인지»가 들어간다 — 내려받기 칸에 쌓이면 못 가른다', async () => {
  const c = selCtx();
  await c.selVcf();
  assert.match(c._calls.saved[0].name, /2명/);
  assert.match(c._calls.saved[0].name, /\.vcf$/);
});

/* ══════ ⑤ 화면에 자리가 있다 ══════ */

test('★★ 고른 명함 메뉴에 있다 — 그리고 «주소록 내보내기»와 갈라져 있다', () => {
  const fn = cutFn(app, 'function openSelMore(');
  assert.match(fn, /selVcf\(\)/, '★ 누를 자리가 없으면 만든 것이 없는 것과 같습니다');
  assert.match(fn, /폰 연락처로 저장/);
  /* 나란히 있는 두 가지가 «다른 물건»임이 눈에 보여야 한다 */
  const vcf = /📱[^<]*폰 연락처로 저장/.exec(fn);
  const csv = /📇[^<]*주소록 내보내기/.exec(fn);
  assert.ok(vcf && csv,
    '★★ 메일용 표(주소록)와 폰 연락처가 같은 그림이면 엉뚱한 것을 내보냅니다');
});
