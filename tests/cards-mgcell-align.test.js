/* ══════ 담당 칸은 «세로로 줄이 선다» (대표 보고 2026-08-29) ══════
   대표님: 「담당 이름 셀 정렬해달라 안 움직이게」

   까닭: 담당 칸이 오른쪽 정렬이었다. 그런데 이름 딱지 «뒤에» 딱지가 더 붙는다 —
   역할 한 글자(대·담·실), 🚪 계약해지, ⚠ 값 어긋남, +1 부담당.
   오른쪽 정렬이면 뒤 딱지가 «있는 줄만» 이름을 왼쪽으로 밀어낸다.

   브라우저에서 재 보니 (같은 「자문 박재원」인데)
       딱지 없음      왼쪽 끝 347px
       「담」 하나     왼쪽 끝 324px
       「담」+🚪      왼쪽 끝 306px      → 줄마다 41px 어긋남
   왼쪽 정렬로 바꾸면 셋 다 16px — 어긋남 0.

   ⚠ 이름은 «눈으로 훑는» 값이다. 줄이 안 서면 훑을 수가 없다. */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('node:vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'pu-cards.html'), 'utf8');

/* 이 칸에 걸리는 정렬 규칙을 «나오는 차례대로» 모은다.
   .dt 와 td.mgcell 이 둘 다 걸리므로 뒤엣것이 이긴다 — 한쪽만 보면 헛본다. */
function alignsOn() {
  const out = [];
  [/#pcTable \.dt\{([^}]*)\}/, /#pcTable td\.mgcell\{([^}]*)\}/].forEach(re => {
    const m = SRC.match(re);
    assert.ok(m, re + ' 규칙을 찾지 못했다');
    const a = m[1].match(/text-align:\s*([a-z]+)/);
    if (a) out.push(a[1]);
  });
  return out;
}

test('★ 담당 칸이 «왼쪽» 정렬이다 — 뒤 딱지가 이름을 밀지 않게', () => {
  const list = alignsOn();
  assert.equal(list[list.length - 1], 'left',
    '★ 담당 칸이 오른쪽 정렬이다 — 「담」·🚪 가 붙은 줄만 이름이 왼쪽으로 밀린다(41px)');
});

test('머리글도 값과 같은 쪽으로 붙는다', () => {
  const m = SRC.match(/<th style="text-align:(\w+)">담당/);
  assert.ok(m, '담당 머리글을 찾지 못했다');
  assert.equal(m[1], 'left', '머리글과 값이 서로 다른 쪽에 붙으면 어느 칸인지 헷갈린다');
});

/* 진짜로 만들어진 글을 본다.
   ⚠ 처음에는 «소스 글자 차례»만 봤는데, 「+1 을 이름 앞에 붙이는」 고장을 못 잡았다
     (소스에는 뒤에 적혀 있어도 h 를 앞에 이어 붙이면 화면에서는 앞으로 온다).
     소스를 보는 검사는 소스를 지킬 뿐 화면을 못 지킨다 — 만들어서 본다. */
function makeBadge(it, opt) {
  const at = SRC.indexOf('const erpBadge = (function(){');
  assert.ok(at >= 0, '담당 칸 만드는 곳을 찾지 못했다');
  const open = SRC.indexOf('{', SRC.indexOf('(function(', at) + 9);
  let d = 0, end = -1;
  for (let k = open; k < SRC.length; k++) {
    if (SRC[k] === '{') d++;
    else if (SRC[k] === '}') { d--; if (!d) { end = k; break; } }
  }
  assert.ok(end > 0, '담당 칸의 끝을 찾지 못했다');
  const o = opt || {};
  const box = {
    esc: s => String(s == null ? '' : s),
    MGB_CLS: { 자문: 't-adv', 급여: 't-pay' },
    ErpMatch: {
      type: () => o.type || '자문',
      match: () => ({ left: !!o.left }),
      mgrs: () => o.mgrs || ['박재원'],
      full: () => '자문 박재원',
      role: () => o.role || '',
      isContact: () => !!o.work
    },
    __it: it || {}
  };
  vm.createContext(box);
  return vm.runInContext('(function(it){ return ' + SRC.slice(SRC.indexOf('(function(', at), end + 1) + ')(); })(__it)', box);
}

test('★ 이름 딱지가 «만들어진 글에서» 맨 앞에 온다 — 그래야 왼쪽에 선다', () => {
  /* 딱지를 다 붙여 놓고 본다 — 하나만 붙이면 순서가 시험되지 않는다 */
  const h = makeBadge({}, { mgrs: ['박재원', '박은비'], role: 'contact', left: true });
  const name = h.indexOf('class="mgb ');
  assert.ok(name >= 0, '이름 딱지가 아예 없다');
  ['class="mgx"', 'class="mgr r-', 'class="mgq"'].forEach(k => {
    const at = h.indexOf(k);
    assert.ok(at >= 0, k + ' 딱지가 없다 — 검사가 헛돌고 있다');
    assert.ok(name < at,
      '★ ' + k + ' 이 이름보다 앞에 온다 — 왼쪽 정렬이어도 줄마다 이름이 밀린다');
  });
});

test('딱지가 늘어도 이름은 «같은 글자로 시작»한다', () => {
  const bare = makeBadge({}, {});
  const many = makeBadge({}, { mgrs: ['박재원', '박은비'], role: 'contact', left: true });
  assert.equal(bare.indexOf('class="mgb '), many.indexOf('class="mgb '),
    '딱지 수에 따라 이름 앞에 붙는 것이 달라진다');
});

test('줄바꿈 막기는 그대로 둔다 — 풀면 칸이 두세 줄로 접힌다', () => {
  const m = SRC.match(/#pcTable td\.mgcell\{([^}]*)\}/);
  assert.ok(/white-space:\s*nowrap/.test(m[1]),
    '2026-08-11 에 「컴팩트하게」로 고친 한 줄 고정이 풀렸다');
});
