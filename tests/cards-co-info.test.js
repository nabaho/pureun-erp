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
  assert.match(source, /사업자번호 없음/);
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

test('사업 갈래를 실제로 화면에 끼운다', () => {
  /* 갈래를 만들어 놓고 화면에 안 넣어도 「cotabs 가 소스에 있다」로는 통과한다 —
     실제로 ${tabs} 를 지워 봤더니 아무 검사도 안 걸렸다. 끼우는 줄을 직접 본다. */
  const at = source.indexOf('function renderCoPage');
  const fn = source.slice(at, source.indexOf('\nfunction coListHtml', at));
  assert.ok(fn.length > 300, 'renderCoPage 를 찾지 못했습니다');
  assert.match(fn, /\$\{tabs\}/, '갈래 탭을 화면에 끼우지 않는다');
  assert.match(fn, /const tabs = /, '갈래 탭을 만들지 않는다');
});

test('푸른이알피 거래처만 보는 거르개가 있다', () => {
  /* 명함의 회사 이름만으로 잡힌 곳이 대부분이라 전체가 4천 곳을 넘는다.
     실제로 관리하는 곳은 그중 일부다(대표 지시 2026-08-13). */
  assert.match(source, /function toggleCoErpOnly/);
  assert.match(source, /if\(state\.coErpOnly\) list = list\.filter\(o=>o\.erp\)/);
  assert.match(source, /onclick="toggleCoErpOnly\(\)"/);
});

test('거르개를 실제로 화면에 끼운다', () => {
  /* 만들어 놓고 안 끼워도 소스 검사만으로는 통과한다 — 끼우는 줄을 직접 본다.
     ⚠ 파일 전체에서 'const tabs = ' 를 찾으면 안 된다. 자료함(renderMatPage)에도
       같은 이름의 변수가 있어 엉뚱한 곳을 보게 된다 — 실제로 그렇게 걸렸다. */
  const fnAt = source.indexOf('function renderCoPage');
  assert.ok(fnAt > 0, 'renderCoPage 를 찾지 못했습니다');
  const fn = source.slice(fnAt, source.indexOf('\nfunction coListHtml', fnAt));
  assert.match(fn, /class="erponly/, '거르개 단추를 탭 줄에 안 넣었다');
  assert.match(fn, /\$\{tabs\}/, '탭 줄 자체를 화면에 안 끼웠다');
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
