/* 새 명함 자동 분류 + 직업별 탭 (대표 지시 2026-08-26)
   "사진첩에서 인식되면 노무사·전문가는 자동적으로 분류되고, 변호사·회계사·세무사·
    감평사 등 전문가는 별도로 자동으로 폴더와 탭으로 자동이동 가능하게 할 수 있나?"
   대표 결정: 「새 명함이 들어올 때 바로」 · 탭은 전문가·노무사·기관 세 폴더 다.

   ★ 이 파일이 지키는 가장 중요한 것 — «옛 명함을 다시 훑지 않는다»
     구독은 자료가 바뀔 때마다 명함 전부를 다시 준다. 그때마다 미분류를 옮기면
     켤 때마다 수천 건 쓰기가 나간다(2026-08 오류 폭주가 그 모양이었다).
     첫 꾸러미는 «표시만» 하고 아무것도 쓰지 않는다.
   ⚠ 「표시」는 꾸러미가 올 때 그 자리에서 해야 한다. 미루면 켜는 동안 도착한 명함까지
     「처음 것」으로 표시되어 조용히 새어 나간다 — 실제로 그렇게 짰다가 고쳤다. */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const HTML = fs.readFileSync(path.join(ROOT, 'pu-cards.html'), 'utf8');

function slice(fromMark, toMark) {
  const a = HTML.indexOf(fromMark);
  const b = HTML.indexOf(toMark, a + 1);
  assert.ok(a > 0 && b > a, '표식을 못 찾았다: ' + fromMark);
  return HTML.slice(a, b);
}
/* 순수 로직만 떠서 돌린다. const 는 vm 컨텍스트에 안 붙으므로 var 로 바꿔 싣는다. */
function load() {
  const ctx = { console, Object, Array, String, Number, Math, Set };
  vm.createContext(ctx);
  const defs = slice('const CLASSIFY_DEFAULTS = [', 'function seedClassifyRules(')
    .replace(/^const /, 'var ');
  new vm.Script(defs).runInContext(ctx);
  const rule = slice('function ruleHit(it, r){', 'function classifyTargets(');
  new vm.Script(rule).runInContext(ctx);
  /* autoClsPlan 은 폴더를 찾을 때 findRuleGroup(+ruleFolderId) 을 쓴다 — 그것도 실어야 한다.
     ⚠ 대역으로 흉내내지 않는다. 잠긴 폴더를 막는 규칙이 그 안에 있어서,
       흉내내면 「잠긴 폴더로 안 보낸다」를 실제로 못 본다. */
  /* ⚠ 끝 표식으로 '\n\n' 을 쓰지 않는다 — 이 파일은 CRLF 라 그런 자리가 없다.
       이름 있는 표식으로 벤다(이 저장소에서 여러 번 밟은 함정). */
  new vm.Script(slice('const _canon = s =>', '/* ══════ 통합 이메일 로그인')
    .replace(/^const /, 'var ')).runInContext(ctx);
  new vm.Script(slice('function findRuleGroup(groups, r, kind){',
    '/* ══════ 새 명함 자동 분류 — 순수 로직')).runInContext(ctx);
  const auto = slice('const AUTO_CLS_CHUNK', '/* ══════ 새 명함 자동 분류 — 화면·쓰기')
    .replace(/^const /, 'var ').replace(/\nconst /g, '\nvar ');
  new vm.Script(auto).runInContext(ctx);
  return ctx;
}
const card = (id, company, group) => ({ id: id, kind: 'card', company: company, group: group || '' });

/* ── ★ 옛 명함을 다시 훑지 않는다 ── */

test('★ 첫 꾸러미는 아무것도 안 옮긴다 — 표시만 한다', () => {
  const { autoClsNewIds } = load();
  const seen = new Set();
  const items = [card('a', '세무법인 갑'), card('b', '노무법인 을')];
  const fresh = autoClsNewIds(items, seen, true);
  assert.strictEqual(fresh.length, 0, '첫 꾸러미에서 옮길 것이 나오면 안 된다');
  assert.strictEqual(seen.size, 2, '그래도 봤다고 표시는 해야 한다');
});

test('두 번째 꾸러미부터 «새로 나타난 것»만 나온다', () => {
  const { autoClsNewIds } = load();
  const seen = new Set();
  const first = [card('a', '세무법인 갑')];
  autoClsNewIds(first, seen, true);
  const second = first.concat([card('b', '노무법인 을'), card('c', '○○회계법인')]);
  const fresh = autoClsNewIds(second, seen, false);
  assert.strictEqual(fresh.join(','), 'b,c', '옛것(a)이 다시 나오면 안 된다');
});

test('같은 꾸러미가 또 와도 두 번 옮기지 않는다', () => {
  const { autoClsNewIds } = load();
  const seen = new Set();
  const items = [card('a', '세무법인 갑')];
  autoClsNewIds(items, seen, true);
  const more = items.concat([card('b', '노무법인 을')]);
  assert.strictEqual(autoClsNewIds(more, seen, false).join(','), 'b');
  assert.strictEqual(autoClsNewIds(more, seen, false).length, 0, '두 번째에는 없어야 한다');
});

test('id 없는 것에 안 넘어진다', () => {
  const { autoClsNewIds } = load();
  const seen = new Set();
  assert.strictEqual(autoClsNewIds([null, {}, { id: '' }, card('a', '갑')], seen, false).join(','), 'a');
  assert.strictEqual(autoClsNewIds(null, seen, false).length, 0);
});

/* ── 무엇을 어디로 ── */

const GROUPS = {
  g1: { id: 'g1', name: '노무사', kind: 'card' },
  g2: { id: 'g2', name: '전문가', kind: 'card' },
  g9: { id: 'g9', name: '기관·공공', kind: 'card', locked: true },
};

test('규칙에 걸린 새 명함을 그 폴더로 보낸다', () => {
  const ctx = load();
  const items = [card('a', '세무법인 갑'), card('b', '노무법인 을')];
  const p = ctx.autoClsPlan(items, ['a', 'b'], ctx.CLASSIFY_DEFAULTS, GROUPS);
  const by = {}; p.moves.forEach(m => { by[m.id] = m.gid; });
  assert.strictEqual(by.a, 'g2', '세무법인 → 전문가');
  assert.strictEqual(by.b, 'g1', '노무법인 → 노무사');
});

test('★ 손으로 넣어 둔 폴더는 절대 안 건드린다', () => {
  const ctx = load();
  const items = [Object.assign(card('a', '세무법인 갑'), { group: 'myfolder' })];
  const p = ctx.autoClsPlan(items, ['a'], ctx.CLASSIFY_DEFAULTS, GROUPS);
  assert.strictEqual(p.moves.length, 0, '이미 폴더에 있는 것을 옮기면 안 된다');
});

test('★ 잠긴 폴더로는 안 보낸다 — 세어서 남긴다', () => {
  const ctx = load();
  const items = [card('a', '한국산업안전보건공단')];
  const p = ctx.autoClsPlan(items, ['a'], ctx.CLASSIFY_DEFAULTS, GROUPS);
  assert.strictEqual(p.moves.length, 0);
  assert.strictEqual(p.skipped.locked, 1, '조용히 넘기지 말고 세어야 한다');
});

test('폴더가 아직 없으면 «만들지 않는다» — 세어서 남긴다', () => {
  const ctx = load();
  const items = [card('a', '○○식당')];      /* 생활·기타 폴더가 GROUPS 에 없다 */
  const p = ctx.autoClsPlan(items, ['a'], ctx.CLASSIFY_DEFAULTS, GROUPS);
  assert.strictEqual(p.moves.length, 0);
  assert.strictEqual(p.skipped.missing, 1);
});

test('규칙에 안 걸리는 것은 그대로 둔다', () => {
  const ctx = load();
  const items = [card('a', '그냥이름없는회사')];
  assert.strictEqual(ctx.autoClsPlan(items, ['a'], ctx.CLASSIFY_DEFAULTS, GROUPS).moves.length, 0);
});

test('위에서 아래로 «먼저 맞은 규칙 하나»만 — 한 장이 두 폴더로 갈 수 없다', () => {
  const ctx = load();
  /* 「노무법인」과 「세무」가 둘 다 든 이름 — 차례가 앞인 노무사로 간다 */
  const items = [card('a', '노무법인 세무하나')];
  const p = ctx.autoClsPlan(items, ['a'], ctx.CLASSIFY_DEFAULTS, GROUPS);
  assert.strictEqual(p.moves.length, 1);
  assert.strictEqual(p.moves[0].gid, 'g1');
});

test('한 번에 너무 많으면 남긴다 — 다음에 이어서', () => {
  const ctx = load();
  const items = [], ids = [];
  for (let i = 0; i < ctx.AUTO_CLS_MAX + 50; i++) { items.push(card('x' + i, '세무법인 갑')); ids.push('x' + i); }
  const p = ctx.autoClsPlan(items, ids, ctx.CLASSIFY_DEFAULTS, GROUPS);
  assert.strictEqual(p.moves.length, ctx.AUTO_CLS_MAX);
  assert.strictEqual(p.skipped.over, 50);
});

/* ── 한 장씩 쓰지 않는다 ── */

test('★ 나눠서 «한 번의 update»로 보낸다 — 한 장씩 수천 번이 오류 폭주였다', () => {
  const ctx = load();
  const moves = [];
  for (let i = 0; i < 450; i++) moves.push({ id: 'x' + i, gid: 'g2' });
  const ch = ctx.autoClsChunks(moves, 200);
  assert.strictEqual(ch.length, 3, '200·200·50 세 꾸러미');
  assert.strictEqual(Object.keys(ch[0]).length, 200);
  assert.strictEqual(Object.keys(ch[2]).length, 50);
  assert.strictEqual(ch[0]['items/x0/group'], 'g2', '쓰는 자리는 items/{id}/group');
});

test('빈 것·망가진 것은 쓰지 않는다', () => {
  const ctx = load();
  assert.strictEqual(ctx.autoClsChunks([], 200).length, 0);
  assert.strictEqual(ctx.autoClsChunks([{ id: 'a' }, { gid: 'g' }, null], 200).length, 0,
    'id 나 폴더가 없으면 쓸 자리가 없다');
});

test('꾸러미 크기가 이상해도 안 넘어진다', () => {
  const ctx = load();
  const moves = [{ id: 'a', gid: 'g' }, { id: 'b', gid: 'g' }];
  assert.strictEqual(ctx.autoClsChunks(moves, 0).length, 1, '0 이면 기본값으로');
  assert.strictEqual(ctx.autoClsChunks(moves, -5).length, 1);
});

/* ── 무엇을 했는지 말한다 ── */

test('★ 어디로 몇 장 보냈는지 알린다 — 조용히 옮기면 「내 명함이 왜 딴 데 있나」가 된다', () => {
  const ctx = load();
  const t = ctx.autoClsToastText([
    { groupName: '전문가' }, { groupName: '전문가' }, { groupName: '노무사' },
  ]);
  assert.match(t, /📁 전문가 2장/);
  assert.match(t, /📁 노무사 1장/);
});

test('옮긴 것이 없으면 아무 말도 안 한다', () => {
  const ctx = load();
  assert.strictEqual(ctx.autoClsToastText([]), '');
  assert.strictEqual(ctx.autoClsToastText(null), '');
});

/* ── 직업별 탭 ── */

test('★ 대표가 고른 직업 다섯이 전문가 탭에 있다', () => {
  const ctx = load();
  const ex = ctx.CLASSIFY_DEFAULTS.find(r => r.key === 'expert');
  const names = ctx.classifyTabsOf(ex).map(t => t.name);
  ['세무사', '회계사', '변호사', '감정평가사', '변리사'].forEach(nm => {
    assert.ok(names.indexOf(nm) >= 0, nm + ' 탭이 없다');
  });
});

test('노무사·기관도 탭으로 나눈다 (대표 선택)', () => {
  const ctx = load();
  const nm = ctx.classifyTabsOf(ctx.CLASSIFY_DEFAULTS.find(r => r.key === 'nomu')).map(t => t.name);
  assert.strictEqual(nm.join(','), '노무법인,개인사무소');
  const pb = ctx.classifyTabsOf(ctx.CLASSIFY_DEFAULTS.find(r => r.key === 'public')).map(t => t.name);
  assert.ok(pb.length >= 4, '기관·공공도 갈라야 한다: ' + pb.join(','));
});

test('탭의 말은 폴더의 말 «안»에 있어야 한다 — 넓으면 폴더 전체가 한 탭에 들어간다', () => {
  const ctx = load();
  ctx.CLASSIFY_DEFAULTS.forEach(function (r) {
    ctx.classifyTabsOf(r).forEach(function (tb) {
      tb.words.forEach(function (w) {
        assert.ok(r.words.indexOf(w) >= 0,
          r.toGroupName + ' 의 「' + tb.name + '」 탭 말 「' + w + '」 이 폴더 말에 없다');
      });
    });
  });
});

test('규칙에 tabs 가 없으면 기본값으로 되메운다 — 탭이 조용히 사라지면 안 된다', () => {
  const ctx = load();
  /* 대표가 환경설정에서 말만 고쳐 저장하면 tabs 가 빠질 수 있다 */
  const saved = { key: 'expert', order: 2, enabled: true, toGroupName: '전문가', words: ['세무'] };
  assert.ok(ctx.classifyTabsOf(saved).length >= 5, '기본값에서 가져와야 한다');
});

test('모르는 규칙·망가진 tabs 에 안 넘어진다', () => {
  const ctx = load();
  assert.strictEqual(ctx.classifyTabsOf({ key: 'nosuch' }).length, 0);
  assert.strictEqual(ctx.classifyTabsOf(null).length, 0);
  assert.strictEqual(ctx.classifyTabsOf({ key: 'x', tabs: [{ name: '가' }, null, { words: [] }] }).length, 0,
    '이름과 말이 다 있어야 탭이다');
});

/* ── 걸어 놓은 자리 ── */

test('표시는 꾸러미가 «올 때 바로» 한다 — 미루면 새 명함이 새어 나간다', () => {
  const at = HTML.indexOf("watchCardMap(this.db.ref(DB_ROOT+'/items')");
  assert.ok(at > 0);
  const near = HTML.slice(at, at + 1600);
  assert.match(near, /autoClsMark\(\);/, '표시를 그 자리에서 해야 한다');
  assert.match(near, /autoClsSoon\(\);/, '옮기기는 미룬다');
  assert.ok(!/setTimeout\(autoClassifyOnArrive/.test(near),
    '표시까지 미루면 켜는 동안 도착한 명함이 「처음 것」이 된다');
});

test('옮기기는 규칙·폴더 심기보다 «뒤»에 돈다', () => {
  const body = slice('function autoClsSoon(){', '/* ③ 실제로 옮긴다 */');
  const m = body.match(/setTimeout\(autoClassifyOnArrive, (\d+)\)/);
  assert.ok(m, '미루는 자리를 못 찾았다');
  assert.ok(Number(m[1]) >= 6000,
    '규칙(3초)·폴더(3초)·탭(6초) 심기보다 뒤라야 폴더를 찾을 수 있다');
});

test('겹쳐 돌지 않는다', () => {
  const body = slice('async function autoClassifyOnArrive(){', 'function seedProfTabs(){');
  assert.match(body, /if\(_autoClsBusy\) return;/);
  assert.match(body, /_autoClsBusy = false;/, '끝나고 안 풀면 다음에 안 돈다');
});

test('직업별 탭은 «조건 탭»이다 — 명함마다 쓰지 않는다', () => {
  const body = slice('function seedProfTabs(){', '/* ══════ 규칙 분류 — 화면 ══════ */');
  assert.match(body, /colFilter:\{ company: word \}/, '회사명으로 거르는 조건 탭이어야 한다');
  assert.ok(!/manual\s*:\s*true/.test(body), '담는 탭으로 만들면 명함마다 쓰기가 붙는다');
  assert.ok(!/vtabs/.test(body), 'vtabs 를 쓰면 6,286장에 쓰기가 붙는다');
});

test('탭은 그 폴더 «안»에서만 보인다 — 폴더가 없으면 안 심는다', () => {
  const body = slice('function seedProfTabs(){', '/* ══════ 규칙 분류 — 화면 ══════ */');
  assert.match(body, /if\(!t \|\| !t\.gid\) return;/, '폴더가 없으면 넘어가야 한다');
  assert.match(body, /scope:t\.gid/, 'scope 가 폴더 id 여야 그 폴더에서 보인다');
});

test('같은 탭을 두 번 심지 않는다', () => {
  const body = slice('function seedProfTabs(){', '/* ══════ 규칙 분류 — 화면 ══════ */');
  assert.match(body, /if\(dup\) return;/);
  /* ⚠ 「읽기」와 「쓰기」를 둘 다 본다. 이름만 세면 위쪽 guard 하나로도 통과해,
       표시를 «안 남기는» 되돌림이 그냥 지나갔다(되돌림이 잡아 준 자리). */
  assert.match(body, /if\(localStorage\.getItem\('pucards_proftabs_v1'\)\) return;/,
    '이미 심었으면 다시 안 심어야 한다');
  assert.match(body, /localStorage\.setItem\('pucards_proftabs_v1','1'\);/,
    '표시를 남기지 않으면 지운 탭이 다시 살아난다');
});
