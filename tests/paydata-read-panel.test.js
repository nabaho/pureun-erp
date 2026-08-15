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

const NOTICE_FLAG = html.match(/const NOTICE_READ_ON = (?:true|false);/);
assert.ok(NOTICE_FLAG, 'NOTICE_READ_ON 상수를 찾을 수 없습니다');

/* $ 는 화살표 함수라 cut() 으로 못 잘라 온다 — 실제 정의를 그대로 가져다 쓴다. */
const DOLLAR = html.match(/const \$ = [^\r\n]+/);
assert.ok(DOLLAR, '$ 정의를 찾을 수 없습니다');

/* ⚠ 판독 방식은 **열려 있는 서류**가 정한다(서랍 탭이 아니다) — 그래서 시험도
   그 서류를 실제로 서랍에 넣어 둔다. appState.kind 는 서랍 탭이자 그 서류의
   종류이고, rec 로 다른 종류·다른 파일형식을 따로 줄 수 있다. */
function loadApp(appState, rec) {
  const st = Object.assign({
    kind: 'attend', viewerId: 'a1', viewingUid: '',
    readState: { status: 'idle', rows: [], err: '' }
  }, appState);
  st.itemsMonth = { a1: Object.assign({
    companyId: 'co_1', kind: st.kind, month: '202608',
    filename: '근태.jpg', file: 'p/a1.jpg', mime: 'image/jpeg'
  }, rec || {}) };
  st.itemsKeep = {};
  const sandbox = { window: {}, console, Date, document: { getElementById: () => null } };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  new vm.Script(store, { filename: 'store.js' }).runInContext(sandbox);
  new vm.Script([
    'const S = window.PuPaydataStore; S.init({uid:"U1"});',
    'const App = ' + JSON.stringify(st) + ';',
    WAGE_FLAG[0], NOTICE_FLAG[0],
    cut('esc'), cut('canWrite'), cut('findRow'), cut('isImageRec'),
    cut('valueRowsHtml'), cut('readPanelHtml'),
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

test('★ 확실하지 않은 줄이 있으면 몇 줄인지 알린다 — 그 띠는 나중에 걷을 수 있어야 한다', () => {
  const h = loadApp({ readState: { status: 'done', err: '', rows: [
    { name: '배영승', pairs: [{ item: '유급일수', value: '3일' }], iffy: true },
    { name: '이옥자', pairs: [{ item: '유급일수', value: '5일' }] }
  ] } }).readPanelHtml();
  assert.match(h, /1줄<\/b>은 확실하지 않습니다/);
  assert.match(h, /id="iffyLine"/,
    '이름표가 없으면 사람이 그 줄을 고쳐도 띠를 걷을 수 없어 표를 통째로 다시 그려야 합니다');
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

/* 서랍 탭(kind)과 **같은 종류의 서류**를 실제로 서랍에 넣어 둔다 — 판독 방식은
   열려 있는 서류가 정하기 때문이다. opts.rec 로 그 서류의 종류·파일형식(PDF 등)만
   따로 바꿀 수 있다. */
function runState(appState, opts) {
  const st = Object.assign({
    kind: 'attend', viewerId: 'a1', viewingUid: '',
    itemsKeep: {}, companyId: 'co_1', companyName: '화담원', month: '2026-08',
    readState: { status: 'idle', rows: [], err: '' }
  }, appState);
  if (!st.itemsMonth) {
    st.itemsMonth = {};
    st.itemsMonth[st.viewerId] = Object.assign({
      companyId: 'co_1', kind: st.kind, month: '202608',
      filename: '근태.jpg', file: 'p/a1.jpg', mime: 'image/jpeg'
    }, (opts && opts.rec) || {});
  }
  return st;
}

function loadRun(appState, opts) {
  opts = opts || {};
  const calls = { alerts: [], read: [] };
  // ⚠ opts.defer=true 면 판독기가 바로 답하지 않는다 — calls.resolveRead(...)
  //   / calls.rejectRead(...) 를 부를 때까지 붙들어 둔다. 그 사이에 화면을
  //   다른 서류로 옮겨서 「늦게 온 답」을 흉내 내려는 것이다.
  /* opts.dom=true 면 화면 요소가 있는 척한다 — 「고치면 노란 칠이 곧바로 걷히는가」를
     보려면 실제로 손댈 요소가 있어야 한다(줄은 노란 채로 시작한다). */
  const els = calls.els = {};
  const sandbox = {
    window: {}, console, Date, Buffer,
    // ⚠ Buffer 를 안 넣으면 S.fileToDataUrl 안의 bytesToBase64 가
    //   (가짜 window 엔 btoa 가 없어) Buffer.from(...) 으로 떨어지다가
    //   vm 안에는 Buffer 가 없어서 ReferenceError 로 조용히 터진다
    //   (tests/paydata-file-dataurl.test.js 와 같은 이유로 넣는다).
    document: {
      getElementById: id => {
        if (!opts.dom) return null;
        if (!els[id]) els[id] = { id: id, className: /^vrow_/.test(id) ? 'iffy' : '', style: {}, innerHTML: '' };
        return els[id];
      }
    },
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
    'const App = ' + JSON.stringify(runState(appState, opts)) + ';',
    'App.render = function(){};',
    WAGE_FLAG[0], NOTICE_FLAG[0],       // doRead 가 이 상수들을 본다 — 안 넣으면 터진다
    DOLLAR[0],
    cut('esc'), cut('canWrite'), cut('findRow'), cut('isImageRec'), cut('doRead'), cut('valueRowsHtml'),
    cut('editVal'), cut('refreshIffyMarks'), cut('addValRow'), cut('delValRow'),
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

/* ══════ 알림(기타 탭) 판독은 꺼 둔다 — 대표 결정 2026-08-15 ══════
   입퇴사 통보 캡처에는 거의 언제나 주민등록번호가 함께 찍혀 있다. 프롬프트로
   「담지 마세요」라고 해도 사진 자체는 그대로 구글로 올라간다. 급여대장을 같은
   까닭으로 막아 두고(WAGE_READ_ON) 알림만 보내면 말과 실제가 어긋난다. */

test('★ 알림 판독은 아직 꺼져 있다 — 주민등록번호가 함께 나간다', () => {
  // 켤 때 이 검사를 함께 고친다(처리위탁 근거 + 주민번호 가림이 먼저다).
  assert.match(html, /const NOTICE_READ_ON = false/);
  const h = loadApp({ kind: 'etc' }).readPanelHtml();
  assert.equal(/doRead\(\)/.test(h), false, '아직 켜면 안 됩니다');
  assert.match(h, /준비 중/, '급여대장과 같은 모양으로 알려야 고장인지 막은 것인지 압니다');
});

test('★ 기타 탭에서는 눌러도 알림 판독기를 부르지 않는다', async () => {
  const { W, calls } = loadRun({ kind: 'etc' }, {
    noticeOut: { ok: true, rows: [{ name: '김신입', pairs: [{ item: '입사일', value: '2026-08-12' }] }] }
  });
  W.doRead();
  await new Promise(r => setTimeout(r, 10));
  assert.equal(calls.read.length, 0, '캡처가 구글로 올라갔습니다 — 주민등록번호가 함께 찍혀 있습니다');
  assert.equal(W.App.readState.status, 'idle');
});

test('★ 한 줄도 못 읽으면 그렇다고 말한다 — 빈 표를 띄우지 않는다', async () => {
  const { W } = loadRun({ kind: 'attend' }, { readOut: { kind: 'timesheet', fields: { rows: [] } } });
  W.doRead();
  await new Promise(r => setTimeout(r, 10));
  assert.equal(W.App.readState.status, 'err');
  assert.match(W.App.readState.err, /읽어내지 못했습니다/);
});

test('판독이 실패하면 까닭을 담는다', async () => {
  const { W } = loadRun({ kind: 'attend' }, { readOut: { error: 'AI 키가 없습니다', fields: {} } });
  W.doRead();
  await new Promise(r => setTimeout(r, 10));
  assert.equal(W.App.readState.status, 'err');
  assert.match(W.App.readState.err, /키/);
});

/* ══════ 무엇을, 어떤 판독기로 (2026-08-15) ══════ */

test('★ PDF·엑셀에는 판독 단추를 주지 않는다 — 눌러 봐야 오류 400 이다', () => {
  const h = loadApp({ kind: 'attend' }, { filename: '근태.pdf', mime: 'application/pdf' }).readPanelHtml();
  assert.equal(/doRead\(\)/.test(h), false,
    '「이 파일은 미리 볼 수 없습니다」 옆에 판독 단추가 있으면 눌러 보고 서비스가 죽은 줄 압니다');
  assert.match(h, /사진/, '왜 안 되는지 한국어로 말해야 합니다');
});

test('★ PDF 를 판독하려 해도 AI를 부르지 않는다', async () => {
  const { W, calls } = loadRun({ kind: 'attend' }, { rec: { filename: '근태.pdf', mime: 'application/pdf' } });
  W.doRead();
  await new Promise(r => setTimeout(r, 10));
  assert.equal(calls.read.length, 0,
    '판독 층은 무엇을 싣든 image/jpeg 라고 보냅니다 — PDF 를 보내면 오류 400 만 돌아옵니다');
  assert.equal(W.App.readState.status, 'err');
  assert.match(W.App.readState.err, /PDF/);
});

test('사진은 그대로 판독한다', async () => {
  const { W, calls } = loadRun({ kind: 'attend' }, {
    readOut: { kind: 'timesheet', fields: { rows: [{ name: '배영승', paid: [1], off: [], adj: '', note: '' }] } }
  });
  W.doRead();
  await new Promise(r => setTimeout(r, 10));
  assert.equal(calls.read[0], 'read');
});

/* 값 표에서 출처 서류를 열면 App.kind 는 마지막으로 눌러 둔 탭 그대로다 —
   그것으로 판독기를 고르면 근태표를 알림 판독기로 읽는 일이 실제로 일어난다. */
test('★ 판독기는 열려 있는 서류가 정한다 — 서랍 탭이 아니다', async () => {
  const { W, calls } = loadRun({ kind: 'etc' }, {   // 탭은 기타(알림), 열린 서류는 근태표
    rec: { kind: 'attend' },
    readOut: { kind: 'timesheet', fields: { rows: [{ name: '배영승', paid: [1], off: [], adj: '', note: '' }] } }
  });
  W.doRead();
  await new Promise(r => setTimeout(r, 10));
  assert.equal(calls.read[0], 'read',
    '근태표를 열어 놓고 마지막에 눌러 둔 탭(기타)의 판독기로 읽었습니다');
  assert.equal(W.App.readState.rows[0].name, '배영승');
});

test('★ 판독 패널도 열려 있는 서류를 따른다', () => {
  // 탭은 근로계약서(판독 안 함)인데 열린 서류는 근태표 — 판독 단추가 있어야 한다.
  const h = loadApp({ kind: 'contract' }, { kind: 'attend' }).readPanelHtml();
  assert.match(h, /doRead\(\)/);
});

test('★ 어디에서도 서랍 탭으로 판독기를 고르지 않는다', () => {
  assert.equal(/readKindFor\(App\.kind\)/.test(html), false,
    '값 표에서 연 서류는 App.kind 와 아무 상관이 없습니다');
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

/* ══════ 「확실하지 않다」가 화면까지 오는가 (2026-08-15) ══════ */

test('★ 판독기가 못 읽었다고 한 줄은 화면까지 노랗게 온다', async () => {
  const { W } = loadRun({ kind: 'attend' }, {
    readOut: { kind: 'timesheet', fields: { rows: [
      { name: '배영승', paid: [1, 5], off: [], adj: '', note: '일부 판독 불확실' },
      { name: '이옥자', paid: [2], off: [], adj: '', note: '정상근무' }
    ] } }
  });
  W.doRead();
  await new Promise(r => setTimeout(r, 10));
  assert.equal(W.App.readState.rows[0].iffy, true,
    '판독기가 스스로 「못 읽었다」고 한 표시가 화면까지 오지 않으면 노란 줄이 영영 안 뜹니다');
  assert.equal(W.App.readState.rows[1].iffy, false);
  const h = W.valueRowsHtml(W.App.readState.rows);
  assert.match(h, /class="iffy"/, '표에서 그 줄이 노랗게 칠해져야 합니다');
});

test('★ 고치면 그 줄의 노란 칠이 화면에서 곧바로 걷힌다', () => {
  const { W, calls } = loadRun({}, { dom: true });
  W.App.readState = { status: 'done', err: '', rows: [
    { name: '배영승', pairs: [{ item: '유급일수', value: '3일' }], iffy: true },
    { name: '이옥자', pairs: [{ item: '휴무일수', value: '5일' }], iffy: true }
  ] };
  W.editVal(0, 'value', '4일', 0);
  assert.equal(calls.els['vrow_0_0'].className, '',
    '자료만 고치고 화면을 안 건드리면 노란색이 그대로 남습니다 — 표시가 없는 것과 같습니다');
  assert.equal(calls.els['vrow_1_0'].className, 'iffy', '안 고친 줄은 그대로 노래야 합니다');
  assert.match(calls.els['iffyLine'].innerHTML, /1줄/, '남은 줄 수도 함께 줄어야 합니다');
});

test('마지막 노란 줄까지 고치면 알림 띠가 사라진다', () => {
  const { W, calls } = loadRun({}, { dom: true });
  W.App.readState = { status: 'done', err: '',
    rows: [{ name: '배영승', pairs: [{ item: '유급일수', value: '3일' }], iffy: true }] };
  W.editVal(0, 'value', '4일', 0);
  assert.equal(calls.els['iffyLine'].style.display, 'none');
});

test('★ 표의 줄마다 이름표가 있어야 그 줄만 손댈 수 있다', () => {
  const { W } = loadRun({});
  const h = W.valueRowsHtml([{ name: '배영승', pairs: [{ item: '유급일수', value: '3일' }], iffy: true }]);
  assert.match(h, /id="vrow_0_0"/, '줄 이름표가 없으면 표를 통째로 다시 그려야 해 커서가 튑니다');
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
  const { W, calls } = loadRun({ kind: 'attend', viewerId: 'a1' }, { defer: true });
  W.doRead();
  await new Promise(r => setTimeout(r, 0));   // 판독기 호출까지는 진행되게 둔다
  assert.equal(W.App.readState.status, 'reading', '아직 판독기가 답하기 전입니다');

  W.App.viewerId = 'a2';   // 사람이 다른 서류로 옮겨 갔다
  calls.resolveRead({ kind: 'timesheet', fields: { rows: [{ name: '김신입', paid: [1], off: [], adj: '', note: '' }] } });
  await new Promise(r => setTimeout(r, 10));

  assert.notEqual(W.App.readState.status, 'done',
    'a1 을 읽은 답이 a2 화면에 그대로 얹혔습니다 — 저장하면 a2 서류가 출처로 찍힙니다');
  assert.equal(W.App.readState.status, 'reading', '옮겨 간 뒤 온 답은 버리고 이전 상태를 지켜야 합니다');
});

test('★ 판독 중 다른 서류로 옮기면 늦게 온 실패 응답도 새 화면에 묻히지 않는다', async () => {
  const { W, calls } = loadRun({ kind: 'attend', viewerId: 'a1' }, { defer: true });
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

/* ══════ 저장·중복 ══════ */
function loadSave(existing, confirmYes, opts) {
  opts = opts || {};
  const calls = { alerts: [], confirms: [], saved: null };
  const sandbox = {
    window: {}, console, Date,
    document: { getElementById: () => null },
    alert: m => calls.alerts.push(m),
    confirm: m => { calls.confirms.push(m); return !!confirmYes; }
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  new vm.Script(store, { filename: 'store.js' }).runInContext(sandbox);
  sandbox.__existing = existing || {};
  const viewerId = opts.viewerId || 'a1';
  const items = {};
  items[viewerId] = { companyId: 'co_1', kind: 'attend', month: '202608', file: 'p/' + viewerId + '.jpg' };
  new vm.Script([
    'const S = window.PuPaydataStore;',
    'S.init({uid:"U1", db:{ref:function(p){ return {'
      + ' once:function(){ return Promise.resolve({val:function(){ return __existing; }}); },'
      + ' update:function(u){ __saved = u; return Promise.resolve(); } }; },'
      + ' }});',
    'var __saved = null;',
    // db.ref() 를 인자 없이 부르면 update 를 쓰는 자리다 — 위 ref 가 둘 다 준다
    'const App = ' + JSON.stringify({
      kind: 'attend', viewerId: viewerId, viewingUid: '', companyId: 'co_1',
      companyName: '화담원', month: '2026-08',
      itemsMonth: items,
      itemsKeep: {}, values: {},
      readState: { status: 'done', err: '',
        rows: opts.rows || [{ name: '배영승', pairs: [{ item: '유급일수', value: '3일' }] }] }
    }) + ';',
    'App.render = function(){};',
    cut('esc'), cut('canWrite'), cut('findRow'), cut('saveVals'), cut('valueGridModel'),
    'window.App = App; window.saveVals = saveVals; window.__got = function(){ return __saved; };',
    'window.valueGridModel = valueGridModel;'
  ].join('\n'), { filename: 'save.js' }).runInContext(sandbox);
  return { W: sandbox.window, calls };
}

/* 저장이 끝난 뒤 실시간DB 에 실제로 남아 있을 값 칸을 되살린다 —
   update() 는 열쇠 하나하나에 덮어쓰므로, 옛 값 위에 쓴 것을 그대로 얹는다.
   이렇게 해야 「무엇이 살아남았나」를 값 표로 끝까지 볼 수 있다. */
function afterSave(existing, written) {
  const box = JSON.parse(JSON.stringify(existing || {}));
  Object.keys(written || {}).forEach(p => {
    const id = p.split('/').pop();
    box[id] = written[p];
  });
  return box;
}

test('★ 저장하면 값에 출처가 붙어 들어간다', async () => {
  const { W, calls } = loadSave({});
  W.saveVals();
  await new Promise(r => setTimeout(r, 10));
  const up = W.__got();
  assert.ok(up, '저장되지 않았습니다');
  const key = Object.keys(up)[0];
  assert.match(key, /\/values\/202608\//);
  assert.equal(up[key].sourceId, 'a1', '출처가 없으면 나중에 근거를 못 댑니다');
  assert.equal(up[key].companyId, 'co_1');
  assert.equal(up[key].name, '배영승');
  assert.match(calls.alerts[0], /저장/);
});

/* 「저장」을 누른 것이 곧 사람의 확인이다 — 원본을 옆에 놓고 줄을 고친 뒤 스스로
   누른 것이므로. 이것이 없으면 값 표의 노란 칸과 「⚠ 확인 안 된 값이 N개」가
   영영 안 걷힌다(설계서 3장 ②). */
test('★ 저장한 값은 확인된 값으로 들어간다 — 노란 표시가 걷힌다', async () => {
  const { W } = loadSave({});
  W.saveVals();
  await new Promise(r => setTimeout(r, 10));
  const up = W.__got();
  const key = Object.keys(up)[0];
  assert.equal(up[key].confirmed, true,
    '사람이 확인하고 저장했는데 「확인 안 됨」으로 남습니다 — 값 표가 계속 노랗습니다');
  const g = W.valueGridModel(afterSave({}, up));
  assert.equal(g.people[0].cells['유급일수'].confirmed, true, '값 표에서도 확인된 값이어야 합니다');
});

test('★ 같은 서류를 다시 읽으면 묻는다', async () => {
  const { W, calls } = loadSave(
    { r1: { companyId: 'co_1', month: '202608', name: '배영승', sourceId: 'a1' } }, false);
  W.saveVals();
  await new Promise(r => setTimeout(r, 10));
  assert.equal(calls.confirms.length, 1, '묻지 않으면 근무일수가 두 배가 됩니다');
  assert.match(calls.confirms[0], /배영승/);
  assert.equal(W.__got(), null, '「그대로 두기」인데 저장됐습니다');
});

test('★ 덮어쓰기를 고르면 저장한다 — 새 자리가 아니라 옛 자리에 다시 쓴다', async () => {
  const { W } = loadSave(
    { r1: { companyId: 'co_1', month: '202608', name: '배영승', sourceId: 'a1' } }, true);
  W.saveVals();
  await new Promise(r => setTimeout(r, 10));
  const up = W.__got();
  assert.ok(up, '저장되지 않았습니다');
  const keys = Object.keys(up);
  assert.equal(keys.length, 1, '한 사람 값인데 자리가 둘 이상 생겼습니다 — 근무일수가 두 배로 잡힙니다');
  assert.match(keys[0], /\/values\/202608\/r1$/,
    '「덮을까요」에 동의했는데 옛 자리(r1)가 아니라 새 자리에 썼습니다 — 옛 줄이 그대로 남아 두 줄이 됩니다');
});

/* ══════ 서류 두 장이 한 근로자에게 오는 보통 경우 (2026-08-15) ══════
   근태표를 읽어 유급일수를 저장해 둔 근로자에게 수당변경 카톡이 온다.
   설계서 1장이 네 가지 서류가 한 달에 모두 들어온다고 못 박았으니 이것은
   드문 일이 아니라 **보통**이다. 사람만 보고 「이미 있다」로 잡아 덮으면
   유급일수가 통째로 사라지고, 값 표에는 「－」로 보여 「아직 안 읽음」과
   구별조차 되지 않는다. 되살릴 화면도 없다. */
const 근태표줄 = {
  r1: { companyId: 'co_1', month: '202608', name: '배영승', sourceId: '근태a', at: 100,
        pairs: [{ item: '유급일수', value: '22일' }, { item: '휴무일수', value: '8일' }] }
};
const 카톡판독 = [{ name: '배영승', pairs: [{ item: '식대', value: '200,000' }] }];

test('★ 다른 서류를 저장해도 앞 서류 값이 살아남는다 — 묻지도 않는다', async () => {
  const { W, calls } = loadSave(근태표줄, true, { viewerId: '카톡b', rows: 카톡판독 });
  W.saveVals();
  await new Promise(r => setTimeout(r, 10));
  const up = W.__got();
  assert.ok(up, '저장되지 않았습니다');
  assert.equal(calls.confirms.length, 0,
    '겹치는 항목도 없는데 물었습니다 — 근태표+수당카톡은 보통 있는 일이라 물을 일이 아닙니다');
  assert.equal(Object.keys(up).length, 1);
  assert.ok(!up['paydata/u/U1/values/202608/r1'],
    '다른 서류인데 근태표 자리(r1)를 덮었습니다 — 유급일수가 통째로 사라집니다');
});

test('★ 서류 두 장 값이 값 표에서 한 줄로 만나고 출처는 제각각 남는다', async () => {
  const { W } = loadSave(근태표줄, true, { viewerId: '카톡b', rows: 카톡판독 });
  W.saveVals();
  await new Promise(r => setTimeout(r, 10));
  const g = W.valueGridModel(afterSave(근태표줄, W.__got()));
  assert.equal(g.people.length, 1, '한 근로자니 한 줄이어야 합니다');
  const c = g.people[0].cells;
  assert.equal(c['유급일수'] && c['유급일수'].value, '22일',
    '근태표에서 나온 유급일수가 사라졌습니다 — 임금 계산이 통째로 틀어집니다');
  assert.equal(c['휴무일수'] && c['휴무일수'].value, '8일');
  assert.equal(c['식대'] && c['식대'].value, '200,000');
  assert.equal(c['유급일수'].sourceId, '근태a', '값을 누르면 그 값이 나온 서류가 열려야 합니다');
  assert.equal(c['식대'].sourceId, '카톡b');
});

/* 옛 자료에 한 근로자의 줄이 서류별로 여럿 있을 때, 그중 한 서류를 다시 읽으면
   **그 서류의 줄**을 덮어야 한다. 아무 줄이나 집으면 남의 서류 값이 날아간다. */
test('★ 같은 서류를 다시 읽으면 여러 줄 중 그 서류의 줄만 덮는다', async () => {
  const 두줄 = {
    r1: { companyId: 'co_1', month: '202608', name: '배영승', sourceId: '근태a', at: 100,
          pairs: [{ item: '유급일수', value: '22일' }] },
    r2: { companyId: 'co_1', month: '202608', name: '배영승', sourceId: '카톡b', at: 200,
          pairs: [{ item: '식대', value: '200,000' }] }
  };
  const { W } = loadSave(두줄, true, {
    viewerId: '카톡b', rows: [{ name: '배영승', pairs: [{ item: '식대', value: '250,000' }] }] });
  W.saveVals();
  await new Promise(r => setTimeout(r, 10));
  const keys = Object.keys(W.__got() || {});
  assert.equal(keys.length, 1);
  assert.match(keys[0], /\/values\/202608\/r2$/,
    '다시 읽은 서류(카톡b)의 줄은 r2 입니다 — r1 을 덮으면 근태표 유급일수가 날아갑니다');
  const c = W.valueGridModel(afterSave(두줄, W.__got())).people[0].cells;
  assert.equal(c['유급일수'].value, '22일', '건드리지 않은 서류의 값이 사라졌습니다');
  assert.equal(c['식대'].value, '250,000');
});

/* 항목까지 겹칠 때(급여대장·근태표 둘 다 기본급을 적고 있는 등)는 지우지는
   않되 알려야 한다 — 표에 보이던 금액이 이번 값으로 바뀌기 때문이다. */
test('★ 다른 서류와 항목이 겹치면 지우지 않고 알린다', async () => {
  const 겹침 = {
    r1: { companyId: 'co_1', month: '202608', name: '배영승', sourceId: '근태a', at: 100,
          pairs: [{ item: '기본급', value: '3,000,000' }, { item: '유급일수', value: '22일' }] }
  };
  const { W, calls } = loadSave(겹침, true, {
    viewerId: '대장b', rows: [{ name: '배영승', pairs: [{ item: '기본급', value: '3,200,000' }] }] });
  W.saveVals();
  await new Promise(r => setTimeout(r, 10));
  assert.equal(calls.confirms.length, 1, '겹친 사실을 알리지 않았습니다');
  assert.match(calls.confirms[0], /배영승/);
  assert.match(calls.confirms[0], /기본급/, '어느 항목이 겹쳤는지 이름을 대야 합니다');
  assert.match(calls.confirms[0], /지우지 않고/, '앞 서류 값을 지우지 않는다고 말해야 합니다');
  const keys = Object.keys(W.__got() || {});
  assert.ok(!keys.some(k => /\/r1$/.test(k)), '알린다고 해놓고 앞 서류 줄을 덮었습니다');
  const c = W.valueGridModel(afterSave(겹침, W.__got())).people[0].cells;
  assert.equal(c['유급일수'].value, '22일', '겹치지 않은 항목까지 날아갔습니다');
  assert.equal(c['기본급'].value, '3,200,000', '값 표에는 나중에 저장한 값이 보여야 합니다');
});

/* ══════ 「취소」의 뜻은 말과 실제가 같아야 한다 ══════
   saveValues 는 한 묶음이라 일부만 쓰는 길이 없다 — 「취소」는 이번 판독 전체를
   안 쓰는 것이다. 그런데 물음말에는 겹친 사람 이름만 나온다. 그러니 물음말이
   「위에 이름이 없는 사람도 저장되지 않는다」까지 말해야 어긋나지 않는다. */
test('★ 「취소」는 겹치지 않은 사람까지 저장하지 않는다 — 물음말이 그렇게 말한다', async () => {
  const { W, calls } = loadSave(
    { r1: { companyId: 'co_1', month: '202608', name: '배영승', sourceId: 'a1' } }, false,
    { rows: [
      { name: '배영승', pairs: [{ item: '유급일수', value: '3일' }] },
      { name: '이옥자', pairs: [{ item: '유급일수', value: '5일' }] }
    ] });
  W.saveVals();
  await new Promise(r => setTimeout(r, 10));
  assert.equal(W.__got(), null, '「취소」인데 저장됐습니다');
  const m = calls.confirms[0];
  assert.doesNotMatch(m, /이옥자/, '겹치지 않은 사람은 물음말에 나오지 않습니다');
  assert.match(m, /한 줄도 저장하지 않습니다/,
    '실제로는 이옥자까지 통째로 버려집니다 — 물음말이 그렇게 말하지 않으면 말과 실제가 어긋납니다');
  assert.match(m, /이름이 없는 사람도 저장되지 않습니다/,
    '겹친 사람 이름만 보여주고서 「그대로 둡니다」라고만 하면, 이옥자 값이 사라진 까닭을 알 길이 없습니다');
});

test('★ 남의 자리에서는 저장하지 않는다', async () => {
  const { W, calls } = loadSave({});
  W.App.viewingUid = 'U2'; W.App.viewingDeputy = false;
  W.saveVals();
  await new Promise(r => setTimeout(r, 10));
  assert.equal(W.__got(), null);
  assert.equal(calls.confirms.length, 0);
});
