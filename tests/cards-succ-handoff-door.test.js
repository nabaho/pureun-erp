/* 「🚪 퇴사한 담당 — 이어받기」 문 (대표 지시 2026-09-08 「이어받기」)

   ■ 왜 필요했나
   담당 «고르개»에서 퇴사자를 뺐다(2026-09-08, nonRetiredPicks). 그런데 그 사람이
   **아직 담당인 곳**이 남아 있으면, 이름이 사라진 것만으로는 그 곳들을 어떻게 할지
   알 길이 없었다. **빼기만 하고 갈 곳을 안 만들면 자료를 잃은 것과 같다.**

   ★ 갈 곳은 «이미 있었다» — 메일함의 「③ 퇴사자 이어받기」(openWhoPage · whoTab 'succ').
     한 줄만 정하면 그 사람이 맡던 것 전부가 새 담당자에게 간다.
     없던 것은 «기업정보함에서 그 자리로 가는 길»뿐이었다.

   ★ 못 박는 것
     ① 빠진 퇴사자가 있으면 띠가 뜬다. **0명이면 아예 안 뜬다**(늘 켜진 등은 못 알린다).
     ② 세는 일은 «한 번»이다 — 고르개를 만들 때 함께 가른다. 따로 세면 6,315장을
        두 벌씩 훑는다.
     ③ 띠를 누르면 메일 «앱 창»의 이어받기 화면이 열린다.
     ④ 그 창 이름은 포털의 메일 창과 «같다». 다르면 메일 창이 둘이 된다.
     ⑤ 메일 «쓰기» 창과는 «따로»다 — 쓰다 만 편지를 이 화면으로 덮으면 안 된다.
     ⑥ 주소는 «아는 갈래»만 받는다. 모르는 글자를 그대로 쓰면 빈 화면이 열린다.
     ⑦ `?mail=co` 는 「이 사업장과 오간 것」이 먼저 받는다 — 그 길로 새면 안 된다.

     node --test tests/cards-succ-handoff-door.test.js */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'pu-cards.html'), 'utf8').split('\r\n').join('\n');
const ENTER = fs.readFileSync(path.join(ROOT, 'enter.html'), 'utf8').split('\r\n').join('\n');

function fnBody(name) {
  const i = SRC.search(new RegExp('(?:^|\\n)(?:async )?function ' + name + '\\('));
  assert.ok(i >= 0, name + ' 을 찾지 못했습니다');
  const open = SRC.indexOf('{', i);
  let d = 0;
  for (let k = open; k < SRC.length; k++) {
    if (SRC[k] === '{') d++;
    else if (SRC[k] === '}') { d--; if (!d) return SRC.slice(i, k + 1); }
  }
  assert.fail(name + ' 의 끝을 찾지 못했습니다');
}
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ══════ ① 띠 ══════ */

function chip(gone) {
  const ctx = { console, Object, String, Number, Array, esc, _mgrGone: gone };
  vm.createContext(ctx);
  vm.runInContext(fnBody('mgrGoneChipHtml'), ctx);
  return ctx.mgrGoneChipHtml();
}

test('★★★ 빠진 퇴사자가 있으면 «몇 명인지와 갈 곳»을 보여 준다', () => {
  const h = chip(['박성수', '임혜미']);
  assert.ok(h, '★★★ 띠를 안 그렸다 — 이름이 사라진 까닭을 알 길이 없다');
  assert.match(h, /🚪 퇴사한 담당 <b>2<\/b>명/, '★ 몇 명인지 안 말한다');
  assert.match(h, /이어받기/, '★ 갈 곳을 안 말한다');
  assert.match(h, /onclick="openSuccWindow\(\)"/, '★★★ 눌러도 갈 데가 없다');
  /* 누구인지는 말풍선에 — 띠에 이름을 다 늘어놓으면 줄이 길어진다 */
  assert.match(h, /title="박성수 · 임혜미/, '★ 누구인지 알 길이 없다');
});

test('★★★ 0명이면 띠를 «아예» 안 그린다 — 늘 켜진 등은 아무것도 못 알린다', () => {
  ['', null, undefined].forEach(v => assert.equal(chip(v === '' ? [] : v), '',
    '★★★ 빠진 사람이 없는데(' + String(v) + ') 띠가 떴다'));
});

test('★★ 많으면 «셋까지»만 이름을 적고 나머지는 수로 — 말풍선이 끝없이 길어지면 안 된다', () => {
  const h = chip(['가', '나', '다', '라', '마']);
  assert.match(h, /title="가 · 나 · 다 외 2명/, '★ 이름을 다 늘어놓는다');
  assert.match(h, /<b>5<\/b>명/, '★ 수는 «전부»여야 한다');
});

/* ══════ ② 한 번만 센다 ══════ */

test('★★★ 고르개를 만들 때 «함께» 가른다 — 따로 세면 6,315장을 두 벌 훑는다', () => {
  const fn = fnBody('renderPCTable');
  const at = fn.indexOf('const _allMgrs = ');
  assert.ok(at > 0, '★ 담당 이름을 모으는 자리를 못 찾았다');
  const seg = fn.slice(at, fn.indexOf('mgrSel.innerHTML', at));
  assert.match(seg, /_mgrGone = _allMgrs\.filter\(mbRetired\)/,
    '★★★ 빠진 퇴사자를 안 가른다 — 띠가 늘 0명이 된다');
  assert.match(seg, /nonRetiredPicks\(_allMgrs, state\.erpMgr\)/, '★ 고르개가 같은 목록을 안 쓴다');
  /* 두 번 훑지 않는다 — allItems 를 여기서 한 번만 부른다 */
  assert.equal((seg.match(/allItems\(\)/g) || []).length, 1,
    '★★ 목록을 두 번 훑는다 — 폴더를 열 때마다 그만큼 멈춘다');
  /* 띠는 조건 딱지와 «같은 자리»에 붙는다 (따로 내면 서로를 지운다) */
  assert.match(fn, /condChipsHtml\(\) \+ mgrGoneChipHtml\(\)/,
    '★★ 띠를 다른 자리에 그린다 — 담당 띠가 걸릴 때 서로 지운다');
});

/* ══════ ③④⑤ 창 ══════ */

function runWin(blocked) {
  const ctx = {
    console, String,
    toast: m => { ctx._toast = m; },
    window: {
      open: (url, name) => {
        ctx._open = { url: url, name: name };
        return blocked ? null : { focus: () => { ctx._focused = true; } };
      }
    }
  };
  vm.createContext(ctx);
  /* ⚠ 최상위 const 는 컨텍스트 값이 되지 않는다 — var 로 바꿔 싣는다.
     ⚠ 함수는 «중괄호를 세어» 통째로 뜬다. 첫 `}` 로 자르면 catch(_){} 에서 끊긴다
       (2026-09-08 에 실제로 그렇게 잘려 focus 를 못 봤다). */
  const line = SRC.slice(SRC.indexOf('const MAIL_APP_WIN = '),
    SRC.indexOf('\n', SRC.indexOf('const MAIL_APP_WIN = ')));
  vm.runInContext(line.replace('const ', 'var ') + '\n' + fnBody('openSuccWindow'), ctx);
  ctx.openSuccWindow();
  return ctx;
}

test('★★★ 띠를 누르면 «메일 앱 창»의 이어받기 화면이 열린다', () => {
  const c = runWin(false);
  assert.ok(c._open, '★★★ 창을 안 열었다');
  const u = new URL('https://x.io/pureunall/' + c._open.url);
  assert.equal(u.pathname, '/pureunall/pu-cards.html');
  assert.equal(u.searchParams.get('view'), 'mail', '★ 메일 문으로 안 간다');
  assert.equal(u.searchParams.get('mail'), 'succ',
    '★★★ 이어받기 갈래를 안 실었다 — 받은메일함이 열린다');
  assert.equal(c._focused, true, '★★ 앞으로 끌어오지 않는다 — 아무 일도 안 한 것처럼 보인다');
});

test('★★★ 창 이름이 포털의 «메일 창»과 같다 — 다르면 메일 창이 둘이 된다', () => {
  assert.equal(runWin(false)._open.name, 'pureun-mail', '★ 창 이름이 다르다');
  /* 포털이 짓는 이름과 «같은지» 저쪽 파일에서 되짚는다 */
  assert.match(ENTER, /return 'pureun-' \+ String\(key \|\| ''\)/,
    '★ 포털의 창 이름 규칙이 바뀌었다 — 이쪽도 함께 고칠 것');
  assert.match(ENTER, /key:'mail'/, '★ 포털에 메일 앱 열쇠가 없다');
});

test('★★★ 메일 «쓰기» 창과는 따로다 — 쓰다 만 편지를 덮으면 안 된다', () => {
  const write = (SRC.match(/const MAIL_WIN = '([^']+)'/) || [])[1];
  const app = (SRC.match(/const MAIL_APP_WIN = '([^']+)'/) || [])[1];
  assert.ok(write && app, '★ 창 이름 둘을 못 찾았다');
  assert.notEqual(write, app,
    '★★★ 두 창 이름이 같다 — 이어받기를 열면 쓰다 만 편지가 사라진다');
});

test('★★ 팝업이 막히면 «알린다» — 아무 일도 안 하면 반응 없는 띠가 된다', () => {
  const c = runWin(true);
  assert.match(String(c._toast), /팝업이 막혀/, '★★ 막혔는데 아무 말도 없다');
});

/* ══════ ⑥⑦ 주소 받기 ══════ */

function url() {
  const ctx = { console, String, URLSearchParams, Array, location: { search: '' } };
  vm.createContext(ctx);
  vm.runInContext([SRC.slice(SRC.indexOf('const MAIL_WHO_TABS = '),
    SRC.indexOf('\n', SRC.indexOf('const MAIL_WHO_TABS = '))).replace('const ', 'var '),
    fnBody('mailWhoFromUrl'), fnBody('mailCoFromUrl')].join('\n'), ctx);
  return ctx;
}

test('★★★ 아는 갈래만 받는다 — 모르는 글자는 빈 화면을 만든다', () => {
  const c = url();
  assert.equal(c.mailWhoFromUrl('?view=mail&mail=succ'), 'succ', '★★★ 이어받기 길이 안 열린다');
  assert.equal(c.mailWhoFromUrl('?view=mail&mail=addr'), 'addr');
  assert.equal(c.mailWhoFromUrl('?view=mail&mail=zzz'), null,
    '★★★ 모르는 갈래를 그대로 쓴다 — 아무 갈래에도 안 걸려 빈 화면이 열린다');
  assert.equal(c.mailWhoFromUrl('?view=mail'), null, '★ 갈래가 없는데 무언가를 돌려준다');
  assert.equal(c.mailWhoFromUrl(''), null);
});

test('★★★ ?mail=co 는 «사업장 갈래»가 먼저 받는다 — 그 길로 새면 안 된다', () => {
  const c = url();
  assert.equal(c.mailCoFromUrl('?view=mail&mail=co&co=가나'), '가나',
    '★ 사업장 길이 깨졌다');
  assert.equal(c.mailWhoFromUrl('?view=mail&mail=co&co=가나'), null,
    '★★★ 「이 사업장과 오간 것」이 주인 가리기 화면으로 샌다 (MAIL_WHO_TABS 에 co 를 넣으면 안 된다)');
  assert.ok(c.MAIL_WHO_TABS.indexOf('co') < 0, '★★★ 목록에 co 가 들었다');
  assert.ok(c.MAIL_WHO_TABS.indexOf('succ') >= 0, '★ 목록에 succ 가 없다');
});

test('★★★ 메일 문에서 «사업장 갈래 뒤에» 이어받기를 본다', () => {
  const fn = fnBody('restoreLastScreen');
  const co = fn.indexOf('mailCoFromUrl()');
  const wt = fn.indexOf('mailWhoFromUrl()');
  const bx = fn.indexOf("openMailBox('')");
  assert.ok(co > 0 && wt > co, '★★ 차례가 어긋났다 — ?mail=co 가 이어받기로 샐 수 있다');
  assert.ok(wt < bx, '★★★ 받은메일함을 «먼저» 열어 버린다 — 이어받기 띠를 눌러도 메일함이 뜬다');
  assert.match(fn.slice(wt, bx), /openWhoPage\(_wt\)/, '★★★ 이어받기 화면을 안 연다');
});

test('★★ 갈래를 들고 오면 «그 갈래»로 연다 — 안 주면 예전 그대로', () => {
  const ctx = {
    console, Object, String, Array,
    state: {}, render: () => { }, $: () => null,
    mbNeedSlugs: () => [], MB_WHO_NA: 'na', _mbMsgs: {}, loadMailBox: () => { }
  };
  vm.createContext(ctx);
  vm.runInContext(fnBody('openWhoPage'), ctx);
  ctx.openWhoPage('succ');
  assert.equal(ctx.state.whoTab, 'succ', '★★★ 들고 온 갈래를 버린다 — 받은 갈래로 안 간다');
  assert.equal(ctx.state.view, 'mail');
  assert.equal(ctx.state.mailSent, 'who');
  /* 안 주면 예전 그대로 — 마지막에 보던 갈래(없으면 addr) */
  const c2 = (() => {
    const x = Object.assign({}, ctx, { state: {} });
    vm.createContext(x); vm.runInContext(fnBody('openWhoPage'), x);
    x.openWhoPage(); return x;
  })();
  assert.equal(c2.state.whoTab, 'addr', '★★ 갈래를 안 줬을 때의 기본이 바뀌었다');
  /* 보던 갈래가 있으면 그것을 지키다 */
  const c3 = (() => {
    const x = Object.assign({}, ctx, { state: { whoTab: 'end' } });
    vm.createContext(x); vm.runInContext(fnBody('openWhoPage'), x);
    x.openWhoPage(); return x;
  })();
  assert.equal(c3.state.whoTab, 'end', '★★ 보던 갈래를 덮어 버린다');
});

/* ══════ 갈 곳이 실제로 있는가 ══════ */

test('★★★ 이어받기 «화면»이 그 갈래에 실제로 있다 — 길만 잇고 방이 없으면 빈 화면이다', () => {
  const i = SRC.indexOf("} else if(tab === 'succ'){");
  assert.ok(i > 0, '★★★ succ 갈래를 그리는 자리가 없다');
  const seg = SRC.slice(i, i + 2500);
  assert.match(seg, /mbSuccPending\(\)/, '★ 남아 있는 퇴사자 목록을 안 읽는다');
  assert.match(seg, /mbSuccSet\('\$\{esc\(p\.sid\)\}'/, '★ 이어받을 사람을 정할 길이 없다');
  /* 갈래 단추도 그대로 있어야 한다 — 화면 안에서 오갈 길 */
  assert.match(SRC, /whoTab\('succ'\)/, '★ 화면 안의 갈래 단추가 사라졌다');
});
