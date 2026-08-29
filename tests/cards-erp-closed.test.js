'use strict';
/* 계약이 끝난 업체를 명함·사업자에서도 알아본다 (대표 지시 2026-08-29)
   ═══════════════════════════════════════════════════════════════════════════
   대표 지시: 「이알피에서 업무계약이 종료되는 경우 기업정보함에 사업자나 명함
   기업상세에도 모두 계약종료로 분류해서 종료 분류함으로 정리될 수 있을까」

   ■ 조사해서 안 것 — «반만» 되고 있었다
     · 기업 상세 : 🚪 종료 딱지 + 거르개가 자동으로 붙는다 (이미 됨)
     · 명함·사업자 : 폴더로 옮기는 코드는 있는데 셋이 어긋나 있었다 —
       ① 대표님 폴더를 못 알아본다. 코드는 이름이 «업체퇴사»인 폴더를 찾는데,
          대표님 것은 「2.업체종료 및 퇴사」라 앞 번호를 떼도 «업체종료및퇴사» 다.
          그래서 계약이 끝나면 «업체퇴사»라는 폴더를 따로 만들어 그리로 보냈다 —
          종료 업체가 두 폴더로 갈렸다.
       ② 손으로 넣은 명함은 영영 안 옮겨진다(폴더가 «비어 있을 때만» 자동 배정한다).
       ③ 「종료업체 명함 정리」 도구가 명함만 본다 — 사업자등록증은 아예 빠져 있었다.
          게다가 한 장마다 Store.put 을 불렀다 — 2026-08-16 에 5,000건 오류를 낸
          그 패턴이다(autoFolder 는 「모아서 한 번에」로 고쳐졌는데 이것만 남아 있었다).

   ■ 어떻게 했나 — 기업 상세가 이미 옳게 고른 방식을 그대로
     폴더로 «옮기지 않고» ERP 값을 읽어 «표시»한다. 새 쓰기가 0이고, ERP 에서 상태가
     바뀌면 다음에 열 때 저절로 맞는다. 대표님이 손으로 만든 폴더도 안 건드린다.
     폴더로 옮기는 것은 «누를 때만» 도는 도구로 남기되 위 셋을 고쳤다.

   ★ 여기서 못 박는 것
     ① 종료 업체의 명함·사업자에 🚪 딱지가 붙는다
     ② 「🚪 종료」로 골라 볼 수 있다 — 명함과 사업자 «둘 다»
     ③ 거르는 일은 한 곳(listItems)에서 한다
     ④ 정리 도구가 사업자도 본다
     ⑤ 정리 도구가 «모아서» 쓴다 — 한 장씩이면 2026-08-16 이 되풀이된다
     ⑥ 갈 폴더의 «이름»을 물어볼 때 보여 준다 — 어디로 가는지 모르고 누르면 안 된다
   실행: node --test tests/cards-erp-closed.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'pu-cards.html'), 'utf8').replace(/\r\n/g, '\n');

function fnBody(name){
  let i = src.indexOf('\nfunction ' + name + '(');
  if (i < 0) i = src.indexOf('\nasync function ' + name + '(');
  assert.ok(i >= 0, name + ' 를 찾을 수 없습니다');
  const open = src.indexOf('{', i);
  let d = 0;
  for (let k = open; k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (!d) return src.slice(i, k + 1); }
  }
  assert.fail(name + ' 의 끝을 찾을 수 없습니다');
}

/* ══════ ①② 딱지와 거르개 ══════ */

test('★ 계약이 끝난 업체의 명함·사업자만 골라 볼 수 있다', () => {
  /* ⚠ 소스에 글자가 있나만 보면 지워도 통과한다 — «걸러 보고» 확인한다 */
  /* ⚠ 인자가 아니라 «그 함수»를 찾는다. 2026-08-29 에 listItems 가 갈래를 받게 되자
     'function listItems()' 로 찾던 검사 셋이 한꺼번에 못 찾았다 — 기능은 멀쩡했다
     (CLAUDE.md 「지금 값이 아니라 규칙」). */
  const at = src.indexOf('function listItems(');
  const open = src.indexOf('{', at);
  let d = 0, end = -1;
  for (let k = open; k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (!d) { end = k + 1; break; } }
  }
  const body = src.slice(open + 1, end - 1);
  const a = body.indexOf('if (state.onlyPhone');
  const b = body.indexOf('if (state.onlyPrivate');
  assert.ok(a > 0 && b > a, '조건 거르개 대목을 찾지 못했습니다');
  const ctx = { console, Object, Array, String,
    ErpMatch: { leftOfCard: () => false,
                match: it => it && it.__erp ? it.__erp : null } };
  vm.createContext(ctx);
  vm.runInContext('var state = {}; var keep = function(it){ ' + body.slice(a, b)
    + ' return true; };', ctx);

  const 목록 = [
    { id:'a', kind:'card', __erp:{ left:true } },      /* 끝난 업체의 명함 */
    { id:'b', kind:'biz',  __erp:{ left:true } },      /* 끝난 업체의 등록증 */
    { id:'c', kind:'card', __erp:{ left:false } },     /* 계약 중 */
    { id:'d', kind:'card' }                            /* 업체관리에 없음 */
  ];
  ctx.state.onlyClosed = true;
  assert.deepEqual(목록.filter(ctx.keep).map(x => x.id), ['a','b'],
    '★ 명함과 사업자 «둘 다» 나와야 한다 — 한쪽만이면 반만 정리된다');
  ctx.state.onlyClosed = false;
  assert.equal(목록.filter(ctx.keep).length, 4, '꺼져 있으면 전부 보인다');
});

test('★ 업체관리에 «없는» 곳은 종료가 아니다 — 정보가 없을 뿐이다', () => {
  const at = src.indexOf('function listItems(');
  const open = src.indexOf('{', at);
  let d = 0, end = -1;
  for (let k = open; k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (!d) { end = k + 1; break; } }
  }
  const body = src.slice(open + 1, end - 1);
  const a = body.indexOf('if (state.onlyPhone');
  const b = body.indexOf('if (state.onlyPrivate');
  const ctx = { console, Object, Array, String,
    ErpMatch: { leftOfCard: () => false, match: () => null } };
  vm.createContext(ctx);
  vm.runInContext('var state = { onlyClosed:true }; var keep = function(it){ '
    + body.slice(a, b) + ' return true; };', ctx);
  assert.equal([{ id:'x' }].filter(ctx.keep).length, 0);
});

test('거르는 일은 listItems 한 곳에만 둔다 — 딴 곳에서 거르면 어긋난다', () => {
  assert.match(fnBody('listItems'), /state\.onlyClosed/);
});

test('목록 줄의 🚪 딱지는 «이미 있다» — 새로 만들지 않는다', () => {
  /* ⚠ 조사해 보니 명함·사업자 표 줄에는 2026-08-11 부터 이 딱지가 있었다.
     없는 줄 알고 또 만들면 같은 것이 두 벌이 된다. 이 검사는 «그대로 있는지»만 지킨다.
     ⚠ 「퇴사」가 아니라 「계약해지」다 — 이 딱지는 «업체»의 상태다. 명함 줄에 「퇴사」라고
       적으면 그 사람이 회사를 나간 것으로 읽힌다(그건 따로 있다: ErpMatch.leftOfCard). */
  assert.match(src, /if \(_m && _m\.left\) h \+= `<span class="mgq"/,
    '★ 딱지가 없어지면 그 회사가 끝난 줄 모르고 그냥 지나친다');
  assert.match(src, /계약해지/, '딱지 말풍선이 «업체» 상태임을 말해야 한다');
});

test('첫 값은 «꺼짐»이다 — 켜진 채로 시작하면 명함이 사라진 줄 안다', () => {
  /* ⚠ 첫 값을 두는 자리가 넷이다(기본 state·저장한 조건 되돌리기 등). 하나만 보면
     나머지가 켜져 있어도 통과한다 — «모두» 꺼져 있는지 본다. */
  const all = src.match(/onlyClosed\s*:\s*(true|false)/g) || [];
  assert.ok(all.length >= 2, 'state 에 onlyClosed 첫 값이 없다 (' + all.length + '곳)');
  all.forEach(function (m) {
    assert.match(m, /false/, '★ 어느 한 곳이라도 켜져 있으면 그 길로 들어올 때 명함이 사라진다');
  });
});

/* ══════ ④⑤⑥ 정리 도구 ══════ */

test('★ 정리 도구가 사업자등록증도 본다 — 반만 정리되면 안 된다', () => {
  /* ⚠ 「card 만 본다」를 막는 것으로는 모자랐다 — 「biz 를 뺀다」로 뒤집어도 통과했다
     (2026-08-29 고장넣기에서 실제로 샜다). 고를 때 «종류를 아예 안 본다»를 못 박는다.
     ⚠ 옮길 «곳»을 고를 때는 종류를 봐야 한다(명함 폴더·사업자 폴더가 따로다) —
       그래서 «고르는 대목»만 떼어 본다. */
  const fn = fnBody('openErpClosedTidy');
  const a = fn.indexOf('const closed');
  const b = fn.indexOf('});', a);
  assert.ok(a > 0 && b > a, '종료 업체를 고르는 대목을 찾지 못했습니다');
  const pick = fn.slice(a, b);
  assert.equal(/\bkind\b/.test(pick), false,
    '★ 고를 때 종류를 보면 한쪽이 빠진다 — 끝난 업체의 등록증이 그대로 남는다');
  assert.match(pick, /m\.left/, '종료 여부로 골라야 한다');
});

test('★ 정리 도구가 «모아서» 쓴다 — 한 장씩이면 2026-08-16 이 되풀이된다', () => {
  const fn = fnBody('openErpClosedTidy');
  assert.equal(/Store\.put\(/.test(fn), false,
    '★ 명함 한 장마다 Store.put 을 부르면 그 한 번이 서버 메시지 «세 개»다');
  assert.match(fn, /autoFolderFlush\(|flushPlan\(/,
    '이미 있는 「모아서 한 번에」를 그대로 쓴다');
});

test('★ 갈 폴더의 «이름»을 물어볼 때 보여 준다 — 어디로 가는지 모르고 누르면 안 된다', () => {
  const fn = fnBody('openErpClosedTidy');
  /* 확인창이 «폴더 이름을 담은 값»을 끼워 넣어야 한다. 이름을 글자로 박아 두면
     대표님이 만든 폴더가 여럿일 때 엉뚱한 곳을 말하게 된다. */
  const at = fn.indexOf('confirm(');
  const q = fn.slice(at, fn.indexOf('))', at));
  const names = (q.match(/\$\{([^}]+)\}/g) || []).map(x => x.slice(2, -1));
  assert.ok(names.length > 0, '★ 확인창이 아무 값도 안 끼워 넣는다');
  const 이름값 = names.find(v => /갈곳|dest|folder|폴더/.test(v));
  assert.ok(이름값, '★ 어디로 옮기는지 «이름»으로 말해야 한다 — 모르고 누르면 안 된다');
  /* 그 값이 정말 폴더 이름에서 온 것인지 */
  assert.match(fn, new RegExp(이름값.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*=[\\s\\S]{0,200}?\\.name'),
    '★ 이름처럼 보이는 값이 실은 폴더 이름이 아니면 거짓말이 된다');
});

test('★ 이미 있는 종료 폴더를 «먼저» 찾는다 — 새로 만들면 두 곳으로 갈린다', () => {
  const fn = fnBody('erpClosedFolderOf');
  assert.match(fn, /_canon/, '이름을 다듬어 견줘야 「2.업체종료 및 퇴사」가 걸린다');
});

/* ══════ 종료 폴더 고르기 — 실제로 돌려 본다 ══════ */

function pickFolder(groups, kind){
  const ctx = { console, Object, Array, String,
    _canon: s => String(s||'').replace(/^\s*\d+\s*[.)\-]?\s*/,'').replace(/\s/g,''),
    state: { groups: groups } };
  vm.createContext(ctx);
  vm.runInContext(fnBody('erpClosedFolderOf'), ctx);
  return ctx.erpClosedFolderOf(kind || 'card');
}

test('★ 대표님의 「2.업체종료 및 퇴사」를 알아본다', () => {
  const g = pickFolder({ g1:{ id:'g1', name:'2.업체종료 및 퇴사', kind:'card' } });
  assert.ok(g, '★ 못 알아보면 새 폴더를 만들어 종료 업체가 두 곳으로 갈린다');
  assert.equal(g.id, 'g1');
});

test('예전 이름(업체퇴사)도 그대로 알아본다', () => {
  const g = pickFolder({ g1:{ id:'g1', name:'업체퇴사', kind:'card' } });
  assert.equal(g && g.id, 'g1');
});

test('★ 명함용과 사업자용을 가른다 — 이름이 같아도 섞이면 안 된다', () => {
  const gs = { g1:{ id:'g1', name:'업체퇴사', kind:'card' },
               g2:{ id:'g2', name:'업체퇴사', kind:'biz' } };
  assert.equal(pickFolder(gs, 'card').id, 'g1');
  assert.equal(pickFolder(gs, 'biz').id, 'g2');
});

test('종료와 상관없는 폴더는 안 고른다', () => {
  const gs = { g1:{ id:'g1', name:'1. 업체관리', kind:'card' },
               g2:{ id:'g2', name:'노무사', kind:'card' } };
  assert.equal(pickFolder(gs), null,
    '★ 엉뚱한 폴더로 옮기면 대표님이 정리해 둔 것이 뒤섞인다');
});

test('없으면 null 을 준다 — 부르는 쪽이 만들지 말지 정한다', () => {
  assert.equal(pickFolder({}), null);
  assert.equal(pickFolder(null), null);
});
