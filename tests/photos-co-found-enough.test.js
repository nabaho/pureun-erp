'use strict';
/* 「업체를 찾았고 채울 칸이 없었다」는 할 일이 아니다 — 대표 결정 2026-08-23

   coFilledOk 는 종전에 `found && filled.length` 였다. 그런데 filled 가 빈 상태의
   뜻은 «업체를 찾았고, 그 업체에 이미 다 들어 있었다»다 — 사람이 할 일이 하나도
   없는데 「업체관리에 못 넣음」으로 목록에 쌓였다. 실데이터에서 9장이 이 꼴이었다.

   ⚠ found=false 는 다르다 — 업체가 아예 없어서 «사람이 만들어야» 끝난다.
     두 상태를 한 덩이로 보면, 고치려다 진짜 할 일을 삼킨다.
   ⚠ filled 가 «없는» 것과 «빈» 것을 함께 다뤄야 한다. 실시간DB 는 빈 배열을
     「값 없음」으로 보고 아예 안 적어서, 다시 읽으면 칸 자체가 사라진다
     (2026-08-11 사고: 그 줄에서 사진 목록이 통째로 멎었다).

   실행: node --test tests/*.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const app = fs.readFileSync(path.join(__dirname, '..', 'pu-photos.html'), 'utf8');

function fnOf(name) {
  const i = app.indexOf('function ' + name + '(');
  assert.ok(i >= 0, name + ' 를 찾지 못했습니다');
  let d = 0;
  for (let k = app.indexOf('{', i); k < app.length; k++) {
    if (app[k] === '{') d++;
    else if (app[k] === '}') { d--; if (!d) return app.slice(i, k + 1); }
  }
  throw new Error(name + ' 의 끝을 찾지 못했습니다');
}
function lineOf(name) {
  const m = app.match(new RegExp('^const ' + name + ' = [^\\n]*;$', 'm'));
  assert.ok(m, name + ' 를 찾지 못했습니다');
  return m[0];
}
function objOf(name) {
  const m = app.match(new RegExp('^const ' + name + ' = \\{[\\s\\S]*?\\n?\\};?', 'm'))
    || app.match(new RegExp('^const ' + name + ' = \\{[^}]*\\};', 'm'));
  assert.ok(m, name + ' 를 찾지 못했습니다');
  return m[0];
}

const ctx = (function () {
  const src = [objOf('MIN_READ_EDGE'), objOf('KEEP_ONLY'), objOf('CARD_KINDS'), objOf('CO_KINDS'),
    /* ⚠ 2026-09-01 근로자 서류 넷 — 안 실으면 checkWhy 가 ReferenceError 로 멎는다 */
    objOf('WORKER_KINDS'),
    lineOf('TEL_SHAPE'), lineOf('MAIL_SHAPE')].join('\n') + '\n' +
    ['tooSmall', 'smallCheckedOk', 'readAnyField', 'coFilledOk', 'coTodo',
     'canSendWorker', 'workerWhyNot',
     /* ⚠ 2026-09-02 💰 임금 확인 */
     'wageRead', 'wageOkOf', 'wageBoxOn', 'wageNeedsOk', 
     'needsCheck', 'checkWhy']
      .map(fnOf).join('\n');
  const c = { Math, Number, String, Object, Boolean, Date };
  vm.createContext(c);
  vm.runInContext(src, c);
  return c;
})();

/* 크기·기업정보함 쪽은 다 통과시켜 두고 «업체관리 한 가지»만 본다 */
function biz(filedCo) {
  return { meta: { w: 2000, h: 2800, read: { kind: 'bizreg', auto: true, bizNoOk: true,
    fields: { company: '(주)가나', bizno: '123-45-67890' },
    filed: { id: 'C1' }, filedCo: filedCo } } };
}

test('★ 업체를 찾았고 채울 칸이 없었으면 할 일이 아니다 — 실데이터 9장이 이 꼴', () => {
  const x = biz({ at: 1, found: true, message: '이미 다 들어 있었습니다' });
  assert.equal(ctx.coFilledOk(x.meta.read.filedCo ? x.meta.read : null), true);
  assert.equal(ctx.needsCheck(x), false,
    '★ 사람이 할 일이 하나도 없는데 목록에 쌓입니다');
  assert.equal(ctx.checkWhy(x), '');
});

test('빈 배열로 적혀 있어도 같다 — 실시간DB 가 지우기 전 상태', () => {
  const x = biz({ at: 1, found: true, filled: [] });
  assert.equal(ctx.needsCheck(x), false);
});

test('칸을 채운 것은 물론 할 일이 아니다', () => {
  const x = biz({ at: 1, found: true, filled: ['대표자', '주소'] });
  assert.equal(ctx.needsCheck(x), false);
});

/* ⚠ 2026-08-23 «두 번째» 결정으로 다시 뒤집힌 검사다. 처음에는 「업체가 아예
   없으면 사람이 만들어야 하니 할 일」이라 두었다. 그런데 대표 지시가 나왔다:
   **업체는 계약이 만든다** — 사진첩에서 업체를 만들면 갈래(자문·급여·기금·노조)를
   짐작해야 하고, 상담으로 받아 둔 서류까지 업체가 되어 업체관리가 서류함이 된다.
   그러니 「업체가 아직 없다」는 사진첩에서 할 수 있는 일이 없는 **기다림**이고,
   계약관리에서 업체가 생기면 coSweep 이 저절로 채운다.
   실데이터 152장이 이 꼴로 목록을 채우고 있었다.
   자세한 것은 tests/photos-co-follows-contract.test.js. */
test('★ 업체가 «아예 없는» 것은 기다림이지 할 일이 아니다 (2026-08-23 다시 뒤집음)', () => {
  const x = biz({ at: 1, found: false, message: '업체관리에 없습니다' });
  assert.equal(ctx.coFilledOk(x.meta.read), false, '넣지 못한 것은 맞다');
  assert.equal(ctx.needsCheck(x), false,
    '★ 사진첩에서 할 수 있는 일이 없는데 152장이 목록을 채웁니다');
  assert.equal(ctx.checkWhy(x), '', '목록에서 뺐는데 이유가 남으면 떠다니는 이유가 됩니다');
});

test('found 가 false 인데 filled 가 있는 어긋난 옛 기록도 같다 — 이미 보낸 것이다', () => {
  const x = biz({ at: 1, found: false, filled: ['대표자'] });
  assert.equal(ctx.needsCheck(x), false);
});

test('업체관리로 보낸 적이 없으면 할 일이다 — 아직 아무것도 안 했다', () => {
  assert.equal(ctx.needsCheck(biz(null)), true);
  assert.equal(ctx.needsCheck(biz(undefined)), true);
});

test('★ filled 를 안 보므로 그 칸이 없어도 안 멎는다 — 2026-08-11 사고 재발 방지', () => {
  const fn = fnOf('coFilledOk');
  assert.ok(!/\.filled\.length/.test(fn),
    '★ filled.length 를 맨몸으로 읽으면 그 줄에서 화면이 통째로 멎습니다');
  /* 그리고 실제로 던지지 않는지 돌려서 확인한다 */
  assert.doesNotThrow(function () { ctx.coFilledOk({ filedCo: { found: true } }); });
  assert.doesNotThrow(function () { ctx.coFilledOk(null); });
  assert.doesNotThrow(function () { ctx.coFilledOk({}); });
});
