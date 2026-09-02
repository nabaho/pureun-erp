/* 폰 «뒤로가기»가 한 걸음씩 물러선다 — js/pu-back.js
   대표 지시 2026-08-30:
     「모든 프로그램에서 스마트폰 가장 아래 뒤로가기 버튼을 누르면 … 직전에 눌렀던
       화면으로 가야 되는데 무조건 통합시스템 화면으로 돌아간다. 모든 프로그램이
       다 똑같다 이거 다 수정해 달라」

   왜 그랬나 — 앱이 화면을 바꿔도 브라우저 «기록에 아무것도 안 남겼다».
   포털에서 들어온 걸음 하나뿐이라, 뒤로가기는 그 하나를 되밟아 통째로 나갔다.

   지키는 규칙:
     ① 포털에 실린 앱 «전부»가 이 층을 싣는다 — 새 앱이 생겨도 여기서 걸린다
     ② 싣기만 하고 «등록»을 안 하면 없는 것과 같다
     ③ 제 화면 기록을 따로 굴리는 앱은 깃발을 든다 — 한 번 눌렀는데 둘이 닫히면 안 된다
     ④ ERP 의 창 쉰여섯 개는 «한 자리»(useEscClose)에서 걸린다 — 창마다 붙이지 않는다
     ⑤ 창을 닫을 때 history.back() 을 부르지 않는다 — 두 걸음 물러서면 앱이 나간다
     ⑥ 층은 «맨 위부터» 닫히고, 다 닫힌 뒤에야 앱을 나간다
   실행: node --test tests/back-button.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const 읽기 = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

/* 포털이 실제로 내거는 앱 목록에서 읽는다 — 손으로 적으면 새 앱을 빠뜨린다 */
function 포털앱들() {
  const enter = 읽기('enter.html');
  const at = enter.indexOf('var APPS = [');
  assert.ok(at > 0, '포털의 앱 목록을 못 찾았습니다');
  const 몸 = enter.slice(at, enter.indexOf('\n  ];', at));
  const 목록 = [...몸.matchAll(/url:\s*'([a-zA-Z0-9._-]+\.html)/g)].map((m) => m[1]);
  const 있는것 = [...new Set(목록)].filter((f) => fs.existsSync(path.join(ROOT, f)));
  assert.ok(있는것.length >= 8, '앱을 ' + 있는것.length + '개밖에 못 읽었습니다');
  return 있는것;
}

test('★ 포털에 실린 앱 전부가 뒤로가기 층을 싣는다', () => {
  const 빠진것 = 포털앱들().filter((f) => !/pu-back\.js/.test(읽기(f)));
  assert.deepEqual(빠진것, [],
    '★ 이 앱에서는 뒤로가기가 통째로 앱을 나갑니다: ' + 빠진것.join(', '));
});

test('★ 싣기만 하지 않고 «등록»한다 — 안 부르면 없는 것과 같다', () => {
  const 안부름 = 포털앱들().filter((f) => !/PuBack\.(guard|open)\(/.test(읽기(f)));
  assert.deepEqual(안부름, [],
    '★ 층을 싣고도 아무것도 안 겁니다: ' + 안부름.join(', '));
});

test('캐시 번호를 붙여 싣는다 — 고쳐도 옛 파일을 쓰면 안 고친 것이다', () => {
  for (const f of 포털앱들()) {
    assert.match(읽기(f), /src="js\/pu-back\.js\?v=\d+"/, f + ' 에 캐시 번호가 없습니다');
  }
});

test('★ 제 화면 기록을 굴리는 앱은 깃발을 든다 — 한 번에 둘이 닫히면 안 된다', () => {
  /* 이 앱들은 예전부터 제 화면 기록(popstate)을 갖고 있었다. 공통 층이 그 위에
     또 닫으면, 뒤로가기 한 번에 «화면도 바뀌고 창도 닫힌다». */
  for (const f of 포털앱들()) {
    const s = 읽기(f);
    if (!/addEventListener\('popstate'/.test(s)) continue;
    assert.match(s, /__puBackNav/,
      '★ ' + f + ' 는 제 화면 기록을 굴리는데 깃발을 안 듭니다 — 한 번 눌러 둘이 닫힙니다');
  }
  assert.match(읽기('js/pu-back.js'), /__puBackNav/, '공통 층이 깃발을 안 봅니다');
});

test('★ ERP 의 창은 «한 자리»에서 걸린다 — 창마다 붙이지 않는다', () => {
  const erp = 읽기('pu-erp.html');
  const at = erp.indexOf('function useEscClose(');
  assert.ok(at > 0, 'ESC 닫기 훅이 사라졌습니다');
  const fn = erp.slice(at, erp.indexOf('\n}', at));
  assert.match(fn, /PuBack\.open\(/, '★ 창 쉰여섯 개가 한꺼번에 걸리는 자리입니다');
  assert.match(fn, /PuBack\.close\(/, '창을 X 로 닫았을 때 층을 안 뺍니다');
  /* 메뉴 뒤로가기도 이어져 있어야 한다 — goBack·menuHistory 는 처음부터 있었다 */
  assert.match(erp, /PuBack\.open\('메뉴', goBack\)/,
    '★ 「이전 메뉴로」가 폰 단추와 안 이어져 있습니다');
});

test('★ 창을 닫을 때 history.back() 을 부르지 않는다', () => {
  const lib = 읽기('js/pu-back.js');
  const at = lib.indexOf('function close(id)');
  const fn = lib.slice(at, lib.indexOf('\n  }', at));
  assert.ok(!/history\.back/.test(fn),
    '★ 닫기 한 번에 두 걸음 물러서서, 창만 닫았는데 앱이 나갑니다');
});

/* ── 진짜로 돌려 본다 ── */
function 판만들기() {
  const 기록 = [];
  let 팝 = null;
  const ctx = {
    console: { warn() {} },
    setTimeout() {},
    location: { href: 'app.html', replace() {} },
    history: {
      pushState(st) { 기록.push(st); },
      back() { 기록.pop(); ctx.간것 = (ctx.간것 || 0) + 1; }
    },
    window: {
      addEventListener(ev, fn) { if (ev === 'popstate') 팝 = fn; }
    },
    module: { exports: {} },
    기록: 기록
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(읽기('js/pu-back.js'), ctx);
  return { PuBack: ctx.module.exports, 뒤로: () => 팝(), ctx, 기록 };
}

test('★ 층은 «맨 위부터» 닫히고, 다 닫힌 뒤에야 앱을 나간다', () => {
  const { PuBack, 뒤로, ctx } = 판만들기();
  const 닫힌것 = [];
  PuBack.open('메뉴', () => 닫힌것.push('메뉴'));
  PuBack.open('업체 상세', () => 닫힌것.push('업체 상세'));
  PuBack.open('사진 크게', () => 닫힌것.push('사진 크게'));
  assert.equal(PuBack.depth(), 3);
  assert.equal(PuBack.top(), '사진 크게');

  뒤로(); 뒤로(); 뒤로();
  assert.deepEqual(닫힌것, ['사진 크게', '업체 상세', '메뉴'], '★ 닫히는 차례가 뒤집혔습니다');
  assert.equal(ctx.간것 || 0, 0, '★ 창이 열려 있는데 앱을 나갔습니다');

  뒤로();
  assert.equal(ctx.간것, 1, '★ 다 닫혔는데도 앱에 남아 있습니다 — 뒤로가기가 먹통이 됩니다');
});

test('★ 빈 걸음은 «하나»만 심는다 — 열 개 열었다고 열 번 눌러야 하면 안 된다', () => {
  const { PuBack, 기록 } = 판만들기();
  for (let i = 0; i < 5; i++) PuBack.open('창' + i, () => {});
  assert.equal(기록.length, 1, '★ 층마다 걸음을 심고 있습니다 — ' + 기록.length + '개');
});

test('X 로 닫은 층은 목록에서 빠진다 — 뒤로가기가 헛돌지 않는다', () => {
  const { PuBack, 뒤로, ctx } = 판만들기();
  let 닫혔나 = 0;
  const h = PuBack.open('창', () => { 닫혔나++; });
  PuBack.close(h);
  assert.equal(PuBack.depth(), 0);
  뒤로();
  assert.equal(닫혔나, 0, '이미 닫은 창을 또 닫으려 합니다');
  assert.equal(ctx.간것, 1, '★ 뒤로가기가 아무 일도 안 하는 단추가 됐습니다');
});

test('제 화면 기록을 쓴 걸음에는 비켜선다', () => {
  const { PuBack, 뒤로, ctx } = 판만들기();
  let 닫혔나 = 0;
  PuBack.open('창', () => { 닫혔나++; });
  ctx.__puBackNav = true;              /* 앱의 손잡이가 먼저 처리했다 */
  뒤로();
  assert.equal(닫혔나, 0, '★ 앱이 화면을 되돌렸는데 창까지 닫았습니다 — 한 번에 둘입니다');
  assert.equal(PuBack.depth(), 1, '층이 그대로 남아 있어야 합니다');
});

/* ── 2026-09-02 회귀 — 대표 제보 「메일에서 뒤로가기 하면 명함 목록으로 간다」 ──
   내가 넣은 «맨 위 덮개 닫기»가 저지른 일이다.
   푸른 메일(.dmm)은 화면을 다 덮으므로 «덮개»로 잡혔고, 그 안 서랍에 숨어 있던
   「‹ 기업정보함으로」 단추를 눌러 버렸다. 그 함수 이름이 closeMailPage 라서다.
   ★ 이름은 거짓말을 한다 — close 로 시작한다고 «창을 닫는» 함수가 아니다.
     그것은 «앱을 나가는» 함수였다. */
test('★★ 닫기 단추를 함수 «이름»으로 짐작하지 않는다', () => {
  const lib = 읽기('js/pu-back.js');
  const at = lib.indexOf('function 닫기단추(');
  assert.ok(at > 0, '닫기 단추를 고르는 함수가 사라졌습니다');
  const fn = lib.slice(at, lib.indexOf('\n  }', at));
  assert.ok(!/getAttribute\('onclick'\)[\s\S]{0,200}close/i.test(fn),
    '★★ onclick 이름으로 닫기 단추를 짐작하고 있습니다 — '
    + 'closeMailPage() 처럼 «나가는» 함수를 눌러 버립니다(2026-09-02 실제 사고)');
});

test('★ 화면 밖으로 밀어 둔 단추는 누르지 않는다 — 서랍은 닫혀도 «보인다»고 나온다', () => {
  const lib = 읽기('js/pu-back.js');
  assert.match(lib, /function 누를수있나\(el\)/,
    '누를 수 있는지 재는 자리가 없습니다');
  const at = lib.indexOf('function 누를수있나(el)');
  const fn = lib.slice(at, lib.indexOf('\n  }', at));
  assert.match(fn, /getBoundingClientRect/, '자리를 안 재고 있습니다');
  assert.match(fn, /r\.right > 0 && r\.bottom > 0/,
    '화면 안에 들어와 있는지 안 봅니다 — translateX 로 밀어 둔 서랍이 걸립니다');
  /* 고른 단추가 이 검사를 지나야 뜻이 있다 */
  const at2 = lib.indexOf('function 닫기단추(');
  assert.match(lib.slice(at2, lib.indexOf('\n  }', at2)), /누를수있나\(/,
    '재기만 하고 안 쓰고 있습니다');
});

test('화면에 «닫기»라고 적힌 것만 누른다', () => {
  const lib = 읽기('js/pu-back.js');
  assert.match(lib, /var 닫기말 = \['닫기', '취소'/, '닫기라고 볼 말 목록이 사라졌습니다');
  const at = lib.indexOf('function 닫기단추(');
  const fn = lib.slice(at, lib.indexOf('\n  }', at));
  assert.match(fn, /닫기말\.indexOf\(t\) >= 0/, '적힌 글자를 안 봅니다');
});
