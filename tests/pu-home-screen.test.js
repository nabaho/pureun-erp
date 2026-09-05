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

/* 여러 줄짜리 객체 const (예: STATUS_TEXT) 를 그대로 떼어 온다 */
function constObj(name) {
  const re = new RegExp('\\nconst ' + name + ' = \\{[\\s\\S]*?\\n\\};');
  const m = re.exec(html);
  assert.ok(m, 'const ' + name + ' 을 찾지 못했습니다');
  return m[0];
}

/* 한 줄짜리 const (예: KCAREER_NS) 를 그대로 떼어 온다 */
function constLine(name) {
  const re = new RegExp('\\nconst ' + name + ' = [^\\n]*;');
  const m = re.exec(html);
  assert.ok(m, 'const ' + name + ' 을 찾지 못했습니다');
  return m[0];
}

/* 부품(js/pu-home-*.js)은 진짜를 싣는다 — 화면이 부품에 맡긴 판단까지 함께 확인한다 */
function box(extra) {
  const ctx = Object.assign({ window: undefined, console: { warn() {}, log() {} } }, extra || {});
  vm.createContext(ctx);
  ['pu-home-parse.js', 'pu-home-career.js', 'pu-home-export.js', 'pu-home-diff.js',
     'pu-home-fill.js']
    .forEach(f => vm.runInContext(fs.readFileSync(path.join(R, 'js', f), 'utf8'), ctx));
  /* 편집칸도 붙여넣기 안내도 이 둘을 부른다 — 상자에 늘 실어 둔다 */
  vm.runInContext(fnSource('fillGapFields') + '\n' + fnSource('fillGapNote'), ctx);
  return ctx;
}
function run(ctx, code) { vm.runInContext(code, ctx); return ctx; }

/* 목록·안내 띠·대시보드 카드가 «같은 판단»을 함께 쓴다 (4차 지시로 갈래를 한 규격으로
   세웠다 — 카드의 빨간 점과 「손댈 것」 딱지가 서로 다른 답을 내면 안 되니까).
   그래서 검사도 그 묶음을 통째로 싣는다. 이름을 검사마다 못 박는 대신 여기 한 곳에만
   적어 둔다 — 함수 하나 이름이 바뀔 때 검사 열넷이 같이 깨지지 않게. */
/* 상자 안에서는 const 를 var 로 눕힌다.
   ★ 검사가 자료 덩어리를 여러 갈래로 떼어 오다 보면 같은 이름이 두 번 실릴 수 있다
     (constSource 가 한 줄짜리 배열에서 다음 「];」까지 함께 떠 오기 때문이다).
     const 는 두 번 선언되면 상자가 통째로 안 돈다 — var 면 덮어써져 그냥 돈다.
     화면 코드를 고치는 것이 아니라 «검사 상자에서만» 눕힌다. */
function noConst(src) { return String(src).replace(/(^|\n)const /g, '$1var '); }

/* ⚠ 2026-09-02 부터 구성원에 «갈래»(노무사·직원)가 생겼다. 목록·편집칸·초안·저장이
   모두 memberKind 를 지나므로, 그 넷을 싣는 자리에는 갈래 재료도 함께 실어야 한다 —
   안 실으면 「memberKind is not defined」로 그 자리에서 죽는다. */
function rowDeps() {
  return [
    constLine('DONE_STATUS'), constObj('STATUS_TEXT'), constSource('GROUPS'),
    constLine('OWN_LABEL'), constLine('OWN_CLS'), constLine('GROUP_UNIT'),
    fnSource('todayString'), fnSource('keptOf'), fnSource('rosterMarkOf'),
    /* 구성원 갈래(노무사·직원) — 2026-09-02 에 줄과 딱지가 «둘 다» 이것을 지나게 됐다.
       안 실으면 목록을 그리다 그 자리에서 죽는다(memberKind is not defined). */
    constLine('MEMBER_KINDS'), fnSource('memberKind'),
    /* 「홈페이지에 안 올림」 — 줄과 할 일 판정이 둘 다 이것을 지난다 (2026-09-03).
       ⚠★ 이 상자에 «새 함수를 안 실어» 화면 검사가 통째로 죽은 것이 이번이 세 번째다
         (memberKind · pillShort · offSiteOf). 목록·딱지·할 일이 부르는 함수를 새로 만들면
         여기에도 반드시 한 줄 더할 것 — 안 하면 스무 개가 한꺼번에 붉어져서
         무엇이 고장인지 못 찾는다. */
    fnSource('offSiteOf'),
    fnSource('memberRows'), fnSource('pageIdsOf'), fnSource('pageRows'), fnSource('rowsOf'),
    fnSource('needsAttentionRow'), fnSource('statOf'),
    fnSource('statusChip'), fnSource('cardCount'), fnSource('dashHtml'),
    /* 딱지 이름을 짧게 만드는 것 — 딱지 줄과 줄 딱지가 «둘 다» 이것을 지난다
       (2026-09-02 대표 지적 「2줄을 1줄로」). 안 실으면 딱지를 그리다 그 자리에서 죽는다. */
    fnSource('pillShort'), fnSource('joinOnce'),
    /* 할 일 목록 — 안내 띠가 «한 줄짜리 할 일»로 바뀌었다(5차 지시) */
    fnSource('rowsWith'), fnSource('someNames'), fnSource('seeBtns'), fnSource('jobCard'),
    fnSource('noteOneLine'), fnSource('readPageBtn'),
    fnSource('visibleRows'), fnSource('chipsHtml'),
    /* 자문사현황 — 목록은 푸른ERP 업체관리에서 읽고, 올렸는지는 사람이 표시한다 */
    constLine('POSTED_TEXT'), constLine('PARTNER_PATH'),
    fnSource('companiesFrom'), fnSource('partnerMark'), fnSource('postedOf'),
    fnSource('partnerRows'), fnSource('postedNames'), fnSource('postedPillHtml'),
    /* ⚠ 목록 머리가 종류 거르개를 그리느라 pickTypes 를 부른다 (2026-09-06).
       ⚠⚠ 이 모래통은 «새 함수를 안 넣어» 네 번 깨졌다 — memberKind·pillShort·offSiteOf,
         그리고 이번 pickTypes. 화면 함수를 새로 만들면 여기부터 볼 것.
         (keepBox() 에도 같은 목록이 있다 — «둘 다» 넣어야 한다.) */
    fnSource('pickRows'), fnSource('pickTypes'),
    /* 거르개가 «종류(자문·급여)»에서 «자문료»로 바뀌었다 (2026-09-06) —
       업체관리 딱지가 실제 거래를 안 따라가서다(자문료 182 / 「자문」 딱지 84). */
    constLine('FEE_FILTERS'), fnSource('feeMatch'), fnSource('feeCounts'),
    fnSource('defaultFilterOf'), fnSource('listCountHtml'), fnSource('rowsHtml')
  ].map(noConst).join('\n') + '\n';
}

/* 목록에 그려진 «줄 번호»만 읽는다.
   ★ 아무 숫자나 긁으면 안 된다 — 걸러 보기 딱지에도 건수가 붙어 있어(「손댈 것 3」)
     그것까지 번호로 세면 검사가 엉뚱한 것을 지키게 된다. */
function rowNumbers(html) {
  return [...String(html).matchAll(/class="num"[^>]*>\s*(\d+)\s*</g)].map(m => Number(m[1]));
}
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

test('★ 바깥으로 나가는 길은 «이름 붙은 우리 주소»뿐이다 — 주소를 코드에 박아 나가지 않는다', () => {
  /* 지켜야 할 약속은 «어디로 보내는가»이지 «몇 번 보내는가»가 아니다 —
     개수를 못 박으면 정당한 요청 하나가 늘 때 깨진다(이 저장소에서 검사 하나가
     모든 앱 배포를 막은 적이 있다). 대상만 못 박는다.
     2026-08-31: 홈페이지를 새로 만들기로 하면서 «올리기»와 «새 쪽 읽기»가 늘었다.
     늘어난 것도 모두 «이름 붙은 상수»여야 한다 — 주소를 그 자리에 박으면 걸린다. */
  const 허용 = ['READ_HOMEPAGE_URL', 'PUBLISH_URL', 'SITE_BASE'];
  const targets = [...html.matchAll(/\bfetch\s*\(\s*([A-Za-z_$][\w$]*|['"`][^'"`]*['"`])/g)].map(m => m[1]);
  assert.ok(targets.length > 0, 'fetch 를 하나도 찾지 못했습니다 — 홈페이지로 가는 길이 사라졌습니다');
  targets.forEach(t => assert.ok(허용.indexOf(t) >= 0,
    '★ 이름 없는 주소로 나가는 요청이 있습니다: ' + t));

  /* 그 이름들이 «우리 것»을 가리키는지까지 본다 — 이름만 붙이고 남의 서버면 소용없다 */
  허용.forEach(이름 => {
    const m = new RegExp('const ' + 이름 + " = '([^']+)'").exec(html);
    if (!m) return;                       // 아직 안 쓰는 이름은 넘어간다
    /* ★ raw 는 «우리 계정(nabaho)» 것만 — 남의 저장소 원본을 읽어 홈페이지를 그리면 안 된다 */
    assert.match(m[1], /^https:\/\/(us-central1-pureun-erp\.cloudfunctions\.net|nabaho\.github\.io|raw\.githubusercontent\.com\/nabaho)\//,
      '★ ' + 이름 + ' 이 우리 것이 아닌 곳을 가리킵니다: ' + m[1]);
  });
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
    + fnSource('uidFailText') + '\n' + fnSource('itemWhen') + '\n' + fnSource('날짜숫자') + '\n' + fnSource('기간숫자') + '\n' + fnSource('경력차례') + '\n' + fnSource('openPull'));
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
    + fnSource('uidFailText') + '\n' + fnSource('itemWhen') + '\n' + fnSource('날짜숫자') + '\n' + fnSource('기간숫자') + '\n' + fnSource('경력차례') + '\n' + fnSource('openPull'));
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
    + fnSource('uidFailText') + '\n' + fnSource('itemWhen') + '\n' + fnSource('날짜숫자') + '\n' + fnSource('기간숫자') + '\n' + fnSource('경력차례') + '\n' + fnSource('openPull'));
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
    + fnSource('uidFailText') + '\n' + fnSource('itemWhen') + '\n' + fnSource('날짜숫자') + '\n' + fnSource('기간숫자') + '\n' + fnSource('경력차례') + '\n' + fnSource('openPull'));
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
  const banners = fnSource('jobsOf') + '\n' + fnSource('bannersHtml');
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

/* ══════ 최종 검토 1 — 쪽은 «대조 전용». 붙여넣을 내용을 내주지 않는다 ══════
   parsePageText 는 태그를 걷고 공백을 뭉친 «대조용» 글자다. 그것을 「붙여넣을 본문」으로
   내주고 Ctrl+A → Ctrl+V 를 시키면 지도 위젯·지사 탭·구획·스크립트가 통째로 사라진다.
   게다가 파괴한 쪽을 다시 읽으면 같은 글자가 나와 「같음」이 뜬다 — 조용히 틀린다. */

/* 화면의 esc 는 정규식 리터럴이 들어 있어 함수 잘라내기로는 못 떼어 온다.
   이스케이프 자체는 위의 「바깥에서 온 글자를 …」 검사가 지킨다. 여기서는 대역을 쓴다. */
function escStub() {
  return s => String(s == null ? '' : s).replace(/[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function pageBox() {
  const ctx = box();
  ctx.esc = escStub();
  ctx.PAGE_LABEL = { inquiry: '오시는길', work1: '자문서비스' };
  ctx.copied = [];
  ctx.shown = [];
  ctx.copyText = t => { ctx.copied.push(t); };
  ctx.openModal = h => { ctx.shown.push(h); };
  ctx.toast = () => {};
  return ctx;
}

test('★ 쪽 본문을 «통째로» 복사해 주지 않는다 — 고친 줄이 있을 때도 그렇다', () => {
  const 본문 = "오시는길 본문 한 줄로 뭉친 글자";
  const 차리기 = fix => {
    const ctx = pageBox();
    ctx.App = { draft: { kind: 'page', key: 'inquiry', text: 본문 },
                lineFormat: 'plain', pages: {}, dirty: false, pageFix: fix ? { inquiry: fix } : {},
                pageRuns: {}, pageLines: {} };
    run(ctx, fnSource('pagePasteWhy') + '\n' + fnSource('modalFoot') + '\n' + fnSource('riskReport') + '\n'
      + fnSource('pageFixOf') + '\n' + fnSource('runSep') + '\n' + fnSource('runKey') + '\n' + fnSource('runOfKey') + '\n' + fnSource('pageFixList') + '\n' + fnSource('copyPageFix') + '\n'
      + fnSource('openPaste'));
    ctx.openPaste();
    return ctx;
  };
  /* 고친 줄이 없으면 복사할 것이 없다 — 빈 쪽지를 내주지 않는다 */
  assert.equal(차리기(null).copied.length, 0, '고친 줄도 없는데 무언가를 복사해 줬습니다');
  /* 고친 줄이 있으면 «그 줄만» 담은 쪽지가 나간다. 본문은 절대 안 나간다 */
  const ctx1 = 차리기({ '첫 줄': '고친 첫 줄' });
  const 쪽지 = ctx1.copied;
  assert.equal(쪽지.length, 1, '고친 줄이 있는데 복사해 주지 않았습니다');
  assert.ok(쪽지[0].indexOf(본문) < 0,
    '★ 뭉친 본문을 복사해 줬습니다 — 이대로 붙여넣으면 지도·표·구획이 사라집니다');
  const 푼것 = ctx1.PuHomeFill.unpackPageEdits(쪽지[0]);
  assert.equal(푼것.ok, true, '복사된 것이 «쪽 채우기» 쪽지가 아닙니다');
  assert.equal(푼것.edits.length, 1, '고친 줄만 담겨야 합니다');
  assert.equal(푼것.edits[0].before, '첫 줄', '원래 글자가 안 담겼습니다 — 자리를 못 찾습니다');
});

test('★ 쪽 화면에 「붙여넣을 내용 복사」 단추가 없다', () => {
  const src = fnSource('pageEdit');
  assert.ok(src.indexOf('openPaste') < 0, '쪽에 붙여넣기 단추가 남아 있습니다');
});

test('★ 쪽 화면이 «왜 통째로는 안 되는지»와 «그럼 어떻게 하는지»를 한국어로 적는다', () => {
  const ctx = pageBox();
  ctx.App = { draft: { kind: 'page', key: 'inquiry', text: '가나다' }, pages: {}, dirty: false };
  run(ctx, fnSource('pagePasteWhy') + '\n' + fnSource('stamp') + '\n' + fnSource('canDetachPage') + '\n'
    + fnSource('noteOneLine') + '\n' + fnSource('readPageBtn') + '\n' + fnSource('pageFrameDoc') + '\n' + fnSource('runSep') + '\n' + fnSource('runKey') + '\n' + fnSource('runOfKey') + '\n' + fnSource('pageLinesHtml') + '\n' + fnSource('pageEdit'));
  const h = ctx.pageEdit(ctx.App.draft);
  assert.match(h, /지도|표|구획/, '통째로 넣으면 무엇이 사라지는지 안 적혀 있습니다');
  assert.match(h, /줄/, '그럼 어떻게 고치라는 건지 안 적혀 있습니다');
  /* ★ 「안 됩니다」만 말하고 길을 안 알려 주면 사람은 결국 통째로 붙여넣는다 */
  assert.match(h, /채우기용 복사|줄을 하나씩|줄마다/,
    '★ 대신 어떻게 하는지가 없습니다 — 길을 안 알려 주면 통째로 붙여넣게 됩니다');
});

test('★ 쪽 화면에서 홈페이지 관리자 화면으로 갈 길을 준다', () => {
  const ctx = pageBox();
  ctx.App = { draft: { kind: 'page', key: 'inquiry', text: '가나다' }, pages: {}, dirty: false };
  run(ctx, fnSource('pagePasteWhy') + '\n' + fnSource('stamp') + '\n' + fnSource('canDetachPage') + '\n'
    + fnSource('noteOneLine') + '\n' + fnSource('readPageBtn') + '\n' + fnSource('pageFrameDoc') + '\n' + fnSource('runSep') + '\n' + fnSource('runKey') + '\n' + fnSource('runOfKey') + '\n' + fnSource('pageLinesHtml') + '\n' + fnSource('pageEdit'));
  const h = ctx.pageEdit(ctx.App.draft);
  assert.ok(h.indexOf(ctx.PuHomeExport.editUrl('page', 'inquiry')) >= 0,
    '홈페이지에서 이 쪽을 열 길이 없습니다');
});

test('구성원은 지금처럼 붙여넣을 내용을 만들어 준다 (쪽만 막은 것이 맞는지)', () => {
  const ctx = pageBox();
  ctx.App = {
    draft: { kind: 'member', key: '190', srl: '190', name: '권형하', careers: ['現 가', '現 나'] },
    members: { '190': { name: '권형하', srl: '190' } },
    lineFormat: 'plain'
  };
  run(ctx, fnSource('pagePasteWhy') + '\n' + fnSource('modalFoot') + '\n' + fnSource('riskReport') + '\n'
    + fnSource('srlConflict') + '\n' + fnSource('openPaste'));
  ctx.openPaste();
  assert.equal(ctx.copied.length, 1, '구성원 채우기까지 막혔습니다');
  /* ★ 쪽지에는 «부품이 채울 수 있다고 한 칸»이 다 들어 있어야 한다.
     경력사항만 담으면 직책이 다를 때 채워도 딱지가 안 바뀐다. */
  const 푼것 = ctx.PuHomeFill.readPacket(ctx.copied[0]);
  assert.equal(푼것.ok, true, '복사된 것이 푸른ERP 쪽지가 아닙니다');
  assert.equal(푼것.kind, '구성원 채우기');
  assert.equal(푼것['칸']['경력사항'], '現 가\n現 나', '경력사항이 안 담겼습니다');
  ctx.PuHomeFill.MEMBER_FIELDS.forEach(f => {
    assert.ok(Object.prototype.hasOwnProperty.call(푼것['칸'], f.key),
      '★ 채울 수 있다고 한 칸(' + f.key + ')이 쪽지에 안 담겼습니다');
  });
  /* ★ 예전에 넣어 두신 «경력사항 단추»가 이 쪽지를 그대로 붙여넣으면 안 된다 */
  assert.match(ctx.copied[0], /<\s*div/i,
    '★ 옛 단추가 거절할 표시가 없습니다 — 쪽지가 경력사항 칸에 통째로 박힙니다');
});

/* ══════ 최종 검토 3 — 우리 자료에서 글 번호가 겹치면 붙여넣기를 막는다 ══════
   신입에게 실수로 권형하의 글 번호를 적으면 편집 주소가 권형하 글이다.
   시킨 대로 하면 권형하 경력이 신입 것으로 덮인다. */

test('★ 글 번호가 겹친 줄에서는 붙여넣기를 «막는다»', () => {
  const ctx = pageBox();
  ctx.App = {
    draft: { kind: 'member', key: 'new-1', srl: '190', name: '신입 노무사', careers: ['現 가'] },
    members: { '190': { name: '권형하', srl: '190' }, 'new-1': { name: '신입 노무사', srl: '190' } },
    lineFormat: 'plain'
  };
  run(ctx, fnSource('pagePasteWhy') + '\n' + fnSource('modalFoot') + '\n' + fnSource('riskReport') + '\n'
    + fnSource('srlConflict') + '\n' + fnSource('openPaste'));
  ctx.openPaste();
  assert.equal(ctx.copied.length, 0, '남의 글에 덮어쓸 내용을 복사해 줬습니다');
  assert.equal(ctx.shown.length, 1);
  assert.match(ctx.shown[0], /권형하/, '누구와 겹쳤는지 안 알려 줍니다');
});

test('★ 겹친 사람을 이름으로 알려 준다', () => {
  const ctx = box();
  ctx.App = { members: { '190': { name: '권형하', srl: '190' }, 'new-1': { name: '신입', srl: ' 190 ' } } };
  run(ctx, fnSource('srlConflict'));
  assert.deepEqual(plain(ctx.srlConflict('new-1', '190')), ['권형하']);
  assert.deepEqual(plain(ctx.srlConflict('190', '190')), ['신입']);
  assert.deepEqual(plain(ctx.srlConflict('190', '')), [], '글 번호가 비었으면 겹친 것이 아니다');
  assert.deepEqual(plain(ctx.srlConflict('190', '999')), []);
});

test('★ 겹친 글 번호를 빨간 띠로 알린다', () => {
  const ctx = box();
  ctx.App = {
    check: null, checkMsg: '', dataErr: '', staffErr: '', saveErr: '',
    staff: null, pages: {}, pageConfig: {}, checking: false, group: 'members',
    members: { '190': { name: '권형하', srl: '190' }, 'new-1': { name: '신입 노무사', srl: '190' } }
  };
  ctx.PAGE_LABEL = {};
  ctx.esc = escStub();
  /* 띠가 대시보드와 «같은 판단»을 쓴다 — 명부만 보고 아는 것을 띠에도 적기 때문이다 */
  run(ctx, noConst(constSource('PAGE_IDS')) + '\n' + rowDeps()
    + fnSource('leftoverGoBtns') + '\n' + fnSource('jobsOf') + '\n' + fnSource('bannersHtml'));
  const h = ctx.bannersHtml();
  /* 할 일 하나로 뜬다(5차 지시로 띠 → 한 줄 할 일). 색 대신 왼쪽 선으로 급함을 표시하며,
     빨강(기본 .job)이라야 한다 — 이건 남의 글을 덮을 수 있는 사고다. */
  assert.match(h, /class="job\s*"/, '가장 급한 할 일인데 급함 표시가 아닙니다');
  assert.match(h, /권형하/);
  assert.match(h, /신입 노무사/);
});

/* ══════ 최종 검토 2 — 경력관리가 «실제로» 저장하는 모양으로 당겨온다 ══════
   지어낸 항목 모양으로 통과시키면 같은 일이 되풀이된다. 아래 검사는 kcareer.html 의
   CAREER_CFG(저장통·거르개)와 폼 저장 칸 이름을 근거로 삼는다. */

const kcareer = fs.readFileSync(path.join(R, 'kcareer.html'), 'utf8');

/* vm 안의 const 는 상자 바깥(ctx)에서 안 보인다 — 검사에서 읽을 것만 밖으로 내놓는다 */
function expose(name) { return '\nglobalThis.' + name + ' = ' + name + ';'; }

function kindsBox() {
  const ctx = box();
  run(ctx, constSource('CAREER_KINDS') + '\n' + constLine('KCAREER_NS') + '\n'
    + fnSource('careerKindOf') + '\n' + fnSource('kcareerStores') + '\n'
    + fnSource('splitByKind') + '\n' + fnSource('kcareerFromLocal') + '\n'
    + fnSource('kcareerFromDb') + '\n' + fnSource('toCareerItem') + '\n' + fnSource('itemWhen')
    + expose('CAREER_KINDS') + expose('KCAREER_NS'));
  return ctx;
}

/* 경력관리가 실제로 저장하는 항목들 (kcareer.html 의 폼·표가 읽는 칸 이름 그대로) */
const 실제자료 = {
  wiccok: JSON.stringify([
    { id: 'W1', type: '위촉장', org: '중앙노동위원회', titleVal: '공익위원',
      issueDate: '2020.01.01', periodStart: '2020.01.01', periodEnd: '2025.12.31' },
    { id: 'W2', type: '위촉장', org: '고용노동부', titleVal: '자문위원',
      issueDate: '2026.01.01', periodStart: '2026.01.01', periodEnd: '2027.12.31' },
    { id: 'A1', type: '표창', org: '고용노동부', titleVal: '장관표창', issueDate: '2024.05.01' }
  ]),
  cert: JSON.stringify([
    { id: 'C1', title: '공인노무사', org: '한국산업인력공단', date: '2015.11.20', num: '15-0001' },
    { id: 'C2', title: '노동법 심화과정 수료', org: '노동교육원', date: '2023.06.30', duration: '40' }
  ]),
  edu: JSON.stringify([
    { id: 'E1', school: '푸른대학교', major: '경영학', degree: '학사', period: '2008.03 ~ 2012.02', graduated: '졸업' }
  ]),
  lecture: JSON.stringify([
    { id: 'L1', topic: '중대재해처벌법 대응', org: '푸른상공회의소', date: '2026.03.10', duration: '2' }
  ])
};

test('★ 경력관리의 저장통 이름을 짐작하지 않는다 — kcareer.html 의 CAREER_CFG 와 같아야 한다', () => {
  const ctx = kindsBox();
  assert.match(kcareer, /const NS='cm3_'/, '경력관리의 저장 이름표가 바뀌었습니다');
  assert.equal(ctx.KCAREER_NS, 'cm3_');
  plain(ctx.CAREER_KINDS).forEach(k => {
    const m = new RegExp('\\n\\s*' + k.key + ":\\{store:'([a-zA-Z_]+)'").exec(kcareer);
    assert.ok(m, 'kcareer.html 의 CAREER_CFG 에 ' + k.key + ' 갈래가 없습니다');
    assert.equal(k.store, m[1],
      k.key + ' 갈래의 저장통이 경력관리와 다릅니다 — 경력관리는 ' + m[1] + ' 에 넣습니다');
  });
});

test('★ 자격증·수료증은 «한 저장통(cm3_cert)»에서 제목으로 갈린다 — 늘 0건이 아니다', () => {
  const ctx = kindsBox();
  ctx.localStorage = { getItem: k => 실제자료[String(k).replace('cm3_', '')] || null };
  const got = plain(ctx.kcareerFromLocal());
  assert.equal(got.license.length, 1, '자격증이 0건입니다 — cm3_license 라는 저장통은 없습니다');
  assert.equal(got.license[0].title, '공인노무사');
  assert.equal(got.complete.length, 1, '수료증이 0건입니다');
  assert.match(got.complete[0].title, /수료/);
});

test('★ 위촉장 탭에 표창·포상이 섞이지 않는다', () => {
  const ctx = kindsBox();
  ctx.localStorage = { getItem: k => 실제자료[String(k).replace('cm3_', '')] || null };
  const got = plain(ctx.kcareerFromLocal());
  assert.equal(got.wiccok.length, 2, '표창이 위촉장에 섞였습니다');
  assert.ok(!got.wiccok.some(r => r.type === '표창' || r.type === '포상'));
});

test('★ 클라우드 사본도 «저장통 이름»으로 읽는다 (ls 는 cm3_ 를 뗀 이름으로 들어 있다)', async () => {
  const ctx = kindsBox();
  ctx.db = { ref: p => ({ once: () => Promise.resolve({ val: () => 실제자료 }) }) };
  const got = plain(await ctx.kcareerFromDb('U1'));
  assert.equal(got.license.length, 1);
  assert.equal(got.complete.length, 1);
  assert.equal(got.wiccok.length, 2);
  assert.equal(got.edu.length, 1);
  assert.equal(got.lecture.length, 1);
});

test('★ 위촉 기간이 지났으면 前 이 나온다 (periodStart/periodEnd 로 저장된다)', () => {
  const ctx = kindsBox();
  const items = JSON.parse(실제자료.wiccok);
  const 끝난것 = ctx.PuHomeCareer.toLine(ctx.toCareerItem(items[0], 'wiccok'), '2026-08-16');
  assert.match(끝난것.text, /^前 /, '기간이 지났는데 現 으로 나옵니다 — period/end 만 보고 있습니다');
  assert.equal(끝난것.ended, true);
  assert.match(끝난것.text, /중앙노동위원회/);
  assert.match(끝난것.text, /공익위원/);
  const 진행중 = ctx.PuHomeCareer.toLine(ctx.toCareerItem(items[1], 'wiccok'), '2026-08-16');
  assert.match(진행중.text, /^現 /);
});

test('★ 홈페이지에 現 으로 걸린 만료 직함을 잡아낸다', () => {
  const ctx = kindsBox();
  const all = JSON.parse(실제자료.wiccok).map(it => ctx.toCareerItem(it, 'wiccok'));
  const live = ['現 중앙노동위원회 공익위원', '現 고용노동부 자문위원'];
  const 만료 = plain(ctx.PuHomeCareer.expiredInLive(live, all, '2026-08-16'));
  assert.deepEqual(만료, ['現 중앙노동위원회 공익위원']);
});

test('★ 학력은 학교·전공·학위가 다 들어간다', () => {
  const ctx = kindsBox();
  const it = JSON.parse(실제자료.edu)[0];
  const line = ctx.PuHomeCareer.toLine(ctx.toCareerItem(it, 'edu'), '2026-08-16');
  assert.match(line.text, /푸른대학교/);
  assert.match(line.text, /경영학/, '전공이 빠졌습니다 — major 칸을 안 보고 있습니다');
  assert.match(line.text, /학사/, '학위가 빠졌습니다 — deg 가 아니라 degree 입니다');
});

test('★ 강의는 주제가 들어간다', () => {
  const ctx = kindsBox();
  const it = JSON.parse(실제자료.lecture)[0];
  const line = ctx.PuHomeCareer.toLine(ctx.toCareerItem(it, 'lecture'), '2026-08-16');
  assert.match(line.text, /중대재해처벌법 대응/, '주제가 빠졌습니다 — topic 칸을 안 보고 있습니다');
  assert.match(line.text, /푸른상공회의소/);
});

test('자격증·수료증은 자격명과 발급기관이 들어간다', () => {
  const ctx = kindsBox();
  const certs = JSON.parse(실제자료.cert);
  const a = ctx.PuHomeCareer.toLine(ctx.toCareerItem(certs[0], 'license'), '2026-08-16');
  assert.match(a.text, /공인노무사/);
  assert.match(a.text, /한국산업인력공단/);
  const b = ctx.PuHomeCareer.toLine(ctx.toCareerItem(certs[1], 'complete'), '2026-08-16');
  assert.match(b.text, /노동법 심화과정 수료/);
});

test('언제인지(기간·취득일)를 화면에 보여 줄 수 있다', () => {
  const ctx = kindsBox();
  assert.match(ctx.itemWhen(JSON.parse(실제자료.wiccok)[0], 'wiccok'), /2020\.01\.01/);
  assert.match(ctx.itemWhen(JSON.parse(실제자료.cert)[0], 'license'), /2015\.11\.20/);
  assert.match(ctx.itemWhen(JSON.parse(실제자료.lecture)[0], 'lecture'), /2026\.03\.10/);
});

/* ══════ 최종 검토 4 — 퇴사 처리를 끝낸 사람에게 할 일이 남지 않는다 ══════ */

test('★ 퇴사자를 내리고 나면 갈래 탭의 빨간 점이 사라진다', () => {
  const ctx = box();
  ctx.App = {
    group: 'members', staff: null,
    check: { members: { '190': { name: '나간사람', status: 'done', reason: '퇴사 처리 끝' } } },
    members: { '190': { name: '나간사람', srl: '190', position1: '', position2: '' } }
  };
  ctx.App.pages = {}; ctx.App.pageConfig = {};
  run(ctx, noConst(constSource('PAGE_IDS')) + '\n' + rowDeps());
  assert.equal(ctx.statOf('members').hot, 0, '할 일이 없는데 빨간 점이 남습니다');
  /* 「손댈 것」 딱지로 걸러 봐도 한 줄도 없어야 한다 — 점과 딱지가 같은 판단을 써야 한다 */
  ctx.App.filter = 'todo';
  assert.equal(ctx.visibleRows('members').length, 0, '점은 꺼졌는데 「손댈 것」에는 줄이 남습니다');
  ctx.App.filter = '';
});

test('「내려감」 딱지에 화면에 보일 이름이 있다', () => {
  const ctx = box();
  run(ctx, constObj('STATUS_TEXT') + expose('STATUS_TEXT'));
  const t = plain(ctx.STATUS_TEXT);
  assert.ok(t.done, '「내려감」 딱지에 한국어 이름이 없습니다');
  assert.notEqual(t.done, t.same, '「같음」과 같은 말로 뭉갰습니다');
  assert.match(html, /\.pill\.done/, '딱지 모양(CSS)이 없어 글자만 떠 있습니다');
});

/* ══════ 머지 전 최종 수정 1 — 「이름 훑기」가 done(내려간 뒤)일 때도 돈다 ══════
   설계가 잡은 상황은 «구성원 목록에서는 빠졌는데 인사말·업무 소개글에 이름이 남는 일»
   — 즉 홈페이지에서 글을 «내린 뒤»다. 그게 toRemove 가 아니라 done 이다.
   toRemove(아직 홈페이지에 남아 있음) 일 때 훑는 것도 그대로 지켜야 한다. */

test('★ done(내려간) 사람도 이름 잔존을 훑는다 — toRemove 일 때도 여전히 훑는다', async () => {
  const ctx = box();
  ctx.App = {
    members: {
      '190': { name: '나간사람', srl: '190', position1: '', position2: '', careers: [] },
      '191': { name: '아직안내림', srl: '191', position1: '', position2: '', careers: [] }
    },
    // leftAt 을 아주 옛날로 두어 오늘이 언제든 hasLeft 가 true 다 — 실제 시각에 기대지 않는다.
    pages: {},
    staff: [
      { name: '나간사람', leftAt: '2020-01-01' },
      { name: '아직안내림', leftAt: '2020-01-01' }
    ],
    check: null, saveErr: ''
  };
  ctx.db = { ref: () => ({ set: () => Promise.resolve() }) };
  run(ctx, constSource('PAGE_IDS') + '\n' + fnSource('todayString') + '\n' + fnSource('applyStatus'));

  // 190(나간사람)은 홈페이지 구성원 목록(live)에 없다 → done. 191(아직안내림)은 아직 있다 → toRemove.
  const live = [{ srl: '191', name: '아직안내림', careers: [] }];
  const livePages = { greeting: '나간사람 노무사가 인사말을 남겼습니다. 아직안내림 노무사도 함께 합니다.' };
  await ctx.applyStatus(live, livePages, []);

  const members = plain(ctx.App.check.members);
  assert.equal(members['190'].status, 'done');
  assert.equal(members['191'].status, 'toRemove');

  const leftovers = plain(ctx.App.check.leftovers);
  assert.ok(leftovers['나간사람'], 'done(내려간) 사람의 이름 잔존을 훑지 않았습니다');
  assert.ok(leftovers['아직안내림'], 'toRemove 사람의 이름 잔존까지 훑지 못하게 되었습니다 — 회귀');
});

test('★ done 사람의 이름 잔존도 배너로 알린다 — toRemove 가 0명이어도 뜬다', () => {
  const ctx = box();
  ctx.App = {
    check: {
      members: { '190': { name: '나간사람', status: 'done', reason: '퇴사 처리 끝' } },
      duplicates: [],
      leftovers: { '나간사람': [{ path: 'greeting', count: 1 }] }
    },
    checkMsg: '', dataErr: '', staffErr: '', saveErr: '',
    staff: null, pages: {}, pageConfig: {}, checking: false, group: 'members',
    members: { '190': { name: '나간사람', srl: '190' } }
  };
  ctx.PAGE_LABEL = { greeting: '인사말' };
  ctx.esc = escStub();
  run(ctx, noConst(constSource('PAGE_IDS')) + '\n' + rowDeps()
    + fnSource('leftoverGoBtns') + '\n' + fnSource('jobsOf') + '\n' + fnSource('bannersHtml'));
  const h = ctx.bannersHtml();
  assert.match(h, /나간사람/, 'toRemove 가 0명이라고 done 사람의 이름 잔존을 안 보여 줍니다');
  /* 이름이 남은 «그 쪽»으로 바로 갈 수 있어야 한다 — 알려만 주고 찾아 들어가게 두지 않는다 */
  assert.match(h, /인사말/, '이름이 남은 쪽이 어디인지 안 적혀 있습니다');
  assert.ok(!/홈페이지에서 내리는 법/.test(h), '이미 내려간 사람인데 «내리는 법» 안내가 뜹니다');
});

/* ══════ 머지 전 최종 수정 2 — 「※기간 모름」은 기간 개념이 있는 갈래에만 ══════
   자격증·수료증·강의는 kcareer.html 의 CAREER_CFG 표에 기간 칸이 아예 없다
   (license cols :4234, complete cols :4240, lecture cols :4259 — 취득일/수료일/일자만
   있고 기간 칸이 없다). 위촉장(:4215)과 학력(:4246)만 기간 칸이 있다. 기간 개념이 없는
   갈래는 pick() 이 period/end 를 안 주어 toLine 의 unknown 이 «언제나» true 가 되므로,
   그 갈래에는 「기간 모름」 표시를 붙이면 안 된다 — 자료가 없어서가 아니라 개념이 없어서다. */

test('★ 위촉장에는 「기간 모름」 꼬리표가 붙고 자격증·수료증·강의에는 안 붙는다 — 복사 결과(careersText)에도 안 실린다', () => {
  const ctx = kindsBox();
  ctx.App = { draft: { kind: 'member', careers: [] } };
  ctx.Pull = {
    open: true,
    items: {
      // 위촉장인데 period/periodEnd 를 안 적어 «진짜로» 기간을 모르는 경우
      wiccok: [{ id: 'W1', type: '위촉장', org: '고용노동부', titleVal: '자문위원', issueDate: '2026.01.01' }],
      license: [{ id: 'C1', title: '공인노무사', org: '한국산업인력공단', date: '2015.11.20' }],
      complete: [{ id: 'C2', title: '노동법 심화과정 수료', org: '노동교육원', date: '2023.06.30' }],
      edu: [],
      lecture: [{ id: 'L1', topic: '중대재해처벌법 대응', org: '푸른상공회의소', date: '2026.03.10' }]
    },
    sel: { 'wiccok:0': true, 'license:0': true, 'complete:0': true, 'lecture:0': true }
  };
  ctx.closeModal = () => {};
  ctx.toast = () => {};
  run(ctx, fnSource('todayString') + '\n' + fnSource('kindHasPeriod') + '\n' + fnSource('pullApply'));
  ctx.App.render = () => {};
  ctx.pullApply();

  const careers = ctx.App.draft.careers;
  const wic = careers.find(t => /고용노동부/.test(t));
  const lic = careers.find(t => /공인노무사/.test(t));
  const com = careers.find(t => /노동법 심화과정/.test(t));
  const lec = careers.find(t => /중대재해처벌법/.test(t));

  assert.match(wic, /※기간 모름/, '위촉장은 기간 개념이 있는 갈래인데 표시가 없습니다');
  assert.ok(lic && !/※기간 모름/.test(lic), '자격증에는 기간 개념이 없는데 「기간 모름」이 붙었습니다');
  assert.ok(com && !/※기간 모름/.test(com), '수료증에는 기간 개념이 없는데 「기간 모름」이 붙었습니다');
  assert.ok(lec && !/※기간 모름/.test(lec), '강의에는 기간 개념이 없는데 「기간 모름」이 붙었습니다');

  // 복사 결과(공개 홈페이지로 붙여넣을 글자)에도 위촉장 한 줄에만 실려야 한다.
  const copied = ctx.PuHomeExport.careersText(careers, 'plain');
  const markedLines = copied.split('\n').filter(l => l.indexOf('※기간 모름') >= 0);
  assert.equal(markedLines.length, 1, '「기간 모름」 표시가 위촉장 한 줄에만 있어야 하는데 다른 갈래에도 실렸습니다');
  assert.match(markedLines[0], /고용노동부/);
});

/* ══════ 머지 전 최종 수정 3 — 「대조 기준 저장」만으로는 딱지가 안 바뀐다는 안내 ══════
   markChanged 는 딱지가 same 일 때만 pending 으로 내린다. 「대조 기준 저장」을 눌러도
   그것만으로는 딱지가 «다시» same 으로 바뀌지 않는다 — 「홈페이지 다시 확인」을 한 번
   더 눌러야 새로 대조해 same 이 붙는다. 안내 3번에 이 말이 빠져 있었다. */

test('★ 쪽 안내에 「대조 기준 저장」만으로는 안 바뀌고 「홈페이지 다시 확인」을 한 번 더 눌러야 한다는 말이 있다', () => {
  const ctx = pageBox();
  ctx.App = { draft: { kind: 'page', key: 'inquiry', text: '가나다' }, pages: {}, dirty: false };
  run(ctx, fnSource('pagePasteWhy') + '\n' + fnSource('stamp') + '\n' + fnSource('canDetachPage') + '\n'
    + fnSource('noteOneLine') + '\n' + fnSource('readPageBtn') + '\n' + fnSource('pageFrameDoc') + '\n' + fnSource('runSep') + '\n' + fnSource('runKey') + '\n' + fnSource('runOfKey') + '\n' + fnSource('pageLinesHtml') + '\n' + fnSource('pageEdit'));
  const h = ctx.pageEdit(ctx.App.draft);
  assert.match(h, /대조 기준 저장만으로는/, '저장만으로는 딱지가 안 바뀐다는 말이 없습니다');
  assert.match(h, /한 번 더 눌러야/, '홈페이지 다시 확인을 «한 번 더» 눌러야 한다는 말이 없습니다');
  assert.match(h, /홈페이지 다시 확인.*한 번 더|한 번 더.*홈페이지 다시 확인|「같음」으로 바뀝니다/,
    '한 번 더 눌러야 「같음」으로 바뀐다는 결론이 없습니다');
});

/* ══════════════════════════════════════════════════════════════════════════
   2차 설계 (docs/superpowers/specs/2026-08-17-홈페이지-관리-2차-design.md)
   목업 docs/mockups/homepage-manage-v2.html
   ① 목록에 번호  ② 쪽 글을 홈페이지와 같은 줄 모양으로
   ③ 주요업무 쪽 추가·분리  ④ 퇴사자 예외와 「명부에 없음」 보이기
   ══════════════════════════════════════════════════════════════════════════ */

/* 화면 안 창(3차 설계 §1) 대역. 브라우저 기본 창을 안 쓰므로 이 셋을 갈아 끼운다.
   ★ askText 는 «그만두기(null)»와 «빈 값('')»을 갈라 돌려준다 — 부르는 쪽이 그 둘을
     다르게 다뤄야 하므로 대역도 그대로 흉내 낸다. */
function dlgStubs(ctx, answers) {
  const 답 = Array.isArray(answers) ? answers.slice() : [];
  ctx.say = (t, b) => {
    ctx.said.push(String(t) + ' ' + String(b == null ? '' : b));
    return Promise.resolve();
  };
  ctx.askYes = () => Promise.resolve(true);
  ctx.askText = () => Promise.resolve(답.length ? 답.shift() : null);
  return ctx;
}

/* 목록·쪽 설정을 함께 돌리는 상자. 자료(homepage/config/pages)를 넣으면 그 목록이 된다. */
function cfgBox(cfg) {
  const ctx = box();
  ctx.esc = escStub();
  ctx.saved = [];
  ctx.said = [];
  ctx.db = {
    ref: p => ({
      set: v => { ctx.saved.push({ path: p, how: 'set', value: v }); return Promise.resolve(); },
      remove: () => { ctx.saved.push({ path: p, how: 'remove' }); return Promise.resolve(); },
      once: () => Promise.resolve({ val: () => null })
    })
  };
  dlgStubs(ctx);
  ctx.toast = m => { ctx.said.push(String(m)); };
  ctx.App = {
    group: 'work', pick: '', pageConfig: {}, pages: {}, members: {}, check: null, staff: null,
    pageLines: {}, draft: null, dirty: false, lineFormat: 'plain', render() {}
  };
  ctx.App.filter = '';        // 걸러 보기 — 목록이 이 상태를 본다
  run(ctx, noConst(constSource('PAGE_IDS')) + '\n' + rowDeps()
    + fnSource('isPageName') + '\n' + fnSource('syncPageConfig') + '\n'
    + fnSource('savePageConfig') + '\n' + fnSource('refuseIfPageConfigUnread') + '\n'
    + fnSource('addPage') + '\n'
    + fnSource('canDetachPage') + '\n' + fnSource('detachPage') + '\n'
    + fnSource('firstPickOf') + '\n' + noConst(constLine('MEMBER_KINDS')) + '\n' + fnSource('memberKind') + '\n' + fnSource('loadDraft') + '\n'
    + fnSource('rosterPillHtml') + '\n' + fnSource('listHtml') + '\n'
    + expose('PAGE_IDS') + expose('PAGE_LABEL') + expose('DEFAULT_PAGES'));
  ctx.syncPageConfig(cfg);
  return ctx;
}

/* 목록에 실제로 그려진 번호를 «모양을 못 박지 않고» 읽어낸다 —
   숫자만 들어 있는 칸의 글자를 순서대로 모은다. */
function numbersIn(html) {
  return [...String(html).matchAll(/>\s*(\d+)\s*</g)].map(m => Number(m[1]));
}

/* ══════ ① 목록에 번호 ══════ */

test('★ 구성원 목록에 1부터 번호가 붙는다', () => {
  const ctx = cfgBox(null);
  ctx.App.group = 'members';
  ctx.App.members = {
    '190': { name: '권형하', position1: '대표', position2: '공인노무사' },
    '193': { name: '박성수', position2: '공인노무사' },
    '195': { name: '박한별', position2: '공인노무사' }
  };
  const h = ctx.listHtml();
  assert.deepEqual(rowNumbers(h), [1, 2, 3], '구성원 목록에 1·2·3 번호가 없습니다');
  ['권형하', '박성수', '박한별'].forEach(n =>
    assert.ok(h.indexOf(n) >= 0, n + ' 이(가) 목록에서 사라졌습니다'));
});

test('★ 쪽 목록에도 번호가 붙는다 (쪽을 추가하면 다음 번호로 이어진다)', () => {
  const ctx = cfgBox(null);
  ctx.App.group = 'work';
  assert.deepEqual(rowNumbers(ctx.listHtml()), [1, 2, 3, 4, 5, 6], '기본 주요업무 6쪽에 번호가 없습니다');

  const cfg = Object.assign({}, plain(ctx.DEFAULT_PAGES));
  cfg.work6 = { label: '중대재해 대응', order: 99 };
  ctx.syncPageConfig(cfg);
  const after = ctx.listHtml();
  assert.deepEqual(rowNumbers(after), [1, 2, 3, 4, 5, 6, 7], '추가한 쪽이 7번으로 안 이어집니다');
  assert.ok(after.indexOf('중대재해 대응') >= 0, '추가한 쪽의 보일 이름이 목록에 없습니다');
});

test('★ 화면 번호가 «붙여넣을 글자»에는 절대 안 들어간다', () => {
  /* 번호가 careersText 에 섞이면 홈페이지 구성원 소개에 숫자가 찍힌다.
     화면(경력사항 칸)에는 번호가 보이고, 복사되는 글자에는 없어야 한다. */
  const ctx = box();
  ctx.esc = escStub();
  const careers = ['現 푸른노무법인 대표', '現 충남 공무직인사위원회 위원', '現 충남 노동정책 추진단위원'];
  ctx.App = {
    draft: { kind: 'member', key: '190', name: '권형하', position1: '대표', position2: '공인노무사',
             intro: '', srl: '190', careers: careers.slice() },
    members: { '190': { name: '권형하', srl: '190' } },
    staff: null, check: null, lineFormat: 'plain', dirty: false
  };
  run(ctx, fnSource('todayString') + '\n' + fnSource('keptOf') + '\n' + fnSource('rosterMarkOf') + '\n'
    + fnSource('memberBandHtml') + '\n'
    + fnSource('riskReport') + '\n' + fnSource('srlConflict') + '\n' + fnSource('stamp') + '\n'
    + noConst(constLine('MEMBER_KINDS')) + '\n' + fnSource('memberKind') + '\n' + fnSource('memberEdit'));
  const nums = numbersIn(ctx.memberEdit(ctx.App.draft));
  assert.ok(nums.indexOf(1) >= 0 && nums.indexOf(3) >= 0, '경력사항 줄에 번호가 안 보입니다');

  const copied = ctx.PuHomeExport.careersText(ctx.App.draft.careers, 'plain');
  assert.deepEqual(copied.split('\n'), careers, '붙여넣을 글자가 자료와 달라졌습니다');
  copied.split('\n').forEach(l => assert.doesNotMatch(l, /^\s*\d/,
    '붙여넣을 줄이 숫자로 시작합니다 — 홈페이지에 번호가 찍힙니다'));
  const div = ctx.PuHomeExport.careersText(ctx.App.draft.careers, 'div');
  assert.deepEqual(div.split('\n'), careers.map(l => '<div>' + l + '</div>'),
    '「감싸기」로 내보낼 때 번호가 섞였습니다');
});

test('★ 당겨오기 목록에도 번호가 붙고, 넣은 줄에는 번호가 안 들어간다', () => {
  const ctx = kindsBox();
  ctx.esc = escStub();
  ctx.App = { draft: { kind: 'member', careers: [] }, render() {} };
  ctx.Pull = {
    open: true, kind: 'lecture', name: '권형하', err: '', sel: {},
    items: {
      wiccok: [], license: [], complete: [], edu: [],
      lecture: [
        { id: 'L1', topic: '중대재해처벌법 대응', org: '가상공회의소', date: '2026.03.10' },
        { id: 'L2', topic: '임금체계 개편', org: '나상공회의소', date: '2026.04.10' }
      ]
    }
  };
  ctx.shown = [];
  ctx.openModal = h => { ctx.shown.push(h); };
  ctx.closeModal = () => {};
  ctx.toast = () => {};
  /* ★ 2026-09-05: 목록 그리는 일이 pullListHtml 로 갈라졌고 찾기·깔때기가 붙었다.
     그 부품들을 안 올리면 renderPull 이 「is not defined」로 터진다. */
  ctx.document = { getElementById: () => null };
  run(ctx, fnSource('todayString') + '\n' + fnSource('kindHasPeriod') + '\n'
    + fnSource('찾기꼴') + '\n' + fnSource('pullPass') + '\n' + fnSource('pullVisible') + '\n'
    + fnSource('pullListHtml') + '\n' + fnSource('pullCountPaint') + '\n'
    + fnSource('renderPull') + '\n' + fnSource('pullApply'));
  ctx.renderPull();
  const nums = numbersIn(ctx.shown[ctx.shown.length - 1]);
  assert.ok(nums.indexOf(1) >= 0 && nums.indexOf(2) >= 0, '당겨오기 목록에 번호가 없습니다');

  ctx.Pull.sel = { 'lecture:0': true, 'lecture:1': true };
  ctx.pullApply();
  assert.equal(ctx.App.draft.careers.length, 2);
  ctx.App.draft.careers.forEach(l => assert.doesNotMatch(l, /^\s*\d/,
    '당겨온 줄이 번호로 시작합니다 — 그대로 홈페이지에 실립니다'));
});

/* ══════ ② 쪽 글을 홈페이지와 같은 줄 모양으로 ══════ */

test('★ 홈페이지를 읽었으면 쪽 글이 «줄마다 번호와 함께» 보인다', () => {
  const ctx = pageBox();
  ctx.App = {
    draft: { kind: 'page', key: 'inquiry', text: '천안본사 충남 천안시 T. 041-556-0035' },
    pages: {}, dirty: false, pageConfig: {},
    pageLines: { inquiry: ['천안본사', '충남 천안시 서북구 원두정8길 6, 301호(두정빌딩)', 'T. 041-556-0035'] }
  };
  run(ctx, fnSource('pagePasteWhy') + '\n' + fnSource('stamp') + '\n' + fnSource('canDetachPage') + '\n'
    + fnSource('noteOneLine') + '\n' + fnSource('readPageBtn') + '\n' + fnSource('pageFrameDoc') + '\n' + fnSource('runSep') + '\n' + fnSource('runKey') + '\n' + fnSource('runOfKey') + '\n' + fnSource('pageLinesHtml') + '\n' + fnSource('pageEdit'));
  const h = ctx.pageEdit(ctx.App.draft);
  assert.deepEqual(numbersIn(h).slice(0, 3), [1, 2, 3], '줄마다 번호가 붙지 않았습니다');
  assert.ok(h.indexOf('천안본사') >= 0);
  assert.ok(h.indexOf('T. 041-556-0035') >= 0, '홈페이지의 줄이 통째로 빠졌습니다');
});

test('★ 홈페이지를 아직 안 읽었으면 «빈 줄»이 아니라 그 사실을 알린다', () => {
  const ctx = pageBox();
  ctx.App = { draft: { kind: 'page', key: 'inquiry', text: '뭉쳐 있는 대조 기준 글자' },
              pages: {}, dirty: false, pageLines: {}, pageConfig: {} };
  run(ctx, fnSource('pagePasteWhy') + '\n' + fnSource('stamp') + '\n' + fnSource('canDetachPage') + '\n'
    + fnSource('noteOneLine') + '\n' + fnSource('readPageBtn') + '\n' + fnSource('pageFrameDoc') + '\n' + fnSource('runSep') + '\n' + fnSource('runKey') + '\n' + fnSource('runOfKey') + '\n' + fnSource('pageLinesHtml') + '\n' + fnSource('pageEdit'));
  const h = ctx.pageEdit(ctx.App.draft);
  assert.match(h, /홈페이지 다시 확인/, '어떻게 하면 줄 모양으로 보이는지 안 적혀 있습니다');
  assert.equal(numbersIn(h).length, 0, '못 읽은 것을 빈 줄로 지어내 보여 줬습니다');
});

test('★ 줄 꾸밈(소제목·구획번호)이 «자료»에 섞이지 않는다', () => {
  const ctx = pageBox();
  const 기준 = '자문서비스 01 법률자문 최신 노동관계법령에 대한 자문과 상담을 수행합니다.';
  ctx.App = {
    draft: { kind: 'page', key: 'work1', text: 기준 }, pages: {}, dirty: false, pageConfig: {},
    pageLines: { work1: ['자문서비스', '01', '법률자문', '최신 노동관계법령에 대한 자문과 상담을 수행합니다.'] }
  };
  run(ctx, fnSource('pagePasteWhy') + '\n' + fnSource('stamp') + '\n' + fnSource('canDetachPage') + '\n'
    + fnSource('noteOneLine') + '\n' + fnSource('readPageBtn') + '\n' + fnSource('pageFrameDoc') + '\n' + fnSource('runSep') + '\n' + fnSource('runKey') + '\n' + fnSource('runOfKey') + '\n' + fnSource('pageLinesHtml') + '\n' + fnSource('pageEdit'));
  const h = ctx.pageEdit(ctx.App.draft);
  assert.equal(ctx.App.draft.text, 기준, '보여 주기만 해야 하는데 초안(자료)이 바뀌었습니다');
  assert.ok(h.indexOf(ctx.esc(기준)) >= 0, '대조 기준 글자 칸이 원문 그대로가 아닙니다');
  // 꾸밈은 CSS 이름으로만 붙는다 — 줄 «글자»에 표시를 덧붙이지 않는다
  assert.match(h, />\s*01\s*</, '구획번호 줄이 글자 그대로 보이지 않습니다');
});

test('★ 대조는 여전히 «뭉친 글자»로 한다 — 줄 목록이 대조 규칙을 바꾸지 않는다', async () => {
  /* 줄 모양대로 견주면 공백 하나로 「다름」이 쏟아진다. 실제 홈페이지 표본으로 돌려 확인한다. */
  const ctx = box();
  const html = fs.readFileSync(path.join(R, 'docs', 'homepage-backup', '2026-08-16', 'work1.html'), 'utf8');
  const 뭉친글자 = ctx.PuHomeParse.parsePageText(html);
  assert.ok(ctx.PuHomeParse.parsePageLines(html).length > 5, '표본에서 줄 목록을 못 만들었습니다');

  ctx.App = { members: {}, pages: { work1: { text: 뭉친글자 } }, staff: [], check: null,
              saveErr: '', pageLines: {} };
  ctx.db = { ref: () => ({ set: () => Promise.resolve() }) };
  run(ctx, constSource('PAGE_IDS') + '\n' + fnSource('todayString') + '\n' + fnSource('applyStatus'));
  await ctx.applyStatus([{ srl: '190', name: '권형하', careers: [] }], { work1: 뭉친글자 }, []);
  assert.equal(plain(ctx.App.check.pages).work1.status, 'same',
    '뭉친 글자가 같은데 「안 올라감」이 떴습니다 — 대조 기준이 줄 목록으로 바뀌었습니다');
});

/* 머지 전 최종 수정 2 — 대조 기준(App.pages[mid].text)이 «아직 비어 있는» 쪽(예: 방금 추가한
   새 쪽)은 홈페이지 내용과 달라 pageStatus 가 'pending'(=안 올라감)을 낸다. 그런데 진짜 뜻은
   정반대다 — 우리 글이 안 올라간 게 아니라 우리에게 «대조 기준이 아직 없다». 쪽에는
   붙여넣기 기능이 없어 「안 올라감」을 보고 사장님이 시킬 방법도 없다. */
test('★ 대조 기준이 아직 없는 쪽(새로 추가한 쪽)은 「안 올라감」이 아니라 「기준 없음」이다', async () => {
  const ctx = box();
  ctx.App = { members: {}, pages: {}, staff: [], check: null, saveErr: '', pageLines: {} };
  ctx.db = { ref: () => ({ set: () => Promise.resolve() }) };
  run(ctx, constSource('PAGE_IDS') + '\n' + fnSource('todayString') + '\n' + fnSource('applyStatus'));

  // work1 은 홈페이지에서 방금 «제대로» 읽혔다(livePages 에 실제 문장이 있다) — 「못 읽음」이 아니다.
  await ctx.applyStatus([], { work1: '자문서비스 01 법률자문 최신 노동관계법령에 대한 자문과 상담을 수행합니다.' }, []);

  const pages = plain(ctx.App.check.pages);
  assert.equal(pages.work1.status, 'noBase',
    '기준이 없을 뿐인데 「안 올라감(pending)」으로 떴습니다 — 방향이 반대입니다');
  assert.match(pages.work1.reason, /기준 없음/, '왜 기준이 없는지 사유가 안 남았습니다');
});

test('★ 「기준 없음」쪽은 목록에서 상태로 바로 보이고, 확인을 방금 했어도 「다시 확인 전」이라고 하지 않는다', () => {
  /* pageRows 의 note 는 예전에 App.pages[mid].text(우리 대조 기준)만 보고 갈랐다 —
     그래서 방금 「홈페이지 다시 확인」을 눌러도 우리 대조 기준은 여전히 비어 있어
     「아직 내용 없음 (홈페이지 다시 확인 전)」이라고 거꾸로 적었다. status(=noBase)를
     먼저 보게 고쳤는지 확인한다. */
  const ctx = box();
  ctx.App = {
    group: 'work', pages: {},
    check: { pages: { work1: { status: 'noBase', reason: '기준 없음 — 홈페이지에서 읽어온 내용을 기준으로 삼으십시오' } } }
  };
  run(ctx, constSource('PAGE_IDS') + '\n' + fnSource('pageIdsOf') + '\n' + fnSource('pageRows'));
  const rows = ctx.pageRows('work');
  const w1 = rows.find(r => r.key === 'work1');
  assert.equal(w1.status, 'noBase');
  assert.doesNotMatch(w1.desc, /다시 확인 전/,
    '방금 확인했는데 「다시 확인 전」이라고 거꾸로 적었습니다');
  assert.match(w1.desc, /기준 없음/, '기준이 없다는 안내가 목록 줄에 안 보입니다');
});

test('★ 「홈페이지 다시 확인」이 줄 목록도 함께 채운다 (표본으로 돌려서 확인)', async () => {
  const ctx = box();
  const BK = path.join(R, 'docs', 'homepage-backup', '2026-08-16');
  const 표본 = {
    people: fs.readFileSync(path.join(BK, 'people.html'), 'utf8'),
    work1: fs.readFileSync(path.join(BK, 'work1.html'), 'utf8'),
    inquiry: fs.readFileSync(path.join(BK, 'inquiry.html'), 'utf8')
  };
  ctx.App = {
    checking: false, checkMsg: '', checkBad: false, members: {}, pages: {}, staff: [],
    check: null, saveErr: '', pageLines: {}, pageRuns: {}, pageFix: {}, render() {}
  };
  ctx.db = { ref: () => ({ set: () => Promise.resolve() }) };
  ctx.firebase = { auth: () => ({ currentUser: { getIdToken: () => Promise.resolve('T') } }) };
  ctx.toast = () => {};
  ctx.fetch = (url, opt) => {
    const p = JSON.parse(opt.body).path;
    if (!표본[p]) return Promise.resolve({ ok: false });
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ html: 표본[p] }) });
  };
  run(ctx, constSource('PAGE_IDS') + '\n' + constLine('READ_HOMEPAGE_URL') + '\n'
    + fnSource('todayString') + '\n' + fnSource('applyStatus') + '\n' + fnSource('keepPageHtml') + '\n'
    + fnSource('checkFailText') + '\n' + fnSource('showCheckFailed') + '\n' + fnSource('checkHomepage'));
  await ctx.checkHomepage();

  const lines = plain(ctx.App.pageLines);
  assert.ok(lines.work1 && lines.work1.length > 5, '주요업무 쪽의 줄 목록을 안 채웠습니다');
  assert.ok(lines.inquiry && lines.inquiry.length > 5, '오시는길 줄 목록을 안 채웠습니다');
  assert.ok(lines.work1.every(l => l.indexOf('<') < 0 && l.indexOf('>') < 0),
    '줄에 태그 찌꺼기가 섞였습니다');
  assert.ok(!lines.work2, '못 읽은 쪽의 줄 목록을 지어냈습니다');

  /* ★ «보여줄 줄»만 채우고 «고칠 줄»을 안 채우면, 쪽을 열었을 때 고칠 칸이 하나도 없다.
     둘은 반드시 함께 채워져야 한다 — 한 군데서만 담기 때문이다. */
  const runs = ctx.App.pageRuns;
  assert.ok(runs.work1 && runs.work1.length, '★ 고칠 줄 목록을 안 채웠습니다 — 쪽을 열어도 고칠 칸이 없습니다');
  assert.ok(runs.inquiry && runs.inquiry.length, '★ 오시는길의 고칠 줄 목록을 안 채웠습니다');
  assert.ok(!runs.work2, '못 읽은 쪽의 고칠 줄을 지어냈습니다');
  assert.ok(runs.work1.some(r => r.ok), '★ 고칠 수 있는 줄이 하나도 없다고 합니다');
  /* 고칠 줄은 «본문 자리»에서만 나온다 — 대조 글자 안에 다 들어 있어야 한다 */
  const 대조 = ctx.PuHomeParse.tidy(ctx.PuHomeParse.parsePageText(표본.work1));
  const 밖 = runs.work1.filter(r => 대조.indexOf(r.text) < 0);
  assert.equal(밖.length, 0, '★ 본문 밖 글자를 고치라고 내놓았습니다: '
    + 밖.slice(0, 3).map(r => r.text).join(' | '));
});

/* ══════ ③ 주요업무 쪽 추가·분리 ══════ */

test('★ 쪽 목록이 비어 있으면 지금 쓰는 8개를 기본값으로 보여준다', () => {
  const ctx = cfgBox(null);
  assert.deepEqual([...ctx.PAGE_IDS],
    ['work1', 'work2', 'work3', 'work4', 'work5a', 'work5b', 'inquiry', 'greeting'],
    '자료가 비었는데 화면도 비어 버립니다 — 이미 자료가 들어 있는 쪽들입니다');
  assert.equal(ctx.PAGE_LABEL.inquiry, '오시는길');
  ctx.syncPageConfig({});
  assert.equal(ctx.PAGE_IDS.length, 8, '빈 객체를 넣어도 기본 8개여야 합니다');
});

test('★ 관리 대상 쪽은 «자료»에서 온다 — 코드에 박아 두지 않는다', () => {
  const ctx = cfgBox({
    work1: { label: '자문서비스', order: 1 },
    work6: { label: '중대재해 대응', order: 2 },
    inquiry: { label: '오시는길', order: 8 },
    greeting: { label: '인사말', order: 9 }
  });
  assert.deepEqual([...ctx.PAGE_IDS], ['work1', 'work6', 'inquiry', 'greeting'],
    '자료에 적힌 쪽만, 적힌 순서대로여야 합니다');
  assert.equal(ctx.PAGE_LABEL.work6, '중대재해 대응');
  assert.deepEqual([...ctx.pageIdsOf('work')], ['work1', 'work6'], '새 쪽이 주요업무에 안 들어갔습니다');
  assert.deepEqual([...ctx.pageIdsOf('inquiry')], ['inquiry']);
  assert.deepEqual([...ctx.pageIdsOf('greeting')], ['greeting']);
});

test('★ 쪽 이름 규칙을 어기면 «받지 않고» 이유를 말한다 — 자료는 그대로', async () => {
  for (const bad of ['Work6', 'work 6', 'work-6', 'work.6', '한글쪽', 'a'.repeat(31),
                     'https://example.com/work6', '../admin']) {
    const ctx = cfgBox(null);
    dlgStubs(ctx, [bad, '보일 이름']);
    await ctx.addPage();
    assert.equal(ctx.saved.length, 0, '「' + bad + '」 을(를) 자료에 적어 버렸습니다');
    assert.ok(ctx.said.length > 0, '「' + bad + '」 을(를) 조용히 무시했습니다 — 이유를 말해야 합니다');
    assert.equal(ctx.PAGE_IDS.length, 8, '거절했는데 목록이 흔들렸습니다');
  }
});

test('★ 쪽을 추가하면 자료에 적히고 목록 끝에 붙는다', async () => {
  const ctx = cfgBox(null);
  dlgStubs(ctx, ['work6', '중대재해 대응']);
  await ctx.addPage();
  assert.equal(ctx.saved.length, 1, '자료에 안 적혔습니다');
  assert.match(ctx.saved[0].path, /homepage\/config\/pages/, '엉뚱한 자리에 적었습니다');
  const cfg = plain(ctx.saved[0].value);
  assert.ok(cfg.work6, '새 쪽이 자료에 없습니다');
  assert.equal(cfg.work6.label, '중대재해 대응');
  assert.equal(Object.keys(cfg).length, 9, '기본 8개가 함께 적히지 않으면 다음에 목록이 흔들립니다');
  assert.deepEqual([...ctx.pageIdsOf('work')],
    ['work1', 'work2', 'work3', 'work4', 'work5a', 'work5b', 'work6'], '새 쪽이 끝에 안 붙었습니다');
});

test('★ 이미 있는 쪽 이름은 두 번 넣지 않는다', async () => {
  const ctx = cfgBox(null);
  dlgStubs(ctx, ['work1', '자문서비스']);
  await ctx.addPage();
  assert.equal(ctx.saved.length, 0, '같은 쪽을 또 적었습니다');
  assert.ok(ctx.said.some(m => /이미/.test(m)), '이미 있다고 말해 주지 않았습니다');
});

test('★ 보일 이름을 안 적으면 추가하지 않는다', async () => {
  const ctx = cfgBox(null);
  dlgStubs(ctx, ['work6', '   ']);
  await ctx.addPage();
  assert.equal(ctx.saved.length, 0, '이름 없는 쪽을 목록에 넣었습니다');
  assert.ok(ctx.said.length > 0, '왜 추가하지 않았는지 말하지 않았습니다');
});

test('★ 「목록에서 분리」는 홈페이지 쪽도, 우리 대조 기준 자료도 지우지 않는다', async () => {
  const ctx = cfgBox(null);
  ctx.App.pages = { work1: { text: '자문서비스 본문' } };
  await ctx.detachPage('work1');
  assert.equal(ctx.saved.length, 1, '자료에 안 적혔습니다');
  assert.match(ctx.saved[0].path, /homepage\/config\/pages/);
  assert.ok(!plain(ctx.saved[0].value).work1, '분리했는데 목록에 남아 있습니다');
  assert.ok(!ctx.saved.some(s => s.how === 'remove'),
    '무언가를 «지웠습니다» — 분리는 관리를 그만두는 것일 뿐 지우는 것이 아닙니다');
  assert.ok(ctx.App.pages.work1, '대조 기준 자료를 지웠습니다 — 다시 붙일 때 쓸 것입니다');
  assert.deepEqual([...ctx.pageIdsOf('work')], ['work2', 'work3', 'work4', 'work5a', 'work5b']);
});

test('★ 오시는길·인사말은 분리할 수 없다 — 갈래 자체가 비어 버린다', async () => {
  const ctx = cfgBox(null);
  assert.equal(ctx.canDetachPage('work1'), true);
  assert.equal(ctx.canDetachPage('inquiry'), false);
  assert.equal(ctx.canDetachPage('greeting'), false);
  await ctx.detachPage('inquiry');
  assert.equal(ctx.saved.length, 0, '갈래 자체인 쪽을 분리해 버렸습니다');
  assert.equal(ctx.PAGE_IDS.length, 8);
});

test('★ 「분리」가 홈페이지 쪽을 지우는 것이 아니라고 화면에 적는다', () => {
  const ctx = pageBox();
  ctx.App = { draft: { kind: 'page', key: 'work1', text: '가나다' }, pages: {}, dirty: false,
              pageLines: {}, pageConfig: {} };
  ctx.PAGE_LABEL = { work1: '자문서비스' };
  run(ctx, fnSource('pagePasteWhy') + '\n' + fnSource('stamp') + '\n' + fnSource('canDetachPage') + '\n'
    + fnSource('noteOneLine') + '\n' + fnSource('readPageBtn') + '\n' + fnSource('pageFrameDoc') + '\n' + fnSource('runSep') + '\n' + fnSource('runKey') + '\n' + fnSource('runOfKey') + '\n' + fnSource('pageLinesHtml') + '\n' + fnSource('pageEdit'));
  const h = ctx.pageEdit(ctx.App.draft);
  assert.match(h, /분리/, '분리하는 길이 화면에 없습니다');
  assert.match(h, /지우지 않습니다|지우는 것이 아닙니다/,
    '홈페이지 쪽을 지우는 것으로 오해할 화면입니다');
});

test('★ 화면이 허락한 새 쪽 이름은 서버 함수도 읽을 수 있다', () => {
  /* 화면과 함수가 서로 다른 규칙을 쓰면, 추가는 되는데 영영 못 읽는 쪽이 생긴다. */
  const { homepageUrl } = require('../functions/homepage-fetch');
  const ctx = cfgBox(null);
  ['work6', 'work_2026', 'safety'].forEach(good => {
    assert.equal(ctx.isPageName(good), true, '화면이 「' + good + '」 을 거절합니다');
    assert.ok(homepageUrl(good), '함수가 「' + good + '」 을 거절합니다');
  });
  ['Work6', 'work 6', 'work-6', '../admin'].forEach(bad => {
    assert.equal(ctx.isPageName(bad), false, '화면이 「' + bad + '」 을 받아 줍니다');
    assert.equal(homepageUrl(bad), null, '함수가 「' + bad + '」 을 받아 줍니다');
  });
  // 관리자 주소는 이름 규칙을 통과해도 함수가 막는다 — 화면이 넣어도 못 읽을 뿐 자료는 안 망가진다
  assert.equal(homepageUrl('admin'), null);
});

test('★ 홈페이지에서 못 읽은 쪽은 목록에 그렇게 적힌다 (자료는 멀쩡하다)', () => {
  const ctx = cfgBox(null);
  ctx.App.group = 'work';
  ctx.App.pages = {};
  ctx.App.check = { pages: { work1: { status: 'unknown', reason: '홈페이지를 읽지 못함' } } };
  const h = ctx.listHtml();
  assert.match(h, /못 읽/, '못 읽은 쪽인지 알 수 없습니다');
  assert.ok(h.indexOf('자문서비스') >= 0, '못 읽었다고 목록에서 사라지면 안 됩니다');
});

/* ══════ ③-보강: 「쪽 목록」을 «못 읽은» 채로 추가·분리하면 사장님 설정을 덮어쓴다 ══════
   실제로 재현된 상황: 자료에는 work1,work2,work4,work5a,work5b,inquiry,greeting,work6
   (사장님이 work3 를 분리하고 work6 를 추가해 둔 상태)이 있는데, 「쪽 목록」 읽기만 실패하면
   loadAll() 이 그 실패를 기본 8쪽과 갈라 보지 않아 addPage/detachPage 가 기본 8쪽 위에
   set() 을 해 버렸다 — work6 가 사라지고 work3 분리도 없던 일이 됐는데 화면은
   「…목록에 넣었습니다」라고 성공했다고 말했다. loadAll() 을 «실제로 돌려서» 확인한다. */
function loadAllBox(dbRef) {
  const ctx = box();
  ctx.saved = [];
  ctx.said = [];
  ctx.db = { ref: p => (dbRef ? dbRef(p, ctx) : { once: () => Promise.resolve({ val: () => null }) }) };
  dlgStubs(ctx);
  ctx.toast = m => { ctx.said.push(String(m)); };
  ctx.App = {
    group: 'members', pick: '', me: null, myName: '', isAdmin: null,
    members: {}, pages: {}, staff: null, staffErr: '', lineFormat: 'plain',
    pageConfig: {}, pageLines: {}, pageConfigUnread: false,
    dataErr: '', saveErr: '', check: null, loading: true, draft: null, dirty: false,
    render() {}
  };
  run(ctx, constSource('PAGE_IDS') + '\n' + fnSource('dataErrText') + '\n'
    + fnSource('readRosterAt') + '\n' + fnSource('readRosterSource') + '\n'
    + fnSource('staffFromRoster') + '\n' + fnSource('isPageName') + '\n'
    + fnSource('syncPageConfig') + '\n' + fnSource('savePageConfig') + '\n'
    + fnSource('refuseIfPageConfigUnread') + '\n' + fnSource('addPage') + '\n'
    + fnSource('canDetachPage') + '\n' + fnSource('detachPage') + '\n'
    + fnSource('pageIdsOf') + '\n' + fnSource('todayString') + '\n'
    + fnSource('keptOf') + '\n' + fnSource('rosterMarkOf') + '\n'
    + fnSource('memberRows') + '\n' + fnSource('pageRows') + '\n'
    + fnSource('rowsOf') + '\n' + fnSource('firstPickOf') + '\n' + noConst(constLine('MEMBER_KINDS')) + '\n' + fnSource('memberKind') + '\n' + fnSource('loadDraft') + '\n'
    /* 자문사현황도 같은 자리에서 읽는다(업체관리·표시) — 그 부품이 없으면 loadAll 이 터진다 */
    + noConst(constLine('PARTNER_PATH')) + '\n' + noConst(constLine('PARTNER_LOGO_PATH')) + '\n' + fnSource('companiesFrom') + '\n'
    + fnSource('partnerMark') + '\n' + noConst(constLine('POSTED_TEXT')) + '\n'
    + fnSource('postedOf') + '\n' + fnSource('partnerRows') + '\n'
    + fnSource('loadAll') + '\n'
    + expose('PAGE_IDS') + expose('PAGE_LABEL') + expose('DEFAULT_PAGES'));
  return ctx;
}

test('★ 「쪽 목록」읽기가 실패하면(자료가 없는 게 아니라 못 읽은 것) App 에 남는다', async () => {
  const ctx = loadAllBox((p) => {
    if (p === 'homepage/config/pages') return { once: () => Promise.reject({ code: 'PERMISSION_DENIED' }) };
    return { once: () => Promise.resolve({ val: () => null }) };
  });
  await ctx.loadAll();
  assert.equal(ctx.App.pageConfigUnread, true,
    '읽기가 실패했는데 「못 읽음」이 App 에 안 남았습니다');
  assert.match(ctx.App.dataErr, /쪽 목록/, '못 읽은 자리(쪽 목록)가 안내에 빠졌습니다');
});

test('★ 「쪽 목록」을 못 읽은 채로는 「＋ 쪽 추가」가 거절되고 이유를 말한다 — 저장하지 않는다', async () => {
  const ctx = loadAllBox((p) => {
    if (p === 'homepage/config/pages') return { once: () => Promise.reject({ code: 'PERMISSION_DENIED' }) };
    return { once: () => Promise.resolve({ val: () => null }) };
  });
  await ctx.loadAll();
  assert.equal(ctx.App.pageConfigUnread, true);

  dlgStubs(ctx, ['work6', '중대재해 대응']);
  await ctx.addPage();
  assert.equal(ctx.saved.length, 0,
    '못 읽은 채로 「＋ 쪽 추가」가 자료를 덮어썼습니다 — 사장님이 저장해 둔 목록이 지워집니다');
  assert.ok(ctx.said.some(m => /못 읽/.test(m)), '왜 추가하지 않았는지 말하지 않았습니다');
});

test('★ 「쪽 목록」을 못 읽은 채로는 「목록에서 분리」도 거절된다 — 저장하지 않는다', async () => {
  const ctx = loadAllBox((p) => {
    if (p === 'homepage/config/pages') return { once: () => Promise.reject({ code: 'PERMISSION_DENIED' }) };
    return { once: () => Promise.resolve({ val: () => null }) };
  });
  await ctx.loadAll();
  await ctx.detachPage('work1');
  assert.equal(ctx.saved.length, 0,
    '못 읽은 채로 「목록에서 분리」가 자료를 덮어썼습니다');
  assert.ok(ctx.said.some(m => /못 읽/.test(m)), '왜 분리하지 않았는지 말하지 않았습니다');
});

test('★ 「쪽 목록」을 «정상적으로» 읽으면(자료가 있든 없든) 추가·분리를 그대로 허용한다', async () => {
  const ctx = loadAllBox((p, c) => {
    if (p === 'homepage/config/pages') {
      return {
        once: () => Promise.resolve({ val: () => ({ work1: { label: '자문서비스', order: 1 } }) }),
        set: v => { c.saved.push({ path: p, value: v }); return Promise.resolve(); }
      };
    }
    return { once: () => Promise.resolve({ val: () => null }) };
  });
  await ctx.loadAll();
  assert.equal(ctx.App.pageConfigUnread, false, '정상 읽기인데 못 읽음으로 남았습니다');

  dlgStubs(ctx, ['work6', '중대재해 대응']);
  await ctx.addPage();
  assert.equal(ctx.saved.length, 1, '정상 읽기인데도 추가가 막혔습니다');
});

/* ══════ ④ 퇴사자 예외와 「명부에 없음」 보이기 ══════ */

function keepBox(member) {
  const ctx = box();
  ctx.esc = escStub();
  ctx.saved = [];
  ctx.said = [];
  ctx.hist = [];
  ctx.db = {
    ref: p => ({
      set: v => {
        (/history/.test(p) ? ctx.hist : ctx.saved).push({ path: p, value: v });
        return Promise.resolve();
      },
      once: () => Promise.resolve({ val: () => (/members\//.test(p) ? member : null) })
    })
  };
  dlgStubs(ctx);
  ctx.toast = m => { ctx.said.push(String(m)); };
  ctx.App = {
    group: 'members', pick: '190', members: { '190': member }, pages: {}, check: null,
    staff: null, dirty: false, lineFormat: 'plain', myName: '관리자', me: { email: 'a@b.c' },
    draft: null, render() {}
  };
  run(ctx, fnSource('todayString') + '\n' + fnSource('currentUserName') + '\n'
    + fnSource('histStamp') + '\n' + fnSource('saveRecord') + '\n'
    + fnSource('writeKeepOnSite') + '\n' + fnSource('keepOnSiteAsk') + '\n'
    + fnSource('keepOnSiteClear') + '\n' + noConst(constLine('MEMBER_KINDS')) + '\n' + fnSource('memberKind') + '\n'
    /* 「홈페이지에 안 올림」 — loadDraft·saveDraft 가 둘 다 이것을 지난다 (2026-09-03) */
    + fnSource('offSiteOf') + '\n' + fnSource('loadDraft') + '\n'
    + fnSource('markChanged') + '\n' + noConst(constLine('MEMBER_KINDS')) + '\n' + fnSource('memberKind') + '\n' + fnSource('saveDraft'));
  ctx.loadDraft();
  return ctx;
}

test('★ 사유를 안 적으면 「홈페이지에 남기기」로 두지 않는다', async () => {
  const ctx = keepBox({ name: '장한돌', position1: '세종지사장', position2: '공인노무사',
                        srl: '320', careers: [] });
  dlgStubs(ctx, ['   ']);
  await ctx.keepOnSiteAsk();
  assert.equal(ctx.saved.length, 0, '사유 없이 예외가 저장됐습니다 — 왜 남겼는지 알 수 없어집니다');
  assert.ok(ctx.said.some(m => /사유/.test(m)), '사유가 필요하다고 말해 주지 않았습니다');
});

test('★ 사유를 적으면 사유·누가·언제가 함께 남는다', async () => {
  const ctx = keepBox({ name: '장한돌', position1: '세종지사장', position2: '공인노무사',
                        srl: '320', careers: [] });
  dlgStubs(ctx, ['세종지사장 — 고용관계가 아니어서 급여 명부에는 퇴사로 찍힙니다']);
  await ctx.keepOnSiteAsk();
  assert.equal(ctx.saved.length, 1, '예외가 저장되지 않았습니다');
  const rec = plain(ctx.saved[0].value);
  assert.match(rec.keepOnSite.why, /세종지사장/, '사유 원문이 안 남았습니다');
  assert.ok(rec.keepOnSite.by, '누가 표시했는지 안 남았습니다');
  assert.ok(rec.keepOnSite.at, '언제 표시했는지 안 남았습니다');
  assert.equal(rec.name, '장한돌', '예외를 다는 사이 다른 내용이 사라졌습니다');
});

test('★ 예외를 «풀 수» 있다 — 풀면 다시 퇴사 판정을 받는다', async () => {
  const 남긴사람 = { name: '장한돌', position1: '세종지사장', position2: '공인노무사', srl: '320',
                    careers: [], keepOnSite: { at: '2026-08-17', by: '관리자', why: '지사장' } };
  const ctx = keepBox(남긴사람);
  await ctx.keepOnSiteClear();
  assert.equal(ctx.saved.length, 1, '예외를 풀 길이 없습니다');
  const rec = plain(ctx.saved[0].value);
  assert.ok(!rec.keepOnSite, '풀었는데 표시가 남아 있습니다');
  assert.equal(rec.name, '장한돌');

  // 부품을 돌려서: 예외가 사라지면 퇴사 딱지가 다시 붙는다
  const live = [{ srl: '320', name: '장한돌', position1: '세종지사장', position2: '공인노무사', careers: [] }];
  const staff = [{ name: '장한돌', leftAt: '2023-12-31' }];
  const 전 = ctx.PuHomeDiff.memberStatus([Object.assign({ key: '320' }, 남긴사람)], live, staff, '2026-08-17')[0];
  const 후 = ctx.PuHomeDiff.memberStatus([Object.assign({ key: '320' }, rec)], live, staff, '2026-08-17')[0];
  assert.notEqual(전.status, 'toRemove', '예외가 있는데도 퇴사 딱지가 붙었습니다');
  assert.equal(후.status, 'toRemove', '예외를 풀었는데 퇴사 판정을 다시 안 받습니다');
});

test('★ 경력을 고쳐 저장해도 「남기기」 표시가 지워지지 않는다', async () => {
  const ctx = keepBox({ name: '장한돌', position1: '세종지사장', position2: '공인노무사', srl: '320',
                        careers: ['現 가'], keepOnSite: { at: '2026-08-17', by: '관리자', why: '지사장' } });
  ctx.App.draft.careers.push('現 나');
  await ctx.saveDraft();
  assert.equal(ctx.saved.length, 1);
  const rec = plain(ctx.saved[0].value);
  assert.ok(rec.keepOnSite, '저장 한 번에 예외가 조용히 사라졌습니다 — 퇴사 경고가 다시 쏟아집니다');
  assert.match(rec.keepOnSite.why, /지사장/);
  assert.equal(rec.careers.length, 2, '고친 내용이 저장되지 않았습니다');
});

test('★ 되돌리기도 「남기기」 표시를 지우지 않는다', async () => {
  const 지금 = { name: '장한돌', position1: '세종지사장', position2: '공인노무사', srl: '320',
                careers: ['現 가', '現 나'], keepOnSite: { at: '2026-08-17', by: '관리자', why: '지사장' } };
  const ctx = keepBox(지금);
  ctx.closeModal = () => {};
  ctx.db = {
    ref: p => ({
      set: v => { (/history/.test(p) ? ctx.hist : ctx.saved).push({ path: p, value: v }); return Promise.resolve(); },
      once: () => Promise.resolve({
        val: () => (/history/.test(p)
          ? { name: '장한돌', position1: '세종지사장', position2: '공인노무사', srl: '320', careers: ['現 가'] }
          : 지금)
      })
    })
  };
  run(ctx, fnSource('todayString') + '\n' + fnSource('currentUserName') + '\n' + fnSource('histStamp') + '\n'
    + fnSource('saveRecord') + '\n' + noConst(constLine('MEMBER_KINDS')) + '\n' + fnSource('memberKind') + '\n' + fnSource('loadDraft') + '\n' + fnSource('markChanged') + '\n'
    + fnSource('restoreFrom'));
  await ctx.restoreFrom('320', '1755300000000-aaaaaa');
  assert.equal(ctx.saved.length, 1, '되살리지 못했습니다');
  const rec = plain(ctx.saved[0].value);
  assert.equal(rec.careers.length, 1, '옛 내용으로 되살아나지 않았습니다');
  assert.ok(rec.keepOnSite, '되돌리기 한 번에 예외가 사라졌습니다');
});

test('★ 목록에 「남김」 표시와 사유가 보인다 — 왜 퇴사 경고가 없는지 알 수 있다', () => {
  const ctx = cfgBox(null);
  ctx.App.group = 'members';
  ctx.App.members = {
    '320': { name: '장한돌', position1: '세종지사장', position2: '공인노무사',
             keepOnSite: { at: '2026-08-17', by: '관리자', why: '세종지사장 — 고용관계 아님' } },
    '322': { name: '조현범', position1: '대전지사장', position2: '공인노무사' }
  };
  ctx.App.check = {
    members: {
      '320': { name: '장한돌', status: 'same', reason: '홈페이지에 남기기로 함 (세종지사장 — 고용관계 아님)' },
      '322': { name: '조현범', status: 'same', reason: '명부에 없어 입·퇴사 판단을 못함' }
    }
  };
  const h = ctx.listHtml();
  assert.match(h, /남김/, '「남김」 표시가 없어 왜 퇴사 경고가 없는지 알 수 없습니다');
  assert.ok(h.indexOf('세종지사장 — 고용관계 아님') >= 0, '남긴 사유가 목록에 안 보입니다');
  assert.ok(h.indexOf('명부에 없어 입·퇴사 판단을 못함') >= 0,
    '명부에 없다는 사유를 그대로 보여 주지 않습니다');
});

test('★ 편집 화면에 「남기기」 상태와 사유가 보이고, 풀 수 있는 길이 있다', () => {
  const ctx = box();
  ctx.esc = escStub();
  const kept = { at: '2026-08-17', by: '관리자', why: '세종지사장 — 고용관계 아님' };
  ctx.App = {
    draft: { kind: 'member', key: '320', name: '장한돌', position1: '세종지사장', position2: '공인노무사',
             intro: '', srl: '320', careers: ['現 가'] },
    members: { '320': { name: '장한돌', srl: '320', keepOnSite: kept } },
    staff: null, check: null, lineFormat: 'plain', dirty: false
  };
  run(ctx, fnSource('todayString') + '\n' + fnSource('keptOf') + '\n' + fnSource('rosterMarkOf') + '\n'
    + fnSource('memberBandHtml') + '\n'
    + fnSource('riskReport') + '\n' + fnSource('srlConflict') + '\n' + fnSource('stamp') + '\n'
    + noConst(constLine('MEMBER_KINDS')) + '\n' + fnSource('memberKind') + '\n' + fnSource('memberEdit'));
  const h = ctx.memberEdit(ctx.App.draft);
  assert.ok(h.indexOf('세종지사장 — 고용관계 아님') >= 0, '남긴 사유가 편집 화면에 없습니다');
  /* ⚠ 2026-09-06 이름이 바뀌었다 — 「홈페이지에 남기기」 → 「퇴사 경고 끄기 (사유 남김)」.
     옛 이름은 이름줄의 「새 홈페이지에 넣기/빼기」와 헷갈렸다: 둘 다 「올리냐 마냐」로
     보이는데 하나는 «새» 홈페이지 이야기, 이것은 «지금» 홈페이지의 퇴사 경고 이야기다.
     ★ 이름을 박지 말고 «켜고 끌 길이 둘 다 있는가»를 본다. */
  assert.match(h, /keepOnSiteClear\(\)/, '★ 표시를 되돌릴 길이 없습니다');

  // 표시가 없는 사람에게는 «표시할» 길이 있다
  ctx.App.members['320'] = { name: '장한돌', srl: '320' };
  assert.match(ctx.memberEdit(ctx.App.draft), /keepOnSiteAsk\(\)/,
    '★ 퇴사 경고를 끌 길이 없습니다');
});

/* ══════════════════════════════════════════════════════════════════════════
   3차 설계 (docs/superpowers/specs/2026-08-17-홈페이지-관리-3차-design.md)
   목업 docs/mockups/homepage-manage-v4.html
   ① 브라우저 기본 창을 화면 안 창으로  ② 흔들리지 않는 붙박이 틀
   ③ 퇴사 정보를 「확인 전」에도 보이기
   ══════════════════════════════════════════════════════════════════════════ */

/* ══════ ① 브라우저 기본 창을 쓰지 않는다 ══════
   사유를 브라우저 기본 입력창으로 받았더니 «앱으로 설치해 쓰는 창»에서 차단돼
   「홈페이지에 남기기」가 눌러도 아무 일이 없었다(2026-08-17). 오류도 안 떠서
   「클릭이 안 된다」로 보였다. 되풀이되면 안 되는 사고라 검사로 못 박는다. */

test('★ 브라우저 기본 창을 하나도 쓰지 않는다', () => {
  const 기본창 = [...html.matchAll(/(?:\bwindow\s*\.\s*)?\b(?:prompt|confirm|alert)\s*\(/g)]
    .map(m => m[0].replace(/\s+/g, ''));
  assert.deepEqual(기본창, [],
    '브라우저 기본 창을 부르고 있습니다 — 앱으로 설치해 쓰는 창에서는 차단되어 눌러도 '
    + '아무 일이 없고 오류도 안 뜹니다(2026-08-17 「홈페이지에 남기기」 사고). '
    + '화면 안 창으로 바꾸십시오: ' + 기본창.join(', '));
});

/* 화면 안 창을 «실제로 돌려» 본다 — 가짜 DOM 을 주고 단추를 눌러 확인한다.
   모양(HTML)은 견주지 않는다. 「물으면 답이 돌아오는가」만 본다. */
function dlgBox() {
  const ctx = box();
  ctx.esc = escStub();
  ctx.els = {};
  ['dlg', 'dlgCard', 'dlgText'].forEach(id => {
    const e = { on: false, innerHTML: '', value: '' };
    e.classList = { add() { e.on = true; }, remove() { e.on = false; } };
    ctx.els[id] = e;
  });
  ctx.$ = id => ctx.els[id] || null;
  run(ctx, constLine('Dlg') + '\n' + fnSource('dlgEnd') + '\n' + fnSource('dlgShow') + '\n'
    + fnSource('dlgOk') + '\n' + fnSource('dlgCancel') + '\n' + fnSource('dlgTextOk') + '\n'
    + fnSource('say') + '\n' + fnSource('askYes') + '\n' + fnSource('askText'));
  return ctx;
}

test('★ 「예·아니오」를 화면 안 창으로 묻는다 — 그만두기는 «아니오»다', async () => {
  const ctx = dlgBox();
  const p = ctx.askYes('물음', '몸말', '예');
  assert.equal(ctx.els.dlg.on, true, '화면 안 창이 안 떴습니다');
  ctx.dlgCancel();
  assert.equal(await p, false, '그만두었는데 「예」로 봤습니다');
  assert.equal(ctx.els.dlg.on, false, '창이 닫히지 않았습니다');

  const q = ctx.askYes('물음');
  ctx.dlgOk();
  assert.equal(await q, true);
});

test('★ 사유 입력칸은 «빈 값»과 «그만두기»를 갈라 돌려준다', async () => {
  const ctx = dlgBox();
  ctx.els.dlgText.value = '   ';
  const p = ctx.askText('사유', '몸말');
  ctx.dlgTextOk();
  assert.equal(await p, '   ', '적은 글자를 그대로 돌려주지 않습니다');

  const q = ctx.askText('사유');
  ctx.dlgCancel();
  assert.equal(await q, null,
    '그만두기가 빈 값과 구별되지 않습니다 — 왜 저장하지 않았는지 할 말이 달라집니다');
});

test('★ 알림도 화면 안에서 보여주고, 확인을 누르면 끝난다', async () => {
  const ctx = dlgBox();
  let 끝났나 = false;
  ctx.say('알림', '몸말').then(() => { 끝났나 = true; });
  assert.equal(ctx.els.dlg.on, true, '알림이 화면 안 창으로 안 떴습니다');
  ctx.dlgOk();
  await tick();
  assert.equal(끝났나, true, '확인을 눌러도 끝나지 않습니다 — 부른 쪽이 영원히 기다립니다');
  assert.equal(ctx.els.dlg.on, false);
});

test('★ 창이 겹쳐도 앞선 물음이 영원히 안 끝나는 일이 없다', async () => {
  const ctx = dlgBox();
  const 첫째 = ctx.askYes('첫 물음');
  const 둘째 = ctx.askYes('둘째 물음');
  assert.equal(await 첫째, false, '앞선 창이 답 없이 버려졌습니다 — 누른 사람이 영원히 기다립니다');
  ctx.dlgOk();
  assert.equal(await 둘째, true);
});

/* 창을 바꿔도 「사유를 반드시」(2차 설계 §4)는 그대로다 — 실제로 함수를 돌려서 본다 */
test('★ 화면 안 창에서 사유가 비면 예외를 저장하지 않고 왜 안 했는지 말한다', async () => {
  for (const 답 of ['', '   ', '\n\t ']) {
    const ctx = keepBox({ name: '장한돌', position1: '세종지사장', position2: '공인노무사',
                          srl: '320', careers: [] });
    dlgStubs(ctx, [답]);
    await ctx.keepOnSiteAsk();
    assert.equal(ctx.saved.length, 0,
      '사유가 빈 채로 예외가 저장됐습니다 — 나중에 왜 남겼는지 알 수 없어집니다');
    assert.ok(ctx.said.some(m => /사유/.test(m)), '사유가 필요하다고 말해 주지 않았습니다');
  }
});

test('★ 사유 창을 «그만두면» 저장도 안 하고 잔소리도 안 한다', async () => {
  const ctx = keepBox({ name: '장한돌', srl: '320', careers: [] });
  dlgStubs(ctx, []);          // 답이 없으면 «그만두기»(null)
  await ctx.keepOnSiteAsk();
  assert.equal(ctx.saved.length, 0);
  assert.equal(ctx.said.length, 0, '사장님이 스스로 그만둔 것인데 잔소리를 했습니다');
});

/* ══════ ② 흔들리지 않는 붙박이 틀 ══════
   ★ 높이·너비 «값»을 못 박지 않는다. 「한도가 있는가·제 몸 안에서 구르는가」만 본다. */

/* <style> 안쪽만 본다 — 안내 문구에 적힌 글자에 걸리지 않게 */
const css = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m => m[1]).join('\n');

test('★ 페이지 자체가 굴러가지 않는다 (흔들림의 뿌리)', () => {
  // «.body» 가 아니라 «body» 규칙이어야 한다 — 점 하나 차이로 뜻이 정반대다
  assert.match(css, /(?:^|[\s,;}])body\s*\{[^}]*overflow\s*:\s*hidden/,
    '몸통이 창에 안 묶여 있습니다 — 고르는 대상이 바뀔 때마다 페이지 길이가 늘었다 줄었다 합니다');
});

test('★ 목록과 편집칸이 «각각 제 몸 안에서» 구른다', () => {
  // 목록 안의 구르는 칸과 편집칸 안의 구르는 칸이 «따로» 있어야 한다.
  // 하나뿐이면 목록을 굴릴 때 편집칸이 함께 움직인다.
  const 구르는칸 = [...css.matchAll(/\.(sc|esc)\s*\{[^}]*overflow-y\s*:\s*auto/g)].map(m => m[1]);
  assert.ok(구르는칸.indexOf('sc') >= 0, '목록이 제 몸 안에서 구르지 않습니다');
  assert.ok(구르는칸.indexOf('esc') >= 0, '편집칸 가운데가 제 몸 안에서 구르지 않습니다');
});

test('★ 목록 줄 높이에 한도가 있다 — 딱지가 둘이어도 줄이 안 밀린다', () => {
  assert.match(css, /\.r\s*\{[^}]*min-height\s*:\s*\d+(?:\.\d+)?px/,
    '목록 줄 높이에 한도가 없습니다 — 딱지가 하나인 줄과 둘인 줄의 높이가 달라집니다');
});

test('★ 머리띠와 갈래 탭이 위에 붙어 있다', () => {
  assert.match(css, /position\s*:\s*sticky/, '굴리면 머리띠와 갈래가 사라집니다');
});

/* 4차 지시 — 갈래를 «탭»에서 «대시보드 카드»로 바꿨다. 지킬 것은 배치 이름이 아니라
   ① 다섯 갈래를 다 고를 수 있는가 ② 카드가 우리 자료 경고와 대조 결과를 «갈라» 적는가
   ③ 확인 전에 「이상 없음」처럼 보이지 않는가 다. 픅셀·마크업은 못 박지 않는다. */
test('★ 갈래는 대시보드 카드로 고른다 — 카드가 우리 자료와 대조 결과를 갈라 적는다', () => {
  const ctx = box();
  ctx.esc = escStub();
  ctx.App = { group: 'members', check: null, staff: [{ name: '나간사람', leftAt: '2026-06-30', left: true }],
    members: { '190': { name: '나간사람', srl: '190' } }, pages: {}, pageConfig: {} };
  // constSource('PAGE_IDS') 는 GROUPS 까지 함께 떼어 온다 (PAGE_IDS 가 한 줄짜리라
  // 다음 「\n];」까지 물려 온다) — rowDeps 와 겹쳐도 var 로 눕혀 두었으니 괜찮다.
  run(ctx, noConst(constSource('PAGE_IDS')) + '\n' + rowDeps());
  const h = ctx.dashHtml();
  ['구성원 소개', '주요업무', '오시는길', '인사말'].forEach(label =>
    assert.ok(h.indexOf(label) >= 0, '갈래 「' + label + '」 을 고를 수 없습니다'));
  assert.match(h, /App\.go\(/, '카드를 눌러도 옮겨갈 수 없습니다');
  assert.ok(h.indexOf('자문사현황') >= 0, '자문사현황 자리가 없습니다');

  /* ★ 확인을 안 눌렀고 손댈 것도 없으면 «대조 안 함»이라고 적어야 한다.
     이것을 「이상 없음」으로 적으면 안 본 것이 깨끗한 것으로 읽힌다. */
  assert.ok(h.indexOf('대조 안 함') >= 0, '확인 전인데 그 사실을 안 적었습니다');
  assert.ok(h.indexOf('이상 없음') < 0 || h.indexOf('대조 안 함') >= 0,
    '확인 전에 「이상 없음」이라고 적었습니다');
  /* ★ 명부만 보고 아는 것도 확인 전에 카드에 반영된다 — 나간사람이 명부상 퇴사라
     구성원 카드는 «할 일»이 있다고 적어야 한다(5차 지시로 세부는 목록으로 옮겼다). */
  assert.match(h, /할 일/, '명부상 퇴사자가 있는데 확인 전 카드가 조용합니다');

  // 목록 칸이 예전(268~290px)보다 넓어졌는지 — 값을 박지 않고 «더 넓어졌는가»만 본다
  const m = /\.list\s*\{[^}]*width\s*:\s*(\d+)px/.exec(css);
  assert.ok(m, '목록 칸 너비가 정해져 있지 않습니다');
  assert.ok(Number(m[1]) >= 340,
    '목록 칸이 3차·4차 지시(268 → 390px)만큼 넓어지지 않았습니다: ' + m[1] + 'px');
  // 4차 지시 — 폭을 묶어 두면 넓은 화면에서 양옆이 통째로 남는다
  assert.ok(!/main\s*\{[^}]*max-width/.test(css),
    'main 에 max-width 가 남아 있습니다 — 화면 전체를 쓰라는 지시입니다');
});

/* ══════ 「남김」과 대조 딱지 (6차 검토에서 나온 것) ══════
   실제 화면이 «같은 것»을 두고 카드에는 「할 일 2」, 할 일 칸에는 「3명」이라고 적고 있었다.
   원인: 남기기 예외를 표시해도 그 사람의 «지난» 대조 딱지(내릴 것)가 그대로 남아,
   카드(남김을 아는 셈)와 할 일 목록(딱지만 보는 셈)이 서로 다른 답을 냈다. */
test('★ 「남김」인데 「내릴 것」이 남아 있으면 지난 딱지로 보고 「확인 전」으로 되돌린다', () => {
  const ctx = rosterBox([{ name: '장한돌', leftAt: '2023-12-31' }], {
    at: 1, members: { '140': { name: '장한돌', status: 'toRemove', reason: '명부 퇴사' } },
    pages: {}, duplicates: [], leftovers: {}
  });
  ctx.App.members = { '140': { name: '장한돌',
    keepOnSite: { at: '2026-08-18', by: '권형하', why: '세종지사장 — 고용관계 아님' } } };
  ctx.App.pages = {}; ctx.App.pageConfig = {};
  const r = plain(ctx.memberRows())[0];
  /* 부품은 남기기 예외가 있으면 toRemove 를 내지 않는다 — 함께 있으면 지난 딱지다 */
  assert.equal(r.status, '', '「남김」인데 「내릴 것」 딱지를 그대로 믿었습니다');
  assert.match(r.reason, /확인 전/, '왜 딱지가 사라졌는지 안 적었습니다');
  assert.equal(r.kept, true, '「남김」 표시가 사라졌습니다');
  /* 카드와 할 일이 «같은 수»를 말해야 한다 */
  assert.equal(ctx.statOf('members').hot, 0, '남긴 사람이 카드의 할 일로 남았습니다');
  const 남은줄 = ctx.rowsWith(x => x.status === 'toRemove');
  assert.equal(남은줄.length, 0, '할 일 목록이 남긴 사람을 「내릴 것」으로 셌습니다');
});

test('★ 「남김」은 퇴사 판정만 면제한다 — 내용이 안 올라갔으면 할 일이다', () => {
  /* 편집칸 안내도 「내용 대조만 합니다」라고 적혀 있다. 남김을 먼저 보면 남긴 사람의
     경력을 고쳐 「안 올라감」이 되어도 카드가 조용해, 안 올린 글을 올린 줄 알게 된다. */
  const ctx = rosterBox([{ name: '장한돌', leftAt: '2023-12-31' }], {
    at: 1, members: { '140': { name: '장한돌', status: 'pending', reason: '고친 뒤 확인 전' } },
    pages: {}, duplicates: [], leftovers: {}
  });
  ctx.App.members = { '140': { name: '장한돌',
    keepOnSite: { at: '2026-08-18', by: '권형하', why: '세종지사장' } } };
  ctx.App.pages = {}; ctx.App.pageConfig = {};
  const r = plain(ctx.memberRows())[0];
  assert.equal(r.status, 'pending', '「안 올라감」 딱지가 사라졌습니다');
  assert.equal(ctx.needsAttentionRow(r), true, '남긴 사람이라고 「안 올라감」을 넘겼습니다');
  assert.equal(ctx.statOf('members').hot, 1, '카드가 조용합니다 — 안 올린 글을 올린 줄 압니다');
});

test('★ 「손댈 것」 딱지에 적힌 수와 눌러서 나온 줄 수가 같다', () => {
  /* 딱지에 3 이라 적혀 있는데 눌러 보니 5줄이면 어느 쪽이 맞는지 알 수 없다.
     ★ 겹쳐 세지 않는 것까지 함께 지킨다 — 박성수처럼 «명부 퇴사»이면서 «홈페이지에도
       남은» 사람은 한 사람이다. ③+④ 를 더하면 두 번 세어져 딱지와 줄 수가 어긋난다. */
  const ctx = rosterBox([
    { name: '박성수', leftAt: '2026-06-30', left: true },
    { name: '임혜미', leftAt: '2026-05-22', left: true }
  ], {
    at: 1, duplicates: [], leftovers: {},
    members: { '193': { name: '박성수', status: 'toRemove' },
               '281': { name: '임혜미', status: 'done' },
               '322': { name: '조현범', status: 'same' } },
    pages: {}
  });
  ctx.App.members = { '193': { name: '박성수' }, '281': { name: '임혜미' }, '322': { name: '조현범' } };

  const s = ctx.statOf('members');
  ctx.App.filter = 'todo';
  assert.equal(ctx.visibleRows('members').length, s.hot,
    '딱지에 적힌 「손댈 것」 수와 걸러 나온 줄 수가 다릅니다');
  ctx.App.filter = '';

  /* 퇴사 처리를 «끝낸» 사람(내려감)은 손댈 것이 아니다 */
  ctx.App.filter = 'todo';
  const 이름들 = ctx.visibleRows('members').map(r => r.name);
  ctx.App.filter = '';
  assert.ok(이름들.indexOf('임혜미') < 0, '내려간 사람이 아직 손댈 것으로 남습니다');
  assert.ok(이름들.indexOf('박성수') >= 0, '홈페이지에 남은 퇴사자가 손댈 것에서 빠졌습니다');
  assert.equal(s.hot, 2, '박성수(퇴사+홈페이지에 남음)를 두 번 셌거나 조현범을 빠뜨렸습니다');
});

/* ══════ 딱지 이름 (5차에서 고친 버그) ══════
   ★ 카드에 「none 1」이 그대로 찍혀 있었다. 명부 딱지의 실제 이름이 none·dup 인데
     화면이 다른 이름으로 적어 두어, 이름을 못 찾아 «열쇠 글자»가 나온 것이다.
     그 바람에 「명부에 없음」이 할 일에도 안 잡혔다. 같은 실수가 다시 나지 않게 못 박는다. */
test('★ 명부 딱지의 모든 종류에 한국어 이름이 있다 — 열쇠 글자가 화면에 찍히지 않는다', () => {
  const ctx = box();
  run(ctx, noConst(constLine('OWN_LABEL')) + '\n' + noConst(constLine('OWN_CLS'))
    + '\n' + expose('OWN_LABEL') + expose('OWN_CLS'));
  const today = '2026-08-23';
  /* 부품이 실제로 돌려주는 kind 를 «돌려서» 모은다 — 손으로 적으면 또 어긋난다 */
  const kinds = [
    ctx.PuHomeDiff.rosterMark('없는사람', [{ name: '다른사람', leftAt: '', left: false }], today),
    ctx.PuHomeDiff.rosterMark('겹친이름', [{ name: '겹친이름', leftAt: '', left: false },
                                         { name: '겹친이름', leftAt: '', left: false }], today),
    ctx.PuHomeDiff.rosterMark('나간사람', [{ name: '나간사람', leftAt: '2026-06-30', left: true }], today)
  ].filter(Boolean).map(m => m.kind);
  assert.ok(kinds.length >= 3, '명부 딱지 종류를 다 못 만들었습니다: ' + kinds.join(','));
  const labels = plain(ctx.OWN_LABEL), cls = plain(ctx.OWN_CLS);
  kinds.forEach(k => {
    assert.ok(labels[k], '명부 딱지 「' + k + '」 에 한국어 이름이 없습니다 — 화면에 열쇠 글자가 찍힙니다');
    assert.ok(cls[k], '명부 딱지 「' + k + '」 에 색이 없습니다');
    assert.ok(!/^[a-z]+$/.test(labels[k]), '「' + k + '」 의 이름이 아직 영문 열쇠입니다: ' + labels[k]);
  });
});

test('★ 명부에 없는 사람도 할 일에 잡힌다 — 목록에만 보이고 할 일에서 빠지지 않는다', () => {
  const ctx = rosterBox([{ name: '권형하', leftAt: '' }], null);   // 조현범은 명부에 없다
  ctx.App.members = { '190': { name: '권형하' }, '322': { name: '조현범' } };
  ctx.App.pages = {}; ctx.App.pageConfig = {}; ctx.App.checking = false;
  ctx.App.dataErr = ''; ctx.App.staffErr = ''; ctx.App.saveErr = ''; ctx.App.checkMsg = '';
  ctx.App.companiesErr = ''; ctx.App.companies = []; ctx.App.partners = {};
  run(ctx, fnSource('rowsWith') + '\n' + fnSource('someNames') + '\n' + fnSource('seeBtns') + '\n'
    + fnSource('leftoverGoBtns') + '\n' + fnSource('jobCard') + '\n' + fnSource('jobsOf') + '\n'
    + fnSource('bannersHtml') + '\n' + fnSource('todoCount'));
  const 목록 = ctx.rowsHtml();
  assert.match(목록, /명부에 없음/, '목록에 「명부에 없음」이 안 붙었습니다');
  const 할일 = ctx.bannersHtml();
  assert.match(할일, /명부에 없는 사람/, '목록에는 보이는데 할 일에서 빠졌습니다');
  assert.ok(ctx.todoCount() > 0, '할 일 수가 0 입니다');
  /* 열쇠 글자가 «보이는 글»로 새 나오면 안 된다. 단추의 걸러 보기 열쇠(own:none)는
     보이는 글이 아니라 괜찮다 — 딱지·제목 자리에 찍혔는지만 본다. */
  const 열쇠노출 = /(?:mini|pill)[^>]*>\s*(?:none|dup)\b/;
  assert.ok(!열쇠노출.test(할일), '할 일 딱지에 열쇠 글자(none/dup)가 찍혔습니다');
  assert.ok(!열쇠노출.test(ctx.dashHtml()), '카드 딱지에 열쇠 글자(none/dup)가 찍혔습니다');
  assert.ok(!열쇠노출.test(ctx.chipsHtml()), '걸러 보기 딱지에 열쇠 글자가 찍혔습니다');
});

/* ══════ 화면 정리 (5차 지시) ══════ */
test('★ 카드는 «상태 한 마디»만 적는다 — 딱지를 넷씩 붙이지 않는다', () => {
  const ctx = rosterBox([
    { name: '박성수', leftAt: '2026-06-30' }, { name: '임혜미', leftAt: '2026-05-22' }
  ], null);
  ctx.App.members = {
    '193': { name: '박성수' }, '281': { name: '임혜미' },
    '320': { name: '장한돌', keepOnSite: { at: 'x', by: 'y', why: '지사장' } },
    '322': { name: '조현범' }
  };
  ctx.App.pages = {}; ctx.App.pageConfig = {};
  const card = ctx.dashHtml();
  /* 구성원 카드 한 장에 딱지가 하나뿐이라야 한다 — 지금 화면에서 넷이 붙어 있었다 */
  const 첫카드 = card.slice(0, card.indexOf('</button>'));
  const 딱지수 = (첫카드.match(/class="mini/g) || []).length;
  assert.equal(딱지수, 1, '카드 한 장에 딱지가 ' + 딱지수 + '개입니다 — 한 마디만 적기로 했습니다');
  /* 세부는 목록의 걸러 보기 딱지에 있어야 한다 — 어디에도 없으면 정보가 사라진 것이다 */
  const chips = ctx.chipsHtml();
  assert.match(chips, /퇴사/, '카드에서 뺀 「퇴사」가 걸러 보기 딱지에도 없습니다');
  assert.match(chips, /남김/, '카드에서 뺀 「남김」이 걸러 보기 딱지에도 없습니다');
});

test('★ 늘 뜨는 설명은 «접어» 둔다 — 쪽마다 네 줄을 다시 읽지 않는다', () => {
  const ctx = pageBox();
  ctx.App = { draft: { kind: 'page', key: 'work1', text: '한 줄로 이어진 글자' },
              pages: {}, dirty: false, pageLines: {}, pageConfig: {}, reading: '' };
  run(ctx, fnSource('pagePasteWhy') + '\n' + fnSource('noteOneLine') + '\n'
    + fnSource('readPageBtn') + '\n' + fnSource('pageFrameDoc') + '\n' + fnSource('stamp') + '\n' + fnSource('canDetachPage') + '\n'
    + fnSource('pageLinesHtml') + '\n' + fnSource('pageEdit'));
  const h = ctx.pageEdit(ctx.App.draft);
  /* 이유를 «없애지» 않았다 — 접어 두었을 뿐이다. 펼치면 그대로 나온다. */
  assert.match(h, /<details/, '접어 두는 곳이 없습니다 — 설명이 그대로 펼쳐져 있습니다');
  assert.match(h, /지도·표·구획/, '접어 두면서 이유까지 없앴습니다');
  /* 무엇을 하는 갈래인지는 접지 않고 한 줄로 보인다 */
  assert.match(h, /줄을 하나씩|줄마다|대조만/, '무엇을 하는 갈래인지 한 줄로 안 적혀 있습니다');
});

test('★ 홈페이지 줄을 «저장 없이» 다시 읽을 수 있다 — 새로 접속해도 볼 수 있다', () => {
  /* 줄 목록은 저장하지 않는다(보여주기 전용). 그래서 새로 접속하면 확인 시각은 남아 있는데
     줄 목록은 비어, 어떻게 보이는지 볼 방법이 없었다. 쪽마다 읽어오는 단추가 있어야 한다. */
  const ctx = pageBox();
  ctx.App = { draft: { kind: 'page', key: 'work1', text: '뭉친 글자' },
              pages: {}, dirty: false, pageLines: {}, pageConfig: {}, reading: '' };
  run(ctx, fnSource('pagePasteWhy') + '\n' + fnSource('noteOneLine') + '\n'
    + fnSource('readPageBtn') + '\n' + fnSource('pageFrameDoc') + '\n' + fnSource('stamp') + '\n' + fnSource('canDetachPage') + '\n'
    + fnSource('pageLinesHtml') + '\n' + fnSource('pageEdit'));
  const h = ctx.pageEdit(ctx.App.draft);
  assert.match(h, /readOnePage\('work1'\)/, '이 쪽만 읽어오는 단추가 없습니다');
  /* 읽은 뒤에는 줄마다 «생김새»가 달라야 한다 — 일률적이면 어디가 제목인지 모른다 */
  ctx.App.pageLines = { work1: ['자문서비스', '01', 'T. 041-556-0035', '최신 노동관계법령에 대한 자문과 상담'] };
  const h2 = ctx.pageEdit(ctx.App.draft);
  assert.match(h2, /class="l head"/, '쪽 제목 줄이 본문과 같은 모양입니다');
  assert.match(h2, /class="l sec"/, '구획번호(01) 줄이 본문과 같은 모양입니다');
  assert.match(h2, /class="l tel"/, '연락처 줄이 본문과 같은 모양입니다');
  /* 꾸밈은 CSS 로만 — 줄 글자에 표시를 덧붙이면 홈페이지로 흘러간다 */
  assert.match(h2, />\s*01\s*</, '구획번호 줄의 글자가 원문 그대로가 아닙니다');
});

/* ══════ 대조 기준 글자를 «줄로» 보기 (5차 지시) ══════
   대표 지시: 「한 줄로 이어져 있으면 확인이 어렵고 수정도 어렵다」.
   지킬 것 ① 줄바꿈을 넣어도 대조 결과가 안 바뀌는가(공백을 뭉쳐 견주므로)
   ② 나누는 자리를 지어내지 않는가(홈페이지에서 읽은 줄만 쓴다)
   ③ 초안만 바뀌고 자료는 저장을 눌러야 바뀌는가. */
test('★ 기준 글자에 줄바꿈을 넣어도 대조 결과가 안 바뀐다', () => {
  /* 이것이 이 기능의 근거다 — 여기가 깨지면 줄을 나눈 쪽이 영영 「안 올라감」에 묶인다.
     판단은 부품(PuHomeDiff)이 하므로 부품을 «돌려서» 확인한다. */
  const 홈페이지 = '천안본사 충남 천안시 서북구 원두정8길 6, 301호 T. 041-556-0035 세종지사 세종 한누리대로 312';
  const 줄나눔 = '천안본사\n충남 천안시 서북구 원두정8길 6, 301호\nT. 041-556-0035\n세종지사\n세종 한누리대로 312';
  const ctx = box();
  const r = ctx.PuHomeDiff.pageStatus({ inquiry: { text: 줄나눔 } }, { inquiry: 홈페이지 });
  assert.equal(r[0].status, 'same',
    '줄바꿈만 넣었는데 「안 올라감」이 됐습니다 — 그러면 읽기 좋게 나눌 수가 없습니다');
  /* 뜻이 다르면 여전히 다르다고 해야 한다 — 공백을 뭉치는 것이 «내용»을 뭉개면 안 된다 */
  const r2 = ctx.PuHomeDiff.pageStatus({ inquiry: { text: 줄나눔 + '\n대전지사' } }, { inquiry: 홈페이지 });
  assert.equal(r2[0].status, 'pending', '글자가 늘었는데 「같음」이라고 합니다');
});

test('★ 홈페이지를 안 읽었으면 줄을 «지어내지» 않고 그 사실을 말한다', async () => {
  const ctx = cfgBox(null);
  ctx.App.group = 'work';
  ctx.App.pick = 'work1';
  ctx.App.pages = { work1: { text: '한 줄로 이어진 글자 275자쯤' } };
  ctx.App.pageLines = {};                     // 아직 홈페이지를 안 읽었다
  run(ctx, fnSource('splitByLive'));
  ctx.loadDraft();
  const 전 = ctx.App.draft.text;
  await ctx.splitByLive();
  assert.equal(ctx.App.draft.text, 전, '읽지도 않은 줄 모양으로 글자를 건드렸습니다');
  assert.match(ctx.said.join(' '), /홈페이지를 읽지/, '왜 못 나누는지 말하지 않았습니다');
});

test('★ 줄로 나누는 것은 «초안»만 바꾼다 — 저장을 눌러야 자료에 남는다', async () => {
  const ctx = cfgBox(null);
  ctx.App.group = 'work';
  ctx.App.pick = 'work1';
  ctx.App.pages = { work1: { text: '자문서비스 01 노무관리 전반의 상시 자문' } };
  ctx.App.pageLines = { work1: ['자문서비스', '01', '노무관리 전반의 상시 자문'] };
  run(ctx, fnSource('splitByLive'));
  ctx.loadDraft();
  await ctx.splitByLive();
  assert.equal(ctx.App.draft.text.split('\n').length, 3, '홈페이지 줄대로 안 나눠졌습니다');
  assert.equal(ctx.App.dirty, true, '「저장 안 됨」 표시가 안 켜졌습니다');
  assert.equal(ctx.App.pages.work1.text, '자문서비스 01 노무관리 전반의 상시 자문',
    '저장을 누르지도 않았는데 자료가 바뀌었습니다');
  assert.deepEqual(ctx.saved, [], '저장을 누르지도 않았는데 서버에 썼습니다');
});

/* ══════ 자문사현황 (4차 지시) ══════
   홈페이지 자문사현황은 로고 «그림»이다. 회사명이 글자로 없어 대조를 «못 한다».
   지킬 것은 ① 못 하는 것을 못 한다고 말하는가 ② 업체관리를 기준으로 삼는가
   ③ 표시 안 한 회사가 할 일로 새지 않는가 ④ 안 올린 회사가 붙여넣을 목록에 안 드는가. */
function partnerBox() {
  const ctx = cfgBox(null);
  ctx.App.group = 'partner';
  ctx.App.q = '';
  ctx.App.companiesErr = '';
  ctx.App.companies = ctx.companiesFrom([
    /* ★ 자문료(monthlyAdvisoryFee)를 넣어 둔다 — 거르개가 «종류»가 아니라 «자문료»다
       (2026-09-06). 업체관리의 자문·급여 딱지가 실제 거래를 안 따라간다. */
    { id: 'co-1', name: '(주)가온전자', typeCode: '자문', status: 'active', ceo: '김가온', monthlyAdvisoryFee: 300000 },
    { id: 'co-2', name: '대성물류(주)', typeCode: '자문', status: 'active' },
    { id: 'co-3', name: '세종정밀', typeCode: '자문', status: 'active', monthlyAdvisoryFee: 150000 },
    { id: 'co-4', name: '삼정테크', typeCode: '자문', status: 'closed', closedDate: '2026-03-31' },
    { id: 'co-5', name: '한빛식품', typeCode: '급여', status: 'active' },
    { id: 'co-6', name: '지운 업체', typeCode: '자문', status: 'active', _deleted: true },
    /* 사무대행 — 자문사가 아니다. 기본 목록에도 고르는 창에도 안 나와야 한다 */
    { id: 'co-7', name: '푸른사무대행', typeCode: '자문', status: 'suboffice' }
  ]);
  ctx.App.partners = {
    'co-1': { posted: true, by: '권형하', at: '2026-08-20' },
    'co-3': { posted: false, why: '로고 파일을 못 받음', by: '권형하', at: '2026-08-21' },
    'co-4': { posted: true, by: '권형하', at: '2026-08-01' }
  };
  return ctx;
}

test('★ 자문사현황은 «대조 못 함»이라고 말한다 — 「같음」으로 뭉개지 않는다', () => {
  const ctx = partnerBox();
  const card = ctx.dashHtml();
  assert.ok(card.indexOf('자문사현황') >= 0, '자문사현황 카드가 없습니다');
  /* 목록 줄에 「확인 전」이 붙으면 언젠가 대조가 될 것처럼 들린다 — 그 갈래는 못 한다 */
  assert.ok(ctx.rowsHtml().indexOf('확인 전') < 0, '자문사 줄에 「확인 전」이 붙었습니다');
  /* ★ 카드는 «상태 한 마디»만 적는다(5차 지시). 할 일이 있으면 그것이 먼저다 —
     삼정테크(올림인데 거래 종료)가 있으니 「할 일」이 적혀야 한다. */
  assert.match(card, /할 일/, '손댈 것이 있는데 카드가 조용합니다');
  /* 손댈 것이 없어지면 «못 한다»고 적어야 한다 — 「이상 없음」이면 조용히 틀린다 */
  ctx.App.partners['co-4'] = { posted: false, by: '권형하', at: '2026-08-23' };
  const card2 = ctx.dashHtml();
  assert.ok(card2.indexOf('대조 못 함') >= 0,
    '자문사현황을 「이상 없음」으로 뭉갰습니다 — 회사명이 글자로 없어 못 하는 것입니다');
  /* 대조를 눌러도 달라지지 않는다 */
  ctx.App.check = { at: 1, members: {}, pages: {}, duplicates: [], leftovers: {} };
  assert.ok(ctx.dashHtml().indexOf('대조 못 함') >= 0,
    '대조를 누른 뒤 자문사현황이 「같음」처럼 보입니다 — 회사명이 글자로 없어 못 하는 것입니다');
});

test('★ 자문사 목록은 업체관리가 기준이다 — 지운 업체는 안 보인다', () => {
  const ctx = partnerBox();
  const names = ctx.visibleRows('partner').map(r => r.name);
  assert.ok(names.indexOf('지운 업체') < 0, '업체관리에서 지운 업체가 목록에 남았습니다');
  /* ★ 2026-09-06 「자료가 너무 길기 때문에 선택적으로 보고 넣기하려는 것이다」로
     기본 목록이 «손댄 것»만이 됐다(전에는 거래 중인 전부였다).
     ⚠ 숫자를 박지 않는다 — «손댄 것은 다 있고, 안 고른 것과 끝난 곳은 없다»를 본다. */
  /* ★ 「살아 있는」 = 거래 중이고 사무대행이 아닌 곳 (2026-09-06 사무대행 66곳을 뺐다) */
  const 살아있는 = ctx.App.companies.filter(c => !c._deleted && c.status === 'active');
  const 손댄것 = 살아있는.filter(c => (ctx.App.partners[c.id] || {}).posted !== undefined);
  손댄것.forEach(c => assert.ok(names.indexOf(c.name) >= 0,
    '★★ 사람이 손댄 업체가 목록에서 빠졌습니다: ' + c.name));
  assert.equal(names.length, 손댄것.length,
    '★★ 기본 목록에 «아직 안 고른» 업체가 섞였습니다 — 272줄로 되돌아갑니다: ' + names.join(', '));

  /* 감추는 것이 아니다 — 딱지를 누르면 그대로 다 나온다 */
  ctx.App.filter = 'posted:none';
  const 안고름 = ctx.visibleRows('partner').map(r => r.name);
  ctx.App.filter = '';
  살아있는.filter(c => (ctx.App.partners[c.id] || {}).posted === undefined).forEach(c =>
    assert.ok(안고름.indexOf(c.name) >= 0,
      '★★ 「아직 안 고름」 딱지로도 못 봅니다 — 빼는 것이 아니라 감춘 것이 됩니다: ' + c.name));

  /* ★ 이름으로 «찾을 때»는 안 고른 곳도 나와야 한다 — 안 그러면 업체관리에 없는 줄 안다 */
  ctx.App.q = '대성';
  assert.deepEqual(ctx.visibleRows('partner').map(r => r.name), ['대성물류(주)'],
    '★★ 안 고른 회사를 이름으로 못 찾습니다 — 없는 회사인 줄 알게 됩니다');
  ctx.App.q = '';
  /* 여기서 회사를 만들 수 있으면 어느 쪽이 진짜인지 알 수 없게 된다 */
  /* 여기서 회사를 만들 수 있으면 어느 쪽이 진짜인지 알 수 없게 된다.
     ⚠ 무늬가 「＋ 자문사」였는데, 2026-09-06 에 넣은 «＋ 자문사 고르기»가 걸렸다 —
       고르는 것은 만드는 것이 아니다. 막을 것은 «만들기»이지 「＋」가 아니다. */
  const lh = ctx.listHtml();
  assert.ok(!/새 회사|회사 만들기|자문사 추가|＋ *새 자문사|addCompany|addPartner\(/.test(lh),
    '★★ 자문사 목록에 «회사 만들기»가 있습니다 — 업체관리에서 만들어야 합니다');

  /* ★ 2026-09-06 「업체관리 클릭하면 푸른이알피로 넘어간다. 그럴 필요 없이
     데이터만 가지고 오면 된다」 — 업체 자료는 이 화면이 이미 다 읽어 와 있다.
     ⚠ 「자료를 보여 주려고」 딴 앱으로 보내는 길을 다시 만들지 말 것. */
  assert.ok(lh.indexOf('pu-erp.html') < 0,
    '★★ 목록 머리가 푸른이알피로 넘어갑니다 — 업체 자료는 이미 여기 다 있습니다');
  assert.match(lh, /onclick="openPartnerPick\(\)"/,
    '★ 목록 머리에서 «고르는 창»으로 갈 길이 없습니다');
});

test('★★ 아무 곳도 안 골랐으면 목록이 «고르라고 말한다» — 빈 화면으로 두지 않는다', () => {
  /* 2026-09-06 부터 아직 안 고른 272곳은 기본 목록에서 뺀다. 그래서 처음 열면 «0줄»이다.
     그때 「이 딱지에 해당하는 줄이 없습니다」로 끝내면, 사람은 업체가 없는 줄 알고 닫는다 —
     이 화면이 올림 0곳으로 몇 달을 지낸 까닭이 바로 «다음에 뭘 할지»를 안 알려 준 것이다.
     ★ 글자로 보지 않고 «실제로 그려» 본다. */
  const ctx = partnerBox();
  ctx.App.partners = {};                       // 아무것도 안 골랐다
  ctx.App.filter = ''; ctx.App.q = '';
  assert.equal(ctx.visibleRows('partner').length, 0, '손댄 것이 없는데 줄이 섭니다');
  const h = ctx.rowsHtml();
  assert.match(h, /openPartnerPick\(\)/,
    '★★ 빈 목록이 «어디서 고르는지»를 안 알려 줍니다 — 업체가 없는 줄 알고 닫습니다');
  /* 몇 곳에서 고를 수 있는지 — 거래 끝난 곳은 뺀 수여야 한다 */
  const 고를수있는 = ctx.App.companies.filter(c => !c._deleted && c.status === 'active').length;
  assert.ok(h.indexOf(String(고를수있는)) >= 0,
    '★ 고를 수 있는 곳이 몇 곳인지 안 말합니다 (' + 고를수있는 + '곳)');
  assert.ok(h.indexOf('이 딱지에 해당하는 줄이 없습니다') < 0,
    '★★ 다음에 뭘 할지 안 알려 주는 옛 말로 끝냅니다');
});

test('★★ 업체 종류로 «실제로» 좁혀진다 — 목록도 딱지 셈도 그 안에서 센다', () => {
  /* 대표 지시 2026-09-06 「업체관리에도 자문 급여 등이 있어 이 부분도 필터링 할 수 있게」.
     ★ 글자로 보지 않고 «돌려» 본다 — 조건 한 줄만 죽여도 소스에는 그 낱말이 남아,
       「App.coType 이 쓰였나」로 보면 안 걸린다(2026-09-06 되돌림 검사가 잡았다). */
  const ctx = partnerBox();
  ctx.App.q = '';
  ctx.App.coType = 'nofee';
  ctx.App.filter = 'posted:none';               // 아직 안 고른 것 중에서
  const 이름들 = ctx.visibleRows('partner').map(r => r.name).sort();
  assert.deepEqual(이름들, ['대성물류(주)', '한빛식품'].sort(),
    '★★ 자문료로 안 좁혀집니다: ' + 이름들.join(', '));

  /* 딱지에 적힌 수 = 실제로 보이는 줄 수 (거르개를 걸어도) */
  ctx.App.filter = '';
  ctx.App.coType = 'fee';
  const 보임 = ctx.visibleRows('partner').length;
  const 첫딱지 = /onclick="App\.filt\(''\)">([^<]*)<span class="c">(\d+)<\/span>/.exec(ctx.chipsHtml());
  assert.ok(첫딱지, '★ 걸러 보기를 푸는 딱지가 없습니다');
  assert.equal(Number(첫딱지[2]), 보임,
    '★★ 종류를 걸면 딱지 수와 보이는 줄이 어긋납니다 — 목록이 고장 난 줄 압니다');
  ctx.App.coType = '';
});

test('★★ 사무대행은 «빼되 볼 수 있고», 셈에도 안 섞인다', () => {
  /* 대표 지시 2026-09-06. 66곳이 자문사 목록에 섞여 있었다.
     ★ 글자로 보지 않고 «돌려» 본다 — 딱지를 눌렀을 때 실제로 나오는지,
       그리고 셈이 목록과 어긋나지 않는지는 소스를 읽어서는 알 수 없다. */
  const ctx = partnerBox();
  ctx.App.filter = ''; ctx.App.q = ''; ctx.App.coType = '';
  /* 예전에 사무대행을 「올림」으로 표시해 둔 상태 — 그래도 안 나가야 한다 */
  ctx.App.partners['co-7'] = { posted: true, by: '권형하', at: '2026-08-01' };

  assert.ok(ctx.visibleRows('partner').every(r => r.name !== '푸른사무대행'),
    '★★ 사무대행이 기본 목록에 있습니다 — 자문사가 아닙니다');

  const 보임 = ctx.visibleRows('partner').length;
  const 첫딱지 = /onclick="App\.filt\(''\)">([^<]*)<span class="c">(\d+)<\/span>/.exec(ctx.chipsHtml());
  assert.ok(첫딱지, '★ 걸러 보기를 푸는 딱지가 없습니다');
  assert.equal(Number(첫딱지[2]), 보임,
    '★★ 딱지 셈에 사무대행이 섞였습니다 — 적힌 수와 보이는 줄이 어긋납니다');

  /* 감추는 것이 아니다 — 딱지를 누르면 나온다 */
  ctx.App.filter = 'suboffice';
  assert.deepEqual(ctx.visibleRows('partner').map(r => r.name), ['푸른사무대행'],
    '★★ 「사무대행」 딱지를 눌러도 안 나옵니다 — 빼는 것이 아니라 감춘 것이 됩니다');
  ctx.App.filter = '';

  assert.ok(ctx.postedNames().indexOf('푸른사무대행') < 0,
    '★★ 올림으로 표시된 사무대행이 홈페이지 명단에 들어갑니다');
});

test('★ 표시 안 한 회사는 할 일이 아니다 — 「자문 종료」만 손댈 것이다', () => {
  const ctx = partnerBox();
  const rows = ctx.visibleRows('partner');
  /* ★ 대성물류는 «아직 안 고른» 곳이라 2026-09-06 부터 기본 목록에 없다 —
     딱지로 꺼내 본다. 목록에 없다고 할 일 판단이 달라지면 안 된다. */
  ctx.App.filter = 'posted:none';
  const 대성 = ctx.visibleRows('partner').find(r => r.name === '대성물류(주)');
  ctx.App.filter = '';
  assert.ok(대성, '「아직 안 고름」 딱지로도 볼 수 없습니다');
  /* ★ 삼정테크는 «거래가 끝나» 기본 목록에서 빠졌다 (2026-09-03 대표 지시).
     그래도 할 일에는 남아야 한다 — 지금 홈페이지에는 로고가 그대로 걸려 있다.
     그래서 「거래 종료」 딱지로 꺼내 본다. */
  ctx.App.filter = 'closed';
  const 삼정 = ctx.visibleRows('partner').find(r => r.name === '삼정테크');
  ctx.App.filter = '';
  assert.ok(삼정, '「거래 종료」 딱지로도 볼 수 없습니다 — 자동으로 빼되 «숨기지는» 않는다');
  assert.ok(rows.every(r => r.name !== '삼정테크'),
    '거래가 끝난 곳이 기본 목록에 남았습니다 — 자동으로 빠져야 합니다');
  assert.equal(대성.posted, '', '표시 안 한 회사를 다른 값으로 읽습니다');
  assert.equal(ctx.needsAttentionRow(대성), false, '표시 안 한 회사가 할 일로 새어 나옵니다');
  assert.ok(삼정.roster && 삼정.roster.kind === 'ended',
    '올림으로 표시했는데 거래가 끝난 곳을 안 알립니다');
  assert.equal(ctx.needsAttentionRow(삼정), true, '자문 종료가 손댈 것에서 빠졌습니다');
  assert.equal(ctx.statOf('partner').hot, 1, '손댈 것을 겹쳐 셌거나 빠뜨렸습니다');
});

test('★ 안 올린 회사는 붙여넣을 회사명 목록에 안 든다', () => {
  const ctx = partnerBox();
  const names = ctx.postedNames();
  assert.ok(names.indexOf('세종정밀') < 0, '「안 올림」으로 표시한 회사가 목록에 들어갔습니다');
  assert.ok(names.indexOf('대성물류(주)') < 0, '표시 안 한 회사가 목록에 들어갔습니다');
  /* ★ 2026-09-03 「업체 종료된 곳은 모두 자동으로 명단 빼라」 —
     삼정테크는 「올림」으로 표시돼 있지만 거래가 끝나 «자동으로» 빠진다.
     이 한 줄이 지시의 핵심이다: 사람이 표시를 안 고쳐도 명단에서 나간다. */
  assert.ok(names.indexOf('삼정테크') < 0,
    '거래가 끝난 회사가 붙여넣을 명단에 남았습니다 — 자동으로 빠져야 합니다');
  assert.deepEqual(names.slice().sort(), ['(주)가온전자'],
    '올림으로 표시했고 «거래 중인» 회사만 나와야 합니다');
});

test('★ 이름으로 찾을 수 있다 — 업체가 수백 개라 찾을 길이 없으면 고를 수 없다', () => {
  const ctx = partnerBox();
  ctx.App.filter = '';
  ctx.App.q = '세종';
  const found = ctx.visibleRows('partner');
  assert.equal(found.length, 1, '이름으로 찾기가 안 됩니다');
  assert.equal(found[0].name, '세종정밀');
  /* ★ 찾을 때는 «아직 안 고른» 곳도 나온다 (2026-09-06) — 기본 목록에는 없지만,
     찾기는 «있는 것을 찾는» 일이다. 안 나오면 업체관리에 없는 회사인 줄 안다. */
  ctx.App.q = '한빛';
  assert.deepEqual(ctx.visibleRows('partner').map(r => r.name), ['한빛식품'],
    '★★ 안 고른 회사를 이름으로 못 찾습니다');
  ctx.App.q = '';
  /* 숫자를 박지 않는다 — 「찾기를 지우면 기본 목록으로 돌아간다」가 규칙이다 */
  const 손댄것 = ctx.App.companies.filter(c => !c._deleted && c.status !== 'closed'
    && (ctx.App.partners[c.id] || {}).posted !== undefined).length;
  assert.equal(ctx.visibleRows('partner').length, 손댄것,
    '찾기를 지우면 기본 목록(손댄 것)으로 돌아가야 합니다');
});

test('★ 거래가 끝난 업체는 명단에서 «자동으로» 빠진다 — 셈과 목록이 같은 규칙을 쓴다', () => {
  /* 대표 지시 2026-09-03 「업체 종료된 곳은 모두 자동으로 명단 빼라」.
     ★ 왜 «셈»까지 보는가 — 「전체 373」이라 적혀 있는데 눌러 보니 340줄이면,
       사람은 목록이 고장 났다고 여긴다. 세는 곳과 보이는 곳이 어긋나면 안 된다. */
  const ctx = partnerBox();
  ctx.App.filter = '';
  const 보이는수 = ctx.visibleRows('partner').length;

  /* ① 첫 딱지의 수 = 실제로 보이는 줄 수.
     ⚠ 이름이 「전체」에서 「고른 것」으로 바뀌었다(2026-09-06) — 기본 목록이
       거래 중인 «전부»가 아니라 «손댄 것»이라 「전체」는 거짓말이 됐다.
       ★ 이름을 박지 말고 «첫 딱지»를 집는다 — 이름이 또 바뀌어도 규칙은 그대로다. */
  const chips = ctx.chipsHtml();
  const 첫딱지 = /onclick="App\.filt\(''\)">([^<]*)<span class="c">(\d+)<\/span>/.exec(chips);
  assert.ok(첫딱지, '걸러 보기를 «푸는» 딱지가 없습니다');
  assert.equal(Number(첫딱지[2]), 보이는수,
    '「' + 첫딱지[1] + '」에 적힌 수와 실제로 보이는 줄 수가 다릅니다');

  /* ② 「거래 종료」 딱지로 꺼내 볼 수 있다 — 자동으로 빼되 «숨기지는» 않는다 */
  assert.match(chips, /거래 종료<span class="c">[1-9]/,
    '거래 종료 딱지가 없습니다 — 뺀 것을 볼 길이 없으면 목록이 잘못된 줄 압니다');

  /* ③ 목록 머리도 뺀 수를 말한다 */
  /* ⚠ 2026-09-06 부터 「사무대행」도 함께 뺀다 — 둘을 갈라 적으므로 「곳은 뺐음」이
     거래 종료 바로 뒤에 붙지 않는다. 숫자·차례를 박지 말고 «뺐다고 말하는가»를 본다. */
  const 머리 = ctx.listCountHtml();
  assert.match(머리, /거래 종료 [1-9]\d*곳/, '거래 종료를 뺐다는 말이 없습니다');
  assert.match(머리, /뺐음/, '뺐다는 말을 목록 머리가 안 합니다');

  /* ④ 할 일에는 남는다 — 지금 홈페이지에는 로고가 그대로 걸려 있다 */
  assert.equal(ctx.statOf('partner').own.ended, 1,
    '거래가 끝났는데 올림으로 표시된 곳이 할 일에서 사라졌습니다');

  /* ⑤ 뺄 것이 없으면 딱지도, 뺐다는 말도 «안 그린다» (0은 안 그린다)
     ⚠ 뺄 것이 둘이다 — 거래 종료와 사무대행. 둘 다 없애야 「뺐음」이 사라진다. */
  ctx.App.companies = ctx.App.companies.filter(c => c.status === 'active');
  const chips2 = ctx.chipsHtml();
  assert.ok(chips2.indexOf('거래 종료') < 0, '끝난 곳이 없는데 「거래 종료」 딱지를 그립니다');
  assert.ok(chips2.indexOf('사무대행') < 0, '사무대행이 없는데 딱지를 그립니다');
  assert.ok(ctx.listCountHtml().indexOf('뺐음') < 0,
    '뺀 것이 없는데 「뺐음」이라고 적습니다');
});

test('★ 자문사 표시는 «한 업체 자리»만 건드린다 — 통째로 덮지 않는다', () => {
  /* 통째로 set 하면 다른 사람이 방금 한 표시가 지워진다. 경로에 업체 열쇠가 들어가야 한다. */
  const src = fnSource('setPosted');
  assert.match(src, /PARTNER_PATH \+ '\/' \+ id/,
    '표시를 업체별 자리에 저장하지 않습니다 — 통째로 덮으면 남의 표시가 지워집니다');
  assert.ok(src.indexOf('App.saveErr') >= 0,
    '저장 실패를 화면에 안 알리면, 규칙이 없어 거부돼도 올렸다고 표시한 줄 압니다');
});

test('★ 편집칸의 머리와 발이 고정돼 가운데만 구른다', () => {
  const ctx = box();
  ctx.esc = escStub();
  ctx.App = {
    draft: { kind: 'member', key: '190', name: '권형하', position1: '대표', position2: '공인노무사',
             intro: '', srl: '190', careers: ['現 가'] },
    members: { '190': { name: '권형하', srl: '190' } },
    staff: null, check: null, lineFormat: 'plain', dirty: false
  };
  run(ctx, fnSource('todayString') + '\n' + fnSource('keptOf') + '\n' + fnSource('rosterMarkOf') + '\n'
    + fnSource('memberBandHtml') + '\n' + fnSource('riskReport') + '\n' + fnSource('srlConflict') + '\n'
    + fnSource('stamp') + '\n' + noConst(constLine('MEMBER_KINDS')) + '\n' + fnSource('memberKind') + '\n' + fnSource('memberEdit'));
  const h = ctx.memberEdit(ctx.App.draft);
  const 가운데 = h.indexOf('class="esc"');
  const 발 = h.lastIndexOf('class="eft"');
  assert.ok(가운데 >= 0, '구르는 가운데 칸이 없습니다 — 경력이 길면 단추가 화면 밖으로 밀립니다');
  assert.ok(발 > 가운데, '단추줄이 구르는 칸 안에 있습니다 — 굴려야 「저장」이 보입니다');
  assert.ok(h.indexOf('저장', 발) >= 0, '「저장」 단추가 고정된 발에 없습니다');
});

/* ══════ ③ 퇴사 정보를 「확인 전」에도 보이기 ══════ */

function rosterBox(staff, check) {
  const ctx = cfgBox(null);
  ctx.App.group = 'members';
  ctx.App.staff = staff;
  ctx.App.check = check || null;
  return ctx;
}

test('★ 명부 딱지는 「홈페이지 다시 확인」을 «안 눌러도» 붙는다', () => {
  const ctx = rosterBox([
    { name: '권형하', leftAt: '' },
    { name: '박성수', leftAt: '2026-06-30' }
  ], null);
  ctx.App.members = {
    '190': { name: '권형하', position1: '대표', position2: '공인노무사' },
    '193': { name: '박성수', position2: '공인노무사' }
  };
  const rows = plain(ctx.memberRows());
  const 성수 = rows.find(r => r.name === '박성수');
  const 형하 = rows.find(r => r.name === '권형하');
  assert.ok(성수.roster, '대조를 안 눌렀다고 퇴사 딱지가 안 붙습니다 — 명부만 보면 아는 것입니다');
  assert.equal(성수.roster.kind, 'left');
  assert.equal(성수.status, '', '대조를 안 눌렀는데 대조 딱지가 붙었습니다');
  assert.equal(형하.roster, null, '재직자에게 딱지가 붙었습니다');

  const h = ctx.listHtml();
  assert.ok(h.indexOf('2026-06-30') >= 0, '목록 줄에 퇴사일이 안 보입니다');
  assert.ok(h.indexOf('확인 전') >= 0, '대조 딱지 자리(「확인 전」)가 사라졌습니다');
});

test('★ 대조 딱지와 명부 딱지를 섞지 않는다 — 서로 없어도 각자 뜬다', () => {
  // 명부는 못 읽었고 대조는 했다 → 대조 딱지만
  const a = rosterBox(null, { members: { '190': { name: '권형하', status: 'pending', reason: '내용이 다름' } } });
  a.App.members = { '190': { name: '권형하', position1: '대표' } };
  const ra = plain(a.memberRows())[0];
  assert.equal(ra.roster, null, '명부를 못 읽었는데 명부 딱지를 지어냈습니다');
  assert.equal(ra.status, 'pending');

  // 명부는 읽었고 대조는 안 했다 → 명부 딱지만
  const b = rosterBox([{ name: '권형하', leftAt: '2026-01-01' }], null);
  b.App.members = { '190': { name: '권형하', position1: '대표' } };
  const rb = plain(b.memberRows())[0];
  assert.equal(rb.status, '', '대조를 안 눌렀는데 대조 딱지가 붙었습니다');
  assert.equal(rb.roster.kind, 'left');
});

test('★ 「홈페이지 다시 확인」이 명부 딱지를 대조 결과에 섞어 저장하지 않는다', async () => {
  const ctx = box();
  ctx.App = {
    members: { '193': { name: '박성수', srl: '193', position1: '', position2: '공인노무사', careers: [] } },
    pages: {}, staff: [{ name: '박성수', leftAt: '2026-06-30' }],
    check: null, saveErr: '', pageLines: {}
  };
  ctx.db = { ref: () => ({ set: () => Promise.resolve() }) };
  run(ctx, constSource('PAGE_IDS') + '\n' + fnSource('todayString') + '\n' + fnSource('applyStatus'));
  await ctx.applyStatus(
    [{ srl: '193', name: '박성수', position1: '', position2: '공인노무사', careers: [] }], {}, []);
  const rec = plain(ctx.App.check.members['193']);
  assert.equal(rec.status, 'toRemove', '대조 딱지가 제 일을 안 했습니다');
  assert.ok(!('roster' in rec), '명부 딱지를 대조 결과에 끼워 저장했습니다 — 둘은 다른 것입니다');
});

test('★ 목록 머리에 「구성원 몇 명 · 퇴사 몇」이 적힌다', () => {
  const ctx = rosterBox([
    { name: '권형하', leftAt: '' }, { name: '박성수', leftAt: '2026-06-30' },
    { name: '임혜미', leftAt: '2026-05-22' }, { name: '장한돌', leftAt: '2023-12-31' }
  ], null);
  ctx.App.members = {
    '190': { name: '권형하' }, '193': { name: '박성수' }, '281': { name: '임혜미' },
    '320': { name: '장한돌', keepOnSite: { at: '2026-08-17', by: '관리자', why: '세종지사장' } },
    '322': { name: '조현범' }
  };
  const h = ctx.listHtml();
  assert.match(h, /구성원[^0-9]*5명/, '구성원이 몇 명인지 목록 머리에 없습니다');
  assert.match(h, /퇴사[^0-9]*3/, '명부상 퇴사가 몇 명인지 목록 머리에 없습니다');
  // 머리에 적은 숫자가 «목록 번호»로 새 나가면 안 된다
  assert.deepEqual(rowNumbers(h), [1, 2, 3, 4, 5], '목록 번호가 흔들렸습니다');
});

test('★ 명부에 없는 사람은 「명부에 없음」으로 밝힌다', () => {
  const ctx = rosterBox([{ name: '권형하', leftAt: '' }], null);
  ctx.App.members = { '322': { name: '조현범', position1: '대전지사장', position2: '공인노무사' } };
  assert.equal(plain(ctx.memberRows())[0].roster.kind, 'none');
  assert.ok(ctx.listHtml().indexOf('명부에 없음') >= 0, '명부에 없다는 사실이 목록에 안 보입니다');
});

test('★ 「남김」으로 표시한 사람에게는 퇴사 딱지 대신 「남김」을 보여준다', () => {
  const ctx = rosterBox([{ name: '장한돌', leftAt: '2023-12-31' }], null);
  ctx.App.members = {
    '320': { name: '장한돌', position1: '세종지사장', position2: '공인노무사',
             keepOnSite: { at: '2026-08-17', by: '관리자', why: '세종지사장 — 고용관계 아님' } }
  };
  const h = ctx.listHtml();
  assert.ok(h.indexOf('남김') >= 0, '왜 퇴사 경고가 없는지 알 수 없습니다');
  assert.ok(h.indexOf('세종지사장 — 고용관계 아님') >= 0, '남긴 사유가 목록에 안 보입니다');
  assert.ok(h.indexOf('퇴사 2023-12-31') < 0,
    '「남김」으로 둔 사람 줄에 퇴사 딱지가 그대로 붙었습니다 — 왜 예외인지 흐려집니다');
});

test('★ 사유가 빈 「남김」은 예외로 보지 않는다 — 부품과 같은 기준을 쓴다', () => {
  const ctx = rosterBox([{ name: '장한돌', leftAt: '2023-12-31' }], null);
  ctx.App.members = { '320': { name: '장한돌', keepOnSite: { at: 'x', by: 'y', why: '   ' } } };
  const r = plain(ctx.memberRows())[0];
  assert.equal(r.kept, false, '사유 없는 예외를 예외로 봤습니다 — 딱지 판정과 어긋납니다');
  /* ⚠ 2026-09-02 부터 딱지에는 날짜를 «안» 적는다 —
     같은 줄 설명에 「퇴사일 …」이 이미 있어 한 줄에 날짜가 두 번 적혔다(대표 지적).
     그래서 「퇴사 2023-12-31」 한 덩이로 찾지 않고, 딱지와 날짜를 «따로» 본다.
     둘 다 봐야 한다 — 딱지만 보면 날짜가 사라진 것을 못 잡는다. */
  const 목록 = ctx.listHtml();
  assert.match(목록, /class="pill[^"]*">퇴사</, '★ 퇴사 딱지가 사라졌습니다');
  assert.ok(목록.indexOf('2023-12-31') >= 0, '★ 퇴사일이 줄에서 사라졌습니다');
});

function bandBox(member, staff, check) {
  const ctx = box();
  ctx.esc = escStub();
  ctx.App = {
    draft: Object.assign({ kind: 'member', key: '193', careers: [] }, member),
    members: { '193': member }, staff: staff, check: check || null,
    lineFormat: 'plain', dirty: false
  };
  run(ctx, fnSource('todayString') + '\n' + fnSource('keptOf') + '\n' + fnSource('rosterMarkOf') + '\n'
    + fnSource('memberBandHtml') + '\n' + fnSource('riskReport') + '\n' + fnSource('srlConflict') + '\n'
    + fnSource('stamp') + '\n' + noConst(constLine('MEMBER_KINDS')) + '\n' + fnSource('memberKind') + '\n' + fnSource('memberEdit'));
  return ctx;
}

test('★ 편집칸 머리 띠가 퇴사를 알리고, «내리는 방법»을 삭제가 아니라 비공개로 적는다', () => {
  const ctx = bandBox({ name: '박성수', position1: '', position2: '공인노무사', srl: '193', careers: [] },
                      [{ name: '박성수', leftAt: '2026-06-30' }]);
  const h = ctx.memberEdit(ctx.App.draft);
  assert.ok(h.indexOf('2026-06-30') >= 0, '언제 퇴사했는지 편집칸에 안 보입니다');
  assert.match(h, /비공개/, '내리는 방법이 안 적혀 있습니다');
  assert.match(h, /삭제가 아니라|삭제하지/, '삭제가 아니라는 말이 없습니다 — 지우면 되살리기 어렵습니다');
  assert.match(h, /되살릴/, '잘못 내렸을 때 되살릴 수 있다는 말이 없습니다');
});

test('★ 확인 전에는 홈페이지에 «아직 있다»고 단정하지 않는다 (그건 대조 딱지가 할 말이다)', () => {
  const 확인전 = bandBox({ name: '박성수', srl: '193', careers: [] },
                        [{ name: '박성수', leftAt: '2026-06-30' }], null);
  const h1 = 확인전.memberEdit(확인전.App.draft);
  assert.ok(h1.indexOf('2026-06-30') >= 0, '명부 딱지는 확인 전에도 보여야 합니다');
  assert.ok(h1.indexOf('아직 올라가 있습니다') < 0,
    '홈페이지를 안 읽었는데 아직 올라가 있다고 단정했습니다 — 명부 딱지가 대조 딱지 흉내를 냈습니다');
  assert.match(h1, /홈페이지 다시 확인/, '올라가 있는지 어떻게 알 수 있는지 안 적혀 있습니다');

  const 내려감 = bandBox({ name: '박성수', srl: '193', careers: [] },
                        [{ name: '박성수', leftAt: '2026-06-30' }],
                        { members: { '193': { name: '박성수', status: 'done', reason: '퇴사 처리 끝' } } });
  const h2 = 내려감.memberEdit(내려감.App.draft);
  assert.ok(h2.indexOf('아직 올라가 있습니다') < 0, '이미 내려간 사람인데 아직 있다고 합니다');
  assert.match(h2, /내려/, '내려간 것이 확인됐다는 말이 없습니다');
});

test('★ 명부에 없는 사람은 편집칸에서도 그 사실을 밝힌다', () => {
  const ctx = bandBox({ name: '조현범', position1: '대전지사장', position2: '공인노무사',
                        srl: '322', careers: [] }, [{ name: '권형하', leftAt: '' }]);
  const h = ctx.memberEdit(ctx.App.draft);
  assert.ok(h.indexOf('명부에 없음') >= 0, '명부에 없다는 사실이 편집칸에 안 보입니다');
  assert.match(h, /남기기/, '명부에 없는 분을 어떻게 두라는 안내가 없습니다');
});

test('★ 명부를 못 읽으면 편집칸 머리 띠를 지어내지 않는다', () => {
  const ctx = bandBox({ name: '박성수', srl: '193', careers: [] }, null);
  const h = ctx.memberEdit(ctx.App.draft);
  assert.ok(h.indexOf('명부에 없음') < 0, '명부를 못 읽은 것을 「명부에 없음」으로 뭉갰습니다');
  assert.ok(h.indexOf('명부: ') < 0, '명부를 못 읽었는데 명부 띠를 띄웠습니다');
});

test('★ 확인을 안 눌러도 명부상 퇴사자가 있으면 카드에 빨간 점이 켜진다', () => {
  const ctx = rosterBox([{ name: '박성수', leftAt: '2026-06-30' }], null);
  ctx.App.members = { '193': { name: '박성수' } };
  ctx.App.pages = {}; ctx.App.pageConfig = {};
  const hot = () => ctx.statOf('members').hot;
  assert.equal(hot() > 0, true, '확인 전에는 퇴사자가 있어도 조용합니다');

  // 이미 내려간 사람(done)에게는 켜지지 않는다 — 손댈 것이 없다
  ctx.App.check = { members: { '193': { name: '박성수', status: 'done', reason: '퇴사 처리 끝' } } };
  assert.equal(hot(), 0, '퇴사 처리를 끝냈는데 빨간 점이 남습니다');

  // 「남김」으로 둔 사람에게도 켜지지 않는다
  ctx.App.check = null;
  ctx.App.members = { '193': { name: '박성수', keepOnSite: { at: 'x', by: 'y', why: '지사장' } } };
  assert.equal(hot(), 0, '「남김」으로 둔 사람 때문에 빨간 점이 남습니다');
});

/* ══════ 쪽 본문 고치기 (대표 지시 「모두 다 — 쪽 본문 안 깨지게」) ══════
   ★ 여기서 지키는 것은 «화면과 부품이 같은 말을 하는가»다.
     부품이 「이 줄은 못 채운다」고 하는데 화면이 고칠 칸을 내주면, 사람은 고쳐 놓고
     채워졌다고 믿는다 — 가장 조용하고 가장 나쁜 어긋남이다. */

function 쪽화면(runs, fix) {
  const ctx = box({
    App: { pageLines: { work1: runs.map(r => r.text) }, pageRuns: { work1: runs },
           pageFix: fix ? { work1: fix } : {}, reading: '' },
    document: { getElementById: () => null }
  });
  ctx.esc = escStub();
  run(ctx, fnSource('readPageBtn'));
  run(ctx, fnSource('pageFrameDoc'));
  run(ctx, fnSource('pageFixOf'));
  run(ctx, fnSource('runSep'));
  run(ctx, fnSource('runKey'));
  run(ctx, fnSource('runOfKey'));
  run(ctx, fnSource('pageFixList'));
  run(ctx, fnSource('pageRunEdit'));
  run(ctx, fnSource('pageLinesHtml'));
  return ctx;
}

test('★ 쪽의 줄은 «그 자리에서» 고칠 수 있다 — 고칠 칸이 줄마다 있다', () => {
  const runs = [{ text: '첫 줄', ok: true, why: '' }, { text: '둘째 줄', ok: true, why: '' }];
  const out = 쪽화면(runs).pageLinesHtml('work1');
  const 칸수 = (out.match(/<input[^>]*/g) || []).length;
  assert.equal(칸수, 2, '★ 고칠 수 있는 줄이 ' + runs.length + '개인데 고칠 칸은 ' + 칸수 + '개다');
  assert.ok(out.indexOf('pageRunEdit') > 0, '고친 것을 받아 줄 길이 없다');
});

test('★★ 겹친 줄도 «고칠 칸»을 주고 몇 번째인지 보여 준다 — 자물쇠로 막지 않는다', () => {
  /* ★ 2026-09-03 에 규칙이 바뀌었다 (대표 지시 「자물쇄 같이 실물」).
     예전에는 겹친 줄에 칸을 안 주고 자물쇠를 걸었다. 오시는길에서 실측하니
     고칠 줄 20개 중 10개가 자물쇠였다 — 절반을 못 고치는 화면은 쓸 수 없다.
     ⚠ 대신 «어느 자리인지»를 사람이 알아야 한다 — 그래서 「1/2」 딱지를 붙인다.
       딱지 없이 칸만 열면, 두 칸이 똑같이 보여 어느 것을 고쳤는지 모른다. */
  const runs = [{ text: '겹친 줄', n: 1, of: 2, ok: true, why: '' },
                { text: '혼자 줄', n: 1, of: 1, ok: true, why: '' },
                { text: '겹친 줄', n: 2, of: 2, ok: true, why: '' }];
  const out = 쪽화면(runs).pageLinesHtml('work1');
  const 칸수 = (out.match(/<input[^>]*/g) || []).length;
  assert.equal(칸수, 3, '★★ 겹친 줄에 고칠 칸을 안 줬다 — 아직 자물쇠로 막고 있다');
  assert.ok(/class="nth"[^>]*>1\/2</.test(out), '★★ 「1/2」 딱지가 없다 — 어느 자리인지 모른다');
  assert.ok(/class="nth"[^>]*>2\/2</.test(out), '★★ 「2/2」 딱지가 없다');
  /* 혼자 있는 줄에는 딱지를 붙이지 않는다 — 늘 붙이면 「1/1」이 줄마다 어지럽다 */
  assert.equal((out.match(/class="nth"/g) || []).length, 3,
    '★ 혼자 있는 줄에도 딱지를 붙였다 (머리띠 안내 하나를 더해 셋이어야 한다)');
});

test('★ 고친 줄이 없으면 «채우기용 복사»가 안 눌린다 — 빈 쪽지를 복사하게 두지 않는다', () => {
  const runs = [{ text: '첫 줄', n: 1, of: 1, ok: true, why: '' }];
  const 안고침 = 쪽화면(runs).pageLinesHtml('work1');
  /* ★ 고침 열쇠에 «몇 번째»가 들어간다 (2026-09-03) — 글자만으로는
     같은 글의 두 자리를 갈라 담을 수 없었다. */
  const 고침 = 쪽화면(runs, { ['1' + String.fromCharCode(1) + '첫 줄']: '고친 첫 줄' })
    .pageLinesHtml('work1');
  const 잠김 = h => {
    const i = h.indexOf('copyPageFix');
    assert.ok(i > 0, '채우기용 복사 단추가 없다');
    const 단추 = h.slice(h.lastIndexOf('<button', i), h.indexOf('</button>', i));
    return / disabled/.test(단추);
  };
  assert.equal(잠김(안고침), true, '★ 고친 줄이 없는데 복사 단추가 열려 있다');
  assert.equal(잠김(고침), false, '★ 고친 줄이 있는데 복사 단추가 잠겨 있다');
  assert.ok(고침.indexOf('고친 첫 줄') > 0, '고친 글이 칸에 안 남아 있다');
});

test('★ 고친 줄은 «원래 글자»로 붙들어 둔다 — 줄 번호로 붙들면 엉뚱한 줄로 옮겨 붙는다', () => {
  const ctx = 쪽화면([{ text: '둘째 줄', n: 1, of: 1, ok: true, why: '' }]);
  /* pageRunEdit(쪽, 열쇠, 원래글, 새글) — 열쇠와 원래글을 따로 받는다 */
  ctx.pageRunEdit('work1', '1' + String.fromCharCode(1) + '둘째 줄', '둘째 줄', '고친 글');
  const list = ctx.pageFixList('work1');
  assert.equal(list.length, 1);
  assert.equal(list[0].before, '둘째 줄', '★ 원래 글자를 안 담았다 — 홈페이지에서 자리를 못 찾는다');
  assert.equal(list[0].after, '고친 글');
  /* 홈페이지가 바뀌어 줄이 하나 늘어도, 원래 글자로 찾으므로 그대로 맞는다 */
  const 바뀐본문 = '<p>새로 끼어든 줄</p><p>둘째 줄</p>';
  const out = ctx.PuHomeFill.applyLineEdits(바뀐본문, list);
  assert.equal(out.done.length, 1, '★ 줄이 하나 늘었다고 못 채웠다');
  assert.ok(out.html.indexOf('<p>고친 글</p>') >= 0, '★ 엉뚱한 자리에 채웠다');
});

test('★ 되돌리면 다시 원래 글자다 — 되돌린 뒤 복사하면 빈 쪽지가 나가면 안 된다', () => {
  const ctx = 쪽화면([{ text: '첫 줄', n: 1, of: 1, ok: true, why: '' }]);
  const 열쇠 = '1' + String.fromCharCode(1) + '첫 줄';
  ctx.pageRunEdit('work1', 열쇠, '첫 줄', '고친 글');
  assert.equal(ctx.pageFixList('work1').length, 1);
  ctx.pageRunEdit('work1', 열쇠, '첫 줄', '첫 줄');
  assert.equal(ctx.pageFixList('work1').length, 0, '★ 원래 글자로 되돌렸는데 고친 줄로 남아 있다');
});

/* ══════ 채우기로 «안 되는» 칸을 미리 말한다 ══════
   ★ 단추는 경력사항 칸만 채운다. 직책이 다르면 눌러도 딱지가 그대로 「안 올라감」이다.
     그것을 말해 주지 않으면 사람은 단추가 고장 난 줄 알고 다시 누른다. */

test('★ 직책이 다르면 «채우기로는 안 된다»고 먼저 말한다 — 단추를 누른 뒤에 알면 늦다', () => {
  const ctx = box();
  ctx.esc = escStub();
  /* ★ 「채울 수 있는 칸」은 부품이 정한다 — 검사가 목록을 따로 박아 두지 않는다.
     오늘은 견주는 네 칸을 모두 채울 수 있어 이 안내가 할 말이 없다. 그래도 그물은 남긴다 —
     채우는 칸이 줄거나, 채울 수 없는 칸이 새로 대조에 들어오면 그때 일해야 한다. */
  const 채움 = ctx.PuHomeFill.MEMBER_FIELDS.map(f => f.key);
  const 못채움 = '메인 설명';   // 부품이 채우지 못하는 칸(홈페이지에서 읽어올 수도 없다)
  assert.equal(채움.indexOf(못채움), -1, '이 검사의 전제가 깨졌다');
  const note = ctx.fillGapNote({ status: 'pending', fields: [못채움].concat(채움) }, '');
  assert.ok(note, '★ 채우기로 안 되는 칸이 있는데 아무 말도 안 한다');
  assert.match(note, new RegExp(못채움), '어느 칸인지 안 말한다');
  assert.match(note, /손으로|직접/, '그럼 어떻게 하라는 건지 안 말한다');
  assert.doesNotMatch(note, new RegExp(채움[0]),
    '★ 단추가 채우는 칸까지 «손으로 고치라»고 한다');
});

test('★ 경력사항만 다르면 «군말을 안 한다» — 그때는 단추로 끝난다', () => {
  const ctx = box();
  ctx.esc = escStub();
  /* 단추가 채우는 칸만 다르면 아무 말도 안 한다 — 그때는 단추로 끝난다 */
  const 채움 = ctx.PuHomeFill.MEMBER_FIELDS.map(f => f.key);
  assert.equal(ctx.fillGapNote({ status: 'pending', fields: 채움 }, ''), '',
    '★ 단추로 되는 일에까지 «손으로 고치라»고 한다');
  assert.equal(ctx.fillGapNote({ status: 'same' }, ''), '', '같은데도 무언가를 말한다');
  assert.equal(ctx.fillGapNote({}, ''), '', '딱지가 없는데 지어내 말한다');
});

test('★ 「어느 칸이 다른가」는 대조가 담아 준 자료를 그대로 쓴다 — 사유 글자를 다시 뜯지 않는다', () => {
  /* 사유 글자를 뜯어 읽으면, 글자를 다듬는 순간 화면이 조용히 틀린다.
     그래서 딱지에 fields 를 «자료로» 담고 화면은 그것만 본다. */
  const ctx = box();
  ctx.App = { members: { a: { name: '권형하', srl: '10', position1: '대표', position2: '노무사',
                             careers: ['現 가'] } },
              staff: [{ name: '권형하' }], pages: {}, check: null, pageLines: {}, pageRuns: {},
              pageFix: {}, render() {} };
  run(ctx, constSource('PAGE_IDS') + '\n' + fnSource('todayString') + '\n' + fnSource('applyStatus'));
  ctx.db = { ref: () => ({ set: () => Promise.resolve() }) };
  const live = [{ srl: '10', name: '권형하', position1: '대표', position2: '공인노무사',
                 careers: ['現 가'] }];
  return ctx.applyStatus(live, {}, []).then(() => {
    const rec = ctx.App.check.members.a;
    assert.equal(rec.status, 'pending');
    assert.ok(rec.fields && rec.fields.indexOf('직책2') >= 0,
      '★ 어느 칸이 다른지 딱지에 안 담겼다 — 화면이 말할 방법이 없다');
  });
});

/* ══════ 「홈페이지에서 비공개로」 (대표 지시 2026-08-31) ══════
   ★ 퇴사자를 내리는 마지막 걸음이 여태 «사람이 관리자 화면에서 직접»이었다.
     그 걸음에서 자주 멈춰, 퇴사자가 홈페이지에 오래 남았다.
   ★ 그렇다고 늘 보이면 안 된다 — 잘못 누르면 재직자가 홈페이지에서 사라진다. */

test('★ 내리는 단추는 «내릴 것(퇴사)»일 때만 보인다 — 늘 보이면 잘못 누른다', () => {
  const 그리기 = status => {
    const ctx = pageBox();
    ctx.App = { draft: { kind: 'member', key: 'a', srl: '193', name: '박성수',
                         position1: '', position2: '공인노무사', careers: ['現 가'], intro: '' },
                members: { a: { name: '박성수', srl: '193' } }, staff: [], lineFormat: 'plain',
                check: status ? { members: { a: { status: status } } } : null, dirty: false };
    run(ctx, fnSource('todayString') + '\n' + fnSource('riskReport') + '\n' + fnSource('srlConflict') + '\n'
      + fnSource('keptOf') + '\n' + fnSource('rosterMarkOf') + '\n' + fnSource('stamp') + '\n'
      + fnSource('memberBandHtml') + '\n' + noConst(constLine('MEMBER_KINDS')) + '\n' + fnSource('memberKind') + '\n' + fnSource('memberEdit'));
    return ctx.memberEdit(ctx.App.draft);
  };
  assert.match(그리기('toRemove'), /비공개/, '★ 내릴 사람인데 내리는 길이 없다');
  assert.doesNotMatch(그리기('same'), /copyPrivate/,
    '★ 내릴 것이 아닌데 내리는 단추가 보인다 — 잘못 누르면 재직자가 사라진다');
  assert.doesNotMatch(그리기(null), /copyPrivate/,
    '★ 대조도 안 했는데 내리라고 한다');
});

test('★ 내리기 쪽지는 «그 사람 글 번호»를 담는다 — 엉뚱한 글을 내리지 않게', async () => {
  const ctx = pageBox();
  ctx.App = { draft: { kind: 'member', key: 'a', srl: '193', name: '박성수' },
              members: { a: { name: '박성수', srl: '193' } } };
  ctx.say = async () => {};
  run(ctx, fnSource('modalFoot') + '\n' + fnSource('copyPrivate'));
  await ctx.copyPrivate('a');
  assert.equal(ctx.copied.length, 1, '쪽지를 안 만들었다');
  const p = ctx.PuHomeFill.readPacket(ctx.copied[0]);
  assert.equal(p.kind, '비공개');
  assert.equal(p.srl, '193', '★ 글 번호가 안 담겼다 — 어느 글을 내릴지 알 수 없다');
  /* 「지우는 것이 아니라 감추는 것」이 안내에 있어야 한다 */
  assert.match(ctx.shown[0], /지우는 것이 아니라|되살릴 수 있습니다/,
    '★ 지우는 것으로 오해할 안내다');
});

test('★ 글 번호가 없으면 내리지 않는다 — 어느 글인지 모르면 아무것도 안 한다', async () => {
  const ctx = pageBox();
  ctx.App = { draft: { kind: 'member', key: 'a', srl: '', name: '박성수' },
              members: { a: { name: '박성수' } } };
  const 말한것 = [];
  ctx.say = async (t) => { 말한것.push(t); };
  run(ctx, fnSource('modalFoot') + '\n' + fnSource('copyPrivate'));
  await ctx.copyPrivate('a');
  assert.equal(ctx.copied.length, 0, '★ 어느 글인지도 모르는데 쪽지를 만들었다');
  assert.ok(말한것.length, '왜 못 하는지 말하지 않았다');
});

/* ══════ 화면이 부르는 부품을 부품이 «다» 내놓는가 ══════
   ★ 2026-08-31 실제로 여기서 사고가 났다 — 부품에 함수 하나를 더하다가
     내놓는 목록에서 divInLine·riskReport 가 통째로 빠졌다. 화면은 그대로라
     검사도 대부분 통과했는데, 그 둘을 쓰는 자리에서만 조용히 터진다. */

test('★ 화면이 부르는 부품 함수는 모두 «내놓아져» 있다 — 하나만 빠져도 그 자리에서 조용히 터진다', () => {
  const ctx = box();
  const 부품 = ['PuHomeParse', 'PuHomeCareer', 'PuHomeExport', 'PuHomeDiff', 'PuHomeFill'];
  /* 주석은 걷고 본다 — 주석에 적힌 이름까지 잡으면 «잘 쓴 주석»이 검사를 깨뜨린다 */
  const 코드 = html.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
  const 빠진것 = [];
  부품.forEach(모듈 => {
    const mod = ctx[모듈];
    if (!mod) return;
    const re = new RegExp(모듈 + '\\.([A-Za-z_$][\\w$]*)', 'g');
    let m;
    while ((m = re.exec(코드))) {
      if (!(m[1] in mod)) 빠진것.push(모듈 + '.' + m[1]);
    }
  });
  assert.deepEqual([...new Set(빠진것)], [],
    '★ 화면이 부르는데 부품이 안 내놓는 것이 있습니다 — 그 자리를 누르면 터집니다');
});

/* ══════ 로그인 — 여기서 막혔다 (2026-08-31) ══════
   ★ 편집 주소는 «로그인돼 있어야만» 열린다(아니면 서버가 403 을 내고,
     브라우저에는 그냥 홈페이지 화면이 뜬다). 곁말로 「(로그인은 처음 한 번만)」이라고만
     적어 두었더니, 어디서 막힌 건지 알 길이 없었다. */

test('★ 홈페이지로 보내는 안내는 «로그인»을 걸음으로 말하고, 로그인할 자리를 준다', async () => {
  const ctx = pageBox();
  ctx.App = { draft: { kind: 'member', key: 'a', srl: '193', name: '박성수' },
              members: { a: { name: '박성수', srl: '193' } } };
  ctx.say = async () => {};
  run(ctx, fnSource('modalFoot') + '\n' + fnSource('copyPrivate'));
  await ctx.copyPrivate('a');
  const h = ctx.shown[0];
  assert.match(h, /로그인/, '★ 로그인해야 한다는 말이 없습니다 — 여기서 막힙니다');
  /* 말만 하지 않고 «누를 자리»를 준다 */
  assert.ok(h.indexOf(ctx.PuHomeExport.loginUrl()) >= 0,
    '★ 로그인하라면서 어디서 하는지는 안 알려 줍니다');
  /* 안 될 때 «무엇이 보이는지»를 미리 말해 준다 */
  assert.match(h, /그냥 홈페이지/, '★ 로그인이 안 됐을 때 무엇이 보이는지 안 알려 줍니다');
});
