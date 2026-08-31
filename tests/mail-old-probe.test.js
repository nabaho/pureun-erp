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

/* 다음메일이 짚어 준 번호(칸마다) / 우리가 든 번호(칸마다) */
function boot(o) {
  const opt = o || {};
  const asked = [];
  const loaded = [];
  const toasts = [];
  const mine = opt.mine || {};      /* {slug:[uid…]} — 우리가 든 것 */
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
      const all = mine[slug] || [];
      const box = {};
      /* 「다 달라」가 아니면 뒤에서 하나만 준다 — 진짜 화면이 그렇게 군다 */
      (Number(n) === 0 ? all : all.slice(-1)).forEach(u => { box[String(u)] = { u }; });
      ctx._mbMsgs[slug] = box;
      if (cb) cb();
    },
    $: (id) => (id === 'mbProbeQ' ? { value: opt.q === undefined ? '맘스터치' : opt.q } : null),
    firebase: { auth: () => ({ currentUser: opt.noUser ? null : { getIdToken: () => Promise.resolve('tok') } }) },
    fetch(url, init) {
      const body = JSON.parse((init && init.body) || '{}');
      asked.push({ url, body });
      if (opt.serverBad) return Promise.resolve({ json: () => Promise.resolve({ ok: false, error: '못 했습니다' }) });
      /* 영문 낱말로 다시 물을 때 — 「찾기 자체가 도나」를 흉내 낸다 */
      if (body.q === 'kr') return Promise.resolve({ json: () => Promise.resolve({
        ok: true, hit: {}, n: Number(opt.asciiN || 0), bad: [] }) });
      if ((opt.badBoxes || []).length) return Promise.resolve({ json: () => Promise.resolve({
        ok: true, hit: {}, n: 0, bad: opt.badBoxes }) });
      /* ⚠ 서버는 «칸을 안 좁혔을 때» 아는 칸 전부를 뒤진다. 붙임틀이 그것을 흉내 내야
           「한 칸만 두드리는」 코드가 조용히 통과하지 않는다 — 대표께서 실제로 그 탓에
           「찾은 것이 없습니다」를 보셨다(2026-08-31). */
      const all = opt.theirs || {};
      const want = (body.slugs && body.slugs.length) ? body.slugs : Object.keys(all);
      const hit = {};
      want.forEach(s => { if ((all[s] || []).length) hit[s] = all[s]; });
      return Promise.resolve({ json: () => Promise.resolve({ ok: true, hit }) });
    },
    mbFolders: () => opt.folders || [
      { slug: 'big', name: '1.자문사답변', kind: 'user', total: 406, path: 'x' },
      { slug: 'inb', name: '받은메일함', kind: 'inbox', total: 411, path: 'y' }
    ],
    mbFolderBy: (s) => (ctx.mbFolders().filter(f => f.slug === s)[0] || null),
    mbFolderLabel: (f) => (f && (f.name || f.path)) || '',
    asked, loaded, toasts
  };
  vm.createContext(ctx);
  vm.runInContext(app.match(/const MB_PROBE_ASCII\s*=[^;]*;/)[0], ctx);
  ['mbProbeAsk', 'mbProbeTell', 'mbOldProbe'].forEach(n =>
    vm.runInContext(sliceFn(app, 'function ' + n + '('), ctx));
  return ctx;
}

/* ══════ ★ 모든 칸을 뒤진다 (대표께서 실제로 헛답을 보신 자리) ══════ */

test('★★ 「맘스터치」가 업무 칸에 있어도 찾아낸다 — 한 칸만 두드리면 헛답이 나온다', async () => {
  /* 2026-08-31 실제로 그랬다 — 가장 큰 칸(받은메일함) 하나만 두드려
     「찾은 것이 없습니다」가 나왔는데, 그 회사 메일은 업무 칸에 있었다.
     「답이 안 나온 것」을 「옛 메일이 없다」로 읽는 것이 이 물음에서 가장 나쁜 틀림이다. */
  const c = boot({ mine: { big: [30] }, theirs: { big: [7, 8, 30] } });
  c.mbOldProbe();
  await flush();
  assert.equal(c.asked.length, 1, '서버에 안 물었습니다');
  assert.ok(!(c.asked[0].body.slugs || []).length,
    '칸을 좁혀 물었습니다 — 그 칸에 없으면 「없다」는 헛답이 나옵니다: '
    + JSON.stringify(c.asked[0].body));
  assert.equal(c._mbProbe.unknown, 2,
    '업무 칸의 옛 메일을 못 셉니다: ' + JSON.stringify(c._mbProbe));
});

test('★★ 걸린 칸을 «다» 세어 합친다 — 한 칸만 세면 나머지 옛 메일이 묻힌다', async () => {
  const c = boot({
    mine:   { big: [30], inb: [50, 51] },
    theirs: { big: [7, 30], inb: [40, 50, 51] }
  });
  c.mbOldProbe();
  await flush();
  assert.equal(c._mbProbe.boxes, 2, '걸린 칸 수가 틀립니다');
  assert.equal(c._mbProbe.theirs, 5, '짚어 준 통수가 틀립니다');
  assert.equal(c._mbProbe.unknown, 2, '못 가져온 통수가 틀립니다');
});

/* ══════ ① 견주기 전에 다 펼친다 (가장 틀리기 쉬운 자리) ══════ */

test('★★ 견주기 «전»에 그 칸을 다 펼친다 — 안 그러면 있지도 않은 옛 메일을 알린다', async () => {
  /* 다음이 짚어 준 다섯 통을 우리가 «이미 다» 들고 있다. 그런데 손에 한 통만 든 채로
     견주면 네 통이 「우리가 못 가져온 것」으로 세어진다 — 새빨간 거짓말이다. */
  const c = boot({ mine: { big: [11, 12, 13, 14, 15] }, theirs: { big: [11, 12, 13, 14, 15] } });
  c.mbOldProbe();
  await flush();
  assert.ok(c.loaded.length >= 1, '칸을 안 펼쳤습니다');
  c.loaded.forEach(l => assert.equal(l.n, 0,
    '손에 든 것만으로 견줍니다 — 받아 두지 않았을 뿐인 번호가 「못 가져온 것」이 됩니다'));
  assert.equal(c._mbProbe.unknown, 0,
    '이미 든 메일을 「못 가져왔다」고 합니다: ' + JSON.stringify(c._mbProbe));
});

test('★★ 우리가 «든 것»과 견준다 — 다음이 준 수를 그냥 세면 늘 옛 메일이 있다고 한다', async () => {
  const c = boot({ mine: { big: [30, 31, 32] }, theirs: { big: [7, 8, 30, 31, 32] } });
  c.mbOldProbe();
  await flush();
  assert.equal(c._mbProbe.theirs, 5);
  assert.equal(c._mbProbe.unknown, 2, '못 가져온 옛 메일을 못 셉니다');
});

test('★★ «가장 많은 칸»을 짚어 준다 — 어디를 봐야 하는지 알려 줘야 한다', async () => {
  const c = boot({
    mine:   { big: [30], inb: [50] },
    theirs: { big: [1, 2, 3, 30], inb: [40, 50] }
  });
  c.mbOldProbe();
  await flush();
  assert.equal((c._mbProbe.top || {}).slug, 'big',
    '못 가져온 것이 가장 많은 칸을 안 짚습니다: ' + JSON.stringify(c._mbProbe.top));
  assert.match(c.mbProbeTell(), /1\.자문사답변/, '어느 칸인지 화면에 안 적습니다');
});

/* ══════ ③ 읽기만 한다 ══════ */

test('★★ 다음메일도 우리 DB 도 «한 글자도» 안 고친다', () => {
  /* ⚠ 묻는 일은 mbProbeAsk 로 떼어 냈다 — 둘을 «함께» 봐야 한다.
       한쪽만 보면 다른 쪽에 고치는 코드를 넣어도 그냥 지나간다. */
  const f = (sliceFn(app, 'function mbOldProbe(') + '\n' + sliceFn(app, 'function mbProbeAsk('))
    .replace(/\/\*[\s\S]*?\*\//g, ' ');
  ['.set(', '.update(', '.remove(', '.push('].forEach(bad =>
    assert.ok(f.indexOf(bad) < 0, '무언가를 고치고 있습니다: ' + bad));
  assert.ok(/searchMailbox/.test(f), '찾기(읽기)를 안 부릅니다');
  ['moveMail', 'flagMail', 'deleteMail', 'pullMailbox'].forEach(bad =>
    assert.ok(f.indexOf(bad) < 0, '읽기 말고 딴 것을 부릅니다: ' + bad));
});

test('★ 서버에 «한 번만» 붙는다 — 칸마다 따로 붙으면 서른세 번이 된다', async () => {
  const c = boot({ mine: { big: [1] }, theirs: { big: [1] } });
  c.mbOldProbe();
  await flush();
  assert.equal(c.asked.length, 1, '서버에 ' + c.asked.length + '번 붙었습니다');
});

test('한 칸도 안 걸리면 조용히 「없다」고 한다 — 굳지 않는다', async () => {
  const c = boot({ mine: { big: [1] }, theirs: {} });
  c.mbOldProbe();
  await flush();
  assert.equal(c._mbProbing, false, '누른 채로 굳었습니다');
  assert.equal(c._mbProbe.theirs, 0);
  assert.equal(c.loaded.length, 0, '걸린 칸이 없는데 칸을 펼쳤습니다');
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
  const c = boot({ mine: { big: [1] }, theirs: { big: [1] } });
  c.mbOldProbe();
  c.mbOldProbe();
  await flush();
  assert.equal(c.asked.length, 1, '누를 때마다 서버에 붙습니다: ' + c.asked.length + '번');
});

test('★ 물어보다 실패해도 단추가 «풀린다» — 안 풀면 다시 눌러 볼 수도 없다', async () => {
  const c = boot({ mine: { big: [1] }, theirs: { big: [1] }, serverBad: true });
  c.mbOldProbe();
  await flush();
  assert.equal(c._mbProbing, false, '누른 채로 굳었습니다');
  assert.ok(c.toasts.join(' ').indexOf('못') >= 0, '왜 안 됐는지 안 알려 줍니다');
});

/* ══════ 알아낸 것을 사람 말로 ══════ */

test('★★ 셋을 «갈라» 말한다 — 숫자만 내놓으면 어떻게 하라는 것인지 모른다', async () => {
  const none = boot();
  assert.match(none.mbProbeTell(), /알아봅니다|고치지/, '아직 안 눌렀을 때 안내가 없습니다');

  const good = boot({ mine: { big: [30] }, theirs: { big: [7, 30] } });
  good.mbOldProbe(); await flush();
  assert.match(good.mbProbeTell(), /옛 메일이 더 있습니다/, '희소식을 안 알립니다');
  assert.match(good.mbProbeTell(), /저절로/, '그래서 어떻게 되는지 안 알려 줍니다');

  const same = boot({ mine: { big: [30, 31] }, theirs: { big: [30, 31] } });
  same.mbOldProbe(); await flush();
  assert.match(same.mbProbeTell(), /폴더를 갈라/,
    '옛 메일이 없을 때 «그럼 어떻게 하나»를 안 알려 줍니다');

  /* ⚠ 「찾기는 도는데 그 말이 없다」를 재는 자리다 — 그래서 영문 낱말에는 걸리게 둔다.
       안 그러면 「찾기 자체가 안 된다」 갈래로 빠져 딴 것을 재게 된다. */
  const zero = boot({ mine: { big: [30] }, theirs: {}, asciiN: 100 });
  zero.mbOldProbe(); await flush();
  assert.match(zero.mbProbeTell(), /못 찾았습니다|찾은 것이 없습니다/,
    '한 통도 못 찾았을 때를 안 가릅니다');
});

test('★★ 알림(토스트)도 «셋을 가른다» — 대표께서 어긋난 알림을 보셨다', async () => {
  /* 2026-08-31 실제로 그랬다 — 화면에는 「찾은 것이 없습니다」인데 알림은
     「모두 우리가 이미 든 것입니다」였다. 둘이 다른 말을 하면 무엇을 믿을지 모른다. */
  const zero = boot({ mine: { big: [30] }, theirs: {}, asciiN: 100 });
  zero.mbOldProbe(); await flush();
  const t0 = zero.toasts.join(' ');
  assert.ok(t0.indexOf('찾지 못했습니다') >= 0,
    '한 통도 못 찾았는데 알림이 딴말을 합니다: ' + t0);
  assert.ok(t0.indexOf('이미 든 것') < 0, '못 찾았는데 「이미 든 것」이라 합니다: ' + t0);

  const same = boot({ mine: { big: [30, 31] }, theirs: { big: [30, 31] } });
  same.mbOldProbe(); await flush();
  assert.ok(same.toasts.join(' ').indexOf('이미 든 것') >= 0,
    '다 우리 것일 때 알림이 틀립니다: ' + same.toasts.join(' '));

  const good = boot({ mine: { big: [30] }, theirs: { big: [7, 30] } });
  good.mbOldProbe(); await flush();
  assert.ok(good.toasts.join(' ').indexOf('찾았습니다') >= 0,
    '옛 메일을 찾았는데 알림이 틀립니다: ' + good.toasts.join(' '));
});

/* ══════ 「없다」와 「못 읽었다」와 「찾기가 막혔다」를 가른다 (2026-08-31 실제 답) ══════
   대표께서 「맘스터치」로 누르시니 0통이 나왔다. 그런데 0통은 세 가지 뜻이 있다 —
   ①정말 없다 ②칸을 못 읽었다 ③찾기 자체가 막혔다(한글 찾기가 안 될 수 있다).
   셋을 못 가르면 대표를 «헛되이» 폴더 가르기로 보내게 된다. */

test('★★ 못 읽은 칸이 있으면 «먼저» 말한다 — 「없습니다」라고 하면 그것이 거짓말이다', async () => {
  const c = boot({ mine: {}, theirs: {}, badBoxes: ['big', 'inb', 'x1'] });
  c.mbOldProbe();
  await flush();
  assert.equal(c._mbProbe.bad, 3, '못 읽은 칸을 안 셉니다');
  assert.match(c.mbProbeTell(), /못 읽은 칸/, '못 읽은 칸을 화면에 안 알립니다');
  assert.ok(c.mbProbeTell().indexOf('찾은 것이 없습니다') < 0,
    '칸을 못 읽었는데 「없습니다」라고 합니다');
  assert.ok(c.toasts.join(' ').indexOf('믿으실 수 없습니다') >= 0,
    '알림이 「믿을 수 없다」를 안 말합니다: ' + c.toasts.join(' '));
});

test('★★ 한 통도 못 찾으면 «영문 낱말로 한 번 더» 물어 스스로 가른다', async () => {
  const c = boot({ mine: {}, theirs: {}, asciiN: 0 });
  c.mbOldProbe();
  await flush();
  assert.equal(c.asked.length, 2, '영문으로 다시 안 물었습니다: ' + c.asked.length + '번');
  assert.equal(c.asked[1].body.q, 'kr', '영문이 아닌 말로 다시 물었습니다');
  assert.ok(!/[가-힣]/.test(c.asked[1].body.q),
    '다시 묻는 말에 한글이 들어 있습니다 — 가리려는 것이 바로 한글 찾기입니다');
});

test('★★ 영문으로도 0통이면 «찾기 자체가 안 된다»고 말한다', async () => {
  const c = boot({ mine: {}, theirs: {}, asciiN: 0 });
  c.mbOldProbe();
  await flush();
  assert.match(c.mbProbeTell(), /찾기 자체가 안 됩니다/, '찾기가 막힌 것을 안 알립니다');
  assert.match(c.mbProbeTell(), /폴더를 갈라/, '그럼 어떻게 하나를 안 알려 줍니다');
  assert.ok(c.toasts.join(' ').indexOf('찾기 자체가 안 됩니다') >= 0, '알림이 틀립니다');
});

test('★★ 영문으로는 찾아지면 «찾기는 된다»고 말한다 — 그 말이 없을 뿐이다', async () => {
  const c = boot({ mine: {}, theirs: {}, asciiN: 3300 });
  c.mbOldProbe();
  await flush();
  assert.match(c.mbProbeTell(), /찾기는 됩니다/, '찾기가 도는 것을 안 알립니다');
  assert.match(c.mbProbeTell(), /3,300/, '몇 통 찾았는지 안 알려 줍니다');
  assert.match(c.mbProbeTell(), /맘스터치/, '무슨 말로 찾았는지 안 알려 줍니다');
});

test('★ 찾은 것이 있으면 «영문으로 다시 묻지 않는다» — 헛걸음이다', async () => {
  const c = boot({ mine: { big: [30] }, theirs: { big: [7, 30] } });
  c.mbOldProbe();
  await flush();
  assert.equal(c.asked.length, 1, '찾았는데도 다시 물었습니다');
});

/* 붙어 있는 자리 */
test('★ 환경설정 화면에 단추와 적는 칸이 있다', () => {
  const s = sliceFn(app, 'function mailSetHtml(');
  assert.ok(/mbOldProbe\(\)/.test(s), '단추가 없습니다 — 부를 길이 없습니다');
  assert.ok(/id="mbProbeQ"/.test(s), '찾는 말을 적을 칸이 없습니다');
  assert.ok(/mbProbeTell\(\)/.test(s), '알아낸 것을 화면에 안 적습니다');
});
