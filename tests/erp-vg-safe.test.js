'use strict';
// 자동 새로고침 «안전한 순간» 판정이 화면을 멈추지 않는지 — node --test tests/erp-vg-safe.test.js
//
// 왜: 새 버전을 감지하면 5초마다 _vgSafeNow() 로 «지금 새로고침해도 되나» 를
// 물었는데, 그 안의 덮개 검사가 div[style*="fixed"] 를 전부 모아 하나하나
// getComputedStyle 을 불렀다. 이 앱은 스타일이 전부 인라인이라 후보가 수천 개
// — 한 번에 745ms, 5초마다 화면이 멈췄다(#88 이름표가 실명으로 잡음).
//
// ⚠ 무서운 되돌아감은 «팝업 보호가 풀리는» 것이다. 팝업에 입력하다 자동
//   새로고침으로 내용이 날아간 제보(2026-08-07)가 있어, 빨라지려다 그 보호를
//   깨면 안 된다. 그래서 판정의 뜻을 하나씩 값으로 확인한다.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const app = fs.readFileSync(path.join(__dirname, '..', 'pu-erp.html'), 'utf8').replace(/\r\n/g, '\n');

function load(env) {
  env = env || {};
  const from = app.indexOf('function _vgInputFocused(){');
  const to = app.indexOf('function _vgReloadNow(){');
  assert.ok(from > 0 && to > from, '판정 토막을 찾을 수 없습니다');

  let styleCalls = 0;
  const mkEl = (o) => Object.assign({
    tagName: 'DIV', parentElement: null, isContentEditable: false,
    getBoundingClientRect() { return o && o.rect || { width: 0, height: 0 }; }
  }, o);
  const body = mkEl({ tagName: 'BODY' });
  const sandbox = {
    _VG_IDLE_MS: 30000,
    _vgLastActivity: env.lastActivity !== undefined ? env.lastActivity : 0,
    Date: { now: () => 100000 },
    window: { innerWidth: 1900, innerHeight: 1000 },
    getComputedStyle(el) { styleCalls++; return el._cs || { display: 'block', visibility: 'visible', position: 'static' }; },
    document: {
      hidden: !!env.hidden,
      body: body,
      documentElement: mkEl({ tagName: 'HTML' }),
      activeElement: env.typing ? mkEl({ tagName: 'INPUT' }) : mkEl({ tagName: 'BODY' }),
      querySelectorAll(sel) { return (env.modals && sel.indexOf('.modal-bg') >= 0) ? env.modals(mkEl) : []; },
      elementFromPoint() { return env.center ? env.center(mkEl, body) : body; }
    }
  };
  vm.createContext(sandbox);
  vm.runInContext(app.slice(from, to), sandbox);
  // 토막 안의 var _vgLastActivity = Date.now() 선언이 위 설정을 덮으므로 되돌린다
  sandbox._vgLastActivity = env.lastActivity !== undefined ? env.lastActivity : 0;
  sandbox._VG_IDLE_MS = 30000;
  return { safe: () => sandbox._vgSafeNow(), styleCalls: () => styleCalls };
}

test('덮개 검사가 화면 전체를 뒤지지 않는다 (그것이 745ms 의 원인이었다)', () => {
  const src = app.slice(app.indexOf('function _vgDialogOpen(){'), app.indexOf('function _vgSafeNow(){'));
  // 주석에는 옛 방식 이야기가 남아 있으므로, 실제 호출 모양만 본다
  assert.ok(src.indexOf("querySelectorAll('div[style*=") < 0, '전수 조사로 되돌아가면 안 된다');
  assert.ok(src.indexOf('elementFromPoint') > 0, '한복판에서 거슬러 올라가는 방식이어야 한다');
});

test('방금까지 손대고 있었으면 비싼 검사 없이 곧장 «보류»', () => {
  const t = load({ lastActivity: 100000 - 1000 });      // 1초 전까지 활동
  assert.equal(t.safe(), false);
  assert.equal(t.styleCalls(), 0, '덮개 검사를 아예 안 해야 한다');
});

test('팝업(.modal-bg)이 열려 있으면 오래 손 놓았어도 «보류»', () => {
  const t = load({
    lastActivity: 0,                                     // 한참 전
    modals: (mk) => [mk({ _cs: { display: 'block', visibility: 'visible' }, rect: { width: 500, height: 400 } })]
  });
  assert.equal(t.safe(), false);
});

test('숨긴 탭이어도 팝업이 열려 있으면 «보류» — 입력이 날아간 제보의 재발 방지', () => {
  const t = load({
    hidden: true, lastActivity: 100000 - 1000,           // 방금까지 활동 + 숨김
    modals: (mk) => [mk({ _cs: { display: 'block', visibility: 'visible' }, rect: { width: 500, height: 400 } })]
  });
  assert.equal(t.safe(), false, '숨김이 지름길을 타고 팝업 보호를 건너뛰면 안 된다');
});

test('코드로 그린 전체 덮개도 잡는다 — 한복판에서 위로 거슬러', () => {
  const t = load({
    lastActivity: 0,
    center: (mk, body) => {
      const overlay = mk({ _cs: { position: 'fixed' }, rect: { width: 1900, height: 1000 }, parentElement: body });
      return mk({ rect: { width: 400, height: 300 }, parentElement: overlay });   // 팝업 내용물
    }
  });
  assert.equal(t.safe(), false);
});

test('덮개가 없고 오래 손 놓았으면 «안전»', () => {
  const t = load({ lastActivity: 0 });
  assert.equal(t.safe(), true);
});

test('입력칸에 커서가 있으면 «보류»', () => {
  const t = load({ lastActivity: 0, typing: true });
  assert.equal(t.safe(), false);
});

test('숨긴 탭 + 팝업 없음이면 «안전» (백그라운드 새로고침은 원래 되던 것)', () => {
  const t = load({ hidden: true, lastActivity: 0 });
  assert.equal(t.safe(), true);
});
