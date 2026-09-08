/* 기업정보함 — 목록 골라 한 번에(넘버링 + ☐) · 보낸 사람 이름.
   실행: node --test tests/*.test.js

   대표 지시 2026-08-10:
     "보낸사람은 이름으로 나와야 되고"
     "푸른기업정보함에 생성되는 서류들은 모두 넘버링 넣고 ㅁ 로 체크해서 삭제 이동등"

   가장 무서운 것은 **안 보이는 것이 딸려 와 함께 지워지는 일**이다. 고른 뒤 찾기말을
   바꾸거나 남이 지우면, 목록에 없는 번호가 골라 둔 채로 남는다. 그 상태로 「3개
   지우기」를 누르면 화면에 없던 자료가 함께 사라지고 아무도 왜 없어졌는지 모른다.
   그래서 손대기 전에 **지금 보이는 것만** 남기는 것을 여기서 못 박는다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'pu-cards.html'), 'utf8');

function load(){
  const a = '/* ══════ 보낸 사람 이름 — 순수 로직 (테스트 대상) ══════';
  const b = '/* ══════ 목록 골라 한 번에 — 화면 ══════ */';
  const i = src.indexOf(a), j = src.indexOf(b);
  assert.ok(i >= 0, '시작 표식 못찾음');
  assert.ok(j > i, '끝 표식 못찾음');
  const ctx = { console, Object, Array, String, Number, JSON, Set };
  ctx.ErpMatch = { nameByEmail: {} };
  vm.createContext(ctx);
  vm.runInContext(src.slice(i, j), ctx);
  return ctx;
}

const same = (a, b, msg) => assert.deepEqual(JSON.parse(JSON.stringify(a)), b, msg);

/* ══════ 보낸 사람 이름 ══════ */

test('명부에 있으면 이름으로 보여준다', () => {
  const C = load();
  const dir = { 'p001@pureun.kr': '권형하', 'a005@pureun.kr': '박은비' };
  assert.equal(C.staffNameOf(dir, 'p001@pureun.kr'), '권형하');
  assert.equal(C.staffNameOf(dir, 'a005@pureun.kr'), '박은비');
});

test('대소문자·앞뒤 공백이 달라도 찾는다', () => {
  /* 계정을 손으로 적어 넣은 기록이 있어 대문자가 섞인다. */
  const C = load();
  assert.equal(C.staffNameOf({ 'p001@pureun.kr':'권형하' }, '  P001@Pureun.KR '), '권형하');
});

test('명부에 없으면 계정 앞부분이라도 보여준다 — 빈칸이 더 나쁘다', () => {
  /* 「누가 보냈는지 모르는 메일」이 되면 기록의 뜻이 없다. */
  const C = load();
  assert.equal(C.staffNameOf({}, 'p009@pureun.kr'), 'p009');
  assert.equal(C.staffNameOf(null, 'x@y.kr'), 'x');
});

test('보낸 사람이 아예 없으면 빈 글자', () => {
  const C = load();
  assert.equal(C.staffNameOf({}, ''), '');
  assert.equal(C.staffNameOf({}, null), '');
});

/* ══════ 골라서 한 번에 ══════ */

test('☐ 를 누르면 켜지고 다시 누르면 꺼진다', () => {
  const C = load();
  let sel = {};
  sel = C.pickToggle(sel, 'a');
  assert.equal(C.pickOn(sel, 'a'), true);
  sel = C.pickToggle(sel, 'a');
  assert.equal(C.pickOn(sel, 'a'), false);
});

test('원래 것을 바꾸지 않고 새로 만들어 돌려준다', () => {
  /* 화면이 다시 그려지기 전에 원본이 바뀌면 무엇이 켜져 있었는지 견줄 수 없다. */
  const C = load();
  const before = {};
  const after = C.pickToggle(before, 'a');
  same(before, {}, '원래 것이 바뀌었습니다');
  same(after, { a: true });
});

test('모두 고르기는 보이는 것만 켠다', () => {
  const C = load();
  const sel = C.pickSetAll({}, ['a','b'], true);
  same(sel, { a:true, b:true });
  assert.equal(C.pickOn(sel, 'c'), false, '안 보이는 것까지 켜면 안 됩니다');
});

test('모두 고르기를 다시 누르면 보이는 것만 끈다', () => {
  /* 걸러 놓은 것만 끄고, 다른 갈래에서 골라 둔 것은 남겨야 한다. */
  const C = load();
  const sel = C.pickSetAll({ a:true, b:true, z:true }, ['a','b'], false);
  same(sel, { z: true });
});

test('★ 손댈 것은 지금 보이는 것뿐이다 — 안 보이는 것은 안 지운다', () => {
  /* 고른 뒤 찾기말을 바꾸거나 남이 지우면 목록에 없는 번호가 남는다.
     그것까지 지우면 화면에 없던 자료가 조용히 사라진다. */
  const C = load();
  const sel = { a:true, b:true, 사라진것:true };
  same(C.pickList(sel, ['a','b','c']), ['a','b']);
});

test('손댈 것은 목록에 나온 순서를 따른다', () => {
  /* 「1·3·5번을 지웁니다」라고 말할 때 순서가 뒤죽박죽이면 못 믿는다. */
  const C = load();
  same(C.pickList({ c:true, a:true }, ['a','b','c']), ['a','c']);
});

test('보이는 것이 다 켜져 있으면 모두 고르기가 켜진 상태다', () => {
  const C = load();
  assert.equal(C.pickAllOn({ a:true, b:true }, ['a','b']), true);
  assert.equal(C.pickAllOn({ a:true }, ['a','b']), false);
});

test('목록이 비어 있으면 모두 고르기는 꺼진 상태다', () => {
  /* 빈 목록에서 every() 는 참이다 — 그대로 두면 아무것도 없는데 ✓ 가 켜져 보인다. */
  const C = load();
  assert.equal(C.pickAllOn({}, []), false);
  assert.equal(C.pickAllOn({ a:true }, []), false);
});

test('목록에서 사라진 번호는 버린다 — 개수가 틀리면 안 된다', () => {
  /* 「3개 지우기」인데 2개만 지워지면 그 다음부터 개수를 못 믿는다. */
  const C = load();
  same(C.pickPrune({ a:true, 지워진것:true }, ['a','b']), { a:true });
});

test('버릴 것이 없으면 그대로 둔다', () => {
  const C = load();
  same(C.pickPrune({ a:true, b:true }, ['a','b','c']), { a:true, b:true });
  same(C.pickPrune({}, ['a']), {});
  same(C.pickPrune(null, ['a']), {}, '아직 아무것도 안 골랐어도 터지지 않는다');
});

/* ══════ 화면이 이 층을 제대로 쓰는지 ══════ */

const app = src;
function fnBody(name){
  let i = app.indexOf('\nfunction ' + name + '(');
  if (i < 0) i = app.indexOf('\nasync function ' + name + '(');
  assert.ok(i >= 0, name + ' 를 찾을 수 없습니다');
  const j = app.indexOf('\n}', i);
  return app.slice(i, j + 2);
}

/* 2026-08-23 대표 지시: "모낸메일 은 체크표시 필요없고 번호만 있으면 된다"
   보낸 메일은 「기록」이라 골라서 지울 일이 없다. 예약 메일·자료함은 골라서
   취소·이동·삭제를 하니 ☐ 를 그대로 둔다. 2026-08-10 의 「세 목록 같은 모양」
   지시를 이 한 목록에 대해서만 대표가 거두셨다. */
test('예약 메일·자료함은 번호와 ☐ 를 그린다', () => {
  for (const [fn, kind] of [['schedBoxHtml','sched'], ['renderMatPage','mat']]){
    const body = fnBody(fn);
    assert.match(body, new RegExp("pickHit\\('" + kind + "'"), fn + ' 에 ☐ 가 없습니다');
    assert.match(body, new RegExp("pickBar\\('" + kind + "'"), fn + ' 에 고르기 띠가 없습니다');
  }
  /* 번호 — 표는 .no, 자료함은 이미 있는 순번(matno) 을 쓴다.
     보낸 메일의 번호는 따로 「보낸 메일에는 ☐ 가 없고 번호만 있다」에서 본다. */
  assert.match(fnBody('schedBoxHtml'), /class="no">\$\{i\+1\}/, '예약 메일에 번호가 없습니다');
  assert.match(fnBody('renderMatPage'), /class="matno"/, '자료함에 순번이 없습니다');
});

test('보낸 메일에는 ☐ 가 없고 번호만 있다', () => {
  const body = fnBody('sentBoxHtml');
  assert.doesNotMatch(body, /pickHit\('sent'/,     '보낸 메일에 ☐ 가 남아 있습니다');
  assert.doesNotMatch(body, /pickBar\('sent'/,     '고르기 띠가 남아 있으면 ☐ 없이 뜬다');
  assert.doesNotMatch(body, /pickHeadBox\('sent'/, '표 머리에 전체 고르기 ☐ 가 남아 있습니다');
  assert.match(body, /class="numonly">\$\{i\+1\}/, '번호가 없습니다');
});

test('번호만 있는 칸에도 폭 규칙이 있다', () => {
  assert.match(app, /\.sbox (th|td)\.numonly/, 'numonly 칸의 CSS 가 없으면 폭이 흔들린다');
});

test('일괄 처리는 모두 pickList 로 지금 보이는 것만 손댄다', () => {
  for (const fn of ['pickCancelSched','pickDelMat','pickMoveMat']){
    const body = fnBody(fn);
    assert.match(body, /pickList\(pickOf\('\w+'\), pickVisible\('\w+'\)\)/,
      fn + ' 이 안 보이는 것까지 손댈 수 있습니다');
    /* 옮기기는 어느 갈래로 갈지 prompt 로 묻는다 — 묻는 방식은 달라도 된다 */
    assert.match(body, /confirm\(|prompt\(/, fn + ' 이 묻지 않고 처리합니다');
  }
});

test('폰 화면에도 같은 중복 단추를 두지 않는다', () => {
  /* 캡처는 PC 화면이었지만 폰 상세에도 「📧 메일」과 「📎 자료 보내기」가 함께 있었다. */
  const fn = fnBody('openDetail');
  assert.ok(!HAS_SEND_BTN.test(fn), '폰 화면에 중복 단추가 남아 있습니다');
});

/* 보낸 메일은 ☐ 를 거둬서(2026-08-23) 버릴 고르기가 아예 없다 — 빠졌다 */
test('그릴 때마다 사라진 번호를 버린다', () => {
  for (const fn of ['schedBoxHtml','renderMatPage'])
    assert.match(fnBody(fn), /pickPrune\(/, fn + ' 이 낡은 고르기를 안 버립니다');
});

test('자료함이 보는 목록은 그리는 식과 같은 식이다', () => {
  /* 화면에서 값을 받아 두면 화면을 안 그린 채 눌렸을 때 낡은 값으로 지운다. */
  const fn = fnBody('matVisibleIds');
  assert.match(fn, /matSearchList\(matListByCat\(/, '자료함 목록을 다른 식으로 셉니다');
});

test('보낸 메일 목록은 그리기와 고르기가 같은 함수를 본다', () => {
  assert.match(fnBody('sentBoxHtml'), /sentVisibleRows\(\)/);
  assert.match(fnBody('pickVisible'), /sentVisibleRows\(\)/);
});

/* ══════ 사이드바 · 중복 단추 ══════ */

test('보낸 사람은 이름으로 나온다 — 계정을 자르지 않는다', () => {
  const side = fnBody('mailSideHtml');
  assert.match(side, /staffName\(/, '왼쪽 메뉴가 이름을 안 씁니다');
  assert.ok(!/b\.split\('@'\)/.test(side), '아직 계정을 잘라 씁니다');
  assert.match(fnBody('sentBoxHtml'), /staffName\(v\.by\)/, '보낸 메일 표가 이름을 안 씁니다');
  assert.match(fnBody('schedBoxHtml'), /staffName\(v\.by\)/, '예약 메일 표가 이름을 안 씁니다');
});

test('사람별 목록은 한 줄로 접혀 있다 — 사람이 늘어도 왼쪽이 안 찬다', () => {
  const side = fnBody('mailSideHtml');
  assert.match(side, /보낸 메일 나눠 보기/, '갈래와 사람을 한 칸으로 묶지 않았습니다');
  assert.match(side, /pcfold/, '접는 줄이 없습니다');
  assert.match(app, /function toggleSentBy\(/, '펼치는 길이 없습니다');
  assert.ok(!/보낸 사람별 \(직원\)/.test(app), '옛 제목줄이 남아 있습니다');
});

/* 단추만 본다 — 「왜 지웠는지」 적어 둔 주석에도 같은 글자가 나오므로,
   여는 꼬리표 바로 뒤(>글자<)에 있는 것만 진짜 단추다. */
const HAS_SEND_BTN = />📎 자료 보내기</;

test('명함 상세에서 「자료 보내기」를 지웠다 — 「메일」과 같은 함수였다', () => {
  const fn = fnBody('openPcDetail');
  assert.ok(!HAS_SEND_BTN.test(fn), '같은 일을 하는 단추가 둘 남아 있습니다');
  assert.match(fn, /📧 메일/, '메일 단추가 사라졌습니다');
  /* 같은 함수를 두 번 부르는 단추가 다시 생기지 않게 개수를 본다.
     ⚠ 2026-09-08 부터 그 함수는 openMailWindow 다 — 메일 쓰기는 «딴 창»에서 열린다
       (대표 지시 「현재 창에서 팝업으로 덮인다」). 지키는 뜻은 그대로: 단추는 하나. */
  const n = (fn.match(/openMailWindow\('\$\{id\}'\)/g)||[]).length;
  assert.equal(n, 1, '자료 보내기 단추가 다시 생겼습니다 (메일 단추 '+n+'개)');
  assert.ok(!/openSendMaterials\('\$\{id\}'\)/.test(fn),
    '★ 상세의 메일 단추가 «이 창»에서 열립니다 — 보던 목록이 덮입니다');
});

test('명함 상세는 사진을 이름 옆에 두고 정보를 두 칸으로 놓는다', () => {
  const fn = fnBody('openPcDetail');
  assert.match(fn, /class="pdtop"/, '사진이 아직 위에 통째로 깔립니다');
  assert.match(fn, /class="pdgrid"/, '정보가 아직 한 칸씩입니다');
  assert.match(app, /#pcDetail \.pdgrid\{[^}]*grid-template-columns:1fr 1fr/, '두 칸 배치가 없습니다');
  assert.match(app, /#pcDetail \.pdacts\.three button\{/, '단추가 세 개씩 놓이지 않습니다');
});

test('수정창은 본문만 스크롤하고 저장 단추는 늘 보인다', () => {
  /* 예전에는 창 전체가 스크롤돼서 저장 단추가 화면 밖으로 밀려 반만 보였다. */
  assert.match(app, /#editorM\{[^}]*display:flex[^}]*flex-direction:column/, '머리·본문·발을 나누지 않았습니다');
  assert.match(app, /#editorM>\.edit-split\{[^}]*overflow-y:auto/, '본문만 스크롤하지 않습니다');
  assert.match(app, /#editorM>\.mfoot\{[^}]*flex:none/, '저장 단추가 함께 밀려 올라갑니다');
});
