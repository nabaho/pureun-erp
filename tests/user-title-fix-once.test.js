/* 옛 자료 교정은 «한 번만» 돈다 (2026-08-30)
 *
 * 대표 검토 중 잡은 것: 인사관리에서 최기운·신욱임 직책을 고쳐도
 * 새로고침하면 «원위치»했다. 한 번만 돌아야 할 옛 자료 교정이
 * 판 검사 밖에 있어 매번 다시 걸렸기 때문이다.
 *
 * ★ 게다가 저장은 «사람 수가 줄었을 때»만 했다 — 고쳐 놓고 저장을 안 하니
 *   다음 새로고침에 또 고치는 일이 되풀이됐다.
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
const at = ERP.indexOf('(function fixUserAccounts(){');
assert.ok(at > 0, 'fixUserAccounts 를 못 찾았다');
const FIX = ERP.slice(at, ERP.indexOf('\n})();', at));
const B = bare(FIX);

test('★★ 교정은 «돌았다는 표»가 없을 때만 한다', () => {
  assert.ok(/if\(!titleFixDone\)\{/.test(B),
    '★★ 표 없이 매번 돌면, 사람이 고친 직책을 새로고침할 때마다 되돌린다');
  assert.ok(/localStorage\.getItem\(TITLE_FIX_KEY\)/.test(B), '★ 표를 읽지 않는다');
});

test('★★ 한 번 돌면 «표를 남긴다»', () => {
  assert.ok(/localStorage\.setItem\(TITLE_FIX_KEY, '1'\)/.test(B),
    '★ 표를 안 남기면 다음에 또 돈다 — 고친 것이 계속 되돌아간다');
});

test('★★ «바뀌었으면» 저장한다 (사람 수만 보지 않는다)', () => {
  assert.ok(/JSON\.stringify\(deduped\) !== JSON\.stringify\(data\)/.test(B),
    '★★ 사람 수가 그대로면 저장을 안 한다 — 고쳐 놓고 안 저장하니 매번 다시 고치게 된다');
});

/* ── 실제로 돌려 본다 ── */
function runFix(saved, done) {
  const store = { 'pureun_v6_user_accounts': JSON.stringify(saved) };
  if (done) store['pureun_v6_title_fix_done'] = '1';
  const ctx = {
    console,
    localStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = v; },
    },
    window: {},
    USERS_SEED: [],
    fbSeedAllowed: () => false,
  };
  vm.createContext(ctx);
  /* 함수 몸통만 떼어 돌린다 — 열쇠 이름은 소스에서 읽어 온다. */
  const keyLine = /var key\s*=\s*'([^']+)'/.exec(FIX);
  assert.ok(keyLine, '저장 열쇠 이름을 못 찾았다');
  store[keyLine[1]] = JSON.stringify(saved);
  vm.runInContext(FIX + '\n})();', ctx);
  return JSON.parse(store[keyLine[1]] || '[]');
}

test('★★ 처음에는 옛 직책을 «고친다»', () => {
  const out = runFix([{ sid: 'A-001', name: '최기운', title: '실장' }], false);
  assert.strictEqual(out[0].title, '사무장',
    '★ 한 번은 고쳐야 한다 — 아직 안 고쳐진 기기가 있다');
});

test('★★ 이미 돌았으면 «사람이 고친 직책»을 그대로 둔다', () => {
  const out = runFix([{ sid: 'A-001', name: '최기운', title: '부장' }], true);
  assert.strictEqual(out[0].title, '부장',
    '★★ 인사관리에서 고친 직책이 새로고침하면 원위치한다 — 대표가 겪은 그 일이다');
});

test('★ 다른 사람은 «건드리지 않는다»', () => {
  const out = runFix([{ sid: 'P-002', name: '박성수', title: '노무사' }], false);
  assert.strictEqual(out[0].title, '노무사');
});
