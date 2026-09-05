'use strict';
/* 업체 고유번호가 «온톨로지 관계망에 실린다» (대표 지시 2026-09-05: 「온톨로지에 연결될 수 있도록」)

   ■ 왜 필요한가
     관계망은 이름을 안 싣는다 — 개인정보·원본 payload 를 복제하지 않기 위해서다.
     그래서 지금까지 다른 프로그램은 관계망만 보고는 «이 개체가 어느 업체인가»를
     사람에게 말할 길이 없었다. 내부 id(co-real-074)는 사람이 쓰는 말이 아니다.

   ■ 무엇을 싣나 — «몸통만»
     고유번호 몸통(10001~99999)은 이름이 아니라 사람·엑셀·전화가 쓰라고 만든 영구 번호다.
     이름을 안 싣는 관계망에도 실을 수 있고, 실어야 번호로 같은 업체를 가리킬 수 있다.
   ■ 무엇을 안 싣나 — «머리»
     머리(자문·급여…)는 업무가 바뀌면 따라 바뀐다. 색인에 넣으면 유형이 바뀌는 날
     조용히 안 이어진다 — 연결·검색·색인은 몸통만 본다는 규칙 그대로다.

   ⚠ 이름표(label)는 여전히 실리면 안 된다. 그 규칙까지 함께 지킨다. */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ctx = { window: {}, console: { log() {}, warn() {}, error() {} } };
ctx.globalThis = ctx; ctx.self = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'pu-ontology.js'), 'utf8'), ctx);
const O = ctx.window.PuOntology;
assert.ok(O, 'PuOntology 를 못 읽었습니다');

/* 업체 둘 — 하나는 번호 있음, 하나는 아직 없음 */
const DATA = {
  companies: [
    { id: 'co-a', name: '㈜상원화성', typeCode: '자문', puNo: 10001, puNoHead: '자문' },
    { id: 'co-b', name: '번호없는곳', typeCode: '급여' },
  ],
};

function snapshot() {
  const report = O.audit(DATA);
  return O.buildSnapshot(report, {});
}

test('★★ 진단 결과의 업체 개체가 고유번호 몸통을 들고 있다', () => {
  const report = O.audit(DATA);
  const rows = Object.keys(report.entities).map((k) => report.entities[k]).filter((e) => e.type === 'Organization');
  const a = rows.find((e) => e.id === 'co-a');
  const b = rows.find((e) => e.id === 'co-b');
  assert.ok(a, '업체 개체를 못 찾았습니다');
  assert.strictEqual(a.no, 10001, '고유번호 몸통이 개체에 안 달렸습니다');
  assert.ok(!b.no, '번호가 없는 곳에 없는 번호가 생겼습니다');
});

test('★★ 관계망(올릴 것)에도 몸통이 실린다 — 다른 프로그램이 번호로 잇는다', () => {
  const snap = snapshot();
  const box = snap.partitions.internal.entities;
  const rows = Object.keys(box).map((k) => box[k]).filter((e) => e.type === 'Organization');
  const a = rows.find((e) => e.id === 'co-a');
  assert.ok(a, '관계망에 업체 개체가 없습니다');
  assert.strictEqual(a.no, 10001, '관계망에 고유번호가 안 실렸습니다 — 번호로 이을 수가 없습니다');
});

test('★★ 머리는 안 실린다 — 업무가 바뀌면 따라 바뀌므로 색인에 넣으면 안 된다', () => {
  const snap = snapshot();
  const box = snap.partitions.internal.entities;
  Object.keys(box).forEach((k) => {
    const s = JSON.stringify(box[k]);
    assert.ok(!/자문|급여|노조|기금|대행/.test(s),
      '관계망 개체에 머리가 실렸습니다 (' + k + ') — 유형이 바뀌는 날 조용히 안 이어집니다');
  });
});

test('★★ 이름표는 여전히 안 실린다 (원본 payload 복제 금지)', () => {
  const snap = snapshot();
  ['internal', 'source', 'personal', 'financial'].forEach((vis) => {
    const box = (snap.partitions[vis] || {}).entities || {};
    Object.keys(box).forEach((k) => {
      assert.ok(!('label' in box[k]), vis + '/' + k + ' 에 이름표가 실렸습니다');
      assert.ok(!/상원화성|번호없는곳/.test(JSON.stringify(box[k])), vis + '/' + k + ' 에 업체 이름이 새어 들어갔습니다');
    });
  });
});

test('번호가 실려도 검증을 그대로 지난다 (민감칸 규칙과 안 부딪힌다)', () => {
  const snap = snapshot();
  const checked = O.validateSnapshot(snap);
  assert.strictEqual(checked.ok, true, '검증 실패: ' + (checked.errors || []).join(', '));
});

test('범위 밖 번호는 관계망에 안 실린다 — 진단을 거쳐 들어온 길', () => {
  const bad = { companies: [{ id: 'co-x', name: 'X', typeCode: '자문', puNo: 999 }] };
  const snap = O.buildSnapshot(O.audit(bad), {});
  const box = snap.partitions.internal.entities;
  Object.keys(box).forEach((k) => assert.ok(!box[k].no, '쓸 수 없는 번호가 실렸습니다'));
});

/* ★ buildSnapshot 은 «진단을 거치지 않은» 결과도 받는다(공개 함수다).
   그 길로 쓸 수 없는 번호가 들어오면 관계망에 그대로 실릴 수 있어, 여기서도 막는다.
   ⚠ 이 시험이 없으면 buildSnapshot 안의 범위 검사를 지워도 아무도 모른다
     — 진단이 이미 걸러 주기 때문이다(되돌림 시험으로 실제로 확인했다). */
test('★★ 진단을 안 거치고 들어온 쓸 수 없는 번호도 관계망에서 막는다', () => {
  function snapOf(no) {
    return O.buildSnapshot({
      readOnly: true, edges: [],
      entities: { 'Organization|co-y': { type: 'Organization', id: 'co-y', program: 'erp', source: 'companies', no: no } },
    }, {});
  }
  [999, 100000, 10001.5, '아무말', -1].forEach((bad) => {
    const box = snapOf(bad).partitions.internal.entities;
    Object.keys(box).forEach((k) => assert.ok(!box[k].no,
      '쓸 수 없는 번호(' + bad + ')가 관계망에 실렸습니다'));
  });
  /* 쓸 수 있는 번호는 그대로 실린다 — 막기만 하고 통과를 못 시키면 뜻이 없다 */
  const okBox = snapOf(10042).partitions.internal.entities;
  assert.strictEqual(okBox['Organization|co-y'].no, 10042);
});
