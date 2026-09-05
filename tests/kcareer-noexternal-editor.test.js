/* 경력관리 — 서류가 «남의 주소»로 나가지 않는다 (대표 지시 2026-09-05 「길막아」)

   ■ 무엇이었나
     PureunHwp.createEditor 가 esm.sh 에서 @rhwp/editor 를 받아 남의 주소
     (edwardkim.github.io)로 iframe 을 띄우고, 대표 서식을 통째로 그리로 보냈다.
     이 앱의 서류에는 주민등록번호·도장·계좌가 들어 있을 수 있다.

   ■ 게다가 얻는 것이 없었다 (실측 2026-09-05)
     그 편집기는 getSelectionContext 가 «editable:false» 를 준다 — 읽기 전용이다.
     눌러 쳐도 changeSeq 가 0 이고 내용이 안 바뀐다. 첫 로드 12.4초.
     위험만 있고 편집은 안 되는 길이었다.

   ■ 지금
     앱 안에 넣어 둔 한글 엔진(vendor/rhwp-core, WASM)으로만 그린다.
     A4 모양은 그대로이고 한 바이트도 밖으로 안 나간다. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { cutFn } = require('./cut-fn');

const source = fs.readFileSync(path.join(__dirname, '..', 'kcareer.html'), 'utf8');
const bare = source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');

test('★★ 서식을 남의 주소로 보내지 않는다 — 주민번호·도장이 든 파일이다', () => {
  /* ⚠ 이 넷 중 하나라도 되살아나면 서류가 다시 밖으로 나간다.
     ⚠ 주석이 아니라 «코드»를 본다(bare) — 왜 막았는지는 주석에 그 이름들과 함께 적혀 있고,
       그 설명이 검사를 깨뜨리면 다음 사람이 설명을 지우게 된다. */
  assert.doesNotMatch(bare, /esm\.sh/, '★ esm.sh 에서 편집기를 받아오면 안 됩니다');
  assert.doesNotMatch(bare, /@rhwp\/editor/, '★ 외부 편집기 모듈을 부르면 안 됩니다');
  assert.doesNotMatch(bare, /edwardkim/i, '★ 남의 주소로 iframe 을 띄우면 안 됩니다');
  assert.doesNotMatch(bare, /PureunHwp\.createEditor/,
    '★ 이 한 줄이 밖으로 나가는 «유일한» 길이었습니다 — 되살리지 마세요');
});

test('★★ 한글은 «앱 안의 엔진»으로 그린다 — A4 모양은 그대로', () => {
  const fn = cutFn(bare, 'async function openHwpEditor(');
  assert.match(fn, /_rhwp=null;/, '외부 편집기 손잡이는 비워 둡니다');
  assert.match(fn, /previewKcareerHwp\(containerSel, buffer, fileName\)/);
  /* 엔진 자리는 앱 안이어야 한다 — 바꾸면 다시 밖으로 나간다 */
  assert.match(source, /coreUrl[^\n]*vendor\/rhwp-core\/rhwp\.js|vendor\/rhwp-core/,
    'rhwp-core 는 저장소 안에 있어야 합니다');
});

test('★★ 편집기가 없어도 「완성본 생성」이 막히지 않는다', () => {
  /* 예전엔 편집기가 없으면 null 을 줘서 「편집 중인 문서가 없습니다」로 끝났다.
     지금 상태는 «원본 + 입력판에 친 값»이다 — 그것을 내놓는다. */
  const fn = cutFn(bare, 'async function exportEditedHwpx(');
  assert.match(fn, /rhComposeBytes\(\)/);
  assert.match(fn, /_rhDoc && _rhDoc\.bytes/, '그것마저 안 되면 지금 문서라도 줍니다');
});

test('★ 공용 모듈(js/pu-hwp-engine.js)은 건드리지 않았다 — 다른 앱이 함께 쓴다', () => {
  const eng = fs.readFileSync(path.join(__dirname, '..', 'js', 'pu-hwp-engine.js'), 'utf8');
  assert.match(eng, /editorUrl/, '공용 모듈에는 그대로 남아 있어야 합니다(부르지 않을 뿐)');
});
