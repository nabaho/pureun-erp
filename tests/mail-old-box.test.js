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
   ⑦ 채우기는 «이어서» 누르게 되어 있다고 미리 말한다
   ⑨ 다 찼으면 «다 찼다고» 말하고, 더 누르라고 하지 않는다 */
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

test('★★★ 통수를 «줄을 다 읽지 않고도» 안다 — 안 그러면 칸이 영영 안 나타난다', () => {
  /* ★ 2026-09-06 에 그랬다: 줄은 «그 칸을 열 때» 읽는데, 칸은 통수가 있어야 보인다.
       열어야 보이고 보여야 여는 닭과 달걀이라, 서버에 1,478통이 담겼는데 화면에는
       칸 자체가 없었다. 채우기가 적어 둔 셈(old/state.got)을 쓴다. */
  const ctx = { Object, String, Number, _mbMsgs: {}, _mbOldState: { got: 1478 } };
  vm.createContext(ctx);
  vm.runInContext(bare.match(/const MB_OLD_ID = [^\n]*/)[0], ctx);
  vm.runInContext(sliceFn(app, 'function mbOldCount('), ctx);
  assert.equal(ctx.mbOldCount(), 1478, '줄을 안 읽었으면 0 이라고 합니다 — 칸이 안 보입니다');
  /* 줄을 읽은 뒤에는 «읽은 것»이 더 정확하다 */
  ctx._mbMsgs = { '*old': { a:{}, b:{}, c:{} } };
  assert.equal(ctx.mbOldCount(), 3, '읽어 둔 줄보다 옛 셈을 앞세웁니다');
  ctx._mbMsgs = {}; ctx._mbOldState = null;
  assert.equal(ctx.mbOldCount(), 0, '없을 때 0 이 아닙니다 — 빈 칸이 옆줄에 남습니다');
});

test('★★★ 통수를 묻는 일을 «그리는 함수»에서 하지 않는다', () => {
  /* ⚠ 그리기는 자료를 읽어 오는 자리가 아니다. 그렇게 두었더니 그릴 때마다 서버를
       두드리고, 화면이 없는 자리(검사)에서 뒤늦게 터졌다(2026-09-06). */
  /* ⚠ renderPCSide 는 안에 글틀(`...${}`)이 많아 중괄호로 못 자른다 — 다음 함수가
       시작하기 «전»까지를 글자로 본다. */
  const i = bare.indexOf('function renderPCSide(');
  assert.ok(i > 0, 'renderPCSide 를 못 찾았습니다');
  const j = bare.indexOf('\nfunction ', i + 10);
  const side = bare.slice(i, j > i ? j : i + 20000);
  assert.ok(!/mbOldStateLoad\(/.test(side),
    '옆줄을 그리면서 서버를 두드립니다 — 그릴 때마다 읽습니다');
  /* 부르는 자리는 «둘»이다 — 여는 자리와 채운 뒤. 그리는 자리에는 없어야 한다. */
  const n = (bare.match(/mbOldStateLoad\(\)/g) || []).length;
  assert.ok(n >= 2 && n <= 3, '부르는 자리가 ' + n + '곳입니다 — 여는 자리와 채운 뒤 둘이면 됩니다');
  const open = sliceFn(app, 'function openMailBox(').replace(/\/\*[\s\S]*?\*\//g, ' ');
  assert.match(open, /if\(_mbOldState === null\) mbOldStateLoad\(\);/,
    '여는 자리에서도 안 묻습니다 — 그러면 통수를 영영 모릅니다');
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
  /* ⚠ 옆줄 통수도 다시 물어야 한다 — 안 물으면 1,478통을 담고도 칸이 그대로 0 이다 */
  assert.match(f, /_mbOldState = null;/, '옆줄 통수를 안 다시 묻습니다');
  assert.match(f, /mbOldStateLoad\(\)/, '다시 물으라고 안 부릅니다');
});

/* ══════ ⑧ 표가 없어도 «채우기»는 남아야 한다 ══════ */

/* 진짜로 그려 본다 — 서버가 아직 기간을 안 적었을 때 */
function oldBlock(sync, oldState){
  const ctx = { Object, String, Number, Math, Date, isFinite, console,
    esc: s => String(s == null ? '' : s),
    state: { isAdmin:true, mbPop:null, mbFill:null },
    _mbSync: sync, _mbFolders: {}, _mbMsgs: {}, _mbOldState: oldState || null,
    mbSyncLoad(){}, renderMailPage(){}, renderPCSide(){} };
  vm.createContext(ctx);
  vm.runInContext(bare.match(/const MB_OLD_DAY = [^\n]*/)[0], ctx);
  vm.runInContext(bare.match(/const MB_OLD_ID = [^\n]*/)[0], ctx);
  ['mbOldSpans','mbOldCount','mbOldHtml'].forEach(n=>
    vm.runInContext(sliceFn(app, 'function ' + n + '('), ctx));
  return ctx.mbOldHtml();
}

test('★★★ 표가 «없어도» 채우기 단추는 남는다 — 통째로 안 그리면 누를 수가 없다', () => {
  /* ★ 2026-09-06 에 그랬다. 서버가 칸의 기간을 아직 안 적어 표가 비었는데, 표가 없다고
       덩이를 통째로 안 그렸다 — 그 안의 [채우기] 단추까지 함께 사라져, 대표께서
       지난 메일을 채우실 수가 없게 됐다. */
  const h = oldBlock({});                      /* 서버가 아직 아무 칸도 안 적었다 */
  assert.ok(h && h.length > 100, '덩이를 통째로 안 그립니다 — 채우기 단추가 사라집니다');
  assert.match(h, /채우기/, '채우기 단추가 없습니다');
  assert.match(h, /지난 메일/, '무엇을 하는 자리인지 안 적혀 있습니다');
  /* 표 대신 «왜 아직 없는지»를 적어야 한다 — 빈자리는 고장으로 읽힌다 */
  assert.match(h, /아직 적히지 않아/, '표가 왜 없는지 안 알려 줍니다');
});

test('★★ 서버가 적어 두면 그때부터 표가 나온다', () => {
  const NOW2 = Date.now();
  const h = oldBlock({ A: { kept:400, oldest:NOW2 - 200*86400000, newest:NOW2 } });
  assert.match(h, /200일/, '적어 둔 칸이 있는데도 표가 안 나옵니다');
  assert.match(h, /채우기/, '표가 나오면서 채우기 단추가 사라졌습니다');
});

test('★★ 아직 하나도 안 담겼어도 «시작」 단추가 나온다', () => {
  const h = oldBlock({}, { got: 0 });
  assert.match(h, /채우기 시작/, '처음 여는 사람에게 시작할 길이 없습니다');
});

/* ══════ ⑨ 다 찼을 때 (대표 확인 2026-09-07 「다 채웠다고 나온다」) ═══════════
   ⚠ 「✅ 다 채웠습니다」가 «이번에 돌린 결과»에만 있었다. 화면을 새로 열면 그 말이
     사라지고 「끝났다고 할 때까지 다시 눌러」와 [이어서 채우기] 만 남았다 —
     이미 끝났는데 계속 누르시게 되는 화면이다(서버는 「이미 끝났습니다」로 돌아선다).
   ★ 그래서 «담아 둔» 상태(old/state.done)를 보고 말해야 한다. */

const DONE_ST = { done:true, got:3316, days:365, oldest:1757203200000 };

test('★★★ 다 찼으면 «다 찼다고» 알린다 — 새로 열어도 남아야 한다', () => {
  const h = oldBlock({}, DONE_ST);
  assert.match(h, /다 채웠습니다/, '다 찼는데 아무 말이 없습니다 — 끝난 줄을 모르십니다');
  assert.match(h, /3,316/, '몇 통 담겼는지 안 알려 줍니다');
  assert.match(h, /2025-09-07/, '언제까지 거슬러 담았는지 안 알려 줍니다');
});

test('★★★ 다 찼으면 «더 누르라고 하지 않는다» — 눌러도 아무 일이 없다', () => {
  const h = oldBlock({}, DONE_ST);
  assert.ok(!/mbBackfillRun\(\)/.test(h),
    '다 찼는데 채우기 단추가 그대로 있습니다 — 눌러도 아무 일이 없습니다');
  assert.ok(!/다시 눌러/.test(h),
    '다 찼는데 「다시 눌러 주십시오」가 그대로 있습니다');
});

test('★★ 아직 안 찼으면 단추가 «그대로 있어야» 한다 — 이것이 원래 길이다', () => {
  /* ⚠ ⑨ 를 넣다가 ⑧ 을 깨면 대표께서 채우실 길이 아예 없어진다.
       「끝났을 때만」 사라지는지 여기서 함께 본다. */
  const h = oldBlock({}, { done:false, got:1478 });
  assert.match(h, /mbBackfillRun\(\)/, '아직 안 찼는데 채우기 단추가 없습니다');
  assert.match(h, /다시 눌러/, '아직 안 찼는데 다시 누르라는 말이 없습니다');
  assert.ok(!/다 채웠습니다/.test(h), '아직 안 찼는데 다 찼다고 합니다');
});

test('★★★ done 이 서 있어도 «하나도 안 담겼으면» 믿지 않는다', () => {
  /* ⚠ 담긴 것이 0 인데 「다 채웠습니다」라고 하면 그것이 거짓이고,
       게다가 채울 길까지 사라져 대표께서 아무것도 못 하신다. */
  const h = oldBlock({}, { done:true, got:0 });
  assert.ok(!/다 채웠습니다/.test(h), '하나도 없는데 다 찼다고 합니다');
  assert.match(h, /채우기 시작/, '채울 길이 사라졌습니다');
});

test('★★★ 같은 칸에서 «누르실 수 있습니다»와 «더 누르실 것이 없습니다»가 함께 나오지 않는다', () => {
  /* ⚠ 표가 아직 없을 때 나오는 「아래 채우기는 지금 바로 누르실 수 있습니다」가
       다 찬 뒤에도 그대로 남아 있었다. 그런데 그 아래 단추는 없다 —
       한 화면에서 서로 어긋나는 두 말이 나오면 어느 쪽도 못 믿는다. */
  const h = oldBlock({}, DONE_ST);                 /* 표 없음 + 다 찼음 */
  assert.ok(!/누르실 수 있습니다/.test(h),
    '단추가 없는데 「누르실 수 있습니다」가 남아 있습니다');
  assert.match(h, /더 누르실 것이 없습니다/, '다 찼다는 말이 없습니다');
  /* 아직 안 찼을 때는 그 말이 «있어야» 한다 — 표가 없어 빈 화면처럼 보이는 자리다 */
  const h2 = oldBlock({}, { done:false, got:10 });
  assert.match(h2, /누르실 수 있습니다/, '표가 없을 때 채울 수 있다는 말이 사라졌습니다');
});

test('★★ 이 칸만 보면 «최근이 비어 보이는» 까닭을 적어 둔다', () => {
  /* ⚠ 채우기가 이미 IMAP 으로 든 메일을 건너뛴다. 그래서 최근 몇 달이 한두 통이다.
       그 말이 없으면 다 채운 뒤에도 「덜 찼다」로 읽으신다 — 실제로 그렇게 물으셨다. */
  const h = oldBlock({}, DONE_ST);
  assert.match(h, /이미 들어 있어서/, '왜 최근이 비어 보이는지 안 적혀 있습니다');
  assert.match(h, /빠진 것이 아닙니다/, '「빠진 것이 아니다」를 안 말해 줍니다');
});

test('★★ 새로 지은 이름이 «한 번만» 선언돼 있다', () => {
  ['mbOldLoad','mbIsOld','mbOldBlock','mbOldCount','mbBackfillRun','mbAttReq'].forEach(n=>{
    const c = (bare.match(new RegExp('function\\s+' + n + '\\s*\\(', 'g')) || []).length;
    assert.equal(c, 1, n + ' 이 ' + c + '번 선언돼 있습니다');
  });
});
