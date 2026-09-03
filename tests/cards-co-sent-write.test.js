/* 📤 보낸 서류 2걸음 — 1:1 보내기가 «회사에도» 한 줄 남긴다 (대표 지시 2026-09-03)
   설계안 ①: 기록의 임자를 «사람»에서 «사업장»으로.

   왜: 보낸 기록이 명함에만 붙으면 담당자가 바뀌는 순간 그 회사에 무엇을 보냈는지
   찾을 길이 없고, 한 회사에 두 사람이면 기록도 둘로 갈린다.

   ★ 이 걸음의 약속
     · 명함 기록(sendLog)은 «그대로 둔다» — 옮기다 잃는 것이 더 크다. 읽을 때 합친다.
     · 회사 열쇠는 기업 상세가 쓰는 «그 열쇠»다 — 새 잣대를 만들지 않는다.
     · 받는 메일 «주소»는 회사 쪽에 안 남긴다.

     node --test tests/cards-co-sent-write.test.js */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'pu-cards.html'), 'utf8').split('\r\n').join('\n');

function slice(from, to) {
  const a = SRC.indexOf(from), b = SRC.indexOf(to, a + 1);
  assert.ok(a > 0 && b > a, '표식을 못 찾았다: ' + from);
  return SRC.slice(a, b);
}
function fnBody(name) {
  const i = SRC.indexOf('\nfunction ' + name + '(');
  assert.ok(i >= 0, name + ' 을 찾지 못했습니다');
  const open = SRC.indexOf('{', i);
  let d = 0;
  for (let k = open; k < SRC.length; k++) {
    if (SRC[k] === '{') d++;
    else if (SRC[k] === '}') { d--; if (!d) return SRC.slice(i, k + 1); }
  }
  assert.fail(name + ' 의 끝을 찾지 못했습니다');
}

/* 쓰는 쪽을 통째로 떠서 «돌린다» — 서버는 대역이 받아 적는다 */
function load(extra) {
  const 쓴것 = [];
  const ctx = Object.assign({
    console,
    DB_ROOT: 'pucards',
    Store: { mode: 'firebase' },
    state: { items: {}, priv: { items: {} }, sendLog: {} },
    myEmail: 'na@pureun.kr',
    _matMeta: {},
    _sendMatSetName: '',
    coList: () => [],
    firebase: {
      database: () => ({
        ref: p => ({
          push: v => { 쓴것.push({ 자리: p, 값: v }); return Promise.resolve(); },
          once: () => Promise.resolve({ val: () => null })
        })
      })
    }
  }, extra || {});
  /* ⚠ 최상위 const 는 컨텍스트 값이 되지 않는다 — var 로 바꿔 실어야 꺼내 본다.
     ⚠ sendLogRec 은 이 토막 «앞»에 있다 — 대역을 넣으면 기록 모양이 바뀌어도 모른다.
       «진짜»를 함께 싣는다(안 실으면 try/catch 안에서 조용히 아무것도 안 쓴다). */
  const code = fnBody('sendLogRec') + '\n'
    + slice('const SENT_KINDS = [', 'function loadSendLog(cardId, cb){')
      .replace(/^const /, 'var ');
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  ctx._쓴것 = 쓴것;
  return ctx;
}

/* ── 갈래 ── */

test('★ 갈래는 «한 곳»에만 있다 — 화면·거르개·세기가 어긋나지 않게', () => {
  const c = load();
  assert.ok(Array.isArray(c.SENT_KINDS));
  ['자료', '취업규칙', '근로계약서', '연차'].forEach(k =>
    assert.ok(c.SENT_KINDS.indexOf(k) >= 0, k + ' 갈래가 없다'));
  assert.equal(SRC.split('const SENT_KINDS').length - 1, 1, '갈래 목록이 두 벌이면 어긋난다');
});

test('모르는 갈래는 「그 밖」으로 — 아무 글자나 기록에 들어가면 셀 수가 없다', () => {
  const c = load();
  assert.equal(c.sentKindOf('연차'), '연차');
  assert.equal(c.sentKindOf('  자료  '), '자료', '앞뒤 빈칸에 안 속는다');
  assert.equal(c.sentKindOf('아무거나'), '그 밖');
  assert.equal(c.sentKindOf(''), '그 밖');
  assert.equal(c.sentKindOf(null), '그 밖');
});

/* ── 회사 열쇠 ── */

test('★ 회사 열쇠는 기업 상세가 쓰는 «그 열쇠»다 — 새 잣대를 만들지 않는다', () => {
  const c = load({
    coList: () => [
      { key: 'n딴회사', cards: [{ id: 'x1' }] },
      { key: '3128149225', cards: [{ id: 'c1' }, { id: 'c2' }] }
    ]
  });
  assert.equal(c.coKeyOfCard('c2'), '3128149225');
  assert.equal(c.coKeyOfCard('x1'), 'n딴회사');
});

test('★ 회사를 못 찾으면 «빈 열쇠» — 남의 회사에 붙이느니 없는 편이 낫다', () => {
  const c = load({ coList: () => [{ key: 'k1', cards: [{ id: 'c1' }] }] });
  assert.equal(c.coKeyOfCard('없는번호'), '');
  assert.equal(c.coKeyOfCard(''), '');
  assert.equal(c.coKeyOfCard(null), '');
});

/* ── 남기는 것 ── */

test('★ 회사 밑에 한 줄이 남는다 — 자리와 값', () => {
  const c = load({ coList: () => [{ key: '3128149225', cards: [{ id: 'c1' }] }] });
  c.state.items.c1 = { id: 'c1', name: '김대리' };
  c.logSentToCompany('c1', { at: 1756800000000, by: 'na@pureun.kr', to: 'kim@x.kr',
                             names: ['제안서'], set: '신규계약 묶음' });
  assert.equal(c._쓴것.length, 1);
  assert.equal(c._쓴것[0].자리, 'pucards/sentDocs/3128149225');
  const v = c._쓴것[0].값;
  assert.equal(v.at, 1756800000000);
  assert.equal(v.by, 'na@pureun.kr');
  assert.equal(v.kind, '자료');
  assert.deepEqual(v.names.length, 1);
  assert.equal(v.set, '신규계약 묶음');
  assert.equal(v.card, 'c1', '어느 명함으로 갔는지 — 두 곳을 합칠 때 이것으로 겹침을 안다');
  assert.equal(v.who, '김대리');
});

test('★★ 받는 «메일 주소»는 회사 쪽에 안 남긴다 — 전 직원이 보는 자리다', () => {
  const c = load({ coList: () => [{ key: 'k1', cards: [{ id: 'c1' }] }] });
  c.state.items.c1 = { id: 'c1', name: '김대리' };
  c.logSentToCompany('c1', { at: 1, by: 'na@pureun.kr', to: 'kim@x.kr', names: ['제안서'] });
  const v = c._쓴것[0].값;
  assert.equal(v.to, undefined, '주소가 남았다: ' + JSON.stringify(v));
  assert.ok(JSON.stringify(v).indexOf('kim@x.kr') < 0, '주소가 어딘가에 새어 들어갔다');
});

test('★ 회사를 못 찾으면 아무것도 안 쓴다 — 명함 기록만 남는다', () => {
  const c = load({ coList: () => [] });
  c.logSentToCompany('c1', { at: 1, names: ['제안서'] });
  assert.equal(c._쓴것.length, 0);
});

test('★ 보낼 때 «두 곳»에 남는다 — 명함에도, 회사에도', () => {
  const c = load({ coList: () => [{ key: 'k1', cards: [{ id: 'c1' }] }] });
  c.state.items.c1 = { id: 'c1', name: '김대리' };
  c._matMeta = { m1: { name: '제안서' } };
  c.logSentMaterials('c1', ['m1'], 'kim@x.kr');
  const 자리 = c._쓴것.map(x => x.자리).sort();
  assert.deepEqual(자리, ['pucards/sendLog/c1', 'pucards/sentDocs/k1']);
});

test('★★ 「🔒 개인」 명함은 «어느 쪽에도» 안 남는다 — 명함 번호가 드러난다', () => {
  const c = load({ coList: () => [{ key: 'k1', cards: [{ id: 'c1' }] }] });
  c.state.priv.items.c1 = { id: 'c1' };
  c.logSentMaterials('c1', ['m1'], 'kim@x.kr');
  assert.equal(c._쓴것.length, 0, '개인 명함 기록이 공용 자리에 남았다');
});

test('서버가 아니면 아무 데도 안 쓴다', () => {
  const c = load({ coList: () => [{ key: 'k1', cards: [{ id: 'c1' }] }] });
  c.Store.mode = 'local';
  c.logSentMaterials('c1', ['m1'], 'kim@x.kr');
  assert.equal(c._쓴것.length, 0);
});

/* ── 읽을 때 두 곳을 합친다 ── */

function loadRead(extra) {
  const ctx = Object.assign({
    console,
    esc: s => String(s == null ? '' : s),
    state: { sendLog: {} }
  }, extra || {});
  const code = (function () {
    const i = SRC.indexOf('\nfunction sendLogList(');
    const open = SRC.indexOf('{', i);
    let d = 0;
    for (let k = open; k < SRC.length; k++) {
      if (SRC[k] === '{') d++;
      else if (SRC[k] === '}') { d--; if (!d) return SRC.slice(i, k + 1); }
    }
  })() + '\n' + slice('const CO_SENT_MAX_CARDS = 30;', 'function coDetailPanelHtml(o){');
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  return ctx;
}

test('★★ 두 곳에 다 있는 것은 «한 번»만 센다 — 두 줄이면 「두 번 보냈나」로 읽힌다', () => {
  const c = loadRead();
  const rows = c.coSentList(
    [{ id: 'c1', name: '김대리' }],
    { c1: { a: { at: 1000, names: ['제안서'], by: 'na@pureun.kr' } } },
    { d1: { at: 1000, card: 'c1', who: '김대리', names: ['제안서'], by: 'na@pureun.kr' } });
  assert.equal(rows.length, 1, '한 번 보낸 것이 두 줄로 나왔다');
  assert.equal(rows[0].what, '제안서');
});

test('★ 명함이 없어진 뒤에도 회사 기록은 남는다 — 이 걸음의 뜻이 그것이다', () => {
  const c = loadRead();
  const rows = c.coSentList(
    [],                                             /* 담당자 명함이 사라졌다 */
    {},
    { d1: { at: 2000, card: 'c9', who: '퇴사한 사람', names: ['계약서'] } });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].who, '퇴사한 사람');
  assert.equal(rows[0].what, '계약서');
});

test('★ 옛 기록(명함)과 새 기록(회사)이 «시간 차례»로 섞인다', () => {
  const c = loadRead();
  const rows = c.coSentList(
    [{ id: 'c1', name: '김대리' }],
    { c1: { a: { at: 1000, names: ['옛 제안서'] } } },
    { d1: { at: 3000, card: 'c1', who: '김대리', names: ['새 계약서'] } });
  assert.equal(rows.length, 2);
  assert.equal(rows[0].what, '새 계약서', '최근 것이 위다');
  assert.equal(rows[1].what, '옛 제안서');
});

test('★ 회사 기록도 읽어 온다 — 그 회사 것만, «한 번»만', () => {
  const 읽은것 = [];
  let done = 0;
  const c = loadRead({
    Store: { mode: 'firebase' },
    DB_ROOT: 'pucards',
    loadSendLog: (id, cb) => cb(),
    firebase: { database: () => ({ ref: p => ({ once: () => { 읽은것.push(p); return Promise.resolve({ val: () => ({}) }); } }) }) }
  });
  c.loadCoSent({ key: 'k1', cards: [] }, () => { done++; });
  return Promise.resolve().then(() => Promise.resolve()).then(() => {
    assert.deepEqual(읽은것, ['pucards/sentDocs/k1']);
    assert.equal(done, 1);
    /* 두 번째로 열면 아무것도 안 묻는다 */
    c.loadCoSent({ key: 'k1', cards: [] }, () => { done++; });
    assert.deepEqual(읽은것, ['pucards/sentDocs/k1'], '받아 둔 것을 또 물어보면 돈이 샌다');
    assert.equal(done, 2);
  });
});

test('★ 각주가 사실을 말한다 — 자른 것은 «2걸음 앞»의 기록뿐이다', () => {
  const c = loadRead();
  const many = [];
  for (let i = 0; i < 31; i++) many.push({ id: 'c' + i, name: '사람' + i, updatedAt: i });
  const html = c.coSentHtml({ key: 'k1', cards: many });
  assert.match(html, /2026-09-03 앞의 기록은/,
    '사람 수와 상관없이 다 못 본다고 읽히면 안 된다 — 그 뒤로는 회사에 바로 쌓인다');
});

/* ── 자리 ── */

test('★ 회사 기록 자리는 sendLog 와 «다른 자리»다 — 섞으면 명함 상세가 깨진다', () => {
  const w = slice('function logSentToCompany(cardId, rec){', '\nfunction logSentMaterials');
  assert.match(w, /sentDocs\/\$\{key\}/);
  assert.ok(!/sendLog/.test(w), '회사 기록을 명함 자리에 쓰면 안 된다');
});

test('★ 명함 기록을 «지우거나 옮기지» 않는다 — 옮기다 잃는 것이 더 크다', () => {
  const m = slice('function logSentMaterials(cardId, ids, to){', '\n/* 한 명함의 보낸 기록');
  assert.match(m, /sendLog\/\$\{cardId\}/, '명함 기록이 사라졌다');
  assert.match(m, /logSentToCompany\(cardId, rec\)/, '회사에도 남겨야 한다');
  assert.ok(!/\.remove\(/.test(m), '옛 기록을 지운다');
});
