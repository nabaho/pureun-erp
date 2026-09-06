/* 예산·집행 · 변경 기록 · 전체 백업 · 담당 확인
 *
 * 대표 검토 2026-08-24 ⑥⑧⑨⑩:
 *   ⑥ 「차기연도 사업계획·예산 수립」 결과를 넣을 곳이 없다
 *   ⑧ 노동청·공단에 내는 숫자인데 누가 언제 고쳤는지 안 남는다
 *   ⑨ 통째로 내보낼 길이 없다
 *   ⑩ 로그인하면 42개가 모두 열려 있다
 *
 * ⚠ 이 저장소는 통째로 github.io 로 공개된다 — 실제 이름·금액 금지. 여기 자료는 전부 가짜다.
 *
 * 지켜야 하는 것
 *  ① 예산은 사람이 정하고 실적은 «장부가 말한다» — 실적 칸은 못 고친다
 *  ② 기록은 «곁다리»다 — 기록이 실패해도 하던 일이 막히면 안 된다
 *  ③ 담당이 아니어도 «막지» 않는다 — 작은 사무소라 서로 대신 봐 준다. 묻기만 한다
 *  ④ 통째로 덮어쓰는 단추는 두지 않는다 — 잘못 누르면 42개가 한 번에 날아간다
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'fund.html'), 'utf8');

function grabFn(name) {
  const i = SRC.indexOf('function ' + name + '(');
  assert.ok(i >= 0, 'fund.html 에 함수가 없다: ' + name);
  let d = 0, on = false;
  for (let j = i; j < SRC.length; j++) {
    if (SRC[j] === '{') { d++; on = true; }
    else if (SRC[j] === '}') { d--; if (on && !d) return SRC.slice(i, j + 1); }
  }
  throw new Error('함수 끝을 못 찾음: ' + name);
}
function grabDecl(name) {
  const i = SRC.indexOf('var ' + name + '=');
  assert.ok(i >= 0, 'fund.html 에 상수가 없다: ' + name);
  let d = 0, on = false;
  for (let j = SRC.indexOf('=', i); j < SRC.length; j++) {
    const c = SRC[j];
    if (c === '{' || c === '[') { d++; on = true; }
    else if (c === '}' || c === ']') { d--; if (on && !d) return SRC.slice(i, j + 1) + ';'; }
  }
  throw new Error('상수 끝을 못 찾음: ' + name);
}

/* ══════ ⑥ 예산 ══════ */
function bcalc() {
  const box = {};
  new Function([grabFn('num'), grabFn('budgetLine'), 'this.f=budgetLine;'].join('\n')).call(box);
  return box.f;
}

test('한 줄 계산 — 집행률·남은 것', () => {
  const L = bcalc();
  const a = L(10000000, 7500000);
  assert.equal(a.rate, 75, '집행률');
  assert.equal(a.rest, 2500000, '남은 것');

  const b = L(10000000, 12000000);
  assert.equal(b.rate, 120, '넘게 쓰면 100 을 넘는다');
  assert.equal(b.rest, -2000000, '남은 것이 음수가 된다');

  const c = L(0, 3000000);
  assert.equal(c.rate, null, '예산이 0 이면 집행률은 «모른다» — 0 이나 무한이 아니다');
  assert.equal(c.rest, -3000000);

  assert.equal(L(3000000, 1000000).rate, 33.3, '소수 한 자리까지');
  assert.equal(L('', '').plan, 0, '빈 값은 0 으로');
});

test('실적은 장부에서 온다 — 손으로 못 고친다', () => {
  const v = grabFn('budgetView');
  /* 예산 칸만 input 이어야 한다. 실적까지 고칠 수 있으면 집행률이 곧 의미가 없어진다 */
  assert.match(v, /onchange="budgetSet\(/, '예산을 못 넣는다');
  const acts = v.match(/W\(L\.act\)/g) || [];
  assert.ok(acts.length >= 1, '실적을 안 보여 준다');
  assert.ok(!/onchange="[^"]*L\.act|budgetSet\([^)]*act/.test(v), '실적 칸을 고칠 수 있게 두었다');
});

test('출연금 실적은 별지15호와 «같은 목록»에서 센다', () => {
  const a = grabFn('budgetActual');
  assert.match(a, /bfMovesOf\(journalOf\(arr\)/, '따로 세면 예산서와 보고서가 어긋난다');
  assert.match(a, /b\.kind==='employer'\|\|b\.kind==='other'/, '⑬+⑮ 만 출연금이다');
});

test('예산 항목이 실적 이름과 짝이 맞는다', () => {
  const box = {};
  new Function([grabDecl('BUDGET_ROWS'), 'this.R=BUDGET_ROWS;'].join('\n')).call(box);
  const act = grabFn('budgetActual');
  box.R.forEach(g => g[2].forEach(r => {
    assert.ok(act.includes(r[2] + ':'), 'budgetActual 이 안 만드는 값을 쓰려 한다: ' + r[2]);
    assert.ok(r[0].startsWith(g[0] + '_'), '저장 칸 이름이 묶음과 안 맞는다: ' + r[0]);
  }));
  assert.equal(box.R.length, 2, '수입·지출 두 묶음');
});

test('목적사업에서 가져올 때 대부는 뺀다', () => {
  const b = grabFn('budgetFromWelfare');
  assert.match(b, /category==='대부사업'\) return/, '대부는 자산이라 목적사업비가 아니다');
  assert.match(b, /confirmM\(/, '말없이 덮어쓰면 안 된다 — 협의회가 정한 숫자다');
  assert.match(b, /budgetSet\('exp_purpose'/, '목적사업비 칸에 넣어야 한다');
});

test('예산 화면이 결산 하위 탭에 걸려 있다', () => {
  assert.match(SRC, /\['budget','예산·집행'\]/, '하위 탭이 없다');
  assert.match(SRC, /case 'budget':\s*return budgetView/, '골라도 안 그려진다');
  assert.ok(SRC.includes("'close.budget':{t:"), 'ⓘ 설명이 등록되지 않았다');
});

/* ══════ ⑧ 변경 기록 ══════ */
test('기록은 곁다리다 — 실패해도 하던 일을 막지 않는다', () => {
  const a = grabFn('_audit');
  assert.match(a, /try\{/, '기록이 터지면 저장까지 막힌다');
  assert.match(a, /catch\(e\)\{\}/, '기록 실패를 삼켜야 한다');
  assert.ok(!/\.then\(/.test(a), '기록을 기다리면 저장이 그만큼 늦어진다');
  assert.match(a, /by:\(S\.user\|\|'\?'\)/, '누가 했는지 안 남는다');
  assert.match(a, /slice\(0,300\)/, '긴 글이 통째로 들어가면 기록이 자료보다 커진다');
});

test('노동청·공단에 나가는 숫자가 바뀌는 자리를 남긴다', () => {
  [['saveInfo', '기금 정보'], ['lockClosing', '결산 확정'], ['unlockClosing', '결산 확정 해제'],
   ['monthLockSet', '월마감'], ['saveLoan', '대부'], ['delLoan', '대부 삭제']].forEach(([fn, what]) => {
    assert.match(grabFn(fn), /_audit\(/, what + ' 이 기록에 안 남는다: ' + fn);
  });
});

test('자주 일어나는 일은 «안» 남긴다 — 중요한 것이 파묻힌다', () => {
  ['approveTxn', 'setTxnAcct', 'budgetSet', 'loanPaySet', 'sySet'].forEach(fn => {
    assert.ok(!/_audit\(/.test(grabFn(fn)), '너무 자주 일어나는 일을 기록한다: ' + fn);
  });
});

test('기금 정보 기록에 «어느 칸»을 고쳤는지 남는다', () => {
  const sv = grabFn('saveInfo');
  assert.match(sv, /FIELDS\.filter\(function\(c\)\{ return patch\.hasOwnProperty\(c\[0\]\)/,
    '무엇을 고쳤는지 안 남으면 되짚을 수가 없다');
  assert.match(sv, /_audit\(_fid,'기금 정보 저장'/, '');
});

test('기록 보기는 최근 것만 읽는다', () => {
  const o = grabFn('openAudit');
  assert.match(o, /limitToLast\(80\)/, '통째로 읽으면 해가 갈수록 무거워진다');
  assert.ok(SRC.includes("'audit.log':{t:"), 'ⓘ 설명이 등록되지 않았다');
  assert.ok(SRC.includes('onclick="openAudit()"'), '기록을 볼 단추가 없다');
});

/* ══════ ⑨ 전체 백업 ══════
 * 2026-09-02: 백업 단추를 사이드바 메뉴(nav-backup)에서 상단 ⚙〈백업·복구〉
 * 모달(toolsbtn→showBackup())로 옮겼다 — 화면으로 실제로 그려서 여닫히는지
 * 보는 검사는 fund-erp/tools/check_backup.js 쪽에 있다. 여기서는 여전히
 * 지켜야 할 «규칙»(통째로 덮어쓰는 길이 없다 / 메뉴 드래그 순서에 안 섞인다)
 * 만 값이 아니라 규칙으로 확인한다.
 */
test('통째로 덮어쓰는 단추는 두지 않는다', () => {
  const e = grabFn('exportAll');
  assert.match(e, /ref\(NS\)\.once\('value'\)/, '전체를 읽어야 백업이다');
  assert.match(e, /a\.download='기금관리_전체백업_'\+ymd\(\)/, '언제 받은 것인지 파일 이름에 없다');
  /* 되돌리기 단추가 있으면 잘못 눌러 42개가 한 번에 날아간다 —
     지운 기금은 [🗑 삭제 보관함]에서 되살린다 */
  assert.ok(!/function importAll|restoreAll/.test(SRC), '통째로 덮어쓰는 길이 생겼다');
  assert.ok(/onclick="[^"]*\bexportAll\(\)"/.test(SRC), '백업을 부르는 단추가 화면에 없다');
  /* 백업 창은 «되돌리는 길»을 반드시 말한다 — 없으면 없다고 까닭까지,
     있으면 어디 있는지. 안 적어 두면 대표가 있는 줄 알고 기다리거나,
     있는데도 「되돌릴 방법이 아예 없다」고 읽는다.
     ⚠ 여기서 못 박는 것은 «문장»이 아니라 «그 말을 하는가»다.
       2026-09-06 에 이 검사가 옛 문장(「일부러 두지 않았습니다」)을 글자 그대로
       박아 두어, 안내를 «바로잡은» 커밋에서 main 이 통째로 빨강이 되었다
       (시점 복원이 실제로 있는데 없다고 적혀 있었다 — 글은 고친 쪽이 옳았다).
       규칙만 지키면 어느 쪽 문장이든 통과한다. */
  /* ⚠ SRC 전체가 아니라 «그 창을 짓는 함수 안»에서만 본다.
       파일 어딘가에 「되돌리기」라는 낱말이 있다는 것은 아무 뜻이 없다 —
       서식 창의 「↺ 되돌리기」 단추와 바로 위 주석에도 그 낱말이 있다.
       실제로 안내 문장을 통째로 지우고도 검사가 초록이었다. */
  const 창 = grabFn('showBackup');
  assert.ok(/되돌리기/.test(창), '백업 창이 «되돌리는 길»을 아예 말하지 않는다');
  /* ⚠ 「백업·복구」만 찾으면 «창 제목»(⚙ 백업·복구)에 걸려 헛통과한다 —
       안내 문장을 통째로 지우고도 초록이었다. 대괄호까지 함께 본다. */
  assert.ok(/일부러 두지 않았습니다|\[백업·복구\]/.test(창),
    '되돌리기가 «없으면 그 까닭», «있으면 어디 있는지»를 말해야 한다 — '
    + '안 적으면 대표가 있는 줄 알고 기다리거나, 있는데도 없는 줄 안다');
  assert.ok(/삭제 보관함/.test(창),
    '실수로 지운 기금을 되살리는 길(🗑 삭제 보관함)을 안 알려 준다');
  assert.ok(SRC.includes('삭제 보관함</b>에서 <b>↩ 복원'),
    '실수로 지운 기금을 되살리는 길을 안 알려 준다');
});

test('백업 단추는 메뉴 순서에 섞이지 않는다 — 메뉴가 아니라 도구다', () => {
  assert.ok(!/id="nav-backup"/.test(SRC), '백업이 아직 사이드바 메뉴 항목(nav-backup)으로 남아 있다');
  const i = SRC.indexOf('id="toolsbtn"');
  assert.ok(i > 0, '백업을 여는 도구 단추(toolsbtn)가 없다');
  const tag = SRC.slice(SRC.lastIndexOf('<button', i), i + 40);
  assert.ok(!/data-nav="1"/.test(tag), '드래그 순서에 섞이면 메뉴처럼 읽힌다');
  /* 드래그 순서에서 빼는 것만으로는 모자랐다 — 메뉴 «목록 안»에 남아 있으면
     옆의 화면 메뉴들과 같은 층으로 보여 화면이 바뀔 줄 알고 누르게 된다. */
  const s = SRC.indexOf('function shell()');
  const nav = SRC.slice(SRC.indexOf('id="navlist"', s), SRC.indexOf('margin-top:auto', s));
  assert.ok(nav.length > 100, '사이드바 목록을 못 찾았다');
  assert.ok(!/exportAll/.test(nav), '메뉴 목록 안에 백업이 남아 있다');
});

/* ══════ ⑩ 담당 확인 ══════ */
function mine() {
  const box = {};
  new Function('U', ['var S={user:U};', grabFn('_isMine'), 'this.f=_isMine;'].join('\n')).call(box, '홍길동');
  return box.f;
}

test('담당이면 안 묻고, 아니면 묻는다', () => {
  const f = mine();
  assert.equal(f({ mgr_main: { name: '홍길동' } }), true, '주담당이면 내 것이다');
  assert.equal(f({ mgr_subs: [{ name: '홍길동' }] }), true, '부담당도 내 것이다');
  assert.equal(f({ manager: '홍길동, 김철수' }), true, '옛 담당 글자도 본다');
  assert.equal(f({ mgr_main: { name: '김철수' } }), false, '남의 기금이다');
  assert.equal(f({}), false, '담당이 없으면 내 것이 아니다');
});

test('누구인지 모르면 묻지 않는다 — 로그인 정보가 늦게 올 수 있다', () => {
  const box = {};
  new Function(['var S={user:""};', grabFn('_isMine'), 'this.f=_isMine;'].join('\n')).call(box);
  assert.equal(box.f({ mgr_main: { name: '김철수' } }), true,
    '내가 누구인지 모르는데 매번 물으면 일이 안 된다');
});

test('막지 않는다 — 묻기만 한다', () => {
  const a = grabFn('askIfNotMine');
  assert.match(a, /confirmM\(/, '묻지 않고 그냥 진행한다');
  assert.match(a, /\{ok:'진행'\}/, '진행할 수 있어야 한다 — 서로 대신 봐 주는 일이 흔하다');
  assert.match(a, /return Promise\.resolve\(true\)/, '내 기금인데도 묻는다');
  /* 아예 못 하게 막으면 담당이 자리를 비운 날 일이 멈춘다 */
  assert.ok(!/return;|toast\([^)]*권한/.test(a), '막고 있다 — 물어야 한다');
  assert.match(grabFn('saveInfo'), /askIfNotMine\(cur,'기금 정보 저장'\)/, '기금 정보 저장에 안 걸렸다');
});

/* ══════ 수입 항목이 «겹치지» 않는다 ══════
   2026-08-27 브라우저에서 실제로 그려 보고 잡았다. computeFin 의 interest 는 이름과
   달리 «이자»가 아니라 수익 전체다(var interest=revenue). bizRev 는 그 안에 든
   사업수익이라 interest = bizRev + nonopRev 다. 예산 화면이 이자 칸에 interest,
   그 밖 칸에 bizRev 를 넣어 «같은 돈을 두 번» 세었고 수입 계가 그만큼 부풀었다. */
test('수입 항목끼리 겹치지 않는다 — 같은 돈을 두 번 세지 않는다', () => {
  /* 주석에 적힌 이름은 빼고 «실제로 쓰는 곳»만 본다 */
  const a = grabFn('budgetActual').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(!/fin\.interest/.test(a),
    'fin.interest 는 수익 «전체»라 bizRev 와 겹친다 — 두 번 세어진다');
  assert.match(a, /bizRev:num\(fin\.bizRev\)/, '사업수익을 안 쓴다');
  assert.match(a, /nonopRev:num\(fin\.nonopRev\)/, '사업외수익을 안 쓴다');

  /* ── 2026-09-02: 전제가 «바뀌었다» ──
     예전에는 computeFin 이 interest=revenue 를 만들어 「이자수익」이라 부르며 내보냈다.
     그런데 수익 계정은 이자수익·잡수익·준비금환입 셋이라, 그 값은 이자수익도
     사업수익도 아니었다. 그래서 쓰던 다섯 자리를 bizRev 로 옮기고 **없앴다**
     (fund.html 의 그 자리 주석에 까닭이 적혀 있다).
     ⚠ 그러니 여기서 볼 것은 «있는가»가 아니라 «없는가»다 — 그냥 지우면
       interest=revenue 가 되돌아와도 아무도 안 걸린다. */
  const cf = grabFn('computeFin');
  assert.doesNotMatch(cf, /var interest=revenue/,
    'interest=revenue 가 되살아났다 — 그 값은 이자수익도 사업수익도 아니라 없앤 것이다');
  assert.match(cf, /var nonopRev=revenue-bizRev/, 'nonopRev 의 뜻이 바뀌었다');

  /* 항목이 쓰는 이름이 서로 달라야 겹치지 않는다 */
  const box = {};
  new Function([grabDecl('BUDGET_ROWS'), 'this.R=BUDGET_ROWS;'].join('\n')).call(box);
  const keys = [].concat.apply([], box.R.map(g => g[2].map(r => r[2])));
  assert.equal(new Set(keys).size, keys.length, '같은 실적을 두 항목이 쓰고 있다: ' + keys.join(', '));
});
