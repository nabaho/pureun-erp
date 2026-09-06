'use strict';
/* 급여대장 가져오기 — 모르는 직위를 «지어내지» 않는다.
   실행: node --test tests/*.test.js

   대표 지시 2026-09-06: 「고쳐라」
   (앞선 물음: 「퇴사자들 중에 직급이나 직책 또는 노무사 여부도 모두 연결이 되어 있는데
    퇴사자들 자동으로 당겨오게 할 수 있나?」)

   ── 무엇이 잘못돼 있었나 ──────────────────────────────────────────
   급여대장에서 퇴사자를 새로 만들 때 직위를 «무조건 「직원」»으로 박아 넣었다.
   명부에 직위 칸이 있어도 읽지 않았다. 그 값은 그대로 경력증명서의
   「직명 및 직위」에 찍힌다 — 노무사였던 분이 «직원»으로 증명되어 나간다.
   실측(2026-09-06): 이 길로 들어온 기록 15명 중 10명은 나중에 사람이 노무사로
   고쳐 두었다. 곧 «고치는 일»이 사람 몫으로 남아 있었다는 뜻이다.

   ── 이 검사가 못 박는 것 ──────────────────────────────────────────
     ① 명부에 직위 칸이 있으면 «읽는다»
     ② 없으면 «빈칸으로 둔다» — 「직원」을 지어내지 않는다
     ③ 이미 있는 사람의 직위는 «덮지 않는다»(여기 값이 명부보다 최신일 수 있다)
     ④ 직위 없이 들어온 사람 수를 «세어서 말한다» — 조용히 넘어가지 않는다
     ⑤ 빈 직위가 화면에 「이름 ()」로 나오지 않는다                                   */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { cutFn } = require('./cut-fn.js');

const R = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(R, 'pu-erp.html'), 'utf8').replace(/\r\n/g, '\n');
const bare = src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
const FN = cutFn(src, 'function importPayrollStaff(e)');

/* ══════ ① 명부의 직위 칸을 읽는다 ══════ */

test('★★ 명부에 직위·직급·직책 칸이 있으면 읽는다', () => {
  assert.match(FN, /var cTitle\s*=\s*col\(\[[^\]]*'직위'[^\]]*\]\)/,
    '★★ 직위 칸을 아예 안 찾습니다 — 명부에 적혀 있어도 버립니다');
  const 열 = FN.match(/col\(\[([^\]]*)\]\)/g) || [];
  const 직위열 = 열.filter(function(x){ return /직위|직급|직책/.test(x); })[0] || '';
  ['직위', '직급', '직책'].forEach(function(w){
    assert.ok(직위열.indexOf(w) >= 0, '★ 「' + w + '」 이름도 함께 찾아야 합니다');
  });
  assert.match(FN, /var titleTxt\s*=\s*cTitle\s*>=\s*0/,
    '★ 찾기만 하고 줄에서 값을 안 꺼냅니다');
});

/* ══════ ② 없으면 지어내지 않는다 ══════ */

test('★★ 「직원」을 지어 넣지 않는다 — 새 기록의 직위는 명부에서 온 값뿐이다', () => {
  assert.doesNotMatch(FN, /title\s*:\s*'직원'/,
    '★★ 직위를 「직원」으로 지어 넣습니다. 노무사였던 분이 경력증명서에 '
    + '직원으로 찍혀 나갑니다 — 밖으로 나가는 문서입니다');
  assert.match(FN, /sid:'A-'[^\n]*name:nm,\s*title:titleTxt/,
    '★★ 새 기록의 직위가 명부 값(titleTxt)이 아닙니다');
});

test('★ 직위를 못 찾았다는 사실을 기록에 남긴다', () => {
  assert.match(FN, /titleTxt \? '' : ' · 직위 미확인\(명부에 없음\)'/,
    '★ 나중에 「왜 비어 있지」를 알 길이 없습니다 — 메모에 까닭을 남기십시오');
});

/* ══════ ③ 이미 있는 사람은 덮지 않는다 ══════ */

test('★★ 이미 적혀 있는 직위를 명부가 덮지 않는다', () => {
  assert.match(FN, /if\(titleTxt && !String\(hit\.title\|\|''\)\.trim\(\)\)\{ hit\.title=titleTxt;/,
    '★★ 빈칸일 때만 채워야 합니다 — 여기 값이 명부보다 최신일 수 있습니다');
  /* 덮어쓰기 금지는 이 가져오기 전체의 규칙이다 — 입사일·주민번호도 같다 */
  assert.match(FN, /if\(hire && !hit\.hireDate\)/, '★ 입사일 덮어쓰기 금지가 사라졌습니다');
  assert.match(FN, /if\(rrn && !hit\.rrn\)/, '★ 주민번호 덮어쓰기 금지가 사라졌습니다');
});

/* ══════ ④ 조용히 넘어가지 않는다 ══════ */

test('★★ 직위 없이 들어온 사람 수를 세어서 말한다', () => {
  assert.match(FN, /noTitle\s*=\s*0/, '★★ 세지 않습니다');
  assert.match(FN, /if\(!titleTxt\) noTitle\+\+;/, '★★ 새로 넣을 때 안 셉니다');
  const 알림 = FN.slice(FN.indexOf('showToast(\'📥'));
  assert.match(알림, /noTitle/,
    '★★ 알림에 안 나옵니다 — 경력증명서를 뽑을 때에야 「직명 및 직위: -」로 알게 됩니다');
  assert.match(알림, /인사기록/, '★ 어디서 고치는지 알려 줘야 합니다');
});

/* ══════ ⑤ 빈 직위가 화면에서 「이름 ()」로 안 보인다 ══════ */

test('★★ 직위가 비어도 「이름 ()」로 그리지 않는다', () => {
  const at = src.indexOf('function staffPickLabel(u){');
  assert.ok(at > 0, '★★ 이름표를 만드는 곳이 없습니다');
  const ctx = {}; vm.createContext(ctx);
  new vm.Script(src.slice(at, src.indexOf('\n}', at) + 2)
    + '\nthis.staffPickLabel = staffPickLabel;').runInContext(ctx);
  const L = ctx.staffPickLabel;
  assert.equal(L({ name: '홍길동', title: '노무사' }), '홍길동 (노무사)');
  assert.equal(L({ name: '홍길동', title: '' }), '홍길동 (직위 미입력)',
    '★★ 「홍길동 ()」로 나오면 빈칸인지 고장인지 모릅니다');
  assert.equal(L({ name: '홍길동' }), '홍길동 (직위 미입력)');
  assert.equal(L({ name: '홍길동', title: '   ' }), '홍길동 (직위 미입력)',
    '빈칸만 든 값은 «없는 것»으로 본다');
  assert.equal(L(null), '');
});

test('★★ 사람 고르는 칸들이 모두 그 이름표를 쓴다 — 한 곳만 고치면 되게', () => {
  assert.equal(/\+' \('\+[xu]\.title\+'\)'/.test(bare), false,
    '★★ 직위를 손으로 이어 붙이는 자리가 남아 있습니다 — 거기만 「이름 ()」가 됩니다');
  const 쓰는곳 = (bare.match(/staffPickLabel\(/g) || []).length;
  assert.ok(쓰는곳 >= 6,
    '★ 이름표를 쓰는 곳이 ' + 쓰는곳 + '군데뿐입니다 (만드는 곳 1 + 쓰는 곳 5 이상)');
});
