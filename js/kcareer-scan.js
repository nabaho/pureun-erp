'use strict';
// 푸른노무법인 경력관리 — 서류 폴더 스캔·판정 모듈
// (브라우저 window.KcareerScan / Node module.exports 겸용, DOM·브라우저 API 미사용)
// 설계서: docs/superpowers/specs/2026-07-31-kcareer-일괄등록-design.md
(function (root) {

  /* ===== 읽지 않는 파일 ===== */
  var IGNORE_PREFIX = /^(\.~lock\.|~\$)/;   // 엑셀·한글 임시·잠금 파일
  var IGNORE_EXACT = ['4NZFL.DOCX'];        // OneDrive 부산물(0바이트, 모든 폴더에 존재)
  var IGNORE_EXT = ['md'];                  // 작업 문서는 서류가 아니다

  function extOf(name) {
    var s = String(name == null ? '' : name);
    var dot = s.lastIndexOf('.');
    if (dot <= 0) return '';
    return s.slice(dot + 1).toLowerCase();
  }

  function isIgnoredFile(name) {
    var s = String(name == null ? '' : name);
    if (!s) return true;
    if (IGNORE_PREFIX.test(s)) return true;
    if (IGNORE_EXACT.indexOf(s) >= 0) return true;
    var ext = extOf(s);
    if (!ext) return true;                       // 확장자 없는 부산물(test_write 등)
    if (IGNORE_EXT.indexOf(ext) >= 0) return true;
    return false;
  }

  /* ===== 이름 정리 =====
     발급일 괄호와 연번을 떼어, 뒤에서 '이름 끝 단어'를 정확히 볼 수 있게 만든다.

     앞쪽 정리 연번을 떼는 이유: 같은 충남도청 표창장이 실제 폴더에
     '2018충남도청- 표창장' · '7-1. 2018충남도청- 표창장' · '9-1.충남도청- 표창장' · '18. 충남도청- 표창장'
     으로 흩어져 있다. 연번을 남기면 서로 다른 서류로 보여 중복관리가 잡지 못한다.
     ⚠ 앞이 연도(19xx·20xx)면 연번이 아니므로 떼지 않는다. */
  function cleanCore(name) {
    return String(name == null ? '' : name)
      .replace(/\.[^.]+$/, '')                                        // 확장자
      .replace(/^\s*\d{1,3}(?:[-.]\d{1,3})+\s*\.?\s*/, '')            // 7-1. · 9-3 · 10-2 · 1-1.
      .replace(/^\s*\d{1,3}\s*[.\-]\s*/, '')                          // 18. · 4. · 2.
      .replace(/\(\s*20\d{2}[.\-]\d{1,2}[.\-]\d{1,2}\s*\)/g, '')      // (2015.05.07)
      .replace(/\s*\(\d+\)\s*$/, '')                                  // (1) (2) 사본 연번
      .replace(/[\s_\-]+$/, '')
      .trim();
  }

  /* ===== 3단계 판정 =====
     종류에 따라 규칙이 다르다.
     · 위촉장·표창·자격증 계열 = "이름 끝"만 인정 ('위촉장 목록'·'위촉식 시나리오' 오탐 방지)
     · 증명서 계열           = "이름 어느 자리에든" 인정 (증명서_대상_본인이름 꼴이 흔하다) */
  var ORIG_EXT = /\.(pdf|jpg|jpeg|png|hwp|hwpx)$/i;
  var RESULT_END = /(위촉장|위촉계약서|재위촉|위촉서|표창장|표창|포상|상장|자격증|수료증|이수증|협약서)$/;
  /* ⚠ 증명서 낱말을 RESULT_END에 되돌려 넣지 말 것 — 끝만 보면 205건 중 15건밖에 못 잡는다
     (실측 2026-08-06: 190건 누락. '경력증명서-푸른'·'…증명서_성문전자(주)_권형하' 등). */
  var CERT_ANY = /실적\s*증명|수행실적\s*증명|경력증명|재직증명|참여확인서|수행확인서|용역수행|수행\s*확인/;
  var RESULT_ANY = /위촉장|위촉계약|재위촉|표창|포상|상장|자격증|수료증|이수증|협약서|경력증명|실적증명|참여확인|수행확인/;
  // ⚠ 부정어에 '회의'를 넣지 말 것 — '상공회의소 위촉장'이 오탐된다(설계서 7.3).
  var NEGATIVE = /동의서|신청서|제출|공고|양식|서식|명단|시나리오|좌석|추천\s*계획|모집|목록|초안|회의록|회의자료|교재|자료집|매뉴얼/;

  // 이름 끝 단어 → 어느 목록으로 갈지 (증명서는 CERT_ANY로 따로 판정한다)
  var KIND_MAP = [
    { re: /(위촉장|위촉계약서|재위촉|위촉서)$/,                  store: 'wiccok',  type: '위촉장', titleHint: '' },
    { re: /협약서$/,                                          store: 'wiccok',  type: '협약서', titleHint: '' },
    { re: /(표창장|표창|포상|상장)$/,                           store: 'wiccok',  type: '표창',   titleHint: '' },
    { re: /자격증$/,                                          store: 'cert',    type: '',       titleHint: '자격' },
    { re: /(수료증|이수증)$/,                                  store: 'cert',    type: '',       titleHint: '수료' }
  ];

  function mapKind(core) {
    for (var i = 0; i < KIND_MAP.length; i++) {
      if (KIND_MAP[i].re.test(core)) return KIND_MAP[i];
    }
    return null;
  }

  /* 증명서 성격 — 기관이 내 실적을 증명한 것(ext)과 푸른이 본인 경력을 증명한 것(own).
     외부기관 실적 탭 기관 묶음에는 ext만 붙어야 한다(설계서 5). */
  var CERT_EXT = /실적\s*증명|수행실적\s*증명|참여확인서|수행확인서|용역수행|수행\s*확인/;
  var CERT_OWN = /경력증명|재직증명/;
  function certKindOf(core) {
    var s = String(core || '');
    if (CERT_EXT.test(s)) return 'ext';
    if (CERT_OWN.test(s)) return 'own';
    return '';
  }

  function classify(name) {
    if (isIgnoredFile(name)) return { level: 'ignore' };
    var core = cleanCore(name);
    var neg = NEGATIVE.test(core);
    var isOrig = ORIG_EXT.test(String(name));
    if (isOrig && !neg) {
      /* 증명서 — 이름 어느 자리에든 */
      if (CERT_ANY.test(core)) {
        var ck = certKindOf(core);
        if (ck) return { level: 'sure', store: 'certdoc', type: '', titleHint: '', certKind: ck };
      }
      /* 위촉장·표창·자격증 계열 — 이름 끝만 */
      if (RESULT_END.test(core)) {
        var k = mapKind(core);
        if (k) return { level: 'sure', store: k.store, type: k.type, titleHint: k.titleHint };
      }
    }
    if (RESULT_ANY.test(core) && !neg) return { level: 'maybe' };
    return { level: 'submission' };
  }

  /* ===== 연도·기관·건 키 =====
     7번 폴더 파일은 '위촉장.jpg'처럼 맨몸 이름이 많아 연도·기관을 경로에서 얻어야 한다. */
  var CASE_ROOT = '7. 컨설턴트,위원신청등';

  function pickYear(name, relPath, mtimeISO) {
    var m = String(name == null ? '' : name).match(/(20\d{2})/);
    if (m) return { year: m[1], from: 'name', needCheck: false };
    var p = String(relPath == null ? '' : relPath).match(/(20\d{2})년/);
    if (p) return { year: p[1], from: 'path', needCheck: false };
    var t = String(mtimeISO == null ? '' : mtimeISO).match(/^(\d{4})/);
    if (t) return { year: t[1], from: 'mtime', needCheck: true };
    return { year: '', from: 'none', needCheck: true };
  }

  function orgFromCaseDir(dirName) {
    return String(dirName == null ? '' : dirName)
      .replace(/^\s*20\d{2}\s*년?/, '')        // 앞쪽 연도(2019, 2019년)
      .replace(/^[\s.\-_]+/, '')               // 뒤따르는 구분자
      .trim();
  }

  // 7번 폴더의 '연도/건' 2단계까지를 건 키로 본다. 그 밖은 파일 1개 = 1건.
  function caseKeyOf(relPath) {
    var segs = String(relPath == null ? '' : relPath).split('/');
    if (segs[0] === CASE_ROOT && segs.length >= 4) return segs.slice(0, 3).join('/');
    return null;
  }

  /* ===== 레코드 조립 =====
     3,691개를 파일 단위로 넣으면 목록이 못 쓰게 되므로 7번은 건 폴더 단위로 묶는다.
     승격된 파일은 건의 첨부 목록에도 그대로 남긴다(경로 참조라 복제가 아니다). */
  function buildRecords(files, opts) {
    opts = opts || {};
    var scanId = opts.scanId || 'S0';
    var out = { promotions: [], maybes: [], submissions: [], copies: [], ignored: 0 };
    var copySeen = {};       // name|size → 최초 relPath
    var caseMap = {};        // caseKey → 건 레코드
    var caseOrder = [];

    (files || []).forEach(function (f) {
      if (isIgnoredFile(f.name)) { out.ignored++; return; }

      var caseKey = caseKeyOf(f.relPath);
      var y = pickYear(f.name, f.relPath, f.mtime);
      var org = caseKey ? orgFromCaseDir(caseKey.split('/')[2]) : '';

      /* 건 첨부 목록에는 사본도 남긴다.
         같은 자격증을 여러 사업에 냈다는 사실 자체가 기록이므로, 사본을 빼면
         '그 사업에 무엇을 냈는지'가 사라진다. 사본은 승격에서만 제외한다. */
      if (caseKey) {
        if (!caseMap[caseKey]) {
          caseMap[caseKey] = {
            caseDir: caseKey, year: y.year, org: org, title: caseKey.split('/')[2],
            files: [], promoted: [], fileCount: 0, src: 'fs', scanId: scanId
          };
          caseOrder.push(caseKey);
        }
        caseMap[caseKey].files.push({
          name: f.name, relPath: f.relPath, size: f.size, mtime: f.mtime, ext: extOf(f.name)
        });
      }

      var ck = f.name + '|' + f.size;
      if (copySeen[ck]) { out.copies.push({ name: f.name, relPath: f.relPath, sameAs: copySeen[ck] }); return; }
      copySeen[ck] = f.relPath;

      var c = classify(f.name);

      if (c.level === 'sure') {
        out.promotions.push({
          store: c.store, type: c.type, titleHint: c.titleHint,
          name: f.name, relPath: f.relPath, fileSize: f.size, fileMtime: f.mtime,
          year: y.year, yearFrom: y.from, needCheck: y.needCheck,
          org: org, fromCase: caseKey || '', src: 'fs', scanId: scanId
        });
        if (caseKey) caseMap[caseKey].promoted.push(f.relPath);
      } else if (c.level === 'maybe') {
        out.maybes.push({
          name: f.name, relPath: f.relPath, fileSize: f.size, fileMtime: f.mtime,
          year: y.year, org: org, fromCase: caseKey || '', src: 'fs', scanId: scanId
        });
      } else if (!caseKey) {
        out.submissions.push({
          caseDir: '', year: y.year, org: '', title: cleanCore(f.name),
          files: [{ name: f.name, relPath: f.relPath, size: f.size, mtime: f.mtime, ext: extOf(f.name) }],
          fileCount: 1, promoted: [], src: 'fs', scanId: scanId
        });
      }
    });

    caseOrder.forEach(function (k) {
      var c = caseMap[k];
      c.fileCount = c.files.length;
      out.submissions.push(c);
    });
    return out;
  }

  var api = {
    CASE_ROOT: CASE_ROOT,
    buildRecords: buildRecords,
    extOf: extOf,
    isIgnoredFile: isIgnoredFile,
    cleanCore: cleanCore,
    classify: classify,
    certKindOf: certKindOf,
    pickYear: pickYear,
    orgFromCaseDir: orgFromCaseDir,
    caseKeyOf: caseKeyOf
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.KcareerScan = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
