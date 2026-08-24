/* 머리줄 — 폰에서 오른쪽이 화면 밖으로 나가 있던 것 (대표 지시 2026-08-24
   「폰 로그인경우 아이콘이 가로세로 정렬이 제대로 안되어 있다 오른쪽으로 넘어간부분 정리해라」)

   실측(360px · 진짜 마크업으로): 머리줄 너비가 897px 이었다 — 화면의 2.5배.
   537px 이 화면 밖에 있었고, 거기 있던 것은 «없는 것»과 같았다:
     🏠 시작화면 지정 · 🔔 알림 · 🖥️ PC화면 · 🌙 다크모드 · 📞 상담 · 사용자 칩(🔑 🤖 🎓 🚪)
   게다가 「🔔 11」 배지는 떠 있는 것(fixed)이라 자리를 안 먹어 「🚪 로그아웃」 위에
   그대로 겹쳐 앉았고, 세로로도 5px 처져 있어 줄이 안 맞아 보였다.

   ★ 고친 방식은 «접기» 다. 없앤 것은 하나도 없다 —
     ① 왼쪽 단추는 그림만 남기고 글자를 접는다(.hd-lbl)
     ② 오른쪽 묶음은 ⋯ 뒤로 접는다(.hd-fold) — 누르면 그 자리에서 편다
     ③ 제목은 «줄어들 수 있게» 둔다 — 안 그러면 나머지가 밖으로 밀린다
     ④ 종 배지는 머리줄 가운데에 세우고, 보일 때만 그만큼 자리를 비운다

   ★ 넓은 화면은 display:contents 로 «겹이 없는 것»과 같게 만들어 그대로 둔다.
     이번에 PC 에서 달라지는 곳은 시작화면 지정 단추의 «자리» 하나뿐이다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const erp = fs.readFileSync(path.join(ROOT, 'pu-erp.html'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'css', 'pu-erp.css'), 'utf8');

/* 좁은 화면 규칙만 떼어 온다 — 넓은 화면 것과 섞어 보면 「폰에서만 바꿨다」를
   증명할 수 없다. ⚠ 이 파일에는 «768px» 과 «640px» 두 구간이 다 있고 띄어쓰기도
   제각각이라(`640px){` · `768px) {`), 한 벌로 훑는다. */
function narrowBlocks() {
  const out = [];
  const re = /@media \(max-width: ?(\d+)px\)/g;
  let m;
  while ((m = re.exec(css))) {
    if (+m[1] > 768) continue;
    let i = css.indexOf('{', m.index + m[0].length - 1) + 1, d = 1;
    for (; i < css.length && d > 0; i++) {
      if (css[i] === '{') d++;
      else if (css[i] === '}') d--;
    }
    out.push(css.slice(m.index, i));
  }
  return out;
}
const BLOCKS = narrowBlocks();
const PHONE = BLOCKS.join('\n');
const WIDE = (function () {
  let w = css;
  BLOCKS.forEach(function (b) { w = w.replace(b, ''); });
  return w;
})();

test('★ 접는 겹은 넓은 화면에서 «없는 것»과 같다 — 그래야 PC 자리가 안 바뀐다', () => {
  /* display:contents 가 아니면 이 겹 하나 때문에 PC 머리줄이 통째로 다시 그려진다. */
  assert.match(css, /\.hd-fold\s*\{[^}]*display:\s*contents/,
    '★ display:contents 가 아니면 넓은 화면의 자리가 바뀝니다.');
  assert.match(css, /\.hd-more\s*\{[^}]*display:\s*none/,
    '★ ⋯ 는 폰에서만 뜻이 있습니다 — PC 에는 접을 까닭이 없습니다.');
});

test('★ 접는 것이지 없애는 것이 아니다 — ⋯ 를 누르면 그 자리에서 편다', () => {
  assert.match(PHONE, /\.hd-fold\s*\{[^}]*display:\s*none/, '폰에서 접는 규칙이 없습니다.');
  assert.match(PHONE, /\.hd-fold\.on\s*\{[^}]*display:\s*flex/,
    '★ 접었으면 «펴는 길»이 있어야 합니다 — 없으면 그 기능들을 없앤 것입니다.');
  assert.match(erp, /className:'hd-more'/, '⋯ 단추가 없습니다.');
  assert.match(erp, /setHdPop\(!hdPop\)/, '★ ⋯ 가 묶음을 열지 않습니다.');
  /* 접힌 안에 무엇이 들었는지 — 이 넷이 폰에서 아예 못 닿던 것들이다 */
  const at = erp.indexOf("className:'hd-fold'");
  assert.ok(at > 0, 'hd-fold 를 찾지 못했습니다');
  const blk = erp.slice(at, at + 4000);
  ['DesktopViewToggle', 'DarkModeToggle', '📞 상담', "className:'hd-user'"].forEach(function (k) {
    assert.ok(blk.indexOf(k) > 0, '★ ' + k + ' 가 접히는 묶음 안에 없습니다.');
  });
});

test('★ 제목은 «줄어들 수 있어야» 한다 — 안 그러면 나머지가 화면 밖으로 밀린다', () => {
  /* 종전에는 flex-shrink:0 이라 제목이 제 폭을 고집했고, 그 뒤 것들이 밀려 나갔다.
     ⚠ 반대로 그냥 줄이기만 하면 제목이 0px 이 되어 «여기가 어디인지»를 잃는다 —
       실제로 「🏠 시작화면 지정」(104px) 때문에 0px 이 됐다. 그래서 그 단추를 접었다. */
  /* ⚠ 좁은 화면 구간이 여럿이라 .hd-title 규칙도 여러 벌이다. «한 벌이라도»
     안 줄어들게 적어 두면 언젠가 그것이 이긴다 — 전부를 본다. */
  const all = PHONE.match(/\.hd-title\s*\{[^}]*\}/g) || [];
  assert.ok(all.length, '폰의 제목 규칙을 찾지 못했습니다');
  all.forEach(function (r) {
    assert.doesNotMatch(r, /flex-shrink:\s*0/,
      '★ 제목이 안 줄어들면 오른쪽이 화면 밖으로 나갑니다: ' + r);
  });
  const one = all.join('');
  assert.match(one, /text-overflow:\s*ellipsis/,
    '★ 줄어들되 말줄임으로 끝나야 글자가 세로로 쪼개지지 않습니다.');
  assert.match(one, /min-width:\s*0/, '★ min-width:0 이 없으면 flex 는 안 줄어듭니다.');
});

test('★ 왼쪽 단추는 글자만 접는다 — 단추는 그대로 남는다', () => {
  assert.match(erp, /className:'hd-lbl'/, '접을 손잡이가 없습니다.');
  assert.match(PHONE, /\.hd-lbl\s*\{[^}]*display:\s*none/);
  assert.match(WIDE, /\.hd-lbl\s*\{[^}]*display:\s*inline/,
    '★ 넓은 화면에서 글자가 사라지면 무슨 단추인지 모릅니다.');
  /* 새로고침·로그아웃은 폰에서 «늘 보이는» 것으로 대표가 정해 둔 둘이다 */
  assert.match(erp, /'🔄', h\('span',\{className:'hd-lbl'\}/);
  assert.match(erp, /'🚪', h\('span',\{className:'hd-lbl'\}/);
});

test('★ 흰 머리줄에 흰 글씨를 두지 않는다 — 글자가 아예 안 보인다', () => {
  /* 짙은 머리줄이던 시절의 색(rgba(255,255,255,.12) 바탕 + #fff 글자)이 남아 있어
     「🏠 시작화면 지정」과 「◀ 뒤로」는 눌러도 되는 단추인 줄 아무도 몰랐다. */
  const at = erp.indexOf("return h('header', { className:'hd' }");
  assert.ok(at > 0, '머리줄을 찾지 못했습니다');
  const hd = erp.slice(at, at + 9000);
  assert.doesNotMatch(hd, /color:'#fff'[^}]{0,80}'◀ 뒤로'/,
    '★ 「◀ 뒤로」 글자가 흰 바탕에 흰색입니다.');
  assert.ok(hd.indexOf("rgba(255,255,255,0.12)") < 0,
    '★ 짙은 머리줄 때 쓰던 반투명 흰 바탕이 남아 있습니다 — 지금 바탕은 흰색입니다.');
  assert.match(css, /\.hd \{[^}]*background:\s*#fff/, '이 검사의 전제(머리줄이 흰 바탕)가 바뀌었습니다.');
});

test('★ 떠 있는 종 배지는 머리줄 «가운데»에 선다', () => {
  /* 배지 높이 29px, 머리줄 46px → (46−29)/2 ≒ 9px. 종전 14px 은 5px 처져 있었다. */
  const m = erp.match(/badge\.style\.cssText='position:fixed;top:(\d+)px/);
  assert.ok(m, '배지 자리를 찾지 못했습니다');
  const top = +m[1];
  assert.ok(Math.abs((top + 29 / 2) - 23) <= 2,
    '★ 배지 가운데가 머리줄 가운데(23px)에서 벗어납니다 — 줄이 안 맞아 보입니다. (top:' + top + 'px)');
});

test('★ 떠 있는 배지는 자리를 «안 먹으므로» 보일 때만 그만큼 비워 둔다', () => {
  /* 이것이 없으면 배지가 「🚪 로그아웃」 위에 그대로 겹친다(360·412px 실측).
     ⚠ 안 보일 때까지 비워 두면 좁은 화면에서 제목이 공연히 줄어든다. */
  assert.match(erp, /classList\.add\('has-alert-badge'\)/);
  assert.match(erp, /classList\.remove\('has-alert-badge'\)/,
    '★ 알림이 사라졌는데 자리를 계속 비워 두면 제목만 손해입니다.');
  assert.match(PHONE, /body\.has-alert-badge \.hd\s*\{[^}]*padding-right/);
  assert.match(PHONE, /#erp-alert-badge\s*\{[^}]*right:\s*8px/,
    '★ 폰에서 오른쪽 끝으로 안 가면 머리줄 한가운데를 덮습니다.');
});
