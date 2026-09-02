/* 경력관리 — 원본 없는 것만 한꺼번에 채우기 (대표 지시 2026-09-02)
   「원본 pdf 로 입력 한꺼번에 하고 싶다 이미 들어가 있는것은 제외하고」

   ■ 무엇이 어긋나 있었나
     ① 「이미 있는 것 제외」가 «점수 감점»(−100)일 뿐이었다. 아주 잘 맞는 파일은 그래도
        문턱을 넘어, 원본이 멀쩡히 있는 레코드를 덮어쓸 수 있었다.
     ② 짝짓기가 «파일 → 가장 잘 맞는 레코드 하나»였다. 같은 레코드가 뽑히면 나머지 파일을
        전부 버렸다 — 기관 이름 앞부분만 같아도(충청남도○○) 파일 열 개가 하나로 몰려
        여섯 건을 채울 수 있는데 한 건만 붙었다(실측).
     ③ 폴더를 연결해 두고도 파일을 다시 골라야 했고, 고른 파일은 앱 안에 «복사»됐다.
        76건을 base64 로 담으면 저장공간이 금방 찬다. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { cutFn } = require('./cut-fn');

const source = fs.readFileSync(path.join(__dirname, '..', 'kcareer.html'), 'utf8');

test('★★ 이미 원본이 있는 레코드는 «목록에서» 뺀다 — 점수 감점만으로는 못 막는다', () => {
  const t = cutFn(source, 'function _bulkTargets(');
  assert.match(t, /filter\(r=>!hasOriginal\(r\)\)/,
    '원본이 있는 것을 빼지 않으면 잘 맞는 파일이 멀쩡한 원본을 덮어씁니다');
  assert.match(cutFn(source, 'function bulkAnalyze('), /const db=_bulkTargets\(page\)/,
    '견주는 대상은 반드시 _bulkTargets 를 거쳐야 합니다');
});

test('★★ 짝짓기는 «일대일» — 파일 여럿이 한 레코드로 몰리면 안 된다', () => {
  const fn = cutFn(source, 'function bulkPairUp(');
  assert.match(fn, /cand\.sort/, '점수가 높은 짝부터 이어야 합니다');
  assert.match(fn, /usedF\[c\.fi\]\|\|usedR\[c\.ri\]/,
    '파일도 레코드도 «한 번씩만» 써야 합니다 — 아니면 나머지가 통째로 버려집니다');
  assert.match(fn, /a\.fi-b\.fi \|\| a\.ri-b\.ri/,
    '같은 점수의 순서를 못박지 않으면 돌릴 때마다 다른 짝이 나옵니다');
  assert.match(cutFn(source, 'function bulkAnalyze('), /bulkPairUp\(files,db,page\)/);
});

test('★ 점수 잣대는 «한 곳»에만 있다 — 미리보기와 실제가 어긋나면 안 된다', () => {
  assert.ok(source.indexOf('function _fnScore(') > 0, '_fnScore 로 떼어 놓아야 합니다');
  const m = cutFn(source, 'function matchByFilename(');
  assert.match(m, /_fnScore\(k,r,page\)/, 'matchByFilename 도 같은 잣대를 써야 합니다');
  assert.equal(source.split('if(hasOriginal(r)) score-=100;').length - 1, 1,
    '감점 규칙이 두 벌이 되면 한쪽만 고쳐집니다');
});

test('★ 앞 네 글자만 같은 다른 기관과 갈라진다', () => {
  const fn = cutFn(source, 'function _fnScore(');
  assert.match(fn, /full\.length>4&&k\.flat\.includes\(full\)/,
    '기관 이름 전체가 들어 있으면 더 줘야 충청남도교육청 / 충청남도청 이 갈립니다');
});

test('★★ 폴더에서 찾은 것은 «복사하지 않는다» — 경로만 잇는다', () => {
  const fn = cutFn(source, 'async function bulkSaveMatched(');
  const 폴더 = fn.slice(fn.indexOf('if(fromFolder){'), fn.indexOf('for(const m of matched)'));
  assert.match(폴더, /r\.src='fs'/);
  assert.match(폴더, /r\.relPath=m\.file\.relPath/);
  assert.doesNotMatch(폴더, /base64/,
    '폴더에서 찾은 것을 base64 로 담으면 저장공간이 금방 찹니다');
  assert.match(폴더, /r\.attachedScanId=sid/,
    '되돌릴 수 있어야 합니다 — fsUndoScan 이 이 표식을 봅니다');
  assert.match(폴더, /fsSetLastScanId\(sid\)/);
});

test('★ 새 줄을 만들지 않는다 — 붙이기만 한다', () => {
  const fn = cutFn(source, 'async function bulkSaveMatched(');
  assert.doesNotMatch(fn, /unshift|push\(/,
    '이 길은 «채우는» 길입니다. 새로 등록하는 것은 폴더 스캔(fsCommitScan)이 합니다');
});

test('★ 되돌리면 레코드는 남기고 경로만 뗀다', () => {
  const fn = cutFn(source, 'function fsUndoScan(');
  assert.match(fn, /r\.attachedScanId === scanId/);
  assert.match(fn, /delete r\.relPath/);
});

test('★ 폴더가 안 되는 브라우저에서는 폴더 단추를 감춘다', () => {
  const fn = cutFn(source, 'function openBulkMatch(');
  assert.match(fn, /if\(!fsSupported\(\) && fb\) fb\.style\.display='none'/,
    '눌러도 안 되는 단추를 보여 주면 안 됩니다');
  assert.match(fn, /_bulkTargets\(page\)\.length/, '몇 건을 채우는지 먼저 밝혀야 합니다');
});

test('★ 단추 이름이 하는 일을 말한다 — 다섯 화면 모두', () => {
  assert.equal((source.match(/data-act="match"/g) || []).length, 5,
    '위촉장·자격증·수료증·표창·학력 다섯 화면에 단추가 있어야 합니다');
  assert.equal(source.split('title="원본이 없는 항목에만').length - 1, 5,
    '다섯 화면 모두 같은 이름·같은 설명이어야 합니다');
  assert.equal(source.indexOf('📦 원본 일괄 매칭'), -1,
    '무엇을 매칭하는지 알 수 없던 옛 이름은 남기지 않습니다');
});
