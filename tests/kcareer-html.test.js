'use strict';
// kcareer.html 정적 검사 — 실행: node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'kcareer.html'), 'utf8');

test('인라인 스크립트가 문법 오류 없이 파싱된다', () => {
  // 단일 파일 앱이라 문법 오류 하나로 앱 전체가 뜨지 않는다. 실행하지 않고 파싱만 검사한다.
  const blocks = [...source.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)];
  assert.ok(blocks.length > 0, '인라인 스크립트를 찾을 수 없습니다');
  blocks.forEach((m, i) => {
    const code = m[1];
    if (!code.trim()) return;
    assert.doesNotThrow(
      () => new vm.Script(code, { filename: 'kcareer.html:inline-' + i }),
      '인라인 스크립트 ' + i + '번에 문법 오류가 있습니다'
    );
  });
});

test('판정 모듈을 외부 파일로 로드한다', () => {
  assert.match(source, /<script src="js\/kcareer-scan\.js"><\/script>/);
});

test('서류 폴더는 읽기 전용으로만 연다 — readwrite 요청이 없어야 한다', () => {
  assert.ok(!/mode:\s*'readwrite'/.test(source), '원본 폴더에 쓰기 권한을 요청하면 안 됩니다');
  assert.ok(!/createWritable/.test(source), '원본 파일에 쓰기를 시도하면 안 됩니다');
  assert.ok(!/removeEntry/.test(source), '원본 파일을 삭제하면 안 됩니다');
});

test('폴더 연결 함수가 있다', () => {
  assert.match(source, /function fsSupported\(\)/);
  assert.match(source, /async function fsConnectFolder\(\)/);
  assert.match(source, /async function fsRoot\(\)/);
});

test('폴더 연결 UI는 환경설정이 숨겨진 계정에서도 닿는 곳에 있다', () => {
  // 환경설정(page-settings)은 applyPerfAccess가 비관리자에게 숨긴다.
  // 그래서 항상 보이는 위촉장 페이지의 '⋯ 더보기'에도 같은 버튼이 있어야 한다.
  const wiccok = source.slice(
    source.indexOf('<section class="page-view" id="page-wiccok"'),
    source.indexOf('<div class="dt" data-tbl="wiccok">')
  );
  assert.ok(wiccok.length > 0, '위촉장 페이지 마크업을 찾을 수 없습니다');
  assert.match(wiccok, /onclick="fsConnectFolder\(\)"/);
  assert.match(wiccok, /onclick="openScanPreview\(\)"/);
  assert.match(wiccok, /onclick="fsUndoLast\(\)"/);
});

test('권한 판별은 uid_roles를 먼저 본다', () => {
  const src = funcSource('resolveMe');
  const iRoles = src.indexOf("uid_roles/");
  const iDir = src.indexOf("data/user_dir");
  assert.ok(iRoles >= 0, 'uid_roles를 읽어야 합니다');
  assert.ok(iRoles < iDir, 'uid_roles를 이메일 규칙 조회보다 먼저 봐야 합니다');
  assert.match(src, /roles\.isAdmin===true/);
});

test('신원을 못 알아내면 잠그지 않고 전체표시로 둔다', () => {
  const src = funcSource('resolveMe');
  // 예전 코드는 매칭 실패 시 isAdmin:false로 잠가 대표가 환경설정에서 밀려났다
  assert.ok(!/role:'member',isAdmin:false\}/.test(src.replace(/\s/g, '')) ||
            /isAdmin:true\}/.test(src.replace(/\s/g, '')),
    '매칭 실패 시 관리자로 두어야 합니다');
  const tail = src.slice(src.lastIndexOf('} else {'));
  assert.match(tail, /isAdmin:\s*true/);
});

test('원본 보호 토글도 환경설정 밖에서 닿는다', () => {
  const wiccok = source.slice(
    source.indexOf('<section class="page-view" id="page-wiccok"'),
    source.indexOf('<div class="dt" data-tbl="wiccok">')
  );
  assert.match(wiccok, /onclick="toggleOrigLock\(\)"/);
  assert.match(source, /function toggleOrigLock\(\)/);
  assert.match(source, /function refreshOrigLockBtns\(\)/);
});

test('닿을 수 없는 환경설정으로 안내하지 않는다', () => {
  // 환경설정은 applyPerfAccess가 비관리자에게 숨긴다. 그 안으로 보내면 막다른 길이 된다.
  assert.ok(!/원본 보호가 켜져 있습니다 — 환경설정/.test(source),
    '원본 보호 안내가 환경설정을 가리키면 안 됩니다');
  assert.ok(!/환경설정 › 데이터 관리에서 서류 폴더를 연결/.test(source),
    '폴더 연결 안내가 환경설정을 가리키면 안 됩니다');
});

test('미지원 브라우저 숨김은 클래스로 두 위치를 한 번에 처리한다', () => {
  assert.match(source, /document\.querySelectorAll\('\.fs-ui'\)/);
  // id 기반 숨김이 남아 있으면 한쪽만 숨겨져 버린다
  assert.ok(!/\['btnFsConnect','btnFsScan','btnFsUndo'\]/.test(source));
});

test('스캔은 파일 내용을 읽지 않는다 — 스캔 함수에 arrayBuffer 사용이 없어야 한다', () => {
  const m = source.match(/async function fsScanAll\([\s\S]*?\n\}/);
  assert.ok(m, 'fsScanAll 함수가 있어야 합니다');
  assert.ok(!/arrayBuffer|FileReader|abToB64/.test(m[0]),
    '스캔 단계에서 파일 내용을 읽으면 OneDrive 클라우드 파일이 전부 내려옵니다');
});

test('미리보기는 저장하지 않는다 — openScanPreview 안에 set( 호출이 없어야 한다', () => {
  const m = source.match(/async function openScanPreview\([\s\S]*?\n\}/);
  assert.ok(m, 'openScanPreview 함수가 있어야 합니다');
  assert.ok(!/\bset\(/.test(m[0]), '미리보기 단계에서 스토어에 저장하면 안 됩니다');
});

test('스캔 과정에서 OCR API를 호출하지 않는다', () => {
  const m = source.match(/async function fsScanAll\([\s\S]*?\n\}/);
  assert.ok(m, 'fsScanAll 함수가 있어야 합니다');
  assert.ok(!/anthropic|googleapis|_geminiOCR/.test(m[0]));
});

function funcSource(name) {
  const m = source.match(new RegExp('function ' + name + '\\([\\s\\S]*?\\n\\}'));
  assert.ok(m, name + ' 함수가 있어야 합니다');
  return m[0];
}

test('fsCommitScan은 신규 필드를 붙여 저장한다', () => {
  const src = funcSource('fsCommitScan');
  assert.match(src, /src:\s*'fs'/);
  assert.match(src, /relPath/);
  assert.match(src, /scanId/);
});

test('fsCommitScan은 스토어별로 한 번만 쓴다 — 레코드마다 set을 부르지 않는다', () => {
  const src = funcSource('fsCommitScan');
  // 레코드 반복문 안에서 set()을 부르면 수백 번 재저장 + Firebase 반복 푸시가 된다
  ['r.promotions.forEach', 'picked.forEach', 'r.submissions.forEach'].forEach((head) => {
    const i = src.indexOf(head);
    assert.ok(i >= 0, head + ' 반복문이 있어야 합니다');
    const end = src.indexOf('\n  });', i);
    assert.ok(end > i, head + ' 반복문의 끝을 찾을 수 없습니다');
    const block = src.slice(i, end);
    assert.ok(!/\bset\(/.test(block), head + ' 안에서 set()을 부르면 안 됩니다');
  });
  // 저장은 스토어 목록을 도는 단 한 곳에서만 일어난다
  assert.match(src, /\['wiccok','cert','certdoc','submission'\]\.forEach\(function\s*\(k\)\s*\{\s*set\(k, buf\[k\]\);/);
});

test('hasOriginal은 fs 레코드와 기존 base64 레코드를 모두 처리한다', () => {
  const ctx = { fileExists: (id) => id === 'HAS' };
  vm.runInNewContext(funcSource('hasOriginal'), ctx);
  assert.equal(ctx.hasOriginal({ src: 'fs', relPath: '1. 위촉장/a.pdf' }), true);
  assert.equal(ctx.hasOriginal({ src: 'fs', relPath: '' }), false);
  assert.equal(ctx.hasOriginal({ id: 'HAS' }), true);          // 기존 레코드(src 없음)
  assert.equal(ctx.hasOriginal({ id: 'NOPE' }), false);
  assert.equal(ctx.hasOriginal(null), false);
});

test('matchByFilename은 fs 원본이 붙은 레코드도 이미 첨부된 것으로 본다', () => {
  // fileExists는 base64만 보므로 fs 레코드에 두 번째 파일이 붙어버린다
  const src = funcSource('matchByFilename');
  assert.match(src, /hasOriginal\(r\)/);
  assert.ok(!/fileExists\(r\.id\)/.test(src));
});

test('fsFindAttachTarget은 원본 없는 기존 레코드만 돌려준다', () => {
  const buf = {
    wiccok: [
      { id: 'W1', type: '위촉장', org: '충청남도', year: '2025' },        // 원본 없음 → 대상
      { id: 'W2', type: '위촉장', org: '충청남도', year: '2025', src: 'fs', relPath: 'x/y.pdf' } // 이미 있음
    ]
  };
  const ctx = {
    // 첫 인자 이름으로 골라주는 최소 스텁
    matchByFilename: (file, db) => db.find((r) => file.name.includes(r.org)) || null,
    hasOriginal: (r) => (r.src === 'fs' ? !!r.relPath : false)
  };
  vm.runInNewContext(funcSource('fsFindAttachTarget'), ctx);

  const hit = ctx.fsFindAttachTarget({ store: 'wiccok', type: '위촉장', name: '2025 충청남도 위촉장.pdf' }, buf);
  assert.ok(hit, '원본 없는 레코드를 찾아야 합니다');
  assert.equal(hit.id, 'W1');
  assert.ok(hit === buf.wiccok[0], '사본이 아니라 버퍼 안의 원래 객체를 돌려줘야 붙일 수 있습니다');

  // 이미 원본이 있는 레코드만 남으면 null
  const buf2 = { wiccok: [buf.wiccok[1]] };
  assert.equal(ctx.fsFindAttachTarget({ store: 'wiccok', type: '위촉장', name: '2025 충청남도 위촉장.pdf' }, buf2), null);
});

test('fsCommitScan은 새 레코드를 만들기 전에 기존 레코드 붙이기를 먼저 시도한다', () => {
  const src = funcSource('fsCommitScan');
  const iAttach = src.indexOf('fsFindAttachTarget');
  const iNew = src.indexOf('_bufIdWiccok(p.type');
  assert.ok(iAttach >= 0, '붙이기 시도가 있어야 합니다');
  assert.ok(iNew > iAttach, '새 레코드 생성보다 붙이기가 먼저여야 합니다');
  assert.match(src, /attachedScanId/);
});

test('fsUndoScan은 붙인 기존 레코드를 지우지 않고 경로만 뗀다', () => {
  const store = {
    wiccok: [
      { id: 'NEW', scanId: 'S1' },                                        // 이번 스캔이 만든 것 → 삭제
      { id: 'OLD', src: 'fs', relPath: 'a/b.pdf', attachedScanId: 'S1' }, // 원래 있던 것 → 경로만 해제
      { id: 'KEEP', scanId: 'S2' }
    ],
    cert: [], certdoc: [], submission: []
  };
  const ctx = {
    get: (k) => store[k].slice(),
    set: (k, v) => { store[k] = v; },
    toast: () => {}, renderCareer: () => {}, CAREER_CFG: {}
  };
  vm.runInNewContext(funcSource('fsUndoScan') + '\nfsUndoScan("S1");', ctx);
  assert.deepEqual(store.wiccok.map((r) => r.id), ['OLD', 'KEEP']);
  const old = store.wiccok.find((r) => r.id === 'OLD');
  assert.equal(old.relPath, undefined, '경로가 떨어져야 합니다');
  assert.equal(old.src, undefined);
  assert.equal(old.attachedScanId, undefined);
});

test('제출서류 목록이 CAREER_CFG에 등록돼 있다', () => {
  assert.match(source, /submission:\s*\{\s*store:\s*'submission'/);
  assert.match(source, /qFields:\s*\['org','title','caseDir'\]/);
});

test('제출서류 스토어가 빈 스토어 초기화 목록에 들어가 있다', () => {
  // 새 기기에서 get('submission')이 터지지 않도록 loadSeed가 빈 배열을 깔아줘야 한다
  const m = source.match(/\['license','complete'[\s\S]{0,300}?\]\.forEach/);
  assert.ok(m, 'loadSeed의 스토어 초기화 배열을 찾을 수 없습니다');
  assert.match(m[0], /'submission'/);
});

test('제출서류 페이지와 사이드바 메뉴가 있다', () => {
  assert.match(source, /<section class="page-view" id="page-submission">/);
  assert.match(source, /\['page-submission','제출서류'\]/);
});

test('승격 버튼 함수가 있다', () => {
  assert.match(source, /function promoteSubmissionFile\(/);
});

test('제출서류 건을 열면 그 안 서류 목록이 나온다', () => {
  assert.match(source, /function openSubmissionFiles\(/);
  assert.match(source, /<div class="modal-ov" id="modalSub">/);
  const src = funcSource('openSubmissionFiles');
  assert.match(src, /openLocalOriginal/, '건 안에서 원본을 열 수 있어야 합니다');
  assert.match(src, /promoteSubmissionFile/, '건 안에서 승격할 수 있어야 합니다');
});

test('로컬 원본 열기가 있고 실패해도 데이터를 건드리지 않는다', () => {
  const src = funcSource('openLocalOriginal');
  assert.match(src, /다시 스캔/);
  assert.ok(!/\bset\(/.test(src), '열람 실패로 데이터를 건드리면 안 됩니다');
});

test('rowActions는 fs 레코드에 다운로드·원본삭제를 주지 않는다', () => {
  const src = funcSource('rowActions');
  assert.match(src, /isFs/);
  assert.match(src, /openLocalOriginal/);
  // fs 분기가 base64용 버튼보다 앞에 와야 한다
  assert.ok(src.indexOf('isFs?') < src.indexOf('downloadFile'));
});

test('원본 없는 항목만 필터와 중복관리 표시가 fs 레코드를 인식한다', () => {
  assert.ok(!/rows\.filter\(function\(r\)\{ return !fileExists\(r\.id\); \}\)/.test(source),
    '원본 없는 항목만 필터가 fs 레코드를 원본 없음으로 취급하면 안 됩니다');
  const dup = funcSource('_dupRow');
  assert.match(dup, /hasOriginal\(r\)/);
});

test('동기화 모듈을 외부 파일로 로드한다', () => {
  assert.match(source, /<script src="js\/kcareer-pusync\.js"><\/script>/);
});

test('puSyncCommit은 스토어별 단일 쓰기와 꼬리표를 지킨다', () => {
  const src = funcSource('puSyncCommit');
  assert.match(src, /src:\s*'pu'/);
  assert.match(src, /puRef/);
  assert.match(src, /syncId/);
  // 레코드 반복문 안에서 set() 금지 — 저장은 마지막에 스토어 목록을 돌며 한 번씩
  const loop = src.slice(src.indexOf('plan.adds.forEach'), src.indexOf('PU_SYNC_STORES.forEach'));
  assert.ok(loop.length > 0, 'adds 반복문과 저장 루프가 있어야 합니다');
  assert.ok(!/\bset\(/.test(loop), 'adds 반복문 안에서 set()을 부르면 안 됩니다');
});

test('외부기관 실적 페이지와 메뉴가 있다', () => {
  assert.match(source, /<section class="page-view" id="page-puagency">/);
  assert.match(source, /\['page-puagency','외부기관 실적'\]/);
  assert.match(source, /function renderPuAgency\(/);
});

test('외부기관 탭은 4개 스토어의 agency 있는 건을 모아 기관별로 묶는다', () => {
  const src = funcSource('renderPuAgency');
  assert.match(src, /PU_SYNC_STORES/);
  assert.match(src, /r\.agency/);
  assert.match(src, /!r\.excluded|r\.excluded\) return/, '배제된 건은 외부기관 탭에서도 숨긴다');
  assert.match(src, /certdoc/, '기관이 발급한 증명서를 자동 매칭해 보여준다');
});

test('실적 4탭은 외부기관·배제 건을 걸러낸다', () => {
  ['case', 'consult', 'fund', 'etc'].forEach((k) => {
    const m = source.match(new RegExp(k + ":\\{store:'" + k + "'[^\\n]*"));
    assert.ok(m, k + ' CFG가 있어야 합니다');
    assert.match(m[0], /filter:\s*r\s*=>\s*!r\.agency\s*&&\s*!r\.excluded/,
      k + ' 목록은 agency 있는 것과 excluded를 숨겨야 합니다');
  });
});

test('배제는 삭제가 아니라 excluded 플래그다', () => {
  const src = funcSource('puExclude');
  assert.match(src, /excluded\s*=\s*true/);
  const rest = funcSource('puRestore');
  assert.match(rest, /excluded\s*=\s*false/);
});

test('배제 권한 — 담당자는 본인 건만', () => {
  const src = funcSource('_puCanExclude');
  assert.match(src, /_me\.isAdmin/);
  assert.match(src, /_me\.name/);
});

test('자동 동기화는 하루 1회이고 첫 실행은 미리보기를 거친다', () => {
  const m = source.match(/async function puSyncAuto\([\s\S]*?\n\}/);
  assert.ok(m, 'puSyncAuto 함수가 있어야 합니다');
  const src = m[0];
  assert.match(src, /pu_sync_last/);                       // 마지막 실행 기록 확인
  assert.match(src, /slice\(0,\s*10\)/);                   // 날짜(하루) 단위 비교
  assert.match(src, /renderPuSyncPreview/);                // 첫 실행 → 미리보기 경로
});

test('로그인 후 자동 동기화가 걸려 있다', () => {
  assert.match(source, /resolveMe\(\)[\s\S]{0,300}puSyncAuto\(\)/);
});

test('puUndoSync는 그 동기화가 만든 레코드만 지운다 (배제된 것 포함)', () => {
  const store = { case: [], consult: [], fund: [], etc: [] };
  const ctx = {
    get: (k) => store[k].slice(),
    set: (k, v) => { store[k] = v; },
    toast: () => {}, renderCareer: () => {}, CAREER_CFG: {},
    PU_SYNC_STORES: ['case', 'consult', 'fund', 'etc']
  };
  store.case = [
    { id: 'CS0001', syncId: 'PS1' },
    { id: 'CS0002', syncId: 'PS1', excluded: true },   // 배제됐어도 그 동기화 것이면 삭제
    { id: 'CS0003', syncId: 'PS2' },
    { id: 'CS0004' }                                    // 수동 등록 → 보존
  ];
  vm.runInNewContext(funcSource('puUndoSync') + '\npuUndoSync("PS1");', ctx);
  assert.deepEqual(store.case.map((r) => r.id), ['CS0003', 'CS0004']);
});

test('fsUndoScan은 scanId가 일치하는 레코드만 지운다', () => {
  const store = { wiccok: [], cert: [], certdoc: [], submission: [] };
  const ctx = {
    get: (k) => store[k].slice(),
    set: (k, v) => { store[k] = v; },
    toast: () => {},
    renderCareer: () => {},
    CAREER_CFG: {},
    confirm: () => true
  };
  store.wiccok = [
    { id: 'A', scanId: 'S1' }, { id: 'B', scanId: 'S2' }, { id: 'C' }
  ];
  vm.runInNewContext(funcSource('fsUndoScan') + '\nfsUndoScan("S1");', ctx);
  assert.deepEqual(store.wiccok.map((r) => r.id), ['B', 'C']);
});
