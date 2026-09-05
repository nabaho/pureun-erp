/* 메일 문으로 들어왔을 때 «첫 그림» (대표 지시 2026-09-05)
   「메일함 열릴 때 아주 짧게 이 화면(메일쓰기)이 나왔다가 받은메일함으로 나온다」

   ★ 까닭 — 2026-08-24 에 state.view 를 'mail' 로 앞당겨 «명함 목록»이 스치는 것은
     없앴는데, state.mailSent 는 false 그대로였다. renderMailPage 에서 false 는
     «메일쓰기»다. 그래서 restoreLastScreen() → openMailBox('') 가 돌기 전까지
     빈 편지지가 한 번 그려졌다 — 화면을 한 걸음 앞당기면 두 값을 «같이» 정해야 한다.

   지키는 것.
   ① 메일 문으로 들어오면 첫 그림이 «받은메일함»이다 — 쓰기가 아니다
   ② 주소에 to= 가 실려 오면 «쓰기»다 (이메일을 눌러 들어온 길)
   ③ 메일 문이 아니면 아무것도 안 정한다
   ④ 첫 그림과 restoreLastScreen 이 «같은 판정»을 쓴다 — 어긋나면 반대쪽이 스친다
   ⑤ 값은 renderMailPage 가 아는 말이어야 한다('box')
   ⑥ 첫 그림을 정하는 것이 «읽어 오는 일»을 대신하지 않는다 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { sliceFn } = require('./fnslice.js');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'pu-cards.html'), 'utf8');
const bare = app.replace(/\/\*[\s\S]*?\*\//g, ' ');

/* 진짜 함수를 그대로 태운다 — 주소만 갈아 끼운다 */
function firstScreen(search){
  /* ⚠ URLSearchParams 는 «밖에서» 넣어 준다 — vm 안에서 이름만 적으면 그 칸에 없다 */
  const ctx = { console, URLSearchParams, location: { search: search } };
  vm.createContext(ctx);
  vm.runInContext(sliceFn(app, 'function urlWantsMail('), ctx);
  vm.runInContext(sliceFn(app, 'function mailToFromUrl('), ctx);
  vm.runInContext(sliceFn(app, 'function mailFirstScreen('), ctx);
  return ctx.mailFirstScreen();
}

/* ══════ ①②③ 어떤 문으로 들어왔나 ══════ */

test('★★ 메일 문으로 들어오면 첫 그림이 «받은메일함»이다 — 빈 편지지가 스치면 안 된다', () => {
  assert.equal(firstScreen('?view=mail'), 'box',
    '메일함을 열었는데 «메일쓰기»가 먼저 그려집니다');
  assert.equal(firstScreen('?view=mail&sso=1&v=a8d1d487'), 'box',
    '뒤에 다른 값이 붙으면 못 알아봅니다 — 포털이 붙여 보내는 주소가 이 꼴입니다');
});

test('★★ 주소에 to= 가 실려 오면 «쓰기»다 — 이메일을 눌러 들어온 길이다', () => {
  assert.equal(firstScreen('?view=mail&to=a%40b.kr'), false,
    '그 사람에게 쓰려고 들어왔는데 메일함이 열립니다');
});

test('★★ 메일 문이 아니면 첫 그림을 정하지 않는다', () => {
  assert.equal(firstScreen(''), false, '기업정보함으로 들어왔는데 메일함을 정합니다');
  assert.equal(firstScreen('?view=list'), false);
});

/* ══════ ④⑤ 다른 자리와 어긋나지 않나 ══════ */

test('★★ 첫 그림과 restoreLastScreen 이 «같은 판정»을 쓴다 — 어긋나면 반대쪽이 스친다', () => {
  const f = sliceFn(app, 'function mailFirstScreen(').replace(/\/\*[\s\S]*?\*\//g, ' ');
  assert.match(f, /urlWantsMail\(\)/, '첫 그림이 메일 문 판정을 제 나름대로 합니다');
  assert.match(f, /mailToFromUrl\(\)/, '첫 그림이 to= 판정을 제 나름대로 합니다');
  const r = sliceFn(app, 'function restoreLastScreen(').replace(/\/\*[\s\S]*?\*\//g, ' ');
  assert.match(r, /urlWantsMail\(\)/, '되살리는 쪽이 다른 잣대를 씁니다');
  assert.match(r, /mailToFromUrl\(\)/, '되살리는 쪽이 to= 를 다른 잣대로 봅니다');
});

test('★★ state.view 와 첫 그림이 «같은 문»을 본다 — 화면은 메일인데 그림만 다르면 안 된다', () => {
  /* ⚠ 2026-09-05 에 그랬다 — view 는 'mail' 로 앞당겨 놓고 mailSent 는 false 그대로여서,
       화면은 메일인데 «빈 편지지»가 한 번 그려졌다.
     ⚠ state.view 는 <head> 와 글귀를 맞추려고 정규식을 그대로 적는다(그쪽은 다른 script
       라 함수를 못 부른다). 그 셋이 같은 글귀인지는 mail-open-noflash 가 지킨다.
       여기서는 «같은 문을 보는지»를 값으로 확인한다. */
  const m = bare.match(/view:\s*\(function\(\)\{[\s\S]{0,220}?\}\)\(\),/);
  assert.ok(m, 'state.view 를 정하는 자리를 못 찾았습니다');
  const viewOf = (search)=>{
    const ctx = { location: { search: search } };
    vm.createContext(ctx);
    return vm.runInContext('(' + m[0].replace(/^view:\s*/, '').replace(/,\s*$/, '') + ')', ctx);
  };
  assert.equal(viewOf('?view=mail'), 'mail');
  assert.equal(firstScreen('?view=mail'), 'box',
    "화면은 메일인데 첫 그림이 «메일쓰기»입니다 — 빈 편지지가 스칩니다");
  assert.equal(viewOf('?sso=1'), 'list');
  assert.equal(firstScreen('?sso=1'), false,
    '기업정보함으로 들어왔는데 첫 그림만 메일함입니다');
});

test('★★ 첫 그림 값은 renderMailPage 가 «아는 말»이어야 한다', () => {
  const r = sliceFn(app, 'function renderMailPage(').replace(/\/\*[\s\S]*?\*\//g, ' ');
  assert.match(r, /state\.mailSent\s*===\s*'box'/,
    "renderMailPage 가 'box' 를 모릅니다 — 첫 그림이 엉뚱한 화면이 됩니다");
  assert.equal(firstScreen('?view=mail'), 'box');
});

/* ══════ ⑥ 넘지 말아야 할 선 ══════ */

test('★★ 첫 그림을 정하는 것이 «읽어 오는 일»을 대신하지 않는다', () => {
  const f = sliceFn(app, 'function mailFirstScreen(').replace(/\/\*[\s\S]*?\*\//g, ' ');
  assert.ok(!/loadMail|firebase|openMailBox|render\(/.test(f),
    '첫 그림을 정하면서 자료까지 읽습니다 — 로그인 전에 돌아 두 벌이 됩니다');
});

test('★★ 주소를 못 읽어도 «죽지 않는다» — 앱 전체가 안 뜨는 자리다', () => {
  /* location 이 아예 없는 자리 */
  const ctx = { console, URLSearchParams };
  vm.createContext(ctx);
  vm.runInContext(sliceFn(app, 'function urlWantsMail('), ctx);
  vm.runInContext(sliceFn(app, 'function mailToFromUrl('), ctx);
  vm.runInContext(sliceFn(app, 'function mailFirstScreen('), ctx);
  assert.equal(ctx.mailFirstScreen(), false, '주소를 못 읽으면 앱이 통째로 안 뜹니다');
});

test('★★ 첫 그림을 정하는 함수가 state 보다 «먼저» 있어야 한다(같은 script 안)', () => {
  /* ⚠ 함수 선언은 끌어올려지지만, 그것은 «같은 script 덩이» 안에서만이다.
       state 가 부르는데 다른 덩이에 있으면 앱이 그 줄에서 통째로 멈춘다. */
  const blocks = app.split(/<\/script>/);
  const owner = blocks.filter(b => /\bmailSent:\s*mailFirstScreen\(\)/.test(b))[0];
  assert.ok(owner, 'state 가 mailFirstScreen() 을 안 부릅니다');
  assert.match(owner, /function mailFirstScreen\(/,
    'mailFirstScreen 이 «다른 script» 에 있습니다 — state 를 지을 때 없습니다');
  assert.match(owner, /function urlWantsMail\(/, 'urlWantsMail 이 다른 script 에 있습니다');
  assert.match(owner, /function mailToFromUrl\(/, 'mailToFromUrl 이 다른 script 에 있습니다');
});
