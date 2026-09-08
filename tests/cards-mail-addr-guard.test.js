'use strict';
/* 잘린 메일 주소 잡기 · 보내는 주소 바꾸기 · 머리 고정
   ═══════════════════════════════════════════════════════════════════════════
   대표 화면 2026-08-24: 받는사람에 「cust03@hanmail.ne」 — 끝의 t 가 빠져 있었다.

   ■ 우리 코드가 자른 것이 «아니다»
     보내기 길(pickPerson·normEmail·grabCompose)에는 자르는 곳이 없다. 명함에 저장된
     주소 자체가 「hanmail.ne」였다 — 등록할 때 한 글자가 빠진 것이다.
     normEmail 은 끝마디가 두 글자 이상이면 통과시키므로(.ne 는 실제 있는 나라 주소다)
     형식 검사로는 못 걸렀다.

   ■ 그래서 «닮은 주소»를 잡는다
     끝마디가 잘 아는 끝마디의 «앞토막»이면 잘린 것으로 본다.
       hanmail.ne → hanmail.net · naver.co → naver.com · daum.or → daum.org
     ⚠ 막지 않고 «묻는다». .ne(니제르)·.co(콜롬비아)는 실제로 있는 주소다.
       막아 버리면 진짜 그 주소로 보내야 할 때 길이 끊긴다.

   ★ 여기서 못 박는 것
     ① 잘린 것으로 보이는 주소를 알아채고, 무엇이었을지 알려 준다
     ② 멀쩡한 주소는 «절대» 건드리지 않는다 (거짓 경고가 잦으면 아무도 안 읽는다)
     ③ 보내기 전에 묻는다 — 막지 않는다
   실행: node --test tests/cards-mail-addr-guard.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'pu-cards.html'), 'utf8').replace(/\r\n/g, '\n');

function fnBody(name){
  let i = src.indexOf('\nfunction ' + name + '(');
  /* ⚠ async 도 찾는다 — sendCompose 는 async 다(이걸 빼서 한 번 걸렸다) */
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
function load(){
  const ctx = { console, String, Array, Object };
  vm.createContext(ctx);
  const tld = src.match(/^const TLD_FULL = .*$/m);
  assert.ok(tld, 'TLD_FULL 을 찾을 수 없습니다');
  vm.runInContext(tld[0].replace(/^const /, 'var ') + '\n' +
    fnBody('normEmail') + '\n' +          /* suspectEmail 이 먼저 형식을 본다 */
    fnBody('suspectEmail') + '\n' + fnBody('suspectList'), ctx);
  return ctx;
}

/* ══════ ① 잘린 주소를 알아챈다 ══════ */

test('★ 대표가 겪은 그 주소를 잡는다', () => {
  const C = load();
  assert.equal(C.suspectEmail('cust03@hanmail.ne'), 'cust03@hanmail.net',
    '★ 이것을 못 잡으면 메일이 조용히 되돌아온다');
});

test('자주 쓰는 주소가 한 글자 빠진 것을 잡는다', () => {
  const C = load();
  const cases = [
    ['a@naver.co',   'a@naver.com'],
    ['a@daum.ne',    'a@daum.net'],
    ['a@gmail.co',   'a@gmail.com'],
    ['a@nate.co',    'a@nate.com'],
    ['a@hanmail.ne', 'a@hanmail.net'],
    ['a@pureun.or',  'a@pureun.org']
  ];
  for (const [bad, want] of cases) {
    assert.equal(C.suspectEmail(bad), want, bad + ' 를 못 잡았다');
  }
});

/* 끝마디가 한 글자만 남은 것(a@naver.c)은 여기서 안 잡는다 — normEmail 이 아예
   «주소 형식이 아니다»로 걸러 보내기가 막히므로, 조용히 되돌아올 일이 없다.
   여기서 잡아야 하는 것은 «형식은 맞는데 잘린» 것뿐이다. */
test('끝마디가 한 글자면 형식 검사가 먼저 막는다 — 여기서 볼 일이 아니다', () => {
  const C = load();
  assert.equal(C.suspectEmail('a@naver.c'), '', '형식 검사가 맡을 일을 여기서 흉내내면 안 된다');
});

test('두 글자가 빠진 것도 잡는다 (형식은 맞는 경우)', () => {
  const C = load();
  assert.equal(C.suspectEmail('a@x.in'), 'a@x.info');
});

/* ══════ ② 멀쩡한 주소는 안 건드린다 ══════ */

test('★ 멀쩡한 주소에는 아무 말도 하지 않는다', () => {
  const C = load();
  const fine = ['a@naver.com', 'a@daum.net', 'a@hanmail.net', 'a@gmail.com',
                'a@pureun.co.kr', 'a@moel.go.kr', 'a@nps.or.kr', 'a@snu.ac.kr',
                'a@company.kr', 'a@x.jp', 'a@x.org', 'a@x.info', 'a@x.biz',
                '370-6@daum.net', 'a.b+c@sub.domain.com'];
  for (const e of fine) {
    assert.equal(C.suspectEmail(e), '',
      '★ 멀쩡한 주소에 경고가 뜬다 — 거짓 경고가 잦으면 아무도 안 읽는다: ' + e);
  }
});

test('.co.kr · .ne.kr 같은 두 마디 주소를 건드리지 않는다', () => {
  const C = load();
  for (const e of ['a@x.co.kr', 'a@x.ne.kr', 'a@x.or.kr', 'a@x.re.kr', 'a@x.pe.kr']) {
    assert.equal(C.suspectEmail(e), '', e + ' 에 경고가 떴다');
  }
});

test('주소가 아니거나 비었으면 조용하다', () => {
  const C = load();
  for (const e of ['', null, 'abc', 'a@b', '@x.ne', 'a@']) {
    assert.equal(C.suspectEmail(e), '', JSON.stringify(e) + ' 에 경고가 떴다');
  }
});

test('이미 온전한 끝마디는 앞토막으로 보지 않는다', () => {
  const C = load();
  /* net 은 net 의 앞토막이지만 «같은 것»이다 — 같으면 경고할 것이 없다 */
  assert.equal(C.suspectEmail('a@x.net'), '');
  assert.equal(C.suspectEmail('a@x.com'), '');
});

/* ══════ 여러 명 한꺼번에 ══════ */

/* ⚠ vm 이 돌려준 것은 «다른 세계»의 객체다 — deepEqual 이 「모양은 같은데 같은 것이
   아니다」로 걸린다. JSON 으로 한 번 건너온다(이 저장소에서 여러 번 걸린 함정). */
const plain = v => JSON.parse(JSON.stringify(v));

test('받는사람 여러 명 중 수상한 것만 골라낸다', () => {
  const C = load();
  const out = plain(C.suspectList('a@naver.com, b@hanmail.ne; c@daum.net, d@gmail.co'));
  assert.deepEqual(out.map(o => o.bad), ['b@hanmail.ne', 'd@gmail.co']);
  assert.deepEqual(out.map(o => o.want), ['b@hanmail.net', 'd@gmail.com']);
});

test('수상한 것이 없으면 빈 목록', () => {
  assert.deepEqual(plain(load().suspectList('a@naver.com, b@daum.net')), []);
});

/* ══════ ③ 보내기 전에 «묻는다» — 막지 않는다 ══════ */

test('★ 보내기 전에 물어본다', () => {
  const fn = fnBody('sendCompose');
  assert.match(fn, /suspectList\(/, '★ 수상한 주소를 안 본다');
  const i = fn.indexOf('suspectList(');
  const after = fn.slice(i, i + 700);
  assert.match(after, /confirm\(/,
    '★ 묻지 않고 막으면 진짜 .ne·.co 주소로 못 보낸다');
});

test('물어보기가 «보내기 전»에 온다', () => {
  const fn = fnBody('sendCompose');
  const ask = fn.indexOf('suspectList(');
  const post = fn.indexOf('postAutoMail(');
  assert.ok(ask > 0 && post > ask, '★ 보낸 뒤에 물으면 늦다');
});

/* ══════ 보내는 주소 바꾸기 ══════ */

test('쓰기 화면에서 보내는 주소를 바꿀 수 있다', () => {
  const fn = fnBody('mailWriteHtml');
  assert.match(fn, /editMailFrom\(\)/,
    '★ 자료함 깊숙이 들어가야만 바꿀 수 있으면 아무도 못 찾는다');
});

test('보내는 주소는 대표만 바꾼다 — 전 직원이 함께 쓰는 값이다', () => {
  assert.match(fnBody('editMailFrom'), /isAdmin/,
    '★ 직원이 바꾸면 회사 전체 발송 주소가 흔들린다');
  assert.match(fnBody('editMailFrom'), /saveMailFrom\(/, '이미 있는 저장 길을 안 쓴다');
});

/* ══════ 머리 고정 ══════ */

test('★ 본문을 내려도 보내기·받는사람이 붙어 있다', () => {
  /* ⚠ 붙는 자리가 «.mtop 하나»이던 것을 2026-08-30 에 .cphead 한 덩이로 넓혔다
       (대표 지시 「여기 틀고정」) — 단추줄만 붙고 받는사람·제목은 밀려 올라갔기
       때문이다. 여기서 지키는 것은 «어느 선택자냐»가 아니라 「보내기와 받는사람이
       함께 붙어 있는가」다. 이름을 박아 두면 넓힐 때마다 멀쩡한 개선이 깨진다. */
  const css = src.match(/#pcMail \.cphead\{[^}]*\}/);
  assert.ok(css, '메일 쓰기 화면의 붙박이 규칙을 찾지 못했습니다');
  assert.match(css[0], /position:sticky/, '★ 안 붙이면 100줄을 올라와야 보내기를 누른다');
  assert.match(css[0], /top:\s*0/, '위에 붙어야 한다');
  assert.match(css[0], /z-index/, '★ 겹칠 때 위로 오지 않으면 글자에 가린다');
  assert.match(css[0], /background/, '★ 배경이 없으면 아래 글자가 비쳐 겹쳐 보인다');
  /* 그 덩이 «안»에 보내기와 받는사람이 둘 다 있어야 뜻이 있다 */
  const i = src.indexOf('<div class="cphead">');
  assert.ok(i > 0, '붙박이 덩이가 화면에 없습니다');
  const seg = src.slice(i, src.indexOf('class="edbar"', i));
  assert.ok(/>보내기</.test(seg), '보내기가 붙박이 덩이 밖에 있습니다');
  assert.ok(seg.indexOf('받는사람') > 0, '받는사람이 붙박이 덩이 밖에 있습니다');
});
