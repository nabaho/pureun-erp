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
  const i = src.indexOf("box.innerHTML=selBar+'<table><thead>");
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
  const i = src.indexOf("box.innerHTML=selBar+'<table><thead>");
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

test('이력서관리 두 화면은 제목·설명을 숨긴다 — 빵부스러기와 세 번 중복이었다', () => {
  ['page-resume-hub', 'page-docbox'].forEach((id) => {
    assert.ok(
      new RegExp('#' + id + '>\\.page>h2,#' + id + '>\\.page>\\.desc').test(source),
      id + ' 의 제목·설명 숨김 규칙이 있어야 합니다'
    );
  });
});

test('이력서관리 네 화면이 같은 모양이다 — 접이식 또는 툴바 한 줄', () => {
  assert.match(source, /\.rh-fold>summary\{/, '.rh-fold 요약줄 스타일이 있어야 합니다');
  // 빠른이력서·프로필·경력증명서 = 접이식 3개
  const folds = source.match(/<details class="rh-fold"/g) || [];
  assert.ok(folds.length >= 3, '접이식 묶음이 있어야 합니다 (지금 ' + folds.length + '개)');
  // 이력서 생성·보관은 카드 3개 대신 목록 화면과 같은 툴바 한 줄을 쓴다(2026-08-29)
  /* ⚠ «어느 칸 안에» 있는지는 규칙이 아니다 — 2026-08-30 탭줄과 한 줄로 합치며 패널 밖으로 나갔다.
     규칙은 「업로드·모드·보관함이 한 줄에 모여 있는가」다. */
  const bar = source.indexOf('id="rhUploadBar"');
  assert.ok(bar > 0, '업로드·모드·보관함은 툴바 한 줄이어야 합니다');
  const seg = source.slice(bar, bar + 1800);
  ['id="rcDrop"', 'id="rhModeSel"', 'id="rcSaveLib"'].forEach((x) => {
    assert.ok(seg.indexOf(x) > 0, x + ' 도 같은 줄에 있어야 합니다');
  });
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

/* ===== 「자료가 사라진 것처럼 보이는」 사고 방지 (2026-08-24) ===== */

test('전체 건수를 절대 숨기지 않는다 — 필터가 걸리면 전체·지금 둘 다 보여준다', () => {
  // 표시개수가 있으면 .cnt를 숨겼더니, 원본없음 필터가 켜진 위촉장이
  // 197건 → 79건으로만 보여 자료 유실로 오인했다.
  const tb = funcSource('_tbExtra');
  assert.match(tb, /c\.style\.display\s*=\s*''/, '.cnt를 다시 숨기면 같은 오인이 재발합니다');
  assert.ok(!/pglimit-info.*none/.test(tb), '표시개수가 있을 때 .cnt를 숨기면 안 됩니다');
  const src = funcSource('renderCareer');
  assert.match(src, /'전체 '\+data\.length\+'건 · 지금 '\+rows\.length\+'건'/,
    '필터가 걸리면 전체 건수와 보이는 건수를 함께 적어야 합니다');
  // 전체 건수는 원본없음 필터를 적용한 뒤에 계산해야 narrowed 판정이 맞는다
  const iFilter = src.indexOf('if(_noFileOnly[name]) rows=rows.filter');
  const iCnt = src.indexOf("sec.querySelector('.cnt')");
  assert.ok(iFilter >= 0 && iCnt > iFilter, '.cnt는 필터 적용 뒤에 써야 합니다');
});

test('한 번도 안 맞춘 기기가 클라우드를 조용히 덮지 않는다', () => {
  const src = funcSource('fbAutoPush');
  assert.match(src, /if\(_fbBase==null && cloudAt\)\{ fbShowNotice\(\); return; \}/,
    '⚠ 이 가드를 지우면 폰의 시드 데이터가 PC 기록을 덮습니다');
});

test('저장·불러오기 확인창이 기록 건수를 비교해 보여준다', () => {
  assert.match(source, /var FB_COUNT_KEYS=\[/);
  assert.match(funcSource('_fbCounts'), /FB_COUNT_KEYS\.forEach/);
  const pull = funcSource('fbPull');
  assert.match(pull, /_fbCounts\(v\.ls\)/, '클라우드 건수를 세야 합니다');
  assert.match(pull, /_fbCounts\(null\)/, '이 기기 건수도 세야 합니다');
  assert.match(pull, /적습니다/, '줄어들면 경고해야 합니다');
  // 예전엔 localStorage 열쇠 개수를 보여줘서 197→86을 알 수 없었다
  assert.ok(!/Object\.keys\(v\.ls\)\.length/.test(pull), '열쇠 개수는 기록 건수가 아닙니다');
  const push = funcSource('fbPush');
  assert.match(push, /cloudTotal>here\.total/, '클라우드가 더 많으면 물어봐야 합니다');
});

test('건수를 못 읽었다고 저장까지 막지 않는다', () => {
  // ⚠ 비교용 읽기가 실패하면 예전엔 '저장 실패' 토스트만 내고 쓰기를 아예 안 했다.
  //    자료를 되살린 직후 클라우드에 올려 둬야 하는 상황에서 복구 경로가 막힌다.
  const push = funcSource('fbPush');
  assert.match(push, /_fbCloudTotal\(function\(cloudTotal\)/);
  assert.match(push, /cloudTotal!=null && cloudTotal>here\.total/,
    '건수를 못 읽었으면(null) 비교를 건너뛰고 저장해야 합니다');
  assert.match(push, /save\(\);/);
  // _fbCloudTotal은 어떤 실패에도 cb(null)로 끝나야 한다 — 그래야 저장이 이어진다
  const t = funcSource('_fbCloudTotal');
  assert.ok((t.match(/cb\(null\)/g) || []).length >= 3, '실패 경로마다 cb(null)로 이어져야 합니다');
});

test('로그인마다 전체 자료를 내려받지 않는다 — counts만 읽는다', () => {
  // fbGatherLS는 첨부 조각(pf_chunk_*)까지 담아 payload가 수 MB다
  const t = funcSource('_fbCloudTotal');
  assert.match(t, /'\/counts'\)/, '가벼운 counts 경로를 먼저 읽어야 합니다');
  assert.match(t, /counts'\)\.set\(\{total:t/, '옛 자료면 한 번 채워 두어 다음부터 가볍게 합니다');
  const loss = funcSource('fbCheckLoss');
  assert.match(loss, /_fbCloudTotal\(/);
  assert.ok(!/ref\('kcareer\/'\+fbUid\)\.once/.test(loss), '⚠ 노드 전체를 읽으면 안 됩니다');
  assert.ok(!/ref\('kcareer\/'\+fbUid\)\.once/.test(funcSource('fbPush')), '⚠ 저장 전에도 전체를 읽으면 안 됩니다');
  // 저장할 때 counts를 함께 적어야 다음 로그인이 가볍다
  assert.match(funcSource('_fbDoPush'), /counts:\{total:hereTotal/);
  assert.match(funcSource('fbAutoPush'), /_fbDoPush\(/);
});

test('브라우저 자료가 지워져 기본 데이터로 돌아가면 크게 알린다', () => {
  // 위촉장 197 → 79(시드) 사고: _seeded가 지워지면 loadSeed가 조용히 기본 데이터를 깔았다
  assert.match(source, /id="fbLossNotice"/);
  assert.match(source, /id="fbLossMsg"/);
  const src = funcSource('fbCheckLoss');
  assert.match(src, /_fbCloudTotal\(/);
  assert.match(src, /_fbCounts\(null\)/);
  assert.match(src, /cloud\.total <= here\.total \+ 5/, '몇 건 차이로 겁주지 않아야 합니다');
  assert.match(src, /fbLossNotice/);
  // 로그인할 때 검사해야 의미가 있다
  assert.match(source, /if\(typeof fbCheckLoss==='function'\)\{ try\{ fbCheckLoss\(\); \}catch\(e\)\{\} \}/);
  // 되살리기 버튼이 붙어 있어야 한다
  const i = source.indexOf('id="fbLossNotice"');
  assert.match(source.slice(i, i + 900), /onclick="fbPull\(\);return false"/);
});

/* ===== 목록 화면 공통 — 틀고정·한 줄 툴바·선택 체크 (2026-08-29) =====
   ⚠ 이 셋은 renderCareer 한 곳에서 만들어져 모든 목록 화면에 같이 적용돼야 한다.
   화면 하나만 따로 고치면 다시 제각각이 된다. */

test('툴바가 틀고정되고 표 머리줄은 그 아래에 붙는다', () => {
  assert.match(source, /\.page-view\.active \.toolbar\{position:sticky;top:0/);
  // ⚠ 머리줄이 top:0 이면 툴바와 겹친다 — 툴바 높이(--tbH) 아래에 붙어야 한다
  assert.match(source, /\.dt thead th\{top:var\(--tbH,0px\)!important\}/);
  const src = funcSource('_stickyTop');
  assert.match(src, /setProperty\('--tbH'/, '툴바 높이를 재서 알려줘야 합니다');
  assert.match(src, /ResizeObserver/, '툴바가 줄바꿈되면 높이가 바뀝니다');
  // 목록이 있든 없든 둘 다 불려야 한다
  assert.equal((funcSource('renderCareer').match(/_stickyTop\(sec\)/g) || []).length, 2);
});

test('OCR 자동등록은 툴바 안 칩으로 — 한 줄을 통째로 먹지 않는다', () => {
  const src = funcSource('_ocrToToolbar');
  assert.match(src, /tb\.insertBefore\(oz, tb\.firstChild\)/, '옮기기만 해야 등록 기능이 살아 있습니다');
  assert.match(src, /if\(oz\.parentNode===tb\) return;/, '두 번 옮기면 안 됩니다');
  // 폭은 「1280px 화면에서 툴바가 한 줄에 들어가는지」 실측해 정한 값이다(실측 58px = 한 줄).
  // 늘리면 툴바가 두 줄이 되어 틀고정 높이가 두 배가 된다.
  const m = source.match(/\.toolbar \.ocr-zone\{[^}]*max-width:(\d+)px/);
  assert.ok(m, 'OCR 칩 폭 제한이 있어야 합니다');
  assert.ok(Number(m[1]) <= 140, 'OCR 칩이 140px를 넘으면 툴바가 두 줄이 됩니다 (지금 ' + m[1] + 'px)');
  assert.match(source, /\.toolbar \.tb-input\{min-width:132px!important/, '검색창도 좁혀야 한 줄이 됩니다');
  // 표시개수 문구도 짧아야 한다 — 「79건 중 20건 표시」는 툴바를 넘겼다
  assert.match(funcSource('renderCareer'), />표시 <select/);
  assert.ok(!/건 중 '\+Math\.min/.test(funcSource('renderCareer')), '「N건 중 M건 표시」는 툴바를 넘겼습니다');
  assert.equal((funcSource('renderCareer').match(/_ocrToToolbar\(sec\)/g) || []).length, 2);
});

test('넘버 옆 □ 로 여러 건을 골라 한 번에 지운다', () => {
  const src = funcSource('renderCareer');
  assert.match(src, /class="rownum-h"><input type="checkbox" onclick="careerSelAll/, '머리줄에 전체선택');
  assert.match(src, /class="row-chk" data-id="'\+_jsAttr\(r\.id\)/, '행마다 체크 — 값은 레코드 id');
  assert.match(src, /careerSelSync\(name\)/);
  assert.match(src, /id="selbar-'\+name/, '선택했을 때만 뜨는 일괄 작업 줄');
  const del = funcSource('careerDelSelected');
  assert.match(del, /confirm\(/, '되돌릴 수 없으니 반드시 물어봐야 합니다');
  assert.match(del, /deleteFile\(r\.id\)/, '첨부 원본도 함께 지웁니다');
  assert.match(del, /set\(cfg\.store, arr\.filter/);
});

test('선택 기능은 목록 화면 전부가 공유한다 — 화면별 따로 만들지 않는다', () => {
  // renderCareer 가 유일한 생산지: 경력·실적·비용·제출서류가 모두 이 함수를 쓴다
  ['careerSelAll', 'careerSelSync', 'careerSelIds', 'careerDelSelected'].forEach((fn) => {
    assert.equal((source.match(new RegExp('function ' + fn + '\\(', 'g')) || []).length, 1,
      fn + ' 은 한 곳에만 있어야 합니다');
  });
  // 목록 표를 만드는 innerHTML 조립문도 하나뿐이어야 한다
  assert.equal((source.match(/box\.innerHTML=selBar\+'<table><thead>/g) || []).length, 1);
});

/* ===== 이력서 생성·보관 — 내 정보로 채우기 + 임시저장 (2026-08-29) ===== */

test('.hwp 양식도 자동 채움된다 — 한글 엔진으로 hwpx로 바꿔서', () => {
  // ⚠ 자동 채움은 XML을 고치므로 .hwp(이진)는 그대로는 못 채운다.
  //    실측 확인: 열기 → exportHwpx() → 채움 → 다시 열기 (잉크 2010→2883)
  const src = funcSource('_rhToHwpx');
  assert.match(src, /ext==='hwpx'/, 'hwpx는 그대로 씁니다');
  assert.match(src, /PureunHwp\.openDoc\(bytes, name\)/);
  assert.match(src, /doc\.exportHwpx\(\)/, '.hwp는 hwpx로 내보내 채웁니다');
  assert.match(src, /doc\.free\(\)/, 'WASM 기억은 스스로 안 비워집니다');
});

test('✨ 내 정보로 채우기 — 손으로 타이핑하지 않는다', () => {
  assert.match(source, /onclick="rhAutoFillDoc\(\)"/);
  /* ⚠ 2026-08-30: 채우는 길이 «하나»로 모였다. 단추가 부르는 것은 갈림길이고,
     칸 지도를 못 만든 서식만 사전 길(rhAutoFillDoc_사전)로 간다. */
  const 갈림길 = funcSource('rhAutoFillDoc');
  assert.match(갈림길, /rhFillByMap\(\)/, '칸 지도가 있으면 좋은 길로 가야 합니다');
  const src = funcSource('rhAutoFillDoc_사전');
  assert.match(src, /_rhToHwpx\(_rhDoc\.bytes, _rhDoc\.name\)/);
  assert.match(src, /KcareerHwpxFill\.autoFill\(s, data\)/);
  assert.match(src, /_cvFillData\(\)/, '프로필·경력에서 끌어옵니다');
  /* 전에는 「팝업으로 보여준다」를 못 박았다 — 대표 지시로 규칙이 바뀌었다.
     보여 주는 것은 그대로 지키되, 보던 화면 «그 자리»에 나와야 한다. */
  assert.match(src, /mountEditor\(filled/, '채운 결과를 바로 보여줘야 확인할 수 있습니다');
  assert.match(src, /rhDraftSave\(\)/, '채운 결과도 임시저장돼야 합니다');
});

test('최종 저장 전까지 계속 임시저장한다', () => {
  assert.match(source, /var RH_DRAFT='rh_draft'/);
  assert.match(funcSource('importTemplateFile'), /rhDraftSave\(\)/, '올리는 순간 임시저장');
  const save = funcSource('rhDraftSave');
  assert.match(save, /saveFileUnified\(RH_DRAFT/);
  assert.match(save, /rh_draft_meta/);
  // 화면을 열면 이어서 할 수 있어야 한다
  assert.match(source, /_safe\(\(\)=>rhDraftCheck\(\)\)/);
  assert.match(funcSource('rhDraftCheck'), /rhResumeBar/);
  assert.match(source, /onclick="rhDraftResume\(\);return false"/);
  // ⚠ 최종 저장이 끝나면 임시저장을 지운다 — 낡은 것을 가리키면 안 된다
  assert.match(funcSource('confirmResumeSave'), /rhDraftDrop\(\)/);
});

test('이력서 생성 화면의 중복을 없앴다', () => {
  // 「완성본 생성」이 위·아래 두 번, 「이력서 작성/프로필 작성」 버튼과 「이력서 모드」 딱지가
  // 같은 말을 두 번 하고 있었다. 카드 3개가 화면 절반을 먹던 것도 툴바 한 줄로.
  /* 올리기 줄은 2026-08-30 부터 탭줄과 «한 줄»로 합쳐져 패널 밖에 있다 —
     보는 자리를 「올리기 줄부터 탭2 앞까지」로 넓힌다. */
  const i = source.indexOf('id="rhUploadBar"');
  const j = source.indexOf('<!-- 탭4', i);
  const panel = source.slice(i, j);
  assert.ok(!/① 양식 업로드/.test(panel), '카드 번호(①②③)는 툴바로 합치며 없앴습니다');
  assert.ok(!/rhSetDomain\('resume'\)/.test(panel), '모드 버튼 두 개 대신 드롭다운 하나');
  assert.match(panel, /id="rhModeSel"/);
  // 주석에는 그 이름이 남아 있으므로 주석을 지운 뒤 실제 마크업만 본다
  const markup = panel.replace(/<!--[\s\S]*?-->/g, '');
  assert.equal((markup.match(/완성본 HWP 생성/g) || []).length, 0, '아래쪽 중복 버튼을 없앴습니다');
  assert.equal((markup.match(/기본정보 자동 채우기/g) || []).length, 0, '「내 정보로 채우기」로 합쳤습니다');
  assert.match(panel, /id="rhGenBtn"[^>]*style="display:none"/, '기존 호출자를 위해 숨겨 남깁니다');
});

/* ===== 회의·강의비 개인정보 동의서 자동 생성 (2026-08-27, 2단계 v1) ===== */

test('회의·기타비용 행에 📨 동의서 버튼이 있다', () => {
  /* 저장소 이름을 글자로 박지 않는다 — 두 화면을 하나로 합치면서(2026-08-29)
     줄마다 «자기 저장소»를 넘기게 바뀌었다. 여기서 보는 것은 «동의서를 부르는가»와
     «그 줄의 저장소를 함께 넘기는가»다. */
  /* 줄에서 부르는 자리만 본다(함수 «정의»는 빼야 한다 — 거기엔 r.id 가 없다) */
  const calls = (source.match(/feeConsentDoc\([^)]*\)/g) || []).filter((c) => c.indexOf('${') >= 0);
  assert.ok(calls.length >= 2, '두 비용 화면 모두에 동의서 단추가 있어야 합니다');
  calls.forEach((c) => assert.match(c, /r\.id/, '어느 건인지 넘겨야 합니다'));
  assert.ok(calls.some((c) => /_st|etcfee/.test(c)),
    '합친 표에서는 그 줄이 온 저장소를 넘겨야 남의 자리에 저장되지 않습니다');
});

test('동의서는 건의 정보를 채워 한글 뷰어로 띄운다', () => {
  const src = funcSource('feeConsentDoc');
  assert.match(src, /HWPX\.docTitle\('개인정보 수집·이용 동의서'\)/);
  assert.match(src, /HWPX\.tablePara\(/, '성명·일자·구분·금액 표가 있어야 합니다');
  assert.match(src, /r\.content/, '내용을 채워야 합니다');
  assert.match(src, /HWPX\.build\(body\)/);
  assert.match(src, /PureunHwp\.validate\(/, '만든 파일을 검증해야 합니다');
  assert.match(src, /openHwpViewer\(bytes, nm\)/, '뷰어로 떠야 🖨 PDF·⬇ 저장이 이어진다');
});

test('동의서 안전선 — 동의 칸을 미리 채우지 않고, 주민번호를 걷지 않는다', () => {
  const src = funcSource('feeConsentDoc');
  assert.match(src, /□ 동의함/, '동의 칸은 빈 네모여야 합니다 — 표시는 본인 몫');
  assert.ok(!/■ 동의함/.test(src), '⚠ 동의를 미리 채우면 동의의 효력이 없습니다');
  assert.ok(!/주민/.test(src.replace(/\/\*[\s\S]*?\*\//g, '')),
    '⚠ 비용 지급에 주민등록번호는 불필요 — 걷으면 안 됩니다');
  assert.match(src, /5년/, '보유기간을 밝혀야 합니다');
  assert.match(src, /거부/, '거부 권리와 불이익을 밝혀야 합니다');
});

/* ===== 기관 양식 자동 채움 (2026-08-27, 1단계) ===== */

test('양식 자동 채움 모듈이 로드되고 값채우기가 둘 다 한다 (토큰 + 라벨)', () => {
  assert.match(source, /<script src="js\/kcareer-hwpxfill\.js\?v=\d+"><\/script>/);
  const src = funcSource('hwpxFill');
  assert.match(src, /_fillTokens\(s,map,stat\)/, '기존 {{토큰}} 방식은 그대로 동작해야 합니다(하위호환)');
  assert.match(src, /KcareerHwpxFill\.autoFill\(s, data\)/, '토큰이 없어도 라벨로 채워야 합니다');
  assert.match(src, /Contents\\\/section\\d\+\\\.xml/, '라벨 채움은 본문(section)에만 적용합니다');
  assert.match(src, /KcareerHwpxFill\.summarize\(agg\)/, '무엇을 채웠는지 사람이 읽게 요약해야 합니다');
  // 토큰도 라벨도 못 찾으면 안내하고 멈춘다 — 빈 파일을 저장하지 않는다
  assert.match(src, /&& !auto\)/, '라벨 채움 결과도 성공 판정에 넣어야 합니다');
});

test('자동 채움 데이터는 빠른 이력서와 같은 출처를 쓴다', () => {
  const src = funcSource('_cvFillData');
  ['profile_info', "get('edu')", "get('wiccok')", "get('consult')", "get('case')", "get('lecture')"]
    .forEach((k) => assert.ok(src.indexOf(k) >= 0, k + ' 를 써야 합니다'));
  // 목록 표 열쇠와 같은 필드명이어야 매핑된다
  assert.match(src, /period:/); assert.match(src, /school:/); assert.match(src, /role:/);
});

test('한글 뷰어에 🖨 PDF — 캔버스를 A4 그대로 인쇄한다', () => {
  assert.match(source, /onclick="hwpViewPdf\(\)"/);
  const src = funcSource('hwpViewPdf');
  assert.match(src, /#hwpViewBody canvas/, '이미 그려진 쪽을 그대로 쓴다');
  assert.match(src, /@page\{size:A4;margin:0\}/, 'A4 꽉 채워야 한글 모양 그대로다');
  assert.match(src, /page-break-after:always/, '쪽마다 끊어야 합니다');
  assert.match(src, /toDataURL/, '캔버스를 그림으로 옮겨 인쇄합니다');
  assert.match(src, /w\.onload/, '그림이 실리기 전에 인쇄하면 빈 쪽이 나옵니다');
});

test('백업에서 되살리기 — 날짜마다 건수를 세어 고를 수 있게 한다', () => {
  // 공용 백업 패널은 날짜만 보여줘 어느 시점이 온전한지 알 수 없었다(실사용에서 막혔다)
  assert.match(source, /id="modalRecover"/);
  assert.match(source, /id="kcRecoverBody"/);
  const open = funcSource('kcRecoverOpen');
  assert.match(open, /systemBackupsIndex\/'\+KC_BK_SYS/, '백업 색인을 읽어야 합니다');
  assert.match(open, /_kcBkWiccok\(/, '백업마다 위촉장 건수를 세야 합니다');
  assert.match(open, /서류 폴더 스캔/, '백업으로 못 되살릴 때 다음 수를 알려줘야 합니다');
  // ⚠ 본문 전체(수 MB)를 받지 말고 위촉장 배열만 콕 집어 읽는다
  assert.match(funcSource('_kcBkWiccok'), /paths\/0\/value\/ls\/wiccok/);
  // 두 단계(클라우드 되돌리기 + 이 기기로 내리기)를 한 번에 해야 한다
  const run = funcSource('kcRecoverRun');
  assert.match(run, /PUBackup\.snapshot\(\)/, '되돌리기 전에 지금 상태를 백업해야 합니다');
  assert.match(run, /fbDb\.ref\(\)\.update\(updates\)/, '클라우드를 되돌려야 합니다');
  assert.match(run, /localStorage\.setItem\(NS\+bare/, '이 기기까지 내려야 화면이 바뀝니다');
  assert.match(run, /confirm\(/, '덮어쓰기 전에 물어봐야 합니다');
  // 진입점 두 곳
  assert.match(source, /onclick="kcRecoverOpen\(\)"/);
  const i = source.indexOf('id="fbLossNotice"');
  assert.match(source.slice(i, i + 1200), /kcRecoverOpen\(\);return false/);
});

test('공용 백업 모듈은 읽기만 한다 — 다른 앱과 함께 쓰기 때문', () => {
  // js/pu-backup.js 를 고치면 급여·명함첩·기금까지 영향을 받는다
  const bk = fs.readFileSync(path.join(__dirname, '..', 'js', 'pu-backup.js'), 'utf8');
  assert.match(bk, /window\.PUBackup =/, '공용 모듈이 그대로 있어야 합니다');
  assert.match(funcSource('kcRecoverRun'), /window\.PUBackup && PUBackup\.snapshot/,
    '공용 모듈은 공개된 함수만 불러 씁니다');
});

test('백업 재촉은 실제로 불리고, 안 사라지는 띠로 보인다', () => {
  // ⚠ 예전엔 만들어만 놓고 아무도 부르지 않아 한 번도 뜨지 않았다 (마지막 백업 76일 전 방치)
  assert.match(source, /_safe\(checkBackupReminder\);/, '부팅 때 부르지 않으면 영원히 안 뜹니다');
  assert.match(source, /id="bkNotice"/);
  assert.match(source, /id="bkMsg"/);
  const src = funcSource('checkBackupReminder');
  // 한 번도 백업 안 한 사람에게도 알려야 한다 — 예전엔 !d면 그냥 return 했다
  assert.match(src, /days==null/, '백업 기록이 없는 사람에게도 알려야 합니다');
  assert.ok(!/if\(total===0\|\|!d\) return/.test(src), '⚠ !d로 빠져나가면 최고 위험군이 안내를 못 받습니다');
  assert.match(src, /bkNotice/);
  assert.match(src, /FB_COUNT_KEYS/, '모든 스토어를 세야 실제 규모가 나옵니다');
  // 백업을 받으면 띠를 내린다
  assert.match(funcSource('backupExport'), /bkNotice[\s\S]{0,60}display='none'/);
  const i = source.indexOf('id="bkNotice"');
  assert.match(source.slice(i, i + 800), /onclick="backupExport\(\);return false"/);
});

test('시드(기본 데이터) 건수 — 지금 화면과 대조할 진단 기준', () => {
  // 시드 wiccok 86건 = 위촉장 79 + 표창 7. 위촉장 탭이 79건이면 시드로 되돌아간 것이다.
  const i = source.indexOf('window.__SEED__=');
  assert.ok(i > 0, '시드 데이터를 찾을 수 없습니다');
  const j = source.indexOf('</script>', i);
  const seed = JSON.parse(source.slice(i + 'window.__SEED__='.length, j).replace(/;\s*$/, ''));
  const w = seed.wiccok || [];
  assert.equal(w.length, 86, '시드 wiccok 건수가 바뀌면 진단 기준도 바뀝니다');
  assert.equal(w.filter((r) => r.type === '위촉장').length, 79);
  assert.equal(w.filter((r) => r.src || r.relPath || r.genFileId || r.origFileId).length, 0,
    '시드에는 원본이 붙어 있지 않다 — 그래서 시드로 돌아가면 원본도 전부 사라진 것처럼 보인다');
});

/* ===== 메뉴·대시보드 배치 기기 간 동기화 (2026-08-24) ===== */

test('배치를 바꾸면 네 곳 모두 배치 동기화를 부른다', () => {
  ['setNavState', 'setFavState', 'setNavOrder', 'setGroupOrder'].forEach((fn) => {
    const m = source.match(new RegExp('function ' + fn + '\\([^\\n]*'));
    assert.ok(m, fn + '이 있어야 합니다');
    assert.match(m[0], /navSyncPush\(\)/, fn + ' 뒤에 배치를 올려야 합니다');
  });
});

test('배치 동기화는 배치 열쇠만 담고 기록은 건드리지 않는다', () => {
  const p = funcSource('_navSyncPayload');
  assert.match(p, /nav_state/);
  assert.match(p, /favs/);
  assert.match(p, /nav_grp_order/);
  assert.match(p, /navOrderKey\(g\.g\)/, '그룹별 순서(nod_*)도 담아야 합니다');
  // 기록(위촉장·실적 등)이 섞이면 배치 동기화가 자료를 덮게 된다
  ['wiccok', 'consult', 'certdoc', 'fbGatherLS'].forEach((k) => {
    assert.ok(!new RegExp(k).test(p), '배치 동기화에 ' + k + '가 들어가면 안 됩니다');
  });
  const push = funcSource('navSyncPush');
  assert.match(push, /kcareer\/'\+fbUid\+'\/nav/, '배치는 전용 nav 노드에만 씁니다');
  assert.match(push, /if\(_navSyncApplying\) return;/, '받아 적용하는 중에 되돌려 보내면 메아리가 됩니다');
});

test('배치 동기화는 메아리를 걸러내고 첫 수신은 조용하다', () => {
  const w = funcSource('navSyncWatch');
  assert.match(w, /if\(_navSyncSame\(v\)\) return;/, '이미 같은 배치면 무시해야 합니다');
  assert.match(w, /var first=!_navSyncSeen/);
  assert.match(w, /if\(!first\) toast\(/, '켤 때마다 알림이 뜨면 시끄럽습니다');
  assert.match(w, /buildNav\(\)/, '받은 배치를 화면에 반영해야 합니다');
});

test('최신 판정을 기기 시계로 하지 않는다 — 시계가 느린 기기도 반영된다', () => {
  // ⚠ v.at<=_navSyncAt 로 거르면 폰 시계가 PC보다 느릴 때 폰 변경이 영영 무시된다
  const w = funcSource('navSyncWatch');
  assert.ok(!/v\.at<=/.test(w), '⚠ 시계 비교로 최신을 판정하지 말 것');
  const same = funcSource('_navSyncSame');
  ['state', 'favs', 'grpOrder', 'orders'].forEach((k) => {
    assert.ok(same.indexOf(k) >= 0, '_navSyncSame이 ' + k + '를 비교해야 합니다');
  });
});

test('로그아웃하면 배치 리스너를 실제로 뗀다', () => {
  // ⚠ 표시만 내리면 재로그인마다 리스너가 쌓여 알림·buildNav가 여러 번 돈다
  const stop = funcSource('navSyncStop');
  assert.match(stop, /_navSyncRef\.off\('value'\)/, 'off로 리스너를 떼야 합니다');
  assert.match(stop, /_navSyncWatching=false/);
  assert.match(stop, /_navSyncSeen=false/);
  assert.match(funcSource('navSyncWatch'), /_navSyncRef=fbDb\.ref\(/, '뗄 수 있게 ref를 들고 있어야 합니다');
  assert.match(source, /if\(typeof navSyncStop==='function'\)\{ try\{ navSyncStop\(\); \}catch\(e\)\{\} \}/,
    '로그아웃 분기에서 불러야 합니다');
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
  assert.match(src, /_cvHwpCountT=setTimeout\(function\(\)\{ cvHwpCount\(\); \}, 900\)/,
    '엔진이 있으면 잠잠해진 뒤 한글 값으로 다시 셉니다');
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
  // 보관함을 그리는 코드는 renderFormLib 하나다(2026-08-30 통합)
  assert.match(funcSource('renderFormLib'), /cvFormHwpView/);
  assert.match(funcSource('hwpxFill'), /openHwpViewer\(await blob\.arrayBuffer\(\)/);
});

test('쪽 나눔 빈 줄을 걷어낸 뒤 한글 문서를 만든다', () => {
  // ⚠ 공용 서식층(tableFrom)은 skip으로 「칸」만 거르고 「행」은 버리지 않는다.
  //    그대로 두면 쪽 경계마다 빈 표 줄이 문서에 남는다(실측: 화면 쪽수-1 개).
  const src = funcSource('_cvBuildHwpx');
  assert.match(src, /_cvStripGaps\(sheet\)/, '만들기 전에 화면 전용 빈 줄을 걷어내야 합니다');
  assert.match(src, /finally \{\s*if\(hadGaps\) cvPaginate\(\);/, '만든 뒤 화면 쪽 나눔을 되돌려야 합니다');
  // ⚠ 여기서 자를 다시 그리면 cvHwpCount를 거쳐 되돌아와 무한히 돈다
  //    (주석에도 그 이름이 나오므로 주석을 지운 뒤 실제 코드만 본다)
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(!/cvRenderGuide/.test(code), '⚠ _cvBuildHwpx에서 자를 다시 그리면 무한 재귀입니다');
});

test('화면 쪽 수와 한글 쪽 수가 다르면 둘 다 밝힌다', () => {
  // 시트 옆 배지는 화면 기준(1/3 쪽)인데 툴바는 한글 기준(A4 2장)이라 서로 모순으로 보였다
  const cnt = funcSource('cvHwpCount');
  assert.match(cnt, /\(화면 '\+_cvScreenPages\+'장\)/, '다를 때는 화면 쪽 수도 함께 적어야 합니다');
  const guide = funcSource('cvRenderGuide');
  assert.match(guide, /_cvScreenPages=n;/, '화면 쪽 수를 기억해 둬야 비교할 수 있습니다');
  assert.match(guide, /화면 미리보기 기준입니다/, '시트 옆 배지가 어느 기준인지 밝혀야 합니다');
});

test('한글 쪽 수 세기가 겹쳐 돌지 않는다', () => {
  // 먼저 시작한 셈이 나중에 끝나면 옛 쪽 수가 배지에 남는다
  const src = funcSource('cvHwpCount');
  assert.match(src, /if\(_cvHwpCountBusy\) return;/);
  assert.match(src, /finally\{ _cvHwpCountBusy=false; \}/);
});

/* ===== ★ 이력서관리 통합 (2026-08-30) =====
   전에는 문이 넷(이력서 생성·보관 / 빠른 이력서 / 프로필 작성보관 / 경력증명서 보관)이고
   보관함이 «다섯 자리»에 흩어져 있었다 — 세 화면 + 허브 안쪽 탭 둘. 게다가 그리는 코드가
   둘(renderDocStore / renderRhDocList)이라 저장해도 한쪽이 갱신되지 않았다.
   이제 문은 둘, 보관함은 한 화면 세 탭, 그리는 코드는 하나다. */

test('★ 보관함을 그리는 코드는 «하나»다 — renderRhDocList 를 되살리지 않는다', () => {
  assert.equal(source.indexOf('function renderRhDocList'), -1,
    '⚠ 두 번째 렌더러를 되살리면 「저장했는데 보관함에 안 보인다」가 돌아옵니다');
  ['confirmResumeSave', 'delDoc'].forEach((fn) => {
    assert.match(funcSource(fn), /renderDocStore\(domain\)/, fn + ' 이 보관함을 그려야 합니다');
  });
  // 저장한 종류의 탭으로 옮겨 줘야 방금 담은 것이 보인다
  assert.match(funcSource('confirmResumeSave'), /dbTab\(domain\)/,
    '저장하면 그 종류 탭으로 옮겨야 방금 담은 것이 바로 보입니다');
});

test('★ 보관함은 한 화면 세 탭이다 — 종류가 늘어도 화면을 새로 만들지 않는다', () => {
  ['page-quickcv', 'page-resume-store'].forEach((dead) => {
    assert.equal(source.indexOf('id="' + dead + '"'), -1, dead + ' 화면은 통합됐습니다');
  });
  ['db-resume', 'db-profile', 'db-certdoc'].forEach((id) => {
    assert.ok(source.indexOf('id="' + id + '"') > 0, id + ' 탭이 있어야 합니다');
  });
  // 세 종류가 «같은 화면»을 가리켜야 한 곳에서 그려진다
  const dm = source.slice(source.indexOf('const DOMAINS={'), source.indexOf('const KIND_DEFAULTS'));
  assert.equal((dm.match(/page:'page-docbox'/g) || []).length, 3,
    '이력서·프로필·증명서가 모두 page-docbox 를 가리켜야 합니다');
  /* ⚠ 칸 id 는 종류마다 달라야 한다(rs*·pf*·cd*) — 같게 만들면 숨은 탭을 그릴 때
     서로 덮어써서 목록이 뒤섞인다. renderDocStore 를 손대지 않은 이유이기도 하다. */
  ['rsBody', 'pfBody', 'cdBody'].forEach((id) => {
    assert.equal((source.match(new RegExp('id="' + id + '"', 'g')) || []).length, 1,
      id + ' 는 한 곳에만 있어야 합니다');
  });
});

test('★ 빠른 이력서는 「서류 만들기」의 첫 탭이다 — 화면이 사라진 게 아니다', () => {
  const hub = source.slice(source.indexOf('id="page-resume-hub"'), source.indexOf('id="page-docbox"'));
  assert.ok(hub.indexOf('id="dm-quick"') > 0, '빠른 이력서 탭이 허브 안에 있어야 합니다');
  assert.ok(hub.indexOf('id="cvSheet"') > 0, '이력서 시트가 함께 옮겨져야 합니다');
  assert.match(funcSource('rhTab'), /dm-quick[\s\S]{0,40}renderQuickCV/,
    '탭을 누르면 빠른 이력서를 다시 그려야 합니다');
  // 다른 화면에서 부르는 goCV 도 새 자리를 가리켜야 한다
  assert.match(funcSource('goCV'), /page-resume-hub[\s\S]{0,220}dm-quick/,
    'goCV 가 허브의 빠른 이력서 탭으로 가야 합니다');
});

test('죽은 화면 page-resume-create 를 되살리지 않는다 — 같은 id 20개가 겹쳤다', () => {
  // 사이드바에도 없고 아무도 nav_to 하지 않는데 rhwpEditor·rcEditCard 등 id 20개가 중복이었다.
  // getElementById 는 앞의 것만 주므로 섹션 순서가 바뀌면 편집 화면이 안 보이는 쪽에 붙는다.
  assert.equal(source.indexOf('page-resume-create'), -1, '⚠ 죽은 화면을 되살리지 말 것');
  ['rcDrop', 'rcEditCard', 'rhwpEditor', 'docxEditor', 'rcDragList', 'rcSaveBtn'].forEach((id) => {
    assert.equal((source.match(new RegExp('id="' + id + '"', 'g')) || []).length, 1,
      id + ' 은 한 곳에만 있어야 합니다 (중복이면 조용히 엉뚱한 곳에 붙습니다)');
  });
});

test('한글 뷰어는 형식을 못박지 않고 인라인 스타일을 정리한다', () => {
  const dl = funcSource('hwpViewDownload');
  assert.ok(!/'hwpx'\)/.test(dl), "⚠ 형식을 'hwpx'로 못박으면 옛 .hwp가 잘못된 MIME으로 저장됩니다");
  assert.match(dl, /PureunHwp\.download\(_hwpView\.bytes, _hwpView\.name\)/);
  // renderPreview가 cssText에 덧붙이기(+=)로 넣으므로 닫을 때 지워야 쌓이지 않는다
  assert.match(funcSource('closeHwpView'), /removeAttribute\('style'\)/);
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

/* ===== ★ 한자 성명 + 기관 양식 보관함 하나로 (2026-08-30) ===== */

test('★ 한자 성명 칸에 「漢」 고르기가 붙어 있다 — IME 한자 키가 안 먹던 칸이다', () => {
  assert.match(source, /<script src="js\/kcareer-hanja\.js/, '한자 모듈을 불러와야 합니다');
  const rp = funcSource('renderPersonal');
  assert.match(rp, /k==='nameHanja'/, '한자 성명만 따로 그려야 합니다');
  assert.match(rp, /hjOpen\(\)/, '漢 단추가 있어야 합니다');
});

test('★ 한자는 «고르게만» 한다 — 지어서 넣으면 위촉 서류에 틀린 이름이 박힌다', () => {
  const open = funcSource('hjOpen');
  // 후보를 자동으로 골라 넣는 코드가 있으면 안 된다
  assert.ok(!/_hjPick\s*=\s*cands\.map\(function\s*\(c[^)]*\)\s*\{\s*return\s+c\.list\[0\]/.test(open),
    '⚠ 첫 후보를 자동으로 고르면 안 됩니다 — 어느 한자가 본인 이름인지는 본인만 압니다');
  assert.match(open, /직접 입력/, '표에 없는 소리를 위해 직접 입력을 열어 둬야 합니다');
  // 넣기만 하고 저장까지 하지 않는다 — 다른 칸을 고치던 중일 수 있다
  const apply = funcSource('hjApply');
  assert.ok(!/savePersonalInfo\(\)/.test(apply), '⚠ 자동 저장하지 말 것 — 다른 칸이 함께 덮입니다');
  assert.match(apply, /기본정보 저장/, '저장하라고 알려 줘야 합니다');
});

test('★ 기관 양식 보관함은 «하나»다 — 담는 곳도 그리는 곳도', () => {
  // 종류별로 갈라 담던 것을 없앴다
  ['resume_tpl', 'profile_tpl', 'certdoc_tpl'].forEach((k) => {
    assert.equal(source.indexOf("tplKey:'" + k + "'"), -1, k + ' 로 갈라 담지 않습니다');
  });
  assert.equal(source.indexOf('function renderTplLib'), -1,
    '⚠ 두 번째 렌더러를 되살리면 「어디서 올렸느냐」에 따라 안 보이는 보관함이 다시 생깁니다');
  assert.equal(source.indexOf('function tplList'), -1, 'tplList 도 함께 없앴습니다');
  // 그리는 자리는 data-formlib 로만 늘린다
  const mounts = (source.match(/data-formlib/g) || []).length;
  assert.ok(mounts >= 4, '그리는 자리가 네 곳 이상이어야 합니다 (지금 ' + mounts + ')');
  assert.match(funcSource('renderFormLib'), /querySelectorAll\('\[data-formlib\]'\)/,
    '한 코드가 모든 자리를 그려야 합니다');
});

test('★ 옛 양식 보관함을 옮기는 코드가 «불리고» 있다 — 만들어만 두면 소용없다', () => {
  assert.match(source, /_safe\(_tplMerge\)/, '부팅 순서에 넣어야 합니다');
  const m = funcSource('_tplMerge');
  assert.match(m, /seen\[t\.id\]/, '이미 있는 것은 두 번 담지 않아야 합니다(멱등)');
  assert.match(m, /set\(k,\[\]\)/, '옮긴 뒤 비워야 다음에 또 옮기지 않습니다');
  // ⚠ 파일 자체를 지우면 안 된다 — 목록만 합친다
  assert.ok(!/deleteFile/.test(m), '⚠ 이사하면서 원본 파일을 지우면 안 됩니다');
});

test('★ 보관함의 양식을 이 화면 편집기로 열 수 있다 — 전에는 한쪽에서만 되던 일', () => {
  const f = funcSource('renderFormLib');
  ['fbOpenInEditor', 'cvFormHwpView', 'hwpxFill', 'downloadFile', 'cvDelForm'].forEach((fn) => {
    assert.ok(f.indexOf(fn) > 0, fn + ' 이 칩에 있어야 합니다');
  });
  assert.match(funcSource('fbOpenInEditor'), /mountEditor\(/, '편집기에 얹어야 합니다');
});

/* ===== ★ 직원 관리를 푸른이알피에서 (2026-08-30) ===== */

test('★ 직원 명부는 푸른이알피(data/user_dir)에서 온다 — 정부컨설팅이 아니다', () => {
  const src = funcSource('fbLoadStaff');
  assert.match(src, /ref\('data\/user_dir'\)/, 'pu-erp 명부를 읽어야 합니다');
  assert.ok(!/scal_staff/.test(src), '⚠ 정부컨설팅 명부로 되돌리면 재직자 5명만 옵니다');
  assert.ok(source.indexOf('푸른이알피에서 직원 불러오기') > 0, '단추 이름도 바뀌어야 합니다');
});

test('★ pu-erp 봉투를 벗긴다 — 안 벗기면 「직원 2명」이 나온다', () => {
  // data/{키}={v:값,u:시각} 이라 그대로 세면 v·u 둘을 직원으로 센다
  assert.match(funcSource('fbLoadStaff'), /_puUnwrap\(snap\.val\(\)\)/,
    '⚠ _puUnwrap 을 빼면 배열 대신 [값,시각] 두 개를 받습니다');
});

test('★ 재직·휴직·퇴사를 «모두» 받아 상태를 그대로 담는다', () => {
  const src = funcSource('fbLoadStaff');
  // 상태로 걸러내면 안 된다 — 대표 지시는 「모든 직원」이다
  assert.ok(!/filter\([^)]*status[^)]*retired/.test(src), '⚠ 퇴사자를 걸러내면 안 됩니다');
  assert.match(src, /pu:String\(u\.status\|\|'active'\)/, '상태를 그대로 담아야 합니다');
  assert.match(source, /PU_STAFF_STATUS=\{active:'재직', leave:'휴직', retired:'퇴사'\}/);
});

test('★ 퇴사자를 갈라 본다 — 기본은 재직', () => {
  const r = funcSource('renderStaffMgr');
  ['active', 'leave', 'retired', 'all'].forEach((v) => {
    assert.ok(r.indexOf("['" + v + "'") > 0, v + ' 칸이 있어야 합니다');
  });
  assert.match(source, /var _staffView='active'/, '기본은 재직입니다');
  assert.match(r, /_staffView==='all' \|\| \(s\.pu\|\|'active'\)===_staffView/, '고른 상태만 보여야 합니다');
});

test('★ 「퇴사」와 「이름 가림」은 다른 것이다 — 섞으면 증명서 발급이 저절로 막힌다', () => {
  const r = funcSource('renderStaffMgr');
  // pu-erp 가 퇴사라고 해서 자동으로 가림을 켜면 안 된다
  assert.ok(!/pu==='retired'[\s\S]{0,120}setStaffStatus/.test(r),
    '⚠ 퇴사자의 이름 가림을 저절로 켜면 실적증명서 발급이 말없이 막힙니다');
  // 안내 문구는 표 아래 한 곳(_staffFoot)에서만 만든다
  assert.match(funcSource('_staffFoot'), /저절로 켜지지 않습니다/, '다르다는 것을 화면에 적어야 합니다');
  // 무엇이 막히는지 밝히고 묻는다
  assert.match(funcSource('staffRetire'), /실적증명서를 발급할 수 없게/,
    '무엇이 막히는지 확인창에 적어야 합니다');
});

test('★ 명부 열쇠가 바뀌어도 이름 가림을 잃지 않는다', () => {
  // 전에는 정부컨설팅 id, 이제는 푸른이알피 사번(sid)
  const m = funcSource('_staffMigrateMeta');
  assert.match(m, /r\.name===byName/, '이름으로 옮겨 줘야 합니다');
  assert.match(m, /!m\[hit\.id\]/, '이미 옮긴 것은 건드리지 않아야 합니다(멱등)');
  assert.match(funcSource('setStaffStatus'), /name:\(r&&r\.name\)/, '가림 기록에 이름을 남겨야 합니다');
  assert.match(funcSource('fbLoadStaff'), /_staffMigrateMeta\(roster\)/, '불러올 때 옮겨야 합니다');
});
