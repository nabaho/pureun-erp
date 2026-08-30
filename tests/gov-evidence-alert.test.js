'use strict';
/* ══════ 「방문했는데 증빙 사진이 없다」 알림 + 이 PC 기록 공용으로 올리기 ══════
   실행: node --test tests/*.test.js

   정부 제출용 증빙이라 뒤늦게 알면 못 채운다. 지금까지 마감·회차는 알려 주면서
   증빙만 아무도 안 알려 줬다(대표 지시 2026-08-30).

   ⚠ 글자를 찾지 않고 함수를 돌린다. 가짜 자료를 끼워 진짜 함수를 태운다.
   ⚠ «안 묻는 자리»가 규칙이다 — 오늘 방문, 사무실, 기록보다 옛 방문, 남의 일정. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'gov-consulting.html'), 'utf8');

function fnSrc(name) {
  const m = new RegExp('(?:^|\\n)((?:async )?function ' + name + '\\s*\\()').exec(SRC);
  assert.ok(m, '함수를 찾을 수 없습니다: ' + name);
  const start = m.index + (m[0].startsWith('\n') ? 1 : 0);
  let i = SRC.indexOf('{', start), d = 0, k = i;
  while (k < SRC.length) {
    if (SRC[k] === '{') d++;
    else if (SRC[k] === '}') { d--; if (!d) break; }
    k++;
  }
  return SRC.slice(start, k + 1);
}

const TODAY = '2026-08-30';
/* 일정 넷 — 현장 둘(하나는 사진 있음) · 사무실 하나 · 남의 것 하나 */
function scheds() {
  return [
    { id: 's1', date: '2026-08-20', coId: 'c1', typeId: 't1', round: 2, attId: 'me', isField: true },
    { id: 's2', date: '2026-08-25', coId: 'c1', typeId: 't1', round: 3, attId: 'me', isField: true },
    { id: 's3', date: '2026-08-26', coId: 'c1', typeId: 't1', round: 4, attId: 'me', isField: false },
    { id: 's4', date: '2026-08-21', coId: 'c1', typeId: 't1', round: 1, attId: 'other', isField: true },
    { id: 's5', date: TODAY, coId: 'c1', typeId: 't1', round: 5, attId: 'me', isField: true }
  ];
}
/* 기록은 8/18 부터 있다 — s2 에만 사진이 있다 */
function log() {
  return [
    { t: '2026-08-18T01:00:00.000Z', action: 'add', sid: 'sX', slot: 0 },
    { t: '2026-08-25T05:00:00.000Z', action: 'add', sid: 's2', slot: 0 }
  ];
}

function notify(over) {
  const o = over || {};
  const box = {
    console,
    todayStr: () => TODAY,
    getEnv: () => ({ warnDeadlineDays: 14 }),
    getCos: () => [{ id: 'c1', name: '이피아', active: true, types: [] }],
    getTypes: () => [{ id: 't1', name: '현장클리닉' }],
    getScheds: o.scheds || scheds,
    getCoAtts: () => [],
    getCoMandatory: () => 0,
    getCoMaxRounds: () => 0,
    mainPhaseScheds: a => a,
    myId: () => 'me',
    isAdmin: () => !!o.admin,
    photoLogAll: () => (o.log || log)(),
    PHOTO_LOG_KEEP: 600,
    _erpAskRows: [], _erpAskBlocked: [],
    Date, Math, Object, Array, String, Number, JSON
  };
  vm.createContext(box);
  vm.runInContext(fnSrc('buildNotifications'), box);
  return box.buildNotifications().filter(x => x.type === 'noev');
}

test('방문했는데 사진이 없으면 알린다 — 아무도 안 알려 주던 자리다', () => {
  const got = notify();
  const ids = got.map(x => x.sub).join(' | ');
  assert.equal(got.length, 1, '★ 증빙 없는 방문을 못 찾습니다: ' + ids);
  assert.match(got[0].title, /이피아/);
  assert.match(got[0].sub, /2회차/, '어느 회차인지 안 적습니다');
  assert.match(got[0].sub, /지남/, '며칠 지났는지 안 적습니다');
});

test('★ 사진이 «있는» 방문은 안 묻는다 — 넣었는데 또 물으면 알림을 끈다', () => {
  const got = notify();
  assert.doesNotMatch(got.map(x => x.sub).join(' '), /3회차/, '★ 사진 있는 방문을 물었습니다');
});

test('★ 사무실 방문은 안 묻는다 — 증빙 사진이 필요 없다', () => {
  const got = notify();
  assert.doesNotMatch(got.map(x => x.sub).join(' '), /4회차/, '★ 사무실을 물었습니다');
});

test('★ 오늘 방문은 안 묻는다 — 넣을 시간을 준다', () => {
  const got = notify();
  assert.doesNotMatch(got.map(x => x.sub).join(' '), /5회차/, '★ 오늘 방문을 벌써 물었습니다');
});

test('★ 남의 일정은 안 묻는다 (관리자는 다 본다)', () => {
  assert.doesNotMatch(notify().map(x => x.sub).join(' '), /1회차/, '★ 남의 일정을 물었습니다');
  assert.match(notify({ admin: true }).map(x => x.sub).join(' '), /1회차/, '관리자가 못 봅니다');
});

test('★ 기록보다 «앞선» 방문은 안 묻는다 — 넣었는지 알 수가 없다', () => {
  /* 붙들고 있는 이력이 8/26 부터면, 8/20 방문에 사진이 있었는지 여기서는 모른다.
     모르는 것을 「없다」고 하면, 넣은 사람이 알림을 못 믿게 된다. */
  const got = notify({ log: () => [{ t: '2026-08-26T01:00:00.000Z', action: 'add', sid: 'sX', slot: 0 }] });
  assert.equal(got.length, 0, '★ 기록이 닿지 않는 옛 방문을 물었습니다');
});

test('★ 기록이 하나도 없으면 아무것도 안 묻는다 — 전부 「없음」이 되면 못 쓴다', () => {
  assert.equal(notify({ log: () => [] }).length, 0, '★ 기록 0건인데 물었습니다');
});

test('★ 끝난 컨설팅은 안 묻는다 — 업무관리 「밀린 것 모두」와 «같은 규칙»이어야 한다', () => {
  /* 한쪽만 걸러 두면 두 화면이 서로 다른 말을 하고, 그때부터 어느 쪽도 안 믿게 된다.
     제출이 끝난 건을 매일 물으면 알림 자체를 안 보게 된다. */
  const box = {
    console,
    todayStr: () => TODAY,
    getEnv: () => ({ warnDeadlineDays: 14 }),
    getCos: () => [{ id: 'c1', name: '이피아', active: true, types: [], endedTypes: { t1: 1 } }],
    getTypes: () => [{ id: 't1', name: '현장클리닉' }],
    getScheds: scheds,
    getCoAtts: () => [], getCoMandatory: () => 0, getCoMaxRounds: () => 0,
    mainPhaseScheds: a => a, myId: () => 'me', isAdmin: () => false,
    photoLogAll: log, PHOTO_LOG_KEEP: 600,
    _erpAskRows: [], _erpAskBlocked: [],
    Date, Math, Object, Array, String, Number, JSON
  };
  vm.createContext(box);
  vm.runInContext(fnSrc('buildNotifications'), box);
  const got = box.buildNotifications().filter(x => x.type === 'noev');
  assert.equal(got.length, 0, '★ 끝난 컨설팅을 물었습니다');
});

test('지운 사진은 «있음»으로 안 친다', () => {
  const got = notify({
    log: () => [
      { t: '2026-08-18T01:00:00.000Z', action: 'add', sid: 'sX', slot: 0 },
      { t: '2026-08-25T05:00:00.000Z', action: 'delete', sid: 's2', slot: 0 }
    ]
  });
  assert.match(got.map(x => x.sub).join(' '), /3회차/, '★ 지운 것을 사진 있음으로 셌습니다');
});

/* ══════ 이 PC 기록을 공용으로 올릴 때 ══════ */
function slimBox() {
  const box = { console, Object, Array, String, JSON };
  vm.createContext(box);
  vm.runInContext(
    (SRC.match(/const LOG_FIELDS=\[[^\]]*\];/) || [''])[0] + '\n' + fnSrc('logSlim') + '\n' + fnSrc('logKey'),
    box);
  return box;
}

test('★ 「변경 전 그림」은 안 올린다 — 그 무게 때문에 기록이 못 올라가고 있었다', () => {
  const b = slimBox();
  const out = b.logSlim({ t: '2026-08-01T00:00:00.000Z', action: 'add', sid: 's1', slot: 0, who: '권형하', thumb: 'data:image/jpeg;base64,' + 'A'.repeat(4000) }, '권형하', 'khh');
  assert.equal(out.thumb, undefined, '★ 그림이 딸려 올라갑니다(실시간DB 가 무거워집니다)');
  assert.ok(JSON.stringify(out).length < 300, '★ 한 줄이 너무 무겁습니다');
});

test('★ 사번은 «이름이 나와 같을 때만» 채운다 — 남의 방문이 내 것으로 넘어온다', () => {
  const b = slimBox();
  const mine = b.logSlim({ t: '1', action: 'add', sid: 's1', who: '권형하' }, '권형하', 'khh');
  assert.equal(mine.whoSid, 'khh', '내 옛 기록에 사번을 안 채웁니다');
  const other = b.logSlim({ t: '1', action: 'add', sid: 's1', who: '박재원' }, '권형하', 'khh');
  assert.equal(other.whoSid, undefined, '★ 남의 기록에 내 사번을 붙였습니다');
});

test('이미 있는 사번은 «덮어쓰지» 않는다', () => {
  const b = slimBox();
  const out = b.logSlim({ t: '1', action: 'add', sid: 's1', who: '권형하', whoSid: 'old' }, '권형하', 'khh');
  assert.equal(out.whoSid, 'old', '★ 남아 있던 사번을 덮었습니다');
});

test('같은 줄인지 가리는 열쇠에 «칸 번호»가 들어간다 — 없으면 두 장이 한 장이 된다', () => {
  const b = slimBox();
  const a = b.logKey({ t: '1', sid: 's1', slot: 0, action: 'add' });
  const c = b.logKey({ t: '1', sid: 's1', slot: 1, action: 'add' });
  assert.notEqual(a, c, '★ 다른 칸인데 같은 줄로 봅니다');
});

/* ══════ ④ 업무관리에서 「줄을 눌러」 건너오기 ══════
   주소 끝에 #sc=<일정번호> 가 붙어 온다. 자료는 클라우드에서 «늦게» 오므로
   바로 열면 없다고 나온다 — 나타날 때까지 기다리는 것이 규칙이다. */
function linkBox(opt) {
  const o = opt || {};
  const opened = [], said = [];
  let hash = o.hash != null ? o.hash : '#sc=s1';
  let seen = 0;                                  // 몇 번째 확인에서 일정이 나타나나
  const box = {
    console,
    location: { get hash() { return hash; }, pathname: '/gov-consulting.html', search: '' },
    history: { replaceState: () => { hash = ''; } },
    setTimeout: (fn) => { fn(); },               // 기다림을 건너뛴다(검사는 바로 돈다)
    getScheds: () => (++seen >= (o.appearAt || 1) ? [{ id: 's1' }] : []),
    openEditModal: sid => opened.push(sid),
    toast: (m, k) => said.push(String(m)),
    decodeURIComponent, String, Object, Array
  };
  vm.createContext(box);
  vm.runInContext(
    (SRC.match(/const LINK_TRIES=[^\n]*\n/) || [''])[0]
    + fnSrc('linkSid') + '\n' + fnSrc('linkClear') + '\n' + fnSrc('openFromLink'), box);
  return { box, opened, said, getHash: () => hash };
}

test('주소에 붙어 온 일정 번호를 읽는다', () => {
  assert.equal(linkBox({ hash: '#sc=abc123' }).box.linkSid(), 'abc123');
  assert.equal(linkBox({ hash: '' }).box.linkSid(), '', '★ 없는데 있다고 합니다');
});

test('★ 자료가 «늦게» 와도 기다렸다가 연다 — 바로 열면 늘 「없다」가 된다', () => {
  const w = linkBox({ appearAt: 5 });
  w.box.openFromLink();
  assert.deepEqual(w.opened, ['s1'], '★ 늦게 온 일정을 못 엽니다');
});

test('★ 한 번 열면 주소에서 지운다 — 새로고침마다 또 열리면 안 된다', () => {
  const w = linkBox();
  w.box.openFromLink();
  assert.equal(w.getHash(), '', '★ 주소에 그대로 남아 있습니다');
});

test('★ 못 찾으면 «그렇게 말한다» — 조용하면 고장으로 보인다', () => {
  const w = linkBox({ appearAt: 9999 });
  w.box.openFromLink();
  assert.equal(w.opened.length, 0);
  assert.equal(w.said.length, 1, '★ 못 찾았는데 아무 말이 없습니다');
  assert.match(w.said[0], /찾지 못했/);
  assert.equal(w.getHash(), '', '★ 못 찾고도 주소를 안 지웁니다');
});

test('건너온 것이 아니면 아무 일도 안 한다', () => {
  const w = linkBox({ hash: '' });
  w.box.openFromLink();
  assert.equal(w.opened.length, 0, '★ 부르지도 않은 창을 엽니다');
  assert.equal(w.said.length, 0);
});

/* ══════ ⑧ 자동백업에 「사진 이력」 (대표 결정 2026-08-30) ══════
   「누가 언제 넣었나」가 없으면 되살려도 증빙을 언제 넣었는지 못 밝힌다.
   ⚠ 새로 읽지 않는다 — 구독으로 이미 손에 든 것을 담는다.
   ⚠ «이 기기 스냅샷»에는 안 담는다 — 여덟 벌이 쌓이면 브라우저 저장칸을 밀어낸다.
   ⚠ 되돌릴 때는 «덮어쓰지 않고 없는 것만 채운다». */
function bkBox(cloud) {
  const pushed = [], reads = [], writes = [];
  let keyN = 0;
  const box = {
    console,
    BK_KEYS: ['p_cos', 'p_scheds'],
    localStorage: { getItem: k => (k === 'p_cos' ? '[{"id":"c1"}]' : '[{"id":"s1"},{"id":"s2"}]') },
    photoLogAll: () => [
      { t: '2026-08-01T00:00:00.000Z', action: 'add', sid: 's1', slot: 0, who: '권형하' },
      { t: '2026-08-02T00:00:00.000Z', action: 'add', sid: 's2', slot: 0, who: '박재원' }
    ],
    PHOTO_LOG_KEEP: 600,
    PHOTO_LOG_NODE: 'scal_photoLog',
    FB_READY: true,
    _fbDB: {
      ref: () => ({
        once: () => { reads.push(1); return Promise.resolve({ val: () => cloud || {} }); },
        /* 값 없이 부르면 «열쇠만» 준다 — 진짜 파이어베이스와 같은 버릇 */
        push: () => ({ key: 'k' + (++keyN) }),
        update: o => { Object.keys(o).forEach(k => pushed.push(o[k])); writes.push(1); return Promise.resolve(); }
      })
    },
    Date, Object, Array, String, JSON, Promise
  };
  vm.createContext(box);
  vm.runInContext(fnSrc('logKey') + '\n' + fnSrc('buildBackupData') + '\n' + fnSrc('restorePhotoLog'), box);
  return { box, pushed, reads, writes };
}

test('★ 서버 백업·파일 내보내기에는 사진 이력이 «들어간다»', () => {
  const d = bkBox().box.buildBackupData(true);
  assert.ok(Array.isArray(d.photoLog), '★ 사진 이력이 안 담깁니다');
  assert.equal(d.photoLog.length, 2);
});

test('★ «이 기기 스냅샷»에는 안 담는다 — 브라우저 저장칸을 밀어낸다', () => {
  /* 여덟 벌 × 120KB 면 정작 일정이 저장 안 되는 일이 생긴다(용량 초과). */
  const d = bkBox().box.buildBackupData();
  assert.equal(d.photoLog, undefined, '★ 기기 스냅샷에까지 이력을 담았습니다');
  assert.ok(d.p_cos, '나머지 칸은 그대로여야 합니다');
});

test('★ 되돌릴 때 «덮어쓰지 않고 없는 것만» 채운다', async () => {
  /* 덮어쓰면 백업을 뜬 뒤에 남이 넣은 기록이 통째로 사라진다. */
  const already = { k1: { t: '2026-08-01T00:00:00.000Z', action: 'add', sid: 's1', slot: 0 } };
  const w = bkBox(already);
  const n = await w.box.restorePhotoLog(w.box.buildBackupData(true).photoLog);
  assert.equal(n, 1, '★ 이미 있는 것까지 다시 넣었습니다');
  assert.equal(w.pushed.length, 1);
  assert.equal(w.pushed[0].sid, 's2', '★ 엉뚱한 것을 넣었습니다');
  /* ★ 한 줄씩이 아니라 «한 번에» — 3,000줄이면 몇 분이 걸리고 도중에 끊기면 절반만 들어간다 */
  assert.equal(w.writes.length, 1, '★ 한 줄씩 밀어 넣습니다');
});

test('★ 여러 줄이어도 «한 번에» 쓴다 — 도중에 끊겨 절반만 들어가면 안 된다', async () => {
  const w = bkBox();
  const n = await w.box.restorePhotoLog(w.box.buildBackupData(true).photoLog);
  assert.equal(n, 2, '★ 두 줄을 다 안 넣었습니다');
  assert.equal(w.writes.length, 1, '★ 줄 수만큼 나눠 씁니다');
});

test('★ 되돌릴 것이 없으면 «읽지도» 않는다 — 읽기도 요금이다', async () => {
  const w = bkBox();
  assert.equal(await w.box.restorePhotoLog(undefined), 0);
  assert.equal(await w.box.restorePhotoLog([]), 0);
  assert.equal(w.pushed.length, 0, '★ 빈 이력으로 뭔가 썼습니다');
  assert.equal(w.reads.length, 0, '★ 담긴 것이 없는데 클라우드를 읽었습니다');
});

test('클라우드에 연결 안 됐으면 조용히 넘어간다 — 되살리기 전체를 깨뜨리지 않는다', async () => {
  const w = bkBox();
  w.box.FB_READY = false;
  assert.equal(await w.box.restorePhotoLog([{ t: '1', sid: 's9' }]), 0);
  assert.equal(w.pushed.length, 0);
});
