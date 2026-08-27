'use strict';
/* 사진첩 전체 검토에서 나온 것 셋 — 대표 지시 2026-08-25 「사진첩 지금까지 코딩된거 검토」

   ① **명함 뒷면에서 「기업정보함으로 보내기」를 누르면 영영 안 끝났다.**
      보내는 함수는 「뒷면은 앞면에 얹혀 간다」로 옳게 막는데, 화면은 종류만 보고
      단추를 그렸다. 누르면 「보내는 중…」으로 바뀐 뒤 보내는 함수가 조용히
      되돌아가고, 단추를 되살리는 것은 화면 다시 그리기뿐인데 그것이 안 불렸다.
      다른 사진에 갔다 와야 풀리는, 사람이 알 길 없는 막다른 길이었다.
      2026-08-05 「지우기 눌렀는데 안된다」와 같은 모양이다.
      → 막는 쪽과 보여 주는 쪽이 **같은 기준 하나**를 보게 하고,
        잠그기 전에 **먼저 묻는다**.

   ② **PDF 읽는 도구를 바깥 서버에서만 받아 왔다.** 그 주소가 막히면 — 관공서·큰
      기업 방화벽이 흔히 막는다 — PDF 판독이 통째로 멎는다. 저장소에 같은 판이
      이미 있었고 취업규칙·급여자료함은 그것을 쓰고 있었다.
      → 우리 사본을 먼저, 안 되면 바깥으로 물러선다.

   실행: node --test tests/*.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { cutFn } = require('./cut-fn');

const R = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(R, 'pu-photos.html'), 'utf8');

function fnOf(name) {
  const s = cutFn(app, 'function ' + name + '(');
  assert.ok(s, name + ' 를 찾지 못했습니다');
  return s;
}

/* ══════════ ① 뒷면 막다른 길 ══════════ */

/* 판정하는 함수들을 **실제로 돌린다** — 「낱말이 있나」로는 무엇이 막히는지 못 잡는다 */
function gates() {
  const ctx = { CARD_KINDS: { card: 1, bizreg: 1 } };
  vm.createContext(ctx);
  vm.runInContext(fnOf('canSend') + '\n' + fnOf('isCardBack') + '\n' + fnOf('canSendCards'), ctx);
  return ctx;
}
const CARD = { kind: 'card', fields: {} };
const front = { id: 'f1', meta: { read: CARD } };
const back = { id: 'b1', meta: { read: CARD, cardBack: 'f1' } };

test('★ 뒷면은 보낼 수 없다 — 이것이 이번에 고친 막다른 길의 뿌리다', () => {
  const g = gates();
  assert.equal(g.canSendCards(front, CARD), true, '앞면은 보낼 수 있어야 한다');
  assert.equal(g.canSendCards(back, CARD), false,
    '★ 뒷면을 보낼 수 있다고 하면 「보내는 중…」에서 굳습니다');
  assert.equal(g.isCardBack(back), true);
  assert.equal(g.isCardBack(front), false);
});

test('판정이 이상한 값에도 안 넘어진다 — 여기서 터지면 크게 보기가 통째로 빈다', () => {
  const g = gates();
  [null, undefined, {}, { meta: null }].forEach(function (x) {
    assert.equal(g.isCardBack(x), false, JSON.stringify(x) + ' 에서 넘어졌습니다');
    assert.equal(g.canSendCards(x, CARD), true, '주인 없는 것은 뒷면이 아니다');
  });
  assert.equal(g.canSendCards(front, null), false, '판독이 없으면 못 보낸다');
  assert.equal(g.canSendCards(front, { kind: 'card', error: '읽기 실패' }), false);
  assert.equal(g.canSendCards(front, { kind: 'card', filed: { id: 'c9' } }), false, '이미 보냈다');
});

test('★ 화면이 «보내는 쪽과 같은 기준»으로 단추를 그린다', () => {
  const panel = fnOf('renderReadPanel');
  assert.ok(/canSendCards\(it, read\)/.test(panel),
    '★ 화면이 제 기준을 따로 쓰면 눌러도 아무 일이 없는 단추가 다시 생깁니다');
  /* 옛 조건이 남아 있으면 그 갈래로 단추가 또 새어 나온다 */
  assert.ok(!/CARD_KINDS\[read\.kind\] && !read\.error/.test(panel),
    '★ 옛 조건(종류만 보기)이 남아 있습니다 — 그 갈래로 뒷면이 다시 샙니다');
});

test('★ 뒷면이면 «왜 단추가 없는지» 말해 준다 — 조용히 비우면 고장으로 읽힌다', () => {
  const panel = fnOf('renderReadPanel');
  assert.ok(/isCardBack\(it\)/.test(panel), '뒷면 갈래가 없습니다');
  assert.ok(/뒷면/.test(panel), '★ 아무 말이 없으면 「왜 여기만 단추가 없지」가 됩니다');
  assert.ok(/앞면 보기/.test(panel), '앞면으로 건너갈 길이 없습니다');
});

test('★ 세 단추 모두 «잠그기 전에» 묻는다 — 잠그고 되돌아가면 굳는다', () => {
  [['sendCardsNow', 'canSendCards'],
   ['sendCompanyNow', 'canSendCo'],
   ['sendCoInfoNow', 'canSendCoInfo']].forEach(function (p) {
    const f = fnOf(p[0]);
    const ask = f.indexOf(p[1] + '(');
    const lock = f.indexOf('lockSendBtn');
    assert.ok(ask >= 0, '★ ' + p[0] + ' 가 «보낼 수 있는가»를 안 묻습니다');
    assert.ok(lock >= 0, p[0] + ' 가 공용 잠금을 안 씁니다');
    assert.ok(ask < lock, '★ ' + p[0] + ' — 먼저 잠그면 「보내는 중…」으로 굳습니다');
  });
});

test('잠그는 자리는 한 곳뿐이다 — 세 벌이 되면 한쪽만 고쳐진다', () => {
  const n = (app.match(/\.textContent = '보내는 중…'/g) || []).length;
  assert.equal(n, 1, '★ 「보내는 중…」으로 바꾸는 자리가 ' + n + '곳입니다');
  assert.match(fnOf('lockSendBtn'), /disabled = true/);
});

test('업체관리 단추도 «보낼 수 있을 때만» 나온다 — 같은 함정의 형제', () => {
  const panel = fnOf('renderReadPanel');
  assert.ok(!/CO_KINDS\[read\.kind\] && !read\.error/.test(panel),
    '★ 업체관리 갈래에 옛 조건이 남아 있습니다');
  assert.ok((panel.match(/canSendCo\(read\)/g) || []).length >= 2,
    '다시 보내기 갈래도 같은 기준을 봐야 합니다');
});

/* ══════════ ② PDF 도구를 우리 것부터 ══════════ */

/* 실제로 돌린다 — 어느 주소를 먼저 부르는지, 못 열면 어디로 물러서는지 본다.
   fail = 이 주소를 부르면 실패한 것으로 친다. */
function runLoad(fail) {
  const tried = [];
  const ctx = {
    window: {},
    Error, Promise, console: { warn() {} },
    document: {
      head: { appendChild(s) {
        setTimeout(function () {
          if (fail && s.src.indexOf(fail) >= 0) { s.onerror(); return; }
          /* 열렸다 — 도구가 자리에 앉는다 */
          ctx.window.pdfjsLib = ctx.window.pdfjsLib || { GlobalWorkerOptions: {} };
          s.onload();
        }, 0);
      } },
      createElement() { const s = {}; return new Proxy(s, {
        set(t, k, v) { if (k === 'src') tried.push(v); t[k] = v; return true; } }); },
    },
  };
  vm.createContext(ctx);
  vm.runInContext(
    app.match(/const PDF_LIB_HERE[\s\S]*?\n(?=async function pdfToPages)/)[0], ctx);
  return ctx.loadPdfLib().then(function () {
    return { tried: tried, worker: ctx.window.pdfjsLib.GlobalWorkerOptions.workerSrc };
  }, function (e) { return { tried: tried, err: e.message }; });
}

test('★ 우리 사본을 «먼저» 쓴다 — 바깥이 막히면 판독이 통째로 멎던 것', async () => {
  const r = await runLoad(null);
  assert.ok(r.tried.length, '아무것도 안 불렀습니다');
  assert.ok(r.tried[0].indexOf('vendor/') === 0,
    '★ 처음 부른 것이 「' + r.tried[0] + '」입니다 — 우리 사본이어야 합니다');
  assert.ok(!r.tried.some(function (t) { return t.indexOf('http') === 0; }),
    '★ 우리 사본이 열렸는데 바깥까지 불렀습니다');
  assert.ok(r.worker.indexOf('vendor/') === 0, '★ 일꾼도 같은 자리에서 받아야 합니다: ' + r.worker);
});

test('★ 우리 사본이 안 열리면 바깥으로 물러선다 — 못 여는 것이 제일 나쁘다', async () => {
  const r = await runLoad('vendor/');
  assert.equal(r.tried.length, 2, '한 번만 해 보고 포기했습니다');
  assert.ok(r.tried[1].indexOf('https://') === 0, '바깥으로 안 물러섰습니다');
  assert.ok(!r.err, '물러섰는데도 실패로 끝났습니다: ' + r.err);
  assert.ok(r.worker.indexOf('https://') === 0,
    '★ 본체는 바깥에서 받고 일꾼은 우리 것 — 판이 어긋나 조용히 빈 쪽이 나옵니다: ' + r.worker);
});

test('둘 다 안 열리면 «왜 안 되는지» 말한다 — 조용히 멎으면 못 찾는다', async () => {
  const r = await runLoad('pdf.min.js');
  assert.ok(r.err && /PDF/.test(r.err), '★ 알아들을 말이 없습니다: ' + r.err);
});

/* ══════════ ②-2 묶는 도구(jszip)도 우리 것부터 — 대표 지시 2026-08-25 ══════════
   PDF 와 같은 까닭이다. 바깥이 막히면 「여러 장 내려받기」가 통째로 멎는다.
   ⚠ 저장소에 넣은 사본은 바깥에서 새로 받은 것이 아니라, 정부사업일정 화면에
      이미 통째로 박혀 돌고 있던 그 판을 꺼내 파일로 옮긴 것이다. */

function runZip(fail) {
  const tried = [];
  const ctx = {
    window: {}, Error, Promise, console: { warn() {} },
    document: {
      head: { appendChild(s) {
        setTimeout(function () {
          if (fail && s.src.indexOf(fail) >= 0) { s.onerror(); return; }
          ctx.window.JSZip = ctx.window.JSZip || function () {};
          s.onload();
        }, 0);
      } },
      createElement() { return new Proxy({}, {
        set(t, k, v) { if (k === 'src') tried.push(v); t[k] = v; return true; } }); },
    },
  };
  vm.createContext(ctx);
  vm.runInContext(fnOf('loadScriptOnce') + '\n' +
    app.match(/const ZIP_LIB_HERE[\s\S]*?\n\}/)[0], ctx);
  return ctx.loadZipLib().then(
    function () { return { tried: tried }; },
    function (e) { return { tried: tried, err: e.message }; });
}

test('★ 묶는 도구도 우리 사본을 먼저 쓴다', async () => {
  const r = await runZip(null);
  assert.ok(r.tried.length, '아무것도 안 불렀습니다');
  assert.ok(r.tried[0].indexOf('vendor/') === 0,
    '★ 처음 부른 것이 「' + r.tried[0] + '」입니다 — 우리 사본이어야 합니다');
  assert.equal(r.tried.length, 1, '★ 우리 사본이 열렸는데 바깥까지 불렀습니다');
});

test('★ 묶는 도구도 안 열리면 바깥으로 물러선다', async () => {
  const r = await runZip('vendor/');
  assert.equal(r.tried.length, 2, '한 번만 해 보고 포기했습니다');
  assert.ok(r.tried[1].indexOf('https://') === 0, '바깥으로 안 물러섰습니다');
  assert.ok(!r.err, '물러섰는데도 실패로 끝났습니다: ' + r.err);
});

test('묶는 도구도 둘 다 안 열리면 말해 준다', async () => {
  const r = await runZip('jszip');
  assert.ok(r.err && /묶는 도구/.test(r.err), '★ 알아들을 말이 없습니다: ' + r.err);
});

/* 화면이 «부르는 그 주소»를 읽는다 — 손으로 적으면 오타를 못 잡는다.
   ⚠ 실제로 겪었다: 주소를 vendor/jszip.js 로 슬쩍 바꿔 봤더니 검사가 통과했다.
     「vendor 로 시작하는가」만 보고 있었던 탓이다. 있는 파일인지까지 봐야 한다. */
function herePath(name) {
  const m = app.match(new RegExp('const ' + name + " = '([^']+)'"));
  assert.ok(m, name + ' 를 찾지 못했습니다');
  return m[1];
}

test('★ 화면이 부르는 사본이 «저장소에 실제로 있다» — 오타 하나면 늘 바깥으로 샌다', () => {
  ['PDF_LIB_HERE', 'PDF_WORKER_HERE', 'ZIP_LIB_HERE'].forEach(function (n) {
    const p = herePath(n);
    assert.ok(fs.existsSync(path.join(R, p)),
      '★ ' + n + ' 가 「' + p + '」를 부르는데 그런 파일이 없습니다 — 늘 바깥으로 물러섭니다');
  });
});

test('★ 묶는 도구 사본이 «진짜로 도는 물건»이다 — 판·묶기·풀기까지 본다', async () => {
  const src = fs.readFileSync(path.join(R, herePath('ZIP_LIB_HERE')), 'utf8');
  /* 브라우저인 척 넘겨 준다 — UMD 가 거기에 자기를 매단다 */
  const win = {}, slf = {};
  new Function('window', 'self', src)(win, slf);
  const Z = win.JSZip || slf.JSZip;
  assert.equal(typeof Z, 'function', '★ 사본이 켜지지 않습니다');
  const cdn = (app.match(/jszip\/([\d.]+)\/jszip\.min\.js/) || [])[1];
  assert.equal(Z.version, cdn,
    '★ 사본(' + Z.version + ')과 물러설 바깥 것(' + cdn + ')의 판이 다릅니다');
  /* 켜지기만 하고 안 돌아가면 소용없다 — 한글을 넣어 묶었다 풀어 본다 */
  const z = new Z();
  z.file('시험.txt', '푸른노무법인');
  const buf = await z.generateAsync({ type: 'nodebuffer' });
  assert.equal(buf.slice(0, 2).toString(), 'PK', '★ zip 이 아닙니다');
  const back = await (await Z.loadAsync(buf)).file('시험.txt').async('string');
  assert.equal(back, '푸른노무법인', '★ 풀어 보니 내용이 다릅니다');
});

test('★ PDF 사본이 바깥 것과 «같은 판»이다 — 물러설 때 조용히 어긋나면 안 된다', () => {
  const here = fs.readFileSync(path.join(R, herePath('PDF_LIB_HERE')), 'utf8');
  const cdn = (app.match(/pdf\.js\/([\d.]+)\/pdf\.min\.js/) || [])[1];
  assert.ok(cdn, '물러설 바깥 주소를 찾지 못했습니다');
  assert.ok(here.indexOf(cdn) >= 0,
    '★ 저장소 사본과 바깥 것의 판이 다릅니다(바깥 ' + cdn + ') — 물러설 때 조용히 어긋납니다');
});
