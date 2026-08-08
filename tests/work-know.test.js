/* 업무관리 — 지식 카드 · 인수인계 · 전체 검색 · 엑셀 가져오기
   ⚠ 원래 임시 폴더에만 두었다가 한 번 날아갔다. 저장소에 둔다. */
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const W = fs.readFileSync(process.argv[2] || path.join(ROOT, 'work.html'), 'utf8');

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
let S = { me: { sid: 'u1', name: '김동현', title: '노무사' } };
let items = {}, leaving = {}, _allLogs = {}, itemLogsCache = {};   // kb 는 아래 eval 이 선언한다
let coMaster = {}, peRecMap = {};
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function toast() {} function route() {} function renderDrawer() {}
function todayStr() { return '2026-08-01'; }
function qp() { return ''; }
function allItems() { return Object.keys(items).map(k => Object.assign({ _id: k }, items[k])); }
function openItems() { return allItems().filter(it => it.state !== 'done'); }
function coFind(it) { return coMaster[(it && it.company) || ''] || null; }
function peRec(it) { return (it && it.ref && peRecMap[it.ref.id]) || null; }
let PATCHED = null, LOGGED = [];
function patchItem(id, f) { PATCHED = { id: id, f: f }; return Promise.resolve(true); }
function addLog(id, t, d, k) { LOGGED.push([id, t, k]); return Promise.resolve(true); }
let ONCE = {}, UPDATED = null, CONFIRM = false;
// 확인 대화 — CONFIRM 값을 그대로 돌려준다
function confirmM() { return Promise.resolve(CONFIRM); }
const fbDb = { ref: (p) => ({
  once: () => Promise.resolve({ val: () => ONCE[p] || null }),
  update: (u) => { UPDATED = u; return Promise.resolve(); }
}) };

eval(gvar('HO_FIELDS') + '\n' + gvar('RETRO_FIELDS') + '\n'
  + gvar('HO_OVERDUE_DAYS') + '\n' + gvar('KB_KINDS') + '\n'
  + 'var KB_KLBL={}; KB_KINDS.forEach(function(k){ KB_KLBL[k[0]]=k[1]; });\n'
  + gvar('KB_STALE_DAYS') + '\n'
  + ['safeKey', 'weekYear', '_normCo', '_cList', 'contactRole', 'coContacts', 'itemContacts',
     'kbKey', 'kbCoKey', 'kbCards', 'kbAll', 'kbStale', 'kbBad', 'kbRelated',
     '_hit', 'matchQ', 'searchAll', 'noteDone', 'hoPendingToMe', 'hoOverdue', 'isAdmin',
     'activeLeavings', 'hoBadgeCount', 'leavingItems', 'confirmHo',
     'mgrSubNames', 'orphanSubs', 'dropSubAll',
     'excelImported', 'excelWipePaths'].map(grab).join('\n'));

/* ══ 지식 카드 ══ */
ok('카드 갈래는 사람·업체·유형·기관',
  KB_KINDS.map(k => k[0]).join() === 'person,company,cat,office');
ok('키는 저장할 수 있는 글자로 바꾼다 (점·슬래시가 있으면 경로가 깨진다)',
  kbKey('천안/지청.1') === '천안_지청_1' && kbKey('  통상임금  ') === '통상임금');
ok('기업 키는 사업자 ID 가 있으면 그것 (이름을 고쳐도 카드가 안 흩어진다)',
  kbCoKey({ co_id: 'CO1', company: '나래산업' }) === 'CO1');
ok('ID 가 없으면 (주)·공백을 뗀 이름',
  kbCoKey({ company: '(주) 나래 산업' }) === kbCoKey({ company: '나래산업' }));

kb = {
  cat: { 부당해고: {
    k1: { t: '조사 전 확인표', x: '취업규칙부터', at: '2026-07-01', byName: '권형하' },
    k2: { t: '', x: '제목 없음' },
    k3: 'not-an-object'
  } },
  company: { 나래산업: { k4: { t: '이 회사 관행', at: '2026-06-01' } } },
  person: { 강감독관: { k5: { t: '연락은 오전에', at: '2020-01-01' } } },
  office: { 천안지청: { k6: { t: '접수 창구', kl: '천안지청', at: '2026-07-20' } } }
};
ok('제목 없는 카드·망가진 값은 걸러낸다', kbCards('cat', '부당해고').length === 1);
ok('최근 것이 위로', (function () {
  kb.cat.부당해고.k9 = { t: '더 최근', at: '2026-07-30' };
  const r = kbCards('cat', '부당해고').map(c => c._id).join();
  delete kb.cat.부당해고.k9;
  return r === 'k9,k1';
})());
ok('카드에 어디 붙은 것인지 표시가 따라온다', (function () {
  const c = kbCards('cat', '부당해고')[0];
  return c._kind === 'cat' && c._key === '부당해고' && c._id === 'k1';
})());
ok('오래된 카드는 표시한다 (그때 맞던 관행이 지금 틀릴 수 있다)',
  kbStale({ at: '2020-01-01' }) === true && kbStale({ at: '2026-07-01' }) === false
  && kbStale({}) === false);
ok('틀렸다고 표시된 카드는 따로 본다',
  kbBad({ flags: [{ by: 'u2' }] }) === true && kbBad({ flags: [] }) === false && kbBad({}) === false);

const IT = {
  ptype: '부당해고', cat: '사건', company: '나래산업', title: '천안지청 진정 건',
  officer: '강감독관', client: '홍길동',
  contacts: [{ name: '이차장', phone: '010-8284-7994', position: '인사팀장' }]
};
let rel = kbRelated(IT).map(c => c._id);
ok('업무 유형 카드가 붙는다', rel.indexOf('k1') >= 0);
ok('그 회사 카드가 붙는다', rel.indexOf('k4') >= 0);
ok('그 사람 카드가 붙는다 (상대기관 담당자)', rel.indexOf('k5') >= 0);
ok('업무 글에 기관 이름이 나오면 그 기관 카드도 붙는다', rel.indexOf('k6') >= 0);
ok('같은 카드를 두 번 붙이지 않는다', rel.length === new Set(rel).size);
ok('유형이 없으면 구분으로라도 찾는다', (function () {
  kb.cat.사건 = { k7: { t: '사건 공통', at: '2026-01-01' } };
  const r = kbRelated({ cat: '사건' }).map(c => c._id);
  delete kb.cat.사건;
  return r.indexOf('k7') >= 0;
})());
ok('사업장 담당자 이름으로도 카드를 찾는다', (function () {
  kb.person.이차장 = { k8: { t: '이 사람 성향', at: '2026-01-01' } };
  const r = kbRelated(IT).map(c => c._id);
  delete kb.person.이차장;
  return r.indexOf('k8') >= 0;
})());
ok('업무가 없으면 빈 목록 (터지지 않는다)', kbRelated(null).length === 0);

/* ══ 전체 검색 ══ */
items = {
  W1: { company: '나래산업', title: '부당해고 구제신청', mgr_main: { name: '김동현' },
        contacts: [{ name: '이차장', phone: '010-8284-7994' }, { name: '박대리', phone: '01099998888' }],
        mgr_subs: [{ name: '권형하' }],
        ho_note: { sit: '통상임금 다툼이 있었다', todo: '', qa: [{ q: '무엇이 남았나', a: '자료 정리' }],
                   retro: { diff: '초기 대응이 빨랐다' } } },
  W2: { company: '다른곳', title: '임금체불', state: 'done' }
};
_allLogs = { W1: { L1: { t: '천안지청 방문', d: '2026-07-01' }, L2: { t: '무관', d: '2026-06-01' } } };

ok('한 글자로는 찾지 않는다 (다 걸린다)', (function () {
  const r = searchAll('나');
  return r.items.length === 0 && r.cards.length === 0 && r.logs.length === 0;
})());
let R = searchAll('나래');
ok('업무 정보에서 찾는다', R.items.length === 1 && R.items[0].where.indexOf('업무 정보') >= 0);
R = searchAll('통상임금');
ok('인수인계 노트 본문에서도 찾는다', R.items.length === 1 && R.items[0].where.length > 0);
R = searchAll('자료 정리');
ok('AI 인터뷰 답에서도 찾는다', R.items.length === 1 && R.items[0].where.indexOf('AI 인터뷰') >= 0);
R = searchAll('초기 대응');
ok('회고에서도 찾는다', R.items.length === 1 && R.items[0].where.indexOf('회고') >= 0);
R = searchAll('천안지청');
ok('주간 기록 본문에서도 찾는다', R.logs.length === 1 && R.logs[0].iid === 'W1');
R = searchAll('이 회사 관행');
ok('지식 카드 본문에서도 찾는다', R.cards.length === 1 && R.cards[0]._id === 'k4');
ok('찾은 자리 이름이 겹치지 않는다', (function () {
  items.W3 = { company: '겹침', ho_note: { sit: '겹침', todo: '겹침' } };
  const r = searchAll('겹침').items.find(x => x.it._id === 'W3');
  delete items.W3;
  return r && r.where.length === new Set(r.where).size;
})());
ok('종료된 업무도 찾아준다 (지난 건을 다시 볼 때 쓴다)', searchAll('임금체불').items.length === 1);
ok('기록은 최근 것이 위로', (function () {
  _allLogs = { W1: { L1: { t: '천안지청 1차', d: '2026-07-01' }, L2: { t: '천안지청 2차', d: '2026-07-20' } } };
  const r = searchAll('천안지청').logs.map(x => x.l.d).join();
  _allLogs = { W1: { L1: { t: '천안지청 방문', d: '2026-07-01' }, L2: { t: '무관', d: '2026-06-01' } } };
  return r === '2026-07-20,2026-07-01';
})());

/* ── 찾기 규칙 ── */
ok('두 번째 담당자 이름으로도 찾힌다', matchQ(items.W1, '박대리') === true);
ok('전화는 하이픈이 있든 없든 찾힌다',
  matchQ(items.W1, '010-8284-7994') === true && matchQ(items.W1, '01082847994') === true);
ok('부담당 이름으로도 찾힌다', matchQ(items.W1, '권형하') === true);
ok('빈 검색어는 다 통과', matchQ(items.W1, '') === true);
ok('없는 말은 안 찾힌다', matchQ(items.W1, '없는말') === false);
ok('옛 자료(한 명짜리 contact)도 읽는다',
  matchQ({ contact: { name: '옛담당', phone: '02-111' } }, '옛담당') === true);
ok('담당자를 한 명도 안 적었으면 빈 목록',
  itemContacts({}).length === 0 && itemContacts({ contact: {} }).length === 0
  && itemContacts(null).length === 0);

/* ══ 인수인계 ══ */
ok('노트를 하나라도 채웠으면 작성한 것으로 본다',
  noteDone({ ho_note: { sit: '있음' } }) === true
  && noteDone({ ho_note: { files: '있음' } }) === true
  && noteDone({ ho_note: { sit: '   ' } }) === false
  && noteDone({}) === false);
items = {
  A: { ho: { to: { sid: 'u1', name: '김동현' }, confirmed: false, at: '2026-07-01T00:00:00Z' } },
  B: { ho: { to: { sid: 'u2', name: '권형하' }, confirmed: false, at: '2026-07-01T00:00:00Z' } },
  C: { ho: { to: { sid: 'u1' }, confirmed: true, at: '2026-07-01T00:00:00Z' } },
  D: { ho: { to: { sid: 'u1' }, confirmed: false, at: new Date().toISOString() } },
  E: { state: 'done', ho: { to: { sid: 'u1' }, confirmed: false, at: '2020-01-01T00:00:00Z' } }
};
ok('내가 받을 인수 대기만 센다', hoPendingToMe().map(i => i._id).join() === 'A,D');
ok('확인이 끝난 건은 빠진다', hoPendingToMe().every(i => i._id !== 'C'));
ok('종료된 건은 빠진다', hoPendingToMe().every(i => i._id !== 'E'));
ok('사번이 없어도 이름으로 잡는다', (function () {
  items.F = { ho: { to: { name: '김동현' }, confirmed: false, at: '2026-07-01T00:00:00Z' } };
  const r = hoPendingToMe().some(i => i._id === 'F'); delete items.F; return r;
})());
ok('확인이 늦어진 건은 따로 센다 (' + HO_OVERDUE_DAYS + '일)',
  hoOverdue().map(i => i._id).sort().join() === 'A,B');
ok('오늘 넘긴 건은 늦은 것이 아니다', hoOverdue().every(i => i._id !== 'D'));
ok('대표만 부재·지연까지 배지에 얹는다', (function () {
  leaving = { u9: { name: '나간사람', date: '2026-08-31' } };
  const asStaff = hoBadgeCount();
  S.me.title = '대표노무사';
  const asBoss = hoBadgeCount();
  S.me.title = '노무사';
  return asStaff === 2 && asBoss === 2 + 1 + 2;
})());
ok('끝난 부재는 배지에서 빠진다', (function () {
  leaving = { u9: { name: 'x', done: true } };
  const r = activeLeavings().length === 0; leaving = {}; return r;
})());

items = {
  A: { mgr_main: { sid: 'u9', name: '나간사람' } },
  B: { mgr_main: { sid: 'u1', name: '김동현' }, ho: { from: { sid: 'u9', name: '나간사람' } } },
  C: { mgr_main: { sid: 'u1', name: '김동현' } },
  D: { state: 'done', mgr_main: { sid: 'u9', name: '나간사람' } }
};
ok('부재자 건은 아직 그 사람 담당인 것 + 그 사람에게서 넘어간 것',
  leavingItems('u9', '나간사람').map(i => i._id).join() === 'A,B');
ok('종료된 건은 인수인계 목록에 안 올린다',
  leavingItems('u9', '나간사람').every(i => i._id !== 'D'));
ok('사번이 없어도 이름으로 잡는다', leavingItems('', '나간사람').length === 2);

items = { A: { ho: { from: { name: 'x' }, to: { name: '김동현' }, confirmed: false } } };
PATCHED = null; LOGGED = [];
confirmHo('A');
ok('인수 확인은 확인 표시와 시각만 더한다 (넘긴 사람 기록을 지우지 않는다)',
  PATCHED && PATCHED.f.ho.confirmed === true && !!PATCHED.f.ho.confirmed_at
  && PATCHED.f.ho.from.name === 'x');
PATCHED = null;
confirmHo('없는건');
ok('없는 건에는 아무 일도 안 한다', PATCHED === null);

/* ══ 명단에 없는 사람이 부담당으로만 남은 건 ══
   주담당이 빠지는 것은 「후임 지정」이 맡는다. 부담당은 넘길 일이 없고 이름만
   떼면 되는데, 주담당만 보는 목록이 이것을 못 잡아 팀 전체 담당 목록에 퇴사자
   이름이 계속 남아 있었다. */
const STAFF = [{ sid: 'u1', name: '김동현' }, { sid: 'u2', name: '권형하' }];
const SUBFIX = () => ({
  A: { mgr_main: { name: '김동현' }, mgr_subs: [{ sid: 'u9', name: '임혜미' }] },
  B: { mgr_main: { name: '권형하' }, mgr_subs: [{ name: '김동현' }, { sid: 'u9', name: '임혜미' }] },
  C: { mgr_main: { name: '김동현' }, mgr_subs: [{ name: '권형하' }] },
  D: { state: 'done', mgr_main: { name: '김동현' }, mgr_subs: [{ sid: 'u9', name: '임혜미' }] },
  E: { mgr_main: { name: '임혜미' } },
  F: { mgr_main: { name: '김동현' }, mgr_subs: [{ name: '박지호' }] }
});
items = SUBFIX();
let OS = orphanSubs(STAFF);
ok('명단에 없는 사람만 모은다', OS.map(o => o.name).join() === '박지호,임혜미');
ok('재직자는 부담당이어도 안 모은다', OS.every(o => o.name !== '김동현' && o.name !== '권형하'));
ok('그 사람이 부담당인 건만 센다', OS.filter(o => o.name === '임혜미')[0].items.map(i => i._id).join() === 'A,B');
ok('종료된 건은 세지 않는다 (그때 함께 했다는 기록이다)',
  OS.filter(o => o.name === '임혜미')[0].items.every(i => i._id !== 'D'));
ok('주담당으로만 남은 사람은 여기 안 온다 (후임 지정이 맡는다)',
  OS.every(o => o.items.every(i => i._id !== 'E')));
ok('이름순으로 준다', OS.map(o => o.name).join() === '박지호,임혜미');
ok('아무도 없으면 빈 목록', orphanSubs([{ sid: 'u9', name: '임혜미' }, { name: '박지호' }].concat(STAFF)).length === 0);
// 명단이 비면 부담당 전원이 "명단에 없는 사람"이 된다 — 터지지만 않으면 된다
ok('명단이 비어도 터지지 않는다',
  orphanSubs([]).map(o => o.name).join() === '권형하,김동현,박지호,임혜미'
  && orphanSubs(null).length === 4);

// 확인 대화가 Promise 라 결과는 다음 차례에 온다. 파일의 마무리는 엑셀 묶음이
// 쥐고 있으므로 여기서 끝내지 않고, 그 마지막 콜백에서 이 함수를 부른다.
function subTests(done) {
  items = SUBFIX();                 // 엑셀 묶음이 items 를 바꿔 놓았으므로 다시 깐다
  CONFIRM = false; UPDATED = null;
  dropSubAll('임혜미');
  setTimeout(function () {
    ok('확인을 누르지 않으면 아무것도 안 쓴다', UPDATED === null);
    CONFIRM = true; UPDATED = null;
    dropSubAll('임혜미');
    setTimeout(function () { subCheck(); done(); }, 0);
  }, 0);
}
function subCheck() {
  ok('진행 중인 두 건에서만 뗀다',
    UPDATED && UPDATED['work_erp/items/A/mgr_subs'] === null
    && !('work_erp/items/D/mgr_subs' in UPDATED));
  ok('같이 있던 다른 부담당은 남긴다', (function () {
    const b = UPDATED['work_erp/items/B/mgr_subs'];
    return b && b.length === 1 && b[0].name === '김동현';
  })());
  ok('마지막 한 명이면 칸을 비운다 (빈 배열을 남기지 않는다)',
    UPDATED['work_erp/items/A/mgr_subs'] === null);
  ok('주담당은 건드리지 않는다',
    !('work_erp/items/A/mgr_main' in UPDATED) && !('work_erp/items/E/mgr_main' in UPDATED));
  ok('상관없는 건은 손대지 않는다',
    !('work_erp/items/C/mgr_subs' in UPDATED) && !('work_erp/items/F/mgr_subs' in UPDATED));
  ok('손댄 시각을 남긴다', !!UPDATED['work_erp/items/A/up_at']);
  UPDATED = null;
  dropSubAll('없는사람');
  ok('뗄 건이 없으면 아무것도 안 한다', UPDATED === null);
}

/* ══ 엑셀 가져오기 ══ */
const RUN = grab('runImport');
ok('키가 겹치거나 없으면 아예 넣지 않는다 (그만큼 서로 덮어써 사라진다)',
  RUN.indexOf('if(kdup||kbad)') > 0 && RUN.indexOf('중단: 이관 키에 문제가 있습니다') > 0);
ok('원본 키가 아니라 실제로 쓰일 키로 검사한다 (a.b 와 a#b 는 같은 키가 된다)',
  RUN.indexOf('var k=safeKey(r.xk)') > 0);
ok('점·우물정자는 같은 키가 된다', safeKey('a.b') === safeKey('a#b'));

items = {
  X1: { src: 'excel' }, X2: { src: 'excel' },
  N1: { src: 'puerp', ref: { type: 'case', id: 'c1' } }, N2: {}
};
ok('엑셀 이관분만 지울 대상', excelImported().map(i => i._id).join() === 'X1,X2');
ONCE = { 'work_erp/itemlogs/X1': { L1: { w: '2026-W30' } }, 'work_erp/itemlogs/X2': {} };
excelWipePaths(null).then(function (w) {
  ok('업무·기록·주차별 기록 경로를 모두 모은다',
    w.n === 2 && w.paths['work_erp/items/X1'] === null
    && w.paths['work_erp/itemlogs/X1'] === null
    && w.paths['work_erp/logs/2026/2026-W30/X1/L1'] === null);
  ok('경로만 만들고 바로 지우지 않는다 — 등록과 한 번에 묶어야 실패해도 옛 자료가 남는다',
    W.indexOf('삭제와 새 데이터 등록을 한 번의 update()로 묶어야') > 0
    && RUN.indexOf('Object.keys(w.paths).forEach(function(k){ up[k]=null; })') > 0);
  ok('기록이 없는 건도 업무·기록 경로는 지운다',
    w.paths['work_erp/items/X2'] === null && w.paths['work_erp/itemlogs/X2'] === null);
  ok('연동 건·자체 건은 건드리지 않는다',
    !('work_erp/items/N1' in w.paths) && !('work_erp/items/N2' in w.paths));
  items = { N1: { src: 'puerp' } };
  excelWipePaths(null).then(function (e) {
    ok('이관분이 하나도 없으면 빈 결과', e.n === 0 && Object.keys(e.paths).length === 0);
    // 부담당 떼기는 확인 대화를 거치므로 여기서 이어 돌리고 마지막에 마무리한다
    subTests(function () {
      console.log('\n' + (fail ? 'FAILED ' + fail + '/' + (pass + fail) : 'ALL ' + pass + ' PASS'));
      process.exit(fail ? 1 : 0);
    });
  });
});
