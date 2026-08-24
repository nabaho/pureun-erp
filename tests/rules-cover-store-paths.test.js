'use strict';
/* 규칙이 «저장 층이 쓰는 자리»를 다 덮고 있는가 (대표 보고 2026-08-24)

   ■ 왜 있나
   「분류 삭제」가 `PERMISSION_DENIED` 로 막혔다. 까닭은 분류 이름표를 쓰는 자리
   (`puphotos/kindLabels` · `puphotos/kindHidden`)가 **실시간DB 규칙에 아예 없었다**는
   것이다. `puphotos` 최상위는 열려 있지 않으니 자리를 안 적으면 조용히 거부된다.

   저장 층에는 그 경고가 이미 적혀 있었다(retentionPath 옆: "이 칸은 규칙에 따로 적어야
   한다 … 안 적으면 조용히 거부된다 — 건의함이 그래서 통째로 막혔다 2026-08-07").
   **같은 실수를 세 번째로 했다.** 사람이 기억하는 것으로는 안 되므로 검사로 못박는다.

   ■ 무엇을 보나
   저장 층이 `DB_ROOT + '/xxx'` 로 쓰는 자리 이름을 모아, 붙여넣기용 규칙 파일의
   `puphotos` 밑에 그 자리가 있는지 본다. 없으면 여기서 큰 소리가 난다.

   ⚠ 규칙은 **파이어베이스 콘솔이 진짜**다. 이 검사는 「붙여넣을 파일이 맞게 준비됐나」를
     보는 것이고, 콘솔에 실제로 붙였는지는 검사할 길이 없다 — 그것은 사람이 한다.
     그래서 실패 문구에 「콘솔에 붙여넣었는지 확인」을 함께 적는다.

   실행: node --test tests/*.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const R = path.join(__dirname, '..');
const RULES = path.join(R, 'docs', 'firebase-rules-현재적용본+분류이름표(붙여넣기용).json');

/* `DB_ROOT + '/xxx'` 에서 xxx 를 모은다 */
function rootsUsedBy(file, varName) {
  const s = fs.readFileSync(path.join(R, file), 'utf8');
  const re = new RegExp(varName + " \\+ '/([A-Za-z_]+)", 'g');
  const out = {};
  let m;
  while ((m = re.exec(s))) out[m[1]] = true;
  return Object.keys(out).sort();
}

/* ⚠ 쓰지 «않는» 자리는 뺀다.
   · items — newId() 가 `ref(DB_ROOT+'/items').push().key` 로 **번호만 만든다.**
     push().key 는 이 기기에서 계산되고 서버로 아무것도 안 보내므로 규칙이 필요 없다. */
const NO_RULE_NEEDED = { items: '번호만 만든다(push().key) — 서버로 안 보낸다' };

test('★ 붙여넣기용 규칙 파일이 JSON 으로 읽힌다 — 콘솔이 먼저 보는 것이다', () => {
  assert.ok(fs.existsSync(RULES), '붙여넣기용 규칙 파일이 없습니다: ' + RULES);
  const j = JSON.parse(fs.readFileSync(RULES, 'utf8'));
  assert.ok(j.rules, '최상위에 rules 가 없습니다');
});

test('★ 사진첩 저장 층이 쓰는 자리가 규칙에 하나도 안 빠졌다', () => {
  const j = JSON.parse(fs.readFileSync(RULES, 'utf8'));
  const ph = j.rules.puphotos;
  assert.ok(ph, 'puphotos 규칙이 없습니다');
  const used = rootsUsedBy('js/pu-photo-store.js', 'DB_ROOT');
  assert.ok(used.length >= 5, '저장 층에서 자리를 찾지 못했습니다: ' + used.join(','));
  const missing = used.filter(k => !NO_RULE_NEEDED[k] && !ph[k]);
  assert.deepEqual(missing, [],
    '★ 규칙에 없는 자리가 있습니다: ' + missing.join(', ') + '\n' +
    'puphotos 최상위는 열려 있지 않으므로 이 자리는 **조용히 거부**됩니다.\n' +
    '  ① 위 붙여넣기용 파일의 puphotos 밑에 그 자리를 더하고\n' +
    '  ② 파이어베이스 콘솔 → Realtime Database → 규칙에 **실제로 붙여넣었는지** 확인하세요.\n' +
    '  (2026-08-07 건의함 · 2026-08-24 분류 이름표가 같은 까닭으로 막혔습니다)');
});

test('★ 「분류 삭제」가 막힌 그 두 자리가 들어 있다', () => {
  const ph = JSON.parse(fs.readFileSync(RULES, 'utf8')).rules.puphotos;
  ['kindLabels', 'kindHidden'].forEach(k => {
    assert.ok(ph[k], k + ' 자리가 없습니다 — 「분류 삭제」가 다시 막힙니다');
    /* 이름표는 전 직원이 함께 본다 — 읽기를 관리자만으로 잠그면 남의 화면에서
       탭 이름이 원래 이름으로 되돌아간다. */
    assert.match(ph[k]['.read'], /auth != null/, k + ' 읽기 조건이 없습니다');
    assert.ok(!/isAdmin/.test(ph[k]['.read']),
      '★ ' + k + ' 읽기를 관리자만으로 잠그면 직원 화면에서 탭 이름표가 안 보입니다');
    /* 쓰기는 총괄 관리자만 — 앱도 그렇게 막고 있다(deps.isAdmin). 한쪽만 막으면
       콘솔에서 직접 부르는 길이 열린다. */
    assert.match(ph[k]['.write'], /isAdmin/,
      '★ ' + k + ' 쓰기를 아무에게나 열면 직원이 전 직원의 탭 이름을 바꿉니다');
  });
});

test('★ 앱이 쓰는 잠금과 규칙의 잠금이 같은 쪽을 본다 — 한쪽만 막으면 뚫린다', () => {
  const store = fs.readFileSync(path.join(R, 'js', 'pu-photo-store.js'), 'utf8');
  ['renameFixedKind', 'setKindHidden'].forEach(fn => {
    const i = store.indexOf('function ' + fn + '(');
    assert.ok(i > 0, fn + ' 을 찾지 못했습니다');
    assert.match(store.slice(i, i + 260), /if \(!deps\.isAdmin\)/,
      '★ ' + fn + ' 이 앱에서 관리자를 안 봅니다 — 규칙만 막으면 화면이 영어 오류를 냅니다');
  });
});

test('★ 명함첩 메일함 자리도 규칙에 있다 — 브라우저가 읽는 자리다', () => {
  /* functions/mail-sync.js 는 서버(Admin SDK)라 규칙을 안 본다. 그런데
     pu-cards.html 의 메일함은 **브라우저에서** 읽으므로 규칙이 있어야 한다.
     저장소에 준비돼 있었는데 콘솔에는 없었다(2026-08-24 대조에서 드러남). */
  const cards = fs.readFileSync(path.join(R, 'pu-cards.html'), 'utf8');
  const m = cards.match(/const MB_ROOT = '([^']+)'/);
  assert.ok(m, '명함첩의 메일함 뿌리를 찾지 못했습니다');
  const j = JSON.parse(fs.readFileSync(RULES, 'utf8'));
  assert.ok(j.rules[m[1]], '★ 「' + m[1] + '」 규칙이 없습니다 — 메일함이 브라우저에서 안 읽힙니다');
  /* 거울이다 — 브라우저는 읽기만, 쓰기는 서버가 한다(mail-mirror 설계) */
  assert.equal(j.rules[m[1]]['.write'], false,
    '★ 메일함은 다음메일을 비추는 거울입니다 — 브라우저가 직접 쓰면 거울이 어긋납니다');
});

test('규칙 파일이 스스로 어디에 붙이는 것인지 밝힌다 — 저장소 파일로 배포하면 안 된다', () => {
  /* 규칙은 콘솔이 진짜다. 저장소 파일로 통째 덮어 배포해 사진첩·성과확인이 막힌 적이 있다. */
  const guide = path.join(R, 'docs', 'firebase-rules-분류이름표-추가(붙여넣기용).json');
  assert.ok(fs.existsSync(guide), '넣는 법을 적은 파일이 없습니다');
  assert.match(JSON.stringify(JSON.parse(fs.readFileSync(guide, 'utf8'))), /콘솔/);
});
