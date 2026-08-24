/* 취업규칙 이력 — 「언제 · 누가 · 어떤 내용으로」가 회사 자리에서 보이는지.
   공용 읽개는 실제로 돌려서 보고, 화면 쪽은 «무엇을 담는지»를 본다.
   (호출 모양을 글자로 못 박으면 서식을 고칠 때마다 검사가 먼저 막는다) */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const H = require(path.join(root, 'js', 'pu-rules-history.js'));
/* 줄바꿈은 기기마다 다를 수 있다(git 이 체크아웃할 때 CRLF 로 바꾼다) —
   글자를 대조하는 검사가 그 때문에 거짓으로 실패하지 않게 읽을 때 한 번 고른다. */
const readSrc = f => fs.readFileSync(path.join(root, f), 'utf8').split('\r\n').join('\n');
const cards = readSrc('pu-cards.html');
const rules = readSrc('rules.html');
const writer = readSrc('chwieop.html');

function seed() {
  return H._seed([
    ['site_2148601234', 'r20260801_260823', { site: '(주)한빛산업', bizno: '214-86-01234', asof: '2026-08-01',
      kind: '일부개정', changed: 3, arts: ['제12조(연차유급휴가)', '제31조(육아휴직)'], artsMore: 1,
      doneBy: '나바호', doneAt: '2026-08-23 14:20' }],
    ['site_2148601234', 'r20250101_241218', { site: '한빛산업', bizno: '2148601234', asof: '2025-01-01',
      mode: 'full', doneBy: '김노무', doneAt: '2024-12-18 17:41' }],
    ['site_2148601234', 'r20230301_enact', { site: '주식회사 한빛산업', bizno: '214-86-01234', asof: '2023-03-01',
      from: 'chwieop', changed: 86, doneBy: '이사무', doneAt: '2023-02-27 16:30' }],
    ['site_x', 'r1', { site: '성진테크', asof: '2024-11-01', kind: '일부개정', changed: 1, arts: ['제20조(휴일)'] }]
  ].map(a => H._shape(a[0], a[1], a[2])));
}

test('한 회사의 회차는 상호 표기가 달라도 사업자번호로 한 줄기가 된다', () => {
  seed();
  // 「(주)한빛산업」·「한빛산업」·「주식회사 한빛산업」 — 사람이 적은 대로 제각각이다
  const got = H.forCompany({ bizno: '214 86 01234', company: '전혀 다른 이름' });
  assert.equal(got.length, 3, '사업자번호가 같으면 상호 표기가 달라도 한 회사다');
  assert.deepEqual(got.map(r => r.asof), ['2026-08-01', '2025-01-01', '2023-03-01'], '시행일 최신순');
});

test('사업자번호가 없으면 상호명으로 찾되, 법인격 표기는 따지지 않는다', () => {
  seed();
  assert.equal(H.forCompany({ company: '성진테크' }).length, 1);
  assert.equal(H.forCompany({ company: '(주)성진테크' }).length, 1, '(주)가 붙어도 같은 회사');
  assert.equal(H.forCompany({ company: '성 진 테 크' }).length, 1, '띄어쓰기가 달라도 같은 회사');
});

test('없는 회사는 빈 목록 — 화면에 빈 칸이 생기면 안 된다', () => {
  seed();
  assert.deepEqual(H.forCompany({ company: '없는회사', bizno: '111-22-33333' }), []);
  assert.deepEqual(H.forCompany(null), []);
  assert.deepEqual(H.forCompany({ company: '가' }), [], '한 글자는 아무거나 걸리므로 안 찾는다');
});

test('구분은 제정·전부개정·일부개정 셋으로만 갈린다', () => {
  assert.equal(H.kindOf({ from: 'chwieop' }), '제정');
  assert.equal(H.kindOf({ enacted: true }), '제정');
  assert.equal(H.kindOf({ mode: 'full' }), '전부개정');
  assert.equal(H.kindOf({ mode: 'partial' }), '일부개정');
  assert.equal(H.kindOf({}), '일부개정', '옛 기록에 표시가 없으면 일부개정으로 본다');
  assert.equal(H.kindOf({ kind: '제정', mode: 'full' }), '제정', '이미 적힌 구분이 우선');
});

test('한 줄 요약에 언제·무엇을·누가가 모두 들어간다', () => {
  const list = seed();
  const line = H.lineOf(list[0]);
  assert.match(line, /2026-08-01 시행/, '언제부터');
  assert.match(line, /일부개정 3개 조/, '무엇을');
  assert.match(line, /나바호/, '누가');
  assert.match(line, /완료\(08-23\)/, '언제 끝냈나');
  // 제정은 「N개 조」를 붙이지 않는다 — 전부 새로 만든 것이라 셈이 뜻이 없다
  const enact = list.find(r => r.kind === '제정');
  assert.equal(H.lineOf(enact), '2023-03-01 시행 · 제정 · 이사무 완료(02-27)');
});

test('바뀐 조 제목은 몇 개만 보이고 나머지는 개수로 접힌다', () => {
  const list = seed();
  assert.equal(H.artsOf(list[0]), '제12조(연차유급휴가) · 제31조(육아휴직) 외 1개');
  assert.equal(H.artsOf(list[1]), '', '조 제목이 없으면 빈 문자열 — 화면이 그 자리를 안 그린다');
});

test('열기 주소는 규정관리의 그 회차를 가리킨다 — 대조표는 한 곳에서만 그린다', () => {
  const list = seed();
  const url = H.openUrl(list[0]);
  assert.match(url, /^rules\.html\?sso=1#rev=/);
  assert.equal(decodeURIComponent(url.split('#rev=')[1]), 'site_2148601234@r20260801_260823');
});

test('서버를 못 읽어도 조용히 빈 목록 — 그 줄만 빠지고 화면은 뜬다', async () => {
  H._seed(null);
  const db = { ref: () => ({ once: () => Promise.reject(new Error('permission denied')) }) };
  const got = await H.load(db);
  assert.deepEqual(got, []);
});

/* ── 화면 세 곳이 같은 자리를 본다 ── */

test('규정관리는 완료 회차에만 가벼운 색인을 남긴다', () => {
  assert.match(rules, /rules_mgmt\/index/, '색인 자리가 있어야 한다');
  assert.match(rules, /function rulesIndexOf/);
  assert.match(rules, /function putRulesIndex/);
  assert.match(rules, /function delRulesIndex/);
  // 완료를 풀거나 지우면 색인에서도 빠져야 «없는 회차»가 기업정보함에 남지 않는다
  assert.match(rules, /if\(done\)putRulesIndex\(next\); else delRulesIndex/);
  assert.match(rules, /if\(r&&r\.rev\)delRulesIndex\(r\)/);
  // 색인이 생기기 전에 끝난 회차도 메운다
  assert.match(rules, /function backfillRulesIndex/);
});

test('규정관리에 📜 이력 탭이 있고 확정 회차만 보여 준다', () => {
  assert.match(rules, /id="arch-tab-hist"/);
  assert.match(rules, /id="hist-body"/);
  assert.match(rules, /function renderHist/);
  assert.match(rules, /loadArch\(\)\.filter\(r=>r\.store==="done"\)/, '작업중은 이력이 아니다');
  // 구분은 공용 읽개의 규칙을 그대로 쓴다 — 두 곳에서 따로 정하면 화면마다 답이 다르다
  assert.match(rules, /PuRulesHistory\.kindOf\(rec\)/);
});

test('기업정보함은 회사 상세 두 곳 모두에 취업규칙 칸을 둔다 (폰·PC)', () => {
  assert.match(cards, /function rulesBoxHtml/);
  const calls = (cards.match(/\$\{rulesBoxHtml\(it\)\}/g) || []).length;
  assert.equal(calls, 2, '폰(openDetail)과 PC(openPcDetail) 두 곳 모두에 있어야 한다');
  assert.match(cards, /PuRulesHistory\.forCompany/);
  assert.match(cards, /보기만 합니다 · 고치는 곳은 규정관리입니다/, '어디서 고치는지 적어 둔다');
});

test('기업정보함의 취업규칙 칸이 창 밖으로 밀리지 않는다', () => {
  // 격자 1fr 칸은 기본값(min-width:auto)이라 안 접히는 긴 글이 오면 칸이 그만큼 벌어진다.
  // 폰에서 가로로 넘쳐 실제로 잡혔다 — 되돌아오지 않게 못 박는다.
  assert.match(cards, /\.rulehist \.rh-x\{[^}]*min-width:0/);
  assert.match(cards, /\.rulehist \.rh-arts\{[^}]*white-space:normal/, '바뀐 조는 접혀서 다 보여야 한다');
});

test('취업규칙 작성기가 제정을 이력으로 남긴다 — 예전엔 저장할 때마다 덮어썼다', () => {
  assert.match(writer, /function chwSaveEnactment/);
  assert.match(writer, /rules_mgmt\/done\//, '개정과 같은 자리에 쌓는다');
  assert.match(writer, /rules_mgmt\/index\//, '다른 화면이 읽는 색인도 함께');
  assert.match(writer, /rules_mgmt\/orig\//, '제정 당시 전문도 남겨 나중에 개정 검토를 시작할 수 있게');
  // 구분은 작성기가 직접 적지 않는다 — 「어디서 왔나」만 넘기고 공용 읽개가 제정으로 읽는다
  assert.match(writer, /from:'chwieop'/);
  assert.equal(H.kindOf({ from: 'chwieop' }), '제정');
  // 보관함 목록이 summary 를 읽는다 — 없으면 목록이 깨진다
  assert.match(writer, /summary:\{위반의심:0,누락:0,수동확인:0,시행예정:0\}/);
  assert.match(writer, /function saveDoc[\s\S]{0,700}chwSaveEnactment\(\)/, '저장할 때 함께 남긴다');
});

test('작성기에서 규정관리로 넘길 때 사업자번호를 함께 싣는다', () => {
  // 이게 없으면 사업장 키가 상호명 기준이 되어, 상호가 바뀌는 순간 이력이 두 줄기로 끊긴다
  assert.match(writer, /bizno:'',/, '작성기 문서에 사업자번호 칸이 있어야 한다');
  assert.match(writer, /fld\('사업자등록번호','bizno'/, '사람이 넣을 입력칸도 있어야 한다');
  assert.match(writer, /site:co, bizno:doc\.info\.bizno\|\|''/, '넘길 때 함께 싣는다');
  assert.match(rules, /SITE_BIZNO\[key\]=h\.bizno\|\|""/, '규정관리가 그것을 받는다');
});

/* 규칙 문서는 두 벌이다 — 콘솔에 통째로 붙여넣는 「전체본」과 그 한 블록만 뗀 「조각본」.
   조각본은 전체본에서 떠온 것이므로 둘이 어긋나면 안 되고, 두 문서가 허용하는 칸이
   코드가 넣는 칸과 정확히 같아야 한다. 하나만 어긋나도 이력이 조용히 안 쌓인다. */
const RULES_FULL = 'docs/firebase-rules-현재적용본+취업규칙이력(붙여넣기용).json';
const RULES_SNIP = 'docs/firebase-rules-취업규칙이력-추가(붙여넣기용).json';
const readJson = p => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));

test('전체본과 조각본의 index 블록이 한 글자도 다르지 않다', () => {
  const full = readJson(RULES_FULL).rules.rules_mgmt.index;
  const snip = readJson(RULES_SNIP).index;
  assert.deepEqual(snip, full, '조각본은 전체본에서 떠온 것이어야 한다 — 손으로 고치지 말 것');
});

test('전체본은 콘솔에 붙여넣을 수 있는 모양이고, index 는 done 옆에 있다', () => {
  const full = readJson(RULES_FULL);
  assert.ok(full.rules, '최상위가 rules 여야 콘솔이 받는다');
  const mgmt = Object.keys(full.rules.rules_mgmt);
  assert.ok(mgmt.includes('done') && mgmt.includes('index'));
  assert.equal(mgmt.indexOf('index'), mgmt.indexOf('done') + 1, 'done 바로 뒤에 두어 사람이 나란히 본다');
  /* 읽기는 done 과 같은 잣대여야 한다 — 이력이 회차보다 넓게 열리면 안 된다 */
  assert.equal(full.rules.rules_mgmt.index['.read'], full.rules.rules_mgmt.done['.read']);
});

test('색인에 넣는 칸이 서버 규칙이 허용하는 칸과 정확히 같다', () => {
  const rev = readJson(RULES_FULL).rules.rules_mgmt.index.$site.$rev;
  const allowed = Object.keys(rev).filter(k => !k.startsWith('.') && k !== '$other').sort();
  assert.ok(allowed.length > 5, '규칙 문서에서 칸 목록을 못 읽었다');
  assert.equal(rev.$other['.validate'], false, '목록에 없는 칸은 막아야 한다');

  /* 소스를 긁지 않고 «서버로 보내는 그 함수»를 실제로 돌려 나온 칸을 견준다 —
     규정관리도 작성기도 이 함수를 거치므로, 여기만 맞으면 두 곳 다 맞는다.
     넘겨준 적 없는 칸(items 처럼 셈에만 쓰는 것)이 새어 나가는지도 함께 본다. */
  const made = Object.keys(H.fit({
    site: '가', asof: '2026-08-01', ownerUid: 'u1',
    items: [1, 2, 3], owner: 'a@b.c', enacted: true, status: '완료'
  })).sort();
  assert.deepEqual(made, allowed, '색인에 넣는 칸이 규칙이 허용하는 칸과 다르다');
});

test('규칙이 받아 주는 값만 코드가 넣는다 — 구분·보낸 곳은 정해진 낱말뿐', () => {
  const rev = readJson(RULES_FULL).rules.rules_mgmt.index.$site.$rev;
  const kinds = /\^\(([^)]+)\)\$/.exec(rev.kind['.validate'])[1].split('|');
  assert.deepEqual(kinds.sort(), ['일부개정', '전부개정', '제정'].sort());
  // 공용 읽개가 내는 구분이 모두 규칙에 있는 낱말이어야 한다
  ['제정', '전부개정', '일부개정'].forEach(k => assert.ok(kinds.includes(k), k));
  assert.equal(H.kindOf({ from: 'chwieop' }), '제정');
  const froms = /\^\(([^)]+)\)\$/.exec(rev.from['.validate'])[1].split('|');
  assert.deepEqual(froms.sort(), ['chwieop', 'rules']);
});

/* ── 서버 한도 ──
   규칙은 칸마다 길이를 재고, 한 칸이라도 길면 그 회차 저장을 «통째로» 물리친다.
   화면에는 아무 말도 안 뜨고 이력만 조용히 안 쌓이므로, 넣기 전에 잘라야 한다. */
test('규칙이 정한 길이 한도와 코드가 쓰는 한도가 같다', () => {
  const rev = readJson(RULES_FULL).rules.rules_mgmt.index.$site.$rev;
  const maxOf = k => {
    const m = /length\s*<=\s*(\d+)/.exec((rev[k] || {})['.validate'] || '');
    return m ? Number(m[1]) : null;
  };
  ['site', 'bizno', 'asof', 'savedAt', 'savedBy', 'doneAt', 'doneBy', 'ownerName'].forEach(k => {
    assert.equal(H.LIMIT[k], maxOf(k), k + ' 한도가 규칙과 다르다');
  });
  assert.equal(H.LIMIT.art, maxOf.call(null, 'arts') || Number(/length\s*<=\s*(\d+)/.exec(rev.arts.$i['.validate'])[1]),
    '조 제목 한도가 규칙과 다르다');
  const maxChanged = Number(/val\(\)\s*<=\s*(\d+)/.exec(rev.changed['.validate'])[1]);
  assert.equal(H.LIMIT.changed, maxChanged, '바뀐 조 수 한도가 규칙과 다르다');
});

test('값이 아무리 길어도 규칙을 어기지 않게 잘라서 넣는다', () => {
  const long = '가'.repeat(500);
  const o = H.fit({
    site: long, bizno: long, asof: long, savedAt: long, doneAt: long,
    savedBy: long, doneBy: long, ownerName: long, ownerUid: 'u1',
    changed: 99999, arts: [long, long, long, long, long, long], artsMore: -3, mode: 'full'
  });
  const L = H.LIMIT;
  ['site', 'bizno', 'asof', 'savedAt', 'doneAt', 'savedBy', 'doneBy', 'ownerName']
    .forEach(k => assert.ok(o[k].length <= L[k], k + ' 가 한도를 넘었다: ' + o[k].length));
  assert.ok(o.changed <= L.changed, '바뀐 조 수가 한도를 넘었다');
  assert.ok(o.arts.length <= L.arts, '조 제목 개수가 한도를 넘었다');
  o.arts.forEach(a => assert.ok(a.length <= L.art, '조 제목이 한도를 넘었다: ' + a.length));
  assert.ok(o.artsMore >= 0, '음수는 규칙이 받지 않는다');
  assert.equal(o.kind, '전부개정');
  assert.equal(o.from, 'rules', '알 수 없는 값은 rules 로 떨어뜨린다');
});

test('빈 기록을 넣어도 규칙이 요구하는 칸은 빠지지 않는다', () => {
  const o = H.fit({});
  ['site', 'asof', 'kind', 'ownerUid'].forEach(k =>
    assert.ok(k in o, k + ' 는 규칙이 반드시 요구한다'));
  assert.equal(o.kind, '일부개정');
  assert.equal(o.changed, 0);
  assert.deepEqual(o.arts, []);
});

test('색인을 넣는 두 화면이 모두 공용 자르개를 거친다', () => {
  assert.match(rules, /return PuRulesHistory\.fit\(\{/, '규정관리');
  assert.match(writer, /var idx=PuRulesHistory\.fit\(\{/, '작성기');
  // 작성기도 공용 읽개를 읽어야 fit 을 부를 수 있다
  assert.match(writer, /js\/pu-rules-history\.js\?v=\d+/, '작성기가 공용 읽개를 읽어야 한다');
});

test('공용 읽개를 쓰는 화면은 그 파일을 읽고 판번호를 붙인다', () => {
  for (const [name, src] of [['pu-cards.html', cards], ['rules.html', rules]]) {
    assert.match(src, /js\/pu-rules-history\.js\?v=\d+/, name + ' 이 판번호와 함께 읽어야 한다');
  }
});
