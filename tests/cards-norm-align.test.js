'use strict';
/* ══════ 회사 이름 다듬기가 두 앱에서 달랐다 (점검 C3, 2026-08-30) ══════
   같은 이름 열셋을 넣어 보니 «여덟»이 서로 다른 답을 냈다.
     (유)대성        기업정보함[유대성]        푸른이알피[대성]
     농업회사법인 한들  기업정보함[농업회사법인한들] 푸른이알피[한들]
     주) 대성        기업정보함[주대성]        푸른이알피[대성]
   그래서 푸른이알피에 「(유)대성」으로 적힌 업체와 명함의 「유한회사 대성」이
   «다른 회사»가 되어, 담당 노무사도 계약 상태도 🚪 종료도 안 붙었다.

   ■ 그런데 다듬개가 «셋»이고, 그중 둘은 건드리면 안 된다
     ① ErpMatch._norm   업체관리와 «맞출» 때 — 고쳐도 안전하다(저장 안 함)
     ② const _norm      회사 «열쇠»를 만들 때 — ★ 고치면 안 된다.
        이 값이 그대로 Realtime DB 열쇠(coInfo/n회사이름)가 된다. 바꾸면 여태 쌓인
        폴더·탭·서식 값이 통째로 «다른 열쇠»가 되어 안 붙는다.
     ③ erpNormName      ERP 에 «등록할» 때 이미 있는지 볼 때 — ★ 고치면 안 된다.
        푸른이알피와 «정확히 같아야» 한다. 더 떼면 저쪽이 다르게 보는 두 업체를
        같다고 여겨 등록을 건너뛴다.

   ★ 그래서 ①만 넓힌다 — 푸른이알피가 떼는 것을 «더한다». 읽어서 맞추는 폭만 넓어지고
     저장되는 것은 하나도 안 바뀐다. */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('node:vm');

const D = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(D, 'pu-cards.html'), 'utf8');
const ERP = fs.readFileSync(path.join(D, 'pu-erp.html'), 'utf8');

/* 세 다듬개를 «파일에서 그대로 떠서» 돌린다 — 베껴 적으면 진짜와 어긋난다 */
function grab(src, startPat, endMark) {
  const at = src.indexOf(startPat);
  assert.ok(at >= 0, startPat + ' 을 찾지 못했다');
  const end = src.indexOf(endMark, at);
  assert.ok(end > at, startPat + ' 의 끝을 찾지 못했다');
  return src.slice(at, end);
}
function load() {
  const b = {};
  vm.createContext(b);
  /* ① 업체관리와 맞출 때 */
  vm.runInContext('var ErpMatch = { ' + grab(SRC, '_norm(s){ return String', '_digits(s)') + ' };', b);
  /* ② 회사 열쇠 */
  vm.runInContext(grab(SRC, 'const _norm =', '\n').replace(/^const /, 'var '), b);
  /* ③ ERP 등록할 때 */
  vm.runInContext(grab(SRC, 'function erpNormName(s)', 'function erpNormBiz'), b);
  /* 푸른이알피 쪽 */
  vm.runInContext('var CompanyRef = { ' + grab(ERP, '_norm: function(s)', '_normBiz:') + ' };', b);
  return b;
}
const run = (b, who, s) => vm.runInContext(who + '(' + JSON.stringify(s) + ')', b);

/* ── ① 업체관리와 맞출 때: 푸른이알피가 떼는 것을 다 뗀다 ─────────── */
const 표본 = ['주식회사 대성', '(주)대성', '㈜대성', '유한회사 대성', '(유)대성',
  '농업회사법인 한들', '주) 대성', '대성 주식회사'];

test('★ 업체관리와 맞출 때 — 푸른이알피와 같은 답을 낸다', () => {
  const b = load();
  const 어긋남 = [];
  표본.forEach(s => {
    const a = run(b, 'ErpMatch._norm', s);
    const c = run(b, 'CompanyRef._norm', s);
    if (a !== c) 어긋남.push(s + ' → 기업정보함[' + a + '] 푸른이알피[' + c + ']');
  });
  assert.deepEqual(어긋남, [],
    '★ 같은 회사를 서로 다르게 본다 — 담당 노무사도 🚪 종료도 안 붙는다:\n  ' + 어긋남.join('\n  '));
});

test('기업정보함이 «더» 떼던 것은 그대로 뗀다 — 있던 것을 잃지 않는다', () => {
  const b = load();
  [['사단법인 푸른', '푸른'], ['재단법인 푸른', '푸른'], ['의료법인 이레', '이레'],
   ['합자회사 대성', '대성'], ['유한책임회사 대성', '대성']].forEach(([s, want]) => {
    assert.equal(run(b, 'ErpMatch._norm', s), want,
      '「' + s + '」을 예전에는 「' + want + '」로 봤는데 이제 안 그런다');
  });
});

/* ── ② 회사 열쇠는 «그대로» 둔다 ─────────────────────────────────── */
test('★ 회사 열쇠 다듬개는 바뀌지 않았다 — 바꾸면 폴더·탭이 통째로 끊긴다', () => {
  const b = load();
  /* 이 값이 그대로 DB 열쇠(coInfo/n회사이름)가 된다. 넓히면 여태 쌓인 기록이
     «다른 열쇠»가 되어 안 붙는다 — 화면은 멀쩡한데 값만 사라진다. */
  assert.equal(run(b, '_norm', '(유)대성'), '(유)대성'.replace(/\s/g, ''),
    '★ 회사 열쇠 규칙을 넓혔다 — 이미 쌓인 폴더·탭·서식 값이 안 붙는다');
  assert.equal(run(b, '_norm', '주식회사 대성'), '대성', '있던 규칙까지 바뀌었다');
});

/* ── ③ ERP 등록 잣대는 저쪽과 «정확히» 같다 ─────────────────────── */
test('★ ERP 에 등록할 때 잣대는 푸른이알피와 «똑같다»', () => {
  const b = load();
  ['(유)대성', '농업회사법인 한들', '사단법인 푸른', '합자회사 대성', '주) 대성'].forEach(s => {
    assert.equal(run(b, 'erpNormName', s), run(b, 'CompanyRef._norm', s),
      '★ 「' + s + '」 — 저쪽이 다르게 보는 업체를 같다고 여겨 «등록을 건너뛴다»');
  });
});

/* ── ④ 다듬개가 늘지 않았다 ─────────────────────────────────────── */
test('★ 이름 다듬개는 «셋»뿐이다 — 늘 때마다 답이 갈린다', () => {
  /* 부르는 곳이 아니라 «만드는 곳»만 센다. 셋의 까닭은 저마다 다르고 위 검사가
     저마다 지킨다 — 넷째가 생기면 어느 것을 따라야 할지 아무도 모른다. */
  const defs = [
    ['ErpMatch._norm', /_norm\(s\)\{\s*return String/],
    ['const _norm', /const _norm\s*=/],
    ['erpNormName', /function erpNormName\s*\(/]
  ];
  defs.forEach(([nm, re]) => {
    const n = (SRC.match(new RegExp(re.source, 'g')) || []).length;
    assert.equal(n, 1, nm + ' 이 ' + n + '벌이다');
  });
  const extra = [...SRC.matchAll(/function\s+([A-Za-z_$][\w$]*[Nn]orm[A-Za-z]*)\s*\(/g)]
    .map(m => m[1]).filter(x => x !== 'erpNormName' && x !== 'erpNormBiz');
  assert.deepEqual(extra, [], '★ 다듬개가 또 늘었다: ' + extra.join(', '));
});
