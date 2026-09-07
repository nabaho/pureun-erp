'use strict';
/* 사진첩 — 계약서를 판독하기 전에 주민번호를 가린다 (보안 3건 계획 3단계)
   대표 지시 2026-08-17 「1부터 순서대로」, 목업 승인, 갈림길은 「가」로 결정.

   ■ 무엇이 문제였나
   판독을 누르면 **주민번호가 든 원본이 그대로 구글로 갔다.**

   ■ 대표가 고른 길 「가」 — 그리고 남는 구멍
   ⚠ **아직 안 읽은 서류는 계약서인지 모른다** — 종류를 정하는 것이 판독이라서다.
     그래서 자동 판독은 그대로 두고, 사람이 누를 수 있는 「🔒 가리고 판독」을 둔다.
     이미 계약서·근태표로 밝혀진 것은 **가림을 거치지 않으면 다시 못 읽는다.**
     이 검사는 그 두 가지를 못 박는다 — 구멍이 어디인지도 함께 적어 둔다.

   ■ 왜 실제로 돌려 보나
   「가린 사본만 나간다」는 글자로 확인이 안 된다. 원본을 함께 실어 보내도 낱말은
   그대로 남는다. 그래서 함수를 뽑아 **무엇이 판독기로 갔는지** 직접 본다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const R = path.join(__dirname, '..');
const { cutFn } = require('./cut-fn');
const app = fs.readFileSync(path.join(R, 'pu-photos.html'), 'utf8');

/* 주석을 걷어 낸다 — 주석에 적힌 낱말을 보고 통과하는 일이 이 저장소에서 잦았다. */
function code(s) { return String(s).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"\w])\/\/[^\n]*/g, '$1'); }

/* ══════ ① 공용 층이 실려 있고 «화면과 같은 방식»으로 붙는다 ══════ */
test('가림 층 배선', async (t) => {
  await t.test('★ 계산 층과 긋기 층을 둘 다 싣는다', () => {
    assert.match(app, /<script src="js\/pu-rrn-mask\.js\?v=\d+"><\/script>/,
      '계산 층이 없으면 사각형을 픽셀로 못 바꿉니다.');
    assert.match(app, /<script src="js\/pu-rrn-mask-ui\.js\?v=\d+"><\/script>/,
      '긋기 층이 없으면 사진 위를 그어도 아무 일이 없습니다.');
  });

  await t.test('★ 급여데이터함과 «같은 층»을 쓴다 — 복사본이 아니다', () => {
    /* 두 벌이 되면 한쪽만 고쳐진다. 가림은 틀리면 주민번호가 그대로 나가는 기능이다. */
    const pay = fs.readFileSync(path.join(R, 'pu-paydata.html'), 'utf8');
    assert.match(pay, /js\/pu-rrn-mask-ui\.js/, '급여데이터함이 공용 층을 안 씁니다.');
    const live = code(app);
    assert.doesNotMatch(live, /function maskFinishDrag\(/,
      '긋기를 사진첩에 복사했습니다 — 공용 층을 써야 합니다.');
    assert.doesNotMatch(live, /PuRrnMask\.maskToDataUrl\(/,
      '사본 만들기를 사진첩에 복사했습니다 — 공용 층(PuRrnMaskUi.maskedDataUrl)을 써야 합니다.');
  });

  await t.test('★ 손잡이를 창에 붙인다 — 화면 HTML 이 inline 으로 부른다', () => {
    ['maskDown', 'maskMove', 'maskUp', 'maskCancelDrag', 'maskDelBox', 'maskUndo', 'maskClear']
      .forEach(function (n) {
        assert.match(app, new RegExp('window\\.' + n + ' = PuRrnMaskUi\\.'),
          n + ' 를 안 붙이면 그 단추가 조용히 아무 일도 안 합니다.');
      });
  });
});

/* ══════ ② 가린 사본만 판독기로 간다 — 실제로 돌린다 ══════ */
function runReadPhoto(masked, opts) {
  opts = opts || {};
  const got = { read: [], loaded: 0 };
  const ctx = {
    console, Promise, JSON, Date, Object, Array, String, Number, Error, Math,
    gridItems: [{ id: 'p1', meta: { kind: 'doc' } }],
    docPages: function () { return [{ id: 'p1', meta: { kind: 'doc' } }]; },
    photoYearOf: function () { return '2026'; },
    photoOwner: function () { return 'me'; },
    gridYear: '2026',
    viewerId: 'p1',
    safeSrc: function (v) { return v || ''; },
    renderReadPanel: function () { },
    canSend: function () { return false; },
    canSendCo: function () { return false; },
    /* ⚠ 2026-08-23: 판독을 마치면 기업 상세로도 «스스로» 보낸다. 여기 가짜가 없으면
       그 줄에서 ReferenceError 로 멎어 가림 판독 검사가 통째로 운다 — 이 검사가
       보는 것은 「사본만 판독기로 간다」이지 어디로 보내느냐가 아니다. */
    autoSendCoInfo: function () { return false; },
    sendCards: function () { return Promise.resolve(); },
    sendCompany: function () { return Promise.resolve(); },
    sendCoInfo: function () { return Promise.resolve(); },
    PuPhotoStore: {
      loadFull: function () { got.loaded++; return Promise.resolve(opts.full || 'data:image/jpeg;base64,ORIGINAL'); },
      photoYear: function () { return '2026'; },
      saveRead: function () { return Promise.resolve(); }
    },
    PuDocRead: {
      READ_VERSION: 9,
      read: function (imgs) { got.read.push(imgs); return Promise.resolve({ kind: 'contract', fields: {} }); },
      autoOk: function () { return { auto: false, why: '' }; }
    }
  };
  vm.createContext(ctx);
  /* ⚠ 2026-08-24: 판독이 여러 쪽을 «덩이»로 나눠 읽게 되어 readPhoto 가 덩이 층을
     거쳐 판독기를 부른다. 그 층을 함께 실어야 한다 — 안 실으면 그 줄에서
     ReferenceError 로 멎어 이 파일의 가림 검사가 통째로 운다(그렇게 한 번 걸렸다).
     지킬 것은 「사본만 판독기로 간다」이므로, 층을 진짜 것으로 실어 그대로 재 본다. */
  vm.runInContext([
    app.match(/^const READ_CHUNK_IMG = \d+;$/m)[0],
    app.match(/^const READ_CHUNK_TXT = \d+;$/m)[0],
    cutFn(app, 'function chunkOf('),
    cutFn(app, 'function mergeReads('),
    cutFn(app, 'function runReadChunks('),
    cutFn(app, 'function textChunkMakers('),
    cutFn(app, 'function imgChunkMakers('),
    cutFn(app, 'function docTextOf('),
    cutFn(app, 'function textOfOne('),
    app.match(/^const PDF_TEXT_MIN = \d+;$/m)[0],
    cutFn(app, 'function pdfTextUsable('),
    /* ⚠ 2026-08-24: 판독 결과에 실패 셈을 남긴다 — 안 실으면 그 줄에서
       ReferenceError 로 멎어 이 파일의 가림 검사가 통째로 운다(또 그렇게 걸렸다). */
    cutFn(app, 'function failCountOf('),
    /* ⚠ 2026-09-01 — 판독 뒤 근로자 정보함으로 스스로 보내는 줄이 붙었다.
       안 실으면 readPhoto 가 그 줄에서 ReferenceError 로 멎어 가림 검사가 통째로 운다. */
    app.match(/^const WORKER_KINDS = \{[^}]*\};/m)[0],
    cutFn(app, 'function canSendWorker('),
    /* ⚠ 2026-09-07 — 판독 결과가 「하루 몫을 다 썼다」인지 그 자리에서 본다(그러면
       자동 판독을 멈춘다). 안 실으면 readPhoto 가 그 줄에서 ReferenceError 로 멎어
       이 파일의 가림 검사가 통째로 운다 — 벌써 세 번째 같은 일이다.
       ⚠ 대역을 만들지 «않는다»: 진짜 것을 실으면 가림 길이 한도 판단을 건드리는지도
         함께 재게 된다. */
    'var readQuotaOut = false;',
    app.match(/^const READ_FAIL_RULES = \[[\s\S]*?^\];/m)[0],
    cutFn(app, 'function readFailKind('),
    cutFn(app, 'function readHoldIds('),
    cutFn(app, 'function renderReadAsk('),
    cutFn(app, 'function readQuotaWatch('),
    cutFn(app, 'function readPhoto('),
    'var __p = readPhoto("p1", ' +
      (masked === undefined ? 'undefined' : JSON.stringify(masked)) + ');'
  ].join('\n'), ctx);
  return ctx.__p.then(function () { return got; });
}

test('가린 사본만 판독기로 간다', async (t) => {
  await t.test('★ 사본을 주면 그것만 읽힌다 — 원본을 함께 보내지 않는다', async () => {
    const got = await runReadPhoto('data:image/jpeg;base64,MASKED');
    assert.deepEqual(got.read, ['data:image/jpeg;base64,MASKED'],
      '★ 원본이 함께 나갔습니다 — 가린 뜻이 없습니다: ' + JSON.stringify(got.read));
  });

  await t.test('★ 사본을 주면 창고에서 원본을 다시 받지 않는다', async () => {
    const got = await runReadPhoto('data:image/jpeg;base64,MASKED');
    assert.equal(got.loaded, 0, '가린 사본이 있는데 원본을 또 받았습니다.');
  });

  await t.test('사본이 없으면 예전처럼 원본을 읽는다 — 다른 서류는 그대로다', async () => {
    const got = await runReadPhoto(undefined);
    assert.deepEqual(got.read, ['data:image/jpeg;base64,ORIGINAL']);
    assert.equal(got.loaded, 1);
  });
});

/* ══════ ③ 이미 계약서로 밝혀진 것은 가림을 «반드시» 거친다 ══════ */
function runReadAgain(readKind) {
  const calls = [];
  const ctx = {
    console, Promise, Object, Error,
    viewerId: 'p1',
    gridItems: [{ id: 'p1', meta: { read: readKind ? { kind: readKind } : null } }],
    PuPhotoStore: {
      isSensitiveRead: function (r) { return !!(r && { contract: 1, timesheet: 1, payslip: 1 }[r.kind]); }
    },
    $: function () { return { innerHTML: '' }; },
    startPhotoMask: function () { calls.push('mask'); },
    readPhoto: function () { calls.push('read'); return Promise.resolve(); },
    renderGridBar: function () { }, renderGrid: function () { }, esc: String
  };
  vm.createContext(ctx);
  vm.runInContext(cutFn(app, 'function maskItem(') + '\n' + cutFn(app, 'function maskForced(') + '\n' +
    cutFn(app, 'function readAgain(') + '\nreadAgain();', ctx);
  return calls;
}

test('다시 판독', async (t) => {
  await t.test('★ 계약서는 «가림 화면»으로 간다 — 곧바로 안 읽는다', () => {
    assert.deepEqual(runReadAgain('contract'), ['mask'],
      '★ 「다시 판독」 한 번으로 주민번호가 그대로 나갑니다.');
  });

  await t.test('★ 근태표도 마찬가지', () => {
    assert.deepEqual(runReadAgain('timesheet'), ['mask']);
  });

  await t.test('회의사진·사업자등록증은 예전처럼 곧바로 읽는다', () => {
    assert.deepEqual(runReadAgain('bizreg'), ['read'], '민감하지 않은 것까지 한 단계가 늘면 안 됩니다.');
    assert.deepEqual(runReadAgain(null), ['read'], '아직 안 읽은 서류는 종류를 모릅니다 — 막으면 자동 분류가 죽습니다.');
  });
});

/* ══════ ④ 가림 화면 ══════ */
function panel(state) {
  const ctx = {
    console, Object, Array, String, Number, Math,
    photoMask: state,
    esc: function (s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  };
  vm.createContext(ctx);
  /* 2026-08-29: 짜임을 한 곳에서 만들게 갈랐다(옆 칸 · 큰 사진 위 두 자리에 쓰므로).
     시늉을 두지 않고 **진짜를 함께 띄운다** — 시늉이면 짜임이 바뀌어도 안 걸린다. */
  vm.runInContext(cutFn(app, 'function maskWrapHtml(') + '\n' +
    cutFn(app, 'function maskBoxesHtml(') + '\n' +
    cutFn(app, 'function maskPanelHtml(') + '\nvar __h = maskPanelHtml();', ctx);
  return ctx.__h;
}

test('가림 화면', async (t) => {
  await t.test('★ 사진과 긋는 판이 있다', () => {
    const h = panel({ status: 'ready', url: 'data:image/jpeg;base64,AAA', boxes: [] });
    assert.match(h, /id="maskWrap"/, '긋는 판이 없으면 어디를 칠할지 알 수 없습니다.');
    assert.match(h, /id="maskImg"/);
    assert.match(h, /id="maskPreview"/, '긋는 동안 보이는 칸이 없으면 어디까지 그었는지 모릅니다.');
  });

  await t.test('★ 사진을 브라우저가 끌어다 놓지 못하게 막는다 — 이것이 긋기를 가로챈다', () => {
    /* 2026-08-16 급여데이터함에서 실제로 겪은 문제다. */
    const h = panel({ status: 'ready', url: 'data:x', boxes: [] });
    assert.match(h, /<img id="maskImg"[^>]*draggable="false"/);
    assert.match(h, /ondragstart="return false"/);
  });

  await t.test('★ 끊겨도(pointercancel) 그은 것이 남게 이어져 있다', () => {
    const h = panel({ status: 'ready', url: 'data:x', boxes: [] });
    assert.match(h, /onpointercancel="maskCancelDrag\(\)"/,
      '끊기 처리가 없으면 데스크톱에서 그어도 칸이 안 생깁니다.');
  });

  await t.test('★ 「눈으로 훑어 달라」는 몇 곳을 가렸든 사라지지 않는다', () => {
    /* 마지막 판단은 사람이다 — 기계가 다 찾았다고 믿게 하면 안 된다. */
    [[], [{ x: .1, y: .1, w: .2, h: .1 }]].forEach(function (bs) {
      assert.match(panel({ status: 'ready', url: 'data:x', boxes: bs }), /눈으로 한 번 훑어/);
    });
  });

  await t.test('★ 가린 곳이 없어도 「그대로 판독」 길이 있다 — 주민번호 없는 계약서도 있다', () => {
    const h = panel({ status: 'ready', url: 'data:x', boxes: [] });
    assert.match(h, /가릴 것 없음 — 그대로 판독/);
    assert.match(h, /photoMaskConfirm\(\)/);
  });

  await t.test('가린 곳이 있으면 몇 군데인지 단추에 적힌다', () => {
    const h = panel({ status: 'ready', url: 'data:x', boxes: [{ x: .1, y: .1, w: .2, h: .1 }, { x: .3, y: .3, w: .1, h: .1 }] });
    assert.match(h, /2군데 가리고 판독/);
  });

  await t.test('★ 그만두는 길이 있다 — 가림을 그만두면 판독도 안 한다', () => {
    assert.match(panel({ status: 'ready', url: 'data:x', boxes: [] }), /photoMaskCancel\(\)/);
  });

  await t.test('★ 사진을 못 불러오면 까닭을 보여주고 판독으로 넘어가지 않는다', () => {
    const h = panel({ status: 'err', err: '사진 본문을 불러오지 못했습니다', boxes: [] });
    assert.match(h, /사진 본문을 불러오지 못했습니다/);
    assert.doesNotMatch(h, /photoMaskConfirm/, '못 불러왔는데 판독 단추가 있으면 원본이 나갑니다.');
  });

  await t.test('★ 사진 주소를 그대로 넣지 않는다', () => {
    const h = panel({ status: 'ready', url: 'data:x"><script>bad()</script>', boxes: [] });
    assert.doesNotMatch(h, /<script>bad/, '주소를 그대로 넣으면 화면이 깨집니다.');
  });
});

/* ══════ ⑤ 사본 만들기 실패는 «조용히 넘기지 않는다» ══════ */
test('★ 가린 사본을 못 만들면 원본을 보내지 않는다', () => {
  /* 이 갈래가 이 기능의 존재 이유다 — 가리려던 것을 못 가린 채 보내면 안 된다. */
  const body = code(cutFn(app, 'function photoMaskConfirm('));
  assert.match(body, /try \{[\s\S]*?PuRrnMaskUi\.maskedDataUrl\(\)/, '공용 층을 안 씁니다.');
  assert.match(body, /catch[\s\S]*?return;/, '못 만들었는데도 계속 갑니다.');
  /* 실패 갈래에서 readPhoto 를 부르면 안 된다 */
  const arm = body.slice(body.indexOf('catch'), body.indexOf('photoMask = PuRrnMaskUi.blank()'));
  assert.doesNotMatch(arm, /readPhoto\(/, '★ 못 가린 원본이 판독기로 갑니다.');
});

/* ══════ ⑥ 주민번호 «말고 다른 것»이 덮이면 안 된다 (대표 지시 2026-08-17) ══════
   계약기간·보수·상호까지 가려진 채로 읽히면 판독 결과가 비거나 **틀린 채로** 들어온다.
   없는 것보다 틀린 것이 나쁘다 — 아무도 의심하지 않으므로. */
function maskUi(boxes) {
  const src = fs.readFileSync(path.join(R, 'js', 'pu-rrn-mask-ui.js'), 'utf8');
  const ctx = { console, Math, Number, Object, Array, Promise, Error, String };
  ctx.window = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  const state = { status: 'ready', url: 'data:x', boxes: boxes || [], err: '', autoNote: '' };
  ctx.PuRrnMaskUi.init({ state: function () { return state; }, render: function () { } });
  return ctx.PuRrnMaskUi;
}

test('덮인 넓이 재기', async (t) => {
  await t.test('★ 주민번호 한 줄은 «좁다» — 되묻지 않는다', () => {
    /* 가로로 길게 한 번 = 폭 60% × 높이 3% ≈ 1.8% */
    const r = maskUi([{ x: .2, y: .5, w: .6, h: .03 }]).coveredRatio();
    assert.ok(r < 0.2, '주민번호 한 줄인데 넓다고 봅니다(' + r + ') — 매번 되묻게 됩니다.');
  });

  await t.test('★ 종이를 통째로 덮으면 «넓다»', () => {
    assert.ok(maskUi([{ x: 0, y: 0, w: 1, h: 1 }]).coveredRatio() > 0.2);
  });

  await t.test('★ 여러 곳을 조금씩 가린 것도 «합쳐» 센다', () => {
    /* 주민번호가 두 곳인 계약서는 정상이다 — 그래도 합이 좁으면 안 되묻는다 */
    const two = maskUi([{ x: .1, y: .2, w: .5, h: .03 }, { x: .1, y: .7, w: .5, h: .03 }]).coveredRatio();
    assert.ok(two < 0.2, '주민번호 두 곳인데 되묻습니다(' + two + ')');
    /* ⚠ **하나하나는 좁은데 합치면 넓은** 경우로 재야 한다. 큰 것 둘로 재면
       「마지막 것만 보기」로 고장 나도 통과한다(뮤테이션에서 실제로 살아남았다). */
    const many = maskUi([
      { x: 0, y: 0, w: .5, h: .3 },      // 15%
      { x: 0, y: .4, w: .5, h: .3 }      // 15%  → 합 30%
    ]).coveredRatio();
    assert.ok(many > 0.2,
      '조금씩 여러 번 그어 덮은 것을 못 잡습니다(' + many + ') — 하나씩만 보고 있습니다.');
  });

  await t.test('가린 곳이 없으면 0', () => {
    assert.equal(maskUi([]).coveredRatio(), 0);
  });

  await t.test('이상한 값이 와도 안 터진다', () => {
    const r = maskUi([{ w: 'x', h: null }, {}, null]).coveredRatio();
    assert.equal(r, 0, '이상한 값으로 되묻거나 터지면 안 됩니다: ' + r);
  });
});

/* 되묻기를 **실제로 돌려** 본다.
   ⚠ 글자로만 보면(「confirm 이 있나」) 한도를 1 로 바꾸거나 「예」를 눌러도 안 가게
     만들어도 통과한다 — 뮤테이션에서 넷이 살아남아 이렇게 고쳤다. */
function runConfirm(boxes, answer) {
  const src = fs.readFileSync(path.join(R, 'js', 'pu-rrn-mask-ui.js'), 'utf8');
  const got = { asked: [], read: 0, alerts: [] };
  const ctx = {
    console, Math, Number, Object, Array, Promise, Error, String, JSON,
    viewerId: 'p1',
    photoMask: { status: 'ready', url: 'data:image/jpeg;base64,AAA', boxes: boxes || [], err: '', autoNote: '' },
    confirm: function (m) { got.asked.push(m); return !!answer; },
    alert: function (m) { got.alerts.push(m); },
    $: function () { return { innerHTML: '' }; },
    readPhoto: function () { got.read++; return Promise.resolve(); },
    renderGridBar: function () { }, renderGrid: function () { },
    renderReadPanel: function () { }, maskItem: function () { return null; },
    esc: String,
    /* 사본 만들기는 캔버스가 필요하다 — 여기서는 가짜로 둔다(보는 것은 «되묻기»다) */
    PuRrnMask: { maskToDataUrl: function () { return 'data:image/jpeg;base64,MASKED'; } }
  };
  ctx.window = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  ctx.PuRrnMaskUi.init({ state: function () { return ctx.photoMask; }, render: function () { } });
  vm.runInContext(
    app.slice(app.indexOf('const MASK_WIDE ='), app.indexOf('const MASK_WIDE =') + 40).split('\n')[0] + '\n' +
    cutFn(app, 'function photoMaskConfirm(') + '\nphotoMaskConfirm();', ctx);
  return got;
}

const 좁게 = [{ x: .2, y: .5, w: .6, h: .03 }];       // 주민번호 한 줄 ≈ 1.8%
const 넓게 = [{ x: 0, y: 0, w: .8, h: .8 }];          // 64%

test('넓게 가리면 되묻는다 — 막지는 않는다', async (t) => {
  await t.test('★ 주민번호 한 줄에는 «안 묻는다» — 매번 물으면 사람이 그냥 눌러 버린다', () => {
    const r = runConfirm(좁게, true);
    assert.deepEqual(r.asked, [], '좁게 그었는데 되묻습니다 — 되묻기가 의미를 잃습니다.');
    assert.equal(r.read, 1, '판독이 안 갔습니다.');
  });

  await t.test('★ 넓게 덮으면 «묻는다»', () => {
    const r = runConfirm(넓게, true);
    assert.equal(r.asked.length, 1, '계약기간·보수까지 덮였는데 그냥 보냅니다.');
    assert.match(r.asked[0], /%/, '몇 %가 덮였는지 말해 줘야 사람이 판단합니다.');
  });

  await t.test('★ 「아니오」 면 판독하지 않는다', () => {
    const r = runConfirm(넓게, false);
    assert.equal(r.read, 0, '★ 되물어 놓고 「아니오」인데도 보냈습니다.');
  });

  await t.test('★ 「예」 면 그대로 판독한다 — 사람이 보고 정한 것을 막지 않는다', () => {
    /* 주민번호가 두 곳인 계약서·큰 도장 자리 등 넓게 가리는 것이 맞는 경우가 있다.
       기계가 가로막으면 그 서류를 영영 못 읽는다. */
    const r = runConfirm(넓게, true);
    assert.equal(r.read, 1, '「예」를 눌러도 안 갑니다 — 그 서류를 영영 못 읽습니다.');
  });
});

test('★ 화면이 «주민번호 자리만» 가리라고 말한다', () => {
  /* 「넓게 덮을수록 안전하다」고 생각하기 쉬운데 사실은 반대다 */
  const h = panel({ status: 'ready', url: 'data:x', boxes: [] });
  assert.match(h, /주민번호 자리만/);
  assert.match(h, /판독 결과가 비거나 틀립니다/);
});

/* ══════ ⑦ 단추 ══════ */
test('★ 판독 자리에 「가리고 판독」이 함께 있다', () => {
  /* ⚠ 「startPhotoMask 라는 낱말이 있나」로는 못 잡는다 — 단추를 만들어 놓고
     **줄에 안 붙이면** 그 낱말은 그대로 남는다(뮤테이션에서 실제로 살아남았다).
     그려서 **나온 글자**에 있는지 본다. */
  const ctx = {
    console, Object, String,
    esc: function (s) { return String(s == null ? '' : s); },
    docNavBtns: function () { return ''; },
    canShareFiles: function () { return false; },
    /* 2026-08-29: 옆에 「✏ 가리기」가 늘었다 — 사진 «자체»를 고치는 다른 일이다.
       남의 사진에는 안 나오므로 판정을 준다. 안 주면 그 자리에서 멎는다. */
    mayTouch: function () { return true; },
    viewerId: 'p1'
  };
  vm.createContext(ctx);
  /* ⚠ 2026-08-29 부터 도구줄이 «읽을 글자가 없는 사진인가»를 본다 — 그 판단도
     함께 넣는다. 안 넣으면 그 자리에서 멎어 검사가 헛돈다. */
  vm.runInContext(app.match(/const PIC_KINDS = \{[^}]*\};/)[0] + '\n' +
    cutFn(app, 'function noTextKind(') + '\n' +
    cutFn(app, 'function actsRow(') + '\nvar __h = actsRow("글자 판독하기", false);', ctx);
  const h = ctx.__h;
  assert.match(h, /onclick="startPhotoMask\(\)"/,
    '누를 길이 없으면 아무도 가릴 수 없습니다 — 단추를 만들어만 두고 줄에 안 붙였을 수 있습니다.');
  assert.match(h, /onclick="readAgain\(\)"/,
    '보통 판독 단추도 그대로 있어야 합니다(다른 서류는 한 단계가 늘면 안 됩니다).');
  /* 「가리고 판독」(사본만 가려 AI 로)과 「가리기」(원본을 덮음)는 **다른 일**이다 —
     둘이 한 줄에 함께 있어야 사람이 고를 수 있다. */
  assert.match(h, /onclick="startPhotoEdit\(\)"/,
    '사진을 고치는 길이 화면에 없습니다(대표 지시 2026-08-29).');
});

test('★★ 남의 사진에는 「✏ 가리기」가 안 나온다 — 눌러도 서버가 막는다', () => {
  const ctx = {
    console, Object, String,
    esc: function (s) { return String(s == null ? '' : s); },
    docNavBtns: function () { return ''; },
    canShareFiles: function () { return false; },
    mayTouch: function () { return false; },       // 공유받은 사진
    viewerId: 'p1'
  };
  vm.createContext(ctx);
  /* ⚠ 2026-08-29 부터 도구줄이 «읽을 글자가 없는 사진인가»를 본다 — 그 판단도
     함께 넣는다. 안 넣으면 그 자리에서 멎어 검사가 헛돈다. */
  vm.runInContext(app.match(/const PIC_KINDS = \{[^}]*\};/)[0] + '\n' +
    cutFn(app, 'function noTextKind(') + '\n' +
    cutFn(app, 'function actsRow(') + '\nvar __h = actsRow("글자 판독하기", false);', ctx);
  assert.ok(!/startPhotoEdit/.test(ctx.__h),
    '★ 「눌러도 아무 일이 없는」 단추가 생깁니다 — 도구줄과 같은 기준(mayTouch)이라야 합니다.');
  /* 판독은 그대로 열려 있다 — 남의 사진을 «읽어» 기업정보함에 더하는 일은 막지 않는다
     (2026-08-10 대표 지시). 고치는 것만 막는다. */
  assert.match(ctx.__h, /onclick="readAgain\(\)"/);
});
