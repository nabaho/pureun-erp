# 거래내역 매칭 재설계 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 거래내역 입금 매칭을 「한 줄 = 한 입금」으로 바꾸고, 이름 근거가 있는 후보만 보여주며, 합치기·나누기·과입금·보류함을 한 화면에서 처리해 확정 한 번으로 입금관리·성과관리까지 잇는다.

**Architecture:** pu-erp.html 단일 파일. 순수 함수를 `function FinanceLedger()` **앞**(전역 구역, 대략 33859~33915 사이)에 두고 `window.` 로 노출해 검사에서 vm 샌드박스로 떼어 쓴다. 화면(FinanceLedger 내부)은 그 함수들의 결과만 그린다. 저장 경로(saveIncome/saveDirectIncome/dbPatch)는 이미 부분입금·수수료차감·성과분배를 지원하므로 **재사용**하고 새로 만들지 않는다.

**Tech Stack:** ES5 (var/function만, 화살표함수·const·let 금지 — 이 파일 규칙), React 전역 `h()`, node:test 없는 자체 하네스(`tests/*.test.js`, vm + slice 표식), PowerShell 검증 스크립트.

## Global Constraints

- 설계서: `docs/superpowers/specs/2026-08-09-ledger-match-redesign-design.md` — 이 계획은 그 문서를 구현한다.
- **ES5만**: `var`·`function` 만. 화살표함수/const/let/템플릿리터럴 금지(파일 전체 규칙).
- **주석은 한국어**, 노무 도메인 용어 준수.
- 순수 함수는 `if(typeof window !== 'undefined') window.X = X;` 로 노출한다 (검사 샌드박스에 window 가 없다).
- 검사 파일은 원본을 `.replace(/\r\n/g,'\n')` 로 읽고 **LF 표식**으로 slice 한다 (CRLF 로컬 / LF CI 양쪽 통과 필수).
- 시각·날짜는 `String(iso).slice(0,10)` 금지 — 반드시 Date 로 파싱해 지역 날짜 성분을 쓴다(KST/UTC 어긋남).
- 커밋 전 필수: `node scratchpad/chk.js <파일>` (구문) → 전체 스위트 CRLF+LF/UTC → 변이 검사.
- 푸시는 `git pull --rebase origin main` 뒤 `git push origin HEAD:main`, 이어서 `gh run watch` 성공 확인 + 실서버 파일에 새 심볼 grep.
- **모양·개수를 못 박는 검사 금지** (예: "후보는 정확히 3건") — 배포가 막힌다. 성질(정렬·포함·제외)로 고정한다.

---

## 파일 구조

| 파일 | 책임 |
|---|---|
| `pu-erp.html` (전역 구역 ~33859) | 순수 함수 7개: 이름 게이트·업체 묶기·충당 순서·수수료 허용범위·줄 상태·과입금 갈래·업로드 요약 |
| `pu-erp.html` (FinanceLedger 내부) | 한 줄 렌더·펼침·묶어 확정·보류함 UI, 위 함수 호출만 |
| `pu-erp.html` (erpInvoiceMatch 구역 ~5199) | 계산서 대조 창 60→180일 |
| `tests/ledger-match-gate.test.js` | 엔진 5종 검사 (Task 1~4) |
| `tests/ledger-row-state.test.js` | 줄 상태·과입금·묶기·보류함 검사 (Task 5~9) |
| `tests/ledger-upload-summary.test.js` | 업로드 요약·달 남은건수 (Task 11) |

---

## Phase 1 — 매칭 엔진 (화면 안 건드림)

### Task 1: 이름 근거 게이트

**Files:**
- Modify: `pu-erp.html` — `erpMatchTxnToPending` (약 5559행) 앞에 새 함수 추가, 함수 본문에서 호출
- Test: `tests/ledger-match-gate.test.js` (신규)

**Interfaces:**
- Produces: `erpNameEvidence(scoreObj)` → `{ok:boolean, why:string}` — `erpMatchScore` 반환값을 받아 이름 근거 유무를 판정
- Consumes: `erpMatchScore` 의 `nameScore`·`fpScore`·`invScore` 필드 (이미 반환 중)

- [ ] **Step 1: 실패하는 검사부터 쓴다**

`tests/ledger-match-gate.test.js` 를 만든다:

```js
/* 이름 근거 게이트 — 금액만 비슷한 후보를 목록에서 뺀다.
   ★ 44%짜리 후보가 12건씩 쏟아져 "맞지도 않는" 화면이 됐다. */
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const HTML = path.join(__dirname, '..', 'pu-erp.html');
const src = fs.readFileSync(HTML, 'utf8').replace(/\r\n/g, '\n');
function slice(a, b){
  const i = src.indexOf(a);
  if(i < 0) throw new Error('시작 표식 못찾음: ' + a);
  const j = src.indexOf(b, i);
  if(j < 0) throw new Error('끝 표식 못찾음: ' + b);
  return src.slice(i, j);
}
let pass = 0, fail = 0;
const t = (name, got, want) => {
  const G = JSON.stringify(got), W = JSON.stringify(want);
  if(G === W) pass++;
  else { fail++; console.log('FAIL ' + name + '\n  got  = ' + G + '\n  want = ' + W); }
};

const ctx = { console, Object, JSON, Array, String, Number, parseInt, isNaN, Math };
vm.createContext(ctx);
vm.runInContext(slice('function erpNameEvidence(', '\nfunction erpMatchTxnToPending('), ctx);

t('적요 이름이 맞으면 통과', ctx.erpNameEvidence({nameScore:75, fpScore:0, invScore:0}).ok, true);
t('금액만 비슷하면 막힌다', ctx.erpNameEvidence({nameScore:20, fpScore:0, invScore:0}).ok, false);
t('세금계산서가 맞으면 통과', ctx.erpNameEvidence({nameScore:0, fpScore:0, invScore:100}).ok, true);
t('금액지문이 확실하면 통과', ctx.erpNameEvidence({nameScore:0, fpScore:95, invScore:0}).ok, true);
t('약한 지문은 막힌다', ctx.erpNameEvidence({nameScore:0, fpScore:70, invScore:0}).ok, false);
t('근거 없으면 빈 이유가 아니다', ctx.erpNameEvidence({nameScore:0, fpScore:0, invScore:0}).why.length > 0, true);
t('빈 값이 들어와도 안 터진다', ctx.erpNameEvidence(null).ok, false);

console.log('\n  === ' + pass + ' 통과 / ' + fail + ' 실패 ===');
process.exit(fail ? 1 : 0);
```

- [ ] **Step 2: 실패를 눈으로 본다**

```bash
node tests/ledger-match-gate.test.js
```

기대: `시작 표식 못찾음: function erpNameEvidence(` 으로 종료코드 1.

- [ ] **Step 3: 함수를 넣는다**

`pu-erp.html` 에서 `// 한 건의 거래내역에 대한 상위 후보 목록` 주석 바로 위에 넣는다:

```js
/* ── 이름 근거 게이트 ──
   금액이 비슷하다는 것만으로는 후보가 아니다. 자문료 22만원짜리 업체가 열둘이면
   열둘이 다 44%로 뜬다 — 사람이 고를 수 없고, 잘못 고르면 남의 돈이 된다.
   적요·학습별칭(nameScore) · 금액지문(fpScore) · 세금계산서(invScore) 중
   하나라도 «이 업체»를 가리켜야 목록에 올린다. */
function erpNameEvidence(s){
  s = s || {};
  var nm = parseInt(s.nameScore, 10) || 0;
  var fp = parseInt(s.fpScore, 10) || 0;
  var iv = parseInt(s.invScore, 10) || 0;
  if(iv >= 85) return { ok:true, why:'세금계산서' };
  if(nm >= 60) return { ok:true, why:'이름' };
  if(fp >= 90) return { ok:true, why:'입금이력' };
  return { ok:false, why:'이름 근거 없음 — 금액만 비슷합니다' };
}
if(typeof window !== 'undefined') window.erpNameEvidence = erpNameEvidence;
```

- [ ] **Step 4: 통과를 확인한다**

```bash
node tests/ledger-match-gate.test.js
```

기대: `=== 7 통과 / 0 실패 ===`

- [ ] **Step 5: 후보 목록에 게이트를 건다**

`erpMatchTxnToPending` 안의 push 조건을 바꾼다. 기존:

```js
    var r = erpMatchScore(txn, cand);
    if(r.score > 0) out.push({ cand:cand, score:r.score, reasons:r.reasons, level:r.level,
```

바꾼 뒤 (게이트 통과 여부를 함께 실어 보낸다 — 「직접 찾기」는 막힌 것도 봐야 한다):

```js
    var r = erpMatchScore(txn, cand);
    var ev = erpNameEvidence(r);
    if(r.score > 0 && (ev.ok || opts_all)) out.push({ cand:cand, score:r.score, reasons:r.reasons, level:r.level,
                               evidence:ev.why, weak:!ev.ok,
```

그리고 함수 시그니처를 `function erpMatchTxnToPending(txn, pendingArr, limit, includeWeak){` 로 바꾸고 첫 줄에 `var opts_all = !!includeWeak;` 를 둔다.

- [ ] **Step 6: 게이트 배선 검사를 더한다**

`tests/ledger-match-gate.test.js` 끝의 `console.log` 앞에 붙인다:

```js
const wire = slice('function erpMatchTxnToPending(', '\n// 자동 정리(1클릭 승인)');
t('후보 목록이 게이트를 쓴다', /erpNameEvidence\(r\)/.test(wire), true);
t('직접 찾기용 우회 인자가 있다', /includeWeak/.test(wire), true);
t('막힌 후보에 표시가 남는다', /weak:\s*!ev\.ok/.test(wire), true);
```

- [ ] **Step 7: 통과 확인 후 커밋**

```bash
node tests/ledger-match-gate.test.js
node scratchpad/chk.js pu-erp.html
git add pu-erp.html tests/ledger-match-gate.test.js
git commit -m "feat(거래내역): 이름 근거가 있는 후보만 목록에 — 금액만 비슷한 것은 직접 찾기에서만"
```

---

### Task 2: 업체 단위로 후보 묶기 + 오래된 달부터 충당

**Files:**
- Modify: `pu-erp.html` — `erpPendOptions` (33892행) 바로 뒤에 추가
- Test: `tests/ledger-match-gate.test.js` (이어서)

**Interfaces:**
- Consumes: pending 후보 배열 (`{id, companyName, kind, ym, expect, amount, label, store}`)
- Produces: `erpGroupPendByCompany(sugList)` → `[{company, kinds:[...], months:[...], head:{...}, n:number}]` — 화면 한 줄용. `head` 는 가장 오래된 달의 후보(먼저 충당할 것).

- [ ] **Step 1: 실패하는 검사를 쓴다**

`tests/ledger-match-gate.test.js` 의 마지막 `console.log` 앞에 넣는다:

```js
const gctx = { console, Object, JSON, Array, String, Number, parseInt, isNaN, Math };
vm.createContext(gctx);
vm.runInContext(slice('function erpGroupPendByCompany(', '\nfunction FinanceLedger('), gctx);

const S = (co, ym, id, amt) => ({ cand:{ id:id, companyName:co, kind:'advisory', ym:ym,
                                          expect:amt, amount:amt, label:'자문료' }, score:95 });
const g1 = gctx.erpGroupPendByCompany([S('크레오','2026-07','a',220000),
                                       S('크레오','2026-05','b',220000),
                                       S('크레오','2026-06','c',220000),
                                       S('신흥','2026-06','d',220000)]);
t('업체 수만큼 줄이 된다', g1.length, 2);
t('세 달이 한 줄로 묶인다', g1[0].n, 3);
t('오래된 달이 먼저 충당된다', g1[0].head.cand.id, 'b');
t('묶인 달이 오름차순이다', g1[0].months, ['2026-05','2026-06','2026-07']);
t('다른 업체는 안 섞인다', g1[1].company, '신흥');
t('빈 목록도 안 터진다', gctx.erpGroupPendByCompany(null).length, 0);
```

- [ ] **Step 2: 실패 확인**

```bash
node tests/ledger-match-gate.test.js
```

기대: `시작 표식 못찾음: function erpGroupPendByCompany(`

- [ ] **Step 3: 함수를 넣는다**

`pu-erp.html` 에서 `if(typeof window !== 'undefined') window.erpPendOptions = erpPendOptions;` 바로 다음 줄에:

```js
/* ── 후보를 업체 한 줄로 묶기 ──
   크레오에스지가 5·6·7월 세 달 밀리면 지금은 세 줄이 뜬다. 사람이 보기에 그것은
   «한 업체가 세 달 밀린 것» 한 가지 사실이다. 업체로 묶고 달은 안에 접는다.
   먼저 충당할 곳(head)은 «가장 오래된 달» — 회계 관행(오래된 미수부터)과 같다. */
function erpGroupPendByCompany(sugList){
  var out = [], byCo = {};
  (sugList || []).forEach(function(s){
    if(!s || !s.cand) return;
    var co = erpNormName(s.cand.companyName) || '-';
    if(!byCo[co]){ byCo[co] = { company:s.cand.companyName || '-', items:[], kinds:[], months:[] }; out.push(byCo[co]); }
    var g = byCo[co];
    g.items.push(s);
    var lb = s.cand.label || '';
    if(lb && g.kinds.indexOf(lb) < 0) g.kinds.push(lb);
    var ym = s.cand.ym || '';
    if(ym && g.months.indexOf(ym) < 0) g.months.push(ym);
  });
  out.forEach(function(g){
    g.months.sort();
    /* 달이 있는 것끼리는 오래된 달 먼저, 달이 없는 것(사건 착수금 등)은 점수 높은 것 먼저 */
    g.items.sort(function(a, b){
      var ma = (a.cand && a.cand.ym) || '', mb = (b.cand && b.cand.ym) || '';
      if(ma && mb && ma !== mb) return ma < mb ? -1 : 1;
      return (b.score || 0) - (a.score || 0);
    });
    g.head = g.items[0];
    g.n = g.items.length;
  });
  return out;
}
if(typeof window !== 'undefined') window.erpGroupPendByCompany = erpGroupPendByCompany;
```

주의: 이 함수는 `erpNormName` 을 쓰므로 검사 컨텍스트에 함께 넣어야 한다. Step 1 의 `vm.runInContext` 앞에 한 줄 더한다:

```js
vm.runInContext(slice('function erpNormName(', '\nfunction erpCleanMemo('), gctx);
```

(만약 `erpCleanMemo` 가 `erpNormName` 바로 뒤가 아니면 실제 다음 함수 이름으로 바꾼다 — `grep -n "^function erp" pu-erp.html` 로 확인)

- [ ] **Step 4: 통과 확인**

```bash
node tests/ledger-match-gate.test.js
```

기대: 13 통과 / 0 실패

- [ ] **Step 5: 커밋**

```bash
node scratchpad/chk.js pu-erp.html
git add pu-erp.html tests/ledger-match-gate.test.js
git commit -m "feat(거래내역): 같은 업체의 밀린 달을 한 줄로 묶고 오래된 달부터 채운다"
```

---

### Task 3: 세금계산서 대조 창 60일 → 180일

**Files:**
- Modify: `pu-erp.html:5199-5214` (`_erpInvWindow`)
- Test: `tests/ledger-match-gate.test.js` (이어서)

**Interfaces:**
- Produces: 상수 `INV_MATCH_DAYS = 180` (전역), `_erpInvWindow` 가 이 값을 쓴다

- [ ] **Step 1: 검사부터**

`tests/ledger-match-gate.test.js` 에 더한다:

```js
const invSrc = slice('var INV_MATCH_DAYS', '\nfunction erpInvoiceMatch(');
t('대조 창이 상수로 뽑혀 있다', /INV_MATCH_DAYS\s*=\s*180/.test(invSrc), true);
t('창 판정이 상수를 쓴다', /gap > INV_MATCH_DAYS/.test(invSrc), true);
t('60일 하드코딩이 없다', /gap > 60/.test(invSrc), false);
```

- [ ] **Step 2: 실패 확인**

```bash
node tests/ledger-match-gate.test.js
```

기대: `시작 표식 못찾음: var INV_MATCH_DAYS`

- [ ] **Step 3: 상수를 만들고 창을 넓힌다**

`pu-erp.html` 에서 `// 금액+날짜 관문(발급 ≤ 입금, 60일 이내)을 통과한 발행분` 주석 줄을 통째로 아래로 바꾼다:

```js
/* 세금계산서 발급 → 입금까지 봐 주는 기간.
   60일이었는데, 3월에 끊고 6월에 들어오는 일이 실제로 있다(대표 지적).
   이름이 맞아야 하고 이미 입금된 계산서는 빠지므로 넓혀도 엉뚱한 것이 붙지 않는다.
   보관 개월(INV_ARCH_MONTHS=24)보다 짧아야 색인에 없는 것을 찾지 않는다. */
var INV_MATCH_DAYS = 180;
// 금액+날짜 관문(발급 ≤ 입금, INV_MATCH_DAYS 이내)을 통과한 발행분 — 금액+날짜 단위로 캐시해 후보마다 재계산하지 않는다
```

그리고 같은 함수 안 `if(gap === null || gap < 0 || gap > 60) return;` 을:

```js
    if(gap === null || gap < 0 || gap > INV_MATCH_DAYS) return;
```

- [ ] **Step 4: 통과 확인 후 커밋**

```bash
node tests/ledger-match-gate.test.js
node scratchpad/chk.js pu-erp.html
git add pu-erp.html tests/ledger-match-gate.test.js
git commit -m "feat(거래내역): 세금계산서 대조를 6개월까지 — 3월 발급·6월 입금을 잡는다"
```

---

### Task 4: 카드·CMS 수수료를 감안한 금액 일치

**Files:**
- Modify: `pu-erp.html` — `erpAmountExact` (5580행) 바로 뒤에 추가
- Test: `tests/ledger-match-gate.test.js` (이어서)

**Interfaces:**
- Produces: `erpFeeMatch(txnAmt, candAmt, src)` → `{ok:boolean, fee:number, rate:number}` — `src` 가 `'card'`/`'nicebill'` 일 때만 0~3.5% 차감을 인정

- [ ] **Step 1: 검사부터**

```js
const fctx = { console, Object, JSON, Array, String, Number, parseInt, isNaN, Math };
vm.createContext(fctx);
vm.runInContext(slice('function erpFeeMatch(', '\n// sug = erpMatchTxnToPending'), fctx);

t('카드 2.2% 수수료를 인정한다', fctx.erpFeeMatch(990000, 1012000, 'card').ok, true);
t('빠진 수수료 금액을 알려준다', fctx.erpFeeMatch(990000, 1012000, 'card').fee, 22000);
t('통장은 수수료를 안 본다', fctx.erpFeeMatch(990000, 1012000, 'bank').ok, false);
t('3.5%를 넘으면 아니다', fctx.erpFeeMatch(900000, 1012000, 'card').ok, false);
t('더 들어온 것은 수수료가 아니다', fctx.erpFeeMatch(1100000, 1012000, 'card').ok, false);
t('CMS 도 인정한다', fctx.erpFeeMatch(990000, 1012000, 'nicebill').ok, true);
t('0원은 안 터진다', fctx.erpFeeMatch(0, 0, 'card').ok, false);
```

- [ ] **Step 2: 실패 확인**

```bash
node tests/ledger-match-gate.test.js
```

- [ ] **Step 3: 함수를 넣는다**

`erpAmountExact` 함수가 끝나는 `}` 다음 줄에:

```js
/* ── 카드·CMS 수수료 감안 일치 ──
   카드로 받으면 수수료가 빠져 들어와 금액이 «안 맞는 것이 정상»이다.
   그래서 카드·나이스빌 줄만 0~3.5% 덜 들어온 것을 일치로 본다(통장은 아니다 — 통장은
   덜 들어오면 진짜 부분입금이다). 매출은 원래 금액, 차액은 카드수수료 지출로 적는다. */
var ERP_FEE_MAX_RATE = 0.035;
function erpFeeMatch(txnAmt, candAmt, src){
  var t = parseInt(txnAmt, 10) || 0, c = parseInt(candAmt, 10) || 0;
  var no = { ok:false, fee:0, rate:0 };
  if(t <= 0 || c <= 0) return no;
  if(src !== 'card' && src !== 'nicebill') return no;
  if(t > c) return no;                                  // 더 들어온 것은 과입금이지 수수료가 아니다
  var fee = c - t;
  var rate = fee / c;
  if(rate > ERP_FEE_MAX_RATE) return no;
  return { ok:true, fee:fee, rate:Math.round(rate * 10000) / 10000 };
}
if(typeof window !== 'undefined') window.erpFeeMatch = erpFeeMatch;
```

- [ ] **Step 4: 통과 확인 후 커밋**

```bash
node tests/ledger-match-gate.test.js
node scratchpad/chk.js pu-erp.html
git add pu-erp.html tests/ledger-match-gate.test.js
git commit -m "feat(거래내역): 카드·CMS 수수료를 감안해 금액을 맞춘다"
```

---

## Phase 2 — 화면 (한 줄 원칙)

### Task 5: 줄 상태 판정 (신호등 4색)

**Files:**
- Modify: `pu-erp.html` — `erpGroupPendByCompany` 뒤
- Test: `tests/ledger-row-state.test.js` (신규)

**Interfaces:**
- Consumes: `erpFeeMatch`, `erpNameEvidence`
- Produces: `erpRowState(row, groups, ctx)` → `{state, label, diff, fee}` — `state` 는 `'ready'|'check'|'none'|'done'`

- [ ] **Step 1: 검사부터**

`tests/ledger-row-state.test.js`:

```js
/* 줄 상태 판정 — 입금 한 줄이 어떤 색으로 서는가.
   ★ 지금은 줄마다 상자·목록·체크가 붙어 화면 반쪽을 먹고 판단이 안 된다. */
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const HTML = path.join(__dirname, '..', 'pu-erp.html');
const src = fs.readFileSync(HTML, 'utf8').replace(/\r\n/g, '\n');
function slice(a, b){
  const i = src.indexOf(a);
  if(i < 0) throw new Error('시작 표식 못찾음: ' + a);
  const j = src.indexOf(b, i);
  if(j < 0) throw new Error('끝 표식 못찾음: ' + b);
  return src.slice(i, j);
}
let pass = 0, fail = 0;
const t = (name, got, want) => {
  const G = JSON.stringify(got), W = JSON.stringify(want);
  if(G === W) pass++;
  else { fail++; console.log('FAIL ' + name + '\n  got  = ' + G + '\n  want = ' + W); }
};

const ctx = { console, Object, JSON, Array, String, Number, parseInt, isNaN, Math };
vm.createContext(ctx);
vm.runInContext(slice('var ERP_FEE_MAX_RATE', '\n// sug = erpMatchTxnToPending'), ctx);
vm.runInContext(slice('function erpRowState(', '\nfunction FinanceLedger('), ctx);

const grp = (amt, score) => [{ company:'가나', n:1, months:[], kinds:['자문료'],
                               head:{ cand:{ id:'x', companyName:'가나', expect:amt, amount:amt }, score:score } }];

t('금액·이름 맞으면 초록', ctx.erpRowState({amount:330000, src:'bank'}, grp(330000, 95), {}).state, 'ready');
t('더 들어오면 노랑', ctx.erpRowState({amount:400000, src:'bank'}, grp(330000, 95), {}).state, 'check');
t('넘친 금액을 알려준다', ctx.erpRowState({amount:400000, src:'bank'}, grp(330000, 95), {}).diff, 70000);
t('덜 들어오면 노랑', ctx.erpRowState({amount:200000, src:'bank'}, grp(330000, 95), {}).state, 'check');
t('모자란 금액은 음수', ctx.erpRowState({amount:200000, src:'bank'}, grp(330000, 95), {}).diff, -130000);
t('카드 수수료는 초록', ctx.erpRowState({amount:990000, src:'card'}, grp(1012000, 95), {}).state, 'ready');
t('수수료 금액을 싣는다', ctx.erpRowState({amount:990000, src:'card'}, grp(1012000, 95), {}).fee, 22000);
t('후보 없으면 빨강', ctx.erpRowState({amount:210000, src:'bank'}, [], {}).state, 'none');
t('이미 처리면 회색', ctx.erpRowState({amount:330000, src:'bank', _dup:true}, grp(330000, 95), {}).state, 'done');
t('보류함에 넣은 것도 회색', ctx.erpRowState({amount:1, src:'bank', _k:'k1'}, [], {held:{k1:1}}).state, 'done');
t('업체가 여럿이면 노랑', ctx.erpRowState({amount:330000, src:'bank'},
    grp(330000, 95).concat(grp(330000, 93)), {}).state, 'check');
t('빈 값이 와도 안 터진다', ctx.erpRowState(null, null, null).state, 'none');

console.log('\n  === ' + pass + ' 통과 / ' + fail + ' 실패 ===');
process.exit(fail ? 1 : 0);
```

- [ ] **Step 2: 실패 확인**

```bash
node tests/ledger-row-state.test.js
```

- [ ] **Step 3: 함수를 넣는다**

`erpGroupPendByCompany` 의 window 노출 줄 뒤에:

```js
/* ── 줄 상태 (신호등) ──
   초록: 바로 확정 가능 · 노랑: 사람이 봐야 함 · 빨강: 후보 없음 · 회색: 이미 처리·보류
   판단을 이 한 곳에서만 한다 — 화면 여기저기서 다시 재면 배지와 단추가 어긋난다. */
function erpRowState(row, groups, ctx){
  row = row || {}; groups = groups || []; ctx = ctx || {};
  var amt = parseInt(row.amount, 10) || 0;
  var held = ctx.held || {};
  if(row._dup || (row._k && held[row._k])) return { state:'done', label:'이미 처리', diff:0, fee:0 };
  if(!groups.length) return { state:'none', label:'후보 없음', diff:0, fee:0 };
  if(groups.length > 1) return { state:'check', label:'업체가 여럿 — 골라야 합니다', diff:0, fee:0 };
  var g = groups[0];
  var cand = (g.head && g.head.cand) || {};
  var exp = parseInt(cand.expect || cand.amount, 10) || 0;
  var fm = erpFeeMatch(amt, exp, row.src);
  if(fm.ok) return { state:'ready', label:'수수료 차감 확정', diff:0, fee:fm.fee };
  var diff = amt - exp;
  if(Math.abs(diff) <= 1100) return { state:'ready', label:'확정 가능', diff:0, fee:0 };
  if(diff > 0) return { state:'check', label:'더 들어옴', diff:diff, fee:0 };
  return { state:'check', label:'덜 들어옴', diff:diff, fee:0 };
}
if(typeof window !== 'undefined') window.erpRowState = erpRowState;
```

- [ ] **Step 4: 통과 확인 후 커밋**

```bash
node tests/ledger-row-state.test.js
node scratchpad/chk.js pu-erp.html
git add pu-erp.html tests/ledger-row-state.test.js
git commit -m "feat(거래내역): 줄 상태를 한 곳에서 판정한다 (확정가능·확인필요·후보없음·이미처리)"
```

---

### Task 6: 한 줄 렌더로 교체

**Files:**
- Modify: `pu-erp.html` — FinanceLedger 입금 행 렌더 구역 (현재 초록 안내상자 ~ 추천 라디오 목록 ~ 확인/VAT 아랫줄)
- Test: `tests/ledger-row-state.test.js` (배선 grep 추가)

**Interfaces:**
- Consumes: `erpRowState`, `erpGroupPendByCompany`, `erpPendOptions`
- Produces: 화면 전용 (반환값 없음). 펼침 상태는 `openRow` state 하나로 관리.

- [ ] **Step 1: 배선 검사부터**

`tests/ledger-row-state.test.js` 의 `console.log` 앞에:

```js
const ui = slice('function FinanceLedger(', '\nfunction FinanceIncome(');
t('줄 상태를 화면이 쓴다', /erpRowState\(/.test(ui), true);
t('업체 묶기를 화면이 쓴다', /erpGroupPendByCompany\(/.test(ui), true);
t('옛 초록 안내상자가 없다', /이미 확정된 건일 수 있습니다/.test(ui), false);
t('옛 업체·항목 셀렉트가 없다', /-- 업체\/항목 선택 --/.test(ui), false);
t('펼침 상태가 하나로 관리된다', /openRow/.test(ui), true);
```

- [ ] **Step 2: 실패 확인**

```bash
node tests/ledger-row-state.test.js
```

- [ ] **Step 3: 렌더를 바꾼다**

FinanceLedger 안에서:

(a) state 를 더한다 (`var inMatchS=useState({});` 근처):

```js
  var openRowS=useState('');   var openRow=openRowS[0];   var setOpenRow=openRowS[1];   // 펼친 줄 하나
  var heldS=useState({});      var held=heldS[0];         var setHeld=heldS[1];         // 보류함
```

(b) 행 렌더에서 줄마다 먼저 판정한다 (기존 `incList.map(function(row){` 시작 부분):

```js
      var _sug = incSug[row._k] || [];
      var _grp = erpGroupPendByCompany(_sug);
      var _st  = erpRowState(row, _grp, { held:held });
```

(c) 초록 안내상자 / `-- 업체/항목 선택 --` select / 추천 라디오 목록 / 「이름이 다른 것 n건」 접힘 / 확인·VAT포함 아랫줄을 **삭제**하고, 대신 한 줄을 그린다:

```js
      var _bg = _st.state==='check' ? '#fffbeb' : _st.state==='none' ? '#fef2f2' : 'transparent';
      var _ico = _st.state==='ready' ? '✅' : _st.state==='check' ? '⚠️' : _st.state==='none' ? '❔' : '✔';
      return h('div',{key:row._k},
        h('div',{style:{display:'flex',alignItems:'center',gap:'8px',padding:'7px 10px',
                        background:_bg,borderBottom:'1px solid #e2e8f0',fontSize:'12.5px',
                        opacity:_st.state==='done'?0.55:1,cursor:_st.state==='check'?'pointer':'default'},
                 onClick:_st.state==='check'?function(){ setOpenRow(openRow===row._k?'':row._k); }:undefined},
          h('input',{type:'checkbox',checked:!!pick[row._k],disabled:_st.state==='done',
                     onChange:function(e){ e.stopPropagation(); togglePick(row._k); },
                     style:{width:'15px',height:'15px',flex:'none'}}),
          h('span',{style:{flex:'none'}},_ico),
          h('span',{style:{width:'160px',flex:'none'}},
            h('b',null,(row.amount||0).toLocaleString()),
            h('span',{style:{color:'#94a3b8',marginLeft:'5px'}},String(row.date||'').slice(5)+' '+(row.memo||'').slice(0,10))),
          h('span',{style:{flex:1,minWidth:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}},
            _grp.length ? (_grp[0].company+' · '+_grp[0].kinds.join('·')
              + (_grp[0].n>1 ? ' ('+_grp[0].months.length+'달 밀림 — '+_grp[0].months[0]+'분부터)' : '')) : _st.label),
          _st.fee>0 && h('span',{style:{flex:'none',color:'#b45309',fontSize:'11px'}},'수수료 −'+_st.fee.toLocaleString()),
          _st.diff!==0 && h('span',{style:{flex:'none',color:'#b45309',fontSize:'11px'}},
            (_st.diff>0?'+':'')+_st.diff.toLocaleString()),
          _st.state==='none' && h('button',{style:btnS,onClick:function(e){ e.stopPropagation(); openFind(row); }},'🔍 직접 찾기'),
          _st.state==='none' && h('button',{style:btnS,onClick:function(e){ e.stopPropagation(); setDirPop({row:row}); }},'➕ 직접 등록'),
          _st.state==='none' && h('button',{style:btnS,onClick:function(e){ e.stopPropagation(); holdRow(row._k); }},'🗄 보류함')
        ),
        openRow===row._k && rowExpand(row, _grp, _st)
      );
```

`btnS` 는 파일 안 다른 작은 단추 스타일을 그대로 재사용한다(같은 구역에 이미 있다).

(d) `rowExpand(row, grp, st)` 는 Task 7~8 에서 채운다. 지금은 자리만:

```js
  function rowExpand(row, grp, st){
    return h('div',{style:{padding:'8px 10px 10px 34px',background:'#f8fafc',borderBottom:'1px solid #e2e8f0'}},
      h('div',{style:{fontSize:'11.5px',color:'#64748b'}},'펼침 내용은 다음 단계에서 채운다'));
  }
```

- [ ] **Step 4: 통과 확인 + 실제 브라우저 확인**

```bash
node tests/ledger-row-state.test.js
node scratchpad/chk.js pu-erp.html
```

브라우저에서 거래내역을 열어 ①줄이 한 줄인지 ②82건 기준 스크롤이 짧아졌는지 ③노랑 줄만 펼쳐지는지 본다.

- [ ] **Step 5: 커밋**

```bash
git add pu-erp.html tests/ledger-row-state.test.js
git commit -m "change(거래내역): 입금 한 건을 한 줄로 — 판단 필요한 줄만 펼친다"
```

---

## Phase 3 — 처리 (합치기·나누기·보류·상담료)

### Task 7: 과입금 3갈래

**Files:**
- Modify: `pu-erp.html` — `erpRowState` 뒤에 순수 함수, FinanceLedger 의 `rowExpand` 에 UI
- Test: `tests/ledger-row-state.test.js` (이어서)

**Interfaces:**
- Produces: `erpOverpayPlan(row, cand, choice)` → `[{target, amount, kind, ym}]` — 저장할 조각 목록. `choice` 는 `'prepay'|'asis'|'split'`

- [ ] **Step 1: 검사부터**

```js
const octx = { console, Object, JSON, Array, String, Number, parseInt, isNaN, Math };
vm.createContext(octx);
vm.runInContext(slice('function erpOverpayPlan(', '\nfunction FinanceLedger('), octx);

const R = { amount:400000, date:'2026-07-18' };
const C = { id:'c1', companyName:'한엘', expect:330000, kind:'advisory', ym:'2026-07' };

const p1 = octx.erpOverpayPlan(R, C, 'prepay');
t('미리 받으면 두 조각', p1.length, 2);
t('첫 조각은 이번 달 몫', p1[0].amount, 330000);
t('둘째 조각은 다음 달', p1[1].ym, '2026-08');
t('둘째 조각은 넘친 금액', p1[1].amount, 70000);
t('그대로 기록은 한 조각', octx.erpOverpayPlan(R, C, 'asis').length, 1);
t('그대로 기록은 전액', octx.erpOverpayPlan(R, C, 'asis')[0].amount, 400000);
t('나누기는 이번 달만 잡는다', octx.erpOverpayPlan(R, C, 'split')[0].amount, 330000);
t('나누기는 남는 금액을 알린다', octx.erpOverpayPlan(R, C, 'split').rest, 70000);
t('안 넘쳤으면 한 조각', octx.erpOverpayPlan({amount:330000}, C, 'prepay').length, 1);
```

- [ ] **Step 2: 실패 확인 → Step 3: 함수 추가**

```js
/* ── 과입금 갈래 ──
   받을 돈보다 많이 들어왔을 때 넘친 돈을 어디에 둘지는 «돈 문제»다 — 앱이 정하지 않는다.
   prepay: 다음 달로 미리 받음 · asis: 이 건에 그대로 · split: 나머지는 사람이 골라 나눔 */
function erpOverpayPlan(row, cand, choice){
  row = row || {}; cand = cand || {};
  var amt = parseInt(row.amount, 10) || 0;
  var exp = parseInt(cand.expect || cand.amount, 10) || 0;
  var out = [];
  if(exp <= 0 || amt <= exp){
    out.push({ target:cand.id, amount:amt, kind:cand.kind || '', ym:cand.ym || '' });
    out.rest = 0;
    return out;
  }
  var over = amt - exp;
  if(choice === 'asis'){
    out.push({ target:cand.id, amount:amt, kind:cand.kind || '', ym:cand.ym || '' });
    out.rest = 0;
    return out;
  }
  out.push({ target:cand.id, amount:exp, kind:cand.kind || '', ym:cand.ym || '' });
  if(choice === 'prepay'){
    out.push({ target:cand.id, amount:over, kind:cand.kind || '', ym:_erpYmNext(cand.ym || ''), prepay:true });
    out.rest = 0;
  } else {
    out.rest = over;                                   // split — 나머지는 사람이 고른다
  }
  return out;
}
/* 다음 달 (YYYY-MM). 빈 값이면 빈 값 그대로 — 사건 착수금 등은 달 개념이 없다 */
function _erpYmNext(ym){
  var m = /^(\d{4})-(\d{2})$/.exec(String(ym || ''));
  if(!m) return '';
  var y = parseInt(m[1], 10), mo = parseInt(m[2], 10) + 1;
  if(mo > 12){ mo = 1; y++; }
  return y + '-' + (mo < 10 ? '0' : '') + mo;
}
if(typeof window !== 'undefined'){ window.erpOverpayPlan = erpOverpayPlan; window._erpYmNext = _erpYmNext; }
```

- [ ] **Step 4: `rowExpand` 에 3단추를 그린다**

`rowExpand` 안 `st.diff > 0` 일 때:

```js
      st.diff > 0 && h('div',{style:{marginBottom:'6px'}},
        h('div',{style:{fontSize:'11.5px',color:'#64748b',marginBottom:'5px'}},
          '넘친 '+st.diff.toLocaleString()+'원을 어떻게 할까요?'),
        h('button',{style:btnS,onClick:function(){ confirmOver(row, grp[0].head.cand, 'prepay'); }},
          _erpYmNext(grp[0].head.cand.ym||'') ? (_erpYmNext(grp[0].head.cand.ym).slice(5)+'월분으로 미리 받음') : '다음 건으로 미리 받음'),
        h('button',{style:btnS,onClick:function(){ confirmOver(row, grp[0].head.cand, 'asis'); }},'이 건에 그대로 기록'),
        h('button',{style:btnS,onClick:function(){ confirmOver(row, grp[0].head.cand, 'split'); }},'다른 항목 골라 나누기')),
```

`confirmOver(row, cand, choice)` 는 `erpOverpayPlan` 결과 조각마다 기존 `saveIncome` 을 부른다 (`prepay` 조각은 `pItem.ym` 을 바꿔 넘긴다). `rest > 0` 이면 「나눠 담기」 창을 연다(이미 있는 창 재사용).

- [ ] **Step 5: 통과 확인 후 커밋**

```bash
node tests/ledger-row-state.test.js
node scratchpad/chk.js pu-erp.html
git add pu-erp.html tests/ledger-row-state.test.js
git commit -m "feat(거래내역): 과입금은 그 자리에서 고른다 (미리 받음·그대로·나누기)"
```

---

### Task 8: 여러 입금 → 한 항목 묶어 확정

**Files:**
- Modify: `pu-erp.html` — 순수 함수 + FinanceLedger 하단 막대
- Test: `tests/ledger-row-state.test.js` (이어서)

**Interfaces:**
- Produces: `erpBundlePlan(rows, cand)` → `{total, diff, parts:[{rowKey, amount}], full:boolean}`

- [ ] **Step 1: 검사부터**

```js
const bctx2 = { console, Object, JSON, Array, String, Number, parseInt, isNaN, Math };
vm.createContext(bctx2);
vm.runInContext(slice('function erpBundlePlan(', '\nfunction erpOverpayPlan('), bctx2);

const B = bctx2.erpBundlePlan([{_k:'a',amount:330000},{_k:'b',amount:330000}], {expect:660000});
t('합계를 낸다', B.total, 660000);
t('차액 0이면 완납', B.full, true);
t('조각이 줄 수만큼', B.parts.length, 2);
t('모자라면 완납 아님', bctx2.erpBundlePlan([{_k:'a',amount:330000}], {expect:660000}).full, false);
t('모자란 금액을 알려준다', bctx2.erpBundlePlan([{_k:'a',amount:330000}], {expect:660000}).diff, -330000);
t('빈 값도 안 터진다', bctx2.erpBundlePlan(null, null).total, 0);
```

- [ ] **Step 2: 실패 확인 → Step 3: 함수 추가**

```js
/* ── 여러 입금을 한 항목에 묶기 ──
   잔금을 두 번에 나눠 보내는 업체가 있다. 지금은 줄마다 따로 확정해야 해서
   한쪽은 «덜 받음», 다른 쪽은 «더 받음» 으로 어긋났다. 묶어서 한 번에 적는다.
   차액이 남으면 부분입금으로 남겨 남은 금액이 계속 후보로 산다. */
function erpBundlePlan(rows, cand){
  rows = rows || []; cand = cand || {};
  var total = 0, parts = [];
  rows.forEach(function(r){
    if(!r) return;
    var a = parseInt(r.amount, 10) || 0;
    total += a;
    parts.push({ rowKey:r._k, amount:a });
  });
  var exp = parseInt(cand.expect || cand.amount, 10) || 0;
  var diff = exp > 0 ? (total - exp) : 0;
  return { total:total, diff:diff, parts:parts, full:(exp > 0 && Math.abs(diff) <= 1100) };
}
if(typeof window !== 'undefined') window.erpBundlePlan = erpBundlePlan;
```

- [ ] **Step 4: 하단 막대를 그린다**

FinanceLedger 목록 아래(파일 안 기존 일괄 단추 자리)에:

```js
      pickKeys.length > 1 && h('div',{style:{display:'flex',alignItems:'center',gap:'8px',marginTop:'8px',
        padding:'8px 10px',background:'#eff6ff',border:'1px solid #bfdbfe',borderRadius:'6px',fontSize:'12px'}},
        h('span',{style:{flex:1}}, pickKeys.length+'건 선택 · 합계 '+pickSum.toLocaleString()+'원'),
        h('button',{style:btnS,onClick:function(){ setBundlePop({rows:pickRows}); }},'묶어 한 항목에 확정')),
```

`setBundlePop` 창에서 항목 하나를 고르면 `erpBundlePlan` 으로 계산해 `saveIncome(첫 줄, pItem, {partial:!plan.full})` 을 조각마다 부른다 — `splitPayments` 가 쌓이므로 `erpPaidSoFar` 가 합계를 본다.

- [ ] **Step 5: 통과 확인 후 커밋**

```bash
node tests/ledger-row-state.test.js
node scratchpad/chk.js pu-erp.html
git add pu-erp.html tests/ledger-row-state.test.js
git commit -m "feat(거래내역): 나눠 들어온 입금을 묶어 한 항목에 확정한다"
```

---

### Task 9: 보류함 (가수금)

**Files:**
- Modify: `pu-erp.html` — FinanceLedger (held state·단추·목록), 월말 마감 경고(`fin/close` 구역)
- Test: `tests/ledger-row-state.test.js` (이어서)

**Interfaces:**
- 저장소: `dbGet('ledger_held', [])` — `[{k, date, amount, memo, src, heldAt, heldBy}]`
- Produces: `erpHeldSummary(list)` → `{n, sum, oldest}` — 월말 마감 경고용

- [ ] **Step 1: 검사부터**

```js
const hctx = { console, Object, JSON, Array, String, Number, parseInt, isNaN, Math };
vm.createContext(hctx);
vm.runInContext(slice('function erpHeldSummary(', '\nfunction erpBundlePlan('), hctx);

const H = hctx.erpHeldSummary([{k:'a',amount:110000,date:'2026-07-13'},
                               {k:'b',amount:50000,date:'2026-06-02'}]);
t('건수를 센다', H.n, 2);
t('합계를 낸다', H.sum, 160000);
t('가장 오래된 날을 알려준다', H.oldest, '2026-06-02');
t('비면 0건', hctx.erpHeldSummary([]).n, 0);
t('빈 값도 안 터진다', hctx.erpHeldSummary(null).sum, 0);

const close = slice('function MonthClose(', '\nfunction ');
t('월말 마감이 보류함을 본다', /erpHeldSummary|ledger_held/.test(close), true);
```

- [ ] **Step 2: 실패 확인 → Step 3: 함수 추가**

```js
/* ── 보류함 (전문 회계프로그램의 «가수금») ──
   누가 왜 보낸 돈인지 모를 때 ✕ 로 지우면 매출에서 사라진다 — 그러면 아무도 다시 안 본다.
   보류함은 «지우지 않고 목록에서만 빼는» 자리다. 월말 마감에서 남아 있으면 경고한다. */
function erpHeldSummary(list){
  list = list || [];
  var n = 0, sum = 0, oldest = '';
  list.forEach(function(x){
    if(!x) return;
    n++;
    sum += parseInt(x.amount, 10) || 0;
    var d = String(x.date || '');
    if(d && (!oldest || d < oldest)) oldest = d;
  });
  return { n:n, sum:sum, oldest:oldest };
}
if(typeof window !== 'undefined') window.erpHeldSummary = erpHeldSummary;
```

- [ ] **Step 4: 화면 세 곳을 잇는다**

(a) 🔴 줄의 「🗄 보류함」 단추 → `holdRow(k)`:

```js
  function holdRow(k){
    var row = incByK[k]; if(!row) return;
    var cur = dbGet('ledger_held', []) || [];
    cur.push({ k:k, date:row.date||'', amount:row.amount||0, memo:row.memo||'', src:row.src||'bank',
               heldAt:new Date().toISOString(), heldBy:CURRENT_USER?CURRENT_USER.sid:'' });
    if(dbUpsert('ledger_held', cur) === false){ showToast('❌ 보류함 저장에 실패했습니다'); return; }
    var nx = {}; Object.keys(held).forEach(function(x){ nx[x]=held[x]; }); nx[k]=1;
    setHeld(nx);
    showToast('🗄 보류함에 넣었습니다 — 나중에 밝혀지면 꺼내서 확정하세요');
  }
```

(b) 상단 「🗄 보류함 n」 단추 → 목록 창(꺼내기 = held 에서 지우고 목록으로 복귀).

(c) 월말 마감 화면: 보류함이 비어 있지 않으면 잠금 단계에 경고 한 줄

```js
        _heldS.n > 0 && h('div',{style:{fontSize:'11.5px',color:'#b45309',marginTop:'4px'}},
          '⚠️ 보류함에 '+_heldS.n+'건 ('+_heldS.sum.toLocaleString()+'원) 남아 있습니다 — '
          +(_heldS.oldest?('가장 오래된 것 '+_heldS.oldest):'')),
```

- [ ] **Step 5: 통과 확인 후 커밋**

```bash
node tests/ledger-row-state.test.js
node scratchpad/chk.js pu-erp.html
git add pu-erp.html tests/ledger-row-state.test.js
git commit -m "feat(거래내역): 보류함 — 정체불명 입금을 지우지 않고 남긴다, 월말 마감이 경고"
```

---

### Task 10: 상담접수와 대조 (기록 없는 입금 1단계)

**Files:**
- Modify: `pu-erp.html` — 순수 함수 + 🔴 줄 렌더
- Test: `tests/ledger-row-state.test.js` (이어서)

**Interfaces:**
- Consumes: `dbGet('contracts', [])` 중 `status==='consult'`
- Produces: `erpConsultMatch(row, intakes)` → `{hit, name, date, id}|null`

- [ ] **Step 1: 검사부터**

```js
const cctx = { console, Object, JSON, Array, String, Number, parseInt, isNaN, Math, Date };
vm.createContext(cctx);
vm.runInContext(slice('function erpNormName(', '\nfunction erpCleanMemo('), cctx);
vm.runInContext(slice('function erpConsultMatch(', '\nfunction erpHeldSummary('), cctx);

const IN = [{ id:'c1', status:'consult', clientName:'김민수', contractDate:'2026-07-12' },
            { id:'c2', status:'consult', clientName:'박영희', contractDate:'2026-05-01' }];

t('이름이 맞으면 찾는다', cctx.erpConsultMatch({memo:'김민수', date:'2026-07-13'}, IN).id, 'c1');
t('접수일이 입금보다 나중이면 아니다', cctx.erpConsultMatch({memo:'김민수', date:'2026-07-01'}, IN), null);
t('너무 오래된 접수는 아니다', cctx.erpConsultMatch({memo:'박영희', date:'2026-07-13'}, IN), null);
t('이름이 없으면 아니다', cctx.erpConsultMatch({memo:'비즈사업비', date:'2026-07-13'}, IN), null);
t('빈 값도 안 터진다', cctx.erpConsultMatch(null, null), null);
```

- [ ] **Step 2: 실패 확인 → Step 3: 함수 추가**

```js
/* ── 상담료 후보 (상담접수와 이름 대조) ──
   상담만 하고 현금·카드로 받으면 사무관리에도 계산서에도 기록이 없다. 그런데 상담접수
   카드에는 이름이 있다 — 그것을 근거로 쓴다. 접수보다 «나중»에 들어온 60일 이내만 본다. */
var ERP_CONSULT_DAYS = 60;
function erpConsultMatch(row, intakes){
  row = row || {}; intakes = intakes || [];
  var tn = erpNormName(row.memo);
  if(!tn || tn.length < 2) return null;
  var td = String(row.date || '').slice(0, 10);
  if(td.length < 8) return null;
  var tt = new Date(td).getTime();
  if(isNaN(tt)) return null;
  var hit = null;
  intakes.forEach(function(c){
    if(hit || !c || c.status !== 'consult') return;
    var cn = erpNormName(c.clientName || c.companyName || '');
    if(!cn || cn !== tn) return;
    var cd = String(c.contractDate || c.regAt || '').slice(0, 10);
    var ct = new Date(cd).getTime();
    if(isNaN(ct)) return;
    var gap = Math.round((tt - ct) / 86400000);
    if(gap < 0 || gap > ERP_CONSULT_DAYS) return;
    hit = { hit:true, name:c.clientName || '', date:cd, id:c.id };
  });
  return hit;
}
if(typeof window !== 'undefined') window.erpConsultMatch = erpConsultMatch;
```

- [ ] **Step 4: 🔴 줄에 후보를 띄운다**

`_st.state==='none'` 일 때 `erpConsultMatch(row, _intakes)` 를 부르고, 맞으면 문구와 단추를 바꾼다:

```js
          _st.state==='none' && _cm && h('span',{style:{flex:1,color:'#991b1b'}},
            '상담료일 수 있음 — 상담접수 '+_cm.date.slice(5)+' 「'+_cm.name+'」'),
          _st.state==='none' && _cm && h('button',{style:btnS,onClick:function(e){ e.stopPropagation();
            setDirPop({row:row, preset:'상담료', consultId:_cm.id, company:_cm.name}); }},'상담료로 등록'),
```

`_intakes` 는 렌더당 한 번만 만든다: `var _intakes = (dbGet('contracts',[])||[]).filter(function(c){return c&&c.status==='consult';});`

`saveDirectIncome` 에 `consultId` 를 함께 저장해 나중에 그 상담 건과 이어 볼 수 있게 한다.

- [ ] **Step 5: 통과 확인 후 커밋**

```bash
node tests/ledger-row-state.test.js
node scratchpad/chk.js pu-erp.html
git add pu-erp.html tests/ledger-row-state.test.js
git commit -m "feat(거래내역): 상담접수 이름과 대조해 상담료 입금을 찾아 준다"
```

---

## Phase 4 — 정리·마무리

### Task 11: 업로드 결과 상주 표시 + 달 남은 건수

**Files:**
- Modify: `pu-erp.html` — `processFile` (34382~34390 토스트 연쇄), 월 넘기기 구역(35271~35330)
- Test: `tests/ledger-upload-summary.test.js` (신규)

**Interfaces:**
- Produces: `erpUploadSummary(mg, addedN, dupN)` → `{added, skipped, same:boolean, lines:[string]}`

- [ ] **Step 1: 검사부터**

`tests/ledger-upload-summary.test.js`:

```js
/* 업로드 결과를 «보이게» 한다.
   ★ 담당자가 같은 엑셀을 또 올려도 조용히 걸러져서 본인이 모른다. */
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const HTML = path.join(__dirname, '..', 'pu-erp.html');
const src = fs.readFileSync(HTML, 'utf8').replace(/\r\n/g, '\n');
function slice(a, b){
  const i = src.indexOf(a);
  if(i < 0) throw new Error('시작 표식 못찾음: ' + a);
  const j = src.indexOf(b, i);
  if(j < 0) throw new Error('끝 표식 못찾음: ' + b);
  return src.slice(i, j);
}
let pass = 0, fail = 0;
const t = (name, got, want) => {
  const G = JSON.stringify(got), W = JSON.stringify(want);
  if(G === W) pass++;
  else { fail++; console.log('FAIL ' + name + '\n  got  = ' + G + '\n  want = ' + W); }
};

const ctx = { console, Object, JSON, Array, String, Number, parseInt, isNaN, Math };
vm.createContext(ctx);
vm.runInContext(slice('function erpUploadSummary(', '\nfunction erpRowState('), ctx);

const A = ctx.erpUploadSummary({dup:383, cut:0, skip:0}, 122, 0);
t('새 줄 수를 싣는다', A.added, 122);
t('건너뛴 줄 수를 싣는다', A.skipped, 383);
t('일부만 겹치면 같은 파일 아님', A.same, false);

const B = ctx.erpUploadSummary({dup:505, cut:0, skip:0}, 0, 0);
t('새 줄이 0이면 같은 파일', B.same, true);
t('같은 파일이라고 말해 준다', /전에 올린/.test(B.lines.join(' ')), true);

const C = ctx.erpUploadSummary({dup:0, cut:0, skip:3}, 100, 0);
t('날짜 못 읽은 줄도 알린다', /날짜/.test(C.lines.join(' ')), true);
t('빈 값도 안 터진다', ctx.erpUploadSummary(null, 0, 0).added, 0);

const ui = slice('function processFile(', '\n  function handleFile(');
t('업로드가 요약 함수를 쓴다', /erpUploadSummary\(/.test(ui), true);
t('토스트 연쇄가 사라졌다', /setTimeout\(function\(\)\{ showToast\('🔁/.test(ui), false);

const mon = slice('function monStat(', '\n  function go(');
t('달마다 남은 건수를 센다', /todo/.test(mon), true);

console.log('\n  === ' + pass + ' 통과 / ' + fail + ' 실패 ===');
process.exit(fail ? 1 : 0);
```

- [ ] **Step 2: 실패 확인 → Step 3: 함수 추가**

`erpRowState` 앞에:

```js
/* ── 업로드 결과 요약 ──
   걸러내기는 이미 두 겹으로 있다(행 지문·처리 완료 지문). 문제는 «조용히» 걸러진다는 것 —
   담당자가 같은 파일을 또 올려도 본인은 모른다. 사라지는 토스트 넷 대신 한 자리에 남긴다. */
function erpUploadSummary(mg, addedN, dupN){
  mg = mg || {};
  var added = parseInt(addedN, 10) || 0;
  var skipped = parseInt(mg.dup, 10) || 0;
  var done = parseInt(dupN, 10) || 0;
  var same = (added === 0 && skipped > 0);
  var lines = [];
  if(same) lines.push('이 파일은 전에 올린 것과 같습니다 — 새로 들어온 줄이 없습니다');
  else lines.push('새로 들어온 ' + added + '줄' + (skipped ? (' · 이미 있어서 건너뜀 ' + skipped + '줄') : ''));
  if(done) lines.push('이미 확정·등록한 ' + done + '줄은 「이미 처리」로 둡니다');
  if(mg.skip) lines.push('날짜를 읽지 못한 ' + mg.skip + '줄은 넣지 못했습니다 — 파일의 날짜 칸을 확인하세요');
  if(mg.cut) lines.push('보관 한도를 넘어 오래된 ' + mg.cut + '줄을 버렸습니다');
  return { added:added, skipped:skipped, same:same, lines:lines };
}
if(typeof window !== 'undefined') window.erpUploadSummary = erpUploadSummary;
```

- [ ] **Step 4: 토스트 연쇄를 요약 한 자리로 바꾼다**

`processFile` 의 `showToast('✅ 새로 …')` 부터 `if(_mg.skip) setTimeout(...)` 까지 다섯 줄을 지우고:

```js
        var _sum = erpUploadSummary(_mg, _added, dupN);
        setUpSum(_sum);                                  // 파일 줄 아래에 남는다 (사라지지 않는다)
        showToast(_sum.same ? '🔁 전에 올린 파일과 같습니다' : ('✅ 새로 '+_sum.added+'줄 추가'));
```

state 추가: `var upSumS=useState(null); var upSum=upSumS[0]; var setUpSum=upSumS[1];`
파일 줄 아래 렌더:

```js
      upSum && h('div',{style:{padding:'6px 10px',background:upSum.same?'#fef3c7':'#f0fdf4',
        border:'1px solid '+(upSum.same?'#fde68a':'#bbf7d0'),borderRadius:'6px',fontSize:'11.5px',
        color:upSum.same?'#92400e':'#166534',marginTop:'6px'},
        title:'다른 파일을 올리면 새로 바뀝니다'},
        upSum.lines.map(function(L,i){ return h('div',{key:i},L); })),
```

- [ ] **Step 5: 달마다 남은 건수를 붙인다**

`monStat(m)` 이 이미 `_cfm` 으로 확정 건수를 세고 있다. 남은 건수(`todo`)를 반환에 더하고, 월 넘기기 드롭다운 `<option>` 라벨을 `m + (todo ? ' · 남은 '+todo : ' ✓')` 로 바꾼다. 현재 달 단추에도 같은 문구.

- [ ] **Step 6: 통과 확인 후 커밋**

```bash
node tests/ledger-upload-summary.test.js
node scratchpad/chk.js pu-erp.html
git add pu-erp.html tests/ledger-upload-summary.test.js
git commit -m "feat(거래내역): 올린 결과를 한 자리에 남기고 달마다 남은 건수를 보여준다"
```

---

### Task 12: 확정 단추 하나로

**Files:**
- Modify: `pu-erp.html` — FinanceLedger 상단 단추 구역 (35337~35563: 고신뢰 확정·일괄 확정·자동 정리·⚡자동확정·📋확인 후 확정·자문료 일괄확인)
- Test: `tests/ledger-row-state.test.js` (이어서)

**Interfaces:**
- Consumes: `erpRowState` 결과의 `state==='ready'` 인 줄 목록
- Produces: 화면 전용

- [ ] **Step 1: 배선 검사부터**

```js
const btn = slice('function FinanceLedger(', '\nfunction FinanceIncome(');
t('확정 단추가 하나다', (btn.match(/확정 가능 .*건 모두 확정/g) || []).length, 1);
t('옛 고신뢰 단추가 없다', /고신뢰 확정/.test(btn), false);
t('옛 자동 정리 단추가 없다', /자동 정리 대상/.test(btn), false);
t('자문료도 같은 단추로 간다', /자문료 일괄확인/.test(btn), false);
```

- [ ] **Step 2: 실패 확인 → Step 3: 단추를 합친다**

여섯 단추를 지우고 하나만 남긴다:

```js
      h('button',{onClick:async function(){
        var ready = incList.filter(function(r){
          var g = erpGroupPendByCompany(incSug[r._k]||[]);
          return erpRowState(r, g, {held:held}).state === 'ready' && pick[r._k] !== false;
        });
        if(!ready.length){ showToast('확정할 수 있는 줄이 없습니다'); return; }
        if(!(await popConfirm('확정 가능 '+ready.length+'건을 확정합니다.\n\n'
          +'→ 입금관리 기록 · 항목 입금표시 · 성과급 분배까지 한 번에 됩니다\n'
          +'→ 잘못되면 「확정 이력」에서 되돌릴 수 있습니다'))) return;
        var ok=0, ng=0;
        ready.forEach(function(r){
          var g = erpGroupPendByCompany(incSug[r._k]||[]);
          var st = erpRowState(r, g, {held:held});
          var p = g[0].head.cand;
          try {
            saveIncome(r, p, { withPerf:true, feeAmount:st.fee, feeCat:(r.src==='card'?'exp-cardfee':'exp-bankfee') });
            ok++;
          } catch(e){ ng++; if(window._erpErrLog) window._erpErrLog(e); }
        });
        showToast('✅ '+ok+'건 확정'+(ng?(' · 실패 '+ng+'건'):''));
      },style:mainBtnS}, '✅ 확정 가능 '+readyCnt+'건 모두 확정')
```

`readyCnt` 는 렌더 때 한 번 센다 (요약 칩과 같은 값을 쓴다 — 따로 세면 어긋난다).

- [ ] **Step 4: 통과 확인 + 브라우저 확인**

```bash
node tests/ledger-row-state.test.js
node scratchpad/chk.js pu-erp.html
```

브라우저: 단추가 하나뿐인지, 눌렀을 때 성과급이 실제로 분배되는지(입금관리 → 성과관리 확인).

- [ ] **Step 5: 커밋**

```bash
git add pu-erp.html tests/ledger-row-state.test.js
git commit -m "change(거래내역): 확정 단추를 하나로 — 4갈래를 없앤다"
```

---

### Task 13: 변이 검사 + 배포

**Files:**
- Create: `scratchpad/mutledger.js`, `scratchpad/runmutledger.ps1`

- [ ] **Step 1: 변이 12개를 만든다**

`scratchpad/mutledger.js` — 각 안전장치를 하나씩 없애고 검사가 잡는지 본다:

| # | 변이 | 잡아야 할 검사 |
|---|---|---|
| m1 | `erpNameEvidence` 가 늘 `{ok:true}` | 금액만 비슷한 후보 |
| m2 | 게이트를 안 부름 | 배선 grep |
| m3 | 업체 묶기에서 정렬 제거 | 오래된 달 우선 |
| m4 | 묶기를 업체 아닌 id 로 | 업체 수만큼 줄 |
| m5 | `INV_MATCH_DAYS` 를 60 으로 | 상수 검사 |
| m6 | `erpFeeMatch` 가 통장도 인정 | 통장은 수수료 안 봄 |
| m7 | 수수료 상한 제거 | 3.5% 초과 |
| m8 | `erpRowState` 가 과입금도 ready | 더 들어오면 노랑 |
| m9 | 보류 줄을 done 으로 안 봄 | 보류함 회색 |
| m10 | `erpOverpayPlan` prepay 가 한 조각 | 두 조각 |
| m11 | `erpBundlePlan` 이 full 을 늘 true | 모자라면 완납 아님 |
| m12 | `erpUploadSummary` 가 same 판정 안 함 | 같은 파일 문구 |

- [ ] **Step 2: 변이 검사를 돌린다**

```bash
powershell -ExecutionPolicy Bypass -File scratchpad/runmutledger.ps1
```

기대: 12/12 `OK`. `NOT-CAUGHT` 가 나오면 그 검사를 조인다. `NOTFOUND` 면 변이 정규식을 실제 코드에 맞춘다.

- [ ] **Step 3: 전체 스위트를 양쪽 줄바꿈·UTC 로 돌린다**

```bash
powershell -ExecutionPolicy Bypass -File scratchpad/bothEol.ps1 -wt .
```

기대: `RESULT: OK both`

- [ ] **Step 4: 밀어 올리고 실제 배포를 확인한다**

```bash
git pull --rebase origin main
git push origin HEAD:main
```

이어서 `gh run watch` 로 성공을 보고, 실서버 파일을 내려받아 `erpNameEvidence`·`erpRowState`·`erpBundlePlan`·`erpUploadSummary` 가 들어 있는지 grep 한다. **여기까지 해야 끝이다** — 전에 두 번, 내 검사가 CI 에서만 실패해 배포가 조용히 막혔다.

- [ ] **Step 5: STATUS.md 에 기록하고 커밋**

`fund-erp/STATUS.md` 변경 로그 맨 위에 오늘 자 한 줄(무엇을·왜·검증)을 더한다.

---

## Self-Review (계획 작성자 자체 점검 결과)

**1. 설계서 항목 대응**
| 설계서 항목 | 담당 Task |
|---|---|
| 한 줄 원칙·신호등 | 5, 6 |
| 이름 게이트 | 1 |
| 업체 단위 묶기·오래된 달 우선 | 2 |
| 계산서 180일 | 3 |
| 카드·CMS 수수료 | 4, 12 |
| 과입금 3갈래 | 7 |
| 합계 후보(한 입금→여러 항목) | 7(split) + 기존 combo UI 재사용 |
| 여러 입금→한 항목 | 8 |
| 부분입금 | 5(판정) + 8(저장, 기존 partial 경로) |
| 보류함·월말 경고 | 9 |
| 상담접수 대조 | 10 |
| 간편 등록·현금영수증 | 10(기존 saveDirectIncome 재사용) |
| 중복 업로드 요약 | 11 |
| 달 남은 건수 | 11 |
| 확정 단추 하나 | 12 |
| 검증·변이·배포 | 13 |

**2. 빈칸 점검** — "TBD"·"적절히 처리" 없음. Task 6 의 `rowExpand` 는 자리만 두고 Task 7~8 에서 채우는 것을 명시했다.

**3. 이름 일관성** — `erpNameEvidence` · `erpGroupPendByCompany` · `erpRowState` · `erpOverpayPlan` · `erpBundlePlan` · `erpHeldSummary` · `erpConsultMatch` · `erpUploadSummary` · `erpFeeMatch` · `_erpYmNext` · 상수 `INV_MATCH_DAYS` · `ERP_FEE_MAX_RATE` · `ERP_CONSULT_DAYS`. 모든 Task 에서 같은 철자를 썼다.

**4. 주의** — 검사의 `slice()` 표식은 **실제 파일에 그 문자열이 있어야** 한다. 각 Task 의 Step 3 에서 함수를 넣은 뒤 표식이 맞는지 `node tests/...` 로 즉시 확인하는 순서다.
