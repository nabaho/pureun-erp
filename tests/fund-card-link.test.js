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

/* ── 담당 한 줄(주담당 드롭다운 + 부담당 드롭다운·알약) ──
   부담당을 체크상자 열 개에서 «골라 담기»로 바꿨다. 저장 코드는 손대지 않았으므로
   숨은 체크상자(class=fd-mgr-sub, checked)가 그대로 붙어 있는지가 관건이다. */
function mgrBox() {
  const box = {};
  const chips = { html: '', kids: [] };
  new Function('CHIPS', 'STAFF', [
    'var _staffCache=STAFF;',
    'var _dirty=0;',
    'function markDirty(){ _dirty++; }',
    'function toast(m,k){ CHIPS.toast=(CHIPS.toast||[]).concat(m); }',
    'function esc(s){ return String(s==null?"":s); }',
    'function $(id){ return id==="fd-mgr-subchips"?CHIPS.el:(id==="fd-mgr-main"?CHIPS.main:null); }',
    grabFn('mgrSubChip'), grabFn('mgrSubField'), grabFn('mgrSubAdd'), grabFn('mgrSubDel'),
    'this.mgrSubField=mgrSubField; this.mgrSubAdd=mgrSubAdd; this.mgrSubDel=mgrSubDel;',
    'this.mgrSubChip=mgrSubChip; this.dirty=function(){ return _dirty; };'
  ].join('\n')).call(box, chips, [
    { sid: 'P-001', name: '가나다' }, { sid: 'P-002', name: '라마바' }, { sid: 'P-003', name: '사아자' }
  ]);
  return { box, chips };
}

test('부담당 알약에 숨은 체크상자가 붙어 저장이 그대로 된다', () => {
  const { box } = mgrBox();
  const chip = box.mgrSubChip('P-002', '라마바');
  assert.match(chip, /class="fd-mgr-sub"/, '저장이 읽는 클래스가 없다');
  assert.match(chip, /value="P-002"/, '사번이 없다');
  assert.match(chip, /checked/, 'checked 가 없으면 :checked 로 안 잡혀 저장에서 빠진다');
  assert.match(chip, /hidden/, '체크상자가 눈에 보이면 알약이 두 번 그려진 것처럼 보인다');
  assert.match(chip, /data-sid="P-002"/, '중복·삭제를 가리는 표가 없다');
  // 저장 코드가 여전히 그 선택자를 쓰는지
  const save = SRC.slice(SRC.indexOf('function saveInfo'), SRC.indexOf('function saveInfo') + 1800);
  assert.match(save, /\.fd-mgr-sub:checked/, '저장이 다른 방법으로 바뀌었다 — 알약도 같이 고쳐야 한다');
});

test('부담당은 드롭다운으로 담고 ×로 뺀다 — 중복·주담당 겹침을 막는다', () => {
  const { box, chips } = mgrBox();
  // 가짜 알약 상자: insertAdjacentHTML·querySelector 만 흉내낸다
  const state = [];
  chips.el = {
    insertAdjacentHTML: (_, h) => { state.push((h.match(/data-sid="([^"]+)"/) || [])[1]); },
    querySelector: sel => {
      const sid = (sel.match(/data-sid="([^"]+)"/) || [])[1];
      return state.includes(sid) ? { remove: () => { state.splice(state.indexOf(sid), 1); } } : null;
    }
  };
  chips.main = { value: 'P-001' };

  box.mgrSubAdd('P-002');
  assert.deepEqual(state, ['P-002'], '고른 사람이 담기지 않았다');
  box.mgrSubAdd('P-002');
  assert.deepEqual(state, ['P-002'], '같은 사람이 두 번 담겼다');
  box.mgrSubAdd('P-001');
  assert.deepEqual(state, ['P-002'], '주담당인 사람이 부담당으로 담겼다');
  assert.ok((chips.toast || []).some(t => t.includes('주담당')), '주담당 겹침을 알려 주지 않았다');
  box.mgrSubAdd('');
  assert.deepEqual(state, ['P-002'], '빈 값으로도 담겼다');
  box.mgrSubDel('P-002');
  assert.deepEqual(state, [], '×로 빠지지 않았다');
  assert.ok(box.dirty() > 0, '바뀐 것을 저장 대상으로 표시하지 않았다');
});

test('담당은 한 줄 — 부담당이 전폭 한 줄을 먹지 않는다', () => {
  assert.match(SRC, /if\(c\[0\]==='manager'\) return sec\+'<div class="fld w3">/, '담당이 한 칸(w3)으로 합쳐지지 않았다');
  assert.ok(!/<div class="fld full"><label>부담당/.test(SRC), '부담당이 다시 전폭 한 줄을 먹는다');
  assert.match(SRC, /class="mgrrow"/, '한 줄 상자가 없다');
  const sub = grabFn('mgrSubField');
  assert.match(sub, /<select id="fd-mgr-sub-add"/, '부담당이 드롭다운이 아니다');
  assert.ok(!/type="checkbox" class="fd-mgr-sub"[^>]*>\s*'\+esc\(u\.name\)/.test(sub),
    '재직자 전원을 체크상자로 늘어놓는 옛 방식이 남았다');
  assert.match(SRC, /onchange="mgrMainChanged\(\)"/, '주담당을 바꿔도 부담당에서 안 빠진다');
  assert.match(SRC, /\.mgrrow\{display:flex/, '한 줄 배치 CSS가 없다');
  // 모달(담당자 지정)은 다른 클래스라 건드리지 않았는지
  assert.match(SRC, /\.mgr-sub:checked/, '모달의 담당 저장이 깨졌다');
});
