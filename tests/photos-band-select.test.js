/* 쓸어서 고르기 — 마우스로 훑어 한 번에 체크·해제 (대표 지시 2026-08-10)
   "마우스 드래그로 한번에 다 체크하고 체크해제 할 수 있게 해줘"

   ⚠ 이 기능에서 가장 위험한 것은 **기존 손짓을 잡아먹는 것**이다.
     · 칸을 끄는 것은 이미 「옮기기」다(분류·폴더·다른 앱). 띠가 이걸 먹으면 안 된다.
     · 폰에서 쓰는 것은 「화면 넘기기」다. 켜면 사진첩을 못 내린다.
     · 빈 곳을 한 번 눌렀다고 골라 둔 99장이 날아가면 안 된다.
   그래서 검사도 「골라진다」보다 **「엉뚱한 것을 안 건드린다」**를 더 본다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'pu-photos.html'), 'utf8');

function fn(name) {
  const m = app.match(new RegExp('function ' + name + '\\([\\s\\S]*?\\r?\\n\\}'));
  assert.ok(m, name + ' 을 찾을 수 없습니다');
  return m[0];
}

/* ── 기존 손짓을 안 잡아먹는다 (이쪽이 더 중요하다) ── */
test('★ 칸 위에서 시작하면 띠를 켜지 않는다 — 끌기는 옮기기다', () => {
  const s = fn('bandStart');
  assert.match(s, /closest\('\.cell'\)/, '칸에서 시작한 것을 안 가려냅니다');
  assert.match(s, /return;/, '가려내고도 그냥 진행합니다');
  const i = s.indexOf("closest('.cell')");
  assert.match(s.slice(i, i + 120), /return/, '칸 위에서 띠가 켜지면 옮기기가 죽습니다');
});

test('★ 단추 위에서 시작해도 안 켠다', () => {
  /* 날짜 줄의 ✓ 는 하루치를 고르는 가장 빠른 길이다 — 띠가 먹으면 안 된다. */
  assert.match(fn('bandStart'), /closest\('button'\)/, '단추가 띠에 먹힙니다');
});

test('★ 폰에서는 아예 안 켠다 — 손가락으로 쓰는 것은 화면 넘기기다', () => {
  const s = fn('bandStart');
  assert.match(s, /if \(isTouchDevice\(\)\) return;/, '폰에서 켜면 사진첩을 못 내립니다');
});

test('★ 오른쪽 단추로는 안 켠다', () => {
  assert.match(fn('bandStart'), /e\.button !== 0/, '오른쪽 단추에도 띠가 켜집니다');
});

test('★ 살짝 눌렀다 뗀 것은 고르기를 건드리지 않는다', () => {
  /* 빈 곳을 한 번 눌렀다고 골라 둔 99장이 날아가면 안 된다. */
  const m = app.match(/const BAND_MIN = (\d+);/);
  assert.ok(m, 'BAND_MIN 이 없습니다');
  assert.ok(+m[1] >= 3, '너무 작으면 그냥 누른 것도 쓴 것으로 봅니다: ' + m[1]);
  const mv = fn('bandMove');
  assert.match(mv, /if \(!bandMoved\)/, '움직였는지 안 보고 바로 칠합니다');
  assert.match(mv, /selected\.clear\(\)/, '새로 고르기가 먼저 것을 안 비웁니다');
  const paint = fn('bandPaint');
  assert.match(paint, /if \(!bandOn \|\| !bandMoved\) return;/,
    '움직이지 않았는데도 칠합니다 — 한 번 누른 것으로 고르기가 지워집니다');
});

/* ── 골라지는 방식 ── */
test('★ 그냥 쓸면 고르고, Ctrl 이면 풀고, Shift 면 더한다', () => {
  const s = fn('bandStart');
  assert.match(s, /e\.ctrlKey \|\| e\.metaKey\) \? 'off'/, '풀 길이 없습니다');
  assert.match(s, /e\.shiftKey \? 'add'/, '더할 길이 없습니다');
  assert.match(s, /'new'/, '새로 고르는 길이 없습니다');
});

test('★ 띠에서 되돌아 나오면 취소된다', () => {
  /* 지나쳤다가 되돌리는 것은 사람이 늘 하는 짓이다 — 안 되면 매번 다시 쓸어야 한다. */
  const p = fn('bandPaint');
  assert.match(p, /hit \? \(bandMode !== 'off'\) : bandBase\.has\(id\)/,
    '띠 밖으로 나온 칸이 쓸기 전 상태로 안 돌아갑니다');
});

test('★ 겹치는지 제대로 센다', () => {
  /* 겹침 판단을 실제로 돌려 본다 — 부호 하나만 뒤집혀도 엉뚱한 것이 골라진다. */
  const p = fn('bandPaint');
  const m = p.match(/const hit = !\(([\s\S]*?)\);/);
  assert.ok(m, '겹침 판단을 찾을 수 없습니다');
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext('function overlap(b, box){ return !(' + m[1] + '); }', ctx);
  const box = { left: 100, top: 100, right: 200, bottom: 200 };
  const R = (l, t, r, b) => ({ left: l, top: t, right: r, bottom: b });
  assert.equal(ctx.overlap(R(120, 120, 180, 180), box), true, '안에 든 것을 못 잡습니다');
  assert.equal(ctx.overlap(R(50, 50, 150, 150), box), true, '걸친 것을 못 잡습니다');
  assert.equal(ctx.overlap(R(210, 120, 260, 180), box), false, '오른쪽 밖인데 잡습니다');
  assert.equal(ctx.overlap(R(120, 210, 180, 260), box), false, '아래쪽 밖인데 잡습니다');
  assert.equal(ctx.overlap(R(20, 20, 60, 60), box), false, '왼쪽 위 밖인데 잡습니다');
});

/* ── 99장을 한 번에 ── */
test('★ 끝까지 끌면 화면이 따라 내려간다', () => {
  const s = fn('bandEdgeScroll');
  assert.match(s, /scrollTop \+= dy/, '화면이 안 따라가면 보이는 만큼밖에 못 고릅니다');
  assert.match(s, /window\.scrollBy/, '스크롤 상자를 못 찾은 경우가 빠졌습니다');
  assert.match(s, /bandPaint\(\)/, '따라 내려간 뒤 새로 드러난 칸을 안 고릅니다');
  const m = app.match(/const BAND_EDGE = (\d+);/);
  assert.ok(m && +m[1] > 0, 'BAND_EDGE 가 없습니다');
});

test('★ 스크롤하는 상자를 제대로 고른다', () => {
  /* 넓은 화면은 #main, 폰은 #home 이라 서로 다르다 — 하나로 못 박으면 한쪽이 죽는다. */
  const s = fn('scrollerOf');
  assert.match(s, /overflowY/, '어느 상자가 스크롤되는지 안 봅니다');
  assert.match(s, /scrollHeight > p\.clientHeight/,
    '넘칠 것이 없는 상자를 골라 화면이 안 움직입니다');
  assert.match(s, /return null;/, '못 찾은 경우가 빠졌습니다');
});

/* ── 뒤처리 ── */
test('★ 손을 떼면 띠도 시계도 멈춘다', () => {
  const e = fn('bandEnd');
  assert.match(e, /clearInterval\(bandTimer\)/, '화면 따라가기가 계속 돕니다');
  assert.match(e, /display = 'none'/, '띠가 화면에 남습니다');
  assert.match(e, /classList\.remove\('banding'\)/, '글자를 계속 못 고릅니다');
  assert.match(app, /window\.addEventListener\('mouseup', bandEnd\)/, '뗀 것을 안 듣습니다');
  assert.match(app, /window\.addEventListener\('blur', bandEnd\)/,
    '창 밖에서 떼면 띠가 붙어 다닙니다');
});

test('★ 격자를 다시 그려도 띠가 살아 있다', () => {
  /* #grid 는 innerHTML 로 통째로 갈린다 — 띠를 한 번만 붙여 두면 사라진다. */
  assert.match(fn('bandStart'), /g\.appendChild\(bandEl\)/,
    '격자를 다시 그리면 띠가 없어집니다');
});

test('★ 띠가 격자 안에 자리를 잡는다', () => {
  /* #grid 에 position 이 없으면 띠가 창 왼쪽 위로 튄다. */
  assert.match(app, /#grid\{position:relative\}/, '띠의 자리 기준이 없습니다');
  assert.match(app, /#selBand\{position:absolute/, '띠가 흐름을 밀어 사진을 움직입니다');
  assert.match(app, /pointer-events:none/, '띠가 마우스를 가로채 칸을 못 누릅니다');
});
