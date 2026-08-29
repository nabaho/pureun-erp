'use strict';
/* 반출 기록 — 밖으로 나가는 문은 «하나»를 지난다 (대표 지시 2026-08-29)
   ═══════════════════════════════════════════════════════════════════════════
   「기업정보함에 데이터 다운받거나 할 정보를 가져가려고 할 경우 우선 보안 시스템」
   설계서: docs/superpowers/specs/2026-08-29-기업정보함-반출기록-design.md

   ★ 여기서 못 박는 것
     ① 나가는 문이 «모두» 문지기(puExport)를 지난다 — 여덟 번째 문이 생겨도 여기서 걸린다
     ② 기록에 «내용»이 안 들어간다 (담는 칸이 일곱뿐)
     ③ 200건 이상이면 사유를 묻고, 취소하면 파일을 «안» 만든다
     ④ 기록을 못 남기면 파일을 «안» 만든다
     ⑤ 기록은 pucards «밖»에 있다 (부모가 준 읽기를 자식이 못 뺏는다)
     ⑥ 복사(📋)만은 순서를 뒤집는다 — 모르고 「통일」하면 복사가 죽는다
   실행: node --test tests/cards-export-log.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const R = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(R, 'pu-cards.html'), 'utf8').replace(/\r\n/g, '\n');
const code = s => String(s).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');

function fn(name, from){
  const s = from || src;
  let at = s.indexOf('function ' + name + '(');
  assert.ok(at >= 0, name + ' 을 찾지 못했습니다');
  /* ⚠ 앞의 async 까지 함께 떠 온다. 안 그러면 async 가 빠진 채로 실려
     안에 있는 await 가 «구문 오류»가 된다 — 검사가 엉뚱한 자리에서 넘어진다. */
  if (s.slice(at - 6, at) === 'async ') at -= 6;
  let d = 0;
  for (let i = s.indexOf('{', at); i < s.length; i++){
    if (s[i] === '{') d++;
    else if (s[i] === '}'){ d--; if (!d) return s.slice(at, i + 1); }
  }
  assert.fail(name + ' 의 끝을 찾지 못했습니다');
}
/* 「이 자리가 어느 함수 안인가」 — 뒤로 훑어 가장 가까운 함수 선언을 찾는다 */
function ownerFn(pos, from){
  const s = from || src;
  const at = s.lastIndexOf('\nfunction ', pos);
  const at2 = s.lastIndexOf('\nasync function ', pos);
  const start = Math.max(at, at2);
  if (start < 0) return null;
  const m = s.slice(start).match(/^\n(?:async )?function ([A-Za-z_$][\w$]*)/);
  return m ? m[1] : null;
}

/* ══════ ① 나가는 문이 모두 문지기를 지난다 ══════ */
/* 파일이나 클립보드를 «실제로 만드는» 함수들. 새 문을 만들면 여기 더한다. */
const DOORS = [
  { fn:'runExport',               why:'엑셀 셋(명함·사업자·기업 상세)' },
  { fn:'downloadCsvFile',         why:'주소록 CSV' },
  { fn:'downloadVcf',             why:'연락처 파일(vCard)' },
  { fn:'downloadPhoto',           why:'명함 원본 사진' },
  { fn:'downloadMaterial',        why:'자료함 파일' },
  { fn:'downloadMaterialOriginal',why:'자료함 한글 원본' },
  { fn:'copyCardInfo',            why:'명함 정보 복사' },
  { fn:'copySelInfo',             why:'명함 여러 건 복사' },
  { fn:'selMailCopy',             why:'메일 주소 복사' }
];

for (const d of DOORS){
  test(`★ ${d.fn}(${d.why}) 가 문지기를 지난다`, () => {
    assert.match(code(fn(d.fn)), /puExport\(/,
      `★ ${d.why} 가 기록 없이 밖으로 나간다 — 나가는 문은 모두 puExport 를 지나야 한다`);
  });
}

/* 「내려받기를 실제로 일으키는」 방아쇠. 미리보기용 createObjectURL 은 여기 없다 —
   화면에 그리는 것은 반출이 아니다. 방아쇠는 이 넷뿐이다. */
const TRIGGER = /\.download\s*=|XLSX\.writeFile\(|PureunHwp\.download\(|navigator\.clipboard\.writeText\(/g;
/* 이 함수들은 «스스로 문이 아니다» — 문지기를 지난 함수가 부르는 도우미다.
   ⚠ 면제는 「부르는 곳이 문지기 뒤뿐」일 때만 참이다. 그 사실은 바로 아래 검사가 지킨다 —
     누가 딴 데서 부르기 시작하면 이 면제가 «조용한 구멍»이 되기 때문이다. */
const HELPERS = ['fallbackCopy', 'exportXlsx', 'coExportXlsx'];

test('★ 방아쇠는 «모두» 문지기를 지난 함수 안에 있다 — 여덟 번째 문이 생겨도 여기서 걸린다', () => {
  const body = code(src);
  const missed = [];
  let m;
  TRIGGER.lastIndex = 0;
  while ((m = TRIGGER.exec(body))){
    const owner = ownerFn(m.index, body);
    if (!owner || HELPERS.includes(owner)) continue;
    if (fn(owner, body).indexOf('puExport(') < 0) missed.push(owner + ' → ' + m[0]);
  }
  assert.deepEqual([...new Set(missed)], [],
    '★ 이 자리들이 기록 없이 밖으로 내보낸다 — puExport 를 지나게 하거나, '
    + '반출이 아니라면 왜 아닌지 이 검사에 적을 것:\n   ' + [...new Set(missed)].join('\n   '));
});

test('★ 면제한 도우미는 «문지기 뒤에서만» 불린다 — 아니면 그 면제가 구멍이 된다', () => {
  const body = code(src);
  [['exportXlsx', 'runExport'], ['coExportXlsx', 'runExport'], ['fallbackCopy', null]].forEach(function(pair){
    const name = pair[0], only = pair[1];
    if(!only) return;                       /* fallbackCopy 는 여러 복사 문이 함께 쓴다 */
    const callers = new Set();
    const re = new RegExp('\\b' + name + '\\s*\\(', 'g');
    let m;
    while ((m = re.exec(body))){
      if (/(async )?function\s*$/.test(body.slice(Math.max(0, m.index - 20), m.index))) continue;
      const owner = ownerFn(m.index, body);
      if (owner && owner !== name) callers.add(owner);
    }
    assert.deepEqual([...callers], [only],
      '★ ' + name + ' 을 ' + [...callers].join('·') + ' 가 부른다 — '
      + only + ' 밖에서 부르면 기록 없이 파일이 나간다');
  });
});

test('★ 모든 문에 이름표가 있다 — 없으면 기록에 날것이 나와 못 알아본다', () => {
  const body = code(src);
  /* 문지기에 넘기는 첫 인자가 «문 이름»이다. 글자로 적힌 것만 모은다
     (xlsx- 처럼 이어 붙이는 것은 EXPORT_KINDS 의 id 로 따로 센다). */
  const used = new Set();
  let m;
  const re = /puExport\(\s*'([^']+)'/g;
  while ((m = re.exec(body))){
    /* 「'xlsx-' + kind」처럼 «이어 붙이는» 것은 반쪽이라 그대로 세면 안 된다 —
       그런 것은 바로 아래에서 갈래를 붙여 온전한 이름으로 센다 */
    if (/^\s*\+/.test(body.slice(m.index + m[0].length))) continue;
    used.add(m[1]);
  }
  const re2 = /puExport\(\s*'xlsx-'\s*\+\s*kind/g;
  if (re2.test(body)) ['card', 'biz', 'co'].forEach(k => used.add('xlsx-' + k));
  /* ⚠ 주석을 «걷어 내고» 본다. 안 걷으면 이름표 옆 주석에 적힌 보기 글자('backup' 처럼)를
     이름표로 세어, 정작 이름표를 지워도 통과한다 — 실제로 그렇게 새어 나갔다.
     저장소 규칙이다: 소스를 글자로 보는 검사는 주석을 먼저 걷는다. */
  const labels = code(src.slice(src.indexOf('const EXPORT_KIND_LABEL'),
                                src.indexOf('function exportLogRows')));
  const missing = [...used].filter(k => labels.indexOf("'" + k + "'") < 0);
  assert.deepEqual(missing, [],
    '★ 이름표 없는 문이 있다 — 기록에 날것으로 나와 무슨 문인지 못 알아본다: ' + missing.join(', '));
});

/* ══════ ② 기록에 내용이 안 들어간다 ══════ */
function recBox(){
  const ctx = { console, Number, String, Object };
  vm.createContext(ctx);
  vm.runInContext(fn('exportLogRec'), ctx);
  return ctx;
}
test('★ 기록에 담는 칸은 일곱뿐 — 내용(이름·전화·이메일)은 안 담는다', () => {
  const c = recBox();
  const r = c.exportLogRec({ at:1, by:'권형하', uid:'u1', kind:'xlsx-card',
    what:'명함 · 전체', n:6295, why:'정리',
    /* 넣으려 해도 안 담겨야 하는 것들 */
    email:'a@b.c', phone:'010-0000-0000', rows:[{name:'홍길동'}] });
  assert.deepEqual(Object.keys(r).sort(),
    ['at','by','kind','n','uid','what','why'],
    '★ 기록에 딴 칸이 섞였다 — 기록이 «두 번째 유출원»이 된다');
});

test('건수는 늘 숫자다 — 글자가 들어오면 0', () => {
  const c = recBox();
  assert.equal(c.exportLogRec({ n:'많이' }).n, 0);
  assert.equal(c.exportLogRec({ n:'12' }).n, 12);
});

/* ══════ ③④ 문지기가 언제 막나 ══════ */
function gateBox(opt){
  const o = opt || {};
  const asked = [];
  const ctx = {
    console, Number, String, Object, Promise, setTimeout,
    EXPORT_BIG: 200,
    askExportWhy: (n, what) => { asked.push([n, what]); return Promise.resolve(o.why); },
    writeExportLog: () => Promise.resolve(o.wrote !== false),
    exportTellOnce: () => {},
    alert: msg => { ctx._alerted = msg; },
    _asked: asked
  };
  vm.createContext(ctx);
  vm.runInContext(fn('puExport'), ctx);
  return ctx;
}

test('★ 200건 이상이면 사유를 묻는다', async () => {
  const c = gateBox({ why:'정리용' });
  assert.equal(await c.puExport('xlsx-card', 200, '명함'), true);
  assert.equal(c._asked.length, 1, '★ 대량인데 아무것도 안 묻고 나갔다');
});

test('199건이면 안 묻는다 — 일상 업무를 멈추지 않는다', async () => {
  const c = gateBox({});
  assert.equal(await c.puExport('vcf', 199, '연락처'), true);
  assert.equal(c._asked.length, 0);
});

test('★ 사유 창에서 취소하면 파일을 안 만든다', async () => {
  const c = gateBox({ why:null });
  assert.equal(await c.puExport('xlsx-card', 6295, '명함 · 전체'), false,
    '★ 취소했는데 파일이 만들어진다');
});

test('★ 기록을 못 남기면 파일을 안 만든다', async () => {
  const c = gateBox({ wrote:false });
  assert.equal(await c.puExport('vcf', 1, '연락처'), false,
    '★ 기록 없는 내려받기가 생긴다 — 그러면 이 시스템 전체가 뜻을 잃는다');
  assert.match(String(c._alerted || ''), /기록/, '왜 안 되는지 안 알려 준다');
});

/* ══════ ⑤ 기록의 자리 ══════ */
test('★ 기록은 pucards «밖»에 있다 — 부모가 준 읽기를 자식이 못 뺏는다', () => {
  const m = src.match(/const EXPORT_LOG_PATH\s*=\s*'([^']+)'/);
  assert.ok(m, 'EXPORT_LOG_PATH 를 찾지 못했습니다');
  assert.doesNotMatch(m[1], /^pucards/,
    '★ 기록을 pucards 아래 두면 「관리자만」이라고 적어도 직원이 그대로 읽는다');
});

test('기록은 서버 시각으로 적는다 — 날짜를 못 속이게', () => {
  assert.match(code(fn('writeExportLog')), /ServerValue\.TIMESTAMP/,
    '기기 시각으로 적으면 규칙의 at === now 를 통과하지 못하고, 날짜도 속일 수 있다');
});

test('대량 기준은 한 곳에만 있다', () => {
  const n = (code(src).match(/EXPORT_BIG\s*=/g) || []).length;
  assert.equal(n, 1, '기준이 ' + n + '곳에 흩어져 있다 — 한쪽만 고치면 어긋난다');
});

/* ══════ ⑥ 복사만은 순서를 뒤집는다 ══════ */
for (const name of ['copyCardInfo', 'copySelInfo', 'selMailCopy']){
  test(`★ ${name} 은 «먼저 복사하고» 기록한다 — 뒤집으면 복사가 죽는다`, () => {
    /* 브라우저는 clipboard 를 「사람이 누른 그 순간」에만 허용한다.
       앞에서 await 하면 그 순간이 끊겨 사파리·일부 크롬에서 조용히 실패한다. */
    const body = code(fn(name));
    const copyAt = body.indexOf('clipboard.writeText');
    const gateAt = body.indexOf('puExport(');
    assert.ok(copyAt > 0 && gateAt > 0, name + ' 에서 복사나 문지기를 못 찾았다');
    assert.ok(copyAt < gateAt,
      `★ ${name} 이 복사보다 기록을 «먼저» 한다 — 「누른 순간」이 끊겨 복사가 조용히 실패한다`);
    assert.doesNotMatch(body, /await\s+puExport/,
      `★ ${name} 이 문지기를 기다린다 — 기다리는 순간 복사 권한이 사라진다`);
  });
}

/* ══════ 보는 자리 ══════ */
test('★ 반출 기록은 관리자만 본다 — 못 읽었을 때도 열지 않는다', () => {
  const body = code(fn('openExportLog'));
  assert.match(body, /if\(!state\.isAdmin\)\s*return/,
    '★ 관리자가 아닌 사람에게도 열린다');
});

test('환경설정에 반출 기록으로 가는 길이 있다 (관리자만)', () => {
  const at = src.indexOf("if(cur==='acct')");
  const seg = src.slice(at, at + 1400);
  assert.match(seg, /state\.isAdmin \? btn\('openExportLog\(\)'/,
    '환경설정에서 반출 기록을 열 수 없거나, 직원에게도 보인다');
});

/* ══════ 포털 배지 ══════ */
const portal = fs.readFileSync(path.join(R, 'enter.html'), 'utf8').replace(/\r\n/g, '\n');
test('★ 포털 배지는 관리자에게만, 0건이면 아예 안 만든다', () => {
  const init = code(fn('initPortalExpAlerts', portal));
  assert.match(init, /role!=='admin'\s*\)\s*return/,
    '★ 관리자가 아닌데도 반출 기록을 조회한다');
  const paint = code(fn('portalExpPaintBadge', portal));
  assert.match(paint, /if\(!items\.length\)\s*return/,
    '0건인데 배지를 만든다 — 늘 켜진 등은 아무것도 알려 주지 못한다');
  assert.match(paint, /data-key="cards"/, '기업정보함 타일이 아닌 곳에 붙는다');
});

test('포털의 대량 기준이 기업정보함과 같다', () => {
  const a = Number((src.match(/const EXPORT_BIG\s*=\s*(\d+)/) || [])[1]);
  const b = Number((portal.match(/EXPORT_BIG_N\s*=\s*(\d+)/) || [])[1]);
  assert.equal(a, b, '두 수가 어긋나면 앱은 사유를 묻는데 배지는 안 뜬다 (' + a + ' vs ' + b + ')');
});

/* ══════ 규칙 붙여넣기 글 ══════ */
test('★ 규칙 글이 «지울 수 없는 기록»을 못 박는다', () => {
  const p = path.join(R, 'docs', 'firebase-rules-반출기록-한칸만-넣기.txt');
  assert.ok(fs.existsSync(p), '대표가 콘솔에 넣을 규칙 글이 없다');
  const whole = fs.readFileSync(p, 'utf8');
  /* ⚠ «붙여넣을 것» 대목만 본다. 문서 아래 「무슨 뜻인가」 설명에도 같은 글자가 나오는데,
     그것까지 세면 규칙에서 줄을 지워도 설명이 남아 검사가 통과한다 — 실제로 그랬다. */
  const a = whole.indexOf('붙여넣을 것');
  const b = whole.indexOf('무슨 뜻인가');
  assert.ok(a > 0 && b > a, '문서 짜임이 바뀌었다 — 「붙여넣을 것」 대목을 찾지 못했다');
  const doc = whole.slice(a, b);
  assert.match(doc, /!data\.exists\(\)/, '★ 고치기·지우기를 막는 줄이 없다');
  assert.match(doc, /newData\.child\('uid'\)\.val\(\) === auth\.uid/, '남의 이름으로 적는 것을 안 막는다');
  assert.match(doc, /newData\.child\('at'\)\.val\(\) === now/, '날짜 속이기를 안 막는다');
  assert.match(doc, /isAdmin/, '읽기를 관리자로 안 막는다');
  assert.ok(doc.indexOf('"exportLog"') > 0 && doc.indexOf('"exportSeen"') > 0, '두 칸이 다 있지 않다');
});
