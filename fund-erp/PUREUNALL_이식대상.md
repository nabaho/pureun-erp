# pureunall 이식 대상 표시

추후 `github.com/nabaho/pureunall` 저장소에 **코드만** 올려 별도 프로그램으로 배포하기 위한 구분표.
`python export_pureunall.py` 를 실행하면 ✅ 파일만 모아 `pureunall_package/fund-erp/` 폴더와 zip이 만들어진다 — 그대로 저장소에 복사하면 됨.

## ✅ 이식 대상 (코드 — pureunall에 올림)

| 파일 | 역할 |
|---|---|
| `app.py` | FastAPI 백엔드 (API 전체) |
| `db.py` | DB 연결·감사로그·식별자 |
| `docgen.py` | 설립 6종·등기 8종·지원신청서 생성 엔진 (인쇄용 HTML) |
| `accounting.py` | 통장 파싱·자동분개 제안·시산표·재무제표·별지15호 매핑 |
| `schema.sql` | 스키마 25테이블 (새 PC에서 빈 DB 자동 생성) |
| `static/index.html` | 화면 전체 (단일 파일, pu-erp 조작감) |
| `import_excel.py` | 참여사업장 엑셀 이관 도구 |
| `import_funds_master.py` | 기금 대장 이관 도구 |
| `scan_archive.py` | 과거자료 폴더 스캔·문서철 등록 도구 |
| `requirements.txt` | 의존성 (fastapi·uvicorn·openpyxl 등) |
| `README.md` | 설치·실행 안내 |
| `PUREUNALL_이식대상.md` | 본 문서 |

## ❌ 이식 제외 (로컬 데이터 — 절대 저장소에 올리지 말 것)

| 파일 | 이유 |
|---|---|
| `fund.db` | **실데이터** — 기금 42개·사업장 563·담당자 연락처·문서철 경로. 개인정보 포함 |
| `scan/` (스캔리포트.xlsx, scan_report.json) | 실파일 경로·기금명 목록 |
| `__pycache__/` | 파이썬 캐시 |
| `pureunall_package/` | 내보내기 결과물 자체 |

## 새 환경에서 실행 순서 (코드만 받은 경우)

```bash
pip install -r requirements.txt
python -m uvicorn app:app --port 8777   # 첫 실행 시 빈 fund.db 자동 생성
# 데이터는 엑셀 이관 도구(import_excel.py 등)로 다시 채우거나, 로컬 fund.db를 별도 전달
```

## 푸른이알피(pu-erp) 연동 가이드

### 지금 가능한 연동 (구현 완료)

**1. 데이터 가져오기 (pu-erp → 기금 시스템)**
- pu-erp에서 JSON 백업 내려받기 → 기금 시스템 대시보드의 **"🔗 푸른이알피 가져오기"** 버튼으로 업로드
- typeCode가 '기금'인 업체(또는 이름에 '기금' 포함)만 처리:
  - 기존 기금과 이름·대표사업장으로 매칭 → **담당자(정/부)·계약기간·연락처 자동 갱신** (managerMain/Subs의 사용자 sid는 users 목록으로 이름 해석)
  - 미매칭이면 **자문 기금으로 신규 등록** (사내/공동은 이름으로 판별)
- pu-erp에 기금 수임·컨설팅 계약이 새로 등록되면 → 백업 한 번 올리는 것으로 기금 시스템에 반영

**2. 딥링크 (pu-erp → 기금 시스템 바로 열기)**
- 기금 시스템은 `#fund=기금명` 또는 `#fund=FUND-0001` 해시로 해당 기금 화면에 바로 진입
- pu-erp 업체관리의 기금 유형 업체 행에 아래 버튼을 추가하면 클릭 한 번에 이동:

```js
// pu-erp 업체 상세/행에 추가할 스니펫 (typeCode==='기금'일 때 표시)
h('button', {
  onClick: function(){ window.open('http://localhost:8777/#fund=' + encodeURIComponent(co.name)); },
  style: { padding:'2px 8px', border:'1px solid #fcd34d', borderRadius:'5px',
           background:'#fef3c7', color:'#854d0e', cursor:'pointer', fontSize:'10.5px', fontWeight:700 }
}, '🏦 기금 시스템')
```

**3. 청구 내보내기 (기금 시스템 → pu-erp 매출)**
- 기금 시스템에서 결산을 마감하면 청구 건이 자동 생성 → **청구 관리** 화면에서 금액·계산서 발행일·입금일 관리
- **[📤 푸른이알피 내보내기]** 버튼 → `기금청구_YYYY_푸른이알피용.json` 다운로드
- pu-erp에 아래 가져오기 스니펫을 추가하면 파일 선택 한 번으로 매출(finance_income)에 일괄 등록:

```js
// pu-erp 매출 화면에 추가할 가져오기 (기금청구 JSON → finance_income)
function importFundBillings(e){
  var file=e.target.files&&e.target.files[0]; if(!file) return;
  var reader=new FileReader();
  reader.onload=function(ev){
    var data=JSON.parse(ev.target.result);
    var list=data.fund_billings||[];
    var incomes=dbGet('finance_income',[]);
    var added=0;
    list.forEach(function(b){
      // 중복 방지: 같은 연도·기금·항목이 이미 있으면 건너뜀
      var dup=incomes.some(function(fi){return fi.source==='fund-erp'
        && fi.companyName===b.companyName && fi.label===b.label;});
      if(dup) return;
      incomes.push({ id:'fi-fb-'+Date.now()+'-'+added, kind:'자문료',
        companyName:b.companyName, label:b.label, amount:b.amount,
        vatIncluded:b.vatIncluded, paid:b.paid, paidDate:b.paidDate,
        invoiceDate:b.invoiceDate, memo:'[기금] '+(b.memo||''), source:'fund-erp' });
      added++;
    });
    dbSet('finance_income',incomes);
    showToast('기금 청구 '+added+'건 등록');
  };
  reader.readAsText(file);
  e.target.value='';
}
```

### 4단계(통합시스템) 때의 연동
- staff 마스터(김혜민·박재원·임혜미·주민정)가 pu-erp 사용자 계정과 1:1 연결 → 로그인 직원별 할 일 화면
- 백업 파일 대신 실시간 API 동기화(같은 서버)로 승격 — 지금의 매칭 로직이 그대로 사용됨

## 유의사항

- pureunall의 pu-erp.html은 **정적 페이지**(GitHub Pages)지만, fund-erp는 **파이썬 서버가 필요**하다.
  GitHub Pages에서는 실행되지 않고, 저장소는 코드 보관·배포용이며 실행은 각 PC에서 로컬로 한다.
- `import_*.py`의 기본 엑셀 경로는 이 PC의 Downloads를 가리키므로 다른 PC에서는 경로 인자를 넘겨 실행.
- DB를 다른 PC로 옮길 때는 `fund.db` 파일 하나만 복사하면 된다(문서철 경로는 `03_과거자료` 기준 상대경로이므로 과거자료 폴더도 같은 상대 위치에 있어야 열람 가능).
