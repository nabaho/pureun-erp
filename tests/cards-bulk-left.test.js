/* ══════ 고른 명함을 «한 번에» 퇴사로 (대표 지시 2026-08-29) ══════
   대표님: 「일부 사람들 퇴사자이고 퇴사자로 분류하고 싶은데 클릭 후 쉽게 한 번에」

   ⚠ 어제 넣은 한 장짜리 「🚪 퇴사」에는 «명함에서는 아예 안 눌리는» 결함이 있었다.
     쓸 때 it.bizno 를 요구했는데 사업자번호는 «사업자등록증 칸»이고 명함에는 없다.
     읽을 때(leftOfCard→match)는 번호가 없으면 회사 «이름»으로 찾는다. 읽기와 쓰기가
     다른 열쇠를 쓴 것이다 — 딱지는 보이는데 표시는 안 되는 상태였다.
     그래서 회사를 가리는 일을 ErpMatch.match 한 곳으로 모은다.

   ⚠ 사람마다 「업체 통째 읽기 + 쓰기」를 하면 5명에 열 번을 오간다. 2026-08-16 에
     5,000건 오류를 낸 그 방식이다. 회사별로 묶어 «한 번 읽고 한 번 쓴다». */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('node:vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'pu-cards.html'), 'utf8');

function fn(name) {
  const at = SRC.search(new RegExp('(?:^|\\n)(?:async )?function ' + name + '\\('));
  assert.ok(at >= 0, name + ' 을 찾지 못했다');
  let i = SRC.indexOf('{', at), d = 0;
  for (let j = i; j < SRC.length; j++) {
    if (SRC[j] === '{') d++;
    else if (SRC[j] === '}') { d--; if (d === 0) return SRC.slice(at, j + 1); }
  }
  throw new Error(name + ' 의 끝을 찾지 못했다');
}

/* 진짜 ErpMatch 의 사람 가리기(keyOfCard·samePerson·_digits)를 그대로 쓴다.
   흉내를 내면 「읽을 때와 쓸 때가 같은 열쇠」인지가 시험되지 않는다. */
function erpMatchStub(companies) {
  const _digits = v => String(v == null ? '' : v).replace(/\D/g, '');
  const _norm = s => String(s || '').replace(/주식회사|\(주\)|㈜/g, '').replace(/[\s.,()\-]/g, '');
  const byBiz = {}, byName = {};
  companies.forEach(c => {
    const b = _digits(c.bizNo); if (b.length >= 10) byBiz[b] = c;
    const n = _norm(c.coName); if (n) byName[n] = c;
  });
  const M = {
    ready: true, _digits, _norm, byBiz, byName,
    match(it) {
      if (!it) return null;
      const b = _digits(it.bizno);
      if (b.length >= 10 && byBiz[b]) return byBiz[b];
      const n = _norm(it.company);
      return (n && byName[n]) || null;
    },
    keyOfCard(it) {
      return {
        mail: String((it && it.email) || '').trim().toLowerCase(),
        nums: [it && it.mobile, it && it.tel, it && it.companyTel]
          .map(v => _digits(v)).filter(v => v.length >= 8)
      };
    },
    samePerson(p, key) {
      if (!p || !key || (!key.mail && !key.nums.length)) return false;
      const pm = String(p.email || '').trim().toLowerCase();
      if (key.mail && pm && pm === key.mail) return true;
      const pn = [p.phone, p.bizPhone].map(v => _digits(v)).filter(v => v.length >= 8);
      return pn.length > 0 && key.nums.some(n => pn.indexOf(n) >= 0);
    },
    leftOfCard(it) {
      const m = M.match(it); const people = (m && m.people) || [];
      if (!people.length) return false;
      const key = M.keyOfCard(it);
      if (!key.mail && !key.nums.length) return false;
      for (let i = 0; i < people.length; i++) if (M.samePerson(people[i], key)) return !!people[i].left;
      return false;
    }
  };
  return M;
}

function ctx(companies) {
  const box = { ErpMatch: erpMatchStub(companies || []) };
  vm.createContext(box);
  vm.runInContext(fn('planLeftMarks'), box);
  return box;
}
const plan = (box, items) => JSON.parse(JSON.stringify(
  vm.runInContext('planLeftMarks(__it)', Object.assign(box, { __it: items }))));

const CO = [{
  id: 'co1', coName: '가나솔루션', bizNo: '123-45-67890',
  people: [
    { name: '박철수', email: 'park@example.kr', phone: '010-1111-3333', left: false },
    { name: '이수혜', email: 'lee@example.kr', phone: '010-1111-4444', left: true }
  ]
}];

/* ── ① 명함에 사업자번호가 없어도 «회사 이름으로» 찾아진다 (어제의 결함) ── */
test('사업자번호 없는 명함도 회사 이름으로 업체를 찾는다', () => {
  const box = ctx(CO);
  const p = plan(box, [{ id: 'c1', name: '박철수', company: '가나솔루션',
                         email: 'park@example.kr', mobile: '010-1111-3333' }]);
  assert.equal(p.skip.length, 0, '사업자번호가 없다고 거절했다 — 명함에는 원래 없는 칸이다');
  assert.equal(p.count, 1);
  assert.equal(p.groups[0].co.id, 'co1');
});

test('회사 이름이 조금 달라도 («주식회사», 띄어쓰기) 같은 업체로 본다', () => {
  const box = ctx(CO);
  const p = plan(box, [{ id: 'c1', name: '박철수', company: '주식회사 가나 솔루션',
                         email: 'park@example.kr' }]);
  assert.equal(p.count, 1, '읽을 때(🚪 딱지)와 다른 잣대를 썼다');
});

/* ── ② 못 하는 사람은 «까닭과 함께» 남는다 — 조용히 빠지면 안 된다 ── */
test('가릴 값이 없는 사람은 까닭과 함께 빠진다', () => {
  const box = ctx(CO);
  const p = plan(box, [{ id: 'c9', name: '최양석', company: '가나솔루션' }]);
  assert.equal(p.count, 0);
  assert.equal(p.skip.length, 1, '조용히 사라졌다 — 대표님은 처리된 줄 안다');
  assert.equal(p.skip[0].it.name, '최양석');
  assert.ok(p.skip[0].why && p.skip[0].why.length > 3, '까닭이 없다');
});

test('업체관리에 없는 회사는 까닭과 함께 빠진다', () => {
  const box = ctx(CO);
  const p = plan(box, [{ id: 'c8', name: '홍길동', company: '없는회사',
                         email: 'h@x.com', mobile: '010-1111-2222' }]);
  assert.equal(p.count, 0);
  assert.equal(p.skip.length, 1);
  assert.ok(/업체관리/.test(p.skip[0].why), '까닭이 「업체관리에 없다」가 아니다');
});

/* ── ③ 이미 퇴사인 사람은 «건너뛴다» (대표 결정 2026-08-29) ── */
test('이미 퇴사인 사람은 손대지 않고 따로 센다', () => {
  const box = ctx(CO);
  const p = plan(box, [
    { id: 'c1', name: '박철수', company: '가나솔루션', email: 'park@example.kr' },
    { id: 'c2', name: '이수혜', company: '가나솔루션', email: 'lee@example.kr' }
  ]);
  assert.equal(p.count, 1, '이미 퇴사인 사람까지 다시 쓰려 한다');
  assert.equal(p.already.length, 1);
  assert.equal(p.already[0].it.name, '이수혜');
  assert.equal(p.groups[0].rows.length, 1);
  assert.equal(p.groups[0].rows[0].it.name, '박철수');
});

/* ── ④ 회사별로 묶는다 — 사람 수가 아니라 «회사 수»만큼만 쓴다 ── */
test('같은 회사 여러 명은 한 덩이로 묶인다', () => {
  const co = [{ id: 'co1', coName: 'A', bizNo: '111-11-11111', people: [] },
              { id: 'co2', coName: 'B', bizNo: '222-22-22222', people: [] }];
  const box = ctx(co);
  const p = plan(box, [
    { id: '1', name: 'ㄱ', company: 'A', email: 'a1@x.com' },
    { id: '2', name: 'ㄴ', company: 'A', email: 'a2@x.com' },
    { id: '3', name: 'ㄷ', company: 'A', email: 'a3@x.com' },
    { id: '4', name: 'ㄹ', company: 'B', email: 'b1@x.com' }
  ]);
  assert.equal(p.groups.length, 2, '회사별로 안 묶었다 — 사람 수만큼 서버를 오간다');
  assert.equal(p.count, 4);
  assert.deepEqual(p.groups.map(g => g.rows.length), [3, 1]);
});

test('빈 목록이면 아무것도 없다', () => {
  const box = ctx(CO);
  const p = plan(box, []);
  assert.equal(p.count, 0);
  assert.equal(p.groups.length, 0);
  assert.equal(p.skip.length, 0);
});

/* ── ⑤ 쓰기는 «한 번 읽고 한 번 쓴다» ── */
test('bulkMarkLeft 가 사람마다 읽지 않는다', () => {
  const src = fn('bulkMarkLeft');
  const reads = (src.match(/once\(/g) || []).length;
  assert.equal(reads, 1, '읽기가 ' + reads + '번이다 — 회사 통째 읽기는 한 번이어야 한다');
  const writes = (src.match(/\.update\(/g) || []).length;
  assert.equal(writes, 1, '쓰기가 ' + writes + '번이다 — 2026-08-16 에 5,000건 오류를 낸 방식이다');
  assert.ok(!/forEach[\s\S]{0,200}Store\.put/.test(src), '한 장씩 Store.put 을 부른다');
});

test('bulkMarkLeft 가 푸른이알피 갱신시각을 함께 적는다', () => {
  const src = fn('bulkMarkLeft');
  assert.ok(/data\/companies\/u/.test(src),
    '갱신시각(u)을 안 적으면 푸른이알피 화면이 안 바뀐다');
});

/* ── ⑥ 폴더 이동은 «대표님이 만든 폴더»로, 모아서 한 번에 ── */
test('폴더 이동이 이미 있는 종료 폴더를 쓰고 모아서 쓴다', () => {
  const src = fn('bulkMarkLeft');
  assert.ok(/erpClosedFolderOf\(/.test(src),
    '폴더를 이름으로 새로 만든다 — 대표님 「2.업체종료 및 퇴사」와 갈린다');
  assert.ok(/autoFolderFlush\(/.test(src), '폴더 이동을 한 장씩 쓴다');
});

/* ── ⑦ 확인창은 «누르기 전에» 될 것과 안 될 것을 보여 준다 ── */
test('확인창이 될 사람·이미 퇴사·안 될 사람을 모두 보여 준다', () => {
  const box = { ErpMatch: erpMatchStub(CO), esc: s => String(s == null ? '' : s) };
  vm.createContext(box);
  vm.runInContext(fn('bulkLeftHtml'), box);
  box.__p = plan(ctx(CO), [
    { id: 'c1', name: '박철수', company: '가나솔루션', email: 'park@example.kr' },
    { id: 'c2', name: '이수혜', company: '가나솔루션', email: 'lee@example.kr' },
    { id: 'c9', name: '최양석', company: '가나솔루션' }
  ]);
  box.__g = { id: 'g2', name: '2.업체종료 및 퇴사' };
  const h = vm.runInContext('bulkLeftHtml(__p, __g)', box);
  assert.ok(h.includes('박철수'), '처리할 사람이 안 보인다');
  assert.ok(h.includes('이수혜'), '이미 퇴사인 사람이 안 보인다 — 왜 수가 줄었는지 모른다');
  assert.ok(h.includes('최양석'), '못 하는 사람이 안 보인다 — 조용히 빠지면 몇 달 뒤 드러난다');
  assert.ok(h.includes('가나솔루션'), '어느 회사인지 안 보인다');
  assert.ok(h.includes('2.업체종료 및 퇴사'), '어느 폴더로 옮기는지 안 보인다');
});

test('종료 폴더를 못 찾으면 폴더 이동을 «권하지 않는다»', () => {
  const box = { ErpMatch: erpMatchStub(CO), esc: s => String(s == null ? '' : s) };
  vm.createContext(box);
  vm.runInContext(fn('bulkLeftHtml'), box);
  box.__p = plan(ctx(CO), [{ id: 'c1', name: '박철수', company: '가나솔루션',
                             email: 'park@example.kr' }]);
  const h = vm.runInContext('bulkLeftHtml(__p, null)', box);
  assert.ok(!/bulkLeftMove/.test(h),
    '폴더가 없는데 이동 체크가 떴다 — 누르면 새 폴더가 생겨 종료 업체가 두 곳으로 갈린다');
});

/* ── ⑧ 선택 막대에 단추가 있다 ── */
test('선택 막대에 「🚪 퇴사」 단추가 있다', () => {
  const src = fn('renderPCTable');
  const at = src.indexOf("$('pcSel')");
  assert.ok(at >= 0, '선택 막대를 못 찾았다');
  const bar = src.slice(at, at + 1400);
  assert.ok(/askSelLeft\(\)/.test(bar), '한 번에 퇴사 단추가 없다');
});
