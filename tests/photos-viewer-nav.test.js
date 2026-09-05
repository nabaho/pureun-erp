'use strict';
/* 크게 보기 — 앞뒤 넘기기 · 올린 날짜 크게 (대표 지시 2026-08-17)

   "사진첩에서 다음페이지 앞뒤로 넘어가기 있었으면 좋겠다.
    그리고 올린날짜를 년도 월 일 을 좀더 크게해서 한번에 볼 수 있었으면 좋겠다."

   ⚠ 예전에는 다음 장을 보려면 **매번 닫고 격자에서 다시 눌러야** 했고,
     제목줄 날짜에는 **연도가 아예 없었다**(「8월 13일」).

   글자 찾기가 아니라 **함수를 뽑아 실제로 돌려** 확인한다 —
   「목록 안에서만 넘어간다」·「끝에서 멈춘다」는 조건을 죽여도 낱말은 그대로 남는다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const app = fs.readFileSync(path.join(__dirname, '..', 'pu-photos.html'), 'utf8');

/* 함수 하나를 중괄호 짝을 세어 뽑는다.
   ⚠ `function X\([\s\S]*?\n\}` 식 정규식은 **열 0 의 첫 중괄호**에서 끊긴다 —
     이 저장소에서 여러 번 당한 함정이다. */
function cut(src, decl) {
  const head = src.indexOf(decl);
  assert.notEqual(head, -1, decl + ' 을 찾지 못했습니다 — 이름이 바뀌었나요?');
  let i = src.indexOf('{', head + decl.length), depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (!depth) break; }
  }
  return src.slice(head, i + 1);
}
/* 주석을 걷어 낸다 — 안 그러면 **주석에 적힌 낱말**을 보고 통과한다(전례 있음). */
function code(s) { return String(s).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' '); }

/* 넘기기 세 함수를 가짜 목록 위에 올려 **실제로 돌린다.**
   shownItems·idsOf·openViewer 를 우리가 끼워 넣어, 어디로 갔는지 받아 본다. */
function navWorld(list, startId, editing) {
  /* 뽑아 온 함수들은 바깥의 전역 `viewerId` 를 읽는다 —
     가짜 세상에서도 같은 이름이 보이도록 `var viewerId` 를 함께 선언해 둔다. */
  const src = 'var viewerId;\n' +
    cut(app, 'function photoNavAt(') + '\n' +
    cut(app, 'function photoWhere(') + '\n' +
    cut(app, 'function renderPicNav(') + '\n' +
    cut(app, 'function gotoPhoto(') + '\n' +
    'return { at: photoNavAt, where: photoWhere, render: renderPicNav, go: gotoPhoto,' +
    '         set: function (id) { viewerId = id; } };';

  const opened = [];
  const els = { picPrev: { style: {}, disabled: false }, picNext: { style: {}, disabled: false } };
  /* 2026-08-29: 편집 중에는 사진을 안 넘긴다(그은 사각형이 엉뚱한 사진에 얹힌다).
     여기서는 편집 중이 아니라고 둔다 — 넘기기 자체가 이 파일의 주제다. */
  const api = new Function('shownItems', 'idsOf', 'openViewer', '$', 'photoEditing', src)(
    function () { return list; },
    function (it) { return (it && it._pages && it._pages.length) ? it._pages.slice() : (it ? [it.id] : []); },
    function (id) { opened.push(id); api.set(id); },
    function (k) { return els[k]; },
    function () { return !!editing; });
  api.set(startId);
  return { api: api, opened: opened, els: els };
}

const LIST = [{ id: 'a' }, { id: 'b', _pages: ['b', 'b2', 'b3'] }, { id: 'c' }];

test('앞뒤 사진 넘기기', async (t) => {
  await t.test('★ 다음·이전으로 넘어간다', () => {
    const w = navWorld(LIST, 'a');
    w.api.go(1);
    assert.deepEqual(w.opened, ['b'], '다음 장으로 안 넘어갔습니다.');
    w.api.go(-1);
    assert.deepEqual(w.opened, ['b', 'a'], '이전 장으로 안 돌아왔습니다.');
  });

  await t.test('★ 끝에서 멈춘다 — 첫 장 앞·마지막 장 뒤로 안 간다', () => {
    const first = navWorld(LIST, 'a');
    first.api.go(-1);
    assert.deepEqual(first.opened, [], '첫 장인데 더 앞으로 갔습니다.');
    const last = navWorld(LIST, 'c');
    last.api.go(1);
    assert.deepEqual(last.opened, [], '마지막 장인데 더 뒤로 갔습니다 — 목록 밖은 빈 화면입니다.');
  });

  await t.test('★ 여러 쪽짜리 문서의 **가운데 쪽**에서도 제자리를 안다', () => {
    /* 접힌 문서는 6쪽이 한 칸으로 서 있고, 쪽 넘기기로 3쪽에 가 있을 수 있다.
       id 를 그대로 찾으면 못 찾아 넘기기가 죽는다. */
    const w = navWorld(LIST, 'b3');
    assert.equal(w.api.at().at, 1, '문서 안쪽 쪽에서 제자리를 잃었습니다.');
    w.api.go(1);
    assert.deepEqual(w.opened, ['c'], '문서 가운데 쪽에서 다음 문서로 못 갔습니다.');
  });

  await t.test('★ 첫 장·마지막 장에서는 화살표를 흐린다 (없애지 않는다)', () => {
    const first = navWorld(LIST, 'a');
    first.api.render();
    assert.equal(first.els.picPrev.disabled, true, '첫 장인데 이전 화살표가 살아 있습니다.');
    assert.equal(first.els.picNext.disabled, false);
    assert.notEqual(first.els.picPrev.style.display, 'none',
      '화살표가 사라지면 자리가 흔들려 옆 단추를 잘못 누릅니다.');

    const last = navWorld(LIST, 'c');
    last.api.render();
    assert.equal(last.els.picNext.disabled, true, '마지막 장인데 다음 화살표가 살아 있습니다.');
  });

  await t.test('★ 한 장뿐이면 화살표를 아예 안 낸다', () => {
    const w = navWorld([{ id: 'a' }], 'a');
    w.api.render();
    assert.equal(w.els.picPrev.style.display, 'none', '눌러도 아무 일 없는 화살표는 고장으로 보입니다.');
    assert.equal(w.api.where(), '', '「1 / 1장」은 자리만 먹습니다.');
  });

  await t.test('★ 「몇 번째 / 몇 장」을 센다', () => {
    assert.equal(navWorld(LIST, 'b').api.where(), '2 / 3장');
    assert.equal(navWorld(LIST, 'c').api.where(), '3 / 3장');
  });

  await t.test('★ 목록에 없는 사진이면 넘기지 않는다', () => {
    /* 지워졌거나 걸러보기 밖으로 나간 사진 — 자리를 모르는 채 넘기면
       엉뚱한 장으로 튄다. */
    const w = navWorld(LIST, 'zzz');
    w.api.go(1); w.api.go(-1);
    assert.deepEqual(w.opened, []);
    w.api.render();
    assert.equal(w.els.picPrev.style.display, 'none');
  });
});

test('★ 보고 있는 목록 안에서만 넘어간다', () => {
  /* 폴더·종류 탭·검색으로 좁혀 놓았으면 그 안에서만 돌아야 한다.
     `gridItems`(전체)를 쓰면 격자에 안 보이는 사진으로 튀어 어디로 간 건지 모른다. */
  const body = code(cut(app, 'function photoNavAt('));
  assert.match(body, /shownItems\(\)/, '보고 있는 목록이 아니라 다른 것을 봅니다.');
  assert.doesNotMatch(body, /gridItems/, '걸러보기를 무시하고 전체에서 넘깁니다.');
});

test('올린 날짜를 크게', async (t) => {
  /* 날짜 글을 만드는 함수를 실제로 돌린다 — 「연도가 있나」가 이 고침의 핵심이라
     낱말 찾기로는 못 박히지 않는다(예전 글에도 「년」이 들어 있었다). */
  const f = new Function('photoTime', cut(app, 'function viewerDateText(') + '\nreturn viewerDateText;')(
    function (it) { return it.ts; });

  await t.test('★ 연도·월·일이 모두 들어간다', () => {
    const s = f({ ts: new Date(2026, 7, 13, 20, 59).getTime() });
    assert.equal(s, '2026년 8월 13일', '연도가 빠지면 몇 년 것인지 알 수 없습니다: ' + s);
  });

  await t.test('오늘이면 (오늘)을 붙인다', () => {
    assert.match(f({ ts: Date.now() }), /\(오늘\)$/);
  });

  await t.test('때를 모르면 빈 줄 — 「1970년」을 적지 않는다', () => {
    assert.equal(f({ ts: 0 }), '');
  });

  await t.test('★ 날짜가 다른 글자보다 크다', () => {
    /* ⚠ 바로 위 `#viewer .bar span` 이 12.5px 를 못 박고 있어, `#viewerInfo .d`
       만으로는 **진다**(날짜가 안 커진다). id 를 한 번 더 얹어야 이긴다. */
    const m = app.match(/#viewer \.bar #viewerInfo \.d\{[^}]*font-size:(\d+(?:\.\d+)?)px/);
    assert.ok(m, '날짜 줄 규칙이 없거나 힘이 모자랍니다(#viewer .bar 로 시작해야 이깁니다).');
    const big = Number(m[1]);
    const sub = Number((app.match(/#viewer \.bar #viewerInfo \.s\{[^}]*font-size:(\d+(?:\.\d+)?)px/) || [])[1]);
    assert.ok(big >= 16, '날짜가 충분히 크지 않습니다(' + big + 'px).');
    assert.ok(big > sub, '날짜가 아랫줄보다 커야 한눈에 들어옵니다(' + big + ' vs ' + sub + ').');
  });

  await t.test('★ 제목줄을 두 줄로 그린다 — 날짜와 나머지를 가른다', () => {
    /* ⚠ 「class="d" 라는 낱말이 있나」로는 부족하다. **실제로 그려** 두 줄이
       나오는지, 그리고 이름에 든 꺾쇠가 화면을 깨지 않는지 본다 —
       한쪽만 감싸도 다른 쪽 낱말이 남아 낱말 찾기는 통과한다(뮤테이션에서 걸렸다). */
    /* ⚠ style 도 함께 준다 — 제목줄이 「📄 한글 원본」 단추를 켜고 끈다(2026-09-05).
       없으면 그리는 도중에 넘어져 «두 줄인가»를 보기도 전에 깨진다. */
    const el = { innerHTML: '', style: {} };
    /* 📌 증빙 알약이 늘었다(2026-08-26) — 그 둘도 함께 넣어야 제목줄이 그려진다 */
    const f = new Function('$', 'photoTime', 'docLabel', 'photoWhere', 'esc', 'isUsed', 'usedWhereShort',
      cut(app, 'function viewerDateText(') + '\n' +
      /* 원본 단추 판정도 «진짜 것»을 넣는다 — 가짜를 넣으면 이 검사가
         「그려지더라」만 보고 실제 판정이 깨진 것을 못 잡는다 */
      cut(app, 'function origOf(') + '\n' +
      cut(app, 'function renderViewerTitle(') + '\nreturn renderViewerTitle;')(
      function () { return el; },
      function (it) { return it.ts; },
      function () { return '<img src=x>서식'; },
      function () { return '12 / 48장'; },
      function (s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); },
      function (m) { return !!(m && m.used && m.used.at); },
      function (m) { return (m && m.used && m.used.where) || ''; });

    f({ ts: new Date(2026, 7, 13).getTime(), meta: { kind: 'doc', byName: '<b>권형하' } });
    assert.match(el.innerHTML, /<span class="d">2026년 8월 13일<\/span>/, '날짜 줄이 없습니다.');
    assert.match(el.innerHTML, /<span class="s">/, '아랫줄이 없습니다.');
    assert.match(el.innerHTML, /12 \/ 48장/, '몇 번째인지가 안 적힙니다.');
    assert.doesNotMatch(el.innerHTML, /<b>|<img/,
      '이름·서식명을 그대로 넣었습니다 — 꺾쇠가 든 이름 하나로 제목줄이 통째로 깨집니다.');

    /* 📌 증빙으로 쓴 사진에는 어디에 썼는지가 한 줄 더 붙는다 (2026-08-26) —
       안 쓴 사진에는 «안» 붙어야 한다(늘 뜨면 아무도 안 읽는다). */
    assert.doesNotMatch(el.innerHTML, /증빙으로 씀/, '안 쓴 사진에 증빙 알약이 붙었습니다');
    f({ ts: new Date(2026, 7, 13).getTime(),
        meta: { kind: 'doc', byName: '권형하', used: { at: 1, where: '푸른이알피 계약 — <b>가나' } } });
    assert.match(el.innerHTML, /<span class="u">📌 증빙으로 씀 · /, '★ 증빙 알약이 안 붙습니다');
    assert.doesNotMatch(el.innerHTML, /<b>/,
      '어디에 썼는지를 그대로 넣었습니다 — 꺾쇠가 든 업체 이름 하나로 제목줄이 깨집니다');

    /* 사진이 없으면 아무것도 안 그린다 — 지운 뒤 옛 제목이 남으면 안 된다 */
    el.innerHTML = '남은 것';
    f(null);
    assert.equal(el.innerHTML, '');
  });
});

test('넘길 때 지켜야 하는 것들', async (t) => {
  const open = code(cut(app, 'function openViewer('));

  await t.test('★ 넘길 때 확대를 푼다', () => {
    /* 확대한 채로 넘어가면 다음 사진의 엉뚱한 귀퉁이가 보인다. */
    assert.match(open, /classList\.remove\('zoom'\)/, '확대가 안 풀립니다.');
    assert.match(open, /scrollTop = 0/, '확대를 풀어도 스크롤이 남으면 여전히 귀퉁이가 보입니다.');
  });

  await t.test('★ 넘길 때 역사 칸을 또 쌓지 않는다', () => {
    /* 넘길 때마다 쌓으면 48장을 넘겨 본 뒤 뒤로 가기를 48번 눌러야 나간다. */
    assert.match(open, /if \(!viewerId\) viewerHistPush\(\)/,
      '넘길 때마다 역사에 칸이 쌓입니다.');
  });

  await t.test('★ 글을 쓰는 중에는 ← → 가 안 넘긴다', () => {
    const t2 = new Function(code(cut(app, 'function typingNow(')) + '\nreturn typingNow;')();
    const fake = function (tag, ce) { return { tagName: tag, isContentEditable: !!ce }; };
    global.document = { activeElement: fake('INPUT') };
    assert.equal(t2(), true, '입력칸에서 화살표를 가로채면 쓰던 글이 사라진 것처럼 보입니다.');
    global.document = { activeElement: fake('TEXTAREA') };
    assert.equal(t2(), true, '메모칸에서 화살표를 가로챕니다.');
    global.document = { activeElement: fake('DIV', true) };
    assert.equal(t2(), true, '직접 고치는 칸에서 화살표를 가로챕니다.');
    global.document = { activeElement: fake('BODY') };
    assert.equal(t2(), false, '아무 데도 안 쓰는데 화살표가 안 먹습니다.');
    delete global.document;
  });

  await t.test('★ 화살표 클릭이 확대로 새지 않는다', () => {
    /* 사진을 누르면 원본 크기로 열린다 — 막지 않으면 넘기면서 확대가 켜졌다 꺼졌다 한다. */
    const bar = app.slice(app.indexOf('class="picnav prev"'), app.indexOf('class="picnav prev"') + 600);
    assert.match(bar, /event\.stopPropagation\(\);gotoPhoto\(-1\)/);
    assert.match(bar, /event\.stopPropagation\(\);gotoPhoto\(1\)/);
  });

  await t.test('★ 쪽 넘기기(◀ 1/6쪽 ▶)와 자리도 글자도 갈라 둔다', () => {
    /* 한 문서 안의 쪽 넘기기는 판 위 도구줄에 그대로 있어야 한다 —
       둘이 섞이면 「쪽을 넘기려다 다음 문서로」 가 된다. */
    assert.match(code(cut(app, 'function docNavBtns(')), /쪽/, '쪽 넘기기가 사라졌습니다.');
    assert.match(code(cut(app, 'function photoWhere(')), /장/, '사진 넘기기는 「장」으로 셉니다.');
  });
});
