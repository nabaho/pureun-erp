/* 사진첩 화면 정리 (대표 지시 2026-08-07)
   ① 알림이 사진을 아래로 밀어내지 않고 오른쪽 아래에 뜬다 — ✕ 로 닫는다
   ② 설정을 푸른이알피 환경설정처럼 탭으로 나눈다
   ③ 「지난 것만」 보기 — 숫자만 보여 주면 담당자가 할 수 있는 일이 없다 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'pu-photos.html'), 'utf8');

function fn(name, ctx) {
  const m = html.match(new RegExp('function ' + name + '\\([\\s\\S]*?\\n\\}'));
  assert.ok(m, name + ' 를 찾지 못했습니다.');
  vm.createContext(ctx);
  vm.runInContext(m[0], ctx);
  return ctx[name];
}
const DAY = 86400000;

/* ══ ① 알림 자리 ══ */
test('★ 알림이 사진 위 흐름에서 빠졌다 (사진을 밀어내지 않는다)', () => {
  const view = html.match(/<div id="viewPhotos">[\s\S]*?<div id="findBar">/);
  assert.ok(view, 'viewPhotos 를 찾지 못했습니다.');
  for (const id of ['bkNote', 'instNote', 'payNote', 'dupBox', 'retNote']) {
    assert.ok(!view[0].includes('id="' + id + '"'),
      id + ' 가 아직 사진 위에 있습니다 — 알림이 늘면 사진이 화면 밖으로 밀립니다.');
  }
  const dock = html.match(/<div id="noteDock">[\s\S]*?\n  <\/div>/);
  assert.ok(dock, 'noteDock 이 없습니다.');
  for (const id of ['bkNote', 'instNote', 'payNote', 'dupBox', 'retNote']) {
    assert.ok(dock[0].includes('id="' + id + '"'), id + ' 이 알림 자리에 없습니다.');
  }
});

test('알림 자리는 떠 있고, 빈 자리는 클릭이 뚫린다', () => {
  const css = html.match(/#noteDock\{[^}]*\}/);
  assert.ok(css, '#noteDock 꾸밈이 없습니다.');
  assert.ok(/position:fixed/.test(css[0]));
  assert.ok(/pointer-events:none/.test(css[0]),
    '안 보이는 판이 사진을 덮으면 사진을 못 누릅니다.');
  assert.ok(/#noteDock > \*\{pointer-events:auto\}/.test(html),
    '알림 자체는 눌려야 합니다.');
});

test('폰에서는 오른쪽이 아니라 아래에 눕는다', () => {
  assert.ok(/@media \(max-width:820px\)\{\s*#noteDock\{[^}]*left:/.test(html),
    '폰에서 오른쪽에 두면 사진을 가립니다.');
});

/* ── 닫으면 얼마나 안 뜨나 (대표 결정) ── */
test('★ 영영 안 뜨면 위험한 알림은 다시 뜬다', () => {
  const m = html.match(/const NOTE_SNOOZE_DAYS = \{[^}]*\}/);
  assert.ok(m, 'NOTE_SNOOZE_DAYS 가 없습니다.');
  const ctx = {};
  vm.runInNewContext(m[0].replace('const', 'var') + '; out = NOTE_SNOOZE_DAYS;', ctx);
  const d = ctx.out;
  assert.equal(d.inst, 0, '설치 안내는 닫으면 다시 안 떠도 됩니다 — 메뉴로 설치할 수 있습니다.');
  assert.ok(d.bk > 0, '백업 안내가 영영 안 뜨면 백업을 안 한 채 잊습니다.');
  assert.ok(d.pay > 0, '급여서류는 받지 않기로 한 개인정보입니다 — 영영 안 뜨면 남습니다.');
  assert.ok(d.ret > 0, '보유기준 점검이 영영 안 뜨면 담당자를 정한 뜻이 없어집니다.');
  assert.ok(d.ret <= d.bk, '점검은 백업보다 자주 다시 물어야 합니다.');
});

test('★ 닫힘 여부를 실제로 셈한다', () => {
  const store = {};
  const ctx = {
    Date,
    NOTE_SNOOZE_DAYS: { inst: 0, bk: 30, ret: 7 },
    localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = v; } },
    noteKey: (id) => 'k.' + id
  };
  const hidden = fn('noteHidden', ctx);
  assert.equal(hidden('bk'), false, '닫은 적 없으면 떠야 합니다.');
  store['k.inst'] = 'off';
  assert.equal(hidden('inst'), true, '설치 안내는 닫으면 끝입니다.');
  store['k.bk'] = String(Date.now() - 29 * DAY);
  assert.equal(hidden('bk'), true, '29일째는 아직 조용해야 합니다.');
  store['k.bk'] = String(Date.now() - 31 * DAY);
  assert.equal(hidden('bk'), false, '31일째는 다시 떠야 합니다.');
  store['k.ret'] = String(Date.now() - 8 * DAY);
  assert.equal(hidden('ret'), false, '점검은 7일 뒤 다시 떠야 합니다.');
});

test('저장을 못 해도 터지지 않는다', () => {
  const ctx = {
    Date, NOTE_SNOOZE_DAYS: { bk: 30 }, noteKey: (id) => id,
    localStorage: { getItem() { throw new Error('사생활 보호 모드'); } }
  };
  assert.equal(fn('noteHidden', ctx)('bk'), false, '못 읽으면 그냥 띄웁니다.');
});

test('알림마다 ✕ 가 붙는다', () => {
  for (const [f, id] of [['renderBkNote', 'bk'], ['renderPayNote', 'pay'],
                         ['renderInstNote', 'inst'], ['renderRetNote', 'ret']]) {
    const m = html.match(new RegExp('function ' + f + '\\([\\s\\S]*?\\n\\}'));
    assert.ok(m, f + ' 를 찾지 못했습니다.');
    assert.ok(m[0].includes("noteX('" + id + "')"), f + ' 에 ✕ 가 없습니다.');
    assert.ok(m[0].includes("noteHidden('" + id + "')"), f + ' 가 닫힘을 안 봅니다.');
  }
});

test('★ 넷째부터는 접는다 (알림이 사진첩이 되면 안 된다)', () => {
  assert.ok(/const NOTE_MAX_SHOWN = 3/.test(html));
  const m = html.match(/function syncDock\(\)[\s\S]*?\n\}/);
  assert.ok(m && /slice\(NOTE_MAX_SHOWN\)[\s\S]{0,80}add\('hid'\)/.test(m[0]),
    '넘치는 알림을 감춰야 합니다.');
  assert.ok(/더 보기/.test(m[0]), '감춘 것을 다시 볼 길이 있어야 합니다.');
});

test('겹치는 서류 목록이 길어도 화면을 다 먹지 않는다', () => {
  const css = html.match(/#dupBox\{[^}]*\}/);
  assert.ok(css && /max-height:/.test(css[0]) && /overflow-y:auto/.test(css[0]),
    '일곱 줄이 그대로 쌓이면 알림이 사진첩을 덮습니다.');
});

test('점검했음을 누르면 미뤄 둔 것이 풀린다', () => {
  const m = html.match(/function markRetChecked\(\)[\s\S]*?\n\}/);
  assert.ok(/removeItem\(noteKey\('ret'\)\)/.test(m[0]),
    '미뤄 둔 채로 두면 다음 주기에 안 뜹니다.');
});

/* ══ ② 설정 탭 ══ */
test('★ 설정이 이알피처럼 탭으로 갈린다', () => {
  assert.ok(/<div id="setTabs"><\/div>/.test(html), '탭 줄이 없습니다.');
  const m = html.match(/const SET_TABS = \[[\s\S]*?\];/);
  assert.ok(m, 'SET_TABS 가 없습니다.');
  for (const id of ['use', 'keep', 'backup', 'admin']) {
    assert.ok(m[0].includes("id: '" + id + "'"), id + ' 탭이 없습니다.');
  }
  /* 카드가 어느 탭인지 다 적혀 있어야 한다 — 안 적힌 카드는 어느 탭에서도 안 보인다 */
  const view = html.match(/<div id="viewSettings"[\s\S]*?\n     <\/div>/);
  assert.ok(view, 'viewSettings 를 찾지 못했습니다.');
  const cards = view[0].match(/<div class="card"[^>]*>/g) || [];
  assert.ok(cards.length >= 5, '설정 카드가 너무 적습니다: ' + cards.length);
  cards.forEach(function (c) {
    assert.ok(/data-sec="/.test(c), '어느 탭인지 안 적힌 카드가 있습니다: ' + c);
  });
});

test('마지막에 본 탭을 기억한다', () => {
  assert.ok(/localStorage\.setItem\(SET_TAB_LS/.test(html));
  const m = html.match(/function initSetTab\(\)[\s\S]*?\n\}/);
  assert.ok(m && /visibleSetTabs\(\)\.find/.test(m[0]),
    '없어진 탭을 기억하고 있으면 빈 화면이 뜹니다.');
});

test('★ 관리자 탭은 관리자에게만 보인다', () => {
  const m = html.match(/function visibleSetTabs\(\)[\s\S]*?\n\}/);
  assert.ok(m && /amAdmin\(\)/.test(m[0]) && /t\.id !== 'admin'/.test(m[0]));
});

test('★ 탭 순서를 바꿔도 새 탭이 사라지지 않는다', () => {
  const ctx = {
    SET_TABS: [{ id: 'use' }, { id: 'keep' }, { id: 'backup' }, { id: 'admin' }],
    SET_ORDER_LS: 'o', JSON,
    localStorage: { getItem: () => JSON.stringify(['backup', 'use']) }   // 옛 순서 — keep·admin 없음
  };
  const got = fn('setTabsInOrder', ctx)().map(function (t) { return t.id; });
  assert.deepEqual(got.slice(0, 2), ['backup', 'use'], '저장한 순서를 지켜야 합니다.');
  assert.ok(got.includes('keep') && got.includes('admin'),
    '나중에 만든 탭이 빠지면 그 설정에 영영 못 들어갑니다.');
});

test('망가진 순서 기록에도 터지지 않는다', () => {
  const ctx = {
    SET_TABS: [{ id: 'use' }, { id: 'keep' }], SET_ORDER_LS: 'o', JSON,
    localStorage: { getItem: () => '{망가짐' }
  };
  assert.deepEqual(fn('setTabsInOrder', ctx)().map((t) => t.id), ['use', 'keep']);
});

test('관리자 카드는 탭과 원래 조건을 함께 지킨다', () => {
  const m = html.match(/function renderSetTabs\(\)[\s\S]*?\n\}/);
  assert.ok(/c\.id === 'mig'[\s\S]{0,120}migAllowed/.test(m[0]),
    '관리자가 아닌데 탭만으로 옛 사진 옮기기가 열리면 안 됩니다.');
});

/* ══ ③ 지난 것만 보기 ══ */
test('★ 지난 사진을 눈으로 볼 수 있다 (숫자만 보여 주지 않는다)', () => {
  assert.ok(/<button id="oldBox"[^>]*onclick="toggleOld\(\)"/.test(html), '「지난 것만」 단추가 없습니다.');
  const m = html.match(/function shownItemsFresh\(\)[\s\S]*?\n\}/);
  assert.ok(m && /if \(oldOnly\) list = list\.filter\(isOldItem\);/.test(m[0]),
    '걸러보기가 격자에 걸려 있지 않습니다.');
});

test('지난 것 = 보유기간 만료 + 급여서류', () => {
  const ctx = { isExpired: (m) => !!m.expired };
  const isOld = fn('isOldItem', ctx);
  assert.equal(isOld({ meta: { read: { kind: 'payslip' } } }), true, '급여서류는 기간과 무관하게 지웁니다.');
  assert.equal(isOld({ meta: { expired: true } }), true);
  assert.equal(isOld({ meta: {} }), false);
  assert.equal(isOld({}), false, '자료가 없어도 터지면 안 됩니다.');
});

test('★ 두 걸러보기를 겹치지 않는다', () => {
  const on = html.match(/function toggleOld\(\)[\s\S]*?\n\}/);
  assert.ok(/if \(oldOnly\) needOnly = false;/.test(on[0]));
  const nd = html.match(/function toggleNeed\(\)[\s\S]*?\n\}/);
  assert.ok(/if \(needOnly\) oldOnly = false;/.test(nd[0]),
    '둘이 겹치면 지금 무엇을 보고 있는지 알 수 없습니다.');
});

test('★ 「지금 점검하기」가 설정이 아니라 사진으로 데려간다', () => {
  const m = html.match(/function goRetCheck\(\)[\s\S]*?\n\}/);
  assert.ok(m && /showView\('photos'\)/.test(m[0]),
    '설정만 열면 숫자만 보고 끝납니다 — 어느 사진인지 볼 수 없습니다.');
  assert.ok(/oldOnly = true/.test(m[0]));
  assert.ok(/needOnly = false/.test(m[0]), '두 걸러보기가 겹치면 안 됩니다.');
});

test('설정에서도 지난 사진으로 갈 수 있다', () => {
  assert.ok(/onclick="goRetCheck\(\)"[^>]*>지난 사진 펼쳐 보기</.test(html));
});

test('보고 있는 것이 무엇인지 말해 준다', () => {
  assert.ok(/보유기간 지난 사진 ' \+ shown \+ '장 — 확인하고 지워 주세요/.test(html),
    '걸러 놓고 아무 말이 없으면 사진이 없어진 줄 압니다.');
});
