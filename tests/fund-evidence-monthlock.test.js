/* 거래 증빙 · 월마감
 *
 * 대표 검토 2026-08-24 ⑤·⑦:
 *   ⑤ 분개는 있는데 영수증이 안 붙는다 — 감사·세무조사에서 묻는 것이 그것이다
 *   ⑦ 연간 일정에 「매월 말 월마감」이 있는데 잠글 방법이 없다
 *
 * ⚠ 이 저장소는 통째로 github.io 로 공개된다 — 실제 이름·금액 금지. 여기 자료는 전부 가짜다.
 *
 * 지켜야 하는 것
 *  ① 사진 원본은 사진첩에 두고 거래에는 «참조»만 — 이미지를 담으면 거래 목록이 느려진다
 *  ② 잠근 달은 고치는 문 «전부»가 막힌다 — 하나라도 열려 있으면 자물쇠가 아니다
 *  ③ 월마감은 되돌릴 수 있다 — 결산 확정과 달리 「일하는 중」의 표시다
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'fund.html'), 'utf8');

function grabFn(name) {
  const i = SRC.indexOf('function ' + name + '(');
  assert.ok(i >= 0, 'fund.html 에 함수가 없다: ' + name);
  let d = 0, on = false;
  for (let j = i; j < SRC.length; j++) {
    if (SRC[j] === '{') { d++; on = true; }
    else if (SRC[j] === '}') { d--; if (on && !d) return SRC.slice(i, j + 1); }
  }
  throw new Error('함수 끝을 못 찾음: ' + name);
}

/* ══════ 같은 이름의 함수를 두 번 선언하지 않는다 ══════
   2026-08-24 실제로 걸렸다. 달을 뽑는 함수를 _mkey 로 지었는데, 그 이름은 이미
   «기금 이름 다듬기»(푸른이알피 청구 → 기금 잇기)가 쓰고 있었다. 같은 이름으로 또
   선언하면 «나중 것이 이긴다» — 오류도 안 나고, 청구 잇기가 조용히 망가진다.
   (그래서 _monthOf 로 바꿨다.)
   한 파일에 함수가 550개가 넘는다. 사람 눈으로는 못 막는다. */
test('같은 이름의 함수를 두 번 선언하지 않는다', () => {
  const seen = {}, dup = [];
  for (const m of SRC.matchAll(/^function ([A-Za-z_$][\w$]*)\s*\(/gm)) {
    if (seen[m[1]]) dup.push(m[1]); else seen[m[1]] = 1;
  }
  assert.deepEqual([...new Set(dup)], [],
    '나중 선언이 앞의 것을 조용히 덮어쓴다 — 이름을 바꿀 것');
});

/* ══════ 월마감 판정 — 순수 계산 ══════ */
function lockCalc(months) {
  const box = {};
  new Function('M', 'T', [
    'var S={f15Close:{months:M},txns:T};',
    grabFn('_monthOf'), grabFn('monthLocked'), grabFn('txnLocked'),
    'this.o={mkey:_monthOf,locked:monthLocked,txn:txnLocked};'
  ].join('\n')).call(box, months || {}, {
    T1: { date: '2025-03-14' }, T2: { date: '2025-07-02' }, T3: { date: '' }
  });
  return box.o;
}

test('날짜에서 «달»만 뽑는다 — 이상한 값은 빈 값', () => {
  const C = lockCalc();
  assert.equal(C.mkey('2025-03-14'), '03');
  assert.equal(C.mkey('2025-12-31'), '12');
  assert.equal(C.mkey('2025-13-01'), '', '13월은 없다');
  assert.equal(C.mkey('2025-00-01'), '', '0월은 없다');
  assert.equal(C.mkey(''), '');
  assert.equal(C.mkey(null), '');
});

test('잠근 달의 거래만 잠긴다', () => {
  const C = lockCalc({ '03': { at: '2025-04-01' } });
  assert.equal(C.locked('03'), true);
  assert.equal(C.locked('07'), false);
  assert.equal(C.txn('T1'), true, '3월 거래는 잠겨야 한다');
  assert.equal(C.txn('T2'), false, '7월은 안 잠갔다');
  assert.equal(C.txn('T3'), false, '날짜가 없으면 어느 달에도 안 걸린다');
  assert.equal(C.txn('없는거래'), false);
});

test('아무 달도 안 잠갔으면 아무것도 안 잠긴다', () => {
  const C = lockCalc({});
  assert.equal(C.txn('T1'), false);
  assert.equal(C.locked('03'), false);
});

/* 여기가 이 기능의 전부다 — 문 하나라도 열려 있으면 자물쇠가 아니다 */
test('고치는 문 «다섯»이 모두 막힌다', () => {
  [['setTxnAcct', '계정 지정'], ['approveTxn', '승인'], ['delTxn', '삭제'],
   ['splitSave', '쪼개기'], ['addTxnSave', '새 거래']].forEach(([fn, what]) => {
    const body = grabFn(fn);
    assert.match(body, /txnLocked\(|monthLocked\(/, what + ' 이 잠긴 달에도 열려 있다: ' + fn);
    assert.match(body, /_lockStop\(/, what + ' 을 막고도 왜 막혔는지 안 알려 준다: ' + fn);
  });
});

test('막는 자리는 «맨 앞»이다 — 쓰고 나서 막으면 늦다', () => {
  ['setTxnAcct', 'approveTxn', 'delTxn', 'addTxnSave'].forEach(fn => {
    const body = grabFn(fn);
    const guard = body.search(/txnLocked\(|monthLocked\(/);
    const write = body.search(/fbDb\.ref|confirmM\(/);
    assert.ok(guard >= 0 && (write < 0 || guard < write),
      fn + ': 서버에 쓰거나 물어본 «뒤»에 막고 있다');
  });
});

test('새 거래는 «그 거래의 달»로 가린다 — 오늘 날짜가 아니다', () => {
  const body = grabFn('addTxnSave');
  assert.match(body, /_monthOf\(_nd&&_nd\.value\)/, '화면에 적은 일자를 봐야 한다');
  assert.ok(!/_monthOf\(ymd\(\)\)/.test(body), '오늘 날짜로 가리면 지난 달에 끼워 넣는 것을 못 막는다');
});

test('월마감은 되돌릴 수 있고, 풀 때 한 번 묻는다', () => {
  const body = grabFn('monthLockSet');
  assert.match(body, /if\(!on\)\{ confirmM/, '풀 때 아무것도 안 묻는다');
  assert.match(body, /\.set\(on\?\{at:ymd\(\),by:\(S\.user\|\|''\)\}:null\)/,
    '누가 언제 잠갔는지 안 남기거나, 풀 때 안 지운다');
  assert.match(body, /_cbDirty\(\)/, '결산 대장이 옛 상태를 들고 있는다');
  assert.match(body, /S\.f15For=null/, '결산 화면이 새 자물쇠를 못 본다');
});

test('자물쇠 줄은 «거래가 있는 달»만 그린다', () => {
  const body = grabFn('monthLockBar');
  assert.match(body, /if\(cnt\[mm\]\) ms\.push/, '거래가 없는 달까지 12개를 늘어놓는다');
  assert.match(body, /if\(!x\.approved\) un\[m\]/, '그 달 미승인 건수를 안 세어 준다');
  assert.ok(SRC.includes("'close.month':{t:"), 'ⓘ 설명이 등록되지 않았다');
});

/* ══════ 거래 증빙 ══════ */
test('원본은 사진첩에 두고 거래에는 참조만 남긴다', () => {
  const save = grabFn('saveTxnScanRef');
  assert.match(save, /txns\/'\+fid\+'\/'\+yr\+'\/'\+id\+'\/scan/, '거래 아래 scan 에 넣어야 한다');
  assert.match(save, /\{at:ymd\(\),by:\(S\.user\|\|''\)\}/, '언제·누가 붙였는지 안 남는다');
  /* 이미지 자체를 담으면 거래 목록이 통째로 느려진다 */
  assert.ok(!/data:image|toDataURL|loadFull/.test(save), '이미지를 거래에 담고 있다');
});

test('증빙은 판독하지 않는다 — 「받았다」를 증명하는 서류다', () => {
  const pick = grabFn('pickAlbumPhoto');
  const i = pick.indexOf('_pick.txn');
  assert.ok(i > 0, '거래 증빙 길이 없다');
  const branch = pick.slice(i, i + 220);
  assert.ok(!/readDocInto|loadFull/.test(branch), '증빙을 판독하려 든다 — 영수증에서 채울 칸이 없다');
  assert.match(branch, /saveTxnScanRef\(/, '참조를 안 남긴다');
});

test('연결 해제는 사진첩 사진을 지우지 않는다', () => {
  const un = grabFn('unlinkTxnScan');
  assert.match(un, /사진첩의 사진은 그대로 남습니다/, '무엇이 지워지는지 안 말해 준다');
  assert.match(un, /scan'\)\.remove\(\)/, '참조만 지워야 한다');
  assert.ok(!/PuPhotoStore/.test(un), '사진첩 원본에 손대고 있다');
});

test('증빙 세기는 «출금» 거래 기준이다', () => {
  const i = SRC.indexOf('출금 거래에 붙은 영수증');
  assert.ok(i > 0, '증빙 몇 건인지 안 세어 준다');
  const near = SRC.slice(i - 400, i + 60);
  assert.match(near, /num\(x\.withdraw\)>0/, '입금까지 세면 영원히 다 못 채운다');
  assert.ok(SRC.includes("'txn.scan':{t:"), 'ⓘ 설명이 등록되지 않았다');
});

test('화면 배선 — 증빙 칸과 자물쇠 줄이 붙어 있다', () => {
  assert.ok(SRC.includes('onclick="openTxnScan('), '붙은 증빙을 볼 수 없다');
  assert.ok(SRC.includes('openAlbumPick(\\\'\\\',\\\'\\\',null,\\\'\\\','), '사진첩에서 고르는 길이 없다');
  assert.ok(SRC.includes('monthLockBar(arr)'), '자물쇠 줄이 화면에 안 붙었다');
  /* 몸통에 칸을 더했으면 머리도 맞춰야 한 칸씩 밀리지 않는다 */
  assert.match(SRC, /<th>승인<\/th><th[^>]*>증빙/, '표 머리에 증빙 칸이 없다 — 칸이 밀린다');
});
