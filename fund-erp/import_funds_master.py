# -*- coding: utf-8 -*-
"""복지기금담당자등 시트 → 기금 대장 이관 (기존 기금 데이터화 1차)
- 자문·수임 기금 신규 등록 (사내/공동 자동 판별)
- 지역기금(충남·경기)은 담당자·대표사업장(사무국)·자문여부만 갱신
- 대표사업장(상공회의소·연합회)을 기관으로 등록해 '사무국' 역할로 연결
사용: python import_funds_master.py ["엑셀경로"]
"""
import sys, os, re
import openpyxl
from db import connect, init_db, audit, next_id

DEFAULT_XLSX = r"C:\Users\fair0\Downloads\푸른노무법인 (4).xlsx"

# 시트 기금명 → 기존 short_name 매핑 (지역기금)
REGION_PAT = re.compile(r"(충남|경기)공동근로복지기금\s*(\d+)\s*호")


def fund_type_of(name):
    if "사내" in name:
        return "사내"
    return "공동"


def clean(v):
    return str(v or "").replace("\n", " ").strip()


def ensure_agency(con, name, atype):
    row = con.execute("SELECT agency_id FROM agencies WHERE name=?", (name,)).fetchone()
    if row:
        return row[0]
    n = con.execute("SELECT COUNT(*) FROM agencies").fetchone()[0]
    aid = f"AG-{n + 1:04d}"
    con.execute("INSERT INTO agencies(agency_id,name,agency_type) VALUES(?,?,?)", (aid, name, atype))
    return aid


def main():
    xlsx = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_XLSX
    init_db()
    con = connect()
    wb = openpyxl.load_workbook(xlsx, data_only=True)
    ws = wb["복지기금담당자등"]
    rows = list(ws.iter_rows(values_only=True))
    created = updated = 0
    for r in rows:
        if not r or not r[0]:
            continue
        try:
            int(str(r[0]).strip())
        except ValueError:
            continue
        name = clean(r[1])
        if not name:
            continue
        rep_org = clean(r[2])
        cust = clean(r[3])                    # 고객사(대표사업장) 담당자
        mgr = clean(r[4])                     # 푸른노무법인 담당자
        phone = clean(r[5])
        email = clean(r[6])
        advisory = clean(r[7])
        note = clean(r[8])
        rep_contact = " / ".join(x for x in [cust, phone, email] if x)

        m = REGION_PAT.search(name.replace(" ", ""))
        if m:
            short = f"{m.group(1)} {int(m.group(2))}호"
            row = con.execute("SELECT fund_id FROM funds WHERE short_name=?", (short,)).fetchone()
            if row:
                fid = row[0]
                con.execute(
                    "UPDATE funds SET mgmt_type='수임', advisory=?, manager=?, rep_org=?,"
                    " rep_contact=?, updated_at=datetime('now','localtime') WHERE fund_id=?",
                    (advisory, mgr, rep_org, rep_contact, fid))
                if rep_org:
                    aid = ensure_agency(con, rep_org, "사무국")
                    con.execute("INSERT OR IGNORE INTO fund_agencies(fund_id,agency_id,role)"
                                " VALUES(?,?,'사무국')", (fid, aid))
                    if cust:
                        cur = con.execute(
                            "SELECT 1 FROM agency_contacts WHERE agency_id=? AND name=? AND is_current=1",
                            (aid, cust.split()[0])).fetchone()
                        if not cur:
                            con.execute(
                                "INSERT INTO agency_contacts(agency_id,name,position,phone,email)"
                                " VALUES(?,?,?,?,?)",
                                (aid, cust.split()[0],
                                 cust.split()[1] if len(cust.split()) > 1 else "", phone, email))
                updated += 1
                continue

        # 자문·수임 개별 기금 (신규 등록)
        row = con.execute("SELECT fund_id FROM funds WHERE name=? OR short_name=?",
                          (name, name)).fetchone()
        if row:
            fid = row[0]
            con.execute(
                "UPDATE funds SET advisory=?, manager=?, rep_org=?, rep_contact=?,"
                " updated_at=datetime('now','localtime') WHERE fund_id=?",
                (advisory, mgr, rep_org, rep_contact, fid))
            updated += 1
        else:
            fid = next_id(con, "funds", "fund_id", "FUND")
            ftype = fund_type_of(name)
            con.execute(
                "INSERT INTO funds(fund_id,name,short_name,fund_type,region,mgmt_type,advisory,"
                "manager,rep_org,rep_contact,note) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
                (fid, name, name.replace("근로복지기금", "").replace("공동", "공동")[:12],
                 ftype, "", "자문" if "자문" in advisory else "수임",
                 advisory, mgr, rep_org, rep_contact, note))
            audit(con, "funds", fid, "create", after=f"{name} (기금대장 이관)")
            pnp = ensure_agency(con, "푸른노무법인", "수탁법인")
            con.execute("INSERT OR IGNORE INTO fund_agencies(fund_id,agency_id,role)"
                        " VALUES(?,?,'수탁기관')", (fid, pnp))
            if ftype == "공동":
                kc = ensure_agency(con, "근로복지공단", "공단")
                con.execute("INSERT OR IGNORE INTO fund_agencies(fund_id,agency_id,role)"
                            " VALUES(?,?,'지원기관')", (fid, kc))
            created += 1
    audit(con, "system", "import_funds_master", "import", after=os.path.basename(xlsx))
    con.commit()
    n = con.execute("SELECT COUNT(*) FROM funds").fetchone()[0]
    print(f"기금 신규 {created} / 갱신 {updated} / 총 {n}")
    con.close()


if __name__ == "__main__":
    main()
