'use strict';
// 멈춤에 이름 붙이기 — node --test tests/erp-stall-blame.test.js
//
// 왜: 2026-08-15 콘솔에 「🐢 화면 멈춤 581ms」가 떴는데
//     「🐌 느린 화면」도 「🐌 느린 타이머」도 하나도 없었다.
//     즉 멈춘 것은 «화면 그리기도 타이머도 아니다». 감지기는 얼마나 멈췄는지만
//     알려 주니, 무거운 일이 스스로 이름을 남기게 하고 겹치는 것을 찾아 함께 찍는다.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const app = fs.readFileSync(path.join(__dirname, '..', 'pu-erp.html'), 'utf8').replace(/\r\n/g, '\n');

/* ── 이름을 남기는 쪽 ── */
function markFn(){
  const i = app.indexOf('window.erpBlameMark = function(name, t0){');
  const j = app.indexOf('};', app.indexOf('if(b.length > 60) b.shift();')) + 2;
  const box = { window:{ _erpBlame:[] }, performance:{ now:() => box._now } };
  box._now = 0;
  vm.createContext(box);
  vm.runInContext(app.slice(i, j), box);
  return box;
}

test('오래 걸린 일만 남긴다 (잔일까지 남기면 도리어 안 보인다)', () => {
  const b = markFn();
  b._now = 10; b.window.erpBlameMark('짧은 일', 0);      // 10ms
  assert.equal(b.window._erpBlame.length, 0);
  b._now = 200; b.window.erpBlameMark('긴 일', 0);       // 200ms
  assert.equal(b.window._erpBlame.length, 1);
  assert.equal(b.window._erpBlame[0].n, '긴 일');
});

test('시작·끝 시각을 함께 남긴다 (멈춤과 겹치는지 보려면 있어야 한다)', () => {
  const b = markFn();
  b._now = 500; b.window.erpBlameMark('저장 cases', 100);
  const e = b.window._erpBlame[0];
  assert.equal(e.a, 100);
  assert.equal(e.z, 500);
});

test('끝없이 쌓이지 않는다', () => {
  const b = markFn();
  for(let i = 0; i < 100; i++){ b._now = (i+1) * 100; b.window.erpBlameMark('일' + i, i * 100); }
  assert.equal(b.window._erpBlame.length, 60);
  assert.equal(b.window._erpBlame[59].n, '일99', '최근 것이 남는다');
});

test('터져도 앱을 막지 않는다', () => {
  const b = markFn();
  b.performance = null;                                  // 잴 수 없는 상황
  assert.doesNotThrow(() => b.window.erpBlameMark('x', 0));
});

/* ── 겹치는 것을 찾아 찍는 쪽 ── */
function blameOf(entry, list){
  const box = { out:null, window:{ _erpBlame:list },
    console:{ warn(m){ box.out = m; } }, Date, Math };
  vm.createContext(box);
  vm.runInContext(`
    var e = ${JSON.stringify(entry)};
    var who='무엇인지 못 잡음 — 아직 이름표가 안 붙은 일입니다';
    try{
      var end=e.startTime+e.duration;
      var hit=(window._erpBlame||[]).filter(function(x){ return x.z>e.startTime && x.a<end; });
      hit.sort(function(p,q){ return (q.z-q.a)-(p.z-p.a); });
      if(hit.length) who=hit.slice(0,3).map(function(x){ return x.n+' '+Math.round(x.z-x.a)+'ms'; }).join(' · ');
    }catch(_){}
    console.warn('🐢 화면 멈춤 '+Math.round(e.duration)+'ms — '+who);
  `, box);
  return box.out;
}

test('★ 그 멈춤과 겹치는 일을 찾아낸다', () => {
  const out = blameOf({ startTime:1000, duration:581 }, [
    { n:'동기화 적용 cases', a:1010, z:1520 },
    { n:'딴 때 한 일',       a:100,  z:200  },
  ]);
  assert.match(out, /동기화 적용 cases 510ms/);
  assert.ok(out.indexOf('딴 때 한 일') < 0, '겹치지 않는 것은 빼야 한다');
});

test('오래 걸린 순으로, 셋까지만', () => {
  const out = blameOf({ startTime:0, duration:900 }, [
    { n:'ㄱ', a:0, z:50 }, { n:'ㄴ', a:0, z:400 },
    { n:'ㄷ', a:0, z:200 }, { n:'ㄹ', a:0, z:300 },
  ]);
  assert.match(out, /^🐢 화면 멈춤 900ms — ㄴ 400ms · ㄹ 300ms · ㄷ 200ms$/);
});

test('★ 못 찾으면 「모른다」고 한다 (엉뚱한 것을 지목하지 않게)', () => {
  const out = blameOf({ startTime:5000, duration:300 }, [{ n:'딴 일', a:0, z:100 }]);
  assert.match(out, /무엇인지 못 잡음 — 아직 이름표가 안 붙은 일입니다/);
});

test('이름표가 하나도 없어도 터지지 않는다', () => {
  assert.match(blameOf({ startTime:0, duration:250 }, []), /무엇인지 못 잡음/);
});

/* ── 어디에 이름표를 씌웠나 ── */
test('저장·동기화 적용·처음 읽기에 씌웠다', () => {
  assert.match(app, /window\.erpBlameMark\('저장 '\+k, t0\)/);
  assert.match(app, /window\.erpBlameMark\('동기화 적용 '\+k, t0\)/);
  assert.match(app, /window\.erpBlameMark\('처음 읽기 '\+k, _t0\)/);
});

test('★ 재는 것이 앱을 바꾸지 않는다', () => {
  const w = app.slice(app.indexOf("if(typeof dbSet === 'function')"), app.indexOf('function dbGet(k, def){'));
  assert.match(w, /try \{ return _dsRaw\.apply\(this, arguments\); \}\s*\n\s*finally/);
  assert.match(w, /try \{ return _faRaw\.apply\(this, arguments\); \}\s*\n\s*finally/);
  assert.ok(w.indexOf('catch') < 0 || /catch\(e\)\{\}/.test(w), '오류를 삼키면 안 된다 — finally 로만 잰다');
});

test('처음 읽을 때만 잰다 (캐시에 있으면 재지 않는다)', () => {
  const g = app.slice(app.indexOf('function dbGet(k, def){'), app.indexOf('function dbGet(k, def){') + 900);
  assert.match(g, /if\(_dbCache\.hasOwnProperty\(k\)\)\{/);
  // 재는 줄이 «캐시에 없을 때» 가지 안에 있어야 한다
  assert.ok(g.indexOf('var _t0 =') > g.indexOf('} else {'));
});

test('이름표는 감지기보다 먼저 준비된다', () => {
  assert.ok(app.indexOf('window._erpBlame = [];') < app.indexOf("po.observe({entryTypes:['longtask']})"));
});

test('한 script 안이라 끌어올리기가 통한다', () => {
  // 감싸는 곳이 dbSet·_fbApplyRecord 선언보다 «앞» 이지만 같은 script 라 잡힌다
  const wrapAt = app.indexOf("if(typeof dbSet === 'function')");
  assert.ok(wrapAt < app.indexOf('function dbSet(k, v){'));
  assert.ok(wrapAt < app.indexOf('function _fbApplyRecord(k, v, opts){'));
  const scriptStart = app.lastIndexOf('<script', wrapAt);
  const scriptEnd = app.indexOf('</script>', scriptStart);
  assert.ok(app.indexOf('function _fbApplyRecord(k, v, opts){') < scriptEnd, '같은 script 여야 한다');
});
