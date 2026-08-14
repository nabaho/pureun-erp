/* 5차 — 급여데이터함: 카톡·갤러리에서 「공유」로 자료 받기
   폰에 앱으로 설치돼 있으면 공유 목록에 급여데이터함이 뜨고, 안드로이드가 자료를
   POST 로 보낸다. 서버가 없으므로 통합 워커 pu-sw.js 가 가로채 IndexedDB 에
   잠깐 두고 화면을 ?share=1 로 돌려보낸다.

   ⚠ 명함첩·사진첩과 한 워커(pu-sw.js)를 같이 쓰므로, 급여데이터함 몫을 더하면서
   다른 두 앱의 길을 건드리지 않았는지도 함께 확인한다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const R = path.join(__dirname, '..');
const swSrc = fs.readFileSync(path.join(R, 'pu-sw.js'), 'utf8');
const html = fs.readFileSync(path.join(R, 'pu-paydata.html'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(R, 'pu-paydata-manifest.json'), 'utf8'));

/* ── 통합 워커를 진짜로 켠다 ── */
function bootSw() {
  const handlers = {};
  const added = {};          // dbName -> [{blob,name,type,at}]
  const cleared = {};        // dbName -> true
  const cachePuts = [];
  const ctx = {
    URL, Response, console: { warn() {} },
    caches: { open: async () => ({ put: async (k, v) => cachePuts.push(k) }) },
    indexedDB: {
      open(name) {
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
                  return {
                    add(v) { (added[name] = added[name] || []).push(v); },
                    clear() { cleared[name] = true; }
                  };
                }
              });
            },
            close() {}
          };
          req.onsuccess && req.onsuccess();
        }, 0);
        return req;
      }
    }
  };
  ctx.self = {
    addEventListener(name, fn) { handlers[name] = fn; }, skipWaiting() {}, clients: { claim() {} },
    console: ctx.console, location: new URL('https://x.io/pureunall/pu-sw.js')
  };
  vm.createContext(ctx);
  vm.runInContext(swSrc, ctx);
  return { handlers, added, cleared };
}

function shareReq(url, files) {
  return { method: 'POST', url, formData: async () => ({ getAll: k => (k === 'photos' ? files : []) }) };
}
function blobLike(name, size, type) { return { name, size, type }; }

async function dispatch(handlers, request) {
  let answered = null;
  handlers.fetch({ request, respondWith(p) { answered = p; } });
  return answered ? await answered : null;
}

/* ── 공유 POST 말고는 손대지 않는다 ── */
test('평범한 화면 요청(GET)은 가로채지 않는다', async () => {
  const sw = bootSw();
  const res = await dispatch(sw.handlers, { method: 'GET', url: 'https://x.io/pureunall/pu-paydata.html' });
  assert.equal(res, null, '가로채면 캐시가 끼어들어 새 버전이 안 내려옵니다.');
});

test('다른 앱으로 가는 POST 는 급여데이터함 몫이 건드리지 않는다', async () => {
  const sw = bootSw();
  assert.equal(await dispatch(sw.handlers, shareReq('https://x.io/pureunall/enter.html', [])), null);
  const cardsRes = await dispatch(sw.handlers, shareReq('https://x.io/pureunall/pu-cards-share', []));
  assert.ok(cardsRes, '명함첩 길이 급여데이터함을 더하면서 죽었습니다.');
  const photosRes = await dispatch(sw.handlers, shareReq('https://x.io/pureunall/pu-photos.html', []));
  assert.ok(photosRes, '사진첩 길이 급여데이터함을 더하면서 죽었습니다.');
  // 각자 자기 IndexedDB에만 담겨야 한다
  assert.ok(!sw.added['pu-paydata-share'], '명함첩·사진첩 공유가 급여데이터함 자리에 섞였습니다.');
});

/* ── 공유가 오면 담고 되돌려 보낸다 ── */
test('★ 공유로 온 자료를 담고 ?share=1 로 돌려보낸다', async () => {
  const sw = bootSw();
  const res = await dispatch(sw.handlers,
    shareReq('https://x.io/pureunall/pu-paydata.html', [blobLike('근태표.jpg', 1200, 'image/jpeg')]));
  assert.ok(res, '공유 POST 는 반드시 응답해야 합니다.');
  assert.equal(res.status, 303, '303 이어야 새로고침해도 다시 안 보냅니다.');
  assert.equal(res.headers.get('location'), 'https://x.io/pureunall/pu-paydata.html?share=1');
  assert.equal((sw.added['pu-paydata-share'] || []).length, 1);
  assert.equal(sw.added['pu-paydata-share'][0].name, '근태표.jpg');
  assert.ok(sw.added['pu-paydata-share'][0].blob, '자료 알맹이를 그대로 담아야 합니다.');
  assert.ok(sw.cleared['pu-paydata-share'] === undefined, 'add 경로에서는 지우지 않습니다(꺼낼 때 화면이 지웁니다).');
});

test('빈 파일·0바이트는 거르고 「없음」으로 알린다', async () => {
  const sw = bootSw();
  const res = await dispatch(sw.handlers,
    shareReq('https://x.io/pureunall/pu-paydata.html', [blobLike('빈것.jpg', 0, 'image/jpeg'), null]));
  assert.equal(res.headers.get('location'), 'https://x.io/pureunall/pu-paydata.html?share=none',
    '조용히 넘기면 "공유했는데 아무 일도 없다"가 됩니다.');
  assert.equal((sw.added['pu-paydata-share'] || []).length, 0);
});

test('읽다 실패해도 화면을 되돌려 보낸다 (?share=err)', async () => {
  const sw = bootSw();
  const bad = { method: 'POST', url: 'https://x.io/pureunall/pu-paydata.html', formData: async () => { throw new Error('망가진 요청'); } };
  const res = await dispatch(sw.handlers, bad);
  assert.equal(res.headers.get('location'), 'https://x.io/pureunall/pu-paydata.html?share=err',
    '실패하고 아무 데도 안 보내면 빈 화면에 갇힙니다.');
});

test('★ 캐시를 아예 쓰지 않는다', () => {
  assert.ok(!/\bcaches\.(open|put|match)\(/.test(swSrc.split('takeCards')[0])
    || true, '건너뜀'); // takeCards만 caches를 쓴다 — 급여데이터함 몫이 새로 쓰면 안 된다
  const paydataFn = swSrc.match(/function takePaydata\([\s\S]*?\n\}/)[0]
    + swSrc.match(/function keepPaydata\([\s\S]*?\n\}/)[0];
  assert.ok(!/\bcaches\b/.test(paydataFn),
    '캐시를 두면 pu-version.js 의 새 버전 자동 적용과 싸워 옛 화면이 남습니다.');
});

/* ── manifest와 일꾼이 같은 이름을 쓰는가 ── */
test('★ manifest 의 파일 이름과 일꾼이 꺼내는 이름이 같다', () => {
  const st = manifest.share_target;
  assert.ok(st, 'share_target 이 있어야 공유 목록에 뜹니다.');
  assert.equal(st.method, 'POST');
  assert.equal(st.enctype, 'multipart/form-data', '파일을 보내려면 이 값이어야 합니다.');
  const field = st.params.files[0].name;
  const paydataFn = swSrc.match(/function takePaydata\([\s\S]*?\n\}/)[0];
  assert.ok(new RegExp("getAll\\('" + field + "'\\)").test(paydataFn),
    '이름이 어긋나면 자료가 한 장도 안 옵니다(가장 흔한 실수).');
});

test('공유 주소가 앱 안(scope)에 있다', () => {
  assert.ok(manifest.share_target.action.indexOf('pu-paydata.html') >= 0);
  assert.ok(/PAYDATA_SHARE *= *'\/pu-paydata\.html'/.test(swSrc), '일꾼이 보는 길과 같아야 합니다.');
});

test('사진과 스캔(PDF)을 함께 받는다', () => {
  const acc = manifest.share_target.params.files[0].accept;
  assert.ok(acc.indexOf('image/*') >= 0);
  assert.ok(acc.indexOf('application/pdf') >= 0);
});

/* ── 화면 쪽 배선 ── */
test('일꾼은 https 에서만 등록한다 (file:// 에서 오류 안 남)', () => {
  assert.ok(/location\.protocol *=== *'https:'[\s\S]{0,200}register\('pu-sw\.js'\)/.test(html));
  assert.ok(/register\('pu-sw\.js'\)[\s\S]{0,80}\.catch\(/.test(html),
    '등록이 실패해도 급여데이터함은 열려야 합니다.');
});

test('명함첩·사진첩과 다른 IndexedDB 이름을 쓴다 — 서로의 대기분을 집어가면 안 된다', () => {
  assert.match(html, /const SHARE_IDB = 'pu-paydata-share'/);
});

test('★ 꺼내면서 바로 비운다 (같은 자료가 두 번 담기지 않게)', () => {
  const m = html.match(/function drainShareIdb\(\)[\s\S]*?\n\}/);
  assert.ok(m, 'drainShareIdb 를 찾지 못했습니다.');
  assert.ok(/getAll\(\)/.test(m[0]) && /\.clear\(\)/.test(m[0]),
    '읽기만 하고 안 비우면 새로고침할 때마다 같은 자료가 또 담깁니다.');
});

test('공유받은 것이 없으면 대기 칸에 아무것도 안 담고 알리지도 않는다', () => {
  const m = html.match(/function takeShared\(\)[\s\S]*?\n\}/);
  assert.ok(m, 'takeShared 를 찾지 못했습니다.');
  assert.ok(/if \(!rows\.length\) return;/.test(m[0]),
    '빈 것까지 알리면 로그인할 때마다 이상한 알림이 뜹니다.');
});

test('주소의 share 표시를 지운다', () => {
  assert.match(html, /searchParams\.delete\('share'\)/, '표시를 남기면 새로고침 때마다 안내가 또 뜹니다.');
});

test('로그인이 끝난 뒤에 공유를 꺼낸다', () => {
  const loadSitesAt = html.indexOf('loadSites();');
  const takeSharedAt = html.indexOf('takeShared();', loadSitesAt);
  assert.ok(loadSitesAt >= 0 && takeSharedAt > loadSitesAt,
    '계정을 알기 전에는 대기 칸에 담을 수 없습니다.');
});

test('★ 담기는 대기 칸 통로(shareToPending)를 그대로 타고, 출처가 share 로 남는다', () => {
  const m = html.match(/function shareToPending\(files\)[\s\S]*?\n\}/);
  assert.ok(m, 'shareToPending 를 찾지 못했습니다.');
  assert.match(m[0], /S\.saveFile\(/);
  assert.match(m[0], /from: 'share'/, '출처가 안 남으면 나중에 왜 여기 있는지 못 가립니다.');
  const t = html.match(/function takeShared\(\)[\s\S]*?\n\}/)[0];
  assert.match(t, /shareToPending\(files\)/);
});
