'use strict';
/* 사번이 «사람 이름 자리»에 굳는 것 (대표 보고 2026-08-30 「004 번호 어떻게 된 것인가」)

   ★ 무엇이 있었나 — 옆줄 담당자 칸에 「김혜민」 옆에 「P-004」가 «따로» 생겼다.
     P-004 는 김혜민의 사번이다. 한 사람이 두 칸이 됐다.

   ★ 왜 — 업체·사무관리 자료의 담당자는 사번으로 적혀 있고(P-004), 이름으로 바꾸는
     표(ErpMatch.nameBySid)는 «늦게» 온다. 표가 오기 전에 바꾸려 하면 원래 코드가
     사번을 그대로 되돌려 준다(nameBySid[s] || s). 그 값이 표에 굳고 세션 내내 산다.
     ⚠ 저장된 자료는 깨끗하다 — 실측 2026-08-30: 명부 32명 모두 이름이 있고,
       회사 372곳·사무관리 99건의 담당자 사번이 전부 이름으로 바뀐다.

   ★ 여기서 못 박는 것
     ① 사번은 «쓰는 자리»에서 이름으로 바뀐다 (그리는 때에는 표가 늘 와 있다)
     ② 끝내 못 바꾸면 «빈 값» — 번호를 사람인 척 보여 주지 않는다
     ③ 사람 이름은 «안 건드린다» — 잘못 지우면 훨씬 나쁘다
     ④ 세 자리가 모두 그 길을 쓴다 — 회사 담당자 · 사무관리 부담당 · 옆줄
     ⑤ 표가 안 왔으면 사무관리 표를 «굳히지 않는다» (뿌리를 막는 자리)
     ⑥ ★ 실제로 그 상황을 만들어 «옆줄에 사번 칸이 안 생기는지» 본다

   ⚠ 글자·개수를 못 박지 않는다(docs/검사-못박지-않기.md). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const raw = fs.readFileSync(path.join(ROOT, 'pu-cards.html'), 'utf8').replace(/\r\n/g, '\n');
/* ⚠ 주석을 걷고 본다 — 잘 쓴 «설명»이 검사를 통과시키면 안 된다 */
const src = raw.replace(/\/\*[\s\S]*?\*\//g, ' ');

function fnBody(name) {
  const i = src.indexOf('\nfunction ' + name + '(');
  assert.ok(i >= 0, name + ' 를 찾을 수 없습니다');
  return src.slice(i, src.indexOf('\n}', i) + 2);
}

/* ── mbPerson 만 떼어 돌린다 ── */
function load(staff, nameBySid) {
  const ctx = {
    Object, String, RegExp,
    ErpMatch: {
      staff: staff || {}, nameBySid: nameBySid || {},
      _norm: s => String(s || '').trim().toLowerCase().replace(/\s/g, '')
    }
  };
  vm.createContext(ctx);
  const cut = (from, to) => {
    const i = raw.indexOf(from);
    assert.ok(i > 0, from + ' 를 찾지 못했습니다');
    return raw.slice(i, raw.indexOf(to, i));
  };
  vm.runInContext(cut('function mbStaffOf(name){', '\n/* 퇴사한 사람인가'), ctx);
  return ctx;
}
const STAFF = { '김혜민': { sid: 'P-004', name: '김혜민', status: 'active' } };
const SIDS = { 'P-004': '김혜민', 'P-007': '김동현' };

/* ══════ ① 바꾼다 ══════ */
test('★★ 사번은 «쓰는 자리»에서 이름으로 바뀐다', () => {
  const c = load(STAFF, SIDS);
  assert.equal(c.mbPerson('P-004'), '김혜민', '★ 사번이 그대로 남습니다 — 옆줄에 「P-004」 칸이 생깁니다');
  assert.equal(c.mbPerson('P-007'), '김동현');
});

/* ══════ ② 못 바꾸면 빈 값 ══════ */
test('★★ 끝내 못 바꾸면 «빈 값» — 번호를 사람인 척 보여 주지 않는다', () => {
  const c = load(STAFF, {});          /* 표가 아직 안 왔다 */
  assert.equal(c.mbPerson('P-004'), '',
    '★ 표가 없을 때 사번을 사람으로 내놓습니다 — 대표께서 「이게 누구지」로 시간을 쓰십니다');
  const c2 = load(STAFF, SIDS);
  assert.equal(c2.mbPerson('Z-999'), '', '★ 명부에 없는 사번을 사람으로 내놓습니다');
});

/* ══════ ③ 사람 이름은 안 건드린다 ══════ */
test('★★ 사람 이름은 «안 건드린다» — 잘못 지우면 훨씬 나쁘다', () => {
  const c = load(STAFF, SIDS);
  assert.equal(c.mbPerson('김혜민'), '김혜민', '★ 아는 이름을 지웠습니다');
  assert.equal(c.mbPerson('박한별'), '박한별', '★ 명부에 아직 없는 이름을 지웠습니다');
  assert.equal(c.mbPerson('  김혜민  '), '김혜민', '앞뒤 빈칸을 안 걷습니다');
  /* 사번 «꼴»이 아니면 무엇이든 그대로 */
  for (const n of ['A팀', '2팀장', '김동현(노무사)', 'P-0004-1']) {
    assert.equal(c.mbPerson(n), n, '★ 사번이 아닌 「' + n + '」을 건드렸습니다');
  }
  assert.equal(c.mbPerson(''), '', '빈 값은 빈 값');
  assert.equal(c.mbPerson(null), '', 'null 은 빈 값');
});

/* ══════ ④ 세 자리가 그 길을 쓴다 ══════ */
test('★★ 회사 담당자·사무관리 부담당·옆줄이 «모두» 그 길을 쓴다', () => {
  assert.match(fnBody('mbWhoIndex'), /const who = mbPerson\(rec\.main\)/,
    '★ 회사 담당자가 사번인 채로 표에 들어갑니다');
  assert.match(fnBody('mbSubsOfRow'), /mbPerson\(s\)/,
    '★ 사무관리 부담당이 사번인 채로 나옵니다');
  assert.match(fnBody('mbWhoList'), /mbPerson\(w\)\s*===\s*w/,
    '★ 옆줄에 사번 칸이 그대로 생깁니다 (마지막 그물이 없습니다)');
});

/* ══════ ⑤ 뿌리 ══════ */
test('★★ 표가 안 왔으면 사무관리 표를 «굳히지 않는다» — 굳으면 세션 내내 간다', () => {
  const fn = fnBody('mbBizSubsLoad');
  assert.match(fn, /nameBySid/, '★ 표가 왔는지 안 봅니다');
  const i = fn.indexOf('nameBySid');
  assert.match(fn.slice(i, i + 220), /return;/,
    '★ 표가 없어도 그냥 만듭니다 — 사번이 그대로 굳습니다');
  assert.match(fn.slice(i, i + 220), /setTimeout/,
    '★ 다시 해 볼 길이 없습니다 — 한 번 건너뛰면 영영 안 만들어집니다');
});

/* ══════ ⑥ 실제로 그 상황을 만들어 본다 ══════ */
test('★★ 표가 늦게 와도 옆줄에 «사번 칸»이 안 생긴다 — 실제로 돌려 본다', () => {
  /* mbWhoList 가 쓰는 것만 최소로 갖춘 자리 */
  const ctx = {
    Object, String, Number, Math, RegExp, Array, JSON, Date,
    ErpMatch: {
      staff: {
        '김혜민': { sid: 'P-004', name: '김혜민', status: 'active', ord: 4 },
        '박한별': { sid: 'P-003', name: '박한별', status: 'active', ord: 3 }
      },
      nameBySid: { 'P-004': '김혜민', 'P-003': '박한별' },
      _norm: s => String(s || '').trim().toLowerCase().replace(/\s/g, '')
    },
    /* ★ 사번이 «그대로 굳은» 표를 흉내 낸다 — 늦게 온 경우가 바로 이 모양이다 */
    _mbOwner: {},
    mbWhoTally: () => ({ cnt: { '김혜민': 4, 'P-004': 2 }, un: {}, none: 0 }),
    mbWhoIndex: () => ({ byAddr: { 'a@b.co': 'P-004', 'c@d.co': '박한별' } }),
    mbMyName: () => '',
    mbWhoPosOf: () => 999,
    mbWhoOrd: (w) => 0,
    MB_WHO_NA: '@?'
  };
  vm.createContext(ctx);
  const cut = (from, to) => {
    const i = raw.indexOf(from);
    return raw.slice(i, raw.indexOf(to, i));
  };
  vm.runInContext(cut('function mbStaffOf(name){', '\n/* 퇴사한 사람인가'), ctx);
  vm.runInContext('function mbRetired(name){ const s=mbStaffOf(name); return !!(s && s.status===\'retired\'); }', ctx);
  vm.runInContext(cut('function mbWhoList(){', '\nfunction mbWhoNoneCount'), ctx);

  const names = ctx.mbWhoList().map(w => w.name);
  assert.ok(names.indexOf('P-004') < 0,
    '★ 옆줄에 「P-004」 칸이 그대로 생깁니다: ' + names.join(', '));
  assert.ok(names.indexOf('김혜민') >= 0, '★ 김혜민 칸이 사라졌습니다: ' + names.join(', '));
  assert.ok(names.indexOf('박한별') >= 0, '★ 박한별 칸이 사라졌습니다: ' + names.join(', '));
});
