'use strict';
/* 검토에서 나온 두 가지 (2026-08-27)
   ═══════════════════════════════════════════════════════════════════════════
   ① 대표번호를 회사로 «안 올렸다» — 「정보부족」이 거짓말을 했다
     사업자등록증에서도 명함에서도 대표번호를 읽어 두고(BIZ_FIELDS·CARD_FIELDS 에
     companyTel 이 있다), 회사를 조립할 때(coListBuild) 그 칸만 안 가져왔다.
     그래서 coVal(o,'companyTel') 은 사진첩 서식이 준 값이 아니면 «언제나 빈칸»이었고,
     3순위 「📋 정보부족」이 거래처를 사실상 «전부» 「대표번호 없음」으로 셌다.
     재 봤다: 거래처 288곳 중 288곳. 채우러 들어가 보면 등록증에 번호가 이미 있다.
     ⚠ 왜 3순위 검사가 못 잡았나 — 검사가 회사 객체에 companyTel 을 «직접 박아» 넣고
       coMissing 만 시험했다. 판정은 맞았고 「진짜 회사가 그 값을 가질 수 있는가」를
       한 번도 안 봤다. 조각은 검사했고 «파이프»는 안 검사한 것이다.
       그래서 여기서는 coListBuild 를 «세워서» 확인한다.

   ② 옛 열쇠의 「값이 다른 칸」이 조용히 사라졌다
     coEffectiveExtra 는 tags·docs 는 하나씩 합치면서 conflicts(1순위)·src(4순위) 는
     통째로 덮었다. 양쪽에 다 있으면 «옛 열쇠 것이 전부» 날아간다.
     1순위의 존재 이유가 「어긋난 값을 조용히 버리지 않는다」인데, 바로 그 실패가
     이 합치기에서 되살아난 것이다.

   ★ 여기서 못 박는 것
     ① 등록증의 대표번호가 회사에 올라온다 (출처도 「사업자등록증」)
     ② 등록증에 없으면 명함의 «회사 대표번호»가 채운다 (출처는 「명함」)
     ③ 명함의 «개인» 전화·휴대폰은 대표번호가 «아니다» — 계약서에 개인번호가 나가면 안 된다
     ④ 등록증이 명함보다 앞선다
     ⑤ conflicts·src 도 tags·docs 처럼 «합쳐진다»
   실행: node --test tests/co-tel-and-merge.test.js */
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

/* ══════ ①〜④ 회사를 «세워서» 확인한다 ══════ */

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
/* 「정보부족」 판정도 진짜 것을 쓴다 — 회사에서 값이 올라오는지가 이 검사의 핵심이다 */
function loadMiss(){
  const ctx = { console, Object, Array, String,
    coTagsOf: o => Object.keys((o.extra && o.extra.tags) || {}) };
  vm.createContext(ctx);
  vm.runInContext(src.match(/^const CO_CORE = [\s\S]*?\];/m)[0].replace(/^const /, 'var ') + '\n'
    + fnBody('coVal') + '\n' + fnBody('coMissing') + '\n'
    + fnBody('coCares') + '\n' + fnBody('coLacks'), ctx);
  return ctx;
}
const BIZ = { kind:'biz', company:'가나테크', bizno:'134-86-05772', ceo:'나성환',
              address:'충남 천안시 서북구 1', companyTel:'041-556-0035' };

test('★ 등록증의 대표번호가 회사에 올라온다 — 이게 없어서 거래처가 죄다 「번호 없음」이었다', () => {
  const o = buildList([BIZ])[0];
  assert.equal(o.companyTel, '041-556-0035',
    '★ 등록증에 번호가 있는데 회사에 안 올라오면, 채우러 갔다가 헛걸음한다');
  assert.equal(o.srcOf.companyTel, '사업자등록증');
});

test('★ 등록증에서 온 회사는 이제 「정보부족」이 아니다', () => {
  const C = loadMiss();
  const o = buildList([BIZ], { type:'유지' })[0];
  assert.deepEqual(plain(C.coMissing(o)), [],
    '★ 대표자·소재지·대표번호가 다 등록증에 있는데도 부족으로 세면 그 단추는 거짓말이다');
  assert.equal(C.coLacks(o), false);
});

test('★ 등록증에 번호가 없으면 명함의 «회사 대표번호»가 채운다', () => {
  const items = [{ kind:'biz', company:'다라산업', bizno:'505-86-00987', ceo:'김철수' },
                 { kind:'card', company:'다라산업', bizno:'', name:'박대리',
                   companyTel:'02-777-1234' }];
  const o = buildList(items)[0];
  assert.equal(o.companyTel, '02-777-1234');
  assert.equal(o.srcOf.companyTel, '명함', '★ 어디서 온 번호인지 알아야 믿을지 정할 수 있다');
});

test('★ 명함의 «개인» 전화·휴대폰은 대표번호가 아니다 — 계약서에 개인번호가 나가면 안 된다', () => {
  const items = [{ kind:'card', company:'마바물산', bizno:'', name:'이과장',
                   mobile:'010-1111-2222', tel:'02-999-8888' }];
  const o = buildList(items)[0];
  assert.ok(!o.companyTel,
    '★ 직통전화·휴대폰을 회사 대표번호로 올리면 그 사람이 퇴사해도 계약서에 남는다');
});

test('★ 시각이 같으면 등록증이 명함보다 앞선다', () => {
  /* ⚠ 2026-08-31 규칙이 바뀌었다(대표 결정 「최근 이김」).
     이제 승부는 «올린 시각»으로 갈린다 — 갈래 차례는 끼지 않는다.
     시각이 «같거나 없을 때»만 먼저 온 것(등록증)이 남는다. 아래 두 검사가 새 규칙이다. */
  const items = [BIZ, { kind:'card', company:'가나테크', bizno:'134-86-05772',
                        name:'박대리', companyTel:'02-777-1234' }];
  assert.equal(buildList(items)[0].companyTel, '041-556-0035');
});

test('★★ 명함이 «더 최근»이면 등록증을 덮는다 (대표 결정 2026-08-31 「최근 이김」)', () => {
  const items = [
    Object.assign({}, BIZ, { createdAt: 1000 }),
    { kind:'card', company:'가나테크', bizno:'134-86-05772',
      name:'박대리', companyTel:'02-777-1234', createdAt: 2000 }
  ];
  assert.equal(buildList(items)[0].companyTel, '02-777-1234',
    '최근에 올린 명함의 회사 대표번호가 옛 등록증의 것을 덮어야 합니다');
});

test('★★ 등록증이 «더 최근»이면 명함이 못 덮는다 — 시각으로만 겨룬다', () => {
  const items = [
    Object.assign({}, BIZ, { createdAt: 3000 }),
    { kind:'card', company:'가나테크', bizno:'134-86-05772',
      name:'박대리', companyTel:'02-777-1234', createdAt: 1000 }
  ];
  assert.equal(buildList(items)[0].companyTel, '041-556-0035');
});

test('★★ 「최근 이김」이 «개인» 번호를 회사 칸으로 끌어오지는 않는다', () => {
  /* 대표께 짚은 걱정이 여기서 막힌다 — 명함이 회사로 올리는 것은 companyTel·companyFax 뿐이다 */
  const items = [
    Object.assign({}, BIZ, { createdAt: 1000 }),
    { kind:'card', company:'가나테크', bizno:'134-86-05772', name:'박대리',
      tel:'02-333-4444', mobile:'010-5555-6666', fax:'02-333-4445',
      email:'park@example.com', createdAt: 9000 }
  ];
  const o = buildList(items)[0];
  assert.equal(o.companyTel, '041-556-0035', '개인 직통이 대표번호를 덮으면 안 됩니다');
  assert.ok(!o.mobile && !o.email, '개인 휴대폰·이메일은 회사 값이 아닙니다');
});

test('번호가 아무 데도 없으면 그대로 「대표번호 없음」이다', () => {
  const C = loadMiss();
  const o = buildList([{ kind:'biz', company:'사아기업', bizno:'120-81-04455',
                         ceo:'홍길동', address:'서울' }], { type:'유지' })[0];
  assert.deepEqual(plain(C.coMissing(o)), ['대표번호'],
    '진짜 없는 곳까지 없다고 안 하면 이 단추를 만든 뜻이 없다');
});

/* ══════ ⑤ conflicts·src 도 합쳐진다 ══════ */

function loadMerge(){
  const normAt = src.indexOf('const _norm = s =>');
  const normEnd = src.indexOf('\n', normAt);
  const at = src.indexOf('function coEffectiveExtra');
  const end = src.indexOf('\nfunction coList', at);
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(src.slice(normAt, normEnd) + '\n' + src.slice(at, end), ctx);
  return ctx.coEffectiveExtra;
}

test('★ 옛 열쇠의 「값이 다른 칸」이 사라지지 않는다', () => {
  /* 1순위의 존재 이유가 「어긋난 값을 조용히 버리지 않는다」다.
     합치기에서 날려 버리면 바로 그 실패가 되살아난다. */
  const fn = loadMerge();
  const r = fn('1348605772', '가나테크', {
    'n가나테크':  { conflicts:{ ceo:{ got:'나성환', had:'김철수' } } },
    '1348605772': { conflicts:{ address:{ got:'충남', had:'서울' } } }
  });
  assert.deepEqual(Object.keys(plain(r.conflicts)).sort(), ['address','ceo'],
    '★ 옛 열쇠에 남아 있던 어긋남이 통째로 날아갔다 — 아무도 눈치 못 챈다');
});

test('★ 옛 열쇠의 출처(src)도 사라지지 않는다', () => {
  const fn = loadMerge();
  const r = fn('1348605772', '가나테크', {
    'n가나테크':  { src:{ sales:'2026_p1' } },
    '1348605772': { src:{ workers:'2026_p9' } }
  });
  assert.deepEqual(plain(r.src), { sales:'2026_p1', workers:'2026_p9' });
});

test('같은 칸이 양쪽에 있으면 새 열쇠가 이긴다 — tags·folder 와 같은 결', () => {
  const fn = loadMerge();
  const r = fn('1348605772', '가나테크', {
    'n가나테크':  { conflicts:{ ceo:{ had:'옛것' } }, src:{ sales:'옛서류' } },
    '1348605772': { conflicts:{ ceo:{ had:'새것' } }, src:{ sales:'새서류' } }
  });
  assert.equal(plain(r.conflicts).ceo.had, '새것');
  assert.equal(r.src.sales, '새서류');
});

test('한쪽에만 있으면 그것을 그대로 쓴다', () => {
  const fn = loadMerge();
  const r = fn('1348605772', '가나테크', {
    'n가나테크':  { conflicts:{ ceo:{ had:'옛것' } } },
    '1348605772': { docName:'사업자등록증' }
  });
  assert.equal(plain(r.conflicts).ceo.had, '옛것');
  assert.equal(r.docName, '사업자등록증', '새 열쇠 값도 그대로 있어야 한다');
});

test('둘 다 없어도 터지지 않는다', () => {
  const fn = loadMerge();
  const r = fn('1348605772', '가나테크', {
    'n가나테크': { folder:'f1' }, '1348605772': { folder:'f2' }
  });
  assert.deepEqual(plain(r.conflicts || {}), {});
  assert.deepEqual(plain(r.src || {}), {});
});
