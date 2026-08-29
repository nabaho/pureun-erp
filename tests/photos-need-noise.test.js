'use strict';
/* 「확인 필요」가 계속 나온다 · 「분류 삭제」가 안 된다 (대표 지시 2026-08-24)

   ■ ① 확인 필요
     "계속해서 확인 필요가 나온다. 실제 화면에서는 전혀 문제가 없는데 어떻게 해야 하나.
      이 부분 제대로 완전히 고쳐 달라."
     chat·timesheet·form 이 **조건 없이** 할 일이었다 — 판독이 멀쩡히 됐어도 한 장씩
     열어 ✓ 를 눌러야 빠졌다. 서식은 상담 한 건에 여러 장씩 나오므로 확인필요가 서식으로
     늘 차 있었고, 그러면 **정작 손봐야 할 것이 묻힌다.**
     2026-08-04 에도 같은 보고가 있었고("확인 필요 오류가 계속 나온다") 그때 세운 원칙이
     「치울 수 없는 할 일은 목록을 못 믿게 만든다」였다.

   ■ ② 분류 삭제
     "삭제를 클릭해도 삭제가 안 된다" — 화면에 뜬 것은 PERMISSION_DENIED 한 줄이었다.
     분류 이름표·숨김을 쓰는 자리가 **실시간DB 규칙에 아예 없었다.**

   실행: node --test tests/*.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { cutFn } = require('./cut-fn');

const R = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(R, 'pu-photos.html'), 'utf8');

/* 판정을 **실제로 돌린다** — 모양만 보면 「서식이 언제 할 일인가」를 증명할 수 없다.
   ⚠ needsCheck 와 checkWhy 를 **함께** 떠서 같은 자료로 돌린다. 둘이 어긋나면
     목록에는 안 보이는데 이유만 떠다닌다(이 저장소가 여러 번 겪은 병이다). */
const J = (function () {
  const c = { Object, Array, String, Number, Boolean, Math, RegExp };
  c.globalThis = c;
  const grab = (re, what) => {
    const m = app.match(re);
    assert.ok(m, what + ' 를 찾지 못했습니다');
    return m[0].replace(/^const /, 'var ');
  };
  vm.createContext(c);
  vm.runInContext([
    'var CARD_KINDS = { card: 1, bizreg: 1 };',
    'var CO_KINDS = { bizreg: 1, sme: 1 };',
    grab(/^const KEEP_ONLY = \{[^}]*\};/m, 'KEEP_ONLY'),
    grab(/^const MIN_READ_EDGE = \{[\s\S]*?\n\};/m, 'MIN_READ_EDGE'),
    grab(/^const TEL_SHAPE = [^\n]*;$/m, 'TEL_SHAPE'),
    grab(/^const MAIL_SHAPE = [^\n]*;$/m, 'MAIL_SHAPE'),
    grab(/^const READ_FAIL_RULES = \[[\s\S]*?\n\];$/m, 'READ_FAIL_RULES'),
    grab(/^const FAIL_GIVEUP = \d+;$/m, 'FAIL_GIVEUP'),
    cutFn(app, 'function readAnyField('),
    cutFn(app, 'function tooSmall('),
    cutFn(app, 'function smallCheckedOk('),
    cutFn(app, 'function coFilledOk('),
    cutFn(app, 'function coTodo('),
    cutFn(app, 'function readFailKind('),
    cutFn(app, 'function readFailAdvice('),
    cutFn(app, 'function canSendCoInfo('),
    cutFn(app, 'function formTodo('),
    cutFn(app, 'function chatTodo('),
    cutFn(app, 'function checkWhy('),
    cutFn(app, 'function needsCheck(')
  ].join('\n'), c);
  return c;
})();

/* 큰 원본 — 「원본이 작다」 줄에 안 걸리게 (그 줄이 먼저 판정한다) */
const big = (read) => ({ meta: { w: 2000, h: 2800, read: read } });
const form = (extra) => big(Object.assign({ kind: 'form', auto: false, fields: {} }, extra || {}));

/* ══════ ① 서식 — 기업 상세로 보낼 것이 남았을 때만 ══════ */

test('★ 서식을 읽었고 보낼 곳이 없으면 할 일이 아니다 — 사진첩에 보관만 한다', () => {
  /* 사업자번호를 못 읽은 서식은 기업 상세로 갈 수가 없다. 그런데도 ⚠ 를 달아 두면
     **아무 결과도 바꾸지 않는 할 일**이 되어 목록을 못 믿게 만든다. */
  const it = form({ fields: { docName: '통합 기술보호지원반 신청서', applyField: '기술보호' } });
  assert.equal(J.needsCheck(it), false,
    '★ 사업자번호가 없는 서식은 눌러도 달라지는 것이 없습니다 — 확인필요가 서식으로 찹니다');
  assert.equal(J.checkWhy(it), '', '할 일이 아니면 이유도 없어야 합니다');
});

test('★ 서식에서 사업자번호를 읽었는데 아직 안 보냈으면 할 일이다 — 누르면 끝난다', () => {
  const it = form({ fields: { bizno: '312-81-49225', docName: '신청기업 정보' } });
  assert.equal(J.needsCheck(it), true, '★ 보낼 것이 남았는데 조용히 묻히면 안 됩니다');
  assert.match(J.checkWhy(it), /기업 상세로 아직 안 보냄/, '무엇을 하라는지 안 적혀 있습니다');
});

test('★ 기업 상세로 보냈으면 끝이다 — 다시 볼 일이 없다', () => {
  const it = form({ fields: { bizno: '312-81-49225' },
                    filedInfo: { at: 1756000000000, by: '박은비', n: 4 } });
  assert.equal(J.needsCheck(it), false, '★ 보냈는데도 ⚠ 가 남으면 치울 수 없는 할 일이 됩니다');
  assert.equal(J.checkWhy(it), '');
});

test('★ 사업자번호가 열 자리가 안 되면 보낼 수 없다 — 할 일이 아니다', () => {
  assert.equal(J.needsCheck(form({ fields: { bizno: '312-81' } })), false);
});

test('★ auto:false 라고 무조건 할 일로 삼지 않는다 — 서식은 늘 auto:false 다', () => {
  /* 판독기가 서식에 auto:false 를 주는 것은 「자동 등록 대상이 아니다」는 뜻이다.
     그 줄에 먼저 닿으면 이 고침이 통째로 무의미해진다 — 판정 «순서»가 핵심이다. */
  /* ⚠ 2026-08-27: 판정이 checkWhy 한 곳으로 모였다(needsCheck 는 그것을 그대로 쓴다).
     순서도 그쪽에서 본다 — 지키는 것은 그대로, 서식 판정이 auto 판정보다 «앞». */
  const fn = cutFn(app, 'function checkWhy(');
  /* ⚠ 2026-08-28: CMS 가 같은 줄에 붙어 `if (r.kind === 'form' || r.kind === 'cms')` 가 됐다 */
  const iForm = fn.indexOf("if (r.kind === 'form'");
  const iAuto = fn.indexOf('if (!r.auto)');
  assert.ok(iForm > 0 && iAuto > 0, '두 줄을 찾지 못했습니다');
  assert.ok(iForm < iAuto,
    '★ `!r.auto` 가 먼저면 서식은 언제나 할 일입니다 — 고친 뜻이 사라집니다');
});

/* ══════ ② 대화 캡처 — 남은 할 일이 있을 때만 ══════ */

const chat = (todos) => big({ kind: 'chat', auto: false, fields: { todos: todos } });

test('★ 뽑아 둔 할 일이 남아 있으면 할 일이다', () => {
  const it = chat([{ t: '견적서 보내기', done: false }, { t: '전화', done: true }]);
  assert.equal(J.needsCheck(it), true);
  assert.match(J.checkWhy(it), /남은 할 일/);
});

test('★ 다 끝냈으면 할 일이 아니다 — 끝냈다는 표시가 무의미해지면 안 된다', () => {
  const it = chat([{ t: '견적서 보내기', done: true }, { t: '전화', done: true }]);
  assert.equal(J.needsCheck(it), false, '★ 다 끝냈는데도 ⚠ 가 남습니다');
  assert.equal(J.checkWhy(it), '');
});

test('★ 할 일을 하나도 못 뽑은 대화는 볼 것이 없다', () => {
  assert.equal(J.needsCheck(chat([])), false);
  assert.equal(J.needsCheck(big({ kind: 'chat', auto: false, fields: {} })), false);
});

/* ══════ ③ 근태표는 그대로 — 손글씨는 기계가 못 본다 ══════ */

test('★ 근태표는 여전히 사람이 본다 — 손글씨 숫자는 검산할 방법이 없다', () => {
  const it = big({ kind: 'timesheet', auto: false, fields: { pairs: [{ k: '1일', v: '8' }] } });
  assert.equal(J.needsCheck(it), true,
    '★ 여기서 사람을 빼면 잘못 읽은 근태가 조용히 굳습니다');
  assert.match(J.checkWhy(it), /원본과 대조/);
});

test('근태표도 「확인했음」으로는 치울 수 있다 — 치울 수 없는 할 일을 만들지 않는다', () => {
  const it = big({ kind: 'timesheet', auto: false, ack: { at: 1, by: '나' }, fields: {} });
  assert.equal(J.needsCheck(it), false);
});

/* ══════ ④ 다른 것은 그대로 ══════ */

test('판독 실패·급여서류·종류 못 가림은 그대로 할 일이다', () => {
  assert.equal(J.needsCheck(big({ kind: 'other', error: 'AI가 잠시 바쁩니다', fields: {} })), true);
  assert.equal(J.needsCheck(big({ kind: 'payslip', fields: {} })), true);
  assert.equal(J.needsCheck(big({ kind: 'other', auto: false, fields: { company: '가나' } })), true);
  assert.equal(J.needsCheck(big({ kind: 'meeting', auto: true, fields: {} })), false, '회의사진은 보관만');
});

test('★ 원본이 작은 서식은 여전히 할 일이다 — 그 줄이 먼저 판정한다', () => {
  /* 작아서 지어냈을 수 있는 값은 기계가 못 가린다. 서식이라고 그냥 통과시키면
     「작다」 판정이 서식에서만 통째로 죽는다. */
  /* ⚠ 긴 변으로 견준다(tooSmall) — 1600 을 그대로 두면 문턱과 같아 「작다」가 안 된다 */
  const it = { meta: { w: 1141, h: 1400, read: { kind: 'form', auto: false, fields: {} } } };
  assert.equal(J.needsCheck(it), true);
  assert.match(J.checkWhy(it), /원본이 작습니다/);
});

test('★ 사업자번호를 검산한 작은 서식은 통과한다 — 2026-08-23 결정 그대로', () => {
  const it = { meta: { w: 1141, h: 1400,
    read: { kind: 'form', auto: false, bizNoOk: true, fields: { bizno: '312-81-49225' },
            filedInfo: { at: 1 } } } };
  assert.equal(J.needsCheck(it), false);
});

test('★ 할 일이면 반드시 이유가 있고, 할 일이 아니면 이유가 없다 — 셋을 두루 돌려 본다', () => {
  /* 이 검사가 핵심이다. needsCheck 와 checkWhy 가 어긋나면 목록에는 안 보이는데
     이유만 떠다니거나, 걸려 있는데 왜 걸렸는지 알 수 없다. */
  const cases = [];
  ['form', 'chat', 'timesheet', 'card', 'bizreg', 'sme', 'other', 'meeting', 'contract'].forEach(k => {
    [true, false].forEach(auto => {
      [undefined, { at: 1 }].forEach(filedInfo => {
        [undefined, [{ t: 'ㄱ', done: false }], [{ t: 'ㄱ', done: true }], []].forEach(todos => {
          [{}, { bizno: '312-81-49225' }, { company: '가나' }].forEach(f => {
            cases.push(big({ kind: k, auto: auto, filedInfo: filedInfo,
              fields: Object.assign({}, f, todos ? { todos: todos } : {}) }));
          });
        });
      });
    });
  });
  const bad = [];
  cases.forEach(it => {
    const need = J.needsCheck(it);
    const why = J.checkWhy(it);
    if (need && !why) bad.push('할 일인데 이유가 없다: ' + JSON.stringify(it.meta.read));
    if (!need && why) bad.push('할 일이 아닌데 이유가 있다: ' + why + ' / ' + JSON.stringify(it.meta.read));
  });
  assert.deepEqual(bad.slice(0, 5), [], bad.length + '건 어긋남:\n' + bad.slice(0, 5).join('\n'));
});

/* ══════ ⑤ 분류 삭제 — 서버가 거부했을 때 무엇을 해야 하나 ══════ */

test('★ PERMISSION_DENIED 를 영어 그대로 보여주지 않는다 — 할 수 있는 일이 없어진다', () => {
  const c = { Object, String, RegExp };
  c.globalThis = c;
  vm.createContext(c);
  vm.runInContext(cutFn(app, 'function kindErrMsg('), c);
  const m = c.kindErrMsg(new Error('PERMISSION_DENIED: Permission denied'));
  assert.match(m, /규칙/, '★ 무엇이 막혔는지 안 알려 줍니다');
  assert.match(m, /kindLabels/, '어느 자리를 열어야 하는지 안 알려 줍니다');
  assert.match(m, /사진과 판독 결과는 아무것도 바뀌지 않았습니다/,
    '★ 사진이 상했는지 아닌지를 안 알려 주면 다음에 뭘 할지 못 정합니다');
});

test('그 밖의 오류는 그대로 보여준다 — 우리 문구로 덮으면 원인을 놓친다', () => {
  const c = { Object, String, RegExp };
  c.globalThis = c;
  vm.createContext(c);
  vm.runInContext(cutFn(app, 'function kindErrMsg('), c);
  assert.equal(c.kindErrMsg(new Error('네트워크가 끊겼습니다')), '네트워크가 끊겼습니다');
  assert.equal(c.kindErrMsg(null), '');
});

test('★ 분류 창의 모든 길이 그 번역을 거친다 — 한 곳만 놓치면 그 길에서 영어가 뜬다', () => {
  const bad = [];
  app.split('\n').forEach(function (l, i) {
    if (!/showKindErr\(/.test(l)) return;
    if (/kindErrMsg\(/.test(l)) return;
    /* 우리가 손으로 쓴 우리말 안내문은 그대로 둔다.
       ⚠ 2026-08-28 넓힘 — 「…해 주세요」만 봐주다가 「골라 주세요」·「적어 주세요」가
         걸렸다. 잡으려는 것은 «번역을 안 거친 오류»이지 우리말 안내문이 아니다.
         울타리의 이빨은 그대로다 — 오류를 그대로 넘기면 여전히 걸린다. */
    if (/'[^']*주세요'|'[^']*입력'/.test(l)) return;
    if (/^function showKindErr/.test(l.trim())) return;
    bad.push((i + 1) + ': ' + l.trim());
  });
  assert.deepEqual(bad, [], '★ 번역을 안 거치는 자리:\n' + bad.join('\n'));
});

test('★ 붙여넣을 규칙 조각을 저장소에 남긴다 — 앱이 고칠 수 없는 일이다', () => {
  const p = path.join(R, 'docs', 'firebase-rules-전체-적용본.json');
  assert.ok(fs.existsSync(p), '★ 조각이 없으면 대표께서 무엇을 붙여넣어야 할지 모릅니다');
  /* 2026-08-29 — 조각 파일을 없애고 «적용본» 한 곳으로 모았다.
     지킬 것은 그대로다: 이름표 칸이 규칙에 있고, 쓰기는 총괄관리자만. */
  const j = JSON.parse(fs.readFileSync(p, 'utf8'));
  const g = j.rules.puphotos;
  ['kindLabels', 'kindHidden'].forEach(k => {
    assert.ok(g[k], k + ' 자리가 없습니다');
    assert.match(g[k]['.read'], /auth != null/, '읽기 조건이 없습니다');
    assert.match(g[k]['.write'], /isAdmin/, '★ 쓰기를 아무에게나 열면 안 됩니다 — 총괄 관리자만');
  });
  /* 콘솔이 진짜라는 것을 못박는다 — 저장소 파일로 덮어 배포하면 사진첩이 막힌다.
     ⚠ 2026-08-29 — 적용본은 «순수 JSON» 이라 그 안에 말을 담을 수 없다.
       그 말은 docs/firebase-rules-적용안내.md 가 맡는다. */
  assert.match(fs.readFileSync(path.join(R, 'docs', 'firebase-rules-적용안내.md'), 'utf8'), /콘솔/,
    '규칙을 어디에 넣는 것인지 안 적어 두면 저장소 파일로 배포합니다');
});

test('★ 저장 층이 쓰는 자리와 조각의 자리 이름이 같다 — 다르면 붙여넣어도 안 열린다', () => {
  const store = fs.readFileSync(path.join(R, 'js', 'pu-photo-store.js'), 'utf8');
  assert.match(store, /kindLabelsPath\(\) \{ return DB_ROOT \+ '\/kindLabels'; \}/);
  assert.match(store, /kindHiddenPath\(\) \{ return DB_ROOT \+ '\/kindHidden'; \}/);
});
