/* 푸른 메일 — 두 대시보드의 «최종 색»이 같은가 (대표 지시 2026-08-29)
   "한번도 같은 위치 분위기 색등을 모두 일치하게 조정해달라"

   ★ 왜 규칙만 보지 않고 «계단(cascade)»을 푸나
     mail-dash-unify.test.js 는 「따로 꾸미는 규칙이 없다」를 지킨다. 그것만으로는
     부족하다 — 규칙이 없어도 «다른 곳의 규칙»이 한쪽에만 걸리면 색이 갈린다.
     그래서 브라우저가 하는 일을 그대로 한다: 걸리는 규칙을 모두 모으고,
     특정도(specificity)와 적힌 차례로 이겨, «마지막에 남는 값»을 견준다.
   ⚠ 브라우저로 재는 것이 가장 좋지만 지금은 못 쓴다(개발 서버 자리가 다른 세션으로
     차 있고 Chrome 확장도 안 붙었다). 이 검사는 그 자리를 메우고, 브라우저가 있을
     때도 «되돌림을 막는 그물»로 계속 남는다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.join(__dirname, '..', 'pu-cards.html'), 'utf8');

/* ── 규칙을 모은다 ── */
function rules() {
  const out = [];
  /* <style> 안만 본다 — 스크립트의 글자를 규칙으로 읽으면 엉뚱해진다 */
  const blocks = src.match(/<style[^>]*>([\s\S]*?)<\/style>/g) || [];
  blocks.forEach(b => {
    const css = b.replace(/<\/?style[^>]*>/g, '').replace(/\/\*[\s\S]*?\*\//g, ' ');
    const re = /([^{}]+)\{([^{}]*)\}/g;
    let m;
    while ((m = re.exec(css))) {
      const body = m[2];
      m[1].split(',').forEach(sel => {
        sel = sel.replace(/\s+/g, ' ').trim();
        if (!sel || sel.charAt(0) === '@') return;
        out.push({ sel, body, order: out.length });
      });
    }
  });
  return out;
}
const ALL = rules();

/* ── 이 규칙이 이 줄에 걸리는가 ──
   여기 쓰는 선택자는 단순하다: 「.a.b」·「.a .b」·「:hover」 정도.
   ⚠ 다룰 수 없는 모양(＞, [attr], ::before …)이 나오면 «걸린다고 치지 않고» 세어 둔다 —
     조용히 빠뜨리면 검사가 거짓으로 초록이 된다. */
const skipped = [];
function parts(sel) { return sel.split(' ').filter(Boolean); }
function compoundMatch(part, node, state) {
  if (/[>+~\[\]]|::/.test(part)) return null;          /* 못 다룬다 */
  let rest = part;
  if (rest.indexOf(':hover') >= 0) {
    if (!state.hover) return false;
    rest = rest.split(':hover').join('');
  }
  if (rest.indexOf(':') >= 0) return null;             /* 다른 가짜 클래스 — 못 다룬다 */
  const cls = rest.split('.').filter(Boolean);
  if (rest && rest.charAt(0) !== '.') {
    const tag = cls.shift();                            /* div.dm-f 같은 모양 */
    if (String(node.tag || '') !== tag) return false;
  }
  return cls.every(c => node.cls.indexOf(c) >= 0);
}
/* chain: 조상 → … → 나 */
function matches(sel, chain, state) {
  const ps = parts(sel);
  let i = ps.length - 1, j = chain.length - 1;
  const self = compoundMatch(ps[i], chain[j], state);
  if (self === null) { skipped.push(sel); return false; }
  if (!self) return false;
  i--; j--;
  while (i >= 0) {
    let hit = false;
    while (j >= 0) {
      const r = compoundMatch(ps[i], chain[j], { hover: false });
      if (r === null) { skipped.push(sel); return false; }
      j--;
      if (r) { hit = true; break; }
    }
    if (!hit) return false;
    i--;
  }
  return true;
}
function spec(sel) {
  const cls = (sel.match(/\.[A-Za-z_-][\w-]*/g) || []).length
            + (sel.match(/:hover/g) || []).length;
  const tag = (sel.replace(/\.[A-Za-z_-][\w-]*/g, ' ').replace(/:hover/g, ' ')
    .match(/[A-Za-z][\w-]*/g) || []).length;
  return cls * 100 + tag;
}
function decl(body, prop) {
  const re = new RegExp('(?:^|;)\\s*' + prop + '\\s*:\\s*([^;]+)', 'g');
  let m, last = null;
  while ((m = re.exec(body))) last = m[1].trim();
  return last;
}
/* 최종 값 — 브라우저처럼 특정도 → 적힌 차례 */
function resolve(chain, prop, state) {
  let best = null;
  ALL.forEach(r => {
    const v = decl(r.body, prop);
    if (v === null) return;
    if (!matches(r.sel, chain, state || {})) return;
    const s = spec(r.sel);
    if (!best || s > best.s || (s === best.s && r.order > best.order))
      best = { s, order: r.order, v, sel: r.sel };
  });
  return best;
}

const ROW = (kind, extra) => [
  { tag: 'div', cls: ['dm-f', 'sub', kind].concat(extra || []) }
];
const ICON = (kind, extra, ico) => [
  { tag: 'div', cls: ['dm-f', 'sub', kind].concat(extra || []) },
  { tag: 'span', cls: [ico] }
];

/* ── 견주는 자리 ── */
const CASES = [
  ['줄 바탕(평소)',      ROW('whobin'),        ROW('topicbin'),        'background'],
  ['줄 글자(평소)',      ROW('whobin'),        ROW('topicbin'),        'color'],
  ['줄 높이',            ROW('whobin'),        ROW('topicbin'),        'height'],
  ['글자 크기',          ROW('whobin'),        ROW('topicbin'),        'font-size'],
  ['고른 줄 바탕',       ROW('whobin', ['on']), ROW('topicbin', ['on']), 'background'],
  ['고른 줄 글자',       ROW('whobin', ['on']), ROW('topicbin', ['on']), 'color'],
  ['고른 줄 굵기',       ROW('whobin', ['on']), ROW('topicbin', ['on']), 'font-weight'],
  ['아이콘 색(평소)',    ICON('whobin', [], 'ic'), ICON('topicbin', [], 'dot'), 'color'],
  ['아이콘 색(고른 줄)', ICON('whobin', ['on'], 'ic'), ICON('topicbin', ['on'], 'dot'), 'color'],
  ['아이콘 상자 폭',     ICON('whobin', [], 'ic'), ICON('topicbin', [], 'dot'), 'width'],
  ['안읽음 숫자 색',     ICON('whobin', [], 'nu'), ICON('topicbin', [], 'nu'), 'color'],
];

test('★★ 두 대시보드의 «최종 색·크기»가 모두 같다 (계단을 풀어서 견준다)', () => {
  const bad = [];
  CASES.forEach(([what, a, b, prop]) => {
    const x = resolve(a, prop), y = resolve(b, prop);
    const xv = x ? x.v : '(정한 곳 없음)', yv = y ? y.v : '(정한 곳 없음)';
    if (xv !== yv) bad.push(what + ' — 담당자 ' + xv + ' (' + (x && x.sel) + ')'
      + ' vs 업무별 ' + yv + ' (' + (y && y.sel) + ')');
  });
  assert.deepEqual(bad, [], '두 대시보드의 색·크기가 다릅니다:\n  ' + bad.join('\n  '));
});

test('★ 손을 얹었을 때도 같다 — 한쪽만 달라지면 그때 눈에 띈다', () => {
  const a = resolve(ROW('whobin'), 'background', { hover: true });
  const b = resolve(ROW('topicbin'), 'background', { hover: true });
  assert.equal(a && a.v, b && b.v, '손을 얹었을 때 바탕색이 다릅니다');
});

test('★ 「내 메일」 줄은 눈에 띄되 «같은 갈래»다 — 보라처럼 딴 색이면 안 된다', () => {
  const me = resolve(ROW('whobin', ['meRow']), 'background');
  const base = resolve(ROW('topicbin'), 'background');
  assert.ok(me, '내 메일 줄 색을 정한 곳이 없습니다');
  assert.notEqual(me.v, base && base.v, '내 줄이 아예 안 도드라집니다');
  /* ⚠ 처음에는 「파랑이 빨강보다 크다」로 봤는데, 옛 연보라(#f7f4fe)도 그 조건을
       통과해 되돌림을 못 잡았다(2026-08-29 뮤테이션에서 걸렸다).
     ★ «색상(hue)»으로 본다 — 고른 줄 색과 같은 갈래여야 한다. 연보라는 258°,
       파랑은 212° 언저리라 여기서 갈린다. */
  const hueOf = (v) => {
    const hex = String(v).trim().replace('#', '');
    assert.equal(hex.length, 6, '6자리 색값이 아닙니다: ' + v);
    const r = parseInt(hex.slice(0, 2), 16) / 255,
          g = parseInt(hex.slice(2, 4), 16) / 255,
          b = parseInt(hex.slice(4, 6), 16) / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    if (!d) return null;                                   /* 무채색 */
    let h;
    if (mx === r) h = ((g - b) / d) % 6;
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60; if (h < 0) h += 360;
    return h;
  };
  const accent = resolve(ROW('topicbin', ['on']), 'background');
  assert.ok(accent, '고른 줄 색을 정한 곳이 없습니다');
  const hMe = hueOf(me.v), hAc = hueOf(accent.v);
  assert.ok(hMe !== null && hAc !== null, '내 줄·고른 줄이 무채색입니다');
  const gap = Math.min(Math.abs(hMe - hAc), 360 - Math.abs(hMe - hAc));
  assert.ok(gap <= 20,
    '내 줄(' + me.v + ', ' + Math.round(hMe) + '°)이 고른 줄('
    + accent.v + ', ' + Math.round(hAc) + '°)과 «다른 색 갈래»입니다 — 그쪽만 딴 화면으로 보입니다');
});

test('★ 이 검사가 «못 읽고 지나친» 규칙이 없다 — 있으면 조용히 거짓 초록이 된다', () => {
  /* 위 검사들을 한 번 돌려 skipped 를 채운다 */
  CASES.forEach(([, a, b, prop]) => { resolve(a, prop); resolve(b, prop); });
  /* ⚠ 예전에는 «개수»를 못 박았다(40개 미만). 그래서 이 검사와 아무 상관 없는 자리에
       (담당자 창 체크박스 같은) 규칙을 세 줄 더했더니 40이 되어 깨졌다 — 대시보드 색은
       한 톨도 안 바뀌었는데. 「지금 값」이 아니라 «규칙»을 본다(docs/검사-못박지-않기.md).
     ★ 여기서 정말 무서운 것은 «대시보드 줄을 겨누는» 규칙을 못 읽고 지나치는 것이다.
       그것을 지나치면 색이 다른데도 같다고 나온다 — 조용한 거짓 초록.
       그 밖의 선택자(:active·#menuM>… 같은 것)는 몇 개가 되든 이 검사와 무관하다. */
  const uniq = [...new Set(skipped)];
  const mine = uniq.filter(s => {
    /* 가짜요소(::before)는 «줄 자체»의 색·크기를 안 바꾼다 — 견주는 것과 무관하다.
       실측: .dm-fsec.who .nm::before(머리줄의 점) 둘이 여기 걸렸었다. */
    if(/::/.test(s)) return false;
    /* .dm-f «자체»만 본다 — .dm-fsec(머리줄)은 견주는 줄이 아니다.
       ⚠ /\.dm-f/ 로 쓰면 .dm-fsec 까지 걸린다(실제로 걸렸다). */
    return /\.dm-f(?![\w-])|whobin|topicbin|\.ic(?![\w-])|\.dot(?![\w-])|\.nu(?![\w-])/.test(s);
  });
  assert.deepEqual(mine, [],
    '★ 대시보드 줄을 겨누는 규칙을 못 읽고 지나쳤습니다 — 색이 달라도 같다고 나옵니다:\n  '
    + mine.join('\n  '));
});
