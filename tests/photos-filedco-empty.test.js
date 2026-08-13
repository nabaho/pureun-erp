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
    readAnyField: function () { return false; }
  };
  vm.createContext(ctx);
  /* 원본이 작은 서류 판정(2026-08-13)도 needsCheck 가 기댄다 — 진짜 함수를 넣는다 */
  const minEdge = app.match(/^const MIN_READ_EDGE = \{[\s\S]*?\n\};/m);
  assert.ok(minEdge, 'MIN_READ_EDGE 를 찾지 못했습니다');
  vm.runInContext(minEdge[0].replace('const ', 'var ') + '\n' + pick('tooSmall') + '\n' +
    pick('coFilledOk') + '\n' + pick('needsCheck') + '\n' + pick('checkWhy'), ctx);
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

test('★ 채운 칸이 없으면 「확인 필요」로 남는다 — 조용히 넘기지 않는다', () => {
  const ctx = loadNeedsCheck();
  assert.equal(ctx.needsCheck(fromDb), true,
    '업체관리에 실제로 넣은 것이 없는데 다 된 일로 치면 아무도 못 챙깁니다.');
  assert.match(ctx.checkWhy(fromDb), /업체 확인/, '왜 걸렸는지 안 알려 줍니다.');
});

test('실제로 채웠으면 할 일이 아니다', () => {
  const ctx = loadNeedsCheck();
  const done = { meta: { read: { kind: 'bizreg', auto: true, filed: { id: 'c1' },
    filedCo: { at: 1, found: true, filled: ['대표자', '주소'], message: '2칸 채움' } } } };
  assert.equal(ctx.needsCheck(done), false);
});

test('업체를 못 찾았으면 filled 가 있어도 할 일이다', () => {
  const ctx = loadNeedsCheck();
  const notFound = { meta: { read: { kind: 'bizreg', auto: true, filed: { id: 'c1' },
    filedCo: { at: 1, found: false, filled: ['대표자'], message: '업체 없음' } } } };
  assert.equal(ctx.needsCheck(notFound), true);
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
  const uses = (app.match(/coFilledOk\(/g) || []).length;
  assert.ok(uses >= 5, 'coFilledOk 를 쓰는 곳이 ' + uses + '곳뿐입니다 — 넷 다 옮겨야 합니다.');
  const fn = app.match(/function coFilledOk\([\s\S]*?\n\}/)[0];
  assert.match(fn, /\(c\.filled \|\| \[\]\)\.length/, '없을 수 있다는 것을 안 다룹니다.');
});

test('왜 없을 수 있는지 코드에 적어 둔다 — 다음 사람이 또 벗겨 낸다', () => {
  const fn = app.match(/\/\*[^*]*업체관리에 \*\*실제로 채워[\s\S]*?function coFilledOk/);
  assert.ok(fn, 'coFilledOk 위 설명을 찾지 못했습니다.');
  assert.match(fn[0], /빈 배열/, '실시간DB 가 빈 배열을 안 적는다는 사실이 빠졌습니다.');
});
