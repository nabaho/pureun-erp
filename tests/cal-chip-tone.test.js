/* 캘린더 일정 칩 색 톤 — 월 보기와 주/일 보기가 «같은 값»을 쓰는지
   대표 지적(2026-08-15): 사람별 지정색이 거의 원색으로 깔려 눈이 아프다.
   ★ 지키려는 것은 «숫자» 가 아니라 «두 화면이 갈라지지 않는 것» 이다.
     예전에는 두 곳에 0.22 를 따로 적어 두어, 한 곳만 고치면 월 보기와
     주 보기의 진하기가 조용히 달라질 수 있었다. 진하기 자체는 언제든
     바꿀 수 있어야 하므로 정확한 값은 못 박지 않는다. */
const fs = require('fs');
const path = require('path');

const HTML = path.join(__dirname, '..', 'pu-erp.html');
const src = fs.readFileSync(HTML, 'utf8').replace(/\r\n/g, '\n');

let pass = 0, fail = 0;
const t = (name, got, want) => {
  const G = JSON.stringify(got), W = JSON.stringify(want);
  if(G === W) pass++;
  else { fail++; console.log('FAIL ' + name + '\n  got  = ' + G + '\n  want = ' + W); }
};

// 진하기 값은 이름 붙은 상수 한 곳에만 있어야 한다
const decl = src.match(/var CAL_CHIP_LIGHTEN = ([0-9.]+);/);
t('★ 진하기 상수가 한 곳에 정의돼 있다', !!decl, true);

if(decl){
  const val = parseFloat(decl[1]);
  // 값 자체는 못 박지 않는다 — 다만 «연하게 하는 쪽» 이라는 뜻은 지킨다
  t('0 과 1 사이의 비율이다', val > 0 && val < 1, true);
  t('★ 예전(0.22)보다 연하다', val > 0.22, true);
}

// 두 call site 가 모두 상수를 쓴다 — 한쪽에만 숫자를 도로 적어 넣으면 잡는다
const uses = (src.match(/sgLighten\([^)]*CAL_CHIP_LIGHTEN\)/g) || []).length;
t('★ 월·주/일 두 곳 모두 같은 상수를 쓴다', uses, 2);

// sgLighten 을 부르면서 숫자를 직접 적은 곳이 남아 있으면 안 된다
t('★ 진하기를 숫자로 직접 적은 곳이 없다',
  /sgLighten\([^)]*,\s*0\.\d+\s*\)/.test(src), false);

console.log('\n  === ' + pass + ' 통과 / ' + fail + ' 실패 ===');
process.exit(fail ? 1 : 0);
