'use strict';
/* 🔁 실패한 판독을 «자동으로» 다시 건다 + 📗 통장·계좌 갈래 (대표 지시 2026-08-31)

   "OCR 안 읽히는 게 많다. 그리고 통장이나 계좌도 OCR 로 요청하는 경우 모두 가능하게 해라."

   ■ 왜 많이 안 읽혀 있었나
   「다시 걸어 볼 값이 있나」를 가리는 판단(worthRetry)은 **이미 있었다.** 그런데
   그것은 «사람이 사진을 골라 판독을 누를 때»만 쓰였다(readableSel). 자동 판독은
   「한 번도 안 읽은 것」과 「물음이 바뀐 것」만 보았고 **실패한 것은 아예 안 봤다.**
   그래서 AI 가 잠시 바빴다는 이유로 한 번 실패한 사진이 «영영» 안 읽힌 채 쌓였다.

   ■ 통장·계좌
   통장 표지·사본, 예금거래확인서, 계좌확인서를 새 갈래로 받는다.
   ⚠ 계좌번호는 **그대로** 읽는다(가리면 자동이체에 못 쓴다) ·
     주민번호는 **안 읽는다** · 계좌가 담기므로 **민감 서류**다.

   실행: node --test tests/*.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { cutFn } = require('./cut-fn');

const R = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(R, 'pu-photos.html'), 'utf8');
const reader = fs.readFileSync(path.join(R, 'js', 'pu-doc-read.js'), 'utf8');
const store = fs.readFileSync(path.join(R, 'js', 'pu-photo-store.js'), 'utf8');
const server = fs.readFileSync(path.join(R, 'functions', 'photo-view.js'), 'utf8');

/* ══════ ① 실패한 것을 자동으로 다시 건다 ══════ */

function retryCtx() {
  const ctx = { String: String, Object: Object };
  vm.createContext(ctx);
  vm.runInContext([
    (app.match(/^const FAIL_GIVEUP = \d+;/m) || [''])[0].replace('const ', 'var '),
    (app.match(/^const READ_FAIL_RULES = \[[\s\S]*?^\];/m) || [''])[0].replace('const ', 'var '),
    cutFn(app, 'function readFailKind('),
    cutFn(app, 'function worthRetry('),
    cutFn(app, 'function collectingNow('),
    cutFn(app, 'function failedRead(')
  ].join('\n'), ctx);
  return ctx;
}
const F = retryCtx();
const failed = (msg, n) => ({ meta: { read: { error: msg, fails: n || 1 } } });

test('★★ 잠시 바빠서 실패한 것은 «자동으로» 다시 건다 — 여기가 안 읽히던 자리다', () => {
  assert.equal(F.failedRead(failed('AI가 잠시 바쁩니다')), true,
    '★★ 실패한 것을 자동 대기열이 안 보면, 한 번 실패한 사진은 영영 안 읽힙니다');
});

test('★★ 눌러도 «같은 답»인 것은 다시 안 건다 — 부를 때마다 요금이다', () => {
  assert.equal(F.failedRead(failed('사진 본문을 불러오지 못했습니다')), false,
    '★ 원본이 없으면 다시 걸어도 같은 실패입니다 — 사진을 다시 올려야 합니다');
  assert.equal(F.failedRead(failed('AI 키가 없습니다')), false,
    '★ 설정 문제는 눌러서 풀리지 않습니다');
  assert.equal(F.failedRead(failed('로그인이 풀렸습니다')), false);
});

test('★★ 세 번 실패했으면 그만둔다 — 그 이상은 사람이 손으로 적는 편이 낫다', () => {
  assert.equal(F.failedRead(failed('AI가 잠시 바쁩니다', 2)), true, '두 번까지는 해 봅니다');
  assert.equal(F.failedRead(failed('AI가 잠시 바쁩니다', 3)), false,
    '★★ 끝없이 다시 걸면 요금만 나갑니다');
});

test('★ 실패가 «아닌» 것은 이 자리 몫이 아니다 — 상한이 뒤섞인다', () => {
  assert.equal(F.failedRead({ meta: {} }), false, '안 읽은 것은 neverRead 몫입니다');
  assert.equal(F.failedRead({ meta: { read: { kind: 'card', fields: {} } } }), false,
    '잘 읽힌 것은 staleRead 몫입니다');
  assert.equal(F.failedRead(null), false);
});

test('★ 모으는 중인 장은 아직 안 건다 — 다 모은 뒤 한 번만', () => {
  assert.equal(F.failedRead({ meta: { doc: { collecting: true }, read: { error: 'AI가 잠시 바쁩니다' } } }), false);
});

test('★★ 자동 판독이 «실제로» 실패한 것을 집는다 — 함수만 있고 안 부르면 소용없다', () => {
  const fn = cutFn(app, 'function autoReadPending(');
  assert.match(fn, /filter\(failedRead\)/, '★★ 실패한 것을 안 집으면 고친 뜻이 없습니다');
  assert.match(fn, /failed\.slice\(0, AUTO_RETRY_MAX\)/, '★ 한꺼번에 몰아치면 또 바쁩니다');
  /* 같은 사진이 두 자리에 들어가 한 번에 두 번 읽히면 안 된다 */
  assert.match(fn, /!failedId\[it\.id\]/,
    '★★ 실패한 것이 staleRead 에도 걸리면 한 사진을 두 번 읽어 요금이 두 배입니다');
  /* 남은 장수 셈에도 들어가야 한다 — 안 그러면 「남은 0장」인데 계속 남는다 */
  assert.match(fn, /failed\.length - Math\.min\(failed\.length, AUTO_RETRY_MAX\)/,
    '★ 남은 장수에서 빠지면 화면이 거짓말을 합니다');
});

test('★ 다시 거는 것은 «조금씩» — 바빠서 실패한 것을 몰아치면 똑같이 실패한다', () => {
  const n = Number((/^const AUTO_RETRY_MAX = (\d+);/m.exec(app) || [])[1]);
  assert.ok(n >= 1 && n <= 10, '한 번에 다시 거는 수가 ' + n + '장입니다 — 1~10 사이여야 합니다');
});

/* ══════ ② 통장·계좌 ══════ */

test('★★ 통장·계좌를 «갈래로» 안다 — 예전에는 서식·기타로 굳었다', () => {
  assert.match(reader, /bankbook\(통장·계좌/, '★★ 갈래 목록에 없으면 AI 가 고를 수가 없습니다');
  assert.match(reader, /kind=bankbook 이면 키:/, '★ 무엇을 읽을지 안 알려 줬습니다');
  ['bankName', 'bankAcct', 'bankHolder'].forEach(function (k) {
    assert.ok(reader.indexOf(k) > 0, '★★ ' + k + ' 을 안 읽으면 통장을 읽는 뜻이 없습니다');
  });
  assert.match(app, /bankbook: '통장·계좌'/, '★ 화면에 이름표가 없으면 「알 수 없음」으로 뜹니다');
});

test('★★ 주민번호는 «안 읽는다» — 통장 사본에 적혀 있어도 담지 않는다', () => {
  const i = reader.indexOf('kind=bankbook 이면 키:');
  const seg = reader.slice(i, i + 900);
  assert.ok(seg.indexOf('주민') < 0 || /주민등록번호는 절대 담지 마세요/.test(reader.slice(i, i + 1200)),
    '★★ 통장 갈래에서 주민번호를 담으면 한 번 들어간 것을 지우기 어렵습니다');
  assert.match(reader, /kind=bankbook 에서도 \*\*주민등록번호는 절대 담지 마세요\*\*/,
    '★★ 못박아 두지 않으면 pairs 로 딸려 나옵니다');
});

test('★★ 계좌번호는 «그대로» 읽는다 — 가리면 자동이체에 못 쓴다', () => {
  const i = reader.indexOf('kind=bankbook 이면 키:');
  assert.match(reader.slice(i, i + 400), /bankAcct\(계좌번호 — 적힌 그대로/,
    '★★ 가려서 읽으면 그 값으로 아무것도 못 합니다(대표 결정 2026-08-28 과 같은 까닭)');
});

test('★★ 통장은 «민감 서류»다 — 화면과 서버가 같은 목록을 본다', () => {
  const pick = function (s) {
    const m = /SENSITIVE_KINDS = \{([^}]*)\}/.exec(s);
    assert.ok(m, '민감 목록을 못 찾았습니다');
    return m[1].split(',').map(function (x) { return x.split(':')[0].trim(); })
      .filter(Boolean).sort();
  };
  const a = pick(store), b = pick(server);
  assert.ok(a.indexOf('bankbook') >= 0, '★★ 계좌번호가 담기는데 민감이 아닙니다');
  assert.deepEqual(a, b,
    '★★ 화면과 서버의 민감 목록이 다릅니다 — 화면은 원본 주소를 안 적는데\n' +
    '  서버는 「민감 아니다」로 물러나 그 사진이 아예 안 열립니다');
});

test('★★ 물음 판을 올렸다 — 안 올리면 이미 굳은 통장 사진이 «영영» 안 풀린다', () => {
  const pv = Number((/var PROMPT_VERSION = (\d+);/.exec(reader) || [])[1]);
  assert.ok(pv >= 12,
    '★★ 갈래를 늘렸으면 물음 판을 올려야 합니다 — 그래야 예전에 서식·기타로 굳은\n' +
    '  통장 사진이 스스로 다시 읽힙니다(2026-08-06 회의사진 6장과 같은 일)');
  const rv = Number((/var READ_VERSION = (\d+);/.exec(reader) || [])[1]);
  assert.ok(rv >= pv, '★ 판독기 판이 물음 판보다 낮습니다');
});

test('★ 자동이체 «신청서»와 통장을 갈라 준다 — 둘 다 계좌가 있어 헷갈린다', () => {
  assert.match(reader, /자동이체를 «신청»하는 서식이면 cms 이고, 계좌 자체를 보여 주는 것이면 bankbook/,
    '★ 가르는 말이 없으면 통장 사본이 cms 로 갑니다(출금일·납부자번호가 빈 채로)');
});
