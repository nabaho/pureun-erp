'use strict';
// 개정된 부분 깔때기 — node --test tests/rules-daejo-funnel.test.js
//
// 왜: 「변경 항목만 / 전체 조문」 단추 둘로는 30건 넘는 조문이 안 좁혀진다.
// 네 단(무엇이 바뀌나 · 할 일 · 왜 · 낱말)으로 좁힌다.
//
// ★ 가장 중요한 약속: 거르개는 «보기»만 바꾼다. 저장·문서 출력은 늘 전체가 대상이다 —
//   걸러 놓고 저장해서 안 보이던 조문이 빠지면 그건 서류 사고다.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'rules.html'), 'utf8').split('\r\n').join('\n');

/* rules.html 은 통째로 못 돌린다(모듈·DOM 의존). 깔때기 토막만 떼어
   가짜 조문·가짜 원문과 함께 돌린다 — 소스를 글자로 대조하지 않고 «실제로 셈해» 본다. */
function load(items, opts) {
  opts = opts || {};
  const from = app.indexOf('const FN_KINDS=');
  const to = app.indexOf('function renderFunnel(view){');
  assert.ok(from > 0 && to > from, '깔때기 토막을 찾을 수 없습니다');

  const CUR_ITEMS = items;
  const SAMPLES = { T1: opts.text || '' };
  const LAST = { key: 'T1' };
  /* 화면 쪽 조각은 가짜로 — 깔때기가 부르는 것만 채운다 */
  const itemKind = it => it.del ? '삭제'
    : it.orig === '' ? '신설'
    : (it.review && String(it.after || '').trim() === String(it.orig || '').trim()) ? '검토'
    : String(it.after || '').trim() !== String(it.orig || '').trim() ? '개정' : '유지';
  const inDaejo = it => !(it.orig === '' && (it.optIn === false || it.del));

  const made = new Function(
    'CUR_ITEMS', 'SAMPLES', 'LAST', 'REV_MODE', 'itemKind', 'inDaejo', 'renderEditor', '$', 'escapeH',
    app.slice(from, to) +
    '\nreturn { FN:FN, setDaejoView:setDaejoView, fnNarrow:fnNarrow, fnApply:fnApply,' +
    ' fnIsAll:fnIsAll, fnUndone:fnUndone, fnChapOf:fnChapOf, fnLawOf:fnLawOf,' +
    ' fnChapMap:fnChapMap, fnNowText:fnNowText, fnSetKind:fnSetKind, fnReset:fnReset,' +
    ' fnToggleTodo:fnToggleTodo, fnPick:fnPick, setFN:(o)=>{FN=o;}, getFN:()=>FN };'
  )(CUR_ITEMS, SAMPLES, LAST, opts.mode || 'partial', itemKind, inDaejo,
    () => {}, () => null, s => String(s));
  /* 화면이 쓰는 것과 같은 view(번호 매긴 목록) — 여기서는 번호만 흉내 낸다 */
  made.view = items.map(it => ({ it, no: it.orig === '' ? (opts.branch ? '제21조의2' : '제99조') : ('제' + it.num + '조') }));
  return made;
}

/* 조문 표본 — 개정 2 · 신설 3 · 삭제 1 · 검토 1 · 유지 1 = 8건 */
function sample() {
  return [
    { id: 'a1', num: 1, title: '목적', label: '제1조 (목적)', orig: '가', after: '가', del: false, reason: '' },
    { id: 'a20', num: 20, title: '근로시간', label: '제20조 (근로시간)', orig: '가', after: '나', del: false, reason: '근로기준법 §50 · 한도' },
    { id: 'a21', num: 21, title: '연차유급휴가', label: '제21조 (연차유급휴가)', orig: '나', after: '다', del: false, reason: '근로기준법 §60 · 산정' },
    { id: 'a30', num: 30, title: '휴일', label: '제30조 (휴일)', orig: '라', after: '라', del: true, reason: '근로기준법 §55' },
    { id: 'a31', num: 31, title: '육아휴직', label: '제31조 (육아휴직)', orig: '마', after: '마', del: false, review: true, reviewNote: '기간 확인', reason: '남녀고용평등법 §19' },
    { id: 'i1', num: null, title: '연차유급휴가의 사용촉진', label: '', orig: '', after: '', insertAfter: 'a21', reason: '근로기준법 §61 · 미규정', needText: true },
    { id: 'i2', num: null, title: '가족돌봄휴가', label: '', orig: '', after: '', insertAfter: 'a31', reason: '남녀고용평등법 §22의2 · 누락', needText: true },
    { id: 'i3', num: null, title: '배우자 출산휴가', label: '', orig: '', after: '20일의 유급휴가', insertAfter: 'a31', reason: '남녀고용평등법 §18의2', numOk: true }
  ];
}
const TEXT = ['제1장 총칙', '제1조(목적) …', '제4장 근로시간', '제20조(근로시간) …',
  '제21조(연차유급휴가) …', '제5장 휴일·휴가', '제30조(휴일) …', '제31조(육아휴직) …'].join('\n');

test('처음 보는 것은 지금까지와 같다 — 개정·신설·삭제', () => {
  const F = load(sample(), { text: TEXT });
  const got = F.fnApply(F.view).map(v => v.it.id);
  assert.deepEqual(got, ['a20', 'a21', 'a30', 'i1', 'i2', 'i3'], '유지·검토는 처음엔 안 보인다');
  assert.equal(F.fnIsAll(), false);
});

test('갈래를 눌러 좁힌다 — 신설만', () => {
  const F = load(sample(), { text: TEXT });
  F.fnSetKind('개정'); F.fnSetKind('삭제');          // 켜져 있던 둘을 끈다
  assert.deepEqual(F.fnApply(F.view).map(v => v.it.id), ['i1', 'i2', 'i3']);
});

test('「전체」를 누르면 유지·검토까지 모두 나온다', () => {
  const F = load(sample(), { text: TEXT });
  F.fnSetKind('');
  assert.equal(F.fnApply(F.view).length, 8);
  assert.equal(F.fnIsAll(), true, '아무것도 안 걸린 상태여야 ▲▼ 이동이 뜬다');
});

test('「아직 손 안 댄 것」은 화면의 해야 할 일과 같은 잣대다', () => {
  const F = load(sample(), { text: TEXT });
  const undone = F.view.filter(F.fnUndone).map(v => v.it.id);
  // 문안이 빈 신설 둘 + 검토 권고를 아직 안 본 것 하나
  assert.deepEqual(undone.sort(), ['a31', 'i1', 'i2']);
  // 문안을 쓴 신설(i3)과 이미 고친 조문(a20·a21)은 «할 일»이 아니다
  assert.ok(undone.indexOf('i3') < 0 && undone.indexOf('a20') < 0);
});

test('할 일 칸을 켜면 그 앞에서 좁힌 것 안에서만 센다', () => {
  const F = load(sample(), { text: TEXT });
  F.fnToggleTodo();                                   // 기본(개정·신설·삭제) + 손 안 댄 것
  assert.deepEqual(F.fnApply(F.view).map(v => v.it.id), ['i1', 'i2'],
    '검토(a31)는 갈래에서 이미 빠졌으므로 여기서도 안 나온다');
});

test('근거 법령은 변경이유 앞머리에서 뽑는다', () => {
  const F = load(sample(), { text: TEXT });
  assert.equal(F.fnLawOf({ reason: '근로기준법 §60 · 산정' }), '근로기준법');
  assert.equal(F.fnLawOf({ reason: '남녀고용평등법 §22의2 · 누락' }), '남녀고용평등법');
  assert.equal(F.fnLawOf({ reason: '' }), '', '근거가 없으면 빈 값 — 그 칸에 안 넣는다');
  F.fnPick('law', '남녀고용평등법');
  assert.deepEqual(F.fnApply(F.view).map(v => v.it.id), ['i2', 'i3']);
});

test('장(章)은 원문에서 뽑고, 신설 조문은 붙일 자리의 장을 따른다', () => {
  const F = load(sample(), { text: TEXT });
  const map = F.fnChapMap();
  assert.equal(map[1], '제1장 총칙');
  assert.equal(map[20], '제4장 근로시간');
  assert.equal(map[31], '제5장 휴일·휴가');
  // 신설은 제 번호가 없다 — 앵커(a31=제31조)의 장을 따른다
  assert.equal(F.fnChapOf({ num: null, insertAfter: 'a31' }), '제5장 휴일·휴가');
  F.fnPick('chap', '제5장 휴일·휴가');
  assert.deepEqual(F.fnApply(F.view).map(v => v.it.id), ['a30', 'i2', 'i3']);
});

test('원문이 없으면 장 칸은 조용히 빈다 — 화면이 그 칸을 안 그린다', () => {
  const F = load(sample(), {});                        // 원문 없음
  assert.deepEqual(F.fnChapMap(), {});
  assert.equal(F.fnChapOf({ num: 20 }), '');
});

test('낱말로 조 제목·본문·검토권고를 찾는다', () => {
  const F = load(sample(), { text: TEXT });
  F.fnPick('q', '휴가');
  assert.deepEqual(F.fnApply(F.view).map(v => v.it.id), ['a21', 'i1', 'i2', 'i3']);
  F.fnPick('q', '기간 확인');                          // 검토 권고 글에서도 찾는다
  F.fnSetKind('');                                     // 갈래를 풀어야 검토가 보인다
  assert.deepEqual(F.fnApply(F.view).map(v => v.it.id), ['a31']);
});

test('깔때기는 위에서 아래로 좁힌다 — 아래 단은 위 단의 결과 안에서 센다', () => {
  const F = load(sample(), { text: TEXT });
  F.fnSetKind('개정'); F.fnSetKind('삭제');            // 신설만
  F.fnToggleTodo();                                    // + 손 안 댄 것
  const s1 = F.fnNarrow(F.view, 1).length;             // 갈래까지
  const s2 = F.fnNarrow(F.view, 2).length;             // + 할 일
  const s4 = F.fnNarrow(F.view, 4).length;             // 끝까지
  assert.equal(s1, 3);
  assert.equal(s2, 2);
  assert.equal(s4, 2);
  assert.ok(s2 <= s1 && s4 <= s2, '단이 내려갈수록 넓어질 수는 없다');
});

test('거르개 풀기는 처음 상태로 되돌린다', () => {
  const F = load(sample(), { text: TEXT });
  F.fnSetKind(''); F.fnToggleTodo(); F.fnPick('law', '근로기준법'); F.fnPick('q', '휴가');
  F.fnReset();
  assert.deepEqual(F.fnApply(F.view).map(v => v.it.id), ['a20', 'a21', 'a30', 'i1', 'i2', 'i3']);
  assert.equal(F.getFN().todo, false);
  assert.equal(F.getFN().law, '');
  assert.equal(F.getFN().q, '');
});

test('지금 무엇으로 좁혔는지 한 줄로 말한다 — 폰에서 접힌 줄에 쓴다', () => {
  const F = load(sample(), { text: TEXT });
  F.fnSetKind('개정'); F.fnSetKind('삭제'); F.fnToggleTodo(); F.fnPick('q', '휴가');
  const t = F.fnNowText();
  assert.match(t, /신설/);
  assert.match(t, /손 안 댄 것/);
  assert.match(t, /휴가/);
  F.fnReset(); F.fnSetKind('');
  assert.equal(F.fnNowText(), '모든 조문', '아무것도 안 걸렸으면 그렇게 말한다');
});

test('옛 호출부(setDaejoView)가 그대로 돈다', () => {
  const F = load(sample(), { text: TEXT });
  F.fnPick('q', '휴가'); F.fnToggleTodo();
  F.setDaejoView('all');
  assert.equal(F.fnApply(F.view).length, 8, '「전체 조문」은 정말 전체여야 한다');
  assert.equal(F.fnIsAll(), true);
  F.setDaejoView('changed');
  assert.equal(F.fnApply(F.view).length, 6, '「변경 항목만」은 개정·신설·삭제');
});

/* ★ 서류 사고를 막는 검사 — 걸러 놓고 저장해도 문서는 전체가 나가야 한다 */
test('거르개는 보기만 바꾼다 — 문서에 들어갈 조문 수는 그대로다', () => {
  const items = sample();
  const F = load(items, { text: TEXT });
  const inDaejoDoc = it => !(it.orig === '' && (it.optIn === false || it.del))
    && !['유지', '검토'].includes(
      it.del ? '삭제' : it.orig === '' ? '신설'
        : (it.review && String(it.after || '').trim() === String(it.orig || '').trim()) ? '검토'
          : String(it.after || '').trim() !== String(it.orig || '').trim() ? '개정' : '유지');
  const before = items.filter(inDaejoDoc).length;
  F.fnSetKind('개정'); F.fnSetKind('신설'); F.fnSetKind('삭제'); F.fnSetKind('유지');
  F.fnPick('q', '목적');
  assert.equal(F.fnApply(F.view).length, 1, '화면은 한 줄까지 좁혀졌다');
  assert.equal(items.filter(inDaejoDoc).length, before, '문서에 들어갈 조문은 하나도 안 줄었다');
  assert.equal(items.length, 8, '항목 자체가 지워지면 안 된다');
});

/* 화면 쪽 — 글자가 아니라 「무엇을 담는지」를 본다 */
test('없앤 단추 둘이 화면에 남아 있지 않다', () => {
  assert.equal(app.indexOf('id="flt-changed"'), -1, '「변경 항목만」 단추는 깔때기 첫 단으로 들어갔다');
  assert.equal(app.indexOf('id="flt-all"'), -1);
  assert.ok(app.indexOf('id="fn-box"') > 0, '깔때기 자리');
  assert.ok(app.indexOf('id="fn-bar"') > 0, '폰에서 접히는 줄');
});

test('한글 조합 중에는 다시 그리지 않는다', () => {
  // ⚠ oncompositionend 는 표준 핸들러 속성이 아니라 붙여도 안 불린다(브라우저에서 확인).
  //   addEventListener 여야 한다 — 안 그러면 한글이 조합된 채 영영 안 걸러진다.
  assert.match(app, /q\.addEventListener\("compositionend"/);
  assert.match(app, /q\.addEventListener\("input"[\s\S]{0,80}isComposing/);
  assert.equal(app.indexOf('q.oncompositionend='), -1, '속성으로 붙이면 안 불린다');
});

test('폰에서는 깔때기를 접는다 — 펼친 채 두면 화면의 60%를 먹는다', () => {
  assert.match(app, /@media\(max-width:760px\)\{[\s\S]{0,200}\.fn-bar\{display:flex\}/);
  assert.match(app, /@media\(max-width:760px\)\{[\s\S]{0,200}\.fn\{display:none\}/);
});
