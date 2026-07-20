// ============================================================
// 엔진 2단계 검증: 골든(파서 결과) 대조 채점
// 사용: node engine/check_golden.js "<사업장키워드>" [단수처리모드]
// 예:  node engine/check_golden.js "화담원 천안점" 반올림
// 결과: _harness_out/engine_check_<사업장>.txt
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');
const { compare } = require('./payroll_core');

const DATA_ROOT = process.env.PAYROLL_DATA_ROOT ||
  'C:\\Users\\fair0\\OneDrive\\바탕 화면\\급여아웃소싱 서류들';
const OUT_DIR = path.join(DATA_ROOT, '_harness_out');

const siteKey = process.argv[2];
const roundMode = process.argv[3] || '절사';
if (!siteKey) { console.log('사용: node check_golden.js "<사업장>" [절사|올림|반올림]'); process.exit(1); }

const res = JSON.parse(fs.readFileSync(path.join(OUT_DIR, 'parser_output.json'), 'utf-8'));
const files = res.filter(r => r.ok && r.path.includes(siteKey));

const stat = {};   // field -> {일치, 원단위, 불일치}
const bad = [];    // 불일치 상세
let nEmp = 0, nSheet = 0;

// 파일경로/시트명에서 귀속연도 추정 (연도별 고용보험 요율용)
function yearOf(pathStr, sheet) {
  let m = String(pathStr).match(/20(\d\d)/);       // 2021, 2025 ...
  if (m) return 2000 + parseInt(m[1], 10);
  m = String(sheet).match(/(\d\d)\s*년/) || String(pathStr).match(/(\d\d)년/);
  if (m) return 2000 + parseInt(m[1], 10);
  return null;
}

for (const f of files) {
  for (const s of f.sheets) {
    nSheet++;
    const cfg = { empInsRound: roundMode, year: yearOf(f.path, s.sheet) };
    for (const e of s.employees) {
      nEmp++;
      const cmp = compare(e, cfg);
      for (const [fld, r] of Object.entries(cmp)) {
        stat[fld] = stat[fld] || { '일치': 0, '원단위(±10)': 0, '불일치': 0 };
        stat[fld][r.verdict]++;
        if (r.verdict === '불일치' && bad.length < 30) {
          bad.push(`  [${fld}] ${e['성명']} 골든=${r.golden} 엔진=${r.engine} 차이=${r.diff}` +
                   ` (${path.basename(f.path)} / ${s.sheet})`);
        }
      }
    }
  }
}

const L = [];
L.push('='.repeat(52));
L.push(`엔진 2단계 골든 대조 - [${siteKey}] (고용보험 ${roundMode})`);
L.push('='.repeat(52));
L.push(`대상: 파일 ${files.length}개 / 시트 ${nSheet}개 / 직원레코드 ${nEmp}건`);
L.push('');
L.push('[항목별 3분류] (엔진오류/골든오류/정책차이는 불일치 상세로 판별)');
for (const [fld, s] of Object.entries(stat)) {
  const tot = s['일치'] + s['원단위(±10)'] + s['불일치'];
  const pct = Math.round(100 * (s['일치'] + s['원단위(±10)']) / Math.max(tot, 1));
  L.push(`  ${fld}: 일치 ${s['일치']} + 원단위 ${s['원단위(±10)']} = ${pct}%  /  불일치 ${s['불일치']}  (모수 ${tot})`);
}
L.push('');
if (bad.length) { L.push('[불일치 상세 (최대 30)]'); L.push(...bad); }
L.push('');
L.push('※ 연금·건보·장기 = 고지액 모드(골든값 입력) - 실측 원칙상 재계산 안 함.');
L.push('※ 지방세 = 소득세x10% 10원 절사(실측 교정). 고용보험 = 과세총액x0.9% ' + roundMode + '.');

const out = L.join('\n');
const safe = siteKey.replace(/[\\/:*?"<>|]/g, '_');
fs.writeFileSync(path.join(OUT_DIR, `engine_check_${safe}.txt`), out, 'utf-8');
console.log(out.slice(0, 400));
console.log('\n(저장: engine_check_' + safe + '.txt)');
