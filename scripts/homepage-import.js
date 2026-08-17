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
  P.parseMembers(readFile('people.html')).forEach(function (m) {
    members[m.srl] = {
      name: m.name, position1: m.position1, position2: m.position2,
      intro: '', careers: m.careers, srl: m.srl
    };
  });

  const pages = {};
  PAGES.forEach(function (mid) {
    pages[mid] = { text: P.parsePageText(readFile(mid + '.html')) };
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
