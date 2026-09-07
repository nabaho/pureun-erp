'use strict';
/* 규정관리 — 발밑 안내 다섯 줄을 걷고 그만큼 판을 내린다 (대표 지시 2026-09-07).

   화면 맨 아래에 안내가 세 줄(1900px 에서 78px)을 늘 차지하고 있었다. 늘 같은 글이라
   아무도 두 번 읽지 않는데, 정작 일하는 판을 그만큼 밀어 올리고 있었다.

   ⚠ **지우지 않는다.** 셋 중 하나는 「본 결과는 규칙 기반 자동 검토이며 최종 판단은
     공인노무사의 검토를 거쳐야 합니다」다. 노무 도구에서 그 문구가 조용히 사라지면
     안 된다. 그래서 «자리를 옮긴다» — 이 저장소가 계속 써 온 방식이다(설계서 §0).

   ★ 어디로 옮기나 — 두 곳이다.
     ㉠ 전문(全文)은 `⋯ 참고` 서랍의 여섯째 칸(ⓘ 이 화면 안내)으로. 서랍은 이미
        다섯 도구를 담고 있어 «세로 비용이 0» 이다.
     ㉡ 「최종 판단은 공인노무사」 한 마디는 «검토 결과 판 머리»에 붙인다.
        발밑은 아무도 안 보지만 결과를 읽는 자리는 본다 — 단서가 필요한 곳이 거기다.
        `규칙집 v3 · 89항목` 옆이라 이것도 세로 비용이 0 이다.

   실행: node --test tests/rules-note-fold.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.join(__dirname, '..', 'rules.html'), 'utf8').replace(/\r\n/g, '\n');

/* .wrap 안(= 세로를 먹는 흐름) 만 잘라 온다 */
function wrapBody() {
  const a = src.indexOf('<div class="wrap">');
  assert.ok(a >= 0, '.wrap 을 찾지 못했습니다');
  let d = 0;
  for (let i = a; i < src.length; i++) {
    if (src.startsWith('<div', i)) d++;
    else if (src.startsWith('</div>', i)) { d--; if (d === 0) return src.slice(a, i + 6); }
  }
  throw new Error('.wrap 의 끝을 못 찾음');
}

/* 안내가 담고 있던 것 — 한 조각도 잃으면 안 된다 */
const 안내조각 = [
  'Firebase 보관함에 저장',
  '검토한 담당자만 그 사업장 규정을 고칠 수 있고',
  'HWP 파싱은 브라우저 안에서만',
  'rhwp WASM',
  '최종 판단은 공인노무사의 검토를 거쳐야',
];

test('★★ 안내 문구가 한 조각도 사라지지 않았다', () => {
  const 잃은것 = 안내조각.filter((s) => !src.includes(s));
  assert.deepEqual(잃은것, [],
    '지우는 것이 아니라 «옮기는» 것입니다. 사라진 문구: ' + 잃은것.join(' / '));
});

test('★★ 그 안내가 이제 세로를 안 먹는다 — 흐름에서 빠졌다', () => {
  assert.ok(!/<div class="note">/.test(wrapBody()),
    '안내가 아직 .wrap 안에 있어 판을 밀어 올립니다');
});

test('★ 전문으로 가는 길이 있다 — ⋯ 참고 서랍의 여섯째 칸', () => {
  const dr = src.slice(src.indexOf('id="ref-drawer"'), src.indexOf('id="ref-drawer"') + 1400);
  assert.match(dr, /id="open-help"/, '서랍에 안내 칸이 없습니다');
  assert.match(src, /id="ov-help"/, '안내를 보여 줄 창이 없습니다');
  assert.match(src, /\$\("open-help"\)\.addEventListener/, '단추가 아무 일도 하지 않습니다');
});

test('★ 서랍의 다섯 도구는 그대로 있다 — 안내를 넣었다고 밀려나지 않았다', () => {
  ['open-std', 'open-bank', 'open-arch', 'open-arts', 'open-cb']
    .forEach((id) => assert.match(src, new RegExp('id="' + id + '"'), id + ' 이 없어졌습니다'));
});

test('★★ 「최종 판단은 공인노무사」는 결과를 «읽는 자리»에도 남는다', () => {
  /* 서랍 안에만 두면 아무도 안 본다. 검토 결과 판 머리(규칙집 v3 … 옆)에 붙인다. */
  const at = src.indexOf('rb-tag');
  assert.ok(at >= 0, 'rb-tag 를 찾지 못했습니다');
  const 채우는곳 = src.slice(src.indexOf('$("rb-tag").textContent'), src.indexOf('$("rb-tag").textContent') + 400);
  assert.match(채우는곳, /노무사/,
    '결과 판 머리에 단서가 없습니다 — 「위반의심 0」이 «깨끗하다»로 읽힙니다');
});

test('★ 판이 그만큼 내려왔다 — 아래 여백도 줄였다', () => {
  const m = /\n\.wrap\{max-width:none;margin:12px auto (\d+)px/.exec(src);
  assert.ok(m, '.wrap 의 아래 여백을 찾지 못했습니다');
  assert.ok(Number(m[1]) <= 12,
    '아래 여백이 아직 ' + m[1] + 'px 입니다 — 안내를 걷은 만큼 판이 내려와야 합니다');
});

test('창을 채우는 얼개는 그대로다 — #1027·#1056 을 되돌린 것이 아니다', () => {
  assert.match(src, /@media\s+screen\s+and\s*\(min-width:\s*901px\)/);
  assert.match(src, /\.wrap\{flex:1;display:flex;flex-direction:column;min-height:0;width:100%\}/);
});
