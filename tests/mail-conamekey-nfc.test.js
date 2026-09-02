'use strict';
/* 업체 이름 맞추기 — «풀어 쓴 한글»(NFD)도 맞춘다 (2026-09-02 검토)
   ═══════════════════════════════════════════════════════════════════════════
   ★ 무엇이었나 — 같은 판단을 두 곳에서 «다르게» 하고 있었다.
     앱(js/pu-co-thread.js norm)에는 normalize('NFC') 가 있고,
     서버(functions/mail-receive.js coNameKey)에는 없었다.

   ★ 왜 문제인가 — 맥·아이폰에서 온 글은 한글이 «풀어 쓴» 꼴로 온다.
     「병원」이 ㅂ+ㅕ+ㅇ+ㅇ+ㅜ+ㅏ+ㄴ 처럼 낱개로 실려 온다는 뜻이다.
     눈으로는 같은 글자인데 컴퓨터에게는 다른 글이라 «안 맞는다».

   ⚠ 솔직히 적어 둘 것 — 실측 2026-09-02 로는 결과가 바뀌는 것이 «0통»이었다.
     메일 7,539통 가운데 풀어 쓴 제목이 4통뿐이고, 그 4통이 가리키는 업체가
     명단에 없었다. 그러니 이것은 «지금 새는 것을 막는» 고침이 아니다.
     ★ 그래도 넣는 까닭은 둘이다 —
       ① 두 곳이 갈라져 있으면 언젠가 한쪽만 고치고 지나간다
       ② 맥·아이폰에서 오는 자료는 늘고 있다. 그때는 조용히 안 맞는다.

   ★ 여기서 못 박는 것 — 앱과 서버가 «같은 답»을 낸다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const ROOT = path.join(__dirname, '..');
const MR = require(path.join(ROOT, 'functions', 'mail-receive.js'));

/* 모아 쓴 이름 · 풀어 쓴 이름 */
const 모아 = '아이본병원';
const 풀어 = 모아.normalize('NFD');
const 명단 = [{ id: 'c1', name: 모아 }];

test('★★ 풀어 쓴 제목에서도 업체를 찾는다', () => {
  assert.notEqual(풀어, 모아, '이 검사가 뜻이 있으려면 두 글이 달라야 합니다');
  const 제목 = '26.4.14_김나연_' + 풀어 + '.pdf';
  const hit = MR.coFromText(제목, 명단);
  assert.ok(hit, '★ 풀어 쓴 이름을 못 찾습니다 — 맥·아이폰에서 온 자료가 조용히 안 붙습니다');
  assert.equal(hit.id, 'c1');
});

test('★ 이름 쪽이 풀어 써 있어도 찾는다 — 어느 쪽이 풀어 써 있을지 모른다', () => {
  const 제목 = '급여대장 ' + 모아 + ' 8월.xlsx';
  const hit = MR.coFromText(제목, [{ id: 'c2', name: 풀어 }]);
  assert.ok(hit, '★ 명단 쪽이 풀어 써 있으면 못 찾습니다');
  assert.equal(hit.id, 'c2');
});

test('★★ 모아 쓴 것끼리는 «예전과 똑같이» 찾는다 — 고치면서 잃은 것이 없어야 한다', () => {
  const hit = MR.coFromText('급여대장 ' + 모아 + ' 8월.xlsx', 명단);
  assert.ok(hit && hit.id === 'c1', '★ 멀쩡했던 것이 깨졌습니다');
  assert.equal(MR.coFromText('아무 상관 없는 제목', 명단), null, '★ 없는 것을 찾아냅니다');
});

test('★★ 두 곳이 «같은 답»을 낸다 — 앱과 서버가 갈라지지 않는다', () => {
  /* 앱 쪽 규칙(js/pu-co-thread.js norm)을 그대로 떼어 와 견준다.
     ⚠ 글자를 옮겨 적지 않는다 — 파일에서 «읽어» 쓴다. 옮겨 적으면 그 사본이 또 낡는다. */
  const 앱소스 = fs.readFileSync(path.join(ROOT, 'js', 'pu-co-thread.js'), 'utf8');
  const i = 앱소스.indexOf('function norm(');
  assert.ok(i > 0, '앱 쪽 norm 을 찾지 못했습니다');
  const 끝 = 앱소스.indexOf('\n  }', i) + 4;
  const 앱norm = new Function(앱소스.slice(i, 끝) + '; return norm;')();

  for (const 글 of [모아, 풀어, '(주)' + 모아, '주식회사 ' + 모아, '아이본 병원',
                    '26.4.14_김나연_' + 풀어 + '.pdf']) {
    assert.equal(앱norm(글), MR.coNameKey ? MR.coNameKey(글) : 앱norm(글),
      '★ 앱과 서버가 다른 답을 냅니다: ' + JSON.stringify(글));
  }
});

test('★ 서버도 그 규칙을 «내놓는다» — 밖에서 견줄 수 있어야 갈라짐을 잡는다', () => {
  assert.equal(typeof MR.coNameKey, 'function',
    '★ coNameKey 를 안 내놓습니다 — 위 검사가 두 곳을 견줄 수 없습니다');
});
