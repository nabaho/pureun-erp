/* 기업 상세 — ① 고른 회사의 폴더·탭 비우기 ② 옆줄에 두 곳이 동시에 켜져 보이던 것.
   실행: node --test tests/*.test.js

   대표 지시 2026-08-16
     "여기서 삭제기능 만들어 달라" → 물어보니 «명함을 지우는 것이 아니라» 붙여 둔
     폴더·탭을 떼는 것이었다. 회사는 따로 저장된 기록이 아니라 명함·등록증을 모아
     만든 화면이라, 여기서 지울 수 있는 것은 «붙여 둔 것»뿐이다.
     "왜 명함과 기업상세가 한번에 같이 열린것 처럼보이는가"
       → 기업 상세는 갈래(state.tab)가 아니라 화면(state.view)이라, 그 화면에 있어도
         state.tab 은 'card' 로 남는다. 조건에서 화면을 안 빼서 둘 다 켜져 보였다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'pu-cards.html'), 'utf8').replace(/\r\n/g, '\n');

function load(){
  const a = '/* ══════ 고른 회사의 폴더·탭 비우기 — 순수 로직 (테스트 대상) ══════';
  const b = '/* ══════ 고른 회사의 폴더·탭 비우기 — 화면 ══════ */';
  const i = src.indexOf(a), j = src.indexOf(b);
  assert.ok(i >= 0 && j > i, '표식을 못찾음');
  const ctx = { console, Object, Array, String, Number, Math };
  vm.createContext(ctx);
  vm.runInContext(src.slice(i, j) + '\nthis.__CHUNK = CO_CLEAR_CHUNK; this.__MIN = CO_CLEAR_TYPE_MIN;', ctx);
  return ctx;
}

const co = (key, o) => Object.assign({ key: key, name: '회사' + key, nameKey: 'n회사' + key,
  folder: '', tagCount: 0 }, o || {});

/* ══════ ① 얼마나 비워지는지 먼저 센다 ══════ */

test('폴더나 탭이 붙은 회사만 센다 — 아무것도 안 붙은 것을 세면 사람이 헷갈린다', () => {
  const C = load();
  const s = C.coClearStats([co('a', { folder: 'f1' }), co('b'), co('c', { tagCount: 2 })]);
  assert.equal(s.n, 2, '실제로 바뀌는 것은 두 곳이다');
  assert.equal(s.total, 3, '고른 것은 세 곳이다');
});

test('폴더 수와 탭 수를 따로 센다', () => {
  const C = load();
  const s = C.coClearStats([co('a', { folder: 'f1', tagCount: 3 }), co('b', { folder: 'f2' })]);
  assert.equal(s.folders, 2);
  assert.equal(s.tags, 3);
  assert.equal(s.n, 2);
});

test('한 회사에 폴더와 탭이 둘 다 있어도 한 곳으로 센다', () => {
  const C = load();
  assert.equal(C.coClearStats([co('a', { folder: 'f1', tagCount: 5 })]).n, 1);
});

test('아무것도 안 붙었으면 0 — 화면은 이때 아무 일도 하지 않는다', () => {
  const C = load();
  assert.equal(C.coClearStats([co('a'), co('b')]).n, 0);
});

test('빈 목록·이상한 값에도 터지지 않는다', () => {
  const C = load();
  assert.equal(C.coClearStats([]).n, 0);
  assert.equal(C.coClearStats(null).n, 0);
  assert.equal(C.coClearStats([null, undefined, co('a', { tagCount: -3 })]).n, 0, '음수 탭을 세면 안 된다');
});

/* ══════ ② 보낼 통 만들기 ══════ */

test('폴더와 탭만 비운다 — 다른 칸은 절대 안 건드린다', () => {
  /* 서식에서 읽은 회사 정보(대표자·주소 등)까지 지우면 «지운 적 없는 것»이 사라진다. */
  const C = load();
  const upd = C.coClearPlan([co('a', { folder: 'f1' })], 400)[0];
  const tails = Object.keys(upd).map(k => k.split('/').pop()).sort();
  /* 2026-08-16 폴더 안 탭(ftabs)이 생기면서 함께 뗀다 — 반쯤 비우면 탭만 남는다 */
  assert.deepEqual([...new Set(tails)].sort(), ['folder', 'ftabs', 'tags']);
});

test('비우는 값은 null 이다 — 빈 글자를 넣으면 값이 남는다', () => {
  const C = load();
  const upd = C.coClearPlan([co('a')], 400)[0];
  Object.keys(upd).forEach(k => assert.equal(upd[k], null, k));
});

test('옛 이름 열쇠도 함께 비운다 — 안 그러면 비웠는데 그대로 보인다', () => {
  /* coEffectiveExtra 가 옛 열쇠 값을 끌어와 합쳐 보여준다(coMoveSelTo 와 같은 이유). */
  const C = load();
  const upd = C.coClearPlan([{ key: '2148205236', name: '한빛기계', nameKey: 'n한빛기계' }], 400)[0];
  assert.ok('coInfo/2148205236/folder' in upd, '새 열쇠를 안 비운다');
  assert.ok('coInfo/n한빛기계/folder' in upd, '옛 이름 열쇠를 안 비운다');
  assert.ok('coInfo/n한빛기계/tags' in upd);
});

test('열쇠가 이름 열쇠와 같으면 두 번 쓰지 않는다', () => {
  const C = load();
  const upd = C.coClearPlan([{ key: 'n한빛', name: '한빛', nameKey: 'n한빛' }], 400)[0];
  assert.equal(Object.keys(upd).length, 3, '같은 자리를 두 번 적었다');
});

test('4,138곳을 400곳씩 묶으면 11통 — 한 곳씩 보내면 4,138번이다', () => {
  const C = load();
  const list = Array.from({ length: 4138 }, (_, i) => co('k' + i));
  assert.equal(C.coClearPlan(list, 400).length, 11);
});

test('열쇠가 없는 것은 조용히 건너뛴다 — 엉뚱한 자리를 비우면 안 된다', () => {
  const C = load();
  const plan = C.coClearPlan([null, { name: '이름만' }, co('a')], 400);
  assert.equal(plan.length, 1);
  assert.equal(new Set(Object.keys(plan[0]).map(k => k.split('/')[1])).size, 2, 'a 와 그 옛 열쇠뿐이어야 한다');
});

test('비울 것이 없으면 한 통도 안 보낸다', () => {
  const C = load();
  assert.equal(C.coClearPlan([], 400).length, 0);
  assert.equal(C.coClearPlan(null, 400).length, 0);
});

test('묶음 크기가 헛값이어도 무한 반복에 빠지지 않는다', () => {
  const C = load();
  assert.ok(C.coClearPlan([co('a'), co('b')], 0).length >= 1);
  assert.ok(C.coClearPlan([co('a'), co('b')], -5).length >= 1);
});

/* ══════ ③ 화면에 걸린 방식 ══════ */

test('20곳 넘으면 손으로 「비우기」를 치게 한다 (대표 선택 2026-08-16)', () => {
  const C = load();
  assert.equal(C.__MIN, 20);
  const i = src.indexOf('async function coClearOrg()');
  const fn = src.slice(i, src.indexOf('async function coMoveSelTo', i));
  assert.match(fn, /prompt\(/, '많이 고를 때 손으로 확인받지 않는다');
  assert.match(fn, /!=='비우기'/, '치는 말이 하는 일과 달라선 안 된다');
  assert.match(fn, /confirm\(/, '적게 고를 때도 한 번은 물어야 한다');
});

test('명함을 지우지 않는다고 확인창에 «적어» 준다', () => {
  const i = src.indexOf('async function coClearOrg()');
  const fn = src.slice(i, src.indexOf('async function coMoveSelTo', i));
  assert.match(fn, /명함과 사업자등록증은 지워지지 않습니다/);
  assert.ok(!/Store\.del\(/.test(fn), '명함을 지우는 길이 섞여 들어갔다');
});

test('막대에 단추가 걸려 있고, 이름이 하는 일과 같다', () => {
  assert.ok(src.includes('coClearOrg()'), '단추가 없다');
  assert.ok(src.includes('🧹 폴더·탭 비우기'), '이름이 「삭제」면 명함이 지워지는 줄 안다');
});

/* ══════ ④ 옆줄에 켜지는 것은 하나뿐 ══════ */

test('기업 상세를 보는 중에는 명함·사업자가 안 켜진다', () => {
  const i = src.indexOf('const onMail = (state.view');
  const fn = src.slice(i, src.indexOf('</div></div>`;', i));
  assert.match(fn, /const onCo = \(state\.view==='co'\)/, '화면을 가리는 값이 없다');
  assert.match(fn, /!onMail&&!onCo&&state\.tab==='card'/, '명함이 기업 상세와 같이 켜진다');
  assert.match(fn, /!onMail&&!onCo&&state\.tab==='biz'/, '사업자가 기업 상세와 같이 켜진다');
});

test('네 단추의 켜짐 조건이 서로 겹치지 않는다', () => {
  /* 조건을 실제로 돌려 본다 — 어떤 상태에서도 켜지는 것은 하나여야 한다. */
  const on = (view, tab) => {
    const onMail = (view === 'mail' || view === 'mat');
    const onCo = (view === 'co');
    return [onMail, !onMail && !onCo && tab === 'card', !onMail && !onCo && tab === 'biz', onCo]
      .filter(Boolean).length;
  };
  [['list', 'card'], ['list', 'biz'], ['mail', 'card'], ['mat', 'biz'],
   ['co', 'card'], ['co', 'biz'], ['settings', 'card']].forEach(([v, t]) => {
    assert.ok(on(v, t) <= 1, v + '/' + t + ' 에서 ' + on(v, t) + '개가 켜진다');
  });
});
