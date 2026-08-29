/* 업무관리 구분(계약·사건·…)과 업무명(유형) — 푸른이알피 값을 어떻게 읽는가
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

let S = {}, items = {}, peMaster = {}, peTypes = {}, _peU2N = { u1: '김동현' };
let UPDATED = null, TOASTS = [];
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function escJ(s) { return esc(String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/'/g, "\\'")); }
function _ls() { return null; }
function todayStr() { return '2026-08-01'; }
function pad(n) { return (n < 10 ? '0' : '') + n; }
function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
function toast(m, k) { TOASTS.push([m, k]); }
let DOM = {};
function $(k) { return DOM[k] || null; }
function closeM() {} function route() {} function showModal() {}
function peLinked(it) { return !!(it && it.src === 'puerp' && it.ref && it.ref.type && it.ref.id); }
function allItems() { return Object.keys(items).map(k => Object.assign({ _id: k }, items[k])); }
function openItems() { return allItems().filter(it => it.state !== 'done'); }
const fbDb = { ref: () => ({ update: (u) => { UPDATED = u; return Promise.resolve(); } }) };
const NS = 'work_erp';

eval("var END_WAYS=[['done','종료','x','closed'],['cancel','취소','x','cancelled'],['transfer','이관','x','transferred']];\n"
  + 'var END_BY_PE={}; END_WAYS.forEach(function(w){ END_BY_PE[w[3]]=w[0]; });\n'
  + 'var END_BY_KEY={}; END_WAYS.forEach(function(w){ END_BY_KEY[w[0]]=w; });\n'
  + gvar('BRIEF_MAX') + '\n' + gvar('CATS') + '\n' + gvar('CAT_PALETTE') + '\n'
  + gvar('KIND_SET') + '\n' + gvar('KIND_ALIAS') + '\n'
  + gvar('PE_DEF') + '\n' + gvar('PE_KEYS') + '\n' + gvar('PE_MIRROR') + '\n'
  + gvar('PE_TKEY') + '\n' + gvar('NO_PREFIX_SKIP') + '\n' + gvar('PE_ST_LABEL') + '\n'
  + gvar('PE_CKIND') + '\n'   // 계약 종류(업체계약·컨설팅계약…) — peType 이 쓴다

  + ['catNorm', 'isKind', 'catColor', 'catList', 'catBadge',
     'peTypeName', '_peRawType', 'peType', 'peStatus', 'peEndWay', '_peClosed', '_peDue',
     'briefTrim', 'itemName', 'ptOf', 'needBrief', 'nameCell',
     'safeKey', '_peArr', '_peCandOf', 'puerpCandidates',
     'kindFixList', 'kindFixRun'].map(grab).join('\n'));

/* ── 유형 코드 → 이름 ──
   푸른이알피는 유형을 코드로 저장하고 이름은 유형 마스터에 따로 둔다.
   코드만 보면 case-mpz7pd42ogb 같은 내부 ID가 화면에 튀어나온다. */
peTypes.case = [{ code: 'case-a', name: '부당해고' }, { code: 'case-c', name: '부당정직', hidden: true }];
peTypes.consulting = [{ code: 'cons-a', name: '일터혁신 상생 컨설팅' }];
peTypes.company = [{ code: 'co-a', name: '취업규칙' }, { code: 'co-b', name: '새마을금고 점검' }];

ok('코드를 마스터 이름으로 바꾼다', peTypeName('case', 'case-a') === '부당해고');
ok('숨김 유형도 이름을 찾는다 (옛 자료의 이름이 사라지면 안 된다)',
  peTypeName('case', 'case-c') === '부당정직');
ok('마스터에 없어도 사람이 읽는 말이면 그대로', peTypeName('case', '임금체불') === '임금체불');
ok('숫자가 섞인 코드는 내부 ID로 보고 버린다',
  peTypeName('case', 'case-mpz7pd42ogb') === '' && peTypeName('case', 'x1') === '');
ok('빈 코드는 빈 문자열',
  peTypeName('case', '') === '' && peTypeName('case', null) === '' && peTypeName('case', '  ') === '');

ok('사건은 유형 이름이 업무명이 된다 ("사건"이 아니라 "부당해고")',
  peType('case', { typeCodes: { case: 'case-a' }, caseNo: '사건-2026-012' }, '') === '부당해고');
ok('컨설팅도 마찬가지',
  peType('consulting', { typeCodes: { consulting: 'cons-a' } }, '') === '일터혁신 상생 컨설팅');
ok('typeCode 한 칸만 있는 옛 자료도 푼다',
  peType('case', { typeCode: 'case-a' }, '') === '부당해고');
/* 계약은 「종류」(업체계약·컨설팅계약…)를 앞에 두고 세부 유형을 뒤에 붙인다.
   종전에는 세부 유형만 찾아, 유형 코드가 비면 업무명이 통째로 비어 「—」였다 —
   계약인 것은 알아도 무슨 계약인지 알 수가 없었다. */
ok('계약은 붙어 있는 종류를 모두 이어 준다',
  peType('contract', { kinds: ['company', 'case'], typeCodes: { company: 'co-a', case: 'case-a' } }, '')
    === '업체계약 취업규칙 · 사건계약 부당해고');
ok('같은 이름이 두 번 나오지 않는다',
  peType('contract', { kinds: ['company', 'company'], typeCodes: { company: '점검' } }, '') === '업체계약 점검');
ok('kind 한 개짜리 옛 자료도 읽는다',
  peType('contract', { kind: 'company', typeCodes: { company: 'co-b' } }, '') === '업체계약 새마을금고 점검');
ok('마스터에 없으면 예전 칸으로 내려간다',
  peType('contract', { kinds: ['consulting'], consultingType: '현장클리닉' }, '') === '컨설팅계약 현장클리닉');
/* ⚠ 이것이 이번 수술의 요점 — 세부 유형이 없어도 종류는 남아야 한다.
   여기가 비면 화면에 「—」만 뜨고 무슨 계약인지 알 수 없다. */
ok('세부 유형이 없어도 종류는 남는다',
  peType('contract', { kinds: ['consulting'] }, '') === '컨설팅계약'
  && peType('contract', { kinds: ['company', 'fund'] }, '') === '업체계약 · 기금관리');
ok('기타사업은 관리번호 접두어가 업무명',
  peType('other', { projectNo: '기술보호-2026-006' }, '') === '기술보호');
ok('접두어가 구분과 같은 말이면 버린다 ("계약"은 무슨 일인지 알려 주지 않는다)',
  peType('contract', { contractNo: '계약-2026-027' }, '') === ''
  && peType('case', { caseNo: '사건-2026-012' }, '') === ''
  && peType('fund', { fundNo: '기금-2026-003' }, '') === '');
ok('종류 이름으로 때우지 않는다', peType('contract', {}, '') === '');
ok('한 글자 접두어는 유형으로 쓰지 않는다', peType('other', { no: 'A-2026-001' }, '') === '');
ok('내부 ID가 섞인 예전 칸도 쓰지 않는다',
  peType('case', { caseType: 'case-mpz7pd42ogb' }, '') === '');

/* ── 구분 = 사무관리 5종, 옛 이름은 계약으로 ── */
ok('라벨 5종이 계약·사건·컨설팅·기금·기타사업',
  PE_DEF.map(d => d[1]).join() === '계약,사건,컨설팅,기금,기타사업');
ok('옛 이름 업체는 계약으로 읽는다',
  catNorm('업체') === '계약' && isKind('업체') && isKind('계약'));
ok('다른 이름은 건드리지 않는다',
  catNorm('사건') === '사건' && catNorm('기술보호') === '기술보호'
  && catNorm('') === '' && catNorm(null) === '');
ok('배지가 계약으로 나온다', catBadge('업체').indexOf('>계약<') > 0);
ok('업체·계약이 같은 색', CATS['업체'][0] === CATS['계약'][0]);
items = { A: { cat: '업체' }, B: { cat: '계약' }, C: { cat: '기술보호' } };
ok('구분 목록에 업체가 두 번 서지 않는다',
  catList().filter(x => x === '계약').length === 1 && catList().indexOf('업체') < 0);
ok('사무관리 5종이 맨 앞', catList().slice(0, 5).join() === Object.keys(KIND_SET).join());
ok('실제로 쓰인 값도 뒤에 붙는다', catList().indexOf('기술보호') > 0);
ok('목록에 없는 이름도 색이 나오고 늘 같은 색',
  catColor('기술보호')[0] === catColor('기술보호')[0] && catColor('')[0]);

/* ── 후보 만들기 ── */
_peU2N = { u1: '김동현' };
peMaster = { contract: [{ id: 'k1', companyName: '케이블루', contractNo: '계약-2026-027', managerMain: 'u1' }] };
let c = puerpCandidates()[0];
ok('계약관리 건은 구분이 계약', c.cat === '계약');
ok('회사명을 업무명으로 쓰지 않는다 (기업 칸과 겹치고 마스터가 더러워진다)', c.title === '');
peMaster = { case: [{ id: 'c1', companyName: '나래', title: '부당해고 구제신청', managerMain: 'u1' }] };
ok('푸른이알피 업무명이 있으면 그대로', puerpCandidates()[0].title === '부당해고 구제신청');

/* ── 목록에 보일 이름 ── */
ok('한 줄 이름은 요약 → 업무명 → 유형 차례',
  itemName({ brief: '기술보호 컨설팅', title: 'T', ptype: '기술보호' }) === '기술보호 컨설팅'
  && itemName({ brief: '', title: '부당해고 구제신청', ptype: '부해' }) === '부당해고 구제신청'
  && itemName({ brief: '', title: '', ptype: '현장클리닉' }) === '현장클리닉'
  && itemName({ brief: '', title: '', ptype: '', cat: '계약', company: '케이블루' }) === '');
ok('공백만 있는 값은 없는 것으로 본다',
  itemName({ brief: '   ', title: '  ', ptype: '현장클리닉' }) === '현장클리닉');
ok('업무명 필터가 묶는 기준은 유형',
  ptOf({ ptype: '부당해고', title: '부당해고 구제신청' }) === '부당해고'
  && ptOf({ ptype: '', title: '취업규칙 정비' }) === '취업규칙 정비'
  && ptOf({}) === '' && ptOf(null) === '');
ok('업무 칸: 유형이 앞, 요약이 아랫줄', (function () {
  const h = nameCell({ _id: 'W1', ptype: '부당해고', brief: '퇴직금 미지급 진정' });
  return h.indexOf('부당해고') < h.indexOf('퇴직금 미지급 진정') && h.indexOf('class="brf"') > 0;
})());
ok('유형과 업무명이 다르면 둘 다',
  nameCell({ _id: 'W1', ptype: '부당해고', title: '2차 심판청구' }).indexOf('부당해고 · 2차 심판청구') > 0);
ok('같으면 한 번만',
  nameCell({ _id: 'W1', ptype: '임금체불', title: '임금체불' }).indexOf('임금체불 · 임금체불') < 0);
ok('요약만 있으면 요약을 올려 쓴다 (같은 말을 두 번 쓰지 않는다)', (function () {
  const h = nameCell({ _id: 'W1', brief: '일터혁신 컨설팅' });
  return h.indexOf('일터혁신 컨설팅') > 0 && h.indexOf('class="brf"') < 0 && h.indexOf('이름 적기') < 0;
})());
ok('셋 다 비면 바로 적을 수 있는 버튼', nameCell({ _id: 'W1' }).indexOf('이름 적기') > 0);
ok('회사명·구분은 업무 칸에 절대 안 나온다', (function () {
  const h = nameCell({ _id: 'W1', cat: '계약', company: '케이블루' });
  return h.indexOf('케이블루') < 0 && h.indexOf('계약') < 0;
})());
ok('작은따옴표가 든 업무ID도 핸들러가 안 깨진다', nameCell({ _id: "W'1" }).indexOf("W\\'1") > 0);
ok('채울 대상은 셋 다 빈 것만',
  needBrief({ brief: '', title: '', ptype: '' }) === true
  && needBrief({ brief: '', title: '', ptype: '현장클리닉' }) === false
  && needBrief({ brief: '기술보호', title: '' }) === false);
ok('업무 요약은 40자에서 자르고 공백을 정리한다',
  briefTrim('  기술보호   컨설팅  ') === '기술보호 컨설팅'
  && briefTrim('가'.repeat(60)).length === BRIEF_MAX);

/* ── 원본 상태(계약관리 등) ── */
ok('계약관리 상태를 우리말로', peStatus({ status: 'consult' }) === '상담접수'
  && peStatus({ status: 'review' }) === '검토중' && peStatus({ status: 'signed' }) === '최종확정');
ok('사건·컨설팅 상태도 같은 표로',
  peStatus({ status: 'progress' }) === '진행중' && peStatus({ status: 'hold' }) === '보류');
ok('이미 우리말이면 그대로', peStatus({ status: '상담접수' }) === '상담접수');
ok('모르는 코드는 버린다 (화면에 영어가 튀어나오지 않게)',
  peStatus({ status: 'weird_code' }) === '' && peStatus({}) === '' && peStatus(null) === '');
ok('옛 칸(progressStatus)도 읽는다', peStatus({ progressStatus: 'review' }) === '검토중');
ok('푸른이알피가 쓰는 짝과 같다', (function () {
  const i = P.indexOf("var sMap = { progress:'진행중'");
  const blk = P.slice(i, i + 260);
  return ["progress:'진행중'", "review:'검토중'", "consult:'상담접수'", "signed:'최종확정'"]
    .every(s => blk.indexOf(s) > 0);
})());

/* ── 구분 정리 (엑셀 이관분: 구분 칸에 유형이 들어가 있던 것) ── */
items = {
  A: { cat: '부해', ptype: '', src: 'excel' },                       // 대상
  B: { cat: '계약', ptype: '', src: 'excel' },                       // 이미 5종
  C: { cat: '부해', ptype: '있음', src: 'excel' },                   // 유형이 이미 있다
  D: { cat: '부해', ptype: '', src: 'puerp', ref: { type: 'case', id: 'x' } }, // 연결됨 — 미러가 맞춘다
  E: { cat: '부해', ptype: '', src: 'excel', state: 'done' },         // 종료
  F: { cat: '', ptype: '', src: 'excel' }                            // 구분이 비었다
};
const fix = kindFixList().map(x => x._id).sort();
ok('정리 대상은 연결 안 됨 + 구분이 5종이 아님 + 유형이 비어 있음', fix.join() === 'A');
ok('이미 연결된 건은 건드리지 않는다 (미러가 알아서 맞춘다)', fix.indexOf('D') < 0);
ok('종료된 건은 제외', fix.indexOf('E') < 0);
ok('구분이 비어 있으면 제외', fix.indexOf('F') < 0);
UPDATED = null; kindFixRun();
ok('정리하면 유형이 제자리로 가고 구분은 기타가 된다',
  UPDATED[NS + '/items/A/ptype'] === '부해' && UPDATED[NS + '/items/A/cat'] === '기타');
ok('대상이 아닌 건은 손대지 않는다',
  Object.keys(UPDATED).every(k => k.indexOf('/items/B/') < 0 && k.indexOf('/items/D/') < 0));
items = {};
UPDATED = null; DOM = { 'kf-msg': { textContent: '' } }; kindFixRun();
ok('대상이 없으면 저장하지 않고 그 자리에 알린다',
  UPDATED === null && /정리할 항목이 없습니다/.test(DOM['kf-msg'].textContent));

console.log('\n' + (fail ? 'FAILED ' + fail + '/' + (pass + fail) : 'ALL ' + pass + ' PASS'));
process.exit(fail ? 1 : 0);
