'use strict';
/* 메일 쓰기 화면을 비웠다 (대표 지시 2026-08-30)
   "메일작성시 이내용 필요없다. 삭제해라
    자료서랍은 추후에 만든다 여기에 필요없다. 추후에 자료함에서 찾아서 가지고 오면된다."

   ★ 여기서 못 박는 것 — 하나라도 깨지면 대표께서 매번 손으로 지우셔야 한다
     ① 새 메일의 본문은 «비어» 있다 — 자료함 틀이 저절로 들어오지 않는다
     ② 그래도 «되살릴 수 있다» — 도구줄 [문구]가 살아 있다
     ③ 쓰기 화면에 자료 «서랍»이 없다
     ④ 그런데 자료를 «붙이는 길»은 살아 있다 (자료함에서 골라 오기 · 파일 첨부하기)
     ⑤ 죽은 손잡이를 안 남겼다 — 없앤 함수를 부르는 단추가 없다
     ⑥ 옆줄에서 자료 갈래를 누르면 «자료함»으로 간다 (예전 목적지인 서랍이 없어졌다)
     ⑦ 아래 안내글이 「틀에서 채워졌습니다」라고 «거짓말»하지 않는다

   ⚠ 글자·개수를 못 박지 않는다(docs/검사-못박지-않기.md).
     ①은 «채우는 코드가 없는가»를 보지, 어떤 문장인지는 안 본다. */
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

/* ══════ ① 제목도 본문도 비어서 열린다 ══════ */
/* ⚠ 2026-08-30 대표께서 본문에 이어 「제목」이라고 짚으셨다 — 둘 다 비운다. */
function emptyInit(which) {
  const fn = fnBody('openMailPage');
  const m = fn.match(new RegExp('const\\s+' + which + '\\s*=([\\s\\S]*?);'));
  assert.ok(m, 'openMailPage 에서 ' + which + ' 를 찾지 못했습니다');
  const rhs = m[1].trim();
  assert.ok(!/mailFill|MAIL_TPL_DEFAULT|tpl\./.test(rhs),
    '★ 다시 틀로 채웁니다(' + which + ' = ' + rhs + ') — 대표께서 매번 지우셔야 합니다');
  assert.ok(/^(''|""|``)$/.test(rhs), '★ ' + which + ' 가 빈 글이 아닙니다: ' + rhs);
}
test('★★ 새 메일의 본문은 «비어» 있다 — 자료함 틀이 저절로 안 들어온다', () => {
  emptyInit('body0');
});

test('★★ 새 메일의 제목도 «비어» 있다 (대표 지시 2026-08-30 「제목」)', () => {
  emptyInit('subject0');
});

test('★★ 빈 제목으로는 못 보낸다 — 비워 두는 대신 나갈 때 막아야 한다', () => {
  /* 제목을 안 채우기로 했으니, 「제목 없음」으로 고객에게 나가는 길이 열리면 안 된다.
     막는 자리는 composeCheck 하나다 — 화면이 아니라 여기서 막아야 묶음 발송도 걸린다. */
  const fn = fnBody('composeCheck');
  assert.match(fn, /p\.subject[\s\S]*?ok:\s*false/,
    '★ 제목이 비어도 보내집니다 — 「제목 없음」이 고객에게 나갑니다');
});

test('★ 제목 칸에 무엇을 적을지 «일러 준다» — 빈 칸만 있으면 고장으로 보인다', () => {
  const fn = fnBody('mailWriteHtml');
  const i = fn.indexOf('id="cpSubj"');
  assert.ok(i > 0, '제목 칸을 찾지 못했습니다');
  assert.match(fn.slice(i, i + 300), /placeholder=/,
    '★ 제목 칸이 아무 말 없이 비어 있습니다');
});

test('★ 전달·다시보내기는 안 깨진다 — 넘어온 제목·본문이 빈 값을 덮어쓴다', () => {
  const fn = fnBody('openMailPage');
  assert.match(fn, /if\(p\.subject\)/, '★ 전달할 제목이 빈 값에 덮여 사라집니다');
  assert.match(fn, /if\(p\.body\)/, '★ 전달할 본문이 빈 값에 덮여 사라집니다');
});

test('서명은 그대로 따라간다 — 본문을 비운다고 서명까지 날리면 안 된다', () => {
  assert.match(fnBody('openMailPage'), /signBlockHtml\(\)/,
    '★ 서명이 사라졌습니다 (대표 지시 2026-08-24 「한번 저장하면 계속 보낼수 있게」)');
});

/* ══════ ② 되살릴 길 ══════ */
test('★ [문구] 서랍이 살아 있다 — 지운 것이 아니라 «채우기»를 그만둔 것이다', () => {
  assert.match(src, /onclick="tplPick\(event\)"/,
    '★ 문구 서랍 단추가 없습니다 — 옛 문구를 되살릴 길이 사라졌습니다');
  assert.ok(raw.indexOf('자료 송부') > 0,
    '★ 「자료 송부」 문구 씨앗이 없습니다 — 되살려도 옛 글이 안 나옵니다');
});

/* ══════ ③ 서랍이 없다 ══════ */
test('★★ 쓰기 화면에 자료 서랍이 없다', () => {
  const fn = fnBody('mailWriteHtml');
  for (const k of ['mdrawer', 'mgrip', 'mdlist', 'mdrow', 'mdsearch', 'toggleMailDrawer']) {
    assert.ok(fn.indexOf(k) < 0, '★ 서랍 조각이 남아 있습니다: ' + k);
  }
});

test('★ 서랍을 부리던 함수들이 통째로 사라졌다 — 반쯤 지우면 다음 사람이 되살린다', () => {
  for (const n of ['drawerGroups', 'drawerCatOpen', 'toggleDrawerCat', 'focusDrawerQ',
    'setDrawerW', 'loadDrawerW', 'initMailGrip', 'drawerMax',
    'previewInDrawer', 'closeDrawerPreview', 'toggleMailDrawer']) {
    assert.ok(src.indexOf('\nfunction ' + n + '(') < 0, '★ ' + n + ' 이 남아 있습니다');
  }
});

test('★ 서랍이 쓰던 state 값도 함께 없앴다 — 남으면 「왜 안 되나」로 하루를 쓴다', () => {
  for (const k of ['state.mailDrawer', 'state.drawerQ', 'state.drawerW', 'state.drawerOpen']) {
    assert.ok(src.indexOf(k) < 0, '★ ' + k + ' 가 남아 있습니다');
  }
});

test('★ 서랍 CSS 도 없앴다 — 안 쓰는 규칙이 남으면 다음 사람이 자리를 찾다 헤맨다', () => {
  for (const c of ['.mdrawer', '.mgrip', '.mdrow', '.mdprev', '.mdcath', '.mresizing']) {
    assert.ok(src.indexOf(c) < 0, '★ ' + c + ' 규칙이 남아 있습니다');
  }
});

/* ══════ ④ 붙이는 길은 살아 있다 ══════ */
test('★★ 자료함에서 «골라 온 것»은 그대로 붙는다 — 서랍을 없앴다고 첨부가 막히면 안 된다', () => {
  assert.match(fnBody('openCompose'), /openMailPage\(\{[\s\S]*ids:\s*ids/,
    '★ 고른 자료가 쓰기 화면으로 안 넘어갑니다');
  assert.match(fnBody('openMailPage'), /ids:\s*p\.ids/,
    '★ 넘어온 자료를 편지에 안 담습니다');
});

test('★ 붙은 자료가 «첨부 칸에 보인다» — 안 보이면 붙은 줄 모르고 보낸다', () => {
  const fn = fnBody('mailWriteHtml');
  assert.match(fn, /c\.ids\.map\(/, '★ 붙은 자료 딱지를 안 그립니다');
  assert.match(fn, /dropAttach\(/, '★ 붙은 자료를 뺄 길이 없습니다');
});

test('★ 이번 편지에만 쓸 파일은 그대로 붙일 수 있다', () => {
  assert.match(fnBody('mailWriteHtml'), /addLocalFiles\(this\)/,
    '★ [파일 첨부하기] 가 사라졌습니다 — 붙일 길이 하나도 안 남습니다');
});

/* ══════ ⑤ 죽은 손잡이 없음 ══════ */
test('★★ 없앤 함수를 부르는 단추가 하나도 없다', () => {
  const dead = ['toggleMailDrawer', 'previewInDrawer', 'closeDrawerPreview',
    'toggleDrawerCat', 'focusDrawerQ'];
  const hits = [];
  const re = /on[a-z]+="([^"]*)"/g;
  let m;
  while ((m = re.exec(src))) {
    for (const d of dead) if (m[1].indexOf(d) >= 0) hits.push(d);
  }
  assert.deepEqual(hits, [], '★ 눌러도 아무 일이 안 일어나는 단추: ' + hits.join(', '));
});

/* ══════ ⑥ 갈래는 자료함으로 ══════ */
test('★★ 옆줄에서 자료 갈래를 누르면 «자료함»이 열린다 — 예전 목적지(서랍)가 없어졌다', () => {
  const fn = fnBody('pickMatCat');
  assert.match(fn, /openMatPage\(\)/, '★ 갈 곳이 없습니다 — 눌러도 아무 일이 안 일어납니다');
  assert.ok(fn.indexOf('openMailPage()') < 0,
    '★ 아직 쓰기 화면으로 갑니다 — 거기엔 이제 서랍이 없어 아무 변화가 없습니다');
  assert.match(fn, /state\.matCat/,
    '★ 자료함을 «그 갈래»로 열지 않습니다 — 전체가 나오면 다시 찾아야 합니다');
});

/* ══════ ⑦ 안내글이 거짓말하지 않는다 ══════ */
test('★ 아래 안내글이 「틀에서 채워졌습니다」라고 «거짓말»하지 않는다', () => {
  const fn = fnBody('mailWriteHtml');
  const i = fn.indexOf('cphint');
  assert.ok(i > 0, '안내글(cphint)을 찾지 못했습니다');
  const hint = fn.slice(i, i + 400);
  assert.ok(hint.indexOf('채워졌습니다') < 0,
    '★ 본문은 이제 안 채워지는데 「채워졌습니다」라고 적혀 있습니다');
  assert.match(hint, /openMatPage\(\)/,
    '★ 자료를 어디서 가져오는지 알려 주지 않습니다 — 서랍을 없앤 만큼 길을 일러 줘야 합니다');
});
