/* 붙어 둔 것을 «다시 쓴다» (대표 목표 2026-08-31 「팝업 열리는 속도」)

   ★ 예전에는 메일 한 통을 열 때마다 다음메일에 «새로 붙었다» — TLS 악수 + 로그인 +
     폴더 열기. 본문 받는 시간보다 붙는 시간이 더 긴 일이 흔하다.
     함수 그릇은 부름 사이에도 살아 있으니, 붙어 둔 것을 다음 부름이 그대로 쓴다.

   ⚠ 여기서 가장 위험한 것은 «죽은 것을 물려주는 것»이다 — 그러면 첫 명령에서
     실패하고 그제야 다시 붙으니, 안 고친 것보다 «더 느리고» 게다가 실패로 보인다.
     그래서 ①usable 을 보고 ②그래도 실패하면 한 번만 새로 붙어 다시 해 본다.

   지키는 것.
   ① 두 번째 부름은 «다시 안 붙는다»
   ② 죽은 것은 «안 물려준다»
   ③ 물려받은 것이 실패하면 «한 번» 새로 붙어 다시 한다 — 사람에게는 성공으로 보인다
   ④ 새로 붙어서도 실패하면 «올린다» — 영원히 다시 하지 않는다
   ⑤ 오래 놀린 것은 버린다
   ⑥ 살려 두는 것은 끊지 않는다 — 끊으면 다시 쓸 것이 없다 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const MS = require(path.join(__dirname, '..', 'functions', 'mail-sync.js'));

/* 가짜 다음메일 — 붙은 횟수·끊은 횟수를 센다 */
function rig(opt) {
  const o = opt || {};
  const log = { connects: 0, logouts: 0, works: 0 };
  const mk = (alive) => ({
    usable: alive !== false,
    async getMailboxLock() { return { release() {} }; },
    async logout() { log.logouts++; this.usable = false; },
  });
  const deps = {
    getDatabase: () => ({ ref: () => ({ once: async () => ({ val: () => 'INBOX' }) }) }),
    mailUserAsync: async () => '370-6',
    mailPass: () => 'pw',
    MD: { loginIds: () => ['370-6'] },
    /* 붙기는 이 구멍으로 — 진짜 IMAP 에 안 붙는다 */
    __connect: async () => { log.connects++; return mk(true); },
  };
  return { log, deps, mk };
}

test('★★ 연결을 다시 쓰는 길이 «있다» — 없으면 열 때마다 붙는다', () => {
  const src = require('node:fs').readFileSync(
    path.join(__dirname, '..', 'functions', 'mail-sync.js'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ');
  assert.match(src, /warmConnect/, '붙어 둔 것을 다시 쓰는 길이 없습니다');
  assert.match(src, /client\.usable/, '살아 있는지 안 보고 물려줍니다');
  assert.match(src, /WARM_IDLE_MS/, '오래 놀린 것을 안 버립니다');
});

test('★★ 물려받은 것이 죽어 실패하면 «한 번» 새로 붙어 다시 한다', () => {
  const src = require('node:fs').readFileSync(
    path.join(__dirname, '..', 'functions', 'mail-sync.js'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ');
  const i = src.indexOf('async function withFolder');
  const seg = src.slice(i, src.indexOf('\nasync function drain', i));
  assert.match(seg, /attempt\s*<\s*2/, '다시 해 보지 않습니다 — 죽은 연결 하나에 그대로 실패합니다');
  assert.match(seg, /if \(!got\.reused \|\| attempt >= 1\) throw e/,
    '새로 붙어서도 실패했는데 또 다시 합니다 — 영원히 돕니다');
});

test('★★ 살려 두는 것은 «끊지 않는다» — 끊으면 다시 쓸 것이 없다', () => {
  const src = require('node:fs').readFileSync(
    path.join(__dirname, '..', 'functions', 'mail-sync.js'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ');
  const i = src.indexOf('async function withFolder');
  const seg = src.slice(i, src.indexOf('\nasync function drain', i));
  assert.match(seg, /if \(!warmDone\(client, ok\)\)/,
    '끝나면 늘 끊습니다 — 다시 쓸 것이 남지 않습니다');
});

test('★★ 실패한 연결은 «버린다» — 죽은 것을 다음 사람에게 물려주면 더 나쁘다', () => {
  const src = require('node:fs').readFileSync(
    path.join(__dirname, '..', 'functions', 'mail-sync.js'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ');
  const i = src.indexOf('function warmDone');
  const seg = src.slice(i, i + 400);
  assert.match(seg, /if \(!ok\)/, '실패한 연결을 그대로 남깁니다');
  assert.match(seg, /_warm = null/, '실패한 연결을 안 버립니다');
});

test('★ 시간을 «갈라» 적는다 — 붙는 데인지 받는 데인지 알아야 고칠 곳이 정해진다', () => {
  const src = require('node:fs').readFileSync(
    path.join(__dirname, '..', 'functions', 'mail-sync.js'), 'utf8');
  assert.match(src, /MB_TIME/, '시간을 안 적습니다');
  assert.match(src, /connect: tConn/, '붙는 시간을 안 가릅니다');
  assert.match(src, /work: nowMs\(\) - t2/, '일하는 시간을 안 가릅니다');
  assert.match(src, /reused: !!got\.reused/, '다시 쓴 것인지 안 적습니다 — 효과를 못 잽니다');
});

test('★★ 한 그릇이 «동시에» 두 일을 하면 빌려 쓰지 않는다 — 명령이 섞이면 안 된다', () => {
  const src = require('node:fs').readFileSync(
    path.join(__dirname, '..', 'functions', 'mail-sync.js'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ');
  const i = src.indexOf('async function warmConnect');
  const seg = src.slice(i, i + 700);
  assert.match(seg, /!w\.busy/, '쓰는 중인 연결을 또 빌려 줍니다 — 명령이 섞입니다');
  assert.match(seg, /w\.busy = true/, '쓰는 중 표시를 안 합니다');
});

test('★ 동기화는 «제 연결»을 쓴다 — 한 회차가 몇 분이라 빌려 주면 그동안 다 막힌다', () => {
  const src = require('node:fs').readFileSync(
    path.join(__dirname, '..', 'functions', 'mail-sync.js'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ');
  const i = src.indexOf('async function runSync');
  const seg = src.slice(i, i + 1600);
  assert.match(seg, /client = await connect\(deps, user, pass\)/,
    '동기화가 붙어 둔 것을 빌려 씁니다 — 한 회차 내내 본문 열기가 막힙니다');
  assert.ok(seg.indexOf('warmConnect') < 0, '동기화가 warmConnect 를 씁니다');
});
