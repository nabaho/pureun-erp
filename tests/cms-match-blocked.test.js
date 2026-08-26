/* CMS 일괄이체 매칭 — 「고를 수가 없어서」 막히던 건들
   (김보람 노무사 건의 2026-08-26 · 대표 전달)

   건의 그대로 옮기면 —
     「대다수 거래처는 매칭이 정상적으로 이루어졌으나 일부 거래처에 대하여
      ① 이미 입금된 것으로 처리되어 처리가 불가하거나
      ② 사업장 명칭 변경 또는 자문해지 등의 사유로 매칭이 안되는 건들이 있습니다.
      수기로 매칭할 수 있도록 하거나, 이미 입금처리 되어 있어도 거래처 입금건으로
      잡을 수 있도록 하여 주시기를 건의 드립니다.」

   ★ 코드를 보니 막는 곳이 셋이었다.
     ⑴ toggle() 이 paidMap 이면 그 자리에서 돌아섰다 — 「이미입금」은 아예 못 눌렀다.
     ⑵ 업체 풀이 status==='active' && 자문료>0 만 담았다 — 해지·미등록 업체는
        목록에 «없어서» 손으로도 못 골랐다.
     ⑶ 「연결 안 됨」 칩은 읽는 글이었다 — 왜 안 되는지만 알려 주고 길이 없었다.
   그래서 고른 몫이 모자라 차액이 남고, 확정 자체가 막혔다(대표 화면 차액 154,000원).

   ★ 고친 뒤에도 «두 번 잡히는 일» 은 없다 — 「이미입금」은 고를 수는 있되
     입금표시를 새로 만들지 않는다. 금액만 맞춘다.

   이 검사가 못 박는 것 —
     ① 이미입금도 고를 수 있다  ② 그래도 새로 만들지는 않는다
     ③ 해지·미등록 업체를 꺼내 볼 길이 있다  ④ 칩을 눌러 이어 붙일 수 있다
     ⑤ 한 번 이어 붙이면 «기억한다»  ⑥ 전부 이미입금이어도 그 입금은 처리된다 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const erp = fs.readFileSync(path.join(__dirname, '..', 'pu-erp.html'), 'utf8');
const at = erp.indexOf('function CmsMatchModal(props){');
assert.ok(at > 0, 'CmsMatchModal 을 찾지 못했습니다');
const M = erp.slice(at, erp.indexOf('\nfunction ', at + 100) > 0 ? at + 26000 : erp.length);

test('★ 「이미입금」도 고를 수 있다 — 막고 있던 첫 관문', () => {
  const t = M.indexOf('function toggle(name){');
  assert.ok(t > 0, 'toggle 을 찾지 못했습니다');
  const fn = M.slice(t, M.indexOf('\n  }', t));
  assert.ok(fn.indexOf('if(paidMap[name]) return;') < 0,
    '★ 이미 입금표시된 업체를 못 고르면, 그 몫이 차액으로 남아 확정이 막힙니다.');
});

test('★ 고를 수는 있어도 «새로 만들지는» 않는다 — 두 번 잡히면 안 된다', () => {
  assert.match(M, /if\(paidMap\[n\]\)\{ skip\+\+; return; \}/,
    '★ 입금표시를 두 번 만들면 같은 돈이 두 번 잡힙니다.');
  /* 사람에게도 그렇게 밝혀야 한다 — 안 밝히면 두 번 잡힌 줄 알고 놀란다 */
  assert.match(M, /금액만 맞춤/, '★ 「금액만 맞춘다」는 것을 확인 글에 밝혀야 합니다.');
});

test('★ 해지·자문료 미등록 업체를 꺼내 볼 길이 있다 — 목록에 없으면 손으로도 못 고른다', () => {
  assert.match(M, /var poolAllRef = useRef\(null\)/, '★ 넓은 풀이 없습니다.');
  assert.match(M, /off: \(c\.status!=='active' \? '해지' : '자문료 없음'\)/,
    '★ 왜 목록에 없던 업체인지 표시해 주어야 합니다.');
  assert.match(M, /showMore \? pool\.concat\(poolMore\) : pool/,
    '★ 켰을 때 목록에 실제로 끼어야 합니다.');
  /* ⚠ 자동 고르기는 좁은 풀만 써야 한다 — 넓히면 해지 업체가 저절로 딸려 들어온다 */
  assert.match(M, /var cands = pool\.filter\(function\(c\)\{ return !paidMap\[c\.name\]; \}\)/,
    '★ 자동 조합이 넓은 풀을 쓰면 해지 업체가 저절로 뽑힙니다.');
});

test('★ 「연결 안 됨」 칩을 눌러 이어 붙일 수 있다 — 그리고 기억한다', () => {
  assert.match(M, /setLinking\(_linkOn \? null : it\)/, '★ 칩이 눌리지 않습니다.');
  assert.match(M, /erpLearnPayerAlias\(linking\.name/,
    '★ 기억하지 않으면 다음 달에 또 손으로 찾아야 합니다.');
  assert.match(M, /다음 달부터 저절로 이어집니다/, '★ 무엇이 일어났는지 알려 주어야 합니다.');
});

test('★ 합계는 나이스빌 명세 금액을 먼저 쓴다 — 해지·변경 뒤 ERP 자문료는 낡아 있다', () => {
  assert.match(M, /var nbAmtByCo = \{\}/, '명세 금액 색인이 없습니다.');
  assert.match(M, /sum \+= nbAmtByCo\[n\] \|\| \(c \? \(parseInt\(c\.fee,10\)\|\|0\) : 0\)/,
    '★ 자문료만 세면 해지 업체를 골라도 차액이 안 맞습니다.');
});

test('★ 전부 이미입금이어도 그 입금은 «처리됨» 이 된다', () => {
  /* 예전에는 새로 만든 것이 하나도 없으면(n=0) 처리 표시를 안 해,
     전부 이미 입금된 묶음은 그 입금이 영영 미처리로 남았다. */
  const oi = erp.indexOf('onApplied:function(n, skipped, cmsSet){');
  assert.ok(oi > 0, 'onApplied 를 찾지 못했습니다');
  const fn = erp.slice(oi, oi + 900);
  assert.match(fn, /var _done = n \+ \(skipped\|\|0\)/,
    '★ 「금액만 맞춘」 것도 처리한 것입니다.');
  assert.match(fn, /if\(_done > 0\)\{/, '★ n>0 만 보면 전부 이미입금인 묶음이 안 지워집니다.');
  assert.ok(fn.indexOf('곳 제외') < 0,
    '★ 이제 «제외» 가 아니라 «금액만 맞춤» 입니다 — 말이 남아 있으면 오해합니다.');
});
