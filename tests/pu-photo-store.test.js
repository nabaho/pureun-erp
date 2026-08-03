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
  // 격자가 본문(1600px)까지 받으면 느려진다. 반드시 갈라 둔다.
  assert.equal(S.thumbPath('2026', 'p1'), 'puphotos/thumbs/2026/p1');
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

/* ── 서류 고화질 ── */

test('올릴 크기 — 서류는 2560px 고품질, 일반 사진은 1600px', () => {
  const S = loadStore();
  // 서류(명함·사업자등록증·중소기업확인서)는 글씨를 읽어야 하는 물건이라
  // 일반 현장사진과 기준이 달라야 한다(2026-08-03 대표 지시).
  assert.equal(S.uploadSpec(true).maxEdge, 2560);
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
  S.init({ db });
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
    'puphotos/blobs/2026/p1', 'puphotos/items/2026/p1', 'puphotos/thumbs/2026/p1'
  ]);
  assert.equal(u['puphotos/blobs/2026/p1'], 'data:full');
  assert.equal(u['puphotos/thumbs/2026/p1'], 'data:thumb');
});

test('savePhoto — 촬영 시각을 모르는 사진은 unknown 연도로', async () => {
  const S = loadStore();
  const db = fakeDb();
  S.init({ db });
  const r = await S.savePhoto({ id: 'p2', takenAt: null, meta: {}, full: 'f', thumb: 't' });
  assert.equal(r.year, 'unknown');
  assert.ok(Object.keys(db.calls.update[0].u).every(k => k.includes('/unknown/')));
});

test('savePhoto — 실시간DB가 없으면 한국어로 거절한다', async () => {
  const S = loadStore();
  S.init({});
  await assert.rejects(
    () => S.savePhoto({ id: 'x', takenAt: 1, meta: {}, full: '', thumb: '' }),
    /실시간DB/);
});

test('savePhoto — 파일 창고 방식 저장은 아직 없다고 명확히 거절한다', async () => {
  const S = loadStore();
  S.init({ db: fakeDb(), mode: 'storage' });
  await assert.rejects(
    () => S.savePhoto({ id: 'x', takenAt: 1, meta: {}, full: '', thumb: '' }),
    /파일 창고/);
});

test('newId — db가 있으면 push 키, 없으면 임시 키', () => {
  const S = loadStore();
  S.init({ db: fakeDb() });
  assert.match(S.newId(), /^-fake/);
  const S2 = loadStore();
  S2.init({});
  assert.ok(S2.newId().length > 5);
});

test('listYear — 그 연도 목록만 한 번 읽는다', async () => {
  const S = loadStore();
  const db = fakeDb({ a: { takenAt: 1 } });
  S.init({ db });
  const items = await S.listYear('2026');
  assert.deepEqual(items, { a: { takenAt: 1 } });
  assert.deepEqual(db.calls.once, ['puphotos/items/2026']);
});

test('listYear — 비어 있으면 빈 객체', async () => {
  const S = loadStore();
  S.init({ db: fakeDb(undefined) });
  assert.deepEqual({ ...(await S.listYear('2020')) }, {});
});

test('loadThumb·loadFull — 한 장씩, 서로 다른 경로에서', async () => {
  const S = loadStore();
  const db = fakeDb('data:x');
  S.init({ db });
  assert.equal(await S.loadThumb('2026', 'p1'), 'data:x');
  assert.equal(await S.loadFull('2026', 'p1'), 'data:x');
  assert.deepEqual(db.calls.once, ['puphotos/thumbs/2026/p1', 'puphotos/blobs/2026/p1']);
});

test('읽기 함수들 — 실시간DB가 없으면 한국어로 거절한다', async () => {
  const S = loadStore();
  S.init({});
  await assert.rejects(() => S.listYear('2026'), /실시간DB/);
  await assert.rejects(() => S.loadThumb('2026', 'x'), /실시간DB/);
  await assert.rejects(() => S.loadFull('2026', 'x'), /실시간DB/);
});
