'use strict';
/* 홈페이지 → 최초 자료 (1회성)
   docs/homepage-backup/2026-08-16 에 받아둔 백업에서 구성원과 쪽 본문을 뽑는다.
   파이어베이스에 직접 쓰지 않는다 — JSON 을 뱉기만 하고, 넣는 것은 사람이 확인 후 한다. */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const R = path.join(__dirname, '..');
const PAGES = ['work1', 'work2', 'work3', 'work4', 'work5a', 'work5b', 'inquiry', 'greeting'];

function parser() {
  const ctx = { window: undefined, globalThis: {} };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(R, 'js', 'pu-home-parse.js'), 'utf8'), ctx);
  return ctx.globalThis.PuHomeParse;
}

function buildInitial(readFile) {
  const P = parser();
  const members = {};
  const memberList = P.parseMembers(readFile('people.html'));

  // 2026-08-16 백업 기준 9명. 사람이 늘거나 줄면 이 숫자를 고치고 다시 돌린다.
  const EXPECTED_MEMBERS = 9;

  if (memberList.length === 0) {
    throw new Error('구성원을 ' + EXPECTED_MEMBERS + '명 기대했는데 0명이 읽혔습니다. 홈페이지 백업 파일이 비었거나 화면 구조가 바뀌었을 수 있습니다.');
  }

  if (memberList.length !== EXPECTED_MEMBERS) {
    throw new Error('구성원을 ' + EXPECTED_MEMBERS + '명 기대했는데 ' + memberList.length + '명만 읽혔습니다. 홈페이지 화면 구조가 바뀌었을 수 있습니다.');
  }

  memberList.forEach(function (m) {
    members[m.srl] = {
      name: m.name, position1: m.position1, position2: m.position2,
      intro: '', // 홈페이지 공개 화면에 「메인 설명」 칸이 안 나와서 읽어올 수 없으며, 사람이 편집 화면을 보고 채운다.
      careers: m.careers, srl: m.srl
    };
  });

  const pages = {};
  PAGES.forEach(function (mid) {
    const pageText = P.parsePageText(readFile(mid + '.html'));
    if (!pageText || pageText.trim() === '') {
      throw new Error(mid + ' 쪽의 본문이 비었습니다. 홈페이지 화면을 확인하십시오.');
    }
    pages[mid] = { text: pageText };
  });

  return { members: members, pages: pages };
}

if (require.main === module) {
  const BK = path.join(R, 'docs', 'homepage-backup', '2026-08-16');
  const out = buildInitial(function (name) {
    return fs.readFileSync(path.join(BK, name), 'utf8');
  });
  process.stdout.write(JSON.stringify(out, null, 2));
}

module.exports = { buildInitial: buildInitial, PAGES: PAGES };
