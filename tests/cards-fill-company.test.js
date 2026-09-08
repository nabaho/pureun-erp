'use strict';
/* ══════ 회사가 빠진 명함을 «한꺼번에» 채운다 (대표 지시 2026-08-31) ══════
   서식에서 온 명함은 이제 만들 때부터 회사를 달고 온다(js/pu-doc-file.js 의
   findCoNameByBizNo — 상호를 못 읽어도 사업자번호로 찾는다).
   그러나 그 «전에» 회사 없이 쌓인 명함은 저절로 안 고쳐진다 — 회사가 없는 명함은
   기업 상세에서 어느 회사에도 안 붙어, 사람 따로 회사 따로 뜬다.

   ★ 여기서 못 박는 것
     ① 잣대는 «사업자번호» 하나다 — 이름으로는 맞추지 않는다
     ② 이미 적힌 회사는 건드리지 «않는다»
     ③ 등록증이 «먼저»다. 없으면 기업 상세에 적힌 이름으로 물러난다
     ④ 회사 칸은 «공유 검색목록»에도 든다 — 같은 통에 함께 적는다
     ⑤ 잠긴 폴더·개인 명함은 색인에 «안» 넣는다 — 감춘 것이 드러나면 안 된다
     ⑥ 모아서 한 번에 쓴다 — 한 장씩이면 2026-08-16 이 되풀이된다
     ⑦ 사업자등록증 자신은 «대상이 아니다»
   실행: node --test tests/cards-fill-company.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'pu-cards.html'), 'utf8').replace(/\r\n/g, '\n');

function fnBody(name){
  let i = SRC.indexOf('\nfunction ' + name + '(');
  if (i < 0) i = SRC.indexOf('\nasync function ' + name + '(');
  assert.ok(i >= 0, name + ' 를 찾지 못했다');
  const open = SRC.indexOf('{', i);
  let d = 0;
  for (let k = open; k < SRC.length; k++) {
    if (SRC[k] === '{') d++;
    else if (SRC[k] === '}') { d--; if (!d) return SRC.slice(i, k + 1); }
  }
  assert.fail(name + ' 의 끝을 찾지 못했다');
}
/* 진짜 함수를 실어 돌린다 — 서버·폴더만 대역이다 */
function load(items, info, opt){
  const o = opt || {};
  const ctx = { console, Object, String, Number, Array, Math, Date,
    digits: v => String(v == null ? '' : v).replace(/\D/g, ''),
    state: { items: items || {} },
    _coInfo: info || {},
    DB_ROOT: 'pucards',
    BULK_PATCH_CHUNK: o.chunk || 200,
    inLockedGroup: it => !!(it && it.__locked),
    Store: { _rootOf: id => (o.privateIds || []).indexOf(id) >= 0
      ? 'pucards_private/u1' : 'pucards' } };
  vm.createContext(ctx);
  ['cardFillCoIndex', 'cardFillCoPlan', 'cardFillCoWrites'].forEach(n =>
    vm.runInContext(fnBody(n), ctx));
  return ctx;
}
const 명함 = (x) => Object.assign({ id:'c1', kind:'card', name:'한재수', company:'' }, x || {});
const 등록증 = (x) => Object.assign({ id:'b1', kind:'biz', company:'가나비솔루션',
  bizno:'304-81-18380' }, x || {});

/* ── ①② 무엇을 고르나 ────────────────────────────────────────── */

test('★ 사업자번호가 같은 명함에 등록증의 상호를 붙인다', () => {
  const C = load({ b1: 등록증(), c1: 명함({ bizno:'304-81-18380' }) });
  const plan = C.cardFillCoPlan();
  assert.equal(plan.hits.length, 1, '★ 못 찾으면 그 사람은 계속 어느 회사에도 안 붙는다');
  assert.equal(plan.hits[0].name, '가나비솔루션');
  assert.equal(plan.hits[0].it.id, 'c1');
});

test('★ 이미 회사가 적힌 명함은 «건드리지 않는다»', () => {
  const C = load({ b1: 등록증(), c1: 명함({ bizno:'304-81-18380', company:'손으로 적은 회사' }) });
  assert.equal(C.cardFillCoPlan().hits.length, 0,
    '★ 사람이 넣어 둔 이름을 덮으면 되돌릴 수가 없다');
});

test('빈칸처럼 «공백만» 든 것도 빈 것으로 본다', () => {
  const C = load({ b1: 등록증(), c1: 명함({ bizno:'304-81-18380', company:'   ' }) });
  assert.equal(C.cardFillCoPlan().hits.length, 1);
});

test('★ 사업자번호가 없으면 «따로 세어» 알린다 — 이름으로 맞추지 않는다', () => {
  /* 2026-08-28 에 「주식회사 행복한단홍갈비」와 「행복한 단홍갈비」가 섞인 그 사고다 */
  const C = load({ b1: 등록증(), c1: 명함({ bizno:'' }) });
  const plan = C.cardFillCoPlan();
  assert.equal(plan.hits.length, 0, '★ 번호 없이 붙이면 남의 회사에 붙는다');
  assert.equal(plan.unknown.length, 1, '★ 몇 장이 남았는지 말해야 사람이 채울 수 있다');
});

test('그 번호를 가진 회사를 «모르면» 안 붙인다 — 지어내지 않는다', () => {
  const C = load({ c1: 명함({ bizno:'999-99-99999' }) });
  assert.equal(C.cardFillCoPlan().hits.length, 0);
});

test('★ 사업자등록증 자신은 대상이 «아니다»', () => {
  /* 상호를 못 읽은 등록증은 따로 다룬다(「상호 못 읽음」) — 여기서 손대면 안 된다 */
  /* ⚠ deepEqual 은 안 쓴다 — vm 안에서 만든 배열은 «다른 세상»의 Array 라
     같은 내용인데도 어긋난다고 한다(2026-08-31 에 실제로 걸렸다). 길이로 본다. */
  const C = load({ b1: 등록증(), b2: 등록증({ id:'b2', company:'', bizno:'304-81-18380' }) });
  const plan = C.cardFillCoPlan();
  assert.equal(plan.hits.length, 0, '★ 등록증에 회사 이름을 덮어썼다');
  assert.equal(plan.unknown.length, 0, '★ 등록증을 「번호 없는 명함」으로 세었다');
});

/* ── ③ 등록증이 먼저다 ───────────────────────────────────────── */

test('★ 등록증이 «먼저»다 — 법적 원본이다', () => {
  const C = load({ b1: 등록증(), c1: 명함({ bizno:'304-81-18380' }) },
    { '3048118380': { company:'서식이 적은 이름' } });
  assert.equal(C.cardFillCoPlan().hits[0].name, '가나비솔루션');
});

test('등록증이 없으면 «기업 상세»에 적힌 이름으로 물러난다', () => {
  const C = load({ c1: 명함({ bizno:'304-81-18380' }) },
    { '3048118380': { company:'가나비솔루션' } });
  assert.equal(C.cardFillCoPlan().hits[0].name, '가나비솔루션');
});

test('상호가 빈 등록증은 «이름 표»에 안 든다', () => {
  const C = load({ b1: 등록증({ company:'' }), c1: 명함({ bizno:'304-81-18380' }) },
    { '3048118380': { company:'기업 상세 이름' } });
  assert.equal(C.cardFillCoPlan().hits[0].name, '기업 상세 이름',
    '★ 빈 이름을 붙이면 고친 것이 아무것도 없다');
});

/* ── ④⑤ 쓰는 자리 ───────────────────────────────────────────── */

test('★ 회사 칸과 «공유 검색목록»을 같은 통에 적는다', () => {
  /* 명함만 고치면 이 색인을 읽는 푸른이알피·업무관리 검색이 옛 값을 보여 준다 */
  const C = load({ b1: 등록증(), c1: 명함({ bizno:'304-81-18380' }) });
  const w = C.cardFillCoWrites(C.cardFillCoPlan().hits, 200);
  assert.equal(w.length, 1, '한 통이어야 한다');
  assert.equal(w[0]['pucards/items/c1/company'], '가나비솔루션');
  assert.equal(w[0]['pucards/idx/c1/c'], '가나비솔루션',
    '★ 색인을 안 고치면 다른 앱 검색이 옛 이름을 그대로 보여 준다');
  assert.ok(w[0]['pucards/items/c1/updatedAt'] > 0, '고친 때를 남겨야 한다');
});

test('★ 잠긴 폴더의 명함은 색인에 «안» 넣는다 — 감춘 것이 드러난다', () => {
  const C = load({ b1: 등록증(), c1: 명함({ bizno:'304-81-18380', __locked:1 }) });
  const w = C.cardFillCoWrites(C.cardFillCoPlan().hits, 200);
  assert.equal(w[0]['pucards/items/c1/company'], '가나비솔루션', '명함은 고친다');
  assert.equal(w[0]['pucards/idx/c1/c'], undefined,
    '★ 잠가 둔 명함의 회사가 공유 검색에 새어 나간다');
});

test('★ 「🔒 개인」 명함도 색인에 «안» 넣는다', () => {
  const C = load({ b1: 등록증(), c1: 명함({ bizno:'304-81-18380', scope:'private' }) });
  const w = C.cardFillCoWrites(C.cardFillCoPlan().hits, 200);
  assert.equal(w[0]['pucards/idx/c1/c'], undefined);
});

test('개인 창고에 있는 명함은 «그 창고»에 쓴다 — 공용 자리에 쓰면 안 된다', () => {
  const C = load({ b1: 등록증(), c1: 명함({ bizno:'304-81-18380' }) },
    null, { privateIds:['c1'] });
  const w = C.cardFillCoWrites(C.cardFillCoPlan().hits, 200);
  assert.equal(w[0]['pucards_private/u1/items/c1/company'], '가나비솔루션');
  assert.equal(w[0]['pucards/idx/c1/c'], undefined,
    '★ 개인 창고 명함을 공유 색인에 올렸다');
});

/* ── ⑥ 모아서 한 번에 ───────────────────────────────────────── */

test('★ 모아서 한 번에 쓴다 — 한 장씩이면 2026-08-16 이 되풀이된다', () => {
  const items = { b1: 등록증() };
  for (let i = 0; i < 5; i++) items['c' + i] = 명함({ id:'c' + i, bizno:'304-81-18380' });
  const C = load(items);
  const hits = C.cardFillCoPlan().hits;
  assert.equal(hits.length, 5);
  assert.equal(C.cardFillCoWrites(hits, 200).length, 1, '★ 다섯 장을 다섯 번 쓰면 안 된다');
  assert.equal(C.cardFillCoWrites(hits, 2).length, 3, '통이 크면 서버가 통째로 되돌려 보낸다');
});

test('고칠 것이 없으면 빈 통도 안 만든다', () => {
  const C = load({ b1: 등록증() });
  assert.equal(C.cardFillCoWrites([], 200).length, 0);
});

/* ── 켤 길이 있다 ───────────────────────────────────────────── */

test('★ 누를 자리가 «PC·폰 둘 다»에 있다 — 만들어 놓고 켤 길이 없으면 안 된다', () => {
  /* 2026-08-30 에 켤 길 없는 기능을 통째로 걷어낸 일이 있다. 되풀이하지 않는다. */
  assert.equal(SRC.split('openCardFillCo()').length - 1, 3,
    '★ 부르는 자리가 PC 설정·폰 메뉴 둘이어야 한다(함수 선언 하나 + 단추 둘)');
});

/* 「묻는다」는 «돌려 봐야» 안다. 글자로 confirm( 만 찾으면 `if(false && confirm(...))`
   같은 고장이 그냥 통과한다 — 이 저장소에서 하루에 두 번 밟은 함정이다. */
async function runTool(answer){
  const items = { b1: 등록증(), c1: 명함({ bizno:'304-81-18380' }) };
  const asked = [];
  const wrote = [];
  const ctx = { console, Object, String, Number, Array, Math, Date, Promise,
    digits: v => String(v == null ? '' : v).replace(/\D/g, ''),
    state: { items: items },
    _coInfo: {},
    DB_ROOT: 'pucards',
    BULK_PATCH_CHUNK: 200,
    inLockedGroup: () => false,
    confirm: (q) => { asked.push(q); return answer; },
    toast: () => {},
    render: () => {},
    coListBust: () => {},
    Store: { mode:'firebase', _rootOf: () => 'pucards',
      db: { ref: () => ({ update: (u) => { wrote.push(u); return Promise.resolve(); } }) } } };
  vm.createContext(ctx);
  ['cardFillCoIndex', 'cardFillCoPlan', 'cardFillCoWrites', 'openCardFillCo'].forEach(n =>
    vm.runInContext(fnBody(n), ctx));
  await vm.runInContext('openCardFillCo()', ctx);
  return { asked, wrote, items };
}

test('★ 「아니오」를 누르면 «아무것도 안 쓴다»', async () => {
  const r = await runTool(false);
  assert.equal(r.asked.length, 1, '★ 묻지도 않고 쓴다 — 모르고 눌리면 되돌리기 어렵다');
  assert.equal(r.wrote.length, 0, '★ 아니오라고 했는데 썼다');
  assert.equal(r.items.c1.company, '', '★ 화면 값까지 바꿔 놓았다');
});

test('★ 「예」를 누르면 «모아서 한 번» 쓰고 화면 값도 맞춘다', async () => {
  const r = await runTool(true);
  assert.equal(r.wrote.length, 1, '★ 한 장씩 쓰면 2026-08-16 이 되풀이된다');
  assert.equal(r.wrote[0]['pucards/items/c1/company'], '가나비솔루션');
  assert.equal(r.items.c1.company, '가나비솔루션',
    '★ 서버만 고치고 화면을 안 고치면 새로고침 전까지 빈 채로 보인다');
});

test('★ 물어볼 때 «무엇이 어디에 붙는지» 보여 준다 — 모르고 누르면 안 된다', async () => {
  const q = (await runTool(false)).asked[0];
  assert.ok(q.indexOf('한재수') > 0 && q.indexOf('가나비솔루션') > 0,
    '★ 어느 명함이 어느 회사에 붙는지 안 보여 준다: ' + q);
  assert.ok(q.indexOf('이미 적힌 회사는 건드리지 않습니다') > 0, '무엇을 안 건드리는지 말해야 한다');
});

test('★ 색인을 안 건드리는 길(bulkPatchFlush)로 쓰지 않는다', () => {
  /* 회사 칸은 공유 검색목록(idxRecord 의 c)에 드는 칸이다 — 그 길은 색인을 일부러
     안 건드린다고 못 박혀 있다. 쓰면 다른 앱 검색이 옛 이름을 그대로 보여 준다. */
  assert.equal(/bulkPatchFlush/.test(fnBody('openCardFillCo')), false,
    '★ 색인을 안 건드리는 길로 썼다 — 회사 칸은 색인에 드는 칸이다');
});
