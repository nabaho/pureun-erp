/* 총괄 관리자는 「전체 근로자」 화면에서도 **자기 사진**은 지우고 고칠 수 있다
   — 대표 지시 2026-08-10 "권형하는 전체총괄 관리자이다. 선택권이 있다"

   전에는 「전체 근로자」로 보고 있으면 viewingOther() 가 늘 참이라
   자기가 찍은 사진조차 「다른 사람의 사진은 보기만 할 수 있습니다」로 막혔다.
   이제는 화면이 아니라 **고른 사진의 주인**을 보고 판단한다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const app = fs.readFileSync(path.join(__dirname, '..', 'pu-photos.html'), 'utf8');
const mine = app.match(/function isMinePhoto\([\s\S]*?\n\}/);
/* ⚠ 2026-08-28 다시 겨눔 — 판정을 mayTouch 한 곳으로 모았다. **화면(도구줄)이 막는 쪽과
   같은 기준을 써야 하는데** blockedIfOther 는 말하는 일(alert)까지 해서 그리는 중에
   부를 수 없었다. 그래서 「눌러도 되는데 단추가 없는」 자리가 생겼다(대표 보고
   2026-08-28: "여기서 어떻게 공유자 선택하나" — 전체 근로자로 보시는 중이었고
   고르신 25장은 본인 사진이었다).
   지킬 것은 그대로다 — 판정의 **차례**가 이 기능의 전부라 그 차례를 계속 못박는다. */
const blocked = app.match(/function mayTouch\([\s\S]*?\n\}/);
const alerts = app.match(/function blockedIfOther\([\s\S]*?\n\}/);

test('★ 사진마다 주인을 따로 본다 — 화면이 아니라', () => {
  assert.ok(mine, 'isMinePhoto 를 찾지 못했습니다.');
  assert.ok(/gridItems\.find/.test(mine[0]),
    '「전체 근로자」 화면에는 사진마다 주인이 다릅니다 — 목록에서 찾아야 합니다.');
  assert.ok(/__ownerUid/.test(mine[0]),
    '사진에 적힌 주인(__ownerUid)을 안 봅니다.');
  assert.ok(/myUid\(\)/.test(mine[0]), '내 것인지 견줄 기준이 없습니다.');
});

test('★ 고른 것이 전부 내 사진이면 막지 않는다', () => {
  assert.ok(blocked, 'blockedIfOther 를 찾지 못했습니다.');
  assert.ok(/every\(isMinePhoto\)/.test(blocked[0]),
    '한 장이라도 남의 것이면 막아야 하고, 전부 내 것이면 통과시켜야 합니다.');
  const pass = blocked[0].indexOf('every(isMinePhoto)');
  const gate = blocked[0].indexOf('return !viewingOther()');
  assert.ok(pass > 0 && gate > pass,
    '내 사진인지 먼저 봐야 합니다 — 화면 판단이 앞서면 예전처럼 다 막힙니다.');
});

/* ⚠ 2026-08-29 다시 겨눔 — 여기는 「list.length && list.every」라는 **글자**를 못박고
   있었다. 그런데 그 글자가 있어도 마지막 줄(`return !viewingOther()`)이 「내 사진
   화면이면 다 된다」라서, 빈 목록은 어차피 통과했다 — 검사가 지킨다고 믿은 것을
   실제로는 안 지키고 있었다. **돌려서** 본다.

   그리고 이제 「내 사진」 화면에 **공유받은 사진이 섞인다**(대표 지시 2026-08-29).
   화면으로 판단하면 남의 사진에 대고 지우기·판독을 누를 수 있게 된다. */
function touchCtx(over) {
  const ctx = Object.assign({
    Array, console: { warn() {} },
    _mine: [], _admin: false, _other: false
  }, over || {});
  ctx.PuPhotoStore = { amAdmin: function () { return ctx._admin; } };
  ctx.isMinePhoto = function (id) { return ctx._mine.indexOf(id) >= 0; };
  ctx.viewingOther = function () { return ctx._other; };
  vm.createContext(ctx);
  vm.runInContext(blocked[0], ctx);
  return ctx;
}

test('★★ 고른 것이 «사진 기준»으로 갈린다 — 내 사진에 남의 것이 섞여도', () => {
  const c = touchCtx({ _mine: ['a', 'b'] });      // 직원, 내 사진 화면(_other=false)
  assert.equal(c.mayTouch(['a', 'b']), true, '전부 내 것이면 됩니다');
  assert.equal(c.mayTouch(['a', 'x']), false,
    '★ 한 장이라도 남의 것(공유받은 것)이 섞이면 막아야 합니다 — 서버가 어차피 막습니다');
  assert.equal(c.mayTouch('x'), false, '★ 공유받은 사진 한 장도 못 건드립니다');
});

test('★ 총괄관리자는 섞여 있어도 손댈 수 있다', () => {
  const c = touchCtx({ _mine: ['a'], _admin: true });
  assert.equal(c.mayTouch(['a', 'x']), true);
});

test('빈 목록으로는 남의 사진 화면에서 통과하지 못한다', () => {
  /* blockedIfOther() 를 인자 없이 부르는 곳(대량 작업)이 아직 있다. */
  assert.equal(touchCtx({ _other: true }).mayTouch([]), false);
  assert.equal(touchCtx({ _other: true }).mayTouch(null), false);
});

/* 2026-08-10 다시 겨눔 — 총괄 관리자에게 남의 사진을 열었다(대표 지시
   "전체관리자 권형하는 사진을 삭제할 권한이 있다"). 「전체 근로자에서는 막는다」는
   안내가 더는 사실이 아니다. 지킬 것은 **직원끼리는 서로의 사진을 못 건드린다**. */
test('★ 총괄 관리자는 남의 사진도 손댈 수 있다', () => {
  assert.ok(/amAdmin\(\)/.test(blocked[0]),
    '관리자 판정이 없으면 총괄 관리자도 남의 사진을 못 지웁니다.');
  const admin = blocked[0].indexOf('amAdmin()');
  const other = blocked[0].indexOf('return !viewingOther()');
  assert.ok(admin > 0 && other > admin,
    '화면 판단이 앞서면 관리자도 예전처럼 막힙니다.');
});

test('★ 직원끼리는 여전히 못 건드린다', () => {
  assert.ok(/return !viewingOther\(\);/.test(blocked[0]),
    '남의 사진을 보는 중인지 안 가리면 잠금이 통째로 풀립니다.');
  /* 막는 쪽은 그 판정을 **그대로** 쓰고, «왜 막혔는지»만 말한다 —
     제 기준을 따로 두면 화면과 다시 갈린다(2026-08-28에 실제로 갈렸다). */
  assert.ok(/if \(mayTouch\(ids\)\) return false;/.test(alerts[0]),
    '★ 막는 쪽이 제 기준을 따로 씁니다 — 화면과 다시 갈립니다.');
  assert.ok(/보기만 할 수 있습니다/.test(alerts[0]), '왜 막혔는지 안 알려 줍니다.');
});

test('★ 고른 사진을 실제로 넘긴다 — 안 넘기면 예전 그대로다', () => {
  /* ⚠ readAgain·readSelected 는 2026-08-10 부터 이 목록에 없다 — 판독은 남의
     사진에서도 된다(대표 지시: "다른 직원이 사진찍은 데이터는 입력이 되어야 한다").
     지우기·고치기만 남는다. */
  const calls = [
    ['deleteOnePayslip', 'id'],
    ['deleteOne', 'viewerId'],
    ['removeCustomKindOne', 'viewerId'],
    ['ackRead', 'viewerId'],
    ['deleteSelected', 'Array.from(selected)'],
    ['openAssignKind', 'Array.from(selected)'],
  ];
  calls.forEach(function (pair) {
    const fn = app.match(new RegExp('function ' + pair[0] + '\\([\\s\\S]*?\\n\\}'));
    assert.ok(fn, pair[0] + ' 본문을 찾을 수 없습니다');
    /* 지키려는 규칙: 화면 주인이 아니라 «지울 사진들»을 넘겨 묻는다.
       ⚠ 넘기는 «글자»를 그대로 못박지 않는다 — 2026-09-06 에 deleteSelected 가
         끌어 놓은 것도 받게 되면서 그 값을 변수에 담아 넘기게 됐고, 이 검사가
         멀쩡한 코드에 걸렸다. 변수에 담아 넘기는 것도 같은 규칙을 지킨다. */
    const 곧바로 = fn[0].indexOf('blockedIfOther(' + pair[1] + ')') > -1;
    const 담아서 = new RegExp(
      '(?:const|var|let)\\s+(\\w+)\\s*=[\\s\\S]{0,160}?'
      + pair[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      + '[\\s\\S]{0,120}?blockedIfOther\\(\\1\\)').test(fn[0]);
    assert.ok(곧바로 || 담아서,
      pair[0] + ' 이 고른 사진을 안 넘겨 내 사진도 막습니다');
  });
});
