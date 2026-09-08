/* 메일함 설정을 «갈래(탭)»로 (대표 지시 2026-08-31)
   「이 부분 탭으로 만들어 달라. 보기 등」

   ★ 오던 길 — ①820px 로 못 박혀 오른쪽 절반이 비고 아래로만 길었다 → ②두 칸으로 폈다
     → ③그래도 한 화면에 다섯 갈래가 쏟아져, 대표께서 «갈래»를 고르셨다.
     ⚠ ②의 검사(mail-set-grid)를 «지우지 않고 여기로 옮겨 다시 썼다» — 지킬 것 가운데
       몇은 그대로다(820px 대못을 다시 박지 않는다 · 손잡이를 잃지 않는다).

   지키는 것.
   ① 갈래 단추가 «다섯 개 다» 보인다 — 무엇이 있는지는 눌러 보지 않아도 알아야 한다
   ② 한 번에 «한 갈래»만 펼쳐진다 — 둘이 켜지면 갈래로 나눈 뜻이 없다
   ③ 고른 갈래는 «이 기계에만» 담는다 — 서버에 두면 사무실에서 보던 갈래가 폰에서 열린다
   ④ 모르는 값이면 «첫 갈래»로 — 안 그러면 아무 갈래도 안 켜져 화면이 통째로 빈다
   ⑤ 820px 대못을 다시 박지 않는다
   ⑥ 옮기면서 손잡이를 «하나도» 잃지 않는다
   ⑦ 열고 닫은 <div> 짝이 맞는다 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { sliceFn } = require('./fnslice.js');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'pu-cards.html'), 'utf8');
const css = app.replace(/\/\*[\s\S]*?\*\//g, ' ');

/* 진짜로 그려 본다 */
function draw(tab) {
  const store = {};
  const ctx = {
    Object, String, Number, Array, JSON,
    MB_SIZES: [50, 100, 200, 500],
    MB_KEYS: [['C', '메일 쓰기'], ['Esc', '목록으로 돌아가기']],
    _mbCo: { 'a@b.c': 1 }, _mbNotCo: {}, _mbSeen: {},
    _mbProbe: null, _mbProbing: false,
    /* 🚫 스팸 거르기(2026-09-08) — ③ 푸른 분류 갈래가 이 줄도 그린다.
       ⚠ 켜기·끄기 판정은 «진짜 함수»를 태운다(아래 목록에 mbSpamOn 을 넣었다).
         가짜로 true 를 돌려주면 「빈 값이면 켠 것」 규칙이 깨져도 여기서 안 드러난다. */
    _mbNotSpam: {}, _mbSpamOff: false,
    /* 📦 지난 메일 덩이(2026-09-06) — 이 갈래가 그것도 그린다.
       ⚠ 진짜 함수를 태운다(아래 목록). 여기서 빈 값을 돌려주는 가짜를 두면
         그 덩이가 안 그려져도 검사가 통과한다. */
    /* ⚠ 기간은 «서버가 적어 둔 것»(mailbox/sync)에서 센다 — 앱이 손에 든 줄로 세면
         칸마다 100통씩뿐이라 늘 틀린다(2026-09-06 대표 화면에서 드러났다). */
    _mbMsgs: { '*old': {} }, _mbOldState: { got: 0 },
    _mbSync: { INBOX: { kept: 438, oldest: Date.now() - 94 * 86400000, newest: Date.now() } },
    _mbFolders: { INBOX: { name: '받은메일함' } },
    state: { isAdmin: true, mbSize: 100, mbSetTab: tab || '' },
    localStorage: { getItem: k => (k in store ? store[k] : null),
                    setItem: (k, v) => { store[k] = String(v); } },
    __store: store,
    esc: s => String(s == null ? '' : s),
    matMailCfg: () => ({ from: '370-6@daum.net' }),
    mbBins: () => [], mbHidden: () => false,
    mbPreviewOn: () => false, mbPageSize: () => 100,
    mbNow: () => 'INBOX', mbProbeTell: () => '알아봅니다',
    renderMailPage() {}, $: () => null
  };
  vm.createContext(ctx);
  vm.runInContext(app.match(/const MB_SET_TABS = [\s\S]*?\];/)[0], ctx);
  vm.runInContext(app.match(/const MB_SET_LS = [^\n]*/)[0], ctx);
  vm.runInContext(app.match(/const MB_OLD_DAY = [^\n]*/)[0], ctx);
  vm.runInContext(app.match(/const MB_OLD_ID = [^\n]*/)[0], ctx);
  ['mbSetTab', 'mbSetTabGo', 'mbOldSpans', 'mbOldCount', 'mbOldHtml', 'mbSpamOn',
   'mailSetHtml'].forEach(n =>
    vm.runInContext(sliceFn(app, 'function ' + n + '('), ctx));
  return ctx;
}

const c0 = draw();
const html = c0.mailSetHtml();

/* ══════ ①② 갈래 ══════ */

test('★★ 갈래 단추가 «다섯 개 다» 보인다 — 무엇이 있는지는 눌러 보지 않아도 알아야 한다', () => {
  /* ⚠ 「mstabs」(단추를 담는 줄)까지 세지 않게 <button 부터 본다 */
  const btns = (html.match(/<button class="mstab/g) || []).length;
  assert.equal(btns, 5, '갈래 단추가 ' + btns + '개입니다');
  ['① 보기', '② 보내기', '③ 푸른 분류', '④ 단축키', '⑤ 다음메일에서'].forEach(t =>
    assert.ok(html.indexOf(t) > 0, t + ' 단추가 없습니다'));
});

test('★★ 한 번에 «한 갈래»만 펼쳐진다 — 둘이 켜지면 갈래로 나눈 뜻이 없다', () => {
  ['1', '2', '3', '4', '5'].forEach(id => {
    const h = draw(id).mailSetHtml();
    const on = (h.match(/class="mspane on"/g) || []).length;
    assert.equal(on, 1, id + '번 갈래일 때 펼쳐진 것이 ' + on + '개입니다');
    const tabOn = (h.match(/class="mstab on"/g) || []).length;
    assert.equal(tabOn, 1, id + '번 갈래일 때 켜진 단추가 ' + tabOn + '개입니다');
  });
});

test('★★ 갈래마다 «제 내용»이 펼쳐진다 — 늘 같은 것이 열리면 갈래가 뜻이 없다', () => {
  /* 펼쳐진 칸(.mspane on) 안의 글만 떼어 본다 */
  const openPane = h => {
    const i = h.indexOf('class="mspane on"');
    const j = h.indexOf('class="mspane', i + 10);
    return h.slice(i, j > i ? j : h.length);
  };
  assert.match(openPane(draw('1').mailSetHtml()), /한 번에 몇 통씩/, '① 이 안 열립니다');
  assert.match(openPane(draw('2').mailSetHtml()), /보내는 주소/, '② 가 안 열립니다');
  assert.match(openPane(draw('3').mailSetHtml()), /옛 메일 더 있나/, '③ 이 안 열립니다');
  assert.match(openPane(draw('4').mailSetHtml()), /mskeys|단축키/, '④ 가 안 열립니다');
  assert.match(openPane(draw('5').mailSetHtml()), /다음메일에서 열기/, '⑤ 가 안 열립니다');
});

test('★ 펼쳐지지 않은 갈래는 «자리를 안 차지한다»', () => {
  const m = css.match(/\.mspane\{([^}]*)\}/);
  assert.ok(m, '갈래 칸 규칙(.mspane)이 없습니다');
  assert.match(m[1], /display:\s*none/, '안 고른 갈래가 그대로 보입니다');
  assert.match(css, /\.mspane\.on\{[^}]*display:\s*block/, '고른 갈래가 안 펼쳐집니다');
});

/* ══════ ③④ 고른 갈래를 담는 자리 ══════ */

test('★★ 고른 갈래는 «이 기계에만» 담는다 — 서버에 두면 폰에서 딴 갈래가 열린다', () => {
  const f = sliceFn(app, 'function mbSetTabGo(').replace(/\/\*[\s\S]*?\*\//g, ' ');
  assert.match(f, /localStorage\.setItem/, '기계에 안 담습니다');
  assert.ok(!/firebase|database\(\)|\.ref\(/.test(f), '서버에 올리고 있습니다');
});

test('★★ 모르는 값이면 «첫 갈래»로 — 안 그러면 아무 갈래도 안 켜져 화면이 빈다', () => {
  ['', '9', 'zzz', null].forEach(v => {
    const c = draw(v);
    assert.equal(c.mbSetTab(), '1', JSON.stringify(v) + ' 일 때 ' + c.mbSetTab() + ' 이 나옵니다');
  });
});

test('★ 눌러 두면 «다음에 들어와도» 그 갈래로 열린다', () => {
  const c = draw();
  c.mbSetTabGo('4');
  assert.equal(c.mbSetTab(), '4', '누른 갈래가 안 켜집니다');
  /* 기계에 적혔나 — state 를 비워도 살아남아야 한다 */
  c.state.mbSetTab = '';
  assert.equal(c.mbSetTab(), '4', '다시 들어오면 첫 갈래로 돌아갑니다');
});

/* ══════ ⑤⑥⑦ 오던 길에서 지키기로 한 것 ══════ */

test('★★ 820px 대못을 다시 박지 않는다 — 그것이 오른쪽 절반을 비워 두던 까닭이다', () => {
  const m = css.match(/\.mspane\{([^}]*)\}/)[1];
  assert.ok(!/max-width:\s*820px/.test(m), '820px 대못이 돌아왔습니다');
  const cap = Number((m.match(/max-width:\s*(\d+)px/) || [])[1] || 0);
  assert.ok(!cap || cap >= 1000, '폭(' + cap + 'px)이 좁아 예전처럼 아래로만 길어집니다');
});

test('★★ 옮기면서 손잡이를 «하나도» 잃지 않았다', () => {
  ['mbSetPageSize', 'mbPreviewSet', 'openWhoPage', 'mbOldProbe', 'openMailPage',
   'mail.daum.net/setting/Imap'].forEach(k =>
    assert.ok(html.indexOf(k) > 0, k + ' 이(가) 사라졌습니다'));
  const links = (html.match(/다음메일에서 열기/g) || []).length;
  assert.ok(links >= 6, '다음메일로 가는 길이 ' + links + '개뿐입니다');
});

test('★★ 열고 닫은 <div> 짝이 맞는다 — 하나만 흘려도 화면이 통째로 어긋난다', () => {
  const open = (html.match(/<div\b/g) || []).length;
  const close = (html.match(/<\/div>/g) || []).length;
  assert.equal(open, close, '<div> ' + open + '개를 열고 ' + close + '개를 닫았습니다');
});

test('★ ⑤ 다음메일 갈래는 두 칸으로 편다 — 「열기 ↗」 한 줄짜리 여섯이라', () => {
  assert.match(html, /class="msin"/, '⑤ 를 두 칸으로 안 폅니다');
  const m = css.match(/\.msin\{([^}]*)\}/);
  assert.ok(m, '두 칸 규칙(.msin)이 없습니다');
  assert.match(m[1], /auto-fit/, '칸 수를 못 박았습니다 — 좁은 화면에서 글자가 뭉갭니다');
});
