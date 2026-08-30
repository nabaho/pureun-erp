'use strict';
// js/pu-photo-store.js 단위 검사 — 실행: node --test tests/*.test.js
//   (이 환경의 node는 --test 에 디렉터리 인자를 주면 죽는다. 반드시 glob으로 파일을 넘긴다.)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// 브라우저 전역이 없는 노드에서 저장 층을 불러온다.
// 파일이 `window`에 붙으므로 가짜 window를 만들어 그 안에서 실행한다.
function loadStore(extraGlobals) {
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'pu-photo-store.js'), 'utf8');
  /* extraGlobals: 창고 읽기(fetchFromBucket)가 쓰는 fetch·FileReader 는 브라우저
     전역이라 노드에 없다 — vm 이 만드는 별도 realm 의 전역에 직접 심어 줘야
     저장 층 안의 맨이름 fetch(...)/new FileReader() 가 이것을 찾는다. */
  const sandbox = Object.assign({ window: {}, console }, extraGlobals || {});
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
  // pucards(기업정보함)·data(포털) 루트를 건드리면 실데이터가 오염된다.
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
  S.init({ uid: 'U1' });
  // 목록만 읽을 때 사진까지 내려받으면 앱이 느려진다. 반드시 분리한다.
  assert.equal(S.metaPath('2026', 'abc'), 'puphotos/u/U1/items/2026/abc');
  assert.equal(S.blobPath('2026', 'abc'), 'puphotos/u/U1/blobs/2026/abc');
  assert.notEqual(S.metaPath('2026', 'abc'), S.blobPath('2026', 'abc'));
});

/* 2026-08-13 비용 조사 뒤 대표 선택("구별을 둔다") — 창고 경로도 실시간DB처럼
   사람별 자리로 갈린다. 예전에는 `pu_photos/{연도}/{번호}.jpg` 로 주인이 없어,
   사업자등록증·명함·계약서가 든 사진을 번호만 알면 아무나 겨눌 수 있었다. */
test('파일 창고 경로도 사람별 자리로 갈린다', () => {
  const S = loadStore();
  S.init({ uid: 'U1' });
  assert.equal(S.filePath('2026', 'abc', 'full'), 'pu_photos/u/U1/blobs/2026/abc.jpg');
  assert.equal(S.filePath('2026', 'abc', 'thumb'), 'pu_photos/u/U1/thumbs/2026/abc.jpg');
  assert.notEqual(S.filePath('2026', 'abc', 'full'), S.filePath('2026', 'abc', 'thumb'));
  // owner 를 넘기면 그 사람 자리 — 관리자가 남의 사진을 옮길 때 쓴다.
  assert.equal(S.filePath('2026', 'abc', 'full', 'U2'), 'pu_photos/u/U2/blobs/2026/abc.jpg');
});

test('★ 계정을 모르면 창고 경로도 안 만든다 — 남의 자리를 가리키면 안 된다', () => {
  const S = loadStore();
  // init 을 안 했으니 deps.uid 도 없다 — base() 가 이미 지키는 것과 같은 벽이다.
  assert.throws(() => S.filePath('2026', 'abc', 'full'), /계정을 알 수 없습니다/);
});

test('파일 종류가 full·thumb 가 아니면 예외를 던진다', () => {
  const S = loadStore();
  S.init({ uid: 'U1' });
  // 왜 던지는가: 예전에는 'thumb'이 아닌 모든 값을 원본 축소본 경로로 돌려줬다.
  // 그러면 'thumbnail' 같은 오타 한 번에 격자용 미리보기가 원본 축소본을 덮어쓴다.
  // 사진은 증빙 자료라 덮어쓰면 되돌릴 수 없다 — 조용한 사고보다 즉시 터지는 게 낫다.
  assert.throws(() => S.filePath('2026', 'abc', 'thumbnail'), /full 또는 thumb/);
  assert.throws(() => S.filePath('2026', 'abc', ''), /full 또는 thumb/);
  assert.throws(() => S.filePath('2026', 'abc', undefined), /full 또는 thumb/);
  assert.throws(() => S.filePath('2026', 'abc'), /full 또는 thumb/);
  // 정상 값은 그대로 동작한다.
  assert.equal(S.filePath('2026', 'abc', 'full'), 'pu_photos/u/U1/blobs/2026/abc.jpg');
  assert.equal(S.filePath('2026', 'abc', 'thumb'), 'pu_photos/u/U1/thumbs/2026/abc.jpg');
});

test('경로가 연도로 갈라진다', () => {
  const S = loadStore();
  S.init({ uid: 'U1' });
  // 연도별로 나눠야 평소에 올해 것만 불러올 수 있다.
  assert.ok(S.metaPath('2026', 'x').includes('/2026/'));
  assert.ok(S.filePath('2025', 'x', 'full').includes('/2025/'));
});

/* ── 저장 방식 선택 ── */

test('저장 방식 기본값은 창고다 — 2026-08-15 새 창고 점검 통과 뒤 확정', () => {
  const S = loadStore();
  // 창고 점검(probe)을 통과하고 대표 승인을 받은 뒤에야 이 기본값을 바꿨다.
  // 다시 되돌릴 일이 있으면(장애 등) js/pu-photo-store.js 의 var mode 한 줄만
  // 'rtdb' 로 되돌리면 된다 — 이미 옮겨진 사진은 loc:'storage' 표시 덕에
  // 계속 보인다(loadFull/loadThumb 이 창고를 먼저 본다).
  assert.equal(S.getMode(), 'storage');
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
  assert.equal(S.init({ uid: 'U1', db: fakeDb, storage: fakeStorage, mode: 'storage' }), 'storage');
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
  S.init({ uid: 'U1' });
  const p = S.probePath('12345');
  // 점검이 실사진을 덮어쓰면 안 된다.
  assert.ok(p.includes('_probe'), '점검 경로에 _probe 표시가 없습니다: ' + p);
  assert.notEqual(p, S.filePath('2026', '12345', 'full'));
  assert.ok(p.startsWith('pu_photos/'), '창고 루트 밖으로 나가면 안 됩니다: ' + p);
});

test('창고가 연결되지 않았으면 점검이 곧바로 알려준다', async () => {
  const S = loadStore();
  S.init({ uid: 'U1', db: {}, storage: null });
  const r = await S.probe('1');
  assert.equal(r.ok, false);
  assert.equal(r.step, 'init');
  assert.match(r.message, /창고/);
});

test('점검이 통과하면 올리고·주소받고·지운다', async () => {
  const S = loadStore();
  const fs2 = fakeStorage({});
  S.init({ uid: 'U1', db: {}, storage: fs2 });
  const r = await S.probe('99');
  assert.equal(r.ok, true);
  assert.equal(r.step, 'done');
  assert.match(r.url, /^https:\/\//);
  // 점검 파일을 남기지 않는다.
  assert.ok(fs2.calls.some(c => c[0] === 'delete'), '점검 파일을 지우지 않았습니다');
});

test('올리기가 막히면 실패로 알려준다', async () => {
  const S = loadStore();
  S.init({ uid: 'U1', db: {}, storage: fakeStorage({ upload: 'fail' }) });
  const r = await S.probe('99');
  assert.equal(r.ok, false);
  assert.equal(r.step, 'upload');
  assert.match(r.message, /권한/);
});

test('올리기는 됐지만 지우기가 막히면 통과로 보되 알려준다', async () => {
  const S = loadStore();
  S.init({ uid: 'U1', db: {}, storage: fakeStorage({ del: 'fail' }) });
  const r = await S.probe('99');
  // 사진을 올릴 수는 있으니 창고는 쓸 수 있다. 다만 규칙을 손봐야 한다.
  assert.equal(r.ok, true);
  assert.equal(r.step, 'delete');
  assert.match(r.message, /지우기/);
});

test('점검이 실패해도 예외를 던지지 않는다', async () => {
  const S = loadStore();
  S.init({ uid: 'U1', db: {}, storage: { ref() { throw new Error('창고 설정이 없습니다'); } } });
  const r = await S.probe('99');
  assert.equal(r.ok, false);
  assert.equal(r.step, 'ref');
});

test('주소받기가 막히면 올리기 실패가 아니라 따로 알려주고 점검 파일을 지운다', async () => {
  const S = loadStore();
  const fs3 = fakeStorage({ url: 'fail' });
  S.init({ uid: 'U1', db: {}, storage: fs3 });
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

/* 이 단계의 핵심 산출물은 '점검이 어디서 막혔는지 정확히 알려주는 것'이다.
   대표님은 이 문구만 보고 파이어베이스 콘솔에서 규칙을 손보신다. 그래서 문구가
   엉뚱하면 콘솔에서 엉뚱한 규칙을 고치게 된다 — 코드 버그보다 비싸다.

   ⚠ 아래 '여섯 갈래' 검사는 반드시 여섯 갈래 전부에 **같은 message 값**을 넣는다.
   예전 검사는 갈래마다 message를 다르게 넣어 문구를 비교했다. 그러면 message만
   달라도 통과하므로, ref·upload·url 에 똑같은 안내 문장을 써도 검사가 통과했다.
   실제로 그 결함(세 실패를 한 문구로 뭉쳐 잘못된 조치를 지시)을 이 검사가 놓쳤다.
   message를 고정해야 '안내 문장 자체'가 서로 다른지 검사할 수 있다. */

// 여섯 갈래 전부에 넣는 같은 오류문(파이어베이스가 주는 영어 오류문 자리).
const SAME_MESSAGE = 'Firebase-오류문-고정값';

function sixBranches() {
  return {
    done: { ok: true, step: 'done', url: 'https://example.test/x', message: SAME_MESSAGE },
    delete: { ok: true, step: 'delete', url: 'https://example.test/x', message: SAME_MESSAGE },
    init: { ok: false, step: 'init', message: SAME_MESSAGE },
    ref: { ok: false, step: 'ref', message: SAME_MESSAGE },
    upload: { ok: false, step: 'upload', message: SAME_MESSAGE },
    url: { ok: false, step: 'url', message: SAME_MESSAGE }
  };
}

// 갈래별 문구를 {step: 문구} 로 만든다.
function branchMessages(S) {
  const cases = sixBranches();
  const out = {};
  for (const step of Object.keys(cases)) out[step] = S.probeMessage(cases[step]);
  return out;
}

test('여섯 갈래의 안내 문장이 서로 다르다 (오류문을 같게 고정해도)', () => {
  const S = loadStore();
  const messages = branchMessages(S);
  for (const step of Object.keys(messages)) {
    const msg = messages[step];
    assert.ok(msg && typeof msg === 'string' && msg.length > 0, step + ': 문구가 비어 있습니다');
  }
  // 오류문이 같으므로, 문구가 겹치면 그건 안내 문장 자체가 같다는 뜻이다.
  const values = Object.values(messages);
  assert.equal(new Set(values).size, values.length,
    '오류문이 같을 때 겹치는 문구가 있습니다 = 안내 문장을 뭉쳐 놨습니다: ' + JSON.stringify(messages, null, 2));
});

test('설정 문제(창고 미연결·창고 설정)에는 규칙 이야기를 하지 않는다', () => {
  // 회귀 방지: 이 두 갈래는 규칙 문제가 아니라 설정 문제다. 규칙 문제로 안내하면
  // 대표님이 콘솔에서 있지도 않은 규칙을 고치신다.
  const S = loadStore();
  const messages = branchMessages(S);
  for (const step of ['init', 'ref']) {
    assert.ok(!/규칙/.test(messages[step]),
      step + ' 갈래 문구에 규칙 이야기가 섞였습니다: ' + messages[step]);
  }
  assert.match(messages.init, /연결/);
});

test('올리기가 막힌 갈래는 쓰기 권한을 넣으라고 말한다', () => {
  const S = loadStore();
  const msg = branchMessages(S).upload;
  assert.match(msg, /쓰기/, '쓰기 권한 이야기가 없습니다: ' + msg);
  assert.match(msg, /권한/, '권한 이야기가 없습니다: ' + msg);
});

test('주소받기가 막힌 갈래는 올리기는 됐다고 말하고 읽기 권한만 요구한다', () => {
  // 회귀 방지: 이 갈래는 쓰기가 이미 성공한 경우다 = 쓰기 규칙은 있다는 뜻이다.
  // "규칙이 없을 수 있다"고 하면 대표님이 이미 있는 규칙을 다시 쓰신다.
  // 실제로 없는 것은 읽기 권한뿐이다.
  const S = loadStore();
  const msg = branchMessages(S).url;
  assert.match(msg, /올리/, '올리기가 됐다는 말이 없습니다: ' + msg);
  assert.match(msg, /읽/, '읽기 권한 이야기가 없습니다: ' + msg);
  assert.ok(!/규칙이[^\n]{0,10}없/.test(msg), '규칙이 없다고 잘못 안내합니다: ' + msg);
});

test('지우기만 막힌 갈래는 사진을 담을 수 있다고 말한다', () => {
  const S = loadStore();
  const msg = branchMessages(S).delete;
  assert.match(msg, /사진.*담을 수 있습/, msg);
});

test('여섯 갈래 어디에도 영어 내부 단계 이름이 노출되지 않는다', () => {
  // 저장소 규칙: 설명은 짧고 쉬운 한국어. 파일 경로·함수 이름·내부 단계 이름은
  // 대표님이 직접 입력할 때만 노출한다. 'done'·'delete'는 영어 단어이면서
  // 흔한 오류문에 잘 안 나오는 편이라, 내부용으로 새는 네 개만 못 박는다.
  const S = loadStore();
  const messages = branchMessages(S);
  for (const step of Object.keys(messages)) {
    // 오류문(고정값)에는 이 단어들이 없으므로, 나오면 우리 문구가 노출한 것이다.
    for (const word of ['init', 'ref', 'upload', 'url']) {
      assert.ok(!new RegExp(word, 'i').test(messages[step]),
        step + ' 갈래 문구에 영어 단계 이름 "' + word + '"이 노출됐습니다: ' + messages[step]);
    }
  }
});

test('done 말고는 모든 갈래 문구에 원인 오류문이 담긴다', () => {
  // 파이어베이스가 준 영어 오류문은 진단에 필요하므로 반드시 남긴다.
  // 다만 영어라서 먼저 읽히면 안 되니, 한국어 안내가 앞에 오고 뒤에 붙어야 한다.
  const S = loadStore();
  const messages = branchMessages(S);
  for (const step of ['delete', 'init', 'ref', 'upload', 'url']) {
    const msg = messages[step];
    assert.ok(msg.includes(SAME_MESSAGE), step + ': 문구에 원인 오류문이 없습니다: ' + msg);
    assert.ok(msg.indexOf(SAME_MESSAGE) > 0, step + ': 영어 오류문이 한국어 안내보다 앞에 옵니다: ' + msg);
  }
  // done 은 오류가 없으므로 원인을 붙이지 않는다.
  assert.ok(!S.probeMessage({ ok: true, step: 'done', url: 'https://example.test/x' }).includes('원인'));
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

/* ── B단계: 미리보기 경로 · 촬영 시각 · EXIF ── */

test('미리보기 경로 — 본문과 다른 곳에 담긴다', () => {
  const S = loadStore();
  S.init({ uid: 'U1' });
  // 격자가 본문(1600px)까지 받으면 느려진다. 반드시 갈라 둔다.
  assert.equal(S.thumbPath('2026', 'p1'), 'puphotos/u/U1/thumbs/2026/p1');
  assert.notEqual(S.thumbPath('2026', 'p1'), S.blobPath('2026', 'p1'));
  assert.notEqual(S.thumbPath('2026', 'p1'), S.metaPath('2026', 'p1'));
});

test('촬영 시각 — EXIF가 첫째, 파일 날짜가 둘째, 업로드 시각이 마지막', () => {
  const S = loadStore();
  // 카톡을 거친 사진은 EXIF가 지워져 있다 — 그때는 파일 날짜, 그것도 없으면 올린 때.
  assert.equal(S.pickTakenAt(111, 222, 333), 111);
  assert.equal(S.pickTakenAt(null, 222, 333), 222);
  assert.equal(S.pickTakenAt(null, 0, 333), 333);
  assert.equal(S.pickTakenAt(NaN, undefined, 333), 333);
  assert.equal(S.pickTakenAt(-5, -1, 333), 333);
});

/* 최소 JPEG을 손으로 조립한다 — SOI + APP1(Exif, 리틀엔디안 TIFF,
   IFD0에 ExifIFD 포인터, ExifIFD에 DateTimeOriginal 문자열). */
function makeExifJpeg(dateStr) {
  const buf = new ArrayBuffer(76);
  const v = new DataView(buf);
  v.setUint16(0, 0xFFD8);            // SOI
  v.setUint16(2, 0xFFE1);            // APP1
  v.setUint16(4, 72);                // APP1 길이(자기 자신 포함)
  v.setUint32(6, 0x45786966);        // 'Exif'
  v.setUint16(10, 0);                // \0\0
  const t = 12;                      // TIFF 머리 시작
  v.setUint16(t, 0x4949);            // 'II' 리틀엔디안
  v.setUint16(t + 2, 0x2A, true);
  v.setUint32(t + 4, 8, true);       // IFD0 위치(상대)
  // IFD0 (상대 8): 항목 1개 — ExifIFD 포인터(0x8769)
  v.setUint16(t + 8, 1, true);
  v.setUint16(t + 10, 0x8769, true); // 태그
  v.setUint16(t + 12, 4, true);      // LONG
  v.setUint32(t + 14, 1, true);      // 개수
  v.setUint32(t + 18, 26, true);     // ExifIFD 위치(상대)
  v.setUint32(t + 22, 0, true);      // 다음 IFD 없음
  // ExifIFD (상대 26): 항목 1개 — DateTimeOriginal(0x9003)
  v.setUint16(t + 26, 1, true);
  v.setUint16(t + 28, 0x9003, true);
  v.setUint16(t + 30, 2, true);      // ASCII
  v.setUint32(t + 32, 20, true);     // 20자
  v.setUint32(t + 36, 44, true);     // 문자열 위치(상대)
  v.setUint32(t + 40, 0, true);      // 다음 IFD 없음
  const s = dateStr + '\0';
  for (let i = 0; i < s.length; i++) v.setUint8(t + 44 + i, s.charCodeAt(i) & 0xFF);
  return buf;
}

test('EXIF에서 촬영 시각을 읽는다', () => {
  const S = loadStore();
  const ts = S.exifTakenAt(makeExifJpeg('2026:07:15 14:30:00'));
  assert.ok(ts, '촬영 시각을 못 읽었습니다');
  const d = new Date(ts);
  assert.equal(d.getFullYear(), 2026);
  assert.equal(d.getMonth(), 6);
  assert.equal(d.getDate(), 15);
  assert.equal(d.getHours(), 14);
  assert.equal(d.getMinutes(), 30);
});

test('EXIF 없는 JPEG·JPEG 아닌 것·이상한 입력 → null (예외를 던지지 않는다)', () => {
  const S = loadStore();
  assert.equal(S.exifTakenAt(new Uint8Array([0xFF, 0xD8, 0xFF, 0xD9]).buffer), null);
  assert.equal(S.exifTakenAt(new Uint8Array([0, 1, 2, 3]).buffer), null);
  assert.equal(S.exifTakenAt(new ArrayBuffer(0)), null);
  assert.equal(S.exifTakenAt(null), null);
  assert.equal(S.exifTakenAt(undefined), null);
});

test('EXIF 날짜가 깨져 있으면 null', () => {
  const S = loadStore();
  assert.equal(S.exifTakenAt(makeExifJpeg('사진기가 이상한 값을 줬')), null);
  assert.equal(S.exifTakenAt(makeExifJpeg('0000:00:00 00:00:00')), null);
});

test('한 번에 올릴 수 있는 장수 상한이 저장 층에 있다', () => {
  // 화면마다 숫자를 박으면 폰·PC·다른 앱이 서로 다른 상한을 갖게 된다.
  const S = loadStore();
  assert.equal(typeof S.UPLOAD_MAX, 'number');
  assert.ok(S.UPLOAD_MAX >= 10 && S.UPLOAD_MAX <= 100,
    '상한이 현실적이지 않습니다: ' + S.UPLOAD_MAX);
});

/* ── 서류 고화질 ── */

test('올릴 크기 — 서류는 2600px 고품질, 일반 사진은 1600px', () => {
  const S = loadStore();
  /* 서류(명함·사업자등록증·중소기업확인서)는 글씨를 읽어야 하는 물건이라
     일반 현장사진과 기준이 달라야 한다(2026-08-03 대표 지시).

     검사고정-허용 — 이 숫자는 «지금 값»이 아니라 **대표가 요금을 보고 정한 규칙**이다.
     · 3200 → 2000 (2026-08-13, 비용): 실시간DB 내려받기가 청구서의 93%였다.
     · 2000 → 2600 (2026-08-30): 8/17 에 사진을 창고로 옮겨 그 까닭이 없어졌다
       (8월 실시간DB ₩70,030 · 사진 창고 ₩0.12). 대표 지적은 「근무표처럼 칸이
       촘촘한 표가 흐리다」 — A4 기준 170dpi → 220dpi.
     ⚠ 이 숫자를 올릴 때는 **판독에 보내는 크기**(js/pu-doc-read.js 의 AI_SEND_EDGE)를
       반드시 함께 본다. 그대로 보내면 AI 가 세는 조각 수가 늘어 **판독 한 번 값이
       두 배**가 된다.
     ⚠ PDF 그리는 배율도 함께 본다 — 상한보다 작게 그리면 상한을 놀린다
       (tests/photos-dash-tidy.test.js 가 그 관계를 기계로 지킨다). */
  assert.equal(S.uploadSpec(true).maxEdge, 2600);
  assert.equal(S.uploadSpec(false).maxEdge, 1600);
  assert.ok(S.uploadSpec(true).quality > S.uploadSpec(false).quality,
    '서류 품질이 일반 사진보다 높지 않습니다');
  // 미리보기는 종류와 무관하게 격자용 작은 것으로 통일한다.
  assert.equal(S.uploadSpec(true).thumbEdge, S.uploadSpec(false).thumbEdge);
});

test('★ 서류 상한이 「원본이 작습니다」 문턱보다 커야 한다', () => {
  /* 사진첩은 계약서·서식·근태표가 1600px 미만이면 「원본이 작습니다 — 지어냈을 수
     있습니다」로 경고하고 할 일에 올린다(MIN_READ_EDGE). 올리는 상한을 그 아래로
     내리면 **새로 올린 서류가 죄다 경고를 달고 쌓인다** — 경고가 무의미해진다. */
  const S = loadStore();
  const app = fs.readFileSync(path.join(__dirname, '..', 'pu-photos.html'), 'utf8');
  const m = app.match(/^const MIN_READ_EDGE = \{[\s\S]*?\n\};/m);
  assert.ok(m, 'MIN_READ_EDGE 를 찾을 수 없습니다');
  const worst = (m[0].match(/:\s*(\d+)/g) || [])
    .map(function (s) { return Number(s.replace(/[^\d]/g, '')); })
    .reduce(function (a, b) { return Math.max(a, b); }, 0);
  assert.ok(S.uploadSpec(true).maxEdge >= worst,
    '★ 올리는 상한(' + S.uploadSpec(true).maxEdge + ')이 경고 문턱(' + worst + ')보다 작습니다');
});

/* ── B단계: 실시간DB 저장·읽기 ── */

// 실시간DB 흉내 — update/once 호출을 기록한다. 실서버에는 절대 안 붙는다.
function fakeDb(data) {
  const calls = { update: [], once: [] };
  return {
    calls,
    ref(p) {
      return {
        update(u) { calls.update.push({ path: p || '', u }); return Promise.resolve(); },
        once() {
          calls.once.push(p);
          return Promise.resolve({ val: () => (data === undefined ? null : data) });
        },
        push() { return { key: '-fake' + (calls.update.length + calls.once.length) }; }
      };
    }
  };
}

test('savePhoto — 사진 세 경로와 사용자 색인이 update 한 번으로 담긴다', async () => {
  const S = loadStore();
  const db = fakeDb();
  S.init({ uid: 'U1', db });
  const r = await S.savePhoto({
    id: 'p1', takenAt: new Date(2026, 6, 15).getTime(),
    meta: { takenAt: 1, upAt: new Date(2026, 6, 15).getTime() },
    full: 'data:full', thumb: 'data:thumb'
  });
  // 주의: 샌드박스(vm) 안에서 만들어진 객체는 프로토타입이 달라 strict 비교가
  // 실패한다 — 복사본으로 비교한다.
  assert.deepEqual({ ...r }, { year: '2026', id: 'p1' });
  // 반드시 update 한 번 — 상위 노드 set 은 남의 사진을 지운다(2026-07 사고).
  assert.equal(db.calls.update.length, 1);
  assert.equal(db.calls.update[0].path, '');
  const u = db.calls.update[0].u;
  assert.deepEqual(Object.keys(u).sort(), [
    'puphotos/owners/U1', 'puphotos/u/U1/blobs/2026/p1',
    'puphotos/u/U1/items/2026/p1', 'puphotos/u/U1/thumbs/2026/p1'
  ]);
  assert.equal(u['puphotos/u/U1/blobs/2026/p1'], 'data:full');
  assert.equal(u['puphotos/u/U1/thumbs/2026/p1'], 'data:thumb');
});

test('savePhoto — 촬영 시각을 모르는 사진은 unknown 연도로', async () => {
  const S = loadStore();
  const db = fakeDb();
  S.init({ uid: 'U1', db });
  const r = await S.savePhoto({ id: 'p2', takenAt: null, meta: {}, full: 'f', thumb: 't' });
  assert.equal(r.year, 'unknown');
  const photoKeys = Object.keys(db.calls.update[0].u).filter(k => k !== 'puphotos/owners/U1');
  assert.ok(photoKeys.every(k => k.includes('/unknown/')));
});

test('savePhoto — 실시간DB가 없으면 한국어로 거절한다', async () => {
  const S = loadStore();
  S.init({ uid: 'U1' });
  await assert.rejects(
    () => S.savePhoto({ id: 'x', takenAt: 1, meta: {}, full: '', thumb: '' }),
    /실시간DB/);
});

test('savePhoto — 창고 방식인데 창고를 안 이어 줬으면 실시간DB로 그대로 담는다', async () => {
  /* 2026-08-13 이전에는 mode:'storage' 만으로 무조건 거절했다. 지금은 창고
     코드가 실제로 있으므로, deps.storage 가 없을 때는 조용히 실시간DB로
     담는다 — 화면이 mode 를 미리 켜 놔도 사진을 못 올리는 일이 없다. */
  const S = loadStore();
  const db = fakeDb();
  S.init({ uid: 'U1', db, mode: 'storage' });
  const r = await S.savePhoto({ id: 'x', takenAt: 1, meta: {}, full: 'data:f', thumb: 'data:t' });
  assert.equal(r.id, 'x');
  const u = db.calls.update[0].u;
  assert.equal(u['puphotos/u/U1/blobs/unknown/x'], 'data:f', '창고가 없으면 실시간DB에 담아야 합니다');
});

/* ── 창고 저장 (2026-08-13, 비용 조사 뒤 실행) ── */

test('★ savePhoto — 창고 방식은 본문·미리보기를 창고에 올리고, 실시간DB엔 정보만 남긴다', async () => {
  const S = loadStore();
  const db = fakeDb();
  const st = fakeStorage({});
  S.init({ uid: 'U1', db, storage: st, mode: 'storage' });
  const r = await S.savePhoto({
    id: 'p1', meta: { upAt: new Date(2026, 6, 15).getTime() }, full: 'data:full', thumb: 'data:thumb'
  });
  assert.equal(r.year, '2026');
  // 창고에 두 파일이 올라갔다 — 사람별 자리로
  assert.ok(st.calls.some(c => c[0] === 'putString' && c[1] === 'pu_photos/u/U1/blobs/2026/p1.jpg' && c[2] === 'data:full'));
  assert.ok(st.calls.some(c => c[0] === 'putString' && c[1] === 'pu_photos/u/U1/thumbs/2026/p1.jpg' && c[2] === 'data:thumb'));
  // 실시간DB에는 본문·미리보기가 없다 — 정보만
  const u = db.calls.update[0].u;
  assert.deepEqual(Object.keys(u).sort(), ['puphotos/owners/U1', 'puphotos/u/U1/items/2026/p1']);
  assert.equal(u['puphotos/u/U1/items/2026/p1'].loc, 'storage',
    '★ loc 표시가 없으면 지우기·복원·용량 계산이 본문을 실시간DB에서 찾습니다');
});

test('★ savePhoto — 창고 올리기가 실패하면 실시간DB로 물러난다(사진을 잃지 않는다)', async () => {
  const S = loadStore();
  const db = fakeDb();
  const st = fakeStorage({ upload: 'fail' });
  S.init({ uid: 'U1', db, storage: st, mode: 'storage' });
  const r = await S.savePhoto({ id: 'p2', meta: {}, full: 'data:full', thumb: 'data:thumb' });
  assert.equal(r.id, 'p2');
  const u = db.calls.update[0].u;
  assert.equal(u['puphotos/u/U1/blobs/unknown/p2'], 'data:full',
    '★ 창고가 막혔는데 실시간DB에도 안 남으면 사진을 잃습니다');
  assert.equal(u['puphotos/u/U1/items/unknown/p2'].loc, undefined,
    '실시간DB로 물러났으면 loc 표시를 남기면 안 됩니다 — 본문이 실시간DB에 있습니다');
});

test('★ savePhoto — 축소본은 올렸는데 미리보기가 실패해도 실시간DB로 통째로 물러난다', () => {
  /* 반쪽만 창고에 남고 반쪽은 실시간DB에 남으면, 어디에도 온전한 사진이 없다.
     "본문 없이 정보만 있는 사진이 생기면 안 된다"— 실패는 반드시 통째로 물러난다. */
  return (async () => {
    const S = loadStore();
    const db = fakeDb();
    let n = 0;
    const st = {
      ref(p) {
        n++;
        return {
          putString() { return n === 1 ? Promise.resolve() : Promise.reject(new Error('막힘')); }
        };
      }
    };
    S.init({ uid: 'U1', db, storage: st, mode: 'storage' });
    const r = await S.savePhoto({ id: 'p3', meta: {}, full: 'data:full', thumb: 'data:thumb' });
    const u = db.calls.update[0].u;
    assert.equal(u['puphotos/u/U1/blobs/unknown/p3'], 'data:full');
    assert.equal(u['puphotos/u/U1/thumbs/unknown/p3'], 'data:thumb');
  })();
});

/* ── 본문 다시 올리기 · 돌리기 — 창고 방식 (2026-08-15, "원본이 없습니다" 복구) ── */

test('★ replaceImage — 창고 방식은 새 본문을 올리고 확인한 뒤에야 loc·옛 실시간DB 본문을 정리한다', async () => {
  const S = loadStore(webShims());
  const db = mutableDb({
    puphotos: { u: { U1: {
      items: { 2026: { p1: { takenAt: 1 } } },
      blobs: { 2026: { p1: 'data:old' } },
      thumbs: { 2026: { p1: 'data:oldthumb' } }
    } } }
  });
  const st = fakeStorage({});
  S.init({ uid: 'U1', db, storage: st, mode: 'storage' });
  await S.replaceImage('2026', 'p1', 'data:newfull', 'data:newthumb');
  assert.ok(st.calls.some(c => c[0] === 'putString' && c[1] === 'pu_photos/u/U1/blobs/2026/p1.jpg' && c[2] === 'data:newfull'));
  assert.ok(st.calls.some(c => c[0] === 'putString' && c[1] === 'pu_photos/u/U1/thumbs/2026/p1.jpg' && c[2] === 'data:newthumb'));
  assert.equal(db.tree.puphotos.u.U1.items['2026'].p1.loc, 'storage',
    '★ loc 표시가 없으면 다음에 읽을 때 실시간DB의 빈 자리를 찾습니다');
  assert.equal(db.tree.puphotos.u.U1.blobs['2026'].p1, undefined, '옛 본문을 안 지웠습니다');
  assert.equal(db.tree.puphotos.u.U1.thumbs['2026'].p1, undefined);
});

test('★ replaceImage — 순서는 반드시 올리기 → 확인 → 옛 본문 정리다(먼저 지우면 안 된다)', async () => {
  const S = loadStore(webShims());
  const db = mutableDb({
    puphotos: { u: { U1: {
      items: { 2026: { p1: { takenAt: 1 } } },
      blobs: { 2026: { p1: 'data:old' } },
      thumbs: { 2026: { p1: 'data:oldthumb' } }
    } } }
  });
  const st = fakeStorage({});
  const timeline = [];
  const stPush = st.calls.push.bind(st.calls);
  st.calls.push = function (c) { timeline.push('storage:' + c[0] + ':' + c[1]); return stPush(c); };
  S.init({ uid: 'U1', db, storage: st, mode: 'storage' });
  const dbPush = db.calls.update.push.bind(db.calls.update);
  db.calls.update.push = function (c) {
    const clearsBlob = Object.keys(c.u).some(function (k) { return k.indexOf('/blobs/') >= 0 && c.u[k] === null; });
    timeline.push(clearsBlob ? 'db-clear-blob' : 'db-update');
    return dbPush(c);
  };
  await S.replaceImage('2026', 'p1', 'data:newfull', 'data:newthumb');
  const upAt = timeline.findIndex(s => s.startsWith('storage:putString:'));
  let getAt = -1;
  for (let i = timeline.length - 1; i >= 0; i--) {
    if (timeline[i].startsWith('storage:getDownloadURL:')) { getAt = i; break; }
  }
  const clearAt = timeline.indexOf('db-clear-blob');
  assert.ok(upAt >= 0 && getAt >= 0 && clearAt >= 0, '★ 올리기·확인·정리 차례를 찾을 수 없습니다: ' + timeline.join(' > '));
  assert.ok(upAt < getAt, '★ 확인하기 전에 이미 올렸어야 합니다(차례가 뒤집혔습니다): ' + timeline.join(' > '));
  assert.ok(getAt < clearAt, '★ 확인하기 전에 실시간DB 옛 본문을 지우면 안 됩니다: ' + timeline.join(' > '));
});

test('★ replaceImage — 창고 올리기가 실패하면 실시간DB에 새 본문을 담는다(사진을 잃지 않는다)', async () => {
  const S = loadStore();
  const db = mutableDb({
    puphotos: { u: { U1: {
      items: { 2026: { p1: { takenAt: 1 } } },
      blobs: { 2026: { p1: 'data:old' } },
      thumbs: { 2026: { p1: 'data:oldthumb' } }
    } } }
  });
  const st = fakeStorage({ upload: 'fail' });
  S.init({ uid: 'U1', db, storage: st, mode: 'storage' });
  await S.replaceImage('2026', 'p1', 'data:newfull', 'data:newthumb');
  assert.equal(db.tree.puphotos.u.U1.blobs['2026'].p1, 'data:newfull',
    '★ 창고가 막혔는데 실시간DB에도 새 본문이 없으면 사진을 잃습니다');
  assert.equal(db.tree.puphotos.u.U1.thumbs['2026'].p1, 'data:newthumb');
  assert.equal(db.tree.puphotos.u.U1.items['2026'].p1.loc, undefined,
    '실시간DB로 물러났으면 loc 표시를 남기면 안 됩니다 — 본문이 실시간DB에 있습니다');
});

/* ── 읽기 — 창고 먼저, 안 되면 실시간DB (2026-08-13) ── */

test('★ loadFull — 창고에 있으면 창고에서 받는다', async () => {
  const S = loadStore({
    fetch: () => Promise.resolve({ ok: true, blob: () => Promise.resolve('BLOB') }),
    FileReader: function () {
      const r = this;
      // 브라우저처럼 다음 틱에 onload 가 불린다 — 동기로 부르면 실제 동작과 달라진다.
      this.readAsDataURL = function () { setTimeout(function () { r.result = 'data:from-storage'; r.onload && r.onload(); }, 0); };
    }
  });
  const st = fakeStorage({});
  S.init({ uid: 'U1', db: fakeDb('data:from-rtdb'), storage: st });
  const v = await S.loadFull('2026', 'p1');
  assert.equal(v, 'data:from-storage', '창고에 있는데 실시간DB 값을 돌려줬습니다');
});

test('★ loadFull — 창고가 없거나 실패하면 실시간DB로 물러난다', async () => {
  const S = loadStore();
  S.init({ uid: 'U1', db: fakeDb('data:from-rtdb') }); // storage 를 안 넘김
  const v = await S.loadFull('2026', 'p1');
  assert.equal(v, 'data:from-rtdb');
});

test('창고가 있어도 그 파일이 없으면(404) 실시간DB로 물러난다', async () => {
  const S = loadStore();
  S.init({ uid: 'U1', db: fakeDb('data:from-rtdb'), storage: { ref() { return { getDownloadURL() { return Promise.reject(new Error('object-not-found')); } }; } } });
  const v = await S.loadFull('2026', 'p1');
  assert.equal(v, 'data:from-rtdb');
});

test('newId — db가 있으면 push 키, 없으면 임시 키', () => {
  const S = loadStore();
  S.init({ uid: 'U1', db: fakeDb() });
  assert.match(S.newId(), /^-fake/);
  const S2 = loadStore();
  S2.init({ uid: 'U1' });
  assert.ok(S2.newId().length > 5);
});

test('listYear — 그 연도 목록만 한 번 읽는다', async () => {
  const S = loadStore();
  const db = fakeDb({ a: { takenAt: 1 } });
  S.init({ uid: 'U1', db });
  const items = await S.listYear('2026');
  // 샌드박스(vm) 안에서 만들어진 객체는 프로토타입이 달라 복사본으로 비교한다
  const got = JSON.parse(JSON.stringify(items));
  /* 모양을 통째로 못 박지 않는다 — 칸이 하나 늘 때마다 배포가 막힌다.
     여기서 볼 것은 「그 해 사진이 나온다」와 「원래 값이 살아 있다」 두 가지다. */
  assert.deepEqual(Object.keys(got), ['a']);
  assert.equal(got.a.takenAt, 1);
  // 옮기기 전에도 사진이 보이도록 옛 자리도 함께 읽는다
  assert.deepEqual(db.calls.once.sort(), ['puphotos/items/2026', 'puphotos/u/U1/items/2026']);
});

/* 2026-08-13 김보람 제보 — 받은 사진·다른 해 사진이 검은 화면만 뜨던 일.
   본문·미리보기를 «화면의 해»로 찾다가 빗나간 것이 뿌리였다.
   목록이 사진마다 「어느 해 자리에서 왔는지」를 새겨 주어야 화면이 제대로 찾아간다. */
test('listYear — 사진마다 어느 해 자리인지 새겨 준다', async () => {
  const S = loadStore();
  S.init({ uid: 'U1', db: fakeDb({ a: { takenAt: 1 }, b: { takenAt: 2 } }) });
  const items = await S.listYear('2025');
  assert.equal(items.a.__year, '2025');
  assert.equal(items.b.__year, '2025');
});

test('listYear — 비어 있으면 빈 객체', async () => {
  const S = loadStore();
  S.init({ uid: 'U1', db: fakeDb(undefined) });
  assert.deepEqual({ ...(await S.listYear('2020')) }, {});
});

test('loadThumb·loadFull — 한 장씩, 서로 다른 경로에서', async () => {
  /* ⚠ 2026-08-17 부터 읽기 전에 적어 둔 주소(thumbUrl·fullUrl) 한 칸을 먼저
     살핀다(창고 403 근본 수리) — 이 가짜 db 는 경로를 안 가리고 'data:x' 를
     돌려주는데, 그것은 https 주소가 아니라서 옛 길로 물러난다. 지킬 것은
     「미리보기는 thumbs 에서, 본문은 blobs 에서」이지 살펴보기 유무가 아니다. */
  const S = loadStore();
  const db = fakeDb('data:x');
  S.init({ uid: 'U1', db });
  assert.equal(await S.loadThumb('2026', 'p1'), 'data:x');
  assert.equal(await S.loadFull('2026', 'p1'), 'data:x');
  const dataReads = db.calls.once.filter(p => !/Url$/.test(p));
  assert.deepEqual(dataReads, ['puphotos/u/U1/thumbs/2026/p1', 'puphotos/u/U1/blobs/2026/p1'],
    '미리보기·본문이 서로 다른 자리에서 와야 합니다 — 뒤바뀌면 격자가 원본을 통째로 받습니다');
});

test('읽기 함수들 — 실시간DB가 없으면 한국어로 거절한다', async () => {
  const S = loadStore();
  S.init({ uid: 'U1' });
  await assert.rejects(() => S.listYear('2026'), /실시간DB/);
  await assert.rejects(() => S.loadThumb('2026', 'x'), /실시간DB/);
  await assert.rejects(() => S.loadFull('2026', 'x'), /실시간DB/);
});

/* ── 사람별 분리 ──
   실시간DB는 규칙으로 목록을 걸러 주지 못한다(어떤 노드를 읽을 수 있으면 그 아래
   전부가 열린다). 그래서 사진을 사람별 자리로 나눠 담는 것 말고는 방법이 없다.
   경로가 어긋나면 남의 사진이 보이거나 내 사진이 사라진다 — 여기가 핵심 검사다. */

test('경로가 사람별로 갈라진다', () => {
  const S = loadStore();
  S.init({ uid: 'U1' });
  assert.ok(S.metaPath('2026', 'p1').indexOf('puphotos/u/U1/') === 0,
    '내 자리 밖에 담고 있습니다: ' + S.metaPath('2026', 'p1'));
  // 남의 자리를 읽을 때는 계정을 넘긴다(관리자만 규칙이 허락한다)
  assert.equal(S.metaPath('2026', 'p1', 'U2'), 'puphotos/u/U2/items/2026/p1');
  assert.notEqual(S.metaPath('2026', 'p1'), S.metaPath('2026', 'p1', 'U2'));
});

test('계정을 모르면 경로를 만들지 않는다', () => {
  // 빈 값이 들어가면 puphotos/u//items/... 가 되어 엉뚱한 곳을 가리킨다
  const S = loadStore();
  S.init({});
  assert.throws(() => S.metaPath('2026', 'p1'), /계정/);
  assert.throws(() => S.blobPath('2026', 'p1'), /계정/);
  assert.throws(() => S.thumbPath('2026', 'p1'), /계정/);
});

test('savePhoto 는 내 자리에만 쓴다 — 남의 자리에 쓰는 길이 없다', async () => {
  const S = loadStore();
  const db = fakeDb();
  S.init({ uid: 'U1', db });
  await S.savePhoto({ id: 'p1', takenAt: new Date(2026, 6, 15).getTime(), meta: {}, full: 'f', thumb: 't' });
  for (const k of Object.keys(db.calls.update[0].u)) {
    assert.ok(k.indexOf('puphotos/u/U1/') === 0 || k === 'puphotos/owners/U1',
      '내 자리와 내 사용자 색인 밖에 썼습니다: ' + k);
  }
});

test('savePhoto — 업로드할 때 사용자 색인도 함께 남겨 다른 기기 전체사진에 보인다', async () => {
  const S = loadStore();
  const db = fakeDb();
  S.init({ uid: 'U1', name: '김보람', db });
  await S.savePhoto({
    id: 'phone1', takenAt: new Date(2026, 7, 11).getTime(),
    meta: { byName: '김보람' }, full: 'f', thumb: 't'
  });
  const owner = db.calls.update[0].u['puphotos/owners/U1'];
  assert.equal(owner.name, '김보람');
  assert.ok(owner.lastAt > 0);
});

test('listYear·loadThumb·loadFull 은 남의 자리도 읽을 수 있다 (관리자용)', async () => {
  const S = loadStore();
  const db = fakeDb('data:x');
  S.init({ uid: 'U1', db });
  await S.listYear('2026', 'U2');
  await S.loadThumb('2026', 'p1', 'U2');
  await S.loadFull('2026', 'p1', 'U2');
  // 남의 자리를 읽는다(관리자). 옛 자리도 함께 본다.
  assert.ok(db.calls.once.indexOf('puphotos/u/U2/items/2026') >= 0);
  assert.ok(db.calls.once.indexOf('puphotos/u/U2/thumbs/2026/p1') >= 0);
  assert.ok(db.calls.once.indexOf('puphotos/u/U2/blobs/2026/p1') >= 0);
});

test('사진첩을 쓰는 사람 명단 — 내 칸만 쓰고, 관리자만 훑는다', async () => {
  const S = loadStore();
  const db = fakeDb({ U1: { name: '가' }, U2: { name: '나' } });
  S.init({ uid: 'U1', db, isAdmin: true });
  await S.touchOwner('홍길동');
  assert.equal(db.calls.update.length, 1);
  assert.deepEqual(Object.keys(db.calls.update[0].u), ['puphotos/owners/U1']);
  assert.equal(db.calls.update[0].u['puphotos/owners/U1'].name, '홍길동');
  const owners = await S.listOwners();
  assert.deepEqual(Object.keys(owners).sort(), ['U1', 'U2']);
});

test('★ 직원도 사람 명단은 읽는다 — 안 읽히면 공유할 사람을 고를 수가 없다', async () => {
  /* 대표 지시 2026-08-29 「직원끼리도 공유하게 해라」.
     담긴 것은 이름과 마지막 올린 때뿐이다 — 사진은 여기 없다(그래서 칸을 갈라 뒀다).
     ⚠ 관리자만 읽던 동안 직원 화면의 「👥 공유」는 늘 「고를 사람이 없습니다」였다 —
       단추는 있는데 아무 일도 안 일어나는 자리였다. */
  const S = loadStore();
  const db = fakeDb({ U1: { name: '가' }, U2: { name: '나' } });
  S.init({ uid: 'U1', db, isAdmin: false });
  const owners = await S.listOwners();
  assert.deepEqual(Object.keys(owners).sort(), ['U1', 'U2'],
    '★ 직원이 명단을 못 읽으면 공유는 «받는 것만» 되고 보내는 것이 막힙니다');
});

test('★ 명단을 열어도 «남의 사진»을 훑는 길은 그대로 관리자만이다', async () => {
  /* 이름표 하나 열었다고 사진첩이 열리면 안 된다 — 그 셋은 저마다 제 자물쇠를 든다. */
  const S = loadStore();
  const db = fakeDb({ U1: {}, U2: {} });
  S.init({ uid: 'U1', db, isAdmin: false });
  await assert.rejects(() => S.listYearAll('2026'), /관리자/);
  await assert.rejects(() => S.listYearsAll(), /관리자/);
  await assert.rejects(() => S.migrateToStorage(), /관리자/);
});

/* ── 옮기기 전에도 옛 사진이 보여야 한다 ──
   실사용 보고(2026-08-03): 사람별 자리로 바꾸자 **올린 사진이 모두 사라져 보였다.**
   지워진 것이 아니라 앱이 새 자리만 봤기 때문이다. 옮기기를 누르기 전에도
   사진이 보여야 한다 — 사라져 보이는 것만으로도 사고다. */

test('내 사진 목록에 옛 자리 사진도 함께 나온다', async () => {
  const S = loadStore();
  const db = legacyDb(
    { 2026: { old1: { by: 'U1', takenAt: 1 }, other: { by: 'U9', takenAt: 2 } } },
    { 2026: { old1: 'd' } }, { 2026: { old1: 't' } },
    { 'puphotos/u/U1/items/2026': { new1: { takenAt: 3 } } });
  S.init({ uid: 'U1', db });
  const items = await S.listYear('2026');
  assert.deepEqual(Object.keys(items).sort(), ['new1', 'old1']);
  assert.ok(!('other' in items), '남의 옛 사진이 내 목록에 섞였습니다');
});

test('옛 사진 중 올린 사람을 모르는 것은 관리자에게만 보인다', async () => {
  const noBy = { 2026: { x: { takenAt: 1 } } };
  const S1 = loadStore();
  S1.init({ uid: 'U1', db: legacyDb(noBy, {}, {}), isAdmin: false });
  assert.deepEqual(Object.keys(await S1.listYear('2026')), []);

  const S2 = loadStore();
  S2.init({ uid: 'ADMIN', db: legacyDb(noBy, {}, {}), isAdmin: true });
  assert.deepEqual(Object.keys(await S2.listYear('2026')), ['x']);
});

test('옮긴 사진은 새 자리 값이 이기고, 빠진 값은 옛 것으로 채운다', async () => {
  // 판독 결과만 새 자리에 적힌 경우에도 촬영 시각이 사라지면 안 된다
  const S = loadStore();
  const db = legacyDb(
    { 2026: { p: { by: 'U1', takenAt: 111, byName: '가' } } }, {}, {},
    { 'puphotos/u/U1/items/2026': { p: { read: { kind: 'card' } } } });
  S.init({ uid: 'U1', db });
  const items = await S.listYear('2026');
  assert.equal(Object.keys(items).length, 1, '같은 사진이 두 번 나옵니다');
  assert.equal(items.p.takenAt, 111, '옛 촬영 시각이 사라졌습니다');
  assert.ok(items.p.read, '새 자리의 판독 결과가 사라졌습니다');
});

test('사진 본문·미리보기는 새 자리에 없으면 옛 자리에서 찾는다', async () => {
  const S = loadStore();
  const db = legacyDb({}, { 2026: { p: 'data:old-full' } }, { 2026: { p: 'data:old-thumb' } });
  S.init({ uid: 'U1', db });
  assert.equal(await S.loadFull('2026', 'p'), 'data:old-full');
  assert.equal(await S.loadThumb('2026', 'p'), 'data:old-thumb');
});

test('새 자리에 있으면 옛 자리를 두드리지 않는다', async () => {
  const S = loadStore();
  const db = legacyDb({}, {}, {}, {
    'puphotos/u/U1/blobs/2026/p': 'data:new'
  });
  S.init({ uid: 'U1', db });
  assert.equal(await S.loadFull('2026', 'p'), 'data:new');
  assert.ok(!db.calls.once.some(function (k) { return k === 'puphotos/blobs/2026/p'; }),
    '새 자리에 있는데 옛 자리를 또 읽었습니다');
});

/* (2026-08-06 뒤집힘) 여기 있던 「지우기는 새 자리와 옛 자리를 함께 비운다」는
   8/3 이사 기간에만 맞는 약속이었다. 8/4에 옛 자리 규칙이 지워지면서 옛 자리
   쓰기는 거부가 됐고, 묶음 쓰기는 전부 아니면 전무라 그 한 줄이 **모든 지우기를**
   실패시켰다. 새 약속은 파일 끝 「지우기는 내 자리만 쓴다」가 지킨다. */

/* ── 지운 기록 ──
   휴지통에서 완전히 지운 뒤에도 '무엇을 언제 누가 지웠는지'는 남아야 한다.
   증빙 자료를 다루는 앱이라 "그 사진 어디 갔지"에 답할 수 있어야 한다. */

test('지우면 기록이 함께 남는다', async () => {
  const S = loadStore();
  const db = legacyDb({}, {}, {}, {
    'puphotos/u/U1/items/2026/p1': { takenAt: 111, kind: 'doc', read: { kind: 'bizreg', fields: { company: '가나상사' } } }
  });
  S.init({ uid: 'U1', db, name: '홍길동' });
  await S.deletePhoto('2026', 'p1');
  const u = db.calls.update[0].u;
  const log = u['puphotos/u/U1/dellog/p1'];
  assert.ok(log, '지운 기록이 없습니다');
  assert.ok(log.delAt > 0);
  assert.equal(log.year, '2026');
  assert.match(log.what, /사업자등록증|가나상사/);
});

/* 스스로 치운 것(중복 등)은 '누가 지웠는지'만으로는 설명이 되지 않는다.
   왜 지웠는지가 없으면 "내 사진이 왜 없어졌지"에 아무도 답할 수 없다. */
test('왜 지웠는지도 기록에 남는다', async () => {
  const S = loadStore();
  const db = legacyDb({}, {}, {}, {
    'puphotos/u/U1/items/2026/p1': { takenAt: 111, kind: 'doc' }
  });
  S.init({ uid: 'U1', db, name: '홍길동' });
  await S.deletePhoto('2026', 'p1', '중복 — 기업정보함에 이미 있었음');
  assert.equal(db.calls.update[0].u['puphotos/u/U1/dellog/p1'].why, '중복 — 기업정보함에 이미 있었음');
});

test('사람이 지운 것은 이유 칸이 비어 있다 — 없는 이유를 지어내지 않는다', async () => {
  const S = loadStore();
  const db = legacyDb({}, {}, {}, {
    'puphotos/u/U1/items/2026/p1': { takenAt: 111 }
  });
  S.init({ uid: 'U1', db, name: '홍길동' });
  await S.deletePhoto('2026', 'p1');
  assert.equal(db.calls.update[0].u['puphotos/u/U1/dellog/p1'].why, '');
});

test('지운 기록은 휴지통을 완전히 비운 뒤에도 남는다', async () => {
  const S = loadStore();
  const db = legacyDb({}, {}, {});
  S.init({ uid: 'U1', db });
  await S.purgeOne('2026', 'p1');
  const u = db.calls.update[0].u;
  assert.equal(u['puphotos/u/U1/trash/2026/p1'], null);
  // 기록 자체를 지우면 안 된다(때만 덧붙인다)
  assert.equal(u['puphotos/u/U1/dellog/p1'], undefined, '기록을 통째로 지웠습니다');
});

test('기록에 완전히 지운 때를 덧붙인다', async () => {
  const S = loadStore();
  const db = legacyDb({}, {}, {});
  S.init({ uid: 'U1', db });
  await S.purgeOne('2026', 'p1');
  const u = db.calls.update[0].u;
  assert.ok(u['puphotos/u/U1/dellog/p1/purgedAt'] > 0, '완전히 지운 때를 안 남겼습니다');
});

test('지운 기록 목록 — 최근 것이 먼저', async () => {
  const S = loadStore();
  const db = legacyDb({}, {}, {}, {
    'puphotos/u/U1/dellog': {
      a: { delAt: 100, what: '명함' },
      b: { delAt: 300, what: '서류' },
      c: { delAt: 200, what: '사진' }
    }
  });
  S.init({ uid: 'U1', db });
  const list = await S.listDelLog();
  assert.deepEqual(JSON.parse(JSON.stringify(list.map(function (x) { return x.id; }))), ['b', 'c', 'a']);
});

/* ── 옛 자리에서 사람별 자리로 이사 ──
   여기서 실수하면 사진을 잃는다. 그래서 규칙 하나: **복사가 끝날 때까지 옛 것을
   지우지 않는다.** 지우기는 복사 완료 표시가 있을 때만 동작한다. */

/* 옛 자리 사진이 든 가짜 DB.
   경로를 실제로 따라간다 — `puphotos/items` 도 `puphotos/items/2026` 도 답해야 한다.
   (예전 가짜는 정확히 일치하는 경로만 답해서, 연도별로 읽는 코드를 못 시험했다) */
function legacyDb(items, blobs, thumbs, extra) {
  const calls = { update: [], once: [] };
  const tree = { puphotos: { items: items || {}, blobs: blobs || {}, thumbs: thumbs || {} } };
  Object.keys(extra || {}).forEach(function (p) {
    const parts = p.split('/');
    let cur = tree;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!cur[parts[i]] || typeof cur[parts[i]] !== 'object') cur[parts[i]] = {};
      cur = cur[parts[i]];
    }
    cur[parts[parts.length - 1]] = extra[p];
  });
  function getPath(p) {
    if (!p) return tree;
    let cur = tree;
    const parts = p.split('/');
    for (const k of parts) {
      if (cur === null || cur === undefined || typeof cur !== 'object') return null;
      cur = cur[k];
    }
    return cur === undefined ? null : cur;
  }
  return {
    calls,
    ref(p) {
      const key = p || '';
      return {
        update(u) { calls.update.push({ path: key, u }); return Promise.resolve(); },
        once() { calls.once.push(key); return Promise.resolve({ val: () => getPath(key) }); },
        push() { return { key: '-n' + calls.update.length }; }
      };
    }
  };
}

/* ── 실시간DB → 창고 이사 (2026-08-13, 비용 조사 뒤 실행) ──
   기업정보함이 먼저 검증한 순서를 그대로 따른다: 올리고 → 되읽어 확인하고 →
   그제야 실시간DB에서 지운다. listOwners·listYears·listYear 를 실제로 훑으므로,
   경로를 트리로 걸어 다니며 update 한 결과가 다음 once() 읽기에도 반영되는
   "살아 있는" 가짜 DB 가 필요하다(legacyDb·fakeDbFor 는 정적 스냅샷이라 부족하다). */
function mutableDb(tree) {
  const calls = { update: [], once: [] };
  function getPath(p) {
    if (!p) return tree;
    let cur = tree;
    for (const k of p.split('/')) {
      if (cur === null || cur === undefined || typeof cur !== 'object') return null;
      cur = cur[k];
    }
    return cur === undefined ? null : cur;
  }
  function setPath(p, v) {
    const parts = p.split('/');
    let cur = tree;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!cur[parts[i]] || typeof cur[parts[i]] !== 'object') cur[parts[i]] = {};
      cur = cur[parts[i]];
    }
    if (v === null || v === undefined) delete cur[parts[parts.length - 1]];
    else cur[parts[parts.length - 1]] = v;
  }
  function makeRef(key) {
    return {
      once() {
        calls.once.push(key);
        const v = getPath(key);
        return Promise.resolve({ val: () => v, exists: () => v !== null && v !== undefined });
      },
      update(u) {
        calls.update.push({ path: key, u });
        Object.keys(u).forEach(function (p) { setPath(p, u[p]); });
        return Promise.resolve();
      },
      push() { return { key: '-n' + (calls.update.length + calls.once.length) }; },
      limitToFirst() { return this; },
      orderByChild() { return this; }
    };
  }
  return { calls, tree, ref(p) { return makeRef(p || ''); } };
}

const NOW_YEAR = String(new Date().getFullYear());

/* fetch·FileReader 는 브라우저 전역이라 노드에 없다 — 창고에서 되읽는
   fetchFromBucket() 이 이것을 맨이름으로 부르므로, 그 함수가 도는 검사마다
   sandbox 전역에 심어 줘야 한다(loadStore(webShims()) 로). 무엇을 올렸는지는
   안 가리고 늘 같은 값을 돌려준다 — 이 검사들은 "확인이 됐는가"만 본다. */
function webShims() {
  return {
    fetch: () => Promise.resolve({ ok: true, blob: () => Promise.resolve('BLOB') }),
    FileReader: function () {
      const r = this;
      this.readAsDataURL = function () {
        setTimeout(function () { r.result = 'data:ok'; r.onload && r.onload(); }, 0);
      };
    }
  };
}

test('★ 이사 — 본문·미리보기를 창고에 올리고, 되읽어 확인한 뒤에야 실시간DB에서 지운다', async () => {
  const S = loadStore(webShims());
  const st = fakeStorage({});
  const db = mutableDb({
    puphotos: {
      owners: { U1: { name: '홍길동' } },
      u: { U1: { items: { [NOW_YEAR]: { p1: { takenAt: 1 } } },
        blobs: { [NOW_YEAR]: { p1: 'data:full' } },
        thumbs: { [NOW_YEAR]: { p1: 'data:thumb' } } } }
    }
  });
  S.init({ uid: 'U1', db, storage: st, isAdmin: true });
  const r = await S.migrateToStorage();
  assert.equal(r.moved, 1);
  assert.equal(r.failed, 0);

  // 창고에 올라갔다
  assert.ok(st.calls.some(c => c[0] === 'putString' && c[1] === 'pu_photos/u/U1/blobs/' + NOW_YEAR + '/p1.jpg'));
  assert.ok(st.calls.some(c => c[0] === 'putString' && c[1] === 'pu_photos/u/U1/thumbs/' + NOW_YEAR + '/p1.jpg'));
  // 올리고 나서 되읽어 확인했다 — "올렸다고 답했는데 실은 못 올라간" 것을 잡는 자리
  assert.ok(st.calls.some(c => c[0] === 'getDownloadURL' && c[1] === 'pu_photos/u/U1/blobs/' + NOW_YEAR + '/p1.jpg'),
    '★ 되읽어 확인하지 않고 실시간DB에서 지웠습니다 — 못 올라간 사진을 잃을 수 있습니다');
  // 실시간DB 쪽 결과
  const meta = db.tree.puphotos.u.U1.items[NOW_YEAR].p1;
  assert.equal(meta.loc, 'storage');
  assert.equal(db.tree.puphotos.u.U1.blobs[NOW_YEAR].p1, undefined, '옛 본문을 안 지웠습니다');
  assert.equal(db.tree.puphotos.u.U1.thumbs[NOW_YEAR].p1, undefined);
});

test('★ 이사 — 순서는 반드시 올리기 → 확인 → 지우기다(먼저 지우면 안 된다)', async () => {
  const S = loadStore(webShims());
  const st = fakeStorage({});
  const db = mutableDb({
    puphotos: {
      owners: { U1: {} },
      u: {
        U1: {
          items: { [NOW_YEAR]: { p1: { takenAt: 1 } } },
          blobs: { [NOW_YEAR]: { p1: 'data:full' } },
          thumbs: { [NOW_YEAR]: { p1: 'data:thumb' } }
        }
      }
    }
  });
  /* st.calls 와 db.calls.update 는 서로 다른 배열이라 각자의 인덱스를 그냥
     비교하면 실제 시간 순서와 무관하다 — push 를 가로채 하나의 timeline 에
     실제로 불린 차례대로 함께 쌓는다. */
  const timeline = [];
  const stPush = st.calls.push.bind(st.calls);
  st.calls.push = function (c) { timeline.push('storage:' + c[0] + ':' + c[1]); return stPush(c); };
  S.init({ uid: 'U1', db, storage: st, isAdmin: true });
  const dbPush = db.calls.update.push.bind(db.calls.update);
  db.calls.update.push = function (c) {
    const clearsBlob = Object.keys(c.u).some(function (k) { return k.indexOf('/blobs/') >= 0 && c.u[k] === null; });
    timeline.push(clearsBlob ? 'db-clear-blob' : 'db-update');
    return dbPush(c);
  };
  await S.migrateToStorage();
  const upAt = timeline.findIndex(s => s.startsWith('storage:putString:'));
  /* ⚠ 옮기기 전 loadFull/loadThumb 도 "창고 먼저" 읽기라 getDownloadURL 을
     부른다(이번엔 아직 안 올라가 있어 실패하고 실시간DB로 물러난다) — 그 앞선
     시도까지 걸리므로 첫 번째가 아니라 "올리기 뒤 맨 나중" getDownloadURL(확인)
     을 찾아야 한다. */
  let getAt = -1;
  for (let i = timeline.length - 1; i >= 0; i--) {
    if (timeline[i].startsWith('storage:getDownloadURL:')) { getAt = i; break; }
  }
  const rtdbNullAt = timeline.indexOf('db-clear-blob');
  assert.ok(upAt >= 0 && getAt >= 0 && rtdbNullAt >= 0, '★ 올리기·확인·지우기 차례를 찾을 수 없습니다: ' + timeline.join(' > '));
  assert.ok(upAt < getAt, '★ 확인하기 전에 이미 올렸어야 합니다(차례가 뒤집혔습니다): ' + timeline.join(' > '));
  assert.ok(getAt < rtdbNullAt, '★ 확인하기 전에 실시간DB에서 먼저 지웠습니다(먼저 지우면 안 됩니다): ' + timeline.join(' > '));
});

test('★ 이사 — 되읽어 확인하지 못하면 실시간DB 본문을 지우지 않는다', async () => {
  const S = loadStore();
  const st = { ref(p) {
    return {
      putString() { return Promise.resolve(); },
      getDownloadURL() { return Promise.reject(new Error('아직 안 보임')); }
    };
  } };
  const db = mutableDb({
    puphotos: { owners: { U1: {} },
      u: { U1: { items: { [NOW_YEAR]: { p1: { takenAt: 1 } } },
        blobs: { [NOW_YEAR]: { p1: 'data:full' } }, thumbs: { [NOW_YEAR]: { p1: 'data:thumb' } } } } }
  });
  S.init({ uid: 'U1', db, storage: st, isAdmin: true });
  const r = await S.migrateToStorage();
  assert.equal(r.failed, 1);
  assert.equal(db.tree.puphotos.u.U1.blobs[NOW_YEAR].p1, 'data:full',
    '★ 못 확인했는데 실시간DB 본문을 지웠습니다 — 사진을 잃습니다');
  assert.equal(db.tree.puphotos.u.U1.items[NOW_YEAR].p1.loc, undefined);
});

test('이사 — 이미 옮긴 사진은 건너뛴다(되풀이해도 안전하다)', async () => {
  const S = loadStore();
  const st = fakeStorage({});
  const db = mutableDb({
    puphotos: { owners: { U1: {} },
      u: { U1: { items: { [NOW_YEAR]: { p1: { takenAt: 1, loc: 'storage' } } },
        blobs: { [NOW_YEAR]: {} }, thumbs: { [NOW_YEAR]: {} } } } }
  });
  S.init({ uid: 'U1', db, storage: st, isAdmin: true });
  const r = await S.migrateToStorage();
  assert.equal(r.moved, 0);
  assert.equal(r.skipped, 1);
  assert.equal(st.calls.length, 0, '이미 옮긴 사진을 또 올렸습니다');
});

test('이사 — 본문이 없는 사진(2026-08-13 알림)은 실패가 아니라 건너뛴다', async () => {
  const S = loadStore();
  const st = fakeStorage({});
  const db = mutableDb({
    puphotos: { owners: { U1: {} },
      u: { U1: { items: { [NOW_YEAR]: { p1: { takenAt: 1 } } },
        blobs: { [NOW_YEAR]: {} }, thumbs: { [NOW_YEAR]: {} } } } }   // 본문 없음
  });
  S.init({ uid: 'U1', db, storage: st, isAdmin: true });
  const r = await S.migrateToStorage();
  assert.equal(r.skipped, 1, '실패로 세면 관리자가 헛되이 다시 시도합니다');
  assert.equal(r.failed, 0);
});

test('★ 이사 — 한 장이 실패해도 나머지 사람·나머지 사진을 계속 옮긴다', async () => {
  const S = loadStore(webShims());
  let n = 0;
  const st = {
    ref(p) {
      return {
        putString() {
          n++;
          // U1 의 p1 만 실패시킨다
          return (p.indexOf('U1') >= 0) ? Promise.reject(new Error('막힘')) : Promise.resolve();
        },
        getDownloadURL() { return Promise.resolve('https://example.test/' + p); }
      };
    }
  };
  const db = mutableDb({
    puphotos: {
      owners: { U1: {}, U2: {} },
      u: {
        U1: {
          items: { [NOW_YEAR]: { p1: { takenAt: 1 } } },
          blobs: { [NOW_YEAR]: { p1: 'data:1' } },
          thumbs: { [NOW_YEAR]: { p1: 'data:t1' } }
        },
        U2: {
          items: { [NOW_YEAR]: { p2: { takenAt: 1 } } },
          blobs: { [NOW_YEAR]: { p2: 'data:2' } },
          thumbs: { [NOW_YEAR]: { p2: 'data:t2' } }
        }
      }
    }
  });
  S.init({ uid: 'U1', db, storage: st, isAdmin: true });
  const r = await S.migrateToStorage();
  assert.equal(r.failed, 1, 'U1 의 실패가 안 잡혔습니다');
  assert.equal(r.moved, 1, '★ U1 이 실패했다고 U2 까지 안 옮겼습니다');
  assert.equal(db.tree.puphotos.u.U2.items[NOW_YEAR].p2.loc, 'storage');
});

test('★ 이사 — 한 사람의 목록을 통째로 못 읽어도 다른 사람은 계속 옮긴다', async () => {
  /* migrateOneToStorage 안의 실패는 사진 한 장 단위로 이미 잡힌다(위 검사) —
     여기서는 그보다 앞선 listYear() 자체가 던지는 경우(권한 등)를 본다.
     migrateOwnerToStorage 의 .catch 가 없으면 U1 에서 던진 예외가 uids.reduce
     체인을 그대로 타고 올라가 U2 는 시작도 못 한다. */
  const S = loadStore(webShims());
  const st = fakeStorage({});
  const real = mutableDb({
    puphotos: {
      owners: { U1: {}, U2: {} },
      u: {
        U1: {
          items: { [NOW_YEAR]: { p1: { takenAt: 1 } } },
          blobs: { [NOW_YEAR]: { p1: 'data:1' } },
          thumbs: { [NOW_YEAR]: { p1: 'data:t1' } }
        },
        U2: {
          items: { [NOW_YEAR]: { p2: { takenAt: 1 } } },
          blobs: { [NOW_YEAR]: { p2: 'data:2' } },
          thumbs: { [NOW_YEAR]: { p2: 'data:t2' } }
        }
      }
    }
  });
  const db = {
    calls: real.calls,
    tree: real.tree,
    ref(p) {
      if (typeof p === 'string' && p.indexOf('u/U1/items') >= 0) {
        var broken = {
          once() { return Promise.reject(new Error('권한이 없습니다')); },
          limitToFirst() { return broken; },
          orderByChild() { return broken; }
        };
        return broken;
      }
      return real.ref(p);
    }
  };
  S.init({ uid: 'U1', db, storage: st, isAdmin: true });
  await S.migrateToStorage();
  assert.equal(db.tree.puphotos.u.U2.items[NOW_YEAR].p2.loc, 'storage',
    '★ U1 목록을 못 읽었다고 U2 까지 안 옮겼습니다');
});

test('이사 — 창고 이사도 관리자가 아니면 하지 않는다', async () => {
  const S = loadStore();
  S.init({ uid: 'U1', db: mutableDb({}), storage: fakeStorage({}), isAdmin: false });
  await assert.rejects(() => S.migrateToStorage(), /관리자/);
});

test('이사 — 창고가 안 이어져 있으면 옮길 곳이 없다고 알려준다', async () => {
  const S = loadStore();
  S.init({ uid: 'ADMIN', db: mutableDb({}), isAdmin: true });
  await assert.rejects(() => S.migrateToStorage(), /창고/);
});

/* ── 용량 계산 — 창고 사진은 실시간DB 한도에서 뺀다 (2026-08-13) ──
   본문이 창고에 있으니 실시간DB 1GB 한도를 안 먹는다. 그대로 더하면 옮겨도
   계기판이 안 줄어 "옮긴 보람이 없다"로 보인다. 장수는 그대로 센다 —
   사진이 준 게 아니라 자리만 바뀐 것이다. */
test('★ usage — 창고로 옮긴 사진은 실시간DB 용량에서 뺀다', async () => {
  const S = loadStore();
  const db = legacyDb({}, {}, {}, {
    ['puphotos/u/U1/items/' + NOW_YEAR]: {
      a: { size: 1000 },                      // 실시간DB에 그대로
      b: { size: 2000, loc: 'storage' }       // 창고로 옮겼다
    }
  });
  S.init({ uid: 'U1', db });
  const r = await S.usage([NOW_YEAR]);
  assert.equal(r.count, 2, '★ 장수는 줄면 안 됩니다 — 사진이 준 게 아닙니다');
  assert.equal(r.bytes, 1000, '★ 창고 사진의 크기를 실시간DB 용량에 넣었습니다');
});

/* ── 휴지통 (30일) ──
   지운 사진을 곧바로 없애지 않는다. 잘못 지운 것을 되살릴 수 있어야 한다.
   담고 나서 지운다 — 순서가 바뀌면 사진을 잃는다. */

test('지우면 휴지통으로 간다 — 담은 뒤에 원래 자리를 비운다', async () => {
  const S = loadStore();
  const db = legacyDb({}, {}, {}, {
    'puphotos/u/U1/items/2026/p1': { takenAt: 111, kind: 'doc' },
    'puphotos/u/U1/blobs/2026/p1': 'data:full',
    'puphotos/u/U1/thumbs/2026/p1': 'data:thumb'
  });
  S.init({ uid: 'U1', db });
  await S.deletePhoto('2026', 'p1');
  assert.equal(db.calls.update.length, 1, '한 번에 담고 비워야 한다(중간에 끊기면 사진을 잃는다)');
  const u = db.calls.update[0].u;
  const trash = u['puphotos/u/U1/trash/2026/p1'];
  assert.ok(trash, '휴지통에 담지 않았습니다');
  assert.equal(trash.full, 'data:full', '사진 본문이 휴지통에 안 들어갔습니다');
  assert.equal(trash.thumb, 'data:thumb');
  assert.equal(trash.meta.takenAt, 111);
  assert.ok(trash.delAt > 0, '지운 때가 없으면 30일을 셀 수 없습니다');
  // 원래 자리는 비운다
  assert.equal(u['puphotos/u/U1/items/2026/p1'], null);
  assert.equal(u['puphotos/u/U1/blobs/2026/p1'], null);
  assert.equal(u['puphotos/u/U1/thumbs/2026/p1'], null);
});

test('옛 자리에만 있는 사진은 지우지 않는다 — 내 자리에서 못 읽으면 담을 수 없다', async () => {
  /* (2026-08-06 뒤집힘) 예전에는 옛 자리 사진도 휴지통으로 담았다. 8/4에 이사가
     끝나고 옛 자리 규칙이 지워져 이제 옛 자리는 읽기도 거부된다 — 내 자리에서
     아무것도 못 읽으면 담지 못한 것을 없애면 안 되므로 거부가 맞다. */
  const S = loadStore();
  /* 옛 자리는 규칙이 지워져 **읽기도 거부**다 — 실제 상태 그대로 흉내낸다. */
  const db = fakeDbFor({
    'puphotos/items/2026/old1': 'DENY',
    'puphotos/blobs/2026/old1': 'DENY',
    'puphotos/thumbs/2026/old1': 'DENY'
  });
  S.init({ uid: 'U1', db });
  await assert.rejects(() => S.deletePhoto('2026', 'old1'), /읽지 못해/);
  assert.equal(db.updates.length, 0, '읽지 못했는데 지우려 했습니다');
});

test('읽지 못하면 지우지 않는다 — 담지 못한 것을 없애면 안 된다', async () => {
  const S = loadStore();
  const db = legacyDb({}, {}, {});
  db.ref = function () { return { once: function () { return Promise.reject(new Error('권한 없음')); },
    update: function () { throw new Error('지우려 했습니다'); } }; };
  S.init({ uid: 'U1', db });
  await assert.rejects(() => S.deletePhoto('2026', 'p1'), /지우지|읽/);
});

test('휴지통 목록 — 지운 때와 남은 날이 함께 온다', async () => {
  const S = loadStore();
  const now = Date.now();
  const db = legacyDb({}, {}, {}, {
    'puphotos/u/U1/trash/2026': {
      a: { meta: { takenAt: 1 }, thumb: 't', delAt: now - 5 * 86400000 },
      b: { meta: { takenAt: 2 }, thumb: 't', delAt: now - 29 * 86400000 }
    }
  });
  S.init({ uid: 'U1', db });
  const list = await S.listTrash('2026');
  assert.equal(Object.keys(list).length, 2);
  assert.equal(list.a.daysLeft, 25);
  assert.equal(list.b.daysLeft, 1);
});

test('되살리기 — 휴지통에서 꺼내 원래 자리로 되돌린다', async () => {
  const S = loadStore();
  const db = legacyDb({}, {}, {}, {
    'puphotos/u/U1/trash/2026/p1': { meta: { takenAt: 9 }, full: 'F', thumb: 'T', delAt: 1 }
  });
  S.init({ uid: 'U1', db });
  await S.restorePhoto('2026', 'p1');
  const u = db.calls.update[0].u;
  assert.equal(u['puphotos/u/U1/items/2026/p1'].takenAt, 9);
  assert.equal(u['puphotos/u/U1/blobs/2026/p1'], 'F');
  assert.equal(u['puphotos/u/U1/thumbs/2026/p1'], 'T');
  assert.equal(u['puphotos/u/U1/trash/2026/p1'], null, '휴지통에서 안 비웠습니다');
});

test('되살리기 — 휴지통에 없으면 한국어로 알려준다', async () => {
  const S = loadStore();
  S.init({ uid: 'U1', db: legacyDb({}, {}, {}) });
  await assert.rejects(() => S.restorePhoto('2026', 'none'), /휴지통/);
});

test('30일 지난 것만 완전히 지운다 — 남은 것은 건드리지 않는다', async () => {
  const S = loadStore();
  const now = Date.now();
  const db = legacyDb({}, {}, {}, {
    'puphotos/u/U1/trash/2026': {
      old: { delAt: now - 31 * 86400000 },
      keep: { delAt: now - 10 * 86400000 },
      noStamp: {}                                  // 지운 때가 없는 것
    }
  });
  S.init({ uid: 'U1', db });
  const n = await S.purgeOldTrash('2026');
  assert.equal(n, 1);
  const u = db.calls.update[0].u;
  assert.deepEqual(Object.keys(u), ['puphotos/u/U1/trash/2026/old']);
  assert.equal(u['puphotos/u/U1/trash/2026/old'], null);
});

test('30일 지난 것이 없으면 아무것도 쓰지 않는다', async () => {
  const S = loadStore();
  const db = legacyDb({}, {}, {}, {
    'puphotos/u/U1/trash/2026': { keep: { delAt: Date.now() } }
  });
  S.init({ uid: 'U1', db });
  assert.equal(await S.purgeOldTrash('2026'), 0);
  assert.equal(db.calls.update.length, 0);
});

test('휴지통에서 완전히 지우기 — 그 한 칸만', async () => {
  const S = loadStore();
  const db = legacyDb({}, {}, {});
  S.init({ uid: 'U1', db });
  await S.purgeOne('2026', 'p1');
  const u = db.calls.update[0].u;
  // 휴지통 칸을 비우고, 기록에는 '완전히 지운 때'만 덧붙인다
  assert.deepEqual(Object.keys(u).sort(),
    ['puphotos/u/U1/dellog/p1/purgedAt', 'puphotos/u/U1/trash/2026/p1']);
  assert.equal(u['puphotos/u/U1/trash/2026/p1'], null);
});

/* ── 사진 지우기 ── */

test('deletePhoto — 담기와 비우기를 한 번의 저장으로 한다', async () => {
  // 중간에 끊기면 사진을 잃는다 — 반드시 한 번에.
  const S = loadStore();
  const db = fakeDb({ takenAt: 1 });
  S.init({ uid: 'U1', db });
  await S.deletePhoto('2026', 'p1');
  assert.equal(db.calls.update.length, 1);
  const u = db.calls.update[0].u;
  assert.ok(u['puphotos/u/U1/trash/2026/p1'], '휴지통에 담지 않았습니다');
  /* (2026-08-06) 옛 자리(puphotos/items)는 더 이상 비우지 않는다 — 규칙이 지워져
     그 한 줄이 묶음 쓰기 전체를 거부시킨다. 내 자리만 비운다. */
  assert.equal(u['puphotos/u/U1/items/2026/p1'], null, '내 자리를 비우지 않았습니다');
  assert.ok(!('puphotos/items/2026/p1' in u), '옛 자리를 건드리고 있습니다');
});

test('deletePhoto — 그 사진 하나만 건드린다', async () => {
  const S = loadStore();
  const db = fakeDb({ takenAt: 1 });
  S.init({ uid: 'U1', db });
  await S.deletePhoto('2026', 'p1');
  // 연도나 루트를 지우면 그 해 사진이 전부 사라진다
  /* ⚠ 2026-08-24: texts 가 늘었다(글자 있는 PDF 는 글자로 판독 — 그 글자 자리).
     지킬 것은 「사진 하나의 자리만 건드린다」이지 자리 개수가 아니다. 새 자리를
     여기 안 넣으면, 늘릴 때마다 이 검사가 멀쩡한 코드를 두고 운다. */
  for (const k of Object.keys(db.calls.update[0].u)) {
    assert.match(k, /^puphotos\/(u\/U1\/)?((items|blobs|thumbs|texts|trash)\/2026\/p1|dellog\/p1)$/, '위험한 경로입니다: ' + k);
  }
  assert.equal(db.calls.update[0].path, '');
});

test('deletePhoto — 실시간DB가 없으면 한국어로 거절한다', async () => {
  const S = loadStore();
  S.init({ uid: 'U1' });
  await assert.rejects(() => S.deletePhoto('2026', 'p1'), /실시간DB/);
});

test('deletePhoto — 사진 번호가 없으면 아무것도 지우지 않는다', async () => {
  const S = loadStore();
  const db = fakeDb();
  S.init({ uid: 'U1', db });
  await assert.rejects(() => S.deletePhoto('2026', ''), /사진/);
  await assert.rejects(() => S.deletePhoto('', 'p1'), /사진/);
  assert.equal(db.calls.update.length, 0);
});

/* ── 창고 사진 지우기·복원·영구삭제 (2026-08-13, 비용 조사 뒤 실행) ──
   기업정보함 휴지통이 지운 명함의 원본을 통째로 복사해 두었다가, 열 때마다 30일치를
   다시 내려받던 것이 청구서의 큰 몫이었다(₩28,833/93%). 사진첩은 미리 막는다:
   창고 사진은 **지울 때 본문을 안 만진다** — 트래시에 표시만 남기고 본문은
   창고의 원래 자리에 그대로 둔다. 본문을 실제로 지우는 것은 영구삭제 때뿐이다. */

test('★ deletePhoto — 창고 사진은 본문을 트래시에 복사하지 않는다', async () => {
  const S = loadStore();
  const db = fakeDbFor({
    'puphotos/u/U1/items/2026/p1': { takenAt: 1, loc: 'storage' }
  });
  S.init({ uid: 'U1', db });
  await S.deletePhoto('2026', 'p1', '');
  assert.equal(db.updates.length, 1);
  const u = db.updates[0];
  assert.equal(u['puphotos/u/U1/trash/2026/p1'].loc, 'storage');
  assert.equal(u['puphotos/u/U1/trash/2026/p1'].full, undefined,
    '★ 본문을 트래시에 복사했습니다 — 열 때마다 이것을 다시 내려받습니다');
  assert.equal(u['puphotos/u/U1/trash/2026/p1'].thumb, undefined);
  assert.equal(u['puphotos/u/U1/items/2026/p1'], null);
  // 본문이 창고에 있으므로 실시간DB의 blobs·thumbs 자리는 애초에 건드릴 것이 없다
  assert.equal(u['puphotos/u/U1/blobs/2026/p1'], undefined);
  assert.equal(u['puphotos/u/U1/thumbs/2026/p1'], undefined);
});

test('deletePhoto — 옛(실시간DB) 사진은 지금까지처럼 본문을 트래시에 담는다', async () => {
  // loc 이 없는 사진(마이그레이션 전) 은 그대로 옛 동작을 지킨다 — 회귀 확인.
  const S = loadStore();
  const db = legacyDb({}, {}, {}, {
    'puphotos/u/U1/items/2026/p1': { takenAt: 1 },   // loc 없음
    'puphotos/u/U1/blobs/2026/p1': 'data:full',
    'puphotos/u/U1/thumbs/2026/p1': 'data:thumb'
  });
  S.init({ uid: 'U1', db });
  await S.deletePhoto('2026', 'p1');
  const u = db.calls.update[0].u;
  assert.equal(u['puphotos/u/U1/trash/2026/p1'].full, 'data:full');
});

test('★ restorePhoto — 창고 사진은 되살릴 본문이 없다(원래 자리에 그대로 있었다)', async () => {
  const S = loadStore();
  const db = legacyDb({}, {}, {}, {
    'puphotos/u/U1/trash/2026/p1': { meta: { takenAt: 9 }, delAt: 1, loc: 'storage' }
  });
  S.init({ uid: 'U1', db });
  await S.restorePhoto('2026', 'p1');
  const u = db.calls.update[0].u;
  assert.equal(u['puphotos/u/U1/items/2026/p1'].takenAt, 9, '정보는 되돌려야 합니다');
  assert.equal(u['puphotos/u/U1/blobs/2026/p1'], undefined,
    '★ 옮길 본문이 없는데 실시간DB 자리를 만들었습니다');
  assert.equal(u['puphotos/u/U1/thumbs/2026/p1'], undefined);
  assert.equal(u['puphotos/u/U1/trash/2026/p1'], null);
});

test('★ restorePhoto — 창고 사진 기록에 옛 본문이 남아 있어도 실시간DB로 되돌리지 않는다', async () => {
  /* 위 검사는 트래시에 full/thumb 자체가 없어 guard 를 실제로 타는지 못 가린다.
     여기서는 loc:'storage' 인데도 full/thumb 값이 남아 있는 경우를 만든다 —
     guard 가 없으면 창고에 이미 있는 본문을 실시간DB에도 다시 써 버려서
     "본문이 실시간DB에 있다"고 착각하게 만든다(용량·비용이 되돌아간다). */
  const S = loadStore();
  const db = legacyDb({}, {}, {}, {
    'puphotos/u/U1/trash/2026/p1': { meta: { takenAt: 9 }, delAt: 1, loc: 'storage', full: 'data:full', thumb: 'data:thumb' }
  });
  S.init({ uid: 'U1', db });
  await S.restorePhoto('2026', 'p1');
  const u = db.calls.update[0].u;
  assert.equal(u['puphotos/u/U1/blobs/2026/p1'], undefined,
    '★ 창고 사진인데 실시간DB에 본문을 다시 썼습니다 — 옮긴 보람이 없어집니다');
  assert.equal(u['puphotos/u/U1/thumbs/2026/p1'], undefined);
});

test('★ purgeOne — 창고 사진을 완전히 지우면 창고 본문도 지운다', async () => {
  const S = loadStore();
  const delCalls = [];
  const db = legacyDb({}, {}, {}, {
    'puphotos/u/U1/trash/2026/p1': { meta: {}, delAt: 1, loc: 'storage' }
  });
  const st = { ref(p) { return { delete() { delCalls.push(p); return Promise.resolve(); } }; } };
  S.init({ uid: 'U1', db, storage: st });
  await S.purgeOne('2026', 'p1');
  assert.deepEqual(delCalls.sort(), ['pu_photos/u/U1/blobs/2026/p1.jpg', 'pu_photos/u/U1/thumbs/2026/p1.jpg'].sort(),
    '★ 트래시만 지우고 창고 본문을 안 지우면 창고에 파일이 영영 남습니다');
  const u = db.calls.update[db.calls.update.length - 1].u;
  assert.equal(u['puphotos/u/U1/trash/2026/p1'], null);
});

test('purgeOne — 창고 지우기가 실패해도 트래시 기록은 지운다', async () => {
  // 창고에서 지우기가 막혀도(이미 없음·권한 등) 트래시가 안 지워지면 더 나쁘다.
  const S = loadStore();
  const db = legacyDb({}, {}, {}, {
    'puphotos/u/U1/trash/2026/p1': { meta: {}, delAt: 1, loc: 'storage' }
  });
  const st = { ref() { return { delete() { return Promise.reject(new Error('이미 없음')); } }; } };
  S.init({ uid: 'U1', db, storage: st });
  await S.purgeOne('2026', 'p1');   // 던지지 않아야 한다
  const u = db.calls.update[db.calls.update.length - 1].u;
  assert.equal(u['puphotos/u/U1/trash/2026/p1'], null);
});

test('purgeOne — 옛(실시간DB) 사진은 창고를 두드리지 않는다', async () => {
  const S = loadStore();
  const db = legacyDb({}, {}, {}, {
    'puphotos/u/U1/trash/2026/p1': { meta: {}, delAt: 1 }   // loc 없음
  });
  let touched = false;
  S.init({ uid: 'U1', db, storage: { ref() { touched = true; return { delete() { return Promise.resolve(); } }; } } });
  await S.purgeOne('2026', 'p1');
  assert.equal(touched, false, '창고에 없는 사진인데 창고를 두드렸습니다');
});

test('★ purgeOldTrash — 30일 지난 창고 사진의 본문을 함께 지운다', async () => {
  const S = loadStore();
  const now = Date.now();
  const delCalls = [];
  const db = legacyDb({}, {}, {}, {
    'puphotos/u/U1/trash/2026': {
      old: { delAt: now - 31 * 86400000, loc: 'storage' },
      keep: { delAt: now - 1 * 86400000, loc: 'storage' },       // 아직 30일 안 됨 — 안 건드린다
      oldRtdb: { delAt: now - 31 * 86400000 }                     // 옛 사진 — 창고를 안 두드린다
    }
  });
  const st = { ref(p) { return { delete() { delCalls.push(p); return Promise.resolve(); } }; } };
  S.init({ uid: 'U1', db, storage: st });
  const n = await S.purgeOldTrash('2026');
  assert.equal(n, 2, 'old·oldRtdb 둘 다 지워야 합니다');
  assert.deepEqual(delCalls.sort(),
    ['pu_photos/u/U1/blobs/2026/old.jpg', 'pu_photos/u/U1/thumbs/2026/old.jpg'].sort(),
    '★ 지날 것만 지워야 합니다 — keep 을 지우면 아직 지우면 안 될 창고 파일을 잃습니다');
  const u = db.calls.update[db.calls.update.length - 1].u;
  assert.equal(u['puphotos/u/U1/trash/2026/old'], null);
  assert.equal(u['puphotos/u/U1/trash/2026/oldRtdb'], null);
  assert.equal('puphotos/u/U1/trash/2026/keep' in u, false, '아직 30일이 안 된 것을 지웠습니다');
});

/* ── 판독 결과 저장 ── */

test('saveRead — 사진 정보 아래 판독 칸만 쓴다 (사진·정보를 건드리지 않는다)', async () => {
  const S = loadStore();
  const db = fakeDb({ takenAt: 1 });   // 사진 정보가 있어야 판독 결과를 쓴다
  S.init({ uid: 'U1', db });
  await S.saveRead('2026', 'p1', { kind: 'bizreg', auto: true });
  assert.equal(db.calls.update.length, 1);
  const u = db.calls.update[0].u;
  // 반드시 read 하위 경로만 — items/p1 을 통째로 쓰면 촬영 시각·올린 사람이 지워진다
  assert.deepEqual(Object.keys(u), ['puphotos/u/U1/items/2026/p1/read']);
  assert.equal(u['puphotos/u/U1/items/2026/p1/read'].kind, 'bizreg');
});

test('saveRead — 실시간DB가 없으면 한국어로 거절한다', async () => {
  const S = loadStore();
  S.init({ uid: 'U1' });
  await assert.rejects(() => S.saveRead('2026', 'p1', {}), /실시간DB/);
});

test('★ saveRead — 판독이 도는 사이 사진이 지워졌으면 되살리지 않는다', async () => {
  // 실데이터에서 read 한 칸만 있고 사진·정보는 아무것도 없는 유령 항목을
  // 여러 건 찾았다(2026-08-15) — 판독(AI 호출)이 몇 초 걸리는 동안 사람이
  // 지운 사진에 뒤늦게 판독 결과가 부분 경로로 쓰이며 자리를 새로 만든 것이다.
  const S = loadStore();
  const db = fakeDb();   // 기본값(undefined) → once() 가 null 을 돌려준다 = 지워짐
  S.init({ uid: 'U1', db });
  await S.saveRead('2026', 'p1', { kind: 'card', auto: true });
  assert.equal(db.calls.update.length, 0,
    '★ 지워진 사진 자리에 read 만 새로 쓰면 유령 항목이 생깁니다.');
});

/* ══════ 지우기 실패 (2026-08-06 대표 보고: "자꾸 에러 난다") ══════
   2026-08-04 사람별 분리 마지막 단계로 puphotos 최상위(옛 자리) 규칙을 지웠다.
   그런데 deletePhoto 가 옛 자리 세 경로를 여전히 null 로 함께 쓰고 있었다.
   실시간DB의 묶음 쓰기(update)는 전부 아니면 전무 — 한 경로가 거부되면
   통째로 실패한다. 그래서 그날부터 **모든 지우기가** 실패했다. */

function fakeDbFor(vals) {
  const updates = [];
  let pushN = 0;
  return {
    updates,
    ref(p) {
      return {
        once() {
          if (vals[p] === 'DENY') return Promise.reject(new Error('PERMISSION_DENIED'));
          return Promise.resolve({ val: function () { return (p in vals) ? vals[p] : null; } });
        },
        update(u) { updates.push(u); return Promise.resolve(); },
        push() { return { key: '-fake' + (++pushN) }; }
      };
    }
  };
}

test('지우기는 내 자리만 쓴다 — 옛 자리를 건드리면 규칙에 막혀 통째로 실패한다', async () => {
  const S = loadStore();
  const db = fakeDbFor({
    'puphotos/u/U1/items/2026/p1': { takenAt: 1, kind: 'photo' },
    'puphotos/u/U1/blobs/2026/p1': 'data:image/jpeg;base64,xx',
    'puphotos/u/U1/thumbs/2026/p1': 'data:image/jpeg;base64,tt',
    /* 옛 자리는 이제 읽기도 거부된다 — 2026-08-04 규칙 정리 이후의 실제 상태 */
    'puphotos/items/2026/p1': 'DENY',
    'puphotos/blobs/2026/p1': 'DENY',
    'puphotos/thumbs/2026/p1': 'DENY'
  });
  S.init({ uid: 'U1', db: db });
  await S.deletePhoto('2026', 'p1', '');
  assert.equal(db.updates.length, 1, '묶음 쓰기가 한 번이어야 합니다');
  const keys = Object.keys(db.updates[0]);
  const outside = keys.filter(function (k) { return k.indexOf('puphotos/u/U1/') !== 0; });
  assert.deepEqual(outside, [],
    '내 자리(u/U1) 밖을 쓰고 있습니다 — 규칙에 거부돼 지우기 전체가 실패합니다: ' + outside.join(', '));
  /* 지우기의 약속은 그대로다: 휴지통 담기 + 지운 기록 + 그 사진의 자리 비우기 */
  assert.ok(keys.some(function (k) { return k.indexOf('/trash/') >= 0; }), '휴지통에 담지 않습니다');
  assert.ok(keys.some(function (k) { return k.indexOf('/dellog/') >= 0; }), '지운 기록을 남기지 않습니다');
  /* ⚠ 2026-08-24: 비우는 자리가 넷이 되었다(items·blobs·thumbs + texts — 글자 있는
     PDF 에서 뽑아 둔 글자). 개수를 못박으면 자리를 늘릴 때마다 멀쩡한 코드를 두고
     운다. 지킬 것은 「**그 사진 하나의 자리만** 비운다」이므로 그것을 본다. */
  const nulls = keys.filter(function (k) { return db.updates[0][k] === null; });
  assert.ok(nulls.length >= 3, '사진 자리를 안 비웁니다: ' + nulls.join(', '));
  nulls.forEach(function (k) {
    assert.match(k, /^puphotos\/u\/U1\/(items|blobs|thumbs|texts)\/2026\/p1$/,
      '★ 그 사진 하나의 자리가 아닙니다 — 상위 노드를 비우면 그 해가 통째로 사라집니다: ' + k);
  });
});

/* ── 전체 근로자 사진 (관리자 전용) ──
   대표 지시(2026-08-06): 총괄책임자는 전체 근로자 사진을 볼 수 있어야 한다. */

test('관리자가 아니면 전체 근로자 사진을 거절한다', async () => {
  const S = loadStore();
  S.init({ uid: 'ADMIN', db: fakeDbFor({}), isAdmin: false });
  await assert.rejects(() => S.listYearAll('2026'), /관리자/);
  await assert.rejects(() => S.listYearsAll(), /관리자/);
});

test('명단에 있는 사람마다 사진을 모아 합친다', async () => {
  const S = loadStore();
  const db = fakeDbFor({
    'puphotos/owners': { U2: { name: '신욱임' }, U3: { name: '박한별' } },
    'puphotos/u/U2/items/2026': { p1: { takenAt: 100, kind: 'doc' } },
    'puphotos/u/U2/items/2026/p1': { takenAt: 100, kind: 'doc' },
    'puphotos/u/U3/items/2026': { p2: { takenAt: 200, kind: 'photo' } },
    'puphotos/u/U3/items/2026/p2': { takenAt: 200, kind: 'photo' },
    'puphotos/u/ADMIN/items/2026': null,
    'puphotos/u/ADMIN/items/2026/p1': null
  });
  S.init({ uid: 'ADMIN', db: db, isAdmin: true, name: '권형하' });
  const items = await S.listYearAll('2026');
  assert.deepEqual(Object.keys(items).sort(), ['p1', 'p2']);
  assert.equal(items.p1.__ownerUid, 'U2');
  assert.equal(items.p1.__ownerName, '신욱임');
  assert.equal(items.p2.__ownerUid, 'U3');
  assert.equal(items.p2.__ownerName, '박한별');
});

test('관리자 자신도 포함한다 — 명단(owners)에 자기 자리가 없을 수 있다', async () => {
  const S = loadStore();
  const db = fakeDbFor({
    'puphotos/owners': { U2: { name: '신욱임' } },
    'puphotos/u/U2/items/2026': { p1: { takenAt: 100 } },
    'puphotos/u/U2/items/2026/p1': { takenAt: 100 },
    'puphotos/u/ADMIN/items/2026': { p9: { takenAt: 300 } },
    'puphotos/u/ADMIN/items/2026/p9': { takenAt: 300 }
  });
  S.init({ uid: 'ADMIN', db: db, isAdmin: true, name: '권형하' });
  const items = await S.listYearAll('2026');
  assert.ok(items.p9, '관리자 자신의 사진이 빠졌습니다');
  assert.equal(items.p9.__ownerName, '권형하');
});

test('한 사람 읽기가 실패해도 나머지는 보인다', async () => {
  // 신욱임 것만 권한 문제로 막혀도, 박한별 것까지 다 안 보이면 안 된다.
  const S = loadStore();
  const db = fakeDbFor({
    'puphotos/owners': { U2: { name: '신욱임' }, U3: { name: '박한별' } },
    'puphotos/u/U2/items/2026': 'DENY',
    'puphotos/u/U2/items/2026/p1': 'DENY',
    'puphotos/items/2026': 'DENY',
    'puphotos/u/U3/items/2026': { p2: { takenAt: 200 } },
    'puphotos/u/U3/items/2026/p2': { takenAt: 200 },
    'puphotos/u/ADMIN/items/2026': null
  });
  S.init({ uid: 'ADMIN', db: db, isAdmin: true, name: '권형하' });
  const items = await S.listYearAll('2026');
  assert.deepEqual(Object.keys(items), ['p2'], '한 사람 실패로 전체가 비었습니다');
});

// listYears 는 후보 연도마다 ref(...).limitToFirst(1).once('value') 로 존재 여부만 본다.
// fakeDbFor 는 이 체인을 지원하지 않으므로 전용 가짜를 쓴다.
function fakeDbYears(nonEmptyPaths, ownersVal) {
  const set = {};
  nonEmptyPaths.forEach(function (p) { set[p] = true; });
  return {
    ref(p) {
      return {
        limitToFirst() {
          return { once() { return Promise.resolve({ exists: function () { return !!set[p]; } }); } };
        },
        once() {
          return Promise.resolve({ val: function () { return p === 'puphotos/owners' ? ownersVal : null; } });
        }
      };
    }
  };
}

test('전체 근로자의 연도 목록은 사람마다의 연도를 합친 것이다', async () => {
  const S = loadStore();
  const db = fakeDbYears(
    ['puphotos/u/U2/items/2025', 'puphotos/u/ADMIN/items/2026'],
    { U2: { name: '신욱임' } }
  );
  S.init({ uid: 'ADMIN', db: db, isAdmin: true, name: '권형하' });
  const ys = await S.listYearsAll();
  assert.ok(ys.indexOf('2025') >= 0, '신욱임의 연도가 빠졌습니다');
  assert.ok(ys.indexOf('2026') >= 0, '올해는 늘 있어야 합니다');
});

/* ── 직접 만드는 분류(대표 지시 2026-08-06: "종류를 추가할 수 있는 기능") ── */

test('분류 목록을 읽는다', async () => {
  const S = loadStore();
  const db = fakeDbFor({ 'puphotos/customKinds': { k1: { name: '자문등계약서', createdAt: 1 } } });
  S.init({ uid: 'U1', db: db });
  const list = await S.listCustomKinds();
  // vm 샌드박스는 다른 realm이라 객체 구조는 같아도 deepEqual이 참조 비교에서 걸린다 — 복사해 비교한다.
  assert.deepEqual(JSON.parse(JSON.stringify(list)), { k1: { name: '자문등계약서', createdAt: 1 } });
});

test('빈 분류 목록은 빈 객체다 — 예외를 던지지 않는다', async () => {
  const S = loadStore();
  S.init({ uid: 'U1', db: fakeDbFor({}) });
  const list = await S.listCustomKinds();
  assert.deepEqual({ ...list }, {});
});

test('새 분류를 만든다', async () => {
  const S = loadStore();
  const db = fakeDbFor({ 'puphotos/customKinds': {} });
  S.init({ uid: 'U1', db: db, name: '권형하' });
  const r = await S.addCustomKind('자문등계약서');
  assert.equal(r.created, true);
  const u = db.updates[0];
  const key = Object.keys(u)[0];
  assert.match(key, /^puphotos\/customKinds\//);
  assert.equal(u[key].name, '자문등계약서');
  assert.equal(u[key].createdBy, '권형하');
  assert.ok(u[key].createdAt > 0);
});

test('같은 이름(대소문자·앞뒤공백 무시)은 두 번 만들지 않는다', async () => {
  const S = loadStore();
  const db = fakeDbFor({ 'puphotos/customKinds': { k1: { name: '자문등계약서' } } });
  S.init({ uid: 'U1', db: db });
  const r = await S.addCustomKind('  자문등계약서  ');
  assert.equal(r.created, false);
  assert.equal(r.id, 'k1');
  assert.equal(db.updates.length, 0, '중복인데 새로 썼습니다');
});

test('빈 이름은 거절한다', async () => {
  const S = loadStore();
  const db = fakeDbFor({ 'puphotos/customKinds': {} });
  S.init({ uid: 'U1', db: db });
  await assert.rejects(() => S.addCustomKind('   '), /이름/);
  assert.equal(db.updates.length, 0);
});

test('사진에 분류를 붙인다 — read.kind 와 다른 칸에 둔다', async () => {
  const S = loadStore();
  const db = fakeDbFor({});
  S.init({ uid: 'U1', db: db });
  await S.setCustomKind('2026', 'p1', 'k1');
  const u = db.updates[0];
  const key = Object.keys(u)[0];
  assert.equal(key, 'puphotos/u/U1/items/2026/p1/customKind');
  assert.equal(u[key], 'k1');
});

test('고정 분류로 옮길 때 이전 직접분류를 한 번에 해제한다', async () => {
  const S = loadStore();
  const db = fakeDbFor({});
  S.init({ uid: 'U1', db: db });
  const read = { kind: 'contract', auto: false, fields: {} };
  await S.setPrimaryKind('2026', 'p1', read, null);
  assert.equal(db.updates.length, 1, '분류와 이전 분류 해제가 따로 저장됩니다');
  const u = db.updates[0];
  assert.deepEqual(u['puphotos/u/U1/items/2026/p1/read'], read);
  assert.equal(u['puphotos/u/U1/items/2026/p1/customKind'], null);
});

test('분류를 뗄 수 있다', async () => {
  const S = loadStore();
  const db = fakeDbFor({});
  S.init({ uid: 'U1', db: db });
  await S.setCustomKind('2026', 'p1', null);
  const u = db.updates[0];
  assert.equal(u['puphotos/u/U1/items/2026/p1/customKind'], null);
});

test('관리자가 남의 사진에 분류를 붙일 때는 그 사람 자리를 쓴다', async () => {
  const S = loadStore();
  const db = fakeDbFor({});
  S.init({ uid: 'ADMIN', db: db, isAdmin: true });
  await S.setCustomKind('2026', 'p1', 'k1', 'U2');
  const u = db.updates[0];
  assert.equal(Object.keys(u)[0], 'puphotos/u/U2/items/2026/p1/customKind');
});

/* ══════ 창고 점검 — 요금제 문제를 권한 문제로 안내하지 않는다 (2026-08-06) ══════
   실제로 이런 안내가 나갔다:
     "막혔습니다 — 사진을 올릴 권한이 없습니다. 콘솔에서 규칙을 넣어 주세요.
      원인: Firebase Storage: Quota for bucket ... exceeded (storage/quota-exceeded)"
   대표님이 규칙을 아무리 고쳐도 안 풀린다 — 신규 버킷은 유료 요금제에서만
   열리고 이 계정은 체험판이라 **규칙과 무관하게** 막힌다. */

test('요금제로 막힌 것을 권한 문제로 안내하지 않는다', () => {
  const S = loadStore();
  const real = "Firebase Storage: Quota for bucket 'pureun-erp.firebasestorage.app' exceeded, " +
    'please view quota on https://firebase.google.com/pricing/. (storage/quota-exceeded)';
  const msg = S.probeMessage({ ok: false, step: 'upload', message: real });
  assert.match(msg, /요금제/, '요금제 문제라고 말하지 않습니다');
  assert.ok(!/규칙을 넣어|권한을 주는 규칙/.test(msg),
    '규칙을 고치라고 시키고 있습니다 — 고쳐도 안 풀립니다: ' + msg);
  /* 사진은 실제로 잘 담기고 있다 — 그 사실을 말해 줘야 불안해하지 않는다 */
  assert.match(msg, /실시간DB/, '지금 사진이 어디에 담기는지 안 알려 줍니다');
  assert.match(msg, /quota-exceeded/, '원인 문구를 그대로 남기지 않았습니다');
});

test('요금제 문제는 어느 단계에서 걸려도 같게 안내한다', () => {
  /* 기기·시점에 따라 init·ref·upload 어디서든 이 오류가 나온다. */
  const S = loadStore();
  const q = 'Quota for bucket exceeded (storage/quota-exceeded)';
  for (const step of ['init', 'ref', 'upload', 'url']) {
    const m = S.probeMessage({ ok: false, step: step, message: q });
    assert.match(m, /요금제/, step + ' 단계에서 요금제라고 안 합니다');
    assert.ok(!/규칙/.test(m) || /규칙을 고쳐도 풀리지 않/.test(m),
      step + ' 단계에서 규칙을 고치라고 시킵니다: ' + m);
  }
});

test('진짜 권한 문제는 여전히 규칙을 고치라고 한다', () => {
  /* 요금제만 골라내야 한다 — 전부 요금제로 몰면 진짜 권한 문제를 못 고친다. */
  const S = loadStore();
  const m = S.probeMessage({ ok: false, step: 'upload', message: 'PERMISSION_DENIED' });
  assert.match(m, /규칙/, '권한 문제인데 규칙 이야기를 안 합니다');
  assert.ok(!/요금제/.test(m), '권한 문제를 요금제로 잘못 안내합니다');
});

test('통과했을 때는 요금제 문구가 끼어들지 않는다', () => {
  const S = loadStore();
  const m = S.probeMessage({ ok: true, step: 'done', url: 'https://x' });
  assert.match(m, /통과/);
  assert.ok(!/요금제/.test(m));
});

/* ══════ 남의 사진 판독 결과 저장 (2026-08-10 대표 지시) ══════
   "다른 직원이 사진찍은 데이터는 입력이 되어야 한다".
   판독은 찍은 사람 세션에서만 돌고 있었다 — saveRead 가 주인을 못 받아 늘
   **내 자리**에 썼기 때문이다. 관리자가 남의 사진을 판독하면 결과가 엉뚱한
   자리에 저장되고, 그 사람 사진은 영원히 안 읽힌 채로 남았다. */

test('saveRead — 주인을 넘기면 그 사람 자리에 쓴다', async () => {
  const S = loadStore();
  const db = fakeDb({ takenAt: 1 });
  S.init({ uid: 'U1', db });
  await S.saveRead('2026', 'p1', { kind: 'card', auto: true }, 'U9');
  const u = db.calls.update[0].u;
  assert.deepEqual(Object.keys(u), ['puphotos/u/U9/items/2026/p1/read'],
    '남의 사진을 판독했는데 내 자리에 씁니다');
});

test('saveRead — 주인을 안 넘기면 예전처럼 내 자리 (기존 흐름 그대로)', async () => {
  const S = loadStore();
  const db = fakeDb({ takenAt: 1 });
  S.init({ uid: 'U1', db });
  await S.saveRead('2026', 'p1', { kind: 'card' });
  assert.deepEqual(Object.keys(db.calls.update[0].u), ['puphotos/u/U1/items/2026/p1/read']);
});
