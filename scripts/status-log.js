#!/usr/bin/env node
/* status-log.js — `status/` 의 방별 기록을 «한 화면»으로 몰아 본다.
   ------------------------------------------------------------------
   왜 있나 — 2026-09-07 까지 「마지막 손댄 기록」은 STATUS.md 안의 표 하나였다.
   여러 방이 같은 끝줄에 덧붙이다 부딪혔다(PR #1087 은 3줄 덧붙였을 뿐인데 막혔다).
   그래서 방마다 딴 파일에 적기로 했다 — 이름이 겹치지 않으니 부딪힐 수가 없다.
   갈라 놓으면 «한눈에 보기»를 잃으므로, 그것을 이 도구가 돌려준다.

   쓰는 법
     node scripts/status-log.js          새것부터 한 화면에
     node scripts/status-log.js 10       최근 10건만
     node scripts/status-log.js --files  파일 목록만 (날짜·이름)

   ⚠ 이 도구는 «읽기만» 한다. 기록을 고치거나 합쳐 쓰지 않는다 —
     쓰는 자리가 하나로 모이면 부딪힘이 그대로 돌아온다.
   ------------------------------------------------------------------ */
'use strict';
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'status');

/* 파일 이름에서 날짜를 뽑는다. 옛 기록 묶음(0000-…)은 «맨 아래»로 보낸다 —
   그것은 한 건이 아니라 역사 뭉치다. */
function 날짜(name) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(name);
  return m ? m[1] + m[2] + m[3] : '';
}

/* 차례 — 날짜 내림차순 · 같은 날은 이름순 · 날짜 없는 것(역사 뭉치)은 맨 뒤.
   ⚠ 이것을 «따로 꺼내 두는» 까닭: 검사가 제 사본을 만들어 보면 도구가 망가져도
     통과한다(고장넣기에서 실제로 그랬다). 검사는 이 함수를 그대로 불러야 한다. */
function 정렬(rows) {
  return rows.slice().sort(function (a, b) {
    /* 날짜 «내림차순». 날짜가 없는 것(역사 뭉치 0000-…)은 빈 글자라 늘 작으므로
       이 한 줄만으로 저절로 맨 뒤로 간다 — 따로 가르는 줄을 두었다가 지웠다
       (고장넣기에서 «지워도 안 걸리는» 줄로 드러났다: 군더더기였다). */
    if (a.day !== b.day) return a.day < b.day ? 1 : -1;
    return a.name < b.name ? -1 : 1;
  });
}

/* 기록 목록. dir 을 주면 그곳을 본다 — 검사가 임시 자리로 돌려 볼 수 있어야 한다. */
function 목록(dir) {
  let names = [];
  try { names = fs.readdirSync(dir || DIR); } catch (_) { return []; }
  return 정렬(names
    .filter(function (n) { return /\.md$/i.test(n); })
    .map(function (n) { return { name: n, day: 날짜(n) }; }));
}

function main(argv) {
  const rows = 목록();
  if (!rows.length) {
    console.log('status/ 에 기록이 없습니다.');
    console.log('끝낼 때 status/날짜-가지이름.md 를 하나 만들어 주세요 (STATUS.md 6절 참고).');
    return 0;
  }
  const filesOnly = argv.indexOf('--files') >= 0;
  const n = argv.map(Number).filter(function (x) { return x > 0; })[0] || 0;
  const take = n ? rows.slice(0, n) : rows;

  if (filesOnly) {
    console.log('■ status/ 기록 ' + rows.length + '건' + (n ? (' — 최근 ' + take.length + '건') : ''));
    take.forEach(function (r) {
      console.log('  ' + (r.day ? r.day.slice(0, 4) + '-' + r.day.slice(4, 6) + '-' + r.day.slice(6) : '(역사)')
        + '  ' + r.name);
    });
    return 0;
  }

  console.log('■ 마지막 손댄 기록 — ' + rows.length + '건' + (n ? (' 중 최근 ' + take.length + '건') : '')
    + ' (새것부터)\n');
  take.forEach(function (r, i) {
    let body = '';
    try { body = fs.readFileSync(path.join(DIR, r.name), 'utf8'); } catch (e) {
      console.log('── ' + r.name + ' — 못 읽었습니다: ' + (e && e.message) + '\n');
      return;
    }
    /* 줄끝은 읽을 때 «한 번» 고른다 — 이 저장소는 윈도우에서 CRLF 로 내려온다
       (STATUS.md 「CI 는 초록인데 내 컴퓨터는 빨갛다」 참고). */
    body = body.replace(/\r\n/g, '\n').replace(/\s+$/, '');
    if (i) console.log('');
    console.log('── ' + r.name + ' ' + '─'.repeat(Math.max(0, 62 - r.name.length)));
    console.log(body);
  });
  return 0;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));
module.exports = { 목록: 목록, 정렬: 정렬, 날짜: 날짜, main: main, DIR: DIR };
