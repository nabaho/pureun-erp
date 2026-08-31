'use strict';
/* 갓 이관된 사업장은 «항상» 맨 위에, 하루 동안 다른 색 (대표 지시 2026-08-31)

   「신규사업장이 이관된 경우 업체관리에서도 항상 가장 위에 약간 다른 색으로
     표시되게 해달라 — 하루 동안」

   ⚠ 「항상」이 알맹이다. 예전에도 이관 건을 위로 올리기는 했는데(arvSort),
     그건 «기본 정렬»일 때뿐이었다. 머리글을 한 번 눌러 정렬하면 방금 이관된
     사업장이 가운데로 사라졌다 — 그걸 찾으러 표를 훑게 된다.

   ⚠ 딱지(arvBadge)와 기본 정렬은 이틀(ARV_HOURS)이고, 여기서 새로 두는 것은
     하루(ARV_FRESH_HOURS)다. 갈라 둔 까닭: 머리글 정렬을 «거스르고» 위로
     끌어올리는 것은 사람의 뜻을 무시하는 일이라, 이틀 내내 그러면 정렬이
     고장 난 것처럼 보인다. 하루면 충분하다.

   이 검사가 못 박는 것 —
     ① 하루짜리 잣대가 따로 있고, 이틀짜리(arvIsNew)를 안 건드린다
     ② 끌어올리기가 «맨 마지막»에 온다 — 머리글 정렬·내 담당보다 뒤
     ③ 줄에 색이 깔리되, 폐업·중단을 «덮지 않는다»
     ④ 색만으로 가르지 않는다 (왼쪽 띠도 함께)

   실행: node --test tests/*.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { cutFn } = require('./cut-fn.js');

const R = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(R, 'pu-erp.html'), 'utf8').replace(/\r\n/g, '\n');
const bare = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

const ctx = { window: {}, Date };
vm.createContext(ctx);
/* ⚠ ARV_HOURS 를 여기 손으로 적으면 안 된다 — 소스에서 그 값을 줄여도 검사가
     모른다(2026-08-31 일부러 깨 보고 알았다). «진짜 값»을 읽어 온다. */
const ARV_LINE = src.match(/var ARV_HOURS = \d+;/);
assert.ok(ARV_LINE, 'ARV_HOURS 를 소스에서 못 찾았습니다');
vm.runInContext(
  ARV_LINE[0] + '\n'
  + cutFn(src, 'function arvIsNew(') + '\n'
  + src.slice(src.indexOf('var ARV_FRESH_HOURS'), src.indexOf('function arvIsFresh(')) + '\n'
  + cutFn(src, 'function arvIsFresh(') + '\n'
  + 'this.isNew = arvIsNew; this.isFresh = arvIsFresh; this.FRESH = ARV_FRESH_HOURS;', ctx);
const { isNew, isFresh, FRESH } = ctx;

const ago = (h) => ({ arrivedAt: new Date(Date.now() - h * 3600e3).toISOString() });

/* ══════ ① 하루짜리 잣대 ══════ */

test('★★ 하루짜리 잣대가 따로 있다 — 이틀짜리는 안 건드렸다', () => {
  assert.equal(FRESH, 24, '★ 대표가 말씀하신 것은 «하루»입니다');
  assert.equal(isFresh(ago(1)), true, '★ 한 시간 전 것이 갓 온 것이 아니면 뜻이 없습니다');
  assert.equal(isFresh(ago(23)), true);
  assert.equal(isFresh(ago(25)), false, '★★ 하루가 지났는데도 정렬을 거스르면 안 됩니다');
  /* 딱지·기본 정렬은 그대로 이틀 — 이것까지 하루로 줄이면 있던 기능이 짧아진다 */
  assert.equal(isNew(ago(25)), true,
    '★★ 딱지 수명(이틀)을 함께 줄였습니다 — 그건 대표가 말씀하신 것이 아닙니다');
  assert.equal(isNew(ago(49)), false);
});

test('★ 이관 자국이 없으면 둘 다 아니다', () => {
  assert.equal(isFresh({}), false);
  assert.equal(isFresh(null), false);
  assert.equal(isFresh({ arrivedAt: '말도 안 되는 값' }), false,
    '★ 못 읽는 날짜를 「갓 온 것」으로 치면, 엉뚱한 줄이 영영 맨 위에 붙습니다');
});

/* ══════ ② 끌어올리기가 맨 마지막 ══════ */

test('★★ 끌어올리기가 «맨 마지막»에 온다 — 앞에 두면 뒤엣것이 흩어 놓는다', () => {
  const at = src.indexOf('var _freshOn = filtered.some(arvIsFresh);');
  assert.ok(at > 0, '★★ 「항상 맨 위」로 끌어올리는 자리가 없습니다');
  const before = src.slice(0, at);
  /* 머리글 정렬과 「내 담당 최상단」이 «먼저» 끝나 있어야 한다 */
  assert.ok(before.lastIndexOf('if(sortBy.key){') > 0
    && before.lastIndexOf('if(sortBy.key){') < at,
  '★★ 머리글 정렬이 뒤에 오면, 눌러 정렬하는 순간 이관 건이 가운데로 사라집니다');
  assert.ok(before.lastIndexOf('if(_mineOn){') > 0 && before.lastIndexOf('if(_mineOn){') < at,
    '★★ 「내 담당 최상단」이 뒤에 오면 그쪽이 이관 건을 밀어냅니다');
  /* 그리고 «마지막으로 줄을 흔드는 것»이 이 끌어올리기여야 한다.
     뒤에 정렬이 하나라도 더 있으면 도로 흩어진다. */
  const upto = src.slice(0, src.indexOf('function toggleSort(', at));
  const lastSort = upto.lastIndexOf('.sort(');
  assert.ok(lastSort > at && lastSort < at + 300,
    '★★ 끌어올린 «뒤»에 또 정렬하는 곳이 있습니다 — 그러면 도로 흩어집니다');
});

/* ══════ ③④ 색 ══════ */

test('★★ 색이 폐업·중단을 «덮지 않는다» — 그 둘이 더 큰 사실이다', () => {
  const at = src.indexOf('if(arvIsFresh(co) && !co.closedBiz && !co.suspended){');
  assert.ok(at > 0,
    '★★ 폐업·중단까지 파랗게 칠하면, 문 닫은 사업장이 멀쩡해 보입니다');
  /* 앞에서 폐업·중단 색을 먼저 정하고, 그 «뒤»에만 덮어쓴다 */
  const head = bare(src.slice(at - 900, at));
  assert.match(head, /co\.closedBiz/, '★ 폐업 색이 먼저 정해져 있어야 합니다');
});

test('★★ 색만으로 가르지 않는다 — 왼쪽 띠도 함께', () => {
  const at = src.indexOf('if(arvIsFresh(co) && !co.closedBiz && !co.suspended){');
  const body = bare(src.slice(at, at + 400));
  assert.match(body, /background:'#eff6ff'/, '★ 옅은 색이 없으면 「다른 색」이 아닙니다');
  assert.match(body, /borderLeft:'4px solid #60a5fa'/,
    '★★ 색만으로 가르면, 색을 잘 못 가리는 사람에게는 아무 표시도 없는 것과 같습니다');
  /* 폐업·중단이 쓰는 띠 두께와 같아야 줄이 들쭉날쭉해 보이지 않는다 */
  assert.match(body, /4px solid/, '★ 띠 두께가 다르면 표가 어긋나 보입니다');
});
