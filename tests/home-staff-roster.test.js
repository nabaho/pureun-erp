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
