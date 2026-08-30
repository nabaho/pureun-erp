'use strict';
// 캘린더 거르개 정리 — node --test tests/work-cal-layers.test.js
//
// 왜: 아홉 개를 한 줄에 죽 늘어놓으니 어느 것이 «우리 것»이고 어느 것이
//     «푸른이알피에서 가져온 것»인지 알 수 없어 혼란스러웠다.
//     게다가 그걸 설명하는 안내문 한 줄이 화면 아래에 깔려 있었다.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'work.html'), 'utf8').replace(/\r\n/g, '\n');
const CSS = src.slice(src.indexOf('<style>') + 7, src.indexOf('</style>'));

function grab(a, b){
  const i = src.indexOf(a);
  assert.ok(i >= 0, '못 찾음: ' + a);
  return src.slice(i, src.indexOf(b, i));
}

/* 실제 소스의 자료와 그리는 코드를 그대로 돌린다 — 손으로 옮겨 적으면
   검사만 통과하고 화면은 그대로일 수 있다. */
const box = {};
vm.createContext(box);
vm.runInContext(
  'function esc(x){return String(x==null?"":x).replace(/[&<>"]/g,function(c){'
  + 'return {"&":"&amp;","<":"&lt;",">":"&gt;","\\"":"&quot;"}[c];});}\n'
  + grab('var CAL_LAYERS=[', 'var CAL_SRC=') + '\n'
  + grab('function calLayGroup(g){', '\n}') + '\n}\n'
  + 'var S={calLay:{due:1,next:1,step:1,log:0,sch:1,att:1,loa:0,dl:1,sdue:1}};\n'
  + 'function calDefLay(){var o={};CAL_LAYERS.forEach(function(l){o[l[0]]=!!l[3];});return o;}\n'
  + 'function calSavePrefs(){} function route(){}\n'
  // ⚠ 'h' + 조각 으로 두면 그냥 «식» 이라 결과가 버려진다 — h 에 담아야 한다
  + 'var h=""; h = h' + grab("+'<div class=\"lays\">'", "if(S.calView==='month')") + '\n'
  + 'this.html=h; this.L=CAL_LAYERS; this.G=CAL_GROUPS; this.S=S; this.grp=calLayGroup;', box);

const html = box.html;

/* ── 묶음으로 나뉜다 ── */
test('두 묶음으로 나뉜다 — 내 것과 푸른이알피 것', () => {
  assert.equal(Array.from(box.G).length, 2);
  assert.equal((html.match(/class="lay"/g) || []).length, 2, '묶음마다 한 줄');
});

test('아홉 개가 하나도 빠지지 않고 어느 묶음엔가 들어간다', () => {
  const groups = Array.from(box.G).map(g => g[0]);
  const layers = Array.from(box.L);
  assert.equal(layers.length, 9);
  layers.forEach(l => assert.ok(groups.indexOf(l[5]) >= 0, l[1] + ' 이 묶음에 안 들어갔다'));
  assert.equal((html.match(/class="lchk/g) || []).length, 9, '칩도 아홉 개 다 나온다');
});

test('푸른이알피에서 오는 것이 정확히 그 묶음에 있다', () => {
  const erp = Array.from(box.L).filter(l => l[5] === 'erp').map(l => l[0]).sort();
  // 읽기 전용 원본(CAL_SRC: 일정·근태·휴직) + 푸른이알피가 계산해 내려보내는 것(마감·단계 기한)
  assert.deepEqual(erp, ['att', 'dl', 'loa', 'sch', 'sdue']);
  const mine = Array.from(box.L).filter(l => l[5] === 'mine').map(l => l[0]).sort();
  assert.deepEqual(mine, ['due', 'log', 'next', 'step']);
});

/* ── 화면에서 말이 줄었다 ── */
test('아래에 깔려 있던 안내문 한 줄을 없앴다', () => {
  assert.ok(src.indexOf('laynote') < 0, '설명은 화면에 깔지 않고 ⓘ 로 넣는다');
  assert.ok(src.indexOf('일정·근태·휴직·마감은 푸른이알피 자료 — 읽기 전용') < 0);
});

test('읽기 전용이라는 말은 ⓘ 에 들어 있다', () => {
  assert.match(html, /<span class="gi">ⓘ<\/span>/);
  assert.match(html, /여기서는 보기만 합니다/);
  assert.match(html, /\[🗓 푸른이알피\] 로 가서 하세요/, '그럼 어디서 하나까지 알려 준다');
  // ⓘ 는 푸른이알피 묶음에만 — 내 업무는 설명할 것이 없다
  assert.equal((html.match(/class="gi"/g) || []).length, 1);
});

test('칩 이름에서 겹치는 말을 뺐다 (묶음 이름이 앞에 있다)', () => {
  const short = {}; Array.from(box.L).forEach(l => { short[l[0]] = l[4]; });
  assert.equal(short.due, '기한');      // 「업무 기한」 — 내 업무 줄에 있으니 '업무'는 군더더기
  assert.equal(short.next, '할 일');
  assert.equal(short.step, '단계');
  assert.equal(short.log, '기록');
  assert.equal(short.att, '근태');
  assert.equal(short.dl, '마감');
});

test('긴 이름은 그대로 남는다 (달력 안 일정 글자·설명에 쓴다)', () => {
  assert.match(src, /var CAL_NAME=\{\}; CAL_LAYERS\.forEach\(function\(l\)\{ CAL_NAME\[l\[0\]\]=l\[1\]; \}\);/);
  const names = Array.from(box.L).map(l => l[1]);
  assert.ok(names.indexOf('업무 기한') >= 0 && names.indexOf('사건 마감') >= 0);
  assert.match(html, /title="업무 기한 — 클릭하면 켜고 끕니다"/, '칩에 마우스를 올리면 온전한 이름이 나온다');
});

/* ── 묶음째 켜고 끄기 ── */
test('묶음 이름을 누르면 그 묶음이 통째로 켜지고 꺼진다', () => {
  const S = box.S;
  assert.equal(S.calLay.sch, 1);
  box.grp('erp');                       // 하나라도 켜져 있으면 → 모두 끈다
  ['sch','att','loa','dl','sdue'].forEach(k => assert.equal(S.calLay[k], false, k));
  ['due','next','step'].forEach(k => assert.equal(S.calLay[k], 1, k + ' 은 그대로여야 한다'));
  box.grp('erp');                       // 다 꺼져 있으면 → 모두 켠다
  ['sch','att','loa','dl','sdue'].forEach(k => assert.equal(S.calLay[k], true, k));
});

test('내 업무 묶음도 따로 움직인다', () => {
  const S = box.S;
  box.grp('mine');
  ['due','next','step','log'].forEach(k => assert.equal(S.calLay[k], false, k));
  assert.equal(S.calLay.sch, true, '푸른이알피 것은 안 건드린다');
});

test('★ 설정 저장이 실패하면 조용히 넘기지 않는다', () => {
  // 삼키면, 켜고 끈 것이 다음에 안 남아 있는데 까닭을 알 수가 없다
  assert.match(src, /캘린더 설정을 저장하지 못했습니다/);
  assert.ok(!/r\.set\(\{on:!!S\.calOn[^)]*\}\)\.catch\(function\(\)\{\}\)/.test(src));
});

test('한 칩만 끄고 켜는 길도 그대로 있다', () => {
  assert.match(src, /function calLay\(k\)\{ S\.calLay=S\.calLay\|\|calDefLay\(\); S\.calLay\[k\]=!S\.calLay\[k\];/);
  assert.match(html, /onclick="calLay\('due'\)"/);
});

test('묶음에 켜진 게 하나도 없으면 이름도 흐려진다', () => {
  /* 2026-08-30 값 대신 규칙 — 「켜진 게 없으면 이름이 «흐린 회색»으로 물러난다」 */
  const P = require('./lib-palette.js');
  const on = (CSS.match(/\.laygp\.on\{([^}]*)\}/) || [])[1] || '';
  const c = P.colorOf(on, 'color');
  assert.ok(c && P.isGray(c), '흐린 회색이 아니다: ' + on);
  assert.ok(P.lum(c) > 0.05 && P.lum(c) < 0.5,
    '까맣거나 너무 밝다 — 「흐리다」로 안 읽힌다: ' + c);
  assert.match(html, /class="laygp on" onclick="calLayGroup\('mine'\)"/);
});

/* ── 줄맞춤 ── */
test('묶음 이름 너비를 못 박아 위아래 칩이 세로로 줄맞춤된다', () => {
  assert.match(CSS, /\.laygp\{flex-shrink:0;width:62px/);
  assert.match(CSS, /white-space:nowrap/);
  assert.match(CSS, /\.lays\{padding:0 12px 10px;display:flex;flex-direction:column;gap:5px\}/);
});

test('칩이 넘치면 다음 줄로 내려간다 (좁은 옆칸에서도 안 잘린다)', () => {
  assert.match(CSS, /\.lay\{display:flex;align-items:flex-start;gap:5px;flex-wrap:wrap\}/);
});
