/* 푸른이알피 업체관리 — 「폐업」을 「종료」와 갈라 다룬다.
   실행: node --test tests/*.test.js

   대표 지시 2026-08-17: "사업장이 폐업한 경우도 많은데 어떻게 구분해서 처리해야하나?"

   ★ 왜 갈라야 하나 (검토에서 나온 결론)
     지금은 「종료 처리」뿐이고 종료 사유 열 가지 중 하나로 「업체 폐업」을 고른다.
     그런데 종료하면 status='closed' 가 되어 «업체관리에서 사라지고 종료관리로» 간다.
     사무대행은 사업장이 폐업해도 그 해 «폐업 정산 신고»가 남는다 — 종료로 넘기면
     매일 보는 목록에서 없어져 남은 신고를 놓친다. 반대로 종료를 안 하면 폐업한 곳이
     활성 숫자에 섞여 「영업 중 몇 곳인가」가 안 맞는다. 둘 중 하나를 포기해야 했다.

   ★ 그래서 «폐업»을 따로 둔다 (closedBiz)
     ① 「전체 활성」 숫자에서 빠진다 — 그 숫자는 실제로 영업 중인 곳이어야 한다
     ② 그런데도 목록에는 남는다 — 「폐업」 탭과 「사무대행」 탭에 보인다
     ③ 신고까지 끝내고 「종료 처리」를 누르면 그때 종료관리로 간다 (기존 흐름 그대로)
     ④ 계약 중단(suspended)과는 다른 것이다 — 그쪽은 업체가 살아 있고 계약만 멈춘 것 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'pu-erp.html'), 'utf8').replace(/\r\n/g, '\n');

/* coInTab 만 떼어 온다 — statusTab 을 밖에서 갈아 끼울 수 있게 감싼다 */
function tabFn(){
  const i = src.indexOf('function coInTab(co){');
  assert.ok(i >= 0, 'coInTab 을 못찾음');
  const j = src.indexOf('\n  }', i);
  assert.ok(j > i, 'coInTab 끝을 못찾음');
  const body = src.slice(i, j + 4);
  const ctx = { console };
  vm.createContext(ctx);
  vm.runInContext('var statusTab = "active";\n' + body
    + '\nthis.coInTab = coInTab; this.setTab = function(t){ statusTab = t; };', ctx);
  return ctx;
}

const co = (o) => Object.assign({ status: 'active' }, o || {});

/* ══════ ① 전체 활성에서 빠진다 ══════ */

test('폐업한 곳은 「전체 활성」에 안 나온다 — 영업 중 숫자가 맞아야 한다', () => {
  const C = tabFn(); C.setTab('active');
  assert.equal(C.coInTab(co({ closedBiz: true })), false);
  assert.equal(C.coInTab(co()), true, '멀쩡한 곳은 나와야 한다');
});

test('폐업이 아니면 활성 판정이 예전과 똑같다', () => {
  const C = tabFn(); C.setTab('active');
  assert.equal(C.coInTab(co({ closedBiz: false })), true);
  assert.equal(C.coInTab(co({ status: 'closed' })), false);
  assert.equal(C.coInTab(co({ status: 'suboffice' })), false);
});

/* ══════ ② 목록에는 남는다 ══════ */

test('「폐업」 탭에 모인다', () => {
  const C = tabFn(); C.setTab('closedbiz');
  assert.equal(C.coInTab(co({ closedBiz: true })), true);
  assert.equal(C.coInTab(co()), false);
});

test('폐업이어도 사무대행 탭에는 남는다 — 폐업 정산 신고가 우리 일이다', () => {
  /* 이것이 이 기능의 핵심이다. 여기서 사라지면 남은 신고를 놓친다. */
  const C = tabFn(); C.setTab('suboffice');
  assert.equal(C.coInTab(co({ status: 'suboffice', closedBiz: true })), true);
  assert.equal(C.coInTab(co({ isSuboffice: true, closedBiz: true })), true,
    '자문 겸업 사무대행도 남아야 한다');
});

test('사무대행이 아닌 폐업 업체는 사무대행 탭에 안 나온다', () => {
  const C = tabFn(); C.setTab('suboffice');
  assert.equal(C.coInTab(co({ closedBiz: true })), false);
});

/* ══════ ③ 종료와 다르다 ══════ */

test('종료(closed)는 여전히 업체관리에서 빠진다 — 종료관리가 그것을 본다', () => {
  const C = tabFn();
  ['active', 'suboffice', 'closedbiz'].forEach(t => {
    C.setTab(t);
    assert.equal(C.coInTab(co({ status: 'closed' })), false, t + ' 탭에 종료가 나온다');
  });
});

test('폐업했고 종료까지 된 곳은 「폐업」 탭에도 안 남는다 — 다 끝난 것이다', () => {
  /* 종료 처리는 status 를 바꾸므로, 폐업 탭은 closedBiz 만 보면 종료된 것도 걸린다.
     그러면 「할 일이 남은 곳」이라는 탭의 뜻이 흐려진다. */
  const C = tabFn(); C.setTab('closedbiz');
  assert.equal(C.coInTab(co({ status: 'closed', closedBiz: true })), false,
    '종료된 것이 폐업 탭에 남으면 할 일 목록이 아니게 된다');
});

/* ══════ ④ 계약 중단과 섞이지 않는다 ══════ */

test('계약 중단과 폐업은 서로 다른 탭이다', () => {
  const C = tabFn();
  C.setTab('suspended');
  assert.equal(C.coInTab(co({ suspended: true })), true);
  assert.equal(C.coInTab(co({ closedBiz: true })), false, '폐업이 계약 중단 탭에 섞였다');
  C.setTab('closedbiz');
  assert.equal(C.coInTab(co({ suspended: true })), false, '계약 중단이 폐업 탭에 섞였다');
});

test('둘 다인 경우도 각 탭에 제대로 나온다 — 계약을 멈춘 뒤 폐업할 수 있다', () => {
  const C = tabFn();
  const both = co({ suspended: true, closedBiz: true });
  C.setTab('suspended'); assert.equal(C.coInTab(both), true);
  C.setTab('closedbiz'); assert.equal(C.coInTab(both), true);
  C.setTab('active');    assert.equal(C.coInTab(both), false);
});

/* ══════ ⑤ 화면에 걸려 있는가 ══════ */

test('활성 숫자와 활성 탭이 «같은 기준»을 쓴다', () => {
  /* 탭에는 안 나오는데 숫자에는 세어지면 「눌러도 안 보이는 곳」이 생긴다. */
  const i = src.indexOf('var activeCount = companies.filter');
  const line = src.slice(i, src.indexOf('\n', i));
  assert.match(line, /!c\.closedBiz/, '활성 숫자가 폐업을 아직 센다');
  const j = src.indexOf("if(statusTab === 'active')");
  assert.ok(j > 0 && src.slice(j, j + 120).includes('!co.closedBiz'), '활성 탭이 폐업을 아직 보여준다');
});

test('대시보드 「활성 자문」 칸도 폐업을 뺀다 — 탭 숫자와 어긋나면 안 된다', () => {
  const i = src.indexOf("label:'💼 활성 자문'");
  const line = src.slice(i, src.indexOf('\n', i));
  assert.match(line, /!c\.closedBiz/);
});

test('폐업 탭과 대시보드 칸이 있다', () => {
  assert.ok(src.includes("setStatusTab('closedbiz')"), '폐업 탭 단추가 없다');
  assert.ok(src.includes("'🏚 폐업 ('"), '탭 이름표가 없다');
  assert.ok(src.includes("label:'🏚 폐업'"), '대시보드 칸이 없다');
  assert.ok(src.includes('var closedBizCount'), '개수를 세지 않는다');
});

test('폐업한 줄은 눈에 갈라 보인다 — 사무대행 탭에 섞여 있어도 알아야 한다', () => {
  const i = src.indexOf('var rowStyle = co.closedBiz');
  assert.ok(i > 0, '줄 색이 폐업을 안 본다');
  const fn = src.slice(i, i + 320);
  /* 회색은 팔레트에 있는 것만 쓴다 — tests/color-palette.test.js 가 지킨다 */
  assert.match(fn, /#f8fafc/, '회색 배경이 없다');
  /* 폐업이 계약 중단보다 앞에 와야 한다 — 둘 다면 폐업이 더 큰 사실이다 */
  assert.ok(fn.indexOf('co.closedBiz') < fn.indexOf('co.suspended'), '계약 중단이 폐업을 덮는다');
  assert.ok(src.includes("}}, '🏚 폐업'))"), '줄에 폐업 딱지가 없다');
});

test('수정 화면에 폐업 체크·폐업일·메모가 있다', () => {
  const i = src.indexOf("'🏚 사업장 폐업'");
  assert.ok(i > 0, '폐업 체크칸이 없다');
  const around = src.slice(Math.max(0, i - 1200), i + 1800);
  assert.match(around, /checked:!!f\.closedBiz/, '체크 상태를 안 읽는다');
  assert.match(around, /set\('closedBizDate'\)/, '폐업일 칸이 없다');
  assert.match(around, /set\('closedBizNote'\)/, '남은 일 메모 칸이 없다');
  assert.match(around, /종료 처리/, '다 끝난 뒤 무엇을 할지 안 알려 준다');
});

test('폐업을 켜면 폐업일이 오늘로 채워지고, 끄면 딸린 값이 비워진다', () => {
  /* 껐는데 날짜가 남으면 다음에 켤 때 엉뚱한 날이 그대로 쓰인다. */
  const i = src.indexOf('checked:!!f.closedBiz');
  const fn = src.slice(i, i + 600);
  assert.match(fn, /if\(e\.target\.checked && !next\.closedBizDate\) next\.closedBizDate = todayYMD\(\)/);
  assert.match(fn, /next\.closedBizDate=''; next\.closedBizNote=''/);
});
