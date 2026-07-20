// 확대검증: 여러 사업장 × 단수처리 방식 매트릭스로 엔진 대조
// 사용: node engine/validate_multi.js
'use strict';
const fs = require('fs');
const path = require('path');
const { compare } = require('./payroll_core');

const DATA_ROOT = process.env.PAYROLL_DATA_ROOT ||
  'C:\\Users\\fair0\\OneDrive\\바탕 화면\\급여아웃소싱 서류들';
const OUT_DIR = path.join(DATA_ROOT, '_harness_out');

const SITES = process.argv.slice(2);
const targets = SITES.length ? SITES : ['가람떡집', '화담원 서산점', '늘봄반찬'];
const MODES = ['절사', '올림', '반올림'];

const res = JSON.parse(fs.readFileSync(path.join(OUT_DIR, 'parser_output.json'), 'utf-8'));

function yearOf(p, s) {
  let m = String(p).match(/20(\d\d)/); if (m) return 2000 + +m[1];
  m = String(s).match(/(\d\d)\s*년/) || String(p).match(/(\d\d)년/); if (m) return 2000 + +m[1];
  return null;
}

function evalSite(siteKey, mode) {
  const files = res.filter(r => r.ok && r.path.includes(siteKey));
  const stat = {}; let nEmp = 0;
  for (const f of files) for (const s of f.sheets) {
    const cfg = { empInsRound: mode, year: yearOf(f.path, s.sheet) };
    for (const e of s.employees) {
      nEmp++;
      const cmp = compare(e, cfg);
      for (const [fld, r] of Object.entries(cmp)) {
        stat[fld] = stat[fld] || { ok: 0, tot: 0 };
        stat[fld].tot++;
        if (r.verdict !== '불일치') stat[fld].ok++;
      }
    }
  }
  return { files: files.length, nEmp, stat };
}

const L = [];
L.push('='.repeat(60));
L.push('엔진 확대검증 — 사업장 × 단수처리 매트릭스');
L.push('='.repeat(60));
for (const site of targets) {
  L.push('');
  // 파일 수는 모드 무관 → 절사로 1회 계산
  const base = evalSite(site, '절사');
  L.push(`■ ${site}  (파일 ${base.files} / 직원레코드 ${base.nEmp})`);
  const fields = ['지방세', '고용보험', '공제총액', '실수령'];
  // 헤더
  L.push('   항목       | ' + MODES.map(m => m.padEnd(10)).join('| ') + '| 모수');
  for (const fld of fields) {
    const cells = MODES.map(m => {
      const st = evalSite(site, m).stat[fld];
      if (!st || !st.tot) return '-'.padEnd(10);
      return (Math.round(100 * st.ok / st.tot) + '%').padEnd(10);
    });
    const tot = (base.stat[fld] ? base.stat[fld].tot : 0);
    L.push(`   ${fld.padEnd(8)} | ` + cells.join('| ') + `| ${tot}`);
  }
}
L.push('');
L.push('※ 지방세=계산검증(모드무관). 고용보험=단수처리 방식 판별용(최고% 방식 채택).');
L.push('※ 공제총액·실수령 저조 = 골든의 사업장별 추가 공제항목/지급총액 미확보(정책차이).');

const out = L.join('\n');
fs.writeFileSync(path.join(OUT_DIR, 'engine_validate_multi.txt'), out, 'utf-8');
try { console.log(out); } catch (e) { console.log('(engine_validate_multi.txt 참조)'); }
