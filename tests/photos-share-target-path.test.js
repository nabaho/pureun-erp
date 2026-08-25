'use strict';
/* 폰 갤러리 「공유」에서 푸른사진첩으로 바로 보내기 — 그 길이 온전한가 (대표 지적 2026-08-24)

   "핸드폰에서 사진 찍은 것 공유 또는 전달하기 기능 누르면 푸른사진첩에도 같이 연결하기
    기능 만들 수 있나. 폰 안에서 연결하도록, 그리고 동기화 쉽게 하려는 것이다."

   ■ 이미 만들어져 있었다. 그런데 대표님이 그 기능이 있는 줄 모르셨다.
     까닭: 설치를 권하는 배너가 브라우저가 `beforeinstallprompt` 를 줄 때만 뜬다.
     그 신호는 ①이미 설치했거나 ②「나중에」로 2주 미뤘거나 ③✕로 껐으면 오지 않고,
     그러면 **이 기능으로 가는 길이 화면에서 통째로 사라진다.**

   ■ 이 검사가 지키는 것
     ① 공유 길의 네 토막이 **서로 이름을 맞추고 있는가.** 한 곳만 어긋나도 「공유했는데
        아무 일도 없다」가 된다 — 그런데 그 어긋남은 폰에서만 드러나므로 화면으로는
        못 잡는다. 매니페스트·서비스워커·화면이 같은 이름을 쓰는지 글로 견준다.
     ② 그 기능으로 가는 길이 **늘 화면에 있는가.**

   실행: node --test tests/*.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { cutFn } = require('./cut-fn');

const R = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(R, 'pu-photos.html'), 'utf8');
const mf = JSON.parse(fs.readFileSync(path.join(R, 'pu-photos-manifest.json'), 'utf8'));

/* ⚠⚠ **화면이 실제로 등록하는 워커**를 읽는다 — 파일 이름을 손으로 적으면 안 된다.
   처음에 `pu-photos-sw.js` 를 박아 두었는데, 화면은 통합 워커 `pu-sw.js` 를 등록한다
   (워커는 한 scope 에 하나만 살아남아 네 앱이 하나를 함께 쓴다 — pu-sw.js 머리말).
   그래서 검사는 통과하는데 **정작 도는 워커는 안 보고 있었다.** 안 쓰는 파일을 지키는
   검사는 없는 것보다 나쁘다 — 지키고 있다고 믿게 만든다. */
const SW_FILE = (function () {
  const m = app.match(/serviceWorker\.register\('([^']+)'/);
  assert.ok(m, '화면이 워커를 등록하는 줄을 찾지 못했습니다');
  return m[1].replace(/^\.?\//, '');
})();
const sw = fs.readFileSync(path.join(R, SW_FILE), 'utf8');

/* ══════ ① 네 토막이 이름을 맞추고 있는가 ══════ */

test('★ 매니페스트가 공유 목록에 오를 준비가 돼 있다', () => {
  const st = mf.share_target;
  assert.ok(st, '★ share_target 이 없으면 공유 목록에 아예 안 뜹니다');
  assert.equal(st.method, 'POST', '사진을 받으려면 POST 여야 합니다');
  assert.equal(st.enctype, 'multipart/form-data', '파일을 받으려면 이 꼴이어야 합니다');
  assert.ok(Array.isArray(st.params.files) && st.params.files.length,
    '★ files 가 없으면 글자만 받고 사진은 못 받습니다');
  const accept = st.params.files[0].accept;
  assert.ok(accept.indexOf('image/*') >= 0, '사진을 안 받습니다');
  assert.ok(accept.indexOf('application/pdf') >= 0, '스캔 PDF 를 안 받습니다');
});

test('★ 공유 목록을 띄우려면 «설치»가 되어야 한다 — 그 조건이 갖춰져 있다', () => {
  /* display:standalone + 아이콘 + start_url 이 없으면 브라우저가 설치를 안 시켜 준다 */
  assert.equal(mf.display, 'standalone', '★ 브라우저가 설치 가능으로 안 봅니다');
  assert.ok(mf.start_url, 'start_url 이 없습니다');
  const sizes = (mf.icons || []).map(i => i.sizes);
  assert.ok(sizes.indexOf('192x192') >= 0 && sizes.indexOf('512x512') >= 0,
    '★ 192·512 아이콘이 둘 다 있어야 설치가 됩니다: ' + sizes.join(','));
});

test('★ 서비스워커가 «매니페스트가 보내는 그 길·그 이름»으로 받는다', () => {
  /* 매니페스트의 action 과 워커가 가로채는 길이 어긋나면 POST 가 그냥 흘러가
     「공유했는데 아무 일도 없다」가 된다 — 폰에서만 드러나는 어긋남이다. */
  const action = String(mf.share_target.action).replace(/^\.\//, '');
  /* 통합 워커는 앱마다 상수를 따로 둔다(PHOTOS_SHARE) — 이름을 못 박지 않고
     「그 길을 가리키는 상수가 있는가」로 본다. */
  const m = sw.match(/var (\w*PHOTOS\w*|SHARE_PATH) = '([^']*pu-photos[^']*)'/);
  assert.ok(m, '★ ' + SW_FILE + ' 에서 사진첩 공유 길을 찾지 못했습니다');
  assert.ok(m[2].indexOf(action) >= 0,
    '★ 매니페스트는 「' + action + '」로 보내는데 워커는 「' + m[2] + '」를 봅니다');
  /* 그 상수를 실제로 «가로채는 데» 쓰는지 — 상수만 두고 안 쓰면 POST 가 흘러간다 */
  assert.match(sw, new RegExp('respondWith\\(takePhotos'),
    '★ 길만 적어 두고 가로채지 않으면 「공유했는데 아무 일도 없다」가 됩니다');
  /* 파일 칸 이름도 같아야 한다 — 다르면 fd.getAll 이 늘 빈 배열이다.
     ⚠ 사진첩 몫 안에서만 본다(통합 워커에는 명함첩·급여데이터함 것도 있다). */
  const field = mf.share_target.params.files[0].name;
  assert.ok(cutFn(sw, 'function takePhotos(').indexOf("fd.getAll('" + field + "')") >= 0,
    '★ 매니페스트는 「' + field + '」로 보내는데 사진첩 공유가 그 이름을 안 읽습니다');
});

test('★ 워커가 화면에 «무슨 일이 있었는지» 알려 준다 — 조용히 넘기면 올라간 줄 안다', () => {
  /* ⚠ **사진첩 몫 안에서만** 본다. 통합 워커에는 급여데이터함도 같은 줄을 갖고 있어,
     파일 통째로 찾으면 사진첩 쪽을 고쳐도 급여데이터함의 것이 걸려 통과한다
     (실제로 그렇게 안 잡혔다). */
  const swTake = cutFn(sw, 'function takePhotos(');
  ['?share=1', '?share=none', '?share=err'].forEach(s => {
    assert.ok(swTake.indexOf(s) >= 0, '★ 사진첩 공유가 ' + s + ' 를 안 보냅니다');
  });
  /* 화면이 그 셋을 다 알아들어야 한다 — 하나라도 빠지면 그 경우에 아무 말이 없다.
     ⚠ 화면은 `?share=` 뒤의 «값»만 읽는다(shareFlag) — 통째 글자로 찾으면 못 찾는다. */
  const take = cutFn(app, 'function takeShared(');
  assert.match(take, /flag === 'none'/, '★ 「받은 것이 없다」에 아무 말이 없습니다');
  assert.match(take, /flag === 'err'/, '★ 「읽지 못했다」에 아무 말이 없습니다');
  assert.match(take, /alert\(/, '조용히 넘기면 사람은 올라간 줄 압니다');
  /* 표시를 지워야 한다 — 안 지우면 새로고침마다 같은 경고가 또 뜬다 */
  assert.match(take, /clearShareFlag\(\)/, '★ 표시를 안 지우면 새로고침마다 또 뜹니다');
});

test('★ 표시가 없어도 한 번 살펴본다 — 공유 직후 로그인을 거치면 표시가 날아간다', () => {
  const take = cutFn(app, 'function takeShared(');
  const iDrain = take.indexOf('drainShareIdb()');
  assert.ok(iDrain > 0, 'drainShareIdb 를 안 부릅니다');
  /* ⚠ 자리 순서만 보면 안 잡힌다 — 사이에 `if (…) return;` 한 줄을 끼워도 순서는 그대로다
     (실제로 그 되돌림이 안 잡혔다). 그래서 **꺼내기 앞의 return 이 몇 개인지** 센다.
     「받은 것이 없다·못 읽었다」 한 덩이의 return 하나뿐이어야 한다. */
  const before = take.slice(0, iDrain);
  const returns = (before.match(/\breturn\b/g) || []).length;
  assert.equal(returns, 1,
    '★ 꺼내기 앞에 되돌아 나가는 길이 ' + returns + '개입니다 — 표시가 없으면 그냥 나가는 길이' +
    ' 생기면, 로그인 화면을 거친 공유 사진이 영영 안 나옵니다');
});

test('★ 워커가 «화면»을 캐시하지 않는다 — 캐시를 두면 옛 화면이 폰에 남는다', () => {
  /* pu-version.js 의 「새 버전 자동 적용」과 싸운다(pu-sw.js 머리말).
     ⚠ 「캐시를 아예 안 쓴다」로 보면 안 된다 — 명함첩은 공유받은 파일을 캐시에 «잠깐»
       담는다(그것은 화면 캐시가 아니다). 처음에 그렇게 봐서 멀쩡한 코드가 걸렸다.
     지킬 것은 **GET 을 가로채지 않는다**는 것이다. GET 을 안 가로채면 화면·스크립트는
     늘 브라우저가 평소대로 받아 오므로 옛것이 남을 수가 없다. */
  assert.ok(!/addAll/.test(sw), '★ 화면 목록을 미리 담으면 고친 화면이 폰에서 안 바뀝니다');
  const fetchAt = sw.indexOf("addEventListener('fetch'");
  assert.ok(fetchAt > 0, 'fetch 다루는 자리를 찾지 못했습니다');
  const handler = sw.slice(fetchAt, sw.indexOf('\n});', fetchAt));
  assert.match(handler, /method !== 'POST'\) return;/,
    '★ POST 가 아닌 것을 흘려보내지 않으면 화면까지 워커를 거쳐 옛것이 남습니다');
  /* respondWith 는 공유 길 셋에만 — 그 밖에 하나라도 있으면 GET 을 잡는 길이 생긴다 */
  const responds = (handler.match(/respondWith\(/g) || []).length;
  assert.equal(responds, 3,
    '★ 가로채는 곳이 ' + responds + '군데입니다 — 공유 길(명함첩·사진첩·급여데이터함) 셋뿐이어야 합니다');
});

test('★ 워커를 한 곳에서만 등록한다 — 앱마다 따로 등록하면 서로 밀어내 공유가 죽는다', () => {
  const regs = app.match(/serviceWorker\.register\(/g) || [];
  assert.equal(regs.length, 1, '★ 워커를 ' + regs.length + '번 등록합니다 — 하나여야 합니다');
});

test('★ 꺼낸 뒤 바로 비운다 — 안 비우면 새로고침마다 같은 사진이 또 뜬다', () => {
  const fn = cutFn(app, 'function drainShareIdb(');
  assert.match(fn, /delete|clear/,
    '★ 안 비우면 같은 사진이 되풀이 뜨고, 두 번 저장하면 사진첩에 겹쳐 쌓입니다');
});

/* ══════ ② 그 기능으로 가는 길이 늘 화면에 있는가 ══════ */

test('★ 「어떻게 올리나요」에 공유 목록 넣는 법이 있다 — 설치 배너가 사라져도 찾을 수 있게', () => {
  const fn = cutFn(app, 'function openUpHelp(');
  assert.match(fn, /shareSetupHtml\(\)/,
    '★ 설치 배너는 브라우저가 신호를 줄 때만 뜹니다 — 그것만 두면 이 기능이 있는 줄도 모릅니다');
  /* ⚠ 글자로 찾으면 **내가 쓴 주석에 속는다**(그 줄을 설명하는 주석에 「공유」가 있다 —
     실제로 그렇게 걸렸다). 그래서 **함수를 돌려 나온 글**을 본다. */
  const c = { PuPhotoStore: { UPLOAD_MAX: 30 } };
  c.globalThis = c;
  vm.createContext(c);
  vm.runInContext(cutFn(app, 'function upHelpHtml('), c);
  const out = c.upHelpHtml();
  assert.match(out, /공유/, '올리는 법 안내에 공유가 한 줄도 없습니다');
  assert.match(out, /설치/, '설치해야 된다는 말이 없습니다');
});

/* 상태별로 «맞는 말만» 하는지 실제로 돌려 본다 */
function say(opts) {
  const o = opts || {};
  const c = {
    /* ⚠ 손가락 수는 `|| 5` 로 두면 안 된다 — 0 을 주려는 것이 5 로 바뀌어 진짜 맥이
       아이패드로 읽힌다(처음에 그렇게 걸렸다). undefined 만 기본값으로 바꾼다. */
    navigator: { userAgent: o.ua || 'Mozilla/5.0 (Linux; Android 14; SM-S911N) Chrome/120',
                 platform: o.platform || 'Linux armv8l',
                 maxTouchPoints: (o.touch === undefined ? 5 : o.touch),
                 standalone: o.legacyStandalone },
    window: { matchMedia: () => ({ matches: !!o.standalone }) },
    instPrompt: o.prompt || null,
    /* ⚠ 2026-08-25: 안내가 「진짜 앱인가 바로가기인가」도 본다(_realApp). 안 주면 그 줄에서
       ReferenceError 로 멎는다. 기본은 «모름»(null) — 여기 검사들은 그 갈래를 안 본다.
       바로가기·진짜 앱 갈래는 photos-real-app-vs-shortcut.test.js 가 따로 잰다. */
    _realApp: (o.realApp === undefined ? null : o.realApp)
  };
  c.globalThis = c;
  vm.createContext(c);
  vm.runInContext(cutFn(app, 'function isStandaloneWindow(') + '\n' +
    cutFn(app, 'function shareSetupHtml('), c);
  return c.shareSetupHtml();
}

test('★ 아직 안 깔았으면 «설치하면 생긴다»고 하고 단추를 준다', () => {
  const h = say({ prompt: {} });
  assert.match(h, /공유/);
  assert.match(h, /instRun\(\)/, '★ 설치할 수 있는데 단추가 없으면 손으로 찾아 헤맵니다');
});

/* ⚠⚠ 2026-08-25 에 **뜻이 바뀌었다.** 종전에는 「주소줄 없이 열렸으면 설치된 것」으로 보고
   이 검사가 그 말을 못박고 있었다. 그런데 **홈 화면 바로가기도 똑같이 그렇게 열린다** —
   바로가기는 공유 목록에 안 뜨는데 「이미 설치돼 있습니다」라고 하니, 대표님이 다시 깔면
   될 일을 안 하시고 「깔았는데도 안 뜬다」로 막혀 계셨다(2026-08-25 보고).
   이제 판정은 **진짜 앱인지 물어본 답**(_realApp)으로 한다. 지킬 것은 그대로다:
   「진짜 앱이면 또 설치하라고 하지 않는다.」 */
test('★ 진짜 앱이면 «어떻게 쓰는지»를 말한다 — 또 설치하라고 하면 안 된다', () => {
  const h = say({ standalone: true, realApp: true });
  assert.match(h, /깔려 있습니다/);
  assert.match(h, /공유/);
  assert.ok(h.indexOf('instRun()') < 0, '★ 이미 깔렸는데 설치 단추를 또 냅니다');
});

test('★ 창 모양만 보고 「설치됨」이라고 하지 않는다 — 바로가기가 그렇게 열린다', () => {
  const h = say({ standalone: true, realApp: false });
  assert.ok(h.indexOf('깔려 있습니다') < 0,
    '★ 바로가기를 설치됐다고 하면 대표님이 다시 깔 생각을 못 하십니다');
  assert.match(h, /바로가기/);
});

test('★ 브라우저가 설치 신호를 안 주면 «손으로 가는 길»을 알려 준다', () => {
  /* 크롬은 조건이 맞아야 신호를 주고, 한 번 거절하면 한동안 안 준다.
     그때 아무 말이 없으면 이 기능으로 가는 길이 통째로 막힌다. */
  const h = say({});
  assert.match(h, /메뉴/, '★ 신호가 없을 때 아무 말이 없으면 길이 막힙니다');
  assert.match(h, /앱 설치|홈 화면에 추가/);
  assert.ok(h.indexOf('instRun()') < 0, '누를 수 없는 단추를 내면 고장으로 읽힙니다');
});

test('★ 아이폰에는 «안 된다»고 사실대로 말한다 — 헛되이 설치하게 하면 안 된다', () => {
  /* 애플이 웹앱을 공유 목록에 올리는 것을 막아 두었다. 홈 화면에 추가해도 안 뜬다. */
  const h = say({ ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Safari', platform: 'iPhone' });
  assert.match(h, /애플이 막아/, '★ 「설치하면 생깁니다」는 아이폰에서 거짓입니다');
  assert.match(h, /＋ 올리기/, '그럼 무엇을 하라는지 알려 줘야 합니다');
  assert.ok(h.indexOf('instRun()') < 0, '아이폰에 설치 단추를 내면 헛수고입니다');
});

test('아이패드도 아이폰과 같이 다룬다 — 요즘 아이패드는 스스로를 맥이라 한다', () => {
  const h = say({ ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) Safari',
                  platform: 'MacIntel', touch: 5 });
  assert.match(h, /애플이 막아/, '★ 아이패드가 「설치하면 됩니다」를 보게 됩니다');
});

test('진짜 맥(손가락 안 닿는 것)은 아이폰 취급하지 않는다', () => {
  const h = say({ ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) Chrome/120',
                  platform: 'MacIntel', touch: 0, prompt: {} });
  assert.ok(h.indexOf('애플이 막아') < 0, '맥 크롬은 설치가 됩니다');
});
