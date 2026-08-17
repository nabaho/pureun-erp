/* 일정관리 저장이 «통째로» 거부된 일 (2026-08-17)
   실제 화면 문구: "사업장 저장 실패 — transaction failed:
                   Data returned contains undefined in property 'scal…"

   ★ 뿌리 —
     옛 칸을 없애려고 `defCoAtt:undefined` / `coAttId=undefined` 를 «넣었다».
     자바스크립트에서 펼치기(...)나 대입으로는 키가 지워지지 않고
     «값이 undefined 인 키» 가 남는다.
     그런데 실시간DB는 undefined 가 섞인 저장을 «통째로 거부» 한다.
     localStorage 는 JSON 으로 굳을 때 그 칸을 그냥 빼므로 기기에는 저장됐다 —
     그래서 「화면엔 바뀐 것처럼 보이는데 클라우드엔 안 올라간다」가 됐다.

   ※ 이 검사는 「글자가 있나」가 아니라 실제로 «올릴 수 있는 모양인가» 를 본다. */
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'gov-consulting.html'), 'utf8');
const bare = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
const S = bare(SRC);

/* 실시간DB가 거부하는 조건을 그대로 옮긴 검사기 */
function hasUndefined(v, at) {
  at = at || '';
  if (Array.isArray(v)) {
    for (let i = 0; i < v.length; i++) {
      const r = hasUndefined(v[i], at + '[' + i + ']');
      if (r) return r;
    }
    return null;
  }
  if (v && typeof v === 'object') {
    const ks = Object.keys(v);
    for (let i = 0; i < ks.length; i++) {
      if (v[ks[i]] === undefined) return at + '.' + ks[i];
      const r = hasUndefined(v[ks[i]], at + '.' + ks[i]);
      if (r) return r;
    }
    return null;
  }
  return v === undefined ? at : null;
}

function loadNoUndef() {
  const a = S.indexOf('function _noUndef');
  assert.ok(a > 0, '_noUndef 가 없다');
  const b = S.indexOf('\nfunction _idRows', a);
  const ctx = { Array, Object, console };
  vm.createContext(ctx);
  vm.runInContext(S.slice(a, b) + '\nthis.fn = _noUndef;', ctx);
  return ctx.fn;
}

/* ── ① 없애려는 칸을 undefined 로 «넣지» 않는다 ── */

test('사업장 수정이 undefined 를 넣지 않는다', () => {
  /* ★ 이 한 줄이 사업장 저장을 통째로 막았다. */
  const a = S.indexOf('async function saveCo');
  const fn = S.slice(a, S.indexOf('\nasync function ', a + 5));
  assert.strictEqual(/defCoAtt\s*:\s*undefined/.test(fn), false,
    '아직 defCoAtt:undefined 를 넣는다 — 실시간DB가 저장을 거부한다');
  assert.strictEqual(/delete\s+\w+\.defCoAtt/.test(fn), true,
    '옛 칸을 지우지 않는다 — 없애는 것이 원래 목적이었다');
});

test('일정 수정이 undefined 를 넣지 않는다', () => {
  const a = S.indexOf('async function saveEdit');
  const fn = S.slice(a, S.indexOf('\nasync function ', a + 5));
  assert.strictEqual(/coAttId\s*=\s*undefined/.test(fn), false,
    '아직 coAttId=undefined 를 넣는다');
  assert.strictEqual(/delete\s+\w+\[\w+\]\.coAttId/.test(fn), true, '옛 칸을 지우지 않는다');
});

test('저장되는 어느 곳에도 undefined 를 «넣는» 자리가 없다', () => {
  /* 앞으로 같은 실수를 다시 하면 여기서 걸린다.
     ※ transaction 의 «취소» 표시(...:undefined)는 저장값이 아니라 예외다. */
  const lines = S.split('\n');
  const bad = [];
  lines.forEach(function (l, i) {
    /* «넣는» 것만 본다 — 비교(===undefined · !==undefined)는 아무 문제가 없다.
       앞에 =·!·<·> 가 붙으면 비교다. */
    if (!/(^|[^=!<>])[:=]\s*undefined/.test(l)) return;
    if (/transaction\(/.test(l)) return;              // 잠금 취소용 — 저장값이 아니다
    if (/,undefined,false\)/.test(l)) return;         // transaction 의 두 번째 인수
    bad.push((i + 1) + ': ' + l.trim().slice(0, 90));
  });
  assert.deepStrictEqual(bad, [], '저장 자료에 undefined 를 넣는 자리가 있다:\n' + bad.join('\n'));
});

/* ── ② 한 칸이 잘못돼도 저장 전체가 막히지 않는다 ── */

test('빈 칸을 빼고 올린다 — 한 칸 때문에 전체가 막히지 않는다', () => {
  const f = loadNoUndef();
  const rows = [{ id: 'a', name: '가나', defCoAtt: undefined, types: ['t1'] },
    { id: 'b', name: '다라', deadlines: { t1: undefined, t2: '2026-09-28' } }];
  const out = f(rows, 'scal_cos', []);
  assert.strictEqual(hasUndefined(out), null, '아직 undefined 가 남아 있다');
  // 값이 있는 칸은 «그대로» 남아야 한다
  assert.strictEqual(out[0].name, '가나');
  assert.strictEqual(Array.from(out[0].types).join(','), 't1');
  assert.strictEqual(out[1].deadlines.t2, '2026-09-28');
  assert.strictEqual('defCoAtt' in out[0], false, '빈 칸이 그대로 있다');
  assert.strictEqual('t1' in out[1].deadlines, false);
});

test('뺀 칸을 «기록에 남긴다» — 조용히 버리지 않는다', () => {
  /* 소리 없이 버리면 값이 사라진 것을 아무도 모른다.
     이 저장소에서 「조용한 실패」로 여러 번 당한 그것이다. */
  const f = loadNoUndef();
  const dropped = [];
  f([{ id: 'a', defCoAtt: undefined, deadlines: { t1: undefined } }], 'scal_cos', dropped);
  assert.strictEqual(dropped.length, 2, '뺀 칸을 다 안 적는다');
  assert.strictEqual(dropped.some(function (p) { return /defCoAtt$/.test(p); }), true);
  assert.strictEqual(dropped.some(function (p) { return /deadlines\.t1$/.test(p); }), true);
  assert.strictEqual(dropped[0].indexOf('scal_cos') === 0, true, '어느 칸인지 안 적는다');
});

test('멀쩡한 자료는 한 글자도 바꾸지 않는다', () => {
  /* 방어가 자료를 건드리면 그게 더 큰 사고다. */
  const f = loadNoUndef();
  const rows = [{ id: 'a', n: 0, ok: false, s: '', z: null, arr: [1, 2], o: { k: 'v' } }];
  const out = f(rows, 'x', []);
  assert.strictEqual(JSON.stringify(out), JSON.stringify(rows));
});

test('두 저장 길 모두 빈 칸을 걸러 낸다', () => {
  ['fbPushRecordDelta(', 'fbPush('].forEach(function (name) {
    const a = S.indexOf('function ' + name);
    assert.ok(a > 0, name + ' 가 없다');
    const b = S.indexOf('\nfunction ', a + 5);
    const fn = S.slice(a, b < 0 ? S.length : b);
    assert.strictEqual(/_noUndef\(/.test(fn), true, name + ' 가 빈 칸을 안 걸러 낸다');
    /* 어느 칸(node)에서 뺐는지 함께 넘겨야 기록이 쓸모 있다 —
       빈 문자열을 넘기면 「.defCoAtt」만 남아 어느 표인지 알 수 없다. */
    assert.strictEqual(/_noUndef\([\s\S]{0,90}?,\s*node\s*,/.test(fn), true,
      name + ' 가 어느 칸인지 안 넘긴다');
  });
});

/* ── ③ 실패 문구가 어느 칸인지 끝까지 보여 준다 ── */

test('실패 이유를 「in property」가 끊기지 않게 보여 준다', () => {
  /* 70자로 자르면 "in property 'scal…" 에서 끊겨 어느 칸인지가 사라진다.
     그것 때문에 원인 찾기가 한 바퀴 늦어졌다. */
  const a = S.indexOf('function _saveFailMsg');
  const fn = S.slice(a, S.indexOf('\nfunction ', a + 5));
  const m = fn.match(/slice\(0,\s*(\d+)\)/);
  assert.ok(m, '이유를 자르는 자리를 못 찾았다');
  assert.ok(Number(m[1]) >= 140, '이유가 너무 짧게 잘린다 (지금 ' + m[1] + '자)');
});
