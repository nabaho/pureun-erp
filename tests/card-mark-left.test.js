'use strict';
/* 명함에서 「🚪 퇴사」를 누른다 — (나) (대표 지시 2026-08-29)
   ═══════════════════════════════════════════════════════════════════════════
   2026-08-29 앞선 묶음에서 «읽는 쪽»을 만들었다: 푸른이알피 담당자 줄의 퇴사 표시를
   명함첩이 읽어 「🚪 퇴사자」로 거르고, 단체 메일에서 뺀다.
   이번은 «누르는 쪽» 둘 중 (나) — 명함에서 누르는 단추다.

   ■ 적는 곳은 여전히 «하나»다
     푸른이알피 담당자 줄(data/companies … contacts[].left)에 쓴다.
     명함에는 아무것도 안 적는다 — 두 곳에 적으면 어느 쪽이 참인지 알 수 없게 된다.
     ⚠ 명함첩은 이미 그 자리에 쓴다(세금계산서 담당자 저장 등). 새 길을 내지 않는다.

   ■ 왜 판단도 여기서 하나
     사람을 가리는 규칙(이메일·전화 숫자로만)이 «읽을 때»와 «쓸 때» 달라지면,
     눌러서 표시해 놓고 목록에는 안 뜨는 일이 난다. 그래서 ErpMatch 안에 함께 둔다 —
     한 파일 한 규칙이다.

   ★ 여기서 못 박는 것
     ① 그 사람 담당자 줄에 퇴사 표시를 쓴다 (명함에는 안 쓴다)
     ② 담당자 줄에 «없는» 사람이면 한 줄을 «퇴사 상태로» 더한다
     ③ 사람은 이메일·전화 숫자로만 가린다 — 읽을 때와 같은 규칙
     ④ 다시 누르면 «푼다»
     ⑤ 업체관리에 없는 회사면 아무것도 안 쓰고 그렇게 말한다
     ⑥ 갱신시각을 남긴다 — 안 쓰면 푸른이알피 화면이 안 바뀐다
     ⑦ 다른 칸을 안 건드린다
   실행: node --test tests/card-mark-left.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'pu-cards.html'), 'utf8').replace(/\r\n/g, '\n');

function fnBody(name){
  let i = src.indexOf('\nasync function ' + name + '(');
  if (i < 0) i = src.indexOf('\nfunction ' + name + '(');
  assert.ok(i >= 0, name + ' 를 찾을 수 없습니다');
  const open = src.indexOf('{', i);
  let d = 0;
  for (let k = open; k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (!d) return src.slice(i, k + 1); }
  }
  assert.fail(name + ' 의 끝을 찾을 수 없습니다');
}
const plain = v => JSON.parse(JSON.stringify(v));

const asObj = list => { const o = {}; (list||[]).forEach(c => { o[c.id] = c; }); return o; };

/* 색인을 진짜 load() 가 만드는 것과 «같은 꼴»로 채운다.
   ⚠ 2026-08-29: cardMarkLeft 가 어느 업체인지 가릴 때 ErpMatch.match 를 쓰도록
     고쳤다 — 그전에는 it.bizno 를 곧장 봤는데, 사업자번호는 사업자등록증 칸이라
     «명함에는 없다». 읽는 쪽은 이름으로도 찾으므로 딱지는 보이는데 눌러도 거절당했다.
     이제 읽기와 쓰기가 같은 함수를 쓰니, 검사도 색인을 실어야 진짜와 같아진다. */
function indexInto(M, companies){
  M.ready = true; M.byBiz = {}; M.byName = {};
  (companies||[]).forEach(c => {
    const rec = { id:c.id, coName:c.name, bizNo:c.bizNo,
      people: (c.contacts||[]).map(p => ({ name:p.name||'', email:p.email||'',
        phone:p.phone||'', bizPhone:p.bizPhone||'', left:!!p.left, leftAt:p.leftAt||0 })) };
    const b = M._digits(c.bizNo); if (b.length >= 10 && !M.byBiz[b]) M.byBiz[b] = rec;
    const n = M._norm(c.name);    if (n && !M.byName[n]) M.byName[n] = rec;
  });
}

/* data/companies 를 흉내 내고, 무엇을 썼는지 받아 둔다.
   ⚠ ErpMatch 는 «진짜»를 싣는다 — 사람 가리는 규칙(keyOfCard·samePerson)이 읽을 때와
     같은지가 이 검사의 핵심이라, 대역을 쓰면 아무것도 안 보게 된다. */
function load(companies){
  const writes = [];
  const i = src.indexOf('const ErpMatch = {');
  const open = src.indexOf('{', i);
  let d = 0, end = -1;
  for (let k = open; k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (!d) { end = k + 1; break; } }
  }
  assert.ok(end > 0, 'ErpMatch 의 끝을 찾지 못했습니다');
  const ctx = { console, Object, Array, String, Number, Math, JSON, Promise, Date, Set,
    setTimeout: () => {}, render: () => {}, coListBust: () => {},
    toast: m => { ctx._toast = m; },
    firebase: { database: () => ({
      ref: p => ({
        /* 업체관리는 «객체꼴»(id 로 매긴 것)이 지금 쓰는 꼴이다. 배열꼴은 아래에서
           따로 본다 — 두 꼴이 다 실제로 있어 한쪽만 맞으면 반은 안 된다. */
        once: () => Promise.resolve({ val: () => ({ v: asObj(companies) }) }),
        update: u => { writes.push(u); return Promise.resolve(); }
      })
    }) },
    _writes: writes };
  vm.createContext(ctx);
  vm.runInContext(src.slice(i, end).replace(/^const /, 'var ') + ';', ctx);
  ctx.ErpMatch.load = () => { ctx._reloaded = true; };
  indexInto(ctx.ErpMatch, companies);
  vm.runInContext(fnBody('cardMarkLeft'), ctx);
  return ctx;
}
const co = (contacts) => ({ id:'c1', name:'가나테크', bizNo:'134-86-05772',
  status:'active', typeCode:'자문', contacts: contacts || [] });
const card = (o) => Object.assign({ name:'박대리', company:'가나테크',
  bizno:'134-86-05772', mobile:'', email:'' }, o || {});

/* ══════ ① 담당자 줄에 쓴다 ══════ */

test('★ 그 사람 담당자 줄에 퇴사 표시를 쓴다', () => {
  const C = load([ co([{ id:'p1', name:'박대리', email:'park@gana.co.kr' }]) ]);
  return C.cardMarkLeft(card({ email:'park@gana.co.kr' }), true, '권형하').then(r => {
    assert.equal(r.ok, true);
    const u = C._writes[0];
    assert.equal(u['data/companies/v/c1'].contacts[0].left, true);
    assert.ok(u['data/companies/v/c1'].contacts[0].leftAt, '언제인지가 없다');
  });
});

test('★ 명함에는 아무것도 안 쓴다 — 두 곳에 적으면 어느 쪽이 참인지 모른다', () => {
  const C = load([ co([{ id:'p1', email:'park@gana.co.kr' }]) ]);
  return C.cardMarkLeft(card({ email:'park@gana.co.kr' }), true).then(() => {
    Object.keys(C._writes[0]).forEach(function (k) {
      assert.equal(k.indexOf('pucards'), -1, '★ 명함첩에 적으면 적는 곳이 둘이 된다');
    });
  });
});

/* ══════ ② 없는 사람이면 한 줄 더한다 ══════ */

test('★ 담당자 줄에 «없는» 사람이면 퇴사 상태로 한 줄 더한다', () => {
  /* 안 그러면 명함첩에서 표시할 방법이 아예 없다 — 담당자로 등록 안 된 사람이 많다 */
  const C = load([ co([{ id:'p1', email:'kim@gana.co.kr' }]) ]);
  return C.cardMarkLeft(card({ name:'박대리', email:'park@gana.co.kr',
    mobile:'010-1111-2222' }), true).then(r => {
    assert.equal(r.ok, true);
    const cs = C._writes[0]['data/companies/v/c1'].contacts;
    assert.equal(cs.length, 2, '★ 없는 사람이면 더해야 표시할 수 있다');
    const add = cs[1];
    assert.equal(add.left, true);
    assert.equal(add.email, 'park@gana.co.kr');
    assert.equal(add.name, '박대리', '누구인지 알아볼 이름은 담는다');
    assert.ok(add.id, '열쇠가 없으면 나중에 못 가린다');
  });
});

test('없는 사람을 «푸는» 것은 할 일이 없다 — 줄을 더하지 않는다', () => {
  const C = load([ co([{ id:'p1', email:'kim@gana.co.kr' }]) ]);
  return C.cardMarkLeft(card({ email:'park@gana.co.kr' }), false).then(r => {
    assert.equal(r.ok, false);
    assert.equal(C._writes.length, 0, '★ 풀 것이 없는데 줄을 만들면 유령이 쌓인다');
  });
});

/* ══════ ③ 이메일·전화 숫자로만 가린다 ══════ */

test('★ 휴대폰 숫자로도 그 사람을 찾는다', () => {
  const C = load([ co([{ id:'p1', name:'박대리', phone:'01011112222' }]) ]);
  return C.cardMarkLeft(card({ mobile:'010-1111-2222' }), true).then(() => {
    const cs = C._writes[0]['data/companies/v/c1'].contacts;
    assert.equal(cs.length, 1, '★ 이미 있는 사람인데 또 더하면 두 줄이 된다');
    assert.equal(cs[0].left, true);
  });
});

test('★ «이름만» 같은 사람에게는 안 찍는다 — 동명이인이 서로를 덮는다', () => {
  const C = load([ co([{ id:'p1', name:'박대리', email:'other@gana.co.kr' }]) ]);
  return C.cardMarkLeft(card({ name:'박대리', email:'park@gana.co.kr' }), true).then(() => {
    const cs = C._writes[0]['data/companies/v/c1'].contacts;
    assert.equal(cs.length, 2, '★ 이름이 같다고 남을 퇴사시키면 안 된다');
    assert.ok(!cs[0].left, '엉뚱한 사람이 퇴사로 찍혔다');
    assert.equal(cs[1].left, true);
  });
});

test('가릴 값이 아예 없는 명함은 거절한다 — 누구인지 못 가린다', () => {
  const C = load([ co([{ id:'p1', email:'kim@gana.co.kr' }]) ]);
  return C.cardMarkLeft(card({ name:'박대리' }), true).then(r => {
    assert.equal(r.ok, false);
    assert.equal(C._writes.length, 0);
    assert.match(r.message, /이메일|전화/, '왜 안 되는지 말해야 한다');
  });
});

/* ══════ ④ 다시 누르면 푼다 ══════ */

test('★ 다시 누르면 «푼다»', () => {
  const C = load([ co([{ id:'p1', email:'park@gana.co.kr', left:true, leftAt:123 }]) ]);
  return C.cardMarkLeft(card({ email:'park@gana.co.kr' }), false).then(r => {
    assert.equal(r.ok, true);
    const c0 = C._writes[0]['data/companies/v/c1'].contacts[0];
    assert.equal(!!c0.left, false, '★ 못 풀면 잘못 찍었을 때 되돌릴 길이 없다');
  });
});

/* ══════ ⑤ 업체관리에 없는 회사 ══════ */

test('★ 업체관리에 없는 회사면 아무것도 안 쓰고 그렇게 말한다', () => {
  /* 번호도 이름도 «둘 다» 업체관리에 없어야 진짜 없는 회사다 */
  const C = load([ co([]) ]);
  return C.cardMarkLeft(card({ company:'없는회사', bizno:'505-86-00987',
    email:'park@x.kr' }), true).then(r => {
    assert.equal(r.ok, false);
    assert.equal(C._writes.length, 0, '★ 없는 업체를 만들면 업체관리에 유령이 쌓인다');
    assert.match(r.message, /업체관리/);
  });
});

test('★ 사업자번호가 없는 명함도 «회사 이름으로» 찾는다', () => {
  /* ⚠ 2026-08-29 대표 보고로 드러난 결함. 사업자번호는 «사업자등록증 칸»이라
     명함에는 원래 없다. 그런데 쓰는 쪽만 번호를 요구해서, 🚪 딱지는 보이는데
     눌러도 「사업자번호가 없다」며 거절당했다 — 명함에서는 사실상 못 쓰는 단추였다.
     읽는 쪽(match)은 번호가 없으면 이름으로 찾는다. 같은 함수를 쓰게 고쳤다. */
  const C = load([ co([{ id:'p1', email:'park@gana.co.kr' }]) ]);
  return C.cardMarkLeft(card({ bizno:'', email:'park@gana.co.kr' }), true).then(r => {
    assert.equal(r.ok, true, '★ 명함에 없는 칸을 요구하면 명함에서는 못 쓰는 단추가 된다');
    assert.equal(C._writes[0]['data/companies/v/c1'].contacts[0].left, true);
  });
});

/* ══════ ⑥ 갱신시각 ══════ */

test('★ 갱신시각을 남긴다 — 안 쓰면 푸른이알피 화면이 안 바뀐다', () => {
  const C = load([ co([{ id:'p1', email:'park@gana.co.kr' }]) ]);
  return C.cardMarkLeft(card({ email:'park@gana.co.kr' }), true, '권형하').then(() => {
    const u = C._writes[0];
    assert.ok(u['data/companies/u'], '★ 갱신시각이 없으면 저쪽이 다시 안 읽는다');
    assert.ok(u['data/companies/v/c1'].updatedAt, '고친 때가 없다');
    assert.equal(u['data/companies/v/c1'].updatedBy, '권형하', '누가 고쳤는지 없다');
  });
});

test('색인을 다시 만든다 — 안 하면 눌러도 화면이 그대로다', () => {
  const C = load([ co([{ id:'p1', email:'park@gana.co.kr' }]) ]);
  return C.cardMarkLeft(card({ email:'park@gana.co.kr' }), true).then(() => {
    assert.equal(C._reloaded, true);
  });
});

/* ══════ ⑦ 다른 칸을 안 건드린다 ══════ */

test('★ 그 업체의 다른 칸을 안 건드린다', () => {
  const before = co([{ id:'p1', email:'park@gana.co.kr', name:'박대리', role:'과장' }]);
  before.phone = '041-556-0035';
  before.managerMain = 's1';
  const C = load([ before ]);
  return C.cardMarkLeft(card({ email:'park@gana.co.kr' }), true).then(() => {
    const rec = C._writes[0]['data/companies/v/c1'];
    assert.equal(rec.phone, '041-556-0035');
    assert.equal(rec.managerMain, 's1');
    assert.equal(rec.typeCode, '자문');
    assert.equal(rec.contacts[0].role, '과장', '★ 담당자의 다른 칸도 그대로여야 한다');
  });
});

test('다른 업체는 손대지 않는다', () => {
  const other = { id:'c2', name:'다라산업', bizNo:'505-86-00987', contacts:[] };
  const C = load([ co([{ id:'p1', email:'park@gana.co.kr' }]), other ]);
  return C.cardMarkLeft(card({ email:'park@gana.co.kr' }), true).then(() => {
    assert.equal(C._writes[0]['data/companies/v/c2'], undefined);
  });
});

/* ══════ ⑦-2 «배열꼴» 업체관리도 다룬다 ══════ */

test('★ 업체관리가 배열꼴이어도 쓴다 — 두 꼴이 실제로 다 있다', () => {
  const writes = [];
  const i = src.indexOf('const ErpMatch = {');
  const open = src.indexOf('{', i);
  let d = 0, end = -1;
  for (let k = open; k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (!d) { end = k + 1; break; } }
  }
  const arr = [ co([{ id:'p1', email:'park@gana.co.kr' }]) ];
  const ctx = { console, Object, Array, String, Number, Math, JSON, Promise, Date, Set,
    setTimeout: () => {}, render: () => {}, coListBust: () => {},
    firebase: { database: () => ({ ref: () => ({
      once: () => Promise.resolve({ val: () => ({ v: arr }) }),
      update: u => { writes.push(u); return Promise.resolve(); } }) }) } };
  vm.createContext(ctx);
  vm.runInContext(src.slice(i, end).replace(/^const /, 'var ') + ';', ctx);
  ctx.ErpMatch.load = () => {};
  indexInto(ctx.ErpMatch, arr);
  vm.runInContext(fnBody('cardMarkLeft'), ctx);
  return ctx.cardMarkLeft(card({ email:'park@gana.co.kr' }), true).then(r => {
    assert.equal(r.ok, true);
    const list = writes[0]['data/companies/v'];
    assert.ok(Array.isArray(list), '★ 배열꼴인데 객체꼴로 쓰면 업체 목록이 통째로 뒤집힌다');
    assert.equal(list[0].contacts[0].left, true);
    assert.ok(writes[0]['data/companies/u'], '갱신시각이 없다');
  });
});

/* ══════ ⑧ 화면에 단추가 있다 ══════ */

test('★ 명함 상세에 「퇴사」 단추가 있다 — 함수만 있고 안 부르면 소용없다', () => {
  assert.match(src, /cardMarkLeft\(/,
    '★ 만들어 놓고 아무 데서도 안 부르면 누를 길이 없다');
  const at = src.indexOf('cardMarkLeft(');
  assert.ok(at > 0);
  /* 부르는 자리가 함수 «정의»말고도 있어야 한다 */
  const uses = (src.match(/cardMarkLeft\(/g) || []).length;
  assert.ok(uses >= 2, '★ 정의만 있고 부르는 곳이 없다');
});
