'use strict';
/* 세무사무실을 손으로 다시 치지 않는다 — 대표 지시 2026-08-31

   「세무사무실 회계사무실 담당자 정보도 자동으로 당겨오게 기업정보함에서
     찾을 수 있게 해달라」

   업체가 206곳이고 한 세무사무실이 여러 사업장을 맡는다. 그래서 같은 이름을
   여러 번 손으로 치게 되는데, 한 곳만 오타가 나면 그 사무실이 둘로 갈라진다.
   ⚠ 보수총액 일괄요청은 «이메일로 묶는다»(buildTaxGroups) — 갈라지면 메일이 두 번 간다.
     그래서 이 자동완성은 편의가 아니라 «그 사고를 막는 장치»다.

   후보가 두 곳에서 온다 —
     ① 기업정보함 명함
     ② 이미 다른 업체에 적어 둔 세무사무실 (명함이 없어도 골라 쓸 수 있다)

   이 검사가 못 박는 것 —
     ① 두 곳에서 모으고, 같은 사무실이면 «한 줄»로 합친다
     ② 많이 쓰이는 사무실이 위로 온다
     ③ 명함에 없는 칸을 「이미 적어 둔 업체」에서 메운다
     ④ 채울 때 이미 적어 둔 칸은 «덮어쓰지 않는다»
     ⑤ 이메일이 없으면 «고르기 전에» 알린다 (일괄요청에서 빠지므로)
     ⑥ 사람 이름으로 찾는 길(단추)도 함께 있고, 그 창은 사업장이 아니라
        «세무사무실 이름»으로 먼저 찾는다

   실행: node --test tests/*.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { cutFn } = require('./cut-fn.js');

const R = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(R, 'pu-erp.html'), 'utf8').replace(/\r\n/g, '\n');
/* ⚠ 주석을 먼저 걷는다 — 설명글이 검사를 통과시키면 안 된다 */
const bare = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

/* ── 고르개를 실제로 돌려 본다 ── */
const ctx = { window: {} };
vm.createContext(ctx);
vm.runInContext(
  cutFn(src, 'function taxOfficeFromCard(') + '\n'
  + cutFn(src, 'function taxOfficeSuggest(') + '\n'
  + 'this.suggest = taxOfficeSuggest; this.fromCard = taxOfficeFromCard;', ctx);
const { suggest, fromCard } = ctx;

/* 기업정보함 색인 흉내 — c 회사, n 이름, ct 회사전화, e 이메일, k 종류 */
function setIdx(rows){ ctx.window.pucardsIdx = rows; }

test('★★ 두 곳에서 모은다 — 명함과 «이미 적어 둔 업체»', () => {
  setIdx({ a: { c: '한재정세무회계', n: '한재전', ct: '041-555-3355', e: 'h@sema.kr' } });
  const cos = [{ taxOfficeName: '대흥세무회계', taxContact: '이상호', taxEmail: 'd@dh.kr' }];
  const got = suggest('세무', cos);
  /* ⚠ vm 안에서 만든 배열은 바깥 배열과 deepEqual 이 안 맞는다(다른 realm).
       글자로 맞춘다 — 2026-08-30 에 같은 자리에서 두 번 헛걸음했다. */
  const names = Array.from(got, (x) => x.office).sort().join(' · ');
  assert.equal(names, '대흥세무회계 · 한재정세무회계',
    '★★ 한쪽만 보면, 명함 없는 사무실은 영영 손으로 쳐야 합니다');
});

test('★★ 같은 사무실은 «한 줄»로 합친다 — 두 줄이면 어느 쪽을 고를지 모른다', () => {
  setIdx({ a: { c: '한재정세무회계', n: '한재전', ct: '041-555-3355' } });
  const cos = [{ taxOfficeName: '한재정세무회계', taxEmail: 'h@sema.kr' },
    { taxOfficeName: '한재정세무회계', taxEmail: 'h@sema.kr' }];
  const got = suggest('한재정', cos);
  assert.equal(got.length, 1, '★★ 같은 사무실이 여러 줄로 갈라졌습니다');
  /* 명함에 없던 이메일을 «적어 둔 업체»에서 메운다 — 합치는 값이 여기 있다 */
  assert.equal(got[0].email, 'h@sema.kr',
    '★ 합쳐 놓고 빈칸을 안 메우면, 합친 뜻이 없습니다');
  assert.equal(got[0].n, 2, '★ 몇 곳에 쓰이는지 안 세면 자주 쓰는 것을 위로 못 올립니다');
});

test('★ 많이 쓰이는 사무실이 위로 온다', () => {
  setIdx({});
  const cos = [{ taxOfficeName: '가세무회계' },
    { taxOfficeName: '나세무회계' }, { taxOfficeName: '나세무회계' }, { taxOfficeName: '나세무회계' }];
  const got = suggest('세무', cos);
  assert.equal(got[0].office, '나세무회계',
    '★ 자주 쓰는 것이 위에 없으면, 매번 눈으로 찾아야 합니다');
});

test('★★ 사람 이름으로는 «사무실 이름 칸»을 흔들지 않는다', () => {
  /* 이 칸은 사무실 «이름» 칸이다. 사람 이름까지 맞히면 엉뚱한 회사가 올라온다.
     사람으로 찾고 싶으면 옆의 단추가 있다. */
  setIdx({ a: { c: '천안과일도매센터', n: '세무진', ct: '041-1111-2222' } });
  assert.equal(suggest('세무', []).length, 0,
    '★★ 사람 이름에 「세무」가 들었다고 그 회사가 세무사무실이 되지 않습니다');
});

test('★ 두 글자 미만으로는 안 찾는다 — 한 글자에 206곳이 다 뜨면 못 쓴다', () => {
  setIdx({});
  const cos = [{ taxOfficeName: '가세무회계' }];
  assert.equal(suggest('가', cos).length, 0);
  assert.equal(suggest('', cos).length, 0);
});

test('★ 색인이 아직 안 왔어도 «적어 둔 업체»는 나온다 — 조용히 죽지 않는다', () => {
  delete ctx.window.pucardsIdx;
  const got = suggest('세무', [{ taxOfficeName: '대흥세무회계' }]);
  assert.equal(got.length, 1,
    '★ 기업정보함을 아직 안 열었다고 아무것도 못 고르면, 기능이 반쪽입니다');
});

test('★ 명함 한 장에서 다섯 칸을 뽑는다 — 사무실 전화가 휴대폰보다 먼저', () => {
  const t = fromCard({ c: '한재정세무회계', n: '한재전',
    m: '010-1111-2222', ct: '041-555-3355', cfx: '041-555-3356', e: 'h@sema.kr' });
  assert.equal(t.office, '한재정세무회계');
  assert.equal(t.contact, '한재전');
  assert.equal(t.phone, '041-555-3355', '★ 세무사무실은 개인 휴대폰보다 사무실 번호로 겁니다');
  assert.equal(t.fax, '041-555-3356');
  assert.equal(t.email, 'h@sema.kr');
});

/* ══════ 화면 쪽 ══════ */

test('★★ 채울 때 이미 적어 둔 칸은 덮어쓰지 않는다', () => {
  const body = bare(cutFn(src, '  function fillTaxOffice('));
  ['taxContact', 'taxPhone', 'taxFax', 'taxEmail'].forEach(function (k) {
    assert.match(body, new RegExp('!String\\(nx\\.' + k + " \\|\\| ''\\)\\.trim\\(\\)"),
      '★★ ' + k + ' 를 덮어씁니다 — 손으로 고쳐 둔 것이 말없이 바뀌면 안 됩니다');
  });
  /* 사무실 «이름»만은 덮어쓴다 — 그것을 고르러 온 것이다(대표자 이름과 같은 결) */
  assert.match(body, /if\(t\.office\) nx\.taxOfficeName = t\.office;/,
    '★ 고르러 온 사무실 이름이 안 들어가면 고른 뜻이 없습니다');
  /* 무엇을 채웠고 무엇이 없었는지 말해 준다 */
  assert.match(body, /showToast\(/, '★ 말없이 채우면 「채웠겠지」 하고 빈 채로 저장됩니다');
});

test('★★ 이메일이 없으면 «고르기 전에» 알린다 — 일괄요청에서 통째로 빠진다', () => {
  const at = src.indexOf('taxHits.map(function(t, i){');
  assert.ok(at > 0, '후보 줄을 그리는 자리를 못 찾았습니다');
  const row = bare(src.slice(at, at + 1800));
  assert.match(row, /!t\.email \?/,
    '★★ 이메일 없는 후보를 그냥 보여 주면, 고르고 나서야 빠진 것을 압니다');
  assert.match(row, /일괄요청/,
    '★ 「왜」 문제인지 안 적으면, 경고를 봐도 무엇을 해야 할지 모릅니다');
  /* 어디서 온 후보인지 — 「업체 N곳에 이미 있음」이면 명함이 없어도 믿고 고른다 */
  assert.match(row, /t\.n > 0 \?/, '★ 몇 곳에 쓰이는지 안 보이면 믿을 근거가 없습니다');
});

test('★★ 고르기는 onMouseDown 이다 — onClick 이면 목록이 먼저 닫혀 허공을 친다', () => {
  const at = src.indexOf('taxHits.map(function(t, i){');
  const row = bare(src.slice(at, at + 1800));
  assert.match(row, /onMouseDown:function\(e\)\{ e\.preventDefault\(\); fillTaxOffice\(t\)/,
    '★★ onClick 으로 두면 칸이 흐려지며 목록이 닫혀 클릭이 안 먹습니다');
});

test('★ 사람 이름으로 찾는 길도 있고, 그 창은 «사무실 이름»으로 먼저 찾는다', () => {
  const modal = bare(src.slice(src.indexOf('function CompanyEditModal(props){'),
    src.indexOf('function CompanyEditModal(props){') + 60000));
  assert.match(modal, /setPcPickMode\('tax'\)/, '★ 사람 이름으로 찾을 길이 없습니다');
  /* ⚠ 사업장 이름으로 먼저 찾으면 안 된다 — 찾는 것은 그 사업장이 아니라 세무사무실이다 */
  assert.match(modal, /pcPickMode === 'tax' \? \(f\.taxOfficeName \|\| ''\)/,
    '★★ 세무사무실을 찾는데 «사업장 이름»으로 먼저 찾으면, 엉뚱한 결과만 나옵니다');
  assert.match(modal, /if\(pcPickMode === 'tax'\) fillTaxOffice\(taxOfficeFromCard\(p\)\)/,
    '★ 골라도 채워지지 않으면 창을 연 뜻이 없습니다');
});
