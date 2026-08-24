/* 옆줄 맨 아래 붙박이(⚙️ 환경설정 · 🔒 개인 폴더 · ⚠ 옛 잠금 폴더)는
   **어느 화면에서든** 그려져야 한다.

   대표 보고 2026-08-17: "기업상세 클릭하니 환경설정 사라졌다."
   까닭 — renderPCSide 는 맨 끝에서 한 번만 그 덩어리를 붙였는데, 기업 상세와
   메일(자료함 포함)은 그보다 먼저 `$('pcSide').innerHTML = h; return;` 으로 끝나
   그 자리에 닿지 못했다. 그 두 화면에서는 설정으로 가는 길이 아예 없어져,
   명함 목록으로 되돌아가야만 환경설정을 열 수 있었다.

   ★ 여기서 못 박는 것
     ① 화면(state.view)을 하나하나 **실제로 돌려** 붙박이가 나오는지 본다
        (글자가 소스에 있나가 아니라, 그 화면이 내놓는 HTML 에 있나를 본다)
     ② 앞으로 누가 갈림길을 하나 더 만들어도 붙박이를 빠뜨리면 걸린다
   실행: node --test tests/cards-side-bottom.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

/* 줄바꿈을 하나로 맞춘다 — 파일은 CRLF 라 '\n' 로 찾으면 안 걸린다 */
const src = fs.readFileSync(path.join(__dirname, '..', 'pu-cards.html'), 'utf8').replace(/\r\n/g, '\n');

/* 이름 붙은 시작·끝 표시로만 자른다 — 글자 수로 자르면 옆 코드가 자랄 때 조용히 어긋난다 */
function cut(from, to){
  const i = src.indexOf(from); assert.ok(i >= 0, '못 찾음: ' + from);
  const j = src.indexOf(to, i); assert.ok(j > i, '끝을 못 찾음: ' + to);
  return src.slice(i, j);
}
function sideFn(){
  const at = src.indexOf('function renderPCSide');
  assert.ok(at > 0, 'renderPCSide 를 찾지 못했습니다');
  const end = src.indexOf('\nfunction ', at + 20);
  assert.ok(end > at, 'renderPCSide 의 끝을 찾지 못했습니다');
  return src.slice(at, end);
}

/* pcItem · pcSideBottomHtml · renderPCSide · mailSideHtml 을 한 덩어리로 돌린다.
   ⚠ 한 번의 runInContext 안에서 돌려야 서로를 본다(같은 덩어리 안의 function 들). */
const esc = s => String(s ?? '').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function load(over){
  const o = over || {};
  const held = { html: null };
  const state = Object.assign({
    tab:'card', view:'list', group:'all', owner:'all', page:0,
    isAdmin:true, privOpen:false, unlocked:{}, groups:{},
    coFolder:'', coFTab:'', coTag:'', coShowHidden:false,
    mailSent:false, sentCat:'', sentBy:'', sentByOpen:false, matPick:'',
    sentBox:{}, schedBox:{}
  }, o.state || {});
  const ctx = {
    console, Object, Array, String, Number, Math, JSON, RegExp, Set, Date,
    esc, state,
    /* 명함 쪽 */
    allItems: () => o.items || {},
    allGroups: () => state.groups,
    isPrivGroup: g => !!(g && g.priv),
    canSeeGroup: () => true,
    /* 기업 상세 쪽 */
    coList: () => o.cos || [],
    coTagList: () => o.coTags || [],
    coFTabCounts: () => ({ all: 0, byTab: {} }),
    coFTabList: () => o.coFTabs || [],
    _coFolders: o.coFolders || {},
    _coTagHidden: {},
    /* 메일 쪽 */
    MAT_CATS_NOW: () => o.matCats || [],
    matList: () => o.mats || [],
    matCat: m => (m && m.cat) || '',
    _matMeta: o.matMeta || {},
    schedList: () => o.sched || [],
    staffName: b => String(b || ''),
    /* 다음메일함 차림(2026-08-24)이 쓰는 것들 — 옆줄이 회사 주소와 폴더 목록을 본다.
       Store 를 'demo' 로 두면 폴더를 가져오러 붙지 않는다(검사는 서버에 안 붙는다). */
    matMailCfg: () => ({ from: '370-6@daum.net' }),
    Store: { mode: 'demo' },
    fmtDate: () => '2026.08.24',
    /* 화면 */
    $: id => (id === 'pcSide'
      ? { set innerHTML(v){ held.html = v; }, get innerHTML(){ return held.html; } }
      : null)
  };
  vm.createContext(ctx);
  vm.runInContext(cut('function pcItem(attrs', '\nfunction switchTab('), ctx);
  ctx._held = held;
  return ctx;
}

/* 실제로 자료가 든 화면으로 돌린다 — 텅 빈 화면만 보면 「폴더가 있을 때만 타는 길」을
   놓친다(폴더 목록·서류 탭·보낸 메일이 모두 갈림길을 갖는다). */
const RICH = {
  items: {
    a: { id:'a', kind:'card', group:'g1', owner:'김보람' },
    b: { id:'b', kind:'biz',  group:'',   owner:'' }
  },
  state: { groups: { g1:{ id:'g1', name:'업체관리', kind:'card', order:1, locked:true } } },
  cos: [{ key:'k1', name:'대명크라샤', erp:{ type:'자문' }, folder:'f1' }],
  coFolders: { f1:{ id:'f1', name:'현장클리닉', order:1 } },
  coTags: [{ t:'일터상생혁신', n:2 }],
  coFTabs: [{ id:'t1', name:'1차' }],
  matCats: ['서식'],
  mats: [{ id:'m1', cat:'서식' }],
  matMeta: { m1:{ cat:'서식' } },
  sched: [{ id:'s1' }]
};

/* 대표가 옆줄에서 갈 수 있는 화면들. 하나라도 빠지면 그 화면에서 설정이 사라진다. */
const SCREENS = [
  { name: '명함 목록',   state: { view:'list', tab:'card' } },
  { name: '사업자 목록', state: { view:'list', tab:'biz' } },
  { name: '기업 상세',   state: { view:'co' } },
  { name: '메일 쓰기',   state: { view:'mail' } },
  { name: '보낸 메일',   state: { view:'mail', mailSent:true,
      sentBox:{ s1:{ at:1, ids:['m1'], by:'u1' } } } },
  { name: '자료함',      state: { view:'mat' } },
  { name: '환경설정',    state: { view:'settings' } }
];

for(const s of SCREENS){
  test(`★ ${s.name} 화면에도 ⚙️ 환경설정이 남아 있다`, () => {
    const c = load(Object.assign({}, RICH, { state: Object.assign({}, RICH.state, s.state) }));
    c.renderPCSide();
    const html = c._held.html;
    assert.ok(typeof html === 'string' && html.length > 0, '옆줄을 아예 안 그렸다');
    assert.ok(html.indexOf('class="pcside-bottom"') >= 0,
      `${s.name} 화면에 맨 아래 붙박이 덩어리가 없다 — 대표가 설정으로 갈 길을 잃는다`);
    assert.ok(html.indexOf('⚙️ 환경설정') >= 0,
      `${s.name} 화면에서 「환경설정」이 사라졌다(대표 보고 2026-08-17)`);
    assert.ok(html.indexOf('openSettingsPage()') >= 0, '누를 수 없는 이름표만 있다');
  });
}

test('★ 대표라면 어느 화면에서든 「개인 폴더 열기」도 함께 있다', () => {
  /* 예전 메일 옆줄에는 환경설정만 있고 개인 폴더가 빠진 «반쪽짜리» 덩어리가 있었다 */
  for(const s of SCREENS){
    const c = load(Object.assign({}, RICH, { state: Object.assign({}, RICH.state, s.state, { isAdmin:true }) }));
    c.renderPCSide();
    assert.ok(c._held.html.indexOf('openPrivateVault()') >= 0,
      `${s.name} 화면에 「개인 폴더 열기」가 없다`);
    assert.ok(c._held.html.indexOf('migrateLockedFolders()') >= 0,
      `${s.name} 화면에 「옛 잠금 폴더 옮기기」 알림이 없다 — 옛 잠금 폴더가 남아 있는데도 안 보인다`);
  }
});

test('직원 화면에는 대표 전용 단추가 안 나오고 환경설정만 남는다', () => {
  for(const s of SCREENS){
    const c = load(Object.assign({}, RICH, { state: Object.assign({}, RICH.state, s.state, { isAdmin:false }) }));
    c.renderPCSide();
    assert.ok(c._held.html.indexOf('openPrivateVault()') < 0, `${s.name}: 직원에게 개인 폴더가 보인다`);
    assert.ok(c._held.html.indexOf('migrateLockedFolders()') < 0, `${s.name}: 직원에게 잠금 옮기기가 보인다`);
    assert.ok(c._held.html.indexOf('⚙️ 환경설정') >= 0, `${s.name}: 직원에게 환경설정마저 없다`);
  }
});

/* ── 앞으로 갈림길이 하나 더 생겨도 걸리게 ──
   위 실행 검사는 «지금 있는 화면»만 돈다. 새 화면이 새 early return 을 달고 들어오면
   그 화면을 SCREENS 에 안 적는 한 아무도 못 잡는다. 그래서 «끝내는 자리마다 붙박이를
   먼저 붙였는가»를 코드 모양으로도 못 박는다. */
test('★ renderPCSide 는 끝내는 자리마다 pcSideBottomHtml() 을 먼저 붙인다', () => {
  const fn = sideFn();
  const MARK = "$('pcSide').innerHTML";
  const parts = fn.split(MARK);
  assert.ok(parts.length >= 3,
    `끝내는 자리가 ${parts.length - 1}곳뿐이다 — 갈림길 구조가 바뀌었으면 이 검사도 다시 보라`);
  parts.slice(0, -1).forEach((seg, i) => {
    assert.ok(seg.indexOf('pcSideBottomHtml()') >= 0,
      `${i + 1}번째 ${MARK} 앞에 pcSideBottomHtml() 이 없다 — ` +
      '그 갈림길로 끝나는 화면에서는 「⚙️ 환경설정」이 통째로 사라진다(대표 보고 2026-08-17)');
  });
});

test('붙박이 글자는 한 곳에만 있다 — 베끼면 다음에 한쪽만 고쳐진다', () => {
  /* 정의는 pcSideBottomHtml 안에 하나, 부르는 곳은 갈림길 수만큼 */
  const bodies = src.split('class="pcside-bottom"').length - 1;
  assert.equal(bodies, 1, `.pcside-bottom 을 그리는 곳이 ${bodies}군데다 — 한 곳이어야 한다`);
  /* ⚠ 「⚙️ 환경설정」이라는 **글자**는 폰 메뉴·설정 화면 제목에도 있다(다른 것들이다).
     여기서 세는 것은 «옆줄 붙박이의 그 단추» 하나뿐이다. */
  const btn = src.split('class="pcside-settings" onclick="openSettingsPage()"').length - 1;
  assert.equal(btn, 1, `옆줄 환경설정 단추가 ${btn}군데에 적혀 있다 — 한 곳이어야 한다`);
});

test('mailSideHtml 은 붙박이를 스스로 붙이지 않는다 — 부르는 쪽이 붙인다', () => {
  const mail = cut('function mailSideHtml()', '\nfunction pickMatCat');
  assert.ok(mail.indexOf('pcside-bottom') < 0,
    '메일 옆줄이 자기 몫의 붙박이를 또 붙이면 두 벌이 그려진다');
});
