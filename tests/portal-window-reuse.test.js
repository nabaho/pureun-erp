const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'enter.html'), 'utf8');

function loadWindowManager(open) {
  const start = source.indexOf('var portalAppWindows = Object.create(null);');
  const end = source.indexOf('  function renderPortal', start);
  assert.ok(start >= 0 && end > start, '창 관리자 코드가 있어야 합니다.');
  const context = {
    URL,
    /* ⚠ URLSearchParams 도 넣어 준다 — portalAppUrlKey 가 쓴다(2026-09-08).
       빠뜨리면 브라우저에서는 멀쩡한데 여기서만 견주기가 죽어(try/catch 가 삼킨다)
       「늘 다른 화면」으로 읽혀, 이 아래 두 검사가 «고장이 아닌데» 빨개진다. */
    URLSearchParams,
    location: { href: 'https://nabaho.github.io/pureunall/enter.html' },
    window: { open },
    alert() {},
  };
  vm.runInNewContext(source.slice(start, end), context);
  return context;
}

function appWindow(initialHref = 'about:blank') {
  const state = { navigations: 0, focuses: 0 };
  const ref = {
    closed: false,
    location: {
      href: initialHref,
      replace(url) {
        state.navigations += 1;
        this.href = new URL(url, 'https://nabaho.github.io/pureunall/enter.html').href;
      },
    },
    focus() { state.focuses += 1; },
  };
  return { ref, state };
}

test('모든 포털 프로그램은 프로그램 키 기반의 고정 창 이름을 사용한다', () => {
  assert.match(source, /function portalAppWindowName\(key\)/);
  assert.match(source, /return 'pureun-' \+ String\(key \|\| ''\)/);
  assert.match(source, /a\.target = portalAppWindowName\(app\.key\)/);
});

test('포털을 새로고침한 뒤에도 이름으로 기존 프로그램 창을 복구한다', () => {
  assert.match(source, /window\.open\('', winName\)/);
  assert.equal(source.includes('window.open(url, winName)'), false);
  assert.match(source, /portalAppWindows\[app\.key\] = ref/);
});

test('이미 열린 같은 프로그램은 주소를 다시 넣지 않고 포커스만 이동한다', () => {
  const functionStart = source.indexOf('function openPortalApp(app, url)');
  const functionEnd = source.indexOf('  function renderPortal', functionStart);
  assert.ok(functionStart >= 0 && functionEnd > functionStart, '창 관리자 함수가 있어야 합니다.');
  const body = source.slice(functionStart, functionEnd);

  assert.match(body, /if\(ref && !ref\.closed\)/);
  assert.match(body, /if\(!portalAppUrlMatches\(ref, url\)\) navigatePortalApp\(ref, url\)/);
  assert.match(body, /ref\.focus\(\);\s*return ref/);
});

test('팝업 차단 시 사용자가 원인을 알 수 있다', () => {
  assert.match(source, /팝업이 차단되어 프로그램을 열 수 없습니다/);
});

test('같은 포털에서 기금관리를 두 번 눌러도 창은 한 번만 만들고 재로딩하지 않는다', () => {
  const fund = appWindow();
  let opens = 0;
  const context = loadWindowManager(() => {
    opens += 1;
    return fund.ref;
  });
  const app = { key: 'fund' };
  const url = 'fund.html?sso=1&v=1';

  context.openPortalApp(app, url);
  context.openPortalApp(app, url);

  assert.equal(opens, 1);
  assert.equal(fund.state.navigations, 1);
  assert.equal(fund.state.focuses, 2);
});

test('포털을 새로고침해도 이미 열린 기금관리 창을 이름으로 찾아 포커스만 이동한다', () => {
  const fund = appWindow('https://nabaho.github.io/pureunall/fund.html?sso=1&v=1');
  const names = [];
  const context = loadWindowManager((url, name) => {
    names.push({ url, name });
    return fund.ref;
  });

  context.openPortalApp({ key: 'fund' }, 'fund.html?sso=1&v=2');

  assert.deepEqual(names, [{ url: '', name: 'pureun-fund' }]);
  assert.equal(fund.state.navigations, 0);
  assert.equal(fund.state.focuses, 1);
});
