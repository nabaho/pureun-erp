'use strict';
/* 서식 있는 본문(HTML) 로 보내기 — 실행: node --test tests/mail-html-body.test.js

   무엇이 문제였나 (대표 지시 2026-08-24 「다음 이메일 보내는 방식과 완전하게 같게」):
   쓰기 화면에 글꼴·크기·굵게·기울임 단추가 있는데 **받는 사람에게는 아무 영향이 없었다.**
   본문이 <textarea> 평문이고 서버가 `text:` 로만 보냈기 때문이다. 그 단추들은
   대표 화면의 글씨만 바꾸는 «가짜»였다. 다음메일은 서식을 실제로 보낸다.

   ★ 여기서 못 박는 것 — 메일은 한 번 나가면 되돌릴 수 없다
     ① 평문만 온 옛 요청은 «지금과 똑같이» 나간다 (예약해 둔 메일이 깨지면 안 된다)
     ② HTML 이 오면 평문 몫도 «같이» 보낸다 (서식을 못 읽는 메일 프로그램이 아직 있다)
     ③ 위험한 것은 서버가 지운다 — script·onclick·javascript: 는 절대 안 나간다
     ④ 허용한 서식만 남는다. 모르는 태그는 «글자는 살리고 태그만» 버린다
     ⑤ 본문이 비었는지는 «글자»로 판단한다 (<p><br></p> 는 빈 것이다)
     ⑥ 평문 몫은 HTML 에서 뽑아낸다 — 두 몫이 다른 말을 하면 안 된다 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const MS = require(path.join(ROOT, 'functions', 'mail-send.js'));
const DEL = fs.readFileSync(path.join(ROOT, 'functions', 'mail-deliver.js'), 'utf8');

/* ══════ ① 옛 요청은 하나도 안 달라진다 ══════ */

test('평문만 온 요청은 html 이 비어 있다 — 지금과 똑같이 나간다', () => {
  const v = MS.validateSend({ to:'a@b.com', subject:'제목', body:'안녕하세요\n푸른노무법인입니다' });
  assert.equal(v.ok, true);
  assert.equal(v.body, '안녕하세요\n푸른노무법인입니다');
  assert.equal(v.html, '', 'html 을 멋대로 만들면 옛 예약 메일의 모양이 바뀐다');
});

/* ══════ ② HTML 이 오면 평문도 같이 ══════ */

test('HTML 이 오면 평문 몫을 HTML 에서 뽑아낸다', () => {
  const v = MS.validateSend({ to:'a@b.com', subject:'제목',
    html:'<p>안녕하세요</p><p><b>푸른노무법인</b>입니다</p>' });
  assert.equal(v.ok, true);
  assert.ok(v.html.indexOf('<b>푸른노무법인</b>') >= 0, '서식이 사라졌다');
  assert.equal(v.body, '안녕하세요\n푸른노무법인입니다',
    '평문 몫이 없으면 서식을 못 읽는 프로그램에서 빈 편지가 된다');
});

test('보낸 쪽이 준 평문이 있으면 그것을 쓴다', () => {
  const v = MS.validateSend({ to:'a@b.com', subject:'제목',
    html:'<p>가</p>', body:'화면이 만든 평문' });
  assert.equal(v.body, '화면이 만든 평문');
});

test('<br> 과 문단은 줄바꿈이 된다', () => {
  assert.equal(MS.htmlToText('가<br>나<br><br>다'), '가\n나\n\n다');
  assert.equal(MS.htmlToText('<div>가</div><div>나</div>'), '가\n나');
  assert.equal(MS.htmlToText('<ul><li>가</li><li>나</li></ul>'), '가\n나');
});

test('글자 기호(&amp; 따위)는 원래 글자로 돌린다', () => {
  assert.equal(MS.htmlToText('&lt;주식&gt; A&amp;B&nbsp;회사 &quot;가&quot; &#39;나&#39;'),
    '<주식> A&B 회사 "가" \'나\'');
});

test('빈 줄이 셋 이상이면 둘로 줄인다 — 편집기가 빈 문단을 잔뜩 남긴다', () => {
  assert.equal(MS.htmlToText('가<br><br><br><br>나'), '가\n\n나');
});

/* ══════ ③ 위험한 것은 서버가 지운다 ══════ */

test('script·style 은 «안의 글자까지» 지운다', () => {
  const h = MS.sanitizeHtml('가<script>alert(1)</script>나<style>p{x:y}</style>다');
  assert.equal(h.indexOf('alert') , -1, 'script 안의 글자가 남았다');
  assert.equal(h.indexOf('p{x:y}'), -1, 'style 안의 글자가 남았다');
  assert.equal(h, '가나다');
});

test('onclick 같은 손잡이는 지운다', () => {
  const h = MS.sanitizeHtml('<p onclick="steal()" onmouseover="x()">가</p>');
  assert.equal(h.indexOf('onclick'), -1);
  assert.equal(h.indexOf('onmouseover'), -1);
  assert.ok(h.indexOf('가') > 0);
});

test('javascript: · data: 주소는 지운다', () => {
  for(const bad of ['javascript:alert(1)', 'JaVaScRiPt:x', 'data:text/html,<b>x', 'vbscript:x']){
    const h = MS.sanitizeHtml('<a href="' + bad + '">누르세요</a>');
    assert.equal(h.indexOf('href'), -1, bad + ' 가 남았다: ' + h);
    assert.ok(h.indexOf('누르세요') >= 0, '글자는 살려야 한다');
  }
});

test('http · https · mailto 주소는 남긴다', () => {
  for(const ok of ['https://pureun.kr', 'http://a.b', 'mailto:a@b.com']){
    assert.ok(MS.sanitizeHtml('<a href="' + ok + '">가</a>').indexOf(ok) > 0, ok + ' 가 지워졌다');
  }
});

test('style 에 url()·expression 이 있으면 그 style 만 버린다', () => {
  const h = MS.sanitizeHtml('<span style="color:red;background:url(http://x/a.png)">가</span>');
  assert.equal(h.indexOf('url('), -1, '바깥 그림을 불러오면 읽었는지 새 나간다');
  assert.ok(h.indexOf('가') > 0);
});

test('허용한 style 만 남는다', () => {
  const h = MS.sanitizeHtml('<span style="color:#c00;font-weight:700;position:fixed;z-index:9">가</span>');
  assert.ok(h.indexOf('color:#c00') > 0, '글자색이 지워졌다');
  assert.ok(h.indexOf('font-weight:700') > 0, '굵게가 지워졌다');
  assert.equal(h.indexOf('position'), -1, '자리 잡는 속성은 메일에서 위험하다');
  assert.equal(h.indexOf('z-index'), -1);
});

/* ══════ ④ 허용한 서식만 남고, 글자는 안 잃는다 ══════ */

test('다음메일 도구줄이 내는 태그는 다 남는다', () => {
  const src = '<b>굵게</b><i>기울임</i><u>밑줄</u><s>취소선</s>'
            + '<p style="text-align:center">가운데</p>'
            + '<ul><li>가</li></ul><ol><li>나</li></ol>'
            + '<font color="#ff0000" face="굴림" size="4">색</font>'
            + '<blockquote>인용</blockquote><hr>';
  const h = MS.sanitizeHtml(src);
  for(const t of ['<b>','<i>','<u>','<s>','<p','<ul>','<li>','<ol>','<font','<blockquote>','<hr']){
    assert.ok(h.indexOf(t) >= 0, t + ' 가 사라졌다: ' + h);
  }
  assert.ok(h.indexOf('text-align:center') > 0, '정렬이 사라졌다');
});

/* ⚠ 예전에는 <table> 을 「모르는 태그」의 보기로 썼다. 2026-09-02 에 표를 허용해
     (뉴스레터가 표로 짜인다) 보기가 낡았다 — 규칙은 그대로 두고 보기만 바꾼다.
     표가 «살아남는지»는 바로 아래 검사가 따로 본다. */
test('모르는 태그는 «글자는 살리고 태그만» 버린다', () => {
  const h = MS.sanitizeHtml('<marquee>흐름</marquee><details><summary>접힘</summary>속</details>');
  assert.equal(h.indexOf('<marquee'), -1);
  assert.equal(h.indexOf('<details'), -1);
  assert.equal(h.indexOf('<summary'), -1);
  assert.ok(h.indexOf('흐름') >= 0, '글자를 잃으면 편지 내용이 사라진다');
  assert.ok(h.indexOf('접힘') >= 0);
  assert.ok(h.indexOf('속') >= 0);
});

test('img 는 버린다 — 첨부로 보내는 것이 우리 방식이다', () => {
  const h = MS.sanitizeHtml('가<img src="http://x/a.png">나');
  assert.equal(h.indexOf('<img'), -1);
  assert.equal(h, '가나');
});

test('닫는 태그도 짝을 맞춰 남는다', () => {
  assert.equal(MS.sanitizeHtml('<b>가</b>'), '<b>가</b>');
});

/* ══════ ⑤ 빈 껍데기는 «글자»로 판단한다 ══════ */

test('서식만 있고 글자가 없으면 빈 본문이다', () => {
  for(const empty of ['<p><br></p>', '<div><br></div>', '<p>&nbsp;</p>', '<br><br>']){
    const v = MS.validateSend({ to:'a@b.com', subject:'제목', html:empty });
    assert.equal(v.ok, false, empty + ' 를 내용 있는 편지로 봤다');
    assert.match(v.error, /본문/);
  }
});

test('글자가 한 자라도 있으면 보낸다', () => {
  assert.equal(MS.validateSend({ to:'a@b.com', subject:'제목', html:'<p>가</p>' }).ok, true);
});

/* ══════ 보내는 층에 어떻게 붙었나 ══════ */

test('서식이 있으면 html 몫과 평문 몫을 «같이» 보낸다', () => {
  /* 2026-08-24 서명 명함 사진이 붙으면서 v.html 이 signHtml 을 한 번 거친다
     (그림을 못 찾으면 표시를 지운 것). 그래도 «보내는 값의 출발점은 v.html»이어야 한다. */
  assert.match(DEL, /let signHtml = v\.html/,
    '★ 보내는 서식이 validateSend 가 씻어 준 v.html 에서 나와야 한다');
  assert.match(DEL, /html:\s*signHtml\s*\|\|\s*undefined/,
    '★ html 을 안 넘기면 서식이 그대로 버려진다');
  assert.match(DEL, /text:\s*v\.body/,
    '★ 평문 몫을 빼면 서식을 못 읽는 프로그램에서 빈 편지가 된다');
});

test('첨부 크기 셈에 본문 크기도 들어간다 — 서식은 글자보다 무겁다', () => {
  const v = MS.validateSend({ to:'a@b.com', subject:'제목', html:'<p>가</p>' });
  assert.equal(typeof v.bytes, 'number');
});
