/* 사업자등록증 «발급일» + 「이 값으로 바꾸기」 (대표 지시 2026-09-07 · 결정 「고침」)

   ■ 무엇이 문제였나 (검토 #1121 에서 재어 본 것)
   공공기관은 대표자가 자주 바뀌어 등록증이 새로 발급된다. 그런데
     ① 판독기가 등록증에서 «발급일»을 안 읽었다 — 읽는 날짜는 개업연월일뿐인데
        **개업일은 안 바뀌고 발급일만 바뀐다.** 최신을 가릴 잣대가 아예 없었다.
     ② 값이 다르면 ⚠ 로 보여만 주고, 새 값을 받아들일 길이 한 곳도 없었다 —
        `coInfo` 의 값 칸에 쓰는 코드가 앱 전체에 하나도 없었다.
   → 대표자가 바뀌면 옛 이름이 영영 남고, 푸른이알피로도 옛 이름이 갔다.

   ★ 못 박는 것
     ① `issueDate`(발급일)와 `openDate`(개업일)는 **끝까지 다른 칸**이다.
        섞이는 순간 「어느 것이 최신인가」를 영영 못 가린다.
     ② 담는 곳(KEEP)과 보이는 곳(CO_FIELDS)은 늘 «짝»이다.
     ③ 어긋난 값에는 그 서류의 «발급일»이 함께 남는다 — 없으면 판단할 근거가 없다.
     ④ 「이 값으로 바꾸기」는 **묻고**, **기업 상세 칸 하나만** 바꾸고,
        **명함(등록증)과 사진첩 원본은 안 건드린다**.

     node --test tests/cards-bizreg-issue-date.test.js */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'pu-cards.html'), 'utf8').split('\r\n').join('\n');
const READ = fs.readFileSync(path.join(ROOT, 'js', 'pu-doc-read.js'), 'utf8').split('\r\n').join('\n');
const FILE = fs.readFileSync(path.join(ROOT, 'js', 'pu-doc-file.js'), 'utf8').split('\r\n').join('\n');

function fnBody(name, src) {
  const s = src || SRC;
  const i = s.search(new RegExp('(?:^|\\n)(?:async )?function ' + name + '\\('));
  assert.ok(i >= 0, name + ' 을 찾지 못했습니다');
  const open = s.indexOf('{', i);
  let d = 0;
  for (let k = open; k < s.length; k++) {
    if (s[k] === '{') d++;
    else if (s[k] === '}') { d--; if (!d) return s.slice(i, k + 1); }
  }
  assert.fail(name + ' 의 끝을 찾지 못했습니다');
}

/* ── ① 발급일과 개업일은 «다른 칸» ── */

test('★★★ 판독기가 «발급일»을 묻고, 개업일과 다르다고 못 박는다', () => {
  const i = READ.indexOf('kind=bizreg 이면 키:');
  assert.ok(i > 0, 'bizreg 물음을 못 찾았다');
  const q = READ.slice(i, READ.indexOf("' +", i));
  assert.match(q, /issueDate\(/, '★ 발급일을 안 묻는다 — 최신을 가릴 잣대가 없다');
  assert.match(q, /openDate\(개업연월일\)/, '★ 개업일을 안 묻는다');
  /* 둘이 어떻게 다른지 «물음 안에» 적혀 있어야 한다 — 안 적으면 AI 가 섞는다 */
  assert.match(q, /개업연월일과 다릅니다|개업일은 사업을 시작한 날/,
    '★ 개업일과 발급일이 어떻게 다른지 안 알려 준다 — 그러면 같은 값이 온다');
  assert.match(q, /대표자가 바뀌면/, '★ 왜 이 칸이 필요한지 안 알려 준다');
});

test('★★★ 기업정보함 칸으로 이어질 때도 «따로» 간다 — 섞이면 최신을 못 가린다', () => {
  const i = READ.indexOf('bizreg: { company: \'company\'');
  assert.ok(i > 0, 'cards 의 bizreg 표를 못 찾았다');
  const m = READ.slice(i, READ.indexOf('}', READ.indexOf('docName', i)));
  assert.match(m, /issueDate: 'issueDate'/, '★ 발급일을 기업정보함 칸으로 안 보낸다');
  assert.match(m, /openDate: 'openDate'/, '★ 개업일 이음이 사라졌다');
  assert.ok(!/issueDate: 'openDate'|openDate: 'issueDate'/.test(m),
    '★ 발급일과 개업일이 «같은 칸»으로 간다 — 최신을 영영 못 가린다');
});

test('★★ 적힌 것(pairs)의 「발급일」도 개업일이 «아니라» 발급일로 간다', () => {
  const i = READ.indexOf("설립일: 'openDate'");
  assert.ok(i > 0, '별칭 표를 못 찾았다');
  const seg = READ.slice(i - 200, i + 700);
  assert.match(seg, /발급일: 'issueDate'/, '★ 「발급일」을 안 주워 담는다');
  assert.ok(!/발급일: 'openDate'/.test(seg),
    '★ 「발급일」이 개업일로 간다 — 개업일을 덮어쓴다');
});

/* ── ② 담는 곳과 보이는 곳이 짝 ── */

test('★★★ 담는 곳(KEEP)과 보이는 곳(CO_FIELDS)이 «짝»이다', () => {
  const keep = FILE.slice(FILE.indexOf('var KEEP = ['), FILE.indexOf('];', FILE.indexOf('var KEEP = [')));
  assert.match(keep, /'issueDate'/, '★ 기업 상세로 안 보낸다 — 값이 아예 안 온다');
  const co = SRC.slice(SRC.indexOf('const CO_FIELDS = ['), SRC.indexOf('];', SRC.indexOf('const CO_FIELDS = [')));
  assert.match(co, /\['issueDate','등록증 발급일'\]/, '★ 화면에 이름표가 없다 — 값은 쌓이는데 안 보인다');
  assert.match(co, /\['openDate','개업일'\]/, '★ 개업일 칸이 사라졌다');
});

test('★★ 어긋난 값에 그 서류의 «발급일»이 함께 남는다 — 없으면 판단할 근거가 없다', () => {
  const i = FILE.indexOf("add['conflicts/' + k] = {");
  assert.ok(i > 0, 'conflicts 를 쓰는 자리를 못 찾았다');
  const rec = FILE.slice(i, FILE.indexOf('};', i));
  assert.match(rec, /issued: String\(fields\.issueDate \|\| ''\)\.trim\(\)/,
    '★ 발급일을 안 남긴다 — 「지금 값」과 「읽은 값」만으로는 어느 쪽이 최신인지 모른다');
  assert.match(rec, /got: got, had: had/, '★ 두 값을 안 남긴다');
});

/* ── ③ 화면 ── */

test('★★★ 어긋난 값 줄에 「이 값으로 바꾸기」가 있다 — 그때까지 받아들일 길이 없었다', () => {
  const fn = fnBody('coConflictHtml');
  assert.match(fn, /coTakeNew\('\$\{esc\(k\)\}'\)/, '★ 새 값을 받아들일 길이 없다');
  assert.match(fn, /class="cotake"/, '★ 단추 모양이 없다');
  /* 발급일이 있으면 «먼저» 보여 준다 — 그것이 판단 근거다 */
  assert.match(fn, /c\.issued \?/, '★ 발급일을 화면에 안 낸다');
  assert.match(fn, /발급/, '★ 그 날짜가 발급일이라고 안 말한다');
});

test('★ 단추 모양이 CSS 에 있다 — 없으면 글자가 바탕에 묻힌다', () => {
  assert.match(SRC, /\.coclash \.cotake\{/, '★ .cotake 규칙이 없다');
  assert.match(SRC, /\.coclash \.cotake:hover\{/, '★ 눌리는 느낌이 없다');
});

/* ── ④ 바꾸는 함수 — 통째로 떠서 «돌린다» ── */

function run(opt) {
  const o = Object.assign({ yes: true, conflicts: null, pick: 'k1' }, opt || {});
  const ctx = {
    console, Object, String, Number, Array, Date, Math,
    esc: v => String(v == null ? '' : v),
    state: { coPick: o.pick },
    myEmail: '나@x.com',
    DB_ROOT: 'pucards',
    coList: () => [{
      key: 'k1', name: '가나재단', ceo: '김영옥',
      extra: { conflicts: o.conflicts === null
        ? { ceo: { got: '이철수', had: '김영옥', issued: '2025-02-12',
                   doc: '사업자등록증', by: '권형하', at: 5,
                   photoId: 'p9', photoYear: '2026', photoOwner: 'u1' } }
        : o.conflicts }
    }],
    toast: m => { ctx._toast = m; },
    confirm: m => { ctx._asked = m; return !!o.yes; },
    openCoDetailPanel: k => { ctx._drew = k; },
    Store: { db: { ref: () => ({ update: u => { ctx._upd = u; return Promise.resolve(); } }) } }
  };
  vm.createContext(ctx);
  vm.runInContext(
    SRC.slice(SRC.indexOf('const CO_FIELDS = ['), SRC.indexOf('];', SRC.indexOf('const CO_FIELDS = [')) + 2)
      .replace('const CO_FIELDS', 'var CO_FIELDS') + '\n'
    + fnBody('coAttachDocKey') + '\n'
    + fnBody('coTakeNew') + '\n;globalThis.__take = coTakeNew;', ctx);
  return ctx;
}

test('★★★ 「고침」 — 기업 상세 칸 하나만 바꾸고 어긋남을 지운다', async () => {
  const c = run();
  await c.__take('ceo');
  const keys = Object.keys(c._upd).sort();
  assert.equal(keys.join('\n'), [
    'coInfo/k1/at', 'coInfo/k1/by', 'coInfo/k1/ceo',
    'coInfo/k1/conflicts/ceo', 'coInfo/k1/src/ceo'
  ].join('\n'), '★ 손대는 자리가 다르다');
  assert.equal(c._upd['coInfo/k1/ceo'], '이철수', '★ 새 값으로 안 바꾼다');
  assert.equal(c._upd['coInfo/k1/conflicts/ceo'], null, '★ 어긋남이 그대로 남아 또 뜬다');
  /* 어디서 온 값인지 — 사진첩과 «같은 열쇠»(해_사진번호) */
  assert.equal(c._upd['coInfo/k1/src/ceo'], '2026_p9', '★ 어느 서류에서 왔는지 안 남긴다');
});

test('★★★ 명함(등록증)과 사진첩 원본은 «안 건드린다» — 등록증은 그때의 사실이다', async () => {
  const c = run();
  await c.__take('ceo');
  Object.keys(c._upd).forEach(k => assert.ok(k.indexOf('coInfo/') === 0,
    '★ coInfo 밖(' + k + ')을 건드린다 — 명함이나 사진을 고치면 원본이 사라진다'));
  const fn = fnBody('coTakeNew');
  assert.ok(!/items\/|photos\/|thumbs\/|puphotos/.test(fn),
    '★ 명함·사진 자리를 건드린다');
});

test('★★★ 묻는다 — 「아니오」면 아무것도 안 쓴다', async () => {
  const c = run({ yes: false });
  await c.__take('ceo');
  assert.equal(c._upd, undefined, '★ 묻지도 않고 바꿨다');
  assert.ok(c._asked, '★ 묻지 않았다');
});

test('★★ 묻는 말이 «무엇이 어떻게» 바뀌는지 말한다 — 발급일까지', async () => {
  const c = run({ yes: false });
  await c.__take('ceo');
  const q = String(c._asked);
  assert.ok(q.indexOf('대표자') > 0, '★ 어느 칸인지 안 말한다');
  assert.ok(q.indexOf('이철수') > 0, '★ 무엇으로 바뀌는지 안 말한다');
  assert.ok(q.indexOf('김영옥') > 0, '★ 지금 값을 안 말한다');
  assert.ok(q.indexOf('2025-02-12') > 0, '★ 읽은 서류의 발급일을 안 말한다 — 판단 근거다');
  assert.match(q, /명함\(등록증\)은 «그대로»|원본과 명함\(등록증\)은 «그대로»/,
    '★ 원본이 안전한지 안 말한다');
});

test('★ 발급일이 없으면 그 줄만 빠진다 — 「모름」을 지어내지 않는다', async () => {
  const c = run({ yes: false, conflicts: { ceo: { got: '이철수', had: '김영옥' } } });
  await c.__take('ceo');
  assert.ok(String(c._asked).indexOf('발급일') < 0,
    '★ 발급일이 없는데 발급일 줄을 낸다');
});

test('★ 이미 정리된 칸·회사를 안 고른 때는 아무것도 안 한다', async () => {
  const a = run({ conflicts: {} });
  await a.__take('ceo');
  assert.equal(a._upd, undefined, '★ 없는 어긋남으로 값을 쓴다');
  assert.match(String(a._toast), /이미 정리되었습니다/);
  const b = run({ pick: '' });
  await b.__take('ceo');
  assert.equal(b._upd, undefined, '★ 회사를 안 골랐는데 값을 쓴다');
  /* ⚠ 「아무것도 안 썼다」만 보면 «다른 까닭»으로 멈춰도 초록이다 —
       2026-09-07 고장넣기에서 회사 문지기를 떼도 통과했다(어긋남을 못 찾아 멈췄다).
       무엇을 말했는지까지 본다. */
  assert.match(String(b._toast), /먼저 회사를 골라 주세요/,
    '★ 회사를 안 골랐다고 말하지 않는다 — 문지기가 없어도 조용히 지나간다');
});

test('★ 바꾼 뒤 화면을 다시 그린다 — 안 그리면 아무 일도 안 일어난 것처럼 보인다', async () => {
  const c = run();
  await c.__take('ceo');
  assert.equal(c._drew, 'k1', '★ 다시 안 그린다');
});
