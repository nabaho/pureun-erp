/* 정관 — 전문 보관 · 판 쌓기 · 원본 팝업
 *
 * 대표 지시 2026-09-05:
 *   「기금정보에 정관도 있어야 한다. 정관 원본 스켄된것 있어야 하고 추후에 수정변경할 경우
 *    비교대조와 변경사항 관련 회의록 까지 만들 수 있어야 한다. 우선은 기금정보에 정관을 넣고
 *    ocr로 정리되고 클릭시 팝업 원본 볼 수 있게 해달라.
 *    설립인가증 등기부등본 고유번호증도 팝업으로 원본 볼 수 있게 해달라.」
 *
 * ⚠ 이 저장소는 통째로 github.io 로 공개된다 — 실제 기금명·조문 금지. 여기 자료는 전부 가짜다.
 *
 * 지켜야 하는 것
 *  ① 판을 «덮어쓰지» 않는다 — 나중에 판끼리 대조하려면 옛 판이 남아 있어야 한다
 *  ② 전문을 funds 에 넣지 않는다 — 42개가 «늘» 켜져 있는 자리다
 *  ③ 정관은 «칸을 채우는» 서류가 아니다 — 조문 전체가 내용이다
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'fund.html'), 'utf8');
/* 소스 안의 문자열에는 홑따옴표가 \' 로 적혀 있다 — 검사에서도 그대로 만들어 쓴다 */
const Q = String.fromCharCode(92) + "'";

function grabFn(name) {
  const i = SRC.indexOf('function ' + name + '(');
  assert.ok(i >= 0, 'fund.html 에 함수가 없다: ' + name);
  let d = 0, on = false;
  for (let j = i; j < SRC.length; j++) {
    if (SRC[j] === '{') { d++; on = true; }
    else if (SRC[j] === '}') { d--; if (on && !d) return SRC.slice(i, j + 1); }
  }
  throw new Error('함수 끝을 못 찾음: ' + name);
}
function grabDecl(name) {
  const i = SRC.indexOf('var ' + name + '=');
  assert.ok(i >= 0, 'fund.html 에 상수가 없다: ' + name);
  let d = 0, on = false;
  for (let j = SRC.indexOf('=', i); j < SRC.length; j++) {
    const c = SRC[j];
    if (c === '{' || c === '[') { d++; on = true; }
    else if (c === '}' || c === ']') { d--; if (on && !d) return SRC.slice(i, j + 1) + ';'; }
  }
  throw new Error('상수 끝을 못 찾음: ' + name);
}

/* ══════ 정관은 다른 셋과 «다르게» 다뤄진다 ══════ */
test('정관은 칸을 채우지 않고 전문을 들고 간다', () => {
  const dp = grabDecl('DOC_PARSE');
  assert.match(dp, /charter:\{label:'정관',full:true\}/, '정관 갈래가 없거나 full 표시가 없다');
  /* 다른 셋은 칸을 채우는 함수(fn)가 있어야 한다 */
  ['inka', 'corpreg', 'taxid'].forEach(k =>
    assert.match(dp, new RegExp(k + ":\\{label:'[^']+',fn:"), k + ' 의 판독 함수가 사라졌다'));

  const r = grabFn('readDocInto');
  assert.match(r, /if\(def\.full\)\{ charterRead\(txt,viaOcr,zid\); return; \}/,
    '정관을 다른 서류처럼 칸에 나눠 넣으려 한다');
  /* 갈림은 «칸을 채우기 전»이어야 한다 */
  assert.ok(r.indexOf('def.full') < r.indexOf('def.fn(txt)'), '칸을 채운 뒤에 갈라지면 늦다');
});

test('글자가 너무 적으면 정관이 맞는지 되묻는다', () => {
  const c = grabFn('charterRead');
  assert.match(c, /if\(body\.length<200\)/, '몇 글자든 정관으로 받아들인다');
  assert.match(c, /정관이 맞는지 확인하세요/, '왜 안 받았는지 말해 주지 않는다');
  /* 되물을 때는 확인 창을 띄우지 않는다 — 빈 정관을 저장하게 된다 */
  const i = c.indexOf('body.length<200');
  const j = c.indexOf('openCharterConfirm');
  assert.ok(i > 0 && j > i, '글자가 적어도 저장 창이 뜬다');
});

/* ══════ 여기가 이 기능의 핵심이다 — 덮어쓰지 않는다 ══════ */
test('올릴 때마다 «새 판»으로 쌓는다 — 덮어쓰지 않는다', () => {
  const sv = grabFn('saveCharter');
  assert.match(sv, /ref\(NS\+'\/charters\/'\+fid\)\.push\(\)\.set\(rec\)/,
    'push 가 아니면 덮어쓴다 — 옛 판이 사라져 대조를 못 한다');
  assert.ok(!/\.update\(|\/latest|\/current/.test(sv), '한 자리를 고쳐 쓰고 있다');
  assert.match(sv, /at:ymd\(\),by:\(S\.user\|\|''\)/, '언제 누가 올렸는지 안 남는다');
  assert.match(sv, /chars:r\.chars/, '몇 자인지 안 남는다');
  assert.match(sv, /_audit\(fid,'정관 저장'/, '변경 기록에 안 남는다');
});

test('다른 기금에서 읽은 정관을 이 기금에 저장하지 않는다', () => {
  const sv = grabFn('saveCharter');
  assert.match(sv, /if\(S\.fundId!==fid\)/, '기금을 옮긴 사이 남의 정관이 들어간다');
  const i = sv.indexOf('S.fundId!==fid'), j = sv.indexOf('fbDb.ref');
  assert.ok(i > 0 && i < j, '서버에 쓰고 나서 확인하면 늦다');
  assert.match(grabFn('charterRead'), /_chRead=\{fid:S\.fundId/, '어느 기금에서 읽었는지 안 붙잡는다');
});

/* ══════ 42개가 늘 켜져 있는 자리를 지킨다 ══════ */
test('전문을 funds 에 넣지 않는다 — 첫 화면이 무거워진다', () => {
  const code = SRC.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(!/funds\/'\+fid\+'\/charter_text|funds\/'\+fid\+'\/charter\b/.test(code),
    '정관 전문을 기금 목록에 얹었다 — 42개가 늘 켜져 있는 자리다');
  /* 목록은 본문 없이, 본문은 볼 때 한 벌만 */
  const load = grabFn('charterLoad');
  assert.ok(!/text/.test(load.replace(/\/\*[\s\S]*?\*\//g, '')), '목록을 읽을 때 본문까지 끌고 온다');
  assert.match(grabFn('openCharterText'), /charters\/'\+fid\+'\/'\+meta\.id\+'\/text'\)\.once/,
    '전문을 볼 때 그 한 벌만 읽어야 한다');
});

test('판 목록은 최신이 위로', () => {
  const load = grabFn('charterLoad');
  assert.match(load, /String\(b\.at\)\.localeCompare\(String\(a\.at\)\)/, '오래된 것이 위에 온다');
  assert.match(load, /if\(S\.chFor!==_k\) return/, '기금을 옮겼는데 늦게 온 답을 쓴다');
});

/* ══════ 원본 팝업 — 넷 모두 ══════ */
test('연결된 원본을 «눈에 띄게» 볼 수 있다 — 넷 모두', () => {
  const z = grabFn('docZoneOne');
  assert.ok(z.includes("openScan(" + Q + "'+kind+'" + Q + ")"),
    '설립인가증·등기부·고유번호증의 원본 보기가 없다');
  assert.match(z, /📎 원본/, '📎 한 글자로는 눌러 볼 수 있는지 안 보인다');
  const c = grabFn('charterZone');
  assert.ok(c.includes("openScan(" + Q + "charter" + Q + ")"), '정관 원본 보기가 없다');
  assert.match(c, /📎 원본/, '');
  /* 원본 보기 창이 정관 이름을 알아야 한다 */
  assert.match(grabFn('docZoneLabel'), /charter:'정관'/, '창 제목이 charter 로 뜬다');
});

test('정관 칸에는 전문 보기가 하나 더 있다', () => {
  const c = grabFn('charterZone');
  assert.match(c, /openCharterText\(/, '읽어 둔 전문을 볼 길이 없다');
  assert.match(c, /📄 전문/, '');
  assert.ok(c.includes('list.length+') && c.includes('판'), '몇 판인지 안 보인다');
  /* 아직 아무것도 없으면 전문 단추를 만들지 않는다 — 눌러도 나올 것이 없다 */
  assert.ok(c.includes('(top?') && c.indexOf('openCharterText') > c.indexOf('(top?'),
    '없는 전문을 보라고 내민다');
});

test('정관도 끌어놓기·사진첩·자동 찾기가 다 걸려 있다', () => {
  assert.match(grabFn('bindDocIntake'), /\['dz-charter','charter'\]/, '끌어놓기가 안 걸렸다');
  assert.ok(grabFn('charterZone').includes('openAlbumPick(' + Q + 'dz-charter' + Q + ',' + Q + 'charter' + Q + ')'),
    '사진첩에서 고를 수 없다');
  const box = {};
  new Function([grabDecl('DOC_FIND'), 'this.D=DOC_FIND;'].join('\n')).call(box);
  assert.ok(box.D.charter, '사진첩 자동 찾기에서 정관이 빠졌다');
  assert.deepEqual(box.D.charter.kw, ['정관'], '');
  assert.ok(SRC.includes('+charterZone()'), '화면에 정관 칸이 안 붙었다');
  assert.ok(SRC.includes("'doc.charter':{t:"), 'ⓘ 설명이 등록되지 않았다');
});

/* ══════ 뒤에 올 것 — 판끼리 대조 ══════ */
test('판끼리 대조할 재료가 갖춰져 있다', () => {
  /* 지금은 대조 화면이 없지만, 그것을 만들 «자료»는 이미 쌓여야 한다.
     판마다 at·by·chars·text 가 남으면 나중에 무엇이 언제 바뀌었는지 뽑을 수 있다. */
  const sv = grabFn('saveCharter');
  ['at:', 'by:', 'chars:', 'text:'].forEach(k =>
    assert.ok(sv.includes(k), '나중에 대조하려면 이것이 있어야 한다: ' + k));
  assert.ok(grabFn('openCharterText').includes('<select onchange="openCharterText'),
    '판이 여럿일 때 골라 볼 수 없으면 대조의 첫 걸음도 못 뗀다');
});
