/* 기업정보함 — 함수가 쓰이기 전에 만들어져 있는가 (2026-08-09)

   PC 로 기업정보함을 열 때마다 `allItems is not defined` 가 났다. 함수는 맨 아래
   <script> 에 있었는데 첫 화면을 그리는 코드는 그보다 앞 <script> 에 있었다.
   **함수 끌어올림(hoisting)은 자기 <script> 안에서만 된다** — 앞 덩어리가 돌 때
   뒤 덩어리는 아직 읽히지도 않았다.

   잠시 뒤 자료가 도착해 다시 그리면 정상으로 돌아와서 눈에 안 띄었다.
   그래서 사람 눈으로는 못 잡는다 — 검사로 못 박는다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'pu-cards.html'), 'utf8');
const lines = html.split('\n');

/* 인라인 <script> 덩어리들의 줄 범위 */
const blocks = [];
{
  let start = null;
  lines.forEach((l, i) => {
    const ln = i + 1;
    if (/<script(\s|>)/.test(l) && !/src=/.test(l)) start = ln;
    if (l.includes('</script>') && start) { blocks.push([start, ln]); start = null; }
  });
}
const blockOf = (ln) => blocks.findIndex(([a, b]) => a <= ln && ln <= b);

function defLine(name) {
  const i = lines.findIndex(l => l.startsWith('function ' + name + '('));
  return i < 0 ? -1 : i + 1;
}
function useLines(name) {
  const out = [];
  lines.forEach((l, i) => {
    if (l.includes(name + '(') && !l.startsWith('function ' + name + '(')) out.push(i + 1);
  });
  return out;
}

test('인라인 스크립트 덩어리를 찾을 수 있다', () => {
  assert.ok(blocks.length >= 2, '덩어리를 못 찾으면 이 검사는 아무것도 못 지킵니다.');
});

/* 여러 덩어리에 걸쳐 쓰이는 함수들 — 여기 이름을 더하면 함께 지켜진다 */
for (const name of ['allItems', 'allGroups', 'isPrivItem', 'isPrivGroup', '_syncSearchX', 'syncPcSearchFor']) {
  test(`★ ${name} 은 쓰이기 전에 만들어져 있다`, () => {
    const d = defLine(name);
    assert.ok(d > 0, `${name} 정의를 찾지 못했습니다.`);
    const db = blockOf(d);
    for (const u of useLines(name)) {
      const ub = blockOf(u);
      if (ub === db) {
        continue;   // 같은 덩어리면 끌어올림이 되므로 순서를 안 따진다
      }
      assert.ok(ub > db,
        `${name} 이 ${d}번째 줄(덩어리 ${db + 1})에서 만들어지는데 ` +
        `${u}번째 줄(덩어리 ${ub + 1})에서 먼저 쓰입니다. ` +
        `앞 덩어리가 돌 때 뒤 덩어리는 아직 안 읽혔습니다 — 화면이 한 번 깨집니다.`);
    }
  });
}
