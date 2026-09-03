'use strict';
/* 구성원 소개에 일반직원도 — 명부에서 당겨오기 + 「안 올림」 (대표 지시 2026-09-03)
 *   「구성원 소개에 일반직원도 이름과 직급을 바꿀 수 있게 연결해 달라」
 *   갈래는 「가 한목록에 / 나 갈라서 / 넣되 홈페이지엔 안 올림」 — 셋 다로 받았다.
 *
 * ★ 알아낸 것 (2026-09-03)
 *   · 명부(data/user_accounts)에 이름과 직급(title)이 32명 전원에게 있다.
 *     재직 11명 = 노무사 5 + 직원 6(사무장·차장·과장·대리·주임·사무직).
 *   · 「노무사/직원」 갈래는 «이미» 있었다(다른 세션, 2026-09-02).
 *   · 그런데 addMember 가 직책2 에 「공인노무사」를 박아 넣어, 직원을 넣어도
 *     공인노무사가 됐다 — 그것이 막고 있던 것이다.
 *
 * ★ 이 검사가 지키는 것
 *   ① 명부에서 «이름과 직급만» 가져온다 (주민번호·계좌·급여는 손도 안 댄다)
 *   ② 퇴사자는 고르는 목록에 안 뜬다
 *   ③ 직원을 넣어도 「공인노무사」가 박히지 않는다
 *   ④ 「안 올림」은 올리기·미리보기·할 일에서 «다» 빠진다
 *   ⑤ 명부를 «고치지 않는다»
 *
 * 실행: node --test tests/*.test.js
 * (이 환경의 node 는 --test 에 디렉터리 인자를 주면 죽는다. 반드시 glob 으로.)
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const R = path.join(__dirname, '..');
const RAW = fs.readFileSync(path.join(R, 'pu-home.html'), 'utf8');

function 알맹이(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}
const H = 알맹이(RAW);

function 함수(이름) {
  const i = H.search(new RegExp('(?:async )?function ' + 이름 + '\\('));
  assert.ok(i >= 0, '★ ' + 이름 + ' 을 못 찾았다');
  const j = H.indexOf('\nfunction ', i + 5);
  const k = H.indexOf('\nasync function ', i + 5);
  const 끝 = Math.min(j < 0 ? H.length : j, k < 0 ? H.length : k);
  return H.slice(i, 끝);
}

/* ══════ ① 명부에서 이름과 직급만 ══════ */
test('★★ 명부에서 «이름과 직급만» 가져온다 — 나머지는 읽지도 않는다', () => {
  /* 명부에는 주민번호(rrn)·계좌(accountNo)·급여(baseSalary)·주소가 함께 들어 있다.
     홈페이지는 손님이 보는 곳이라 한 번 새면 되돌릴 수 없다. */
  const s = 함수('staffFromRoster');
  assert.match(s, /title: *\(u && u\.title\)/, '★ 직급을 안 꺼낸다 — 당겨 넣을 것이 없다');
  ['rrn', 'accountNo', 'bankName', 'baseSalary', 'phone', 'address', 'birthDate', 'email']
    .forEach(function (칸) {
      assert.ok(s.indexOf(칸) < 0,
        '★★ 명부의 «' + 칸 + '» 를 꺼낸다 — 홈페이지 화면으로 새면 되돌릴 수 없다');
    });

  const 목록 = 함수('명부재직자');
  ['rrn', 'accountNo', 'baseSalary', 'phone', 'address'].forEach(function (칸) {
    assert.ok(목록.indexOf(칸) < 0, '★★ 고르는 창이 «' + 칸 + '» 를 만진다');
  });
  assert.match(목록, /name:|title:/, '★ 이름·직급을 안 들고 온다');
});

test('★★ 퇴사자는 고르는 목록에 «안 뜬다»', () => {
  /* 명부 32명 가운데 21명이 퇴사자다 — 섞이면 잘못 넣기 쉽다 */
  const s = 함수('명부재직자');
  assert.match(s, /!s\.left/, '★★ 퇴사자를 걸러 내지 않는다 — 21명이 섞여 뜬다');
  assert.match(s, /Array\.isArray\(App\.staff\)/,
    '★ 명부를 못 읽었을 때를 안 가린다 — 없는 목록을 지어내면 안 된다');
});

test('★ 이미 구성원인 사람은 «이미 있음»으로 표시한다 — 두 번 안 넣게', () => {
  const s = 함수('명부재직자');
  assert.match(s, /App\.members/, '★ 이미 있는지 안 본다');
  assert.match(함수('openRosterAdd'), /이미 있음/, '★ 화면에 표시하지 않는다');
  assert.match(함수('openRosterAdd'), /넣기/, '★ 넣는 단추가 없다');
});

/* ══════ ② 직책을 갈래에 맞게 ══════ */
test('★★ 직원을 넣어도 「공인노무사」가 박히지 않는다', () => {
  /* 이것이 원래 막고 있던 것이다 — addMember 가 누구를 넣어도 공인노무사로 만들었다. */
  const s = 함수('addFromRoster');
  assert.match(s, /'labor'/, '★ 갈래를 안 가린다');
  assert.match(s, /position2: *''/, '★★ 직원에게도 직책2 를 채운다 — 공인노무사가 박힌다');
  assert.match(s, /position1: *직급/, '★ 직원의 직급을 직책1 에 안 넣는다');

  /* 손으로 넣는 길도 박지 않는다 */
  const 손 = 함수('addMemberByHand');
  assert.ok(손.indexOf("'공인노무사'") < 0,
    '★★ 손으로 넣을 때 아직 「공인노무사」를 박는다');
});

test('★ 갈래 판정을 «한 곳에서만» 한다 — 두 곳에 두면 갈라진다', () => {
  const s = 함수('직급의갈래');
  assert.match(s, /memberKind\(/,
    '★ 갈래 판정을 새로 만들었다 — memberKind 하나만 쓸 것 (목록·거르개·편집칸이 그것을 쓴다)');
});

/* ══════ ③ 「안 올림」이 다 빠진다 ══════ */
test('★★ 「안 올림」은 «올리기»에서 빠진다', () => {
  const s = 함수('publishPeople');
  assert.match(s, /offSiteOf\(App\.members\[k\]\)/,
    '★★ 안 올림으로 표시한 사람이 홈페이지에 올라간다 — 표시가 아무 일도 안 한다');
});

test('★★ 「안 올림」은 «미리보기»에서도 빠진다 — 올릴 것과 같아야 한다', () => {
  const s = 함수('미리보기HTML');
  assert.match(s, /offSiteOf\(App\.members\[k\]\)/,
    '★★ 미리보기에는 나오는데 올리면 없다 — 화면과 올릴 것이 어긋난다');
});

test('★★ 「안 올림」은 «할 일»로 안 잡힌다', () => {
  /* 안 빼면 직원을 여섯 명 넣는 순간 할 일이 여섯 개 늘어난다.
     ★ 「남김」보다 «먼저» 봐야 한다 — 남김이 아니어도 안 올림이면 할 일이 아니다. */
  const s = 함수('needsAttentionRow');
  assert.match(s, /if \(r\.offSite\) return false;/,
    '★★ 안 올림인 사람이 할 일로 잡힌다 — 직원을 넣을수록 할 일이 늘어난다');
  const 안올림자리 = s.indexOf('r.offSite');
  const 남김자리 = s.indexOf('r.kept');
  assert.ok(안올림자리 >= 0 && 남김자리 >= 0 && 안올림자리 < 남김자리,
    '★ 「안 올림」을 「남김」보다 뒤에서 본다 — 남김이 아닌 사람이 할 일로 남는다');
});

test('★★ 「안 올림」을 켜고 끌 수 있고, 그것이 «저장»된다', () => {
  assert.match(H, /function offSiteOf/, '★ 안 올림 판정이 없다');
  assert.match(H, /function offSiteSet/, '★ 켜고 끄는 길이 없다');
  const 편집 = 함수('memberEdit');
  assert.match(편집, /offSiteSet\(true\)/, '★ 「안 올림」 단추가 없다');
  assert.match(편집, /offSiteSet\(false\)/, '★★ 켰다가 «되돌리는» 단추가 없다 — 못 끄면 갇힌다');
  assert.match(H, /offSite: *!!d\.offSite/, '★★ 저장하지 않는다 — 새로 고치면 사라진다');
  assert.match(함수('memberRows'), /offSite: offSiteOf\(m\)/, '★ 목록이 그것을 모른다');
  /* ⚠ 초안에 실어 오지 않으면 단추가 «늘 올림»으로 보이고, 저장할 때 false 로 덮어써진다.
       이빨 시험에서 드러났다: 초안에서 빼도 검사가 다 통과했다. */
  assert.match(함수('loadDraft'), /offSite: offSiteOf\(m\)/,
    '★★ 초안이 「안 올림」을 안 실어 온다 — 단추가 늘 「올림」으로 보이고, 저장하면 지워진다');
});

/* ══════ 편집칸이 «두 줄을 헛되게 안 쓴다» (대표 지적 2026-09-03 「1줄 또는 2줄로」) ══════ */
test('★★ 「올림/안 올림」이 «이름 줄»에 함께 있다 — 따로 두면 두 줄을 먹는다', () => {
  const s = 함수('memberEdit');
  /* 이름 줄(첫 .fldbar)이 끝나기 «전»에 올림/안올림 단추가 있어야 한다.
     ★ 값이 아니라 자리를 본다 — 라벨을 따로 세우면 라벨 한 줄 + 딱지 한 줄이 된다. */
  const 이름줄시작 = s.indexOf('>이름</label>');
  const 이름줄끝 = s.indexOf("+ '<input value=\"' + esc(d.name)", 이름줄시작);
  assert.ok(이름줄시작 >= 0 && 이름줄끝 > 이름줄시작, '★ 이름 줄을 못 찾았다');
  const 이름줄 = s.slice(이름줄시작, 이름줄끝);
  assert.match(이름줄, /offSiteSet\(false\)/,
    '★★ 「올림」 단추가 이름 줄 밖에 있다 — 라벨 한 줄 + 딱지 한 줄로 두 줄을 먹는다');
  assert.match(이름줄, /offSiteSet\(true\)/, '★★ 「안 올림」 단추가 이름 줄 밖에 있다');
  /* 따로 세운 라벨을 다시 만들지 않았나 */
  assert.ok(s.indexOf("<label>홈페이지에") < 0,
    '★★ 「홈페이지에」 라벨을 따로 다시 세웠다 — 그것이 한 줄을 더 먹는다');
});

test('★★ 비어 있는 「담당 업무」는 «한 줄»이다', () => {
  const s = 함수('memberEdit');
  /* 빈 칸 하나가 라벨 한 줄 + 빈 상자 한 줄로 두 줄을 먹고 있었다.
     ★ 규칙: 줄이 없으면 상자를 안 펴고, 「＋ 줄 추가」를 라벨 줄에 둔다. */
  assert.match(s, /업무\.length \? '<div class="car" id="dutyBox">' : '<div id="dutyBox" hidden>'/,
    '★★ 줄이 없어도 상자를 펴 놓는다 — 빈 상자가 한 줄을 먹는다');
  assert.match(s, /: '<button[^']*onclick="dutyAdd\(\)"/,
    '★★ 비어 있을 때 「＋ 줄 추가」가 라벨 줄에 없다 — 넣을 길이 사라지거나 줄이 늘어난다');
  assert.match(s, /업무\.length \? '<div class="add"/,
    '★ 빈 상자 안에도 「＋ 줄 추가」를 그린다 — 단추가 둘이 된다');
});

test('★ 목록에 「안 올림」이 보인다 — 왜 조용한지 알 수 있게', () => {
  const s = 함수('rowsHtml');
  assert.match(s, /r\.offSite \? '<span class="pill unposted">안 올림/,
    '★ 목록 딱지에 안 올림이 안 보인다 — 왜 할 일에 없는지 알 수 없다');
});

/* ══════ ④ 명부를 고치지 않는다 ══════ */
test('★★ 이 화면은 «직원 명부»를 고치지 않는다 — 급여·4대보험이 걸린 자료다', () => {
  /* 여기서 이름·직급을 바꾸면 홈페이지 쪽만 바뀐다. 명부는 손대지 않는다. */
  ['addFromRoster', 'addMemberByHand', 'offSiteSet', '명부재직자', 'openRosterAdd']
    .forEach(function (f) {
      const s = 함수(f);
      assert.ok(!/user_accounts|user_dir/.test(s),
        '★★ ' + f + ' 가 직원 명부를 만진다 — 급여·4대보험 자료다');
      assert.ok(!/data\//.test(s), '★★ ' + f + ' 가 data/* 를 만진다');
    });
});

test('★ 넣는다고 홈페이지에 올라가지 않는다', () => {
  ['addFromRoster', 'addMemberByHand'].forEach(function (f) {
    const s = 함수(f);
    assert.ok(!/PUBLISH_URL|올리기\(/.test(s),
      '★★ ' + f + ' 가 넣으면서 홈페이지에 올린다 — 되돌릴 틈이 없다');
  });
  assert.match(함수('addFromRoster'), /saveRecord\('member'/, '★ 우리 자료에 안 남긴다');
});

test('★ 「＋ 새 구성원」이 명부 창을 연다 — 손으로 치는 길은 그 안에 남는다', () => {
  assert.match(H, /function addMember\(\) \{ openRosterAdd\(\); \}/,
    '★ 새 구성원이 아직 손으로 치는 창을 연다');
  assert.match(함수('openRosterAdd'), /addMemberByHand\(\)/,
    '★★ 명부에 없는 분을 넣는 길이 사라졌다 — 지사장처럼 명부에 없는 분이 있다');
});

/* ══════════════════════════════════════════════════════════════════════════
   여기까지는 소스를 «글자로» 보는 검사다 — 부르는 자리가 있나, 단추가 있나.
   아래는 판정을 «돌려 본다».
   ★ 왜 필요한가: offSiteOf 를 「늘 false」로 바꿔 보면 위 검사가 «다» 통과한다.
     부르는 자리는 그대로 있으니까. 그러면 안 올리길 바란 사람이 조용히 올라간다.
   ══════════════════════════════════════════════════════════════════════════ */

/* 화면에서 함수 한 개를 꺼내 «실제로» 돌린다 */
function 꺼내돌리기(이름) {
  const src = 함수(이름);
  // eslint-disable-next-line no-new-func
  return new Function(src + LF + 'return ' + 이름 + ';')();
}
const LF = String.fromCharCode(10);

test('★★ 「안 올림」 판정이 «실제로» 갈라낸다 — 부르는 자리만 있어선 안 된다', () => {
  const offSiteOf = 꺼내돌리기('offSiteOf');
  assert.strictEqual(offSiteOf({ offSite: true }), true, '★★ 안 올림을 못 알아본다');
  assert.strictEqual(offSiteOf({ offSite: false }), false, '★ 올림을 안 올림으로 본다');
  assert.strictEqual(offSiteOf({}), false, '★ 정해 두지 않은 사람은 «올림»이어야 한다');
  /* ⚠ 자료가 없을 때 터지면 화면이 통째로 멎는다 */
  assert.strictEqual(offSiteOf(null), false, '★ 빈 자료에 터진다');
  assert.strictEqual(offSiteOf(undefined), false, '★ 빈 자료에 터진다');
});

test('★★ 「안 올림」인 사람은 올릴 목록에서 «빠진다» (걸러내기를 그대로 돌려서)', () => {
  const offSiteOf = 꺼내돌리기('offSiteOf');
  const 사람들 = {
    a: { name: '가노무사', offSite: false },
    b: { name: '나직원', offSite: true },
    c: { name: '다직원' }
  };
  /* 올리기·미리보기가 쓰는 «그 걸러내기»와 같은 모양 */
  const 올릴것 = Object.keys(사람들)
    .filter(function (k) { return !offSiteOf(사람들[k]); })
    .map(function (k) { return 사람들[k].name; });
  assert.deepStrictEqual(올릴것, ['가노무사', '다직원'],
    '★★ 안 올림인 사람이 올라가거나, 멀쩡한 사람이 빠졌다');
});
