'use strict';
/* 푸른이알피가 가진 회사 «전화·주소»를 기업 상세로 올린다 (대표 결정 2026-08-27)
   ═══════════════════════════════════════════════════════════════════════════
   ■ 왜 필요했나
     8/27 검토에서 「📋 정보부족」이 거래처를 사실상 전부 「대표번호 없음」으로 세는 것을
     찾아 고쳤다(등록증·명함에서 companyTel 을 올린다). 그런데 그것만으로는 모자라다 —
     «한국 사업자등록증에는 전화번호가 원래 잘 안 찍힌다». 상호·대표자·소재지·업태·
     종목·개업일이 전부인 경우가 많다. 그러면 명함이 있는 회사만 구제된다.

     그런데 답은 이미 우리 안에 있었다. 푸른이알피 업체 레코드에 phone(전화)·
     address(주소)가 들어 있다(pu-erp.html 의 COMPANY_FIELDS·CO_FIELD_LABEL —
     「담당자 연락처」(primaryContactPhone)와 «별개인 회사 대표번호»다).
     그런데 명함첩의 ErpMatch 는 그 레코드에서 담당 노무사·유형·대표자 «이름»만
     꺼내고 전화·주소는 안 꺼냈다 — 이미 내려받아 손에 쥔 자료를 안 읽고 있었다.

     ★ 그리고 「정보부족」은 원래 거래처만 센다(coCares). 즉 «세는 대상»과
       «ERP 가 답을 가진 대상»이 정확히 같다.

   ■ 비용
     0원. cos 는 이미 받아 둔 것이고(ErpMatch.companies), 여기서는 읽기만 한다.
     새 Firebase 읽기도 쓰기도 없다.

   ★ 여기서 못 박는 것
     ① ErpMatch 가 회사 전화·주소를 꺼내 둔다
     ② «담당자» 연락처(primaryContactPhone)를 회사 대표번호로 쓰지 «않는다»
     ③ 빈 칸만 채운다 — 등록증·명함이 먼저다 (이 저장소의 한결같은 규칙)
     ④ 출처가 「푸른이알피」로 남는다 (4순위)
     ⑤ ERP 에 없으면 그대로 없다 — 지어내지 않는다
     ⑥ 새 서버 읽기가 없다
   실행: node --test tests/co-erp-contact.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'pu-cards.html'), 'utf8').replace(/\r\n/g, '\n');

function fnBody(name){
  let i = src.indexOf('\nfunction ' + name + '(');
  assert.ok(i >= 0, name + ' 를 찾을 수 없습니다');
  const open = src.indexOf('{', i);
  let d = 0;
  for (let k = open; k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (!d) return src.slice(i, k + 1); }
  }
  assert.fail(name + ' 의 끝을 찾을 수 없습니다');
}
const plain = v => JSON.parse(JSON.stringify(v));

/* ══════ ①② ErpMatch 가 무엇을 꺼내는가 — «돌려서» 본다 ══════ */

function buildErp(cos){
  const a = src.indexOf('      const byBiz={}, byName={}');
  const b = src.indexOf('      ErpMatch.byBiz=byBiz;');
  assert.ok(a > 0 && b > a, 'ErpMatch 업체 훑는 자리를 찾지 못했습니다');
  const ctx = { console, Object, String, Number, Array,
    cos: cos,
    nameBySid: { s1:'권형하' },
    ErpMatch: { _norm: v => String(v || '').replace(/\s+/g, ''),
                _digits: v => String(v || '').replace(/\D/g, '') } };
  vm.createContext(ctx);
  vm.runInContext(src.slice(a, b) + '\nvar OUT = { byBiz:byBiz, byName:byName };', ctx);
  return ctx.OUT;
}
const CO = { name:'가나테크', bizNo:'134-86-05772', ceo:'나성환', typeCode:'자문',
             status:'active', managerMain:'s1',
             phone:'041-556-0035', address:'충남 천안시 서북구 1',
             primaryContactName:'박대리', primaryContactPhone:'010-9999-8888' };

test('★ 푸른이알피가 가진 회사 전화를 꺼내 둔다 — 이미 받아 둔 값을 안 읽고 있었다', () => {
  const r = buildErp([CO]).byBiz['1348605772'];
  assert.ok(r, '업체를 못 찾았다');
  assert.equal(r.phone, '041-556-0035');
});

test('★ 회사 주소도 함께 꺼낸다', () => {
  assert.equal(buildErp([CO]).byBiz['1348605772'].address, '충남 천안시 서북구 1');
});

test('★ «담당자» 연락처를 회사 대표번호로 쓰지 않는다 — 그 사람 휴대폰이다', () => {
  const noPhone = Object.assign({}, CO, { phone:'' });
  const r = buildErp([noPhone]).byBiz['1348605772'];
  assert.ok(!r.phone,
    '★ 담당자 휴대폰이 계약서의 회사 대표번호로 나가면 안 된다');
  assert.equal(r.contact, '박대리', '담당자 이름은 하던 대로 남아야 한다');
});

test('전화·주소가 없는 업체도 터지지 않는다', () => {
  const bare = { name:'다라산업', bizNo:'505-86-00987', ceo:'김철수', typeCode:'급여' };
  const r = buildErp([bare]).byBiz['5058600987'];
  assert.equal(r.phone, '');
  assert.equal(r.address, '');
});

test('하던 일이 그대로다 — 담당·유형·종료·대표자', () => {
  const r = buildErp([Object.assign({}, CO, { status:'terminated' })]).byBiz['1348605772'];
  assert.equal(r.main, '권형하');
  assert.equal(r.type, '자문');
  assert.equal(r.left, true);
  assert.equal(r.ceoRaw, '나성환');
});

/* ══════ ③④⑤ 회사로 올라오는가 — coListBuild 를 세워서 본다 ══════ */

function buildList(items, erp){
  const ctx = { console, Object, String, Number, Array,
    _coWatch: null, _coListMemo: null, _coInfo: {},
    allItems: () => items || [],
    digits: v => String(v || '').replace(/\D/g, ''),
    _norm: v => String(v || '').replace(/\s+/g, ''),
    coKeyOf: it => { const d = String(it.bizno || '').replace(/\D/g, '');
                     return d.length >= 10 ? d : ('n' + String(it.company || '').replace(/\s+/g, '')); },
    ErpMatch: { ready: true, match: () => erp || null,
      /* 2026-08-28: coListBuild 가 전체를 한 번에 맞춘다 — 대역도 같은 답을 준다 */
      matchAll: list => { const out = {}; (list||[]).forEach(o=>{ if(o && erp) out[o.key] = erp; }); return out; } },
    /* 2026-08-30: 예전에 판독한 등록증은 세금계산서 발급 메일이 «메모»에만 있다 —
       회사로 올릴 때 그것을 되살린다. 대역도 «진짜와 같은 답»을 준다.
       ⚠ 점(.)은 줄바꿈을 안 먹으므로 [^\n] 을 따로 쓰지 않는다. */
    taxInvoiceFromText: v => { const m = String(v == null ? '' : v)
      .match(/세금계산서.{0,60}?([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/); return m ? m[1] : ''; },
    coEffectiveExtra: () => null };
  vm.createContext(ctx);
  vm.runInContext(fnBody('coListBuild'), ctx);
  return ctx.coListBuild();
}
function loadMiss(){
  const ctx = { console, Object, Array, String,
    coTagsOf: o => Object.keys((o.extra && o.extra.tags) || {}) };
  vm.createContext(ctx);
  vm.runInContext(src.match(/^const CO_CORE = [\s\S]*?\];/m)[0].replace(/^const /, 'var ') + '\n'
    + fnBody('coVal') + '\n' + fnBody('coMissing') + '\n'
    + fnBody('coCares') + '\n' + fnBody('coLacks'), ctx);
  return ctx;
}
/* 전화가 «안 찍힌» 사업자등록증 — 한국에서 흔한 경우다 */
const BIZ_NO_TEL = { kind:'biz', company:'가나테크', bizno:'134-86-05772',
                     ceo:'나성환', address:'충남 천안시 서북구 1' };
const ERP = { type:'자문', ceoRaw:'나성환', phone:'041-556-0035',
              address:'충남 천안시 서북구 1', left:false };

test('★ 등록증에 전화가 없으면 푸른이알피가 채운다 — 이게 이 고침의 전부다', () => {
  const o = buildList([BIZ_NO_TEL], ERP)[0];
  assert.equal(o.companyTel, '041-556-0035');
  assert.equal(o.srcOf.companyTel, '푸른이알피', '★ 어디서 온 번호인지 알아야 믿을지 정한다');
});

test('★ 그래서 거래처가 「정보부족」에서 빠진다', () => {
  const C = loadMiss();
  const o = buildList([BIZ_NO_TEL], ERP)[0];
  assert.deepEqual(plain(C.coMissing(o)), [],
    '★ 푸른이알피에 번호가 있는데도 부족으로 세면, 채우러 갔다가 헛걸음한다');
  assert.equal(C.coLacks(o), false);
});

test('★ 등록증에 전화가 있으면 그것이 이긴다 — 빈 칸만 채우는 규칙 그대로', () => {
  const withTel = Object.assign({}, BIZ_NO_TEL, { companyTel:'041-000-0000' });
  const o = buildList([withTel], ERP)[0];
  assert.equal(o.companyTel, '041-000-0000');
  assert.equal(o.srcOf.companyTel, '사업자등록증');
});

test('★ 명함에 회사 대표번호가 있으면 그것이 푸른이알피보다 앞선다', () => {
  const items = [BIZ_NO_TEL, { kind:'card', company:'가나테크', bizno:'134-86-05772',
                               name:'박대리', companyTel:'02-777-1234' }];
  const o = buildList(items, ERP)[0];
  assert.equal(o.companyTel, '02-777-1234');
  assert.equal(o.srcOf.companyTel, '명함');
});

test('★ 주소도 같은 방식으로 채운다', () => {
  const noAddr = { kind:'biz', company:'마바물산', bizno:'120-81-04455', ceo:'홍길동' };
  const o = buildList([noAddr], ERP)[0];
  assert.equal(o.address, '충남 천안시 서북구 1');
  assert.equal(o.srcOf.address, '푸른이알피');
});

test('★ 등록증 주소를 «덮지 않는다» — 등록증이 법적 원본이다', () => {
  const o = buildList([BIZ_NO_TEL], Object.assign({}, ERP, { address:'서울 어딘가' }))[0];
  assert.equal(o.address, '충남 천안시 서북구 1');
  assert.equal(o.srcOf.address, '사업자등록증');
});

test('★ 푸른이알피에 없으면 그대로 없다 — 지어내지 않는다', () => {
  const C = loadMiss();
  const o = buildList([BIZ_NO_TEL], { type:'자문', ceoRaw:'나성환', left:false })[0];
  assert.ok(!o.companyTel);
  assert.deepEqual(plain(C.coMissing(o)), ['대표번호'],
    '진짜 없는 곳까지 없다고 안 하면 이 단추를 만든 뜻이 없다');
});

test('★ 값이 없으면 «출처도» 안 적는다 — 빈 칸에 「푸른이알피에서 왔다」고 하면 안 된다', () => {
  /* 4순위의 규칙 그대로다: 모르면 아무 말도 안 한다, 지어내지 않는다.
     지금은 화면에 안 드러나지만(값 없는 칸은 줄 자체가 안 그려진다), srcOf 를
     「어느 자료가 이 회사를 아는가」로 읽는 곳이 생기면 그 자리에서 거짓이 된다. */
  const o = buildList([BIZ_NO_TEL], Object.assign({}, ERP, { phone:'', address:'' }))[0];
  assert.equal(o.srcOf.companyTel, undefined,
    '★ 채우지도 않고 출처만 적으면, 없는 값이 푸른이알피에서 온 것처럼 남는다');
});

test('거래처가 아닌 회사는 푸른이알피 값이 아예 안 온다', () => {
  const o = buildList([BIZ_NO_TEL], null)[0];
  assert.ok(!o.companyTel);
  assert.equal(o.erp, null);
});

test('대표자 채우기는 하던 대로다 — 함께 고치다 망가지면 안 된다', () => {
  const noCeo = { kind:'biz', company:'사아기업', bizno:'120-81-04455' };
  const o = buildList([noCeo], ERP)[0];
  assert.equal(o.ceo, '나성환');
  assert.equal(o.srcOf.ceo, '푸른이알피');
});

/* ══════ ⑥ 새 서버 읽기가 없다 ══════ */

test('★ 서버를 더 읽지 않는다 — 이미 받아 둔 것을 읽기만 한다', () => {
  const fn = fnBody('coListBuild');
  assert.equal(/db\.ref\(|Store\.db|firebase\.database\(|once\(|\.update\(/.test(fn), false,
    '★ 전화 하나 얻으려고 서버를 또 읽으면 2026-08-16 요금 사고로 되돌아간다');
});
