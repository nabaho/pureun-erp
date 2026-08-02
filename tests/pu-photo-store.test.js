'use strict';
// js/pu-photo-store.js 단위 검사 — 실행: node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// 브라우저 전역이 없는 노드에서 저장 층을 불러온다.
// 파일이 `window`에 붙으므로 가짜 window를 만들어 그 안에서 실행한다.
function loadStore() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'pu-photo-store.js'), 'utf8');
  const sandbox = { window: {}, console };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  new vm.Script(src, { filename: 'pu-photo-store.js' }).runInContext(sandbox);
  return sandbox.window.PuPhotoStore;
}

test('저장 층이 window에 붙는다', () => {
  const S = loadStore();
  assert.ok(S, 'window.PuPhotoStore 가 없습니다');
});

test('기존 앱의 데이터 루트를 쓰지 않는다', () => {
  const S = loadStore();
  // pucards(명함첩)·data(포털) 루트를 건드리면 실데이터가 오염된다.
  assert.equal(S.DB_ROOT, 'puphotos');
  assert.equal(S.BUCKET_ROOT, 'pu_photos');
});

test('촬영 시각에서 보관 연도를 뽑는다', () => {
  const S = loadStore();
  assert.equal(S.yearOf(new Date(2026, 7, 2, 14, 30).getTime()), '2026');
  assert.equal(S.yearOf(new Date(2025, 11, 31, 23, 59).getTime()), '2025');
});

test('촬영 시각을 모르면 unknown으로 모은다', () => {
  const S = loadStore();
  // 카톡으로 받은 사진은 촬영 시각이 지워져 있다. 버리지 않고 따로 모은다.
  assert.equal(S.yearOf(0), 'unknown');
  assert.equal(S.yearOf(null), 'unknown');
  assert.equal(S.yearOf(undefined), 'unknown');
  assert.equal(S.yearOf('없는값'), 'unknown');
  assert.equal(S.yearOf(-1), 'unknown');
});

test('메타 경로와 본문 경로가 갈라져 있다', () => {
  const S = loadStore();
  // 목록만 읽을 때 사진까지 내려받으면 앱이 느려진다. 반드시 분리한다.
  assert.equal(S.metaPath('2026', 'abc'), 'puphotos/items/2026/abc');
  assert.equal(S.blobPath('2026', 'abc'), 'puphotos/blobs/2026/abc');
  assert.notEqual(S.metaPath('2026', 'abc'), S.blobPath('2026', 'abc'));
});

test('파일 창고 경로는 축소본과 격자용 미리보기가 다르다', () => {
  const S = loadStore();
  assert.equal(S.filePath('2026', 'abc', 'full'), 'pu_photos/2026/abc.jpg');
  assert.equal(S.filePath('2026', 'abc', 'thumb'), 'pu_photos/2026/abc_t.jpg');
  assert.notEqual(S.filePath('2026', 'abc', 'full'), S.filePath('2026', 'abc', 'thumb'));
});

test('경로가 연도로 갈라진다', () => {
  const S = loadStore();
  // 연도별로 나눠야 평소에 올해 것만 불러올 수 있다.
  assert.ok(S.metaPath('2026', 'x').includes('/2026/'));
  assert.ok(S.filePath('2025', 'x', 'full').includes('/2025/'));
});

/* ── 저장 방식 선택 ── */

test('저장 방식 기본값은 검증된 실시간DB다', () => {
  const S = loadStore();
  // 창고 점검을 통과하기 전에는 한 번도 안 써본 길로 가지 않는다.
  assert.equal(S.getMode(), 'rtdb');
});

test('저장 방식을 바꿀 수 있다', () => {
  const S = loadStore();
  assert.equal(S.setMode('storage'), 'storage');
  assert.equal(S.getMode(), 'storage');
});

test('없는 저장 방식은 거부한다', () => {
  const S = loadStore();
  assert.throws(() => S.setMode('아무거나'), /storage 또는 rtdb/);
});

test('init이 파이어베이스 객체를 받고 방식을 돌려준다', () => {
  const S = loadStore();
  const fakeDb = {};
  const fakeStorage = {};
  assert.equal(S.init({ db: fakeDb, storage: fakeStorage, mode: 'storage' }), 'storage');
  assert.equal(S.getMode(), 'storage');
});

/* ── 창고 점검 ── */

// 파일 창고 흉내. putString·getDownloadURL·delete 를 마음대로 성공/실패시킨다.
function fakeStorage(behavior) {
  const calls = [];
  return {
    calls,
    ref(p) {
      calls.push(['ref', p]);
      return {
        putString(s) {
          calls.push(['putString', p, s]);
          return behavior.upload === 'fail'
            ? Promise.reject(new Error('권한이 없습니다'))
            : Promise.resolve({});
        },
        getDownloadURL() {
          calls.push(['getDownloadURL', p]);
          return behavior.url === 'fail'
            ? Promise.reject(new Error('주소를 못 받았습니다'))
            : Promise.resolve('https://example.test/' + p);
        },
        delete() {
          calls.push(['delete', p]);
          return behavior.del === 'fail'
            ? Promise.reject(new Error('지울 권한이 없습니다'))
            : Promise.resolve();
        }
      };
    }
  };
}

test('점검 경로는 실사진 경로와 겹치지 않는다', () => {
  const S = loadStore();
  const p = S.probePath('12345');
  // 점검이 실사진을 덮어쓰면 안 된다.
  assert.ok(p.includes('_probe'), '점검 경로에 _probe 표시가 없습니다: ' + p);
  assert.notEqual(p, S.filePath('2026', '12345', 'full'));
  assert.ok(p.startsWith('pu_photos/'), '창고 루트 밖으로 나가면 안 됩니다: ' + p);
});

test('창고가 연결되지 않았으면 점검이 곧바로 알려준다', async () => {
  const S = loadStore();
  S.init({ db: {}, storage: null });
  const r = await S.probe('1');
  assert.equal(r.ok, false);
  assert.equal(r.step, 'init');
  assert.match(r.message, /창고/);
});

test('점검이 통과하면 올리고·주소받고·지운다', async () => {
  const S = loadStore();
  const fs2 = fakeStorage({});
  S.init({ db: {}, storage: fs2 });
  const r = await S.probe('99');
  assert.equal(r.ok, true);
  assert.equal(r.step, 'done');
  assert.match(r.url, /^https:\/\//);
  // 점검 파일을 남기지 않는다.
  assert.ok(fs2.calls.some(c => c[0] === 'delete'), '점검 파일을 지우지 않았습니다');
});

test('올리기가 막히면 실패로 알려준다', async () => {
  const S = loadStore();
  S.init({ db: {}, storage: fakeStorage({ upload: 'fail' }) });
  const r = await S.probe('99');
  assert.equal(r.ok, false);
  assert.equal(r.step, 'upload');
  assert.match(r.message, /권한/);
});

test('올리기는 됐지만 지우기가 막히면 통과로 보되 알려준다', async () => {
  const S = loadStore();
  S.init({ db: {}, storage: fakeStorage({ del: 'fail' }) });
  const r = await S.probe('99');
  // 사진을 올릴 수는 있으니 창고는 쓸 수 있다. 다만 규칙을 손봐야 한다.
  assert.equal(r.ok, true);
  assert.equal(r.step, 'delete');
  assert.match(r.message, /지우기/);
});

test('점검이 실패해도 예외를 던지지 않는다', async () => {
  const S = loadStore();
  S.init({ db: {}, storage: { ref() { throw new Error('창고 설정이 없습니다'); } } });
  const r = await S.probe('99');
  assert.equal(r.ok, false);
  assert.equal(r.step, 'ref');
});

test('주소받기가 막히면 올리기 실패가 아니라 따로 알려주고 점검 파일을 지운다', async () => {
  const S = loadStore();
  const fs3 = fakeStorage({ url: 'fail' });
  S.init({ db: {}, storage: fs3 });
  const r = await S.probe('99');
  // 올리기는 성공했다 — 그러니 'upload' 단계로 보고하면 거짓 보고가 된다.
  // 실제로 막힌 곳인 'url' 단계로 정확히 알려줘야 한다.
  assert.equal(r.ok, false);
  assert.equal(r.step, 'url');
  assert.match(r.message, /주소/);
  // 주소를 못 받아도 파일은 이미 창고에 올라가 있다 — 점검은 흔적을 남기면 안 되므로
  // 실패 결과를 돌려주기 전에 반드시 지우기를 시도해야 한다.
  assert.ok(fs3.calls.some(c => c[0] === 'delete'), '주소받기 실패 후 점검 파일을 지우려 하지 않았습니다');
});

/* ── 창고 점검 결과 → 화면 문구 (probeMessage) ── */

test('여섯 가지 step 값 각각에 대해 서로 다른 문구가 나온다', () => {
  const S = loadStore();
  const cases = {
    done: { ok: true, step: 'done', url: 'https://example.test/x' },
    delete: { ok: true, step: 'delete', url: 'https://example.test/x', message: '올리기는 됐지만 지우기가 막혔습니다 — 권한이 없습니다' },
    init: { ok: false, step: 'init', message: '파일 창고가 연결되지 않았습니다' },
    ref: { ok: false, step: 'ref', message: '창고 설정이 없습니다' },
    upload: { ok: false, step: 'upload', message: '권한이 없습니다' },
    url: { ok: false, step: 'url', message: '주소를 못 받았습니다' }
  };
  const messages = {};
  for (const step of Object.keys(cases)) {
    const msg = S.probeMessage(cases[step]);
    assert.ok(msg && typeof msg === 'string' && msg.length > 0, step + ': 문구가 비어 있습니다');
    messages[step] = msg;
  }
  const values = Object.values(messages);
  const unique = new Set(values);
  assert.equal(unique.size, values.length, '서로 다른 step인데 같은 문구가 나왔습니다: ' + JSON.stringify(messages));
});

test('init 문구에는 규칙 이야기가 없고 연결 이야기가 있다', () => {
  // 회귀 방지: step:'init'은 창고 자체가 연결되지 않은 경우다. 이걸 규칙 문제로
  // 안내하면 대표님이 콘솔에서 엉뚱한 규칙을 고치게 된다(승인된 목업에서 지적된 오류).
  const S = loadStore();
  const msg = S.probeMessage({ ok: false, step: 'init', message: '파일 창고가 연결되지 않았습니다' });
  assert.ok(!/규칙/.test(msg), '연결 실패 문구에 규칙 이야기가 섞였습니다: ' + msg);
  assert.match(msg, /연결/);
});

test('ok:false 문구에는 막힌 단계와 메시지가 들어 있다', () => {
  const S = loadStore();
  for (const step of ['ref', 'upload', 'url']) {
    const msg = S.probeMessage({ ok: false, step: step, message: '이건-특정-메시지-내용' });
    assert.ok(msg.includes(step), step + ': 문구에 단계 이름이 없습니다: ' + msg);
    assert.ok(msg.includes('이건-특정-메시지-내용'), step + ': 문구에 메시지 내용이 없습니다: ' + msg);
  }
});

test('ok:true, step:delete 문구에는 사진을 담을 수 있다는 안내가 들어 있다', () => {
  const S = loadStore();
  const msg = S.probeMessage({ ok: true, step: 'delete', message: '지우기가 막혔습니다' });
  assert.match(msg, /사진.*담을 수 있습/);
});

test('어떤 결과를 넣어도 빈 문자열이나 undefined를 돌려주지 않는다', () => {
  const S = loadStore();
  const inputs = [
    {}, undefined, { ok: false, step: '모르는값' }, { ok: true },
    { ok: false }, { ok: true, step: '모르는값' }
  ];
  for (const input of inputs) {
    const msg = S.probeMessage(input);
    assert.notEqual(msg, undefined, JSON.stringify(input) + ': undefined가 나왔습니다');
    assert.notEqual(msg, '', JSON.stringify(input) + ': 빈 문자열이 나왔습니다');
    assert.equal(typeof msg, 'string', JSON.stringify(input) + ': 문자열이 아닙니다');
  }
});
