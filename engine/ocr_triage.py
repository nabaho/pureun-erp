# -*- coding: utf-8 -*-
"""
OCR 사전 분류 — 급여대장 PDF를 텍스트형 vs 스캔형으로 나눔
- 텍스트형 PDF: 로컬에서 바로 추출 가능(외부 전송·비용 0, 개인정보 안전).
- 스캔형(이미지) PDF: LLM 비전 필요(외부 API·비용·마스킹) → 별도 단계.
- 결과: _harness_out/ocr_triage.txt, ocr_triage.json
"""
import os, json
import fitz  # PyMuPDF

DATA_ROOT = os.environ.get(
    "PAYROLL_DATA_ROOT",
    r"C:\Users\fair0\OneDrive\바탕 화면\급여아웃소싱 서류들",
)
OUT_DIR = os.path.join(DATA_ROOT, "_harness_out")
TEXT_MIN = 120   # 페이지 평균 이 글자수 이상이면 텍스트형


def main():
    cls = json.load(open(os.path.join(OUT_DIR, "file_classification.json"), encoding="utf-8"))
    pdfs = [r for r in cls if r["label"] == "급여대장" and r["ext"] == ".pdf"]

    text_pdf, scan_pdf, err = [], [], []
    for r in pdfs:
        p = os.path.join(DATA_ROOT, r["path"])
        try:
            doc = fitz.open(p)
            n = doc.page_count or 1
            chars = 0
            for pg in doc[:min(n, 5)]:
                chars += len(pg.get_text("text"))
            doc.close()
            avg = chars / min(n, 5)
            (text_pdf if avg >= TEXT_MIN else scan_pdf).append((r["path"], round(avg)))
        except Exception as e:
            err.append((r["path"], type(e).__name__))

    L = []
    L.append("=" * 56)
    L.append("OCR 사전 분류 — 급여대장 PDF")
    L.append("=" * 56)
    L.append(f"급여대장 PDF 총: {len(pdfs)}")
    L.append(f"  ✅ 텍스트형(로컬 추출 가능): {len(text_pdf)}")
    L.append(f"  📷 스캔형(LLM 비전 필요): {len(scan_pdf)}")
    L.append(f"  ⚠ 열기 실패: {len(err)}")
    L.append("")
    L.append("[텍스트형 예시 15]")
    for path, avg in text_pdf[:15]:
        L.append(f"  ({avg}자/쪽) {os.path.basename(path)}")
    L.append("")
    L.append("[스캔형 예시 10]")
    for path, avg in scan_pdf[:10]:
        L.append(f"  ({avg}자/쪽) {os.path.basename(path)}")

    out = "\n".join(L)
    with open(os.path.join(OUT_DIR, "ocr_triage.txt"), "w", encoding="utf-8") as f:
        f.write(out)
    with open(os.path.join(OUT_DIR, "ocr_triage.json"), "w", encoding="utf-8") as f:
        json.dump({"text": [p for p, _ in text_pdf], "scan": [p for p, _ in scan_pdf],
                   "err": err}, f, ensure_ascii=False, indent=1)
    try:
        print(out)
    except UnicodeEncodeError:
        print("(ocr_triage.txt 참조)")


if __name__ == "__main__":
    main()
