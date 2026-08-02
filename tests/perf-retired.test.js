/* 퇴사자 성과급 — 발행에서 빼기 + 정산(지급일·메모) 테스트 */
const fs = require('fs'), vm = require('vm');
const path = require('path');
// 인자를 안 주면 저장소의 대상 파일을 본다 (node tests/perf-retired.test.js 로 바로 실행)
const TARGET = process.argv[2] || path.join(__dirname, '..', 'pu-erp.html');
const html = fs.readFileSync(TARGET, 'utf8');
function slice(a, b) {
  const i = html.indexOf(a); if (i < 0) throw new Error('못찾음:' + a);
  const j = html.indexOf(b, i); if (j < 0) throw new Error('끝 못찾음:' + b);
  return html.slice(i, j);
}

/* ── 가짜 저장소 ── */
const DB = {};
let upsertOk = true;              // false 로 두면 저장이 실패한 것처럼 흉내낸다
let upsertCalls = 0;
function dbGet(k, def) { return DB[k] !== undefined ? DB[k] : def; }
function dbSet(k, v) { DB[k] = v; return true; }
function dbUpsert(k, item) {
  upsertCalls++;
  if (!item || typeof item.id !== 'string' || !item.id) return false;
  if (!upsertOk) return false;                       // 저장 실패 — 아무것도 안 바뀐다
  const arr = DB[k] || [];
  let found = false;
  let next = arr.map(x => { if (x && x.id === item.id) { found = true; return item; } return x; });
  if (!found) next = next.concat([item]);
  DB[k] = next;
  return true;
}

const ctx = {
  console, Date, Math, Object, JSON, Array, String, Number,
  window: {},
  dbGet, dbSet, dbUpsert,
  todayYMD: () => '2026-08-02',
  CURRENT_USER: { sid: 'u1', name: '권형하', isAdmin: true },
  showToast: () => {}
};
vm.createContext(ctx);
vm.runInContext(slice('var PCF_PATH =', '// ── 발행 창 ──'), ctx);
vm.runInContext(slice('// ============ 퇴사자 성과급 정산', 'function StaffRosterDetail(props){'), ctx);

let pass = 0, fail = 0;
function ok(n, c, e) { if (c) { pass++; console.log('  PASS ' + n); } else { fail++; console.log('  FAIL ' + n + (e ? ' — ' + e : '')); } }

/* ─────────────────────────────────────────────────────────────
   1. 발행 대상에서 퇴사자 빼기
   ───────────────────────────────────────────────────────────── */
const USERS = [
  { sid: 'u1', name: '권형하', status: 'active' },
  { sid: 'u2', name: '박한별', status: 'leave' },      // 휴직 — 로그인은 살아 있다
  { sid: 'u3', name: '김혜민' },                        // status 없는 옛 데이터
  { sid: 'u7', name: '고퇴사', status: 'retired', retireDate: '2026-05-31' },
  { sid: 'u8', name: '최퇴사', status: 'retired', retireDate: '2026-06-30' },
  { sid: 'u9', name: '이퇴사', status: 'retired', retireDate: '2026-07-31' }
];
const UID = { u1: 'AUID1', u2: 'AUID2', u3: 'AUID3' };

function it(o) {
  return Object.assign({
    fiId: 'f1', category: 'matched', amount: 100000, pct: 20, role: '주담당',
    date: '2026-08-03', sourceKind: 'case', sourceId: 'c1', companyName: '㈜신흥', kind: '부당해고',
    baseAmount: 500000, grossAmount: 550000
  }, o);
}

const EMP = [
  { sid: 'u1', items: [it({ fiId: 'a', amount: 400000 })] },
  { sid: 'u2', items: [it({ fiId: 'b', amount: 200000 })] },
  { sid: 'u3', items: [it({ fiId: 'c', amount: 150000 })] },
  { sid: 'u7', items: [it({ fiId: 'd', amount: 300000 })] },                        // 퇴사 · 보낼 것 있음
  { sid: 'u8', items: [it({ fiId: 'e', amount: 0 })] },                             // 퇴사 · 보낼 것 없음
  { sid: 'u9', items: [it({ fiId: 'f', amount: 100000 }), it({ fiId: 'g', amount: 70000 })] }
];

const rows = ctx.pcfBuildRows(EMP, USERS, UID);
const rowSids = rows.map(r => r.sid).join(',');
ok('★ 퇴사자는 발행 줄에서 빠진다', !rows.some(r => ['u7', 'u8', 'u9'].indexOf(r.sid) >= 0), rowSids);
ok('재직자는 그대로 나온다', rows.some(r => r.sid === 'u1'), rowSids);
ok('휴직자는 안 뺀다 (로그인이 살아 있다)', rows.some(r => r.sid === 'u2'), rowSids);
ok('status 없는 옛 데이터는 안 뺀다', rows.some(r => r.sid === 'u3'), rowSids);
ok('남은 사람은 세 명', rows.length === 3, rows.length);
ok('금액 순서는 그대로 유지된다', rows[0].sid === 'u1' && rows[0].total === 400000, JSON.stringify(rows.map(r => [r.sid, r.total])));
ok('users 를 안 주면 아무도 못 뺀다 (이름만 못 붙는다)',
   ctx.pcfBuildRows([EMP[5]], [], UID).length === 1);

/* ─────────────────────────────────────────────────────────────
   2. 뺐다고 알리기 — pcfRetiredHolds
   ───────────────────────────────────────────────────────────── */
const RH = ctx.pcfRetiredHolds(EMP, USERS);
ok('퇴사자만 잡는다', RH.every(x => ['u7', 'u9'].indexOf(x.sid) >= 0), RH.map(x => x.sid).join(','));
ok('보낼 게 없는 퇴사자는 뺀다', !RH.some(x => x.sid === 'u8'), RH.map(x => x.sid).join(','));
ok('두 명이 잡힌다', RH.length === 2, RH.length);
ok('★ 금액 큰 사람이 위로', RH[0].sid === 'u7' && RH[1].sid === 'u9', RH.map(x => x.sid + ':' + x.total).join(','));
ok('건수를 센다', RH.find(x => x.sid === 'u9').n === 2, JSON.stringify(RH.find(x => x.sid === 'u9')));
ok('합계를 센다', RH.find(x => x.sid === 'u9').total === 170000, RH.find(x => x.sid === 'u9').total);
ok('이름을 붙인다', RH.find(x => x.sid === 'u9').name === '이퇴사');
ok('퇴사일을 붙인다', RH.find(x => x.sid === 'u9').retireDate === '2026-07-31');
ok('재직자는 안 잡는다', !RH.some(x => ['u1', 'u2', 'u3'].indexOf(x.sid) >= 0));
ok('아무도 안 퇴사했으면 빈 배열',
   ctx.pcfRetiredHolds([EMP[0], EMP[1], EMP[2]], USERS).length === 0);
ok('명부에 없는 사번은 안 잡는다', ctx.pcfRetiredHolds([{ sid: 'zz', items: [it({ amount: 500 })] }], USERS).length === 0);
ok('빈 입력에도 안 터진다',
   ctx.pcfRetiredHolds(null, null).length === 0 && ctx.pcfRetiredHolds([], []).length === 0);
ok('0원만 있는 퇴사자는 빈 배열', ctx.pcfRetiredHolds([EMP[4]], USERS).length === 0);

/* ─────────────────────────────────────────────────────────────
   3. 정산 처리 — perfSettleShare
   ───────────────────────────────────────────────────────────── */
const FIX = [
  { id: 'f1', date: '2026-08-10', amount: 1000000, companyName: '㈜신흥',
    perfShares: [
      { sid: 'u9', name: '이퇴사', amount: 100000, pct: 20, role: '주담당', baseAmount: 500000 },
      { sid: 'u2', name: '박한별', amount: 50000, pct: 10, role: '부담당', baseAmount: 500000 }
    ] },
  { id: 'f2', date: '2026-08-20', amount: 700000, companyName: '㈜대한',
    perfShares: [{ sid: 'u9', name: '이퇴사', amount: 70000, pct: 20, role: '주담당', baseAmount: 350000 }] },
  { id: 'f3', date: '2026-08-25', amount: 300000, companyName: '㈜무배분' }   // perfShares 없음
];
function reset() { DB.finance_income = JSON.parse(JSON.stringify(FIX)); upsertOk = true; upsertCalls = 0; }
function rec(id) { return DB.finance_income.find(x => x.id === id); }
const PAID_KEYS = ['paid', 'paidAt', 'paidBy', 'paidByName', 'paidNote'];

reset();
const r1 = ctx.perfSettleShare('f1', 0, '2026-08-31', '8월 급여와 함께 지급');
const s0 = rec('f1').perfShares[0], s1 = rec('f1').perfShares[1];
ok('정산하면 true', r1 === true, r1);
ok('paid 가 붙는다', s0.paid === true);
ok('지급일이 들어간다', s0.paidAt === '2026-08-31', s0.paidAt);
ok('처리자 사번이 들어간다', s0.paidBy === 'u1', s0.paidBy);
ok('처리자 이름이 들어간다', s0.paidByName === '권형하', s0.paidByName);
ok('메모가 들어간다', s0.paidNote === '8월 급여와 함께 지급', s0.paidNote);
ok('★ 금액·비율·역할은 안 건드린다',
   s0.amount === 100000 && s0.pct === 20 && s0.role === '주담당', JSON.stringify(s0));
ok('★ 같은 건의 다른 사람 줄은 안 건드린다',
   PAID_KEYS.every(k => !(k in s1)), JSON.stringify(s1));
ok('★ 다른 입금건은 안 건드린다',
   PAID_KEYS.every(k => !(k in rec('f2').perfShares[0])), JSON.stringify(rec('f2').perfShares[0]));

reset();
ok('지급일을 안 주면 오늘로 넣는다',
   ctx.perfSettleShare('f1', 0, '', '') === true && rec('f1').perfShares[0].paidAt === '2026-08-02',
   rec('f1').perfShares[0].paidAt);
ok('메모는 없어도 된다 (빈칸으로)', rec('f1').perfShares[0].paidNote === '');

reset();
ok('없는 입금건은 false', ctx.perfSettleShare('zzz', 0, '2026-08-31', '') === false);
ok('입금건 id 가 없으면 false', ctx.perfSettleShare('', 0, '2026-08-31', '') === false);
ok('perfShares 가 없는 건은 false', ctx.perfSettleShare('f3', 0, '2026-08-31', '') === false);
ok('없는 자리(범위 밖)는 false', ctx.perfSettleShare('f1', 5, '2026-08-31', '') === false);
ok('음수 자리는 false', ctx.perfSettleShare('f1', -1, '2026-08-31', '') === false);
ok('숫자가 아닌 자리는 false', ctx.perfSettleShare('f1', '0', '2026-08-31', '') === false);
ok('실패했으면 아무것도 안 바뀐다',
   PAID_KEYS.every(k => !(k in rec('f1').perfShares[0])), JSON.stringify(rec('f1').perfShares[0]));

reset();
ctx.perfSettleShare('f1', 0, '2026-08-31', '첫 지급');
ok('★ 이미 정산된 건은 false', ctx.perfSettleShare('f1', 0, '2026-09-30', '두 번째') === false);
ok('이미 정산된 건의 지급일을 덮어쓰지 않는다', rec('f1').perfShares[0].paidAt === '2026-08-31');
ok('메모도 안 덮어쓴다', rec('f1').perfShares[0].paidNote === '첫 지급');

reset();
upsertOk = false;
const rFail = ctx.perfSettleShare('f1', 0, '2026-08-31', '저장 실패');
ok('★ 저장이 실패하면 false — 성공이라 말하지 않는다', rFail === false, rFail);
ok('저장 시도는 했다', upsertCalls === 1, upsertCalls);
ok('저장이 실패했으니 캐시도 그대로', PAID_KEYS.every(k => !(k in rec('f1').perfShares[0])));

/* ─────────────────────────────────────────────────────────────
   4. 되돌리기 — perfUnsettleShare
   ───────────────────────────────────────────────────────────── */
reset();
ctx.perfSettleShare('f1', 0, '2026-08-31', '8월 급여와 함께 지급');
ok('되돌리면 true', ctx.perfUnsettleShare('f1', 0) === true);
const back = rec('f1').perfShares[0];
ok('★ 다섯 칸이 딱 지워진다', PAID_KEYS.every(k => !(k in back)), JSON.stringify(back));
ok('나머지는 그대로 남는다',
   back.sid === 'u9' && back.name === '이퇴사' && back.amount === 100000
   && back.pct === 20 && back.role === '주담당' && back.baseAmount === 500000, JSON.stringify(back));
ok('되돌리면 다시 미정산이 된다', !back.paid);
ok('정산 안 된 건은 되돌릴 것도 없다 (false)', ctx.perfUnsettleShare('f1', 0) === false);
ok('없는 입금건은 false', ctx.perfUnsettleShare('zzz', 0) === false);
ok('없는 자리는 false', ctx.perfUnsettleShare('f1', 9) === false);
ok('숫자가 아닌 자리는 false', ctx.perfUnsettleShare('f1', null) === false);

reset();
ctx.perfSettleShare('f1', 0, '2026-08-31', 'x');
upsertOk = false;
ok('★ 되돌리기도 저장 실패면 false', ctx.perfUnsettleShare('f1', 0) === false);
ok('저장 실패면 정산 상태가 그대로', rec('f1').perfShares[0].paid === true);

/* ─────────────────────────────────────────────────────────────
   5. 미정산 목록에서 사라지고 알림도 함께 사라진다
   ───────────────────────────────────────────────────────────── */
reset();
const RET_U = { sid: 'u9', name: '이퇴사', status: 'retired', retireDate: '2026-07-31' };
function scanUnsettled(u) {          // 근로자명부·대표 알림이 쓰는 것과 같은 조건
  const out = [];
  (dbGet('finance_income', []) || []).forEach(fi => {
    if (!u.retireDate || (fi.date || '') < u.retireDate) return;
    (fi.perfShares || []).forEach((ps, i) => {
      const match = ps.sid === u.sid || ps.sid === u.name || (ps.name && ps.name === u.name);
      if (match && !ps.paid) out.push({ fiId: fi.id, shareIdx: i, amount: ps.amount || 0 });
    });
  });
  return out;
}
const before = scanUnsettled(RET_U);
ok('퇴사 뒤 미정산이 두 건 잡힌다', before.length === 2, JSON.stringify(before));
ok('자리(shareIdx)도 같이 들고 나온다',
   before[0].fiId === 'f1' && before[0].shareIdx === 0 && before[1].fiId === 'f2' && before[1].shareIdx === 0,
   JSON.stringify(before));
ctx.perfSettleShare(before[0].fiId, before[0].shareIdx, '2026-08-31', '8월 급여와 함께 지급');
const after = scanUnsettled(RET_U);
ok('★ 정산한 건은 미정산 목록에서 빠진다', after.length === 1, JSON.stringify(after));
ok('★ 안 준 건은 그대로 남는다', after[0].fiId === 'f2' && after[0].amount === 70000, JSON.stringify(after[0]));
ok('★ 대표 알림도 같은 조건이라 함께 사라진다', after.every(x => x.fiId !== 'f1'));
ctx.perfUnsettleShare('f1', 0);
ok('되돌리면 미정산 목록에 다시 올라온다', scanUnsettled(RET_U).length === 2);

/* ─────────────────────────────────────────────────────────────
   6. 정산 표시가 확인(지문)을 풀지 않는다 — 가장 중요한 안전장치
   ───────────────────────────────────────────────────────────── */
reset();
const stampBefore = ctx.pcfStamp(rec('f1').perfShares[0]);
ctx.perfSettleShare('f1', 0, '2026-08-31', '8월 급여와 함께 지급');
const stampAfter = ctx.pcfStamp(rec('f1').perfShares[0]);
ok('★ 정산해도 지문이 안 바뀐다 → 이미 받은 확인이 안 풀린다',
   stampBefore === stampAfter, stampBefore + ' vs ' + stampAfter);
ok('지문은 금액·비율·역할만 본다', stampAfter === '100000|20|주담당', stampAfter);
ok('지문 계산식에 paid 가 없다',
   /function pcfStamp\(x\)\{\s*\n\s*return \[Math\.round\(\(x && x\.amount\) \|\| 0\), \(x && x\.pct\) \|\| 0, \(x && x\.role\) \|\| ''\]\.join\('\|'\);/.test(html));
ok('사본에 담는 줄(pcfItemRow)에도 paid 가 없다',
   !/function pcfItemRow\(x\)\{[\s\S]*?\n\}/.exec(html)[0].includes('paid'));
// 정산된 뒤에도 발행 줄의 금액·지문이 똑같아야 한다
const empAfter = [{ sid: 'u1', items: [it({ fiId: 'f1', amount: 100000 })] }];
ok('발행 줄의 지문도 그대로',
   ctx.pcfBuildRows(empAfter, USERS, UID)[0].items.f1.stamp === '100000|20|주담당');

/* ─────────────────────────────────────────────────────────────
   7. 배선 확인 (화면에 실제로 달렸나)
   ───────────────────────────────────────────────────────────── */
ok('발행에서 퇴사자를 뺀다',
   /if\(byS\[p\.sid\] && byS\[p\.sid\]\.status === 'retired'\) return;/.test(html));
ok('발행 창이 퇴사자 명단을 만든다',
   /var retHolds = loading \? \[\] : pcfRetiredHolds\(props\.empPerfs, props\.users\);/.test(html));
ok('★ 뺐다고 알리는 칸이 있다',
   html.indexOf("'🚪 퇴사자 ' + retHolds.length + '명은 확인 대상에서 제외했습니다 — 근로자명부에서 정산하세요'") > 0);
ok('합계를 보여 준다', /'합계 ' \+ retTotal\.toLocaleString\('ko-KR'\) \+ '원'/.test(html));
ok('사람마다 한 줄 (이름·퇴사일·건수·금액)',
   /x\.name \+ \(x\.retireDate \? ' \(퇴사 ' \+ x\.retireDate \+ '\)' : ''\)/.test(html)
   && /x\.n \+ '건 · ' \+ x\.total\.toLocaleString\('ko-KR'\) \+ '원'/.test(html));
ok('근로자명부로 가는 단추가 있다', html.indexOf("'근로자명부 ↗'") > 0);
ok('기존 이동 방식(global_search_focus + navigateTo)을 쓴다',
   /pcfGoto\('hr\/staff', x\.name\); props\.onClose && props\.onClose\(\);/.test(html)
   && /sessionStorage\.setItem\('global_search_focus'/.test(html));
ok('왜 뺐는지 적어 준다',
   html.indexOf('퇴사자는 로그인이 없어 확인을 받을 수 없습니다') > 0
   && html.indexOf('그 달을 마감할 수 없습니다') > 0);
ok('퇴사자가 없으면 칸을 안 그린다', /!lock && retHolds\.length > 0 && h\('div'/.test(html));

ok('★ 미정산 머리글에 합계가 붙는다',
   html.indexOf("'💰 미정산 성과급 (' + unsettled.length + '건'") > 0
   && /'건'\s*\+ \(unsettled\.length>0 \? ' · 합계 ' \+ unsettledSum\.toLocaleString\('ko-KR'\) \+ '원' : ''\)/.test(html));
ok('★ "권형하 결재 필요" 문구는 없어졌다 (실제 단추가 생겼으니)', html.indexOf('권형하 결재 필요') < 0);
ok('★ 줄마다 자리(shareIdx)를 들고 나간다', /\(fi\.perfShares\|\|\[\]\)\.forEach\(function\(ps, psIdx\)\{/.test(html)
   && /shareIdx:psIdx/.test(html));
ok('미정산·정산완료를 한 번에 갈라 담는다 (훑기는 한 번)',
   /var unsettled = \[\], settled = \[\];/.test(html));
ok('정산 완료 단추가 있다', html.indexOf("'정산 완료')") > 0);
ok('★ 지급일 칸이 있고 오늘이 기본값', /payDate:todayYMD\(\)/.test(html)
   && /h\('input', \{ type:'date', value:f\.payDate/.test(html));
ok('★ 메모 칸이 있다', html.indexOf("placeholder:'예: 8월 급여와 함께 지급'") > 0);
ok('저장·취소가 있다', /h\('button', \{ onClick:saveForm/.test(html)
   && /onClick:function\(\)\{ setSetlForm\(null\); \}/.test(html));
ok('저장하면 perfSettleShare 를 부른다',
   /if\(perfSettleShare\(x\.fiId, x\.shareIdx, f\.payDate, f\.note\)\) okN\+\+; else badN\+\+;/.test(html));
ok('★ 전부 정산 단추가 있다', html.indexOf("'전부 정산 (' + unsettled.length + '건)'") > 0);
ok('전부 정산은 성공·실패를 함께 알려 준다',
   /'정산 ' \+ okN \+ '건 · 실패 ' \+ badN \+ '건'/.test(html));
ok('★ 정산 완료 보기 토글이 있다 (기본 접힘)',
   html.indexOf("'정산 완료 ' + settled.length + '건 보기'") > 0
   && /var spS = useState\(false\); var showPaid = spS\[0\]/.test(html));
ok('정산 완료 줄에 지급일·메모·처리자가 나온다',
   /' · 지급 ' \+ \(x\.paidAt \|\| '-'\)/.test(html)
   && /x\.paidNote \? ' · ' \+ x\.paidNote/.test(html)
   && /x\.paidByName \? ' · ' \+ x\.paidByName/.test(html));
ok('★ 되돌리기 단추가 있고 한 번 묻는다', html.indexOf("'되돌리기'") > 0
   && /popConfirm\('이 건을 미정산으로 되돌립니다/.test(html));
ok('되돌리기는 왜 위험한지 적어 준다',
   html.indexOf('지급일·메모·처리자 기록이 지워지고 다시 미정산 목록에 올라옵니다') > 0);
ok('쓰고 나면 다시 읽는다 (tick)', /setSetlTick\(Date\.now\(\)\);/.test(html)
   && /var stS = useState\(0\);\s+var setlTick = stS\[0\]/.test(html));

const SETTLE_SRC = slice('// ============ 퇴사자 성과급 정산', 'function StaffRosterDetail(props){');
ok('★ 저장 실패를 반드시 확인한다 (정산·되돌리기 둘 다)',
   (SETTLE_SRC.match(/if\(!dbUpsert\('finance_income', rec\)\) return false;/g) || []).length === 2);
// 주석에는 isIncomeLocked 가 나온다(왜 안 막는지 적어 뒀다). 실제로 부르지 않는 것만 본다.
ok('★ 입금 마감으로 막지 않는다', !/isIncomeLocked\(/.test(SETTLE_SRC));
ok('왜 안 막는지 적어 뒀다',
   SETTLE_SRC.indexOf('마감은 입금 금액을 지키려는 것이고') > 0
   && SETTLE_SRC.indexOf('마감 때문에 퇴사자 정산이 막히면 목적이 뒤집힌다') > 0);
ok('캐시를 그 자리에서 고치지 않는다 (통째로 새로 만든다)',
   /var rec = Object\.assign\(\{\}, cur\);/.test(SETTLE_SRC)
   && /rec\.perfShares = cur\.perfShares\.map\(function\(ps, i\)\{/.test(SETTLE_SRC));
ok('콘솔에서도 부를 수 있게 걸어 뒀다',
   /window\.perfSettleShare = perfSettleShare;/.test(html) && /window\.perfUnsettleShare = perfUnsettleShare;/.test(html));
ok('대표 알림은 그대로 미정산만 센다 (건드리지 않았다)',
   /if\(\(ps\.sid===u\.sid \|\| ps\.sid===u\.name \|\| \(ps\.name && ps\.name===u\.name\)\) && !ps\.paid\)\{/.test(html));

console.log('\n  === ' + pass + ' 통과 / ' + fail + ' 실패 ===');
process.exit(fail ? 1 : 0);
