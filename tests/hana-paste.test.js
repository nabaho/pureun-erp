/* PC 에서 붙여넣기 — 폰과 «같은 길»로 들어가는가 (대표 지시 2026-08-29)

   ★ 왜 만들었나
     폰 앱이 막히면 거래내역이 통째로 빈다(2026-08-29 에 실제로 그랬다).
     그때 손쓸 길이 없었다 — 문자는 폰에만 있고 ERP 로 넣을 방법이 없었다.
     PC 에서 붙여넣으면 폰과 똑같이 처리되게 한다.

   ★ 지키려는 것
     ① 대표만 쓸 수 있다 (휴대폰 연결과 같은 규칙, 2026-08-27 결정)
     ② 폰과 «같은 파서»를 쓴다 — 따로 만들면 두 길이 갈라지고,
        갈라지면 이번처럼 한쪽만 조용히 막힌다
     ③ 여러 통을 한 번에 (빈 줄로 나눈다 — 문자 한 통이 여러 줄인 경우가 많다)
     ④ 같은 문자를 두 번 넣어도 두 번 안 잡힌다
     ⑤ 입금은 대표 확인 알림에도 올라간다 (폰 길과 같다)
     ⑥ 폰의 「마지막 문자 시각」을 건드리지 않는다 — 찍으면 폰이 살아 있다고 잘못 읽는다
     ⑦ 문자 원문을 저장하지 않는다 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'functions', 'index.js'), 'utf8').split('\r\n').join('\n');
const HM = require('../functions/hana-message');

let fail = 0, total = 0;
function ok(name, cond, hint) {
  total++;
  if (cond) { console.log('ok   ' + name); return; }
  fail++;
  console.log('FAIL ' + name + (hint ? '\n     → ' + hint : ''));
}

/* 붙여넣기 갈래만 떼어 본다 */
const i = src.indexOf('if (action === "ingestPaste")');
const j = src.indexOf('if (action === "adminAlerts")');
const blk = (i >= 0 && j > i) ? src.slice(i, j) : '';

console.log('[① 대표만]');
ok('붙여넣기 갈래가 있다', blk.length > 200);
ok('총괄관리자만 쓸 수 있다', /await requireTotalAdmin\(req\)/.test(blk),
   '누구나 넣을 수 있으면 남의 거래가 우리 장부에 들어온다');

console.log('\n[② 폰과 같은 파서]');
ok('같은 파서를 쓴다', /HanaMessage\.parseHanaMessage\(block\)/.test(blk),
   '따로 만들면 두 길이 갈라진다 — 이번에 그래서 카드가 통째로 막혔다');
ok('같은 대기함에 넣는다', /inbox\/\$\{uid\}\/\$\{tx\.id\}/.test(blk));
ok('같은 열쇠(tx.id)로 넣는다 — 폰으로 들어온 것과 안 겹친다', /seen\[tx\.id\]/.test(blk));

console.log('\n[③ 여러 통을 한 번에]');
ok('빈 줄로 통을 나눈다', /split\(\/\\\\n\\\\s\*\\\\n\+\/\)/.test(blk) || /split\(\/\\n\\s\*\\n\+\//.test(blk),
   '줄 단위로 자르면 여러 줄짜리 문자가 토막 난다');
ok('한 번에 넣는 양을 막는다', /blocks\.length > 100/.test(blk) && /text\.length > 20000/.test(blk),
   '한도가 없으면 실수로 붙여넣은 문서 하나가 서버를 오래 붙든다');
ok('빈 글은 되돌려 보낸다', /붙여넣은 글이 비어 있습니다/.test(blk));

console.log('\n[④ 두 번 넣어도 한 번]');
ok('이미 있으면 건너뛴다', /existing\.exists\(\)/.test(blk) && /dup\+\+/.test(blk));
ok('한 번에 붙여넣은 것 안에서도 겹치면 건너뛴다', /if \(seen\[tx\.id\]\)/.test(blk),
   '같은 문자를 두 줄 붙여넣으면 두 번 잡힌다');

console.log('\n[⑤ 입금은 대표 확인 알림에도]');
ok('입금이면 알림을 만든다', /tx\.type === "income"/.test(blk) && /adminAlerts\/\$\{alertKey\}/.test(blk));
ok('폰 길과 같은 열쇠 셈을 쓴다', /hanaAdminAlertKey\(uid, tx\.id\)/.test(blk));

console.log('\n[⑥ 폰 상태를 건드리지 않는다]');
ok('lastOkAt 을 안 찍는다', blk.indexOf('lastOkAt') < 0,
   '찍으면 화면이 「폰이 살아 있다」고 잘못 말한다 — 이번에 그것 때문에 헤맸다');
ok('어디서 들어왔는지 적는다', /deviceName: "PC 붙여넣기"/.test(blk),
   '나중에 「이건 폰이 보낸 건가 손으로 넣은 건가」를 알 수 있어야 한다');

console.log('\n[⑦ 원문을 저장하지 않는다]');
ok('붙여넣은 글을 통째로 안 담는다',
   !/text: text/.test(blk) && !/raw: (text|block)/.test(blk),
   '문자 원문에는 남의 개인정보가 섞여 있다 — 폰 길도 안 담는다');
ok('무엇이 들어가고 무엇이 걸러졌는지 알려 준다',
   /results\.push\(\{ ok: false, reason: parsed\.reason/.test(blk) && /saved, duplicate: dup, skipped/.test(blk),
   '조용히 삼키면 「넣었는데 왜 없나」를 또 겪는다');

/* ── 파서를 실제로 돌려 본다 — 붙여넣을 법한 진짜 문자들 ── */
console.log('\n[실제 문자로 돌려 보기]');
const NOW = new Date('2026-08-29T09:00:00+09:00');
const CASES = [
  ['카드 승인', '[Web발신] 하나9950 승인 푸른노무법 26,000원 일시불 08/18 12:59 스시리두정', true],
  ['은행 입금', '[Web발신] 하나은행 입금 1,250,000원 08/22 15:31 주식회사 예시 잔액 2,000,000원', true],
  ['인증번호',  '하나은행 인증번호 123456 입금 10,000원 08/22 15:31', false],
];
CASES.forEach(function ([name, msg, want]) {
  const r = HM.parseHanaMessage(msg, { now: NOW });
  ok(name + ' — ' + (want ? '들어간다' : '걸러진다'), !!r.ok === want,
     '결과: ' + JSON.stringify(r).slice(0, 90));
});
/* 여러 통을 빈 줄로 나눠 붙여넣었을 때 각각 읽히는가 */
{
  const pasted = CASES[0][1] + '\n\n' + CASES[1][1];
  const blocks = pasted.split(/\n\s*\n+/).map(x => x.trim()).filter(Boolean);
  ok('빈 줄로 나누면 두 통으로 읽힌다', blocks.length === 2, '나뉜 수: ' + blocks.length);
  const both = blocks.map(b => HM.parseHanaMessage(b, { now: NOW }));
  ok('두 통 다 읽힌다', both.every(r => r.ok), JSON.stringify(both.map(r => r.reason)));
  ok('두 통의 열쇠가 다르다', both[0].transaction.id !== both[1].transaction.id,
     '같으면 하나가 중복으로 버려진다');
}

/* ── 화면 쪽 ── */
console.log('\n[화면]');
const { cutFn } = require('./cut-fn');
const erp = fs.readFileSync(path.join(ROOT, 'pu-erp.html'), 'utf8').split('\r\n').join('\n');
const ledger = cutFn(erp, 'function FinanceLedger');

/* ⚠ 아래 둘은 단추의 «생김새»를 못 박고 있었다. 2026-08-30 에 하나문자 손잡이 셋을
     「📱 하나문자 ▾」 차림표 하나로 묶으면서(대표: 「2줄 1줄로 줄여라」) 깨졌다 —
     코드는 멀쩡했고 검사만 옛 모양을 붙들고 있었다.
   지킬 것은 「누를 수 있는가」와 「아무나 못 누르는가」다. */
ok('붙여넣기로 가는 길이 있다', /PC 에서 붙여넣기/.test(ledger) && /setPasteOpen\(true\)/.test(ledger),
   '화면에서 붙여넣기 창을 열 수 없습니다');
ok('대표만 보인다', /_meNow\(\)\.isOwner &&[\s\S]{0,1400}setPasteOpen\(true\)/.test(ledger),
   '휴대폰 연결과 같은 규칙이어야 한다 (대표 가리개 안에 있어야 한다)');
ok('서버의 같은 길을 부른다', /hanaSmsCall\('ingestPaste', \{ text: t \}\)/.test(ledger),
   '화면이 스스로 문자를 읽으면 길이 셋이 되고, 셋이 갈라지면 또 조용히 막힌다');
ok('넣은 뒤 바로 가져온다', /await importHanaSms\(true\);/.test(ledger),
   '넣기만 하고 안 가져오면 화면에 안 나타나 「안 됐다」고 보인다');
ok('무엇이 걸러졌는지 그 자리에 적는다', /HANA_SKIP_KO\[r\.reason\] \|\| r\.reason/.test(ledger),
   '조용히 삼키면 「넣었는데 왜 없나」를 또 겪는다');
ok('여러 통은 빈 줄로 나누라고 알려 준다', /빈 줄로 나눠/.test(ledger));
ok('원문을 저장 안 한다고 알려 준다', /문자 원문은 저장하지 않습니다/.test(ledger));
ok('넣는 동안 두 번 못 누른다', /disabled:hanaBusy,onClick:sendHanaPaste/.test(ledger),
   '두 번 눌리면 같은 문자가 두 번 들어간다');

console.log('\n  === ' + (total - fail) + ' 통과 / ' + fail + ' 실패 ===');
process.exit(fail ? 1 : 0);
