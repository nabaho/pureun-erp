/* 계약 중복 확인 — 「어떤 사업인지」·「금액」을 색으로 구분한다 (대표 지시 2026-08-31)
 *
 * ■ 왜 필요한가
 *   같은 사업장에 같은 «종류»(컨설팅 등) 계약이 있어도, 세부 사업이 다르면
 *   실제로는 다른 일이다. 여태 이 확인창은 순수 텍스트라 색을 전혀 못 썼다.
 *   대표: 「계약이 유사하거나 중복되는경우 어떤사업인지 구분되게 색표시해주고
 *          금액도 얼마인지 색표시를 해주면 구분하기 더 쉽다」.
 *
 * ★ 판정은 새로 만들지 않는다 — 이 폼의 실시간 배너가 이미 쓰는
 *   contractDupVerdict/contractDupVStyle 을 그대로 쓴다. 저장 확인 팝업과
 *   배너가 다른 판정을 하면 서로 다른 말을 하게 된다.
 * ⚠ 회사명·세부 사업명은 사람이 입력한 값이다 — innerHTML 로 합치면 XSS 다.
 *   DOM 을 직접 만든다(createElement + textContent).
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const R = path.join(__dirname, '..');
const ERP = fs.readFileSync(path.join(R, 'pu-erp.html'), 'utf8');
function bare(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}
const SRC = bare(ERP);
function cutFn(src, head) {
  const i = src.indexOf(head);
  assert.ok(i >= 0, '못 찾음: ' + head);
  let d = 0;
  for (let k = src.indexOf('{', i); k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (d === 0) return src.slice(i, k + 1); }
  }
  throw new Error('닫는 괄호 없음: ' + head);
}
/* ⚠ 문자열 오프셋(at-N ~ at+N)으로 자르면 코드가 늘어날 때마다 어긋난다.
   중괄호를 맞춰 «그 블록 전체»를 정확히 자른다. */
const DUP_BLOCK = cutFn(SRC, 'if(dupCs.length > 0){');

/* ── popConfirm 이 「카드형 노드」를 지원하는가 ── */
test('★★ popConfirm 이 opts.node 를 받으면 그 노드를 그대로 붙인다', () => {
  const fn = cutFn(SRC, 'window.popConfirm = function(msg, onYes, opts){');
  assert.ok(/if\(opts\.node\)\{ msgEl\.appendChild\(opts\.node\); \}/.test(fn),
    '★★ node 를 안 받으면 카드형 안내를 띄울 길이 없다');
  assert.ok(/else \{ msgEl\.textContent = msg; \}/.test(fn),
    '★ 기존 230곳의 텍스트 확인창이 안 되면 안 된다');
});

test('★ opts.node 를 줄 때는 팝업 폭을 넓힌다 — 카드가 잘리면 안 된다', () => {
  const fn = cutFn(SRC, 'window.popConfirm = function(msg, onYes, opts){');
  assert.match(fn, /maxWidth: opts\.node \? '420px' : '320px'/);
});

/* ── innerHTML 을 안 쓰는가 (XSS) ── */
test('★★ 계약 중복 카드는 innerHTML 이 아니라 createElement+textContent 로 만든다', () => {
  assert.ok(!/\.innerHTML\s*=/.test(DUP_BLOCK),
    '★★ 회사명·세부 사업명을 innerHTML 로 합치면, 그 값에 섞인 HTML 이 그대로 실행된다(XSS)');
  assert.ok(/\.textContent = /.test(DUP_BLOCK), '★ textContent 로 안 채운다');
});

/* ── 판정을 «재사용»하는가 (새로 만들지 않는다) ── */
test('★★ 저장 확인 팝업이 폼 배너와 «같은 판정 함수»를 쓴다', () => {
  assert.ok(/contractDupVerdict\(c, _fEff\)/.test(DUP_BLOCK),
    '★★ 판정을 따로 만들면 배너와 팝업이 «다른 결론»을 낼 수 있다');
  assert.ok(/contractDupVStyle\(r\.v \? r\.v\.verdict : 'diff'\)/.test(DUP_BLOCK),
    '★ 색도 같은 표(contractDupVStyle)를 써야 배너와 팝업이 같은 색을 쓴다');
});

test('★ contractDupVStyle 이 승인된 팔레트 안의 색만 쓴다', () => {
  const fn = cutFn(SRC, 'function contractDupVStyle(verdict){');
  const hex = fn.match(/#[0-9a-fA-F]{6}/g) || [];
  assert.ok(hex.length >= 6, '★ 색이 하나도 없다');
  const PALETTE = new Set([
    '#f8fafc','#e2e8f0','#cbd5e1','#94a3b8','#64748b','#475569','#1e293b',
    '#eff6ff','#bfdbfe','#60a5fa','#2563eb','#1e40af',
    '#f0fdf4','#bbf7d0','#4ade80','#16a34a','#166534',
    '#fffbeb','#fde68a','#fbbf24','#d97706','#854d0e',
    '#fef2f2','#fecaca','#f87171','#dc2626','#991b1b',
    '#ffffff','#000000',
  ]);
  hex.forEach((h) => {
    assert.ok(PALETTE.has(h.toLowerCase()), '★★ 팔레트에 없는 색 ' + h + ' — 이 시스템은 5계열만 쓴다');
  });
});

/* ── 「같다/다르다」로 정말 갈리는가 ── */
test('★★ 세부 사업이 다르면(diff) «다르다»고 말하고, 겹치면 다르게 말한다', () => {
  assert.ok(/_worst === 'diff'/.test(DUP_BLOCK), '★ diff 를 안 가른다');
  assert.ok(/세부 사업명이 «다릅니다»/.test(DUP_BLOCK),
    '★★ 세부 사업이 다른데도 「기존 계약을 찾아 이관」이라고 하면, 안 겹치는 일도 겹친다고 겁준다');
  assert.ok(/새로 만들기보다 기존 계약을 찾아 이관/.test(DUP_BLOCK), '★ dup·again 안내가 없다');
});

/* ── 금액을 보여주는가 ── */
test('★★ 카드마다 금액을 보여준다', () => {
  assert.ok(/c\.contractAmount/.test(DUP_BLOCK), '★ 기존 계약 금액을 안 보여준다');
  assert.ok(/myAmount \+= \(f\.amounts\[k\]\|\|0\);/.test(DUP_BLOCK), '★ 지금 작성 중인 금액을 안 더한다');
});

test('★ 최대 3건까지만 카드로 그린다 (많으면 늘어진다) — 예전과 같은 한도', () => {
  assert.match(DUP_BLOCK, /dupCs\.slice\(0,3\)/);
});
