/* 개인 폴더 「지문」 — 감춘 명함이 사진첩을 타고 도로 드러나지 않게 하는 층.
   지키는 것은 세 가지다.
     1. 지문에 번호가 그대로 들어 있지 않다 (읽어도 누구인지 모른다)
     2. 기업정보함과 사진첩이 **같은 지문**을 만든다 (다르면 못 알아본다)
     3. 개인 폴더에 있으면 사진첩이 아무것도 만들지 않는다 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function load(file, sandbox) {
  const src = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  vm.runInNewContext(src, sandbox);
  return sandbox;
}

function fresh() {
  const sandbox = { crypto: globalThis.crypto, TextEncoder, Buffer, console };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  load('js/pu-lockkey.js', sandbox);
  return sandbox;
}

test('지문에 번호가 그대로 들어 있지 않다', async () => {
  const { PuLockKey } = fresh();
  const fp = await PuLockKey.fingerprint('01012000003');
  assert.ok(fp, '지문이 만들어져야 한다');
  assert.ok(!fp.includes('01012000003'), '번호가 그대로 보인다');
  assert.ok(!fp.includes('2802'), '번호 일부가 그대로 보인다');
});

test('실시간DB 열쇠로 쓸 수 있는 글자만 (. $ # [ ] / 금지)', async () => {
  const { PuLockKey } = fresh();
  for (const n of ['01012345678', '0212345678', '1234567890']) {
    const fp = await PuLockKey.fingerprint(n);
    assert.match(fp, /^[A-Za-z0-9_-]+$/, n + ' → 쓸 수 없는 글자: ' + fp);
  }
});

test('같은 번호는 같은 지문 — 표기가 달라도 (하이픈·공백)', async () => {
  const { PuLockKey } = fresh();
  const a = await PuLockKey.fingerprint('010-1200-0003');
  const b = await PuLockKey.fingerprint('010 1200 0003');
  const c = await PuLockKey.fingerprint('01012000003');
  assert.equal(a, b);
  assert.equal(b, c);
});

test('다른 번호는 다른 지문', async () => {
  const { PuLockKey } = fresh();
  const a = await PuLockKey.fingerprint('01012000003');
  const b = await PuLockKey.fingerprint('01028024602');
  assert.notEqual(a, b);
});

test('앱을 새로 켜도 같은 지문 — 소금이 고정이라야 양쪽이 알아본다', async () => {
  const a = await fresh().PuLockKey.fingerprint('01012000003');
  const b = await fresh().PuLockKey.fingerprint('01012000003');
  assert.equal(a, b, '앱마다 지문이 다르면 사진첩이 기업정보함 지문을 못 알아본다');
});

test('열쇠가 없으면 지문을 만들지 않는다 — 빈 지문을 한 칸에 몰아 쓰면 안 된다', async () => {
  const { PuLockKey } = fresh();
  assert.equal(await PuLockKey.fingerprint(''), null);
  assert.equal(await PuLockKey.fingerprint(null), null);
  assert.equal(await PuLockKey.fingerprint('이름만있음'), null);
});

test('무엇을 열쇠로 보나 — 명함은 휴대폰, 사업자등록증은 사업자번호', () => {
  const { PuLockKey } = fresh();
  assert.equal(PuLockKey.keyOf('card', { mobile: '010-1111-2222', bizno: '111-11-11111' }), '01011112222');
  assert.equal(PuLockKey.keyOf('biz', { mobile: '010-1111-2222', bizno: '111-11-11111' }), '1111111111');
  /* 사진첩 판독 층은 'bizreg' 라고 부른다 — 두 이름이 같은 것을 가리켜야 한다 */
  assert.equal(PuLockKey.keyOf('bizreg', { bizno: '111-11-11111' }), '1111111111');
  assert.equal(PuLockKey.keyOf('payslip', { mobile: '010-1111-2222' }), '', '명함·사업자등록증만 본다');
});

test('기업정보함 레코드에서도 같은 열쇠가 나온다 (kind 가 card/biz)', () => {
  const { PuLockKey } = fresh();
  assert.equal(PuLockKey.keyOfItem({ kind: 'card', mobile: '010-1111-2222' }), '01011112222');
  assert.equal(PuLockKey.keyOfItem({ kind: 'biz', bizno: '111-11-11111' }), '1111111111');
  assert.equal(PuLockKey.keyOfItem(null), '');
});

test('기업정보함과 사진첩이 같은 지문을 만든다 — 한쪽은 레코드, 한쪽은 판독 결과', async () => {
  const { PuLockKey } = fresh();
  const 기업정보함 = await PuLockKey.fingerprint(
    PuLockKey.keyOfItem({ kind: 'card', mobile: '010-1200-0003' }));
  const 사진첩 = await PuLockKey.fingerprint(
    PuLockKey.keyOf('card', { mobile: '01012000003' }));
  assert.equal(기업정보함, 사진첩);
});

test('담기는 자리는 pucards 아래 — 직원도 읽을 수 있어야 사진첩이 물어본다', () => {
  const { PuLockKey } = fresh();
  assert.equal(PuLockKey.pathOf('abc'), 'pucards/lockkeys/abc');
});

/* ══════ 사진첩 등록 층이 실제로 막는가 ══════ */

function fileLayer(lockkeys) {
  const sandbox = { crypto: globalThis.crypto, TextEncoder, Buffer, console };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  load('js/pu-lockkey.js', sandbox);
  load('js/pu-doc-read.js', sandbox);
  load('js/pu-doc-file.js', sandbox);
  const written = {};
  const db = {
    ref(p) {
      return {
        once() {
          if (p.indexOf('pucards/lockkeys/') === 0) {
            return Promise.resolve({ val: () => (lockkeys[p.split('/').pop()] ? 1 : null) });
          }
          if (p === 'pucards/idx') return Promise.resolve({ val: () => ({}) });
          return Promise.resolve({ val: () => null });
        },
        push: () => ({ key: 'newid1' }),
        update(u) { Object.assign(written, u); return Promise.resolve(); }
      };
    }
  };
  db.ref = ((orig) => function (p) {
    if (p === undefined) return { update(u) { Object.assign(written, u); return Promise.resolve(); } };
    return orig(p);
  })(db.ref);
  sandbox.PuDocFile.init({ db });
  return { F: sandbox.PuDocFile, LK: sandbox.PuLockKey, written };
}

test('개인 폴더에 있는 명함이면 아무것도 만들지 않는다', async () => {
  const probe = fresh().PuLockKey;
  const fp = await probe.fingerprint('01012000003');
  const { F, written } = fileLayer({ [fp]: 1 });
  const res = await F.sendToCards({ kind: 'card', fields: { name: '홍길동', mobile: '010-1200-0003' } });
  assert.equal(res.blocked, true);
  assert.equal(res.created, false);
  assert.equal(res.id, '');
  assert.deepEqual(written, {}, '한 칸도 쓰면 안 된다');
});

test('막았다는 말에 「개인 폴더」가 드러나지 않는다', async () => {
  const probe = fresh().PuLockKey;
  const fp = await probe.fingerprint('01012000003');
  const { F } = fileLayer({ [fp]: 1 });
  const res = await F.sendToCards({ kind: 'card', fields: { name: '홍길동', mobile: '010-1200-0003' } });
  assert.ok(!/개인|대표|잠/.test(res.message),
    '어디에 있는지 말하면 감춘 사실 자체가 드러난다: ' + res.message);
});

test('개인 폴더에 없으면 예전대로 새로 넣는다', async () => {
  const { F, written } = fileLayer({});
  const res = await F.sendToCards({ kind: 'card', fields: { name: '홍길동', mobile: '010-1200-0003' } });
  assert.ok(!res.blocked);
  assert.equal(res.created, true);
  assert.ok(written['pucards/items/newid1'], '새 명함이 들어가야 한다');
  assert.ok(written['pucards/idx/newid1'], '검색목록도 함께 써야 한다');
});

test('휴대폰이 없는 명함은 지문으로 막지 않는다 — 열쇠가 없으면 판단할 수 없다', async () => {
  const { F } = fileLayer({});
  const res = await F.sendToCards({ kind: 'card', fields: { name: '홍길동', company: '가나상사' } });
  assert.ok(!res.blocked);
  assert.equal(res.created, true);
});
