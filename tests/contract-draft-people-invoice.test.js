/* 2026-08-26 대표 지시 셋
 * ① 복원 안내 상자를 걷고 「새로 시작」을 계약번호 줄 오른쪽 끝으로
 * ② 담당자는 «하나씩 골라» 담는다 — 회사를 고르면 모두 딸려오던 것
 * ③ 세금계산서 화면이 저장소를 «늘 다시 읽는다» (김보람: 「읽지 못하거나 사라진다」)
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'pu-erp.html'), 'utf8');
function bare(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}
function cutBlock(src, header) {
  const i = src.indexOf(header);
  assert.ok(i >= 0, '못 찾음: ' + header);
  let j = src.indexOf('{', i), d = 0;
  for (let k = j; k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (d === 0) return src.slice(i, k + 1); }
  }
  throw new Error('닫는 괄호 없음: ' + header);
}
const B = bare(SRC);

/* ─────────── ① 복원 안내 · 새로 시작 ─────────── */
test('★ 복원 안내 상자가 사라졌다', () => {
  assert.strictEqual(B.indexOf('📋 이전 작성분 복원됨'), -1, '안내 상자가 남아 있다');
  assert.strictEqual(B.indexOf('새 계약을 시작하려면'), -1, '상자 속 설명이 남아 있다');
});

test('★ 「새로 시작」 단추는 남아 있다 — 되돌릴 손까지 없애면 안 된다', () => {
  assert.ok(B.indexOf("'🆕 새로 시작'") >= 0, '단추가 통째로 사라졌다');
  assert.ok(B.indexOf("'🗑 원래대로'") >= 0, '수정 화면의 되돌리기가 사라졌다');
});

test('★ 그 단추는 계약번호 줄 «오른쪽 끝»에 있다', () => {
  const i = B.indexOf("props.cur ? '🗑 원래대로' : '🆕 새로 시작')");
  assert.ok(i >= 0, '단추를 못 찾았다');
  const near = B.slice(Math.max(0, i - 900), i);
  assert.ok(near.indexOf("marginLeft:'auto'") >= 0, '오른쪽 끝으로 밀지 않았다');
  /* 계약번호 줄 안이어야 한다 — 그 줄의 마지막 조각이 바로 위에 있다 */
  assert.ok(near.indexOf('관리자 권한으로 수정 가능') >= 0, '계약번호 줄 밖에 있다');
});

test('★ 쓰다 만 것이 복원됐을 때만 나온다', () => {
  const i = B.indexOf("props.cur ? '🗑 원래대로' : '🆕 새로 시작')");
  const near = B.slice(Math.max(0, i - 900), i);
  assert.ok(near.indexOf('f._restoredFromDraft != null') >= 0, '늘 보이면 새 계약에서도 거슬린다');
});

test('★ 누르면 임시저장을 지우고 빈 계약으로 되돌린다', () => {
  const i = B.indexOf("props.cur ? '🗑 원래대로' : '🆕 새로 시작')");
  const near = B.slice(Math.max(0, i - 900), i);
  assert.ok(near.indexOf('localStorage.removeItem(DRAFT_KEY)') >= 0, '임시저장을 안 지운다');
  assert.ok(near.indexOf('setF(init)') >= 0, '화면을 안 되돌린다');
});

test('몇 분 전 것인지 «어딘가에는» 남아 있다 (상자를 없앤 대신 단추 설명으로)', () => {
  const i = B.indexOf("props.cur ? '🗑 원래대로' : '🆕 새로 시작')");
  const near = B.slice(Math.max(0, i - 900), i);
  assert.ok(near.indexOf('f._restoredFromDraft') >= 0 && near.indexOf('분 전') >= 0,
    '언제 것인지 알 길이 아예 없어졌다');
});

/* ─────────── ② 담당자는 골라 담는다 ─────────── */
test('★ 부르지 않으면 담당자가 안 딸려온다', () => {
  const fn = bare(cutBlock(SRC, 'function applyCoGroup(g, opts){'));
  const g = fn.indexOf('opts.people === false');
  const m = fn.indexOf('mergeCompanyContacts(');
  assert.ok(g >= 0, '담당자를 건너뛸 길이 없다');
  assert.ok(m >= 0, '담당자 합치기가 사라졌다');
  assert.ok(g < m, '건너뛰기가 합치기 «뒤»에 있으면 이미 다 담긴 뒤다');
});

test('★ 「기업정보 가져오기」는 회사 칸만 채운다', () => {
  const i = B.indexOf("'🏢 기업정보 가져오기'");
  assert.ok(i >= 0, '단추를 못 찾았다');
  const near = B.slice(Math.max(0, i - 700), i);
  assert.ok(near.indexOf('applyCoGroup(g, { people:false })') >= 0, '아직 담당자를 통째로 담는다');
});

test('★ 「담당자 골라 담기」는 하나씩 고르는 창을 연다', () => {
  const i = B.indexOf("'👤 담당자 골라 담기'");
  assert.ok(i >= 0, '단추를 못 찾았다');
  const near = B.slice(Math.max(0, i - 700), i);
  assert.ok(near.indexOf('setPcMultiOpen(true)') >= 0, '하나씩 고르는 창을 안 연다');
  assert.ok(near.indexOf('applyCoGroup(g, { people:false })') >= 0, '창을 열기 전에 이미 다 담는다');
  assert.ok(near.indexOf("setPcCoPick('people')") < 0, '통째로 담는 옛 길이 남아 있다');
});

test('고르는 창은 «아무도 안 골라진 채»로 열린다', () => {
  const fn = bare(cutBlock(SRC, 'function PucardsContactMultiPickerModal(props){'));
  assert.ok(/var ss = useState\(\{\}\)/.test(fn), '처음부터 누군가 골라져 있으면 안 된다');
});

/* ─────────── ③ 세금계산서 ─────────── */
test('★ 세금계산서 목록이 «처음 열 때의 사진»에 얼지 않는다', () => {
  /* ⚠ 파일 곳곳에 같은 줄이 있다 — «이 화면 안»만 본다.
     그리고 「옛 문장이 없다」로 겨누면 이름만 바꿔도 통과한다.
     지켜야 할 규칙은 «목록을 화면 상태에서 꺼내지 않는다» 이다. */
  const fn = bare(cutBlock(SRC, 'function FinanceInvoice(){'));
  assert.ok(/var invoices = dbGet\('finance_invoice', \[\]\);/.test(fn),
    '그릴 때마다 저장소를 다시 읽어야 한다');
  assert.ok(!/var invoices = [A-Za-z_$][\w$]*\[0\]/.test(fn),
    '아직 얼어붙는 화면 상태에서 목록을 꺼낸다');
  assert.ok(!/useState\([A-Za-z_$][\w$]*\)[^\n]*var invoices/.test(fn),
    '목록을 useState 로 얼려 두었다');
});

test('★ 저장·동기화가 오면 다시 그린다', () => {
  const fn = bare(cutBlock(SRC, 'function FinanceInvoice(){'));
  ['pureun-saved', 'fb_data_changed', 'fb_initial_done'].forEach((ev) => {
    assert.ok(fn.indexOf("addEventListener('" + ev + "'") >= 0, ev + ' 를 안 듣는다');
    assert.ok(fn.indexOf("removeEventListener('" + ev + "'") >= 0, ev + ' 를 안 놓아 준다(샌다)');
  });
});

test('★ 남의 열쇠 저장에는 다시 그리지 않는다 (수천 줄이 매번 다시 그려지면 안 된다)', () => {
  const fn = bare(cutBlock(SRC, 'function FinanceInvoice(){'));
  assert.ok(/k !== 'finance_invoice'\)\s*return/.test(fn), '내 열쇠인지 안 가린다');
});

test('★ 저장은 화면 상태가 아니라 저장소를 거친다', () => {
  const fn = bare(cutBlock(SRC, 'function FinanceInvoice(){'));
  const i = fn.indexOf('function persist(arr){');
  assert.ok(i >= 0, 'persist 를 못 찾았다');
  const line = fn.slice(i, fn.indexOf('\n', i));
  assert.ok(line.indexOf("dbSet('finance_invoice', arr)") >= 0, '저장을 안 한다');
  assert.ok(line.indexOf('setInvoices(') < 0, '아직 얼어붙는 화면 상태를 쓴다');
});

test('★ 홈택스로 올린 것이 «이 컴퓨터에만» 있다고 화면이 밝힌다', () => {
  assert.ok(SRC.indexOf('«이 컴퓨터에만» 남습니다') >= 0,
    '어디에 담기는지 안 밝히면 다른 PC에서 안 보이는 까닭을 알 길이 없다');
});

test('홈택스분은 여전히 서버로 올라가지 않는다 (수천 건이 미수금·성과급으로 새면 안 된다)', () => {
  const fn = bare(cutBlock(SRC, 'async function handleInvoiceUpload(e){'));
  assert.ok(fn.indexOf("idbBulkPut('invoice_history'") >= 0, '아카이브에 담는 길이 사라졌다');
  assert.ok(fn.indexOf("dbSet('finance_invoice'") < 0, '홈택스분이 서버로 새고 있다');
});
