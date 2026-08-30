'use strict';
/* 급여데이터함 「남의 자리 보기」는 «일부러» 열려 있다 — 조이지 말 것

   2026-08-30 바깥 검토가 `paydata/u/$owner` 읽기를 「높음·보안 구멍」으로 짚었다.
   화면을 열어 보니 구멍이 아니라 **기능**이었다 —
   「🔁 담당자」로 다른 담당자를 고르고, 「왜 보시나요」를 적고, 그 사유가 기록에
   남은 뒤 그 자리를 «보기만» 한다 (대표 지시 2026-08-17).
   한 업체를 둘이 맡을 때 상대가 담아 둔 서류를 보는 길도 이 읽기 하나다.

   조이면 셋이 함께 사라진다 — 직원의 「🔁 담당자」, 공동 담당 서랍,
   대리 여부 확인. 그래서 대표께 물었고 「지금대로 둔다」로 정해졌다 (2026-08-30).

   이 검사는 «열어 두는 것»만 지키지 않는다. 열어 둔 값을 치르는 쪽 —
   **열람 기록**이 관리자 전용이고 덧붙이기만 되는 것 — 도 함께 못 박는다.
   기록을 고칠 수 있으면 기록이 아니고, 그러면 열어 둔 까닭도 사라진다.

   ⚠ 검사고정-허용: 아래는 «지금 값»이 아니라 «대표가 정한 규칙»이다.
     바꾸려면 코드가 아니라 결정을 먼저 바꿔야 한다.

   실행: node --test tests/*.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const R = path.join(__dirname, '..');
const j = JSON.parse(fs.readFileSync(
  path.join(R, 'docs', 'firebase-rules-전체-적용본.json'), 'utf8'));
const pay = j.rules.paydata;
const gen = fs.readFileSync(path.join(R, 'scripts', 'make-firebase-rules.js'), 'utf8');
const app = fs.readFileSync(path.join(R, 'pu-paydata.html'), 'utf8');

/* 「로그인한 직원」 조건 — 규칙 곳곳에 같은 글로 쓰인다. 글자를 박지 않고,
   «어느 자리에서 가져온 것»과 같은지로 본다(다른 자리가 바뀌면 함께 바뀐다). */
const LOGIN = j.rules.data.staff_colors['.read'];

test('★★ 남의 자리 보기는 열려 있다 — 조이면 「🔁 담당자」가 직원에게서 사라진다', () => {
  assert.equal(pay.u.$owner['.read'], LOGIN,
    '★★ 급여자료함 읽기를 좁혔습니다. 대표 결정(2026-08-30)은 「지금대로 둔다」입니다 —\n'
    + '   좁히면 ① 직원의 「🔁 담당자」 ② 공동 담당 서랍 ③ 대리 여부 확인이 함께 죽습니다.\n'
    + '   바꾸려면 코드가 아니라 결정을 먼저 바꾸십시오.');
});

test('★★ 열어 둔 값은 «기록»으로 치른다 — 기록은 관리자만 보고, 아무도 못 고친다', () => {
  ['access_log', 'handoff_log'].forEach(function (k) {
    const box = pay[k];
    assert.ok(box, '★ ' + k + ' 이 사라졌습니다 — 열어 둔 까닭이 함께 사라집니다');
    assert.match(box['.read'], /isAdmin/,
      '★★ ' + k + ' 을 직원이 읽으면, 누가 누구 자리를 봤는지 서로 들여다봅니다');
    /* 「덧붙이기만」 — 이미 적힌 줄은 아무도 못 고친다. 고칠 수 있으면 기록이 아니다. */
    assert.match(box.$id['.write'], /!data\.exists\(\)/,
      '★★ ' + k + ' 을 고치거나 지울 수 있으면 기록이 아무 뜻이 없습니다');
  });
});

test('★ 쓰기는 그대로 좁다 — 열린 것은 «보기»뿐이다', () => {
  /* 읽기를 열어 둔 만큼, 쓰기가 함께 열리면 안 된다. 자리 주인과 «기간 안» 대리인만. */
  ['items', 'pending', 'values', 'thumbs', 'trash', 'folders'].forEach(function (k) {
    const w = pay.u.$owner[k]['.write'];
    assert.match(w, /\$owner === auth\.uid/, '★★ ' + k + ' 쓰기에 자리 주인 조건이 없습니다');
    assert.match(w, /deputy[\s\S]*to.*>= now|>= now/,
      '★★ ' + k + ' 쓰기에서 대리인 «기간»이 빠졌습니다 — 한 번 맡기면 영영 쓰게 됩니다');
  });
  /* 자리를 맡기는 것은 «주인만» — 남이 스스로 대리인이 될 수 있으면 문이 통째로 열린다 */
  assert.match(pay.u.$owner.deputy['.write'], /\$owner === auth\.uid/,
    '★★ 남이 스스로 대리인이 될 수 있으면, 쓰기를 좁혀 둔 것이 아무 뜻이 없습니다');
});

test('★★ 화면이 «사유 없이» 남의 자리로 못 들어간다 — 규칙은 이것을 못 지킨다', () => {
  /* 규칙은 「먼저 기록을 남겨라」를 요구할 수 없다. 그래서 이 한 걸음은 화면이 지킨다.
     화면에서 이 순서가 무너지면 「기록이 남는다」가 조용히 거짓말이 된다. */
  const at = app.indexOf('function submitReason(');
  assert.ok(at > 0, 'submitReason 을 찾지 못했습니다');
  const body = app.slice(at, app.indexOf('\n}', at));
  const iLog = body.indexOf('logAccess');
  const iEnter = body.indexOf('enterSeat');
  assert.ok(iLog > 0 && iEnter > iLog,
    '★★ 기록보다 «들어가기»가 먼저입니다 — 기록이 실패해도 들어가게 됩니다');
  assert.match(body, /if \(!reason\)/,
    '★ 사유가 비어도 들어가면, 사유를 묻는 뜻이 없습니다');

  /* 관리자는 사유를 안 적는다(대표 지시 2026-08-17). 그래도 «기록»은 남는다 —
     없어지는 것은 기록이 아니라 적는 손이다. */
  const aAt = app.indexOf('function adminOpen(');
  assert.ok(aAt > 0, 'adminOpen 을 찾지 못했습니다');
  const aBody = app.slice(aAt, app.indexOf('\n}', aAt));
  assert.match(aBody, /logAccess/,
    '★★ 관리자가 «기록 없이» 남의 자리를 열면, 열어 둔 까닭이 무너집니다');
  assert.match(aBody, /catch/,
    '★★ 기록이 실패했는데 그냥 들여보내면 「기록은 남는다」가 거짓말이 됩니다');
});

test('★ 왜 열어 두는지가 «만들개에» 적혀 있다 — 안 적으면 다음 사람이 또 조인다', () => {
  /* 2026-08-30 에 바깥 검토가 여기를 「구멍」으로 짚었다. 까닭이 안 적혀 있으면
     다음 검토도 똑같이 짚고, 누군가는 좋은 뜻으로 조여 기능을 죽인다. */
  const at = gen.indexOf('rules.paydata = {');
  assert.ok(at > 0);
  const why = gen.slice(Math.max(0, at - 2000), at);
  assert.match(why, /대표 결정 2026-08-30/,
    '★ 언제 누가 정한 것인지 없으면, 다음 사람은 그냥 실수로 봅니다');
  assert.match(why, /🔁 담당자/,
    '★ «무엇이 죽는지»를 안 적으면, 조이는 것이 싸 보입니다');
});
