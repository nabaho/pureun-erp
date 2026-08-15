/* 사진첩 — 보유기준 점검 담당자
   기준(증빙 5년·나머지 1년)은 정해져 있는데 **지우는 일이 아무에게도 안 걸려 있었다.**
   자동 삭제는 일부러 만들지 않았으므로(사람 확인이 필수) 누가 언제 볼지를 정해 둔다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'pu-photos.html'), 'utf8');

/* pu-photos.html 안의 함수를 그대로 꺼내 돌린다 — 옮겨 적으면 검사는 통과해도
   진짜 코드는 고장난 채 남는다. 바깥 값(retInfo 등)은 문맥에 심어 준다. */
function run(name, ctx) {
  const m = html.match(new RegExp('function ' + name + '\\([\\s\\S]*?\\n\\}'));
  assert.ok(m, name + ' 를 찾지 못했습니다.');
  vm.createContext(ctx);
  vm.runInContext(m[0], ctx);
  return ctx[name];
}
const DAY = 86400000;
/* ⚠ 주기는 **파일에 적힌 값을 그대로 가져온다.** 검사에 90을 따로 적어 두면
   코드에서 3650(10년)으로 바꿔도 검사는 그대로 통과한다(실제로 그랬다). */
const EVERY = (function () {
  const m = html.match(/RET_EVERY_DAYS = (\d+)/);
  assert.ok(m, 'RET_EVERY_DAYS 를 찾지 못했습니다.');
  return +m[1];
})();
function base(over) {
  return Object.assign({ Date, Math, RET_EVERY_DAYS: EVERY, retInfo: null }, over || {});
}

test('★ 점검 주기가 사람이 지킬 만한 간격이다', () => {
  assert.ok(EVERY >= 30 && EVERY <= 180,
    '주기가 ' + EVERY + '일입니다 — 너무 잦으면 잔소리가 되고, 너무 길면 안 지키는 것과 같습니다.');
});

/* ── 언제 알리나 ── */
test('담당자를 안 정했으면 아무에게도 안 알린다', () => {
  const ctx = base({ retInfo: {} });
  assert.equal(run('retDue', ctx)(), false, '정하지도 않은 일로 사람을 부르면 안 됩니다.');
});

test('★ 한 번도 점검 안 했으면 바로 알린다', () => {
  const ctx = base({ retInfo: { uid: 'u1', name: '홍길동' } });
  assert.equal(run('retDue', ctx)(), true);
});

test('90일이 지나야 알린다 (그 전에는 조용)', () => {
  const near = base({ retInfo: { uid: 'u1', lastAt: Date.now() - (EVERY - 1) * DAY } });
  assert.equal(run('retDue', near)(), false, '주기 하루 전에 부르면 알림이 잔소리가 됩니다.');
  const due = base({ retInfo: { uid: 'u1', lastAt: Date.now() - EVERY * DAY } });
  assert.equal(run('retDue', due)(), true);
  const over = base({ retInfo: { uid: 'u1', lastAt: Date.now() - 400 * DAY } });
  assert.equal(run('retDue', over)(), true);
});

test('며칠 지났는지 세어 준다', () => {
  const ctx = base({ retInfo: { uid: 'u1', lastAt: Date.now() - 120 * DAY } });
  assert.equal(run('retDays', ctx)(), 120);
  const never = base({ retInfo: { uid: 'u1' } });
  assert.equal(run('retDays', never)(), 0);
});

test('자료가 없거나 이상해도 터지지 않는다', () => {
  assert.equal(run('retDue', base({ retInfo: null }))(), false);
  assert.equal(run('retDays', base({ retInfo: null }))(), 0);
});

/* ── 누구에게 보이나 ── */
test('★ 알림은 담당자 본인에게만 뜬다', () => {
  const m = html.match(/function renderRetNote\(\)[\s\S]*?\n\}/);
  assert.ok(m);
  assert.ok(/r\.uid *!== *PuPhotoStore\.myUid\(\)/.test(m[0]),
    '전 직원에게 뜨면 아무도 자기 일로 안 봅니다.');
  assert.ok(/!retDue\(\)/.test(m[0]), '때가 안 됐는데 뜨면 안 됩니다.');
});

test('★ 「점검했음」은 담당자 본인만 누를 수 있다', () => {
  const box = html.match(/function renderRetBox\(\)[\s\S]*?\n\}/);
  assert.ok(box && /r\.uid === PuPhotoStore\.myUid\(\)[\s\S]{0,120}retDone[\s\S]{0,60}display/.test(box[0]),
    '남이 눌러 주면 실제로는 안 본 채 90일이 또 갑니다.');
  const mk = html.match(/function markRetChecked\(\)[\s\S]*?\n\}/);
  assert.ok(mk && /r\.uid !== PuPhotoStore\.myUid\(\)[\s\S]{0,20}return/.test(mk[0]),
    '화면만 숨기고 기능이 열려 있으면 막은 것이 아닙니다.');
});

test('담당자를 정하는 것은 총괄 관리자만', () => {
  const set = html.match(/function setRetOwner\(uid\)[\s\S]*?\n\}/);
  assert.ok(set && /!PuPhotoStore\.amAdmin\(\)[\s\S]{0,20}return/.test(set[0]));
});

/* ── 바뀔 때 ──
   ⚠ 「앞사람 기록 지우기」는 저장 층으로 옮겼다 — 아래 '화면이 아니라 저장 층이 쓴다'가 본다. */
test('점검했음은 되묻고 나서 기록한다', () => {
  const mk = html.match(/function markRetChecked\(\)[\s\S]*?\n\}/);
  assert.ok(/confirm\(/.test(mk[0]), '잘못 눌러 다음 주기가 그냥 가면 안 됩니다.');
  assert.ok(/markRetentionChecked\(PuPhotoStore\.myName\(\)\)/.test(mk[0]),
    '누가 봤는지 남아야 합니다 — 이름 없이 기록하면 나중에 물을 사람이 없습니다.');
});

/* ⚠ 2026-08-07 다시 겨눔 — 처음엔 「지금 점검하기」가 설정만 열고 「지난 것 12장」이라는
   **숫자**만 보여 줬다. 어느 것인지 볼 수 없으니 담당자가 할 수 있는 일이 없었다.
   이제 지난 사진 자체를 펼친다(자세한 단정은 photos-notes-tabs.test.js). */
test('알림에서 지난 사진 자체로 데려간다', () => {
  const g = html.match(/function goRetCheck\(\)[\s\S]*?\n\}/);
  assert.ok(g && /showView\('photos'\)/.test(g[0]) && /oldOnly = true/.test(g[0]),
    '숫자만 보여 주면 담당자가 알림만 끄게 됩니다.');
});

/* ── 자리 ── */
test('★ 사진첩 전용 자리에 담는다 (포털 공용 자리를 안 쓴다)', () => {
  const store = fs.readFileSync(path.join(__dirname, '..', 'js', 'pu-photo-store.js'), 'utf8');
  assert.ok(/function retentionPath\(\) \{ return DB_ROOT \+ '\/retention'; \}/.test(store),
    '자리는 저장 층이 정해야 합니다.');
  assert.ok(!/['"`]data\//.test(html), '사진첩은 포털 공용 자리를 만지지 않습니다.');
});

test('★ 화면이 아니라 저장 층이 쓴다', () => {
  assert.ok(/PuPhotoStore\.setRetentionOwner\(/.test(html) &&
            /PuPhotoStore\.markRetentionChecked\(/.test(html),
    '화면이 실시간DB를 직접 만지면 상위 노드를 통째로 덮어쓰는 사고 경로가 열립니다.');
  const store = fs.readFileSync(path.join(__dirname, '..', 'js', 'pu-photo-store.js'), 'utf8');
  const m = store.match(/function setRetentionOwner[\s\S]*?\n  \}/);
  assert.ok(m && /lastAt: 0, lastBy: ''/.test(m[0]),
    '담당자가 바뀌면 앞사람의 점검 기록은 지워야 합니다.');
});

test('못 읽어도 사진첩은 열린다', () => {
  const l = html.match(/function loadRetention\(\)[\s\S]*?\n\}/);
  assert.ok(l && /\.catch\(/.test(l[0]));
});

test('로그인이 끝난 뒤의 부팅 단계에서 보유기준을 읽는다', () => {
  /* 카메라 진입은 목록 부팅을 0.9초 늦출 수 있어, signIn과 loadRetention 사이의
     단순 글자 수(예전 1000자)로 순서를 판정하면 안전한 코드도 실패한다.
     signIn 성공 콜백 안에서 정의·실행되는 finishPhotoBoot를 실제 경계로 본다. */
  const signAt = html.indexOf('PuPhotoStore.signIn(u.uid');
  const successAt = html.indexOf('.then(function (me)', signAt);
  const finishAt = html.indexOf('const finishPhotoBoot = function ()', successAt);
  const retentionAt = html.indexOf('loadRetention();', finishAt);
  const loginCatchAt = html.indexOf("console.warn('[로그인]'", successAt);
  assert.ok(signAt >= 0 && successAt > signAt, '로그인 성공 콜백을 찾을 수 없습니다');
  assert.ok(finishAt > successAt && retentionAt > finishAt,
    '보유기준 읽기는 로그인 성공 뒤의 사진첩 부팅 단계에 있어야 합니다');
  assert.ok(loginCatchAt > retentionAt,
    '보유기준 읽기가 로그인 성공 콜백 밖으로 빠졌습니다');
  const finishBody = html.slice(finishAt, retentionAt + 'loadRetention();'.length);
  assert.match(finishBody, /loadGrid\(\);[\s\S]*loadRetention\(\);/,
    '계정이 준비된 사진 목록과 같은 부팅 단계에서 보유기준을 읽어야 합니다');
});
