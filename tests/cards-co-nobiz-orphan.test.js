'use strict';
/* 기업 상세 — ① 사업자번호 없는 회사 ② 어느 회사에도 안 붙은 기업정보(고아)
   ═══════════════════════════════════════════════════════════════════════════
   대표 지시 2026-08-24 (보강 검토 2순위)

   ■ 무엇이 문제였나
     회사를 가르는 열쇠가 «사업자번호»다(coKeyOf). 번호가 없는 회사는 이름으로
     열쇠를 만든다('n'+이름). 그런데 사진첩이 보내는 곳은 언제나 coInfo/{사업자번호}다
     (js/pu-doc-file.js sendToCoInfo — bizKey 로만 연다).

     그래서 두 가지가 조용히 어긋났다:
       ① 번호 없는 회사는 사진첩이 보낸 정보를 «받을 수 없다»
       ② 그렇게 보낸 값은 어느 회사 줄에도 안 붙어 «아무 화면에도 안 보인다»(고아)
     coEffectiveExtra 가 옛 이름열쇠를 새 번호열쇠로 합쳐 주기는 하지만 방향이
     한쪽뿐이다 — 번호열쇠 회사가 이름열쇠 기록을 주워 가는 것뿐이라,
     번호가 «아예 없는» 회사에는 아무 도움이 안 된다.

   ■ 어떻게 고쳤나 — 둘 다 «보이게만» 한다
     ⚠ 자동으로 붙이지 않는다. 이름이 같다고 기계가 이어 붙이면 엉뚱한 회사에
       남의 대표자·소재지가 들어간다 — 되돌리기 어렵다. 사람이 보고 정할 일이다.
     ⚠ 새 쓰기가 없다. 이미 불러온 값으로 세고 그릴 뿐이다.

   ★ 여기서 못 박는 것
     ① 번호 없는 회사를 셀 수 있고, 그것만 골라 볼 수 있다
     ② 고아는 «어느 회사의 열쇠도 아니고, 어느 회사의 이름열쇠도 아닌» 것이다
     ③ 폴더·탭만 든 껍데기는 고아로 안 센다 — 잃은 정보가 없다
     ④ 고아가 0건이면 아무 것도 안 보여 준다
     ⑤ 고아 목록이 «무엇이 들었는지»와 원본 서류로 가는 길을 보여준다
     ⑥ 새 Firebase 쓰기가 없다
   실행: node --test tests/cards-co-nobiz-orphan.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'pu-cards.html'), 'utf8').replace(/\r\n/g, '\n');

function fnBody(name){
  let i = src.indexOf('\nfunction ' + name + '(');
  if (i < 0) i = src.indexOf('\nasync function ' + name + '(');
  assert.ok(i >= 0, name + ' 를 찾을 수 없습니다');
  const open = src.indexOf('{', i);
  let d = 0;
  for (let k = open; k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (!d) return src.slice(i, k + 1); }
  }
  assert.fail(name + ' 의 끝을 찾을 수 없습니다');
}
const esc = s => String(s ?? '').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const plain = v => JSON.parse(JSON.stringify(v));

const co = (key, o) => Object.assign({ key, name:'회사'+key, bizno:'', cards:[], docs:0, erp:null, extra:{} }, o||{});

/* 거르기 쪽 */
function loadFilter(state, cos){
  const ctx = { console, Object, Array, String, Number,
    state: Object.assign({ coFolder:'', coFTab:'', coTag:'', coQ:'', coColFilter:{},
                           coOnlyClosed:false, coOnlyNoBiz:false }, state||{}),
    coList: () => cos || [],
    coFTabsOf: () => [], coTagsOf: () => [],
    CO_SORT: { type: o => (o.erp && o.erp.type) || '' },
    coSorted: l => l };
  vm.createContext(ctx);
  vm.runInContext(fnBody('coFilteredList') + '\n' + fnBody('coVisible') + '\n'
    + fnBody('coNoBizCount'), ctx);
  return ctx;
}
/* 고아 쪽 */
function loadOrphan(coInfo, cos){
  const ctx = { console, Object, Array, String, Number, esc,
    _coInfo: coInfo || {},
    coList: () => cos || [],
    _norm: s => String(s||'').replace(/\s|\(주\)|주식회사|㈜/g,'').replace(/[.#$/[\]]/g,'').toLowerCase(),
    CO_FIELDS: [['ceo','대표자'],['address','소재지'],['companyTel','대표번호']],
    fmtDate: () => '2026.08.24' };
  vm.createContext(ctx);
  vm.runInContext(fnBody('coOrphanList'), ctx);
  return ctx;
}

const COS = [
  co('1234567890', { name:'가나상사', bizno:'123-45-67890' }),
  co('n광원전력',   { name:'광원전력' }),
  co('n대원산업',   { name:'대원산업' })
];

/* ══════ ① 번호 없는 회사 ══════ */

test('★ 번호 없는 회사를 센다', () => {
  assert.equal(loadFilter({}, COS).coNoBizCount(), 2);
});

test('★ 번호 없는 회사만 골라 볼 수 있다', () => {
  const C = loadFilter({ coOnlyNoBiz:true }, COS);
  assert.deepEqual(C.coVisible().map(o=>o.name), ['광원전력','대원산업']);
});

test('꺼져 있으면 전부 보인다', () => {
  assert.equal(loadFilter({ coOnlyNoBiz:false }, COS).coVisible().length, 3);
});

test('★ 폴더·검색과 «함께» 좁혀진다 — 덮어쓰지 않는다', () => {
  const cos = [ co('nA',{ name:'가', folder:'f1' }), co('nB',{ name:'나', folder:'f2' }),
                co('9999999999',{ name:'다', bizno:'999-99-99999', folder:'f1' }) ];
  const C = loadFilter({ coFolder:'f1', coOnlyNoBiz:true }, cos);
  assert.deepEqual(C.coVisible().map(o=>o.name), ['가']);
});

test('거르는 일은 coFilteredList 한 곳에만 둔다', () => {
  assert.match(fnBody('coFilteredList'), /coOnlyNoBiz/,
    '★ 딴 곳에서 거르면 화면마다 결과가 어긋난다');
});

/* ══════ ② · ③ 고아 가려내기 ══════ */

test('★ 어느 회사의 열쇠도 아닌 기업정보가 고아다', () => {
  const C = loadOrphan({
    '1234567890': { ceo:'홍길동' },              /* 가나상사 것 — 고아 아님 */
    '5555555555': { company:'광원전력', ceo:'김철수' }   /* 아무도 안 가짐 — 고아 */
  }, COS);
  const out = plain(C.coOrphanList());
  assert.deepEqual(out.map(o=>o.key), ['5555555555']);
});

test('★ 회사의 «이름열쇠» 기록은 고아가 아니다 — 그 회사가 주워 간다', () => {
  /* coEffectiveExtra 가 'n가나상사' 를 '1234567890' 회사에 합쳐 준다 */
  const C = loadOrphan({ 'n가나상사': { ceo:'홍길동' } }, COS);
  assert.deepEqual(plain(C.coOrphanList()), []);
});

test('★ 폴더·탭만 든 껍데기는 고아로 안 센다 — 잃은 정보가 없다', () => {
  const C = loadOrphan({
    '7777777777': { folder:'f1' },
    '8888888888': { tags:{ '어떤사업':true } },
    '6666666666': { folder:'f1', ceo:'진짜 값' }      /* 이건 정보가 있다 */
  }, COS);
  assert.deepEqual(plain(C.coOrphanList()).map(o=>o.key), ['6666666666']);
});

test('읽어 온 서류만 있어도 고아로 센다 — 그 서류를 못 찾게 된다', () => {
  const C = loadOrphan({
    '5555555555': { docs:{ '2026_p1': { name:'사업자등록증', id:'p1', year:'2026' } } }
  }, COS);
  assert.equal(plain(C.coOrphanList()).length, 1);
});

/* ══════ ④ 0건이면 조용하다 ══════ */

test('★ 고아가 없으면 빈 목록', () => {
  assert.deepEqual(plain(loadOrphan({ '1234567890': { ceo:'홍길동' } }, COS).coOrphanList()), []);
  assert.deepEqual(plain(loadOrphan({}, COS).coOrphanList()), []);
});

/* ⚠ 소스에 「length」 같은 글자가 있나로 보면 안 된다 — 0건 갈림길을 지워도 그 글자는
   그대로라 검사가 통과해 버린다(실제로 한 번 그렇게 놓쳤다). 실제로 돌려 본다. */
function bar(orphans){
  const ctx = { console, Object, Array, String, Number, esc,
    coOrphanList: () => orphans };
  vm.createContext(ctx);
  vm.runInContext(fnBody('coOrphanBarHtml'), ctx);
  return ctx.coOrphanBarHtml();
}

test('★ 0건이면 화면에 아무 것도 안 띄운다', () => {
  assert.equal(bar([]), '',
    '★ 0건인데도 띠가 늘 뜨면 무엇을 보라는 건지 모른다');
});

test('1건이라도 있으면 띠가 뜨고 몇 건인지 말한다', () => {
  const h = bar([{ key:'5555555555', name:'광원전력', fields:['ceo'], docs:0 }]);
  assert.ok(h.indexOf('1건') > 0, '몇 건인지 안 알려 준다: ' + h);
  assert.match(h, /coorphbar/, '띠가 안 뜬다');
  assert.match(h, /openCoOrphan\(\)/, '눌러서 볼 길이 없다');
});

/* ══════ ⑤ 무엇이 들었는지·어디서 왔는지 ══════ */

test('★ 고아마다 회사 이름과 «든 것»을 알려 준다', () => {
  const C = loadOrphan({
    '5555555555': { company:'광원전력', ceo:'김철수', address:'충남 천안' }
  }, COS);
  const o = plain(C.coOrphanList())[0];
  assert.equal(o.name, '광원전력', '이름이 없으면 어느 회사 것인지 모른다');
  assert.ok(o.fields.length >= 2, '무슨 값이 들었는지 안 알려 준다');
});

test('★ 이름이 같은 회사가 있으면 짚어 준다 — 사람이 이어 붙일 수 있게', () => {
  const C = loadOrphan({ '5555555555': { company:'광원전력', ceo:'김철수' } }, COS);
  const o = plain(C.coOrphanList())[0];
  assert.equal(o.sameName, '광원전력',
    '★ 이름이 같은 회사를 안 짚어 주면 어디에 붙일지 사람이 다시 찾아야 한다');
});

test('이름이 같은 회사가 없으면 안 짚는다 — 없는 것을 있다고 하면 안 된다', () => {
  const C = loadOrphan({ '5555555555': { company:'처음보는회사', ceo:'김철수' } }, COS);
  assert.equal(plain(C.coOrphanList())[0].sameName, '');
});

test('★ 고아 목록에서 원본 서류를 열 수 있다', () => {
  assert.match(fnBody('coOrphanHtml'), /openCoDoc\(/,
    '★ 원본으로 가는 길이 없으면 무슨 서류였는지 확인할 방법이 없다');
});

test('★ 자동으로 이어 붙이지 않는다 — 사람이 정할 일이다', () => {
  /* ⚠ 「.push(」 로 찾으면 «배열» push 까지 걸린다(out.push) — 실제로 한 번 걸렸다.
     서버로 가는 길은 언제나 db.ref / Store.db / firebase.database 를 지난다.
     그 자리를 짚어야 «진짜 쓰기»만 잡는다. */
  for (const n of ['coOrphanList', 'coOrphanHtml', 'coOrphanBarHtml']) {
    const fn = fnBody(n);
    assert.equal(/db\.ref\(|Store\.db|firebase\.database\(/.test(fn), false,
      '★ ' + n + ' 이 서버에 쓴다 — 이름이 같다고 기계가 붙이면 남의 값이 들어간다');
    assert.equal(/\bStore\.put\(|\bStore\.putGroup\(/.test(fn), false,
      '★ ' + n + ' 이 명함을 고친다 — 보여주기만 해야 한다');
  }
});

/* ══════ ⑥ 화면에 걸려 있나 ══════ */

test('「번호 없음」 토글이 옆줄 「할 일」에 있다', () => {
  /* ⚠ 2026-08-28 자리가 옮겨졌다 — 탭 줄은 「거래관계 여부」만 나눈다(대표 지시).
     기능은 그대로고 자리만 옆줄로 내렸다. */
  const fn = fnBody('coTodoSideHtml');
  assert.match(fn, /coOnlyNoBiz/, '고를 길이 없다');
  assert.match(fn, /coNoBizCount\(\)/, '개수를 안 보여 준다');
  assert.equal(fnBody('coToolsHtml').indexOf('coOnlyNoBiz'), -1,
    '★ 탭 줄에 도로 남아 있으면 두 곳에서 같은 일을 한다');
});

test('회사 목록 위에 고아 알림 띠가 걸려 있다', () => {
  assert.match(fnBody('coListHtml'), /coOrphanBarHtml\(\)/,
    '★ 만들어 놓고 아무 데서도 안 부르면 영영 안 보인다');
});
