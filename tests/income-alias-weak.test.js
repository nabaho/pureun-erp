/* 입금 자동매칭이 «전혀 다른 업체» 에 붙은 일 (2026-08-18 대표 제보)
     「DYM SOLUTI」  → ㈜정일제지
     「태성디티(주)(이석」 → (주)케이이알 (구㈜한국전자파연구소)

   ★ 뿌리 — 내가 이름을 보고 붙인 것이 «아니다».
     2026-08-08 에 «한 번» 확정한 것이 곧바로 「규칙(입금자 별칭)」이 되어,
     이름이 전혀 닮지 않았는데도 그 뒤로 계속 같은 곳에 자동으로 붙었다.
     한 번의 실수가 영원히 되풀이되는 구조였다.

   ★ 고친 규칙 —
     이름이 «닮은» 학습은 한 번으로 배운다(아우어베이커리·이케이 …) — 안전하다.
     이름이 «안 닮은» 짝은 «두 번» 확정돼야 규칙이 된다. 그전까지는 노랑(확인 필요). */
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'pu-erp.html'), 'utf8');
const bare = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
const S = bare(SRC);

/* 진짜 함수를 떼어내 돌린다 — 흉내 낸 것으로는 「닮았나」를 검사할 수 없다 */
function grab(name, endMark) {
  const a = S.indexOf('function ' + name);
  assert.ok(a > 0, name + ' 이 없다');
  const b = S.indexOf('\nfunction ' + endMark, a);
  assert.ok(b > a, name + ' 의 끝을 못 찾았다');
  return S.slice(a, b);
}
function load() {
  const src = [
    grab('erpNormName', 'erpLcsLen'),
    grab('erpLcsLen', '_erpNameCmp'),
    grab('_erpNameCmp', 'erpCleanMemo'),
    grab('erpAliasNameClose', 'erpAliasWeak'),
    grab('erpAliasWeak', 'erpAliasTrusted'),
    grab('erpAliasTrusted', 'erpAliasCount'),
  ].join('\n');
  const ctx = { String, Math, parseInt, console };
  vm.createContext(ctx);
  vm.runInContext(src + '\nthis.close=erpAliasNameClose; this.weak=erpAliasWeak; this.trusted=erpAliasTrusted;', ctx);
  return ctx;
}

/* ── 이름이 닮았나 — 실제로 학습된 27건에서 가려낸다 ── */

test('이번에 문제된 두 짝은 «안 닮았다»', () => {
  const { close } = load();
  assert.strictEqual(close('dymsoluti', '㈜정일제지'), false);
  assert.strictEqual(close('태성디티이석', '(주)케이이알 (구㈜한국전자파연구소)'), false);
});

test('멀쩡한 학습은 «닮았다» 로 남는다 — 같이 죽이면 안 된다', () => {
  /* 무작정 엄하게 하면 잘 되던 것까지 노랑이 되어 일이 늘어난다. */
  const { close } = load();
  assert.strictEqual(close('최건아우어베이커리', '아우어베이커리 서산호수공원점'), true);
  assert.strictEqual(close('선학원보문사', '보문사'), true);
  assert.strictEqual(close('이케이', '㈜이케이 (구 지흥)'), true);
  assert.strictEqual(close('충남육아종합지원센터', '충청남도육아종합지원센터'), true);
});

test('CMS 일괄이체 적요를 한 곳으로 배운 것도 «안 닮았다»', () => {
  /* 「더빌이체3572」는 여러 곳이 섞여 들어오는 줄이다 — 한 곳으로 굳으면 위험하다. */
  const { close } = load();
  assert.strictEqual(close('더빌이체3572', '이레메디컬의원'), false);
  assert.strictEqual(close('본가왕뼈감자탕', '중원공영'), false);
});

/* ── 몇 번 확정돼야 규칙이 되나 ── */

test('안 닮은 짝은 «한 번» 으로 규칙이 되지 않는다', () => {
  const { trusted } = load();
  const e = { companyName: '㈜정일제지', count: 1, weak: true };
  assert.strictEqual(trusted(e, 'dymsoluti'), false, '한 번으로 규칙이 된다');
});

test('안 닮은 짝도 «두 번» 확정되면 규칙이 된다', () => {
  /* 영원히 막으면 진짜로 그 관계인 곳(예금주가 다른 회사)을 못 배운다. */
  const { trusted } = load();
  const e = { companyName: '㈜정일제지', count: 2, weak: true };
  assert.strictEqual(trusted(e, 'dymsoluti'), true);
});

test('닮은 짝은 한 번으로 충분하다', () => {
  const { trusted } = load();
  const e = { companyName: '아우어베이커리 서산호수공원점', count: 1, weak: false };
  assert.strictEqual(trusted(e, '최건아우어베이커리'), true);
});

test('★ weak 표시가 «없는» 옛 기록도 다시 재 본다', () => {
  /* 이게 없으면 8월 8일에 굳은 잘못된 것들이 그대로 살아 있다.
     대표님이 손으로 지우기 전에는 계속 붙는다. */
  const { weak, trusted } = load();
  const old = { companyName: '(주)케이이알 (구㈜한국전자파연구소)', count: 1, samples: ['태성디티(주)(이석'] };
  assert.strictEqual(weak(old, '태성디티이석'), true, '옛 기록을 안 재 본다');
  assert.strictEqual(trusted(old, '태성디티이석'), false, '옛 잘못이 그대로 살아 있다');
  const oldOk = { companyName: '보문사', count: 1, samples: ['선학원보문사'] };
  assert.strictEqual(trusted(oldOk, '선학원보문사'), true, '멀쩡한 옛 기록까지 죽인다');
});

/* ── 앱이 그 규칙을 실제로 쓰나 ── */

test('학습할 때 «닮았는지» 를 적어 둔다', () => {
  const a = S.indexOf('function erpLearnPayerAlias');
  const fn = S.slice(a, S.indexOf('\nfunction erpForgetPayerAlias', a));
  assert.strictEqual(/weak:\s*!erpAliasNameClose\(/.test(fn), true, '새 학습에 닮음 여부를 안 적는다');
});

test('믿을 수 없는 별칭에 이름 100점을 주지 않는다', () => {
  const a = S.indexOf('function erpMatchScore');
  const fn = S.slice(a, S.indexOf('\nfunction erpNameEvidence', a));
  assert.strictEqual(/erpAliasTrusted\(/.test(fn), true, '믿을 수 있는지 안 따진다');
  assert.strictEqual(/aliasWeak\s*=\s*true/.test(fn), true, '표를 안 남긴다');
  assert.strictEqual(/aliasWeak:\s*aliasWeak/.test(fn), true, '표를 밖으로 안 넘긴다');
});

test('★ 초록(확정 가능)을 주지 않는다 — 사람 눈을 한 번 거친다', () => {
  /* 금액만 맞으면 초록이 되던 탓에 8월 8일의 실수가 「확정 가능」으로 떴다. */
  const a = S.indexOf('function erpRowState');
  const fn = S.slice(a, S.indexOf('\nfunction ', a + 5));
  assert.strictEqual(/aliasWeak/.test(fn), true, '신호등이 이 표를 안 본다');
  const i = fn.indexOf('aliasWeak');
  const after = fn.slice(i, i + 200);
  assert.strictEqual(/state:'check'/.test(after), true, '노랑으로 안 내린다');
  assert.strictEqual(/이름이 다릅니다/.test(after), true, '왜 노랑인지 안 말한다');
});

test('추천 목록이 그 표를 함께 나른다', () => {
  const a = S.indexOf('function erpMatchTxnToPending');
  const fn = S.slice(a, S.indexOf('\nfunction ', a + 5));
  assert.strictEqual(/aliasWeak:\s*!!r\.aliasWeak/.test(fn), true, '표가 화면까지 못 간다');
});

/* ── 상세창이 「무엇과 짝지었는지」 를 보여 주나 ── */

test('상세창에 «통장에 찍힌 이름» 이 나온다', () => {
  /* 전에는 이 창에 적요가 아예 없어 「이게 맞나」를 볼 방법이 없었다. */
  assert.strictEqual(/통장에 찍힌 이름/.test(S), true, '적요를 안 보여 준다');
  assert.strictEqual(/붙인 업체/.test(S), true, '무엇에 붙였는지 나란히 안 둔다');
});

test('«왜 이 업체인가» 를 숨기지 않는다', () => {
  assert.strictEqual(/왜 이 업체인가/.test(S), true);
  assert.strictEqual(/예전에 이렇게 확정했습니다/.test(S), true, '진짜 이유를 안 적는다');
});

test('그 자리에서 학습을 지울 수 있다', () => {
  /* 환경설정 깊숙이 들어가야만 지울 수 있으면 «고칠 방법이 없는 것» 과 같다. */
  assert.strictEqual(/이 학습 지우기/.test(S), true, '지우는 단추가 없다');
  const i = S.indexOf('이 학습 지우기');
  const around = S.slice(Math.max(0, i - 900), i + 100);
  assert.strictEqual(/erpForgetPayerAlias\(/.test(around), true, '단추가 실제로 안 지운다');
});

test('★ 그 창에 «없는 이름» 을 부르지 않는다', () => {
  /* 처음 쓸 때 setRefresh 를 불렀는데 이 화면에는 그런 것이 없었다 —
     누르는 순간 터진다. 검사가 없으면 배포 뒤에야 안다. */
  const i = S.indexOf('이 학습 지우기');
  const around = S.slice(Math.max(0, i - 900), i + 100);
  assert.strictEqual(/setRefresh\(/.test(around), false, '이 화면에 없는 setRefresh 를 부른다');
  assert.strictEqual(/setSugTick\(/.test(around), true, '지운 뒤 화면을 다시 그리지 않는다');
  assert.strictEqual(/setDetPop\(null\)/.test(around), true, '창을 안 닫는다');
});
