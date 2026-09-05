'use strict';
// 푸른이알피에서 끝난 건을 업무관리가 «스스로» 닫는다 — node --test tests/close-from-erp.test.js
//
// 2026-09-05 대표 보고: 팀 전체 「(담당 미지정) 진행 84건」에 계약이 잔뜩 남아 있다.
//   「일부 사업들은 계약관리에서 종료한 경우도 있다. 종료가 되었으면 빼달라.」
//
// 까닭: 종료를 반영하는 엔진(pesync)은 «푸른이알피를 열어야만» 돈다.
//   계약을 종료하고 푸른이알피를 안 열면 업무관리는 영영 모른다.
//
// 이 검사가 지키는 것
//   ① 저기가 닫혔고 여기가 열렸을 때만 닫는다 (한 방향)
//   ② 사람이 여기서 «나중에» 손댄 흔적이 있으면 그대로 둔다 (재개를 도로 덮지 않는다)
//   ③ 끝낸 방식(종료·취소·이관)을 원본에서 가져온다
//   ④ 조용히 지우지 않는다 — 몇 건이 왜 빠졌는지 말해 준다
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const W = fs.readFileSync(path.join(__dirname, '..', 'work.html'), 'utf8').replace(/\r\n/g, '\n');
const P = fs.readFileSync(path.join(__dirname, '..', 'pu-erp.html'), 'utf8').replace(/\r\n/g, '\n');

function grab(src, name){
  const i = src.indexOf('function ' + name + '(');
  assert.ok(i >= 0, '못 찾음: ' + name);
  let d = 0, j = i;
  for(;;j++){ if(src[j] === '{') d++; else if(src[j] === '}'){ d--; if(!d){ j++; break; } } }
  return src.slice(i, j);
}

const AUTO = grab(W, 'peAutoSync');
/* 닫는 대목만 떼어 본다 */
const 닫기 = AUTO.slice(AUTO.indexOf("if(it.state!=='done'){"),
  AUTO.indexOf('// 이미 종료된 건의 "끝낸 방식"'));

/* ══════════════════════════════════════════════
   ① 한 방향으로만 닫는다
   ══════════════════════════════════════════════ */
test('★ 여기가 «열려 있을 때만» 손댄다 — 이미 닫힌 건은 안 건드린다', () => {
  assert.match(닫기, /if\(it\.state!=='done'\)\{/);
});

test('★ 저기가 «닫혀 있을 때만» 닫는다', () => {
  assert.match(닫기, /if\(_rc&&_peClosed\(_rc\)\)\{/);
});

test('⚠ 그 반대(여기서 닫고 저기가 열림)는 손대지 않는다 — 두 곳이 서로 되돌리며 싸운다', () => {
  // 여는(state 를 지우는) 코드가 여기 있으면 안 된다
  assert.ok(닫기.indexOf("'state']=null") < 0);
  assert.ok(닫기.indexOf("'state']=''") < 0);
  assert.match(AUTO, /그 반대\(여기서 닫고 저기가 열림\)는 손대지 않는다/);
});

test('종료 판정은 이미 있는 잣대를 쓴다 — 새로 만들지 않았다', () => {
  assert.match(닫기, /_peClosed\(_rc\)/);
  // _peClosed 는 푸른이알피 isItemClosed 와 같은 규칙이다
  const C = grab(W, '_peClosed');
  ['closed', 'cancelled', 'transferred'].forEach(s =>
    assert.ok(C.indexOf("'" + s + "'") > 0, s + ' 을 안 본다'));
  assert.match(C, /closedDate\|\|x\.closedAt/);
});

/* ══════════════════════════════════════════════
   ② 사람이 되살린 것을 도로 덮지 않는다
   ══════════════════════════════════════════════ */
test('★★ 여기서 «나중에» 손댔으면 그대로 둔다 — 재개를 도로 덮으면 안 된다', () => {
  assert.match(닫기, /var _peAt=String\(_rc\.closedAt\|\|_rc\.closedDate\|\|_rc\.updatedAt\|\|''\);/);
  assert.match(닫기, /var _wsAt=String\(it\.state_at\|\|''\);/);
  assert.match(닫기, /if\(!\(_wsAt&&_peAt&&_wsAt>_peAt\)\)\{/);
});

test('pesync 와 «같은 잣대»다 — 두 곳이 다르게 판단하면 번갈아 되돌린다', () => {
  const ENG = P.slice(P.indexOf('function wsSyncRun('), P.indexOf('function MyDeskV2('));
  // 엔진도 「더 최근에 바뀐 쪽을 따른다」로 푼다
  assert.match(ENG, /peAt > wsAt\) \? peClosed : wsDone/);
});

/* ══════════════════════════════════════════════
   ③ 끝낸 방식을 원본에서 가져온다
   ══════════════════════════════════════════════ */
test('종료·취소·이관을 갈라 적는다 — 「끝났다」로 뭉개지 않는다', () => {
  assert.match(닫기, /var _w=peEndWay\(_rc\)\|\|'done';/);
  assert.match(닫기, /up\[P\+'end_way'\]=_w;/);
  assert.match(닫기, /END_BY_KEY\[_w\]/);
});

test('이관이면 어디로 갔는지도 남긴다', () => {
  assert.match(닫기, /if\(_w==='transfer'&&_rc\.transferredTo\) up\[P\+'end_to'\]=String\(_rc\.transferredTo\);/);
});

test('끝난 날짜는 원본의 종료일을 쓴다 — 오늘로 적으면 언제 끝났는지가 사라진다', () => {
  assert.match(닫기, /up\[P\+'done_date'\]=String\(_rc\.closedDate\|\|_rc\.closedAt\|\|todayStr\(\)\)\.slice\(0,10\);/);
});

test('사건 결과가 있으면 함께 가져온다', () => {
  assert.match(닫기, /var _rr=peResult\(_rc\); if\(_rr\) up\[P\+'end_result'\]=_rr;/);
});

test('손댄 때를 남긴다 — 다음 판에 누가 먼저였는지 가릴 수 있어야 한다', () => {
  assert.match(닫기, /up\[P\+'state_at'\]=new Date\(\)\.toISOString\(\);/);
});

/* ══════════════════════════════════════════════
   ④ 조용히 지우지 않는다
   ══════════════════════════════════════════════ */
test('★ 몇 건이 왜 빠졌는지 말해 준다 — 여든 건이 소리 없이 사라지면 안 된다', () => {
  assert.match(AUTO, /if\(closed\) toast\(/);
  assert.match(AUTO, /푸른이알피에서 끝난 '\+closed\+'건을 종료로 옮겼습니다/);
  assert.match(AUTO, /종료 화면에서 볼 수 있습니다/, '어디서 볼 수 있는지 길을 알려 준다');
});

test('센 것이 없으면 아무 말도 안 한다', () => {
  assert.match(AUTO, /if\(closed\) toast/);
  assert.ok(AUTO.indexOf('toast(\'✅ 푸른이알피에서 끝난 \'+closed') < 0
    || /if\(closed\) toast/.test(AUTO));
});

/* ══════════════════════════════════════════════
   ⑤ 푸른이알피 쪽에서도 곧바로 알린다
   ══════════════════════════════════════════════ */
test('★ 계약을 «종료»할 때도 동기화 신호를 찍는다 (이관에만 있었다)', () => {
  const C = grab(P, 'doClose');
  assert.match(C, /archiveContract\(ct, '종료'\);\s*\n\s*wsPingSync\(\);/);
});

test('★ 계약을 «취소»할 때도 찍는다', () => {
  const C = grab(P, 'doCancel');
  assert.match(C, /archiveContract\(ct, '취소'\);\s*\n\s*wsPingSync\(\);/);
});

test('이관 때 찍던 그 신호를 그대로 쓴다 — 새 배관을 놓지 않았다', () => {
  assert.match(grab(P, 'wsPingSync'), /fbDb\.ref\('work_erp\/sync_ping'\)\.set\(/);
});
