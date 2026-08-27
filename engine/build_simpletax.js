/* 근로소득 간이세액표 → 앱이 읽는 JSON 만들기
   ─────────────────────────────────────────────────────────────────────
   왜 필요한가: 국세청은 간이세액표의 **산출 산식을 공개하지 않는다**.
   근로소득공제·인적공제·연금보험료공제·근로소득세액공제만으로 되짚으면
   실제 표값의 2.5배가 나온다(특별소득공제·특별세액공제 표준화 금액이 비공개).
   그래서 **표 자체가 법적 기준**이고, 표를 넣어야 소득세가 맞는다.

   어디서 받나:
     공공데이터포털 「국세청_근로소득 간이세액표」  https://www.data.go.kr/data/15050747/fileData.do
     또는 홈택스 > 조회/발급 > 기타조회 > 근로소득간이세액표 (엑셀 내려받기)
   쓰는 법:
     1) 받은 엑셀을 CSV(UTF-8 또는 cp949)로 저장
     2) node engine/build_simpletax.js <csv경로> [연도]
     3) 만들어진 _harness_out/simpletax_<연도>.json 을 앱 「설정 카드」 화면의
        [간이세액표 가져오기] 로 올린다 (payroll_os/tax_table 에 저장)

   CSV 모양(국세청 파일 그대로):
     첫 두 칸 = 월 급여액 구간(이상, 미만) — "1,060 이상 1,065 미만" 처럼 **천원 단위**
     이후 칸  = 공제대상가족 1인 ~ 11인 세액(원)
   ⚠ 천원 단위 표기를 원 단위로 되돌린다(1,060 → 1,060,000). 이걸 놓치면
     모든 급여가 표 범위를 벗어나 세금이 0이 된다 — 조용히 틀리는 종류의 사고다. */
'use strict';
const fs = require('fs');
const path = require('path');

function decode(buf) {
  /* 국세청 파일은 cp949 로 저장되는 경우가 많다. UTF-8 로 읽어 깨지면(치환문자)
     cp949 로 다시 읽는다 — 숫자만 쓰므로 헤더가 깨져도 계산은 되지만,
     구간 판별에 '이상/미만' 글자를 쓸 수 있어야 한다. */
  let s = buf.toString('utf8');
  if (s.indexOf('�') >= 0) {
    try { s = new TextDecoder('euc-kr').decode(buf); } catch (e) { /* 없으면 utf8 유지 */ }
  }
  return s;
}

function splitCsvLine(line) {
  const out = [];
  let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { q = !q; continue; }
    if (c === ',' && !q) { out.push(cur); cur = ''; continue; }
    cur += c;
  }
  out.push(cur);
  return out;
}

function toNum(v) {
  if (v == null) return null;
  const s = String(v).replace(/[,\s"']/g, '').replace(/[^\d.\-]/g, '');
  if (s === '' || s === '-') return null;
  const n = Number(s);
  return isFinite(n) ? n : null;
}

function build(csvPath, year) {
  const raw = decode(fs.readFileSync(csvPath));
  const lines = raw.split(/\r?\n/).filter(l => l.trim() !== '');
  const rows = [];
  let thousandUnit = null;      // 천원 단위 표기인가 — 첫 데이터 줄로 판별

  lines.forEach(line => {
    const cells = splitCsvLine(line);
    const lo = toNum(cells[0]), hi = toNum(cells[1]);
    if (lo == null) return;                      // 머리글·설명 줄
    const tax = [];
    for (let i = 2; i < cells.length; i++) {
      const v = toNum(cells[i]);
      if (v != null) tax.push(v);
    }
    if (tax.length < 3) return;                  // 세액 칸이 없으면 데이터 줄이 아니다

    if (thousandUnit == null) {
      /* 첫 구간이 5,000 미만이면 천원 단위 표기다(간이세액표는 106만원부터
         시작하고, 그 아래 급여는 세액 0이라 표에 없다). */
      thousandUnit = (lo < 100000);
      if (thousandUnit) console.log('  · 천원 단위 표기로 판단 → 원 단위로 환산합니다');
    }
    const mul = thousandUnit ? 1000 : 1;
    rows.push({ min: lo * mul, max: (hi == null ? null : hi * mul), tax: tax });
  });

  if (!rows.length) throw new Error('세액 줄을 하나도 못 읽었습니다 — CSV 모양을 확인하세요');
  rows.sort((a, b) => a.min - b.min);
  /* 마지막 구간은 상한이 없어야 한다("~ 이상"). 상한이 있으면 그보다 높은
     급여가 「표없음」이 되어 세금이 0으로 빠진다. */
  rows[rows.length - 1].max = null;

  return {
    연도: String(year || new Date().getFullYear()),
    출처: '국세청 근로소득 간이세액표',
    만든날: new Date().toISOString().slice(0, 10),
    자녀공제: { '1명': 12500, '2명': 29160, '3명이상': '29160 + 2명초과 1명당 25000' },
    구간수: rows.length,
    가족칸: rows[0].tax.length,
    rows: rows
  };
}

function main() {
  const csv = process.argv[2];
  const year = process.argv[3];
  if (!csv) {
    console.log('사용법: node engine/build_simpletax.js <간이세액표.csv> [연도]');
    process.exit(1);
  }
  console.log('읽는 파일:', csv);
  const out = build(csv, year);
  const dir = process.env.PAYROLL_OUT ||
    path.join('C:', 'Users', 'fair0', 'OneDrive', '바탕 화면', '급여아웃소싱 서류들', '_harness_out');
  fs.mkdirSync(dir, { recursive: true });
  const dest = path.join(dir, 'simpletax_' + out.연도 + '.json');
  fs.writeFileSync(dest, JSON.stringify(out));
  console.log('만들었습니다:', dest);
  console.log('  구간', out.구간수, '개 · 가족 칸', out.가족칸, '개 · 급여 범위',
    out.rows[0].min.toLocaleString(), '~', out.rows[out.rows.length - 1].min.toLocaleString(), '원');
  console.log('다음: 앱 「설정 카드」 화면 → [간이세액표 가져오기] 로 이 파일을 올리세요.');
}

if (require.main === module) main();
module.exports = { build, splitCsvLine, toNum };
