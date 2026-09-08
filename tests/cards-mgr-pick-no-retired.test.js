/* 담당 «고르개»에서 퇴사자를 뺀다 (대표 지시 2026-09-08)
   「퇴사자는 모두 제외시켜라. 푸른이알피의 담당자중에 퇴사자는 모두 제외시켜라」

   ■ 무엇이 문제였나
   기업정보함 위쪽 「담당 전체」 목록에 **퇴사한 사람이 그대로 서 있었다.**
   목록은 명함에 붙어 있는 담당 이름을 모아 만드는데, 계약이 끝나도 그때의 담당
   이름은 자료에 남기 때문이다. 옆줄 「담당자별 (직원)」도 같았다.

   ★ 못 박는 것
     ① 잣대는 `mbRetired` «하나»다 — 명부(data/user_dir)의 status==='retired'.
        메일함이 2026-08-26 에 못 박은 그 규칙을 그대로 쓴다. 두 벌로 만들지 않는다.
     ② **휴직은 퇴사가 아니다** — 돌아오는 사람이라 목록에 남는다.
     ③ **명부에 없는 이름도 안 뺀다** — 기업정보에 손으로 적어 둔 이름일 수 있고,
        모른다고 지우면 그 명함을 담당으로 찾을 길이 사라진다.
     ④ **지금 골라 둔 이름은 퇴사자여도 남긴다.** 목록에서 사라지면 걸어 둔 조건을
        풀 길이 없어 그 화면에 갇힌다(2026-08-29 「0건에서 못 빠져나온다」).
     ⑤ 줄에 붙은 담당 «딱지»는 그대로다. 그때 누가 맡았는지는 «사실»이다 —
        빼는 것은 「고를 수 있는 이름」뿐이다.
     ⑥ 위 목록과 옆줄이 «같은 잣대»를 쓴다. 한쪽만 빼면 「어디는 되고 어디는
        안 되나」가 된다.

     node --test tests/cards-mgr-pick-no-retired.test.js */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'pu-cards.html'), 'utf8').split('\r\n').join('\n');

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

/* 명부 — 대표 화면에 있던 갈래를 그대로 담는다 */
const STAFF = {
  '권형하': { sid: 'P-001', name: '권형하', status: 'active', ord: 10 },
  '김보람': { sid: 'P-003', name: '김보람', status: 'active', ord: 30 },
  '박성수': { sid: 'P-007', name: '박성수', status: 'retired', ord: 70 },
  '임혜미': { sid: 'P-009', name: '임혜미', status: 'retired', ord: 90 },
  '박지호': { sid: 'P-011', name: '박지호', status: 'leave', ord: 110 }   /* 휴직 */
};

/* 잣대 셋을 통째로 떠서 «돌린다» — 글자만 찾으면 거르개를 꺼 버려도 통과한다 */
function load(cur) {
  const ctx = {
    console, Object, String, Number, Array,
    state: { erpMgr: cur || '', owner: cur || '' },
    ErpMatch: { staff: STAFF, _norm: s => String(s == null ? '' : s).trim() }
  };
  vm.createContext(ctx);
  vm.runInContext([fnBody('mbStaffOf'), fnBody('mbRetired'), fnBody('nonRetiredPicks')].join('\n'), ctx);
  return ctx;
}

/* ── ①②③ 잣대 ── */

test('★★★ 퇴사자는 빠지고, 재직자는 남는다', () => {
  const c = load('');
  assert.equal(c.nonRetiredPicks(['권형하', '박성수', '김보람', '임혜미'], '').join(','),
    '권형하,김보람', '★ 퇴사자가 목록에 남아 있다 — 대표가 지적한 그 화면이다');
});

test('★★★ «휴직»은 퇴사가 아니다 — 돌아오는 사람이다', () => {
  const c = load('');
  assert.ok(c.nonRetiredPicks(['박지호'], '').indexOf('박지호') >= 0,
    '★★ 휴직자를 퇴사자로 뺐다 — 돌아왔을 때 그 사람 명함을 담당으로 못 찾는다');
  assert.equal(c.mbRetired('박지호'), false, '★ 휴직을 퇴사로 본다');
});

test('★★★ 명부에 «없는» 이름은 안 뺀다 — 손으로 적어 둔 담당일 수 있다', () => {
  const c = load('');
  assert.ok(c.nonRetiredPicks(['모르는사람'], '').indexOf('모르는사람') >= 0,
    '★★ 모르는 이름을 지웠다 — 그 명함을 담당으로 찾을 길이 사라진다');
  assert.equal(c.mbRetired('모르는사람'), false);
  assert.equal(c.mbRetired(''), false, '★ 빈 이름을 퇴사자로 본다');
});

/* ── ④ 갇히지 않는다 ── */

test('★★★ 지금 골라 둔 이름이 퇴사자면 «그 하나»는 남는다 — 풀 길이 있어야 한다', () => {
  const c = load('박성수');
  const out = c.nonRetiredPicks(['권형하', '박성수', '임혜미'], '박성수');
  assert.equal(out.join(','), '권형하,박성수',
    '★★★ 걸어 둔 담당이 목록에서 사라졌다 — 조건을 풀 길이 없어 그 화면에 갇힌다');
  /* 다른 퇴사자는 그래도 빠진다 — 「하나만 남긴다」가 「다 남긴다」가 되면 안 된다 */
  assert.ok(out.indexOf('임혜미') < 0, '★ 고르지도 않은 퇴사자까지 남았다');
});

test('★★ 아무것도 안 골랐으면 퇴사자는 하나도 안 남는다', () => {
  const c = load('');
  ['', null, undefined].forEach(v => {
    assert.equal(c.nonRetiredPicks(['박성수', '임혜미'], v).length, 0,
      '★ 고른 것이 없는데(' + String(v) + ') 퇴사자가 남았다');
  });
});

test('★ 빈 목록·없는 목록에도 터지지 않는다', () => {
  const c = load('');
  assert.equal(c.nonRetiredPicks([], '').length, 0);
  assert.equal(c.nonRetiredPicks(null, '').length, 0, '★ 목록이 없으면 터진다');
  assert.equal(c.nonRetiredPicks(undefined, '').length, 0);
});

/* ── ⑥ 두 고르개가 같은 잣대 ── */

test('★★★ 「담당 전체」 목록이 거르개를 «지나서» 만들어진다', () => {
  const fn = fnBody('renderPCTable');
  const at = fn.indexOf('const mgrs = ');
  assert.ok(at > 0, '★ 담당 목록을 만드는 자리를 못 찾았다');
  const seg = fn.slice(at, fn.indexOf('mgrSel.value', at));
  assert.match(seg, /nonRetiredPicks\(/,
    '★★★ 퇴사자를 안 뺀다 — 대표가 지적한 그 목록이 그대로다');
  assert.match(seg, /state\.erpMgr\)/,
    '★★ 지금 고른 이름을 안 넘긴다 — 퇴사자를 골라 둔 채로는 풀 길이 없어진다');
  /* 남겨 둔 퇴사자는 왜 남았는지 보인다 */
  assert.match(fn.slice(at), /mbRetired\(name\) \? '🚪 ' : ''/,
    '★ 남겨 둔 퇴사자에 표시가 없다 — 왜 혼자 있는지 알 수 없다');
});

test('★★★ 옆줄 「담당자별 (직원)」도 «같은 잣대»를 쓴다', () => {
  const fn = fnBody('renderPCSide');
  const at = fn.indexOf('const owners=');
  assert.ok(at > 0, '★ 옆줄 담당자 목록 자리를 못 찾았다');
  const seg = fn.slice(at, fn.indexOf('if (!owners.length)', at));
  assert.match(seg, /nonRetiredPicks\(/, '★★★ 옆줄에는 퇴사자가 그대로 남는다');
  assert.match(seg, /state\.owner\)/, '★★ 지금 고른 이름을 안 넘긴다');
});

/* ── ⑤ 줄에 붙은 딱지는 «사실»이라 그대로 ── */

test('★★★ 담당 «딱지»는 안 지운다 — 그때 누가 맡았는지는 사실이다', () => {
  /* 표의 담당 칸을 그리는 자리는 ErpMatch.mgrs 를 «그대로» 쓴다.
     여기까지 거르면 「담당이 비어 있는 줄」이 되어, 누가 맡았던 곳인지 영영 모른다. */
  const hits = SRC.split('\n')
    .map((ln, i) => [i + 1, ln])
    .filter(([, ln]) => /ErpMatch\.mgrs\(it\)/.test(ln));
  assert.ok(hits.length >= 3, '★ mgrs 를 쓰는 자리가 줄었다 (' + hits.length + '곳)');
  const badge = hits.filter(([, ln]) => /const (all|_all) = ErpMatch\.mgrs\(it\)/.test(ln));
  assert.ok(badge.length >= 2, '★ 딱지를 그리는 자리를 못 찾았다');
  badge.forEach(([n, ln]) => assert.ok(!/nonRetiredPicks|mbRetired/.test(ln),
    '★★★ ' + n + '줄 — 담당 딱지까지 걸렀다. 계약이 끝난 곳의 담당이 빈칸이 된다'));
});

test('★★ 거르는 것은 «고르개»뿐 — 목록을 실제로 좁히는 자리는 안 건드린다', () => {
  /* state.erpMgr 로 명함을 거르는 자리(listItems)는 그대로여야 한다.
     여기에 퇴사자 거르개를 넣으면 퇴사자 담당 명함이 화면에서 통째로 사라진다. */
  const i = SRC.indexOf('if (state.erpMgr && !ErpMatch.mgrs(it).includes(state.erpMgr)) return false;');
  assert.ok(i > 0, '★ 담당으로 거르는 자리가 바뀌었다 — 함께 살펴볼 것');
  const line = SRC.slice(SRC.lastIndexOf('\n', i), SRC.indexOf('\n', i));
  assert.ok(!/nonRetiredPicks|mbRetired/.test(line),
    '★★★ 거르는 자리에 퇴사자 잣대가 들어갔다 — 퇴사자가 맡던 명함이 통째로 사라진다');
});

/* ── 잣대를 두 벌로 만들지 않았는가 ── */

test('★★ 퇴사 판정은 앱 안에 «한 곳»뿐이다', () => {
  const n = (SRC.match(/status === 'retired'|status *=== *"retired"/g) || []).length;
  assert.equal(n, 1,
    '★★ 퇴사 판정이 ' + n + '곳이다. mbRetired 한 곳만 두어야 한다 — '
    + '두 벌이 되면 한쪽만 고쳐져 「메일함에서는 빠지는데 목록에는 남는다」가 된다');
});
