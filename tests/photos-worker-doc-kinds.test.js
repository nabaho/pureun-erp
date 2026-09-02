'use strict';
/* 근로자 서류 넷 — 신분증·주민등록등본·위임장·개인정보동의서 (대표 지시 2026-09-01)

   ■ 왜 이 넷을 «알아보게» 하나
   정보를 캐려는 것이 아니다. **민감으로 다루려는 것**이다.
   사진첩은 판독이 정한 종류로 민감 여부를 가른다. 종류가 안 잡히면 「민감 아님」으로
   떨어지고, 그러면 **원본 주소가 사진 정보에 그대로 적힌다** — 그 주소는
   만료가 없고 로그인도 필요 없다. 신분증에 그것은 안 된다.

   ■ ⚠⚠ 그래서 담는 것은 «이름 하나»뿐이다
   주민번호·주소·연락처·가족사항은 한 글자도 안 담는다. 담기는 순간 그것이
   **사진 목록에 실려 내려가고, 목록은 화면을 열 때마다 통째로 온다.**
   cms·bankbook 에서 계좌는 담되 주민번호는 안 담기로 한 것과 같은 셈이다.
   → 이 파일에서 가장 센 검사가 그것이다.

   ■ 두 목록이 «반드시» 같아야 한다
   화면(js/pu-photo-store.js)과 서버(functions/photo-view.js)가 같은 목록을 본다.
   어긋나면 화면은 원본 주소를 안 적는데 서버는 「민감 아니다」로 물러나
   **그 사진이 아예 안 열린다.** 목록을 고쳤으면 함수를 다시 올려야 한다.

   실행: node --test tests/*.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const R = path.join(__dirname, '..');
const store = fs.readFileSync(path.join(R, 'js', 'pu-photo-store.js'), 'utf8');
const server = fs.readFileSync(path.join(R, 'functions', 'photo-view.js'), 'utf8');
const read = fs.readFileSync(path.join(R, 'js', 'pu-doc-read.js'), 'utf8');
const app = fs.readFileSync(path.join(R, 'pu-photos.html'), 'utf8');

const NEW = ['idcard', 'resident', 'mandate', 'consent'];

function kinds(src) {
  const m = /SENSITIVE_KINDS = \{([^}]*)\}/.exec(src);
  assert.ok(m, '민감 목록을 못 찾았습니다');
  return m[1].split(',').map(x => x.split(':')[0].trim()).filter(Boolean).sort();
}

/* ── ① 민감으로 다룬다 ── */

test('★★ 근로자 서류 넷이 «민감»이다 — 아니면 원본 주소가 그대로 적힌다', () => {
  const a = kinds(store);
  NEW.forEach(function (k) {
    assert.ok(a.indexOf(k) >= 0,
      '★★ 「' + k + '」가 민감 목록에 없습니다 — 담는 순간 원본 주소가 사진에 적히고,\n' +
      '  그 주소는 만료가 없고 로그인도 필요 없습니다. 신분증에 그것은 안 됩니다.');
  });
});

test('★★ 화면과 서버가 «같은 목록»을 본다 — 어긋나면 사진이 아예 안 열린다', () => {
  assert.deepEqual(kinds(store), kinds(server),
    '★★ 두 목록이 다릅니다. 화면은 원본 주소를 안 적는데 서버는 「민감 아니다」로\n' +
    '  물러나, 그 사진이 «아예 안 열립니다».\n' +
    '  ⚠ 서버 쪽을 고쳤으면 **함수를 다시 올려야** 합니다:\n' +
    '    firebase deploy --only functions:photoView');
});

test('★ 옛 다섯도 그대로 있다 — 넷을 더하면서 잃으면 안 된다', () => {
  const a = kinds(store);
  ['contract', 'timesheet', 'payslip', 'cms', 'bankbook'].forEach(function (k) {
    assert.ok(a.indexOf(k) >= 0, '★★ 「' + k + '」가 민감 목록에서 사라졌습니다');
  });
});

/* ── ② ⚠⚠ 주민번호를 «안 담는다» — 이 파일에서 가장 센 검사 ── */

test('★★ 넷에서 «주민번호·주소·연락처»를 담지 않는다 — 담기면 목록에 실려 내려간다', () => {
  /* 무엇을 담을지 적어 둔 줄만 본다(kind=... 이면 키: ...) */
  NEW.forEach(function (k) {
    const line = (new RegExp("kind=" + k + " 이면 키: ([^']*)").exec(read) || [])[1];
    assert.ok(line, '★★ 「' + k + '」에 담을 것을 안 적었습니다 — 적어야 지어내지 않습니다');
    /* ⚠ 낱말 「주민」만으로 찾으면 안 된다 — docName 의 «보기»에 적힌
       「주민등록증」·「주민등록표 등본」이 걸린다. 그건 서류 «이름»이지 번호가 아니다
       (검사를 처음 썼을 때 실제로 헛울렸다). 번호를 가리키는 말만 본다. */
    ['주민번호', '주민등록번호', '외국인등록번호', 'rrn', 'jumin', '생년월일'].forEach(function (bad) {
      assert.ok(line.indexOf(bad) < 0,
        '★★ 「' + k + '」이 주민번호를 담으려 합니다: ' + line);
    });
    /* 담을 «칸 이름»을 따로 본다 — 설명글이 아니라 키 자체를 본다 */
    const keys = line.split(',').map(function (p) {
      return (p.split('(')[0] || '').trim();
    }).filter(Boolean);
    ['address', 'addr', 'mobile', 'tel', 'phone', 'birth', 'family', 'rrn', 'idNo', 'residentNo']
      .forEach(function (bad) {
        assert.ok(keys.indexOf(bad) < 0,
          '★★ 「' + k + '」이 「' + bad + '」 칸을 담습니다 — 이 넷에서 필요한 것은\n' +
          '  «누구 것인가»뿐입니다. 담긴 것은 사진 목록에 실려 내려갑니다.\n' +
          '  지금 칸: ' + keys.join(', '));
      });
    /* ⚠ pairs 는 「문서의 모든 칸」이라, 넣는 순간 주민번호가 딸려 온다 */
    assert.ok(line.indexOf('pairs') < 0,
      '★★ 「' + k + '」이 pairs 를 담습니다 — pairs 는 문서의 모든 칸이라\n' +
      '  주민번호가 그대로 딸려 옵니다.');
    /* 담아야 할 것은 있어야 한다 — 「누구 것인가」 */
    assert.match(line, /name\(/, '★★ 「' + k + '」이 이름을 안 담습니다 — 누구 것인지 못 붙입니다');
  });
});

test('★★ 물음이 «담지 마세요»라고 못박는다 — 키 목록만으로는 pairs 로 새어 나온다', () => {
  /* cms·bankbook 에서 배운 것: 키에서 뺐다고 안 담기는 것이 아니다. 못박아야 한다. */
  const line = (/⚠⚠ kind=idcard[^']*/.exec(read) || [])[0];
  assert.ok(line, '★★ 넷에 대한 「담지 마세요」 줄이 없습니다');
  ['주민등록번호', '외국인등록번호', '주소', '연락처', '가족사항'].forEach(function (w) {
    assert.ok(line.indexOf(w) >= 0, '★★ 「' + w + '」를 막는 말이 없습니다');
  });
  assert.ok(line.indexOf('pairs') >= 0, '★★ pairs 를 막는 말이 없습니다');
  NEW.forEach(function (k) {
    assert.ok(line.indexOf(k) >= 0, '★ 「' + k + '」가 그 줄에 안 걸려 있습니다');
  });
});

/* ── ③ 판독이 넷을 «가릴 수» 있게 ── */

test('★★ 물음의 «종류 목록»에 넷이 들어 있다 — 없으면 form·other 로 굳는다', () => {
  const list = (/kind 는 다음 중 하나입니다:([^']*)/.exec(read) || [])[1];
  assert.ok(list, '★ 종류 목록을 못 찾았습니다');
  NEW.forEach(function (k) {
    assert.ok(list.indexOf(k + '(') >= 0,
      '★★ 「' + k + '」가 종류 목록에 없습니다 — 판독이 못 가려 form 이나 other 로 굳습니다');
  });
});

test('★ 헷갈리는 짝을 «갈라» 준다 — 위임장/위임계약서 · 신분증/등본', () => {
  /* 「위임계약서」는 contract 다(약정 조항이 줄줄이 있다). 안 가르면 서로 먹는다 */
  const list = (/kind 는 다음 중 하나입니다:([^']*)/.exec(read) || [])[1];
  assert.match(list, /위임계약서.*contract/,
    '★ 위임장과 위임계약서를 안 갈라 주면 서로 잘못 잡습니다');
  assert.match(list, /idcard\(신분증[^)]*주민등록증/, '★ 신분증에 무엇이 드는지 안 적었습니다');
  assert.match(list, /resident\(주민등록 서류[^)]*등본/, '★ 등본류에 무엇이 드는지 안 적었습니다');
});

/* ── ④ 화면에 이름이 나온다 ── */

test('★★ 넷에 «이름표»가 있다 — 없으면 화면에 「알 수 없음」으로 뜬다', () => {
  /* 2026-08-15 에 contract 가 이 병으로 「알 수 없음」이었다 */
  const m = /const READ_LABEL = \{([\s\S]*?)\};/.exec(app);
  assert.ok(m, '★ 이름표 목록을 못 찾았습니다');
  const labels = m[1];
  const want = { idcard: '신분증', resident: '주민등록 서류', mandate: '위임장', consent: '개인정보 동의서' };
  Object.keys(want).forEach(function (k) {
    assert.ok(labels.indexOf(k + ':') >= 0,
      '★★ 「' + k + '」 이름표가 없습니다 — 화면에 「알 수 없음」으로 뜹니다');
    assert.ok(labels.indexOf(want[k]) >= 0, '★ 「' + k + '」 이름이 다릅니다');
  });
});

/* ── ⑤ 캐시 번호 ── */

test('★★ 민감 목록이 든 층은 «모든 앱»이 같은 판을 쓴다', () => {
  /* ⚠ 한 앱만 옛 번호로 두면 그 앱은 옛 목록을 쓴다 — 신분증을 「민감 아님」으로
     다루게 된다. 사진을 담는 앱이 사진첩 하나가 아니다(정부컨설팅도 담는다). */
  const files = fs.readdirSync(R).filter(function (f) { return /\.html$/.test(f); });
  [['js/pu-photo-store.js', 21], ['js/pu-doc-read.js', 28]].forEach(function (b) {
    const seen = {};
    files.forEach(function (f) {
      const s = fs.readFileSync(path.join(R, f), 'utf8');
      const re = new RegExp(b[0].replace(/[.\/]/g, '\\$&') + '\\?v=(\\d+)', 'g');
      let m;
      while ((m = re.exec(s))) (seen[m[1]] = seen[m[1]] || []).push(f);
    });
    const vers = Object.keys(seen);
    assert.equal(vers.length, 1,
      '★★ ' + b[0] + ' 의 캐시 번호가 앱마다 다릅니다: ' +
      vers.map(function (v) { return v + '(' + seen[v].join('·') + ')'; }).join(' / ') +
      '\n  낮은 쪽 앱은 «옛 민감 목록»을 씁니다.');
    assert.ok(Number(vers[0]) >= b[1],
      '★★ ' + b[0] + ' 을 고쳤는데 캐시 번호가 ' + vers[0] + ' 입니다 — 올려 주세요');
  });
});
