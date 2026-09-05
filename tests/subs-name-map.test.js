'use strict';
// 부담당이 통째로 사라지던 것 — node --test tests/subs-name-map.test.js
//
// 2026-09-05 대표 보고: 사무장(A-001) 「내 업무」에 «부 0» — 부담당으로 하는 업무가
// 한 건도 안 나온다.
//
// 까닭: data/user_accounts 는 «재무 권한자만» 읽는 자리다(규칙 finOnly).
//   그런데 부담당은 «이름으로만» 옮겨진다:
//       subs = managerSubs.map(사번 → 이름).filter(있는 것만)
//   권한이 없으면 사번→이름 표가 통째로 비고, 그 줄에서 이름이 전부 걸러져
//   부담당이 사라진다.
//
// ⚠ 더 나쁜 것 — 그 빈 값이 그대로 저장되어, 권한 없는 사람이 앱을 한 번 여는 것만으로
//   «모두의 부담당이 지워졌다».
//
// 이 검사가 지키는 것
//   ① 못 읽으면 공개 명부(user_dir)로 되짚는다
//   ② 그래도 못 읽었으면 부담당을 «건드리지 않는다» (지우지 않는다)
//   ③ 읽어 냈으면 평소대로 맞춘다
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

const 명부 = [
  { sid:'P-003', name:'박한별' }, { sid:'P-004', name:'김혜민' }, { sid:'A-001', name:'최기운' }
];

function makeBox(opts){
  opts = opts || {};
  const read = [];
  const box = {
    console, Promise, String, Object, Array,
    _peU2N: null,
    _ls(){ return opts.ls || null; },
    _peArr(v){ return Array.isArray(v) ? v.filter(Boolean) : null; },
    fbDb: { ref(p){
      read.push(p);
      return { once(){
        if((opts.block || []).indexOf(p) >= 0) return Promise.reject(new Error('PERMISSION_DENIED'));
        return Promise.resolve({ val(){ return (opts.db || {})[p] || null; } });
      } };
    } }
  };
  vm.createContext(box);
  vm.runInContext(W.match(/var _peU2NKnown=false;/)[0] + '\n' + grab('peUsers')
    + '\nthis.users=peUsers;', box);
  box._read = read;
  return box;
}

/* ══════════════════════════════════════════════
   ① 공개 명부로 되짚는다
   ══════════════════════════════════════════════ */
test('재무 권한이 있으면 그대로 읽는다', async () => {
  const b = makeBox({ db:{ 'data/user_accounts/v':명부 } });
  const m = await b.users();
  assert.equal(m['A-001'], '최기운');
  assert.equal(b._peU2NKnown, true);
});

test('★ user_accounts 가 막히면 user_dir 로 되짚는다', async () => {
  const b = makeBox({ block:['data/user_accounts/v'], db:{ 'data/user_dir/v':명부 } });
  const m = await b.users();
  assert.equal(m['A-001'], '최기운', '사무장이 이름표를 못 받았다');
  assert.ok(b._read.indexOf('data/user_dir/v') >= 0);
  assert.equal(b._peU2NKnown, true);
});

test('빈 배열이 와도 되짚는다 — 권한은 있는데 자료가 없을 수 있다', async () => {
  const b = makeBox({ db:{ 'data/user_accounts/v':[], 'data/user_dir/v':명부 } });
  const m = await b.users();
  assert.equal(m['P-003'], '박한별');
});

test('열려 있으면 굳이 공개 명부를 안 읽는다 — 헛읽기를 늘리지 않는다', async () => {
  const b = makeBox({ db:{ 'data/user_accounts/v':명부 } });
  await b.users();
  assert.ok(b._read.indexOf('data/user_dir/v') < 0);
});

test('둘 다 못 읽으면 «모른다»로 남는다 — 빈 표를 아는 척하지 않는다', async () => {
  const b = makeBox({ block:['data/user_accounts/v', 'data/user_dir/v'] });
  const m = await b.users();
  assert.deepEqual(Object.keys(m), []);
  assert.equal(b._peU2NKnown, false);
});

test('이 기기에 이미 명부가 있으면 그것을 쓴다', async () => {
  const b = makeBox({ ls:명부 });
  const m = await b.users();
  assert.equal(m['P-004'], '김혜민');
  assert.equal(b._read.length, 0, '있는데도 서버를 읽었다');
});

test('이 기기 명부가 «비어» 있으면 그것을 믿지 않는다', async () => {
  const b = makeBox({ ls:[], db:{ 'data/user_accounts/v':명부 } });
  await b.users();
  assert.ok(b._read.length > 0, '빈 목록을 그대로 믿었다');
});

/* ══════════════════════════════════════════════
   ② 모르면 부담당을 안 건드린다
   ══════════════════════════════════════════════ */
const AUTO = grab('peAutoSync');

test('★★ 이름표를 못 읽었으면 부담당을 저장하지 않는다 — 모두의 부담당이 지워졌다', () => {
  assert.match(AUTO, /if\(_peU2NKnown && String\(m\.subs\|\|''\)!==nm\.subs\)/);
});

test('★ 안 건드렸으면 스냅샷도 옛것 그대로 둔다 — 다음 판에 또 견줄 수 있게', () => {
  assert.match(AUTO, /if\(!_peU2NKnown\) nm\.subs=String\(m\.subs\|\|''\);/);
});

test('주담당은 사번을 함께 들고 와 그 영향을 안 받는다', () => {
  // mgrSid 가 있어 이름표가 비어도 주담당은 살아남는다
  assert.match(AUTO, /var mSid=c\.mgrSid\|\|name2sid\[c\.mgr\]\|\|'',/);
  assert.match(grab('_peCandOf'), /mgrSid:x\.managerMain\|\|''/);
});

test('부담당은 이름으로만 옮겨진다 — 그래서 이름표가 비면 통째로 사라졌다', () => {
  const C = grab('_peCandOf');
  assert.match(C, /subs:\(x\.managerSubs\|\|\[\]\)\.map\(function\(sd\)\{return sid2name\[sd\]\|\|'';\}\)\.filter\(Boolean\)/);
});

/* ══════════════════════════════════════════════
   ③ 부담당도 「내 업무」에 나온다 (원래 규칙)
   ══════════════════════════════════════════════ */
test('내 업무는 주담당·부담당을 함께 본다', () => {
  const F = grab('isOf');
  assert.match(F, /mgr_subs\|\|\[\]\)\.some/);
  assert.match(F, /who\.sid&&s\.sid===who\.sid/);
  assert.match(F, /who\.name&&s\.name===who\.name/, '사번이 비어도 이름으로 맞춘다');
});

test('부담당 건수를 따로 센다 — 「부 N」', () => {
  // 주담당을 세고, 나머지가 부담당이다 (둘을 따로 세면 겹치거나 빠진다)
  assert.match(W, /var nMain=mine\.filter\(function\(it\)\{return roleOf\(it,viewer\(\)\)==='main';\}\)\.length;/);
  assert.match(W, /var nSub=mine\.length-nMain;/);
  assert.match(W, /부 '\+nSub\+'/);
});
