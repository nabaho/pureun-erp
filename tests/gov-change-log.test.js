'use strict';
/* ══════ 「🕘 바뀐 기록」 — 사진과 회차를 한 창에 ══════
   실행: node --test tests/*.test.js

   예전에는 사진 이력은 머리줄에, 회차 이력은 설정 안에 있었다. 아이콘도 성격도
   같은데 자리가 달라 매번 헷갈렸다(대표 지시 2026-08-30로 합침).

   ⚠ 글자를 찾지 않고 함수를 돌린다. 가짜 화면을 끼워 진짜 chgTab 을 태운다.
   ⚠ 창을 «합치지 않은» 것도 규칙이다 — 날짜별 사진은 입구만 둔다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'gov-consulting.html'), 'utf8');

function fnSrc(name) {
  const m = new RegExp('(?:^|\\n)((?:async )?function ' + name + '\\s*\\()').exec(SRC);
  assert.ok(m, '함수를 찾을 수 없습니다: ' + name);
  const start = m.index + (m[0].startsWith('\n') ? 1 : 0);
  let i = SRC.indexOf('{', start), d = 0, k = i;
  while (k < SRC.length) {
    if (SRC[k] === '{') d++;
    else if (SRC[k] === '}') { d--; if (!d) break; }
    k++;
  }
  return SRC.slice(start, k + 1);
}

/* 가짜 화면 — 창 하나와 갈래 단추 둘 */
function world() {
  const el = {
    photoLogBody: { style: {} },
    chgRoundWrap: { style: {} },
    mbPhotoLog: { classList: { _s: new Set(), add(c) { this._s.add(c); }, contains(c) { return this._s.has(c); } } }
  };
  const tabs = [
    { dataset: { ctab: 'photo' }, style: {} },
    { dataset: { ctab: 'round' }, style: {} }
  ];
  const calls = [];
  const box = {
    console,
    q: s => el[String(s).replace('#', '')] || null,
    qa: () => tabs,
    renderPhotoLog: () => calls.push('photo'),
    renderRoundLog: () => calls.push('round')
  };
  vm.createContext(box);
  vm.runInContext("let _chgTab='photo';\n" + fnSrc('chgTab') + '\n' + fnSrc('openPhotoLog'), box);
  return { box, el, tabs, calls };
}

test('창을 열면 «사진» 갈래부터 — 회차는 안 그린다', () => {
  const w = world();
  w.box.openPhotoLog();
  assert.equal(w.el.mbPhotoLog.classList.contains('open'), true, '창이 안 열립니다');
  assert.deepEqual(w.calls, ['photo'], '★ 열자마자 회차까지 그립니다(느려집니다)');
  assert.equal(w.el.photoLogBody.style.display, '', '사진 칸이 안 보입니다');
  assert.equal(w.el.chgRoundWrap.style.display, 'none', '회차 칸이 같이 보입니다');
});

test('갈래를 바꾸면 «그때» 그린다 — 한 번에 한 쪽만 보인다', () => {
  const w = world();
  w.box.openPhotoLog();
  w.box.chgTab('round');
  assert.equal(w.calls[w.calls.length - 1], 'round', '회차를 안 그립니다');
  assert.equal(w.el.chgRoundWrap.style.display, '', '회차 칸이 안 보입니다');
  assert.equal(w.el.photoLogBody.style.display, 'none', '★ 두 칸이 같이 보입니다');

  w.box.chgTab('photo');
  assert.equal(w.el.photoLogBody.style.display, '');
  assert.equal(w.el.chgRoundWrap.style.display, 'none');
});

test('엉뚱한 갈래 이름은 «사진»으로 — 빈 화면이 되지 않는다', () => {
  const w = world();
  w.box.chgTab('없는것');
  assert.equal(w.el.photoLogBody.style.display, '', '★ 아무것도 안 보입니다');
});

test('고른 갈래가 단추에 보인다 — 어디를 보고 있는지 알아야 한다', () => {
  const w = world();
  w.box.chgTab('round');
  const on = w.tabs.filter(b => b.style.color === '#fff');
  assert.equal(on.length, 1, '★ 고른 갈래가 하나로 표시되지 않습니다');
  assert.equal(on[0].dataset.ctab, 'round');
});

test('★ 날짜별 사진은 «합치지 않고» 입구만 둔다 — 창이 무거워진다', () => {
  /* 창 안에 사진첩 격자를 끌어들이면 이 창이 무거워지고 느려진다.
     흩어져 있던 것은 «들어가는 길»이었다. */
  assert.match(SRC, /openPhotoGal\(\)/, '날짜별 사진으로 가는 길이 없습니다');
  const win = SRC.slice(SRC.indexOf('id="mbPhotoLog"'), SRC.indexOf('id="mbPhotoGal"'));
  assert.doesNotMatch(win, /galBody|galDate/, '★ 날짜별 사진 화면을 이 창에 끌어들였습니다');
});

test('★ 회차 이력이 «두 곳»에 있으면 안 된다 — 합친 까닭이 그것이다', () => {
  assert.doesNotMatch(SRC, /data-stab="roundlog"/, '★ 설정에 회차 이력 탭이 남아 있습니다');
  assert.doesNotMatch(SRC, /id="stab-roundlog"/, '★ 설정에 회차 이력 칸이 남아 있습니다');
  /* 목록을 담는 자리는 «하나»여야 한다 — 둘이면 한쪽이 조용히 안 그려진다 */
  assert.equal((SRC.match(/id="roundLogList"/g) || []).length, 1, '★ 회차 목록 자리가 둘입니다');
});
