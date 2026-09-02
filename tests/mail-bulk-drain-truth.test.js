/* 예약 발송기의 «속도»를 두 곳이 따로 적어 두지 못하게 한다.
   실행: node --test tests/*.test.js

   ★ 왜 이 검사가 있나 — 2026-09-02 에 잡은 흠.
     functions/mail-bulk.js 는 「다 나가는 데 얼마나 걸리나」를 셈해서 대표께
     보여 드린다(되돌릴 수 없는 단추를 그 숫자를 보고 누르신다). 그 셈은 발송기가
     빼 가는 속도를 알아야 한다. 그런데 그 속도가 두 곳에 따로 적혀 있었다 —
     index.js 의 일정·집는 수, 그리고 mail-bulk.js 의 주석과 셈.

     2026-08-15 에는 둘이 같았다(5분마다 20통 = 시간당 240통 = 15초 간격).
     2026-08-23 f315f813 「Reduce idle Realtime Database traffic」 이 비용을 줄이려
     index.js 만 15분마다로 바꿨다. 시간당 80통이 되었는데 mail-bulk.js 는 안 따라왔다.
     300곳이면 화면은 「1시간 15분」이라 하고 실제로는 3시간 45분이 걸렸다.
     낱개 발송에서는 몇 통이라 안 드러났지만, 뉴스레터는 명단이 고정이고 매주 나간다.

   ⚠ 일정 리터럴은 index.js 에 그대로 둔다 — 비용을 정하는 자리가 눈에 보여야 하고,
     tests/rtdb-cost-guards.test.js 가 그 자리를 「너무 자주 깨우지 마라」로 지킨다.
     여기서는 그 리터럴과 mail-bulk 의 값이 «같은가»만 본다. 어느 쪽을 고쳐도 걸린다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const B = require('../functions/mail-bulk.js');

const fn = fs.readFileSync(path.join(__dirname, '..', 'functions', 'index.js'), 'utf8');

/* sendScheduledMail 토막만 본다 — 다른 예약 함수의 일정에 걸리지 않게. */
function sender() {
  const i = fn.indexOf('exports.sendScheduledMail');
  assert.ok(i >= 0, 'sendScheduledMail 을 찾을 수 없습니다');
  return fn.slice(i, i + 1400);
}

test('★ 발송기 일정과 mail-bulk 의 DRAIN_EVERY_MIN 이 같다', () => {
  /* 이것이 어긋나면 대표께 보여 드리는 예상 시간이 그만큼 거짓이 된다. */
  const m = sender().match(/schedule\("every (\d+) minutes"\)/);
  assert.ok(m, 'sendScheduledMail 의 일정을 읽을 수 없습니다');
  assert.equal(
    Number(m[1]), B.DRAIN_EVERY_MIN,
    'index.js 는 ' + m[1] + '분마다인데 mail-bulk.js 는 ' + B.DRAIN_EVERY_MIN + '분으로 셈합니다'
  );
});

test('★ 한 바퀴에 집는 통 수와 DRAIN_BATCH 가 같다', () => {
  const m = sender().match(/limitToFirst\((\d+)\)/);
  assert.ok(m, 'sendScheduledMail 이 한 번에 집는 수를 읽을 수 없습니다');
  assert.equal(
    Number(m[1]), B.DRAIN_BATCH,
    'index.js 는 한 바퀴에 ' + m[1] + '통인데 mail-bulk.js 는 ' + B.DRAIN_BATCH + '통으로 셈합니다'
  );
});

test('★ 예상 시간이 그 두 값에서 실제로 나온다', () => {
  /* 값만 맞고 셈이 안 쓰면 아무 소용이 없다. 상한(400곳)까지 견줘 본다. */
  const 한바퀴 = B.DRAIN_EVERY_MIN, 한줌 = B.DRAIN_BATCH;
  [1, 20, 21, 88, 300, B.MAX_BULK].forEach(function (n) {
    const 발송분 = Math.ceil(n / 한줌) * 한바퀴;
    const h = Math.floor(발송분 / 60), m = 발송분 % 60;
    const 바람 = 발송분 < 60 ? '약 ' + 발송분 + '분'
                             : '약 ' + h + '시간' + (m ? ' ' + m + '분' : '');
    assert.equal(B.etaText(n, 15000), 바람, n + '곳 — 발송기 속도를 안 씁니다');
  });
});

test('발송기는 한 바퀴에 집은 것을 그 자리에서 다 보낸다', () => {
  /* 「20통을 집어 놓고 5통만 보낸다」면 위 셈이 또 거짓이 된다.
     집은 것을 for 로 돌며 보내고, 보낸 것은 자리를 비운다. */
  const s = sender();
  assert.match(s, /for \(const id of ids\)/, '집은 것을 다 돌지 않습니다');
  assert.match(s, /MD\.deliver\(/, '그 자리에서 보내지 않습니다');
});
