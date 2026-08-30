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
/* vcfSave — 연락처 파일을 내려주는 손. 한 장짜리(downloadVcf)와 여러 장(selVcf)이
   «같은 손»을 쓰려고 갈라 둔 것이라, 둘 다 문지기를 지난 뒤에 부른다.
   두 벌로 만들면 다듬기 고침이 한쪽에만 들어간다(2026-08-30). */
const HELPERS = ['fallbackCopy', 'exportXlsx', 'coExportXlsx', 'vcfSave'];

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
  /* 자르는 한도(EXPORT_MAX)와 자르개(expCut)까지 «진짜 것»으로 실어야
     「규칙에 안 걸리게 잘라 보낸다」를 실제로 확인할 수 있다 */
  const a = src.indexOf('const EXPORT_MAX');
  const b = src.indexOf('function exportLogRec');
  assert.ok(a > 0 && b > a, 'EXPORT_MAX 덩이를 찾지 못했습니다');
  vm.runInContext(src.slice(a, b) + '\n' + fn('exportLogRec'), ctx);
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

test('★ 긴 파일 이름이 와도 «잘라서» 보낸다 — 안 자르면 기록이 막힌다', () => {
  /* 자료함 파일 이름이 길면 what 이 200자를 넘을 수 있다. 규칙이 그걸 막으면
     기록이 안 남고, 기록이 안 남으면 내려받기가 통째로 거절된다. */
  const c = recBox();
  const r = c.exportLogRec({ by:'가'.repeat(80), kind:'x'.repeat(60),
    what:'자료함 · ' + '나'.repeat(400), why:'다'.repeat(900) });
  assert.equal(r.by.length,   40);
  assert.equal(r.kind.length, 30);
  assert.equal(r.what.length, 200);
  assert.equal(r.why.length,  300);
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
  assert.match(doc, /=== auth\.uid/, '남의 이름으로 적는 것을 안 막는다');
  assert.match(doc, /=== now/, '날짜 속이기를 안 막는다');
  assert.match(doc, /isAdmin/, '읽기를 관리자로 안 막는다');
  assert.match(doc, /"\$other":\s*\{\s*"\.validate":\s*false/,
    '★ 정해 둔 칸 말고 «아무거나» 넣을 수 있다 — 기록이 두 번째 유출원이 된다');
  assert.ok(doc.indexOf('"exportLog"') > 0 && doc.indexOf('"exportSeen"') > 0, '두 칸이 다 있지 않다');
});

/* ⚠ 규칙의 진짜는 «만들개» 하나뿐이다 — scripts/make-firebase-rules.js 가
   docs/firebase-rules-전체-적용본.json 을 낸다(tests/firebase-rules-apply.test.js 가 짝을 지킨다).
   손으로 합친 전체 파일을 따로 두면 두 벌이 되고, 두 벌은 반드시 어긋난다. */
const APPLY = path.join(R, 'docs', 'firebase-rules-전체-적용본.json');

test('★ 기록 두 칸이 «적용본»에 있고, pucards 밖에 있다', () => {
  assert.ok(fs.existsSync(APPLY), '적용본 규칙 파일이 없다');
  const j = JSON.parse(fs.readFileSync(APPLY, 'utf8'));
  assert.ok(j.rules.exportLog && j.rules.exportSeen, '적용본에 반출 기록 두 칸이 없다');
  assert.ok(!j.rules.pucards.exportLog,
    '★ 기록이 pucards «안»에 들어갔다 — 부모가 준 읽기를 자식이 못 뺏어 직원이 그대로 읽는다');
  assert.equal(j.rules.exportLog.$id.$other['.validate'], false,
    '★ 정해 둔 칸 말고 아무거나 넣을 수 있다');
});

test('★ 「한 칸만 넣기」 안내문이 적용본과 «같은 규칙»이다', () => {
  /* 두 글이 어긋나면, 전문을 붙여넣은 날과 한 칸만 넣은 날의 규칙이 달라진다 —
     그 어긋남은 콘솔에 넣고 나서야 드러나고, 그때는 이미 앱이 멈춰 있다. */
  const j = JSON.parse(fs.readFileSync(APPLY, 'utf8'));
  const doc = fs.readFileSync(path.join(R, 'docs', 'firebase-rules-반출기록-한칸만-넣기.txt'), 'utf8');
  const cut = doc.slice(doc.indexOf('"exportLog"'), doc.lastIndexOf('},') + 2);
  const fromDoc = JSON.parse('{' + cut.replace(/,\s*$/, '') + '}');
  assert.deepEqual(fromDoc.exportLog, j.rules.exportLog, '★ exportLog 가 두 글에서 다르다');
  assert.deepEqual(fromDoc.exportSeen, j.rules.exportSeen, '★ exportSeen 이 두 글에서 다르다');
});

test('★ 반출 기록 규칙이 «두 벌»이 되지 않는다', () => {
  /* 규칙의 진짜는 만들개 하나다. 손으로 합친 전체 파일에 이 규칙을 또 적어 두면,
     한쪽만 고쳐진 날 콘솔에 무엇이 들어갈지 아무도 모르게 된다.
     ⚠ docs 에 만들개 이전의 옛 전체 파일이 둘 남아 있다
       (firebase-rules-전체-적용본.json · …(메일함포함…).json).
       그 둘을 여기서 정리하지는 않는다 — 남의 글이고 대표 판단이다.
       다만 «반출 기록»만은 그 옛 파일들로 번지지 않게 막는다. */
  const docs = path.join(R, 'docs');
  const others = fs.readdirSync(docs)
    .filter(f => /^firebase-rules-전체/.test(f) && f !== 'firebase-rules-전체-적용본.json')
    .filter(f => fs.readFileSync(path.join(docs, f), 'utf8').indexOf('exportLog') >= 0);
  assert.deepEqual(others, [],
    '★ 반출 기록 규칙이 적용본 말고 다른 전체 파일에도 적혔다 — 두 벌은 반드시 어긋난다: '
    + others.join(', '));
});

test('★ $other 를 막았으면 일곱 칸을 «모두» 이름으로 적어야 한다', () => {
  /* 이름 없는 칸은 $other 에 걸려 .validate:false 가 된다 → 쓰기가 통째로 막히고,
     기록을 못 남기면 앱이 내려받기를 거절한다. 즉 «기업정보함이 멈춘다». */
  const p = path.join(R, 'docs', 'firebase-rules-반출기록-한칸만-넣기.txt');
  const whole = fs.readFileSync(p, 'utf8');
  const doc = whole.slice(whole.indexOf('붙여넣을 것'), whole.indexOf('무슨 뜻인가'));
  ['at', 'uid', 'n', 'by', 'kind', 'what', 'why'].forEach(function(k){
    assert.match(doc, new RegExp('"' + k + '":\\s*\\{\\s*"\\.validate"'),
      '★ ' + k + ' 칸에 이름이 없다 — $other 에 걸려 기록 쓰기가 통째로 막힌다');
  });
});

test('★ 앱이 자르는 길이와 규칙의 한도가 «같다» — 앱이 벽에 부딪히면 안 된다', () => {
  /* 규칙이 벽이고 앱이 그 벽에 부딪히면 기록이 안 남고, 기록이 안 남으면 내려받기가
     거절된다. 긴 파일 이름 하나로 기업정보함이 멈추는 것이다 — 앱이 «먼저» 잘라야 한다. */
  const m = code(src).match(/const EXPORT_MAX\s*=\s*\{([^}]*)\}/);
  assert.ok(m, 'EXPORT_MAX 를 찾지 못했습니다 — 앱이 자르지 않으면 규칙에 걸린다');
  const app = {};
  m[1].split(',').forEach(function(pair){
    const kv = pair.split(':'); if (kv.length === 2) app[kv[0].trim()] = Number(kv[1]);
  });
  const p = path.join(R, 'docs', 'firebase-rules-반출기록-한칸만-넣기.txt');
  const whole = fs.readFileSync(p, 'utf8');
  const doc = whole.slice(whole.indexOf('붙여넣을 것'), whole.indexOf('무슨 뜻인가'));
  ['by', 'kind', 'what', 'why'].forEach(function(k){
    const r = doc.match(new RegExp('"' + k + '":[^\\n]*length <= (\\d+)'));
    assert.ok(r, k + ' 의 한도를 규칙에서 찾지 못했습니다');
    assert.equal(app[k], Number(r[1]),
      '★ ' + k + ' — 앱은 ' + app[k] + '자로 자르는데 규칙은 ' + r[1] + '자까지다. '
      + '앱이 더 길게 보내면 기록이 막히고 내려받기가 통째로 거절된다');
  });
});
