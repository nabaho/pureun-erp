'use strict';
/* 홈페이지 「🔍 찾기」 단추는 감춰 둔다 — 지운 것이 아니다 (대표 지시 2026-09-03)

   「네이버에 가입 안 하고 진행 안 한다. 추후 필요할 경우 다시 요청하겠다.」
   → 「찾기 단추 감춰라」

   열쇠가 없으면 그 단추는 눌러도 「검색 도구가 아직 설정되지 않았습니다」만 뜬다.
   그런 단추가 화면에 남아 있으면 볼 때마다 「저건 왜 안 되나」를 다시 묻게 된다.

   ⚠ 그렇다고 «지우면» 안 된다. 서버 함수·판정 로직·검사가 다 살아 있고,
     판정 규칙(회사명+주소가 함께 맞을 때만 자동 등록)은 대표가 정한 것이다.
     지웠다가 다시 만들면 그 규칙을 처음부터 다시 정해야 한다.

   이 검사가 못 박는 것 —
     ① 스위치가 꺼져 있다 (지금은 안 보인다)
     ② 단추가 그 스위치에 매여 있다 — 스위치를 켜면 «정말로» 다시 나온다
     ③ 기능은 지우지 않았다 (서버 함수·판정 로직·부르는 자리가 그대로)
     ④ 「홈페이지」 칸 자체는 살아 있다 — 손으로 적는 것은 된다

   실행: node --test tests/*.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const R = path.join(__dirname, '..');
const erp = fs.readFileSync(path.join(R, 'pu-erp.html'), 'utf8').replace(/\r\n/g, '\n');
/* ⚠ 주석을 먼저 걷는다 — 「왜 감췄는지」 적어 둔 설명글이 검사를 통과시키면 안 된다 */
const bare = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
const code = bare(erp);

/* ⚠★ «업체 수정 창»만 잘라 본다. 파일 전체를 보면 딴 화면의 「🔍 찾기」 단추와
     딴 곳의 '홈페이지' 글자가 걸려, 이 자리를 통째로 지워도 검사가 통과한다 —
     2026-09-03 에 일부러 깨 보다가 넷이 그렇게 새는 것을 봤다. */
/* ⚠ cutFn 은 이 창에서 190자만 잘라 온다(안쪽 함수의 중괄호에 걸린다) —
     다음 최상위 function 까지로 자른다. 이 저장소의 다른 검사가 쓰는 방식이다. */
const _mStart = erp.indexOf('function CompanyEditModal(props){');
assert.ok(_mStart > 0, 'CompanyEditModal 을 못 찾았습니다');
const _mEnd = erp.indexOf('\nfunction ', _mStart + 10);
const modal = bare(erp.slice(_mStart, _mEnd > 0 ? _mEnd : undefined));
/* 홈페이지 칸 한 덩이 — 라벨부터 후보 목록 앞까지 */
const iSite = modal.indexOf("h('label', null, '홈페이지')");
const siteBlock = iSite > 0 ? modal.slice(iSite, iSite + 1600) : '';

test('★★ 스위치가 꺼져 있다 — 지금은 단추가 안 보인다', () => {
  const m = code.match(/var CO_WEBSITE_FIND_ON = (true|false);/);
  assert.ok(m, '★ 스위치를 못 찾았습니다');
  assert.equal(m[1], 'false',
    '★★ 대표 결정은 «감춘다» 입니다 (2026-09-03). 켜려면 결정을 먼저 바꾸십시오');
});

test('★★ 단추가 그 스위치에 매여 있다 — 켜면 «정말로» 다시 나온다', () => {
  /* 스위치만 두고 단추를 안 매어 두면, 껐다고 믿는 동안 그대로 보인다. */
  assert.match(siteBlock, /CO_WEBSITE_FIND_ON && h\('button'/,
    '★★ 단추가 스위치와 이어져 있지 않습니다');
  /* 단추를 통째로 지워 놓고 스위치만 남기는 것도 막는다.
     ⚠ 이 «칸 안»에서 본다 — 파일 전체로 보면 딴 화면의 「🔍 찾기」가 걸린다. */
  assert.match(siteBlock, /'🔍 찾기'\)/,
    '★★ 단추를 «지웠습니다» — 감추라고 하셨지 없애라고 하지 않았습니다');
});

test('★★ 기능은 지우지 않았다 — 다시 켤 때 처음부터 만들지 않게', () => {
  /* 판정 규칙(회사명+주소가 함께 맞을 때만)은 대표가 정한 것이다. 살려 둔다. */
  assert.ok(fs.existsSync(path.join(R, 'functions', 'company-website-match.js')),
    '★★ 판정 로직을 지웠습니다 — 다시 켤 때 규칙을 처음부터 다시 정해야 합니다');
  const fn = bare(fs.readFileSync(path.join(R, 'functions', 'index.js'), 'utf8'));
  /* ⚠ 이름 뒤에 «= 가 바로» 오는지 본다. 그냥 이름만 찾으면
       findCompanyWebsiteX 로 바꿔치기해도 통과한다(앞 글자가 그대로라서). */
  assert.match(fn, /exports\.findCompanyWebsite\s*=/,
    '★★ 서버 함수를 지웠습니다 — 스위치만 켜서는 안 돌아갑니다');
  /* 부르는 자리 — 단추가 «실제로» 그것을 부르는지, 칸 안에서 본다 */
  assert.match(siteBlock, /onClick:searchCompanyWebsite/,
    '★★ 단추가 아무것도 안 부릅니다 — 스위치를 켜도 아무 일이 없습니다');
  assert.match(code, /function searchCompanyWebsite/,
    '★★ 부르는 몸통을 지웠습니다');
  assert.match(code, /findCompanyWebsite/, '★ 서버 주소를 지웠습니다');
});

test('★ 「홈페이지」 칸은 그대로 — 손으로 적는 것은 된다', () => {
  assert.ok(iSite > 0,
    '★★ 업체 수정 창에서 「홈페이지」 칸을 없앴습니다 — 손으로도 못 적게 됩니다');
  assert.match(siteBlock, /value:f\.website \|\| ''/, '★ 적은 값이 안 담깁니다');
});
