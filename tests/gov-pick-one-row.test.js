/* 사진첩 고르기 — 한 줄 · 입장·활동 두 칸 (대표 지시 2026-08-29)

   ① 담은 줄이 창 «맨 아래»라 윈도우 작업표시줄과 맞붙었다 —
      「넣고 닫기」를 누르려다 작업표시줄을 건드리기 쉬웠다. 제목줄과 한 줄로 합쳤다.
   ② 타임스탬프 창에서 열면 «그 칸 하나»만 겨눠서, 입장·활동을 넣으려면
      창을 두 번 열어야 했다. 두 칸을 한 번에 겨눈다.

   ★ 겨누는 셈은 실제로 돌려서 본다 — 글자만 보면 규칙을 없애도 통과한다. */
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'gov-consulting.html'), 'utf8');
const bare = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
const S = bare(SRC);

/* 창 뼈대만 잘라 온다 — 줄 차례를 보는 검사라 표만 있으면 된다 */
function pickerHtml() {
  const a = SRC.indexOf('<div class="pka">');
  assert.ok(a > 0, '고르기 창을 찾지 못했다');
  return SRC.slice(a, SRC.indexOf('<!-- 종류 추가', a));
}

/* ══════ ① 한 줄 ══════ */

test('담은 것·스위치·넣고 닫기가 «제목줄과 같은 줄»에 있다', () => {
  const h = pickerHtml();
  const a = h.indexOf('class="pka-bar1"');
  const b = h.indexOf('class="pka-bar2"');
  assert.ok(a > 0 && b > a, '줄 차례를 읽지 못했다');
  const bar1 = h.slice(a, b);
  ['pkaSlots', 'pkaCnt', 'pkaStamp', 'pkaPut', 'pkClear()']
    .forEach((id) => assert.ok(bar1.indexOf(id) >= 0, id + ' 이(가) 첫 줄에 없다'));
});

test('담은 줄이 창 «맨 아래»로 돌아가지 않았다 — 작업표시줄과 맞붙는 자리다', () => {
  const h = pickerHtml();
  const body = h.indexOf('id="pkaBody"');
  assert.ok(body > 0, '격자 칸을 찾지 못했다');
  ['pkaPut', 'pkaStamp', 'pkaSlots'].forEach((id) => {
    assert.ok(h.indexOf(id) < body, id + ' 이(가) 격자 아래에 있다 — 맨 아래로 돌아갔다');
  });
});

test('보기 크기·찾기는 칩줄로 내려가 있고, «칩 칸 밖»에 있다', () => {
  const h = pickerHtml();
  const b2 = h.indexOf('class="pka-bar2"');
  const body = h.indexOf('id="pkaBody"');
  const bar2 = h.slice(b2, body);
  assert.ok(bar2.indexOf('id="pkaSize"') >= 0 && bar2.indexOf('id="pkaQ"') >= 0,
    '보기 크기·찾기가 칩줄에 없다');
  /* ★ 칩 칸은 통째로 덮어써진다 — 그 «안»에 두면 칩을 그릴 때마다 함께 지워진다 */
  const chipsAt = bar2.indexOf('id="pkaChips"');
  const chipsEnd = bar2.indexOf('</span>', chipsAt);
  assert.ok(chipsAt >= 0 && chipsEnd > chipsAt, '칩 칸을 찾지 못했다');
  const inside = bar2.slice(chipsAt, chipsEnd);
  assert.ok(inside.indexOf('id="pkaSize"') < 0 && inside.indexOf('id="pkaQ"') < 0,
    '칩 칸 «안»에 있다 — 칩을 다시 그릴 때마다 지워진다');
});

test('칩을 다시 그려도 보기 크기·찾기가 살아 있다 — 실제로 덮어써 본다', () => {
  const h = pickerHtml();
  const b2 = h.indexOf('class="pka-bar2"');
  const bar2 = h.slice(b2, h.indexOf('id="pkaBody"'));
  /* pkPaintChrome 이 하는 일(칩 칸 innerHTML 교체)을 그대로 흉내낸다 */
  const chipsAt = bar2.indexOf('id="pkaChips"');
  const chipsEnd = bar2.indexOf('</span>', chipsAt);
  const after = bar2.slice(0, chipsAt) + 'id="pkaChips">(새 칩들)' + bar2.slice(chipsEnd);
  assert.ok(after.indexOf('id="pkaSize"') >= 0 && after.indexOf('id="pkaQ"') >= 0,
    '칩을 다시 그리면 보기 크기·찾기가 사라진다');
});

test('한 줄이 넘치면 «접힌다» — 글자를 잘라 숨기지 않는다', () => {
  const css = S.slice(S.indexOf('.pka-bar1{'), S.indexOf('.pka-slot{'));
  assert.ok(/flex-wrap:\s*wrap/.test(css), '좁은 화면에서 단추가 줄 밖으로 밀려난다');
});

/* ══════ ② 입장·활동 두 칸 ══════ */

function loadTargets(st) {
  const a = S.indexOf('function pkBuildStampTargets');
  assert.ok(a > 0, 'pkBuildStampTargets 를 찾지 못했다');
  const b = S.indexOf('\nfunction ', a + 8);
  const ctx = {
    console, Object, Array,
    ST: st,
    baseSlotCount: () => 2,
    slotLabelText: (sc, i) => (i === 0 ? '입장(시작)' : '활동(끝)'),
    getScheds: () => [{ id: 'S1' }],
  };
  vm.createContext(ctx);
  vm.runInContext(S.slice(a, b > a ? b : a + 1200) + '\nthis._f = pkBuildStampTargets;', ctx);
  return ctx._f;
}

test('활동에서 열면 «활동 → 입장» 두 칸을 겨눈다', () => {
  const f = loadTargets({ photos: [null, null] });
  const t = f('S1', 1);
  /* vm 안에서 만들어진 배열이라 종류까지 같지는 않다 — 값으로 견준다 */
  assert.strictEqual(t.map((x) => x.i).join(','), '1,0', '누른 칸이 첫째, 그 뒤에 나머지');
  assert.strictEqual(t[0].label, '활동(끝)');
});

test('입장에서 열면 «입장 → 활동»', () => {
  const f = loadTargets({ photos: [null, null] });
  assert.strictEqual(f('S1', 0).map((x) => x.i).join(','), '0,1');
});

test('이미 얹어 둔 칸은 겨누지 않는다 — 모르는 새 덮이면 안 된다', () => {
  const f = loadTargets({ photos: [{}, null] });   // 입장에 이미 얹혀 있다
  assert.strictEqual(f('S1', 1).map((x) => x.i).join(','), '1',
    '이미 얹은 칸까지 겨누면 두 장을 담는 순간 덮인다');
});

test('누른 칸은 이미 얹혀 있어도 겨눈다 — 그 칸에서 열었으면 덮으려는 것이다', () => {
  const f = loadTargets({ photos: [{}, {}] });
  assert.strictEqual(f('S1', 0).map((x) => x.i).join(','), '0');
});

test('«창에 얹힌 것»으로 판단한다 — 저장된 것으로 보면 방금 얹은 것을 덮는다', () => {
  /* 타임스탬프 창은 저장 «전»이다. PHOTOS(저장된 것)를 보면 방금 얹은 칸이
     비어 보여서 그 위에 덮어쓴다. */
  const body = S.slice(S.indexOf('function pkBuildStampTargets'),
    S.indexOf('function pkBuildStampTargets') + 900);
  assert.ok(/ST\.photos/.test(body), '창에 얹힌 것(ST)을 안 본다');
  assert.ok(!/PHOTOS\[/.test(body), '저장된 것(PHOTOS)으로 판단하면 방금 얹은 것을 덮는다');
});

test('담을 수 있는 장수가 «겨눈 칸 수»다 — 1 로 박아 두지 않는다', () => {
  const a = S.indexOf('const cap =');
  assert.ok(a > 0, 'cap 을 찾지 못했다');
  const line = S.slice(a, a + 260);
  assert.ok(/toStamp\s*\)\s*\?\s*1/.test(line) === false,
    '타임스탬프 창이 1 장으로 박혀 있다 — 두 칸이 보여도 한 장만 담긴다');
  assert.ok(/PK\.targets\.length/.test(line), '겨눈 칸 수를 안 쓴다');
});

/* ⚠ 검사 창을 «그 갈래까지»로 자른다 — 넓게 잡으면 뒤에 오는 다른 반복문이
     걸려서, 이 갈래가 한 장만 넣도록 바뀌어도 통과한다(실제로 그랬다). */
function toStampBranch() {
  const a = S.indexOf('if(tgt.toStamp){');
  assert.ok(a > 0, '넣기의 타임스탬프 갈래를 찾지 못했다');
  const b = S.indexOf('if(tgt.ref){', a);
  assert.ok(b > a, '갈래의 끝을 찾지 못했다');
  return S.slice(a, b);
}

test('담은 것을 «다» 넣는다 — 첫 장만 넣고 말지 않는다', () => {
  const body = toStampBranch();
  assert.ok(/for\s*\([\s\S]{0,80}picks\.length/.test(body),
    '담은 것을 하나씩 도는 자리가 없다 — 두 장을 담아도 한 장만 들어간다');
  assert.ok(/PK\.targets\[\s*i\s*\]/.test(body), '겨눈 칸을 차례대로 안 쓴다');
});

test('여러 장을 얹을 때 사진마다 알리지 않는다 — 뒤엣것이 앞엣것을 덮는다', () => {
  const body = toStampBranch();
  /* ⚠ [^)]* 로는 못 잡는다 — 인자 안에 pkOwnerOf(it) 처럼 괄호가 또 있다 */
  assert.ok(/putAlbumToStamp\([\s\S]{0,120}?,\s*true\s*\)/.test(body),
    '사진마다 알림이 떠서 두 장이면 뒤엣것이 앞엣것을 덮는다');
  assert.ok(/done/.test(body) && /toast/.test(body), '끝에 한 번은 알려야 한다');
});

test('조용히 얹어도 «실패»는 말해 준다 — 왜 못 가져왔는지가 손 쓸 데다', () => {
  const a = S.indexOf('async function putAlbumToStamp');
  const b = S.indexOf('\nfunction ', a + 8);
  const body = S.slice(a, b > a ? b : a + 2200);
  /* 성공 알림만 quiet 로 막고, 실패 알림은 그대로여야 한다.
     ⚠ 「어딘가에 'err' 가 있나」로 보면 안 된다 — 다른 실패 알림에 걸려
       정작 «왜 못 가져왔는지»를 지워도 통과한다(실제로 그랬다). */
  assert.ok(/if\(!quiet\)toast/.test(body), '성공 알림을 못 막는다');
  assert.ok(/got\.why/.test(body),
    '사진첩이 준 «왜 빈손인지»를 안 보여 준다 — 「열쇠를 안 넘겼다」와 「지워졌다」는 할 일이 다르다');
});

test('타임스탬프 창에서 겨눈 칸을 잘라내지 않는다 — 이 한 줄이 두 칸을 한 칸으로 만든다', () => {
  const a = S.indexOf('PK.targets = ref ?');
  assert.ok(a > 0, '겨눌 칸을 정하는 자리를 찾지 못했다');
  const line = S.slice(a, S.indexOf(';', a) + 1);
  assert.ok(/pkBuildStampTargets/.test(line), '타임스탬프 창 전용 셈을 안 쓴다');
  assert.ok(!/pkBuildStampTargets\([^)]*\)\s*\.slice/.test(line),
    '겨눈 칸을 잘라내면 두 칸을 그려 놓고 한 칸만 겨누게 된다');
});
