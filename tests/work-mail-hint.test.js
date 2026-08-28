'use strict';
// 푸른 메일함에서 들어온 메일을 업무 옆에 붙인다 — node --test tests/work-mail-hint.test.js
//
// ⚠ 먼저 알아야 할 것 — 여기에는 «메일 본문이 없다».
//   푸른 메일의 수신함(paydata/maillog)은 사본이 아니라 「서버가 무엇을 보았나」는
//   기록이다. 한 줄에 보낸이·제목·미리보기 몇 줄·시각뿐이고 본문은 다음메일에 있다.
//   그래서 이 기능이 하는 일은 «요약»이 아니라 «있었다는 것을 알려 주기»다.
//
// 이 검사가 지키는 것
//   ① 남의 메일이 남의 업무에 붙지 않는다 (공용 도메인·한 글자 회사명)
//   ② 못 읽어도 화면이 멀쩡하다 (콘솔 규칙이 없으면 못 읽는다)
//   ③ 「요약」인 척하지 않는다 — 본문이 없다고 화면이 말한다
//   ④ 읽기만 한다
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const W = fs.readFileSync(path.join(__dirname, '..', 'work.html'), 'utf8').replace(/\r\n/g, '\n');
const CSS = W.slice(W.indexOf('<style>') + 7, W.indexOf('</style>'));

function grab(name){
  const i = W.indexOf('function ' + name + '(');
  assert.ok(i >= 0, '못 찾음: ' + name);
  let d = 0, j = i;
  for(;;j++){ if(W[j] === '{') d++; else if(W[j] === '}'){ d--; if(!d){ j++; break; } } }
  return W.slice(i, j);
}

function makeBox(opts){
  opts = opts || {};
  const box = {
    console, Date, String, Number, Array, Object, isNaN,
    mailSrc: opts.mail === undefined ? [] : opts.mail,
    _normCo: s => String(s || '').replace(/\(주\)|㈜|주식회사|\(유\)|유한회사|[\s·.,\-()]/g, '').toLowerCase(),
    esc: x => String(x == null ? '' : x).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])),
    hlp: k => '<span class="hlp" data-k="' + k + '">ⓘ</span>',
    // ⚠ 흉내라도 «그 업무의» 업체를 돌려줘야 한다 — 무엇을 물어도 같은 업체를 주면
    //   「남의 업무에 안 붙는다」를 검사할 수가 없다
    coFind: it => (opts.co && it && it.co_id === opts.co.id) ? opts.co : null,
    peRec: () => (opts.pe || null),
    _cList: o => (o && o.contacts) || []
  };
  box.window = box;
  vm.createContext(box);
  vm.runInContext(
    W.match(/var MAIL_PUBLIC=\{[^}]*\};/)[0] + '\n'
    + grab('_mailAddr') + '\n' + grab('_mailDom') + '\n' + grab('mailKeysOf') + '\n'
    + grab('mailFor') + '\n' + grab('_mailWhen') + '\n' + grab('dMailHTML') + '\n' + grab('mailFlag') + '\n'
    + 'this.keys=mailKeysOf; this.forIt=mailFor; this.flag=mailFlag; this.block=dMailHTML;', box);
  return box;
}

const 메일 = [
  { at:1756000000000, from:'kim@gana.co.kr',    subject:'자료 보냅니다',   preview:'요청하신 임금대장…', took:2 },
  { at:1755900000000, from:'㈜가나 <hr@gana.co.kr>', subject:'회신',      preview:'검토했습니다' },
  { at:1755800000000, from:'someone@naver.com', subject:'㈜가나전자 문의', preview:'안녕하세요' },
  { at:1755700000000, from:'other@dara.kr',     subject:'다라 건',        preview:'확인 바랍니다' },
  { at:1755600000000, from:'spam@naver.com',    subject:'광고',           preview:'특가' }
];

const 업무 = { company:'㈜가나', co_id:'co-1' };
const 업체 = { id:'co-1', name:'㈜가나', contacts:[{ name:'김', email:'kim@gana.co.kr' }] };

/* ══════════════════════════════════════
   ① 이어 붙는 기준
   ══════════════════════════════════════ */
test('보낸이 주소가 그 업체 담당자면 붙는다', () => {
  const b = makeBox({ mail:메일, co:업체 });
  const got = Array.from(b.forIt(업무)).map(m => m.subject);
  assert.ok(got.indexOf('자료 보냅니다') >= 0);
});

test('회사 도메인이 같으면 붙는다 — 담당자가 여럿이어도 놓치지 않는다', () => {
  const b = makeBox({ mail:메일, co:업체 });
  assert.ok(Array.from(b.forIt(업무)).some(m => m.subject === '회신'));
});

test('이름이 붙어 온 주소에서도 메일 주소만 읽어 낸다', () => {
  const b = makeBox({});
  assert.equal(b._mailAddr('㈜가나 <hr@gana.co.kr>'), 'hr@gana.co.kr');
  assert.equal(b._mailAddr('KIM@GANA.CO.KR'), 'kim@gana.co.kr');
  assert.equal(b._mailAddr(''), '');
  assert.equal(b._mailAddr(null), '');
});

test('제목에 회사 이름이 나오면 붙는다 — 표기가 달라도 같은 회사로 본다', () => {
  const b = makeBox({ mail:메일, co:업체 });
  // 「㈜가나전자 문의」 — 회사 이름 「가나」가 들어 있다
  assert.ok(Array.from(b.forIt(업무)).some(m => m.subject === '㈜가나전자 문의'));
});

/* ══════════════════════════════════════
   ② 남의 메일이 안 붙는다
   ══════════════════════════════════════ */
test('⚠ 공용 메일 도메인은 업체 표식이 못 된다 — naver.com 하나로 묶으면 남의 메일이 다 붙는다', () => {
  const b = makeBox({ mail:메일, co:{ id:'co-2', name:'다라', contacts:[{ email:'sales@naver.com' }] } });
  const k = b.keys({ company:'다라' });
  assert.equal(Object.keys(Array.from(Object.keys(k.doms))).length, 0, 'naver.com 이 도메인 표식에 들어갔다');
});

test('남의 회사 메일은 안 붙는다', () => {
  const b = makeBox({ mail:메일, co:업체 });
  assert.ok(!Array.from(b.forIt(업무)).some(m => m.subject === '다라 건'));
});

test('광고 메일은 안 붙는다 — 회사 이름도 도메인도 안 맞는다', () => {
  const b = makeBox({ mail:메일, co:업체 });
  assert.ok(!Array.from(b.forIt(업무)).some(m => m.subject === '광고'));
});

test('⚠ 한 글자 회사명으로는 이름을 안 맞춘다 — 아무 제목에나 걸린다', () => {
  const b = makeBox({ mail:[{ at:1, from:'x@zzz.com', subject:'가나다라마' }] });
  assert.equal(Array.from(b.forIt({ company:'가' })).length, 0);
});

test('회사 이름도 이메일도 없으면 아무것도 안 붙는다', () => {
  const b = makeBox({ mail:메일 });
  assert.equal(Array.from(b.forIt({ company:'' })).length, 0);
});

test('미리보기(preview)로는 안 맞춘다 — 본문 비슷한 것에 걸리면 남의 메일이 딸려 온다', () => {
  const b = makeBox({ mail:[{ at:1, from:'x@zzz.com', subject:'문의', preview:'㈜가나 관련해서요' }] });
  assert.equal(Array.from(b.forIt(업무)).length, 0);
});

/* ══════════════════════════════════════
   ③ 못 읽어도 멀쩡하다
   ══════════════════════════════════════ */
test('아직 안 읽었으면 블록을 아예 안 그린다 — 「없음」이라고 거짓말하지 않는다', () => {
  const b = makeBox({ mail:undefined });          // mailSrc = null 인 상태를 흉내
  b.mailSrc = null;
  assert.equal(b.block(업무), '');
});

test('못 읽었으면(규칙 없음) 빈 목록이 되고 화면은 그대로 돈다', () => {
  const b = makeBox({ mail:[] });
  assert.equal(b.block(업무), '');
  assert.equal(b.flag(업무), '');
});

test('읽는 곳이 실패를 삼킨다 — 콘솔 규칙이 없어도 앱이 안 멈춘다', () => {
  const L = grab('mailLoad');
  assert.match(L, /\.catch\(function\(\)\{ mailSrc=\[\];/);
});

test('메일이 없으면 목록 표식도 없다 — 빈 ✉ 를 달지 않는다', () => {
  assert.equal(makeBox({ mail:메일, co:업체 }).flag({ company:'없는회사' }), '');
});

/* ══════════════════════════════════════
   ④ 「요약」인 척하지 않는다
   ══════════════════════════════════════ */
test('블록 제목이 「요약」이 아니다 — 요약할 본문이 없다', () => {
  const h = makeBox({ mail:메일, co:업체 }).block(업무);
  assert.match(h, /이 업체에서 온 메일/);
  assert.ok(h.indexOf('요약') < 0);
});

test('ⓘ 에 본문이 없다는 것과 어디서 봐야 하는지를 적어 둔다', () => {
  const H = W.slice(W.indexOf('var HELP={'), W.indexOf('function hlp('));
  assert.match(H, /<b>여기에는 본문이 없습니다/);
  assert.match(H, /다음메일<\/b>에서 하십시오/);
  assert.match(H, /남의 메일이 섞일 수 있습니다/, '붙는 기준이 넉넉하다는 것도 말해 준다');
});

test('제목·보낸이·때가 함께 나온다 — 보낸이를 봐야 남의 메일인지 안다', () => {
  const h = makeBox({ mail:메일, co:업체 }).block(업무);
  assert.match(h, /자료 보냅니다/);
  assert.match(h, /kim@gana\.co\.kr/);
  assert.match(h, /class="s"/);
});

test('자료가 담긴 메일은 그렇게 표시한다', () => {
  assert.match(makeBox({ mail:메일, co:업체 }).block(업무), /자료 2건 담김/);
});

test('너무 많으면 여덟 줄만 — 나머지는 몇 건인지만', () => {
  const many = [];
  for(let i = 0; i < 12; i++) many.push({ at:i + 1, from:'a@gana.co.kr', subject:'메일' + i });
  const h = makeBox({ mail:many, co:업체 }).block(업무);
  assert.equal((h.match(/class="mlrow"/g) || []).length, 8);
  assert.match(h, /외 4건/);
});

/* ══════════════════════════════════════
   ⑤ 읽기만 한다 · 화면에 달려 있다
   ══════════════════════════════════════ */
test('메일함에 쓰지 않는다 — 답장·삭제·읽음은 다음메일이 진짜다', () => {
  const L = grab('mailLoad');
  ['set(', 'update(', 'remove(', 'push('].forEach(t =>
    assert.ok(L.indexOf(t) < 0, '쓰기(' + t + ')가 들어 있다'));
  assert.match(L, /\.once\('value'\)/);
});

test('한 번에 다 읽지 않는다 — 최근 것만 (트래픽·요금)', () => {
  assert.match(grab('mailLoad'), /limitToLast\(MAIL_MAX\)/);
  assert.match(W, /MAIL_MAX=300/);
});

test('내 업무와 팀 전체 두 곳에 표식이 붙는다', () => {
  assert.equal((W.match(/\+mailFlag\(it\)/g) || []).length, 2);
});

test('드로어에 블록이 붙는다', () => {
  assert.match(W, /h\+=dMailHTML\(it\);/);
});

test('업체 목록을 먼저 받고 읽는다 — 이름표가 없으면 이어 붙일 수가 없다', () => {
  assert.match(W, /coLoad\(\)\.then\(mailLoad\)/);
});

test('첫 화면을 붙잡지 않는다 — 다 읽은 뒤에 한 번 다시 그린다', () => {
  const i = W.indexOf('coLoad().then(mailLoad)');
  const 조각 = W.slice(i, i + 300);
  assert.match(조각, /if\(mailSrc&&mailSrc\.length\)\{ route\(\);/);
  assert.match(조각, /catch\(function\(\)\{\}\)/);
});

test('모양이 CSS에 있다', () => {
  ['.mlf{', '.mlrow{', '.mlrow .t{', '.mlrow .p{'].forEach(c =>
    assert.ok(CSS.indexOf(c) >= 0, c + ' 없음'));
});
