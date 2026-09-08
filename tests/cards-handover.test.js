'use strict';
/* ══════ 명함을 찍어 저장할 때 «전임자»를 묻는다 (대표 지시 2026-08-29) ══════
   대표님: 「수시로 거래처의 담당자 변경 및 입퇴사가 잦은데 … 폰에서 사진 찍고 저장 후
   아주 쉽게 관리해야 한다」

   ■ 왜 이 자리인가
     새 명함이 들어오는 «그 순간»이 전임자 퇴사를 알아챌 수 있는 거의 유일한 때다.
     여기서 놓치면 몇 달 뒤 「이 사람 아직도 메일 받네」로 발견된다.
     지금은 새 명함을 저장해도 전임자가 그대로 남아 «두 사람 다» 메일을 받는다.

   ■ 대표 결정 2026-08-29
     「회사 + 직책·부서가 «둘 다» 같을 때만」 묻는다.
     ⚠ 자동으로 퇴사시키지 않는다. 생산1팀에 과장이 둘일 수 있다 — 묻고, 대표님이
       고르셔야 처리한다.

   ★ 여기서 못 박는 것
     ① 회사가 같아야 한다 (다듬어 견준다 — 「주식회사 A」와 「A」는 같다)
     ② 부서와 직책이 «둘 다» 같아야 한다. 하나만 같으면 안 묻는다
     ③ 새 명함에 직책·부서가 없으면 안 묻는다 — 가릴 수가 없다
     ④ 같은 사람(전화·이메일이 겹치는)은 «전임자가 아니다» — 명함을 다시 낸 것이다
     ⑤ 이미 퇴사로 표시된 사람은 다시 안 묻는다
     ⑥ 저장 자체를 막지 않는다 — 물음에 답하지 않아도 명함은 저장된다 */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('node:vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'pu-cards.html'), 'utf8');

function fn(name) {
  const at = SRC.search(new RegExp('(?:^|\\n)(?:async )?function ' + name + '\\('));
  assert.ok(at >= 0, name + ' 을 찾지 못했다');
  const open = SRC.indexOf('{', at);
  let d = 0;
  for (let k = open; k < SRC.length; k++) {
    if (SRC[k] === '{') d++;
    else if (SRC[k] === '}') { d--; if (!d) return SRC.slice(at, k + 1); }
  }
  throw new Error(name + ' 의 끝을 찾지 못했다');
}

/* ⚠ 주석을 걷어 내고 본다. 이 저장소는 주석이 길어서, 「소스에 이 글자가 있나」로 보는
   검사가 «내가 쓴 설명»을 코드로 착각해 그냥 통과한다 — 다른 세션에서 오늘만 세 번
   났고 하나는 일부러 되돌려 보고서야 잡혔다(2026-08-30 인수인계). */
const bare = s => String(s).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');

function box(left) {
  const b = {
    _norm: s => String(s || '').replace(/주식회사|\(주\)|㈜/g, '').replace(/[\s.,()\-]/g, ''),
    digits: v => String(v == null ? '' : v).replace(/\D/g, ''),
    ErpMatch: {
      leftOfCard: it => !!(left || {})[it.id],
      keyOfCard: it => ({
        mail: String((it && it.email) || '').trim().toLowerCase(),
        nums: [it && it.mobile, it && it.tel].map(v => String(v || '').replace(/\D/g, ''))
          .filter(v => v.length >= 8)
      })
    }
  };
  vm.createContext(b);
  vm.runInContext(fn('cardHandoverList'), b);
  return b;
}
const call = (b, it, all) => JSON.parse(JSON.stringify(
  vm.runInContext('cardHandoverList(__it, __all)', Object.assign(b, { __it: it, __all: all }))));

const NEW = { id: 'n1', kind: 'card', name: '박준수', company: '가나솔루션',
              dept: '생산1팀', title: '과장', mobile: '010-1111-5555' };
const OLD = { id: 'o1', kind: 'card', name: '강종수', company: '가나솔루션',
              dept: '생산1팀', title: '과장', mobile: '010-1111-2222' };

/* ── ① 회사 + 직책·부서가 둘 다 같을 때만 ─────────────────────────── */
test('★ 회사·부서·직책이 모두 같으면 전임자로 짚는다', () => {
  const b = box();
  const r = call(b, NEW, [NEW, OLD]);
  assert.equal(r.length, 1);
  assert.equal(r[0].name, '강종수');
});

test('회사 이름이 조금 달라도 («주식회사», 띄어쓰기) 같은 회사로 본다', () => {
  const b = box();
  /* ⚠ «양쪽 다» 다듬어야 한다. 한쪽만 다듬으면 이 검사가 통과하면서도 반대 방향
     (새 명함에 「주식회사」가 붙은 경우)이 조용히 깨진다 — 2026-08-30 고장 시험에서 샜다. */
  const old2 = Object.assign({}, OLD, { company: '주식회사 가나 솔루션' });
  assert.equal(call(b, NEW, [NEW, old2]).length, 1, '옛 명함 쪽 이름을 안 다듬는다');

  const new2 = Object.assign({}, NEW, { company: '주식회사 가나 솔루션' });
  assert.equal(call(b, new2, [new2, OLD]).length, 1, '새 명함 쪽 이름을 안 다듬는다');
});

test('★ 부서만 같고 직책이 다르면 «안 묻는다»', () => {
  const b = box();
  const old2 = Object.assign({}, OLD, { title: '대리' });
  assert.equal(call(b, NEW, [NEW, old2]).length, 0,
    '★ 자리가 다른 사람을 전임자로 짚으면 멀쩡한 분이 퇴사로 찍힌다');
});

test('★ 직책만 같고 부서가 다르면 «안 묻는다»', () => {
  const b = box();
  const old2 = Object.assign({}, OLD, { dept: '생산2팀' });
  assert.equal(call(b, NEW, [NEW, old2]).length, 0);
});

test('★ 회사가 다르면 «안 묻는다»', () => {
  const b = box();
  const old2 = Object.assign({}, OLD, { company: '딴회사' });
  assert.equal(call(b, NEW, [NEW, old2]).length, 0);
});

/* ── ② 가릴 수 없으면 안 묻는다 ───────────────────────────────────── */
test('★ 새 명함에 직책·부서가 없으면 아예 안 묻는다', () => {
  const b = box();
  const bare = Object.assign({}, NEW, { dept: '', title: '' });
  assert.equal(call(b, bare, [bare, Object.assign({}, OLD, { dept: '', title: '' })]).length, 0,
    '★ 자리를 모르는데 물으면 그 회사 아무나 전임자로 짚게 된다');
});

test('회사가 없으면 안 묻는다', () => {
  const b = box();
  const bare = Object.assign({}, NEW, { company: '' });
  assert.equal(call(b, bare, [bare, Object.assign({}, OLD, { company: '' })]).length, 0);
});

/* ── ③ 같은 사람은 전임자가 아니다 ────────────────────────────────── */
test('★ 전화가 겹치면 «같은 사람»이다 — 명함을 다시 낸 것이다', () => {
  const b = box();
  const same = Object.assign({}, OLD, { mobile: NEW.mobile });
  assert.equal(call(b, NEW, [NEW, same]).length, 0,
    '★ 자기 자신을 퇴사시키라고 묻게 된다');
});

test('★ 이메일이 겹쳐도 같은 사람이다', () => {
  const b = box();
  const a = Object.assign({}, NEW, { email: 'p@x.com' });
  const same = Object.assign({}, OLD, { email: 'P@X.com' });
  assert.equal(call(b, a, [a, same]).length, 0);
});

/* ── ④ 이미 퇴사한 사람은 다시 안 묻는다 ──────────────────────────── */
test('★ 이미 퇴사로 표시된 사람은 빠진다', () => {
  const b = box({ o1: true });
  assert.equal(call(b, NEW, [NEW, OLD]).length, 0,
    '★ 이미 처리한 것을 또 물으면 물음이 소음이 된다');
});

/* ── ⑤ 자기 자신·사업자등록증은 안 본다 ───────────────────────────── */
test('★ 전화·이메일이 «없는» 명함도 자기 자신은 안 짚는다', () => {
  /* ⚠ 전화가 있으면 「같은 사람」 판정에 걸려 저절로 빠진다. 그래서 열쇠가 아예 없는
     명함으로 봐야 id 로 거르는지가 시험된다 — 2026-08-30 고장 시험에서 샜다. */
  const b = box();
  const bare2 = { id: 'x1', kind: 'card', name: '박준수', company: '가나솔루션',
                  dept: '생산1팀', title: '과장' };
  assert.equal(call(b, bare2, [bare2]).length, 0,
    '★ 방금 저장한 그 명함을 「전임자」라고 짚는다');
});

test('★ 사업자등록증에는 아예 안 묻는다 — 사람이 아니다', () => {
  const b = box();
  /* 저장된 항목은 자유로운 꼴이라 등록증에 dept·title 이 실려 올 수 있다.
     그때도 kind 로 막혀야 한다 — 자리 조건만으로는 안 걸린다. */
  const bizIt = { id: 'b0', kind: 'biz', company: '가나솔루션',
                  dept: '생산1팀', title: '과장' };
  assert.equal(call(b, bizIt, [bizIt, OLD]).length, 0,
    '★ 등록증을 사람으로 보고 전임자를 묻는다');
});

test('전임자 쪽도 사업자등록증은 안 본다', () => {
  const b = box();
  const biz = Object.assign({}, OLD, { id: 'b1', kind: 'biz' });
  assert.equal(call(b, NEW, [NEW, biz]).length, 0);
});

test('그 자리에 여럿이면 모두 보여 준다 — 고르는 것은 사람이다', () => {
  const b = box();
  const o2 = Object.assign({}, OLD, { id: 'o2', name: '이영호', mobile: '010-3333-4444' });
  assert.equal(call(b, NEW, [NEW, OLD, o2]).length, 2);
});

/* ── ⑥ 저장을 막지 않는다 · 새 명함일 때만 묻는다 ─────────────────── */
test('★ 저장을 «끝낸 뒤» 묻는다 — 물음 때문에 명함이 안 저장되면 안 된다', () => {
  const src = bare(fn('saveEditor'));
  const put = src.indexOf('Store.put(it)');
  const ask = src.indexOf('askCardHandover');
  assert.ok(put >= 0 && ask >= 0, '저장 자리나 물음 자리를 못 찾았다');
  assert.ok(put < ask,
    '★ 저장보다 먼저 묻는다 — 대표님이 창을 닫으면 찍은 명함이 사라진다');
});

test('★ 고치는 중일 때는 안 묻는다 — 새로 들어온 명함만', () => {
  const src = bare(fn('saveEditor'));
  const at = src.indexOf('askCardHandover');
  assert.ok(at >= 0, '물음 자리를 못 찾았다');
  const line = src.slice(src.lastIndexOf('\n', at) + 1, src.indexOf('\n', at));
  assert.ok(/if\s*\(\s*(_isNew|!editing\.id)\s*\)/.test(line),
    '★ 이름·직책만 고쳐 저장할 때마다 전임자를 묻게 된다 (본 줄: ' + line.trim() + ')');
});

test('전임자를 고르면 «이미 있는» 퇴사 처리를 부른다 — 새 길을 내지 않는다', () => {
  const src = bare(fn('askCardHandover'));
  assert.ok(/cardMarkLeft\(/.test(src),
    '퇴사 적는 길을 새로 만들었다 — 적는 곳이 둘이 되면 어느 쪽이 참인지 모른다');
  assert.ok(!/data\/companies/.test(src),
    '업체관리에 직접 쓴다 — cardMarkLeft 한 곳만 써야 규칙이 하나로 남는다');
});
