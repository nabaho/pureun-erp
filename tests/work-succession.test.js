/* 업무관리 ↔ 메일함 «승계표 연결» (대표 지시 2026-08-26 「업무관리연결」)
   "과거 담당자의 정보나 메일 등 자료가 새로운사람에게 이관되고 쉽게 검토 찾을 수
    있도록 해야한다."

   ★ 여기서 지키는 것은 «모양»이 아니라 이 다섯이다.
     1. 두 앱이 «같은 표»(pucards/config/staffSucc)를 본다 — 각자 정하면 메일은 A,
        업무는 B 에게 가서 아무도 그 사람 몫 전부를 못 본다
     2. 표를 여기서도 «적을 수 있다» — 한쪽만 적으면 연결이 아니라 복사다
     3. 이어받은 사람도 퇴사했으면 그 다음까지 — «두 번»만. 서로 가리키면 멈춘다
     4. 한 번에 넘겨도 건마다 «누가 언제 넘겼나» 기록이 남는다
     5. 표가 없어도 아무것도 막지 않는다 — 지금처럼 건별로 고르면 된다

   ⚠ 실측 2026-08-27 — 업무 271건 가운데 퇴사자가 주담당인 것은 임혜미 15건(진행 중 13건)뿐.
     업무의 mgr_main.sid 가 «비어 있고 이름만» 있어, 사번은 명부에서 이름으로 찾아야 한다. */
const fs = require('fs'), path = require('path'), vm = require('node:vm');
const ROOT = path.join(__dirname, '..');
const W = fs.readFileSync(process.argv[2] || path.join(ROOT, 'work.html'), 'utf8');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? ' — ' + extra : '')); }
}
function cut(a, b) {
  const i = W.indexOf(a);
  if (i < 0) throw new Error('못 찾음: ' + a);
  const j = W.indexOf(b, i + a.length);
  if (j < 0) throw new Error('못 찾음: ' + b);
  return W.slice(i, j);
}

/* 명부 — 재직 셋 · 퇴사 둘 (실제와 같은 모양) */
const ACCOUNTS = [
  { sid:'P-001', name:'권형하', title:'대표노무사', status:'active',  sortOrder:10 },
  { sid:'P-002', name:'박성수', title:'노무사',    status:'retired', sortOrder:20 },
  { sid:'P-003', name:'박한별', title:'노무사',    status:'active',  sortOrder:30 },
  { sid:'P-006', name:'임혜미', title:'노무사',    status:'retired', sortOrder:60 },
  { sid:'A-001', name:'최기운', title:'사무장',    status:'active',  sortOrder:80 }
];
/* ⚠ mgr_main.sid 를 «일부러 비운다» — 실제 자료가 그렇다(이름만 있다) */
const ITEMS = {
  i1: { mgr_main:{name:'임혜미',sid:''}, company:'대운토건', title:'사측' },
  i2: { mgr_main:{name:'임혜미',sid:''}, company:'대통농산', title:'근로계약서' },
  i3: { mgr_main:{name:'임혜미',sid:''}, company:'충남9호',  title:'기금', state:'done' },
  i4: { mgr_main:{name:'박한별',sid:'P-003'}, company:'한빛물산', title:'자문' }
};

function load(succ) {
  const held = { toasts:[], wrote:{}, patched:[], logs:[] };
  const items = JSON.parse(JSON.stringify(ITEMS));
  const ctx = {
    console, Object, Array, String, Number, Math, JSON, RegExp, Date, Promise, Set,
    setTimeout: fn => { if (fn) fn(); }, clearTimeout(){},
    toast: (m,k) => held.toasts.push(String(m) + (k ? '[' + k + ']' : '')),
    confirm: () => true,
    esc: s => String(s==null?'':s).replace(/[&<>"']/g,
      c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
    localStorage: { getItem: () => null, setItem(){} },
    document: { getElementById: id => held.sel && held.sel.id === id ? held.sel : null,
                createElement: () => ({ style:{}, className:'' }), body:{ appendChild(){} } },
    window: {},
    todayStr: () => '2026-08-27',
    fbDb: { ref: p => ({
      once: () => Promise.resolve({ val: () => (p.indexOf('user_accounts') >= 0 ? ACCOUNTS
                                              : p.indexOf('staffSucc') >= 0 ? (succ || {}) : null) }),
      set: v => { held.wrote[p] = v; return Promise.resolve(); }
    }) },
    firebase: { auth: () => ({ currentUser:null }) },
    items: items,
    S: { me:{sid:'P-003',name:'박한별'} },
    route(){}, openDrawer(){}, catBadge: () => '', md: () => '', noteDone: () => false,
    renderDrawer(){}, $: () => null,
    addLog: (id,msg) => held.logs.push(id + ': ' + msg),
    patchItem: (id,patch) => { held.patched.push({ id, to:(patch.mgr_main||{}).name, ho:patch.ho });
                               Object.assign(items[id], patch); return Promise.resolve(true); }
  };
  vm.createContext(ctx);
  vm.runInContext('var _staffCache=null,_coCache=null;'
    + 'function _normStaff(v){ if(!v) return []; if(!Array.isArray(v)) v=Object.keys(v).map(function(k){return v[k];});'
    + ' var seen={};'
    + ' return v.filter(function(u){return u&&u.sid;})'
    + '  .filter(function(u){return !u.status||u.status==="active"||(u.status==="leave"&&u.leaveLoginAllowed===true);})'
    + '  .filter(function(u){ if(seen[u.sid])return false; seen[u.sid]=1; return true; })'
    + '  .map(function(u){return {sid:u.sid,name:u.name||u.sid,title:u.title||"",'
    + '    ord:(typeof u.sortOrder==="number")?u.sortOrder:9999};})'
    + '  .sort(function(a,b){ return (a.ord-b.ord); }); }', ctx);
  vm.runInContext(cut('/* ── 명부 «전부» (퇴사자 포함) ──', '\n/* 「나는 누구인가」'), ctx);
  vm.runInContext(cut('/* ── 데이터 접근 ── */', '\n/* ── 담당 표시 ─'), ctx);
  vm.runInContext(cut('function _handoverTo(', '\nfunction confirmHo('), ctx);
  vm.runInContext(cut('function assignSuccessor(', '\nfunction orphanSubs('), ctx);
  /* ⚠ loadStaff·loadSucc 는 약속(Promise)이라 검사 코드가 그 자리에서 못 기다린다.
       같은 값을 «동기로» 넣어 준다 — 실제와 같은 함수(_normStaff·_normAll)로 만든다. */
  vm.runInContext('__ACC=' + JSON.stringify(ACCOUNTS) + '; __SUCC=' + JSON.stringify(succ || {}) + ';', ctx);
  vm.runInContext('_staffCache=_normStaff(__ACC); _allStaffCache=_normAll(__ACC); _succCache=__SUCC;', ctx);
  ctx._held = held;
  ctx._items = items;
  return ctx;
}

const run = [];
const flush = () => new Promise(r => setImmediate(r));
function T(name, fn, succ) { run.push([name, fn, succ]); }

T('★ 두 앱이 «같은 표»를 본다 — 경로가 메일함과 같아야 한다', c => {
  ok('승계표 경로가 pucards/config/staffSucc 다',
    W.indexOf("SUCC_PATH='pucards/config/staffSucc'") > 0,
    '경로가 다르면 두 앱이 다른 표를 본다');
});

T('★ 승계표로 이어받은 사람을 찾는다', c =>
  ok('임혜미 → 박한별', c.succOfName('임혜미') === '박한별', '찾은 값: ' + c.succOfName('임혜미')));

T('표에 없으면 빈 값 — 아무것도 막지 않는다', c =>
  ok('박성수 → (없음)', c.succOfName('박성수') === ''));

T('★ 업무의 mgr_main.sid 가 «비어 있어도» 이름으로 사번을 찾는다', c => {
  ok('명부에서 임혜미 사번을 찾는다', (c.staffByName('임혜미') || {}).sid === 'P-006',
    '실제 자료의 mgr_main.sid 는 빈 문자열이다');
});

T('★ 퇴사자도 명부 «전부»에는 남아 있다 — 걸러 낸 쪽에만 두면 사번을 못 찾는다', c => {
  ok('전체 명부에 퇴사자가 있다', c.allStaff().some(u => u.name === '임혜미'));
  ok('걸러 낸 명부에는 없다', !(c._staffCache || []).some(u => u.name === '임혜미'));
});

T('★ 이어받은 사람도 퇴사했으면 그 다음까지 — 두 번', c =>
  ok('박성수 → (김동근 자리) → 박한별', c.succOfName('박성수') === '박한별',
    '찾은 값: ' + c.succOfName('박성수')), { 'P-002':'P-006', 'P-006':'P-003' });

T('★ 서로 가리키면 «멈춘다» — 한없이 따라가면 화면이 얼어붙는다', c =>
  ok('멈춘다', c.succOfName('박성수') === ''), { 'P-002':'P-006', 'P-006':'P-002' });

T('★ 한 번에 넘겨도 «진행 중»인 것만 간다 — 끝난 건은 안 건드린다', c => {
  c.succBulk('임혜미', 'P-003', '박한별');
  ok('진행 중 두 건만 넘어갔다', c._held.patched.length === 2,
    '넘어간 건수: ' + c._held.patched.length);
  ok('모두 박한별에게', c._held.patched.every(x => x.to === '박한별'));
  ok('끝난 건은 그대로', (c._items.i3.mgr_main || {}).name === '임혜미');
});

T('★ 한 번에 넘겨도 건마다 «누가 언제 넘겼나»가 남는다', async c => {
  c.succBulk('임혜미', 'P-003', '박한별');
  await flush();   /* 기록은 patchItem 이 풀린 뒤에 남는다 */
  ok('건마다 기록이 남는다', c._held.logs.length === 2, '기록 수: ' + c._held.logs.length);
  ok('기록에 옛 담당과 새 담당이 있다',
    c._held.logs.every(l => l.indexOf('임혜미') >= 0 && l.indexOf('박한별') >= 0));
  ok('인수 확인 대기로 남는다',
    c._held.patched.every(x => x.ho && x.ho.confirmed === false));
});

T('넘길 건이 없으면 알려 준다 — 아무 일도 안 하면 고장으로 읽힌다', c => {
  c.succBulk('없는사람', 'P-003', '박한별');
  ok('알림이 있다', c._held.toasts.join(' ').indexOf('넘길 건이 없습니다') >= 0);
  ok('아무것도 안 넘겼다', c._held.patched.length === 0);
});

T('★ 승계표를 «여기서도» 적는다 — 한쪽만 적으면 연결이 아니라 복사다', c => {
  c._held.sel = { id:'sucdef-임혜미', value:'P-003',
    selectedIndex:1, options:[{},{ getAttribute: () => '박한별' }] };
  c.succDeclare('임혜미');
  const paths = Object.keys(c._held.wrote);
  ok('메일함과 같은 자리에 적었다',
    paths.some(p => p.indexOf('pucards/config/staffSucc') >= 0), '적은 자리: ' + paths.join(', '));
  ok('사번으로 적었다', paths.some(p => p.indexOf('P-006') >= 0));
});

T('★ 자기 자신에게는 못 넘긴다 — 넘기면 영영 못 찾는다', c => {
  c._held.sel = { id:'sucdef-임혜미', value:'P-006',
    selectedIndex:1, options:[{},{ getAttribute: () => '임혜미' }] };
  c.succDeclare('임혜미');
  ok('안 적혔다', Object.keys(c._held.wrote).length === 0);
});

T('★ 화면이 «어디까지 바뀌는지» 말해 준다 — 안 적으면 업무까지 넘어간 줄 안다', () => {
  const fn = cut('function succDeclare(', '\nfunction orphanSubs(');
  ok('메일함도 바뀐다고 적혀 있다', fn.indexOf('메일함') > 0);
  ok('업무는 이 표만으로 안 넘어간다고 적혀 있다', fn.indexOf('이 표만으로 넘어가지 않습니다') > 0);
  const b = cut('function succBulk(', '\nfunction succDeclare(');
  ok('한 번에 넘기기는 몇 건인지 묻는다', b.indexOf('건을') > 0 && b.indexOf('confirm(') > 0);
  ok('되돌리기가 어렵다고 알린다', b.indexOf('되돌리려면') > 0);
});

T('★ 인수인계 화면이 승계표를 «미리 골라» 준다 — 열세 건을 하나씩 고르지 않게', () => {
  const i = W.indexOf('재직자 명단에 없는 담당자의 잔여 업무');
  const blk = W.slice(i, i + 3600);
  ok('승계표를 보여 준다', blk.indexOf('메일함 승계표') > 0);
  ok('한 번에 넘기는 단추가 있다', blk.indexOf('succBulk(') > 0);
  ok('표가 없으면 적을 길이 있다', blk.indexOf('succDeclare(') > 0);
  ok('미리 골라 두고 왜인지 적는다', blk.indexOf('(승계표)') > 0);
});

T('★ 승계표를 못 읽어도 화면은 돈다 — 못 읽는다고 인수인계가 막히면 안 된다', () => {
  const fn = cut('function loadSucc(', '\nfunction succMap(');
  ok('실패해도 빈 표로 이어 간다', fn.indexOf('catch') > 0 && fn.indexOf('_succCache={}') > 0);
});


/* ══════════════════════════════════════════════════════════════════════════
   승계표대로 «저절로» 넘긴다 (대표 지시 2026-08-27)
   ══════════════════════════════════════════════════════════════════════════
   "푸른이알피 또는 업무관리에서 승계정리를 하면 업무관리는 자동으로 승계되게 해달라"

   ★ 지키는 것 다섯 — ①퇴사자만 ②진행 중인 것만 ③건마다 기록 ④멱등 ⑤조용히 안 한다 */
function loadAuto(succ, dir) {
  const c = load(succ);
  /* succAuto 는 start() 안에서 부른다 — 검사에서는 그 함수만 꺼내 돌린다 */
  vm.runInContext(cut('var _succAutoDone=false;', '\n/* 승계표에 한 줄 적는다'), c);
  if (dir) {
    vm.runInContext('__ACC=' + JSON.stringify(dir) + ';', c);
    vm.runInContext('_staffCache=_normStaff(__ACC); _allStaffCache=_normAll(__ACC);', c);
  }
  return c;
}

T('★ 승계표대로 저절로 넘어간다 — 표 한 줄이 업무를 옮긴다', async c => {
  const a = loadAuto({ 'P-006':'P-003' });
  a.succAuto();
  await flush(); await flush();
  ok('진행 중 두 건이 넘어갔다', a._held.patched.length === 2,
    '넘어간 건수: ' + a._held.patched.length);
  ok('모두 박한별에게', a._held.patched.every(x => x.to === '박한별'));
});

T('★ ① «퇴사자»만 넘긴다 — 재직자 몫이 표 하나로 옮겨지면 그 사람이 모르는 사이에 일이 사라진다', async c => {
  /* 박한별(재직) → 김혜민 이라는 «잘못된» 줄을 넣어 본다 */
  const a = loadAuto({ 'P-003':'P-004' });
  a.succAuto();
  await flush(); await flush();
  ok('재직자 업무는 안 넘어갔다', a._held.patched.length === 0,
    '넘어간 건수: ' + a._held.patched.length);
});

T('★ ② «진행 중»인 것만 — 끝난 건은 지난 기록이다', async c => {
  const a = loadAuto({ 'P-006':'P-003' });
  a.succAuto();
  await flush(); await flush();
  ok('끝난 건은 그대로', (a._items.i3.mgr_main || {}).name === '임혜미');
});

T('★ ③ 건마다 «누가 언제 왜» 넘겼는지 남는다 — 자동이라 더 남겨야 한다', async c => {
  const a = loadAuto({ 'P-006':'P-003' });
  a.succAuto();
  await flush(); await flush();
  ok('건마다 기록이 남는다', a._held.logs.length === 2, '기록 수: ' + a._held.logs.length);
  ok('«승계표대로»라고 적힌다',
    a._held.logs.every(l => l.indexOf('승계표대로') >= 0),
    '사람이 그때 고른 것이 아니라는 것이 기록에 있어야 한다');
  ok('옛 담당과 새 담당이 함께 있다',
    a._held.logs.every(l => l.indexOf('임혜미') >= 0 && l.indexOf('박한별') >= 0));
});

T('★ ④ 두 번 돌아도 두 번 안 넘어간다 — 두 사람이 같이 열어도 안전해야 한다', async c => {
  const a = loadAuto({ 'P-006':'P-003' });
  a.succAuto();
  await flush(); await flush();
  const n1 = a._held.patched.length;
  a._succAutoDone = false;         /* 다시 돌려 본다 */
  a.succAuto();
  await flush(); await flush();
  ok('두 번째에는 아무것도 안 넘어갔다', a._held.patched.length === n1,
    '처음 ' + n1 + '건 · 두 번째 뒤 ' + a._held.patched.length + '건');
});

T('★ ⑤ 조용히 하지 않는다 — 말 없이 열세 건이 옮겨지면 「내 업무가 왜 늘었지」가 된다', async c => {
  const a = loadAuto({ 'P-006':'P-003' });
  a.succAuto();
  await flush(); await flush();
  const t = a._held.toasts.join(' ');
  ok('알림이 있다', t.indexOf('승계표') >= 0, '알림: ' + t);
  ok('누구에게 몇 건인지 말해 준다', t.indexOf('임혜미') >= 0 && t.indexOf('박한별') >= 0);
});

T('표가 비어 있으면 아무 일도 안 한다', async c => {
  const a = loadAuto({});
  a.succAuto();
  await flush(); await flush();
  ok('아무것도 안 넘겼다', a._held.patched.length === 0);
  ok('알림도 없다', a._held.toasts.length === 0);
});

T('★ 업무 목록이 아직 안 왔으면 «미룬다» — 빈 목록을 보고 「넘길 것이 없다」로 끝내면 안 된다', async c => {
  const a = loadAuto({ 'P-006':'P-003' });
  vm.runInContext('items={};', a);
  a.succAuto();
  await flush(); await flush();
  ok('아무것도 안 했다', a._held.patched.length === 0);
  ok('끝난 것으로 표시하지 않았다', a._succAutoDone === false,
    '다음 기회에 다시 돌 수 있어야 한다');
});

T('★ 승계자도 퇴사했으면 «그 다음 사람»에게 간다', async c => {
  const dir = [
    { sid:'P-003', name:'박한별', title:'노무사', status:'active',  sortOrder:30 },
    { sid:'P-006', name:'임혜미', title:'노무사', status:'retired', sortOrder:60 },
    { sid:'P-009', name:'중간사람', title:'노무사', status:'retired', sortOrder:90 }
  ];
  const a = loadAuto({ 'P-006':'P-009', 'P-009':'P-003' }, dir);
  a.succAuto();
  await flush(); await flush();
  ok('두 다리 건너 박한별에게', a._held.patched.every(x => x.to === '박한별'),
    '간 곳: ' + a._held.patched.map(x => x.to).join(','));
});

T('★ 서로 가리키면 아무것도 안 옮긴다 — 멈춰야 한다', async c => {
  const dir = [
    { sid:'P-003', name:'박한별', title:'노무사', status:'active',  sortOrder:30 },
    { sid:'P-006', name:'임혜미', title:'노무사', status:'retired', sortOrder:60 },
    { sid:'P-009', name:'중간사람', title:'노무사', status:'retired', sortOrder:90 }
  ];
  const a = loadAuto({ 'P-006':'P-009', 'P-009':'P-006' }, dir);
  a.succAuto();
  await flush(); await flush();
  ok('아무것도 안 넘어갔다', a._held.patched.length === 0);
});

T('★ 켤 때 «곧바로» 돌지 않는다 — 업무 목록이 오기 전이라 헛돈다', () => {
  const fn = cut('function succAutoSoon(', '\nfunction succAuto(');
  ok('조금 뒤에 돈다', fn.indexOf('setTimeout') > 0);
  ok('start() 에서 부른다', W.indexOf('succAutoSoon();') > 0);
});

T('★ 승계표를 못 읽어도 화면은 그대로 돈다', () => {
  const fn = cut('function succAuto(', '\n/* 승계표에 한 줄 적는다');
  ok('실패를 삼킨다', fn.indexOf('catch') > 0);
});

/* ── 돌린다 ── */
console.log('업무관리 ↔ 메일함 승계표 연결');
(async () => {
  for (const [name, fn, succ] of run) {
    console.log(' ' + name);
    try { await fn(load(succ || { 'P-006':'P-003' })); await flush(); }
    catch (e) { fail++; console.log('  FAIL ' + name + ' — ' + e.message); }
  }
  console.log((fail ? 'FAIL ' : 'ALL ') + (pass + fail) + '개 중 ' + pass + ' 통과'
    + (fail ? ' · ' + fail + ' 실패' : ''));
  if (fail) process.exit(1);
})();
