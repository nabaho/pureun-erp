/* 올린 때·순서로 저장하고 줄 세운다 (대표 지시 2026-08-13)
   "입력된 사진은 사진의 저장된 시간 날짜가 아닌 지금 올린 시간과 순서대로
    사진첩에 저장되고 기업정보함에 내용이 저장되게 해라 그래야 찾기가 쉬워진다"

   ⚠ 이 검사가 지키는 것은 **찾기 쉬움**이다. 폰에 몇 해 묵어 있던 사진을 오늘
     한꺼번에 올렸을 때, 그것이 오늘 자리에 오늘 고른 차례대로 놓여야 한다.
     촬영 시각으로 되돌리면 방금 올린 사진이 목록 한참 아래로 파묻힌다. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(ROOT, 'pu-photos.html'), 'utf8');
const storeSrc = fs.readFileSync(path.join(ROOT, 'js', 'pu-photo-store.js'), 'utf8');
const { cutFn } = require('./cut-fn');

function loadStore() {
  const ctx = { window: {}, console, Date, Number, Math, JSON, Object, Array, String, Promise };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(storeSrc, ctx);
  return ctx.window.PuPhotoStore;
}

/* 앱에서 함수 한 덩어리만 떼어 온다 — 같은 글이 여러 곳에 있어 통짜로 찾으면
   엉뚱한 자리를 보게 된다. */
function fnOf(name, src) {
  const s = src || app;
  const head = '^(?:async )?function ' + name + '\\(';
  const one = s.match(new RegExp(head + '[^\\n]*\\{[^\\n]*\\}$', 'm'));
  if (one) return one[0];
  const m = s.match(new RegExp(head + '[\\s\\S]*?\\r?\\n\\}', 'm'));
  assert.ok(m, name + ' 를 찾을 수 없습니다');
  return m[0];
}

/* 주석을 걷어낸 알맹이 — 주석에 적은 낱말이 검사에 걸리면 안 된다
   (「photoTime 과 같이 맞추지 말 것」이라는 경고문이 photoTime 으로 읽힌다). */
function codeOf(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

/* photoTime / comparePhotosNewest 를 실제로 돌린다 — 있는지만 보면
   부등호를 뒤집어도 잡히지 않는다. */
function loadSort() {
  const ctx = { Number, String, Math };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(fnOf('photoTime') + '\n' + fnOf('comparePhotosNewest'), ctx);
  return ctx;
}

test('저장 자리는 올린 때가 정한다 — 옛 사진을 오늘 올리면 올해 자리에 담긴다', () => {
  const S = loadStore();
  const oldShot = new Date(2019, 2, 3).getTime();
  const today = new Date(2026, 7, 13).getTime();
  assert.equal(S.photoYear({ takenAt: oldShot, upAt: today }), '2026');
  // 촬영 시각으로 세면 2019 자리에 들어가 오늘 화면에서 아예 안 보인다
  assert.notEqual(S.photoYear({ takenAt: oldShot, upAt: today }), '2019');
});

test('올린 때가 없는 옛 사진은 촬영 시각으로 되짚는다', () => {
  const S = loadStore();
  const shot = new Date(2024, 4, 1).getTime();
  assert.equal(S.photoYear({ takenAt: shot }), '2024');
  // 되짚지 않으면 이미 저장된 옛 사진의 자리를 못 찾아 통째로 사라진다
  assert.notEqual(S.photoYear({ takenAt: shot }), S.yearOf(0));
});

test('savePhoto 는 meta 의 올린 때로 해를 고른다', async () => {
  const S = loadStore();
  const paths = [];
  S.init({
    uid: 'U1',
    db: {
      ref() {
        return {
          update(u) { paths.push(...Object.keys(u)); return Promise.resolve(); },
          push() { return { key: '-x' }; }
        };
      }
    }
  });
  const r = await S.savePhoto({
    id: 'p9',
    takenAt: new Date(2019, 0, 5).getTime(),          // 폰이 말하는 촬영 시각
    meta: { takenAt: new Date(2019, 0, 5).getTime(), upAt: new Date(2026, 7, 13).getTime() },
    full: 'data:f', thumb: 'data:t'
  });
  assert.equal(r.year, '2026');
  assert.ok(paths.some(function (p) { return p.indexOf('/items/2026/p9') >= 0; }),
    '사진을 올린 해 자리에 담지 않았습니다');
  assert.ok(!paths.some(function (p) { return p.indexOf('/2019/') >= 0; }),
    '촬영 연도 자리에 담았습니다 — 오늘 화면에서 사라집니다');
});

test('한 번에 올린 묶음은 올린 시각이 하나다 — 장마다 새로 재지 않는다', () => {
  /* ⚠ 고정 폭(6,400자)으로 자르고 있었다. addFiles 는 할 일이 늘 때마다 길어져
     창이 끝에 못 닿는다 — 통째로 뽑는다(tests/cut-fn.js). */
  const fn = cutFn(app, 'async function addFiles(');
  assert.match(fn, /const batchUpAt = Date\.now\(\);/,
    '묶음 시각을 한 번에 재지 않습니다');
  assert.match(fn, /upAt: batchUpAt,/,
    '장마다 시각을 새로 재면 한 번에 고른 묶음이 목록에서 흩어집니다');
  assert.match(fn, /seq: fi,/, '고른 차례를 안 남기면 묶음 안 차례가 뒤집힙니다');
  // 옛 방식이 남아 있으면 안 된다
  assert.ok(!/upAt: Date\.now\(\),/.test(fn), '아직 장마다 시각을 재고 있습니다');
});

test('목록 차례는 올린 때가 먼저다 — 옛 사진을 오늘 올리면 맨 위로 온다', () => {
  const s = loadSort();
  const oldPhoto = { id: 'a', meta: { takenAt: new Date(2019, 2, 3).getTime(), upAt: 300 } };
  const newPhoto = { id: 'b', meta: { takenAt: new Date(2026, 7, 1).getTime(), upAt: 100 } };
  assert.equal(s.photoTime(oldPhoto), 300);
  const sorted = [newPhoto, oldPhoto].sort(s.comparePhotosNewest).map(function (x) { return x.id; });
  assert.equal(sorted.join(','), 'a,b',
    '나중에 올린 사진이 위로 오지 않습니다 — 방금 올린 것을 못 찾습니다');
});

test('같은 묶음 안에서는 고른 차례를 지킨다 — 1번으로 고른 장이 앞이다', () => {
  const s = loadSort();
  const at = 5000;
  const list = [
    { id: 'c', meta: { upAt: at, seq: 2, takenAt: 9 } },
    { id: 'a', meta: { upAt: at, seq: 0, takenAt: 3 } },
    { id: 'b', meta: { upAt: at, seq: 1, takenAt: 7 } }
  ];
  const got = list.slice().sort(s.comparePhotosNewest).map(function (x) { return x.id; });
  assert.equal(got.join(','), 'a,b,c', '고른 차례대로 놓이지 않습니다');
  // 차례가 없는 옛 사진끼리는 촬영 시각으로 갈린다(자리가 흔들리면 안 된다)
  const olds = [
    { id: 'x', meta: { upAt: at, takenAt: 3 } },
    { id: 'y', meta: { upAt: at, takenAt: 9 } }
  ];
  assert.equal(olds.slice().sort(s.comparePhotosNewest).map(function (v) { return v.id; }).join(','), 'y,x');
});

test('올린 때가 없는 옛 사진도 줄에서 안 밀린다', () => {
  const s = loadSort();
  const old2024 = { id: 'o', meta: { takenAt: new Date(2024, 0, 1).getTime() } };
  const old2020 = { id: 'p', meta: { takenAt: new Date(2020, 0, 1).getTime() } };
  assert.ok(s.photoTime(old2024) > 0, '올린 때가 없다고 0 으로 두면 옛 사진이 전부 맨 밑으로 몰립니다');
  assert.equal([old2020, old2024].sort(s.comparePhotosNewest).map(function (x) { return x.id; }).join(','), 'o,p');
});

test('화면 날짜 줄·파일 이름도 올린 때를 본다', () => {
  assert.match(app, /dayKey\(photoTime\(it\)\)/, '날짜 줄이 아직 촬영 시각을 봅니다');
  assert.match(app, /const d = new Date\(photoTime\(it\) \|\| Date\.now\(\)\);/,
    '내려받는 파일 이름이 화면의 날짜와 어긋납니다');
  assert.ok(!/dayKey\(it\.meta\.takenAt \|\| it\.meta\.upAt/.test(app),
    '옛 날짜 셈법이 남아 있습니다');
});

test('저장한 자리와 화면에 넣는 자리가 같은 셈법이다', () => {
  // 다르면 방금 올린 사진이 새로고침해야만 나타난다
  assert.match(fnOf('addToGrid'), /PuPhotoStore\.photoYear\(job\.meta\)/);
  assert.match(fnOf('startRead'), /PuPhotoStore\.photoYear\(job\.meta\)/);
  assert.ok(!/PuPhotoStore\.yearOf\(job\.takenAt\)/.test(app),
    '아직 촬영 시각으로 해를 고르는 자리가 남아 있습니다');
});

test('기업정보함에 적히는 날짜도 올린 때다', () => {
  const fn = app.slice(app.indexOf('function sendCards('),
    app.indexOf('function sendCards(') + 2600);
  assert.match(fn, /takenAt: photoTime\(it \|\| job\) \|\| Date\.now\(\),/,
    '기업정보함 날짜가 촬영 시각이면 오래된 명함이 목록 아래에 파묻힙니다');
});

test('밖으로 넘길 때 붙는 날짜도 올린 때다', () => {
  const fn = fnOf('dragRefOf');
  assert.match(fn, /takenAt: photoTime\(it\)/);
  assert.match(fn, /dayLabel\(photoTime\(it\)\) \+ ' 사진'/);
});

test('보유기간만은 촬영일로 센다 — 목록 차례와 같이 맞추면 안 된다', () => {
  const fn = codeOf(fnOf('keepUntil'));
  assert.match(fn, /const base = m\.takenAt \|\| m\.upAt \|\| 0;/,
    '보유기간을 올린 때로 세면 옛 사진을 규정보다 오래 갖고 있게 됩니다');
  assert.ok(!/photoTime/.test(fn), '보유기간이 목록 차례를 따라갔습니다');
});

test('촬영일을 고쳐도 사진을 옮기지 않는다 — 자리는 올린 때가 정하므로', () => {
  const m = storeSrc.match(/function setTakenAt\([\s\S]*?\r?\n  \}/);
  assert.ok(m, 'setTakenAt 를 찾을 수 없습니다');
  const fn = codeOf(m[0]);
  assert.ok(!/loadFull\(/.test(fn), '아직 사진을 통째로 나르고 있습니다');
  assert.ok(!/= null;/.test(fn), '옛 자리를 지우고 있습니다 — 옮기다 끊기면 사진을 잃습니다');
  assert.match(fn, /\/takenAt'\] = n;/);
});

test('촬영일을 고친 뒤에도 화면이 열린 채로 남는다', () => {
  const fn = codeOf(fnOf('saveMyNote'));
  assert.ok(!/movedTo/.test(fn), '해가 바뀐다고 화면을 닫습니다 — 이제 옮기지 않습니다');
  assert.match(fn, /gridItems\.sort\(comparePhotosNewest\);/,
    '고친 뒤 목록 차례를 새로 매기지 않습니다');
});

test('날짜로 찾을 때 올린 날과 찍은 날을 다 받는다', () => {
  const m = app.match(/\[m\.takenAt, m\.upAt\]\.forEach\(function \(ts\) \{[\s\S]*?\}\);/);
  assert.ok(m, '날짜 색인이 한쪽만 봅니다');
  assert.match(m[0], /if \(!ts\) return;/);
  assert.match(m[0], /'월' \+ d\.getDate\(\) \+ '일'/);
});

test('크게 보기에 찍은 때를 함께 남긴다 — 날짜를 잃으면 안 된다', () => {
  /* 있는지만 보면 안 된다 — 「찍은 때」라는 글자는 다른 갈래에도 있어서
     정작 두 날짜를 함께 적는 줄을 지워도 안 잡힌다. 실제로 돌려 본다. */
  const ctx = {
    Number, String,
    esc: (s) => String(s),
    whenText: (ts) => 'T' + ts,
    dayKey: (ts) => 'D' + Math.floor(ts / 100)
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(fnOf('whenBox'), ctx);

  // 찍은 날과 올린 날이 다르면 **둘 다** 적는다
  const both = ctx.whenBox({ meta: { takenAt: 100, upAt: 900 } });
  assert.match(both, /올린 때 T900/);
  assert.match(both, /찍은 때 T100/, '찍은 때를 안 적으면 언제 찍은 사진인지 영영 잃습니다');

  // 같은 날이면 한 번만 — 똑같은 날짜를 두 번 찍으면 읽는 사람이 헷갈린다
  const same = ctx.whenBox({ meta: { takenAt: 910, upAt: 950 } });
  assert.match(same, /올린 때 T950/);
  assert.ok(!/찍은 때/.test(same), '같은 날인데 두 번 적었습니다');

  // 올린 때가 없는 옛 사진은 찍은 때만
  assert.match(ctx.whenBox({ meta: { takenAt: 100 } }), /찍은 때 T100/);
  assert.equal(ctx.whenBox({ meta: {} }), '');

  // 패널 두 갈래(판독 전·후)에 모두 끼워야 한다
  const uses = app.match(/whenBox\(it\)/g) || [];
  assert.ok(uses.length >= 2, '판독 전 화면에는 날짜가 안 보입니다: ' + uses.length);
});
