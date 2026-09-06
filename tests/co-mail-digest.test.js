'use strict';
// 사업장별 메일 요약 — node --test tests/co-mail-digest.test.js
//
// 대표 지시 2026-09-06:
//   "사업장의 담당자와 관련하여 푸른이알피와 기업정보함에 담당자의 이메일이 있다.
//    이 이메일로 들어오는 메일 정보와 보낸메일 정보와 관련해서 간략하게 확인하고
//    특정일에 간단하게 어떤메일을 주고 받았었는지 기록이 남아야 한다.
//    … 사무관리 전체 사업장에 대하여 연결할 수 있게 해달라."
//
// 여태 업무관리에 붙던 메일은 «급여 서버가 본» 최근 300통뿐이라, 사업장 대부분은
// 한 줄도 없었다. 회사 메일함(만 통)에는 그 전부가 있다.
//
// ★ 그런데 업무관리가 만 통을 매번 내려받으면 요금이 두 배지만, 더 나쁜 것은
//   «잣대가 두 벌»이 되는 것이다 — 「이 업체 메일」이 화면마다 달라진다.
//   그래서 만 통을 보는 곳은 푸른메일함 한 곳으로 두고, 거기서 사업장마다
//   서른 줄로 간추려 pucards/coMail/{열쇠} 에 남긴다. 업무관리는 그 한 칸만 읽는다.
//
// 이 검사가 지키는 것
//   ① 회사 메일함이 갈래로 들어온다 (서버가 쓰는 짧은 칸 이름과 짝)
//   ② 요약은 «있었다는 기록»이지 사본이 아니다 — 본문을 안 담는다
//   ③ 사업장 열쇠가 세 곳(기업정보함·요약·업무관리)에서 «같다»
//   ④ 달라진 것이 없으면 안 쓰고, 오간 것이 없으면 지운다
//   ⑤ 업무관리는 그 한 칸만 읽고, 요약이 있으면 옛 길로 또 붙이지 않는다
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const W = fs.readFileSync(path.join(ROOT, 'work.html'), 'utf8').replace(/\r\n/g, '\n');
const PC = fs.readFileSync(path.join(ROOT, 'pu-cards.html'), 'utf8').replace(/\r\n/g, '\n');
const TH = fs.readFileSync(path.join(ROOT, 'js', 'pu-co-thread.js'), 'utf8').replace(/\r\n/g, '\n');
const MB = fs.readFileSync(path.join(ROOT, 'functions', 'mail-box.js'), 'utf8').replace(/\r\n/g, '\n');

function grab(src, name){
  const i = src.indexOf('function ' + name + '(');
  assert.ok(i >= 0, '못 찾음: ' + name);
  let d = 0, j = i;
  for(;; j++){ if(src[j] === '{') d++; else if(src[j] === '}'){ d--; if(!d){ j++; break; } } }
  return src.slice(i, j);
}
function code(t){
  return t.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}
const T = (() => { const b = { console }; vm.createContext(b); vm.runInContext(TH + '\nthis.M=this.PuCoThread;', b); return b.M; })();

/* ══════════════════════════════════════════════
   ① 회사 메일함이 갈래로
   ══════════════════════════════════════════════ */
/* 서버가 적는 한 줄 (functions/mail-box.js msgRow) */
const 받은줄 = { u: 171876, f: '김과장', e: 'kim@gana.co.kr', t: 'we@pureun.kr',
  s: '[안내] 임금대장 회신', d: 1757000000000, r: 1, a: 2, p: '보내주신 대장 확인했습니다' };
const 보낸줄 = { u: 171900, f: '푸른노무법인', e: 'we@pureun.kr', t: 'kim@gana.co.kr,hr@gana.co.kr',
  tn: '김과장', s: '취업규칙 개정안 송부', d: 1757100000000, a: 1, p: '검토 부탁드립니다' };

test('★★ 받은함 한 줄이 표준 줄이 된다', () => {
  const g = T.fromMailBox({ '171876': 받은줄 }, { slug: 'INBOX' });
  assert.equal(g.key, 'in');
  const r = g.rows[0];
  assert.equal(r.at, 1757000000000);
  assert.equal(r.from, 'kim@gana.co.kr');
  assert.equal(r.subject, '[안내] 임금대장 회신');
  assert.equal(r.atts, 2);
  assert.equal(r.id, 'INBOX:171876');
});

test('★★ 보낸함은 «받는 주소»로 붙는다', () => {
  const g = T.fromMailBox({ '171900': 보낸줄 }, { slug: 'Sent', out: true });
  assert.equal(g.key, 'out');
  assert.equal(g.rows[0].to, 'kim@gana.co.kr,hr@gana.co.kr');
  assert.equal(g.rows[0].from, '');
  assert.equal(g.rows[0].who, '김과장');
});

test('★★ 칸 이름이 서버가 적는 것과 «짝»이다 — 한쪽만 고치면 목록이 빈다', () => {
  const row = code(grab(MB, 'msgRow'));
  ['u:', 'f:', 'e:', 't:', 's:', 'd:', 'a:', 'p:'].forEach(k => {
    assert.ok(row.indexOf('    ' + k) >= 0, '서버에 ' + k + ' 가 없다');
  });
  const F = code(grab(TH, 'fromMailBox'));
  ['r.u', 'r.f', 'r.e', 'r.t', 'r.s', 'r.d', 'r.a', 'r.p'].forEach(k => {
    assert.ok(F.indexOf(k) >= 0, '읽개에 ' + k + ' 가 없다');
  });
});

test('시각이 없는 줄은 안 담는다', () => {
  assert.equal(T.fromMailBox({ a: { s: '제목만' } }, {}).rows.length, 0);
  assert.equal(T.fromMailBox(null, {}).rows.length, 0);
});

test('★ 담당자 주소로 그 사업장에 붙는다 — 푸른이알피 업체관리에 적힌 주소다', () => {
  const co = { id: 'co-1', name: '(주)가나전자', contacts: [{ email: 'kim@gana.co.kr' }] };
  const rows = T.thread(co, [T.fromMailBox({ '1': 받은줄 }, { slug: 'INBOX' })], { all: [co] });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].how, 'addr');
});

test('★ 회사에 적힌 여러 칸의 주소를 다 본다 (담당자·대표·세금계산서)', () => {
  const A = T.addrsOf({ contacts: [{ email: 'a@x.kr' }], primaryContactEmail: 'b@x.kr',
    taxEmail: 'c@x.kr', email: 'd@x.kr' });
  assert.deepEqual(Object.keys(A).sort(), ['a@x.kr', 'b@x.kr', 'c@x.kr', 'd@x.kr']);
});

test('남의 회사 주소로는 안 붙는다', () => {
  const co = { id: 'co-2', name: '다라산업', contacts: [{ email: 'x@dara.kr' }] };
  assert.equal(T.thread(co, [T.fromMailBox({ '1': 받은줄 }, {})], { all: [co] }).length, 0);
});

/* ══════════════════════════════════════════════
   ② 요약 — 있었다는 기록이지 사본이 아니다
   ══════════════════════════════════════════════ */
const 줄 = (at, key, subject, who, how) =>
  ({ at, key, subject, who: who || '', text: '', how: how || 'addr' });

test('★★ 한 줄은 「언제·받음/보냄·무엇을·누구와」뿐이다', () => {
  const d = T.digest([줄(Date.UTC(2026, 8, 3, 5), 'in', '[안내] 임금대장 회신', '김과장')], 30);
  const r = d.rows[0];
  assert.equal(r.io, 'in');
  assert.equal(r.s, '임금대장 회신', '대괄호 발송 표시를 안 뗐다');
  assert.equal(r.w, '김과장');
  assert.match(r.d, /^\d{4}-\d{2}-\d{2}$/);
  assert.deepEqual(Object.keys(r).sort(), ['at', 'd', 'io', 's', 'w']);
});

test('★★ 본문을 안 담는다 — 사본이 아니라 기록이다', () => {
  const r = T.digest([{ at: 1, key: 'in', subject: '문의', text: '아주 긴 본문'.repeat(50) }]).rows[0];
  assert.ok(!('text' in r) && !('body' in r) && !('p' in r));
  assert.ok(JSON.stringify(r).length < 200);
});

test('제목이 없으면 미리보기 앞머리를 쓴다 — 그것도 없으면 「(제목 없음)」', () => {
  assert.equal(T.digest([{ at: 1, key: 'in', text: '급여자료 보냅니다' }]).rows[0].s, '급여자료 보냅니다');
  assert.equal(T.digest([{ at: 1, key: 'in' }]).rows[0].s, '(제목 없음)');
});

test('한 줄은 마흔여섯 자에서 끊는다', () => {
  const s = T.digest([{ at: 1, key: 'in', subject: '가'.repeat(80) }]).rows[0].s;
  assert.equal(s.length, 47);
  assert.ok(s.endsWith('…'));
});

test('★★ 짐작으로 붙은 줄은 그렇게 적어 둔다 — 확실한 것과 섞이면 남의 메일을 믿는다', () => {
  const rows = T.digest([줄(1, 'in', '가나전자 문의', '', 'text'), 줄(2, 'in', '회신', '', 'addr')]).rows;
  assert.equal(rows.find(r => r.s === '가나전자 문의').g, 1);
  assert.ok(!('g' in rows.find(r => r.s === '회신')), '확실한 줄에 짐작 표가 붙었다');
});

test('★★ 최근 것부터 정해진 줄 수만 — 사업장 천 곳이면 그것이 요금이다', () => {
  const many = [];
  for(let i = 0; i < 100; i++) many.push(줄(1000 + i, 'in', '메일' + i));
  const d = T.digest(many, 30);
  assert.equal(d.rows.length, 30);
  assert.equal(d.n, 100, '모두 몇 통인지는 남는다');
  assert.equal(d.rows[0].s, '메일99', '최근 것이 맨 위가 아니다');
  assert.equal(d.at, 1099);
});

test('받은 것·보낸 것을 갈라 센다', () => {
  const d = T.digest([줄(3, 'in', 'a'), 줄(2, 'out', 'b'), 줄(1, 'out', 'c')]);
  assert.equal(d.inN, 1);
  assert.equal(d.outN, 2);
});

test('오간 것이 없으면 빈 요약이다', () => {
  const d = T.digest([]);
  assert.equal(d.n, 0);
  assert.equal(d.at, 0);
  assert.equal(d.rows.length, 0);
});

test('시각이 없는 줄은 요약에 안 들어간다', () => {
  assert.equal(T.digest([{ key: 'in', subject: '언제인지 모름' }]).n, 0);
});

/* ══════════════════════════════════════════════
   ③ 사업장 열쇠가 세 곳에서 같다
   ══════════════════════════════════════════════ */
test('★★ 요약을 적는 열쇠가 기업 상세(coKeyOf)와 «같은 셈»이다', () => {
  const K = code(grab(PC, 'coMailKey'));
  assert.match(K, /digits\(\(co && \(co\.bizNo \|\| co\.bizno\)\) \|\| ''\)/);
  assert.match(K, /d\.length >= 10 \? d : \('n' \+ _norm\(/);
  /* 기업 상세가 쓰는 그 잣대 — 사업자번호 열 자리, 없으면 n+정규화한 상호 */
  const O = (PC.match(/const coKeyOf = [^\n]+/) || [''])[0];
  assert.match(O, /d\.length>=10 \? d : \('n'\+_norm\(/);
});

test('★★ 업무관리가 읽는 열쇠와 같다 — 어긋나면 있는 요약이 조용히 안 나온다', () => {
  const mine = grab(W, '_coNorm').replace(/\s+/g, '');
  const theirs = (PC.match(/const _norm = s => [^\n]+/) || [''])[0].replace(/\s+/g, '');
  const body = t => (t.match(/String\(s\|\|''\)(.+?);/) || [])[1];
  assert.ok(body(mine));
  assert.equal(body(mine), body(theirs));
  /* 업무관리는 번호 열쇠·이름 열쇠 둘 다 본다(사업자등록증이 나중에 온 회사) */
  assert.match(code(grab(W, 'cmFor')), /coKeysOf\(it\)\.forEach/);
});

test('★ 업체는 칸 이름이 bizNo·name 이다 (명함은 bizno·company)', () => {
  assert.match(grab(PC, 'coMailKey'), /co\.name \|\| co\.companyName/);
});

/* ══════════════════════════════════════════════
   ④ 안 달라졌으면 안 쓴다 · 없으면 지운다
   ══════════════════════════════════════════════ */
const WRITE = code(grab(PC, 'coMailWrite'));

test('★★ 오간 것이 없으면 «지운다» — 빈 칸은 「없다」와 「아직 안 읽었다」를 못 가른다', () => {
  assert.match(WRITE, /const val = dg\.n \? Object\.assign\([\s\S]*?\) : null;/);
});

test('★★ 달라진 것이 없으면 안 쓴다 — 열 때마다 천 곳을 다시 쓰면 그것이 요금이다', () => {
  assert.match(WRITE, /if\(_coMailPrev\[key\] === sig\) return Promise\.resolve\(false\);/);
});

test('★ 쓰다 실패하면 «안 썼다»로 되돌린다 — 안 그러면 영영 다시 안 쓴다', () => {
  assert.match(WRITE, /delete _coMailPrev\[key\];/);
});

test('열쇠를 못 만들면 아무 데도 안 쓴다 — 「n」 하나에 온 회사가 뭉친다', () => {
  assert.match(WRITE, /if\(!key \|\| key === 'n'\) return Promise\.resolve\(false\);/);
});

test('★ 사업장을 열면 그 곳 요약이 저절로 남는다', () => {
  assert.match(code(PC), /if\(co\) coMailWrite\(co, rows\);/);
});

test('★★ [⇪ 업무관리에 연결]이 사무관리 «전체 사업장»을 돈다', () => {
  const S = code(grab(PC, 'coMailSyncAll'));
  assert.match(S, /const cos = state\.erpCompanies \|\| \[\];/);
  assert.match(S, /T\.thread\(co, src, \{ all: cos \}\)/);
  assert.match(code(PC), /onclick="coMailSyncAll\(\)"/);
});

test('★★ 한 곳씩 차례로 쓴다 — 한꺼번에 던지면 중간에서 끊긴다', () => {
  const S = code(grab(PC, 'coMailSyncAll'));
  assert.match(S, /coMailWrite\(co, rows\)\.then\(ok => \{ if\(ok\) wrote\+\+; step\(\); \}\);/);
  assert.match(S, /if\(_coMailRunning\)\{ toast\('이미 돌고 있습니다'\); return; \}/);
});

test('★ 요약에 쓸 폴더는 받은함·보낸함·손폴더 — 스팸·휴지통은 안 본다', () => {
  assert.match(PC, /const CO_MAIL_KINDS = \{ inbox:1, tome:1, sent:1, archive:1, custom:1 \};/);
  assert.ok(PC.indexOf('spam:1') < 0 && PC.indexOf('trash:1') < 0);
});

test('★ 폴더마다 최근 것만 받아 온다 — 몇 년치를 다 받으면 그것이 요금이다', () => {
  assert.match(code(grab(PC, 'coMailPrep')), /loadMailBox\(f\.slug, CO_MAIL_PER_FOLDER,/);
  assert.match(code(grab(PC, 'coMailPrep')), /filter\(f => !_mbMsgs\[f\.slug\]\)/, '이미 받은 폴더를 또 받는다');
});

test('★ 사업장마다 서른 줄 (대표 결정 2026-09-06)', () => {
  assert.match(PC, /const CO_MAIL_MAX_ROWS = 30;/);
  assert.match(code(grab(PC, 'coMailWrite')), /digest\(rows, CO_MAIL_MAX_ROWS\)/);
});

/* ══════════════════════════════════════════════
   ⑤ 업무관리는 그 한 칸만 읽는다
   ══════════════════════════════════════════════ */
test('★★ 회사 메일함을 업무관리가 직접 읽지 않는다 — 잣대가 두 벌이 되면 안 된다', () => {
  const live = code(W);
  assert.doesNotMatch(live, /ref\(\s*['"`]mailbox/);
  assert.doesNotMatch(live, /MB_ROOT/);
});

test('★★ 사업장 하나 것만 읽는다 — 사천 곳을 통째로 읽지 않는다', () => {
  const L = grab(W, 'cmLoad');
  assert.match(L, /fbDb\.ref\(CO_MAIL_ROOT\+'\/'\+k\)\.once\('value'\)/);
  assert.doesNotMatch(L, /fbDb\.ref\(CO_MAIL_ROOT\)/);
});

test('★★ 읽는 곳은 «한 줄»뿐이고, 여기서 쓰지 않는다', () => {
  const live = code(W);
  const uses = live.split('\n').filter(t => t.indexOf('CO_MAIL_ROOT') >= 0 && t.indexOf('var CO_MAIL_ROOT') < 0);
  assert.equal(uses.length, 1, JSON.stringify(uses));
  assert.match(uses[0], /\.once\('value'\)/);
  assert.doesNotMatch(live, /CO_MAIL_ROOT[^\n]*\.(set|update|push|remove)\(/);
});

test('★★ 드로어가 스스로를 끝없이 다시 그리지 않는다', () => {
  const b = { console, String, cmSrc: {}, _cmT: {} };
  vm.createContext(b);
  vm.runInContext(grab(W, 'cmNeed'), b);
  b._cmT.k1 = 1;
  assert.deepEqual(Array.from(b.cmNeed(['k1'])), []);
  b.cmSrc.k2 = { rows: [] };
  assert.deepEqual(Array.from(b.cmNeed(['k2'])), [], '빈손으로 온 열쇠를 또 읽는다');
  assert.deepEqual(Array.from(b.cmNeed(['k3'])), ['k3']);
  assert.match(W, /var _mk=cmNeed\(coKeysOf\(items\[S\.drawerId\]\|\|\{\}\)\);\r?\n\s*if\(_mk\.length\) cmLoad\(_mk\)\.then/);
});

test('못 읽어도 조용히 없는 것으로 둔다 — 규칙·권한·빈 자리는 고장이 아니다', () => {
  assert.match(grab(W, 'cmLoad'), /\.catch\(function\(\)\{ cmSrc\[k\]=\{rows:\[\]\}; _cmT\[k\]=0; \}\)/);
});

function cmBox(src, keys){
  const b = { console, String, Number, Object, Array, cmSrc: src,
    coKeysOf: () => keys, safeKey: s => String(s).replace(/[.#$/[\]\s]/g, '_') };
  vm.createContext(b);
  vm.runInContext(grab(W, 'cmFor') + '\n' + grab(W, 'cmHas') + '\n' + grab(W, 'cmKey')
    + '\n' + grab(W, 'cmLogLine'), b);
  return b;
}

test('★ 열쇠가 둘이어도 같은 것을 두 번 안 센다', () => {
  const r = { at: 100, io: 'in', s: '회신' };
  const b = cmBox({ '1234567890': { rows: [r] }, 'n가나': { rows: [r] } }, ['1234567890', 'n가나']);
  assert.equal(b.cmFor({}).length, 1);
});

test('★ 받은 것과 보낸 것이 같은 시각이어도 둘 다 남는다', () => {
  const b = cmBox({ k: { rows: [{ at: 100, io: 'in', s: 'a' }, { at: 100, io: 'out', s: 'b' }] } }, ['k']);
  assert.equal(b.cmFor({}).length, 2);
});

test('최근 것이 위로', () => {
  const b = cmBox({ k: { rows: [{ at: 1, io: 'in', s: 'a' }, { at: 9, io: 'in', s: 'b' }] } }, ['k']);
  assert.equal(b.cmFor({})[0].s, 'b');
});

test('★ 기록에 담는 줄은 「그날 · 받음/보냄 · 무엇을」이다', () => {
  const b = cmBox({}, []);
  assert.equal(b.cmLogLine({ d: '2026-09-03', io: 'in', s: '임금대장 회신' }), '✉ 09-03 받음 — 임금대장 회신');
  assert.equal(b.cmLogLine({ d: '2026-09-03', io: 'out', s: '개정안 송부' }), '📤 09-03 보냄 — 개정안 송부');
});

test('★★ 기록은 «그 메일이 오간 날»로 남는다 — 오늘로 적으면 날짜가 뒤엉킨다', () => {
  const F = code(grab(W, 'cmTake'));
  assert.match(F, /addLog\(itemId,cmLogLine\(r\),String\(r\.d\|\|todayStr\(\)\)\.slice\(0,10\),'mail'\)/);
});

test('★ 기록이 먼저다 — 기록이 안 되면 「담김」으로 표시하지 않는다', () => {
  const F = grab(W, 'cmTake');
  assert.ok(F.indexOf('addLog(') < F.indexOf("mailchk/'+ck).set"));
  assert.match(F, /if\(!ok\) return;/);
});

test('담은 표시는 받은 메일과 같은 자리(work_erp/mailchk)에 둔다', () => {
  assert.match(grab(W, 'cmTake'), /fbDb\.ref\(NS\+'\/mailchk\/'\+ck\)\.set\(rec\)/);
  /* 되돌리는 길도 «한 길»이다 — 두 벌로 만들면 한쪽만 고쳐진다.
     ⚠ 함수 원문에서 글자를 찾지 않는다. 그리는 일이 공용 그리개로 옮겨 가면
       원문에는 안 남는다 — 그려 놓고 그 안을 본다. */
  const 줄 = { at: 1757000000000, io: 'in', s: '회신' };
  const b = cmRowBox();
  b.mailchk[b.cmKey(줄)] = { by: 'x', byName: '권형하', at: '2026-09-06T00:00:00' };
  const 담긴줄 = b.dCmRowHTML(줄, 'W1');
  assert.match(담긴줄, /mailUnsee\(/, '담은 줄을 되돌릴 길이 없다');
  const 안담긴줄 = b.dCmRowHTML({ at: 1, io: 'in', s: '회신' }, 'W1');
  assert.match(안담긴줄, /cmTake\(/, '아직 안 담은 줄에 담는 길이 없다');
});

test('요약 줄 열쇠는 받은 메일·보낸 자료 열쇠와 안 겹친다', () => {
  const b = cmBox({}, []);
  const k = b.cmKey({ io: 'in', at: 1757000000000 });
  assert.equal(k.indexOf('m|'), 0);
  assert.doesNotMatch(k, /[.#$/[\]\s]/);
  assert.notEqual(k, b.cmKey({ io: 'out', at: 1757000000000 }), '받음과 보냄이 같은 열쇠다');
});

/* 그리는 함수를 «떠서 돌린다» — 마크업 글자를 박아 두면 모양만 바꿔도 깨지고,
   반대로 기능을 꺼도 통과한다(STATUS.md 「되풀이된 실수」 ②). */
function cmRowBox(chk){
  const b = { console, String, Number, Object, Array, Date, isNaN,
    mailchk: chk || {},
    esc: x => String(x == null ? '' : x).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])),
    escJ: x => String(x == null ? '' : x).replace(/\\/g, '\\\\').replace(/'/g, "\\'"),
    safeKey: s => String(s).replace(/[.#$/[\]\s]/g, '_') };
  vm.createContext(b);
  vm.runInContext(grab(W, 'cmKey') + '\n' + grab(W, 'cmChk') + '\n' + grab(W, 'cmWhen') + '\n'
    + grab(W, 'cmLogLine') + '\n' + grab(W, '_mlDay') + '\n'
    + grab(W, 'mlRowHTML') + '\n' + grab(W, 'dCmRowHTML'), b);
  return b;
}
/* 마우스를 올려야 보이는 곳(.mlpop)을 뺀 «줄 위에 늘 보이는» 부분 */
function onLine(h){ return h.replace(/<div class="mlpop">[\s\S]*$/, ''); }

test('★ 짐작으로 붙은 줄은 «줄 위에» 그렇게 적는다 — 올려 봐야 알면 짐작을 사실로 읽는다', () => {
  const b = cmRowBox();
  const 짐작 = b.dCmRowHTML({ at: 1757000000000, io: 'in', s: '가나전자 문의', g: 1 }, 'W1');
  const 확실 = b.dCmRowHTML({ at: 1757000000000, io: 'in', s: '회신' }, 'W1');
  assert.match(onLine(짐작), /짐작/, '짐작 표가 마우스를 올려야만 보인다 — 안 올려 본 사람은 짐작을 사실로 읽는다');
  assert.doesNotMatch(onLine(확실), /짐작/, '확실한 줄에 짐작 표가 붙었다');
});

test('★ 요약 줄은 안 본 것으로 세지 않는다 — 이미 지난 일이다', () => {
  assert.match(code(grab(W, 'dMailHTML')), /cm\.map\(function\(r\)\{ return \{ cm:1, at:Number\(r\.at\|\|0\), r:r, seen:true \}; \}\)/);
  assert.doesNotMatch(code(grab(W, 'mailNew')), /cmFor/);
  assert.doesNotMatch(code(grab(W, 'mailFlag')), /cmFor/);
});

test('설명은 ⓘ 팝업에 있다 — 화면에 안 깐다', () => {
  const H = W.slice(W.indexOf('var HELP={'), W.indexOf('function hlp('));
  assert.match(H, /업무관리에 연결/);
  assert.match(H, /최근 30줄/);
  assert.match(H, /짐작/);
  assert.doesNotMatch(grab(W, 'dCmRowHTML'), /kbempty/);
});
