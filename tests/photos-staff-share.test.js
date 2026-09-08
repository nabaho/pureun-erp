'use strict';
/* 직원끼리도 공유한다 (대표 지시 2026-08-29 「직원끼리도 공유하게 해라」)

   ■ 무엇이 막혀 있었나
   받는 것은 처음부터 됐다. **보내는 것이 막혀 있었다** — 사람 명단(`puphotos/owners`)을
   총괄관리자만 읽을 수 있어서, 직원 화면에서는 고를 사람이 아무도 안 떴다.
   「👥 공유」를 눌러도 「고를 사람이 없습니다」 — 단추는 있는데 아무 일도 안 일어나는
   자리였다. 「직원끼리 주고받는 것이 목적」이라는 설계와 정면으로 어긋나 있었다.

   ■ 무엇을 열었나 — «이름표»뿐이다
   `puphotos/owners` 에 담긴 것은 **이름과 마지막 올린 때**뿐이다. 사진은 여기 없다 —
   그것이 이 칸을 사진과 갈라 둔 까닭이다(관리자가 전 직원 사진 본문을 통째로 받는
   일을 막으려고 만들었다).

   ■ 무엇을 안 열었나 — 이쪽이 더 중요하다
   **남의 사진은 그대로 잠겨 있다.** `u/{주인}` 은 주인과 총괄관리자만 읽는다.
   직원 고르개에는 사람 줄이 없고, 「전체 근로자」로 훑는 셋은 저마다 제 isAdmin 을 든다.
   이 검사가 그 경계를 못박는다 — 열어 준 것이 이름표에서 끝나는지 본다.

   실행: node --test tests/*.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { cutFn } = require('./cut-fn');

const R = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(R, 'pu-photos.html'), 'utf8');
const store = fs.readFileSync(path.join(R, 'js', 'pu-photo-store.js'), 'utf8');
const PASTE = path.join(R, 'docs', 'firebase-rules-전체-적용본.json');
/* ⚠ 「지금 콘솔」을 가리켜야 한다. 2026-09-05 까지 09-02 스냅숏을 보고 있었는데,
     그 사이 다른 방들이 co_no_seq·kcareer_inbox·ontology 를 넣었다.
     저장소의 «만들어진 규칙» 파일이 낡아 있어서 그 어긋남이 안 보이다가,
     규칙을 다시 올리는 순간 넷이 한꺼번에 튀어나왔다.
     ★ 새 스냅숏은 rules-deploy.js 가 «살아 있는 콘솔»에서 직접 읽어 남긴 것이다 —
       규칙을 올릴 때마다 이 줄도 새 파일로 옮길 것. */
/* 기준은 «가장 최신» 콘솔 원문이다 — 날짜를 박아 두면 규칙을 올릴 때마다
   이 줄을 손으로 고쳐야 하고, 안 고치면 「콘솔에 안 올렸다」는 거짓 신호가 뜬다.
   scripts/rules-deploy.js 가 올린 뒤 새 원문을 남기므로 그것을 그대로 따라간다
   (CLAUDE.md 「기준은 docs/…-콘솔원문-YYYY-MM-DD.json 중 가장 최신 것」). */
const CONSOLE = (function () {
  const dir = path.join(R, 'docs');
  const fl = fs.readdirSync(dir).filter(function (f) { return /^firebase-rules-콘솔원문-\d{4}-\d{2}-\d{2}\.json$/.test(f); }).sort();
  assert.ok(fl.length, '콘솔 원문 스냅숏이 하나도 없다');
  return path.join(dir, fl[fl.length - 1]);
})();
const rules = JSON.parse(fs.readFileSync(PASTE, 'utf8')).rules;

/* ══════ ① 열린 것 — 이름표 ══════ */

test('★★ 직원이 사람 명단을 읽는다 — 못 읽으면 공유할 사람을 고를 수가 없다', () => {
  const r = rules.puphotos.owners['.read'];
  assert.ok(/auth != null/.test(r), '명단 읽기 조건이 없습니다.');
  assert.ok(!/isAdmin/.test(r),
    '★ 관리자만 읽으면 직원 화면의 「👥 공유」는 늘 「고를 사람이 없습니다」입니다.');
});

test('★ 저장 층도 직원을 막지 않는다 — 규칙만 열고 코드가 막으면 아무 일도 안 일어난다', () => {
  const fn = cutFn(store, 'function listOwners(');
  assert.ok(!/deps\.isAdmin/.test(fn),
    '★ 한쪽만 열면 규칙을 고쳐도 화면은 그대로 빈 목록을 받습니다.');
});

test('★ 명단은 내 칸만 쓴다 — 남의 이름을 바꿀 수는 없다', () => {
  const w = rules.puphotos.owners['$uid']['.write'];
  assert.ok(/auth\.uid === \$uid/.test(w),
    '★ 아무나 쓰면 남의 이름표를 바꿔 「누가 공유했는지」를 속일 수 있습니다.');
});

/* ══════ ② 안 열린 것 — 사진. 이쪽이 더 중요하다 ══════ */

test('★★ 남의 사진은 그대로 잠겨 있다 — 이름표를 열었다고 사진첩이 열리면 안 된다', () => {
  const r = rules.puphotos.u['$uid']['.read'];
  assert.ok(/auth\.uid === \$uid/.test(r) && /isAdmin/.test(r),
    '★ 사진 본체는 주인과 총괄관리자만입니다.');
  assert.ok(!/owners/.test(r),
    '★ 사진 읽기가 명단을 보면, 명단에 있는 사람 모두에게 사진첩이 열립니다.');
});

test('★★ 직원 고르개에는 «사람 줄»이 없다 — 넣으면 「남의 사진 보기」가 된다', () => {
  const fn = app.match(/function renderOwnerPick\(\)[\s\S]*?\n\}/)[0];
  const i = fn.indexOf('amAdmin()');
  const staff = fn.slice(0, i);          // 관리자 판정 «앞» = 직원도 지나는 자리
  assert.ok(i > 0, 'renderOwnerPick 을 찾지 못했습니다.');
  /* 직원 자리에서 고르개를 만드는 줄은 두 줄짜리 하나뿐이어야 한다 */
  const staffBranch = fn.slice(i, fn.indexOf('migAllowed = true'));
  assert.ok(!/ids\.map\(/.test(staffBranch),
    '★ 직원 고르개에 사람을 넣으면 눌러도 안 열리는 줄이 되고, 「왜 안 보이지」가 됩니다.');
  assert.ok(/SHARED_OWNER/.test(staffBranch), '「나와 공유된 사진」 줄은 있어야 합니다.');
  assert.ok(/watchShared\(\)/.test(staff), '받은 사진 세기는 직원도 지나야 합니다.');
});

test('★ 직원 자리에서도 이름표는 챙긴다 — 그것이 이번에 연 것이다', () => {
  const fn = app.match(/function renderOwnerPick\(\)[\s\S]*?\n\}/)[0];
  const staffBranch = fn.slice(fn.indexOf('amAdmin()'), fn.indexOf('migAllowed = true'));
  assert.ok(/listOwners\(\)/.test(staffBranch),
    '★ 이름표를 안 챙기면 규칙만 열어 두고 화면은 그대로 「고를 사람이 없습니다」입니다.');
  assert.ok(/ownerNames\[k\]/.test(staffBranch), '이름표를 담는 자리가 없습니다.');
});

/* ══════ ③ 붙여넣을 규칙이 «콘솔에서» 만들어졌는가 ══════
   ⚠ 2026-08-29 대조에서 드러났다 — 저장소 붙여넣기용 파일에는 콘솔에 있는 네 칸이
     **없었다**(rules_mgmt/index · scal_erpConsHold · scal_serverBackups ·
     scal_serverBackupsIndex). 그대로 붙여넣었으면 그 네 칸이 지워져 취업규칙 이력
     색인과 일정관리 백업이 통째로 막혔다. 콘솔이 진짜다. */

test('★★ 붙여넣을 파일이 콘솔에 있던 칸을 «하나도 안 지운다»', () => {
  assert.ok(fs.existsSync(CONSOLE), '콘솔 원문 기록이 없습니다 — 대조할 것이 없습니다.');
  const con = JSON.parse(fs.readFileSync(CONSOLE, 'utf8')).rules;
  const lost = Object.keys(con).filter(function (k) { return !rules[k]; });
  assert.deepEqual(lost, [],
    '★ 붙여넣으면 이 칸들이 «지워집니다»: ' + lost.join(', ') + '\n' +
    '  실시간DB 규칙은 통째로 갈아 끼우는 것이라, 빠진 칸은 사라집니다.\n' +
    '  붙여넣을 파일은 반드시 «콘솔 원문»에서 만드세요.');
});

test('★ 콘솔과 «한 곳도» 다르지 않다', () => {
  const con = JSON.parse(fs.readFileSync(CONSOLE, 'utf8')).rules;
  const diff = [];
  (function walk(a, b, p) {
    const keys = {};
    Object.keys(a || {}).forEach(function (k) { keys[k] = 1; });
    Object.keys(b || {}).forEach(function (k) { keys[k] = 1; });
    Object.keys(keys).forEach(function (k) {
      const av = a[k], bv = b[k], q = p + '/' + k;
      const obj = function (v) { return v && typeof v === 'object' && !Array.isArray(v); };
      if (obj(av) && obj(bv)) return walk(av, bv, q);
      if (JSON.stringify(av) !== JSON.stringify(bv)) diff.push(q);
    });
  })(con, rules, '');
  /* ⚠ 2026-08-29 — 콘솔 원문 스냅숏을 «진짜 콘솔»로 갈아 끼웠다(대표가 주신 것).
     그 전 스냅숏은 실제 콘솔이 아니었다 — 열여섯 칸이 다르고 backup_key 가 빠져 있었다.
     「콘솔이 진짜다」라고 말하면서 가짜와 대조하고 있었던 셈이다.
     지금 «일부러 다른 곳»은 아래 넷이다:
       exportLog·exportSeen — 반출 기록(대표가 방금 콘솔에 넣으셨다)
       pu_mailseen          — 메일 읽음 자리
       mailbox/.read        — 메일함을 재직 직원 전원에게 연 것(2026-08-27 결정) */
  /* ★ 2026-08-29 — 대표가 적용본을 콘솔에 «게시»했다. 이제 저장소와 콘솔이 같다.
     그래서 「일부러 다른 곳 몇 개」가 아니라 «한 곳도 다르지 않다»로 못 박았다 —
     규칙이 한 글자라도 어긋나면 그 자리에서 걸린다.
     ⚠ 규칙을 고칠 때는 «두 파일을 함께» 고친다:
       ① scripts/make-firebase-rules.js 를 고치고 적용본을 다시 만든다
       ② 콘솔에 붙여넣는다
       ③ docs/firebase-rules-콘솔원문-….json 을 그 내용으로 맞춘다
     ③을 빠뜨리면 이 검사가 걸린다 — 그것이 「콘솔에 아직 안 넣었다」는 신호다.

     ★ 2026-08-30 — 그 얼개가 «실제로 한 바퀴 돌았다».
     되전달(대표 지시 ㉮ 「다른 사람들끼리도 서로 공유를 쉽게」)로 puphotos 아래
     세 자리를 열었을 때 이 목록이 그 셋을 들고 걸려 주었고, 대표가 콘솔에 게시하신
     뒤 콘솔 원문을 2026-08-30 판으로 갈아 끼워 다시 비웠다.
     ⚠ 여기에 **아무거나 적어 넣지 말 것.** 목록이 비어 있지 않다는 것은 곧
       「콘솔에 아직 안 올라간 규칙이 있다」는 뜻이고, 이 자리 말고는 그것을
       알려 주는 곳이 없다. 채워서 넘기면 그 신호를 스스로 꺼 버리는 것이다. */
  /* ★ 2026-09-02 — 대표가 콘솔에 게시하셨다. 넷이 올라가 이 목록에서 빠졌다:
       /data/staff_colors · /data/cons_type_colors — 직원 색표 · 사업 색표
       /data/ledger_batches — 거래내역 묶음(재무권한자만)
       /puphotos/access_log — 사진첩 열람 기록(총괄관리자만 읽고, 아무도 못 쓴다)
     콘솔 원문 파일을 2026-09-02 판으로 갈아 끼웠다.
     ⚠ 아래 둘은 **게시 뒤에 새로 생긴 것**이라 아직 남아 있다. 「넷을 게시하셨으니
       목록을 통째로 비운다」로 가면 안 된다 — 그 순간 이 둘이 신호에서 사라진다. */
  /* ★ 2026-09-02(두 번째) — 대표가 «다시» 게시하셨다. 이제 저장소와 콘솔이 한 곳도 다르지 않다.
     이번에 올라간 둘:
       /newsletter  — 뉴스레터 설정·초안·받는 명단(총괄관리자만).
                      전에는 이름 없는 자리($other)로 떨어져 전 직원이 읽고 썼다 —
                      거래처 담당자 이름·이메일이 든 명단이라 이번에 좁혀졌다.
       /kcareer_pub — 경력관리 직원 공개용 사본(읽기 재직 직원 / 쓰기 관리자만).
                      ⚠ 대표 칸(kcareer/{uid})은 그대로 본인만 — 그 칸에는 실적·비용·
                        개인정보·신분증이 함께 있어 통째로 열면 경력관리만 보여 줄 수 없다.

     ⚠ 이 목록이 «비어 있는 것»이 정상이다. 비어 있지 않다는 것은 곧 「콘솔에 아직 안
       올라간 규칙이 있다」는 뜻이고, 이 자리 말고는 그것을 알려 주는 곳이 없다.
       규칙을 고칠 때는 세 걸음을 함께 밟는다:
         ① scripts/make-firebase-rules.js 를 고치고 적용본·붙여넣기용을 다시 만든다
         ② 콘솔에 붙여넣고 게시한다
         ③ 콘솔 원문 파일을 그 내용으로 맞추고 이 목록을 비운다
       ②를 아직 안 했으면 그 자리를 여기 적어 둔다 — 그것이 유일한 신호다. */
  /* ★ 2026-09-05 — 기다리던 셋이 «함께» 올라갔다.
     뉴스레터 화면이 받아 둔 노무사회 자료를 못 읽어(permission_denied at /ilabor/items)
     /ilabor 규칙을 넣고 `node scripts/rules-deploy.js --deploy` 를 돌렸는데,
     규칙은 «통째로» 갈아 끼우는 것이라 그때까지 기다리던 셋도 같이 게시됐다:

       /kcareer_inbox  경력관리 받은 함 — 읽기는 대표(전부)와 본인 자리만,
                       쓰기는 재직 직원이 «자기 자리에 더하기»만
       /data/co_no_seq 업체 고유번호 번호통 — 재직 직원이 뽑아 가되 «뒤로 못 간다»
       /ontology       파생 관계망 — internal·source 는 재직 직원,
                       personal·financial 은 «관리자만»

     ★ 셋 다 «좁아졌다». 그 전에는 이름 없는 자리($other)로 떨어져 재직 직원
       누구나 읽고 썼다 — 넓어진 칸은 하나도 없다.
     ⚠ 그래도 «곁다리로 올라간 것»이다. 다음부터도 규칙을 올릴 때는 기다리던 것이
       무엇인지 먼저 보고, 올라간 뒤에는 여기에 적을 것.

     ⚠ 이 목록이 «비어 있는 것»이 정상이다. 비어 있지 않다는 것은 곧 「콘솔에 아직
       안 올라간 규칙이 있다」는 뜻이고, 이 자리 말고는 그것을 알려 주는 곳이 없다.
       채워서 넘기면 그 신호를 스스로 꺼 버리는 것이다. */
  /* ★ 2026-09-07 — /rules_mgmt/casebook 이 올라갔다. 콘솔 원문을 2026-09-07 판으로 갈았다.
       읽기는 재직 직원 전체 — 보관함(내 것 + 남의 완료본)보다 «넓다».
       사례집이 목적이라 설계서 §6 이 그렇게 정했고, 그래서 올리는 화면에
       「직원 전체가 볼 수 있습니다」를 적었다(tests/rules-casebook-* 가 지킨다).

     ⚠ 이번엔 «사람이 폰으로» 붙여넣었다 — 이 방의 통신 정책이 auth.firebase.tools 와
       *.firebaseio.com 을 막아 firebase CLI 가 안 돌았다. 그래서 자동 배포 대신
       ① 붙여넣을 글을 드리고 ② 게시하신 뒤 콘솔 내용을 되받아 ③ 기계로 견줬다.
       세 가지로 견줘 전부 같았다: 글자 그대로 · 뜻(58칸) · 규칙 문장 낱개(427개).
     ★ 이 길은 «임시»다. 통신이 열리면 scripts/rules-deploy.js 가 살아 있는 콘솔을
       직접 읽어 견주므로, 사람이 옮겨 적는 자리가 아예 없어진다. */
  /* ★ 2026-09-07(두 번째) — 서고 회차의 서류에 «제출 정보» 칸이 붙어 기다린다.
       /rules_mgmt/casebook/rev/$site/$rev/docs/$role/sub
         at(언제) · no(접수번호) · office(어디에) · n(몇 명) · nAll(전체 몇 중)
     ★ 왜 생겼나 — 대표 물음 「단순 보관은 의미가 없을 것 같은데」.
       제출 서류(신고서·의견청취·동의서)는 대개 스캔이라 본문이 없다. 그런데 거기서
       정작 필요한 것은 「언제·어느 노동청에·몇 명 동의로」이고, 그건 도장과 손글씨라
       OCR 이 못 읽는다. 그래서 OCR 을 붙이는 대신 «사람이 몇 줄 적게» 했다.
     ⚠ 이 칸이 콘솔에 올라가기 전까지 제출 정보를 적으면 permission_denied 로 막힌다
       (다른 자리는 멀쩡하다 — 새 칸 하나가 늘어난 것뿐이다).
     ⚠ 새로 넓어진 권한은 «없다» — 읽기는 서고와 같고, 쓰기는 이미 있던
       revWrite(올린 사람 또는 관리자) 그대로다. */
  /* ★ 2026-09-08 — 서고에 «글자 읽기(OCR)» 층이 붙어 기다린다(대표 결정 2026-09-07 ㉢
       「읽혀 검색에 걸리게」). 스캔뿐이라 검색에 안 걸리던 옛 회차를 브라우저 안에서
       읽어 «추정 본문»으로 담는다.
         /rules_mgmt/casebook/ocr                       — 추정 본문 층(원문 층과 «딴 자리»)
         …/rev/$site/$rev/docs/$role/{ocr,ocrN,ocrAt}   — 「읽어냈다」는 딱지 셋

     ⚠⚠ 이번엔 넓어진 권한이 «있다» — 딱지 셋과 ocr 층의 «쓰기»가 재직 직원 누구나다.
       까닭: 서고는 사례집이라 남의 사업장 회차를 다 같이 보는데, 회차를 담은 사람만
       읽을 수 있으면 옛 담당자가 퇴사한 회차는 영영 못 읽는다.
       ★ 넓힌 것은 딱 그것뿐이다 — 이름·해시·원본 자리(name·sha·path)와 noText 는
         그대로 임자만 쓴다(tests/rules-casebook-ocr.test.js 가 기계로 지킨다).
       ★ «읽기»는 한 칸도 안 넓혔다 — 서고 읽기와 같다(재직 직원 전체).
     ⚠ 이 칸이 콘솔에 올라가기 전까지 [🔍 글자 읽기]는 permission_denied 로 막힌다
       (다른 자리는 멀쩡하다 — 새 칸이 늘어난 것뿐이다). */
  const PENDING = ['/rules_mgmt/casebook/rev/$site/$rev/docs/$role/sub',
                   '/rules_mgmt/casebook/ocr',
                   '/rules_mgmt/casebook/rev/$site/$rev/docs/$role/ocr',
                   '/rules_mgmt/casebook/rev/$site/$rev/docs/$role/ocrN',
                   '/rules_mgmt/casebook/rev/$site/$rev/docs/$role/ocrAt',
  /* ★ 2026-09-08 — ⑤ 판독을 몇 번 불렀나(앱별 셈)가 기다린다.
       /ai_read_tally/{한국날짜}/{앱}/{n,quota}
     ★ 왜 생겼나 — 대표 물음 「판독 한도 어떻게 해결할까」. 세는 곳이 «아예 없어»
       「사진첩이 다 썼나 경력관리가 다 썼나」를 알 수 없었다. 열쇠 하나를 넷이
       나눠 쓰는데 어디가 태우는지 모르면 어디를 손볼지도 모른다.
     ⚠ 담기는 것은 «숫자뿐»이다 — 사진·글·사람 이름은 한 글자도 없다.
       그래서 읽기를 재직 직원 전체에 열었다(화면이 「오늘 판독 203번」을 보여 준다).
     ⚠ 쓰기는 «아무도 못 한다»(false). 서버는 관리자 SDK 로 돌아 규칙을 지나간다 —
       브라우저가 숫자를 부풀려 「많이 썼다」로 꾸미지 못하게 막은 것이다.
     ⚠ 올라가기 전까지 화면의 셈 줄은 «안 뜬다»(읽기가 막혀 조용히 넘어간다).
       판독 자체는 멀쩡하다 — 세는 것만 안 될 뿐이다. */
                   '/ai_read_tally'];
  assert.deepEqual(diff.sort(), PENDING.sort(),
    '★ 뜻하지 않은 곳이 바뀌었습니다: ' + diff.join(', ') +
     '\n  규칙은 한 번에 통째로 바뀝니다 — 곁다리 변경이 섞이면 무엇이 깨졌는지 못 짚습니다.');
});
