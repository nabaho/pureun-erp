/* 원본이 없을 때 — 까만 화면 대신 사실과 할 일 (대표 보고 2026-08-13)
   "화면이 전혀 안 나오는 경우 어떻게 해야 하나"

   실사례: 신청서 2/2쪽을 열었더니 오른쪽이 통째로 까맣고, 아래에 회색 글씨로
   「사진 본문을 불러오지 못했습니다」 한 줄뿐이었다. 무슨 일인지도, 무엇을
   해야 하는지도 알 수 없었다. 왼쪽 판독 결과는 멀쩡히 다 읽혀 있었는데도.

   ⚠ 이 기능에서 지켜야 할 것 둘:
     · **원인을 단정하지 않는다** — 올릴 때 끊겼는지 다른 기기에서 지워졌는지
       화면에서는 알 수 없다. 아는 것만 말한다.
     · **읽어 둔 값을 덮지 않는다** — 사진이 없어도 판독 결과는 쓸 물건이다.
       예전 문구 「지워 주세요」는 그 값까지 함께 잃게 만든다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'pu-photos.html'), 'utf8');

function fnOf(name) {
  const m = app.match(new RegExp('function ' + name + '\\([\\s\\S]*?\\r?\\n\\}'));
  assert.ok(m, name + ' 을 찾을 수 없습니다');
  return m[0];
}

function boot() {
  const panel = { innerHTML: '<div class="box">읽어 둔 값</div>' };
  const hint = { textContent: '' };
  const ctx = {
    String,
    $: function (id) { return id === 'readPanel' ? panel : hint; },
    safeSrc: function (v) { return v ? String(v) : ''; },
    esc: function (s) { return String(s); },
    __panel: panel, __hint: hint
  };
  vm.createContext(ctx);
  vm.runInContext(fnOf('showNoBody'), ctx);
  return ctx;
}

test('★ 까만 화면 대신 무슨 일인지 말한다', () => {
  const c = boot();
  c.showNoBody({ thumb: '' }, '');
  assert.match(c.__panel.innerHTML, /원본이 없습니다/, '무슨 일인지 화면이 말해야 합니다');
  assert.match(c.__hint.textContent, /안내를 봐 주세요/, '아래 한 줄이 위 안내를 가리켜야 합니다');
});

test('★ 읽어 둔 값을 덮지 않는다', () => {
  /* 사진이 없어도 판독 결과는 그대로 쓸 수 있다 — 덮으면 그것까지 잃는다 */
  const c = boot();
  c.showNoBody({ thumb: '' }, '');
  assert.match(c.__panel.innerHTML, /읽어 둔 값/, '판독 결과가 사라졌습니다');
  assert.ok(c.__panel.innerHTML.indexOf('원본이 없습니다') < c.__panel.innerHTML.indexOf('읽어 둔 값'),
    '안내는 맨 위에 얹혀야 눈에 먼저 들어옵니다');
});

test('★ 원인을 단정하지 않는다', () => {
  const c = boot();
  c.showNoBody({ thumb: '' }, '');
  const h = c.__panel.innerHTML;
  assert.match(h, /끊겼거나.*지워졌을 수 있습니다/,
    '화면에서는 원인을 알 수 없습니다 — 단정하면 엉뚱한 곳을 고치게 됩니다');
  /* 「지워 주세요」로 몰지 않는다 — 읽어 둔 값까지 잃는다 */
  assert.ok(h.indexOf('지워 주세요') < 0, '지우라고 하면 멀쩡한 판독 결과까지 잃습니다');
  assert.match(h, /다시 올려 주세요/, '무엇을 해야 하는지가 없습니다');
});

test('★ 미리보기가 있으면 그것이라도 남긴다', () => {
  const c = boot();
  c.showNoBody({ thumb: 'data:image/jpeg;base64,AAA' }, '');
  assert.match(c.__hint.textContent, /미리보기만/, '작아도 무엇이었는지는 보여야 합니다');
  assert.match(c.__panel.innerHTML, /작은 미리보기만 남아 있고/);

  const c2 = boot();
  c2.showNoBody({ thumb: '' }, '');
  assert.match(c2.__panel.innerHTML, /원본도 미리보기도 저장돼 있지 않습니다/,
    '둘 다 없는 것과 미리보기만 있는 것은 다른 상황입니다');
});

test('★ 서버가 준 까닭이 있으면 함께 적는다', () => {
  const c = boot();
  c.showNoBody({ thumb: '' }, 'Permission denied');
  assert.match(c.__panel.innerHTML, /원인: Permission denied/,
    '까닭을 감추면 다음에 같은 일이 나도 원인을 못 짚습니다');
  const c2 = boot();
  c2.showNoBody({ thumb: '' }, '');
  assert.ok(c2.__panel.innerHTML.indexOf('원인:') < 0, '까닭이 없으면 빈 줄을 만들지 않습니다');
});

test('★ 크게 보기가 이 안내를 실제로 부른다', () => {
  const open = fnOf('openViewer');
  assert.match(open, /showNoBody\(it, ''\)/, '본문이 비었을 때 안내를 안 부릅니다');
  assert.match(open, /catch\(function \(e\) \{ showNoBody\(it, \(e && e\.message\) \|\| String\(e\)\); \}\)/,
    '읽기가 터졌을 때도 같은 안내여야 합니다 — 터지면 조용한 것이 가장 나쁩니다');
});

test('★ 격자에서도 「다시 올려 주세요」로 보인다', () => {
  /* ⚠ 2026-08-24: 실패 문구를 까닭별로 갈라 readFailAdvice 로 모았다(딱지가 거의 다
     「판독 실패 — 다시 판독」 하나여서 헛수고 재시도를 부르던 것을 고쳤다).
     지킬 것은 「격자에서 무엇을 해야 하는지 보인다」이므로 겨누는 자리를 옮겼다. */
  const w = fnOf('checkWhy');
  assert.match(w, /if \(r\.error\) return readFailAdvice\(r\);/,
    '★ 격자 딱지가 실패 조언을 안 씁니다');
  const a = fnOf('readFailAdvice');
  assert.match(a, /원본이 없습니다 — 사진만 다시 올려 주세요/,
    '열어 봐야만 알면 확인 필요 목록에서 무엇을 할지 모릅니다');
  /* 본문이 없는 실패가 그 문구로 가는지 — 규칙표를 실제로 견준다 */
  const rules = app.match(/^const READ_FAIL_RULES = \[[\s\S]*?\n\];$/m)[0];
  assert.match(rules, /kind: 'reup',\s*re: \/본문/,
    '★ 「본문」 실패가 「다시 올려 주세요」 갈래에 안 걸립니다');
  assert.ok(a.indexOf('사진이 비었습니다 — 지워 주세요') < 0,
    '지우라고 하면 멀쩡한 판독 결과까지 잃습니다');
});
