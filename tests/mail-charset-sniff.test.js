'use strict';
/* 본문 글자표 — 머리글이 «틀릴» 수 있다 (대표 제보 2026-09-07)
   ═══════════════════════════════════════════════════════════════════════════
   「이유가 뭐냐」 — 메일을 열면 본문이 통째로 깨져 있었다.

   ★ 무슨 일이었나
     충남경제진흥원에서 온 메일을 열면 본문이
       「異⑸④꼍吏μ 蹂寃쎌」
     처럼 깨졌다. 그런데 **목록의 미리보기는 멀쩡했다** — 같은 메일인데.
     까닭은 두 길이 서로 «다른 조각»을 고르기 때문이다.
       · 미리보기(textPartOf) → text/plain 을 먼저 고른다. 그 조각은 글자표가 맞았다.
       · 열 때(pickParts)     → text/html 을 먼저 고른다. 보낸 쪽이 그 조각에
         charset=euc-kr 이라 적어 두었는데 **실제 바이트는 UTF-8** 이었다.
     재현: 멀쩡한 글을 UTF-8 로 담아 euc-kr 로 읽으니 화면과 «같은 글자»가 나왔다.

   ★ 여기서 못 박는 것 — 「바이트가 머리글을 이긴다」
     ⚠ 그 판정이 진짜 euc-kr 글을 잘못 데려갈 걱정 → 아래 마지막 검사가 한글 글
       여러 개를 euc-kr 로 담아 «우연히 올바른 UTF-8 인 것이 없음»을 직접 확인한다.
       (실측 2026-09-07: 325개 가운데 0개)

   ⚠ 이 검사는 iconv 같은 짐을 쓰지 않는다 — CI 에 functions 의 짐이 없다.
     euc-kr 로 «담는» 일은 여기서 손으로 한다(아래 eucBytes). */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const MB = require(path.join(__dirname, '..', 'functions', 'mail-box.js'));

/* 이 기계·CI 에 euc-kr 읽개가 있는가 — 없으면 애초에 이 일을 못 한다 */
const EUC_OK = (() => {
  try { new TextDecoder('euc-kr'); return true; } catch (e) { return false; }
})();

/* 글자 하나를 euc-kr 바이트로. 읽개를 거꾸로 써서 표를 만든다 —
   짐 없이, 그리고 «이 기계의 읽개와 어긋나지 않게». */
const EUC_MAP = (() => {
  if (!EUC_OK) return null;
  const dec = new TextDecoder('euc-kr', { fatal: false });
  const m = new Map();
  for (let hi = 0xa1; hi <= 0xfe; hi++) {
    for (let lo = 0xa1; lo <= 0xfe; lo++) {
      const ch = dec.decode(Buffer.from([hi, lo]));
      if (ch.length === 1 && !m.has(ch) && ch !== '�') m.set(ch, [hi, lo]);
    }
  }
  return m;
})();
function eucBytes(s) {
  const out = [];
  for (const ch of String(s)) {
    const c = ch.codePointAt(0);
    if (c < 0x80) { out.push(c); continue; }
    const b = EUC_MAP && EUC_MAP.get(ch);
    if (!b) return null;             /* 이 표에 없는 글자 — 그 시험은 건너뛴다 */
    out.push(b[0], b[1]);
  }
  return Buffer.from(out);
}

const 참 = '안녕하세요 충남경제진흥원 변경아입니다. 지난 주 금요일 신규 컨설턴트 간담회 개최 후 요청하신 자료들을 공유드립니다.';

/* ══════════ 대표 화면에서 실제로 일어난 그것 ══════════ */

test('★★ 머리글이 euc-kr 이라 해도 «바이트가 UTF-8» 이면 UTF-8 로 읽는다', () => {
  const b = Buffer.from(참, 'utf8');
  assert.equal(MB.toText(b, 'euc-kr'), 참,
    '★ 대표 화면이 깨진 그 자리입니다 — 머리글을 그대로 믿고 있습니다');
  /* 보낸 쪽이 옛 이름으로 적어 두는 일도 흔하다 */
  assert.equal(MB.toText(b, 'ks_c_5601-1987'), 참);
  assert.equal(MB.toText(b, 'KSC5601'), 참);
});

test('★★ 깨진 모양이 «화면에서 본 그것»과 같았다 — 고치기 전 길을 되짚는다', () => {
  if (!EUC_OK) { console.log('   (이 기계에 euc-kr 읽개가 없어 건너뜀)'); return; }
  /* 고침이 없었다면 이렇게 읽혔다 */
  const 깨진것 = new TextDecoder('euc-kr', { fatal: false }).decode(Buffer.from(참, 'utf8'));
  /* 대표 화면에 실제로 보였던 글자들 */
  ['異', '寃', '쎌', '몄', 'μ', '④'].forEach((c) => {
    assert.ok(깨진것.indexOf(c) >= 0,
      '되짚기가 헛돌았습니다 — 화면에서 본 「' + c + '」가 안 나옵니다');
  });
  /* 그리고 고친 뒤에는 그 글자가 하나도 없다 */
  const 고친것 = MB.toText(Buffer.from(참, 'utf8'), 'euc-kr');
  ['異', '寃', '쎌', '몄'].forEach((c) => {
    assert.ok(고친것.indexOf(c) < 0, '★ 아직 「' + c + '」가 나옵니다');
  });
});

/* ══════════ 고치면서 잃은 것이 없어야 한다 ══════════ */

test('★★ 진짜 euc-kr 메일은 «예전처럼» 읽는다 — 이것이 깨지면 더 나빠진 것이다', () => {
  if (!EUC_OK) { console.log('   (euc-kr 읽개 없음 — 건너뜀)'); return; }
  const b = eucBytes(참);
  assert.ok(b, 'euc-kr 로 담지 못했습니다');
  assert.equal(MB.toText(b, 'euc-kr'), 참, '★ 진짜 euc-kr 글을 깨뜨립니다');
});

test('★★ 머리글이 utf-8 이라는데 바이트가 euc-kr 이면 euc-kr 로 읽는다 (반대 잘못)', () => {
  if (!EUC_OK) { console.log('   (euc-kr 읽개 없음 — 건너뜀)'); return; }
  const b = eucBytes(참);
  assert.equal(MB.toText(b, 'utf-8'), 참,
    '★ 머리글만 믿어 깨진 글을 그대로 내놓습니다');
  assert.equal(MB.toText(b, ''), 참, '★ 글자표가 아예 없을 때도 같아야 합니다');
});

test('★ 진짜 UTF-8 은 머리글이 맞을 때도 그대로', () => {
  const b = Buffer.from(참, 'utf8');
  assert.equal(MB.toText(b, 'utf-8'), 참);
  assert.equal(MB.toText(b, 'UTF8'), 참);
  assert.equal(MB.toText(b, ''), 참);
});

test('★ 순 ASCII 는 어느 글자표로 적혀 있어도 그대로', () => {
  const s = 'Dear Sir, please find attached the report. Thanks.';
  ['utf-8', 'euc-kr', 'iso-8859-1', ''].forEach((cs) => {
    assert.equal(MB.toText(Buffer.from(s, 'ascii'), cs), s, '글자표: ' + cs);
  });
});

test('★ 모르는 글자표·빈 것에도 터지지 않는다', () => {
  assert.equal(typeof MB.toText(Buffer.from(참, 'utf8'), '이런건없다'), 'string');
  assert.equal(MB.toText(Buffer.alloc(0), 'euc-kr'), '');
  assert.equal(typeof MB.toText(null, 'euc-kr'), 'string');
  assert.equal(MB.toText('그냥 글자', 'euc-kr'), '그냥 글자');
});

/* ══════════ 잘린 꼬리 — 미리보기는 앞부분만 받는다 ══════════ */

test('★★ 앞부분만 잘라 받아 «마지막 글자가 끊겨도» UTF-8 로 알아본다', () => {
  const full = Buffer.from(참, 'utf8');
  /* 한 글자는 3바이트다 — 1·2바이트만 남기고 끊어 본다 */
  for (const cut of [1, 2]) {
    const b = full.subarray(0, full.length - cut);
    const got = MB.toText(b, 'euc-kr');
    assert.ok(got.indexOf('안녕하세요 충남경제진흥원') === 0,
      '★ 꼬리가 끊긴 것 하나 때문에 통째로 euc-kr 로 읽었습니다 (cut=' + cut + '): '
        + JSON.stringify(got.slice(0, 30)));
  }
});

/* ══════════ 「바이트를 믿어도 되는가」를 직접 확인한다 ══════════ */

test('★★ 진짜 euc-kr 한글 글이 «우연히 올바른 UTF-8» 이 되는 일은 없다', () => {
  if (!EUC_OK) { console.log('   (euc-kr 읽개 없음 — 건너뜀)'); return; }
  const 글들 = ['안녕하세요', '감사합니다', '확인 부탁드립니다', '근로기준법', '급여대장 송부',
    '부당해고 구제신청', '산업안전보건법', '최저임금', '연차유급휴가', '퇴직금 산정',
    '가', '나다', '라마바', '한글', '주식회사 푸른 귀중', '별첨 신청서식 1부',
    '위 사람은 위와 같이 근무하였음을 증명합니다', 참];
  /* 짧은 글이 우연히 맞을 확률이 높으니 여러 길이로 만들어 본다 */
  const 자 = '가나다라마바사아자차카타파하거너더러머버서어저처커터퍼허';
  for (let i = 0; i < 240; i++) {
    let s = '';
    const n = 1 + (i % 12);
    for (let k = 0; k < n; k++) s += 자[(i * 7 + k * 13) % 자.length];
    글들.push(s);
  }
  let 봤다 = 0, 위험 = [];
  글들.forEach((s) => {
    const b = eucBytes(s);
    if (!b) return;
    봤다++;
    if (MB.looksUtf8(b)) 위험.push(JSON.stringify(s));
  });
  assert.ok(봤다 > 200, '넣어 본 것이 너무 적습니다 (' + 봤다 + '개) — 검사가 헛돕니다');
  assert.deepEqual(위험, [],
    '★ euc-kr 글을 UTF-8 이라 잘못 봤습니다 — 그 글이 깨집니다: ' + 위험.join(', '));
});

test('★ 순 ASCII 는 «UTF-8 이라 우기지 않는다» — 굳이 갈아탈 까닭이 없다', () => {
  assert.equal(MB.looksUtf8(Buffer.from('Hello')), false);
  assert.equal(MB.looksUtf8(Buffer.alloc(0)), false);
  assert.equal(MB.looksUtf8(null), false);
  assert.equal(MB.looksUtf8(Buffer.from(참, 'utf8')), true);
});
