/* 기금 결산 검사 3종을 CI 에서 돌린다.
   실행: node --test tests/*.test.js

   그동안 이 검사들은 «사람이 손으로 돌릴 때만» 돌았다. 그래서
   조용히 꺼진 채 main 에 올라간 적이 있다 — 샌드박스에 이름 하나(bfMovesOf)가
   빠져 결산 회귀 167건이 첫 호출에서 죽었는데, 아무도 몰랐다.
   여기 걸어 두면 그런 일이 더는 조용할 수 없다.

   세 검사가 보는 것이 다르다:
     check_fund    화면·엑셀·서식의 배선(문자열·구조)
     check_closing 결산 엔진 — 확정 결산서 16건의 현금·준비금·자산총계
     check_stmt    제출본 대조 — 실제로 낸 결산서의 재무제표 «줄»

   셋 다 1초 안에 끝난다(합쳐 1.1초). */
const { test } = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

const ROOT = path.resolve(__dirname, '..');
const TOOLS = path.join(ROOT, 'fund-erp', 'tools');

const CHECKS = [
  ['check_fund.js', '화면·엑셀·서식 배선'],
  ['check_closing.js', '결산 엔진 회귀(확정 결산서)'],
  ['check_stmt.js', '제출본 대조(재무제표 줄)'],
  /* 통장 한 줄을 쪼갠 분개가 표마다 계정별로 갈라지나 —
     합계만 보는 검사로는 «첫 조각에 전액이 몰린 것»을 못 잡는다. */
  ['check_split.js', '분할 분개가 계정별로 갈라지는가'],
  /* 재무제표·주석이 «무엇을 적는가» — 잡수익을 이자수익이라 적거나,
     전기 잉여가 결손금 칸에 앉거나, 주석 소재지가 늘 「—」 이던 것들. */
  ['check_notes.js', '재무제표·주석의 값과 이름'],
  /* 스캔 PDF 는 «두 번» 읽어야 한다(글자 찾기 → 없으면 OCR). 그런데 pdf.js 가
     건네받은 버퍼를 워커로 넘겨줘 원본이 무효가 되는 바람에 둘째 읽기가 늘 터졌다 —
     고유번호증·등기부처럼 스캔으로만 오는 서류는 한 번도 판독되지 않았다. */
  ['check_pdfbuf.js', '스캔 PDF 를 두 번 읽을 수 있는가'],
  /* 기금이 44개라 목록을 내리면 묶음 고르기와 칸 이름이 화면 밖으로 나갔다.
     표 머리줄은 감싼 상자가 스크롤 상자면 안 붙는다 — 넘칠 때만 스크롤을 켠다. */
  ['check_sticky.js', '목록 머리줄이 틀 고정되는가'],
  /* 묶음(충남·경기)마다 표를 따로 만들어, 폭을 안 정하면 열이 어긋난 채 위아래로 놓인다. */
  ['check_cols.js', '묶음 사이 열이 맞는가'],
  /* 명부의 머리와 몸통을 따로 적는 구조라, 한쪽만 칸을 옮기면 값이 한 칸씩 밀린다. */
  ['check_siterow.js', '참여사업장 명부 칸이 제자리인가'],
  /* 신청액은 지어낼 값이 아니다 — 실제 제출본은 「참여사 출연금 + 지자체 출연금」과 맞는다. */
  ['check_pull.js', '신청액을 출연금에서 당겨오는가'],
  /* 값이 어디서 왔는지 되짚으려면 원본을 봐야 한다 — 붙어 있는데도 누르면
     다시 고르기가 열려, 넣어 둔 서류를 확인할 길이 사실상 없었다. */
  ['check_docview.js', '넣어 둔 서류를 눌러서 보는가'],
  /* 직접 올린 서류가 아무 데도 안 남으면 값을 되짚지 못한다. */
  ['check_keepdoc.js', '직접 올린 서류가 남는가'],
  /* 제출서류에서 [서식]을 누르면 화면을 안 떠나고 오른쪽에서 채운다. */
  ['check_subside.js', '제출서류에서 바로 채우는가'],
  /* 엑셀 서식이 «보이는 대로» 그려지는가, 그리고 채운 파일에 «남의 자료»가 안 남는가.
     원본 양식의 수식 칸에는 앞서 이 양식으로 만든 남의 기금 값이 캐시로 박혀 있다. */
  ['check_xlsview.js', '엑셀 보기·채움이 남의 자료를 안 남기는가'],
  /* 한 사업장에 사람이 셋 나온다 — 대표자·담당자·근로자대표. 셋이 다 다른 경우가 많고,
     근로자대표는 별지 제7호 첨부서류 2번(재직증명서)으로 소속을 확인해야 한다. */
  ['check_wrep.js', '참여사업장 근로자대표와 재직증명서'],
  /* 근로복지넷은 사람이 직접 로그인해 값을 친다 — 앱은 옮겨 적는 일만 돕는다.
     [복사] 단추의 번호가 줄과 어긋나면 화면엔 맞는 값이 보이는데 엉뚱한 값이 복사된다. */
  ['check_helper.js', '근로복지넷 입력 도우미가 값을 맞게 세우는가'],
  /* 별지 제7호의 설립준비위원회 위원 — 서식마다 «다른 곳»을 보고 있어 늘 비어 있었다.
     임원 명부 한 곳으로 모으고, 참여사업장에서 골라 넣는다. */
  ['check_committee.js', '설립준비위원회 위원이 명부 한 곳에서 오는가'],
  /* 설립 서식 18종을 «자료가 다 있는 기금»으로 그려 보고 남은 빈 자리 52개 가운데,
     «자료는 있는데 배선이 없던» 자리를 이었다. 값이 없으면 지어내지 않는다. */
  ['check_derived.js', '설립 서식의 줄글 속 빈 자리가 채워지는가'],
];
/* pii_scan 은 통과 문구가 다르고(«✓ 전 서식 깨끗함»), 무엇보다
   «서식 템플릿에 남의 개인정보가 없는가»를 본다 — 공개 배포되는 파일이라 이게 제일 급하다.
   예전엔 이 검사가 다른 폴더를 보고 있어, 깨끗하다고 하는 동안 실명·집주소·계좌번호가 남아 있었다. */
const PII = ['pii_scan.js', '서식에 남의 개인정보가 없는가'];

/* 서식을 «진짜로 그려» 보는 검사. 문자열만 보는 검사는 «차례가 바뀐 것»을 못 잡는다 —
   실제로 stripBaked 를 나중에 넣으며 지원신청서 금액·신청일이 조용히 비었다.
   jsdom 이 있어야 돌고, 없으면 SKIP 이라 말한다(조용히 통과하지 않는다). */
const FORMS = ['check_forms.js', '서식이 정말 채워지는가'];

/* 전체 백업을 사이드바 메뉴에서 상단 ⚙ 로 옮겼다 — 단추만 있고
   창이 안 뜨는 것을 문자열 검사로는 못 잡는다. FORMS와 같은 이유로
   jsdom 이 있어야 돌고, 없으면 SKIP 이라 말한다(조용히 통과하지 않는다). */
const BACKUP = ['check_backup.js', '백업·복구 창이 정말 열리는가'];

for (const [file, what] of CHECKS) {
  test('기금 결산 검사 — ' + what + ' (' + file + ')', () => {
    const p = path.join(TOOLS, file);
    assert.ok(fs.existsSync(p), file + ' 이 없습니다');
    const r = spawnSync(process.execPath, [p], {
      cwd: ROOT, encoding: 'utf8', timeout: 120000,
    });
    const out = (r.stdout || '') + (r.stderr || '');
    /* SKIP 도 «통과»로 본다 — 다만 무엇을 건너뛰었는지 화면에 남는다.
       (아래 FORMS·BACKUP 이 쓰던 관례를 여기로 올렸다.)
       ⚠ 2026-09-06: jsdom 을 쓰는 검사기 둘이 새로 들어왔는데 그 관례를 안 따라
         require 에서 죽었고, 「열이 어긋났다」가 아니라 «검사기를 못 돌렸다»는 뜻인데도
         main 이 통째로 빨강이 되어 배포가 멎었다. 검사기 쪽도 함께 고쳤다.
       ★ 관례를 안 쓰는 검사기는 SKIP 을 찍지 않으니, 여기 한 줄이 그것들을 무르게 하지 않는다. */
    if (/^SKIP:/m.test(out)) { console.log('  ' + out.trim().split(/\r?\n/)[0]); return; }
    /* 종료 코드만 보면 안 된다 — 검사가 «첫 호출에서 죽어도» 0 이 아닌 값이
       안 나오는 길이 있었다. 통과 문구가 실제로 찍혔는지 함께 본다. */
    assert.ok(/ALL PASS/.test(out),
      file + ' 이 통과 문구를 남기지 않았습니다:\n' + out.slice(-2000));
    assert.strictEqual(r.status, 0, file + ' 실패:\n' + out.slice(-2000));
  });
}

/* ★★ 2026-09-06 에 이것 때문에 저장소 전체 배포가 멎었다.
   check_docview.js 가 jsdom 을 그냥 require 해서, jsdom 이 없는 곳에서
   「모듈이 없다」로 죽었다 — 기금 화면은 멀쩡한데 «업체관리·급여·명함첩까지»
   함께 배포가 막혔다. 위의 SKIP 관례를 안 따른 검사기가 하나만 들어와도
   같은 일이 되풀이되므로, 관례 자체를 여기서 기계로 지킨다.
   ⚠ 검사기가 늘어도 알아서 따라간다 — 이름을 손으로 적지 않는다. */
test('★★ jsdom 을 쓰는 검사기는 «없을 때 SKIP» 을 갖춘다 — 없으면 전 앱 배포가 멎는다', () => {
  const 본것 = [];
  for (const [file] of CHECKS.concat([FORMS, BACKUP])) {
    const p = path.join(TOOLS, file);
    if (!fs.existsSync(p)) continue;
    const s = fs.readFileSync(p, 'utf8');
    if (!/require\(['"]jsdom['"]\)/.test(s)) continue;   /* jsdom 을 안 쓰면 상관없다 */
    본것.push(file);
    assert.match(s, /try\s*\{[^}]*require\(['"]jsdom['"]\)/,
      '★★ ' + file + ' 이 jsdom 을 그대로 require 합니다. jsdom 이 없는 곳에서 '
      + '이 한 줄이 저장소의 «모든 앱» 배포를 막습니다 — check_backup.js 처럼 '
      + 'try/catch 로 감싸고 SKIP: 을 찍으십시오');
    assert.match(s, /console\.log\(\s*['"]SKIP:/,
      '★★ ' + file + ' 이 건너뛸 때 «건너뛰었다»고 말하지 않습니다 — '
      + '조용히 통과하면 검사가 꺼진 줄도 모릅니다');
  }
  assert.ok(본것.length >= 1,
    '★ jsdom 을 쓰는 검사기를 하나도 못 찾았습니다 — 찾는 방식이 낡았는지 보십시오');
});

test('기금 서식 검사 — ' + PII[1] + ' (' + PII[0] + ')', () => {
  const p = path.join(TOOLS, PII[0]);
  assert.ok(fs.existsSync(p), PII[0] + ' 이 없습니다');
  const r = spawnSync(process.execPath, [p], { cwd: ROOT, encoding: 'utf8', timeout: 120000 });
  const out = (r.stdout || '') + (r.stderr || '');
  assert.ok(/전 서식 깨끗함/.test(out),
    '서식 템플릿에 남의 개인정보가 남아 있습니다:\n' + out.slice(-2000));
  assert.strictEqual(r.status, 0, PII[0] + ' 실패:\n' + out.slice(-2000));
});

test('기금 서식 검사 — ' + FORMS[1] + ' (' + FORMS[0] + ')', () => {
  const p = path.join(TOOLS, FORMS[0]);
  assert.ok(fs.existsSync(p), FORMS[0] + ' 이 없습니다');
  const r = spawnSync(process.execPath, [p], { cwd: ROOT, encoding: 'utf8', timeout: 120000 });
  const out = (r.stdout || '') + (r.stderr || '');
  // SKIP 도 «통과»로 본다 — 다만 무엇을 건너뛰었는지 화면에 남는다
  if (/^SKIP:/m.test(out)) { console.log('  ' + out.trim().split(/\r?\n/)[0]); return; }
  assert.ok(/ALL PASS/.test(out), '서식이 제대로 안 채워집니다:\n' + out.slice(-2500));
  assert.strictEqual(r.status, 0, FORMS[0] + ' 실패:\n' + out.slice(-2500));
});

test('기금 결산 검사 — ' + BACKUP[1] + ' (' + BACKUP[0] + ')', () => {
  const p = path.join(TOOLS, BACKUP[0]);
  assert.ok(fs.existsSync(p), BACKUP[0] + ' 이 없습니다');
  const r = spawnSync(process.execPath, [p], { cwd: ROOT, encoding: 'utf8', timeout: 120000 });
  const out = (r.stdout || '') + (r.stderr || '');
  if (/^SKIP:/m.test(out)) { console.log('  ' + out.trim().split(/\r?\n/)[0]); return; }
  assert.ok(/ALL PASS/.test(out), '백업·복구 창이 제대로 안 열립니다:\n' + out.slice(-2500));
  assert.strictEqual(r.status, 0, BACKUP[0] + ' 실패:\n' + out.slice(-2500));
});

/* 검사가 «몇 건을 돌았는지»도 못 박는다.
   건수가 확 줄면 검사가 조용히 꺼진 것이다 — 통과 문구만으로는 못 잡는다.
   숫자를 늘리는 것은 자유다. 줄이려면 왜 줄였는지 여기 적고 줄여야 한다. */
const FLOOR = { 'check_fund.js': 400, 'check_closing.js': 160, 'check_stmt.js': 100 };
for (const [file, min] of Object.entries(FLOOR)) {
  test('기금 결산 검사가 꺼지지 않았다 — ' + file + ' ≥ ' + min + '건', () => {
    const r = spawnSync(process.execPath, [path.join(TOOLS, file)], {
      cwd: ROOT, encoding: 'utf8', timeout: 120000,
    });
    const m = /ALL PASS \((\d+)/.exec((r.stdout || '') + (r.stderr || ''));
    assert.ok(m, file + ' 에서 건수를 못 읽었습니다');
    assert.ok(Number(m[1]) >= min,
      file + ' 이 ' + m[1] + '건만 돌았습니다(최소 ' + min + '건). 검사가 꺼졌는지 보세요.');
  });
}
