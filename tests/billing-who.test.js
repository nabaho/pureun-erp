/* 「새벽에 왜 늘었나 — 사람인가 자동인가」 (2026-08-26 대표 물음)

   ★ 물음: "세벽시간에 파이어베이스 사용액이 발생하는데 각사람마다 발생하는것인지
     자동으로 발생하는것인지? 그 이유를 색깔 위에 팝업으로 보여줄 수 있나?"

   ★ 그때는 알 길이 «없었다» — presence 는 「지금 누가 있나」만 담고 지나가면 사라진다.
     그래서 시간 칸마다 접속자를 «한 번씩» 남기고, 사용액 창이 그것을 읽어 답하게 했다.
   ★ 사용액을 보려고 사용액을 늘리면 웃긴다 — 시간 칸에 한 번만 찍고, 읽기도 한 번만 한다. */
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const bare = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
const ERP = bare(fs.readFileSync(path.join(ROOT, 'pu-erp.html'), 'utf8'));
const RAW_P = fs.readFileSync(path.join(ROOT, 'enter.html'), 'utf8');
const P = bare(RAW_P);

function fnBody(src, name) {
  const a = src.indexOf('function ' + name + '(');
  assert.ok(a > 0, name + ' 이 없다');
  let d = 0;
  for (let k = src.indexOf('{', a); k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (!d) return src.slice(a, k + 1); }
  }
  return '';
}

/* ── 남기는 쪽 (푸른이알피) ── */

test('시간 칸마다 접속자를 남긴다', () => {
  const fn = fnBody(ERP, '_markPresenceHour');
  assert.match(fn, /data\/presence_hours\//, '자취를 안 남긴다');
  assert.match(fn, /\.set\(name \|\| sid\)/, '누구인지 안 적는다');
});

test('★ 같은 시간 칸에는 «한 번만» 쓴다 — 사용액을 보려고 사용액을 늘리면 웃긴다', () => {
  const fn = fnBody(ERP, '_markPresenceHour');
  assert.match(fn, /if\(_whoHourKey === mark\) return;/, '2분마다 계속 쓴다');
  assert.match(fn, /_whoHourKey = mark;/, '찍은 것을 기억하지 않는다');
});

test('접속 심장박동이 돌 때 함께 찍는다', () => {
  const fn = fnBody(ERP, '_writePresence');
  assert.match(fn, /_markPresenceHour\(sid, name\)/, '심장박동에서 안 부른다');
});

test('★ 쓰기가 막히는 자리에 두지 않았다', () => {
  /* billing 아래는 «쓰기 금지» 다(서버만 쓴다). 거기 두면 조용히 안 써진다.
     data/$other 는 직원이 읽고 쓸 수 있어 규칙을 안 고쳐도 된다. */
  const fn = fnBody(ERP, '_markPresenceHour');
  assert.strictEqual(/ref\('billing/.test(fn), false, '쓰기 금지 자리에 쓴다');
  assert.match(fn, /ref\('data\/presence_hours/, '규칙이 열린 자리에 안 둔다');
});

test('실패해도 화면이 안 죽는다 — 자취는 곁다리다', () => {
  const fn = fnBody(ERP, '_markPresenceHour');
  assert.match(fn, /\.catch\(function\(\)\{\}\)/, '쓰기 실패가 밖으로 튄다');
  assert.match(fn, /try\{/, '통째로 감싸지 않았다');
});

/* ── 읽어서 답하는 쪽 (포털 사용액 창) ── */

test('사용액 창이 그 자취를 읽는다', () => {
  const fn = fnBody(P, 'billWhoLoad');
  assert.match(fn, /data\/presence_hours\//, '자취를 안 읽는다');
  assert.match(fn, /\.once\('value'\)/, '구독한다 — 한 번만 읽어야 한다');
});

test('★ 색표 읽듯 «한 번만» 읽는다 — 달을 바꿀 때만 다시', () => {
  const fn = fnBody(P, 'billWhoLoad');
  assert.match(fn, /if\(_billWhoYm === ym && _billWho\) return Promise\.resolve/, '매번 다시 읽는다');
});

test('★ 자취를 먼저 채운 «뒤» 표를 그린다', () => {
  /* 순서가 뒤바뀌면 첫 그림에 「누가」 가 빠지고, 사람은 「안 나온다」고 본다. */
  const fn = fnBody(P, 'billHistLoad');
  const i = fn.indexOf('billWhoLoad(ym)');
  const j = fn.indexOf('HISTORY_ROOT');
  assert.ok(i > 0 && j > i, '사용액을 먼저 읽는다');
});

test('아무도 없던 시간은 «자동» 이라고 말한다', () => {
  /* 빈 칸으로 두면 「모른다」와 구별이 안 된다. 사람이 없었다는 것 자체가 답이다. */
  assert.match(P, /_who\.length \? _who\.join\(', '\) : '자동'/, '자동이라고 안 적는다');
  assert.match(P, /접속한 사람 없음 → 자동/, '왜 자동인지 안 말한다');
});

test('★ 무엇이 자동으로 도는지 «구체적으로» 말한다', () => {
  /* 「자동」만 적으면 무엇이 도는지 몰라 여전히 못 줄인다. */
  /* ⚠ 같은 글이 «칸 읽는 법» 에도 있다 — 전체에서 찾으면 줄 설명을 비워도 통과한다.
     줄에 뜨는 말을 만드는 자리에서 찾는다. */
  const i = P.indexOf('var _auto =');
  assert.ok(i > 0, '줄 설명을 만드는 자리가 없다');
  const line = P.slice(i, P.indexOf('\n', i));
  assert.match(line, /메일 받기 10분마다/, '도는 것을 안 알려 준다');
  assert.match(line, /메일 보내기 15분마다/);
  assert.match(line, /급여자료 30분마다/);
});

test('줄에 손을 대면 이유가 뜬다 — 대표님이 물은 «팝업»', () => {
  assert.match(P, /var _tip = h \+ ':00 — ' \+ _whoTxt/, '이유를 안 만든다');
  assert.match(P, /html \+= '<tr title="' \+ _tip/, '줄에 안 붙인다');
  assert.match(P, /_tip\.replace\(\/"\/g, '&quot;'\)/, '따옴표를 안 막는다 — 표가 깨진다');
});

test('시간 열쇠 모양이 두 쪽에서 맞는다', () => {
  /* 남길 때는 2026-08-25-03, 읽을 때 오는 것은 2026-08-25T03 이다.
     여기가 어긋나면 «늘 자동» 으로 보인다 — 조용한 고장이다. */
  const fn = fnBody(P, 'billWhoAt');
  assert.match(fn, /replace\('T', '-'\)/, 'T 를 - 로 안 바꾼다');
  const ctx = { String, Object };
  vm.createContext(ctx);
  vm.runInContext('var _billWho = { "2026-08-25-03": { "P-001": "권형하" } };\n'
    + fn + '\nthis.f = billWhoAt;', ctx);
  assert.strictEqual(Array.from(ctx.f('2026-08-25T03')).join(','), '권형하', '시각을 못 맞춘다');
  assert.strictEqual(Array.from(ctx.f('2026-08-25T04')).length, 0, '없는 시각에 사람이 나온다');
});

test('열이 하나 늘었으니 머리줄·빈 줄·합계 줄이 다 맞는다', () => {
  /* 한 곳만 고치면 표가 어긋나 읽을 수 없게 된다. */
  assert.match(RAW_P, /<th title="그 시각에 접속해 있던 사람[^>]*>누가<\/th>/, '머리줄에 없다');
  assert.strictEqual(/colspan="7"/.test(RAW_P), false, '빈 줄이 아직 일곱 칸이다');
  const sum = fnBody(P, 'billSumRow');
  assert.match(sum, /<td class="unk"><\/td>/, '합계 줄 칸 수가 안 맞는다');
});

test('「자동」의 뜻을 칸 읽는 법에 적어 두었다', () => {
  assert.match(RAW_P, /그 시각에 접속해 있던 사람/, '뜻풀이가 없다');
  assert.match(RAW_P, /사람 없이 서버가 스스로 돈 것입니다/, '자동이 무슨 뜻인지 안 적는다');
});
