'use strict';
/* CMS 자동이체 신청서 — 대표 지시 2026-08-28

   "사진첩에서 cms 계약서가 정리되어 자동이체 승인한 경우 자동이체 체크해달라.
    자동이체와 관련하여 계좌 등 은행 관련 정보도 자동 정리하고 기업정보함에 보관해달라."

   ■ 막혀 있던 것 셋
     ① 판독기가 CMS 신청서를 몰랐다 — 「서식」으로 뭉뚱그려졌다
     ② 기업 상세에 은행 칸이 아예 없었다 — 읽어도 담을 자리가 없다
     ③ 자동이체 체크는 사람만 눌렀다

   ■ 대표 결정 (2026-08-28)
     ① 계좌번호는 **온전히** 담는다 — "뒤 계좌 모두 보여야 한다. 그래야 추후 데이터를
        이용해서 cms 자동입력할 수 있다"  → 가리도록 되돌리면 안 된다
     ② 계약이 여럿이면 **자동으로 안 켠다** — 「골라 주세요」로 알린다
     ③ **은행·계좌·예금주가 다 읽히면** 켠다

   ■ 스스로 지키는 것
     · 예금주 **주민번호는 아예 안 읽는다**
     · CMS 신청서는 **민감 서류** — 사진 원본 주소를 안 남긴다

   실행: node --test tests/*.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { cutFn } = require('./cut-fn');

const same = function (a, b, m) { assert.equal(JSON.stringify(a), JSON.stringify(b), m); };

const R = path.join(__dirname, '..');
const readjs = fs.readFileSync(path.join(R, 'js', 'pu-doc-read.js'), 'utf8');
const docFile = fs.readFileSync(path.join(R, 'js', 'pu-doc-file.js'), 'utf8');
const store = fs.readFileSync(path.join(R, 'js', 'pu-photo-store.js'), 'utf8');
const server = fs.readFileSync(path.join(R, 'functions', 'photo-view.js'), 'utf8');
const photos = fs.readFileSync(path.join(R, 'pu-photos.html'), 'utf8');
const cards = fs.readFileSync(path.join(R, 'pu-cards.html'), 'utf8');

/* ══════ ① 판독기가 CMS 신청서를 안다 ══════ */

test('★ 갈래에 cms 가 있다 — 없으면 「서식」으로 뭉뚱그려진다', () => {
  assert.match(readjs, /var KINDS = \{[^}]*cms: 1/, '★ 갈래 목록에 cms 가 없습니다');
  assert.match(readjs, /kind=cms 이면 키:/, '★ 어떤 칸을 읽을지 안 알려 줍니다');
});

test('★ cms 가 form «앞»에 있다 — 뒤에 두면 신청서가 서식으로 먼저 떨어진다', () => {
  const line = readjs.split(/\r?\n/).find(l => /kind 는 다음 중 하나입니다/.test(l));
  assert.ok(line, '갈래 목록 줄을 못 찾았습니다');
  const iCms = line.indexOf('cms(');
  const iForm = line.indexOf('form(');
  assert.ok(iCms > 0, '★ 갈래 설명에 cms 가 없습니다');
  assert.ok(iCms < iForm,
    '★ form 은 「위 종류 어디에도 안 드는 것」이라, cms 가 뒤에 있으면 서식으로 먼저 떨어집니다');
});

test('★ 읽을 칸에 은행·계좌·예금주·출금일이 다 있다', () => {
  const line = readjs.split(/\r?\n/).find(l => /kind=cms 이면 키:/.test(l));
  ['bankName', 'bankAcct', 'bankHolder', 'payDay', 'applyType', 'payTo', 'payerNo']
    .forEach(function (k) {
      assert.ok(line.indexOf(k + '(') > 0, '★ ' + k + ' 를 안 읽습니다');
    });
});

test('★★ 주민번호는 «아예 안 읽는다» — 담기면 지우기 어렵다', () => {
  const line = readjs.split(/\r?\n/).find(l => /kind=cms 이면 키:/.test(l));
  assert.ok(!/주민|생년/.test(line), '★ cms 칸 목록에 주민번호·생년월일이 들어 있습니다');
  assert.match(readjs, /kind=cms 일 때 \*\*주민등록번호·생년월일은 절대 읽지 마세요/,
    '★ 「읽지 마세요」를 못박지 않으면 pairs 로 딸려 나옵니다');
});

test('★ 물음이 바뀌었으니 판 번호가 올라간다 — 안 올리면 옛 사진이 안 다시 읽힌다', () => {
  const pv = Number((readjs.match(/var PROMPT_VERSION = (\d+);/) || [])[1]);
  assert.ok(pv >= 11, '★ PROMPT_VERSION 이 ' + pv + ' 입니다 — 물음을 고쳤으면 올려야 합니다');
});

/* ══════ ② 민감 서류 — 두 목록이 «같아야» 한다 ══════ */

test('★★ CMS 신청서는 민감 서류다 — 계좌번호가 적혀 있다', () => {
  assert.match(store, /SENSITIVE_KINDS = \{[^}]*cms: 1/, '★ 저장 층이 민감으로 안 봅니다');
  assert.match(server, /SENSITIVE_KINDS = \{[^}]*cms: 1/, '★ 서버가 민감으로 안 봅니다');
});

test('★★ 화면과 서버의 민감 목록이 «똑같다» — 한 벌만 고치면 조용히 어긋난다', () => {
  const pick = function (s) {
    const m = s.match(/SENSITIVE_KINDS = \{([^}]*)\}/);
    return (m[1].match(/(\w+):/g) || []).map(x => x.slice(0, -1)).sort();
  };
  same(pick(store), pick(server),
    '★ 한쪽만 고치면 화면은 안 적는데 서버는 「민감 아니다」로 막습니다');
});

/* ══════ ③ 기업 상세에 은행 칸이 생겼다 — 두 곳이 짝이다 ══════ */

const BANK = ['bankName', 'bankAcct', 'bankHolder', 'payDay', 'payerNo', 'applyType'];

test('★ 기업 상세에 은행 칸 이름표가 있다 — 없으면 값은 쌓이는데 화면에 안 나온다', () => {
  BANK.forEach(function (k) {
    assert.ok(new RegExp("\\['" + k + "','").test(cards), '★ 기업 상세에 ' + k + ' 이름표가 없습니다');
  });
  assert.match(cards, /\['bankAcct','계좌번호'\]/);
});

test('★ 등록 층도 그 칸을 «담는다» — 한쪽만 늘리면 값이 안 넘어온다', () => {
  const keep = docFile.match(/var KEEP = \[[\s\S]*?\];/)[0];
  BANK.forEach(function (k) {
    assert.ok(keep.indexOf("'" + k + "'") > 0, '★ 등록 층 KEEP 에 ' + k + ' 가 없습니다');
  });
});

test('★★ 계좌번호를 가리지 않는다 — 대표 결정(자동입력에 쓰려면 온전해야 한다)', () => {
  const keep = docFile.match(/var KEEP = \[[\s\S]*?\];/)[0];
  assert.match(keep, /뒤 계좌 모두 보여야 한다/,
    '★ 왜 온전히 담는지 안 적혀 있으면 다음 사람이 「가려야지」 하고 되돌립니다');
  /* 담는 자리 어디에도 «자르는» 코드가 없어야 한다 */
  const send = cutFn(docFile, 'function sendToCoInfo(');
  assert.ok(!/bankAcct[\s\S]{0,80}(slice|replace\(\/\\d\/|mask)/.test(send),
    '★ 계좌번호를 자르거나 가리고 있습니다 — 자동입력에 못 씁니다');
});

/* ══════ ④ 사진첩 — 사업자번호가 없어도 업체명으로 보낸다 ══════ */

function photoCtx(hit) {
  const calls = [];
  const ctx = {
    Object, String, Promise, console: { warn() {} },
    window: {}, toast: function (m) { calls.push(m); },
    PuPhotoStore: { myName: function () { return '권형하'; } },
    _calls: calls
  };
  ctx.window.PuDocFile = ctx.PuDocFile = {
    findCompanyByName: function (nm) { calls.push('찾기:' + nm); return Promise.resolve(hit); },
    setContractCms: function (o) { calls.push(o); return Promise.resolve({ ok: true, message: '켰습니다' }); }
  };
  vm.createContext(ctx);
  /* ⚠ 2026-09-03 — canSendCoInfo 가 «사람이 채운 값»(readFields)을 본다 */
  vm.runInContext(photos.match(/^const FIX_KEYS = \[[^\r\n]*\];/m)[0].replace('const ', 'var ') + '\n' +
    cutFn(photos, 'function readFields(') + '\n' +
    cutFn(photos, 'function canSendCoInfo(') + '\n' +
    cutFn(photos, 'function coInfoFields(') + '\n' +
    cutFn(photos, 'function autoCmsOn(') + '\n' +
    cutFn(photos, 'function formTodo('), ctx);
  return ctx;
}
const CMS = { kind: 'cms', fields: { company: '아이행복어린이집', bankName: '국민은행',
  bankAcct: '123456-04-567890', bankHolder: '양유정', payDay: '25', applyType: '신규' } };

test('★ 사업자번호가 없어도 CMS 는 보낼 수 있다 — 그 서식엔 사업자번호 칸이 없다', () => {
  const c = photoCtx(null);
  assert.equal(c.canSendCoInfo(CMS), true, '★ CMS 신청서가 영영 기업 상세에 못 갑니다');
  /* ⚠ 2026-09-07 뒤집혔다 — 서식도 «상호로» 보낼 수 있다.
       종전에는 여기서 false 를 못 박아 두었는데, 화면은 서식에도 상호 칸을 내주고
       「상호를 적어 주세요」라고 말했다(CO_FIX_KINDS 에 form 이 있다). 적으라고
       해 놓고 안 받던 자리다. 이제 셋 다 같은 규칙을 쓴다.
       ⚠ 스스로 가지는 «않는다» — 그것은 photos-coinfo-auto 가 지킨다. */
  assert.equal(c.canSendCoInfo({ kind: 'form', fields: { company: '아이행복' } }), true,
    '★ 서식에 상호를 적어도 안 받는다 — 적으라고 해 놓고 안 받는 자리다');
  assert.equal(c.canSendCoInfo({ kind: 'bankbook', fields: { company: '아이행복' } }), true);
  assert.equal(c.canSendCoInfo({ kind: 'payslip', fields: { company: '아이행복' } }), false,
    '★ 상호를 «묻지 않는» 갈래까지 상호로 받으면 안 된다 — 급여명세서로 회사가 생긴다');
  assert.equal(c.canSendCoInfo({ kind: 'cms', fields: {} }), false, '업체명도 없으면 못 보낸다');
  assert.equal(c.canSendCoInfo({ kind: 'cms', fields: { company: 'x' }, filedInfo: { at: 1 } }), false,
    '이미 보냈으면 또 안 보낸다');
});

test('★ 업체명으로 사업자번호를 찾아 채운다', async () => {
  const c = photoCtx({ rec: { name: '아이행복어린이집', bizNo: '312-81-12345' } });
  const f = await c.coInfoFields(CMS);
  assert.ok(f, '★ 못 찾으면 계좌가 어디에도 안 담깁니다');
  assert.equal(f.bizno, '312-81-12345');
  assert.equal(f.bankAcct, '123456-04-567890', '★ 계좌번호가 온전해야 합니다');
});

test('★★ 업체를 못 찾으면 «아무 데도 안 넣는다» — 남의 회사에 계좌가 붙으면 못 되돌린다', async () => {
  const c = photoCtx(null);                       // 같은 이름이 둘이거나 없음
  assert.equal(await c.coInfoFields(CMS), null);
});

test('사업자번호가 이미 있으면 찾지 않는다 — 헛되이 업체 목록을 내려받지 않는다', async () => {
  const c = photoCtx(null);
  const f = await c.coInfoFields({ kind: 'cms', fields: { bizno: '312-81-12345', company: 'x' } });
  assert.ok(f && f.bizno === '312-81-12345');
  assert.ok(!c._calls.some(x => String(x).indexOf('찾기:') === 0), '★ 헛되이 찾았습니다');
});

/* ══════ ⑤ 자동이체 켜기 — 셋이 다 읽혔을 때만 ══════ */

test('★ 은행·계좌·예금주가 다 읽히면 켠다 (대표 결정 ③㉮)', async () => {
  const c = photoCtx(null);
  await c.autoCmsOn(CMS, CMS.fields);
  const sent = c._calls.find(x => x && x.bankName);
  assert.ok(sent, '★ 자동이체를 안 켰습니다');
  assert.equal(sent.companyName, '아이행복어린이집');
  assert.match(c._calls.join(' '), /켰습니다/, '켠 결과를 안 알려 줍니다');
});

test('★ 하나라도 비면 «안 켜고 말해 준다» — 반쪽 신청서다', async () => {
  for (const k of ['bankName', 'bankAcct', 'bankHolder']) {
    const f = Object.assign({}, CMS.fields); f[k] = '';
    const c = photoCtx(null);
    await c.autoCmsOn({ kind: 'cms', fields: f }, f);
    assert.ok(!c._calls.some(x => x && x.bankName), '★ ' + k + ' 가 비었는데 켰습니다');
    assert.match(c._calls.join(' '), /확인해 주세요/, '★ 왜 안 켰는지 안 말합니다');
  }
});

test('★★ 「해지」 신청서로는 켜지 않는다 — 끄는 일은 사람이 한다', async () => {
  const f = Object.assign({}, CMS.fields, { applyType: '해지' });
  const c = photoCtx(null);
  await c.autoCmsOn({ kind: 'cms', fields: f }, f);
  assert.ok(!c._calls.some(x => x && x.bankName), '★ 해지 신청서로 자동이체를 켰습니다');
});

test('CMS 가 아닌 사진은 건드리지 않는다', async () => {
  const c = photoCtx(null);
  await c.autoCmsOn({ kind: 'form', fields: CMS.fields }, CMS.fields);
  assert.ok(!c._calls.length, '★ 서식으로도 자동이체를 켰습니다');
});

/* ══════ ⑥ 등록 층 — 계약이 «딱 하나»일 때만 켠다 ══════ */

function ctCtx(contracts) {
  const ctx = { Object, String, Array, Date, Promise, Error, console: { warn() {} } };
  ctx.ERP_CT = 'data/contracts';
  ctx._u = null;
  ctx._read = 0;              /* 계약 목록을 몇 번 내려받았나 — 헛읽기를 잡으려고 센다 */
  ctx.deps = { db: { ref: function (p) {
    if (p === 'data/contracts') {
      return { once: function () {
        ctx._read++;
        return Promise.resolve({ val: function () { return contracts; } });
      } };
    }
    return { update: function (u) { ctx._u = u; return Promise.resolve(); } };
  } } };
  ctx.digits = function (v) { return String(v == null ? '' : v).replace(/\D/g, ''); };
  vm.createContext(ctx);
  vm.runInContext(cutFn(docFile, 'function bizKey(') + '\n' +
    cutFn(docFile, 'function coNameKey(') + '\n' +
    cutFn(docFile, 'function eachContract(') + '\n' +
    cutFn(docFile, 'function ctLive(') + '\n' +
    cutFn(docFile, 'function setContractCms('), ctx);
  return ctx;
}

test('★ 계약이 하나면 그 계약의 자동이체를 켠다', async () => {
  const c = ctCtx([{ id: 'k1', companyName: '아이행복어린이집', bizNo: '312-81-12345', status: 'active' }]);
  const r = await c.setContractCms({ bizNo: '312-81-12345', byName: '권형하', bankName: '국민은행' });
  assert.equal(r.ok, true, r.message);
  assert.equal(c._u['data/contracts/v/0/isCMS'], true, '★ 자동이체를 안 켰습니다');
  assert.match(c._u['data/contracts/v/0/cmsFrom'], /CMS 신청서/, '어디서 켰는지 안 남깁니다');
  assert.ok(c._u['data/contracts/u'], '★ 갱신시각이 없으면 푸른이알피 화면에 안 나타납니다');
});

test('★★ 계약이 여럿이면 «켜지 않고» 골라 달라고 한다 (대표 결정 ②㉮)', async () => {
  const c = ctCtx([
    { id: 'k1', bizNo: '312-81-12345', status: 'active' },
    { id: 'k2', bizNo: '312-81-12345', status: 'active' }
  ]);
  const r = await c.setContractCms({ bizNo: '312-81-12345' });
  assert.equal(r.ok, false);
  assert.equal(c._u, null, '★ 둘 중 하나를 켜 버리면 엉뚱한 계약이 자동이체가 됩니다');
  assert.match(r.message, /골라/, '무엇을 해야 하는지 안 말합니다');
});

test('★ 끝난 계약은 셈에서 뺀다 — 안 빼면 늘 「여럿」이 되어 아무것도 못 켠다', async () => {
  const c = ctCtx([
    { id: 'k0', bizNo: '312-81-12345', status: 'closed' },
    { id: 'k1', bizNo: '312-81-12345', status: 'active' }
  ]);
  const r = await c.setContractCms({ bizNo: '312-81-12345' });
  assert.equal(r.ok, true, r.message);
  assert.equal(c._u['data/contracts/v/1/isCMS'], true, '★ 살아 있는 계약을 안 골랐습니다');
});

test('★ 계약을 새로 만들지 않는다 — 없으면 그대로 알린다', async () => {
  const c = ctCtx([{ id: 'k1', bizNo: '999-99-99999', status: 'active' }]);
  const r = await c.setContractCms({ bizNo: '312-81-12345' });
  assert.equal(r.ok, false);
  assert.equal(c._u, null, '★ 없는 계약을 만들었습니다');
});

test('★ 끄지 않는다 — 켜는 일만 한다', async () => {
  const c = ctCtx([{ id: 'k1', bizNo: '312-81-12345', status: 'active', isCMS: true }]);
  const r = await c.setContractCms({ bizNo: '312-81-12345' });
  assert.equal(r.ok, true);
  assert.equal(r.already, true);
  assert.equal(c._u, null, '★ 이미 켜져 있는데 또 썼습니다');
  /* 어디에도 false 를 쓰지 않는다 */
  assert.ok(!/isCMS'\] = false/.test(cutFn(docFile, 'function setContractCms(')),
    '★ 끄는 코드가 생겼습니다 — 사람이 켜 둔 것이 꺼지면 안 됩니다');
});

test('★ 계약 레코드를 «통째로» 쓰지 않는다 — 그 사이 남이 고친 값이 날아간다', () => {
  const f = cutFn(docFile, 'function setContractCms(');
  assert.match(f, /u\[path \+ 'isCMS'\] = true;/, '칸 하나씩 써야 합니다');
  assert.ok(!/= hit\.rec;|= Object\.assign\(\{\}, hit\.rec/.test(f),
    '★ 레코드를 통째로 쓰고 있습니다');
});

test('업체명으로도 찾는다 — 사업자번호가 없는 신청서를 위해', async () => {
  const c = ctCtx([{ id: 'k1', companyName: '(주)아이행복어린이집', status: 'active' }]);
  const r = await c.setContractCms({ companyName: '아이행복어린이집' });
  assert.equal(r.ok, true, r.message);
});

test('★ 업체를 못 가리면 «계약 목록도 안 읽는다» — 헛되이 통째로 내려받으면 돈이 나간다', async () => {
  const c = ctCtx([{ id: 'k1', bizNo: '312-81-12345', status: 'active' }]);
  const r = await c.setContractCms({});
  assert.equal(r.ok, false);
  assert.equal(c._u, null, '아무 계약에나 켜면 안 된다');
  assert.equal(c._read, 0,
    '★ 어느 업체인지도 모르면서 계약 목록을 내려받았습니다 — 그 한 번이 계약 수백 건입니다');
});

/* ══════ ⑦ 배선 ══════ */

test('★ 기업 상세에 «넣은 뒤에» 자동이체를 켠다 — 값도 없이 체크만 켜지면 안 된다', () => {
  const fn = cutFn(photos, 'function sendCoInfoWith(');
  assert.ok(fn, 'sendCoInfoWith 를 찾지 못했습니다');
  assert.match(fn, /autoCmsOn\(read, fields\)/, '★ 자동이체 켜는 길을 안 부릅니다');
  assert.ok(fn.indexOf('saveRead') < fn.indexOf('autoCmsOn'),
    '★ 저장 전에 켜고 있습니다');
});

test('★ 못 찾았으면 «왜 못 갔는지» 사진에 적는다 — 조용히 넘기면 못 찾는다', () => {
  const fn = cutFn(photos, 'function sendCoInfo(');
  assert.match(fn, /어느 업체인지 못 찾았습니다/, '★ 조용히 넘어갑니다');
});

test('★ CMS 도 「확인 필요」에 잡힌다 — 보낼 것이 남았을 때만', () => {
  assert.match(cutFn(photos, 'function formTodo('), /read\.kind === 'cms'/,
    '★ 보낼 것이 남았는데 조용히 묻힙니다');
  assert.match(cutFn(photos, 'function checkWhy('), /r\.kind === 'form' \|\| r\.kind === 'cms'/,
    '★ 걸린 이유를 안 말합니다');
});

test('갈래 이름표가 있다 — 없으면 「알 수 없음」으로 뜬다', () => {
  assert.match(photos, /cms: 'CMS 자동이체 신청서'/);
});
