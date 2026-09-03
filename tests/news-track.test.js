/* 뉴스레터 열람·클릭 추적 — 판단하는 층(functions/news-track.js)
   실행: node --test tests/*.test.js

   ★ 이 파일의 급소는 «열린 리다이렉트»다. 클릭 추적 주소가 목적지를 그대로 받으면
     누구나 우리 도메인으로 남을 속이는 링크를 만들 수 있다. 우리 주소라 받는 쪽이
     더 잘 믿는다는 점이 더 나쁘다. 그래서 번호만 싣고, 목록에 없으면 아무 데도
     보내지 않는다. 아래에서 그것을 못 박는다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../functions/news-track.js');

test('★ 목록에 없는 번호는 «어디로도» 안 보낸다 — 피싱 구멍을 막는다', () => {
  const 링크들 = ['https://www.labortoday.co.kr/a', 'https://www.law.go.kr/b'];
  assert.equal(T.링크찾기(링크들, 0), 'https://www.labortoday.co.kr/a');
  assert.equal(T.링크찾기(링크들, 1), 'https://www.law.go.kr/b');
  assert.equal(T.링크찾기(링크들, 2), '', '목록 밖 번호로 나갔습니다');
  assert.equal(T.링크찾기(링크들, -1), '', '음수 번호로 나갔습니다');
  assert.equal(T.링크찾기(링크들, 999), '', '큰 번호로 나갔습니다');
  assert.equal(T.링크찾기([], 0), '', '빈 목록에서 나갔습니다');
});

test('★ http/https 가 아니면 안 보낸다 — 목록에 잘못 들어가도 여기서 막는다', () => {
  assert.equal(T.링크찾기(['javascript:alert(1)'], 0), '', 'javascript: 가 통과했습니다');
  assert.equal(T.링크찾기(['data:text/html,<script>'], 0), '', 'data: 가 통과했습니다');
  assert.equal(T.링크찾기(['file:///c:/'], 0), '', 'file: 이 통과했습니다');
  assert.equal(T.링크찾기(['  https://ok.kr/x  '], 0), 'https://ok.kr/x', '앞뒤 빈칸을 못 다듬습니다');
});

test('★ 이상한 값에 터지지 않는다 — 메일 프로그램이 주소를 조금씩 바꿔 부른다', () => {
  assert.equal(T.읽기(null).ok, false);
  assert.equal(T.읽기({}).ok, false);
  assert.equal(T.읽기({ i: '2026-09-1' }).ok, false, '주소가 없는데 ok 입니다');
  assert.equal(T.읽기({ e: 'a@x.kr' }).ok, false, '회차가 없는데 ok 입니다');
  const r = T.읽기({ i: '2026-09-1', e: 'A@X.KR', n: '3' });
  assert.equal(r.ok, true);
  assert.equal(r.주소, 'a@x_kr', '주소를 자리 이름으로 못 바꿉니다');
  assert.equal(r.번호, 3);
  assert.equal(T.읽기({ i: 'a', e: 'b@c.kr', n: 'abc' }).번호, -1, '숫자가 아닌 번호를 그냥 씁니다');
  assert.equal(T.읽기({ i: 'a', e: 'b@c.kr', n: '-5' }).번호, -1);
});

test('★ 파이어베이스 열쇠에 못 쓰는 글자를 씻는다 — 안 씻으면 쓰다가 터진다', () => {
  assert.equal(T.주소열쇠('a.b@x.co.kr'), 'a_b@x_co_kr');
  assert.equal(T.주소열쇠('  A#B$C@x.kr  '), 'a_b_c@x_kr');
  assert.equal(T.회차열쇠('2026-09-1'), '2026-09-1');
  assert.equal(T.회차열쇠('a/b#c'), 'a_b_c');
});

test('적는 자리와 보냄 표가 «같은 뿌리»를 쓴다 — 따로 두면 한쪽만 남는다', () => {
  const 자리 = T.적을자리('2026-09-1', 'a.b@x.kr');
  assert.equal(자리, 'newsletter/opens/2026-09-1/a_b@x_kr');
  assert.equal(T.보냄표('2026-09-1', 'a.b@x.kr'), 자리 + '/보냄');
});

test('★ 편지에 넣을 주소에 {추적열쇠} 자리가 남아 있다 — 통마다 그 사람 것으로 바뀐다', () => {
  /* 편지 몸통은 «한 번만» 만들어지고, 보낼 때 통마다 fill() 이 바꿔 넣는다.
     여기서 실제 주소를 박으면 모두가 «같은 사람»으로 찍힌다. */
  const 밑 = 'https://asia-northeast3-pureun-erp.cloudfunctions.net';
  const 그림 = T.열람그림주소(밑, '2026-09-1');
  assert.match(그림, /\{추적열쇠\}/, '통마다 바뀔 자리가 없습니다');
  assert.match(그림, /^https:\/\//);
  assert.match(그림, /newsOpen\?i=2026-09-1/);

  const 클릭 = T.클릭주소(밑, '2026-09-1', 2);
  assert.match(클릭, /\{추적열쇠\}/);
  assert.match(클릭, /newsClick\?i=2026-09-1/);
  assert.match(클릭, /&n=2$/);
  /* ⚠ 목적지 주소가 실려서는 안 된다 */
  assert.ok(!/u=http/.test(클릭), '목적지 주소가 실렸습니다 — 피싱 구멍입니다');
});

test('밑주소 끝에 / 가 있어도 두 번 안 붙는다', () => {
  assert.match(T.열람그림주소('https://x.kr/', 'a'), /^https:\/\/x\.kr\/newsOpen/);
});

test('빈 그림이 진짜 GIF 다 — 메일 프로그램이 못 읽으면 열람이 안 찍힌다', () => {
  assert.equal(T.빈그림.slice(0, 3).toString('ascii'), 'GIF');
  assert.ok(T.빈그림.length < 100, '1×1 인데 너무 큽니다');
});
