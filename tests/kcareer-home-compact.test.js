const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const kc = fs.readFileSync(path.join(__dirname, '..', 'kcareer.html'), 'utf8');

function phone520() {
  const at = kc.indexOf('@media(max-width:520px)');
  assert.ok(at >= 0);
  const open = kc.indexOf('{', at + 20);
  let depth = 0, i = open;
  for (; i < kc.length; i++) {
    if (kc[i] === '{') depth++;
    else if (kc[i] === '}' && --depth === 0) break;
  }
  return kc.slice(at, i + 1);
}

test('홈 격자는 폰에서 한 줄에 셋씩 — auto-fill 에 맡기지 않는다', () => {
  /* auto-fill 은 «들어가는 만큼» 이라 폰에서 늘 둘이었다(대표 지시 2026-08-20
     "한 줄에 2개 셀보다 더 넣어봐달라"). 칸 수를 못 박는다. */
  const b = phone520();
  assert.match(b, /\.home-tiles-grid,\.home-yr-grid\{[\s\S]*?grid-template-columns:repeat\(3,minmax\(0,1fr\)\)!important/);
  assert.match(kc, /class="home-tiles-grid"/, 'css 가 잡을 손잡이가 없습니다.');
  assert.match(kc, /class="home-yr-grid"/);
});

test('KPI 넷은 둘씩 그대로 둔다 — 셋으로 만들면 3+1 로 갈라진다', () => {
  /* 푸른이알피에서 똑같이 겪고 되돌린 적이 있다 — 남는 한 칸이 줄 하나를 통째로
     먹어, 칸을 늘렸는데 오히려 아래로 밀린다. */
  const b = phone520();
  assert.doesNotMatch(b, /\.kpi-grid\{[^}]*grid-template-columns:repeat\(3/,
    '★ KPI 는 넷뿐이라 셋으로 나누면 3+1 로 갈라집니다.');
});

test('바로가기 칸은 폰에서도 한 줄을 지킨다', () => {
  /* 두 줄로 만들면 칸이 셋이 되어도 키가 그대로라 컴팩트해지지 않는다 — 재어 보고
     되돌렸다. 자리는 숫자의 «알약 껍데기»를 벗겨 얻는다(껍데기는 꾸밈, 숫자가 알맹이). */
  const b = phone520();
  assert.doesNotMatch(b, /\.home-tiles-grid > div\{[^}]*flex-direction:column/,
    '★ 두 줄로 만들면 칸을 늘린 뜻이 없어집니다.');
  assert.match(b, /\.home-tiles-grid > div > span:last-child\{[^}]*background:none!important/);
  /* ⚠ 「＋ 생성」을 ＋ 로 줄이는 규칙은 바로 위 !important 보다 «좁게» 짚어야 이긴다 */
  assert.match(b, /\.home-tiles-grid > div > span\.tile-new\{font-size:0!important\}/,
    '★ `.home-tiles-grid .tile-new` 로는 위 규칙에 집니다(둘 다 !important).');
  assert.match(b, /span\.tile-new::before\{content:'＋'/, '＋ 를 안 살리면 빈 자리가 됩니다.');
  assert.match(kc, /class="tile-new"/);
});

test('연도 요약을 채운 뒤에는 「집계 대기」 자리표시의 빈 띠를 걷어 낸다', () => {
  /* .empty{padding:40px 0} 이 살아 있어 채운 뒤에도 위아래 80px 빈 띠가 남았다. */
  const at = kc.indexOf("var _hl = document.getElementById('homeList')");
  assert.ok(at > 0, 'homeList 채우는 자리를 찾지 못했습니다.');
  const fn = kc.slice(at, at + 700);
  const 뗌 = fn.indexOf("classList.remove('empty')");
  const 채움 = fn.indexOf('innerHTML');
  assert.ok(뗌 > 0 && 뗌 < 채움,
    '★ .empty 를 안 떼면 채운 뒤에도 80px 빈 띠가 남습니다.');
});
