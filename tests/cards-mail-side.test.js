/* 자료함은 메일 갈래 안에 산다 — 자료는 메일에 붙여 보내려고 두는 것이다.
   옆줄(사이드바)이 'mail' 일 때만 메일 모양이면, 「🗂 자료함 관리」를 누르는 순간
   view 가 'mat' 이 되면서 옆줄이 명함으로 뚝 떨어진다. 자료를 만지러 들어갔는데
   명함첩에 와 있게 된다(대표 지시 2026-08-12). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'pu-cards.html'), 'utf8');

test('옆줄은 자료함(mat)에서도 메일 모양을 지킨다', () => {
  const m = /const onMail = \(([^)]*)\)/.exec(source);
  assert.ok(m, 'onMail 판정을 찾지 못했습니다');
  assert.match(m[1], /view===['"]mail['"]/);
  assert.match(m[1], /view===['"]mat['"]/, "자료함에 들어가면 옆줄이 명함으로 떨어진다");
});

test('메일 옆줄은 명함 폴더를 그리기 전에 끝낸다', () => {
  /* if(onMail){ … return; } 가 명함 폴더 그리기보다 앞에 있어야 한다 —
     뒤에 있으면 메일 갈래인데 명함 폴더까지 함께 그려진다.
     ⚠ 파일 전체에서 찾으면 안 된다. 「전체 사업자등록」은 다른 화면에도 나온다. */
  const fnAt = source.indexOf('function renderPCSide');
  assert.ok(fnAt > 0, 'renderPCSide 를 찾지 못했습니다');
  const fn = source.slice(fnAt, source.indexOf('\nfunction ', fnAt + 20));
  const at = fn.indexOf('if(onMail){');
  /* 명함 폴더 목록이 시작되는 자리로 「폴더」 머리를 쓴다.
     예전엔 「전체 사업자등록」이라는 이름표를 표지로 삼았는데, 그 이름표가
     겹말이라 없어지면서 검사가 엉뚱한 곳을 보게 됐다(2026-08-12). */
  /* ⚠ 「폴더」 머리는 기업정보 갈래에도 있다 — 명함 폴더만의 표지를 쓴다.
     allGroups() 로 폴더를 모으는 줄은 명함 쪽에만 있다(2026-08-13). */
  const folders = fn.indexOf('Object.values(allGroups())');
  assert.ok(at > 0, 'renderPCSide 안에서 onMail 갈림길을 찾지 못했습니다');
  assert.ok(folders > 0, '명함 폴더 머리를 찾지 못했습니다');
  assert.ok(folders > at, '메일 옆줄이 명함 폴더보다 뒤에 있으면 둘 다 그려진다');
});

test('자료함에서 나가면 들어왔던 곳으로 돌아간다', () => {
  /* 메일 쓰다 자료를 손보러 들어왔는데 나갈 때 명함첩에 떨어지면 하던 일을 잃는다 */
  assert.match(source, /let _matFrom/);
  assert.match(source, /_matFrom = \(state\.view===['"]mail['"]\) \? ['"]mail['"] : ['"]list['"]/);
  assert.match(source, /function closeMatPage\(\)\{ state\.view=_matFrom;/);
});

test('돌아갈 때 openMailPage 를 다시 부르지 않는다', () => {
  /* 부르면 「쓰다 만 메일을 이어 쓸까요?」를 또 묻는다 */
  const fn = source.slice(source.indexOf('function closeMatPage'), source.indexOf('function closeMatPage') + 120);
  assert.doesNotMatch(fn, /openMailPage/);
});
