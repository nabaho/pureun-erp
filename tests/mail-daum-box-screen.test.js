/* 푸른 메일 — 다음메일함과 같은 차림의 메일함 화면 (대표 지시 2026-08-24)
   "캡쳐2는 다음메일함이다. 메일함을 완벽하게 똑같이 만들어달라."

   여기서 지키는 것은 «모양의 픽셀»이 아니라 «사람이 그 화면에서 잃으면 안 되는 것»이다.
   - 폴더 이름이 다음메일에서 보는 그 이름인가 (INBOX 라고 적으면 같은 칸인지 모른다)
   - 보낸 것이 든 칸에서 「받는 곳」을 보여 주는가 (자기 이름만 줄줄이면 아무것도 모른다)
   - 남의 메일에 든 스크립트를 걷어내는가 (안 걷으면 메일 한 통이 앱을 조종한다)
   - 안내줄에 적어 둔 방향키·스페이스가 실제로 되는가 (안 되면 그 줄이 거짓말이다)

   ⚠ 글자·개수를 못 박지 않는다(docs/검사-못박지-않기.md). 「받은메일함 줄이 있다」는
     보지만 「몇 번째 줄인가」는 보지 않는다. */
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

/* 메일함 덩어리를 값으로만 돌린다 — 실제 서버·화면에 붙지 않는다 */
function load(over){
  const o = over || {};
  const held = { side:null, main:null, keys:[] };
  const state = Object.assign({
    view:'mail', mailSent:'box', mbBox:'B_INBOX', tab:'card', group:'all', owner:'all',
    isAdmin:true, groups:{}, pick:{}, matPick:'', sentBox:{}, schedBox:{},
    mbQ:'', mbFilter:'', mbTab:'', mbCursor:-1, mbOpen:null
  }, o.state || {});
  const ctx = {
    console, Object, Array, String, Number, Math, JSON, RegExp, Set, Date, atob:()=>'',
    state,
    esc: s => String(s == null ? '' : s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
    Store: { mode:'demo' },
    matMailCfg: () => ({ from: o.me || '370-6@daum.net' }),
    matList: () => [], matCat: () => '', MAT_CATS_NOW: () => [], _matMeta: {},
    schedList: () => [], staffName: b => String(b || ''),
    fmtDate: () => '2026.08.24', fmtMB: n => n + 'B',
    allItems: () => ({}), allGroups: () => ({}),
    isPrivGroup: () => false, canSeeGroup: () => true,
    coList: () => [], coTagList: () => [], coFTabList: () => [], coFTabCounts: () => ({all:0,byTab:{}}),
    _coFolders: {}, _coTagHidden: {},
    toast: m => held.keys.push('toast:' + m),
    toggleSidebar(){}, openSettingsPage(){}, openMatPage(){}, openMailPage(){},
    openSentBox(){}, openSchedBox(){}, openInbox(){}, closeMailPage(){},
    openPrivateVault(){}, migrateLockedFolders(){},
    inboxBoxHtml: () => '', schedBoxHtml: () => '', sentBoxHtml: () => '', mailWriteHtml: () => '',
    wireMailWrite(){},
    pickOf: k => (state.pick[k] = state.pick[k] || {}),
    pickOn: (sel, id) => !!(sel && sel[id]),
    pickList: (sel, ids) => (ids||[]).filter(i => !!(sel && sel[i])),
    pickAllOn: (sel, ids) => !!(ids && ids.length) && ids.every(i => !!(sel && sel[i])),
    pickClear: k => { state.pick[k] = {}; },
    pickHit: (k, id) => { const s = state.pick[k] = state.pick[k]||{}; s[id] = !s[id]; held.keys.push('pick:'+id); },
    pickToggleAll(){}, pickRedraw(){},
    renderPCSide(){ }, renderMailPage(){ held.keys.push('render'); },
    document: { getElementById: () => null },
    $: () => null,
    firebase: { auth: () => ({ currentUser:null }) }
  };
  vm.createContext(ctx);
  vm.runInContext(cut('function pcItem(attrs', '\nfunction switchTab('), ctx);
  /* 덩어리 안의 let 값은 밖에서 못 만진다 — 안에서 넣어 준다 */
  vm.runInContext(
    '_mbFolders = ' + JSON.stringify(o.folders || {}) + ';' +
    '_mbMsgs = ' + JSON.stringify(o.msgs || {}) + ';' +
    '_mbMeta = { at: 1, ok: true };', ctx);
  ctx._held = held;
  /* 덩어리 안의 let 값(_mbMsgs)은 밖에서 못 만진다 — 줄 하나를 갈아 끼울 길을 둔다 */
  ctx.__setRow = (slug, uid, row) => {
    vm.runInContext('_mbMsgs[' + JSON.stringify(slug) + '][' + JSON.stringify(uid) + '] = '
      + JSON.stringify(row) + ';', ctx);
  };
  return ctx;
}

const FOLDERS = {
  B_INBOX: { path:'INBOX', name:'INBOX', kind:'inbox', order:1, total:120, unseen:4 },
  /* ⚠ 다음메일에는 이 둘이 «진짜 폴더»로 있다(실측 2026-08-25: 내게쓴편지함 400통 ·
     예약편지함 142통). 가짜 거르개로 두면 400통이 든 칸이 잡폴더로 밀려난다. */
  B_TOME:  { path:'내게쓴편지함', name:'내게쓴편지함', kind:'tome', order:2, total:400, unseen:0 },
  B_SCHED: { path:'예약편지함', name:'예약편지함', kind:'sched', order:5, total:142, unseen:0 },
  B_SENT:  { path:'보낸메일함', name:'보낸메일함', kind:'sent', order:2, total:80, unseen:0 },
  B_DRAFT: { path:'임시보관함', name:'임시보관함', kind:'drafts', order:3, total:2, unseen:0 },
  B_MINE:  { path:'INBOX.1.자문사답변', name:'1.자문사답변', kind:'custom', order:5, total:9, unseen:2 },
  B_TRASH: { path:'휴지통', name:'휴지통', kind:'trash', order:9, total:5, unseen:0 }
};
const MSGS = {
  B_INBOX: {
    '10': { u:10, f:'세무법인 한세', e:'tax@hanse.kr', t:'370-6@daum.net', tn:'푸른노무법인',
            s:'소득세 확인 부탁드립니다', d:1756000000000, r:0, g:0, a:1, z:1000 },
    '11': { u:11, f:'', e:'boss@ebi.com', t:'370-6@daum.net', tn:'푸른노무법인',
            s:'세금계산서 발행 안내', d:1756000100000, r:1, g:1, a:0, z:1000 }
  },
  B_SENT: {
    '20': { u:20, f:'푸른노무법인', e:'370-6@daum.net', t:'client@abc.co.kr', tn:'김대표',
            s:'요청하신 자료를 보내드립니다', d:1756000200000, r:1, g:0, a:2, z:1000 }
  }
};

/* ══════ 폴더 이름 ══════ */

test('★ 다음메일에서 보는 그 이름으로 적는다 — 「INBOX」라고 쓰면 같은 칸인지 모른다', () => {
  const c = load({ folders: FOLDERS, msgs: MSGS });
  assert.equal(c.mbBoxName('B_INBOX'), '받은메일함');
  assert.equal(c.mbBoxName('B_SENT'), '보낸메일함');
  assert.equal(c.mbBoxName('B_DRAFT'), '임시보관함');
  assert.equal(c.mbBoxName('B_TRASH'), '휴지통');
});

test('손으로 만든 폴더는 대표가 붙인 이름을 그대로 쓴다', () => {
  const c = load({ folders: FOLDERS, msgs: MSGS });
  assert.equal(c.mbBoxName('B_MINE'), '1.자문사답변');
});

test('합쳐 보는 칸도 이름이 있다 — 이름 없는 칸은 어디인지 알 수 없다', () => {
  const c = load({ folders: FOLDERS });
  assert.equal(c.mbBoxName('*all'), '전체메일');
  assert.equal(c.mbBoxName('*tome'), '내게쓴메일함');
});

/* ══════ 옆줄 ══════ */

test('★ 옆줄에 다음메일함의 칸들이 다 있다 — 하나라도 없으면 그 칸에 갈 길이 없다', () => {
  const c = load({ folders: FOLDERS, msgs: MSGS });
  const h = c.mailSideHtml();
  for(const nm of ['전체메일','받은메일함','내게쓴메일함','보낸메일함','임시보관함','예약메일함','내 메일함']){
    assert.ok(h.indexOf(nm) >= 0, nm + ' 줄이 없습니다');
  }
  assert.ok(h.indexOf('메일쓰기') >= 0, '메일쓰기 단추가 없습니다');
  assert.ok(h.indexOf('내게쓰기') >= 0, '내게쓰기 단추가 없습니다');
});

test('★ 숫자는 안 읽은 통수만 — 전체 통수까지 붙으면 「새 것 4통」이 그 사이에 묻힌다', () => {
  const c = load({ folders: FOLDERS, msgs: MSGS });
  const h = c.mailSideHtml();
  assert.ok(/class="nu">4</.test(h), '받은메일함의 안 읽은 4통이 안 보입니다');
  assert.ok(h.indexOf('>120<') < 0, '전체 통수가 옆줄에 적혀 있습니다');
  assert.ok(h.indexOf('>80<') < 0, '전체 통수가 옆줄에 적혀 있습니다');
});

test('★ 안읽음 셈에서 스팸함·휴지통은 뺀다 — 광고 200통이 섞이면 그 숫자가 뜻을 잃는다', () => {
  const folders = Object.assign({}, FOLDERS, {
    B_SPAM: { path:'스팸함', name:'스팸함', kind:'spam', order:8, total:200, unseen:200 },
    B_TR2:  { path:'휴지통', name:'휴지통', kind:'trash', order:9, total:5, unseen:3 }
  });
  const c = load({ folders: folders, msgs: MSGS });
  const h = c.mailSideHtml();
  /* 받은메일함 4 + 내 메일함 2 = 6 이어야 한다(스팸 200·휴지통 3 은 뺀다) */
  const m = h.match(/<em>(\d+)<\/em><span>안읽음/);
  assert.ok(m, '안읽음 셈이 없습니다');
  assert.equal(m[1], '6');
});

test('자료함으로 가는 길은 하나뿐이다 — 겹치면 다음에 한쪽만 고친다', () => {
  /* 자료함은 「푸른 도구」 안에 있다(대표 화면 2026-08-24 "불필요한 것 같은데") —
     접었을 때 0개, 펼쳤을 때 정확히 하나. */
  const shut = load({ folders: FOLDERS, msgs: MSGS });
  assert.equal(shut.mailSideHtml().split('openMatPage()').length - 1, 0);
  const open = load({ folders: FOLDERS, msgs: MSGS, state: { mbToolOpen: true } });
  assert.equal(open.mailSideHtml().split('openMatPage()').length - 1, 1);
});

test('옆줄은 스스로 맨 아래 붙박이를 붙이지 않는다 — 부르는 쪽이 붙인다', () => {
  const c = load({ folders: FOLDERS });
  assert.ok(c.mailSideHtml().indexOf('pcside-bottom') < 0);
});

/* ══════ 목록 ══════ */

test('★ 보낸 것이 든 칸에서는 「받는 곳」을 보여 준다 — 자기 이름만 줄줄이면 알 수 없다', () => {
  const c = load({ folders: FOLDERS, msgs: MSGS, state:{ mbBox:'B_SENT' } });
  const rows = c.mbVisibleRows();
  assert.equal(rows.length, 1);
  assert.equal(c.mbWho(rows[0]), '김대표');
});

test('받은 칸에서는 보낸이를 보여 주고, 이름이 없으면 주소를 쓴다', () => {
  const c = load({ folders: FOLDERS, msgs: MSGS });
  const rows = c.mbVisibleRows();
  const byUid = {}; rows.forEach(r=>{ byUid[r.u] = r; });
  assert.equal(c.mbWho(byUid[10]), '세무법인 한세');
  assert.equal(c.mbWho(byUid[11]), 'boss@ebi.com');
});

test('새 것이 위로 온다 — 받은 때 차례', () => {
  const c = load({ folders: FOLDERS, msgs: MSGS });
  const rows = c.mbVisibleRows();
  assert.ok(Number(rows[0].d) >= Number(rows[rows.length-1].d));
});

test('★ 거르개·갈래·찾기가 «같은 목록»을 만든다 — 따로 세면 개수가 어긋난다', () => {
  const c = load({ folders: FOLDERS, msgs: MSGS });
  assert.deepEqual(c.mbVisibleKeys(), c.mbVisibleRows().map(v=>v._key));
  c.state.mbFilter = 'unread';
  assert.deepEqual(c.mbVisibleKeys(), c.mbVisibleRows().map(v=>v._key));
  assert.ok(c.mbVisibleRows().every(v=>!Number(v.r||0)));
  c.state.mbFilter = 'att';
  assert.ok(c.mbVisibleRows().every(v=>Number(v.a||0)));
  c.state.mbFilter = 'flag';
  assert.ok(c.mbVisibleRows().every(v=>Number(v.g||0)));
  c.state.mbFilter = '';
  c.state.mbQ = '한세';
  assert.equal(c.mbVisibleRows().length, 1);
});

test('전체메일은 폴더를 합쳐 보여 준다', () => {
  const c = load({ folders: FOLDERS, msgs: MSGS, state:{ mbBox:'*all' } });
  assert.equal(c.mbVisibleRows().length, 3);
});

test('내게쓴메일함은 내가 나에게 보낸 것만 — 아니면 받은 메일이 다 딸려 온다', () => {
  const msgs = { B_INBOX: { '30': { u:30, f:'푸른노무법인', e:'370-6@daum.net',
    t:'370-6@daum.net', s:'메모', d:1, r:1, g:0, a:0 },
    '31': { u:31, f:'남', e:'other@x.com', t:'370-6@daum.net', s:'문의', d:2, r:1, g:0, a:0 } } };
  const c = load({ folders: FOLDERS, msgs: msgs, state:{ mbBox:'*tome' } });
  const rows = c.mbVisibleRows();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].u, 30);
});

/* ══════ 갈래 단추줄 — 없앴다 ══════ */

test('★ 갈래 단추줄(청구서·쇼핑·소셜·프로모션)이 없다 — 대표 화면 2026-08-24', () => {
  /* "이부분 박스 모두 없애자". 단추줄만 걷고 판정 함수를 남겨 두면 다음 사람이
     「쓰는 줄」 알고 고친다 — 그래서 mbClassify 도 함께 지웠다. */
  const c = load({ folders: FOLDERS, msgs: MSGS });
  const h = c.mbBoxHtml();
  assert.ok(h.indexOf('dm-tabs') < 0, '갈래 단추줄이 남아 있다');
  ['청구서', '쇼핑', '소셜', '프로모션'].forEach((w) => {
    assert.ok(h.indexOf('>' + w + '<') < 0, w + ' 단추가 남아 있다');
  });
  assert.equal(typeof c.mbClassify, 'undefined', '안 쓰는 판정 함수가 남아 있다');
  assert.ok(src.indexOf('.dm-tabs{') < 0, '안 쓰는 모양(CSS)이 남아 있다');
});

/* ══════ 시각 ══════ */

test('★ 날짜와 시각을 함께 적는다 — 하루 스무 통을 보내는 자리라 시각이 곧 순서다', () => {
  /* 대표 지시 2026-08-25: 「보낸메일함에 날짜 시간이 상세히 있어야 한다」.
     예전에는 오늘 것은 시각만, 지난 것은 날짜만 적어 「그날 몇 시」를 알 수 없었다. */
  const c = load({ folders: FOLDERS });
  const now = new Date();
  now.setHours(9, 5, 0, 0);
  assert.match(c.mbTime(now.getTime()), /^\d\d\.\d\d \d\d:\d\d$/, '오늘 것에 날짜가 없다');
  const old = new Date(now.getTime());
  old.setFullYear(old.getFullYear() - 1);
  assert.match(c.mbTime(old.getTime()), /^\d\d\.\d\d\.\d\d \d\d:\d\d$/, '지난해 것에 연도가 없다');
  assert.equal(c.mbTime(0), '', '날짜를 모르면 비워 둔다');
});

/* ══════ 남의 HTML ══════ */

test('★ 메일 본문의 스크립트를 걷어낸다 — 안 걷으면 메일 한 통이 이 앱을 조종한다', () => {
  const c = load({ folders: FOLDERS });
  const dirty = '<p>안녕</p><script>steal()</script>'
    + '<img src=x onerror="steal()">'
    + '<a href="javascript:steal()">링크</a>'
    + '<iframe src="http://evil"></iframe>';
  const clean = c.mbCleanHtml(dirty);
  assert.ok(clean.indexOf('script') < 0, 'script 가 남아 있습니다');
  assert.ok(!/onerror/i.test(clean), '이벤트 속성이 남아 있습니다');
  assert.ok(!/javascript:/i.test(clean), 'javascript: 주소가 남아 있습니다');
  assert.ok(!/<iframe/i.test(clean), 'iframe 이 남아 있습니다');
  assert.ok(clean.indexOf('안녕') >= 0, '본문 글까지 지워졌습니다');
});

/* ══════ 방향키 · 스페이스 ══════
   목록 위 안내줄에 "방향키로 이동, 스페이스로 선택"이라고 적혀 있다. */

test('★ 안내줄에 적어 둔 방향키가 실제로 움직인다', () => {
  const c = load({ folders: FOLDERS, msgs: MSGS });
  const key = (k, tag) => c.mbKeyNav({ key:k, target:{ tagName: tag||'DIV' }, preventDefault(){} });
  key('ArrowDown');
  assert.equal(c.state.mbCursor, 0);
  key('ArrowDown');
  assert.equal(c.state.mbCursor, 1);
  key('ArrowUp');
  assert.equal(c.state.mbCursor, 0);
});

test('★ 스페이스로 고른다 — 짚어 둔 줄이 고른 것이 된다', () => {
  const c = load({ folders: FOLDERS, msgs: MSGS });
  const key = k => c.mbKeyNav({ key:k, target:{ tagName:'DIV' }, preventDefault(){} });
  key('ArrowDown');
  key(' ');
  assert.ok(c._held.keys.some(x=>x.indexOf('pick:') === 0), '스페이스가 고르지 못했습니다');
});

test('★ 글자 칸에 손이 가 있으면 아무것도 하지 않는다 — 검색어에 빈칸을 못 넣게 된다', () => {
  const c = load({ folders: FOLDERS, msgs: MSGS });
  let blocked = true;
  c.mbKeyNav({ key:' ', target:{ tagName:'INPUT' }, preventDefault(){ blocked = false; } });
  assert.ok(blocked, '찾기 칸에서 스페이스를 먹었습니다');
  assert.equal(c.state.mbCursor, -1);
});

test('메일 화면이 아니면 방향키를 가로채지 않는다', () => {
  const c = load({ folders: FOLDERS, msgs: MSGS, state:{ view:'list', mailSent:false } });
  let taken = false;
  c.mbKeyNav({ key:'ArrowDown', target:{ tagName:'DIV' }, preventDefault(){ taken = true; } });
  assert.equal(taken, false, '명함 목록에서 방향키를 가로챘습니다');
});

/* ══════ 고른 것 ══════ */

test('☐ 를 안 눌렀어도 짚어 둔 줄을 고른 것으로 본다 — 「고른 것이 없습니다」로 막지 않는다', () => {
  const c = load({ folders: FOLDERS, msgs: MSGS, state:{ mbCursor:0 } });
  assert.equal(c.mbPicked().length, 1);
});

/* ══════ 옆줄 손질 (대표 화면 2026-08-25) ══════ */

test('★ 옆줄 위 덩어리는 틀고정 — 폴더를 내려도 [메일쓰기]가 사라지지 않는다', () => {
  /* 폴더가 스물여덟이라 아래로 내리면 로고·내 정보·메일쓰기가 화면 밖으로 나갔다. */
  const c = load({ folders: FOLDERS, msgs: MSGS });
  assert.ok(c.mailSideHtml().indexOf('dm-fix') > 0, '붙박이 덩어리가 없다');
  assert.match(src, /\.dm-fix\{[^}]*position:sticky/, '붙박이 규칙이 없다');
  assert.match(src, /\.dm-fix\{[^}]*background:#fff/,
    '바탕을 안 칠하면 밑으로 지나가는 폴더 글자가 비쳐 겹친다');
});

test('★ 주소만으로는 누구인지 모른다 — 명함첩에서 이름·회사를 찾아 붙인다', () => {
  const c = load({ folders: FOLDERS, msgs: MSGS });
  c.allItems = () => ({
    a: { id:'a', email:'huamstoneceo@gmail.com', name:'김대표', company:'화암스톤' },
    b: { id:'b', email:'tax@hanse.kr', name:'박세무', company:'' }
  });
  assert.equal(c.mbNameOf('huamstoneceo@gmail.com'), '김대표 (화암스톤)');
  assert.equal(c.mbNameOf('tax@hanse.kr'), '박세무', '회사가 없으면 이름만');
  assert.equal(c.mbNameOf('none@x.com', '메일이 알려준 이름'), '메일이 알려준 이름',
    '명함에 없으면 메일이 알려 준 이름을 쓴다');
  assert.equal(c.mbNameOf('none@x.com', ''), 'none@x.com', '그것도 없으면 주소를 쓴다');
});

test('받는 곳이 여럿이면 모두 이름으로 적는다', () => {
  const c = load({ folders: FOLDERS, msgs: MSGS });
  c.allItems = () => ({ a: { id:'a', email:'a@x.com', name:'가가', company:'가나' } });
  const got = c.mbNamesOf('a@x.com, b@y.com', '');
  assert.match(got, /가가 \(가나\)/);
  assert.match(got, /b@y\.com/, '명함에 없는 사람이 빠지면 안 된다');
  assert.equal(c.mbNamesOf('', ''), '');
});

test('★ 보낸메일함 줄에도 받는 사람 이름이 나온다 — 주소만 있으면 누구인지 모른다', () => {
  const c = load({ folders: FOLDERS, msgs: MSGS, state:{ mbBox:'B_SENT' } });
  c.allItems = () => ({ a: { id:'a', email:'client@abc.co.kr', name:'김대표', company:'에이비씨' } });
  const rows = c.mbVisibleRows();
  assert.equal(c.mbWho(rows[0]), '김대표 (에이비씨)');
});

test('★ 폴더 손보는 창은 «누른 자리 옆»에 뜬다 — 브라우저 알림창으로 올라가지 않는다', () => {
  /* 대표 화면 2026-08-25: prompt 가 화면 맨 위에 떠서, 누른 자리에서 멀고
     글을 읽고 번호를 적어야 했다. */
  const c = load({ folders: FOLDERS, msgs: MSGS });
  const held = { html:'', shown:false };
  c.$ = (id) => (id === 'folderMenu'
    ? { set innerHTML(v){ held.html = v; }, get innerHTML(){ return held.html; },
        style:{ set display(v){ held.shown = (v === 'block'); } }, offsetHeight:160,
        contains:()=>false }
    : null);
  c.window = { innerWidth: 1600, innerHeight: 900 };
  c.setTimeout = () => {};
  c.mbFolderMenu('B_MINE', { clientX: 120, clientY: 300 });
  assert.ok(held.shown, '창이 안 떴다');
  assert.match(held.html, /이름 바꾸기/);
  assert.match(held.html, /아래에 새 폴더/);
  assert.match(held.html, /폴더 지우기/);
  /* 「번호를 적어 주세요」 같은 글이 아니라 «눌러서 고르는» 것이어야 한다 */
  assert.ok(held.html.indexOf('번호를 적어') < 0, '아직 번호를 적으라고 한다');
  assert.match(held.html, /onclick=/, '눌러서 고를 수 없다');
});

test('★ 「이동」도 폴더를 늘어놓고 눌러서 고른다 — 번호를 세어 적지 않는다', () => {
  /* 폴더가 스물여덟이라 알림창 목록이 화면을 넘겼고, 세어 가며 번호를 적어야 했다. */
  const c = load({ folders: FOLDERS, msgs: MSGS });
  const held = { html:'' };
  c.$ = (id) => (id === 'folderMenu'
    ? { set innerHTML(v){ held.html = v; }, get innerHTML(){ return held.html; },
        style:{}, offsetHeight:200, contains:()=>false }
    : null);
  c.window = { innerWidth: 1600, innerHeight: 900 };
  c.setTimeout = () => {};
  c.state.mbCursor = 0;                      // 한 통을 짚어 둔 상태
  c.mbMove({ clientX: 500, clientY: 200 });
  assert.match(held.html, /mbMovePicked\(/, '눌러서 고를 수 없다');
  assert.match(held.html, /1\.자문사답변/, '옮길 폴더가 안 나온다');
  assert.ok(held.html.indexOf('번호를 적어') < 0, '아직 번호를 적으라고 한다');
  assert.match(src, /#folderMenu \.fmlist\{[^}]*overflow-y:auto/,
    '폴더가 많으면 창을 넘긴다 — 창 안에서 굴러가야 한다');
});

test('이름 바꾸기·새 폴더는 그 창 «안에서» 끝난다 — 창을 두 번 여닫지 않는다', () => {
  const c = load({ folders: FOLDERS, msgs: MSGS });
  const held = { html:'' };
  c.$ = (id) => (id === 'folderMenu'
    ? { set innerHTML(v){ held.html = v; }, get innerHTML(){ return held.html; },
        style:{}, offsetHeight:160, contains:()=>false }
    : null);
  c.window = { innerWidth: 1600, innerHeight: 900 };
  c.setTimeout = () => {};
  c.mbMenuRename('B_MINE');
  assert.match(held.html, /id="mbFName"/, '이름을 적을 칸이 없다');
  assert.match(held.html, /mbDoRename/, '바꾸는 단추가 없다');
});

test('★ 폴더를 끌어서 차례를 옮길 수 있다 — 차례는 «우리 쪽에만» 둔다', () => {
  /* ⚠ 다음메일(IMAP)에는 폴더 차례라는 것이 없다 — 서버는 늘 이름순으로 준다. */
  const c = load({ folders: FOLDERS, msgs: MSGS });
  const h = c.mailSideHtml();
  assert.match(h, /draggable="true"/, '끌 수 없다');
  assert.ok(h.indexOf('mbDragStart(') > 0 && h.indexOf('mbDrop(') > 0, '끌어 놓는 길이 없다');
  assert.ok(h.indexOf('grip') > 0, '잡을 손잡이가 없다');
});

test('★ 차례를 옮기면 그 자리에 들어간다 — 옮겼는데 제자리면 아무도 안 믿는다', () => {
  const folders = {};
  ['가','나','다','라'].forEach((n,i)=>{
    folders['F'+i] = { path:n, name:n, kind:'custom', order:7, total:1, unseen:0 };
  });
  const c = load({ folders: folders });
  c.firebase = { database: () => ({ ref: () => ({ set: () => Promise.resolve(),
    once: () => Promise.resolve({ val: () => ({}) }) }) }) };
  /* ⚠ 이 덩어리 안에는 «진짜» renderPCSide 가 들어 있다(pcItem…switchTab 을 통째로 돌린다).
     그것이 $('pcSide') 에 그리므로 받아 줄 자리를 둔다 — 없으면 여기서 넘어진다. */
  c.$ = () => ({ set innerHTML(v){}, get innerHTML(){ return ''; } });
  const before = c.mbMineTree().map(f=>f.name);
  assert.deepEqual(before, ['가','나','다','라'], '처음에는 이름순');
  /* 「라」를 「가」 앞으로 */
  c.state.mbDrag = 'F3';
  c.mbDrop({ preventDefault(){} }, 'F0', null);
  assert.deepEqual(c.mbMineTree().map(f=>f.name), ['라','가','나','다'],
    '끌어다 놓은 자리에 안 들어갔다');
});

/* ══════ 답장 · 중요(★) · 읽음 (대표 지시 2026-08-25 「내부적으로 기능이 부족하다」) ══════ */

test('★ 답장·전체답장이 있다 — 메일 앱에서 가장 많이 쓰는 자리인데 없었다', () => {
  const c = load({ folders: FOLDERS, msgs: MSGS });
  const h = c.mbBoxHtml();
  assert.ok(h.indexOf('mbReply(false)') > 0, '답장이 없다');
  assert.ok(h.indexOf('mbReply(true)') > 0, '전체답장이 없다');
});

test('★ 별을 누를 수 있다 — 보이는데 안 눌리면 고장으로 읽힌다', () => {
  const c = load({ folders: FOLDERS, msgs: MSGS });
  assert.ok(c.mbBoxHtml().indexOf('mbStar(') > 0, '별에 누를 길이 없다');
});

test('★ 읽음을 되돌릴 수 있다 — 열면 읽음이 되는데 되돌릴 길이 없었다', () => {
  const c = load({ folders: FOLDERS, msgs: MSGS });
  assert.ok(c.mbBoxHtml().indexOf('mbReadMark(false)') > 0, '안읽음으로 되돌릴 길이 없다');
});

test('★ 답장은 「RE:」를 겹쳐 붙이지 않는다 — RE: RE: RE: 가 쌓인다', () => {
  const c = load({ folders: FOLDERS, msgs: MSGS });
  let got = null;
  c.openMailPage = (p) => { got = p; };
  c.state.mbOpen = { slug:'B_INBOX', uid:'10', text:'원래 본문입니다' };
  c.mbReply(false);
  assert.ok(got, '쓰기 화면을 안 열었다');
  assert.equal(got.subject, 'RE: 소득세 확인 부탁드립니다');
  /* 이미 RE: 가 붙은 것에는 더 안 붙인다 */
  c.state.mbOpen = { slug:'B_INBOX', uid:'11', text:'x' };
  c.mbReply(false);
  assert.equal(got.subject, '세금계산서 발행 안내'.replace(/^/, 'RE: '));
});

test('★ 답장에 원래 글을 인용해 넣는다 — 인용이 없으면 받는 쪽이 무슨 이야기인지 모른다', () => {
  const c = load({ folders: FOLDERS, msgs: MSGS });
  let got = null;
  c.openMailPage = (p) => { got = p; };
  c.state.mbOpen = { slug:'B_INBOX', uid:'10', text:'원래 본문입니다' };
  c.mbReply(false);
  assert.match(got.body, /> 원래 본문입니다/, '원래 글이 인용되지 않았다');
  assert.equal(got.to, 'tax@hanse.kr', '보낸 사람에게 가지 않는다');
});

test('★ 전체답장은 나를 빼고 나머지에게 간다 — 나에게 또 보내지 않는다', () => {
  const c = load({ folders: FOLDERS, msgs: MSGS, me: '370-6@daum.net' });
  let got = null;
  c.openMailPage = (p) => { got = p; };
  /* 받는 곳에 나와 남이 함께 있다 */
  c.state.mbOpen = { slug:'B_INBOX', uid:'10', text:'x' };
  const row = { u:10, f:'세무법인 한세', e:'tax@hanse.kr',
    t:'370-6@daum.net,other@x.com', s:'제목', d:1 };
  c.__setRow('B_INBOX', '10', row);
  c.mbReply(true);
  assert.equal(got.cc.indexOf('370-6@daum.net'), -1, '나에게 또 보내고 있다');
  assert.ok(got.cc.indexOf('other@x.com') >= 0, '함께 받던 사람이 빠졌다');
});

/* ══════ 내 메일함 — 만들기·이름 바꾸기·지우기 (대표 지시 2026-08-25) ══════ */

test('★ 폴더마다 손볼 자리(⋮)가 있다 — 예전에는 「다음메일에서 하십시오」로 막았다', () => {
  const c = load({ folders: FOLDERS, msgs: MSGS });
  const h = c.mailSideHtml();
  assert.ok(h.indexOf('mbFolderMenu(') > 0, '폴더를 손볼 길이 없다');
  assert.ok(h.indexOf('mbNewFolder(') > 0, '새 폴더를 만들 길이 없다');
  assert.ok(h.indexOf('mbWhereToMake') < 0, '「다음메일에서 하십시오」로 막던 것이 남아 있다');
});

test('★ 하위 폴더는 어버이 밑에 들여써서 나온다 — 층이 안 보이면 왜 있는지 모른다', () => {
  const folders = Object.assign({}, FOLDERS, {
    B_P: { path:'1.자문사답변', name:'1.자문사답변', kind:'custom', order:7, total:9, unseen:0, delim:'/' },
    B_C: { path:'1.자문사답변/계약', name:'계약', kind:'custom', order:7, total:2, unseen:0, delim:'/' }
  });
  const c = load({ folders: folders, msgs: MSGS });
  const tree = c.mbMineTree();
  const p = tree.find(f=>f.path === '1.자문사답변');
  const ch = tree.find(f=>f.path === '1.자문사답변/계약');
  assert.equal(p._depth, 0);
  assert.equal(ch._depth, 1, '하위 폴더가 층으로 안 나온다');
  assert.equal(ch._leaf, '계약', '줄에는 마지막 마디만 적는다');
  assert.ok(tree.indexOf(p) < tree.indexOf(ch), '어버이가 자식보다 먼저 와야 한다');
});

test('이름의 점을 층으로 읽지 않는다 — 대표 폴더가 「1.자문사답변」이다', () => {
  const c = load({ folders: FOLDERS, msgs: MSGS });
  const one = c.mbMineTree().find(f=>f.path === 'INBOX.1.자문사답변');
  if(one) assert.equal(one._depth, 0, '이름의 점을 층으로 읽었다');
});

test('구분자는 서버가 알려 준 것을 쓴다 — 못 박으면 다른 계정에서 엉뚱한 폴더가 생긴다', () => {
  const c = load({ folders: { A: { path:'가', name:'가', kind:'custom', order:7, delim:'.' } } });
  assert.equal(c.mbDelim(), '.');
  const c2 = load({ folders: { A: { path:'가', name:'가', kind:'custom', order:7 } } });
  assert.equal(c2.mbDelim(), '', '안 알려 주면 빈 값 — 층을 못 만든다고 말해야 한다');
});

/* ══════ 몇 통씩 보기 (대표 지시 2026-08-25) ══════ */

test('★ 몇 통씩 볼지 고르는 칸이 있다 — 50·100 등', () => {
  const c = load({ folders: FOLDERS, msgs: MSGS });
  const h = c.mbBoxHtml();
  assert.ok(h.indexOf('mbSetPageSize(') > 0, '고르는 칸이 없다');
  [50, 100].forEach((n) => {
    assert.ok(h.indexOf('>' + n + '개씩<') > 0, n + '개씩 이 없다');
  });
});

test('★ 고른 수가 «보이는 수»이자 «받아 오는 수»다 — 따로 두면 안 보이는 곳에서 요금이 나간다', () => {
  const c = load({ folders: FOLDERS, msgs: MSGS });
  assert.equal(c.mbPageSize(), 100, '고르지 않았으면 100통');
  c.state.mbSize = 50;
  assert.equal(c.mbPageSize(), 50);
  c.state.mbSize = 7;                       // 없는 값
  assert.equal(c.mbPageSize(), 100, '없는 값이면 기본값으로 되돌린다');
});

test('★ 이 칸에 모두 몇 통인지 함께 보여 준다 — 보이는 수만으로는 「더 있나」를 모른다', () => {
  const c = load({ folders: FOLDERS, msgs: MSGS });
  const h = c.mbBoxHtml();
  assert.match(h, /통 보는 중/, '몇 통 보고 있는지 안 나온다');
  /* 받은메일함은 모두 120통인데 자료는 두 줄뿐이다 — 「모두」가 나와야 한다 */
  assert.match(h, /이 칸에 모두 120통/, '이 칸의 전체 통수가 안 나온다');
});

test('★ 남은 것이 없으면 「더 보기」를 안 보여 준다 — 눌러도 아무 일이 없으면 고장으로 읽힌다', () => {
  const folders = Object.assign({}, FOLDERS, {
    B_INBOX: { path:'INBOX', name:'INBOX', kind:'inbox', order:1, total:2, unseen:0 }
  });
  const c = load({ folders: folders, msgs: MSGS });
  assert.ok(c.mbBoxHtml().indexOf('mbMore()') < 0, '다 보고 있는데 더 보기가 있다');
  const c2 = load({ folders: FOLDERS, msgs: MSGS });     // 모두 120통 · 손에는 2통
  assert.ok(c2.mbBoxHtml().indexOf('mbMore()') > 0, '남았는데 더 보기가 없다');
});

test('전체메일은 폴더들의 통수를 합쳐 센다', () => {
  const c = load({ folders: FOLDERS, msgs: MSGS, state: { mbBox: '*all' } });
  const sum = Object.values(FOLDERS).reduce((s, f) => s + f.total, 0);
  assert.equal(c.mbBoxTotal(), sum);
});

/* ══════ 폰 — 다음메일 «앱»과 같은 차림 (대표 화면 2026-08-24) ══════
   "폰에서 화면은 캡쳐2,3 과 똑같이 만들어달라."
   여기서 지키는 것은 «앱에서 보던 것이 폰에서도 그대로 있는가»다. */

test('★ 폰 목록에 앱의 그 줄들이 있다 — 얼굴딱지·보낸이·시각·제목', () => {
  const c = load({ folders: FOLDERS, msgs: MSGS });
  const h = c.mbMobileHtml();
  assert.ok(h.indexOf('dmm-av') > 0, '얼굴딱지가 없다');
  assert.ok(h.indexOf('dmm-l1') > 0 && h.indexOf('dmm-l2') > 0, '보낸이·제목 줄이 없다');
  assert.ok(h.indexOf('세무법인 한세') > 0, '보낸이가 안 나온다');
  assert.match(h, /오전 |오후 |월 \d+일|\d{4}\./, '시각이 앱 차림이 아니다');
});

test('★ 폰 맨 위 줄 — ☰ · 칸 이름 · 새로고침 · 고르기 · 찾기', () => {
  const c = load({ folders: FOLDERS, msgs: MSGS });
  const h = c.mbMobileHtml();
  assert.ok(h.indexOf('mbDrawer(true)') > 0, '서랍을 여는 ☰ 가 없다');
  assert.ok(h.indexOf('받은메일함') > 0, '어느 칸인지 안 나온다');
  assert.ok(h.indexOf('mbPickMode()') > 0, '고르기가 없다');
  assert.ok(h.indexOf('mbFindToggle()') > 0, '찾기가 없다');
  assert.ok(h.indexOf('dmm-fab') > 0, '메일 쓰기 단추가 없다');
});

test('★ 폰 서랍에 앱의 칸이 다 있다 — 하나라도 없으면 폰에서 그 칸에 갈 길이 없다', () => {
  const c = load({ folders: FOLDERS, msgs: MSGS });
  const h = c.mbDrawerHtml();
  ['전체메일','받은메일함','내게쓴메일함','보낸메일함','임시보관함','예약메일함','내 메일함']
    .forEach((nm) => assert.ok(h.indexOf(nm) > 0, nm + ' 이 서랍에 없다'));
  assert.ok(h.indexOf('내게쓰기') > 0, '내게쓴메일함 옆 딱지가 없다');
  assert.ok(h.indexOf('수신확인') > 0, '보낸메일함 옆 딱지가 없다');
  assert.ok(h.indexOf('안읽음') > 0 && h.indexOf('중요') > 0 && h.indexOf('첨부') > 0,
    '안읽음·중요·첨부 줄이 없다');
});

test('★ 폰 서랍 맨 아래로 나갈 길이 남아 있다 — 없으면 메일함에 갇힌다', () => {
  /* 폰 메일함은 화면을 통째로 덮는다(위치 고정). 그래서 나갈 길이 서랍에만 있다. */
  const c = load({ folders: FOLDERS, msgs: MSGS });
  const h = c.mbDrawerHtml();
  assert.ok(h.indexOf('closeMailPage()') > 0, '기업정보함으로 나갈 길이 없다');
  assert.ok(h.indexOf('openSettingsPage()') > 0, '환경설정으로 갈 길이 없다');
  assert.ok(h.indexOf('openMatPage()') > 0, '자료함으로 갈 길이 없다');
});

test('고르기 모드에서는 네모가 나오고 쓰기 단추는 숨는다 — 앱과 같다', () => {
  const c = load({ folders: FOLDERS, msgs: MSGS, state: { mbPickMode: true } });
  const h = c.mbMobileHtml();
  assert.ok(h.indexOf('dmm-chk') > 0, '고르는 네모가 없다');
  assert.ok(h.indexOf('dmm-fab') < 0, '고르는 중에 쓰기 단추가 남아 있다');
  assert.ok(h.indexOf('mbTrash()') > 0, '고른 것을 휴지통으로 옮길 길이 없다');
});

test('★ 얼굴딱지 색은 사람마다 늘 같다 — 그릴 때마다 바뀌면 눈이 붙잡을 것이 없다', () => {
  const c = load({ folders: FOLDERS });
  assert.equal(c.dmmFaceColor('세무법인 한세'), c.dmmFaceColor('세무법인 한세'));
  assert.match(c.dmmFaceColor('아무개'), /^#[0-9a-f]{6}$/);
  /* ⚠ 「두 이름은 색이 달라야 한다」로 못 박지 않는다 — 색이 열두 가지뿐이라 어떤 짝은
     반드시 겹친다. 볼 것은 «고르게 흩어지는가»다. */
  const names = ['세무법인 한세','윤병수회계사무소','김현아','유문경','정곤영','심아람',
                 'LUNA LAB','이혜원','우명진','효성에프엠에스','충남북부상공회의소','이피아관리팀'];
  const kinds = new Set(names.map((n) => c.dmmFaceColor(n)));
  assert.ok(kinds.size >= 5, '열두 사람이 색 ' + kinds.size + '가지로만 나온다 — 너무 뭉친다');
});

test('얼굴에 넣을 글자 — 한글은 첫 글자, 영문은 대문자', () => {
  const c = load({ folders: FOLDERS });
  assert.equal(c.dmmInitial('세무법인 한세'), '세');
  assert.equal(c.dmmInitial('babylawyer@hanmail.net'), 'B');
  assert.equal(c.dmmInitial('"이혜원"'), '이');
  assert.equal(c.dmmInitial(''), '?');
});

test('★ 폰 시각 — 오늘은 오전/오후 시:분, 올해는 월·일', () => {
  const c = load({ folders: FOLDERS });
  const t = new Date(); t.setHours(18, 32, 0, 0);
  assert.equal(c.dmmTime(t.getTime()), '오후 6:32');
  const m = new Date(t.getTime()); m.setHours(9, 5, 0, 0);
  assert.equal(c.dmmTime(m.getTime()), '오전 9:05');
  const old = new Date(t.getTime()); old.setMonth(old.getMonth() === 0 ? 11 : old.getMonth() - 1);
  assert.match(c.dmmTime(old.getTime()), /월 \d+일|\d{4}\./);
  assert.equal(c.dmmTime(0), '');
});

/* ══════ 화면 갈림길 ══════ */

test('★ PC 와 폰이 «둘 다» 메일함을 그린다 — 한쪽만 고치면 그쪽에서만 안 보인다', () => {
  /* 2026-08-24: 폰은 «앱과 같은 차림»을 따로 쓴다(mbMobileHtml) — 다음메일의 PC 와 폰이
     아예 다르게 생겼기 때문이다. 자료는 한 벌 그대로 쓰므로(mbVisibleRows) 목록 규칙을
     고치면 두 화면이 함께 따라온다. 여기서 지키는 것은 «두 쪽 다 그린다»는 사실이다. */
  const pc = cut('function renderMailPage()', '\n/* ── 폰 메일 화면 ──');
  assert.match(pc, /mailSent==='box' \? mbBoxHtml\(\)/, 'PC 가 메일함을 안 그립니다');
  const ph = cut('function renderMailMobile()', '\n/* ── 쓰기 화면 ── */');
  assert.match(ph, /mailSent==='box'/, '폰이 메일함을 안 그립니다');
  assert.match(ph, /mbMobileHtml\(\)/, '폰이 메일함을 안 그립니다');
});

test('★ 서버에 붙는 주소는 메일 함수들과 같은 리전이다 — 다르면 통째로 404 다', () => {
  assert.match(src, /const MB_FN\s*=\s*'https:\/\/asia-northeast3-pureun-erp\.cloudfunctions\.net\//);
  for(const fn of ['pullMailbox','readMailMessage','readMailAttachment','moveMailMessages']){
    assert.ok(src.indexOf("MB_FN+'" + fn + "'") >= 0, fn + ' 을 부르는 곳이 없습니다');
  }
});

test('★ 목록은 once 로만 읽는다 — 같은 자리에 on() 을 걸면 첫 값을 두 번 받는다(요금)', () => {
  const box = cut('const MB_ROOT', 'function mbToggleMine');
  assert.ok(box.indexOf(".on('value'") < 0, '구독을 걸고 있습니다');
  assert.ok(box.indexOf(".once('value')") > 0, '읽는 곳이 없습니다');
});

test('★ 그리는 함수는 자료를 가져오지 않는다 — 다시 그릴 때마다 한 번씩 더 붙는다', () => {
  const side = cut('function mailSideHtml()', '\nfunction mbToggleMine');
  assert.ok(side.indexOf('loadMailFolders') < 0, '옆줄을 그리면서 서버에 붙습니다');
  assert.ok(side.indexOf('firebase.database') < 0, '옆줄을 그리면서 서버에 붙습니다');
});
