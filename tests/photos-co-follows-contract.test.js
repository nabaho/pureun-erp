'use strict';
/* 업체는 계약이 만든다 — 사진첩은 값만 흘려 넣는다 (대표 결정 2026-08-23)

   "업체 만들기로 하는 것보다는, 푸른이알피 계약관리에서 계약을 선택할 경우
    거기에 따라 자동으로 이동하게 만드는 게 좋을 것 같다."

   조사하다 «길이 아예 막혀 있는 것»을 찾았다: 「업체관리로 보내기」 단추가 나오는
   조건이 `한 번도 보낸 적 없을 때` 였다. 업체가 없어서 한 번 실패하면 보낸 기록
   (filedCo.at)이 남아 단추가 영영 사라져, 계약관리에서 업체를 나중에 만들어도
   사진의 값이 들어갈 길이 없었다. 실데이터 152장이 그렇게 멈춰 있었다.

   고친 것 셋:
   ① canSendCo — 업체가 없어서 못 넣은 것은 «다시 보낼 수 있다»
   ② coTodo    — 「업체가 아직 없다」는 기다림이지 할 일이 아니다(사진첩에서 할
                 수 있는 일이 없다). 「아직 안 보냈다」는 그대로 할 일이다.
   ③ coSweep   — 열 때 한 번, 업체 목록을 «한 번만» 읽어 생긴 업체를 채운다.

   실행: node --test tests/*.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const R = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(R, 'pu-photos.html'), 'utf8');
const store = fs.readFileSync(path.join(R, 'js', 'pu-doc-file.js'), 'utf8');

function fnOf(src, name) {
  const i = src.indexOf('function ' + name + '(');
  assert.ok(i >= 0, name + ' 를 찾지 못했습니다');
  let d = 0;
  for (let k = src.indexOf('{', i); k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (!d) return src.slice(i, k + 1); }
  }
  throw new Error(name + ' 의 끝을 찾지 못했습니다');
}
function objOf(name) {
  const m = app.match(new RegExp('^const ' + name + ' = \\{[^}]*\\};', 'm'));
  assert.ok(m, name + ' 를 찾지 못했습니다');
  return m[0];
}

/* 판정 함수들을 실제로 돌린다 */
const J = (function () {
  const src = objOf('CO_KINDS') + '\n' + fnOf(app, 'canSendCo') + '\n' +
    fnOf(app, 'coFilledOk') + '\n' + fnOf(app, 'coTodo');
  const c = { Boolean, Object, String };
  vm.createContext(c); vm.runInContext(src, c);
  return c;
})();

const R_NEW  = { kind: 'bizreg', auto: true };                                   // 아직 안 보냄
const R_WAIT = { kind: 'bizreg', auto: true, filedCo: { at: 1, found: false } };  // 업체가 없다
const R_DONE = { kind: 'bizreg', auto: true, filedCo: { at: 1, found: true, filled: ['주소'] } };
const R_FULL = { kind: 'bizreg', auto: true, filedCo: { at: 1, found: true } };   // 이미 다 차 있었다

/* ══════ ① 다시 보낼 수 있다 ══════ */

test('★ 업체가 없어서 못 넣은 것은 다시 보낼 수 있다 — 152장이 막혀 있던 이유', () => {
  assert.equal(J.canSendCo(R_WAIT), true,
    '★ 여기가 false 면 계약관리에서 업체를 만들어도 값이 들어갈 길이 없습니다');
});

test('아직 안 보낸 것도 보낼 수 있다', () => {
  assert.equal(J.canSendCo(R_NEW), true);
});

test('이미 넣은 것은 다시 안 보낸다 — 다 된 일에 단추를 두면 남은 일이 흐려진다', () => {
  assert.equal(J.canSendCo(R_DONE), false);
  assert.equal(J.canSendCo(R_FULL), false);
});

test('판독 실패·다른 갈래에는 단추가 없다', () => {
  assert.equal(J.canSendCo({ kind: 'bizreg', error: '실패' }), false);
  assert.equal(J.canSendCo({ kind: 'card' }), false, '명함은 업체관리로 가지 않습니다');
  assert.equal(J.canSendCo(null), false);
});

test('★ 화면에도 그 단추를 그린다 — 판정만 고치고 안 그리면 아무것도 안 바뀐다', () => {
  const fn = fnOf(app, 'renderReadPanel');
  assert.match(fn, /!coFilledOk\(read\) && canSendCo\(read\)/,
    '★ 업체를 기다리는 사진에 다시 보내는 단추가 없습니다');
});

/* ══════ ② 기다림은 할 일이 아니다 ══════ */

test('★ 「업체가 아직 없다」는 할 일이 아니다 — 사진첩에서 할 수 있는 일이 없다', () => {
  assert.equal(J.coTodo(R_WAIT), false,
    '★ 치울 수 없는 할 일이 목록을 못 믿게 합니다 (실데이터 152장)');
});

test('★ 「아직 안 보냈다」는 그대로 할 일이다 — 누르면 끝난다', () => {
  assert.equal(J.coTodo(R_NEW), true,
    '★ 중소기업확인서는 기업정보함에 안 가므로, 이걸 놓치면 아무 곳에도 안 들어갑니다');
});

test('넣은 것·이미 차 있던 것은 할 일이 아니다', () => {
  assert.equal(J.coTodo(R_DONE), false);
  assert.equal(J.coTodo(R_FULL), false);
});

test('★ needsCheck 와 checkWhy 가 같은 조건(coTodo)을 쓴다', () => {
  assert.match(fnOf(app, 'needsCheck'), /if \(coTodo\(r\)\) return true;/);
  assert.match(fnOf(app, 'checkWhy'), /if \(coTodo\(r\)\) return '업체관리로 아직 안 보냄/);
});

/* ══════ ③ 한 번만 읽는다 ══════ */

/* ── 저장 층을 «실제로 돌려» 읽기·쓰기 횟수를 센다 ──
   글자 모양만 보면 못 잡는다: companyIndex 를 한 번만 «적어» 두고도 장마다 부를
   수 있고, 쓰기를 없애도 다른 낱말이 남아 정규식이 통과한다(실제로 되돌림 시험에서
   셋이 살아남았다). 비용이 이 작업의 전부이므로 «횟수»를 못박는다. */
function loadStore(companies) {
  const calls = { reads: 0, writes: 0, lastWrite: null };
  const sandbox = {
    window: {}, console: { log() {}, warn() {} },
    Date, Promise, Object, String, Number, Math, JSON, Array,
    setTimeout, clearTimeout
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  new vm.Script(store, { filename: 'pu-doc-file.js' }).runInContext(sandbox);
  /* 판독 층은 값 옮기기(mapTo)만 쓴다 — 넣은 것을 그대로 돌려주는 가짜로 둔다. */
  sandbox.window.PuDocRead = { mapTo: function (to, kind, f) {
    return { name: f.company || '', ceo: f.ceo || '', address: f.address || '', bizNo: f.bizno || '' };
  } };
  const S = sandbox.window.PuDocFile;
  S.init({
    db: {
      ref: function (p) {
        return {
          once: function () {
            calls.reads++;
            return Promise.resolve({ val: function () { return { v: companies }; } });
          },
          update: function (u) { calls.writes++; calls.lastWrite = u; return Promise.resolve(); }
        };
      }
    }
  });
  return { S, calls };
}

const CO_HAS = { k1: { id: 'co-1', name: '가나', bizNo: '123-45-67890' } };

test('★ 여러 장이어도 «한 번만» 읽고 «한 번만» 쓴다 — 152번 내려받으면 못 쓴다', async () => {
  const { S, calls } = loadStore(CO_HAS);
  const one = { kind: 'bizreg', byName: '나', fields: { bizno: '1234567890', company: '가나', ceo: '홍길동' } };
  const res = await S.sendToCompanyMany([one, one, one, one, one]);
  assert.equal(calls.reads, 1, '★ 업체 목록을 ' + calls.reads + '번 내려받았습니다 — 한 번이어야 합니다');
  assert.equal(calls.writes, 1, '★ 쓰기를 ' + calls.writes + '번 했습니다 — 한 번에 모아야 합니다');
  assert.equal(res.length, 5, '장마다 결과를 돌려줘야 저마다 기록을 갱신할 수 있습니다');
  assert.equal(res[0].found, true);
  assert.ok((res[0].filled || []).length, '빈 칸을 채웠어야 합니다');
});

test('★ 채울 것이 하나도 없으면 쓰지도 않는다 — 빈 쓰기는 남의 화면만 흔든다', async () => {
  /* 이미 다 들어 있는 업체 */
  const { S, calls } = loadStore({ k1: { id: 'co-1', name: '가나', bizNo: '123-45-67890',
    ceo: '홍길동', address: '어디' } });
  const res = await S.sendToCompanyMany([{ kind: 'bizreg',
    fields: { bizno: '1234567890', company: '가나', ceo: '홍길동', address: '어디' } }]);
  assert.equal(calls.reads, 1);
  assert.equal(calls.writes, 0, '★ 쓸 것이 없는데 썼습니다');
  assert.equal(res[0].found, true);
  /* ⚠ vm 안에서 만든 배열은 이 쪽 Array 와 «다른 realm» 이라 deepEqual 이 안 된다
     (같은 모양인데 not reference-equal 로 운다). 길이로 본다. */
  assert.equal((res[0].filled || []).length, 0);
});

test('★ 기다리는 사진이 없으면 아예 안 읽는다 — 안 읽으면 돈이 안 나간다', async () => {
  const { S, calls } = loadStore(CO_HAS);
  assert.equal((await S.sendToCompanyMany([])).length, 0);
  assert.equal(calls.reads, 0, '★ 빈 목록인데 업체를 내려받았습니다');
  /* 사업자번호를 못 읽은 것만 있으면 찾아볼 것이 없다 */
  const res = await S.sendToCompanyMany([{ kind: 'bizreg', fields: { company: '가나' } }]);
  assert.equal(calls.reads, 0, '★ 찾을 열쇠가 없는데 업체 목록을 내려받았습니다');
  assert.equal(res[0].found, false);
  assert.match(res[0].message, /사업자번호를 읽지 못해/);
});

test('★ 업체가 아직 없으면 만들지 않고 «기다린다» — 갈래는 계약이 정한다', async () => {
  const { S, calls } = loadStore({});
  const res = await S.sendToCompanyMany([{ kind: 'bizreg',
    fields: { bizno: '1234567890', company: '가나' } }]);
  assert.equal(calls.reads, 1);
  assert.equal(calls.writes, 0, '★ 업체를 만들어 버렸습니다 — 갈래를 짐작하게 됩니다');
  assert.equal(res[0].found, false);
  assert.match(res[0].message, /계약이 만들어지면 저절로 들어갑니다/);
});

test('★ 업체가 생긴 뒤에는 같은 사진이 채워진다 — 이것이 「자동으로 이동」이다', async () => {
  /* 같은 사진을 두 번: 업체가 없을 때 → 생긴 뒤 */
  const photo = { kind: 'bizreg', fields: { bizno: '1234567890', company: '가나', ceo: '홍길동' } };
  const before = await loadStore({}).S.sendToCompanyMany([photo]);
  assert.equal(before[0].found, false);
  const after = await loadStore(CO_HAS).S.sendToCompanyMany([photo]);
  assert.equal(after[0].found, true, '★ 업체가 생겼는데도 안 채워집니다');
  assert.ok((after[0].filled || []).indexOf('대표자') >= 0, '읽어 둔 대표자가 안 들어갔습니다');
});

test('한 장 길도 같은 결과다 — 길이 둘이면 한쪽만 고쳐진다', async () => {
  const { S, calls } = loadStore(CO_HAS);
  const r = await S.sendToCompany({ kind: 'bizreg',
    fields: { bizno: '1234567890', company: '가나', ceo: '홍길동' } });
  assert.equal(calls.reads, 1);
  assert.equal(r.found, true);
});

test('사업자등록증·중소기업확인서만 받는다', async () => {
  const { S } = loadStore(CO_HAS);
  await assert.rejects(function () { return S.sendToCompanyMany([{ kind: 'card', fields: {} }]); },
    /사업자등록증과 중소기업확인서만/);
});

test('★ 한 장 길과 여러 장 길이 같은 코드다 — 둘이면 한쪽만 고쳐진다', () => {
  const one = fnOf(store, 'sendToCompany');
  assert.match(one, /sendToCompanyMany\(\[o \|\| \{\}\]\)/,
    '★ 한 장 길이 따로 있으면 여기만 옛 동작으로 남습니다');
});

test('★ 사진첩은 한 번 열 때 한 번만 맞춰 본다 — 격자를 그릴 때마다 하면 안 된다', () => {
  const fn = fnOf(app, 'coSweep');
  assert.match(fn, /if \(_coSweptOnce\) return/, '★ 되풀이하면 같은 목록을 계속 내려받습니다');
  assert.match(fn, /if \(!wait\.length\)/, '기다리는 것이 없는데 부릅니다');
  assert.match(fn, /sendToCompanyMany/, '한 번 읽는 길을 안 씁니다');
  /* ⚠ photoOwner 는 이 함수에 두 번 나온다(보낼 값에 한 번, 저장할 때 한 번).
     「어딘가에 있나」로 보면 저장 쪽을 지워도 통과한다(되돌림 시험에서 살아남았다).
     그래서 «저장하는 줄»을 그대로 못박는다. */
  assert.match(fn, /saveRead\(gridYear, it\.id, read, photoOwner\(it\.id\)\)/,
    '★ 주인 자리에 안 적으면 주인 화면에는 계속 「업체 없음」으로 보입니다');
  assert.match(fn, /_coSweptOnce = false/, '실패했으면 다음에 다시 해 볼 수 있어야 합니다');
});

test('★ 목록을 실은 뒤에 부른다 — 안 부르면 아무 일도 안 일어난다', () => {
  assert.match(app, /autoReadPending\(\);[\s\S]{0,400}?coSweep\(\);/,
    '★ coSweep 를 함수만 만들고 안 부르면 「자동」이 없습니다');
});

test('★ 업체를 «만들지» 않는다 — 갈래는 계약이 정한다', () => {
  const fn = fnOf(store, 'coFill');
  assert.match(fn, /못 찾았다고 만들지 않는다/, '왜 안 만드는지 안 적으면 다음에 또 만듭니다');
  assert.ok(!/dbUpsert|push\(|set\(/.test(fn), '★ 사진첩이 업체를 만들면 갈래를 짐작해야 합니다');
  assert.match(fn, /계약이 만들어지면 저절로 들어갑니다/,
    '무엇을 기다리는지 안 알려 주면 「왜 안 되지」가 됩니다');
});

test('★ .js 를 고쳤으니 ?v= 을 올렸다 — 안 올리면 수리가 캐시에 묻힌다', () => {
  const m = app.match(/js\/pu-doc-file\.js\?v=(\d+)/);
  assert.ok(m && Number(m[1]) >= 3, '★ pu-photos.html 의 ?v= 를 안 올렸습니다');
});
