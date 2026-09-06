/* 경력사항 — 경력관리에서 «골라» 가져온다 (대표 지시 2026-09-02)
   「경력사항은 경력관리에 가져오고 선택가능하게해줘」

   가져오는 길(openPull)은 처음부터 있었다. 없던 것은 둘이다:
     ① 그 길이 화면 «맨 아래» 단추줄에만 있었다 — 경력사항을 보고 있는 사람 눈에 안 띈다.
        폰에서는 열여덟 줄을 다 지나야 나온다.
     ② 창을 열어도 «하나씩» 눌러야 했다 — 열여덟 줄이면 열여덟 번이다.

   지키는 규칙:
     ⓐ 경력사항 칸 «옆»에서 바로 가져올 수 있다
     ⓑ 아래 단추줄의 길은 «그대로 둔다» — PC 에서 그것으로 일하던 손버릇을 뺏지 않는다
     ⓒ 한 갈래를 통째로 고르고 풀 수 있다
     ⓓ ★ 「전부 고르기」는 «이 갈래만» 고른다 — 모든 갈래를 한꺼번에 고르면
        자격증까지 딸려 들어가고, 나중에 하나씩 지워야 한다
   실행: node --test tests/home-career-pull.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'pu-home.html'), 'utf8');

test('ⓐ 경력사항 칸 옆에서 바로 가져올 수 있다', () => {
  /* ⚠ .fldbar 로 시작하는 칸이 여럿이다(이름·담당 업무·경력사항) — 첫 번째를 잡으면
     엉뚱한 칸을 본다. 「경력사항」 이라는 말이 있는 자리에서부터 찾는다. */
  const at = src.indexOf("'<label style=\"margin:0\">경력사항 — '");
  assert.ok(at > 0, '경력사항 칸의 머리줄을 못 찾았습니다');
  const 칸 = src.slice(at, at + 700);
  assert.match(칸, /onclick="openPull\(\)/,
    '★ 경력사항 옆에 가져오는 길이 없습니다 — 맨 아래까지 굴려야 찾습니다');
});

test('ⓑ 가져오는 단추는 «하나»다 — 이름이 둘이면 두 기능처럼 보인다', () => {
  /* ⚠ 2026-09-06 이 검사를 뒤집었다.
     원래는 «두 곳에 다 있어야» 했다 — PC 에서 아래 단추줄로 일하던 손버릇을
     안 뺏으려고 일부러 겹쳐 두었다. 그런데 이름을 다르게 지어 놓았다:
       아래 단추줄 「경력관리에서 «당겨오기»」 · 경력사항 옆 「⤓ 경력관리에서 «가져오기»」.
     같은 openPull 인데 «다른 기능»으로 보였고, 대표께서 그것을 「겹침」으로 짚으셨다.
     겹쳐 둘 것이면 이름이 같아야 한다 — 그럴 바에는 칸 옆 하나로 둔다(제 자리다).
     ★ 지킬 것은 「두 곳에 있는가」가 아니라 «칸 옆에서 바로 가져올 수 있는가»다.
       그 규칙은 위 ⓐ 검사가 지킨다. */
  assert.equal((src.match(/onclick="openPull\(\)"/g) || []).length, 1,
    '★★ 가져오는 단추가 둘입니다 — 같은 일인데 두 기능처럼 보입니다');
  /* 이름은 «사람이 보는 곳»에서 하나여야 한다 — 주석과 로그는 상관없다.
     주석에는 왜 뗐는지가 적혀 있어야 하므로 걷어내고 본다. */
  const 알맹이 = src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
  assert.ok(!/>경력관리에서 당겨오기</.test(알맹이) && !/경력관리에서 당겨오기<\/h2>/.test(알맹이),
    '★ 옛 이름(당겨오기)이 화면에 남아 있습니다 — 「가져오기」와 같은 일입니다');
});

test('ⓒ 한 갈래를 통째로 고르고 풀 수 있다', () => {
  assert.match(src, /function pullAll\(on\)/, '전부 고르는 함수가 없습니다');
  assert.match(src, /window\.pullAll = pullAll/, '화면에서 부를 수 없습니다');
  assert.match(src, /onclick="pullAll\(1\)"/, '「전부 고르기」 단추가 없습니다');
  assert.match(src, /onclick="pullAll\(0\)"/, '「고른 것 풀기」 단추가 없습니다');
});

/* ⓓ 진짜 함수를 떼어 돌린다 — 「이 갈래만」인지 눈으로 보지 말고 재어 본다 */
function 골라보기() {
  const at = src.indexOf('function pullAll(on)');
  const body = src.slice(at, src.indexOf('\n}', at) + 2);
  const ctx = {
    Pull: { kind: 'wiccok', sel: {}, items: { wiccok: [1, 2, 3], cert: [1, 2] } },
    renderPull() {}
  };
  vm.createContext(ctx);
  vm.runInContext(body, ctx);
  return ctx;
}

test('★ⓓ 「전부 고르기」는 «이 갈래만» 고른다 — 자격증이 딸려 들어가면 안 된다', () => {
  const ctx = 골라보기();
  vm.runInContext('pullAll(1)', ctx);
  assert.deepEqual(Object.keys(ctx.Pull.sel).sort(),
    ['wiccok:0', 'wiccok:1', 'wiccok:2'],
    '★ 보고 있지도 않은 갈래까지 골랐습니다 — 나중에 하나씩 지워야 합니다');
});

test('고른 것을 다시 풀 수 있다 — 다른 갈래는 그대로 둔다', () => {
  const ctx = 골라보기();
  ctx.Pull.sel['cert:0'] = true;          /* 다른 갈래에서 이미 골라 둔 것 */
  vm.runInContext('pullAll(1)', ctx);
  vm.runInContext('pullAll(0)', ctx);
  assert.deepEqual(Object.keys(ctx.Pull.sel), ['cert:0'],
    '★ 풀면서 다른 갈래에서 골라 둔 것까지 지웠습니다');
});

test('몇 건 골랐는지 화면이 말해 준다', () => {
  assert.match(src, /이 갈래에서 ' \+ 고른수 \+ '건 골랐습니다/,
    '고른 수를 안 알려 주면 다 골랐는지 알 수 없습니다');
});

test('고른 것이 없을 때 「풀기」는 눌리지 않는다', () => {
  assert.match(src, /pullAll\(0\)"'\s*\+\s*\(고른수 \? '' : ' disabled'\)/,
    '풀 것이 없는데 눌리는 단추는 「눌러도 아무 일 없는」 단추가 됩니다');
});
