'use strict';
/* 화면이 «켜지자마자» 죽는 사고를 막는다 — 2026-08-17 사진첩 백지 사고

   ■ 무엇이 있었나

   가림(주민번호) 코드를 넣으면서 `let photoMask` 을 파일 **아래쪽**(9200줄대)에 두고,
   **시작 코드**(1860줄대)에서 값을 먼저 넣었다. `let`·`const` 는 `var` 와 달리
   **끌어올려지지 않는다**(TDZ) — 선언 줄에 닿기 전에 건드리면 그 자리에서
   스크립트가 통째로 멈춘다.

     Uncaught ReferenceError: Cannot access 'photoMask' before initialization

   화면이 **백지**가 됐다. 사진첩이 통째로 안 열렸다.

   ■ 왜 검사 4,500건이 못 잡았나

   검사들은 함수를 **하나씩 뽑아** 돌린다. 그래서 함수 안의 잘못은 잘 잡지만,
   **파일을 위에서 아래로 한 번 읽는 것**은 아무도 안 하고 있었다. 이 사고는
   함수가 아니라 **차례**의 문제라 그 방식으로는 영영 안 잡힌다.

   ■ 이 검사가 보는 것

   맨 바깥에서 **곧바로 값을 넣는 줄**(`이름 = …`)이, 그 이름의 `let`/`const` 선언보다
   **앞에** 있는지 본다. 그것이 이번에 죽은 바로 그 모양이다.

   ⚠ 일부러 좁게 잡았다. 「선언 앞에서 이름이 보이나」로 넓게 잡았더니, 나중에 불릴
     콜백 안의 이름(`addEventListener(…, function(){ x = 1 })`)까지 물어 **옳은 코드를
     막았다**. 넓은 그물은 사람이 검사를 꺼 버리게 만든다 — 좁고 확실한 것이 낫다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const R = path.join(__dirname, '..');
const FILES = ['pu-photos.html', 'pu-paydata.html', 'pu-cards.html', 'pu-erp.html', 'kcareer.html'];

/* 직접 쓴 <script> 안의 글자만 모은다(src= 로 불러오는 것은 따로 실린다). */
function inlineScripts(src) {
  const out = [];
  const re = /<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(src))) out.push(m[1]);
  return out;
}

/* 주석과 글자열을 지운다 — 주석에 적힌 이름·문자열 속 이름에 속지 않게.
   ⚠ 여기서 «줄 수»는 그대로 두어야 한다(줄 번호로 앞뒤를 가린다). */
function strip(s) {
  return s
    .replace(/\/\*[\s\S]*?\*\//g, function (t) { return t.replace(/[^\n]/g, ' '); })
    .replace(/(^|[^:'"\w])\/\/[^\n]*/g, '$1')
    .replace(/'(?:\\.|[^'\\\n])*'/g, "''")
    .replace(/"(?:\\.|[^"\\\n])*"/g, '""')
    .replace(/`(?:\\.|[^`\\])*`/g, function (t) { return t.replace(/[^\n]/g, ' '); });
}

test('★ 화면이 켜지자마자 죽는 자리가 없다 (let/const 를 선언 전에 쓰지 않는다)', () => {
  const bad = [];

  FILES.forEach(function (f) {
    const p = path.join(R, f);
    if (!fs.existsSync(p)) return;
    inlineScripts(fs.readFileSync(p, 'utf8')).forEach(function (raw, si) {
      const lines = strip(raw).split('\n');

      /* ① 맨 바깥에서 let/const 로 선언한 이름과 그 줄 번호 */
      const declared = {};
      lines.forEach(function (t, i) {
        const m = t.match(/^(?:let|const)\s+([A-Za-z_$][\w$]*)/);
        if (m && !(m[1] in declared)) declared[m[1]] = i;
      });

      /* ② 맨 바깥에서 **곧바로 값을 넣는 줄**이 선언보다 앞에 있는가.
         `이름 = …` 만 본다 — `이름 == `·`이름 => ` 같은 것은 아니다. */
      lines.forEach(function (t, i) {
        if (/^\s/.test(t)) return;                     // 들여쓴 줄 = 함수 안 → 나중에 돈다
        const m = t.match(/^([A-Za-z_$][\w$]*)\s*=(?!=|>)/);
        if (!m) return;
        const name = m[1];
        if (!(name in declared)) return;               // let/const 로 선언한 것이 아니다
        if (declared[name] <= i) return;               // 선언이 먼저다 — 괜찮다
        bad.push(f + ' script#' + (si + 1) + ' 줄 ' + (i + 1) + ': 「' + name +
          '」 에 값을 넣는데 선언은 줄 ' + (declared[name] + 1) + ' 에 있습니다\n      ' +
          t.trim().slice(0, 90));
      });
    });
  });

  assert.deepEqual(bad, [],
    '켤 때 «Cannot access … before initialization» 으로 화면이 통째로 백지가 됩니다.\n' +
    'let/const 는 끌어올려지지 않습니다 — 시작 코드에서 쓰는 값은 시작 코드보다 위에서 선언하세요.\n\n' +
    bad.join('\n'));
});
