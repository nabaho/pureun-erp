/* 사건 심급·단계 — 단계 카탈로그·기한 계산·현재 단계(stageCode)·화면 배선
   - 심급(지노위 → 중노위 → 행정소송 / 요양신청 → 심사청구 → 재심사청구)을 사건에 붙인다
   - 기한 일수는 법정 기한이라 시드는 모두 dueVerified:false — 화면에 '확인 후 사용' 표시가 붙어야 한다
   - 단계가 없는 옛 사건은 예전과 똑같이 동작해야 한다 (stageCode 를 새로 만들지 않는다) */
const fs = require('fs'), vm = require('vm'), path = require('path');
const TARGET = process.argv[2] || path.join(__dirname, '..', 'pu-erp.html');
const html = fs.readFileSync(TARGET, 'utf8');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? ' — ' + extra : '')); }
}
function eq(name, a, b) { ok(name + '  (' + JSON.stringify(a) + ')', JSON.stringify(a) === JSON.stringify(b), 'want ' + JSON.stringify(b)); }
function count(s) { return html.split(s).length - 1; }
function slice(a, b) {
  const i = html.indexOf(a); if (i < 0) throw new Error('못찾음: ' + a);
  const j = html.indexOf(b, i); if (j < 0) throw new Error('끝 못찾음: ' + b);
  return html.slice(i, j);
}

/* ── 실제 코드를 그대로 떼어 모래상자에서 돌린다 (시드도 파일 원본) ── */
const STAGE_SRC = slice('// ============ 사건 심급·단계 카탈로그 ============', '// ── 사건 심급·단계 카탈로그 끝 ──');
const ctx = { console, Object, Array, String, Number, JSON, Math, Date, parseInt, parseFloat, window: {}, __store: {} };
ctx.dbGet = function (k, d) { return Object.prototype.hasOwnProperty.call(ctx.__store, k) ? ctx.__store[k] : d; };
ctx.dbSet = function (k, v) { ctx.__store[k] = v; };
vm.createContext(ctx);
vm.runInContext(STAGE_SRC, ctx);

const KEY = 'biz_case_stages';
const getStages = ctx.getCaseStages;
const stageInfo = ctx.caseStageInfo;
const stageDue = ctx.caseStageDue;
const nextDue = ctx.caseNextDue;
const syncCode = ctx.caseSyncStageCode;
const ordered = ctx.caseStagesOrdered;
function names(arr) { return (arr || []).map(function (x) { return x.name; }); }
function reset() { delete ctx.__store[KEY]; }

/* ══ ① 창(window) 노출 — 다른 화면에서 부를 수 있어야 한다 ══ */
ok('helpers 가 window 에 노출돼 있다',
  typeof ctx.window.getCaseStages === 'function' && typeof ctx.window.caseStageDue === 'function'
  && typeof ctx.window.caseNextDue === 'function' && typeof ctx.window.caseStageInfo === 'function');

/* ══ ② 유형별 단계 목록 ══ */
reset();
const dismiss = names(getStages('case-dismiss'));
ok('부해 → 지노위', dismiss.indexOf('지방노동위원회') >= 0, JSON.stringify(dismiss));
ok('부해 → 중노위', dismiss.indexOf('중앙노동위원회') >= 0, JSON.stringify(dismiss));
ok('부해 → 행정소송', dismiss.indexOf('행정소송') >= 0, JSON.stringify(dismiss));
ok('★ 부해에 요양신청은 안 나온다', dismiss.indexOf('요양신청') < 0, JSON.stringify(dismiss));
ok('부해에 진정·신고도 안 나온다', dismiss.indexOf('진정·신고') < 0, JSON.stringify(dismiss));

const injury = names(getStages('case-injury'));
ok('산재 → 요양신청', injury.indexOf('요양신청') >= 0, JSON.stringify(injury));
ok('산재 → 심사청구', injury.indexOf('심사청구') >= 0, JSON.stringify(injury));
ok('산재 → 재심사청구', injury.indexOf('재심사청구') >= 0, JSON.stringify(injury));
ok('산재 → 행정소송도 (공단 처분 취소소송)', injury.indexOf('행정소송') >= 0, JSON.stringify(injury));
ok('★ 산재에 지노위는 안 나온다', injury.indexOf('지방노동위원회') < 0, JSON.stringify(injury));

const wage = names(getStages('case-wage'));
eq('체불 → 진정·조사·확정 3단계', wage, ['진정·신고', '조사·수사', '확정·지급']);

eq('빈 유형 → 전체 9개', getStages('').length, 9);
eq('없는 유형 → 전체 9개', getStages('case-nope').length, 9);
eq('유형 안 주면 전체', getStages().length, 9);
eq('sortOrder 순으로 나온다', names(getStages(''))[0], '지방노동위원회');

/* ── 첫 호출에 저장소로 씨를 뿌리고, 그 다음엔 저장값을 쓴다 ── */
reset();
ok('첫 호출 전에는 저장소가 비어 있다', ctx.__store[KEY] === undefined);
getStages('');
ok('★ 첫 호출이 저장소에 시드를 넣는다', Array.isArray(ctx.__store[KEY]) && ctx.__store[KEY].length === 9);
ctx.__store[KEY] = [{ code: 'my-own', name: '대표가 고친 단계', short: '대표', orgKind: 'lrc', forTypes: [], dueDays: 7, dueFrom: 'notice', dueVerified: true, sortOrder: 10 }];
eq('★ 저장값이 있으면 시드로 덮지 않는다', names(getStages('')), ['대표가 고친 단계']);
eq('저장값은 유형을 안 걸어도 다 나온다', names(getStages('case-dismiss')), ['대표가 고친 단계']);
eq('caseStageInfo 도 저장값을 읽는다', (stageInfo('my-own') || {}).name, '대표가 고친 단계');
eq('없는 코드는 null', stageInfo('없는코드'), null);
eq('빈 코드는 null', stageInfo(''), null);
reset();
eq('시드 복귀 후 지노위 dueDays', (stageInfo('lrc-local') || {}).dueDays, 10);
eq('중노위 dueDays', (stageInfo('lrc-central') || {}).dueDays, 15);
eq('요양신청 dueDays', (stageInfo('wc-apply') || {}).dueDays, 90);
eq('행정소송은 기한 없음', (stageInfo('court-admin') || {}).dueDays, 0);

/* ══ ③ 기한 계산 (달력일, 시간대에 밀리지 않아야 한다) ══ */
const D10 = { dueDays: 10, dueFrom: 'notice' };
eq('송달 2026-07-15 + 10일', stageDue({ noticeDate: '2026-07-15' }, D10), { due: '2026-07-25', basis: 'notice', days: 10 });
eq('★ 해 넘김 2026-12-28 + 10일', (stageDue({ noticeDate: '2026-12-28' }, D10) || {}).due, '2027-01-07');
eq('달 넘김 2026-07-25 + 10일', (stageDue({ noticeDate: '2026-07-25' }, D10) || {}).due, '2026-08-04');
eq('★ 윤년 2028-02-20 + 10일 (2월 29일이 있다)', (stageDue({ noticeDate: '2028-02-20' }, D10) || {}).due, '2028-03-01');
eq('평년 2027-02-20 + 10일', (stageDue({ noticeDate: '2027-02-20' }, D10) || {}).due, '2027-03-02');
eq('중노위 15일', (stageDue({ noticeDate: '2026-07-15' }, { dueDays: 15, dueFrom: 'notice' }) || {}).due, '2026-07-30');
eq('산재 90일', (stageDue({ noticeDate: '2026-01-01' }, { dueDays: 90, dueFrom: 'notice' }) || {}).due, '2026-04-01');

eq('기산일 없으면 null', stageDue({ noticeDate: '' }, D10), null);
eq('기산일 칸 자체가 없으면 null', stageDue({}, D10), null);
eq('날짜 형식이 아니면 null', stageDue({ noticeDate: '2026.07.15' }, D10), null);
eq('dueDays 0 이면 null', stageDue({ noticeDate: '2026-07-15' }, { dueDays: 0, dueFrom: 'notice' }), null);
eq('dueDays 없으면 null', stageDue({ noticeDate: '2026-07-15' }, { dueFrom: 'notice' }), null);
eq('단계 없으면 null', stageDue(null, D10), null);
eq('정의 없으면 null', stageDue({ noticeDate: '2026-07-15' }, null), null);

const DR = { dueDays: 30, dueFrom: 'result' };
eq('★ dueFrom result 는 판정일을 읽는다',
  stageDue({ noticeDate: '2026-01-01', resultDate: '2026-03-01' }, DR), { due: '2026-03-31', basis: 'result', days: 30 });
eq('dueFrom result 인데 판정일이 없으면 null (송달일로 대신하지 않는다)',
  stageDue({ noticeDate: '2026-01-01', resultDate: '' }, DR), null);
eq('dueFrom 이 비면 송달일 기준', (stageDue({ noticeDate: '2026-07-15' }, { dueDays: 10, dueFrom: '' }) || {}).basis, 'notice');

/* ══ ④ 사건 단위 다음 기한 (아직 안 지난 것 중 가장 이른 것) ══ */
ctx.__store[KEY] = [
  { code: 'a', name: 'A', dueDays: 10, dueFrom: 'notice', sortOrder: 10 },
  { code: 'b', name: 'B', dueDays: 20, dueFrom: 'notice', sortOrder: 20 },
  { code: 'z', name: 'Z', dueDays: 0, dueFrom: '', sortOrder: 30 }
];
const recMix = { stages: [
  { id: 's1', code: 'a', noticeDate: '2026-06-01' },   // 2026-06-11 — 이미 지남
  { id: 's2', code: 'b', noticeDate: '2026-07-01' },   // 2026-07-21
  { id: 's3', code: 'a', noticeDate: '2026-06-25' }    // 2026-07-05 ← 가장 이른 미경과
] };
eq('★ 아직 안 지난 것 중 가장 이른 기한', (nextDue(recMix, '2026-07-01') || {}).due, '2026-07-05');
eq('그 기한이 어느 단계인지도 알려준다', (nextDue(recMix, '2026-07-01') || {}).stageId, 's3');
eq('기준일이 뒤로 가면 다음 기한으로 넘어간다', (nextDue(recMix, '2026-07-06') || {}).due, '2026-07-21');
eq('모두 지났으면 null', nextDue(recMix, '2027-01-01'), null);
eq('기한 당일은 아직 안 지난 것', (nextDue(recMix, '2026-07-05') || {}).due, '2026-07-05');
eq('기한 있는 단계가 없으면 null', nextDue({ stages: [{ code: 'z', noticeDate: '2026-06-01' }] }, '2026-07-01'), null);
eq('기산일이 안 채워졌으면 null', nextDue({ stages: [{ code: 'a', noticeDate: '' }] }, '2026-07-01'), null);
eq('단계가 없으면 null', nextDue({ stages: [] }, '2026-07-01'), null);
eq('stages 칸이 없는 옛 사건도 null', nextDue({ caseNo: '부해-2026-001' }, '2026-07-01'), null);
eq('사건이 없으면 null', nextDue(null, '2026-07-01'), null);

/* ══ ⑤ 현재 단계(stageCode) — 사람이 고르는 값이 아니라 stages 에서 뽑는다 ══ */
reset();
const st3 = [
  { id: '1', code: 'lrc-local', filedDate: '2026-01-10' },
  { id: '2', code: 'lrc-central', filedDate: '2026-03-10' },
  { id: '3', code: 'court-admin', filedDate: '2026-06-10' }
];
eq('★ stageCode = 마지막 단계 코드', syncCode({ stages: st3 }).stageCode, 'court-admin');
eq('입력 순서가 뒤죽박죽이어도 접수일이 가장 늦은 것이 현재 단계',
  syncCode({ stages: [st3[2], st3[0], st3[1]] }).stageCode, 'court-admin');
eq('단계 하나면 그것이 현재 단계', syncCode({ stages: [st3[0]] }).stageCode, 'lrc-local');
eq('접수일이 아직 없는 단계는 방금 넣은 것 → 현재 단계',
  syncCode({ stages: [st3[0], { id: '9', code: 'wc-apply', filedDate: '' }] }).stageCode, 'wc-apply');
eq('현재 단계가 바뀌면 stageCode 도 따라간다',
  syncCode({ stageCode: 'lrc-local', stages: st3 }).stageCode, 'court-admin');
eq('★ 단계가 비면 stageCode 도 빈다', syncCode({ stageCode: 'lrc-local', stages: [] }).stageCode, '');
ok('★ 단계가 없던 옛 사건은 손대지 않는다 (stageCode 를 새로 만들지 않는다)',
  !Object.prototype.hasOwnProperty.call(syncCode({ caseNo: '부해-2026-001' }), 'stageCode'));
ok('옛 사건은 객체 자체가 그대로다 (저장 내용이 예전과 같다)',
  (function () { const old = { caseNo: '부해-2026-001', status: 'progress' }; return syncCode(old) === old; })());
eq('빈 stages 배열만 있고 stageCode 도 없으면 그대로',
  JSON.stringify(syncCode({ caseNo: 'x', stages: [] })), JSON.stringify({ caseNo: 'x', stages: [] }));
eq('정렬은 접수일 오름차순', ordered([st3[2], st3[0], st3[1]]).map(function (s) { return s.id; }), ['1', '2', '3']);
eq('접수일이 같으면 입력 순서 유지',
  ordered([{ id: 'a', filedDate: '2026-01-01' }, { id: 'b', filedDate: '2026-01-01' }]).map(function (s) { return s.id; }), ['a', 'b']);
eq('배열이 아니면 빈 배열', ordered(null), []);

/* ══ ⑥ 시드는 전부 '확인 필요' ══ */
const SEED_SRC = slice('var BIZ_CASE_STAGE_SEED = [', '// 기관 종류별 색');
eq('★ 시드 9개 모두 dueVerified:false', (SEED_SRC.match(/dueVerified:false/g) || []).length, 9);
ok('★ 시드에 dueVerified:true 가 하나도 없다', SEED_SRC.indexOf('dueVerified:true') < 0);
reset();
ok('불러온 시드도 전부 미확인', getStages('').every(function (s) { return s.dueVerified === false; }));
ok('법정 기한 근거(dueNote)가 노무사가 읽을 수 있게 들어 있다',
  (stageInfo('lrc-local') || {}).dueNote.indexOf('10일 이내') >= 0
  && (stageInfo('lrc-central') || {}).dueNote.indexOf('15일 이내') >= 0);
ok('달력일 기준임을 주석에 밝혔다', /달력일.*영업일 아님|영업일 아님/.test(STAGE_SRC));
ok('시간대에 밀리지 않게 Date.UTC 로만 계산한다',
  /Date\.UTC\(/.test(STAGE_SRC) && !/new Date\((['"]|ymd|base)/.test(STAGE_SRC.replace(/new Date\(t\)/g, '')));

/* ══ ⑦ 화면 배선 — 사건 수정창 ══ */
const caseModal = slice('function CaseEditModal(props){', 'function CaseManagement(props){');
ok('수정창에 ⚖ 심급·단계 칸이 있다', caseModal.indexOf('⚖ 심급·단계') >= 0);
ok('단계는 목록에서 고른다 (자유 입력이 아니다)',
  caseModal.indexOf('+ 단계 추가') >= 0 && /getCaseStages\(f\.typeCode/.test(caseModal));
ok('현재 단계 표시가 있다', caseModal.indexOf('현재 단계') >= 0);
ok('단계마다 기관명·사건번호 칸이 있다',
  /updStage\(_idx, 'orgName'\)/.test(caseModal) && /updStage\(_idx, 'caseNo'\)/.test(caseModal));
ok('접수일·송달일·판정일 칸이 있다',
  /updStage\(_idx, 'filedDate'\)/.test(caseModal) && /updStage\(_idx, 'noticeDate'\)/.test(caseModal)
  && /updStage\(_idx, 'resultDate'\)/.test(caseModal));
ok('결과·비고 칸이 있다',
  /updStage\(_idx, 'result'\)/.test(caseModal) && /updStage\(_idx, 'note'\)/.test(caseModal));
ok('단계 삭제(×)가 있다', /delStage\(_idx\)/.test(caseModal));
ok('stages 를 고치면 stageCode 를 다시 뽑는다', /caseSyncStageCode\(Object\.assign\(\{\}, prev, \{ stages: next \}\)\)/.test(caseModal));
ok('진행상태·처리기한 칸은 그대로 있다',
  /h\('select', \{ value:f\.status\|\|'pending'/.test(caseModal)
  && /h\(KoreanDatePicker, \{ value:f\.dueDate\|\|'', onChange:setV\('dueDate'\) \}\)/.test(caseModal));

/* ── 법정 기한 표시 + 처리기한은 눌러야만 바뀐다 ── */
ok('★ 「법정 기한 — 확인 후 사용」 표시가 있다', count('법정 기한 — 확인 후 사용') >= 2, '실제 ' + count('법정 기한 — 확인 후 사용') + '회');
ok('그 표시에 설명(툴팁)이 붙어 있다', count('초기값은 참고용이며 유형 관리에서 고칠 수 있습니다') >= 2);
ok('확인된 단계에는 표시가 안 붙는다', /_def\.dueVerified\s*\n?\s*\?\s*null/.test(caseModal));
ok('사건 기한으로 넣기 단추가 있다', caseModal.indexOf('사건 기한으로 넣기') >= 0);
eq('★ f.dueDate 쓰기는 딱 한 곳', (caseModal.match(/dueDate: _sgDue\.due/g) || []).length, 1);
ok('★ 그 한 곳은 대표가 눌러 확인한 뒤에만 쓴다 (조건 없는 대입이 없다)',
  /popConfirm\(_msg\)\.then\(function\(okv\)\{\s*if\(!okv\) return;\s*setF\(function\(prev\)\{ return Object\.assign\(\{\}, prev, \{ dueDate: _sgDue\.due \}\); \}\);/.test(caseModal));
ok('미확인 기한을 넣을 때 경고 문구를 보여준다', /아직 확인되지 않은 초기값/.test(caseModal));
ok('처리기한 초기값(빈칸)은 그대로', caseModal.indexOf("dueDate:''") >= 0);

/* ══ ⑧ 화면 배선 — 사건 목록 ══ */
const caseList = slice('function CaseManagement(props){', 'function CaseDetailModal(');
ok('★ 목록 열이 caseDefaultCols 에 등록돼 있다', /caseDefaultCols = \{[^}]*stage:true/.test(caseList));
ok('★ 목록 열이 _cvBeforeFee 에도 등록돼 있다 (합계 줄이 밀리지 않게)', /_cvBeforeFee = \[[^\]]*'stage'/.test(caseList));
ok('컬럼 설정 메뉴에서 숨길 수 있다', /\{k:'stage', l:'심급\/단계'\}/.test(caseList));
ok('머리행에 심급/단계 칸이 있다', /colVis\.stage && h\('th'/.test(caseList));
ok('본문에 심급/단계 칸이 있다', /colVis\.stage && h\('td'/.test(caseList));
ok('배지는 stageCode 를 읽는다 (stages 전체를 훑지 않는다)', /c\.stageCode \? caseStageInfo\(c\.stageCode\) : null/.test(caseList));
ok('배지 색은 기관 종류로 정한다', /caseStageColor\(_sdef\.orgKind\)/.test(caseList));
ok('배지 아래 그 심급의 사건번호가 작게 붙는다', /_scur\.caseNo/.test(caseList));
ok('★ 단계 필터가 stageCode 로 걸러낸다', /stageFilter !== 'all' && \(c\.stageCode\|\|''\) !== stageFilter/.test(caseList));
ok('단계 필터 드롭다운이 있다', count('⚖ 전체 심급') >= 1 && /getCaseStages\(''\)/.test(caseList));
ok('필터 해제 단추가 단계 필터도 푼다', /setStageFilter\('all'\);/.test(caseList));
ok('기존 기한 D-day 판정은 그대로', /if\(c\.dueDate && c\.status !== 'closed'\)\{/.test(caseList));
ok('기존 열이 하나도 빠지지 않았다',
  ['type', 'opponent', 'mgrMain', 'mgrSubs', 'jurOrg', 'jurOfficer', 'jurPhone', 'jurEmail', 'receiveDate', 'dueDate', 'retainerFee', 'successFee', 'status', 'note']
    .every(function (k) { return caseList.indexOf(k + ':true') >= 0; }));

/* ── 엑셀: 뒤에만 붙였고 붙여넣기 반입 순서는 그대로 ── */
ok('엑셀 내려받기에 심급 열이 붙었다', /'심급\/단계': _stgDef \? _stgDef\.name : ''/.test(caseList));
ok('★ 붙여넣기 반입 열 번호는 안 건드렸다',
  /dueDate: \(r\[10\]\|\|''\)/.test(caseList) && /note: \(r\[14\]\|\|''\)/.test(caseList));

/* ══ ⑨ 화면 배선 — 유형 관리(단계 카탈로그 편집) ══ */
const stageCard = slice('function CaseStageCard(){', 'function BizMasters(){');
ok('유형 관리 화면에 단계 편집 칸이 있다', /h\(CaseStageCard, null\)/.test(html));
ok('단계 카탈로그는 사건 유형과 같은 화면(업무유형)에 있다',
  /BIZ_CATS\.map\(function\(cat\)\{[\s\S]{0,200}h\(CaseStageCard, null\)/.test(html));
ok('★ 줄마다 확인함 체크가 있다', /upd\(x\.code, \{ dueVerified:e\.target\.checked \}\)/.test(stageCard));
ok('이름·약어·기관종류·기한일수·기산·설명을 고칠 수 있다',
  /\{ name:e\.target\.value \}/.test(stageCard) && /\{ short:/.test(stageCard)
  && /\{ orgKind:e\.target\.value \}/.test(stageCard) && /\{ dueDays:/.test(stageCard)
  && /\{ dueFrom:e\.target\.value \}/.test(stageCard) && /\{ dueNote:e\.target\.value \}/.test(stageCard));
ok('적용 유형을 붙이고 뗄 수 있다', /forTypes:\(x\.forTypes\|\|\[\]\)\.concat\(\[v\]\)/.test(stageCard) && /forTypes:\(x\.forTypes\|\|\[\]\)\.filter/.test(stageCard));
ok('저장은 biz_case_stages 로 간다', /dbSet\(BIZ_CASE_STAGE_KEY, arr\)/.test(stageCard));
ok('쓰는 사건이 있으면 삭제 대신 숨김을 권한다', /단계 사용 중/.test(stageCard) && /hidden:true/.test(stageCard));
ok('확인함이 켜진 줄에는 표시가 안 뜬다', /\(x\.dueDays > 0 && !x\.dueVerified\)/.test(stageCard));
ok('기본 단계로 복원할 수 있다', /persist\(BIZ_CASE_STAGE_SEED\.slice\(\)\)/.test(stageCard));

/* ══ ⑩ 시드가 코드에 숨어 있지 않다 (대표가 고칠 수 있어야 한다) ══ */
ok('단계 저장 키가 사건 유형과 같은 방식', count("var BIZ_CASE_STAGE_KEY = 'biz_case_stages';") === 1);
ok('window 노출 코드가 파일에 있다', count('window.getCaseStages    = getCaseStages;') === 1);

console.log('\n  === ' + pass + ' 통과 / ' + fail + ' 실패 ===');
process.exit(fail ? 1 : 0);
