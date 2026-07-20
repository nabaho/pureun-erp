// ============================================================
// 급여 엔진 코어 v0 — pu-erp calcPayroll 이식 + 하네스 실측 교정
// 순수 함수만(외부 의존성 없음). Node/브라우저 겸용.
//
// 실측 교정 사항 (하네스 1차 근거):
//  1. 지방소득세 = 소득세 × 10% 후 **10원 단위 절사** (pu-erp는 Math.round였음
//     — 실측 31명 전원 절사 일치, 예: 소득세 25,630 → 지방세 2,560)
//  2. 국민연금·건강보험·장기요양 = **공단 고지액 모드 기본**(재현 계산 금지, 실측)
//     → 입력으로 받은 고지액을 그대로 사용. 계산 모드는 신규입사 첫 달만.
//  3. 고용보험 = 과세총액 × 요율, **단수처리는 사업장 설정**(절사/올림/반올림 혼재 실측)
//  4. 소득세 = 간이세액표 결과를 입력으로 수용(override 우선). 자체 근사식은
//     검증 보조용으로만(정식 세액표 파일 파싱은 후속).
// ============================================================
'use strict';

const ROUND = {
  '절사':   (x) => Math.floor(x),
  '올림':   (x) => Math.ceil(x),
  '반올림': (x) => Math.round(x),
};

// 10원 단위 절사 (지방세 실측 규칙)
function trunc10(x) { return Math.floor(x / 10) * 10; }

// 고용보험 근로자부담 요율 연도별 이력 (설계 "기준값 연도별 이력" 반영)
//  2019.10~2022.06 = 0.8% / 2022.07~ = 0.9%
function empInsRateForYear(year) {
  if (!year) return 0.009;
  return year <= 2021 ? 0.008 : 0.009;   // 2022 상반기 일부 경계는 근사
}

// 사업장 설정 카드 기본값 (하네스 실측 기반)
const DEFAULT_SITE_CONFIG = {
  empInsRate: null,         // null이면 연도별 자동(empInsRateForYear). 값 지정 시 고정.
  empInsRound: '절사',      // 절사|올림|반올림 — 사업장별 하네스 판정값 주입
  noticeMode: true,         // 연금·건보·장기 = 고지액 모드
};

/**
 * 골든 대조용 파생 계산.
 * 입력 emp: { 과세총액?, 소득세?, 국민연금?, 건강보험?, 장기요양?, 고용보험?,
 *            공제총액?, 실수령?, 기본급?, 지급총액? }  (있는 필드만)
 * 반환: { 계산값들, 대조가능 필드 목록 }
 */
function deriveFromGolden(emp, cfg) {
  const c = Object.assign({}, DEFAULT_SITE_CONFIG, cfg || {});
  const out = {};

  // 1) 지방세 = 소득세 × 10% → 10원 절사
  if (emp['소득세'] != null) {
    out['지방세'] = trunc10(emp['소득세'] * 0.1);
  }

  // 2) 고용보험 = 과세총액 × 요율(연도별) → 사업장 단수처리
  const rate = (c.empInsRate != null) ? c.empInsRate : empInsRateForYear(c.year);
  if (emp['과세총액'] != null && rate > 0) {
    out['고용보험'] = ROUND[c.empInsRound](emp['과세총액'] * rate);
  }

  // 3) 공제총액 = 존재하는 공제 항목 합 + 기타공제(상조·가불·정산 등)
  //    (고지액 모드: 연금·건보·장기는 골든값 그대로)
  const dedFields = ['소득세', '지방세', '국민연금', '건강보험', '장기요양', '고용보험'];
  const present = dedFields.filter((f) => emp[f] != null);
  if (present.length >= 4) { // 대부분 있어야 합산 비교 의미 있음
    out['공제총액'] = present.reduce((s, f) => s + emp[f], 0) + (emp['기타공제'] || 0);
    out['공제총액_구성'] = present.concat(emp['기타공제'] ? ['기타공제'] : []);
  }

  // 4) 실수령 = 지급총액 − 공제총액 (골든 공제총액 우선, 없으면 엔진 합산값)
  const dedTotal = emp['공제총액'] != null ? emp['공제총액'] : out['공제총액'];
  if (emp['지급총액'] != null && dedTotal != null) {
    out['실수령'] = emp['지급총액'] - dedTotal;
  }

  return out;
}

/**
 * 골든 vs 엔진 대조 — 3분류.
 * 반환: { field: {golden, engine, diff, verdict} }
 * verdict: '일치' | '원단위(±10)' | '불일치'
 */
function compare(emp, cfg) {
  const derived = deriveFromGolden(emp, cfg);
  const res = {};
  for (const f of ['지방세', '고용보험', '공제총액', '실수령']) {
    if (derived[f] == null || emp[f] == null) continue;
    const diff = derived[f] - emp[f];
    res[f] = {
      golden: emp[f], engine: derived[f], diff,
      verdict: diff === 0 ? '일치' : (Math.abs(diff) <= 10 ? '원단위(±10)' : '불일치'),
    };
  }
  return res;
}

module.exports = { deriveFromGolden, compare, trunc10, ROUND, DEFAULT_SITE_CONFIG, empInsRateForYear };
