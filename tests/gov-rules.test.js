'use strict';
/* ══════ 정부컨설팅 — 깨지면 크게 다치는 다섯 가지 ══════
   실행: node --test tests/*.test.js

   이 앱은 10,000줄이 넘는데 «규칙을 돌려 보는» 검사가 하나도 없었다.
   그래서 회차·중복·종료·사진 칸·권한처럼 «틀리면 사람이 손해를 보는» 것만
   골라 실제로 함수를 돌린다.

   ⚠ 글자를 찾지 않고 «함수를 돌린다». 소스를 글자로만 보는 검사는 이름만
     바뀌어도 깨지고, 정작 계산이 틀린 것은 못 잡는다.
   ⚠ 지금 값을 박지 않는다. 회차 수·사진 장수 같은 숫자는 대표가 바꾸는 값이다.
     «규칙»(다음 회차는 이미 있는 수 + 1 처럼)만 못 박는다.
   ⚠ 자료를 읽는 함수는 스텁으로 갈아끼운다 — 실데이터를 건드리지 않는다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'gov-consulting.html'), 'utf8');

/* 이름으로 함수 한 덩이를 떠 온다(중괄호 짝을 세어 끝을 찾는다). */
function fnSrc(name) {
  const m = new RegExp('(?:^|\\n)((?:async )?function ' + name + '\\s*\\()').exec(SRC);
  assert.ok(m, '함수를 찾을 수 없습니다: ' + name);
  const start = m.index + (m[0].startsWith('\n') ? 1 : 0);
  let i = SRC.indexOf('{', start), d = 0, k = i;
  while (k < SRC.length) {
    if (SRC[k] === '{') d++;
    else if (SRC[k] === '}') { d--; if (!d) break; }
    k++;
  }
  return SRC.slice(start, k + 1);
}
function constSrc(name) {
  const m = new RegExp('const ' + name + '\\s*=\\s*([^;\\n]+);').exec(SRC);
  assert.ok(m, '상수를 찾을 수 없습니다: ' + name);
  return 'const ' + name + ' = ' + m[1] + ';';
}
/* 필요한 것만 담은 작은 세상에서 돌린다 */
function run(pieces, stubs) {
  const box = Object.assign({ console }, stubs);
  vm.createContext(box);
  vm.runInContext(pieces.join('\n'), box);
  return box;
}

/* ─────────────────────────────────────────────── ① 회차 */
test('① 다음 회차 = 같은 사업장·같은 종류·같은 단계의 «이미 있는 수 + 1»', () => {
  const S = [];
  const box = run([fnSrc('schedPhase'), fnSrc('nextRound')], {
    getScheds: () => S,
    curPhase: () => 'main'
  });

  assert.equal(box.nextRound('co1', 'ty1', 'main'), 1, '아무것도 없으면 1회차');

  S.push({ coId: 'co1', typeId: 'ty1' }, { coId: 'co1', typeId: 'ty1' });
  assert.equal(box.nextRound('co1', 'ty1', 'main'), 3, '두 건 있으면 3회차');

  /* ★ 다른 사업장·다른 종류를 «같이 세면» 회차가 부풀어 의무방문 판정이 어긋난다 */
  S.push({ coId: 'co2', typeId: 'ty1' }, { coId: 'co1', typeId: 'ty2' });
  assert.equal(box.nextRound('co1', 'ty1', 'main'), 3, '남의 사업장·다른 종류가 섞였습니다');

  /* ★ 사전진단과 본컨설팅은 «따로» 센다 — 섞이면 사전진단이 본컨설팅 회차를 먹는다 */
  S.push({ coId: 'co1', typeId: 'ty1', phase: 'pre' });
  assert.equal(box.nextRound('co1', 'ty1', 'main'), 3, '사전진단이 본컨설팅에 섞였습니다');
  assert.equal(box.nextRound('co1', 'ty1', 'pre'), 2, '사전진단을 따로 세지 않습니다');
});

/* ─────────────────────────────────────────────── ② 중복 규칙 */
test('② 같은 날 함께 못 하는 짝은 «순서에 상관없이» 같은 짝이다', () => {
  let MX = {};
  const box = run([fnSrc('conflictKey'), fnSrc('isConflictPair')], {
    getConflictMatrix: () => MX
  });

  MX = { [box.conflictKey('a', 'b')]: 1 };

  /* ★ 순서를 뒤집으면 못 알아보는 것이 이 자리의 고전적인 사고다 —
     A→B 로 등록해 두고 B→A 로 물으면 「괜찮다」고 답해 이중 배정이 난다. */
  assert.equal(box.isConflictPair('a', 'b'), true);
  assert.equal(box.isConflictPair('b', 'a'), true, '★ 순서를 뒤집으면 못 알아봅니다');

  assert.equal(box.isConflictPair('a', 'c'), false, '없는 짝을 있다고 합니다');
  assert.equal(box.isConflictPair('a', 'a'), false, '자기 자신과 겹친다고 합니다');
});

/* ─────────────────────────────────────────────── ③ 종료 판정 */
test('③ 종료는 «사업장 + 그 종류»에만 걸린다 — 다른 종류·다른 사업장은 살아 있다', () => {
  const COS = [
    { id: 'co1', endedTypes: { ty1: '2026-08-01' } },
    { id: 'co2' }
  ];
  const box = run([fnSrc('endedDateForSchedule'), fnSrc('isEndedSchedule')], {
    getCos: () => COS
  });

  assert.equal(box.isEndedSchedule({ coId: 'co1', typeId: 'ty1' }), true);
  assert.equal(box.endedDateForSchedule({ coId: 'co1', typeId: 'ty1' }), '2026-08-01', '종료일을 못 돌려줍니다');

  /* ★ 종류 하나를 끝냈다고 그 사업장 전부가 끝난 것으로 잡히면,
     진행 중인 다른 컨설팅이 화면에서 사라진다. */
  assert.equal(box.isEndedSchedule({ coId: 'co1', typeId: 'ty2' }), false, '★ 다른 종류까지 종료로 잡습니다');
  assert.equal(box.isEndedSchedule({ coId: 'co2', typeId: 'ty1' }), false, '★ 다른 사업장까지 종료로 잡습니다');

  /* 없는 값에도 터지지 않아야 한다 — 목록을 그리다 한 건이 터지면 화면이 통째로 빈다 */
  assert.equal(box.isEndedSchedule(null), false);
  assert.equal(box.isEndedSchedule({}), false);
});

/* ─────────────────────────────────────────────── ④ 사진 칸 */
test('④ 사진 칸 — 증빙 둘 + 추가는 언제나 «2번부터», 지울 칸 이름은 한 곳에서 나온다', () => {
  const TYPES = [
    { id: 'ty1', name: '현장클리닉' },
    { id: 'one', name: '비즈니스지원단' }   // 1장 모드
  ];
  const COS = [{ id: 'co1', extraPhotos: { ty1: 2 } }];
  const box = run([
    constSrc('MAX_EXTRA_PHOTOS'), constSrc('EXTRA_START'),
    fnSrc('plainKey'), fnSrc('timeKey'), fnSrc('photoSlotKeys'),
    fnSrc('isSinglePhotoSched'), fnSrc('baseSlotCount'), fnSrc('extraPhotoCount'),
    fnSrc('hasLegacySingleSlot'), fnSrc('totalSlotCount'), fnSrc('slotLabelText'),
    fnSrc('photoSlotDefs')
  ], { getTypes: () => TYPES, getCos: () => COS, PHOTOS: {} });

  const plain = { id: 's1', coId: 'co1', typeId: 'ty1' };
  assert.equal(box.baseSlotCount(plain), 2, '증빙은 입장·활동 두 칸이다');
  assert.equal(box.baseSlotCount({ id: 's2', coId: 'co1', typeId: 'one' }), 1, '1장 모드가 안 잡힙니다');

  /* ★ 추가 칸은 «항상 2번부터». 1로 시작하면 1장 모드의 예약 칸(c1)과 부딪혀
     촬영 창의 화면 칸과 저장 자리가 어긋난다. */
  const defs = box.photoSlotDefs(plain);
  const extra = defs.filter(d => d.kind === 'extra');
  assert.ok(extra.length > 0, '추가 칸이 안 나옵니다');
  assert.ok(extra.every(d => d.i >= 2), '★ 추가 칸이 2번보다 앞에서 시작합니다');
  /* ⚠ vm 안에서 만든 배열은 «다른 세상»의 Array 라 deepEqual 이 원형까지 보고
     틀렸다고 한다. 글자로 견준다 — 값만 보면 되는 자리다. */
  assert.equal(defs.filter(d => d.kind === 'base').map(d => d.i).join(','), '0,1', '증빙 칸은 0·1번이다');

  /* 칸마다 키가 겹치지 않아야 한다 — 겹치면 한 장을 저장하다 다른 칸을 덮는다 */
  const keys = defs.map(d => d.key);
  assert.equal(new Set(keys).size, keys.length, '★ 칸 키가 겹칩니다');

  /* 늘리기 한도 — 대표가 큰 수를 넣어도 한도 안에서만 늘어난다.
     ⚠ 한도 «숫자»를 박지 않는다(대표가 바꾸는 값이다). 「한도가 있는가」만 본다 —
       큰 수 둘을 넣어 같은 값이 나오면 어딘가에서 잘린 것이다.
     ⚠ vm 안의 const 는 바깥에서 안 보인다(box.MAX_EXTRA_PHOTOS 는 undefined). */
  const big1 = box.extraPhotoCount({ coId: 'co1', typeId: 'ty1', extraPhotos: 999 });
  const big2 = box.extraPhotoCount({ coId: 'co1', typeId: 'ty1', extraPhotos: 5000 });
  assert.equal(big1, big2, '★ 한도가 없습니다 — 넣는 대로 늘어납니다');
  assert.ok(big1 > 0 && big1 < 999, '★ 추가 칸이 한도를 넘습니다: ' + big1);
  assert.equal(box.extraPhotoCount({ coId: 'co1', typeId: 'ty1', extraPhotos: -5 }), 0, '음수는 0으로');

  /* ★ 지울 칸 이름은 «한 곳»에서 나와야 한다. 두 곳에 적어 두었더니 일정을
     지워도 찍은 시각이 남았다(2026-08-29 실제 사고). */
  const k0 = Array.from(box.photoSlotKeys(0));
  assert.ok(k0.includes('c0') && k0.includes('o0'), '합성본·원본이 빠졌습니다');
  assert.ok(k0.includes(box.plainKey(0)), '「안 찍음」 표가 빠졌습니다');
  assert.ok(k0.includes(box.timeKey(0)), '★ 찍은 시각이 빠졌습니다 — 지워도 남습니다');
});

/* ─────────────────────────────────────────────── ⑤ 권한 */
test('⑤ 남의 일정은 못 고친다 — 담당·협업·총괄관리자만', () => {
  let ME = 'me', ADMIN = false;
  const box = run([fnSrc('getCoAtts'), fnSrc('canEdit')], {
    isAdmin: () => ADMIN,
    myId: () => ME
  });

  assert.equal(box.canEdit({ attId: 'me' }), true, '내 일정을 못 고칩니다');
  assert.equal(box.canEdit({ attId: 'other', coAttIds: ['me'] }), true, '협업으로 배정됐는데 못 고칩니다');

  /* ★ 여기가 뚫리면 남의 컨설팅을 아무나 고칠 수 있다 */
  assert.equal(box.canEdit({ attId: 'other' }), false, '★ 남의 일정을 고칠 수 있습니다');
  assert.equal(box.canEdit({ attId: 'other', coAttIds: ['x', 'y'] }), false, '★ 남의 일정을 고칠 수 있습니다');

  /* 총괄관리자는 전부 — 대표가 남의 것을 확인·수정해야 한다(2026-08-21 결정) */
  ADMIN = true;
  assert.equal(box.canEdit({ attId: 'other' }), true, '총괄관리자가 못 고칩니다');

  /* 로그인 정보가 비었을 때 «열리면» 안 된다 */
  ADMIN = false; ME = '';
  assert.equal(box.canEdit({ attId: 'other' }), false, '★ 로그인 없이 열립니다');
  assert.equal(box.canEdit({ attId: '' }), false, '★ 담당자 없는 일정이 아무에게나 열립니다');
});
