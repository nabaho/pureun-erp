'use strict';
/* 「지금 로그인한 사람」 표가 머리줄 위에 겹치지 않는다 — 실행: node --test tests/*.test.js

   대표 지적 2026-08-24: 「캡쳐2 화면 겹쳐지게 하지 마라」
   급여데이터함 오른쪽 위에 「권형하 대표노무사 · P-001」 표가 **떠서**
   「🔁 담당자」·「🗓 자리 맡기기」 단추 위에 겹쳐 있었다.

   ⚠ 겹침이 아니라 **두 곳에서 그린 것**이 원인이다.
   js/pu-whoami.js 는 자리를 안 알려 주면 position:fixed 로 스스로 붙는다
   (ensureAutoBadge). 그런데 이 앱들은 머리줄 #whoami 에 이름을 **직접** 그린다.
   그래서 두 개가 뜨고, 뜬 쪽이 단추를 덮었다.

   규칙: pu-whoami.js 를 불러오는 앱은 반드시 자리를 알려 준다 —
     PuWhoami.mount('#어디')  이름 자리가 없어 부품이 그려 줘야 할 때
     PuWhoami.mount(false)    이미 스스로 그리고 있을 때 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const R = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(R, f), 'utf8');

/* 「지금 로그인한 사람」을 **실제로 불러오는** 화면 전부.
   ⚠ 글로만 적힌 것(enter.html 의 설명 주석)까지 세면 없는 잘못을 잡는다 —
   <script src> 로만 센다. */
const APPS = fs.readdirSync(R)
  .filter((f) => /\.html$/i.test(f))
  .filter((f) => /<script\s+src="js\/pu-whoami\.js/.test(read(f)));

test('★ 부품을 불러오는 화면은 하나도 빠짐없이 자리를 알려 준다', () => {
  assert.ok(APPS.length >= 8, '화면을 못 찾았습니다: ' + APPS.length);
  const bad = APPS.filter((f) => !/PuWhoami\.mount\(/.test(read(f)));
  assert.deepEqual(bad, [], '자리를 안 알려 줘 표가 떠서 겹칩니다: ' + bad.join(', '));
});

test('★ 이번에 겹쳐 있던 셋은 mount(false) 로 뜬 표를 끈다', () => {
  /* 이 셋은 부품에게 줄 «빈 자리» 가 따로 없고, 머리줄에 자기가 직접 그린다.
     그래서 「그리지 말라」고 해야 한다 — 자리를 주면 자기 글씨와 부딪친다.
     ⚠ 자리를 주는 쪽(fund.html #topuser · work.html · kcareer.html)은 이와 다르다.
       그 화면들은 부품이 그 자리에 그리므로 뜬 표가 애초에 안 생긴다. */
  ['pu-paydata.html', 'payroll-os.html', 'rules.html'].forEach((f) => {
    assert.match(read(f), /PuWhoami\.mount\(false\)/, f + ' — 스스로 그리는데 표를 안 껐습니다');
  });
});

test('자리를 주는 화면은 그대로 둔다 — 거기서는 부품이 그 자리에 그린다', () => {
  assert.match(read('fund.html'), /PuWhoami\.mount\('#topuser'\)/);
});

test('★ 급여데이터함이 고쳐졌다 — 대표가 지적한 화면이다', () => {
  const s = read('pu-paydata.html');
  assert.match(s, /PuWhoami\.mount\(false\)/);
  assert.match(s, /id="whoami"/, '머리줄에 이름 자리가 있어야 합니다');
});

test('★ 급여관리도 같이 고쳤다 — 같은 짜임이라 같이 겹쳤다', () => {
  assert.match(read('payroll-os.html'), /PuWhoami\.mount\(false\)/);
});

test('부품이 늦게 실려도 자리를 알려 준다 — 한 번만 해 보고 포기하면 표가 뜬다', () => {
  ['pu-paydata.html', 'payroll-os.html'].forEach((f) => {
    const s = read(f);
    const i = s.indexOf('PuWhoami.mount(false)');
    const near = s.slice(Math.max(0, i - 300), i + 300);
    assert.match(near, /DOMContentLoaded/, f + ' — 늦게 실렸을 때가 없습니다');
  });
});

test('부품은 여전히 스스로 붙을 수 있다 — 이름 자리가 없는 화면이 그것으로 쓴다', () => {
  const s = read(path.join('js', 'pu-whoami.js'));
  assert.match(s, /position:fixed/, '뜬 표 기능을 없애면 안 됩니다');
  assert.match(s, /if \(slot \|\| suppress\) return null;/, '껐을 때 안 만드는 길이 있어야 합니다');
});
