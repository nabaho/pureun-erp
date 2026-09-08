'use strict';
/* 급여담당자 연락처 엑셀 → 업체관리 (대표 결정 2026-08-24) — 실행: node --test tests/*.test.js

   대표가 담당자별 엑셀 3개를 주셨다. 한 줄은
     사업장명 │ 담당자성명 │ 담당자연락처 │ 이메일주소 │ 세무대리인명 │ 세무담당자연락처 │ 세무 이메일주소

   대표 결정 넷:
     ① 업체관리에 없는 곳은 **본 업체의 담당자로 붙인다**
     ② 유형이 급여가 아닌 곳은 **유형을 급여로 바꾼다**
     ③ 이메일 빈 줄은 이름 앞머리가 같으면 **위 줄과 같은 사람으로 본다**
     ④ 세무 이메일은 담당 직원 칸으로 — 다만 **담당이 한 사람일 때만**
        (cpabong@naver.com 이 세 사람에 걸쳐 있는 것을 확인하고 좁혔다) */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const X = require(path.join(__dirname, '..', 'js', 'pu-co-xls.js')) || global.PuCoXls;
const P = X && X.plan ? X : global.PuCoXls;

/* ══════ 이름 다듬기 ══════ */

test('★ ㈜ · (주) · 주식회사는 같은 곳으로 본다 — 표기만 다르다', () => {
  const a = P.normName('㈜경보엔지니어링');
  assert.equal(P.normName('(주)경보엔지니어링'), a);
  assert.equal(P.normName('주식회사 경보엔지니어링'), a);
  assert.equal(P.normName('  경보 엔지니어링 '), a);
});

test('★ 괄호 안 지점말은 지우지 않는다 — 모종점과 배방점은 다른 사업장이다', () => {
  assert.notEqual(P.normName('늘봄반찬(모종점)'), P.normName('늘봄반찬(배방점)'));
});

test('앞머리는 괄호 앞까지 — 딸린 사업장의 본 업체를 찾는 데 쓴다', () => {
  assert.equal(P.stemName('와이앤케이(안산-늘푸른요양센터)'), P.normName('와이앤케이'));
  assert.equal(P.stemName('㈜유원에프앤비(롤링파스타)'), P.normName('유원에프앤비'));
});

test('★ 파일 이름에서 담당자를 읽는다 — 시트 안에는 담당자가 없다', () => {
  assert.equal(P.staffFromFileName('급여담당자연락처 및 이메일주소_주민정.xlsx'), '주민정');
  assert.equal(P.staffFromFileName('급여담당자연락처 및 이메일주소_신욱임.xlsx'), '신욱임');
  assert.equal(P.staffFromFileName('아무거나.xlsx'), '', '사람 이름이 없으면 빈칸이어야 합니다');
});

/* ══════ 시트 읽기 ══════ */

const GRID = [
  ['', '사업장명', '담당자성명', '담당자연락처', '이메일주소', '세무대리인명', '세무담당자연락처', '세무 이메일주소'],
  [1, '가람떡집', '나은석', '010-1200-0008', 'a@naver.com', '세화회계법인', '041-553-9595', 'tax@hanmail.net'],
  [2, '서브텍', '남유라주임', '041-546-0722', 'b@naver.com', 'x', 'x', 'x'],
  [3, '', '', '', '', '', '', ''],
  [4, '늘봄반찬(모종점)', '정수연', '010-1200-0017', 'c@naver.com', '세무법인 온', '041-547-2100', 'on@naver.com'],
  [5, '늘봄반찬(배방점)', '', '', '', '', '', '']
];

test('★ 머리줄을 「사업장명」으로 찾는다', () => {
  const r = P.parseGrid(GRID);
  assert.equal(r.error, '');
  assert.equal(r.rows.length, 4, '빈 줄은 세지 않습니다');
  assert.equal(r.rows[0].site, '가람떡집');
});

test('★ 세무 열이 담당자 열을 잡아채지 않는다 — 「연락처」·「이메일주소」가 겹친다', () => {
  const r = P.parseGrid(GRID);
  assert.equal(r.rows[0].cMail, 'a@naver.com');
  assert.equal(r.rows[0].tMail, 'tax@hanmail.net', '세무 이메일이 담당자 것과 섞였습니다');
  assert.equal(r.rows[0].cPhone, '010-1200-0008');
  assert.equal(r.rows[0].tPhone, '041-553-9595');
});

test('★ 「x」는 없다는 뜻이다 — 값으로 넣으면 안 된다', () => {
  const r = P.parseGrid(GRID);
  assert.equal(r.rows[1].tName, '');
  assert.equal(r.rows[1].tMail, '');
});

test('머리줄이 없으면 까닭을 말한다', () => {
  const r = P.parseGrid([['가', '나'], ['1', '2']]);
  assert.match(r.error, /사업장명/);
  assert.equal(r.rows.length, 0);
});

/* ══════ 빈칸 물려받기 (대표 결정 ③) ══════ */

test('★ 이름 앞머리가 같으면 위 줄과 같은 사람으로 본다', () => {
  const rows = P.fillDown(P.parseGrid(GRID).rows);
  const 배방 = rows.filter(r => r.site === '늘봄반찬(배방점)')[0];
  assert.equal(배방.cName, '정수연');
  assert.equal(배방.cMail, 'c@naver.com');
  assert.equal(배방.inherited, '늘봄반찬(모종점)', '어디서 물려받았는지 남겨야 합니다');
});

test('★ 이름이 다르면 물려받지 않는다 — 「대건정밀」 뒤의 「세창이엔지」', () => {
  const rows = P.fillDown([
    { site: '대건정밀', cName: '김세훈', cPhone: '010-0000-0000', cMail: 'k@hanmail.net' },
    { site: '주식회사세창이엔지', cName: '', cPhone: '', cMail: '' }
  ]);
  assert.equal(rows[1].cMail, '', '남의 연락처가 붙었습니다');
  assert.equal(rows[1].inherited, undefined);
});

test('물려받은 줄이 또 물려주지 않고 끊기지도 않는다 — 지점이 셋 넷 이어진다', () => {
  const rows = P.fillDown([
    { site: '㈜유원에프앤비', cName: '김나리', cMail: 'u@naver.com' },
    { site: '㈜유원에프앤비(롤링파스타)', cName: '', cMail: '' },
    { site: '㈜유원에프앤비(짚신매운갈비)', cName: '', cMail: '' }
  ]);
  assert.equal(rows[1].cMail, 'u@naver.com');
  assert.equal(rows[2].cMail, 'u@naver.com', '셋째 줄에서 끊겼습니다');
});

/* ══════ 업체관리와 대조 ══════ */

const USERS = [{ sid: 'A-004', name: '주민정' }, { sid: 'A-005', name: '박은비' }];
const COS = [
  { id: 'c1', name: '가람떡집', typeCode: '급여' },
  { id: 'c2', name: '주식회사 가나글로벌아산공장', typeCode: '자문' },
  { id: 'c3', name: '와이앤케이', typeCode: '급여' },
  { id: 'c4', name: '늘봄반찬(모종점)', typeCode: '급여' }
];

test('★ 이름이 맞고 유형도 급여면 그대로 넣는다', () => {
  const it = P.plan([{ who: '주민정', rows: [{ site: '가람떡집', cName: '나은석', cMail: 'a@n.kr' }] }], COS, USERS)[0];
  assert.equal(it.kind, 'ok');
  assert.equal(it.coId, 'c1');
  assert.equal(it.sid, 'A-004', '파일 이름의 사람을 사번으로 바꿔야 합니다');
});

test('★ 유형이 급여가 아니면 「type」 — 지금은 급여데이터함에서 안 보인다', () => {
  const it = P.plan([{ who: '주민정', rows: [{ site: '주식회사 가나글로벌아산공장', cMail: 'h@n.kr' }] }], COS, USERS)[0];
  assert.equal(it.kind, 'type');
  assert.equal(it.wasType, '자문', '무엇이었는지 남겨야 되돌릴 수 있습니다');
});

test('★ 업체관리에 없으면 본 업체에 붙인다 (대표 결정 ①)', () => {
  const it = P.plan([{ who: '주민정', rows: [{ site: '와이앤케이(안산-늘푸른요양센터)', cMail: 'y@n.kr' }] }], COS, USERS)[0];
  assert.equal(it.kind, 'attach');
  assert.equal(it.coId, 'c3');
  assert.equal(it.coName, '와이앤케이');
});

test('★ 본 업체도 없으면 아무것도 안 한다 — 몰래 새 업체를 만들지 않는다', () => {
  const it = P.plan([{ who: '주민정', rows: [{ site: '니쿠미야', cMail: 'n@n.kr' }] }], COS, USERS)[0];
  assert.equal(it.kind, 'none');
  assert.equal(it.coId, '');
});

test('★ 직원명부에 없는 이름이면 그렇다고 표시한다 — 조용히 빈 사번을 쓰면 안 된다', () => {
  const it = P.plan([{ who: '없는사람', rows: [{ site: '가람떡집' }] }], COS, USERS)[0];
  assert.equal(it.noStaff, true);
  assert.equal(it.sid, '');
});

test('★ 같은 업체를 두 직원이 가리키면 주담당을 건드리지 않는다', () => {
  const items = P.plan([
    { who: '주민정', rows: [{ site: '가람떡집', cMail: 'a@n.kr' }] },
    { who: '박은비', rows: [{ site: '가람떡집', cMail: 'b@n.kr' }] }
  ], COS, USERS);
  assert.ok(items.every(i => i.clash === true), '둘 다 표시해야 합니다');
  const w = P.writes(items, COS);
  assert.equal((w[0] || {}).patch.managerMain, undefined, '주담당을 정해 버렸습니다');
});

/* ══════ 세무 이메일 (대표 결정 ④ — 좁힘) ══════ */

test('★ 세무 이메일이 담당 한 사람에만 걸리면 넣는다', () => {
  const items = [
    { who: '신욱임', tMail: 'cust07@daum.net' },
    { who: '신욱임', tMail: 'cust07@daum.net' }
  ];
  assert.equal(P.taxMailSafe(items)['cust07@daum.net'], true);
});

test('★ 여러 담당에 걸린 세무 이메일은 넣지 않는다 — 남의 자료가 엉뚱한 칸에 들어간다', () => {
  const items = [
    { who: '주민정', tMail: 'cpabong@naver.com' },
    { who: '박은비', tMail: 'cpabong@naver.com' },
    { who: '신욱임', tMail: 'cpabong@naver.com' }
  ];
  assert.equal(P.taxMailSafe(items)['cpabong@naver.com'], false);
});

test('★ 여러 담당에 걸린 세무 이메일도 넣는다 — 배달 규칙을 고친 뒤로는 안전하다', () => {
  /* 처음에는 뺐다 — 배달이 「먼저 적힌 업체가 이긴다」여서 남의 칸으로 갔다.
     2026-08-24 에 배달을 고쳤다(제목에서 사업장 찾기 → 담당 한 사람 → 공용 칸).
     ⚠ 넣어 두면 제목에 사업장이 적힌 메일은 곧바로 임자에게 간다.
     검사 tests/mail-shared-sender.test.js 가 그 배달을 못 박는다. */
  const its = [{ kind: 'ok', sid: 'A-004', who: '주민정', tName: '정담회계법인', tMail: 'cpabong@naver.com' }];
  const r = P.patchFor({ id: 'c1', name: '가람떡집', typeCode: '급여' }, its,
    { taxSafe: { 'cpabong@naver.com': false } });
  assert.equal(r.patch.taxEmail, 'cpabong@naver.com');
  assert.equal(r.patch.taxOfficeName, '정담회계법인');
  assert.ok(r.why.some(w => /제목으로 가른다/.test(w)), '어떻게 갈리는지 알려야 합니다');
});

test('한 담당에만 걸린 세무 이메일은 군말 없이 넣는다', () => {
  const its = [{ kind: 'ok', sid: 'A-002', who: '신욱임', tName: '세무법인 삼륭', tMail: 'cust07@daum.net' }];
  const r = P.patchFor({ id: 'c9', name: '평해식품', typeCode: '급여' }, its,
    { taxSafe: { 'cust07@daum.net': true } });
  assert.equal(r.patch.taxEmail, 'cust07@daum.net');
  assert.equal(r.why.some(w => /여러 담당/.test(w)), false);
});

/* ══════ 무엇을 쓸지 ══════ */

test('★ 담당자를 contacts 와 딸림값 셋에 함께 넣는다 — 화면이 딸림값을 읽는다', () => {
  const its = [{ kind: 'ok', sid: 'A-004', who: '주민정', cName: '나은석', cPhone: '010-1', cMail: 'a@n.kr' }];
  const r = P.patchFor({ id: 'c1', name: '가람떡집', typeCode: '급여' }, its, {});
  assert.equal(r.patch.contacts.length, 1);
  assert.equal(r.patch.primaryContactName, '나은석');
  assert.equal(r.patch.primaryContactEmail, 'a@n.kr');
  assert.equal(r.patch.managerMain, 'A-004');
});

test('★ 사람이 손으로 적어 둔 것을 덮지 않는다 — 빈칸만 채운다', () => {
  const co = {
    id: 'c1', name: '가람떡집', typeCode: '급여',
    contacts: [{ name: '나은석', position: '실장', phone: '', email: 'a@n.kr', isPrimary: true }],
    taxOfficeName: '내가 적은 세무사무실'
  };
  const its = [{ kind: 'ok', sid: 'A-004', who: '주민정', cName: '나은석', cPhone: '010-1', cMail: 'a@n.kr', tName: '엑셀 세무사무실' }];
  const r = P.patchFor(co, its, {});
  assert.equal(r.patch.contacts[0].position, '실장', '직책을 지웠습니다');
  assert.equal(r.patch.contacts[0].phone, '010-1', '빈 전화는 채워야 합니다');
  assert.equal(r.patch.taxOfficeName, undefined, '적어 둔 세무사무실을 덮었습니다');
});

test('★ 딸린 사업장에서 온 사람은 어느 사업장인지 적어 둔다', () => {
  const its = [{ kind: 'attach', sid: 'A-004', who: '주민정', site: '와이앤케이(안산-늘푸른요양센터)', cName: '김담당', cMail: 'y@n.kr' }];
  const r = P.patchFor({ id: 'c3', name: '와이앤케이', typeCode: '급여' }, its, {});
  assert.equal(r.patch.contacts[0].position, '와이앤케이(안산-늘푸른요양센터)');
});

test('★ 딸린 사업장 사람을 대표 담당자로 올리지 않는다 — 본 업체의 담당자가 밀린다', () => {
  const co = {
    id: 'c3', name: '와이앤케이', typeCode: '급여',
    contacts: [{ name: '본사담당', email: 'main@n.kr', isPrimary: true }],
    primaryContactName: '본사담당'
  };
  const its = [{ kind: 'attach', sid: 'A-004', who: '주민정', site: '와이앤케이(지점)', cName: '지점담당', cMail: 'br@n.kr' }];
  const r = P.patchFor(co, its, {});
  assert.equal(r.patch.primaryContactName, '본사담당');
});

test('★ 유형을 급여로 바꾸고, 무엇을 했는지 남긴다 (대표 결정 ②)', () => {
  const its = [{ kind: 'type', wasType: '자문', sid: 'A-004', who: '주민정', cMail: 'h@n.kr' }];
  const r = P.patchFor({ id: 'c2', name: '가나글로벌아산공장', typeCode: '자문' }, its, {});
  assert.equal(r.patch.typeCode, '급여');
  assert.ok(r.why.some(w => /유형/.test(w)));
});

test('바뀌는 것이 없으면 쓰지 않는다 — 헛것을 쓰면 몇 곳이 달라졌는지 셀 수 없다', () => {
  const co = {
    id: 'c1', name: '가람떡집', typeCode: '급여', managerMain: 'A-004',
    contacts: [{ name: '나은석', phone: '010-1', email: 'a@n.kr', isPrimary: true, position: '' }],
    primaryContactName: '나은석', primaryContactPhone: '010-1', primaryContactEmail: 'a@n.kr'
  };
  const its = [{ kind: 'ok', sid: 'A-004', who: '주민정', cName: '나은석', cPhone: '010-1', cMail: 'a@n.kr' }];
  assert.equal(P.patchFor(co, its, {}).changed, false);
  assert.equal(P.writes(its.map(i => Object.assign({ coId: 'c1' }, i)), [co]).length, 0);
});

test('★ 「건너뛴다」로 표시한 줄은 쓰지 않는다', () => {
  const its = [{ coId: 'c1', kind: 'ok', sid: 'A-004', who: '주민정', cMail: 'a@n.kr', skip: true }];
  assert.equal(P.writes(its, COS).length, 0);
});

test('셈이 갈래별로 맞는다', () => {
  const items = P.plan([{ who: '주민정', rows: [
    { site: '가람떡집', cMail: 'a@n.kr' },
    { site: '주식회사 가나글로벌아산공장', cMail: 'h@n.kr' },
    { site: '와이앤케이(지점)', cMail: 'y@n.kr' },
    { site: '니쿠미야', cMail: 'n@n.kr' }
  ] }], COS, USERS);
  const c = P.counts(items);
  assert.equal(c.all, 4);
  assert.equal(c.ok, 1); assert.equal(c.type, 1);
  assert.equal(c.attach, 1); assert.equal(c.none, 1);
});

/* ══════ 미리보기에서 잡은 것들 (진짜 엑셀 97줄을 돌려 봤다) ══════ */

test('★ 같은 사람이 두 줄로 들어가지 않는다 — 이미 있던 줄에 메일이 없을 때 그랬다', () => {
  /* 대건정밀: 업체관리에 「김세훈 대표」가 전화만 있고 메일이 없었다.
     메일로만 견주니 엑셀의 김세훈이 딴 사람으로 붙었다. */
  const co = {
    id: 'c1', name: '대건정밀', typeCode: '급여',
    contacts: [{ name: '김세훈 대표', phone: '010-1200-0014', email: '', isPrimary: true }]
  };
  const its = [{ kind: 'ok', sid: 'A-005', who: '박은비', cName: '김세훈 대표',
    cPhone: '010-1200-0014', cMail: 'cust02@hanmail.net' }];
  const r = P.patchFor(co, its, {});
  assert.equal(r.patch.contacts.length, 1, '같은 사람이 두 줄이 됐습니다');
  assert.equal(r.patch.contacts[0].email, 'cust02@hanmail.net', '빈 메일을 채워야 합니다');
  assert.equal(r.patch.primaryContactEmail, 'cust02@hanmail.net');
});

test('★ 이름만 적힌 자리표가 대표 담당자 자리를 지키지 않는다', () => {
  /* 늘봄반찬: 업체관리의 대표 담당자가 「급여 담당자」(자리표, 메일 없음)였다.
     정작 메일 있는 「정수연」이 아래로 밀려 화면에 안 보였다. */
  const co = {
    id: 'c4', name: '늘봄반찬(모종점)', typeCode: '급여',
    contacts: [{ name: '급여 담당자', phone: '010-1200-0017', email: '', isPrimary: true }],
    primaryContactName: '급여 담당자'
  };
  const its = [{ kind: 'ok', sid: 'A-005', who: '박은비', cName: '정수연 담당자',
    cPhone: '010-1200-0017', cMail: 'cust17@naver.com' }];
  const r = P.patchFor(co, its, {});
  assert.equal(r.patch.primaryContactName, '정수연 담당자');
  assert.equal(r.patch.primaryContactEmail, 'cust17@naver.com');
  assert.equal(r.patch.contacts.filter(c => c.isPrimary).length, 1, '대표가 둘이 됐습니다');
});

test('★ 메일이 있는 대표 담당자는 밀어내지 않는다 — 자리표만 비켜 준다', () => {
  const co = {
    id: 'c1', name: '가람떡집', typeCode: '급여',
    contacts: [{ name: '진짜대표', phone: '', email: 'real@n.kr', isPrimary: true }],
    primaryContactName: '진짜대표', primaryContactEmail: 'real@n.kr'
  };
  const its = [{ kind: 'ok', sid: 'A-004', who: '주민정', cName: '새사람', cMail: 'new@n.kr' }];
  const r = P.patchFor(co, its, {});
  assert.equal(r.patch.primaryContactName, '진짜대표', '멀쩡한 대표를 밀어냈습니다');
  assert.equal(r.patch.contacts.length, 2, '새 사람은 아래에 붙어야 합니다');
});

test('★ 남의 담당을 가져올 때 지금 누구인지 남긴다 — 화면에 「지금 ○○○ →」로 보여야 한다', () => {
  const cos = [{ id: 'c1', name: '가람떡집', typeCode: '급여', managerMain: 'A-009' }];
  const items = P.plan([{ who: '주민정', rows: [{ site: '가람떡집', cMail: 'a@n.kr' }] }], cos, USERS);
  assert.equal(items[0].wasSid, 'A-009', '지금 담당이 누구였는지 없습니다');
  const w = P.writes(items, cos);
  assert.equal(w[0].patch.managerMain, 'A-004');
  assert.equal(w[0].ownerFrom, 'A-009', '바꾸기 전 사람을 알려야 합니다');
  assert.ok(w[0].why.some(x => /바꿈/.test(x)));
});

test('주담당이 비어 있던 곳은 「바꿈」이 아니라 「넣음」이다', () => {
  const cos = [{ id: 'c1', name: '가람떡집', typeCode: '급여', managerMain: '' }];
  const items = P.plan([{ who: '주민정', rows: [{ site: '가람떡집', cMail: 'a@n.kr' }] }], cos, USERS);
  const w = P.writes(items, cos);
  assert.equal(w[0].ownerFrom, '');
  assert.ok(w[0].why.some(x => /넣음/.test(x)));
});


/* ══════ 화면 배선 (pu-erp.html) ══════

   ⚠ 바로 쓰지 않는다. 주담당이 바뀌는 곳이 있어(남의 담당을 가져오는 일)
   무엇이 달라지는지 보이고 대표가 눌러야 쓴다. 검사가 그 순서를 못 박는다. */

const fs2 = require('node:fs');
const ERP = fs2.readFileSync(path.join(__dirname, '..', 'pu-erp.html'), 'utf8');

test('★ 업체관리에 「급여담당자 엑셀」 단추가 있다', () => {
  assert.match(ERP, /급여담당자 엑셀/);
  assert.match(ERP, /importPayContactXlsx/);
  assert.match(ERP, /multiple:\s*true/, '파일 여러 개를 한꺼번에 골라야 합니다');
});

test('★ 사무대행 칸이 아닐 때 보인다 — 급여 업체는 그 칸에 없다', () => {
  /* 단추 자리에서 거슬러 올라가 조건을 본다 — 꾸밈글이 길어 넉넉히 잡는다 */
  const i = ERP.indexOf('importPayContactXlsx, style');
  assert.ok(i > 0, '단추의 파일 칸을 찾을 수 없습니다');
  const near = ERP.slice(Math.max(0, i - 2000), i);
  assert.match(near, /statusTab !== 'suboffice'/);
});

test('★ 파일을 놓아도 바로 쓰지 않는다 — 미리보기를 띄운다', () => {
  const m = ERP.match(/function importPayContactXlsx\(e\)[\s\S]*?\n  \}/);
  assert.ok(m, 'importPayContactXlsx 를 찾을 수 없습니다');
  assert.match(m[0], /setPcxPlan\(/, '미리보기를 안 띄웁니다');
  assert.equal(/coUpsertMany/.test(m[0]), false, '보여 주기 전에 써 버립니다');
});

test('★ 「넣기」를 눌렀을 때만 쓴다', () => {
  const m = ERP.match(/function applyPayContacts\(\)[\s\S]*?\n  \}/);
  assert.ok(m, 'applyPayContacts 를 찾을 수 없습니다');
  assert.match(m[0], /coUpsertMany/);
  assert.match(m[0], /taxSafe/, '세무 이메일 안전 규칙을 넘겨야 합니다');
  assert.match(m[0], /skip/, '건너뛴다고 한 줄을 빼야 합니다');
});

test('★ 미리보기가 주담당이 바뀌는 곳을 이름 대고 알린다', () => {
  assert.match(ERP, /주담당이 바뀌는 곳/);
  assert.match(ERP, /ownerFrom/, '바뀌기 전 사람을 읽어야 합니다');
});

test('★ 붙일 곳 없는 것은 새 업체를 만들지 않는다고 적는다', () => {
  assert.match(ERP, /몰래 새 업체를 만들지 않습니다/);
});

test('★ 여러 담당에 걸린 세무 이메일은 화면에 「제목으로 가름」이라 보인다', () => {
  assert.match(ERP, /여러 담당 — 제목으로 가름/);
});

test('★ 화면이 이 파일을 불러 쓴다 — 캐시 번호가 붙어 있다', () => {
  assert.match(ERP, /js\/pu-co-xls\.js\?v=\d+/, '?v= 가 없으면 고쳐도 배포에 안 실립니다');
});

