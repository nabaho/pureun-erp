/* 증빙 «원본»도 창고에 둔다 (대표 결정 2026-08-29)

   ★ 까닭 — 원본이 찍은 사람 PC 안에만 있어서, 다른 PC 에서 그 일정을 열면
     「원본이 없어 시간을 다시 찍을 수 없습니다」가 됐다. 증빙은 법인 기록인데
     시간을 고치는 일이 그 사람 PC 한 대에 묶여 있었다.

   ⚠ 요금을 먼저 확인하고 넣었다 — 이 창고(pureun-erp-hrphotos, 서울)는
     **추가 창고라 무료 한도가 없다.** 무료 5GB 는 기본 창고에만 남는다.
     그래도 저장은 GB당 월 32원이라, 증빙 1,000장에 원본까지 더해 월 28원이다.
     그래서 «공짜라서» 가 아니라 «싸서» 넣는 것이고, 그만큼 **헛되이 두 배로
     늘리지 않는다** — 아래 두 규칙이 그 자리를 지킨다:
       ㉮ 타임스탬프를 «안 찍은» 사진은 합성본이 곧 원본이라 또 올리지 않는다.
       ㉯ 찍은 시각·「안 찍음」 표는 파일이 아니라 **딸린 쪽지**로 붙인다(요금 0). */
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'gov-consulting.html'), 'utf8');
const bare = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
const S = bare(SRC);

function fnBody(name) {
  const m = new RegExp('function\\s+' + name + '\\s*\\(').exec(S);
  const a = m ? m.index : -1;
  assert.ok(a > 0, name + ' 을(를) 찾지 못했다');
  const ends = [S.indexOf('\nfunction ', a + 8), S.indexOf('\nasync function ', a + 8)].filter((x) => x > a);
  return S.slice(a, ends.length ? Math.min.apply(null, ends) : a + 4000);
}

/* ══════ ① 원본을 창고에 둔다 ══════ */

test('저장할 때 원본도 창고에 올린다', () => {
  const f = fnBody('saveStampSlot');
  assert.ok(/evUpload\([^)]*`o\$\{i\}`/.test(f),
    '원본을 창고에 안 올리면 다른 PC 에서 시간을 다시 못 찍는다');
});

test('타임스탬프를 «안 찍은» 사진은 원본을 또 올리지 않는다 — 같은 그림이다', () => {
  const f = fnBody('saveStampSlot');
  const at = f.indexOf('evUpload(ST.sid,`o${i}`');
  assert.ok(at > 0, '원본 올리는 줄을 찾지 못했다');
  /* 그 줄 «앞»에 안 찍었는지 보는 관문이 있어야 한다 */
  assert.ok(/if\(!plain\)\s*evUpload\(ST\.sid,`o\$\{i\}`/.test(f),
    '안 찍은 사진까지 원본을 또 올리면 저장 칸이 헛되이 두 배가 된다');
});

test('밀린 사진 올리기도 원본을 함께 올린다 — 안 찍은 것은 뺀다', () => {
  const f = fnBody('evUploadBacklog');
  assert.ok(/d\.okey/.test(f), '밀린 사진에는 원본이 안 올라간다 — 옛 사진은 영영 그 PC 에만 남는다');
  assert.ok(/!main\s*&&\s*plain/.test(f), '안 찍은 사진의 원본까지 올리면 저장 칸이 두 배가 된다');
});

/* ══════ ② 시각·「안 찍음」 표는 «파일이 아니라 쪽지» ══════ */

test('찍은 시각과 「안 찍음」 표는 딸린 쪽지로 붙인다 — 파일을 따로 만들지 않는다', () => {
  const up = fnBody('evUpload');
  assert.ok(/customMetadata/.test(up), '쪽지를 붙일 길이 없다');

  const f = fnBody('saveStampSlot');
  assert.ok(/shotAt/.test(f) && /plain/.test(f), '합성본에 시각·「안 찍음」 표를 안 붙인다');
  /* 시각·표를 «파일»로 올리면 저장 칸도 올리기 횟수도 는다 */
  assert.ok(!/evUpload\([^)]*timeKey\(/.test(S) && !/evUpload\([^)]*plainKey\(/.test(S),
    '시각·「안 찍음」 표를 파일로 올리면 저장 칸도 올리기 횟수도 헛되이 는다');
});

test('다른 PC 로 사진을 받을 때 시각·「안 찍음」 표도 함께 옮겨 온다', () => {
  const f = fnBody('evEnsureLocal');
  assert.ok(/evMeta\s*\(/.test(f), '쪽지를 안 읽으면 「사진은 있는데 몇 시로 찍었는지 모른다」가 된다');
  assert.ok(/saveStampTime\s*\(/.test(f) && /markPlain\s*\(/.test(f),
    '읽은 쪽지를 이 PC 에 안 옮기면 다음에 열 때 또 받아야 한다');
});

test('쪽지만 읽을 때 사진은 안 받는다 — 요금은 «받은 양»에 붙는다', () => {
  const f = fnBody('evMeta');
  assert.ok(/getMetadata\s*\(/.test(f), '쪽지만 읽는 길이 없다');
  assert.ok(!/getDownloadURL|fetch\s*\(/.test(f), '쪽지 보려고 사진까지 받으면 내려받기 요금이 붙는다');
});

/* ══════ ③ 다른 PC 에서 원본을 되살린다 ══════ */

test('이 PC 에 원본이 없으면 창고에서 받아 온다', () => {
  const f = fnBody('restoreStampPhotos');
  assert.ok(/evEnsureLocal\s*\(\s*sid\s*,\s*'o'\s*\+\s*i\s*\)/.test(f),
    '창고를 안 보면 다른 PC 에서는 여전히 시간을 다시 못 찍는다');
  assert.ok(/plainKey\s*\(/.test(f),
    '안 찍은 사진은 원본을 안 올리므로, 그때는 합성본을 원본으로 써야 한다');
});

/* ══════ ④ 지울 때 원본도 ══════ */

test('지울 때 창고의 원본도 함께 지운다', () => {
  const one = fnBody('deleteStampSlot');
  assert.ok(/evRemove\([^)]*`o\$\{i\}`/.test(one), '한 칸을 지워도 창고에 원본이 남는다');
  const all = fnBody('deletePhotoFromDB');
  assert.ok(/evRemove\([^)]*`o\$\{i\}`/.test(all), '일정을 통째로 지워도 창고에 원본이 남는다');
});

/* ══════ ⑤ 값이 곧 규칙인 것 — 요금 ══════ */

test('비용 계산서가 «이 창고에는 무료 한도가 없다»고 못 박고 있다', () => {
  const doc = fs.readFileSync(path.join(ROOT, 'docs', '파이어베이스-비용계산-2026-08-27.md'), 'utf8');
  /* 검사고정-허용: 「무료 5GB」는 **기본 창고에만** 남는다는 것이 규칙이다.
     추가 창고(서울)는 첫 바이트부터 요금이라, 이 문장이 지워지면 다음 사람이
     또 「공짜니까 얼마든지」로 판단한다. 근거는 파이어베이스 공식 문서다. */
  assert.ok(/추가 창고/.test(doc) && /무료 한도가 없습니다/.test(doc),
    '이 창고에 무료 한도가 없다는 사실이 계산서에서 사라졌다');
  assert.ok(!/\|\s*\*\*저장\*\*\s*\|\s*5 GB\s*\|/.test(doc),
    '「저장 무료 5GB」라는 틀린 줄이 되살아났다');
});
