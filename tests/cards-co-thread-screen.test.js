'use strict';
/* 푸른 메일 「사업장별」 화면 (대표 목표 2026-08-30) — 실행: node --test tests/*.test.js

   대표: 「직원의 거래처와 관련된 사업장의 메일을 동기화해서 연결…
         추후에 그 사업장과 관련된 카카오톡과 문자 등의 정보도 당겨오게」

   받은 메일과 보낸 메일이 **다른 화면**에 있어, 「이 사업장과 무슨 이야기가
   오갔나」를 보려면 두 곳을 열고 눈으로 맞춰야 했다.

   ⚠ 모으는 셈은 js/pu-co-thread.js 가 한다(검사: tests/co-thread.test.js).
     여기서는 **화면이 그것을 제대로 쓰고, 들어갈 길이 있는가**만 본다.
   ⚠ 2026-08-24 「받은 어디서 찾나 안보인다」 — 폰에만 달아 PC 에서 들어갈 길이
     없었다. 그래서 폰·PC 두 곳을 함께 못 박는다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const R = path.join(__dirname, '..');
const HTML = fs.readFileSync(path.join(R, 'pu-cards.html'), 'utf8');
const THREAD = fs.readFileSync(path.join(R, 'js', 'pu-co-thread.js'), 'utf8');

function cut(name) {
  const m = HTML.match(new RegExp('function ' + name + '\\s*\\([\\s\\S]*?\\n\\}'));
  assert.ok(m, name + ' 함수를 찾을 수 없습니다 (이름이 바뀌었으면 검사도 함께)');
  return m[0];
}

const COS = [
  { id: 'c1', name: '㈜정일제지',
    contacts: [{ name: '임남용', email: 'cust12@naver.com', isPrimary: true }] },
  { id: 'c2', name: '한빛산업개발', primaryContactEmail: 'hanbit@daum.net' },
  { id: 'c3', name: '오간것없는회사', primaryContactEmail: 'none@x.kr' }
];
const INBOX = {
  m1: { at: 3000, from: '임남용 <cust12@naver.com>', subject: '8월 급여자료',
    preview: '보내드립니다', companyId: 'c1', atts: 2, took: 2, seatName: '신욱임' },
  m2: { at: 1000, from: 'nobody@x.kr', subject: '광고입니다', preview: '' },
  m3: { at: 5000, from: 'x@y.kr', subject: '정일제지 퇴직금 문의', preview: '문의드립니다' }
};
const SENT = {
  s1: { at: 4000, to: 'hanbit@daum.net', subject: 'RE: 급여대장 보냅니다', body: '확인 부탁드립니다' }
};

function load(st) {
  const sandbox = { window: {}, console, Date };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  new vm.Script([
    THREAD,
    'const state = ' + JSON.stringify(Object.assign(
      { inbox: INBOX, sentBox: SENT, erpCompanies: COS, coThreadQ: '', coThreadId: '', coThreadErr: '' }, st)) + ';',
    /* 화면이 함께 쓰는 잔손들 — 실제 것은 얽혀 있어 같은 일을 하는 것으로 둔다 */
    'function esc(v){ return String(v==null?"":v).replace(/&/g,"&amp;").replace(/</g,"&lt;"); }',
    'function fmtDate(at){ const d=new Date(Number(at)||0); return (d.getMonth()+1)+"/"+d.getDate(); }',
    'function renderMailPage(){}',
    /* 2026-09-06 — 회사 메일함도 갈래로 들어왔다. 이 검사는 «화면이 무엇을 그리나»를
       보는 것이라, 메일함 폴더는 «없는 것»으로 두고 예전 두 갈래만 본다.
       회사 메일함 갈래와 요약 저장은 tests/co-mail-digest.test.js 가 본다. */
    'const _mbFolders = {}; const _mbMsgs = {}; const Store = { mode:"local" };',
    'function coMailWrite(){ return Promise.resolve(false); }',
    cut('mbSyncFolders'), cut('coThreadSources'), cut('coThreadList'), cut('coThreadHtml'),
    'window.list = coThreadList; window.html = coThreadHtml;'
  ].join('\n'), { filename: 'co-thread-screen.js' }).runInContext(sandbox);
  return sandbox.window;
}

/* ══════ 목록 ══════ */

test('★ 오간 것이 있는 사업장만 왼쪽에 선다 — 371곳을 다 늘어놓으면 못 찾는다', () => {
  const l = load({}).list();
  assert.equal(l.map(x => x.co.id).join(','), 'c1,c2', '오간 것이 없는 곳이 섞였습니다');
});

test('★ 늦게 오간 곳이 위로 온다', () => {
  /* c1 은 5000(짐작 포함), c2 는 4000 */
  assert.equal(load({}).list()[0].co.id, 'c1');
});

test('★ 받은 것과 보낸 것을 함께 센다 — 보낸 것만 있는 곳도 목록에 있어야 한다', () => {
  const c2 = load({}).list().filter(x => x.co.id === 'c2')[0];
  assert.ok(c2, '보낸 메일만 있는 사업장이 빠졌습니다');
  assert.equal(c2.n, 1);
});

test('사업장 이름으로 좁혀 본다', () => {
  const h = load({ coThreadQ: '한빛' }).html();
  assert.equal(/정일제지<\/b>/.test(h), false, '좁혔는데 남의 사업장이 남았습니다');
});

/* ══════ 그리기 ══════ */

test('★ 고른 사업장과 오간 것이 한 줄기로 그려진다 — 이 화면의 핵심이다', () => {
  const h = load({ coThreadId: 'c1' }).html();
  assert.match(h, /8월 급여자료/);
  assert.match(h, /정일제지 퇴직금 문의/);
  assert.equal(/광고입니다/.test(h), false, '남의 사업장 것이 섞였습니다');
});

test('★ 받은 것과 보낸 것을 갈라 보여 준다', () => {
  const h = load({ coThreadId: 'c2' }).html();
  assert.match(h, /보낸 메일/);
  assert.match(h, /cttag out/);
});

test('★ 제목으로 찾은 것은 「짐작」이라고 적는다 — 맞다고 읽히면 안 된다', () => {
  const h = load({ coThreadId: 'c1' }).html();
  /* 머리줄 셈(「짐작 1」)만으로는 **어느 줄이** 짐작인지 알 수 없다 —
     줄 자체에 붙는 표를 본다(2026-08-30 이빨 검사에서 걸렸다). */
  assert.match(h, /ctguess/, '어느 줄이 짐작인지 줄에 안 적혀 있습니다');
  assert.match(h, /짐작 1/, '몇 줄이 짐작인지 머리줄에 없습니다');
});

test('★ 아직 없는 갈래를 적어 둔다 — 「이게 다인가」를 묻지 않게', () => {
  const h = load({ coThreadId: 'c1' }).html();
  assert.match(h, /문자/);
  assert.match(h, /카톡/);
});

test('★ 업체 명단을 못 읽으면 까닭을 그대로 보여 준다 — 빈 화면은 고장으로 보인다', () => {
  const h = load({ coThreadErr: 'permission_denied' }).html();
  assert.match(h, /permission_denied/);
});

test('아직 아무것도 안 왔으면 그렇다고 말한다', () => {
  const h = load({ inbox: {}, sentBox: {} }).html();
  assert.match(h, /없습니다/);
});

test('자료가 없어도 터지지 않는다', () => {
  assert.equal(load({ inbox: null, sentBox: null }).list().length, 0);
  assert.doesNotThrow(() => load({ inbox: null, sentBox: null, erpCompanies: [] }).html());
});

/* ══════ 배선 — 폰·PC 두 곳 (2026-08-24 「받은 어디서 찾나 안보인다」) ══════ */

test('★ PC 옆줄에 들어갈 길이 있다', () => {
  const src = cut('mailSideHtml');
  assert.match(src, /openCoThread\(\)/, 'PC 옆줄에 들어갈 길이 없습니다');
  assert.match(src, /사업장별/);
});

test('★ PC 본문이 사업장별을 그린다', () => {
  assert.match(cut('renderMailPage'), /coThreadHtml\(\)/, 'PC 는 눌러도 안 열립니다');
});

test('★ 폰에도 그대로 있다 — 한쪽만 고치면 기기에 따라 안 열린다', () => {
  const src = cut('renderMailMobile');
  assert.match(src, /openCoThread\(\)/);
  assert.match(src, /coThreadHtml\(\)/);
});

test('나갔다 들어와도 사업장별로 돌아온다', () => {
  assert.match(HTML, /s\.mail === 'co'/, '되돌아오는 길이 없습니다');
});

test('★ 화면이 모으는 셈을 스스로 하지 않는다 — 갈래가 늘 때 화면을 고치게 된다', () => {
  const src = cut('coThreadHtml') + cut('coThreadList');
  assert.match(src, /PuCoThread/, '모으는 일은 pu-co-thread.js 가 해야 합니다');
  assert.match(HTML, /pu-co-thread\.js\?v=\d+/, '읽개를 안 불렀거나 캐시 번호가 없습니다');
});

test('★ 좁히라고 업체 명단을 함께 준다 — 안 주면 한 통이 네 곳에 다 걸린다', () => {
  /* 2026-09-02 실제 자료: 받은 메일 72줄 중 33줄이 여러 곳에 한꺼번에 붙었다 */
  const src = cut('coThreadList') + cut('coThreadHtml');
  assert.match(src, /thread\([^)]*\{\s*all:/, '명단 없이 부르면 좁히지 않습니다');
});

test('★ 업체 명단은 급여데이터함과 같은 자리를 읽는다 — 사본을 만들지 않는다', () => {
  assert.match(cut('loadCoThread'), /data\/companies/);
});

test('★ 셋을 다 읽고서 그린다 — 하나라도 빠지면 반쪽만 보인다', () => {
  const src = cut('openCoThread');
  assert.match(src, /loadInbox/);
  assert.match(src, /loadSentBox/);
  assert.match(src, /loadCoThread/);
});
