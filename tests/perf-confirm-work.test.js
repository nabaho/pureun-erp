/* 업무관리 성과급 확인 화면 — 상태 판정과 안전장치 */
const fs = require('fs'), vm = require('vm');
const path = require('path');
// 인자를 안 주면 저장소의 대상 파일을 본다 (node tests/perf-confirm-work.test.js 로 바로 실행)
const TARGET = process.argv[2] || path.join(__dirname, '..', 'work.html');
const html = fs.readFileSync(TARGET, 'utf8');
const i = html.indexOf('var PC_PATH=');
const j = html.indexOf('/* ── 라우팅 ── */', i);
if (i < 0 || j < 0) { console.log('  FAIL 성과급 블록 못찾음'); process.exit(1); }
const blk = html.slice(i, j);

const ctx = { console, Date, Math, Object, String, Promise, JSON,
  S: { me:{ sid:'u1' }, vsid:'u9' }, pad:(n)=>(n<10?'0':'')+n,
  navigator:{ userAgent:'test' }, window:{} };
vm.createContext(ctx); vm.runInContext(blk, ctx);

let pass = 0, fail = 0;
function ok(n, c, e) { if (c) { pass++; console.log('  PASS ' + n); } else { fail++; console.log('  FAIL ' + n + (e ? ' — ' + e : '')); } }

/* ── 본인 고정 (이 파일에서 제일 중요한 것) ── */
ok('★ 로그인 본인 사번을 쓴다', ctx.pcMySid() === 'u1');
ok('★ 열람 대상(S.vsid)을 안 따라간다', ctx.pcMySid() !== ctx.S.vsid);
ctx.S.vsid = 'u7';
ok('★ 열람 대상을 바꿔도 내 것만 본다', ctx.pcMySid() === 'u1');
ctx.S.me = null;
ok('로그인 정보가 없으면 빈 사번', ctx.pcMySid() === '');
ctx.S.me = { sid:'u1' };
/* 대표 전체 현황은 남의 sid 를 다루므로 "sid 를 받는 함수 금지"는 더 못 쓴다.
   대신 진짜 위험한 것만 정확히 막는다 — 쓰기 경로가 밖에서 온 sid 를 쓰면 남의 칸에 쓴다. */
['pcLoad','pcSetOk','pcSaveObj','pcWithdrawObj','pcMarkDone'].forEach(function(fn){
  const m = blk.match(new RegExp('function ' + fn + '\\(([^)]*)\\)'));
  ok('★ ' + fn + ' 는 sid 를 밖에서 안 받는다', !!m && !/\bsid\b/.test(m[1]), m && m[1]);
});
ok('★ 쓰기 함수는 모두 pcMySid() 로 사번을 얻는다',
   (blk.match(/var sid\s*=\s*pcMySid\(\)/g) || []).length >= 4,
   (blk.match(/var sid\s*=\s*pcMySid\(\)/g) || []).length + '곳');
const admBlk = blk.slice(blk.indexOf('function pcAdminHTML'));
ok('★ 대표 전체 현황에는 쓰기가 하나도 없다 (읽기 전용)',
   !/\.update\(|\.set\(|pcSetOk\(|pcSaveObj\(|pcMarkDone\(|pcWithdrawObj\(/.test(admBlk));
ok('경로를 항상 내 사번으로 만든다', /PC_PATH\+'\/'\+ym\+'\/p\/'\+sid/.test(blk));
ok('viewer() 를 안 쓴다', blk.indexOf('viewer(') < 0);

/* ── 줄 상태 ── */
const P = { items:{ a:{ok:true}, b:{ok:false}, c:{ok:false}, d:{ok:true} },
            objection:{ byItem:{ c:{ text:'다릅니다', at:'t' },
                                 d:{ text:'다릅니다', at:'t', withdrawnAt:'t2' } } } };
ok('확인한 줄은 ok', ctx.pcRowState(P,'a') === 'ok');
ok('아무것도 안 한 줄은 todo', ctx.pcRowState(P,'b') === 'todo');
ok('이의 건 줄은 obj', ctx.pcRowState(P,'c') === 'obj');
ok('★ 물린 이의는 이의가 아니다', ctx.pcRowState(P,'d') === 'ok', ctx.pcRowState(P,'d'));
ok('사유가 빈 이의는 안 친다', ctx.pcRowState({ items:{x:{}}, objection:{byItem:{x:{at:'t'}}} },'x') === 'todo');

const c = ctx.pcCounts(P);
ok('처리·미처리를 센다', c.total === 4 && c.todo === 1 && c.handled === 3, JSON.stringify(c));
ok('한 줄이라도 남으면 완료 못 함', ctx.pcAllHandled(P) === false);
ok('이의도 처리로 친다 — 다 처리하면 완료 가능',
   ctx.pcAllHandled({ items:{a:{ok:true},c:{ok:false}},
                      objection:{byItem:{c:{text:'다릅니다',at:'t'}}} }) === true);
ok('항목이 하나도 없으면 완료 대상 아님', ctx.pcAllHandled({ items:{} }) === false);

/* ── 마감일 ── */
const today = new Date().toISOString().slice(0,10);
ok('마감 전이면 안 늦음', ctx.pcDueLate('2099-12-31') === false);
ok('마감이 지나면 늦음', ctx.pcDueLate('2000-01-01') === true);
ok('오늘이 마감이면 아직 안 늦음', ctx.pcDueLate(today) === false);
ok('마감일이 없으면 안 늦음', ctx.pcDueLate('') === false && ctx.pcDueLate(null) === false);

/* ── 훑을 달 ── */
const ms = ctx.pcMonths(4);
ok('넉 달을 만든다', ms.length === 4, ms.join(','));
ok('YYYY-MM 모양', ms.every(m => /^\d{4}-\d{2}$/.test(m)), ms.join(','));
ok('최근 달이 먼저', ms[0] === today.slice(0,7), ms[0]);
ok('한 달씩 거슬러 간다', new Date(ms[0]+'-01') > new Date(ms[1]+'-01'));

/* ── 잔돈 처리 ── */
ok('금액에 쉼표를 넣는다', ctx.pcMoney(1234567) === '1,234,567');
ok('빈 값도 안 터진다', ctx.pcMoney(null) === '0' && ctx.pcMoney(undefined) === '0');
ok('날짜를 짧게 보여 준다', ctx.pcDay('2026-08-03') === '8/3');
ok('이상한 날짜도 안 터진다', ctx.pcDay('') === '' && ctx.pcDay(null) === '');

/* ── 배선 ── */
ok('메뉴에 성과급이 붙었다', /id="nav-perf"/.test(html));
ok('라우팅에 perf 가 있다', /'my','team','stats','kb','ho','archive','perf'/.test(html));
ok('perf 이면 성과급 화면을 그린다', /S\.view==='perf'\) renderPerf\(\)/.test(html));
ok('제목이 내 성과급', /perf:'내 성과급'/.test(html));
ok('안 한 달 수를 배지로 보여 준다', /cnt-perf/.test(html) && /filter\(function\(x\)\{return !x\.p\.done;\}\)/.test(html));
ok('로그인 뒤 한 번 읽어 둔다', /pcRefresh\(\)\.then\(function\(\)\{ route\(\); pcNag\(\); \}\)/.test(html));

/* ── 대표 전체 현황 ── */
/* 성과급은 총괄 관리자(admin)와 관리자대행(admin-delegate)이 같이 다룬다 = uid_roles.isAdmin.
   fin(재무 메뉴 권한)으로 열면 재무 담당자도 전 직원 성과급을 보게 된다. */
ok('★ 전체 현황은 총괄·대행만 (isAdmin) — 서버에 물어본다',
   /uid_roles\/'\+u\.uid\+'\/isAdmin/.test(blk));
ok('★ 성과급 코드에 fin 은 안 쓴다', blk.indexOf("'/fin'") < 0);
ok('권한 없으면 전체를 아예 안 읽는다', /if\(!fin\) return \[\];/.test(blk));
ok('전체 현황은 대표만 채워진다', /pcAdminHTML/.test(blk) && /S\.perfAll\|\|\[\]/.test(blk));
ok('전체 현황에 쓰기 기능은 없다',
   !/pcAdminHTML[\s\S]{0,4000}?(\.update\(|\.set\()/.test(blk));
ok('처리·답변은 푸른이알피로 보낸다', /이의 답변은 푸른이알피/.test(blk));

/* ── 달력 줄 + 사람 탭 ── */
ok('달을 앞뒤로 옮길 수 있다', /function pcAdmMove\(d\)/.test(blk) && /pcAdmMove\(-1\)/.test(blk) && /pcAdmMove\(1\)/.test(blk));
ok('오늘로 가는 단추가 있다', /function pcAdmToday\(\)/.test(blk) && /pcAdmToday\(\)/.test(blk));
ok('사람 탭이 있다', /function pcTabHTML/.test(blk) && /pcAdmPick/.test(blk));
ok('전체 탭이 맨 앞', /pcTabHTML\('', '전체/.test(blk));
ok('이의인 사람 탭에 딱지가 붙는다', /w\.k==='obj'[\s\S]{0,120}이의</.test(blk));
ok('미확인인 사람 탭에 빨간 점', /w\.k==='todo'[\s\S]{0,140}#dc2626/.test(blk));
ok('달을 바꾸면 사람 선택이 풀린다', /S\.perfAdmYm=ym; S\.perfAdmSid='';/.test(blk));
ok('발행 안 된 달은 안내가 뜬다', /이 달은 아직 발행되지 않았습니다/.test(blk));

/* ── 판단 근거 ── */
ok('진행 칸이 있다 (몇 줄 중 몇 줄)', /c\.handled\s*\+\s*' \/ '\s*\+\s*c\.total/.test(blk));
ok('다음 할 일을 한 줄로 알려 준다', /끝나면 이 달을 마감할 수 있습니다/.test(blk));
ok('다 끝나면 마감하라고 알려 준다', /모두 확인했습니다/.test(blk));
ok('이의가 며칠째인지 센다', /oldest[\s\S]{0,80}일째/.test(blk));
ok('마감이 며칠 지났는지 센다', /마감 '\+pcDaysAgo/.test(blk));

const D = ctx.pcDaysAgo;
ok('며칠 전을 센다', D(new Date(Date.now()-3*86400000).toISOString()) === 3, D(new Date(Date.now()-3*86400000).toISOString()));
ok('오늘이면 0', D(new Date().toISOString()) === 0);
ok('미래면 0 (음수 안 나온다)', D(new Date(Date.now()+86400000).toISOString()) === 0);
ok('빈 값도 안 터진다', D('') === 0 && D(null) === 0 && D('말도안됨') === 0);

const ST = ctx.pcMonthStat({
  a:{ done:true, total:100 },
  b:{ done:false, total:200 },
  c:{ done:false, total:300, items:{f:{}}, objection:{byItem:{f:{text:'다름',at:'t'}}} }
});
ok('달 통계를 센다', ST.people===3 && ST.done===1 && ST.obj===1 && ST.todo===1, JSON.stringify(ST));
ok('합계를 더한다', ST.sum===600);
ok('남은 사람 = 이의 + 미확인', ST.left===2);
ok('빈 달은 0', ctx.pcMonthStat({}).people===0 && ctx.pcMonthStat(null).left===0);

const SORT = ctx.pcSortSids({
  done1:{ done:true, total:900 },
  todo1:{ done:false, total:100 },
  obj1:{ done:false, total:50, items:{f:{}}, objection:{byItem:{f:{text:'x',at:'t'}}} },
  todo2:{ done:false, total:800 }
});
ok('★ 손봐야 할 사람이 앞으로 (이의 → 미확인 → 완료)',
   SORT.join(',') === 'obj1,todo2,todo1,done1', SORT.join(','));

const W = ctx.pcWho;
ok('완료한 사람', W({ done:true }).k === 'done');
ok('아직 안 한 사람', W({ done:false }).k === 'todo');
ok('이의가 열린 사람', W({ done:false, items:{x:{}}, objection:{byItem:{x:{text:'다름',at:'t'}}} }).k === 'obj');
ok('★ 이의가 열려 있으면 완료라도 이의로 본다',
   W({ done:true, items:{x:{}}, objection:{byItem:{x:{text:'다름',at:'t'}}} }).k === 'obj');
ok('물린 이의는 안 센다',
   W({ done:true, items:{x:{}}, objection:{byItem:{x:{text:'다름',at:'t',withdrawnAt:'t2'}}} }).k === 'done');
ok('대표가 답하면 닫힌다',
   W({ done:true, items:{x:{reply:{state:'done'}}}, objection:{byItem:{x:{text:'다름',at:'t'}}} }).k === 'done');
ok('이의 건수를 알려 준다',
   W({ done:false, items:{x:{},y:{}}, objection:{byItem:{x:{text:'a',at:'t'},y:{text:'b',at:'t'}}} }).t === '이의 2건');

/* ── 3단계 안내 ── */
ok('안내 띠 자리가 있다', /id="perfband"/.test(html));
ok('띠는 성과급 화면에서는 숨긴다', /S\.view==='perf'\)\{ el\.style\.display='none'/.test(blk));
ok('띠는 다 끝나면 사라진다', /var pend=\(S\.perfData\|\|\[\]\)\.filter\(function\(x\)\{ return !x\.p\.done; \}\)/.test(blk));
ok('띠를 누르면 성과급 화면으로 간다', /onclick="go\(\\'perf\\'\)"/.test(blk));
ok('마감이 지나면 띠가 빨개진다', /late\?'#fef2f2':'#fffbeb'/.test(blk));
ok('화면을 옮길 때마다 띠를 다시 판단한다', /pcBand\(\);\s+\/\* 화면을 옮길 때마다/.test(html));
ok('알림은 하루 한 번', /localStorage\.getItem\(key\)===today\) return/.test(blk));
ok('알림 기억은 사람마다 따로', /'perf_nag_'\+pcMySid\(\)/.test(blk));
ok('알림에 나중에·확인하러 가기가 있다', /나중에/.test(blk) && /확인하러 가기/.test(blk));
ok('알림이 하루 한 번임을 알려 준다', /이 알림은 하루에 한 번만 뜹니다/.test(blk));
ok('이의를 남기면 확인을 푼다', /pcSaveObj[\s\S]{0,400}return pcSetOk\(ym,fid,false\)/.test(blk));
ok('물릴 때 사유는 안 지운다 (withdrawnAt 만 찍는다)',
   /withdrawnAt'\)\s*\n?\s*\.set\(new Date\(\)\.toISOString\(\)\)/.test(blk));
ok('금액·이름 쓰기는 아예 없다',
   !/update\(\{[^}]*amount:/.test(blk) && !/update\(\{[^}]*\bname:/.test(blk));

console.log('\n  === ' + pass + ' 통과 / ' + fail + ' 실패 ===');
process.exit(fail ? 1 : 0);
