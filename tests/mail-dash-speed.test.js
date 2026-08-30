/* 푸른 메일 — 담당자 ↔ 업무별을 오갈 때의 «속도» (대표 보고 2026-08-29)
   "업무별로 되어 있다가 담당자로 변경 하고 업무별로 연결하고 서로 왔다갔다하면
    화면 넘어가는 속도가 너무 늦다 왜이런지 파악하고 해결방안 찾아달라"

   ★ 재 보니 담당자 옆줄 한 번에 «25초»였다(업무 칸 25개·메일 1만 통 밑그림).
     까닭 둘 —
     ① mbWhoList·mbWhoNoneCount·mbEndedCount 가 «각각» 메일 전체를 훑었다(세 번).
     ② 그 안에서 메일 «한 통마다» mbBins() 를 불렀고, mbBins() 는 그때마다 폴더
        목록을 정렬까지 해서 통째로 다시 만들었다. 만 통이면 만 번이다.

   ⚠ 이 검사는 «시간»을 재지 않는다 — 검사 기계의 속도는 날마다 다르다.
     대신 «몇 번 일했는가»를 센다. 그것이 늦음의 참된 까닭이고, 기계가 빨라져도
     느려진 것을 놓치지 않는다(2026-08-16 「지금 값을 못 박지 말 것」과 같은 결). */
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

/* 실제 규모보다 작게 — 세는 것은 «횟수»라 크기가 클 필요가 없다 */
const NAMES = ['박한별','김혜민','최기운','김보람'];
const NBIN = 6, NMSG = 40;
const FOLDERS = {}, MSGS = {}, ITEMS = {}, BYNAME = {};
for (let b = 0; b < NBIN; b++) {
  const slug = 'B' + b;
  FOLDERS[slug] = { path:'F'+b, name:(b+1)+'.업무칸', kind:'custom', order:7, total:NMSG, unseen:3 };
  const box = {};
  for (let m = 0; m < NMSG; m++) {
    const co = '회사' + (b * NMSG + m);
    box[String(b*1000+m)] = { u:b*1000+m, f:'보낸이', e:'p'+m+'@co'+(b*NMSG+m)+'.kr',
      t:'370-6@daum.net', s:'제목'+m, d:1756000000000+m, r:m%4?1:0, g:0, a:m%3?0:2, z:1 };
    if (m % 2 === 0) {
      ITEMS['i'+b+'_'+m] = { id:'i'+b+'_'+m, email:'p'+m+'@co'+(b*NMSG+m)+'.kr', company:co };
      BYNAME[co] = { company:co, main:NAMES[(b+m)%NAMES.length], subs:[], left:false };
    }
  }
  MSGS[slug] = box;
}
const DIR = NAMES.map((n,i)=>({ sid:'P-00'+i, name:n, sortOrder:(i+1)*10,
  role:'member', title:'노무사', status:'active' }));

function load(){
  const held = { binsBuilt: 0, rowWalks: 0 };
  const state = { view:'mail', mailSent:'box', mbBox:'', tab:'card', group:'all', owner:'all',
    isAdmin:true, groups:{}, pick:{}, matPick:'', sentBox:{}, schedBox:{},
    mbQ:'', mbFilter:'', mbTab:'', mbCursor:-1, mbOpen:null, mbDash:'topic',
    items: ITEMS, mbMineOpen:true };
  const el = () => ({ set innerHTML(v){}, get innerHTML(){ return ''; }, style:{},
    offsetHeight:100, value:'', focus(){}, select(){}, contains:()=>false, scrollTop:0,
    classList:{ toggle(){}, add(){}, remove(){}, contains:()=>false } });
  const dbRef = () => ({ once: () => Promise.resolve({ val: () => null }),
    set: () => Promise.resolve(), update: () => Promise.resolve(),
    orderByKey(){ return this; }, limitToLast(){ return this; } });
  const ctx = {
    console, Object, Array, String, Number, Math, JSON, RegExp, Set, Date, Promise,
    setTimeout: () => 0, clearTimeout(){}, atob:()=>'',
    state,
    esc: s => String(s == null ? '' : s).replace(/[&<>"']/g,
      c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
    Store: { mode:'firebase' }, DB_ROOT:'pucards',
    matMailCfg: () => ({ from:'370-6@daum.net' }),
    matList: () => [], matCat: () => '', MAT_CATS_NOW: () => [], _matMeta:{}, _matLoaded:true,
    loadMaterials(){}, schedList: () => [], staffName: b => String(b||''),
    fmtDate: () => '2026.08.29', fmtMB: n => n+'B',
    allItems: () => ITEMS, allGroups: () => ({}),
    isPrivGroup: () => false, canSeeGroup: () => true,
    coList: () => [], coTagList: () => [], coFTabList: () => [], coFTabCounts: () => ({all:0,byTab:{}}),
    _coFolders:{}, _coTagHidden:{},
    toast(){}, confirm: () => true, closeFolderMenu(){},
    toggleSidebar(){}, openSettingsPage(){}, openMatPage(){}, openMailPage(){},
    openSentBox(){}, openSchedBox(){}, openInbox(){}, closeMailPage(){},
    openPrivateVault(){}, migrateLockedFolders(){},
    inboxBoxHtml: () => '', schedBoxHtml: () => '', sentBoxHtml: () => '', mailWriteHtml: () => '',
    wireMailWrite(){},
    pickOf: k => (state.pick[k] = state.pick[k] || {}),
    pickOn: () => false, pickList: () => [], pickAllOn: () => false,
    pickClear(){}, pickHit(){}, pickToggleAll(){}, pickRedraw(){},
    render(){}, document: { getElementById: el, addEventListener(){}, removeEventListener(){},
      body:{ classList:{ contains: () => true } } },
    $: el,
    firebase: { auth: () => ({ currentUser:{ uid:'U1', getIdToken: () => Promise.resolve('T') } }),
      database: () => ({ ref: dbRef }) },
    fetch: () => Promise.resolve({ json: () => Promise.resolve({ ok:true }) })
  };
  vm.createContext(ctx);
  vm.runInContext(cut('const ErpMatch = {', '\nfunction autoFolderFlush('), ctx);
  vm.runInContext(cut('function pcItem(attrs', '\nfunction switchTab('), ctx);
  vm.runInContext(
    '_mbFolders = ' + JSON.stringify(FOLDERS) + ';' +
    '_mbMsgs = ' + JSON.stringify(MSGS) + ';' +
    '_mbBins = {}; _mbPut = {}; _mbHide = {}; _mbOwner = {}; _mbSucc = {}; _mbOrder = {};' +
    '_mbMeta = { at:1, ok:true };', ctx);
  const EM = vm.runInContext('ErpMatch', ctx);
  const byName = {}, staff = {};
  Object.keys(BYNAME).forEach(n => { byName[EM._norm(n)] = BYNAME[n]; });
  DIR.forEach(u => { staff[EM._norm(u.name)] = { sid:u.sid, name:u.name, ord:u.sortOrder,
    role:u.role, title:u.title, status:u.status }; });
  EM.byName = byName; EM.byBiz = {}; EM.staff = staff; EM.companies = []; EM.ready = true;
  ctx.ErpMatch = EM;

  /* 몇 번 «일했는가»를 센다 — 원래 함수를 감싸 둔다 */
  held.wrap = () => {
    const realBins = ctx.mbBins;
    ctx.mbBins = function(){ held.binsBuilt++; return realBins.apply(null, arguments); };
    vm.runInContext('mbBins = this.mbBins;', ctx);
  };
  ctx._held = held;
  return ctx;
}

const ROWS = NBIN * NMSG;   /* 밑그림의 메일 통수 */

test('★★ 옆줄을 그릴 때 칸 목록을 «메일 통수만큼» 다시 만들지 않는다', () => {
  /* 이것이 25초의 까닭이었다 — 메일 한 통마다 mbBins() 를 부르고, 그 안에서 폴더를
     정렬까지 해 가며 통째로 다시 만들었다. */
  const c = load();
  let built = 0;
  const real = c.mbBins;
  vm.createContext(c);
  c.__countBins = () => { built++; };
  vm.runInContext('(function(){ const _r = mbBins; mbBins = function(){ __countBins(); return _r.apply(null, arguments); }; })();', c);

  c.state.mbDash = 'who';
  c.mailSideHtml();
  assert.ok(built > 0, '검사 밑그림이 틀렸습니다 — mbBins 를 한 번도 안 불렀습니다');
  assert.ok(built < ROWS / 4,
    '옆줄 한 번에 칸 목록을 ' + built + '번 만듭니다 (메일 ' + ROWS + '통) — '
    + '메일 수에 따라 늘어나면 통수가 늘수록 화면이 느려집니다');
});

test('★ 메일 전체를 «한 번만» 훑는다 — 셋이 따로 훑으면 세 배가 든다', () => {
  const c = load();
  /* 세 셈이 같은 결과를 «한 번의 훑기»에서 나오는지 — 같은 표를 나눠 쓰는지 본다 */
  c.state.mbDash = 'who';
  const t1 = c.mbWhoTally();
  const t2 = c.mbWhoTally();
  assert.equal(t1, t2, '같은 그리기 안에서 두 번 훑습니다');
  assert.equal(c.mbWhoNoneCount(), t1.none, '「담당 모름」이 따로 훑습니다');
  assert.equal(c.mbEndedCount(), t1.ended, '「자문종료」가 따로 훑습니다');
});

test('★ 그리기가 새로 시작되면 셈을 «버린다» — 낡은 값이 화면에 남으면 안 된다', () => {
  const c = load();
  const t1 = c.mbWhoTally();
  c.mbMemoClear();                       /* renderPCSide·renderMailPage 가 하는 일 */
  const t2 = c.mbWhoTally();
  assert.notEqual(t1, t2, '그리기를 다시 해도 옛 셈을 그대로 씁니다 — 값이 굳습니다');
});

test('★ 빨라졌어도 «답»은 그대로다 — 담당자별 통수가 실제 줄 수와 맞는다', () => {
  const c = load();
  c.state.mbDash = 'who';
  const list = c.mbWhoList();
  const none = c.mbWhoNoneCount();
  const ended = c.mbEndedCount();
  const sum = list.reduce((s,w)=>s+w.n, 0) + none.n + ended.n;
  /* 울타리(업무 칸에 든 것)를 지난 줄은 «어딘가 한 곳»에 정확히 한 번 들어가야 한다 */
  let scoped = 0;
  Object.keys(MSGS).forEach(slug=>Object.keys(MSGS[slug]).forEach(uid=>{
    if(c.mbWhoScope({ e:MSGS[slug][uid].e, _slug:slug, _key:slug+':'+uid })) scoped++;
  }));
  assert.equal(sum, scoped,
    '담당자 칸 합(' + sum + ')과 실제 줄 수(' + scoped + ')가 다릅니다 — 겹치거나 새고 있습니다');
});

/* ══════ 옆줄 숫자 ══════ */

test('★ 업무 칸에 «전체 통수(400)»를 안 적는다 — 안 읽은 수만 (대표 지시 2026-08-29)', () => {
  const c = load();
  c.state.mbDash = 'topic';
  const h = c.mailSideHtml();
  const bin = c.mbBins()[0];
  const cnt = c.mbBinCount(bin);
  assert.ok(cnt.n > 0 && cnt.un > 0, '검사 밑그림이 틀렸습니다');
  assert.ok(cnt.n !== cnt.un, '검사 밑그림이 틀렸습니다 — 전체와 안읽음이 같습니다');
  /* 안 읽은 수는 있어야 하고, 전체 통수는 옆줄에 없어야 한다 */
  assert.ok(h.indexOf('class="nu">' + cnt.un + '<') >= 0, '안 읽은 수가 사라졌습니다');
  assert.ok(h.indexOf('class="n">' + cnt.n.toLocaleString() + '<') < 0,
    '전체 통수(' + cnt.n + ')가 옆줄에 그대로 있습니다');
});

/* ══════ 첨부 표시 ══════ */

test('★ 첨부 표시를 «그림»으로 그린다 — 글꼴마다 제멋대로면 줄이 들쭉날쭉하다', () => {
  const c = load();
  assert.equal(c.mbClipSvg(0), '', '첨부가 없는데도 자리를 차지합니다');
  const one = c.mbClipSvg(2);
  assert.ok(/<svg/.test(one), '글자(📎)로 그렸습니다');
  assert.ok(one.indexOf('첨부 2개') >= 0, '몇 개인지 귀띔해 주지 않습니다');
});

test('★ PC·폰 목록 둘 다 그림 클립을 쓴다 — 한쪽만 바꾸면 두 화면이 달라 보인다', () => {
  /* ⚠ 「📎 첨부」 거르개 단추는 그대로 둔다 — 그건 «이름표»라 글자가 맞다.
       바꾼 것은 «줄 안의 표시»뿐이므로, 검사도 줄 안쪽만 본다.
       (처음에 화면 전체에서 📎 를 찾았다가 그 단추를 잡았다) */
  const c = load();
  c.state.mbBox = '~B0';
  const rowsOf = (h, cls) => (h.match(new RegExp('<div class="' + cls + '[\\s\\S]*?</div>', 'g')) || []);
  [['PC', c.mbBoxHtml(), 'dm-row'], ['폰', c.mbMobileHtml(), 'dmm-row']].forEach(([where, h, cls])=>{
    const rows = rowsOf(h, cls);
    assert.ok(rows.length, where + ' 목록에 줄이 없습니다 — 검사 밑그림이 틀렸습니다');
    const joined = rows.join('');
    assert.ok(joined.indexOf('📎') < 0, where + ' 줄에 글자 클립(📎)이 남아 있습니다');
    assert.ok(joined.indexOf('class="clip"') >= 0, where + ' 줄에 첨부 표시가 없습니다');
    assert.ok(/<svg[^>]*>/.test(joined), where + ' 줄의 첨부 표시가 그림이 아닙니다');
  });
});

/* ══════ 칸을 «여는» 것도 빨라야 한다 (2026-08-29 뒤늦게 잡음) ══════
   ⚠ 옆줄만 고치고 끝난 줄 알았다. 배포본으로 다시 재 보니 담당자 칸을 «여는» 것은
     아직 8.3초였다 — 앞서 0.2초로 보였던 것은 그때 잠깐 있던 캐시 덕이었고,
     그 캐시는 정확성 때문에 걷어냈다. 재는 자리를 바꾸면 답도 바뀐다.
   목록을 거르는 자리(mbRowFits)가 줄마다 담당자 표를 다시 찾고 있었다. */

test('★★ 담당자 칸을 열 때 담당자 표를 «줄마다» 다시 찾지 않는다', () => {
  const c = load();
  let found = 0;
  vm.runInContext('(function(){ const _r = mbWhoIndex;'
    + ' mbWhoIndex = function(){ __countIdx(); return _r.apply(null, arguments); }; })();', c);
  c.__countIdx = () => { found++; };
  c.state.mbBox = '@' + NAMES[0];
  c.mbAllRows();
  assert.ok(found > 0, '검사 밑그림이 틀렸습니다 — 표를 한 번도 안 찾았습니다');
  assert.ok(found < ROWS / 4,
    '목록을 한 번 거르는 데 담당자 표를 ' + found + '번 찾습니다 (메일 ' + ROWS + '통) — '
    + '메일 수에 따라 늘어나면 통수가 늘수록 칸 열기가 느려집니다');
});

test('★ 빨라졌어도 «누가 그 칸에 들어가는가»는 그대로다', () => {
  const c = load();
  const id = '@' + NAMES[0];
  c.state.mbBox = id;
  const fast = c.mbAllRows().map(v => v._key).sort().join(',');
  /* 표를 안 넘겨 «줄마다 찾던» 옛 길과 견준다 — 답이 같아야 한다 */
  const slow = [];
  Object.keys(MSGS).forEach(slug => Object.keys(MSGS[slug]).forEach(uid => {
    const row = MSGS[slug][uid];
    const v = Object.assign({}, row, { _slug:slug, _box:'', _key:slug+':'+uid });
    if (c.mbRowFits(v, id)) slow.push(v._key);
  }));
  assert.equal(fast, slow.sort().join(','), '표를 넘겼더니 답이 달라졌습니다');
});

/* ══════ 두 대시보드 줄을 «같은 자리»로 (대표 승인 목업 2026-08-29) ══════
   "담당자와 업무별 누를때 … 열의 위치가 움직이고 아이콘이나 글자위치 크기다 모두 다르다"
   ⚠ 픽셀은 여기서 못 잰다(화면이 없다). 대신 «자리를 만드는 것들»이 두 줄에 다 있는지 본다 —
     그것이 어긋남의 참된 까닭이고, 실제 픽셀은 브라우저로 따로 확인한다
     (docs/mockups/mail-dash-align.html — 이름 18px·숫자 21px 어긋남이 0 이 되는 것을 봤다). */

test('★★ 담당자 줄에도 손잡이·메뉴 «자리»가 있다 — 없으면 칩을 바꿀 때 줄이 밀린다', () => {
  const c = load();
  c.state.mbDash = 'who';
  const h = c.mailSideHtml();
  const who = (h.match(/<div class="dm-f sub whobin[\s\S]*?<\/div>/g) || []);
  assert.ok(who.length, '담당자 줄이 없습니다 — 검사 밑그림이 틀렸습니다');
  /* ⚠ 2026-08-29 부터 담당자 줄도 «끌 수 있다» — 그래서 내 줄만 빈 손잡이(ghost)이고
     나머지는 진짜 손잡이다. 자리는 둘 다 같은 폭이라 줄은 안 밀린다.
     지킬 뜻은 그대로 — 「손잡이 칸과 메뉴 칸이 있다」. */
  who.forEach(r => {
    assert.ok(/class="grip(?: ghost)?"/.test(r), '이름 앞 손잡이 자리가 없습니다 (이름이 18px 밀립니다)');
    assert.ok(/class="fmenu ghost"/.test(r), '오른쪽 메뉴 자리가 없습니다 (숫자가 21px 밀립니다)');
  });
  /* 「나」 줄은 붙박이라 끌 수 없어야 한다 — 끌어 내리면 「내 메일이 어디 갔나」가 된다 */
  who.filter(r => /meRow/.test(r)).forEach(r =>
    assert.ok(!/draggable="true"/.test(r), '「나」 줄이 끌립니다 — 맨 위 붙박이여야 합니다'));
});

test('★ 빈 자리는 «보이지 않되 자리는 차지한다» — display:none 이면 아무 소용이 없다', () => {
  assert.match(src, /\.dm-f \.ghost\{visibility:hidden/,
    '빈 자리를 visibility 로 감추지 않습니다');
  assert.ok(!/\.dm-f \.ghost\{[^}]*display:\s*none/.test(src),
    'display:none 이면 자리를 안 차지해 줄이 그대로 어긋납니다');
  assert.match(src, /\.dm-f \.ghost\{[^}]*pointer-events:none/,
    '보이지 않는 자리가 눌립니다');
});

test('★ 숫자 칸이 두 대시보드 모두 «하나»다 — 칸 수가 다르면 어차피 안 맞는다', () => {
  const c = load();
  c.state.mbDash = 'who';
  const who = (c.mailSideHtml().match(/<div class="dm-f sub whobin[\s\S]*?<\/div>/g) || []);
  who.forEach(r => {
    assert.ok(!/class="n">/.test(r),
      '담당자 줄에 전체 통수가 남아 있습니다 — 업무 칸은 안읽음 하나뿐입니다');
  });
  c.state.mbDash = 'topic';
  const topic = (c.mailSideHtml().match(/<div class="dm-f sub topicbin[\s\S]*?<\/div>/g) || []);
  topic.forEach(r => assert.ok(!/class="n">/.test(r), '업무 칸에 전체 통수가 돌아왔습니다'));
});

test('★ 아이콘이 «같은 상자·같은 굵기»다 — 이모지는 PC 마다 다르게 그려진다', () => {
  const c = load();
  assert.ok(/<svg/.test(c.mbWhoIcoSvg()) && /<svg/.test(c.mbTopicIcoSvg()),
    '아이콘을 글자로 그렸습니다');
  const sizeOf = h => (h.match(/width="(\d+)" height="(\d+)"/) || []).slice(1).join("x");
  assert.equal(sizeOf(c.mbWhoIcoSvg()), sizeOf(c.mbTopicIcoSvg()),
    '두 아이콘의 크기가 다릅니다 — 칩을 바꿀 때마다 눈이 자리를 다시 찾습니다');
  assert.notEqual(c.mbWhoIcoSvg(), c.mbTopicIcoSvg(),
    '두 아이콘이 똑같습니다 — 사람과 칸이 안 갈립니다');
  /* 이모지 담당자 아이콘이 남아 있으면 안 된다 */
  c.state.mbDash = 'who';
  const who = (c.mailSideHtml().match(/<div class="dm-f sub whobin[\s\S]*?<\/div>/g) || []);
  who.forEach(r => assert.ok(r.indexOf('\u{1F464}') < 0, '담당자 줄에 이모지가 남아 있습니다'));
});
