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
    sendCards: function () { return Promise.resolve(); },
    sendCompany: function () { return Promise.resolve(); },
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
  vm.runInContext(cutFn(app, 'function readPhoto(') + '\nvar __p = readPhoto("p1", ' +
    (masked === undefined ? 'undefined' : JSON.stringify(masked)) + ');', ctx);
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
  vm.runInContext(cutFn(app, 'function maskPanelHtml(') + '\nvar __h = maskPanelHtml();', ctx);
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

/* ══════ ⑥ 단추 ══════ */
test('★ 판독 자리에 「가리고 판독」이 함께 있다', () => {
  /* ⚠ 「startPhotoMask 라는 낱말이 있나」로는 못 잡는다 — 단추를 만들어 놓고
     **줄에 안 붙이면** 그 낱말은 그대로 남는다(뮤테이션에서 실제로 살아남았다).
     그려서 **나온 글자**에 있는지 본다. */
  const ctx = {
    console, Object, String,
    esc: function (s) { return String(s == null ? '' : s); },
    docNavBtns: function () { return ''; },
    canShareFiles: function () { return false; },
    viewerId: 'p1'
  };
  vm.createContext(ctx);
  vm.runInContext(cutFn(app, 'function actsRow(') + '\nvar __h = actsRow("글자 판독하기", false);', ctx);
  const h = ctx.__h;
  assert.match(h, /onclick="startPhotoMask\(\)"/,
    '누를 길이 없으면 아무도 가릴 수 없습니다 — 단추를 만들어만 두고 줄에 안 붙였을 수 있습니다.');
  assert.match(h, /onclick="readAgain\(\)"/,
    '보통 판독 단추도 그대로 있어야 합니다(다른 서류는 한 단계가 늘면 안 됩니다).');
});
