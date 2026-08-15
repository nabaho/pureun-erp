'use strict';
/* 다른 직원이 찍은 서류를 판독해 명함첩에 넣기 — 실행: node --test tests/*.test.js
   (이 환경의 node는 --test 에 디렉터리 인자를 주면 죽는다. 반드시 glob으로 파일을 넘긴다.)

   대표 지시 2026-08-10: "중복되는것은 제외하더라도 추가로 다른 직원이 사진찍은
   데이터는 입력이 되어야 한다."

   그동안은 판독 결과를 담을 자리를 **늘 내 자리**로 잡았다(saveRead 가 주인을
   못 받았다). 그래서 화면이 판독 자체를 잠갔고, 다른 직원이 찍은 명함은 그 직원이
   자기 사진첩을 열고 있을 때만 명함첩에 들어갔다.

   여기서는 **어느 자리를 쓰는가**를 실제로 돌려서 본다 — 이걸 틀리면 조용히
   엉뚱한 자리에 쓰고, 그 사람 사진은 영원히 안 읽힌 채로 남는다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'pu-photos.html'), 'utf8');

/* 화면의 photoOwner 를 **그대로 떠와서** 돌린다. 베낀 코드로 검사하면 뜻이 없다. */
function loadPhotoOwner(env) {
  const i = app.indexOf('\nfunction photoOwner(');
  assert.ok(i >= 0, 'photoOwner 를 찾을 수 없습니다');
  const j = app.indexOf('\n}', i);
  const src = app.slice(i, j + 2);
  const sandbox = Object.assign({
    ALL_OWNERS: '__all__', SHARED_OWNER: '__shared__',
    gridItems: [], gridOwner: null,
    PuPhotoStore: { myUid: () => 'ME' }
  }, env || {});
  vm.createContext(sandbox);
  new vm.Script(src + '\nthis.__f = photoOwner;').runInContext(sandbox);
  return sandbox.__f;
}

const photo = (id, ownerUid, ownerName) => ({
  id, meta: ownerUid ? { __ownerUid: ownerUid, __ownerName: ownerName || '' } : {}
});

test('내 사진첩에서는 주인을 넘기지 않는다 — 저장 층이 나로 본다', () => {
  const f = loadPhotoOwner({ gridItems: [photo('p1')], gridOwner: null });
  assert.equal(f('p1'), undefined);
});

test('한 사람만 볼 때는 그 사람 자리', () => {
  const f = loadPhotoOwner({ gridItems: [photo('p1')], gridOwner: 'U9' });
  assert.equal(f('p1'), 'U9');
});

test('「전체 근로자」에서는 사진마다 붙은 주인을 쓴다', () => {
  const f = loadPhotoOwner({
    gridItems: [photo('p1', 'U9', '박은비'), photo('p2', 'ME', '나')],
    gridOwner: '__all__'
  });
  assert.equal(f('p1'), 'U9', '남의 사진을 내 자리로 봅니다');
  assert.equal(f('p2'), 'ME');
});

test('「전체 근로자」 표를 사람 아이디로 넘기지 않는다 — 없는 자리를 두드린다', () => {
  /* puphotos/u/__all__ 은 존재하지 않는다. 여기서 __all__ 이 새 나가면
     판독 결과가 아무도 안 보는 자리에 쌓인다. */
  const f = loadPhotoOwner({ gridItems: [photo('p1')], gridOwner: '__all__' });
  assert.equal(f('p1'), undefined);
});

test('「받은 사진」 표도 사람 아이디로 넘기지 않는다', () => {
  const f = loadPhotoOwner({ gridItems: [photo('p1')], gridOwner: '__shared__' });
  assert.equal(f('p1'), undefined);
});

test('목록에 없는 사진이어도 터지지 않는다', () => {
  const f = loadPhotoOwner({ gridItems: [], gridOwner: 'U9' });
  assert.equal(f('없는사진'), 'U9');
});

/* ── 저장 층까지 이어 본다 ── */

function loadStore() {
  const src = fs.readFileSync(path.join(root, 'js', 'pu-photo-store.js'), 'utf8');
  const sandbox = { window: {}, console };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  new vm.Script(src, { filename: 'pu-photo-store.js' }).runInContext(sandbox);
  return sandbox.window.PuPhotoStore;
}

test('화면이 찾은 주인으로 저장하면 그 사람 사진 아래에 들어간다', () => {
  const S = loadStore();
  const paths = [];
  S.init({ uid: 'ME', db: { ref: () => ({ update: (u) => { paths.push(Object.keys(u)[0]); return Promise.resolve(); } }) } });
  const f = loadPhotoOwner({ gridItems: [photo('p1', 'U9', '박은비')], gridOwner: '__all__' });
  return S.saveRead('2026', 'p1', { kind: 'card' }, f('p1')).then(function () {
    assert.deepEqual(paths, ['puphotos/u/U9/items/2026/p1/read'],
      '박은비 님 사진의 판독 결과가 엉뚱한 자리에 저장됩니다');
  });
});

/* ── 여러 장 한꺼번에 명함첩으로 ──
   판독은 됐지만 검증에 걸려 안 간 것들이 「확인 필요」에 쌓인다. 한 장씩 열어
   보내면 스무 장에 스무 번이다. */

function fnBody(name) {
  const head = '\nfunction ' + name + '(';
  const i = app.indexOf(head);
  assert.ok(i >= 0, name + ' 를 찾을 수 없습니다');
  const j = app.indexOf('\n}', i);
  return app.slice(i, j + 2);
}

test('도구줄에 「명함첩으로 보내기」 단추가 있다', () => {
  assert.match(app, /id="sendSelBtn"[^>]*onclick="sendSelected\(\)"/);
  assert.match(app, /function sendSelected\(/);
});

test('보낼 것이 없으면 단추가 안 나온다 — 눌러도 안 되는 단추는 고장으로 읽힌다', () => {
  const fn = fnBody('renderGridBar');
  assert.match(fn, /sendSelBtn'\)\.style\.display = sendN/, '늘 띄우고 있습니다');
  assert.match(fn, /canSend\(/, '보낼 수 있는 것만 세지 않습니다');
});

test('모아 보내기는 AI 를 다시 부르지 않는다 — 이미 읽은 값을 쓴다', () => {
  /* readPhoto 를 부르면 사진마다 AI 한 번이다. 하루 한도를 순식간에 태운다. */
  const fn = fnBody('sendSelected');
  assert.ok(!/readPhoto\(/.test(fn), 'AI 판독을 다시 부릅니다');
  assert.ok(!/PuDocRead/.test(fn), 'AI 판독 층을 부릅니다');
  assert.match(fn, /sendCards\(/, '명함첩으로 보내지 않습니다');
});

test('모아 보내기는 겹쳐 눌러도 한 번만 돈다', () => {
  const fn = fnBody('sendSelected');
  assert.match(fn, /if \(sending\) return;/, '두 번 누르면 두 번 보냅니다');
  assert.match(app, /let sending = false;/);
});

test('모아 보내기는 무엇을 보내는지 먼저 물어본다', () => {
  /* 값이 미덥지 않은 것도 보내는 길이다 — 말없이 보내면 안 된다. */
  assert.match(fnBody('sendSelected'), /confirm\(/, '묻지 않고 보냅니다');
});

test('명함첩에는 **찍은 사람** 이름이 남는다 — 대신 보낸 사람이 아니다', () => {
  /* 대표가 남의 사진을 대신 보낼 때 자기 이름을 적으면 명함첩의
     「누가 가져온 명함인가」가 틀어진다. */
  const i = app.indexOf('\nfunction sendCards(');
  const j = app.indexOf('\n}', i);
  const fn = app.slice(i, j + 2);
  const m = fn.match(/byName:([^\n]*)/);
  assert.ok(m, 'sendCards 가 byName 을 안 넘깁니다');
  assert.match(m[1], /__ownerName/, '찍은 사람 대신 보낸 사람 이름이 들어갑니다');
  assert.ok(m[1].indexOf('__ownerName') < m[1].indexOf('myName'),
    '찍은 사람보다 내 이름을 먼저 씁니다');
});
