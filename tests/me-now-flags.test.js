/* _meNow() 가 «가리개가 보는 표»를 빠짐없이 넘기는가 (2026-08-30)
 *
 * ■ 무슨 일이 있었나
 *   「📱 하나문자 ▾」 메뉴(휴대폰 연결·문자 가져오기·PC 에서 붙여넣기)가
 *   `_meNow().isOwner` 로 가려져 있는데, `_meNow()` 가 isOwner 를 «안 넘겼다».
 *   그래서 undefined → 조용히 false → 메뉴가 «아무에게도» 안 보였다.
 *   대표: 「들어온것 표시도 안되고」. 폰이 막혔을 때 손으로 넣는 길까지 함께 사라졌다.
 *
 * ★ undefined 는 소리 없이 false 처럼 군다 — 그래서 아무도 못 알아챈다.
 *   앞선 사람은 「대표 계정의 role 이 admin 이 아닌가 보다」로 넘겼다.
 *
 * ⚠ 그러니 «가리개가 보는 표»는 «_meNow 가 넘기는 표» 안에 반드시 있어야 한다.
 *   이 검사는 그 둘을 맞춰 본다 — 새 표를 가리개에 쓰면 그 자리에서 걸린다.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ERP = fs.readFileSync(path.join(__dirname, '..', 'pu-erp.html'), 'utf8');
function bare(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}

/* ── 실제로 돌려 본다 ── */
function meNow(user) {
  const at = ERP.indexOf('  function _meNow(){');
  assert.ok(at > 0, '_meNow 를 못 찾음');
  let d = 0, end = -1;
  for (let k = ERP.indexOf('{', at + 18); k < ERP.length; k++) {
    if (ERP[k] === '{') d++;
    else if (ERP[k] === '}') { d--; if (d === 0) { end = k + 1; break; } }
  }
  const ctx = { CURRENT_USER: user };
  vm.createContext(ctx);
  vm.runInContext(ERP.slice(at, end) + '\nvar __out = _meNow();', ctx);
  return ctx.__out;
}

const OWNER = { sid:'P-001', name:'권형하', role:'admin', title:'대표노무사',
                isAdmin:true, isOwner:true, isSubAdmin:false };

test('★★ 대표에게 isOwner 가 «참»으로 간다 — 이것이 하나문자 메뉴의 가리개다', () => {
  assert.strictEqual(meNow(OWNER).isOwner, true,
    '★★ 이 값이 안 가면 「문자 가져오기」와 「PC 붙여넣기」가 아무에게도 안 보인다');
});

test('★★ 대표가 «아니면» 거짓이다 — 넓혀서 아무나 보이게 하면 안 된다', () => {
  const staff = { sid:'A-003', name:'김보람', role:'staff', isAdmin:false, isOwner:false };
  assert.strictEqual(meNow(staff).isOwner, false,
    '★★ 휴대폰 연결·문자 가져오기는 대표만이라는 것이 2026-08-26 지시다');
  assert.strictEqual(meNow(staff).isAdmin, false);
});

test('★ 값이 아예 없어도 «참으로 새지» 않는다', () => {
  [{}, { isOwner: 'yes' }, { isOwner: 1 }, undefined].forEach(function (u) {
    assert.strictEqual(meNow(u || {}).isOwner, false,
      '★ 아무 값이나 참으로 받으면 가리개가 뚫린다');
  });
});

test('★★ «가리개가 보는 표»는 모두 _meNow 가 넘긴다 — 하나라도 빠지면 그 화면이 사라진다', () => {
  const src = bare(ERP);
  /* _meNow().xxx 로 읽는 이름을 모두 모은다 */
  const used = new Set();
  const re = /_meNow\(\)\.([A-Za-z_$][\w$]*)/g;
  let m;
  while ((m = re.exec(src))) used.add(m[1]);
  assert.ok(used.size > 0, '★ _meNow 를 쓰는 곳을 못 찾음');

  const given = meNow(OWNER);
  const missing = [];
  used.forEach((k) => { if (!(k in given)) missing.push(k); });
  assert.deepStrictEqual(missing, [],
    '★★ 화면이 _meNow().' + missing.join(' · ') + ' 를 보는데 _meNow 가 그 표를 안 넘깁니다.\n'
    + '   undefined 는 조용히 false 처럼 굴어서, 그 화면이 «아무에게도» 안 보이게 됩니다.\n'
    + '   실제로 「📱 하나문자」 메뉴가 그렇게 사라져 있었습니다.');
});

test('★★ 하나문자 메뉴가 «그 가리개»로 가려져 있다 — 셋을 여는 길이 여기뿐이다', () => {
  const src = bare(ERP);
  assert.ok(/_meNow\(\)\.isOwner\s*&&/.test(src),
    '★ 가리개가 사라졌다 — 넓히려면 대표 지시가 있어야 한다(2026-08-26)');
  ['startHanaSmsPair()', 'importHanaSms()', 'setPasteOpen(true)'].forEach(function (f) {
    assert.ok(src.indexOf(f) >= 0, '★ 「' + f + '」 를 여는 길이 없다');
  });
});
