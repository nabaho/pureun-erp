/* 표의 한 칸은 «한 줄»이다 (대표 지시 2026-08-30)
 *
 *   「한줄로 정리해라 빈공간이 많다 넓을경우 2줄로 절대 만들지마라
 *    데이터 정보넣을때 줄의 공간이 넓으면 2줄로 만들지 마라」
 *
 * ■ 무슨 일이 있었나
 *   거래내역 적요 아래에 「0」만 적힌 둘째 줄이 322줄 내내 붙어 있었다.
 *   엑셀에서 딸려온 잔액인데 값이 없다 — 아무것도 안 알려 주면서
 *   표 높이만 두 배로 만들었다. 오른쪽에는 빈 자리가 넉넉한데도
 *   칸을 maxWidth:140px 로 조여 두고 세로로 쌓고 있었다.
 *
 * ★ 한 줄만 두 줄이 되어도 «표 전체»가 그만큼 길어진다.
 *   화면 한 장에 보이던 것이 반으로 줄고, 같은 것을 보려고 두 배로 스크롤한다.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const R = path.join(__dirname, '..');
const ERP = fs.readFileSync(path.join(R, 'pu-erp.html'), 'utf8');

/* ⚠ 주석을 걷는다 — 이 규칙을 설명하는 주석이 규칙 자체로 읽히면 안 된다. */
function bare(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}
function cutFn(src, head) {
  const i = src.indexOf(head);
  assert.ok(i >= 0, '못 찾음: ' + head);
  let d = 0;
  for (let k = src.indexOf('{', i); k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (d === 0) return src.slice(i, k + 1); }
  }
  throw new Error('닫는 괄호 없음: ' + head);
}

/* ── 「말을 하는 값인가」를 실제로 돌려 본다 ── */
const ctx = { window: {}, console };
vm.createContext(ctx);
vm.runInContext(ERP.slice(ERP.indexOf('var ERP_EMPTY_NOTE ='),
  ERP.indexOf('try { window.erpNoteWorth')), ctx);
const worth = ctx.erpNoteWorth;

test('★★ 「0」처럼 아무것도 안 알려 주는 값은 «안 그린다»', () => {
  ['0', ' 0 ', '0.0', '-', '--', '', '   ', '0 / 0', '·', '—'].forEach(function (v) {
    assert.strictEqual(worth(v), false,
      '★★ 「' + v + '」 는 아무것도 안 알려 주는데 자리는 차지한다 — 322줄이면 322줄이 두 배가 된다');
  });
  assert.strictEqual(worth(null), false);
  assert.strictEqual(worth(undefined), false);
});

test('★★ 말을 하는 값은 «반드시 그린다» — 넓게 잡아 진짜 정보를 지우면 안 된다', () => {
  ['계좌번호 680******45904', '교보01-047', '0원 이체', '10', '0건 접수',
   '2026-08-30', '나이스빌 CMS'].forEach(function (v) {
    assert.strictEqual(worth(v), true,
      '★★ 「' + v + '」 는 사람이 봐야 하는 값인데 지운다 — 빈 값 걷기가 넓으면 장부가 사라진다');
  });
});

test('★ 숫자 0 을 «금액 칸»에서 지우는 데는 쓰지 않는다', () => {
  /* 0원·잔액 0원은 진짜 정보다. 이 잣대는 «곁들이 글»에만 쓴다 —
     그래서 숫자 칸에서 부르고 있으면 안 된다. */
  const src = bare(ERP);
  assert.ok(!/erpNoteWorth\(row\.amount\)|erpNoteWorth\(r\.amount\)|erpNoteWorth\(row\.balance\)/.test(src),
    '★★ 금액·잔액에 이 잣대를 대면 「0원」이 화면에서 사라진다 — 그것은 진짜 값이다');
});

/* ── 거래내역 적요 칸이 한 줄인가 ── */
function expenseMemoCell() {
  const src = bare(ERP);
  const i = src.indexOf("maxWidth:'360px'");
  assert.ok(i >= 0, '★ 적요 칸을 못 찾음 — 좁은 채로 되돌아갔을 수 있다');
  /* 그 td 하나만 자른다 */
  const start = src.lastIndexOf("h('td'", i);
  let d = 0;
  for (let k = src.indexOf('(', start); k < src.length; k++) {
    if (src[k] === '(') d++;
    else if (src[k] === ')') { d--; if (d === 0) return src.slice(start, k + 1); }
  }
  throw new Error('적요 칸의 끝을 못 찾음');
}

test('★★ 적요 칸은 «한 줄»로 선다 — 세로로 쌓지 않는다', () => {
  const cell = expenseMemoCell();
  assert.ok(/display:'flex',alignItems:'center',gap:'5px',\s*whiteSpace:'nowrap'/.test(cell),
    '★★ 세로로 쌓으면 그 줄만 키가 커져 표 전체가 성글어진다');
  /* 곁들이 표들이 «줄을 내리려고» 넣던 것이 남아 있으면 안 된다 */
  assert.ok(!/marginTop:'2px'/.test(cell),
    '★★ marginTop 이 남아 있으면 그 표만 다음 줄로 내려가 다시 두 줄이 된다');
});

test('★★ 적요가 길면 «자르고» 전문은 title 에 둔다 — 접어서 두 줄로 만들지 않는다', () => {
  const cell = expenseMemoCell();
  assert.ok(/textOverflow:'ellipsis'/.test(cell),
    '★★ 안 자르면 긴 적요가 접혀서 결국 두 줄이 된다');
  assert.ok(/title:row\.memo/.test(cell),
    '★★ 자르기만 하고 전문을 안 남기면, 잘린 가게 이름을 확인할 길이 없어진다');
});

test('★★ 빈 값(「0」)을 «자리만 채워» 그리지 않는다', () => {
  const cell = expenseMemoCell();
  assert.ok(/erpNoteWorth\(row\.note\)/.test(cell),
    '★★ 값이 있는지만 보면 「0」도 그린다 — 그것이 322줄을 두 배로 만든 원인이다');
});

/* ══ 온 화면을 훑는다 — 한 곳만 고치면 다음 달에 또 생긴다 ══════════════
   ⚠ 대표: 「2줄된곳 모두 찾아고쳐라」. 손으로 훑으면 반드시 빠뜨린다.
     그래서 사람이 아니라 «기계»가 온 파일을 센다. */
const HTML_DIR = R;

/* 문자열을 건너뛰며 괄호를 맞춘다 — 따옴표 안의 괄호에 속지 않게 */
function skipString(s, k, end) {
  const q = s[k];
  for (k++; k < end; k++) { if (s[k] === '\\') { k++; continue; } if (s[k] === q) break; }
  return k;
}
function matchParen(s, from) {
  let d = 0;
  for (let k = s.indexOf('(', from); k < s.length; k++) {
    const c = s[k];
    if (c === "'" || c === '"' || c === '`') { k = skipString(s, k, s.length); continue; }
    if (c === '(') d++;
    else if (c === ')') { d--; if (d === 0) return k; }
  }
  return -1;
}
/* 그 부름 «바로 아래» 자식으로 온 h('div' 의 «자리»들 */
function divKids(s, argStart, end) {
  const out = []; let d = 0;
  for (let k = argStart; k < end; k++) {
    const c = s[k];
    if (c === "'" || c === '"' || c === '`') { k = skipString(s, k, end); continue; }
    if (c === '(' || c === '{' || c === '[') d++;
    else if (c === ')' || c === '}' || c === ']') d--;
    else if (d === 0 && s.startsWith("h('div'", k)) out.push(k);
  }
  return out;
}
/* ⚠★ 한 겹 «감싼» 것까지 본다.
   div 하나로 감싸고 그 «안»에 div 를 형제로 두면, 겉보기에는 자식이 하나라
   바로 아래만 세는 검사는 조용히 통과한다 — 화면은 그대로 두 줄인데도.
   2026-08-30 에 되돌리기 시험(ⓐ)이 그 구멍을 잡아 줬다. */
function stackedDivs(s, at, close) {
  const argStart = s.indexOf('(', at) + 1;
  const kids = divKids(s, argStart, close);
  if (kids.length >= 2) return kids.length;
  if (kids.length === 1) {
    const inner = kids[0];
    const innerClose = matchParen(s, inner);
    if (innerClose > 0) {
      const sub = divKids(s, s.indexOf('(', inner) + 1, innerClose);
      if (sub.length >= 2) return sub.length;
    }
  }
  return 0;
}

/* ⚠ 봐주는 자리는 «까닭과 함께» 적는다. 까닭 없이 늘어나면 이 검사는 죽는다.
   ⚠ 줄 번호로 봐주지 않는다 — 줄은 밀린다. «그 자리에만 있는 글»로 찾는다. */
const ALLOW = [
  { mark: "onClick:function(){setSelSid(u.sid);setTab('individual');}",
    why: '달력 칸 — 한 칸이 하루다. 안에 든 div 는 위아래로 쌓이는 글이 아니다' },
  { mark: 'openContribEdit(rec, r.u)',
    why: '달력 칸(월별 기여금) — 위와 같다' },
  { mark: "// ── 입금: 미입금 항목 매칭 드롭다운 ──",
    why: '양자택일(삼항연산자) — 둘 중 하나만 그려지므로 쌓이지 않는다' },
  { mark: "gridTemplateColumns:IS_MOBILE?'1fr':'1fr 1fr'",
    why: '펼친 상세 패널 — 표의 한 줄이 아니라 줄 아래로 여는 판이다' },
];

test('★★ 어느 화면에도 «칸 안에 쌓은 곳»이 남아 있지 않다', () => {
  const files = fs.readdirSync(HTML_DIR).filter((f) => f.endsWith('.html'));
  const left = [];
  files.forEach((f) => {
    /* 주석은 걷되 «줄 수»는 지킨다 — 몇 줄인지 말해 줘야 찾아간다 */
    const src = fs.readFileSync(path.join(HTML_DIR, f), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
    ['td', 'th'].forEach((cell) => {
      let i = 0;
      while ((i = src.indexOf("h('" + cell + "'", i)) >= 0) {
        const close = matchParen(src, i);
        if (close > 0) {
          const call = src.slice(i, close + 1);
          if (stackedDivs(src, i, close) >= 2
              && !ALLOW.some((a) => call.indexOf(a.mark) >= 0)) {
            left.push(f + ':' + src.slice(0, i).split('\n').length);
          }
        }
        i += 4;
      }
    });
  });
  assert.deepStrictEqual(left, [],
    '★★ 칸 안에 div 를 형제로 두면 세로로 쌓인다 — span 으로 바꿔 flex 한 줄에 세우세요.\n'
    + '   한 줄만 두 줄이 되어도 표 «전체»가 그만큼 길어집니다.\n'
    + '   달력 칸처럼 정말 쌓아야 하는 자리면 이 검사의 ALLOW 에 «까닭과 함께» 적으세요.');
});

test('★★ 명함첩 표가 곁들이 글을 «줄 내려» 붙이지 않는다', () => {
  const css = fs.readFileSync(path.join(HTML_DIR, 'pu-cards.html'), 'utf8');
  /* display:block 한 줄이 이 표의 «모든 줄»을 두 줄로 만들고 있었다 */
  assert.ok(!/table\.sbox td span\.e\{[^}]*display:block/.test(css),
    '★★ 곁들이 글에 display:block 을 주면 표 «전체» 높이가 두 배가 된다');
  assert.ok(!/table\.sbox td\.w span\{[^}]*display:block/.test(css),
    '★★ 위와 같다 — 한 줄 고치는 것이 아니라 표 전체를 고치는 일이다');
});

test('★★ 취업규칙 표가 <br> 로 줄을 내리지 않는다', () => {
  const src = fs.readFileSync(path.join(HTML_DIR, 'rules.html'), 'utf8');
  /* 표 칸 안에서 <br> 로 줄을 내리던 자리들 — 이제 옆에 붙는다 */
  const bad = (src.match(/<td[^>]*>(?:(?!<\/td>)[\s\S]){0,300}?<br\s*\/?>/gi) || []);
  assert.strictEqual(bad.length, 0,
    '★★ 표 칸에서 <br> 로 줄을 내리면 그 줄만 키가 커진다 — margin-left 로 옆에 붙이세요 '
    + '(남은 곳 ' + bad.length + ')');
});

/* ⚠★ fund.html 은 «정부 제출 서식»이라 여기서 보지 않는다.
   「기본재산<br>현황<br>(천원)」처럼 줄바꿈이 서식의 «모양 그 자체»다 —
   걷어 내면 제출용 표가 무너진다. 화면에 뿌리는 자료 표와 다른 물건이다. */
test('★ 정부 서식(fund.html)은 이 규칙에서 «일부러» 뺀다', () => {
  const src = fs.readFileSync(path.join(HTML_DIR, 'fund.html'), 'utf8');
  assert.ok(/기본재산<br>현황/.test(src),
    '★ 서식의 줄바꿈이 사라졌다 — 제출용 표의 모양이 바뀌었을 수 있다');
});

/* ══ 감싸개가 «태그를 삼키지» 않았는가 (2026-08-30) ═══════════════════════
   ⚠★ 실제로 그랬다. 두 줄을 한 줄로 바꾸는 도구가 감싸개를 잘못된 자리에 넣어
      h( 다음에 태그('td') 대신 h('div',…) 가 오게 만들었다:
        h( h('div',{…},'td',{style},…) )
      ★ 문법은 «맞다» — 그래서 구문검사 10덩이가 모두 통과했다.
        화면만 안 그려진다. 열아홉 칸이 통째로 사라질 뻔했다.
   ★ h( 다음에는 «반드시» 따옴표(태그 이름)나 이름(컴포넌트)이 온다.
     h( 다음에 바로 h( 가 오면 그것은 삼킨 것이다. */
test('★★ h( 다음에 곧바로 h( 가 오는 곳이 없다 — 태그를 삼킨 자리다', () => {
  const files = fs.readdirSync(HTML_DIR).filter((f) => f.endsWith('.html'));
  const bad = [];
  files.forEach((f) => {
    const src = fs.readFileSync(path.join(HTML_DIR, f), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
    const re = /\bh\(\s*h\(/g;
    let m;
    while ((m = re.exec(src))) bad.push(f + ':' + src.slice(0, m.index).split('\n').length);
  });
  assert.deepStrictEqual(bad, [],
    '★★ h( 다음에 h( 가 왔습니다 — 태그 자리에 다른 표가 들어갔습니다.\n'
    + '   문법은 맞아서 구문검사는 통과하지만 «화면이 안 그려집니다».');
});
