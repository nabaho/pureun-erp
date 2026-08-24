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
  return ctx;
}

const FOLDERS = {
  B_INBOX: { path:'INBOX', name:'INBOX', kind:'inbox', order:1, total:120, unseen:4 },
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
  const c = load({ folders: FOLDERS, msgs: MSGS });
  const h = c.mailSideHtml();
  assert.equal(h.split('openMatPage()').length - 1, 1);
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

/* ══════ 갈래 나누기 (청구서·쇼핑·소셜·프로모션) ══════ */

test('낱말로 갈래를 짚는다 — 못 맞히면 어느 갈래도 아니다(아무 데나 밀어 넣지 않는다)', () => {
  const c = load({ folders: FOLDERS });
  assert.equal(c.mbClassify({ s:'세금계산서 발행 안내' }), 'bill');
  assert.equal(c.mbClassify({ s:'주문이 배송되었습니다' }), 'shop');
  assert.equal(c.mbClassify({ s:'카페 새 댓글 알림' }), 'social');
  assert.equal(c.mbClassify({ s:'여름 특가 이벤트' }), 'promo');
  assert.equal(c.mbClassify({ s:'퇴직금 산정 내역서 송부' }), '');
});

/* ══════ 시각 ══════ */

test('오늘 온 것은 시:분, 지난 것은 날짜 — 다음메일과 같은 결', () => {
  const c = load({ folders: FOLDERS });
  const now = new Date();
  now.setHours(9, 5, 0, 0);
  assert.match(c.mbTime(now.getTime()), /^\d\d:\d\d$/);
  const old = new Date(now.getTime());
  old.setMonth(old.getMonth() === 0 ? 11 : old.getMonth() - 1);
  assert.ok(!/^\d\d:\d\d$/.test(c.mbTime(old.getTime())), '지난 달 것이 시:분으로 나옵니다');
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

/* ══════ 화면 갈림길 ══════ */

test('★ PC 와 폰이 «둘 다» 메일함을 그린다 — 한쪽만 고치면 그쪽에서만 안 보인다', () => {
  const pc = cut('function renderMailPage()', '\n/* ── 폰 메일 화면 ──');
  assert.match(pc, /mailSent==='box' \? mbBoxHtml\(\)/, 'PC 가 메일함을 안 그립니다');
  const ph = cut('function renderMailMobile()', '\n/* ── 쓰기 화면 ── */');
  assert.match(ph, /mailSent==='box' \? mbBoxHtml\(\)/, '폰이 메일함을 안 그립니다');
  assert.match(ph, /openMailBox\(/, '폰에 메일함으로 가는 길이 없습니다');
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
