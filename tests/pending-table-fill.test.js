/* 표가 창 바닥까지 내려오게 — 공용 도우미 (2026-08-16 대표 지시)

   ★ 화면마다 「표가 구를 상자」 높이를 calc(100vh - N px) 로 «못 박아» 두었다.
     그런데 표 위의 도구줄·갈래단추·검색줄 높이는 그때그때 다르다(갈래 개수·창 너비에
     따라 줄이 접힌다). N 은 «가장 높을 때» 기준이라 평소에는 아래가 한참 비었다.
     게다가 화면마다 숫자가 달라(240·260·280·310·330·340·380·480) 어느 게 맞는지
     아무도 몰랐다. 대표 보고: 「입금관리 화면 아래로 더 내려오게 해라」.

   ★ 고침: 숫자로 못 박지 말고 «재서» 정한다. 셈은 한 곳(useFillHeight)에만 둔다 —
     화면마다 따로 만들면 한쪽만 고쳐지고 나머지는 조용히 뒤처진다(오늘 실제로 그랬다). */
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

/* ── 도우미를 그대로 떼어 실제로 돌린다 (가짜 화면을 세워서) ── */
function run(opt){
  const ctx = { Math:Math, console:console };
  ctx.window = {
    innerHeight: opt.innerHeight,
    getComputedStyle: function(el){ return { position: el.position || 'static' }; }
  };
  vm.createContext(ctx);
  vm.runInContext(src.slice(src.indexOf('function erpFillHeight(el, min){'),
                            src.indexOf('function useFillHeight(min){')), ctx);
  // 형제들을 사슬로 엮는다 (nextElementSibling)
  const sibs = (opt.below || []).map(function(b){
    return { position:b.position || 'static', getBoundingClientRect: function(){ return { height:b.height }; } };
  });
  sibs.forEach(function(s, i){ s.nextElementSibling = sibs[i + 1] || null; });
  const el = {
    getBoundingClientRect: function(){ return { top: opt.top }; },
    nextElementSibling: sibs[0] || null
  };
  return ctx.erpFillHeight(el, opt.min);
}

console.log('\n[① 창 바닥까지 채운다]');
t('창 1080 · 표가 330 에서 시작 · 아래 아무것도 없음', run({ innerHeight:1080, top:330 }), 734);
t('윗줄이 길어져 430 에서 시작하면 그만큼 줄어든다', run({ innerHeight:1080, top:430 }), 634);
t('창이 커지면 더 늘어난다', run({ innerHeight:1440, top:330 }), 1094);

console.log('\n[② 표 아래에 있는 것 자리를 남긴다]');
/* ★ 쪽 번호 줄이 대표적이다 — 안 남기면 표가 그것을 화면 밖으로 밀어내
   「몇 쪽인지·다음 쪽」을 누를 수 없다. */
t('★ 쪽 번호 줄(44) 만큼 남긴다', run({ innerHeight:1080, top:330, below:[{height:44}] }), 680);
t('★ 두 줄(88)이 되면 더 남긴다', run({ innerHeight:1080, top:330, below:[{height:88}] }), 636);
t('아래에 여럿 있으면 다 더한다', run({ innerHeight:1080, top:330, below:[{height:44},{height:20}] }), 660);
t('아래가 없으면 여백도 안 뺀다', run({ innerHeight:1080, top:330, below:[] }), 734);

console.log('\n[③ ★ 뜬 것(모달)은 자리를 차지하지 않는다]');
/* 이걸 안 걸러내면 모달이 열린 화면에서 표가 최소 높이로 쪼그라든다 —
   모달을 닫으면 되돌아오니 «가끔 표가 작아진다» 는 알기 어려운 증상이 된다. */
t('★ position:fixed 인 모달은 빼지 않는다',
  run({ innerHeight:1080, top:330, below:[{height:900, position:'fixed'}] }), 734);
t('★ position:absolute 도 마찬가지',
  run({ innerHeight:1080, top:330, below:[{height:900, position:'absolute'}] }), 734);
t('뜬 것과 진짜가 섞여 있으면 진짜만 뺀다',
  run({ innerHeight:1080, top:330, below:[{height:900, position:'fixed'},{height:44}] }), 680);

console.log('\n[④ 너무 작아지지 않는다]');
/* 창이 작거나 윗줄이 길면 표가 한두 줄짜리가 된다 — 그러면 쓸 수가 없다 */
t('★ 최소 240px 은 지킨다', run({ innerHeight:500, top:400 }), 240);
t('화면마다 최소값을 달리 줄 수 있다', run({ innerHeight:500, top:400, min:300 }), 300);
t('상자가 아직 없으면 0 (그때는 지금까지 쓰던 값이 쓰인다)', (function(){
  const ctx = { Math:Math, console:console }; ctx.window = { innerHeight:1080 };
  vm.createContext(ctx);
  vm.runInContext(src.slice(src.indexOf('function erpFillHeight(el, min){'),
                            src.indexOf('function useFillHeight(min){')), ctx);
  return ctx.erpFillHeight(null);
})(), 0);

console.log('\n[⑤ 「재고 → 다시 그리고 → 또 재고」 가 끝나지 않는 일이 없게]');
const HOOK = src.slice(src.indexOf('function useFillHeight(min){'), src.indexOf('function useEnterSave(onSave){'));
t('★ 8px 안쪽 차이는 무시한다', /Math\.abs\(prev - want\) < 8 \? prev : want/.test(HOOK), true);
t('그릴 때마다 다시 잰다', /useEffect\(function\(\)\{ fit\(\); \}\);/.test(HOOK), true);
t('창 크기가 바뀌면 다시 잰다', /window\.addEventListener\('resize', fit\);/.test(HOOK), true);
t('★ 치울 때 손잡이를 뗀다 (안 떼면 화면을 옮겨도 계속 돈다)',
  /return function\(\)\{ window\.removeEventListener\('resize', fit\); \};/.test(HOOK), true);
/* ★ 못 쟀을 때 옛 값을 지우면, 첫 그림에서 표가 통째로 늘어나 머리글이 안 붙는다 */
t('★ 아직 못 쟀으면 높이를 안 준다 (화면이 지금까지 쓰던 값을 쓴다)',
  /max: \(h \? h \+ 'px' : null\)/.test(HOOK), true);

console.log('\n[⑥ 모든 화면이 이 도우미 하나만 쓴다]');
/* ★ 같은 일을 여러 군데서 만들면 한쪽만 고쳐진다 — 오늘 그 실수를 여러 번 보았다 */
t('★ 화면마다 따로 만든 셈이 남아 있지 않다', /_ldFit|_pbFit|_ldBoxRef|_pbRef/.test(src), false);
t('★ 못 박은 높이가 폴백 밖에 남아 있지 않다',
  (src.match(/maxHeight:\s*'calc\(100vh - \d+px\)'[,}]/g) || []).length, 0);
const uses = (src.match(/useFillHeight\(\)/g) || []).length;
t('★ 17곳이 이 도우미를 쓴다 (표를 새로 만들면 여기도 늘어야 한다)', uses, 17);
/* 폴백은 그대로 남긴다 — 재기가 실패해도 오늘보다 나빠지지 않게 */
t('폴백(지금까지 쓰던 값)이 살아 있다',
  (src.match(/\.max \|\| 'calc\(100vh - \d+px\)'/g) || []).length, 17);

console.log('\n  === ' + pass + ' 통과 / ' + fail + ' 실패 ===\n');
process.exit(fail ? 1 : 0);
