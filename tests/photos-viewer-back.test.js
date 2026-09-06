/* 크게 보기 — 눈에 보이는 「← 돌아가기」와 폰 뒤로 가기 (대표 지시 2026-08-13)
   "다시 전 화면으로 가면 현재 마우스로 클릭하면 돌아가는 기능이 있다.
    하지만 백 버튼이 있으면 좋겠다."

   닫는 길은 셋이나 있었다(바깥 클릭·Esc·닫기 ✕) — 다만 **왼쪽 위 뒤로 가기**가
   없었다. 어느 화면에서나 있는 그 자리에 없으면 길을 아는 사람만 나온다.

   ⚠ 폰 뒤로 가기가 사진첩을 통째로 나가 버리던 것도 함께 고쳤다.
     여기서 가장 위험한 것은 **역사 칸이 어긋나는 것**이다 —
     쌓기만 하고 안 빼면 뒤로 가기를 두 번 눌러야 하고,
     빠진 뒤에 또 빼면 사진첩 밖으로 튕긴다. */
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

test('★ 눈에 보이는 「← 돌아가기」 단추가 있다', () => {
  assert.match(app, /<button class="vback" onclick="closeViewer\(\)">← 돌아가기<\/button>/,
    '닫는 길이 셋이나 있어도 보이지 않으면 길을 아는 사람만 나옵니다');
  assert.match(app, /#viewer \.bar \.vback\{/, '단추 꾸밈이 없으면 글자만 덩그러니 놓입니다');
  /* 제목줄 맨 앞이어야 한다 — 어느 화면에서나 뒤로 가기가 있는 그 자리 */
  const bar = app.match(/<div class="bar"><button class="vback"[\s\S]*?<\/div>/);
  assert.ok(bar, '제목줄에서 「← 돌아가기」가 맨 앞이 아닙니다');
  assert.ok(bar[0].indexOf('viewerInfo') > bar[0].indexOf('vback'),
    '돌아가기가 제목보다 뒤에 있으면 눈이 먼저 가지 않습니다');
});

test('기존에 닫던 길들은 그대로 남는다', () => {
  assert.match(app, /onclick="closeViewer\(\)">닫기 ✕/, '오른쪽 ✕ 를 없애면 안 됩니다');
  assert.match(app, /id="viewerPic" onclick="picClick\(event\)"/, '바깥 눌러 닫기가 사라졌습니다');
});

/* ── 폰 뒤로 가기 ── */
function boot() {
  const hist = { stack: [], back: 0 };
  const listeners = {};
  const el = function () {
    return { style: {}, classList: { remove() {}, add() {}, toggle() {} },
             innerHTML: '', textContent: '', src: '' };
  };
  const ctx = {
    console,
    viewerId: null,
    viewerPushed: false,
    history: {
      pushState: function (s) { hist.stack.push(s); },
      back: function () { hist.back++; hist.stack.pop(); }
    },
    window: { addEventListener: function (k, fn) { listeners[k] = fn; } },
    $: el,
    /* 2026-08-29: 닫을 때 **편집 상태를 비운다** — 안 비우면 다음 사진에 앞 사진의
       네모가 얹혀 있고, 저장하면 엉뚱한 사진이 고쳐진다. */
    PuRrnMaskUi: { blank: function () { return { status: 'idle', boxes: [] }; } },
    renderViewerEdit: function () {},
    photoMask: null,
    __hist: hist,
    __fire: function () { if (listeners.popstate) listeners.popstate(); }
  };
  vm.createContext(ctx);
  vm.runInContext('var viewerId = null; var viewerPushed = false;', ctx);
  vm.runInContext(fnOf('viewerHistPush'), ctx);
  /* 2026-09-06: 걸음을 빼는 일은 puHistDrop 한 곳으로 모았다 — 빼기 «전에»
     「이 걸음은 우리가 썼다」는 표를 세워야 공통 뒤로가기(js/pu-back.js)가
     그 걸음을 사람이 누른 것으로 읽고 앱을 나가는 일이 없다.
     ⚠ 가짜를 넣으면 안 된다 — 진짜를 넣어야 그 표까지 함께 지켜진다. */
  vm.runInContext(fnOf('puHistDrop'), ctx);
  vm.runInContext(app.match(/window\.addEventListener\('popstate', function \(\) \{[\s\S]*?\n\}\);/)[0], ctx);
  vm.runInContext(fnOf('closeViewer'), ctx);
  return ctx;
}

test('★ 열면 역사에 한 칸을 쌓는다 — 폰 뒤로 가기가 사진첩을 나가지 않게', () => {
  const c = boot();
  c.viewerHistPush();
  assert.equal(c.__hist.stack.length, 1, '한 칸을 안 쌓으면 뒤로 가기가 사진첩을 통째로 나갑니다');
  assert.equal(c.viewerPushed, true);
});

test('★ 폰 뒤로 가기로 닫힌다 — 그리고 역사를 또 빼지 않는다', () => {
  const c = boot();
  c.viewerHistPush();
  vm.runInContext('viewerId = "p1";', c);
  c.__fire();                                   // 폰 뒤로 가기
  assert.equal(c.viewerId, null, '뒤로 가기로 안 닫히면 사진첩 밖으로 나가 버립니다');
  assert.equal(c.__hist.back, 0,
    '역사 칸은 이미 빠졌습니다 — 또 빼면 사진첩 밖으로 한 칸 더 나갑니다');
});

test('★ 단추로 닫으면 쌓아 둔 역사 칸을 빼 준다', () => {
  const c = boot();
  c.viewerHistPush();
  vm.runInContext('viewerId = "p1";', c);
  c.closeViewer();
  assert.equal(c.viewerId, null);
  assert.equal(c.__hist.back, 1,
    '안 빼면 다음 뒤로 가기가 헛칸을 밟아 「눌렀는데 아무 일도 없는」 게 됩니다');
  assert.equal(c.viewerPushed, false);
  /* 두 번 불려도 두 번 빼지 않는다 */
  c.closeViewer();
  assert.equal(c.__hist.back, 1, '닫기를 두 번 부르면 사진첩 밖으로 나갑니다');
});

test('★ 크게 보기가 안 열려 있으면 뒤로 가기를 가로채지 않는다', () => {
  /* ⚠ 「history.back 이 안 늘었다」만 보면 안 잡힌다 — 크게 보기가 닫힌 상태에서는
     closeViewer 가 어차피 아무것도 안 빼기 때문이다(실제로 이 변형이 안 잡혔다).
     가로챘는지 알려면 **closeViewer 를 불렀는지**를 봐야 한다. */
  const c = boot();
  vm.runInContext('var __closed = 0; var __realClose = closeViewer;' +
    'closeViewer = function(){ __closed++; return __realClose.apply(null, arguments); };', c);
  c.__fire();
  assert.equal(vm.runInContext('__closed', c), 0,
    '안 열려 있는데 닫기를 부르면, 다른 화면(설정·휴지통)의 뒤로 가기를 가로챕니다');
  assert.equal(c.__hist.back, 0);

  /* 열려 있으면 당연히 가로채야 한다 — 위 규칙이 너무 세지 않았는지 함께 본다.
     ⚠ 2026-09-05 — 판단 기준이 「크게 보기가 열려 있나(viewerId)」에서
       «우리가 역사 칸을 쌓았나(viewerPushed)»로 바뀌었다. 화면 상태로 물으면,
       칸은 쌓여 있는데 화면이 먼저 닫힌 사이에 뒤로가기가 눌리면 그 칸이
       조용히 빠져 **다음 뒤로가기가 사진첩을 통째로 나간다**(대표 보고 「계속 튕긴다」). */
  vm.runInContext('viewerId = "p1"; viewerPushed = true;', c);
  c.__fire();
  assert.equal(vm.runInContext('__closed', c), 1, '열려 있으면 뒤로 가기로 닫혀야 합니다');
});

test('★ 사진을 바꿔 볼 때 역사를 겹쳐 쌓지 않는다', () => {
  /* 겹쳐 쌓으면 쌓인 만큼 뒤로 가기를 눌러야 닫힌다 */
  const open = fnOf('openViewer');
  assert.match(open, /if \(!viewerId\) viewerHistPush\(\);/,
    '열려 있는 채 다른 장으로 바꿀 때도 쌓으면 뒤로 가기를 여러 번 눌러야 합니다');
});
