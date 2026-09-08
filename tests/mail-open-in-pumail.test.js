'use strict';
// 본문은 푸른메일함에서 — node --test tests/mail-open-in-pumail.test.js
//
// 대표 지시 2026-09-05: "다음메일에서 받지말고 푸른메일함에 들어가서 찾아라"
//
// 그 앞의 보고 — 「받은 메일의 본문 요약은 안 됩니다. 서버가 제목·미리보기만
// 남기고 본문을 안 담아서, 다음메일에 새로 붙어야 합니다」.
// 대표의 답은 «붙지 마라»였다. 푸른메일함이 이미 그 일을 한다:
//   · 받은함 + 보낸함 + 업체 명단을 합쳐 「🏢 사업장별」 실타래를 만든다(openCoThread)
//   · 본문은 열 때 그 자리에서 가져온다(mail-sync)
//
// 그런데 «건너가는 길»이 없었다 — openCoThread 의 주석은 예전부터
// ?view=mail&mail=co&co=… 를 약속했는데 받는 자리가 코드에 없었다.
//
// 이 검사가 지키는 것
//   ① 업무관리가 그 사업장 실타래로 건너간다 (업체 번호가 있을 때만)
//   ② 푸른메일함이 그 주소를 «실제로» 받는다
//   ③ 「본문은 다음메일에서」라는 옛 안내가 남아 있지 않다
//   ④ 업무관리가 메일 만 통을 다시 내려받지 않는다 — 잣대를 두 벌로 만들지 않는다
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const W = fs.readFileSync(path.join(ROOT, 'work.html'), 'utf8').replace(/\r\n/g, '\n');
const PC = fs.readFileSync(path.join(ROOT, 'pu-cards.html'), 'utf8').replace(/\r\n/g, '\n');

function grab(src, name, kw){
  const head = (kw || 'function ') + name + '(';
  const i = src.indexOf(head);
  assert.ok(i >= 0, '못 찾음: ' + name);
  let d = 0, j = i;
  for(;; j++){ if(src[j] === '{') d++; else if(src[j] === '}'){ d--; if(!d){ j++; break; } } }
  return src.slice(i, j);
}
function code(t){
  return t.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}

/* ══════════════════════════════════════════════
   ① 업무관리 → 푸른메일함
   ══════════════════════════════════════════════ */
function wbox(opts){
  opts = opts || {};
  const opened = [];
  const b = {
    console, String, Object,
    coFind(){ return opts.co === undefined ? null : opts.co; },
    toast(m){ b._toast = String(m); },
    encodeURIComponent,
    escJ: x => String(x == null ? '' : x).replace(/\\/g, '\\\\').replace(/'/g, "\\'"),
    /* ⚠ 2026-09-08 — 앱끼리 창을 열 때는 공용 층(PuAppBar.goApp)을 쓴다
         (대표 지시 「모든 창은 2개가 열리지 않고 하나만」). 창 이름은 그쪽이 짓는다.
       ★ 여기서는 «어느 주소로, 어느 쓰임으로» 넘기는지를 본다. */
    PuAppBar: { goApp(u, purpose){ opened.push([u, purpose]); } },
    window: { open(){ throw new Error('앱이 창을 직접 열면 안 됩니다 — PuAppBar.goApp 을 쓰세요'); } }
  };
  vm.createContext(b);
  vm.runInContext(grab(W, 'mbCoId') + '\n' + grab(W, 'mbGo') + '\n' + grab(W, 'dMbGoHTML'), b);
  b._opened = opened;
  return b;
}

test('★ 업무에 적힌 업체 번호로 건너간다', () => {
  const b = wbox({});
  assert.equal(b.mbCoId({ co_id: 'C-77' }), 'C-77');
});

test('업무에 번호가 없으면 업체 목록에서 찾아 쓴다 — 상호가 조금 달라도 이어진다', () => {
  const b = wbox({ co: { id: 'C-88', name: '한서정공' } });
  assert.equal(b.mbCoId({ company: '(주)한서정공' }), 'C-88');
});

test('★★ 업체를 못 찾으면 단추를 «안 그린다» — 눌러서 엉뚱한 곳이 열리면 고장으로 보인다', () => {
  const b = wbox({ co: null });
  assert.equal(b.dMbGoHTML({ company: '이름만있는곳' }), '');
});

test('업체가 있으면 단추가 나오고, 무엇이 열리는지 미리 적어 둔다', () => {
  const h = wbox({}).dMbGoHTML({ co_id: 'C-77' });
  assert.match(h, /푸른메일함에서 모두 보기/);
  assert.match(h, /title="[^"]*사업장별[^"]*"/, '무엇이 열리는지 안 적혀 있다');
  assert.match(h, /class="mlgo"/);
});

test('★★ 주소는 푸른메일함의 «사업장별»을 가리킨다', () => {
  const b = wbox({});
  b.mbGo('C-77');
  assert.equal(b._opened.length, 1);
  assert.equal(b._opened[0][0], 'pu-cards.html?sso=1&view=mail&mail=co&co=C-77');
  /* ⚠ 2026-09-08 — '_blank' 가 아니라 «메일 쓰기 전용 쓰임»으로 넘긴다.
       보던 업무 화면을 덮지 «않는» 것은 그대로이고, 두 번 눌러도 탭이 안 쌓인다. */
  assert.equal(b._opened[0][1], 'mailwrite',
    '★★ 쓰임을 안 넘기면 명함 보기 창과 한 창을 다투게 됩니다 — 쓰던 편지가 사라집니다');
});

test('업체 번호에 이상한 글자가 있어도 주소가 안 깨진다', () => {
  const b = wbox({});
  b.mbGo('C 77&x=1');
  assert.match(b._opened[0][0], /co=C%2077%26x%3D1$/);
});

test('번호가 비면 열지 않고 말해 준다 — 조용히 지나가지 않는다', () => {
  const b = wbox({});
  b.mbGo('');
  assert.equal(b._opened.length, 0);
  assert.match(b._toast || '', /업체를 찾지 못했습니다/);
});

test('★ 상자 바닥에 붙는다 — 줄마다 붙이면 열두 번 되풀이된다', () => {
  const D = code(grab(W, 'dMailHTML'));
  assert.match(D, /\+dMbGoHTML\(it\)/);
  assert.doesNotMatch(code(grab(W, 'dMailRowHTML')), /dMbGoHTML/);
  assert.doesNotMatch(code(grab(W, 'dSentRowHTML')), /dMbGoHTML/);
});

/* ══════════════════════════════════════════════
   ② 푸른메일함이 그 주소를 받는다
   ══════════════════════════════════════════════ */
function pbox(){
  const b = { console, String, URLSearchParams };
  vm.createContext(b);
  vm.runInContext(grab(PC, 'mailCoFromUrl'), b);
  return b;
}

test('★★ ?view=mail&mail=co&co=… 에서 업체 번호를 꺼낸다', () => {
  assert.equal(pbox().mailCoFromUrl('?sso=1&view=mail&mail=co&co=C-77'), 'C-77');
});

test('★★ 「사업장별이 아니다」와 「사업장별인데 번호가 없다」를 가른다', () => {
  const b = pbox();
  assert.equal(b.mailCoFromUrl('?view=mail'), null, '엉뚱한 길까지 사업장별로 연다');
  assert.equal(b.mailCoFromUrl('?view=mail&mail=co'), '', '번호 없이 오면 조용히 받은메일함으로 샌다');
  assert.equal(b.mailCoFromUrl('?view=mail&mail=box&box=1'), null);
});

test('빈 주소·망가진 주소에도 안 터진다', () => {
  const b = pbox();
  assert.equal(b.mailCoFromUrl(''), null);
  assert.equal(b.mailCoFromUrl(undefined), null);   // location 이 없는 자리
});

test('앞뒤 빈칸은 떼어 낸다', () => {
  assert.equal(pbox().mailCoFromUrl('?mail=%20co%20&co=%20C-9%20'), 'C-9');
});

test('★★ 들어오는 문이 그 값을 실제로 쓴다 — 주소는 저장된 마지막 화면보다 앞선다', () => {
  const R = code(grab(PC, 'restoreLastScreen'));
  assert.match(R, /const _mc = mailCoFromUrl\(\);\s*if\(_mc !== null\)\{ openCoThread\(_mc\); return; \}/);
  /* 받은메일함으로 새기 «전»이어야 한다 */
  assert.ok(R.indexOf('mailCoFromUrl()') < R.indexOf("openMailBox('')"), '받은메일함이 먼저 열린다');
});

test('urlWantsMail 안에 있다 — view=mail 이 아닌 길에서는 안 본다', () => {
  const R = grab(PC, 'restoreLastScreen');
  const iWant = R.indexOf('if(urlWantsMail()){');
  const iCo = R.indexOf('mailCoFromUrl()');
  assert.ok(iWant >= 0 && iCo > iWant);
});

/* ══════════════════════════════════════════════
   ③ 옛 안내가 남아 있지 않다
   ══════════════════════════════════════════════ */
test('★★ ⓘ 가 「다음메일에서 하십시오」라고 말하지 않는다', () => {
  const H = W.slice(W.indexOf('var HELP={'), W.indexOf('function hlp('));
  assert.doesNotMatch(H, /다음메일<\/b>에서 하십시오/, '대표가 고치라고 한 그 문장이 남아 있다');
  assert.match(H, /본문·답장·삭제는 <b>푸른메일함<\/b>에서 하십시오/);
  assert.match(H, /사업장별/, '어디로 가면 되는지 안 적혀 있다');
});

test('★ 「본문이 여기 없다」는 그대로 남는다 — 없는 것을 있는 척하지 않는다', () => {
  const H = W.slice(W.indexOf('var HELP={'), W.indexOf('function hlp('));
  assert.match(H, /<b>여기에는 본문이 없습니다/);
});

test('코드 옆 설명도 함께 고쳤다 — 주석과 화면이 다른 말을 하면 안 된다', () => {
  const seg = W.slice(W.indexOf("var MAILLOG_PATH="), W.indexOf('function mailLoad('));
  assert.doesNotMatch(seg, /본문은 다음메일에 있다/);
  assert.match(W, /본문·답장·삭제·읽음은 «푸른메일함»이 진짜다/);
});

/* ══════════════════════════════════════════════
   ④ 같은 일을 두 벌로 만들지 않는다
   ══════════════════════════════════════════════ */
test('★★ 업무관리는 회사 메일함(mailbox)을 통째로 내려받지 않는다', () => {
  /* 만 통을 여기서 또 읽으면 요금도 두 배, 「이 업체 메일」의 잣대도 두 벌이 된다.
     보는 곳은 푸른메일함 한 곳이다. */
  const live = code(W);
  assert.doesNotMatch(live, /ref\(\s*['"`]mailbox/, '업무관리가 회사 메일함을 직접 읽는다');
  assert.doesNotMatch(live, /MB_ROOT/);
});

test('★ 새 창으로 연다 — 보던 업무를 잃지 않는다', () => {
  /* ⚠ 2026-09-08 — 여는 길이 공용 층으로 옮겨졌다(대표 지시 「창은 하나만」).
       지켜야 할 것은 「이 창을 갈아타지 않는다」이고, 그것은 그대로다. */
  const fn = grab(W, 'mbGo');
  assert.match(fn, /PuAppBar\.goApp\(/, '★ 공용 층으로 열지 않습니다 — 창 이름이 갈립니다');
  assert.ok(!/location\.href/.test(fn),
    '★★ 이 창을 갈아탑니다 — 보던 업무가 날아갑니다');
});

test('푸른메일함 쪽은 «읽는 길»만 늘었다 — 새로 쓰는 것이 없다', () => {
  const F = code(grab(PC, 'mailCoFromUrl'));
  assert.doesNotMatch(F, /\.(set|update|push|remove)\(/);
});
