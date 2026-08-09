/* 자료함 — 갈래·검색·순서·묶음·메일틀·보낸기록의 순수 로직.
   조용히 어긋나기 쉬운 곳만 못 박는다.
     · 갈래를 지웠는데 그 안의 자료가 어느 탭에도 안 보이는 것
     · 메일 본문에 {담당자} 같은 글자가 그대로 고객에게 나가는 것
     · 묶음에 지워진 자료가 남아 조용히 빠지는 것 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'pu-cards.html'), 'utf8');

function load(){
  const a = '/* ══════ 자료함 — 순수 로직 (테스트 대상) ══════';
  const b = '/* ══════ 자료함 — 화면 ══════ */';
  const i = src.indexOf(a), j = src.indexOf(b);
  assert.ok(i >= 0, '시작 표식 못찾음');
  assert.ok(j > i, '끝 표식 못찾음');
  const ctx = { console, Object, Array, String, Number, JSON, Date, Math, RegExp, Set };
  vm.createContext(ctx);
  vm.runInContext(src.slice(i, j), ctx);
  ctx.read = e => vm.runInContext(e, ctx);
  return ctx;
}

/* ⚠ vm 안에서 만든 객체·배열은 바깥과 **다른 Object.prototype** 을 쓴다.
   deepStrictEqual 은 그것까지 견주므로 값이 같아도 틀렸다고 한다.
   여기서 보려는 것은 모양뿐이라 JSON 을 한 번 거쳐 바깥 값으로 맞춘다. */
const same = (a, b, msg) => assert.deepEqual(JSON.parse(JSON.stringify(a)), b, msg);

/* ── 갈래 ── */

test('저장값이 없으면 처음 세 갈래 + 기타', () => {
  const c = load();
  same(c.matCatsOf(null), ['제안서','계약서','법인홍보물','기타']);
  same(c.matCatsOf([]),   ['제안서','계약서','법인홍보물','기타']);
});

test('「기타」는 늘 있고 맨 끝에 하나뿐이다 — 지운 갈래의 자료가 갈 곳이다', () => {
  const c = load();
  const out = JSON.parse(JSON.stringify(c.matCatsOf(['기타','산재서식','기타'])));
  assert.deepEqual(out, ['산재서식','기타']);
  assert.equal(out.filter(x=>x==='기타').length, 1);
  assert.equal(out[out.length-1], '기타');
});

test('빈 값·중복·앞뒤 공백을 걸러낸다', () => {
  const c = load();
  same(c.matCatsOf(['제안서','','  ','제안서',' 산재서식 ']),
    ['제안서','산재서식','기타']);
});

test('없는 갈래를 가리키는 자료는 「기타」로 본다 — 갈래를 지워도 사라지지 않는다', () => {
  const c = load();
  const cats = ['제안서','기타'];
  assert.equal(c.matCatOf({cat:'제안서'}, cats), '제안서');
  assert.equal(c.matCatOf({cat:'산재서식'}, cats), '기타', '지워진 갈래를 가리킨다');
  assert.equal(c.matCatOf({}, cats), '기타');
  assert.equal(c.matCatOf(null, cats), '기타');
});

test('갈래 이름을 바꾸면 그 갈래를 쓰던 자료도 따라간다', () => {
  const c = load();
  const mats = { a:{id:'a',cat:'제안서'}, b:{id:'b',cat:'계약서'}, d:{id:'d',cat:'제안서'} };
  same(c.matCatRenamePatch(mats, '제안서', '자문제안서'), { a:'자문제안서', d:'자문제안서' });
});

test('갈래를 지우면 그 자료는 「기타」로 — 자료를 지우지 않는다', () => {
  const c = load();
  const mats = { a:{id:'a',cat:'산재서식'}, b:{id:'b',cat:'계약서'} };
  const patch = JSON.parse(JSON.stringify(c.matCatDeletePatch(mats, '산재서식')));
  assert.deepEqual(patch, { a:'기타' });
  assert.ok(!('b' in patch), '다른 갈래는 건드리지 않는다');
});

/* ── 순서 ── */

test('손으로 매긴 순서가 먼저, 없으면 올린 때', () => {
  const c = load();
  const out = c.matSortList([
    {id:'x', uploadedAt:100},
    {id:'y', uploadedAt:200, order:1},
    {id:'z', uploadedAt:50}
  ]).map(m=>m.id);
  assert.deepEqual(out, ['y','z','x'], 'order 있는 것이 먼저, 나머지는 올린 순');
});

test('자리를 바꾸면 모든 줄에 번호를 다시 매긴다 — 둘만 고치면 옛 자료와 섞인다', () => {
  const c = load();
  const full = [{id:'a'},{id:'b'},{id:'c'}];
  const order = c.matSwapOrder(full, 'c', 'b');
  same(order, { a:10, c:20, b:30 });
  assert.equal(Object.keys(order).length, 3, '움직이지 않은 줄도 번호를 받아야 한다');
});

test('맨 위에서 더 올리거나 맨 아래에서 더 내리면 바꿀 상대가 없다', () => {
  const c = load();
  const shown = [{id:'a'},{id:'b'}];
  assert.equal(c.matNeighborId(shown, 'a', -1), null);
  assert.equal(c.matNeighborId(shown, 'b', 1), null);
  assert.equal(c.matNeighborId(shown, '없는번호', 1), null);
  assert.equal(c.matNeighborId(shown, 'a', 1), 'b');
});

/* 이 두 줄이 이 층의 핵심이다 — 걸러 놓고 옮겼을 때 전체 순서가 뒤섞이던 결함. */
test('갈래 탭에서 옮기면 화면에서 이웃한 줄과 바뀐다 — 사이에 낀 다른 갈래는 건드리지 않는다', () => {
  const c = load();
  /* 전체 차례: 제안A · 계약X · 제안B  — 「제안서」 탭에는 제안A · 제안B 만 보인다 */
  const full  = [{id:'제안A'},{id:'계약X'},{id:'제안B'}];
  const shown = [{id:'제안A'},{id:'제안B'}];
  const other = c.matNeighborId(shown, '제안B', -1);
  assert.equal(other, '제안A', '화면에서 바로 위는 제안A 다');
  const order = c.matSwapOrder(full, '제안B', other);
  const sorted = Object.keys(order).sort((x,y)=>order[x]-order[y]);
  assert.deepEqual(sorted, ['제안B','계약X','제안A'], '둘만 자리를 맞바꾸고 계약X 는 제자리');
});

test('전체 목록에 없는 번호로는 순서를 매기지 않는다', () => {
  const c = load();
  assert.equal(c.matSwapOrder([{id:'a'}], 'a', '없음'), null);
  assert.equal(c.matSwapOrder([{id:'a'}], 'a', 'a'), null);
});

/* ── 검색 ── */

test('이름·설명·파일이름에서 찾고, 띄어쓰기는 무시한다', () => {
  const c = load();
  const list = [
    {id:'a', name:'2026 인사노무자문 제안서'},
    {id:'b', desc:'도장 찍기 전 검토용'},
    {id:'c', fileName:'회사소개서.pdf'}
  ];
  assert.deepEqual(c.matSearchList(list,'자문제안서').map(m=>m.id), ['a'], '띄어쓰기를 무시해야 한다');
  assert.deepEqual(c.matSearchList(list,'도장').map(m=>m.id), ['b'], '설명에서도 찾는다');
  assert.deepEqual(c.matSearchList(list,'소개서').map(m=>m.id), ['c'], '파일이름에서도 찾는다');
  assert.equal(c.matSearchList(list,'').length, 3, '빈 말이면 전부');
});

/* ── 메일 틀 ── */

test('채울 칸을 채운다', () => {
  const c = load();
  assert.equal(
    c.mailFill('{받는분} 님, {회사명} 귀중', {받는분:'홍길동', 회사명:'가나상사'}),
    '홍길동 님, 가나상사 귀중');
});

test('모르는 칸은 **빈 값으로 지운다** — 고객 메일에 {담당자} 가 그대로 나가면 안 된다', () => {
  const c = load();
  const out = c.mailFill('안녕하세요 {담당자} 님', {});
  assert.equal(out, '안녕하세요  님');
  assert.ok(!out.includes('{'), '중괄호가 남으면 안 된다');
});

test('고른 자료가 한 갈래뿐일 때만 그 갈래 글을 쓴다', () => {
  const c = load();
  const cfg = { subject:'기본제목', body:'기본본문',
                byCat:{ 계약서:{subject:'계약제목', body:'계약본문'} } };
  same(c.pickMailTpl(cfg, ['계약서','계약서']), {subject:'계약제목', body:'계약본문'});
  same(c.pickMailTpl(cfg, ['계약서','제안서']), {subject:'기본제목', body:'기본본문'},
    '갈래를 섞어 보내면 기본 글');
  same(c.pickMailTpl(cfg, ['제안서']), {subject:'기본제목', body:'기본본문'},
    '전용 글이 없는 갈래면 기본 글');
  same(c.pickMailTpl(cfg, []), {subject:'기본제목', body:'기본본문'});
});

test('갈래 글에 제목만 있으면 본문은 기본 것을 쓴다', () => {
  const c = load();
  const cfg = { subject:'기본제목', body:'기본본문', byCat:{ 계약서:{subject:'계약제목'} } };
  same(c.pickMailTpl(cfg, ['계약서']), {subject:'계약제목', body:'기본본문'});
});

test('처음 글에 채울 칸이 실제로 들어 있다', () => {
  const c = load();
  const d = c.read('MAIL_TPL_DEFAULT');
  assert.match(d.body, /\{받는분\}/);
  assert.match(d.body, /\{자료목록\}/);
});

/* ── 묶음 ── */

test('묶음에 든 자료가 지워졌으면 빼고 돌려준다 — 조용히 빠지면 다 보낸 줄 안다', () => {
  const c = load();
  const set = { id:'s1', ids:['a','없어진것','b'] };
  same(c.setLiveIds(set, { a:{id:'a'}, b:{id:'b'} }), ['a','b']);
  same(c.setLiveIds({ids:[]}, {}), []);
  same(c.setLiveIds(null, {}), []);
});

test('묶음은 만든 차례대로', () => {
  const c = load();
  const out = c.setList({ b:{id:'b',order:2}, a:{id:'a',order:1}, x:{noid:1} }).map(s=>s.id);
  assert.deepEqual(out, ['a','b']);
});

/* ── 보낸 기록 ── */

test('자료 이름을 그대로 적어 둔다 — 번호만 적으면 자료를 지운 뒤 알 수 없다', () => {
  const c = load();
  const r = c.sendLogRec({ at:1000, by:'a@b.com', to:'c@d.com', names:['제안서','계약서'], set:'신규 3종' });
  same(r.names, ['제안서','계약서']);
  assert.equal(r.set, '신규 3종');
  assert.equal(r.at, 1000);
});

test('빈 이름은 걸러내고, 없는 값은 빈 값으로 채운다', () => {
  const c = load();
  const r = c.sendLogRec({ at:1, names:['제안서','',null] });
  same(r.names, ['제안서']);
  assert.equal(r.by, '');
  assert.equal(r.set, '');
});

test('최근 것이 위로 오고, 몇 줄만 자른다', () => {
  const c = load();
  const logs = { a:{at:100}, b:{at:300}, c:{at:200}, d:{언제인지없음:1} };
  assert.deepEqual(c.sendLogList(logs).map(r=>r.at), [300,200,100], '때가 없는 줄은 뺀다');
  assert.equal(c.sendLogList(logs, 2).length, 2);
  assert.deepEqual(c.sendLogList(null), []);
});
