'use strict';
/* ══════ 계약 기간이 회사 상세에 보인다 (점검 B2, 2026-08-31) ══════
   업체관리(푸른이알피)가 계약 시작일·종료일을 갖고 있는데 기업정보함이 «안 꺼내»
   쓰고 있었다. 회사를 열어도 언제부터 언제까지 계약인지 알 길이 없어, 자문료
   청구나 재계약 이야기를 할 때마다 이알피를 따로 열어야 했다.

   ■ 왜 «읽기만» 하는가 — 기업정보함 칸으로 안 들인다
     CO_FIELDS 로 들이면 그 값은 고칠 수 있고, 고친 값은 기업정보함에 저장되어
     업체관리를 «이기고 눌러앉는다»(fromErp 는 빈 칸만 채운다). 그러면 계약이 언제
     끝나는지 두 앱이 다른 말을 하게 된다. 계약의 임자는 업체관리다 —
     🚪 계약해지를 그렇게 다루는 것과 «같은 결»이다.

   ■ 「종료일 지남」은 계약해지가 «아니다»
     자동 연장으로 계속 가는 곳이 있다. 둘을 섞으면 멀쩡한 거래처를 끝난 곳으로
     읽는다. 그래서 붉게 칠하지 않고, 해지 여부는 🚪 가 따로 말한다.

   ★ 여기서 못 박는 것
     ① 업체관리를 훑을 때 계약 시작일·종료일을 실어 둔다
     ② 한쪽만 있어도 보여 준다 — 「?」로 빈 쪽을 밝힌다
     ③ 둘 다 없으면 «아무 줄도 안 만든다» (빈 줄은 화면을 시끄럽게만 한다)
     ④ 오늘을 «받는다» — 안에서 오늘을 부르면 검사가 해마다 달라진다
     ⑤ 「종료일 지남」이 붉지 않다 — 붉으면 계약해지로 읽힌다
     ⑥ 기업정보함 제 칸(CO_FIELDS)으로 «안 들인다»
   실행: node --test tests/cards-co-contract-period.test.js */
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
function load(){
  const ctx = { console, Object, String, Number, Array, Date };
  vm.createContext(ctx);
  vm.runInContext(fnBody('erpContractPeriod') + '\n' + fnBody('todayYmd'), ctx);
  return ctx;
}
/* 업체관리 자료를 «훑는 대목»을 그대로 돌린다 */
function scanErp(cos){
  const a = SRC.indexOf('      const byBiz={}, byName={}');
  const b = SRC.indexOf('      ErpMatch.byBiz=byBiz;');
  assert.ok(a > 0 && b > a, '업체 훑는 자리를 찾지 못했다');
  const ctx = { console, Object, String, Number, Array,
    cos: cos, nameBySid: {}, byTaxEmail: {},
    ErpMatch: { _norm: v => String(v||'').replace(/\s+/g,''),
                _digits: v => String(v||'').replace(/\D/g,'') } };
  vm.createContext(ctx);
  vm.runInContext(SRC.slice(a, b) + '\nvar OUT = byBiz;', ctx);
  return ctx.OUT;
}

/* ── ① 실어 둔다 ──────────────────────────────────────────────── */

test('★ 업체관리를 훑을 때 계약 시작일·종료일을 실어 둔다', () => {
  const r = scanErp([{ name:'가나테크', bizNo:'134-86-05772', ceo:'나성환',
    typeCode:'자문', status:'active', managerMain:'s1',
    contractStartDate:'2026-03-01', contractEndDate:'2027-02-28' }])['1348605772'];
  assert.ok(r, '업체 기록을 못 만들었다');
  assert.equal(r.ctFrom, '2026-03-01');
  assert.equal(r.ctTo, '2027-02-28');
});

/* ── ②③ 한쪽만 · 아무것도 없을 때 ─────────────────────────────── */

test('★ 둘 다 있으면 기간으로 보여 준다', () => {
  const c = load();
  const p = c.erpContractPeriod({ ctFrom:'2026-03-01', ctTo:'2027-02-28' }, '2026-08-31');
  assert.equal(p.text, '2026-03-01 ~ 2027-02-28');
  assert.equal(p.past, false);
});

test('★ 한쪽만 있어도 보여 준다 — 「?」로 빈 쪽을 밝힌다', () => {
  const c = load();
  /* ⚠ 「.text 가 무엇인가」만 보면, 줄을 통째로 안 만드는 고장은 «터지면서» 걸린다.
     터진 검사는 까닭을 말해 주지 못한다 — 먼저 «줄이 있는지»를 묻는다
     (2026-08-31 고장넣기에서 실제로 그랬다). */
  const a = c.erpContractPeriod({ ctFrom:'2026-03-01', ctTo:'' }, '2026-08-31');
  assert.ok(a, '★ 시작일만 있다고 감추면 그 정보까지 잃는다 — 계약이 있는 줄도 모른다');
  assert.equal(a.text, '2026-03-01 ~ ?');
  const b = c.erpContractPeriod({ ctFrom:'', ctTo:'2027-02-28' }, '2026-08-31');
  assert.ok(b, '★ 종료일만 있다고 감추면 언제 끝나는지조차 안 보인다');
  assert.equal(b.text, '? ~ 2027-02-28');
});

test('★ 둘 다 없으면 «아무 줄도 안 만든다»', () => {
  const c = load();
  assert.equal(c.erpContractPeriod({ ctFrom:'', ctTo:'' }, '2026-08-31'), null,
    '★ 빈 줄이 늘 떠 있으면 눈이 그것을 배경으로 배운다');
  assert.equal(c.erpContractPeriod(null, '2026-08-31'), null);
  assert.equal(c.erpContractPeriod({}, '2026-08-31'), null);
});

test('날짜가 아닌 글자는 «날짜로 우기지 않는다»', () => {
  const c = load();
  assert.equal(c.erpContractPeriod({ ctFrom:'미정', ctTo:'협의' }, '2026-08-31'), null,
    '★ 「미정」을 날짜 자리에 그대로 그리면 견주기가 엉뚱한 답을 낸다');
});

test('「2026.3.1」처럼 점으로 적힌 것도 읽는다', () => {
  const c = load();
  const p = c.erpContractPeriod({ ctFrom:'2026.3.1', ctTo:'2027.2.28' }, '2026-08-31');
  assert.equal(p.text, '2026-3-1 ~ 2027-2-28');
});

/* ── ④⑤ 종료일 지남 ──────────────────────────────────────────── */

test('★ 종료일이 지났으면 그렇다고 말한다', () => {
  const c = load();
  assert.equal(c.erpContractPeriod({ ctFrom:'2024-03-01', ctTo:'2025-02-28' }, '2026-08-31').past,
    true, '★ 종료일을 보여 주고도 지났는지 말 안 하면 사람이 매번 손으로 견줘야 한다');
  assert.equal(c.erpContractPeriod({ ctFrom:'2026-03-01', ctTo:'2027-02-28' }, '2026-08-31').past,
    false);
});

test('★ 자리 수가 다른 날짜도 바로 견준다 — 글자로만 견주면 뒤집힌다', () => {
  const c = load();
  /* 「2026-9-1」 은 글자로 견주면 「2026-08-31」보다 «작다»(9 < 0 이 아니라 '9' > '0' 이지만
     '2026-9' 와 '2026-0' 을 견주면 9 가 커서 우연히 맞는다). 자리를 채워야 늘 맞는다.
     ⚠ 「2026-1-5」 대 「2026-08-31」 에서 진짜로 뒤집힌다 — 그것을 본다. */
  assert.equal(c.erpContractPeriod({ ctTo:'2026-1-5' }, '2026-08-31').past, true,
    '★ 1월 5일에 끝난 계약을 아직 안 끝난 것으로 읽었다');
  assert.equal(c.erpContractPeriod({ ctTo:'2026-9-5' }, '2026-08-31').past, false);
});

test('★ 오늘을 «받는다» — 안에서 오늘을 부르면 검사가 해마다 달라진다', () => {
  const body = fnBody('erpContractPeriod');
  assert.ok(body.indexOf('new Date') < 0,
    '★ 함수 안에서 오늘을 지으면 「지났나」를 잴 수 없고, 재는 날에 따라 답이 바뀐다');
  assert.match(fnBody('todayYmd'), /getFullYear/,
    '오늘을 짓는 자리는 따로 둔다 — 나라 설정에 안 흔들리게 손으로 짓는다');
});

/* ── ⑥ 화면 ───────────────────────────────────────────────────── */

test('★ 상세가 그 줄을 «그린다» — 함수만 있고 안 그리면 소용없다', () => {
  const panel = fnBody('coDetailPanelHtml');
  assert.match(panel, /erpContractPeriod\(o\.erp, todayYmd\(\)\)/,
    '★ 상세가 계약 기간을 안 그린다');
  assert.match(panel, /계약/, '무슨 날짜인지 말해야 한다');
});

test('★ 「종료일 지남」이 «붉지 않다» — 붉으면 계약해지로 읽힌다', () => {
  /* 자동 연장으로 계속 가는 곳이 있다. 해지 여부는 🚪 가 따로 말한다. */
  const m = SRC.match(/#pcDetail \.pdsub \.ctold\{([^}]*)\}/);
  assert.ok(m, '★ 「종료일 지남」 딱지의 모양이 없다 — 칠 안 된 딱지가 된다');
  assert.ok(!/#dc2626|#991b1b|#fef2f2|#fecaca/.test(m[1]),
    '★ 붉은 색을 썼다 — 계약해지(🚪)와 같은 말로 읽힌다: ' + m[1]);
  /* 말풍선이 그 둘을 갈라 말해야 한다 */
  assert.match(fnBody('coDetailPanelHtml'), /종료일 지남[\s\S]{0,10}<\/span>|계약해지와는/,
    '★ 계약해지와 다르다는 말이 어디에도 없다');
});

test('★ 기업정보함 제 칸으로 «안 들인다» — 들이면 업체관리를 이기고 눌러앉는다', () => {
  const at = SRC.indexOf('const CO_FIELDS');
  const decl = SRC.slice(at, SRC.indexOf('];', at));
  ['ctFrom', 'ctTo', 'contractStartDate', 'contractEndDate'].forEach(k => {
    assert.ok(decl.indexOf("'" + k + "'") < 0,
      '★ ' + k + ' 이 기업정보함 칸이 됐다 — 여기서 고친 날짜가 업체관리를 이기고 '
      + '눌러앉아, 계약이 언제 끝나는지 두 앱이 다른 말을 하게 된다');
  });
  /* 빈 칸 채우기(fromErp)로도 들이면 안 된다 — 같은 일이 벌어진다 */
  const build = fnBody('coListBuild');
  assert.ok(build.indexOf("fromErp('ctFrom'") < 0 && build.indexOf("fromErp('ctTo'") < 0,
    '★ 계약 날짜를 회사 칸에 채워 넣었다 — 읽기만 해야 한다');
});
