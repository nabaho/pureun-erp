# -*- coding: utf-8 -*-
"""pureunall 이식용 패키지 생성 — 코드만 모아 폴더+zip 생성 (데이터 제외)
사용: python export_pureunall.py
출력: pureunall_package/fund-erp/  +  pureunall_package/fund-erp_YYYYMMDD.zip
"""
import io, os, shutil, sys, zipfile
from datetime import date

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

BASE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(BASE, "pureunall_package")
DEST = os.path.join(OUT, "fund-erp")

# ✅ 이식 대상 (PUREUNALL_이식대상.md 와 동일하게 유지)
INCLUDE = [
    "app.py", "db.py", "schema.sql", "docgen.py", "accounting.py",
    "import_excel.py", "import_funds_master.py", "scan_archive.py",
    "requirements.txt", "README.md", "PUREUNALL_이식대상.md",
    "export_pureunall.py", "static/index.html",
    "실행.bat", "설치_실행_안내.md",
]
# ❌ 제외 확인용 (실수 방지 검사)
#  templates/ = 서식 원본 엑셀(사업장 실데이터 포함) → fund.db 와 동일하게 저장소 제외, 배포 시 별도 동봉
FORBID = ["fund.db", "scan", "uploads", "__pycache__", "pureunall_package", "templates"]


def main():
    if os.path.exists(DEST):
        shutil.rmtree(DEST)
    os.makedirs(os.path.join(DEST, "static"), exist_ok=True)
    copied = []
    for rel in INCLUDE:
        src = os.path.join(BASE, rel)
        if not os.path.exists(src):
            print(f"⚠️ 없음(건너뜀): {rel}")
            continue
        dst = os.path.join(DEST, rel)
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        shutil.copy2(src, dst)
        copied.append(rel)
    # 금지 파일 혼입 검사 (실데이터·서식 원본이 저장소에 섞이지 않도록)
    for root, dirs, files in os.walk(DEST):
        for f in files:
            if f == "fund.db" or f.endswith(".db"):
                raise SystemExit(f"❌ 데이터 파일 혼입: {f} — 중단")
            if f.endswith(".xlsx") or f.endswith(".xls"):
                raise SystemExit(f"❌ 서식 원본 엑셀 혼입: {f} — templates는 배포 시 별도 동봉")
    zpath = os.path.join(OUT, f"fund-erp_{date.today():%Y%m%d}.zip")
    with zipfile.ZipFile(zpath, "w", zipfile.ZIP_DEFLATED) as z:
        for root, dirs, files in os.walk(DEST):
            for f in files:
                full = os.path.join(root, f)
                z.write(full, os.path.relpath(full, OUT))
    print(f"✅ 이식 패키지 생성: {len(copied)}개 파일")
    print(f"   폴더: {DEST}")
    print(f"   zip : {zpath}")
    print("   → pureunall 저장소에 fund-erp/ 폴더째 복사하면 됩니다.")
    print("   ⚠️ 저장소 제외(배포 시 대상 PC에 별도 동봉):")
    print("      · fund.db (기금 실데이터)")
    print("      · templates/ 서식 원본 엑셀 2종 → 대상 PC의 fund-erp/templates/ 에 넣기")
    print("      · 실행 방법: fund-erp/실행.bat 더블클릭 (설치_실행_안내.md 참고)")


if __name__ == "__main__":
    main()
