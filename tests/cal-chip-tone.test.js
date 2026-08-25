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
  /* ⚠ 진하기 «방향» 을 못 박아 두었다가 깨졌다 —
     2026-08-15 「원색이라 눈이 아프다」 → 0.22에서 0.45로 연하게
     2026-08-25 「구글과 같은 담당자 색 완벽하게 일치」 → 0 으로 되돌림
     두 지시가 부딪히는 것처럼 보이지만 아니다. 눈이 아팠던 까닭은 «진해서» 가
     아니라 열한 자리에 다섯 색뿐이라 같은 색이 겹겹이 깔려서였다.
     ★ 그래서 여기서 지킬 것은 진하기의 «방향» 이 아니라 —
       ① 값이 비율이다  ② 두 화면이 같은 값을 쓴다  ③ 글씨가 읽힌다. */
  t('0 과 1 사이의 비율이다', val >= 0 && val < 1, true);
  /* 연하게 칠할수록 흰 글씨가 지워진다 — 연하게 칠했다면 글씨색을 골라 주어야 한다 */
  t('★ 연하게 칠했다면 글씨색을 골라 준다',
    val < 0.15 || /function calTextOn\(/.test(src), true);
}
// 흰 글씨를 못 박아 둔 칩이 남아 있으면 안 된다 — 연한 바탕에서 글자가 사라진다
t('★ 칩 글씨색은 바탕을 보고 고른다',
  (src.match(/calTextOn\(/g) || []).length >= 3, true);

// 두 call site 가 모두 상수를 쓴다 — 한쪽에만 숫자를 도로 적어 넣으면 잡는다
const uses = (src.match(/sgLighten\([^)]*CAL_CHIP_LIGHTEN\)/g) || []).length;
t('★ 월·주/일 두 곳 모두 같은 상수를 쓴다', uses, 2);

// sgLighten 을 부르면서 숫자를 직접 적은 곳이 남아 있으면 안 된다
t('★ 진하기를 숫자로 직접 적은 곳이 없다',
  /sgLighten\([^)]*,\s*0\.\d+\s*\)/.test(src), false);

console.log('\n  === ' + pass + ' 통과 / ' + fail + ' 실패 ===');
process.exit(fail ? 1 : 0);
