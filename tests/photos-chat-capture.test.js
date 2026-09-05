/* 대화 캡처 — 요약하고 할 일을 뽑아 그 자리에서 처리한다 (대표 지시 2026-08-12)
   "급여 아웃소싱은 우선 대화 내용 요약하고 정리할 수 있게 시스템 정리해달라.
    카톡·메일 캡처가 올라오면 **상대방이 입력한 부분 우선** 정리해서 기록하고
    보관하고 업무 수행할 수 있게 준비해달라."

   실사례: 카톡 대화 캡처 하나가 「급여대장」으로 분류돼 급여서류 경고까지 떴다
   (2026-08-12 대표 캡처). 대화와 서류를 가르는 눈이 없었다.

   ⚠ 이 기능에서 가장 위험한 것 둘:
     · 급여 얘기 대화가 payslip 으로 가면 **지우라는 경고**가 뜬다 — 대화는 보관 대상이다
     · 할 일 체크가 저장 실패로 어긋나거나, 남의 사진에 써지는 것 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'pu-photos.html'), 'utf8');
const lib = fs.readFileSync(path.join(root, 'js', 'pu-doc-read.js'), 'utf8');

/* ⚠ pu-photos.html 의 함수는 들여쓰기 0, pu-doc-read.js 는 IIFE 안이라 2칸이다.
   닫는 괄호 자리가 달라서 한 규칙으로 자르면 다음 함수까지 통째로 삼킨다
   (실제로 그래서 처음에 터졌다) — indent 를 받아 그 자리의 } 까지만 자른다. */
function fnOf(src, name, indent) {
  const pad = indent || '';
  const m = src.match(new RegExp('function ' + name + '\\([\\s\\S]*?\\r?\\n' + pad + '\\}'));
  assert.ok(m, name + ' 을 찾을 수 없습니다');
  return m[0];
}

/* ── 판독 층: 종류와 프롬프트 ── */
test('★ 판독기가 chat 을 안다 — 판 번호도 올랐다', () => {
  assert.match(lib, /var KINDS = \{[^}]*chat: 1/, 'KINDS 에 chat 이 없으면 판독 결과가 other 로 뭉개집니다');
  const v = lib.match(/var READ_VERSION = (\d+);/);
  assert.ok(v && +v[1] >= 4,
    '판 번호를 안 올리면 이미 읽힌 캡처가 옛 분류(payslip 등)로 영영 굳습니다: ' + (v && v[1]));
});

test('★ 급여 얘기 대화도 서류가 아니라 대화다', () => {
  /* 이것이 이 기능의 출발점이다 — 캡처 하나가 급여대장으로 분류돼
     「지워 주세요」 경고가 떴다. 대화는 지울 것이 아니라 보관할 것이다. */
  assert.match(lib, /대화 캡처가 급여·계약 이야기를 담고 있어도 kind=chat/,
    '이 줄이 없으면 급여 얘기 카톡이 payslip 으로 가서 지우라는 경고가 뜹니다');
});

test('★ 상대방이 입력한 부분을 먼저 담으라고 시킨다', () => {
  assert.match(lib, /상대방이 보낸 요청·전달사항을 먼저/,
    '대표 지시의 핵심입니다 — 상대방 요청이 우리 답장보다 먼저여야 합니다');
  assert.match(lib, /ours=false\)[\s\S]{0,80}ours=true/,
    '상대(ours=false)가 먼저, 우리 약속(ours=true)이 다음이라는 순서가 없습니다');
});

test('★ 대화에서도 금액·주민번호는 안 담는다', () => {
  /* 급여서류에서 금액을 안 읽는 것과 같은 이유 — 사진첩이 쓰지 않는 민감정보를
     읽어 두면 클라우드에 한 벌 더 쌓이는 위험만 는다. */
  assert.match(lib, /급여 금액과 주민등록번호는 t 에 적지 마세요/,
    '할 일 문장에 금액·주민번호가 들어가면 민감정보가 한 벌 더 쌓입니다');
});

test('★ 이미 처리된 것은 done=true 로 표시하게 시킨다', () => {
  assert.match(lib, /이미 처리된 것으로 보이면[\s\S]{0,40}done=true/,
    '다 끝난 일이 할 일로 쌓이면 목록을 못 믿게 됩니다');
});

test('★ afterRead 가 할 일 배열을 버리지 않는다 — 실제로 돌려 본다', async () => {
  /* fields 정리가 문자열만 살리면 todos(배열)가 조용히 사라진다. */
  /* ⚠ 함수 본문을 «베어» 오지 않는다(2026-08-26) — 판독기를 통째로 싣고
     그쪽이 낸 통로로 부른다. 베어 쓰면 옆 함수를 부르기 시작한 순간 넘어진다. */
  const ctx = { console, Promise, Object, Array, JSON, String, Number, Math, Date,
    RegExp, Error, isFinite, parseInt, parseFloat, setTimeout, clearTimeout };
  ctx.window = ctx; ctx.globalThis = ctx; ctx.self = ctx;
  vm.createContext(ctx);
  vm.runInContext(lib, ctx);
  const out = await ctx.PuDocRead._afterReadForTest({
    kind: 'chat', company: ' 오색할인마트 ', name: '임대순 대표',
    summary: '근로계약서 송부와 병가를 논의',
    todos: [{ t: '휴직 신고', done: false, ours: true },
            { t: '근로계약서 송부', done: true, ours: true }]
  });
  assert.equal(out.kind, 'chat');
  assert.equal(out.fields.company, '오색할인마트', '문자열은 다듬어 담아야 합니다');
  assert.ok(Array.isArray(out.fields.todos), '할 일 배열이 사라졌습니다 — 요약만 남고 할 일이 없어집니다');
  assert.equal(out.fields.todos.length, 2);
  assert.equal(out.bizNoOk, null, '대화에는 사업자번호가 없습니다 — false 면 「검증 실패」로 오해합니다');
});

test('★ 대화는 기업정보함·업체관리로 보내지 않는다 (autoOk)', () => {
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(lib.match(/var KINDS = \{[^\n]*/)[0], ctx);
  vm.runInContext('var bizNoValid = function(){ return false; };', ctx);
  vm.runInContext(fnOf(lib, 'autoOk', '  '), ctx);
  const v = ctx.autoOk({ kind: 'chat', fields: { summary: '요약' }, error: null });
  assert.equal(v.auto, false, '자동 등록할 곳이 없습니다');
  assert.match(v.why, /대화/, '왜 자동이 아닌지 사람 말로 적혀야 합니다');
  assert.equal(v.done, true, 'done 이 없으면 넣을 곳 없는 것이 할 일로 쌓입니다');
});

/* ── 사진첩 화면 ── */
test('★ 대화캡처 탭이 있고, 사람이 이 칸으로 옮길 수도 있다', () => {
  assert.match(app, /READ_LABEL = \{ chat: '카톡·메일 대화'/, '딱지 이름표가 없으면 「알 수 없음」으로 뜹니다');
  const tabs = app.match(/const KIND_TABS = \[[\s\S]*?\n\];/)[0];
  assert.match(tabs, /key: 'chat'[^\n]*kinds: \['chat'\], main: 'chat'/,
    'main 이 없으면 끌어다 놓기·분류 지정으로 이 칸에 못 넣습니다');
});

/* ⚠ 2026-08-24 대표 지시로 뜻이 바뀌었다: 「계속해서 확인 필요가 나온다 … 제대로 완전히
   고쳐 달라」. 종전에는 대화캡처가 **조건 없이** 할 일이었다 — 뽑아 둔 할 일을 다 끝낸
   뒤에도 ⚠ 가 남아, 끝냈다는 표시가 무의미해졌다. 이제 「남은 할 일이 있을 때만」이다. */
test('★ 남은 할 일이 있는 대화는 무엇을 하라는지 적힌다', () => {
  const w = fnOf(app, 'checkWhy');
  assert.match(w, /chat'\) return chatTodo\(r\) \? '대화 캡처 — 남은 할 일 확인' : ''/,
    '이유가 없으면 ⚠ 만 떠서 한 장씩 열어 봐야 압니다');
  /* chat 판정이 auto 판정보다 앞이어야 한다 — 대화캡처는 늘 auto:false 라
     그 줄에 먼저 닿으면 언제나 할 일이 된다.
     ⚠ **코드 꼴로 찾는다**(`if (!r.auto)`). 그냥 `!r.auto` 로 찾으면 그 줄을 설명하는
       주석을 먼저 집어 순서가 거꾸로 나온다 — 실제로 그렇게 걸렸다. */
  assert.ok(w.indexOf("r.kind === 'chat'") < w.indexOf('if (!r.auto)'),
    '★ auto 판정이 먼저면 대화캡처는 언제나 할 일입니다');
  /* ⚠ 2026-08-27 다시 겨눔 — needsCheck 가 checkWhy 를 그대로 쓰게 됐다
     (「이유가 있으면 곧 할 일」). 두 벌을 나란히 두고 «같은 조건인가»를 재던 검사는
     이제 잴 것이 없다 — 어긋날 수가 없다. 대신 **그 구조가 살아 있는가**를 못 박는다. */
  assert.match(fnOf(app, 'needsCheck'), /return !!checkWhy\(it\);/,
    '★ 판정이 다시 두 벌로 갈라지면 「목록엔 없는데 이유만 떠다니는」 사고가 돌아옵니다');
});

test('★ 요약과 할 일이 화면에 그려진다 — 실제로 돌려 본다', () => {
  const ctx = { Array, Object };
  vm.createContext(ctx);
  vm.runInContext('var esc = function(s){ return String(s); };', ctx);
  vm.runInContext(fnOf(app, 'chatTodoBox'), ctx);
  const it = { meta: { read: { kind: 'chat', fields: {
    summary: '병가와 복직을 논의했습니다',
    todos: [{ t: '휴직 신고', done: false, ours: true },
            { t: '출근일 회신', done: false, ours: false },
            { t: '급여대장 송부', done: true, ours: true }]
  } } } };
  const h = ctx.chatTodoBox(it);
  assert.match(h, /병가와 복직을 논의했습니다/, '요약이 안 보입니다');
  assert.match(h, /남은 2건/, '몇 건 남았는지 세어 줘야 훑어보기가 됩니다');
  assert.match(h, /상대방 요청 먼저/, '어떤 순서인지 화면이 말해야 합니다');
  assert.equal((h.match(/type="checkbox"/g) || []).length, 3, '할 일마다 체크 칸이 있어야 합니다');
  assert.equal((h.match(/ checked/g) || []).length, 1, '끝낸 것은 체크된 채로 나와야 합니다');
  assert.match(h, /toggleChatTodo\(0\)/, '눌러서 끝냈다고 표시할 수 있어야 합니다');
  assert.match(h, /<i>상대<\/i>/, '누구 말인지(상대/우리) 표시가 없습니다');

  /* 대화가 아니면 아무것도 안 그린다 — 명함 패널에 빈 상자가 생기면 안 된다 */
  assert.equal(ctx.chatTodoBox({ meta: { read: { kind: 'card', fields: {} } } }), '');
  /* 할 일을 못 뽑았으면 그렇다고 말한다 — 빈 화면은 고장으로 읽힌다 */
  assert.match(ctx.chatTodoBox({ meta: { read: { kind: 'chat', fields: {} } } }),
    /할 일을 뽑지 못한/, '못 뽑았으면 말을 해야 합니다');
});

test('★ 모두 끝나면 「모두 끝」이라고 말한다', () => {
  const ctx = { Array, Object };
  vm.createContext(ctx);
  vm.runInContext('var esc = function(s){ return String(s); };', ctx);
  vm.runInContext(fnOf(app, 'chatTodoBox'), ctx);
  const h = ctx.chatTodoBox({ meta: { read: { kind: 'chat', fields: {
    todos: [{ t: 'ㄱ', done: true }, { t: 'ㄴ', done: true }]
  } } } });
  assert.match(h, /모두 끝/, '끝났는데 남은 것처럼 보이면 다시 열어 보게 됩니다');
});

function bootToggle(blocked) {
  const saved = [];
  const rendered = [];
  const it = { id: 'p1', meta: { read: { kind: 'chat', rv: 4, fields: {
    summary: 'ㅇ', todos: [{ t: '휴직 신고', done: false, ours: true }]
  } } } };
  const ctx = {
    Array, Object, console,
    viewerId: 'p1',
    gridItems: [it],
    gridYear: '2026',
    blockedIfOther: function () { return !!blocked; },
    photoOwner: function (id) { return 'owner-of-' + id; },
    /* 2026-09-05: 저장 층에 «사진의 해»를 넘기게 되었다 — 안 주면 그 자리에서 멎는다 */
    photoYearOf: function () { return '2026'; },
    renderReadPanel: function (x) { rendered.push(x); },
    PuPhotoStore: { saveRead: function (y, id, read, owner) {
      saved.push({ y: y, id: id, read: read, owner: owner });
      return { catch: function () {} };
    } },
    alert: function () {}
  };
  vm.createContext(ctx);
  vm.runInContext(fnOf(app, 'toggleChatTodo'), ctx);
  return { ctx: ctx, it: it, saved: saved, rendered: rendered };
}

test('★ 체크하면 저장까지 간다 — 그 사진 주인 자리에', () => {
  const b = bootToggle(false);
  const before = b.it.meta;
  b.ctx.toggleChatTodo(0);
  assert.equal(b.saved.length, 1, '화면만 바뀌고 저장이 안 되면 새로고침에 되돌아갑니다');
  assert.equal(b.saved[0].read.fields.todos[0].done, true);
  assert.equal(b.saved[0].owner, 'owner-of-p1',
    '주인 자리가 아니면 남의 사진 표시가 엉뚱한 곳에 써집니다');
  assert.notEqual(b.it.meta, before, 'meta 를 제자리에서 고치면 찾기 캐시가 옛것을 봅니다');
  /* 되돌리기도 된다 */
  b.ctx.toggleChatTodo(0);
  assert.equal(b.saved[1].read.fields.todos[0].done, false, '잘못 눌렀으면 되돌릴 수 있어야 합니다');
});

test('★ 남의 사진에는 표시를 못 한다', () => {
  const b = bootToggle(true);
  b.ctx.toggleChatTodo(0);
  assert.equal(b.saved.length, 0, '남의 사진은 보기만 — 지우기·고치기와 같은 원칙입니다');
  assert.equal(b.it.meta.read.fields.todos[0].done, false);
});

test('★ 할 일 내용도 찾기에 걸린다', () => {
  const hay = fnOf(app, 'hayOf');
  assert.match(hay, /Array\.isArray\(f\.todos\)/,
    '할 일은 배열이라 문자열 훑기에 안 걸립니다 — 「휴직 신고」로 못 찾게 됩니다');
});

test('★ 패널이 대화 상자를 실제로 끼워 넣는다', () => {
  const p = fnOf(app, 'renderReadPanel');
  assert.match(p, /chatTodoBox\(it\)/, '함수만 있고 안 부르면 화면에 아무것도 없습니다');
});
