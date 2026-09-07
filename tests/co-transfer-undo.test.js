'use strict';
/* 업체 이관 — 막이(ⓒ)와 되돌리기(ⓑ)   (2026-09-07)

   ■ 무슨 일이 있었나
   계약-2026-121 「주식회사 나래산업 · 자문」이 「나래사내근로복지기금 · 기금」 안으로 들어갔다.
   계약서는 맞았고 이관할 때 고른 업체가 틀렸다. 그런데 그 기금은 이미 있던 업체라
   «지우지 않고 빈 칸 14개를 채웠다» — 한 업체 안에 두 회사가 섞였다.

   ■ 왜 아무 검사도 안 걸렸나
   validateCompanyLink 는 이름이 달라도 «사업자번호가 같으면» 통과시킨다
   (pu-ontology.js 의 !(biz&&targetBiz&&biz===targetBiz) 예외). 두 기록이 번호를 나눠
   갖고 있어 그 예외에 딱 걸렸다. 유형(자문/기금)은 지금껏 아무 데서도 안 봤다.

   ■ 이 검사가 지키는 것 — «규칙»이지 지금 값이 아니다
     ① 이름이나 유형이 다르면 이관 전에 멈춘다 (번호가 같아도)
     ② ㈜·주식회사 차이로는 안 멈춘다 (매번 뜨는 경고는 눈에서 지워진다)
     ③ 이관은 «되돌릴 자리»를 남긴다 (없으면 되돌릴 길이 없다 — 나래가 그랬다)
     ④ 「이음」을 되돌릴 때 업체를 «지우지 않는다» (애먼 업체가 사라진다)
     ⑤ 되돌리기는 계약을 «새로 만들지 않는다» (번호가 두 벌 된다 — 080·081 이 실제로 그렇다)
     ⑥ 이관 뒤에 사람이 고친 칸은 «건드리지 않는다»
     ⑦ 이관된 것이 «그 유형 탭»에서 보인다 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const { test } = require('node:test');
const { cutFn } = require('./cut-fn');
const { stripComments } = require('./strip-comments');

const APP = path.join(__dirname, '..', 'pu-erp.html');
const src = fs.readFileSync(APP, 'utf8').replace(/\r\n/g, '\n');
const bare = stripComments(src);
const ONT = fs.readFileSync(path.join(__dirname, '..', 'js', 'pu-ontology.js'), 'utf8');

/* 함수를 소스에서 그대로 떼어 «실제로 돌린다» — 글자만 보면 고장 난 채로 통과한다 */
function realm(extra) {
  const ctx = Object.assign({ console: console, window: {}, document: undefined }, extra || {});
  ctx.window = ctx.window || {};
  vm.createContext(ctx);
  return ctx;
}
function load(ctx, decls) {
  decls.forEach(function (d) { vm.runInContext(cutFn(src, d), ctx); });
  return ctx;
}

/* ── 온톨로지의 이름 다듬개를 «진짜로» 불러온다 ────────────────────────────
   막이는 이 다듬개로 「㈜ 차이뿐인가」를 가린다. 흉내를 내면 여기서만 맞는다. */
function loadOntology() {
  const sandbox = { module: { exports: {} }, window: {}, define: undefined, console: console };
  sandbox.exports = sandbox.module.exports;
  vm.createContext(sandbox);
  vm.runInContext(ONT, sandbox);
  return sandbox.window.PuOntology || sandbox.module.exports;
}

// ══════════════════════════════════════════════════════════════════
test('① 이름이 다르면 멈춘다 — 사업자번호가 같아도 (validateCompanyLink 가 봐주던 구멍)', function () {
  const ctx = realm({ window: { PuOntology: loadOntology() } });
  load(ctx, ['function erpCoTransferGap(']);
  const gap = vm.runInContext(
    'erpCoTransferGap(' +
    JSON.stringify({ companyName: '주식회사 나래산업', bizNo: '125-86-09231', typeCodes: { company: '자문' } }) + ',' +
    JSON.stringify({ name: '나래사내근로복지기금', bizNo: '125-86-09231', typeCode: '기금' }) + ')', ctx);
  assert.equal(gap.nameGap, true, '★ 이름이 다른데 안 잡았습니다');
  assert.equal(gap.typeGap, true, '★ 유형이 다른데 안 잡았습니다');
  assert.equal(gap.differs, true);
});

test('② ㈜·주식회사 차이만으로는 안 멈춘다 — 매번 뜨는 경고는 눈에서 지워진다', function () {
  const ctx = realm({ window: { PuOntology: loadOntology() } });
  load(ctx, ['function erpCoTransferGap(']);
  const call = (ct, co) => vm.runInContext('erpCoTransferGap(' + JSON.stringify(ct) + ',' + JSON.stringify(co) + ')', ctx);
  const same = call({ companyName: '주식회사 나래산업', typeCodes: { company: '자문' } },
                    { name: '㈜나래산업', typeCode: '자문' });
  assert.equal(same.differs, false, '★ ㈜ 차이로 멈추면 사람이 경고를 안 읽게 됩니다');
  const spaced = call({ companyName: '(주) 해담솔', typeCodes: { company: '급여' } },
                      { name: '주식회사해담솔', typeCode: '급여' });
  assert.equal(spaced.differs, false, '★ 띄어쓰기 차이로 멈추면 안 됩니다');
});

test('③ 유형만 달라도 멈춘다 — 지금껏 아무 데서도 안 보던 것이다', function () {
  const ctx = realm({ window: { PuOntology: loadOntology() } });
  load(ctx, ['function erpCoTransferGap(']);
  const g = vm.runInContext('erpCoTransferGap(' +
    JSON.stringify({ companyName: '송림산업', typeCodes: { company: '자문' } }) + ',' +
    JSON.stringify({ name: '송림산업', typeCode: '급여' }) + ')', ctx);
  assert.equal(g.typeGap, true, '★ 자문 계약이 급여 업체로 들어가는데 안 멈춥니다');
  assert.equal(g.nameGap, false);
  assert.equal(g.differs, true);
});

test('④ 한쪽이 비었으면 멈추지 않는다 — 「빈 칸」은 「다름」이 아니다', function () {
  const ctx = realm({ window: { PuOntology: loadOntology() } });
  load(ctx, ['function erpCoTransferGap(']);
  const call = (ct, co) => vm.runInContext('erpCoTransferGap(' + JSON.stringify(ct) + ',' + JSON.stringify(co) + ')', ctx);
  assert.equal(call({ companyName: 'A', typeCodes: {} }, { name: 'A', typeCode: '자문' }).differs, false,
    '계약서에 유형이 없으면 견줄 것이 없습니다');
  assert.equal(call({ companyName: 'A', typeCodes: { company: '자문' } }, { name: '', typeCode: '자문' }).differs, false,
    '업체 이름이 비었으면 견줄 것이 없습니다');
  assert.equal(vm.runInContext('erpCoTransferGap(null, null).differs', ctx), false, '빈 값에도 안 터져야 합니다');
});

// ══════════════════════════════════════════════════════════════════
const UNDO_CO = {
  id: 'co-1', name: '나래사내근로복지기금', typeCode: '기금',
  ceo: '전영범', phone: '031-686-5247', monthlyAdvisoryFee: 300000, managerMain: 'P-003',
  sourceContractNo: '계약-2026-121', sourceKind: 'contract',
  note: '발급사유: 종된사업장 추가\n계약(계약-2026-121) 이관 — 빈 칸 4개를 채웠습니다',
  xferUndo: {
    mode: 'merged', contractNo: '계약-2026-121', contractId: 'ct-1', at: '2026-09-07T11:36:46.041Z',
    keys: ['ceo', 'phone', 'monthlyAdvisoryFee', 'managerMain', 'sourceContractNo', 'sourceKind'],
    before: { ceo: '', phone: '', monthlyAdvisoryFee: 0, managerMain: '', sourceContractNo: '', sourceKind: '' },
    after: { ceo: '전영범', phone: '031-686-5247', monthlyAdvisoryFee: 300000, managerMain: 'P-003',
             sourceContractNo: '계약-2026-121', sourceKind: 'contract' },
    noteBefore: '발급사유: 종된사업장 추가'
  }
};
const CONTRACTS = [{ id: 'ct-1', contractNo: '계약-2026-121', status: 'transferred', companyName: '주식회사 나래산업' }];

function planCtx() {
  const ctx = realm({});
  load(ctx, ['function coLegacyUndoPlan(', 'function coUndoPlan(', 'function coUndoWorthShowing(']);
  vm.runInContext('var CO_UNDO_HIDE = ' +
    (bare.match(/var CO_UNDO_HIDE = (\{[^}]*\})/) || [])[1] + ';', ctx);
  return ctx;
}
function plan(co, contracts) {
  const ctx = planCtx();
  return vm.runInContext('coUndoPlan(' + JSON.stringify(co) + ',' + JSON.stringify(contracts || CONTRACTS) + ')', ctx);
}

test('⑤ 손으로 만든 업체에는 계획이 안 선다 — 업체 대부분이 그렇다', function () {
  assert.equal(plan({ id: 'x', name: '손으로 만든 곳' }), null);
  assert.equal(plan({ id: 'x', xferUndo: {} }), null, '되돌릴 자리도 출처 계약도 없으면 되돌릴 수 없습니다');
});

/* ── 되돌릴 자리가 «없던 때» 이관된 것 (2026-09-07 저녁) ────────────────────
   xferUndo 는 그날 배포부터 남는다. 그 전에 이관된 곳에는 없어서
   대표 화면에는 단추가 «아예 안 보였다» — 사건·컨설팅에는 늘 보이는데. */
const LEGACY = { id: 'co-old', name: '옛날에 이관된 곳', typeCode: '자문',
  ceo: '홍길동', monthlyAdvisoryFee: 250000,
  sourceContractNo: '계약-2026-121', sourceContractId: 'ct-1', sourceKind: 'contract', sourceId: 'ct-1',
  note: '계약(계약-2026-121)에서 이관' };

test('⑤-1 ★ 되돌릴 자리가 없어도 «출처 계약»만 있으면 계획이 선다', function () {
  const p = plan(LEGACY);
  assert.ok(p, '★ 2026-09-07 전에 이관된 곳에서 단추가 사라집니다');
  assert.equal(p.mode, 'legacy');
  assert.equal(p.contractNo, '계약-2026-121');
  assert.ok(p.contract && p.contract.id === 'ct-1', '★ 원본 계약을 찾아야 합니다');
});

test('⑤-2 ★ 옛 이관은 칸을 «안» 비운다 — 무엇이 채워졌는지 기록이 없다', function () {
  const p = plan(LEGACY);
  assert.deepEqual(Array.from(p.clear), [], '★ 기록도 없이 값을 비우면 사람이 넣은 것까지 지웁니다');
  assert.deepEqual(Array.from(p.show), []);
  assert.equal(p.noteBefore, LEGACY.note, '메모도 그대로 둡니다');
});

test('⑤-3 계약번호가 없고 ID만 있어도 찾는다 (옛 기록은 꼴이 제각각이다)', function () {
  const onlyId = { id: 'c', sourceKind: 'contract', sourceId: 'ct-1' };
  const p = plan(onlyId);
  assert.ok(p && p.contract && p.contract.id === 'ct-1', '★ sourceId 로도 찾아야 합니다');
  assert.equal(p.contractNo, '계약-2026-121', '번호는 찾은 계약에서 채웁니다');
});

test('⑤-4 sourceKind 가 계약이 아니면 계획이 안 선다 — 사진·명함에서 온 것까지 걸리면 안 된다', function () {
  assert.equal(plan({ id: 'c', sourceKind: 'photo', sourceId: 'p-1' }), null);
});

test('⑤-5 ★ 옛 이관을 되돌리면 «출처 자국»을 끊는다 — 안 끊으면 단추가 영영 붙어 있다', function () {
  const fn = stripComments('<script>' + cutFn(src, 'async function undoCompanyTransfer(') + '</script>');
  const leg = fn.slice(fn.indexOf("if(plan.mode === 'legacy')"));
  assert.match(leg, /back\.sourceContractNo = '';/, '★ 출처 계약번호가 남습니다');
  assert.match(leg, /back\.sourceContractId = '';/, '★ 출처 계약 ID 가 남습니다');
  assert.ok(!/dbRemove\('companies'/.test(leg.slice(0, leg.indexOf('showToast'))),
    '★ 옛 이관에서 업체를 지우고 있습니다 — 새로 만든 것인지 알 길이 없습니다');
});

test('⑤-6 ★ 옛 이관 확인 창은 「비운다」고 하지 않는다 — 못 하는 일을 한 척하면 안 된다', function () {
  const fn = cutFn(src, 'async function undoCompanyTransfer(');
  const msg = fn.slice(fn.indexOf("plan.mode === 'legacy'"), fn.indexOf("plan.mode === 'created'"));
  assert.ok(!/칸만 도로 비웁니다/.test(msg), '★ 못 비우는데 비운다고 적고 있습니다');
  assert.match(msg, /기록이 없습니다/, '★ 왜 못 비우는지 사람에게 말해야 합니다');
  assert.match(msg, /칸반에 다시 뜹니다/, '★ 무엇이 일어나는지는 적어야 합니다');
});

test('⑥ 이관이 넣은 값 그대로면 비운다', function () {
  const p = plan(UNDO_CO);
  assert.equal(p.mode, 'merged');
  assert.equal(p.clear.length, 6, '★ 여섯 칸 다 되돌려야 합니다');
  assert.equal(p.kept.length, 0);
  assert.equal(p.noteBefore, '발급사유: 종된사업장 추가', '★ 이관이 붙인 줄만 걷고 원래 메모는 남깁니다');
  assert.ok(p.contract && p.contract.id === 'ct-1', '★ 원본 계약을 찾아야 합니다');
});

test('⑦ ★ 이관 뒤에 사람이 고친 칸은 건드리지 않는다 — 그 손질이 말없이 사라진다', function () {
  const edited = Object.assign({}, UNDO_CO, { phone: '031-000-0000' });   // 누가 고쳐 뒀다
  const p = plan(edited);
  assert.ok(p.kept.indexOf('phone') >= 0, '★ 고쳐진 칸을 그대로 비우고 있습니다');
  assert.ok(p.clear.indexOf('phone') < 0, '★ 고쳐진 칸이 비울 목록에 들어 있습니다');
  assert.ok(p.clear.indexOf('ceo') >= 0, '안 고쳐진 칸은 그대로 비웁니다');
});

test('⑧ 배관 칸은 세되 사람에게 늘어놓지 않는다', function () {
  const p = plan(UNDO_CO);
  assert.ok(p.clear.indexOf('sourceKind') >= 0, '★ 배관도 «비우기»는 해야 합니다 — 안 지우면 출처가 남습니다');
  assert.ok(p.show.indexOf('sourceKind') < 0, '★ sourceKind 를 사람 눈앞에 펴고 있습니다');
  assert.ok(p.show.indexOf('ceo') >= 0, '★ 사람이 알아야 할 칸이 안 보입니다');
});

test('⑨ 원본 계약을 못 찾으면 계획에 계약이 없다 — 부르는 쪽이 멈출 수 있게', function () {
  assert.equal(plan(UNDO_CO, []).contract, null);
});

test('⑩ 새로 만든 업체는 되돌리는 법이 다르다', function () {
  const created = { id: 'co-2', name: '주식회사 나래산업',
    xferUndo: { mode: 'created', contractNo: '계약-2026-121', contractId: 'ct-1', keys: [], before: {}, after: {} } };
  const p = plan(created);
  assert.equal(p.mode, 'created', '★ 두 갈래가 갈리지 않으면 애먼 업체가 사라집니다');
  assert.equal(p.clear.length, 0);
});

// ══════════════════════════════════════════════════════════════════
// 아래는 «화면에 붙어 있는가»를 본다 — 붙지 않은 함수는 아무도 못 쓴다
const XFER = cutFn(src, 'function transferContract(');
const XFER_BARE = stripComments('<script>' + XFER + '</script>');
const UNDO_FN = cutFn(src, 'async function undoCompanyTransfer(');
const UNDO_BARE = stripComments('<script>' + UNDO_FN + '</script>');

test('⑪ 이관은 두 갈래 «모두» 되돌릴 자리를 남긴다 — 없으면 되돌릴 길이 없다', function () {
  assert.match(XFER_BARE, /xferUndo\s*=\s*\{\s*mode:\s*'merged'/, '★ 「이음」 갈래가 자리를 안 남깁니다');
  assert.match(XFER_BARE, /xferUndo\s*=\s*\{\s*mode:\s*'created'/, '★ 「새로 만들기」 갈래가 자리를 안 남깁니다');
  assert.ok(/before\s*:\s*undoBefore/.test(XFER_BARE) && /after\s*:\s*undoAfter/.test(XFER_BARE),
    '★ before·after 를 둘 다 남겨야 «사람이 고친 칸»을 가려낼 수 있습니다');
});

test('⑫ ★★ 「이음」을 되돌릴 때 업체를 지우지 않는다 — 애먼 업체가 사라진다', function () {
  /* returnToContract 를 그대로 베끼면 dbRemove('companies', …) 가 두 갈래 모두에서 돈다.
     지우기는 «새로 만든» 갈래 안에서만 일어나야 한다. */
  const created = UNDO_BARE.slice(UNDO_BARE.indexOf("if(plan.mode === 'created')"), UNDO_BARE.indexOf('} else {'));
  const merged = UNDO_BARE.slice(UNDO_BARE.indexOf('} else {'));
  assert.match(created, /dbRemove\('companies'/, '새로 만든 업체는 목록에서 빼야 합니다');
  assert.ok(!/dbRemove\('companies'/.test(merged), '★ 얹은 갈래에서 업체를 지우고 있습니다 — 나래 기금이 사라집니다');
  assert.match(created, /dbSet\('trash_bin'/, '★ 지우지 말고 휴지통으로 — 회계기록은 옮긴다');
});

test('⑬ ★ 되돌리기는 계약을 새로 만들지 않는다 — 번호가 두 벌 된다', function () {
  /* returnToContract 는 genContractNo() 로 새 계약을 만든다. 원래 계약은 살아 있으므로
     같은 번호가 둘이 된다 — 계약-2026-080·081 이 실제로 그렇게 되어 있다(2026-09-07 실측). */
  assert.ok(!/genContractNo/.test(UNDO_BARE), '★ 새 계약번호를 뽑고 있습니다');
  assert.ok(!/id:\s*'ct-'/.test(UNDO_BARE), '★ 계약을 새로 만들고 있습니다');
  assert.match(UNDO_BARE, /status\s*:\s*'signed'/, '★ 원래 계약의 상태를 되돌려야 합니다');
});

test('⑭ 계약을 먼저 살린다 — 업체를 먼저 비우면 어디에도 자료가 없는 틈이 생긴다', function () {
  const ctAt = UNDO_BARE.indexOf("dbUpsert('contracts'");
  const coAt = UNDO_BARE.search(/dbRemove\('companies'|dbUpsert\('companies'/);
  assert.ok(ctAt > 0 && coAt > 0 && ctAt < coAt, '★ 업체를 계약보다 먼저 손대고 있습니다');
  assert.ok((UNDO_BARE.match(/dbUpsert\('contracts',\s*plan\.contract\)/g) || []).length >= 2,
    '★ 업체 쪽이 실패했을 때 계약을 되돌리는 길이 없습니다');
});

test('⑮ ⋯ 메뉴 두 자리 «모두»에 붙어 있다 — 한쪽만 붙이면 탭에 따라 없다', function () {
  /* ⚠ 「coUndoItem(co)」 로 세면 «함수 선언»(function coUndoItem(co){) 까지 세어져
     한 자리를 빼도 셋이 둘이 될 뿐 통과한다 — 되돌림 검사에서 실제로 빠져나갔다.
     부르는 자리만 센다(뒤의 쉼표가 그 표시다). */
  const rows = (bare.match(/coUndoItem\(co\),/g) || []).length;
  assert.ok(rows >= 2, '★ ⋯ 메뉴 자리는 둘입니다 (활성·사무대행) — ' + rows + '군데만 붙었습니다');
  const item = stripComments('<script>' + cutFn(src, 'function coUndoItem(') + '</script>');
  assert.match(item, /return null;/, '★ 이관으로 온 업체에만 보여야 합니다');
  assert.match(item, /sourceContractNo \|\| co\.sourceContractId/,
    '★ xferUndo 만 보면 2026-09-07 전에 이관된 곳에서 단추가 사라집니다');
  assert.match(item, /undoCompanyTransfer\(/, '★ 눌러도 아무 일이 없습니다');
  /* 대표 지시 「다른관리 처럼」 — 사건·컨설팅과 «같은 말»이어야 화면에서 찾는다 */
  assert.match(item, /label:'↩ 계약관리로 복귀'/, '★ 다른 화면과 이름이 다릅니다');
});

test('⑮-1 ★ 단추는 손으로 만든 업체에는 안 보인다 (실제로 돌려 본다)', function () {
  /* 글자만 보면 「조건이 있다」까지만 안다 — 정말 걸러지는지 돌려서 본다 */
  const ctx = realm({ refreshCompanies: function () { }, undoCompanyTransfer: function () { } });
  vm.runInContext(cutFn(src, 'function coUndoItem('), ctx);
  const call = (co) => vm.runInContext('coUndoItem(' + JSON.stringify(co) + ')', ctx);
  assert.equal(call({ id: 'a', name: '손으로 만든 곳' }), null, '★ 안 보여야 할 곳에 보입니다');
  assert.equal(call(null), null, '빈 값에도 안 터져야 합니다');
  assert.ok(call({ id: 'b', xferUndo: { mode: 'merged', contractNo: '계약-1' } }), '새 이관에는 보여야 합니다');
  assert.ok(call({ id: 'c', sourceContractNo: '계약-2' }), '★ 옛 이관에도 보여야 합니다');
  assert.ok(call({ id: 'd', sourceKind: 'contract', sourceId: 'ct-9' }), '★ ID 만 있는 옛 기록에도');
  assert.equal(call({ id: 'e', sourceKind: 'photo', sourceId: 'p-1' }), null, '★ 사진에서 온 것까지 걸리면 안 됩니다');
  assert.equal(call({ id: 'f', xferUndo: { contractNo: 'x' } }), null, 'mode 없는 껍데기는 아닙니다');
});

test('⑯ 막이가 실제로 이관 길목에 걸려 있다 — 함수만 있고 안 부르면 아무것도 안 막는다', function () {
  const doT = stripComments('<script>' + cutFn(src, 'async function doTransfer(') + '</script>');
  assert.match(doT, /erpCoTransferGap\(/, '★ 막이를 부르지 않습니다');
  assert.match(doT, /if\(_go !== 'force'\) return;/, '★ 「그래도 넣기」가 아니면 멈춰야 합니다');
  const gapAt = doT.indexOf('erpCoTransferGap(');
  const runAt = doT.indexOf('transferContract(ct)');
  assert.ok(gapAt > 0 && runAt > 0 && gapAt < runAt, '★ 이관이 끝난 뒤에 묻고 있습니다');
});

test('⑰ 이관된 것이 «그 유형 탭»에서 보인다 (대표 지시 2026-09-07)', function () {
  const doT = stripComments('<script>' + cutFn(src, 'async function doTransfer(') + '</script>');
  assert.match(doT, /window\.__erpCoArrived\s*=\s*\{/, '★ 업체관리에 알려 주지 않습니다');
  /* 받는 쪽 — 깔때기를 «갈아 끼워야» 보인다. 기금이 걸린 화면에 자문이 오면 안 뜬다. */
  assert.match(bare, /var msg = window\.__erpCoArrived;/, '★ 업체관리가 그 쪽지를 안 읽습니다');
  const recv = bare.slice(bare.indexOf('var msg = window.__erpCoArrived;'));
  const body = recv.slice(0, recv.indexOf('}, []);'));
  assert.match(body, /setCoSel\(hit\.typeCode/, '★ 그 유형 탭으로 안 옮깁니다');
  assert.match(body, /setSortBy\(/, '★ 머리글 정렬이 걸려 있으면 맨 위로 안 옵니다');
  assert.match(body, /setQuery\(''\)/, '★ 검색어가 남아 있으면 가려집니다');
  assert.match(body, /setStatusTab\(/, '★ 사무대행·계약중단 탭에 있으면 활성 탭에서는 안 보입니다');
});

test('⑱ 오래된 쪽지는 안 본다 — 어제 이관한 것이 오늘 화면의 깔때기를 갈아 끼우면 놀란다', function () {
  const recv = bare.slice(bare.indexOf('var msg = window.__erpCoArrived;'));
  const body = recv.slice(0, recv.indexOf('}, []);'));
  assert.match(body, /Date\.now\(\) - \(msg\.at \|\| 0\) >/, '★ 쪽지에 유효기간이 없습니다');
  assert.match(body, /window\.__erpCoArrived = null;/, '★ 한 번 쓰고 버리지 않으면 열 때마다 걸립니다');
});
