/* 업체관리 업태·종목 칸 — 폭 줄이기와 두 줄 자르기
   내용이 길어(예: '액상시유 및 기타 낙농제품 제조업') 칸이 한없이 넓어졌다.
   폭을 묶고 두 줄까지만 보이게 한다. 잘린 값은 셀 title 로 확인한다. */
const fs = require('fs'), path = require('path');
const R = path.join(__dirname, '..');
const pe = fs.readFileSync(process.argv[2] || path.join(R, 'pu-erp.html'), 'utf8');
const css = fs.readFileSync(path.join(R, 'css', 'pu-erp.css'), 'utf8').replace(/\r/g, '');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? ' — ' + extra : '')); }
}

/* ── 머리칸·내용칸 배선 (사무대행 탭 + 전체 탭, 각 1곳씩) ──
   ⚠ 2026-08-07 다시 겨눔. 머리칸이 thF() 공용 함수로 정리되면서 모양이 바뀌었다
   (예전: className 과 style 을 그 자리에 나란히 적었다 → 지금: thF 에 넘긴다).
   **기능은 그대로다** — 폭을 묶는 클래스도, 머리칸 안의 거르개도 살아 있다.
   그래서 「글자가 이렇게 생겼나」가 아니라 「클래스가 붙었나」로 본다.
   모양을 붙들면 정리할 때마다 배포가 막힌다(실제로 막혔다). */
ok('업태 머리 2곳에 클래스', (pe.match(/thF\('업태',[^)]*className:'co-biz-col'/g) || []).length === 2);
ok('종목 머리 2곳에 클래스', (pe.match(/thF\('종목',[^)]*className:'co-biz-cat'/g) || []).length === 2);
ok('옛 minWidth 지정이 남아 있지 않다',
   !/key:'(h4b|h4c|a6b|a6c)', style:\{ padding:0, minWidth/.test(pe));
ok('업태 내용칸 2곳', (pe.match(/className:'co-biz-col', title:co\.bizType/g) || []).length === 2);
ok('종목 내용칸 2곳', (pe.match(/className:'co-biz-cat', title:co\.bizCategory/g) || []).length === 2);
ok('★ 잘려도 전체 값을 title 로 볼 수 있다',
   /title:co\.bizType\|\|''/.test(pe) && /title:co\.bizCategory\|\|''/.test(pe));
/* 거르개는 드롭다운에서 깔때기 단추(다중선택)로 바뀌었다 — 사라진 것이 아니다.
   thF 의 셋째 인자가 거르개 열쇠이고, 그것이 있어야 FunnelBtn 이 그려진다. */
ok('업태·종목 머리칸에 거르개가 그대로 있다',
   /thF\('업태', *[^,]+, *'biztype'/.test(pe) && /thF\('종목', *[^,]+, *'bizcat'/.test(pe));
ok('★ 머리칸 거르개는 깔때기 단추로 그려진다',
   /filterKey && h\('span'[\s\S]{0,200}FunnelBtn/.test(pe));

/* ── CSS ── */
ok('업태 폭 92px',  /co-biz-col \{ max-width: 92px; \}/.test(css));
ok('종목 폭 132px', /co-biz-cat \{ max-width: 132px; \}/.test(css));
ok('★ 줄바꿈을 허용한다 (그래야 폭이 지켜진다)', /white-space: normal;/.test(css));
ok('★ 두 줄까지만 보인다 (15px × 2 = 30px)',
   /line-height: 15px;/.test(css) && /max-height: 30px;/.test(css));
ok('넘치는 세 번째 줄은 숨긴다', /overflow: hidden;/.test(css));
ok('긴 단어도 접는다', /word-break: break-word;/.test(css));
ok('위 정렬 — 한 줄·두 줄이 섞여도 흔들리지 않게', /vertical-align: top;/.test(css));

/* 폭을 줄인 것이 맞는지 — 종전 minWidth(80/90)보다 크더라도 max 로 상한이 생겼는지가 핵심 */
ok('★ 상한(max-width)이 생겼다 (종전엔 하한만 있어 한없이 늘어났다)',
   /co-biz-col \{ max-width:/.test(css) && /co-biz-cat \{ max-width:/.test(css));

console.log('\n  === ' + pass + ' 통과 / ' + fail + ' 실패 ===');
process.exit(fail ? 1 : 0);
