'use strict';
/* ══════ 기업 상세를 «읽히게» 정리한다 (대표 지시 2026-08-31) ══════
   대표 지시: 「너무 많은 내용이 있고 정리가 안 되어 있다. 깔끔하게 정리해라.
   불필요한 설명 전혀 필요 없다.」

   ■ 재 보고 안 것 — 값보다 «값이 아닌 것»이 더 많았다
     ① 값마다 그 아래에 출처가 «제 줄»로 붙었다 —
        「사업자등록증 · 권형하 · 2026.08.27 📷 원본 보기」.
        칸이 스무 개 남짓이니 그것만으로 화면 절반이 회색 글씨였다.
     ② 이름표 칸이 66px 인데 「법인등록번호」는 69, 「직전년도 매출액」은 85,
        「세금계산서 이메일」은 97px 이다(실측) — 이름표가 두 줄로 접혔다.
     ③ 두 칸씩 놓아 값 하나에 160px 뿐이었다. 소재지(258)·업태(289)·종목이
        죄다 서너 줄로 접히고, 두 칸의 줄 수가 다르면 그 줄이 긴 쪽에 맞춰져 빈 자리가 났다.
     ④ 「값이 다른 칸」 위에 설명문 두 줄이 있었다.

   ■ 고친 뒤 (브라우저 실측: 같은 회사 643px → 471px, 27% 짧아졌다)
     · 한 줄에 한 칸 · 이름표 97px 고정 · 출처는 값 뒤 «작은 글씨 하나»
     · 사람·날짜는 말풍선으로, 원본은 📷 하나로
     · 설명문은 걷어냈다

   ★ 여기서 못 박는 것
     ① 기업 상세는 «한 줄에 한 칸»이다 — 명함 상세는 두 칸 그대로다
     ② 이름표가 접히지 않는다 — 가장 긴 이름표(97px)가 폭을 정한다
     ③ 출처가 «제 줄»을 안 먹는다
     ④ 화면 글자는 짧고, 온전한 것은 말풍선에 있다
     ⑤ 원본으로 가는 길은 그대로다
     ⑥ 설명문이 없다
   실행: node --test tests/cards-co-detail-tidy.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'pu-cards.html'), 'utf8').replace(/\r\n/g, '\n');

function fnBody(name){
  const i = SRC.indexOf('\nfunction ' + name + '(');
  assert.ok(i >= 0, name + ' 를 찾지 못했다');
  const open = SRC.indexOf('{', i);
  let d = 0;
  for (let k = open; k < SRC.length; k++) {
    if (SRC[k] === '{') d++;
    else if (SRC[k] === '}') { d--; if (!d) return SRC.slice(i, k + 1); }
  }
  assert.fail(name + ' 의 끝을 찾지 못했다');
}
const css = (sel) => {
  const m = SRC.match(new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\{([^}]*)\\}'));
  assert.ok(m, sel + ' 규칙을 찾지 못했다');
  return m[1];
};
/* 출처 딱지를 «그려» 본다 */
function srcTag(src){
  const ctx = { console, Object, String,
    coSrcOf: () => src,
    fmtDate: () => '2026.08.27',
    esc: s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;') };
  vm.createContext(ctx);
  vm.runInContext(SRC.match(/^const CO_SRC_SHORT = \{[^}]*\};/m)[0].replace(/^const /, 'var ')
    + '\n' + fnBody('coSrcShort') + '\n' + fnBody('coSrcTagHtml'), ctx);
  return vm.runInContext('coSrcTagHtml({}, "ceo")', ctx);
}
const 등록증 = { label:'사업자등록증', by:'권형하', at:1, photoId:'p1', photoYear:'2026', photoOwner:'u' };

/* ── ① 한 줄에 한 칸 ─────────────────────────────────────────── */

test('★ 기업 상세는 «한 줄에 한 칸»이다', () => {
  assert.match(css('#pcDetail .cogrid'), /grid-template-columns:1fr(?![ 0-9])/,
    '★ 두 칸이면 값 하나에 160px 뿐이라 소재지·업태·종목이 서너 줄로 접힌다');
  /* ⚠ 2026-08-31: 기업정보 접기/펼치기(대표 지시)로 이 배치가 coDetailPanelHtml
     안이 아니라 coInfoBoxHtml(펼쳤을 때만 그리는 자리)로 옮겨 갔다 — 규칙은
     그대로다, 어느 함수가 그리는지만 바뀌었다. */
  assert.match(fnBody('coInfoBoxHtml'), /class="pdgrid cogrid"/,
    '★ 상세가 그 배치를 안 쓴다 — 규칙만 있고 아무 데도 안 걸린다');
});

test('★ 명함 상세는 «두 칸» 그대로다 — 자리를 함께 쓰므로 갈래로 가른다', () => {
  /* 2026-08-31 에 실제로 통째로 바꿨다가 검사가 잡았다. 명함은 값이 짧아 두 칸이 맞다. */
  assert.match(css('#pcDetail .pdgrid'), /grid-template-columns:1fr 1fr/,
    '★ 명함 상세까지 한 칸이 됐다 — 짧은 값들이 세로로 길게 늘어선다');
  assert.equal(/width:97px/.test(css('#pcDetail .pdrow .k')), false,
    '★ 이름표 폭을 통째로 넓혔다 — 이름표가 짧은 명함 쪽에서 값 자리를 빼앗는다');
});

/* ── ② 이름표가 안 접힌다 ────────────────────────────────────── */

test('★ 이름표가 접히지 않는다 — 가장 긴 이름표가 폭을 정한다', () => {
  /* 실측(브라우저, 11.5px): 「세금계산서 이메일」 97 · 「직전년도 매출액」 85 ·
     「법인등록번호」 69. 66px 이던 때 이 셋이 두 줄로 접혔다. */
  const r = css('#pcDetail .cogrid .pdrow .k');
  assert.match(r, /white-space:nowrap/, '★ 이름표가 두 줄로 접힌다');
  const w = Number((r.match(/width:(\d+)px/) || [0, 0])[1]);
  assert.ok(w >= 97,
    '★ 이름표 칸이 ' + w + 'px 다 — 「세금계산서 이메일」 97px 이 최소다(실측)');
});

/* ── ③④⑤ 출처 ──────────────────────────────────────────────── */

test('★ 출처가 «제 줄»을 안 먹는다 — 그것이 화면 절반이었다', () => {
  const h = srcTag(등록증);
  assert.ok(h.indexOf('<div') < 0,
    '★ 출처가 덩이(div)로 나온다 — 값마다 한 줄씩 더 먹는다: ' + h);
  assert.match(h, /^<span class="cosrc"/, '값 뒤에 붙는 «한 조각»이어야 한다');
  assert.match(css('#pcDetail .pdrow .v .cosrc'), /white-space:nowrap/,
    '★ 출처가 접히면 결국 두 줄이 된다');
  assert.equal(/display:block/.test(css('#pcDetail .pdrow .v .cosrc')), false,
    '★ 제 줄을 차지한다');
});

test('★ 화면 글자는 «짧고», 온전한 것은 말풍선에 있다', () => {
  const h = srcTag({ label:'컨설턴트 컨설팅신청 상세', by:'권형하', at:1,
    photoId:'', photoYear:'', photoOwner:'' });
  assert.ok(h.indexOf('>서식<') > 0,
    '★ 긴 서식 이름이 값 뒤에 그대로 붙는다 — 값보다 길어진다: ' + h);
  assert.ok(h.indexOf('title="컨설턴트 컨설팅신청 상세 · 권형하 · 2026.08.27"') > 0,
    '★ 줄인 것을 물어볼 자리가 없다: ' + h);
});

test('아는 출처는 «제 이름»으로 짧게 적는다', () => {
  const one = (label) => srcTag({ label, by:'', at:0, photoId:'', photoYear:'', photoOwner:'' });
  assert.ok(one('사업자등록증').indexOf('>등록증<') > 0);
  assert.ok(one('명함').indexOf('>명함<') > 0);
  assert.ok(one('푸른이알피').indexOf('>이알피<') > 0);
  assert.ok(one('기술보호울타리 신청서').indexOf('>서식<') > 0, '모르는 것은 「서식」이다');
});

test('★ 원본으로 가는 길은 그대로다 — 사진이 있을 때만', () => {
  assert.ok(srcTag(등록증).indexOf('openCoDoc') > 0, '★ 원본으로 갈 길이 사라졌다');
  const 사진없음 = { label:'서식', by:'', at:0, photoId:'', photoYear:'', photoOwner:'' };
  assert.equal(srcTag(사진없음).indexOf('openCoDoc'), -1,
    '★ 사진 번호도 없이 아이콘을 띄우면 눌러도 아무 일이 없다');
});

test('출처를 모르는 칸에는 «아무것도» 안 붙는다', () => {
  assert.equal(srcTag(null), '');
});

/* ── ⑥ 설명문 ───────────────────────────────────────────────── */

test('★ 「값이 다른 칸」에 설명문이 없다 (대표 지시 「불필요한 설명 전혀 필요 없다」)', () => {
  const fn = fnBody('coConflictHtml');
  assert.equal(/class="setnote"/.test(fn), false,
    '★ 설명문이 돌아왔다 — 정작 봐야 할 값이 아래로 밀린다');
  assert.equal(/사진첩에서 읽은 값이 지금 값과 다릅니다/.test(fn), false,
    '★ 안내문이 돌아왔다');
  /* 값 «둘»은 그대로 보여야 한다 — 그것이 이 칸의 알맹이다 */
  assert.match(fn, /지금 \$\{esc\(c\.had\|\|''\)\}/, '★ 지금 값이 사라졌다');
  assert.match(fn, /읽은 값 \$\{esc\(c\.got\|\|''\)\}/, '★ 읽은 값이 사라졌다');
  assert.match(fn, /값이 다른 칸 \$\{keys\.length\}개/, '몇 개인지는 말해야 한다');
});
