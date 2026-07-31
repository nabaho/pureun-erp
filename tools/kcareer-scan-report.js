'use strict';
// kcareer 서류 폴더 전량 판정 리포트 — UI 구현 전 규칙 검증용
// 실행: node tools/kcareer-scan-report.js "C:\Users\fair0\OneDrive\바탕 화면\권형하 개인 이력등"
// 출력: _scan_out/kcareer_판정.csv, _scan_out/kcareer_요약.txt (개인정보 포함 → 커밋 금지)
const fs = require('node:fs');
const path = require('node:path');
const KS = require('../js/kcareer-scan.js');

const ROOT = process.argv[2];
if (!ROOT) { console.error('사용법: node tools/kcareer-scan-report.js <서류폴더 절대경로>'); process.exit(1); }
const OUT = path.join(__dirname, '..', '_scan_out');
fs.mkdirSync(OUT, { recursive: true });

// 폴더를 훑어 이름·크기·수정일만 읽는다(내용은 읽지 않는다)
// ⚠ OneDrive 폴더는 재분석 지점(reparse point)이라 Dirent.isDirectory()가 false를 준다.
//   statSync는 링크를 따라가므로 그 결과로 폴더 여부를 판정해야 7번 폴더가 빠지지 않는다.
function walk(dir, prefix, acc) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (err) { return acc; }
  for (const e of entries) {
    const rel = prefix ? prefix + '/' + e.name : e.name;
    const full = path.join(dir, e.name);
    let st;
    try { st = fs.statSync(full); } catch (err) { continue; }
    if (st.isDirectory()) { walk(full, rel, acc); continue; }
    acc.push({ name: e.name, relPath: rel, size: st.size, mtime: st.mtime.toISOString() });
  }
  return acc;
}

const files = walk(ROOT, '', []);
const r = KS.buildRecords(files, { scanId: 'REPORT' });

const kept = files.filter((f) => !KS.isIgnoredFile(f.name));
const levels = { sure: 0, maybe: 0, submission: 0 };
const yearFrom = { name: 0, path: 0, mtime: 0, none: 0 };
for (const f of kept) {
  levels[KS.classify(f.name).level]++;
  yearFrom[KS.pickYear(f.name, f.relPath, f.mtime).from]++;
}

const rows = [['판정', '종류', '연도', '연도출처', '기관', '건', '경로'].join(',')];
const esc = (s) => '"' + String(s == null ? '' : s).replace(/"/g, '""') + '"';
r.promotions.forEach((p) => rows.push([esc('확실'), esc(p.type || p.titleHint || p.store), esc(p.year), esc(p.yearFrom), esc(p.org), esc(p.fromCase), esc(p.relPath)].join(',')));
r.maybes.forEach((m) => rows.push([esc('애매'), esc(''), esc(m.year), esc(''), esc(m.org), esc(m.fromCase), esc(m.relPath)].join(',')));
r.submissions.forEach((s) => rows.push([esc('제출서류'), esc(s.fileCount + '개'), esc(s.year), esc(''), esc(s.org), esc(s.caseDir), esc(s.caseDir || s.files[0].relPath)].join(',')));
r.copies.forEach((c) => rows.push([esc('사본'), esc(''), esc(''), esc(''), esc(''), esc(''), esc(c.relPath + ' ← ' + c.sameAs)].join(',')));
fs.writeFileSync(path.join(OUT, 'kcareer_판정.csv'), '\uFEFF' + rows.join('\r\n'), 'utf8');

const 총레코드 = r.promotions.length + r.maybes.length + r.submissions.length;
const 연도채움 = kept.length ? Math.round(1000 * (yearFrom.name + yearFrom.path) / kept.length) / 10 : 0;
const summary = [
  '서류 폴더: ' + ROOT,
  '',
  '전체 파일        : ' + files.length,
  '제외(임시·부산물) : ' + r.ignored,
  '판정 대상        : ' + kept.length,
  '',
  '[파일 단위 판정] 확실 ' + levels.sure + ' / 애매 ' + levels.maybe + ' / 제출서류 ' + levels.submission,
  '  검산: ' + (levels.sure + levels.maybe + levels.submission) + ' = 판정 대상 ' + kept.length
    + ((levels.sure + levels.maybe + levels.submission) === kept.length ? ' ✓' : ' ✗ 파일이 흘렀습니다'),
  '[사본 제거]      ' + r.copies.length + '건',
  '',
  '[레코드] 승격 ' + r.promotions.length + ' + 보류 ' + r.maybes.length + ' + 제출서류 ' + r.submissions.length + ' = ' + 총레코드,
  '',
  '연도 출처: 파일명 ' + yearFrom.name + ' / 경로 ' + yearFrom.path + ' / 수정일 ' + yearFrom.mtime + ' / 없음 ' + yearFrom.none,
  '연도 채움률(파일명+경로): ' + 연도채움 + '%',
  '',
  '회귀 확인 — 상공회의소 위촉장이 승격에 있는가:',
  ...r.promotions.filter((p) => /상공회의소/.test(p.name)).map((p) => '  ✓ ' + p.name)
].join('\n');
fs.writeFileSync(path.join(OUT, 'kcareer_요약.txt'), summary, 'utf8');
console.log(summary);
