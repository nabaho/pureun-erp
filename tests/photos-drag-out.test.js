'use strict';
/* 고른 사진을 밖으로 끌어내기 — 대표 승인 목업 2026-08-23

   "화면에서 클릭된 사진이 있는 경우 마우스로 드래그해서 외부의 프로그램 또는
    클로드코드 등으로 직접 옮길 수 있게 사진을 정리해줘"

   8/10 에 «크게 보기» 한 장은 열려 있었는데(viewerDragOut), 격자에서 끌면 푸른 앱
   끼리만 통하는 표식(PuDrag)만 실려 탐색기·한글·메일로는 아무것도 안 나갔다.

   지켜야 하는 것 넷:
   ① 다른 프로그램이 알아듣는 것은 DownloadURL 이고 **파일은 한 개뿐**이다.
   ② **text/plain 을 건드리면 안 된다** — PuDrag 가 거기에 표식을 담고, 전용 종류를
      지우는 브라우저에서는 그것만 보고 읽는다. 덮으면 컨설팅·기금이 사진을 못 받는다.
   ③ **미리보기가 아니라 원본**을 보낸다(서류는 글자를 읽어야 한다). 원본 주소는
      이미 정보에 있어 기다림 없이 실을 수 있다 — dragstart 는 기다려 주지 않는다.
   ④ 창 안에 도로 놓아도 **다시 안 올라간다**(2026-08-04·08-05 자가복제 사고).

   실행: node --test tests/*.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const R = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(R, 'pu-photos.html'), 'utf8');

function fnOf(name) {
  const i = app.indexOf('function ' + name + '(');
  assert.ok(i >= 0, name + ' 를 찾지 못했습니다');
  let d = 0;
  for (let k = app.indexOf('{', i); k < app.length; k++) {
    if (app[k] === '{') d++;
    else if (app[k] === '}') { d--; if (!d) return app.slice(i, k + 1); }
  }
  throw new Error(name + ' 의 끝을 찾지 못했습니다');
}

/* 실제로 돌린다 — 「DownloadURL 이라는 낱말이 있나」로는 무엇이 실리는지 못 잡는다. */
function run(items, ids) {
  const calls = [];
  const ctx = {
    gridItems: items,
    toast: function (m) { calls.push(['toast', m]); },
    photoTime: function (it) { return (it && it.meta && it.meta.upAt) || 0; },
    dayKey: function (t) { return new Date(t).toISOString().slice(0, 10); },
    console: { warn: function () {} },
    Date, String, Object, Array, Boolean, Number
  };
  vm.createContext(ctx);
  vm.runInContext(fnOf('dragFileName') + '\n' + fnOf('dragOutUrl') + '\n' +
    fnOf('attachFileDragOut'), ctx);
  const dt = { data: {}, setData: function (k, v) { this.data[k] = v; calls.push(['set', k, v]); } };
  ctx.attachFileDragOut(dt, ids);
  return { dt: dt, calls: calls };
}

const U1 = 'https://firebasestorage.googleapis.com/v0/b/x/o/a.jpg?alt=media&token=t1';
const U2 = 'https://firebasestorage.googleapis.com/v0/b/x/o/b.jpg?alt=media&token=t2';
function photo(id, url, company, upAt) {
  return { id: id, meta: { upAt: upAt || Date.parse('2026-08-21T00:00:00Z'), fullUrl: url,
    read: { fields: { company: company } } } };
}

/* ══════ ① 원본 파일이 나간다 ══════ */

test('★ 한 장을 끌면 원본 파일이 실린다 — 이것이 없으면 밖으로 아무것도 안 나간다', () => {
  const { dt } = run([photo('p1', U1, '주식회사 율산')], ['p1']);
  assert.ok(dt.data['DownloadURL'], '★ DownloadURL 이 없으면 탐색기·한글이 알아듣지 못합니다');
  assert.match(dt.data['DownloadURL'], /^image\/jpeg:/, '종류를 안 적으면 이름 없는 파일이 됩니다');
  assert.ok(dt.data['DownloadURL'].indexOf(U1) > 0, '★ 원본 주소가 안 실렸습니다');
});

test('★ 파일 이름이 날짜 + 업체다 — 받은 쪽에서 무엇인지 알아야 한다', () => {
  const { dt } = run([photo('p1', U1, '주식회사 율산')], ['p1']);
  assert.match(dt.data['DownloadURL'], /:2026-08-21 주식회사 율산\.jpg:/);
});

test('★ 이름에 못 쓰는 글자를 걷어낸다 — 남기면 저장이 통째로 실패한다', () => {
  const { dt } = run([photo('p1', U1, 'A/B:C*D?E"F<G>H|I')], ['p1']);
  const name = dt.data['DownloadURL'].split(':image')[0];
  assert.ok(!/[\\/:*?"<>|]/.test(dt.data['DownloadURL'].split(':')[1]),
    '★ 못 쓰는 글자가 남아 있습니다: ' + dt.data['DownloadURL']);
  assert.ok(name !== undefined);
});

test('업체를 못 읽은 사진도 이름이 생긴다 — 빈 이름이면 저장이 막힌다', () => {
  const { dt } = run([photo('p1', U1, '')], ['p1']);
  assert.match(dt.data['DownloadURL'], /:2026-08-21 사진\.jpg:/);
});

/* ══════ ② 여러 장 — 파일은 하나, 나머지는 주소 목록 ══════ */

test('★ 여러 장을 골랐으면 «집은 그 사진»이 파일로 간다', () => {
  /* ids 의 첫째가 집은 사진이다(격자 쪽에서 그렇게 넣는다). */
  const { dt } = run([photo('p1', U1, '가'), photo('p2', U2, '나')], ['p2', 'p1']);
  assert.ok(dt.data['DownloadURL'].indexOf(U2) > 0,
    '★ 목록 첫 장이 가면 엉뚱한 것을 받은 것처럼 보입니다');
});

test('★ 나머지는 주소 목록으로 함께 실린다', () => {
  const { dt } = run([photo('p1', U1, '가'), photo('p2', U2, '나')], ['p1', 'p2']);
  assert.equal(dt.data['text/uri-list'], U1 + '\r\n' + U2,
    '★ 규약이 CRLF 로 잇습니다');
});

test('★ text/plain 은 건드리지 않는다 — PuDrag 것이다', () => {
  const { dt } = run([photo('p1', U1, '가')], ['p1']);
  assert.equal(dt.data['text/plain'], undefined,
    '★ 덮으면 전용 종류를 지우는 브라우저에서 컨설팅·기금이 사진을 못 받습니다');
  /* 그리고 PuDrag 가 정말 그 칸을 쓰는지 확인한다 — 남의 파일을 믿지 말고 본다. */
  const drag = fs.readFileSync(path.join(R, 'js', 'pu-drag.js'), 'utf8');
  assert.match(drag, /dt\.setData\('text\/plain', raw\)/,
    'PuDrag 가 text/plain 을 안 쓰면 이 검사의 까닭이 사라집니다 — 다시 살펴보세요');
});

/* ══════ ③ 못 나가는 것은 말해 준다 ══════ */

test('★ 원본 주소가 없으면 파일을 안 싣고 «말해 준다»', () => {
  const { dt, calls } = run([photo('p1', '', '가')], ['p1']);
  assert.equal(dt.data['DownloadURL'], undefined, '주소가 없는데 실었습니다');
  assert.ok(calls.some(function (c) { return c[0] === 'toast' && /크게 보기에서/.test(c[1]); }),
    '★ 조용히 아무 일도 안 일어나면 「왜 안 되지」로 시간을 버립니다');
});

test('주소가 https 문자열이 아니면 안 쓴다 — 옛 기록·손상된 값', () => {
  for (const bad of [null, 0, {}, 'data:image/jpeg;base64,AAA', 'http://x/a.jpg']) {
    const { dt } = run([photo('p1', bad, '가')], ['p1']);
    assert.equal(dt.data['DownloadURL'], undefined, '★ ' + JSON.stringify(bad) + ' 를 실었습니다');
  }
});

test('★ 여러 장 중 일부만 주소가 있으면 있는 것으로 나간다', () => {
  const { dt, calls } = run([photo('p1', '', '가'), photo('p2', U2, '나')], ['p1', 'p2']);
  assert.ok(dt.data['DownloadURL'].indexOf(U2) > 0,
    '★ 첫 장에 주소가 없다고 통째로 포기하면 나머지가 억울합니다');
  assert.equal(dt.data['text/uri-list'], U2);
  assert.ok(!calls.some(function (c) { return c[0] === 'toast'; }), '나갈 것이 있는데 경고했습니다');
});

test('목록에 없는 번호는 조용히 건너뛴다 — 그것 때문에 끌기가 죽으면 안 된다', () => {
  const { dt } = run([photo('p1', U1, '가')], ['없는번호', 'p1']);
  assert.ok(dt.data['DownloadURL'].indexOf(U1) > 0);
});

/* ══════ ④ 배선·안전장치 ══════ */

test('★ 격자 끌기가 이 함수를 부른다 — 만들고 안 부르면 아무것도 안 바뀐다', () => {
  const i = app.indexOf("$('grid').addEventListener('dragstart'");
  assert.ok(i > 0, '격자 끌기 자리를 찾지 못했습니다');
  const seg = app.slice(i, i + 2000);
  assert.match(seg, /attachFileDragOut\(ev\.dataTransfer, order\)/,
    '★ 밖으로 내보내는 길을 안 부릅니다');
  /* PuDrag 뒤라야 한다 — PuDrag 가 effectAllowed 를 맞추고 우리는 그 위에 얹는다. */
  assert.ok(seg.indexOf('PuDrag.set') < seg.indexOf('attachFileDragOut'),
    '★ PuDrag 앞에서 부르면 앱 사이 끌기 설정이 뒤에 덮입니다');
});

test('★ 창 안에 도로 놓아도 다시 안 올라간다 — 자가복제 사고(8/4·8/5) 잠금', () => {
  /* 잠금은 «출처»를 본다: 이 화면에서 시작한 드래그면 파일로 안 받는다.
     그래서 DownloadURL 을 실어도 재복사가 안 생긴다. 그 잠금이 살아 있는지 본다. */
  assert.match(app, /document\.addEventListener\('dragstart', function \(\) \{ selfDrag = true;/,
    '★ 출처 잠금이 사라졌습니다 — 끌어낸 사진을 도로 놓으면 또 올라갑니다');
  assert.match(app, /function selfDragLive\(\)/, '스스로 풀리는 길이 사라졌습니다');
});

test('앱 사이 끌기(분류 탭·폴더·컨설팅)는 그대로다', () => {
  const i = app.indexOf("$('grid').addEventListener('dragstart'");
  const seg = app.slice(i, i + 2000);
  assert.match(seg, /photoDragIds = \(selected\.size && selected\.has\(id\)\)/,
    '분류 탭·폴더로 끄는 길이 사라졌습니다');
  assert.match(seg, /PuDrag\.setMany\(ev\.dataTransfer, refs\)/, '여러 장 규약이 사라졌습니다');
});

test('크게 보기 한 장 끌기도 그대로 남아 있다 — 8/10 에 만든 길', () => {
  assert.match(fnOf('viewerDragOut'), /setData\('DownloadURL'/);
});
