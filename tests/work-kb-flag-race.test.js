'use strict';
// 지식 카드 정정 요청이 서로 지우던 것 — node --test tests/work-kb-flag-race.test.js
//
// 왜: 덮어쓰기 감사(2026-08-15)를 pu-erp 만 했었다. work.html·rules.html 도 훑어 보니
//     「읽어서 붙이고 다시 통째로 쓰는」 자리가 온 시스템에 딱 하나 남아 있었다.
//     둘이 거의 같은 때 [지금은 다름]을 누르면 나중 사람이 앞사람 표시를 지운다.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const work = fs.readFileSync(path.join(root, 'work.html'), 'utf8').replace(/\r\n/g, '\n');

function grab(src, name){
  const i = src.indexOf('function ' + name + '(');
  assert.ok(i >= 0, name + ' 를 찾지 못했다');
  let d = 0, j = i;
  for(;;j++){ if(src[j] === '{') d++; else if(src[j] === '}'){ d--; if(!d){ j++; break; } } }
  return src.slice(i, j);
}
const FLAG = grab(work, 'kbFlag');

/* 트랜잭션이 «하는 일»만 떼어 실제로 돌려 본다.
   ⚠ 자를 때 닫는 괄호를 빠뜨리면 안 된다 — 그러면 함수가 안 만들어진다. */
function txFn(me){
  const from = FLAG.indexOf('function(cur){');
  const to   = FLAG.indexOf('}, function(err,committed)');
  assert.ok(from > 0 && to > from, '트랜잭션 본문을 찾지 못했다');
  const body = FLAG.slice(from, to) + '}';
  const box = { Array };
  vm.createContext(box);
  vm.runInContext('var me=' + JSON.stringify(me) + ';\nthis.f = ' + body + ';', box);
  return box.f;
}

/* ── 읽고 다시 쓰지 않는다 ── */
test('★ 트랜잭션으로 붙인다 (읽기~쓰기 사이가 벌어지지 않게)', () => {
  assert.match(FLAG, /fbDb\.ref\(p\)\.transaction\(function\(cur\)\{/);
  assert.ok(FLAG.indexOf(".once('value')") < 0, '읽어서 통째로 다시 쓰면 앞사람 표시가 지워진다');
});

test('서버에 있던 표시를 그대로 두고 내 것만 더한다', () => {
  const out = txFn({ by:'u2' })([{ by:'u1' }]);
  assert.equal(out.length, 2);
  assert.equal(out[0].by, 'u1', '앞사람 것이 남아야 한다');
  assert.equal(out[1].by, 'u2');
});

test('비어 있어도 터지지 않는다', () => {
  const f = txFn({ by:'u1' });
  assert.equal(f(null).length, 1);
  assert.equal(f(undefined).length, 1);
  assert.equal(f('이상한값').length, 1, '배열이 아니면 빈 것으로 본다');
});

test('★ 받은 것을 고치지 않는다 (slice 로 복사)', () => {
  // 트랜잭션은 서버가 바뀌면 «여러 번» 다시 불린다 — 원본을 만지면 표시가 계속 불어난다
  const f = txFn({ by:'u2' });
  const cur = [{ by:'u1' }];
  f(cur); f(cur); f(cur);
  assert.equal(cur.length, 1);
});

test('안 됐으면 됐다고 하지 않는다', () => {
  assert.match(FLAG, /if\(err\|\|!committed\)\{ toast\('실패: '/);
  assert.ok(FLAG.indexOf("toast('⚠ 정정 요청 표시됨')") > FLAG.indexOf('if(err||!committed)'),
    '실패를 먼저 걸러야 한다');
});

/* ── 다른 데는 이미 괜찮다 ── */
test('★ 읽고 다시 쓰는 자리가 더 없다', () => {
  const files = ['work.html', 'pu-erp.html', 'rules.html']
    .map(f => [f, fs.readFileSync(path.join(root, f), 'utf8').replace(/\r\n/g, '\n')]);
  const left = [];
  files.forEach(function(pair){
    const re = /ref\(([^)]{1,60})\)\.once\('value'\)[\s\S]{0,500}?ref\(([^)]{1,60})\)\.set\(/g;
    let m;
    while((m = re.exec(pair[1]))){
      left.push(pair[0] + ':' + pair[1].slice(0, m.index).split('\n').length);
    }
  });
  assert.deepEqual(left, [], '남은 곳:\n' + left.join('\n'));
});

test('한 건 자리에만 쓰는 것은 그대로 (원래 안전하다)', () => {
  // /items/<id> 처럼 «그 건 자리»에만 쓰면 서버가 알아서 옆 건을 지키지 않는다 → 안전
  assert.match(work, /fbDb\.ref\(NS\+'\/items\/'\+id\)\.set\(rec\)/);
  assert.match(work, /fbDb\.ref\(NS\+'\/kb\/'\+kind\+'\/'\+key\+'\/'\+id\)\.set\(\{/);
});
