'use strict';
/* 「진짜 앱」인가 「홈 화면 바로가기」인가 (대표 보고 2026-08-25)

   "안드로이드 폰에서 바로 공유하려고 했는데 푸른사진첩은 안 나온다"
   → 지우고 다시 깔아 보셨는데도 안 뜬다.

   ■ 까닭 둘
     ① **앱을 가르는 이름표(id)가 하나도 없었다.** 여덟 앱이 한 폴더(/pureunall/)에 살아
        scope 가 전부 같은데 id 가 없으면 브라우저가 start_url 로 어림잡아 가른다 —
        다른 푸른 앱이 먼저 깔려 있으면 「이미 설치됨」으로 보고 설치를 안 시켜 준다.
     ② **화면이 「바로가기」와 「진짜 앱」을 구별하지 못했다.** 둘 다 주소줄 없이 열리므로
        창 모양만 보고 「이미 설치돼 있습니다」라고 했다 — 거짓말이고, 그러면 다시 깔면
        될 일을 안 하시게 된다. 공유 목록에는 **진짜 앱만** 뜬다.

   실행: node --test tests/*.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { cutFn } = require('./cut-fn');

const R = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(R, 'pu-photos.html'), 'utf8');
const mfFiles = fs.readdirSync(R).filter(f => /^.*manifest.*\.json$/.test(f));

/* ══════ ① 앱마다 이름표가 있고, 서로 겹치지 않는다 ══════ */

test('★ 매니페스트마다 앱을 가르는 이름표(id)가 있다', () => {
  const missing = mfFiles.filter(f => !JSON.parse(fs.readFileSync(path.join(R, f), 'utf8')).id);
  assert.deepEqual(missing, [],
    '★ id 가 없으면 브라우저가 start_url 로 어림잡아 가릅니다 — 여덟 앱이 한 폴더에 살아\n' +
    '  scope 가 전부 같으므로, 다른 푸른 앱이 먼저 깔려 있으면 「이미 설치됨」으로 보고\n' +
    '  설치를 안 시켜 줍니다. 그러면 진짜 앱이 안 생기고 공유 목록에도 안 뜹니다.');
});

test('★ 이름표가 서로 겹치지 않는다 — 겹치면 두 앱이 한 앱으로 다뤄진다', () => {
  const by = {};
  mfFiles.forEach(f => {
    const j = JSON.parse(fs.readFileSync(path.join(R, f), 'utf8'));
    /* id 는 origin 기준으로 풀린다 — 상대·절대를 같은 잣대로 견준다 */
    const id = new URL(j.id, 'https://x.test/pureunall/').href;
    (by[id] = by[id] || []).push(f);
  });
  const dup = Object.keys(by).filter(k => by[k].length > 1)
    .map(k => k + ' ← ' + by[k].join(', '));
  assert.deepEqual(dup, [], '★ 이름표가 겹칩니다:\n  ' + dup.join('\n  '));
  assert.ok(Object.keys(by).length >= 7, '앱이 몇 개인지 못 읽었습니다');
});

test('★ 사진첩 이름표는 바꾸지 않는다 — 바꾸면 브라우저가 «다른 앱»으로 본다', () => {
  /* 옛 것이 남고 새 것이 또 깔린다. 한 번 정한 이름표는 못박아 둔다. */
  const j = JSON.parse(fs.readFileSync(path.join(R, 'pu-photos-manifest.json'), 'utf8'));
  assert.equal(j.id, '/pureunall/pu-photos.html');
});

test('★ 사진첩이 «자기 자신»을 related_applications 에 적어 둔다 — 그래야 물어볼 수 있다', () => {
  const j = JSON.parse(fs.readFileSync(path.join(R, 'pu-photos-manifest.json'), 'utf8'));
  const ra = j.related_applications || [];
  const web = ra.filter(a => a && a.platform === 'webapp');
  assert.equal(web.length, 1,
    '★ 이것이 없으면 「진짜 앱인가 바로가기인가」를 물어볼 길이 없습니다');
  assert.match(web[0].url, /pu-photos-manifest\.json$/,
    '자기 매니페스트를 가리켜야 자기 설치 여부를 알 수 있습니다');
  assert.notEqual(j.prefer_related_applications, true,
    '★ 이것이 true 면 브라우저가 웹앱 대신 다른 앱을 깔라고 권합니다');
});

/* ══════ ② 화면이 둘을 구별해 «맞는 말»을 한다 ══════ */

function say(opts) {
  const o = opts || {};
  const c = {
    navigator: {
      userAgent: o.ua || 'Mozilla/5.0 (Linux; Android 14; SM-S911N) Chrome/120',
      platform: o.platform || 'Linux armv8l',
      maxTouchPoints: (o.touch === undefined ? 5 : o.touch),
      getInstalledRelatedApps: o.canAsk === false ? undefined : function () { return Promise.resolve([]); }
    },
    window: { matchMedia: () => ({ matches: !!o.standalone }) },
    instPrompt: o.prompt || null,
    _realApp: (o.realApp === undefined ? null : o.realApp)
  };
  c.globalThis = c;
  vm.createContext(c);
  vm.runInContext(cutFn(app, 'function isStandaloneWindow(') + '\n' +
    cutFn(app, 'function shareSetupHtml('), c);
  return c.shareSetupHtml();
}

test('★★ 바로가기인데 「이미 설치됨」이라고 하지 않는다 — 이것이 대표님을 막은 거짓말이다', () => {
  const h = say({ standalone: true, realApp: false });
  assert.ok(h.indexOf('설치돼 있습니다') < 0 && h.indexOf('깔려 있습니다') < 0,
    '★ 바로가기를 설치됐다고 하면 다시 깔면 될 일을 안 하시게 됩니다: ' + h.slice(0, 120));
  assert.match(h, /바로가기/, '무엇인지 안 알려 줍니다');
  assert.match(h, /공유 목록에 안 뜹니다/, '★ 왜 안 되는지 안 알려 줍니다');
});

test('★ 바로가기면 «다시 까는 법»을 차례대로 알려 준다', () => {
  const h = say({ standalone: true, realApp: false });
  assert.match(h, /길게 눌러 삭제|아이콘을 지우/, '지우는 것부터 말해야 합니다');
  assert.match(h, /크롬/, '어느 브라우저인지 안 알려 줍니다');
  assert.match(h, /앱 설치/, '무엇을 눌러야 하는지 안 알려 줍니다');
  assert.match(h, /사진은 한 장도 안 없어집니다|사진은 그대로/,
    '★ 사진이 없어질까 봐 못 지웁니다 — 안 없어진다고 말해야 합니다');
  /* 「홈 화면에 추가」를 누르면 또 바로가기가 된다 — 그것을 짚어 준다 */
  assert.match(h, /홈 화면에 추가.*안 됩니다|안 됩니다.*홈 화면에 추가/,
    '★ 「홈 화면에 추가」를 누르면 같은 자리로 돌아옵니다');
});

test('★ 진짜 앱이면 쓰는 법을 말한다 — 또 깔라고 하면 안 된다', () => {
  const h = say({ standalone: true, realApp: true });
  assert.match(h, /진짜 앱으로 깔려 있습니다/);
  assert.match(h, /공유/);
  assert.ok(h.indexOf('다시 깔아') < 0, '★ 이미 깔렸는데 또 깔라고 합니다');
});

test('★ 물어볼 수 없는 기기에는 «단정하지 않는다» — 모르면서 헛수고 시키면 안 된다', () => {
  const h = say({ standalone: true, canAsk: false, realApp: null });
  assert.match(h, /바로가기일 수 있습니다|바로가기<\/b>일 수 있습니다/,
    '★ 단정하지 말고 그럴 수 있다고만 해야 합니다: ' + h.slice(0, 120));
  assert.ok(h.indexOf('진짜 앱으로 깔려 있습니다') < 0, '모르면서 깔렸다고 하면 안 됩니다');
});

test('브라우저로 열었고 설치할 수 있으면 설치 단추를 준다', () => {
  const h = say({ standalone: false, prompt: {} });
  assert.match(h, /instRun\(\)/);
});

test('아이폰 판정이 먼저다 — 애플에는 어차피 안 되므로 「바로가기」 이야기가 헛되다', () => {
  const h = say({ ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Safari', platform: 'iPhone',
                  standalone: true, realApp: false });
  assert.match(h, /애플이 막아/);
  assert.ok(h.indexOf('크롬 메뉴') < 0, '아이폰에 크롬 설치를 시키면 헛수고입니다');
});

/* ══════ ③ 물어보는 층 ══════ */

test('★ 물어보다 터져도 화면은 돈다 — 이것 때문에 사진첩이 멎으면 안 된다', async () => {
  const c = {
    navigator: { getInstalledRelatedApps: () => Promise.reject(new Error('안 됨')) },
    _realApp: null, Promise
  };
  c.globalThis = c;
  vm.createContext(c);
  vm.runInContext(cutFn(app, 'function askRealApp('), c);
  assert.equal(await c.askRealApp(), null, '★ 터지면 화면이 통째로 멎습니다');
});

test('그 길이 없는 브라우저면 «모름»으로 둔다', async () => {
  const c = { navigator: {}, _realApp: null, Promise };
  c.globalThis = c;
  vm.createContext(c);
  vm.runInContext(cutFn(app, 'function askRealApp('), c);
  assert.equal(await c.askRealApp(), null);
});

test('★ webapp 인 것만 «진짜 앱»으로 센다 — 다른 platform 이 섞여 올 수 있다', async () => {
  const c = {
    navigator: { getInstalledRelatedApps: () => Promise.resolve([{ platform: 'play', id: 'x' }]) },
    _realApp: null, Promise
  };
  c.globalThis = c;
  vm.createContext(c);
  vm.runInContext(cutFn(app, 'function askRealApp('), c);
  assert.equal(await c.askRealApp(), false, '★ 스토어 앱을 우리 앱으로 세면 안 됩니다');
});

/* ══════ ④ 배선 — 알림이 «앱을 열자마자» 보이는가 ══════ */

test('★★ 바로가기 알림이 설치 신호 없이도 뜬다 — 그것이 안 오는 것이 바로 이 경우다', () => {
  /* 바로가기 창 안에서는 `beforeinstallprompt` 가 오지 않는다. 종전 규칙
     (`!instPrompt` 면 안 보임)대로면 이 사람은 **영영 아무 안내도 못 본다.** */
  const fn = cutFn(app, 'function renderInstNote(');
  const iShortcut = fn.indexOf('_realApp === false');
  const iNoPrompt = fn.indexOf('if (!instPrompt)');
  assert.ok(iShortcut > 0, '★ 바로가기일 때의 안내가 없습니다');
  assert.ok(iNoPrompt > 0, '설치 신호가 없을 때를 안 다룹니다');
  assert.ok(iShortcut < iNoPrompt,
    '★ 「설치 신호 없으면 숨김」이 먼저면 바로가기 알림이 영영 안 뜹니다');
});

test('★ 앱을 열 때 물어본다 — 안내창을 눌러야만 알면 여전히 못 찾는다', () => {
  assert.match(app, /askRealApp\(\)\.then\(function \(\) \{ renderInstNote\(\); \}\);/,
    '★ 시작할 때 안 물어보면 배너가 「모름」인 채로 안 뜹니다');
});

test('★ 기다리지 않는다 — 답이 늦어도 화면은 먼저 뜬다', () => {
  const fn = cutFn(app, 'function openUpHelp(');
  const iDraw = fn.indexOf('draw();');
  const iAsk = fn.indexOf('askRealApp()');
  assert.ok(iDraw > 0 && iAsk > iDraw,
    '★ 물어본 뒤에 그리면 느린 기기에서 창이 빈 채로 뜹니다');
  assert.match(fn, /if \(box && \$\('kindPopup'\)\.style\.display === 'flex'\)/,
    '★ 답이 오는 사이에 창을 닫았으면 그리지 말아야 합니다');
});
