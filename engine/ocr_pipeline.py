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

# 주민번호: (a)6-7 대시형 (b)6-부분마스킹형(뒤 *포함) (c)13자리 연속.
# 외부 전송용이라 앞 생년월일까지 통째로 가림(급여 판독에 주민번호는 불필요).
RRN = re.compile(r'\d{6}\s*[-–—/]\s*[\d*]{1,7}|(?<!\d)\d{13}(?!\d)')
JUMIN = RRN  # 하위호환


# ── 1) 주민번호 마스킹 (전송 전 필수) ─────────────────────────
def mask_rrn_text(text):
    """추출 텍스트의 주민번호를 통째로 [주민번호]로 치환(전송·저장 공용)."""
    return RRN.sub("[주민번호]", text or "")


def _line_groups(words):
    """fitz words → (block,line)별로 묶고 wordno 순 정렬."""
    from collections import defaultdict
    g = defaultdict(list)
    for w in words:
        g[(w[5], w[6])].append(w)
    for k in g:
        g[k].sort(key=lambda w: w[7])
    return g


def mask_pdf(in_path, out_path=None):
    """텍스트 레이어가 있는 PDF의 주민번호를 좌표로 찾아 검게 덮고 텍스트까지 제거.
    반환: {ok, masked(가린 개수), text_pages, image_pages(스캔=마스킹불가), out}.
    ★ image_pages>0 이면 그 페이지는 주민번호를 못 지운 것 → 외부 전송 금지."""
    import fitz
    doc = fitz.open(in_path)
    masked, text_pages, image_pages = 0, 0, []
    for page in doc:
        words = page.get_text("words")
        if not page.get_text("text").strip():
            image_pages.append(page.number)      # 스캔 이미지 페이지 = 텍스트로 못 지움
            continue
        text_pages += 1
        for _, ws in _line_groups(words).items():
            s, spans = "", []
            for w in ws:
                st = len(s); s += w[4]; spans.append((st, len(s), w)); s += " "
            for m in RRN.finditer(s):
                a, b = m.start(), m.end()
                hit = [w for (st, en, w) in spans if not (en <= a or st >= b)]
                if not hit:
                    continue
                rect = fitz.Rect(min(w[0] for w in hit), min(w[1] for w in hit),
                                 max(w[2] for w in hit), max(w[3] for w in hit))
                page.add_redact_annot(rect, fill=(0, 0, 0))
                masked += 1
        page.apply_redactions()
    if out_path is None:
        base = os.path.splitext(os.path.basename(in_path))[0]
        out_path = os.path.join(OUT_DIR, "_masked", base + "_masked.pdf")
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    doc.save(out_path, garbage=4, deflate=True)
    doc.close()
    return {"ok": True, "masked": masked, "text_pages": text_pages,
            "image_pages": image_pages, "out": out_path}


def _ocr_available():
    """오프라인(로컬) OCR 사용 가능 여부 — 이미지 주민번호 위치 탐지에 필요."""
    try:
        import pytesseract, PIL  # noqa
        import shutil
        return bool(shutil.which("tesseract"))
    except ImportError:
        return False


def mask_image(img_path, out_path=None):
    """순수 이미지/스캔 급여대장의 주민번호 마스킹.
    주민번호 '위치'를 찾으려면 오프라인 OCR(Tesseract)이 필요 —
    외부로 아무것도 보내지 않는 로컬 처리여야 안전하기 때문.
    현재 환경에 없으면 전송을 막기 위해 NotImplementedError를 던진다."""
    if not _ocr_available():
        raise NotImplementedError(
            "이미지 주민번호 마스킹 불가: 오프라인 OCR 미설치.\n"
            "  설치 필요: Tesseract-OCR(한국어 데이터) + pip install pytesseract pillow.\n"
            "  (로컬에서만 위치 탐지 → 주민번호 덮은 뒤에만 외부 전송)")
    import pytesseract, numpy as np
    from PIL import Image
    im = Image.open(img_path).convert("RGB")
    data = pytesseract.image_to_data(im, lang="kor+eng",
                                     output_type=pytesseract.Output.DICT)
    arr = np.array(im)
    # 인접 토큰을 줄 단위로 이어붙여 주민번호 패턴 위치 산출
    n = len(data["text"])
    by_line = {}
    for i in range(n):
        key = (data["block_num"][i], data["par_num"][i], data["line_num"][i])
        by_line.setdefault(key, []).append(i)
    masked = 0
    for idxs in by_line.values():
        s, spans = "", []
        for i in idxs:
            t = data["text"][i] or ""
            st = len(s); s += t
            spans.append((st, len(s), i)); s += " "
        for m in RRN.finditer(s):
            a, b = m.start(), m.end()
            hit = [i for (st, en, i) in spans if not (en <= a or st >= b)]
            for i in hit:
                x, y, w, h = (data["left"][i], data["top"][i],
                              data["width"][i], data["height"][i])
                arr[max(0, y):y + h, max(0, x):x + w] = 0   # 검게
                masked += 1
    if out_path is None:
        base = os.path.splitext(os.path.basename(img_path))[0]
        out_path = os.path.join(OUT_DIR, "_masked", base + "_masked.png")
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    Image.fromarray(arr).save(out_path)
    return {"ok": True, "masked": masked, "out": out_path}


# ── 2) 비전 호출 (대표님 API 키 필요) ─────────────────────────
def load_api_key():
    """키를 안전하게 로드: (1)환경변수 GEMINI_API_KEY, (2)gitignore된 로컬 파일.
    ★ 키는 코드/채팅/git 어디에도 하드코딩 금지. 이 함수가 대표님 PC에서만 읽음."""
    k = os.environ.get("GEMINI_API_KEY")
    if k:
        return _clean_key(k)
    keyfile = os.path.join(os.path.dirname(__file__), ".secrets", "gemini.key")
    if os.path.exists(keyfile):
        # utf-8-sig: 메모장이 붙이는 BOM(﻿)을 자동 제거(안 그러면 키 앞에 안 보이는
        # 글자가 붙어 인증이 계속 실패함). strip()은 BOM을 못 지운다.
        return _clean_key(open(keyfile, encoding="utf-8-sig").read())
    return None


def _clean_key(k):
    """키 정리: 공백·줄바꿈·BOM·실수로 붙은 따옴표 제거."""
    if k is None:
        return None
    return k.strip().strip('"\'').lstrip("﻿").strip() or None

# 모델명은 바뀔 수 있음 → 환경변수로 교체 가능(기본값은 2026 기준 합리값).
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.0-flash")          # 1차(저가)
GEMINI_MODEL_VERIFY = os.environ.get("GEMINI_MODEL_VERIFY", "gemini-2.5-pro")  # 재판독(교차검증)
GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={key}"

VISION_PROMPT = (
    "너는 한국 급여대장/노임대장 판독기다. 이미지의 표를 읽어 직원별 급여를 JSON으로만 반환하라.\n"
    "규칙: (1) 주민번호는 검게 마스킹되어 있으니 무시. (2) 금액은 콤마 없는 정수, 없으면 null.\n"
    "(3) 성명 외 항목: 기본급·과세총액·소득세·지방세·국민연금·건강보험·장기요양·고용보험·"
    "공제총액·실수령·일당·근무일수·연말정산(음수=환급). (4) 합계/소계 행은 제외.\n"
    "형식: {\"employees\":[{\"성명\":\"...\",\"기본급\":숫자|null, ...}, ...]}\n"
    "설명 없이 JSON만 출력."
)


def _render_png_bytes(path, page=0, dpi=170):
    """PDF/이미지 → PNG 바이트(마스킹된 파일을 비전에 보낼 형태)."""
    import fitz
    doc = fitz.open(path)
    try:
        pg = doc[page]
        return pg.get_pixmap(dpi=dpi).tobytes("png")
    finally:
        doc.close()


def _page_count(path):
    import fitz
    doc = fitz.open(path)
    try:
        return doc.page_count
    finally:
        doc.close()


def _gemini_vision(png_bytes, prompt, model, key, timeout=60):
    """Gemini generateContent REST 호출(마스킹된 PNG 1장 + 프롬프트) → 모델 텍스트."""
    import urllib.request, base64
    body = json.dumps({
        "contents": [{"parts": [
            {"text": prompt},
            {"inline_data": {"mime_type": "image/png",
                             "data": base64.b64encode(png_bytes).decode()}}]}],
        "generationConfig": {"temperature": 0, "response_mime_type": "application/json"},
    }).encode("utf-8")
    url = GEMINI_ENDPOINT.format(model=model, key=key)
    req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        resp = json.loads(r.read().decode("utf-8"))
    try:
        return resp["candidates"][0]["content"]["parts"][0]["text"]
    except (KeyError, IndexError):
        raise RuntimeError("Gemini 응답 파싱 실패: " + json.dumps(resp)[:300])


def _num(v):
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return v
    s = str(v).replace(",", "").replace(" ", "").strip()
    if s in ("", "-", "—", "null", "None"):
        return None
    try:
        f = float(s)
        return int(f) if f == int(f) else f
    except ValueError:
        return None


NUM_FIELDS = ["기본급", "과세총액", "소득세", "지방세", "국민연금", "건강보험", "장기요양",
              "고용보험", "공제총액", "실수령", "일당", "근무일수", "연말정산", "지급총액"]


def parse_vision_json(text):
    """모델 응답 텍스트 → 정규화된 직원 리스트. ```json 펜스·잡텍스트 방어."""
    t = (text or "").strip()
    if "```" in t:                       # 코드펜스 제거
        t = re.sub(r"^```[a-zA-Z]*\s*|\s*```$", "", t.strip("`\n "), flags=re.M)
    i, j = t.find("{"), t.rfind("}")
    if i >= 0 and j > i:
        t = t[i:j + 1]
    data = json.loads(t)
    emps = data.get("employees") if isinstance(data, dict) else data
    SUM_ROWS = {"합계", "소계", "총계", "합 계", "총 계", "계", "누계"}
    out = []
    for e in emps or []:
        nm = str(e.get("성명", "")).strip()
        if not nm or nm.replace(" ", "") in {s.replace(" ", "") for s in SUM_ROWS}:
            continue  # 합계/소계 행 방어(모델이 실수로 넣어도 제외)
        rec = {"성명": nm}
        for k in NUM_FIELDS:
            n = _num(e.get(k))
            if n is not None:
                rec[k] = n
        out.append(rec)
    return out


def call_vision(masked_path, model=GEMINI_MODEL):
    """마스킹된 파일을 Gemini 비전으로 판독 → {employees, confidence, raw, model}.
    ⚠ 반드시 mask_for_transfer 통과본만 넘길 것. 키 없으면 RuntimeError.
    confidence = 행합계 검산(지급-공제=실수령) 통과 비율(모델 자체보고보다 신뢰)."""
    key = load_api_key()
    if not key:
        raise RuntimeError("API 키 없음. 환경변수 GEMINI_API_KEY 또는 engine/.secrets/gemini.key 필요.")
    employees, raws = [], []
    for p in range(_page_count(masked_path)):
        png = _render_png_bytes(masked_path, page=p)
        txt = _gemini_vision(png, VISION_PROMPT, model, key)
        raws.append(txt)
        employees.extend(parse_vision_json(txt))
    checks = [check_row_sum(e) for e in employees]
    checkable = [c for c in checks if c is not None]
    conf = (sum(1 for c in checkable if c) / len(checkable)) if checkable else 0.0
    return {"employees": employees, "confidence": round(conf, 3),
            "model": model, "raw": raws, "n_checkable": len(checkable)}


# ── 3) 3중 방어 검산 ─────────────────────────────────────────
def check_row_sum(emp):
    """① 행합계 검산: 지급 - 공제 = 실수령 이 맞는지."""
    g = emp.get("지급총액"); d = emp.get("공제총액"); n = emp.get("실수령")
    if g is None or d is None or n is None:
        return None
    return abs((g - d) - n) <= 10

def cross_model(res_a, res_b):
    """② 2모델 비교: 두 판독 결과를 성명 기준 정렬해 필드 불일치 목록 반환.
    입력은 call_vision 결과({employees:[...]}) 또는 직원 리스트 모두 허용."""
    def emps(r):
        lst = r.get("employees") if isinstance(r, dict) else r
        return {str(e.get("성명", "")).strip(): e for e in (lst or []) if e.get("성명")}
    a, b = emps(res_a), emps(res_b)
    diffs = []
    for nm in set(a) | set(b):
        if nm not in a or nm not in b:
            diffs.append({"성명": nm, "사유": "한쪽에만 있음"}); continue
        for k in NUM_FIELDS:
            if a[nm].get(k) != b[nm].get(k):
                diffs.append({"성명": nm, "항목": k, "a": a[nm].get(k), "b": b[nm].get(k)})
    return diffs

def confidence_gate(conf, threshold=0.9):
    """③ 저확신 → 사람 확인 큐로."""
    return conf >= threshold


def mask_for_transfer(path):
    """확장자에 맞는 마스커로 주민번호 제거본 생성. 못 지우면(스캔 페이지 등) 예외.
    ★ 이 함수를 통과한 파일만 외부 전송 허용."""
    ext = os.path.splitext(path)[1].lower()
    if ext == ".pdf":
        r = mask_pdf(path)
        if r["image_pages"]:
            raise RuntimeError(
                f"전송 차단: {os.path.basename(path)} — 스캔 이미지 페이지 "
                f"{len(r['image_pages'])}개는 텍스트로 주민번호를 못 지움. "
                f"이미지 마스킹(오프라인 OCR) 경로로 처리해야 함.")
        return r["out"]
    if ext in (".png", ".jpg", ".jpeg", ".tif", ".tiff", ".bmp"):
        return mask_image(path)["out"]
    raise ValueError(f"지원 안 함: {ext}")


def process_image(path):
    """한 장 처리 흐름(골격). 실제 판독은 call_vision(API 키) 구현 후.
    1) 마스킹(통과 못 하면 전송 안 함) 2) 1차 Gemini 3) 저확신 시 재판독 4) 3중검산 5) 사람큐"""
    masked = mask_for_transfer(path)              # 전송 전 마스킹(실패 시 예외=전송 안 함)
    a = call_vision(masked, GEMINI_MODEL)         # 1차(저가) — 키 필요
    if confidence_gate(a.get("confidence", 0)):
        return {"status": "ok", "result": a}
    b = call_vision(masked, GEMINI_MODEL_VERIFY)  # 재판독(저확신만, 상위 모델)
    diffs = cross_model(a, b)
    if diffs:
        return {"status": "사람확인", "a": a, "b": b, "diffs": diffs}
    return {"status": "ok", "result": b}          # 두 모델 일치 → 재판독 결과 채택


def main():
    tri_path = os.path.join(OUT_DIR, "ocr_triage.json")
    tri = json.load(open(tri_path, encoding="utf-8")) if os.path.exists(tri_path) else {"scan": []}
    print("OCR 파이프라인 준비 상태 점검")
    print(f"  스캔형 PDF 대상: {len(tri.get('scan', []))}")
    print("  마스킹(텍스트PDF): 구현·검증됨 / 마스킹(순수이미지): 오프라인OCR 있으면 동작")
    print(f"  오프라인 OCR(Tesseract) 사용 가능: {'예' if _ocr_available() else '아니오(이미지 마스킹 대기)'}")
    print("  비전 호출: stub (API 키 필요)")
    print("  3중 검산: 구현됨 (행합계·2모델·확신도)")
    print("→ 실행하려면: (1) 대표님 API 키 (2) 외부전송 동의  [텍스트PDF는 마스킹 준비완료]")
    # 마스킹 데모(텍스트)
    demo = "성명 홍길동 주민번호 900101-1234567 기본급 2,000,000"
    print("\n텍스트 마스킹 데모:", mask_rrn_text(demo))


if __name__ == "__main__":
    main()
