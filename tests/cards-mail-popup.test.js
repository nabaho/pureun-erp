'use strict';
/* 이메일을 누르면 «딴 창»의 메일 쓰기로 — 그리고 창은 «하나»만 (대표 지시 2026-08-29)
   ═══════════════════════════════════════════════════════════════════════════
   "메일 주소 클릭하면 별도로 팝업창의 메일창으로 들어가게 하고
    메일을 여러개 클릭한다고 여러개 팝업창으로 나오면 안된다 하나만 나오게 해라"
   "메일열기 필요없다. 삭제"

   ★ 창을 하나로 묶는 방법: window.open 의 «둘째 인자(창 이름)».
     이름이 같으면 브라우저가 그 창을 다시 쓴다. 이름을 안 주거나 '_blank' 를 주면
     누를 때마다 창이 새로 뜬다 — 열 사람에게 쓰려다 창 열 개가 쌓인다.
     사진첩 서류 보기(CO_DOC_WIN)가 이미 같은 방법을 쓴다.
   실행: node --test tests/cards-mail-popup.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'pu-cards.html'), 'utf8').replace(/\r\n/g, '\n');
const code = s => String(s).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');

function fn(name){
  let at = src.indexOf('function ' + name + '(');
  assert.ok(at >= 0, name + ' 을 찾지 못했습니다');
  if (src.slice(at - 6, at) === 'async ') at -= 6;
  let d = 0;
  for (let i = src.indexOf('{', at); i < src.length; i++){
    if (src[i] === '{') d++;
    else if (src[i] === '}'){ d--; if (!d) return src.slice(at, i + 1); }
  }
  assert.fail(name + ' 의 끝을 찾지 못했습니다');
}

/* ── 가짜 브라우저로 «실제로 눌러» 본다 ── */
function box(opt){
  const o = opt || {};
  const opened = [];
  const ctx = {
    console, encodeURIComponent, String, Number, Object,
    state: { items: { c1: { id:'c1', name:'이주재', company:'이레메디컬', email:'cust11@naver.com' },
                      c2: { id:'c2', name:'이정래', company:'세무법인 자연', email:'cust05@hanmail.net' },
                      c3: { id:'c3', name:'최정식', company:'최정식 세무회계', email:'' } } },
    normEmail: v => String(v || '').trim().toLowerCase(),
    toast: m => { ctx._toast = m; },
    openSendMaterials: id => { ctx._fellBack = id; },
    window: { open: (url, name) => { opened.push({ url, name }); return o.blocked ? null : { focus(){ ctx._focused = true; } }; } },
    _opened: opened
  };
  vm.createContext(ctx);
  vm.runInContext('const MAIL_WIN = ' + JSON.stringify((src.match(/const MAIL_WIN = '([^']+)'/) || [])[1] || '')
    + ';\n' + fn('openMailWindow'), ctx);
  return ctx;
}

test('★ 이메일을 누르면 «딴 창»이 열린다', () => {
  const c = box();
  c.openMailWindow('c1');
  assert.equal(c._opened.length, 1, '창이 안 열렸다');
  assert.match(c._opened[0].url, /view=mail/, '메일 화면으로 안 간다');
  assert.match(c._opened[0].url, /to=cust11%40naver\.com/, '★ 받는 사람이 안 실렸다 — 빈 편지지가 열린다');
  assert.match(c._opened[0].url, /card=c1/, '어느 명함에서 왔는지가 안 실렸다');
});

test('★★ 여러 번 눌러도 창은 «하나»다 — 이름이 같아야 한다', () => {
  const c = box();
  c.openMailWindow('c1');
  c.openMailWindow('c2');
  c.openMailWindow('c1');
  const names = [...new Set(c._opened.map(x => x.name))];
  assert.equal(names.length, 1,
    '★ 창 이름이 여럿이다 — 누를 때마다 새 창이 뜬다: ' + names.join(', '));
  assert.ok(names[0] && names[0] !== '_blank',
    '★ 창 이름이 비었거나 _blank 다 — 브라우저가 매번 새 창을 연다');
});

test('열린 창을 «앞으로 끌어온다» — 안 그러면 아무 일도 안 한 것처럼 보인다', () => {
  const c = box();
  c.openMailWindow('c1');
  assert.equal(c._focused, true,
    '★ focus() 를 안 부른다 — 두 번째부터는 뒤에 가려 있어 눌러도 반응이 없어 보인다');
});

test('★ 팝업이 막히면 «예전 길»로 되돌아간다 — 반응 없는 화면이 되면 안 된다', () => {
  const c = box({ blocked: true });
  c.openMailWindow('c1');
  assert.equal(c._fellBack, 'c1',
    '★ 팝업이 막혔는데 아무 일도 안 한다 — 이메일을 눌러도 반응이 없다');
});

test('이메일이 없으면 창을 안 열고 «왜»를 알려 준다', () => {
  const c = box();
  c.openMailWindow('c3');
  assert.equal(c._opened.length, 0, '이메일이 없는데 빈 창을 열었다');
  assert.match(String(c._toast || ''), /이메일/, '왜 안 되는지 안 알려 준다');
});

/* ── 주소에 실려 온 「누구에게」를 읽는다 ── */
function urlBox(){
  const ctx = { console, String, URLSearchParams };
  vm.createContext(ctx);
  vm.runInContext(fn('mailToFromUrl'), ctx);
  return ctx;
}

test('★ 메일 창이 «누구에게»를 읽는다 — 못 읽으면 빈 편지지가 열린다', () => {
  const c = urlBox();
  const r = c.mailToFromUrl('?view=mail&to=a%40b.c&name=%ED%99%8D%EA%B8%B8%EB%8F%99&card=c9');
  assert.equal(r.to, 'a@b.c');
  assert.equal(r.name, '홍길동');
  assert.equal(r.card, 'c9');
});

test('그냥 메일함으로 들어온 길은 «누구에게»가 없다 — 받은메일함이 열려야 한다', () => {
  const c = urlBox();
  assert.equal(c.mailToFromUrl('?view=mail'), null);
  assert.equal(c.mailToFromUrl(''), null);
});

test('★ 메일 창이 뜰 때 to 가 있으면 «쓰기», 없으면 받은메일함', () => {
  /* ⚠ 2026-09-08 부터 쓰기로 가는 길이 «둘»이다 — 「회사 메일로 바로 보내기」면
       openMailPage, 그 밖(기본값)이면 자료 고르기(openSendMaterials). 어느 길이든
       «받은메일함보다 먼저» 보아야 한다는 뜻은 그대로다.
       (openMailPage 하나만 박아 두었더니, 기본 설정인 사람에게는 새 창이 떠서
        안내문만 보였다 — tests/cards-mail-always-own-window.test.js 참고) */
  const i = src.indexOf('if(urlWantsMail()){');
  const b = code(src.slice(i, src.indexOf("openMailBox('')", i) + 40));
  const at = b.indexOf('mailToFromUrl()');
  const bx = b.indexOf("openMailBox('')");
  assert.ok(at > 0, '★ 메일 창이 「누구에게」를 안 본다 — 이메일을 눌러도 받은메일함이 열린다');
  assert.ok(at < bx, '★ 받은메일함을 «먼저» 열어 버린다 — to 를 먼저 봐야 한다');
  assert.match(b.slice(at, bx), /openMailPage\(|openSendMaterials\(/,
    'to 가 있을 때 쓰기 화면으로 안 간다');
});

/* ── 옆줄 「메일 열기」는 뺐다 — 다만 «길이 끊기지 않았는지»가 더 중요하다 ── */
test('★ 옆줄에서 「메일 열기」를 뺐다 (대표 지시)', () => {
  const at = src.indexOf('const onMailNow =');
  /* ⚠ 주석을 «걷고» 본다 — 왜 뺐는지 적어 둔 주석에 그 글자가 그대로 나온다.
     저장소 규칙이다: 소스를 글자로 보는 검사는 주석을 먼저 걷는다. */
  const seg = code(src.slice(at, src.indexOf('return `<div class="pcside-bottom">', at)));
  assert.ok(seg.indexOf('✉️ 메일 열기') < 0,
    '★ 「메일 열기」가 되살아났다 — 대표 지시로 뺀 것이다');
});

test('★★ 그래도 메일로 가는 길은 «남아 있다» — 둘 다 없으면 갇힌다', () => {
  /* 이 단추를 빼면 길이 끊긴다는 경고가 소스와 옛 검사에 있었다.
     빼기 전에 다른 길이 있는지 확인했다 — 둘이 남는다. 그 둘을 여기서 지킨다. */
  const portal = fs.readFileSync(path.join(__dirname, '..', 'enter.html'), 'utf8');
  assert.match(portal, /key:'mail'[\s\S]{0,200}pu-cards\.html\?view=mail/,
    '★ 포털의 「📧 푸른 메일」 타일이 사라졌다 — 메일로 들어갈 길이 준다');
  assert.match(code(src), /function openMailWindow\(/,
    '★ 이메일을 눌러 메일 창으로 가는 길이 사라졌다');
});

test('★ 돌아오는 길(‹ 기업정보함으로)은 그대로다 — 이것까지 빼면 메일 창에 갇힌다', () => {
  const at = src.indexOf('const onMailNow =');
  const seg = src.slice(at, src.indexOf('return `<div class="pcside-bottom">', at));
  assert.match(seg, /closeMailPage\(\)/,
    '★ 메일 창에서 기업정보함으로 돌아올 길이 없어졌다');
});
