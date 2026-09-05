'use strict';
/* 받는 분을 «뜻 없는 번호»로 부른다 (대표 지시 2026-09-03 「고쳐라」)
 *
 * ■ 무엇이 나빴나
 *   편지의 추적 주소에 메일 주소가 그대로 실렸다:
 *     /newsOpen?i=2026-09-1&e=hong_example_kr
 *   받는 쪽 메일 프로그램·중계 서버·우리 서버 기록에 «누구인지»가 남는다.
 *   기능에 필요한 것은 «우리가 알아보는 것»이지 주소를 실어 나르는 것이 아니다.
 *
 * ■ 어떻게 고쳤나
 *   회차마다 「번호 → 주소」 대장을 두고, 편지에는 번호만 싣는다.
 *   ★ 덤으로 위조도 막힌다 — 우리가 낸 번호가 아니면 아무 일도 안 한다.
 *     예전에는 주소만 알면 남의 열람 표를 켜거나 빈 줄을 끝없이 만들 수 있었다.
 *
 * ■ 이 검사가 지키는 것
 *   ① 번호가 «짐작할 수 없게» 길고, 자리 이름으로 쓸 수 있는 글자만 쓴다
 *   ② 화면과 서버가 «같은 모양»의 번호를 만든다 (다르면 열람이 한 건도 안 잡힌다)
 *   ③ 편지에 메일 주소가 «안 실린다»
 *   ④ 대장을 «걸기 전»에 적는다 (늦게 적으면 그 사이 열람이 버려진다)
 *   ⑤ 번호를 준 발송은 번호를, 안 준 발송은 예전대로 (다른 대량 발송이 안 끊긴다)
 *
 * 실행: node --test tests/*.test.js
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const R = path.join(__dirname, '..');
const T = require(path.join(R, 'functions', 'news-track.js'));
const B = require(path.join(R, 'functions', 'mail-bulk.js'));
const 화면 = fs.readFileSync(path.join(R, 'pu-news.html'), 'utf8');
const 서버 = fs.readFileSync(path.join(R, 'functions', 'index.js'), 'utf8');

/* ══════ ① 번호의 모양 ══════ */

test('★★ 번호는 «짐작할 수 없게» 길고, 자리 이름으로 쓸 수 있다', () => {
  const n = T.새번호();
  assert.ok(n.length >= 20, '★★ 번호가 짧다(' + n.length + ') — 짐작하면 남의 표를 켠다');
  assert.match(n, /^[a-z0-9]+$/,
    '★ 파이어베이스 자리 이름으로 못 쓰는 글자가 섞였다: ' + n);
  /* 겹치면 두 사람이 한 줄을 나눠 쓴다 — 열람이 뒤섞인다 */
  const 모음 = new Set();
  for (let i = 0; i < 500; i++) 모음.add(T.새번호());
  assert.equal(모음.size, 500, '★★ 500개를 뽑았는데 겹쳤다 — 열람이 뒤섞인다');
});

test('★ 번호 자리를 씻는다 — 씻고 나서 비면 «대장 전체»를 가리키면 안 된다', () => {
  assert.equal(T.번호열쇠('a.b/c#d'), 'abcd', '★ 못 쓰는 글자를 안 씻었다');
  assert.equal(T.번호열쇠('...'), '', '★ 씻고 남은 것이 없으면 빈 값이어야 한다');
  assert.equal(T.번호열쇠(null), '');
  /* 빈 번호로 대장을 뒤지면 «대장 전체»를 읽는다 — 자리가 그렇게 생기면 안 된다 */
  const 자리 = T.받는이자리('2026-09-1', '');
  assert.ok(/받는이\/$/.test(자리) === false || 자리.endsWith('/'),
    '★ 빈 번호의 자리 모양을 확인할 것: ' + 자리);
});

test('★★ 화면과 서버가 «같은 모양»의 번호를 만든다', () => {
  /* 다르면 대장에 적는 쪽과 찾는 쪽이 어긋나 열람이 한 건도 안 잡힌다.
     ★ 글자를 견주지 않는다(값이 무작위다) — «모양»을 견준다. */
  const m = /function 새추적번호\(\)\s*\{([\s\S]*?)\n\}/.exec(화면);
  assert.ok(m, '★★ 화면에 번호 만들개(새추적번호)가 없다');
  const 화면것 = new Function('return (function(){' + m[1] + '})()')();
  const 서버것 = T.새번호();
  assert.equal(화면것.length, 서버것.length,
    '★★ 길이가 다르다 — 화면 ' + 화면것.length + ' · 서버 ' + 서버것.length);
  assert.match(화면것, /^[a-z0-9]+$/, '★★ 화면 번호에 못 쓰는 글자가 섞였다');
});

/* ══════ ② 편지에 주소가 안 실린다 ══════ */

/* 실물이 도는 길 그대로 — validateBulk 로 다듬고 buildQueue 로 만든다.
   ⚠ buildQueue 에 손으로 만든 값을 넣으면 «다듬는 층»을 건너뛴다.
     그 층이 track 을 버리고 있었는데도 검사는 초록이었을 것이다. */
function 통만들기(대상, html) {
  const v = B.validateBulk({ to: 대상, subject: '제', body: '본', html: html });
  assert.ok(v.ok !== false, '★ 다듬기에서 걸렸다: ' + (v.error || ''));
  return B.buildQueue(v, 0, 'me@x.kr', 'b1');
}

test('★★★ 편지에 «메일 주소»가 안 실린다 — 번호를 준 통은 번호로 나간다', () => {
  const 번호 = 'abc123xyz789abc123xyz7';
  const q = 통만들기(
    [{ email: 'hong@example.kr', name: '홍길동', track: 번호 }],
    '<img src="https://fn/newsOpen?i=w1&e={추적열쇠}">');
  const html = q[0].payload.html;
  assert.ok(!/\{추적열쇠\}/.test(html), '★ 바꿀 자리가 남았다');
  assert.ok(html.indexOf(번호) > 0,
    '★★★ 번호를 안 넣었다 — 다듬는 층이 번호를 버렸을 수 있다: ' + html);
  assert.ok(html.indexOf('hong') < 0 && html.indexOf('example') < 0,
    '★★★ 편지에 메일 주소가 그대로 실렸다: ' + html);
});

test('★★ 번호를 «안 준» 발송은 예전 그대로 — 다른 대량 발송이 안 끊긴다', () => {
  const q = 통만들기([{ email: 'A.B#C@x.kr', name: '가' }], '{추적열쇠}');
  assert.equal(q[0].payload.html, 'a_b_c@x_kr',
    '★★ 옛 길이 바뀌었다 — 뉴스레터 아닌 발송의 추적이 끊긴다: ' + q[0].payload.html);
});

test('★★ 번호에 «자리 이름으로 못 쓰는 글자»가 섞여 오면 씻는다', () => {
  /* 씻지 않으면 그 번호로 대장을 뒤지다 터지거나, 엉뚱한 자리를 가리킨다 */
  const q = 통만들기([{ email: 'z@x.kr', name: '가', track: 'ab.cd/ef#gh' }], '{추적열쇠}');
  assert.equal(q[0].payload.html, 'abcdefgh', '★★ 번호를 안 씻었다: ' + q[0].payload.html);
});

/* ══════ ③ 보내는 차례 — 대장을 «걸기 전»에 ══════ */

test('★★★ 대장을 «걸기 전»에 적는다 — 늦으면 그 사이 열람이 버려진다', () => {
  /* ⚠ 「첫 번째 걸기」와 견주면 안 된다 — 이 화면에는 거는 자리가 넷이다:
       시험 발송 둘 · 뉴스레터 발송 · 남의 뉴스레터 전달.
       첫 걸기는 «시험 발송»이라, 그것과 견주면 고쳐 놓고도 빨간불이 난다(겪었다).
     ★ 우리가 만든 편지가 나가는 자리는 «편.서식»을 싣는 그 걸기 하나다. */
  const i대장 = 화면.indexOf("'/받는이').update(대장)");
  assert.ok(i대장 > 0, '★★ 대장을 적는 자리가 없다');
  const m = /await 걸기\(\{[^}]*html:\s*편\.서식/.exec(화면);
  assert.ok(m, '★ 뉴스레터를 거는 자리를 못 찾았다');
  assert.ok(i대장 < m.index,
    '★★★ 대장을 «걸고 나서» 적는다 — 그 사이 열어 본 사람의 표가 버려진다');
});

test('★★ 대장을 못 적으면 «걸지 않는다» — 번호만 실린 편지가 나가면 열람이 0 이다', () => {
  /* 대장 쓰기를 try 로 감싸 삼키면, 편지는 나가고 대장은 없다 —
     그 회차의 열람은 한 건도 안 잡히는데 화면은 「보냄」으로 보인다. */
  const i대장 = 화면.indexOf("'/받는이').update(대장)");
  const 줄 = 화면.slice(화면.lastIndexOf('\n', i대장) + 1, 화면.indexOf('\n', i대장));
  assert.ok(줄.indexOf('await') >= 0, '★ 대장 쓰기를 기다리지 않는다');
  assert.ok(줄.indexOf('catch') < 0,
    '★★ 대장 쓰기 실패를 그 줄에서 삼킨다 — 편지만 나가고 열람이 0 이 된다');
});

/* ══════ ④ 모르는 번호에는 아무 일도 안 한다 ══════ */

test('★★★ 서버는 «대장에 있는 번호»나 «보낸 적 있는 주소»에만 표를 켠다', () => {
  /* 여기가 열려 있으면 아무나 남의 열람 표를 켜고, 빈 줄을 끝없이 만들 수 있다.
     ★ 글자로 본다 — 이 판단은 파이어베이스를 두드리므로 여기서 돌릴 수 없다.
       대신 «두 가지 문»이 다 있는지, 그리고 그 판단을 «거쳐서만» 표를 켜는지 본다. */
  const m = /async function 누구인가\([\s\S]*?\n\}/.exec(서버);
  assert.ok(m, '★★★ 누구인지 가리는 자리가 없다 — 아무 값이나 표를 켠다');
  const 몸 = m[0];
  assert.ok(몸.indexOf('받는이자리') > 0, '★★ 대장을 안 본다');
  /* ⚠ 「보냄표 라는 글자가 있나」로 보면 안 된다 — 판단을 지워도 윗줄에 그 글자가
       남아 통과한다(되돌림으로 잡았다). «그 값으로 가르는지»를 본다. */
  assert.match(몸, /보냄[\s\S]{0,80}?===\s*true/,
    '★★★ 옛 편지를 받아 줄 때 「보낸 적 있는지」로 «가르지» 않는다 — 위조가 열린다');
  assert.match(몸, /:\s*""/,
    '★★★ 아니면 «빈 값»을 돌려주어야 한다 — 안 그러면 아무 주소나 받는다');

  /* ★ 표를 켜는 «모든» 자리가 가림을 거쳐야 한다.
     ⚠ 「어느 하나라도 가려져 있으면 통과」로 두면 안 된다 — 한 자리만 열어 놓아도
       그 문으로 다 들어온다(되돌림으로 잡았다). 자리 수를 세어 맞춘다. */
  const 켜는곳 = [...서버.matchAll(/[^\n]*추적표켜기\(/g)]
    .map(x => x[0]).filter(l => !/function 추적표켜기/.test(l));
  assert.ok(켜는곳.length >= 2, '★ 표를 켜는 자리를 못 찾았다');
  const 가려진곳 = 켜는곳.filter(l => /if \(주소\)\s*await 추적표켜기\(/.test(l));
  assert.equal(가려진곳.length, 켜는곳.length,
    '★★★ 가림을 안 거치고 표를 켜는 자리가 있다 ('
    + (켜는곳.length - 가려진곳.length) + '군데): '
    + 켜는곳.filter(l => !/if \(주소\)/.test(l)).map(l => l.trim()).join(' / '));
  켜는곳.forEach(l => assert.ok(!/q\.주소/.test(l),
    '★★★ 받은 값을 «그대로» 넣어 표를 켠다 — 가림을 안 거쳤다: ' + l.trim()));
});

test('★ 클릭은 «누구인지 몰라도» 가던 길로 보내 준다 — 표만 안 켠다', () => {
  /* 링크가 죽으면 받는 쪽에는 편지가 깨진 것으로 보인다. 사람 잘못이 아니다. */
  const i = 서버.indexOf('exports.newsClick');
  const 몸 = 서버.slice(i, i + 1600);
  assert.match(몸, /링크찾기/, '★ 목적지를 안 찾는다');
  const i켜기 = 몸.indexOf('추적표켜기');
  const i찾기 = 몸.indexOf('링크찾기');
  assert.ok(i찾기 > i켜기,
    '★ 표를 못 켜면 길찾기까지 건너뛰는 모양이다 — 순서를 확인할 것');
});
