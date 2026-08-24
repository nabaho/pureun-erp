/* 포털 아이콘 — 열이 안 맞던 것 (대표 지시 2026-08-24 「아이콘열이 안 맞다」)
   그리고 아이콘 아래 «설명 줄» 을 걷어낸 것 (같은 날 「제목 아래 설명 필요 없다.
   차라리 PC에서는 마우스 올리면 나오게 하고 폰에서는 두 번째 줄 없애라」)

   ★ 열이 안 맞던 까닭: .tiles 가 96px 짜리 타일을 «흘려보내는» 줄바꿈이었다.
     그래서 한 줄에 몇 개가 서는지를 화면 폭이 정했다 — 재어 보니
       384px → 3/3/2 · 412px → 4/4 · 520px → 5/3 · 640px → 6/2
     마지막 줄만 덩그러니 남고, 폰마다 다른 모양이 됐다.
     360px 에서는 타일 하나가 왼쪽 −14px 에서 시작해 화면 밖에 있었다.

   ★ 고친 방식: 폰에서는 열을 «넷으로 못 박는다». 폭이 좁아지면 개수가 아니라
     칸이 줄어든다. 재어 보니 360·384·412·480·520·640px 어디서도 4/4 다.

   ⚠ minmax(0,1fr) 이어야 한다. 그냥 1fr 은 «글자보다 좁아지지 못해» 넘친다 —
     예전 380px 구간이 repeat(4,1fr) 이었고, 그것이 −14px 의 정체였다.
     이 검사가 그 함정을 다시 못 밟게 막는다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const enter = fs.readFileSync(path.join(__dirname, '..', 'enter.html'), 'utf8');

/* 좁은 화면 구간을 통째로 떼어 온다 (520·640·380 … 띄어쓰기가 제각각이라 한 벌로) */
function narrow() {
  const out = [];
  const re = /@media ?\(max-width: ?(\d+)px\)/g;
  let m;
  while ((m = re.exec(enter))) {
    if (+m[1] > 640) continue;
    let i = enter.indexOf('{', m.index + m[0].length - 1) + 1, d = 1;
    for (; i < enter.length && d > 0; i++) {
      if (enter[i] === '{') d++;
      else if (enter[i] === '}') d--;
    }
    out.push(enter.slice(m.index, i));
  }
  return out;
}
const BLOCKS = narrow();
const PHONE = BLOCKS.join('\n');

test('★ 폰에서 한 줄에 서는 개수는 «화면 폭이 정하지 않는다»', () => {
  /* 흘려보내면(flex-wrap) 폰마다 3개·4개·5개로 갈린다. 열을 못 박아야 한 모양이다. */
  assert.match(PHONE, /\.tiles\{[^}]*display:grid/,
    '★ 타일이 흘러가면 화면 폭마다 줄당 개수가 달라집니다.');
  const m = PHONE.match(/\.tiles\{[^}]*grid-template-columns:([^;}]*)/);
  assert.ok(m, '열 규칙을 찾지 못했습니다');
  assert.match(m[1], /repeat\(4,/, '★ 폰은 네 열로 못 박습니다.');
});

test('★ 칸은 «글자보다 좁아질 수 있어야» 한다 — 1fr 만으로는 넘친다', () => {
  /* 1fr = minmax(auto,1fr) 이라 글자의 최소 너비 아래로는 안 줄어든다.
     360px 에서 타일이 왼쪽 −14px 로 밀려 나간 것이 바로 이것이었다. */
  const cols = PHONE.match(/\.tiles\{[^}]*grid-template-columns:([^;}]*)/)[1];
  assert.match(cols, /minmax\(0, ?1fr\)/,
    '★ minmax(0,1fr) 이 아니면 좁은 폰에서 타일이 화면 밖으로 나갑니다: ' + cols);
  /* 예전 규칙이 어딘가 남아 있으면 좁은 구간에서 그것이 이긴다 */
  assert.doesNotMatch(PHONE, /grid-template-columns:repeat\(4,1fr\)/,
    '★ 예전 repeat(4,1fr) 이 남아 있습니다 — 좁아지면 도로 넘칩니다.');
  assert.match(PHONE, /\.tile\{[^}]*min-width:0/,
    '★ min-width:0 이 없으면 격자 칸은 안 줄어듭니다.');
  assert.match(PHONE, /\.tile b\{[^}]*text-overflow:ellipsis/,
    '★ 이름이 안 줄어들면 칸을 아무리 좁혀도 넘칩니다.');
});

test('★ 아이콘 아래 설명 줄은 «없애는 것이 아니라 옮긴 것» 이다', () => {
  /* 폰에서는 두 번째 줄을 걷고, PC 에서는 마우스를 올리면 나온다. */
  assert.match(enter, /a\.title = app\.name \+ \(app\.desc/,
    '★ 설명을 어디에도 안 두면 그냥 없앤 것입니다 — PC 에서는 올리면 나와야 합니다.');
  const at = enter.indexOf('a.innerHTML =');
  assert.ok(at > 0, '타일 마크업을 찾지 못했습니다');
  const mk = enter.slice(at, at + 500);
  assert.ok(mk.indexOf('app.desc') < 0,
    '★ 설명이 아직 타일 안에 그려집니다 — 두 번째 줄이 그대로 남습니다.');
});

test('★ 「PC 전용」만은 줄로 남긴다 — 그것은 설명이 아니라 경고다', () => {
  /* 폰에서 눌러도 안 열리는 앱이다(기금관리). 감추면 왜 안 열리는지 알 길이 없다. */
  const at = enter.indexOf('a.innerHTML =');
  const mk = enter.slice(at, at + 500);
  assert.match(mk, /mobileLocal \? '<span>PC 전용<\/span>' : ''/,
    '★ 「PC 전용」까지 걷으면 폰에서 눌리지 않는 까닭이 사라집니다.');
});
