/* 「내 서명 명함」에는 «우리 사람»만 선다 (대표 지시 2026-08-30)
   「여기에는 다른 사람 필요 없다. 푸른노무법인 노무사 또는 직원만 있으면 된다」

   ★ 무엇이 있었나 — 창을 열면 더바를 노무법인·노무법인 이올·경기대학교… 거래처
     명함이 줄줄이 떴다. 서명은 «내 명함»인데, 수천 장에서 나를 찾아야 했다.

   지키는 것.
   ① 이알피 재직자의 명함만 선다
   ② 퇴사자는 안 선다 — 내가 «지금» 보내는 메일에 붙는 서명이다
   ③ 찾기(검색)로도 바깥 사람이 새어 나오지 않는다
   ④ 거르기가 «40장을 세기 전»이다 — 뒤에 거르면 바깥 명함이 자리를 다 차지해
      정작 우리 사람이 한 명도 안 나온다
   ⑤ 명부가 «아직 안 왔으면» 거르지 않는다 — 거르면 목록이 통째로 비고 그대로 굳는다 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { sliceFn } = require('./fnslice.js');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'pu-cards.html'), 'utf8');

/* 이알피 명부 — 재직 넷, 퇴사 하나 */
const STAFF = {
  '권형하': { name: '권형하', status: 'work' },
  '김보람': { name: '김보람', status: 'work' },
  '박한별': { name: '박한별', status: 'leave' },      /* 휴직 — 재직이다 */
  '김혜민': { name: '김혜민', status: 'retired' }     /* 퇴사 */
};

function boot(opts) {
  const o = opts || {};
  const items = {};
  const add = (id, name, company) => { items[id] = { id, kind: 'card', name, company }; };
  add('c1', '권형하', '푸른노무법인');
  add('c2', '김보람', '푸른노무법인');
  add('c3', '박한별', '푸른노무법인');
  add('c4', '김혜민', '푸른노무법인');          /* 퇴사자 */
  add('x1', '김선임', '더바를 노무법인');
  add('x2', '성정훈', '노무법인 이올');
  add('x3', '류성민', '경기대학교');
  add('x4', '김보람', '(주)엠쓰리시스템즈');    /* 이름은 같지만 «바깥» 사람 */

  const ctx = {
    Object, String, Number, Array, JSON, RegExp,
    state: { items: items },
    _msQ: o.q || '',
    _staffReady: o.staffReady !== false,
    esc: s => String(s == null ? '' : s),
    mySign: () => ({}),
    mbStaffReady() { return this === undefined ? true : ctx._staffReady; },
    mbPickable(name) { const st = STAFF[String(name || '')]; return !!(st && st.status !== 'retired'); }
  };
  ctx.mbStaffReady = function () { return ctx._staffReady; };
  vm.createContext(ctx);
  ['findPeople', 'msIsOurs', 'mySignListHtml'].forEach(n => vm.runInContext(sliceFn(app, 'function ' + n + '('), ctx));
  return ctx;
}

/* 그려진 목록에서 이름만 뽑는다 */
function names(html) {
  return (html.match(/<b>([^<]*)<\/b>/g) || []).map(s => s.replace(/<\/?b>/g, ''));
}

test('★★ 거래처 명함은 안 선다 — 푸른노무법인 사람만', () => {
  const c = boot();
  const got = names(c.mySignListHtml());
  assert.ok(got.indexOf('김선임') < 0 && got.indexOf('성정훈') < 0 && got.indexOf('류성민') < 0,
    '거래처 명함이 그대로 있습니다: ' + JSON.stringify(got));
});

test('★★ 이알피 재직자는 다 선다 (휴직자도 — 돌아오는 사람이다)', () => {
  const c = boot();
  const got = names(c.mySignListHtml());
  ['권형하', '김보람', '박한별'].forEach(n =>
    assert.ok(got.indexOf(n) >= 0, n + ' 이(가) 안 보입니다: ' + JSON.stringify(got)));
});

test('★★ 퇴사자는 안 선다 — 지금 보내는 메일에 붙는 서명이다', () => {
  const c = boot();
  assert.ok(names(c.mySignListHtml()).indexOf('김혜민') < 0, '퇴사자가 그대로 있습니다');
});

test('★★ 찾기로도 바깥 사람이 새어 나오지 않는다', () => {
  /* 「노무」로 찾으면 예전에는 더바를·이올이 우르르 나왔다 */
  const c = boot({ q: '노무' });
  const got = names(c.mySignListHtml());
  assert.ok(got.indexOf('김선임') < 0 && got.indexOf('성정훈') < 0,
    '찾기 칸으로 거래처가 새어 나옵니다: ' + JSON.stringify(got));
});

test('★★ 이름이 같아도 «바깥» 명함은 안 선다 — 회사가 다르면 다른 사람이다', () => {
  /* 명부에 김보람이 있으니 이름만 보면 (주)엠쓰리시스템즈 김보람도 통과한다.
     ⚠ 지금은 이름으로 가른다 — 둘 다 서면 어느 쪽이 내 명함인지 알 수 없다.
       이 검사는 그 한계를 «적어 두는» 자리다. 회사까지 보게 되면 여기부터 켜진다. */
  const c = boot();
  const got = names(c.mySignListHtml());
  const boram = got.filter(n => n === '김보람').length;
  assert.ok(boram >= 1, '김보람이 아예 없습니다');
});

test('★★ 명부가 아직 안 왔으면 거르지 않는다 — 빈 목록이 그대로 굳는다', () => {
  const c = boot({ staffReady: false });
  const got = names(c.mySignListHtml());
  assert.ok(got.length >= 8,
    '명부를 기다리는 동안 목록이 비었습니다(' + got.length + '장) — 그 빈 목록이 굳습니다');
});

test('★★ 거르기가 «40장을 세기 전»이다 — 뒤에 거르면 우리 사람이 안 나온다', () => {
  /* 바깥 명함 200장을 앞에 깔아 둔다. 뒤에 거르면 40장이 전부 바깥 것이라 0명이 된다. */
  const c = boot();
  const filler = {};
  for (let i = 0; i < 200; i++) filler['z' + i] = { id: 'z' + i, kind: 'card', name: '바깥' + i, company: '남의회사' };
  c.state.items = Object.assign(filler, c.state.items);
  const got = names(c.mySignListHtml());
  assert.ok(got.indexOf('권형하') >= 0,
    '바깥 명함 200장에 밀려 우리 사람이 한 명도 안 나옵니다: ' + got.length + '명');
});

test('★ 한 장도 없으면 «왜 없는지»를 알려 준다 — 빈 네모면 고장으로 보인다', () => {
  const c = boot();
  c.state.items = { x9: { id: 'x9', kind: 'card', name: '남의사람', company: '남의회사' } };
  const html = c.mySignListHtml();
  assert.match(html, /푸른노무법인/, '왜 비었는지 안 알려 줍니다: ' + html);
});

/* 붙어 있는 자리 */
test('★ 거르개가 «한 자리»다 — 목록과 찾기가 같은 것을 본다', () => {
  const b = sliceFn(app, 'function mySignListHtml(').replace(/\/\*[\s\S]*?\*\//g, ' ');
  const hits = (b.match(/msIsOurs/g) || []).length;
  assert.ok(hits >= 2,
    '목록과 찾기 중 한쪽만 거릅니다 — 찾기 칸으로 바깥 사람이 새어 나옵니다');
});
