/* 건의함 답변 — 줄바꿈이 살아 있어야 읽힌다 (2026-08-26)
 *
 * 대표 지시: 「코딩하면 반드시 답변을 네가 처리해라 — 어떻게 했고 뭐가 필요한지,
 *            파일 다시 업로드가 필요한지 이런 부분」
 * 그런 답변은 여러 줄이다. 줄바꿈이 죽으면 한 덩이로 뭉쳐 아무도 안 읽는다.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'enter.html'), 'utf8');

function cssRule(sel) {
  const i = SRC.indexOf(sel + '{');
  assert.ok(i >= 0, '규칙을 못 찾음: ' + sel);
  return SRC.slice(i, SRC.indexOf('}', i) + 1);
}

test('★★ 목록 상세의 답변에 줄바꿈이 살아 있다', () => {
  const r = cssRule('.sg-reply');
  assert.ok(/white-space\s*:\s*pre-wrap/.test(r),
    '여러 줄 답변이 한 덩이로 뭉친다 — 「무엇을 했고 무엇이 필요한지」가 안 읽힌다');
});

test('★ 건의자 본인 알림 쪽도 그대로 살아 있다', () => {
  const r = cssRule('.sgd-r');
  assert.ok(/white-space\s*:\s*pre-wrap/.test(r), '본인 알림에서 줄바꿈이 죽는다');
});

test('★★ 답변은 «세 자리»에 함께 쓴다 — 하나라도 빠지면 목록·배지·알림이 어긋난다', () => {
  /* 화면이 저장할 때 쓰는 세 자리가 그대로 남아 있어야, 사람이 아닌 쪽에서 넣은 답변도
     같은 규칙을 따를 수 있다. 한 자리라도 사라지면 「답은 넣었는데 미처리로 남는」 일이 생긴다. */
  assert.ok(SRC.indexOf("db.ref(SG_PRIVATE_PATH+'/'+id).update({ status:newStatus, reply:reply") >= 0,
    '본문 기록에 답변을 안 쓴다');
  assert.ok(SRC.indexOf("db.ref(SG_META_PRIVATE_PATH+'/'+id).update({ status:newStatus })") >= 0,
    '목록·배지가 보는 색인에 상태를 안 쓴다');
  assert.ok(/rref\.update\(\{ title:s\.title\|\|'', reply:reply/.test(SRC),
    '건의자 진행함에 안 쓴다 — 본인은 답을 못 본다');
});

test('★ 완료일 때만 본인에게 알림이 뜬다 (검토중은 조용히)', () => {
  assert.ok(/seen:\(newStatus !== 'done'\)/.test(SRC),
    '검토중으로 바꿀 때마다 「해결되었습니다」 팝업이 뜨면 안 된다');
});
