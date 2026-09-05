/* 🧹 같은 서류 정리 → 휴지통 (대표 지시 2026-09-03)
   「중복 여부 체크해서 중복이면 제거하는 게 좋다」 · 「중복자료 삭제 휴지통에 넣어달라」

   ★ 지켜야 하는 것
     ① «지우지 않는다» — 휴지통(trashDocs)으로 옮기고 거기서 되돌린다.
     ② 사진첩 «원본»은 안 건드린다 — 옮기는 것은 기업정보함이 든 «기록»뿐이다.
     ③ 잣대를 «아주 좁게» — 넓게 잡으면 남의 서류를 지운다.
     ④ 넣기와 빼기를 «한 통»에 — 나눠 쓰면 잃거나 두 곳에 남는다.
     ⑤ 남기는 것은 «최근» 것.

     node --test tests/cards-co-doc-dup-trash.test.js */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'pu-cards.html'), 'utf8').split('\r\n').join('\n');

function fnBody(name) {
  const i = SRC.search(new RegExp('(?:^|\\n)(?:async )?function ' + name + '\\('));
  assert.ok(i >= 0, name + ' 을 찾지 못했습니다');
  const open = SRC.indexOf('{', i);
  let d = 0;
  for (let k = open; k < SRC.length; k++) {
    if (SRC[k] === '{') d++;
    else if (SRC[k] === '}') { d--; if (!d) return SRC.slice(i, k + 1); }
  }
  assert.fail(name + ' 의 끝을 찾지 못했습니다');
}
const bare = s => String(s).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');

function load() {
  const ctx = { console, BULK_PATCH_CHUNK: 200,
    _norm: s => String(s == null ? '' : s).toLowerCase().replace(/\s+/g, '') };
  vm.createContext(ctx);
  const a = SRC.indexOf('/* ① 같은 사진첩 서류인가 */');
  const b = SRC.indexOf('function coDocDupCount(plan){');
  assert.ok(a > 0 && b > a, '알맹이를 못 찾았다');
  const end = SRC.indexOf('\n}', b) + 2;
  vm.runInContext(SRC.slice(a, end).replace(/\nconst /g, '\nvar '), ctx);
  return ctx;
}

const pairs = n => { const o = []; for (let i = 0; i < n; i++) o.push({ k: 'k' + i, v: 'v' + i }); return o; };

/* ── 잣대 ① 같은 사진첩 서류 ── */

test('★★ 같은 사진첩 서류가 두 번 들어온 것 — 가장 확실한 겹침이다', () => {
  const c = load();
  const g = c.coDocDupGroups({
    a: { name: '신청서', owner: 'u1', year: '2026', id: 'p1', at: 100 },
    b: { name: '신청서', owner: 'u1', year: '2026', id: 'p1', at: 200 }
  });
  assert.equal(g.length, 1);
  assert.equal(g[0].keep.at, 200, '★ 최근 것을 남겨야 한다');
  assert.equal(g[0].drop.length, 1);
  assert.equal(g[0].drop[0].at, 100);
});

test('★ 사진첩 번호가 다르면 «사진만으로는» 안 묶는다', () => {
  const c = load();
  const g = c.coDocDupGroups({
    a: { name: '신청서', owner: 'u1', year: '2026', id: 'p1', at: 100 },
    b: { name: '신청서', owner: 'u1', year: '2026', id: 'p2', at: 200 }
  });
  assert.equal(g.length, 0, '이름이 같다고 지우면 해가 다른 신청서가 사라진다');
});

/* ── 잣대 ② 이름도 적힌 것도 똑같음 ── */

test('★★ 사진은 달라도 «이름도 적힌 것도 한 글자도 안 다르면» 겹침이다', () => {
  const c = load();
  const g = c.coDocDupGroups({
    a: { name: '신청서', id: '', at: 100, pairs: pairs(5) },
    b: { name: '신청서', id: '', at: 300, pairs: pairs(5) }
  });
  assert.equal(g.length, 1);
  assert.equal(g[0].keep.at, 300);
});

test('★★ 적힌 것이 «한 글자라도» 다르면 안 묶는다 — 다른 서류다', () => {
  const c = load();
  const ps = pairs(5); const ps2 = pairs(5); ps2[2] = { k: 'k2', v: '다름' };
  const g = c.coDocDupGroups({
    a: { name: '신청서', at: 100, pairs: ps },
    b: { name: '신청서', at: 300, pairs: ps2 }
  });
  assert.equal(g.length, 0);
});

test('★★ 적힌 것이 «셋도 안 되면» 안 묶는다 — 우연히 같을 수 있다', () => {
  const c = load();
  const g = c.coDocDupGroups({
    a: { name: '신청서', at: 100, pairs: pairs(2) },
    b: { name: '신청서', at: 300, pairs: pairs(2) }
  });
  assert.equal(g.length, 0, '★ 항목 둘이 같다고 남의 서류를 지우면 안 된다');
});

test('★★ 적힌 것이 «아예 없으면» 안 묶는다 — 견줄 것이 없다', () => {
  const c = load();
  const g = c.coDocDupGroups({
    a: { name: '신청서', at: 100 },
    b: { name: '신청서', at: 300 }
  });
  assert.equal(g.length, 0);
});

test('이름이 다르면 안 묶는다', () => {
  const c = load();
  const g = c.coDocDupGroups({
    a: { name: '가', at: 100, pairs: pairs(5) },
    b: { name: '나', at: 300, pairs: pairs(5) }
  });
  assert.equal(g.length, 0);
});

test('겹치는 것이 셋이면 «둘»을 내놓는다 — 최근 하나만 남는다', () => {
  const c = load();
  const g = c.coDocDupGroups({
    a: { name: '신청서', owner: 'u', year: '2026', id: 'p1', at: 100 },
    b: { name: '신청서', owner: 'u', year: '2026', id: 'p1', at: 200 },
    d: { name: '신청서', owner: 'u', year: '2026', id: 'p1', at: 300 }
  });
  assert.equal(g[0].keep.at, 300);
  assert.equal(g[0].drop.length, 2);
});

/* ── 온 회사를 훑는다 ── */

test('★ 회사마다 따로 본다 — 다른 회사끼리는 «절대» 안 묶는다', () => {
  const c = load();
  const plan = c.coDocDupPlan({
    kA: { company: '가회사', docs: {
      a: { name: '신청서', owner: 'u', year: '2026', id: 'p1', at: 1 },
      b: { name: '신청서', owner: 'u', year: '2026', id: 'p1', at: 2 } } },
    kB: { company: '나회사', docs: {
      c: { name: '신청서', owner: 'u', year: '2026', id: 'p1', at: 3 } } }
  });
  assert.equal(plan.length, 1, '★ 회사가 다른데 같은 사진이라고 묶으면 남의 것을 지운다');
  assert.equal(plan[0].coKey, 'kA');
  assert.equal(plan[0].coName, '가회사', '휴지통에서 어디 것인지 보여야 한다');
});

test('몇 곳에서 몇 장인지 센다 — 누르기 «전»에 보여 줄 값', () => {
  const c = load();
  const n = c.coDocDupCount([
    { coKey: 'kA', drop: [{}, {}] }, { coKey: 'kA', drop: [{}] }, { coKey: 'kB', drop: [{}] }
  ]);
  assert.equal(n.곳, 2);
  assert.equal(n.장, 4);
});

/* ── 휴지통으로 옮긴다 ── */

test('★★ 「휴지통에 넣기」와 「원래 자리에서 빼기」가 «한 통»에 든다', () => {
  const c = load();
  const plan = [{ coKey: 'kA', coName: '가회사',
    keep: { _k: 'd2', name: '신청서' },
    drop: [{ _k: 'd1', name: '신청서', at: 100 }] }];
  const w = c.coDocDupWrites(plan, 777, 'na@pureun.kr', 200);
  assert.equal(w.length, 1, '통이 하나여야 한다');
  const 자리 = Object.keys(w[0]).sort();
  assert.equal(자리.join(','), 'coInfo/kA/docs/d1,trashDocs/kA_d1',
    '★ 나눠 쓰면 하나만 되어 자료를 잃거나 두 곳에 남는다');
  assert.equal(w[0]['coInfo/kA/docs/d1'], null, '원래 자리에서 빠져야 한다');
  const row = w[0]['trashDocs/kA_d1'];
  assert.equal(row.coKey, 'kA');
  assert.equal(row.coName, '가회사');
  assert.equal(row.docKey, 'd1');
  assert.equal(row.at, 777);
  assert.equal(row.by, 'na@pureun.kr');
  assert.equal(row.doc.name, '신청서', '★ 되돌리려면 원본을 통째로 담아야 한다');
  assert.equal(row.doc._k, undefined, '화면에서 붙인 임시 값은 안 담는다');
});

test('★ 남기는 것(keep)은 «건드리지 않는다»', () => {
  const c = load();
  const w = c.coDocDupWrites([{ coKey: 'kA', keep: { _k: 'd2' }, drop: [{ _k: 'd1' }] }], 1, '', 200);
  assert.equal(w[0]['coInfo/kA/docs/d2'], undefined, '★ 남길 것까지 지웠다');
});

test('★★ 휴지통 열쇠가 «회사+서류»다 — 두 번 정리해도 한 줄이다', () => {
  const c = load();
  const plan = [{ coKey: 'kA', keep: { _k: 'd2' }, drop: [{ _k: 'd1' }] }];
  const a = c.coDocDupWrites(plan, 1, '', 200);
  const b = c.coDocDupWrites(plan, 2, '', 200);
  assert.equal(Object.keys(a[0]).sort().join(','), Object.keys(b[0]).sort().join(','));
});

test('★ 많으면 «모아서» 나눠 쓴다 — 한 장씩 쓰면 2026-08-16 이 다시 온다', () => {
  const c = load();
  const drop = [];
  for (let i = 0; i < 250; i++) drop.push({ _k: 'd' + i });
  const w = c.coDocDupWrites([{ coKey: 'kA', keep: { _k: 'x' }, drop: drop }], 1, '', 200);
  assert.equal(w.length, 2, '200장 + 50장 = 통 둘');
  assert.equal(Object.keys(w[0]).length, 400, '한 장에 자리 둘(휴지통·원래 자리)');
});

test('내놓을 것이 없으면 아무것도 안 쓴다', () => {
  const c = load();
  assert.equal(c.coDocDupWrites([], 1, '', 200).length, 0);
  assert.equal(c.coDocDupWrites(null, 1, '', 200).length, 0);
  assert.equal(c.coDocDupWrites([{ coKey: 'kA', drop: [] }], 1, '', 200).length, 0);
});

/* ── 되돌리기 ── */

test('★★ 되돌리면 원래 자리에 «그대로» 돌아가고 휴지통에서 빠진다 — 한 통에', () => {
  const c = load();
  const upd = c.coDocTrashRestoreWrites('kA_d1',
    { coKey: 'kA', docKey: 'd1', doc: { name: '신청서', at: 100 } });
  assert.equal(Object.keys(upd).sort().join(','), 'coInfo/kA/docs/d1,trashDocs/kA_d1');
  assert.equal(upd['coInfo/kA/docs/d1'].name, '신청서');
  assert.equal(upd['trashDocs/kA_d1'], null);
});

test('되돌릴 것이 온전치 않으면 아무것도 안 한다 — 엉뚱한 자리에 쓰면 안 된다', () => {
  const c = load();
  assert.equal(c.coDocTrashRestoreWrites('x', null), null);
  assert.equal(c.coDocTrashRestoreWrites('', { coKey: 'a', docKey: 'b' }), null);
  assert.equal(c.coDocTrashRestoreWrites('x', { coKey: '', docKey: 'b' }), null);
  assert.equal(c.coDocTrashRestoreWrites('x', { coKey: 'a', docKey: '' }), null);
});

/* ── 지우는 것이 아니다 ── */

test('★★ 「정리」가 서류를 «지우지 않는다» — 휴지통으로 옮길 뿐이다', () => {
  const w = bare(fnBody('coDocDupWrites'));
  assert.match(w, /trashDocs\//, '휴지통에 안 넣는다');
  assert.ok(!/\.remove\(|Store\.(hardDel|del)\(/.test(bare(fnBody('openCoDupDocs'))),
    '★ 정리 도구가 진짜로 지운다');
});

test('★★ 사진첩 «원본»은 안 건드린다 — 옮기는 것은 기록뿐이다', () => {
  const 알맹이 = bare(fnBody('coDocDupWrites')) + bare(fnBody('openCoDupDocs'));
  assert.ok(!/delPhoto|delThumb|puphotos|photos\//.test(알맹이),
    '★ 사진을 건드리면 되돌려도 사진이 없다');
});

test('★ 진짜로 지우는 곳은 «휴지통 안»뿐이다', () => {
  const hard = fnBody('hardDelTrashDoc');
  assert.match(hard, /trashDocs\/\$\{id\}`\)\.remove\(\)/);
  assert.match(hard, /되돌릴 수 없습니다/);
  assert.match(hard, /원본 사진은 그대로/, '무엇이 안 지워지는지도 말해야 한다');
});

/* ── 「묻는가」는 «돌려서» 본다 ────────────────────────────────────────
   ⚠ 글자로 confirm( 을 찾으면 `if(false && confirm(...))` 로 꺼 버려도 통과한다.
     이 저장소가 여러 번 겪은 함정이다 — «아니오»라고 답하게 하고 «아무것도 안 쓰는지»를 본다. */

function runTidy(answer, coInfo) {
  const 쓴것 = [];
  const ctx = {
    console, BULK_PATCH_CHUNK: 200, DB_ROOT: 'pucards', myEmail: 'na@pureun.kr',
    _norm: s => String(s == null ? '' : s).toLowerCase().replace(/\s+/g, ''),
    _coInfo: coInfo,
    toast: () => {},
    confirm: () => answer,
    trashDocsBust: () => {},
    Store: { mode: 'firebase',
      db: { ref: () => ({ update: u => { 쓴것.push(u); return Promise.resolve(); } }) } }
  };
  vm.createContext(ctx);
  const a = SRC.indexOf('/* ① 같은 사진첩 서류인가 */');
  const b = SRC.indexOf('function coDocDupCount(plan){');
  const end = SRC.indexOf('\n}', b) + 2;
  vm.runInContext(SRC.slice(a, end).replace(/\nconst /g, '\nvar '), ctx);
  vm.runInContext(fnBody('openCoDupDocs'), ctx);
  return vm.runInContext('openCoDupDocs()', ctx).then(() => 쓴것);
}

const 겹친자료 = {
  kA: { company: '가회사', docs: {
    d1: { name: '신청서', owner: 'u', year: '2026', id: 'p1', at: 100 },
    d2: { name: '신청서', owner: 'u', year: '2026', id: 'p1', at: 200 } } }
};

test('★★ 「아니오」라고 하면 «아무것도 안 쓴다» — 돌려서 본다', () =>
  runTidy(false, 겹친자료).then(쓴것 => {
    assert.equal(쓴것.length, 0, '★ 묻지도 않고(또는 답을 무시하고) 옮겼다');
  }));

test('★ 「예」라고 해야 옮긴다 — 그때 휴지통과 원래 자리를 한 통에 쓴다', () =>
  runTidy(true, 겹친자료).then(쓴것 => {
    assert.equal(쓴것.length, 1);
    assert.equal(Object.keys(쓴것[0]).sort().join(','),
      'coInfo/kA/docs/d1,trashDocs/kA_d1');
  }));

function runHardDel(answer) {
  const 지운것 = [];
  const ctx = {
    console, DB_ROOT: 'pucards',
    _trashDocs: { 'kA_d1': { coKey: 'kA', coName: '가회사', docKey: 'd1', doc: { name: '신청서' } } },
    toast: () => {}, confirm: () => answer, trashDocsBust: () => {},
    setTimeout: () => {}, _refresh: () => {}, openTrash: () => {},
    Store: { db: { ref: p => ({ remove: () => { 지운것.push(p); return Promise.resolve(); } }) } }
  };
  vm.createContext(ctx);
  vm.runInContext(fnBody('hardDelTrashDoc'), ctx);
  return vm.runInContext("hardDelTrashDoc('kA_d1')", ctx).then(() => 지운것);
}

test('★★ 영구삭제도 「아니오」면 «안 지운다» — 돌려서 본다', () =>
  runHardDel(false).then(지운것 => {
    assert.equal(지운것.length, 0, '★ 묻지도 않고 영구삭제했다');
  }));

test('★ 「예」라고 해야 지운다 — 그때 휴지통 그 줄만 지운다', () =>
  runHardDel(true).then(지운것 => {
    assert.equal(지운것.join(','), 'pucards/trashDocs/kA_d1');
  }));

/* ── 누르기 전에 말한다 ── */

test('★★ 무엇이 치워지는지 «보여 주고» 묻는다', () => {
  const open = fnBody('openCoDupDocs');
  assert.match(open, /confirm\(/);
  assert.match(open, /최근» 것만 남기고/);
  assert.match(open, /사진첩의 원본 사진은 «그대로» 있습니다/);
  assert.match(open, /휴지통에서 되돌릴 수 있습니다/);
  /* 미리보기가 «묻기 앞»에 있어야 한다 */
  assert.ok(open.indexOf('const 미리') < open.indexOf('confirm('));
});

test('★ 겹치는 것이 없으면 조용히 알리고 끝낸다', () => {
  assert.match(fnBody('openCoDupDocs'), /if\(!n\.장\) return toast\(/);
});

/* ── 휴지통 ── */

test('★★ 서류 휴지통은 명함 휴지통과 «다른 자리»다 — 섞으면 화면이 깨진다', () => {
  const load = fnBody('loadTrashDocs');
  assert.match(load, /'\/trashDocs'/);
  assert.ok(!/DB_ROOT \+ '\/trash'/.test(load), '★ 명함 휴지통을 읽고 있다');
});

test('★ 휴지통을 «열 때» 한 번만 읽는다 — 늘 들고 있을 값이 아니다', () => {
  assert.match(fnBody('loadTrashDocs'), /once\('value'\)/);
  assert.ok(!/\.on\('value'\)/.test(fnBody('loadTrashDocs')), '살아 있는 구독을 걸면 계속 돈다');
  assert.match(fnBody('openTrash'), /if\(_trashDocs === null\)\{ loadTrashDocs\(\(\)=>openTrash\(\)\); return; \}/,
    '안 읽고 그리면 서류 칸이 늘 비어 보인다');
});

test('★ 정리·복원·영구삭제 뒤에는 받아 둔 것을 버린다 — 안 버리면 화면이 안 바뀐다', () => {
  ['openCoDupDocs', 'restoreTrashDoc', 'hardDelTrashDoc'].forEach(n=>{
    assert.match(fnBody(n), /trashDocsBust\(\)/, n + ' 이 받아 둔 것을 안 버린다');
  });
});

test('★ 휴지통 화면에 서류 칸이 «붙어» 있다 — 넣어 놓고 안 보여 주면 못 찾는다', () => {
  const open = fnBody('openTrash');
  assert.match(open, /const 서류 = trashDocsHtml\(\);/);
  assert.match(open, /\$\{rows\}\$\{서류\}/, '몸통에 안 넣었다');
});

test('★ 서류 칸은 되돌리기와 영구삭제를 «둘 다» 준다', () => {
  const h = fnBody('trashDocsHtml');
  assert.match(h, /restoreTrashDoc\(/);
  assert.match(h, /hardDelTrashDoc\(/);
  assert.match(h, /원본 사진은 그대로/, '사진이 지워진 줄 알면 안 된다');
});

test('★ 켜는 길이 «둘» 있다 — PC 설정과 폰 메뉴', () => {
  assert.match(SRC, /btn\('openCoDupDocs\(\)'/, 'PC 설정에 단추가 없다');
  assert.match(SRC, /openCoDupDocs\(\)">🧹 같은 서류 정리/, '폰 메뉴에 단추가 없다');
});
