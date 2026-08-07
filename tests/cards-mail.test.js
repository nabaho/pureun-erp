/* 메일 보내기 — 틀리는 방향이 둘이다.
   덜 거르면 수신거부한 사람에게 또 나가고(법·신뢰 문제),
   더 거르면 보내야 할 사람이 조용히 빠진다.
   특히 대소문자만 다른 주소를 놓치는 실수가 흔하다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const HTML = path.join(__dirname, '..', 'pu-cards.html');
const src = fs.readFileSync(HTML, 'utf8');

function slice(a, b){
  const i = src.indexOf(a);
  if(i < 0) throw new Error('시작 표식 못찾음: ' + a);
  const j = src.indexOf(b, i);
  if(j < 0) throw new Error('끝 표식 못찾음: ' + b);
  return src.slice(i, j);
}

function load(){
  const code = slice(
    '/* ══════ 메일 보내기 — 순수 로직 (테스트 대상) ══════',
    '/* ══════ 메일 보내기 — 화면 ══════');
  const ctx = { console, Object, Array, String, JSON, Date, Math, RegExp, Set,
                inLockedGroup: () => false };
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  ctx.read = expr => vm.runInContext(expr, ctx);
  return ctx;
}

const card = (id, name, email, extra) =>
  Object.assign({ id, kind:'card', name, email, company:'가나', group:'' }, extra||{});
const mails = r => r.ok.map(x=>x.email).join(',');

test('이메일이 없으면 뺀다', () => {
  const c = load();
  const r = c.mailTargets([card('a','홍길동',''), card('b','김철수','kim@b.com')], {});
  assert.equal(mails(r), 'kim@b.com');
  assert.equal(r.stat.noEmail, 1);
});

test('a@b 꼴이 아니면 뺀다', () => {
  const c = load();
  const r = c.mailTargets([card('a','홍','그냥글자'), card('b','김','kim@b.com')], {});
  assert.equal(mails(r), 'kim@b.com');
  assert.equal(r.stat.noEmail, 1);
});

test('명함에 수신거부 표시가 있으면 뺀다', () => {
  const c = load();
  const r = c.mailTargets([card('a','홍','hong@a.com',{noMail:1}), card('b','김','kim@b.com')], {});
  assert.equal(mails(r), 'kim@b.com');
  assert.equal(r.stat.blocked, 1);
});

test('수신거부 목록에 있으면 뺀다', () => {
  const c = load();
  /* 차단 목록의 키는 Firebase 에 저장되는 꼴 그대로다 — 점이 쉼표로 바뀌어 있다 */
  const r = c.mailTargets([card('a','홍','hong@a.com'), card('b','김','kim@b.com')],
                          { 'hong@a,com': true });
  assert.equal(mails(r), 'kim@b.com');
  assert.equal(r.stat.blocked, 1);
});

test('★ 대소문자·공백이 달라도 수신거부가 걸린다', () => {
  const c = load();
  const r = c.mailTargets([card('a','홍','  Hong@A.COM  ')], { 'hong@a,com': true });
  assert.equal(mails(r), '');
  assert.equal(r.stat.blocked, 1);
});

test('★ 이메일을 Firebase 키로 바꾸고 되돌린다 — 키에는 점을 쓸 수 없다', () => {
  const c = load();
  assert.equal(c.emailKey('hong@a.co.kr'), 'hong@a,co,kr');
  assert.equal(c.keyEmail('hong@a,co,kr'), 'hong@a.co.kr');
  assert.equal(c.keyEmail(c.emailKey('a.b@c.d.e')), 'a.b@c.d.e');
});

test('같은 주소가 여러 장이면 하나로 합친다', () => {
  const c = load();
  const r = c.mailTargets([card('a','홍','hong@a.com'), card('b','홍(구)','HONG@a.com')], {});
  assert.equal(mails(r), 'hong@a.com');
  assert.equal(r.stat.dup, 1);
  assert.equal(r.stat.ready, 1);
});

test('잠긴 폴더 명함은 뺀다', () => {
  const c = load();
  vm.runInContext("inLockedGroup = it => it.id==='a';", c);
  const r = c.mailTargets([card('a','개인','p@a.com'), card('b','김','kim@b.com')], {});
  assert.equal(mails(r), 'kim@b.com');
});

test('센 숫자가 실제와 맞는다', () => {
  const c = load();
  const r = c.mailTargets([
    card('a','홍','hong@a.com'),
    card('b','김','KIM@b.com'),
    card('c','김복사','kim@b.com'),
    card('d','이','', {}),
    card('e','박','park@c.com',{noMail:1})
  ], {});
  assert.equal(JSON.stringify(r.stat), JSON.stringify({ready:2, noEmail:1, blocked:1, dup:1}));
});

test('붙여넣은 글에서 이메일만 골라낸다', () => {
  const c = load();
  const got = c.pickEmails('홍길동 hong@a.co.kr 2026-08-07 반송\n김철수 <kim@b.com> 거부');
  assert.equal(got.join(','), 'hong@a.co.kr,kim@b.com');
});

test('붙여넣기에서도 소문자로 모은다', () => {
  const c = load();
  assert.equal(c.pickEmails('HONG@A.COM').join(','), 'hong@a.com');
});

test('CSV 첫 줄에 BOM 이 붙는다 — 없으면 한글이 깨진다', () => {
  const c = load();
  const s = c.toCsv([{name:'홍길동',email:'h@a.com',company:'가나',title:'팀장',mobile:'010'}]);
  assert.equal(s.charCodeAt(0), 0xFEFF);
});

test('CSV 머리글과 값이 순서대로 들어간다', () => {
  const c = load();
  const s = c.toCsv([{name:'홍길동',email:'h@a.com',company:'가나',title:'팀장',mobile:'010-1-2'}]);
  const lines = s.replace(/^\uFEFF/,'').trim().split('\r\n');
  assert.equal(lines[0], '이름,이메일,회사,직책,휴대폰');
  assert.equal(lines[1], '홍길동,h@a.com,가나,팀장,010-1-2');
});

test('★ 쉼표·따옴표·줄바꿈이 든 값이 CSV 를 깨뜨리지 않는다', () => {
  const c = load();
  const s = c.toCsv([{name:'홍,길동',email:'h@a.com',company:'가"나',title:'팀장\n대리',mobile:''}]);
  const body = s.replace(/^\uFEFF/,'').split('\r\n')[1];
  assert.equal(body, '"홍,길동",h@a.com,"가""나","팀장\n대리",');
});
