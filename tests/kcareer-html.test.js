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
  assert.match(source, /<script src="js\/kcareer-scan\.js(\?v=\d+)?"><\/script>/);
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

test('동기화는 pu-erp 유형 코드표를 읽어 넘긴다', () => {
  const m = source.match(/async function _puFetchPlan\([\s\S]*?\n\}/);
  assert.ok(m, '_puFetchPlan 함수가 있어야 합니다');
  ['biz_case_types', 'biz_cons_types', 'biz_fund_types', 'biz_other_types'].forEach((k) => {
    assert.ok(m[0].includes(k), k + '를 읽어야 합니다');
  });
  assert.match(m[0], /_puUnwrap\(/, '코드표도 봉투를 벗겨야 합니다');
  // [^)]* 는 _puKnownRefs() 의 괄호에서 멈춘다 — 인자 목록 전체를 훑어야 한다
  assert.match(m[0], /buildSyncPlan\([\s\S]{0,140}?typeMap/, '코드표를 buildSyncPlan에 넘겨야 합니다');
});

test('puSyncCommit은 기존 실적에 puRef만 붙이고 새로 만들지 않는다', () => {
  const src = funcSource('puSyncCommit');
  assert.match(src, /\.links\b/, '붙이기 목록을 처리해야 합니다');
  assert.match(src, /linkedSyncId/, '되돌릴 때 구분할 꼬리표가 필요합니다');
});

test('puUndoSync는 붙인 기존 실적을 지우지 않고 puRef만 뗀다', () => {
  const store = { case: [], consult: [], fund: [], etc: [] };
  const ctx = {
    get: (k) => store[k].slice(), set: (k, v) => { store[k] = v; },
    toast: () => {}, renderCareer: () => {}, CAREER_CFG: {},
    PU_SYNC_STORES: ['case', 'consult', 'fund', 'etc']
  };
  store.consult = [
    { id: 'CN0100', syncId: 'PS1' },                                        // 이번에 새로 만든 것 → 삭제
    { id: 'CN0001', puRef: 'consultings/k1', linkedSyncId: 'PS1' },         // 시드에 붙인 것 → puRef만 해제
    { id: 'CN0002' }                                                         // 손 안 댐
  ];
  vm.runInNewContext(funcSource('puUndoSync') + '\npuUndoSync("PS1");', ctx);
  assert.deepEqual(store.consult.map((r) => r.id), ['CN0001', 'CN0002']);
  const kept = store.consult.find((r) => r.id === 'CN0001');
  assert.equal(kept.puRef, undefined, 'puRef가 떨어져야 다음 동기화 때 다시 붙는다');
  assert.equal(kept.linkedSyncId, undefined);
});

test('_puBackfill: 이미 동기화된 레코드의 빈 유형·연도를 사건번호에서 채운다', () => {
  const store = { case: [
    { id: 'CS0001', src: 'pu', project: '부해등-2026-003', type: '', year: '' },
    { id: 'CS0002', src: 'pu', project: '윤성진아버지 유족사건', type: '', year: '' },  // 사건번호 아님 → 그대로
    { id: 'CS0003', src: 'pu', project: '임금체불-2025-001', type: '부당해고', year: '2024' }, // 값 있으면 안 건드림
    { id: 'CS0004', project: '부해등-2026-009', type: '', year: '' }                    // 손으로 등록 → 안 건드림
  ], consult: [], fund: [], etc: [] };
  const ctx = {
    get: (k) => store[k].slice(), set: (k, v) => { store[k] = v; },
    PU_SYNC_STORES: ['case', 'consult', 'fund', 'etc'],
    KcareerPuSync: require('../js/kcareer-pusync.js')
  };
  vm.runInNewContext(funcSource('_puBackfill') + '\nglobalThis.__n = _puBackfill();', ctx);
  assert.equal(ctx.__n, 1, '고친 건수를 돌려준다');
  const a = store.case.find((r) => r.id === 'CS0001');
  assert.equal(a.type, '부해등');
  assert.equal(a.year, '2026');
  assert.equal(store.case.find((r) => r.id === 'CS0002').type, '', '사건번호가 아니면 그대로');
  assert.equal(store.case.find((r) => r.id === 'CS0003').type, '부당해고', '값이 있으면 안 건드림');
  assert.equal(store.case.find((r) => r.id === 'CS0004').type, '', 'pu에서 온 게 아니면 안 건드림');
});

test('목록 표 조립문이 끊기지 않는다 — 배제 목록·안내가 렌더돼야 한다', () => {
  // 다른 세션이 stampCellLabels(box);를 문장 중간에 끼워 넣어 뒤가 잘리고
  // exBar(배제된 건·외부기관 안내)와 스크롤 힌트가 사라진 일이 있었다.
  const src = funcSource('renderCareer');
  // 빈 목록 분기에도 box.innerHTML= 이 있으므로 표 조립문을 정확히 겨냥한다
  const i = src.indexOf("box.innerHTML='<table><thead>");
  assert.ok(i >= 0, '표를 그리는 문장이 있어야 합니다');
  const j = src.indexOf('exBar', i);
  assert.ok(j > i, '조립문에 exBar가 있어야 합니다');
  const stmt = src.slice(i, src.indexOf(';', j) + 1);
  assert.match(stmt, /scroll-hint/, '스크롤 힌트가 같은 문장에 있어야 합니다');
  assert.ok(!/stampCellLabels/.test(stmt), '조립문 중간에 다른 호출이 끼면 뒤가 잘립니다');
});

test('목록 화면은 제목·설명을 숨기고 보조 컨트롤을 툴바로 올린다', () => {
  assert.match(source, /\.page-view:has\(\.toolbar\) \.page-head\{display:none\}/);
  assert.match(source, /function _tbExtra\(/);
  const src = funcSource('renderCareer');
  assert.match(src, /_tbExtra\(sec,/, '원본없음·표시개수를 툴바로 옮겨야 합니다');
  const i = src.indexOf("box.innerHTML='<table><thead>");
  const stmt = src.slice(i, src.indexOf(';', src.indexOf('exBar', i)) + 1);
  assert.ok(!/nofileBar|pgSel/.test(stmt), '표 위에 다시 붙이면 한 줄이 되지 않습니다');
});

test('실적 4탭 모두 담당 칸이 있다 — 누가 수행했는지 보여야 한다', () => {
  ['case', 'consult', 'fund', 'etc'].forEach((k) => {
    const m = source.match(new RegExp(k + ":\\{store:'" + k + "'[\\s\\S]{0,900}?cols:\\[([^\\]]*)\\]"));
    assert.ok(m, k + ' CFG의 cols를 찾을 수 없습니다');
    assert.ok(m[1].includes("'담당'"), k + ' 표에 담당 칸이 있어야 합니다');
  });
});

test('실적 4탭 행이 담당(main)을 그린다', () => {
  ['case', 'fund', 'etc'].forEach((k) => {
    const i = source.indexOf(k + ":{store:'" + k + "'");
    const block = source.slice(i, i + 1200);
    assert.match(block, /r\.main/, k + ' 행이 담당을 그려야 합니다');
  });
});

test('pu-erp 참고 박스는 기본 접힘이다', () => {
  // 동기화된 표와 같은 내용이 두 번 보여 혼란스럽다(실사용 피드백)
  const i = source.indexOf('id="puCaseBox"');
  assert.ok(i >= 0, 'puCaseBox가 있어야 합니다');
  const around = source.slice(Math.max(0, i - 400), i);
  assert.match(around, /<details/, '참고 박스를 details로 감싸야 합니다');
  assert.ok(!/<details open/.test(around.slice(around.lastIndexOf('<details'))), '기본은 접힘이어야 합니다');
});

test('기관 증명서 매칭이 issuer도 본다', () => {
  const src = funcSource('renderPuAgency');
  assert.match(src, /c\.issuer/, 'OCR로 채운 발급기관으로 매칭돼야 합니다');
  assert.match(src, /c\.kind/, '정규화로 title이 kind로 옮겨졌으므로 둘 다 봐야 합니다');
});

test('증명서 행에서 그 기관 실적으로 건너갈 수 있다', () => {
  assert.match(source, /function cdOpenAgency\(/);
  const src = funcSource('cdOpenAgency');
  assert.match(src, /page-puagency/, '외부기관 실적 탭으로 이동해야 합니다');
  assert.match(src, /puagQ/, '그 기관으로 검색어를 넣어줘야 합니다');
  assert.match(src, /nav_to\(/, '페이지 전환은 nav_to를 씁니다');
});

test('증명서 OCR 프롬프트는 발급기관·발급일·증명기간·종류를 뽑는다', () => {
  assert.match(source, /PAGE_OCR_PROMPT=\{[\s\S]{0,200}?certdoc:/);
  const m = source.match(/certdoc:`([\s\S]*?)`,/);
  assert.ok(m, 'certdoc 프롬프트가 있어야 합니다');
  ['issuer', 'date', 'coverage', 'kind'].forEach((k) => {
    assert.ok(m[1].includes('"' + k + '"'), '프롬프트가 ' + k + '를 요구해야 합니다');
  });
});

test('cdReOcr는 사람이 누를 때만 돌고 made는 거부한다', () => {
  const m = source.match(/async function cdReOcr\([\s\S]*?\n\}/);
  assert.ok(m, 'cdReOcr 함수가 있어야 합니다');
  assert.match(m[0], /_cdSrc\(r\)/, '만든 증명서는 OCR 대상이 아닙니다');
  assert.match(m[0], /PAGE_OCR_PROMPT\.certdoc/);
});

test('OCR은 자동 실행되지 않는다', () => {
  // 스캔·등록 경로에서 OCR을 부르면 41개가 한 번에 돌아 시간·비용이 든다
  ['cdScanNow', 'cdScanCommit'].forEach((fn) => {
    const m = source.match(new RegExp('function ' + fn + '\\([\\s\\S]*?\\n\\}'));
    assert.ok(m, fn + ' 함수가 있어야 합니다');
    assert.ok(!/cdReOcr|_geminiOCR/.test(m[0]), fn + '에서 OCR을 부르면 안 됩니다');
  });
});

test('증명서 원본 바이트 취득은 경로와 base64 둘 다 다룬다', () => {
  const m = source.match(/async function _cdFileBytes\([\s\S]*?\n\}/);
  assert.ok(m, '_cdFileBytes 함수가 있어야 합니다');
  assert.match(m[0], /fsRoot|getDirectoryHandle/, '경로 참조 원본을 읽어야 합니다');
  assert.match(m[0], /getFileAsync/, 'base64 첨부도 읽어야 합니다');
});

test('_cdAgencyNames는 새 사전을 만들지 않고 시스템이 아는 이름만 모은다', () => {
  const store = {
    consult: [{ agency: '한국능률협회' }, { agency: '충남경제진흥원' }, { agency: '' }],
    case: [], fund: [], etc: [],
    certdoc: [{ issuer: '공인노무사회' }, { issuer: '' }]
  };
  const ctx = {
    get: (k) => (store[k] || []).slice(),
    PU_SYNC_STORES: ['case', 'consult', 'fund', 'etc'],
    _puTypeAgencies: () => ['노사발전재단']
  };
  vm.runInNewContext(funcSource('_cdAgencyNames') + '\nglobalThis.__n = _cdAgencyNames();', ctx);
  const got = ctx.__n;
  ['한국능률협회', '충남경제진흥원', '공인노무사회', '노사발전재단'].forEach((a) => {
    assert.ok(got.includes(a), a + '가 후보에 있어야 합니다');
  });
  assert.ok(!got.includes(''), '빈 값은 후보에 넣지 않습니다');
});

test('_cdGuessIssuer는 폴더 경로에서 먼저 찾고 파일명으로 보완한다', () => {
  const ctx = {
    _cdAgencyNames: () => ['한국능률협회', '능률협회', '공인노무사회', '충남경제진흥원'],
    _agencyNorm: (s) => String(s || '').replace(/[\s\(\)（）\-·]/g, '').toLowerCase()
  };
  vm.runInNewContext(funcSource('_cdGuessIssuer'), ctx);
  assert.equal(ctx._cdGuessIssuer({
    name: '2024 구조혁신지원사업 컨설팅 수행실적 증명서_성문전자(주)_권형하.pdf',
    relPath: '6. 컨설팅 실적증명/구조혁신(능률협회)/2024/2024 구조혁신지원사업 컨설팅 수행실적 증명서_성문전자(주)_권형하.pdf'
  }), '능률협회');
  assert.equal(ctx._cdGuessIssuer({
    name: '2.공인노무사회 정부위탁사업 참여확인서_권형하노무사.pdf',
    relPath: '6. 컨설팅 실적증명/2.공인노무사회 정부위탁사업 참여확인서_권형하노무사.pdf'
  }), '공인노무사회');
  assert.equal(ctx._cdGuessIssuer({ name: '실적증명서.pdf', relPath: '6. 컨설팅 실적증명/실적증명서.pdf' }), '');
});

test('증명서 스캔은 외부기관과 본인 것을 갈라 담는다', () => {
  const m = source.match(/async function cdScanNow\([\s\S]*?\n\}/);
  assert.ok(m, 'cdScanNow 함수가 있어야 합니다');
  assert.match(m[0], /certKind/, 'certKind로 갈라야 합니다');
  assert.match(m[0], /ext:/);
  assert.match(m[0], /own:/);
});

test('본인 경력증명서는 기본 체크 해제 상태다', () => {
  // 146건이 기본으로 들어오면 외부기관 기관 묶음이 지저분해진다(설계서 5)
  const m = source.match(/async function cdScanNow\([\s\S]*?\n\}/);
  assert.ok(m, 'cdScanNow 함수가 있어야 합니다');
  assert.match(m[0], /pickOwn:\s*false/);
  assert.match(source, /function toggleCdOwn\(/);
});

test('cdScanCommit은 체크된 묶음만 저장한다', () => {
  const src = funcSource('cdScanCommit');
  assert.match(src, /pickOwn/, '체크 여부를 봐야 합니다');
  assert.match(src, /certKind/, '레코드에 성격을 남겨야 합니다');
});

test('증명서 스캔은 위촉장과 같은 폴더 핸들을 쓴다', () => {
  const m = source.match(/async function cdScanNow\([\s\S]*?\n\}/);
  assert.ok(m, 'cdScanNow 함수가 있어야 합니다');
  assert.match(m[0], /fsScanAll/, '폴더를 다시 지정하지 않고 기존 스캔을 재사용합니다');
  assert.ok(!/showDirectoryPicker/.test(m[0]));
  assert.ok(!/환경설정/.test(m[0]), '환경설정으로 안내하면 막다른 길이 됩니다');
});

test('_cdFindAttachTarget은 원본 없는 received 레코드만 돌려준다', () => {
  const db = [
    { id: 'CD1', kind: '실적증명서', issuer: '충남경제진흥원', year: '2025', docSrc: 'received' },
    { id: 'CD2', kind: '실적증명서', issuer: '충남경제진흥원', year: '2025', docSrc: 'received', src: 'fs', relPath: 'x/y.pdf' },
    { id: 'CD3', kind: '실적증명서', org: '충남경제진흥원', year: '2025', genFileId: 'certdoc_1' }   // made → 대상 아님
  ];
  const ctx = {
    matchByFilename: (file, arr) => arr.find((r) => file.name.includes(r.org)) || null,
    hasOriginal: (r) => (r.src === 'fs' ? !!r.relPath : !!r.genFileId),
    _cdSrc: (r) => (r.docSrc || (r.genFileId ? 'made' : 'received'))
  };
  vm.runInNewContext(funcSource('_cdFindAttachTarget'), ctx);
  const hit = ctx._cdFindAttachTarget({ name: '2025 충남경제진흥원 실적증명서.pdf' }, db);
  assert.ok(hit, '원본 없는 received를 찾아야 합니다');
  assert.equal(hit.id, 'CD1');
  assert.ok(hit === db[0], '버퍼 안의 원래 객체를 돌려줘야 붙일 수 있습니다');
  assert.equal(ctx._cdFindAttachTarget({ name: '2025 충남경제진흥원 실적증명서.pdf' }, [db[2]]), null);
});

test('cdScanCommit은 made를 건드리지 않고 스토어를 한 번만 쓴다', () => {
  const src = funcSource('cdScanCommit');
  assert.match(src, /docSrc:\s*'received'/);
  assert.match(src, /scanId/);
  const i = src.indexOf('rows.forEach');
  assert.ok(i >= 0, '레코드 반복문(rows.forEach)이 있어야 합니다');
  const loop = src.slice(i, src.lastIndexOf("set('certdoc'"));
  assert.ok(loop.length > 0, '반복문과 저장이 있어야 합니다');
  assert.ok(!/\bset\(/.test(loop), '반복문 안에서 set()을 부르면 안 됩니다');
});

test('cdUndoScan은 만든 레코드만 지우고 붙인 것은 경로만 뗀다', () => {
  const store = { certdoc: [
    { id: 'CD1', scanId: 'CS1' },
    { id: 'CD2', src: 'fs', relPath: 'a/b.pdf', attachedScanId: 'CS1' },
    { id: 'CD3', scanId: 'CS2' },
    { id: 'CD4', genFileId: 'certdoc_1' }
  ] };
  const ctx = {
    get: (k) => store[k].slice(), set: (k, v) => { store[k] = v; },
    toast: () => {}, renderDocStore: () => {}
  };
  vm.runInNewContext(funcSource('cdUndoScan') + '\ncdUndoScan("CS1");', ctx);
  assert.deepEqual(store.certdoc.map((r) => r.id), ['CD2', 'CD3', 'CD4']);
  const kept = store.certdoc.find((r) => r.id === 'CD2');
  assert.equal(kept.relPath, undefined);
  assert.equal(kept.attachedScanId, undefined);
});

test('증명서는 표로 그리고 이력서·프로필은 카드를 유지한다', () => {
  assert.match(source, /certdoc:\{store:'certdoc'[\s\S]{0,400}?tableView:\s*true/);
  assert.ok(!/resume:\{[\s\S]{0,300}?tableView:\s*true/.test(source), '이력서는 카드를 유지합니다');
  const src = funcSource('renderDocStore');
  assert.match(src, /D\.tableView/, '도메인별로 표/카드를 갈라야 합니다');
});

test('증명서 표에 필요한 칸이 있다', () => {
  const src = funcSource('_cdTable');
  ['종류', '발급기관', '발급일', '증명기간', '원본', '제출'].forEach((h) => {
    assert.ok(src.includes(h), '표에 ' + h + ' 칸이 있어야 합니다');
  });
  assert.match(src, /openSubmitLog/, '제출기록은 유지합니다');
});

test('증명서 목록에 원본 없는 항목만 필터가 있다', () => {
  assert.match(source, /function toggleCdNoFile\(/);
  const src = funcSource('renderDocStore');
  assert.match(src, /_cdNoFileOnly/);
  assert.match(src, /hasOriginal\(r\)/);
});

test('증명서 검색은 발급기관도 본다', () => {
  const src = funcSource('renderDocStore');
  assert.match(src, /r\.issuer/, 'issuer로도 검색돼야 외부기관을 찾을 수 있습니다');
});

test('_cdSrc: 만든 증명서와 받은 증명서를 가른다', () => {
  const ctx = {};
  vm.runInNewContext(funcSource('_cdSrc'), ctx);
  assert.equal(ctx._cdSrc({ docSrc: 'received' }), 'received');
  assert.equal(ctx._cdSrc({ docSrc: 'made' }), 'made');
  assert.equal(ctx._cdSrc({ relPath: '6. 컨설팅 실적증명/a.pdf' }), 'received');  // 스캔으로 들어온 것
  assert.equal(ctx._cdSrc({ fname: 'a.pdf' }), 'received');                        // genFileId 없이 파일명만
  assert.equal(ctx._cdSrc({ genFileId: 'certdoc_1' }), 'made');                    // 내가 만든 것
  assert.equal(ctx._cdSrc({}), 'made');
  assert.equal(ctx._cdSrc(null), 'made');
});

test('_cdNormalize: 스캔이 남긴 어긋난 필드를 화면이 읽는 이름으로 옮긴다', () => {
  const store = { certdoc: [
    { id: 'CD0001', title: '2.권형하노무사 경력증명서', date: '2023.05.11', note: 'x',
      relPath: '6. 컨설팅 실적증명/a.pdf', src: 'fs' },
    { id: 'CD0002', kind: '실적증명서', year: '2025', memo: '', genFileId: 'certdoc_9' }  // 이미 정상 → 손대지 않음
  ] };
  const ctx = {
    get: (k) => store[k].slice(),
    set: (k, v) => { store[k] = v; },
    _cdSrc: (r) => (r.relPath || (!r.genFileId && r.fname) ? 'received' : 'made')
  };
  vm.runInNewContext(funcSource('_cdNormalize') + '\nglobalThis.__n = _cdNormalize();', ctx);
  assert.equal(ctx.__n, 1, '고친 건수를 돌려준다');
  const a = store.certdoc.find((r) => r.id === 'CD0001');
  assert.equal(a.kind, '2.권형하노무사 경력증명서');
  assert.equal(a.year, '2023');
  assert.equal(a.docSrc, 'received');
  // vm 안에서 만든 배열은 realm이 달라 deepStrictEqual이 프로토타입에서 걸린다
  assert.ok(Array.isArray(a.submits) && a.submits.length === 0, 'submits는 빈 배열이어야 합니다');
  const b = store.certdoc.find((r) => r.id === 'CD0002');
  assert.equal(b.kind, '실적증명서', '이미 정상인 레코드는 그대로');
  assert.equal(b.docSrc, undefined, 'made는 docSrc를 붙이지 않는다');
});

test('_cdNormalize는 멱등이다 — 두 번 돌려도 0건', () => {
  const store = { certdoc: [
    { id: 'CD0001', title: 't', date: '2023.05.11', relPath: 'x/a.pdf', src: 'fs' }
  ] };
  const ctx = {
    get: (k) => store[k].slice(),
    set: (k, v) => { store[k] = v; },
    _cdSrc: () => 'received'
  };
  const src = funcSource('_cdNormalize');
  vm.runInNewContext(src + '\nglobalThis.__a = _cdNormalize(); globalThis.__b = _cdNormalize();', ctx);
  assert.equal(ctx.__a, 1);
  assert.equal(ctx.__b, 0, '두 번째는 고칠 게 없어야 합니다');
});

test('스캔이 만드는 certdoc 레코드는 화면이 읽는 필드를 쓴다', () => {
  const src = funcSource('fsCommitScan');
  const i = src.indexOf("_bufIdSeq('CD','certdoc')");
  assert.ok(i >= 0, 'certdoc 분기가 있어야 합니다');
  const line = src.slice(i, i + 400);
  assert.match(line, /kind:/, '화면은 title이 아니라 kind를 읽습니다');
  assert.match(line, /docSrc:\s*'received'/);
  assert.match(line, /submits:\s*\[\]/);
});

test('받은 증명서에는 만든 파일 버튼을 그리지 않는다', () => {
  const src = funcSource('renderDocStore');
  assert.match(src, /_cdSrc\(r\)/, '출처에 따라 버튼을 달리 그려야 합니다');
});

test('pu-erp data/ 읽기는 모두 {v,u} 봉투를 벗긴다', () => {
  // pu-erp는 data/{키}={v:값,u:시각}으로 저장한다. 안 벗기면 직원목록·실적이 통째로 어긋난다.
  ['_puLoadUserMap', 'loadPuPerf', '_puFetchPlan', 'resolveMe'].forEach((fn) => {
    const m = source.match(new RegExp('function ' + fn + '\\([\\s\\S]*?\\n\\}'));
    assert.ok(m, fn + ' 함수가 있어야 합니다');
    if (!/ref\('data\//.test(m[0])) return;                  // data/ 를 안 읽는 함수는 통과
    assert.match(m[0], /_puUnwrap\(/, fn + '는 봉투를 벗겨야 합니다');
  });
  assert.match(source, /function _puUnwrap\(/);
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
  assert.match(source, /<script src="js\/kcareer-pusync\.js(\?v=\d+)?"><\/script>/);
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

test('외부기관 탭은 4개 스토어의 외부 건을 모아 기관별로 묶는다', () => {
  const src = funcSource('renderPuAgency');
  assert.match(src, /PU_SYNC_STORES/);
  assert.match(src, /_isExternal\(r\)/);
  assert.match(src, /r\.excluded\) return/, '배제된 건은 외부기관 탭에서도 숨긴다');
  assert.match(src, /certdoc/, '기관이 발급한 증명서를 자동 매칭해 보여준다');
  // 발급기관 칸이 빈 스캔 증명서도 제목·파일명으로 매칭돼야 한다
  assert.match(src, /c\.fname/, '증명서 매칭이 파일명·제목도 봐야 합니다');
});

test('_isExternal: 수행기관이 있어도 직접 수행은 내부다', () => {
  const ctx = {};
  vm.runInNewContext(funcSource('_isExternal'), ctx);
  assert.equal(ctx._isExternal({ agency: '한국능률협회' }), true);
  assert.equal(ctx._isExternal({ agency: '충남경제진흥원' }), true);
  assert.equal(ctx._isExternal({ agency: '의뢰기관 직접' }), false);   // 직접 수행 = 푸른 자체 실적
  assert.equal(ctx._isExternal({ agency: '직접' }), false);
  assert.equal(ctx._isExternal({ agency: '' }), false);
  assert.equal(ctx._isExternal({}), false);
  assert.equal(ctx._isExternal(null), false);
});

test('실적 4탭은 외부기관·배제 건을 걸러낸다', () => {
  ['case', 'consult', 'fund', 'etc'].forEach((k) => {
    const m = source.match(new RegExp(k + ":\\{store:'" + k + "'[^\\n]*"));
    assert.ok(m, k + ' CFG가 있어야 합니다');
    assert.match(m[0], /filter:\s*r\s*=>\s*!_isExternal\(r\)\s*&&\s*!r\.excluded/,
      k + ' 목록은 외부기관 건과 excluded를 숨겨야 합니다');
  });
});

/* ===== 이력서관리 네 화면 정리 (2026-08-23) ===== */

test('이력서관리 네 화면은 제목·설명을 숨긴다 — 빵부스러기와 세 번 중복이었다', () => {
  ['page-quickcv', 'page-resume-hub', 'page-profile', 'page-certdoc'].forEach((id) => {
    assert.ok(
      new RegExp('#' + id + '>\\.page>h2,#' + id + '>\\.page>\\.desc').test(source),
      id + ' 의 제목·설명 숨김 규칙이 있어야 합니다'
    );
  });
});

test('네 화면 모두 접이식(.rh-fold) 같은 모양이다', () => {
  assert.match(source, /\.rh-fold>summary\{/, '.rh-fold 요약줄 스타일이 있어야 합니다');
  // 빠른이력서·이력서생성보관·프로필·경력증명서 = 4개
  const folds = source.match(/<details class="rh-fold"/g) || [];
  assert.ok(folds.length >= 4, '네 화면에 각각 접이식 묶음이 있어야 합니다 (지금 ' + folds.length + '개)');
});

test('빠른 이력서에서 중복 카드를 없앴다 — 서류 만들기 버튼은 같은 화면 안 중복이었다', () => {
  // 주석에는 남아 있어도 된다 — 화면에 그려지는 마크업만 본다
  assert.ok(!/>📑 서류 만들기</.test(source), '「서류 만들기」 카드를 되살리지 말 것');
  assert.ok(!/onclick="goCV\('resume'\)"/.test(source), '같은 화면에서 goCV 버튼은 드롭다운과 중복입니다');
  // 최근 생성 기록 자리는 남아 있어야 한다 (renderCvRecent가 이 id를 찾는다)
  assert.match(source, /id="homeCvRecent"/);
});

test('A4 쪽 나눔 자 — 자는 #cvSheet 밖에 있고 인쇄에서 막힌다', () => {
  assert.match(source, /id="cvPageGuide"/, '쪽 나눔 자 요소가 있어야 합니다');
  // ⚠ 자가 #cvSheet 안에 있으면 renderQuickCV가 지우고 인쇄에도 찍힌다
  const sheetTag = source.match(/<div id="cvSheet"[\s\S]{0,200}/);
  assert.ok(sheetTag, '#cvSheet 요소를 찾을 수 없습니다');
  assert.ok(!/cvPageGuide/.test(sheetTag[0].split('</div>')[0]),
    '쪽 나눔 자를 #cvSheet 안으로 넣지 말 것');
  // ⚠ 인쇄에서 래퍼가 relative로 남으면 #cvSheet의 absolute 기준이 바뀌어 PDF가 어긋난다
  // @media print 블록이 파일에 둘 이상 있다 — #cvSheet를 담은 쪽을 골라야 한다
  const printCss = (source.match(/@media print\{[\s\S]*?\n\}/g) || [])
    .filter((b) => b.indexOf('#cvSheet') >= 0);
  assert.equal(printCss.length, 1, '#cvSheet를 다루는 인쇄 CSS 블록을 찾을 수 없습니다');
  assert.match(printCss[0], /\.cv-sheet-wrap\{position:static!important\}/,
    '인쇄에서 .cv-sheet-wrap은 static이어야 합니다');
  assert.match(printCss[0], /\.cv-pguide\{display:none!important\}/);
});

test('cvRenderGuide는 rect로 재고 cvApplyPages와 같은 한 장 높이를 쓴다', () => {
  const src = funcSource('cvRenderGuide');
  assert.match(src, /getBoundingClientRect/, 'zoom 때문에 높이를 offset으로 재면 어긋납니다');
  // 실제 코드만 본다 — ⚠ 주석 자체가 그 낱말을 담고 있어서 주석을 지운 뒤 검사한다
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(!/\.offsetHeight/.test(code), '⚠ 높이를 offsetHeight로 재지 말 것 — zoom 해석이 브라우저마다 다릅니다');
  assert.match(funcSource('cvPaginate'), /CV_PAGE_MM/, '한 장 높이는 cvApplyPages와 같은 상수를 써야 합니다');
  assert.match(funcSource('cvApplyPages'), /CV_PAGE_MM/);
  assert.match(funcSource('cvApplyPages'), /cvPaginate\(\); cvRenderGuide\(\)/, '축소 맞춤 뒤 다시 나눠야 합니다');
});

test('쪽 나눔은 줄 단위 — 표 한 줄이 쪽 경계에서 잘리지 않는다', () => {
  const src = funcSource('cvPaginate');
  // 쪼갤 수 없는 최소 단위를 행으로 잡고, 걸친 행 「앞」에 빈 공간을 넣어 다음 쪽으로 내린다
  assert.match(src, /_cvAtoms\(sheet\)/);
  assert.match(src, /_cvGapBefore\(a\.el,pad\)/, '걸친 줄 앞에 빈 공간을 넣어야 합니다');
  assert.match(funcSource('_cvAtoms'), /ch\.rows/, '표는 행 단위로 쪼개야 합니다');
  // 여러 번 불러도 같은 결과여야 한다 — 먼저 지난 빈 공간을 걷어낸다
  assert.match(src, /_cvStripGaps\(sheet\)/, 'cvPaginate는 멱등이어야 합니다');
  assert.match(funcSource('cvApplyPages'), /_cvStripGaps\(sheet\)/,
    '축소 비율은 빈 공간을 뺀 알맹이 높이로 재야 합니다');
});

test('쪽 사이 빈 공간은 인쇄에서 사라지고 줄은 통째로 유지된다', () => {
  const printCss = (source.match(/@media print\{[\s\S]*?\n\}/g) || [])
    .filter((b) => b.indexOf('#cvSheet') >= 0);
  assert.equal(printCss.length, 1);
  assert.match(printCss[0], /\.cv-pgap\{display:none!important\}/,
    '화면용 빈 공간이 PDF에 찍히면 안 됩니다');
  assert.match(printCss[0], /#cvSheet tr[^\n]*page-break-inside:avoid!important/,
    'PDF에서도 표 한 줄이 쪼개지면 안 됩니다');
  // 화면 여백 = 인쇄 @page 여백이어야 미리보기 쪽 수가 PDF와 맞는다
  assert.match(source, /\.cv-sheet\{[^}]*padding:14mm/, '시트 여백은 인쇄 여백(14mm)과 같아야 합니다');
  assert.match(printCss[0], /@page\{size:A4;margin:14mm\}/);
});

test('회색 띠는 빈 공간 끝의 28mm만 덮는다 — 앞 쪽 남은 자리는 흰 종이', () => {
  const src = funcSource('cvRenderGuide');
  assert.match(src, /CV_GAP_MM\*_cvPxPerMm\(sheet\)\*z/, '띠 높이는 28mm 고정이어야 합니다');
  assert.match(src, /Math\.min\(bandH,r\.height\)/);
  assert.match(src, /top:\(r\.bottom-wr\.top\)-h/, '띠는 빈 공간 아래끝에 붙어야 합니다');
  assert.match(source, /var CV_GAP_MM\s*=\s*28;/, '앞 쪽 아래여백 14 + 뒤 쪽 위여백 14');
});

test('_cvPxPerMm 대체값은 CSS 표준(96/25.4)이다 — 임의의 픽셀 숫자 금지', () => {
  const src = funcSource('_cvPxPerMm');
  assert.match(src, /96\/25\.4/, '폭을 못 재면 CSS 표준 mm값으로 돌아가야 합니다');
  assert.ok(!/\b7\d\d\b/.test(src.replace(/\/\*[\s\S]*?\*\//g, '')),
    '임의의 픽셀 상수를 넣으면 쪽 수가 통째로 틀어집니다');
});

/* ===== 한글(HWPX)로 보기 (2026-08-23) =====
   실측: 경력 122행 → HTML 미리보기 6~11쪽 vs 한글 문서 7쪽.
   쪽 수의 정답은 한글 엔진이 센 값이다. */

test('한글 엔진(vendor/rhwp-core)이 실제로 들어 있다', () => {
  const dir = path.join(__dirname, '..', 'vendor', 'rhwp-core');
  assert.ok(fs.existsSync(path.join(dir, 'rhwp.js')), 'rhwp.js가 있어야 합니다');
  assert.ok(fs.existsSync(path.join(dir, 'rhwp_bg.wasm')), 'rhwp_bg.wasm이 있어야 합니다');
  const eng = fs.readFileSync(path.join(__dirname, '..', 'js', 'pu-hwp-engine.js'), 'utf8');
  assert.match(eng, /coreUrl:\s*'vendor\/rhwp-core\/rhwp\.js'/, '엔진 경로가 바뀌면 한글 보기가 죽습니다');
  assert.match(eng, /renderPageToCanvas/, '쪽을 캔버스로 그리는 호출이 있어야 합니다');
});

test('한글 문서 보기 모달과 함수가 있다', () => {
  assert.match(source, /id="modalHwpView"/);
  assert.match(source, /id="hwpViewBody"/);
  assert.match(source, /id="hwpViewInfo"/);
  const src = funcSource('openHwpViewer');
  assert.match(src, /PureunHwp\.renderPreview\(box,\s*u8/, '진짜 한글 엔진으로 그려야 합니다');
  assert.match(src, /pageCount/, '한글이 센 쪽 수를 보여줘야 합니다');
  // 캔버스는 A4 한 장이 793×1122px이라 닫을 때 비워야 한다
  assert.match(funcSource('closeHwpView'), /box\.innerHTML\s*=\s*''/);
});

test('7MB 엔진을 몰래 받아오지 않는다 — 누를 때만 올린다', () => {
  const src = funcSource('cvHwpCount');
  assert.match(src, /if\(!_hwpEngineReady && !force\) return;/,
    '⚠ 이 가드를 지우면 화면만 열어도 7MB를 내려받습니다');
  // 부팅·렌더 경로에서 force로 부르는 곳이 없어야 한다
  assert.ok(!/cvHwpCount\(true\)/.test(funcSource('cvRenderGuide')));
  assert.ok(!/cvHwpCount\(true\)/.test(funcSource('cvApplyPages')));
  assert.match(funcSource('cvHwpView'), /cvHwpCount\(true\)/, '누를 때는 세야 합니다');
});

test('쪽 수 배지는 한글 값을 정답으로 쓰고, 어림값일 때는 그렇다고 밝힌다', () => {
  const src = funcSource('cvRenderGuide');
  assert.match(src, /if\(_hwpEngineReady\)\{ cvHwpCount\(\); \}/, '엔진이 있으면 한글 값이 정답입니다');
  assert.match(src, /'A4 '\+n\+'장 · 화면'/, '어림값에는 · 화면을 붙여야 합니다');
  assert.match(funcSource('cvHwpCount'), /'장 · 한글'/, '한글 값에는 · 한글을 붙여야 합니다');
  // 툴바 진입점
  assert.match(source, /onclick="cvHwpView\(\)"[^>]*>👁 한글로 보기/);
  assert.match(source, /class="cv-pgcnt" id="cvPageCnt" onclick="cvHwpView\(\)"/, '배지도 눌러야 열립니다');
});

test('보관한 한글 문서는 내려받지 않고 앱 안에서 본다', () => {
  const src = funcSource('openOriginal');
  assert.match(src, /_isHwpName\(f\.name\)/, 'hwp·hwpx는 뷰어로 보내야 합니다');
  assert.match(src, /openHwpViewer\(b64ToAb\(f\.base64\)/);
  assert.match(funcSource('_isHwpName'), /hwp\|hwpx/);
  // 기관 양식 칩과 값채우기 결과도 바로 볼 수 있어야 한다
  assert.match(funcSource('renderCvForms'), /cvFormHwpView/);
  assert.match(funcSource('hwpxFill'), /openHwpViewer\(await blob\.arrayBuffer\(\)/);
});

test('빈 공간 행은 HWPX·텍스트 추출에 섞이지 않는다', () => {
  // 빈 공간 칸에 cv-noprint를 붙여 두면 한글 저장이 그 칸을 문서에서 뺀다
  assert.match(funcSource('_cvGapBefore'), /cv-pgap-c cv-noprint/,
    '빈 공간 칸에 cv-noprint가 없으면 HWPX에 빈 행이 들어갑니다');
  // 거르는 쪽 — 공용 서식층에 「이 칸은 빼라」고 넘기는지
  assert.match(funcSource('_cvBuildHwpx'), /skip:'\.cv-noprint'/,
    '한글 저장이 cv-noprint 칸을 빼도록 넘기지 않으면 화면 전용 단추가 문서에 찍힙니다');
});

test('타이핑 중에는 자만 다시 그린다 — 커서가 튀지 않게', () => {
  // funcSource는 \n} 까지 먹으므로 한 줄 함수에는 못 쓴다 — 그 한 줄만 떼어 본다
  const m = source.match(/function cvGuideSoon\(\)[^\n]*/);
  assert.ok(m, 'cvGuideSoon 함수가 있어야 합니다');
  assert.match(m[0], /cvRenderGuide/);
  assert.ok(!/cvApplyPages/.test(m[0]), 'cvGuideSoon이 zoom을 다시 계산하면 커서가 튑니다');
});

test('내용이 바뀌는 자리마다 자를 다시 그린다', () => {
  ['cvAddRow', 'cvDelRow', 'cvClearAll', 'cvInsert', 'cvDrop'].forEach((fn) => {
    assert.match(funcSource(fn), /cvGuideSoon\(\)/, fn + ' 뒤에 쪽 수를 다시 세야 합니다');
  });
});

test('내부 탭이 비어 보여도 외부기관 건이 어디 갔는지 안내한다', () => {
  // 컨설팅실적 79건이 전부 외부로 넘어가 0건이 되자 사용자가 데이터 유실로 오인했다(실사용 피드백)
  assert.match(source, /외부기관 실적.{0,10}탭에/, '외부로 넘어간 건수를 알려주는 안내가 있어야 합니다');
  assert.match(source, /extCount/);
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

test('pu-erp 원본 보기는 읽기 전용이다', () => {
  const m = source.match(/async function openPuSource\([\s\S]*?\n\}/);
  assert.ok(m, 'openPuSource 함수가 있어야 합니다');
  assert.ok(!/\.set\(|\.update\(|\.push\(/.test(m[0]), 'pu-erp 데이터에 쓰기를 시도하면 안 됩니다');
  assert.match(source, /<div class="modal-ov" id="modalPuSrc">/);
});

test('동기화 레코드 행에서 pu-erp 원본을 열 수 있다', () => {
  const src = funcSource('rowActions');
  assert.match(src, /rec&&rec\.puRef/);
  assert.match(src, /openPuSource/);
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
