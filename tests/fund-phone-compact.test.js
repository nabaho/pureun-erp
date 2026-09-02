/* 기금관리 — 폰에서 «컴팩트하게», 참여사업장은 «한눈에» (대표 지시 2026-09-02)
   「기금관리 폰에서 콤팩트하게 그리고 기업들 정보도 어떻게 하는게 한눈에 볼 수 있는 방법이」

   무엇이 문제였나 (411px 크로미움 실측, 대표 갈무리와 같은 구성):
     · 지역기금 목록: 한 줄 101px. .mo 로 부담당·대표자를 접어도 여섯 칸이라
       기금명이 «한 글자씩» 세로로 쌓이고 주담당 「김혜민」도 두 줄이 됐다.
     · 참여사업장 명부: 열 칸이라 표가 아예 옆으로 밀렸다(521px > 373px).
       소재지는 화면 밖에서 잘려 «자리는 먹고 안 보이는» 칸이었다. 한 줄 131~146px.

   고친 뒤: 지역기금 101→56px · 참여사업장 131→30px · 옆으로 밀림 없음(373=373)

   ★ 처방은 work.html 과 같다 — 우겨 넣지도, 옆으로 밀지도 않고 «폰에서 안 쓰는 칸을 뺀다».
     자료를 지우는 것이 아니다. 줄을 누르면 자세히 창에 전부 그대로 있다.

   지키는 규칙:
     ① 폰에서 접는 켜(.ph)가 «있다» — 여백만 줄이면 411px 에서는 안 는다
     ② ★ 머리와 몸통이 «같은 칸»을 접는다 — 어긋나면 값이 옆으로 한 칸씩 밀린다
     ③ ★ 접고도 «기업을 알아볼 칸»은 남는다 (상호·업종·상시근로자)
     ④ 표 안 드롭다운이 줄 키를 정한다 — 줄마다 style= 로 박혀 있어 !important 가 필요하다
     ⑤ ★ 규모 막대는 숫자와 «같은 줄»이다 — 아래에 깔면 표가 두 배로 길어진다
     ⑥ ★ 「한눈에」 스위치는 «순서만» 바꾼다 — 자료를 건드리지 않는다
     ⑦ ★ 접은 칸은 «편집 폼에 그대로» 있다 — 보기에서 뺀 것이지 지운 것이 아니다
   실행: node --test tests/fund-phone-compact.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.join(__dirname, '..', 'fund.html'), 'utf8');

/* 중괄호 짝을 세어 구간을 떼어 온다 */
function 덩어리(시작표시) {
  const at = src.indexOf(시작표시);
  assert.ok(at > 0, '못 찾음: ' + 시작표시);
  let 깊이 = 0, i = src.indexOf('{', at);
  const s = i;
  for (; i < src.length; i++) {
    if (src[i] === '{') 깊이++;
    else if (src[i] === '}') { 깊이--; if (!깊이) break; }
  }
  return src.slice(s + 1, i);
}

/* 태그를 «나온 차례대로» 훑어 「접히는가」만 남긴다 */
function 접힘표(글, 태그) {
  const re = new RegExp('<' + 태그 + '(\\s[^>]*)?>', 'g');
  const out = [];
  let m;
  while ((m = re.exec(글))) {
    const attr = m[1] || '';
    const cls = /class="([^"]*)"/.exec(attr);
    out.push(!!(cls && /\bph\b/.test(cls[1])));
  }
  return out;
}

test('★① 폰에서 접는 켜(.ph)가 있다 — 여백만 줄여서는 411px 에 안 들어간다', () => {
  const at = src.indexOf('@media (max-width:600px){');
  assert.ok(at > 0, '폰 구간이 없습니다');
  const 안 = src.slice(at, src.indexOf('\n  }', at));
  assert.match(안, /\.ph\{display:none\}/, '★ 접는 켜가 없습니다');
  /* .mo(부담당·대표자) 는 그대로 살아 있어야 한다 — 둘을 합치면 되돌릴 수 없다 */
  assert.match(안, /\.mo\{display:none\}/, '먼저 있던 접는 켜가 사라졌습니다');
});

test('★④ 표 안 드롭다운을 폰에서 눌러 둔다 — 줄마다 style= 로 박혀 있다', () => {
  const at = src.indexOf('@media (max-width:600px){');
  const 안 = src.slice(at, src.indexOf('\n  }', at));
  const m = /td select\{([^}]*)\}/.exec(안);
  assert.ok(m, '★ 드롭다운이 줄 키를 정하는데 폰 규칙이 없습니다');
  assert.match(m[1], /!important/,
    '★ 줄마다 style="padding:3px 6px…" 가 박혀 있어 !important 가 없으면 «적혀만 있고 안 듣습니다»');
});

/* ── ② 참여사업장 명부: 머리와 몸통이 같은 칸을 접는가 ── */
test('★★② 참여사업장 — 머리와 몸통이 «같은 칸»을 접는다', () => {
  const 몸통 = 덩어리('var rows=arr.map(function(s,i){');
  const at = src.indexOf("'<div style=\"overflow-x:auto\"><table><thead><tr><th>번호</th><th>상호</th>");
  assert.ok(at > 0, '명부 머리줄을 못 찾았습니다');
  const 머리 = src.slice(at, src.indexOf('</thead>', at));

  const h = 접힘표(머리, 'th');
  const b = 접힘표(몸통, 'td');
  assert.equal(h.length, b.length,
    '★★ 머리 ' + h.length + '칸 · 몸통 ' + b.length + '칸 — 칸 수가 다르면 값이 옆으로 밀립니다');
  assert.deepEqual(b, h,
    '★★ 접는 자리가 머리와 몸통에서 어긋났습니다 — 폰에서 상호 아래에 사업자번호가 들어옵니다');
});

test('★③ 접고도 «기업을 알아볼 칸»은 남는다 — 상호·업종·상시근로자', () => {
  const 몸통 = 덩어리('var rows=arr.map(function(s,i){');
  /* 한 기업을 한 줄로 알아보는 데 필요한 세 가지가 폰에서 살아 있는가 */
  for (const [자국, 무엇] of [
    [/<td([^>]*)>'\+esc\(s\.name/, '상호'],
    [/<td([^>]*)>'\+esc\(s\.biz_type/, '업종'],
    [/<td([^>]*)>'\+bar\+\(emp/, '상시근로자'],
  ]) {
    const m = 자국.exec(몸통);
    assert.ok(m, 무엇 + ' 칸을 못 찾았습니다');
    assert.ok(!/\bph\b/.test(m[1]),
      '★ ' + 무엇 + ' 을 폰에서 접었습니다 — 남은 칸만 보고는 어느 기업인지 알 수 없습니다');
  }
  /* 남은 칸이 너무 적어도 안 된다(빈자리) · 너무 많아도 안 된다(다시 밀린다) */
  const 남은 = 접힘표(몸통, 'td').filter((x) => !x).length;
  assert.ok(남은 >= 4 && 남은 <= 6,
    '★ 폰에 남긴 칸이 ' + 남은 + '개입니다 — 넷보다 적으면 빈자리가 남고, 여섯을 넘으면 다시 옆으로 밀립니다');
});

test('★⑤ 규모 막대는 숫자와 «같은 줄»이다 — 아래에 깔면 표가 두 배가 된다', () => {
  const 몸통 = 덩어리('var rows=arr.map(function(s,i){');
  const at = 몸통.indexOf('var bar=');
  assert.ok(at > 0, '★ 규모를 한눈에 보여 주는 막대가 없습니다');
  const 막대 = 몸통.slice(at, 몸통.indexOf(';', 몸통.indexOf("</span>'", at)));
  assert.match(막대, /display:inline-block/, '★ 막대가 제 줄을 차지합니다');
  assert.match(막대, /vertical-align:middle/, '숫자와 높이가 안 맞으면 줄이 들쭉날쭉해집니다');
  assert.ok(!/<div/.test(막대), '★ 막대를 <div> 로 깔았습니다 — 줄이 하나 더 생깁니다');
  /* 막대와 숫자가 «한 칸» 안에 있는가 */
  assert.match(몸통, /'\+bar\+\(emp\|\|'—'\)\+'<\/td>'/,
    '★ 막대와 숫자가 다른 칸에 있습니다 — 칸이 하나 더 늘면 폰에서 다시 밀립니다');
});

test('★⑥ 「한눈에」 스위치는 «순서만» 바꾼다 — 자료를 건드리지 않는다', () => {
  assert.match(src, /function setSiteSort\(v\)/, '정렬 스위치가 없습니다');
  const 몸 = src.slice(src.indexOf('function setSiteSort(v)'));
  const 한줄 = 몸.slice(0, 몸.indexOf('\n'));
  assert.ok(!/fbDb|\.set\(|\.update\(|remove\(/.test(한줄),
    '★ 순서를 바꾸면서 자료에 손을 댔습니다 — 보기 스위치가 저장을 일으키면 안 됩니다');
  /* 두 순서가 다 있고, 화면에도 나와 있어야 한다 */
  assert.match(src, /setSiteSort\(\\'seq\\'\)/, '연번순으로 되돌릴 길이 없습니다');
  assert.match(src, /setSiteSort\(\\'size\\'\)/, '규모순 단추가 없습니다');
  assert.match(src, /var bySize=\(S\.siteSort==='size'\)/, '고른 순서를 기억하지 않습니다');
});

test('★⑦ 접은 칸은 편집 폼에 «그대로» 있다 — 보기에서 뺀 것이지 지운 것이 아니다', () => {
  for (const k of ['ceo', 'biz_no', 'address']) {
    assert.ok(src.indexOf("['" + k + "',") > 0,
      '★ 폰에서 접은 ' + k + ' 가 편집 폼에도 없습니다 — 접은 것이 아니라 지운 것입니다');
  }
  assert.match(src, /var CONTACT_FIELDS=[\s\S]{0,200}\['email'/,
    '★ 담당자 이메일을 고칠 길이 없습니다');
  /* 지역기금의 «분류»도 마찬가지 — 기금 정보에서 고칠 수 있어야 접어도 된다 */
  assert.match(src, /\['region','지역','text'\]/,
    '★ 분류를 폰 목록에서 접었는데 기금 정보에도 칸이 없습니다 — 고칠 길이 사라집니다');
});

test('★ 지역기금 목록 — 정보·분류를 머리와 몸통에서 «함께» 접는다', () => {
  const 머리 = src.slice(src.indexOf("<th class=\"mo\">대표자</th>"), src.indexOf("'+regCol+'"));
  assert.match(머리, /<th class="ph">정보<\/th>/, '완성도 칸을 폰에서 안 접었습니다');
  assert.match(src, /var regCol=showReg\?'<th class="ph"/, '분류 머리를 안 접었습니다');
  const 줄 = 덩어리('function fundRow(f,no,mode,showReg){');
  assert.match(줄, /<td class="ph">'\+chip\+'<\/td>/, '★ 머리만 접고 몸통은 그대로입니다 — 값이 옆으로 밀립니다');
  assert.match(줄, /<td class="ph" onclick="event\.stopPropagation\(\)">'\+\(f\.fund_type/,
    '★ 분류 몸통을 안 접었습니다');
});

test('주담당 이름은 접지 않는다 — 「김혜민」이 석 줄로 쌓이면 줄 키가 그만큼 는다', () => {
  const 줄 = 덩어리('function fundRow(f,no,mode,showReg){');
  const m = /<td style="([^"]*)">'\+esc\(mgrMainName\(f\)/.exec(줄);
  assert.ok(m, '주담당 칸을 못 찾았습니다');
  assert.match(m[1], /white-space:nowrap/,
    '★ 이름이 글자 단위로 접히면 폰에서 줄마다 두세 줄씩 늘어납니다');
});
