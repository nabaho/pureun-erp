/* 한 건 저장이 «레코드 통째» 라 남의 칸을 되돌리던 것 (2026-08-11)
   대표 지시: "또다시 동시 접속해서 다른 근로자들이 넣은 정보가 사라지는 경우가
   자꾸 발생하는데 이 부분 어떻게 해야 할지 다시 검토해 달라."

   ★ 저장 길이 셋인데 규칙이 달랐다
       통째 저장 dbSet   → 바뀐 칸만 서버에 씀   (이미 맞음)
       칸 저장  dbPatch  → 넘긴 칸만 서버에 씀   (이미 맞음)
       한 건 저장 dbUpsert → 레코드 «통째» 로 씀  ← 이것만 달랐다
     그래서 A가 전화번호, B가 주소를 고쳐도 나중 사람이 앞사람 칸을 되돌렸다.
     서로 다른 칸을 고쳤는데도 하나가 사라진다 — 그것도 아무 말 없이.

   이 검사는 «바뀐 칸만 골라내는» 함수를 실제로 돌려 규칙을 확인한다. */
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
vm.runInContext(src.slice(src.indexOf('var _FIELD_BADKEY = '), src.indexOf('// ── 근태·휴가 마감월 관문')), ctx);

const PREV = { id:'co-1', name:'유하정관', phone:'02-111-1111', addr:'서울', memo:'' };

console.log('\n[① 바뀐 칸만 보낸다 — 이것이 핵심이다]');
const one = ctx._recFieldPaths(Object.assign({}, PREV, { phone:'02-222-2222' }), PREV);
t('바뀐 칸이 담겼다', one['co-1/phone'], '02-222-2222');
t('★ 안 바뀐 칸(주소)은 안 보낸다 — 남이 고친 주소를 되돌리지 않는다', 'co-1/addr' in one, false);
t('★ 안 바뀐 칸(이름)도 안 보낸다', 'co-1/name' in one, false);
t('★ 레코드를 통째로 덮지 않는다', 'co-1' in one, false);
t('누구인지는 늘 함께 보낸다', one['co-1/id'], 'co-1');

console.log('\n[② 두 사람이 서로 다른 칸을 고쳐도 둘 다 살아남는다]');
/* A는 전화번호, B는 주소. 각자 자기가 본 판(PREV)을 기준으로 저장한다. */
const A = ctx._recFieldPaths(Object.assign({}, PREV, { phone:'010-9999' }), PREV);
const B = ctx._recFieldPaths(Object.assign({}, PREV, { addr:'대전' }), PREV);
t('A는 전화번호만 보낸다', Object.keys(A).sort(), ['co-1/id', 'co-1/phone']);
t('B는 주소만 보낸다', Object.keys(B).sort(), ['co-1/addr', 'co-1/id']);
/* 서버는 두 사람이 보낸 칸을 각각 받아 얹는다 — 겹치는 칸이 없으면 아무것도 안 지워진다 */
const server = Object.assign({}, PREV);
Object.keys(A).forEach(p => { server[p.split('/')[1]] = A[p]; });
Object.keys(B).forEach(p => { server[p.split('/')[1]] = B[p]; });
t('★ A의 전화번호가 살아 있다', server.phone, '010-9999');
t('★ B의 주소도 살아 있다', server.addr, '대전');

console.log('\n[③ 같은 칸을 둘이 고치면 나중 사람이 이긴다 — 이건 어쩔 수 없다]');
/* 다만 이때는 dbUpsert 안의 «그물»(_conflictNet)이 덮어썼다고 알린다. 조용히 사라지지는 않는다. */
t('그물은 그대로 있다', /if\(_prevRec\) _conflictNet\(k, item, _prevRec\);/.test(src), true);
t('그물은 시각을 찍기 전에 본다 (뒤에 보면 내가 읽어온 판을 알 수 없다)',
  src.indexOf('if(_prevRec) _conflictNet(k, item, _prevRec);') < src.indexOf('_recStamp(item);\n  var found = false;'), true);

console.log('\n[④ 지운 칸은 «지우라» 고 보낸다 — 안 보내면 옛 값이 서버에 남는다]');
const gone = ctx._recFieldPaths({ id:'co-1', name:'유하정관', phone:'02-111-1111', addr:'서울' }, PREV);
t('없어진 칸은 null 로', gone['co-1/memo'], null);

console.log('\n[⑤ 통째로 보내야 하는 두 경우]');
const isNew = ctx._recFieldPaths({ id:'co-9', name:'새 업체' }, null);
t('새 레코드는 통째 — 보낼 「바뀐 칸」이라는 게 없다', isNew['co-9'].name, '새 업체');
t('새 레코드는 칸 경로를 안 쓴다', 'co-9/name' in isNew, false);
/* Firebase 경로에 못 쓰는 글자(. # $ [ ] /)가 칸 이름에 있으면 경로가 깨진다.
   하나라도 있으면 그 레코드는 통째로 — 일부만 보내면 반쪽짜리가 남는다. */
const bad = ctx._recFieldPaths({ id:'co-1', name:'유하정관', 'a.b':1 }, PREV);
t('★ 칸 이름에 금지문자가 있으면 통째로', 'co-1' in bad, true);
t('금지문자가 있으면 칸 경로는 하나도 안 쓴다',
  Object.keys(bad).filter(k => k.indexOf('/') >= 0).length, 0);
const badPrev = ctx._recFieldPaths({ id:'co-1', name:'유하정관' }, { id:'co-1', name:'유하정관', 'x#y':1 });
t('앞 판(prev)에 금지문자가 있어도 통째로', 'co-1' in badPrev, true);
/* 금지문자는 다섯이다 — 하나라도 빠뜨리면 그 글자로 «경로가 쪼개져» 엉뚱한 자리에 쓰인다.
   특히 슬래시는 Firebase 경로 구분자 그 자체라 조용히 다른 칸을 만든다. */
t('★ 슬래시(/)도 통째로', 'co-1' in ctx._recFieldPaths({ id:'co-1', 'a/b':1 }, PREV), true);
t('★ 대괄호([)도 통째로', 'co-1' in ctx._recFieldPaths({ id:'co-1', 'a[0':1 }, PREV), true);
t('★ 닫는 대괄호(])도 통째로', 'co-1' in ctx._recFieldPaths({ id:'co-1', 'a]0':1 }, PREV), true);
t('★ 달러($)도 통째로', 'co-1' in ctx._recFieldPaths({ id:'co-1', 'a$b':1 }, PREV), true);

console.log('\n[⑥ 값의 모양이 달라도 제대로 가려낸다]');
const objSame = ctx._recFieldPaths({ id:'co-1', tags:['a','b'] }, { id:'co-1', tags:['a','b'] });
t('속이 같은 목록은 안 보낸다 (모양만 다른 같은 값)', 'co-1/tags' in objSame, false);
const objDiff = ctx._recFieldPaths({ id:'co-1', tags:['a','c'] }, { id:'co-1', tags:['a','b'] });
t('속이 다르면 보낸다', objDiff['co-1/tags'], ['a','c']);
const undef = ctx._recFieldPaths({ id:'co-1', name:undefined }, PREV);
t('빈 값(undefined)은 null 로 바꿔 보낸다 — 그대로 보내면 Firebase가 거부한다', undef['co-1/name'], null);

console.log('\n[⑦ 실제로 배선이 되어 있다]');
const UP = src.slice(src.indexOf('function dbUpsert(k, item){'), src.indexOf('// 1건의 특정 필드만 수정'));
t('한 건 저장이 바뀐 칸만 보낸다', /_recServerWrite\(k, _recFieldPaths\(item, _prevRec\)\);/.test(UP), true);
t('★ 레코드를 통째로 담던 옛 코드가 사라졌다', /var cp = \{\}; cp\[item\.id\] = item;/.test(src), false);
t('칸 저장(dbPatch)은 원래대로 칸 단위', /cp\[id\+'\/'\+f\] = \(fields\[f\] === undefined \? null : fields\[f\]\);/.test(src), true);
t('삭제는 레코드 통째로 null (칸 단위로 지우면 껍데기가 남는다)', /var cp = \{\}; cp\[id\] = null;/.test(src), true);

console.log('\n[⑧ 세전으로 나뉜 옛 성과급 찾기 — 읽기 전용]');
t('도구가 있다', /function erpPerfBaseAudit\(\)\{/.test(src), true);
t('콘솔에서 부를 수 있다', /window\.erpPerfBaseAudit = erpPerfBaseAudit;/.test(src), true);
const AUD = src.slice(src.indexOf('function erpPerfBaseAudit(){'), src.indexOf('window.erpPerfBaseAudit = erpPerfBaseAudit;'));
/* ★ 이 도구가 스스로 고치면 이미 지급한 성과급과 어긋난다. 절대 쓰면 안 된다. */
t('★ 아무것도 저장하지 않는다', /db(Set|Patch|Upsert|Remove)\(/.test(AUD), false);
t('되돌린 건은 세지 않는다', /fi\.undoneDate/.test(AUD), true);
t('성과 미반영 건도 세지 않는다', /fi\.perfExclude/.test(AUD), true);
t('세금을 뗀 적 없는 건은 볼 것 없다', /if\(base >= amt\) return;/.test(AUD), true);

console.log('\n  === ' + pass + ' 통과 / ' + fail + ' 실패 ===\n');
process.exit(fail ? 1 : 0);
