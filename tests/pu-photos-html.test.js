'use strict';
// pu-photos.html · 매니페스트 · 포털 등록 정적 검사 — 실행: node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'pu-photos.html'), 'utf8');

test('인라인 스크립트가 문법 오류 없이 파싱된다', () => {
  // 단일 파일 앱이라 문법 오류 하나로 앱 전체가 뜨지 않는다. 실행하지 않고 파싱만 검사한다.
  const blocks = [...app.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)];
  assert.ok(blocks.length > 0, '인라인 스크립트를 찾을 수 없습니다');
  blocks.forEach((m, i) => {
    const code = m[1];
    if (!code.trim()) return;
    assert.doesNotThrow(
      () => new vm.Script(code, { filename: 'pu-photos.html:inline-' + i }),
      '인라인 스크립트 ' + i + '번에 문법 오류가 있습니다'
    );
  });
});

test('저장 층을 외부 파일로 불러온다', () => {
  // 저장 방식을 앱 안에 복사해 넣으면 당겨오기 창과 어긋난다.
  assert.match(app, /<script src="js\/pu-photo-store\.js"><\/script>/);
});

test('저장소 공용 파일 3개를 불러온다', () => {
  assert.match(app, /<script src="js\/pu-resilience\.js"><\/script>/);
  assert.match(app, /<script src="js\/pu-health\.js"><\/script>/);
  assert.match(app, /<script src="js\/pu-version\.js"><\/script>/);
});

test('파이어베이스 SDK 버전이 다른 앱과 같다', () => {
  // 앱마다 버전이 갈리면 캐시가 두 벌로 늘고 동작이 미묘하게 달라진다.
  const versions = new Set([...app.matchAll(/firebasejs\/([\d.]+)\//g)].map(m => m[1]));
  assert.deepEqual([...versions], ['10.12.0']);
});

test('파일 창고 SDK를 불러온다', () => {
  assert.match(app, /firebase-storage-compat\.js/);
});

test('기존 앱의 데이터 루트를 건드리지 않는다', () => {
  // pucards(명함첩)·p_cos·p_scheds(컨설팅)에 쓰면 실데이터가 오염된다.
  assert.ok(!/pucards/.test(app), '명함첩 루트를 건드리면 안 됩니다');
  assert.ok(!/p_cos|p_scheds/.test(app), '컨설팅 데이터를 건드리면 안 됩니다');
  assert.ok(!/fund_erp/.test(app), '기금 서류 경로를 건드리면 안 됩니다');
});

test('저장 방식을 앱이 직접 정하지 않는다', () => {
  // 방식 판단은 저장 층 한 곳에만 있어야 한다.
  assert.ok(!/BUCKET_ROOT\s*=/.test(app), '창고 경로를 앱에서 다시 정의하면 안 됩니다');
  assert.match(app, /PuPhotoStore\.init\(/);
});

test('점검 결과를 화면에 보여주는 함수가 있다', () => {
  assert.match(app, /function runProbe\(\)/);
  assert.match(app, /PuPhotoStore\.probe\(/);
});

test('매니페스트를 연결한다', () => {
  assert.match(app, /<link rel="manifest" href="pu-photos-manifest\.json">/);
});

test('매니페스트가 올바른 JSON이고 이 앱을 가리킨다', () => {
  const raw = fs.readFileSync(path.join(root, 'pu-photos-manifest.json'), 'utf8');
  const m = JSON.parse(raw);
  assert.equal(m.start_url, './pu-photos.html');
  assert.equal(m.name, '푸른사진첩');
  assert.ok(Array.isArray(m.icons) && m.icons.length > 0, '아이콘이 없습니다');
});

test('포털 앱 목록에 사진첩이 있다', () => {
  const portal = fs.readFileSync(path.join(root, 'enter.html'), 'utf8');
  assert.match(portal, /key:'photos'/);
  assert.match(portal, /url:'pu-photos\.html'/);
});

test('완성 전까지 포털 타일은 관리자만 본다', () => {
  // 사진 올리기가 붙기 전(B·C단계)에 전 직원에게 빈 앱을 보여주지 않는다.
  const portal = fs.readFileSync(path.join(root, 'enter.html'), 'utf8');
  const line = portal.split('\n').find(l => l.includes("key:'photos'"));
  assert.ok(line, '사진첩 줄을 찾을 수 없습니다');
  assert.match(line, /roles:\['admin'\]/);
});
