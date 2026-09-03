/* AGENTS.md — Codex·Copilot 을 위한 «같은 문» (대표 지시 2026-09-03 「코덱스 연결」)
 *
 * ■ 왜 필요한가
 *   이 저장소의 규칙은 지금까지 CLAUDE.md 한 곳에만 있었다.
 *   그런데 Codex·Copilot 은 CLAUDE.md 를 «안 읽는다» — 그것들은 AGENTS.md 를 읽는다.
 *   즉 대표가 Codex 를 붙이면, 그 순간부터 Codex 는
 *     · 검사에 「지금 값」을 그대로 박고
 *     · 팔레트 밖 색을 새로 만들고
 *     · 만들어지는 JSON(파이어베이스 규칙)을 손으로 고치고
 *     · ?v= 를 안 올려 「고쳤는데 안 고쳐진」 상태로 두고
 *     · 새 폴더를 지우는 목록에 안 넣어 인터넷에 공개한다.
 *   몇 달에 걸쳐 세운 울타리를 «모르는 채로» 넘는다. 그것을 막는 문이 이 파일이다.
 *
 * ■ 무엇을 못 박나 — 있는가가 아니라 «맞는 말을 하는가»
 *   ① 문이 있다
 *   ② ★ 가리키는 검사가 실제로 있다 — 없는 검사를 대면 «거짓 안내»가 된다
 *   ③ ★ 적어 둔 「지움 목록」이 배포 게이트와 어긋나지 않는다
 *      (어긋난 안내는 없는 것보다 나쁘다 — 읽은 사람이 안심하고 틀린다)
 *   ④ 이 문도 배포본에는 안 올라간다
 * 실행: node --test tests/agents-md.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const 읽기 = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const agents = 읽기('AGENTS.md');
const yml = 읽기('.github/workflows/deploy-pages.yml');

test('① Codex·Copilot 이 읽는 문이 있다', () => {
  assert.ok(agents.length > 800, 'AGENTS.md 가 너무 짧습니다 — 규칙이 안 담깁니다');
  /* CLAUDE.md 가 «본»이라는 것을 밝혀 둔다 — 둘이 어긋날 때 어느 쪽을 믿을지 */
  assert.match(agents, /CLAUDE\.md/, '★ 어느 것이 본인지 안 밝히면 둘이 어긋날 때 헷갈립니다');
});

test('★② 가리키는 검사가 «실제로» 있다 — 없는 검사를 대면 거짓 안내다', () => {
  const 댄것 = [...agents.matchAll(/`(tests\/[\w-]+\.test\.js)`/g)].map((m) => m[1]);
  assert.ok(댄것.length >= 5,
    '★ 지키는 검사를 안 대면 「누가 막아 주는지」를 알 수 없습니다 (' + 댄것.length + '개)');
  for (const f of new Set(댄것)) {
    assert.ok(fs.existsSync(path.join(root, f)),
      '★ AGENTS.md 가 없는 검사(' + f + ')를 대고 있습니다 — 읽은 사람이 헛것을 찾습니다');
  }
  /* 스크립트도 마찬가지 — 이름이 바뀌면 안내가 먼저 낡는다 */
  for (const s of [...agents.matchAll(/`(scripts\/[\w-]+\.js)`/g)].map((m) => m[1])) {
    assert.ok(fs.existsSync(path.join(root, s)),
      '★ 없는 스크립트(' + s + ')를 대고 있습니다');
  }
});

test('★★③ 적어 둔 「지움 목록」이 배포 게이트와 어긋나지 않는다', () => {
  /* 게이트의 진짜 목록 */
  const m = /for d in ([\s\S]*?); do/.exec(yml);
  assert.ok(m, '배포 게이트의 지우는 목록을 못 찾았습니다');
  const 진짜 = m[1].replace(/\\\s*\n/g, ' ').trim().split(/\s+/).filter(Boolean);
  assert.ok(진짜.length >= 10, '지우는 목록이 너무 짧습니다');

  /* AGENTS.md 가 적어 둔 목록 */
  const at = agents.indexOf('지움:');
  assert.ok(at > 0, '★ AGENTS.md 에 「지움」 목록이 없습니다 — 새 폴더가 인터넷에 공개됩니다');
  const 적은것 = agents.slice(at, agents.indexOf('남김:', at));

  for (const d of 진짜) {
    assert.ok(적은것.indexOf(d) > 0,
      '★★ 게이트는 「' + d + '」를 지우는데 AGENTS.md 에는 없습니다 — '
      + '읽은 사람이 그 폴더를 안전한 줄 압니다');
  }
});

test('★④ 이 문도 배포본에는 안 올라간다', () => {
  /* 최상위 *.md 를 지우므로 이미 사라지지만, 「사라졌는가」를 확인하는
     멈춤 목록에도 들어 있어야 한다 — 지우는 대목이 낡아도 거기서 걸린다. */
  const g = /for gone in ([\s\S]*?); do/.exec(yml);
  assert.ok(g, '멈춤 목록을 못 찾았습니다');
  assert.match(g[1], /AGENTS\.md/,
    '★ AGENTS.md 가 배포본에 남아도 아무도 안 막습니다 — 내부 규칙이 인터넷에 공개됩니다');
});

test('CLAUDE.md 와 «같은 것»을 가리킨다 — 한쪽만 고치면 다른 도구가 눈이 먼다', () => {
  const claude = 읽기('CLAUDE.md');
  /* 두 문이 같은 문지기를 대는가. 이름이 아니라 «가리키는 검사»로 견준다. */
  for (const f of ['tests/test-pin-guard.test.js', 'tests/one-line-cells.test.js',
    'tests/ontology-contract.test.js']) {
    assert.ok(claude.indexOf(f) > 0, 'CLAUDE.md 가 ' + f + ' 를 안 답니다');
    assert.ok(agents.indexOf(f) > 0,
      '★ CLAUDE.md 에만 있는 규칙입니다(' + f + ') — Codex 는 그것을 모른 채 고칩니다');
  }
});
