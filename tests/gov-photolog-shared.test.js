/* 사진 변경 이력을 «공용 자리»로 (대표 결정 2026-08-29 「가」)
   + 📦 사진 ZIP 을 환경설정으로

   ★ 왜 옮겼나 — 이력은 「누가 언제 무슨 사진을 지웠나」를 **나중에 답하기 위한**
     기록인데, 그동안 그 사람 PC 브라우저 안에만 있었다. 다른 사람은 못 보고,
     브라우저 자료를 지우면 사라졌다. 답해야 할 때 없는 기록은 없는 것과 같다.
   ★ 썸네일을 뺐다 — 그림(200건에 0.8MB) 때문에 공용으로 못 옮기고 있었다.
     이력의 값어치는 «누가·언제·무엇을»에 있다. */
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'gov-consulting.html'), 'utf8');
const bare = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
const S = bare(SRC);

function fn(name) {
  const m = new RegExp('function\\s+' + name + '\\s*\\(').exec(S);
  assert.ok(m, name + ' 을(를) 찾지 못했다');
  const a = m.index;
  const ends = [S.indexOf('\nfunction ', a + 8), S.indexOf('\nasync function ', a + 8)].filter((x) => x > a);
  return S.slice(a, ends.length ? Math.min.apply(null, ends) : a + 3000);
}

/* ══════ ① 공용 자리에 쌓는다 ══════ */

test('이력을 «한 줄씩» 공용 자리에 올린다 — 배열을 통째로 덮지 않는다', () => {
  const f = fn('logPhoto');
  assert.ok(/\.push\(entry\)/.test(f) && /PHOTO_LOG_NODE/.test(f),
    '공용 자리에 한 줄씩 올리지 않는다');
  /* 통째로 올리면 두 사람이 같은 때 지울 때 나중 사람이 앞사람 기록을 «조용히» 덮는다 */
  assert.ok(!/ref\(PHOTO_LOG_NODE\)\.set\(/.test(f), '배열을 통째로 덮어쓴다 — 기록이 사라진다');
});

test('클라우드가 없으면 이 PC 에 쌓아 둔다 — 오프라인 기록이 새면 안 된다', () => {
  const f = fn('logPhoto');
  assert.ok(/setPhotoLog\(/.test(f), '미연결일 때 남길 곳이 없다');
});

test('화면은 «공용 + 이 PC»를 합쳐 보여 준다', () => {
  const r = fn('renderPhotoLog');
  assert.ok(/photoLogAll\(/.test(r), '이 PC 것만 보면 남이 지운 기록이 안 보인다');
  const a = fn('photoLogAll');
  assert.ok(/_photoLog/.test(a) && /getPhotoLog\(/.test(a), '둘 중 하나만 본다');
  assert.ok(/seen\[/.test(a), '같은 건이 두 번 보인다 — 겹치는 것을 걸러야 한다');
});

test('공용 자리를 구독한다 — 안 그러면 다른 PC 기록이 안 들어온다', () => {
  /* ⚠ «부르는 곳»을 봐야 한다 — 그냥 이름만 찾으면 **함수 정의**에 걸려서,
     부르는 줄을 지워도 통과한다(실제로 그랬다). 정의는 `(){`, 부르는 곳은 `();`. */
  assert.ok(/subscribePhotoLog\(\)\s*;/.test(S), '구독을 «부르는» 곳이 없다');
  const s = fn('subscribePhotoLog');
  assert.ok(/limitToLast\(/.test(s), '통째로 받으면 쌓일수록 요금이 는다');
});

/* ══════ ② 썸네일을 안 담는다 ══════ */

test('«변경 전 그림»을 더 이상 담지 않는다 — 그 무게가 공용행을 막고 있었다', () => {
  assert.ok(!/prevThumb/.test(S), '썸네일이 되살아났다 — 200건에 0.8MB 다');
  assert.ok(!/function makeThumb/.test(S), '쓰지 않는 썸네일 만들기가 남아 있다');
});

test('이력 한 건에 «누가·언제·무엇을»이 다 있다 — 그것이 값어치다', () => {
  const f = fn('logPhoto');
  ['action', 'slotName', 'co:', 'ty:', 'round', 'who'].forEach((k) => {
    assert.ok(f.indexOf(k) >= 0, k + ' 이(가) 빠졌다 — 나중에 답할 수 없다');
  });
});

/* ══════ ③ 실제로 돌려 본다 ══════ */

test('공용과 이 PC 것을 합치되, 같은 건은 하나로 · 새것이 위로', () => {
  const a = S.indexOf('function photoLogAll');
  const b = S.indexOf('\nfunction subscribePhotoLog', a);
  const ctx = {
    console, Object, Array, JSON,
    PHOTO_LOG_MAX: 200,
    _photoLog: [
      { t: '2026-08-29T01:00', sid: 'S1', slot: 0, action: 'add', who: '가' },
      { t: '2026-08-29T03:00', sid: 'S2', slot: 1, action: 'delete', who: '나' },
    ],
    getPhotoLog: () => [
      { t: '2026-08-29T01:00', sid: 'S1', slot: 0, action: 'add', who: '가' },   // 같은 건
      { t: '2026-08-29T02:00', sid: 'S3', slot: 0, action: 'replace', who: '다' },
    ],
  };
  vm.createContext(ctx);
  vm.runInContext(S.slice(a, b > a ? b : a + 1200) + '\nthis._f = photoLogAll;', ctx);
  const got = ctx._f();
  assert.strictEqual(got.length, 3, '겹치는 건을 안 걸렀다 (지금 ' + got.length + '건)');
  assert.strictEqual(got.map((x) => x.t.slice(-5)).join(','), '03:00,02:00,01:00',
    '새것이 위로 오지 않는다');
});

/* ══════ ④ 머리줄 정리 · ZIP 은 환경설정으로 ══════ */

test('📦 사진 ZIP 은 «환경설정»에 있고 머리줄에는 없다', () => {
  const hdr = SRC.slice(SRC.indexOf('<span class="hdr-extra">'), SRC.indexOf('</span>', SRC.indexOf('<span class="hdr-extra">')));
  assert.ok(hdr.indexOf('zipBtn') < 0, 'ZIP 이 아직 머리줄에 있다');
  assert.ok(SRC.indexOf('id="zipBtn"') > 0, 'ZIP 단추가 아예 사라졌다 — 사진을 뽑을 길이 없어진다');
  /* 환경설정 백업 칸 안에 있어야 한다 — 내보내기(JSON) 바로 옆 */
  const at = SRC.indexOf('id="exportJsonBtn"');
  const zip = SRC.indexOf('id="zipBtn"');
  assert.ok(zip > at && zip - at < 2000, 'ZIP 이 백업 칸과 떨어져 있다');
});

test('ZIP 이 «사진만» 담는다는 것을 화면에 적는다', () => {
  /* 예전 이름표는 「전체 데이터 백업」이었는데 실제로는 사진뿐이라 거짓말이었다.
     ⚠ **HTML 주석(<!-- -->)을 먼저 걷는다** — 「왜 고쳤는지」를 적어 둔 주석에
       그 옛 이름표가 나오는데, 그것까지 걸면 잘 쓴 주석이 검사를 깨뜨린다. */
  const visible = SRC.replace(/<!--[\s\S]*?-->/g, ' ');
  assert.ok(!/전체 데이터 백업/.test(visible), '「전체 데이터 백업」이라는 틀린 이름표가 남아 있다');
  /* ⚠ 여기서도 주석을 먼저 걷는다 — 바로 위 설명 주석에 같은 말이 있어서,
     정작 «화면에 보이는» 안내를 지워도 통과했다. */
  const at = visible.indexOf('id="zipBtn"');
  assert.ok(at > 0, 'ZIP 단추를 찾지 못했다');
  const box = visible.slice(Math.max(0, at - 900), at);
  assert.ok(/이 PC 에 올라와 있는 사진만/.test(box),
    '「이 PC 것만 담긴다」를 안 알려 준다 — 다른 PC 사진이 빠진 줄 모르고 제출하게 된다');
});
