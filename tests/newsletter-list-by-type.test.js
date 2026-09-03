/* 받는 명단을 유형(자문·급여·노조·기금)으로 가르고 번호를 붙인다
   ═══════════════════════════════════════════════════════════════════════════
   대표 지시 2026-09-03: 「각각 구분해서 받는 명단 정리해주고 넘버링해달라.」
   목업: docs/mockups/news-list-by-type.html (안 ㉯ 채택)

   ★ 이 검사가 지키는 «규칙» 넷
     ① 유형은 업체관리(typeCode)에서 «그대로» 온다 — 여기서 새로 판단하지 않는다
     ② 유형이 명단다듬기를 «지나도 살아 있다» (흘리면 걸러도 아무것도 안 남는다)
     ③ 0곳인 유형도 «칸을 남긴다» (없어진 것과 원래 없는 것을 구별해야 한다)
     ④ ★ 화면과 «보내는 곳»이 같은 자리에서 걸러진다
        — 두 벌이면 화면엔 38곳인데 110곳에 나간다 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { stripComments } = require('./strip-comments');
const C = require('../js/pu-news-core.js');

const ROOT = path.join(__dirname, '..');
const news = stripComments(fs.readFileSync(path.join(ROOT, 'pu-news.html'), 'utf8').replace(/\r\n/g, '\n'));
const erp = stripComments(fs.readFileSync(path.join(ROOT, 'pu-erp.html'), 'utf8').replace(/\r\n/g, '\n'));

function 집(추가) {
  return Object.assign({
    id: 'c1', name: '어떤회사', status: 'active',
    primaryContactName: '홍길동', primaryContactEmail: 'a@x.com'
  }, 추가 || {});
}
function 명단(사업장들) {
  const g = C.사업장에서명단(사업장들, '자문중');
  return C.명단다듬기(g.줄들, {});
}

/* ══════ ① 업체관리와 «같은 넷» ══════ */

test('★ 유형 넷이 업체관리와 같다 — 이름도 차례도', () => {
  /* 한쪽만 고치면 같은 업체가 두 화면에서 다른 갈래로 보인다.
     업체관리의 COMPANY_TYPE_FILTERS 에서 'all' 을 뺀 것과 같아야 한다. */
  const m = /var COMPANY_TYPE_FILTERS = \[([\s\S]*?)\];/.exec(erp);
  assert.ok(m, '업체관리의 유형 목록을 못 찾았다 — 이름이 바뀌었으면 이 검사도 고칠 것');
  const erp넷 = [...m[1].matchAll(/v:\s*'([^']+)'/g)].map(x => x[1]).filter(v => v !== 'all');
  assert.deepEqual(C.유형들.map(t => t.키), erp넷,
    '유형이 업체관리와 어긋났다 — 뉴스레터가 업체관리의 typeCode 를 읽으므로 같아야 한다');
});

test('유형마다 표시(아이콘)가 있다 — 빛깔만으로는 넷이 안 갈린다', () => {
  /* 업체관리는 자문·노조가 같은 파랑, 급여·기금이 같은 주황이다.
     그래서 빛깔만 쓰면 넷 가운데 둘씩 구별이 안 된다. */
  C.유형들.forEach(t => {
    assert.ok(t.표시 && t.표시.length, t.키 + ': 표시가 없다');
    assert.ok(/^#[0-9a-f]{6}$/i.test(t.연한빛), t.키 + ': 연한빛이 빛깔값이 아니다');
    assert.ok(/^#[0-9a-f]{6}$/i.test(t.진한빛), t.키 + ': 진한빛이 빛깔값이 아니다');
  });
  const 빛 = C.유형들.map(t => t.빛);
  assert.ok(new Set(빛).size < 빛.length,
    '★ 빛깔이 넷 다 다르면 이 검사의 뜻이 사라진다 — 업체관리가 빛을 겹쳐 쓴다는 사실을 못 박는 것이다');
});

/* ══════ ② 유형은 업체관리에서 그대로 온다 ══════ */

test('typeCode 를 그대로 나른다', () => {
  const r = 명단({
    a: 집({ id: '1', name: '가', typeCode: '급여', primaryContactEmail: 'a@x.com' }),
    b: 집({ id: '2', name: '나', typeCode: '노조', primaryContactEmail: 'b@x.com' })
  });
  const m = {}; r.ok.forEach(x => { m[x.company] = x.유형; });
  assert.equal(m['가'], '급여');
  assert.equal(m['나'], '노조');
});

test('유형이 없거나 모르는 값이면 «자문»으로 본다 — 업체관리와 같은 잣대', () => {
  /* 업체관리는 co.typeCode||'자문' 으로 그린다. 여기서 다르게 정하면
     같은 업체를 두고 두 화면의 셈이 어긋난다. */
  assert.equal(C.유형고르기(undefined), '자문');
  assert.equal(C.유형고르기(''), '자문');
  assert.equal(C.유형고르기('없는유형'), '자문');
  assert.equal(C.유형고르기('기금'), '기금');
  const r = 명단({ a: 집({ typeCode: '' }) });
  assert.equal(r.ok[0].유형, '자문');
});

test('★ 유형이 명단다듬기를 «지나도 살아 있다»', () => {
  /* 다듬을 때 유형을 흘리면, 걸러도 아무것도 안 남는다(2026-09-03 에 실제로 그랬다). */
  const r = 명단({ a: 집({ typeCode: '기금' }) });
  assert.equal(r.ok[0].유형, '기금',
    '다듬은 뒤 유형이 사라졌다 — 화면이 유형으로 가르지 못한다');
});

/* ══════ ③ 세기 ══════ */

test('0곳인 유형도 칸을 남긴다', () => {
  /* 「노조가 없어졌나」와 「노조가 원래 없나」는 다른 말이다. */
  const n = C.유형별셈([{ 유형: '자문' }, { 유형: '자문' }]);
  assert.deepEqual(Object.keys(n).sort(), C.유형들.map(t => t.키).sort());
  assert.equal(n['자문'], 2);
  assert.equal(n['노조'], 0);
  assert.equal(n['기금'], 0);
});

test('빈 목록에도 안 터지고, 넷을 다 0 으로 준다', () => {
  [[], null, undefined].forEach(v => {
    const n = C.유형별셈(v);
    assert.equal(Object.keys(n).length, C.유형들.length);
    C.유형들.forEach(t => assert.equal(n[t.키], 0));
  });
});

test('셈의 합이 줄 수와 같다 — 어느 유형에도 안 든 줄이 없다', () => {
  const 줄 = [{ 유형: '자문' }, { 유형: '급여' }, { 유형: '없는것' }, {}];
  const n = C.유형별셈(줄);
  const 합 = Object.keys(n).reduce((a, k) => a + n[k], 0);
  assert.equal(합, 줄.length, '어느 칸에도 안 들어간 줄이 있다 — 칩 숫자를 더해도 전체가 안 된다');
});

/* ══════ ④ 거르기 ══════ */

test('고른 유형만 남는다', () => {
  const 줄 = [{ 유형: '자문' }, { 유형: '급여' }, { 유형: '급여' }, { 유형: '기금' }];
  assert.equal(C.유형으로거르기(줄, '급여').length, 2);
  assert.equal(C.유형으로거르기(줄, '기금').length, 1);
  assert.equal(C.유형으로거르기(줄, '노조').length, 0);
});

test('빈 값이면 «전체»다 — 거르기를 푼 상태', () => {
  const 줄 = [{ 유형: '자문' }, { 유형: '급여' }];
  assert.equal(C.유형으로거르기(줄, '').length, 2);
  assert.equal(C.유형으로거르기(줄, null).length, 2);
});

test('거르기가 원본을 «안 건드린다»', () => {
  const 줄 = [{ 유형: '자문' }, { 유형: '급여' }];
  C.유형으로거르기(줄, '급여');
  assert.equal(줄.length, 2, '원본이 줄었다 — 다음에 셀 때 숫자가 달라진다');
});

/* ══════ ⑤ 화면 — 번호와, 화면과 발송이 어긋나지 않기 ══════ */

test('번호 칸이 있고 «보이는 차례»로 붙는다', () => {
  assert.ok(/<th class="n">#<\/th>/.test(news), '표 머리에 번호 칸이 없다');
  assert.ok(/<td class="n">'\s*\+\s*\(i\s*\+\s*1\)/.test(news),
    '번호를 1부터 이어 붙이지 않는다');
});

test('유형 열을 딱지로 그린다', () => {
  assert.ok(/class="ty"/.test(news), '유형 딱지가 없다');
  assert.ok(/Core\.유형들/.test(news), '유형 목록을 부품에서 안 가져온다');
});

test('★★ 화면과 «보내는 곳»이 같은 한 자리에서 걸러진다', () => {
  /* 이 검사가 이 파일의 급소다. 거르는 자리가 둘이면
     화면에는 38곳인데 110곳에 나간다 — 되돌릴 수 없는 사고다. */
  const m = /function 명단셈\(\)\{([\s\S]*?)\n\}/.exec(news);
  assert.ok(m, '명단셈 을 못 찾았다');
  assert.ok(/Core\.유형으로거르기/.test(m[1]),
    '거르기가 명단셈 «안»에 없다 — 화면만 걸러지고 발송은 전체로 나갈 수 있다');
  /* 보내는 길이 명단셈 을 쓰는가 */
  const 보내기 = /async function 진짜보내기\(\)\{([\s\S]*?)\n\}/.exec(news);
  assert.ok(보내기 && /명단셈\(\)/.test(보내기[1]), '보내기가 명단셈 을 안 쓴다');
  /* 화면 밖에서 또 거르지 않는가 — 거르는 낱말이 명단셈 밖에 있으면 두 자리가 된다 */
  const 밖 = news.replace(m[0], '');
  assert.ok(!/Core\.유형으로거르기/.test(밖),
    '거르기가 명단셈 밖에도 있다 — 두 자리가 되면 언젠가 어긋난다');
});

test('★ 유형을 골라 두면 보내기 «확인 창»이 먼저 그것을 말한다', () => {
  /* 골라 놓고 잊으면 전부에 보낸 줄 아신다. 되돌릴 수 없는 단추 앞이라 더 그렇다. */
  const m = /async function 진짜보내기\(\)\{([\s\S]*?)\n\}/.exec(news);
  assert.ok(/App\.유형/.test(m[1]), '확인 창이 고른 유형을 말하지 않는다');
  assert.ok(/전체 \(자문·급여·노조·기금 모두\)/.test(m[1]),
    '전체일 때도 «전체»라고 말해야 한다 — 아무 말이 없으면 무엇인지 모른다');
});

test('보내기 단추에도 고른 유형이 적힌다', () => {
  assert.ok(/App\.유형 \? esc\(App\.유형\)/.test(news),
    '단추가 「N곳에 보내기」만 말한다 — 무엇의 N곳인지 안 보인다');
});

test('눌린 칩을 다시 누르면 전체로 돌아온다', () => {
  const m = /function 유형칩누르기\(v\)\{([\s\S]*?)\n\}/.exec(news);
  assert.ok(m, '유형칩누르기 를 못 찾았다');
  assert.ok(/App\.유형 === v/.test(m[1]), '같은 칩을 다시 눌러 푸는 길이 없다');
});

test('CSV·엑셀도 «고른 것»만 내보낸다 — 화면과 다른 것이 나가면 안 된다', () => {
  ['function 명단내보내기\\(\\)', 'function 노무사회엑셀\\(\\)'].forEach(패턴 => {
    const m = new RegExp(패턴 + '\\{([\\s\\S]*?)\\n\\}').exec(news);
    assert.ok(m, 패턴 + ' 을 못 찾았다');
    assert.ok(/명단셈\(\)/.test(m[1]), 패턴 + ' 이 명단셈 을 안 쓴다 — 화면과 다른 것이 나간다');
  });
});
