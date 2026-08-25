/* 법인 대시보드 달력을 구글 달력 위젯에 맞춘다
   (대표 지시 2026-08-25 「구글과 같은 크기 그림 숫자 디자인 날짜크기 담당자 색 완벽하게 일치」)

   ★ 대표 폰 화면 두 장을 나란히 재어 보고 고친 것이다(기기픽셀 기준) —
       구글 위젯 : 칸 131.5 · 칩 130(꽉 참) · 칩높이 33 · 칩사이 2 · 한 칸에 넷 + 「•••」
       우리 달력 : 칸 151   · 칩이 안쪽으로 들어가고 · 칩높이 41 · 「+7」이 아래로 잘림
     칸 폭에 견준 비율로 옮기면 —
       칩높이  구글 0.251 → 우리 0.255
       칩폭    구글 0.989 → 우리 0.979
       칩사이  구글 0.0152 → 우리 0.0170
     화면 배율은 요일 글자(11px)를 재어 3.28 로 잡았다(1080px 기기 = 329px 화면).

   ★ 눈에 제일 먼저 띄던 것은 크기가 아니라 «색» 이었다.
     담당자 색 열한 자리에 다섯 가지뿐이라(#2563eb 가 세 번) 서로 다른 사람이 같은 색을
     달았고, 거기에 45% 연하게까지 칠해 온 화면이 한 가지 옅은 파랑이었다.

   ⚠ 이 검사는 px 를 안 박는다. 박는 것은 —
     ① 담당자 색이 서로 겹치지 않는가  ② 그 목록이 두 곳에서 같은가
     ③ 연하게 칠해 글씨를 지우지 않는가  ④ 연한 색에는 짙은 글씨를 주는가
     ⑤ 날짜 옆에 음력이 붙는가(그리고 «맞는 값»인가)
     ⑥ 넘침은 「•••」 인가  ⑦ 칩이 칸 폭을 꽉 채우는가 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const erp = fs.readFileSync(path.join(__dirname, '..', 'pu-erp.html'), 'utf8');

function staffPalettes() {
  return (erp.match(/var STAFF_COLORS = \[[^\]]*\]/g) || [])
    .map(s => (s.match(/#[0-9a-f]{6}/g) || []));
}

test('★ 담당자 색이 서로 겹치지 않는다 — 겹치면 색을 쓰는 뜻이 사라진다', () => {
  /* 예전 목록: 열한 자리에 다섯 색. #2563eb 가 세 번, #dc2626·#d97706·#16a34a 가 두 번씩.
     서로 다른 사람이 같은 색 칩을 달아, 달력만 보고는 누구 일인지 알 수 없었다. */
  const ps = staffPalettes();
  assert.ok(ps.length >= 1, 'STAFF_COLORS 를 찾지 못했습니다');
  ps.forEach(function (p, i) {
    const uniq = new Set(p);
    assert.equal(uniq.size, p.length,
      '★ ' + (i + 1) + '번째 담당자 색 목록에 같은 색이 두 번 있습니다: '
      + p.filter((c, k) => p.indexOf(c) !== k).join(' '));
  });
});

test('★ 담당자 색 목록이 두 곳에서 같다 — 한쪽만 고치면 이음센터와 달력이 딴 색이 된다', () => {
  const ps = staffPalettes();
  assert.equal(ps.length, 2, 'STAFF_COLORS 는 두 곳(대시보드·이음)에 있습니다: ' + ps.length + '곳');
  assert.deepEqual(ps[0], ps[1], '★ 두 목록이 어긋났습니다 — 같은 사람이 화면마다 다른 색이 됩니다.');
});

test('★ 칩 바탕을 연하게 칠해 글씨를 지우지 않는다', () => {
  /* 45% 연하게 칠하고 흰 글씨를 얹으니 대표 화면에서 글자가 거의 안 보였다.
     ⚠ 2026-08-15 에는 반대로 「원색이라 눈이 아프다」는 지시가 있었다. 부딪히는 것처럼
       보이지만 아니다 — 아팠던 까닭은 진해서가 아니라 «같은 색이 겹겹이» 깔려서였다.
       색을 열한 가지로 갈라 놓은 지금은 진해도 어지럽지 않다(구글 달력이 그 증거다). */
  const m = erp.match(/var CAL_CHIP_LIGHTEN = ([\d.]+)/);
  assert.ok(m, 'CAL_CHIP_LIGHTEN 을 찾지 못했습니다');
  assert.ok(Number(m[1]) < 0.15,
    '★ 앱 색만 ' + m[1] + ' 만큼 연하게 칠하면, 구글에서 온 일정(진한 색)과 한 화면에서'
    + ' 두 벌의 색조가 됩니다. 색이 어지러우면 연하게 칠할 것이 아니라'
    + ' «색이 겹치는지»부터 보세요.');
});

test('★ 담당자 색 열한 가지가 모두 «글씨가 읽히는» 칩이 된다', () => {
  /* 색을 갈라 놓으면 연한 색도 끼게 된다(#fbbf24 · #4ade80 · #f87171).
     그 위에 흰 글씨를 얹으면 글자가 사라진다 — calTextOn 이 바탕 밝기를 보고 고른다.
     ★ 규칙만 있는지 보지 않고 «실제로 돌려» 본다. 열한 색 모두 읽히는 대비가 나와야 한다. */
  const at = erp.indexOf('function calTextOn(');
  assert.ok(at > 0, '★ 글씨색을 고르는 calTextOn 이 없습니다.');
  const fn = new Function('return ' + erp.slice(at, erp.indexOf('\n  }', at) + 4))();
  function lum(hex) {
    const h = hex.replace('#', '');
    const r = parseInt(h.slice(0, 2), 16) / 255, g = parseInt(h.slice(2, 4), 16) / 255, b = parseInt(h.slice(4, 6), 16) / 255;
    const f = (v) => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  }
  function ratio(a, b) { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); }
  staffPalettes()[0].forEach(function (bg) {
    const ink = fn(bg);
    assert.ok(ratio(bg, ink) >= 3.0,
      '★ ' + bg + ' 바탕에 ' + ink + ' 글씨는 대비가 ' + ratio(bg, ink).toFixed(1) + ' 뿐입니다 — 안 읽힙니다.');
  });
  /* 칩을 그리는 두 곳(월 보기·주/일 보기)이 모두 이 규칙을 써야 한다 */
  assert.ok((erp.match(/calTextOn\(/g) || []).length >= 3,
    '★ 칩을 그리는 곳 가운데 글씨색을 못 박아 둔 데가 남아 있습니다.');
});

test('★ 날짜 옆에 음력이 붙는다 — 구글 위젯의 「25 (13)」 그 숫자다', () => {
  assert.match(erp, /function corpLunarDay\(/, '음력 셈이 없습니다.');
  assert.match(erp, /ko-KR-u-ca-dangi/,
    '★ 단기력을 안 쓰면 음력 표를 손으로 들고 있어야 합니다 — 틀리면 없느니만 못합니다.');
  assert.match(erp, /corpLunarDay\(cell\.date\)/, '★ 셈만 있고 날짜 줄에 안 붙였습니다.');
  /* 캐시가 없으면 42칸 × 다시 그릴 때마다 새로 센다 */
  assert.match(erp, /_corpLunarCache/, '★ 한 번 센 것은 적어 두어야 합니다.');
});

test('★ 음력 값이 실제로 맞는다 — 대표 위젯 화면과 대조한 여섯 날', () => {
  /* 검사고정-허용 — 이 여섯 쌍은 «규칙» 이다. 구글 위젯(2026-08)에 찍힌 값 그대로이고,
     한국천문연구원 음력과 같다. 값이 달라지면 그것은 개선이 아니라 고장이다. */
  const EXPECT = { '2026-08-13': 1, '2026-08-15': 3, '2026-08-25': 13,
                   '2026-08-26': 14, '2026-08-03': 21, '2026-07-26': 13 };
  Object.keys(EXPECT).forEach(function (d) {
    let got = '';
    try {
      got = new Intl.DateTimeFormat('ko-KR-u-ca-dangi', { day: 'numeric', timeZone: 'UTC' })
        .format(new Date(d + 'T00:00:00Z')).replace(/[^0-9]/g, '');
    } catch (e) { got = ''; }
    assert.equal(Number(got), EXPECT[d],
      '★ ' + d + ' 의 음력이 ' + got + ' 로 나옵니다 (구글 위젯은 ' + EXPECT[d] + ').');
  });
});

test('★ 넘치는 일정은 「•••」로 알린다 — 「+7」은 칸 아래로 잘렸다', () => {
  const at = erp.indexOf('IS_MOBILE && hiddenCount > 0');
  assert.ok(at > 0, '폰 넘침 표시를 찾지 못했습니다');
  const blk = erp.slice(at, at + 900);
  assert.match(blk, /'•••'/, '★ 구글 위젯은 점 셋으로 알립니다.');
  assert.match(blk, /title: hiddenCount/,
    '★ 몇 건인지는 어딘가 남아야 합니다 — 눌러 보기 전에도 알 수 있게.');
});

test('★ 칩이 칸 폭을 꽉 채운다 — 안으로 들일수록 글자가 더 잘린다', () => {
  /* 구글 위젯은 칸 131.5 에 칩 130 이다(0.989). 좌우 여백을 두면 그만큼 글자가 준다. */
  const at = erp.indexOf("padding: IS_MOBILE?'1px 0 2px'");
  assert.ok(at > 0, '★ 폰 달력 칸의 좌우 여백이 0 이 아닙니다 — 칩이 칸 폭을 못 채웁니다.');
  /* ⚠ 넓은 화면은 「…」 를 그대로 둔다 — 자리가 넉넉해 한 글자를 더 쓰는 값이 있다.
     폰에서만 구글처럼 그냥 자른다. */
  assert.match(erp, /textOverflow: IS_MOBILE\?'clip':'ellipsis'/,
    '★ 폰에서 「…」 는 한 글자를 더 잡아먹습니다 — 구글도 글자 가운데서 그냥 자릅니다.');
});

test('★ 한 칸에 넷까지 — 구글 위젯과 같은 수', () => {
  assert.match(erp, /var MAX_SHOW = 4;/, '★ 한 칸에 보이는 수가 구글(넷)과 다릅니다.');
});
