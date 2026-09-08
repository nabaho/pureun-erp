'use strict';
/* 푸른 메일 「받은 메일」 화면 (대표 결정 2026-08-24) — 실행: node --test tests/*.test.js

   푸른 메일에는 **보내는 쪽만** 있었다(쓰기·보낸·예약·자료함). 받은 메일은
   급여데이터함 안에서만, 그것도 **자료로 담긴 것만** 보였다.

   ⚠ 사본이 아니다 — 답장·삭제·읽음은 다음메일이 진짜다. 그래서 이 화면은
   읽기만 하고, 줄을 눌러도 답장이 아니라 급여데이터함으로 간다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const R = path.join(__dirname, '..');
const HTML = fs.readFileSync(path.join(R, 'pu-cards.html'), 'utf8');

function cut(name) {
  const m = HTML.match(new RegExp('function ' + name + '\\s*\\([\\s\\S]*?\\n\\}'));
  assert.ok(m, name + ' 함수를 찾을 수 없습니다');
  return m[0];
}

function load(st) {
  const sandbox = { window: {}, console, Date };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  new vm.Script([
    'const state = ' + JSON.stringify(Object.assign({ inbox: {}, inboxQ: '', inboxFilter: 'all', inboxErr: '', inboxPulling: false }, st)) + ';',
    /* 화면이 함께 쓰는 잔손들 — 실제 것을 잘라 오기엔 얽혀 있어 같은 일을 하는 것으로 둔다 */
    'function esc(v){ return String(v==null?"":v).replace(/&/g,"&amp;").replace(/</g,"&lt;"); }',
    'function fmtDate(at){ const d=new Date(Number(at)||0); return (d.getMonth()+1)+"/"+d.getDate(); }',
    'function renderMailPage(){}',
    cut('inboxVisibleRows'), cut('inboxCounts'), cut('inboxBoxHtml'),
    'window.rows = inboxVisibleRows; window.counts = inboxCounts; window.html = inboxBoxHtml;'
  ].join('\n'), { filename: 'inbox.js' }).runInContext(sandbox);
  return sandbox.window;
}

const BOX = {
  m1: { from: '정담회계법인 <acct@jd.kr>', subject: 'RE: 8월 급여대장 송부',
    preview: '중도퇴사자 급여대장 보내드립니다', box: '2.급여+사무대행',
    at: 3000, atts: 2, took: 2, seatName: '최기운', shared: false, why: '' },
  m2: { from: '김나래 <cust12@naver.com>', subject: '장진숙님 근태내역입니다.',
    preview: '8월 근태 엑셀 보냅니다', box: '2.급여+사무대행',
    at: 2000, atts: 1, took: 1, seatName: '', shared: true, why: '업체관리에 없는 주소' },
  m3: { from: '유문경 <cust16@naver.com>', subject: '퇴직연금 불입액 문의',
    preview: '8월분 불입액이 얼마인지', box: '2.급여+사무대행',
    at: 1000, atts: 0, took: 0, seatName: '', shared: false,
    why: '숫자가 없어 값으로 만들 것이 없습니다' }
};

/* ══════ 목록 ══════ */

test('★ 최근 받은 것이 위로 온다', () => {
  const W = load({ inbox: BOX });
  // vm 안에서 만든 배열은 deepEqual 로 못 견준다 — 이어 붙여 본다
  assert.equal(W.rows().map(r => r.id).join(','), 'm1,m2,m3');
});

test('★ 자료로 안 담긴 문의 메일도 목록에 있다 — 통째로 안 보이던 것이 문제였다', () => {
  const W = load({ inbox: BOX });
  assert.ok(W.rows().some(r => r.id === 'm3'));
});

test('★ 칩으로 걸러 본다', () => {
  assert.equal(load({ inbox: BOX, inboxFilter: 'took' }).rows().length, 2);
  assert.equal(load({ inbox: BOX, inboxFilter: 'none' }).rows().length, 1);
  assert.equal(load({ inbox: BOX, inboxFilter: 'lost' }).rows().length, 1);
});

test('★ 보낸이·제목·미리보기로 찾는다', () => {
  assert.equal(load({ inbox: BOX, inboxQ: '정담' }).rows().length, 1);
  // 「근태」는 m2 하나뿐이다 — m1 은 급여대장, m3 는 퇴직연금 문의
  assert.equal(load({ inbox: BOX, inboxQ: '근태' }).rows().length, 1);
  // 미리보기까지 훑는다 — m1 의 미리보기에만 있는 말로 찾아 본다
  assert.equal(load({ inbox: BOX, inboxQ: '중도퇴사자' }).rows().length, 1);
  assert.equal(load({ inbox: BOX, inboxQ: '없는말' }).rows().length, 0);
});

test('빈칸·대소문자는 무시한다', () => {
  assert.equal(load({ inbox: BOX, inboxQ: '  ACCT@JD.KR ' }).rows().length, 1);
});

test('셈이 목록과 같은 것을 본다 — 따로 세면 개수가 어긋난다', () => {
  const c = load({ inbox: BOX }).counts();
  assert.equal(c.all, 3);
  assert.equal(c.took, 2);
  assert.equal(c.none, 1);
  assert.equal(c.lost, 1);
});

test('시각이 없는 줄은 안 그린다 — 반쯤 적힌 것이 목록을 어지럽힌다', () => {
  const W = load({ inbox: Object.assign({ bad: { subject: '시각 없음' } }, BOX) });
  assert.equal(W.rows().length, 3);
});

test('자료가 없어도 터지지 않는다', () => {
  const W = load({ inbox: null });
  assert.equal(W.rows().length, 0);
  assert.equal(W.counts().all, 0);
});

/* ══════ 그리기 ══════ */

test('★ 담긴 결과가 줄마다 보인다 — 이 화면의 핵심이다', () => {
  const h = load({ inbox: BOX }).html();
  assert.match(h, /자료 2건/);
  assert.match(h, /최기운 칸/);
  assert.match(h, /공용 칸/);
  assert.match(h, /안 담김/);
  assert.match(h, /숫자가 없어/);
});

test('★ 규칙이 없어 못 읽으면 「고장」이 아니라고 말한다', () => {
  const h = load({ inbox: {}, inboxErr: 'permission_denied' }).html();
  assert.match(h, /규칙/, '무엇을 해야 하는지 말해야 합니다');
  assert.match(h, /permission_denied/, '까닭을 그대로 보여야 합니다');
});

test('아직 아무것도 없으면 그렇다고 말한다 — 빈 표만 두면 고장으로 보인다', () => {
  const h = load({ inbox: {} }).html();
  assert.match(h, /아직 서버가 본 메일이 없습니다/);
});

test('찾는 것이 없을 때는 「없다」가 아니라 「못 찾았다」로 말한다', () => {
  const h = load({ inbox: BOX, inboxQ: '없는말' }).html();
  assert.match(h, /찾은 메일이 없습니다/);
});

test('★ 답장·삭제는 다음메일에서 한다고 적는다 — 두 곳에서 지우면 안 된다', () => {
  const h = load({ inbox: BOX }).html();
  assert.match(h, /다음메일에서/);
});

test('★ 가져오는 중에는 단추가 잠긴다', () => {
  const h = load({ inbox: BOX, inboxPulling: true }).html();
  assert.match(h, /disabled/);
  assert.match(h, /가져오는 중/);
});

/* ══════ 배선 ══════ */

test('★ 갈래줄에 「받은」이 있다', () => {
  assert.match(HTML, /openInbox\(\)/);
  assert.match(HTML, /📥 받은/);
});

test('★ 서버가 적은 자리를 읽는다', () => {
  assert.match(cut('loadInbox'), /MAILLOG_PATH/);
  assert.match(HTML, /paydata\/maillog/);
});

test('★ 「지금 가져오기」가 서버 함수를 부른다', () => {
  const src = cut('inboxPull');
  assert.match(src, /pullPaydataMail/);
  assert.match(src, /getIdToken/, '로그인 표를 함께 보내야 합니다');
  assert.match(src, /if\(state\.inboxPulling\) return;/, '두 번 눌림을 막아야 합니다');
});

test('★ 줄을 누르면 답장이 아니라 급여데이터함으로 간다 — 사본을 만들지 않는다', () => {
  const h = load({ inbox: BOX }).html();
  assert.match(h, /goPaydataMail\(\)/);
  assert.equal(/onclick="reply/.test(h), false, '답장 단추를 두면 두 곳이 갈라집니다');
});

/* ══════ 지난 회차에 처리한 메일 (2026-08-24 규칙 켠 첫날) ══════

   규칙을 넣은 직후 목록이 **텅 비었다** — 폴더의 30통이 모두 지난 회차에 이미
   처리돼 있었다. 이제 그것도 목록에 남는데, 담긴 결과를 알 수 없으므로
   「안 담김」이라고 하면 거짓말이 된다. */

const OLD = {
  o1: { from: '정담 <acct@jd.kr>', subject: '지난달 급여대장', preview: '보내드립니다',
    box: '2.급여+사무대행', at: 5000, atts: 1, took: 0, shared: false,
    why: '지난 회차에 이미 처리했습니다', old: true }
};

test('★ 지난 회차 것은 「안 담김」이 아니라 「지난 회차 처리」로 보인다', () => {
  const h = load({ inbox: OLD }).html();
  assert.match(h, /지난 회차 처리/);
  /* 「안 담김」은 칩 이름으로도 늘 있다 — 줄에 붙는 빨간 표만 본다 */
  assert.equal(/ibtg no/.test(h), false, '담겼는지 모르는 것을 안 담긴 것으로 말하면 안 됩니다');
});

test('★ 「안 담김」 셈에 지난 회차 것을 넣지 않는다 — 없는 문제를 쫓게 된다', () => {
  const c = load({ inbox: OLD }).counts();
  assert.equal(c.all, 1, '목록에는 있어야 합니다');
  assert.equal(c.none, 0, '안 담김으로 세면 안 됩니다');
});

test('「안 담김」 칩으로 걸러도 지난 회차 것은 안 나온다', () => {
  assert.equal(load({ inbox: OLD, inboxFilter: 'none' }).rows().length, 0);
  assert.equal(load({ inbox: OLD, inboxFilter: 'all' }).rows().length, 1);
});

test('지난 회차 것도 찾기로는 걸린다', () => {
  assert.equal(load({ inbox: OLD, inboxQ: '급여대장' }).rows().length, 1);
});


/* ══════ 들어가는 길 (2026-08-24 「받은 어디서 찾나 안보인다」) ══════

   폰 갈래줄에만 넣어 두어 **PC 에서는 들어갈 길이 아예 없었다.** 대표가
   쓰시는 화면이 PC 다. 화면을 늘릴 때 폰·PC 두 곳을 함께 고쳐야 한다. */

test('★ PC 옆줄에 「받은 메일」 줄이 있다 — 여기가 없어 못 찾으셨다', () => {
  const src = cut('mailSideHtml');
  assert.match(src, /openInbox\(\)/, 'PC 옆줄에 들어갈 길이 없습니다');
  assert.match(src, /받은 메일/);
});

test('★ PC 본문이 받은 메일을 그린다 — 폰만 그리고 있었다', () => {
  const src = cut('renderMailPage');
  assert.match(src, /inboxBoxHtml\(\)/, 'PC 는 눌러도 쓰기 화면이 뜹니다');
});

test('폰 갈래줄에도 그대로 있다 — 한쪽만 고치면 안 된다', () => {
  const src = cut('renderMailMobile');
  assert.match(src, /openInbox\(\)/);
  assert.match(src, /inboxBoxHtml\(\)/);
});

test('나갔다 들어와도 받은 메일로 돌아온다', () => {
  assert.match(HTML, /s\.mail === 'inbox'/, '되돌아오는 길이 없습니다');
});

