/* 승계표 — 세 앱이 «같은 표»를 본다 (대표 지시 2026-08-27)
   "푸른이알피 또는 업무관리에서 승계정리를 하면 업무관리는 자동으로 승계되게 해달라"
   "푸른이알피에서 변경해도 자동으로 다른곳도 모두 동기화 되어서 변경될 수 있게"

   ★ 이 검사가 지키는 것은 «한 가지»다 — 세 앱이 «같은 자리»를 보고 «같은 열쇠»를 쓴다.
     한 곳이라도 어긋나면 메일은 A, 업무는 B 에게 가서 아무도 그 사람 몫 전부를 못 본다.
     그리고 그것은 «화면에서는 잘 되는 것처럼 보인다» — 각자 제 표를 잘 읽으니까.
     그래서 사람 눈으로는 못 잡는다. 검사가 잡아야 한다.

   ⚠ 글자를 못 박는 검사다. 그러나 여기서 못 박는 것은 «약속»이다 —
     세 앱이 합의한 경로 문자열이 곧 그 약속이다. */
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const CARDS = fs.readFileSync(path.join(ROOT, 'pu-cards.html'), 'utf8');
const WORK  = fs.readFileSync(path.join(ROOT, 'work.html'), 'utf8');
const ERP   = fs.readFileSync(path.join(ROOT, 'pu-erp.html'), 'utf8');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? ' — ' + extra : '')); }
}

const PATHSTR = 'pucards/config/staffSucc';

console.log('승계표 — 세 앱이 같은 표를 본다');

console.log(' ★ 세 앱이 «같은 자리»를 본다');
ok('메일함(pu-cards)이 그 자리를 쓴다', CARDS.indexOf(PATHSTR) > 0,
  '메일함이 다른 자리를 보면 메일만 안 옮겨진다');
ok('업무관리(work)가 그 자리를 쓴다', WORK.indexOf(PATHSTR) > 0,
  '업무관리가 다른 자리를 보면 업무만 안 넘어간다');
ok('푸른이알피(pu-erp)가 그 자리를 쓴다', ERP.indexOf(PATHSTR) > 0,
  '푸른이알피가 다른 자리에 적으면 아무 데도 안 간다');

console.log(' ★ 세 앱이 «사번»을 열쇠로 쓴다 — 이름은 같을 수 있고 바뀐다');
/* 메일함은 mbSuccOf 가 staff 의 sid 로 찾는다 · 업무관리는 staffBySid ·
   푸른이알피는 u.sid 로 적는다. 셋 다 «이름»으로 적으면 안 된다. */
ok('메일함이 사번으로 찾는다', /mbSuccMap\(\)\[st\.sid\]/.test(CARDS),
  '이름으로 찾으면 동명이인에서 어긋난다');
ok('업무관리가 사번으로 찾는다', /succMap\(\)\[u\.sid\]/.test(WORK));
ok('푸른이알피가 사번으로 적는다', /succWrite\(u\.sid,\s*topSid\)/.test(ERP));

console.log(' ★ «두 번»까지만 따라간다 — 서로 가리키면 멈춘다');
/* 이어받은 사람도 퇴사했을 때 그 다음까지. 규칙이 앱마다 다르면 두 화면이
   서로 다른 사람을 가리킨다. */
ok('메일함에 두 번 규칙이 있다', /두 번까지/.test(CARDS) || /두 번/.test(CARDS));
ok('업무관리에 두 번 규칙이 있다', /두 번/.test(WORK));

console.log(' ★ 남의 앱 자료를 «직접» 고치지 않는다');
/* 푸른이알피가 업무관리 자료(work_erp/items)를 직접 고치면 그쪽 기록이 안 남는다.
   각 앱이 표를 보고 «제 길로» 옮겨야 한다. */
const erpSucc = ERP.slice(ERP.indexOf('function succWrite('), ERP.indexOf('function succPickTop('));
ok('푸른이알피의 승계표 쓰기는 그 자리만 건드린다',
  erpSucc.indexOf('work_erp') < 0 && erpSucc.indexOf('mailbox') < 0,
  '남의 앱 자료를 직접 고치면 그쪽 기록(누가 언제 넘겼나)이 사라진다');

console.log(' ★ 자동 승계는 «기록을 남긴다»');
ok('업무관리가 자동 승계에 까닭을 적는다', WORK.indexOf('승계표대로 자동') > 0,
  '사람이 그때 고른 것이 아니라는 것이 기록에 있어야 한다');
ok('한 건씩 넘긴다', /arr\.forEach\(function\(it\)\{ _handoverTo\(/.test(WORK),
  '통째로 갈아 끼우면 건별 기록이 사라진다');

console.log(' ★ 물어본 뒤에 적는다 — 자동이라도 사람이 정하는 것이다');
ok('푸른이알피가 물어본다', /confirm\(/.test(ERP.slice(ERP.indexOf('var topSid = succPickTop'),
  ERP.indexOf('var topSid = succPickTop') + 1400)));
ok('가장 많이 받은 사람은 «제안»일 뿐이라고 적혀 있다', ERP.indexOf('제안일 뿐이다') > 0);

console.log((fail ? 'FAIL ' : 'ALL ') + (pass + fail) + '개 중 ' + pass + ' 통과'
  + (fail ? ' · ' + fail + ' 실패' : ''));
if (fail) process.exit(1);
