/* 앱을 «폰까지» 닿게 하는 길 (대표 2026-08-29: 「앱 다시 깔게 프로그램 올려달라」)
 *
 * 앱은 사이트에 이미 올라가 있었다. 막힌 것은 «PC 로 보는 사람이 폰에 어떻게 넣나» 였다.
 * 그래서 받는 자리에 QR 과 «칠 수 있는 주소»를 함께 둔다.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ERP = fs.readFileSync(path.join(__dirname, '..', 'pu-erp.html'), 'utf8');
function bare(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}
function cutBlock(src, header) {
  const i = src.indexOf(header);
  assert.ok(i >= 0, '못 찾음: ' + header);
  let d = 0;
  for (let k = src.indexOf('{', i); k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (d === 0) return src.slice(i, k + 1); }
  }
  throw new Error('닫는 괄호 없음: ' + header);
}

/* 덩이를 진짜 그려 본다 — 글자만 맞고 터지는 것은 글자 검사로 못 잡는다. */
function render(proto) {
  const ctx = {
    HANA_APK_VER: '9.9.9',
    location: Object.assign({ protocol: 'https:', origin: 'https://x.kr', pathname: '/a/b.html' }, proto || {}),
    h: (tag, props, ...kids) => ({ tag, props: props || {}, kids }),
  };
  vm.createContext(ctx);
  vm.runInContext(cutBlock(ERP, 'function hanaApkUrl(){'), ctx);
  vm.runInContext(cutBlock(ERP, '  function hanaApkBlock(){'), ctx);
  return { tree: ctx.hanaApkBlock(), url: ctx.hanaApkUrl() };
}
function nodes(root) {
  const out = [];
  (function walk(n) {
    if (n == null) return;
    if (Array.isArray(n)) return n.forEach(walk);
    if (typeof n !== 'object') return;
    out.push(n); walk(n.kids);
  })(root);
  return out;
}
function texts(root) {
  const out = [];
  (function walk(n) {
    if (n == null) return;
    if (Array.isArray(n)) return n.forEach(walk);
    if (typeof n === 'string') { out.push(n); return; }
    if (n.kids) walk(n.kids);
  })(root);
  return out;
}

test('★★ 받는 자리가 실제로 그려지고, 누를 링크가 있다', () => {
  const { tree } = render();
  const a = nodes(tree).filter((n) => n.tag === 'a')[0];
  assert.ok(a, '★ 받는 링크가 없다 — 앱 없는 사람은 여기서 길이 끊긴다');
  assert.strictEqual(a.props.href, 'hana-bridge.apk');
  assert.ok(texts(tree).join(' ').indexOf('9.9.9') >= 0,
    '판 번호를 안 적으면 새로 깐 것이 맞는지 못 견준다');
});

test('★★ QR 을 «못 그려도» 길이 안 끊긴다 — 주소가 글자로도 있다', () => {
  const { tree, url } = render();
  const qr = nodes(tree).filter((n) => n.props && n.props.className === 'hana-qr')[0];
  assert.ok(qr, '★ QR 자리가 없다 — PC 로 보는 사람은 폰에 넣을 길이 없다');
  assert.strictEqual(qr.props['data-url'], url, 'QR 이 가리키는 곳과 실제 주소가 다르다');
  /* ★ QR 만들개는 바깥에서 받아 온다. 못 받는 날이 있다 —
     그때 주소가 글자로 없으면 화면은 빈 네모만 보여 주고 끝난다. */
  assert.ok(texts(tree).some((t) => t.indexOf(url) >= 0),
    '★ 주소가 글자로 없다 — QR 을 못 받으면 아무 길도 안 남는다');
});

test('★★ 주소는 «폰 주소창에 칠 수 있는» 온전한 주소다', () => {
  const { url } = render();
  assert.match(url, /^https:\/\/[^/]+\/.*hana-bridge\.apk$/,
    '★ 상대 주소는 폰에서 손으로 칠 수가 없다');
  assert.strictEqual(render().url, 'https://x.kr/a/hana-bridge.apk',
    '보고 있는 그 자리의 파일을 가리켜야 한다');
});

test('★ file:// 로 열어 봤을 때는 «올려 둔 곳»을 가리킨다', () => {
  const { url } = render({ protocol: 'file:', origin: 'null', pathname: '/C:/x/pu-erp.html' });
  assert.match(url, /^https:\/\/nabaho\.github\.io\//,
    '★ 내 PC 안의 주소를 알려 주면 폰에서 안 열린다');
});

test('★★ 두 창이 «같은 덩이»를 쓴다 (한쪽만 낡으면 안 된다)', () => {
  const src = bare(ERP);
  const calls = src.split('hanaApkBlock()').length - 1;
  assert.ok(calls >= 2, '★ 부르는 곳이 ' + calls + '군데다 — 연결 창과 고치기 창 둘 다 써야 한다');
  /* 덩이 밖에 손으로 적은 받기 링크가 남아 있으면 언젠가 갈라진다. */
  const block = cutBlock(ERP, '  function hanaApkBlock(){');
  const outside = src.split("href:'hana-bridge.apk'").length - 1
    - (bare(block).split("href:'hana-bridge.apk'").length - 1);
  assert.strictEqual(outside, 0,
    '★ 덩이 밖에 받기 링크가 따로 남아 있다 — 한쪽만 고치고 지나가게 된다');
});

test('★ QR 만들개는 «필요할 때만» 받는다', () => {
  const fn = bare(cutBlock(ERP, 'function _ensureQrcode(cb){'));
  assert.ok(/typeof QRCode\s*!==\s*'undefined'/.test(fn), '이미 있어도 또 받는다');
  assert.ok(fn.indexOf('s.onerror') >= 0,
    '★ 못 받았을 때를 안 다룬다 — 조용히 멈추면 왜 빈 네모인지 아무도 모른다');
  /* 처음부터 받아 두면 이 창을 안 여는 모든 사람에게 짐이 된다. */
  assert.ok(bare(ERP).indexOf('<script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs') < 0,
    '★ 처음부터 받고 있다 — 이 창은 어쩌다 한 번 여는 곳이다');
});
