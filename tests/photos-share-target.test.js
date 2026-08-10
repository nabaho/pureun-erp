/* 사진첩 — 카톡·갤러리에서 「공유」로 사진 받기
   폰에 앱으로 설치돼 있으면 공유 목록에 푸른사진첩이 뜨고, 안드로이드가 사진을
   POST 로 보낸다. 서버가 없으므로 pu-photos-sw.js 가 가로채 IndexedDB 에 잠깐 두고
   화면을 ?share=1 로 돌려보낸다.

   ⚠ 가장 위험한 성질 두 가지를 **실제로 돌려서** 확인한다.
     ① 공유 POST 말고는 **아무것도 가로채지 않는다**(캐시를 두면 새 버전이 안 내려온다)
     ② 꺼낼 때 **바로 비운다**(안 비우면 새로고침마다 같은 사진이 또 뜬다) */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const R = path.join(__dirname, '..');
const swSrc = fs.readFileSync(path.join(R, 'pu-photos-sw.js'), 'utf8');
const html = fs.readFileSync(path.join(R, 'pu-photos.html'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(R, 'pu-photos-manifest.json'), 'utf8'));

/* ── 일꾼을 진짜로 켠다 ── */
function bootSw() {
  const handlers = {};
  const added = [];        // IndexedDB 에 담긴 것
  let cleared = false;
  const ctx = {
    URL, Response, console: { warn() {} },
    indexedDB: {
      open() {
        const req = {};
        setTimeout(function () {
          req.result = {
            objectStoreNames: { contains() { return true; } },
            createObjectStore() {},
            transaction() {
              const tx = {};
              setTimeout(function () { tx.oncomplete && tx.oncomplete(); }, 0);
              return Object.assign(tx, {
                objectStore() {
                  return { add(v) { added.push(v); }, clear() { cleared = true; } };
                },
              });
            },
            close() {},
          };
          req.onsuccess && req.onsuccess();
        }, 0);
        return req;
      },
    },
  };
  ctx.self = {
    addEventListener(name, fn) { handlers[name] = fn; },
    skipWaiting() {},
    clients: { claim() {} },
    console: ctx.console,
  };
  vm.createContext(ctx);
  vm.runInContext(swSrc, ctx);
  return { handlers, added, cleared: () => cleared };
}

/* 가짜 공유 요청 — 안드로이드가 보내는 모양 */
function shareReq(url, files) {
  return {
    method: 'POST',
    url,
    formData: async () => ({ getAll: (k) => (k === 'photos' ? files : []) }),
  };
}
function blobLike(name, size, type) { return { name, size, type }; }

async function dispatch(handlers, request) {
  let answered = null;
  handlers.fetch({ request, respondWith(p) { answered = p; } });
  return answered ? await answered : null;
}

/* ── ① 공유 POST 말고는 손대지 않는다 ── */
test('평범한 화면 요청(GET)은 가로채지 않는다', async () => {
  const sw = bootSw();
  const res = await dispatch(sw.handlers, { method: 'GET', url: 'https://x.io/pureunall/pu-photos.html' });
  assert.equal(res, null, '가로채면 캐시가 끼어들어 새 버전이 안 내려옵니다.');
});

test('다른 앱으로 가는 POST 는 가로채지 않는다', async () => {
  const sw = bootSw();
  assert.equal(await dispatch(sw.handlers, shareReq('https://x.io/pureunall/enter.html', [])), null);
  assert.equal(await dispatch(sw.handlers, shareReq('https://x.io/pureunall/pu-cards.html', [])), null);
});

test('★ 캐시를 아예 쓰지 않는다', () => {
  assert.ok(!/\bcaches\b/.test(swSrc),
    '캐시를 두면 pu-version.js 의 새 버전 자동 적용과 싸워 옛 화면이 남습니다.');
});

/* ── ② 공유가 오면 담고 되돌려 보낸다 ── */
test('공유로 온 사진을 담고 ?share=1 로 돌려보낸다', async () => {
  const sw = bootSw();
  const res = await dispatch(sw.handlers,
    shareReq('https://x.io/pureunall/pu-photos.html', [blobLike('명함.jpg', 1200, 'image/jpeg')]));
  assert.ok(res, '공유 POST 는 반드시 응답해야 합니다.');
  assert.equal(res.status, 303, '303 이어야 새로고침해도 다시 안 보냅니다.');
  assert.equal(res.headers.get('location'), 'https://x.io/pureunall/pu-photos.html?share=1');
  assert.equal(sw.added.length, 1);
  assert.equal(sw.added[0].name, '명함.jpg');
  assert.ok(sw.added[0].blob, '사진 알맹이를 그대로 담아야 합니다.');
});

test('빈 파일·0바이트는 거르고 「없음」으로 알린다', async () => {
  const sw = bootSw();
  const res = await dispatch(sw.handlers,
    shareReq('https://x.io/pureunall/pu-photos.html', [blobLike('빈것.jpg', 0, 'image/jpeg'), null]));
  assert.equal(res.headers.get('location'), 'https://x.io/pureunall/pu-photos.html?share=none',
    '조용히 넘기면 "공유했는데 아무 일도 없다"가 됩니다.');
  assert.equal(sw.added.length, 0);
});

test('읽다 실패해도 화면을 되돌려 보낸다 (?share=err)', async () => {
  const sw = bootSw();
  const bad = { method: 'POST', url: 'https://x.io/pureunall/pu-photos.html',
    formData: async () => { throw new Error('망가진 요청'); } };
  const res = await dispatch(sw.handlers, bad);
  assert.equal(res.headers.get('location'), 'https://x.io/pureunall/pu-photos.html?share=err',
    '실패하고 아무 데도 안 보내면 빈 화면에 갇힙니다.');
});

/* ── 설명 파일(manifest)과 일꾼이 같은 이름을 쓰는가 ── */
test('★ manifest 의 파일 이름과 일꾼이 꺼내는 이름이 같다', () => {
  const st = manifest.share_target;
  assert.ok(st, 'share_target 이 있어야 공유 목록에 뜹니다.');
  assert.equal(st.method, 'POST');
  assert.equal(st.enctype, 'multipart/form-data', '파일을 보내려면 이 값이어야 합니다.');
  const field = st.params.files[0].name;
  assert.ok(new RegExp("getAll\\('" + field + "'\\)").test(swSrc),
    '이름이 어긋나면 사진이 한 장도 안 옵니다(가장 흔한 실수).');
});

test('공유 주소가 앱 안(scope)에 있다', () => {
  assert.ok(manifest.share_target.action.indexOf('pu-photos.html') >= 0);
  assert.ok(/SHARE_PATH *= *'\/pu-photos\.html'/.test(swSrc), '일꾼이 보는 길과 같아야 합니다.');
});

test('사진과 스캔(PDF)을 함께 받는다', () => {
  const acc = manifest.share_target.params.files[0].accept;
  assert.ok(acc.indexOf('image/*') >= 0);
  assert.ok(acc.indexOf('application/pdf') >= 0);
});

/* ── 화면 쪽 배선 ── */
test('일꾼은 https 에서만 등록한다 (file:// 에서 오류 안 남)', () => {
  /* ⚠ 2026-08-08 다시 겨눔 — 워커가 `pu-sw.js` **하나로 통합**됐다(ccae985).
     서비스워커는 한 자리에 하나만 살아남아서, 앱마다 제 워커를 등록하면
     나중에 연 앱이 앞의 것을 밀어냈다(사진첩을 열면 명함첩 공유가 죽었다).
     사진첩 공유 POST 를 받는 코드는 그대로 그 파일 안으로 옮겨졌다. */
  assert.ok(/location\.protocol *=== *'https:'[\s\S]{0,200}register\('pu-sw\.js'\)/.test(html));
  assert.ok(/register\('pu-sw\.js'\)[\s\S]{0,80}\.catch\(/.test(html),
    '등록이 실패해도 사진첩은 열려야 합니다.');
});

test('★ 꺼내면서 바로 비운다 (같은 사진이 두 번 담기지 않게)', () => {
  const m = html.match(/function drainShareIdb\(\)[\s\S]*?\n\}/);
  assert.ok(m, 'drainShareIdb 를 찾지 못했습니다.');
  assert.ok(/getAll\(\)/.test(m[0]) && /\.clear\(\)/.test(m[0]),
    '읽기만 하고 안 비우면 새로고침할 때마다 같은 사진이 또 뜹니다.');
});

test('공유받은 것이 없으면 확인 화면을 열지 않는다', () => {
  const m = html.match(/function takeShared\(\)[\s\S]*?\n\}/);
  assert.ok(m, 'takeShared 를 찾지 못했습니다.');
  assert.ok(/if \(!rows\.length\) return;/.test(m[0]),
    '빈 확인 화면이 열리면 "왜 아무것도 없지"가 됩니다.');
});

test('주소의 share 표시를 지운다', () => {
  assert.ok(/searchParams\.delete\('share'\)/.test(html),
    '표시를 남기면 새로고침 때마다 안내가 또 뜹니다.');
});

test('로그인이 끝난 뒤에 공유를 꺼낸다', () => {
  const signInAt = html.indexOf('PuPhotoStore.signIn(');
  const takeSharedAt = html.indexOf('takeShared();', signInAt);
  assert.ok(signInAt >= 0 && takeSharedAt > signInAt,
    '계정을 알기 전에는 사진을 담을 수 없습니다.');
});

test('담기는 addFiles 통로를 그대로 탄다 (서류로)', () => {
  const m = html.match(/async function shareSave\(\)[\s\S]*?\n\}/);
  assert.ok(m, 'shareSave 를 찾지 못했습니다.');
  assert.ok(/addFiles\(files, true\)/.test(m[0]),
    '밖에서 들어온 것은 끌어놓기·붙여넣기와 같이 서류로 다뤄야 글씨가 읽힙니다.');
  assert.ok(/shareClose\(\);[\s\S]{0,40}await addFiles/.test(m[0]),
    '담기 전에 화면을 닫아야 대기열 표시가 보입니다.');
});

test('안 고른 것을 버릴 때는 묻는다', () => {
  const m = html.match(/function shareCancel\(\)[\s\S]*?\n\}/);
  assert.ok(m && /confirm\(/.test(m[0]), '말없이 버리면 사진을 잃습니다.');
});

test('미리보기 주소를 되돌려 준다 (기억 새는 것 막기)', () => {
  const m = html.match(/function shareClose\(\)[\s\S]*?\n\}/);
  assert.ok(m && /revokeObjectURL/.test(m[0]));
});

test('사진이 아닌 것(스캔)은 미리보기 대신 이름을 보여준다', () => {
  const m = html.match(/function renderShareRev\(\)[\s\S]*?\n\}/);
  assert.ok(m && /s\.isImg[\s\S]{0,120}esc\(s\.name\)/.test(m[0]),
    'PDF 를 img 로 그리면 빈 칸만 보입니다.');
});

/* ── 설치 안내 ── */
test('설치 안내는 설치 전에만·「나중에」는 한동안 안 뜬다', () => {
  assert.ok(/beforeinstallprompt/.test(html) && /appinstalled/.test(html));
  const m = html.match(/function renderInstNote\(\)[\s\S]*?\n\}/);
  assert.ok(m && /!instPrompt *\|\| *instSnoozed\(\)/.test(m[0]),
    '설치했거나 미룬 사람에게 계속 띄우면 안 됩니다.');
  assert.ok(/14 \* 86400000/.test(html), '「나중에」는 2주입니다.');
});

test('설치 창을 닫기만 하면 다시 볼 수 있다', () => {
  const m = html.match(/function instRun\(\)[\s\S]*?\n\}/);
  assert.ok(m && /outcome *!== *'accepted'[\s\S]{0,80}renderInstNote\(\)/.test(m[0]),
    '실수로 닫으면 다시는 설치 못 하게 됩니다.');
});

/* ── 촬영 고르기 화면과 꾸밈을 함께 쓴다 ── */
test('공유 고르기 화면은 촬영 고르기와 같은 꾸밈을 쓴다', () => {
  assert.ok(/#camRev,#shareRev\{/.test(html), '한 곳만 고치면 둘 다 바뀌어야 합니다.');
  assert.ok(/#camRevGrid,#shareRevGrid\{/.test(html));
  assert.ok(/#camRevUp,#shareRevUp\{/.test(html));
});

test('두 화면의 사진 배열은 서로 섞이지 않는다', () => {
  const m = html.match(/async function shareSave\(\)[\s\S]*?\n\}/);
  assert.ok(!/camShots/.test(m[0]), '공유 중에 카메라를 켜도 서로 잡아먹으면 안 됩니다.');
});
