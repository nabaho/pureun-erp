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
const idx = fs.readFileSync(path.join(root, 'functions', 'index.js'), 'utf8')
  .replace(/\/\/[^\n]*/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ');

/* 진단 함수 몸통만 잘라 본다 */
const probe = (function(){
  const i = sync.indexOf('probeMailPop:');
  assert.ok(i > 0, 'probeMailPop 을 못 찾았습니다');
  const j = sync.indexOf('readMailAttachment:', i);
  return sync.slice(i, j > i ? j : i + 4000);
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

function spans(msgs, folders){
  const ctx = { Object, String, Number, Math, Date, isFinite,
    _mbMsgs: msgs, _mbFolders: folders };
  vm.createContext(ctx);
  vm.runInContext(app.match(/const MB_OLD_DAY = [^\n]*/)[0], ctx);
  vm.runInContext(sliceFn(app, 'function mbOldSpans('), ctx);
  return ctx.mbOldSpans();
}
const DAY = 86400000, NOW = Date.now();

test('★★ 담긴 기간을 «지금 손에 든 줄»로 센다 — 서버를 안 두드린다', () => {
  const r = spans(
    { INBOX: { 1:{d:NOW-100*DAY}, 2:{d:NOW-50*DAY}, 3:{d:NOW} },
      A:     { 1:{d:NOW-800*DAY}, 2:{d:NOW} } },
    { INBOX:{ name:'받은메일함' }, A:{ name:'옛 칸' } });
  assert.equal(r.length, 2);
  assert.equal(r[0].name, '받은메일함', '짧은 칸이 «먼저» 나와야 합니다 — 손볼 곳이 거기입니다');
  assert.equal(r[0].days, 100);
  assert.equal(r[1].days, 800);
  const f = sliceFn(app, 'function mbOldSpans(').replace(/\/\*[\s\S]*?\*\//g, ' ');
  assert.ok(!/firebase|fetch\(|once\(/.test(f),
    '기간을 세려고 서버를 두드립니다 — 설정 창을 열 때마다 요금이 나갑니다');
});

test('★★ 날짜가 없는 줄은 «안 센다» — 없는 것을 1970년으로 세면 기간이 55년이 된다', () => {
  const r = spans({ INBOX: { 1:{d:0}, 2:{}, 3:{d:NOW-10*DAY}, 4:{d:NOW} } },
                  { INBOX:{ name:'받은메일함' } });
  assert.equal(r.length, 1);
  assert.equal(r[0].n, 2, '날짜 없는 줄까지 셌습니다');
  assert.equal(r[0].days, 10, '기간이 ' + r[0].days + '일로 나왔습니다');
});

test('★★ 줄이 하나뿐이어도 «0 으로 나누지» 않는다', () => {
  const r = spans({ INBOX: { 1:{d:NOW} } }, { INBOX:{ name:'받은메일함' } });
  assert.ok(Number.isFinite(r[0].perDay) && Number.isFinite(r[0].year),
    '하루 평균이 ' + r[0].perDay + ' 로 나왔습니다 — 화면에 NaN 이 뜹니다');
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
