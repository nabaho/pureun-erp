'use strict';
/* 급여담당자 엑셀 → 기업정보함 명함 — 대표 2026-08-30
     「급여담당자 종이명함 없는 경우도 많다. 그래서 기업정보함에 별도로 넣어야 한다」

   찍어서 들어올 길이 없는 분들이라 엑셀이 «유일한 입구»다.

   ★ 이 검사가 지키는 것 — 「길을 새로 내지 않는다」
     ① 읽기는 js/pu-co-xls.js 하나 (업체관리가 같은 파일을 읽을 때 쓰는 그것)
     ② 넣기는 previewImport 하나 (중복막이·미리보기가 이미 거기 있다)
     ③ saveEditor 를 거치지 않는다 — 그 길은 새 명함마다 「전임자인가요」를 묻는다

   실행: node --test tests/*.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const R = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(R, p), 'utf8').split('\r\n').join('\n');
const bare = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

const CARDS = read('pu-cards.html');
const ERP = read('pu-erp.html');

/* 읽개를 실제로 돌린다 — 글자만 보면 무엇이 나오는지 모른다 */
const ctx = {};
vm.createContext(ctx);
vm.runInContext(read('js/pu-co-xls.js') + '\nthis.X = this.PuCoXls;', ctx);
const X = ctx.X;

/* ══════ ① 이름과 직책을 가른다 ══════ */

/* ⚠ 글로 견준다. 덩어리(vm) 안에서 만든 객체는 바깥 것과 «다른 종류»라
     deepStrictEqual 이 눈에 똑같은 것을 두고도 다르다고 한다 — 실제로 걸렸다.
     이 저장소의 다른 검사에도 같은 사고가 적혀 있다. */
const nt = (v) => { const r = X.splitNameTitle(v); return r.name + '|' + r.title; };

test('★ 「전광식 대표」·「남유라주임」 을 이름과 직책으로 가른다 — 띄어쓰기가 섞여 있다', () => {
  assert.equal(nt('전광식 대표'), '전광식|대표');
  assert.equal(nt('남유라주임'), '남유라|주임');
  assert.equal(nt('정곤영부장'), '정곤영|부장');
  assert.equal(nt('김안아 과장'), '김안아|과장');
});

test('★ 억지로 자르지 않는다 — 「김 대표」는 이름이 한 글자만 남는다', () => {
  assert.equal(X.splitNameTitle('김 대표').title, '', '★ 성만 남기고 잘랐습니다');
  assert.equal(X.splitNameTitle('나은석').name, '나은석');
  assert.equal(X.splitNameTitle('나은석').title, '');
});

test('긴 직책을 먼저 본다 — 「대표이사」가 「대표」로 잘리면 안 된다', () => {
  assert.equal(nt('홍길동대표이사'), '홍길동|대표이사');
});

test('빈 값에도 안 넘어진다', () => {
  assert.equal(nt(''), '|');
  assert.equal(nt(null), '|');
});

test('★★ 실제 파일에 있는 직책을 빠짐없이 가른다 — 목록에 없으면 통째로 이름이 된다', () => {
  /* 2026-08-30 예행연습에서 「이지해 전무」가 안 갈렸다. 「전무이사」만 있고
     「전무」가 없었던 것이다. 목록에서 빠지면 조용히 이름이 이상해진다. */
  assert.equal(nt('이지해 전무'), '이지해|전무', '★ 「전무」를 모릅니다');
  ['상무', '감사', '고문', '본부장', '사무국장', '주무관'].forEach((t) => {
    assert.equal(nt('홍길동' + t), '홍길동|' + t, '★ 「' + t + '」를 모릅니다');
  });
});

test('★★ 「메일 없음」처럼 «글로 적어 둔 빈칸»을 값으로 넣지 않는다', () => {
  /* 실제 파일에 이메일 칸에 「메일 없음」이라고 적혀 있었다.
     그대로 두면 그 글자가 명함의 메일 주소가 된다. */
  const grid = [
    ['연번', '사업장명', '담당자 성명', '담당자연락처', '이메일주소', '세무대리인명', '세무담당자연락처', '세무담당자 이메일주소'],
    ['1', '천성가축약품', '송향숙 실장', '010-1200-0019', '메일 없음', 'x', '-', '없음'],
  ];
  const r = X.parseGrid(grid).rows[0];
  assert.equal(r.cMail, '', '★ 「메일 없음」이 메일 주소로 들어갑니다');
  assert.equal(r.tName, '', '「x」가 세무사무실 이름으로 들어갑니다');
  assert.equal(r.tPhone, '', '「-」가 전화번호로 들어갑니다');
  assert.equal(r.tMail, '', '「없음」이 메일 주소로 들어갑니다');
});

test('★ 진짜 이름은 안 지운다 — 「없음」이 든 이름도 있을 수 있다', () => {
  const grid = [
    ['연번', '사업장명', '담당자 성명', '담당자연락처', '이메일주소'],
    ['1', '없음상사', '김없음 대표', '010-1111-2222', 'a@x.com'],
  ];
  const r = X.parseGrid(grid).rows[0];
  assert.equal(r.site, '없음상사', '★ 진짜 회사 이름을 지웠습니다');
  assert.equal(r.cName, '김없음 대표', '★ 진짜 사람 이름을 지웠습니다');
});

/* ══════ ② 둘째 담당자를 버리지 않는다 ══════ */

const GRID = [
  ['연번', '사업장명', '담당자 성명', '담당자연락처', '이메일주소', '세무대리인명', '세무담당자연락처', '세무담당자 이메일주소'],
  ['1', '(주)위드유', '김영식 대표', '010-1200-0016', 'a@x.com', '', '', ''],
  ['', '', '김안아 과장', '010-1200-0002', 'b@x.com', '', '', ''],
  ['2', '늘봄반찬(모종점)', '정수연 담당자', '010-1200-0017', 'c@x.com', '세무법인 온', '041-547-2100', 't@x.com'],
  ['3', '늘봄반찬(배방점)', '', '', '', '', '', ''],
];

test('★★ 사업장명이 빈 줄은 «윗줄의 둘째 담당자» — 켜면 살린다', () => {
  const on = X.parseGrid(GRID, { keepSecondContacts: true });
  const names = on.rows.map((r) => r.cName).join(',');
  assert.ok(names.indexOf('김안아 과장') >= 0,
    '★ 둘째 담당자가 버려집니다 — 네 파일에서 5명이 이렇게 사라졌습니다');
  const second = on.rows.find((r) => r.cName === '김안아 과장');
  assert.equal(second.site, '(주)위드유', '★ 윗줄 사업장을 안 물려받았습니다');
  assert.equal(second.second, 1, '둘째 담당자라는 표가 없습니다');
});

test('★ 안 켜면 예전 그대로 — 업체관리 쪽 셈이 달라지면 안 된다', () => {
  const off = X.parseGrid(GRID);
  assert.equal(off.rows.length, 3, '★ 업체관리가 보던 줄 수가 달라졌습니다');
  assert.ok(off.rows.every((r) => !r.cName || r.cName !== '김안아 과장'));
});

/* ══════ ③ 명함 줄로 바꾼다 ══════ */

test('★ 기업정보함 «가져오기»가 쓰는 줄 모양으로 돌려준다', () => {
  const rows = X.cardRows(X.parseGrid(GRID, { keepSecondContacts: true }).rows, '김보람');
  const kim = rows.find((r) => r.name === '김영식');
  assert.ok(kim, '★ 사람을 못 만들었습니다');
  assert.equal(kim.company, '(주)위드유');
  assert.equal(kim.title, '대표');
  assert.equal(kim.mobile, '010-1200-0016', '★ 휴대폰이 mobile 칸에 안 들어갔습니다');
  assert.equal(kim.email, 'a@x.com');
  assert.match(kim.memo, /종이명함 없음/, '★ 왜 사진이 없는지 적혀 있지 않습니다');
  assert.match(kim.memo, /김보람/, '★ 푸른 담당자가 안 적혔습니다 (파일 이름에만 있습니다)');
});

test('★ 집전화는 tel 로, 휴대폰은 mobile 로 — 뒤바뀌면 문자·전화가 엉킨다', () => {
  const rows = X.cardRows([{ site: '서브텍', cName: '남유라주임', cPhone: '041-546-0722', cMail: 'w@x.com' }], '주민정');
  assert.equal(rows[0].tel, '041-546-0722');
  assert.equal(rows[0].mobile, '');
});

test('★★ 담당자 이름이 없는 줄은 명함이 안 된다 — 사업장만 적힌 줄이다', () => {
  const rows = X.cardRows(X.parseGrid(GRID, { keepSecondContacts: true }).rows, '김보람');
  assert.ok(!rows.some((r) => r.company === '늘봄반찬(배방점)'),
    '★ 사람 없는 줄로 빈 명함을 만들었습니다');
});

test('★★ fillDown 을 쓰지 않는다 — 쓰면 같은 사람이 지점 수만큼 생긴다', () => {
  /* 「늘봄반찬(모종점)」의 정수연이 「(배방점)」에도 복사되면 같은 분 명함이 둘이 된다 */
  const rows = X.cardRows(X.fillDown(X.parseGrid(GRID, { keepSecondContacts: true }).rows), '김보람');
  const 정 = rows.filter((r) => r.name === '정수연');
  assert.equal(정.length, 2, '(전제) fillDown 을 쓰면 둘이 된다');
  const real = X.cardRows(X.parseGrid(GRID, { keepSecondContacts: true }).rows, '김보람');
  assert.equal(real.filter((r) => r.name === '정수연').length, 1,
    '★ 같은 사람이 지점 수만큼 생깁니다 — cardRows 앞에서 fillDown 을 쓰고 있습니다');
});

/* ══════ ④ 길을 새로 내지 않는다 ══════ */

test('★★ 읽기는 «업체관리와 같은» 읽개를 쓴다 — 여기서 따로 읽으면 둘이 갈라진다', () => {
  assert.match(CARDS, /<script src="js\/pu-co-xls\.js\?v=\d+"><\/script>/,
    '★ 읽개를 안 불러옵니다');
  const fn = bare(CARDS.slice(CARDS.indexOf('async function onPayXlsFiles'),
    CARDS.indexOf('async function onImportFile')));
  assert.match(fn, /window\.PuCoXls/, '★ 읽개를 안 씁니다');
  assert.ok(!/사업장명|담당자연락처|세무대리인/.test(fn),
    '★ 열 이름을 여기 또 적었습니다 — 같은 엑셀을 두 화면이 다르게 읽게 됩니다');
});

test('★★ 넣기는 previewImport 하나 — 중복막이·미리보기가 거기 있다', () => {
  const fn = bare(CARDS.slice(CARDS.indexOf('async function onPayXlsFiles'),
    CARDS.indexOf('async function onImportFile')));
  assert.match(fn, /previewImport\(/, '★ 미리보기 없이 곧장 넣고 있습니다');
  assert.ok(!/Store\.put\(/.test(fn), '★ 넣는 길을 따로 냈습니다');
  assert.ok(!/saveEditor/.test(fn),
    '★ saveEditor 를 탑니다 — 새 명함마다 「전임자인가요」 창이 뜹니다');
});

test('★ 담당자별 파일을 «한꺼번에» 고를 수 있다 — 네 개를 네 번 고르게 하지 않는다', () => {
  const at = CARDS.indexOf('id="payXlsInput"');
  assert.ok(at > 0, '★ 파일 고르는 자리가 없습니다');
  const tag = CARDS.slice(at, CARDS.indexOf('>', at));
  assert.match(tag, /multiple/, '★ 한 번에 하나씩만 고를 수 있습니다');
  assert.match(tag, /\.xlsx/, '엑셀을 못 고릅니다');
});

test('★ 메뉴에 들어가 있다 — 만들고 안 걸면 아무도 못 찾는다', () => {
  assert.match(CARDS, /payXlsInput\.click\(\)/, '★ 메뉴에서 부르는 자리가 없습니다');
  assert.match(CARDS, /급여담당자 엑셀/, '★ 메뉴에 이름이 없습니다');
});

/* ══════ ⑤ 캐시 번호 ══════ */

test('★★ 읽개를 고쳤으면 «부르는 쪽 둘 다» 캐시 번호를 올린다', () => {
  /* 안 올리면 브라우저가 옛 파일을 그대로 쓴다 — 고친 것이 통째로 묻힌다 */
  const a = (CARDS.match(/pu-co-xls\.js\?v=(\d+)/) || [])[1];
  const b = (ERP.match(/pu-co-xls\.js\?v=(\d+)/) || [])[1];
  assert.ok(a && b, '★ 캐시 번호가 없습니다');
  assert.equal(a, b, '★ 두 화면이 «다른 판»의 읽개를 부릅니다 (' + a + ' vs ' + b + ')');
  assert.ok(Number(a) >= 3, '★ 읽개를 고쳤는데 캐시 번호가 그대로입니다');
});
