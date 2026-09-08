/* 달력을 구글 캘린더와 «똑같이» (2026-08-25 대표 지시)
   "법인대시보드·이음센터를 구글캘린더의 위치·크기·색·디자인·글자크기·시간·날짜
    그리고 담당자마다 각자 넣었던 색깔을 완벽하게 일치. 개인별로 보는 구글화면색처럼."

   ★ 뿌리 — 구글 색이 앱에 «아예 안 들어오고» 있었다.
     colorId 를 무시하고, 제목에 직원 이름이 있으면 앱 색표(staffColorMap)로 칠했다.
     그래서 구글에서 각자 고른 색과 앱 화면이 «영원히» 달랐다. 화면만 손봐서는 못 맞춘다.

   ★ 색값을 코드에 «적지 않는다» — 구글이 준 값을 그대로 쓴다.
     적어 두면 ①팔레트 규율(승인 27색)이 깨지고 ②구글에서 색을 바꿔도 안 따라간다. */
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const RAW = fs.readFileSync(path.join(ROOT, 'pu-erp.html'), 'utf8');
const bare = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
const S = bare(RAW);

function fnBody(name) {
  const a = S.indexOf('function ' + name + '(');
  assert.ok(a > 0, name + ' 이 없다');
  let d = 0;
  for (let k = S.indexOf('{', a); k < S.length; k++) {
    if (S[k] === '{') d++;
    else if (S[k] === '}') { d--; if (!d) return S.slice(a, k + 1); }
  }
  return S.slice(a, a + 2000);
}

/* ── 구글 색을 받아 오나 ── */

test('구글 색표를 받아 온다', () => {
  const fn = fnBody('gcalLoadColors');
  assert.match(fn, /calendar\/v3\/colors/, '색표를 안 받아 온다');
  assert.match(fn, /\.event\b|\['event'\]|d\.event/, '이벤트 색을 안 읽는다');
  assert.match(fn, /background/, '바탕색을 안 읽는다');
});

test('색표를 «한 번만» 받는다 — 달을 넘길 때마다 다시 받지 않는다', () => {
  const fn = fnBody('gcalLoadColors');
  assert.match(fn, /if\(window\._gcalColors\) return Promise\.resolve/, '매번 다시 받는다');
});

test('색표가 안 와도 일정은 뜬다', () => {
  /* 색 하나 때문에 달력이 비면 그게 더 큰 사고다. */
  const fn = fnBody('gcalLoadColors');
  assert.match(fn, /\.catch\(/, '색표 실패가 일정까지 죽인다');
});

test('★ 색표를 먼저 채운 «뒤» 일정을 받는다', () => {
  /* 순서가 뒤바뀌면 첫 그림에 색이 빠지고, 사람은 「색이 안 먹는다」고 본다. */
  /* ⚠ 'gcalLoadColors()' 는 «정의» 줄에도 들어 있다(function gcalLoadColors(){).
     그래서 부르는 자리를 볼 때는 앞에 줄바꿈과 들여쓰기를 함께 본다. */
  const i = S.indexOf('\n    gcalLoadColors()');
  const j = S.indexOf('return fetchT(url, null, 20000)', i);
  assert.ok(i > 0, '색표를 부르지 않는다');
  assert.ok(j > i && j - i < 300, '색표보다 일정을 먼저 받는다');
});

/* ── 담당자 색: 구글이 이긴다 ── */

test('★ 구글에서 고른 색이 앱 색표를 «이긴다»', () => {
  /* 이게 지시의 핵심이다. 앱 색표로 덮으면 구글 화면과 영원히 다르다. */
  /* 2026-08-26 — 만든이로 사람을 찾는 길이 생겨 조건이 하나 늘었다.
     지킬 규칙은 그대로다: «구글 색이 있으면 앱 색표로 덮지 않는다». */
  assert.match(S, /if\(!gColor && !_mailSid\) evColor = staffColorMap/,
    '앱 색표가 구글 색을 덮는다');
  /* 담당자(matchedSid)도 만든이가 이긴다 — 이것이 색뿐 아니라 «거르기» 를 정한다.
     제목의 이름은 「권형하에게 보고」처럼 «남의 이름» 일 수 있다. */
  assert.match(S, /if\(!_mailSid\) matchedSid = u\.sid;/,
    '제목 이름이 만든이를 덮는다 — 남의 이름으로 담당자가 바뀐다');
});

test('★ 만든이 이메일로 담당자를 가른다 — 제목에 이름이 없어도', () => {
  /* ★ 2026-08-26 실제 구글 자료로 확인: 8월 일정 111건 «전부» 만든이 이메일이 있고
     열 가지(직원 열 명)다. 그런데 제목에 이름이 있는 것은 «23건뿐» 이라,
     제목만 보던 옛 코드에서는 88건(79%)이 «같은 파랑» 이었다.
     그것이 「담당자마다 각자 넣었던 색」이 안 보인 진짜 까닭이다. */
  assert.match(S, /var _mail = \(ev\.creator && ev\.creator\.email\)/, '만든이를 안 읽는다');
  assert.match(S, /\(ev\.organizer && ev\.organizer\.email\)/, '만든이가 없을 때 주최자를 안 본다');
  assert.match(S, /var _mailSid = gcalSidByMail\(_mail\)/, '만든이로 직원을 안 찾는다');
  assert.match(S, /_mailSid \? \(staffColorMap\[_mailSid\] \|\| ''\) : ''/, '찾은 직원 색을 안 쓴다');
});

test('사람이 «이어 준» 표를 명부보다 먼저 본다', () => {
  /* 명부에는 gmail 이 없다(loginId 는 sid@… 꼴) — 이 표가 없으면 이름을 맞출 길이 없다. */
  /* 중괄호로 정확히 자른다 — 글자 거리로 자르면 다음 블록까지 넘어간다(실제로 당했다) */
  const fn = fnBody('gcalSidByMail');
  const mp = fn.indexOf('gcalMailMap()');
  const roster = fn.indexOf('getActiveUsers');
  assert.ok(mp > 0, '이어 준 표를 안 본다');
  assert.ok(roster < 0 || mp < roster, '명부를 먼저 본다 — 사람이 이어 준 것이 더 확실하다');
});

test('★ 이어 준 뒤에도 «늘 같은 색» 이다 — 색으로 사람을 알아본다', () => {
  const fn = fnBody('gcalMailColor');

  /* 중복을 뺀 «고유색» 으로 나눈다 — STAFF_COLORS 11칸에 고유색은 6가지뿐이라
     그대로 나누면 한 색에 몰린다(실제로 111건 중 69건이 한 색이었다). */
  assert.match(fn, /uniq\.indexOf\(STAFF_COLORS\[u\]\) < 0/, '중복 색을 안 걸러 낸다');
  assert.match(fn, /uniq\[h % uniq\.length\]/, '고유색으로 나누지 않는다');
  assert.strictEqual(/#[0-9a-fA-F]{6}/.test(fn), false, '새 색을 만들었다');
});

test('아직 안 이은 계정이 몇인지 «단추에 적는다»', () => {
  /* 안 적으면 이을 것이 남았는지 아무도 모른다 — 있는 기능이 없는 기능이 된다. */
  assert.match(S, /'👤 계정 잇기'\+\(left\?\(' '\+left\+'명 남음'\)/, '남은 수를 안 적는다');
});

test('이어 준 표를 다른 PC 와도 나눠 쓴다', () => {
  assert.match(S, /'gcal_mail_sid',/, '동기화 목록에 없다 — 이은 것이 이 PC 에만 남는다');
});

test('이어 주면 달력을 «다시 칠한다»', () => {
  /* 저장만 하고 화면이 그대로면 「안 됐나」 하고 또 고르게 된다. */
  const a = S.indexOf('function put(mail, sid)');
  const fn = S.slice(a, a + 420);
  assert.match(fn, /dbSet\(GCAL_MAIL_KEY/, '저장하지 않는다');
  assert.match(fn, /setGcalRfk\(gcalRfk \+ 1\)/, '달력을 다시 읽지 않는다');
});

test('구글에 색을 «안 넣은» 일정은 앱 색표로 칠한다', () => {
  /* 구글에서 색을 고르지 않은 사람의 일정까지 회색이 되면 안 된다. */
  assert.match(S, /var gColor = \(window\._gcalColors && ev\.colorId\)/, '구글 색을 안 읽는다');
  assert.match(S, /var evColor = gColor \|\|/, '되돌아갈 색이 없다');
});

test('★ 색값을 코드에 적지 않았다 — 팔레트 규율을 지킨다', () => {
  /* 구글 기본색은 24가지다. 그것을 파일에 적으면 승인 27색 규율이 깨진다.
     구글이 준 값을 «그대로» 쓰는 것이 유일한 길이다. */
  const fn = fnBody('gcalLoadColors');
  assert.strictEqual(/#[0-9a-fA-F]{6}/.test(fn), false, '색값을 코드에 적었다');
});

/* ── 모양: 구글과 같게 ── */

test('구글 색은 «그대로» 쓴다 — 연하게 바꾸지 않는다', () => {
  /* 2026-08-26 재조정 — 담당자 색이 «이미 파스텔» 이 된 뒤로,
     밝은 색에 45% 를 더 밝히면 흰색이 되어 칸 바탕과 구별이 안 된다
     (노랑 → 밝기 0.91 · 회색 → 0.94). 그래서 «이미 밝으면 그대로» 갈래가 하나 늘었다.
     ★ 지킬 규칙은 그대로다: 구글 색(gcolor)은 «절대» 흐리지 않는다. */
  assert.match(S, /var chipBg = ev\.gcolor \? ev\.gcolor/, '월 보기가 구글 색을 흐린다');
  assert.match(S, /var wdChipBg = ev\.gcolor \? ev\.gcolor/, '주·일 보기가 구글 색을 흐린다');
  /* 이미 밝은 색도 안 흐린다 — 잣대는 글자색 고를 때와 «같은 것» 을 쓴다 */
  const nb = (S.match(/calTextOn\(\w+\) === '#1e293b' \? \w+/g) || []).length;
  assert.strictEqual(nb, 2, '두 보기 모두 «이미 밝으면 그대로» 를 안 쓴다 (지금 ' + nb + '곳)');
});

test('★ 글자색을 바탕 밝기에 맞춰 고른다', () => {
  /* 늘 흰 글자면 구글에서 «연한» 색을 고른 사람의 일정은 글씨가 묻힌다. */
  const ctx = { String, parseInt };
  vm.createContext(ctx);
  vm.runInContext(fnBody('calTextOn') + '\nthis.f = calTextOn;', ctx);
  const f = ctx.f;
  assert.strictEqual(f('#ffffff'), '#1e293b', '흰 바탕에 흰 글자');
  assert.strictEqual(f('#fbbf24'), '#1e293b', '연한 노랑에 흰 글자');
  assert.strictEqual(f('#1e40af'), '#ffffff', '진한 파랑에 짙은 글자');
  assert.strictEqual(f('#000000'), '#ffffff', '검은 바탕에 짙은 글자');
  assert.strictEqual(f(''), '#ffffff', '색이 없을 때 안 터진다');
  assert.strictEqual(f('#abc'), f('#aabbcc'), '3자리 색도 같게 본다');
  /* ★ 눈이 느끼는 밝기로 재야 한다 — 초록은 밝게, 파랑은 어둡게 느껴진다.
     세 값을 그냥 평균 내면 이 둘이 «거꾸로» 나온다:
       연초록 #4ade80 → 평균 0.55(흰 글자) · 눈 0.66(짙은 글자) ← 짙은 글자가 맞다
       연파랑 #60a5fa → 평균 0.67(짙은 글자) · 눈 0.60(흰 글자)  ← 흰 글자가 맞다
     구글 색에는 초록·파랑이 흔하므로 이 구별이 실제로 눈에 보인다. */
  assert.strictEqual(f('#4ade80'), '#1e293b', '연한 초록에 흰 글자 — 눈 밝기로 안 재고 있다');
  assert.strictEqual(f('#60a5fa'), '#ffffff', '연파랑에 짙은 글자 — 눈 밝기로 안 재고 있다');
});

test('글자색에 새 색을 만들지 않았다', () => {
  const fn = fnBody('calTextOn');
  (fn.match(/#[0-9a-fA-F]{6}/g) || []).forEach(function (c) {
    assert.ok(['#1e293b', '#ffffff'].indexOf(c.toLowerCase()) >= 0, '새 색이 들어왔다: ' + c);
  });
});

test('두 보기가 같은 글자색 규칙을 쓴다', () => {
  /* 한 보기만 고치면 월↔주 바꿀 때 색이 튄다. */
  assert.match(S, /color: calTextOn\(chipBg\)/, '월 보기가 안 쓴다');
  assert.match(S, /color:calTextOn\(wdChipBg\)/, '주·일 보기가 안 쓴다');
});

test('★ 시각을 구글처럼 «1030» 으로 붙여 쓴다', () => {
  /* 구글은 콜론을 안 쓴다. 콜론을 빼면 좁은 칸에서 제목이 두 글자쯤 더 보인다. */
  const n = (S.match(/ev\.time\.slice\(0,5\)\.replace\(':',''\)/g) || []).length;
  assert.strictEqual(n, 2, '두 보기 모두 바뀌지 않았다 (지금 ' + n + '곳)');
  assert.strictEqual(/ev\.time\.slice\(0,5\)\+' '/.test(S), false, '아직 콜론을 쓰는 곳이 남았다');
});

test('시각을 흐리게 하지 않는다 — 구글은 제목과 같은 굵기다', () => {
  const n = (S.match(/opacity:0\.75, marginRight:'2px'/g) || []).length;
  assert.strictEqual(n, 0, '아직 흐린 시각이 남아 있다 (' + n + '곳)');
});

test('아이콘을 붙이지 않는다 — 구글 화면에는 없다', () => {
  /* ⚠ 같은 아이콘이 «메뉴 이름»(🗓 캘린더)에도 쓰인다 — 그것은 지울 것이 아니다.
     일정을 만드는 자리(type:'gcal' 를 돌려주는 곳)만 본다. */
  const icon = String.fromCodePoint(0x1F5D3);
  const i2 = S.indexOf("type:'gcal',");
  assert.ok(i2 > 0, '구글 일정 만드는 자리를 못 찾았다');
  const mk = S.slice(i2, i2 + 400);
  assert.strictEqual(mk.indexOf("label:'" + icon) >= 0, false, '아직 일정 이름에 아이콘을 붙인다');
  assert.match(mk, /label: title, color: evColor, gcolor: gColor/, '색을 화면까지 안 넘긴다');
});

test('월 보기 칩 글자 크기가 «한 곳» 에서 정해진다', () => {
  /* ⚠ 예전에는 「10px / 10.5px / 11px」을 글자 그대로 박아 두었다.
     2026-08-25 대표가 폰 화면을 구글과 나란히 놓고 「글자가 너무 크다」고 했고,
     재어 보니 우리가 1.235배였다(칩 앞 네 자리 숫자 폭 57 : 46 기기픽셀).
     ★ 그래서 지킬 것은 «몇 px» 이 아니라 —
       ① 폰 크기는 한 곳(CAL_FS·calPx)에서 정한다  ② PC 는 11px 그대로다. */
  assert.match(S, /fontSize: IS_MOBILE \? calPx\(10\) : '11px'/,
    '★ 칩 글자가 배율(calPx)을 안 씁니다 — 그 글자만 따로 놉니다.');
  assert.match(S, /var CAL_FS = IS_MOBILE \?/, '★ 폰 글자 배율이 한 곳에 없습니다.');
});

/* ── 두 화면이 같은 달력을 쓰는가 ── */

test('법인 대시보드와 이음센터가 «같은» 달력을 쓴다', () => {
  /* 따로 그리면 한쪽만 구글처럼 되어 또 어긋난다. */
  assert.match(RAW, /이음센터 모드: 이음센터 화면\(dash\/ieum\)에서 캘린더만 재사용/,
    '두 화면이 달력을 따로 그린다 — 한 곳을 고쳐도 다른 곳은 그대로다');
});

/* ── 위치·크기 (2026-08-25 이어서) ────────────────────────────────
   캡처를 나란히 놓고 구글과 다른 곳을 다섯 찾아 맞췄다. */

test('★ 한 칸에 «넷» 을 보인다 — 구글과 같다', () => {
  /* 셋이면 「7개 더보기」가 너무 자주 떠서 하루를 보려면 매번 눌러야 했다. */
  assert.match(S, /var MAX_SHOW = 4;/, '한 칸에 보이는 개수가 구글과 다르다');
  assert.strictEqual(/MAX_SHOW = calMonthFit ? 4 : 3/.test(S), false, '옛 셈이 남아 있다');
});

test('더보기 글귀에 «＋» 를 붙이지 않는다 — 구글 글귀 그대로', () => {
  assert.match(S, /hiddenCount\+'개 더보기'/, '더보기 글귀가 구글과 다르다');
  assert.strictEqual(/'\+'\+hiddenCount\+'개 더보기'/.test(S), false, '아직 ＋ 를 붙인다');
});

test('★ 요일 머리를 일곱 칸 «같은 색» 으로 쓴다', () => {
  /* 구글은 일요일을 빨강으로 하지 않는다. 우리가 넣었던 것이다.
     ⚠ 우리말 관습과 다르므로, 되살리라면 요일 머리와 날짜 숫자를 «함께» 되돌린다. */
  const i = S.indexOf("['일','월','화','수','목','금','토'].map(function(d, i){");
  assert.ok(i > 0, '요일 머리를 못 찾았다');
  const hd = S.slice(i, i + 400);
  assert.strictEqual(/i===0\?'#dc2626'/.test(hd), false, '아직 일요일만 빨갛다');
  assert.match(hd, /color:'#64748b'/, '일곱 칸이 같은 색이 아니다');
  /* 구글 요일 머리는 «가볍다»(500). 굵게 하면 날짜보다 요일이 먼저 눈에 든다. */
  assert.match(hd, /fontWeight:500/, '요일 머리가 구글보다 굵다');
  /* ⚠ 높이를 «글자 그대로»(8px 4px) 박아 두었다가, 폰에서 그 줄을 얇게 만든 것만으로
     깨졌다. 구글 요일 줄은 칸 폭의 0.30 인데 8px 여백이면 우리는 0.63 — 두 배다.
     ★ 여기서 지킬 것은 «몇 px» 이 아니라 ① 여백이 있고 ② 폰에서는 더 얇다 이다. */
  const pad = hd.match(/padding: ?[^,]*/);
  assert.ok(pad, '요일 머리에 여백 규칙이 없다');
  assert.match(pad[0], /px/, '요일 머리 높이 규칙이 사라졌다');
});

test('★ 날짜 숫자를 요일로 가르지 않는다 — 오늘만 파란 동그라미', () => {
  const i = S.indexOf("className:'cal-day-num'");
  assert.ok(i > 0, '날짜 숫자를 못 찾았다');
  const num = S.slice(i, i + 700);
  assert.match(num, /background: isToday\?'#2563eb':'transparent'/, '오늘 표시가 사라졌다');
  assert.strictEqual(/isRed\?'#dc2626'/.test(num), false, '아직 일요일·공휴일 숫자를 빨갛게 한다');
  assert.strictEqual(/weekday===6\?'#1e40af'/.test(num), false, '아직 토요일 숫자를 파랗게 한다');
  assert.match(num, /isOtherMonth\?'#94a3b8'/, '지난달·다음달을 흐리게 하지 않는다');
});

test('★ 공휴일을 «칩» 으로 보여 준다 — 칸 오른쪽 위 글씨가 아니다', () => {
  /* 구글에는 그 자리가 없다. 캡처에서 「광복절」은 붉은 칩이었다. */
  assert.match(S, /isHoliday && h\('div', \{ key:'hol'/, '공휴일이 칩이 아니다');
  assert.strictEqual(/textAlign:'right', marginTop:'4px' \}\}, holidayName\)/.test(S), false,
    '아직 오른쪽 위 글씨로 그린다');
});

test('공휴일이 일정을 밀어내지 않는다', () => {
  /* 공휴일을 개수(MAX_SHOW)에 넣으면 일정 하나가 접혀 안 보인다. */
  const i = S.indexOf("key:'hol'");
  const j = S.indexOf('dayEvents.slice(0, MAX_SHOW)', i);
  assert.ok(j > i, '공휴일 칩이 일정 목록보다 뒤에 있다');
  const between = S.slice(i, j);
  assert.strictEqual(/MAX_SHOW/.test(between), false, '공휴일이 일정 개수를 깎는다');
});

test('공휴일 칩에 새 색을 만들지 않았다', () => {
  const i = S.indexOf("key:'hol'");
  const chip = S.slice(i, i + 900);
  (chip.match(/#[0-9a-fA-F]{6}/g) || []).forEach(function (c) {
    assert.ok(['#fecaca', '#991b1b'].indexOf(c.toLowerCase()) >= 0, '새 색이 들어왔다: ' + c);
  });
});

test('★ 이메일을 «그대로» 열쇠로 쓰지 않는다 — 점을 못 쓴다', () => {
  /* ★ 실시간DB 키에는 점(.)·#·$·[·]·/ 를 «쓸 수 없다». 이메일에는 점이 있다 —
     그대로 쓰면 서버가 400 으로 거절하고 «이어 준 것이 이 PC 에만» 남는다.
     ⚠ 화면에서는 저장된 것처럼 보인다 — 검사 없이는 아무도 모른다.
     ⚠ enter.html 의 sgEmailKey 와 «같은 규칙» 이어야 한다 — 갈리면 한쪽이 못 찾는다. */
  const fn = fnBody('gcalMailKey');
  assert.ok(/replace\(\/\[\.#\$/.test(fn), '점·#·$ 를 안 바꾼다 — 서버가 거절한다');
  assert.match(fn, /toLowerCase\(\)/, '대소문자를 안 맞춘다');
  /* 실제로 돌려 본다 — 글자만 보면 규칙이 뒤바뀌어도 통과한다 */
  const ctx = { String };
  vm.createContext(ctx);
  vm.runInContext(fn + '\nthis.f = gcalMailKey;', ctx);
  assert.strictEqual(ctx.f('cust19@Gmail.com').indexOf('.') < 0, true, '점이 남아 있다');
  assert.strictEqual(ctx.f('a.b@c.d'), 'a,b@c,d', '점을 쉼표로 안 바꾼다');
  assert.strictEqual(ctx.f('X@Y.Z'), ctx.f('x@y.z'), '대소문자에 따라 갈린다');
});
/* ── 담당자 색을 구글 파스텔로 (2026-08-26 대표 지적: "색이 더 혼란스럽다") ── */

test('★ 구글 색표를 담당자 색으로 쓴다 — 코드에 색을 적지 않는다', () => {
  /* 두 화면을 나란히 놓고 보니 구글은 «연한 파스텔», 앱은 «진한 원색» 이었다.
     같은 칸에 진한 색이 여럿 쌓이니 눈이 아프고 무엇이 중요한지 안 보인다.
     ⚠ 색값을 코드에 적으면 ①승인 27색 팔레트 규율이 깨지고 ②구글이 바꿔도 안 따라간다. */
  const fn = fnBody('gcalPalette');
  assert.match(fn, /window\._gcalColors/, '구글 색표를 안 본다');
  assert.strictEqual(/#[0-9a-fA-F]{6}/.test(fn), false, '색값을 코드에 적었다');
  assert.match(S, /var STAFF_COLORS = \(typeof gcalPalette === 'function' && gcalPalette\(\)\)/,
    '담당자 색이 구글 색표를 안 쓴다');
});

test('★ 색 차례가 «늘 같다» — 사람 색이 흔들리면 색으로 못 알아본다', () => {
  /* 색표는 객체로 온다. 키 차례가 브라우저마다 다를 수 있으니 번호로 세운다. */
  const fn = fnBody('gcalPalette');
  assert.match(fn, /sort\(function\(a,b\)\{ return \(parseInt\(a,10\)/, '번호 순으로 안 세운다');
  const ctx = { Object, parseInt, window: { _gcalColors: { 11: '#c', 2: '#b', 1: '#a' } } };
  vm.createContext(ctx);
  vm.runInContext(fn + '\nthis.f = gcalPalette;', ctx);
  /* ⚠ vm 안에서 만든 배열은 «다른 realm» 이라 deepStrictEqual 이 늘 실패한다 — 값으로 견준다 */
  assert.strictEqual(Array.from(ctx.f()).join(','), '#a,#b,#c', '11 이 2 보다 앞에 온다 — 글자순으로 세웠다');
});

test('색표가 아직 안 왔으면 «되돌아갈 자리» 를 쓴다', () => {
  /* 첫 그림에서 색이 통째로 빠지면 달력이 회색 덩어리가 된다. */
  assert.match(S, /\|\| STAFF_COLORS_FALLBACK/, '되돌아갈 자리가 없다');
  const ctx2 = { Object, parseInt, window: {} };
  vm.createContext(ctx2);
  vm.runInContext(fnBody('gcalPalette') + '\nthis.f = gcalPalette;', ctx2);
  assert.strictEqual(ctx2.f(), null, '색표가 없는데 빈 목록을 돌려준다');
  /* ★ 색표가 «비어서» 와도 빈 목록을 돌려주면 안 된다 —
     빈 배열은 참(truthy)이라 되돌아갈 자리를 «건너뛰고» 달력이 회색 덩어리가 된다. */
  const ctx3 = { Object, parseInt, window: { _gcalColors: {} } };
  vm.createContext(ctx3);
  vm.runInContext(fnBody('gcalPalette') + '\nthis.f = gcalPalette;', ctx3);
  assert.strictEqual(ctx3.f(), null, '빈 색표에 빈 목록을 돌려준다 — 색이 통째로 사라진다');

  /* 같은 색이 두 번 오면 두 사람이 같은 색이 된다 — 하나만 남긴다 */
  const ctx4 = { Object, parseInt, window: { _gcalColors: { 1: '#a', 2: '#a', 3: '#b' } } };
  vm.createContext(ctx4);
  vm.runInContext(fnBody('gcalPalette') + '\nthis.f = gcalPalette;', ctx4);
  assert.strictEqual(Array.from(ctx4.f()).join(','), '#a,#b', '같은 색을 두 번 담는다');
});

test('★ 종일 일정에 「0000」을 붙이지 않는다', () => {
  /* 시각 없이 만든 앱 일정이 00:00 으로 담겨, 칩마다 0000 이 붙었다
     (대표 캡처: 「0000 0930 맥스텍…」 — 제목에 든 진짜 시각 앞에 겹쳤다).
     구글은 종일 일정에 시각을 안 보여 준다. */
  const n = (S.match(/ev\.time\.slice\(0,5\) !== '00:00'/g) || []).length;
  assert.strictEqual(n, 2, '두 보기 모두 고치지 않았다 (지금 ' + n + '곳)');
});
/* ── 이음센터 칩 (2026-08-26 대표 지적: "이음센터도 색을 좀더 연하게") ── */

test('★ 이음센터 근무도 담당자 색을 쓴다 — 종류별 진한 파랑이 아니다', () => {
  /* 담당자 색만 파스텔이 되고 이 칩만 진하게 남아 «더» 튀었다.
     게다가 열 사람이 다 같은 파랑이라 누구 근무인지 색으로 구별이 안 됐다.
     종류는 앞의 🏛 아이콘이 말한다 — 색이 아니라 아이콘이 뜻을 지킨다. */
  assert.match(S, /r\.type==='eum-work' \? \(staffColorMap\[r\.sid\] \|\| '#94a3b8'\)/,
    '이음센터가 아직 종류별 고정색을 쓴다');
});

test('연차·병가는 색이 «곧 뜻» 이라 그대로 둔다', () => {
  /* 초록=휴가·빨강=병가. 여기까지 사람 색으로 바꾸면 «쉬는 날인지» 를 색으로 못 읽는다. */
  assert.match(S, /r\.type==='sick' \? '#dc2626'/, '병가 색이 사라졌다');
  assert.match(S, /r\.type==='trip' \? '#1e40af'/, '출장 색이 사라졌다');
});

test('★ 이미 밝은 색을 «더» 밝히지 않는다 — 흰색이 되어 칸과 구별이 안 된다', () => {
  /* 구글 파스텔에 45% 를 더 밝히면: 노랑 0.83→0.91 · 회색 0.88→0.94.
     실제로 재 보고 넣은 규칙이다. */
  const ctx = { String, parseInt };
  vm.createContext(ctx);
  vm.runInContext(fnBody('calTextOn') + '\nthis.t = calTextOn;', ctx);
  assert.strictEqual(ctx.t('#fbd75b'), '#1e293b', '구글 노랑을 «밝다» 고 안 본다 — 그러면 또 밝힌다');
  assert.strictEqual(ctx.t('#e1e1e1'), '#1e293b', '구글 회색을 «밝다» 고 안 본다');
  assert.strictEqual(ctx.t('#16a34a'), '#ffffff', '연차 초록을 «밝다» 고 본다 — 그러면 안 밝혀져 진한 채로 남는다');
});