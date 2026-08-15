const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const integratedPages = [
  'enter.html',
  'pu-erp.html',
  'gov-consulting.html',
  'pu-cards.html',
  'rules.html',
];

function readPage(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

function functionBody(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name}() is missing`);

  const open = source.indexOf('{', start);
  assert.notEqual(open, -1, `${name}() has no body`);

  let depth = 0;
  let quote = '';
  let escaped = false;
  for (let i = open; i < source.length; i += 1) {
    const ch = source[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === quote) quote = '';
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch;
      continue;
    }
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(open + 1, i);
    }
  }
  assert.fail(`${name}() body is not closed`);
}

function idleBlock(source, file) {
  const key = source.lastIndexOf("'pu_last_active'");
  assert.notEqual(key, -1, `${file}: shared idle timer is missing`);

  const start = source.lastIndexOf('(function(){', key);
  assert.notEqual(start, -1, `${file}: idle timer wrapper is missing`);
  const end = source.indexOf('})();', key);
  assert.notEqual(end, -1, `${file}: idle timer wrapper is not closed`);
  return source.slice(start, end + 5);
}

test('portal chooses LOCAL for auto-login and SESSION otherwise', () => {
  const source = readPage('enter.html');
  const start = source.indexOf('var persistence =');
  const end = source.indexOf(';', start);
  assert.notEqual(start, -1, 'persistence selection is missing');
  assert.notEqual(end, -1, 'persistence selection is incomplete');
  const selection = source.slice(start, end + 1);
  const preferenceArea = source.slice(Math.max(0, start - 180), end + 1);

  assert.match(preferenceArea, /autoLogin['"]?\)?\.checked/);
  assert.match(selection, /wantsAutoLogin|autoLogin/);
  assert.match(selection, /Auth\.Persistence\.LOCAL/);
  assert.match(selection, /Auth\.Persistence\.SESSION/);
  assert.ok(
    selection.indexOf('LOCAL') < selection.indexOf('SESSION'),
    'checked auto-login must select LOCAL before the fallback SESSION branch',
  );
});

test('a Firebase persistence failure is never swallowed before sign-in', () => {
  const source = readPage('enter.html');
  const start = source.indexOf('auth.setPersistence(persistence)');
  const signIn = source.indexOf('auth.signInWithEmailAndPassword', start);
  assert.notEqual(start, -1, 'setPersistence call is missing');
  assert.ok(signIn > start, 'sign-in must happen after persistence is selected');

  const preSignInChain = source.slice(start, signIn);
  const catchStart = preSignInChain.indexOf('.catch(');
  if (catchStart >= 0) {
    const catchCode = preSignInChain.slice(catchStart);
    assert.match(
      catchCode,
      /\bthrow\b|Promise\.reject\s*\(/,
      'setPersistence failure must reject login instead of continuing with an unknown session type',
    );
  }
});

for (const file of integratedPages) {
  test(`${file}: persistent mobile sessions reset only when the page resumes`, () => {
    const source = readPage(file);
    const block = idleBlock(source, file);

    const persistentBody = functionBody(block, 'persistentAutoLogin');
    assert.match(persistentBody, /localStorage\.getItem\(['"]pu_portal_auto['"]\)/);
    assert.match(persistentBody, /===?\s*['"]1['"]/);

    const resumeBody = functionBody(block, 'resumeAutoSession');
    assert.match(resumeBody, /persistentAutoLogin\(\)/);
    assert.match(resumeBody, /\bmark(?:Active)?\s*\(/);

    assert.match(
      block,
      /addEventListener\(['"]pageshow['"],\s*resumeAutoSession/,
      `${file}: pageshow must refresh the activity timestamp`,
    );
    assert.match(
      block,
      /addEventListener\(['"]visibilitychange['"]/,
      `${file}: returning from the background must be observed`,
    );
    assert.match(
      block,
      /if\s*\(\s*!document\.hidden\s*\)\s*resumeAutoSession\(\)/,
      `${file}: background time must be reset only after the page becomes visible`,
    );

    const resumeDefinitionEnd = block.indexOf('}', block.indexOf('function resumeAutoSession('));
    const timerStart = block.indexOf('setInterval(', resumeDefinitionEnd);
    const startupArea = block.slice(resumeDefinitionEnd + 1, timerStart);
    assert.match(
      startupArea,
      /resumeAutoSession\(\)\s*;/,
      `${file}: a newly started page must refresh a remembered session before the first idle check`,
    );
  });

  test(`${file}: background timers cannot sign out a remembered session`, () => {
    const block = idleBlock(readPage(file), file);
    const pauseBody = functionBody(block, 'shouldPauseIdle');
    assert.match(pauseBody, /persistentAutoLogin\(\)/);
    assert.match(pauseBody, /document\.hidden/);

    const timerStart = block.indexOf('setInterval(');
    assert.notEqual(timerStart, -1, `${file}: idle interval is missing`);
    const timerCode = block.slice(timerStart);
    assert.match(
      timerCode,
      /if\s*\(\s*shouldPauseIdle\(\)\s*\)\s*(?:\{\s*)?return\s*;/,
      `${file}: hidden/background pages must leave Firebase authentication intact`,
    );
  });
}

test('the user can still explicitly log out from the portal', () => {
  const source = readPage('enter.html');
  const start = source.indexOf("$('logoutBtn').addEventListener('click'");
  assert.notEqual(start, -1, 'portal logout button handler is missing');
  const end = source.indexOf('});', start);
  assert.ok(end > start, 'portal logout button handler is incomplete');
  assert.match(source.slice(start, end + 3), /auth\.signOut\(\)/);
});
