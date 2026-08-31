'use strict';
/* ══════ 계약이 이력에 든다 (점검 C1, 2026-08-31) ══════
   이 앱의 이름표는 「사업자·명함·계약서」다. 그런데 계약을 «한 번도 안 읽고» 있었다 —
   pu-cards.html 안에 contracts 라는 글자가 0곳이었다.
   회사를 열어도 그 회사와 무슨 계약을 맺었는지 알 길이 없어, 계약서를 찾으려면
   이알피를 따로 열어야 했다.

   ■ 어떻게 했나 — 새로 짓지 않았다
     「이 회사에서 한 일」 이력이 이미 컨설팅·사건·기금·기타 넷을 «회사 상세를 열 때»
     한 번만 읽어 보여 준다. 계약을 그 다섯째로 넣었을 뿐이다 —
     읽는 자리·잇는 방법(번호→이름)·거르기·정렬·합계가 통째로 따라온다.

   ■ 계약만 다른 두 가지
     ① 유형 사전이 없다. 이알피는 계약의 갈래를 코드가 아니라 «글자»로 레코드 안에
        담는다(kind:'advisory'). 사건(typeName)과 같은 결이라 이름은 따로 짓는다.
     ② 번호가 contractNo 다. 다른 갈래는 no·mgmtNo 를 쓴다 — 빠뜨리면 계약번호가
        안 보여 이알피에서 그 계약을 되찾을 길이 없다.

   ★ 여기서 못 박는 것
     ① 계약을 «읽는다» (ERP_HIST_KINDS 에 있다)
     ② 갈래 글자를 사람 말로 바꾼다 — 모르는 갈래도 «그 글자 그대로» 보여 준다
     ③ 계약번호가 줄에 실린다
     ④ 상담에서 넘어온 계약도 «해»를 찾는다 (시작일이 비고 상담일만 있다)
     ⑤ 갈래별 정렬에 계약이 제 자리를 갖는다 — 빠지면 맨 앞으로 튄다
     ⑥ 딱지 색이 있다 — 없으면 이름표만 있고 칠은 안 된 딱지가 된다
   실행: node --test tests/cards-co-hist-contract.test.js */
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
function decl(name){
  const at = SRC.indexOf('const ' + name + ' =');
  assert.ok(at >= 0, name + ' 을 찾지 못했다');
  const end = SRC.indexOf('\n];', at) >= 0 && SRC.indexOf('\n];', at) < SRC.indexOf('};', at)
    ? SRC.indexOf('\n];', at) + 3 : SRC.indexOf('};', at) + 2;
  return SRC.slice(at, end).replace(/^const /, 'var ');
}
/* 진짜 함수들을 실어 돌린다 */
function load(){
  const ctx = { console, Object, String, Number, Array, JSON };
  vm.createContext(ctx);
  vm.runInContext(decl('ERP_HIST_KINDS'), ctx);
  vm.runInContext(decl('ERP_HIST_LABEL').replace(/^var ERP_HIST_LABEL/, 'var ERP_HIST_LABEL'), ctx);
  vm.runInContext(SRC.match(/^const ERP_CONTRACT_KIND = \{[\s\S]*?\};/m)[0].replace(/^const /, 'var '), ctx);
  vm.runInContext(SRC.match(/^const ERP_TYPE_KEYS = \{[^}]*\};/m)[0].replace(/^const /, 'var '), ctx);
  vm.runInContext(SRC.match(/^const ERP_HIST_STAT = \{[\s\S]*?\};/m)[0].replace(/^const /, 'var '), ctx);
  ['erpTypeCodeOf','erpTypeNameFrom','erpHistName','erpHistYear','erpHistMd',
   'erpHistFee','erpHistStat','erpHistRow','erpHistSort'].forEach(n =>
    vm.runInContext(fnBody(n), ctx));
  return ctx;
}
const 계약 = (x) => Object.assign({ _kind:'contract', id:'ct-1',
  contractNo:'계약-2026-001', companyName:'가나테크', bizNo:'134-86-05772',
  kind:'advisory', managerMain:'권형하', startDate:'2026-03-01', endDate:'2027-02-28',
  contractFee: 1200000 }, x || {});

/* ── ① 읽는다 ─────────────────────────────────────────────────── */

test('★ 계약을 «읽는다» — 이름표가 「사업자·명함·계약서」인데 여태 0곳이었다', () => {
  const c = load();
  const one = c.ERP_HIST_KINDS.find(s => s.store === 'contracts');
  assert.ok(one, '★ 계약을 읽는 자리가 없다 — 회사를 열어도 무슨 계약인지 알 길이 없다');
  assert.equal(one.kind, 'contract');
  assert.equal(one.types, '', '계약은 유형 사전을 안 쓴다 — 갈래를 제 안에 글자로 담는다');
  assert.equal(c.ERP_HIST_LABEL.contract, '계약',
    '★ 이름표가 없으면 딱지가 「기타」로 떨어져 계약인 줄 모른다');
});

/* ── ② 갈래 이름 ──────────────────────────────────────────────── */

test('★ 갈래 글자를 사람 말로 바꾼다', () => {
  const c = load();
  assert.equal(c.erpHistName(계약({ kind:'advisory' }), {}), '자문');
  assert.equal(c.erpHistName(계약({ kind:'payroll' }), {}), '급여');
  assert.equal(c.erpHistName(계약({ kind:'biz_cons' }), {}), '컨설팅');
});

test('★ 모르는 갈래는 «그 글자 그대로» 보여 준다 — 빈칸이면 어느 것인지 알 수 없다', () => {
  const c = load();
  assert.equal(c.erpHistName(계약({ kind:'새로운갈래' }), {}), '새로운갈래',
    '★ 이알피가 갈래를 하나 늘리면 그 계약들이 죄다 「(이름 없음)」이 된다');
});

test('계약을 컨설팅 사전에서 찾지 «않는다» — 엉뚱한 이름이 붙는다', () => {
  const c = load();
  /* 사전에 advisory 라는 코드가 있어도 계약은 그것을 보면 안 된다 */
  const dict = { consulting: [{ code:'advisory', name:'엉뚱한이름' }] };
  assert.equal(c.erpHistName(계약({ kind:'advisory' }), dict), '자문');
});

/* ── ③ 계약번호 ───────────────────────────────────────────────── */

test('★ 계약번호가 줄에 실린다 — 없으면 이알피에서 되찾을 길이 없다', () => {
  const c = load();
  assert.equal(c.erpHistRow(계약(), {}).no, '계약-2026-001',
    '★ 계약은 번호를 contractNo 에 담는다 — no·mgmtNo 만 보면 늘 빈칸이다');
});

test('다른 갈래의 번호 자리를 뺏지 않는다', () => {
  const c = load();
  assert.equal(c.erpHistRow({ _kind:'case', no:'사건-01', contractNo:'있으면안됨' }, {}).no, '사건-01',
    '★ no 가 있으면 그것이 먼저다');
});

/* ── ④ 해 찾기 ────────────────────────────────────────────────── */

test('★ 상담에서 넘어온 계약도 «해»를 찾는다 — 시작일이 비어 있다', () => {
  const c = load();
  /* 상담 이관 기록에는 startDate 가 없고 consultDate·createdAt 만 있다 */
  const r = 계약({ startDate:'', endDate:'', consultDate:'2025-11-04',
                  createdAt:'2025-11-05T09:00:00.000Z' });
  assert.equal(c.erpHistYear(r), 2025,
    '★ 해를 못 찾으면 0 이 되어 「해별로 보기」에서 통째로 빠진다');
  assert.equal(c.erpHistRow(r, {}).from, '11-04', '월·일도 상담일에서 온다');
});

test('★ 시작일이 있으면 그것이 «먼저»다 — 만든 날이 이기면 안 된다', () => {
  const c = load();
  const r = 계약({ startDate:'2020-03-01', consultDate:'2025-11-04',
                  createdAt:'2025-11-05T09:00:00.000Z' });
  assert.equal(c.erpHistYear(r), 2020,
    '★ 옮겨 담은 날이 이기면 2020년 계약이 2025년 것으로 올라온다');
});

test('날짜가 하나도 없으면 0 이다 — 오늘 해로 메우지 않는다', () => {
  const c = load();
  assert.equal(c.erpHistYear({ _kind:'contract', kind:'advisory' }), 0);
});

/* ── ⑤ 갈래별 정렬 ────────────────────────────────────────────── */

test('★ 갈래별 정렬에 계약이 «제 자리»를 갖는다 — 빠지면 맨 앞으로 튄다', () => {
  const c = load();
  /* indexOf 가 -1 을 주므로, 목록에 없는 갈래는 어느 것보다도 앞에 선다.
     그 자체가 틀린 것은 아니지만 «뜻하지 않은» 자리다 — 못 박아 둔다. */
  const ord = fnBody('erpHistSort').match(/const ord = \[([^\]]*)\]/)[1];
  Object.keys(c.ERP_HIST_LABEL).forEach(k => {
    assert.ok(ord.indexOf("'" + k + "'") >= 0,
      '★ ' + k + ' 이 갈래별 정렬 차례에 없다 — 그 갈래가 통째로 맨 앞으로 튄다');
  });
});

test('갈래별로 모으면 계약끼리 붙어 선다', () => {
  const c = load();
  const rows = [{ kind:'other', year:2024 }, { kind:'contract', year:2020 },
                { kind:'consulting', year:2023 }, { kind:'contract', year:2026 }];
  const got = c.erpHistSort(rows, 'kind').map(r => r.kind);
  assert.equal(got.indexOf('contract') + 1, got.lastIndexOf('contract'),
    '★ 계약이 갈라져 서면 「갈래별」이라는 말이 거짓이 된다: ' + got.join(','));
});

/* ── ⑥ 딱지 색 ────────────────────────────────────────────────── */

test('★ 갈래마다 딱지 색이 있다 — 없으면 칠이 안 된 딱지가 된다', () => {
  const c = load();
  Object.keys(c.ERP_HIST_LABEL).forEach(k => {
    assert.ok(SRC.indexOf('.cohist-row .bd.k-' + k + '{') >= 0,
      '★ ' + k + ' 의 줄 딱지 색이 없다');
    assert.ok(SRC.indexOf('.cohist-chip.on.k-' + k + '{') >= 0,
      '★ ' + k + ' 의 거르개 딱지 색이 없다 — 켠 티가 안 난다');
  });
});
