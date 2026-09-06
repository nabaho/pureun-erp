/* 🏢 업체 회사 칸 「📷 사진첩에서 찾기」 (대표 승인 목업 2026-09-06)
   docs/mockups/erp-company-pull.html

   ■ 왜 생겼나
   사진첩은 사업자등록증·중소기업확인서를 판독하면 스스로 업체관리에 밀어넣는다
   (js/pu-doc-file.js). 사업자번호로 맞추고 «빈 칸만» 채운다. 그런데도 셋이 막혔다:
     ① 업체에 사업자번호가 없으면 영영 안 붙는다  ② 이미 값이 있으면 안 바뀐다
     ③ 사람이 「지금」 당길 수가 없다
   기업정보함 쪽은 이미 길이 있었다(「📇 사업자등록증 찾기」·「📇 대표자 찾기」, 2026-08-10).
   그래서 이번에 만든 것은 «사진첩» 하나다.

   ■ 지키는 규칙
     ① 사업자번호가 열쇠다 — 번호가 있으면 이름이 같아도 안 붙인다
     ② 번호가 없으면 «찾아만» 주고, 고를 때 번호를 적을지 먼저 묻는다
     ③ 서류에 없는 칸은 안 건드린다 — 빈 값으로 덮으면 있던 값이 사라진다
     ④ 「같음」은 안 담고, 「다름」은 사람이 짚어야만 담는다
     ⑤ 계약서 찾기(자문계약 전용)를 안 건드린다
     ⑥ 기업정보함을 이 창에 또 넣지 않는다 — 같은 일에 길이 둘이면 한쪽만 고쳐진다
   실행: node --test tests/erp-company-photo-pull.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { cutFn } = require('./cut-fn.js');
const { stripComments } = require('./strip-comments.js');

const ROOT = path.join(__dirname, '..');
const 읽기 = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const RAW = 읽기('pu-erp.html');
const ERP = stripComments(RAW);

/* 진짜 판독 매핑(PuDocRead.mapTo)을 그대로 쓴다 — 가짜를 넣으면 이 검사가
   「서류의 어느 칸이 업체의 어느 칸이 되는가」를 하나도 안 지킨다. */
function 판() {
  /* ⚠ window 를 «따로» 만들면 안 된다 — 판독 층은 window 에 붙는데, 그러면
     ctx.window.PuDocRead 로 들어가 여기서 안 보인다(짜다가 실제로 그랬다). */
  const ctx = { console: { warn() {}, log() {} } };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(읽기('js/pu-doc-read.js'), ctx);
  /* erpCoPullShow·erpPhotoToCoFields 는 2026-09-06 에 붙었다 —
     계약서 사진도 이 창으로 읽으면서 «보이는 글자»와 «계약서 칸 옮김이»가 갈라졌다 */
  ['function erpCoBizKey(', 'function erpCoNameKey(', 'function erpCoBlank(',
   'function erpCoPullShow(', 'function erpVatTextToFlag(', 'function erpPhotoToCoFields(',
   'function erpCoPullRows(', 'function erpCoPullCandidates(', 'function erpCoPullApply(',
   'function erpFmtBizNo('].forEach(function (d) {
    vm.runInContext(cutFn(ERP, d), ctx);
  });
  vm.runInContext('var ERP_CO_PULL_LABEL = ' +
    /var ERP_CO_PULL_LABEL = \{[\s\S]*?\};/.exec(ERP)[0].replace('var ERP_CO_PULL_LABEL = ', ''), ctx);
  assert.ok(ctx.PuDocRead && ctx.PuDocRead.mapTo, '판독 매핑을 못 실었습니다');
  return ctx;
}

const 등록증 = (over) => Object.assign({
  id: 'p1', year: '2026', kind: 'bizreg', at: 2000,
  fields: { bizno: '128-81-39938', company: '맛찬들왕소금구이', ceo: '김도경',
    bizType: '도소매', bizItem: '식품', companyFax: '041-546-0192', address: '충남 천안시' }
}, over || {});

/* ── ① 사업자번호가 열쇠다 ── */
test('★★ 번호가 있으면 «번호로만» 맞춘다 — 이름이 같아도 다른 번호는 안 붙인다', () => {
  const c = 판();
  const docs = [등록증({ id: 'same', fields: Object.assign({}, 등록증().fields, { bizno: '111-11-11111' }) })];
  /* 이름은 똑같다. 그래도 번호가 다르면 남의 서류다 —
     「천성」과 「천성가축약품」이 붙던 그 사고를 여기서 막는다. */
  const got = c.erpCoPullCandidates(docs, { bizNo: '128-81-39938', name: '맛찬들왕소금구이' });
  assert.equal(got.length, 0, '★★ 번호가 다른 서류가 붙었습니다 — 남의 회사 값이 들어갑니다');
});

test('번호가 같으면 이름이 달라도 붙는다 — 상호는 바뀐다', () => {
  const c = 판();
  const got = c.erpCoPullCandidates([등록증()], { bizNo: '128-81-39938', name: '옛상호' });
  assert.equal(got.length, 1, '같은 번호인데 안 붙었습니다');
  assert.equal(got[0].needBizNo, '', '번호가 이미 있으면 다시 물을 것이 없습니다');
});

test('번호 꼴이 달라도 같은 번호로 본다 — 「128-81-39938」과 「1288139938」', () => {
  const c = 판();
  const got = c.erpCoPullCandidates([등록증()], { bizNo: '1288139938', name: '아무개' });
  assert.equal(got.length, 1, '줄표가 있고 없고로 갈렸습니다');
  /* 열 자리가 아니면 열쇠로 안 쓴다 — 전화번호가 섞인다 */
  assert.equal(c.erpCoBizKey('02-123-4567'), '');
  assert.equal(c.erpCoBizKey('128-81-39938'), '1288139938');
});

/* ── ② 번호가 없을 때 ── */
test('★ 번호가 없으면 이름으로 «찾아만» 주고, 적을지 먼저 묻게 표를 세운다', () => {
  const c = 판();
  const got = c.erpCoPullCandidates([등록증()], { bizNo: '', name: '㈜ 맛찬들왕소금구이' });
  assert.equal(got.length, 1, '이름으로도 못 찾았습니다 — ①번 구멍이 그대로입니다');
  assert.equal(got[0].needBizNo, '1288139938',
    '★ 번호를 적을지 물을 표가 없습니다 — 이름만으로 이어 붙이게 됩니다');
});

test('번호도 이름도 없으면 아무것도 안 붙인다 — 전부 붙는 사고를 막는다', () => {
  const c = 판();
  assert.equal(c.erpCoPullCandidates([등록증()], { bizNo: '', name: '' }).length, 0);
  assert.equal(c.erpCoPullCandidates([등록증()], {}).length, 0);
});

/* ── ③④ 무엇을 채우고 무엇을 안 건드리나 ── */
test('★★ 서류에 없는 칸은 «건드리지 않는다» — 빈 값으로 덮으면 있던 값이 사라진다', () => {
  const c = 판();
  const 얇은 = 등록증({ fields: { bizno: '128-81-39938', ceo: '김도경' } });
  const got = c.erpCoPullCandidates([얇은], { bizNo: '128-81-39938', address: '충남 천안시', phone: '041-546-0191' });
  const ks = got[0].rows.map(function (r) { return r.k; });
  assert.ok(ks.indexOf('address') < 0, '★★ 서류에 없는 주소를 빈 값으로 덮으려 합니다');
  assert.ok(ks.indexOf('phone') < 0, '★★ 서류에 없는 전화를 빈 값으로 덮으려 합니다');
});

test('★ 빈 칸 채움 / 지금 값과 같음 / 지금 값과 다름 을 갈라낸다', () => {
  const c = 판();
  const got = c.erpCoPullCandidates([등록증()], {
    bizNo: '128-81-39938',
    ceo: '김도경',          // 같음
    bizType: '제조',        // 다름
    bizCategory: ''         // 빈 칸
  });
  const by = {};
  got[0].rows.forEach(function (r) { by[r.k] = r; });
  assert.equal(by.ceo.state, 'same', '같은 값을 「채움」이라 합니다');
  assert.equal(by.bizType.state, 'diff', '다른 값을 못 가려냅니다');
  assert.equal(by.bizType.cur, '제조', '지금 값을 안 들고 옵니다 — 나란히 보여 줄 수가 없습니다');
  assert.equal(by.bizCategory.state, 'fill', '빈 칸을 못 가려냅니다');
});

test('★★ 「같음」은 안 담고, 「다름」은 짚어야만 담는다', () => {
  const c = 판();
  const cands = c.erpCoPullCandidates([등록증()], { bizNo: '128-81-39938', ceo: '김도경', bizType: '제조' });
  const id = cands[0].id;
  const pick = {}; pick[id] = true;

  const 안짚음 = c.erpCoPullApply(cands, pick, {});
  assert.equal(안짚음.patch.ceo, undefined, '★ 같은 값을 「채웠다」고 셉니다');
  assert.equal(안짚음.patch.bizType, undefined,
    '★★ 안 짚었는데 덮어썼습니다 — 한 번 눌러 값이 조용히 바뀝니다');
  assert.ok(안짚음.patch.bizCategory, '빈 칸은 채워야 합니다');

  const dp = {}; dp[id + '|bizType'] = true;
  const 짚음 = c.erpCoPullApply(cands, pick, dp);
  assert.equal(짚음.patch.bizType, '도소매', '짚었는데도 안 덮었습니다');
  assert.deepEqual(Array.prototype.slice.call(짚음.overwrote), ['업태'],
    '덮어쓴 것을 따로 세지 않으면 사람에게 알릴 수가 없습니다');
});

test('고르지 않은 후보는 아무것도 안 낸다', () => {
  const c = 판();
  const cands = c.erpCoPullCandidates([등록증()], { bizNo: '128-81-39938' });
  /* ⚠ vm 안에서 만든 객체라 deepEqual 은 «다른 세상»이라며 어긋난다 — 칸 수로 본다 */
  assert.equal(Object.keys(c.erpCoPullApply(cands, {}, {}).patch).length, 0, '안 골랐는데 채웁니다');
});

test('여러 장을 고르면 «앞엣것»이 이긴다 — 최근 판독이 앞이다', () => {
  const c = 판();
  const 옛것 = 등록증({ id: 'old', at: 1000, fields: Object.assign({}, 등록증().fields, { ceo: '옛대표' }) });
  const 새것 = 등록증({ id: 'new', at: 3000, fields: Object.assign({}, 등록증().fields, { ceo: '새대표' }) });
  const cands = c.erpCoPullCandidates([옛것, 새것], { bizNo: '128-81-39938' });
  assert.equal(cands[0].id, 'new', '최근 판독이 앞에 안 옵니다');
  const pick = { old: true, new: true };
  assert.equal(c.erpCoPullApply(cands, pick, {}).patch.ceo, '새대표', '옛 서류가 새 서류를 이겼습니다');
});

test('중소기업확인서는 규모·업종·만료일을 준다 — 등록증에 없는 칸이다', () => {
  const c = 판();
  const sme = { id: 's1', year: '2026', kind: 'sme', at: 500,
    fields: { bizno: '128-81-39938', company: '맛찬들', smeType: '소기업',
      industry: '음식점업', expiry: '2026-12-31' } };
  const got = c.erpCoPullCandidates([sme], { bizNo: '128-81-39938' });
  const by = {}; got[0].rows.forEach(function (r) { by[r.k] = r; });
  assert.equal(by.companySize.val, '소기업', '규모를 안 가져옵니다');
  assert.equal(by.industry.val, '음식점업', '업종을 안 가져옵니다');
  assert.ok(by.smeExpiry, '만료일이 없으면 만료된 확인서로 신청하게 됩니다');
});

test('채울 것이 하나도 없는 서류는 «목록에 안 띄운다»', () => {
  const c = 판();
  const got = c.erpCoPullCandidates([등록증()], {
    bizNo: '128-81-39938', name: '맛찬들왕소금구이', ceo: '김도경',
    bizType: '도소매', bizCategory: '식품', fax: '041-546-0192', address: '충남 천안시'
  });
  /* 전부 같은 값이면 골라 봐야 바뀌는 것이 없다 */
  const 쓸모 = got.filter(function (x) { return x.rows.some(function (r) { return r.state !== 'same'; }); });
  assert.equal(쓸모.length, 0, '바뀔 것이 없는데 고르라고 내밉니다');
  /* 겹치는 칸이 «하나도» 없는 서류는 아예 목록에서 뺀다 — 빈 줄을 고르라고 하면 안 된다 */
  const 빈것 = c.erpCoPullCandidates([등록증({ fields: { bizno: '128-81-39938' } })],
    { bizNo: '128-81-39938' });
  assert.equal(빈것.length, 0, '★ 채울 것이 하나도 없는 서류를 목록에 띄웁니다');
});

/* ── ⑤ 계약서 찾기를 안 건드렸나 ── */
test('★★★ 「계약서 찾기」는 여전히 자문계약만 모은다 — 별도 로더를 만든 까닭이다', () => {
  const ct = cutFn(ERP, 'function erpLoadMyContractPhotos(');
  assert.match(ct, /read\.kind === 'contract'/, '★★★ 자문계약 찾기의 갈래가 바뀌었습니다');
  assert.ok(ct.indexOf('bizreg') < 0 && ct.indexOf('sme') < 0,
    '★★★ 자문계약 찾기에 사업자등록증이 섞였습니다 — 그 목록이 못 쓰게 됩니다');

  const co = cutFn(ERP, 'function erpLoadCoDocPhotos(');
  assert.match(co, /'bizreg'/, '회사 서류 로더가 사업자등록증을 안 담습니다');
  assert.match(co, /'sme'/, '회사 서류 로더가 중소기업확인서를 안 담습니다');
  assert.ok(co.indexOf("=== 'contract'") < 0, '회사 서류 로더에 계약서가 섞였습니다');
  assert.match(co, /erpPhotoAdmin\(\)/, '관리자·직원 범위를 안 가립니다');
});

/* ── 한 번만 읽는가 — «글자»가 아니라 실제로 돌려서 센다 ──
   ⚠ 종전에는 _erpCoDocPhotos 라는 «글자»만 봤다. 앞을 막는 한 줄을 지워도 그 글자는
     남아 있어 검사가 통과했다(뮤테이션에서 확인). 창을 열 때마다 전 직원 사진을
     다시 훑으면 그것이 곧 요금이다. */
test('★ 두 번 불러도 사진첩을 «한 번만» 훑는다 — 다시 훑으면 그것이 요금이다', async () => {
  const ctx = { console: { warn() {}, log() {} }, fbAuthUid: 'u1' };
  ctx.window = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext('var _erpCoDocPhotos = null, _erpCoDocLoading = false, _erpCoDocWaiters = [];\n'
    + 'function erpPhotoAdmin(){ return false; }', ctx);
  vm.runInContext(cutFn(ERP, 'function erpLoadCoDocPhotos('), ctx);
  let 훑음 = 0;
  ctx.PuPhotoStore = {
    listYears: function () { return Promise.resolve(['2026']); },
    listYear: function () {
      훑음++;
      return Promise.resolve({
        a1: { read: { kind: 'bizreg', fields: { bizno: '128-81-39938' } }, __year: '2026', upAt: 1 },
        a2: { read: { kind: 'card', fields: {} }, __year: '2026' },          // 명함은 빠져야 한다
        /* ★ 2026-09-06 부터 계약서는 «담는다» (대표 지시).
           계약기간·월 자문료·부가세의 실제 출처가 여기다 — 업체 373곳 중 계약관리에
           계약서가 있는 곳은 29곳뿐이고 쓸 값이 있는 곳은 9곳이었다. */
        a3: { read: { kind: 'contract', fields: {} }, __year: '2026' },
        a4: { read: { kind: 'sme', error: '실패' }, __year: '2026' }          // 실패는 빠져야 한다
      });
    }
  };
  const 첫번 = await new Promise(function (ok) { ctx.erpLoadCoDocPhotos(ok); });
  assert.equal(첫번.length, 2, '회사 서류와 계약서를 담아야 합니다(명함·실패는 빼고)');
  /* ⚠ vm 안에서 만든 배열은 deepEqual 이 «구조는 같은데 다른 realm» 이라며 틀렸다고 한다 —
     이어 붙인 글자로 견준다 */
  assert.equal(Array.from(첫번, function (x) { return x.kind; }).sort().join(','), 'bizreg,contract');
  const 센것 = 훑음;
  const 두번 = await new Promise(function (ok) { ctx.erpLoadCoDocPhotos(ok); });
  assert.equal(두번.length, 2, '두 번째가 빈손으로 옵니다');
  assert.equal(훑음, 센것, '★ 두 번째에 사진첩을 또 훑었습니다 — 창을 열 때마다 요금이 나갑니다');
});

test('판독이 실패한 사진은 안 담는다 — 빈 값이 후보로 올라온다', () => {
  const co = cutFn(ERP, 'function erpLoadCoDocPhotos(');
  assert.match(co, /r\.error/, '실패한 판독을 걸러내지 않습니다');
  /* 사람이 고쳐 적은 값이 이긴다 — 사진첩·통장과 같은 규칙 */
  assert.match(co, /r\.fix/, '사람이 고친 값을 안 씁니다');
});

/* ── ⑥ 기업정보함을 또 넣지 않았나 · 기존 단추를 안 건드렸나 ── */
test('★ 기업정보함은 이 창에 «안» 넣는다 — 이미 제 단추가 둘 있다', () => {
  /* ⚠ 주석에도 같은 낱말이 있다 — 주석을 걷고, 단추에 «적힌 글자» 그대로 본다
     (안 그러면 단추를 없애도 설명 주석이 검사를 통과시킨다). */
  assert.match(ERP, /'📇 사업자등록증 찾기'/, '★ 기업정보함 사업자등록증 찾기가 사라졌습니다');
  assert.match(ERP, /'📇 대표자 찾기'/, '★ 기업정보함 대표자 찾기가 사라졌습니다');
  const fn = cutFn(ERP, 'function erpCoPullCandidates(');
  assert.ok(fn.indexOf('pucardsIdx') < 0,
    '★ 사진첩 창이 기업정보함까지 봅니다 — 같은 일에 길이 둘이면 한쪽만 고쳐집니다');
  assert.ok(cutFn(ERP, 'function CoPullModal(').indexOf('pucardsIdx') < 0,
    '★ 단추는 「사진첩」인데 기업정보함이 섞여 나옵니다');
});

test('★ 새 단추가 회사정보 제목 줄에 «셋째»로 붙는다', () => {
  /* ⚠ 「🏢 회사정보」는 계약 창에도 있다 — «업체 수정»의 그것을 집어야 한다.
     업체명 칸 바로 앞에 오는 것이 그것이다. */
  /* ⚠ 주석을 걷은 원본에서 본다 — 주석에 적힌 단추 이름이 검사를 통과시키면 안 된다 */
  const at = ERP.indexOf("'업체명 *'");
  assert.ok(at > 0, '업체 수정의 업체명 칸을 못 찾았습니다');
  const i = ERP.lastIndexOf('🏢 회사정보', at);
  assert.ok(i > 0, '회사정보 제목 줄을 못 찾았습니다');
  const seg = ERP.slice(i, at);
  assert.match(seg, /'📷 사진첩에서 찾기'/, '★ 새 단추가 그 줄에 없습니다');
  assert.ok(seg.indexOf("'📇 사업자등록증 찾기'") < seg.indexOf("'📷 사진첩에서 찾기'"),
    '쓰시던 단추 뒤에 붙어야 손에 익은 자리가 안 밀립니다');
  assert.match(seg, /setCoPhotoPick\(true\)/, '단추가 창을 안 엽니다');
});

/* ── 채우기만 하고 저장하지 않는다 ── */
test('★★ 채우기만 한다 — 저장은 여전히 「저장」 단추다', () => {
  const i = ERP.indexOf('coPhotoPick && h(CoPullModal');
  assert.ok(i > 0, '창을 그리는 자리를 못 찾았습니다');
  const seg = ERP.slice(i, i + 900);
  assert.match(seg, /setF\(/, '폼을 안 채웁니다');
  assert.ok(!/dbSet|saveCompany|\.update\(|\.set\(/.test(seg),
    '★★ 창에서 바로 저장합니다 — 「취소」를 눌러도 이미 바뀌어 있게 됩니다');
  assert.match(seg, /아직 저장 전입니다/, '저장 전이라는 것을 안 알려 줍니다');
});

test('★ 번호가 없던 업체는 «번호를 적는 것»부터 확인받는다', () => {
  const fn = cutFn(ERP, 'function CoPullModal(');
  const i = fn.indexOf('function doFill()');
  assert.ok(i > 0, '채우는 자리를 못 찾았습니다');
  const seg = fn.slice(i);
  assert.match(seg, /needBizNo/, '번호가 없던 경우를 안 가립니다');
  /* ⚠ 「confirm 이 있나」로는 부족하다 — if(false) 로 막아 두어도 글자는 남는다.
     «찾은 후보를 보고» 묻는지까지 못 박는다(뮤테이션에서 실제로 새어 나갔다). */
  assert.match(seg, /if\(need\)\{/, '★ 번호가 없던 후보를 보고 묻지 않습니다 — 그냥 지나칩니다');
  assert.match(seg, /confirm\(/, '★ 묻지 않고 번호를 적습니다 — 이름만으로 이어 붙는 것입니다');
  assert.ok(seg.indexOf('return') < seg.indexOf('props.onPick'),
    '★ 아니오를 눌러도 채웁니다');
});

test('사업자번호는 000-00-00000 꼴로 적는다', () => {
  const c = 판();
  assert.equal(c.erpFmtBizNo('1288139938'), '128-81-39938');
  assert.equal(c.erpFmtBizNo('128-81-39938'), '128-81-39938');
  assert.equal(c.erpFmtBizNo(''), '', '빈 값에 줄표를 지어내면 안 됩니다');
});

test('당겨오는 칸 목록에 «업체 수정에 없는 칸»을 넣지 않는다', () => {
  const c = 판();
  const ks = Object.keys(c.ERP_CO_PULL_LABEL);
  assert.ok(ks.length >= 10, '당겨올 칸이 너무 적습니다: ' + ks.length);
  /* 사진첩이 밀어넣을 때 쓰는 매핑과 «같은 이름»이라야 두 길이 같은 칸을 채운다 */
  const mapped = c.PuDocRead.mapTo('erp', 'bizreg', 등록증().fields);
  Object.keys(mapped).forEach(function (k) {
    assert.ok(ks.indexOf(k) >= 0,
      '판독은 「' + k + '」를 주는데 당겨오는 목록에 없습니다 — 조용히 버려집니다');
  });
});
