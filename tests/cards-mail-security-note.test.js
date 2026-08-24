'use strict';
/* 보안문구 — 메일 끝에 늘 붙는 비밀유지 안내
   ═══════════════════════════════════════════════════════════════════════════
   대표 지시 2026-08-24: 「보안문구」

   노무법인이 보내는 메일에는 근로자 개인정보·임금·징계 같은 것이 담긴다.
   잘못 전달됐을 때 「지워 주십시오」를 미리 적어 두는 것이 관례이고, 개인정보를
   다루는 곳에서는 사실상 기본이다.

   ■ 왜 «글자 서명»과 자리를 나눴나
     글자 서명은 직원 누구나 고칠 수 있다. 거기에 섞어 두면 주소를 고치다가
     보안문구를 지우는 일이 생긴다. 법적 성격이 있는 문구라 자리를 따로 두고,
     고치는 것은 대표만 하게 했다.

   ■ 왜 «서버가 몰래» 붙이지 않나
     쓰기 화면 본문에 넣어 눈에 보이게 한다. 몰래 붙이면 무엇이 나갔는지
     보낸 뒤에야 알게 된다 — 서명 명함 사진과 같은 판단이다.

   ★ 여기서 못 박는 것
     ① 보안문구가 서명 덩어리에 «늘» 들어간다
     ② 서명 사진이 없어도 들어간다 (사진과 딴 것이다)
     ③ 씻는 과정을 통과한다 — 꾸밈이 서버에서 지워지면 안 된다
     ④ 고치는 것은 대표만 (법적 성격이 있는 문구다)
     ⑤ 평문 몫에도 남는다 (서식을 못 읽는 곳에서도 보여야 한다)
   실행: node --test tests/cards-mail-security-note.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'pu-cards.html'), 'utf8').replace(/\r\n/g, '\n');
const MS = require(path.join(ROOT, 'functions', 'mail-send.js'));

/* ⚠ 「\n} 까지 자르기」로는 안 된다 — signText 처럼 «한 줄로 된 함수»는 그 뒤의
   const 선언까지 통째로 끌고 온다(이 검사를 만들면서 실제로 걸렸다).
   그래서 중괄호를 세어 짝이 맞는 곳에서 끊는다. */
function fnBody(name){
  let i = src.indexOf('\nfunction ' + name + '(');
  if (i < 0) i = src.indexOf('\nasync function ' + name + '(');
  assert.ok(i >= 0, name + ' 를 찾을 수 없습니다');
  const open = src.indexOf('{', i);
  assert.ok(open > i, name + ' 의 몸통을 찾을 수 없습니다');
  let depth = 0;
  for (let k = open; k < src.length; k++) {
    const ch = src[k];
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) return src.slice(i, k + 1); }
  }
  assert.fail(name + ' 의 끝을 찾을 수 없습니다');
}

/* 서명 덩어리를 실제로 만들어 본다 */
function build(opt){
  const o = opt || {};
  const ctx = { console, String, Object, RegExp };
  vm.createContext(ctx);
  const sec = src.match(/^const SEC_DEFAULT =\n`[\s\S]*?`;$/m);
  assert.ok(sec, 'SEC_DEFAULT 를 찾을 수 없습니다');
  const sign = src.match(/^const SIGN_DEFAULT =\n`[\s\S]*?`;$/m);
  vm.runInContext(
    sec[0].replace(/^const /, 'var ') + '\n' +
    sign[0].replace(/^const /, 'var ') + '\n' +
    'var SIGN_CID = "pusign";\n' +
    'var SIGN_IMG = \'<img src="cid:pusign">\';\n' +
    'var _matMail = ' + JSON.stringify(o.matMail || {}) + ';\n' +
    'var myEmail = ' + JSON.stringify(o.myEmail || 'a@b.com') + ';\n' +
    fnBody('textToHtml') + '\n' +
    fnBody('htmlToTextC') + '\n' +
    fnBody('signKeyC') + '\n' +
    fnBody('mySignKey') + '\n' +
    fnBody('mySign') + '\n' +
    fnBody('signText') + '\n' +
    fnBody('secText') + '\n' +
    fnBody('signBlockHtml'), ctx);
  return ctx;
}

/* ══════ ① · ② 늘 들어간다 ══════ */

test('★ 사진을 안 골랐어도 보안문구는 들어간다', () => {
  const C = build({});
  const h = C.signBlockHtml();
  assert.ok(h.indexOf('수신인') > 0, '★ 보안문구가 없다: ' + h.slice(0, 200));
  assert.equal(h.indexOf('cid:pusign'), -1, '사진을 안 골랐는데 표시가 들어갔다');
});

test('★ 사진을 골랐으면 사진 + 서명 + 보안문구 순서다', () => {
  const C = build({ myEmail: 'a@b.com', matMail: { perUser: { 'a@b_com': { cardId: 'c1' } } } });
  const h = C.signBlockHtml();
  const img = h.indexOf('cid:pusign');
  const sign = h.indexOf('푸른노무법인');
  const sec = h.indexOf('수신인');
  assert.ok(img >= 0, '사진 표시가 없다');
  assert.ok(sign > img, '서명이 사진보다 앞에 있다');
  assert.ok(sec > sign, '★ 보안문구가 서명보다 앞에 있다 — 맨 끝이어야 한다');
});

test('직원이 글자 서명을 바꿔도 보안문구는 남는다', () => {
  const C = build({ matMail: { sign: '홍길동\n푸른노무법인' } });
  const h = C.signBlockHtml();
  /* 사진이 없으면 서명이 «맨 앞»(0번)에서 시작한다 — >0 으로 보면 잘못 걸린다 */
  assert.ok(h.indexOf('홍길동') >= 0, '바꾼 서명이 안 들어갔다');
  assert.ok(h.indexOf('수신인') > 0,
    '★ 서명을 바꾸면 보안문구가 사라진다 — 자리를 나눈 뜻이 없다');
});

test('보안문구를 대표가 고쳐 두면 그것이 나간다', () => {
  const C = build({ matMail: { sec: '우리 회사 고유 문구입니다' } });
  assert.ok(C.signBlockHtml().indexOf('우리 회사 고유 문구') > 0);
});

test('보안문구를 빈칸으로 두면 붙지 않는다 — 대표가 뺄 수도 있어야 한다', () => {
  const C = build({ matMail: { sec: '' } });
  const h = C.signBlockHtml();
  assert.equal(h.indexOf('수신인'), -1, '빈칸으로 뒀는데도 기본 문구가 나간다');
  assert.ok(h.indexOf('푸른노무법인') > 0, '서명까지 사라졌다');
});

/* ══════ ③ 씻는 과정을 통과한다 ══════ */

test('★ 보안문구의 꾸밈이 서버에서 지워지지 않는다', () => {
  const C = build({});
  const h = MS.sanitizeHtml(C.signBlockHtml());
  assert.ok(h.indexOf('수신인') > 0, '보안문구가 사라졌다');
  assert.ok(/font-size/.test(h), '★ 글자 크기가 지워졌다 — 본문과 같은 크기로 튄다');
  assert.ok(/color/.test(h), '★ 색이 지워졌다 — 본문과 구별이 안 된다');
  assert.ok(h.indexOf('<hr') >= 0, '★ 가르는 줄이 사라졌다');
});

test('허용 목록에 없는 꾸밈은 쓰지 않았다 — 쓰면 서버가 조용히 지운다', () => {
  const C = build({});
  const block = C.signBlockHtml();
  /* border 는 STYLE_OK 에 없다. 줄을 그으려면 <hr> 를 쓴다. */
  assert.equal(block.indexOf('border'), -1,
    '★ border 는 허용 목록에 없어 서버가 지운다 — <hr> 를 쓸 것');
  assert.equal(block.indexOf('padding:'), -1,
    '★ padding 은 허용 목록에 없다 (padding-left 만 있다)');
});

/* ══════ ④ 고치는 것은 대표만 ══════ */

test('★ 보안문구를 고치는 것은 대표만', () => {
  const fn = fnBody('editSec');
  assert.match(fn, /isAdmin/,
    '★ 누구나 고칠 수 있으면 법적 성격이 있는 문구가 흔들린다');
});

test('저장 자리가 글자 서명과 «다르다»', () => {
  assert.match(fnBody('editSec'), /matMail\/sec/, '보안문구 자리가 따로 없다');
  assert.match(fnBody('editSign'), /matMail\/sign/, '글자 서명 자리가 바뀌었다');
});

test('쓰기 화면에서 고칠 길이 있다', () => {
  assert.match(fnBody('mailWriteHtml'), /editSec\(\)/, '고칠 단추가 없다');
});

/* ══════ ⑤ 평문 몫에도 남는다 ══════ */

test('★ 서식을 못 읽는 곳에서도 보안문구가 보인다', () => {
  const C = build({});
  const t = C.htmlToTextC(C.signBlockHtml());
  assert.ok(t.indexOf('수신인') > 0,
    '★ 평문 몫에서 사라지면 옛 메일 프로그램에서는 안 보인다');
});

/* ══════ 문구 자체 ══════ */

test('기본 문구가 할 말을 다 한다', () => {
  const C = build({});
  const t = C.secText();
  for (const must of ['수신인', '삭제']) {
    assert.ok(t.indexOf(must) >= 0, '「' + must + '」이 없다 — 보안문구의 핵심이다');
  }
  assert.ok(t.length > 40, '너무 짧다 — 무슨 말인지 전달이 안 된다');
  assert.ok(t.length < 400, '너무 길다 — 편지마다 따라가는 것이다');
});
