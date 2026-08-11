/* 묶음표(객체) 자료가 통째로 덮여 남의 것이 사라지던 것 (2026-08-11)
   대표 지시: 동시 접속 자료 사라짐 재검토 — ①번.

   ★ 목록형(배열) 자료는 이미 트랜잭션으로 «내 변경분만 서버 최신 위에 얹어» 왔다.
     그런데 묶음표 자료는 그 길이 아예 없어, 서버가 최신이면 내 변경을 버리고
     아니면 통째로 덮었다.
     거래내역 「골라 둔 짝」·성과%·권한·마감 잠금이 전부 묶음표다.
     A가 3번 줄을 고르고 B가 5번 줄을 고르면 나중 사람이 앞사람 것을 지웠다 —
     여럿이 함께 쓰라고 만든 자리인데 그랬다. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const src = fs.readFileSync(path.join(__dirname, '..', 'pu-erp.html'), 'utf8').replace(/\r\n/g, '\n');

let pass = 0, fail = 0;
function t(name, got, want){
  const G = JSON.stringify(got), W = JSON.stringify(want);
  if(G === W){ pass++; console.log('  PASS ' + name + '  (' + G + ')'); }
  else { fail++; console.log('  FAIL ' + name + '\n    받음 ' + G + '\n    기대 ' + W); }
}

const ctx = { console:console };
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(src.slice(src.indexOf('function erpObjIsMap(x){'),
                          src.indexOf('// ============ 건별 쓰기 프리미티브')), ctx);

console.log('\n[① 무엇이 묶음표인지 가린다]');
t('묶음표', ctx.erpObjIsMap({ a:1 }), true);
t('빈 묶음표도 묶음표', ctx.erpObjIsMap({}), true);
t('★ 목록은 묶음표가 아니다 (목록은 이미 제 길이 있다)', ctx.erpObjIsMap([1,2]), false);
t('없음', ctx.erpObjIsMap(null), false);
t('숫자·글자 같은 낱값은 아니다', ctx.erpObjIsMap('가'), false);

console.log('\n[② 바뀐 열쇠만 골라낸다]');
const PREV = { r1:{ pid:'p1', by:'A' }, r2:{ pid:'p2', by:'A' } };
const d = ctx.erpObjDiff(PREV, { r1:{ pid:'p1', by:'A' }, r2:{ pid:'p2', by:'A' }, r3:{ pid:'p3', by:'A' } });
t('새로 고른 줄만 담긴다', Object.keys(d.set), ['r3']);
t('안 건드린 줄은 안 담는다', 'r1' in d.set, false);
t('지운 줄 없음', d.del, []);
t('바뀐 개수', d.n, 1);
const d2 = ctx.erpObjDiff(PREV, { r1:{ pid:'p1', by:'A' } });
t('빠진 줄은 지울 것으로', d2.del, ['r2']);
const d3 = ctx.erpObjDiff(PREV, PREV);
t('바뀐 게 없으면 0 — 헛통신을 안 한다', d3.n, 0);
const d4 = ctx.erpObjDiff(PREV, { r1:{ pid:'p9', by:'A' }, r2:{ pid:'p2', by:'A' } });
t('속이 바뀌면 담는다 (겉모양만 같은 것에 속지 않게)', Object.keys(d4.set), ['r1']);
t('앞 판이 없으면 전부 새것', Object.keys(ctx.erpObjDiff(null, { a:1, b:2 }).set).sort(), ['a','b']);
t('묶음표가 아닌 것을 넣으면 아무것도 안 돌려준다', ctx.erpObjDiff({}, [1,2]), null);

console.log('\n[③ ★ 두 사람이 서로 다른 줄을 골라도 둘 다 남는다 — 이번 고침의 핵심]');
/* 서버에는 A가 고른 r1 만 있다. B는 그것을 못 본 채(자기 화면엔 없다) r5 를 고른다. */
const server = { r1:{ pid:'p1', by:'A' } };
const bDiff = ctx.erpObjDiff({}, { r5:{ pid:'p5', by:'B' } });   // B가 본 판에는 아무것도 없었다
const merged = ctx.erpObjMerge(server, bDiff);
t('★ A가 고른 줄이 살아 있다', merged.r1.by, 'A');
t('★ B가 고른 줄도 들어갔다', merged.r5.by, 'B');
t('둘 다 있다', Object.keys(merged).sort(), ['r1','r5']);

console.log('\n[④ 내가 지운 것은 지운다 — 그러나 남이 넣은 것은 안 건드린다]');
const dropDiff = ctx.erpObjDiff({ r1:{ by:'A' }, r2:{ by:'A' } }, { r2:{ by:'A' } });  // A가 r1 을 놓았다
const m2 = ctx.erpObjMerge({ r1:{ by:'A' }, r2:{ by:'A' }, r9:{ by:'C' } }, dropDiff);
t('내가 놓은 줄은 사라진다', 'r1' in m2, false);
t('★ 그 사이 C가 고른 줄은 그대로 있다', m2.r9.by, 'C');
t('안 건드린 내 줄도 그대로', m2.r2.by, 'A');

console.log('\n[⑤ 일부러 비우는 것은 막지 않는다]');
/* 통장 처리표 초기화처럼 통째로 비우는 자리가 있다. 전에도 그대로 통과하던 길이라 막으면 기능이 죽는다. */
const clearDiff = ctx.erpObjDiff({ a:1, b:2 }, {});
t('전부 지울 것으로 잡힌다', clearDiff.del.sort(), ['a','b']);
t('비운 결과가 나온다', ctx.erpObjMerge({ a:1, b:2 }, clearDiff), {});
t('★ 그 사이 남이 넣은 것은 비우기에도 살아남는다', ctx.erpObjMerge({ a:1, b:2, z:9 }, clearDiff), { z:9 });

console.log('\n[⑥ 서버가 비어 있거나 모양이 이상해도 안 깨진다]');
t('서버에 아직 없으면 내 것만 올라간다', ctx.erpObjMerge(null, ctx.erpObjDiff({}, { a:1 })), { a:1 });
t('서버가 목록이면 무시하고 내 것만 (실제 저장은 가드가 따로 막는다)',
  ctx.erpObjMerge([1,2], ctx.erpObjDiff({}, { a:1 })), { a:1 });
t('바뀐 것이 없으면 서버 그대로', ctx.erpObjMerge({ a:1 }, null), { a:1 });

console.log('\n[⑦ 원본을 건드리지 않는다 — 되돌리기·다시그리기가 어긋나면 안 된다]');
const orig = { a:1 };
ctx.erpObjMerge(orig, ctx.erpObjDiff({}, { b:2 }));
t('넘긴 묶음표가 그대로다', orig, { a:1 });
const origPrev = { a:1, b:2 };
ctx.erpObjDiff(origPrev, { a:1 });
t('앞 판도 그대로다', origPrev, { a:1, b:2 });

console.log('\n[⑧ 실제로 배선이 되어 있다]');
const SAVE = src.slice(src.indexOf('} else if(erpObjIsMap(v)){'), src.indexOf('// 되돌림 방지(스칼라 설정)'));
t('묶음표는 따로 다룬다', SAVE.length > 500, true);
t('★ 트랜잭션으로 얹는다 (읽고 쓰는 사이에 남이 끼어들어도 안 지워진다)',
  /fbDb\.ref\('data\/'\+k\)\.transaction\(function\(cur\)\{/.test(SAVE), true);
t('바뀐 열쇠만 계산한다', /var _md = erpObjDiff\(prev, v\);/.test(SAVE), true);
t('서버 현재값 위에 얹는다', /var merged = erpObjMerge\(cur && cur\.v, _md\);/.test(SAVE), true);
t('바뀐 게 없으면 아예 안 보낸다', /if\(_md && _md\.n === 0\)\{ _metaRollback\(\); return true; \}/.test(SAVE), true);
t('서버가 딴 모양이면 손대지 않는다', /_mGuard = '형태'; return;/.test(SAVE), true);
t('시각은 늘 커진다 (시계가 틀어져도 뒤로 안 간다)',
  /Math\.max\(\(\(cur && typeof cur\.u === 'number'\) \? cur\.u : 0\) \+ 1, Date\.now\(\)\)/.test(SAVE), true);
t('실패하면 이 기기 값을 지키고 다시 보낼 것으로 표시', /_metaRollback\(\); _markPending\(\);/.test(SAVE), true);
t('성공하면 병합된 결과를 이 기기에도 반영', /_dbCache\[k\] = \(_sv3\.v === undefined \? \{\} : _sv3\.v\);/.test(SAVE), true);
t('화면도 다시 그린다', /_scheduleFbChanged\(k\)/.test(SAVE), true);
/* 낱값(글자·숫자) 설정은 병합할 것이 없다 — 옛 길 그대로 둔다 */
t('낱값 설정은 옛 길 그대로', /\/\/ 되돌림 방지\(스칼라 설정\)/.test(src), true);

console.log('\n  === ' + pass + ' 통과 / ' + fail + ' 실패 ===\n');
process.exit(fail ? 1 : 0);
