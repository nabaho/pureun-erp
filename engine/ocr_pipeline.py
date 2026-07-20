# -*- coding: utf-8 -*-
"""
OCR 파이프라인 골격 (설계: Gemini Flash 1차 + Claude 재판독, 3중 방어)
- 대상: 스캔 이미지·이미지PDF 급여대장(467 이미지 + 135 스캔PDF). 텍스트PDF는 pdf 직접추출.
- ★ 외부 전송 전 주민번호 마스킹. ★ 3중 방어(행합계 검산 → 2모델 비교 → 저확신 사람).
- ⚠ 실제 비전 호출부는 대표님 API 키가 있어야 동작(call_vision가 stub). 키 없이는 실행 안 됨.
- 개인정보(이름+급여)를 외부로 보내므로 대표님 명시적 동의 + 마스킹 후에만 사용.
"""
import os, re, json

DATA_ROOT = os.environ.get(
    "PAYROLL_DATA_ROOT",
    r"C:\Users\fair0\OneDrive\바탕 화면\급여아웃소싱 서류들",
)
OUT_DIR = os.path.join(DATA_ROOT, "_harness_out")

JUMIN = re.compile(r'(\d{6})[-\s]?\d{7}')


# ── 1) 주민번호 마스킹 (전송 전 필수) ─────────────────────────
def mask_rrn_text(text):
    """추출 텍스트에서 주민번호 뒤 7자리 마스킹(앞 생년월일도 필요시)."""
    return JUMIN.sub(lambda m: m.group(1) + "-*******", text)

def mask_rrn_image(img_path):
    """[미구현] 이미지의 주민번호 영역 마스킹.
    방법: (a) 1차 로컬 OCR로 주민번호 위치 탐지 → 사각형 덧칠, 또는
         (b) 급여대장 양식별 주민번호 컬럼 좌표 템플릿 적용.
    → 이미지 전송 파이프라인 실사용 전 반드시 구현(설계 보안 ②전송 마스킹)."""
    raise NotImplementedError("이미지 주민번호 마스킹 미구현 — 전송 전 필수 구현")


# ── 2) 비전 호출 (대표님 API 키 필요 — stub) ──────────────────
def call_vision(img_path, model):
    """[stub] 실제로는 Gemini Flash / Claude 비전 API 호출.
    키 세팅 후 이 함수만 구현하면 파이프라인 가동.
    반환 예: {'employees':[{성명, 기본급, 소득세, ...}], 'confidence':0.9}"""
    raise NotImplementedError(
        "비전 API 키 필요. 대표님이 Gemini/Claude 키 제공 + 외부전송 동의 후 구현.")


# ── 3) 3중 방어 검산 ─────────────────────────────────────────
def check_row_sum(emp):
    """① 행합계 검산: 지급 - 공제 = 실수령 이 맞는지."""
    g = emp.get("지급총액"); d = emp.get("공제총액"); n = emp.get("실수령")
    if g is None or d is None or n is None:
        return None
    return abs((g - d) - n) <= 10

def cross_model(res_a, res_b):
    """② 2모델 비교: Gemini vs Claude 결과 불일치 항목 → 사람 확인."""
    diffs = []
    for k in set(res_a) | set(res_b):
        if res_a.get(k) != res_b.get(k):
            diffs.append(k)
    return diffs

def confidence_gate(conf, threshold=0.9):
    """③ 저확신 → 사람 확인 큐로."""
    return conf >= threshold


def process_image(img_path):
    """한 장 처리 흐름(골격). 실제 동작은 call_vision 구현 후."""
    # 1) 마스킹  2) 1차 Gemini  3) 저확신·불일치 시 Claude 재판독  4) 3중 검산  5) 사람 큐
    masked = mask_rrn_image(img_path)          # 전송 전 마스킹
    a = call_vision(masked, "gemini-flash")    # 1차(저가)
    if not confidence_gate(a.get("confidence", 0)):
        b = call_vision(masked, "claude")      # 재판독(저확신만)
        if cross_model(a, b):
            return {"status": "사람확인", "a": a, "b": b}
    return {"status": "ok", "result": a}


def main():
    tri_path = os.path.join(OUT_DIR, "ocr_triage.json")
    tri = json.load(open(tri_path, encoding="utf-8")) if os.path.exists(tri_path) else {"scan": []}
    print("OCR 파이프라인 골격 — 준비 상태 점검")
    print(f"  스캔형 PDF 대상: {len(tri.get('scan', []))}")
    print("  마스킹(텍스트): 구현됨 / 마스킹(이미지): 미구현")
    print("  비전 호출: stub (API 키 필요)")
    print("  3중 검산: 구현됨 (행합계·2모델·확신도)")
    print("→ 실행하려면: (1) 대표님 API 키 (2) 외부전송 동의 (3) 이미지 마스킹 구현")
    # 마스킹 데모(텍스트)
    demo = "성명 홍길동 주민번호 900101-1234567 기본급 2,000,000"
    print("\n마스킹 데모:", mask_rrn_text(demo))


if __name__ == "__main__":
    main()
