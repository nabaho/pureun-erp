/* 푸른이알피 업체관리 — 「폐업」 탭·칸은 «없앤 것»이다. 되살리지 말 것.
   실행: node --test tests/*.test.js

   ── 왜 이 검사가 남아 있나 ────────────────────────────────────────────
   이 자리는 지시가 «두 번 뒤집힌» 곳이다. 지운 까닭을 안 적어 두면
   다음 사람이 옛 지시(2026-08-17)만 보고 그대로 다시 만든다.

   ① 2026-08-17 대표: "사업장이 폐업한 경우도 많은데 어떻게 구분해서 처리해야하나?"
      → 「폐업」을 종료와 갈라 두었다. closedBiz 표시·전용 탭·대시보드 칸·
        줄 딱지·수정화면 칸까지. 까닭은 「폐업 정산 신고가 남아 있으니
        종료로 바로 넘기면 매일 보는 목록에서 사라져 신고를 놓친다」였다.

   ② 2026-09-06 대표: 「폐업은 필요없다. 삭제해라」
      → 전부 걷어냈다. 걷기 전에 살아 있는 자료를 먼저 세어 보았다 —
        업체 373곳 중 closedBiz 가 켜진 곳 0곳, closedBizDate·closedBizNote 도 0곳.
        «한 번도 쓰이지 않은 채» 탭 하나와 대시보드 칸 하나를 차지하고 있었다.
        지워도 화면에서 사라지는 업체가 없다.

   ★ 폐업한 곳은 이제 어떻게 하나
     목록에서 ⋯ → 「종료 처리」, 종료 사유를 「업체 폐업」으로 고른다.
     그 선택지는 «그대로 둔다» — 이 검사가 그것도 함께 지킨다.
     (종료 사유까지 지우면 폐업으로 끝난 계약을 적을 말이 없어진다.)                    */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'pu-erp.html'), 'utf8').replace(/\r\n/g, '\n');
/* 주석에 적힌 「폐업」 때문에 검사가 헛통과하면 안 된다 — 먼저 걷어낸다 */
const bare = src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

/* ══════ ① 폐업 표시(closedBiz)가 코드에 남아 있지 않다 ══════ */

test('★★ closedBiz 를 다시 들이지 않는다 — 아무도 안 쓰던 칸이다', () => {
  assert.equal(bare.includes('closedBiz'), false,
    '★★ 폐업 표시가 되살아났습니다. 2026-09-06 「폐업은 필요없다. 삭제해라」 — '
    + '되살리려면 대표 확인부터 받으십시오(이 파일 머리말에 앞뒤 사정이 적혀 있습니다)');
});

test('★★ 「폐업」 탭을 다시 만들지 않는다', () => {
  assert.equal(bare.includes('closedbiz'), false, '★★ 폐업 탭 이름이 되살아났습니다');
  assert.equal(bare.includes('🏚'), false, '★★ 폐업 표(🏚)가 되살아났습니다');
});

/* ══════ ② 지운 자리가 «원래대로» 돌아왔다 ══════ */

/* coInTab 만 떼어 온다 — statusTab 을 밖에서 갈아 끼울 수 있게 감싼다 */
function tabFn(){
  const i = src.indexOf('function coInTab(co){');
  assert.ok(i >= 0, 'coInTab 을 못찾음');
  const j = src.indexOf('\n  }', i);
  assert.ok(j > i, 'coInTab 끝을 못찾음');
  const ctx = { console };
  vm.createContext(ctx);
  vm.runInContext('var statusTab = "active";\n' + src.slice(i, j + 4)
    + '\nthis.coInTab = coInTab; this.setTab = function(t){ statusTab = t; };', ctx);
  return ctx;
}
const co = (o) => Object.assign({ status: 'active' }, o || {});

test('「전체 활성」이 status 만 본다 — 곁다리 조건이 다시 붙지 않았다', () => {
  const C = tabFn(); C.setTab('active');
  assert.equal(C.coInTab(co()), true);
  assert.equal(C.coInTab(co({ status: 'closed' })), false, '종료는 종료관리가 본다');
  assert.equal(C.coInTab(co({ status: 'suboffice' })), false);
  /* ⚠ 여기가 알맹이다 — 옛 코드는 폐업이면 «활성 탭에서 뺐다».
       빼는 조건만 되살리고 그 탭을 안 만들면 «어디서도 안 보이는 업체»가 생긴다. */
  assert.equal(C.coInTab(co({ closedBiz: true })), true,
    '★★ 활성에서 빼는 조건이 되살아났습니다 — 갈 곳 없는 업체가 화면에서 사라집니다');
});

test('없는 탭 이름을 넣어도 아무 업체나 새어 나오지 않는다', () => {
  const C = tabFn(); C.setTab('closedbiz');
  assert.equal(C.coInTab(co({ closedBiz: true })), false);
  assert.equal(C.coInTab(co()), false);
});

test('계약 중단 탭은 그대로다 — 폐업과 함께 지워지지 않았다', () => {
  const C = tabFn(); C.setTab('suspended');
  assert.equal(C.coInTab(co({ suspended: true })), true, '★ 계약 중단까지 사라졌습니다');
  assert.equal(C.coInTab(co()), false);
});

test('사무대행 탭도 그대로다', () => {
  const C = tabFn(); C.setTab('suboffice');
  assert.equal(C.coInTab(co({ status: 'suboffice' })), true);
  assert.equal(C.coInTab(co({ isSuboffice: true })), true, '자문 겸업 사무대행');
});

/* ══════ ③ 숫자끼리 어긋나지 않는다 ══════ */

test('활성 숫자와 활성 탭이 «같은 기준»을 쓴다', () => {
  /* 탭에는 안 나오는데 숫자에는 세어지면 「눌러도 안 보이는 곳」이 생긴다. */
  const i = bare.indexOf('var activeCount = companies.filter');
  assert.ok(i > 0, '활성 숫자를 못 찾음');
  const line = bare.slice(i, bare.indexOf('\n', i));
  assert.equal(/closedBiz/.test(line), false, '활성 숫자가 폐업을 다시 셉니다');
  const j = bare.indexOf("if(statusTab === 'active')");
  assert.ok(j > 0 && !bare.slice(j, j + 120).includes('closedBiz'),
    '활성 탭이 폐업을 다시 봅니다');
});

test('대시보드 「활성 자문」 칸도 탭과 같은 기준이다', () => {
  const i = bare.indexOf("label:'💼 활성 자문'");
  assert.ok(i > 0, '대시보드 칸을 못 찾음');
  assert.equal(/closedBiz/.test(bare.slice(i, bare.indexOf('\n', i))), false);
});

/* ══════ ④ 폐업을 적을 «다른 길»은 남아 있다 ══════ */

test('★ 종료 사유 「업체 폐업」은 그대로 있다 — 이것까지 지우면 적을 말이 없어진다', () => {
  assert.ok(bare.includes("h('option', { value:'폐업' }, '업체 폐업')"),
    '★★ 폐업으로 끝난 계약을 적을 선택지가 사라졌습니다 — 폐업 탭을 지운 뒤 '
    + '남은 유일한 길입니다');
});
