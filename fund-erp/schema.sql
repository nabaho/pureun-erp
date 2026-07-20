-- 근로복지기금 통합 운영시스템 스키마 v1 (계획서 v0.5 §16 — 25테이블)
-- SQLite → 4단계 PostgreSQL 전환 전제. 물리삭제 금지: status 필드로 전환.

PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

-- ═══ 기준정보 ═══
CREATE TABLE IF NOT EXISTS funds (
  fund_id      TEXT PRIMARY KEY,            -- FUND-0001
  name         TEXT NOT NULL,               -- 기금법인명
  short_name   TEXT DEFAULT '',             -- 표시용 약칭 (충남 1호)
  fund_type    TEXT NOT NULL DEFAULT '공동',  -- 사내 | 공동
  region       TEXT DEFAULT '',             -- 충남 | 경기 | (사내는 공란)
  status       TEXT NOT NULL DEFAULT '운영',  -- 설립준비|인가신청|운영|변경진행|해산진행|청산완료
  inka_no      TEXT DEFAULT '', inka_date TEXT DEFAULT '',
  corp_reg_no  TEXT DEFAULT '', reg_date  TEXT DEFAULT '', registry_office TEXT DEFAULT '',
  tax_id_no    TEXT DEFAULT '', tax_office TEXT DEFAULT '',
  address      TEXT DEFAULT '', phone TEXT DEFAULT '',
  chairman     TEXT DEFAULT '',
  fy_start_md  TEXT DEFAULT '01-01', fy_end_md TEXT DEFAULT '12-31',
  labor_office TEXT DEFAULT '',
  -- 대시보드 단계 상태 (없음|진행|완료|경고)
  stg_estab    TEXT DEFAULT '완료', stg_reg TEXT DEFAULT '완료',
  stg_ops      TEXT DEFAULT '진행', stg_close TEXT DEFAULT '없음',
  -- 관리 구분 (기존 기금 데이터화)
  mgmt_type    TEXT DEFAULT '',              -- 수임|자문|기록보관
  advisory     TEXT DEFAULT '',              -- 자문|비자문|연간자문 (원장부 표기)
  manager      TEXT DEFAULT '',              -- 푸른노무법인 담당자
  rep_org      TEXT DEFAULT '',              -- 대표사업장·사무국 (상공회의소 등)
  rep_contact  TEXT DEFAULT '',              -- 대표사업장 담당자·연락처
  note         TEXT DEFAULT '',
  created_at   TEXT DEFAULT (datetime('now','localtime')),
  updated_at   TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS sites (
  site_id      TEXT PRIMARY KEY,            -- SITE-0001
  fund_id      TEXT NOT NULL REFERENCES funds(fund_id),
  seq_label    TEXT DEFAULT '',             -- 원본 연번 표기 (1-1, 경1-3)
  name         TEXT NOT NULL,               -- 상호
  biz_no       TEXT DEFAULT '',             -- 000-00-00000
  corp_no      TEXT DEFAULT '',
  ceo          TEXT DEFAULT '', ceo2 TEXT DEFAULT '',
  address      TEXT DEFAULT '',
  biz_type     TEXT DEFAULT '',             -- 업종
  company_size TEXT DEFAULT '',             -- 소기업|중기업|중견기업|대기업
  is_primary   INTEGER DEFAULT 0,           -- 대표사업장 여부
  join_date    TEXT DEFAULT '', leave_date TEXT DEFAULT '',
  status       TEXT NOT NULL DEFAULT 'active',  -- active | closed(탈퇴·폐업)
  closed_reason TEXT DEFAULT '', closed_detail TEXT DEFAULT '',
  contacts     TEXT DEFAULT '[]',           -- JSON [{name,position,phone,mobile,email,isPrimary}]
  note         TEXT DEFAULT '',
  created_at   TEXT DEFAULT (datetime('now','localtime')),
  updated_at   TEXT DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_sites_fund ON sites(fund_id, status);
CREATE INDEX IF NOT EXISTS idx_sites_bizno ON sites(biz_no);

CREATE TABLE IF NOT EXISTS site_histories (       -- 연도 스냅샷 (덮어쓰기 금지)
  history_id   INTEGER PRIMARY KEY AUTOINCREMENT,
  site_id      TEXT NOT NULL REFERENCES sites(site_id),
  year         INTEGER NOT NULL,
  base_date    TEXT DEFAULT '',             -- 기준일
  employees    INTEGER,                     -- 상시근로자수
  capital      INTEGER,                     -- 자본금(천원)
  worker_rep   TEXT DEFAULT '',             -- 근로자대표
  contribution INTEGER,                     -- 해당연도 출연액(원)
  status       TEXT DEFAULT '',             -- 해당연도 상태 메모
  locked       INTEGER DEFAULT 0,           -- 담당자 확정 잠금
  note         TEXT DEFAULT '',
  UNIQUE(site_id, year)
);

CREATE TABLE IF NOT EXISTS persons (
  person_id  TEXT PRIMARY KEY, name TEXT NOT NULL,
  birth      TEXT DEFAULT '',              -- 민감정보는 별도 보관: 주민번호 저장 금지
  phone TEXT DEFAULT '', email TEXT DEFAULT '', note TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS fund_roles (
  role_id   INTEGER PRIMARY KEY AUTOINCREMENT,
  fund_id   TEXT NOT NULL REFERENCES funds(fund_id),
  person_id TEXT REFERENCES persons(person_id),
  person_name TEXT DEFAULT '',
  role      TEXT NOT NULL,                 -- 이사장|이사|감사|근로자위원|사용자위원|청산인
  term_start TEXT DEFAULT '', term_end TEXT DEFAULT '',
  minutes_ref TEXT DEFAULT '', status TEXT DEFAULT 'active', note TEXT DEFAULT ''
);

-- ═══ 관계기관 (M2 확장) ═══
CREATE TABLE IF NOT EXISTS agencies (
  agency_id  TEXT PRIMARY KEY,             -- AG-0001
  name       TEXT NOT NULL,
  agency_type TEXT NOT NULL,               -- 지자체|공단|노동관서|등기소|세무서|수탁법인|기타
  address    TEXT DEFAULT '', phone TEXT DEFAULT '', note TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS agency_contacts (
  contact_id INTEGER PRIMARY KEY AUTOINCREMENT,
  agency_id  TEXT NOT NULL REFERENCES agencies(agency_id),
  name TEXT NOT NULL, dept TEXT DEFAULT '', position TEXT DEFAULT '',
  phone TEXT DEFAULT '', email TEXT DEFAULT '',
  start_date TEXT DEFAULT '', end_date TEXT DEFAULT '',   -- 담당자 이력 보존
  is_current INTEGER DEFAULT 1, note TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS fund_agencies (
  link_id    INTEGER PRIMARY KEY AUTOINCREMENT,
  fund_id    TEXT NOT NULL REFERENCES funds(fund_id),
  agency_id  TEXT NOT NULL REFERENCES agencies(agency_id),
  role       TEXT NOT NULL,                -- 출연지자체|지원기관|위탁기관|수탁기관|관할기관
  contract_start TEXT DEFAULT '', contract_end TEXT DEFAULT '',
  note TEXT DEFAULT '',
  UNIQUE(fund_id, agency_id, role)
);

-- ═══ 회계 ═══
CREATE TABLE IF NOT EXISTS accounts (
  account_id TEXT PRIMARY KEY, fund_id TEXT NOT NULL REFERENCES funds(fund_id),
  bank TEXT DEFAULT '', account_no_masked TEXT DEFAULT '',
  purpose TEXT DEFAULT '',                 -- 기본재산|보통재산|지원금
  status TEXT DEFAULT 'active', note TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS bank_imports (
  import_id TEXT PRIMARY KEY, account_id TEXT REFERENCES accounts(account_id),
  file_name TEXT, file_hash TEXT UNIQUE, imported_at TEXT, row_count INTEGER, note TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS bank_transactions (
  tx_id TEXT PRIMARY KEY, import_id TEXT REFERENCES bank_imports(import_id),
  account_id TEXT REFERENCES accounts(account_id),
  tx_date TEXT, description TEXT DEFAULT '', deposit INTEGER DEFAULT 0,
  withdrawal INTEGER DEFAULT 0, balance INTEGER DEFAULT 0, memo TEXT DEFAULT '',
  pair_tx_id TEXT DEFAULT '',              -- 계좌간이체·취소 짝
  flag TEXT DEFAULT ''                     -- transfer|cancel|interest_tax|...
);
CREATE TABLE IF NOT EXISTS journal_headers (
  journal_id TEXT PRIMARY KEY, fund_id TEXT REFERENCES funds(fund_id),
  tx_id TEXT REFERENCES bank_transactions(tx_id),
  je_date TEXT, status TEXT DEFAULT 'proposed',   -- proposed|approved|rejected
  proposed_rule TEXT DEFAULT '', approved_by TEXT DEFAULT '', approved_at TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS journal_lines (
  line_id INTEGER PRIMARY KEY AUTOINCREMENT,
  journal_id TEXT NOT NULL REFERENCES journal_headers(journal_id),
  side TEXT NOT NULL,                      -- D|C
  account TEXT NOT NULL, detail TEXT DEFAULT '', amount INTEGER NOT NULL,
  fund_source TEXT DEFAULT '',             -- 출연금|운용수익|공단지원금|지자체지원금
  basic_asset INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS evidences (
  evidence_id TEXT PRIMARY KEY, journal_id TEXT REFERENCES journal_headers(journal_id),
  kind TEXT DEFAULT '', file_path TEXT DEFAULT '', ev_date TEXT DEFAULT '',
  amount INTEGER, note TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS closing_periods (
  closing_id INTEGER PRIMARY KEY AUTOINCREMENT,
  fund_id TEXT NOT NULL REFERENCES funds(fund_id), year INTEGER NOT NULL,
  status TEXT DEFAULT 'open',              -- open|locked
  locked_at TEXT DEFAULT '', locked_by TEXT DEFAULT '',
  reopen_reason TEXT DEFAULT '', version INTEGER DEFAULT 1,
  UNIQUE(fund_id, year)
);

-- ═══ 사업 ═══
CREATE TABLE IF NOT EXISTS contributions (
  contribution_id INTEGER PRIMARY KEY AUTOINCREMENT,
  fund_id TEXT NOT NULL REFERENCES funds(fund_id),
  site_id TEXT REFERENCES sites(site_id),
  agency_id TEXT REFERENCES agencies(agency_id),   -- 지자체 출연 시
  year INTEGER, pledge_amount INTEGER, pledge_date TEXT DEFAULT '',
  paid_amount INTEGER DEFAULT 0, paid_date TEXT DEFAULT '',
  tx_id TEXT DEFAULT '', to_basic_asset INTEGER DEFAULT 1, note TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS welfare_programs (
  program_id TEXT PRIMARY KEY, fund_id TEXT NOT NULL REFERENCES funds(fund_id),
  year INTEGER, name TEXT NOT NULL, kind TEXT DEFAULT '목적사업',  -- 목적사업|대부사업
  category TEXT DEFAULT '기타복지비',    -- 별지15호 매핑: 생활안정자금|장학금|체육문화활동|경조사비|기타복지비|대부사업 등
  budget INTEGER DEFAULT 0, approved_minutes TEXT DEFAULT '', note TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS welfare_cases (
  case_id TEXT PRIMARY KEY, program_id TEXT NOT NULL REFERENCES welfare_programs(program_id),
  site_id TEXT REFERENCES sites(site_id),
  applied_date TEXT DEFAULT '', amount INTEGER DEFAULT 0, beneficiaries INTEGER DEFAULT 0,
  status TEXT DEFAULT 'applied',           -- applied|approved|paid|rejected
  paid_date TEXT DEFAULT '', tx_id TEXT DEFAULT '', fund_source TEXT DEFAULT '', note TEXT DEFAULT ''
);

-- ═══ 업무·문서 ═══
CREATE TABLE IF NOT EXISTS tasks (
  task_id TEXT PRIMARY KEY, fund_id TEXT REFERENCES funds(fund_id),
  code TEXT DEFAULT '',                    -- EST-00 ~ DIS-xx / 연간운영 코드
  year INTEGER,                            -- 연간 운영 일정의 대상 회계연도
  period TEXT DEFAULT '',                  -- 시기 라벨 (매월/분기/9~11월 등)
  title TEXT NOT NULL, due_date TEXT DEFAULT '', owner TEXT DEFAULT '',
  status TEXT DEFAULT 'todo',              -- todo|doing|done|blocked
  done_date TEXT DEFAULT '',
  blocked_reason TEXT DEFAULT '', note TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS task_check_items (
  item_id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT NOT NULL REFERENCES tasks(task_id),
  label TEXT NOT NULL, done INTEGER DEFAULT 0, evidence TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS form_versions (
  form_version_id TEXT PRIMARY KEY,
  form_no TEXT NOT NULL,                   -- 별지 제15호서식
  name TEXT NOT NULL, revised_date TEXT DEFAULT '', effective_from TEXT DEFAULT '',
  effective_to TEXT DEFAULT '', source TEXT DEFAULT '', file_hwp TEXT DEFAULT '',
  file_pdf TEXT DEFAULT '', fund_type TEXT DEFAULT '공용', note TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS documents (
  document_id TEXT PRIMARY KEY, fund_id TEXT REFERENCES funds(fund_id),
  task_id TEXT REFERENCES tasks(task_id),
  doc_kind TEXT NOT NULL, title TEXT DEFAULT '',
  form_version_id TEXT REFERENCES form_versions(form_version_id),
  status TEXT DEFAULT 'draft',             -- draft|review|submitted
  note TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS document_versions (
  version_id TEXT PRIMARY KEY, document_id TEXT NOT NULL REFERENCES documents(document_id),
  ver INTEGER DEFAULT 1, file_path TEXT DEFAULT '', snapshot_json TEXT DEFAULT '{}',
  created_at TEXT DEFAULT (datetime('now','localtime')), locked INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS submissions (
  submission_id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id TEXT NOT NULL REFERENCES documents(document_id),
  submitted_to TEXT DEFAULT '', submitted_date TEXT DEFAULT '',
  receipt_no TEXT DEFAULT '', supplement_request TEXT DEFAULT '',
  supplement_date TEXT DEFAULT '', note TEXT DEFAULT ''
);
-- 직원(담당자) 마스터 — 푸른이알피 근로자와 동일 인물, puerp_uid로 연결(4단계 통합 시 계정 연결 다리)
CREATE TABLE IF NOT EXISTS staff (
  staff_id TEXT PRIMARY KEY, name TEXT UNIQUE NOT NULL,
  puerp_uid TEXT DEFAULT '',                  -- 푸른이알피 근로자 sid/id (연결 키)
  active INTEGER DEFAULT 1, note TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS fund_staff (      -- 기금별 정/부 담당 (pu-erp managerMain/Subs 관례)
  fs_id INTEGER PRIMARY KEY AUTOINCREMENT,
  fund_id TEXT NOT NULL REFERENCES funds(fund_id),
  staff_id TEXT NOT NULL REFERENCES staff(staff_id),
  role TEXT DEFAULT '정',                    -- 정 | 부
  start_date TEXT DEFAULT '', end_date TEXT DEFAULT '',   -- 담당 이력(인수인계) 보존
  is_current INTEGER DEFAULT 1
);

-- 운영 서류 (M15): 회의록 대장 + 정관·운영규정 버전
CREATE TABLE IF NOT EXISTS meetings (
  meeting_id TEXT PRIMARY KEY, fund_id TEXT NOT NULL REFERENCES funds(fund_id),
  mdate TEXT, mtype TEXT DEFAULT '이사회',     -- 정기총회|이사회|임시|협의회
  agenda TEXT DEFAULT '', resolution TEXT DEFAULT '', attendees TEXT DEFAULT '',
  quorum_note TEXT DEFAULT '',
  tag TEXT DEFAULT '',                          -- 정관개정|규정제개정|예산결산승인|임원선임|사업승인
  note TEXT DEFAULT '', created_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS doc_revisions (
  rev_id TEXT PRIMARY KEY, fund_id TEXT NOT NULL REFERENCES funds(fund_id),
  kind TEXT DEFAULT '정관',                     -- 정관|운영규정
  rule_name TEXT DEFAULT '',                    -- 규정명 (정관은 공란)
  version INTEGER DEFAULT 1, rev_date TEXT DEFAULT '', inka_date TEXT DEFAULT '',
  basis_meeting TEXT DEFAULT '',                -- 근거 회의록 meeting_id
  is_current INTEGER DEFAULT 1, note TEXT DEFAULT ''
);

-- 서식 편집본 저장 (미리보기 화면에서 수정한 HTML 오버라이드)
CREATE TABLE IF NOT EXISTS doc_edits (
  fund_id TEXT NOT NULL REFERENCES funds(fund_id),
  year INTEGER NOT NULL, kind TEXT NOT NULL,
  html TEXT DEFAULT '', updated_at TEXT DEFAULT (datetime('now','localtime')),
  PRIMARY KEY(fund_id, year, kind)
);

-- 청구 대장 (결산·보고 보수 → 푸른이알피 매출 연결 다리)
CREATE TABLE IF NOT EXISTS billings (
  billing_id INTEGER PRIMARY KEY AUTOINCREMENT,
  fund_id TEXT NOT NULL REFERENCES funds(fund_id),
  year INTEGER NOT NULL,
  item TEXT DEFAULT '',                       -- 결산·운영상황보고 보수 / 자문료 등
  amount INTEGER DEFAULT 0,                   -- 공급가 (부가세 별도)
  vat_separate INTEGER DEFAULT 1,
  invoice_date TEXT DEFAULT '',               -- 세금계산서 발행일
  paid_date TEXT DEFAULT '',                  -- 입금일
  note TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now','localtime')),
  UNIQUE(fund_id, year, item)
);

-- 자동분개 학습 규칙 (담당자 승인 → 같은 거래처·적요 자동 제안)
CREATE TABLE IF NOT EXISTS learned_rules (
  rule_id   INTEGER PRIMARY KEY AUTOINCREMENT,
  fund_id   TEXT NOT NULL,
  keyword   TEXT NOT NULL,               -- 적요에서 추출한 거래처·핵심어
  direction TEXT DEFAULT '',             -- 입금 | 출금
  debit     TEXT NOT NULL, credit TEXT NOT NULL,
  hits      INTEGER DEFAULT 1,
  updated_at TEXT DEFAULT (datetime('now','localtime')),
  UNIQUE(fund_id, keyword, direction)
);

CREATE TABLE IF NOT EXISTS audit_logs (
  log_id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT DEFAULT (datetime('now','localtime')),
  user TEXT DEFAULT 'local',
  entity TEXT NOT NULL, entity_id TEXT NOT NULL,
  action TEXT NOT NULL,                    -- create|update|close|import|lock
  field TEXT DEFAULT '', before_val TEXT DEFAULT '', after_val TEXT DEFAULT ''
);

-- 변경 이벤트 (수시) — 사업장탈퇴·정관변경·임원변경·주소이전·해산 등
CREATE TABLE IF NOT EXISTS fund_events (
  event_id     TEXT PRIMARY KEY,           -- EVT-0001
  fund_id      TEXT NOT NULL,
  kind         TEXT NOT NULL,              -- site_leave|charter|officer|address|dissolve|etc
  title        TEXT DEFAULT '',
  status       TEXT DEFAULT '진행',        -- 진행 | 완료
  started_date TEXT DEFAULT '',
  done_date    TEXT,
  steps        TEXT DEFAULT '[]',          -- JSON [{label,done}]
  note         TEXT DEFAULT '',
  created_at   TEXT DEFAULT (datetime('now','localtime'))
);
