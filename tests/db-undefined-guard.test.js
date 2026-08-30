/* 저장 길목에서 undefined 를 걷어낸다 (2026-08-30, 오류 기록에서 잡음)
 *
 * 실제로 있었던 일 —
 *   set failed: value argument contains undefined in property
 *   'data.finance_income.v.0.managerSidAtRecord'
 * 담당자(managerMain)가 안 정해진 사건의 입금을 확정하려다,
 * 그 한 칸 때문에 «입금 기록 전체»가 안 들어갔다.
 * ★ 더 나쁜 것은 화면이 그것을 모른다는 점이다 — 확정한 줄 알고 넘어간다.
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
const DBSET = cutBlock(ERP, 'function dbSet(k, v){');
const B = bare(DBSET);

test('★★ 저장하기 «전»에 undefined 를 걷어낸다', () => {
  assert.ok(/v = JSON\.parse\(newJson\)/.test(B),
    '★★ undefined 가 하나만 있어도 Firebase 가 저장을 통째로 거절한다 — 돈 기록이 통으로 사라진다');
});

test('★★ 걷어내는 것이 «저장·캐시보다 먼저»다', () => {
  const clean = B.indexOf('v = JSON.parse(newJson)');
  assert.ok(clean > 0, '걷어내는 곳을 못 찾았다');
  ['localStorage.setItem(KEY+k, newJson)', '_dbCache[k] = v'].forEach(function (mark) {
    const at = B.indexOf(mark);
    if (at < 0) return;
    assert.ok(clean < at,
      '★ 걷어내기가 「' + mark + '」 «뒤»에 있다 — 화면과 서버가 다른 것을 들게 된다');
  });
});

test('★ 못 읽어도 «조용히 넘어가지» 않는다', () => {
  /* ⚠ 「가까운 데 catch 가 있다」로 겨누면 안 된다 — 바로 아래 다른 try 의 catch 가
     걸려서, 이 자리를 비워도 통과한다(실제로 그랬다).
     이 try 에 «붙어 있는» catch 인지를 본다. */
  assert.ok(/JSON\.parse\(newJson\);\s*\}\s*catch\s*\([a-z]+\)\s*\{[^}]*_erpErrLog/.test(B),
    '★ 실패를 안 적으면 왜 옛 값이 저장됐는지 아무도 모른다');
});

/* ── 실제로 돌려 본다 ── */
test('★★ undefined 가 든 값을 넣으면 «그 칸이 빠진 채» 저장된다', () => {
  /* dbSet 통째를 돌리기는 어렵다(로컬저장소·파이어베이스가 필요).
     핵심은 «newJson 을 도로 읽는다»는 한 수다 — 그 수가 실제로 undefined 를
     걷어내는지 여기서 확인한다. */
  const v = [{ id: 'x1', name: '가나', managerSidAtRecord: undefined, amount: 1000 }];
  const cleaned = JSON.parse(JSON.stringify(v));
  assert.ok(!('managerSidAtRecord' in cleaned[0]),
    'JSON 왕복이 undefined 를 안 걷어낸다면 이 고침은 헛것이다');
  assert.strictEqual(cleaned[0].amount, 1000, '멀쩡한 칸까지 없애면 안 된다');
  assert.strictEqual(cleaned[0].name, '가나');
});

test('★ 배열 안의 undefined 는 «null 로» 남는다 (자리를 잃지 않는다)', () => {
  const cleaned = JSON.parse(JSON.stringify([1, undefined, 3]));
  assert.deepStrictEqual(cleaned, [1, null, 3],
    '★ 자리가 밀리면 몇 번째 줄인지로 이어 둔 것이 어긋난다');
});

/* ── 모든 저장이 이 길로 오는가 ── */
test('★★ 한 건·여러 건 저장도 «이 길»로 온다 (칸마다 막지 않아도 된다)', () => {
  ['function dbUpsert(k, item){', 'function dbUpsertMany(k, items){'].forEach(function (h) {
    const fn = bare(cutBlock(ERP, h));
    assert.ok(/return dbSet\(k,/.test(fn),
      '★ ' + h + ' 이 dbSet 을 안 거친다 — 그 길로 들어온 undefined 는 못 막는다');
  });
});
