'use strict';
// 느린 화면 이름표 · 부팅 낭비 두 가지 — node --test tests/erp-boot-nameplate.test.js
//
// 왜: 여는 데 0.5~0.9초 멈춤이 세 번 남아 있는데, 어느 화면 때문인지 코드만 봐서는 알 수 없다.
//     추측으로 세 번 틀린 적이 있어(LCS 0.25초 → 실제 2.2초), 이번에는 이름을 찍게 하고
//     그 이름을 보고 고친다. 맨 앞의 타이머 이름표(🐌)가 그렇게 진짜 원인을 찾아 줬다.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const app = fs.readFileSync(path.join(__dirname, '..', 'pu-erp.html'), 'utf8').replace(/\r\n/g, '\n');

function grab(name){
  const i = app.indexOf('function ' + name + '(');
  assert.ok(i >= 0, name + ' 를 찾지 못했다');
  let d = 0, j = i;
  for(;;j++){ if(app[j] === '{') d++; else if(app[j] === '}'){ d--; if(!d){ j++; break; } } }
  return app.slice(i, j);
}

/* ── 이름표 ── */
test('0.2초 넘게 걸린 화면은 이름이 찍힌다', () => {
  const s = grab('pageSkin');
  assert.match(s, /if\(d >= 200\) console\.warn\('🐌 느린 화면 「' \+ name \+ '」 — ' \+ Math\.round\(d\) \+ 'ms 걸림'\)/);
});

test('★ 감싼 것을 매번 새로 만들지 않는다 (상태가 날아간다)', () => {
  // 그릴 때마다 새 함수를 주면 preact 가 «다른 화면»으로 보고 고른 달·펼친 줄을 다 버린다
  const s = grab('pageSkin');
  assert.match(s, /if\(_pgSkin\[name\]\) return _pgSkin\[name\];/);
  assert.match(s, /_pgSkin\[name\] = W;/);
  assert.match(app, /var _pgSkin = \{\};/);
});

test('재는 것이 화면을 바꾸지 않는다', () => {
  const s = grab('pageSkin');
  assert.match(s, /try \{ return Comp\(p\); \}/, '결과를 그대로 돌려준다');
  assert.match(s, /finally \{/, '터져도 재는 것 때문에 막히지 않는다');
  assert.match(s, /if\(!window\.performance \|\| !performance\.now\) return Comp\(p\);/, '못 재는 브라우저는 그냥 지나간다');
});

test('화면 고르는 긴 if 줄은 한 줄도 안 건드렸다', () => {
  // type 만 갈아 끼우므로 40줄짜리 분기를 손댈 필요가 없다
  assert.match(app, /if\(mainContent && typeof mainContent\.type === 'function'\)\{\s*\n\s*mainContent = h\(pageSkin\(mainContent\.type, title\), mainContent\.props\);/);
});

test('이름은 메뉴 이름을 그대로 쓴다', () => {
  // 따로 이름을 적어 두면 메뉴가 바뀔 때 어긋난다
  const i = app.indexOf("var title = '시작 화면';");
  const j = app.indexOf('mainContent = h(pageSkin(');
  assert.ok(i > 0 && i < j, 'title 이 먼저 정해져 있어야 한다');
});

test('여는 데 몇 초 걸렸는지 한 번만 찍는다', () => {
  const b = grab('bootDone');
  assert.match(b, /if\(_bootSaid \|\| !_bootT0\) return;/);
  assert.match(b, /_bootSaid = true;/);
  assert.match(b, /⏱ 첫 화면까지 /);
  assert.match(app, /useEffect\(function\(\)\{ bootDone\(\); \}, \[\]\);/, '화면이 다 그려진 뒤에 찍어야 한다');
});

/* ── 부팅 낭비 ① 깃발 없이 매번 도는 이관 ── */
test('채울 관리번호가 없으면 일찍 빠진다', () => {
  const m = grab('migrateCaseNoFillIfMissing');
  assert.match(m, /if\(!_miss\) return 0;/);
  // 빠지는 판단이 훑기·새 배열 만들기보다 «앞»에 있어야 뜻이 있다
  assert.ok(m.indexOf('if(!_miss) return 0;') < m.indexOf('var types = getCaseTypes();'));
  assert.ok(m.indexOf('if(!_miss) return 0;') < m.indexOf('cases.map('));
});

test('★ 깃발로 아예 끄지는 않는다', () => {
  // 관리번호 없는 사건이 나중에 생기면 다시 채워야 한다 — 하는 일은 그대로다
  const m = grab('migrateCaseNoFillIfMissing');
  assert.ok(m.indexOf('localStorage.getItem') < 0, '한 번 하고 끝낼 이관이 아니다');
  assert.match(m, /if\(changed > 0\) dbSet\('cases', updated\);/);
  assert.match(m, /return changed;/);
});

test('실제로 일찍 빠지는지 돌려 본다', () => {
  const box = {
    dbGet: (k, d) => box._cases,
    getCaseTypes: () => { box._typesCalled = true; return []; },
    todayYMD: () => '2026-08-13',
    dbSet: (k, v) => { box._saved = v; },
    Object, String, parseInt, Array,
  };
  vm.createContext(box);
  vm.runInContext(grab('migrateCaseNoFillIfMissing') + '\nthis.f = migrateCaseNoFillIfMissing;', box);

  box._cases = [{ caseNo:'부해-2026-001' }, { caseNo:'부해-2026-002' }];
  box._typesCalled = false;
  assert.equal(box.f(), 0);
  assert.equal(box._typesCalled, false, '다 차 있으면 훑지도 않는다');
  assert.equal(box._saved, undefined, '저장도 안 한다');

  box._cases = [{ caseNo:'부해-2026-001' }, { typeCode:'x', receiveDate:'2026-05-01' }];
  box._typesCalled = false;
  assert.equal(box.f(), 1, '빠진 것이 있으면 채운다');
  assert.equal(box._typesCalled, true);
  assert.ok(box._saved, '채웠으면 저장한다');
});

/* ── 부팅 낭비 ② 저장소 전체를 화면 뜨는 길에서 글자로 만들기 ── */
test('NAS 자동 백업을 화면 뜨는 길에서 비켜 놓았다', () => {
  const i = app.indexOf("var AUTO_KEY = 'pureun_v6_nas_auto_backup'");
  const blk = app.slice(i, i + 3400);
  assert.match(blk, /if\(window\.requestIdleCallback\) requestIdleCallback\(_run, \{ timeout:15000 \}\);/);
  assert.match(blk, /else setTimeout\(_run, 3000\);/, '없는 브라우저도 화면 먼저');
  // 무거운 일이 _run 안에 들어가 있어야 뜻이 있다
  const run = blk.slice(blk.indexOf('var _run = function(){'));
  assert.match(run, /JSON\.stringify\(data, null, 2\)/);
  assert.match(run, /for\(var i=0;i<localStorage\.length;i\+\+\)/);
});

test('설정이 없으면 여전히 아무것도 안 한다', () => {
  const i = app.indexOf("var AUTO_KEY = 'pureun_v6_nas_auto_backup'");
  const blk = app.slice(i, i + 3400);
  assert.match(blk, /if\(!cfg\.user \|\| !cfg\.pass \|\| !cfg\.host\) return;/);
  assert.match(blk, /if\(lastStr && \(now - parseInt\(lastStr,10\)\) < WEEK_MS\) return;/);
  // 일찍 빠지는 두 검사는 «미루기 전»에 있어야 한다 — 미룬 뒤에 걸러 봐야 늦다
  assert.ok(blk.indexOf('if(!cfg.user') < blk.indexOf('var _run = function(){'));
  assert.ok(blk.indexOf('< WEEK_MS) return;') < blk.indexOf('var _run = function(){'));
});

/* ── 다른 이관은 그대로 ── */
test('나머지 이관은 「끝났다」 깃발을 그대로 쓴다', () => {
  ['migrateClosedArchiveOnce', 'migrateFixDuplicateNos', 'migrateHosungCons001',
   'migrateAddAdvisoryCompanies_v1', 'migrateFillContractFee_v1', 'migrateReorderConsultings_v1']
    .forEach(function(f){
      assert.match(grab(f), /localStorage\.getItem\(/, f + ' 는 깃발이 있어야 한다');
    });
});
