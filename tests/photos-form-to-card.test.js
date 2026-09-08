'use strict';
/* 서식 한 장(사진 두 장)에서 «명함»과 «기업 상세»를 각각 뽑아 넣는다 (대표 지시 2026-08-31)
   ═══════════════════════════════════════════════════════════════════════════
   ■ 대표 지시
     「사진첩에서 하나의 사진으로 합친 것의 정보를 정리해야 한다. 사진은 각각 2장으로
      넣었지만 하나의 회사이다. 이럴 경우 기업정보함에 명함 내용과 기업 상세를
      각각 넣어 정리해라.」
     보기: 「통합 기술보호지원반 신청서」 2쪽 — 1쪽은 회사(기업명·사업자번호·업태·매출액),
     2쪽은 «담당자 정보»(담당자명·이메일·부서·직위·유선·휴대전화).

   ■ 무엇이 문제였나
     ① 서식(form)은 기업정보함으로 «갈 길이 아예 없었다» —
        CARD_KINDS·TO_CARD_KIND 에 form 이 없고, MAP.cards.form 변환표도 없다.
        그래서 2쪽의 담당자 정보가 명함으로 들어오지 못했다.
     ② 실제 화면에서 명함 「홍길동」의 «회사 칸이 비어 있었다».
        회사가 안 붙으면 기업 상세(회사를 사업자번호·상호로 묶는다)와 이어지지 않는다 —
        사람은 사람 따로, 회사는 회사 따로 떠 있는 셈이 된다. 대표가 「각각 넣어
        정리해라」고 한 것이 바로 이 «이어짐»이다.
     ③ 담당자 부서·유선전화는 판독기가 읽지도 않았다(name·title·mobile·email 만).

   ★ 여기서 못 박는 것
     ① 서식도 기업정보함으로 보낼 수 있다
     ② 서식 → 명함 변환표가 있다
     ③★ 명함에 «회사 이름»이 붙는다 — 안 붙으면 기업 상세와 못 잇는다
     ④ 담당자 이름이 없으면 명함을 만들지 않는다 — 빈 명함이 쌓이면 안 된다
     ⑤ 담당자 부서·유선도 읽는다
     ⑥ 회사 정보는 그대로 기업 상세로 간다 — 두 갈래가 «각각»이다
   실행: node --test tests/photos-form-to-card.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const R = p => fs.readFileSync(path.join(__dirname, '..', p), 'utf8').replace(/\r\n/g, '\n');
const read = R('js/pu-doc-read.js');
const file = R('js/pu-doc-file.js');
const photos = R('pu-photos.html');

/* 판독 층을 그대로 불러 쓴다 — 대역을 만들면 진짜와 갈라진다 */
/* ⚠ 이 모듈은 window 가 있으면 «거기»에 붙는다 — ctx.PuDocRead 가 아니라
   ctx.window.PuDocRead 다(파일 끝줄의 typeof window 판정).
   doc-read-whole-document.test.js 가 쓰는 방식 그대로 따른다. */
function loadRead(){
  const vm = require('node:vm');
  const ctx = { window: {}, console: { warn(){} } };
  vm.createContext(ctx);
  vm.runInContext(read, ctx);
  return ctx.window.PuDocRead;
}

/* 대표 화면과 «같은 모양»의 판독 결과 (2쪽이 합쳐진 뒤)
   ⚠ 값은 모두 «가짜»다. 2026-09-08 에 실제 고객 자료(이름·휴대폰·이메일·사업자번호·
     법인등록번호·주소·매출액)를 바꿔 넣었다 — 이 저장소는 공개다(대표 결정 「1」).
     새 붙임자료를 만들 때도 실제 자료를 옮겨 붙이지 말 것. */
const FORM = {
  docName: '통합 기술보호지원반 신청서',
  company: '가나김산업', ceo: '김대표', bizno: '888-88-88888', corpno: '110111-1234567',
  openDate: '2013-04-01', bizType: '제조업', bizItem: '식료품 제조업',
  companyTel: '041-000-0000', address: '30000 충청남도 가나시 나다로 1-2 (다라동)',
  product: '조미김', sales: '1000000000',
  name: '홍길동', title: '상무이사', dept: '관리부',
  tel: '041-000-1111', mobile: '010-1111-2222', email: 'hong@example.kr'
};

/* ══════ ① 갈 길이 있다 ══════ */
test('★ 서식도 기업정보함으로 보낼 수 있다 — 예전에는 길이 아예 없었다', () => {
  assert.match(file, /TO_CARD_KIND = \{[^}]*form/,
    '★ TO_CARD_KIND 에 form 이 없으면 「명함과 사업자등록증만 보낼 수 있습니다」로 막힌다');
  assert.match(photos, /CARD_KINDS = \{[^}]*form/,
    '★ 사진첩 쪽도 막고 있으면 단추가 아예 안 나온다 — 막는 쪽과 보여 주는 쪽이 같아야 한다');
});

/* ══════ ②③ 변환표 · 회사가 붙는다 ══════ */
test('★★ 서식의 담당자가 «회사 이름을 달고» 명함이 된다 — 이것이 대표 지시의 알맹이다', () => {
  const P = loadRead();
  const m = P.mapTo('cards', 'form', FORM);
  assert.equal(m.kind, 'card', '★ 종류가 명함이라야 명함 목록에 들어간다');
  assert.equal(m.name, '홍길동');
  assert.equal(m.company, '가나김산업',
    '★★ 회사가 비면 기업 상세(회사로 묶는다)와 이어지지 않는다 — 사람 따로 회사 따로 뜬다');
});

test('담당자의 연락처가 «사람 것»과 «회사 것»으로 갈려 들어간다', () => {
  const P = loadRead();
  const m = P.mapTo('cards', 'form', FORM);
  assert.equal(m.mobile, '010-1111-2222', '휴대폰은 그 사람 것');
  assert.equal(m.tel, '041-000-1111', '담당자 유선은 직통전화');
  assert.equal(m.companyTel, '041-000-0000', '회사 대표번호는 따로');
  assert.equal(m.email, 'hong@example.kr');
  assert.equal(m.title, '상무이사');
  assert.equal(m.dept, '관리부');
});

test('회사 주소는 «회사 주소» 칸으로 간다 — 개인 주소가 아니다', () => {
  const P = loadRead();
  const m = P.mapTo('cards', 'form', FORM);
  assert.equal(m.companyAddr, FORM.address);
  assert.ok(!m.address, '개인 주소 칸에 회사 주소를 넣으면 안 된다');
});

test('빈 값은 안 싣는다 — 이미 들어 있는 값을 빈 값으로 덮으면 안 된다', () => {
  const P = loadRead();
  const m = P.mapTo('cards', 'form', { name:'홍길동', company:'', email:'   ' });
  assert.ok(!('company' in m));
  assert.ok(!('email' in m));
});

/* ══════ ④ 빈 명함은 안 만든다 ══════ */
/* ⚠ 그냥 함수 이름(formHasContact)을 찾으면 «정의만 있고 안 부르는» 경우도 통과한다 —
   실제로 그 자리를 지워도 이 글자는 남아 있었다. sendToCards 본문이 실제로 그것을
   부르며 막는지를 본다. */
test('★ 담당자 이름이 없으면 명함을 만들지 않는다 — 회사만 있는 빈 명함이 쌓인다', () => {
  const at = file.indexOf('function sendToCards(');
  assert.ok(at >= 0, 'sendToCards 를 찾을 수 없습니다');
  const open = file.indexOf('{', at);
  let d = 0, end = -1;
  for (let k = open; k < file.length; k++) {
    if (file[k] === '{') d++;
    else if (file[k] === '}') { d--; if (!d) { end = k + 1; break; } }
  }
  const body = file.slice(at, end);
  assert.match(body, /kind === 'form'/, '★ 서식일 때만 이름을 따지는 갈림이 없다');
  assert.match(body, /formHasContact\(o\.fields\)/,
    '★ 이름 없이 회사만 실어 보내면 「회사명만 있는 명함」이 서식마다 하나씩 생긴다');
  assert.match(body, /return Promise\.reject/, '가로막지 않으면 그대로 명함이 만들어진다');
});

/* ══════ ⑤ 판독기가 부서·유선을 읽는다 ══════ */
test('★ 담당자 부서·유선전화도 읽는다 — 화면에 있는데 안 읽으면 손으로 옮겨야 한다', () => {
  const line = read.split('\n').find(l => l.includes('kind=form 이면 키'));
  assert.ok(line, '서식 키 목록을 찾을 수 없습니다');
  assert.match(line, /dept\(/, '★ 담당자 부서를 안 읽는다');
  assert.match(line, /tel\(/, '★ 담당자 유선전화를 안 읽는다');
});

/* ══════ ⑥ 회사는 기업 상세로 (두 갈래가 각각) ══════ */
test('★ 회사 정보는 기업 상세로 간다 — 명함과 «각각»이다', () => {
  const m = file.match(/var KEEP = \[[\s\S]*?\];/);
  assert.ok(m, 'KEEP 목록을 찾을 수 없습니다');
  ['company', 'ceo', 'bizType', 'bizItem', 'product', 'sales', 'workers'].forEach(k => {
    assert.match(m[0], new RegExp("'" + k + "'"),
      '기업 상세로 가는 목록에 「' + k + '」 이 없다');
  });
});
