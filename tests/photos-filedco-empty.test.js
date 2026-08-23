/* 업체관리 기록에 filled 가 **없을 때** 화면이 멎지 않는다
   대표 보고 2026-08-11: 사진첩이 「사진 목록을 불러오지 못했습니다 —
   Cannot read properties of undefined (reading 'length')」로 통째로 막혔다.

   왜 생기나 ─────────────────────────────────────────────
   sendCompany 는 filedCo 를 { found, filled: [...], message } 로 적는다.
   업체를 **찾았지만 채울 칸이 하나도 없으면**(이미 다 차 있음) filled 가 [] 다.
   실시간DB 는 빈 배열을 「값 없음」으로 보고 **아예 안 적는다.** 그래서 다시
   읽어 오면 filedCo 에 filled 칸 자체가 없다 — 그대로 .length 를 읽으면 던진다.

   왜 이제서야 터졌나 ──────────────────────────────────
   사업자등록증이 138장까지 쌓이면서 그런 사진이 마침내 하나 생겼다. 한 장만
   그래도 격자를 그리는 되돌이 전체가 멎어 **사진이 한 장도 안 보인다.**

   ⚠ 읽는 곳이 넷인데 **한 곳만** 고쳐져 있었다(shipRowOf). 그래서 한 곳으로 모았다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const app = fs.readFileSync(path.join(__dirname, '..', 'pu-photos.html'), 'utf8');

/* 진짜 함수를 뽑아 돌린다 — 글자만 보면 「.length 를 안 쓴다」를 증명할 수 없다.
   needsCheck 가 기대는 것만 가짜로 채운다. */
function loadNeedsCheck() {
  const pick = function (name) {
    const m = app.match(new RegExp('function ' + name + '\\([\\s\\S]*?\\n\\}'));
    assert.ok(m, name + ' 을 찾지 못했습니다');
    return m[0];
  };
  const ctx = {
    Number, Math, String,
    CARD_KINDS: { card: 1, bizreg: 1 },
    CO_KINDS: { bizreg: 1, sme: 1 },
    /* ⚠ 2026-08-15 — 「보관만 하는 갈래」 목록이 새로 생겼다. 화면에서 그대로
       가져온다(베껴 적으면 갈래를 늘릴 때 검사만 옛 목록을 본다). */
    KEEP_ONLY: (function () {
      const m = app.match(/const KEEP_ONLY = \{([^}]*)\};/);
      assert.ok(m, 'KEEP_ONLY 를 찾지 못했습니다');
      const o = {};
      m[1].split(',').forEach(function (s) {
        const k = s.split(':')[0].trim();
        if (k) o[k] = 1;
      });
      return o;
    })(),
    readAnyField: function () { return false; }
  };
  vm.createContext(ctx);
  /* 원본이 작은 서류 판정(2026-08-13)도 needsCheck 가 기댄다 — 진짜 함수를 넣는다 */
  const minEdge = app.match(/^const MIN_READ_EDGE = \{[\s\S]*?\n\};/m);
  assert.ok(minEdge, 'MIN_READ_EDGE 를 찾지 못했습니다');
  vm.runInContext(minEdge[0].replace('const ', 'var ') + '\n' + pick('tooSmall') + '\n' +
    pick('coFilledOk') + '\n' + pick('coTodo') + '\n' + pick('needsCheck') + '\n' + pick('checkWhy'), ctx);
  return ctx;
}

/* 실시간DB 를 다녀온 모습 — filled 가 통째로 없다 */
const fromDb = {
  meta: { read: { kind: 'bizreg', auto: true, filed: { id: 'c1' },
    filedCo: { at: 1, found: true, message: '이미 다 차 있었습니다' } } }
};

test('★ filled 가 없어도 던지지 않는다 — 이것이 사진첩을 통째로 막았다', () => {
  const ctx = loadNeedsCheck();
  assert.doesNotThrow(function () { ctx.needsCheck(fromDb); },
    '한 장만 이래도 격자 되돌이가 멎어 사진이 한 장도 안 보입니다.');
});

/* ⚠ 2026-08-23 대표 결정으로 뒤집힌 검사다. 종전에는 「채운 칸이 없으면 확인
   필요로 남는다」였다. 그런데 이 상태의 뜻은 «업체를 찾았고 이미 다 들어 있었다»
   여서, 사람이 할 일이 하나도 없는데 목록에 쌓였다(실데이터 9장).
   ⚠ 아래 「업체를 못 찾았으면」 검사는 그대로다 — 그것이 진짜 할 일이다. */
test('★ 업체를 찾았고 이미 다 들어 있었으면 할 일이 아니다 (2026-08-23 뒤집음)', () => {
  const ctx = loadNeedsCheck();
  assert.equal(ctx.needsCheck(fromDb), false,
    '★ 할 일이 하나도 없는데 목록에 쌓입니다 — 치울 수 없는 할 일이 목록을 못 믿게 합니다.');
  assert.equal(ctx.checkWhy(fromDb), '',
    '목록에서 뺐는데 이유가 남으면 안 보이는 사진의 이유가 떠다닙니다.');
});

test('실제로 채웠으면 할 일이 아니다', () => {
  const ctx = loadNeedsCheck();
  const done = { meta: { read: { kind: 'bizreg', auto: true, filed: { id: 'c1' },
    filedCo: { at: 1, found: true, filled: ['대표자', '주소'], message: '2칸 채움' } } } };
  assert.equal(ctx.needsCheck(done), false);
});

/* ⚠ 2026-08-23 두 번째 결정으로 뒤집혔다: **업체는 계약이 만든다.** 업체가 아직
   없는 것은 사진첩에서 할 수 있는 일이 없는 «기다림»이고, 계약관리에서 업체가
   생기면 coSweep 이 저절로 채운다(실데이터 152장이 이 꼴이었다).
   자세한 것은 tests/photos-co-follows-contract.test.js. */
test('업체를 못 찾았으면 기다린다 — 보낸 것은 이미 보낸 것이다 (2026-08-23 뒤집음)', () => {
  const ctx = loadNeedsCheck();
  const notFound = { meta: { read: { kind: 'bizreg', auto: true, filed: { id: 'c1' },
    filedCo: { at: 1, found: false, filled: ['대표자'], message: '업체 없음' } } } };
  assert.equal(ctx.needsCheck(notFound), false);
  /* 아직 «보낸 적이 없는» 것은 그대로 할 일이다 — 누르면 끝난다. */
  const never = { meta: { read: { kind: 'sme', auto: true, filed: { id: 'c1' } } } };
  assert.equal(ctx.needsCheck(never), true,
    '★ 중소기업확인서는 명함첩에 안 가므로 이걸 놓치면 아무 곳에도 안 들어갑니다');
});

/* ── 한 곳으로 모았는가 ── */
test('★ filled 를 맨손으로 읽는 곳이 하나도 없다', () => {
  /* 한 곳만 고치면 또 터진다 — 실제로 그렇게 한 번 터졌다.
     .filled 뒤에 곧바로 .length 가 오는 곳이 있으면 안 된다. */
  const bare = app.match(/filed(Co)?\.filled\.length/g) || [];
  assert.equal(bare.length, 0,
    'filled 를 그대로 읽는 곳이 ' + bare.length + '곳 남아 있습니다 — 거기서 또 멎습니다.');
});

test('★ 읽는 곳이 모두 같은 함수를 쓴다', () => {
  assert.match(app, /function coFilledOk\(read\)/, '한 곳으로 모으는 함수가 없습니다.');
  /* ⚠ 2026-08-23 부터 «할 일인가»를 가리는 일은 coTodo 로 옮겼다(업체가 아직
     없는 것은 기다림이다). 그래서 coFilledOk 를 쓰는 곳이 줄었다 — 줄었다고
     흩어진 것은 아니다. 둘을 합쳐 세고, 맨손으로 읽는 곳이 없는지는 위 검사가 본다. */
  const uses = (app.match(/coFilledOk\(/g) || []).length + (app.match(/coTodo\(/g) || []).length;
  assert.ok(uses >= 6, '업체관리 판정을 쓰는 곳이 ' + uses + '곳뿐입니다 — 흩어져 있습니다.');
  assert.match(app, /function coTodo\(read\)/, '할 일 판정을 모으는 함수가 없습니다.');
  const fn = app.match(/function coFilledOk\([\s\S]*?\n\}/)[0];
  /* ⚠ 2026-08-23 부터 filled 를 «아예 안 본다» — found 만으로 가른다. 그래서
     「없을 수 있다」를 다룰 필요 자체가 없어졌다(멎을 자리가 사라진 것이 더 낫다).
     대신 맨몸으로 읽지 않는 것을 못박는다. */
  assert.ok(!/\.filled\.length/.test(fn),
    '★ filled 를 맨몸으로 읽으면 그 칸이 없을 때 그 줄에서 화면이 멎습니다.');
  assert.match(fn, /c\.found/, 'found 를 안 보면 업체 없는 것까지 통과합니다.');
});

test('왜 없을 수 있는지 코드에 적어 둔다 — 다음 사람이 또 벗겨 낸다', () => {
  const fn = app.match(/\/\*[^*]*업체관리에 \*\*실제로 채워[\s\S]*?function coFilledOk/);
  assert.ok(fn, 'coFilledOk 위 설명을 찾지 못했습니다.');
  assert.match(fn[0], /빈 배열/, '실시간DB 가 빈 배열을 안 적는다는 사실이 빠졌습니다.');
});
