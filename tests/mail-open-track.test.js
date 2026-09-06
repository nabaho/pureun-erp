/* 📬 열람 확인 — 상대가 «언제 열었나» (대표 결정 2026-09-06)
   「보낸메일함에 수신도 동시에 볼 수 있게 … 보낸 시간과 확인한 시간을 같이 보면 편하다」

   ★ 다음메일의 수신확인 값은 우리 쪽으로 안 온다(웹 화면 전용). 그래서 우리가 잰다 —
     보내는 메일 끝에 보이지 않는 1×1 그림을 넣고, 그것이 불린 시각을 적는다.
     대표께서 두 길 가운데 이쪽을 고르셨다(다른 하나는 「읽음 확인 요청」).

   ⚠⚠ 이 검사에서 가장 중요한 것은 ①이다 — «시각과 횟수 말고는 안 적는다».
     상대의 IP·기기·위치를 적기 시작하면 그것은 다른 물건이 된다. 우리는 받는 메일에서
     바로 이런 그림을 막고 있다 — 그러면서 남에게 더 하는 것은 앞뒤가 안 맞는다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { sliceFn } = require('./fnslice.js');

const root = path.join(__dirname, '..');
const MD = require(path.join(root, 'functions', 'mail-deliver.js'));
const app = fs.readFileSync(path.join(root, 'pu-cards.html'), 'utf8');
const bare = app.replace(/\/\*[\s\S]*?\*\//g, ' ');
const idx = fs.readFileSync(path.join(root, 'functions', 'index.js'), 'utf8');
const del = fs.readFileSync(path.join(root, 'functions', 'mail-deliver.js'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, ' ');

/* 그림이 불리는 자리만 잘라 본다 */
const pixel = (function(){
  const i = idx.indexOf('exports.mailOpenPixel');
  assert.ok(i > 0, 'mailOpenPixel 을 못 찾았습니다');
  const j = idx.indexOf('\nexports.', i + 10);
  return idx.slice(i, j > i ? j : i + 4000).replace(/\/\/[^\n]*/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ');
})();

/* ══════ ① 무엇을 적는가 — 가장 중요한 자리 ══════ */

test('★★★ 여는 자리가 상대의 «IP·기기·어디서 왔는지»를 읽지 않는다', () => {
  /* ⚠ 우리는 받는 메일에서 바로 이런 그림을 막고 있다. 그러면서 남에게서 이것까지
       가져오면 앞뒤가 안 맞는다. 셀 필요도 없다 — 필요한 것은 «언제»뿐이다. */
  ['req.ip', 'x-forwarded-for', 'user-agent', 'referer', 'req.headers', 'req.connection', 'socket']
    .forEach(k=>{
      assert.ok(pixel.toLowerCase().indexOf(k.toLowerCase()) < 0,
        '여는 자리가 ' + k + ' 를 읽습니다 — 시각 말고는 적지 않기로 한 약속을 어깁니다');
    });
});

test('★★★ 적는 것이 «시각과 횟수»뿐이다', () => {
  assert.match(pixel, /cur\.n = Number\(cur\.n \|\| 0\) \+ 1;/, '몇 번 열렸는지를 안 셉니다');
  assert.match(pixel, /if \(!cur\.first\) cur\.first = now;/,
    '처음 연 때를 덮어씁니다 — 「언제 처음 봤나」가 이 기능의 핵심입니다');
  assert.match(pixel, /cur\.last = now;/, '마지막으로 연 때를 안 적습니다');
  /* 이 셋 말고 다른 칸을 만들면 그때 다시 생각할 것 */
  const sets = (pixel.match(/cur\.[a-zA-Z]+ =/g) || []).map(s=>s.slice(4, -2));
  sets.forEach(k=>{
    assert.ok(['n','first','last'].indexOf(k) >= 0,
      '새 칸(' + k + ')을 적습니다 — 시각과 횟수만 적기로 했습니다');
  });
});

test('★★★ 우리가 만든 적 없는 열쇠에는 «아무것도 안 만든다»', () => {
  assert.match(pixel, /if \(!cur\) return cur;/,
    '아무 열쇠나 부르면 새 기록이 생깁니다 — 남이 우리 DB 를 채울 수 있습니다');
  assert.match(pixel, /\^\[0-9a-f\]\{32\}\$/, '열쇠 꼴을 안 봅니다');
});

test('★★ 무슨 일이 나도 «그림은 돌려준다» — 깨진 그림표가 뜨면 그것이 표가 된다', () => {
  const iCatch = pixel.indexOf('catch');
  const iSendAfter = pixel.indexOf('send();', iCatch);
  assert.ok(iCatch > 0 && iSendAfter > iCatch, '실패하면 그림을 안 돌려줍니다');
  /* ⚠ 「catch 뒤에 send() 가 있나」로는 모자란다 — catch 안에서 먼저 돌아서면
       그 send() 는 영영 안 불린다(이빨 확인이 그 구멍을 잡았다).
       실패했을 때 하는 일은 «적어 두는 것»뿐이어야 한다. */
  const body = pixel.slice(iCatch, iSendAfter);
  assert.ok(!/\breturn\b/.test(body), '실패하면 그 자리에서 돌아섭니다 — 그림이 안 갑니다: ' + body.trim());
  assert.ok(!/res\./.test(body), '실패했을 때 딴 답을 보냅니다 — 받는 화면에 깨진 그림표가 뜹니다');
  assert.match(pixel, /Content-Type", "image\/gif"/, '그림이 아닌 것을 돌려줍니다');
  assert.match(pixel, /no-store/, '담아 두라고 이릅니다 — 담기면 두 번째부터 안 옵니다');
});

/* ══════ ② 넣는 자리 ══════ */

test('★★ 서식이 «없는» 편지에는 안 넣는다 — 평문을 서식으로 바꾸지 않는다', () => {
  const i = del.indexOf('let trackTok');
  assert.ok(i > 0, '열람 확인을 다는 자리가 없습니다');
  const seg = del.slice(i, i + 900);
  assert.match(seg, /if \(signHtml &&/, '서식이 없는 편지에도 넣습니다');
  assert.match(seg, /body\.track !== false/, '한 통씩 끌 길이 없습니다');
  assert.match(seg, /MT_ON/, '통째로 끌 스위치가 없습니다');
});

test('★★★ 열람 확인 하나 때문에 «메일이 안 나가면» 안 된다', () => {
  const i = del.indexOf('let trackTok');
  const seg = del.slice(i, i + 900);
  assert.match(seg, /catch \(e\)/, '실패를 안 받습니다 — 발송이 통째로 멈춥니다');
  assert.ok(!/throw/.test(seg), '실패를 도로 던집니다');
});

test('★★ 그림은 «보이지 않아야» 한다', () => {
  const p = MD.trackPixel('a'.repeat(32));
  assert.match(p, /width="1" height="1"/, '1×1 이 아닙니다');
  assert.match(p, /alt=""/, '글자가 뜹니다 — 못 부르면 alt 가 보입니다');
  assert.match(p, /^<img /, '그림이 아닙니다');
  assert.ok(p.indexOf('a'.repeat(32)) > 0, '열쇠가 안 실렸습니다');
});

test('★★ 열쇠를 «못 알아맞히게» 짓는다', () => {
  const a = MD.trackToken(), b = MD.trackToken();
  assert.match(a, /^[0-9a-f]{32}$/, '열쇠 꼴이 다릅니다: ' + a);
  assert.notEqual(a, b, '같은 열쇠가 두 번 나옵니다');
});

/* ══════ ③ 화면과 서버가 «같은 열쇠»를 쓰는가 ══════ */

test('★★★ 서버와 화면이 «글자까지 같은» 열쇠를 만든다 — 다르면 늘 빈칸이 된다', () => {
  /* ⚠ 어긋나도 오류가 «안 난다». 그냥 확인 시각이 영영 안 붙는다 —
       그래서 사람이 「이 기능 안 되네」로만 알고 까닭을 못 찾는다. */
  const ctx = { String, Number, Math };
  vm.createContext(ctx);
  vm.runInContext(sliceFn(app, 'function mbTrackFp('), ctx);
  const cases = [
    ['A@B.KR', 1788679342667, ' 자문  계약서 송부 '],
    ['x@y.com', 0, ''],
    ['a@b.kr', 1788679342667, '제목.에$특수#글자[가]있/다'],
    ['a@b.kr', 1788679342667, '가'.repeat(200)],
  ];
  cases.forEach(([to, ms, s])=>{
    assert.equal(ctx.mbTrackFp(to, ms, s), MD.trackFp(to, ms, s),
      '열쇠가 다릅니다: ' + to + ' / ' + s.slice(0, 20));
  });
});

test('★★ 열쇠에 실시간DB 가 «못 쓰는 글자»가 안 남는다', () => {
  const k = MD.trackFp('a@b.kr', 1788679342667, '제목.에$특수#글자[가]있/다');
  ['.', '$', '#', '[', ']', '/'].forEach(ch=>{
    assert.ok(k.indexOf(ch) < 0, ch + ' 가 그대로 남습니다 — 저장이 통째로 거부됩니다');
  });
  assert.ok(k.length <= 300, '열쇠가 너무 깁니다(' + k.length + ')');
});

test('★★ 초는 안 본다 — 우리 시각과 다음이 적는 시각이 몇 초씩 어긋난다', () => {
  const base = 1788679342000;
  assert.equal(MD.trackFp('a@b.kr', base, '제목'), MD.trackFp('a@b.kr', base + 30000, '제목'),
    '초까지 보면 같은 메일이 다른 것으로 보입니다');
  assert.notEqual(MD.trackFp('a@b.kr', base, '제목'), MD.trackFp('a@b.kr', base + 120000, '제목'));
});

/* ══════ ④ 화면 ══════ */

function openTag(row, opens, folders){
  const ctx = { String, Number, Object, Math, console,
    esc: s => String(s == null ? '' : s),
    mbTime: t => 'T' + t,
    _mbOpen: opens, _mbFolders: folders || {} };
  vm.createContext(ctx);
  ['mbFolderBy','mbTrackFp','mbOpenOf','mbOpenTag'].forEach(n=>
    vm.runInContext(sliceFn(app, 'function ' + n + '('), ctx));
  return ctx.mbOpenTag(row);
}

test('★★ 앞뒤 «1분»까지 본다 — 보낸 시각과 다음이 적는 시각이 어긋난다', () => {
  const ms = 1788679342667;
  const fp = MD.trackFp('a@b.kr', ms, '제목');
  const row = { _slug:'S', t:'a@b.kr,c@d.kr', s:'제목', d: ms + 60000 };   /* 1분 늦게 적혔다 */
  const h = openTag(row, { [fp]: { first: ms + 300000, n: 2 } }, { S:{ kind:'sent' } });
  assert.match(h, /👁/, '1분 어긋났다고 못 찾습니다 — 거의 늘 빈칸이 됩니다');
});

test('★★ 보낸 칸이 «아닌 곳»에는 안 붙인다', () => {
  const ms = 1788679342667;
  const fp = MD.trackFp('a@b.kr', ms, '제목');
  const row = { _slug:'I', t:'a@b.kr', s:'제목', d: ms };
  assert.equal(openTag(row, { [fp]: { first: ms, n: 1 } }, { I:{ kind:'inbox' } }), '',
    '받은메일함에도 붙습니다 — 무슨 뜻인지 알 수 없습니다');
});

test('★★★ 안 열린 것에는 «아무것도 안 그린다» — 「안 봄」이라 적으면 거짓이 된다', () => {
  /* ⚠ 그림을 막아 두는 사람은 열어도 안 찍힌다. 빈칸이 정직하다. */
  const row = { _slug:'S', t:'a@b.kr', s:'제목', d: 1788679342667 };
  assert.equal(openTag(row, {}, { S:{ kind:'sent' } }), '', '안 열린 줄에 무언가를 그립니다');
  const f = sliceFn(app, 'function mbOpenTag(').replace(/\/\*[\s\S]*?\*\//g, ' ');
  assert.ok(!/안 ?봄|미확인|안 ?읽음/.test(f), '「안 봄」이라고 적습니다 — 그것이 거짓이 됩니다');
});

test('★★★ 무슨 뜻인지 «귀띔에 적는다» — 안 적으면 다음메일 수신확인으로 읽는다', () => {
  const ms = 1788679342667;
  const fp = MD.trackFp('a@b.kr', ms, '제목');
  const h = openTag({ _slug:'S', t:'a@b.kr', s:'제목', d: ms },
    { [fp]: { first: ms, n: 1 } }, { S:{ kind:'sent' } });
  assert.match(h, /다음메일의 수신확인이 아니라/, '다음메일 값인 줄 압니다');
  assert.match(h, /안 찍혔다고/, '안 찍힌 것이 «안 본 것»이 아니라는 말이 없습니다');
  assert.match(h, /대신 받아 두면/, '지메일·네이버가 대신 받아 두는 것을 안 알려 줍니다');
});

test('★★ 보낸메일함을 «열 때» 한 번만 읽는다 — 그리면서 읽지 않는다', () => {
  const f = sliceFn(app, 'function mbTrackLoad(').replace(/\/\*[\s\S]*?\*\//g, ' ');
  assert.match(f, /if\(_mbOpen \|\| _mbOpenBusy\) return;/, '부를 때마다 다시 읽습니다');
  assert.match(f, /\.once\('value'\)/, 'on() 으로 걸면 바뀔 때마다 통째로 받습니다');
  /* ⚠ 「renderPCSide 안에 있나」로 자르면 안 된다 — 그 함수 안에 또 function 이 있어
       자르는 자리가 «중간»에서 끝난다(이빨 확인이 그 구멍을 잡았다).
       부르는 자리가 «몇 곳인가»로 본다: 짓는 곳 하나 + 여는 곳 하나. */
  const n = (bare.match(/mbTrackLoad\(/g) || []).length;
  assert.equal(n, 2, 'mbTrackLoad 를 ' + n + '곳에서 씁니다 — 짓는 곳과 «여는 곳» 둘이면 됩니다 '
    + '(그리는 자리에서 부르면 그릴 때마다 서버를 두드립니다)');
  const open = sliceFn(app, 'function openMailBox(').replace(/\/\*[\s\S]*?\*\//g, ' ');
  assert.match(open, /kind === 'sent'\) mbTrackLoad\(\)/, '보낸메일함을 열 때 안 읽습니다');
});

test('★★ 새로 지은 이름이 «한 번만» 선언돼 있다', () => {
  ['mbTrackFp','mbTrackLoad','mbOpenOf','mbOpenTag'].forEach(n=>{
    const c = (bare.match(new RegExp('function\\s+' + n + '\\s*\\(', 'g')) || []).length;
    assert.equal(c, 1, n + ' 이 ' + c + '번 선언돼 있습니다');
  });
  assert.match(bare, /\$\{mbOpenTag\(v\)\}/, '목록이 이 딱지를 안 그립니다');
});
