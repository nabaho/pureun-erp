/* 업무관리 「말로 기록」 — 녹음을 AI가 정리해 기록·일정으로 (2026-09-02)
 *
 * 여기서 지키는 것은 «값» 이 아니라 다음 네 가지 «규칙» 이다.
 *   1. 받아쓴 글은 남기지 않는다 (대표 승인 조건)
 *   2. 상태는 사람이 체크를 켠 때만 바뀐다 (AI 가 혼자 못 바꾼다)
 *   3. 소리는 정리가 끝나면 버린다 (창고 요금·개인정보)
 *   4. 보내는 한도가 서버 한도보다 작다 (base64 로 부풀기 때문)
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'work.html'), 'utf8').replace(/\r\n/g, '\n');

/* 주석이 검사를 통과시키는 일을 막는다 — 잘 쓴 주석 안에 낱말이 다 들어 있다 */
function noComments(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}
/* 이름으로 함수 몸통을 꺼낸다 (중괄호 짝을 센다) */
function body(name) {
  const i = SRC.indexOf('function ' + name + '(');
  assert.ok(i >= 0, name + ' 이 없다 — 말로 기록이 통째로 사라졌다');
  let d = 0, j = i;
  for (; ; j++) {
    if (SRC[j] === '{') d++;
    else if (SRC[j] === '}') { d--; if (!d) { j++; break; } }
  }
  return noComments(SRC.slice(i, j));
}

test('말로 기록 칸이 업무 서랍에 달려 있다', () => {
  const rd = body('renderDrawer');
  assert.match(rd, /dVoiceHTML\s*\(/,
    '서랍이 dVoiceHTML 을 안 부른다 — 칸을 만들어 놓고 화면에 안 붙인 셈이다');
});

test('받아쓴 글은 기록으로 저장하지 않는다 — 정리본만 남는다', () => {
  const save = body('voSave');
  /* 저장으로 가는 값은 사람이 고칠 수 있는 칸(vo-done)에서만 온다.
     VO.res.heard 를 저장 쪽으로 끌면 여기서 걸린다. */
  assert.doesNotMatch(save, /heard/,
    'voSave 가 받아쓴 글(heard)을 건드린다 — 남기지 않기로 한 것이다');
  assert.match(save, /addLog\s*\(\s*id\s*,\s*done\b/,
    '기록으로 가는 것은 사람이 고친 done 이어야 한다');
});

test('상태는 사람이 체크를 켠 때만 바뀐다 — AI 혼자 못 바꾼다', () => {
  const save = body('voSave');
  const m = save.match(/[^\n]*\bf\.status\s*=[^\n]*/);
  assert.ok(m, 'voSave 에 상태를 넣는 줄이 없다');
  assert.match(m[0], /\.checked/,
    '상태를 체크 확인 없이 넣는다 — 말 한마디로 상태가 바뀌어 버린다');
});

test('소리는 정리가 끝나면 버린다 — 들고 있지 않는다', () => {
  const tidy = body('voTidy');
  assert.match(tidy, /VO\.blob\s*=\s*null/,
    '정리 뒤 녹음 덩이를 안 버린다 — 창고로 새어 나갈 길이 열린다');
  assert.match(tidy, /revokeObjectURL/,
    '만든 주소를 안 거둔다 — 브라우저가 소리를 계속 붙들고 있다');
});

test('보내는 한도가 서버 한도보다 작다 (base64 로 3분의 1 부푼다)', () => {
  const mb = SRC.match(/var\s+VO_MAX_BYTES\s*=\s*([^;]+);/);
  assert.ok(mb, 'VO_MAX_BYTES 가 없다 — 한도 없이 보내면 서버가 되돌린다');
  const limit = Function('return (' + mb[1] + ')')();

  /* 서버 한도는 functions/doc-read.js 가 진짜다 — 여기 숫자를 박지 않는다 */
  const fn = fs.readFileSync(path.join(ROOT, 'functions', 'doc-read.js'), 'utf8');
  const ms = fn.match(/MAX_BODY_BYTES\s*=\s*([^;]+);/);
  assert.ok(ms, 'functions/doc-read.js 의 MAX_BODY_BYTES 를 못 찾았다');
  const server = Function('return (' + ms[1] + ')')();

  assert.ok(limit * 4 / 3 < server,
    '녹음 한도(' + limit + ')가 base64 로 부풀면 서버 한도(' + server + ')를 넘는다'
    + ' — 긴 녹음이 통째로 되돌려진다');
});

test('녹음은 스스로 멈춘다 — 켜 둔 채 잊어도 무한정 안 늘어난다', () => {
  assert.match(SRC, /var\s+VO_MAX_SEC\s*=/, 'VO_MAX_SEC 가 없다');
  const tick = noComments(SRC);
  assert.match(tick, /VO\.sec\s*>=\s*VO_MAX_SEC/,
    '시간 한도를 재는 곳이 없다 — 한도를 적어만 두고 안 쓰는 셈이다');
});
