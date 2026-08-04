const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const enterPath = path.join(__dirname, '..', 'enter.html');
const source = fs.readFileSync(enterPath, 'utf8');

function functionLine(name) {
  const line = source.split(/\r?\n/).find((item) => item.includes(`function ${name}(`));
  assert.ok(line, `${name} 함수가 있어야 합니다.`);
  return line.trim();
}

test('건의 분류 CSS 클래스는 등록된 키만 허용한다', () => {
  const context = {
    SG_CATS: [
      { key: 'erp' },
      { key: 'consult' },
      { key: 'cards' },
      { key: 'portal' },
      { key: 'etc' },
    ],
  };
  vm.runInNewContext(functionLine('sgCatClass'), context);

  assert.equal(context.sgCatClass('erp'), 'erp');
  assert.equal(context.sgCatClass('unknown'), 'etc');
  assert.equal(context.sgCatClass('x" onclick="alert(1)'), 'etc');
});

test('첨부 이미지는 HTTPS와 래스터 base64만 허용한다', () => {
  const context = {};
  const start = source.indexOf('function sgImgUrl(');
  const end = source.indexOf('\n  }', start);
  assert.ok(start >= 0 && end > start, 'sgImgUrl 함수가 있어야 합니다.');
  vm.runInNewContext(source.slice(start, end + 4), context);

  assert.equal(context.sgImgUrl('https://example.com/a.png'), 'https://example.com/a.png');
  assert.equal(context.sgImgUrl('data:image/jpeg;base64,AAAA'), 'data:image/jpeg;base64,AAAA');
  assert.equal(context.sgImgUrl('http://example.com/a.png'), '');
  assert.equal(context.sgImgUrl('javascript:alert(1)'), '');
  assert.equal(context.sgImgUrl('data:image/svg+xml,<svg onload=alert(1)>'), '');
  assert.equal(context.sgImgUrl('data:image/png;base64,AAAA" onerror="alert(1)'), '');
});

test('건의 렌더링에 검증되지 않은 분류값이나 document.write를 사용하지 않는다', () => {
  assert.equal(source.includes("sg-b-'+(s.cat||'etc')"), false);
  assert.equal(source.includes('document.write('), false);
  assert.match(source, /sg-b-['"]?\+sgCatClass\(s\.cat\)/);
});

test('개인 설정과 해결 알림은 Firebase UID 경로를 사용한다', () => {
  assert.match(source, /data\/portal_prefs_uid\//);
  assert.match(source, /suggestions_resolved_private/);
  assert.match(source, /authorUid:\s*SG\.uid/);
  assert.match(source, /SG\.uid\s*=\s*\(auth\.currentUser/);
});

test('기존 이메일 경로 데이터는 UID 경로로 이전할 수 있다', () => {
  assert.match(source, /function tilePrefLegacyPath\(/);
  assert.match(source, /function sgEnsurePrivateMigration\(/);
  assert.match(source, /data\/sg_resolved/);
  assert.match(source, /function sgLoadOwnResolved\(/);
  assert.match(source, /sgFindAuthorUid\(s\)/);
});
