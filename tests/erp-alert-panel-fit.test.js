/* 🔔 알림 판이 폰에서 화면 밖으로 나가던 것 (대표 화면 2026-08-23)

   right:150px 에 width:360px 을 붙여 두었다. 넓은 화면에서는 맞지만
   412px 폰에서는 왼쪽 끝이 412 − 150 − 360 = **−98px** 이라 글 앞이 잘렸다.
   대표 화면에 「…성수 275건 38,164,490원」처럼 회사 이름 앞이 없어진 채로 보였다.

   ★ 못 박는 것은 «px 값» 이 아니라 규칙이다 —
     ① 폭이 화면을 넘지 않는다 (좁으면 화면만큼 줄어든다)
     ② 오른쪽 자리도 폭을 따라 당겨진다 (안 그러면 폭만 줄고 여전히 왼쪽으로 넘친다)
   ⚠ 이 판은 안쪽 style= 로 자리를 잡는다 — 스타일시트로 고치려면 !important 가
     필요하고 그러면 두 곳을 봐야 한다. 그래서 안쪽 style= 자체를 고쳤다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const erp = fs.readFileSync(path.join(__dirname, '..', 'pu-erp.html'), 'utf8');

/* 이어 붙인 문자열 조각('a'+'b'+…)을 하나로 합쳐 돌려준다 */
function panelStyle() {
  const at = erp.indexOf("panel.style.cssText=");
  assert.ok(at > 0, '알림 판 style 을 찾지 못했습니다');
  const end = erp.indexOf(';\n', erp.indexOf('padding:14px', at));
  const raw = erp.slice(at, end);
  return (raw.match(/'([^']*)'/g) || []).map(s => s.slice(1, -1)).join('');
}

test('★ 알림 판은 화면보다 넓어지지 않는다', () => {
  const st = panelStyle();
  /* 폭은 --w 로 한 번 정해 두고 width·right 가 함께 쓴다 — 두 곳에 같은 식을
     베껴 두면 한쪽만 고치는 날이 온다. */
  assert.match(st, /--w:[^;]*100vw/, '★ 폭이 고정값이면 좁은 폰에서 화면을 넘습니다.');
  assert.match(st, /width:var\(--w\)/, '★ 정해 둔 폭을 안 쓰면 뜻이 없습니다.');
});

test('★ 오른쪽 자리도 폭을 따라 당겨진다 — 폭만 줄이면 여전히 왼쪽으로 넘친다', () => {
  /* width 만 줄이고 right:150px 을 그대로 두면 360px 폰에서
     왼쪽 끝이 360 − 150 − 344 = −134px 로 «더» 나간다. */
  const st = panelStyle();
  const m = st.match(/right:([^;]*)/);
  assert.ok(m, 'right 를 찾지 못했습니다');
  assert.ok(/100vw/.test(m[1]),
    '★ right 가 고정값이면 폭을 줄여도 판이 왼쪽으로 넘칩니다.');
});

test('넓은 화면에서는 예전 자리 그대로다 (right 150px)', () => {
  /* PC 는 바뀌지 않는 것이 이번 범위의 약속이다. */
  const st = panelStyle();
  assert.match(st, /150px/, '넓은 화면의 자리가 사라졌습니다.');
});

/* ── 실제로 재 본다 — 규칙만 보면 「식은 그럴듯한데 값은 화면 밖」을 못 잡는다 ── */
test('★ 360·412·768·1280 어디서도 화면 밖으로 안 나간다', () => {
  const st = panelStyle();
  const wM = st.match(/--w:min\((\d+)px, calc\(100vw - (\d+)px\)\)/);
  const rM = st.match(/right:max\((\d+)px, min\((\d+)px, calc\(100vw - (\d+)px - var\(--w\)\)\)\)/);
  assert.ok(wM && rM, '★ 폭·오른쪽 식이 바뀌었으면 이 검사도 함께 봐야 합니다: ' + st);
  const [wMax, wPad] = [+wM[1], +wM[2]];
  const [rMin, rMax, rPad] = [+rM[1], +rM[2], +rM[3]];
  [320, 360, 412, 768, 1280].forEach(function (vw) {
    const w = Math.min(wMax, vw - wPad);
    const right = Math.max(rMin, Math.min(rMax, vw - rPad - w));
    const left = vw - right - w;
    assert.ok(left >= 0, '★ ' + vw + 'px 에서 왼쪽이 ' + left + 'px — 화면 밖입니다.');
    assert.ok(left + w <= vw, '★ ' + vw + 'px 에서 오른쪽이 화면을 넘습니다.');
  });
  /* 넓은 화면은 예전 그대로여야 한다 */
  const wide = Math.max(rMin, Math.min(rMax, 1280 - rPad - Math.min(wMax, 1280 - wPad)));
  assert.equal(wide, 150, '검사고정-허용 — PC 자리를 안 건드린다는 것이 이 검사의 뜻이다');
});
