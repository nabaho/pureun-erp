'use strict';
/* 내 서명 — 명함 사진을 한 번 골라 두면 보낼 때마다 따라간다
   ═══════════════════════════════════════════════════════════════════════════
   대표 지시 2026-08-24: 「명함사진은 본인것 찾아서 선택하고 한번 저장하면
   계속 보낼수 있게 만들어 줄수 있나?」

   ■ 어떻게 만들었나 (왜 이 방식인가)
     본문에는 «표시(cid:pusign)»만 넣고, 그림은 «보낼 때» 서버가 붙인다.
       · 본문에 그림을 통째로 담으면(data:) 예약·묶음 메일이 실시간DB 에
         100KB 짜리 base64 를 며칠씩 물고 있는다 — 어제 줄인 비용이 되돌아온다.
       · 표시만 두면 서명을 바꿨을 때 «걸어 둔 예약 메일도» 새 서명으로 나간다.
       · 그림은 명함의 «썸네일»을 그대로 쓴다 — 이미 있는 것이라 새로 담지 않는다.

   ★ 여기서 못 박는 것
     ① 표시가 없으면 아무 일도 안 한다 (서명을 안 쓴 사람의 메일이 안 달라진다)
     ② 그림을 못 찾으면 «표시를 지운다» — 깨진 그림 자리가 나가면 안 된다
     ③ 붙이는 그림은 «인라인»(cid) 이다 — 첨부 파일처럼 따로 뜨지 않는다
     ④ 사람마다 다른 서명이다 — 남의 명함이 내 메일에 붙으면 안 된다
     ⑤ 열쇠에 못 쓰는 글자(. # $ / [ ])가 든 메일 주소도 안전하게 자리를 잡는다
   실행: node --test tests/mail-sign.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SG = require(path.join(ROOT, 'functions', 'mail-sign.js'));
const MS = require(path.join(ROOT, 'functions', 'mail-send.js'));
const DEL = fs.readFileSync(path.join(ROOT, 'functions', 'mail-deliver.js'), 'utf8');

const MARK = '<img src="cid:' + SG.SIGN_CID + '">';
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==';

/* ══════ ⑤ 사람마다 자리를 잡는 열쇠 ══════ */

test('메일 주소로 안전한 열쇠를 만든다 — 점·# 은 실시간DB 열쇠에 못 쓴다', () => {
  const k = SG.signKey('kwon.hyung@daum.net');
  assert.ok(k, '열쇠가 비었다');
  assert.equal(/[.#$/[\]]/.test(k), false, '못 쓰는 글자가 남았다: ' + k);
});

test('사람이 다르면 열쇠도 다르다', () => {
  assert.notEqual(SG.signKey('a@b.com'), SG.signKey('c@d.com'));
});

test('대소문자만 다른 주소는 같은 사람으로 본다', () => {
  assert.equal(SG.signKey('A@B.com'), SG.signKey('a@b.com'));
});

test('주소가 없으면 빈 열쇠 — 누구 것인지 모르면 서명을 안 붙인다', () => {
  assert.equal(SG.signKey(''), '');
  assert.equal(SG.signKey(null), '');
});

/* ══════ ① 표시가 없으면 아무 일도 안 한다 ══════ */

test('표시가 없는 본문은 알아본다', () => {
  assert.equal(SG.hasSignMark('<p>안녕하세요</p>'), false);
  assert.equal(SG.hasSignMark(''), false);
  assert.equal(SG.hasSignMark(null), false);
});

test('표시가 있는 본문은 알아본다', () => {
  assert.equal(SG.hasSignMark('<p>가</p>' + MARK), true);
  /* 따옴표가 다르거나 띄어쓰기가 있어도 알아봐야 한다 — 편집기가 손댈 수 있다 */
  assert.equal(SG.hasSignMark("<img src='cid:" + SG.SIGN_CID + "'>"), true);
  assert.equal(SG.hasSignMark('<img  src = "cid:' + SG.SIGN_CID + '" >'), true);
});

/* ══════ ② 그림을 못 찾으면 표시를 지운다 ══════ */

test('표시를 지우면 깨진 그림 자리가 남지 않는다', () => {
  const out = SG.stripSignMark('<p>가</p>' + MARK + '<p>나</p>');
  assert.equal(out.indexOf('cid:'), -1, '표시가 남았다: ' + out);
  assert.equal(out.indexOf('<img'), -1, '빈 그림 태그가 남았다: ' + out);
  assert.ok(out.indexOf('가') > 0 && out.indexOf('나') > 0, '글자를 잃었다');
});

test('표시가 여럿이어도 다 지운다', () => {
  const out = SG.stripSignMark(MARK + '가' + MARK);
  assert.equal(out, '가');
});

test('남의 그림 태그는 건드리지 않는다 — 우리 표시만 지운다', () => {
  const other = '<img src="cid:other">';
  assert.equal(SG.stripSignMark(other), other);
});

/* ══════ ③ 붙이는 그림은 인라인(cid) ══════ */

test('썸네일을 인라인 첨부로 바꾼다', () => {
  const a = SG.signAttachment(PNG);
  assert.ok(a, '첨부를 못 만들었다');
  assert.equal(a.cid, SG.SIGN_CID, 'cid 가 다르면 본문의 표시와 안 이어진다');
  assert.equal(a.encoding, 'base64');
  assert.ok(a.content && a.content.indexOf('data:') < 0, 'data: 머리를 떼지 않았다');
  assert.ok(/\.(png|jpe?g|gif|webp)$/i.test(a.filename), '파일 이름에 종류가 없다: ' + a.filename);
});

test('그림 종류를 dataURL 에서 읽는다', () => {
  assert.match(SG.signAttachment('data:image/jpeg;base64,AAAA').filename, /\.jpg$/);
  assert.match(SG.signAttachment('data:image/png;base64,AAAA').filename, /\.png$/);
});

test('그림이 아니거나 비었으면 첨부를 안 만든다 — 쓰레기가 나가면 안 된다', () => {
  for (const bad of ['', null, 'data:text/html;base64,AAAA', 'http://x/a.png', 'data:image/png;base64,']) {
    assert.equal(SG.signAttachment(bad), null, JSON.stringify(bad) + ' 로 첨부를 만들었다');
  }
});

test('너무 큰 그림은 붙이지 않는다 — 편지마다 따라가는 것이라 무게가 쌓인다', () => {
  const big = 'data:image/png;base64,' + 'A'.repeat(SG.SIGN_MAX_BYTES * 2);
  assert.equal(SG.signAttachment(big), null);
});

/* ══════ 허용 목록 — 우리 표시만 통과한다 ══════ */

test('서명 그림 표시는 씻는 과정을 통과한다', () => {
  const h = MS.sanitizeHtml('<p>가</p>' + MARK);
  assert.ok(h.indexOf('cid:' + SG.SIGN_CID) > 0, '★ 우리 표시가 지워지면 서명 그림이 안 나간다: ' + h);
});

test('★ 다른 그림은 여전히 버린다 — 바깥 그림을 불러오면 읽었는지 새 나간다', () => {
  for (const bad of ['<img src="http://x/a.png">', '<img src="data:image/png;base64,AAAA">',
                     '<img src="cid:other">', '<img src="cid:pusign2">',
                     '<img src="cid:pusign" onerror="steal()">']) {
    const h = MS.sanitizeHtml('가' + bad + '나');
    assert.equal(h.indexOf('http://x'), -1, bad + ' 의 주소가 남았다: ' + h);
    assert.equal(h.indexOf('onerror'), -1, bad + ' 의 손잡이가 남았다: ' + h);
    if (bad.indexOf('cid:pusign"') < 0) {
      assert.equal(h.indexOf('<img'), -1, bad + ' 가 통과했다: ' + h);
    }
    assert.ok(h.indexOf('가') >= 0 && h.indexOf('나') > 0, '글자를 잃었다: ' + h);
  }
});

test('평문으로 뽑을 때 서명 그림은 자리를 안 차지한다', () => {
  assert.equal(MS.htmlToText('<p>가</p>' + MARK), '가');
});

/* ══════ ④ 보내는 층에 어떻게 붙었나 ══════ */

test('보낼 때 «보낸 사람 것»으로 서명을 찾는다', () => {
  assert.match(DEL, /signKey\(/, '★ 사람을 안 가리면 남의 명함이 내 메일에 붙는다');
  assert.match(DEL, /byEmail/, '보낸 사람 주소로 찾아야 한다');
});

test('서명 붙이기가 실패해도 메일은 나간다', () => {
  const i = DEL.indexOf('SG.hasSignMark(');
  assert.ok(i > 0, '서명 붙이는 자리가 없다');
  const around = DEL.slice(Math.max(0, i - 500), i);
  assert.ok(around.lastIndexOf('try {') > around.lastIndexOf('} catch'),
    '★ try 밖에 두면 서명 하나 때문에 메일이 안 나간다');
});

test('그림을 못 찾으면 표시를 지우고 보낸다', () => {
  assert.match(DEL, /stripSignMark\(/,
    '★ 안 지우면 받는 사람 화면에 깨진 그림 자리가 뜬다');
});
