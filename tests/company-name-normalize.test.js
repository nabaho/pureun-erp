/* 회사 이름 다듬기 — 낱말을 «글자 묶음»에 넣지 않는다 (2026-09-04)
 *
 * ■ 무슨 일이 있었나
 *   회사 표기어를 걷어내는 자리가 저장소에 열댓 곳 있는데, 그중 셋이
 *   대괄호(글자 묶음)로 적혀 있었다.
 *
 *     '한식당'.replace(/[\s㈜()주식회사]/g,'')   →  '한당'
 *     '대주건설'                                →  '대건설'
 *     '사조산업'                                →  '조산업'
 *
 *   대괄호는 「주」「식」「회」「사」를 **낱자로** 지운다. 낱말로 지우려면 갈래(|)여야 한다.
 *   ★ 조용해서 나쁘다 — 오류가 안 나고, 이름이 «그럴듯하게» 줄어든다.
 *
 * ■ 실제로 무엇이 어긋났나
 *   ㉠ 중복 사건 판정: 부분일치가 4글자부터 도는데 줄어든 이름끼리는 남남도 서로 품는다
 *   ㉡ 하나은행 입출금 맞추기: 「대건설」이 「대주건설」을 품어 **남의 입금이 붙는다**(돈)
 *   ㉢ 온톨로지 companies.byName: 서로 다른 회사가 «같은 열쇠»를 갖는다.
 *      게다가 같은 일을 하는 다듬개 둘(normName·linkName)이 **서로 다른 답**을 내고 있었다.
 *
 * ■ 무엇을 못 박나 — 값이 아니라 규칙
 *   ① 저장소 어디에도 「표기어가 든 글자 묶음」이 없다 (다음 사람이 또 쓰면 여기서 걸린다)
 *   ② 온톨로지의 다듬개를 «실제로 돌려» 이름이 안 줄어드는지 본다
 *   ③ 같은 일을 하는 다듬개 둘이 «같은 답»을 낸다
 * 실행: node --test tests/company-name-normalize.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

/* ⚠ 주석을 걷는다 — 이 흠을 «설명하는» 주석이 흠 자체로 읽히면 안 된다.
   실제로 고치면서 옛 모양을 주석에 남겼고, 안 걷으면 고친 코드가 걸린다. */
function bare(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}

/* 화면·스크립트 파일을 훑는다. 목업(docs/mockups)은 그림이라 뺀다. */
function 볼파일() {
  const out = [];
  const 훑기 = (dir, depth) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name.startsWith('.') || e.name === 'node_modules') continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (['tests', 'docs', 'harness', '_scan_out', 'vendor', 'reference'].includes(e.name)) continue;
        if (depth < 3) 훑기(p, depth + 1);
      } else if (/\.(html|js)$/.test(e.name)) out.push(p);
    }
  };
  훑기(root, 0);
  return out;
}

const 표기어 = ['주식회사', '유한회사', '합자회사', '농업회사법인', '재단법인', '사단법인'];

test('★★① 회사 표기어를 «글자 묶음»에 넣지 않는다 — 저장소 전체', () => {
  const 걸린것 = [];
  for (const p of 볼파일()) {
    const src = bare(fs.readFileSync(p, 'utf8'));
    for (const m of src.matchAll(/\[[^\]\n]{0,80}\]/g)) {
      if (표기어.some((w) => m[0].includes(w))) {
        const 줄 = src.slice(0, m.index).split('\n').length;
        걸린것.push(path.relative(root, p) + ':' + 줄 + '  ' + m[0]);
      }
    }
  }
  assert.deepEqual(걸린것, [],
    '★★ 대괄호는 낱말이 아니라 «글자 하나씩»을 지웁니다 — 「대주건설」이 「대건설」이 됩니다.\n'
    + '   갈래로 적으세요:  /주식회사|㈜|[\\s()]/g\n   ' + 걸린것.join('\n   '));
});

/* ②③ 온톨로지의 다듬개를 진짜로 떼어 돌린다 */
function 다듬개들() {
  const src = fs.readFileSync(path.join(root, 'js/pu-ontology.js'), 'utf8');
  const ctx = {};
  vm.createContext(ctx);
  for (const 이름 of ['clean', 'normName', 'linkName']) {
    const at = src.indexOf('function ' + 이름 + '(');
    assert.ok(at > 0, 이름 + ' 을 찾지 못했습니다');
    vm.runInContext(src.slice(at, src.indexOf('\n', at)), ctx);
  }
  return ctx;
}

test('★② 이름이 «줄지 않는다» — 실제로 돌려서 본다', () => {
  const { normName } = 다듬개들();
  /* 검사고정-허용: 아래 다섯은 «값»이 아니라 이 흠이 실제로 냈던 답이다.
     ㈜·괄호·공백만 빠지고 «글자 수는 그대로»여야 한다. */
  const 재보기 = [
    ['한식당', '한식당'],
    ['대주건설', '대주건설'],
    ['사조산업', '사조산업'],
    ['주식회사 대한정밀', '대한정밀'],
    ['㈜푸른에너지솔루션', '푸른에너지솔루션'],
    ['위첸만코리아유한회사', '위첸만코리아'],
  ];
  for (const [넣은것, 나와야] of 재보기) {
    assert.equal(normName(넣은것), 나와야,
      '★ 「' + 넣은것 + '」 이 「' + normName(넣은것) + '」 이 됐습니다 — '
      + '서로 다른 회사가 같은 열쇠를 갖게 됩니다');
  }
});

test('★③ 같은 일을 하는 다듬개 둘이 «같은 답»을 낸다', () => {
  const { normName, linkName } = 다듬개들();
  /* 예전에는 normName 만 대괄호였다 — 즉 이름으로 찾는 자리와 계약 검증이
     서로 다른 답을 내고 있었다. 어느 쪽이 맞는지 사람이 알 길이 없었다. */
  for (const v of ['한식당', '주식회사 대한정밀', '㈜푸른에너지솔루션',
    '위첸만코리아유한회사', '(주) 천성가축약품', '대주건설']) {
    assert.equal(normName(v), linkName(v),
      '★ 「' + v + '」 에 대해 두 다듬개가 다른 답을 냅니다: '
      + normName(v) + ' vs ' + linkName(v));
  }
});

test('그래도 지울 것은 지운다 — 다듬기 자체가 죽지 않았는지', () => {
  const { normName } = 다듬개들();
  assert.equal(normName('  ㈜ 대한 정밀 '), '대한정밀', '공백·㈜ 를 안 지웁니다');
  assert.equal(normName('A&B'), 'a&b', '엉뚱한 글자까지 지웁니다');
});
