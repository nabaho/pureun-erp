'use strict';
/* 화면 단추가 «없는 함수»를 부르지 않는다 — 실행: node --test tests/*.test.js

   무엇이 문제였나 (2026-08-24): 주소록을 만들면서 closePanel() 을 불렀는데 이 저장소에
   그런 함수가 없었다. 이 파일에는 묶는 도구(bundler)도 검사기(linter)도 없어서,
   onclick 안의 이름은 **누가 실제로 누를 때까지** 아무도 틀렸다고 말해 주지 않는다.
   검사 5,520개가 전부 통과한 채로 「고른 N명 넣기」가 조용히 죽어 있었다.

   ★ 여기서 못 박는 것
     onclick·onchange·oninput 따위에서 «맨 이름으로» 부르는 함수는 모두 이 파일에
     정의돼 있어야 한다. 없으면 그 단추는 눌러도 아무 일이 안 일어난다.

   ⚠ 이 검사가 걸리면 대개 «오타»이거나 «함수 이름이 바뀐 것»이다.
     정말 밖에서 오는 것이라면(브라우저가 주는 것 등) 아래 KNOWN 에 적고 왜인지 남긴다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.join(__dirname, '..', 'pu-cards.html'), 'utf8').replace(/\r\n/g, '\n');

/* 자바스크립트 낱말 — 함수가 아니다 */
const KEYWORD = new Set(['if','for','while','switch','return','function','typeof','new',
  'catch','else','try','do','delete','void','in','of','await','yield']);

/* 밖에서 오는 것들. 여기 적을 때는 «왜 이 파일에 없는지»를 함께 남긴다. */
const KNOWN = new Set([
  /* 브라우저가 주는 것 */
  'alert','confirm','prompt','setTimeout','parseInt','parseFloat','fetch','open','print',
  'Number','String','Boolean','Date','Object','JSON','Math','Array',
  /* 다른 파일(js/pu-*.js)이 넣어 주는 것 */
  'toast','render'
]);

function definedNames(){
  const out = new Set();
  /* function 선언 */
  for (const m of src.matchAll(/(?:^|\n)\s*(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g)) out.add(m[1]);
  /* const/let/var 로 담은 것 (화살표 함수 포함) */
  for (const m of src.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/g)) out.add(m[1]);
  /* window.X = ... — 팝업이 기다리는 답을 넘길 때 쓰는 방식(dupPick) */
  for (const m of src.matchAll(/window\.([A-Za-z_$][\w$]*)\s*=/g)) out.add(m[1]);
  return out;
}

/* 「x.foo(」 처럼 앞에 점이 붙은 것은 함수가 아니라 «어떤 것의 기능»이라 뺀다. */
function barecalls(code){
  const out = [];
  for (const m of code.matchAll(/(^|[^\w$.])([A-Za-z_$][\w$]*)\s*\(/g)) out.push(m[2]);
  return out;
}

test('★ 화면 단추가 부르는 함수는 모두 이 파일에 있다', () => {
  const have = definedNames();
  const missing = new Map();
  let handlers = 0;
  for (const m of src.matchAll(/on(?:click|change|input|keyup|keydown|mouseup|mousedown|submit|focus|blur)="([^"]*)"/g)) {
    handlers++;
    for (const n of barecalls(m[1])) {
      if (KEYWORD.has(n) || KNOWN.has(n) || have.has(n)) continue;
      missing.set(n, (missing.get(n) || 0) + 1);
    }
  }
  /* 검사가 «실제로 보고 있는지» 먼저 확인한다 — 정규식이 어긋나 0곳을 보고도 통과할 수 있다 */
  assert.ok(handlers > 300, '손잡이를 ' + handlers + '개만 찾았다 — 찾는 방식이 어긋났다');
  const lines = [...missing].map(([k, v]) => k + ' (' + v + '곳)').join(', ');
  assert.equal(missing.size, 0,
    '★ 없는 함수를 부르는 단추가 있다 — 눌러도 아무 일이 안 일어난다: ' + lines);
});

test('메일 쓰기 화면의 단추는 특히 하나하나 확인한다', () => {
  /* 매일 쓰는 화면이고, 조용히 죽으면 「보냈다」고 착각한다 */
  const have = definedNames();
  for (const n of ['sendCompose','saveDraft','previewMail','openAddrBook','abToggle',
                   'addrBookAdd','edCmd','edFontSize','edMode','edSyncBar','toggleAtt',
                   'insertSign','editSign','toggleSchedule','setSchedule','closeMailPage',
                   /* 2026-08-30: toggleMailDrawer 는 자료 서랍과 함께 없앴다 */
                   'addLocalFiles','dropAttach','dropLocalFile',
                   'setComposeFlag','toggleBcc',
                   /* 2026-08-24: 찾기 칸을 다시 그리지 않게 바꿨다 — focusAbQ·focusMsQ 는
                      더 이상 필요 없어 지웠고(안 건드리니 초점을 다시 잡을 일이 없다),
                      대신 목록만 바꾸는 길이 생겼다. */
                   'abType','msType','addrBookListHtml','addrBookBtnHtml','mySignListHtml']) {
    assert.ok(have.has(n), n + ' 이 없다 — 메일 화면의 단추 하나가 죽어 있다');
  }
});
