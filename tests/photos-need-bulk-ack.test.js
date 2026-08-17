'use strict';
/* 「확인 필요」를 대시보드에서 갈라 한꺼번에 치우기 · 「지우기」→「삭제」
   (대표 지시 2026-08-17)

   "확인필요는 대시보드 분리해서 체크할 수 있게 해달라."
   56장을 한 장씩 열어 ✓ 를 누르는 것은 사실상 못 쓰는 길이었다. 제 칸으로
   갈라 ①들어가기 ②지금 보이는 것 한꺼번에 확인 처리 를 한자리에 둔다.

   ⚠ 이 기능의 가장 큰 위험은 «본 적 없는 사진까지 치우는 것»이다. 그러면 할 일
     목록이 비었는데 아무도 안 본 서류가 남는다 — 목록 자체를 못 믿게 된다.
     그래서 지금 화면에 보이는 것(shownItems)만 대상으로 한다.

   실행: node --test tests/*.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const R = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(R, 'pu-photos.html'), 'utf8');

function fnOf(name) {
  const i = app.indexOf('function ' + name + '(');
  assert.ok(i >= 0, name + ' 를 찾지 못했습니다');
  let d = 0, j = app.indexOf('{', i);
  for (let k = j; k < app.length; k++) {
    if (app[k] === '{') d++;
    else if (app[k] === '}') { d--; if (!d) return app.slice(i, k + 1); }
  }
  throw new Error(name + ' 의 끝을 찾지 못했습니다');
}

/* ── ackAllShown 을 실제로 돌린다 ── */
function run(opts) {
  opts = opts || {};
  const saved = [], asked = [];
  const grid = opts.grid || [];
  const shown = opts.shown || grid;
  const ctx = {
    Promise, Object, Array, Date, String, console: { warn() {} },
    gridItems: grid,
    shownItems: () => shown,
    needsCheck: (it) => !!(it && it.need),
    idsOf: (it) => (it && it._pages && it._pages.length) ? it._pages.slice() : [it.id],
    blockedIfOther: () => !!opts.blocked,
    confirm: (m) => { asked.push(m); return opts.no ? false : true; },
    photoYearOf: () => '2026',
    photoOwner: (id) => opts.owner || '',
    toast: () => {},
    renderGrid() {}, renderGridBar() {}, renderNeedBox() {},
    $: () => ({ disabled: false, style: {}, textContent: '' }),
    PuPhotoStore: {
      myName: () => '권형하',
      saveRead: (y, id, read, owner) => {
        if (opts.failIds && opts.failIds.indexOf(id) >= 0) return Promise.reject(new Error('막힘'));
        saved.push({ id, read, owner });
        return Promise.resolve();
      }
    }
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(fnOf('needShownItems') + '\n' + fnOf('ackAllShown'), ctx);
  ctx.ackAllShown();
  return { saved, asked, ctx };
}

const P = (id, need, extra) => Object.assign({ id, need, meta: { read: { kind: 'form' } } }, extra || {});

test('★ 지금 보이는 「확인 필요」만 치운다 — 안 보이는 사진은 안 건드린다', async () => {
  const grid = [P('a', true), P('b', true), P('hidden', true)];
  const r = run({ grid, shown: [grid[0], grid[1]] });
  await new Promise(res => setTimeout(res, 5));
  assert.deepEqual(r.saved.map(x => x.id).sort(), ['a', 'b'],
    '★ 화면 밖 사진까지 치우면 아무도 안 본 서류가 할 일에서 사라집니다');
});

test('★ 확인 필요가 아닌 사진은 안 건드린다', async () => {
  const grid = [P('a', true), P('ok', false)];
  const r = run({ grid });
  await new Promise(res => setTimeout(res, 5));
  assert.deepEqual(r.saved.map(x => x.id), ['a']);
});

test('★ 접힌 문서는 쪽 전부가 함께 치워진다 — 대표 쪽만 치우면 나머지가 남는다', async () => {
  const grid = [P('p1', true, { _pages: ['p1', 'p2', 'p3'] })];
  const r = run({ grid });
  await new Promise(res => setTimeout(res, 5));
  assert.deepEqual(r.saved.map(x => x.id), ['p1', 'p2', 'p3']);
});

test('★ 몇 장인지 먼저 말하고 묻는다 — 아니오면 아무것도 안 한다', async () => {
  const grid = [P('a', true), P('b', true)];
  const r = run({ grid, no: true });
  await new Promise(res => setTimeout(res, 5));
  assert.equal(r.saved.length, 0, '★ 물어만 보고 그대로 치우면 물어본 뜻이 없습니다');
  assert.match(r.asked[0], /2장/, '몇 장인지 안 말하면 무엇이 사라지는지 모릅니다');
  assert.match(r.asked[0], /사진은 그대로/, '사진이 지워지는 줄 알면 무서워서 못 누릅니다');
});

test('남의 사진이면 막는다', async () => {
  const r = run({ grid: [P('a', true)], blocked: true });
  await new Promise(res => setTimeout(res, 5));
  assert.equal(r.saved.length, 0);
});

test('★ 확인 표시에 누가·언제가 남는다 — 사진은 안 건드린다', async () => {
  const r = run({ grid: [P('a', true)] });
  await new Promise(res => setTimeout(res, 5));
  const rec = r.saved[0].read;
  assert.ok(rec.ack && rec.ack.at > 0, '언제 확인했는지 없으면 나중에 못 따집니다');
  assert.equal(rec.ack.by, '권형하');
  assert.equal(rec.kind, 'form', '★ 판독 결과를 덮으면 읽어 둔 값을 잃습니다');
});

test('한 장이 실패해도 나머지는 계속 치운다', async () => {
  const grid = [P('a', true), P('bad', true), P('c', true)];
  const r = run({ grid, failIds: ['bad'] });
  await new Promise(res => setTimeout(res, 10));
  assert.deepEqual(r.saved.map(x => x.id).sort(), ['a', 'c']);
});

test('사진마다 제 해·제 주인 자리에 쓴다 — 남의 사진을 내 자리에 쓰면 안 된다', () => {
  const fn = fnOf('ackAllShown');
  assert.match(fn, /photoYearOf\(id\)/, '★ gridYear 를 쓰면 다른 해 사진의 표시가 엉뚱한 자리로 갑니다');
  assert.match(fn, /photoOwner\(id\)/, '★ 주인을 안 넘기면 내 자리에 써서 주인 화면에는 안 치워집니다');
});

/* ── 화면 배선 ── */
test('★ 확인 필요가 제 칸으로 갈라져 있다', () => {
  assert.match(app, /<div id="needCard"/, '대시보드에서 갈라 두지 않았습니다');
  assert.match(app, /id="needAckAll"[^>]*onclick="ackAllShown\(\)"/);
  const fn = fnOf('renderNeedBox');
  assert.match(fn, /needCard/, '칸을 켜고 끄지 않습니다');
});

test('★ 한꺼번에 치우기는 「확인 필요」만 볼 때만 나온다', () => {
  /* 전체 화면에서 내주면 지금 무엇을 치우는지 안 보고 누르게 된다. */
  const fn = fnOf('renderNeedBox');
  assert.match(fn, /needOnly \? needShownItems\(\)/,
    '★ 걸러보기 밖에서도 나오면 화면에 없는 것까지 치웁니다');
});

test('한꺼번에 치우기 단추가 몇 장인지 적는다', () => {
  assert.match(fnOf('renderNeedBox'), /보이는 ' \+ m \+ '장 확인 처리/);
});

/* ── 「지우기」 → 「삭제」 (대표 지시 2026-08-17) ── */
test('★ 지우기 단추 이름이 「삭제」다', () => {
  assert.match(app, /id="delBtn"[^>]*>🗑 삭제<\/button>/, 'HTML 기본 글자가 안 바뀌었습니다');
  assert.match(fnOf('renderGridBar'), /'🗑 ' \+ n \+ '장 삭제'/, '고른 뒤 글자가 안 바뀌었습니다');
  assert.match(app, /title="이 사진 삭제"/, '크게 보기 툴팁이 안 바뀌었습니다');
  assert.match(app, /'삭제하는 중…'/, '누른 뒤 글자가 안 바뀌었습니다');
});

test('찾기의 「✕ 지우기」는 그대로 둔다 — 그건 글자를 비우는 것이지 삭제가 아니다', () => {
  assert.match(app, /id="qClear"[^>]*>✕ 지우기<\/button>/);
});
