/* 기업정보함(기업정보함) → 기금 정보 당겨오기 회귀
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

/* applyCard 를 가짜 화면에 걸어 돌린다.
   opts: {key} 가져오는 자리, {idx} 색인 전체, {sameFund}, {co} 가짜 기업 상세, {sid} 고치던 사업장
   ⚠ applyCard 는 이제 «기업 상세(coInfo) 한 칸을 읽고 나서» 값을 넣는다 — 기다렸다 본다.
     그래서 run 은 Promise 다. 기다리지 않으면 아직 안 채워진 화면을 보게 된다. */
async function run(cardRow, formValues, sameFund, opts) {
  opts = opts || {};
  const box = {};
  const els = {};
  Object.keys(formValues || {}).forEach(id => { els[id] = { value: formValues[id] }; });
  Object.assign(els, opts.nodes || {});     // 표·명부처럼 값 하나가 아닌 자리
  const toasts = [];
  const made = [];
  const reads = [];
  new Function('IDX', 'ELS', 'TOASTS', 'MADE', 'CO', 'READS', [
    grabDecl('SITE_CARD_MAP'), grabDecl('CARD_TARGETS'), grabDecl('CARD_MAP'),
    grabDecl('CO_KEYMAP'), grabDecl('SITE_FIELDS'), grabDecl('CONTACT_FIELDS'),
    'var _cardIdx=IDX, _coCache={}, _nfCard=null, window={};',
    'var _cardPick={fid:"F1",key:"' + (opts.key || 'info') + '",sid:"' + (opts.sid || '') + '"};',
    'var _siteEditSid="' + (opts.sid || '') + '";',
    'var S={fundId:' + (sameFund === false ? '"F2"' : '"F1"') + '};',
    /* 가짜 서버 — 어느 자리를 읽었는지 READS 에 남긴다(통째로 읽으면 여기서 들킨다) */
    'var fbDb={ref:function(p){ READS.push(p); return {once:function(){',
    '  return Promise.resolve({val:function(){ return CO[p] || null; }}); }}; }};',
    'function $(id){ return ELS[id]||null; }',
    'function esc(s){ return String(s==null?"":s); }',
    'function closeM(){ TOASTS.push("__closed__"); }',
    'function markDirty(){ TOASTS.push("__dirty__"); }',
    'function toast(m,k){ TOASTS.push((k?("["+k+"] "):"")+m); }',
    'function renderCardPick(){}',
    'function loadingHTML(m){ return String(m||""); }',
    'function editSite(sid,pre){ MADE.push({sid:sid,pre:pre}); }',
    'function newFund(pre){ MADE.push({newfund:true,pre:pre}); }',
    'function addOfficerRow(){ ELS["off-rows"].__add(); }',
    grabFn('_cardNorm'), grabFn('cardEffective'), grabFn('_coNorm'), grabFn('cardCoKey'),
    grabFn('loadCardCo'), grabFn('cardFull'), grabFn('_primaryContact'), grabFn('_cardFn'),
    grabFn('_openNewFund'), grabFn('_openSiteEdit'),
    grabFn('_readSiteForm'), grabFn('_readNewFundForm'),
    grabFn('_cardIntoRec'), grabFn('_applyCardValues'), grabFn('applyCard'),
    /* 등록부는 이름만 담는다 — 브라우저에서 window 로 찾는 것과 같게 걸어 준다 */
    'window._readSiteForm=_readSiteForm; window._readNewFundForm=_readNewFundForm;',
    'window._openSiteEdit=_openSiteEdit; window._openNewFund=_openNewFund;',
    'this.applyCard=applyCard;'
  ].join('\n')).call(box, opts.idx || [cardRow], els, toasts, made, opts.co || {}, reads);
  box.applyCard(cardRow._id);
  await new Promise(r => setTimeout(r, 0));   // 서버 읽기(가짜)를 기다린다
  const out = {};
  Object.keys(els).forEach(id => { out[id] = els[id].value; });
  return { fields: out, toasts, made, reads };
}

const CARD = { _id: 'c1', k: 'biz', c: '가짜공동근로복지기금', bz: '000-82-00000', ceo: '홍길동', ad: '○○도 ○○시 ○○로 1', ct: '000-000-0000' };
const EMPTY = { 'fd-name': '', 'fd-tax_id_no': '', 'fd-chairman': '', 'fd-address': '', 'fd-phone': '' };

test('빈 칸이면 다섯 칸을 채운다', async () => {
  const r = await run(CARD, { ...EMPTY });
  assert.equal(r.fields['fd-name'], '가짜공동근로복지기금');
  assert.equal(r.fields['fd-tax_id_no'], '000-82-00000', '기금은 고유번호 칸으로 들어가야 한다');
  assert.equal(r.fields['fd-chairman'], '홍길동');
  assert.equal(r.fields['fd-address'], '○○도 ○○시 ○○로 1');
  assert.equal(r.fields['fd-phone'], '000-000-0000');
  assert.ok(r.toasts.includes('__dirty__'), '바뀐 것을 저장 대상으로 표시해야 한다');
});

test('이미 적힌 값은 절대 덮어쓰지 않는다', async () => {
  const r = await run(CARD, { ...EMPTY, 'fd-name': '손으로 넣은 이름', 'fd-chairman': '김철수' });
  assert.equal(r.fields['fd-name'], '손으로 넣은 이름', '사람이 넣은 값이 사라졌다');
  assert.equal(r.fields['fd-chairman'], '김철수', '사람이 넣은 값이 사라졌다');
  assert.equal(r.fields['fd-tax_id_no'], '000-82-00000', '빈 칸은 채워야 한다');
  assert.ok(r.toasts.some(t => t.includes('2칸은 이미 있어')), '건너뛴 칸을 알려 줘야 한다');
});

test('채울 것이 하나도 없으면 그렇게 알린다', async () => {
  const r = await run(CARD, { 'fd-name': 'A', 'fd-tax_id_no': 'B', 'fd-chairman': 'C', 'fd-address': 'D', 'fd-phone': 'E' });
  assert.ok(!r.toasts.includes('__dirty__'), '바꾼 것이 없으면 저장 대상으로 표시하지 않는다');
  assert.ok(r.toasts.some(t => t.includes('채울 빈 칸이 없습니다')));
});

test('카드에 값이 없는 칸은 건드리지 않는다', async () => {
  const bare = { _id: 'c2', k: 'biz', c: '이름만있는카드' };
  const r = await run(bare, { ...EMPTY });
  assert.equal(r.fields['fd-name'], '이름만있는카드');
  assert.equal(r.fields['fd-chairman'], '', '값이 없는데 빈 문자열로 덮어쓰면 안 된다');
});

test('고르는 사이 다른 기금으로 옮겼으면 반영하지 않는다', async () => {
  const r = await run(CARD, { ...EMPTY }, false);
  assert.equal(r.fields['fd-name'], '', '다른 기금의 화면에 남의 값을 넣으면 안 된다');
  assert.ok(r.toasts.some(t => t.includes('기금이 바뀌었습니다')));
});

test('칸 짝이 실제 화면·자료 칸과 맞는다', () => {
  const box = {};
  new Function(grabDecl('SITE_CARD_MAP') + grabDecl('CARD_TARGETS') + ';this.T=CARD_TARGETS;').call(box);
  const fields = grabDecl('FIELDS');
  const siteFields = grabDecl('SITE_FIELDS');
  const contactFields = grabDecl('CONTACT_FIELDS');

  // 기금 정보 — 열려 있는 폼의 id(fd-*)를 채운다
  box.T.info.map.forEach(m => {
    assert.ok(m[1].indexOf('fd-') === 0, '기금 정보 폼의 id 는 fd- 로 시작한다: ' + m[1]);
    assert.ok(fields.includes("'" + m[1].replace(/^fd-/, '') + "'"), 'FIELDS 에 없는 칸을 채우려 한다: ' + m[1]);
  });

  // 참여사업장 — 추가(site)와 편집(siteedit)이 «같은 짝»을 써야 한 쪽만 늘어나지 않는다
  assert.equal(box.T.site.map, box.T.siteedit.map, '추가와 편집이 다른 짝을 쓰고 있다');
  box.T.site.map.forEach(m => {
    if (m[1].indexOf('_c_') === 0) {
      assert.ok(contactFields.includes("'" + m[1].slice(3) + "'"), 'CONTACT_FIELDS 에 없는 담당자 칸: ' + m[1]);
    } else {
      assert.ok(siteFields.includes("'" + m[1] + "'"), 'SITE_FIELDS 에 없는 사업장 칸: ' + m[1]);
    }
  });

  // 새 기금 등록 — 기금 자료의 칸(FIELDS)으로 들어간다
  box.T.newfund.map.forEach(m => {
    assert.ok(fields.includes("'" + m[1] + "'"), 'FIELDS 에 없는 기금 칸을 채우려 한다: ' + m[1]);
  });
  // 창에 칸이 없어 «등록될 때» 실려 가는 것들도 FIELDS 안에 있어야 한다
  const carry = grabDecl('NF_CARRY');
  box.T.newfund.map.forEach(m => {
    if (m[1] === 'name') return;               // 이름만 창에 칸이 있다
    assert.ok(carry.includes("'" + m[1] + "'"), 'NF_CARRY 에 빠진 칸이 있다(등록될 때 사라진다): ' + m[1]);
  });

  // 모든 대상이 mode·kinds·help 를 갖춰야 목록·안내가 그려진다
  const MODES = ['fill', 'make', 'refill', 'officer'];
  Object.keys(box.T).forEach(k => {
    const T = box.T[k];
    assert.ok(MODES.includes(T.mode), '알 수 없는 방식: ' + k + ' → ' + T.mode);
    assert.ok(T.kinds.length && T.kinds.every(x => x === 'biz' || x === 'card'), '카드 종류가 틀렸다: ' + k);
    assert.ok(SRC.includes("'" + T.help + "':{t:"), '등록되지 않은 도움말: ' + T.help);
    /* refill 은 창 «안»이다 — 걷어 올 함수와 되열 함수가 둘 다 있어야 값이 안 사라진다 */
    if (T.mode === 'refill') {
      assert.equal(typeof T.read, 'string', 'refill 은 read 를 «이름»으로 담아야 한다: ' + k);
      assert.equal(typeof T.open, 'string', 'refill 은 open 을 «이름»으로 담아야 한다: ' + k);
      assert.ok(SRC.includes('function ' + T.read + '('), '없는 함수를 가리킨다: ' + T.read);
      assert.ok(SRC.includes('function ' + T.open + '('), '없는 함수를 가리킨다: ' + T.open);
    }
  });
});

test('명함을 고르면 담당자까지, 회사 칸은 같은 회사 사업자등록증으로 메운다', async () => {
  const biz = { _id: 'b1', k: 'biz', c: '㈜가나다', bz: '000-00-00000', ceo: '홍길동', cno: '000000-0000000', bt: '제조업', ad: '○○시 ○○로 1' };
  const card = { _id: 'k1', k: 'card', c: '가나다', n: '김담당', ti: '과장', m: '000-0000-0000', e: 'a@b.c' };
  const r = await run(card, {}, true, { key: 'site', idx: [biz, card] });
  assert.equal(r.made.length, 1, '사업장 추가 창이 열리지 않았다');
  const pre = r.made[0].pre;
  assert.equal(r.made[0].sid, '', '새 사업장이어야 한다');
  assert.equal(pre.name, '가나다', '명함의 회사 이름이 우선');
  assert.equal(pre.biz_no, '000-00-00000', '명함에 없는 사업자번호를 사업자등록증에서 메워야 한다');
  assert.equal(pre.ceo, '홍길동', '대표자도 메워야 한다');
  assert.equal(pre.corp_no, '000000-0000000');
  assert.equal(pre.biz_type, '제조업');
  assert.ok(pre.contacts && pre.contacts.length === 1, '담당자가 안 들어갔다');
  assert.equal(pre.contacts[0].name, '김담당');
  assert.equal(pre.contacts[0].position, '과장');
  assert.equal(pre.contacts[0].mobile, '000-0000-0000');
  assert.equal(pre.contacts[0].email, 'a@b.c');
  /* ⚠ _primaryContact 가 보는 표시는 isPrimary 다. 예전 코드는 primary 를 달아
     «대표 연락처가 하나뿐일 때만» 우연히 맞았다 — 둘이 되는 순간 어긋난다. */
  assert.equal(pre.contacts[0].isPrimary, true, '대표 연락처로 들어가야 한다');
  assert.equal(pre.pucard_id, 'k1', '어느 카드에서 왔는지 남겨야 한다');
  assert.ok(r.toasts.includes('__closed__'), '고른 창을 닫지 않으면 창이 겹쳐 망가진다');
  assert.ok(!pre.company_size && !pre.contrib, '기업정보함에 없는 값을 지어내면 안 된다');
});

test('사업자등록증만 고르면 담당자 없이 회사 칸만 채운다', async () => {
  const biz = { _id: 'b1', k: 'biz', c: '㈜가나다', bz: '000-00-00000', ceo: '홍길동', ad: '○○시 ○○로 1' };
  const r = await run(biz, {}, true, { key: 'site', idx: [biz] });
  const pre = r.made[0].pre;
  assert.equal(pre.name, '㈜가나다');
  assert.ok(!pre.contacts, '사업자등록증에는 사람이 없으므로 담당자를 만들지 않는다');
});

test('가져올 값이 없으면 창을 열지 않는다', async () => {
  const empty = { _id: 'z', k: 'card' };
  const r = await run(empty, {}, true, { key: 'site', idx: [empty] });
  assert.equal(r.made.length, 0, '빈 카드로 창을 열면 안 된다');
  assert.ok(r.toasts.some(t => t.includes('가져올 값이 없는')));
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

/* 목록 걸러내기 — 화면에 «쓸 수 있는 것»만 올라와야 한다.
   2026-08-23 대표 지적: 참여사업장 고르는 창에 회사 없는 개인 명함
   (관장·아나운서·변호사 …)이 줄줄이 올라왔다. 그런 명함으로는 사업장을 만들 수 없다. */
function pickList(idx, key) {
  const box = {};
  const out = { html: '' };
  new Function('IDX', 'OUT', 'Q', [
    grabDecl('SITE_CARD_MAP'), grabDecl('CARD_TARGETS'),
    'var _cardIdx=IDX;',
    'var _cardPick={fid:"F1",key:"' + key + '"};',
    'var funds={F1:{name:"가짜공동근로복지기금"}};',
    'var body={ set innerHTML(v){ OUT.html=v; } };',
    'function $(id){ return id==="cardbody"?body:(id==="cardq"?{value:Q}:null); }',
    'function esc(s){ return String(s==null?"":s); }',
    grabFn('_cardNorm'), grabFn('cardEffective'), grabFn('renderCardPick'),
    'this.render=renderCardPick;'
  ].join('\n')).call(box, idx, out, '');
  box.render();
  return out.html;
}

const NOISE = [
  { _id: 'b1', k: 'biz', c: '주식회사 나래산업', bz: '125-86-09231', ceo: '전영범', ad: '경기도 평택시 청북읍' },
  { _id: 'n1', k: 'card', c: '', n: '한성욱', ti: '관장', ad: '충남 공주시' },
  { _id: 'n2', k: 'card', c: '', n: '하윤수', ti: '대표 / 공인노무사', ad: '인천시 부평구' },
  { _id: 'n3', k: 'card', c: '', n: '김미숙', ti: '아나운서' },
  { _id: 'n4', k: 'card', c: '', n: '이인재' },
  { _id: 'n5', k: 'card', c: '', n: '김경호', ti: '변호사', ad: '충남 서산시' }
];

test('참여사업장 목록에는 회사 없는 개인 명함이 올라오지 않는다', () => {
  const html = pickList(NOISE, 'site');
  assert.ok(html.includes('주식회사 나래산업'), '쓸 수 있는 사업자등록증이 빠졌다');
  ['한성욱', '하윤수', '김미숙', '이인재', '김경호'].forEach(n => {
    assert.ok(!html.includes(n), '회사 없는 개인 명함이 올라왔다: ' + n);
  });
});

test('회사가 있는 명함은 남고, 같은 회사 명함이 여러 장이면 한 장만 올라온다', () => {
  const idx = [
    { _id: 'b1', k: 'biz', c: '㈜가나다', bz: '000-00-00000', ceo: '홍길동' },
    { _id: 'c1', k: 'card', c: '㈜가나다', n: '김하나', ti: '과장' },
    { _id: 'c2', k: 'card', c: '가나다', n: '이두울', ti: '대리' },      // 같은 회사(표기만 다름)
    { _id: 'c3', k: 'card', c: '㈜라마바', n: '박세엣', ti: '팀장' },
    { _id: 'x1', k: 'card', c: '', n: '개인명함' }
  ];
  const html = pickList(idx, 'site');
  assert.ok(html.includes('㈜가나다'), '사업자등록증이 빠졌다');
  assert.ok(html.includes('㈜라마바'), '회사 있는 명함이 빠졌다');
  assert.ok(!html.includes('개인명함'), '회사 없는 명함이 올라왔다');
  const people = ['김하나', '이두울'].filter(n => html.includes(n));
  assert.equal(people.length, 1, '같은 회사 명함이 여러 장 올라왔다: ' + people.join(','));
});

test('기금 정보 목록은 사업자등록증만 — 명함은 아예 안 나온다', () => {
  const html = pickList(NOISE.concat([{ _id: 'c9', k: 'card', c: '어떤회사', n: '아무개' }]), 'info');
  assert.ok(html.includes('주식회사 나래산업'));
  assert.ok(!html.includes('아무개'), '기금 정보에는 명함이 필요 없다');
});

test('회사 이름이 세로로 깨지지 않게 줄바꿈을 막는다', () => {
  const html = pickList(NOISE, 'site');
  assert.ok(html.includes('white-space:nowrap'), '칸이 좁으면 한 글자씩 세로로 깨진다');
  // 소재지만 말줄임(나머지는 그대로 보여야 한다)
  assert.match(html, /text-overflow:ellipsis/, '긴 소재지를 말줄임하지 않으면 표가 넘친다');
  assert.match(SRC, /width:T\.width\|\|640/, '칸 많은 목록을 넓게 여는 설정이 없다');
  assert.match(SRC, /need:'c', width:900/, '참여사업장 목록이 좁게 열린다');
});

/* ── 미완비 일괄 채우기 ──
   기업정보함 카드를 기금에 짝지어 빈 칸을 채운다.
   ⚠ 여기서 잘못 짝지으면 «남의 회사 번호»가 기금에 박힌다 — 짝짓기 규칙이 핵심이다. */
function matcher(idx) {
  const box = {};
  new Function('IDX', [
    'var _cardIdx=IDX;',
    grabFn('_cardFundKey'), grabFn('_cardMatch'),
    'this.match=_cardMatch; this.key=_cardFundKey;'
  ].join('\n')).call(box, idx);
  return box;
}

test('이름이 완전히 같을 때만 짝짓는다 — 4호와 40호를 섞지 않는다', () => {
  const m = matcher([
    { _id: 'a', k: 'biz', c: '가나공동근로복지기금4호', cno: '111111-1111111' },
    { _id: 'b', k: 'biz', c: '가나공동근로복지기금40호', cno: '222222-2222222' }
  ]);
  assert.equal(m.match({ name: '가나공동근로복지기금4호' })._id, 'a', '정확히 같은 이름을 못 찾았다');
  assert.equal(m.match({ name: '가나공동근로복지기금40호' })._id, 'b');
  assert.equal(m.match({ name: '가나공동근로복지기금' }), null, '부분일치로 아무 카드나 끌어오면 안 된다');
});

test('기금·회사 표기가 달라도 같은 이름으로 본다', () => {
  const m = matcher([{ _id: 'a', k: 'biz', c: '㈜ 가나다 사내근로복지기금', cno: '111111-1111111' }]);
  assert.equal(m.key('주식회사 가나다 사내근로복지기금'), m.key('㈜가나다사내근로복지기금'),
    '㈜·주식회사·공백 차이로 못 맞추면 대부분 안 붙는다');
  assert.ok(m.match({ name: '주식회사 가나다 사내근로복지기금' }), '표기만 다른 같은 회사를 못 찾았다');
});

test('아는 번호가 있으면 이름보다 번호로 짝짓는다', () => {
  const m = matcher([
    { _id: 'a', k: 'biz', c: '전혀 다른 이름', bz: '123-82-00001' },
    { _id: 'b', k: 'biz', c: '가나공동근로복지기금', bz: '999-82-99999' }
  ]);
  assert.equal(m.match({ name: '가나공동근로복지기금', tax_id_no: '123-82-00001' })._id, 'a',
    '번호가 맞는 카드를 우선해야 한다');
});

test('후보가 둘 이상이거나 이름이 짧으면 건너뛴다', () => {
  const dupe = matcher([
    { _id: 'a', k: 'biz', c: '가나공동근로복지기금' },
    { _id: 'b', k: 'biz', c: '가나 공동근로복지기금' }        // 표기만 다른 같은 열쇠 = 후보 둘
  ]);
  assert.equal(dupe.match({ name: '가나공동근로복지기금' }), null, '애매하면 짝짓지 말아야 한다');
  const m = matcher([{ _id: 'a', k: 'biz', c: '가공동근로복지기금' }]);
  assert.equal(m.match({ name: '가공동근로복지기금' }), null, '열쇠가 3자 미만이면 쓰지 않는다');
});

test('명함은 짝짓기에 쓰지 않는다 — 회사 번호는 사업자등록증에만 있다', () => {
  const m = matcher([{ _id: 'c', k: 'card', c: '가나공동근로복지기금', n: '김담당' }]);
  assert.equal(m.match({ name: '가나공동근로복지기금' }), null);
});

test('채우는 칸은 셋뿐이고, 못 채우는 셋은 서류로 안내한다', () => {
  const box = {};
  new Function(grabDecl('CARD_BULK') + ';this.B=CARD_BULK;').call(box);
  assert.deepEqual(box.B.map(x => x[1]), ['corp_reg_no', 'tax_id_no', 'address'],
    '기업정보함에 없는 칸을 채우려 하면 안 된다');
  const led = grabDecl('LED_COLS');
  box.B.forEach(b => assert.ok(led.includes("'" + b[1] + "'") || b[1] === 'address',
    '미완비 표에 없는 칸을 채운다: ' + b[1]));
  // 인가번호·인가일·설립등기일은 여기서 채우지 않는다
  ['inka_no', 'inka_date', 'reg_date'].forEach(k =>
    assert.ok(!box.B.some(b => b[1] === k), '인가증·등기부에만 있는 칸을 기업정보함에서 채우려 한다: ' + k));
  assert.ok(SRC.includes("'bulk.card':{t:"), '도움말이 없다');
  assert.match(SRC, /못 채우는 것[\s\S]{0,120}인가번호/, '못 채우는 칸을 안내하지 않는다');
});

test('빈 칸만 채우고, 넣는 순간 서버 값을 다시 확인한다', () => {
  const fn = grabFn('bulkFromCards');
  assert.match(fn, /if\(String\(f\[c\[1\]\]\|\|''\)\.trim\(\)\) return;/, '이미 있는 값을 덮어쓸 수 있다');
  assert.match(fn, /nDone\(f\)<5/, '미완비만 대상으로 삼지 않는다');
  assert.match(fn, /setup_stage!=='설립준비'/, '설립중 기금을 끌어들이면 목록이 무의미해진다');
  // 실제 저장은 공용 적용기를 쓴다(서버 재확인 포함)
  assert.match(SRC, /function applyBulkCards\(\)\{ _applyBulkOffice\(window\._cardPlan/, '공용 적용기를 쓰지 않는다');
  const apply = grabFn('_applyBulkOffice');
  assert.match(apply, /if\(String\(c\[fld\(p\)\]\|\|''\)\.trim\(\)\)\{ skip\+\+; return; \}/, '서버 재확인이 빠졌다');
  assert.match(SRC, /onclick="bulkFromCards\(\)"/, '단추가 없다');
});


/* ══════════════════════════════════════════════════════════════════════════
   기업정보함의 «세 번째 자료» — 기업 상세(pucards/coInfo)
   ══════════════════════════════════════════════════════════════════════════
   기업정보함 화면의 「기업 상세」는 따로 쌓인 자료가 아니라 사업자등록증 + 명함 +
   coInfo 를 합쳐 보여 주는 것이다. 앞의 둘은 검색목록(idx)에 있고, 여기서 마저
   가져오는 것이 coInfo 다 — 상시근로자수·업종·홈페이지처럼 등록증에 없는 값들.

   지켜야 하는 것
    ① 통째로 읽지 않는다 — 회사가 4,000곳이라 창 열 때마다 1MB 가까이 든다
    ② 남의 자료다 — 읽기만 한다
    ③ 사람이 직접 적은 카드가 딸림정보보다 «위»다                              */

const COKEY = 'pucards/coInfo/0000000000';   // 사업자번호(숫자만) 열쇠
const CONAME = 'pucards/coInfo/n가나다';       // 이름 열쇠(등록증이 나중에 들어온 회사)
const GANADA = { _id: 'b1', k: 'biz', c: '㈜가나다', bz: '000-00-00000', ceo: '홍길동', ad: '○○시 ○○로 1' };

test('기업 상세에 있는 상시근로자수까지 가져온다', async () => {
  const r = await run(GANADA, {}, true, { key: 'site', idx: [GANADA],
    co: { [COKEY]: { workers: '123', bizItem: '금형', homepage: 'http://example.invalid' } } });
  assert.equal(r.made.length, 1, '사업장 추가 창이 안 열렸다');
  assert.equal(r.made[0].pre.company_size, '123', '기업 상세의 상시근로자수가 안 들어왔다');
});

test('사업자등록증에 적힌 값이 기업 상세보다 «위»다', async () => {
  const r = await run(GANADA, {}, true, { key: 'site', idx: [GANADA],
    co: { [COKEY]: { ceo: '옛대표', address: '옛주소', workers: '9' } } });
  const pre = r.made[0].pre;
  assert.equal(pre.ceo, '홍길동', '등록증의 대표자를 딸림정보가 덮어썼다');
  assert.equal(pre.address, '○○시 ○○로 1', '등록증의 소재지를 딸림정보가 덮어썼다');
  assert.equal(pre.company_size, '9', '등록증에 없는 값은 딸림정보에서 와야 한다');
});

test('기업 상세는 «그 회사 한 칸»만 읽는다 — 통째로 읽지 않는다', async () => {
  const r = await run(GANADA, {}, true, { key: 'site', idx: [GANADA], co: {} });
  assert.ok(r.reads.length >= 1, '기업 상세를 아예 안 읽었다');
  assert.ok(r.reads.length <= 2, '한 회사에 두 칸(이름 열쇠·번호 열쇠)까지다: ' + r.reads.join(', '));
  r.reads.forEach(p => {
    assert.match(p, /^pucards\/coInfo\/.+/, '엉뚱한 자리를 읽는다: ' + p);
    assert.notEqual(p, 'pucards/coInfo', '통째로 읽으면 회사 4,000곳이 내려온다');
  });
});

test('등록증이 나중에 들어온 회사는 «옛 이름 열쇠»에 남은 값도 살린다', async () => {
  const r = await run(GANADA, {}, true, { key: 'site', idx: [GANADA],
    co: { [CONAME]: { workers: '50' } } });          // 번호 열쇠에는 아무것도 없다
  assert.equal(r.made[0].pre.company_size, '50', '옛 이름 열쇠의 값이 사라졌다');
});

test('두 열쇠에 다 있으면 «번호 열쇠»가 이긴다', async () => {
  const r = await run(GANADA, {}, true, { key: 'site', idx: [GANADA],
    co: { [CONAME]: { workers: '50' }, [COKEY]: { workers: '70' } } });
  assert.equal(r.made[0].pre.company_size, '70', '이름 열쇠(옛것)가 번호 열쇠를 덮어썼다');
});

test('기업 상세에서 폴더·태그·서류목록은 가져오지 않는다', () => {
  const km = grabDecl('CO_KEYMAP');
  ['folder', 'tags', 'ftabs', 'docs'].forEach(k =>
    assert.ok(!km.includes("'" + k + "'"), '기금관리에 쓸 일 없는 값을 들고 온다: ' + k));
});

test('기업 상세도 읽기만 한다', () => {
  const load = grabFn('loadCardCo');
  assert.match(load, /ref\('pucards\/coInfo\/'\+k\)/, '회사 한 칸만 읽어야 한다');
  const code = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.ok(!/ref\('pucards\/coInfo'\)/.test(code), '통째로 읽으면 안 된다');
  assert.ok(!/pucards\/coInfo[^']*'\)\s*\.\s*(set|update|remove|push|on\()/.test(code),
    '기업정보함은 남의 자료다 — 쓰거나 계속 듣고 있으면 안 된다');
});

/* 이름 다듬는 자가 기업정보함과 다르면 «조용히» 못 찾는다 — 오류도 안 난다.
   그래서 기업정보함 원본과 글자 단위로 맞춰 본다. */
test('회사 이름 다듬는 자가 기업정보함(pu-cards.html)과 같다', () => {
  const cards = fs.readFileSync(path.join(__dirname, '..', 'pu-cards.html'), 'utf8');
  const m = cards.match(/const _norm = s =>([^;]+);/);
  assert.ok(m, '기업정보함에서 _norm 을 못 찾았다 — 이름이 바뀌었으면 이 검사도 고칠 것');
  const mine = grabFn('_coNorm');
  const body = mine.slice(mine.indexOf('return ') + 7, mine.lastIndexOf('}')).replace(/;\s*$/, '');
  assert.equal(body.replace(/\s+/g, ''), ('String(s||\'\')' + m[1]).replace(/\s+/g, '').replace(/^String\(s\|\|''\)String\(s\|\|''\)/, "String(s||'')"),
    '기업정보함과 다르게 다듬으면 기업 상세를 조용히 못 찾는다');
});

/* ══════ 창 «안»의 폼에서 당겨오기 — 값이 사라지면 안 된다 ══════
   창은 겹쳐 뜨지 않는다(closeM 은 첫 #modalbg 를 지운다). 그래서 창 안에서
   기업정보함을 열면 그 창은 «사라진다» — 치던 값을 걷어 두고 다시 열어야 한다. */

test('사업장 편집 — 빈 칸만 채우고 고치던 사업장으로 돌아간다', async () => {
  const r = await run(GANADA, { 'se-name': '손으로 넣은 상호', 'se-ceo': '', 'se-biz_no': '',
    'se-address': '', 'sc-name': '김담당' }, true, { key: 'siteedit', sid: 'S1', idx: [GANADA],
    co: { [COKEY]: { workers: '31' } } });
  assert.equal(r.made.length, 1, '편집 창이 다시 안 열렸다 — 치던 값이 통째로 날아간다');
  assert.equal(r.made[0].sid, 'S1', '고치던 사업장이 아닌 곳으로 돌아갔다');
  const pre = r.made[0].pre;
  assert.equal(pre.name, '손으로 넣은 상호', '사람이 친 값이 사라졌다');
  assert.equal(pre.ceo, '홍길동', '빈 칸은 채워야 한다');
  assert.equal(pre.biz_no, '000-00-00000');
  assert.equal(pre.company_size, '31', '기업 상세 값이 편집 창에는 안 들어왔다');
  assert.equal(pre.contacts[0].name, '김담당', '치던 담당자가 사라졌다');
  assert.ok(r.toasts.includes('__closed__'), '고른 창을 닫지 않으면 창이 겹쳐 망가진다');
});

test('사업장 편집 창은 저장된 값 위에 채운 값을 얹는다', () => {
  const es = grabFn('editSite');
  assert.ok(es.includes("Object.assign({},(S.sites&&S.sites[sid])||{},prefill||{})"),
    '편집 창이 prefill 을 안 받으면 기업정보함에서 채워도 화면에 안 나온다');
  assert.ok(es.includes("_siteEditSid=sid||''"), '고치던 사업장을 안 남기면 돌아올 곳을 잃는다');
});

test('새 기금 등록 — 이름은 창에, 칸 없는 값은 등록될 때 함께 간다', async () => {
  const card = { _id: 'c1', k: 'biz', c: '가짜공동근로복지기금', bz: '000-82-00000',
    ceo: '홍길동', ad: '○○로 1', ct: '000-000-0000', cno: '000000-0000000' };
  const r = await run(card, { 'nf-name': '', 'nf-short': '○○ 9호' }, true,
    { key: 'newfund', idx: [card] });
  assert.ok(r.made[0] && r.made[0].newfund, '등록 창이 다시 안 열렸다');
  const pre = r.made[0].pre;
  assert.equal(pre.name, '가짜공동근로복지기금');
  assert.equal(pre.short_name, '○○ 9호', '치던 약칭이 사라졌다');
  assert.equal(pre.tax_id_no, '000-82-00000', '창에 칸이 없다고 버리면 등록 직후 또 쳐야 한다');
  assert.equal(pre.corp_reg_no, '000000-0000000');
  assert.equal(pre.chairman, '홍길동');
  assert.equal(pre.phone, '000-000-0000');
});

test('등록 단추가 기업정보함 값을 함께 저장한다', () => {
  assert.match(grabFn('createFund'), /_nfCard/, '등록할 때 기업정보함 값이 빠진다');
  assert.match(grabFn('newFund'), /_nfCard=null/,
    '창을 열 때 지난 값을 안 비우면 다음 기금에 남의 값이 섞인다');
});

test('그만두어도 치던 값이 안 사라진다 — 되돌아가는 길', () => {
  const open = grabFn('openCardPick');
  assert.match(open, /onclose:function\(\)/, '그만둘 때 되돌아가는 길이 없다');
  assert.match(open, /T\.mode==='refill'/, '창 «안»에서 열렸는지 가리지 않는다');
  assert.match(open, /_read\(\)/, '치던 값을 미리 걷어 두지 않는다');
  assert.match(grabFn('closeM'), /_onclose/, '닫을 때 되돌아가는 길을 안 부른다');
  assert.match(grabFn('showModal'), /opts\.onclose/, '창에 되돌아갈 길을 달 수 없다');
});

/* ══════ 임원 명부 — 사람 이름은 명함에서 ══════ */
function fakeOfficerRows(names) {
  const rows = names.map(v => ({ value: v, focus() {} }));
  return { rows,
    querySelectorAll(sel) { assert.equal(sel, '.off-name'); return rows; },
    __add() { rows.push({ value: '', focus() {} }); } };
}

test('임원 명부 — 명함에서 이름만 넣고 직위는 정하지 않는다', async () => {
  const card = { _id: 'k1', k: 'card', c: '㈜가나다', n: '김이사', ti: '사무국장' };
  const rows = fakeOfficerRows(['']);
  const r = await run(card, {}, true, { key: 'officer', idx: [card], nodes: { 'off-rows': rows } });
  assert.equal(rows.rows[0].value, '김이사', '빈 줄에 넣어야 한다');
  assert.equal(rows.rows.length, 1, '빈 줄이 있는데 줄을 더했다');
  assert.ok(!rows.rows.some(x => x.value === '사무국장'),
    '명함 직책은 임원 «직위»가 아니다 — 등기부를 봐야 안다');
  assert.ok(r.toasts.some(t => t.includes('직위를 골라')), '직위를 사람이 정하도록 알려야 한다');
  assert.ok(r.toasts.some(t => t.includes('사무국장')), '명함 직책을 알려 주면 고르기 쉽다');
  assert.ok(r.toasts.includes('__dirty__'), '저장 대상으로 표시해야 한다');
});

test('임원 명부 — 같은 사람을 두 번 넣지 않는다', async () => {
  const card = { _id: 'k1', k: 'card', c: '㈜가나다', n: '김이사' };
  const rows = fakeOfficerRows(['김이사']);
  const r = await run(card, {}, true, { key: 'officer', idx: [card], nodes: { 'off-rows': rows } });
  assert.equal(rows.rows.length, 1, '줄이 늘었다 — 같은 사람이 두 줄이 된다');
  assert.ok(r.toasts.some(t => t.includes('이미 명부에')));
});

test('임원 명부 — 빈 줄이 없으면 줄을 더한다', async () => {
  const card = { _id: 'k1', k: 'card', c: '㈜가나다', n: '박감사' };
  const rows = fakeOfficerRows(['김이사']);
  await run(card, {}, true, { key: 'officer', idx: [card], nodes: { 'off-rows': rows } });
  assert.equal(rows.rows.length, 2, '줄을 안 더했다');
  assert.equal(rows.rows[1].value, '박감사');
});

/* ══════ 「정보를 치는 자리마다」 당겨올 수 있어야 한다 (대표 지시 2026-08-24) ══════
   ⚠ 글자로 찾지 «않고» 정말 그려 본다. 2026-08-24 손질 대본의 변수 이름이 소스로
     흘러들어 onclick="openCardPick('+Q+'siteedit'+Q+')" 가 된 적이 있다. 글자 검사는
     「openCardPick 이 있다」로 통과했지만 브라우저에서는 그 창을 여는 순간
     ReferenceError 로 화면이 통째로 멈춘다. 그려 보면 그 자리에서 걸린다. */
function renderPanel(name, extra) {
  const box = {};
  const out = { html: '' };
  new Function('OUT', [
    grabDecl('SITE_FIELDS'), grabDecl('CONTACT_FIELDS'), grabDecl('OFFICER_ROLES'),
    grabDecl('NF_CARRY'),
    'var _sitePrefill=null, _siteEditSid="", _nfCard=null;',
    'var S={fundId:"F1",sites:{}};',
    'function $(id){ return null; }',
    'function esc(s){ return String(s==null?"":s); }',
    'function hlp(k){ return "<i>"+k+"</i>"; }',
    'function showModal(h){ OUT.html+=h; }',
    'function markDirty(){}',
    'function loadStaff(){ return Promise.resolve([]); }',
    'function loadingHTML(m){ return String(m||""); }',
    (extra || []).join('\n'),
    grabFn('_primaryContact'), grabFn('_officersOf'), grabFn('_auditorsOf'), grabFn('_offRow'),
    grabFn(name),
    'this.run=' + name + ';'
  ].join('\n')).call(box, out);
  const r = box.run.apply(null, arguments.length > 2 ? [].slice.call(arguments, 2) : []);
  return out.html + (typeof r === 'string' ? r : '');
}

test('사업장 편집 창을 «정말 그리면» 당겨오기 단추가 나온다', () => {
  const html = renderPanel('editSite', [], 'S1');
  assert.ok(html.includes("openCardPick('siteedit')"), '편집 창에 당겨오기 단추가 없다');
  assert.ok(html.includes('id="se-name"'), '사업장 칸이 안 그려졌다');
  assert.ok(html.includes('id="sc-name"'), '담당자 칸이 안 그려졌다');
});

test('새 기금 등록 창을 «정말 그리면» 당겨오기 단추가 나온다', () => {
  const html = renderPanel('newFund', []);
  assert.ok(html.includes("openCardPick('newfund')"), '등록 창에 당겨오기 단추가 없다');
  assert.ok(html.includes('id="nf-name"'), '기금법인명 칸이 안 그려졌다');
});

test('임원 명부를 «정말 그리면» 명함에서 가져오기 단추가 나온다', () => {
  const html = renderPanel('officerPanel', [], { chairman: '홍길동' });
  assert.ok(html.includes("openCardPick('officer')"), '명부에 명함 가져오기 단추가 없다');
  assert.ok(html.includes('off-rows'), '명부 표가 안 그려졌다');
});

test('당겨오기 단추가 정보를 치는 자리마다 있다', () => {
  /* 위 셋은 그려서 확인했다. 나머지 둘은 큰 화면 안이라 글자로 본다. */
  [['onclick="openCardPick()"', '기금 정보'],
   ["openCardPick('site')", '참여사업장 추가'],
   ['onclick="bulkFromCards()"', '미완비 일괄']
  ].forEach(([needle, where]) => {
    const esc = needle.replace(/'/g, String.fromCharCode(92) + "'");
    assert.ok(SRC.includes(needle) || SRC.includes(esc), '당겨오기 단추가 없다: ' + where);
  });
});
