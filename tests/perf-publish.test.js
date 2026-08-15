/* 성과급 확인 발행 — 추리기·견주기·합치기 테스트 */
const fs = require('fs'), vm = require('vm');
const path = require('path');
// 인자를 안 주면 저장소의 대상 파일을 본다 (node tests/perf-publish.test.js 로 바로 실행)
const TARGET = process.argv[2] || path.join(__dirname, '..', 'pu-erp.html');
const html = fs.readFileSync(TARGET, 'utf8');
function slice(a, b) {
  const i = html.indexOf(a); if (i < 0) throw new Error('못찾음:' + a);
  const j = html.indexOf(b, i); if (j < 0) throw new Error('끝 못찾음:' + b);
  return html.slice(i, j);
}
const src = slice('var PCF_PATH =', '// ── 발행 창 ──');
const ctx = { console, Date, Math, Object, JSON };
vm.createContext(ctx); vm.runInContext(src, ctx);

let pass = 0, fail = 0;
function ok(n, c, e) { if (c) { pass++; console.log('  PASS ' + n); } else { fail++; console.log('  FAIL ' + n + (e ? ' — ' + e : '')); } }

const USERS = [{ sid:'u1', name:'권형하' }, { sid:'u2', name:'박한별' }, { sid:'u3', name:'김혜민' }];
const UID = { u1:'AUID1', u2:'AUID2' };            // u3 는 로그인한 적 없음

function it(o){ return Object.assign({ fiId:'f1', category:'matched', amount:100000, pct:20, role:'주담당',
  date:'2026-08-03', sourceKind:'case', sourceId:'c1', companyName:'㈜신흥', kind:'부당해고',
  baseAmount:500000, grossAmount:550000 }, o); }

/* ── 0원·미반영은 안 나간다 ── */
const p1 = { sid:'u1', items:[
  it({ fiId:'a', amount:320000 }),
  it({ fiId:'b', amount:0 }),                                  // 0원
  it({ fiId:'c', amount:150000, category:'unmatched' }),       // 분배 누락
  it({ fiId:'d', amount:85000, category:'personal' })          // 개인수익은 나간다
]};
const picked = ctx.pcfPickItems(p1);
ok('0원과 미반영은 빠진다', picked.length === 2, picked.map(x=>x.fiId).join(','));
ok('개인수익은 담는다', picked.some(x => x.fiId === 'd'));

/* ── 성과급이 하나도 없는 사람은 발행 대상이 아니다 ── */
const rows0 = ctx.pcfBuildRows([{ sid:'u2', items:[it({ amount:0 })] }], USERS, UID);
ok('0원인 사람은 아예 안 나온다', rows0.length === 0, JSON.stringify(rows0));

/* ── 사람별 묶기 ── */
const EMP = [
  p1,
  { sid:'u2', items:[ it({ fiId:'e', amount:220000, pct:25, role:'부담당' }) ] },
  { sid:'u3', items:[ it({ fiId:'f', amount:150000 }) ] }
];
const rows = ctx.pcfBuildRows(EMP, USERS, UID);
ok('세 사람이 나온다', rows.length === 3, rows.length);
ok('금액 큰 사람이 위로', rows[0].sid === 'u1' && rows[0].total === 405000, JSON.stringify(rows.map(r=>[r.sid,r.total])));
ok('이름이 붙는다', rows[0].name === '권형하');
ok('계정 없는 사람은 uid 가 빈칸', rows.find(r=>r.sid==='u3').uid === '');
ok('계정 있는 사람은 uid 가 붙는다', rows[0].uid === 'AUID1');
ok('항목이 fiId 로 담긴다', Object.keys(rows[0].items).sort().join(',') === 'a,d');
ok('건수가 맞는다', rows[0].itemCount === 2);
ok('원천 추적 정보가 담긴다',
   rows[0].items.a.sourceId === 'c1' && rows[0].items.a.source === 'case', JSON.stringify(rows[0].items.a));
ok('계산 근거가 담긴다 (입금액·부가세뺀금액·비율)',
   rows[0].items.a.gross === 550000 && rows[0].items.a.base === 500000 && rows[0].items.a.pct === 20);

/* ── 지문 ── */
ok('지문은 금액·비율·역할로 만든다', ctx.pcfStamp({amount:100, pct:20, role:'주담당'}) === '100|20|주담당');
ok('금액이 바뀌면 지문이 바뀐다', ctx.pcfStamp({amount:100,pct:20,role:'주담당'}) !== ctx.pcfStamp({amount:120,pct:20,role:'주담당'}));
ok('역할만 바뀌어도 지문이 바뀐다', ctx.pcfStamp({amount:100,pct:20,role:'주담당'}) !== ctx.pcfStamp({amount:100,pct:20,role:'부담당'}));

/* ── 처음 발행 ── */
let d = ctx.pcfDiff(rows, {});
ok('처음이면 전부 새로 나감', d.every(r => r.state === 'new'), JSON.stringify(d.map(r=>r.state)));

/* ── 다시 발행: 그대로면 아무것도 안 바뀐다 ── */
const prev1 = ctx.pcfMergeAll(rows, {}, '2026-08-05T00:00:00Z', '권형하', '2026-08-12');
ok('발행본에 마감일이 들어간다', prev1.u1.due === '2026-08-12');
ok('처음엔 아무도 확인 안 한 상태', prev1.u1.items.a.ok === false && prev1.u1.done === false);
ok('계정 없는 사람도 칸은 만든다 (uid 만 빈칸)', prev1.u3.uid === '');

d = ctx.pcfDiff(rows, prev1);
ok('그대로 다시 발행하면 변화 없음', d.every(r => r.state === 'same'), JSON.stringify(d.map(r=>[r.sid,r.state])));

/* ── 직원이 확인한 뒤 다시 발행 ── */
prev1.u1.items.a.ok = true; prev1.u1.items.a.okAt = '2026-08-06T01:00:00Z'; prev1.u1.items.a.okBy = 'u1';
prev1.u1.items.d.ok = true; prev1.u1.done = true; prev1.u1.doneAt = '2026-08-06T01:01:00Z'; prev1.u1.doneBy = 'u1';
let merged = ctx.pcfMergeAll(rows, prev1, '2026-08-07T00:00:00Z', '권형하', '2026-08-12');
ok('금액이 그대로면 확인이 살아남는다', merged.u1.items.a.ok === true && merged.u1.items.a.okAt === '2026-08-06T01:00:00Z');
ok('금액이 그대로면 완료도 살아남는다', merged.u1.done === true && merged.u1.doneBy === 'u1');
ok('처음 발행 시각은 안 바뀐다', merged.u1.openedAt === '2026-08-05T00:00:00Z');
ok('다시 발행한 시각이 따로 남는다', merged.u1.republishedAt === '2026-08-07T00:00:00Z');

/* ── 이의를 받아들여 금액을 고친 경우 (핵심) ── */
const EMP2 = JSON.parse(JSON.stringify(EMP));
EMP2[0].items[0].amount = 260000;     // a 를 320000 → 260000 으로 정정
const rows2 = ctx.pcfBuildRows(EMP2, USERS, UID);
d = ctx.pcfDiff(rows2, prev1);
const r1 = d.find(r => r.sid === 'u1');
ok('금액이 바뀐 건을 잡아낸다', r1.state === 'update' && r1.resetN === 1, JSON.stringify(r1));
ok('안 바뀐 건은 유지로 센다', r1.keepN === 1);
ok('완료했던 사람임을 표시한다', r1.wasDone === true);

merged = ctx.pcfMergeAll(rows2, prev1, '2026-08-08T00:00:00Z', '권형하', '2026-08-12');
ok('금액이 바뀐 줄은 확인이 풀린다', merged.u1.items.a.ok === false);
ok('풀린 줄은 확인 시각도 지운다', !merged.u1.items.a.okAt);
ok('안 바뀐 줄은 확인이 그대로', merged.u1.items.d.ok === true);
ok('★ 한 줄이라도 풀리면 완료가 풀린다', merged.u1.done === false, JSON.stringify(merged.u1.done));
ok('새 금액이 반영된다', merged.u1.items.a.amount === 260000);
ok('새 지문으로 갱신된다', merged.u1.items.a.stamp === ctx.pcfStamp({amount:260000, pct:20, role:'주담당'}));

/* ── 이의와 대표 답변은 살아남는다 ── */
prev1.u1.objection = { byItem: { a: { text:'주담당이 아니라 부담당입니다', at:'2026-08-06T02:00:00Z' } } };
prev1.u1.items.a.reply = { text:'맞습니다. 고쳤습니다', at:'2026-08-07T00:00:00Z', by:'권형하', state:'done' };
merged = ctx.pcfMergeAll(rows2, prev1, '2026-08-08T00:00:00Z', '권형하', '2026-08-12');
ok('이의는 다시 발행해도 남는다', merged.u1.objection.byItem.a.text === '주담당이 아니라 부담당입니다');
ok('대표 답변도 남는다', merged.u1.items.a.reply.state === 'done');

/* ── 없어진 항목의 이의는 같이 뺀다 ── */
prev1.u1.objection.byItem.zzz = { text:'없는 건', at:'x' };
merged = ctx.pcfMergeAll(rows2, prev1, '2026-08-08T00:00:00Z', '권형하', '2026-08-12');
ok('없어진 항목의 이의는 따라서 빠진다', !merged.u1.objection.byItem.zzz);

/* ── 항목이 늘어난 경우 ── */
const EMP3 = JSON.parse(JSON.stringify(EMP));
EMP3[0].items.push(it({ fiId:'g', amount:90000 }));
d = ctx.pcfDiff(ctx.pcfBuildRows(EMP3, USERS, UID), prev1);
ok('새로 생긴 건을 잡아낸다', d.find(r=>r.sid==='u1').addN === 1);

/* ── 항목이 빠진 경우 (입금확정 해제 등) ── */
const EMP4 = JSON.parse(JSON.stringify(EMP));
EMP4[0].items = EMP4[0].items.filter(x => x.fiId !== 'd');
d = ctx.pcfDiff(ctx.pcfBuildRows(EMP4, USERS, UID), prev1);
ok('없어진 건도 잡아낸다', d.find(r=>r.sid==='u1').goneN === 1);

/* ── 현황 세기 ── */
const P = {
  a: { done:true },                                                            // 완료
  b: { done:false },                                                           // 미확인
  c: { done:false, objection:{ byItem:{ x:{ text:'다릅니다', at:'t' } } }, items:{ x:{} } },   // 이의 열림
  d: { done:true,  objection:{ byItem:{ y:{ text:'다릅니다', at:'t' } } },
       items:{ y:{ reply:{ state:'done' } } } },                               // 이의 처리됨 → 완료
  e: { done:true,  objection:{ byItem:{ z:{ text:'다릅니다', at:'t', withdrawnAt:'t2' } } }, items:{ z:{} } } // 직원이 물림 → 완료
};
const cnt = ctx.pcfCount(P);
ok('사람 수를 센다', cnt.people === 5, cnt.people);
ok('완료 3명 (처리된 이의·철회된 이의 포함)', cnt.done === 3, cnt.done);
ok('★ 이의가 열린 사람은 완료로 안 센다', cnt.objOpen === 1 && cnt.objN === 1, JSON.stringify(cnt));
ok('미확인 1명', cnt.todo === 1, cnt.todo);
ok('철회한 이의는 열린 것으로 안 센다', cnt.objN === 1);
ok('발행 안 된 달은 0명', ctx.pcfCount({}).people === 0);

/* ── 마감일 기본값 ── */
ok('마감일 기본은 일주일 뒤', ctx.pcfDefaultDue('2026-08-03T00:00:00Z') === '2026-08-10',
   ctx.pcfDefaultDue('2026-08-03T00:00:00Z'));
ok('달을 넘어가도 맞는다', ctx.pcfDefaultDue('2026-08-28T00:00:00Z') === '2026-09-04',
   ctx.pcfDefaultDue('2026-08-28T00:00:00Z'));

/* ── 이상한 값이 와도 안 터진다 ── */
ok('빈 입력에도 안 터진다',
   ctx.pcfBuildRows(null, null, null).length === 0 && ctx.pcfDiff(null, null).length === 0);
ok('items 없는 사람도 안 터진다', ctx.pcfBuildRows([{ sid:'x' }], USERS, UID).length === 0);
ok('fiId 없는 항목은 버린다', ctx.pcfPickItems({ items:[it({ fiId:'' })] }).length === 0);

/* ── 골라 보내기 ── */
const HOLD = ctx.pcfHolds([
  { sid:'u1', unmatchedCount:1, unmatchedBase:1000000, items:[ it({fiId:'a', amount:400000}) ] },
  { sid:'u2', unmatchedCount:0, items:[ it({fiId:'c', amount:363636}) ] },
  { sid:'u3', unmatchedCount:1, unmatchedBase:500000, items:[ it({fiId:'v', amount:0, category:'unmatched'}) ] }
], USERS);
ok('미반영 있는 사람만 잡는다', HOLD.length === 2, HOLD.map(x=>x.sid).join(','));
ok('보낼 게 있는지도 알려 준다',
   HOLD.find(x=>x.sid==='u1').sendable === 1 && HOLD.find(x=>x.sid==='u3').sendable === 0);
ok('미반영 건수와 기준액을 담는다',
   HOLD.find(x=>x.sid==='u3').n === 1 && HOLD.find(x=>x.sid==='u3').base === 500000);
ok('이름을 붙인다', HOLD.find(x=>x.sid==='u1').name === '권형하');
ok('미반영 없는 사람은 안 잡는다', !HOLD.some(x=>x.sid==='u2'));
ok('빈 입력에도 안 터진다', ctx.pcfHolds(null, null).length === 0);

const rowsU = ctx.pcfBuildRows([
  { sid:'u1', unmatchedCount:2, items:[ it({fiId:'a', amount:400000}) ] }
], USERS, UID);
ok('발행 줄에 미반영 건수가 실린다', rowsU[0].unmatchedN === 2, rowsU[0].unmatchedN);
ok('미반영 없으면 0', ctx.pcfBuildRows([{ sid:'u2', items:[ it({fiId:'c'}) ] }], USERS, UID)[0].unmatchedN === 0);

/* 일부만 골라 보내도 나머지가 안 지워지는지 — update 로 쓰는 이유 */
const two = ctx.pcfBuildRows([
  { sid:'u1', items:[ it({fiId:'a', amount:400000}) ] },
  { sid:'u2', items:[ it({fiId:'c', amount:363636}) ] }
], USERS, UID);
const only1 = ctx.pcfMergeAll([two[0]], {}, '2026-06-01T00:00:00Z', '권형하', '2026-06-08');
ok('고른 사람만 payload 에 담긴다', Object.keys(only1).join(',') === 'u1', Object.keys(only1).join(','));
ok('안 고른 사람 자리는 만들지 않는다', !only1.u2);

/* ── 월 마감 ── */
const M = { ym:'2026-06', lock:null,
  p:{ a:{ done:true }, b:{ done:true } } };
ok('전원 확인되면 마감할 수 있다', ctx.pcfCanClose(M) === true);
ok('한 명이라도 안 했으면 못 한다',
   ctx.pcfCanClose({ ym:'x', p:{ a:{done:true}, b:{done:false} } }) === false);
ok('★ 열린 이의가 있으면 못 한다',
   ctx.pcfCanClose({ ym:'x', p:{ a:{ done:true, items:{f:{}},
     objection:{byItem:{f:{text:'다름',at:'t'}}} } } }) === false);
ok('처리된 이의는 막지 않는다',
   ctx.pcfCanClose({ ym:'x', p:{ a:{ done:true, items:{f:{reply:{state:'done'}}},
     objection:{byItem:{f:{text:'다름',at:'t'}}} } } }) === true);
ok('물린 이의도 막지 않는다',
   ctx.pcfCanClose({ ym:'x', p:{ a:{ done:true, items:{f:{}},
     objection:{byItem:{f:{text:'다름',at:'t',withdrawnAt:'t2'}}} } } }) === true);
ok('이미 마감된 달은 또 못 한다', ctx.pcfCanClose(Object.assign({}, M, { lock:{at:'t'} })) === false);
ok('사람이 없으면 마감 대상 아님', ctx.pcfCanClose({ ym:'x', p:{} }) === false);
ok('마감 경로가 그 달 아래', ctx.pcfLockPath('2026-06') === 'data/perf_confirm/2026-06/lock');

/* ── 이의 펴기 ── */
const OB = ctx.pcfOpenObjections({ ym:'x', p:{
  u1:{ name:'권형하', items:{ f1:{date:'2026-06-03',coName:'가',amount:100} },
       objection:{ byItem:{ f1:{ text:'다릅니다', at:'t1' } } } },
  u2:{ name:'박한별', items:{ f2:{date:'2026-06-05',coName:'나',amount:200,reply:{state:'done'}} },
       objection:{ byItem:{ f2:{ text:'다릅니다', at:'t2' } } } },
  u3:{ name:'김혜민', items:{ f3:{} },
       objection:{ byItem:{ f3:{ text:'다릅니다', at:'t3', withdrawnAt:'t4' } } } },
  u4:{ name:'최기운', items:{ f4:{} }, objection:{ byItem:{ f4:{ at:'t5' } } } }   // 사유 없음
}});
ok('사유 있는 이의만 모은다', OB.length === 3, OB.map(x=>x.name).join(','));
ok('열린 것이 맨 위로', OB[0].open === true && OB[0].name === '권형하', OB.map(x=>x.name+(x.open?'(열림)':'')).join(','));
ok('답변한 건은 닫힘', OB.find(x=>x.name==='박한별').closed === true && OB.find(x=>x.name==='박한별').open === false);
ok('물린 건은 열림이 아니다', OB.find(x=>x.name==='김혜민').withdrawn === true && OB.find(x=>x.name==='김혜민').open === false);
ok('사람 이름과 항목 정보를 함께 담는다', OB[0].sid === 'u1' && OB[0].it.coName === '가');
ok('빈 달에도 안 터진다', ctx.pcfOpenObjections(null).length === 0 && ctx.pcfOpenObjections({}).length === 0);

/* ── 배선 확인 ── */
ok('저장 경로가 data 아래다', /var PCF_PATH = 'data\/perf_confirm'/.test(html));
ok('확인 현황 탭이 있다', /confirm:'⭐ 확인 현황'/.test(html) && /tab==='confirm' \? h\(PerfConfirmTab/.test(html));
ok('마감을 풀면 푼 기록이 남는다', /unlocked: \{ at:new Date\(\)\.toISOString\(\), by:by\|\|'', reason:reason\|\|'' \}/.test(html));
ok('마감 풀 때 사유를 받는다', /왜 푸는지 적어 주세요/.test(html));
ok('★ 마감된 달은 발행이 막힌다', /if\(busy \|\| !sent\.length \|\| lock\) return;/.test(html));
ok('마감된 달은 단추 글자도 바뀐다', /lock \? '마감된 달입니다'/.test(html));
/* 이의 답변은 업무관리(work.html)로 옮겼다 — 역할 나누기.
   여기는 계산·조정·발행·마감을 맡는다. 답변칸이 두 곳에 있으면 어디서 손댔는지 알 수 없다. */
ok('★ 여기서는 답변을 쓰지 않는다', !/\/reply'\)\.set\(/.test(html) && html.indexOf('function pcfReply(') < 0);
ok('★ 답변 입력칸이 남아 있지 않다',
   html.indexOf('답변을 적어주세요') < 0 && html.indexOf('답변하고 닫기') < 0);
ok('어디서 답하는지 알려 준다', /답변은 업무관리에서 합니다/.test(html));
ok('금액을 고치는 길은 여기 그대로 남는다', /입금 건 보기 ↗/.test(html));
/* 읽는 쪽은 그대로 — 무엇이라 답했는지는 여기서도 보여야 판단이 된다 */
ok('답한 내용은 여기서도 보인다', /o\.closed && o\.it\.reply/.test(html));
ok('이의 내용도 그대로 보인다', /o\.ob\.text \|\| ''/.test(html));
ok('원천으로 가는 길은 기존 방식을 쓴다',
   /sessionStorage\.setItem\('global_search_focus'/.test(html) && /window\.navigateTo\(menu\)/.test(html));
ok('보낼 사람만 골라 쓴다', /pcfMergeAll\(sent, prev/.test(html));
ok('고르기 단추 셋이 있다',
   html.indexOf("'확정된 사람만'") > 0 && /pickAll\(true\)/.test(html) && /pickAll\(false\)/.test(html));
ok('확정된 사람만 = 미반영 있는 사람 제외', /n\[r\.sid\] = !\(r\.unmatchedN > 0\)/.test(html));
ok('안 고른 사람이 있으면 미리 알려 준다', /고르지 않은 ' \+ left \+ '명은 이번에 안 나갑니다/.test(html));
ok('발행 단추에 인원이 찍힌다', /sent\.length \+ '명에게 발행'/.test(html));
ok('발행 창을 성과관리에 달았다', /h\(PerfPublishModal, \{[\s\S]{0,80}ym: selYm/.test(html));
ok('발행 단추가 있다', html.indexOf('⭐ 이달 확인 발행') >= 0);
ok('발행 뒤 현황을 다시 읽는다', /onDone: function\(\)\{ setPubTick/.test(html));
ok('사번→계정은 uid_roles 를 뒤집어 만든다', /fbDb\.ref\('uid_roles'\)/.test(html));
ok('쓰기는 update 로 (남의 칸 안 건드림)', /ref\(PCF_PATH \+ '\/' \+ ym \+ '\/p'\)\.update\(upd\)/.test(html));

console.log('\n  === ' + pass + ' 통과 / ' + fail + ' 실패 ===');
process.exit(fail ? 1 : 0);
