/* 건의함 분류 — 포털 첫 화면과 같은 세 묶음 (2026-08-10 대표 지시)
   "업무지원, 직접업무, 기타 건의 3가지로 항목 나눠달라"
   포털에서 업무지원에 있는 프로그램은 건의함에서도 업무지원에 있어야
   사람이 두 화면에서 같은 자리를 찾는다.
   ★ key 는 지난 건의 기록에 저장돼 있으므로 하나도 바뀌면 안 된다 — 묶음(g)만 바꾼다. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const src = fs.readFileSync(path.join(__dirname, '..', 'enter.html'), 'utf8').replace(/\r\n/g, '\n');

let pass = 0, fail = 0;
function t(name, got, want){
  const G = JSON.stringify(got), W = JSON.stringify(want);
  if(G === W){ pass++; console.log('  PASS ' + name + '  (' + G + ')'); }
  else { fail++; console.log('  FAIL ' + name + '\n    받음 ' + G + '\n    기대 ' + W); }
}

const ctx = {};
vm.createContext(ctx);
const grab = (from, to) => src.slice(src.indexOf(from), src.indexOf(to));
vm.runInContext(grab('var SG_CATS = [', 'var SG_STATUS ='), ctx);
const CATS = ctx.SG_CATS, GROUPS = ctx.SG_GROUPS;

console.log('\n[① 묶음이 셋이다 — 포털 첫 화면과 같은 이름]');
t('묶음 수', GROUPS.length, 3);
t('이름과 순서 (포털 화면 순서 그대로)', GROUPS.map(function(g){ return g.label; }),
  ['업무지원', '직접업무', '기타 건의']);

console.log('\n[② 어느 항목이 어느 묶음인가 — 포털 타일 배치를 따른다]');
function names(g){ return CATS.filter(function(c){ return c.g === g; }).map(function(c){ return c.name; }); }
t('업무지원 = 업무를 돕는 도구', names('sup'),
  ['푸른이알피', '컨설팅 일정', '업무관리', '명함첩', '문서·이력', '포털']);
t('직접업무 = 직접 수행하는 업무', names('direct'), ['기금관리', '취업규칙', '급여관리']);
t('기타 건의 = 프로그램이 아닌 것', names('misc'),
  ['업무 개선', '규정·제도', '교육·연수', '사무환경·비품', '인사·복지', '기타']);

console.log('\n[③ 빠뜨린 항목이 없다]');
const known = { sup:1, direct:1, misc:1 };
t('모든 항목이 세 묶음 중 하나에 있다 (묶음 밖 항목은 화면에서 사라진다)',
  CATS.filter(function(c){ return !known[c.g]; }).map(function(c){ return c.name; }), []);
t('항목 수는 그대로 15개 (없앤 항목이 없다)', CATS.length, 15);

console.log('\n[④ key 는 하나도 안 바뀌었다 — 지난 건의 분류가 깨지면 안 된다]');
t('key 목록 그대로', CATS.map(function(c){ return c.key; }).sort(),
  ['bizwork','cards','consult','docs','edu','erp','etc','fund','hrwelf',
   'office','payroll','policy','portal','rules','work']);
t('key 가 겹치지 않는다', new Set(CATS.map(function(c){ return c.key; })).size, 15);

console.log('\n[⑤ 화면이 묶음을 그대로 그린다]');
t('묶음마다 제목 + 그 묶음의 칩만',
  /SG_GROUPS\.map\(function\(gr\)\{[\s\S]{0,200}?SG_CATS\.filter\(function\(c\)\{ return c\.g===gr\.g; \}\)/.test(src), true);
t('옛 묶음 아이디(app·biz)가 코드에 안 남았다 (남으면 그쪽 묶음이 비어 그려진다)',
  /g:'app'|g:'biz'|g===\s*'app'|g===\s*'biz'/.test(src), false);

console.log('\n  === ' + pass + ' 통과 / ' + fail + ' 실패 ===\n');
process.exit(fail ? 1 : 0);
