# Task 1 Report — 상단 탭에 "🏢 기업 상세" 추가 + 진입 배선

## STATUS: DONE

Commit: `58e78ca` — "feat(폰): 상단에 기업 상세 진입 단추 — 갈래가 아니라 화면으로"
(previous HEAD `0d9f1ba`)

## What changed and where

All changes in `pu-cards.html` (phone UI only — PC `#pcRoot`/`renderPC()`/`renderCoPage()` untouched):

1. **`pu-cards.html:1133`** — added `<button id="tabCo" onclick="openCoMobile()">🏢 기업 상세</button>` inside `<div id="tabs">`.
2. **`pu-cards.html:1143`** — `#search`'s `oninput` changed from `render()` to `onMobileSearchInput(this.value)`.
3. **`pu-cards.html:4914-4924`** — `setTab(tab)`: added `if(state.view==='co') state.view='list';` (exits the 기업 상세 screen when returning to 명함/사업자) and `$('tabCo').classList.toggle('on', false)`.
4. **`pu-cards.html:4926-4933`** — new `openCoMobile()`: sets `state.view='co'`, toggles the three tab buttons' `.on` class, sets the search placeholder to `'상호·사업자번호·대표자로 찾기'`, calls `render()`. Does **not** touch `state.tab`.
5. **`pu-cards.html:5061`** — phone `render()` (later aliased to `renderMobile`) now branches: `if(state.view==='co') { renderCoMobileList(); return; }` before falling through to `renderSubbar(); renderSidebar(); renderList();`.
6. **`pu-cards.html:10314-10322`** — new `onMobileSearchInput(v)` (sets `state.coQ` only when `state.view==='co'`, always calls `render()`) and a placeholder `renderCoMobileList()` (`{ const el=$('list'); if(el) el.innerHTML=''; }`) for Task 2 to fill in later, inserted right before `const renderMobile = render;`.

New test file: `tests/cards-co-mobile-tab.test.js` (8 tests), added verbatim from the brief.

## Two deliberate deviations from the brief's literal code, both required to make the brief's own tests pass

The brief said to use the test code and implementation code "verbatim." Two concrete conflicts surfaced during implementation; in both cases I made the minimal mechanical change needed to satisfy the brief's own tests/definition-of-done, and both are pure formatting choices — no behavior differs from what the brief specified.

1. **`render()` had to stay one line, not the three-line version shown in Step 7.**
   The brief's own test (`'render 가 기업 상세 화면이면 카드 목록으로 갈라진다'`) does:
   ```js
   const at = source.indexOf('function render(){');
   const end = source.indexOf('\n', at);
   const fn = source.slice(at, end);
   assert.match(fn, /state\.view==='co'/);
   assert.match(fn, /renderCoMobileList\(\)/);
   ```
   This only captures text up to the *first* newline after `function render(){`. The brief's suggested 3-line replacement puts the `state.view==='co'` check on line 2, so `fn` would never contain it and the test would fail. I implemented it as a single line (`function render(){ if(_quiet) return; saveLastScreen(); if(state.view==='co') { renderCoMobileList(); return; } renderSubbar(); renderSidebar(); renderList(); }`) — same logic, same order, just no internal line breaks. Verified: this passes both my new test and the full suite.

2. **Added a space before `{` in `if(state.view==='co') { ... }` (not `if(state.view==='co'){`).**
   Two pre-existing tests anchor on the literal file-wide string `if(state.view==='co'){` to locate the *PC* sidebar-rendering block (`pu-cards.html:7761`, inside the PC-only render path):
   - `tests/cards-co-folders.test.js` — `'옆줄에 폴더 목록과 ＋가 있다'`
   - `tests/cards-co-tag-hide.test.js` — `'옆줄 사업별 목록에 숨기기·다시보기 아이콘이 있다'`

   Both do `source.indexOf("if(state.view==='co'){")` over the whole file and slice ~1400-1900 chars forward, expecting PC-only markers (`onclick="openCoFolderDialog()"`, `hideCoTag`, etc.) in that slice. My new phone `render()` at line 5061 sits *earlier* in the file than the PC block at 7761. Writing my branch as `if(state.view==='co'){` (brief's literal form) created an identical string earlier in the file, so `indexOf` grabbed my mobile `render()` body instead of the PC sidebar code, and both tests failed (confirmed reproducible: I stashed my change, confirmed `node --test tests/*.test.js` was 100% green beforehand — i.e., these two failures were newly introduced by my diff, not pre-existing).

   Fix: `if(state.view==='co') { renderCoMobileList(); return; }` (space before `{`) — no longer matches the exact anchor string the older tests search for, so they resolve to the PC block again as intended. My own new test only checks `/state\.view==='co'/` (no `{` requirement), so it is unaffected.

I did not alter any PC code or any other test file to work around this — only the spacing/line-breaks of my own new phone-side code.

## Test commands run and output summaries

```
node --test tests/cards-co-mobile-tab.test.js
```
→ `tests 8 / pass 8 / fail 0` (both before the two fixes above were verified as genuinely needed, and after — final run all 8 green).

```
node --test tests/*.test.js
```
→ Before edits (stashed, confirmed pre-existing baseline): `EXIT:0`, fully green.
→ After first draft (brief's literal `if(state.view==='co'){`): `tests 2747 / fail 2` — the two collision failures described above.
→ After the spacing fix: `EXIT:0`, `tests 2747 / pass 2747 / fail 0`.
→ Re-run after mutation-test restore (final state): `EXIT:0`, `tests 2747 / pass 2747 / fail 0`.

`tests/cards-co-info.test.js` ("기업정보는 갈래가 아니라 화면이다") passes in the full run.

## Mutation-test evidence

Mutated `setTab` by removing the line `if(state.view==='co') state.view='list';` (the "exit 기업 상세 screen when switching to card/biz" logic).

Result: `node --test tests/cards-co-mobile-tab.test.js` → `pass 7 / fail 1`:
```
✖ 명함·사업자 탭으로 돌아가면 기업 상세 화면에서 빠져나온다
  AssertionError: 기업 상세 화면에 머문 채로 명함 탭을 그리면 안 된다
  'co' !== 'list'
```
Confirms the new test genuinely exercises this behavior. Restored the line exactly (verified via `git diff` showing no residual change), re-ran: `pass 8 / fail 0`. Full suite re-run after restore: `2747 / 2747`, 0 fail.

## Self-review findings

- No occurrence of the forbidden literal `state.tab==='co'` anywhere in `pu-cards.html` (checked with `grep -n "state\.tab==='co'" pu-cards.html` → no match).
- `openCoMobile()` never assigns to `state.tab`; `setTab()` never assigns to `state.view` except to reset it to `'list'` when leaving the 기업 상세 screen.
- PC code (`#pcRoot`, `renderPC()`, `renderCoPage()`, everything at/after line ~7700 in the PC render path) — no lines changed, only new code inserted below the existing `filterErpMgr` function and before `const renderMobile = render;`, i.e. still inside the phone-only script region.
- `renderCoMobileList()` is an intentional empty-list stub per the brief, to be filled in by Task 2.
- Diff reviewed end-to-end with `git diff -- pu-cards.html`; only the six touch points listed above are changed, nothing else moved or reformatted.

## Concerns

None blocking. Two minor, well-understood deviations from the brief's literal code (documented above) were necessary for the brief's own test suite and full-suite invariants to hold; behavior matches the brief's intent exactly, only whitespace/line-breaks differ. Flagging in case Task 2-6 authors also anchor on `if(state.view==='co'){` (with no space) elsewhere in the PC code — if so, this same collision risk should be kept in mind when phone-side code adds more `state.view==='co'` branches.

---

## Code-review fix pass — Findings 1 & 2 (Important)

Commit: (see final commit SHA below) — branch `feat/mobile-co-detail`, on top of `58e78ca`.

### Finding 1 — fragile whitespace dependency in the `render()` guard

**Where:** `pu-cards.html`, phone `render()` (was line 5061, now ~5068 after Finding 2's addition).

**Before:**
```javascript
function render(){ if(_quiet) return; saveLastScreen(); if(state.view==='co') { renderCoMobileList(); return; } renderSubbar(); renderSidebar(); renderList(); }
```

**After:**
```javascript
function render(){ if(_quiet) return; saveLastScreen(); syncMobileTabs(); if(state.view==='co') return renderCoMobileList(); renderSubbar(); renderSidebar(); renderList(); }
```

Rewrote the guard in the brace-less single-statement form (`if(cond) return x();`) already used elsewhere in this file for this exact condition. This string can never equal the no-space literal `if(state.view==='co'){` that `tests/cards-co-folders.test.js` and `tests/cards-co-tag-hide.test.js` anchor on to locate the PC sidebar block — the collision is now structurally impossible, not just avoided by an undocumented space.

### Finding 2 — tab highlight desync

**Root cause confirmed:** grepped all `state.view=` assignments in the file. Besides `setTab`/`openCoMobile`, at least four other spots change `state.view` and call `render()` without touching tab classes: `closeMatPage()` (line ~2876, `state.view=_matFrom`), `closeMailPage()` (~3690), `openSettingsPage()`/`closeSettingsPage()` (~9404/9406). Any of these reachable from the 기업 상세 screen (e.g. ☰ → 자료함 → close) left `#tabCo` highlighted while a different screen was actually showing.

**Fix — derive the highlight from state in one place:**

1. Added `syncMobileTabs()` right before the phone `render()` (near line 5057-5067):
```javascript
/* 위 탭의 «켜짐» 표시는 화면 상태에서 끌어낸다 — setTab·openCoMobile 두 곳에서 손으로
   칠하면, 그 둘을 안 거치고 화면만 바꾸는 길(☰ 자료함·메일을 닫고 나올 때 등)에서
   탭은 「기업 상세」가 켜진 채 목록이 보이는 어긋남이 생긴다. */
function syncMobileTabs(){
  const co = state.view==='co';
  const t = $('tabCard'), b = $('tabBiz'), c = $('tabCo');
  if(t) t.classList.toggle('on', !co && state.tab==='card');
  if(b) b.classList.toggle('on', !co && state.tab==='biz');
  if(c) c.classList.toggle('on', co);
}
```
2. `render()` now calls `syncMobileTabs()` right after `saveLastScreen()`, before the Finding-1 guard — runs on every phone render regardless of branch.
3. Removed the three `classList.toggle('on', ...)` lines for `tabCard`/`tabBiz`/`tabCo` from both `setTab()` (was toggling all three) and `openCoMobile()` (was toggling all three) — `render()` is now the single authority. Everything else in those two functions (`state.view='list'` reset in `setTab`, `state.view='co'` set in `openCoMobile`, placeholder text, final `render()` call) is unchanged.

This also fixes the concrete `closeMatPage`/`closeMailPage`/settings-close bug for free, since they all already call `render()`.

### Test file changes — `tests/cards-co-mobile-tab.test.js`

- `loadTabBlock()` kept as-is (still mocks `$('tabCard'/'tabBiz'/'tabCo'/'search')`, though the tab-class mocks are now unused by `setTab`/`openCoMobile` since those no longer touch `classList` directly — harmless to leave in place).
- `'openCoMobile 은 state.view 를 co 로 바꾸고 state.tab 은 안 건드린다'` — removed the `c.calls.toggled.tabCo/tabCard/tabBiz` assertions (no longer true in this harness, since `render()` is stubbed as a no-op counter here and `syncMobileTabs()` is defined outside the `setTab`~`toggleSort` slice this harness `vm.runInContext`s). Kept the `state.view`/`state.tab`/`rendered` assertions — still proves the real behavior.
- `'명함·사업자 탭으로 돌아가면 기업 상세 화면에서 빠져나온다'` — same trim: removed the `toggled` assertions, kept `state.view`/`state.tab` assertions.
- Added `loadSyncBlock()` — extracts `function syncMobileTabs(){...}` via `indexOf('function syncMobileTabs(){')` .. `indexOf('\n}', at)+2` (same pattern as the existing `loadMobileSearchBlock()`), running it in a fresh `vm` context with a `$` mock that records `classList.toggle` calls per id.
- Added three new focused tests against `syncMobileTabs()` directly:
  - `'syncMobileTabs — 기업 상세 화면이면 tabCo 만 켜진다'` (`state.view='co'`)
  - `'syncMobileTabs — 명함 탭이면 tabCard 만 켜진다'` (`state.view='list', state.tab='card'`)
  - `'syncMobileTabs — 사업자 탭이면 tabBiz 만 켜진다'` (`state.view='list', state.tab='biz'`)

Net: file went from 8 tests to 11 tests. No coverage was weakened — the class-toggle assertions removed from the two `loadTabBlock` tests were fully replaced (and then some) by the three new direct `syncMobileTabs()` tests, which now also cover the 사업자 탭 case that was never checked before.

### Test commands run and output

```
node --test tests/cards-co-mobile-tab.test.js
```
→ `tests 11 / pass 11 / fail 0`

```
node --test tests/cards-co-folders.test.js tests/cards-co-tag-hide.test.js tests/cards-co-info.test.js
```
→ `tests 64 / pass 64 / fail 0`

```
node --test tests/*.test.js
```
→ `tests 2750 / pass 2750 / fail 0`, exit 0.

### Mutation-test evidence

Mutated `syncMobileTabs()`'s last line from:
```javascript
if(c) c.classList.toggle('on', co);
```
to:
```javascript
if(c) c.classList.toggle('on', false);
```
(simulating "tabCo always off" — the highlight logic silently broken).

Result: `node --test tests/cards-co-mobile-tab.test.js` → `pass 10 / fail 1`:
```
✖ syncMobileTabs — 기업 상세 화면이면 tabCo 만 켜진다
  AssertionError: Expected values to be strictly equal:
  false !== true
```
Confirms the new direct test genuinely exercises `syncMobileTabs()`'s tabCo branch. Restored the line exactly (verified via `git diff` showing the mutation fully reverted), re-ran: `pass 11 / fail 0`. Full suite re-run after restore: `2750 / 2750`, 0 fail.

### Concerns

None blocking. `syncMobileTabs()` runs on every phone `render()` call including ones unrelated to tab state (e.g. list re-renders after edits) — this is intentional (single source of truth) and cheap (3 DOM lookups + class toggles), not a performance concern at this scale. PC code (`#pcRoot`, `renderPC()`, `renderCoPage()`, `renderPCSide()`) untouched — verified via `git diff -- pu-cards.html` showing only the `setTab`/`openCoMobile`/`render()`/new-`syncMobileTabs()` region changed.
