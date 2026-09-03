'use strict';
/* 똑같은 줄이 여러 군데일 때 «몇 번째»를 사람이 골라 고친다 (대표 지시 2026-09-03)
 *   「자물쇄 같이 실물」 — 자물쇠로 막던 것을 «고를 수 있게» 바꾼다.
 *
 * ★ 왜 바꾸는가
 *   오시는길에서 실측하니 고칠 줄 20개 가운데 «10개»가 자물쇠였다.
 *   「천안본사」·「서산지사」·같은 메일 주소가 지사마다 되풀이되기 때문이다.
 *   절반을 못 고치는 화면은 쓸 수 없다.
 *
 * ★ 무엇을 지키나 — 짐작을 없앤 것이지 위험을 감수한 것이 아니다
 *   ① 몇 번째인지(n)와 모두 몇 군데인지(of)를 읽을 때 함께 들고 온다
 *   ② 고를 때는 «그 자리»를 정확히 짚는다 (앞뒤 줄을 건드리지 않는다)
 *   ③ 그 사이 홈페이지가 바뀌었으면(군데 수가 다르면) «채우지 않는다»
 *   ④ 안 고른 경우(n 없음)에는 예전 규칙 그대로 — 여러 군데면 건너뛴다
 *
 * 실행: node --test tests/*.test.js
 */
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

global.window = global;
require(path.join(__dirname, '..', 'js', 'pu-home-fill.js'));
const F = global.PuHomeFill;

/* 지사 넷이 같은 꼴로 되풀이되는 쪽 — 실물 오시는길과 같은 결이다 */
const 쪽 = [
  '<div class="a"><h3>천안본사</h3><p>충남 천안시 서북구 원두정8길 6</p>',
  '<p>T. 041-556-0035</p><p>E. 370-6@daum.net</p></div>',
  '<div class="b"><h3>서산지사</h3><p>충남 서산시 쌍연남1로 37</p>',
  '<p>T. 041-429-0123</p><p>E. 370-6@daum.net</p></div>',
  '<div class="c"><h3>천안본사</h3><p>같은 이름이 또 나온다</p></div>'
].join('');

/* ══════ ① 읽을 때 «몇 번째»를 들고 온다 ══════ */

test('★★ 되풀이되는 줄에 «몇 번째·모두 몇 군데»가 달린다 — 자물쇠가 아니다', () => {
  const runs = F.fixableRuns(쪽);
  const 본사 = runs.filter(r => r.text === '천안본사');
  assert.equal(본사.length, 2, '★ 「천안본사」를 두 군데로 못 봤다');
  assert.deepEqual(본사.map(r => r.n), [1, 2], '★★ 몇 번째인지를 안 달았다');
  assert.deepEqual(본사.map(r => r.of), [2, 2], '★★ 모두 몇 군데인지를 안 달았다');
  /* ★★ 이제 «잠기지 않는다» — 이것이 이 바꿈의 핵심이다 */
  assert.ok(본사.every(r => r.ok),
    '★★ 되풀이되는 줄이 아직 잠겨 있다 — 절반을 못 고치는 화면이 된다');
  const 메일 = runs.filter(r => r.text === 'E. 370-6@daum.net');
  assert.deepEqual(메일.map(r => r.n), [1, 2], '★ 메일 줄의 차례가 어긋났다');
  /* 한 군데뿐인 줄은 1번째·모두 1 */
  const 하나 = runs.find(r => r.text === 'T. 041-556-0035');
  assert.deepEqual([하나.n, 하나.of], [1, 1], '★ 한 군데뿐인 줄의 차례가 틀렸다');
});

/* ══════ ② 고른 자리를 «정확히» 짚는다 ══════ */

test('★★ 2번째를 고르면 «2번째만» 바뀐다 — 1번째는 그대로다', () => {
  const out = F.applyLineEdits(쪽, [{ before: '천안본사', after: '천안 본사(신관)', n: 2, of: 2 }]);
  assert.equal(out.done.length, 1, '★★ 안 채웠다: ' + JSON.stringify(out.skipped));
  const runs = F.fixableRuns(out.html);
  const 이름들 = runs.filter(r => /천안/.test(r.text)).map(r => r.text);
  assert.ok(이름들.includes('천안본사'), '★★ 1번째까지 바뀌었다 — 엉뚱한 자리를 짚었다');
  assert.ok(이름들.includes('천안 본사(신관)'), '★★ 2번째가 안 바뀌었다');
  /* 첫 덩이의 이름은 그대로여야 한다 */
  assert.match(out.html, /class="a"><h3>천안본사<\/h3>/, '★★ 첫 덩이를 건드렸다');
  assert.match(out.html, /class="c"><h3>천안 본사\(신관\)<\/h3>/, '★ 셋째 덩이가 안 바뀌었다');
});

test('★ 1번째를 고르면 1번째만 바뀐다', () => {
  const out = F.applyLineEdits(쪽, [{ before: '천안본사', after: '천안본점', n: 1, of: 2 }]);
  assert.equal(out.done.length, 1, '★ 안 채웠다');
  assert.match(out.html, /class="a"><h3>천안본점<\/h3>/, '★ 1번째가 안 바뀌었다');
  assert.match(out.html, /class="c"><h3>천안본사<\/h3>/, '★★ 2번째까지 바뀌었다');
});

test('★★ 같은 글의 여러 자리를 «한꺼번에» 고쳐도 서로 안 밀린다', () => {
  const out = F.applyLineEdits(쪽, [
    { before: 'E. 370-6@daum.net', after: 'E. cheonan@daum.net', n: 1, of: 2 },
    { before: 'E. 370-6@daum.net', after: 'E. seosan@daum.net', n: 2, of: 2 }
  ]);
  assert.equal(out.done.length, 2, '★★ 둘 다 안 채웠다: ' + JSON.stringify(out.skipped));
  assert.match(out.html, /class="a"[\s\S]*?cheonan@daum\.net/, '★★ 1번째가 엉뚱하다');
  assert.match(out.html, /class="b"[\s\S]*?seosan@daum\.net/, '★★ 2번째가 엉뚱하다');
  /* ★ 앞의 고침이 뒤의 차례를 밀지 않았는지 — 밀면 두 줄이 뒤바뀐다 */
  assert.ok(out.html.indexOf('cheonan@daum.net') < out.html.indexOf('seosan@daum.net'),
    '★★ 두 줄이 뒤바뀌었다');
});

/* ══════ ③ 그 사이 홈페이지가 바뀌면 «채우지 않는다» ══════ */

test('★★ 군데 수가 달라졌으면 «안 채우고» 왜인지 말한다', () => {
  /* 읽을 때는 두 군데였는데, 그 사이 누가 하나를 지웠다 */
  const 바뀐쪽 = 쪽.replace('<div class="c"><h3>천안본사</h3>', '<div class="c"><h3>천안지점</h3>');
  const out = F.applyLineEdits(바뀐쪽, [{ before: '천안본사', after: '천안 본사(신관)', n: 2, of: 2 }]);
  assert.equal(out.done.length, 0, '★★ 자리를 못 믿는데 채웠다 — 엉뚱한 줄을 덮는다');
  assert.equal(out.skipped.length, 1);
  assert.match(out.skipped[0].why, /바뀌었습니다|다시 읽어오/,
    '★ 왜 안 채웠는지 사람 말로 안 알려 준다: ' + out.skipped[0].why);
  /* 아무것도 안 건드렸는지 */
  assert.equal(out.html, 바뀐쪽, '★★ 안 채운다면서 글을 건드렸다');
});

test('★ 없는 차례를 고르면 «안 채우고» 왜인지 말한다', () => {
  const out = F.applyLineEdits(쪽, [{ before: '천안본사', after: '아무거나', n: 5 }]);
  assert.equal(out.done.length, 0, '★★ 없는 자리를 채웠다');
  assert.match(out.skipped[0].why, /군데뿐인데|다시 읽어오/, '★ 까닭을 안 알려 준다');
});

/* ══════ ④ 안 고른 경우는 «예전 그대로» ══════ */

test('★★ 몇 번째를 안 고르면 예전 규칙 그대로 — 여러 군데면 건너뛴다', () => {
  /* 즐겨찾기 단추(경력사항 채우기)는 n 을 안 보낸다 — 그 길이 안 바뀌어야 한다 */
  const out = F.applyLineEdits(쪽, [{ before: '천안본사', after: '아무거나' }]);
  assert.equal(out.done.length, 0,
    '★★ 안 골랐는데 기계가 짐작해서 채웠다 — 잘못 짚느니 안 채우는 것이 낫다');
  assert.match(out.skipped[0].why, /단정할 수 없|여러/, '★ 까닭이 다르다: ' + out.skipped[0].why);
});

test('★ 한 군데뿐인 줄은 골라도 안 골라도 채워진다', () => {
  const 안골라 = F.applyLineEdits(쪽, [{ before: 'T. 041-556-0035', after: 'T. 041-556-9999' }]);
  assert.equal(안골라.done.length, 1, '★ 안 골랐을 때 안 채웠다');
  const 골라 = F.applyLineEdits(쪽, [{ before: 'T. 041-556-0035', after: 'T. 041-556-9999', n: 1, of: 1 }]);
  assert.equal(골라.done.length, 1, '★ 골랐을 때 안 채웠다');
  assert.equal(안골라.html, 골라.html, '★ 두 길의 결과가 다르다');
});

test('★★ 채운 줄만 done 에 담기고, 앞뒤 빈칸·줄바꿈은 살아 있다', () => {
  const 들여쓴쪽 = '<p>\n    천안본사\n  </p><p>\n    천안본사\n  </p>';
  const out = F.applyLineEdits(들여쓴쪽, [{ before: '천안본사', after: '천안본점', n: 2, of: 2 }]);
  assert.equal(out.done.length, 1);
  /* 들여쓰기가 사라지면 사람이 홈페이지 편집기에서 볼 때 모양이 흐트러진다 */
  assert.match(out.html, /<p>\n {4}천안본사\n {2}<\/p>/, '★ 1번째의 들여쓰기가 깨졌다');
  assert.match(out.html, /<p>\n {4}천안본점\n {2}<\/p>/, '★★ 2번째의 들여쓰기가 깨졌다');
});
