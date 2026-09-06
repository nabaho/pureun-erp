/* 📦 지난 메일 칸 — 화면에 붙이기 (대표 지시 2026-09-06 「화면 붙여라」)

   ★ 지난 메일은 POP3 로 끌어온 것이라 «다음메일 폴더가 없다». 그래서
     ① 폴더처럼 열려고 하면 그 자리에서 오류가 난다(IMAP 에 그런 폴더가 없다)
     ② 옮기기·읽음 뒤집기·중요·휴지통이 «되지 않는다» — 손댈 자리가 없다
     ③ 본문도 IMAP 이 아니라 POP3 로 받아야 한다
   이 셋을 안 갈라 두면, 목록에는 보이는데 누를 때마다 오류가 나는 칸이 된다.

   지키는 것.
   ① 폴더 사슬을 «안 탄다» — 따로 읽는다
   ② 규칙이 걸려도 이 칸에서 «안 사라진다»
   ③ 본문·첨부는 POP3 창구로 간다
   ④ 손댈 수 없는 것은 «막고 왜 안 되는지 말한다»
   ⑤ 담은 것이 있을 때만 옆줄에 내놓는다
   ⑥ 한 번만 읽는다
   ⑦ 채우기는 «이어서» 누르게 되어 있다고 미리 말한다 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { sliceFn } = require('./fnslice.js');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'pu-cards.html'), 'utf8');
const bare = app.replace(/\/\*[\s\S]*?\*\//g, ' ');
const OLD = (bare.match(/const MB_OLD_ID = '([^']+)'/) || [])[1];

test('★★ 지난 메일 칸에 «이름»이 있다', () => {
  assert.equal(OLD, '*old', '칸 이름표를 못 찾았습니다');
  const f = sliceFn(app, 'function mbBoxName(').replace(/\/\*[\s\S]*?\*\//g, ' ');
  assert.match(f, /MB_OLD_ID\) return '📦 지난 메일'/,
    '칸 이름이 없습니다 — 머리줄에 「*old」 라고 뜹니다');
});

/* ══════ ① 폴더 사슬을 안 탄다 ══════ */

test('★★★ 폴더처럼 «열려고 하지 않는다» — 다음메일에 그런 폴더가 없다', () => {
  const need = sliceFn(app, 'function mbNeedSlugs(').replace(/\/\*[\s\S]*?\*\//g, ' ');
  assert.match(need, /if\(s===MB_OLD_ID\) return \[\];/,
    '지난 메일을 «읽어 올 폴더»로 내놓습니다 — 서버에 「*old 폴더를 달라」고 하게 됩니다');
  const open = sliceFn(app, 'function openMailBox(').replace(/\/\*[\s\S]*?\*\//g, ' ');
  const iOld = open.indexOf('id === MB_OLD_ID');
  const iFolders = open.indexOf('loadMailFolders(');
  assert.ok(iOld > 0, '여는 자리에서 지난 메일을 안 가릅니다');
  assert.ok(iFolders > iOld, '폴더 사슬을 «먼저» 탑니다 — 그 자리에서 오류가 납니다');
  assert.match(open.slice(iOld, iOld + 80), /mbOldLoad\(\); return;/,
    '따로 읽고 돌아서지 않습니다');
});

test('★★ 한 번만 읽는다 — 만 통을 열 때마다 받으면 그것이 요금이다', () => {
  const f = sliceFn(app, 'function mbOldLoad(').replace(/\/\*[\s\S]*?\*\//g, ' ');
  assert.match(f, /if\(_mbOldLoaded\)\{ if\(cb\) cb\(\); return; \}/, '읽은 뒤에도 또 읽습니다');
  assert.match(f, /if\(_mbOldBusy\)/, '동시에 두 번 부르면 두 번 받습니다');
  assert.match(f, /\.once\('value'\)/, 'on() 으로 걸면 바뀔 때마다 통째로 다시 받습니다');
  assert.match(f, /_mbOldLoaded = true; _mbOldBusy = false/, '끝나고 잠금을 안 풉니다');
});

/* ══════ ② 규칙이 걸려도 안 사라진다 ══════ */

test('★★★ 주소 규칙이 걸린 지난 메일이 «어느 칸에도 안 보이게» 되면 안 된다', () => {
  /* ⚠ 업무 칸은 «다음메일 폴더»에서 줄을 모은다. 지난 메일은 그 폴더에 없으므로
       규칙이 가리키는 칸에도 안 나타난다. 그런데 규칙이 걸렸다고 이 칸에서까지
       빼 버리면 그 메일은 «통째로 사라진다». */
  const f = sliceFn(app, 'function mbRowFits(').replace(/\/\*[\s\S]*?\*\//g, ' ');
  const iOld = f.indexOf('id === MB_OLD_ID');
  const iRule = f.indexOf('mbBinIdOfRow(v)', iOld > 0 ? iOld : 0);
  assert.ok(iOld > 0, '지난 메일 칸을 따로 안 봅니다');
  assert.ok(iRule > iOld, '규칙 셈이 «먼저» 돕니다 — 규칙 걸린 지난 메일이 사라집니다');
  assert.match(f.slice(iOld, iOld + 70), /return v\._slug === MB_OLD_ID/,
    '이 칸의 제자리 판정이 없습니다');
});

/* ══════ ③ POP3 창구 ══════ */

test('★★ 본문은 POP3 창구로 간다 — IMAP 에는 그 메일이 없다', () => {
  const f = sliceFn(app, 'function mbFetchBody(').replace(/\/\*[\s\S]*?\*\//g, ' ');
  const iOld = f.indexOf('slug === MB_OLD_ID');
  const iImap = f.indexOf("readMailMessage");
  assert.ok(iOld > 0, '지난 메일을 안 가릅니다');
  assert.ok(iImap > iOld, 'IMAP 창구를 먼저 두드립니다');
  assert.match(f.slice(iOld), /readOldMail/, 'POP3 창구를 안 씁니다');
  assert.match(f.slice(iOld, iOld + 260), /if\(peek\) return Promise\.reject/,
    '이웃을 미리 받습니다 — POP3 는 한 통마다 이름표 목록을 훑어야 해서 헛일이 큽니다');
});

test('★★ 첨부 창구도 «한 자리»에서 정한다 — 내려받기와 미리보기가 갈라지면 안 된다', () => {
  const f = sliceFn(app, 'function mbAttReq(').replace(/\/\*[\s\S]*?\*\//g, ' ');
  assert.match(f, /MB_OLD_ID/, '첨부 창구가 지난 메일을 모릅니다');
  assert.match(f, /readOldMail/, 'POP3 창구를 안 씁니다');
  ['mbAtt', 'mbAttPeek'].forEach(n=>{
    const g = sliceFn(app, 'function ' + n + '(').replace(/\/\*[\s\S]*?\*\//g, ' ');
    assert.ok(/mbAttReq\(/.test(g) || /mbPvDraw|readOldMail/.test(g),
      n + ' 이 제 나름대로 창구를 고릅니다 — 한쪽만 고쳐지는 날이 옵니다');
  });
  /* 두 곳 모두 «같은» 자리를 쓰는지 */
  const dl = sliceFn(app, 'function mbAtt(').replace(/\/\*[\s\S]*?\*\//g, ' ');
  assert.match(dl, /mbAttReq\(o, i, a\)/, '내려받기가 창구를 직접 적습니다');
});

/* ══════ ④ 못 하는 것은 막고 «말한다» ══════ */

test('★★★ 손댈 수 없는 것은 막고 «왜 안 되는지» 말한다 — 조용하면 고장으로 읽힌다', () => {
  const f = sliceFn(app, 'function mbOldBlock(').replace(/\/\*[\s\S]*?\*\//g, ' ');
  assert.match(f, /toast\(/, '조용히 막습니다 — 눌러도 아무 일이 없으면 고장으로 읽힙니다');
  assert.match(f, /다음메일에서 하십시오/, '어디서 하면 되는지를 안 알려 줍니다');
  assert.match(f, /return true;/, '막았다는 것을 부른 쪽에 안 알립니다');
});

test('★★ 옮기기·휴지통·읽음·중요가 «모두» 막힌다 — 하나만 빠져도 그 자리에서 오류가 난다', () => {
  [['mbTrash', '휴지통'], ['mbMove', '옮길'], ['mbReadMark', '읽음']].forEach(([n])=>{
    const g = sliceFn(app, 'function ' + n + '(').replace(/\/\*[\s\S]*?\*\//g, ' ');
    assert.match(g, /mbOldBlock\(picked,/, n + ' 이 지난 메일을 그대로 서버로 보냅니다');
  });
  /* 중요·읽음 뒤집기는 둘 다 mbFlag 로 모인다 — 거기 한 곳에서 막는다 */
  const fl = sliceFn(app, 'function mbFlag(').replace(/\/\*[\s\S]*?\*\//g, ' ');
  assert.match(fl, /String\(slug\) === MB_OLD_ID/, '표시 바꾸기가 안 막힙니다');
});

/* ══════ ⑤ 옆줄 ══════ */

test('★★ 담은 것이 «있을 때만» 옆줄에 내놓는다 — 빈 칸은 고장으로 읽힌다', () => {
  const i = bare.indexOf('if(mbOldCount()) h +=');
  assert.ok(i > 0, '옆줄에 지난 메일 칸이 없거나, 통수를 안 보고 늘 그립니다');
  const seg = bare.slice(i, i + 700);
  assert.match(seg, /openMailBox\('\$\{MB_OLD_ID\}'\)/, '눌러도 그 칸이 안 열립니다');
  assert.match(seg, /mbOldCount\(\)\.toLocaleString\(\)/, '몇 통인지 안 적습니다');
});

/* ══════ ⑥ 세는 함수 ══════ */

test('★★ 통수는 «담아 둔 것»에서 센다', () => {
  const ctx = { Object, String, _mbMsgs: { '*old': { a:{}, b:{}, c:{} } } };
  vm.createContext(ctx);
  vm.runInContext(bare.match(/const MB_OLD_ID = [^\n]*/)[0], ctx);
  vm.runInContext(sliceFn(app, 'function mbOldCount('), ctx);
  assert.equal(ctx.mbOldCount(), 3);
  ctx._mbMsgs = {};
  assert.equal(ctx.mbOldCount(), 0, '없을 때 0 이 아닙니다 — 빈 칸이 옆줄에 남습니다');
});

test('★★ 지난 메일에서 온 줄인지 «한 자리»에서 가린다', () => {
  const ctx = { String };
  vm.createContext(ctx);
  vm.runInContext(bare.match(/const MB_OLD_ID = [^\n]*/)[0], ctx);
  vm.runInContext(sliceFn(app, 'function mbIsOld('), ctx);
  assert.equal(ctx.mbIsOld({ _slug:'*old' }), true);
  assert.equal(ctx.mbIsOld({ slug:'*old' }), true, '읽는 화면 쪽(slug)을 못 가립니다');
  assert.equal(ctx.mbIsOld({ _slug:'INBOX-x' }), false);
  assert.equal(ctx.mbIsOld(null), false, '빈 줄에서 죽습니다');
});

/* ══════ ⑦ 채우기 ══════ */

test('★★ 채우기는 «이어서» 누르게 된다고 미리 말한다', () => {
  const h = sliceFn(app, 'function mbOldHtml(').replace(/\/\*[\s\S]*?\*\//g, ' ');
  assert.match(h, /한 번에 다 안 됩니다/,
    '한 번 누르면 끝나는 줄 압니다 — 절반만 담고 멈춘 것을 「고장」으로 읽습니다');
  assert.match(h, /다시 눌러/, '다시 누르라는 말이 없습니다');
  assert.match(h, /읽지도 지우지도 않습니다/, '다음메일을 건드리는지 안 알려 줍니다');
});

test('★★ 채우고 나면 «다시 읽어» 옆줄 통수가 는다', () => {
  const f = sliceFn(app, 'function mbBackfillRun(').replace(/\/\*[\s\S]*?\*\//g, ' ');
  assert.match(f, /_mbOldLoaded = false;/,
    '채워 놓고 다시 안 읽습니다 — 옆줄 통수가 그대로라 「아무 일도 안 했나」가 됩니다');
  assert.match(f, /mbOldLoad\(/, '다시 읽으라고 안 부릅니다');
  assert.match(f, /if\(_mbFillBusy\) return;/, '누를 때마다 서버에 붙습니다');
});

test('★★ 새로 지은 이름이 «한 번만» 선언돼 있다', () => {
  ['mbOldLoad','mbIsOld','mbOldBlock','mbOldCount','mbBackfillRun','mbAttReq'].forEach(n=>{
    const c = (bare.match(new RegExp('function\\s+' + n + '\\s*\\(', 'g')) || []).length;
    assert.equal(c, 1, n + ' 이 ' + c + '번 선언돼 있습니다');
  });
});
