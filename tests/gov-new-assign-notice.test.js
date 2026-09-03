/* 「부담당에게도 사업이 진행됨을 알려라」 (대표 지시 2026-09-02)
 *
 * ★ 무엇이 비어 있었나
 *   「푸른ERP 새 컨설팅」 창은 «아직 안 들어온 것»만 알린다.
 *   주담당이 먼저 가져와 버리면 그 목록이 비므로 — 부담당은 «영영 못 듣는다».
 *   그래서 「이미 들어온 것 가운데 내가 새로 맡은 것」을 따로 본다.
 *
 * 못 박는 것은 «지금 값»이 아니라 규칙이다 (CLAUDE.md).
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const test = require('node:test');
const assert = require('node:assert');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'gov-consulting.html'), 'utf8');
/* 주석을 먼저 걷는다 — 잘 쓴 주석이 검사를 통과시킨다 */
const bare = (s) => s
  .replace(/<!--[\s\S]*?-->/g, ' ')
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/^\s*\/\/.*$/gm, ' ');
const CODE = bare(SRC);
const HTML = SRC.replace(/<!--[\s\S]*?-->/g, ' ');

function grab(n) {
  const i = SRC.search(new RegExp('(?:async\\s+)?function ' + n + '\\('));
  assert.ok(i >= 0, n + ' 을(를) 못 찾았다');
  let d = 0, st = false;
  for (let j = i; j < SRC.length; j++) {
    const c = SRC[j];
    if (c === '{') { d++; st = true; }
    else if (c === '}') { d--; if (st && !d) return SRC.slice(i, j + 1); }
  }
}

/* 셈을 실제로 돌린다 — 가짜 localStorage·자료를 끼운다 */
function world(me, cos, opt) {
  opt = opt || {};
  const store = Object.assign({}, opt.store);
  const shown = [];
  const ctx = {
    localStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
    },
    lsSet: (k, v) => { store[k] = String(v); },
    myId: () => me,
    getCos: () => cos,
    getStaff: () => opt.staff || [{ id: 'a1', name: '권형하' }, { id: 'a2', name: '김동현' }],
    getTypes: () => opt.types || [{ id: 't1', name: '기술보호', color: '#2563eb' }],
    q: () => ({ classList: { add: () => { shown.push(1); } } }),
    renderNotifBadge: () => {},
    closeModal: () => {},
    renderNewAssign: () => {},
    escAttr: (v) => String(v == null ? '' : v),
    console: { warn: () => {} },
    JSON, String, Array, Object,
  };
  ctx.__store = store; ctx.__shown = shown;
  vm.createContext(ctx);
  vm.runInContext([grab('getCoAtts'), grab('coAttStaffList'), grab('naSeenKey'),
    grab('naMineKeys'), grab('naSeen'), grab('naMarkSeen'),
    grab('checkNewAssignments'), grab('naClose')].join('\n'), ctx);
  return ctx;
}
/* 사업장 하나 — 주담당 main, 부담당 subs, 사업 types */
const CO = (id, name, main, subs, types, ended) =>
  ({ id, name, defAtt: main, defCoAtts: subs || [], types: types || [], endedTypes: ended || {}, active: true });

const HB = () => CO('c1', '주식회사 에이치비씨솔루션', 'a1', ['a2'], ['t1']);

/* ══ 뜨는가 ══════════════════════════════════════════════════════ */

test('★★★ 주담당이 가져온 사업을 «부담당»도 알게 된다 — 이것이 이번에 메운 자리', () => {
  /* a2(김동현)는 부담당이다. 주담당 a1 이 가져왔으니 ERP 대기 목록은 이미 비었고,
     예전에는 a2 에게 아무 말도 안 갔다. */
  const w = world('a2', [HB()], { store: { p_naSeen_a2: '[]' } });
  w.checkNewAssignments();
  assert.strictEqual(w.__shown.length, 1, '부담당에게 안 뜬다 — 사업이 도는 줄 모른다');
  assert.strictEqual(w._naRows.length, 1);
  assert.strictEqual(w._naRows[0].iAmMain, false, '부담당인데 주담당이라고 한다');
});

test('★★ 주담당에게도 뜬다 — 대표가 넣어 주면 주담당도 모르기는 같다', () => {
  const w = world('a1', [HB()], { store: { p_naSeen_a1: '[]' } });
  w.checkNewAssignments();
  assert.strictEqual(w.__shown.length, 1, '주담당에게는 안 뜬다');
  assert.strictEqual(w._naRows[0].iAmMain, true);
});

test('★★ 남의 사업은 안 뜬다', () => {
  const w = world('a9', [HB()], { store: { p_naSeen_a9: '[]' } });
  w.checkNewAssignments();
  assert.strictEqual(w.__shown.length, 0, '담당도 아닌데 창이 뜬다');
});

test('★★★ 처음 쓰는 사람에게는 «안» 띄운다 — 안 그러면 스물한 건이 한꺼번에 뜬다', () => {
  /* 담아 둔 것이 아예 없는 사람은 씨앗만 심고 넘어가야 한다. */
  const w = world('a2', [HB(), CO('c2', '태양농산', 'a2', [], ['t1'])], {});
  w.checkNewAssignments();
  assert.strictEqual(w.__shown.length, 0, '첫 로그인에 지난 것이 전부 쏟아진다');
  assert.ok(w.__store.p_naSeen_a2, '씨앗을 안 심었다 — 다음에 또 전부 새것이 된다');
  assert.strictEqual(JSON.parse(w.__store.p_naSeen_a2).length, 2, '씨앗이 지금 것과 다르다');
});

test('★★ 같은 것은 두 번 안 뜬다 — 뜰 때마다 닫기만 하게 된다', () => {
  const w = world('a2', [HB()], { store: { p_naSeen_a2: '[]' } });
  w.checkNewAssignments();
  w.naClose();
  w.__shown.length = 0;
  w.checkNewAssignments();
  assert.strictEqual(w.__shown.length, 0, '확인을 눌렀는데 또 뜬다');
});

test('★★★ 「확인」이 본 것으로 담아 둔다 — 안 담으면 새로고침마다 또 뜬다', () => {
  const w = world('a2', [HB()], { store: { p_naSeen_a2: '[]' } });
  w.checkNewAssignments();
  w.naClose();
  assert.deepStrictEqual(JSON.parse(w.__store.p_naSeen_a2), ['c1:t1'], '확인해도 안 담긴다');
  assert.strictEqual(w._naRows.length, 0, '닫았는데 알림 줄에 그대로 남는다');
});

/* ══ 무엇을 「새것」으로 보는가 ═══════════════════════════════════ */

test('★★★ 사업장이 같아도 «사업이 늘면» 새것이다 — 그래서 짝으로 담는다', () => {
  /* 에이치비씨솔루션에 기술보호(t1) 말고 t2 가 붙었다.
     사업장 이름만 담으면 이걸 통째로 놓친다. */
  const co = HB(); co.types = ['t1', 't2'];
  const w = world('a2', [co], { store: { p_naSeen_a2: '["c1:t1"]' } });
  w.checkNewAssignments();
  assert.strictEqual(w.__shown.length, 1, '같은 곳에 사업이 하나 더 붙었는데 모른다');
  assert.strictEqual(w._naRows.length, 1, '이미 아는 사업까지 또 알린다');
});

test('★★ 빠지기만 하면 «조용히» 맞춘다 — 없어진 것으로 창을 띄우지 않는다', () => {
  const w = world('a2', [HB()], { store: { p_naSeen_a2: '["c1:t1","c9:t1"]' } });
  w.checkNewAssignments();
  assert.strictEqual(w.__shown.length, 0, '빠진 것으로 창이 뜬다');
  assert.deepStrictEqual(JSON.parse(w.__store.p_naSeen_a2), ['c1:t1'],
    '없어진 것을 계속 담고 있다 — 다시 붙으면 새것인 줄 모른다');
});

test('★★ «끝난» 사업은 안 센다 — 종료한 것을 새로 맡았다고 하면 안 된다', () => {
  const co = HB(); co.endedTypes = { t1: '2026-08-01' };
  const w = world('a2', [co], { store: { p_naSeen_a2: '[]' } });
  w.checkNewAssignments();
  assert.strictEqual(w.__shown.length, 0, '끝난 사업으로 창이 뜬다');
});

test('★ «쉬는» 사업장은 안 센다', () => {
  const co = HB(); co.active = false;
  const w = world('a2', [co], { store: { p_naSeen_a2: '[]' } });
  w.checkNewAssignments();
  assert.strictEqual(w.__shown.length, 0, '쉬는 곳으로 창이 뜬다');
});

test('★★ 사람마다 따로 담는다 — 한 PC 를 여럿이 쓴다', () => {
  /* a1 이 확인해도 a2 에게는 그대로 떠야 한다. */
  const w1 = world('a1', [HB()], { store: { p_naSeen_a1: '[]' } });
  w1.checkNewAssignments(); w1.naClose();
  const w2 = world('a2', [HB()], { store: Object.assign({ p_naSeen_a2: '[]' }, w1.__store) });
  w2.checkNewAssignments();
  assert.strictEqual(w2.__shown.length, 1, '한 사람이 닫으면 다른 사람에게도 안 뜬다');
});

test('★ 열람자(로그인 안 한 사람)에게는 아무것도 안 한다', () => {
  const w = world('', [HB()], {});
  w.checkNewAssignments();
  assert.strictEqual(w.__shown.length, 0);
  assert.ok(!w.__store.p_naSeen_x, '이름도 없는데 담아 둔다');
});

/* ══ 붙어 있어야 뜻이 있다 ═══════════════════════════════════════ */

test('★★★ 로그인 뒤 실제로 «불린다» — 안 부르면 위의 셈은 아무 일도 안 한다', () => {
  assert.ok(/checkNewAssignments\(\)/.test(CODE.replace(/function checkNewAssignments\(\)/, '')),
    '만들어만 두고 아무 데서도 안 부른다');
});

test('★★ ERP 가져오기 확인보다 «뒤»에 본다 — 두 창이 겹치지 않게', () => {
  const a = CODE.search(/checkErpNewOnLogin\(\);\s*\},\s*(\d+)/);
  const b = CODE.search(/checkNewAssignments\(\);\s*\},\s*(\d+)/);
  assert.ok(a >= 0 && b >= 0, '둘 다 로그인 뒤에 걸려 있어야 한다');
  const ta = +CODE.slice(a).match(/\},\s*(\d+)/)[1];
  const tb = +CODE.slice(b).match(/\},\s*(\d+)/)[1];
  assert.ok(tb > ta, '가져오기 창 위에 겹쳐 떠서 방금 넣은 것이 또 새것으로 뜬다');
});

test('★★ 창 뼈대가 있다 — 셈이 맞아도 그릴 데가 없으면 안 뜬다', () => {
  assert.ok(/id="mbNewAssign"/.test(HTML), '창이 없다');
  assert.ok(/id="naBody"/.test(HTML), '목록 담을 데가 없다');
  assert.ok(/onclick="naClose\(\)"/.test(HTML), '확인 단추가 안 걸려 있다');
});

test('★★ 창을 닫아도 «알림 줄»에 남는다 — 스쳐 지나가면 못 본다', () => {
  const fn = grab('buildNotifications');
  /* ⚠ 글자만 보면 안 된다 — 조건을 false 로 바꿔도 본문에 _naRows.length 가 남아 통과했다.
       «조건이 실제로 그 값을 본 뒤 줄을 붙이는가»를 본다. */
  assert.ok(/_naRows\.length\s*\)\s*\{\s*items\.push/.test(fn.replace(/\s+/g, ' ')),
    '알림 줄에 안 남는다 — 창을 스쳐 닫으면 그걸로 끝이다');
  assert.ok(/openNewAssign\(\)/.test(fn), '알림 줄을 눌러도 다시 못 연다');
});

test('★ 주담당·부담당 이름을 함께 보여 준다 — 누구와 하는지가 알맹이다', () => {
  const fn = bare(grab('renderNewAssign'));
  assert.ok(/주담당/.test(fn) && /부담당/.test(fn), '누구와 하는 사업인지 안 나온다');
  assert.ok(/escAttr\(/.test(fn), '이름을 그대로 붙인다 — 따옴표 든 상호에서 화면이 깨진다');
});
