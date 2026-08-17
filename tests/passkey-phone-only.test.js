/* 지문 로그인 안내줄은 «휴대폰에서만» (2026-08-16 대표 지시)
   대표 지시 둘 — "PC 에서는 지문 로그인 화면 안 나오게 해라" ·
                 "우선 크롬으로 하는 건 중단해 달라". */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'enter.html'), 'utf8');
const s = SRC.indexOf('function pkSetupRegister(');
assert.ok(s > 0, 'pkSetupRegister 를 찾지 못했다');
const FN = SRC.slice(s, SRC.indexOf('\n  function doLogin(', s));

/* 「어떤 때 뜨는가」를 글자로 보지 말고 «실제로 돌려» 본다 */
function show(opts) {
  const row = { style: { display: '' } };
  const btn = { style: {}, addEventListener() {}, _bound: false };
  const g = {
    navigator: { userAgent: opts.ua },
    window: {}, localStorage: { getItem: () => (opts.later ? opts.sid : null) },
    PK_LATER_KEY: 'pu_passkey_later',
    pkSavedSid: () => (opts.already ? opts.sid : ''),
    $: (id) => (id === 'pkRegRow' ? row : (id === 'pkRegBtn' ? btn : { style: {}, addEventListener() {} })),
    auth: { currentUser: null }, Promise, alert() {}, console
  };
  g.window.PuPasskey = opts.can === false ? null : { supported: () => true, inApp: () => !!opts.inapp };
  g.PuPasskey = g.window.PuPasskey;
  vm.createContext(g);
  vm.runInContext(FN + '\n;pkSetupRegister(__sid, "권형하");', Object.assign(g, { __sid: opts.sid || 'P001' }));
  return row.style.display;
}

const PHONE = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/126 Mobile Safari/537.36';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) AppleWebKit/605.1 Mobile/15E148 Safari/604.1';
const PC = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36';
const INAPP = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 NAVER(inapp; search; 1200; 12.0)';

test('PC 에서는 안 뜬다', () => {
  /* ★ PC 에 「이 휴대폰으로 지문 로그인」이 떠 있었다 — 문구부터 틀렸다 */
  assert.strictEqual(show({ ua: PC }), 'none');
});

test('휴대폰 크롬에서는 뜬다', () => {
  assert.notStrictEqual(show({ ua: PHONE }), 'none');
});

test('아이폰에서도 뜬다', () => {
  assert.notStrictEqual(show({ ua: IPHONE }), 'none');
});

test('앱 안 브라우저에서는 안 뜬다 — 크롬 권하기는 멈췄다', () => {
  /* 대표 지시로 중단. 다시 켤 때는 이 검사부터 바꾼다. */
  assert.strictEqual(show({ ua: INAPP, can: false }), 'none');
});

test('이미 등록한 기기에서는 안 뜬다', () => {
  assert.strictEqual(show({ ua: PHONE, already: true, sid: 'P001' }), 'none');
});

test('「나중에」를 누른 사람에게는 안 뜬다', () => {
  assert.strictEqual(show({ ua: PHONE, later: true, sid: 'P001' }), 'none');
});

test('지문을 못 쓰는 휴대폰에서는 안 뜬다', () => {
  assert.strictEqual(show({ ua: PHONE, can: false }), 'none');
});

test('크롬으로 여는 기능 자체는 남겨 둔다', () => {
  /* 다시 켤 때 새로 만들지 않도록 부품은 살려 둔다 */
  const lib = fs.readFileSync(path.join(__dirname, '..', 'js', 'pu-passkey.js'), 'utf8');
  assert.strictEqual(/function openInChrome/.test(lib), true);
});
