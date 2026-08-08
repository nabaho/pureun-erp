/* 업무관리 ↔ 푸른이알피 자동 연동 — 기준일 · 미러 · 짝짓기 · 일괄 연결 · 진행 필드
   ⚠ 원래 임시 폴더에만 두었다가 한 번 날아갔다. 저장소에 둔다. */
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const W = fs.readFileSync(process.argv[2] || path.join(ROOT, 'work.html'), 'utf8');
const P = fs.readFileSync(path.join(ROOT, 'pu-erp.html'), 'utf8');

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
let S = { me: { sid: 'P-007', name: '김동현' }, vsid: 'P-007', vname: '김동현', year: 2026 };
let items = {}, peMaster = {}, peTypes = {}, _peU2N = { u1: '김동현', u2: '권형하' };
let UPDATED = null, TOASTS = [], DOM = {};
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function escJ(s) { return esc(String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/'/g, "\\'")); }
function $(k) { return DOM[k] || null; }
function _ls() { return null; }
function todayStr() { return '2026-08-01'; }
function pad(n) { return (n < 10 ? '0' : '') + n; }
function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
function toast(m, k) { TOASTS.push([m, k]); }
function closeM() {} function route() {} function showModal() {}
function allItems() { return Object.keys(items).map(k => Object.assign({ _id: k }, items[k])); }
function openItems() { return allItems().filter(it => it.state !== 'done'); }
function viewer() { return { sid: S.vsid, name: S.vname }; }
function peLinked(it) { return !!(it && it.src === 'puerp' && it.ref && it.ref.type && it.ref.id); }
function _mgrOf(it) { return (it.mgr_main && it.mgr_main.name) || '(담당 미지정)'; }
function loadStaff() { return Promise.resolve([{ sid: 'u1', name: '김동현' }, { sid: 'u2', name: '권형하' }]); }
const fbDb = { ref: () => ({ update: (u) => { UPDATED = u; return Promise.resolve(); } }) };

eval("var END_WAYS=[['done','종료','x','closed'],['cancel','취소','x','cancelled'],['transfer','이관','x','transferred']];\n"
  + 'var END_BY_PE={}; END_WAYS.forEach(function(w){ END_BY_PE[w[3]]=w[0]; });\n'
  + gvar('BRIEF_MAX') + '\n' + gvar('PE_DEF') + '\n' + gvar('PE_KEYS') + '\n'
  + gvar('PE_MIRROR') + '\n' + gvar('PE_TKEY') + '\n' + gvar('NO_PREFIX_SKIP') + '\n'
  + gvar('PE_ST_LABEL') + '\n' + gvar('KIND_ALIAS') + '\n'
  + ['catNorm', 'peTypeName', '_peRawType', 'peType', 'peStatus', 'peEndWay', '_peClosed', '_peDue',
     'briefTrim', 'safeKey', '_peArr', '_normCo', '_peCandOf', 'puerpCandidates',
     'isOf', 'roleOf', 'peMineUnlinked', 'peAllUnlinked', '_mtScore', 'matchPairs'].map(grab).join('\n'));

/* ── 후보 만들기: 종료된 건은 빼고, 기한은 앞으로 올 것부터 ── */
ok('종료된 건은 후보에서 뺀다',
  _peClosed({ status: 'closed' }) === true && _peClosed({ closedDate: '2026-01-01' }) === true
  && _peClosed({ status: 'progress' }) === false && _peClosed({}) === false);
ok('기한은 앞으로 올 것 중 가장 가까운 것',
  _peDue({ deadlines: [{ date: '2026-07-01' }, { date: '2026-08-20' }, { date: '2026-09-30' }] }) === '2026-08-20');
ok('모두 지났으면 가장 나중 것을 쓴다 (아무것도 안 보이면 놓친다)',
  _peDue({ deadlines: [{ date: '2026-06-01' }, { date: '2026-07-01' }] }) === '2026-07-01');
ok('기한이 없으면 빈 문자열', _peDue({}) === '' && _peDue({ deadlines: [] }) === '');

peTypes.case = [{ code: 'case-a', name: '부당해고' }];
peMaster = {
  case: [
    { id: 'c1', companyName: '나래산업', caseNo: '사건-2026-001', managerMain: 'u1',
      typeCodes: { case: 'case-a' }, payee: '홍길동', companyId: 'CO1',
      judgment: { org: '천안지청', officer: '강감독관', phone: '041-1', email: 'a@b' },
      status: 'progress', managerSubs: ['u2'], brief: '요약' },
    { id: 'c2', companyName: '끝난곳', caseNo: '사건-2026-002', managerMain: 'u1', status: 'closed' }
  ]
};
let cand = puerpCandidates();
ok('미종료 건만 후보로 올린다', cand.length === 1 && cand[0].ref.id === 'c1');
const c1 = cand[0];
ok('연동에 필요한 값이 모두 담긴다',
  c1.cat === '사건' && c1.ptype === '부당해고' && c1.company === '나래산업'
  && c1.no === '사건-2026-001' && c1.client === '홍길동' && c1.co_id === 'CO1'
  && c1.officer === '강감독관' && c1.jur_org === '천안지청' && c1.brief === '요약'
  && c1.mgr === '김동현' && c1.subs.join() === '권형하'
  && c1.ref.type === 'case' && c1.pid === 'PE-case-c1');
ok('마스터를 한 유형도 못 읽으면 null (빈 목록으로 오해하면 안 된다)', (function () {
  peMaster = {};
  const r = puerpCandidates();
  peMaster = { case: [{ id: 'c1', companyName: '나래산업', managerMain: 'u1' }] };
  return r === null;
})());

/* ── 아직 연결 안 된 건 ── */
items = {};
ok('내가 주담당인 미연결 건을 센다', peMineUnlinked().length === 1);
S.vsid = 'u2'; S.vname = '권형하';
ok('열람 대상을 바꾸면 그 사람 기준 (부담당은 안 센다)', peMineUnlinked().length === 0);
S.vsid = 'u1'; S.vname = '김동현';
items = { W1: { src: 'puerp', ref: { type: 'case', id: 'c1' } } };
ok('이미 연결된 건은 빠진다', peMineUnlinked().length === 0);
items = {};
ok('전 직원 목록은 주담당이 지정된 건만', peAllUnlinked().length === 1);
peMaster = { case: [{ id: 'c9', companyName: '담당없음', caseNo: 'x' }] };
ok('주담당이 없으면 전 직원 목록에도 안 넣는다', peAllUnlinked().length === 0);

/* ── 짝짓기: 기업명이 같은 것만, 점수순 최대 3개 ── */
peMaster = {
  case: [
    { id: 'p1', companyName: '나래산업', caseNo: '사건-2026-001', managerMain: 'u1', title: '부당해고 구제신청' },
    { id: 'p2', companyName: '(주)나래산업', caseNo: '사건-2026-002', managerMain: 'u1', title: '임금체불' },
    { id: 'p3', companyName: '다른곳', caseNo: '사건-2026-003', managerMain: 'u1' }
  ]
};
items = { W1: { src: 'excel', company: '나래산업', title: '부당해고 구제신청', mgr_main: { name: '김동현' } } };
let pairs = matchPairs();
ok('기업명이 같은 것만 후보 ((주)·공백 무시)',
  pairs.length === 1 && pairs[0].hits.length === 2
  && pairs[0].hits.every(h => h.c.ref.id !== 'p3'));
ok('업무명까지 같은 것이 맨 앞', pairs[0].hits[0].c.ref.id === 'p1');
ok('점수가 높을수록 확실한 짝', pairs[0].hits[0].s > pairs[0].hits[1].s);
items = { W1: { src: 'puerp', ref: { type: 'case', id: 'p1' }, company: '나래산업' } };
ok('이미 연동된 업무는 짝짓기 대상이 아니다', matchPairs().length === 0);
items = {
  W1: { src: 'excel', company: '나래산업', mgr_main: { name: '김동현' } },
  W2: { src: 'puerp', ref: { type: 'case', id: 'p1' } }      // p1 은 이미 W2 가 쓰고 있다
};
pairs = matchPairs();
ok('이미 다른 업무가 쓰고 있는 건은 후보에서 빠진다',
  pairs.length === 1 && pairs[0].hits.length === 1 && pairs[0].hits[0].c.ref.id === 'p2');
items = {
  W1: { src: 'excel', company: '나래산업', mgr_main: { name: '김동현' } },
  W2: { src: 'puerp', ref: { type: 'case', id: 'p1' } },
  W3: { src: 'puerp', ref: { type: 'case', id: 'p2' } }
};
ok('쓸 수 있는 짝이 하나도 없으면 목록에 안 나온다', matchPairs().length === 0);
items = { W1: { src: 'excel', company: '나래산업', state: 'done', mgr_main: { name: '김동현' } } };
ok('종료된 업무는 짝짓기 대상이 아니다', matchPairs().length === 0);
items = { W1: { src: 'excel', company: '전혀다른곳', mgr_main: { name: '김동현' } } };
ok('후보가 없는 업무는 목록에 안 나온다', matchPairs().length === 0);
peMaster = {};
ok('마스터를 못 읽으면 null', matchPairs() === null);

/* ── 미러: 푸른이알피가 원본인 칸 ── */
ok('미러 대상에 구분·유형·기업·의뢰인·관할·원본 상태가 들어 있다',
  ['no', 'cat', 'ptype', 'company', 'client', 'officer', 'title', 'due', 'start', 'co_id',
   'jur_org', 'jur_ph', 'jur_em', 'pe_st'].every(f => PE_MIRROR.indexOf(f) >= 0));
const SYNC = grab('peAutoSync');
ok('첫 만남에는 기준선만 찍고 아무것도 만들지 않는다 (대량 오생성 방지)',
  SYNC.indexOf('pe_since') > 0 || /기준/.test(SYNC));
ok('사용자가 지운 건은 pe_seen 때문에 되살아나지 않는다',
  SYNC.indexOf('pe_seen') > 0 && grab('runPuerpImport').indexOf("/pe_seen/") > 0);
ok('푸른이알피에서 바뀐 칸만 갱신한다 (스냅샷 pe_m 과 견준다)',
  SYNC.indexOf('pe_m') > 0 && SYNC.indexOf("if(String(m[f]||'')!==nm[f])") > 0);
ok('담당이 없으면 대표에게 두고 그렇다고 표시한다',
  SYNC.indexOf('pe_nomgr') > 0);
ok('원본이 사라져도 업무와 기록은 보존하고 표시만 한다',
  SYNC.indexOf('pe_gone') > 0);
ok('업무 요약은 미러에 넣지 않는다 (양방향이라 덮으면 안 된다)',
  PE_MIRROR.indexOf('brief') < 0);

/* ── 푸른이알피 엔진: 진행 필드는 그쪽이 자기 손으로 쓴다 ── */
const ENG = P.slice(P.indexOf('// ── 업무시트 ↔ 푸른이알피'), P.indexOf('function refreshDash()'));
ok('진행 필드는 project_progress 에 담기고 배열 통째로 저장된다',
  ENG.indexOf("dbGet('project_progress', [])") > 0 && ENG.indexOf("dbSet('project_progress', PP)") > 0);
ok('업무시트가 그 배열을 직접 쓰지 않는다 (다음 전체 저장에 덮인다)',
  W.indexOf('project_progress') < 0);
ok('진행 필드는 담당자 본인 것만 맞춘다 (남의 행을 만들면 안 된다)',
  ENG.indexOf('var mine = !!(w.mgr_main && w.mgr_main.sid && w.mgr_main.sid === sid)') > 0);
ok('진행률은 진행 단계에서 뽑는다', ENG.indexOf('function wsProg(wid)') > 0);
ok('한쪽만 바뀌었으면 그쪽, 둘 다면 최근에 손댄 쪽 (pick3)',
  ENG.indexOf('function pick3') > 0 || ENG.indexOf('pick3(') > 0);
ok('업무 요약은 종료된 건도 계속 맞춘다', ENG.indexOf('종료된 건도 요약은 계속 맞춘다') > 0);
ok('사업장 담당자는 첫 사람만 바꿔 나머지 연락처를 지킨다',
  ENG.indexOf('company를 통째로 갈지 않고') > 0);
ok('푸른이알피 쓰기는 모두 dbPatch 로', (function () {
  const tail = ENG.slice(ENG.indexOf('toPe.forEach'));
  return /dbPatch\(/.test(tail) && !/fbDb\.ref\('data\//.test(ENG);
})());

/* ── 역할 판정 ── */
const IT = { mgr_main: { sid: 'u1', name: '김동현' }, mgr_subs: [{ sid: 'u2', name: '권형하' }] };
ok('주담당·부담당·남남을 가른다',
  roleOf(IT, { sid: 'u1' }) === 'main' && roleOf(IT, { sid: 'u2' }) === 'sub'
  && roleOf(IT, { sid: 'u9' }) === '' && roleOf(IT, null) === '');
ok('사번이 없으면 이름으로도 본다',
  roleOf(IT, { name: '김동현' }) === 'main' && roleOf(IT, { name: '권형하' }) === 'sub');
ok('주담당이든 부담당이든 내 업무에 들어온다',
  isOf(IT, { sid: 'u1' }) && isOf(IT, { sid: 'u2' }) && !isOf(IT, { sid: 'u9' }));

console.log('\n' + (fail ? 'FAILED ' + fail + '/' + (pass + fail) : 'ALL ' + pass + ' PASS'));
process.exit(fail ? 1 : 0);
