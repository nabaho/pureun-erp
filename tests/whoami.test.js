/* 모든 프로그램 상단 우측에 「지금 로그인한 사람」 (2026-08-16 대표 지시)
   대표 보고: "현재 권형하로 로그인했는데 기금통합운영은 최기운으로 되어 있다."
   ★ 원인은 포털이 주소로 이름을 넘기고, 그 앱이 «주소를 믿어» 명부를 안 본 것이었다.
     주소는 「타일을 누른 순간의 사진」이라 사람이 바뀌어도 안 바뀐다. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'js', 'pu-whoami.js'), 'utf8');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
// 주석을 걷어낸 «코드만» — 글자를 셀 때 제 설명에 걸리지 않게 한다
const bare = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

function boot(opts) {
  opts = opts || {};
  const el = { innerHTML: '', style: {} };
  const added = [];                       // 화면에 «붙인» 것 — 표가 떴는지 이걸로 센다
  const g = {
    document: {
      querySelector: () => (opts.hasSlot ? el : null),
      createElement: () => ({ style: {}, remove() {} }),
      body: { appendChild(x) { added.push(x); }, contains: () => true }
    },
    firebase: { auth: () => ({ onAuthStateChanged() {} }), database: () => null },
    setInterval: () => 1, clearInterval: () => {}, console,
    String, Object, Array, Promise
  };
  g.window = g;
  vm.createContext(g);
  vm.runInContext(SRC, g);
  g._el = el;
  g._added = added;
  return g;
}

test('이메일에서 사번을 뽑는다', () => {
  const g = boot();
  assert.strictEqual(g.PuWhoami._emailToSid('p001@pureun.kr'), 'P001');
  assert.strictEqual(g.PuWhoami._emailToSid('A005@PUREUN.KR'), 'A005');
  assert.strictEqual(g.PuWhoami._emailToSid(''), '');
  assert.strictEqual(g.PuWhoami._emailToSid('이름없음'), '');
});

test('명부가 어떤 모양으로 와도 편다', () => {
  /* {v:[…]} 로 싸여 오기도 하고 객체표로 오기도 한다 */
  const g = boot();
  /* ※ 길이만 보면 안 된다 — 안 편 채로도 길이가 1 이 나올 수 있다(껍데기 하나).
     «안에 사람이 들어 있는지» 를 본다. */
  const L = g.PuWhoami._toList;
  assert.strictEqual(L([{ sid: 'P001' }])[0].sid, 'P001');
  assert.strictEqual(L({ v: [{ sid: 'P001' }] })[0].sid, 'P001', '{v:[…]} 를 못 폈다');
  const obj = L({ a: { sid: 'P001' }, b: { sid: 'P005' } });
  assert.strictEqual(obj.length, 2);
  assert.strictEqual(obj[0].sid, 'P001');
  assert.strictEqual(L(null), null);
});

test('같은 사번이 겹치면 재직자를 먼저 본다', () => {
  /* 겹친 채로 첫 사람을 집으면 엉뚱한 이름이 뜬다 (포털과 같은 규칙) */
  const g = boot();
  const got = g.PuWhoami._pick([
    { sid: 'P005', name: '옛사람', status: 'retired' },
    { sid: 'P005', name: '박재원', status: 'active' }
  ], 'P005');
  assert.strictEqual(got.name, '박재원');
});

test('이름 · 직책 · 사번을 적는다', () => {
  /* 대표 결정 — 사번까지 있어야 남의 계정으로 들어갔을 때 그 자리에서 알아챈다 */
  const g = boot();
  assert.strictEqual(g.PuWhoami._text({ name: '권형하', title: '대표노무사', sid: 'P001' }),
    '권형하 대표노무사 · P-001');
});

test('이름을 아직 못 찾았으면 이메일이라도 보여 준다', () => {
  /* 빈 자리가 뜨는 것보다 낫다 — 명부를 읽는 동안 잠깐이다 */
  const g = boot();
  assert.strictEqual(g.PuWhoami._text({ name: '', email: 'p001@pureun.kr', sid: 'P001' }),
    'p001@pureun.kr · P-001');
});

test('로그아웃하면 아무것도 안 적는다', () => {
  const g = boot();
  assert.strictEqual(g.PuWhoami._text(null), '');
});

test('자리를 정해 주면 그 자리에 그린다', () => {
  const g = boot({ hasSlot: true });
  g.PuWhoami.mount('#topuser');
  g.PuWhoami._resolve({ email: 'p001@pureun.kr' });
  assert.ok(/P-001/.test(g._el.innerHTML), '자리에 안 그렸다: ' + g._el.innerHTML);
});

test('「우리가 그린다」고 하면 표를 «정말» 안 띄운다', () => {
  /* 두 곳에 뜨면 어느 것이 맞는지 사람이 알 수 없다.
     ※ 돌려주는 값만 보면 안 된다 — 화면에 «붙였는지» 를 센다. */
  const g = boot();
  g.PuWhoami.mount(false);
  g.PuWhoami._resolve({ email: 'p001@pureun.kr' });
  assert.strictEqual(g._added.length, 0, '표를 두 번 띄웠다');
});

test('아무 말도 안 하면 오른쪽 위에 저절로 붙는다', () => {
  /* 이름 자리가 없는 다섯 앱(명함첩·급여데이터함·이력관리·취업규칙·급여관리)이 이 길로 나온다 */
  const g = boot();
  g.PuWhoami._resolve({ email: 'p001@pureun.kr' });
  assert.strictEqual(g._added.length, 1, '아무 데도 안 붙었다');
});

/* ── 주소를 믿지 않는다 ── */
test('포털이 주소로 이름을 안 넘긴다', () => {
  /* ★ 넘기는 쪽을 없애야 근본이다 — 두 곳에서 알아내면 언젠가 어긋난다.
     덤: 직원 이름이 주소창·방문기록·공유 링크에 안 남는다. */
  const e = bare(read('enter.html'));
  assert.strictEqual(/'&user=' \+ encodeURIComponent/.test(e), false, '아직 주소로 이름을 넘긴다');
});

test('기금관리가 주소의 이름을 안 믿는다', () => {
  const f = bare(read('fund.html'));
  assert.strictEqual(/qp\('user'\)/.test(f), false, '아직 주소에서 이름을 읽는다');
});

test('업무관리가 주소의 이름을 안 믿는다', () => {
  const w = bare(read('work.html'));
  assert.strictEqual(/qp\('user'\)/.test(w), false, '아직 주소에서 이름을 읽는다');
});

test('업무관리가 이 기기에 남은 앞사람 사번을 안 쓴다', () => {
  /* localStorage 의 work_me_sid 를 먼저 보면 다음 사람이 앞사람으로 잡힌다.
     ★ 기록의 작성자가 이 값으로 남는다 — 틀리면 «남의 이름으로 기록» 된다. */
  const w = bare(read('work.html'));
  assert.strictEqual(/work_me_sid/.test(w), false);
});

/* ── 권한을 주소로 정하지 않는다 ── */
test('주소에 role=대표 를 붙여도 관리자가 되지 않는다', () => {
  /* ★ 전에는 둘 다 주소를 봤다 — 주소 끝에 &role=대표 만 붙이면 누구든 총괄이었다 */
  const f = bare(read('fund.html'));
  const w = bare(read('work.html'));
  assert.strictEqual(/qp\('role'\)/.test(f), false, '기금관리가 아직 주소로 권한을 정한다');
  assert.strictEqual(/qp\('role'\)/.test(w), false, '업무관리가 아직 주소로 권한을 정한다');
});

/* ── 어디에 싣고 어디에 안 싣나 ── */
const NEEDS = ['pu-erp.html', 'pu-cards.html', 'pu-photos.html', 'pu-paydata.html', 'fund.html',
  'work.html', 'kcareer.html', 'rules.html', 'gov-consulting.html', 'payroll-os.html'];
const MUSTNOT = ['enter.html', 'sign.html', 'ieum-view.html'];

test('로그인이 필요한 프로그램 열 곳에 모두 실려 있다', () => {
  const miss = NEEDS.filter((f) => !/<script src="js\/pu-whoami\.js/.test(read(f)));
  assert.deepStrictEqual(miss, [], '안 실린 프로그램: ' + miss.join(', '));
});

test('로그인 화면·공개 화면에는 싣지 않는다', () => {
  /* 로그인 화면에는 아직 「누구」가 없고, 공개 화면은 로그인 없이 보는 자리다 */
  const wrong = MUSTNOT.filter((f) => /<script src="js\/pu-whoami\.js/.test(read(f)));
  assert.deepStrictEqual(wrong, [], '실리면 안 되는데 실린 화면: ' + wrong.join(', '));
});

test('이미 이름을 그리는 앱은 표를 끈다', () => {
  ['pu-erp.html', 'pu-photos.html', 'gov-consulting.html'].forEach(function (f) {
    assert.strictEqual(/PuWhoami\.mount\(false\)/.test(read(f)), true, f + ' 가 표를 두 번 띄운다');
  });
});

test('이름 자리가 있는 앱은 그 자리를 알려 준다', () => {
  ['fund.html', 'work.html'].forEach(function (f) {
    assert.strictEqual(/PuWhoami\.mount\('#topuser'\)/.test(read(f)), true, f + ' 가 자리를 안 알려 준다');
  });
});
