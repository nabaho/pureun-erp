'use strict';
/* 기업 상세에서 주소록 내보내기 — 고른 회사들의 담당자만
   ═══════════════════════════════════════════════════════════════════════════
   대표 지시 2026-08-24: 「주소록 내보내기 만들어라」

   명함 목록에는 진작 있었다(선택 → ⋯ → 📇 주소록 내보내기). 없던 곳은 «기업 상세»다.
   그래서 「업체관리 183곳의 담당자만 뽑기」가 안 됐다 — 6,282장 전체 아니면 손으로
   골라야 했다.

   ■ 왜 새로 걸러내지 않고 mailTargets 를 쓰는가
     거르는 규칙이 네 가지다 — 잠긴 폴더 명함 제외 · 이메일 없음 · 수신거부 · 중복.
     이것을 여기서 또 쓰면 두 벌이 되고, 언젠가 한쪽만 고친다. 특히 «수신거부»를
     빠뜨리면 보내지 말라고 한 사람에게 다시 보내게 된다 — 되돌릴 수 없는 잘못이다.

   ★ 여기서 못 박는 것
     ① 고른 회사에 붙은 명함만 모은다 (안 고른 회사가 섞이면 안 된다)
     ② 거르는 일은 mailTargets 하나에만 맡긴다 (수신거부를 빠뜨리지 않는다)
     ③ 내려주는 파일 만드는 길이 명함 목록 것과 «같다» (두 벌로 안 만든다)
     ④ 고른 것이 없으면 아무 것도 안 한다
     ⑤ 파일 이름에 못 쓰는 글자가 들어가지 않는다
   실행: node --test tests/cards-co-mail-csv.test.js */
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
const plain = v => JSON.parse(JSON.stringify(v));

/* ══════ ① 고른 회사의 명함만 모은다 ══════ */

function pick(sel, cos){
  const ctx = { console, Object, Array, String,
    state: { coSel: sel },
    coVisible: () => cos };
  vm.createContext(ctx);
  vm.runInContext(fnBody('coSelCards'), ctx);
  return plain(ctx.coSelCards());
}
const COS = [
  { key:'k1', name:'가나상사', cards:[{id:'a',name:'홍길동',email:'a@x.com'},
                                     {id:'b',name:'김철수',email:'b@x.com'}] },
  { key:'k2', name:'다라산업', cards:[{id:'c',name:'이영희',email:'c@x.com'}] },
  { key:'k3', name:'마바기업', cards:[{id:'d',name:'박민수',email:'d@x.com'}] }
];

test('★ 고른 회사에 붙은 명함만 모은다', () => {
  const out = pick({ k1:1, k3:1 }, COS);
  assert.deepEqual(out.map(o=>o.id), ['a','b','d'],
    '★ 안 고른 회사(다라산업)의 명함이 섞였다');
});

test('하나도 안 골랐으면 빈 목록', () => {
  assert.deepEqual(pick({}, COS), []);
});

test('★ 화면에 «안 보이는» 회사는 고른 표시가 남아 있어도 안 넣는다', () => {
  /* 조건을 바꿔 목록이 줄었는데 옛 선택이 남아 있을 수 있다 — 그때 안 보이는 회사가
     섞이면 「내가 안 고른 사람」에게 메일이 간다. */
  const out = pick({ k1:1, k2:1 }, [COS[0]]);
  assert.deepEqual(out.map(o=>o.id), ['a','b'], '★ 화면에 없는 회사가 섞였다');
});

test('명함이 없는 회사를 골라도 터지지 않는다', () => {
  const out = pick({ k9:1 }, [{ key:'k9', name:'빈회사' }]);
  assert.deepEqual(out, []);
});

/* ══════ ② 거르는 일은 mailTargets 하나에만 ══════ */

test('★ 거르기를 새로 만들지 않고 mailTargets 를 쓴다', () => {
  const fn = fnBody('coMailCsv');
  assert.match(fn, /mailTargets\(/,
    '★ 거르는 규칙을 여기서 또 쓰면 두 벌이 된다');
  assert.match(fn, /state\.mailBlock/,
    '★ 수신거부 명단을 안 넘기면 보내지 말라고 한 사람에게 다시 나간다');
  /* 제 손으로 거르고 있지 않은지 — 이메일·수신거부를 직접 보면 안 된다 */
  assert.equal(/normEmail\(|noMail/.test(fn), false,
    '★ coMailCsv 가 스스로 걸러내고 있다 — mailTargets 에만 맡겨야 한다');
});

test('mailTargets 가 네 가지를 실제로 걸러낸다', () => {
  const ctx = { console, Object, Array, String,
    normEmail: v => /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(String(v||'').trim())
      ? String(v).trim().toLowerCase() : '',
    emailKey: e => String(e).replace(/\./g,'_'),
    inLockedGroup: it => !!(it && it.locked),
    /* 2026-08-29: 단체 메일이 퇴사한 거래처 담당자를 뺀다 — 이 검사는 그 부분을 안 본다 */
    ErpMatch: { leftOfCard: () => false } };
  vm.createContext(ctx);
  vm.runInContext(fnBody('mailTargets'), ctx);
  const r = plain(ctx.mailTargets([
    { name:'정상', email:'ok@x.com' },
    { name:'없음', email:'' },
    { name:'거부', email:'no@x.com', noMail:true },
    { name:'중복', email:'OK@x.com' },
    { name:'잠김', email:'lock@x.com', locked:true }
  ], {}));
  assert.equal(r.ok.length, 1, '통과한 것이 ' + r.ok.length + '개다');
  assert.equal(r.ok[0].email, 'ok@x.com');
  assert.equal(r.stat.noEmail, 1);
  assert.equal(r.stat.blocked, 1);
  assert.equal(r.stat.dup, 1);
});

/* ══════ ③ 내려주는 길이 하나다 ══════ */

test('★ 파일 내려주기를 명함 목록 것과 «같은 함수»로 한다', () => {
  for (const n of ['selMailCsv', 'coMailCsv']) {
    assert.match(fnBody(n), /downloadCsvFile\(/,
      '★ ' + n + ' 이 제 손으로 파일을 만든다 — 두 벌이면 한쪽만 고친다');
  }
});

test('명함 목록 쪽이 제 손으로 blob 을 만들지 않는다', () => {
  const fn = fnBody('selMailCsv');
  assert.equal(/new Blob\(/.test(fn), false, '옛 방식이 남아 있다');
  assert.equal(/createObjectURL/.test(fn), false, '옛 방식이 남아 있다');
});

test('한글이 안 깨지게 BOM 을 붙인다', () => {
  assert.match(fnBody('toCsv'), /\\uFEFF/,
    '★ BOM 이 없으면 엑셀·주소록이 한글을 깨뜨린다');
});

/* ══════ ④ 고른 것이 없으면 아무 것도 안 한다 ══════ */

test('★ 고른 것이 없으면 빈 파일을 내려주지 않는다', () => {
  const fn = fnBody('coMailCsv');
  const i = fn.indexOf('downloadCsvFile(');
  assert.ok(i > 0, '내려주는 자리가 없다');
  const before = fn.slice(0, i);
  assert.match(before, /return/,
    '★ 빈 채로도 파일이 내려가면 「주소록이 비었다」고 오해한다');
});

/* ══════ ⑤ 파일 이름 ══════ */

test('★ 파일 이름에 못 쓰는 글자가 안 들어간다', () => {
  const ctx = { console, String };
  vm.createContext(ctx);
  vm.runInContext(fnBody('safeFileName'), ctx);
  assert.equal(ctx.safeFileName('업체/관리:1*폴더?'), '업체_관리_1_폴더_');
  assert.equal(ctx.safeFileName('가나'), '가나');
  assert.equal(ctx.safeFileName(''), '');
  assert.equal(ctx.safeFileName(null), '');
});

test('파일 이름이 무엇을 뽑은 것인지 알려 준다', () => {
  const fn = fnBody('coMailCsv');
  assert.match(fn, /기업정보함/, '어디서 뽑은 것인지 이름에 없다');
  assert.match(fn, /safeFileName\(/, '폴더 이름을 안 다듬는다');
});

/* ══════ 단추가 걸려 있나 ══════ */

test('★ 고르기 도구줄에 「주소록 내보내기」가 있다', () => {
  const fn = fnBody('coListHtml');
  const bar = fn.indexOf('coselbar');
  assert.ok(bar > 0, '도구줄을 찾지 못했습니다');
  const end = fn.indexOf('</div></div>', bar);
  assert.ok(fn.slice(bar, end).indexOf('coMailCsv()') > 0,
    '★ 눌러서 뽑을 길이 없다');
});

test('몇 명이 뽑혔고 몇 명이 빠졌는지 알려 준다', () => {
  assert.match(fnBody('coMailCsv'), /_mailStatText\(/,
    '★ 숫자를 안 보여 주면 빠진 사람을 모른 채 「다 뽑았다」고 여긴다');
});
