'use strict';
/* 정부사업신청 앱(gov.html) 정적 검사
   대표 지시 2026-09-05 「별도 프로그램 … 정부사업신청 으로」 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'gov.html'), 'utf8');
const kcareer = fs.readFileSync(path.join(__dirname, '..', 'kcareer.html'), 'utf8');

test('인라인 스크립트가 문법 오류 없이 파싱된다', () => {
  const blocks = [...src.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)];
  assert.ok(blocks.length > 0);
  blocks.forEach((m, i) => {
    if (!m[1].trim()) return;
    assert.doesNotThrow(() => new vm.Script(m[1], { filename: 'gov.html:' + i }));
  });
});

test('부품 셋을 외부 파일로 로드한다', () => {
  ['gov-g2b', 'gov-alio', 'gov-bizinfo'].forEach((m) => {
    assert.match(src, new RegExp('<script src="js/' + m + '\\.js\\?v=\\d+"></script>'),
      m + ' 를 ?v= 와 함께 불러야 합니다');
  });
});

test('★ 경력관리와 저장 자리가 겹치지 않는다', () => {
  // ⚠ 같은 자리를 쓰면 한쪽이 다른 쪽 자료를 덮는다
  assert.match(src, /var NS='gov3_'/, '이 앱만의 접두사를 씁니다');
  assert.ok(src.indexOf("'cm3_'") < 0, '경력관리 접두사를 쓰면 안 됩니다');
  assert.match(src, /fbDb\.ref\('gov\/'\s*\+\s*fbUid\)/, '클라우드도 gov/{uid} 자리입니다');
  assert.ok(!/ref\('kcareer\//.test(src), '경력관리 자리를 건드리면 안 됩니다');
});

test('★★ 「모르면 잠근다」 — 신원을 못 알아내면 열지 않는다', () => {
  const m = src.match(/async function whoAmI\([\s\S]*?\n\}/);
  assert.ok(m, 'whoAmI 가 있어야 합니다');
  assert.match(m[0], /return \{ *ok: *false/, '마지막은 «못 열어 줌»으로 끝나야 합니다');
  assert.match(m[0], /uid_roles/, '권한은 uid_roles 를 1순위로 봅니다');
});

test('★ pu-erp 봉투를 벗긴다', () => {
  // pu-erp 는 data/{키} = {v:값, u:시각} 으로 담는다. 안 벗기면 직원 목록이 어긋난다.
  const m = src.match(/async function whoAmI\([\s\S]*?\n\}/);
  assert.match(m[0], /hasOwnProperty\.call\(raw, *'v'\)/, '봉투를 벗겨야 합니다');
});

test('★ 확인 중에는 잠그지 않는다', () => {
  // 깜빡임을 만든다 — 경력관리에서 정한 규칙과 같다
  const m = src.match(/function applyLock\([\s\S]*?\n\}/);
  assert.ok(m);
  assert.match(m[0], /checking/, 'checking 상태를 따로 다뤄야 합니다');
});

test('★ 하루 1,000회 제한을 지킨다 — 화면 열 때마다 부르지 않는다', () => {
  const m = src.match(/function auto\([\s\S]*?\n\}/);
  assert.ok(m, 'auto 가 있어야 합니다');
  assert.match(m[0], /lsGet\('last'\)/, '마지막으로 받은 날을 기억해야 합니다');
});

test('★ 인증키가 둘이라는 것을 화면이 밝힌다', () => {
  const m = src.match(/function readyNote\([\s\S]*?\n\}/);
  assert.ok(m);
  assert.match(m[0], /data\.go\.kr\/data\/15129394/, '나라장터·알리오 겸용 발급 주소');
  assert.match(m[0], /bizinfo\.go\.kr/, '기업마당은 따로 받아야 합니다');
  assert.match(m[0], /Decoding/, '어느 열쇠인지 밝혀야 합니다');
});

test('★★ 「교육」은 낱말에 없다', () => {
  // 대표 지시 2026-09-06. 클린아이 410건 실측에서 걸린 9건이 전부
  // 「평생교육진흥원 직원 채용」 오탐이었다 — 되살리지 말 것.
  const G = require('../js/gov-g2b.js');
  assert.ok(G.KEYWORDS_DEFAULT.indexOf('교육') < 0);
  assert.deepEqual(G.KEYWORDS_DEFAULT, ['노무', '인사', '고용', '임금', '컨설팅', '일터혁신', '노사']);
});

test('★ 마감이 지나도 관심 표시한 것은 건드리지 않는다', () => {
  const m = src.match(/function ageOut\([\s\S]*?\n\}/);
  assert.ok(m);
  assert.match(m[0], /관심/, '관심·지원함은 「지나감」으로 바꾸지 않습니다');
});

test('★ 숨긴 공고는 CSV 에도 안 나간다', () => {
  const m = src.match(/function expCsv\([\s\S]*?\n\}/);
  assert.ok(m);
  assert.match(m[0], /!r\.hidden/);
});

test('★★ 경력관리에는 여전히 나라장터가 없다', () => {
  // 별도 앱으로 뺀 것을 되돌리지 말 것(대표 지시 2026-09-05)
  ['g2b', 'G2B', '나라장터'].forEach((t) => {
    assert.ok(kcareer.indexOf(t) < 0, '경력관리에 「' + t + '」 가 되살아났습니다');
  });
});

test('출처를 표에 밝힌다', () => {
  assert.match(src, /<option>나라장터<\/option><option>알리오<\/option><option>기업마당<\/option>/);
});

/* ───────── 실제로 그려지는가 (가짜 화면에서 돌려 본다) ───────── */

function runApp(seed) {
  const els = {};
  function el(id) {
    if (!els[id]) els[id] = { id, innerHTML: '', textContent: '', value: '',
      style: {}, classList: { add(){}, remove(){} } };
    return els[id];
  }
  const store = {};
  Object.keys(seed || {}).forEach((k) => { store['gov3_' + k] = JSON.stringify(seed[k]); });
  const ctx = {
    console, setTimeout, clearTimeout, Math, JSON, Date, String, Number, Object, Array, RegExp,
    localStorage: { getItem: (k) => (k in store ? store[k] : null),
                    setItem: (k, v) => { store[k] = v; } },
    document: { getElementById: el, createElement: () => ({ click(){}, style:{} }) },
    location: { protocol: 'https:' },
    GovG2b: require('../js/gov-g2b.js'),
    GovAlio: require('../js/gov-alio.js'),
    GovBizinfo: require('../js/gov-bizinfo.js'),
    firebase: undefined, fetch: () => Promise.reject(new Error('no net')),
    AbortController: function(){ this.abort=()=>{}; this.signal=null; },
    URL: { createObjectURL: () => 'blob:x' }, Blob: function(){}
  };
  ctx.window = ctx;
  const code = [...src.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)]
    .map((m) => m[1]).join('\n').replace(/\bboot\(\);\s*$/, '');   // 부팅은 빼고 함수만 싣는다
  vm.runInNewContext(code + '\n;globalThis.__api={draw,drawKw,dchip,star,find,readyNote,ageOut};', ctx);
  return { api: ctx.__api, el, store };
}

test('★ 공고 줄이 실제로 그려진다', () => {
  const r = runApp({ feed: [
    { id: 'G0001', src: '나라장터', type: '새 공고', no: '2026-1', nm: '노무자문 용역',
      org: '충청남도경제진흥원', closeDt: '2026-12-31', prc: 36000000, kw: '노무' }
  ] });
  r.api.draw();
  const html = r.el('tb').innerHTML;
  assert.match(html, /노무자문 용역/);
  assert.match(html, /충청남도경제진흥원/);
  assert.match(html, /나라장터/);
  assert.match(html, /3,600만원/, '금액이 만원 단위로 반올림돼야 합니다');
  assert.match(r.el('cnt').textContent, /전체 1건/);
});

test('★ 공고가 없으면 «없다»고 말한다 — 빈 표로 두지 않는다', () => {
  const r = runApp({ feed: [] });
  r.api.draw();
  assert.match(r.el('tb').innerHTML, /아직 받은 공고가 없습니다/);
});

test('★ 숨긴 것은 목록에 안 나온다', () => {
  const r = runApp({ feed: [{ id: 'G1', src: '알리오', nm: '가', hidden: true }] });
  r.api.draw();
  assert.match(r.el('tb').innerHTML, /아직 받은 공고가 없습니다/);
});

test('★ 마감일을 모르면 «-» 로 둔다 — D-0 으로 속이지 않는다', () => {
  const r = runApp({ feed: [] });
  assert.match(r.api.dchip({ closeDt: '' }), /-/);
  assert.ok(r.api.dchip({ closeDt: '' }).indexOf('D-') < 0);
});

test('★ 찾는 말 칩이 그려지고 「교육」은 없다', () => {
  const r = runApp({ feed: [] });
  r.api.drawKw();
  const html = r.el('kwBox').innerHTML;
  assert.match(html, /노무/);
  assert.match(html, /일터혁신/);
  assert.ok(html.indexOf('교육') < 0, '「교육」이 되살아나면 안 됩니다');
});

test('★ 인증키가 없으면 받는 방법을 화면에 적는다', () => {
  const r = runApp({ feed: [] });
  r.api.readyNote();
  assert.match(r.el('note').innerHTML, /인증키가 아직 없습니다/);
  assert.match(r.el('note').innerHTML, /Decoding/);
});
