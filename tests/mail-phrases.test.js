/* 문구 서랍 — 메일 쓸 때 문구를 골라 넣는다 (대표 지시 2026-08-26)
   "메일에 문구도 선택할 수 있게 해야한다."

   ★ 여기서 지키는 것은 «모양»이 아니라 이 다섯이다.
     1. 고르면 제목·본문이 «통째로» 바뀐다 — 쓰던 글이 있으면 반드시 물어본다
     2. 문구를 넣어도 «서명이 살아 있다» — 본문만 갈아 끼우면 서명이 함께 날아간다
     3. 못 채운 칸은 «빈 값으로 지워진다» — 「{담당자}」 글자가 고객 메일에 나가면 안 된다
     4. 채우는 칸은 «한 자리»(mailVals)에서만 만든다 — 두 곳에서 만들면 한쪽만 빈다
     5. 씨앗은 «보기만 할 때 저장하지 않는다» — 창을 열어 본 것만으로 DB 가 불면 안 된다

   ⚠ 글자·개수를 못 박지 않는다(docs/검사-못박지-않기.md). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const src = fs.readFileSync(path.join(__dirname, '..', 'pu-cards.html'), 'utf8');
function cut(from, to){
  const i = src.indexOf(from);
  assert.ok(i > 0, from + ' 를 찾지 못했습니다');
  const j = src.indexOf(to, i + from.length);
  assert.ok(j > i, to + ' 를 찾지 못했습니다');
  return src.slice(i, j);
}

const ITEMS = {
  c1: { id:'c1', name:'김민근', company:'한빛물산', email:'mgkim@hanbit.co.kr' }
};
const BYNAME = { '한빛물산': { company:'한빛물산', main:'박한별', subs:[] } };

function load(over){
  const o = over || {};
  const held = { wrote:{}, toasts:[], asked:[], rendered:0 };
  const state = Object.assign({
    view:'mail', mailSent:false, items: ITEMS, pick:{}, edMode:'editor',
    matMailCat:'', tplEdit:'', matCat:'mail'
  }, o.state || {});
  const dbRef = (p) => ({
    once: () => Promise.resolve({ val: () => (o.stored || null) }),
    set: (v) => { held.wrote[p] = v; return Promise.resolve(); },
    remove: () => { held.wrote[p] = null; return Promise.resolve(); },
    child: (k) => dbRef(p + '/' + k),
    update: (v) => { held.wrote[p] = Object.assign(held.wrote[p]||{}, v); return Promise.resolve(); }
  });
  const els = {};
  const el = (v) => ({ value: v==null?'':v, selectionStart:0, selectionEnd:0,
    focus(){}, select(){}, set innerHTML(x){ this._h = x; }, get innerHTML(){ return this._h||''; },
    style:{}, offsetHeight:120, contains:()=>false, scrollTop:0, dataset:{} });
  const ctx = {
    console, Object, Array, String, Number, Math, JSON, RegExp, Set, Date, Promise,
    setTimeout: (fn)=>{ if(fn) fn(); }, atob:()=>'',
    state,
    esc: s => String(s == null ? '' : s).replace(/[&<>"']/g,
      c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
    Store: { mode:'firebase' }, DB_ROOT:'pucards',
    fmtDate: () => '2026.08.26', fmtMB: n => n + 'B',
    toast: m => held.toasts.push(String(m)),
    confirm: m => { held.asked.push(String(m)); return (o.confirm !== false); },
    prompt: () => (o.promptWith === undefined ? null : o.promptWith),
    allItems: () => ITEMS,
    staffName: e => (String(e||'') === 'p004@pureun.kr' ? '김혜민' : String(e||'')),
    myEmail: 'p004@pureun.kr',
    renderMailPage(){ held.rendered++; },
    renderMatPage(){ held.rendered++; },
    renderPCSide(){}, render(){},
    openMatPage(){}, setMatCat(){}, closeFolderMenu(){}, mbPlaceMenu(){},
    matCatList: () => [], MAT_CATS_NOW: () => [], matCat: () => '',
    _matMeta: {},
    document: { getElementById: id => els[id] || null, addEventListener(){}, removeEventListener(){} },
    $: id => els[id] || null,
    window: { innerWidth:1600, innerHeight:900 },
    firebase: {
      auth: () => ({ currentUser: null }),
      database: () => ({ ref: (p) => dbRef(p) })
    }
  };
  vm.createContext(ctx);
  /* 채우기·문구 층 */
  vm.runInContext(cut('/* ── 메일 틀 ──', '\n/* ── 편지 쓰기 ──'), ctx);
  /* 문구 만들기·고치기는 자료함 쪽에 있다 — 함께 돌려야 한다 */
  vm.runInContext(cut('function tplMgrHtml(', '\n/* ── 메일 본문 틀 ── */'), ctx);
  /* ErpMatch — 회사 → 담당 노무사 */
  vm.runInContext(cut('const ErpMatch = {', '\nfunction autoFolderFlush('), ctx);
  const EM = vm.runInContext('ErpMatch', ctx);
  const byName = {};
  Object.keys(BYNAME).forEach(n => { byName[EM._norm(n)] = BYNAME[n]; });
  EM.byName = byName; EM.byBiz = {}; EM.ready = true;
  ctx.ErpMatch = EM;
  vm.runInContext('_mailTpls = ' + JSON.stringify(o.stored || {}) + ';', ctx);
  ctx._held = held;
  ctx._els = els;
  ctx._el = el;
  ctx.MAIL_TPL_DEFAULT = vm.runInContext('MAIL_TPL_DEFAULT', ctx);
  ctx.__tpls = () => vm.runInContext('JSON.stringify(_mailTpls)', ctx);
  return ctx;
}

/* ══════ 채우는 칸 ══════ */

test('★ 채우는 칸을 «한 자리»에서만 만든다 — 두 곳에서 만들면 한쪽만 빈다', () => {
  /* 옛 코드는 두 곳에서 손으로 만들었다(자료 보내기 · 새 메일). 새 칸을 더하면
     한 길에서만 채워져, 같은 문구가 화면에 따라 다르게 나갔다. */
  /* 「오늘」을 손으로 넣는 자리가 곧 그 자리다 — mailVals 안에 딱 하나여야 한다 */
  const hand = src.match(/오늘\s*:\s*fmtDate/g) || [];
  assert.equal(hand.length, 1,
    '채우는 칸을 손으로 만드는 자리가 ' + hand.length + '곳 있다 — mailVals 를 쓰게 고쳐야 한다');
  assert.ok(src.indexOf('function mailVals(') > 0, 'mailVals 가 없다');
});

test('★ 새로 더한 칸 넷이 실제로 채워진다 — {담당자} {보낸이} {이번달} {지난달}', () => {
  const c = load();
  const v = c.mailVals({ 받는분:'김민근', 회사명:'한빛물산', card: ITEMS.c1 });
  assert.equal(v.담당자, '박한별', '그 회사의 담당 노무사가 안 채워졌다');
  assert.equal(v.보낸이, '김혜민', '지금 로그인한 직원이 안 채워졌다');
  assert.match(v.이번달, /^\d{1,2}월$/, '이번달이 「N월」 꼴이 아니다');
  assert.match(v.지난달, /^\d{1,2}월$/, '지난달이 「N월」 꼴이 아니다');
  assert.notEqual(v.이번달, v.지난달, '이번달과 지난달이 같다');
});

test('★ 담당자와 보낸이는 «다른 칸»이다 — 담당은 박한별인데 김혜민이 대신 보낼 때가 있다', () => {
  const c = load();
  const v = c.mailVals({ 회사명:'한빛물산', card: ITEMS.c1 });
  assert.notEqual(v.담당자, v.보낸이, '두 칸이 같은 값이면 하나만 두면 된다');
});

test('★ 모르는 칸은 «빈 값으로 지운다» — 「{담당자}」 글자가 고객 메일에 나가면 안 된다', () => {
  const c = load();
  const v = c.mailVals({ 받는분:'홍길동' });          /* 회사를 모른다 → 담당자도 모른다 */
  const out = c.mailFill('{받는분} 님, {담당자} 노무사입니다. {없는칸}', v);
  assert.ok(out.indexOf('{') < 0, '중괄호가 그대로 남았다: ' + out);
  assert.ok(out.indexOf('홍길동') >= 0, '아는 칸은 채워야 한다');
});

test('보낸이 이름을 못 찾으면 «주소를 쓰지 않는다» — 메일에 p004@… 가 나가면 안 된다', () => {
  const c = load();
  vm.runInContext('myEmail = "unknown@pureun.kr";', c);
  assert.equal(c.mailVals({}).보낸이, '', '이름 대신 주소가 들어갔다');
});

/* ══════ 문구 목록 ══════ */

test('★ 처음에는 «씨앗 문구»가 보이고, 저장은 하지 않는다', () => {
  const c = load();
  const list = c.mailTplList();
  assert.ok(list.length >= 3, '처음 문구가 너무 적다');
  assert.ok(list.every(t=>t.seed), '씨앗 표시가 없다');
  assert.equal(c.__tpls(), '{}', '보기만 했는데 저장했다');
  assert.equal(Object.keys(c._held.wrote).length, 0, '보기만 했는데 DB 에 적었다');
});

test('★ 지금 쓰는 기본 문구가 씨앗에 «그대로» 들어 있다 — 잃는 것이 없어야 한다', () => {
  const c = load();
  const same = c.mailTplList().find(t => t.b === c.MAIL_TPL_DEFAULT.body);
  assert.ok(same, '지금 기본 문구와 같은 씨앗이 없다 — 옮기면서 글이 바뀌었다');
});

test('★ 자료를 안 붙이는 문구가 있다 — 대표께서 짚으신 자리', () => {
  const c = load();
  const noMat = c.mailTplList().filter(t => String(t.b).indexOf('{자료목록}') < 0);
  assert.ok(noMat.length, '자료 문구가 없는 문구가 하나도 없다');
  noMat.forEach(t => assert.ok(String(t.b).indexOf('첨부') < 0,
    '「' + t.n + '」 에 아직 첨부 이야기가 있다'));
});

test('★ 적어 둔 문구가 있으면 씨앗을 «섞지 않는다» — 지운 것이 되살아나면 안 된다', () => {
  const c = load({ stored: { x1: { n:'내 문구', s:'제목', b:'본문', o:0 } } });
  const list = c.mailTplList();
  assert.equal(list.length, 1, '씨앗이 되살아났다');
  assert.equal(list[0].n, '내 문구');
});

test('★ 처음 고칠 때 씨앗을 «한 번에» 굳힌다 — 그 뒤로는 낱칸으로 적는다', () => {
  const c = load();
  c._els.tplName = c._el('바꾼 이름');
  c._els.tplSubj = c._el('바꾼 제목');
  c._els.tplBody = c._el('바꾼 본문');
  c.tplSaveNow('s1');
  const st = JSON.parse(c.__tpls());
  assert.ok(Object.keys(st).length >= 3, '씨앗이 굳지 않아 나머지 문구가 사라졌다');
  assert.equal(st.s1.n, '바꾼 이름');
  assert.equal(st.s1.b, '바꾼 본문');
});

test('이름 없이 저장하지 않는다 — 고를 때 무엇인지 알 수 없다', () => {
  const c = load();
  c._els.tplName = c._el('   ');
  c._els.tplSubj = c._el('제목');
  c._els.tplBody = c._el('본문');
  c.tplSaveNow('s1');
  assert.equal(c.__tpls(), '{}', '이름 없이 저장됐다');
  assert.ok(c._held.toasts.join(' ').indexOf('이름') >= 0, '까닭을 알려 주지 않았다');
});

test('마지막 문구는 지울 수 없다 — 하나도 없으면 고를 것이 없다', () => {
  const c = load({ stored: { only: { n:'하나', s:'', b:'본문', o:0 } } });
  c.tplDel('only');
  assert.equal(Object.keys(JSON.parse(c.__tpls())).length, 1, '마지막 문구가 지워졌다');
});

test('★ 지우기는 «전 직원에게서 사라진다»고 알린 뒤에 한다', () => {
  const c = load({ stored: { a:{n:'가',s:'',b:'가본문',o:0}, b:{n:'나',s:'',b:'나본문',o:1} } });
  c.tplDel('a');
  assert.ok(c._held.asked.length, '묻지 않고 지웠다');
  assert.ok(c._held.asked.join(' ').indexOf('전 직원') >= 0, '공용이라는 것을 안 알렸다');
  assert.ok(Object.keys(JSON.parse(c.__tpls())).indexOf('a') < 0, '안 지워졌다');
});

/* ══════ 화면 ══════ */

test('★ 쓰기 도구줄에 「문구」 단추가 있다 — 서명·내 명함과 같은 줄', () => {
  const bar = cut('<button class="edbtn edtpl"', '✍ 서명');
  assert.ok(bar.indexOf('tplPick(') > 0, '문구를 고르는 길이 없다');
  assert.ok(src.indexOf('.edbtn.edtpl{') > 0, '문구 단추가 눈에 띄게 칠해지지 않았다');
});

test('★ 문구 고르는 창에 «만들기·고치기»로 가는 길이 있다 — 없으면 문구를 늘릴 수 없다', () => {
  const fn = cut('function tplPickShow(', '\nfunction tplDirty(');
  assert.ok(fn.indexOf('tplUse(') > 0, '고르는 길이 없다');
  assert.ok(fn.indexOf('setMatCat(') > 0, '고치는 자리로 갈 길이 없다');
});

test('★ 채우는 칸 딱지는 «눌러서» 넣는다 — 손으로 적으면 어긋나 안 채워진다', () => {
  const fn = cut('function tplMgrHtml(', '\nfunction tplInsKey(');
  assert.ok(fn.indexOf('tplInsKey(') > 0, '딱지를 눌러 넣을 길이 없다');
  assert.ok(fn.indexOf('mailValKeys()') > 0, '딱지를 손으로 적어 두었다 — 칸이 늘면 어긋난다');
});

test('★ 문구 관리 화면이 «전 직원 공용»임을 말해 준다', () => {
  const fn = cut('function tplMgrHtml(', '\nfunction tplInsKey(');
  assert.ok(fn.indexOf('전 직원') > 0, '공용이라는 것을 안 적었다');
});

/* ══════════════════════════════════════════════════════════════════════════
   문구를 «넣을 때» — 통째로 바꾸기 · 서명 살리기
   ══════════════════════════════════════════════════════════════════════════ */
function loadUse(over){
  const o = over || {};
  const held = { asked:[], toasts:[], rendered:0 };
  const ctx = {
    console, Object, Array, String, Number, Math, JSON, RegExp, Set, Date, Promise,
    setTimeout: (fn)=>{ if(fn) fn(); },
    state: { items: ITEMS },
    esc: s => String(s == null ? '' : s).replace(/[&<>"']/g,
      c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
    Store: { mode:'firebase' }, DB_ROOT:'pucards',
    fmtDate: () => '2026.08.26',
    toast: m => held.toasts.push(String(m)),
    confirm: m => { held.asked.push(String(m)); return (o.confirm !== false); },
    staffName: () => '김혜민', myEmail: 'p004@pureun.kr',
    renderMailPage(){ held.rendered++; },
    closeFolderMenu(){}, mbPlaceMenu(){}, openMatPage(){}, setMatCat(){},
    grabCompose(){}, _matMeta: {},
    /* 서명 — 있다고 해 둔다. 문구를 넣은 뒤에도 남아 있어야 한다. */
    signBlockHtml: () => '<div class="pusign">푸른노무법인 서명</div>',
    textToHtml: t => String(t||'').split('\n').join('<br>'),
    htmlToTextC: h => String(h||'').replace(/<br>/g,'\n').replace(/<[^>]+>/g,''),
    mbWhoMap: () => ({ 'mgkim@hanbit.co.kr': { name:'김민근', company:'한빛물산' } }),
    document: { getElementById: () => null, addEventListener(){}, removeEventListener(){} },
    $: () => null,
    firebase: { auth: () => ({ currentUser:null }),
      database: () => ({ ref: () => ({ once: () => Promise.resolve({ val: () => null }),
        set: () => Promise.resolve(), child(){ return this; }, remove: () => Promise.resolve() }) }) }
  };
  vm.createContext(ctx);
  vm.runInContext(cut('/* ── 메일 틀 ──', '\n/* ── 편지 쓰기 ──'), ctx);
  vm.runInContext(cut('const ErpMatch = {', '\nfunction autoFolderFlush('), ctx);
  const EM = vm.runInContext('ErpMatch', ctx);
  const byName = {};
  Object.keys(BYNAME).forEach(n => { byName[EM._norm(n)] = BYNAME[n]; });
  EM.byName = byName; EM.byBiz = {}; EM.ready = true;
  vm.runInContext(cut('function tplPick(', '\nfunction insertSign('), ctx);
  vm.runInContext('_mailTpls = ' + JSON.stringify(o.stored || {
    a: { n:'자료 송부', s:'[푸른] 자료', b:'{받는분} 님, 안녕하세요.\n\n자료를 첨부합니다.\n\n{자료목록}\n', o:0 },
    b: { n:'안내만',   s:'[푸른] 안내', b:'{받는분} 님, 안녕하세요.\n{회사명} 담당 {담당자} 노무사입니다.\n\n안내드립니다.\n', o:1 }
  }) + ';', ctx);
  vm.runInContext('_compose = ' + JSON.stringify(o.compose || {
    cardId:'c1', to:'mgkim@hanbit.co.kr', subject:'처음 제목',
    body:'처음 본문', html:'처음 본문',
    base:{ subject:'처음 제목', body:'처음 본문' }, ids:[], files:[]
  }) + ';', ctx);
  ctx._held = held;
  ctx.__c = () => JSON.parse(vm.runInContext('JSON.stringify(_compose)', ctx));
  return ctx;
}

test('★ 문구를 고르면 제목·본문이 «통째로» 바뀐다', () => {
  const c = loadUse();
  c.tplUse('b');
  const g = c.__c();
  assert.ok(g.subject.indexOf('안내') >= 0, '제목이 안 바뀌었다');
  assert.ok(g.body.indexOf('안내드립니다') >= 0, '본문이 안 바뀌었다');
  assert.ok(g.body.indexOf('처음 본문') < 0, '옛 본문이 남아 있다');
  assert.equal(g.tplId, 'b', '고른 문구를 기억하지 않는다');
});

test('★ 채우는 칸이 실제로 채워진다 — 받는사람에서 이름·회사·담당자를 찾아낸다', () => {
  const c = loadUse();
  c.tplUse('b');
  const g = c.__c();
  assert.ok(g.body.indexOf('김민근') >= 0, '받는분이 안 채워졌다');
  assert.ok(g.body.indexOf('한빛물산') >= 0, '회사명이 안 채워졌다');
  assert.ok(g.body.indexOf('박한별') >= 0, '담당자가 안 채워졌다');
  assert.ok(g.body.indexOf('{') < 0, '중괄호가 그대로 남았다');
});

test('★ 문구를 넣어도 «서명이 살아 있다» — 본문만 갈아 끼우면 서명이 함께 날아간다', () => {
  const c = loadUse();
  c.tplUse('b');
  assert.ok(String(c.__c().html).indexOf('pusign') >= 0, '서명이 사라졌다');
});

test('★ 쓰던 글이 있으면 «반드시» 물어본다 — 안 물으면 말없이 사라진다', () => {
  const c = loadUse({ compose: {
    cardId:'c1', to:'mgkim@hanbit.co.kr', subject:'처음 제목',
    body:'내가 손으로 쓴 글', html:'내가 손으로 쓴 글',
    base:{ subject:'처음 제목', body:'처음 본문' }, ids:[], files:[]
  }});
  c.tplUse('b');
  assert.ok(c._held.asked.length, '묻지 않고 덮어썼다');
  assert.ok(c._held.asked.join(' ').indexOf('사라집니다') >= 0, '무엇을 잃는지 안 알렸다');
});

test('★ 「아니오」 하면 쓰던 글이 그대로 남는다', () => {
  const c = loadUse({ confirm:false, compose: {
    cardId:'c1', to:'mgkim@hanbit.co.kr', subject:'처음 제목',
    body:'내가 손으로 쓴 글', html:'내가 손으로 쓴 글',
    base:{ subject:'처음 제목', body:'처음 본문' }, ids:[], files:[]
  }});
  c.tplUse('b');
  assert.equal(c.__c().body, '내가 손으로 쓴 글', '아니오 했는데 덮어썼다');
});

test('손대지 않은 편지에는 «묻지 않는다» — 새 메일마다 물으면 번거롭다', () => {
  const c = loadUse();
  c.tplUse('b');
  assert.equal(c._held.asked.length, 0, '손대지도 않았는데 물었다');
});

test('★ 문구를 넣은 뒤 «잣대도 함께» 옮긴다 — 안 옮기면 쓰지 않은 편지가 임시저장에 쌓인다', () => {
  const c = loadUse();
  c.tplUse('b');
  const g = c.__c();
  assert.equal(g.base.subject, g.subject, '잣대의 제목이 안 옮겨졌다');
  assert.equal(g.base.body, g.body, '잣대의 본문이 안 옮겨졌다');
});
