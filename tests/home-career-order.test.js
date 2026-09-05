'use strict';
/* 경력 당겨오기 — «최근 것부터» 놓는다 (대표 지시 2026-09-03)
 *   「경력관리는 최근기간 순서로 정리해달라」
 *
 * ■ 무엇이 나빴나
 *   자료가 «담은 차례»대로 나왔다. 화면 실측(권형하 위촉장 103건):
 *     2026.04.29 · 2026.07.30 · 2026.04.01 · 2026.08.14 · 2026.03.24 …
 *   103건이 이렇게 뒤섞이면 무엇이 요즘 것인지 눈으로 못 고른다.
 *
 * ■ 이 검사가 지키는 것
 *   ① 최근 시작한 것이 위로
 *   ② 날짜 없는 것은 «맨 뒤»에, 담은 차례 그대로 (강의·수료증에 흔하다)
 *   ③ 날짜를 «표시 글 하나»에서만 읽는다 (보이는 날짜와 줄 세운 날짜가 갈리면 안 된다)
 *   ④ 차례를 «자료를 받을 때» 정한다 — 그릴 때 정하면 체크 번호가 어긋난다
 *
 * 실행: node --test tests/*.test.js
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const R = path.join(__dirname, '..');
const RAW = fs.readFileSync(path.join(R, 'pu-home.html'), 'utf8');

/* 주석을 걷은 뒤 함수를 찾되, 자를 자리는 원본에서 잡는다 */
function 알맹이(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}
const H = 알맹이(RAW);

function 꺼내기(이름) {
  const i = RAW.search(new RegExp('^function ' + 이름 + '\\s*\\(', 'm'));
  assert.ok(i >= 0, '★ ' + 이름 + ' 을 못 찾았다');
  let j = RAW.indexOf('\nfunction ', i + 5);
  return RAW.slice(i, j < 0 ? RAW.length : j);
}

/* 차례를 정하는 부품만 떼어 «실제로» 돌린다 */
function 상자() {
  const c = {
    String, Object, Number, Array, Math, JSON, RegExp,
    /* 표시 글은 이 갈래 규칙대로 — 실물 CAREER_KINDS 를 흉내내지 않고 «그 자리»만 받는다 */
    itemWhen: (it) => String((it && it.when) == null ? '' : it.when).trim()
  };
  vm.createContext(c);
  vm.runInContext(꺼내기('날짜숫자') + '\n' + 꺼내기('기간숫자') + '\n' + 꺼내기('경력차례'), c);
  return c;
}
const M = 상자();

const 건 = (when) => ({ when: when });

test('★★ 날짜를 숫자로 옮긴다 — 점·붙임표·한글 어느 꼴이든', () => {
  assert.equal(M.날짜숫자('2026.04.29'), 20260429);
  assert.equal(M.날짜숫자('2026-4-9'), 20260409);
  assert.equal(M.날짜숫자('2026.04'), 20260400, '★ 달까지만 있으면 그날은 0');
  assert.equal(M.날짜숫자('2026'), 20260000);
  assert.equal(M.날짜숫자('2026년 3월 4일'), 20260304);
  assert.equal(M.날짜숫자(''), 0, '★ 날짜가 없으면 0 이어야 뒤로 간다');
  assert.equal(M.날짜숫자(null), 0);
});

test('★★★ 최근 시작한 것이 «위»로 온다 — 화면에서 본 그 뒤섞임을 그대로 넣어 본다', () => {
  /* 실측 차례 그대로다(권형하 위촉장 앞부분) */
  const 넣은것 = {
    wiccok: [
      건('2026.04.29 ~ 2026.11.30'),
      건('2026.07.30 ~ 2028.07.29'),
      건('2026.04.01'),
      건('2026.08.14 ~ 2026.12.31'),
      건('2026.03.24'),
      건('2025.12.31'),
      건('2019.05.01 ~ 2020.02.29')
    ]
  };
  const 나온것 = M.경력차례(넣은것).wiccok.map(x => x.when);
  assert.deepEqual(nonProto(나온것), [
    '2026.08.14 ~ 2026.12.31',
    '2026.07.30 ~ 2028.07.29',
    '2026.04.29 ~ 2026.11.30',
    '2026.04.01',
    '2026.03.24',
    '2025.12.31',
    '2019.05.01 ~ 2020.02.29'
  ], '★★★ 최근 것이 위로 안 왔다');
  /* 넣은 것은 «안 건드린다» — 원본을 뒤집으면 다른 화면이 함께 흔들린다 */
  assert.equal(넣은것.wiccok[0].when, '2026.04.29 ~ 2026.11.30',
    '★★ 넣어 준 목록을 제자리에서 뒤집었다');
});

test('★★ 날짜 없는 것은 «맨 뒤»에, 담은 차례 그대로', () => {
  /* 강의·수료증에는 날짜가 빈 것이 흔하다. 위로 올리면 「왜 이게 먼저지」가 된다. */
  const 나온것 = M.경력차례({
    lecture: [건(''), 건('2024.05.01'), 건(''), 건('2026.01.01')]
  }).lecture.map(x => x.when);
  assert.deepEqual(nonProto(나온것), ['2026.01.01', '2024.05.01', '', ''],
    '★★ 날짜 없는 것이 뒤로 안 갔거나 차례가 섞였다');
});

test('★ 같은 날 시작하면 «늦게 끝나는 것»이 위로', () => {
  const 나온것 = M.경력차례({
    wiccok: [건('2026.03.01 ~ 2026.06.30'), 건('2026.03.01 ~ 2027.06.30')]
  }).wiccok.map(x => x.when);
  assert.equal(나온것[0], '2026.03.01 ~ 2027.06.30');
});

test('★ 배열이 아닌 것이 섞여 와도 안 터진다', () => {
  const r = M.경력차례({ wiccok: null, edu: [건('2015.02')] });
  assert.equal(r.wiccok, null, '★ 배열 아닌 것을 억지로 만지지 않는다');
  assert.equal(r.edu.length, 1);
});

/* ══════ 이어 붙인 자리 ══════ */

test('★★★ 자료가 들어오는 «모든» 자리에서 차례를 정한다', () => {
  /* 한 자리만 빠뜨리면 그 길로 들어온 것만 뒤섞여 나온다 — 어느 길인지 사람은 모른다.
     (내 것은 이 브라우저에서, 남의 것은 클라우드에서, 못 읽으면 공개 명부에서 온다.) */
  const 남은 = (H.match(/Pull\.items = (?!경력차례|\{\})[^;]+;/g) || []);
  assert.deepEqual(nonProto(남은), [],
    '★★★ 차례를 안 정하고 담는 자리가 있다: ' + 남은.join(' / '));
  const 정한곳 = (H.match(/Pull\.items = 경력차례\(/g) || []).length;
  assert.ok(정한곳 >= 4, '★★ 이은 자리가 ' + 정한곳 + '군데뿐이다 — 넷이어야 한다');
});

test('★★★ 차례를 «자료를 받을 때» 정한다 — 그릴 때 정하면 체크 번호가 어긋난다', () => {
  /* 고른 것은 kind:i 로 붙든다. 그리기 때마다 줄을 세우면 그 i 가 다른 건을 가리킨다 —
     체크한 것과 들어가는 것이 달라지는데 화면으로는 알 수 없다. */
  const i = H.indexOf('function renderPull');
  assert.ok(i > 0, '★ renderPull 을 못 찾았다');
  let j = H.indexOf('\nfunction ', i + 5);
  const 그리개 = H.slice(i, j < 0 ? H.length : j);
  assert.ok(그리개.indexOf('경력차례') < 0,
    '★★★ 그릴 때마다 줄을 세운다 — 체크한 것과 들어가는 것이 달라진다');
});

/* vm 밖으로 나온 배열은 «다른 realm» 이라 deepEqual 이 밑틀까지 본다 — 값만 견준다 */
function nonProto(a) { return JSON.parse(JSON.stringify(a)); }
