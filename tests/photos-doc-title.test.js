'use strict';
/* 서류 제목 인식·정렬 (대표 지시 2026-08-15)

   "사업자등록증명 도 제목을 정확하게 인지하게해라. 그리고 모든 서식에 제목을 찾고
    제목에 따라 정렬하는 프로세스로 만들어라. 최초 올라오는 서류라도 제목을 정리하는
    시스템을 구축해달라."

   ⚠ 실사례: 국세청 「사업자등록증명」(가야엔지니어링, 2026-08-10 발급)을 올렸더니
     그냥 「사업자등록증」으로 읽혔다. 둘은 다른 서류인데 화면에는 갈래 이름만
     보여 구분할 길이 없었다.
   ⚠ 갈래(kind)는 일부러 안 나눈다 — 증명원에도 상호·대표자·사업자번호가 똑같이
     들어 있어 업체관리·기업정보함으로 가는 길은 그대로여야 한다. 가르는 것은 제목이다.

   실행: node --test tests/*.test.js
   (이 환경의 node 는 --test 에 디렉터리 인자를 주면 죽는다. 반드시 glob 으로.) */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const R = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(R, 'pu-photos.html'), 'utf8');
const reader = fs.readFileSync(path.join(R, 'js', 'pu-doc-read.js'), 'utf8');

function fnOf(src, name) {
  const m = src.match(new RegExp('function ' + name + '\\([\\s\\S]*?\\n\\}'));
  assert.ok(m, name + ' 를 찾지 못했습니다');
  return m[0];
}

/* 화면 함수를 **그대로 떠와서** 돌린다 — 베낀 코드로 검사하면 뜻이 없다. */
function load(names, over) {
  const ctx = Object.assign({ Set, Object, Array, Number, String, Math, JSON }, over || {});
  vm.createContext(ctx);
  names.forEach(n => vm.runInContext(fnOf(app, n), ctx));
  return ctx;
}

const withTitle = (id, t, upAt) => ({ id, meta: { upAt: upAt || 0, read: { fields: { docName: t } } } });

/* ══════ ① 판독 지시 — 제목을 정확히 ══════ */

test('★ 「사업자등록증명」을 「사업자등록증」으로 줄여 쓰지 말라고 못박는다', () => {
  /* 이 한 줄이 이 기능의 전부다. 모델이 아는 이름으로 끌어당기면
     제목을 뽑아도 늘 「사업자등록증」이 되어 아무 뜻이 없다. */
  assert.match(reader, /사업자등록증명/,
    '★ 증명원을 언급조차 안 하면 모델이 아는 이름(사업자등록증)으로 끌어당깁니다');
  assert.match(reader, /【제목】/, '제목 규칙이 없습니다');
  assert.match(reader, /줄여 쓰거나[\s\S]{0,60}바꾸지 마세요/,
    '이름을 바꾸지 말라는 말이 없습니다');
});

test('★ 제목 규칙이 모든 서류에 걸린다 — 갈래마다 따로 적지 않는다', () => {
  /* 갈래마다 적으면 새 갈래를 늘릴 때 빠뜨린다. 한 곳에서 모두에 걸어야 한다. */
  const i = reader.indexOf('【제목】');
  const j = reader.indexOf('【한글 우선】');
  assert.ok(i > 0 && j > i, '【제목】 규칙이 【한글 우선】 앞에 있어야 합니다');
  const rule = reader.slice(i, j);
  assert.match(rule, /docName/, '어느 칸에 담으라는 말이 없습니다');
  assert.match(rule, /글자 그대로/, '그대로 옮기라는 말이 없습니다');
  assert.match(rule, /지어내지 말고 빈 문자열/,
    '제목이 없을 때 지어내지 말라고 안 했습니다 — 없는 제목을 만들어 냅니다');
});

test('★ 사업자등록증·중소기업확인서에도 제목 칸을 준다', () => {
  /* 예전에는 이 둘에 docName 이 아예 없었다 — 증명원을 가릴 칸이 없었다. */
  const biz = reader.match(/kind=bizreg 이면 키:[^']*/);
  assert.ok(biz, 'bizreg 키 목록을 찾지 못했습니다');
  assert.match(biz[0], /docName/, '★ 사업자등록증에 제목 칸이 없습니다');
  const sme = reader.match(/kind=sme 이면 키:[^']*/);
  assert.ok(sme, 'sme 키 목록을 찾지 못했습니다');
  assert.match(sme[0], /docName/, '중소기업확인서에 제목 칸이 없습니다');
});

test('★ 처음 보는 서류(other)도 제목만은 남긴다', () => {
  /* "최초 올라오는 서류라도 제목을 정리하는 시스템" — 갈래를 못 가려도
     제목이 남아야 나중에 찾고, 제목순에서 새 묶음으로 눈에 띈다. */
  const m = reader.match(/kind=other 이면[^']*/);
  assert.ok(m, 'other 규칙을 찾지 못했습니다');
  assert.match(m[0], /docName/,
    '★ kind 만 담으면 못 가린 서류가 아무 실마리 없이 쌓입니다');
});

test('★ 프롬프트를 고쳤으면 판독 번호를 올려야 한다', () => {
  /* 안 올리면 이미 읽어 둔 사진은 **영원히 다시 안 읽는다** — 제목이 안 생긴다.
     실제로 당했다: meeting·payslip 을 가르치기 전에 읽힌 사진이 other 로 굳었다. */
  const m = reader.match(/var READ_VERSION = (\d+);/);
  assert.ok(m, 'READ_VERSION 을 찾지 못했습니다');
  assert.ok(Number(m[1]) >= 9,
    '★ 제목 규칙을 넣고 번호를 안 올리면 옛 사진에는 제목이 안 생깁니다');
});

/* ⚠ 2026-08-17 다시 겨눔 — 이 검사가 **두 가지를 한 숫자로 묶고** 있었다.
     ① 캐시 깨기: js 를 고치면 ?v= 가 달라져야 브라우저가 새 파일을 받는다
     ② 다시 읽기: READ_VERSION 이 오르면 옛 번호로 읽힌 사진을 다시 판독한다
   판독을 서버로 옮기면서(부르는 길만 바뀌고 **판독 결과는 한 글자도 안 달라진다**)
   ①은 필요하고 ②는 필요 없어졌다. 그런데 묶여 있어서 ①을 하려면 ②가 딸려 왔고,
   그러면 **사진 537장을 헛되이 다시 판독한다**(그대로 요금이다).
   그래서 갈라 못 박는다:
     · 모든 화면이 **같은** ?v= 를 쓴다 (한 브라우저 안에서 판독기가 갈리면 안 된다)
     · ?v= 는 READ_VERSION **이상**이다 (판 번호를 올렸는데 캐시가 안 깨지는 일 방지)
   「js 를 고치면 ?v= 를 올린다」 자체는 커밋 훅(scripts/check-cache-version.js)이 지킨다. */
test('★ 판독기 ?v= 가 화면마다 같고, 판 번호보다 뒤처지지 않는다', () => {
  /* 실제로 당했다(다른 화면에서): .js 를 고치고 ?v= 를 안 올려 수정이 통째로
     묻혔다. 여기서는 더 나쁘다 — 화면은 새것이라 제목 자리를 그리는데,
     판독기가 옛것이라 제목을 아예 안 담아 **빈 자리만** 보인다. */
  const rv = reader.match(/var READ_VERSION = (\d+);/);
  /* ⚠ **판독기를 싣는 화면을 전부** 본다(2026-08-15). 예전에는 사진첩 하나만 봐서,
     같은 모듈을 쓰는 급여데이터함이 ?v= 없이 실려 있어도 통과했다 — 같은 브라우저
     안에서 사진첩은 새 판독기, 급여데이터함은 캐시에 묵은 옛 판독기로 갈렸다.
     새 화면이 판독기를 싣기 시작해도 여기서 저절로 잡힌다. */
  const loaders = fs.readdirSync(R)
    .filter(function (f) { return /\.html$/.test(f); })
    .map(function (f) { return { file: f, src: fs.readFileSync(path.join(R, f), 'utf8') }; })
    .filter(function (x) { return /src="js\/pu-doc-read\.js/.test(x.src); });
  assert.ok(loaders.length >= 2,
    '판독기를 싣는 화면을 ' + loaders.length + '개만 찾았습니다 — 찾는 규칙이 어긋났습니다');

  const seen = [];
  loaders.forEach(function (x) {
    const tag = x.src.match(/js\/pu-doc-read\.js\?v=(\d+)/);
    assert.ok(tag, '★ ' + x.file + ' 의 pu-doc-read.js 에 ?v= 가 없습니다 — 옛 판독기를 씁니다');
    assert.ok(Number(tag[1]) >= Number(rv[1]),
      '★ ' + x.file + ' 의 ?v=' + tag[1] + ' 가 판 번호 ' + rv[1] + ' 보다 뒤처집니다'
      + ' — 판 번호를 올렸으면 ?v= 도 함께 올려 주세요');
    seen.push({ file: x.file, v: tag[1] });
  });
  const first = seen[0].v;
  seen.forEach(function (s) {
    assert.equal(s.v, first,
      '★ 화면마다 ?v= 가 다릅니다(' + seen.map(function (t) { return t.file + '=' + t.v; }).join(', ')
      + ') — 같은 브라우저 안에서 판독기가 갈립니다');
  });
});

/* ══════ ①-2 제목에 따옴표가 있어도 묶음 ✓ 가 살아 있다 ══════
   ⚠ 실제로 죽었다: 「'23년 …」처럼 연도를 줄여 쓴 제목(공문서에 흔하다)이 붙으면
     묶음 머리의 ✓(모두 고르기)를 눌러도 아무 일이 안 일어났다.
     encodeURIComponent 는 작은따옴표를 안 바꾸고, esc() 가 적은 &#39; 는 브라우저가
     onclick 속성을 읽을 때 ' 로 **되돌린 뒤** 자바스크립트로 넘기기 때문이다.
   ⚠ 글자만 봐서는 증명이 안 된다 — 브라우저가 하는 일(엔티티 풀기 → JS 컴파일)을
     그대로 흉내 내 **실제로 파싱해 본다.** */
const escOf = new Function('return ' + fnOf(app, 'esc').replace(/^function esc/, 'function') + ';')();

/* renderGrid 가 만드는 것과 같은 방식으로 열쇠를 싣는다 */
function argFor(title) {
  const m = app.match(/const arg = byTitle \? ([^;]+) : k;/);
  assert.ok(m, '묶음 열쇠를 싣는 줄을 찾지 못했습니다');
  return new Function('k', 'return ' + m[1] + ';')(title);
}

/* 브라우저: 속성값의 문자참조를 먼저 푼 뒤 그 결과를 JS 로 컴파일한다 */
function attrToJs(attr) {
  return attr.replace(/&#39;/g, "'").replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

const QUOTE_TITLES = [
  "'23년 안전보건관리체계 구축 컨설팅 결과",   // 실제 공문서 이름 꼴
  "사업자등록증명 (주)가야'S",
  '큰따옴표 "인용" 이 든 제목',
  '역슬래시 \\ 와 & < > 가 든 제목'
];

for (const title of QUOTE_TITLES) {
  test('★ 「' + title.slice(0, 14) + '…」 묶음의 ✓ 가 눌린다', () => {
    const attr = 'toggleTitleGroup(\'' + escOf(argFor(title)) + '\')';
    const js = attrToJs(attr);
    assert.doesNotThrow(function () { new Function(js); },
      '단추의 onclick 이 깨집니다 — 눌러도 아무 일이 안 일어납니다: ' + js);
  });

  test('그 열쇠를 받는 쪽이 제목을 그대로 되돌린다: 「' + title.slice(0, 10) + '…」', () => {
    /* 되돌린 값이 titleKey 와 안 맞으면 아무것도 안 골라진다 — 깨지지만 않는 것으로는 모자란다 */
    const ctx = {};
    vm.createContext(ctx);
    vm.runInContext('let got=null; function toggleItems(x){got=x} function shownItems(){return []}\n'
      + fnOf(app, 'toggleTitleGroup')
      + '\nfunction __probe(enc){ let k; try{k=decodeURIComponent(enc)}catch(_){k=enc} return k; }', ctx);
    assert.equal(ctx.__probe(argFor(title)), title,
      '되돌린 제목이 원래와 다릅니다 — 그 묶음은 한 장도 안 골라집니다');
  });
}

/* ══════ ② 제목 꺼내기 ══════ */

test('★ 제목이 없으면 갈래 이름으로 대신 채우지 않는다', () => {
  /* 여기서 READ_LABEL 로 물러나면 「사업자등록증명」이 다시 「사업자등록증」으로
     보인다 — 이 기능이 통째로 무의미해진다. */
  const c = load(['docTitle'], {});
  assert.equal(c.docTitle({ meta: { read: { kind: 'bizreg', fields: {} } } }), '',
    '★ 제목이 없는데 갈래 이름을 채우면 증명원과 등록증을 영영 못 가립니다');
  assert.equal(c.docTitle({ meta: { read: { kind: 'bizreg' } } }), '');
  assert.equal(c.docTitle({ meta: {} }), '');
  assert.equal(c.docTitle(null), '');
});

test('제목 앞뒤 공백은 지운다 — 묶음이 둘로 갈린다', () => {
  const c = load(['docTitle'], {});
  assert.equal(c.docTitle(withTitle('a', '  사업자등록증명  ')), '사업자등록증명');
});

test('제목 칸에 글자가 아닌 것이 들어와도 안 터진다', () => {
  /* AI 가 늘 문자열을 준다는 보장이 없다 — 배열·숫자가 오면 .trim() 이 터져
     격자가 통째로 안 그려진다. */
  const c = load(['docTitle'], {});
  assert.equal(c.docTitle({ meta: { read: { fields: { docName: ['가', '나'] } } } }), '');
  assert.equal(c.docTitle({ meta: { read: { fields: { docName: 123 } } } }), '');
});

/* ══════ ③ 제목순 정렬 ══════ */

test('★ 제목 없는 것은 늘 맨 뒤 — 손볼 것이 한자리에 모인다', () => {
  /* NO_TITLE 이 「제」로 시작해 가나다순 중간에 끼면, 손봐야 할 사진이
     묶음 사이에 흩어져 한자리에서 못 본다. */
  const c = load(['docTitle', 'photoTime', 'comparePhotosNewest', 'comparePhotosByTitle'], {});
  const rows = [
    { id: 'none', meta: { upAt: 9 } },
    withTitle('b', '하도급확인서', 5),
    withTitle('a', '가지급금명세서', 1)
  ];
  rows.sort(c.comparePhotosByTitle);
  assert.deepEqual(rows.map(r => r.id), ['a', 'b', 'none'],
    '★ 제목 없는 것이 뒤로 안 갑니다');
});

test('★ 같은 제목 안에서는 최신순 그대로', () => {
  /* 「사업자등록증 142장」 안에서도 방금 올린 것이 맨 앞이어야 찾는다. */
  const c = load(['docTitle', 'photoTime', 'comparePhotosNewest', 'comparePhotosByTitle'], {});
  const rows = [withTitle('old', '사업자등록증', 1), withTitle('new', '사업자등록증', 99)];
  rows.sort(c.comparePhotosByTitle);
  assert.deepEqual(rows.map(r => r.id), ['new', 'old'],
    '★ 같은 제목 묶음 안에서 방금 올린 것이 뒤로 가면 못 찾습니다');
});

test('★ 「사업자등록증」과 「사업자등록증명」이 따로 선다', () => {
  /* 이 검사가 이 기능의 목적 그 자체다. */
  const c = load(['docTitle', 'photoTime', 'comparePhotosNewest', 'comparePhotosByTitle'], {});
  const rows = [withTitle('proof', '사업자등록증명', 1), withTitle('cert', '사업자등록증', 2)];
  rows.sort(c.comparePhotosByTitle);
  assert.notEqual(c.docTitle(rows[0]), c.docTitle(rows[1]),
    '★ 두 서류가 한 묶음으로 붙으면 고친 뜻이 없습니다');
});

test('한글 제목은 가나다순으로 선다 — 유니코드 번호순이 아니다', () => {
  const c = load(['docTitle', 'photoTime', 'comparePhotosNewest', 'comparePhotosByTitle'], {});
  const rows = [withTitle('c', '차량운행일지'), withTitle('a', '가족관계증명서'), withTitle('b', '나라장터등록증')];
  rows.sort(c.comparePhotosByTitle);
  assert.deepEqual(rows.map(r => r.id), ['a', 'b', 'c']);
});

test('★ 접은 뒤에 정렬한다 — 쪽이 흩어지면 묶음 장수가 어긋난다', () => {
  const f = fnOf(app, 'shownItemsFresh');
  const fold = f.indexOf('foldDocs(list)');
  const sort = f.indexOf('comparePhotosByTitle');
  assert.ok(fold > 0 && sort > fold, '★ 접기보다 먼저 정렬하면 쪽이 흩어집니다');
});

test('★ 최신순일 때는 제목순 견주기를 안 건다', () => {
  /* 늘 걸면 대표 지시 2026-08-13(올린 차례)이 조용히 뒤집힌다. */
  const f = fnOf(app, 'shownItemsFresh');
  assert.match(f, /if \(gridSort === 'title'\)/,
    '★ 차례를 안 가리고 늘 제목순으로 세우면 최신순이 사라집니다');
});

/* ══════ ④ 화면 ══════ */

test('★ 격자 칸에 제목 띠가 붙는다', () => {
  const g = fnOf(app, 'renderGrid');
  assert.match(g, /class="ttl"/, '칸에 제목이 안 보입니다');
  assert.match(g, /\+ cap \+ ttl \+/,
    '★ 만들어 놓고 안 붙이면 화면에 없습니다');
  assert.match(app, /#grid \.cell \.ttl\{/, '제목 띠 꾸밈이 없습니다');
});

test('★ 제목 띠는 맨 뒤에 그린다 — 앞에 두면 다른 띠에 묻힌다', () => {
  /* 칸 아래 띠들은 「뒤엣것이 위로 쌓인다」로 짜여 있다(2026-08-15 겹침 수정).
     ttl 을 who·cap 앞에 두면 그 뒤로 묻혀 안 보인다. */
  /* ⚠ 이 줄에는 딱지가 하나씩 더 는다(2026-08-26 에 📌 증빙이 늘었다).
     띠 이름을 «차례대로» 못 박으면 늘 때마다 운다 — 볼 것 둘의 앞뒤만 본다. */
  const g = fnOf(app, 'renderGrid');
  const line = g.match(/\+ tag \+[^\n]*\bcap\b[^\n]*/);
  assert.ok(line, '칸을 만드는 줄을 찾지 못했습니다');
  assert.ok(line[0].indexOf('ttl') > line[0].indexOf('cap'),
    '★ 제목 띠가 업체 띠보다 앞에 있으면 묻혀 안 보입니다');
});

test('★ 제목순으로 볼 때는 칸의 제목 띠를 안 그린다 — 묶음 머리와 같은 말이다', () => {
  const g = fnOf(app, 'renderGrid');
  assert.match(g, /const tt = byTitle \? '' : docTitle\(it\);/,
    '같은 제목이 묶음 머리와 칸에 두 번 나옵니다');
});

test('★ 묶음 장수는 보이는 것이 아니라 걸러진 전부로 센다', () => {
  /* 폰은 60장씩 끊어 그린다 — 보이는 것만 세면 「142장」이 「60장」으로 적혀
     사진이 사라진 것처럼 보인다. */
  const g = fnOf(app, 'renderGrid');
  assert.match(g, /items\.forEach\(it => \{\s*const k = groupKey\(it\);/,
    '★ visibleItems 로 세면 폰에서 묶음 장수가 틀립니다');
});

test('판에도 제목을 갈래 딱지 아래 크게 적는다', () => {
  /* 판독 v9 부터 표는 pairs 차례를 그대로 따른다 — 제목을 표에 맡기면
     문서마다 다른 자리에 묻힌다. 늘 같은 자리에 있어야 눈이 찾는다. */
  assert.match(app, /class="dtitle"/, '판에 제목 자리가 없습니다');
  assert.match(app, /#readPanel \.dtitle\{/, '제목 꾸밈이 없습니다');
});

test('★ 내려받는 파일 이름은 갈래가 아니라 제목으로 시작한다', () => {
  /* 받아 놓은 파일이 죄다 「사업자등록증」으로 시작하면 증명원과 등록증을
     파일 이름만 보고 못 가른다. */
  const f = fnOf(app, 'fileNameOf');
  assert.match(f, /docTitle\(it\) \|\|/,
    '★ 제목이 있는데도 갈래 이름을 쓰면 파일 이름으로 못 가립니다');
});

/* ⚠ 2026-08-15 다시 겨눔 — 예전 검사는 고르개가 **찾기 줄에** 있기를 못 박았고,
   그 근거로 「도구줄은 고른 것이 없으면 숨는다」를 들었다. 둘 다 틀렸다:
     · renderGridBar 는 **보여 줄 사진이 하나도 없을 때만** 숨긴다(고르기와 무관).
     · 정작 폰은 **찾기 줄**을 🔍 누르기 전까지 접어 둔다 — 고르개가 안 보였다.
   지킬 것은 「폰에서 아무것도 안 누르고도 차례를 바꿀 수 있다」이지 어느 줄에
   있는가가 아니다. */
test('★ 차례 고르개가 폰에서 그냥 보인다 — 찾기를 펴지 않아도', () => {
  /* 폰이 접는 것은 #findBar 다(placeForWidth). 고르개가 그 안에 있으면 안 된다. */
  const fi = app.indexOf('<div id="findBar">');
  const fend = app.indexOf('</div>', app.indexOf('id="qClear"'));
  assert.ok(fi > 0 && fend > fi, '찾기 줄을 찾지 못했습니다');
  assert.ok(app.slice(fi, fend).indexOf('id="sortSeg"') < 0,
    '★ 고르개가 찾기 줄 안에 있습니다 — 폰에서는 🔍 를 눌러야만 보입니다');

  const gi = app.indexOf('<div id="gridBar">');
  const gend = app.indexOf('<div id="grid">');
  assert.ok(gi > 0 && gend > gi, '도구줄을 찾지 못했습니다');
  const bar = app.slice(gi, gend);
  assert.match(bar, /id="sortSeg"/, '차례 고르개가 도구줄에 없습니다');
  assert.match(bar, /pickSort\('title'\)/);
  assert.match(bar, /pickSort\('new'\)/);
});

/* 도구줄을 **돌려 본다** — 어느 것이 뜨고 어느 것이 접히는지 눈으로 보는 대신 값으로 본다.
   ⚠ 소스 한 줄을 글자로 못 박지 않는다(2026-08-26): 그렇게 두었더니 윗줄을 한 줄로
     합치면서 뜻은 그대로인데 검사만 울었다. 보아야 할 것은 «무엇이 보이느냐»다. */
function runGridBar(over) {
  const el = {};
  const mk = function (id) { return (el[id] = el[id] || { style: {}, textContent: '', disabled: false }); };
  const ctx = Object.assign({
    Object, Array, Set, String,
    selected: new Set(),
    shownItems: function () { return [{ id: 'a' }, { id: 'b' }]; },
    gridItems: [],
    needOnly: false, oldOnly: false, gridQ: '', reading: false, sending: false,
    gridYear: String(new Date().getFullYear()),
    viewingOther: function () { return false; },
    /* 2026-08-28: 도구줄이 «막는 쪽과 같은 기준»(mayTouch)을 본다 — 안 주면 멎는다 */
    mayTouch: function () { return true; },
    canSend: function () { return false; },
    worthRetry: function () { return true; },
    needsCheck: function () { return false; },
    renderNeedBox() {}, renderOldBox() {}, renderBackBar() {},
    renderUidCard() {},   /* 2026-08-26: 서식으로 잡힌 고유번호증 칸이 늘었다 */
    renderPhMenuBtn() {}, renderPhNeedBtn() {}, renderPayNote() {},
    $: mk
  }, over || {});
  vm.createContext(ctx);
  vm.runInContext(fnOf(app, 'idsOf'), ctx);
  vm.runInContext(fnOf(app, 'shownCount'), ctx);
  vm.runInContext(fnOf(app, 'readableSel'), ctx);
  /* 2026-08-28: 도구줄이 숫자 규칙(cnt)을 쓴다 — 안 주면 그 자리에서 멎는다 */
  vm.runInContext(fnOf(app, 'cnt'), ctx);
  /* 2026-08-29: 「👥 공유」가 도구줄에서 «누구 사진 아래»로 내려갔고, 도구줄이 그 칸을
     함께 그린다(기준이 하나여야 하므로) — 안 주면 그 자리에서 멎는다 */
  vm.runInContext(fnOf(app, 'renderShareCard'), ctx);
  vm.runInContext(fnOf(app, 'renderGridBar'), ctx);
  ctx.renderGridBar();
  return el;
}

test('★ 윗줄은 통째로 숨지 않는다 — 해 고르개가 그 안에 있다', () => {
  /* 2026-08-26 에 찾기 줄이 도구줄 «안»으로 들어갔다. 예전처럼 「볼 사진이 없으면
     줄을 통째로 숨김」으로 두면, 사진 없는 해를 고른 순간 해 고르개까지 사라져
     되돌아올 길이 없어진다. */
  const none = runGridBar({ shownItems: function () { return []; } });
  assert.notEqual(none.gridBar && none.gridBar.style.display, 'none',
    '볼 사진이 없다고 윗줄을 통째로 숨겼습니다 — 해를 되돌릴 길이 없어집니다');
});

test('★ 차례 고르개는 보여 줄 사진이 있을 때만 뜬다 (고른 것과는 무관)', () => {
  /* 고른 것이 없어도 사진만 있으면 떠 있어야 한다 — 폰에서 정렬이 숨은 기능이 됐던 적이 있다. */
  const some = runGridBar();
  assert.notEqual(some.sortSeg.style.display, 'none',
    '사진이 있는데 차례 고르개가 숨었습니다 — 폰에서 정렬할 길이 사라집니다');

  const none = runGridBar({ shownItems: function () { return []; } });
  assert.equal(none.sortSeg.style.display, 'none',
    '정렬할 사진이 하나도 없는데 고르개가 떠 있습니다');

  /* 찾는 중·확인 필요·보유기간 지난 것 보기에서는 결과가 0장이라도 남는다 —
     조건을 끄지 않은 채 고르개만 사라지면 화면이 고장 난 것처럼 보인다. */
  ['needOnly', 'oldOnly'].forEach(function (flag) {
    const o = { shownItems: function () { return []; } };
    o[flag] = true;
    assert.notEqual(runGridBar(o).sortSeg.style.display, 'none', flag + ' 에서 고르개가 사라졌습니다');
  });
  assert.notEqual(runGridBar({ shownItems: function () { return []; }, gridQ: '가' }).sortSeg.style.display,
    'none', '찾는 중에 고르개가 사라졌습니다');
});

test('폰 화면에서 도구줄을 감추지 않는다', () => {
  /* 폰 구간에서 #kinds·#chipRow 처럼 통째로 감추는 목록에 gridBar 가 끼면
     고르개도, 이제는 해 고르개까지 함께 사라진다.
     ⚠ 폰 덩어리는 **#chipRow 바로 앞의 것**을 집는다 — 앞쪽 @media 부터 집으면
       그 사이의 예사 규칙까지 폰 규칙으로 잘못 읽는다(2026-08-26 에 실제로 그랬다). */
  const phone = app.match(/@media \(max-width:820px\)\{(?:(?!@media)[\s\S])*?\n\}\r?\n#chipRow/);
  assert.ok(phone, '폰 전용 규칙 덩어리를 찾지 못했습니다');
  assert.ok(!/#gridBar\s*\{[^}]*display:\s*none/.test(phone[0]),
    '폰에서 도구줄을 감추면 차례 고르개도 해 고르개도 함께 사라집니다');
});

test('자리를 옮겨도 고르개 모습이 유지된다 — 꾸밈이 찾기 줄에 매여 있지 않다', () => {
  /* 자리를 옮기면서 꾸밈 규칙을 안 옮겨 「테두리 없는 맨 단추 두 개」가 되는 일이 잦다 */
  assert.ok(!/#findBar \.seg\{/.test(app),
    '고르개 꾸밈이 아직 찾기 줄에 매여 있습니다 — 옮긴 자리에서 맨 단추로 보입니다');
  assert.match(app, /^\.seg\{/m, '고르개 꾸밈 규칙이 없습니다');
  assert.match(app, /^\.seg button\.on\{/m, '지금 어느 차례인지 켜 보이는 규칙이 없습니다');
});

test('★ 고른 차례를 기억한다 — 열 때마다 최신순으로 돌아가지 않는다', () => {
  assert.match(app, /const GRID_SORT_LS = 'puphotos_grid_sort';/);
  const f = fnOf(app, 'pickSort');
  assert.match(f, /localStorage\.setItem\(GRID_SORT_LS/, '고른 차례를 안 남깁니다');
  assert.match(f, /try \{/, '사생활 보호 모드에서 터지면 고르개가 죽습니다');
  assert.match(f, /resetGridRenderLimit\(\)/,
    '★ 폰에서 펼쳐 둔 만큼을 안 되돌리면 위쪽 묶음이 통째로 빠져 보입니다');
});

test('갈래 이름표에 계약서가 빠져 있던 것도 고쳤다', () => {
  /* READ_LABEL 에 contract 가 없어 계약서가 「알 수 없음」으로 떨어졌다. */
  assert.match(app, /contract: '계약서'/,
    '계약서를 제대로 가려 놓고 이름이 없어 「알 수 없음」이 됩니다');
});
