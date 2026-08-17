/* 감사보고서·협의회 회의록 회귀
 *
 * ⚠ 이 저장소는 통째로 github.io 로 공개된다 — 실제 기금명·사람 이름 금지. 여기 자료는 전부 가짜다.
 *
 * 정관이 정한 순서를 서류로 옮긴 것이다:
 *   제16조 — 이사가 결산보고서를 작성하고 **감사의 의견을 첨부**하여 회계연도 종료 후 2개월 이내 협의회 승인
 *   제25조 — 이사는 노·사 각 1~3인, **감사는 노·사 각 1인**
 * 그래서 감사보고서는 감사가 «각자» 한 장씩 쓴다(원본: 참살이 2019년 감사보고서, 표 없는 한 장짜리 서한).
 * 회의록은 근로복지기본법 시행규칙 [별지 제13호서식]이다.
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
  let d = 0;
  for (let j = SRC.indexOf('=', i); j < SRC.length; j++) {
    const c = SRC[j];
    if (c === '{' || c === '[') d++;
    else if (c === '}' || c === ']') { d--; if (!d) return SRC.slice(i, SRC.indexOf(';', j) + 1); }
  }
  throw new Error('상수 끝을 못 찾음: ' + name);
}

const G = {
  esc: (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
  num: (v) => { if (v === '' || v == null) return ''; const n = Number(String(v).replace(/,/g, '')); return isFinite(n) ? n : ''; },
  dgV: (v, n) => (String(v || '').trim() ? G.esc(v) : '＿'.repeat(n || 6)),
  dgToday: () => '2026 년 3 월 10 일',
  dgWon: (v) => (G.num(v) || 0).toLocaleString(),
  hlp: () => '',
  S: { year: 2025, f15Close: null },
  document: { querySelectorAll: () => [] },
};
const preamble = [grabDecl('OFFICER_ROLES'), grabDecl('AUDIT_OP')].join('\n') + '\n'
  + ['_officersOf', '_auditorsOf', '_fyRange', '_auditSheet', '_closeFigures', '_setAuditOp'].map(grabFn).join('\n');
/* docBody 는 서식이 수십 가지라 통째로 쓴다. 원본 .hwp 변환분(hwpFormHTML)과 note 는
   이 시험에서 다룰 대상이 아니므로 떼어 낸다 — 나머지 갈래는 원본 그대로 돈다. */
const body = grabFn('docBody');
const inner = body.slice(body.indexOf('{') + 1, body.lastIndexOf('}'))
  .replace(/var _real=[^;]+;\s*if\(_real\) return _real;/, '')
  .replace(/var note=[^;]+;/, '');
const docBody = new Function('esc', 'num', 'dgV', 'dgToday', 'dgWon', 'hlp', 'S', 'document', 'note',
  preamble + '\nreturn function(kind,f,sites){' + inner + '};')
  (G.esc, G.num, G.dgV, G.dgToday, G.dgWon, G.hlp, G.S, G.document, '');
const helpers = new Function('esc', 'num', 'dgV', 'dgToday', 'dgWon', 'S', 'document',
  preamble + '\nreturn {_officersOf:_officersOf,_auditorsOf:_auditorsOf,_fyRange:_fyRange};')
  (G.esc, G.num, G.dgV, G.dgToday, G.dgWon, G.S, G.document);

const FUND = {
  name: '가나공동근로복지기금', fund_type: '공동', chairman: '갑 대표',
  address: '○○도 ○○시 ○○로 1', inka_date: '2026-04-02',
  fy_start_md: '01-01', fy_end_md: '12-31',
  officers: [
    { role: '이사장', name: '갑 대표' },
    { role: '근로자측 이사', name: '을 이사' },
    { role: '근로자측 감사', name: '병 감사' },
    { role: '사용자측 감사', name: '정 감사' },
  ],
};

test('감사는 노·사로 갈려 읽힌다', () => {
  const a = helpers._auditorsOf(FUND);
  assert.equal(a.length, 2);
  assert.equal(a[0].side, '근로자측');
  assert.equal(a[1].side, '사용자측');
});

test('설립한 해의 회계연도는 인가일부터 — 법인이 없던 기간을 감사할 수 없다', () => {
  G.S.year = 2025;
  assert.equal(helpers._fyRange(FUND).start, '2025. 01. 01.');
  G.S.year = 2026;
  assert.equal(helpers._fyRange(FUND).start, '2026. 04. 02.', '인가일 2026-04-02 부터여야 한다');
  G.S.year = 2025;
});

test('감사보고서는 감사마다 한 장씩 — 두 감사면 두 장', () => {
  const h = docBody('ops_audit', FUND, []);
  assert.equal((h.match(/class='a4'/g) || []).length, 2);
  assert.equal((h.match(/<h1>감사보고서<\/h1>/g) || []).length, 2);
  assert.match(h, /근로자측 감사/);
  assert.match(h, /사용자측 감사/);
  assert.match(h, /병 감사/);
  assert.match(h, /정 감사/);
});

test('각자 쓰므로 「본인은」이다', () => {
  const h = docBody('ops_audit', FUND, []);
  assert.match(h, /본인은/);
  assert.ok(!/본인 등은/.test(h), '함께 서명할 때 쓰는 「본인 등은」이 남으면 안 된다');
});

test('머리말이 첫 장(.a4) 안에 있다 — 밖에 두면 조판이 통째로 버린다', () => {
  /* paginateDoc 은 최상위 .a4 가 하나라도 있으면 그 밖의 마디를 버린다.
     머리말·의견 드롭다운이 .a4 밖으로 새어 나가면 화면에서 조용히 사라진다. */
  const h = docBody('ops_audit', FUND, []);
  assert.ok(h.trimStart().startsWith("<div class='a4'>"), '첫 마디가 .a4 여야 한다');
  assert.ok(h.indexOf("<div class='a4'>") < h.indexOf('_setAuditOp'), '드롭다운이 .a4 밖에 있다');
});

test('감사 의견은 두 갈래이고 기본값은 적정', () => {
  const h = docBody('ops_audit', FUND, []);
  assert.equal((h.match(/_setAuditOp/g) || []).length, 1, '드롭다운은 첫 장에 하나만');
  assert.match(h, /적정하였습니다/);
  assert.equal((h.match(/class='audit-op'/g) || []).length, 2, '두 장이 함께 바뀌어야 한다');
});

test('감사가 없으면 빈 서류 대신 명부를 채우라고 알린다', () => {
  const h = docBody('ops_audit', Object.assign({}, FUND, { officers: [{ role: '이사장', name: '갑 대표' }] }), []);
  assert.match(h, /임원 명부/);
  assert.ok(!/본인은/.test(h), '이름 없는 감사보고서를 내보내면 안 된다');
});

test('회의록은 별지 제13호이고 안건 문구가 정해져 있다', () => {
  const m = docBody('ops_minutes_close', FUND, []);
  assert.match(m, /별지 제13호서식/);
  assert.match(m, /제1호 의안 : 2025년 회계결산 및 감사보고 건/);
  assert.match(m, /정관 제16조/);
});

test('회의록의 위원은 명부에서 노·사로 갈린다', () => {
  const m = docBody('ops_minutes_close', FUND, []);
  assert.match(m, /을 이사/);
  assert.match(m, /병 감사/);
  assert.match(m, /정 감사/);
  assert.match(m, /갑 대표/, '이사장은 사용자위원 쪽에 든다');
});

test('확정 전에는 결산 수치를 넣지 않는다', () => {
  /* 확정 전 숫자를 회의록에 박으면, 뒤에 거래를 고쳤을 때 «승인받은 숫자»와 서류가 달라진다. */
  G.S.f15Close = null;
  const m = docBody('ops_minutes_close', FUND, []);
  assert.match(m, /확정<\/b>하면/);
  assert.ok(!/천원/.test(m));
});

test('확정한 해는 재원·집행·잔액이 자동으로 들어간다', () => {
  G.S.f15Close = { locked: true, fin: { f15_src_total: 51046392, f15_total: 17715440, f15_rest: 33330952 } };
  const m = docBody('ops_minutes_close', FUND, []);
  assert.match(m, /51,046,392/);
  assert.match(m, /33,330,952/);
  assert.match(m, /별지 제13호 서식에는 없는 표/, '서식에 없는 표임을 밝혀야 한다');
  G.S.f15Close = null;
});
