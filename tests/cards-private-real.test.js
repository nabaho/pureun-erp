'use strict';
/* ══════ 「🔒 개인으로」가 «진짜로» 가리게 (대표 결정 2026-08-30 ㉮) ══════
   3차 점검에서 드러난 것: 「🔒 개인으로」를 눌러도 하는 일이 «자물쇠 그림을 붙이는 것»
   뿐이었다. 명함은 전 직원 공유 창고에 그대로 있고, 검색 색인(pucards/idx)에도
   그대로 들어가 «푸른이알피와 업무관리 검색에 나왔다». 이름이 거짓말을 하고 있었다.

   대표 결정: 진짜로 가린다 — 대표님만.
     · 누르면 그 명함을 개인 창고(pucards_private/{uid})로 «옮긴다». 서버 규칙이
       auth.uid === $uid 로 막으므로 남이 아예 못 읽는다 — 화면에서 가리는 것이 아니다.
     · 「개인 폴더 잠금」이 이미 폴더째로 하는 그 일이다. 새 길을 내지 않고 그 배관
       (movePaths·lockKeyUpdates)을 그대로 쓴다.
     · 직원에게는 그 단추를 «안 보여 준다». 개인 창고가 대표님 전용이라(openPrivateVault
       가 isAdmin 으로 막는다) 넣을 곳이 없다 — 눌리는데 아무 일도 안 나는 단추를
       두면 안 된다.

   ★ 여기서 못 박는 것
     ① 개인으로 = 공유 창고에서 «빠지고» 개인 창고로 들어간다
     ② 검색 색인에서도 빠진다 — 다른 프로그램에서 안 나와야 한다
     ③ 공용으로 되돌리면 반대로 돌아온다
     ④ 대표가 아니면 단추가 아예 없다
     ⑤ 무엇이 일어나는지 «묻고» 한다 — 목록에서 사라지는 일이다 */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('node:vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'pu-cards.html'), 'utf8');

function fn(name) {
  const at = SRC.search(new RegExp('(?:^|\\n)(?:async )?function ' + name + '\\('));
  assert.ok(at >= 0, name + ' 을 찾지 못했다');
  const open = SRC.indexOf('{', at);
  let d = 0;
  for (let k = open; k < SRC.length; k++) {
    if (SRC[k] === '{') d++;
    else if (SRC[k] === '}') { d--; if (!d) return SRC.slice(at, k + 1); }
  }
  throw new Error(name + ' 의 끝을 찾지 못했다');
}
const bare = s => String(s).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');

/* ── ① 검색 색인에서 빠진다 ──────────────────────────────────────── */
function idxCtx(it, locked) {
  const b = {
    state: { groups: locked ? { g1: { id: 'g1', locked: true } } : {} },
    Store: { mode: 'firebase', db: { ref: p => ({ set: v => b._w.push([p, v]), remove: () => b._w.push([p, null]) }) } },
    DB_ROOT: 'pucards', BYKEY: 'bykey',
    idxRecord: x => ({ n: x.name || '' }),
    byKeyOf: () => 'k1',
    _w: []
  };
  vm.createContext(b);
  vm.runInContext(fn('inLockedGroup'), b);
  vm.runInContext(fn('writeIdx'), b);
  vm.runInContext('writeIdx(__it)', Object.assign(b, { __it: it }));
  return b._w;
}

test('★ 개인 명함은 공유 검색 색인에 «안» 올라간다', () => {
  const w = idxCtx({ id: 'c1', name: '홍길동', group: '', scope: 'private' });
  const idx = w.find(([p]) => p.indexOf('/idx/') >= 0);
  assert.ok(idx, '색인 자리를 안 건드렸다');
  assert.equal(idx[1], null,
    '★ 개인이라 눌러 둔 명함이 푸른이알피·업무관리 검색에 그대로 나온다');
});

test('공용 명함은 그대로 색인에 올라간다', () => {
  const w = idxCtx({ id: 'c1', name: '홍길동', group: '', scope: 'shared' });
  const idx = w.find(([p]) => p.indexOf('/idx/') >= 0);
  assert.ok(idx && idx[1], '멀쩡한 명함까지 검색에서 사라졌다');
});

test('scope 가 아예 없으면 공용이다 — 옛 명함이 사라지면 안 된다', () => {
  const w = idxCtx({ id: 'c1', name: '홍길동', group: '' });
  const idx = w.find(([p]) => p.indexOf('/idx/') >= 0);
  assert.ok(idx && idx[1], '★ scope 를 안 적은 옛 명함 6,295장이 통째로 검색에서 빠진다');
});

test('잠긴 폴더는 예전대로 빠진다 — 있던 규칙을 안 건드렸다', () => {
  const w = idxCtx({ id: 'c1', name: '홍길동', group: 'g1' }, true);
  const idx = w.find(([p]) => p.indexOf('/idx/') >= 0);
  assert.equal(idx[1], null);
});

/* ── ② 개인 창고로 «옮긴다» ─────────────────────────────────────── */
test('★ 개인으로 하면 공유 창고에서 «빠지고» 개인 창고로 들어간다', () => {
  const b = { privRoot: () => 'pucards_private/u1', DB_ROOT: 'pucards' };
  vm.createContext(b);
  vm.runInContext(fn('cardPrivPaths'), b);
  const u = JSON.parse(JSON.stringify(vm.runInContext("cardPrivPaths('c1', true)", b)));
  assert.equal(u['pucards/items/c1'], null, '★ 공유 창고에 그대로 남으면 남이 읽는다');
  assert.equal(u['pucards/idx/c1'], null, '★ 색인에 남으면 다른 프로그램에서 검색된다');
  assert.equal(u['pucards_private/u1/items/c1'], 1, '개인 창고에 안 들어간다');
});

test('★ 공용으로 되돌리면 반대로 돌아온다 — 사진·썸네일까지', () => {
  const b = { privRoot: () => 'pucards_private/u1', DB_ROOT: 'pucards' };
  vm.createContext(b);
  vm.runInContext(fn('cardPrivPaths'), b);
  const u = JSON.parse(JSON.stringify(vm.runInContext("cardPrivPaths('c1', false)", b)));
  assert.equal(u['pucards/items/c1'], 1, '공유 창고로 안 돌아온다');
  /* ⚠ items 만 보면 안 된다 — 사진이 개인 창고에 남는 고장이 그대로 샌다
     (2026-08-30 고장 시험에서 샜다). 옮기는 세 가지를 다 본다. */
  ['items', 'photos', 'thumbs'].forEach(k => {
    assert.equal(u['pucards_private/u1/' + k + '/c1'], null,
      '★ 개인 창고에 ' + k + ' 찌꺼기가 남는다 — 되돌렸는데 사본이 남아 있다');
  });
});

test('사진도 함께 옮긴다 — 사진만 남으면 그것으로 알아본다', () => {
  const b = { privRoot: () => 'pucards_private/u1', DB_ROOT: 'pucards' };
  vm.createContext(b);
  vm.runInContext(fn('cardPrivPaths'), b);
  const u = JSON.parse(JSON.stringify(vm.runInContext("cardPrivPaths('c1', true)", b)));
  assert.equal(u['pucards/photos/c1'], null, '★ 공유 창고에 사진이 남는다');
  assert.equal(u['pucards_private/u1/photos/c1'], 1);
});

/* ── ③ 대표가 아니면 단추가 없다 ───────────────────────────────── */
test('★ 대표가 아니면 「개인으로」 단추가 아예 안 보인다', () => {
  ['openPcDetail', 'openDetail'].forEach(n => {
    const src = bare(fn(n));
    const at = src.indexOf('toggleScope');
    assert.ok(at >= 0, n + ' 에서 그 단추를 못 찾았다');
    const seg = src.slice(Math.max(0, at - 300), at);
    assert.ok(/state\.isAdmin/.test(seg),
      '★ ' + n + ' — 직원에게도 보인다. 개인 창고가 없어 눌러도 아무 일이 안 난다');
  });
});

/* ── ④ 묻고 한다 — 진짜로 돌려 본다 ──────────────────────────────
   ⚠ 「소스에 confirm( 이 있나」로만 보면 if(false && confirm(...)) 이 그대로 샌다.
     2026-08-30 고장 시험에서 실제로 샜다 — 오늘만 두 번째다. */
function runToggle(opts) {
  const o = opts || {};
  const asked = [];
  const writes = [];
  const b = {
    state: {
      isAdmin: o.admin !== false,
      items: o.priv ? {} : { c1: { id: 'c1', kind: 'card', name: '홍길동' } },
      priv: { items: o.priv ? { c1: { id: 'c1', kind: 'card', name: '홍길동' } } : {} }
    },
    Store: {
      mode: 'firebase',
      getPhoto: () => Promise.resolve(''),
      getThumb: () => Promise.resolve(''),
      put: () => {},
      db: { ref: () => ({ update: u => { writes.push(u); return Promise.resolve(); } }) }
    },
    privRoot: () => 'pucards_private/u1',
    privLockRec: () => Promise.resolve({ salt: 'x' }),
    setPrivatePassword: () => Promise.resolve(true),
    lockKeyUpdates: () => Promise.resolve({}),
    confirm: m => { asked.push(m); return o.ok !== false; },
    toast: () => {}, render: () => {}, closeDetail: () => {},
    DB_ROOT: 'pucards',
    _asked: asked, _writes: writes
  };
  vm.createContext(b);
  vm.runInContext(fn('cardPrivPaths'), b);
  vm.runInContext(fn('toggleScope'), b);
  return vm.runInContext("toggleScope('c1')", b).then(() => b);
}

test('★ 「아니오」를 누르면 «아무것도 안 옮긴다»', () => {
  return runToggle({ ok: false }).then(b => {
    assert.equal(b._writes.length, 0, '★ 취소했는데 개인 창고로 옮겼다');
  });
});

test('★ 확인창이 «비밀번호를 넣어야 다시 보인다»고 말한다', () => {
  return runToggle({ ok: false }).then(b => {
    assert.equal(b._asked.length, 1, '묻지 않고 옮긴다');
    assert.ok(/비밀번호/.test(b._asked[0]),
      '★ 다시 보려면 비밀번호가 필요하다는 것을 안 말한다 — 자료가 사라진 줄 안다');
    assert.ok(/목록에서 사라/.test(b._asked[0]), '목록에서 사라진다는 것을 안 말한다');
  });
});

test('★ 되돌릴 때는 «안 묻는다» — 되돌리기를 막을 까닭이 없다', () => {
  return runToggle({ priv: true }).then(b => {
    assert.equal(b._asked.length, 0, '★ 공용으로 되돌리는데도 묻는다');
    assert.equal(b._writes.length, 1, '되돌리기가 아예 안 됐다');
  });
});

test('★ 대표가 아니면 «아무 일도 안 일어난다»', () => {
  return runToggle({ admin: false }).then(b => {
    assert.equal(b._writes.length, 0, '★ 직원이 눌러도 개인 창고로 옮겨진다');
    assert.equal(b._asked.length, 0);
  });
});
