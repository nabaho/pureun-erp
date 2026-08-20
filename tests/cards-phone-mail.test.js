const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const cards = fs.readFileSync(path.join(__dirname, '..', 'pu-cards.html'), 'utf8');

test('★ 메일 화면이 폰에서도 그려진다', () => {
  /* 메일 칸(#pcMail)이 PC 전용 틀(#pcRoot) 안에 있어 폰에서는 아예 안 그려졌다 —
     그래서 폰에는 메일 화면 «자체»가 없었다(대표 지시 2026-08-20 "폰에서도 쓰게"). */
  assert.match(cards, /if\(!document\.body\.classList\.contains\('pc'\)\) return renderMailMobile\(\);/,
    '★ PC 칸만 보고 있으면 폰에서는 아무것도 안 그려집니다.');
  assert.match(cards, /function renderMailMobile\(\)/);
  /* 폰 render 가 메일 화면으로 가야 한다 — 안 가면 목록이 그대로 남는다 */
  const fn = cards.match(/function render\(\)\{ if\(_quiet\)[\s\S]*?renderList\(\); \}/)[0];
  assert.match(fn, /if\(state\.view==='mail'\) return renderMailMobile\(\);/);
});

test('폰 메일은 PC 것을 그대로 쓴다 — 폰용을 따로 만들지 않는다', () => {
  /* 따로 만들면 메일에 손댈 때마다 두 곳을 고쳐야 하고, 언젠가 한쪽만 고친다. */
  const fn = cards.slice(cards.indexOf('function renderMailMobile()'),
                         cards.indexOf('/* ── 쓰기 화면 ── */'));
  ['schedBoxHtml()', 'sentBoxHtml()', 'mailWriteHtml()'].forEach(function (f) {
    assert.ok(fn.includes(f), f + ' 를 안 쓰고 폰용을 따로 만들었습니다.');
  });
  assert.match(fn, /wireMailWrite\(\)/, '쓰기 화면의 배선을 안 걸면 보내기가 안 먹습니다.');
});

test('폰에서 메일로 들어가고 나올 길이 있다', () => {
  /* 들어갈 길이 없으면 만든 화면이 없는 화면이다. */
  assert.match(cards, /openMailPage\(\)">✏️ 메일 쓰기/, '☰ 메뉴에 메일 쓰기가 없습니다.');
  assert.match(cards, /openSentBox\(\)">📤 보낸 메일/);
  assert.match(cards, /openSchedBox\(\)">⏰ 예약한 메일/);
  /* 나올 길 — 메일 화면 위 「‹ 목록」 */
  assert.match(cards, /class="mmback" onclick="closeMailPage\(\)"/,
    '★ 돌아갈 길이 없으면 메일 화면에 갇힙니다.');
});

test('★ 메일은 ☰ 메뉴 «맨 위»에 있고, 그 시트는 「환경설정」이 아니다', () => {
  /* 처음에는 「⚙️ 환경설정」 시트 넷째 묶음에 넣었다. 대표가 「메일 송부함은 없다」
     하셨다(2026-08-20) — 환경설정 안에서 메일을 찾을 사람은 없다.
     있는데 못 찾으면 없는 것과 같다. */
  assert.match(cards, /<div class="mhead"><b>☰ 메뉴<\/b>/,
    '★ 「환경설정」이라고 적혀 있으면 메일을 거기서 찾지 않습니다.');
  const at = cards.indexOf('function openMenu()');
  const menu = cards.slice(at, cards.indexOf('/* ════════════ 🗑 휴지통', at));
  const mail = menu.indexOf("hd('✉️ 메일')");
  const clean = menu.indexOf("hd('🧹 정리')");
  assert.ok(mail > 0 && clean > 0 && mail < clean,
    '★ 메일이 정리·데이터 묶음 아래 있으면 한참 내려야 보입니다.');
});

test('메일 화면에서는 명함 목록의 줄들을 접는다', () => {
  /* 갈래 줄·거르개 줄은 명함 목록 것이라 메일 화면에서는 누를 것이 없고,
     누르면 엉뚱한 데로 간다. */
  assert.match(cards, /body\.mailview #tabs,body\.mailview #subbar\{display:none\}/);
  assert.match(cards, /classList\.toggle\('mailview', state\.view==='mail'\)/);
});

test('이름이 「기업정보함」으로 바뀌었다 (PC·폰 모두)', () => {
  assert.match(cards, /<div class="logo">기업정보함<\/div>/, '폰 머리줄');
  assert.match(cards, /📇 푸른 기업정보함/, 'PC 옆줄');
  assert.match(cards, /<title>푸른 기업정보함<\/title>/);
  const mf = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'pu-cards-manifest.json'), 'utf8'));
  assert.equal(mf.short_name, '기업정보함', '홈화면에 설치했을 때 뜨는 이름');
  /* 포털 쪽은 이미 「기업정보함」이었다 — 둘이 같은 말을 해야 한다 */
  const enter = fs.readFileSync(path.join(__dirname, '..', 'enter.html'), 'utf8');
  assert.match(enter, /key:'cards',\s+name:'기업정보함'/);
});
