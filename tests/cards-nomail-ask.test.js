'use strict';
/* 명함 수신거부 — 「물어보고 켜기」를 «가운데 창»으로 (대표 지시 2026-08-30)

   ★ 지나온 자리
     ① toggleNoMail 이 «둘»이었다. JS는 뒤엣것이 이기므로 「묻고 켜는」 쪽이 죽고
        「묻지 않고 켜는」 쪽이 돌았다. 검사 9,200개가 다 통과했다 —
        이름 겹침을 세는 검사를 넣고서야 드러났다.
     ② 대표께서 «물어보고 켜기»로 정하셨고, 겹침 제거·상세창 가림은 다른 세션이 넣었다.
     ③ 남은 것이 이것 — 묻는 «방법»을 브라우저 창에서 가운데 창(puAsk)으로.

   ★ 여기서 못 박는 것
     ① 켤 때는 «반드시 묻는다» — 그리고 가운데 창으로 묻는다
     ② 「아니오」면 아무것도 안 적는다 — 적는 일이 답 «뒤»에 있어야 한다
     ③ 푸는 것은 «안 묻는다» — 되돌리기 쉬운 쪽까지 물으면 손만 한 번 더 간다
     ④ 묶음(selNoMail)도 «같은 창»으로 묻는다
     ⑤ 적는 값은 읽는 쪽과 맞는다 — noMail 을 보는 자리는 모두 «있나 없나»로 읽는다
     ⑥ 상세는 «열려 있을 때만» 다시 그린다 (다른 세션이 넣은 것 — 되돌아가지 않게 잠근다)
     ⑦ 부르는 곳이 그대로다 — 상세 단추와 ⋯ 메뉴 둘 다

   ⚠ 글자·개수를 못 박지 않는다(docs/검사-못박지-않기.md). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const raw = fs.readFileSync(path.join(ROOT, 'pu-cards.html'), 'utf8').replace(/\r\n/g, '\n');
/* ⚠ 주석을 걷고 본다 — 잘 쓴 «설명»이 검사를 통과시키면 안 된다 */
const src = raw.replace(/\/\*[\s\S]*?\*\//g, ' ');

function fnBody(name) {
  const i = src.indexOf('\nfunction ' + name + '(');
  assert.ok(i >= 0, name + ' 를 찾을 수 없습니다');
  return src.slice(i, src.indexOf('\n}', i) + 2);
}

/* ══════ ① 켤 때는 가운데 창으로 묻는다 ══════ */
test('★★ 켤 때는 «반드시 묻는다» — 그리고 가운데 창으로 묻는다', () => {
  const fn = fnBody('toggleNoMail');
  assert.match(fn, /puAsk\(/,
    '★ 가운데 창으로 안 묻습니다 (대표 지시 2026-08-30 「다음메일처럼 중앙에」)');
  assert.ok(fn.indexOf('confirm(') < 0,
    '★ 브라우저 창이 남아 있습니다 — 창 맨 위에 붙어 뜨고 생김새를 못 만집니다');
});

/* ══════ ② 답 뒤에만 적는다 ══════ */
test('★★ 「아니오」면 «아무것도 안 적는다»', () => {
  const fn = fnBody('toggleNoMail');
  const i = fn.indexOf('.then(');
  assert.ok(i > 0, '★ 답을 안 기다립니다 — 묻기 전에 이미 적힙니다');
  assert.match(fn.slice(i), /if\(yes\)/,
    '★ 답을 안 보고 적습니다 — [그만두기]를 눌러도 켜집니다');
  assert.ok(fn.indexOf('Store.put(') < 0,
    '★ 묻는 자리에서 바로 저장합니다 — 적는 일은 한 곳(nmSet)에서만 하십시오');
});

/* ══════ ③ 푸는 것은 안 묻는다 ══════ */
test('★ 푸는 것은 «안 묻는다» — 되돌리기 쉬운 쪽까지 물으면 손만 더 간다', () => {
  const fn = fnBody('toggleNoMail');
  const i = fn.indexOf('if(!on)');
  assert.ok(i > 0, '★ 켤 때와 풀 때를 안 가릅니다');
  assert.ok(i < fn.indexOf('puAsk('),
    '★ 푸는 길이 물음 «뒤»에 있습니다 — 풀 때도 묻게 됩니다');
});

/* ══════ ④ 묶음도 같은 창 ══════ */
test('★★ 묶음(selNoMail)도 «같은 창»으로 묻는다 — 한 장과 여러 장이 달라 보이면 안 된다', () => {
  const fn = fnBody('selNoMail');
  assert.match(fn, /puAsk\(/, '★ 묶음은 아직 브라우저 창으로 묻습니다');
  assert.ok(fn.indexOf('confirm(') < 0, '★ confirm 이 남아 있습니다');
  assert.match(fn, /if\(!yes\) return;/, '★ 답을 안 보고 적습니다');
  const i = fn.indexOf('.then('), j = fn.indexOf('bulkPatchFlush(');
  assert.ok(j > i, '★ 묻기 «전»에 저장합니다');
});

/* ══════ ⑤ 값이 읽는 쪽과 맞는다 ══════ */
test('★★ 적는 값이 읽는 쪽과 맞는다 — noMail 을 보는 자리는 모두 «있나 없나»로 읽는다', () => {
  assert.match(fnBody('nmSet'), /it\.noMail = on \? true : null/, '★ 적는 값이 바뀌었습니다');
  /* 읽는 자리가 값을 «견주면» true 와 1 이 갈린다 */
  const bad = [];
  const re = /(?:!?\w+)\.noMail\s*(===|==|!==|!=)\s*([^\s;)&|]+)/g;
  let m;
  while ((m = re.exec(src))) bad.push(m[0]);
  assert.deepEqual(bad, [],
    '★ noMail 을 값으로 견주는 자리가 있습니다 — true 와 1 이 갈립니다: ' + bad.join(', '));
});

test('★ 묶음도 같은 값을 적는다 — 한쪽만 1 이면 지우고 다시 켰을 때 어긋난다', () => {
  assert.match(fnBody('selNoMail'), /it\.noMail\s*=\s*true/, '★ 묶음이 다른 값을 적습니다');
});

/* ══════ ⑥ 상세는 열려 있을 때만 ══════ */
test('★★ 상세는 «열려 있을 때만» 다시 그린다 — ⋯ 메뉴에서 눌렀는데 창이 튀어나오면 안 된다', () => {
  const fn = fnBody('nmSet');
  const i = fn.indexOf('openPcDetail(');
  assert.ok(i > 0, '★ 상세를 다시 안 그립니다 — 단추 글씨가 그대로 남습니다');
  assert.match(fn.slice(0, i), /classList\.contains\('open'\)/,
    '★ 열려 있는지 안 보고 엽니다 — 목록에서 눌러도 상세가 열립니다');
});

/* ══════ ⑦ 부르는 곳 ══════ */
test('★ 부르는 곳이 그대로다 — 상세 단추와 ⋯ 메뉴 둘 다', () => {
  const n = (src.match(/toggleNoMail\('/g) || []).length;
  assert.ok(n >= 2, '★ 부르는 곳이 ' + n + '곳뿐입니다 — 상세 단추나 ⋯ 메뉴가 사라졌습니다');
  assert.match(src, /onclick="closeFolderMenu\(\);selNoMail\(\)"/, '★ ⋯ 메뉴에 묶음이 없습니다');
});

/* ══════ 겹침은 다시 생기지 않는다 ══════ */
test('★★ toggleNoMail 은 «하나»다 — 둘이면 어느 쪽이 도는지 아무도 모른다', () => {
  for (const k of ['toggleNoMail', 'selNoMail', 'nmSet']) {
    const n = (src.match(new RegExp('\\nfunction ' + k + '\\(', 'g')) || []).length;
    assert.equal(n, 1, '★ ' + k + ' 이 ' + n + '개입니다 — 뒤엣것이 이기고 앞엣것은 죽습니다');
  }
});
