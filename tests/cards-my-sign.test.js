'use strict';
/* 내 서명 명함 — 화면 쪽 (실행: node --test tests/cards-my-sign.test.js)

   대표 지시 2026-08-24: 「명함사진은 본인것 찾아서 선택하고 한번 저장하면
   계속 보낼수 있게 만들어 줄수 있나?」

   ★ 여기서 못 박는 것 — 하나라도 깨지면 서명이 «조용히» 안 나간다
     ① 화면에 보이는 그림을 담을 때 «표시로 되돌린다»
        (안 되돌리면 100KB data: 주소가 본문에 실리고, 서버가 그걸 버려 서명이 사라진다)
     ② 열쇠 만드는 규칙이 서버(functions/mail-sign.js)와 «같은 답»을 낸다
        (다르면 저장한 자리와 서버가 읽는 자리가 어긋난다)
     ③ 새 메일을 열면 서명이 «이미» 들어가 있다 (누르는 것을 잊어도 따라간다)
     ④ 서명은 잣대(base)에 안 들어간다 (서명만 있는 빈 편지가 「손댔다」로 안 보이게)
     ⑤ 사람마다 따로 저장된다 — 남의 명함이 내 메일에 붙으면 안 된다 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'pu-cards.html'), 'utf8').replace(/\r\n/g, '\n');
const SG = require(path.join(ROOT, 'functions', 'mail-sign.js'));

function fnBody(name){
  let i = src.indexOf('\nfunction ' + name + '(');
  if (i < 0) i = src.indexOf('\nasync function ' + name + '(');
  assert.ok(i >= 0, name + ' 를 찾을 수 없습니다');
  return src.slice(i, src.indexOf('\n}', i) + 2);
}
function constLine(name){
  const re = new RegExp('^const ' + name + ' = .*$', 'm');
  const m = src.match(re);
  assert.ok(m, name + ' 를 찾을 수 없습니다');
  return m[0];
}
/* 서명 관련 순수 함수만 떼어 돌린다.
   ⚠ vm 에서 «맨 위의 const·let 은 context 속성이 안 된다» — function 만 된다.
     그래서 var 로 바꿔 넣는다. (이 저장소에서 여러 번 걸린 함정) */
function load(thumb){
  const ctx = { console, String, RegExp, Object, Number };
  vm.createContext(ctx);
  const toVar = s => s.replace(/^const /, 'var ');
  vm.runInContext(
    toVar(constLine('SIGN_CID')) + '\n' +
    toVar(constLine('SIGN_IMG')) + '\n' +
    toVar(constLine('SIGN_BACK_RE')) + '\n' +
    'var _signThumb = ' + JSON.stringify(thumb || '') + ';\n' +
    fnBody('signPreviewHtml') + '\n' +
    fnBody('signRestoreHtml') + '\n' +
    fnBody('signKeyC'), ctx);
  return ctx;
}
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==';

/* ══════ ① 그림 ↔ 표시 왕복 ══════ */

test('★ 사진이 있으면 표시를 실제 그림으로 바꿔 보여 준다', () => {
  const C = load(PNG);
  const out = C.signPreviewHtml('<p>가</p>' + C.SIGN_IMG);
  assert.ok(out.indexOf(PNG) > 0, '그림을 안 보여 준다');
  assert.equal(out.indexOf('cid:'), -1, '표시가 그대로 남아 깨진 그림이 보인다');
  assert.ok(out.indexOf('data-pusign') > 0, '★ 되돌릴 표식이 없으면 담을 때 못 알아본다');
});

test('★ 담을 때 그림을 다시 «표시»로 되돌린다 — 안 되돌리면 서명이 사라진다', () => {
  const C = load(PNG);
  const shown = C.signPreviewHtml('<p>가</p>' + C.SIGN_IMG);
  const back = C.signRestoreHtml(shown);
  assert.equal(back, '<p>가</p>' + C.SIGN_IMG,
    '★ 왕복이 안 맞는다 — 본문에 data: 주소가 실려 나가고 서버가 버린다: ' + back);
  assert.equal(back.indexOf('data:'), -1, 'data: 주소가 남았다');
});

test('사진을 아직 안 골랐으면 「보낼 때 붙습니다」 자리만 보인다', () => {
  const C = load('');
  const out = C.signPreviewHtml(C.SIGN_IMG);
  assert.equal(out.indexOf('<img'), -1, '빈 그림 태그를 두면 깨진 그림이 보인다');
  assert.ok(out.indexOf('보낼 때') > 0, '무슨 자리인지 안 알려 준다');
  /* 그 자리도 되돌아가야 한다 — 안 되돌리면 안내 글자가 편지에 실려 나간다 */
  assert.equal(C.signRestoreHtml(out), C.SIGN_IMG, '안내 자리가 표시로 안 되돌아간다');
});

test('★ 담는 길(grabCompose)이 실제로 되돌리기를 «부른다»', () => {
  /* 함수가 맞게 도는 것만 봐서는 부족하다 — 아무도 안 부르면 100KB data: 주소가
     그대로 실려 나가고, 서버가 그런 그림을 버려 서명이 조용히 사라진다.
     (일부러 이 줄을 지우는 시험에서 처음에는 안 걸렸다.) */
  const fn = fnBody('grabCompose');
  assert.match(fn, /signRestoreHtml\(/,
    '★ grabCompose 가 되돌리기를 안 부른다 — 서명이 조용히 사라진다');
  const i = fn.indexOf('signRestoreHtml(');
  const j = fn.indexOf('rich.innerHTML');
  assert.ok(i > 0 && j > i, '★ innerHTML 을 «싸서» 되돌려야 한다 (그냥 나란히 두면 안 먹는다)');
});

test('표시가 없는 본문은 손대지 않는다', () => {
  const C = load(PNG);
  const plain = '<p>안녕하세요</p>';
  assert.equal(C.signPreviewHtml(plain), plain);
  assert.equal(C.signRestoreHtml(plain), plain);
});

test('본문에 붙인 다른 그림은 되돌리기가 건드리지 않는다', () => {
  const C = load(PNG);
  const other = '<img src="' + PNG + '">';
  assert.equal(C.signRestoreHtml(other), other, '남의 그림을 서명 표시로 바꿨다');
});

/* ══════ ② 열쇠가 서버와 같은 답 ══════ */

test('★ 열쇠 만드는 규칙이 서버와 «같은 답»을 낸다', () => {
  const C = load('');
  for (const e of ['kwon.hyung@daum.net', 'A@B.com', '370-6@daum.net',
                   'a#b@c.net', 'x$y@z.co.kr', '', null]) {
    assert.equal(C.signKeyC(e), SG.signKey(e),
      '★ 화면과 서버가 다른 자리를 본다 — 저장은 되는데 서명이 안 붙는다: ' + JSON.stringify(e));
  }
});

test('서버와 같아야 한다는 것이 코드에 적혀 있다', () => {
  assert.match(fnBody('signKeyC'), /mail-sign/,
    '다음 사람이 한쪽만 고치지 않도록 서로를 가리켜야 한다');
});

test('표시 이름(cid)이 서버와 같다', () => {
  const C = load('');
  assert.equal(C.SIGN_CID, SG.SIGN_CID,
    '★ 이름이 다르면 본문의 표시와 붙는 그림이 안 이어진다');
});


/* ⚠ openMailPage 는 2026-08-30 에 앞뒤로 «갈렸다» — 앞(openMailPage)은 「쓰다 만 글이
     있는데 이어서 쓸까요」를 물어보고, 뒤(mailPageBuild)가 실제로 편지를 «짓는다».
     가운데 물음 창(puAsk)이 confirm 과 달리 JS를 안 멈춰서 그렇게 갈랐다.
     «무엇을 짓는지» 보는 검사는 둘을 함께 봐야 한다 — 나뉜 것은 짜임새일 뿐 한 흐름이다. */
function openFlow(){ return fnBody('openMailPage') + fnBody('mailPageBuild'); }
/* ══════ ③ · ④ 새 메일에 이미 들어가 있다 ══════ */

test('★ 새 메일을 열면 서명이 이미 들어가 있다', () => {
  const fn = openFlow();
  /* ⚠ 「어딘가에 signBlockHtml 이 있다」로는 모자라다 — 전달 갈래(p.body)에도 있어서
       «새 편지»의 서명을 빼도 통과한다. 새 편지가 쓰는 html0 을 콕 집어 본다. */
  const m = fn.match(/const\s+html0\s*=([^;]*);/);
  assert.ok(m, 'html0 을 찾지 못했습니다');
  assert.match(m[1], /signBlockHtml\(\)/,
    '★ 안 넣으면 「한번 저장하면 계속 보낼수 있게」가 안 된다 — 매번 눌러야 한다');
  assert.match(fn, /html:\s*html0/, '서식 몫에 담아야 화면에 보인다');
});

/* 잣대(base)는 «처음 보여 준 그대로»여야 한다. composeTouched 가 c.body 를 base.body 와
   견주므로, 서명이 든 본문을 보여 주면서 잣대는 서명 없는 것으로 두면 «아무것도 안 쓴
   편지»가 늘 「손댔다」로 나와 임시저장이 쌓이고, 나갈 때마다 「이어서 쓸까요」를 묻는다. */
test('★ 잣대(base)가 처음 보여 준 본문과 똑같다 — 안 그러면 빈 편지도 「손댔다」가 된다', () => {
  const fn = openFlow();
  const bodyLine = fn.match(/subject:\s*subject0,\s*body:\s*([^,]+),/);
  assert.ok(bodyLine, '본문을 담는 줄을 찾지 못했습니다');
  const baseAt = fn.indexOf('base: {');
  assert.ok(baseAt > 0, '잣대를 찾지 못했습니다');
  const baseLine = fn.slice(baseAt, fn.indexOf('}', baseAt));
  const bodyExpr = bodyLine[1].trim();
  assert.ok(baseLine.indexOf(bodyExpr) > 0,
    '★ 잣대가 본문과 다른 식이다 (본문 ' + bodyExpr + ' / 잣대 ' + baseLine.trim() + ')');
});

test('고른 명함 사진을 미리 받아 둔다 — 없으면 본문에 빈 자리가 보인다', () => {
  assert.match(openFlow(), /loadSignThumb\(/);
});

/* ══════ ⑤ 사람마다 따로 ══════ */

test('★ 저장·삭제 자리에 내 열쇠가 들어간다', () => {
  for (const n of ['pickMySign', 'clearMySign']) {
    assert.match(fnBody(n), /config\/matMail\/perUser\/\$\{k\}/,
      '★ ' + n + ' 이 사람을 안 가린다 — 남의 서명을 덮어쓴다');
    assert.match(fnBody(n), /mySignKey\(\)/, n + ' 이 내 열쇠를 안 쓴다');
  }
});

test('읽을 때도 내 것만 본다', () => {
  assert.match(fnBody('mySign'), /mySignKey\(\)/, '★ 남의 명함이 내 메일에 붙는다');
});

test('저장이 막히면 왜인지 알려 준다', () => {
  assert.match(fnBody('pickMySign'), /catch/, '실패를 조용히 넘기면 저장된 줄 안다');
  assert.match(fnBody('pickMySign'), /규칙/,
    '서버 규칙 때문일 수 있다는 것을 알려야 다음 걸음을 안다');
});

/* ══════ 단추가 있는가 ══════ */

test('쓰기 화면에 「내 명함」 단추가 있다', () => {
  assert.match(fnBody('mailWriteHtml'), /openMySign\(\)/, '고를 길이 없다');
});

test('미리보기도 실제 그림으로 보여 준다', () => {
  assert.match(fnBody('previewMail'), /signPreviewHtml\(/,
    '미리보기에서 깨진 그림이 보이면 「실제와 다르다」가 된다');
});
