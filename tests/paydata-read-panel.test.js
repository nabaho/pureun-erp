'use strict';
// 판독 패널 — 원본 옆 절반. 실행: node --test tests/*.test.js
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

/* ⚠ 잘라 온 함수가 쓰는 **상수**도 함께 넣어야 한다 — 안 넣으면
   ReferenceError 로 터진다(2026-08-14 SHARE_TAG_OPTIONS 에서 같은 일을 겪었다). */
const WAGE_FLAG = html.match(/const WAGE_READ_ON = (?:true|false);/);
assert.ok(WAGE_FLAG, 'WAGE_READ_ON 상수를 찾을 수 없습니다');

function loadApp(appState) {
  const sandbox = { window: {}, console, Date, document: { getElementById: () => null } };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  new vm.Script(store, { filename: 'store.js' }).runInContext(sandbox);
  new vm.Script([
    'const S = window.PuPaydataStore; S.init({uid:"U1"});',
    'const App = ' + JSON.stringify(Object.assign({
      kind: 'attend', viewerId: 'a1', viewingUid: '',
      readState: { status: 'idle', rows: [], err: '' }
    }, appState)) + ';',
    WAGE_FLAG[0],
    cut('esc'), cut('canWrite'), cut('readPanelHtml'),
    'window.App = App; window.readPanelHtml = readPanelHtml;'
  ].join('\n'), { filename: 'app.js' }).runInContext(sandbox);
  return sandbox.window;
}

test('★ 판독 층을 불러온다', () => {
  assert.match(html, /<script src="js\/pu-doc-read\.js">/);
  assert.match(html, /PuDocRead\.init\(/, '키를 어디서 얻는지 판독 층에 알려야 합니다');
});

test('★ 아직 안 읽었으면 「판독하기」 단추가 있다', () => {
  const W = loadApp({ kind: 'attend' });
  const h = W.readPanelHtml();
  assert.match(h, /판독하기/);
  assert.match(h, /doRead\(\)/);
});

test('★ 근로계약서·우리 산출물 탭에는 판독 단추가 없다', () => {
  ['contract', 'output'].forEach(k => {
    const h = loadApp({ kind: k }).readPanelHtml();
    assert.equal(/doRead\(\)/.test(h), false, k + ' 에 판독 단추가 보입니다');
  });
});

test('★ 남의 자리에서는 판독 단추가 없다 — 남의 값을 만들면 안 된다', () => {
  const h = loadApp({ kind: 'attend', viewingUid: 'U2', viewingDeputy: false }).readPanelHtml();
  assert.equal(/doRead\(\)/.test(h), false);
});

test('읽는 중이면 그렇다고 말한다', () => {
  const h = loadApp({ readState: { status: 'reading', rows: [], err: '' } }).readPanelHtml();
  assert.match(h, /읽는 중/);
  assert.equal(/doRead\(\)/.test(h), false, '읽는 중에 또 누르면 두 번 나갑니다');
});

test('실패하면 까닭을 보여주고 다시 누를 수 있다', () => {
  const h = loadApp({ readState: { status: 'err', rows: [], err: 'AI 키가 없습니다' } }).readPanelHtml();
  assert.match(h, /AI 키가 없습니다/);
  assert.match(h, /doRead\(\)/);
});

test('★ 급여대장 판독은 아직 꺼져 있다 — 처리위탁 근거 정리 전', () => {
  // 설계서 9장. 켤 때 이 검사를 함께 고친다.
  assert.match(html, /const WAGE_READ_ON = false/);
  const h = loadApp({ kind: 'ledger' }).readPanelHtml();
  assert.equal(/doRead\(\)/.test(h), false, '아직 켜면 안 됩니다');
  assert.match(h, /준비 중/);
});

test('★ 넓은 판은 판독하는 서류일 때만 — 명함처럼 좁은 것까지 반으로 가르지 않는다', () => {
  const rv = html.match(/function renderViewer\(\)[\s\S]*?\n\}/)[0];
  assert.match(rv, /readPanelHtml\(\)/, '함수만 있고 안 부르면 화면에 아무것도 없습니다');
  assert.match(html, /#readPanel\{[^}]*flex:0 0 50%/, '절반을 쓰는 꾸밈이 없습니다');
});

test('★ 확대(zoom) CSS는 실제로 zoom 클래스가 붙는 요소를 겨냥한다 — 딴 데를 겨냥하면 눌러도 조용히 안 커진다', () => {
  const rv = html.match(/function renderViewer\(\)[\s\S]*?\n\}/)[0];
  const toggle = rv.match(/const (\w+) = \$\('(\w+)'\);[\s\S]*?\1\.classList\.toggle\('zoom'/);
  assert.ok(toggle, 'renderViewer 안에서 zoom 클래스를 토글하는 요소를 찾을 수 없습니다');
  const zoomTargetId = toggle[2];

  const cssRule = html.match(/#(\w+)\.zoom\{/);
  assert.ok(cssRule, '.zoom CSS 규칙을 찾을 수 없습니다');

  assert.equal(cssRule[1], zoomTargetId,
    'zoom 클래스는 #' + zoomTargetId + ' 에 붙는데 CSS는 #' + cssRule[1] +
    ' 을 겨냥합니다 — 사진을 눌러도 확대되지 않습니다');
});

/* ══════ 판독 실행 ══════ */
function loadRun(appState, opts) {
  opts = opts || {};
  const calls = { alerts: [], read: [] };
  // ⚠ opts.defer=true 면 판독기가 바로 답하지 않는다 — calls.resolveRead(...)
  //   / calls.rejectRead(...) 를 부를 때까지 붙들어 둔다. 그 사이에 화면을
  //   다른 서류로 옮겨서 「늦게 온 답」을 흉내 내려는 것이다.
  const sandbox = {
    window: {}, console, Date, Buffer,
    // ⚠ Buffer 를 안 넣으면 S.fileToDataUrl 안의 bytesToBase64 가
    //   (가짜 window 엔 btoa 가 없어) Buffer.from(...) 으로 떨어지다가
    //   vm 안에는 Buffer 가 없어서 ReferenceError 로 조용히 터진다
    //   (tests/paydata-file-dataurl.test.js 와 같은 이유로 넣는다).
    document: { getElementById: () => null },
    alert: m => calls.alerts.push(m),
    PuDocRead: {
      read: p => {
        calls.read.push('read');
        if (opts.defer) return new Promise((res, rej) => { calls.resolveRead = res; calls.rejectRead = rej; });
        return Promise.resolve(opts.readOut || { kind: 'timesheet', fields: {} });
      },
      readWageTable: p => { calls.read.push('wage'); return Promise.resolve(opts.wageOut || { ok: true, rows: [] }); },
      readChangeNotice: p => {
        calls.read.push('notice');
        if (opts.defer) return new Promise((res, rej) => { calls.resolveRead = res; calls.rejectRead = rej; });
        return Promise.resolve(opts.noticeOut || { ok: true, rows: [] });
      }
    }
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  new vm.Script(store, { filename: 'store.js' }).runInContext(sandbox);
  new vm.Script([
    'const S = window.PuPaydataStore;',
    'S.init({uid:"U1", storage:{ref:function(){return{getDownloadURL:function(){return Promise.resolve("https://x/f");}};}},'
      + ' fetch:function(){return Promise.resolve({ok:true,arrayBuffer:function(){return Promise.resolve(new ArrayBuffer(2));}});}});',
    'const PuDocRead = window.PuDocRead || globalThis.PuDocRead;',
    'const App = ' + JSON.stringify(Object.assign({
      kind: 'attend', viewerId: 'a1', viewingUid: '',
      itemsMonth: { a1: { companyId: 'co_1', kind: 'attend', month: '202608', filename: '근태.jpg', file: 'p/a1.jpg', mime: 'image/jpeg' } },
      itemsKeep: {}, companyId: 'co_1', companyName: '화담원', month: '2026-08',
      readState: { status: 'idle', rows: [], err: '' }
    }, appState)) + ';',
    'App.render = function(){};',
    WAGE_FLAG[0],                       // doRead 가 이 상수를 본다 — 안 넣으면 터진다
    cut('esc'), cut('canWrite'), cut('findRow'), cut('doRead'), cut('valueRowsHtml'),
    cut('editVal'), cut('addValRow'), cut('delValRow'),
    'window.App = App; window.doRead = doRead; window.valueRowsHtml = valueRowsHtml;',
    'window.editVal = editVal; window.addValRow = addValRow; window.delValRow = delValRow;'
  ].join('\n'), { filename: 'run.js' }).runInContext(sandbox);
  return { W: sandbox.window, calls };
}

test('★ 근태 탭이면 근태 판독기를 부른다', async () => {
  const { W, calls } = loadRun({ kind: 'attend' }, {
    readOut: { kind: 'timesheet', fields: { rows: [{ name: '배영승', paid: [1, 5], off: [], adj: '', note: '' }] } }
  });
  W.doRead();
  await new Promise(r => setTimeout(r, 10));
  assert.equal(calls.read[0], 'read');
  assert.equal(W.App.readState.status, 'done');
  assert.equal(W.App.readState.rows[0].name, '배영승');
});

test('★ 기타 탭이면 알림 판독기를 부른다', async () => {
  const { W, calls } = loadRun({ kind: 'etc' }, {
    noticeOut: { ok: true, rows: [{ name: '김신입', pairs: [{ item: '입사일', value: '2026-08-12' }] }] }
  });
  W.doRead();
  await new Promise(r => setTimeout(r, 10));
  assert.equal(calls.read[0], 'notice');
  assert.equal(W.App.readState.rows[0].pairs[0].item, '입사일');
});

test('★ 한 줄도 못 읽으면 그렇다고 말한다 — 빈 표를 띄우지 않는다', async () => {
  const { W } = loadRun({ kind: 'etc' }, { noticeOut: { ok: true, rows: [] } });
  W.doRead();
  await new Promise(r => setTimeout(r, 10));
  assert.equal(W.App.readState.status, 'err');
  assert.match(W.App.readState.err, /읽어내지 못했습니다/);
});

test('판독이 실패하면 까닭을 담는다', async () => {
  const { W } = loadRun({ kind: 'etc' }, { noticeOut: { ok: false, error: 'AI 키가 없습니다', rows: [] } });
  W.doRead();
  await new Promise(r => setTimeout(r, 10));
  assert.equal(W.App.readState.status, 'err');
  assert.match(W.App.readState.err, /키/);
});

test('★ 표에 근로자·항목·값이 고칠 수 있게 그려진다', () => {
  const { W } = loadRun({});
  const h = W.valueRowsHtml([{ name: '배영승', pairs: [{ item: '유급일수', value: '3일' }] }]);
  assert.match(h, /배영승/);
  assert.match(h, /유급일수/);
  assert.match(h, /editVal\(/, '칸을 고칠 수 없으면 확인 화면이 아닙니다');
  assert.match(h, /delValRow\(/);
});

test('★ 사람이 고치면 노란 표시가 걷힌다', () => {
  const { W } = loadRun({});
  W.App.readState = { status: 'done', rows: [{ name: '이옥자', pairs: [{ item: '휴무일수', value: '5일' }], iffy: true }], err: '' };
  W.editVal(0, 'name', '이옥자2');
  assert.equal(W.App.readState.rows[0].iffy, false, '확인이 끝난 줄이 계속 노랗게 뜨면 표시를 못 믿습니다');
});

test('줄 더하기·지우기', () => {
  const { W } = loadRun({});
  W.App.readState = { status: 'done', rows: [{ name: 'a', pairs: [{ item: 'x', value: '1' }] }], err: '' };
  W.addValRow();
  assert.equal(W.App.readState.rows.length, 2);
  W.delValRow(0);
  assert.equal(W.App.readState.rows.length, 1);
});

/* ══════ 판독 도중 다른 서류로 옮겨 감 — 늦게 온 답이 새 화면을 덮으면
   엉뚱한 원본이 출처로 붙는다(다음 저장 단계가 App.viewerId 를 출처로 찍는다) ══════ */

test('★ 판독 중 다른 서류로 옮기면 늦게 온 성공 응답이 새 화면을 덮지 않는다', async () => {
  const { W, calls } = loadRun({ kind: 'etc', viewerId: 'a1' }, { defer: true });
  W.doRead();
  await new Promise(r => setTimeout(r, 0));   // 판독기 호출까지는 진행되게 둔다
  assert.equal(W.App.readState.status, 'reading', '아직 판독기가 답하기 전입니다');

  W.App.viewerId = 'a2';   // 사람이 다른 서류로 옮겨 갔다
  calls.resolveRead({ ok: true, rows: [{ name: '김신입', pairs: [{ item: '입사일', value: '2026-08-12' }] }] });
  await new Promise(r => setTimeout(r, 10));

  assert.notEqual(W.App.readState.status, 'done',
    'a1 을 읽은 답이 a2 화면에 그대로 얹혔습니다 — 저장하면 a2 서류가 출처로 찍힙니다');
  assert.equal(W.App.readState.status, 'reading', '옮겨 간 뒤 온 답은 버리고 이전 상태를 지켜야 합니다');
});

test('★ 판독 중 다른 서류로 옮기면 늦게 온 실패 응답도 새 화면에 묻히지 않는다', async () => {
  const { W, calls } = loadRun({ kind: 'etc', viewerId: 'a1' }, { defer: true });
  W.doRead();
  await new Promise(r => setTimeout(r, 0));
  assert.equal(W.App.readState.status, 'reading', '아직 판독기가 답하기 전입니다');

  W.App.viewerId = 'a2';   // 사람이 다른 서류로 옮겨 갔다
  calls.rejectRead(new Error('AI 키가 없습니다'));
  await new Promise(r => setTimeout(r, 10));

  assert.notEqual(W.App.readState.status, 'err',
    'a1 판독 실패가 a2 화면에 까닭으로 얹혔습니다 — a2 와는 상관없는 오류입니다');
  assert.equal(W.App.readState.status, 'reading', '옮겨 간 뒤 온 답은 버리고 이전 상태를 지켜야 합니다');
});
