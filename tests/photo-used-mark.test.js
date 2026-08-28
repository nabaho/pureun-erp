/* 「증빙으로 썼다」 표시 (2026-08-26)

   ── 무슨 일이 있었나 ──
   사진첩 보유기간은 **증빙 5년 / 나머지 1년**으로 갈린다. 그 갈림을 정하는 것은
   사진 옆에 남기는 표시(used) 하나뿐이다. 그런데 운영 데이터에서 그 표시가 찍힌
   사진이 **0장**이었다 — 정부사업일정만 찍는 코드가 있었고 푸른이알피·근로복지기금은
   아예 없었다. 그대로 두면 계약·기금 증빙으로 붙여 놓은 사진이 **1년 뒤 정리 목록에
   떠서**, 모르고 지우면 감사·세무조사 때 내놓을 원본이 사라진다.

   ── 이 검사가 지키는 것 ──
   ① 저장 층 : 표시는 사진 «옆 한 칸»만 건드린다(사진도 판독 결과도 손대지 않는다).
   ② 기금    : 세 갈래(거래 증빙·기금 서류·참여사업장·서류함) 모두 표시를 남긴다.
   ③ 푸른이알피 : **저장이 된 뒤에** 남긴다. 「적용」만 누르고 그만둔 것은 쓴 것이 아니다.
   ④ 어디서든 표시가 실패해도 **하던 일을 무르지 않는다.** */

'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const R = path.join(__dirname, '..');
const STORE = fs.readFileSync(path.join(R, 'js', 'pu-photo-store.js'), 'utf8');
const FUND = fs.readFileSync(path.join(R, 'fund.html'), 'utf8');
const ERP = fs.readFileSync(path.join(R, 'pu-erp.html'), 'utf8');

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

/* ── ① 저장 층 — 사진 옆 한 칸만 ── */

test('★ 표시는 사진 옆 한 칸(used)만 건드린다 — 사진도 판독 결과도 손대지 않는다', async () => {
  let wrote = null;
  const ctx = {
    console, Promise, Object, Array, JSON, String, Number, Math, Date, Set, Map,
    RegExp, Error, isFinite, parseInt, parseFloat, setTimeout, clearTimeout
  };
  ctx.window = ctx; ctx.globalThis = ctx; ctx.self = ctx;
  vm.createContext(ctx);
  vm.runInContext(STORE, ctx);
  ctx.PuPhotoStore.init({
    uid: 'ME',
    db: { ref: function () { return { update: function (u) { wrote = u; return Promise.resolve(); } }; } }
  });
  await ctx.PuPhotoStore.markUsed('2026', 'p1', '푸른이알피 계약 — 가야엔지니어링', 'U9');
  const keys = Object.keys(wrote || {});
  assert.equal(keys.length, 1, '한 칸만 건드려야 합니다: ' + keys.join(', '));
  assert.match(keys[0], /\/items\/2026\/p1\/used$/,
    '엉뚱한 자리에 적었습니다 — 사진 정보나 판독 결과를 덮으면 안 됩니다: ' + keys[0]);
  assert.ok(keys[0].indexOf('U9') > 0, '남의 사진이면 그 사람 자리에 적어야 합니다: ' + keys[0]);
  const v = wrote[keys[0]];
  assert.ok(v.at > 0, '언제 썼는지가 없으면 5년을 셀 수 없습니다');
  assert.equal(v.where, '푸른이알피 계약 — 가야엔지니어링', '어디에 썼는지를 안 남겼습니다');
  assert.equal(v.by, 'ME');
});

test('★ 표시가 있으면 5년, 없으면 1년 — 사진첩이 실제로 그렇게 센다', () => {
  /* 이 갈림이 없어지면 위 검사는 뜻이 없다. 사진첩 쪽에서 함께 못 박는다. */
  const photos = fs.readFileSync(path.join(R, 'pu-photos.html'), 'utf8');
  const ctx = { Date, Number, String, Math };
  vm.createContext(ctx);
  vm.runInContext('const KEEP_USED_YEARS = ' + (photos.match(/KEEP_USED_YEARS\s*=\s*(\d+)/) || [, '?'])[1] + ';' +
    'const KEEP_PLAIN_YEARS = ' + (photos.match(/KEEP_PLAIN_YEARS\s*=\s*(\d+)/) || [, '?'])[1] + ';' +
    fnOf(photos, 'isUsed') + '\n' + fnOf(photos, 'keepUntil'), ctx);
  const day = 86400000;
  const base = { takenAt: Date.now() - 400 * day, upAt: Date.now() - 400 * day };
  const plain = ctx.keepUntil(base);
  const proof = ctx.keepUntil(Object.assign({}, base, { used: { at: Date.now() } }));
  assert.ok(proof > plain, '증빙으로 쓴 사진이 더 오래 남지 않습니다');
  assert.ok(plain < Date.now(), '표시가 없으면 1년 뒤 정리 목록에 떠야 합니다(전제 확인)');
  assert.ok(proof > Date.now(), '★ 표시를 남겼는데도 지금 정리 목록에 뜹니다');
});

/* ── ② 근로복지기금 ── */

function runFundMark(o) {
  o = o || {};
  const calls = [];
  const ctx = {
    console: { warn: function () {} }, Promise, Object, String,
    PuPhotoStore: {
      markUsed: function (y, id, where, owner) {
        calls.push({ y: y, id: id, where: where, owner: owner });
        return o.fails ? Promise.reject(new Error('막힘')) : Promise.resolve();
      }
    }
  };
  if (o.noStore) delete ctx.PuPhotoStore;
  vm.createContext(ctx);
  vm.runInContext(fnOf(FUND, 'markFundUsed'), ctx);
  return { ctx: ctx, calls: calls };
}

test('★ 기금이 표시를 남긴다 — 해·번호·주인·어디에 썼는지', () => {
  const r = runFundMark();
  r.ctx.markFundUsed({ year: 2026, id: 'p1', owner: 'U9' }, '기금 거래 증빙 — 가야 2026');
  assert.equal(r.calls.length, 1, '표시를 안 남겼습니다');
  assert.equal(r.calls[0].y, '2026', '해를 글자로 넘겨야 자리를 찾습니다');
  assert.equal(r.calls[0].id, 'p1');
  assert.equal(r.calls[0].owner, 'U9', '★ 주인을 안 넘기면 내 자리에 적혀 엉뚱한 사진이 5년이 됩니다');
  assert.match(r.calls[0].where, /기금 거래 증빙/);
});

test('표시가 막혀도 넘어지지 않는다 — 연결 저장을 무를 수는 없다', () => {
  assert.doesNotThrow(function () {
    runFundMark({ fails: true }).ctx.markFundUsed({ year: '2026', id: 'p1' }, '어딘가');
  });
  assert.doesNotThrow(function () {
    runFundMark({ noStore: true }).ctx.markFundUsed({ year: '2026', id: 'p1' }, '어딘가');
  }, '사진첩 저장 층이 아직 안 실렸을 때 넘어집니다');
});

test('가리킬 사진이 없으면 아무것도 안 한다', () => {
  const r = runFundMark();
  r.ctx.markFundUsed(null, '어딘가');
  r.ctx.markFundUsed({ id: 'p1' }, '어딘가');          // 해가 없다
  r.ctx.markFundUsed({ year: '2026' }, '어딘가');      // 번호가 없다
  assert.equal(r.calls.length, 0, '반쪽짜리 참조로 엉뚱한 자리에 적었습니다');
});

/* 사진을 붙이는 네 갈래를 **실제로 돌려 본다.**
   ⚠ 「markFundUsed 라는 글자가 있나」만 보면 안 잡힌다 — `if(false) markFundUsed(...)`
     로 꺼 두어도 통과한다(되돌림 시험에서 그 변형 둘이 살아남아 이렇게 바꿨다). */
const FUND_PATHS = [
  { fn: 'saveTxnScanRef', call: function (c) { c.saveTxnScanRef('F1', '2026', 'T1', c.__ref); }, where: /기금 거래 증빙/ },
  { fn: 'saveScanRef', call: function (c) { c.saveScanRef('F1', '인가증', c.__ref); }, where: /기금 서류/ },
  { fn: 'saveSiteScanRef', call: function (c) { c.saveSiteScanRef('F1', '2026', 'S1', '명부', c.__ref); }, where: /참여사업장/ },
  { fn: 'saveShelfScanRef', call: function (c) { c.saveShelfScanRef('F1', '2026', '정관', c.__ref, {}); }, where: /서류함/ }
];

FUND_PATHS.forEach(function (p) {
  test('★ 기금 — ' + p.fn + ' 로 붙인 사진에 표시가 남는다', async () => {
    /* 한 갈래만 빠져도 그 길로 붙인 사진은 1년 뒤 정리 목록에 뜬다. */
    const marks = [];
    const ctx = {
      console: { warn: function () {} }, Promise, Object, String, Date, Number,
      __ref: { year: '2026', id: 'p1', owner: 'U9' },
      S: { fundId: 'F1', year: '2026', user: '권형하', txns: { T1: {} }, subChk: {}, subDocs: {} },
      funds: { F1: { name: '가야기금' } },
      NS: 'fund',
      ymd: function () { return '2026-08-26'; },
      esc: function (s) { return String(s == null ? '' : s); },
      toast: function () {}, renderFund: function () {},
      _shelfName: function (k) { return k; },
      fbDb: {
        ref: function () {
          return {
            set: function () { return Promise.resolve(); },
            update: function () { return Promise.resolve(); },
            push: function () { return { set: function () { return Promise.resolve(); } }; }
          };
        }
      },
      PuPhotoStore: {
        markUsed: function (y, id, where, owner) {
          marks.push({ y: y, id: id, where: where, owner: owner });
          return Promise.resolve();
        }
      }
    };
    vm.createContext(ctx);
    vm.runInContext(fnOf(FUND, 'markFundUsed') + '\n' + fnOf(FUND, p.fn), ctx);
    p.call(ctx);
    await new Promise(function (r) { setTimeout(r, 20); });
    assert.equal(marks.length, 1,
      '★ ' + p.fn + ' 로 붙인 사진에는 「증빙으로 썼다」 표시가 안 남습니다 — 1년 뒤 정리 목록에 뜹니다');
    assert.equal(marks[0].id, 'p1');
    assert.equal(marks[0].owner, 'U9');
    assert.match(marks[0].where, p.where, '어디에 썼는지가 엉뚱합니다: ' + marks[0].where);
  });
});

/* ── ③ 푸른이알피 — 저장이 «된 뒤에» ── */

test('★ 푸른이알피는 계약이 저장된 뒤에 표시를 남긴다', () => {
  const done = ERP.indexOf('savedRef.value = true;');
  const mark = ERP.indexOf('PuPhotoStore.markUsed(', done);
  const hand = ERP.indexOf('props.onSave(saveData);', done);
  assert.ok(done > 0, '저장 성공 표식을 못 찾았습니다');
  assert.ok(mark > done,
    '★ 저장 전에 표시하면, 「적용」만 누르고 그만둔 계약서까지 증빙으로 셉니다');
  assert.ok(hand > 0 && mark < hand,
    '표시를 넘기기 뒤로 미루면 넘기기가 넘어졌을 때 표시가 통째로 안 남습니다');
});

/* ⚠ 2026-08-28 다시 겨눔 — 종전에는 `slice(i - 400, i)` 처럼 **글자 수로 창을 떠서**
   봤다. 그 대목에 주석 몇 줄이 늘자(담당자 공유가 같은 자리에 붙었다) 보려던 조건이
   창 밖으로 밀려나 검사가 울었다. 코드는 멀쩡한데 검사만 우는 것은 못 고칠 검사다.
   → 창을 넓히며 쫓아가지 말고, **그 대목(try 블록) 자체**를 떠서 본다. */
function markBlock() {
  const i = ERP.indexOf('PuPhotoStore.markUsed(');
  assert.ok(i > 0, '표시하는 곳을 못 찾았습니다');
  const start = ERP.lastIndexOf('try {', i);
  assert.ok(start > 0, '표시 대목을 감싼 try 를 못 찾았습니다');
  const end = ERP.indexOf('} catch', i);
  assert.ok(end > i, '표시 대목의 catch 를 못 찾았습니다');
  return { i: i, start: start, before: ERP.slice(start, i), block: ERP.slice(start, end) };
}

test('★ 푸른이알피는 붙인 사진이 있을 때만 표시한다', () => {
  const m = markBlock();
  assert.match(m.before, /srcPhoto/, '어느 사진인지 안 보고 표시합니다');
  assert.match(m.before, /\.id\s*&&[\s\S]{0,40}\.year/,
    '해·번호가 반쪽이어도 표시합니다 — 엉뚱한 자리에 적힙니다');
});

test('★ 표시가 막혀도 계약 저장을 무르지 않는다', () => {
  const m = markBlock();
  assert.match(m.block.slice(m.i - m.start), /\.catch\(/,
    '표시가 막히면 그대로 터져 저장이 오류로 보입니다');
  /* 표시 대목이 try 안에 있다 — 위 markBlock 이 try…catch 를 실제로 찾아낸 것이
     그 증거다. 여기서는 그 사이에 다른 catch 가 끼어들지 않았는지만 본다. */
  assert.ok(m.before.lastIndexOf('} catch') < 0,
    '표시 대목이 try 로 감싸여 있지 않습니다 — 저장 성공이 오류로 뒤집힙니다');
});
