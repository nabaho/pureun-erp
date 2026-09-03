/* 구성원 — 직원도 고치고, 담당 업무도 넣는다 (대표 지시 2026-09-02)
   「직원들도 변경 가능하게 만들어 달라 그리고 직원들 업무도 넣을 수 있게」

   홈페이지 구성원 쪽은 «노무사»와 «직원»(사무장·차장·과장·대리·주임) 두 덩이인데,
   이 화면은 노무사만 다루고 있었다. 자료 모양은 처음부터 같았다 — 갈래가 없었을 뿐이다.

   지키는 규칙:
     ① 갈래(노무사·직원)를 화면에서 바꿀 수 있다
     ② ★ 옛 자료를 «지우고 다시 적게 하지 않는다» — 갈래가 없으면 직책에서 읽어 낸다
     ③ ★ 사람이 고른 값이 «직책 추측»을 이긴다
     ④ 담당 업무를 줄 단위로 넣는다 — 경력사항과 «같은 손놀림»
     ⑤ ★ 담당 업무를 경력사항 붙여넣기에 «섞지 않는다» — 섞으면 경력 칸에 업무가 들어간다
     ⑥ 갈래로 걸러 볼 수 있다
   실행: node --test tests/home-staff-duties.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'pu-home.html'), 'utf8');

/* ②③ 갈래 판정은 진짜 함수를 떼어 돌린다 */
function 갈래판정() {
  const at = src.indexOf('function memberKind(m)');
  assert.ok(at > 0, '갈래를 판정하는 함수가 없습니다');
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(src.slice(at, src.indexOf('\n}', at) + 2), ctx);
  return ctx.memberKind;
}

test('★ 옛 자료에도 갈래가 붙는다 — 직책에서 읽어 낸다', () => {
  const 갈래 = 갈래판정();
  /* 지우고 다시 적게 하면 아홉 명을 손으로 다시 골라야 한다 */
  assert.equal(갈래({ position2: '공인노무사' }), 'labor', '노무사를 못 알아봅니다');
  assert.equal(갈래({ position1: '세종지사장', position2: '공인노무사' }), 'labor');
  assert.equal(갈래({ position2: '사무장' }), 'staff', '직원을 노무사로 봤습니다');
  assert.equal(갈래({ position2: '차장' }), 'staff');
  assert.equal(갈래({ position1: '', position2: '' }), 'staff', '직책이 비면 직원으로 둡니다');
});

test('★ 사람이 고른 값이 «추측»을 이긴다', () => {
  const 갈래 = 갈래판정();
  assert.equal(갈래({ kind: 'staff', position2: '공인노무사' }), 'staff',
    '★ 사람이 직원이라고 골랐는데 직책을 보고 되돌립니다');
  assert.equal(갈래({ kind: 'labor', position2: '사무장' }), 'labor',
    '★ 사람이 노무사라고 골랐는데 직책을 보고 되돌립니다');
});

test('① 갈래를 화면에서 바꿀 수 있다', () => {
  assert.match(src, /function kindSet\(k\)/, '갈래를 바꾸는 함수가 없습니다');
  assert.match(src, /window\.kindSet = kindSet/, '화면에서 부를 수 없습니다');
  assert.match(src, /onclick="kindSet\(/, '갈래 단추가 화면에 없습니다');
  assert.match(src, /MEMBER_KINDS\.map/, '갈래 단추를 목록에서 만들지 않습니다');
});

test('갈래가 저장된다 — 화면에서만 바뀌고 끝나면 안 된다', () => {
  const at = src.indexOf('const next = { name: d.name.trim()');
  assert.ok(at > 0, '저장하는 자리를 못 찾았습니다');
  const 저장 = src.slice(at, src.indexOf('};', at));
  assert.match(저장, /kind: d\.mkind === 'staff' \? 'staff' : 'labor'/, '갈래를 안 담습니다');
  assert.match(저장, /duties: duties/, '담당 업무를 안 담습니다');
});

test('★ 초안이 draft.kind 와 갈래를 헷갈리지 않는다', () => {
  /* draft.kind 는 이미 «어느 화면의 초안인가»(member/page/partner)다.
     같은 이름을 두 뜻으로 쓰면 저장이 엉뚱한 갈래로 간다. */
  assert.match(src, /mkind: memberKind\(m\)/, '초안이 갈래를 안 싣습니다');
  /* ⚠ 「mkind: memberKind(m)」 안에 「kind: memberKind(m)」 이 글자로 들어 있다 —
     글자만 찾으면 옳은 줄을 틀렸다고 한다. 앞이 낱말 경계인지까지 본다. */
  assert.ok(!/[^m]kind: memberKind\(m\)/.test(src),
    '★ draft.kind 를 덮어썼습니다 — 저장이 엉뚱한 갈래로 갑니다');
});

test('④ 담당 업무를 경력사항과 «같은 손놀림»으로 다룬다', () => {
  for (const fn of ['dutyEdit', 'dutyAdd', 'dutyDel', 'dutyMove']) {
    assert.match(src, new RegExp('function ' + fn + '\\('), fn + ' 이 없습니다');
    assert.match(src, new RegExp('window\\.' + fn + ' = ' + fn), fn + ' 을 화면에서 못 부릅니다');
  }
  assert.match(src, /id="dutyBox"/, '담당 업무 칸이 화면에 없습니다');
  /* ⚠ 2026-09-03 고쳤다. 원래 글자를 그대로 박아 두었다 —
       「담당 업무 — ' + 업무.length + '줄」.
     대표 지적으로 «비어 있으면 0줄이라 안 적게» 바꾸자(저장소 규칙: 0 같은 빈 값은
     안 그린다. 「자문사현황 0개사」도 같은 까닭으로 지웠다) 이 검사가 깨졌다 —
     기능이 망가져서가 아니라 «지금 값»을 박아 두었기 때문이다(CLAUDE.md).
     못 박아야 할 것은 글자가 아니라 규칙이다: «줄이 있으면 몇 줄인지 알려 준다». */
  assert.match(src, /업무\.length \+ '줄/, '★ 몇 줄인지 안 알려 줍니다');
  assert.match(src, /업무\.length \?[^:]*줄/,
    '★ 0줄일 때도 「— 0줄」을 적는다 — 빈 값은 자리만 차지한다');
  assert.match(src, /onclick="dutyAdd\(\)">＋ 줄 추가/, '줄을 더할 길이 없습니다');
});

test('★⑤ 담당 업무를 경력사항 붙여넣기에 섞지 않는다', () => {
  /* 섞으면 홈페이지 «경력 칸»에 업무가 들어간다. 어느 칸에 넣을지는 사람이 정한다. */
  const at = src.indexOf('const text = PuHomeExport.careersText(');
  assert.ok(at > 0, '붙여넣을 글을 만드는 자리를 못 찾았습니다');
  const 만드는곳 = src.slice(at, at + 400);
  assert.ok(!/duties/.test(만드는곳),
    '★ 경력 붙여넣기에 업무가 섞였습니다 — 홈페이지 경력 칸이 더럽혀집니다');
  assert.match(src, /function copyDuties\(\)/, '업무만 따로 복사할 길이 없습니다');
});

test('⑥ 갈래로 걸러 볼 수 있다', () => {
  assert.match(src, /k: 'kind:' \+ mk\.key/, '갈래 딱지를 안 만듭니다');
  assert.match(src, /f\.indexOf\('kind:'\) === 0/, '갈래 딱지를 눌러도 안 걸러집니다');
  /* 한쪽이 0명이면 딱지를 안 낸다 — 눌러 봐야 빈 화면인 딱지는 자리만 먹는다 */
  assert.match(src, /if \(n\) defs\.push\(\{ k: 'kind:'/, '0명짜리 딱지도 냅니다');
});
