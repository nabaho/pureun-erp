/* 폰 달력 글자 크기 — 구글 폰 달력과 «같은 크기» 로
   (대표 지시 2026-08-25 「구글보다 글자가 너무크다 완전히 같게」)

   ★ 재는 법이 중요하다. 글자 «높이» 는 임계값에 따라 ±20% 씩 흔들려 못 믿는다.
     대신 칩 맨 앞 «네 자리 숫자» 의 가로 폭을 쟀다 — 잘리지도 않고 글꼴 차이도 적다.
       구글 위젯 : 「1100」 네 자 46 기기픽셀 → 한 자 11.5
       우리 달력 : 「1030」 네 자 57         → 한 자 14.2   (1.235배 컸다)
     그래서 폰 달력 글자를 0.81배로 줄였다. 다시 재니 한 자 11.4 — 구글 11.5.

   ★ 화면 배율도 이때 바로잡았다. 앞서 3.28(329px)로 잡았던 것이 틀렸다 —
     숫자 폭·칸 폭·글자 크기가 한꺼번에 맞아떨어지는 값은 2.625(411px)다.
       칸 폭 151 기기픽셀 ÷ 2.625 = 57.5css  ·  7칸 = 403 ≈ 411 − 여백  ✓
     이 배율에서 구글 칩 높이(칸 폭의 0.251)는 14.5css 다.

   ⚠ 줄높이는 글자와 «같이» 줄이지 않는다 — 구글 칩은 «작은 글자에 넉넉한 칸» 이다.
     같이 줄이면 칩이 납작해져 오히려 안 닮는다(실제로 0.207 까지 내려갔다).

   이 검사가 못 박는 것 —
     ① 글자 배율이 «한 곳» 에 있는가  ② 달력의 글자들이 모두 그것을 쓰는가
     ③ 줄높이를 같이 줄이지 않았는가  ④ 넓은 화면은 안 건드렸는가 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const erp = fs.readFileSync(path.join(__dirname, '..', 'pu-erp.html'), 'utf8');

test('★ 글자 배율이 «한 곳» 에 있다 — 흩어 놓으면 다시 어긋난다', () => {
  assert.match(erp, /var CAL_FS = IS_MOBILE \? [\d.]+ : 1;/,
    '★ 배율 상수가 없습니다 — 크기를 여러 곳에 적으면 칩·날짜·요일이 따로 놉니다.');
  assert.match(erp, /function calPx\(px\)/, 'calPx 가 없습니다.');
  const m = erp.match(/var CAL_FS = IS_MOBILE \? ([\d.]+)/);
  assert.ok(Number(m[1]) > 0.6 && Number(m[1]) < 1,
    '★ 배율이 ' + m[1] + ' 입니다 — 0.6~1 을 벗어나면 잰 값이 아니라 짐작입니다.');
});

test('★ 달력의 글자가 모두 그 한 곳을 쓴다 — 칩·날짜·음력·요일·머리글', () => {
  const n = (erp.match(/calPx\(/g) || []).length;
  assert.ok(n >= 8, '★ calPx 를 쓰는 곳이 ' + n + '곳뿐입니다 — 아직 숫자를 직접 적은 데가 있습니다.');
  /* 자리마다 하나씩 — 하나라도 빠지면 그 글자만 커 보인다 */
  [[ '머리글 달 이름', /fontSize: calPx\(16\)/ ],
   [ '머리글 음력 범위', /fontSize: calPx\(10\), color:'#94a3b8'/ ],
   [ '요일 줄', /fontSize: IS_MOBILE \? calPx\(11\)/ ],
   [ '날짜 숫자', /fontSize: IS_MOBILE \? calPx\(10\) : '12px'/ ],
   [ '음력 숫자', /fontSize: IS_MOBILE \? calPx\(9\)/ ],
   [ '일정 칩', /fontSize: IS_MOBILE \? calPx\(10\) : '11px', fontWeight: IS_MOBILE\?600:500/ ],
   [ '넘침 표시', /fontSize: calPx\(12\)/ ]
  ].forEach(function (p) {
    assert.match(erp, p[1], '★ ' + p[0] + ' 이 배율을 안 씁니다 — 그 글자만 커 보입니다.');
  });
});

test('★ 줄높이는 글자와 «같이» 줄이지 않는다 — 구글 칩은 작은 글자에 넉넉한 칸이다', () => {
  /* 같이 줄였다가 칩 높이가 칸 폭의 0.207 까지 내려갔다(구글 0.251). 납작해 보였다. */
  assert.match(erp, /lineHeight: IS_MOBILE \? '14\.5px' : '16px'/,
    '★ 칩 줄높이가 구글 비율(칸 폭의 0.251 = 14.5css)과 다릅니다.');
  assert.doesNotMatch(erp, /lineHeight: IS_MOBILE \? calPx\(/,
    '★ 줄높이에 배율을 걸면 칩이 납작해집니다 — 글자만 줄입니다.');
});

test('★ 넓은 화면은 안 건드렸다 — 배율은 폰에서만 1 이 아니다', () => {
  assert.match(erp, /var CAL_FS = IS_MOBILE \?/, '★ PC 까지 줄이면 안 됩니다.');
  /* PC 값이 그대로 남아 있는지 — 칩 11px, 날짜 12px */
  assert.match(erp, /calPx\(10\) : '11px'/, 'PC 칩 크기가 바뀌었습니다.');
  assert.match(erp, /calPx\(10\) : '12px'/, 'PC 날짜 크기가 바뀌었습니다.');
});
