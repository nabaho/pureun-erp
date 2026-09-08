'use strict';
/* ══════ 폰 목록에도 PC 와 «같은 표시»를 붙인다 (점검 D2, 2026-08-31) ══════
   PC 표의 담당 칸에는 이 다섯이 다 있었다 —
     유형(자문·급여) · 담당 노무사 · 역할 한 글자(대/담/실) · 🚪 계약해지 · ⚠중복
   그런데 폰 줄에는 담당 «이름» 하나뿐이었다(🏢 푸른담당 김보람).

   ■ 왜 이것이 문제인가
     밖에서 폰으로 보는 때가 정작 이 표시가 가장 필요한 때다 — 거래처 앞에 서서
     「여기 계약 끝난 곳 아닌가」, 「이 사람이 담당자 맞나」를 물을 때. 그때 화면이
     아무 말도 안 했다. PC 앞에 앉아야만 알 수 있는 표시는 반쪽이다.

   ■ 어떻게 했나
     딱지를 새로 «만들지 않는다». 이미 있는 판단(ErpMatch·cardLacks·dupIdSetCached)을
     폰에도 보여 줄 뿐이다. 폰에서 따로 세면 PC 와 답이 어긋나고, 그 어긋남은
     아무도 눈치 못 챈다.

   ■ 함께 바로잡은 것 — 「정보부족」이 등록증에는 거짓말이었다
     잣대가 거르개 안에 식으로만 박혀 있었다: 전화 «그리고» 이메일이 있어야 한다.
     그런데 사업자등록증에는 이메일 칸이 아예 없다 — 그대로 대면 등록증 4,000장이
     죄다 「부족」이 되어 정작 채워야 할 것이 묻힌다. 2026-08-13 「온통 붉어진 화면」과
     2026-08-27 「288곳이 전부 대표번호 없음」이 같은 실수였다.
     잣대를 cardLacks 한 곳으로 꺼내고, 등록증에서는 «대표번호가 없다»는 뜻으로 고쳤다.

   ★ 여기서 못 박는 것
     ① 🚪 계약해지가 폰에도 붙는다
     ② 유형·담당·역할이 폰에도 보인다
     ③ 「연락할 길이 없다」가 갈래마다 «맞는 뜻»이다
     ④ 거르개와 딱지가 «같은 함수»를 쓴다 — 걸러 놓고 딱지가 없으면 안 된다
     ⑤ 중복은 줄마다 다시 세지 않는다 (2026-08-16: 이 판정만 64ms 다)
   실행: node --test tests/cards-phone-badges.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'pu-cards.html'), 'utf8').replace(/\r\n/g, '\n');

function fnAt(mark){
  const i = SRC.indexOf(mark);
  assert.ok(i >= 0, mark + ' 를 찾지 못했다');
  const open = SRC.indexOf('{', i);
  let d = 0;
  for (let k = open; k < SRC.length; k++) {
    if (SRC[k] === '{') d++;
    else if (SRC[k] === '}') { d--; if (!d) return SRC.slice(i, k + 1); }
  }
  assert.fail(mark + ' 의 끝을 찾지 못했다');
}
/* 폰 줄을 «그려 본다» — 글자만 찾으면 지워도 통과한다 */
function row(it, opt){
  const o = opt || {};
  const ctx = { console, Object, String, Number, Array, Boolean,
    state: { tab: it.kind === 'biz' ? 'biz' : 'card', selMode: false, sel: {}, items: {} },
    Store: { thumbCache: {} },
    dupIds: new Set(o.dup ? [it.id] : []),
    esc: s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'),
    fmtBizno: v => String(v || ''),
    ErpMatch: {
      match: () => o.erp || null,
      type: () => (o.erp && o.erp.type) || '',
      mgrs: () => (o.erp ? [o.erp.main].concat(o.erp.subs || []).filter(Boolean) : []),
      role: () => o.role || '',
      isContact: () => !!o.work
    } };
  vm.createContext(ctx);
  vm.runInContext(fnAt('function cardLacks('), ctx);
  vm.runInContext(fnAt('  function rowHtml(it){'), ctx);
  ctx.IT = it;
  return vm.runInContext('rowHtml(IT)', ctx);
}
const 명함 = (x) => Object.assign({ id:'c1', kind:'card', name:'김대리', company:'가나테크',
  mobile:'010-1111-2222', email:'kim@gana.co.kr' }, x || {});
const 등록증 = (x) => Object.assign({ id:'b1', kind:'biz', company:'가나테크',
  bizno:'134-86-05772', ceo:'나성환', companyTel:'041-556-0035' }, x || {});

/* ── ① 🚪 계약해지 ─────────────────────────────────────────────── */

test('★ 계약이 끝난 거래처면 폰 줄에도 🚪 가 붙는다', () => {
  const h = row(명함(), { erp: { left: true, main: '권형하', subs: [], type: '자문' } });
  assert.ok(h.includes('🚪'),
    '★ 밖에서 거래처 앞에 서 있을 때가 정작 이걸 알아야 하는 때다');
  assert.ok(h.includes('계약해지'), '무슨 뜻인지 말풍선이 말해야 한다');
});

test('계약이 살아 있으면 안 붙는다 — 아무 데나 붙으면 아무 뜻도 없어진다', () => {
  const h = row(명함(), { erp: { left: false, main: '권형하', subs: [], type: '자문' } });
  assert.ok(!h.includes('🚪'));
});

/* ── ② 유형·담당·역할 ──────────────────────────────────────────── */

test('★ 유형과 담당 노무사가 폰에도 보인다', () => {
  const h = row(명함(), { erp: { left: false, main: '권형하', subs: [], type: '자문' } });
  assert.ok(h.includes('자문'), '★ 자문인지 급여인지 폰에서 알 길이 없었다');
  assert.ok(h.includes('권형하'));
});

test('부담당은 «수»로 접는다 — 이름을 다 적으면 폰 줄이 넘친다', () => {
  const h = row(명함(), { erp: { left: false, main: '권형하', subs: ['박은비','이슬'], type: '급여' } });
  assert.ok(h.includes('+2'), '부담당 둘을 「+2」로 접어야 한다');
  assert.ok(!h.includes('박은비') || h.indexOf('박은비') > h.indexOf('title='),
    '이름은 말풍선에만 있어야 한다');
});

test('★ 역할 한 글자(대/담/실)가 폰에도 붙는다', () => {
  const erp = { left: false, main: '권형하', subs: [], type: '자문' };
  assert.ok(row(명함(), { erp, role: 'ceo' }).includes('>대<'), '대표자 표시가 없다');
  assert.ok(row(명함(), { erp, role: 'contact' }).includes('>담<'), '담당자 표시가 없다');
  assert.ok(row(명함(), { erp, work: true }).includes('>실<'), '실무담당 표시가 없다');
  assert.ok(!row(명함(), { erp }).includes('r-ceo'), '아무 역할도 없는데 표시가 붙었다');
});

test('업체관리에 이어졌는데 담당이 없으면 «그렇다고 말한다»', () => {
  const h = row(명함(), { erp: { left: false, main: '', subs: [], type: '' } });
  assert.ok(h.includes('담당 미지정'),
    '빈 줄을 그리면 이어진 것인지 아닌지조차 알 수 없다');
});

test('업체관리에 없는 명함은 담당 줄을 아예 안 그린다', () => {
  assert.ok(!row(명함(), {}).includes('erpmgr'));
});

/* ── ③ 「연락할 길이 없다」 ────────────────────────────────────── */

test('★ 이메일이 없는 명함에 「연락처 부족」이 붙는다', () => {
  assert.ok(row(명함({ email: '' }), {}).includes('연락처 부족'));
  assert.ok(row(명함({ mobile: '', tel: '', companyTel: '' }), {}).includes('연락처 부족'));
  assert.ok(!row(명함(), {}).includes('연락처 부족'), '다 있는데 부족이라 하면 안 된다');
});

test('★ 등록증에는 «대표번호»로 본다 — 이메일 칸이 아예 없다', () => {
  /* 명함 잣대를 그대로 대면 등록증 4,000장이 죄다 붉어진다.
     2026-08-13 「온통 붉어진 화면」과 같은 실수다. */
  assert.ok(!row(등록증(), {}).includes('번호 없음'),
    '★ 대표번호가 있는데 부족이라 한다 — 등록증에는 이메일 칸이 없다');
  assert.ok(row(등록증({ companyTel: '' }), {}).includes('번호 없음'));
});

test('★ 거르개와 딱지가 «같은 함수»를 쓴다 — 걸러 놓고 딱지가 없으면 안 된다', () => {
  const li = fnAt('function listItems(');
  assert.match(li, /state\.onlyIncomplete && !cardLacks\(it\)/,
    '★ 거르개가 제 나름의 식을 갖고 있다 — 두 벌이 되면 「부족만 보기」로 걸러 놓고 '
    + '그 줄에는 딱지가 안 붙는다');
  assert.match(fnAt('  function rowHtml(it){'), /cardLacks\(it\)/,
    '★ 딱지가 제 나름의 식을 갖고 있다');
});

/* ── ④ ⚠중복 ──────────────────────────────────────────────────── */

test('★ 겹친 명함이면 폰 줄에도 ⚠ 가 붙는다', () => {
  assert.ok(row(명함(), { dup: true }).includes('겹친'));
  assert.ok(!row(명함(), {}).includes('겹친'));
});

test('★ 중복을 «줄마다» 다시 세지 않는다 — 이 판정만 64ms 다', () => {
  /* 2026-08-16 대표 확인: 네모 하나 누를 때마다 목록이 0.2~0.5초 멈췄다.
     세는 자리가 rowHtml «안»으로 들어가면 그것이 그대로 되풀이된다. */
  const rl = fnAt('function renderList(');
  /* ⚠ «부르는 자리»를 찾는다 — 괄호까지 본다. 그냥 이름으로 찾으면 바로 위 주석에 적힌
     「(dupIdSetCached)」가 먼저 걸려, 세기를 rowHtml 안으로 옮겨도 늘 통과한다.
     실제로 그랬다(2026-08-31 고장넣기에서 샜다) — 제가 쓴 주석이 제 검사를 눈멀게 했다. */
  const at = rl.indexOf('dupIdSetCached(');
  const rowAt = rl.indexOf('function rowHtml(');
  assert.ok(at > 0, '★ PC 표와 같은 함수로 세지 않는다 — 폰과 PC 의 답이 어긋난다');
  assert.ok(rowAt > 0, 'rowHtml 을 찾지 못했다');
  assert.ok(at < rowAt,
    '★ 중복 세기가 rowHtml 안으로 들어갔다 — 줄마다 64ms 씩 되풀이된다 '
    + '(세는 자리 ' + at + ' · 줄 그리는 자리 ' + rowAt + ')');
});
