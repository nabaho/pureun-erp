/* 앱을 다시 깔면 «연결이 지워진다» — 창은 그 다음 걸음을 줘야 한다 (대표 2026-08-29)
 *
 * 대표: 「문자 안들어오고 연결번호 계속 요청들어온다」.
 *
 * 무슨 일이 있었나: 앱을 다시 깔았다. 폰 앱의 연결정보(uid·열쇠·기기번호)는
 * 앱 데이터에 있어서 «지우면 함께 사라진다». 그래서 앱이 8자리 연결번호를
 * 다시 달라고 한다 — 당연한 일이다.
 *
 * ★ 그런데 내가 만든 「이렇게 고칩니다」 창이 「🔗 휴대폰 연결은 여기서 누르지
 *   않습니다」라고 «막고» 있었다. 앱은 번호를 달라 하고 창은 받지 말라 하니
 *   빠져나갈 데가 없었다. 창이 사람을 «가둔» 것이다.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ERP = fs.readFileSync(path.join(__dirname, '..', 'pu-erp.html'), 'utf8');
function bare(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}
function cutBlock(src, header) {
  const i = src.indexOf(header);
  assert.ok(i >= 0, '못 찾음: ' + header);
  let d = 0;
  for (let k = src.indexOf('{', i); k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (d === 0) return src.slice(i, k + 1); }
  }
  throw new Error('닫는 괄호 없음: ' + header);
}
function renderFix() {
  const called = [];
  const ctx = {
    hanaFix: true,
    HANA_APK_VER: '9.9.9',
    location: { protocol: 'https:', origin: 'https://x.kr', pathname: '/a/b.html' },
    setHanaFix: () => { called.push('닫기'); },
    setPasteOpen: () => { called.push('붙여넣기'); },
    startHanaSmsPair: () => { called.push('연결번호'); },
    h: (tag, props, ...kids) => ({ tag, props: props || {}, kids }),
  };
  vm.createContext(ctx);
  vm.runInContext(cutBlock(ERP, 'function hanaApkUrl(){'), ctx);
  vm.runInContext(cutBlock(ERP, '  function hanaApkBlock(){'), ctx);
  vm.runInContext(cutBlock(ERP, 'function hanaFixModal(){'), ctx);
  return { tree: ctx.hanaFixModal(), called };
}
function nodes(root) {
  const out = [];
  (function walk(n) {
    if (n == null) return;
    if (Array.isArray(n)) return n.forEach(walk);
    if (typeof n !== 'object') return;
    out.push(n); walk(n.kids);
  })(root);
  return out;
}
function texts(root) {
  const out = [];
  (function walk(n) {
    if (n == null) return;
    if (Array.isArray(n)) return n.forEach(walk);
    if (typeof n === 'string') { out.push(n); return; }
    if (n.kids) walk(n.kids);
  })(root);
  return out;
}

test('★★ 창이 «연결번호 받는 길»을 준다 — 앱을 다시 깔면 반드시 필요하다', () => {
  const { tree, called } = renderFix();
  const btns = nodes(tree).filter(
    (n) => n.tag === 'button' && n.props && typeof n.props.onClick === 'function');
  assert.ok(btns.length >= 2, '단추가 ' + btns.length + '개뿐이다');
  btns.forEach((b) => { try { b.props.onClick(); } catch (_e) { /* 다른 단추는 상관없다 */ } });
  assert.ok(called.indexOf('연결번호') >= 0,
    '★ 연결번호를 받을 길이 창 안에 없다 — 앱은 번호를 달라 하는데 창은 줄 데가 없으면 갇힌다');
});

test('★★ 창이 연결번호를 «받지 말라고 막지» 않는다', () => {
  const all = texts(renderFix().tree).join(' ');
  assert.ok(all.indexOf('누르지 않습니다') < 0,
    '★ 앱이 번호를 달라 하는데 창이 받지 말라고 하면 빠져나갈 데가 없다 (2026-08-29 에 실제로 그랬다)');
});

test('★★ 앱을 다시 깔면 연결이 «지워진다»고 말해 준다', () => {
  const all = texts(renderFix().tree).join(' ');
  assert.ok(/다시 깔면[^.]*지워|지워[^.]*다시 이어|연결이 지워집니다/.test(all),
    '★ 왜 또 연결번호를 넣어야 하는지 안 알려 주면, 「또?」 하고 잘못된 데를 뒤진다');
});

test('★★ 걸음 번호가 1부터 «빠짐없이 차례»대로다', () => {
  /* ⚠ 글 차례만 보면 번호가 0·2·3… 이어도 통과한다.
     대표는 «번호를 보고» 따라간다 — 번호 자체가 규칙이다. */
  const fix = cutBlock(ERP, 'function hanaFixModal(){');
  const ns = (fix.match(/\bstep\(\s*(\d+)\s*,/g) || []).map((m) => Number(m.match(/\d+/)[0]));
  assert.ok(ns.length >= 4, '걸음이 ' + ns.length + '개뿐이다 — 검사가 헛돌고 있다');
  ns.forEach((n, i) => assert.strictEqual(n, i + 1,
    '★ 걸음 번호가 어긋난다: ' + JSON.stringify(ns)));

  /* 앱 받기가 «연결번호보다 먼저» 와야 한다 — 옛 앱에 번호를 넣어 봐야 소용없다. */
  const all = texts(renderFix().tree).join(' ');
  assert.ok(all.indexOf('앱을 새로 깝니다') < all.indexOf('연결번호'),
    '★ 연결번호를 앱 받기보다 먼저 시키면, 옛 앱에 번호를 넣고 또 헤맨다');
});

test('★ 붙여넣는 길은 그대로 남아 있다', () => {
  const { tree } = renderFix();
  const fix = bare(cutBlock(ERP, 'function hanaFixModal(){'));
  assert.ok(fix.indexOf('setPasteOpen(true)') >= 0, '폰이 끝내 안 될 때 갈 곳이 사라졌다');
  assert.ok(texts(tree).join(' ').indexOf('「지난 문자 가져오기 (최근 30일)」') >= 0,
    '지난 문자 안내가 사라졌다');
});

test('★★ 「판 번호가 없으면 옛 앱」이라고 말해 준다', () => {
  /* 대표 2026-08-29 화면: 옛 앱은 판 번호를 «아예 안 적는다».
     「판 번호가 1.2.0 인지 보세요」라고만 하면 «없는데?» 에서 막힌다.
     ★ 다운로드 폴더의 예전 파일을 눌러 옛 앱이 다시 깔린 것이 실제 까닭이었다. */
  const all = texts(renderFix().tree).join(' ');
  /* ⚠ 문장을 글자 그대로 박고 있었다. 2026-08-30 에 창을 한 화면으로 줄이면서
       (대표: 「불필요하게 너무 많은 설명이 있다」) 같은 뜻을 짧게 다시 쓰자 깨졌다 —
       코드는 멀쩡했다. 지킬 것은 문장이 아니라 «없는 경우를 알려 주는가» 다. */
  assert.ok(/판 번호가[^.]{0,24}안 보이면[^.]{0,14}옛 앱/.test(all),
    '★ 판 번호가 «없는» 경우를 안 알려 준다 — 옛 앱은 번호를 아예 안 적는다');
  assert.ok(/다운로드 폴더/.test(all),
    '★ 예전에 받아 둔 파일을 눌러 옛 앱이 다시 깔리는 것을 안 막아 준다');
});
