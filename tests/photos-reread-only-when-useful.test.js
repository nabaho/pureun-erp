'use strict';
/* 다시 읽는 것은 «값이 있을 때»만 — 대표 결정 2026-08-24 (검토 2위)

   종전 규칙은 「판 번호가 올랐으면 다 다시」(rv < READ_VERSION)였다. 그래서 읽는
   «길»만 바꿔도 읽어 둔 것이 다시 읽을 차례에 들어갔다.

   ⚠ 실데이터로 재 보니 내가 앞서 말한 것이 **틀렸다.** 「574장 파도를 만들었다」고
     했는데, 실제로 다시 읽을 차례는 240장이고 그중 **221장이 옛 판(rv=3)의
     사업자등록증** — 전부터 쌓여 있던 것이다. 이 고침으로 줄어드는 것은 **3장**이다.
     그러니 이 검사가 지키는 값은 «지금 아끼는 돈»이 아니라 **앞으로 판독기를 손볼
     때마다 파도가 일지 않는 것**이다. 그것도 지킬 값이 있다(내가 어제 그럴 뻔했다).

   다시 읽는 까닭을 둘로 좁혔다:
     ① 물음이 바뀌었다(pv) — 뽑을 칸·갈래 목록이 달라졌으니 답이 달라진다.
     ② 더 나은 길이 생겼다 — 글자가 있는데 그림으로 읽어 둔 것.
   둘 다 아니면 다시 읽지 않는다.

   실행: node --test tests/*.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const R = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(R, 'pu-photos.html'), 'utf8');
const readjs = fs.readFileSync(path.join(R, 'js', 'pu-doc-read.js'), 'utf8');

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

/* 실제로 돌린다 — 어떤 짝에서 다시 읽는지가 이 기능의 전부다. */
function load(vers) {
  const skip = app.match(/^const RESTALE_SKIP = \{[^}]*\};/m);
  assert.ok(skip, 'RESTALE_SKIP 을 찾지 못했습니다');
  const c = { PuDocRead: vers || { READ_VERSION: 11, PROMPT_VERSION: 10 }, Object, String, Boolean };
  vm.createContext(c);
  vm.runInContext(skip[0] + '\n' + fnOf(app, 'readPromptVer') + '\n' + fnOf(app, 'staleRead'), c);
  return c;
}
const S = load();
const it = function (read, extra) {
  return { meta: Object.assign({ read: read }, extra || {}) };
};

/* ══════ ① 길만 바뀐 것은 다시 읽지 않는다 ══════ */

test('★ 물음이 그대로면 다시 읽지 않는다 — 판 번호만 올랐다고 도는 파도를 막는다', () => {
  /* 물음 판 10 으로 읽어 둔 것. 전체 판은 11 로 올랐지만 물음은 그대로다. */
  assert.equal(S.staleRead(it({ kind: 'bizreg', rv: 11, pv: 10 })), false,
    '★ 읽는 길만 바꿔도 읽어 둔 것 전부가 다시 읽힙니다');
  assert.equal(S.staleRead(it({ kind: 'card', rv: 10, pv: 10 })), false);
});

test('★ 물음이 바뀌면 다시 읽는다 — 답이 달라지므로 값이 있다', () => {
  assert.equal(S.staleRead(it({ kind: 'bizreg', rv: 9, pv: 9 })), true);
  assert.equal(S.staleRead(it({ kind: 'bizreg', rv: 3, pv: 3 })), true);
});

test('★ 옛 기록에는 물음 판이 없다 — rv 를 대신 본다 (이 줄이 없으면 파도가 그대로 인다)', () => {
  /* 실데이터의 대부분이 이 꼴이다: pv 가 없고 rv 만 있다. */
  assert.equal(S.staleRead(it({ kind: 'bizreg', rv: 10 })), false,
    '★ pv 없음을 0 으로 읽으면 멀쩡한 것까지 다시 읽습니다');
  assert.equal(S.staleRead(it({ kind: 'bizreg', rv: 11 })), false);
  assert.equal(S.staleRead(it({ kind: 'bizreg', rv: 3 })), true, '옛 판은 다시 읽어야 합니다');
  assert.match(fnOf(app, 'readPromptVer'), /\(r\.pv != null\) \? \(r\.pv \|\| 0\) : \(r\.rv \|\| 0\)/);
});

/* ══════ ② 더 나은 길이 생긴 것은 다시 읽는다 ══════ */

test('★ 글자가 있는데 그림으로 읽어 둔 것은 다시 읽는다 — 오독이 사라지고 더 싸다', () => {
  assert.equal(S.staleRead(it({ kind: 'bizreg', rv: 11, pv: 10, via: 'image' }, { hasText: true })), true,
    '★ 이득이 있는데 안 읽으면 오독이 그대로 남습니다');
});

test('이미 글자로 읽은 것은 다시 읽지 않는다 — 같은 글자에서 같은 답이 나온다', () => {
  assert.equal(S.staleRead(it({ kind: 'bizreg', rv: 11, pv: 10, via: 'text' }, { hasText: true })), false);
});

test('글자가 없는 사진은 그림으로 읽은 채로 둔다 — 더 나은 길이 없다', () => {
  assert.equal(S.staleRead(it({ kind: 'card', rv: 11, pv: 10, via: 'image' })), false);
  assert.equal(S.staleRead(it({ kind: 'card', rv: 11, pv: 10, via: 'image' }, { hasText: false })), false);
});

/* ══════ ③ 손대지 않은 규칙 ══════ */

test('사람이 「확인했음」 한 것은 안 뒤집는다 — 손으로 정리한 것을 기계가 도로 뒤집으면 안 된다', () => {
  assert.equal(S.staleRead(it({ kind: 'bizreg', rv: 3, ack: true })), false);
  assert.equal(S.staleRead(it({ kind: 'bizreg', rv: 3, ack: true, via: 'image' }, { hasText: true })), false,
    '★ 더 나은 길이 생겼어도 사람이 확인한 것은 그대로 둡니다');
});

test('다시 읽어도 나올 것이 없는 갈래는 건너뛴다', () => {
  assert.match(app, /const RESTALE_SKIP = \{ meeting: 1, payslip: 1 \};/);
  assert.equal(S.staleRead(it({ kind: 'meeting', rv: 3 })), false);
  assert.equal(S.staleRead(it({ kind: 'payslip', rv: 3 })), false);
});

test('아직 안 읽은 것은 이 판정의 몫이 아니다 — neverRead 가 본다', () => {
  assert.equal(S.staleRead({ meta: {} }), false);
  assert.equal(S.staleRead(null), false);
});

/* ══════ ④ 판독기 — 번호 둘, 그리고 어느 길로 읽었나 ══════ */

test('★ 판 번호가 둘이다 — 「물음이 바뀐 판」과 「전체 판」', () => {
  assert.match(readjs, /var PROMPT_VERSION = (\d+);/);
  assert.match(readjs, /PROMPT_VERSION: PROMPT_VERSION,/, '내보내지 않으면 화면이 못 씁니다');
  const p = Number(readjs.match(/var PROMPT_VERSION = (\d+);/)[1]);
  const rv = Number(readjs.match(/var READ_VERSION = (\d+);/)[1]);
  assert.ok(p <= rv, '★ 물음 판이 전체 판보다 클 수 없습니다');
  assert.ok(p >= 10, '물음이 마지막으로 바뀐 판(10)보다 낮으면 헛되이 다시 읽습니다');
});

test('★ 어느 길로 읽었는지 결과에 남긴다 — 이것이 없으면 ②를 가릴 수 없다', () => {
  assert.match(fnOf(readjs, 'afterRead'), /via: \(via === 'text' \? 'text' : 'image'\)/);
  assert.match(fnOf(readjs, 'read'), /runDocParts\(parts, 'image'\)/);
  assert.match(fnOf(readjs, 'readDocText'), /\], 'text'\)/);
  assert.match(readjs, /function runDocParts\(parts, via\)/);
  /* 두 갈림길(대리인/열쇠) 모두 넘겨야 한다 — 한쪽만 넘기면 그 길에서 via 가 빈다. */
  assert.equal((fnOf(readjs, 'runDocParts').match(/afterRead\(parsed, via\)/g) || []).length, 2,
    '★ 한쪽 길에서만 넘기면 그 길로 읽은 것이 늘 「그림」으로 남습니다');
});

test('★ 판독 결과를 저장할 때 pv·via 를 함께 남긴다 — 안 남기면 다음에 못 가린다', () => {
  assert.equal((app.match(/pv: PuDocRead\.PROMPT_VERSION/g) || []).length, 3,
    '★ 판독 결과를 만드는 세 곳 모두에 남겨야 합니다');
  assert.equal((app.match(/via: r\.via \|\| 'image'/g) || []).length, 2,
    '★ 자동 판독 두 길(올린 뒤·다시 판독) 모두에 남겨야 합니다');
});

test('사람이 분류를 정한 것에는 via 를 안 남긴다 — AI 가 읽은 것이 아니다', () => {
  const i = app.indexOf("why: '사람이 분류를 정했습니다'");
  assert.ok(i > 0, '사람이 정하는 자리를 찾지 못했습니다');
  const seg = app.slice(i, i + 260);
  assert.match(seg, /pv: PuDocRead\.PROMPT_VERSION/, '물음 판은 남겨야 다시 안 읽습니다');
  assert.ok(!/via:/.test(seg), '사람이 정한 것에 「어느 길로 읽었다」를 적으면 거짓입니다');
});
