/* 업무관리 사람·캘린더·화면 — 기업정보함 찾기 · 담당 표시 · 캘린더 분할 · 설명 ⓘ · 넓게 쓰기
   ⚠ 원래 임시 폴더에만 두었다가 한 번 날아갔다. 저장소에 둔다. */
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const W = fs.readFileSync(process.argv[2] || path.join(ROOT, 'work.html'), 'utf8');
const C = fs.readFileSync(path.join(ROOT, 'pu-cards.html'), 'utf8');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? ' — ' + extra : '')); }
}
function grab(name) {
  const i = W.indexOf('function ' + name + '(');
  if (i < 0) throw new Error('못 찾음: ' + name);
  let d = 0, st = false;
  for (let j = i; j < W.length; j++) {
    if (W[j] === '{') { d++; st = true; }
    else if (W[j] === '}') { d--; if (st && d === 0) return W.slice(i, j + 1); }
  }
  throw new Error('괄호 안 닫힘: ' + name);
}
const gvar = n => {
  const cand = [';$', '^\\];$', '^\\};$']
    .map(end => new RegExp('^var ' + n + '=[\\s\\S]*?' + end, 'm').exec(W))
    .filter(Boolean).map(m => m[0]).sort((a, b) => a.length - b.length);
  for (const s of cand) { try { new Function(s); return s; } catch (e) {} }
  throw new Error('못 읽음: ' + n);
};

const NS = 'work_erp';
let S = {}, items = {}, STORE = {}, CLS = {}, BODY = [];
let PATCHED = null, TOASTS = [], MAP = {}, ROWS = {}, RENDERED = 0, FB = {}, READ = null;
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function escJ(s) { return esc(String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/'/g, "\\'")); }
function toast(m, k) { TOASTS.push([m, k]); }
function closeM() {} function renderDrawer() {} function route() { RENDERED++; }
// 캘린더에서 그 날을 고르면 그 주로 함께 옮긴다 — 옮겼는지 여기서 지켜본다
let WEEKSET = null;
function setWeek(m) { WEEKSET = m; }
function mondayOf(d) { const t = new Date(d); t.setDate(t.getDate() - ((t.getDay() + 6) % 7)); return t; }
function inWeek(dateStr, mon) {
  if (!mon) return false;
  const d = new Date(dateStr + 'T00:00:00'), e = new Date(mon); e.setDate(e.getDate() + 7);
  return d >= mon && d < e;
}
function showModal() {} function calPanel() { return '<CALPANEL>'; }
function calBuild() { return MAP; }
function openDrawer(id) { ROWS._opened = id; }
function openPuerpCal() {} function myReset() { TOASTS.push(['myReset']); }
function teamReset() { TOASTS.push(['teamReset']); }
function fAny() { return false; }
function patchItem(id, o) { PATCHED = { id, o }; return Promise.resolve(true); }
function peLinked(it) { return !!(it && it.src === 'puerp' && it.ref && it.ref.type && it.ref.id); }
function viewer() { return { sid: S.vsid, name: S.vname }; }
function _normCo(s) { return String(s || '').replace(/\(주\)|㈜|주식회사|\(유\)|유한회사|[\s·.,\-()]/g, '').toLowerCase(); }
function telHref(p) { return String(p || '').replace(/[^0-9+]/g, ''); }
const CAL_NAME = { due: '업무 기한', next: '다음 할 일', sch: '일정' };
const PE_KIND = { contract: '계약', case: '사건' };
const localStorage = {
  getItem: k => (k in STORE ? STORE[k] : null),
  setItem: (k, v) => { STORE[k] = String(v); }, removeItem: k => { delete STORE[k]; }
};
const mkEl = () => ({ className: '', id: '', innerHTML: '', style: {}, onclick: null,
  offsetWidth: 300, offsetHeight: 90, parentNode: null,
  getBoundingClientRect() { return { left: 400, top: 200, right: 412, bottom: 214, width: 12, height: 12 }; } });
const document = {
  createElement: () => mkEl(),
  body: { appendChild(e) { e.parentNode = document.body; BODY.push(e); },
          removeChild(e) { BODY = BODY.filter(x => x !== e); e.parentNode = null; },
          classList: { add(c) { CLS[c] = 1; }, remove(c) { delete CLS[c]; } } },
  querySelector(sel) { const m = /data-i="([^"]+)"/.exec(sel); return m ? (ROWS[m[1]] || null) : null; }
};
function $(id) { return BODY.filter(e => e.id === id)[0] || null; }
const window = { addEventListener() {}, innerWidth: 1600, innerHeight: 900 };
const fbDb = { ref: (p) => ({ once: () => { READ = p; return Promise.resolve({ val: () => FB }); } }) };

eval(gvar('MAIL_COMMON') + '\n' + gvar('cardIdx') + '\n' + gvar('HELP') + '\n'
  + gvar('VIEW_KEY') + '\n' + gvar('CALW_KEY') + '\n' + gvar('_calDayIds') + '\n'
  + ['_cardRow', 'cardLoad', 'cardPhone', 'cardMatch', 'mailDom', 'coAkin', 'cardFind',
     'contactRole', 'itemContacts', '_ctKey', 'cardPick', 'mgrSubNames', 'mgrAll', 'mgrLine',
     'hlp', 'hlpClose', 'hlpPop', 'viewPref', 'viewApply', 'viewToggle', 'viewChips',
     'calWidth', 'splitOn', 'splitOpen', 'splitClose', 'calEvHTML',
     'calDaySet', 'calDayHas', 'calDayOnly'].map(grab).join('\n'));

/* ── 기업정보함: 무엇을 내주고 무엇을 빼는가 ── */
const ITEMS = {
  c1: { name: '홍길동', company: '별표수세미', title: '과장', dept: '인사팀', mobile: '010-1111-2222', email: 'h@trista.co.kr' },
  c2: { name: '김안전', company: '(주)별표수세미', title: '차장', tel: '041-555-1234' },
  c3: { name: '김계열', company: '별표수세미산업' },
  c4: { name: '박같은메일', company: '트리스타', email: 'p@trista.co.kr' },
  c5: { name: '남남', company: '전혀다른곳', email: 'x@naver.com' },
  c6: { name: 'ㄱ어머니', company: '', mobile: '010-1200-0011' },
  c7: { name: '', company: '별표수세미', kind: 'biz', bizno: '123-45-67890' },
  c8: { name: '숨은이', company: '별표수세미', scope: 'private' }
};
const load = () => { cardIdx = Object.keys(ITEMS).map(k => _cardRow(k, ITEMS[k], false)).filter(Boolean); };
load();
ok("기업정보함에서 '개인'으로 숨긴 사람은 나오지 않는다", cardIdx.every(c => c.n !== '숨은이'));
ok('사업자등록증은 사람이 아니라 뺀다', cardIdx.every(c => c.k !== 'biz'));
ok('이름도 회사도 없는 빈 명함은 뺀다',
  _cardRow('x', { name: '  ', company: '' }, false) === null
  && _cardRow('x', { name: '', company: '회사만' }, false) !== null);
ok('색인 모양으로 와도 같은 칸으로 읽는다',
  _cardRow('z', { n: '색인이', c: '회사', m: '010', k: 'card' }, true).n === '색인이');

let r = cardFind('', '별표수세미');
ok('담당 회사 사람이 앞줄에', r.mine.map(c => c.n).sort().join() === '김안전,홍길동');
ok('(주)·공백이 달라도 같은 회사', cardFind('', '(주) 별표수세미').mine.length === 2);
ok('비슷한 회사를 따로 낸다 (계열사 담당자가 함께 맡는다)',
  r.akin.map(c => c.n).sort().join() === '김계열,박같은메일');
ok('검색 전에는 그 밖의 사람을 늘어놓지 않는다', r.rest.length === 0);
ok('이름이 서로를 품으면 같은 무리',
  coAkin('별표수세미', '별표수세미산업') === true && coAkin('나래', '나래테크') === true
  && coAkin('별표수세미', '별표수세미') === false && coAkin('별표수세미', '전혀다른곳') === false);
ok('두 글자 미만으로는 묶지 않는다 (아무 데나 걸린다)',
  coAkin('가', '가나다라') === false && coAkin('', '나래') === false);
ok('메일 도메인이 같으면 같은 무리',
  mailDom('a@trista.co.kr') === 'trista.co.kr' && mailDom('b@TRISTA.CO.KR') === 'trista.co.kr');
ok('공용 메일로는 묶지 않는다 (남남이 한 무리가 된다)',
  mailDom('a@naver.com') === '' && mailDom('a@gmail.com') === ''
  && mailDom('없는메일') === '' && mailDom('') === '');
ok('회사 이름이 빈 사람은 비슷한 회사로 끌어오지 않는다',
  r.akin.every(c => String(c.c || '').trim() !== ''));

r = cardFind('홍', '');
ok('이름·회사·직급·부서·메일로 찾는다',
  cardFind('홍길동', '').restAll === 1 && cardFind('인사팀', '').restAll === 1
  && cardFind('trista', '').restAll === 2);
ok('전화번호는 하이픈을 빼고 견준다',
  cardFind('01011112222', '').restAll === 1 && cardFind('5551234', '').restAll === 1);
ok('숫자 두 자리로는 전화번호를 뒤지지 않는다', cardFind('11', '').restAll === 0);
ok('회사 없는 명함은 기본으로 감추고 몇 명인지 알린다', (function () {
  const a = cardFind('ㄱ', '');
  const b = cardFind('ㄱ', '', 0, true);
  return a.rest.length === 0 && a.noCo === 1 && b.rest.length === 1;
})());
ok('많으면 잘라 주되 전체 수는 알려준다', (function () {
  cardIdx = []; for (let i = 0; i < 80; i++) cardIdx.push({ _id: 'x' + i, n: '홍' + i, c: '다른곳', k: 'card' });
  const x = cardFind('홍', '', 60);
  load();
  return x.rest.length === 60 && x.restAll === 80;
})());
ok('휴대폰 → 전화 → 회사전화 차례',
  cardPhone({ m: '010', t: '041', ct: '02' }) === '010' && cardPhone({ ct: '02' }) === '02'
  && cardPhone({}) === '');

/* ── 고르면 담당자로 붙는다 (여러 명 둘 수 있다) ── */
ok('옛 자료(한 명)와 새 자료(여러 명)를 함께 읽는다',
  itemContacts({ contact: { name: '홍길동' } }).length === 1
  && itemContacts({ contacts: [{ name: 'A' }, { name: 'B' }] }).length === 2
  && itemContacts({}).length === 0 && itemContacts(null).length === 0);
ok('같은 사람인지는 이름+전화로 본다',
  _ctKey({ name: '홍 길동', phone: '010-1111-2222' }) === _ctKey({ name: '홍길동', phone: '01011112222' })
  && _ctKey({ name: '홍길동' }) !== _ctKey({ name: '김안전' }));
items = { W1: {} }; S = { _cardFor: 'W1' }; PATCHED = null;
cardPick(cardIdx.filter(c => c.n === '홍길동')[0]._id);
ok('이름·부서+직급·전화가 들어간다', (function () {
  const c = PATCHED.o.contacts[0];
  return c.name === '홍길동' && c.rank === '인사팀 과장' && c.phone === '010-1111-2222';
})());
ok('푸른이알피가 읽는 칸(position)도 함께 채운다',
  PATCHED.o.contacts[0].position === '인사팀 과장');
items = { W1: { contacts: [{ name: '먼저있던사람', phone: '010-0000-0000' }] } };
S = { _cardFor: 'W1' }; PATCHED = null;
cardPick(cardIdx.filter(c => c.n === '김안전')[0]._id);
ok('이미 적어 둔 사람을 덮어쓰지 않고 한 명 더 붙인다',
  PATCHED.o.contacts.length === 2 && PATCHED.o.contacts[0].name === '먼저있던사람');
items = { W1: { contacts: [{ name: '홍길동', phone: '010-1111-2222' }] } };
S = { _cardFor: 'W1' }; PATCHED = null; TOASTS = [];
cardPick(cardIdx.filter(c => c.n === '홍길동')[0]._id);
ok('같은 사람을 두 번 넣지 않는다', PATCHED === null && TOASTS[0][1] === 'warn');
const saveIdx = cardIdx;
cardIdx = [{ _id: 'z', n: '', c: '회사만', k: 'card' }];
items = { W1: {} }; S = { _cardFor: 'W1' }; PATCHED = null; TOASTS = [];
cardPick('z');
ok('담을 것이 없는 명함은 넣지 않는다', PATCHED === null && TOASTS[0][1] === 'warn');
S = {}; PATCHED = null; TOASTS = [];
cardPick('z');
ok('어느 업무에 넣을지 모르면 아무것도 하지 않는다', PATCHED === null);
cardIdx = saveIdx;
ok('기업정보함은 읽기만 한다 (명함은 기업정보함에서 고친다)',
  !/\.set\(|\.update\(|\.remove\(/.test(grab('cardLoad')));
ok('본문을 먼저 읽는다 (색인은 저장할 때만 갱신돼 빠진 사람이 생긴다)',
  grab('cardLoad').indexOf("'pucards/items'") < grab('cardLoad').indexOf("'pucards/idx'"));
ok('기업정보함 본문이 pucards/items 에 있고 지운 것은 trash 로 간다',
  C.indexOf("watchCardMap(this.db.ref(DB_ROOT+'/items')") > 0 && C.indexOf('`${DB_ROOT}/trash/${id}`') > 0);

/* ── 담당 표시: 주담당·부담당 ── */
const IT = { mgr_main: { sid: 'P-001', name: '권형하' },
             mgr_subs: [{ sid: 'P-007', name: '김동현' }, { sid: 'P-003', name: '박한별' }] };
ok('주담당과 부담당을 중복 없이 모은다',
  mgrAll(IT).join() === '권형하,김동현,박한별' && mgrAll({}).join() === '(담당 미지정)');
ok('부담당 이름만 따로', mgrSubNames(IT).join() === '김동현,박한별' && mgrSubNames({}).length === 0);
ok('모두 보기 — 주가 앞, 부가 뒤', (function () {
  const h = mgrLine(IT, 'all');
  return h.indexOf('>주<') > 0 && h.indexOf('>부<') > 0 && h.indexOf('권형하') < h.indexOf('김동현');
})());
ok('묶어 볼 때는 부담당만 (주담당은 묶음 머리에 있다)', (function () {
  const h = mgrLine(IT, 'sub');
  return h.indexOf('권형하') < 0 && h.indexOf('김동현') > 0;
})());
S = { vsid: 'P-001', vname: '권형하' };
ok('내 업무에서는 나를 뺀 나머지 (내가 주담당이면 부담당이 뜬다)', (function () {
  const h = mgrLine(IT, 'other');
  return h.indexOf('권형하') < 0 && h.indexOf('김동현') > 0 && h.indexOf('박한별') > 0;
})());
S = { vsid: 'P-007', vname: '김동현' };
ok('내가 부담당이면 주담당이 뜬다', (function () {
  const h = mgrLine(IT, 'other');
  return h.indexOf('권형하') > 0 && h.indexOf('김동현') < 0;
})());
S = { vsid: 'P-001', vname: '권형하' };
ok('혼자 하는 업무에는 아무 줄도 안 그린다 (빈 줄이 깔리면 지저분하다)',
  mgrLine({ mgr_main: { name: '권형하' } }, 'other') === ''
  && mgrLine({ mgr_main: { name: '권형하' } }, 'sub') === '');
ok('걸러 낸 이름은 표가 난다', mgrLine(IT, 'all', ['김동현']).indexOf('mgt sub hi') > 0);
ok('이름에 태그가 들어가도 안 깨진다',
  mgrLine({ mgr_main: { name: '<b>x</b>' } }, 'all').indexOf('&lt;b&gt;') > 0);

/* ── 설명은 ⓘ 팝업 (안내문을 화면에 깔지 않는다) ── */
BODY = [];
ok('제목 옆 ⓘ 하나만 그린다',
  hlp('steps').indexOf('ⓘ') > 0 && hlp('steps').indexOf(HELP.steps.slice(0, 12)) < 0);
ok('ⓘ 를 눌러도 그 줄의 다른 동작이 딸려 일어나지 않는다',
  hlp('note').indexOf('event.stopPropagation()') > 0);
BODY = []; hlpPop(mkEl(), 'steps');
ok('누르면 팝업과 바깥 덮개가 함께 생긴다', BODY.length === 2 && $('hlpop') && $('hlbk'));
$('hlbk').onclick();
ok('바깥을 누르면 닫힌다', BODY.length === 0);
BODY = []; hlpPop(mkEl(), 'org'); hlpPop(mkEl(), 'mgr');
ok('다른 ⓘ 를 누르면 앞의 것이 먼저 닫힌다', BODY.length === 2);
BODY = []; hlpPop(mkEl(), '없는키');
ok('없는 설명은 띄우지 않는다', BODY.length === 0);
BODY = []; hlpPop(null, 'steps');
ok('붙일 자리가 없으면 그냥 넘어간다', BODY.length === 0);
BODY = []; hlpPop(mkEl(), 'kb'); hlpClose(); hlpClose();
ok('닫기를 두 번 불러도 오류가 없다', BODY.length === 0);
ok('여섯 상자에 모두 ⓘ 가 붙었다',
  ['steps', 'people', 'org', 'mgr', 'kb', 'note'].every(k => W.indexOf("hlp('" + k + "')") > 0));
ok('상자마다 깔려 있던 안내문이 사라졌다',
  ['업체 담당자와 다르면 여기에 적습니다', '부담당도 이 업무의 기록을 씁니다',
   '기록을 읽어 초안을 만들고, 기록에 없는 부분을 질문합니다'].every(s => W.indexOf(s) < 0));
ok('오류·주의는 화면에 그대로 둔다 (그건 눈에 띄어야 한다)', W.indexOf('업무 칸이 비어') > 0);

/* ── 캘린더를 표 옆에 ── */
S = { calOn: true }; window.innerWidth = 1600;
ok('넓으면 좌우로 나눈다',
  splitOn() === true && splitOpen().indexOf('<div class="split"') === 0
  && splitClose().indexOf('spgrip') > 0);
window.innerWidth = 900;
ok('좁으면 예전처럼 위아래로 (반씩 나누면 둘 다 못 쓴다)',
  splitOn() === false && splitOpen() === '<CALPANEL>' && splitClose() === '');
window.innerWidth = 1600; S = { calOn: false };
ok('캘린더가 꺼져 있으면 아무 것도 끼우지 않는다', splitOpen() === '' && splitClose() === '');
S = { calOn: true };
ok('여는 태그와 닫는 태그가 짝이 맞는다 (어긋나면 화면이 통째로 깨진다)', (function () {
  const h = splitOpen() + '<TABLE>' + splitClose();
  return (h.match(/<div\b/g) || []).length === (h.match(/<\/div>/g) || []).length;
})());
STORE = {};
ok('폭은 기본 400, 정한 값을 기억한다', (function () {
  const a = calWidth(); STORE[CALW_KEY] = '520';
  return a === 400 && calWidth() === 520;
})());
STORE[CALW_KEY] = '50'; const narrow = calWidth();
STORE[CALW_KEY] = '5000'; const wide = calWidth();
STORE[CALW_KEY] = '망가짐';
ok('너무 좁거나 넓게는 못 만들고, 값이 이상하면 기본으로',
  narrow === 280 && wide === 720 && calWidth() === 400);

/* ── 캘린더에서 무엇을 누르느냐 ── */
ok('우리 업무는 글자·✏️·⤢ 셋이 각각 다른 일', (function () {
  const h = calEvHTML({ k: 'due', t: '📅 케이블루', c: '#dc2626', it: 'W1', drag: 1 });
  return h.indexOf("calGo('W1')") > 0 && h.indexOf("calQuick('W1'") > 0
      && h.indexOf("openDrawer('W1')") > 0 && h.indexOf('draggable="true"') > 0;
})());
ok('푸른이알피 자료는 우리 업무가 아니라 손댈 것이 없다', (function () {
  const h = calEvHTML({ k: 'sch', t: '회의', c: '#059669' });
  return h.indexOf('calGo(') < 0 && h.indexOf('calQuick(') < 0 && h.indexOf('openPuerpCal()') > 0;
})());
ok('일정 안의 클릭이 날짜 칸까지 번지지 않는다',
  (calEvHTML({ k: 'due', t: 'x', c: '#000', it: 'W1' }).match(/event\.stopPropagation\(\)/g) || []).length === 3);
MAP = { '2026-08-03': [{ it: 'W1' }, { it: 'W2' }, { t: '푸른이알피 일정' }] };
S = { calDay: '2026-08-03' };
ok('그 날 캘린더에 뜬 우리 업무만 남긴다',
  calDayHas({ _id: 'W1' }) && calDayHas({ _id: 'W2' }) && !calDayHas({ _id: 'W9' }));
S = { calDay: '' }; calDayOnly('2026-08-03');
const dayOn = S.calDay;
calDayOnly('2026-08-03');
ok('날짜 칸을 누르면 그 날만, 다시 누르면 해제',
  dayOn === '2026-08-03' && S.calDay === '');
MAP = { '2026-08-04': [{ it: 'W2' }] };
S = { calDay: '2026-08-03' }; calDayHas({ _id: 'W1' }); calDayOnly('2026-08-04');
ok('날을 바꾸면 다시 센다 (예전 날 것이 남으면 안 된다)',
  calDayHas({ _id: 'W2' }) && !calDayHas({ _id: 'W1' }));

/* 고른 날이 보고 있는 주 밖이면 그 주로 함께 옮긴다.
   예전에는 걸러만 놓고 주는 그대로 두어, 8/12 를 고르면 표는 8.3~8.7 을 보여 준
   채 한 건도 안 남아 자료가 통째로 사라진 것처럼 보였다. */
S = { calDay: '', week: new Date('2026-08-03T00:00:00') };   // 8.3~8.9 주
WEEKSET = null; RENDERED = 0;
calDayOnly('2026-08-12');
ok('다른 주의 날을 고르면 그 주로 옮긴다 (안 그러면 고른 날이 표에 없다)',
  WEEKSET && WEEKSET.getDate() === 10 && WEEKSET.getMonth() === 7);
S = { calDay: '', week: new Date('2026-08-03T00:00:00') };
WEEKSET = null; RENDERED = 0;
calDayOnly('2026-08-05');
ok('같은 주 안이면 주를 옮기지 않는다 (보던 자리를 지킨다)',
  WEEKSET === null && RENDERED === 1);
S = { calDay: '2026-08-12', week: new Date('2026-08-10T00:00:00') };
WEEKSET = null;
calDayOnly('2026-08-12');
ok('해제할 때는 주를 옮기지 않는다', WEEKSET === null && S.calDay === '');

/* 고른 날 칸으로 커서까지 옮긴다 — 날짜를 누르고 바로 적기 시작할 수 있게 */
S = { calDay: '', week: new Date('2026-08-10T00:00:00') };
calDayOnly('2026-08-12');
ok('고른 날을 커서 옮길 자리로 남긴다', S._calFocus === '2026-08-12');
S = { calDay: '2026-08-12', week: new Date('2026-08-10T00:00:00') };
calDayOnly('2026-08-12');
ok('해제할 때는 커서를 옮기지 않는다', S._calFocus === '');
S = { calDay: '', week: new Date('2026-08-10T00:00:00'), view: 'team' };
calDayOnly('2026-08-12');
ok('팀 전체에는 요일 칸이 없으므로 표시를 남기지 않는다 (뒤늦게 잡히면 안 된다)',
  S._calFocus === '');

/* ── 화면 넓게 쓰기 ── */
STORE = {}; S = {}; CLS = {};
ok('처음에는 둘 다 꺼져 있다', viewPref().cmp === false && viewPref().nos === false);
viewToggle('cmp'); viewToggle('nos');
ok('켠 것을 이 컴퓨터에 적어 둔다', STORE[VIEW_KEY] === 'cs' && CLS.cmp === 1 && CLS.nos === 1);
viewToggle('cmp');
ok('끄면 그 글자만 빠진다', STORE[VIEW_KEY] === 's' && !CLS.cmp && CLS.nos === 1);
STORE = { [VIEW_KEY]: 'cs' }; S = {}; CLS = {}; viewApply();
ok('다시 켜고 들어와도 지난번 자리', CLS.cmp === 1 && CLS.nos === 1);
STORE = { [VIEW_KEY]: '망가짐' }; S = {};
ok('적힌 값이 이상해도 꺼진 것으로 본다', viewPref().cmp === false);
S = {}; STORE = {};
ok('칩이 지금 상태를 보여준다', (function () {
  const off = viewChips(); STORE = { [VIEW_KEY]: 'cs' }; S = {};
  const on = viewChips();
  /* ⚠ 글자 「chipbtn on」을 그대로 찾지 않는다 — 2026-08-20 에 손잡이 class 를
     더하면서(vc-cmp·vc-nos) 사이에 낱말이 끼었고, 멀쩡한 고침이 이 검사에 걸렸다.
     보는 것은 «켠 칩에 on 이 붙는가»이지 class 를 어떻게 적었는가가 아니다. */
  const onN = (s) => (s.match(/class="chipbtn[^"]*\bon\b/g) || []).length;
  return off.indexOf('빽빽하게') > 0 && onN(off) === 0
      && on.indexOf('✓ 빽빽하게') > 0 && onN(on) === 2;
})());
ok('접었을 때 다시 펼 손잡이가 남는다 (없으면 되돌릴 수가 없다)',
  W.indexOf('id="sideOn"') > 0 && /body\.nos #sideOn\{display:block\}/.test(W)
  && /#sideOn\{[^}]*display:none/.test(W));

console.log('\n' + (fail ? 'FAILED ' + fail + '/' + (pass + fail) : 'ALL ' + pass + ' PASS'));
process.exit(fail ? 1 : 0);
