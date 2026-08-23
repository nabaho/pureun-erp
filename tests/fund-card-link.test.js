/* 기업정보함(명함첩) → 기금 정보 당겨오기 회귀
 *
 * ⚠ 이 저장소는 통째로 github.io 로 공개된다 — 실제 기금명·번호 금지. 여기 자료는 전부 가짜다.
 *
 * 지켜야 하는 것 두 가지
 *  ① 가벼운 검색목록(pucards/idx)만 읽는다 — 원본 카드는 사진이 수 MB라 절대 안 읽는다
 *  ② 이미 적힌 값은 덮어쓰지 않는다 — 사람이 손으로 넣은 값이 조용히 사라지면 안 된다
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
function grabDecl(name) {
  const i = SRC.indexOf('var ' + name + '=');
  assert.ok(i >= 0, 'fund.html 에 상수가 없다: ' + name);
  let d = 0, on = false;
  for (let j = SRC.indexOf('=', i); j < SRC.length; j++) {
    const c = SRC[j];
    if (c === '{' || c === '[') { d++; on = true; }
    else if (c === '}' || c === ']') { d--; if (on && !d) return SRC.slice(i, j + 1) + ';'; }
  }
  throw new Error('상수 끝을 못 찾음: ' + name);
}

/* applyCard 를 가짜 화면에 걸어 돌린다 */
function run(cardRow, formValues, sameFund) {
  const box = {};
  const els = {};
  Object.keys(formValues).forEach(id => { els[id] = { value: formValues[id] }; });
  const toasts = [];
  new Function('CARD', 'ELS', 'TOASTS', [
    grabDecl('CARD_MAP'),
    'var _cardIdx=[CARD];',
    'var _cardPick={fid:"F1"};',
    'var S={fundId:' + (sameFund === false ? '"F2"' : '"F1"') + '};',
    'function $(id){ return ELS[id]||null; }',
    'function esc(s){ return String(s==null?"":s); }',
    'function closeM(){}',
    'function markDirty(){ TOASTS.push("__dirty__"); }',
    'function toast(m,k){ TOASTS.push((k?("["+k+"] "):"")+m); }',
    grabFn('applyCard'),
    'this.applyCard=applyCard;'
  ].join('\n')).call(box, cardRow, els, toasts);
  box.applyCard(cardRow._id);
  const out = {};
  Object.keys(els).forEach(id => { out[id] = els[id].value; });
  return { fields: out, toasts };
}

const CARD = { _id: 'c1', k: 'biz', c: '가짜공동근로복지기금', bz: '000-82-00000', ceo: '홍길동', ad: '○○도 ○○시 ○○로 1', ct: '000-000-0000' };
const EMPTY = { 'fd-name': '', 'fd-tax_id_no': '', 'fd-chairman': '', 'fd-address': '', 'fd-phone': '' };

test('빈 칸이면 다섯 칸을 채운다', () => {
  const r = run(CARD, { ...EMPTY });
  assert.equal(r.fields['fd-name'], '가짜공동근로복지기금');
  assert.equal(r.fields['fd-tax_id_no'], '000-82-00000', '기금은 고유번호 칸으로 들어가야 한다');
  assert.equal(r.fields['fd-chairman'], '홍길동');
  assert.equal(r.fields['fd-address'], '○○도 ○○시 ○○로 1');
  assert.equal(r.fields['fd-phone'], '000-000-0000');
  assert.ok(r.toasts.includes('__dirty__'), '바뀐 것을 저장 대상으로 표시해야 한다');
});

test('이미 적힌 값은 절대 덮어쓰지 않는다', () => {
  const r = run(CARD, { ...EMPTY, 'fd-name': '손으로 넣은 이름', 'fd-chairman': '김철수' });
  assert.equal(r.fields['fd-name'], '손으로 넣은 이름', '사람이 넣은 값이 사라졌다');
  assert.equal(r.fields['fd-chairman'], '김철수', '사람이 넣은 값이 사라졌다');
  assert.equal(r.fields['fd-tax_id_no'], '000-82-00000', '빈 칸은 채워야 한다');
  assert.ok(r.toasts.some(t => t.includes('2칸은 이미 있어')), '건너뛴 칸을 알려 줘야 한다');
});

test('채울 것이 하나도 없으면 그렇게 알린다', () => {
  const r = run(CARD, { 'fd-name': 'A', 'fd-tax_id_no': 'B', 'fd-chairman': 'C', 'fd-address': 'D', 'fd-phone': 'E' });
  assert.ok(!r.toasts.includes('__dirty__'), '바꾼 것이 없으면 저장 대상으로 표시하지 않는다');
  assert.ok(r.toasts.some(t => t.includes('채울 빈 칸이 없습니다')));
});

test('카드에 값이 없는 칸은 건드리지 않는다', () => {
  const bare = { _id: 'c2', k: 'biz', c: '이름만있는카드' };
  const r = run(bare, { ...EMPTY });
  assert.equal(r.fields['fd-name'], '이름만있는카드');
  assert.equal(r.fields['fd-chairman'], '', '값이 없는데 빈 문자열로 덮어쓰면 안 된다');
});

test('고르는 사이 다른 기금으로 옮겼으면 반영하지 않는다', () => {
  const r = run(CARD, { ...EMPTY }, false);
  assert.equal(r.fields['fd-name'], '', '다른 기금의 화면에 남의 값을 넣으면 안 된다');
  assert.ok(r.toasts.some(t => t.includes('기금이 바뀌었습니다')));
});

test('칸 짝이 실제 기금 정보 폼과 맞는다', () => {
  const box = {};
  new Function(grabDecl('CARD_MAP') + ';this.CARD_MAP=CARD_MAP;').call(box);
  const fields = grabDecl('FIELDS');
  box.CARD_MAP.forEach(m => {
    const key = m[1].replace(/^fd-/, '');
    assert.ok(m[1].indexOf('fd-') === 0, '기금 정보 폼의 id 는 fd- 로 시작한다: ' + m[1]);
    assert.ok(fields.includes("'" + key + "'"), 'FIELDS 에 없는 칸을 채우려 한다: ' + key);
  });
});

test('가벼운 검색목록만 읽고 원본 카드는 건드리지 않는다', () => {
  const load = grabFn('loadCardIdx');
  assert.match(load, /ref\('pucards\/idx'\)\.once\('value'\)/, 'pucards/idx 를 once 로 읽어야 한다');
  // 주석에 적힌 설명 문구가 아니라 '실제 호출'만 본다
  const code = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.ok(!/pucards\/items/.test(code), '원본 카드는 사진이 수 MB라 읽으면 안 된다');
  assert.match(load, /r\.k==='biz'/, '사업자등록증 카드만 골라야 한다');
  assert.ok(!/ref\('pucards[^']*'\)\s*\.\s*(set|update|remove|push)/.test(SRC),
    '기업정보함은 남의 자료다 — 쓰면 안 된다');
});

test('화면 배선 — 버튼·도움말·한 줄 서류칸', () => {
  assert.match(SRC, /onclick="openCardPick\(\)"/, '기금 정보에 당겨오기 버튼이 없다');
  assert.ok(SRC.includes("'info.card':{t:"), '도움말이 등록되지 않았다');
  assert.match(SRC, /function docZoneOne\(zid,kind,label,hint\)/, '한 줄 서류칸이 없다');
  const zone = grabFn('docZoneOne');
  ['dzOver', 'dzDrop', 'dzPick'].forEach(h => assert.ok(zone.includes(h), '끌어놓기 배선이 빠졌다: ' + h));
  assert.ok(zone.includes('openAlbumPick'), '사진첩 버튼이 빠졌다');
  assert.ok(zone.includes('-stat'), '판독 상태 자리가 빠졌다');
  // 예전의 큰 칸(3줄 + 버튼 줄)로 되돌아가지 않았는지
  const panel = SRC.slice(SRC.indexOf('📥 서류 자동 입력') - 400, SRC.indexOf('📥 서류 자동 입력') + 900);
  assert.ok(!panel.includes("dropZone('dz-inka'"), '서류칸이 다시 커졌다 — docZoneOne 을 쓸 것');
});
