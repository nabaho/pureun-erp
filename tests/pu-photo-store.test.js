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
  S.init({ uid: 'U1' });
  // 목록만 읽을 때 사진까지 내려받으면 앱이 느려진다. 반드시 분리한다.
  assert.equal(S.metaPath('2026', 'abc'), 'puphotos/u/U1/items/2026/abc');
  assert.equal(S.blobPath('2026', 'abc'), 'puphotos/u/U1/blobs/2026/abc');
  assert.notEqual(S.metaPath('2026', 'abc'), S.blobPath('2026', 'abc'));
});

test('파일 창고 경로는 축소본과 격자용 미리보기가 다르다', () => {
  const S = loadStore();
  assert.equal(S.filePath('2026', 'abc', 'full'), 'pu_photos/2026/abc.jpg');
  assert.equal(S.filePath('2026', 'abc', 'thumb'), 'pu_photos/2026/abc_t.jpg');
  assert.notEqual(S.filePath('2026', 'abc', 'full'), S.filePath('2026', 'abc', 'thumb'));
});

test('파일 종류가 full·thumb 가 아니면 예외를 던진다', () => {
  const S = loadStore();
  // 왜 던지는가: 예전에는 'thumb'이 아닌 모든 값을 원본 축소본 경로로 돌려줬다.
  // 그러면 'thumbnail' 같은 오타 한 번에 격자용 미리보기가 원본 축소본을 덮어쓴다.
  // 사진은 증빙 자료라 덮어쓰면 되돌릴 수 없다 — 조용한 사고보다 즉시 터지는 게 낫다.
  assert.throws(() => S.filePath('2026', 'abc', 'thumbnail'), /full 또는 thumb/);
  assert.throws(() => S.filePath('2026', 'abc', ''), /full 또는 thumb/);
  assert.throws(() => S.filePath('2026', 'abc', undefined), /full 또는 thumb/);
  assert.throws(() => S.filePath('2026', 'abc'), /full 또는 thumb/);
  // 정상 값은 그대로 동작한다.
  assert.equal(S.filePath('2026', 'abc', 'full'), 'pu_photos/2026/abc.jpg');
  assert.equal(S.filePath('2026', 'abc', 'thumb'), 'pu_photos/2026/abc_t.jpg');
});

test('경로가 연도로 갈라진다', () => {
  const S = loadStore();
  S.init({ uid: 'U1' });
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

test('올릴 크기 — 서류는 3200px 고품질, 일반 사진은 1600px', () => {
  const S = loadStore();
  // 서류(명함·사업자등록증·중소기업확인서)는 글씨를 읽어야 하는 물건이라
  // 일반 현장사진과 기준이 달라야 한다(2026-08-03 대표 지시).
  assert.equal(S.uploadSpec(true).maxEdge, 3200);
  assert.equal(S.uploadSpec(false).maxEdge, 1600);
  assert.ok(S.uploadSpec(true).quality > S.uploadSpec(false).quality,
    '서류 품질이 일반 사진보다 높지 않습니다');
  // 미리보기는 종류와 무관하게 격자용 작은 것으로 통일한다.
  assert.equal(S.uploadSpec(true).thumbEdge, S.uploadSpec(false).thumbEdge);
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

test('savePhoto — 사진 한 장이 세 경로에 update 한 번으로 담긴다', async () => {
  const S = loadStore();
  const db = fakeDb();
  S.init({ uid: 'U1', db });
  const r = await S.savePhoto({
    id: 'p1', takenAt: new Date(2026, 6, 15).getTime(),
    meta: { takenAt: 1 }, full: 'data:full', thumb: 'data:thumb'
  });
  // 주의: 샌드박스(vm) 안에서 만들어진 객체는 프로토타입이 달라 strict 비교가
  // 실패한다 — 복사본으로 비교한다.
  assert.deepEqual({ ...r }, { year: '2026', id: 'p1' });
  // 반드시 update 한 번 — 상위 노드 set 은 남의 사진을 지운다(2026-07 사고).
  assert.equal(db.calls.update.length, 1);
  assert.equal(db.calls.update[0].path, '');
  const u = db.calls.update[0].u;
  assert.deepEqual(Object.keys(u).sort(), [
    'puphotos/u/U1/blobs/2026/p1', 'puphotos/u/U1/items/2026/p1', 'puphotos/u/U1/thumbs/2026/p1'
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
  assert.ok(Object.keys(db.calls.update[0].u).every(k => k.includes('/unknown/')));
});

test('savePhoto — 실시간DB가 없으면 한국어로 거절한다', async () => {
  const S = loadStore();
  S.init({ uid: 'U1' });
  await assert.rejects(
    () => S.savePhoto({ id: 'x', takenAt: 1, meta: {}, full: '', thumb: '' }),
    /실시간DB/);
});

test('savePhoto — 파일 창고 방식 저장은 아직 없다고 명확히 거절한다', async () => {
  const S = loadStore();
  S.init({ uid: 'U1', db: fakeDb(), mode: 'storage' });
  await assert.rejects(
    () => S.savePhoto({ id: 'x', takenAt: 1, meta: {}, full: '', thumb: '' }),
    /파일 창고/);
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
  assert.deepEqual(JSON.parse(JSON.stringify(items)), { a: { takenAt: 1 } });
  // 옮기기 전에도 사진이 보이도록 옛 자리도 함께 읽는다
  assert.deepEqual(db.calls.once.sort(), ['puphotos/items/2026', 'puphotos/u/U1/items/2026']);
});

test('listYear — 비어 있으면 빈 객체', async () => {
  const S = loadStore();
  S.init({ uid: 'U1', db: fakeDb(undefined) });
  assert.deepEqual({ ...(await S.listYear('2020')) }, {});
});

test('loadThumb·loadFull — 한 장씩, 서로 다른 경로에서', async () => {
  const S = loadStore();
  const db = fakeDb('data:x');
  S.init({ uid: 'U1', db });
  assert.equal(await S.loadThumb('2026', 'p1'), 'data:x');
  assert.equal(await S.loadFull('2026', 'p1'), 'data:x');
  assert.deepEqual(db.calls.once, ['puphotos/u/U1/thumbs/2026/p1', 'puphotos/u/U1/blobs/2026/p1']);
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
    assert.ok(k.indexOf('puphotos/u/U1/') === 0, '내 자리 밖에 썼습니다: ' + k);
  }
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

test('관리자가 아니면 사람 명단을 읽지 않는다', async () => {
  // 규칙이 막지만, 화면이 헛되게 두드려 오류를 만들 이유도 없다
  const S = loadStore();
  const db = fakeDb({ U1: {} });
  S.init({ uid: 'U1', db, isAdmin: false });
  assert.deepEqual({ ...(await S.listOwners()) }, {});
  assert.equal(db.calls.once.length, 0);
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
  await S.deletePhoto('2026', 'p1', '중복 — 명함첩에 이미 있었음');
  assert.equal(db.calls.update[0].u['puphotos/u/U1/dellog/p1'].why, '중복 — 명함첩에 이미 있었음');
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

const LEG_ITEMS = { 2026: { a: { by: 'U2', takenAt: 1 }, b: { by: 'U1', takenAt: 2 } } };
const LEG_BLOBS = { 2026: { a: 'data:a', b: 'data:b' } };
const LEG_THUMBS = { 2026: { a: 'data:ta', b: 'data:tb' } };

test('이사 — 올린 사람 자리로 복사하고 원본은 그대로 둔다', async () => {
  const S = loadStore();
  const db = legacyDb(LEG_ITEMS, LEG_BLOBS, LEG_THUMBS);
  S.init({ uid: 'ADMIN', db, isAdmin: true });
  const r = await S.migrateLegacy();
  assert.equal(r.copied, 2);
  assert.equal(r.unknown, 0);
  assert.equal(r.failed, 0);
  const wrote = db.calls.update.map(function (c) { return Object.keys(c.u); }).flat();
  // 각자 자기 자리로 갔는지
  assert.ok(wrote.indexOf('puphotos/u/U2/items/2026/a') >= 0, 'U2 자리로 안 갔습니다');
  assert.ok(wrote.indexOf('puphotos/u/U1/items/2026/b') >= 0, 'U1 자리로 안 갔습니다');
  assert.ok(wrote.indexOf('puphotos/u/U2/blobs/2026/a') >= 0);
  assert.ok(wrote.indexOf('puphotos/u/U2/thumbs/2026/a') >= 0);
  // **원본을 지우지 않았다**
  assert.ok(!wrote.some(function (k) { return /^puphotos\/(items|blobs|thumbs)\//.test(k); }),
    '옛 자리를 건드렸습니다: ' + wrote.join(', '));
});

test('이사 — 올린 사람을 모르는 사진은 관리자 자리로 가고 그 수를 알린다', async () => {
  // 조용히 버리면 사진이 사라진 줄도 모른다
  const S = loadStore();
  const db = legacyDb({ 2026: { x: { takenAt: 1 } } }, { 2026: { x: 'd' } }, { 2026: { x: 't' } });
  S.init({ uid: 'ADMIN', db, isAdmin: true });
  const r = await S.migrateLegacy();
  assert.equal(r.copied, 1);
  assert.equal(r.unknown, 1);
  const wrote = db.calls.update.map(function (c) { return Object.keys(c.u); }).flat();
  assert.ok(wrote.indexOf('puphotos/u/ADMIN/items/2026/x') >= 0, '관리자 자리로 안 갔습니다');
});

test('이사 — 한 장이 실패해도 나머지를 복사하고 실패 수를 알린다', async () => {
  const S = loadStore();
  const db = legacyDb(LEG_ITEMS, LEG_BLOBS, LEG_THUMBS);
  let n = 0;
  const realRef = db.ref;
  db.ref = function (p) {
    const r = realRef.call(db, p);
    const realUpdate = r.update;
    r.update = function (u) {
      n++;
      if (n === 1) return Promise.reject(new Error('권한 없음'));
      return realUpdate.call(r, u);
    };
    return r;
  };
  S.init({ uid: 'ADMIN', db, isAdmin: true });
  const r = await S.migrateLegacy();
  assert.equal(r.failed, 1);
  assert.equal(r.copied, 1);
});

test('이사 — 관리자가 아니면 하지 않는다', async () => {
  const S = loadStore();
  const db = legacyDb(LEG_ITEMS, LEG_BLOBS, LEG_THUMBS);
  S.init({ uid: 'U1', db, isAdmin: false });
  await assert.rejects(() => S.migrateLegacy(), /관리자/);
  assert.equal(db.calls.update.length, 0);
});

test('옛 자리 지우기 — 복사가 끝났다는 표시가 없으면 거절한다', async () => {
  const S = loadStore();
  const db = legacyDb(LEG_ITEMS, LEG_BLOBS, LEG_THUMBS);
  S.init({ uid: 'ADMIN', db, isAdmin: true });
  await assert.rejects(() => S.dropLegacy(), /옮기/);
  assert.equal(db.calls.update.length, 0, '복사도 안 했는데 지우려 했습니다');
});

test('옛 자리 지우기 — 복사한 뒤에는 세 자리만 지운다', async () => {
  const S = loadStore();
  const db = legacyDb(LEG_ITEMS, LEG_BLOBS, LEG_THUMBS);
  S.init({ uid: 'ADMIN', db, isAdmin: true });
  await S.migrateLegacy();
  const before = db.calls.update.length;
  await S.dropLegacy();
  const last = db.calls.update[db.calls.update.length - 1].u;
  assert.deepEqual(Object.keys(last).sort(), ['puphotos/blobs', 'puphotos/items', 'puphotos/thumbs']);
  Object.keys(last).forEach(k => assert.equal(last[k], null));
  assert.ok(db.calls.update.length > before);
});

test('이사 — 옛 자리가 비어 있으면 아무것도 쓰지 않는다', async () => {
  const S = loadStore();
  const db = legacyDb({}, {}, {});
  S.init({ uid: 'ADMIN', db, isAdmin: true });
  const r = await S.migrateLegacy();
  assert.equal(r.copied, 0);
  assert.equal(db.calls.update.length, 0);
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
  for (const k of Object.keys(db.calls.update[0].u)) {
    assert.match(k, /^puphotos\/(u\/U1\/)?((items|blobs|thumbs|trash)\/2026\/p1|dellog\/p1)$/, '위험한 경로입니다: ' + k);
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

/* ── 판독 결과 저장 ── */

test('saveRead — 사진 정보 아래 판독 칸만 쓴다 (사진·정보를 건드리지 않는다)', async () => {
  const S = loadStore();
  const db = fakeDb();
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
  /* 지우기의 약속은 그대로다: 휴지통 담기 + 지운 기록 + 세 경로 비우기 */
  assert.ok(keys.some(function (k) { return k.indexOf('/trash/') >= 0; }), '휴지통에 담지 않습니다');
  assert.ok(keys.some(function (k) { return k.indexOf('/dellog/') >= 0; }), '지운 기록을 남기지 않습니다');
  const nulls = keys.filter(function (k) { return db.updates[0][k] === null; });
  assert.equal(nulls.length, 3, '사진 하나의 세 경로만 비워야 합니다: ' + nulls.join(', '));
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
