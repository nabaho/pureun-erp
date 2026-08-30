'use strict';
// 푸른이알피 진행 메모를 업무관리 기록으로 — node --test tests/erp-note-to-log.test.js
//
// 왜: 팀 전체가 진행 이백오십칠 건인데 주간 기록이 «0줄»이었다.
//     까닭 하나를 코드에서 찾았다 — 푸른이알피 「나의 업무」 진행 모달에
//     진행률·상태·다음 할 일·메모 칸이 있는데,
//       상태·다음 할 일 … 양방향으로 맞춘다 (pesync pick3)
//       메모(note)      … 업무관리 → 푸른이알피 «한 방향뿐»
//     그래서 담당자가 푸른이알피에 적은 메모는 업무관리로 영영 오지 않았다.
//     같은 이야기를 두 곳에 쓰라는 꼴이라 한쪽이 비는 것이 당연했다.
//
// 이 검사가 지키는 것
//   ① 업무관리가 data/project_progress 를 «직접 읽지 않는다»
//      — 배열 통째 저장 자리이기도 하고, 새 data 자리를 읽기 시작하면 보안규칙에
//        이름을 붙여야 해서 콘솔에 붙여넣기 전까지 규칙 파일이 어긋난다.
//        대신 엔진이 내려보낸다(사건 단계 기한 pe_due 와 같은 길).
//   ② 자기 것만 내려보낸다 (project_progress 는 사람별 기록이다)
//   ③ 자동으로 기록을 만들지 않는다 (메모는 덮어쓰는 한 칸이라 같은 줄이 쌓인다)
//   ④ 메모를 고치면 다시 담을 수 있다 · 기록이 먼저다
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const W = fs.readFileSync(path.join(__dirname, '..', 'work.html'), 'utf8').replace(/\r\n/g, '\n');
const P = fs.readFileSync(path.join(__dirname, '..', 'pu-erp.html'), 'utf8').replace(/\r\n/g, '\n');

function grab(src, name){
  const i = src.indexOf('function ' + name + '(');
  assert.ok(i >= 0, '못 찾음: ' + name);
  let d = 0, j = i;
  for(;;j++){ if(src[j] === '{') d++; else if(src[j] === '}'){ d--; if(!d){ j++; break; } } }
  return src.slice(i, j);
}

function makeBox(opts){
  opts = opts || {};
  const log = { added:[], set:[], toast:[] };
  const box = {
    console, Date, String, Number, Array, Object, JSON, isNaN,
    ppchk: JSON.parse(JSON.stringify(opts.chk || {})),
    items: opts.items || {},
    _peU2N: { 'P-004':'김혜민', 'P-001':'권형하' },
    NS: 'work_erp',
    S: { me:{ sid:'P-001', name:'권형하' }, drawerId:null },
    todayStr: () => '2026-08-27',
    safeKey: s => String(s == null ? '' : s).replace(/[.#$/\[\]]/g, '_'),
    toast(m){ log.toast.push(String(m)); },
    route(){}, renderDrawer(){},
    addLog(id, t, d, k){ log.added.push({ id, t, d, k }); return Promise.resolve(opts.logOk !== false); },
    fbDb: { ref(p){ return { set(v){ log.set.push({ p, v }); return Promise.resolve(); } }; } },
    esc: x => String(x == null ? '' : x).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])),
    escJ: x => String(x == null ? '' : x).replace(/\\/g, '\\\\').replace(/'/g, "\\'"),
    hlp: k => '<span class="hlp" data-k="' + k + '">ⓘ</span>'
  };
  box.window = box;
  vm.createContext(box);
  vm.runInContext(
    grab(W, 'ppFor') + '\n' + grab(W, 'ppLine') + '\n' + grab(W, 'ppKey') + '\n'
    + grab(W, 'ppTaken') + '\n' + grab(W, 'ppTake') + '\n' + grab(W, 'dPpHTML') + '\n'
    + 'this.forIt=ppFor; this.line=ppLine; this.taken=ppTaken; this.take=ppTake; this.block=dPpHTML;', box);
  box._log = log;
  return box;
}

/* 엔진이 내려보낸 모양 — items/{id}/pe_notes/{사번} = {t, at, id, pg} */
const 업무 = { _id:'W1', src:'puerp', ref:{ type:'case', id:'c1' }, pe_notes:{
  'P-004':{ t:'이유서 초안 넘김', at:'2026-08-26T10:00:00', id:'pp-a', pg:40 },
  'P-001':{ t:'감독관 통화 완료', at:'2026-08-27T09:00:00', id:'pp-b' },
  'P-007':{ t:'   ', at:'2026-08-25T00:00:00', id:'pp-c' }        // 빈 메모
} };
const 메모없음 = { _id:'W2', src:'puerp', ref:{ type:'case', id:'c2' } };

/* ══════════════════════════════════════
   ① 어느 메모가 이 업무 것인가
   ══════════════════════════════════════ */
test('그 업무 항목 안에 든 것만 본다 — 남의 건이 섞일 자리가 없다', () => {
  const got = Array.from(makeBox({}).forIt(업무)).map(p => p.note);
  assert.equal(got.length, 2);
});

test('빈 메모는 안 보여준다 — 볼 것이 없는 줄을 늘리지 않는다', () => {
  assert.ok(!Array.from(makeBox({}).forIt(업무)).some(p => !String(p.note).trim()));
});

test('메모가 아예 없으면 빈손', () => {
  assert.equal(Array.from(makeBox({}).forIt(메모없음)).length, 0);
  assert.equal(Array.from(makeBox({}).forIt(null)).length, 0);
});

test('최근에 고친 것이 위로', () => {
  assert.equal(Array.from(makeBox({}).forIt(업무))[0].note, '감독관 통화 완료');
});

/* ══════════════════════════════════════
   ② 한 줄로
   ══════════════════════════════════════ */
test('어디서 온 줄인지 앞에 세운다 — 사람이 쓴 기록과 헷갈리지 않게', () => {
  assert.equal(makeBox({}).line({ note:'이유서 초안 넘김' }), '🔗 푸른이알피 메모 — 이유서 초안 넘김');
});

test('긴 메모는 자른다 — 기록 한 줄이 화면을 넘기면 표가 무너진다', () => {
  const t = makeBox({}).line({ note:'가'.repeat(120) });
  const 메모부분 = t.split(' — ').slice(1).join(' — ');
  assert.ok(메모부분.length <= 47, '메모 길이: ' + 메모부분.length);
  assert.match(t, /…$/);
});

test('줄바꿈은 한 칸으로 편다 — 기록은 한 줄이다', () => {
  assert.equal(makeBox({}).line({ note:'첫 줄\n  둘째 줄' }), '🔗 푸른이알피 메모 — 첫 줄 둘째 줄');
});

/* ══════════════════════════════════════
   ③ 담기 — 사람이 누른다
   ══════════════════════════════════════ */
test('[기록에 담기] 를 누르면 그 주 기록에 한 줄이 들어간다', () => {
  const b = makeBox({ items:{ W1:업무 } });
  b.take('W1', 'pp-a');
  assert.equal(b._log.added.length, 1);
  assert.equal(b._log.added[0].t, '🔗 푸른이알피 메모 — 이유서 초안 넘김');
  assert.equal(b._log.added[0].k, 'pe', '나중에 걸러 볼 수 있게 종류를 남긴다');
});

test('⚠ 기록이 먼저다 — 기록이 안 되면 「담김」으로 표시하지 않는다', async () => {
  const b = makeBox({ items:{ W1:업무 }, logOk:false });
  b.take('W1', 'pp-a');
  await new Promise(r => setTimeout(r, 0));
  assert.equal(b._log.set.length, 0);
});

test('담을 때 «그때 담은 글»을 함께 남긴다', async () => {
  const b = makeBox({ items:{ W1:업무 } });
  b.take('W1', 'pp-a');
  await new Promise(r => setTimeout(r, 0));
  assert.equal(b._log.set[0].v.txt, '이유서 초안 넘김');
  assert.equal(b._log.set[0].v.by, 'P-001');
});

test('⚠ 담은 표시를 «사번»이 아니라 메모 줄 번호로 건다', async () => {
  const b = makeBox({ items:{ W1:업무 } });
  b.take('W1', 'pp-a');
  await new Promise(r => setTimeout(r, 0));
  assert.match(b._log.set[0].p, /work_erp\/ppchk\/W1\|pp-a$/);
  // 사람으로 경로를 만들면 그 값이 잘못 왔을 때 엉뚱한 사람 자리를 건드린다
  assert.ok(b._log.set[0].p.indexOf('P-004') < 0);
});

test('없는 업무·없는 메모를 담으라고 하면 조용히 지나가지 않는다', () => {
  const b = makeBox({ items:{ W1:업무 } });
  b.take('없는업무', 'pp-a');
  b.take('W1', '없는번호');
  assert.equal(b._log.added.length, 0);
  assert.match(b._log.toast.join(''), /찾지 못했습니다/);
});

/* ══════════════════════════════════════
   ④ 고치면 다시 담을 수 있다
   ══════════════════════════════════════ */
const 첫메모 = { id:'pp-a', note:'이유서 초안 넘김' };

test('이미 담은 메모는 「담김」으로 둔다', () => {
  assert.equal(makeBox({ chk:{ 'W1|pp-a':{ txt:'이유서 초안 넘김' } } }).taken(업무, 첫메모), true);
});

test('⚠ 메모를 고치면 다시 담을 수 있다 — 「담았다」만 두면 고친 내용이 영영 안 들어온다', () => {
  assert.equal(makeBox({ chk:{ 'W1|pp-a':{ txt:'옛날 메모' } } }).taken(업무, 첫메모), false);
});

test('아무것도 안 담았으면 담을 수 있다', () => {
  assert.equal(makeBox({}).taken(업무, 첫메모), false);
});

/* ══════════════════════════════════════
   ⑤ 화면
   ══════════════════════════════════════ */
test('누가 언제 쓴 메모인지 적는다 — 사번이 아니라 이름으로', () => {
  const h = makeBox({ items:{ W1:업무 } }).block(업무, 'W1');
  assert.match(h, /김혜민/);
  assert.match(h, /2026-08-26/);
  assert.match(h, /진행 40%/);
});

test('아직 안 담은 것에만 단추가 있다', () => {
  const h1 = makeBox({}).block(업무, 'W1');
  assert.match(h1, /✎ 기록에 담기/);
  const h2 = makeBox({ chk:{
    'W1|pp-a':{ txt:'이유서 초안 넘김' }, 'W1|pp-b':{ txt:'감독관 통화 완료' } } }).block(업무, 'W1');
  assert.ok(h2.indexOf('✎ 기록에 담기') < 0);
  assert.match(h2, /✎ 기록에 담김/);
});

test('단추에 무엇이 기록될지 미리 적어 둔다', () => {
  assert.match(makeBox({}).block(업무, 'W1'), /title="[^"]*🔗 푸른이알피 메모 — 감독관 통화 완료/);
});

test('메모가 없으면 상자를 아예 안 그린다', () => {
  assert.equal(makeBox({}).block(메모없음, 'W2'), '');
});

/* ══════════════════════════════════════
   ⑥ 업무관리는 새 data 자리를 안 읽는다
   ══════════════════════════════════════ */
test('★ data/project_progress 를 직접 읽지 않는다 — 규칙에 이름을 붙여야 하고, 콘솔이 어긋난다', () => {
  // ⚠ 주석에도 그 낱말이 나온다(왜 안 읽는지 적어 두었다) — «읽는 코드»만 본다
  const 코드 = W.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  assert.ok(코드.indexOf('data/project_progress') < 0,
    '읽기 시작하면 보안규칙에 이름을 붙여야 하고, 대표가 콘솔에 붙여넣기 전까지 규칙 파일이 어긋난다');
});

test('엔진이 내려보낸 칸(pe_notes)만 본다', () => {
  assert.match(grab(W, 'ppFor'), /it\.pe_notes/);
});

test('담은 표시는 «우리» 자리에만 쓴다', () => {
  assert.match(grab(W, 'ppTake'), /fbDb\.ref\(NS\+'\/ppchk\//);
});

test('자동으로 기록을 만들지 않는다 — 그리는 곳에서 addLog 를 부르지 않는다', () => {
  assert.ok(grab(W, 'ppFor').indexOf('addLog') < 0);
  assert.ok(grab(W, 'dPpHTML').indexOf('addLog') < 0);
});

/* ══════════════════════════════════════
   ⑦ 엔진이 내려보낸다
   ══════════════════════════════════════ */
const ENG = P.slice(P.indexOf('function wsSyncRun('), P.indexOf('function MyDeskV2('));

test('메모를 업무관리로 내려보낸다', () => {
  assert.match(ENG, /up\['work_erp\/items\/' \+ wid \+ '\/pe_notes\/' \+ sid\]/);
});

test('⚠ 자기 것만 내려보낸다 — project_progress 는 사람별 기록이다', () => {
  const i = ENG.indexOf("'/pe_notes/'");
  const mine = ENG.indexOf('if(mine && !want){');
  assert.ok(mine > 0 && mine < i, '남의 행까지 옮기는 자리에 있으면 안 된다');
});

test('바뀌었을 때만 쓴다 — 돌 때마다 쓰면 트래픽만 먹는다', () => {
  const i = ENG.indexOf("'/pe_notes/'");
  assert.match(ENG.slice(i - 400, i), /String\(\(_noteWas&&_noteWas\.t\)\|\|''\)!==_noteNow/);
});

test('메모를 지우면 그 칸도 지운다 — 지운 메모가 남아 있으면 안 된다', () => {
  const i = ENG.indexOf("'/pe_notes/'");
  assert.match(ENG.slice(i, i + 320), /: null;/);
});

test('사건 단계 기한과 같은 길이다 — 새 배관을 놓지 않았다', () => {
  assert.match(ENG, /pe_due/, '이미 한 방향으로 내려보내던 자리가 있다');
});
