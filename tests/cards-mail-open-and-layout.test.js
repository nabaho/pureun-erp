'use strict';
/* 메일 문으로 들어올 때 명함 화면이 «깜빡이지» 않는다 + 쓰기 화면 차림새
   ═══════════════════════════════════════════════════════════════════════════
   대표 화면 2026-08-24: 포털의 「푸른 메일」을 누르면
     ① 명함 목록(명함 0 · 사업자 0, 옆줄 이름도 「푸른 기업정보함」)이 먼저 뜨고
     ② 그 뒤에 메일 쓰기 화면으로 바뀐다
   → 「3만 나오게 해달라」

   까닭: 명함이 도착하면 renderSoon() 이 «기본 화면(목록)»을 먼저 그리고, 그 뒤에
   restoreLastScreen() 이 openMailPage() 를 부른다. 그래서 남의 앱이 한 번 스쳤다.
   고침: 주소가 메일을 가리키면 «첫 그림을 그리기 전에» state.view 를 메일로 둔다.

   같은 날 지시 둘 더
     · 「한글 넣는거 너무 왼쪽으로 들어가 있다」 — 본문 좌우 여백이 2px 였다
     · 「보내기 왜 아래에 있나」 — 위에도 있는데 아래에 또 있었다(다음메일은 위에만)
   실행: node --test tests/cards-mail-open-and-layout.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.join(__dirname, '..', 'pu-cards.html'), 'utf8').replace(/\r\n/g, '\n');

function fnBody(name){
  let i = src.indexOf('\nfunction ' + name + '(');
  if (i < 0) i = src.indexOf('\nasync function ' + name + '(');
  assert.ok(i >= 0, name + ' 를 찾을 수 없습니다');
  return src.slice(i, src.indexOf('\n}', i) + 2);
}

/* ══════ ① 명함 화면이 스치지 않는다 ══════ */

/* 글자가 있나만 보면 안 된다 — 「return 'list';」 한 줄만 앞에 끼워도 글자는 그대로다.
   그래서 그 식을 «실제로 돌려» 본다. */
function initialView(search){
  const i = src.indexOf('const state = {');
  assert.ok(i > 0, 'state 를 만드는 자리를 찾지 못했습니다');
  const decl = src.slice(i, src.indexOf('\n};', i));
  const at = decl.indexOf('view:');
  assert.ok(at > 0, 'state 에 view 를 정하는 자리가 없습니다');
  /* view: 부터 다음 항목(vtab) 앞까지가 그 식이다 */
  const end = decl.indexOf('vtab:', at);
  assert.ok(end > at, 'view 다음 항목을 찾지 못했습니다');
  const expr = decl.slice(at + 5, decl.lastIndexOf(',', end)).trim();
  const vm = require('node:vm');
  const ctx = { location: { search: search } };
  vm.createContext(ctx);
  return vm.runInContext('(' + expr + ')', ctx);
}

test('★ 주소가 메일이면 «첫 그림 전에» 화면을 메일로 정한다', () => {
  assert.equal(initialView('?view=mail&sso=1'), 'mail',
    '★ 첫 화면이 목록이면 명함 화면이 한 번 스친다 (대표 화면 2026-08-24)');
  assert.equal(initialView('?view=mail'), 'mail');
  assert.equal(initialView('?sso=1&view=mail&v=3'), 'mail');
});

test('메일 문이 아니면 예전처럼 목록으로 시작한다', () => {
  for (const s of ['', '?sso=1', '?view=mailbox', '?xview=mail', '?view=maillist']) {
    assert.equal(initialView(s), 'list',
      '★ ' + JSON.stringify(s) + ' 로 들어왔는데 메일이 열렸다 — 기업정보함을 못 쓰게 된다');
  }
});

test('첫 그림 전에 정하는 것이 restoreLastScreen 보다 «앞»이다', () => {
  const decl = src.indexOf('const state = {');
  const restore = src.indexOf('function restoreLastScreen(');
  assert.ok(decl > 0 && restore > decl,
    'state 를 만드는 자리가 restoreLastScreen 보다 뒤에 있으면 이 방식이 안 통한다');
});

test('머리(<head>)의 판단과 «같은 조건»을 쓴다 — 한쪽만 고치면 어긋난다', () => {
  /* <head> 는 manifest·아이콘을 갈아 끼울 때 같은 조건을 본다. 조건이 갈라지면
     아이콘 이름은 메일인데 열리는 화면은 명함이 된다(이미 겪은 문제). */
  const hits = src.match(/view=mail\(&\|\$\)/g) || [];
  assert.ok(hits.length >= 3,
    '★ 같은 조건을 쓰는 자리가 ' + hits.length + '곳뿐이다 — 머리·urlWantsMail·state 셋이어야 한다');
});

test('메일 화면으로 열려도 자료함·보낸 메일을 읽어 온다', () => {
  /* 화면만 메일로 두고 끝내면 자료 서랍이 빈 채로 열린다 —
     사람이 누르는 것과 같은 함수(openMailPage)를 반드시 지나야 한다. */
  assert.match(fnBody('restoreLastScreen'), /openMailPage\(\)/,
    '★ openMailPage 를 안 지나면 자료함·보낸 메일이 안 읽힌다');
});

/* ══════ ② 본문 여백 ══════ */

test('★ 본문 좌우 여백이 넉넉하다 — 글자가 왼쪽 끝에 붙지 않는다', () => {
  const m = src.match(/#pcMail \.cpbody\{[^}]*\}/);
  assert.ok(m, '메일 화면의 본문 규칙을 찾지 못했습니다');
  const pad = m[0].match(/padding:\s*([\d.]+)px\s+([\d.]+)px/);
  assert.ok(pad, '본문 여백 규칙이 없다: ' + m[0]);
  assert.ok(Number(pad[2]) >= 12,
    '★ 좌우 여백이 ' + pad[2] + 'px 다 — 글자가 칸 왼쪽 끝에 붙어 읽기 어렵다 (12px 이상)');
});

/* ══════ ③ 보내기는 위에만 ══════ */

test('★ 쓰기 화면 아래에 「보내기」를 겹쳐 두지 않는다', () => {
  const fn = fnBody('mailWriteHtml');
  const top = fn.indexOf('class="cpsendbtn"');
  assert.ok(top > 0, '위쪽 보내기가 없다 — 그러면 보낼 길이 아예 없다');
  assert.ok(fn.indexOf('class="sm-send"') < 0,
    '★ 아래에 또 보내기가 있다 — 다음메일은 위에만 있고, 둘이면 어느 것이 진짜인지 헷갈린다');
});

test('보내는 중 표시는 위쪽 단추에 붙는다', () => {
  assert.match(fnBody('lockSendButtons'), /cpsendbtn/,
    '위쪽 단추를 안 잠그면 두 번 눌러 같은 메일이 두 통 나간다');
});

test('명함 상세의 「편지 쓰기」 단추는 그대로다 — 다른 화면이다', () => {
  /* sm-send 는 명함 상세·주소록에서도 쓴다. 쓰기 화면에서만 뺀 것이다. */
  assert.ok((src.match(/class="sm-send"/g) || []).length >= 3,
    '다른 화면의 큰 단추까지 지웠다');
});
