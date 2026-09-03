'use strict';
/* 👷 근로자 정보함 — 사진첩 서류를 «사람»에게 잇는다 (대표 결정 2026-09-01)
   ═══════════════════════════════════════════════════════════════════════════
   ■ 대표 지시·결정
     「근로자 정보함을 별도로 만들고 싶다. 사건 등과 관련해서 근로자 정보를
      사진첩에서 당겨올 경우 연결시켜 만들고 싶다」
     ① 같은 사람 판정 = **이름 + 회사**
     ② 급여명세서에서 **이름을 읽는다**(금액은 그대로 안 읽는다)
     ③ 주민번호는 가려서 보이고 눌러야 나온다
     ④ 집단 진정은 목록에서 한 줄로 접는다(검토안 ㉯)

   ■ ⚠⚠ 여기서 가장 센 검사
     이 자리에 가는 것은 「이 서류가 누구 것인가」 **하나**다.
     주민번호·주소·연락처는 한 글자도 안 간다 — 그것은 이알피 사건 안에 이미 있고,
     이 자리(pucards 아래)는 직원 누구나 읽는다. 두 벌이 되면 한쪽만 좁혀진다.

   ■ 회사를 못 읽으면 «안 붙인다»
     열쇠가 「이름 + 회사」인데 회사가 비면, 회사 없는 것끼리 묶여 남남인 「김수」
     둘이 한 사람이 된다. 사건 서류에서 그것은 사고다.

   실행: node --test tests/cards-worker-box.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { cutFn } = require('./cut-fn');

const R = path.join(__dirname, '..');
const FILE_SRC = fs.readFileSync(path.join(R, 'js', 'pu-doc-file.js'), 'utf8');
const APP = fs.readFileSync(path.join(R, 'pu-photos.html'), 'utf8');
const READ_SRC = fs.readFileSync(path.join(R, 'js', 'pu-doc-read.js'), 'utf8');

function rig(tree) {
  const updates = [];
  const reads = [];
  const db = {
    ref: function (p) {
      return {
        once: function () {
          reads.push(p);
          const v = Object.prototype.hasOwnProperty.call(tree, p) ? tree[p] : null;
          return Promise.resolve({ val: function () { return v; } });
        },
        update: function (u) { updates.push(u); return Promise.resolve(); }
      };
    }
  };
  const ctx = { console, Promise, Object, Array, String, Number, Date, JSON };
  ctx.window = ctx; ctx.globalThis = ctx; ctx.self = ctx;
  vm.createContext(ctx);
  vm.runInContext(FILE_SRC, ctx);
  ctx.PuDocFile.init({ db: db });
  return { F: ctx.PuDocFile, updates: updates, reads: reads };
}

const PH = { year: '2026', id: '-Oabc123', owner: 'u1' };

/* ══════════════ ① 사람 열쇠 = 이름 + 회사 ══════════════ */

test('★ 열쇠는 이름과 회사를 «함께» 쓴다 — 이름만으로는 동명이인이 한 사람이 된다', () => {
  const { F } = rig({});
  const a = F.workerKey('김수', '(주)대명크라샤');
  const b = F.workerKey('김수', '해찬솔에프쓰리');
  assert.ok(a && b, '열쇠가 만들어져야 합니다');
  assert.notEqual(a, b, '★ 회사가 다른 같은 이름이 한 열쇠가 됐습니다 — 남의 서류가 붙습니다');
});

test('★ 회사 표기가 달라도 같은 사람이다 — 「(주)가나」·「가나 」·「가나㈜」', () => {
  const { F } = rig({});
  const k = F.workerKey('김수', '(주)가나');
  assert.equal(F.workerKey('김수', '가나 '), k);
  assert.equal(F.workerKey('김수', '가나㈜'), k);
  assert.equal(F.workerKey('김수', '주식회사 가나'), k);
});

test('★★ 회사나 이름이 비면 열쇠를 «안 만든다» — 빈 것끼리 묶이면 남남이 한 사람이 된다', () => {
  const { F } = rig({});
  assert.equal(F.workerKey('김수', ''), '');
  assert.equal(F.workerKey('', '(주)가나'), '');
  assert.equal(F.workerKey('  ', '  '), '');
});

test('이름에 점이 있어도 자리 이름으로 쓸 수 있다 — 실시간DB 가 못 받는 글자를 바꾼다', () => {
  const { F } = rig({});
  const k = F.workerKey('김.수', '(주)가나');
  assert.ok(k, '열쇠가 있어야 합니다');
  assert.doesNotMatch(k, /[.#$/[\]]/, '실시간DB 자리 이름에 못 쓰는 글자가 남았습니다');
});

/* ══════════════ ② 한 장이 여러 사람에게 ══════════════ */

test('한 사람 것이면 name 하나로 붙는다 — 신분증·위임장이 그렇다', () => {
  const { F } = rig({});
  const t = F.workerDocTargets({
    kind: 'idcard', photo: PH,
    fields: { company: '가나', name: '강석', docName: '주민등록증' }
  });
  assert.equal(t.targets.length, 1);
  assert.equal(t.targets[0].doc.docName, '주민등록증');
});

test('★★ 회사를 못 읽으면 «아무것도 안 붙이고» 그 까닭을 말한다', () => {
  const { F } = rig({});
  const t = F.workerDocTargets({
    kind: 'idcard', photo: PH,
    fields: { name: '강석', docName: '주민등록증' }
  });
  assert.equal(t.targets.length, 0, '★★ 회사 없이 붙었습니다 — 남남이 한 사람이 됩니다');
  assert.equal(t.skipped.length, 1, '건너뛴 사람마다 까닭이 있어야 합니다');
  t.skipped.forEach(function (s) {
    assert.match(s.why, /회사/, '왜 못 붙였는지 사람 말로 적혀야 합니다: ' + s.why);
  });
});

test('근로자 서류가 아닌 갈래는 아예 안 건드린다 — 명함·등록증은 회사로 간다', () => {
  const { F } = rig({});
  /* ⚠ timesheet·payslip 이 여기 있는 것이 요점이다 (대표 지시 2026-09-02) */
  ['card', 'bizreg', 'sme', 'contract', 'meeting', 'chat', 'cms', 'bankbook', 'form',
   'timesheet', 'payslip'].forEach(function (k) {
    const t = F.workerDocTargets({ kind: k, photo: PH, fields: { company: '가나', name: '강석' } });
    assert.equal(t.targets.length, 0, k + ' 이 근로자에게 붙었습니다');
  });
});

test('사진을 가리킬 수 없으면 안 붙인다 — 나중에 그 서류를 찾을 길이 없다', () => {
  const { F } = rig({});
  const t = F.workerDocTargets({ kind: 'idcard', fields: { company: '가나', name: '강석' } });
  assert.equal(t.targets.length, 0);
  assert.equal(t.skipped.length, 1);
});

/* ══════════════ ③ ⚠⚠ 민감정보가 «한 글자도» 안 간다 ══════════════ */

test('★★★ 주민번호·주소·연락처는 근로자 정보함으로 «한 글자도» 안 간다', () => {
  const { F } = rig({});
  const t = F.workerDocTargets({
    kind: 'idcard', photo: PH,
    fields: {
      company: '가나', name: '강석', docName: '주민등록증',
      /* 판독기는 애초에 이 셋을 안 읽는다. 그래도 어디선가(손 입력·옛 기록) 들어올 수
         있으니 «보내는 층»에서도 막는다 — 문이 하나면 그 하나가 열리는 날 다 나간다. */
      rrn: '900101-1234567', address: '충남 천안시 …', phone: '010-1234-5678',
      email: 'a@b.com', mobile: '010-1234-5678', birth: '1990-01-01',
      pairs: [{ k: '주민등록번호', v: '900101-1234567' }]
    }
  });
  assert.equal(t.targets.length, 1);
  const flat = JSON.stringify(t.targets[0].doc);
  ['900101', '1234567', '충남', '010-1234-5678', 'a@b.com', '1990-01-01'].forEach(function (bad) {
    assert.ok(flat.indexOf(bad) < 0,
      '★★★ 「' + bad + '」 이 근로자 정보함으로 갑니다: ' + flat +
      '\n  이 자리는 직원 누구나 읽습니다. 담을 것은 「누구 것인가」 하나입니다.');
  });
});

test('★★ 담기는 칸이 «정해진 것뿐»이다 — 새 칸이 조용히 늘면 여기서 멈춘다', () => {
  const { F } = rig({});
  const t = F.workerDocTargets({
    kind: 'idcard', photo: PH,
    fields: { company: '가나', name: '강석', docName: '주민등록증', period: '', rrn: '900101-1' }
  });
  const keys = Object.keys(t.targets[0].doc).sort();
  assert.deepEqual(keys, ['at', 'docName', 'kind', 'period', 'photo'],
    '★★ 담는 칸이 바뀌었습니다 — 늘릴 때는 그 칸이 민감한지 먼저 보세요: ' + keys.join(','));
});

/* ══════════════ ④ 보내기 — 값을 안 덮고, 두 번 안 쓴다 ══════════════ */

test('★ 처음 보내면 이름·회사·서류가 함께 적힌다', async () => {
  const { F, updates } = rig({});
  const res = await F.sendToWorkerMany([{
    kind: 'idcard', photo: PH, at: 1756000000000,
    fields: { company: '(주)가나', name: '강석', docName: '주민등록증' }
  }]);
  assert.equal(res.people, 1);
  assert.equal(res.sent, 1);
  assert.equal(updates.length, 1, '한 번에 써야 합니다 — 사람마다 오가면 요금이 늡니다');
  const u = updates[0];
  const paths = Object.keys(u);
  assert.ok(paths.some(p => /\/name$/.test(p)), '이름 자리가 없습니다: ' + paths.join(' '));
  assert.ok(paths.some(p => /\/docs\/2026_-Oabc123$/.test(p)), '서류 자리가 없습니다: ' + paths.join(' '));
  paths.forEach(function (p) {
    assert.match(p, /^pucards\/workerInfo\//, '엉뚱한 자리에 씁니다: ' + p);
  });
});

test('★ 사람이 고쳐 둔 이름·회사를 «안 덮는다»', async () => {
  const { F, updates } = rig({
    'pucards/workerInfo/가나__강석': { name: '강○석', company: '주식회사 가나' }
  });
  await F.sendToWorkerMany([{
    kind: 'idcard', photo: PH, fields: { company: '(주)가나', name: '강석', docName: '주민등록증' }
  }]);
  const u = updates[0] || {};
  Object.keys(u).forEach(function (p) {
    assert.doesNotMatch(p, /\/(name|company)$/, '★ 사람이 고친 값을 덮었습니다: ' + p);
  });
});

test('★ 이미 붙어 있는 서류는 «다시 안 쓴다» — 같은 값을 덮어써도 요금은 든다', async () => {
  const { F, updates } = rig({
    'pucards/workerInfo/가나__강석': {
      name: '강석', company: '가나',
      docs: { '2026_-Oabc123': { kind: 'idcard', at: 1 } }
    }
  });
  const res = await F.sendToWorkerMany([{
    kind: 'idcard', photo: PH, fields: { company: '가나', name: '강석', docName: '주민등록증' }
  }]);
  assert.equal(res.already, 1);
  assert.equal(res.sent, 0);
  assert.equal(updates.length, 0, '★ 쓸 것이 없는데 서버에 썼습니다');
});

test('붙일 사람이 없으면 서버를 아예 안 만진다', async () => {
  const { F, updates, reads } = rig({});
  const res = await F.sendToWorkerMany([{ kind: 'timesheet', photo: PH, fields: { rows: [{ name: '강석' }] } }]);
  assert.equal(res.people, 0);
  assert.equal(updates.length, 0);
  assert.equal(reads.length, 0, '읽기조차 없어야 합니다');
});

/* ══════════════ ⑤ 두 목록이 어긋나지 않는다 ══════════════ */

test('★★ 사진첩의 갈래 목록이 보내는 층 목록 «안에» 있다 — 어긋나면 단추만 뜨고 값이 안 간다', () => {
  const { F } = rig({});
  const m = APP.match(/^const WORKER_KINDS = \{([^}]*)\};/m);
  assert.ok(m, '사진첩의 WORKER_KINDS 를 못 찾았습니다');
  const app = m[1].split(',').map(s => s.split(':')[0].trim()).filter(Boolean);
  assert.ok(app.length >= 4, '넷은 있어야 합니다: ' + app.join(','));
  app.forEach(function (k) {
    assert.ok(F.WORKER_DOC_KINDS[k],
      '★★ 사진첩은 ' + k + ' 를 보내려 하는데 보내는 층이 안 받습니다 — 값이 안 갑니다');
  });
});

test('★★ 민감으로 정한 근로자 서류 넷이 모두 이 길을 탄다', () => {
  const { F } = rig({});
  ['idcard', 'resident', 'mandate', 'consent'].forEach(function (k) {
    assert.ok(F.WORKER_DOC_KINDS[k], k + ' 가 근로자 정보함으로 갈 길이 없습니다');
  });
});

/* ══════════════ ⑥ 사진첩 — 할 일과 단추 ══════════════ */

function photoCtx() {
  /* ⚠ 2026-09-02 ✏ 이름·회사 채우기 — canSendWorker·workerWhyNot 이 이제 FIX_KEYS·
     readFields() 를 지난다. 안 실으면 그 자리에서 멎어 이 아래가 통째로 운다. */
  const consts = ['MIN_READ_EDGE', 'KEEP_ONLY', 'CARD_KINDS', 'CO_KINDS', 'WORKER_KINDS',
    'FIX_KEYS', 'TEL_SHAPE', 'MAIL_SHAPE'].map(function (n) {
    const i = APP.indexOf('const ' + n + ' =');
    assert.ok(i > 0, n + ' 를 찾지 못했습니다');
    return APP.slice(i, APP.indexOf(';', i) + 1);
  }).join('\n');
  const rules = ['READ_FAIL_RULES', 'FAIL_GIVEUP'].map(function (n) {
    const m = APP.match(new RegExp('^const ' + n + ' = [\\s\\S]*?;$', 'm'));
    assert.ok(m, n + ' 를 찾지 못했습니다');
    return m[0];
  }).join('\n');
  const fns = ['readAnyField', 'tooSmall', 'smallCheckedOk', 'coFilledOk', 'coTodo',
    'readFailKind', 'readFailAdvice', 'canSendCoInfo', 'formTodo', 'chatTodo',
    'readFields', 'canSendWorker', 'workerWhyNot',
     /* ⚠ 2026-09-02 💰 임금 확인 */
    'wageRead', 'wageOkOf', 'wageBoxOn', 'wageNeedsOk', 
    'checkWhy', 'needsCheck']
    .map(function (n) { return cutFn(APP, 'function ' + n + '('); }).join('\n');
  const ctx = { Math, Number, String, Object, Boolean, Date, RegExp, Array };
  vm.createContext(ctx);
  vm.runInContext(consts + '\n' + rules + '\n' + fns, ctx);
  return ctx;
}

const big = read => ({ meta: { w: 2000, h: 2800, read: read } });

test('★★ 근로자 서류 넷은 «근로자 정보함으로 보내기»가 할 일이다', () => {
  const c = photoCtx();
  ['idcard', 'resident', 'mandate', 'consent'].forEach(function (k) {
    const it = big({ kind: k, auto: false, fields: { name: '강석', company: '해찬솔에프쓰리' } });
    assert.equal(c.needsCheck(it), true, k + ' 이 할 일이 아닙니다');
    assert.match(c.checkWhy(it), /근로자 정보함/,
      '★★ ' + k + ' 의 이유가 「' + c.checkWhy(it) + '」 입니다 — 2026-08-10 계약서처럼 틀린 이유가 붙었습니다');
  });
});

test('★ 보낸 뒤에는 할 일이 아니다 — 치울 수 없는 ⚠ 를 만들지 않는다', () => {
  const c = photoCtx();
  const it = big({ kind: 'idcard', auto: false, fields: { name: '강석', company: '가나' },
                   filedWk: { at: 1756000000000, n: 1 } });
  assert.equal(c.needsCheck(it), false);
  assert.equal(c.checkWhy(it), '');
});

test('★ 회사를 못 읽었으면 «왜 못 보내는지»를 말한다 — 단추만 없으면 사람이 헤맨다', () => {
  const c = photoCtx();
  const it = big({ kind: 'idcard', auto: false, fields: { name: '강석' } });
  assert.equal(c.canSendWorker(it.meta.read), false, '회사 없이 보낼 수 있으면 안 됩니다');
  assert.match(c.checkWhy(it), /회사/, '왜 못 보내는지 적혀야 합니다: ' + c.checkWhy(it));
});

test('★ 이름도 회사도 못 읽었으면 이름부터 말한다', () => {
  const c = photoCtx();
  const it = big({ kind: 'idcard', auto: false, fields: {} });
  assert.match(c.checkWhy(it), /이름/, c.checkWhy(it));
});

test('★★ 통장·계좌가 기업 상세로 간다 — 2026-08-31 부터 갈 곳이 없었다', () => {
  const c = photoCtx();
  const read = { kind: 'bankbook', auto: true,
    fields: { company: '아이행복어린이집', bankName: '국민은행',
              bankAcct: '123456-04-567890', bankHolder: '양유정' } };
  assert.equal(c.canSendCoInfo(read), true, '★★ 통장이 기업 상세로 갈 길이 없습니다');
  assert.match(c.checkWhy(big(read)), /기업 상세/, c.checkWhy(big(read)));
});

test('★ 통장을 이미 보냈으면 할 일이 아니다', () => {
  const c = photoCtx();
  const it = big({ kind: 'bankbook', auto: true,
    fields: { company: '아이행복어린이집', bankName: '국민은행',
              bankAcct: '1', bankHolder: '양유정' },
    filedInfo: { at: 1756000000000, n: 3 } });
  assert.equal(c.needsCheck(it), false);
});

/* ══════════════ ⑦ 이미 읽어 둔 것을 조용히 잇는다(wkSweep) ══════════════ */

/* ══════════════ ⑧ 판독기 쪽 짝 ══════════════ */

/* ══════════════ ⑨ 근태표·급여서류는 «사람을 만들지 않는다» ══════════════
   대표 지시 2026-09-02 「근태표등은 필요없다. 주로 푸른이알피에서 근로자 사건등에
   대한 부분이다」. 한 번 넣어 봤더니 근태표 한 장에 적힌 정육식당 일곱 명이
   근로자 정보함 목록 앞머리를 통째로 먹었다 — 근태표에 이름이 있다는 것은
   「그 달에 일했다」는 뜻일 뿐, 우리가 그 사람 일을 맡았다는 뜻이 아니다. */

test('★★★ 근태표를 보내도 «아무에게도» 안 붙는다', () => {
  const { F } = rig({});
  const t = F.workerDocTargets({
    kind: 'timesheet', photo: PH,
    fields: { company: '해찬솔에프쓰리', rows: [{ name: '강석' }, { name: '고민' }] }
  });
  assert.equal(t.targets.length, 0,
    '★★★ 근태표가 사람에게 붙었습니다 — 목록이 근태표 이름으로 덮입니다');
});

test('★★★ 급여서류도 «아무에게도» 안 붙는다', () => {
  const { F } = rig({});
  const t = F.workerDocTargets({
    kind: 'payslip', photo: PH, fields: { company: '가나', name: '강석' }
  });
  assert.equal(t.targets.length, 0, '★★★ 급여서류가 사람에게 붙었습니다');
});

test('★★ 받는 갈래에 근태표·급여서류가 «없다»', () => {
  /* ⚠ 「정확히 넷」으로 못 박았다가 2026-09-02 에 깨졌다 — 다른 세션이 근로계약서
     (wcontract)를 옳게 더했는데 그것이 걸렸다. 갈래는 앞으로도 늘 수 있다.
     지켜야 하는 규칙은 «근태표·급여서류가 없다»는 것뿐이다. */
  const { F } = rig({});
  const got = Object.keys(F.WORKER_DOC_KINDS);
  ['timesheet', 'payslip'].forEach(function (k) {
    assert.ok(!F.WORKER_DOC_KINDS[k],
      '★★ ' + k + ' 가 되살아났습니다: ' + got.join(',') +
      '\n  근태표 한 장에 적힌 이름들이 사람으로 목록에 쌓입니다(2026-09-02 대표 화면).');
  });
  ['idcard', 'resident', 'mandate', 'consent'].forEach(function (k) {
    assert.ok(F.WORKER_DOC_KINDS[k], k + ' 가 사라졌습니다 — 민감 서류가 갈 곳을 잃습니다');
  });
});

test('★★ 사진첩에 «조용히 잇는» 길이 없다 — 그것이 목록을 덮었다', () => {
  assert.doesNotMatch(APP, /function wkSweep\(/,
    '★★ wkSweep 이 되살아났습니다 — 근태표가 다시 사람을 만듭니다');
  assert.doesNotMatch(APP, /function wkWaiting\(/, '★★ wkWaiting 이 되살아났습니다');
  assert.doesNotMatch(APP, /wkSweep\(\);/, '★★ wkSweep 을 부르는 자리가 되살아났습니다');
});

test('★ 여러 장을 한 번에 보내도 «쓰기는 한 번»이다', async () => {
  const { F, updates } = rig({});
  const list = [];
  for (let i = 0; i < 12; i++) {
    list.push({ kind: 'idcard', photo: { year: '2026', id: 'p' + i, owner: 'u1' },
      fields: { company: '해찬솔에프쓰리', name: '사람' + i, docName: '주민등록증' } });
  }
  const res = await F.sendToWorkerMany(list);
  assert.equal(res.people, 12);
  assert.equal(updates.length, 1, '★ 쓰기가 ' + updates.length + '번입니다 — 한 번이어야 합니다');
});

/* ══════════════ ⑤ 같은 칸을 «두 번» 읽지 않는다 (2026-09-03 검토에서 찾음) ══════════════

   겹침을 물어보는 길이 생기면서(2026-09-03), 사람 칸을 findWorkerDupes 가 한 번 읽고
   곧바로 sendToWorkerMany 가 **또 읽었다.** 겹치지 않는 «흔한 길»에서 왕복이 두 배였다.
   ⚠ 그렇다고 아무 때나 물려주면 안 된다 — 사람이 답할 때까지 기다린 뒤에 쓰면
     그 사이 남이 채워 둔 이름을 옛 값으로 덮는다. 그 경계를 함께 못박는다. */

const ONE = [{ kind: 'idcard', photo: PH,
  fields: { company: '해찬솔에프쓰리', name: '강석', docName: '주민등록증' } }];

test('★★ 겹침을 찾고 곧바로 보내면 사람 칸을 «한 번만» 읽는다', async () => {
  const { F, reads } = rig({});
  const got = {};
  const dupes = await F.findWorkerDupes(ONE, got);
  assert.equal(dupes.length, 0, '겹치는 것이 없어야 하는 표본입니다');
  const afterFind = reads.length;
  assert.equal(afterFind, 1, '찾을 때 한 번 읽습니다');
  await F.sendToWorkerMany(ONE, got.rows);
  assert.equal(reads.length, afterFind,
    '★★ 방금 읽은 것을 넘겼는데 또 읽었습니다(' + (reads.length - afterFind) + '번) —\n' +
    '  겹치지 않는 흔한 길에서 왕복이 두 배가 됩니다.');
});

test('★★ 안 넘기면 «제대로» 읽는다 — 물려주기가 읽기를 없애 버리면 안 된다', async () => {
  const { F, reads, updates } = rig({});
  await F.sendToWorkerMany(ONE);
  assert.equal(reads.length, 1, '★★ 안 읽고 쓰면 이름·회사를 덮어씁니다');
  assert.equal(updates.length, 1);
});

test('★★★ 아는 사람이 빠진 것을 넘기면 «통째로 다시» 읽는다 — 반만 새 값이면 못 짚는다', async () => {
  const { F, reads } = rig({});
  const two = ONE.concat([{ kind: 'idcard', photo: { year: '2026', id: 'p2', owner: 'u1' },
    fields: { company: '해찬솔에프쓰리', name: '박선희', docName: '주민등록증' } }]);
  await F.sendToWorkerMany(two, { '해찬솔에프쓰리__강석': {} });   // 한 사람만 아는 값
  assert.equal(reads.length, 2,
    '★★★ 반쪽짜리를 그대로 믿었습니다 — 모르는 사람의 이름·회사를 빈 칸으로 보고 덮습니다');
});

test('★★★ 물려받은 값으로도 «사람이 고쳐 둔 이름»을 안 덮는다', async () => {
  const { F, updates } = rig({
    'pucards/workerInfo/해찬솔에프쓰리__강석': { name: '강○석', company: '해찬솔' }
  });
  const got = {};
  await F.findWorkerDupes(ONE, got);
  await F.sendToWorkerMany(ONE, got.rows);
  const paths = Object.keys(updates[0] || {});
  assert.ok(!paths.some(p => /\/name$/.test(p)),
    '★★★ 사람이 고쳐 둔 이름을 판독값으로 덮었습니다: ' + paths.join(' '));
  assert.ok(!paths.some(p => /\/company$/.test(p)), '★★★ 회사도 덮었습니다');
});

test('★★ 이미 붙어 있는 서류는 물려받은 값으로도 «다시 안 쓴다»', async () => {
  /* 이름·회사까지 이미 차 있는 자리다 — 그래야 「쓸 것이 하나도 없다」를 볼 수 있다
     (이름이 비어 있으면 그 칸을 채우느라 쓰기가 한 번 일어난다). */
  const { F, updates } = rig({
    'pucards/workerInfo/해찬솔에프쓰리__강석': {
      name: '강석', company: '해찬솔에프쓰리',
      docs: { '2026_-Oabc123': { kind: 'idcard' } }
    }
  });
  const got = {};
  await F.findWorkerDupes(ONE, got);
  const res = await F.sendToWorkerMany(ONE, got.rows);
  assert.equal(res.already, 1, '★★ 이미 있는 것을 「새로 보냄」으로 셌습니다');
  assert.equal(res.sent, 0);
  assert.equal(updates.length, 0, '★★ 같은 값을 덮어써도 요금은 듭니다');
});

test('★★ 사람이 «답한 뒤» 가는 길에는 물려주지 않는다 — 그 사이 값이 바뀐다', () => {
  /* 바꾸기·둘 다 두기는 사람이 창을 보고 고른 뒤에 간다. 그 길에 rows 를 실어 보내면
     기다린 동안 남이 채워 둔 이름·회사를 옛 값으로 덮는다. */
  ['dupReplace', 'dupKeepBoth'].forEach(function (name) {
    const fn = cutFn(APP, 'function ' + name + '(');
    assert.ok(fn.indexOf('rows') < 0,
      '★★ ' + name + ' 이 옛 값을 실어 보냅니다 — 기다린 동안 바뀐 값을 덮습니다');
    assert.match(fn, /force: true/, '★ 그 길은 다시 묻지 않고 보냅니다');
  });
  /* 곧바로 가는 길에서만 실어 보낸다 */
  const send = cutFn(APP, 'function sendWorker(');
  assert.match(send, /\{ force: true, rows: got\.rows \}/,
    '★★ 겹치지 않을 때 방금 읽은 것을 안 넘기면 같은 칸을 또 읽습니다');
});
