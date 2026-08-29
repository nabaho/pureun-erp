/* 하나 문자가 «안 들어올 때» 화면이 할 말과, 취소 표가 살아남는가 (대표 2026-08-29)
 *
 * 대표: 「나의 핸드폰 문자로 받은 하나 은행 카드 내역 자동으로 연결하게 만들고 있는데
 *       안된다 다시 최종 완벽하게 완성해라.」
 *
 * 파고들어 보니 길 자체는 다 있었다. 막힌 곳은 셋이었다 —
 *  ① 「문자 0건」이라고만 하고 «무엇을 하라»는 말이 없었다(까닭 셋을 늘어놓을 뿐).
 *  ② 폰이 «죽은 열쇠»로 말을 걸면 서버에 자국이 하나도 안 남아,
 *     「앱이 없다」와 「연결이 끊겼다」가 화면에서 똑같아 보였다.
 *  ③ 서버가 카드 «취소» 표를 대기함에 안 적고 목록에도 안 실어 보냈다 —
 *     취소가 승인처럼 보였다.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ERP = fs.readFileSync(path.join(__dirname, '..', 'pu-erp.html'), 'utf8');
const FN = fs.readFileSync(path.join(__dirname, '..', 'functions', 'index.js'), 'utf8');

/* 주석을 걷는다 — 잘 쓴 주석이 검사를 통과시키면 안 된다. */
function bare(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}
/* 중괄호를 세어 덩이를 자른다 — 글자로 자르면 남의 덩이까지 삼킨다. */
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

/* 괄호를 세어 `return chip( … )` 한 벌을 통째로 꺼낸다.
   ⚠ 글자로 자르면 글 안의 따옴표·괄호에 걸려 남의 것까지 삼킨다. */
function chipCalls(fnSrc) {
  const out = [];
  let i = 0;
  for (;;) {
    const a = fnSrc.indexOf('return chip(', i);
    if (a < 0) break;
    let d = 0, k = fnSrc.indexOf('(', a);
    for (; k < fnSrc.length; k++) {
      if (fnSrc[k] === '(') d++;
      else if (fnSrc[k] === ')') { d--; if (d === 0) break; }
    }
    out.push(fnSrc.slice(a, k + 1));
    i = k + 1;
  }
  return out;
}

/* ══════════ ① 막힌 표는 «누를 수 있어야» 한다 ══════════ */

test('★★ 문자가 안 들어올 때 표를 «누르면» 고치는 창이 열린다', () => {
  const chip = bare(cutBlock(ERP, 'function hanaStatChip(){'));
  /* ⚠ 「onClick 이라는 글자가 있다」로 겨누면, 앞에 false 를 붙여 꺼도 통과한다.
     «어떤 조건일 때» 누를 수 있게 되는지를 본다. */
  assert.ok(chip.indexOf("if(fix) return h('button'") >= 0,
    '★ 막힌 표가 그냥 «글»이다 — 대표가 무엇을 눌러야 할지 알 수 없다');
  assert.ok(chip.indexOf('setHanaFix(true)') >= 0,
    '★ 표를 눌러도 고치는 창이 안 열린다');
});

test('★★ 막힌 표는 «하나도 빠짐없이» 갈 곳이 있다', () => {
  const chip = bare(cutBlock(ERP, 'function hanaStatChip(){'));
  const stuck = chipCalls(chip).filter((c) => /문자 0건|끊겼|미연결|받은 문자 없음/.test(c));
  assert.ok(stuck.length >= 3, '막힌 갈래를 못 찾았다 — 검사가 헛돌고 있다 (' + stuck.length + '개)');
  stuck.forEach((c) => {
    assert.ok(/,\s*true\s*\)$/.test(c),
      '★ 갈 곳 없는 막힌 표가 있다: ' + (c.match(/'([^']{4,30})'/) || [, '?'])[1]);
  });
});

/* ✗ 지운 검사: 「고치는 창은 새 연결번호를 만들지 않는다」 (2026-08-29 에 내가 못 박았다).

   ★ 규칙 자체가 틀렸다. 「다시 연결하면 센 것이 0 으로 돌아간다」가 아까워서
     창이 연결번호를 «못 받게» 막아 두었다. 그런데 앱을 다시 깔면 폰 안의
     연결정보가 앱과 함께 지워져 «반드시» 다시 연결해야 한다.
     앱은 번호를 달라 하고 창은 받지 말라 하니 빠져나갈 데가 없었다 —
     대표: 「문자 안들어오고 연결번호 계속 요청들어온다」.

   ⚠ 검사는 규칙을 지킨다. 규칙이 틀리면 검사는 «틀린 것을 지킨다».
     그래서 고쳐 쓰지 않고 지웠다 — 반대 규칙을 tests/hana-repair-pairing.test.js 가 지킨다.
     (0 으로 돌아가는 것은 «맞는 말»이다. 새로 깐 앱은 아직 아무것도 안 보냈다.) */

test('★★ 고치는 창이 «앱 받기»와 «지난 문자»를 함께 말한다', () => {
  const fix = bare(cutBlock(ERP, 'function hanaFixModal(){'));
  /* ⚠ 2026-08-29: 받는 자리를 «한 덩이»(hanaApkBlock)로 모았다 — 연결 창과 함께 쓴다.
     여기서 볼 것은 «받는 길이 있는가» 다. 판 번호·QR·주소는 그 덩이의 검사가 본다
     (tests/hana-apk-reach.test.js). */
  assert.ok(/href:\s*'hana-bridge\.apk'|hanaApkBlock\(\)/.test(fix),
    '★ 앱 받는 길이 없다 — 폰 앱이 옛 판이면 카드 문자를 폰에서 버린다');
  /* ⚠ 앱 안의 «그 단추 이름 그대로» 적어야 대표가 폰에서 찾는다.
     「지난 문자」라고만 적으면 어느 단추인지 못 찾는다. */
  assert.ok(fix.indexOf('「지난 문자 가져오기 (최근 30일)」') >= 0,
    '★ 앱을 깔기 «전»에 온 문자는 알림이 이미 지나갔다 — 문자함에서 끌어오라고, 그 단추 이름 그대로 말해야 한다');
  assert.ok(fix.indexOf('setPasteOpen(true)') >= 0,
    '폰이 끝내 안 될 때 «붙여넣는 길»로 보내 주지 않는다');
});

test('★★ 창을 실제로 «그려 본다» — 글자만 맞고 터지는 일이 없게', () => {
  /* ⚠ 여기까지의 검사는 모두 «소스를 글자로» 본다. 그것만으로는
     안 만들어진 이름을 부르거나(HANA_APK_VER 가 범위 밖이라거나) 하는 것을 못 잡는다.
     이 창은 새로 쓴 코드라 아직 한 번도 돌아 본 적이 없다 — 한 번 돌려 본다. */
  const ctx = {
    hanaFix: true,
    HANA_APK_VER: '9.9.9',
    setHanaFix: () => {},
    setPasteOpen: () => {},
    location: { protocol: 'https:', origin: 'https://x.kr', pathname: '/a/b.html' },
    h: (tag, props, ...kids) => ({ tag, props: props || {}, kids }),
  };
  vm.createContext(ctx);
  /* 창이 앱 받는 덩이를 부른다 — 함께 넣어야 실제로 그려진다. */
  vm.runInContext(cutBlock(ERP, 'function hanaApkUrl(){'), ctx);
  vm.runInContext(cutBlock(ERP, '  function hanaApkBlock(){'), ctx);
  vm.runInContext(cutBlock(ERP, 'function hanaFixModal(){'), ctx);
  const tree = ctx.hanaFixModal();
  assert.ok(tree && tree.tag === 'div', '창이 안 그려진다');

  const texts = [];
  (function walk(n) {
    if (n == null) return;
    if (Array.isArray(n)) return n.forEach(walk);
    if (typeof n === 'string') { texts.push(n); return; }
    if (n.kids) walk(n.kids);
  })(tree);
  const all = texts.join(' ');
  assert.ok(all.indexOf('9.9.9') >= 0, '★ 판 번호가 화면에 안 나온다 — 새로 깐 것이 맞는지 못 견준다');
  assert.ok(all.indexOf('알림 접근 허용') >= 0, '알림 접근 허용을 안 알려 준다');
  assert.ok(all.indexOf('절전') >= 0, '★ 절전이 앱을 재운다는 것을 안 적으면 깔고도 문자가 안 온다');

  /* 닫혀 있을 때는 아무것도 안 그린다 — 늘 떠 있으면 화면을 가린다. */
  ctx.hanaFix = false;
  assert.strictEqual(ctx.hanaFixModal(), null, '★ 닫아도 창이 남는다');
});

/* ══════════ ② 열쇠가 죽으면 «자국»이 남아야 한다 ══════════ */

test('★★ 아는 폰인데 열쇠가 틀리면 서버가 자국을 남긴다', () => {
  const fn = bare(cutBlock(FN, 'async function requireHanaDevice(req, body) {'));
  assert.ok(fn.indexOf('lastReject') >= 0,
    '★ 열쇠가 죽으면 아무 자국도 안 남는다 — 화면이 「앱이 없다」와 「연결이 끊겼다」를 못 가른다');
  /* ⚠ 아무나 남기게 하면 안 된다. «그 폰이 실제로 등록되어 있을 때»만 적는다. */
  assert.ok(/device\.tokenHash\s*&&/.test(fn) || /if\s*\(\s*device\.tokenHash/.test(fn),
    '★ 모르는 폰까지 자국을 남긴다 — 아무나 남의 칸에 글을 쓸 수 있게 된다');
});

test('★ 다시 잘 들어오면 그 자국을 «지운다»', () => {
  const fn = bare(cutBlock(FN, 'async function requireHanaDevice(req, body) {'));
  assert.ok(/lastReject:\s*null/.test(fn),
    '★ 한 번 끊겼던 자국이 영영 남는다 — 다시 이어 놓아도 화면이 계속 붉으면 아무도 그 표를 안 믿는다');
});

test('★★ 그 자국이 화면까지 온다', () => {
  const st = bare(cutBlock(FN, 'if (action === "pairStatus") {'));
  /* ⚠ 「lastReject 라는 글자가 있다」로 겨누면 _lastReject 로 이름만 바꿔도 통과한다.
     «그 이름의 칸으로» 실려 나가는지를 본다. */
  assert.ok(/(^|[^\w$])lastReject\s*:/.test(st), '★ 서버는 적는데 화면에 안 보내 준다');
  const chip = bare(cutBlock(ERP, 'function hanaStatChip(){'));
  assert.ok(chip.indexOf('lastReject') >= 0, '★ 화면이 그 자국을 안 본다');
  assert.ok(chip.indexOf('연결이 끊겼') >= 0,
    '★ 끊긴 것을 「문자 0건」이라고만 하면 앱을 지웠다고 오해한다');
});

/* ══════════ ③ 취소 표가 살아남아야 한다 ══════════ */

test('★★ 폰으로 온 카드 «취소»가 대기함 기록에 남는다', () => {
  const ing = bare(cutBlock(FN, 'if (action === "ingest") {'));
  assert.ok(/cancel:\s*(!!\s*)?tx\.cancel/.test(ing),
    '★ 서버가 취소 표를 버린다 — 대기함에서 취소가 승인처럼 보인다');
});

test('★★ 붙여넣은 카드 «취소»도 마찬가지다 (두 길이 갈리면 안 된다)', () => {
  const pst = bare(cutBlock(FN, 'if (action === "ingestPaste") {'));
  assert.ok(/cancel:\s*(!!\s*)?tx\.cancel/.test(pst),
    '★ 붙여넣기 길만 취소를 버린다 — 같은 문자가 길에 따라 다르게 들어간다');
});

test('★★ 목록 답이 취소 표를 실어 보낸다', () => {
  const list = bare(cutBlock(FN, 'if (action === "list") {'));
  assert.ok(/cancel:\s*(x\.cancel\s*===\s*true|!!\s*x\.cancel|Boolean\(x\.cancel\))/.test(list),
    '★ 적어 두고도 안 보내 준다 — 화면의 cancel 은 늘 거짓이 된다');
});

test('★ 화면은 «서버가 준 그 표»를 쓴다 (스스로 만들어 내지 않는다)', () => {
  const imp = bare(cutBlock(ERP, 'async function importHanaSms(silent){'));
  assert.ok(/cancel:\s*!!x\.cancel/.test(imp),
    '★ 서버가 보낸 취소 표를 안 쓴다');
});
