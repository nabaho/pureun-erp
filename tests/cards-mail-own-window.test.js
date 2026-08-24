/* 메일과 기업정보함을 «두 창»으로 나눈다 — 파일은 한 벌 그대로.
   ═══════════════════════════════════════════════════════════════════════════
   대표 지시 2026-08-24: 「메일과 자료함관리는 여기서 보일 필요도 없지 않나?」
   → 「해라 포털도」

   무엇이 문제였나: 옆줄 맨 위 네 단추(메일·명함·사업자·기업 상세)가 **어느 화면에서든**
   그려졌다. 그래서 메일 화면에 들어가도 옆줄에 명함 6,282 · 사업자 346 · 기업 상세 4,143
   이 같이 떴고, 대표께 「이중으로 관리하는 것 아닌가」로 보였다.
   실제 자료는 처음부터 한 벌이었다 — 화면만 섞여 있었다.

   ★ 여기서 못 박는 것
     ① 메일 창에서는 명함·사업자·기업 상세 줄이 «안 보인다»
     ② 기업정보함에서는 메일 줄이 «안 보인다»
     ③ 그래도 서로 오가는 길이 «각 창 맨 아래에» 남는다 — 길을 끊으면 갇힌다
     ④ 창마다 이름이 다르다 (같은 이름이면 나눈 뜻이 없다)
     ⑤ 자료함으로 가는 단추는 «하나»뿐이다 (＋ 와 「자료함 관리」가 같은 함수였다)
     ⑥ ⚙️ 환경설정은 두 창 모두에 그대로 남는다
   실행: node --test tests/cards-mail-own-window.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'pu-cards.html'), 'utf8').replace(/\r\n/g, '\n');
const enter = fs.readFileSync(path.join(ROOT, 'enter.html'), 'utf8').replace(/\r\n/g, '\n');

function cut(from, to){
  const i = src.indexOf(from); assert.ok(i >= 0, '못 찾음: ' + from);
  const j = src.indexOf(to, i); assert.ok(j > i, '끝을 못 찾음: ' + to);
  return src.slice(i, j);
}
const esc = s => String(s ?? '').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

/* cards-side-bottom.test.js 와 «같은 방식»으로 옆줄을 실제로 돌린다 —
   소스에 글자가 있나가 아니라, 그 화면이 내놓는 HTML 에 있나를 본다. */
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
    allItems: () => o.items || {},
    allGroups: () => state.groups,
    isPrivGroup: g => !!(g && g.priv),
    canSeeGroup: () => true,
    coList: () => o.cos || [],
    coTagList: () => o.coTags || [],
    coFTabCounts: () => ({ all: 0, byTab: {} }),
    coFTabList: () => o.coFTabs || [],
    _coFolders: o.coFolders || {},
    _coTagHidden: {},
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
    $: id => (id === 'pcSide'
      ? { set innerHTML(v){ held.html = v; }, get innerHTML(){ return held.html; } }
      : null)
  };
  vm.createContext(ctx);
  vm.runInContext(cut('function pcItem(attrs', '\nfunction switchTab('), ctx);
  ctx._held = held;
  return ctx;
}

const RICH = {
  items: {
    a: { id:'a', kind:'card', group:'g1', owner:'김보람' },
    b: { id:'b', kind:'biz',  group:'',   owner:'' }
  },
  state: { groups: { g1:{ id:'g1', name:'업체관리', kind:'card', order:1 } } },
  cos: [{ key:'k1', name:'대명크라샤', erp:{ type:'자문' }, folder:'f1' }],
  coFolders: { f1:{ id:'f1', name:'현장클리닉', order:1 } },
  coTags: [{ t:'일터상생혁신', n:2 }],
  coFTabs: [{ id:'t1', name:'1차' }],
  matCats: ['서식'],
  mats: [{ id:'m1', cat:'서식' }],
  matMeta: { m1:{ cat:'서식' } },
  sched: [{ id:'s1' }]
};

function side(st){
  const c = load(Object.assign({}, RICH, { state: Object.assign({}, RICH.state, st) }));
  c.renderPCSide();
  const html = c._held.html;
  assert.ok(typeof html === 'string' && html.length > 0, '옆줄을 아예 안 그렸다');
  return html;
}

/* 메일 창으로 세는 화면 — 자료함(mat)도 메일 살림이다 */
const MAIL_SCREENS = [
  { name: '메일 쓰기', state: { view:'mail' } },
  { name: '보낸 메일', state: { view:'mail', mailSent:true,
      sentBox:{ s1:{ at:1, ids:['m1'], by:'u1' } } } },
  { name: '자료함',    state: { view:'mat' } }
];
const CARD_SCREENS = [
  { name: '명함 목록',   state: { view:'list', tab:'card' } },
  { name: '사업자 목록', state: { view:'list', tab:'biz' } },
  { name: '기업 상세',   state: { view:'co' } }
];

/* ══════ ① 메일 창에는 명함 살림이 안 보인다 ══════ */

for(const s of MAIL_SCREENS){
  test(`★ ${s.name}: 명함·사업자·기업 상세 줄이 안 보인다`, () => {
    const h = side(s.state);
    assert.ok(h.indexOf("switchTab('card')") < 0, '명함 줄이 남아 있다');
    assert.ok(h.indexOf("switchTab('biz')") < 0, '사업자 줄이 남아 있다');
    assert.ok(h.indexOf('openCoPage()') < 0, '기업 상세 줄이 남아 있다');
  });
}

test('메일 창에는 「메일로 가기」 단추가 없다 — 이미 그 안에 있다', () => {
  const h = side({ view:'mail' });
  assert.ok(h.indexOf('class="sidetab') < 0,
    '갈래 단추 줄이 남아 있으면 「메일」과 「메일 쓰기」가 둘 다 켜져 보인다');
});

/* ══════ ② 기업정보함에는 메일 살림이 안 보인다 ══════ */

for(const s of CARD_SCREENS){
  test(`★ ${s.name}: 갈래 줄에 메일이 없다`, () => {
    const h = side(s.state);
    const i = h.indexOf('class="sidetab');
    assert.ok(i > 0, '갈래 단추 줄이 있어야 한다');
    const row = h.slice(i, h.indexOf('</div>', h.indexOf('기업 상세', i)));
    assert.ok(row.indexOf('openMailPage()') < 0, '갈래 줄에 메일이 남아 있다');
    assert.ok(row.indexOf("switchTab('card')") > 0, '명함 줄이 없다');
    assert.ok(row.indexOf('openCoPage()') > 0, '기업 상세 줄이 없다');
  });
}

/* ══════ ③ 오가는 길은 끊지 않는다 ══════ */

for(const s of MAIL_SCREENS){
  test(`★ ${s.name}: 맨 아래에 기업정보함으로 가는 길이 있다`, () => {
    const h = side(s.state);
    const i = h.indexOf('class="pcside-bottom"');
    assert.ok(i > 0, '붙박이 칸이 없다');
    assert.ok(h.slice(i).indexOf('closeMailPage()') > 0,
      '돌아갈 길이 없으면 메일 창에 갇힌다');
  });
}

for(const s of CARD_SCREENS){
  test(`★ ${s.name}: 맨 아래에 메일로 가는 길이 있다`, () => {
    const h = side(s.state);
    const i = h.indexOf('class="pcside-bottom"');
    assert.ok(i > 0, '붙박이 칸이 없다');
    assert.ok(h.slice(i).indexOf('openMailPage()') > 0,
      '갈래 줄에서 메일을 뺐으니 여기에는 있어야 한다 — 둘 다 없으면 길이 끊긴다');
  });
}

/* ══════ ④ 창마다 이름이 다르다 ══════ */

test('메일 창의 이름은 「푸른 메일」이다', () => {
  const h = side({ view:'mail' });
  assert.ok(h.indexOf('푸른 메일') > 0, '이름이 그대로면 나눈 뜻이 없다');
  assert.ok(h.indexOf('푸른 기업정보함') < 0, '두 이름이 같이 뜨면 어디인지 모른다');
});

test('기업정보함의 이름은 그대로다', () => {
  const h = side({ view:'list', tab:'card' });
  assert.ok(h.indexOf('푸른 기업정보함') > 0);
});

/* ══════ ⑤ 자료함으로 가는 단추는 하나뿐이다 ══════ */

test('자료함 단추가 겹치지 않는다 — ＋ 와 「자료함 관리」는 같은 함수였다', () => {
  const h = side({ view:'mail' });
  const n = h.split('openMatPage()').length - 1;
  assert.equal(n, 1, '자료함으로 가는 단추가 ' + n + '개 있다 (하나여야 한다)');
  assert.ok(h.indexOf('pcside-mat') < 0, '「🗂 자료함 관리」 단추가 남아 있다');
});

/* ══════ ⑥ 환경설정은 두 창 모두에 남는다 ══════ */

for(const s of MAIL_SCREENS.concat(CARD_SCREENS)){
  test(`★ ${s.name}: ⚙️ 환경설정이 그대로 있다`, () => {
    assert.ok(side(s.state).indexOf('openSettingsPage()') > 0,
      '나누다가 설정으로 가는 길을 잃으면 안 된다 (2026-08-17 에 겪은 일)');
  });
}

/* ══════ 포털 첫 화면 ══════ */

test('포털에 ✉️ 메일 타일이 있다 (대표 지시 2026-08-24 「포털도」)', () => {
  assert.match(enter, /key:'mail'/, '★ 첫 화면에서 메일로 바로 못 들어간다');
  assert.match(enter, /key:'mail'[^\n]*pu-cards\.html\?view=mail/,
    '★ 메일 타일이 메일 문(?view=mail)으로 가야 한다 — 그냥 pu-cards.html 이면 명함이 열린다');
});

test('기업정보함 타일도 그대로 있다 — 둘 다 있어야 두 창이다', () => {
  assert.match(enter, /key:'cards'[^\n]*pu-cards\.html'/);
});
