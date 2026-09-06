/* ① 중복 사업장 합치기 · ② 이어두되 「일정관리 진행」은 따로 (대표 지시 2026-09-06)
 *
 * 「1 합쳐라. 2 이어두기는 해라 그렇지만 일정관리에 진행여부는 선택하게 해달라.」
 *
 * ★ 실측(2026-09-06): 사업장 36곳 중 이름이 겹치는 곳 8건, 이알피 번호는 3곳뿐.
 *   이름으로만 맞추다 보니 같은 회사가 여러 줄로 갈라져 일정·담당이 흩어졌다.
 *
 * ★★ 함께 고친 결함 — 이알피에 «같은 사업장·같은 종류»로 여러 건이 있을 수 있다
 *   (티앤에스 기술보호: 8/7 끝난 건 + 아직 도는 건). 하나가 끝났다고 닫으면
 *   도는 건이 목록에서 통째로 사라진다.
 *
 * 못 박는 것은 «지금 값»이 아니라 규칙이다 (CLAUDE.md).
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const test = require('node:test');
const assert = require('node:assert');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'gov-consulting.html'), 'utf8');
const LINES = SRC.split(/\r?\n/);
const bare = (s) => s
  .replace(/<!--[\s\S]*?-->/g, ' ')
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/^\s*\/\/.*$/gm, ' ');
const CODE = bare(SRC);
const HTML = SRC.replace(/<!--[\s\S]*?-->/g, ' ');

function grab(n) {
  const i = SRC.search(new RegExp('(?:async\\s+)?function ' + n + '\\('));
  assert.ok(i >= 0, n + ' 을(를) 못 찾았다');
  let d = 0, st = false;
  for (let j = i; j < SRC.length; j++) {
    if (SRC[j] === '{') { d++; st = true; }
    else if (SRC[j] === '}') { d--; if (st && !d) return SRC.slice(i, j + 1); }
  }
}
function grabLine(p) {
  const l = LINES.find((x) => x.trim().startsWith(p));
  assert.ok(l, p + ' 을(를) 못 찾았다');
  return l;
}
const TODAY = '2026-09-06';

/* 셈을 실제로 돌린다 */
function world(cos, scheds, run) {
  const ctx = {
    getCos: () => cos, setCos: () => { ctx.__savedCos = 1; },
    getScheds: () => scheds || [], setScheds: () => { ctx.__savedSch = 1; },
    getErpTypeRun: () => run || {},
    todayStr: () => TODAY,
    Math, String, Array, Object, JSON,
  };
  vm.createContext(ctx);
  vm.runInContext([grabLine('const CO_CORP_RE='), grabLine('const _en='),
    grab('coKey'), grab('getCoAtts'), grab('erpTypeRuns'),
    grab('mergeGroups'), grab('mergeKeeper'), grab('mergePreview'), grab('mergeApplyOne'),
  ].join('\n'), ctx);
  return ctx;
}
const CO = (id, name, o) => Object.assign({ id, name, types: [], endedTypes: {}, active: true }, o || {});
const SC = (id, coId, typeId) => ({ id, coId, typeId, date: '2026-05-01', round: 1 });
const A = (x) => Array.from(x || []);

/* ══ ① 어느 쪽을 남기고 무엇을 옮기나 ═════════════════════════ */

test('★★ 같은 이름이 여럿인 묶음만 찾는다', () => {
  const cos = [CO('a', '티앤에스'), CO('b', '티앤에스㈜'), CO('c', '혼자')];
  const w = world(cos);
  const g = w.mergeGroups();
  assert.strictEqual(g.length, 1, '법인격만 다른 것을 다른 회사로 본다');
  assert.strictEqual(g[0].length, 2);
});

test('★★ 지운 사업장은 묶음에 안 넣는다', () => {
  const cos = [CO('a', '티앤에스'), CO('b', '티앤에스', { deleted: true })];
  const w = world(cos);
  assert.strictEqual(w.mergeGroups().length, 0, '이미 지운 것과 또 합치려 든다');
});

test('★★★ 일정이 «많은» 쪽을 남긴다 — 적은 쪽을 남기면 옮길 일이 커진다', () => {
  const cos = [CO('few', '티앤에스'), CO('many', '티앤에스')];
  const sch = [SC('s1', 'many', 't1'), SC('s2', 'many', 't1'), SC('s3', 'few', 't1')];
  const w = world(cos, sch);
  assert.strictEqual(w.mergeKeeper(cos).id, 'many');
});

test('★★★ 없어지는 쪽 일정의 사업장을 «옮긴다» — 안 옮기면 일정이 갈 곳을 잃는다', () => {
  const cos = [CO('keep', '티앤에스'), CO('gone', '티앤에스')];
  const sch = [SC('s1', 'keep', 't1'), SC('s2', 'gone', 't1')];
  const w = world(cos, sch);
  const p = w.mergePreview(cos);
  w.mergeApplyOne(p, cos, sch);
  assert.strictEqual(sch[1].coId, 'keep', '일정이 없어진 사업장을 가리킨 채 남는다');
});

test('★★★ 지우지 않고 «합쳐짐» 표시만 한다 — 되돌릴 수 있어야 한다', () => {
  const cos = [CO('keep', '티앤에스', { types: ['t1'] }), CO('gone', '티앤에스', { types: ['t2'] })];
  const w = world(cos, []);
  w.mergeApplyOne(w.mergePreview(cos), cos, []);
  const g = cos.find((c) => c.id === 'gone');
  assert.ok(g, '통째로 지워 버렸다 — 되돌릴 길이 없다');
  assert.strictEqual(g.deleted, true);
  assert.strictEqual(g.mergedInto, 'keep', '어디로 합쳐졌는지 안 적는다');
});

test('★★ 종류는 «합집합»이다', () => {
  const cos = [CO('keep', '티앤에스', { types: ['t1'] }), CO('gone', '티앤에스', { types: ['t2'] })];
  const w = world(cos, []);
  const p = w.mergePreview(cos);
  assert.deepStrictEqual(A(p.types).sort(), ['t1', 't2']);
});

/* ══ ① 「끝남」을 다루는 규칙 — 가장 조심할 자리 ═══════════════ */

test('★★★ 한쪽이 «돌고 있으면» 끝남을 푼다 — 안 그러면 도는 사업이 사라진다', () => {
  /* ⚠ 「남길 쪽」은 일정이 많은 곳이다 — 일정을 안 주면 «도는 쪽»이 남아
       revive 가 빈다(첫 판에 이걸로 헛걸렸다). 끝난 쪽에 일정을 줘 못 박는다. */
  const cos = [
    CO('keep', '송림산업', { types: ['t1'], endedTypes: { t1: '2026-07-31' } }),
    CO('gone', '송림산업', { types: ['t1'] }),
  ];
  const sch = [SC('s1', 'keep', 't1'), SC('s2', 'keep', 't1')];
  const w = world(cos, sch);
  assert.strictEqual(w.mergeKeeper(cos).id, 'keep', '자료가 뜻대로 안 잡혔다');
  const p = w.mergePreview(cos);
  assert.ok(!p.ended.t1, '끝난 쪽을 살려 둔다 — 도는 사업이 목록에서 통째로 빠진다');
  assert.deepStrictEqual(A(p.revive), ['t1'], '살아나는 사업을 안 알려 준다');
});

test('★★★ «모두» 끝났으면 가장 늦은 날로 끝난다', () => {
  const cos = [
    CO('keep', '별표수세미', { types: ['t1'], endedTypes: { t1: '2026-07-31' } }),
    CO('gone', '별표수세미', { types: ['t1'], endedTypes: { t1: '2026-08-15' } }),
  ];
  const w = world(cos, []);
  assert.strictEqual(w.mergePreview(cos).ended.t1, '2026-08-15',
    '먼저 끝난 날로 적는다 — 나중 회차가 종료일보다 뒤가 된다');
});

test('★★ 한쪽에만 있는 사업은 그쪽 사정을 따른다', () => {
  const cos = [
    CO('keep', '티앤에스', { types: ['t1'], endedTypes: { t1: '2026-07-01' } }),
    CO('gone', '티앤에스', { types: ['t2'] }),
  ];
  const w = world(cos, []);
  const p = w.mergePreview(cos);
  assert.strictEqual(p.ended.t1, '2026-07-01', '남의 사정으로 끝남이 풀린다');
  assert.ok(!p.ended.t2, '안 끝난 사업을 끝난 것으로 만든다');
});

/* ══ ① 사람이 빠지지 않는가 ═══════════════════════════════════ */

test('★★★ 없어지는 쪽 «주담당»이 부담당으로 남는다 — 안 그러면 조용히 빠진다', () => {
  const cos = [CO('keep', '티앤에스', { defAtt: 'a1' }), CO('gone', '티앤에스', { defAtt: 'a2' })];
  const w = world(cos, []);
  const p = w.mergePreview(cos);
  assert.ok(A(p.subs).indexOf('a2') >= 0, '없어지는 쪽 주담당이 담당에서 사라진다');
});

test('★★ 부담당은 모두 모으고, 남는 쪽 주담당은 부담당에 안 넣는다', () => {
  const cos = [
    CO('keep', '티앤에스', { defAtt: 'a1', defCoAtts: ['a3'] }),
    CO('gone', '티앤에스', { defAtt: 'a1', defCoAtts: ['a4'] }),
  ];
  const w = world(cos, []);
  const subs = A(w.mergePreview(cos).subs);
  assert.ok(subs.indexOf('a3') >= 0 && subs.indexOf('a4') >= 0, '부담당을 모으지 않는다');
  assert.ok(subs.indexOf('a1') < 0, '주담당이 부담당에도 들어간다 — 두 번 뜬다');
});

test('★★ 옛 부담당 칸을 지운다 — 남겨 두면 그쪽이 이긴다', () => {
  const cos = [CO('keep', '티앤에스', { coAttIds: ['a9'] }), CO('gone', '티앤에스')];
  const w = world(cos, []);
  w.mergeApplyOne(w.mergePreview(cos), cos, []);
  const k = cos.find((c) => c.id === 'keep');
  assert.ok(!k.coAttIds && !k.coAttId && !k.defCoAtt, '옛 칸이 남아 합친 명단을 덮는다');
});

test('★★ 한쪽이라도 «도는» 곳이면 합친 뒤에도 돈다', () => {
  const cos = [CO('keep', '미르지엔아이', { active: false }), CO('gone', '미르지엔아이')];
  const sch = [SC('s1', 'keep', 't1')];
  const w = world(cos, sch);
  w.mergeApplyOne(w.mergePreview(cos), cos, sch);
  assert.notStrictEqual(cos.find((c) => c.id === 'keep').active, false,
    '살아 있는 쪽을 합쳤는데 쉬는 사업장이 된다');
});

test('★★ «없는 칸»만 옮겨 담는다 — 남는 쪽 값을 덮지 않는다', () => {
  /* ⚠ 여기서도 「남길 쪽」을 일정으로 못 박는다 — 안 그러면 종류가 많은 쪽이 남아
       옮기는 방향이 뒤집힌다. */
  const cos = [
    CO('keep', '티앤에스', { types: ['t1'], deadlines: { t1: '2026-12-31' } }),
    CO('gone', '티앤에스', { types: ['t1', 't2'], deadlines: { t1: '2026-01-01', t2: '2026-06-30' } }),
  ];
  const sch = [SC('s1', 'keep', 't1')];
  const w = world(cos, sch);
  assert.strictEqual(w.mergeKeeper(cos).id, 'keep', '자료가 뜻대로 안 잡혔다');
  w.mergeApplyOne(w.mergePreview(cos), cos, sch);
  const k = cos.find((c) => c.id === 'keep');
  assert.strictEqual(k.deadlines.t1, '2026-12-31', '남는 쪽 기한을 덮어썼다');
  assert.strictEqual(k.deadlines.t2, '2026-06-30', '없던 기한을 안 가져왔다');
});

/* ══ ② 「일정관리 진행」 스위치 ═══════════════════════════════ */

test('★★★ 적어 두지 «않은» 이음은 켜진 것으로 본다 — 여태 돌던 가져오기가 멎으면 안 된다', () => {
  const w = world([], []);
  assert.strictEqual(w.erpTypeRuns('code-1'), true);
});

test('★★ false 라고 적힌 것만 꺼진다', () => {
  const w = world([], [], { 'code-1': false });
  assert.strictEqual(w.erpTypeRuns('code-1'), false);
  assert.strictEqual(w.erpTypeRuns('code-2'), true);
});

test('★★★ 꺼지면 가져오기 계획에서 종류가 빈다 — 목록·알림에 안 뜬다', () => {
  const fn = bare(grab('erpBuildPlan'));
  assert.ok(/govType=\(code&&erpTypeRuns\(code\)\)\?map\[code\]/.test(fn.replace(/\s+/g, '')),
    '진행 스위치를 안 본다 — 꺼도 그대로 가져오기 목록에 뜬다');
});

test('★★★ 「끈 것」과 「아직 안 이은 것」을 «가른다» — 끈 것을 막힌 것처럼 보이면 거짓말이다', () => {
  const fn = bare(grab('erpBuildPlan'));
  assert.ok(/status=off\?'off':'skip'/.test(fn.replace(/\s+/g, '')),
    "일부러 끈 것이 'skip' 으로 남아 「관리자가 풀어야 합니다」 알림에 뜬다");
  const blocked = bare(grab('erpMyBlocked'));
  assert.ok(!/'off'/.test(blocked), '꺼 둔 것을 「못 가져오는 건」으로 센다');
});

test('★★★ 저장은 «끈 것만» 담는다 — 켠 것까지 담으면 새 이음이 꺼진 것처럼 보인다', () => {
  const fn = bare(grab('erpSaveMap'));
  const flat = fn.replace(/\s+/g, '');
  assert.ok(/if\(!c\.checked&&map\[c\.dataset\.erpcode\]\)run\[c\.dataset\.erpcode\]=false/.test(flat),
    '끈 것만 담지 않는다');
  assert.ok(/setErpTypeRun\(run\)/.test(flat), '스위치를 아예 저장하지 않는다');
});

test('★★ 화면에 스위치가 있고, 안 이어진 줄에서는 잠긴다', () => {
  assert.ok(/class="erp-run-chk"/.test(HTML), '스위치가 화면에 없다');
  const fn = grab('renderErpMap');
  assert.ok(/linked\?''\:'disabled'/.test(fn.replace(/\s+/g, '')),
    '안 이어진 줄에서도 켤 수 있다 — 아무 뜻이 없다');
});

test('★★ 새 칸이 저장·백업 목록에 들어 있다 — 빠지면 이 PC 에만 남는다', () => {
  assert.ok(/p_erpTypeRun:'scal_erpTypeRun'/.test(CODE.replace(/\s+/g, '')),
    '클라우드 자리를 안 정했다 — 다른 PC 에서는 늘 켜져 보인다');
  assert.ok(/'p_erpTypeRun'/.test(CODE), '백업·저장 목록에 없다');
});

/* ══ ③ 종료 내리기 — 짝이 «전부» 끝나야 닫는다 ═══════════════ */

test('★★★ 같은 짝에 «도는» 이알피 건이 있으면 닫지 않는다 — 티앤에스에서 터진 자리', () => {
  const fn = bare(grab('erpSyncClosedDown'));
  const flat = fn.replace(/\s+/g, '');
  assert.ok(/bucket/.test(flat), '건별로 바로 닫는다 — 한 건만 끝나도 통째로 닫힌다');
  assert.ok(/if\(b\.living\)return;/.test(flat),
    '도는 건이 있는데도 닫는다 — 진행 중인 사업이 목록에서 사라진다');
});

test('★★ 전부 끝났으면 «가장 늦은» 날로 닫는다', () => {
  const fn = bare(grab('erpSyncClosedDown'));
  assert.ok(/b\.ends\.slice\(\)\.sort\(\)\[b\.ends\.length-1\]/.test(fn.replace(/\s+/g, '')),
    '먼저 끝난 날로 적는다 — 뒤 회차가 종료일보다 뒤가 된다');
});
