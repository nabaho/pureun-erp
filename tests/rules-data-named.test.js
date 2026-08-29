'use strict';
/* data/ 아래 자리는 «이름이 있어야 한다» (대표 보고 2026-08-29)
   ═══════════════════════════════════════════════════════════════════════════
   ■ 무엇이 문제였나
     규칙의 data 칸 끝에는 이런 줄이 있다:
        $other: { '.read': LOGIN, '.write': LOGIN }
     이름이 안 적힌 자리는 «모두» 여기로 떨어져 **재직 직원 누구나 읽고 쓴다.**
     부모(data)의 읽기는 fin 뿐인데, 자식이 더 열어 주는 것이라 그대로 열린다
     (규칙은 위에서 아래로 «허용»이 흐르고, 자식이 부모를 좁히지 못한다).

     그래서 열한 자리가 «이름 없이» 열려 있었다 — 거래처 원장 · 계약 기록 ·
     컨설팅(금액 포함) · 근무시간 · 포털 공용 설정 · 옛 건의 원문까지.
     열려 있는 것 자체가 잘못이라는 말이 아니다. **무엇이 열려 있는지 셀 수 없던 것**이
     잘못이다 — $other 는 「깜빡 잊은 자리」와 「일부러 연 자리」를 똑같이 대접한다.

   ★ 여기서 못 박는 것
     앱이 쓰는 data 자리는 «규칙에 이름이 있어야 한다».
     새 자리를 만들면 이 검사가 걸리고, 만든 사람이 그때 권한을 정하게 된다.
   실행: node --test tests/rules-data-named.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');

const R = path.join(__dirname, '..');
const data = JSON.parse(
  fs.readFileSync(path.join(R, 'docs', 'firebase-rules-전체-적용본.json'), 'utf8')).rules.data;

/* 앱이 실제로 쓰는 data 자리를 소스에서 긁어 온다 */
function usedPaths(){
  const files = cp.execSync('git ls-files "*.html" "js/*.js" "functions/*.js"',
    { cwd: R, encoding: 'utf8' }).split('\n').filter(Boolean);
  const found = new Map();
  const re = /['"`]data\/([A-Za-z_][A-Za-z0-9_]*)/g;
  for (const f of files){
    let s; try { s = fs.readFileSync(path.join(R, f), 'utf8'); } catch (e) { continue; }
    let m;
    while ((m = re.exec(s))){
      if (!found.has(m[1])) found.set(m[1], []);
      const a = found.get(m[1]);
      if (a.length < 3 && !a.includes(f)) a.push(f);
    }
  }
  return found;
}

test('★ 앱이 쓰는 data 자리는 «모두» 규칙에 이름이 있다', () => {
  const named = new Set(Object.keys(data).filter(k => !k.startsWith('.') && k !== '$other'));
  const used = usedPaths();
  const orphan = [...used.keys()].filter(k => !named.has(k)).sort();
  assert.deepEqual(orphan, [],
    '★ 이름 없는 data 자리가 있습니다 — $other 로 떨어져 «재직 직원 누구나 읽고 씁니다».\n'
    + '   새 자리를 만들 때는 scripts/make-firebase-rules.js 의 rules.data 에\n'
    + '   권한을 정해 이름을 적으십시오. 지금 이름이 없는 자리:\n'
    + orphan.map(k => '     data/' + k + '  ← ' + used.get(k).join(', ')).join('\n'));
});

test('★ $other 가 사라지지 않았다 — 사라지면 이름 없는 자리가 «조용히 막힌다»', () => {
  /* 이름 없는 자리를 막는 것이 더 안전해 보이지만, 그러면 어느 날 갑자기 어떤 화면이
     저장을 못 하게 되고 «아무 말도 안 나온다». 막을 때는 무엇이 막히는지 알고 막아야 한다. */
  assert.ok(data.$other, '$other 가 없어졌습니다 — 이름 없는 자리가 말없이 막힙니다');
  assert.ok(data.$other['.read'] && data.$other['.write'], '$other 의 조건이 비었습니다');
});

test('규칙 파일과 만들개가 같다 — 손으로 고치면 다음 만들 때 지워진다', () => {
  /* 이 검사는 tests/firebase-rules-apply.test.js 가 자세히 한다. 여기서는 «이름 적은 것이
     만들개에서 나왔는지»만 짚어, 적용본만 손으로 고치는 일을 막는다. */
  const gen = fs.readFileSync(path.join(R, 'scripts', 'make-firebase-rules.js'), 'utf8');
  ['companies', 'contracts', 'consultings', 'presence_hours', 'app_config',
   'portal_prefs_uid', 'suggestions'].forEach(k => {
    assert.match(gen, new RegExp('\\n\\s*' + k + ':\\s*\\{'),
      '★ ' + k + ' 이 만들개에 없습니다 — 적용본만 손으로 고치면 다음 만들 때 사라집니다');
  });
});
