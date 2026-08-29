'use strict';
/* ══════ 「어느 회사에도 안 붙은 기업정보」를 «끝맺는다» (대표 지시 2026-08-29) ══════
   대표님: 「이거 정리 안 되나?」

   지금 이 알림은 «보여 주기만» 한다. 창을 열면
     「그 회사의 사업자등록증을 등록하면 저절로 이어 붙습니다」
   라고 적혀 있을 뿐 누를 것이 없다. 그래서 1건이 영영 남는다.
   알림은 «끝맺을 길»이 있어야 알림이다 — 없으면 눈이 그것을 배경으로 배운다.

   끝맺는 길은 둘이다.
     ① 쓸만한 정보다 → 그 안내문이 시키는 일을 대신 한다.
        읽어 둔 칸으로 사업자등록증을 만들면 열쇠가 같아져 «저절로» 붙는다.
     ② 지운 회사가 남긴 자국이다 → 버린다.
        ⚠ 휴지통에서 되살려도 폴더·탭이 안 돌아온다. 확인창이 그걸 말해야 한다.

   ⚠ 「이름이 같은 회사에 붙이기」는 «안 만든다». 사업자번호가 다른데 이름만 같은
     남의 회사에 대표자·소재지가 들어가면 되돌리기 어렵다 — 짚어만 준다. */
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
/* 최상위 const 는 vm 에서 «칸의 값이 되지 않는다» — var 로 바꿔 싣는다 */
function topConst(name) {
  /* 「const X =」와 「const X=」가 둘 다 쓰인다 — 한쪽만 보면 못 찾는다 */
  const at = SRC.search(new RegExp('const ' + name + '\\s*='));
  assert.ok(at >= 0, name + ' 을 찾지 못했다');
  let end = at, d = 0, started = false;
  for (let k = at; k < SRC.length; k++) {
    const c = SRC[k];
    if (c === '[' || c === '{') { d++; started = true; }
    else if (c === ']' || c === '}') { d--; if (started && !d) { end = k + 1; break; } }
    else if (c === ';' && !started) { end = k; break; }
    else if (c === '\n' && !started) { end = k; break; }
  }
  return SRC.slice(at, end).replace(/^const /, 'var ') + ';';
}

function box(coInfo) {
  const b = {
    _coInfo: coInfo || {},
    digits: v => String(v == null ? '' : v).replace(/\D/g, ''),
    _norm: s => String(s || '').replace(/주식회사|\(주\)|㈜/g, '').replace(/[\s.,()\-]/g, ''),
    uid: () => 'newid1',
    Date: { now: () => 1700000000000 }
  };
  vm.createContext(b);
  vm.runInContext(topConst('CO_FIELDS'), b);
  /* 등록증 서식도 «진짜»를 싣는다 — 대역을 쓰면 「등록증이 아는 칸만 옮긴다」가
     시험되지 않고, 서식이 늘어나도 검사가 따라오지 않는다 */
  vm.runInContext(topConst('BIZ_FIELDS'), b);
  vm.runInContext(topConst('coKeyOf'), b);
  vm.runInContext(fn('coOrphanAdoptPlan'), b);
  return b;
}
const plan = (b, key) => JSON.parse(JSON.stringify(vm.runInContext('coOrphanAdoptPlan(' + JSON.stringify(key) + ')', b)));

const REC = {
  company: '대성정밀', ceo: '김대성', address: '경기 안산시 …', bizType: '제조',
  bizItem: '금속가공', companyTel: '031-000-0000', folder: 'f1', tags: { a: true },
  docs: { d1: { id: 'p1', name: '사업자등록증' } }
};

/* ── ① 만들면 «저절로 붙어야» 한다 — 열쇠가 같아야 붙는다 ────────────── */
test('★ 만든 사업자등록증의 열쇠가 그 고아의 열쇠와 «같다»', () => {
  const b = box({ '3128144907': REC });
  const p = plan(b, '3128144907');
  assert.equal(p.ok, true, p.why || '');
  const k = vm.runInContext('coKeyOf(' + JSON.stringify(p.item) + ')', b);
  assert.equal(k, '3128144907',
    '★ 열쇠가 달라 만들어도 안 붙는다 — 알림은 그대로 남고 회사만 하나 늘어난다');
});

test('사업자번호는 rec 이 아니라 «열쇠»에서 온다', () => {
  /* 사진첩이 보낸 값에 bizno 칸이 비어 있을 수 있다. 열쇠가 곧 그 번호다 */
  const b = box({ '3128144907': { company: '대성정밀', ceo: '김대성' } });
  const p = plan(b, '3128144907');
  assert.equal(p.ok, true);
  assert.equal(b.digits(p.item.bizno), '3128144907');
});

test('이름열쇠(n…)면 상호로 만든다 — 번호를 지어내지 않는다', () => {
  const b = box({ 'n대성정밀': { company: '대성정밀', ceo: '김대성' } });
  const p = plan(b, 'n대성정밀');
  assert.equal(p.ok, true, p.why || '');
  assert.equal(p.item.bizno, '', '★ 없는 사업자번호를 지어냈다');
  const k = vm.runInContext('coKeyOf(' + JSON.stringify(p.item) + ')', b);
  assert.equal(k, 'n대성정밀', '열쇠가 달라 안 붙는다');
});

test('이름열쇠인데 상호마저 없으면 «거절한다»', () => {
  const b = box({ 'n': { ceo: '김대성' } });
  const p = plan(b, 'n');
  assert.equal(p.ok, false, '★ 이름도 번호도 없는데 회사를 만들면 유령이 는다');
  assert.ok(p.why && p.why.length > 3, '까닭이 없다');
});

/* ── ② 읽어 둔 칸만 옮긴다 — 지어내지 않는다 ─────────────────────────── */
test('★ 등록증이 아는 칸만 옮긴다 — 모르는 칸은 «두 목록에서» 골라 확인한다', () => {
  const b = box({});
  /* ⚠ 「폴더·탭·서류」만 보면 안 된다 — 그건 CO_FIELDS 에 아예 없어서, 거르개를
     통째로 없애도 검사가 통과한다(2026-08-29 고장 시험에서 실제로 샜다).
     기업정보 칸이면서 등록증 서식에는 «없는» 칸을 진짜 목록에서 뽑아 쓴다. */
  const known = {}; vm.runInContext('BIZ_FIELDS', b).forEach(f => { known[f[0]] = 1; });
  const unknown = vm.runInContext('CO_FIELDS', b).map(f => f[0]).filter(k => !known[k]);
  assert.ok(unknown.length, '등록증이 모르는 칸이 하나도 없다 — 검사가 헛돌고 있다');

  const rec = Object.assign({}, REC);
  unknown.forEach(k => { rec[k] = '값' + k; });
  const b2 = box({ '3128144907': rec });
  const p = plan(b2, '3128144907');

  assert.equal(p.item.ceo, '김대성');
  assert.equal(p.item.bizType, '제조');
  assert.equal(p.item.company, '대성정밀');
  unknown.forEach(k => {
    assert.equal(p.item[k], undefined,
      '★ 등록증에 없는 칸 「' + k + '」을 넣었다 — 서식에 없는 값은 화면에 안 나오고 자리만 먹는다');
  });
  ['folder', 'tags', 'docs'].forEach(k => {
    assert.equal(p.item[k], undefined,
      k + ' 을 등록증에 넣었다 — 그건 회사에 붙는 값이지 서류의 칸이 아니다');
  });
});

test('빈 칸은 «만들지 않는다» — 빈 글자로 덮으면 나중 값이 안 들어온다', () => {
  const b = box({ '3128144907': { company: '대성정밀', ceo: '' } });
  const p = plan(b, '3128144907');
  assert.ok(!('ceo' in p.item) || p.item.ceo === undefined,
    '빈 대표자를 넣었다');
});

test('만든 것은 사업자등록증이고 사진은 없다', () => {
  const b = box({ '3128144907': REC });
  const p = plan(b, '3128144907');
  assert.equal(p.item.kind, 'biz', '명함으로 만들면 회사 목록에 안 잡힌다');
  assert.equal(p.item.thumb, '', '없는 사진을 지어냈다');
  assert.ok(p.item.id, 'id 가 없다');
});

test('무엇이 옮겨지는지 «미리» 말한다 — 모르고 누르면 안 된다', () => {
  const b = box({ '3128144907': REC });
  const p = plan(b, '3128144907');
  assert.ok(Array.isArray(p.fields) && p.fields.length >= 4, '옮길 칸 목록이 없다');
  assert.ok(p.fields.join(' ').includes('대표자'),
    '칸 이름을 사람 말로 안 보여 준다');
});

/* ── ③ 버리기 ────────────────────────────────────────────────────────── */
test('★ 버리기는 그 열쇠 «하나»만 지운다', () => {
  const src = fn('coOrphanDrop');
  assert.ok(/coInfo\/'\s*\+\s*key\]\s*=\s*null|coInfo\/\$\{key\}'\]\s*=\s*null/.test(src.replace(/\s+/g, ' ')) ||
            /'coInfo\/' \+ key\] = null/.test(src),
    '지우는 자리가 「coInfo/{그 열쇠}」 하나가 아니다');
  assert.ok(!/coList\(\)|forEach/.test(src),
    '★ 여럿을 훑는다 — 한 건을 버리는 일에 목록을 훑으면 남의 것까지 지울 길이 열린다');
});

/* 실제로 돌려 본다. 「confirm( 이 소스에 있나」만 보면 `if(false && confirm(...))`
   같은 고장이 그대로 샌다 — 2026-08-29 고장 시험에서 실제로 샜다. */
function runDrop(answer) {
  const writes = [];
  let asked = '';
  const b = {
    _coInfo: { '3128144907': { company: '대성정밀' } },
    confirm: m => { asked = m; return answer; },
    toast: () => {}, coListBust: () => {}, renderCoAny: () => {},
    showPanel: () => {}, coOrphanHtml: () => '',
    DB_ROOT: 'pucards',
    Store: { db: { ref: () => ({ update: u => { writes.push(u); return Promise.resolve(); } }) } }
  };
  vm.createContext(b);
  vm.runInContext(fn('coOrphanDrop'), b);
  return vm.runInContext("coOrphanDrop('3128144907')", b).then(() => ({ writes, asked }));
}

test('★ 「아니오」를 누르면 «아무것도 안 지운다»', () => {
  return runDrop(false).then(r => {
    assert.equal(r.writes.length, 0, '★ 취소했는데 지웠다');
  });
});

test('★ 「예」를 누르면 그 열쇠 하나만 지운다', () => {
  return runDrop(true).then(r => {
    assert.equal(r.writes.length, 1, '쓰기가 한 번이 아니다');
    assert.deepEqual(Object.keys(r.writes[0]), ['coInfo/3128144907']);
    assert.equal(r.writes[0]['coInfo/3128144907'], null);
  });
});

test('★ 버리기 확인창이 «되살려도 안 돌아온다»고 말한다', () => {
  return runDrop(false).then(r => {
    assert.ok(/휴지통/.test(r.asked),
      '★ 휴지통에서 회사를 되살려도 폴더·탭이 안 돌아온다는 것을 안 말한다');
    assert.ok(/원본 사진은 지워지지 않습니다/.test(r.asked),
      '사진첩 원본은 그대로라는 것을 안 말한다 — 그게 제일 걱정되는 대목이다');
  });
});

test('버리기가 명함·등록증을 안 건드린다', () => {
  const src = fn('coOrphanDrop');
  assert.ok(!/Store\.put\(|Store\.del\(|\/items\//.test(src),
    '★ 기업정보를 버리랬더니 명함까지 만진다');
});

/* ── ④ 창에 단추가 있다 ──────────────────────────────────────────────── */
test('창에 「만들기」와 「버리기」가 둘 다 있다', () => {
  const src = fn('coOrphanHtml');
  assert.ok(/coOrphanAdopt\(/.test(src), '만들기 단추가 없다');
  assert.ok(/coOrphanDrop\(/.test(src), '버리기 단추가 없다');
});

test('「이름이 같은 회사에 붙이기」 단추는 «없다»', () => {
  const src = fn('coOrphanHtml');
  assert.ok(!/coOrphanMerge|coOrphanAttach/.test(src),
    '★ 이름만 같은 남의 회사에 대표자·소재지가 들어가면 되돌리기 어렵다 — 짚어만 준다');
  assert.ok(/이름이 같은 회사/.test(src), '짚어 주던 안내까지 사라졌다');
});
