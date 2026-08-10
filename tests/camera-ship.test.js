/* 배송표 — 찍으면 어디로 갔는지 그 자리에서 (대표 지시 2026-08-08, 계획서 2단계)
   예전에는 찍고 **카메라를 닫고 목록을 봐야** 어디로 갔는지 알았다.
   「알아서 보낸다」는 느낌이 안 나던 진짜 이유가 이것이다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'pu-photos.html'), 'utf8');

/* shipRowOf 는 job 하나를 한 줄로 바꾸는 순수 함수라 그대로 돌릴 수 있다 */
function rowOf(job) {
  const m = html.match(/function shipRowOf\(j\)[\s\S]*?\n\}/);
  assert.ok(m, 'shipRowOf 를 찾지 못했습니다.');
  const ctx = {
    UP_STATE: { up: '올리는 중' },
    readLabel: (r) => ({ card: '명함', bizreg: '사업자등록증', meeting: '회의·현장 사진' }[r.kind] || '서류')
  };
  vm.createContext(ctx);
  vm.runInContext(m[0], ctx);
  return ctx.shipRowOf(job);
}
const done = (over) => Object.assign({ state: 'done', name: '사진' }, over);

/* ── 어디로 갔나 ── */
test('★ 명함첩으로 간 것은 명함첩이라고 적는다', () => {
  const r = rowOf(done({ _read: { kind: 'card', auto: true, fields: { name: '김철수' },
    filed: { id: 'c1' } } }));
  assert.equal(r.to, '명함첩');
  assert.equal(r.tx, '김철수');
  assert.ok(r.ok, '간 것은 ✓ 로 보여야 합니다.');
});

test('★ 업체관리까지 간 것은 둘 다 적는다', () => {
  const r = rowOf(done({ _read: { kind: 'bizreg', auto: true, fields: { company: '(주)대한산업' },
    filed: { id: 'c1' }, filedCo: { found: true, filled: ['bizNo'] } } }));
  assert.equal(r.to, '명함첩·업체관리', '업체관리에 들어간 것을 안 적으면 확인하러 또 들어가야 합니다.');
});

test('업체관리에만 간 것(중소기업확인서)', () => {
  const r = rowOf(done({ _read: { kind: 'sme', auto: true, fields: { company: '가나기업' },
    filedCo: { found: true, filled: ['companySize'] } } }));
  assert.equal(r.to, '업체관리');
});

test('회의·현장 사진은 보관이라고 적는다', () => {
  const r = rowOf(done({ _read: { kind: 'meeting', auto: true, fields: {} } }));
  assert.equal(r.to, '사진첩에 보관');
  assert.ok(!r.btn, '할 일이 없는 줄에 단추를 달면 눌러야 하는 줄 압니다.');
});

/* ── 실패를 숨기지 않는다 ── */
test('★ 검증에 걸린 것은 「확인 필요」로 보이고 누르면 열린다', () => {
  const r = rowOf(done({ _read: { kind: 'bizreg', auto: false, why: '사업자번호가 맞지 않습니다',
    fields: { company: '(주)가나' } } }));
  assert.equal(r.to, '확인 필요');
  assert.equal(r.cls, 'warn');
  assert.equal(r.act, 'shipOpen', '조용히 넘기면 못 간 걸 아무도 모릅니다.');
  assert.ok(/사업자번호/.test(r.tx), '왜 걸렸는지 그 자리에서 보여야 합니다.');
});

test('★ 보내야 하는데 안 간 것도 확인 필요다', () => {
  /* auto=true 인데 filed 가 없다 — 보내다 실패한 경우다. 조용히 넘어가면 안 된다 */
  const r = rowOf(done({ _read: { kind: 'card', auto: true, fields: { name: '박' } } }));
  assert.equal(r.to, '확인 필요');
});

test('판독이 실패한 것도 보여준다', () => {
  const r = rowOf(done({ _read: { kind: 'other', auto: false, error: 'AI가 잠시 바쁩니다' } }));
  assert.equal(r.cls, 'warn');
  assert.ok(/바쁩니다/.test(r.tx));
});

/* ── 급여서류 ── */
test('★ 급여서류는 보내지 않고 그 자리에서 지운다', () => {
  const r = rowOf(done({ _read: { kind: 'payslip', auto: true, fields: { company: '가나' } } }));
  assert.equal(r.cls, 'bad');
  assert.equal(r.act, 'shipDelete');
  assert.ok(!r.to, '어디로도 안 보냅니다 — 보관하지 않기로 한 서류입니다.');
});

/* ── 기다리는 동안 ── */
test('★ 읽는 중에도 줄이 보인다', () => {
  assert.equal(rowOf({ state: 'done', _reading: true }).to, '읽는 중…',
    '아무 줄도 없으면 고장으로 보입니다.');
  assert.equal(rowOf({ state: 'done', _queuedRead: true }).cls, 'wait');
  assert.equal(rowOf({ state: 'up', name: 'a.jpg' }).to, '올리는 중');
});

test('판독을 안 하는 사진도 줄이 남는다', () => {
  const r = rowOf(done({}));
  assert.equal(r.to, '사진첩에 보관');
});

/* ── 화면 ── */
test('★ 판독·배송을 여기서 다시 하지 않는다', () => {
  const m = html.match(/function renderShip\(\)[\s\S]*?\n\}/);
  assert.ok(m, 'renderShip 이 없습니다.');
  for (const bad of ['PuDocRead', 'sendCards', 'sendCompany', 'PuDocFile']) {
    assert.ok(!m[0].includes(bad),
      '배송표가 직접 ' + bad + ' 를 부르면 통로가 두 벌이 됩니다 — 대기열 결과만 읽어야 합니다.');
  }
});

test('★ 최근 다섯 줄만 보인다', () => {
  assert.ok(/const SHIP_MAX = 5/.test(html));
  const m = html.match(/function renderShip\(\)[\s\S]*?\n\}/);
  assert.ok(/slice\(-SHIP_MAX\)\.reverse\(\)/.test(m[0]),
    '다 보이면 배송표가 화면을 먹고 카메라가 안 보입니다. 최근 것이 위로 와야 합니다.');
});

test('★ 이번에 찍은 것만 보인다', () => {
  const m = html.match(/function renderShip\(\)[\s\S]*?\n\}/);
  assert.ok(/j\._fromCam/.test(m[0]),
    '아까 올린 것까지 섞이면 무엇이 방금 찍은 것인지 알 수 없습니다.');
  assert.ok(/_fromCam: !!\(opts && opts\.fromCam\)/.test(html), '표시를 붙이는 곳이 없습니다.');
});

test('카메라가 꺼져 있으면 안 그린다', () => {
  const m = html.match(/function renderShip\(\)[\s\S]*?\n\}/);
  assert.ok(/camOv'\)\.style\.display !== 'flex'/.test(m[0]));
});

/* ── 카메라를 켠 채로 올린다 (이 단계의 핵심) ── */
test('★ 올린 뒤 카메라가 꺼지지 않는다', () => {
  const m = html.match(/async function camUpload\(\)[\s\S]*?\n\}/);
  assert.ok(m, 'camUpload 을 찾지 못했습니다.');
  /* 명함첩에서 온 촬영(camReturnTo)은 돌아가야 해서 끈다. 포털의 빠른 촬영
     (camQuickMode)도 저장 뒤 사진첩 목록을 보여줘야 해서 끈다. 사진첩 안에서
     연 일반 촬영만 계속 찍을 수 있도록 켠 채로 둔다. */
  assert.ok(/if \(camQuickMode && !camReturnTo\) \{[\s\S]{0,140}?camDiscard\(\)/.test(m[0]),
    '포털 빠른 촬영은 저장 뒤 사진첩으로 돌아와야 합니다.');
  assert.ok(/if \(camReturnTo\) \{ camDiscard\(\); camGoBack\(\); \}/.test(m[0]),
    '명함첩에서 온 촬영은 저장 뒤 명함첩으로 돌아가야 합니다.');
  assert.ok(/camOv'\)\.style\.display = 'flex'/.test(m[0]), '카메라로 돌아와야 합니다.');
  assert.ok(/camShots = \[\]/.test(m[0]), '보낸 사진이 남아 있으면 또 올라갑니다.');
  assert.ok(/revokeObjectURL/.test(m[0]), '미리보기 주소를 안 놓으면 기억이 샙니다.');
});

test('대기열이 다시 그릴 때 배송표도 함께', () => {
  const m = html.match(/function renderUp\(\)[\s\S]*?\n  const now/);
  assert.ok(/renderShip\(\);/.test(m[0]),
    '따로 부르면 한쪽만 늦어 「읽는 중」이 안 바뀝니다.');
});

test('줄을 누르면 카메라를 닫고 그 사진을 연다', () => {
  assert.ok(/function shipOpen\(id\) \{ closeCam\(\);[\s\S]{0,80}openViewer\(id\)/.test(html));
  assert.ok(/function shipDelete\(id\) \{ closeCam\(\);[\s\S]{0,90}deleteOnePayslip\(id\)/.test(html));
});
