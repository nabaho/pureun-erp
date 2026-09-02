/* 업체관리 — 홈페이지 자동 찾기/등록 (대표 지시 2026-09-02)
 *
 * 「업체관리에 만약 홈페이지가 있는경우 찾아서 홈페이지 링크를 연결해줄 수 있나
 *  그리고 자동으로 찾는기능 만들어서 주소 등 검색해서 일치하면 등록으로 하고 싶다」
 *
 * ■ 지키려는 것
 *   ① 회사명+주소가 검색결과에 함께 나오면(서버 판정) 그 자리에서 채우고 자동 저장 알림.
 *   ② 애매하면(서버가 matched:false) 절대 조용히 등록하지 않고, 후보를 보여주고
 *      사람이 "이 주소로 쓰기"를 눌러야 채워진다 — 동명 회사 오판 방지는
 *      functions/company-website-match.test.js 가 판정 로직 자체를 지킨다.
 *   ③ 검색 중에는 버튼이 잠긴다(중복 호출 방지).
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { cutFn } = require('./cut-fn');

const R = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(R, 'pu-erp.html'), 'utf8').replace(/\r\n/g, '\n');
const modal = cutFn(SRC, 'function CompanyEditModal(props)');

function makeSandbox(initial) {
  const toasts = [];
  const state = { f: Object.assign({ name: '(주)크레오에스지', address: '충청남도 천안시 서북구 원두정8길 6' }, initial || {}) };
  const calls = [];
  const ctx = {
    f: state.f,
    webSearch: null,
    FIND_WEBSITE_URL: 'https://us-central1-pureun-erp.cloudfunctions.net/findCompanyWebsite',
    setF: function (updater) { state.f = typeof updater === 'function' ? updater(state.f) : updater; ctx.f = state.f; },
    setWebSearch: function (v) { ctx.webSearch = v; },
    showToast: function (msg) { toasts.push(msg); },
    postMail: function (url, payload) { calls.push({ url: url, payload: payload }); return ctx.__mockResponse(url, payload); },
    Promise: Promise, Object: Object, String: String, console: console,
  };
  vm.createContext(ctx);
  const searchFn = cutFn(modal, 'function searchCompanyWebsite()');
  const pickFn = cutFn(modal, 'function pickWebsite(url)');
  vm.runInContext(
    searchFn + '\n' + pickFn +
    '\nvar __api = { searchCompanyWebsite:searchCompanyWebsite, pickWebsite:pickWebsite };',
    ctx
  );
  return { ctx, state, toasts, calls, api: ctx.__api };
}

test('★★ 서버가 matched:true 면 즉시 채우고 자동 등록 토스트를 띄운다', async () => {
  const { ctx, state, toasts, api } = makeSandbox();
  ctx.__mockResponse = function () {
    return Promise.resolve({ status: 200, json: function () { return Promise.resolve({ matched: true, url: 'https://creoesg.co.kr', candidates: [] }); } });
  };
  api.searchCompanyWebsite();
  await new Promise((r) => setTimeout(r, 10));
  assert.strictEqual(state.f.website, 'https://creoesg.co.kr', '자동 등록되지 않았다');
  assert.strictEqual(ctx.webSearch, null, '검색 패널이 안 닫혔다');
  assert.ok(toasts.some((t) => t.indexOf('자동 등록') >= 0), '자동 등록 안내가 없다');
});

test('★★ 서버가 matched:false 면 절대 조용히 채우지 않고 후보만 보여준다', async () => {
  const { ctx, state, api } = makeSandbox();
  const cands = [{ title: 'A', link: 'https://a.example', snippet: 's' }];
  ctx.__mockResponse = function () {
    return Promise.resolve({ status: 200, json: function () { return Promise.resolve({ matched: false, url: null, candidates: cands }); } });
  };
  api.searchCompanyWebsite();
  await new Promise((r) => setTimeout(r, 10));
  assert.strictEqual(state.f.website, undefined, '애매한데 website 가 채워졌다 — 동명 회사가 뒤바뀔 수 있다');
  assert.ok(ctx.webSearch && Array.isArray(ctx.webSearch.candidates), '후보 목록이 안 왔다');
  assert.strictEqual(ctx.webSearch.candidates.length, 1);
});

test('사람이 후보를 고르면(pickWebsite) 그때 채워지고 후보 패널이 닫힌다', () => {
  const { ctx, state, toasts, api } = makeSandbox();
  ctx.webSearch = { loading: false, candidates: [{ title: 'A', link: 'https://a.example', snippet: '' }], error: '' };
  api.pickWebsite('https://picked.example');
  assert.strictEqual(state.f.website, 'https://picked.example');
  assert.strictEqual(ctx.webSearch, null, '고른 뒤에도 후보 패널이 안 닫혔다');
  assert.ok(toasts.length > 0);
});

test('서버 오류(비-200)면 에러만 표시하고 website 는 그대로', async () => {
  const { ctx, state, api } = makeSandbox();
  ctx.__mockResponse = function () {
    return Promise.resolve({ status: 500, json: function () { return Promise.resolve({ error: '검색 도구가 아직 설정되지 않았습니다' }); } });
  };
  api.searchCompanyWebsite();
  await new Promise((r) => setTimeout(r, 10));
  assert.strictEqual(state.f.website, undefined);
  assert.ok(ctx.webSearch && ctx.webSearch.error, '오류 메시지가 안 왔다');
});

test('업체명이 없으면 서버를 부르지 않는다', () => {
  const { ctx, calls, api } = makeSandbox({ name: '' });
  ctx.__mockResponse = function () { throw new Error('부르면 안 된다'); };
  api.searchCompanyWebsite();
  assert.strictEqual(calls.length, 0, '업체명 없이 검색을 시도했다');
});

/* ── 구조: 화면에 실제로 붙어 있는가 ── */
test('편집 모달에 홈페이지 입력칸과 찾기 버튼이 있다', () => {
  assert.match(modal, /'홈페이지'/);
  assert.match(modal, /onChange:set\('website'\)/);
  assert.match(modal, /onClick:searchCompanyWebsite/);
});

test('검색 중에는 버튼이 잠긴다', () => {
  assert.match(modal, /disabled: !!\(webSearch && webSearch\.loading\)/);
});
