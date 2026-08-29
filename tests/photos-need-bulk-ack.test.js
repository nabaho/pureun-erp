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
    /* 확인 창이 「어디를 치우는지」 말하려고 보는 것들 */
    needOnly: !!opts.needOnly,
    kindTab: opts.kindTab || 'all',
    gridOwner: opts.gridOwner || null,
    ALL_OWNERS: '__all__',
    tabLabelOf: (k) => k,
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
  ctx.SHARED_OWNER = '__shared__';
  vm.createContext(ctx);
  /* needScopeLabel 도 함께 떠온다 — 확인 창이 그것으로 「어디를」을 말한다 */
  vm.runInContext(
    fnOf('needShownItems') + '\n' + fnOf('needScopeLabel') + '\n' + fnOf('ackAllShown'), ctx);
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

test('★ 확인 창이 상황별로 어디를 치우는지 말한다', async () => {
  const g = [P('a', true)];
  assert.match(run({ grid: g, gridOwner: '__all__' }).asked[0], /전 직원 확인 필요/,
    '★ 전 직원인지 모르고 누르면 남의 할 일까지 치웁니다');
  assert.match(run({ grid: g, kindTab: '계약서' }).asked[0], /「계약서」 확인 필요/);
  assert.match(run({ grid: g }).asked[0], /내 사진 확인 필요/);
  /* 들어가 있어도 «무엇을 좁혀 보는가»로 말한다 — 상태에 따라 안 바꾼다 */
  assert.match(run({ grid: g, needOnly: true, gridOwner: '__all__' }).asked[0], /전 직원/);
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

test('★ 늘 두 칸이다 — 치우려고 매번 들어갔다 나오지 않는다', () => {
  /* 대표 지시 2026-08-17: "항상 2개 대시보드로, 문제가 있으면 아래에서 문제만
     체크할 수 있게." 처음에는 「확인 필요」에 들어갔을 때만 아래 칸을 냈다. */
  const fn = fnOf('renderNeedBox');
  assert.match(fn, /const need = needShownItems\(\);/,
    '★ needOnly 일 때만 세면 전체 화면에서 아래 칸이 사라집니다');
  assert.ok(!/needOnly \? needShownItems\(\)/.test(fn),
    '★ 옛 동작(들어가야만 나옴)으로 되돌아갔습니다');
  assert.match(fn, /bulk\.style\.display = m \? 'block' : 'none'/,
    '아래 칸이 걸러보기 상태에 따라 사라지면 안 됩니다');
});

test('★ 무엇을 치우는지 단추와 확인 창에 적는다 — 전 직원 55장과 내 3장은 다르다', () => {
  /* 전체 화면에서도 누를 수 있게 된 뒤로, 어디를 치우는지 모르고 누를 위험이 생겼다. */
  const scope = fnOf('needScopeLabel');
  assert.match(scope, /gridOwner === ALL_OWNERS/, '전 직원인지 안 밝힙니다');
  assert.match(scope, /tabLabelOf\(kindTab\)/, '분류를 좁혀 봤을 때 그 이름을 안 씁니다');
  assert.match(fnOf('renderNeedBox'), /'✓ ' \+ scope \+ ' ' \+ m \+ '장 확인 처리'/);
  assert.match(fnOf('ackAllShown'), /confirm\(needScopeLabel\(\) \+ ' 확인 필요 '/,
    '★ 확인 창이 어디를 치우는지 안 말합니다');
});

/* ══════ 두 칸이 안 바뀌고 같은 것을 센다 (대표 지시 2026-08-17) ══════
   "전체사진 보기 클릭하면 캡처1로 바뀐다. 색이나 내용 바뀔 필요 없다.
    그냥 이대로 대시보드 두고 관리할 수 있게 해라."
   ⚠ 실제 캡처에서 위 38장 / 아래 37장으로 어긋나 있었다 — 위는 접기 전
     (gridItems)을, 아래는 접은 뒤(shownItems, 쪽 세기)를 세고 있었다. */
test('★ 위·아래가 같은 수를 센다 — 어긋나면 어느 쪽을 믿을지 모른다', () => {
  const fn = fnOf('renderNeedBox');
  assert.match(fn, /const need = needShownItems\(\);/, '위 칸이 다른 것을 셉니다');
  assert.match(fn, /const m = n;/, '★ 아래 단추가 위 칸과 다른 수를 셉니다(38 / 37)');
  assert.ok(!/gridItems\.filter\(needsCheck\)/.test(fn),
    '★ 접기 전 목록을 세면 아래 단추가 실제로 치우는 수와 어긋납니다');
});

test('★ 들어가고 나와도 글자·색이 안 바뀐다 — 같은 자리가 오갈 때마다 달라 보이면 못 쓴다', () => {
  /* ⚠ 주석에 옛 글자(「← 전체 사진 보기」)와 needOnly 가 그대로 나온다 — 왜
     바꿨는지 적어 뒀기 때문이다. 주석을 걷어내고 «코드»만 본다. 안 그러면
     설명 주석 자체가 걸려 운다(이 저장소가 여러 번 당한 함정이다). */
  const fn = fnOf('renderNeedBox');
  const code = fn.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  assert.ok(!/← 전체 사진 보기/.test(code),
    '★ 들어가면 글자가 통째로 바뀌어, 관리하는 칸으로 못 씁니다');
  assert.match(code, /el\.className = '';/, '색이 파랑으로 바뀝니다');
  assert.match(code, /'⚠ 확인 필요 ' \+ n \+ '장 · ' \+ needScopeLabel\(\)/);
  const at = code.indexOf('el.textContent');
  assert.ok(at > 0 && !/needOnly \?/.test(code.slice(at)),
    '★ 아직 상태에 따라 글자를 가릅니다');
});

test('걸러보기 중인지는 본문 맨 위 띠가 말해 준다 — 대시보드가 안 바뀌어도 길을 잃지 않는다', () => {
  const w = fnOf('whereNow');
  assert.match(w, /확인이 필요한 사진만 보는 중/,
    '대시보드도 안 바뀌고 띠도 없으면 지금 걸러보기 중인지 알 길이 없습니다');
});

/* ── 「지우기」 → 「삭제」 (대표 지시 2026-08-17) ── */
test('★ 지우기 단추 이름이 「삭제」다', () => {
  assert.match(app, /id="delBtn"[^>]*>🗑 삭제<\/button>/, 'HTML 기본 글자가 안 바뀌었습니다');
  /* ⚠ 2026-08-28 다시 겨눔 — 「N장」을 걷어냈다(고른 수와 늘 같아 중복이었다).
     지킬 것은 「지우기가 아니라 삭제」다 — 그 말이 되돌릴 수 없는 일과 어울린다. */
  assert.match(fnOf('renderGridBar'), /\$\('delBtn'\)\.textContent = '🗑 삭제';/,
    '고른 뒤 글자가 「지우기」로 돌아갔습니다');
  assert.match(app, /title="이 사진 삭제"/, '크게 보기 툴팁이 안 바뀌었습니다');
  assert.match(app, /'삭제하는 중…'/, '누른 뒤 글자가 안 바뀌었습니다');
});

test('찾기의 「✕ 지우기」는 그대로 둔다 — 그건 글자를 비우는 것이지 삭제가 아니다', () => {
  assert.match(app, /id="qClear"[^>]*>✕ 지우기<\/button>/);
});
