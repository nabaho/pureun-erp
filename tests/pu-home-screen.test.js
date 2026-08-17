'use strict';
/* 홈페이지 관리 화면이 지켜야 할 것.
   모양이나 개수를 못 박지 않는다 — 검사 하나가 모든 앱 배포를 막은 적이 있다.
   내부 helper 이름·따옴표 습관·코드 관용구도 못 박지 않는다. 이름만 바꿔도 깨지는
   검사는 지키는 것이 없다. 지킬 수 있는 것은 «돌려서» 확인한다.
   실행: node --test tests/*.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const R = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(R, 'pu-home.html'), 'utf8');

/* ══════ 화면 함수를 «실제로 돌리기» 위한 도구 ══════
   화면은 한 덩어리 <script> 라 통째로는 못 돌린다(firebase·document 를 부른다).
   그래서 함수 하나씩 잘라 상자(vm) 안에서 돌린다. 잘라내기는 중괄호 짝을 세되
   글자열과 주석 안은 건너뛴다 — 주석에 든 { } 에 걸리면 엉뚱한 데서 끊긴다. */
function fnSource(name) {
  const re = new RegExp('(?:^|\\n)(?:async\\s+)?function\\s+' + name + '\\s*\\(');
  const m = re.exec(html);
  assert.ok(m, name + ' 를 화면에서 찾지 못했습니다');
  const start = m.index + (m[0][0] === '\n' ? 1 : 0);
  let mode = null, depth = 0;
  for (let i = html.indexOf('{', start); i < html.length; i++) {
    const c = html[i], n = html[i + 1];
    if (mode === '/*') { if (c === '*' && n === '/') { mode = null; i++; } continue; }
    if (mode === '//') { if (c === '\n') mode = null; continue; }
    if (mode) {
      if (c === '\\') { i++; continue; }
      if (c === mode) mode = null;
      continue;
    }
    if (c === '/' && n === '*') { mode = '/*'; i++; continue; }
    if (c === '/' && n === '/') { mode = '//'; i++; continue; }
    if (c === '"' || c === "'" || c === '`') { mode = c; continue; }
    if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return html.slice(start, i + 1);
  }
  assert.fail(name + ' 의 끝(닫는 중괄호)을 찾지 못했습니다');
}

function constSource(name) {
  const re = new RegExp('\\nconst ' + name + ' = \\[[\\s\\S]*?\\n\\];');
  const m = re.exec(html);
  assert.ok(m, 'const ' + name + ' 을 찾지 못했습니다');
  return m[0];
}

/* 부품(js/pu-home-*.js)은 진짜를 싣는다 — 화면이 부품에 맡긴 판단까지 함께 확인한다 */
function box(extra) {
  const ctx = Object.assign({ window: undefined, console: { warn() {}, log() {} } }, extra || {});
  vm.createContext(ctx);
  ['pu-home-parse.js', 'pu-home-career.js', 'pu-home-export.js', 'pu-home-diff.js']
    .forEach(f => vm.runInContext(fs.readFileSync(path.join(R, 'js', f), 'utf8'), ctx));
  return ctx;
}
function run(ctx, code) { vm.runInContext(code, ctx); return ctx; }
function plain(v) { return JSON.parse(JSON.stringify(v)); }
const tick = () => new Promise(r => setTimeout(r, 0));

/* ══════ 계획서에 적힌 약속 ══════ */

test('네 모듈을 모두 부른다', () => {
  ['pu-home-parse', 'pu-home-career', 'pu-home-export', 'pu-home-diff']
    .forEach(n => assert.match(html, new RegExp('<script src="js/' + n + '\\.js\\?v=\\d+">')));
});

test('관리자만 쓸 수 있게 막아둔다', () => {
  assert.match(html, /isAdmin/);
});

test('홈페이지에 글을 쓰는 경로가 없다', () => {
  assert.ok(!/dispBoardWrite[^"']*method|procBoard|act=proc/.test(html),
    '홈페이지에 저장을 보내는 코드가 있으면 안 된다');
  assert.ok(!/document\.forms\[[^\]]*\]\.submit\(\)/.test(html));
});

test('바깥으로 나가는 길은 홈페이지를 «읽는» 것 하나뿐이다', () => {
  /* 이 화면은 홈페이지를 직접 바꾸지 않는다. 나가는 요청이 늘어나면 그 약속이 깨진다. */
  const calls = html.match(/\bfetch\s*\(/g) || [];
  assert.equal(calls.length, 1, '바깥으로 나가는 요청이 하나가 아닙니다');
  assert.match(html, /READ_HOMEPAGE_URL/);
});

test('저장할 때 이전 내용을 남긴다', () => {
  assert.match(html, /homepage\/history/);
});

test('줄 모양은 바꿀 수 있게 되어 있다', () => {
  assert.match(html, /lineFormat/);
});

test('대조를 반영하기 전에 믿을 만한지 먼저 묻는다', () => {
  assert.match(html, /PuHomeDiff\.isTrustworthy/,
    '읽어낸 결과를 그대로 반영하면 구조가 바뀐 날 전부 「안 올라감」이 된다');
});

/* ── 위는 계획서에 적힌 것. 아래는 이 저장소가 이미 데인 자리를 지킨다. ── */

test('앱 스크립트가 문법에 맞는다', () => {
  /* node --check 는 HTML 에 못 쓴다. 대신 <script> 안쪽만 뽑아 파싱해 본다.
     오탈자 하나로 화면 전체가 안 뜨는 것을 배포 전에 잡는다. */
  const blocks = [...html.matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g)]
    .map(m => m[1]).filter(s => s.trim());
  assert.ok(blocks.length > 0, '앱 스크립트를 찾지 못했습니다');
  blocks.forEach((code, i) => {
    // eslint-disable-next-line no-new-func
    assert.doesNotThrow(() => new Function(code), '스크립트 ' + (i + 1) + '번째 덩어리가 파싱되지 않습니다');
  });
});

test('앱바를 불러온다 — 오갈 수 없는 섬이 되지 않는다', () => {
  assert.match(html, /js\/pu-appbar\.js/);
});

test('로그인은 포털 한 곳에서 한다', () => {
  assert.match(html, /enter\.html/);
});

test('같은 파이어베이스 프로젝트를 본다', () => {
  /* 따옴표 습관이 아니라 «어느 프로젝트를 보는가»를 지킨다 */
  assert.match(html, /projectId\s*:\s*['"]pureun-erp['"]/);
  assert.match(html, /pureun-erp-default-rtdb\.asia-southeast1/);
});

test('바깥에서 온 글자를 화면에 넣기 전에 이스케이프한다', () => {
  assert.match(html, /function esc\s*\(/);
});

test('★ 겹친 글 번호를 사람에게 알린다', () => {
  assert.match(html, /PuHomeDiff\.duplicateLiveKeys/,
    '홈페이지에 같은 글 번호가 두 번 있으면 사람이 홈페이지를 손봐야 한다');
});

test('★ 딱지의 사유를 감추지 않는다', () => {
  // 동명이인 보류 사유가 reason 에 담겨 온다. 딱지만 보이면 왜 그런지 알 수 없다.
  assert.match(html, /\breason\b/);
});

test('★ 퇴사자 이름이 다른 쪽에 남았는지 훑는다', () => {
  assert.match(html, /PuHomeDiff\.nameLeftovers/);
});

/* ══════ Critical 1 — 새 구성원이 글 번호를 적으면 짝지어진다 ══════ */

test('★ 새 구성원이 글 번호를 적으면 대조가 짝짓고, 딱지는 «우리 열쇠»에 붙는다', async () => {
  const ctx = box();
  const saved = [];
  ctx.App = {
    members: {
      'new-1755300000000': { name: '신입 노무사', srl: '999', position1: '', position2: '공인노무사', careers: ['現 가'] },
      '190': { name: '권형하', srl: '190', position1: '대표', position2: '공인노무사', careers: ['現 나'] }
    },
    pages: {}, staff: [], check: null, saveErr: ''
  };
  ctx.db = { ref: () => ({ set: v => { saved.push(v); return Promise.resolve(); } }) };
  run(ctx, constSource('PAGE_IDS') + '\n' + fnSource('todayString') + '\n' + fnSource('applyStatus'));

  const live = [
    { srl: '999', name: '신입 노무사', position1: '', position2: '공인노무사', careers: ['現 가'] },
    { srl: '190', name: '권형하', position1: '대표', position2: '공인노무사', careers: ['現 나'] }
  ];
  await ctx.applyStatus(live, {}, []);
  const members = plain(ctx.App.check.members);

  assert.ok(members['new-1755300000000'], '딱지가 RTDB 열쇠에 안 붙었습니다 — 편집·저장이 이 열쇠로 이뤄진다');
  assert.equal(members['new-1755300000000'].status, 'same');
  assert.ok(!members['999'], '같은 사람이 글 번호 열쇠로 한 줄 더 떴습니다');
  assert.equal(Object.keys(members).length, 2, '구성원 두 명인데 줄이 두 개가 아닙니다');
});

test('★ 글 번호가 아직 없는 새 구성원은 「새로 올릴 것」으로 남는다', async () => {
  const ctx = box();
  ctx.App = {
    members: { 'new-1755300000000': { name: '신입 노무사', srl: '', position1: '', position2: '', careers: [] } },
    pages: {}, staff: [], check: null, saveErr: ''
  };
  ctx.db = { ref: () => ({ set: () => Promise.resolve() }) };
  run(ctx, constSource('PAGE_IDS') + '\n' + fnSource('todayString') + '\n' + fnSource('applyStatus'));
  await ctx.applyStatus([{ srl: '190', name: '권형하', careers: [] }], {}, []);
  const members = plain(ctx.App.check.members);
  assert.equal(members['new-1755300000000'].status, 'toAdd');
  assert.equal(members['190'].status, 'liveOnly');
});

test('★ 자료에 key 칸이 섞여 들어와도 우리 열쇠를 못 덮는다', async () => {
  /* 열쇠가 덮이면 딱지가 엉뚱한 줄에 붙고, 편집·저장이 다른 사람 자료를 건드린다 */
  const ctx = box();
  ctx.App = {
    members: { '190': { key: '멋대로', name: '권형하', srl: '190', careers: [] } },
    pages: {}, staff: [], check: null, saveErr: ''
  };
  ctx.db = { ref: () => ({ set: () => Promise.resolve() }) };
  run(ctx, constSource('PAGE_IDS') + '\n' + fnSource('todayString') + '\n' + fnSource('applyStatus'));
  await ctx.applyStatus([{ srl: '190', name: '권형하', careers: [] }], {}, []);
  assert.ok(plain(ctx.App.check.members)['190'], '우리 열쇠가 자료의 key 칸에 덮였습니다');
});

/* ══════ Important 2 — 확인이 조용히 아무 일도 안 하는 길이 없다 ══════ */

test('★ 로그인 토큰을 못 얻으면 «메시지를 띄운다» — 단추만 돌아오지 않는다', async () => {
  const ctx = box();
  ctx.App = { checking: false, checkMsg: '', checkBad: false, render() {} };
  ctx.firebase = { auth: () => ({ currentUser: { getIdToken() { throw new Error('토큰 실패'); } } }) };
  ctx.toast = () => {};
  run(ctx, fnSource('checkFailText') + '\n' + fnSource('showCheckFailed') + '\n' + fnSource('checkHomepage'));
  await ctx.checkHomepage();
  assert.ok(ctx.App.checkMsg, '아무 메시지도 안 떴습니다 — 사장님은 눌렀는데 안 눌린 줄 압니다');
  assert.equal(ctx.App.checkBad, true);
  assert.equal(ctx.App.checking, false, '단추가 「확인 중…」에 묶여 버립니다');
});

test('★ 로그인 쪽 문제는 무엇을 하면 되는지까지 한국어로 적는다', () => {
  const ctx = box();
  run(ctx, fnSource('checkFailText'));
  const msg = ctx.checkFailText({ code: 'auth/network-request-failed' });
  assert.match(msg, /로그인/);
  assert.ok(/[가-힣]/.test(msg), '한국어 설명이 없습니다');
});

/* ══════ Important 3 — 명부 폴백이 퇴사 딱지를 조용히 죽이지 않는다 ══════ */

test('★ 공개 명부로 폴백하면 그 사실을 «화면에» 알린다', () => {
  const ctx = box();
  run(ctx, fnSource('staffFromRoster'));
  const r = plain(ctx.staffFromRoster([{ name: '권형하', status: 'active' }], 'dir'));
  assert.ok(r.warn, '폴백을 탔는데 경고 한 줄이 없습니다');
  assert.match(r.warn, /퇴사일/, '무엇을 못 보는지 안 적혀 있습니다');
});

test('민감 명부를 제대로 읽었으면 쓸데없는 경고를 띄우지 않는다', () => {
  const ctx = box();
  run(ctx, fnSource('staffFromRoster'));
  const r = plain(ctx.staffFromRoster([{ name: '권형하', retireDate: '' }], 'accounts'));
  assert.equal(r.warn, '');
  assert.equal(r.staff[0].name, '권형하');
});

test('★ 공개 명부의 「퇴사」 표시만으로도 「내릴 것」 딱지가 붙는다', () => {
  /* 폴백에서 퇴사일이 전부 빈 값이 되어 딱지가 영영 안 붙던 자리 */
  const ctx = box();
  run(ctx, fnSource('staffFromRoster'));
  const r = ctx.staffFromRoster([{ name: '나간사람', status: 'retired' }], 'dir');
  const ours = [{ key: '190', name: '나간사람', srl: '190', careers: [] }];
  const live = [{ srl: '190', name: '나간사람', careers: [] }];
  const st = plain(ctx.PuHomeDiff.memberStatus(ours, live, r.staff, '2026-08-16'));
  assert.equal(st[0].status, 'toRemove', '퇴사자가 홈페이지에 그대로 남습니다');
});

test('명부에 퇴사일이 있으면 날짜를 그대로 쓴다', () => {
  const ctx = box();
  run(ctx, fnSource('staffFromRoster'));
  const r = plain(ctx.staffFromRoster([{ name: '나간사람', retireDate: '2026-07-31', status: 'retired' }], 'accounts'));
  assert.equal(r.staff[0].leftAt, '2026-07-31');
});

/* ══════ Important 5 — 「읽기 거부」와 「그런 사람 없음」을 다르게 말한다 ══════ */

test('★ 못 읽은 것과 없는 것을 같은 말로 하지 않는다', () => {
  const ctx = box();
  run(ctx, fnSource('uidFailText'));
  const 없음 = ctx.uidFailText('신입 노무사', { why: 'noName' });
  const 못읽음 = ctx.uidFailText('신입 노무사', { why: 'rosterFail' });
  assert.notEqual(없음, 못읽음, '못 읽은 것과 없는 것이 같은 문장입니다');
  assert.match(못읽음, /읽지 못했습니다/);
  assert.match(못읽음, /없다는 뜻이 아닙니다/, '없는 것으로 오해할 문장입니다');
});

test('동명이인·계정 없음도 각각 다르게 말한다', () => {
  const ctx = box();
  run(ctx, fnSource('uidFailText'));
  const texts = ['noName', 'dupName', 'noAccount', 'rosterFail', 'rolesFail']
    .map(why => ctx.uidFailText('홍길동', { why: why }));
  assert.equal(new Set(texts).size, texts.length, '사유가 다른데 같은 문장을 씁니다');
});

/* ══════ Important 4 — 본인 경력을 못 읽었는데 「없다」고 하지 않는다 ══════ */

test('★ 이 브라우저에 내 경력이 없으면 클라우드 사본을 한 번 더 본다', async () => {
  const ctx = box();
  let asked = 0;
  ctx.App = { draft: { kind: 'member', name: '권형하', careers: [] }, me: { uid: 'U1' } };
  ctx.Pull = { open: false, kind: '', items: {}, sel: {}, err: '', name: '' };
  ctx.openModal = () => {};
  ctx.renderPull = () => {};
  ctx.uidOfName = () => Promise.resolve({ uid: 'U1', why: 'ok' });
  ctx.kcareerFromLocal = () => ({ wiccok: [], license: [], edu: [], complete: [], lecture: [] });
  ctx.kcareerFromDb = () => { asked++; return Promise.resolve({ wiccok: [{ org: '가' }], license: [], edu: [], complete: [], lecture: [] }); };
  run(ctx, constSource('CAREER_KINDS') + '\n' + fnSource('careerCount') + '\n'
    + fnSource('uidFailText') + '\n' + fnSource('openPull'));
  ctx.openPull();
  await tick(); await tick();
  assert.equal(asked, 1, '로컬이 비었는데 클라우드를 안 봤습니다 — 「없다」고 거짓말하게 됩니다');
  assert.equal(plain(ctx.Pull.items).wiccok.length, 1, '클라우드에서 읽은 것이 안 들어왔습니다');
  assert.equal(ctx.Pull.err, '', '자료를 읽었는데 경고를 띄웠습니다');
});

test('이 브라우저에 내 경력이 있으면 클라우드를 괜히 부르지 않는다', async () => {
  const ctx = box();
  let asked = 0;
  ctx.App = { draft: { kind: 'member', name: '권형하', careers: [] }, me: { uid: 'U1' } };
  ctx.Pull = { open: false, kind: '', items: {}, sel: {}, err: '', name: '' };
  ctx.openModal = () => {};
  ctx.renderPull = () => {};
  ctx.uidOfName = () => Promise.resolve({ uid: 'U1', why: 'ok' });
  ctx.kcareerFromLocal = () => ({ wiccok: [{ org: '로컬' }], license: [], edu: [], complete: [], lecture: [] });
  ctx.kcareerFromDb = () => { asked++; return Promise.resolve({}); };
  run(ctx, constSource('CAREER_KINDS') + '\n' + fnSource('careerCount') + '\n'
    + fnSource('uidFailText') + '\n' + fnSource('openPull'));
  ctx.openPull();
  await tick(); await tick();
  assert.equal(asked, 0);
  assert.equal(plain(ctx.Pull.items).wiccok.length, 1);
});

test('★ 로컬도 클라우드도 «못 읽었으면» 「없다」고 하지 않는다', async () => {
  const ctx = box();
  ctx.App = { draft: { kind: 'member', name: '권형하', careers: [] }, me: { uid: 'U1' } };
  ctx.Pull = { open: false, kind: '', items: {}, sel: {}, err: '', name: '' };
  ctx.openModal = () => {};
  ctx.renderPull = () => {};
  ctx.uidOfName = () => Promise.resolve({ uid: 'U1', why: 'ok' });
  ctx.kcareerFromLocal = () => ({ wiccok: [], license: [], edu: [], complete: [], lecture: [] });
  ctx.kcareerFromDb = () => Promise.reject({ code: 'PERMISSION_DENIED' });
  run(ctx, constSource('CAREER_KINDS') + '\n' + fnSource('careerCount') + '\n'
    + fnSource('uidFailText') + '\n' + fnSource('openPull'));
  ctx.openPull();
  await tick(); await tick();
  assert.match(ctx.Pull.err, /읽지 못했습니다/);
  assert.match(ctx.Pull.err, /없다는 뜻이 아닙니다/);
});

test('남의 것을 못 읽는 것은 정직하게 그대로 알린다', async () => {
  const ctx = box();
  ctx.App = { draft: { kind: 'member', name: '남', careers: [] }, me: { uid: 'U1' } };
  ctx.Pull = { open: false, kind: '', items: {}, sel: {}, err: '', name: '' };
  ctx.openModal = () => {};
  ctx.renderPull = () => {};
  ctx.uidOfName = () => Promise.resolve({ uid: 'U2', why: 'ok' });
  ctx.kcareerFromLocal = () => ({});
  ctx.kcareerFromDb = () => Promise.reject({ code: 'PERMISSION_DENIED' });
  run(ctx, constSource('CAREER_KINDS') + '\n' + fnSource('careerCount') + '\n'
    + fnSource('uidFailText') + '\n' + fnSource('openPull'));
  ctx.openPull();
  await tick(); await tick();
  assert.match(ctx.Pull.err, /본인/, '본인이 직접 뽑아야 한다는 안내가 사라졌습니다');
});

/* ══════ Important 6 — homepage/* 읽기 실패를 화면에 띄운다 ══════ */

test('★ 자료를 못 읽으면 「보안규칙이 아직 없을 수 있습니다」까지 적어 준다', () => {
  const ctx = box();
  run(ctx, fnSource('dataErrText'));
  const msg = ctx.dataErrText(['구성원', '쪽 본문']);
  assert.match(msg, /보안규칙/, '규칙이 없어서인지 자료가 없어서인지 구분할 방법이 없습니다');
  assert.match(msg, /구성원/);
  assert.match(msg, /쪽 본문/);
});

test('다 읽었으면 겁주는 띠를 띄우지 않는다', () => {
  const ctx = box();
  run(ctx, fnSource('dataErrText'));
  assert.equal(ctx.dataErrText([]), '');
  assert.equal(ctx.dataErrText(null), '');
});

test('읽기 실패 띠·명부 경고·저장 실패 띠가 화면에 실제로 그려진다', () => {
  const banners = fnSource('bannersHtml');
  ['App.dataErr', 'App.staffErr', 'App.saveErr'].forEach(f => {
    assert.ok(banners.indexOf(f) >= 0, f + ' 를 화면에 안 그리면 담아둬도 아무도 못 본다');
  });
});

/* ══════ Important 7 — 「감싸기」 경고는 부품이 판단한다 ══════ */

test('★ 감싸기와 겹치는 <div> 를 더 세게 경고한다 (부품을 돌려서 확인)', () => {
  const ctx = box();
  run(ctx, fnSource('riskReport'));
  const 감싸기 = plain(ctx.riskReport(['<div>現 가', '성과 <S> 등급'], 'div'));
  assert.deepEqual(감싸기.broken, ['<div>現 가']);
  assert.deepEqual(감싸기.soft, ['성과 <S> 등급']);
  const 줄바꿈만 = plain(ctx.riskReport(['<div>現 가', '성과 <S> 등급'], 'plain'));
  assert.deepEqual(줄바꿈만.broken, []);
  assert.equal(줄바꿈만.soft.length, 2);
});

test('★ 화면이 같은 판단을 다시 만들지 않는다', () => {
  /* 두 곳에 두면 서로 다른 답을 낸다. 화면은 부품에 넘기기만 해야 한다. */
  assert.match(html, /PuHomeExport\.riskReport/);
  const mine = fnSource('riskReport');
  assert.ok(mine.indexOf('PuHomeExport.riskReport') >= 0,
    '화면의 riskReport 가 부품에 안 넘기고 있습니다');
  assert.ok(mine.indexOf('div') < 0 && mine.indexOf('filter') < 0,
    '화면이 <div> 를 스스로 가려내고 있습니다 — 두 곳에 두면 서로 다른 답을 낸다');
});

/* ══════ Minor 8 — 딱지 강등 저장 실패를 삼키지 않는다 ══════ */

test('★ 딱지 강등 저장이 실패하면 화면에 남긴다', async () => {
  const ctx = box();
  let drew = 0;
  ctx.App = {
    saveErr: '',
    check: { members: { '190': { name: '권형하', status: 'same', reason: '' } }, pages: {} },
    render() { drew++; }
  };
  ctx.db = { ref: () => ({ set: () => Promise.reject({ code: 'PERMISSION_DENIED' }) }) };
  run(ctx, fnSource('markChanged'));
  ctx.markChanged('member', '190');
  await tick();
  assert.ok(ctx.App.saveErr, '저장이 안 됐는데 아무도 모릅니다');
  assert.ok(drew > 0, '띠를 담아만 두고 다시 그리지 않았습니다');
});

test('딱지 강등 저장이 되면 겁주는 띠를 띄우지 않는다', async () => {
  const ctx = box();
  ctx.App = {
    saveErr: '',
    check: { members: { '190': { name: '권형하', status: 'same', reason: '' } }, pages: {} },
    render() {}
  };
  ctx.db = { ref: () => ({ set: () => Promise.resolve() }) };
  run(ctx, fnSource('markChanged'));
  ctx.markChanged('member', '190');
  await tick();
  assert.equal(ctx.App.saveErr, '');
  assert.equal(ctx.App.check.members['190'].status, 'pending');
});

/* ══════ Minor 9 — 이력 열쇠가 겹치지 않는다 ══════ */

test('★ 같은 밀리초에 여러 번 저장해도 이력 열쇠가 겹치지 않는다', () => {
  const ctx = box();
  run(ctx, fnSource('histStamp'));
  run(ctx, 'Date.now = function () { return 1755300000000; };');   // 시계를 한 밀리초에 묶어 둔다
  run(ctx, 'globalThis.__keys = []; for (var i = 0; i < 500; i++) __keys.push(histStamp());');
  const keys = plain(ctx.__keys);
  assert.ok(keys.every(k => String(k).indexOf('1755300000000') === 0),
    '시계를 못 묶었습니다 — 이 검사가 겹침을 안 보고 있습니다');
  assert.equal(new Set(keys).size, keys.length, '같은 밀리초에 이력이 덮어써집니다');
});

test('이력 열쇠는 시각으로 정렬된다 — 옛 숫자 열쇠도 함께 읽는다', () => {
  const ctx = box();
  run(ctx, fnSource('histStamp') + '\n' + fnSource('histTs'));
  assert.equal(ctx.histTs('1755300000000'), 1755300000000, '옛 이력(숫자만)을 못 읽습니다');
  assert.equal(ctx.histTs('1755300000000-ab12cd'), 1755300000000);
  const keys = ['1755300000000-a', '1755300009999', '1755299999999-z'];
  const sorted = keys.slice().sort((a, b) => (ctx.histTs(b) - ctx.histTs(a)) || String(b).localeCompare(String(a)));
  assert.equal(sorted[0], '1755300009999', '최신이 맨 위로 안 옵니다');
  assert.equal(sorted[2], '1755299999999-z');
});

test('되돌리기 목록이 Number() 로 열쇠를 견주지 않는다', () => {
  /* 열쇠에 글자가 섞이면 Number() 는 NaN 이 되어 최신 순서가 조용히 뒤섞인다 */
  const hist = fnSource('openHistory');
  assert.ok(hist.indexOf('Number(b) - Number(a)') < 0, '열쇠를 Number() 로 견주고 있습니다');
  assert.ok(hist.indexOf('histTs') >= 0);
});

test('포털 타일과 즐겨찾기 목록에 등록돼 있다', () => {
  const enter = fs.readFileSync(path.join(R, 'enter.html'), 'utf8');
  const appbar = fs.readFileSync(path.join(R, 'js', 'pu-appbar.js'), 'utf8');
  assert.match(enter, /pu-home\.html/);
  assert.match(appbar, /pu-home\.html/);
});
