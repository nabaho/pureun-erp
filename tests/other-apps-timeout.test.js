'use strict';
// 나머지 앱의 바깥 부름에 시간 제한 — node --test tests/other-apps-timeout.test.js
//
// 왜: pu-erp·업무관리는 이미 막았는데(#205·#210) 경력관리·기업정보함은 안 봤었다.
//     둘 다 OCR·AI 를 부르는데 시간 제한이 «하나도» 없었다. 답이 안 오면:
//       경력관리 — 「⏳ 원문 추출 중…」 이 그대로 굳고, 여러 파일 일괄 읽기는 그 파일에서 멈춘다
//       기업정보함   — 창고에서 사진 받기가 안 끝나고, 「AI 연결 확인 중…」 은 아무 말도 안 해 준다
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8').replace(/\r\n/g, '\n');
const kc = read('kcareer.html');
const pc = read('pu-cards.html');

function grab(src, name){
  const i = src.indexOf('function ' + name + '(');
  assert.ok(i >= 0, name + ' 를 찾지 못했다');
  let d = 0, j = i;
  for(;;j++){ if(src[j] === '{') d++; else if(src[j] === '}'){ d--; if(!d){ j++; break; } } }
  return src.slice(i, j);
}

/* ── 빠짐없이 걸렸나 ── */
function 남은부름(src, wrapper){
  const left = [];
  src.split('\n').forEach(function(t, i){
    if(!/\bfetch\(/.test(t)) return;
    if(new RegExp(wrapper + '\\(').test(t)) return;
    if(/return fetch\(url, opts\)|return fetch\(url, o\)/.test(t)) return;   // 감싸개 자신
    if(!/https?:\/\/|\(url\)/.test(t)) return;
    left.push((i + 1) + ': ' + t.trim().slice(0, 80));
  });
  return left;
}

/* ⚠ 2026-08-17 — 여기서 「몇 곳」인지 **개수를 못 박았다가** 판독을 서버로 옮길 때
   깨졌다. 부름이 공용 호출기로 옮겨 가면서 수가 줄었을 뿐, 시간 제한은 그대로
   붙어 있었다(감싸개를 호출기에 넘겨 준다). 고침이 옳았는데 검사가 막은 것이다.
   그래서 개수 대신 **「시간 제한 없는 부름이 남았나」**만 본다 — 그게 이 검사의 뜻이다.
   감싸개를 아예 안 쓰게 되는 것도 막아야 하므로 최소 한 곳은 쓰는지만 확인한다. */
function 감싸개쓰나(src, wrapper){
  const decl = src.indexOf('function ' + wrapper + '(');
  const re = new RegExp(wrapper + '\\b', 'g');
  let m, n = 0;
  while((m = re.exec(src))) if(m.index !== decl + 'function '.length) n++;
  return n;
}

test('★ 경력관리에 시간 제한 없는 바깥 부름이 없다', () => {
  assert.deepEqual(남은부름(kc, 'kcFetch'), []);
  assert.ok(감싸개쓰나(kc, 'kcFetch') >= 2, '감싸개를 아무 데서도 안 쓴다');
});

test('★ 기업정보함에 시간 제한 없는 바깥 부름이 없다', () => {
  assert.deepEqual(남은부름(pc, 'pcFetch'), []);
  assert.ok(감싸개쓰나(pc, 'pcFetch') >= 2, '감싸개를 아무 데서도 안 쓴다');
});

/* 공용 호출기에도 감싸개를 넘겨야 시간 제한이 따라간다 —
   호출기 안에는 시간 제한이 없고, 넘겨받은 fetch 를 그대로 쓴다. */
test('★ 서버 판독을 부를 때도 감싸개를 넘긴다', () => {
  assert.match(kc, /PuAiCall\.ask\([\s\S]{0,200}?fetch:\s*kcFetch/,
    '맨 fetch 로 부르면 답이 안 올 때 화면이 굳는다');
  assert.match(pc, /PuAiCall\.ask\([\s\S]{0,200}?fetch:\s*pcFetch/,
    '맨 fetch 로 부르면 답이 안 올 때 화면이 굳는다');
});

test('앞서 고친 두 앱도 그대로다', () => {
  const erp = read('pu-erp.html'), work = read('work.html');
  assert.deepEqual(남은부름(erp, 'fetchT'), []);
  assert.deepEqual(남은부름(work, 'aiFetch'), []);
});

/* ── 감싸개가 제대로 도나 ── */
function sandbox(src, name, waitVar){
  const box = { setTimeout, clearTimeout, Error, Math, Object, Promise };
  vm.createContext(box);
  vm.runInContext('var ' + waitVar + ' = 60000;\n' + grab(src, name) + '\nthis.f = ' + name + ';', box);
  return box;
}

[['경력관리', () => sandbox(kc, 'kcFetch', 'KC_WAIT_MS')],
 ['기업정보함',   () => sandbox(pc, 'pcFetch', 'PC_WAIT_MS')]].forEach(function(pair){
  const [이름, make] = pair;

  test(이름 + ' — 시간이 지나면 끊고, 끊겼다고 표시한다', async () => {
    const b = make();
    b.AbortController = class { constructor(){ this.signal = { aborted:false }; }
      abort(){ this.signal.aborted = true; if(this.signal._on) this.signal._on(); } };
    b.fetch = (u, o) => new Promise(function(_, rej){
      o.signal._on = function(){ const e = new Error('aborted'); e.name = 'AbortError'; rej(e); };
    });
    await assert.rejects(b.f('u', {}, 30), function(e){
      assert.equal(e.timeout, true);
      assert.match(e.message, /초 안에 답이 오지 않았습니다/);
      return true;
    });
  });

  test(이름 + ' — 제때 오면 그대로 돌려주고 시계를 푼다', async () => {
    const b = make();
    let cleared = false;
    b.clearTimeout = function(t){ cleared = true; clearTimeout(t); };
    b.AbortController = class { constructor(){ this.signal = {}; } abort(){} };
    b.fetch = () => Promise.resolve({ ok:true, tag:'답' });
    assert.equal((await b.f('u', {})).tag, '답');
    assert.equal(cleared, true, '시계를 안 풀면 나중에 헛되이 끊는다');
  });

  test(이름 + ' — 그냥 실패한 것은 끊긴 것으로 바꾸지 않는다', async () => {
    const b = make();
    b.AbortController = class { constructor(){ this.signal = {}; } abort(){} };
    b.fetch = () => Promise.reject(new Error('네트워크 없음'));
    await assert.rejects(b.f('u', {}), e => e.timeout === undefined && e.message === '네트워크 없음');
  });

  test(이름 + ' — ★ 넘겨받은 것을 고치지 않는다', () => {
    const b = make();
    b.AbortController = class { constructor(){ this.signal = 'SIG'; } abort(){} };
    let got = null;
    b.fetch = (u, o) => { got = o; return Promise.resolve({}); };
    const opts = { method:'POST', body:'x' };
    b.f('u', opts);
    assert.equal(opts.signal, undefined, '고치면 다음 호출에 지난 signal 이 남아 곧바로 끊긴다');
    assert.equal(got.method, 'POST');
    assert.equal(got.body, 'x');
    assert.equal(got.signal, 'SIG');
  });

  test(이름 + ' — 끊을 수 없는 옛 브라우저는 그냥 지나간다', async () => {
    const b = make();
    b.AbortController = undefined;
    b.fetch = () => Promise.resolve({ ok:true });
    assert.equal((await b.f('u', {})).ok, true);
  });
});

/* ── 앞 script 에 둔 것이 뒤 script 에서도 쓰이는가 ── */
test('★ 기업정보함 감싸개는 부름들보다 «앞» 에 있다 (뒤 script 에서도 쓰려면)', () => {
  /* ⚠ 예전에는 부르는 자리를 **글자 그대로** 적어 두었는데, 그 중 하나가
     구글을 직접 부르는 줄이었다. 2026-08-17 에 판독을 서버로 옮기며 그 줄이
     없어지자 이 검사가 「없다」고 깨졌다 — 고침이 옳았는데 검사가 막았다.
     그래서 자리를 못 박지 않고 **부르는 자리를 전부 찾아** 앞뒤만 본다. */
  const at = pc.indexOf('function pcFetch(');
  assert.ok(at > 0, 'pcFetch 선언을 찾지 못했다');
  const uses = [];
  const re = /pcFetch\b/g;
  let m;
  while ((m = re.exec(pc))) if (m.index !== at + 'function '.length) uses.push(m.index);
  assert.ok(uses.length >= 2, '쓰는 자리가 너무 적다(' + uses.length + ') — 감싸개를 안 쓰게 된 것 아닌가');
  uses.forEach(function (i) {
    assert.ok(i > at, pc.slice(i - 40, i + 20).trim() + ' 보다 먼저 선언돼야 한다');
  });
});

test('★ 경력관리 감싸개는 «같은 script» 안에 있다 (끌어올리기로 잡힌다)', () => {
  /* 여기서는 감싸개가 부름보다 «뒤» 에 있다. 그래도 되는 까닭은 함수 선언이
     그 script 맨 위로 끌어올려지기 때문이다 — 단, 같은 script 여야 한다.
     다른 script 로 옮기면 조용히 ReferenceError 가 난다. */
  const marks = [];
  const re = /<script(?![^>]*\ssrc=)[^>]*>/g;
  let m;
  while((m = re.exec(kc))) marks.push(m.index);
  const sc = i => { let x = 0; for(let j = 0; j < marks.length; j++) if(marks[j] <= i) x = j; return x; };

  const 감싸개 = sc(kc.indexOf('function kcFetch('));
  const 부름들 = new Set();
  const re2 = /await kcFetch\(/g;
  let m2;
  while((m2 = re2.exec(kc))) 부름들.add(sc(m2.index));
  assert.deepEqual([...부름들], [감싸개], '부름이 감싸개와 다른 script 에 있으면 안 된다');
});

/* ── 왜 60초인가 ── */
test('문서를 통째로 보내는 부름이라 넉넉히 준다', () => {
  assert.match(kc, /var KC_WAIT_MS = 60000;/);
  assert.match(pc, /var PC_WAIT_MS = 60000;/);
  assert.match(kc, /문서를 통째로 보내는 부름이라 넉넉히/);
});
