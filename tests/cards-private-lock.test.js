/* 개인 폴더 잠금 — 틀리는 방향이 둘이다.
   덜 옮기면 명함이 공용 자리에 남아 그대로 보이고,
   더 옮기면 남의 명함까지 개인 창고로 사라진다.
   특히 '옛 자리를 지우는 것'을 빠뜨리면 숨긴 줄 알았는데 그대로 있다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const HTML = path.join(__dirname, '..', 'pu-cards.html');
const src = fs.readFileSync(HTML, 'utf8');

function slice(a, b){
  const i = src.indexOf(a);
  if(i < 0) throw new Error('시작 표식 못찾음: ' + a);
  const j = src.indexOf(b, i);
  if(j < 0) throw new Error('끝 표식 못찾음: ' + b);
  return src.slice(i, j);
}

function load(){
  const code = slice(
    '/* ══════ 개인 창고 — 순수 로직 (테스트 대상) ══════',
    '/* ══════ 개인 창고 — 화면 ══════');
  const ctx = {
    console, Object, Array, String, JSON, Date, Math, Promise, Uint8Array, TextEncoder,
    crypto: require('node:crypto').webcrypto,
    btoa: s => Buffer.from(s, 'binary').toString('base64'),
    atob: s => Buffer.from(s, 'base64').toString('binary'),
    DB_ROOT: 'pucards',
    PRIV_ROOT: 'pucards_private',
    privRoot: () => 'pucards_private/UID1'
  };
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  ctx.read = expr => vm.runInContext(expr, ctx);
  return ctx;
}

const keys = o => Object.keys(o).sort().join('\n');

test('같은 비밀번호는 같은 흔적을 남긴다', async () => {
  const c = load();
  const salt = c.newSalt();
  const a = await c.pwHash('열려라1234', salt, 1000);
  const b = await c.pwHash('열려라1234', salt, 1000);
  assert.equal(a, b);
});

test('다른 비밀번호는 다른 흔적을 남긴다', async () => {
  const c = load();
  const salt = c.newSalt();
  const a = await c.pwHash('열려라1234', salt, 1000);
  const b = await c.pwHash('열려라12345', salt, 1000);
  assert.notEqual(a, b);
});

test('소금이 다르면 같은 비밀번호도 다른 흔적 — 미리 계산해 두고 맞히기 어렵게', async () => {
  const c = load();
  const a = await c.pwHash('열려라1234', c.newSalt(), 1000);
  const b = await c.pwHash('열려라1234', c.newSalt(), 1000);
  assert.notEqual(a, b);
});

test('흔적에 비밀번호가 그대로 들어 있지 않다', async () => {
  const c = load();
  const h = await c.pwHash('열려라1234', c.newSalt(), 1000);
  assert.equal(h.indexOf('열려라1234'), -1);
});

test('소금은 매번 다르다', () => {
  const c = load();
  assert.notEqual(c.newSalt(), c.newSalt());
});

test('반복 횟수는 10만 번', () => {
  const c = load();
  assert.equal(c.read('PW_ITER'), 100000);
});

test('잠글 때 — 개인 자리에 쓰고 공용 자리를 모두 지운다', () => {
  const c = load();
  const p = c.movePaths(['a1','a2'], 'g1', 'lock');
  assert.equal(keys(p), keys({
    'pucards_private/UID1/groups/g1': 1,
    'pucards_private/UID1/items/a1': 1,
    'pucards_private/UID1/items/a2': 1,
    'pucards_private/UID1/photos/a1': 1,
    'pucards_private/UID1/photos/a2': 1,
    'pucards/groups/g1': 1,
    'pucards/items/a1': 1,
    'pucards/items/a2': 1,
    'pucards/photos/a1': 1,
    'pucards/photos/a2': 1,
    'pucards/idx/a1': 1,
    'pucards/idx/a2': 1
  }));
});

test('잠글 때 — 공용 자리 값은 반드시 null (지우기)', () => {
  const c = load();
  const p = c.movePaths(['a1'], 'g1', 'lock');
  assert.equal(p['pucards/items/a1'], null);
  assert.equal(p['pucards/photos/a1'], null);
  assert.equal(p['pucards/idx/a1'], null);
  assert.equal(p['pucards/groups/g1'], null);
});

test('잠글 때 — 공유 검색목록에는 절대 값을 쓰지 않는다', () => {
  const c = load();
  const p = c.movePaths(['a1','a2'], 'g1', 'lock');
  Object.keys(p).forEach(k => {
    if(k.indexOf('pucards/idx/') === 0) assert.equal(p[k], null, k + ' 에 값을 쓰면 안 된다');
  });
});

test('풀 때 — 개인 자리를 지우고 공용 자리에 되돌린다', () => {
  const c = load();
  const p = c.movePaths(['a1'], 'g1', 'unlock');
  assert.equal(p['pucards_private/UID1/items/a1'], null);
  assert.equal(p['pucards_private/UID1/photos/a1'], null);
  assert.equal(p['pucards_private/UID1/groups/g1'], null);
  assert.notEqual(p['pucards/items/a1'], null);
  assert.notEqual(p['pucards/groups/g1'], null);
});

test('명함이 없는 폴더도 폴더 기록만은 옮긴다', () => {
  const c = load();
  const p = c.movePaths([], 'g1', 'lock');
  assert.equal(keys(p), keys({
    'pucards_private/UID1/groups/g1': 1,
    'pucards/groups/g1': 1
  }));
});
