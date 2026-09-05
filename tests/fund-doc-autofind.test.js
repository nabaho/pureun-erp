/* 서류를 사진첩에서 «스스로 찾아» 온다
 *
 * 대표 지시 2026-09-05:
 *   「서류 입력은 푸른 사진첩에서 자동으로 가지고 오게 해서 확인후 입력하게 하자」
 *
 * ⚠ 이 저장소는 통째로 github.io 로 공개된다 — 실제 기금명 금지. 여기 자료는 전부 가짜다.
 *
 * 지켜야 하는 것
 *  ① «자동으로 넣지» 않는다 — 찾아 주고, 고르면 판독하고, 사람이 확인해야 칸에 들어간다.
 *    서류 한 장이 기금의 인가번호를 바꾼다
 *  ② 종류가 맞아야 후보다. 기금 이름까지 맞으면 위로 — 안 맞는다고 버리지는 않는다
 *    (사진첩에 기금 이름이 안 적힌 경우가 흔하다)
 *  ③ 원본은 사진첩에 남는다 — 기금에는 참조만
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

function finder() {
  const box = {};
  new Function([grabDecl('DOC_FIND'), grabFn('_cardFundKey'),
    grabFn('docFindText'), grabFn('docFindScore'),
    'this.o={text:docFindText,score:docFindScore,DEF:DOC_FIND};'].join('\n')).call(box);
  return box.o;
}

const photo = (o) => ({ meta: Object.assign({ read: { fields: {} } }, o) });
const withTitle = (t) => ({ meta: { read: { fields: { docName: t } } } });

test('글자는 제목·회사·메모·판독 칸에서 모은다', () => {
  const F = finder();
  assert.match(F.text(withTitle('설립인가증')), /설립인가증/);
  assert.match(F.text(photo({ company: '가짜공동근로복지기금' })), /가짜공동근로복지기금/);
  assert.match(F.text(photo({ note: '등기사항전부증명서' })), /등기사항/);
  assert.equal(F.text({}), '', '아무것도 없으면 빈 글자');
  assert.equal(F.text(null), '');
});

test('종류가 맞아야 후보다', () => {
  const F = finder();
  assert.ok(F.score(withTitle('법인 설립인가증'), 'inka', '') > 0, '인가증을 못 알아본다');
  assert.ok(F.score(withTitle('등기사항전부증명서'), 'corpreg', '') > 0, '등기부를 못 알아본다');
  assert.ok(F.score(withTitle('고유번호증'), 'taxid', '') > 0, '고유번호증을 못 알아본다');
  /* 엉뚱한 서류가 인가증 후보로 오르면 사람이 그것을 판독해 인가번호를 덮어쓴다 */
  assert.equal(F.score(withTitle('사업자등록증'), 'inka', ''), 0, '남의 서류를 인가증으로 본다');
  assert.equal(F.score(withTitle('근로계약서'), 'corpreg', ''), 0);
  assert.equal(F.score({}, 'inka', ''), 0, '글자가 없으면 후보가 아니다');
  assert.equal(F.score(withTitle('인가증'), '없는종류', ''), 0);
});

test('종류끼리 섞이지 않는다', () => {
  const F = finder();
  assert.equal(F.score(withTitle('고유번호증'), 'inka', ''), 0, '고유번호증이 인가증 자리에 오른다');
  assert.equal(F.score(withTitle('설립인가증'), 'taxid', ''), 0, '인가증이 고유번호증 자리에 오른다');
  assert.equal(F.score(withTitle('등기사항전부증명서'), 'taxid', ''), 0);
});

test('기금 이름까지 맞으면 «위»로 올린다 — 안 맞아도 버리지 않는다', () => {
  const F = finder();
  const key = '가짜충남1호';       // _cardFundKey 가 「가짜충남1호 공동근로복지기금」에서 뽑는 꼴
  const named = photo({ read: { fields: { docName: '설립인가증' } }, company: '가짜충남1호공동근로복지기금' });
  const plain = withTitle('설립인가증');
  assert.equal(F.score(named, 'inka', key), 3, '이름이 맞으면 확실로 올려야 한다');
  assert.equal(F.score(plain, 'inka', key), 1, '이름이 안 맞아도 후보로는 남겨야 한다');
  assert.ok(F.score(named, 'inka', key) > F.score(plain, 'inka', key), '순서가 뒤바뀐다');
});

test('기금 이름이 너무 짧으면 이름으로 올리지 않는다', () => {
  const F = finder();
  /* 두 글자짜리 이름은 아무 서류에나 걸린다 — 「확실」로 올리면 엉뚱한 것이 맨 위에 온다 */
  assert.equal(F.score(withTitle('설립인가증 가나'), 'inka', '가나'), 1, '짧은 이름으로 확신하면 안 된다');
  assert.equal(F.score(withTitle('설립인가증'), 'inka', ''), 1, '이름이 없으면 종류만으로');
});

/* ══════ 여기가 이 기능의 전부다 — 자동으로 «넣지» 않는다 ══════ */
test('찾아만 주고, 넣는 것은 지금까지 쓰던 길을 그대로 탄다', () => {
  const p = grabFn('docFindPick');
  assert.match(p, /pickAlbumPhoto\(id\)/, '기존 판독 경로를 안 탄다 — 길이 둘이 되면 한쪽만 고쳐진다');
  assert.match(p, /zid=\(\{inka:'dz-inka',corpreg:'dz-corpreg',taxid:'dz-taxid',charter:'dz-charter'\}\)\[kind\]/,
    '어느 칸에 넣을지 안 정하면 판독 결과가 갈 곳을 잃는다');
  /* 칸에 바로 쓰면 사람 눈을 건너뛴다 — 확인은 renderDocIntake → applyDocFound 가 한다 */
  assert.ok(!/fd-inka|el\.value=/.test(p), '판독 없이 칸에 바로 쓰고 있다');
  const a = grabFn('docAutoFind');
  assert.ok(!/applyDocFound|readDocInto/.test(a), '찾자마자 넣으려 든다 — 사람이 골라야 한다');
});

test('확인 단계가 살아 있다 — 판독 결과를 보여 주고 눌러야 들어간다', () => {
  const r = grabFn('renderDocIntake');
  assert.match(r, /onclick="applyDocFound\(\)"/, '반영 단추가 없다');
  assert.match(r, /판독 결과/, '무엇을 읽었는지 안 보여 준다');
  assert.match(grabFn('applyDocFound'), /_docFid&&_docFid!==S\.fundId/,
    '다른 기금에서 판독한 결과를 이 기금에 넣는다');
});

test('기금을 옮기면 훑던 결과를 쓰지 않는다', () => {
  const a = grabFn('docAutoFind');
  assert.match(a, /if\(S\.fundId!==fid\|\|!\$\('dfBody'\)\) return/,
    '늦게 온 결과를 다른 기금 화면에 그린다');
  assert.match(a, /var fid=S\.fundId/, '어느 기금으로 시작했는지 안 붙잡는다');
});

test('원본은 사진첩에 남는다 — 미리보기만 가져온다', () => {
  const r = grabFn('renderDocFind');
  assert.match(r, /PuPhotoStore\.loadThumb/, '미리보기를 안 띄운다');
  assert.ok(!/loadFull/.test(r), '목록에서 원본을 통째로 받으면 창이 멈춘다');
  assert.match(r, /사진첩 원본은 그대로 남습니다/, '무엇이 남는지 안 말해 준다');
});

test('못 찾았을 때 왜인지 말해 준다', () => {
  const r = grabFn('renderDocFind');
  assert.match(r, /못 찾음/, '');
  assert.match(r, /사진첩에 올린 뒤 판독해 두면 여기 나옵니다/,
    '못 찾은 채로 두면 사람이 기능이 고장 난 줄 안다');
});

test('화면 배선 — 서류 자동 입력 줄에 찾기 단추와 ⓘ', () => {
  assert.ok(SRC.includes('onclick="docAutoFind()"'), '찾기 단추가 없다');
  assert.ok(SRC.includes("'doc.auto':{t:"), 'ⓘ 설명이 등록되지 않았다');
  /* 파일을 직접 올리는 길도 그대로 있어야 한다 — 사진첩에 없는 서류가 있다.
     끌어놓기 칸의 id 는 docZoneOne 이 만들어 넣으므로 글자로 굳어 있지 않다 —
     칸을 «거는 곳»(bindDocIntake)과 «만드는 곳»(docZoneOne) 둘로 확인한다. */
  assert.match(grabFn('bindDocIntake'), /\['dz-inka','inka'\]/, '인가증 끌어놓기 칸이 안 걸렸다');
  assert.match(grabFn('docZoneOne'), /dzDrop\(event,/, '끌어놓기 배선이 사라졌다');
  assert.match(grabFn('docZoneOne'), /dzPick\(/, '클릭해 파일 고르는 길이 사라졌다');
});

test('찾는 종류가 실제 끌어놓기 칸과 짝이 맞는다', () => {
  const box = {};
  new Function([grabDecl('DOC_FIND'), 'this.D=DOC_FIND;'].join('\n')).call(box);
  const p = grabFn('docFindPick');
  Object.keys(box.D).forEach(k => {
    assert.ok(p.includes(k + ":'dz-"), '고른 뒤 넣을 칸이 없다: ' + k);
    assert.ok(box.D[k].kw.length, '찾을 낱말이 없다: ' + k);
    assert.ok(box.D[k].label, '이름이 없다: ' + k);
  });
  /* 완비 5항목을 채우는 셋 + 정관(전문을 보관하는 넷째) */
  assert.deepEqual(Object.keys(box.D).sort(), ['charter', 'corpreg', 'inka', 'taxid'],
    '찾아 주는 서류가 바뀌었다 — 끌어놓기 칸과 짝이 맞는지 함께 볼 것');
});

/* 브라우저에서 실제로 그려 보고 잡았다(2026-09-05): 로그인이 아직 안 붙은 사이
   loadThumb 이 «그 자리에서» 던져(「사진을 담을 계정을 알 수 없습니다」) 예외가
   renderDocFind 밖으로 튀었고, 찾은 목록이 통째로 사라졌다.
   미리보기는 곁다리다 — 한 장이 안 떠도 목록은 남아야 한다. */
test('미리보기 한 장이 실패해도 목록은 남는다', () => {
  const r = grabFn('renderDocFind');
  const i = r.indexOf('loadThumb');
  assert.ok(i > 0, '미리보기를 안 띄운다');
  const before = r.slice(0, i);
  assert.ok(/try\{\s*$|try\{[^}]*$/m.test(before.split('\n').slice(-3).join('\n')),
    'loadThumb 을 try 로 감싸지 않았다 — 그 자리에서 던지면 목록이 통째로 사라진다');
  assert.match(r, /\}catch\(e\)\{ var el=\$\('dft-'\+x\.it\.id\); if\(el\) el\.textContent='\(미리보기 없음\)'; \}/,
    '실패한 자리를 비워 두면 사람이 계속 기다린다');
});
