/* 정부컨설팅 · 환경설정 › 푸른ERP 연결 — 「넘버링 넣고 열을 맞춰달라」 (2026-08-30 대표 지시)
 *
 * 예전에는 왼쪽이 «한 줄로 흘러가는 글»이었다 — 뱃지·이름·건수·기관을 margin-left 로
 * 이어 붙여서, 뱃지 글자 수(현클 2자 ↔ 인사충남 4자)에 따라 이름이 밀리고
 * 이름 길이에 따라 건수·기관이 또 밀렸다. 열일곱 줄이 저마다 다른 자리에서 시작했다.
 * (실측: 건수가 끝나는 자리 11가지, 기관이 시작하는 자리 8가지 — 163px~317px)
 *
 * 여기서 못 박는 것은 «칸 너비 값»이 아니라 «칸으로 갈라져 있는가»다 (CLAUDE.md).
 */
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'gov-consulting.html'), 'utf8');

function bare(s) {
  return s
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^\s*\/\/.*$/gm, ' ');
}
const CODE = bare(SRC);

function grab(name) {
  const i = SRC.indexOf('function ' + name + '(');
  assert.ok(i >= 0, name + ' 을(를) 소스에서 못 찾았다');
  let d = 0, started = false;
  for (let j = i; j < SRC.length; j++) {
    const c = SRC[j];
    if (c === '{') { d++; started = true; }
    else if (c === '}') { d--; if (started && d === 0) return SRC.slice(i, j + 1); }
  }
  throw new Error(name + ' 의 끝을 못 찾았다');
}

/* ───────── 진짜 함수를 돌려 나온 화면을 본다 ───────── */

/* 뱃지 길이도 이름 길이도 제각각인 줄들 — 「흘러가는 글」이면 자리가 밀리는 모양 */
const ROWS = [
  { code: 'a', short: '현클', name: '현장클리닉', cnt: 13, agency: '비즈니스지원단(중기청)', extra: false },
  { code: 'b', short: '인사충남', name: '인사노무컨설팅충남북부상의', cnt: 7, agency: '충남북부상공회의소', extra: false },
  { code: 'c', short: '통상경영', name: '통상변화대응기술경영혁신지원컨설팅', cnt: 0, agency: '산업통상부', extra: false },
  { code: 'd', short: '', name: '', cnt: 0, agency: '', extra: true },   // 뱃지·이름·기관이 다 빈 줄
];
const GTYPES = [{ id: 't1', name: '일터혁신', agency: '에프엠', active: true }];

function render() {
  const body = { innerHTML: '' }, st = { innerHTML: '', textContent: '' };
  const ctx = {
    q: (s) => s === '#erpStatus' ? st : s === '#erpMapBody' ? body : null,
    ERP: { loaded: true, err: null, consultings: [], src: 'local' },
    getErpTypeMap: () => ({}),
  /* 표가 「일정관리 진행」 스위치를 그린다(2026-09-06) — 적힌 게 없으면 켜진 것으로 본다 */
  getErpTypeRun: () => ({}),
    getTypes: () => GTYPES,
    erpMappableTypes: () => ROWS,
    _erpLowConf: { c: 62 },
    escAttr: (s) => String(s == null ? '' : s).replace(/"/g, '&quot;'),
  };
  vm.createContext(ctx);
  vm.runInContext(grab('erpTypeRuns') + '\n' + grab('renderErpMap') + '\nrenderErpMap();', ctx);
  return body.innerHTML;
}
const HTML = render();

/* 안쪽 그리드(칸이 갈린 자리)의 «바로 아래» 칸만 꺼낸다.
   ⚠ 그냥 <span 을 세면 칸 «안»에 든 것까지 세어 줄마다 개수가 달라 보인다
     (경고 ⚠️62% 가 칸 안에 또 span 으로 들어 있다). 그래서 깊이를 센다. */
function innerCells(chunk) {
  const at = chunk.indexOf('<div style="display:grid;grid-template-columns:');
  if (at < 0) return null;
  let d = 0, start = -1, end = -1;
  for (let i = at; i < chunk.length; i++) {
    if (chunk.startsWith('<div', i)) { d++; if (d === 1) start = chunk.indexOf('>', i) + 1; }
    else if (chunk.startsWith('</div>', i)) { d--; if (d === 0) { end = i; break; } }
  }
  const body = chunk.slice(start, end < 0 ? undefined : end);
  const cells = [];
  let depth = 0, from = -1;
  for (let i = 0; i < body.length; i++) {
    if (body.startsWith('<span', i)) { if (depth === 0) from = i; depth++; }
    else if (body.startsWith('</span>', i)) { depth--; if (depth === 0) cells.push(body.slice(from, i + 7)); }
  }
  return cells;
}

/* 줄마다 «칸 자리»로 짚어 본다 — 「어딘가에 있더라」 식으로 세면
   엉뚱한 숫자(건수 13, 경고 62%)가 대신 통과시킨다. */
const ROWCELLS = HTML.split('border-top:1px solid').slice(1).map(innerCells);
const textOf = (cell) => cell.replace(/<[^>]*>/g, '').trim();
const tagOf = (cell) => cell.slice(0, cell.indexOf('>'));
const COL = { 번호: 0, 뱃지: 1, 이름: 2, 건수: 3, 기관: 4 };

test('★★ 줄마다 번호가 붙는다 — 1부터 차례대로', () => {
  /* 대표가 「몇 번째 줄」로 말할 수 있어야 한다 — 열일곱 줄에서 이름만으로 짚기 어렵다 */
  const got = ROWCELLS.map(c => textOf(c[COL.번호]));
  const want = ROWCELLS.map((_, i) => String(i + 1));
  assert.deepStrictEqual(got.join(','), want.join(','),
    '첫 칸의 번호가 1부터 차례대로가 아니다');
});

test('★★★ 왼쪽이 «흘러가는 글»이 아니라 «칸»이다', () => {
  /* 이것이 이번에 고친 핵심이다. margin-left 로 이어 붙이면 앞 글자 수에 따라
     뒤가 통째로 밀린다 — 그래서 열일곱 줄이 다 어긋나 있었다. */
  assert.ok(/display:grid;grid-template-columns:\d+px/.test(HTML),
    '왼쪽이 그리드가 아니다 — 칸으로 갈라져 있지 않다');
  /* 칸 «사이»를 margin 으로 벌리면 앞 글자 수에 따라 뒤가 통째로 밀린다.
     칸 «안»의 곁말(「(ERP 목록에 없음)」)은 margin 을 써도 된다 — 그 칸을 안 벗어난다. */
  const rows = HTML.split('border-top:1px solid').slice(1);
  for (const r of rows) {
    for (const cell of innerCells(r) || []) {
      const openTag = cell.slice(0, cell.indexOf('>'));
      assert.ok(!/margin-left/.test(openTag),
        '칸 자체를 margin-left 로 밀고 있다 — 앞 글자 수에 따라 뒤가 밀린다: ' + openTag.slice(0, 90));
    }
  }
});

test('★★★ 머리줄과 줄이 «똑같은» 칸 정의를 쓴다', () => {
  /* 둘이 어긋나면 「건수」 머리말이 엉뚱한 칸 위에 떠서, 맞춰 놓고도 안 맞아 보인다.
     한 곳(ERP_COLS)에서 나눠 쓰는지 본다 — 두 벌로 적어 두면 한쪽만 고치게 된다. */
  const fn = bare(grab('renderErpMap'));
  const defs = [...fn.matchAll(/grid-template-columns:([^;'"`]+)/g)].map(m => m[1].trim());
  const inner = defs.filter(d => /^\d+px/.test(d));
  assert.strictEqual(inner.length, 1,
    '안쪽 칸 정의가 ' + inner.length + '벌이다 — 한 벌만 두고 머리줄·줄이 나눠 써야 한다: ' + inner.join(' | '));
  const uses = (fn.match(/\$\{ERP_COLS\}/g) || []).length;
  assert.ok(uses >= 2, '머리줄과 줄이 같은 칸 정의를 안 쓴다 (쓰인 곳 ' + uses + '군데)');
});

test('★★ 머리줄 칸 수와 줄 칸 수가 같다', () => {
  const cols = (bare(grab('renderErpMap')).match(/grid-template-columns:(\d+px[^;'"`]+)/) || [])[1];
  assert.ok(cols, '안쪽 칸 정의를 못 찾았다');
  const n = cols.trim().split(/\s+(?![^(]*\))/).length;
  const head = HTML.slice(0, HTML.indexOf('border-top:1px solid'));
  const heads = (innerCells(head) || []).length;
  assert.strictEqual(heads, n,
    '칸은 ' + n + '개인데 머리줄은 ' + heads + '칸이다 — 머리말이 한 칸씩 밀려 뜬다');
});

test('★★ 이름 칸이 1fr 이 아니다 — 넓은 화면에서 건수·기관이 저 멀리 떨어진다', () => {
  const cols = (bare(grab('renderErpMap')).match(/grid-template-columns:(\d+px[^;'"`]+)/) || [])[1];
  const parts = cols.trim().split(/\s+(?![^(]*\))/);
  /* 이름 칸(가운데 minmax)이 남는 자리를 다 먹으면 안 된다. 남는 자리는 «맨 끝»이 가져간다. */
  assert.ok(!/1fr/.test(parts[2]), '이름 칸이 남는 자리를 다 먹는다: ' + parts[2]);
  assert.ok(/1fr/.test(parts[parts.length - 1]),
    '남는 자리를 가져갈 칸이 맨 끝에 없다 — 칸들이 화면 폭에 따라 늘어난다');
});

test('★ 긴 이름·기관은 잘리되 «전체를 볼 수» 있다', () => {
  /* 칸을 고정하면 긴 것이 잘린다. 잘린 채로 두면 무슨 사업인지 모른다 — title 로 남긴다.
     ⚠ 「어딘가에 ellipsis 가 몇 개 있더라」로 세면 뱃지 것이 이름 것을 대신 통과시킨다 */
  for (const [what, col] of [['이름', COL.이름], ['기관', COL.기관]]) {
    for (const cells of ROWCELLS) {
      const tag = tagOf(cells[col]);
      assert.ok(/text-overflow:ellipsis/.test(tag), what + ' 칸이 안 잘린다 — 칸을 밀고 나간다');
      assert.ok(/title=/.test(tag), what + ' 칸에 title 이 없다 — 잘리면 무엇인지 알 길이 없다');
    }
  }
  assert.ok(/title="통상변화대응기술경영혁신지원컨설팅"/.test(HTML), '이름 전체가 title 에 안 담겼다');
});

test('★ 숫자가 자리를 안 흔든다 — 번호·건수는 오른쪽 맞춤에 폭이 같은 숫자', () => {
  /* 13 과 7 이 왼쪽 맞춤이면 한 자리·두 자리에서 자리가 흔들려 보인다 */
  for (const cells of ROWCELLS) {
    for (const [what, col] of [['번호', COL.번호], ['건수', COL.건수]]) {
      assert.ok(/text-align:right/.test(tagOf(cells[col])), what + ' 칸이 오른쪽 맞춤이 아니다');
    }
    assert.ok(/tabular-nums/.test(tagOf(cells[COL.번호])), '번호가 폭이 같은 숫자가 아니다');
  }
  const withCnt = ROWCELLS.filter(c => /\d/.test(textOf(c[COL.건수])));
  assert.ok(withCnt.length, '건수가 있는 줄이 없다 — 이 검사의 밑돌이 무너졌다');
  for (const c of withCnt) {
    assert.ok(/tabular-nums/.test(tagOf(c[COL.건수])), '건수가 폭이 같은 숫자가 아니다');
  }
});

test('★ 빈 값이어도 칸이 안 무너진다 — 뱃지·이름·기관이 없는 줄', () => {
  /* 값이 없다고 <span> 을 통째로 빼면 뒤 칸이 한 칸씩 당겨져 그 줄만 어긋난다 */
  const counts = HTML.split('border-top:1px solid').slice(1)
    .map(r => (innerCells(r) || []).length);
  assert.strictEqual(new Set(counts).size, 1,
    '줄마다 칸 수가 다르다 (' + counts.join(',') + ') — 빈 값인 줄이 한 칸씩 당겨진다');
});

/* ───────── 다른 데를 안 망가뜨렸는지 ───────── */

test('★ 고르개와 저장이 그대로다 — 연결을 못 바꾸면 이 화면은 쓸모가 없다', () => {
  assert.ok(/class="erp-map-sel"/.test(HTML), '고르개 손잡이(erp-map-sel)가 사라졌다');
  assert.ok(/data-erpcode=/.test(HTML), '어떤 ERP 유형인지 표가 사라졌다 — 저장이 엉뚱한 데 붙는다');
  /* ⚠ 글자를 박지 않는다 — 2026-09-06 에 「일정관리 진행」 스위치가 생기면서
     이 칸의 뜻이 「안 가져옴」에서 「안 이음」으로 바뀌었고, 글자를 박아 둔 이 줄이
     멀쩡한 개선 때문에 깨졌다(CLAUDE.md 「지금 값이 아니라 규칙」).
     보아야 할 것은 «비워 두는 고르개가 있는가»다. */
  assert.ok(/<option value="">/.test(HTML), '비워 두는 고르개가 사라졌다 — 이음을 풀 길이 없다');
});

test('★ 낮은 확신 추천 표시가 남아 있다 — 틀린 연결을 그냥 지나치게 된다', () => {
  assert.ok(/⚠️62%/.test(HTML), '추천 확신도 경고가 사라졌다');
});
