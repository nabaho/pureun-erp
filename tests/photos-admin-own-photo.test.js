/* 총괄 관리자는 「전체 근로자」 화면에서도 **자기 사진**은 지우고 고칠 수 있다
   — 대표 지시 2026-08-10 "권형하는 전체총괄 관리자이다. 선택권이 있다"

   전에는 「전체 근로자」로 보고 있으면 viewingOther() 가 늘 참이라
   자기가 찍은 사진조차 「다른 사람의 사진은 보기만 할 수 있습니다」로 막혔다.
   이제는 화면이 아니라 **고른 사진의 주인**을 보고 판단한다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const app = fs.readFileSync(path.join(__dirname, '..', 'pu-photos.html'), 'utf8');
const mine = app.match(/function isMinePhoto\([\s\S]*?\n\}/);
const blocked = app.match(/function blockedIfOther\([\s\S]*?\n\}/);

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
  const gate = blocked[0].indexOf('if (!viewingOther())');
  assert.ok(pass > 0 && gate > pass,
    '내 사진인지 먼저 봐야 합니다 — 화면 판단이 앞서면 예전처럼 다 막힙니다.');
});

test('빈 목록으로는 통과하지 못한다', () => {
  /* blockedIfOther() 를 인자 없이 부르는 곳(대량 작업)이 아직 있다.
     빈 배열이 every 로 참이 되어 술술 통과하면 잠금이 통째로 풀린다. */
  assert.ok(/list && list\.length && list\.every/.test(blocked[0]),
    '빈 목록이 통과하면 남의 사진 잠금이 통째로 풀립니다.');
});

/* 2026-08-10 다시 겨눔 — 총괄 관리자에게 남의 사진을 열었다(대표 지시
   "전체관리자 권형하는 사진을 삭제할 권한이 있다"). 「전체 근로자에서는 막는다」는
   안내가 더는 사실이 아니다. 지킬 것은 **직원끼리는 서로의 사진을 못 건드린다**. */
test('★ 총괄 관리자는 남의 사진도 손댈 수 있다', () => {
  assert.ok(/amAdmin\(\)/.test(blocked[0]),
    '관리자 판정이 없으면 총괄 관리자도 남의 사진을 못 지웁니다.');
  const admin = blocked[0].indexOf('amAdmin()');
  const other = blocked[0].indexOf('if (!viewingOther())');
  assert.ok(admin > 0 && other > admin,
    '화면 판단이 앞서면 관리자도 예전처럼 막힙니다.');
});

test('★ 직원끼리는 여전히 못 건드린다', () => {
  assert.ok(/if \(!viewingOther\(\)\) return false;/.test(blocked[0]),
    '남의 사진을 보는 중인지 안 가리면 잠금이 통째로 풀립니다.');
  assert.ok(/보기만 할 수 있습니다/.test(blocked[0]), '왜 막혔는지 안 알려 줍니다.');
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
    assert.ok(fn[0].indexOf('blockedIfOther(' + pair[1] + ')') > -1,
      pair[0] + ' 이 고른 사진을 안 넘겨 내 사진도 막습니다');
  });
});
