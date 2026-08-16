/* 입금확정 성과급 구역 화면 규칙 (2026-08-16 대표 지시 — 안 A)
   요율은 잠그고, 숫자 칸은 분할 하나만 남기고, 0원이면 막는다. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'pu-erp.html'), 'utf8');
const _s = SRC.indexOf("'⭐ 성과급 — 확정하면 이렇게 나뉩니다'");
const _e = SRC.indexOf('확정 시 — 입금 기록', _s);
assert.ok(_s > 0 && _e > _s, '성과급 구역을 찾지 못했다');
const UI = SRC.slice(_s, _e);

test('요율 칸이 기본으로 열려 있지 않다', () => {
  /* ★ 지금은 늘 열려 있어 실수로 만지면 「변경 사유」가 필수가 되고 확정이 막힌다 —
     무엇을 만졌는지 모른 채 막히는 것이 제일 나쁘다 */
  assert.strictEqual(/rateOpen/.test(UI), true);
  assert.strictEqual(/요율 조정/.test(UI), true);
});

test('열 이름표가 있다', () => {
  assert.strictEqual(/'담당'/.test(UI), true);
  assert.strictEqual(/'분할'/.test(UI), true);
  assert.strictEqual(/'받을 금액'/.test(UI), true);
});

test('나누기를 껐을 때와 켰을 때 열 순서가 같다', () => {
  /* ★ 전에는 끄면 「분할→요율」, 켜면 「요율→분할」로 뒤집혔다 — 실수의 첫째 원인 */
  const heads = UI.match(/h\('span', \{ style:\{textAlign:'(right|center)'\} \}, '[^']+'\)/g) || [];
  assert.strictEqual(heads.some(x => /'요율'/.test(x)), false, '요율은 이제 열이 아니라 이름 아래 글씨다');
  const grids = UI.match(/gridTemplateColumns:'26px 1fr 70px 88px'/g) || [];
  assert.ok(grids.length >= 3, '끔·켬·머리줄이 같은 격자를 쓴다 (지금 ' + grids.length + ')');
});

test('분배에서 빠진 사람은 까닭이 함께 보인다', () => {
  assert.strictEqual(/성과급 대상 아님/.test(UI), true);
  assert.strictEqual(/수습 · 미지급/.test(UI), true);
  assert.strictEqual(/퇴사 · 미지급/.test(UI), true);
});

test('못 받는 사람에게는 분할 칸을 주지 않는다', () => {
  /* 0% 를 적을 수 있게 두면 「왜 0원이지」를 그 칸에서 찾게 된다.
     ★ 「_canGet 이 쓰인다」만 보면 부족하다 — 빠진 사람 자리에 «줄표» 가 그려지고
       입력칸이 그 «반대쪽 갈래» 에 있어야 한다. 그러지 않으면 갈래를 지워도 안 잡힌다. */
  assert.strictEqual(/_canGet\(/.test(UI), true);
  assert.strictEqual(/분배 제외/.test(UI), true);
  assert.strictEqual(/!can\s*\r?\n?\s*\?[\s\S]{0,160}'—'/.test(UI), true,
    '빠진 사람 자리에는 줄표를 그려야 한다 (입력칸이 아니라)');
  assert.strictEqual(/'—'\)[\s\S]{0,600}?type:'number'/.test(UI), true,
    '분할 입력칸은 줄표의 반대쪽 갈래에 있어야 한다');
});

test('까닭을 스스로 판정하지 않고 저장 함수가 붙인 표를 읽는다', () => {
  /* 여기서 다시 판정하면 언젠가 저장값과 어긋난다 */
  const why = SRC.slice(SRC.indexOf('var _why = {}'), SRC.indexOf('var _eligN'));
  assert.strictEqual(/s\.probation/.test(why) && /s\.retired/.test(why), true);
  assert.strictEqual(/isProbationary|u\.retireDate/.test(why), false);
});

test('빠른 단추가 셋 있다', () => {
  assert.strictEqual(/반반/.test(UI), true);
  assert.strictEqual(/주담당 70:30/.test(UI), true);
  assert.strictEqual(/주담당이 다/.test(UI), true);
});

test('빠른 단추도 손으로 고칠 때와 같은 함수를 거친다', () => {
  /* 단추가 따로 셈하면 손으로 고칠 때와 결과가 달라진다 */
  const q = UI.slice(UI.indexOf('빠른 단추'), UI.indexOf('열 이름표'));
  assert.strictEqual(/setMainPct\(/.test(q), true);
});

test('반반 단추가 설정값을 따른다', () => {
  /* 50 을 박지 않는다 — 환경설정을 바꾸면 단추도 따라가야 한다 */
  const q = UI.slice(UI.indexOf('빠른 단추'), UI.indexOf('열 이름표'));
  assert.strictEqual(/erpPerfMainPct\(\)/.test(q), true);
});

test('초록 ✓ 대신 총 성과급을 보여 준다', () => {
  /* ★ ✓ 는 「합계가 100」만 뜻하는데 사람은 「다 맞았다」로 읽는다 */
  assert.strictEqual(/'총 성과급'/.test(UI), true);
  // 따옴표까지 본다 — 주석에 적힌 낱말에 속지 않으려면 «그려지는 글자» 여야 한다
  assert.strictEqual(/'분배 합계'/.test(UI), false, '옛 「분배 합계 ✓」 줄이 남아 있다');
});

test('아무도 못 받으면 빨간 경고가 뜬다', () => {
  assert.strictEqual(/아무도 성과급을 못 받습니다/.test(UI), true);
});

test('나누기를 끈 상태에서도 0원이면 알린다', () => {
  /* 켰을 때만 알리면 「끄고 확정」이 그물을 빠져나가는 길이 된다 */
  assert.strictEqual(/!split && _perfZero/.test(UI), true);
});

/* ── 확정 단추 ── */
const FOOT = SRC.slice(SRC.indexOf("h('div', { className:'modal-f' }", _s), SRC.indexOf("h('div', { className:'modal-f' }", _s) + 3000);

test('0원이면 확정 단추가 막힌다', () => {
  assert.strictEqual(/disabled: !valid \|\| _perfZero/.test(FOOT), true);
});

test('막힌 까닭을 눌렀을 때 말해 준다', () => {
  /* 회색으로 죽어 있기만 하면 왜 안 되는지 알 수 없다 */
  assert.strictEqual(/if\(_perfZero\)\{[\s\S]{0,200}showToast/.test(FOOT), true);
});

test('성과급 반영을 끄면 막히지 않는다', () => {
  /* ★ 빠져나갈 길이 없으면 「일부러 0원」인 건을 확정할 방법이 사라진다 */
  const z = SRC.slice(SRC.indexOf('var _perfZero'), SRC.indexOf('var _perfZero') + 300);
  assert.strictEqual(/_perfOn/.test(z), true);
});

test('자문료·개인수익은 막지 않는다', () => {
  /* 원래 성과 분배 대상이 아니다 — 막으면 확정 자체를 못 한다 */
  const z = SRC.slice(SRC.indexOf('var _perfZero'), SRC.indexOf('var _perfZero') + 300);
  assert.strictEqual(/personalRevenue/.test(z), true);
  assert.strictEqual(/'company'/.test(z), true);
});
