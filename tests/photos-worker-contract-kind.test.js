'use strict';
/* 📝 근로계약서(wcontract) 를 «제 갈래»로 (대표 지시 2026-09-02)

   대표 지시의 첫 낱말이 「일반근로자들의 **계약서**」였다.

   ■ 왜 갈래를 갈랐나
   여태 근로자의 근로계약서는 `contract` 로 읽혔다. 그런데 contract 는
   «우리 사무소와 업체가 맺은 약정»(자문·위임·용역)이고, 푸른이알피의
   「사진첩에서 계약서 찾기」가 **kind==='contract' 만 모아** 자문계약 창에 붙인다.
   그대로 두면 그 찾기 목록이 근로계약서로 뒤덮여 쓸 수 없게 된다.

   ■ 무엇을 읽고 무엇은 안 읽나 (대표 보고 2026-09-02)
   읽는다: 이름 · 사업장 · 직위 · 근로 시작일·종료일 · 기간의 정함 · 문서 제목
   안 읽는다: **임금 금액**(급여서류와 같은 규칙 + 「월 100만원」을 1만 배 틀리게
   읽은 전례) · **주민번호·주소·연락처**(근로자 서류 넷과 같은 규칙)

   실행: node --test tests/*.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const R = path.join(__dirname, '..');
const reader = fs.readFileSync(path.join(R, 'js', 'pu-doc-read.js'), 'utf8');
const store = fs.readFileSync(path.join(R, 'js', 'pu-photo-store.js'), 'utf8');
const server = fs.readFileSync(path.join(R, 'functions', 'photo-view.js'), 'utf8');
const docFile = fs.readFileSync(path.join(R, 'js', 'pu-doc-file.js'), 'utf8');
const photos = fs.readFileSync(path.join(R, 'pu-photos.html'), 'utf8');
const cards = fs.readFileSync(path.join(R, 'pu-cards.html'), 'utf8');
const erp = fs.readFileSync(path.join(R, 'pu-erp.html'), 'utf8');

/* ══════ ① 갈래를 알아본다 ══════ */

test('★★ 물음의 «종류 목록»에 근로계약서가 있다 — 없으면 AI 가 고를 수가 없다', () => {
  assert.match(reader, /wcontract\(근로계약서/,
    '★★ 갈래 목록에 없으면 근로계약서가 계속 contract 나 other 로 굳습니다');
  assert.match(reader, /kind=wcontract 이면 키:/,
    '★ 무엇을 읽을지 안 알려 줬습니다');
  assert.match(reader, /var KINDS = \{[^}]*wcontract: 1/,
    '★★ 담기는 갈래에 없으면 AI 가 wcontract 라고 답해도 other 로 굳습니다\n' +
    '  (2026-09-01 에 통장·근로자서류 다섯이 그렇게 조용히 버려졌습니다)');
});

test('★★★ contract 와 «가르는 말»이 있다 — 없으면 자문계약 찾기가 근로계약서로 뒤덮인다', () => {
  const list = /kind 는 다음 중 하나입니다:[\s\S]*?\n/.exec(reader);
  assert.ok(list, '갈래 목록을 못 찾았습니다');
  assert.match(list[0], /근로계약서는 여기가 아니라 wcontract/,
    '★★★ contract 쪽에 「근로계약서는 아니다」를 안 적으면 여전히 그리로 갑니다');
  assert.match(list[0], /wcontract\([^)]*자문·위임·용역계약서는 contract/,
    '★★ wcontract 쪽에도 되짚어 줘야 자문계약서가 이리로 오지 않습니다');
});

test('★★★ 「계약서 찾기」는 여전히 «우리 계약»만 모은다 — 여기가 갈래를 가른 까닭이다', () => {
  const fn = /function erpLoadMyContractPhotos\([\s\S]*?\n\}/.exec(erp);
  assert.ok(fn, 'erpLoadMyContractPhotos 를 못 찾았습니다');
  assert.match(fn[0], /read\.kind === 'contract'/,
    '★★★ 자문계약 찾기가 근로계약서까지 모으면 목록이 쓸 수 없게 됩니다');
  assert.ok(fn[0].indexOf('wcontract') < 0,
    '★★★ 자문계약 찾기에 근로계약서가 섞였습니다 — 갈래를 가른 뜻이 없어집니다');
});

/* ══════ ② 담지 않는 것 ══════ */

test('★★★ 임금 금액을 «안 담는다» — 급여서류와 같은 규칙이다', () => {
  const i = reader.indexOf('kind=wcontract 이면 키:');
  const seg = reader.slice(i, i + 700);
  ['임금', '시급', '연봉', 'wage', 'salary', 'pay'].forEach(function (w) {
    if (w === '임금' || w === '시급' || w === '연봉') return;   // 「담지 마세요」 문장에 나온다
    assert.ok(seg.indexOf(w) < 0,
      '★★★ 키 목록에 「' + w + '」이 들어갔습니다 — 계약서 금액은 1만 배 틀리게 읽힌 전례가 있습니다\n' +
      '  (pu-erp.html 의 erpContractPhotoApplyPatch: 「월 100만원」→1,000원)');
  });
  assert.match(reader, /kind=wcontract 에서 \*\*임금·시급·연봉 금액과 주민등록번호·주소·연락처는 한 글자도 담지 마세요/,
    '★★★ 못박아 두지 않으면 pairs 로 딸려 나옵니다');
});

test('★★★ 주민번호·주소·연락처를 «안 담는다» — 근로계약서에는 실제로 다 적혀 있다', () => {
  const i = reader.indexOf('kind=wcontract 이면 키:');
  const line = reader.slice(i, reader.indexOf('\n', i));
  ['rrn', '주민', 'address', '주소', 'phone', '연락처'].forEach(function (k) {
    assert.ok(line.indexOf(k) < 0,
      '★★★ 키 목록에 「' + k + '」이 있습니다 — 담기는 순간 사진 목록에 실려\n' +
      '  화면을 열 때마다 통째로 내려갑니다(근로자 서류 넷과 같은 규칙)');
  });
  assert.ok(line.indexOf('pairs') < 0,
    '★★★ pairs 는 「문서의 모든 칸」이라 넣는 순간 주민번호가 딸려 옵니다');
});

test('★ 읽어야 할 것은 읽는다 — 누구의·언제부터의 계약인가', () => {
  const i = reader.indexOf('kind=wcontract 이면 키:');
  const line = reader.slice(i, reader.indexOf('\n', i));
  ['name(', 'company(', 'hireDate('].forEach(function (k) {
    assert.ok(line.indexOf(k) > 0,
      '★★ 「' + k + '」을 안 읽으면 이 갈래를 만든 뜻이 없습니다 — 사람에게 못 붙습니다');
  });
});

/* ══════ ③ 민감 ══════ */

test('★★★ 근로계약서는 «민감 서류»다 — 화면과 서버가 같은 목록을 본다', () => {
  const pick = function (s) {
    const m = /SENSITIVE_KINDS = \{([^}]*)\}/.exec(s);
    assert.ok(m, '민감 목록을 못 찾았습니다');
    return m[1].split(',').map(function (x) { return x.split(':')[0].trim(); })
      .filter(Boolean).sort();
  };
  const a = pick(store), b = pick(server);
  assert.ok(a.indexOf('wcontract') >= 0,
    '★★★ 주민번호·주소·임금이 한 장에 있는데 민감이 아닙니다');
  assert.deepEqual(a, b,
    '★★★ 화면과 서버의 민감 목록이 다릅니다 — 화면은 원본 주소를 안 적는데\n' +
    '  서버는 「민감 아니다」로 물러나 그 사진이 아예 안 열립니다.\n' +
    '  고쳤으면 반드시 다시 올리세요: firebase deploy --only functions:photoView');
});

test('★★ 보유기한이 정해져 있다 — 근로기준법이 퇴직 뒤 3년을 시킨다', () => {
  const m = /const KEEP_MONTHS_BY_KIND = \{([\s\S]*?)\};/.exec(photos);
  assert.ok(m, '보유기한 표를 못 찾았습니다');
  /* ⚠ 주석을 «먼저 걷는다». 안 걷으면 「/* wcontract: 60, *​/」처럼 주석 처리해 놓아도
     검사가 통과한다 — 잘 쓴 주석이 검사를 통과시키는 그 함정이다. */
  const body = m[1].replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  assert.match(body, /wcontract:\s*\d+/,
    '★★ 기한이 없으면 「나머지 1년」으로 떨어져 퇴직 3년 보존을 못 채웁니다');
  /* 고치는 칸에도 나와야 한다 — 안 나오면 화면에서 바꿀 길이 없다 */
  assert.match(photos, /const KEEP_EDIT_ORDER = \[[^\]]*'wcontract'/,
    '★ 고치는 칸에 없으면 기한을 화면에서 못 바꿉니다');
});

/* ══════ ④ 사람에게 붙는다 ══════ */

test('★★ 근로계약서는 «사람 것»이다 — 근로자 정보함으로 간다', () => {
  const pick = function (s, name) {
    const m = new RegExp(name + ' = \\{([\\s\\S]*?)\\};').exec(s);
    assert.ok(m, name + ' 를 못 찾았습니다');
    return m[1].split(',').map(function (x) { return x.split(':')[0].trim(); }).filter(Boolean);
  };
  assert.ok(pick(docFile, 'WORKER_DOC_KINDS').indexOf('wcontract') >= 0,
    '★★ 보내는 층이 안 받으면 값이 안 갑니다');
  assert.ok(pick(photos, 'WORKER_KINDS').indexOf('wcontract') >= 0,
    '★★ 사진첩이 안 보내면 단추가 안 뜹니다 — 둘은 짝입니다');
});

test('★★★ 우리 사무소 계약(contract)은 사람에게 «안 붙는다» — 그것은 업체 것이다', () => {
  const m = /WORKER_DOC_KINDS = \{([\s\S]*?)\};/.exec(docFile);
  const keys = m[1].split(',').map(function (x) { return x.split(':')[0].trim(); }).filter(Boolean);
  assert.ok(keys.indexOf('contract') < 0,
    '★★★ 자문계약서가 근로자 정보함으로 갑니다 — 업체 계약이 사람 서류가 됩니다');
});

test('★★ 세 화면이 «같은 이름»으로 부른다 — 갈리면 같은 서류가 화면마다 다른 이름이 된다', () => {
  assert.match(photos, /wcontract: '근로계약서'/, '★★ 사진첩에 이름표가 없으면 「알 수 없음」으로 뜹니다');
  assert.match(cards, /wcontract:'근로계약서'/, '★★ 근로자 정보함에 이름표가 없습니다');
  assert.match(erp, /wcontract:'근로계약서'/, '★★ 푸른이알피 명부 딱지에 이름표가 없습니다');
});

test('★ 사건에서 «받아야 할 서류»에 든다 — 근로계약서 없는 사건은 거의 없다', () => {
  assert.match(erp, /var WK_WANT = \[[^\]]*'wcontract'/,
    '★ 안 들어가면 근로계약서를 안 받은 사람을 아무도 안 짚어 줍니다');
});

/* ══════ ⑤ 굳은 것이 스스로 풀리는가 ══════ */

test('★★★ 물음 판을 올렸다 — 안 올리면 이미 contract 로 굳은 근로계약서가 «영영» 그대로다', () => {
  const pv = Number((/var PROMPT_VERSION = (\d+);/.exec(reader) || [])[1]);
  assert.ok(pv >= 14,
    '★★★ 갈래를 늘렸으면 물음 판을 올려야 합니다 — 그래야 예전에 contract 로 굳은\n' +
    '  근로계약서가 스스로 다시 읽혀 제자리를 찾습니다(2026-08-06 회의사진 6장과 같은 일)');
  const rv = Number((/var READ_VERSION = (\d+);/.exec(reader) || [])[1]);
  assert.ok(rv >= pv, '★ 판독기 판이 물음 판보다 낮습니다');
});

test('★★ 다시 읽히는 갈래다 — 건너뛰기 목록에 들어가면 굳은 것이 안 풀린다', () => {
  const m = /const RESTALE_SKIP = \{[^\n]*\};/.exec(photos);
  assert.ok(m, 'RESTALE_SKIP 을 못 찾았습니다');
  assert.ok(m[0].indexOf('wcontract') < 0,
    '★★ 건너뛰기에 들어가면 contract 로 굳은 근로계약서가 영영 안 풀립니다');
});

test('★★ 고친 .js 를 부르는 화면의 캐시 번호가 올라 있다 — 안 올리면 고친 것이 통째로 묻힌다', () => {
  /* 값을 못박지 않는다 — 「번호가 붙어 있는가」만 본다(CLAUDE.md 의 검사 규칙) */
  [['pu-photos.html', photos], ['pu-erp.html', erp]].forEach(function (pair) {
    const tags = pair[1].match(/<script src="js\/pu-[a-z-]+\.js[^"]*"/g) || [];
    tags.forEach(function (t) {
      assert.match(t, /\?v=\d+/,
        '★★ ' + pair[0] + ' 의 ' + t + ' 에 캐시 번호가 없습니다 — 브라우저가 옛 파일을 씁니다');
    });
  });
});
