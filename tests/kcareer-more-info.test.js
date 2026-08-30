/* 경력관리 — 기본정보 여덟 칸 → 열일곱 칸 (대표 지시 2026-08-30)
   「더많은 개인정보를 넣어둬야할 것 같은데 … 핸드폰 번호 개인 이메일 집주소 등」
   「1, 2 넣어라」 = ① 주민등록번호 담기 ② 영문 성명 담기

   ■ 무엇이 어긋나 있었나
     서식을 채우는 쪽은 열셋을 알아보는데 담아 두는 칸이 여덟이었다. 그래서
     ① 한자 성명·부서·직위는 서식에 칸이 있어도 «영영 안 채워졌고»
     ② 전화·주소·이메일은 칸이 하나뿐이라 개인 것과 회사 것이 섞였다.

   ■ 주민등록번호를 담되 «저절로는 안 나간다»
     담아 두면 언젠가 확인 없이 서류에 실려 나간다 — 그 걱정이 근거가 있었기에
     여태 일부러 안 담았다. 이제 담되, 자동 채우기(autoFill)가 «아예 못 보는 자리»
     (secrets)에 둔다. 사람이 그 칸에 직접 「주민등록번호」를 고를 때만 꺼내 쓴다. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { cutFn } = require('./cut-fn');
const X = require('../js/kcareer-hwpxfill.js');
const M = require('../js/kcareer-formmap.js');

const source = fs.readFileSync(path.join(__dirname, '..', 'kcareer.html'), 'utf8');
const bare = source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');

/* ── 사전이 새 라벨을 알아보는가 ── */

test('★ 「담을 칸이 없어» 못 채우던 것들을 이제 알아본다', () => {
  assert.equal(X.fieldKeyOf('영문성명'), 'nameEng');
  assert.equal(X.fieldKeyOf('영 문 이 름'), 'nameEng');
  assert.equal(X.fieldKeyOf('한자성명'), 'nameHanja');
  assert.equal(X.fieldKeyOf('부서명'), 'dept');
  assert.equal(X.fieldKeyOf('직위'), 'title');
});

test('★ 전화를 갈라 본다 — 사무실 번호가 「휴대폰」 칸에 박히던 일', () => {
  assert.equal(X.fieldKeyOf('휴대폰'), 'phone');
  assert.equal(X.fieldKeyOf('자택전화'), 'phoneHome');
  assert.equal(X.fieldKeyOf('사무실 전화'), 'phoneWork');
  assert.equal(X.fieldKeyOf('직장전화'), 'phoneWork');
  assert.equal(X.fieldKeyOf('팩스'), 'fax');
  assert.equal(X.fieldKeyOf('FAX'), 'fax');
});

test('★ 집 주소와 사무실 주소를 갈라 본다', () => {
  assert.equal(X.fieldKeyOf('현주소'), 'addr');
  assert.equal(X.fieldKeyOf('자택주소'), 'addr');
  assert.equal(X.fieldKeyOf('회사주소'), 'addrWork');
  assert.equal(X.fieldKeyOf('근무지 주소'), 'addrWork');
});

test('여태 되던 것은 그대로 된다 — 이름표를 늘리며 옛것을 밀어내면 안 된다', () => {
  [['성명', 'name'], ['생년월일', 'birth'], ['성별', 'gender'], ['연락처', 'phone'],
   ['이메일', 'email'], ['주소', 'addr'], ['소속', 'org'], ['자격증', 'license']]
    .forEach(([label, key]) => assert.equal(X.fieldKeyOf(label), key, label));
});

/* ── ★ 주민등록번호: 담되 저절로는 안 나간다 ── */

const 표 = (rows) => '<hp:tbl>' + rows.map(r => '<hp:tr>'
  + r.map(c => '<hp:tc><hp:p><hp:run><hp:t>' + c + '</hp:t></hp:run></hp:p></hp:tc>').join('')
  + '</hp:tr>').join('') + '</hp:tbl>';
const 글자 = (xml) => (xml.match(/<hp:t[^>]*>([\s\S]*?)<\/hp:t>/g) || [])
  .map(x => x.replace(/<[^>]*>/g, '')).join(' ');

test('★★ 자동 채우기는 주민등록번호를 «절대» 안 쓴다 — secrets 를 못 본다', () => {
  const xml = 표([['성명', ''], ['주민등록번호', '']]);
  const r = X.autoFill(xml, {
    fields: { name: '권형하' },
    /* 실수로 secrets 를 통째로 넘겨도 autoFill 은 fields 만 본다 */
    secrets: { rrn: '750107-1234567' }
  });
  assert.ok(글자(r.xml).indexOf('권형하') >= 0, '성명은 채워야 합니다');
  assert.equal(글자(r.xml).indexOf('750107'), -1,
    '주민등록번호가 저절로 나가면 안 됩니다 — 잘못 낸 서류는 되돌릴 수 없습니다');
});

test('★★ fields 에 rrn 을 담는 자리를 만들지 않았다 — 담으면 자동으로 나간다', () => {
  const fn = cutFn(bare, 'function _cvFillData(');
  /* ⚠ 「fields:{ … rrn」 을 정규식 하나로 보면 안 된다 — 게으른 [\s\S]*? 도 닫는 괄호를
     넘어 뒤쪽 secrets 의 rrn 까지 닿아, 없는데 «있다»고 읽는다(실측). 경계를 정해 놓고 본다. */
  const 시작 = fn.indexOf('fields:{'), 끝 = fn.indexOf('secrets:');
  assert.ok(시작 > 0 && 끝 > 시작, 'fields 와 secrets 를 찾지 못했습니다');
  assert.equal(fn.slice(시작, 끝).indexOf('rrn'), -1,
    'rrn 은 fields 가 아니라 secrets 에 있어야 합니다 — fields 에 담으면 자동으로 나갑니다');
  assert.match(fn.slice(끝), /secrets:\s*\{\s*rrn\s*:/);
});

test('★ 사람이 «직접 고른» 자리에는 들어간다 — 담아 둔 뜻이 있어야 한다', () => {
  const xml = 표([['주민등록번호', '']]);
  const r = M.apply(xml, {
    picks: { 't0r0c1': 'rrn' },
    data: { fields: {} },
    secrets: { rrn: '750107-1234567' }
  });
  assert.ok(글자(r.xml).indexOf('750107-1234567') >= 0,
    '골랐는데도 안 들어가면 담아 둔 뜻이 없습니다');
});

test('★ 고르지 않으면 안 들어간다 — secrets 가 있어도 저절로는 아니다', () => {
  const xml = 표([['주민등록번호', '']]);
  const r = M.apply(xml, { picks: {}, data: { fields: {} }, secrets: { rrn: '750107-1234567' } });
  assert.equal(글자(r.xml).indexOf('750107'), -1);
});

test('★ 칸 지도는 주민등록번호를 «미리 골라 두지» 않는다', () => {
  const map = M.scan(표([['주민등록번호', '']]));
  const g = M.guess(map, { fields: {} });
  const slot = g.slots.filter(s => s.id === 't0r0c1')[0];
  assert.ok(slot, '자리를 찾지 못했습니다');
  assert.equal(slot.guess, '', '알아보되 «비워» 둡니다 — 고르는 것은 사람 몫입니다');
});

/* ── 화면 ── */

test('★ 기본정보가 네 묶음으로 늘었다 — 열일곱 칸을 한 줄로 늘어놓으면 못 읽는다', () => {
  assert.match(bare, /const PI_GROUPS=/);
  ['nameEng', 'rrn', 'phoneWork', 'phoneHome', 'fax', 'emailWork', 'addrHome', 'dept', 'title']
    .forEach(k => assert.ok(bare.indexOf("['" + k + "',") > 0, k + ' 칸이 있어야 합니다'));
  assert.match(bare, /const PI_FIELDS=PI_GROUPS\.reduce/,
    '저장하는 목록은 묶음에서 나와야 합니다 — 따로 적으면 한쪽만 늘어납니다');
});

test('★ 주민등록번호 칸은 «가려» 둔다 — 어깨너머로 읽히면 안 된다', () => {
  const fn = cutFn(bare, 'function renderPersonal(');
  assert.match(fn, /PI_SECRET/);
  assert.match(fn, /type="password"/);
  assert.match(bare, /function piPeek/, '눌러서 볼 방법은 있어야 합니다');
});

test('★ 고른 목록에도 주민등록번호 «글자»는 안 내보인다', () => {
  const at = bare.indexOf("_sec[p[0]] ?");
  assert.ok(at > 0, '가려 둔 값의 미리보기를 따로 다뤄야 합니다');
  assert.match(bare.slice(at, at + 60), /담겨 있음/);
});

test('★ 골라 둔 자리가 «채워진다»고 제대로 보인다', () => {
  const fn = cutFn(bare, 'function rhRenderMap(');
  assert.match(fn, /var hasVal=/,
    '가려 둔 값도 있는지 없는지는 봐야 합니다 — 아니면 골라도 노랗게 뜹니다');
  assert.match(fn, /_sec\[k\]/);
});

test('★ 채울 때 secrets 를 건네준다 — 안 건네면 골라도 안 들어간다', () => {
  assert.match(cutFn(bare, 'async function rhFillByMap('), /secrets:data\.secrets/);
});

/* ── 옛 자료가 다치지 않는가 ── */

test('★ 이미 넣어 둔 여덟 칸은 그대로 둔다 — 저장이 남의 칸을 지우면 안 된다', () => {
  const fn = cutFn(bare, 'function savePersonalInfo(');
  assert.match(fn, /const o=get\('profile_info'\)\|\|\{\}/,
    '있던 것을 읽어 얹어야 합니다 — 빈 것으로 시작하면 화면에 없는 칸이 지워집니다');
  assert.match(fn, /if\(el\)/, '화면에 없는 칸은 건드리지 않아야 합니다');
});

test('★ 사무실 번호가 «휴대폰이라고 단언»되지 않게 한 번 옮긴다', () => {
  const fn = cutFn(bare, 'function _piMigrate(');
  assert.match(fn, /phoneWork=tel/);
  assert.match(fn, /01\[016789\]/, '휴대폰 모양이면 그대로 둬야 합니다');
  assert.match(fn, /!o\.phoneWork/, '옮길 곳이 이미 차 있으면 손대지 않아야 합니다');
});

test('★ 집 주소를 안 적었으면 «오늘까지 되던 대로» 사무실 주소가 간다', () => {
  const fn = cutFn(bare, 'function _cvFillData(');
  assert.match(fn, /addr:집\|\|사무실/,
    '비워 버리면 오늘까지 되던 것이 안 되는 뒷걸음질입니다');
});

test('칸 지도가 새 열쇠를 고를 수 있게 되어 있다', () => {
  const keys = cutFn(bare, 'var RH_KEYS = [').replace(/^var RH_KEYS = /, '');
  ['nameEng', 'fax', 'addrWork', 'emailWork', 'rrn']
    .forEach(k => assert.ok(keys.indexOf("'" + k + "'") > 0, k + ' 을(를) 고를 수 있어야 합니다'));
});
