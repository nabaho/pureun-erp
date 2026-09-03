'use strict';
/* 판독이 못 읽은 이름·회사를 사람이 채운다 + 읽고 버리던 값 셋 + 오래된 등본
   (대표 지시 2026-09-02 「1번부터 순서대로」)

   ■ 무엇이 막혀 있었나
   이름이나 회사를 못 읽으면 화면이 「위에서 채워 주세요」라고 말했는데
   **위에 채울 칸이 없었다.** 판독 결과 표는 읽기 전용이고, 손으로 고칠 수 있는 것은
   「갈래」 하나뿐이었다. 그래서 그 서류는 근로자 정보함에 영영 못 갔다.

   ■ 이 검사가 못박는 것
   ① 채운 값이 «보내는 쪽까지» 간다 — 한쪽만 고치면 「단추는 떴는데 옛 이름으로 간다」
   ② 판독값을 덮지 않는다 — 「이 이름 어디서 나왔지」에 답할 수 있어야 한다
   ③ 읽어 둔 값에 이름표가 있다 — 없으면 읽고 버리는 셈이다
   ④ 오래된 등본은 «말만» 하고 막지 않는다, 모르면 아무 말도 안 한다

   실행: node --test tests/photos-read-fix-fields.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { stripComments } = require('./strip-comments');

const R = path.join(__dirname, '..');
const raw = fs.readFileSync(path.join(R, 'pu-photos.html'), 'utf8');
const app = stripComments(raw);

/* 순수 로직만 떼어 실제로 돌려 본다 — 글자만 보면 「부르긴 하는데 값이 틀린」 것을 못 잡는다 */
function load() {
  const ctx = { WORKER_KINDS: null };
  vm.createContext(ctx);
  const want = ['const WORKER_KINDS =', 'const FIX_KEYS =', 'function readFields(',
    'function canSendWorker(', 'function workerWhyNot(', 'function fixBoxOn(',
    'const RESIDENT_FRESH_DAYS =', 'function issuedDaysAgo(', 'function residentStale('];
  const src = want.map(function (head) {
    const i = raw.indexOf(head);
    assert.ok(i >= 0, '못 찾음: ' + head);
    /* 선언 하나를 통째로 — 다음 «줄머리» 선언 앞까지 */
    const rest = raw.slice(i);
    const m = rest.slice(1).search(/\n(?:function |const |let |var )/);
    return rest.slice(0, m < 0 ? rest.length : m + 1);
  }).join('\n');
  /* vm 안의 let/const 는 밖에서 못 꺼낸다 — 일부러 전역에 얹는다 */
  vm.runInContext(src + '\n;Object.assign(this, { WORKER_KINDS, FIX_KEYS, readFields,' +
    ' canSendWorker, workerWhyNot, fixBoxOn, RESIDENT_FRESH_DAYS, issuedDaysAgo, residentStale });', ctx);
  return ctx;
}
const M = load();

/* ══════ ① 채운 값이 보내는 쪽까지 간다 ══════ */

test('★★ 판독이 못 읽어도 «사람이 채우면» 보낼 수 있다 — 이것이 막혀 있던 자리다', () => {
  const read = { kind: 'consent', fields: { name: '', company: '' } };
  assert.equal(M.canSendWorker(read), false, '아무것도 없으면 못 보내는 것이 맞습니다.');
  read.fix = { name: '김철수', company: '(주)한빛' };
  assert.equal(M.canSendWorker(read), true,
    '★★ 사람이 채웠는데도 못 보내면, 채우는 칸을 만든 뜻이 통째로 없어집니다.');
});

test('★★ 보내는 값 자체가 «채운 것»이다 — 막는 쪽만 고치면 옛 이름으로 간다', () => {
  const send = raw.slice(raw.indexOf('function sendWorker('));
  const body = send.slice(0, send.indexOf('\nfunction '));
  assert.ok(!/fields:\s*read\.fields/.test(stripComments(body)),
    '★★ read.fields 를 그대로 보내면 「단추는 떴는데 옛 이름으로 간다」가 됩니다.');
  assert.ok(/readFields\(read\)/.test(stripComments(body)),
    '★ 보내는 쪽도 readFields() 한 곳을 봐야 합니다.');
});

test('★ 왜 못 보내는지도 «채운 뒤 값»으로 말한다 — 채웠는데 같은 잔소리가 남으면 안 된다', () => {
  const read = { kind: 'mandate', fields: { name: '', company: '(주)한빛' } };
  assert.match(M.workerWhyNot(read), /이름/, '이름이 없으면 이름을 말해야 합니다.');
  read.fix = { name: '박영희' };
  assert.equal(M.workerWhyNot(read), '',
    '★ 다 채웠는데도 까닭이 남으면 사람은 무엇을 더 해야 할지 모릅니다.');
});

/* ══════ ② 판독값을 덮지 않는다 ══════ */

test('★★ 판독이 읽은 것은 «그대로» 남는다 — 덮으면 「이 이름 어디서 나왔지」에 못 답한다', () => {
  const read = { kind: 'idcard', fields: { name: '김절수' }, fix: { name: '김철수' } };
  assert.equal(M.readFields(read).name, '김철수', '볼 때는 채운 것이 이깁니다.');
  assert.equal(read.fields.name, '김절수',
    '★★ 판독값이 바뀌었습니다 — 무엇을 잘못 읽었는지 영영 알 수 없게 됩니다.');
  const save = raw.slice(raw.indexOf('function fixSave('));
  const body = stripComments(save.slice(0, save.indexOf('\n/*')));
  assert.ok(!/fields\s*[:=]\s*/.test(body.replace(/read\.fields/g, '')),
    '★★ 저장하며 fields 를 건드리면 판독값이 사라집니다.');
});

test('★ 빈 칸은 «안 덮는다» — 비워 저장했다고 읽어 둔 것까지 지우면 손해만 난다', () => {
  const read = { kind: 'idcard', fields: { name: '김철수', company: '(주)한빛' },
                 fix: { name: '', company: '   ' } };
  const f = M.readFields(read);
  assert.equal(f.name, '김철수');
  assert.equal(f.company, '(주)한빛',
    '★ 공백만 적은 것을 값으로 받으면 멀쩡히 읽은 회사가 날아갑니다.');
});

test('★ 이미 보낸 것에는 채우기 칸을 안 낸다 — 두 곳이 어긋난다', () => {
  const sent = { kind: 'consent', fields: {}, filedWk: { at: 1 } };
  assert.equal(M.fixBoxOn(sent), false,
    '★ 근로자 정보함에 이미 그 이름으로 붙었는데 여기서만 바꾸면 두 곳이 갈립니다.');
  assert.equal(M.fixBoxOn({ kind: 'consent', fields: {} }), true);
  assert.equal(M.fixBoxOn({ kind: 'card', fields: {} }), false, '명함은 이 칸이 아닙니다.');
  assert.equal(M.fixBoxOn({ kind: 'consent', error: 'x' }), false, '판독 실패에는 안 냅니다.');
});

/* ══════ ③ 읽어 둔 값에 이름표가 있다 ══════ */

test('★★ 판독이 읽는 칸은 «화면에 이름표»가 있다 — 없으면 읽고 버리는 셈이다', () => {
  const reader = stripComments(fs.readFileSync(path.join(R, 'js', 'pu-doc-read.js'), 'utf8'));
  const rows = app.match(/const READ_ROWS = \[([\s\S]*?)\n\];/);
  assert.ok(rows, 'READ_ROWS 를 찾지 못했습니다.');
  const labelled = {};
  (rows[1].match(/\['([a-zA-Z]+)'/g) || []).forEach(function (m) {
    labelled[m.slice(2, -1)] = 1;
  });
  /* 이 넷은 pairs 를 «일부러» 안 담는다(민감정보가 딸려 오는 것을 막으려고).
     그래서 이름표가 없으면 값이 갈 곳이 아예 없다 — 다른 갈래와 사정이 다르다. */
  ['idcard', 'resident', 'mandate', 'consent'].forEach(function (kind) {
    const line = reader.split('\n').filter(function (l) {
      return l.indexOf('kind=' + kind + ' 이면 키:') >= 0;
    })[0];
    assert.ok(line, kind + ' 프롬프트를 찾지 못했습니다.');
    (line.match(/([a-zA-Z]+)\(/g) || []).map(function (m) { return m.slice(0, -1); })
      .filter(function (k) { return k !== 'kind'; })
      .forEach(function (key) {
        assert.ok(labelled[key],
          '★★ kind=' + kind + ' 이 「' + key + '」를 읽는데 READ_ROWS 에 이름표가 없습니다.\n' +
          '  이 넷은 pairs 를 안 담으므로 이름표가 없으면 **읽고 버립니다.**\n' +
          '  고치는 법: READ_ROWS 에 [\'' + key + '\', \'…\'] 를 더하세요.');
      });
  });
});

/* ══════ ④ 오래된 등본 — 말만 하고 막지 않는다 ══════ */

test('★ 3개월 넘은 등본은 말해 준다', () => {
  const now = Date.UTC(2026, 8, 2);
  const old = { kind: 'resident', fields: { issueDate: '2026-01-05' } };
  assert.equal(M.residentStale(old, now), true);
  const fresh = { kind: 'resident', fields: { issueDate: '2026-08-20' } };
  assert.equal(M.residentStale(fresh, now), false);
});

test('★★ 못 읽었으면 «아무 말도 안 한다» — 「모른다」를 「오래됐다」로 몰면 딱지를 안 믿는다', () => {
  const now = Date.UTC(2026, 8, 2);
  [undefined, '', '모름', '2026-13-40', '26.1.5', '2026-02-31'].forEach(function (v) {
    assert.equal(M.issuedDaysAgo({ fields: { issueDate: v } }, now), null,
      '★★ 「' + v + '」를 날짜로 읽었습니다 — 없는 근거로 딱지를 붙이게 됩니다.');
    assert.equal(M.residentStale({ kind: 'resident', fields: { issueDate: v } }, now), false);
  });
  assert.equal(M.issuedDaysAgo({ fields: { issueDate: '2030-01-01' } }, now), null,
    '★ 앞날은 잘못 읽은 것입니다 — 그때도 말하지 않습니다.');
});

test('★★ 오래됐다고 «막지는» 않는다 — 판독이 틀리면 멀쩡한 서류가 못 들어간다', () => {
  const can = raw.slice(raw.indexOf('function canSendWorker('));
  const body = stripComments(can.slice(0, can.indexOf('\n/*')));
  /* ⚠ 대소문자를 가리면 residentStale 을 놓친다 — 돌연변이가 그대로 살아남았다 */
  assert.ok(!/stale|issuedDaysAgo/i.test(body),
    '★★ 보내기를 막으면, 발급일을 잘못 읽은 등본이 영영 못 들어갑니다.\n' +
    '  그때 어디 살았는지가 다툼거리가 되는 일도 있습니다 — 판단은 사람이 합니다.');
});

test('★ 신분증은 발급일이 오래돼도 멀쩡하다 — 등본에만 묻는다', () => {
  const now = Date.UTC(2026, 8, 2);
  assert.equal(M.residentStale({ kind: 'idcard', fields: { issueDate: '2015-01-01' } }, now), false,
    '★ 신분증에까지 딱지를 달면 거의 모든 신분증에 붙습니다 — 그러면 아무도 안 봅니다.');
});
