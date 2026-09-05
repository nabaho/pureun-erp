'use strict';
// 재직자가 「(퇴직)」으로 뜨던 것 — node --test tests/work-retired-label.test.js
//
// 2026-09-05 대표 보고: 사무장(A-001)으로 들어가니 담당자 고르개에
// 재직자 여섯이 «전원 (퇴직)» 으로 떴다.
//
// 까닭: data/user_accounts 는 «재무 권한자만» 읽는 자리다(규칙 finOnly).
//   재무 권한이 없으면 명부가 통째로 비고, 목록에 남은 이름은 전부
//   「명부에 없는 사람 = 퇴직」으로 찍혔다.
//
// 이 검사가 지키는 것
//   ① 못 읽었으면 «아무 말도 안 한다» (모르는 것을 단정하지 않는다)
//   ② 공개 명부(user_dir)로 되짚는다 — 전 직원이 읽을 수 있는 자리다
//   ③ 명부를 못 읽었을 때 인수인계 화면이 재직자를 「명단에 없는 사람」으로 몰지 않는다
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const W = fs.readFileSync(path.join(__dirname, '..', 'work.html'), 'utf8').replace(/\r\n/g, '\n');

function grab(name){
  const i = W.indexOf('function ' + name + '(');
  assert.ok(i >= 0, '못 찾음: ' + name);
  let d = 0, j = i;
  for(;;j++){ if(W[j] === '{') d++; else if(W[j] === '}'){ d--; if(!d){ j++; break; } } }
  return W.slice(i, j);
}

/* 명부를 읽는 자리를 흉내 낸다 — 어느 길이 막히고 어느 길이 열리는지 골라 준다 */
function makeBox(opts){
  opts = opts || {};
  const read = [];
  const box = {
    console, Promise, String, Number, Array, Object, JSON,
    _staffCache: null, _allStaffCache: null,
    localStorage: { getItem(){ return opts.ls || null; } },
    fbDb: { ref(p){
      read.push(p);
      return { once(){
        if(opts.block && opts.block.indexOf(p) >= 0) return Promise.reject(new Error('PERMISSION_DENIED'));
        return Promise.resolve({ val(){ return (opts.db || {})[p] || null; } });
      } };
    } },
    _items: opts.items || {},
    openItems(){ return Object.keys(box._items).map(function(k){
      var it = box._items[k]; it._id = k; return it; }); }
  };
  box.window = box;
  vm.createContext(box);
  vm.runInContext(
    grab('_normStaff') + '\n' + grab('_normAll') + '\n'
    + W.match(/var _staffKnown=false;/)[0] + '\n'
    + grab('loadStaff') + '\n' + grab('ownerOptions') + '\n'
    + 'this.load=loadStaff; this.opts=ownerOptions;', box);
  box._read = read;
  return box;
}

const 명부 = [
  { sid:'P-001', name:'권형하', status:'active', title:'대표노무사', sortOrder:1 },
  { sid:'P-004', name:'김혜민', status:'active', sortOrder:2 },
  { sid:'A-001', name:'최기운', status:'active', sortOrder:9 },
  { sid:'P-006', name:'임혜미', status:'retired', sortOrder:5 }
];
const 업무 = {
  W1:{ mgr_main:{ sid:'P-001', name:'권형하' } },
  W2:{ mgr_main:{ sid:'P-004', name:'김혜민' } },
  W3:{ mgr_main:{ sid:'P-006', name:'임혜미' } }        // 진짜 퇴직자
};

/* ══════════════════════════════════════════════════
   ① 명부를 읽었을 때 — 있는 그대로
   ══════════════════════════════════════════════════ */
test('명부를 읽으면 재직자에게는 아무 말도 안 붙는다', async () => {
  const b = makeBox({ db:{ 'data/user_accounts/v':명부 }, items:업무 });
  await b.load();
  const o = {}; Array.from(b.opts()).forEach(u => { o[u.name] = u.active; });
  assert.equal(o['권형하'], 1);
  assert.equal(o['김혜민'], 1);
  assert.equal(o['최기운'], 1);
});

test('진짜 퇴직자만 0(=퇴직)이다', async () => {
  const b = makeBox({ db:{ 'data/user_accounts/v':명부 }, items:업무 });
  await b.load();
  const 임 = Array.from(b.opts()).filter(u => u.name === '임혜미')[0];
  assert.ok(임, '업무를 갖고 있으니 목록에는 남아야 한다');
  assert.equal(임.active, 0);
});

/* ══════════════════════════════════════════════════
   ② 재무 권한이 없을 때 — 공개 명부로 되짚는다
   ══════════════════════════════════════════════════ */
test('★ user_accounts 가 막히면 user_dir 로 되짚는다', async () => {
  const b = makeBox({
    block:['data/user_accounts/v'],
    db:{ 'data/user_dir/v':명부 },
    items:업무
  });
  await b.load();
  assert.ok(b._read.indexOf('data/user_dir/v') >= 0, '공개 명부를 안 봤다');
  const o = {}; Array.from(b.opts()).forEach(u => { o[u.name] = u.active; });
  assert.equal(o['권형하'], 1, '재직자인데 퇴직으로 찍혔다');
  assert.equal(o['김혜민'], 1);
});

test('되짚어 읽었을 때도 진짜 퇴직자는 가려낸다', async () => {
  const b = makeBox({ block:['data/user_accounts/v'], db:{ 'data/user_dir/v':명부 }, items:업무 });
  await b.load();
  assert.equal(Array.from(b.opts()).filter(u => u.name === '임혜미')[0].active, 0);
});

test('user_accounts 가 열려 있으면 굳이 user_dir 을 안 읽는다 — 헛읽기를 늘리지 않는다', async () => {
  const b = makeBox({ db:{ 'data/user_accounts/v':명부 }, items:업무 });
  await b.load();
  assert.ok(b._read.indexOf('data/user_dir/v') < 0);
});

/* ══════════════════════════════════════════════════
   ③ 둘 다 못 읽었을 때 — 아무 말도 안 한다
   ══════════════════════════════════════════════════ */
test('★★ 명부를 못 읽으면 아무도 「퇴직」이라 부르지 않는다', async () => {
  const b = makeBox({
    block:['data/user_accounts/v', 'data/user_dir/v'],
    items:업무
  });
  await b.load();
  const list = Array.from(b.opts());
  assert.equal(list.length, 3, '이름은 그대로 보여야 한다 — 고를 수는 있어야 한다');
  list.forEach(u => assert.equal(u.active, null,
    u.name + ' 을 퇴직/재직으로 단정했다 — 모르면 null 이어야 한다'));
});

test('명부가 비어서 와도(권한은 있는데 자료가 없음) 단정하지 않는다', async () => {
  const b = makeBox({ db:{ 'data/user_accounts/v':[], 'data/user_dir/v':[] }, items:업무 });
  await b.load();
  Array.from(b.opts()).forEach(u => assert.equal(u.active, null));
});

test('못 읽어도 화면은 돈다 — 빈손이라도 돌려준다', async () => {
  const b = makeBox({ block:['data/user_accounts/v', 'data/user_dir/v'] });
  const r = await b.load();
  assert.ok(r, '빈 배열이라도 돌려줘야 부르는 쪽이 안 멈춘다');
  assert.equal(Array.from(r).length, 0);
});

/* ══════════════════════════════════════════════════
   ④ 화면에서
   ══════════════════════════════════════════════════ */
/* ★ 2026-09-05 — 「내 업무」의 담당자 고르개가 없어졌다(남의 업무를 볼 수 없게).
   그래서 (퇴직) 딱지를 «화면에 그리는 자리»도 함께 사라졌다.
   그래도 ownerOptions() 는 「사람인가」를 가리는 데 여전히 쓰이므로,
   재직/퇴직/모름 세 갈래는 위 검사들이 그대로 지킨다. */
test('남을 고르는 드롭다운이 없다 — (퇴직) 딱지를 그리던 자리도 함께 사라졌다', () => {
  assert.ok(W.indexOf("(u.active?'':' (퇴직)')") < 0, '옛 판정이 남아 있다');
  assert.ok(W.indexOf("u.active===0?' (퇴직)':''") < 0, '고르개가 아직 있다');
  assert.ok(W.indexOf('setView(') < 0, '남을 골라 보는 길이 아직 있다');
});

test('★ 명부를 못 읽었으면 인수인계 화면이 재직자를 「명단에 없는 사람」으로 몰지 않는다', () => {
  const R = grab('renderHo');
  assert.match(R, /if\(!_staffKnown\)\{/);
  assert.match(R, /재직자 명단을 읽지 못했습니다/);
  assert.match(R, /고장이 아닙니다/, '왜 비었는지 말해 준다');
});

test('부담당 쪽도 같은 잣대를 쓴다', () => {
  assert.match(grab('renderHo'), /var osub=_staffKnown\?orphanSubs\(st\):\[\];/);
});

test('명부를 «정말로» 읽어냈을 때만 안다고 표시한다', () => {
  const L = grab('loadStaff');
  assert.match(L, /_staffKnown=true/);
  // 못 읽은 길에서는 참으로 바꾸지 않는다
  const 실패 = L.slice(L.indexOf('if(!_staffCache)'));
  assert.ok(실패.indexOf('_staffKnown=true') < 0);
});
