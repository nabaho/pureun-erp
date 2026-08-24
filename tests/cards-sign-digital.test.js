'use strict';
/* 서명 명함을 «글자로» — 사진이 아니라 정리된 디지털 명함으로 보낸다
   ═══════════════════════════════════════════════════════════════════════════
   대표 지시 2026-08-24: 「명함이 깔끔하게 정리되어 디지털 형태로 갔으면 좋겠다」

   ■ 왜 글자가 사진보다 나은가
     · 받는 쪽 메일 프로그램이 «바깥 그림을 기본으로 막는다» — 사진은 「이미지 표시」를
       눌러야 보이는 일이 잦다. 글자는 무조건 보인다.
     · 주소·전화를 «긁어 붙일 수» 있다. 사진은 손으로 옮겨 적어야 한다.
     · 폰에서 사진은 작아 안 읽히고, 글자는 화면 폭에 맞춰 접힌다.
     · 편지마다 따라가는 것인데 사진은 50~150KB, 글자는 1KB 안쪽이다.
     · 첨부 파일 목록에 명함 사진이 끼는 일이 없다.

   ★ 여기서 못 박는 것
     ① 명함의 값(이름·직책·회사·전화·팩스·휴대폰·메일·주소)으로 짠다
     ② 빈 값은 «자리를 안 만든다» — 「T : 」만 남으면 안 채운 것이 드러난다
     ③ 씻는 과정을 통과한다 — 꾸밈이 서버에서 지워지면 안 된다
     ④ 글자에 든 <, & 가 태그로 새지 않는다
     ⑤ 사진으로 보내는 길도 «그대로» 남는다 (고를 수 있다)
   실행: node --test tests/cards-sign-digital.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'pu-cards.html'), 'utf8').replace(/\r\n/g, '\n');
const MS = require(path.join(ROOT, 'functions', 'mail-send.js'));

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
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function load(){
  const ctx = { console, String, Array, Object, esc };
  vm.createContext(ctx);
  vm.runInContext(fnBody('signCardHtml'), ctx);
  return ctx;
}
const FULL = {
  name: '권형하', title: '대표 공인노무사', dept: '노무법인',
  company: '푸른노무법인',
  companyTel: '041-556-0035', companyFax: '041-556-3656', mobile: '010-1234-5678',
  email: '370-6@daum.net',
  companyAddr: '충남 천안시 서북구 원두정8길 6, 301호 (두정빌딩)'
};

/* ══════ ① 명함의 값으로 짠다 ══════ */

test('★ 명함에 적힌 것이 모두 들어간다', () => {
  const h = load().signCardHtml(FULL);
  for (const v of ['권형하', '대표 공인노무사', '푸른노무법인',
                   '041-556-0035', '041-556-3656', '010-1234-5678',
                   '370-6@daum.net', '충남 천안시 서북구 원두정8길 6, 301호 (두정빌딩)']) {
    assert.ok(h.indexOf(v) > 0, '★ 「' + v + '」가 빠졌다');
  }
});

test('이름이 가장 크고 굵다 — 첫눈에 누구인지 보여야 한다', () => {
  const h = load().signCardHtml(FULL);
  const i = h.indexOf('권형하');
  const before = h.slice(Math.max(0, i - 160), i);
  assert.match(before, /font-weight:\s*700/, '이름이 굵지 않다');
  assert.match(before, /font-size:\s*1[4-9]px/, '이름이 크지 않다');
});

test('메일 주소는 누를 수 있다', () => {
  const h = load().signCardHtml(FULL);
  assert.match(h, /href="mailto:370-6@daum\.net"/,
    '★ 눌러서 답장할 수 없으면 주소를 손으로 옮겨 적어야 한다');
});

/* ══════ ② 빈 값은 자리를 안 만든다 ══════ */

test('★ 없는 값은 이름표도 안 나온다', () => {
  const C = load();
  const h = C.signCardHtml({ name: '홍길동', company: '가나상사' });
  assert.ok(h.indexOf('홍길동') > 0 && h.indexOf('가나상사') > 0);
  for (const label of ['T ', 'F ', 'M ']) {
    assert.equal(h.indexOf(label), -1,
      '★ 「' + label + '」만 남았다 — 안 채운 칸이 드러난다: ' + h);
  }
  assert.equal(h.indexOf('mailto:'), -1, '메일이 없는데 누를 자리를 만들었다');
});

test('이름조차 없으면 아무 것도 안 만든다', () => {
  const C = load();
  assert.equal(C.signCardHtml({}), '');
  assert.equal(C.signCardHtml(null), '');
  assert.equal(C.signCardHtml({ name: '   ' }), '');
});

test('직책만 없어도 이름은 나온다', () => {
  const h = load().signCardHtml({ name: '홍길동', company: '가나상사', companyTel: '02-1-2' });
  assert.ok(h.indexOf('홍길동') > 0);
  assert.ok(h.indexOf('02-1-2') > 0);
});

/* ══════ ③ 씻는 과정을 통과한다 ══════ */

test('★ 서버가 씻은 뒤에도 모양이 남는다', () => {
  const raw = load().signCardHtml(FULL);
  const h = MS.sanitizeHtml(raw);
  assert.ok(h.indexOf('권형하') > 0, '이름이 사라졌다');
  assert.ok(h.indexOf('041-556-0035') > 0, '전화가 사라졌다');
  assert.match(h, /font-weight:\s*700/, '★ 굵기가 지워졌다 — 이름이 본문과 안 구별된다');
  assert.match(h, /font-size/, '★ 글자 크기가 지워졌다');
  assert.match(h, /color/, '★ 색이 지워졌다');
  assert.ok(h.indexOf('mailto:370-6@daum.net') > 0, '★ 누를 수 있는 메일 주소가 지워졌다');
});

test('허용 목록에 없는 꾸밈을 쓰지 않았다 — 쓰면 서버가 조용히 지운다', () => {
  const raw = load().signCardHtml(FULL);
  for (const bad of ['border', 'padding:', 'display:', 'width:', 'float']) {
    assert.equal(raw.indexOf(bad), -1,
      '★ 「' + bad + '」은 허용 목록(STYLE_OK)에 없어 서버가 지운다');
  }
});

test('평문 몫에도 다 남는다 — 서식을 못 읽는 프로그램', () => {
  const t = MS.htmlToText(MS.sanitizeHtml(load().signCardHtml(FULL)));
  for (const v of ['권형하', '푸른노무법인', '041-556-0035', '370-6@daum.net']) {
    assert.ok(t.indexOf(v) >= 0, '평문에서 「' + v + '」가 사라졌다\n' + t);
  }
});

/* ══════ ④ 글자가 태그로 새지 않는다 ══════ */

test('★ 이름·회사에 든 <, & 가 태그로 새지 않는다', () => {
  const h = load().signCardHtml({ name: '<b>홍길동</b>', company: 'A&B <주식>' });
  assert.equal(h.indexOf('<b>홍길동'), -1, '★ 태그가 그대로 들어갔다: ' + h);
  assert.ok(h.indexOf('&lt;b&gt;홍길동') > 0, '글자로 지켜지지 않았다');
  assert.ok(h.indexOf('A&amp;B') > 0, '& 가 안 지켜졌다');
});

test('메일 주소에 따옴표가 있어도 속성이 깨지지 않는다', () => {
  const h = load().signCardHtml({ name: '가', email: 'a"b@c.com' });
  assert.equal(/href="mailto:a"b/.test(h), false, '★ 속성이 깨져 뒤가 다 망가진다: ' + h);
});

/* ══════ ⑤ 고를 수 있다 ══════ */

test('★ 글자로 보내는 것이 기본이다', () => {
  const fn = fnBody('signMode');
  assert.match(fn, /'card'/, '기본 갈래가 없다');
  assert.match(fn, /digital|card/, '');
});

test('글자·사진 둘 다 고를 수 있고, 사진 길은 그대로다', () => {
  const fn = fnBody('signBlockHtml');
  assert.match(fn, /signCardHtml\(/, '★ 글자 명함을 안 쓴다');
  assert.match(fn, /SIGN_IMG/, '★ 사진으로 보내는 길이 없어졌다');
  assert.match(fn, /signMode\(/, '★ 고른 것을 안 본다');
});

test('내 서명 창에서 갈래를 고를 수 있다', () => {
  assert.match(fnBody('mySignHtml'), /setSignMode\(/, '고를 단추가 없다');
});

test('갈래는 사람마다 따로 저장된다', () => {
  const fn = fnBody('setSignMode');
  assert.match(fn, /perUser\/\$\{k\}/, '★ 남의 설정을 덮어쓴다');
  assert.match(fn, /mySignKey\(\)/, '내 열쇠를 안 쓴다');
});

test('사진 갈래일 때만 그림 표시를 넣는다 — 글자 갈래에 표시가 끼면 빈 자리가 뜬다', () => {
  const fn = fnBody('signBlockHtml');
  const img = fn.indexOf('SIGN_IMG');
  const mode = fn.indexOf('signMode(');
  assert.ok(mode > 0 && mode < img, '★ 갈래를 보기 전에 표시를 넣는다');
});
