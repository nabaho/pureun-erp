'use strict';
/* 거래처 담당자가 «퇴사»했다 — 한 곳에 적고 모두가 읽는다 (대표 지시 2026-08-29)
   ═══════════════════════════════════════════════════════════════════════════
   대표 지시: 「거래처에 퇴사자가 발생할경우 어떻게 한번에 퇴사처리해서 정리할 수
   있을까 … 퇴사자 처리하면 푸른통합전체에 퇴사자로 분류하고 싶은데」
   → 「가+나 하고 둘 중 하나 체크하면 나머지 모두 연결되게 할 수 있나?」

   ■ 조사해서 안 것 — 「퇴사」가 셋으로 섞여 있었다
     ① 우리 직원 퇴사      : 푸른이알피에 완비(상태·퇴직정산·접속차단)
     ② 거래처 «회사» 종료  : 자동(ERP status → 🚪 종료 + 업체퇴사 폴더)
     ③ 거래처 «담당자» 퇴사: «아무 장치가 없었다» ← 이번에 만드는 것
     명함에도, ERP 담당자 줄에도 「떠났다」를 적을 칸이 없었다. 그래서 떠난 사람에게
     메일이 계속 나갔다.

   ■ 적는 곳은 «하나»여야 한다 — 어디로 정했나
     ERP 는 기업정보함을 «읽기만» 한다(pucards/idx 30곳 전부 읽기). 반대로 기업정보함은
     ERP 에 쓰는 길이 이미 있다(sendToCompany → data/companies).
     그러므로 적는 자리는 ERP 담당자 줄(contacts[].left) 하나다.
     회사 종료가 이미 그 방식이라 규칙이 하나로 유지된다 — ERP 가 진짜, 나머지는 읽기.

   ■ 사람을 어떻게 가리나 — «이름으로 맞추지 않는다»
     이름만으로 맞추면 동명이인이 서로를 덮는다. 2026-08-28 에 회사 이름으로 맞추다
     「주식회사 행복한단홍갈비」와 「행복한 단홍갈비」가 섞인 사고를 겪었다.
     이메일(다듬은 것) 또는 휴대폰 숫자 — 둘 다 사람마다 하나뿐인 값이다.

   ★ 여기서 못 박는 것
     ① ERP 담당자의 퇴사 표시를 기업정보함이 읽어 온다
     ② 사람은 이메일·전화 «숫자»로만 가린다 (이름으로는 안 가린다)
     ③ 그 회사 담당자 안에서만 찾는다 — 남의 회사 동명이인에 안 걸린다
     ④ 표시가 없으면 «재직»으로 본다 (모르면 빼지 않는다)
     ⑤ 새 서버 읽기가 없다 — 이미 받아 둔 것을 읽는다
   실행: node --test tests/erp-contact-left.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'pu-cards.html'), 'utf8').replace(/\r\n/g, '\n');

/* 함수를 «끝까지» 떼어 온다 — 괄호를 세어 닫는 자리를 찾는다 */
function fnBody(name){
  let i = src.indexOf('\nfunction ' + name + '(');
  assert.ok(i >= 0, name + ' 를 찾을 수 없습니다');
  const open = src.indexOf('{', i);
  let d = 0;
  for (let k = open; k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (!d) return src.slice(i, k + 1); }
  }
  assert.fail(name + ' 의 끝을 찾을 수 없습니다');
}

function loadErp(byBiz, byName){
  const i = src.indexOf('const ErpMatch = {');
  const open = src.indexOf('{', i);
  let d = 0, end = -1;
  for (let k = open; k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (!d) { end = k + 1; break; } }
  }
  assert.ok(end > 0, 'ErpMatch 의 끝을 찾지 못했습니다');
  const ctx = { console, Object, Array, String, Number, Math, JSON, Set,
    Promise, Date, setTimeout: () => {}, render: () => {}, coListBust: () => {} };
  vm.createContext(ctx);
  vm.runInContext(src.slice(i, end).replace(/^const /, 'var ') + ';', ctx);
  ctx.ErpMatch.ready = true;
  ctx.ErpMatch.byBiz = byBiz || {};
  ctx.ErpMatch.byName = byName || {};
  return ctx.ErpMatch;
}
/* 업체 기록 — people 은 담당자 줄을 사람 가리기에 쓸 만큼만 담은 것 */
const rec = (people) => ({ company:'가나테크', bizNo:'134-86-05772', main:'박성수',
  type:'자문', status:'active', left:false, people: people || [] });
const card = (o) => Object.assign({ name:'박대리', company:'가나테크',
  bizno:'134-86-05772', mobile:'', email:'' }, o || {});

/* ══════ ① 퇴사 표시를 읽어 온다 ══════ */

test('★ 담당자가 퇴사로 표시돼 있으면 그렇다고 답한다', () => {
  const E = loadErp({ '1348605772': rec([
    { name:'박대리', email:'park@gana.co.kr', phone:'010-1111-2222', left:true } ]) }, {});
  assert.equal(E.leftOfCard(card({ email:'park@gana.co.kr' })), true);
});

test('★ 표시가 없으면 «재직»으로 본다 — 모르면 빼지 않는다', () => {
  const E = loadErp({ '1348605772': rec([
    { name:'박대리', email:'park@gana.co.kr', phone:'010-1111-2222' } ]) }, {});
  assert.equal(E.leftOfCard(card({ email:'park@gana.co.kr' })), false,
    '★ 모른다고 빼 버리면 멀쩡한 담당자에게 메일이 안 간다');
});

test('그 회사에 담당자 줄이 아예 없으면 재직으로 본다', () => {
  const E = loadErp({ '1348605772': rec([]) }, {});
  assert.equal(E.leftOfCard(card({ email:'park@gana.co.kr' })), false);
});

test('푸른이알피에 없는 회사면 재직으로 본다', () => {
  const E = loadErp({}, {});
  assert.equal(E.leftOfCard(card({ email:'park@gana.co.kr' })), false);
});

/* ══════ ② 이메일·전화 숫자로만 가린다 ══════ */

test('★ 휴대폰 숫자로도 가린다 — 적는 꼴이 달라도 같은 사람이다', () => {
  const E = loadErp({ '1348605772': rec([
    { name:'박대리', phone:'01011112222', left:true } ]) }, {});
  assert.equal(E.leftOfCard(card({ mobile:'010-1111-2222' })), true,
    '★ 「-」 유무로 다른 사람이 되면 안 된다');
});

test('★ «이름만» 같은 사람은 안 가린다 — 동명이인이 서로를 덮는다', () => {
  /* 2026-08-28 에 회사 이름으로 맞추다 겪은 사고와 같은 결이다.
     이름은 사람이 적는 글자고, 이메일·휴대폰은 사람마다 하나뿐인 값이다. */
  const E = loadErp({ '1348605772': rec([
    { name:'박대리', email:'park@gana.co.kr', left:true } ]) }, {});
  assert.equal(E.leftOfCard(card({ name:'박대리', email:'other@gana.co.kr' })), false,
    '★ 이름이 같다고 남의 퇴사를 물려받으면 멀쩡한 사람이 메일에서 빠진다');
  assert.equal(E.leftOfCard(card({ name:'박대리' })), false,
    '★ 가릴 값이 없으면 «모른다»로 둔다');
});

test('이메일은 대소문자·앞뒤 빈칸을 무시하고 견준다', () => {
  const E = loadErp({ '1348605772': rec([
    { name:'박대리', email:'Park@Gana.co.kr', left:true } ]) }, {});
  assert.equal(E.leftOfCard(card({ email:'  park@gana.co.kr ' })), true);
});

test('회사 전화(bizPhone)로도 가린다 — 담당자 줄에 그쪽만 적힌 곳이 있다', () => {
  const E = loadErp({ '1348605772': rec([
    { name:'박대리', bizPhone:'041-556-0035', left:true } ]) }, {});
  assert.equal(E.leftOfCard(card({ tel:'041-556-0035' })), true);
});

/* ══════ ③ 그 회사 안에서만 찾는다 ══════ */

test('★ «그 회사» 담당자 안에서만 찾는다 — 남의 회사 동명이인에 안 걸린다', () => {
  const 가나 = rec([{ name:'박대리', email:'park@gana.co.kr' }]);
  const 다라 = { company:'다라산업', bizNo:'505-86-00987', main:'김보람', left:false,
    people:[{ name:'박대리', email:'park@gana.co.kr', left:true }] };
  const E = loadErp({ '1348605772': 가나, '5058600987': 다라 }, {});
  assert.equal(E.leftOfCard(card({ email:'park@gana.co.kr' })), false,
    '★ 다른 회사 사람의 퇴사가 넘어오면 안 된다');
  assert.equal(E.leftOfCard(card({ bizno:'505-86-00987', company:'다라산업',
    email:'park@gana.co.kr' })), true);
});

/* ══════ ④ 안전장치 ══════ */

test('푸른이알피가 아직 안 실렸으면 재직으로 본다', () => {
  const E = loadErp({ '1348605772': rec([{ email:'park@gana.co.kr', left:true }]) }, {});
  E.ready = false;
  assert.equal(E.leftOfCard(card({ email:'park@gana.co.kr' })), false);
});

test('빈 값을 줘도 터지지 않는다', () => {
  const E = loadErp({}, {});
  assert.equal(E.leftOfCard(null), false);
  assert.equal(E.leftOfCard({}), false);
});

/* ══════ ⑤ 담당자 줄을 실어 둔다 ══════ */

test('★ 업체를 훑을 때 담당자 줄을 실어 둔다 — 서버를 더 읽지 않는다', () => {
  const a = src.indexOf('      const byBiz={}, byName={};');
  const b = src.indexOf('      ErpMatch.byBiz=byBiz;');
  assert.ok(a > 0 && b > a, '업체 훑는 자리를 찾지 못했습니다');
  const ctx = { console, Object, String, Number, Array,
    cos: [{ name:'가나테크', bizNo:'134-86-05772', ceo:'조성환', typeCode:'자문',
            status:'active', managerMain:'s1',
            contacts:[{ name:'박대리', email:'park@gana.co.kr', phone:'010-1111-2222',
                        bizPhone:'041-556-0035', left:true }] }],
    nameBySid: { s1:'권형하' },
    ErpMatch: { _norm: v => String(v||'').replace(/\s+/g,''),
                _digits: v => String(v||'').replace(/\D/g,'') } };
  vm.createContext(ctx);
  vm.runInContext(src.slice(a, b) + '\nvar OUT = byBiz;', ctx);
  const r = ctx.OUT['1348605772'];
  assert.ok(r && r.people && r.people.length === 1, '★ 담당자 줄을 안 실으면 가릴 길이 없다');
  assert.equal(r.people[0].left, true);
  assert.equal(r.people[0].email, 'park@gana.co.kr');
});

test('담당자에 퇴사 표시가 없는 곳도 터지지 않는다', () => {
  const a = src.indexOf('      const byBiz={}, byName={};');
  const b = src.indexOf('      ErpMatch.byBiz=byBiz;');
  const ctx = { console, Object, String, Number, Array,
    cos: [{ name:'다라산업', bizNo:'505-86-00987', typeCode:'급여', status:'active' }],
    nameBySid: {},
    ErpMatch: { _norm: v => String(v||'').replace(/\s+/g,''),
                _digits: v => String(v||'').replace(/\D/g,'') } };
  vm.createContext(ctx);
  vm.runInContext(src.slice(a, b) + '\nvar OUT = byBiz;', ctx);
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.OUT['5058600987'].people)), []);
});

/* ══════ ⑥ 메일이 퇴사자를 뺀다 ══════ */

function loadMail(){
  let i = src.indexOf('\nfunction mailTargets(');
  const open = src.indexOf('{', i);
  let d = 0, end = -1;
  for (let k = open; k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (!d) { end = k + 1; break; } }
  }
  const ctx = { console, Object, Array, String,
    inLockedGroup: () => false,
    normEmail: e => String(e||'').trim().toLowerCase(),
    emailKey: e => String(e||'').trim().toLowerCase(),
    ErpMatch: { leftOfCard: it => !!(it && it.__left) } };
  vm.createContext(ctx);
  vm.runInContext(src.slice(i, end), ctx);
  return ctx;
}

test('★ 퇴사한 담당자는 단체 메일에서 빠진다', () => {
  const C = loadMail();
  const r = C.mailTargets([
    { name:'박대리', email:'park@gana.co.kr', __left:true },
    { name:'김과장', email:'kim@gana.co.kr' }
  ]);
  assert.equal(r.ok.length, 1);
  assert.equal(r.ok[0].email, 'kim@gana.co.kr');
});

test('★ 몇 명이 퇴사로 빠졌는지 «말해 준다» — 조용히 빼면 왜 안 갔는지 모른다', () => {
  const C = loadMail();
  const r = C.mailTargets([
    { name:'박대리', email:'park@gana.co.kr', __left:true },
    { name:'김과장', email:'kim@gana.co.kr' }
  ]);
  assert.equal(r.stat.left, 1, '★ 「수신거부 N」처럼 「퇴사 N」도 보여야 한다');
});

/* ══════ ⑦ 명함 목록의 「🚪 퇴사자」 거르개 ══════ */

test('★ 목록에서 «퇴사자만» 골라 볼 수 있다 — 「어떻게 확인하나」의 답이다', () => {
  /* ⚠ 소스에 글자가 있는지만 보면 모자란다 — 지워도 아무 일 없이 통과한다
     (2026-08-29 고장넣기에서 실제로 샜다). 그래서 «걸러 보고» 확인한다. */
  /* ⚠ 인자가 아니라 «그 함수»를 찾는다. 2026-08-29 에 listItems 가 갈래를 받게 되자
     'function listItems()' 로 찾던 검사 셋이 한꺼번에 못 찾았다 — 기능은 멀쩡했다
     (CLAUDE.md 「지금 값이 아니라 규칙」). */
  const at = src.indexOf('function listItems(');
  assert.ok(at > 0, 'listItems 를 찾지 못했습니다');
  const open = src.indexOf('{', at);
  let d = 0, end = -1;
  for (let k = open; k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (!d) { end = k + 1; break; } }
  }
  /* 거르는 대목만 떼어 «그 조건들»을 그대로 돌린다 */
  const body = src.slice(open + 1, end - 1);
  const a = body.indexOf('if (state.onlyPhone');
  const b = body.indexOf('if (state.onlyPrivate');
  assert.ok(a > 0 && b > a, '조건 거르개 대목을 찾지 못했습니다');
  const ctx = { console, Object, Array, String,
    ErpMatch: { leftOfCard: it => !!(it && it.__left) } };
  vm.createContext(ctx);
  vm.runInContext('var state = {}; var keep = function(it){ ' + body.slice(a, b)
    + ' return true; };', ctx);

  const 사람 = [{ id:'a', __left:true }, { id:'b' }];
  ctx.state.onlyLeft = true;
  assert.deepEqual(사람.filter(ctx.keep).map(x => x.id), ['a'],
    '★ 「🚪 퇴사자」를 켜도 그대로면, 만들어 놓고 아무 데서도 안 쓰는 단추가 된다');
  ctx.state.onlyLeft = false;
  assert.equal(사람.filter(ctx.keep).length, 2, '꺼져 있으면 전부 보여야 한다');
});

test('★ 목록과 메일이 «같은 판단»을 쓴다 — 두 벌이면 결과가 어긋난다', () => {
  /* ⚠ 고정 폭으로 자르지 «않는다» — 함수가 길어지면 끝에 못 닿아 검사가 조용히
     헛돈다(저장소에 그것을 막는 검사가 따로 있고, 실제로 여기서 걸렸다). */
  assert.match(fnBody('listItems'), /state\.onlyLeft && !ErpMatch\.leftOfCard\(it\)/,
    '★ 목록이 제 나름으로 퇴사를 가리면 메일과 다른 사람을 뺀다');
});

test('하던 거르기(수신거부·이메일 없음·중복)는 그대로다', () => {
  const C = loadMail();
  const r = C.mailTargets([
    { name:'가', email:'a@x.kr' },
    { name:'나', email:'' },
    { name:'다', email:'a@x.kr' },
    { name:'라', email:'d@x.kr', noMail:true }
  ]);
  assert.equal(r.stat.ready, 1);
  assert.equal(r.stat.noEmail, 1);
  assert.equal(r.stat.dup, 1);
  assert.equal(r.stat.blocked, 1);
});
