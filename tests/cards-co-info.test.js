/* 기업정보 — 회사 하나에 얽힌 것을 한자리에.
   ⚠ 새 「갈래」가 아니라 **화면**이다. 명함첩은 「명함 아니면 사업자」 둘뿐이라고
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
  assert.match(fn, /🏢<em>기업정보<\/em>/);
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
  assert.match(source, /사진첩에서 서식·신청서를 기업정보로 보내면 그 서류 이름으로 갈래가 생깁니다/);
});

test('빠진 서류 경고는 우리가 일하는 회사에만 띄운다', () => {
  /* 명함 한 장만 있는 회사까지 붉게 칠하니 4,140곳이 온통 붉어져,
     정작 봐야 할 거래처의 빠진 서류가 묻혔다(대표 화면 2026-08-13). */
  assert.match(source, /const care = !!\(o\.erp \|\| coTagsOf\(o\)\.length\)/);
  assert.match(source, /const miss = s => care \?/);
});

test('사업 갈래는 옆줄 폴더로 그린다', () => {
  /* 화면 위 탭에서 옆줄로 내렸다(대표 지시 2026-08-13) */
  const at = source.indexOf('function renderPCSide');
  const fn = source.slice(at, source.indexOf('\nfunction ', at + 20));
  assert.match(fn, /coTagList\(cos\)/, '옆줄이 사업 갈래를 안 만든다');
  assert.match(fn, /사업별/, '사업별 머리가 없다');
});

test('푸른이알피 거래처만 보는 거르개가 있다', () => {
  /* 명함의 회사 이름만으로 잡힌 곳이 대부분이라 전체가 4천 곳을 넘는다.
     실제로 관리하는 곳은 그중 일부다(대표 지시 2026-08-13). */
  assert.match(source, /function toggleCoErpOnly/);
  assert.match(source, /if\(state\.coErpOnly\) list = list\.filter\(o=>o\.erp\)/);
  assert.match(source, /onclick="toggleCoErpOnly\(\)"/);
});

test('거르개는 옆줄 폴더로 옮겼다', () => {
  /* 화면 위 탭에서 옆줄로 내렸다 — 폴더 자리에 있어야 명함첩과 같은 손놀림이 되고,
     화면 위는 목록에 온전히 내준다(대표 지시 2026-08-13). */
  const at = source.indexOf('function renderPCSide');
  const fn = source.slice(at, source.indexOf('\nfunction ', at + 20));
  assert.match(fn, /pickCoFolder\('erp'\)/, '옆줄에 「거래처만」 폴더가 없다');
  assert.match(fn, /pickCoFolder\(''\)/, '옆줄에 「전체」 폴더가 없다');
  /* ⚠ 「글자 + 쌍점」을 정규식에 그대로 쓰면 「그 PC 절대경로 금지」 검사가
     드라이브 경로(c:/ 같은 것)로 오해한다. 쌍점을 빼고 앞부분만 본다. */
  assert.match(fn, /pickCoFolder\('t/, '옆줄에 사업별 폴더가 없다');
});

test('거래처 수를 거르개에 함께 보여준다', () => {
  /* 몇 곳이 걸러지는지 모르고 누르면 「왜 갑자기 비었지」가 된다 */
  assert.match(source, /const erpN = all\.filter\(o=>o\.erp\)\.length/);
});

test('거르개는 기억한다', () => {
  /* 대개 거래처만 본다면 들어올 때마다 다시 누르게 하면 안 된다 */
  assert.match(source, /localStorage\.setItem\('pucards_co_erponly'/);
  assert.match(source, /localStorage\.getItem\('pucards_co_erponly'\)/);
});

test('거르개는 사업 갈래와 성질이 달라 갈라 놓는다', () => {
  /* 나란히 두면 사업 하나를 고르는 것으로 잘못 읽힌다 */
  assert.match(source, /class="cosep"/);
  assert.match(source, /\.cotabs button\.erponly\{/);
});

test('목록은 한 줄에 한 회사인 표다', () => {
  /* 명함첩 목록과 같은 결 — 왼쪽에 네모, 그다음 번호 */
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
  /* 따로 계산하면 거르개를 켠 채 눌렀을 때 안 보이는 회사까지 골라진다 */
  assert.match(source, /function coVisible\(\)/);
  const at = source.indexOf('function coSelAll');
  assert.match(source.slice(at, at + 220), /coVisible\(\)/);
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

test('기업정보에서 친 글자를 명함첩 찾기칸에 옮기지 않는다', () => {
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
  assert.match(source, /읽어 온 서류 \$\{docs\.length\}건/);
  /* 최신 것이 위로 — 방금 보낸 서류를 맨 밑에서 찾게 하면 안 된다 */
  assert.match(source, /sort\(\(a,b\)=>\(b\.at\|\|0\)-\(a\.at\|\|0\)\)/);
  const at = source.indexOf('function coDetailHtml');
  assert.match(source.slice(at, at + 900), /coDocsHtml\(o\)/, '상세에 안 끼웠다');
});

test('유형(자문·급여)은 제 칸을 갖는다', () => {
  /* 상호 옆에 붙이면 상호가 길 때 유형이 밀려 안 보인다 */
  assert.match(source, /<th>상호<\/th><th>유형<\/th>/);
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
