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

/* ══ 단추 색은 «아는 것»만 말한다 (대표 제보 2026-08-23) ══
   「장애알림 없는데 왜 빨간색 왼쪽아래 경고인가」 —
   관리자면 무조건 빨간 단추를 띄우고 있었다. 처리할 알림이 0건이어도 늘 빨갰다.
   늘 켜져 있는 빨간불은 진짜 장애와 구별이 안 되어 아무것도 알려 주지 못한다. */
console.log('\n■ 늘 켜진 빨간불을 만들지 않는다');
t('★ 관리자라고 무조건 빨갛게 띄우지 않는다',
  /badge\.hidden = false;\s*\n\s*badge\.textContent = '장애 알림 확인';/.test(src), false);
t('★ 「아는 열린 건수」를 따로 둔다 (모를 때는 null)',
  /var knownOpen = null;/.test(src), true);
t('★ 모르면 조용한 회색으로 둔다',
  /if \(knownOpen === null\) \{[\s\S]{0,200}?HEALTH_QUIET/.test(src), true);
t('★ 열린 것이 «있을 때만» 빨갛게 켠다',
  /knownOpen > 0[\s\S]{0,200}?HEALTH_ALARM/.test(src), true);
t('빨갈 때는 몇 건인지 함께 적는다 — 「확인」만으로는 눌러 봐야 안다',
  /'⚠ 장애 알림 ' \+ knownOpen/.test(src), true);
t('0 건이면 그렇다고 적는다', /'장애 알림 없음'/.test(src), true);

console.log('\n■ 세어 본 뒤에는 색이 뜻을 갖는다');
t('★ 열어 보면 그 수를 기억한다', /knownOpen = adminAlerts\.length;/.test(src), true);
t('★ 한 건 처리할 때마다 단추도 함께 내린다',
  /knownOpen = left;\s*\n\s*paintAdminBadge\(/.test(src), true);
t('★ 못 읽었으면 «0» 이 아니라 «모름» 으로 되돌린다 — 0 으로 적으면 진짜 장애가 조용해진다',
  /knownOpen = null;\s*\n\s*window\.alert\('장애 알림을 불러오지 못했습니다/.test(src), true);

console.log('\n  === ' + pass + ' 통과 / ' + fail + ' 실패 ===\n');
if(fail) process.exit(1);
