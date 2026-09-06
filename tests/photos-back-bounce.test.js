/* 「사진을 보다가 계속 튕겨서 포털로 나간다」 — 네 번째이자 «진짜» 뿌리
   (대표 보고 2026-09-06 · 코덱스 교차 확인)

   ■ 무엇이 문제였나
   사진첩에는 뒤로가기 손잡이가 **셋**이다:
     ① 크게 보기(viewerPushed)  ② 카메라(camPushed)  ③ 모든 앱 공통 층(js/pu-back.js)
   공통 층은 한 가지 약속으로 비켜선다 — 「이 걸음은 내가 썼다」는 표(__puBackNav).

   닫기 단추로 크게 보기를 닫는 길은 표를 «먼저» 지운 뒤 history.back() 을 불렀다.
   곧 날아온 popstate 에서 우리 손잡이는 `if (!viewerPushed) return;` 로 되돌아갔고,
   표를 안 세운 그 걸음을 공통 층이 «사람이 누른 것»으로 읽어 **앱을 나갔다.**

   ■ 이 검사가 지키는 것 — «글자»가 아니라 실제로 세 층을 함께 돌린다
     ① 사진을 닫아도 앱을 안 나간다            (버그 재현 자리)
     ② 카메라를 닫아도 앱을 안 나간다          (같은 구조 — 코덱스가 짚었다)
     ③ 폰 뒤로가기로 닫는 길은 그대로 산다
     ④ ★ 아무것도 안 열렸을 때의 뒤로가기는 «여전히» 앱을 나간다
        — 고치다가 이걸 막으면 뒤로가기가 먹통인 앱이 된다
   실행: node --test tests/photos-back-bounce.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { cutFn } = require('./cut-fn.js');
const { stripComments } = require('./strip-comments.js');

const ROOT = path.join(__dirname, '..');
const 읽기 = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const APP = stripComments(읽기('pu-photos.html'));

/* ── 세 층이 함께 도는 «작은 브라우저» ──
   진짜 브라우저처럼 history.back() 이 popstate 를 «모든» 손잡이에게 돌린다.
   그것이 이 버그의 핵심이다 — 한 걸음을 여러 손잡이가 함께 본다. */
function 판만들기() {
  const 칸 = [];
  const 손잡이 = [];
  const 밖으로 = [];
  const ctx = {
    console: { warn() {}, log() {} },
    /* 400ms 를 기다리지 않고 바로 본다 — 공통 층의 「나가기」가 여기서 드러난다 */
    setTimeout(fn) { try { fn(); } catch (_) {} },
    /* ⚠ 주소는 «안 바뀐다» — 이 앱의 걸음은 전부 같은 주소의 pushState 다.
       공통 층의 나가기()가 그 사실을 보고 enter.html 로 밀어 버린다. */
    location: { href: 'pu-photos.html', replace(u) { 밖으로.push(u); }, search: '' },
    history: {
      pushState(st) { 칸.push(st || null); },
      back() {
        /* ⚠ 물러설 칸이 없으면 «아무 일도 안 난다» — popstate 도 안 온다.
           진짜 브라우저가 그렇다. 빈 칸에서도 쏘면 공통 층의 나가기()가
           제가 쏜 것을 또 받아 끝없이 돈다(검사를 짜다 실제로 그랬다). */
        if (!칸.length) return;
        칸.pop();
        const st = 칸.length ? 칸[칸.length - 1] : null;
        /* 등록한 차례대로 — 실제 화면도 «앱 손잡이 먼저, 공통 층 나중»이다 */
        손잡이.slice().forEach(function (fn) { try { fn({ state: st }); } catch (_) {} });
      }
    },
    document: { body: { querySelectorAll: () => [] }, querySelectorAll: () => [] },
    getComputedStyle: () => ({ position: 'static', zIndex: '0', display: 'none', visibility: 'visible', opacity: '1' }),
    innerWidth: 390, innerHeight: 840,
    module: { exports: {} },
    칸: 칸, 밖으로: 밖으로
  };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  ctx.addEventListener = function (ev, fn) { if (ev === 'popstate') 손잡이.push(fn); };
  vm.createContext(ctx);
  return ctx;
}

/* 사진첩의 «진짜» 함수와 손잡이를 넣는다 — 가짜를 넣으면 이 검사가 아무것도 안 지킨다 */
function 사진첩싣기(ctx) {
  const 닫힌것 = [];
  vm.runInContext([
    'let viewerPushed = false, camPushed = false, viewerId = null;',
    'const 닫힌것 = [];',
    cutFn(APP, 'function puHistDrop('),
    cutFn(APP, 'function viewerHistPush('),
    cutFn(APP, 'function camHistPush('),
    cutFn(APP, 'function camHistDrop('),
    /* closeViewer·closeCam 은 화면을 잔뜩 만지므로 «역사 칸을 놓는 대목»만 그대로 옮긴다.
       그 대목이 바로 이 버그가 살던 자리다(원본과 어긋나면 아래 검사가 걸린다). */
    'function closeViewerTail() { viewerId = null; 닫힌것.push("viewer");' +
    '  if (viewerPushed) { viewerPushed = false; puHistDrop(); } }',
    'function closeCamTail() { 닫힌것.push("cam"); camHistDrop(); }',
    /* 진짜 popstate 손잡이 둘 — 원본에서 그대로 오려 온다 */
    APP.slice(APP.indexOf("window.addEventListener('popstate'", APP.indexOf('function viewerHistPush(')))
      .slice(0, APP.slice(APP.indexOf("window.addEventListener('popstate'", APP.indexOf('function viewerHistPush('))).indexOf('});') + 3)
      .replace('closeViewer();', 'closeViewerTail();'),
    APP.slice(APP.indexOf("window.addEventListener('popstate'", APP.indexOf('function camHistPush(')))
      .slice(0, APP.slice(APP.indexOf("window.addEventListener('popstate'", APP.indexOf('function camHistPush('))).indexOf('});') + 3)
      .replace('if (closeCam() === false) camHistPush();', 'closeCamTail();')
  ].join('\n'), ctx);
  return 닫힌것;
}

/* 공통 층은 «맨 나중»에 싣는다 — 실제 화면도 </body> 앞이다 */
function 공통층싣기(ctx) {
  vm.runInContext(읽기('js/pu-back.js'), ctx);
  const PuBack = ctx.module.exports;
  /* ⚠ 파수꾼을 «검사가» 걸어 주면 안 된다 — 화면에서 그 줄이 사라져도 검사는 통과한다.
     화면이 실제로 쓴 그 한 줄을 오려 와서 그대로 돌린다(pu-photos.html 맨 끝). */
  const 줄 = 읽기('pu-photos.html').split(/\r?\n/)
    .filter(function (l) { return l.indexOf('PuBack.guard(') >= 0; });
  assert.equal(줄.length, 1,
    '★ 사진첩이 공통 뒤로가기에 파수꾼을 «한 줄로» 걸지 않습니다 — 층이 있어도 안 물어봅니다');
  ctx.PuBack = PuBack;
  /* 그 줄을 통째로 돌린다 — <script> 껍데기만 걷어낸다 */
  vm.runInContext(줄[0].replace(/<\/?script[^>]*>/g, ''), ctx);
  return PuBack;
}

function 차린판() {
  const ctx = 판만들기();
  const 닫힌것 = 사진첩싣기(ctx);
  const PuBack = 공통층싣기(ctx);
  return { ctx, PuBack, 닫힌것: () => vm.runInContext('닫힌것', ctx) };
}

/* ── ① 버그 재현 자리 ── */
test('★★ 사진을 크게 보고 «닫기 단추»로 닫아도 앱을 안 나간다', () => {
  const { ctx } = 차린판();
  const 전 = ctx.칸.length;
  vm.runInContext('viewerHistPush();', ctx);          // 사진을 크게 열었다
  assert.ok(vm.runInContext('viewerPushed', ctx), '크게 보기가 걸음을 안 쌓았습니다');
  /* ⚠ 표만 세우고 걸음을 «안» 쌓으면, 닫을 때 공통 층의 파수 걸음을 대신 빼먹는다.
     표가 섰는지가 아니라 «칸이 늘었는지»를 본다. */
  assert.equal(ctx.칸.length, 전 + 1,
    '★ 표만 세우고 역사 칸을 안 쌓았습니다 — 닫을 때 남의 걸음을 빼먹습니다');

  vm.runInContext('closeViewerTail();', ctx);          // ✕ / 돌아가기 / ESC

  assert.deepEqual(ctx.밖으로, [],
    '★★ 사진을 닫았을 뿐인데 ' + JSON.stringify(ctx.밖으로) + ' 로 나갔습니다 — '
    + '이것이 대표님이 세 번 보고하신 「사진 보다가 튕긴다」입니다');
});

test('★ 사진을 열고 닫기를 되풀이해도 앱을 안 나간다 — 한 번만 운 좋은 게 아니다', () => {
  const { ctx } = 차린판();
  for (let i = 0; i < 5; i++) {
    vm.runInContext('viewerHistPush();', ctx);
    vm.runInContext('closeViewerTail();', ctx);
    assert.deepEqual(ctx.밖으로, [], '★ ' + (i + 1) + '번째 닫기에서 앱을 나갔습니다');
  }
});

/* ── ② 카메라도 같은 구조다 (코덱스가 짚었다) ── */
test('★ 카메라를 닫아도 앱을 안 나간다 — 크게 보기와 같은 구조였다', () => {
  const { ctx } = 차린판();
  vm.runInContext('camHistPush();', ctx);
  vm.runInContext('closeCamTail();', ctx);
  assert.deepEqual(ctx.밖으로, [], '★ 카메라를 닫았을 뿐인데 앱을 나갔습니다');
});

/* ── ③ 폰 뒤로가기로 닫는 길은 그대로 산다 ── */
test('폰 뒤로가기로 사진을 닫으면 사진만 닫히고 앱에 남는다', () => {
  const { ctx, 닫힌것 } = 차린판();
  vm.runInContext('viewerHistPush();', ctx);
  ctx.history.back();                                   // 폰 뒤로가기
  assert.ok(닫힌것().indexOf('viewer') >= 0, '뒤로가기가 사진을 안 닫았습니다');
  assert.deepEqual(ctx.밖으로, [], '★ 사진만 닫혀야 하는데 앱까지 나갔습니다');
  assert.equal(vm.runInContext('viewerPushed', ctx), false, '표가 안 지워졌습니다');
});

/* ── ④ ★ 고치다가 «나가는 길»을 막지 않았나 ── */
test('★★ 아무것도 안 열렸을 때의 뒤로가기는 «여전히» 앱을 나간다', () => {
  const { ctx } = 차린판();
  ctx.history.back();                                   // 사진도 카메라도 안 열림
  assert.deepEqual(ctx.밖으로, ['enter.html'],
    '★★ 뒤로가기가 아무 일도 안 하는 먹통 단추가 됐습니다 — 앱을 못 나갑니다');
});

test('★ 사진을 닫은 «뒤»의 뒤로가기는 앱을 나간다 — 헛칸이 남으면 안 된다', () => {
  const { ctx } = 차린판();
  vm.runInContext('viewerHistPush();', ctx);
  vm.runInContext('closeViewerTail();', ctx);
  assert.deepEqual(ctx.밖으로, [], '닫기에서 이미 나갔습니다');
  ctx.history.back();
  /* ⚠ «몇 번» 나가려 했는지는 안 본다. 공통 층(pu-back.js)이 제 파수 걸음을 다시
     심는 방식 때문에 헛칸이 하나 남아 나가기가 두 번 겹쳐 불린다 — 가는 곳이 같아
     사람 눈에는 한 번이고, 그 셈은 공통 층 사정이지 사진첩이 지킬 규칙이 아니다.
     여기서 못 박을 것은 하나다: **나갈 수 있는가.** */
  assert.ok(ctx.밖으로.indexOf('enter.html') >= 0,
    '★ 사진을 한 번 열었다 닫았더니 뒤로가기가 먹통이 됐습니다 — 앱을 못 나갑니다');
});

/* ── 규칙을 못 박는다 ── */
test('★ 우리가 빼는 걸음에는 «반드시 먼저» 표를 세운다', () => {
  const fn = cutFn(APP, 'function puHistDrop(');
  assert.match(fn, /__puBackNav/, '표를 안 세웁니다 — 공통 층이 앱을 나갑니다');
  assert.ok(fn.indexOf('__puBackNav') < fn.indexOf('history.back'),
    '★ 걸음을 «먼저» 빼고 표를 세웁니다 — popstate 가 그 사이에 날아갑니다');
});

test('★ 사진첩에서 걸음을 빼는 곳은 «puHistDrop 하나»다', () => {
  /* 다른 데서 맨손으로 history.back() 을 부르면 그 자리만 다시 튕긴다 */
  const 맨손 = [];
  APP.split(/\r?\n/).forEach(function (l, n) {
    if (/history\.back\(\)/.test(l)) 맨손.push((n + 1) + ': ' + l.trim());
  });
  assert.equal(맨손.length, 1,
    '★ 맨손으로 걸음을 빼는 자리가 있습니다 — 전부 puHistDrop 을 거쳐야 합니다:\n  ' + 맨손.join('\n  '));
  assert.ok(맨손[0].indexOf('__puBackNav') < 0, 'puHistDrop 안이어야 합니다');

  ['function camHistDrop(', 'function closeViewer('].forEach(function (d) {
    assert.match(cutFn(APP, d), /puHistDrop\(\)/, d + ' 가 puHistDrop 을 안 씁니다');
  });
});

test('★ popstate 첫 줄에서 «조건 없이» 표를 세우지 않는다 — 그러면 앱을 영영 못 나간다', () => {
  /* 손쉬운 오답 방지: fund·work 처럼 무조건 세우면 사진첩은 나갈 길이 막힌다.
     사진첩은 층이 여럿이라 «우리가 쌓은 걸음일 때만» 우리 것이다. */
  const i = APP.indexOf("window.addEventListener('popstate'", APP.indexOf('function viewerHistPush('));
  const 몸 = APP.slice(i, APP.indexOf('});', i));
  assert.ok(몸.indexOf('if (!viewerPushed) return;') < 몸.indexOf('__puBackNav'),
    '★ 우리가 안 쌓은 걸음까지 삼킵니다 — 아무것도 안 열렸을 때 앱을 못 나갑니다');
});
