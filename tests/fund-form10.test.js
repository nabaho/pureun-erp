/* 별지 제10호 — 기본재산 총액 변경 내용 보고서
 *
 * 대표 지시 2026-08-24 검토 ③: 서식 33종 중 15종이 손으로였다. 그중 이것부터 —
 * 사업장이 들고 나거나 출연·준비금 설정이 있을 때마다 노동청에 내는 것이라 가장 자주 걸린다.
 *
 * 원본: 00_표준서식/01_공식법정서식_현행/…별지제10호…개정20210609.hwp (글자를 대조했다)
 * 실제 제출본: 03_과거자료/…/T공동/2019년감사/1. 재산변동상황고서.hwp
 *
 * ⚠ 이 저장소는 통째로 github.io 로 공개된다 — 실제 기금명·번호·금액 금지. 여기 자료는 전부 가짜다.
 *
 * 지켜야 하는 것
 *  ① 별지15호와 «같은 목록»을 본다 — 따로 세면 두 서류의 기본재산이 어긋난다
 *  ② 변경일 칸이 하나뿐인 서식이다 — 날짜가 곧 서류 한 장이다
 *  ③ 읽어 둔 숫자가 «어느 기금·어느 해» 것인지 확인하고 쓴다 — 남의 금액을 내면 안 된다
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'fund.html'), 'utf8');

function grabFn(name) {
  const i = SRC.indexOf('function ' + name + '(');
  assert.ok(i >= 0, 'fund.html 에 함수가 없다: ' + name);
  let d = 0, on = false;
  for (let j = i; j < SRC.length; j++) {
    if (SRC[j] === '{') { d++; on = true; }
    else if (SRC[j] === '}') { d--; if (on && !d) return SRC.slice(i, j + 1); }
  }
  throw new Error('함수 끝을 못 찾음: ' + name);
}
function grabDecl(name) {
  const i = SRC.indexOf('var ' + name + '=');
  assert.ok(i >= 0, 'fund.html 에 상수가 없다: ' + name);
  let d = 0, on = false;
  for (let j = SRC.indexOf('=', i); j < SRC.length; j++) {
    const c = SRC[j];
    if (c === '{' || c === '[') { d++; on = true; }
    else if (c === '}' || c === ']') { d--; if (on && !d) return SRC.slice(i, j + 1) + ';'; }
  }
  throw new Error('상수 끝을 못 찾음: ' + name);
}

/* ══ 순수 계산 — 변동 목록 → 날짜별 장 ══ */
function calc() {
  const box = {};
  new Function([
    grabDecl('BF_KINDS'), grabFn('num'), grabFn('esc'), grabFn('guessBfKind'),
    grabFn('bfMovesOf'), grabFn('bfDays'), grabFn('bfReason'), grabFn('_dotDate'),
    'this.o={bfMovesOf:bfMovesOf,bfDays:bfDays,bfReason:bfReason,_dotDate:_dotDate};'
  ].join('\n')).call(box);
  return box.o;
}

/* 기본재산이 «대변»이면 증가, «차변»이면 감소(=사용) — guessBfKind 와 같은 규칙 */
const IN = (id, date, amount, memo) => ({ id, date, amount, memo: memo || '', debit: '현금성자산', credit: '기본재산' });
const OUT = (id, date, amount, memo) => ({ id, date, amount, memo: memo || '', debit: '기본재산', credit: '고유목적사업준비금2' });

test('기본재산이 안 걸린 분개는 안 본다', () => {
  const C = calc();
  const jr = [IN('a', '2025-03-02', 1000), { id: 'b', date: '2025-04-01', amount: 50, debit: '복리후생비', credit: '현금성자산' }];
  const mv = C.bfMovesOf(jr, {});
  assert.equal(mv.length, 1, '기본재산과 무관한 거래가 보고서에 들어왔다');
  assert.equal(mv[0].id, 'a');
});

test('날짜순으로 준다 — 뒤섞이면 중간 잔액이 엉뚱해진다', () => {
  const C = calc();
  const mv = C.bfMovesOf([IN('c', '2025-12-31', 300), IN('a', '2025-02-01', 100), IN('b', '2025-07-15', 200)], {});
  assert.deepEqual(mv.map(x => x.id), ['a', 'b', 'c']);
});

test('증가·감소를 대차로 가른다', () => {
  const C = calc();
  const mv = C.bfMovesOf([IN('a', '2025-02-01', 100), OUT('b', '2025-03-01', 40)], {});
  assert.equal(mv[0].dir, '증가', '기본재산 «대변» 은 증가다');
  assert.equal(mv[1].dir, '감소', '기본재산 «차변» 은 감소(사용)다');
  assert.equal(mv[1].kind, 'use');
});

test('사람이 고친 구분이 자동 추정을 이긴다', () => {
  const C = calc();
  const mv = C.bfMovesOf([IN('a', '2025-02-01', 100, '아무 적요')], { bf: { a: 'other' } });
  assert.equal(mv[0].kind, 'other', '화면에서 고른 구분이 무시됐다');
});

test('변경 전 → 변경 후가 차례로 쌓인다', () => {
  const C = calc();
  const mv = C.bfMovesOf([IN('a', '2025-02-01', 1000), IN('b', '2025-07-15', 500), OUT('c', '2025-12-31', 200)], {});
  const days = C.bfDays(3000, mv);
  assert.equal(days.length, 3, '날짜가 셋이면 서류도 세 장이다');
  assert.deepEqual(days.map(d => [d.before, d.after, d.diff]),
    [[3000, 4000, 1000], [4000, 4500, 500], [4500, 4300, -200]]);
});

test('같은 날 여러 건은 한 장에 묶는다 — 변경일 칸이 하나뿐이다', () => {
  const C = calc();
  const mv = C.bfMovesOf([IN('a', '2025-12-31', 1000), IN('b', '2025-12-31', 500), OUT('c', '2025-12-31', 200)], {});
  const days = C.bfDays(0, mv);
  assert.equal(days.length, 1, '같은 날인데 장이 여럿이면 노동청에 같은 날짜 서류가 세 장 간다');
  assert.equal(days[0].items.length, 3);
  assert.equal(days[0].before, 0);
  assert.equal(days[0].after, 1300);
  assert.equal(days[0].diff, 1300, '그날 증감 합계가 변경금액이다');
});

test('변동이 없으면 장도 없다', () => {
  const C = calc();
  assert.deepEqual(C.bfDays(5000, []), [], '변동이 없는데 빈 보고서를 만들면 안 된다');
});

test('변경 사유는 성격별로 묶고 적요를 곁들인다', () => {
  const C = calc();
  const mv = C.bfMovesOf([IN('a', '2025-12-31', 1000, '가나다산업 출연금'),
                          IN('b', '2025-12-31', 500, '라마바물산 출연금'),
                          OUT('c', '2025-12-31', 200, '고유목적사업준비금 설정')], {});
  const r = C.bfReason(C.bfDays(0, mv)[0].items);
  assert.match(r, /사업주 출연 1,500원/, '같은 성격은 합쳐 적어야 한다');
  assert.match(r, /가나다산업 출연금/, '적요가 실제 사유를 가장 잘 말해 준다');
  assert.match(r, /기본재산 사용 200원/);
  assert.ok(!/⑬|⑰/.test(r), '별지15호 칸 번호는 이 서식에 없는 것이다');
});

test('날짜는 법정 서식 관례대로 찍는다', () => {
  const C = calc();
  assert.equal(C._dotDate('2025-12-31'), '2025. 12. 31.');
  assert.equal(C._dotDate('2025-02-05'), '2025. 2. 5.', '앞의 0 은 떼는 것이 서식 관례다');
  assert.equal(C._dotDate(''), '');
});

/* ══ 서식을 «정말 그려» 본다 ══ */
function renderForm(f, bf, year) {
  const box = {};
  new Function('F', 'BF', 'YEAR', [
    grabDecl('BF_KINDS'), grabDecl('A4_W'),
    'var S={formFund:"F1",year:YEAR,_docBf:BF};',
    grabFn('num'), grabFn('esc'), grabFn('dgV'), grabFn('dgWon'), grabFn('dgToday'),
    grabFn('_dotDate'), grabFn('guessBfKind'), grabFn('bfMovesOf'), grabFn('bfDays'), grabFn('bfReason'),
    'function hwpFormHTML(){ return null; }',           // 원본 변환본 없음 — 자동생성 경로를 본다
    'function charterSane(){return "";} function charterGong(){return "";}',
    'function _fyRange(){ return {start:"",end:""}; }',
    'function _officersOf(){ return []; } function _auditorsOf(){ return []; }',
    'function _closeFigures(){ return ""; }',
    grabFn('docBody'),
    'this.html=docBody("ops_asset_change",F,[]);'
  ].join('\n')).call(box, f, bf, year);
  return box.html;
}

const FUND = {
  _id: 'F1', name: '가짜공동근로복지기금', short_name: '가짜 1호', fund_type: '공동',
  inka_no: '0000-2020-0', chairman: '홍길동', address: '○○도 ○○시 ○○로 1',
  phone: '000-000-0000', labor_office: '○○지방고용노동청 ○○지청'
};

function bfOf(open, jr, year) {
  const C = calc();
  return { fid: 'F1', yr: year, open, days: C.bfDays(open, C.bfMovesOf(jr, {})) };
}

test('서식을 그리면 법정 칸이 모두 나온다', () => {
  const html = renderForm(FUND, bfOf(3000000, [IN('a', '2025-12-31', 1000000, '가나다산업 출연금')], 2025), 2025);
  ['별지 제10호서식', '기본재산 총액 변경 내용 보고서', '기금법인 명칭', '기금인가번호',
   '대표자 성명', '직책', '주사무소 소재지', '전화번호', '변경일', '변경 전', '변경 후',
   '변경금액(원)', '변경 사유', '첨부서류', '수수료'].forEach(k =>
    assert.ok(html.includes(k), '법정 서식의 칸이 빠졌다: ' + k));
  assert.match(html, /제35조제2항ㆍ제55조의6/, '근거 조문이 서식과 다르다');
  assert.match(html, /시행규칙 제22조/, '근거 조문이 서식과 다르다');
  assert.ok(html.includes('변경된 내용을 포함하여 작성한 재산목록 1부'), '첨부서류 문구가 서식과 다르다');
});

test('기금 정보와 장부 숫자가 실제로 들어간다', () => {
  const html = renderForm(FUND, bfOf(3000000, [IN('a', '2025-12-31', 1000000, '가나다산업 출연금')], 2025), 2025);
  assert.ok(html.includes('가짜공동근로복지기금'));
  assert.ok(html.includes('0000-2020-0'), '인가번호가 안 들어갔다');
  assert.ok(html.includes('홍길동'));
  assert.ok(html.includes('○○지방고용노동청 ○○지청'), '관할 노동청을 알면서 ○○ 로 둔다');
  assert.ok(html.includes('3,000,000') && html.includes('4,000,000'), '변경 전·후 총액이 안 들어갔다');
  assert.ok(html.includes('2025. 12. 31.'), '변경일이 서식 관례대로 안 찍혔다');
});

test('공동·사내 표시를 골라 준다', () => {
  const gong = renderForm(FUND, bfOf(0, [IN('a', '2025-12-31', 100)], 2025), 2025);
  const sane = renderForm(Object.assign({}, FUND, { fund_type: '사내' }), bfOf(0, [IN('a', '2025-12-31', 100)], 2025), 2025);
  assert.match(gong, /\[&nbsp;&nbsp;\] 사내근로복지기금법인[\s\S]{0,40}\[√\] 공동/, '공동기금인데 표시가 틀렸다');
  assert.match(sane, /\[√\] 사내근로복지기금법인/, '사내기금인데 표시가 틀렸다');
});

test('변경일마다 한 장씩 — 감소는 △ 로 적는다', () => {
  const jr = [IN('a', '2025-02-01', 1000000), OUT('b', '2025-12-31', 400000, '고유목적사업준비금 설정')];
  const html = renderForm(FUND, bfOf(0, jr, 2025), 2025);
  assert.equal((html.match(/class='a4'/g) || []).length, 2, '날짜가 둘이면 장도 둘이어야 한다');
  assert.ok(html.includes('△ 400,000'), '감소를 양수로 적으면 늘어난 것처럼 읽힌다');
  assert.match(html, /변동 <b>2건<\/b>/, '몇 장인지 첫 장에 안 알려 준다');
});

test('변동이 없으면 「낼 것이 없다」고 말한다 — 빈 서식으로 속이지 않는다', () => {
  const html = renderForm(FUND, bfOf(5000000, [], 2025), 2025);
  assert.match(html, /기본재산 변동이 없습니다/, '변동이 없는데 채워진 서식을 내밀면 안 된다');
  assert.ok(html.includes('5,000,000'), '지금 총액은 알려 줘야 한다');
  assert.equal((html.match(/class='a4'/g) || []).length, 1);
});

/* 여기가 이 서식에서 가장 위험한 자리다 — 남의 기금 금액을 노동청에 내게 된다 */
test('읽어 둔 숫자가 다른 기금·다른 해 것이면 쓰지 않는다', () => {
  const other = bfOf(9999999, [IN('a', '2024-12-31', 8888888)], 2024);
  const html = renderForm(FUND, other, 2025);          // 화면은 2025년인데 읽어 둔 것은 2024년
  assert.ok(!html.includes('8,888,888'), '지난해 금액이 올해 보고서에 찍혔다');
  assert.ok(!html.includes('9,999,999'), '지난해 총액이 올해 보고서에 찍혔다');
  assert.match(html, /아직 못 읽었습니다/, '못 읽었으면 못 읽었다고 해야 한다');

  const alien = Object.assign(bfOf(7777777, [IN('a', '2025-12-31', 6666666)], 2025), { fid: 'F9' });
  const html2 = renderForm(FUND, alien, 2025);          // 다른 기금의 숫자
  assert.ok(!html2.includes('6,666,666'), '남의 기금 금액이 이 기금 보고서에 찍혔다');
});

test('서식 화면이 장부를 읽어 오는 길이 걸려 있다', () => {
  const ex = grabFn('_docExtra');
  assert.ok(ex.includes('DOC_NEEDS_LEDGER[kind]'), '어느 서식이 장부를 읽어야 하는지 목록으로 가려야 한다');
  assert.ok(SRC.includes('var DOC_NEEDS_LEDGER={ops_asset_change:1'), '별지10호가 그 목록에서 빠졌다');
  assert.match(ex, /txns\/'\+fid\+'\/'\+yr/, '그 해 거래를 안 읽으면 채울 숫자가 없다');
  assert.match(ex, /bfDays\(open,bfMovesOf\(journalOf/, '별지15호와 같은 목록을 써야 한다');
  assert.match(ex, /S\._docBf=\{fid:fid,yr:yr/, '어느 기금·어느 해인지 안 적으면 남의 숫자를 쓴다');
  assert.match(ex, /S\._docBf=null/, '서식을 바꿀 때 지난 값을 안 비우면 그대로 남는다');
  assert.match(grabFn('_loadDocInto'), /_docExtra\(kind,f\)/, '읽어 오는 길이 로더에 안 걸렸다');
});

test('별지15호와 같은 목록을 본다 — 따로 세지 않는다', () => {
  const b15 = grabFn('buildF15');
  assert.match(b15, /var bfList=bfMovesOf\(jr,rep\)/,
    '별지15호가 목록을 따로 만들고 있다 — 두 서류의 기본재산이 어긋난다');
  assert.ok(!/bfList\.push\(/.test(b15), '별지15호가 아직 제 목록을 쌓고 있다');
});

test('서식 목록에 등록돼 있어 준비 현황에도 잡힌다', () => {
  assert.match(SRC, /\['ops_asset_change','재산변동상황보고서/, '서식 목록에서 이름이 바뀌었다');
  assert.match(SRC, /kind==='ops_asset_change'/, '자동 생성 갈래가 없다');
});
