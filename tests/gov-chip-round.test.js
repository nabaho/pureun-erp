'use strict';
/* ══════ 달력 칩 — 회차가 «안 잘린다» ══════
   실행: node --test tests/*.test.js

   ■ 무엇이 문제였나 (대표 화면 2026-08-30)
     칩은 「📍 방문 [일터] 스위트바 7회 📷」 한 덩이였다. 칸이 좁으면 뒤부터
     잘리는데 하필 회차가 맨 뒤라, «정작 알려 줘야 할 것»만 사라졌다 —
     여덟 칩이 「7회 …」·「1…」 로 끊겨 있었다. 재 보니 칸보다 16px 넘쳤고
     그 16px 이 회차였다.
     대표 지시: 「회차가 잘 보여야 한다 — 그래야 다음 진행을 준비한다」.

   ★ 여기서 못 박는 것
     · 이름과 회차가 «다른 칸»이다 (한 덩이면 회차가 같이 잘린다)
     · 줄어드는 것은 «이름»이다 (flex 로 이름만 줄고 회차는 붙박이)
     · 「7/8」처럼 전체 회차까지 — 그래야 몇 번 남았는지 안다
     · 전체를 «안 정한» 종류는 「7회」로 (「7/0」은 틀린 말이다)
     · 사전진단은 따로 (본컨설팅 회차와 섞이면 몇 번째인지 모른다) */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'gov-consulting.html'), 'utf8');

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

/* 진짜 chipRound 를 태운다 — 전체 회차만 가짜로 넣는다 */
function box(maxByType) {
  const b = {
    console,
    schedPhase: sc => (sc && sc.phase === 'pre' ? 'pre' : 'main'),
    getCoMaxRounds: (coId, tid) => (maxByType || {})[tid] || 0,
    String, Number, Math,
  };
  vm.createContext(b);
  vm.runInContext(fnSrc('chipRound'), b);
  return b;
}

test('★ 「7/8」 — 전체 회차까지 보여야 «다음 진행»을 준비한다', () => {
  const b = box({ t1: 8 });
  assert.equal(b.chipRound({ round: 7, coId: 'c1', typeId: 't1' }), '7/8');
  assert.equal(b.chipRound({ round: 8, coId: 'c1', typeId: 't1' }), '8/8', '마지막 회차도 그대로');
});

test('★ 전체 회차를 «안 정한» 종류는 그냥 「5회」 — 「5/0」은 틀린 말이다', () => {
  /* 자체·인사노무는 회차를 안 정한다. /0 이 보이면 아무것도 안 알려 주면서
     「전체 0회」라는 틀린 말까지 한다. */
  const b = box({});
  assert.equal(b.chipRound({ round: 5, coId: 'c1', typeId: 't9' }), '5회');
  assert.doesNotMatch(b.chipRound({ round: 5, coId: 'c1', typeId: 't9' }), /\//,
    '★ 전체를 모르는데 빗금을 그었습니다');
});

test('★ 사전진단은 «따로» 적는다 — 본컨설팅 회차와 섞이면 몇 번째인지 모른다', () => {
  const b = box({ t1: 8 });
  const s = b.chipRound({ round: 2, coId: 'c1', typeId: 't1', phase: 'pre' });
  assert.match(s, /사전/, '★ 사전진단이라는 것을 안 적습니다');
  assert.match(s, /2/, '★ 몇 번째인지 안 적습니다');
  assert.doesNotMatch(s, /\/8/, '★ 본컨설팅 전체 회차를 붙였습니다');
});

test('회차가 없으면 0 으로 — 빈칸으로 두지 않는다', () => {
  const b = box({ t1: 8 });
  assert.equal(b.chipRound({ coId: 'c1', typeId: 't1' }), '0/8');
});

test('★ 이름과 회차가 «다른 칸»이다 — 한 덩이면 회차가 같이 잘린다', () => {
  const chip = fnSrc('chipHtml');
  assert.match(chip, /<span class="nm">/, '★ 이름 칸이 없습니다');
  assert.match(chip, /<span class="rd">/, '★ 회차 칸이 없습니다');
  /* 회차가 이름 «안»에 들어가면 예전과 똑같이 잘린다 */
  const nm = chip.slice(chip.indexOf('<span class="nm">'), chip.indexOf('<span class="rd">'));
  assert.doesNotMatch(nm, /chipRound|roundText/, '★ 회차가 이름 칸 안에 있습니다');
});

test('★ 줄어드는 것은 «이름»이다 — 회차는 자리를 지킨다', () => {
  /* flex 로 이름만 늘고 줄게 하고, 회차는 flex:none 으로 붙박이여야 한다.
     ⚠ 값이 아니라 «어느 쪽이 줄어드는가»를 본다. */
  const css = SRC.replace(/\/\*[\s\S]*?\*\//g, ' ');
  const chip = (css.match(/\.chip\{[^}]*\}/) || [''])[0];
  const nm = (css.match(/\.chip>\.nm\{[^}]*\}/) || [''])[0];
  const rd = (css.match(/\.chip>\.rd\{[^}]*\}/) || [''])[0];
  assert.match(chip, /display:\s*flex/, '★ 칩이 두 칸으로 안 나뉩니다');
  assert.match(nm, /flex:\s*1/, '★ 이름이 줄어들지 않습니다');
  assert.match(nm, /min-width:\s*0/,
    '★ min-width:0 이 없으면 flex 칸이 안 줄어 회차가 밀려납니다');
  assert.match(nm, /text-overflow:\s*ellipsis/, '★ 이름이 … 로 안 줄어듭니다');
  assert.match(rd, /flex:\s*none/, '★ 회차가 붙박이가 아닙니다 — 같이 줄어듭니다');
  /* 예전처럼 칩 자체에 ellipsis 를 걸면 두 칸으로 나눈 뜻이 없어진다 */
  assert.doesNotMatch(chip, /text-overflow/,
    '★ 칩 자체를 … 로 자르면 회차가 다시 잘립니다');
});
