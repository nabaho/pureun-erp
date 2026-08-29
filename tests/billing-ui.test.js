'use strict';
/* 파이어베이스 이번 달 사용액 — 화면에 내놓는 값
   대표 결정 2026-08-15: 안 A(관리자 화면) · 대표+관리자 · 첫 달은 눈금 없이 금액만.

   이 화면에서 제일 나쁜 상태는 「틀린 줄 모르는 숫자」다. 그래서
     · 없는 값을 0 으로 그리지 않는다 (0 은 「안 썼다」로 읽힌다)
     · 눈금이 없으면 막대를 아예 안 그린다 (빈 막대는 다 안 썼다는 뜻이 된다)
     · 소식이 끊기면 밝힌다 (옛 금액이 최신인 척 남는 것을 막는다)
   를 못 박는다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const R = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(R, 'js', 'pu-billing.js'), 'utf8');
const erp = fs.readFileSync(path.join(R, 'pu-erp.html'), 'utf8');
/* 대표 지시 2026-08-17: 사용액을 푸른이알피 사이드바에서 «포털» 로 옮겼다.
   이알피에 들어가야만 보이던 것을, 로그인하면 바로 보이게. */
const enter = fs.readFileSync(path.join(R, 'enter.html'), 'utf8');

const ctx = vm.createContext({ console });
vm.runInContext(src, ctx);
const B = ctx.PuBilling;

const AUG = Date.parse('2026-08-01T00:00:00Z');
const DAY = 86400000;
const HOUR = 3600000;
function total(over) {
  return Object.assign({ label: '전체', cost: 18400, budget: null, currency: 'KRW',
    intervalStart: AUG, threshold: null, updatedAt: AUG + DAY }, over || {});
}

test('금액 쓰기', async (t) => {
  await t.test('원화로 쉼표 찍어 쓴다', () => {
    assert.equal(B.fmtWon(18400), '₩18,400');
    assert.equal(B.fmtWon(0), '₩0');
  });
  await t.test('값이 없으면 0 이 아니라 — 로 쓴다', () => {
    assert.equal(B.fmtWon(null), '—');
    assert.equal(B.fmtWon(undefined), '—');
    assert.notEqual(B.fmtWon(null), B.fmtWon(0));
  });
});

test('눈금 대비 얼마나 찼나', async (t) => {
  await t.test('눈금이 있으면 비율이 나온다', () => {
    assert.equal(B.ratio({ cost: 25000, budget: 50000 }), 0.5);
  });
  await t.test('눈금이 없으면 null — 0 이 아니다', () => {
    // 0 을 돌려주면 「하나도 안 썼다」로 그려진다. 대표 결정대로 첫 달은 눈금이 없다.
    assert.equal(B.ratio({ cost: 25000, budget: null }), null);
    assert.equal(B.ratio({ cost: 25000, budget: 0 }), null);
    assert.equal(B.ratio(null), null);
  });
  await t.test('색은 8할에서 노랑, 다 차면 빨강', () => {
    assert.equal(B.tone(0.37), 'ok');
    assert.equal(B.tone(0.8), 'warn');
    assert.equal(B.tone(1), 'over');
    assert.equal(B.tone(1.4), 'over');
  });
  await t.test('눈금이 없으면 색도 없다', () => {
    assert.equal(B.tone(null), 'none');
  });
});

test('언제 것인지 밝히기', async (t) => {
  const now = AUG + 10 * DAY;

  await t.test('지난 시간을 사람 말로', () => {
    assert.equal(B.agoText(now - 30000, now), '방금 전');
    assert.equal(B.agoText(now - 22 * 60000, now), '22분 전');
    assert.equal(B.agoText(now - 5 * HOUR, now), '5시간 전');
    assert.equal(B.agoText(now - 3 * DAY, now), '3일 전');
  });

  await t.test('갱신 기록이 아예 없으면 끊긴 것으로 본다', () => {
    assert.equal(B.isStale(null, now), true);
  });

  await t.test('밤새 조용한 것은 정상이라 안 알린다', () => {
    // ⚠ 구글은 금액이 움직일 때만 쏜다. 3시간으로 잡으면 거의 매일 아침 거짓 경고가
    //    뜨고, 매일 뜨는 경고는 곧 아무도 안 본다.
    assert.equal(B.isStale(now - 8 * HOUR, now), false);
    assert.ok(B.STALE_MS > DAY, '하루를 통째로 넘겨도 견뎌야 한다');
  });

  await t.test('하루를 넘겨 소식이 없으면 알린다', () => {
    assert.equal(B.isStale(now - 30 * HOUR, now), true);
  });
});

test('월말 예상액', async (t) => {
  await t.test('하루가 지나기 전에는 안 내놓는다', () => {
    // 첫날 몇 시간으로 한 달을 점치면 터무니없는 숫자가 나온다.
    assert.equal(B.projectMonthEnd(total(), AUG + 3 * HOUR), null);
  });
  await t.test('열흘 치로 8월(31일)을 어림한다', () => {
    const p = B.projectMonthEnd(total({ cost: 10000 }), AUG + 10 * DAY);
    assert.equal(p, 31000);
  });
  await t.test('달을 다 채웠으면 쓴 만큼 그대로', () => {
    assert.equal(B.projectMonthEnd(total({ cost: 10000 }), AUG + 40 * DAY), 10000);
  });
});

test('화면 한 덩어리로 묶기', async (t) => {
  const now = AUG + 10 * DAY;

  await t.test('값이 하나도 없으면 그릴 것이 없다', () => {
    // 예산 알림을 켜기 전이거나 읽기 권한이 없는 상태. 이때 ₩— 를 띄우면
    // 고장인지 준비 중인지 알 수 없는 자리가 하나 늘 뿐이다.
    assert.equal(B.summarize(null, now).has, false);
    assert.equal(B.summarize({}, now).has, false);
  });

  await t.test('쪼갠 항목을 총액과 함께 내놓는다', () => {
    const s = B.summarize({
      total: total({ cost: 18400 }),
      storage: { label: '사진 창고', cost: 11200, intervalStart: AUG },
      database: { label: '실시간DB', cost: 4900, intervalStart: AUG },
      functions: { label: '서버 · 메일', cost: 2300, intervalStart: AUG },
    }, now);
    assert.equal(s.has, true);
    assert.equal(s.cost, 18400);
    // ⚠ deepEqual 을 쓰지 않는다 — 이 배열은 vm 안에서 만들어져 겉모습이 같아도
    //    다른 realm 의 Array 라 엄격 비교가 실패한다. 글자로 붙여 견준다.
    assert.equal(s.parts.map((p) => p.label).join('|'), '사진 창고|실시간DB|서버 · 메일');
  });

  await t.test('쪼갠 것을 더해 총액에 못 미치면 「그 밖」으로 내놓는다', () => {
    // ⚠ 예산을 안 건 서비스가 남아 합이 안 맞는다. 감추면 더해 보신 대표님이
    //    안 맞는 것을 발견하시고, 그때부터 이 화면 전체를 못 믿게 된다.
    const s = B.summarize({
      total: total({ cost: 20000 }),
      storage: { label: '사진 창고', cost: 11200, intervalStart: AUG },
    }, now);
    const etc = s.parts.find((p) => p.key === 'etc');
    assert.ok(etc, '모자란 몫이 드러나야 한다');
    assert.equal(etc.cost, 8800);
  });

  await t.test('1원 어긋난 것으로는 「그 밖」을 만들지 않는다', () => {
    const s = B.summarize({
      total: total({ cost: 11201 }),
      storage: { label: '사진 창고', cost: 11200, intervalStart: AUG },
    }, now);
    assert.equal(s.parts.some((p) => p.key === 'etc'), false);
  });

  await t.test('눈금을 안 정하셨으면 막대를 안 그린다 — 첫 달은 지켜보기만 한다', () => {
    const s = B.summarize({ total: total({ budget: 999999 }) }, now);
    // ⚠ 구글 예산액(999,999)은 알림 방아쇠일 뿐 눈금이 아니다. 이걸 눈금으로 쓰면
    //    대표님은 늘 「2% 썼다」만 보시게 되고, 그 막대는 아무 뜻도 없다.
    assert.equal(s.budget, null);
    assert.equal(s.ratio, null);
  });

  await t.test('눈금을 정하시면 그 값으로 잰다', () => {
    const s = B.summarize({ total: total({ cost: 25000, budget: 999999 }), limit: 50000 }, now);
    assert.equal(s.budget, 50000);
    assert.equal(s.ratio, 0.5);
  });

  await t.test('쪼갠 값이 아직 없어도 총액은 보인다', () => {
    const s = B.summarize({ total: total() }, now);
    assert.equal(s.has, true);
    assert.equal(s.parts.length, 0);
  });
});

test('금액 지켜보기는 읽기 전용이다', async (t) => {
  await t.test('쓰기 수단이 아예 없다', () => {
    /* ⚠ 화면은 실시간DB를 직접 못 만진다(2026-07 실데이터 사고 뒤로).
       읽기 길을 이 파일로 모았으므로, 여기에 쓰기가 섞이면 막아 둔 문이
       이 파일을 통해 다시 열린다. */
    assert.equal(/\.set\(|\.update\(|\.remove\(/.test(src), false,
      'pu-billing.js 에 쓰기가 들어왔습니다 — 이 파일은 읽기만 해야 합니다.');
  });

  await t.test('실패 콜백을 넘겨준다', () => {
    const i = src.indexOf('function watch(');
    const fn = src.slice(i, i + 700);
    assert.match(fn, /if \(onError\) onError\(e\)/,
      '막혔을 때 알려 주지 않으면 화면이 영영 빈 채로 있습니다.');
  });

  await t.test('그만 볼 수 있다', () => {
    const i = src.indexOf('function watch(');
    assert.match(src.slice(i, i + 700), /ref\.off\('value', cb\)/, '구독을 끊을 길이 없습니다.');
  });

  await t.test('DB가 아직 없으면 조용히 아무것도 안 한다', () => {
    /* 로그인 전에는 db 가 없다. 여기서 터지면 사진첩 첫 화면이 통째로 죽는다. */
    let called = 0;
    const off = B.watch(null, function () { called++; });
    assert.equal(typeof off, 'function', '끊는 함수는 늘 돌려줘야 합니다.');
    off();
    assert.equal(called, 0);
  });

  await t.test('값이 오면 그대로 넘긴다', () => {
    let got = 'X';
    const fakeDb = {
      ref: function () {
        return {
          on: function (ev, ok) { ok({ val: function () { return { hi: 1 }; } }); return ok; },
          off: function () { },
        };
      },
    };
    B.watch(fakeDb, function (v) { got = v; });
    assert.equal(got && got.hi, 1);
  });
});

test('관리자 화면에 붙는 자리 (enter.html — 포털)', async (t) => {
  await t.test('저장 층을 싣는다', () => {
    assert.match(enter, /<script src="js\/pu-billing\.js(\?v=\d+)?"><\/script>/);
  });

  await t.test('★ 이알피에는 더 이상 없다 — 자리가 둘이면 한쪽만 고쳐진다', () => {
    // 2026-08-17 포털로 옮겼다. 되살아나면 두 자리가 서로 어긋난다.
    assert.equal(/BillingBar|PuBilling/.test(erp), false);
  });

  await t.test('관리자에게만 그린다 — 회사 지출액이다', () => {
    // 대표 결정: 대표+관리자. 전 직원에게 보이면 안 된다.
    assert.match(enter, /function billIsAdmin\(role\)\{\s*return role === 'admin' \|\| role === 'admin-delegate';\s*\}/);
  });

  await t.test('★ 관리자가 아니면 구독조차 안 한다 — 감추기만 하면 값은 이미 와 있다', () => {
    const i = enter.indexOf('function billStart(role){');
    const body = enter.slice(i, i + 1500);
    const guard = body.indexOf('if(!billIsAdmin(role)');
    const watch = body.indexOf('PuBilling.watch');
    assert.ok(guard >= 0 && watch > guard, '관리자 확인이 watch 보다 먼저여야 한다');
  });

  await t.test('숫자 판단을 화면이 따로 하지 않는다', () => {
    const i = enter.indexOf('function billPaint()');
    const body = enter.slice(i, i + 3000);
    // 여기서 직접 나누기 시작하면 pu-billing.js 와 두 벌이 되고, 한쪽만 고쳐진다.
    assert.equal(/\/\s*(row\.)?budget/.test(body), false, '비율 계산은 pu-billing.js 몫이다');
    assert.match(body, /PuBilling\.summarize\(/);
  });

  await t.test('규칙에 막히면 조용히 안 그린다', () => {
    const i = enter.indexOf('function billStart(role){');
    const body = enter.slice(i, i + 1500);
    // watch 의 셋째(실패) 콜백을 빠뜨리면 콘솔에 빨간 오류만 남고 화면은 영영 빈 채다.
    assert.match(body, /PuBilling\.watch\([\s\S]{0,300}?function\(\)\{ _billCur = null; billPaint\(\); \}\)/);
  });

  await t.test('다른 계정으로 바뀌면 앞 구독을 끊는다', () => {
    const i = enter.indexOf('function billStart(role){');
    const body = enter.slice(i, i + 1500);
    assert.match(body, /if\(_billStop\)\{[^}]*_billStop\(\)/);
  });

  await t.test('눌러서 자세히 보는 팝업이 있다', () => {
    assert.match(enter, /id="billModal"/);
    assert.match(enter, /\$\('billChip'\)\.addEventListener\('click', billOpen\)/);
  });
});

/* ══════ 「그 밖」 착시 (2026-08-16 밤 실제 사례) ══════
   칸마다 구글 예산 알림이 따로 와서 갱신 시각이 어긋난다. 전체만 새로 오고
   실시간DB 칸이 낡아 있으면, 실시간DB가 오른 몫이 뺄셈에서 「그 밖」으로 새어
   보인다 — 그날 밤 그 밖이 실제 ₩3,725인데 ₩6,379로 보였고, 대표가 엉뚱한
   칸(다른 구글 서비스)을 의심하셨다. 숫자는 그대로 두되(지어내지 않는다)
   **못 믿는 값이라는 표시(≈)와 어느 칸을 기다리는지**를 함께 내놓는다. */
test('「그 밖」이 낡은 칸 때문에 부풀 수 있으면 그렇다고 말한다', async (t) => {
  const MIN = 60000;
  const NOW = AUG + 15 * DAY + 21 * HOUR + 23 * MIN;   // 그날 밤 21:23쯤

  /* 그날 밤 실제 값 그대로 — database 알림만 38분 낡았다 */
  function nightCase(over) {
    return Object.assign({
      total:     { label: '전체',      cost: 81626, intervalStart: AUG, updatedAt: NOW },
      database:  { label: '실시간DB',  cost: 75248, intervalStart: AUG, updatedAt: NOW - 38 * MIN },
      storage:   { label: '사진 창고', cost: 0.12,  intervalStart: AUG, updatedAt: NOW - 2 * MIN },
      functions: { label: '서버 · 메일', cost: 0,   intervalStart: AUG, updatedAt: NOW - 3 * MIN },
    }, over || {});
  }

  await t.test('★ 그날 밤 사례 — 그 밖에 ≈ 가 붙고 실시간DB를 기다린다고 말한다', () => {
    const s = B.summarize(nightCase(), NOW);
    const etc = s.parts.find((p) => p.key === 'etc');
    assert.ok(etc, '그 밖이 있어야 한다');
    assert.equal(Math.round(etc.cost), 6378, '숫자 자체는 지어내지 않는다 — 표시만 얹는다');
    assert.equal(etc.approx, true, '★ 표시가 없으면 대표가 엉뚱한 칸을 의심하신다');
    assert.match(s.etcNote, /실시간DB/, '★ 어느 칸을 기다리는지 이름을 대야 한다');
    assert.doesNotMatch(s.etcNote, /사진 창고/, '멀쩡한 칸까지 의심하게 하면 안 된다');
  });

  await t.test('모든 칸이 싱싱하면 ≈ 도 안내도 없다', () => {
    const fresh = nightCase({ database: { label: '실시간DB', cost: 77901, intervalStart: AUG, updatedAt: NOW - 2 * MIN } });
    const s = B.summarize(fresh, NOW);
    const etc = s.parts.find((p) => p.key === 'etc');
    assert.ok(etc);
    assert.ok(!etc.approx, '멀쩡한데 ≈ 를 붙이면 표시가 값어치를 잃는다');
    assert.equal(s.etcNote, null);
  });

  await t.test('경계 — 10분 안쪽 어긋남은 정상이다 (알림은 원래 조금씩 어긋난다)', () => {
    const s = B.summarize(nightCase({
      database: { label: '실시간DB', cost: 75248, intervalStart: AUG, updatedAt: NOW - 9 * MIN },
    }), NOW);
    const etc = s.parts.find((p) => p.key === 'etc');
    assert.ok(!etc.approx, '9분 차이로 매번 ⚠ 가 뜨면 아무도 안 본다');

    const s2 = B.summarize(nightCase({
      database: { label: '실시간DB', cost: 75248, intervalStart: AUG, updatedAt: NOW - 11 * MIN },
    }), NOW);
    assert.equal(s2.parts.find((p) => p.key === 'etc').approx, true, '★ 11분부터는 말해야 한다');
  });

  await t.test('칸에 갱신 시각이 아예 없으면 — 언제 것인지 모르는 값이니 ≈', () => {
    const s = B.summarize(nightCase({
      database: { label: '실시간DB', cost: 75248, intervalStart: AUG },
    }), NOW);
    assert.equal(s.parts.find((p) => p.key === 'etc').approx, true);
  });

  await t.test('★ ₩0 칸이 며칠 조용해도 ⚠ 를 만들지 않는다 (2026-08-17 아침 실사례)', () => {
    /* 구글은 금액이 움직일 때만 알림을 쏜다 — 서버(₩0)·사진 창고(₩0.12)는
       영영 「낡은」 채다. 그날 아침 배지가 「사진 창고·서버 갱신 대기 중」이라는
       상시 경고를 달고 있었다 — 매일 뜨는 경고는 곧 아무도 안 본다. */
    const s = B.summarize(nightCase({
      database:  { label: '실시간DB',  cost: 79670, intervalStart: AUG, updatedAt: NOW - 2 * MIN },
      storage:   { label: '사진 창고', cost: 0.12,  intervalStart: AUG, updatedAt: NOW - 3 * DAY },
      functions: { label: '서버 · 메일', cost: 0,   intervalStart: AUG, updatedAt: NOW - 15 * DAY },
      total:     { label: '전체',      cost: 83903, intervalStart: AUG, updatedAt: NOW },
    }), NOW);
    const etc = s.parts.find((p) => p.key === 'etc');
    assert.ok(etc, '그 밖 자체는 있어야 한다');
    assert.ok(!etc.approx, '★ 0원 칸 때문에 ⚠ 가 상시등이 되면 진짜 경고도 안 보게 된다');
    assert.equal(s.etcNote, null);
  });

  await t.test('전체에 갱신 시각이 없으면 견줄 수 없다 — 표시하지 않는다', () => {
    /* 견줄 기준이 없는데 ≈ 를 붙이면 근거 없는 경고다. 이 경우는 기존
       stale(하루 넘게 조용함) 장치가 따로 지킨다. */
    const s = B.summarize(nightCase({
      total: { label: '전체', cost: 81626, intervalStart: AUG },
    }), NOW);
    const etc = s.parts.find((p) => p.key === 'etc');
    assert.ok(etc && !etc.approx);
    assert.equal(s.etcNote, null);
  });

  await t.test('화면 둘 다 표시를 그린다 — 판단은 pu-billing 한 곳', () => {
    /* 값 층이 approx 를 내놓아도 화면이 안 그리면 없는 기능이다.
       (⚠ 글자 확인이지만, 여기 렌더러는 React 없이 못 돌린다 — 존재만 본다) */
    assert.match(enter, /p\.approx \? '≈ ' : ''/, '포털이 ≈ 를 안 그립니다');
    assert.match(enter, /s\.etcNote/, '포털이 안내를 안 그립니다');
    const photos = fs.readFileSync(path.join(R, 'pu-photos.html'), 'utf8');
    assert.match(photos, /p\.approx \? '≈ ' : ''/, '사진첩이 ≈ 를 안 그립니다');
    assert.match(photos, /s\.etcNote/, '사진첩이 안내를 안 그립니다');
  });

  await t.test('값 층을 고쳤으면 ?v= 을 올렸다 — 안 올리면 고친 것이 캐시에 묻힌다', () => {
    /* 실제로 당했다(서식 수정이 통째로 묻힘). pu-billing 은 ?v= 로 실린다. */
    const photos = fs.readFileSync(path.join(R, 'pu-photos.html'), 'utf8');
    for (const html of [enter, photos]) {
      const m = html.match(/js\/pu-billing\.js\?v=(\d+)/);
      assert.ok(m, 'pu-billing.js 에 ?v= 가 없습니다');
      assert.ok(Number(m[1]) >= 3, '★ ?v= 를 안 올려 approx 기능이 캐시에 묻힙니다');
    }
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   월말 어림을 «최근 며칠» 로 민다 (대표 확인 2026-08-29)

   ★ 왜 바꿨나
     8월 첫 16일은 하루 ₩5,448 이었다. 8/27 에 요금 새던 곳을 막아 하루 ₩585 로
     내려갔다. 그런데도 화면은 「이 추세면 월말 ₩113,241」을 계속 내놓았다 —
     달 평균으로 밀면 **이미 끝난 «비싸던 시기»가 월말까지 따라붙기** 때문이다.
     고친 보람이 안 보이면 아무도 고치지 않는다. 그것이 이 검사가 지키는 것이다.

   ⚠ 아래는 «지금 숫자» 를 박지 않는다. 지키는 것은 규칙 넷이다 —
     ① 최근이 싸지면 어림도 내려간다  ② 오늘(반쪽 하루)은 세지 않는다
     ③ 아는 날이 모자라면 달 평균으로 되돌아간다  ④ 어느 쪽으로 밀었는지 밝힌다 */

/* 시간 칸을 손으로 짓는다 — 하루에 한 칸이면 「그 날 늘어난 돈」이 그대로 담긴다.
   tz:0 으로 고정해 검사가 기계의 시간대에 흔들리지 않게 한다. */
function histOf(perDay) {          // perDay: { 'YYYY-MM-DD': 그 날 늘어난 돈 }
  const total = {};
  let cum = 0;
  const days = Object.keys(perDay).sort();
  // 첫 칸은 견줄 앞 값이 없어 「모른다」가 되므로, 하루 앞에 기준점을 하나 놓는다
  const first = Date.parse(days[0] + 'T00:00:00Z') - DAY;
  total[first] = 0;
  days.forEach(d => { cum += perDay[d]; total[Date.parse(d + 'T12:00:00Z')] = cum; });
  return { total: total };
}
function bk(perDay) { return B.hourBuckets(histOf(perDay), { tz: 0 }); }

test('월말 어림 — 최근 며칠로 민다', async (t) => {
  /* 앞은 비쌌고 뒤는 싸졌다. 달 평균은 비싸던 때에 끌려가고, 최근 기준은 안 끌려간다. */
  const 쌈 = { '2026-08-01': 5000, '2026-08-02': 5000, '2026-08-03': 5000,
              '2026-08-04': 500, '2026-08-05': 500, '2026-08-06': 500 };
  const now = Date.parse('2026-08-07T00:00:00Z');
  const row = total({ cost: 16500, intervalStart: AUG });

  await t.test('★ 최근이 싸지면 어림도 «따라 내려간다»', () => {
    const 달평균 = B.projectMonthEnd(row, now);
    const 최근 = B.projectRecent(row, bk(쌈), now, { tz: 0 });
    assert.ok(최근, '최근 기준을 못 냈습니다');
    assert.ok(최근.cost < 달평균,
      '★ 최근이 싸졌는데 어림이 안 내려갑니다 — 고친 보람이 화면에 안 보입니다.\n' +
      '  달 평균 ' + 달평균 + ' · 최근 기준 ' + 최근.cost);
    /* 그리고 «지금까지 쓴 돈» 보다는 커야 한다 — 남은 날에도 돈은 든다 */
    assert.ok(최근.cost > row.cost, '★ 남은 날을 0원으로 봤습니다.');
  });

  await t.test('★ 오늘(아직 안 끝난 하루)은 «세지 않는다»', () => {
    /* 같은 기록을 아침에 봐도 저녁에 봐도 «하루 평균» 은 같아야 한다.
       오늘을 온전한 하루로 치면 아침엔 평균이 실제의 몇 분의 일로 나온다. */
    const 아침 = B.projectRecent(row, bk(쌈), Date.parse('2026-08-07T01:00:00Z'), { tz: 0 });
    const 저녁 = B.projectRecent(row, bk(쌈), Date.parse('2026-08-07T22:00:00Z'), { tz: 0 });
    assert.equal(아침.perDay, 저녁.perDay,
      '★ 보는 시각에 따라 하루 평균이 달라집니다 — 오늘을 세고 있습니다.');
  });

  await t.test('★ 아는 날이 모자라면 «내놓지 않는다» (달 평균으로 되돌아간다)', () => {
    const 하루뿐 = { '2026-08-01': 5000 };
    assert.equal(B.projectRecent(row, bk(하루뿐), Date.parse('2026-08-02T12:00:00Z'), { tz: 0 }), null,
      '★ 하루치로 한 달을 점치면 그날의 튐이 그대로 월말이 됩니다.');
    assert.equal(B.projectRecent(row, [], now, { tz: 0 }), null, '★ 기록이 없는데 값을 냈습니다.');
  });

  await t.test('★ 지난 달 기록으로 이번 달을 밀지 않는다', () => {
    const 지난달 = { '2026-07-10': 5000, '2026-07-11': 5000, '2026-07-12': 5000 };
    assert.equal(B.projectRecent(row, bk(지난달), now, { tz: 0 }), null,
      '★ 지난 달 칸으로 이번 달 월말을 밀면 엉뚱한 숫자가 됩니다.');
  });

  await t.test('★ 어느 쪽으로 밀었는지 «밝힌다»', () => {
    const 최근 = B.summarize({ total: row }, now, bk(쌈));
    assert.equal(최근.projectedBasis.mode, 'recent');
    assert.ok(최근.projectedBasis.days >= 2, '몇 날로 밀었는지 안 알려 줍니다.');
    assert.ok(최근.projectedBasis.perDay > 0, '하루 얼마로 봤는지 안 알려 줍니다.');

    const 없음 = B.summarize({ total: row }, now);
    assert.equal(없음.projectedBasis.mode, 'month',
      '★ 기록이 없으면 달 평균이라고 밝혀야 합니다 — 안 밝히면 숫자를 못 믿습니다.');
    assert.equal(없음.projected, B.projectMonthEnd(row, now));
  });
});

test('★ 화면이 그 기준을 실제로 적어 준다', () => {
  const enterSrc = enter;
  assert.match(enterSrc, /projectedBasis/,
    '★ 화면이 기준을 안 읽습니다 — 숫자만 보여 주면 대표는 왜 그런지 물을 수밖에 없습니다.');
  /* ⚠ [^)]* 로 훑으면 안 된다 — 사이에 Date.now() 의 닫는 괄호가 있다 */
  assert.match(enterSrc, /summarize\(\s*_billCur[\s\S]{0,60}?_billHistBk\s*\)/,
    '★ 화면이 기록을 안 넘겨 줍니다 — 그러면 영영 달 평균으로만 밉니다.');
});
