/* 타임스탬프 창을 한 화면에 (대표 지시 2026-08-29)
   「팝업창 안에 화면 전체내용이 팝업 한화면에 다 나올수 있게, 위아래로 안움직여도 되게」

   세로로 밀리던 까닭 셋 —
   ① 창 크기를 정할 때 **가로만** 따졌다(세로는 아예 안 봤다)
   ② 사진 칸이 **정사각**이라 가로 340이면 세로도 340
   ③ 이 창만 **한 열로 고정**돼 업로드·합성이 세로로 쌓였다(340+340=680)

   ★ 크기 셈은 실제로 돌려서 본다 — 글자만 보면 관문을 없애도 통과한다. */
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'gov-consulting.html'), 'utf8');
const bare = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
const S = bare(SRC);

function stampHtml() {
  const a = SRC.indexOf('<div class="mb" id="mbStamp">');
  assert.ok(a > 0, '타임스탬프 창을 찾지 못했다');
  /* 창 끝까지 — 안에 주석이 있으므로 «주석 앞까지»로 자르면 안 된다(그러면 절반만 본다) */
  const end = SRC.indexOf('<input type="file" id="photoFi"', a);
  assert.ok(end > a, '타임스탬프 창의 끝을 찾지 못했다');
  return SRC.slice(a, end);
}

/* ══════ ① 발밑 줄을 제목줄로 ══════ */

test('저장·나중에·스위치·자동 맞춤이 «제목줄»에 있다', () => {
  const h = stampHtml();
  const a = h.indexOf('class="mhdr'), b = h.indexOf('class="mbody"');
  assert.ok(a >= 0 && b > a, '제목줄을 찾지 못했다');
  const hdr = h.slice(a, b);
  ['mStampSizeReset', 'mStampSw', 'mStampSkip', 'mStampSave', 'mStampCls']
    .forEach((id) => assert.ok(hdr.indexOf(id) >= 0, id + ' 이(가) 제목줄에 없다'));
});

test('타임스탬프 창에 «발밑 줄»이 남아 있지 않다 — 줄 하나가 통째로 사라진 자리다', () => {
  assert.ok(stampHtml().indexOf('mfoot') < 0,
    '발밑 줄이 남아 있다 — 세로가 그만큼 도로 늘어난다');
});

test('제목이 길어도 단추가 밀려나지 않는다 — 제목만 줄어든다', () => {
  const css = S.slice(S.indexOf('.stamp-hdr{'), S.indexOf('.stamp-hdr{') + 420);
  assert.ok(/text-overflow:\s*ellipsis/.test(css), '긴 제목이 단추를 줄 밖으로 민다');
  assert.ok(/flex:\s*0 0 auto/.test(css), '단추가 줄어들어 글자가 뭉개진다');
});

/* ══════ ② 좌우 2열 ══════ */

test('업로드·합성이 «좌우»로 선다 — 한 열로 되돌리지 않았다', () => {
  /* 예전에는 이 창만 한 열로 못 박혀 있어서 사진이 세로로 680px 을 먹었다.
     ⚠ 좁은 화면용 규칙(@media)에는 1fr 이 «있어야» 한다 — 그것까지 걸면 늘 실패한다.
       미디어 규칙을 걷어 내고, 그 밖에서 못 박았는지만 본다. */
  const outside = S.replace(/@media\([^)]*\)\{[\s\S]*?\}\}/g, ' ');
  assert.ok(!/\.stamp-modal \.sp-layout\{[^}]*grid-template-columns:\s*1fr[;}]/.test(outside),
    '이 창을 한 열로 못 박아 두면 사진이 세로로 쌓인다');
  /* 좁은 화면에서는 한 열로 되돌아가야 한다 — 좌우로 두면 사진이 손톱만 해진다 */
  assert.ok(/@media\(max-width:900px\)\{\.stamp-modal \.sp-layout\{grid-template-columns:1fr/.test(S),
    '좁은 화면에서 한 열로 돌아가는 규칙이 없다');
});

/* ══════ ③ 입장·활동은 «제 사진 바로 아래» ══════ */

test('시간 칸이 사진 격자와 «같은 열»을 쓴다 — 입장 칸은 입장 사진 아래', () => {
  const a = S.indexOf('function layoutStampGrids');
  const body = S.slice(a, S.indexOf('\nwindow.addEventListener(\'resize\'', a));
  assert.ok(/#spTimes/.test(body), '시간 칸을 사진과 함께 맞추지 않는다');
  /* 사진과 **같은 값**이어야 한다 — 따로 계산하면 언젠가 한쪽만 바뀌어 어긋난다 */
  assert.ok(/tms\.style\.gridTemplateColumns\s*=\s*`repeat\(\$\{cols\}/.test(body),
    '열 수를 사진과 같이 안 준다');
  assert.ok(/tms\.style\.maxWidth\s*=\s*gridW/.test(body), '폭을 사진과 같이 안 준다');
});

/* ══════ ④ 크기 셈 — 실제로 돌린다 ══════ */

function runLayout(vw, vh, n, cellMaxOverride) {
  const a = S.indexOf('function layoutStampGrids');
  const b = S.indexOf('\nwindow.addEventListener(\'resize\'', a);
  assert.ok(a > 0 && b > a, 'layoutStampGrids 를 찾지 못했다');
  const el = (id) => ({ style: {}, id });
  const pair = { style: {}, parentElement: { clientWidth: 600 }, clientWidth: 600 };
  const modal = {
    style: {},
    querySelector: (sel) => (sel === '.mbody'
      ? { }
      : (sel === '#spTimes' ? el('spTimes') : null)),
  };
  const ctx = {
    console, Math, Date, Number, window: { innerWidth: vw, innerHeight: vh },
    ST: { visN: n, n: n },
    _stampManual: false, _stampAutoAt: 0,
    stampModalEl: () => modal,
    getComputedStyle: () => ({ paddingLeft: '20px', paddingRight: '20px' }),
    document: { querySelectorAll: () => [pair, { style: {} }] },
    q: () => null,
  };
  ctx.window.innerWidth = vw; ctx.window.innerHeight = vh;
  vm.createContext(ctx);
  vm.runInContext(S.slice(a, b) + '\nthis._f = layoutStampGrids;', ctx);
  ctx._f(n);
  return { modal, pair, times: modal.querySelector('#spTimes') };
}

test('넓고 높은 화면 — 사진이 크고, 창은 좌우 두 덩이 폭', () => {
  const { modal, pair } = runLayout(1920, 1080, 2);
  const w = parseInt(modal.style.width, 10);
  assert.ok(w > 900, '좌우로 두 덩이가 서려면 창이 넓어야 한다 (지금 ' + w + 'px)');
  assert.ok(w <= 1400, '창이 1400px 을 넘었다');
  const gw = parseInt(pair.style.maxWidth, 10);
  assert.ok(gw * 2 < w, '격자 둘이 창 안에 안 들어간다 — 창 폭 셈이 한 덩이 기준이다');
});

test('낮은 화면 — 사진 칸을 «줄여서라도» 한 화면에 맞춘다', () => {
  const hi = parseInt(runLayout(1920, 1080, 2).pair.style.maxWidth, 10);
  const lo = parseInt(runLayout(1920, 560, 2).pair.style.maxWidth, 10);
  assert.ok(lo < hi,
    '화면이 낮은데 사진 칸이 그대로다 — 세로를 안 따진다 (' + hi + ' → ' + lo + ')');
});

test('아주 낮아도 «못 알아볼 만큼» 줄이지는 않는다', () => {
  /* ⚠ 사진이 **두 줄 이상**일 때로 재야 한다 — 한 줄이면 남은 높이가 곧 칸 높이라
     바닥 관문이 앞 관문에 가려 «죽은 관문»이 된다(지워도 안 걸린다).
     사진 4장이면 두 줄이 되고, 그때 비로소 바닥이 일한다. */
  const { pair } = runLayout(1920, 300, 4);
  const gw = parseInt(pair.style.maxWidth, 10);
  const cell = (gw - 10) / 2;   // 두 칸 + 틈
  assert.ok(cell >= 150,
    '사진이 바닥(150px) 아래로 줄었다 — 그러면 못 알아본다 (지금 ' + Math.round(cell) + 'px)');
});

test('좁은 화면에서는 창 폭을 두 배로 잡지 않는다 — 한 열로 서기 때문', () => {
  const { modal, pair } = runLayout(800, 900, 2);
  const w = parseInt(modal.style.width, 10);
  const gw = parseInt(pair.style.maxWidth, 10);
  assert.ok(w <= 800 * 0.97 + 1, '창이 화면보다 넓다');
  assert.ok(w < gw * 2, '한 열인데 두 덩이 폭으로 잡았다');
});

/* ══════ ⑤ 날짜를 한 번만 ══════ */

function runSummary(times, n) {
  const a = S.indexOf('function stampClockText');
  const b = S.indexOf('\nfunction loadStampImg', a);
  let html = '';
  const ctx = {
    console, Math, Date, Array, String, Number,
    ST: { sid: 'S1', times: times, n: n },
    getScheds: () => [{ id: 'S1', date: '2026-08-31' }],
    todayStr: () => '2026-08-31',
    p2: (x) => (x < 10 ? '0' + x : '' + x),
    escAttr: (x) => String(x),
    q: () => ({ set innerHTML(v) { html = v; } }),
  };
  vm.createContext(ctx);
  vm.runInContext(S.slice(a, b) + '\nthis._f = renderStampTimeSummary;', ctx);
  ctx._f();
  return html.replace(/<[^>]*>/g, '');
}

test('날짜를 «한 번만» 적는다 — 입장·활동은 같은 날이다', () => {
  const t = runSummary([null, null], 2);
  const hits = (t.match(/2026년 8월 31일/g) || []).length;
  assert.strictEqual(hits, 1, '같은 날짜를 두 번 적어 세로만 먹는다 (' + hits + '번)');
  assert.ok(/입장/.test(t) && /활동/.test(t), '입장·활동이 다 나와야 한다');
});

test('시간을 넣으면 그 시각이 보인다', () => {
  const t = runSummary([{ h: 9, m: 0 }, { h: 11, m: 0 }], 2);
  assert.ok(/오전 9:00/.test(t) && /오전 11:00/.test(t), '넣은 시각이 안 보인다: ' + t);
});

test('1장짜리 일정에서는 «활동»을 말하지 않는다 — 없는 칸이다', () => {
  const t = runSummary([{ h: 9, m: 0 }, null], 1);
  assert.ok(!/활동/.test(t), '1장짜리인데 활동을 적는다: ' + t);
});

/* ══════ ⑥ 「오전·오후」는 둘 다 채운다 ══════ */

test('「오전·오후」를 입장·활동 어느 한 줄에 붙이지 않는다', () => {
  const h = stampHtml();
  const tg = h.indexOf('class="tg-row');
  const times = h.indexOf('id="spTimes"');
  assert.ok(tg > 0 && times > 0, '자리를 찾지 못했다');
  assert.ok(tg > times, '시간 줄 안에 섞여 있다 — 「이 줄만 바뀐다」로 읽힌다');
  assert.ok(/둘 다 한 번에/.test(h.slice(tg, tg + 300)),
    '무엇이 바뀌는지 이름표가 없다 — 입장·활동을 둘 다 채우는 단추다');
});
