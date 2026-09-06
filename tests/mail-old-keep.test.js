/* 📦 지난 메일 — 얼마나 보관하고 있나 · POP3 로 잴 수 있나 (대표 지시 2026-09-06)
   「메일함의 데이터를 더 많이 받을 수 없을까? … 최소 1년의 메일을 보관해야 한다」

   ★ 재 보고 알게 된 것 (2026-09-06)
     ① «앞으로 오는 것»은 이미 다 쌓인다 — 우리 거울은 다음메일의 400 창을 넘어
        계속 쌓이게 되어 있다(mail-box.js goneKeys, 대표 지시 2026-08-28).
        실제로 보낸메일함은 614통으로 이미 400 을 넘겼다.
     ② 모자란 것은 «지난 것»이다 — 처음 동기화한 날 이미 창 밖이던 메일.
     ③ 칸 32개 중 아홉은 이미 1년을 넘겼다. 짧은 것은 넷뿐이다.

   ⚠⚠ 이 검사에서 «가장 중요한 것»은 ①이다 — POP3 진단이 메일을 건드리지 않는가.
     다음메일 설정이 「가져온 메일 삭제」로 되어 있으면, 내용을 읽는 명령 하나가
     대표님 메일을 지운다. 그 설정을 확인하기 전에는 통수만 묻는다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { sliceFn } = require('./fnslice.js');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'pu-cards.html'), 'utf8');
const bare = app.replace(/\/\*[\s\S]*?\*\//g, ' ');
const sync = fs.readFileSync(path.join(root, 'functions', 'mail-sync.js'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, ' ');
const box = fs.readFileSync(path.join(root, 'functions', 'mail-box.js'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, ' ');
const idx = fs.readFileSync(path.join(root, 'functions', 'index.js'), 'utf8')
  .replace(/\/\/[^\n]*/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ');

/* 진단 함수 «몸통만» 잘라 본다.
   ⚠★ 끝을 readMailAttachment 로 잡았다가 깨졌다 — 그 사이에 지난 메일 채우기·열기가
     들어오면서, 그것들이 쓰는 TOP·RETR 이 이 진단의 것으로 읽혔다(2026-09-06).
     끝은 «바로 다음에 오는 것»으로 잡고, 그것이 사라지면 그 자리에서 알린다. */
const probe = (function(){
  const i = sync.indexOf('probeMailPop:');
  assert.ok(i > 0, 'probeMailPop 을 못 찾았습니다');
  const j = sync.indexOf('backfillMailbox:', i);
  assert.ok(j > i, '진단 다음에 오던 것(backfillMailbox)이 사라졌습니다 — '
    + '자를 끝을 다시 잡아야 합니다(안 그러면 남의 코드를 이 진단으로 읽습니다)');
  return sync.slice(i, j);
})();

/* ══════ ①② 메일을 건드리지 않는다 — 가장 중요한 자리 ══════ */

test('★★★ 진단이 메일을 «읽지도 지우지도» 않는다 — RETR·TOP·DELE 를 안 쓴다', () => {
  /* ⚠ 다음메일 설정이 「가져온 메일 삭제」면 읽는 순간 사라진다. 그 설정을 확인하기
       전에는 통수만 묻는다. 이 줄이 이 기능에서 가장 중요하다. */
  ['DELE', 'RETR', 'TOP '].forEach(cmd=>{
    assert.ok(probe.indexOf("'" + cmd) < 0 && probe.indexOf('"' + cmd) < 0,
      '진단이 ' + cmd.trim() + ' 를 씁니다 — 대표님 메일이 사라질 수 있습니다');
  });
  assert.match(probe, /STAT\\r\\n/, '통수를 안 묻습니다');
  assert.match(probe, /UIDL\\r\\n/, '이름표를 안 묻습니다');
});

test('★★ 끊기 전에 RSET 을 보낸다 — 표시가 남지 않게', () => {
  const iR = probe.indexOf('RSET');
  const iQ = probe.indexOf('QUIT');
  assert.ok(iR > 0, 'RSET 을 안 보냅니다');
  assert.ok(iQ > iR, 'RSET 보다 먼저 끊습니다 — 표시가 남을 수 있습니다');
});

test('★★ 돌려주는 것이 «수»뿐이다 — 제목·보낸이를 안 싣는다', () => {
  ['subject', 'from', 'body', 'text', 'html'].forEach(k=>{
    assert.ok(!new RegExp('out\\.' + k + '\\s*=').test(probe),
      '진단이 ' + k + ' 를 돌려줍니다 — 진단이 자료를 흘리면 안 됩니다');
  });
  ['count', 'bytes', 'uidlRows'].forEach(k=>{
    assert.ok(new RegExp('out\\.' + k + '\\s*=').test(probe), k + ' 를 안 돌려줍니다');
  });
});

test('★★ 대표만 부를 수 있다', () => {
  assert.match(probe, /\},\s*requireAdmin\)\)/,
    '아무 직원이나 부를 수 있습니다 — POP3 는 메일함 전체가 걸린 자리입니다');
});

test('★★ 밖으로 «내보내야» 올라간다 — 안 내보내면 배포부터 막힌다', () => {
  /* ⚠ 실제로 겪었다: mail-sync.js 에만 적고 index.js 에 안 내보내
       「No function matches the filter」로 배포가 통째로 멈췄다. */
  assert.match(idx, /exports\.probeMailPop\s*=\s*MSYNC\.probeMailPop/,
    'index.js 가 이 함수를 안 내보냅니다 — 배포가 안 됩니다');
});

/* ══════ ③ 화면 — 기간을 어떻게 세나 ══════ */

function spans(sync, folders){
  const ctx = { Object, String, Number, Math, Date, isFinite,
    _mbSync: sync, _mbFolders: folders };
  vm.createContext(ctx);
  vm.runInContext(app.match(/const MB_OLD_DAY = [^\n]*/)[0], ctx);
  vm.runInContext(sliceFn(app, 'function mbOldSpans('), ctx);
  return ctx.mbOldSpans();
}
const DAY = 86400000, NOW = Date.now();

test('★★★ 기간을 «서버가 적어 둔 값»으로 센다 — 앱이 손에 든 줄로 세면 늘 틀린다', () => {
  /* ★ 2026-09-06 대표 화면에서 드러난 것: 「받은메일함 16일·100통·1년이면 2,281통」.
       진짜는 94일·438통이었다. 앱은 칸마다 100통씩만 손에 들기 때문이다(mbPageSize).
       표본으로 기간을 재면 짧게 나오고, 하루 평균이 부풀어 「1년이면」이 배로 뛴다. */
  const f = sliceFn(app, 'function mbOldSpans(').replace(/\/\*[\s\S]*?\*\//g, ' ');
  assert.ok(!/_mbMsgs/.test(f),
    '앱이 손에 든 줄(_mbMsgs)로 셉니다 — 칸마다 100통씩만 들고 있어 늘 틀립니다');
  assert.match(f, /_mbSync/, '서버가 적어 둔 값을 안 봅니다');
  assert.match(f, /s\.kept/, '우리가 «실제로 든» 통수(kept)를 안 봅니다');
});

test('★★ 서버 값으로 세면 진짜 기간이 나온다', () => {
  const r = spans(
    { INBOX: { kept:438, oldest:NOW-94*DAY, newest:NOW },
      A:     { kept:400, oldest:NOW-800*DAY, newest:NOW } },
    { INBOX:{ name:'받은메일함' }, A:{ name:'옛 칸' } });
  assert.equal(r.length, 2);
  assert.equal(r[0].name, '받은메일함', '짧은 칸이 «먼저» 나와야 합니다 — 손볼 곳이 거기입니다');
  assert.equal(r[0].days, 94);
  assert.equal(r[0].n, 438, '통수가 ' + r[0].n + ' 로 나왔습니다');
  assert.equal(r[1].days, 800);
});

test('★★ 서버가 «아직 안 적은» 칸은 건너뛴다 — 지어내면 그것이 또 틀린 표가 된다', () => {
  const r = spans(
    { A: { kept:100 },                                  /* 날짜가 없다 */
      B: { kept:0, oldest:NOW-10*DAY, newest:NOW },     /* 통수가 없다 */
      C: { kept:5, oldest:NOW, newest:NOW-10*DAY },     /* 앞뒤가 뒤집혔다 */
      D: { kept:9, oldest:NOW-10*DAY, newest:NOW } },
    { D:{ name:'멀쩡한 칸' } });
  assert.equal(r.length, 1, '못 믿을 칸까지 ' + r.length + '개를 그렸습니다');
  assert.equal(r[0].name, '멀쩡한 칸');
});

test('★★ 하루 만에 다 온 칸도 «0 으로 나누지» 않는다', () => {
  const r = spans({ A: { kept:9, oldest:NOW, newest:NOW } }, { A:{ name:'오늘' } });
  assert.ok(Number.isFinite(r[0].perDay) && Number.isFinite(r[0].year),
    '하루 평균이 ' + r[0].perDay + ' 로 나왔습니다 — 화면에 NaN 이 뜹니다');
});

test('★★★ 서버가 «적는 김에» 기간을 세어 둔다 — 따로 읽어 오지 않는다', () => {
  const i = sync.indexOf('p.sync.oldest');
  assert.ok(i > 0, '서버가 칸의 기간을 안 세어 둡니다 — 화면이 셀 밑감이 없습니다');
  const seg = sync.slice(Math.max(0, i - 500), i + 300);
  assert.match(seg, /for \(const g of held\)/, '방금 적은 줄에서 세지 않습니다');
  assert.ok(!/once\('value'\)/.test(seg),
    '기간을 세려고 폴더를 다시 읽습니다 — 적는 김에 세면 공짜입니다');
  assert.match(seg, /if \(!d\) continue;/,
    '날짜 없는 줄까지 셉니다 — 1970년이 섞이면 기간이 55년이 됩니다');
});

test('★★★ 세어 둔 기간을 «다음 회차로 이어 준다» — 안 이으면 매번 지워진다', () => {
  /* ⚠ nextSync 는 표를 «새로 지어» 돌려준다. 거기 안 실으면 회차마다 사라져
       화면의 표가 늘 비어 보인다 — unread·sweptAt 이 겪었던 그 자리다. */
  const f = box.slice(box.indexOf('function nextSync('), box.indexOf('function goneKeys('));
  assert.match(f, /oldest: Number\(s\.oldest \|\| 0\)/, '가장 오래된 날짜를 안 이어 줍니다');
  assert.match(f, /newest: Number\(s\.newest \|\| 0\)/, '가장 최근 날짜를 안 이어 줍니다');
});

test('★★ 서버 값은 «그때» 한 번만 읽는다 — 설정 창을 열 때마다 받으면 안 된다', () => {
  const f = sliceFn(app, 'function mbSyncLoad(').replace(/\/\*[\s\S]*?\*\//g, ' ');
  assert.match(f, /if\(_mbSync\)\{ if\(cb\) cb\(\); return; \}/, '읽은 뒤에도 또 읽습니다');
  assert.match(f, /\.once\('value'\)/, 'on() 으로 걸면 바뀔 때마다 통째로 다시 받습니다');
  assert.match(f, /mailbox\/sync/, '엉뚱한 자리를 읽습니다');
  /* ⚠ msgs 를 통째로 읽으면 3.5MB 다 — 설정 창 한 번에 그럴 값이 아니다 */
  assert.ok(!/mailbox\/msgs/.test(f), '메일 줄을 통째로 읽습니다');
});

test('★★ 「1년이면」은 «어림»이라고 적는다 — 잰 값처럼 보이면 안 된다', () => {
  const h = sliceFn(app, 'function mbOldHtml(').replace(/\/\*[\s\S]*?\*\//g, ' ');
  assert.match(h, /어림/, '민 값을 잰 값처럼 적습니다');
  assert.match(h, /약 \$\{r\.year/, '「약」을 안 붙입니다');
});

test('★★ 「앞으로 오는 것은 이미 쌓인다」를 «먼저» 말한다 — 없는 문제를 고치게 두지 않는다', () => {
  const h = sliceFn(app, 'function mbOldHtml(').replace(/\/\*[\s\S]*?\*\//g, ' ');
  assert.match(h, /앞으로 오는 것은 이미 다 쌓입니다/,
    '지금 상태를 안 알려 줍니다 — 이미 되는 일을 다시 만들게 됩니다');
  assert.match(h, /지난 것/, '무엇이 모자란지를 안 짚습니다');
});

test('★ 재는 단추는 대표에게만 보인다 — 서버가 어차피 막는다', () => {
  const h = sliceFn(app, 'function mbOldHtml(').replace(/\/\*[\s\S]*?\*\//g, ' ');
  assert.match(h, /state\.isAdmin \?/,
    '직원 화면에도 단추가 보입니다 — 눌러도 막히니 「고장」으로 읽힙니다');
});

test('★★ 재는 동안 «다시 못 누른다» — 한 번에 하나면 충분하다', () => {
  const f = sliceFn(app, 'function mbPopProbe(').replace(/\/\*[\s\S]*?\*\//g, ' ');
  assert.match(f, /if\(_mbPopBusy\) return;/, '누를 때마다 POP3 에 붙습니다');
  assert.match(f, /_mbPopBusy = false/, '끝나고 잠금을 안 풉니다 — 다시는 못 누릅니다');
});

test('★★ 새로 지은 이름이 «한 번만» 선언돼 있다', () => {
  ['mbOldSpans','mbOldHtml','mbPopProbe'].forEach(n=>{
    const c = (bare.match(new RegExp('function\\s+' + n + '\\s*\\(', 'g')) || []).length;
    assert.equal(c, 1, n + ' 이 ' + c + '번 선언돼 있습니다');
  });
  assert.match(bare, /\$\{mbOldHtml\(\)\}/, '설정 창이 이 덩이를 안 그립니다');
});
