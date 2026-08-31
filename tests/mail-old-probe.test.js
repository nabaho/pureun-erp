/* 「옛 메일이 더 있나」 두드려 보기 (대표 물음 2026-08-31)
   "과거자료가 더 들어왔으면 좋겠는데 그건 안되나?"

   ★ 다음메일 IMAP 은 폴더마다 «최근 400통»만 목록으로 내준다(실측 2026-08-28).
     설정에 「동기화 범위」 칸도 없다(2026-08-31 확인). 남은 물음은 하나 —
     그 400 이 «찾기»에도 걸리는가. 안 걸린다면 옛 메일을 저절로 끌어올 수 있고,
     대표께서 수천 통을 손으로 옮기실 까닭이 없어진다.

   지키는 것.
   ① 견주기 «전»에 그 칸을 다 펼친다 — 이 검사에서 가장 틀리기 쉬운 자리다.
      100통만 든 채로 견주면 «받아 두지 않았을 뿐인» 번호가 죄다 「모르는 것」이 되어
      있지도 않은 희소식을 만든다.
   ② 우리가 «든 것»과 견준다 — 다음이 준 번호를 그냥 세면 늘 옛 메일이 있다고 한다.
   ③ 읽기만 한다 — 다음메일도 우리 DB 도 한 글자도 안 고친다.
   ④ 찾는 말은 «칸에서 그때» 읽는다 — 글자마다 다시 그리면 한글 조합이 끊긴다.
   ⑤ 두 번 눌러도 두 번 묻지 않는다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { sliceFn } = require('./fnslice.js');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'pu-cards.html'), 'utf8');

const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };

/* 다음메일이 짚어 준 번호 / 우리가 든 번호 */
function boot(o) {
  const opt = o || {};
  const asked = [];
  const loaded = [];
  const toasts = [];
  const ctx = {
    Object, Number, Math, String, JSON, Promise, Date, Array,
    console,
    MB_FN: 'https://fn/',
    _mbMsgs: {},
    _mbProbe: null,
    _mbProbing: false,
    esc: s => String(s == null ? '' : s),
    toast: (m) => { toasts.push(String(m)); },
    renderMailPage() {},
    /* 손에 든 줄 — n===0 이면 「다 달라」는 뜻이다 */
    loadMailBox(slug, n, cb) {
      loaded.push({ slug, n });
      const all = opt.mine || [];
      const box = {};
      /* 「다 달라」가 아니면 뒤에서 두 개만 준다 — 진짜 화면이 그렇게 군다 */
      (Number(n) === 0 ? all : all.slice(-2)).forEach(u => { box[String(u)] = { u }; });
      ctx._mbMsgs[slug] = box;
      if (cb) cb();
    },
    $: (id) => (id === 'mbProbeQ' ? { value: opt.q === undefined ? '엠쓰리' : opt.q } : null),
    firebase: { auth: () => ({ currentUser: opt.noUser ? null : { getIdToken: () => Promise.resolve('tok') } }) },
    fetch(url, init) {
      const body = JSON.parse((init && init.body) || '{}');
      asked.push({ url, body });
      if (opt.serverBad) return Promise.resolve({ json: () => Promise.resolve({ ok: false, error: '못 했습니다' }) });
      /* ⚠ «물어본 그 칸»으로 돌려준다 — 붙임틀이 칸 이름을 박아 두면, 코드가 엉뚱한
           칸을 두드려도 검사가 통과한다(처음에 그래서 헛통과할 뻔했다). */
      const hit = {};
      if ((opt.theirs || []).length) hit[(body.slugs || [])[0]] = opt.theirs;
      return Promise.resolve({ json: () => Promise.resolve({ ok: true, hit }) });
    },
    mbFolders: () => opt.folders || [
      { slug: 'big', name: '1.자문사답변', kind: 'user', total: 406, path: 'x' },
      { slug: 'inb', name: '받은메일함', kind: 'inbox', total: 411, path: 'y' },
      { slug: 'bin', name: '휴지통', kind: 'trash', total: 9000, path: 'z' }
    ],
    mbFolderBy: (s) => (ctx.mbFolders().filter(f => f.slug === s)[0] || null),
    mbFolderLabel: (f) => (f && (f.name || f.path)) || '',
    asked, loaded, toasts
  };
  vm.createContext(ctx);
  ['mbProbeSlug', 'mbProbeTell', 'mbOldProbe'].forEach(n =>
    vm.runInContext(sliceFn(app, 'function ' + n + '('), ctx));
  return ctx;
}

/* ══════ ① 견주기 전에 다 펼친다 (가장 틀리기 쉬운 자리) ══════ */

test('★★ 견주기 «전»에 그 칸을 다 펼친다 — 안 그러면 있지도 않은 옛 메일을 알린다', async () => {
  /* 다음이 짚어 준 다섯 통을 우리가 «이미 다» 들고 있다. 그런데 손에 두 통만 든 채로
     견주면 세 통이 「우리가 못 가져온 것」으로 세어진다 — 새빨간 거짓말이다. */
  const c = boot({ mine: [11, 12, 13, 14, 15], theirs: [11, 12, 13, 14, 15] });
  c.mbOldProbe();
  await flush();
  assert.equal(c.loaded.length, 1, '칸을 안 펼쳤습니다');
  assert.equal(c.loaded[0].n, 0,
    '손에 든 것만으로 견줍니다 — 받아 두지 않았을 뿐인 번호가 「못 가져온 것」이 됩니다');
  assert.equal(c._mbProbe.unknown, 0,
    '이미 든 메일을 「못 가져왔다」고 합니다: ' + JSON.stringify(c._mbProbe));
});

test('★★ 우리가 «든 것»과 견준다 — 다음이 준 수를 그냥 세면 늘 옛 메일이 있다고 한다', async () => {
  const c = boot({ mine: [30, 31, 32], theirs: [7, 8, 30, 31, 32] });
  c.mbOldProbe();
  await flush();
  assert.equal(c._mbProbe.theirs, 5);
  assert.equal(c._mbProbe.unknown, 2, '못 가져온 옛 메일을 못 셉니다');
  assert.equal(c._mbProbe.theirLow, 7, '다음이 준 가장 옛 번호가 틀립니다');
  assert.equal(c._mbProbe.ourLow, 30, '우리가 든 가장 옛 번호가 틀립니다');
});

/* ══════ ③ 읽기만 한다 ══════ */

test('★★ 다음메일도 우리 DB 도 «한 글자도» 안 고친다', () => {
  const f = sliceFn(app, 'function mbOldProbe(').replace(/\/\*[\s\S]*?\*\//g, ' ');
  ['.set(', '.update(', '.remove(', '.push('].forEach(bad =>
    assert.ok(f.indexOf(bad) < 0, '무언가를 고치고 있습니다: ' + bad));
  assert.ok(/searchMailbox/.test(f), '찾기(읽기)를 안 부릅니다');
  ['moveMail', 'flagMail', 'deleteMail', 'pullMailbox'].forEach(bad =>
    assert.ok(f.indexOf(bad) < 0, '읽기 말고 딴 것을 부릅니다: ' + bad));
});

test('★ 한 칸만 물어본다 — 서른세 칸을 다 뒤지면 대표께서 몇 분을 기다리신다', async () => {
  const c = boot({ mine: [1], theirs: [1] });
  c.mbOldProbe();
  await flush();
  assert.equal(c.asked.length, 1);
  assert.deepEqual(Array.from(c.asked[0].body.slugs || []), [c.mbProbeSlug()],
    '칸을 안 좁혔습니다: ' + JSON.stringify(c.asked[0].body));
});

/* ══════ 어느 칸을 두드리나 ══════ */

test('★ 「모두 몇 통」이 가장 많은 칸을 두드린다 — 거기가 400 에 부딪혔을 자리다', () => {
  assert.equal(boot().mbProbeSlug(), 'inb');
});

test('★★ 휴지통·스팸은 안 두드린다 — 애초에 안 가져오는 칸이라 견줄 것이 없다', () => {
  /* 휴지통이 9,000통으로 가장 크다. 안 거르면 늘 휴지통이 뽑힌다. */
  const c = boot();
  assert.notEqual(c.mbProbeSlug(), 'bin', '휴지통을 두드립니다 — 우리는 그 칸을 안 가져옵니다');
});

test('칸이 하나도 없으면 조용히 멈춘다', async () => {
  const c = boot({ folders: [] });
  c.mbOldProbe();
  await flush();
  assert.equal(c.asked.length, 0);
  assert.equal(c._mbProbing, false, '누른 채로 굳었습니다');
});

/* ══════ ④⑤ 손놀림 ══════ */

test('★★ 찾는 말은 «칸에서 그때» 읽는다 — 글자마다 다시 그리면 한글 조합이 끊긴다', () => {
  const f = sliceFn(app, 'function mbOldProbe(').replace(/\/\*[\s\S]*?\*\//g, ' ');
  assert.ok(/\$\('mbProbeQ'\)/.test(f), '누를 때 칸에서 읽지 않습니다');
  assert.ok(!/oninput/.test(f), '글자마다 무언가를 합니다 — 조합이 끊깁니다');
});

test('★ 한 글자면 안 묻는다 — 거의 전부가 걸려 뜻이 없고 서버만 오래 붙잡는다', async () => {
  const c = boot({ q: '가' });
  c.mbOldProbe();
  await flush();
  assert.equal(c.asked.length, 0, '한 글자로 물었습니다');
  assert.ok(c.toasts.join(' ').indexOf('두 글자') >= 0, '왜 안 되는지 안 알려 줍니다');
});

test('★★ 두 번 눌러도 두 번 묻지 않는다', async () => {
  const c = boot({ mine: [1], theirs: [1] });
  c.mbOldProbe();
  c.mbOldProbe();
  await flush();
  assert.equal(c.asked.length, 1, '누를 때마다 서버에 붙습니다: ' + c.asked.length + '번');
});

test('★ 물어보다 실패해도 단추가 «풀린다» — 안 풀면 다시 눌러 볼 수도 없다', async () => {
  const c = boot({ mine: [1], theirs: [1], serverBad: true });
  c.mbOldProbe();
  await flush();
  assert.equal(c._mbProbing, false, '누른 채로 굳었습니다');
  assert.ok(c.toasts.join(' ').indexOf('못') >= 0, '왜 안 됐는지 안 알려 줍니다');
});

/* ══════ 알아낸 것을 사람 말로 ══════ */

test('★★ 셋을 «갈라» 말한다 — 숫자만 내놓으면 어떻게 하라는 것인지 모른다', async () => {
  const none = boot();
  assert.match(none.mbProbeTell(), /알아봅니다|고치지/, '아직 안 눌렀을 때 안내가 없습니다');

  const good = boot({ mine: [30], theirs: [7, 30] });
  good.mbOldProbe(); await flush();
  assert.match(good.mbProbeTell(), /옛 메일이 더 있습니다/, '희소식을 안 알립니다');
  assert.match(good.mbProbeTell(), /저절로/, '그래서 어떻게 되는지 안 알려 줍니다');

  const same = boot({ mine: [30, 31], theirs: [30, 31] });
  same.mbOldProbe(); await flush();
  assert.match(same.mbProbeTell(), /폴더를 갈라/,
    '옛 메일이 없을 때 «그럼 어떻게 하나»를 안 알려 줍니다');

  const zero = boot({ mine: [30], theirs: [] });
  zero.mbOldProbe(); await flush();
  assert.match(zero.mbProbeTell(), /찾은 것이 없습니다/, '한 통도 못 찾았을 때를 안 가릅니다');
});

/* 붙어 있는 자리 */
test('★ 환경설정 화면에 단추와 적는 칸이 있다', () => {
  const s = sliceFn(app, 'function mailSetHtml(');
  assert.ok(/mbOldProbe\(\)/.test(s), '단추가 없습니다 — 부를 길이 없습니다');
  assert.ok(/id="mbProbeQ"/.test(s), '찾는 말을 적을 칸이 없습니다');
  assert.ok(/mbProbeTell\(\)/.test(s), '알아낸 것을 화면에 안 적습니다');
});
