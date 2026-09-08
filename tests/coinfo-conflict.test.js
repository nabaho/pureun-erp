'use strict';
/* 사진첩이 읽은 값이 기존 값과 «다를 때» — 조용히 버리지 않고 알린다
   ═══════════════════════════════════════════════════════════════════════════
   대표 지시 2026-08-24(1순위): 기업정보함 보강 검토 결과 가장 위험한 자리.

   ■ 무엇이 문제였나
     sendToCoInfo 는 「빈 칸만 채운다」가 규칙이다(사람이 고친 값을 안 지우려고).
     그 자체는 맞다. 그런데 «다른 값이 와서 안 넣은 것»과 «이미 같은 값이라 안 넣은 것»을
     구별하지 않고 둘 다 조용히 넘어갔다. 그러고는 화면에
     「이미 다 들어 있습니다」라고 알렸다 — 사실은 다른 값이 있는데도 확인된 것처럼 읽힌다.

     노무법인 메일·계약서·신고서에 대표자·소재지가 틀리면 그대로 나간다. 그런데 지금
     구조로는 «어긋난 값이 있다»는 사실 자체를 아무도 알 수 없었다.

   ■ 어떻게 고쳤나
     다를 때만 coInfo/{열쇠}/conflicts/{칸} 에 한 줄 남긴다 — 무슨 값이 왔고, 지금 값은
     무엇이고, 어느 서류에서 왔는지. 값 자체는 «여전히 안 덮는다»(규칙 그대로).
     ⚠ 다를 때만 쓴다 — 같으면 한 글자도 안 쓴다. 그래야 비용이 안 는다
       (2026-08-23 에 줄인 실시간DB 사용량을 되돌리지 않는다).

   ★ 여기서 못 박는 것
     ① 값이 다르면 conflicts 에 남는다 — 무슨 값·지금 값·어느 서류
     ② 값이 같으면 아무 것도 안 쓴다 (빈 update 로 요금 새지 않게)
     ③ 값은 여전히 «안 덮는다» — 사람이 고친 것이 사라지면 안 된다
     ④ 알림 글이 「이미 다 들어 있습니다」에서 «다른 값이 있다»로 바뀐다
     ⑤ 빈 칸은 그냥 채운다 — 어긋남이 아니다
     ⑥ 같은 어긋남을 두 번 보내도 줄이 늘지 않는다 (칸 이름이 열쇠)
   실행: node --test tests/coinfo-conflict.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'pu-doc-file.js'), 'utf8');

function load(existing){
  const i = src.indexOf('function sendToCoInfo');
  const j = src.indexOf('function sendToCompany');
  assert.ok(i > 0 && j > i, 'sendToCoInfo 를 찾지 못했습니다');
  const writes = [];
  const ctx = {
    Promise, Object, String, Date, Error,
    CARDS_ROOT: 'pucards',
    /* 알림 글이 칸 이름표를 쓴다 — 잘라낸 조각 밖에 있어 넣어 준다.
       진짜 표(js/pu-doc-file.js 의 CO_LABEL)와 이름이 같으면 충분하다. */
    CO_LABEL: { ceo:'대표자', address:'소재지', companyTel:'전화' },
    /* 2026-08-28: 어긋남 알림이 «기업정보함» 이름표를 먼저 본다 */
    FIELD_LABEL: { ceo:'대표자', address:'소재지', companyTel:'대표번호' },
    /* 2026-08-28: 서류 밑에 pairs 를 담는다 — 그 한계값 */
    CO_PAIRS_MAX: 60, CO_PAIR_LEN: 300,
    bizKey: v => { const d = String(v||'').replace(/\D/g,''); return d.length>=10 ? d : ''; },
    deps: { db: { ref: p => ({
      once: () => Promise.resolve({ val: () => existing }),
      update: v => { writes.push({ path:p, val:v }); return Promise.resolve(); }
    }) } },
    _writes: writes
  };
  vm.createContext(ctx);
  vm.runInContext(src.slice(i, j), ctx);
  return ctx;
}
const FIELDS = { bizno:'134-86-05772', ceo:'나성환', address:'충남 천안시 서북구 1',
  docName:'기술·경영 혁신 지원신청서' };

/* ══════ ① 다르면 남긴다 ══════ */

test('★ 값이 다르면 conflicts 에 남는다', async () => {
  const c = load({ ceo:'김철수' });                    /* 지금 값이 다르다 */
  await c.sendToCoInfo({ fields: FIELDS, byName:'권형하' });
  const v = c._writes[0].val;
  assert.ok(v['conflicts/ceo'], '★ 다른 값이 왔는데 아무 기록도 안 남았다');
  assert.equal(v['conflicts/ceo'].got, '나성환', '읽은 값을 안 남겼다');
  assert.equal(v['conflicts/ceo'].had, '김철수', '지금 값을 안 남겼다 — 무엇과 다른지 모른다');
});

test('어느 서류에서 온 어긋남인지 남는다', async () => {
  const c = load({ ceo:'김철수' });
  await c.sendToCoInfo({ fields: FIELDS, byName:'권형하',
    photo:{ year:'2026', id:'p1', owner:'kwon' } });
  const rec = c._writes[0].val['conflicts/ceo'];
  assert.equal(rec.doc, '기술·경영 혁신 지원신청서', '어느 서류인지 없으면 원본을 못 찾는다');
  assert.equal(rec.by, '권형하', '누가 보냈는지 없다');
  assert.ok(rec.at, '언제인지 없다');
  assert.equal(rec.photoId, 'p1', '사진 번호가 없으면 원본을 못 연다');
  assert.equal(rec.photoYear, '2026');
});

test('여러 칸이 동시에 어긋나면 다 남는다', async () => {
  const c = load({ ceo:'김철수', address:'서울 어딘가' });
  await c.sendToCoInfo({ fields: FIELDS });
  const v = c._writes[0].val;
  assert.ok(v['conflicts/ceo'], '대표자 어긋남이 없다');
  assert.ok(v['conflicts/address'], '소재지 어긋남이 없다');
});

/* ══════ ② 같으면 한 글자도 안 쓴다 ══════ */

test('★ 값이 «같으면» 아무 것도 안 쓴다 — 요금이 새면 안 된다', async () => {
  const c = load({ ceo:'나성환', address:'충남 천안시 서북구 1',
    docName:'기술·경영 혁신 지원신청서',
    tags:{ '기술·경영 혁신 지원신청서':true } });
  const r = await c.sendToCoInfo({ fields: FIELDS });
  assert.equal(c._writes.length, 0, '★ 새로 넣을 것도 어긋남도 없는데 서버에 썼다');
  assert.equal(r.ok, true);
});

test('띄어쓰기만 다른 것은 어긋남이 아니다 — 사람 눈에 같은 값이다', async () => {
  const c = load({ ceo:'  나성환  ' });
  await c.sendToCoInfo({ fields: { bizno:FIELDS.bizno, ceo:'나성환' } });
  const wrote = c._writes[0];
  if (wrote) assert.equal(wrote.val['conflicts/ceo'], undefined,
    '앞뒤 빈칸만 다른데 어긋남으로 봤다');
});

/* ══════ ③ 값은 여전히 안 덮는다 ══════ */

test('★ 어긋나도 «값은 안 덮는다» — 사람이 고친 것이 사라지면 안 된다', async () => {
  const c = load({ ceo:'사람이 고친 대표자' });
  await c.sendToCoInfo({ fields: FIELDS });
  const v = c._writes[0].val;
  assert.equal(v.ceo, undefined, '★ 기존 값을 덮었다 — 이 규칙이 깨지면 손으로 고친 것이 날아간다');
  assert.ok(v['conflicts/ceo'], '덮지 않았으면 대신 알려는 줘야 한다');
});

/* ══════ ④ 알림 글 ══════ */

test('★ 어긋남만 있으면 「이미 다 들어 있습니다」라고 하지 않는다', async () => {
  const c = load({ ceo:'김철수', address:'충남 천안시 서북구 1',
    docName:'기술·경영 혁신 지원신청서',
    tags:{ '기술·경영 혁신 지원신청서':true } });
  const r = await c.sendToCoInfo({ fields: FIELDS });
  assert.equal(/이미 다 들어 있습니다/.test(r.message), false,
    '★ 다른 값이 있는데 확인된 것처럼 알린다: ' + r.message);
  assert.match(r.message, /다른 값|확인/, '무엇이 문제인지 안 알려 준다: ' + r.message);
  assert.equal(r.conflicts, 1, '어긋난 칸 수를 안 알려 준다');
});

test('채운 것과 어긋난 것이 같이 있으면 둘 다 알린다', async () => {
  const c = load({ ceo:'김철수' });                   /* 대표자는 어긋, 소재지는 빈칸 */
  const r = await c.sendToCoInfo({ fields: FIELDS });
  assert.ok(r.filled.length >= 1, '채운 것이 없다');
  assert.equal(r.conflicts, 1, '어긋난 칸 수가 틀리다');
  assert.match(r.message, /다른 값|확인/, '어긋남을 안 알린다: ' + r.message);
});

test('아무 문제 없으면 예전 글 그대로', async () => {
  const c = load({});
  const r = await c.sendToCoInfo({ fields: FIELDS });
  assert.equal(r.conflicts, 0);
  assert.match(r.message, /기업 상세에 넣었습니다/);
});

/* ══════ ⑤ 빈 칸은 그냥 채운다 ══════ */

test('빈 칸은 어긋남이 아니라 그냥 채운다', async () => {
  const c = load({ ceo:'' });
  await c.sendToCoInfo({ fields: FIELDS });
  const v = c._writes[0].val;
  assert.equal(v.ceo, '나성환', '빈 칸을 안 채웠다');
  assert.equal(v['conflicts/ceo'], undefined, '빈 칸을 어긋남으로 봤다');
});

/* ══════ ⑥ 같은 어긋남을 두 번 보내도 줄이 안 는다 ══════ */

test('★ 칸 이름이 열쇠다 — 같은 칸의 어긋남은 한 줄로 덮어쓴다', async () => {
  const c = load({ ceo:'김철수' });
  await c.sendToCoInfo({ fields: FIELDS });
  const keys = Object.keys(c._writes[0].val).filter(k => k.indexOf('conflicts/') === 0);
  assert.deepEqual(keys, ['conflicts/ceo'],
    '★ 칸마다 한 줄이어야 한다 — 보낼 때마다 쌓이면 줄이 끝없이 는다');
});

/* ══════ 화면 쪽 — 기업 상세가 어긋남을 보여준다 ══════ */

const cards = fs.readFileSync(path.join(__dirname, '..', 'pu-cards.html'), 'utf8').replace(/\r\n/g, '\n');
function fnBody(name){
  let i = cards.indexOf('\nfunction ' + name + '(');
  if (i < 0) i = cards.indexOf('\nasync function ' + name + '(');
  assert.ok(i >= 0, name + ' 를 찾을 수 없습니다');
  const open = cards.indexOf('{', i);
  let d = 0;
  for (let k = open; k < cards.length; k++) {
    if (cards[k] === '{') d++;
    else if (cards[k] === '}') { d--; if (!d) return cards.slice(i, k + 1); }
  }
  assert.fail(name + ' 의 끝을 찾을 수 없습니다');
}

test('★ 회사 줄에 어긋남 표시가 뜬다', () => {
  const fn = fnBody('coListHtml');
  assert.match(fn, /coConflictN\(/, '★ 어긋남이 있어도 목록에서 안 보이면 아무도 안 고친다');
});

test('★ 어긋난 칸을 상세에서 «무슨 값인지»까지 보여준다', () => {
  const fn = fnBody('coConflictHtml');
  for (const must of ['got', 'had']) {
    assert.ok(fn.indexOf(must) > 0, '읽은 값·지금 값 둘 다 보여야 판단할 수 있다: ' + must);
  }
  assert.match(fn, /openCoDoc\(/, '어느 서류에서 왔는지 원본을 열 수 있어야 한다');
});

test('어긋남 개수를 세는 길이 하나뿐이다', () => {
  const fn = fnBody('coConflictN');
  assert.match(fn, /conflicts/, 'conflicts 를 안 본다');
});
