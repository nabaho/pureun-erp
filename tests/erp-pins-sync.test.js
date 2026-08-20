const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const erp = fs.readFileSync(path.join(__dirname, '..', 'pu-erp.html'), 'utf8');

test('★ 즐겨찾기는 서버에 담긴다 — 기기마다 따로 놀지 않는다', () => {
  /* 예전에는 localStorage 에만 두어 PC 에서 걸어 둔 것이 폰에는 영영 안 보였다
     (대표 지적 2026-08-20 "피시에서 즐겨찾기한거 왜 같이 동기화 안 되나"). */
  assert.match(erp, /dbSet\('ui_pins', all\)/, '★ 서버에 안 담으면 기기 사이에서 안 따라옵니다.');
  assert.match(erp, /dbGet\('ui_pins', \{\}\)/);
  /* 서버로 나르는 열쇠 목록에 들어 있어야 실제로 오간다 */
  const list = erp.slice(erp.indexOf('var FB_ALL_SYNC_KEYS = ['),
                         erp.indexOf('];', erp.indexOf('var FB_ALL_SYNC_KEYS = [')));
  assert.match(list, /'ui_pins'/, '★ 동기화 목록에 없으면 써 놓아도 안 옵니다.');
});

test('★ 사람마다 제 자리에 담고, 남의 것을 덮지 않는다', () => {
  const fn = erp.slice(erp.indexOf('function savePins(next)'), erp.indexOf('function togglePin('));
  assert.match(fn, /Object\.assign\(\{\}, dbGet\('ui_pins', \{\}\) \|\| \{\}\)/,
    '★ 통째로 새로 쓰면 다른 직원의 즐겨찾기가 사라집니다.');
  assert.match(fn, /all\[CURRENT_USER\.sid\] = next;/);
});

test('저장은 한 곳에서 — 껐다 켜기도 순서 바꾸기도 같은 길을 쓴다', () => {
  /* 예전에는 순서 바꾸기가 localStorage 에만 적고 있었다 — 두 곳이 따로 적으면
     언젠가 한쪽만 고친다. */
  assert.equal((erp.match(/dbSet\('ui_pins'/g) || []).length, 1,
    '★ ui_pins 를 두 곳에서 쓰면 언젠가 한쪽만 고쳐집니다.');
  assert.equal((erp.match(/setPinned\(next\); savePins\(next\);/g) || []).length, 2,
    '껐다 켜기·순서 바꾸기 둘 다 savePins 를 거쳐야 합니다.');
});

test('다른 기기에서 바꾸면 새로고침 없이 따라온다', () => {
  const at = erp.indexOf('function readPins()');
  const blk = erp.slice(at, at + 1600);
  assert.match(blk, /window\.addEventListener\('fb_data_changed', onChange\)/,
    '★ 안 들으면 PC 에서 바꿔도 폰은 새로고침해야 보입니다.');
  assert.match(blk, /window\.addEventListener\('fb_initial_done', onChange\)/);
  /* 같은 값이면 다시 그리지 않는다 — 안 그러면 동기화 알림마다 화면이 깜빡인다 */
  assert.match(blk, /JSON\.stringify\(cur\) === JSON\.stringify\(next\)/);
});

test('서버가 아직 없으면 이 기기에 있던 것을 쓴다 (옮겨 담기)', () => {
  /* 이미 즐겨찾기를 걸어 둔 사람이 갑자기 빈 화면을 보면 안 된다.
     첫 저장 때 서버로 올라간다. */
  const fn = erp.slice(erp.indexOf('function readPins()'), erp.indexOf('var pp = useState(readPins())'));
  const srv = fn.indexOf("dbGet('ui_pins'");
  const loc = fn.indexOf('localStorage.getItem(pinKey)');
  assert.ok(srv > 0 && loc > srv, '★ 서버를 먼저 보고, 없을 때만 이 기기 값을 씁니다.');
});
