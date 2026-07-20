# -*- coding: utf-8 -*-
"""SQLite 연결·초기화·감사로그 헬퍼"""
import sqlite3, os, json

BASE = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE, "fund.db")
SCHEMA = os.path.join(BASE, "schema.sql")


def connect():
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA foreign_keys=ON")
    return con


def init_db():
    con = connect()
    with open(SCHEMA, encoding="utf-8") as f:
        con.executescript(f.read())
    _migrate(con)
    con.commit()
    con.close()


def _migrate(con):
    """기존 DB에 누락 컬럼 추가 (CREATE IF NOT EXISTS는 컬럼을 더하지 않음)."""
    def add_col(table, col, decl):
        cols = [r[1] for r in con.execute(f"PRAGMA table_info({table})")]
        if col not in cols:
            con.execute(f"ALTER TABLE {table} ADD COLUMN {col} {decl}")
    add_col("staff", "puerp_uid", "TEXT DEFAULT ''")


def audit(con, entity, entity_id, action, field="", before="", after="", user="local"):
    con.execute(
        "INSERT INTO audit_logs(user,entity,entity_id,action,field,before_val,after_val)"
        " VALUES(?,?,?,?,?,?,?)",
        (user, entity, str(entity_id), action, field, str(before or ""), str(after or "")),
    )


def rows_to_dicts(rows):
    return [dict(r) for r in rows]


def next_id(con, table, col, prefix, width=4):
    """FUND-0001 형식 순번 발급"""
    row = con.execute(
        f"SELECT {col} FROM {table} WHERE {col} LIKE ? ORDER BY {col} DESC LIMIT 1",
        (prefix + "-%",),
    ).fetchone()
    n = 0
    if row:
        try:
            n = int(row[0].split("-")[-1])
        except ValueError:
            n = 0
    return f"{prefix}-{n + 1:0{width}d}"
