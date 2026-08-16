/* 입금관리 「미입금 대기」 표가 창 바닥까지 안 내려오던 것 (2026-08-16 대표 지시)

   ★ 높이를 calc(100vh - 340px) 로 «못 박아» 두었다. 그런데 표 위의 안내띠·갈래단추·
     검색줄 높이가 그때그때 다르다(갈래 개수·창 너비에 따라 줄이 접힌다).
     그래서 아래가 한참 비거나 반대로 표가 잘렸다 — 대표 화면에서는 «비는» 쪽이었다.
   고침: 숫자로 못 박지 말고 «재서» 정한다. 거래내역(_ldFit)에서 같은 문제를
        이미 그렇게 고쳤으므로 같은 방식을 쓴다.
   ★ 표 «아래» 쪽 번호 줄만큼은 반드시 남긴다 — 안 그러면 표가 그것을 화면 밖으로
     밀어내 「몇 쪽인지·다음 쪽」을 못 누른다. */
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

const BLK = src.slice(src.indexOf('function IncomePendingTab(){'),
                      src.indexOf('function IncomePendingTab(){') + 3000);

console.log('\n[① 숫자로 못 박지 않고 잰다]');
t('구역을 잘라냈다', BLK.length > 1200, true);
t('★ 표 상자의 화면상 위치를 잰다', /var top = el\.getBoundingClientRect\(\)\.top;/.test(BLK), true);
t('★ 창 바닥까지 채운다', /window\.innerHeight - top - below - 16/.test(BLK), true);
t('★ 옛 고정 높이로 표를 그리지 않는다',
  /maxHeight:'calc\(100vh - 340px\)',background:'#fff'\} \}/.test(src), false);
/* 아직 못 쟀을 때(첫 그림)만 옛 값을 쓴다 — 그 사이 표가 사라져 보이면 안 된다 */
t('처음 한 번은 옛 값으로 그린다', /_pbH \? _pbH\+'px' : 'calc\(100vh - 340px\)'/.test(BLK), true);

console.log('\n[② 쪽 번호 줄을 밀어내지 않는다]');
t('★ 아래에 남길 높이를 뺀다', /var want = Math\.max\(240, Math\.round\(window\.innerHeight - top - below - 16\)\);/.test(BLK), true);
t('★ 쪽 번호 줄 높이를 실제로 잰다', /below = pg\.getBoundingClientRect\(\)\.height \+ 10;/.test(BLK), true);
t('쪽 번호 줄에 손잡이를 달았다', /h\('div', \{ ref:_pgRef \},/.test(src), true);
t('없을 때는 0 으로 둔다 (아직 안 그려졌을 수 있다)', /var below = 0;/.test(BLK), true);

console.log('\n[③ 너무 작아지지 않는다]');
/* 창이 작거나 위쪽 도구줄이 길면 표가 한 줄짜리가 된다 — 그러면 쓸 수가 없다 */
t('★ 최소 240px 은 지킨다', /Math\.max\(240,/.test(BLK), true);

console.log('\n[④ 「고침 → 다시 그림 → 고침」 이 끝나지 않는 일이 없게]');
/* 재고 → 상태를 바꾸고 → 다시 그리면서 또 재면 무한히 돈다. 8px 안쪽은 그대로 둔다. */
t('★ 8px 안쪽 차이는 무시한다', /Math\.abs\(prev - want\) < 8 \? prev : want/.test(BLK), true);

console.log('\n[⑤ 창 크기가 바뀌면 다시 잰다]');
t('그릴 때마다 다시 잰다', /useEffect\(function\(\)\{ _pbFit\(\); \}\);/.test(BLK), true);
t('창 크기 바뀔 때도', /window\.addEventListener\('resize', _pbFit\);/.test(BLK), true);
t('★ 치울 때 손잡이를 뗀다 (안 떼면 화면을 옮겨도 계속 돈다)',
  /return function\(\)\{ window\.removeEventListener\('resize', _pbFit\); \};/.test(BLK), true);

console.log('\n[⑥ 셈이 실제로 맞는지 돌려 본다]');
/* 재는 셈만 떼어 내 그대로 굴려 본다 */
const ctx = { Math:Math, console:console };
vm.createContext(ctx);
vm.runInContext([
  'function fit(innerHeight, top, pgHeight){',
  '  var below = pgHeight ? pgHeight + 10 : 0;',
  '  return Math.max(240, Math.round(innerHeight - top - below - 16));',
  '}'
].join('\n'), ctx);
// 1080 - 330(표 시작) - 54(쪽번호 44 + 사이 여백 10) - 16(바닥) = 680
t('창 1080 · 표가 330 에서 시작 · 쪽번호 44 → 680', ctx.fit(1080, 330, 44), 680);
t('윗줄이 길어져 430 에서 시작하면 그만큼 줄어든다', ctx.fit(1080, 430, 44), 580);
t('★ 쪽 번호 줄이 두 줄(88)이면 더 남긴다', ctx.fit(1080, 330, 88), 636);
t('★ 창이 작으면 최소 높이를 지킨다', ctx.fit(500, 400, 44), 240);
t('쪽 번호 줄이 아직 없으면 그만큼 더 쓴다', ctx.fit(1080, 330, 0), 734);

console.log('\n  === ' + pass + ' 통과 / ' + fail + ' 실패 ===\n');
process.exit(fail ? 1 : 0);
