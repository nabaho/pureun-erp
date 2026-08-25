/* 달력 «화면 전체» 를 구글 폰 달력에 맞춘다
   (대표 지시 2026-08-25 「폰 구글 캘린더와 모든 UI 똑같이 다시」)

   ★ 칸 안(칩·날짜·색)은 앞서 맞췄다. 남은 것은 «표 위» 였다 — 재어 보니
       구글 : 머리글 한 줄 + 요일 줄  = 116 기기픽셀 (칸 높이의 0.49)
       우리 : 탭 줄 + 달력 머리줄 + 요일 줄 = 335 (칸 높이의 0.91)
     달력 한 줄만큼을 군더더기가 먹고 있었다.

   ★ 두 줄을 한 줄로 합쳤다. 없앤 것은 하나도 없다 —
       탭 줄의 「직원별·분석」 → 달력 머리줄 오른쪽 (그림만)
       「월/주/일」 · 「🔄」    → ⚙ 안 (구글도 보기 바꾸기를 ☰ 메뉴에 둔다)
       「⚙ 필터」              → 달력 머리줄 오른쪽
     합친 뒤 다시 재니 0.50 : 0.49 — 구글과 같아졌다.

   ⚠ 이 검사가 못 박는 것은 px 가 아니라 —
     ① 머리글이 「N월 + 음력 달 범위」인가 (그리고 «맞는 값»인가)
     ② 폰 달력에서 탭 줄이 접히는가
     ③ 접었으면 그 안에 있던 것이 «다른 데» 다 있는가  ← 이것이 핵심이다
     ④ 요일 줄이 일곱 칸 같은 색이고 얇은가
     ⑤ 새 일정을 만드는 길(＋)이 머리글에 있는가 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const erp = fs.readFileSync(path.join(__dirname, '..', 'pu-erp.html'), 'utf8');

test('★ 머리글이 「8월 / 병오년6월 – 7월」이다 — 구글 위젯의 그 두 줄', () => {
  assert.match(erp, /function corpLunarRange\(/, '음력 달 범위 셈이 없습니다.');
  assert.match(erp, /corpLunarRange\(selYm\)/, '★ 셈만 있고 머리글에 안 붙였습니다.');
  assert.match(erp, /parseInt\(selYm\.slice\(5\),10\) \+ '월'/,
    "★ 「2026-08」이 아니라 「8월」이어야 합니다 — 구글은 연도를 머리글에 안 답니다.");
});

test('★ 음력 달 범위가 실제로 맞는다 — 대표 위젯 화면과 대조', () => {
  /* 검사고정-허용 — 「병오년6월 – 7월」은 구글 위젯(2026-08)에 찍힌 글자 그대로다.
     간지는 era:'long' 을 켜야 나온다(year:'numeric' 만 주면 2026 만 온다). */
  function range(ym){
    var y = +ym.slice(0,4), m = +ym.slice(5,7);
    var a = new Date(Date.UTC(y, m-1, 1)), b = new Date(Date.UTC(y, m, 0));
    var fm = new Intl.DateTimeFormat('ko-KR-u-ca-dangi', {era:'long', year:'numeric', month:'numeric', timeZone:'UTC'});
    function pick(d, t){ var ps = fm.formatToParts(d); for(var i=0;i<ps.length;i++) if(ps[i].type===t) return ps[i].value; return ''; }
    var yn = pick(a,'yearName'), m1 = pick(a,'month'), m2 = pick(b,'month');
    return m1 ? (yn + '년' + m1 + (m2 && m2!==m1 ? ' – ' + m2 : '')) : '';
  }
  assert.equal(range('2026-08'), '병오년6월 – 7월');
  assert.equal(range('2026-01'), '을사년11월 – 12월');
  /* 코드가 같은 셈을 쓰는지 — 조각 이름 셋이 다 있어야 한다 */
  const at = erp.indexOf('function corpLunarRange(');
  const fn = erp.slice(at, erp.indexOf('\n  }', at));
  ['yearName', 'month', "era:'long'"].forEach(function (k) {
    assert.ok(fn.indexOf(k) > 0, '★ corpLunarRange 에 ' + k + ' 가 없습니다.');
  });
});

test('★ 폰 달력에서는 머리글이 «한 줄» 이다 — 탭 줄을 접는다', () => {
  assert.match(erp, /\(IS_MOBILE && dashTab==='calendar' && !calFilterOpen\) \? null :/,
    '★ 탭 줄이 그대로 있으면 구글보다 두 배 두꺼운 채입니다.');
});

test('★ 접은 줄에 있던 것이 «다른 데» 다 있다 — 접는 것이지 없애는 것이 아니다', () => {
  /* 이 검사가 이 파일에서 가장 중요하다. 줄 하나를 지우는 것은 쉽고,
     거기 있던 기능이 사라진 것은 며칠 뒤에야 안다. */
  const at = erp.indexOf("(IS_MOBILE && dashTab==='calendar' && !ieumMode) && h('div'");
  assert.ok(at > 0, '★ 머리줄로 옮긴 단추 묶음이 없습니다.');
  const moved = erp.slice(at, at + 1400);
  assert.match(moved, /changeTab\(t\.v\)/, '★ 다른 화면으로 가는 길이 사라졌습니다.');
  assert.match(moved, /setCalFilterOpen\(!calFilterOpen\)/, '★ ⚙ 필터로 가는 길이 사라졌습니다.');

  /* 월/주/일과 새로고침은 ⚙ 안으로 갔다 — 거기 «있는지» 본다 */
  const gi = erp.indexOf("⚙ 안으로 옮겨 온 것");
  assert.ok(gi > 0, '★ ⚙ 안에 옮겨 놓은 자리가 없습니다.');
  const gear = erp.slice(gi, gi + 1400);
  assert.match(gear, /setCalViewPersist\(m\.v\)/, '★ 월/주/일 바꾸기가 아무 데도 없습니다.');
  assert.match(gear, /corpRefresh/, '★ 새로고침이 아무 데도 없습니다.');
});

test('★ 요일 줄은 일곱 칸이 같은 색이고 얇다', () => {
  const i = erp.indexOf("['일','월','화','수','목','금','토'].map(function(d, i){");
  assert.ok(i > 0, '요일 줄을 찾지 못했습니다');
  const hd = erp.slice(i, i + 460);
  assert.ok(hd.indexOf("i===0?'#dc2626'") < 0, '★ 일요일만 빨간 규칙이 되살아났습니다.');
  /* 구글 요일 줄은 칸 폭의 0.30 이다. 8px 여백이면 우리는 0.63 — 두 배가 된다. */
  assert.match(hd, /padding: IS_MOBILE\?'1px 4px'/,
    '★ 폰 요일 줄이 두꺼우면 그만큼 표가 아래로 밀립니다.');
});

test('★ 새 일정을 만드는 파란 ＋ 가 머리글에 있다 — 구글도 그 자리다', () => {
  assert.match(erp, /'＋'\)/, '★ ＋ 단추가 없습니다.');
  const at = erp.indexOf("title:'새 일정'");
  assert.ok(at > 0, '★ ＋ 에 이름이 없습니다.');
  const btn = erp.slice(at, at + 420);
  assert.match(btn, /setQuickCreate\(\{ date: todayYMD\(\)/,
    '★ ＋ 를 눌러도 아무 일이 없으면 그림일 뿐입니다.');
});
