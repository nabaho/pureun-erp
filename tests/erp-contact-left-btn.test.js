'use strict';
/* 푸른이알피 담당자 줄에서 「🚪 퇴사」를 누른다 — (가) (대표 지시 2026-08-29)
   ═══════════════════════════════════════════════════════════════════════════
   앞선 두 묶음에서 만든 것:
     · 읽는 쪽 — 담당자 줄의 퇴사 표시를 기업정보함이 읽어 「🚪 퇴사자」로 거르고,
       단체 메일·주소록에서 뺀다.
     · (나) 명함에서 누르는 단추 — 푸른이알피 담당자 줄에 적는다.
   이번은 (가) — «적는 그 자리»에서 바로 누르는 단추다.

   ■ 적는 곳은 여전히 하나다
     여기가 «그 하나»다. 담당자 편집기가 이미 그 줄을 고치고 있으므로, 칸 하나
     (left·leftAt)를 더 켜고 끄기만 한다. 새 저장 길을 내지 않는다.

   ■ 왜 지우기와 다른가
     × 는 담당자 줄을 «없앤다». 그러면 그 사람이 있었다는 사실도 사라지고, 명함첩은
     「모르는 사람」으로 되돌아가 단체 메일이 다시 나간다.
     퇴사는 «남겨 두고 떠났다고 적는» 것이다. 그래서 단추를 따로 둔다.

   ★ 여기서 못 박는 것
     ① 담당자 줄마다 퇴사 단추가 있다
     ② 누르면 left 와 «언제인지»가 함께 적힌다
     ③ 다시 누르면 풀린다
     ④ 그 줄의 다른 칸·다른 사람은 안 건드린다
     ⑤ 퇴사한 줄이 눈에 보인다
     ⑥ 지우기(×)는 그대로 남는다 — 뜻이 다른 두 가지다
   실행: node --test tests/erp-contact-left-btn.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'pu-erp.html'), 'utf8').replace(/\r\n/g, '\n');

/* ContactsEditor 를 떼어 «돌린다» — 소스에 글자가 있나가 아니라 무엇이 나오는가를 본다 */
function render(contacts){
  const i = src.indexOf('function ContactsEditor(props){');
  assert.ok(i > 0, 'ContactsEditor 를 찾지 못했습니다');
  const open = src.indexOf('{', i);
  let d = 0, end = -1;
  for (let k = open; k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (!d) { end = k + 1; break; } }
  }
  assert.ok(end > 0, 'ContactsEditor 의 끝을 찾지 못했습니다');
  /* 아주 작은 h() — 만들어진 나무를 그대로 돌려준다 */
  const nodes = [];
  const ctx = { console, Object, Array, String, Number, Date, Math, JSON,
    h: function (tag, props) {
      const kids = Array.prototype.slice.call(arguments, 2);
      const n = { tag, props: props || {}, kids: kids };
      nodes.push(n); return n;
    },
    useState: v => [v, () => {}],
    fmtPhone: v => v,
    _normPersonKey: c => String((c && c.email) || '').toLowerCase() };
  vm.createContext(ctx);
  vm.runInContext(src.slice(i, end), ctx);
  let got = null;
  ctx.ContactsEditor({ contacts: contacts, scope: 'co',
    onChange: arr => { got = arr; } });
  return { nodes, changed: () => got };
}
/* 만들어진 나무에서 조건에 맞는 마디를 찾는다 */
function findAll(nodes, fn){ return nodes.filter(fn); }
const ct = (o) => Object.assign({ id:'p1', name:'박대리', phone:'010-1111-2222',
  email:'park@gana.co.kr', isPrimary:true }, o || {});

/* ══════ ① 줄마다 단추가 있다 ══════ */

test('★ 담당자 줄마다 「퇴사」 단추가 있다', () => {
  const r = render([ ct(), ct({ id:'p2', name:'김과장', email:'kim@gana.co.kr', isPrimary:false }) ]);
  const btns = findAll(r.nodes, n => n.tag === 'button'
    && String(n.props.title || '').indexOf('퇴사') >= 0);
  assert.equal(btns.length, 2, '★ 사람마다 있어야 한 사람만 골라 표시할 수 있다');
});

/* ══════ ② 누르면 언제인지까지 적힌다 ══════ */

test('★ 누르면 퇴사와 «언제인지»가 함께 적힌다', () => {
  const r = render([ ct() ]);
  const btn = findAll(r.nodes, n => n.tag === 'button'
    && String(n.props.title || '').indexOf('퇴사') >= 0)[0];
  btn.props.onClick({ stopPropagation: () => {} });
  const out = r.changed();
  assert.ok(out, '★ 눌러도 아무 일이 없다');
  assert.equal(out[0].left, true);
  assert.ok(out[0].leftAt, '★ 언제 떠났는지가 없으면 나중에 되짚을 수 없다');
});

/* ══════ ③ 다시 누르면 풀린다 ══════ */

test('★ 이미 퇴사면 다시 눌러 «푼다»', () => {
  const r = render([ ct({ left:true, leftAt: 123 }) ]);
  const btn = findAll(r.nodes, n => n.tag === 'button'
    && String(n.props.title || '').indexOf('퇴사') >= 0)[0];
  btn.props.onClick({ stopPropagation: () => {} });
  const out = r.changed();
  assert.equal(!!out[0].left, false, '★ 못 풀면 잘못 눌렀을 때 되돌릴 길이 없다');
});

/* ══════ ④ 남을 안 건드린다 ══════ */

test('★ 그 줄의 다른 칸을 안 건드린다', () => {
  const r = render([ ct({ position:'과장', fax:'041-000-0000' }) ]);
  const btn = findAll(r.nodes, n => n.tag === 'button'
    && String(n.props.title || '').indexOf('퇴사') >= 0)[0];
  btn.props.onClick({ stopPropagation: () => {} });
  const out = r.changed();
  assert.equal(out[0].name, '박대리');
  assert.equal(out[0].email, 'park@gana.co.kr');
  assert.equal(out[0].position, '과장');
  assert.equal(out[0].isPrimary, true, '★ 주담당 표시가 풀리면 안 된다');
});

test('★ 다른 사람은 안 건드린다', () => {
  const r = render([ ct(), ct({ id:'p2', name:'김과장', email:'kim@gana.co.kr', isPrimary:false }) ]);
  const btns = findAll(r.nodes, n => n.tag === 'button'
    && String(n.props.title || '').indexOf('퇴사') >= 0);
  btns[1].props.onClick({ stopPropagation: () => {} });
  const out = r.changed();
  assert.equal(!!out[0].left, false, '★ 엉뚱한 사람이 퇴사로 찍혔다');
  assert.equal(out[1].left, true);
});

/* ══════ ⑤ 눈에 보인다 ══════ */

const btnOf = r => findAll(r.nodes, n => n.tag === 'button'
  && String(n.props.title || '').indexOf('퇴사') >= 0)[0];

test('★ 퇴사한 줄이 «눈에» 보인다 — 안 보이면 누가 떠났는지 모른다', () => {
  /* ⚠ vm 안에서 만든 객체는 원형이 달라 notDeepEqual 이 «늘» 통과한다 — 단언이
     헛돌았다(2026-08-29 고장넣기에서 실제로 샜다). JSON 을 거쳐 견준다. */
  const j = v => JSON.stringify(v || {});
  const a = j(btnOf(render([ ct() ])).props.style);
  const b = j(btnOf(render([ ct({ left:true }) ])).props.style);
  assert.notEqual(a, b, '★ 퇴사한 줄과 아닌 줄이 똑같아 보이면 표시한 뜻이 없다');
  assert.ok(a.length > 2 && b.length > 2, '모양이 아예 없다');
});

test('★ 단추에 «글자»가 있다 — 빈 단추는 무엇인지 알 수 없다', () => {
  const on = btnOf(render([ ct({ left:true }) ]));
  const off = btnOf(render([ ct() ]));
  const txt = n => n.kids.filter(k => typeof k === 'string' && k.trim()).join('');
  assert.ok(txt(on).indexOf('퇴사') >= 0,
    '★ 퇴사한 줄에는 «퇴사»라고 적혀 있어야 목록에서 바로 읽힌다');
  assert.ok(txt(off).length > 0, '★ 글자가 없으면 누를 것이 있는지도 모른다');
});

/* ══════ ⑥ 지우기는 그대로 ══════ */

test('★ 지우기(×)는 그대로 남는다 — 뜻이 다른 두 가지다', () => {
  /* × 는 줄을 «없앤다». 그러면 그 사람이 있었다는 사실도 사라지고, 기업정보함은
     「모르는 사람」으로 되돌아가 단체 메일이 다시 나간다.
     퇴사는 «남겨 두고 떠났다고 적는» 것이다. */
  const r = render([ ct() ]);
  const del = findAll(r.nodes, n => n.tag === 'button' && n.props.title === '삭제');
  assert.equal(del.length, 1, '★ 지우기를 없애면 잘못 넣은 줄을 뺄 길이 사라진다');
});

test('빈 담당자 목록에서도 터지지 않는다', () => {
  const r = render([]);
  assert.equal(findAll(r.nodes, n => n.tag === 'button'
    && String(n.props.title || '').indexOf('퇴사') >= 0).length, 0);
});
