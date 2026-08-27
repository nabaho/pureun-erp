/* 기업정보 — 회사 하나에 얽힌 것을 한자리에.
   ⚠ 새 「갈래」가 아니라 **화면**이다. 기업정보함은 「명함 아니면 사업자」 둘뿐이라고
     가정하는 곳이 아홉 군데, state.tab 을 쓰는 곳이 일흔두 군데다. 셋째 갈래를 끼우면
     검색·중복정리·내보내기·개인폴더가 다 흔들린다(대표 지시 2026-08-12). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'pu-cards.html'), 'utf8');

test('기업정보는 갈래가 아니라 화면이다', () => {
  /* kind 를 늘리면 아래 아홉 군데가 조용히 어긋난다 */
  assert.match(source, /const isCo\s*=\s*state\.view==='co'/);
  assert.doesNotMatch(source, /kind:\s*'co'/, "새 item kind 를 만들면 안 된다");
  assert.doesNotMatch(source, /state\.tab==='co'/, '갈래 자리에 끼우면 안 된다');
});

test('옆줄에 기업정보 줄이 있다', () => {
  const at = source.indexOf('function renderPCSide');
  const fn = source.slice(at, source.indexOf('\nfunction ', at + 20));
  assert.match(fn, /onclick="openCoPage\(\)"/);
  assert.match(fn, /🏢<em>기업 상세<\/em>/);
});

test('기업정보 화면에서는 명함 폴더를 그리지 않는다', () => {
  /* 회사 단위 화면이라 명함 폴더와 상관이 없다 — 그리면 엉뚱한 폴더가 따라다닌다 */
  const at = source.indexOf('function renderPCSide');
  const fn = source.slice(at, source.indexOf('\nfunction ', at + 20));
  const co = fn.indexOf("if(state.view==='co')");
  const folders = fn.indexOf('">폴더');
  assert.ok(co > 0 && folders > co, '기업정보 갈림길이 폴더보다 뒤에 있다');
});

test('회사를 가르는 열쇠는 사업자번호다', () => {
  /* 상호는 「(주)한서정공」과 「한서정공」처럼 적는 사람마다 달라 같은 회사가 둘로 갈린다 */
  assert.match(source, /const coKeyOf = it => \{ const d=digits\(it\.bizno\|\|''\)/);
});

test('사업자번호 없는 명함도 같은 회사로 붙는다', () => {
  /* 명함에는 사업자번호가 거의 안 적혀 있다. 이 다리가 없으면 같은 회사가
     「등록증 쪽」과 「명함 쪽」으로 갈려 목록에 두 줄로 뜬다 — 실제로 그랬다. */
  const at = source.indexOf('function coList');
  const fn = source.slice(at, source.indexOf('\nconst _norm', at));
  assert.match(fn, /const nameIdx = \{\}/);
  assert.match(fn, /nameIdx\[_norm\(it\.company\)\]/, '상호로 이어 붙이는 다리가 없다');
});

test('상호 견주기는 (주)·주식회사·띄어쓰기를 무시한다', () => {
  assert.match(source, /const _norm = s => String\(s\|\|''\)\.replace\(\/\\s\|\\\(주\\\)\|주식회사\|㈜\/g,''\)/);
});

test('서식·신청서에서 읽은 칸을 보여준다', () => {
  /* 기술·경영 혁신 지원신청서가 채우는 칸들 */
  ['지정번호','통상영향 품목','지원 희망분야','세부 내용','신청일','처리기간','법인등록번호']
    .forEach(label => assert.match(source, new RegExp("'" + label + "'"), label + ' 이름표가 없다'));
});

test('서식 칸은 항목(items)이 아니라 따로 둔다', () => {
  /* items 를 늘리면 검색 색인·중복정리가 다 따라 움직인다 */
  assert.match(source, /DB_ROOT\+'\/coInfo'/);
  assert.match(source, /let _coInfo = \{\}/);
});

test('빠진 서류를 눈에 띄게 알린다', () => {
  /* 288곳 중 어디에 서류가 비었는지 지금은 알 길이 없다 — 이게 이 화면의 값어치다 */
  assert.match(source, /miss\('없음'\)/, '사업자번호가 빈 것을 안 짚는다');
  assert.match(source, /등록증 없음/);
  assert.match(source, /\.corow \.bits i\.miss\{background:#fee2e2/);
});

test('사업 갈래(탭)는 서식 이름으로 저절로 생긴다', () => {
  /* 기업정보는 「특정 사업 때문에」 모이는 일이 많다 — 손으로 탭을 만들 필요가 없어야 한다 */
  assert.match(source, /const coTagsOf = o => Object\.keys\(\(o\.extra && o\.extra\.tags\)/);
  assert.match(source, /function coTagList/);
  assert.match(source, /class="cotabs"/);
  assert.match(source, /onclick="pickCoTag\(/);
});

test('갈래가 없으면 어떻게 생기는지 알려준다', () => {
  /* 빈 줄만 있으면 「왜 아무것도 없지」로 끝난다 */
  assert.match(source, /사진첩에서 서식·신청서를 기업 상세로 보내면 그 서류 이름으로 갈래가 생깁니다/);
});

test('빠진 서류 경고는 우리가 일하는 회사에만 띄운다', () => {
  /* 명함 한 장만 있는 회사까지 붉게 칠하니 4,140곳이 온통 붉어져,
     정작 봐야 할 거래처의 빠진 서류가 묻혔다(대표 화면 2026-08-13).
     2026-08-24(3순위): 이 잣대를 coCares 로 옮겨 「정보부족」 세기와 «같이» 쓴다 —
     두 벌로 두면 「부족 3,900곳」이라 해 놓고 줄에는 아무것도 안 뜬다. */
  assert.match(source, /function coCares\(o\)\{\s*\r?\n\s*return !!\(o && \(o\.erp \|\| coTagsOf\(o\)\.length\)\);/);
  assert.match(source, /const care = coCares\(o\)/);
  assert.match(source, /const miss = s => care \?/);
});

test('사업 갈래는 옆줄 폴더로 그린다', () => {
  /* 화면 위 탭에서 옆줄로 내렸다(대표 지시 2026-08-13) */
  const at = source.indexOf('function renderPCSide');
  const fn = source.slice(at, source.indexOf('\nfunction ', at + 20));
  assert.match(fn, /coTagList\(cos\)/, '옆줄이 사업 갈래를 안 만든다');
  /* 2026-08-16 이름을 「서류 탭」으로 바꿨다 — 손으로 만든 폴더 탭과 가르기 위해서다.
     이 검사가 보는 것은 «옆줄이 서식 갈래를 제 칸에 그리는가» 이지 그 이름이 아니다. */
  assert.match(fn, /서류 탭/, '서식 갈래 머리가 없다');
});

/* ── 「거래처만」 거르개는 없앴다 (대표 지시 2026-08-17) ──
   "거래처만 삭제해라. 내가 새로 폴더 만들어서 관리하겠다".
   예전에는 여기에 다섯 검사가 있었다 — 거르개가 있다 / 옆줄 폴더로 옮겼다 / 개수를
   함께 보여준다 / 취향을 기억한다 / 사업 갈래와 갈라 놓는다(.cosep·.erponly 모양).
   지운 기능을 지키는 검사를 남겨 두면 다음 사람이 되살리게 된다. 그래서 지우고,
   그 자리에 «옆줄이 어떻게 읽혀야 하는가»만 남긴다. 「거래처만」이 되살아나지 않는지는
   cards-co-folders.test.js 의 ★ 검사가 한곳에서 지킨다. */
test('옆줄은 폴더 ＋ → 전체 → 대표가 만든 폴더로 읽힌다', () => {
  /* ⚠ 2026-08-18 바로잡음. 예전 이 검사는 「사업자와 같은 차림새」라고 적어 놓고
     실제로는 «반대 차례»(전체 → 폴더)를 못 박고 있었다. 사업자 옆줄을 그려서 재 보니
     「폴더 ＋」 머리가 먼저고 그 «다음»이 「전체」다(창 1400×900: 머리 18px · 전체 14px).
     대표가 "조금 다르다"고 하신 것이 이것이다 — 이제 두 화면이 같은 차례다. */
  const at = source.indexOf('function renderPCSide');
  const fn = source.slice(at, source.indexOf('\nfunction ', at + 20));
  assert.match(fn, /pickCoFolder\(''\)/, '옆줄에 「전체」 줄이 없다');
  /* ⚠ 「글자 + 쌍점」을 정규식에 그대로 쓰면 「그 PC 절대경로 금지」 검사가
     드라이브 경로(c:/ 같은 것)로 오해한다. 쌍점을 빼고 앞부분만 본다. */
  assert.match(fn, new RegExp("pickCoFolder\\('f"), '옆줄에 손으로 만든 폴더가 없다');
  assert.match(fn, /pickCoFolder\('t/, '옆줄에 사업별 폴더가 없다');
  const allAt = fn.indexOf("pickCoFolder('')");
  const secAt = fn.indexOf('">폴더');
  const loopAt = fn.indexOf('folders.forEach');
  assert.ok(secAt > 0 && allAt > secAt && loopAt > allAt,
    '「폴더 ＋ → 전체 → 폴더들」 차례가 아니다 — 사업자 옆줄과 같아야 한다');
});

test('목록은 한 줄에 한 회사인 표다', () => {
  /* 기업정보함 목록과 같은 결 — 왼쪽에 네모, 그다음 번호 */
  assert.match(source, /class="cotbl"/);
  assert.match(source, /<th class="num">#<\/th>/);
  assert.match(source, /onchange="coToggle\(/, '줄마다 고르는 네모가 없다');
  assert.match(source, /onchange="coSelAll\(this\.checked\)"/, '전체 고르기 네모가 없다');
});

test('번호는 보이는 목록 기준으로 1부터', () => {
  assert.match(source, /list\.map\(\(o,i\)=>\{/);
  assert.match(source, /<td class="num">\$\{i\+1\}<\/td>/);
});

test('전체 고르기는 보이는 것만 고른다', () => {
  /* 따로 계산하면 거르개를 켠 채 눌렀을 때 안 보이는 회사까지 골라진다.
     나눠 보기(2026-08-15) 뒤로 「보이는 것」은 곧 **지금 쪽**이다 — 그리기와
     같은 coPage() 하나를 본다. 찾은 전체를 고르는 길은 coSelAllMatching 으로 따로 있다. */
  assert.match(source, /function coVisible\(\)/);
  const at = source.indexOf('function coSelAll(');
  const fn = source.slice(at, source.indexOf('function coSelAllMatching', at));
  assert.match(fn, /coPage\(\)/, '그리는 것과 같은 쪽을 봐야 한다');
  assert.doesNotMatch(fn, /coVisible\(\)/, '찾은 전체를 고르면 화면에 없는 회사가 딸려 간다');
});

test('네모를 눌러도 회사가 안 열린다', () => {
  /* 줄을 누르면 상세가 열리므로 막지 않으면 둘이 겹친다 */
  const at = source.indexOf('onchange="coToggle(');
  assert.match(source.slice(Math.max(0, at - 200), at), /event\.stopPropagation\(\)/);
});

test('설명만 하던 머리줄을 지웠다', () => {
  /* 옆줄에 이미 「기업정보」가 있고, 한 번 읽으면 그만인 설명이 늘 한 줄을 먹었다 */
  assert.doesNotMatch(source, /사업자등록증·명함·푸른이알피를 회사로 모았습니다/);
});

test('찾기 칸은 화면 맨 위 하나만 쓴다', () => {
  /* 같은 일을 하는 칸이 둘이면 어느 쪽에 쳐야 하는지 헷갈리고,
     한쪽에 남은 글자가 다른 쪽 결과를 조용히 거른다(대표 지시 2026-08-13). */
  assert.doesNotMatch(source, /class="coq"/, '화면 안 찾기 칸이 아직 있다');
  assert.match(source, /function syncPcSearchFor/);
  assert.match(source, /p\.placeholder = '상호·사업자번호·대표자로 찾기'/);
});

test('기업정보에서 친 글자를 기업정보함 찾기칸에 옮기지 않는다', () => {
  /* 회사 이름을 친 채 명함으로 나가면 명함 목록이 그 글자로 조용히 걸러진다 — 실제로 그랬다 */
  const at = source.indexOf('function onPcSearchInput');
  const fn = source.slice(at, source.indexOf('function clearPcSearch', at));
  const co = fn.indexOf("state.view === 'co'");
  assert.ok(co > 0, '기업정보 갈림길을 찾지 못했습니다');
  /* 갈림길 **앞쪽**에 #search 에 값을 넣는 줄이 하나라도 있으면 안 된다.
     자리만 견주면(co < setSearch) 앞에 한 줄 더 끼워 넣어도 안 걸린다 — 실제로 안 걸렸다. */
  const before = fn.slice(0, co);
  assert.doesNotMatch(before, /\$\('search'\)/, '기업정보 갈림길보다 먼저 #search 를 건드린다');
  assert.doesNotMatch(before, /\.value\s*=\s*v/, '기업정보 갈림길보다 먼저 값을 옮긴다');
});

test('기업정보를 나서면 안내글을 되돌린다', () => {
  assert.match(source, /if\(!isCo\) syncPcSearchFor\('list'\)/);
});

test('읽어 온 서류 목록을 회사 상세에 보여준다', () => {
  assert.match(source, /function coDocsHtml/);
  /* 2026-08-26(2단계): 글귀가 coDocsListHtml 로 옮겨갔다 — 제목을 밖에서 넘긴다.
     「읽어 온 서류」라는 말은 그대로 쓰이고, 붙임새가 정해진 뒤에는
     「아직 안 붙은 서류」로 다시 그린다. 둘 다 있는지 본다. */
  assert.match(source, /\$\{esc\(title\)\} \$\{docs\.length\}건/);
  assert.match(source, /'읽어 온 서류'/);
  assert.match(source, /'아직 안 붙은 서류'/);
  /* 최신 것이 위로 — 방금 보낸 서류를 맨 밑에서 찾게 하면 안 된다 */
  assert.match(source, /sort\(\(a,b\)=>\(b\.at\|\|0\)-\(a\.at\|\|0\)\)/);
  /* ⚠ 고정 폭(at+900)으로 자르고 있었다 — 2026-08-26 에 사업·사건 칸을 위로 올리며
       주석이 늘자 창을 넘어 실패했다. 폭을 키워 쫓아가지 말고 «함수 끝»까지 본다. */
  const at = source.indexOf('function coDetailPanelHtml');
  const end = source.indexOf('function openCoDetailPanel', at + 1);
  assert.ok(at > 0 && end > at, 'coDetailPanelHtml 을 못 찾았다');
  assert.match(source.slice(at, end), /coDocsHtml\(o\)/, '상세에 안 끼웠다');
});

test('유형(자문·급여)은 제 칸을 갖는다', () => {
  /* 상호 옆에 붙이면 상호가 길 때 유형이 밀려 안 보인다 */
  const at = source.indexOf('function coListHtml');
  const fn = source.slice(at, source.indexOf('function coToggle', at));
  /* ⚠ 유형 칸에 열 깔때기(span)가 들어가면서 <th>...</th> 사이에 다른 태그가
     생겼다 — [^<]* 로는 더는 못 잡는다. 태그를 다 지운 뒤 남는 글자로 본다. */
  const th = fn.match(/<th[^>]*>[\s\S]*?<\/th>/g) || [];
  const labels = th.map(x => x.replace(/<[^>]+>/g, '').replace(/\$\{[^}]*\}/g, '').trim());
  const iName = labels.indexOf('상호');
  const iType = labels.findIndex(l => l.indexOf('유형') === 0);
  assert.ok(iName >= 0 && iType === iName + 1, '상호 바로 다음 칸이 유형이 아니다');
});

test('마지막에 남는 폭을 먹는 빈 칸을 둔다', () => {
  /* 없으면 상호 칸이 남은 폭을 다 먹어 사업자번호·가진 것·담당이 화면 오른쪽 끝까지
     밀려난다 — 눈이 좌우로 멀리 오간다(대표 화면 2026-08-13). */
  const at = source.indexOf('<colgroup><col style="width:34px">');
  assert.ok(at > 0, '기업정보 표의 colgroup 을 찾지 못했습니다');
  const cg = source.slice(at, at + 260);
  assert.match(cg, /width:300px/, '상호 칸에 폭을 안 줬다 — 남은 폭을 다 먹는다');
  assert.match(cg, /<col><\/colgroup>/, '남는 폭을 먹는 빈 칸이 없다');
});

test('열 머리를 눌러 정렬한다 — 사업자 표와 같은 손놀림', () => {
  assert.match(source, /function coSortBy/);
  assert.match(source, /onclick="coSortBy\('name'\)"/);
  assert.match(source, /onclick="coSortBy\('docs'\)"/);
  assert.match(source, /onclick="coSortBy\('mgr'\)"/);
});

test('숫자 칸은 숫자로 견준다 — 글자로 견주면 10 이 9 보다 앞선다', () => {
  const at = source.indexOf('const CO_SORT = {');
  const fn = source.slice(at, at + 400);
  assert.match(fn, /cards:\s*o => o\.cards\.length/, '명함 수를 숫자로 안 뽑는다');
  assert.match(fn, /docs:\s*o => o\.docs\|\|0/, '등록증 수를 숫자로 안 뽑는다');
});

test('빈 값은 방향과 상관없이 뒤로 간다', () => {
  const at = source.indexOf('function coSorted');
  const fn = source.slice(at, source.indexOf('function coSortBy', at));
  assert.match(fn, /if\(!x && y\) return 1/);
  assert.match(fn, /if\(x && !y\) return -1/);
});

test('renderCoPage 는 coVisible 하나만 거치고 따로 거르지 않는다', () => {
  /* 두 곳에서 같은 일을 하면 한쪽만 고쳤을 때 어긋난다 — 실제로 정렬이
     coVisible 에만 붙어 화면에는 안 먹힌 적이 있다. */
  const at = source.indexOf('function renderCoPage');
  const fn = source.slice(at, source.indexOf('function coListHtml', at));
  /* 나눠 보기(2026-08-15) 뒤로 renderCoPage 는 coPage() 를 부르고, coVisible() 은
     그 안에서 «한 번만» 불린다. 여기서 또 부르면 자르는 곳이 둘이 된다. */
  assert.match(fn, /const info = coPage\(\);/);
  assert.doesNotMatch(fn, /const list = coVisible\(\);/, 'renderCoPage 가 또 목록을 만든다');
  assert.doesNotMatch(fn, /list = list\.filter/, 'renderCoPage 가 따로 거르고 있다');
  const cp = source.slice(source.indexOf('function coPage()'), source.indexOf('function coSetPageSize'));
  assert.match(cp, /coVisible\(\)/, '거르는 차례는 여전히 coVisible 하나를 거쳐야 한다');
});

test('같은 칸을 두 번 누르면 방향이 바뀐다', () => {
  const at = source.indexOf('function coSortBy');
  const fn = source.slice(at, at + 400);
  assert.match(fn, /s\.dir==='asc' \? 'desc' : 'asc'/);
});
