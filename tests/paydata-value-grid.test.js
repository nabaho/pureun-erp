'use strict';
// 월별 값 표 — 사람이 한 줄, 항목이 가로. 실행: node --test tests/*.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const R = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(R, 'pu-paydata.html'), 'utf8');
const store = fs.readFileSync(path.join(R, 'js', 'pu-paydata-store.js'), 'utf8');

function cut(name) {
  const m = html.match(new RegExp('function ' + name + '\\s*\\([\\s\\S]*?\\n\\}'));
  assert.ok(m, name + ' 함수를 찾을 수 없습니다');
  return m[0];
}

function loadApp(appState) {
  const sandbox = { window: {}, console, Date, document: { getElementById: () => null } };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  new vm.Script(store, { filename: 'store.js' }).runInContext(sandbox);
  new vm.Script([
    'const S = window.PuPaydataStore; S.init({uid:"U1"});',
    'const App = ' + JSON.stringify(Object.assign({
      companyId: 'co_1', companyName: '화담원', month: '2026-08', values: {}
    }, appState)) + ';',
    cut('esc'), cut('valueGridModel'), cut('screenValues'),
    'window.App = App; window.valueGridModel = valueGridModel; window.screenValues = screenValues;'
  ].join('\n'), { filename: 'app.js' }).runInContext(sandbox);
  return sandbox.window;
}

const VALS = {
  v1: { companyId: 'co_1', month: '202608', name: '배영승', sourceId: 'a1', confirmed: false,
        pairs: [{ item: '유급일수', value: '3일' }, { item: '기본급', value: '3,200,000' }] },
  v2: { companyId: 'co_1', month: '202608', name: '이옥자', sourceId: 'a2', confirmed: true,
        pairs: [{ item: '유급일수', value: '3일' }] }
};

test('★ 사람이 한 줄로 모인다', () => {
  const W = loadApp({});
  const g = W.valueGridModel(VALS);
  assert.equal(g.people.length, 2);
  assert.equal(g.people[0].name, '배영승');
});

test('★ 항목이 가로 열이 된다 — 처음 나온 차례대로', () => {
  const W = loadApp({});
  const g = W.valueGridModel(VALS);
  assert.equal(g.items.join(','), '유급일수,기본급');
});

test('★ 값마다 출처가 남는다', () => {
  const W = loadApp({});
  const g = W.valueGridModel(VALS);
  assert.equal(g.people[0].cells['유급일수'].sourceId, 'a1');
});

test('★ 같은 사람의 값은 한 줄로 합쳐진다 — 서류가 달라도', () => {
  const W = loadApp({});
  const g = W.valueGridModel({
    v1: { name: '배영승', sourceId: 'a1', pairs: [{ item: '유급일수', value: '3일' }] },
    v2: { name: '배영승', sourceId: 'a2', pairs: [{ item: '기본급', value: '1' }] }
  });
  assert.equal(g.people.length, 1);
  assert.equal(g.items.length, 2);
});

test('자료가 없어도 터지지 않는다', () => {
  const W = loadApp({});
  assert.equal(W.valueGridModel(null).people.length, 0);
  assert.equal(W.valueGridModel({}).items.length, 0);
});

test('★ 없는 항목은 0 이 아니라 － 로 보인다', () => {
  const W = loadApp({ values: VALS });
  const h = W.screenValues();
  assert.match(h, /－/, '0 으로 두면 「0원」과 「안 왔음」이 구별되지 않습니다');
});

test('★ 확인 안 된 값은 노랗게', () => {
  const W = loadApp({ values: VALS });
  assert.match(W.screenValues(), /class="[^"]*iffy/);
});

test('★ 값을 누르면 출처 원본이 열린다', () => {
  const W = loadApp({ values: VALS });
  assert.match(W.screenValues(), /openViewer\('a1'\)/);
});

test('값이 없으면 빈 안내를 보여준다', () => {
  const W = loadApp({ values: {} });
  assert.match(W.screenValues(), /아직 정리된 값이 없습니다/);
});

test('★ 서랍에서 「이 달 값 보기」로 들어갈 수 있다', () => {
  assert.match(html, /App\.go\(\\?'values\\?'/, '들어갈 길이 없으면 만든 화면이 아닙니다');
});

/* Firebase .val()의 키 차례는 저장 차례와 무관하다 — valueGridModel 이 원본
   Object.keys 차례 그대로 돌면, 열 순서와 값 충돌 승자가 새로고침마다
   바뀔 수 있다. 아래 두 시험은 "at(저장 시각) 오름차순, 같으면 id" 로
   줄을 세워야만 통과한다 — 원본 키 차례로는 통과하지 못하게 일부러
   키 이름과 at 값의 차례를 어긋나게 짰다. */
const RACE = {
  // 객체 리터럴 삽입 차례: vZ, vA — 하지만 at 은 vA(1)가 vZ(5)보다 이르다.
  vZ: { name: '박서준', sourceId: 's-z', confirmed: true, at: 5,
        pairs: [{ item: '기본급', value: '100' }] },
  vA: { name: '박서준', sourceId: 's-a', confirmed: true, at: 1,
        pairs: [{ item: '유급일수', value: '3일' }] }
};

test('★ 열 순서는 원본 키 차례가 아니라 at 오름차순이다', () => {
  const W = loadApp({});
  const g = W.valueGridModel(RACE);
  // 삽입 차례(vZ→vA)대로 돌면 '기본급,유급일수'가 되어 이 시험은 실패한다.
  assert.equal(g.items.join(','), '유급일수,기본급',
    'at 이 이른 vA(유급일수)가 먼저, 늦은 vZ(기본급)가 나중이어야 합니다');
});

test('★ 같은 사람·같은 항목이 겹치면 at 이 더 늦은(나중에 저장한) 값이 남는다', () => {
  const W = loadApp({});
  const g = W.valueGridModel({
    // 삽입 차례는 "나중 값"이 먼저 온다 — 원본 키 차례 그대로 마지막에 덮으면
    // 오히려 "먼저 저장한" 값이 남아버려, 이 시험은 옛 코드에서 실패한다.
    rLater: { name: '김하늘', sourceId: 's-later', confirmed: true, at: 200,
              pairs: [{ item: '기본급', value: '2000' }] },
    rEarlier: { name: '김하늘', sourceId: 's-earlier', confirmed: true, at: 100,
                pairs: [{ item: '기본급', value: '1000' }] }
  });
  assert.equal(g.people[0].cells['기본급'].value, '2000',
    '나중에 저장한(at 이 더 큰) 값이 살아남아야 합니다');
});

test('★ 출처 없는 칸은 클릭할 수 있는 척하지 않는다(src 클래스 없음)', () => {
  const W = loadApp({ values: {
    a: { name: '무출처', sourceId: '', confirmed: true, at: 1,
         pairs: [{ item: '항목1', value: '10' }] },
    b: { name: '유출처', sourceId: 's1', confirmed: true, at: 2,
         pairs: [{ item: '항목1', value: '20' }] }
  } });
  const h = W.screenValues();
  const noSrc = h.match(/<td class="who">무출처<\/td><td class="([^"]*)"/);
  const hasSrc = h.match(/<td class="who">유출처<\/td><td class="([^"]*)"/);
  assert.ok(noSrc, '무출처 행을 찾을 수 없습니다');
  assert.ok(hasSrc, '유출처 행을 찾을 수 없습니다');
  assert.ok(!/\bsrc\b/.test(noSrc[1]),
    '출처가 없는 칸은 눌러도 아무 일이 없으니 src 클래스(커서·밑줄)를 붙이면 안 됩니다');
  assert.ok(/\bsrc\b/.test(hasSrc[1]),
    '출처가 있는 칸은 원본을 열 수 있어야 하니 src 클래스가 있어야 합니다');
});

/* ══════ 내보내기 ══════ */
function loadOut(companyName) {
  const saved = { blob: null, name: '', copied: '' };
  const sandbox = {
    window: {}, console, Date, Blob: function (parts, o) { this.parts = parts; this.type = o && o.type; },
    document: { getElementById: () => null },
    navigator: { clipboard: { writeText: t => { saved.copied = t; return Promise.resolve(); } } },
    alert: () => {}
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  new vm.Script(store, { filename: 'store.js' }).runInContext(sandbox);
  new vm.Script([
    'const S = window.PuPaydataStore; S.init({uid:"U1"});',
    'const App = ' + JSON.stringify({
      companyId: 'co_1', companyName: companyName || '화담원', month: '2026-08',
      values: {
        v1: { companyId: 'co_1', name: '배영승', sourceId: 'a1',
              pairs: [{ item: '유급일수', value: '3일' }, { item: '비고', value: '가,나' }] }
      }
    }) + ';',
    'function saveBlob(b, n){ __b = b; __n = n; }',
    'var __b = null, __n = "";',
    cut('esc'), cut('valueGridModel'), cut('csvEsc'), cut('valuesTable'),
    cut('valuesCsv'), cut('valuesCopy'),
    'window.App = App; window.csvEsc = csvEsc; window.valuesTable = valuesTable;',
    'window.valuesCsv = valuesCsv; window.valuesCopy = valuesCopy;',
    'window.__blob = function(){ return __b; }; window.__name = function(){ return __n; };'
  ].join('\n'), { filename: 'out.js' }).runInContext(sandbox);
  return { W: sandbox.window, saved };
}

test('★ 쉼표 든 칸을 감싼다 — 안 감싸면 열이 밀린다', () => {
  const { W } = loadOut();
  assert.equal(W.csvEsc('가,나'), '"가,나"');
  assert.equal(W.csvEsc('그냥'), '그냥');
  assert.equal(W.csvEsc('말"표'), '"말""표"');
});

/* 줄바꿈(\n)뿐 아니라 캐리지리턴(\r) 하나만 든 값도 감싸야 한다 —
   붙여넣기로 들어온 값에는 개행이 \r 하나로만 남는 경우가 있다. */
test('★ 캐리지리턴(\\r) 하나만 있어도 감싼다', () => {
  const { W } = loadOut();
  assert.equal(W.csvEsc('가\r나'), '"가\r나"');
});

test('★ 표 머리에 근로자와 항목이 차례대로 온다', () => {
  const { W } = loadOut();
  const t = W.valuesTable();
  assert.equal(t.head.join(','), '근로자,유급일수,비고');
  assert.equal(t.body[0][0], '배영승');
});

test('★ 엑셀에서 한글이 안 깨진다 (BOM)', () => {
  const { W } = loadOut();
  W.valuesCsv();
  const b = W.__blob();
  assert.ok(b, '내려받지 않았습니다');
  assert.match(b.parts[0], /^﻿/, 'BOM 이 없으면 엑셀에서 한글이 깨집니다');
  assert.match(W.__name(), /화담원/);
  assert.match(W.__name(), /\.csv$/);
});

test('★ 복사는 탭으로 나눈다 — 엑셀에 바로 붙는다', () => {
  const { W, saved } = loadOut();
  W.valuesCopy();
  assert.match(saved.copied, /근로자\t유급일수/);
  assert.match(saved.copied, /배영승\t3일/);
});

/* BOM으로 시작하는지만 보면 머리글·본문이 통째로 빠져도 시험이 통과해 버린다.
   실제로 만들어진 CSV 안에 머리글 줄과 사람 줄이 그대로 들어있는지까지 본다. */
test('★ 실제 CSV 출력 안에 머리글 줄과 사람 줄이 그대로 있다', () => {
  const { W } = loadOut();
  W.valuesCsv();
  const b = W.__blob();
  const text = b.parts[0].replace(/^﻿/, '');
  const lines = text.split('\r\n');
  assert.equal(lines[1], '근로자,유급일수,비고', '머리글 줄이 그대로 있어야 합니다');
  assert.equal(lines[2], '배영승,3일,"가,나"', '사람 줄이 그대로 있고 쉼표 든 칸은 따옴표로 감싸져야 합니다');
});

/* csvEsc 단위 시험만으로는 실제 내보내기 경로(valuesCsv)가 그 함수를 쓰는지 증명하지 못한다.
   loadOut()의 「비고: 가,나」칸이 진짜 valuesCsv() 출력에서 따옴표로 감싸지는지 직접 본다. */
test('★ 쉼표 든 칸은 실제 valuesCsv() 출력에서도 따옴표로 감싸진다', () => {
  const { W } = loadOut();
  W.valuesCsv();
  const b = W.__blob();
  const text = b.parts[0].replace(/^﻿/, '');
  assert.match(text, /"가,나"/, '비고 칸(가,나)이 실제 출력에서 따옴표로 감싸져야 합니다');
});

/* 복사(TSV)는 탭으로 칸을 나누므로 쉼표는 감쌀 필요가 없지만, 값 자체는
   훼손되거나 다른 칸으로 밀리지 않고 그대로 살아남아야 한다. */
test('★ 쉼표 든 칸은 복사(탭 구분) 결과에도 그대로 살아남는다', () => {
  const { W, saved } = loadOut();
  W.valuesCopy();
  assert.match(saved.copied, /배영승\t3일\t가,나/, '쉼표 든 칸이 훼손되거나 다른 칸으로 밀리면 안 됩니다');
});

/* 회사이름에도 쉼표·따옴표가 들어갈 수 있다(한국 상호명에 흔함).
   제목 줄만 csvEsc를 안 거치면 첫 줄이 깨져 그 아래 모든 열이 밀린다. */
test('★ 회사이름에 쉼표가 있으면 제목 줄도 따옴표로 감싸진다', () => {
  const { W } = loadOut('화,담원');
  W.valuesCsv();
  const b = W.__blob();
  const text = b.parts[0].replace(/^﻿/, '');
  const lines = text.split('\r\n');
  assert.equal(lines[0], '"화,담원 2026-08 값"', '제목 줄도 다른 줄처럼 csvEsc를 거쳐야 합니다');
});
