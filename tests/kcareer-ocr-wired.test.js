'use strict';
/* OCR 칸을 만들었으면 «읽는 쪽»도 이어야 한다 (대표 제보 2026-09-06 「ocr 읽을때 내용 안나온다」)

   ■ 무슨 일이 있었나
   기업경력 화면을 만들면서 OCR 칸(ocr-zone data-store="work")만 놓고
   ①판독 사전(PAGE_OCR_PROMPT.work) ②저장 갈래(saveOCRRecord) ③파일명 갈래를 안 이었다.
   그래서 —
     · 경력증명서를 «위촉장 사전»으로 읽었다(못 찾으면 wiccok 으로 대신 읽는다)
     · saveOCRRecord 가 null 을 돌려주어 아무것도 안 만들어졌다
     · 그런데 화면에는 「OCR 완료: 1건」이 떴다(null 을 만든 것으로 셌다)
   대표가 보신 것이 이것이다 — 읽었다는데 목록은 그대로.

   ■ 이 검사가 지키는 것
   화면에 OCR 칸이 있는 «모든» 보관함은 사전과 저장 갈래를 가져야 한다.
   새 화면을 만들 때 하나라도 빠지면 여기서 걸린다 — 사람이 겪기 전에.

   ⚠ 목록을 손으로 적지 않는다. 화면에서 «실제로 찾아» 견준다 —
     손으로 적으면 새 화면이 늘 때 이 검사가 조용히 눈을 감는다. */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { stripComments } = require('./strip-comments');
const { cutFn } = require('./cut-fn');

const ROOT = path.join(__dirname, '..');
const raw = fs.readFileSync(path.join(ROOT, 'kcareer.html'), 'utf8');
const bare = stripComments(raw);

/* 화면에 OCR 칸이 있는 보관함 — 여기서 «찾아»낸다 */
const 칸 = [...new Set([...raw.matchAll(/class="ocr-zone"\s+data-store="([A-Za-z_]+)"/g)]
  .map((m) => m[1]))];

test('화면에 OCR 칸이 여럿 있다 (찾는 자가 헛돌지 않는다)', () => {
  assert.ok(칸.length >= 5,
    'OCR 칸을 못 찾았다(' + 칸.length + '개) — 찾는 자가 낡았다. 이 검사부터 고칠 것');
});

/* PAGE_OCR_PROMPT 안쪽만 잘라 본다 — 밖에서 같은 낱말이 나와도 속지 않게 */
function 사전본문() {
  const i = bare.indexOf('const PAGE_OCR_PROMPT={');
  assert.ok(i >= 0, 'PAGE_OCR_PROMPT 를 못 찾았다');
  const j = bare.indexOf('\nasync function saveOCRRecord', i);
  assert.ok(j > i, 'PAGE_OCR_PROMPT 의 끝을 못 찾았다');
  return bare.slice(i, j);
}

칸.forEach((store) => {
  test('「' + store + '」 화면에 판독 사전이 있다', () => {
    const 본문 = 사전본문();
    /* key: '…' 또는 key:`…` 둘 다 받는다 */
    const re = new RegExp('(^|[{,\\s])' + store + '\\s*:\\s*[`\'"]', 'm');
    assert.ok(re.test(본문),
      store + ' 의 판독 사전이 없다 — 못 찾으면 «위촉장 사전»으로 대신 읽는다.\n' +
      '    경력증명서를 위촉장으로 읽으면 나오는 값이 딴판이라 한 칸도 안 채워진다.');
  });

  test('「' + store + '」 를 saveOCRRecord 가 담을 줄 안다', () => {
    const fn = cutFn(bare, 'async function saveOCRRecord(');
    assert.ok(fn, 'saveOCRRecord 를 못 찾았다');
    const re = new RegExp("page\\s*===\\s*'" + store + "'");
    assert.ok(re.test(fn),
      store + ' 갈래가 없다 — saveOCRRecord 가 null 을 돌려주고 아무것도 안 만들어진다.\n' +
      '    읽기는 되므로 사람 눈에는 「읽었다는데 목록엔 없다」로 보인다.');
  });
});

test('★★ 못 담은 것을 «등록됨»으로 세지 않는다', () => {
  /* 이것이 없으면, 위의 빠짐이 있어도 화면에는 「OCR 완료: 1건」이 떠서
     사람이 «되었다»고 믿는다. 잘못된 성공 보고가 빠짐보다 나쁘다. */
  const fn = cutFn(bare, 'async function ocrDrop(');
  assert.ok(fn, 'ocrDrop 을 못 찾았다');
  assert.match(fn, /res\s*==\s*null/,
    'saveOCRRecord 가 null 을 돌려줬을 때를 가려내지 않는다 — 만든 것으로 세어 버린다');
  assert.match(fn, /못담음/,
    '못 담은 건수를 따로 세야 합니다');
});

test('★ 못 담았으면 «어느 화면»인지까지 알려 준다', () => {
  const fn = cutFn(bare, 'async function ocrDrop(');
  assert.match(fn, /못담음\s*\)\s*toast\(/,
    '못 담았는데 조용하면 「왜 안 되는지 모르겠다」가 된다');
  assert.match(fn, /page=/,
    '어느 화면인지 알려 줘야 고칠 수 있습니다');
});

/* ── 기업경력 자리 ── */
test('기업경력 판독 사전은 입사일·퇴사일을 «갈라» 받는다', () => {
  const 본문 = 사전본문();
  const i = 본문.indexOf('work:');
  assert.ok(i >= 0, 'work 사전이 없다');
  const seg = 본문.slice(i, i + 1400);
  assert.match(seg, /joinDate/, '입사일을 안 받는다');
  assert.match(seg, /leaveDate/, '퇴사일을 안 받는다');
  assert.ok(!/"period"/.test(seg),
    '근무기간을 한 덩이로 받으면 안 된다 — 화면이 입사일·퇴사일에서 만든다(workPeriod).\n' +
    '    두 곳에 담으면 반드시 어긋난다');
  assert.match(seg, /재직 중이면/,
    '재직 중일 때 퇴사일을 비우라고 못 박아야 한다 — 「현재」가 날짜 칸에 들어오면\n' +
    '    근무기간이 「2016.01 ~ 현재현재」가 된다');
});

test('기업경력 저장 갈래는 근무기간을 «만들어 담지» 않는다', () => {
  const fn = cutFn(bare, 'async function saveOCRRecord(');
  const i = fn.indexOf("page==='work'");
  assert.ok(i >= 0, 'work 갈래가 없다');
  /* ⚠ 고정 폭으로 자르면 «다음 갈래»까지 딸려 온다 — edu 갈래에 period 가 있어
     엉뚱하게 걸렸다. 갈래의 끝(다음 else if)에서 끊는다. */
  const 끝 = fn.indexOf('} else if(', i);
  const seg = fn.slice(i, 끝 > i ? 끝 : i + 900);
  assert.match(seg, /joinDate:/, '입사일을 안 담는다');
  assert.match(seg, /leaveDate:/, '퇴사일을 안 담는다');
  assert.ok(!/\bperiod:/.test(seg),
    'period 를 담으면 workPeriod 가 만드는 값과 어긋난다 — 담는 곳은 한 곳이어야 한다');
});

test('판독이 안 될 때 파일명으로라도 담을 자리가 있다', () => {
  const fn = cutFn(bare, 'function quickParseFilename(');
  assert.ok(fn, 'quickParseFilename 을 못 찾았다');
  assert.match(fn, /page==='work'/,
    'HWP 이거나 판독이 안 될 때 파일명 등록조차 안 된다');
});
