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
const CONSOLE = path.join(R, 'docs', 'firebase-rules-콘솔원문-2026-09-02.json');
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
  /* ⏳ 2026-09-03 — 경력관리 「받은 함」:
       /kcareer_inbox — 직원이 PDF 위촉장을 올려 «등록 신청»을 하는 자리.
       읽기는 대표(전부)와 본인 자리만, 쓰기는 재직 직원이 «자기 자리에 더하기»만
       (지우는 것은 관리자만 — 지울 수 있으면 「난 올렸다」를 다툴 수 없다).
       ⚠ 지금 콘솔에서는 이 자리가 없어 이름 없는 자리로 떨어진다 — 게시하면 좁혀진다.
     ⚠ 대표가 콘솔에 게시하시면 콘솔 원문 파일을 그 내용으로 갈아 끼우고 이 줄을 «지운다».
       안 지우면 다음에 규칙이 어긋났을 때 이 검사가 그것을 못 알려 준다. */
  /* ⏳ 2026-09-03 — 업체 고유번호 번호통:
       /data/co_no_seq — 업체를 만드는 사람이 다음 번호를 «뽑아» 가는 자리.
       읽기·쓰기는 재직 직원(업체를 만들 때 뽑아야 한다), 다만 «지금보다 큰 수»만 받는다.
       ⚠ 번호가 뒤로 가면 지난 서류가 가리키던 번호가 다른 업체에 붙는다 —
         되돌릴 수 없는 사고라서 코드가 아니라 «규칙»으로 막는다.
       ⚠ 지금 콘솔에는 이 자리가 없어 이름 없는 자리로 떨어진다 — 게시하면 좁혀지고
         「뒤로 못 감」이 켜진다. 그때까지 부여를 돌리면 겹칠 위험이 남는다.
     ⚠ 대표가 게시하시면 콘솔 원문 파일을 갈아 끼우고 이 줄을 «지운다». */
  /* ⏳ 2026-09-04 — 파생 관계망(온톨로지 6단계 ㉡):
       /ontology — 확정 관계망을 올려 다른 프로그램이 읽게 하는 자리.
       칸을 권한으로 가른다 — internal·source 는 재직 직원, **personal·financial 은
       관리자만**. 쓰기는 어느 칸이든 관리자만.
       ⚠ 지금 콘솔에는 이 자리가 없어 이름 없는 자리로 떨어진다 —
         즉 **올리면 직원 전원이 사람·재무 관계를 읽는다.** 게시 전에는
         검증센터의 「☁ 관계망 올리기」를 쓰지 말 것.
       ⚠ 이 방(원격)에는 firebase CLI 가 없어 자동 배포를 못 했다.
         대표 PC 에서 `node scripts/rules-deploy.js --deploy` 를 돌리면
         살아 있는 콘솔과 견주는 안전장치까지 함께 돈다 — 그 길이 낫다.
     ⚠ 게시하시면 콘솔 원문 파일을 갈아 끼우고 이 줄을 «지운다». */
  const PENDING = ['/kcareer_inbox', '/data/co_no_seq', '/ontology'];
  assert.deepEqual(diff.sort(), PENDING.sort(),
    '★ 뜻하지 않은 곳이 바뀌었습니다: ' + diff.join(', ') +
     '\n  규칙은 한 번에 통째로 바뀝니다 — 곁다리 변경이 섞이면 무엇이 깨졌는지 못 짚습니다.');
});
