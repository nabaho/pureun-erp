'use strict';
/* ══════ 「어느 폴더가 계약종료 폴더인가」를 한 규칙으로 (점검 A4) ══════
   같은 물음에 답이 «두 벌»이었고, 보는 글자가 서로 달랐다.

     erpClosedFolderOf  명함·사업자용 — 이름에 「업체」가 있고 (종료|퇴사)
     coClosedFolder     회사용       — 이름에 (업체|사업장) 이 있고 (해지|종료|퇴사)

   지금은 대표님 폴더 이름이 «우연히» 둘 다 통과할 뿐이다 —
     회사 쪽 「2. 계약해지사업장」  · 명함 쪽 「2.업체종료 및 퇴사」
   명함 폴더를 「2. 계약해지」로 바꾸시면 「업체」가 빠져 명함 쪽이 «못 찾고 새로 만든다».
   종료 업체가 두 폴더로 갈린다 — 2026-08-29 에 실제로 겪은 그 일이다.

   ★ 한 규칙으로 모은다 — 넓은 쪽(회사용)에 맞춘다. 좁히면 지금 찾던 것을 잃는다. */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('node:vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'pu-cards.html'), 'utf8');

function fn(name) {
  const at = SRC.search(new RegExp('(?:^|\\n)(?:async )?function ' + name + '\\('));
  assert.ok(at >= 0, name + ' 을 찾지 못했다');
  const open = SRC.indexOf('{', at);
  let d = 0;
  for (let k = open; k < SRC.length; k++) {
    if (SRC[k] === '{') d++;
    else if (SRC[k] === '}') { d--; if (!d) return SRC.slice(at, k + 1); }
  }
  throw new Error(name + ' 의 끝을 찾지 못했다');
}
const CANON = SRC.slice(SRC.indexOf('const _canon ='), SRC.indexOf('\n', SRC.indexOf('const _canon =')))
  .replace(/^const /, 'var ');

function ctx() {
  const b = {};
  vm.createContext(b);
  vm.runInContext(CANON, b);
  vm.runInContext(fn('closedFolderName'), b);
  return b;
}
const isClosed = (b, nm) => vm.runInContext('closedFolderName(' + JSON.stringify(nm) + ')', b);

/* ── ① 한 규칙이 둘을 다 알아본다 ───────────────────────────────── */
test('★ 대표님이 쓰시는 두 폴더를 «한 규칙»이 다 알아본다', () => {
  const b = ctx();
  assert.equal(isClosed(b, '2. 계약해지사업장'), true, '회사 쪽 폴더를 못 알아본다');
  assert.equal(isClosed(b, '2.업체종료 및 퇴사'), true, '명함 쪽 폴더를 못 알아본다');
});

test('★ 이름을 「2. 계약해지」로 바꿔도 알아본다 — 이것이 터질 자리였다', () => {
  const b = ctx();
  assert.equal(isClosed(b, '2. 계약해지'), true,
    '★ 「업체」가 빠지면 못 찾아 새 폴더를 만든다 — 종료 업체가 두 곳으로 갈린다');
  assert.equal(isClosed(b, '계약종료 사업장'), true);
  assert.equal(isClosed(b, '업체퇴사'), true, '예전 이름을 잃었다');
  /* ⚠ 「사업장」만으로 걸리는 이름이 하나는 있어야 한다. 위 셋은 모두 「계약해지」·
     「계약종료」가 통째로 들어 있어 «앞 갈래»에서 걸린다 — 「업체·사업장」 조건에서
     사업장을 빼도 다 통과했다(2026-08-30 고장 시험에서 샜다). */
  assert.equal(isClosed(b, '사업장 해지분'), true,
    '★ 「사업장」이 든 이름을 못 알아본다');
});

/* ── ② 멀쩡한 폴더는 안 걸린다 ─────────────────────────────────── */
test('★ 살아 있는 거래처 폴더는 안 걸린다', () => {
  const b = ctx();
  [['1. 업체관리', '살아 있는 거래처 폴더로 종료 업체를 보낸다'],
   ['노무사', ''], ['전문가', ''], ['지인', ''], ['기관·공공', ''],
   ['통합기술보호지원단', ''], ['일터상생혁신컨설팅', '']].forEach(([nm, why]) => {
    assert.equal(isClosed(b, nm), false, '★ 「' + nm + '」이 걸렸다 ' + why);
  });
});

test('해지·종료와 «상관없는» 곳은 안 걸린다', () => {
  const b = ctx();
  [['연말정산 종료분', '해지와 무관한 「종료」'],
   ['퇴사자 서류', '사람 서류함']].forEach(([nm, why]) => {
    assert.equal(isClosed(b, nm), false, '★ ' + why + '에 업체를 보낸다');
  });
});

/* ── ③ 두 곳이 «같은» 규칙을 쓴다 ──────────────────────────────── */
test('★ 명함·사업자 쪽과 회사 쪽이 같은 규칙을 부른다', () => {
  const bare = s => s.replace(/\/\*[\s\S]*?\*\//g, ' ');
  ['erpClosedFolderOf', 'coClosedFolder'].forEach(n => {
    const src = bare(fn(n));
    assert.ok(/closedFolderName\(/.test(src),
      '★ ' + n + ' 이 제 잣대를 따로 갖고 있다 — 한쪽만 고치면 다시 갈린다');
    assert.ok(!/indexOf\('종료'\)|indexOf\('해지'\)|indexOf\('퇴사'\)/.test(src),
      '★ ' + n + ' 안에 잣대가 아직 박혀 있다');
  });
});

/* ── ④ 갈래는 그대로 가른다 ────────────────────────────────────── */
test('명함용·사업자용을 여전히 가른다 — 이름이 같아도 섞이면 안 된다', () => {
  const b = { _canon: s => String(s || '').replace(/^\s*\d+\s*[.)\-]?\s*/, '').replace(/\s/g, ''),
              state: { groups: { a: { id: 'a', kind: 'card', name: '2. 계약해지' },
                                 b: { id: 'b', kind: 'biz', name: '2. 계약해지' } } } };
  vm.createContext(b);
  vm.runInContext(fn('closedFolderName'), b);
  vm.runInContext(fn('erpClosedFolderOf'), b);
  assert.equal(vm.runInContext("erpClosedFolderOf('card').id", b), 'a');
  assert.equal(vm.runInContext("erpClosedFolderOf('biz').id", b), 'b');
});

test('없으면 null — 새로 만들지 않는다', () => {
  const b = { _canon: s => String(s || ''), state: { groups: { a: { id: 'a', kind: 'card', name: '1. 업체관리' } } } };
  vm.createContext(b);
  vm.runInContext(fn('closedFolderName'), b);
  vm.runInContext(fn('erpClosedFolderOf'), b);
  assert.equal(vm.runInContext("erpClosedFolderOf('card')", b), null);
});
