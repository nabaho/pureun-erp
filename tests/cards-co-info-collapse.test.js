'use strict';
/* 「기업정보」를 접었다 펼 수 있게, 접으면 한 줄로 (대표 지시 2026-08-31)
   ═══════════════════════════════════════════════════════════════════════════
   ■ 대표 지시
     「캡쳐3의 내용은 사업장의 내용이다. 기업상세의 사업내역을 정리할 때는 이부분이
      모두 보일 필요없다. 기업상단에서 기업정보를 접었다 펼 수 있게 만들면 된다.
      그리고 이부분을 한줄로 만들면 안될까」

   ■ 무엇이 문제였나
     기업 상세를 열면 사업자번호·대표자·법인등록번호·소재지·대표번호·휴대폰·이메일·
     업태·종목·개업일·주생산품·매출액 … CO_FIELDS 스무 개 남짓이 «늘 다» 펼쳐져
     있었다. 정작 대표가 보고 싶어 한 것은 «이 회사에서 한 일»(계약·컨설팅·사건)인데,
     그걸 보려면 이 긴 목록을 한참 지나쳐야 했다(coDetailPanelHtml 은 이미 이 축을
     맨 위로 옮겨 뒀지만, «기업정보» 축 자체가 늘 펼쳐진 채라 눈에 계속 걸린다).

   ■ 어떻게 했나
     · 기본은 «접힘» — 제목 줄 하나(「기업정보 ▸」)와 한 줄 요약만 보인다.
     · 요약은 회사를 가장 잘 가리키는 네 칸(사업자번호·대표자·업태·종목)만 묶는다 —
       스무 칸을 다 우겨넣으면 «한 줄»이 아니라 또 다른 긴 줄이 된다.
     · 눌러 펼치면 예전 그대로 CO_FIELDS 전체가 보인다.
     · 패널 전체를 다시 그리지 않는다 — #coInfoBox 한 칸만 바꾼다. 통째로 다시
       그리면 이알피 이력 칸(#coErpHistBox)이 같이 날아가 다시 서버를 불러야 한다.

   ★ 여기서 못 박는 것
     ① 접힘이 기본이다
     ② 접히면 한 줄 요약이 보인다 — 아무것도 안 보이면 무슨 회사인지 잊는다
     ③ 요약에 없는 값은 « · »로 잇지 않는다 — 빈 자리가 줄줄이 남으면 안 된다
     ④ 펼치면 CO_FIELDS 전체가 예전 그대로 보인다
     ⑤ 펼침 단추를 누르면 «그 칸만» 다시 그린다 — 패널 전체를 안 그린다
   실행: node --test tests/cards-co-info-collapse.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'pu-cards.html'), 'utf8').replace(/\r\n/g, '\n');

function fnBody(name){
  const i = SRC.indexOf('\nfunction ' + name + '(');
  assert.ok(i >= 0, name + ' 를 찾지 못했다');
  const open = SRC.indexOf('{', i);
  let d = 0;
  for (let k = open; k < SRC.length; k++) {
    if (SRC[k] === '{') d++;
    else if (SRC[k] === '}') { d--; if (!d) return SRC.slice(i, k + 1); }
  }
  assert.fail(name + ' 의 끝을 찾지 못했다');
}
function code(s){
  return String(s).replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n').map(l => l.replace(/(^|[^:])\/\/.*$/, '$1')).join('\n');
}

function load(open){
  const ctx = { console, Object, String, Number, Array,
    esc: s => String(s == null ? '' : s),
    coSrcTagHtml: () => '',
    _coInfoOpen: !!open,
    CO_FIELDS: [['bizno','사업자번호'], ['ceo','대표자'], ['corpno','법인등록번호'],
                ['bizType','업태'], ['bizItem','종목'], ['address','소재지']],
    coVal: (o, f) => (o.extra && o.extra[f]) || o[f] || ''
  };
  vm.createContext(ctx);
  vm.runInContext(fnBody('coInfoSummary') + '\n' + fnBody('coInfoBoxHtml'), ctx);
  return ctx;
}

const CO = { key:'k1', name:'가나테크', bizno:'134-86-05772', ceo:'나성환',
  bizType:'제조업', bizItem:'식료품', address:'충남 천안시', extra:{} };

/* ══════ ① 접힘이 기본 ══════ */
test('★ 접힘이 기본이다 — 열지 않으면 CO_FIELDS 를 안 그린다', () => {
  const c = load(false);
  const h = c.coInfoBoxHtml(CO);
  assert.doesNotMatch(h, /사업자번호<\/div><div class="v">134/,
    '★ 접혔는데 전체 칸이 그대로 보이면 접는 뜻이 없다');
});

/* ⚠ 위 검사는 load() 가 «강제로» false 를 넣어 준 값을 본다 — 소스가 실제로
   무엇을 기본값으로 «선언해 두었는지»는 안 본다. 「let _coInfoOpen = true;」로
   바꿔도 안 걸렸다(검수 2026-08-31). 소스의 선언줄 자체를 읽어야 진짜다. */
test('★★ 소스에 적힌 «실제 기본값»이 닫힘(false)이다', () => {
  const m = SRC.match(/^let _coInfoOpen = (true|false);$/m);
  assert.ok(m, '_coInfoOpen 선언을 찾지 못했다');
  assert.equal(m[1], 'false',
    '★★ 기본이 열림(true)으로 바뀌었다 — 회사를 열 때마다 스무 칸이 늘 펼쳐진 채로 보인다');
});

/* ══════ ② 요약이 보인다 ══════ */
test('★ 접히면 한 줄 요약이 보인다 — 뭐가 사라졌는지는 알아야 한다', () => {
  const c = load(false);
  const s = c.coInfoSummary(CO);
  assert.match(s, /134-86-05772/, '사업자번호가 요약에 있어야 어느 회사인지 실마리가 된다');
  assert.match(s, /나성환/);
  assert.match(s, /제조업/);
});

/* ══════ ③ 빈 값은 잇지 않는다 ══════ */
test('빈 칸은 « · »로 이어 붙이지 않는다 — 빈 자리가 줄줄이 남으면 안 된다', () => {
  const c = load(false);
  const s = c.coInfoSummary(Object.assign({}, CO, { ceo:'', bizItem:'' }));
  assert.doesNotMatch(s, /·\s*·/, '빈 칸을 이었다 — 「· ·」처럼 빈 자리가 남는다');
  assert.doesNotMatch(s, /^\s*·|·\s*$/, '앞뒤에 빈 구분점이 남았다');
});

/* ══════ ④ 펼치면 전체가 그대로 ══════ */
test('★ 펼치면 CO_FIELDS 전체가 예전 그대로 보인다 — 값 있는 칸은 하나도 안 빠진다', () => {
  const c = load(true);
  const h = c.coInfoBoxHtml(CO);
  /* ⚠ 값이 «없는» 칸(법인등록번호)은 원래도 안 그린다 — CO_FIELDS.filter(([f])=>val(f))
     는 이 함수가 만든 규칙이 아니라 예전부터 있던 규칙이다(빈 값은 안 그린다).
     여기서 보는 것은 «값 있는 칸이 하나도 안 빠졌는가»다. */
  assert.match(h, /사업자번호[\s\S]*134-86-05772/);
  assert.match(h, /대표자[\s\S]*나성환/);
  assert.match(h, /업태[\s\S]*제조업/);
  assert.match(h, /종목[\s\S]*식료품/);
  assert.match(h, /소재지[\s\S]*충남 천안시/);
});

/* ══════ ⑤ 그 칸만 다시 그린다 ══════ */
test('★ coInfoToggle 은 «패널 전체»가 아니라 #coInfoBox 한 칸만 다시 그린다', () => {
  const fn = code(fnBody('coInfoToggle'));
  assert.match(fn, /getElementById\('coInfoBox'\)|\$\('coInfoBox'\)/,
    '★ coInfoBox 를 안 겨누면 어디를 바꿔야 할지 몰라 패널 전체를 다시 그리게 된다');
  assert.doesNotMatch(fn, /openCoDetailPanel\(/,
    '★ 패널 전체를 다시 그리면 이력 칸(#coErpHistBox)이 같이 날아가 서버를 다시 불러온다');
});
