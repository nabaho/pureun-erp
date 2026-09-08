/* 대표 캡처 두 건 (2026-08-26)

   ① 「화면에는 사업자등록번호가 보이는데 «읽지 못했다»고 한다」
      판독 표는 pairs(문서 차례 그대로)를 그리고, 「기업 상세로 보내기」는 이름 붙은
      칸(fields.bizno)을 본다. AI 가 pairs 에만 담고 이름 붙은 칸을 비워 두면
      **사람 눈에는 있는 값이 프로그램에는 없다** — 화면이 스스로 모순된 말을 한다.
      실사례: 「4·4 제도 도입기업 선정 신청서」(성진테크 204-81-33738).
      운영 데이터 확인 — 서식 25장 가운데 5장이 그 꼴이었다.
      ⚠ 다시 판독해서 고치지 «않는다» — 판 번호를 올리면 읽어 둔 사진 수백 장이
        다시 읽히고 그것이 그대로 요금이다. 읽어 온 자리에서 되메운다.

   ② 「사진첩에 들어가면 같은 사진이 계속 다시 열린다」
      pu-photos.html?photo=…&year=…&owner=… 로 한 번 들어오면 **주소에 그 표시가
      그대로 남았다.** 새로고침·뒤로/앞으로·판 올림에 따른 다시 열기·시작화면 지정·
      즐겨찾기 — 들어올 때마다 같은 사진이 다시 열렸다.
      카메라(cam)·공유(share) 표시는 이미 주소에서 지우고 있었다. 같은 규칙으로 맞춘다. */

'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const R = path.join(__dirname, '..');
const READER = fs.readFileSync(path.join(R, 'js', 'pu-doc-read.js'), 'utf8');
const APP = fs.readFileSync(path.join(R, 'pu-photos.html'), 'utf8');

function loadReader() {
  const ctx = { console, Promise, Object, Array, JSON, String, Number, Math, Date, RegExp, Error,
    isFinite, parseInt, parseFloat, setTimeout, clearTimeout };
  ctx.window = ctx; ctx.globalThis = ctx; ctx.self = ctx;
  vm.createContext(ctx);
  vm.runInContext(READER, ctx);
  return ctx.PuDocRead;
}

/* 대표 캡처 그대로 — 이름 붙은 칸에는 사업자번호가 없고 pairs 에만 있다 */
function capturedForm() {
  return {
    kind: 'form',
    bizNoOk: undefined,
    fields: {
      docName: '4·4 제도 도입기업 선정 신청서',
      pairs: [
        { k: '기업명', v: '(주)성진테크' },
        { k: '대표자', v: '이종석' },
        { k: '사업자등록번호', v: '204-81-33738' },
        { k: '주소', v: '경기도 안산시 단원구 산단로 325, 102호' },
        { k: '업종', v: '제조업' },
        { k: '업태', v: '기계부품' },
        { k: '설립일', v: '2002년 07월 15일' },
        { k: '상시근로자수', v: '2명' },
        { k: '연락처', v: '010-1200-0006' },
        { k: '이메일', v: 'cust18@gmail.com' }
      ]
    }
  };
}

/* ── ① 되메우기 ── */

test('★ pairs 에만 있던 사업자번호가 이름 붙은 칸으로 온다 — 화면과 프로그램이 같은 말을 한다', () => {
  const D = loadReader();
  const read = capturedForm();
  const filled = D.healRead(read);
  assert.ok(filled.indexOf('bizno') >= 0, '★ 사업자번호를 못 옮겼습니다: ' + filled.join(','));
  assert.equal(read.fields.bizno, '204-81-33738', '번호 모양이 어긋납니다: ' + read.fields.bizno);
  assert.equal(read.fields.company, '(주)성진테크');
  assert.equal(read.fields.ceo, '이종석');
  assert.equal(read.fields.bizType, '기계부품', '업태를 종목으로 뒤바꿔 담았습니다');
  assert.equal(read.fields.bizItem, '제조업', '업종을 업태로 뒤바꿔 담았습니다');
});

test('★ 되메운 사업자번호도 검산을 받는다 — 검산 없이 통과시키면 안 된다', () => {
  /* 「기계 검증 통과분만 자동 입력」이 이 저장소의 규칙이다. 되메웠다고
     그 규칙을 건너뛰면 AI 가 흐린 자리를 메운 번호가 조용히 흘러간다. */
  const D = loadReader();
  const ok = capturedForm();
  D.healRead(ok);
  assert.equal(ok.bizNoOk, D.bizNoValid('204-81-33738'), '검산을 안 돌렸습니다');

  const bad = capturedForm();
  bad.fields.pairs[2].v = '204-81-33739';        // 끝자리만 틀린 번호
  D.healRead(bad);
  assert.equal(bad.bizNoOk, false, '★ 틀린 번호가 검산을 통과했습니다');
});

test('★ 이미 담긴 값은 덮지 않는다 — AI 가 다듬어 둔 값이 더 나을 수 있다', () => {
  const D = loadReader();
  const read = capturedForm();
  read.fields.company = '주식회사 성진테크';
  read.fields.bizno = '111-11-11111';
  read.bizNoOk = true;                            // 국세청 조회까지 거친 값일 수 있다
  D.healRead(read);
  assert.equal(read.fields.company, '주식회사 성진테크', '★ 이미 있던 회사명을 덮었습니다');
  assert.equal(read.fields.bizno, '111-11-11111', '★ 이미 있던 사업자번호를 덮었습니다');
  assert.equal(read.bizNoOk, true, '★ 원래 있던 번호의 판정을 건드렸습니다');
});

test('꾸밈이 붙은 칸 이름도 알아본다 — 문서마다 표기가 다르다', () => {
  const D = loadReader();
  const read = { kind: 'form', fields: { pairs: [
    { k: '업태(대표)', v: '제조업' },
    { k: '업종(대표)', v: '기타 기계 및 장비 제조업' },
    { k: '주소(지역)', v: '충청남도 천안시' },
    { k: '상시 근로자수', v: '12' },
    { k: '전화번호', v: '041-414-9950' }
  ] } };
  D.healRead(read);
  assert.equal(read.fields.bizType, '제조업');
  assert.equal(read.fields.bizItem, '기타 기계 및 장비 제조업');
  assert.equal(read.fields.address, '충청남도 천안시');
  assert.equal(read.fields.workers, '12');
  assert.equal(read.fields.companyTel, '041-414-9950');
});

test('「-」는 «없음»이지 값이 아니다', () => {
  /* 실제 문서에 이렇게 적힌다(캡처2 의 「주생산품 -」·「홈페이지 -」). */
  const D = loadReader();
  const read = { kind: 'form', fields: { pairs: [
    { k: '주생산품', v: '-' }, { k: '홈페이지', v: '-' }
  ] } };
  D.healRead(read);
  assert.equal(read.fields.product, undefined, '「-」를 값으로 담았습니다');
  assert.equal(read.fields.homepage, undefined);
});

/* ⚠ vm 안에서 만든 배열은 밖의 배열과 «다른 종류»라 deepEqual 이 튕긴다.
   알맹이만 견주려고 글자로 이어 붙인다(이 저장소의 다른 검사와 같은 방식). */
const joined = (a) => Array.prototype.join.call(a || [], ',');

test('★ 명함에는 이 표를 안 쓴다 — 칸 이름이 달라 엉뚱한 자리에 들어간다', () => {
  const D = loadReader();
  const read = { kind: 'card', fields: { pairs: [{ k: '회사명', v: '가나상사' }] } };
  const filled = D.healRead(read);
  assert.equal(joined(filled), '', '명함까지 되메웠습니다: ' + joined(filled));
  assert.equal(read.fields.company, undefined, '명함의 이름 붙은 칸을 건드렸습니다');
});

test('읽다 실패한 것·pairs 가 없는 것은 그냥 둔다', () => {
  const D = loadReader();
  assert.equal(joined(D.healRead(null)), '');
  assert.equal(joined(D.healRead({ kind: 'form', error: '오류',
    fields: { pairs: [{ k: '기업명', v: 'x' }] } })), '', '읽다 실패한 것을 되메웠습니다');
  assert.equal(joined(D.healRead({ kind: 'form', fields: {} })), '');
});

test('★ 새로 읽을 때도 같은 되메우기가 걸린다 — 앞으로 들어오는 것에도', () => {
  /* 되메우기를 「이미 읽어 둔 것」에만 걸면 내일 올린 서식이 또 같은 꼴이 된다. */
  const src = READER;
  const i = src.indexOf('function afterRead(');
  assert.ok(i > 0, 'afterRead 를 못 찾았습니다');
  const body = src.slice(i, src.indexOf('\n  }', i));
  assert.match(body, /fillFromPairs\(kind, fields\)/, '★ 새로 읽는 길에는 되메우기가 없습니다');
  const fill = body.indexOf('fillFromPairs');
  const check = body.indexOf("kind === 'form'");
  assert.ok(check > fill, '★ 검산보다 뒤에 되메우면 되메운 번호는 검산을 못 받습니다');
});

test('★ 사진첩이 목록을 실을 때 되메우기를 실제로 건다', () => {
  /* ⚠ 2026-08-31: 목록을 만드는 자리가 «둘»이 될 뻔했다(최신본 · 기기에 담아 둔 씨앗).
     그때 되메우기가 씨앗 쪽에만 빠지면 「보이는데 못 보낸다」가 씨앗 화면에서만
     되살아난다. 그래서 만드는 손을 itemsToGrid 하나로 모았다 — 여기서 그것을 본다. */
  const i = APP.indexOf('function itemsToGrid(');
  const j = APP.indexOf('return out;', i);
  assert.ok(i > 0 && j > i, '목록 싣는 자리를 못 찾았습니다');
  const seg = APP.slice(i, j);
  assert.match(seg, /PuDocRead\.healRead\(/,
    '★ 읽어 둔 서식의 모순(보이는데 못 보낸다)이 그대로 남습니다');
  assert.match(seg, /catch/, '되메우기가 넘어지면 목록이 통째로 안 보입니다');
});

test('★★ 목록을 만드는 손이 «하나»다 — 두 벌이면 씨앗 화면에서만 모순이 되살아난다', () => {
  const made = (APP.match(/Object\.keys\(items\)\.map\(id => \(\{/g) || []).length;
  assert.equal(made, 1,
    '★★ 목록을 만드는 자리가 ' + made + '곳입니다 — 되메우기·정렬이 한쪽에만 들어갑니다');
  /* 씨앗도 최신본도 그 손을 쓴다 */
  assert.match(APP, /gridItems = itemsToGrid\(items, keepThumb\)/, '최신본이 그 손을 안 씁니다');
  assert.match(APP, /gridItems = itemsToGrid\(items, null\)/, '씨앗이 그 손을 안 씁니다');
});

/* ── ② 주소에 남은 사진 표시 ── */

function runGoPhoto(href) {
  const cut = function (name) {
    const i = APP.indexOf('function ' + name + '(');
    assert.ok(i >= 0, name + ' 를 못 찾았습니다');
    let d = 0;
    for (let k = APP.indexOf('{', i); k < APP.length; k++) {
      if (APP[k] === '{') d++;
      else if (APP[k] === '}') { d--; if (!d) return APP.slice(i, k + 1); }
    }
    throw new Error(name + ' 의 끝을 못 찾았습니다');
  };
  const state = { url: href, pushed: 0 };
  const ctx = {
    URL, URLSearchParams, String, Object, console,
    location: { get href() { return state.url; }, get search() { return new URL(state.url).search; } },
    history: { replaceState: function (a, b, to) { state.pushed++; state.url = new URL(to, state.url).href; } },
    firebase: { auth: function () { return { currentUser: { uid: 'ME' } }; } },
    gridYear: '2026', gridOwner: null
  };
  vm.createContext(ctx);
  vm.runInContext(cut('clearAskedPhotoUrl') + '\n' + cut('readAskedPhoto') + '\n' + cut('goPhotoIfAsked')
    + '\nvar _askedPhoto = null;', ctx);
  const asked = ctx.goPhotoIfAsked();
  /* state 를 그대로 돌려준다 — 뒤에 한 번 더 불러 보는 검사가 있어서,
     그때 값이 굳어 있으면 아무것도 못 본다. */
  return { asked: asked, url: state.url, ctx: ctx, pushed: state.pushed, state: state };
}

test('★ 한 번 열고 나면 주소에서 사진 표시를 걷어낸다 — 안 그러면 들어올 때마다 또 열린다', () => {
  const r = runGoPhoto('https://x/pu-photos.html?photo=-P-abc&year=2026&owner=U9&v=d1943422');
  assert.equal(r.asked, true, '사진 표시를 못 읽었습니다');
  assert.ok(r.url.indexOf('photo=') < 0, '★ 주소에 photo 가 그대로 남았습니다: ' + r.url);
  assert.ok(r.url.indexOf('year=') < 0, '★ year 가 남았습니다: ' + r.url);
  assert.ok(r.url.indexOf('owner=') < 0, '★ owner 가 남았습니다: ' + r.url);
  assert.ok(r.url.indexOf('v=d1943422') > 0, '판 번호(v)까지 지우면 캐시가 안 깨집니다: ' + r.url);
  /* 지웠어도 이번 한 번은 열어야 한다 — 기억에 이미 담았다 */
  assert.equal(r.ctx._askedPhoto.id, '-P-abc');
  assert.equal(r.ctx.gridYear, '2026');
  assert.equal(r.ctx.gridOwner, 'U9', '남의 사진이면 그 사람 목록을 불러야 합니다');
});

test('내 사진이면 남의 목록으로 가지 않는다', () => {
  const r = runGoPhoto('https://x/pu-photos.html?photo=-P-abc&year=2026&owner=ME');
  assert.equal(r.ctx.gridOwner, null);
});

test('사진 표시가 없으면 주소를 건드리지 않는다', () => {
  const before = 'https://x/pu-photos.html?v=7';   // 판 번호는 아무 값이어도 된다
  const r = runGoPhoto(before);
  assert.equal(r.asked, false);
  assert.equal(r.pushed, 0, '고칠 것이 없는데 주소를 다시 썼습니다');
  assert.equal(r.url, before, '들어온 주소가 그대로여야 합니다');

  /* 걷어내는 함수를 «직접» 불러도 마찬가지다 — 지울 것이 없으면 주소를 다시 쓰지 않는다.
     헛되이 다시 쓰면 뒤로 가기 기록이 어긋나고, 다른 곳에서 부를 때 남의 주소를 건드린다. */
  r.ctx.clearAskedPhotoUrl();
  assert.equal(r.state.pushed, 0, '지울 것이 없는데 주소를 다시 썼습니다');
  assert.equal(r.state.url, before);
});

test('★ 카메라·공유와 같은 규칙이다 — 쓰고 난 표시는 주소에서 지운다', () => {
  /* 셋 중 하나만 안 지우면 그 하나가 되풀이된다. 한 벌로 지킨다. */
  [['share', 'clearShareFlag'], ['cam', 'openCamIfAsked'], ['photo', 'clearAskedPhotoUrl']]
    .forEach(function (pair) {
      const i = APP.indexOf('function ' + pair[1] + '(');
      assert.ok(i > 0, pair[1] + ' 를 못 찾았습니다');
      const seg = APP.slice(i, i + 2200);
      assert.match(seg, new RegExp("searchParams\\.delete|delete\\('" + pair[0] + "'"),
        '★ ' + pair[0] + ' 표시를 주소에서 안 지웁니다 — 들어올 때마다 되풀이됩니다');
      assert.match(seg, /history\.replaceState/, '★ ' + pair[1] + ' 가 주소를 안 고칩니다');
    });
});
