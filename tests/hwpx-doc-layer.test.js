/* 공용 문서 서식층(hwpx_doc.js) — «모양을 못 박는» 검사가 아니라 실제로 돌려서 본다.
   조립기와 서식층을 그대로 불러 문서를 만들고, 나온 XML 이 지켜야 할 성질만 확인한다.
   (호출 모양을 못 박으면 서식을 개선할 때마다 검사가 먼저 막는다 — 실제로 그랬다) */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const root = path.join(__dirname, '..');
const H = require(path.join(root, 'hwpx_gen.js'));
global.HWPX = H;
const D = require(path.join(root, 'hwpx_doc.js'));

/* zip 안의 한 파일을 꺼낸다 — 검사에만 쓰는 아주 작은 읽기 */
function unzip(u8, name) {
  const zlib = require('zlib');
  const buf = Buffer.from(u8);
  for (let i = 0; i + 30 < buf.length; ) {
    if (buf.readUInt32LE(i) !== 0x04034b50) break;
    const method = buf.readUInt16LE(i + 8);
    const csize = buf.readUInt32LE(i + 18);
    const nlen = buf.readUInt16LE(i + 26);
    const elen = buf.readUInt16LE(i + 28);
    const nm = buf.slice(i + 30, i + 30 + nlen).toString('utf8');
    const data = buf.slice(i + 30 + nlen + elen, i + 30 + nlen + elen + csize);
    if (nm === name) return (method === 8 ? zlib.inflateRawSync(data) : data).toString('utf8');
    i += 30 + nlen + elen + csize;
  }
  return null;
}

test('서식층이 조립기와 함께 실제로 불러진다', () => {
  assert.equal(typeof D.begin, 'function');
  assert.equal(typeof D.fromText, 'function');
  assert.equal(typeof D.moneyTable, 'function');
});

test('용지 프리셋마다 본문 폭이 여백과 맞는다', () => {
  for (const k of ['gov', 'rule', 'plain', 'wide']) {
    const m = D.PAGE[k];
    assert.equal(D.bodyWidth(k, false), 59528 - m.left - m.right, k + ' 세로');
    assert.equal(D.bodyWidth(k, true), 84188 - m.left - m.right, k + ' 가로');
  }
});

test('구역이 여럿이면 secCnt 가 그 수와 같다 — 1로 두면 한글이 뒤 구역을 통째로 버린다', () => {
  for (const n of [1, 2, 3, 5]) {
    const secs = [];
    for (let i = 0; i < n; i++) secs.push({ body: H.para('구역 ' + (i + 1)) });
    const head = unzip(H.build(secs), 'Contents/header.xml');
    assert.match(head, new RegExp('secCnt="' + n + '"'), n + '구역');
    // 구역 파일도 그 수만큼 들어 있어야 한다
    for (let i = 0; i < n; i++)
      assert.ok(unzip(H.build(secs), 'Contents/section' + i + '.xml'), 'section' + i);
  }
});

test('묶은 문서는 구역마다 자기 여백을 쓴다 — 별지 서식과 규정 전문은 여백이 다르다', () => {
  const gov = D.begin('gov'), plain = D.begin('plain');
  const u8 = H.build(D.pack([
    { body: H.para('별지'), margin: gov.margin, label: '별지' },
    { body: H.para('규정'), margin: plain.margin, label: '규정' }
  ]));
  const s0 = unzip(u8, 'Contents/section0.xml');
  const s1 = unzip(u8, 'Contents/section1.xml');
  assert.match(s0, new RegExp('left="' + D.PAGE.gov.left + '"'));
  assert.match(s1, new RegExp('left="' + D.PAGE.plain.left + '"'));
});

test('줄글을 옮기면 조·항·호·목이 단계별로 들여쓰이고 제목·날짜·서명이 제자리에 앉는다', () => {
  const doc = D.begin('plain');
  const x = D.fromText([
    '근 로 계 약 서', '',
    '제1조 (계약기간) 기간의 정함 없이 근무한다.',
    '① 수습기간은 3개월로 한다.',
    '1. 수습 중 임금은 통상임금의 90%로 한다.',
    '가. 최저임금 미달은 허용하지 않는다.',
    '', '2026년 8월 1일', '', '사업주 홍길동 (인)'
  ].join('\n'), doc);
  const paras = x.split('<hp:p ').slice(1);
  const textOf = (p) => (p.match(/<hp:t>([\s\S]*?)<\/hp:t>/g) || [])
    .map(t => t.replace(/<\/?hp:t>/g, '')).join('');
  const find = (needle) => paras.find(p => textOf(p).indexOf(needle) >= 0);

  // 표제는 가운데 문단(PP.center)
  assert.match(find('근 로 계 약 서'), new RegExp('paraPrIDRef="' + H.PP.center + '"'));
  // 항·호·목은 앞 공백 칸수가 점점 늘어난다
  const lead = (needle) => (textOf(find(needle)).match(/^ */) || [''])[0].length;
  assert.ok(lead('수습기간은') < lead('수습 중 임금은'), '항 < 호');
  assert.ok(lead('수습 중 임금은') < lead('최저임금 미달'), '호 < 목');
  // 날짜는 가운데, 서명은 오른쪽
  assert.match(find('2026년 8월 1일'), new RegExp('paraPrIDRef="' + H.PP.center + '"'));
  assert.match(find('사업주 홍길동'), new RegExp('paraPrIDRef="' + H.PP.right + '"'));
  // 조 제목은 굵게, 이어지는 본문은 보통 — 한 문단 안에 두 서식이 섞여 있다
  const jo = find('제1조');
  assert.ok(jo.indexOf('charPrIDRef="' + H.CP.f10b + '"') >= 0, '조 제목 굵게');
  assert.ok(jo.indexOf('charPrIDRef="' + H.CP.f10 + '"') >= 0, '본문 보통');
});

test('줄글이 <br> 섞인 HTML 이어도 줄이 살아난다', () => {
  const doc = D.begin('plain');
  const x = D.fromText('확 인 서<br>첫째 줄<br>둘째 줄', doc);
  const texts = (x.match(/<hp:t>([\s\S]*?)<\/hp:t>/g) || [])
    .map(t => t.replace(/<\/?hp:t>/g, '')).filter(s => s.trim());
  assert.deepEqual(texts.map(s => s.trim()), ['확 인 서', '첫째 줄', '둘째 줄']);
  assert.ok(x.indexOf('&lt;br&gt;') < 0, 'HTML 표시가 글자로 남으면 안 된다');
});

test('금액표는 숫자를 오른쪽에 붙이고 합계를 굵게 낸다', () => {
  const doc = D.begin('plain');
  const x = D.moneyTable(['지급', '금액(원)'], [['기본급', 2400000]], ['합계', 2400000], doc);
  // 오른쪽 정렬은 오른쪽 문단서식(PP.right)으로 표현된다
  assert.ok(x.indexOf('paraPrIDRef="' + H.PP.right + '"') >= 0, '금액은 오른쪽 정렬');
  assert.ok(x.indexOf('2,400,000') >= 0, '천 단위 쉼표');
  assert.ok(x.indexOf('charPrIDRef="' + H.CP.f10b + '"') >= 0, '머리·합계는 굵게');
});

test('정보표는 라벨을 제 칸에 두고, 한 쌍만 있는 줄은 값 칸을 끝까지 넓힌다', () => {
  const doc = D.begin('plain');
  const x = D.infoTable([
    ['성명', '김근로', '생년월일', '1990. 5. 6.'],
    ['소재지', '서울특별시 중구 세종대로 110 3층']
  ], doc);
  // 네 칸짜리 줄이 있으니 표는 4열
  assert.match(x, /colCnt="4"/);
  // 한 쌍만 있는 줄은 값 칸이 세 칸을 먹는다
  assert.match(x, /colSpan="3"/);
  // 라벨 칸 폭 합이 본문 폭을 넘지 않는다
  const ws = (x.match(/<hp:cellSz width="(\d+)"/g) || []).slice(0, 4)
    .map(s => +s.match(/\d+/)[0]);
  assert.equal(ws.reduce((a, b) => a + b, 0), doc.width, '한 줄의 열폭 합 = 본문 폭');
});

test('서명란은 이름과 「(서명 또는 인)」을 같은 줄에 둔다', () => {
  const doc = D.begin('plain');
  const x = D.signBlock([['신청인', '홍길동']], doc);
  assert.match(x, /rowCnt="1"/);
  assert.ok(x.indexOf('홍길동') >= 0 && x.indexOf('서명 또는 인') >= 0);
});

test('모든 화면이 서식층을 조립기 다음에 읽는다 — 순서가 뒤바뀌면 서식층이 조립기를 못 찾는다', () => {
  for (const f of ['fund.html', 'pu-erp.html', 'payroll-os.html', 'kcareer.html',
                   'pu-cards.html', 'chwieop.html']) {
    const s = fs.readFileSync(path.join(root, f), 'utf8');
    const gen = s.indexOf('hwpx_gen.js');
    const doc = s.indexOf('hwpx_doc.js');
    assert.ok(gen > 0, f + ' 에 조립기가 없다');
    assert.ok(doc > gen, f + ' 은 서식층을 조립기 뒤에 읽어야 한다');
  }
});

test('서식층을 읽는 화면은 판번호(?v=)를 붙인다 — 안 붙이면 고친 것이 배포에 안 실린다', () => {
  for (const f of ['fund.html', 'pu-erp.html', 'payroll-os.html', 'kcareer.html',
                   'pu-cards.html', 'chwieop.html']) {
    const s = fs.readFileSync(path.join(root, f), 'utf8');
    assert.match(s, /hwpx_doc\.js\?v=\d+/, f);
  }
});
