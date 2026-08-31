'use strict';
/* 구성원 칸 채우기 · 비공개 (대표 지시 2026-08-31)
   ═══════════════════════════════════════════════════════════════════════════
   대표 지시: 「비공개 버튼 만들어달라. 여기 화면에서 직접 수정하면
              니가 직접 고치는 형태로 연결해달라」

   ★ 여기서 못 박는 것
     ① 칸 이름을 «짐작하지 않는다» — 화면에 보이는 이름으로 찾고, 하나로 안 좁혀지면
        그 칸은 건너뛰고 무엇을 못 했는지 말한다 (엉뚱한 칸을 덮으면 되돌릴 수 없다)
     ② 숨은 칸에는 절대 쓰지 않는다 (얼굴 사진이 숨은 칸에 있다)
     ③ 이름(글 제목)은 «안 채운다» — 홈페이지 카드가 「권형하대표」 한 덩어리라
        제목이 무엇인지 편집 화면을 봐야 안다. 덮으면 직책이 조용히 사라진다
     ④ 비공개는 «지우는 것이 아니다». 자리를 못 찾으면 아무것도 하지 않는다
     ⑤ 단추는 검사한 부품 소스를 그대로 싣는다 (베껴 쓰면 조용히 갈라진다)
   실행: node --test tests/pu-home-member-fill.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const R = path.join(__dirname, '..');
const ctx = { window: undefined, console: { warn() {}, log() {} } };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(R, 'js', 'pu-home-parse.js'), 'utf8'), ctx);
vm.runInContext(fs.readFileSync(path.join(R, 'js', 'pu-home-fill.js'), 'utf8'), ctx);
const F = ctx.PuHomeFill;

/* ══════ 아주 작은 «가짜 편집 화면» ══════
   진짜 화면을 못 봤으므로(로그인이 필요하다) 모양을 지어내 돌린다.
   ★ 지어낸 모양에 맞춰 «칸 이름»을 박아 두지 않는다 — 보이는 이름으로 찾는지를 본다. */
function 화면(rows, extra) {
  const fields = [], labels = [];
  const doc = {
    querySelectorAll(sel) {
      if (/label/.test(sel)) return labels;
      if (/select/.test(sel)) return (extra && extra.selects) || [];
      if (/checkbox/.test(sel)) return (extra && extra.boxes) || [];
      return [];
    },
    querySelector(sel) {
      const m = /\[name="([^"]+)"\]/.exec(sel);
      if (m) return fields.find(f => f.name === m[1]) || null;
      /* ★ 이름 없이 물으면 «첫 칸»을 내준다 — 진짜 화면이 그렇다.
         무르게 null 을 돌려주면, 아무 칸이나 집어 가는 잘못을 흉내조차 못 낸다. */
      if (/input|textarea|select/.test(sel)) return fields[0] || null;
      return null;
    },
    getElementById: () => null,
    defaultView: { Event: function () { } }
  };
  const mk = (tag, o) => Object.assign({ tagName: tag, textContent: '', value: '',
    getAttribute: () => null, querySelector: () => null, dispatchEvent() {}, scrollIntoView() {},
    ownerDocument: doc }, o || {});
  rows.forEach(r => {
    const input = mk(r.tag || 'INPUT', { type: r.type || 'text', name: r.name || '', value: r.value || '' });
    labels.push(mk('LABEL', { textContent: r.label, nextElementSibling: input }));
    fields.push(input);
  });
  return { doc, fields };
}

/* 지금 홈페이지 편집 화면이라고 «짐작되는» 모양 — 경력사항만 이름을 안다 */
function 사람화면(값) {
  값 = 값 || {};
  return 화면([
    { label: '제목', name: 'title', value: 값.name || '박성수' },
    { label: '직책1', name: 'extra_vars1', value: 값.p1 || '' },
    { label: '직책2', name: 'extra_vars2', value: 값.p2 || '공인노무사' },
    { label: '경력사항', name: 'extra_vars4', tag: 'TEXTAREA', value: 값.car || '옛 경력' }
  ]);
}

/* ══════ ① 칸을 «보이는 이름»으로 찾아 채운다 ══════ */

test('★ 직책까지 함께 채운다 — 여태 경력사항만 채워 직책이 다르면 눌러도 그대로였다', () => {
  const { doc, fields } = 사람화면();
  const r = F.fillMemberFields(doc, { 직책1: '팀장', 직책2: '공인노무사', 경력사항: '새 경력' });
  const 채운칸 = r.done.map(d => d['칸']);
  assert.ok(채운칸.indexOf('직책1') >= 0, '★ 직책1 을 못 채웠다: ' + JSON.stringify(r.skipped));
  assert.ok(채운칸.indexOf('경력사항') >= 0, '★ 경력사항을 못 채웠다');
  assert.equal(fields[1].value, '팀장');
  assert.equal(fields[3].value, '새 경력');
  /* 이미 같은 칸은 «건드리지 않는다» — 헛되이 고쳤다고 알리지 않는다 */
  assert.ok(r.skipped.some(s => s['칸'] === '직책2' && /이미 같/.test(s.why)),
    '이미 같은 칸을 다시 채웠다고 한다');
});

test('★ 칸을 «하나로» 못 찾으면 건너뛰고 무엇을 못 했는지 말한다 — 엉뚱한 칸을 덮지 않는다', () => {
  /* 「직책1」이라는 이름이 화면에 아예 없는 경우 */
  const { doc } = 화면([
    { label: '제목', name: 'title', value: '박성수' },
    { label: '경력사항', name: 'extra_vars4', tag: 'TEXTAREA', value: '옛 경력' }
  ]);
  const 제목전 = doc.querySelector('[name="title"]').value;
  const r = F.fillMemberFields(doc, { 직책1: '팀장', 경력사항: '새 경력' });
  assert.equal(r.done.length, 1, '★ 못 찾은 칸을 어딘가에 써 넣었다');
  assert.equal(r.done[0]['칸'], '경력사항');
  /* ★ 엉뚱한 칸이 바뀌지 않았는지 «값으로» 확인한다 */
  assert.equal(doc.querySelector('[name="title"]').value, 제목전,
    '★ 직책1 을 못 찾자 엉뚱한 칸(제목)에 써 넣었다');
  assert.ok(r.skipped.some(s => s['칸'] === '직책1' && /찾지 못했/.test(s.why)),
    '왜 못 채웠는지 안 말한다');
});

test('★ 같은 이름의 칸이 둘이면 단정하지 않는다', () => {
  const { doc } = 화면([
    { label: '직책1', name: 'a', value: '' },
    { label: '직책1', name: 'b', value: '' }
  ]);
  const r = F.fillMemberFields(doc, { 직책1: '팀장' });
  assert.equal(r.done.length, 0, '★ 어느 칸인지 모르는데 하나를 골라 썼다');
});

test('★ 숨은 칸·단추에는 쓰지 않는다 — 얼굴 사진이 숨은 칸에 있다', () => {
  ['hidden', 'file', 'submit', 'button', 'checkbox', 'radio'].forEach(ty => {
    assert.equal(F.isField({ tagName: 'INPUT', type: ty }), false, ty + ' 에 쓰려 한다');
  });
  assert.equal(F.isField({ tagName: 'TEXTAREA' }), true);
  assert.equal(F.isField({ tagName: 'INPUT', type: 'text' }), true);
  /* 숨은 칸에 「직책1」 이름이 붙어 있어도 안 쓴다 */
  const { doc } = 화면([{ label: '직책1', name: 'x', type: 'hidden' }]);
  assert.equal(F.fillMemberFields(doc, { 직책1: '팀장' }).done.length, 0,
    '★ 숨은 칸에 써 넣었다 — 화면에 아무 표시 없이 자료만 바뀐다');
});

test('★ 이름은 «제목» 칸에 들어간다 — 직책 칸은 건드리지 않는다', () => {
  /* 2026-08-31 실제 편집 화면 확인: 제목 칸에는 이름만(「박성수」), 직책1·직책2가 따로 있다.
     목록 카드의 「권형하대표」는 홈페이지가 제목+직책1 을 붙여 찍는 것이다. */
  const { doc, fields } = 사람화면({ p2: '공인노무사' });
  const r = F.fillMemberFields(doc, { 이름: '박한별', 직책2: '공인노무사' });
  assert.equal(fields[0].value, '박한별', '★ 제목 칸에 이름을 안 넣었다');
  assert.equal(fields[2].value, '공인노무사', '★ 직책2 를 건드렸다(이미 같은 값이다)');
  assert.ok(r.done.some(d => d['칸'] === '이름'), '이름을 채웠다고 말하지 않는다');
});

/* ══════ ② 비공개 ══════ */

test('★ 비공개 — 고르개에서 「비공개」를 고른다 (지우지 않는다)', () => {
  const sel = { options: [{ textContent: '공개' }, { textContent: '비공개' }], selectedIndex: 0,
    dispatchEvent() {}, scrollIntoView() {} };
  const { doc } = 화면([], { selects: [sel] });
  const r = F.setPrivate(doc);
  assert.equal(r.ok, true, '비공개로 못 바꿨다: ' + r.why);
  assert.equal(sel.selectedIndex, 1, '★ 「비공개」를 안 골랐다');
});

test('★ 비공개 자리를 못 찾으면 «아무것도 하지 않는다»', () => {
  const { doc } = 화면([]);
  const r = F.setPrivate(doc);
  assert.equal(r.ok, false, '★ 자리도 못 찾았는데 무언가를 건드렸다');
  assert.match(r.why, /찾지 못했습니다/, '왜 못 했는지 안 말한다');
});

test('★ 「비공개」를 고를 곳이 여럿이면 단정하지 않는다', () => {
  const mk = () => ({ options: [{ textContent: '공개' }, { textContent: '비공개' }], selectedIndex: 0,
    dispatchEvent() {}, scrollIntoView() {} });
  const a = mk(), b = mk();
  const { doc } = 화면([], { selects: [a, b] });
  const r = F.setPrivate(doc);
  assert.equal(r.ok, false, '★ 어느 것인지 모르는데 하나를 골랐다');
  assert.equal(a.selectedIndex, 0, '건드리지 않았어야 한다');
  assert.equal(b.selectedIndex, 0, '건드리지 않았어야 한다');
  /* ★ 「여럿이라 못 고른다」와 「자리가 아예 없다」는 다른 말이다.
     갈라 보지 않으면, 여럿일 때 하나를 골라 버리는 잘못도 조용히 통과한다. */
  assert.match(r.why, /단정할 수 없습니다/,
    '왜 못 했는지가 「자리가 없다」로 뭉개졌다: ' + r.why);
});

/* ══════ ③ 쪽지 ══════ */

test('★ 쪽지 셋을 갈라 읽는다 — 쪽·구성원·비공개', () => {
  const 쪽 = F.readPacket(F.packPageEdits('work1', [{ before: '가', after: '나' }]));
  assert.equal(쪽.kind, '쪽 채우기');
  const 사람 = F.readPacket(F.packMemberFields('193', { 직책1: '팀장' }));
  assert.equal(사람.kind, '구성원 채우기');
  assert.equal(사람.srl, '193');
  const 비공개 = F.readPacket(F.packPrivate('193', '박성수'));
  assert.equal(비공개.kind, '비공개');
  assert.equal(비공개.name, '박성수');
  assert.equal(F.readPacket('그냥 글자').ok, false);
  assert.equal(F.readPacket(JSON.stringify({ 푸른ERP: '모르는 것' })).ok, false);
});

test('★ 모든 쪽지에 «옛 단추가 거절할 표시»가 들어 있다 — 경력사항 칸에 통째로 박히지 않게', () => {
  /* 예전에 넣어 두신 단추는 «화면 조각(<div 등)이 섞였으면» 거절한다.
     새 쪽지가 그 검사에 걸리도록 일부러 <div> 한 줄을 넣어 둔다. */
  [
    F.packPageEdits('work1', [{ before: '가', after: '나' }]),
    F.packMemberFields('193', { 직책1: '팀장' }),
    F.packPrivate('193', '박성수')
  ].forEach(p => {
    assert.match(p, /<\s*(html|body|div|table|script)\b/i,
      '★ 옛 단추가 이 쪽지를 그대로 붙여넣는다: ' + p.slice(0, 60));
    assert.equal(F.readPacket(p).ok, true, '새 단추는 읽을 수 있어야 한다');
  });
});

/* ══════ ④ 즐겨찾기 단추 ══════ */

test('★ 단추 하나가 셋을 다 한다 — 부품 소스를 «그대로» 싣는다', () => {
  const url = F.fillBookmarkletUrl();
  assert.match(url, /^javascript:/, '즐겨찾기 주소 모양이 아니다');
  const src = decodeURIComponent(url.slice(11));
  [F.fillMemberFields, F.setPrivate, F.applyLineEdits, F.readPacket, F.isField].forEach(fn => {
    assert.ok(src.indexOf(String(fn)) >= 0,
      '★ 단추가 부품을 그대로 싣지 않았다 — 검사가 지키는 코드와 도는 코드가 갈라진다');
  });
  /* 단추 자체가 돌아가는 글이어야 한다 */
  assert.doesNotThrow(() => new Function(src), '★ 단추 글에 구문 오류가 있다');
});

/* 단추를 «실제로 돌려» 본다 — 가짜 편집 화면에 얹어 놓고 눌러 본다.
   ★ 글자 맞추기로는 못 지킨다: 비공개 체크상자를 누르는 것도 click 이라
     「저장을 누른다」와 구별이 안 된다. 돌려 보면 헷갈릴 일이 없다. */
async function 단추돌리기(o) {
  const src = decodeURIComponent(F.fillBookmarkletUrl().slice(11));
  const 눌린것 = [];
  const 저장단추 = { tagName: 'BUTTON', textContent: '저장',
    click() { 눌린것.push('저장'); } };
  const rows = o.rows || [
    { label: '직책1', name: 'extra_vars1', value: '' },
    { label: '경력사항', name: 'extra_vars4', tag: 'TEXTAREA', value: '옛 경력' }
  ];
  const fields = [], labels = [];
  const doc = {
    querySelectorAll(sel) {
      if (/label/.test(sel)) return labels;
      if (/button/.test(sel)) return [저장단추];
      if (/select/.test(sel)) return o.selects || [];
      if (/checkbox/.test(sel)) return [];
      return [];
    },
    querySelector(sel) {
      const m = /\[name="([^"]+)"\]/.exec(sel);
      return m ? (fields.find(f => f.name === m[1]) || null) : null;
    },
    getElementById: () => null,
    createElement: () => ({ style: {}, textContent: '', remove() {} }),
    body: { appendChild() {} },
    defaultView: null
  };
  const mk = (tag, x) => Object.assign({ tagName: tag, textContent: '', value: '',
    getAttribute: () => null, querySelector: () => null, dispatchEvent() {}, scrollIntoView() {},
    ownerDocument: doc }, x || {});
  rows.forEach(r => {
    const input = mk(r.tag || 'INPUT', { type: r.type || 'text', name: r.name, value: r.value || '' });
    labels.push(mk('LABEL', { textContent: r.label, nextElementSibling: input }));
    fields.push(input);
  });
  const 말한것 = [];
  const sandbox = {
    document: doc,
    location: { search: '?document_srl=193' },
    navigator: { clipboard: { readText: async () => o.쪽지 } },
    alert: m => 말한것.push(m),
    confirm: m => { 말한것.push(m); return !!o.예 },
    prompt: () => '',
    setTimeout: () => 0,
    Event: function () { },
    console: { warn() {}, log() {} }
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  await vm.runInContext(src, sandbox);
  return { 눌린것, 말한것, fields };
}

test('★ 저장은 «물어보고» 누른다 — 취소하면 화면에 채워만 두고 저장하지 않는다', async () => {
  const r = await 단추돌리기({ 쪽지: F.packMemberFields('193', { 직책1: '팀장' }), 예: false });
  assert.equal(r.fields[0].value, '팀장', '칸은 채워야 한다');
  assert.equal(r.눌린것.length, 0, '★ 물어보고 «취소»했는데 저장을 눌렀다');
  assert.ok(r.말한것.some(m => /저장할까요/.test(m)), '저장할지 묻지도 않았다');
});

test('★ 확인을 누르면 그 자리에서 저장까지 — 대표가 다시 찾아 누르지 않아도 된다', async () => {
  const r = await 단추돌리기({ 쪽지: F.packMemberFields('193', { 직책1: '팀장' }), 예: true });
  assert.deepEqual(r.눌린것, ['저장'], '★ 확인했는데 저장을 안 눌렀다');
});

test('★ 비공개도 «두 번 묻는다» — 내릴 것인지, 그리고 저장할 것인지', async () => {
  const sel = { options: [{ textContent: '공개' }, { textContent: '비공개' }], selectedIndex: 0,
    dispatchEvent() {}, scrollIntoView() {} };
  const 취소 = await 단추돌리기({ 쪽지: F.packPrivate('193', '박성수'), 예: false, selects: [sel] });
  assert.equal(sel.selectedIndex, 0, '★ 「내릴까요?」에 취소했는데 비공개로 바꿨다');
  assert.equal(취소.눌린것.length, 0, '취소했는데 저장했다');

  const 확인 = await 단추돌리기({ 쪽지: F.packPrivate('193', '박성수'), 예: true, selects: [sel] });
  assert.equal(sel.selectedIndex, 1, '확인했는데 비공개로 안 바꿨다');
  assert.deepEqual(확인.눌린것, ['저장'], '확인했는데 저장을 안 눌렀다');
  assert.ok(확인.말한것.some(m => /되살릴 수 있습니다|지우는 것이 아니라/.test(m)),
    '★ 「지우는 것이 아니라 감추는 것」이라고 안 알린다');
});

test('★ 엉뚱한 쪽지·모르는 쪽지에는 아무것도 하지 않는다', async () => {
  const r = await 단추돌리기({ 쪽지: '그냥 글자', 예: true });
  assert.equal(r.눌린것.length, 0, '★ 쪽지가 아닌데 저장했다');
  assert.equal(r.fields[0].value, '', '★ 쪽지가 아닌데 칸을 건드렸다');
});

/* ══════ 화면 접기 (대표 지시 2026-08-31) ══════
   「현재 화면은 너무 크고 눈에 보이지도 않는다. 전체화면도 다 안 들어온다」
   홈페이지 편집 화면은 큰 머리 그림이 한 장을 통째로 먹고, 아래에는 떠 있는 띠가 칸을 가린다.
   ★ 접는 잣대는 «이름»이 아니라 «자리와 크기»다 — 홈페이지 반죽(스킨)이 바뀌면
     이름은 언제든 달라지지만, 「고칠 칸보다 위에 있는 큰 덩어리」는 그대로다.
   ★ 절대 접으면 안 되는 것: 안에 고칠 것이 든 덩어리. 접으면 아무것도 못 고친다. */

function 접기화면() {
  const 만들기 = (이름, o) => ({
    이름: 이름,
    style: {}, tagName: 'DIV',
    contains: () => false,
    querySelector: () => (o.칸있음 ? { tagName: 'INPUT' } : null),
    getBoundingClientRect: () => ({ top: o.top, bottom: o.top + o.h, height: o.h })
  });
  const 칸 = { tagName: 'INPUT', type: 'text',
    getBoundingClientRect: () => ({ top: 900, bottom: 930, height: 30 }),
    scrollIntoView() {} };
  const 것들 = [
    만들기('큰 머리 그림', { top: 0, h: 640 }),
    만들기('작은 띠', { top: 650, h: 40 }),
    /* ★ 칸보다 «위»에 있으면서 안에 고칠 것이 든 큰 상자(예: 위쪽 검색칸 묶음).
       크기와 자리만 보면 접힐 자리인데, 접으면 그 안의 칸을 못 쓴다. */
    만들기('위쪽 상자 — 고칠 것이 들었다', { top: 300, h: 300, 칸있음: true }),
    만들기('고칠 칸이 든 상자', { top: 800, h: 500, 칸있음: true }),
    만들기('아래 큰 덩어리(등록 단추 자리)', { top: 1400, h: 400 }),
    만들기('떠 있는 상담문의 띠', { top: 980, h: 80, 뜸: true })
  ];
  const doc = {
    body: { children: 것들 },
    defaultView: {
      scrollY: 0, scrollBy() {},
      getComputedStyle: el => ({ position: el.이름 === '떠 있는 상담문의 띠' ? 'fixed' : 'static' })
    }
  };
  return { doc, 것들, 칸 };
}

test('★ 고칠 칸보다 «위»에 있는 큰 덩어리를 접는다 — 한 화면에 들어오게', () => {
  const { doc, 것들, 칸 } = 접기화면();
  const n = F.tidyEditScreen(doc, 칸);
  const 접힘 = 이름 => 것들.find(x => x.이름 === 이름).style.display === 'none';
  assert.ok(n > 0, '아무것도 안 접었다');
  assert.equal(접힘('큰 머리 그림'), true, '★ 화면을 통째로 먹는 그림을 그대로 뒀다');
  assert.equal(접힘('떠 있는 상담문의 띠'), true, '★ 떠 있는 띠가 칸을 가린 채로 남았다');
});

test('★ 고칠 것이 든 덩어리는 «절대» 안 접는다 — 접으면 아무것도 못 고친다', () => {
  const { doc, 것들, 칸 } = 접기화면();
  F.tidyEditScreen(doc, 칸);
  const 접힘 = 이름 => 것들.find(x => x.이름 === 이름).style.display === 'none';
  assert.equal(접힘('고칠 칸이 든 상자'), false, '★ 고칠 칸을 통째로 숨겼다');
  assert.equal(접힘('위쪽 상자 — 고칠 것이 들었다'), false,
    '★ 위에 있고 크다고 접었는데, 그 안에 고칠 것이 들어 있다');
  assert.equal(접힘('아래 큰 덩어리(등록 단추 자리)'), false,
    '★ 칸보다 «아래»엣것을 접었다 — 저장 단추가 거기 있다');
  assert.equal(접힘('작은 띠'), false, '작은 것까지 접을 이유가 없다');
});

test('★ 기준으로 삼을 칸이 없으면 아무것도 안 접는다', () => {
  const { doc, 것들 } = 접기화면();
  assert.equal(F.tidyEditScreen(doc, null), 0, '★ 기준도 없이 접었다');
  assert.equal(것들[0].style.display, undefined, '건드리지 않았어야 한다');
});
