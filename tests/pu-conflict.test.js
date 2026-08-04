'use strict';
// js/pu-conflict.js 단위 검사 — 실행: node --test tests/*.test.js
//
// 두 사람이 같은 것을 동시에 고쳤는지 판단하는 층. 여기서 잘못 판단하면
// ① 진짜 충돌을 놓쳐 남의 작업이 말없이 사라지거나
// ② 아무 때나 경고를 띄워 사람이 경고를 안 믿게 된다. ②도 ①만큼 나쁘다.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadConflict() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'pu-conflict.js'), 'utf8');
  const sandbox = { window: {}, console };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  new vm.Script(src, { filename: 'pu-conflict.js' }).runInContext(sandbox);
  return sandbox.window.PuConflict;
}

const T1 = new Date(2026, 7, 4, 10, 0).getTime();   // 내가 화면에 띄운 때
const T2 = new Date(2026, 7, 4, 10, 30).getTime();  // 남이 고친 때

test('판단 층이 window에 붙는다', () => {
  assert.ok(loadConflict(), 'window.PuConflict 가 없습니다');
});

/* ── 겹쳤다고 봐야 하는 경우 ── */

test('내가 읽어온 뒤 남이 고쳤으면 겹쳤다', () => {
  const C = loadConflict();
  const hit = C.check(
    { id: 'a', updatedAt: T2, updatedBy: '김노무', phone: '041-1' },
    { id: 'a', updatedAt: T1, phone: '041-2' },
    { myName: '권형하' }
  );
  assert.ok(hit, '겹쳤는데 못 잡았습니다');
  assert.equal(hit.who, '김노무');
  assert.equal(hit.at, T2);
});

test('누가 고쳤는지 모르면 그래도 겹쳤다고 본다', () => {
  // 이름이 없다고 넘기면 옛 자료에서 진짜 충돌을 놓친다.
  const C = loadConflict();
  const hit = C.check({ updatedAt: T2 }, { updatedAt: T1 }, { myName: '권형하' });
  assert.ok(hit);
  assert.equal(hit.who, '');
});

/* ── 겹치지 않았다고 봐야 하는 경우 (거짓 경고 방지) ── */

test('내가 읽어온 뒤 아무도 안 고쳤으면 조용하다', () => {
  const C = loadConflict();
  assert.equal(C.check({ updatedAt: T1 }, { updatedAt: T1 }), null);
  assert.equal(C.check({ updatedAt: T1 }, { updatedAt: T2 }), null);
});

test('새로 만드는 것은 겹칠 상대가 없다', () => {
  const C = loadConflict();
  assert.equal(C.check(null, { updatedAt: T1 }), null);
  assert.equal(C.check(undefined, { updatedAt: T1 }), null);
});

test('시각을 모르면 경고하지 않는다 — 지어내지 않는다', () => {
  const C = loadConflict();
  assert.equal(C.check({ updatedBy: '김노무' }, { updatedAt: T1 }), null, '상대 시각을 모릅니다');
  assert.equal(C.check({ updatedAt: T2 }, { phone: '1' }), null, '내가 언제 읽었는지 모릅니다');
});

test('내가 방금 고친 것이면 나에게 경고하지 않는다', () => {
  // '권형하님이 고쳤습니다'를 권형하에게 띄우면 놀라고, 다음부터 경고를 안 믿는다.
  const C = loadConflict();
  assert.equal(C.check(
    { updatedAt: T2, updatedBy: '권형하' },
    { updatedAt: T1 },
    { myName: '권형하' }
  ), null);
});

test('이름이 같아도 내가 아니면 경고한다', () => {
  const C = loadConflict();
  assert.ok(C.check({ updatedAt: T2, updatedBy: '김노무' }, { updatedAt: T1 }, { myName: '' }));
  assert.ok(C.check({ updatedAt: T2, updatedBy: '김노무' }, { updatedAt: T1 }, {}));
});

/* ── 서로 다른 칸 ── */

test('서로 다른 칸을 이름표로 알려 준다', () => {
  const C = loadConflict();
  const d = C.diffFields(
    { name: '가나상사', phone: '041-1', ceo: '홍길동' },
    { name: '가나상사', phone: '041-2', ceo: '김철수' },
    { phone: '전화', ceo: '대표자' }
  );
  assert.deepEqual([...d].sort(), ['대표자', '전화']);
});

test('이름 모르는 칸은 말하지 않는다 — 영문 코드를 사람에게 보이지 않는다', () => {
  const C = loadConflict();
  const d = C.diffFields({ internalFlag: 1 }, { internalFlag: 2 }, { phone: '전화' });
  assert.deepEqual([...d], []);
});

test('시각·이름 칸이 달라도 다른 칸으로 세지 않는다', () => {
  // 저장할 때마다 반드시 달라지는 칸이다 — 세면 늘 충돌로 보인다.
  const C = loadConflict();
  const d = C.diffFields(
    { updatedAt: T2, updatedBy: '김노무', id: 'a' },
    { updatedAt: T1, updatedBy: '권형하', id: 'a' },
    { updatedAt: '고친때', updatedBy: '고친이', id: '번호' }
  );
  assert.deepEqual([...d], []);
});

test('한쪽에만 있는 칸도 다른 칸이다', () => {
  const C = loadConflict();
  const d = C.diffFields({ memo: '있음' }, {}, { memo: '메모' });
  assert.deepEqual([...d], ['메모']);
});

/* ── 읽어온 판(base)을 주면 '그분이 고친 칸'을 정확히 안다 ── */

test('원본을 주면 상대가 고친 칸만 골라낸다', () => {
  const C = loadConflict();
  const base = { id: 'a', updatedAt: T1, phone: '041-1', ceo: '홍길동' };
  const mine = { id: 'a', updatedAt: T1, phone: '041-1', ceo: '김철수' };   // 내가 대표자를 고쳤다
  const stored = { id: 'a', updatedAt: T2, updatedBy: '김노무', phone: '041-9', ceo: '홍길동' }; // 남이 전화를 고쳤다
  const hit = C.check(stored, mine, { base: base, labels: { phone: '전화', ceo: '대표자' } });
  assert.equal(hit.sure, true);
  assert.deepEqual([...hit.diff], ['전화'], '내가 고친 칸까지 상대 것으로 셌습니다');
  assert.match(C.message('업체', hit), /그분이 고친 칸: 전화/);
});

test('원본이 없으면 섞였다고 솔직히 말한다', () => {
  const C = loadConflict();
  const mine = { id: 'a', updatedAt: T1, phone: '041-1', ceo: '김철수' };
  const stored = { id: 'a', updatedAt: T2, updatedBy: '김노무', phone: '041-9', ceo: '홍길동' };
  const hit = C.check(stored, mine, { labels: { phone: '전화', ceo: '대표자' } });
  assert.equal(hit.sure, false);
  assert.deepEqual([...hit.diff].sort(), ['대표자', '전화']);
  const msg = C.message('업체', hit);
  assert.match(msg, /서로 다른 칸/);
  assert.ok(!/그분이 고친 칸/.test(msg), '모르는 것을 아는 척합니다');
});

test('원본을 줘도 겹치지 않았으면 조용하다', () => {
  const C = loadConflict();
  const base = { id: 'a', updatedAt: T2 };
  assert.equal(C.check({ id: 'a', updatedAt: T2 }, { id: 'a', updatedAt: T2 }, { base: base }), null);
});

/* ── 문구 ── */

test('물음 문구에 누가·언제·무엇이 다 들어 있다', () => {
  const C = loadConflict();
  const msg = C.message('업체', { who: '김노무', at: T2, diff: ['전화'] });
  assert.match(msg, /김노무/);
  assert.match(msg, /2026-08-04 10:30/);
  assert.match(msg, /업체/);
  assert.match(msg, /전화/);
  assert.match(msg, /사라집니다/, '무엇을 잃는지 말하지 않습니다');
  assert.match(msg, /취소/, '그만두는 길을 알려주지 않습니다');
});

test('어느 쪽이 고친 칸인지 모른다고 솔직히 말한다', () => {
  // diffFields 는 '상대가 고친 칸'을 알 수 없다. 아는 척하면 사람이 잘못 판단한다.
  const C = loadConflict();
  const msg = C.message('업체', { who: '김', at: T2, diff: ['전화'] });
  assert.match(msg, /알 수 없습니다/);
});

test('다른 칸을 모를 때는 칸 이야기를 아예 안 한다', () => {
  const C = loadConflict();
  const msg = C.message('사건', { who: '김', at: T2, diff: [] });
  assert.ok(!/서로 다른 칸/.test(msg), '빈 목록을 보여줍니다: ' + msg);
});

test('문구가 사람이 읽을 한국어다 — 영문 내부 용어가 없다', () => {
  const C = loadConflict();
  const msg = C.message('업체', { who: '김노무', at: T2, diff: ['전화'] });
  assert.ok(!/[A-Za-z]{4,}/.test(msg), '영문 용어가 노출됩니다: ' + msg);
  const note = C.overwriteNote('업체', { who: '김노무', at: T2, diff: ['전화'] });
  assert.ok(!/[A-Za-z]{4,}/.test(note), '영문 용어가 노출됩니다: ' + note);
});

test('덮어썼다는 한 줄에 누가·무엇이 들어 있다', () => {
  // 물어보지 못한 경로에서도 최소한 보이게 하는 그물.
  const C = loadConflict();
  const note = C.overwriteNote('업체', { who: '김노무', at: T2, diff: ['전화', '주소'] });
  assert.match(note, /김노무/);
  assert.match(note, /덮어썼습니다/);
  assert.match(note, /전화 · 주소/);
});

test('을/를을 가려 쓴다 — 괄호를 달아 두면 읽다 걸린다', () => {
  const C = loadConflict();
  assert.equal(C.eulReul('업체'), '를');
  assert.equal(C.eulReul('사건'), '을');
  assert.equal(C.eulReul('계약'), '을');
  assert.equal(C.eulReul('컨설팅'), '을');
  assert.equal(C.eulReul('청구서'), '를');
  assert.equal(C.eulReul(''), '를');
  assert.equal(C.eulReul('memo'), '를', '한글이 아니면 기본값');
});

test('문구에 을(를) 같은 괄호가 없다', () => {
  const C = loadConflict();
  ['업체', '사건', '계약', '컨설팅', '청구서', '자료'].forEach(function (w) {
    const msg = C.message(w, { who: '김', at: new Date(2026, 7, 4).getTime(), diff: [] });
    assert.ok(!/\(를\)|\(을\)|\(이\)|\(가\)/.test(msg), w + ': ' + msg);
    assert.match(msg, new RegExp('이 ' + w + '(을|를) 고쳤습니다'));
  });
});

test('시각을 사람 말로 바꾼다 — 1970년을 보여주지 않는다', () => {
  const C = loadConflict();
  assert.equal(C.whenText(new Date(2026, 0, 5, 9, 7).getTime()), '2026-01-05 09:07');
  assert.equal(C.whenText(0), '');
  assert.ok(!/1970/.test(C.message('업체', { who: '김', at: 0, diff: [] })));
});
