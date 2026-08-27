/* 📷 사진첩에서 계약서 찾기 (대표 승인 목업 2026-08-26)
   docs/mockups/erp-contract-photo-find.html

   ── 왜 ──
   대표 지시: 「계약서 보기가 어디에 있나. 계약서 찾기가 있으면 **찾아서 화면 보고
   넣고 입력 버튼**을 넣고 싶다」

   있기는 했다. 그런데 조건 셋이 모두 맞아야 단추가 나타났다 —
   ①회사명을 2글자 이상 쳤고 그 이름이 사진 속 회사명과 «맞고» ②종류를 딱 하나만
   고르고 ③그 사진이 «내» 사진첩에 있을 것. 운영 데이터로 세어 보니 계약서 21장 중
   대표님 사진첩에는 **2장**뿐이었고(김보람 님에게 19장), 계약 121건 가운데
   사진첩 계약서가 붙은 것이 **0건**이었다. 게다가 목록에 **그림이 없어** 어느
   계약서인지 열어 보기 전에는 알 수 없었다.

   ── 이 검사가 지키는 것 ──
   ① 단추는 **늘 보인다**(이름이 맞으면 초록불로 몇 건인지 알려 줄 뿐)
   ② 찾기 창에는 **후보가 아니라 전부**가 들어간다
   ③ 관리자면 전 직원, 직원이면 내 것
   ④ 그림·찾기 칸·원본 미리보기가 있다
   ⑤ 금액은 **여전히 안 채운다** — 단위를 짐작하면 1만 배 틀린다 */

'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { cutFn } = require('./cut-fn');

const R = path.join(__dirname, '..');
const ERP = fs.readFileSync(path.join(R, 'pu-erp.html'), 'utf8');

/* 순수 함수 둘을 그대로 떠서 돌린다 */
function load() {
  const ctx = { String, Object, Array, Number, Boolean, console,
    fmtDate: function (ms) { return new Date(ms).toISOString().slice(0, 10); } };
  vm.createContext(ctx);
  vm.runInContext(cutFn(ERP, 'function erpPhotoRowText(') + '\n' +
                  cutFn(ERP, 'function erpPhotoFilter('), ctx);
  return ctx;
}

const IT = (o) => Object.assign({ id: 'p1', year: '2026', at: 0, fields: {} }, o);

/* ── 목록 한 줄 ── */

test('★ 한 줄에 어느 회사·무슨 서류·언제·누가 가 담긴다', () => {
  const c = load();
  const t = c.erpPhotoRowText(IT({
    fields: { company: '가야엔지니어링', docName: '위임계약서', signDate: '2026-08-13' },
    ownerName: '김보람'
  }));
  assert.equal(t.head, '가야엔지니어링', '무슨 회사인지가 먼저 보여야 훑을 수 있습니다');
  assert.match(t.sub, /위임계약서/);
  assert.match(t.sub, /2026-08-13/);
  assert.match(t.sub, /김보람/, '누구 사진인지 안 보이면 전 직원 목록에서 헤맵니다');
});

test('업체명을 못 읽었으면 문서명이라도 내놓는다 — 빈 줄은 고를 수가 없다', () => {
  const c = load();
  assert.equal(c.erpPhotoRowText(IT({ fields: { docName: '자문계약서' } })).head, '자문계약서');
  assert.equal(c.erpPhotoRowText(IT({ fields: {} })).head, '(업체 미상)');
});

test('업체명과 문서명이 같으면 두 번 적지 않는다', () => {
  const c = load();
  const t = c.erpPhotoRowText(IT({ fields: { company: '가야', docName: '가야' } }));
  assert.equal(t.head, '가야');
  assert.ok(t.sub.indexOf('가야') < 0, '같은 말이 두 번 적힙니다: ' + t.sub);
});

/* ── 찾기 ── */

const LIST = [
  IT({ id: 'a', fields: { company: '가야엔지니어링', docName: '위임계약서', signDate: '2026-08-13' }, ownerName: '권형하' }),
  IT({ id: 'b', fields: { company: '수성산업', docName: '용역계약서', signDate: '2026-08-11' }, ownerName: '김보람' }),
  IT({ id: 'c', fields: { company: '맛찬들동탄점', docName: '자문계약서', ceo: '신욱임' }, ownerName: '김보람' })
];

test('★ 업체명·문서명·날짜·올린 사람 어디에 걸려도 찾아진다', () => {
  const c = load();
  const ids = (q) => c.erpPhotoFilter(LIST, q).map(function (x) { return x.id; }).join(',');
  assert.equal(ids('가야'), 'a', '업체명으로 못 찾습니다');
  assert.equal(ids('용역'), 'b', '문서명으로 못 찾습니다');
  assert.equal(ids('08-11'), 'b', '날짜로 못 찾습니다');
  assert.equal(ids('김보람'), 'b,c', '올린 사람으로 못 찾습니다');
  assert.equal(ids('신욱임'), 'c', '대표자 이름으로 못 찾습니다');
});

test('찾는 말이 없으면 전부 — 창을 열자마자 빈 목록이면 쓸 수가 없다', () => {
  const c = load();
  assert.equal(c.erpPhotoFilter(LIST, '').length, 3);
  assert.equal(c.erpPhotoFilter(LIST, '   ').length, 3, '빈칸만 친 것은 안 친 것이다');
  assert.equal(c.erpPhotoFilter(LIST, null).length, 3);
});

test('대소문자를 가리지 않는다', () => {
  const c = load();
  const l = [IT({ id: 'x', fields: { company: 'ABC Corp' } })];
  assert.equal(c.erpPhotoFilter(l, 'abc').length, 1);
});

/* ── 화면 ── */

test('★ 「계약서 찾기」 단추는 늘 보인다 — 조건이 맞을 때만 뜨면 사실상 안 뜬다', () => {
  const modal = cutFn(ERP, 'function ContractModal(');
  const at = modal.indexOf('📷 계약서 찾기');
  assert.ok(at > 0, '★ 늘 보이는 「계약서 찾기」 단추가 없습니다');
  /* 그 단추를 그리는 대목이 photoMatches 개수로 «막혀» 있으면 안 된다 */
  const before = modal.slice(Math.max(0, at - 1400), at);
  assert.ok(!/photoMatches\.length > 0 && h\('div'/.test(before),
    '★ 아직 「맞는 것이 있을 때만」 그립니다 — 이름을 치기 전에는 안 뜹니다');
  assert.match(modal.slice(at - 300, at), /photoMatches\.length \?/,
    '맞는 것이 있으면 몇 건인지 알려 주는 초록불이 없어졌습니다');
});

test('★ 찾기 창에는 «후보가 아니라 전부» 가 들어간다', () => {
  const modal = cutFn(ERP, 'function ContractModal(');
  const at = modal.indexOf('h(PhotoContractPickerModal');
  assert.ok(at > 0, '찾기 창을 여는 곳이 없습니다');
  const seg = modal.slice(at, at + 700);
  assert.match(seg, /_erpMyContractPhotos/,
    '★ 후보만 넘기면, 회사명을 안 쳤을 때 「찾기」를 눌러도 목록이 텅 빕니다');
  assert.ok(!/items:\s*photoMatches\s*,/.test(seg), '★ 아직 후보만 넘깁니다');
});

test('★ 목록에 그림·찾기 칸이 있고, 고른 것의 원본을 띄운다', () => {
  const p = cutFn(ERP, 'function PhotoContractPickerModal(');
  assert.match(p, /PuPhotoStore\.loadThumb\(/, '★ 목록에 그림이 없으면 어느 계약서인지 모릅니다');
  /* ⚠ 이름을 못 박지 않는다 — 2026-08-27 에 「까닭까지 주는 길」(loadFullDetail)로
     옮겼다. 볼 것은 «원본을 부르는가» 다. */
  assert.match(p, /PuPhotoStore\.loadFull(Detail)?\(/, '★ 원본을 안 띄우면 「보고 넣는」 것이 안 됩니다');
  assert.match(p, /erpPhotoFilter\(all, q\)/, '찾기 칸이 목록을 안 거릅니다');
  assert.match(p, /이 내용을 입력/, '입력 단추가 없습니다');
});

test('★ 미리보기는 보이는 것만 받는다 — 열자마자 전부 받으면 그것이 요금이다', () => {
  const p = cutFn(ERP, 'function PhotoContractPickerModal(');
  const at = p.indexOf('loadThumb');
  assert.ok(at > 0, '미리보기를 아예 안 받습니다');
  assert.match(p.slice(Math.max(0, at - 400), at), /rows\.slice\(0, \d+\)/,
    '★ 목록 전부의 미리보기를 한꺼번에 받습니다');
  assert.match(p, /if\(thumbs\[it\.id\] !== undefined\) return;/,
    '★ 이미 받은 것을 또 받습니다 — 글자를 칠 때마다 다시 받게 됩니다');
});

test('★ 원본은 «고른 한 장»만 받는다', () => {
  const p = cutFn(ERP, 'function PhotoContractPickerModal(');
  const at = p.search(/PuPhotoStore\.loadFull(Detail)?\(/);
  const before = p.slice(Math.max(0, at - 300), at);
  assert.match(before, /if\(!sel/, '★ 아무것도 안 골랐는데 원본을 부릅니다');
  assert.match(p, /\[sel && sel\.id\]/, '고른 것이 바뀔 때만 받아야 합니다');
});

test('★ 원본이 빈손으로 와도 그 사실을 말한다', () => {
  const p = cutFn(ERP, 'function PhotoContractPickerModal(');
  assert.match(p, /else setFullErr\(/,
    '★ 빈손일 때 아무 말도 안 하면 「불러오는 중…」에서 영영 멎습니다');
});

test('★ 남의 사진이면 주인을 함께 넘긴다 — 안 넘기면 내 자리를 뒤지다 빈손이 된다', () => {
  const p = cutFn(ERP, 'function PhotoContractPickerModal(');
  assert.match(p, /loadThumb\(it\.year, it\.id, it\.owner \|\| undefined/, '미리보기에 주인을 안 넘깁니다');
  assert.match(p, /loadFull(Detail)?\(sel\.year, sel\.id, sel\.owner \|\| undefined\)/, '원본에 주인을 안 넘깁니다');
  /* 붙인 뒤 「원본 보기」도 마찬가지다 */
  assert.match(cutFn(ERP, 'function ContractDocViewModal('),
    /loadFull(Detail)?\(src\.year, src\.id, src\.owner \|\| undefined\)/,
    '★ 계약에 붙인 뒤 원본 보기가 주인을 잃습니다');
  assert.match(cutFn(ERP, 'function ContractModal('), /owner: photoPreview\.item\.owner/,
    '★ 계약에 주인을 안 적어 두면 다음에 열 때 못 찾습니다');
});

test('★ 관리자면 전 직원, 아니면 내 것 — 규칙을 새로 만들지 않는다', () => {
  const f = cutFn(ERP, 'function erpLoadMyContractPhotos(');
  assert.match(f, /erpPhotoAdmin\(\)/, '★ 누구 것을 볼지 안 가립니다');
  assert.match(f, /listYearsAll/, '관리자가 전 직원 것을 못 봅니다');
  assert.match(f, /listYears\(\)/, '직원이 내 것을 못 봅니다');
  assert.match(f, /catch\(function\(\)\{ return null; \}\)/,
    '★ 전 직원 읽기가 막히면 「찾기」가 통째로 죽습니다 — 내 것으로 물러나야 합니다');
  /* 저장 층에 isAdmin 을 안 넘기면 listYearAll 이 거절한다 */
  assert.match(ERP, /PuPhotoStore\.init\(\{[^}]*isAdmin: erpPhotoAdmin\(\)/,
    '★ 저장 층에 관리자임을 안 알려 주면 전 직원 읽기가 거절됩니다');
});

/* ── 금액은 여전히 안 채운다 ── */

function applyPatch() {
  const ctx = { String, Object, Array, Number, parseInt, console, BRIEF_MAX: 40 };
  vm.createContext(ctx);
  vm.runInContext(cutFn(ERP, 'function erpVatTextToFlag(') + '\n' +
                  cutFn(ERP, 'function erpContractPhotoApplyPatch('), ctx);
  return ctx.erpContractPhotoApplyPatch;
}

test('★ 종류를 안 골랐으면 금액·업무를 «없는 칸»에 담지 않는다', () => {
  /* 「찾기」가 늘 열리게 되면서 종류 0개로 들어오는 길이 생겼다(2026-08-26).
     그대로 담으면 amounts[undefined] 라는 없는 칸이 생겨 화면에 안 보이면서 저장된다. */
  const fn = applyPatch();
  const out = fn({ deposit: '500,000', scope: '인사노무진단', signDate: '2026-08-13' }, undefined, {});
  assert.equal(out.patch.amounts, undefined, '★ 없는 칸에 금액을 담았습니다: ' + JSON.stringify(out.patch.amounts));
  assert.equal(out.patch.briefs, undefined, '★ 없는 칸에 업무를 담았습니다');
  assert.equal(out.patch.signDate, '2026-08-13', '종류와 무관한 계약일까지 버리면 안 됩니다');
  assert.ok(out.previewLines.some(function (l) { return /종류를 먼저 골라/.test(l); }),
    '★ 왜 안 채웠는지 말을 안 합니다: ' + out.previewLines.join(' | '));
});

test('종류를 골랐으면 그 칸에 담는다 — 예전 동작 그대로', () => {
  const fn = applyPatch();
  const out = fn({ deposit: '500,000', scope: '인사노무진단' }, 'consulting', {});
  assert.equal(out.patch.amounts.consulting, 500000);
  assert.equal(out.patch.briefs.consulting, '인사노무진단');
});

test('★ 단위가 붙은 금액은 그대로 짐작하지 않는다 — 1만 배 틀린다', () => {
  const fn = applyPatch();
  /* ① 「1,000만원」 — 숫자만 읽어 1,000 이 된다. 1,000만(10,000,000)으로 «짐작»하면
     1만 배 틀린 금액이 조용히 들어간다. 숫자만 담고 **원문을 함께** 내놓는다. */
  const a = fn({ fee: '1,000만원' }, 'consulting', {});
  assert.notEqual(a.patch.amounts.consulting, 10000000, '★ 단위를 짐작해 금액을 만들어 냈습니다');
  assert.ok(a.previewLines.some(function (l) { return /원문 "1,000만원"/.test(l); }),
    '원문을 안 보여 주면 사람이 판단할 수 없습니다: ' + a.previewLines.join(' | '));

  /* ② 「월 100만원」 — 숫자가 앞에 없어 **아무것도 못 읽는다.** 그때는 아예 안 채운다.
     지어내는 것보다 안 채우는 것이 낫다(찾기 창이 원문을 옆에 띄워 준다). */
  const b = fn({ fee: '월 100만원' }, 'consulting', {});
  assert.equal(b.patch.amounts, undefined, '★ 못 읽은 금액을 채웠습니다');
  assert.ok(!b.previewLines.some(function (l) { return /계약금/.test(l); }),
    '못 읽었는데 금액을 채웠다고 말합니다: ' + b.previewLines.join(' | '));
});

test('★ 찾기 창이 원문 금액을 옆에 띄운다 — 못 채운 값을 사람이 보고 넣는다', () => {
  const p = cutFn(ERP, 'function PhotoContractPickerModal(');
  assert.match(p, /\['보수', f\.fee\]/, '판독한 금액 원문을 안 보여 줍니다');
  assert.match(p, /단위를 짐작하지 않습니다/, '왜 안 채웠는지 말을 안 합니다');
});
