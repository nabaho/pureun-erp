/* 표준 정관 생성기 회귀 — 인가 신청에 그대로 내는 글이다.
 *
 * ⚠ 이 저장소는 통째로 github.io 로 공개된다 — 실제 기금명 금지. 여기 자료는 전부 가짜다.
 *
 * 사람이 통독하지 않으면 못 찾는 두 가지를 여기서 막는다:
 *  ① 조문을 넣거나 빼면 번호가 조용히 끊기거나 겹친다.
 *  ② 본문의 「제○조」가 없는 조문을 가리켜도 아무 표시가 없다.
 * 부칙은 제1조부터 **다시** 매기므로 본칙과 갈라서 본다.
 * 「법 제62조」 같은 법령 인용은 정관 조문이 아니므로 상호참조에서 뺀다.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'fund.html'), 'utf8');

function grabFn(name) {
  const i = SRC.indexOf('function ' + name + '(');
  assert.ok(i >= 0, 'fund.html 에 함수가 없다: ' + name);
  let d = 0, on = false;
  for (let j = i; j < SRC.length; j++) {
    if (SRC[j] === '{') { d++; on = true; }
    else if (SRC[j] === '}') { d--; if (on && !d) return SRC.slice(i, j + 1); }
  }
  throw new Error('함수 끝을 못 찾음: ' + name);
}

function build() {
  const box = {};
  const code = [
    'function esc(s){ return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;")'
    + '.replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/\'/g,"&#39;"); }',
    'function num(v){ if(v===""||v==null) return ""; var n=Number(String(v).replace(/,/g,"")); return isFinite(n)?n:""; }',
    grabFn('dgV'), grabFn('dgWon'), grabFn('dgToday'),
    grabFn('charterGong'), grabFn('charterSane'),
    'this.charterGong=charterGong; this.charterSane=charterSane;',
  ].join('\n');
  new Function(code).call(box);
  return box;
}

/* 본칙만 잘라 조문 번호를 본다 — 부칙은 제1조부터 다시 매긴다 */
function partsOf(html) {
  const cut = html.indexOf('<h2>부칙</h2>');
  assert.ok(cut >= 0, '부칙이 없다');
  const main = html.slice(0, cut), supp = html.slice(cut);
  return {
    main, supp,
    arts: [...main.matchAll(/<b>제(\d+)조\(/g)].map(m => +m[1]),
    suppArts: [...supp.matchAll(/<b>제(\d+)조\(/g)].map(m => +m[1]),
    chaps: [...html.matchAll(/<h2>제(\d+)장/g)].map(m => +m[1]),
    text: html.replace(/<br\s*\/?>/g, '\n').replace(/<[^>]+>/g, ''),
  };
}

function checkNumbering(p, nArts, nChaps, label) {
  assert.equal(p.arts.length, nArts, label + ' 조문 수');
  assert.equal(p.chaps.length, nChaps, label + ' 장 수');
  const dup = p.arts.filter((v, i) => p.arts.indexOf(v) !== i);
  assert.deepEqual(dup, [], label + ' 겹치는 조문 번호');
  p.arts.forEach((v, i) => assert.equal(v, i + 1, label + ' 제' + (i + 1) + '조 자리가 어긋났다'));
  p.chaps.forEach((v, i) => assert.equal(v, i + 1, label + ' 제' + (i + 1) + '장 자리가 어긋났다'));
  assert.ok(p.suppArts.length >= 1 && p.suppArts[0] === 1, label + ' 부칙은 제1조부터');
}

/* 본문이 가리키는 조문이 실제로 있는가. 조문 제목 자신과 법령 인용은 뺀다. */
function danglingRefs(p) {
  const body = p.main.replace(/<b>제\d+조\([^)]*\)<\/b>/g, '')
    .replace(/(?:법|근로복지기본법|시행령|시행규칙|같은 법)\s*제\d+조(?:\s*제\d+항)?/g, '');
  const refs = [...new Set([...body.matchAll(/제(\d+)조/g)].map(m => +m[1]))];
  return { refs, dangling: refs.filter(r => !p.arts.includes(r)) };
}

const FUND = {
  name: '가나공동근로복지기금', address: '○○시 ○○구 ○○로 1', chairman: '갑동이',
  officers: [{ role: '이사장', name: '갑동이' }, { role: '이사', name: '을순이' }, { role: '감사', name: '병식이' }],
};
const SITES = [{ name: '(주)가나테크' }, { name: '(주)다라산업' }, { name: '마바물산' }];
const SANE = { name: '가나사내근로복지기금', address: '○○시 ○○구 ○○로 2', chairman: '정대표', company: '(주)가나' };

test('공동 정관 — 6장 42조가 빠짐·겹침 없이 이어진다', () => {
  const { charterGong } = build();
  checkNumbering(partsOf(charterGong(FUND, SITES)), 42, 6, '공동');
});

test('사내 정관 — 5장 37조가 빠짐·겹침 없이 이어진다', () => {
  const { charterSane } = build();
  checkNumbering(partsOf(charterSane(SANE)), 37, 5, '사내');
});

test('본문의 「제○조」가 없는 조문을 가리키지 않는다', () => {
  const box = build();
  [['공동', partsOf(box.charterGong(FUND, SITES))], ['사내', partsOf(box.charterSane(SANE))]].forEach(([lbl, p]) => {
    const { refs, dangling } = danglingRefs(p);
    assert.ok(refs.length >= 1, lbl + ' — 상호참조가 하나도 없다(찾는 방법이 깨졌을 수 있다)');
    assert.deepEqual(dangling, [], lbl + ' — 없는 조문을 가리킨다');
  });
});

test('기금 정보가 본문에 들어간다', () => {
  const box = build();
  const g = partsOf(box.charterGong(FUND, SITES)).text;
  assert.ok(g.includes(FUND.name), '기금명');
  assert.ok(g.includes(FUND.address), '소재지');
  assert.ok(g.includes('(주)가나테크') && g.includes('마바물산'), '참여회사 목록');
  assert.ok(g.includes(FUND.chairman), '이사장');
  assert.ok(partsOf(box.charterSane(SANE)).text.includes('(주)가나'), '사내 — 회사명');
});

test('비어 있으면 빈칸으로 두고 undefined 가 안 샌다', () => {
  const { charterGong } = build();
  const t = charterGong({}, []).replace(/<[^>]+>/g, '');
  assert.ok(t.includes('＿'), '빈칸(＿)으로 남아야 사람이 채운다');
  // 참여회사 자리는 «둘 이상»이 들어갈 곳이라 빈칸도 둘이어야 사람이 알아본다
  assert.ok(t.includes('＿＿＿＿＿＿, ＿＿＿＿＿＿'), '참여회사 빈칸이 두 자리로 남아야 한다');
  assert.ok(!t.includes('undefined') && !t.includes('null'), 'undefined·null 이 새면 안 된다');
});

test('공동·사내 정관의 용어가 서로 안 섞인다', () => {
  const box = build();
  const g = partsOf(box.charterGong(FUND, SITES)).text;
  const s = partsOf(box.charterSane(SANE)).text;
  assert.ok(g.includes('공동근로복지기금') && g.includes('참여회사'), '공동 용어');
  assert.ok(s.includes('사내근로복지기금'), '사내 용어');
  assert.ok(!s.includes('참여회사'), '사내 정관에 공동 용어가 섞였다');
});
