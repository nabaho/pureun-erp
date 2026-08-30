/* 화면이 「폰이 조용한 것」과 「문자가 없는 것」을 «갈라» 말하는가 (2026-08-30)
 *
 * ■ 왜 이 검사가 있나
 *   2026-08-30 대표: 「문자 여전히 안들어온다」.
 *   그때 서버 기록에 있던 것은 「마지막 정상 —(비어 있음)」 하나뿐이었다.
 *   그것만으로는 폰이 죽은 것인지 거래가 없었던 것인지 알 길이 없어서,
 *   대표에게 할 수 있는 말이 「알림 권한을 다시 보세요」뿐이었다 — 하루를 잃었다.
 *
 * ★ 이제 폰이 15분마다 살아 있다고 알린다(lastSweepAt).
 *   화면은 그것을 보고 «단정해서» 말해야 한다. 뭉뚱그리면 사람이 헛수고를 한다:
 *     · 폰이 멀쩡한데 「앱을 다시 까세요」 → 다시 깔면 연결까지 풀린다(더 나빠진다)
 *     · 절전이 재운 것인데 「거래가 없나 보네」 → 영영 안 들어온다
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ERP = fs.readFileSync(path.join(__dirname, '..', 'pu-erp.html'), 'utf8');

/* hanaStatChip 을 통째로 뽑아 «실제로 돌린다» — 글자만 보면 조건을 못 본다.
   (조건을 false 로 꺼 두어도 글자는 그대로라, 글자만 보는 검사는 통과한다) */
function chipRunner() {
  const head = '  function hanaStatChip(){';
  const i = ERP.indexOf(head);
  assert.ok(i >= 0, 'hanaStatChip 을 못 찾음');
  let d = 0, end = -1;
  for (let k = ERP.indexOf('{', i); k < ERP.length; k++) {
    if (ERP[k] === '{') d++;
    else if (ERP[k] === '}') { d--; if (d === 0) { end = k + 1; break; } }
  }
  assert.ok(end > 0, '닫는 괄호를 못 찾음');
  const body = ERP.slice(i, end);

  return function run(device) {
    const ctx = {
      hanaStat: { devices: device ? [device] : [] },
      setHanaFix: function () {},
      HANA_SKIP_KO: {},
      /* h() 를 가짜로 두고 «무엇을 그렸는지»만 받아 본다 */
      h: function (tag, props, txt) {
        return { tag: tag, title: (props && props.title) || '', text: String(txt || '') };
      },
      Object: Object, Date: Date, Number: Number, String: String, Math: Math,
    };
    vm.createContext(ctx);
    vm.runInContext(body + '\nvar __out = hanaStatChip();', ctx);
    return ctx.__out;
  };
}
const run = chipRunner();
const MIN = 60 * 1000;
const now = Date.now();

/* 어제 실제로 있었던 모습 — 연결만 되고 살아 있는 문자는 0건 */
const BASE = { deviceName: '권형하 휴대폰', pairedAt: now - 15 * 60 * MIN, lastOkAt: 0 };

test('★★ 폰이 훑고 있으면 «앱 탓을 하지 않는다»', () => {
  const out = run(Object.assign({}, BASE, { lastSweepAt: now - 5 * MIN, sweepCanReadSms: true }));
  assert.ok(/폰 잘 있음/.test(out.text),
    '★★ 폰이 5분 전에 신호를 보냈는데 「문자 0건」이라고만 하면, 멀쩡한 앱을 다시 깔러 간다');
  assert.ok(!/다시 깔|지워졌/.test(out.title),
    '★★ 앱을 다시 깔라고 하면 연결까지 풀려 «더 나빠진다»');
  assert.strictEqual(out.tag, 'span',
    '★ 할 일이 없는데 누를 수 있는 표로 두면, 눌러 봐야 할 일이 있는 줄 안다');
});

test('★★ 문자함 권한이 꺼졌으면 «그것을» 짚는다', () => {
  const out = run(Object.assign({}, BASE, { lastSweepAt: now - 5 * MIN, sweepCanReadSms: false }));
  assert.ok(/문자함 읽기 권한/.test(out.text),
    '★★ 훑기는 도는데 권한이 없으면 영영 아무것도 안 줍는다 — 그 사실을 안 말하면 아무도 모른다');
  assert.strictEqual(out.tag, 'button', '★ 고칠 것이 있으면 갈 곳이 있어야 한다');
});

test('★★ 폰이 한참 조용하면 «절전»을 짚는다 — 앱을 다시 깔라고 하지 않는다', () => {
  const out = run(Object.assign({}, BASE, { lastSweepAt: now - 200 * MIN, sweepCanReadSms: true }));
  assert.ok(/조용/.test(out.text), '★ 조용하다는 것을 안 알린다');
  assert.ok(/절전/.test(out.title),
    '★★ 절전이 재운 것인데 앱을 다시 깔면 헛수고에 연결까지 풀린다');
  /* ⚠ 「다시 깔」이 있나 없나로 겨누면 안 된다 — 이 안내는 「다시 깔 것이 «아니라»」로
     말리는 쪽이라 그 낱말을 그대로 쓴다. 말리는 말과 시키는 말을 갈라 봐야 한다. */
  assert.ok(/다시 깔 것이 아니라/.test(out.title),
    '★★ 「앱을 다시 깔지 말라」고 «못 박아» 두지 않으면, 사람은 늘 하던 대로 다시 깐다');
});

test('★ 잠깐 밀린 것(30분)은 «조용하다고 하지 않는다»', () => {
  const out = run(Object.assign({}, BASE, { lastSweepAt: now - 30 * MIN, sweepCanReadSms: true }));
  assert.ok(!/조용/.test(out.text),
    '★ 15분 주기가 한 번 밀린 것까지 「조용하다」고 하면, 멀쩡한 폰에 늘 경고가 뜬다');
});

test('★★ 옛 서버(훑기를 모름)에서는 «옛 안내» 그대로다', () => {
  /* lastSweepAt 자체가 없다 — 서버를 아직 안 올린 상태 */
  const out = run(Object.assign({}, BASE, { lastOkAt: 0 }));
  assert.ok(/문자 0건|지난 문자/.test(out.text),
    '★★ 훑기를 모르는 서버에서 새 안내가 나오면, 있지도 않은 기능을 보라고 시킨다');
});

test('★ 문자가 실제로 들어오면 그것을 먼저 보인다', () => {
  const out = run(Object.assign({}, BASE, {
    lastOkAt: now - 3 * MIN, lastSweepAt: now - 5 * MIN, sweepCanReadSms: true,
  }));
  assert.ok(/연결됨/.test(out.text),
    '★ 문자가 들어오고 있는데 「훑는 중」이라고만 하면 무엇이 되고 있는지 흐려진다');
});

test('★★ 연결이 끊긴 것(열쇠 거절)이 «훑기보다 먼저»다', () => {
  const out = run(Object.assign({}, BASE, {
    lastSweepAt: now - 5 * MIN, sweepCanReadSms: true,
    lastReject: { reason: 'bad_token', at: now - 2 * MIN },
  }));
  assert.ok(/연결이 끊겼/.test(out.text),
    '★★ 열쇠가 죽었는데 「폰 잘 있음」이라고 하면, 고쳐야 할 것을 덮는다');
});
