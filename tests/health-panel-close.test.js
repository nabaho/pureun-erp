/* 시스템 장애 알림 창 — 마지막 한 건을 처리하면 창도 함께 닫는다
   (2026-08-13 대표 지적) 「처리 완료」를 다 누르고 나면 «닫기» 만 덩그러니 남은
   빈 창이 그대로 떠 있었다. 제목은 「(3)」 인 채로 줄만 사라져,
   아직 뭔가 남은 것처럼 보였다.
   ★ 서버 청취기가 adminAlerts 를 뒤늦게 갱신하므로 그것을 세면 안 된다 —
     창에 «실제로 그려 넣은 줄 수» 를 따로 세야 한다. */
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'pu-health.js'), 'utf8').replace(/\r\n/g, '\n');

let pass = 0, fail = 0;
function t(name, got, want){
  const G = JSON.stringify(got), W = JSON.stringify(want);
  if(G === W){ pass++; console.log('  PASS ' + name + '  (' + G + ')'); }
  else { fail++; console.log('  FAIL ' + name + '\n    받음 ' + G + '\n    기대 ' + W); }
}

console.log('\n■ 빈 창을 남기지 않는다');
t('그려 넣은 줄 수를 따로 센다 (adminAlerts 를 세지 않는다)',
  /var shown = adminAlerts\.slice\(0, 30\);\n\s*var left = shown\.length;/.test(src), true);
t('그 목록으로 줄을 그린다', /shown\.forEach\(function \(item\) \{/.test(src), true);
t('adminAlerts 를 곧바로 돌며 그리지 않는다',
  /adminAlerts\.slice\(0, 30\)\.forEach/.test(src), false);
t('한 줄 처리할 때마다 하나씩 줄인다', /left -= 1;/.test(src), true);
t('다 처리하면 창을 닫는다', /if \(left <= 0\) \{ panel\.remove\(\); return; \}/.test(src), true);
t('남은 것이 있으면 제목의 숫자를 고쳐 준다',
  /titleText\.textContent = '시스템 장애 알림 \(' \+ left \+ '\)';/.test(src), true);

console.log('\n■ 제목 숫자');
t('제목 칸을 잡아 둔다', /var titleText = title\.querySelector\('span'\);/.test(src), true);
t('처음에는 전체 건수를 적는다',
  /titleText\.textContent = '시스템 장애 알림 \(' \+ adminAlerts\.length \+ '\)';/.test(src), true);
t('제목을 innerHTML 에 박아 넣지 않는다 — 박으면 숫자를 못 고친다',
  /innerHTML = '<span>시스템 장애 알림 \(' \+ adminAlerts\.length/.test(src), false);

console.log('\n■ 못 지웠을 때');
t('실패하면 단추를 다시 누를 수 있다 — 영영 잠긴 단추를 남기지 않는다',
  /\.catch\(function \(\) \{\n\s*\/\/[^\n]*\n\s*resolve\.disabled = false;/.test(src), true);
t('실패했다고 말해 준다', /resolve\.textContent = '처리 실패 — 다시';/.test(src), true);
t('실패한 줄을 지우지 않는다 — row.remove() 는 성공했을 때만',
  /\.then\(function \(\) \{\n\s*row\.remove\(\);/.test(src), true);

console.log('\n■ 닫기 단추는 그대로');
t('닫기로도 닫힌다', /title\.querySelector\('button'\)\.onclick = function \(\) \{ panel\.remove\(\); \};/.test(src), true);
t('바깥을 눌러도 닫힌다', /if \(event\.target === panel\) panel\.remove\(\);/.test(src), true);
t('처리할 게 없으면 그렇다고 적는다', /처리할 장애 알림이 없습니다/.test(src), true);

/* ══ 장애가 없으면 화면에 아무것도 없다 (대표 지시 2026-08-23, 두 번) ══
   ① 「장애알림 없는데 왜 빨간색 왼쪽아래 경고인가」
      → 관리자면 무조건 빨갛게 띄우고 있었다. 0건이어도 늘 빨갰다.
   ② 「장애알림 글자 왜 안없어지냐 피시와 폰에서 여전히 나온다」
      → ①을 고칠 때 «아직 안 세어 봤을 때»는 조용한 회색 단추를 남겼는데,
        세는 것은 «눌렀을 때»뿐이라 실제로는 회색 단추가 모든 화면에 늘 떠 있었다.
        색만 바꾸고 고쳤다고 여긴 것이다.

   지금 규칙 — 열린 건이 «1건 이상인 것을 아는 때»에만 뜬다.
     모름(null) → 안 뜬다 · 0건 → 안 뜬다 · 1건 이상 → 빨갛게 뜬다 */
console.log('\n■ 아는 것이 없으면 아무것도 안 띄운다');
t('★ 「아는 열린 건수」를 따로 둔다 (모를 때는 null)',
  /var knownOpen = null;/.test(src), true);
t('★ 모름도 0건과 똑같이 감춘다 — 이것이 «회색 단추가 안 없어지던» 까닭이다',
  /if \(!isAdminUser \|\| !\(knownOpen > 0\)\) \{ badge\.hidden = true; return; \}/.test(src), true);
/* 「!== 0」 으로 적으면 모름(null)일 때 또 뜬다 — 처음 문제로 되돌아간다.
   조용한 회색 단추(HEALTH_QUIET)도 함께 사라져야 한다. */
t('★ 조용한 회색 단추를 아예 두지 않는다', /HEALTH_QUIET/.test(src), false);
t('★ 열린 것이 있을 때만 빨갛게, 몇 건인지 함께 적는다',
  /HEALTH_ALARM[\s\S]{0,120}?'⚠ 장애 알림 ' \+ knownOpen/.test(src), true);
/* 따옴표로 감싼 «코드의 글자»만 본다 — 왜 없앴는지 적어 둔 주석까지 잡으면
   설명을 남길 수가 없다(설명은 남겨야 다음 사람이 되돌리지 않는다). */
t('★ 「장애 알림 없음」 을 화면에 적지 않는다', /'장애 알림 없음'/.test(src), false);
/* ⚠ 보임 판단이 두 곳에 있으면 서로 되돌린다 — monitorAdmin 이 hidden=false 로
   덮어써 0건인데도 다시 뜨는 식이다. 한 곳(paintAdminBadge)에서만 정한다. */
t('★ monitorAdmin 은 hidden 을 직접 만지지 않는다',
  /if \(!role\.isAdmin\) return;\s*\n\s*isAdminUser = true;\s*\n\s*ensureAdminBadge\(app\);/.test(src), true);

/* ══ 그래도 «지금 난 장애»는 곧바로 알려야 한다 ══
   평소에 안 세어 보는 대신, 장애를 기록하는 그 순간에는 «있다»는 것을 확실히 안다.
   그때 켜 주지 않으면 관리자가 서랍을 열어 보기 전까지 아무도 모른다. */
console.log('\n■ 장애가 나는 순간에는 켜진다');
t('★ 장애를 적을 때 열린 건수를 올린다',
  /knownOpen = \(knownOpen \|\| 0\) \+ 1;/.test(src), true);
t('★ 올린 뒤 곧바로 단추를 다시 그린다',
  /knownOpen = \(knownOpen \|\| 0\) \+ 1;\s*\n\s*paintAdminBadge\(/.test(src), true);

/* ══ 늘 떠 있는 단추를 치웠으니, 평소에 들여다볼 문은 있어야 한다 ══
   포털 [⚙ 설정] 안의 「시스템 장애 알림」 줄이 그 문이다. 밖에서 부를 수 있어야 한다. */
console.log('\n■ 평소에 들여다볼 문이 남아 있다');
t('★ 밖에서 부를 수 있게 열어 둔다', /openAdminPanel: showAdminPanel/.test(src), true);
t('★ 단추가 없어도 열린다 — 부르는 쪽이 app 을 안 줘도 스스로 찾는다',
  /app = app \|\| activeApp\(\);/.test(src), true);
t('★ 결과를 돌려준다 — 부르는 쪽이 「불러오는 중」 을 끝낼 수 있다',
  /return app\.database\(\)\.ref\('systemAlerts'\)\.once\('value'\)/.test(src), true);

console.log('\n■ 세어 본 뒤에는 색이 뜻을 갖는다');
t('★ 열어 보면 그 수를 기억한다', /knownOpen = adminAlerts\.length;/.test(src), true);
t('★ 한 건 처리할 때마다 단추도 함께 내린다',
  /knownOpen = left;\s*\n\s*paintAdminBadge\(/.test(src), true);
t('★ 못 읽었으면 «0» 이 아니라 «모름» 으로 되돌린다 — 0 으로 적으면 진짜 장애가 조용해진다',
  /knownOpen = null;\s*\n\s*window\.alert\('장애 알림을 불러오지 못했습니다/.test(src), true);

/* ══ 포털 [⚙ 설정] 안의 「시스템 장애 알림」 줄 ══
   화면 왼쪽 아래에 늘 떠 있던 단추를 치웠으니(위 참조), 평소에 들여다볼 문이
   어딘가엔 있어야 한다. 새 단추를 하나 더 만들면 치운 뜻이 없어지므로,
   이미 총괄관리자만 여는 [⚙ 설정] 서랍 안에 넣었다 — 화면을 차지하지 않는다. */
const portal = fs.readFileSync(path.join(__dirname, '..', 'enter.html'), 'utf8');
console.log('\n■ 포털 설정 서랍에 들여다볼 문이 있다');
t('★ 설정 서랍에 「시스템 장애 알림」 줄이 있다',
  /<b>시스템 장애 알림<\/b>/.test(portal), true);
t('★ 그 줄이 pu-health 의 문을 부른다',
  /window\.PUHealth\.openAdminPanel\(\)/.test(portal), true);
t('★ 늘 떠 있는 단추를 새로 만들지 않는다 — 서랍(cfgModal) 안에만 둔다',
  portal.indexOf('id="cfgHealth"') > portal.indexOf('id="cfgModal"'), true);
t('불러오는 동안 그렇다고 적는다 — 아무 말 없이 멈추면 「눌렀는데 왜 안 되나」가 된다',
  /_cfgHealth\.textContent = '불러오는 중…'/.test(portal), true);
t('서랍을 다시 열면 지난번 결과가 남아 있지 않다',
  /_h\.textContent = '열어보기';/.test(portal), true);

console.log('\n  === ' + pass + ' 통과 / ' + fail + ' 실패 ===\n');
if(fail) process.exit(1);
