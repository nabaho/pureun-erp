/* 이관·복귀 표시가 자리를 덜 차지한다 (대표 지시 2026-08-23)
   「이관되었을 경우 알림은 좋은데 너무 많이 공간을 차지한다.」

   전에는 「🆕 계약관리에서 이관 · 계약-2026-114 ×」 처럼 스무 자 남짓을 관리번호 칸에
   그려 넣어 업체명·사업자번호를 오른쪽으로 밀어냈다.

   ★ 지키려는 것 셋
     ① 짧게 적는다 — 「어디서 왔는지」를 칸에 늘어놓지 않는다
     ② 줄인 글자를 «되찾을 길»이 있다 — 말풍선에 어디서·번호가 다 있어야 한다
     ③ 지우는 길(✕)이 사라지지 않는다 — 폰에서도 닿아야 한다
   모양(색·굵기·글자 크기)은 못 박지 않는다. 언제든 바뀔 수 있다. */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const HTML = path.join(__dirname, '..', 'pu-erp.html');
const src = fs.readFileSync(HTML, 'utf8').replace(/\r\n/g, '\n');

// 최상위 function 하나를 통째로 꺼낸다 (중괄호를 세어 끝을 찾는다)
function fn(name){
  const marker = 'function ' + name + '(';
  const start = src.indexOf(marker);
  if(start < 0) throw new Error('함수 못찾음: ' + name);
  let pd = 0, pe = -1;
  for(let i = start + marker.length - 1; i < src.length; i++){
    if(src[i] === '(') pd++;
    else if(src[i] === ')'){ pd--; if(pd === 0){ pe = i; break; } }
  }
  const bs = src.indexOf('{', pe + 1);
  let d = 0;
  for(let i = bs; i < src.length; i++){
    if(src[i] === '{') d++;
    else if(src[i] === '}'){ d--; if(d === 0){
      const out = src.slice(start, i + 1);
      try { new vm.Script(out); } catch(e){ throw new Error('추출이 잘렸을 수 있음: ' + name + ' (' + e.message + ')'); }
      return out;
    } }
  }
  throw new Error('함수 끝을 못찾음: ' + name);
}

let pass = 0, fail = 0;
const t = (name, got, want) => {
  const G = JSON.stringify(got), W = JSON.stringify(want);
  if(G === W) pass++;
  else { fail++; console.log('FAIL ' + name + '\n  got  = ' + G + '\n  want = ' + W); }
};

/* ── 실제 함수를 꺼내 돌린다. h() 를 가짜로 받아 «무엇을 그렸는지» 를 본다 ── */
function render(x, opts){
  opts = opts || {};
  const ctx = {
    console, Date, String, Number, Object, Array, parseInt, RegExp,
    window: { IS_MOBILE: !!opts.mobile },
    arvIsNew: function(){ return true; },          // 시간 판정은 여기서 볼 것이 아니다
    arvClear: function(){ ctx.__cleared = true; },
    h: function(tag, props){
      const kids = Array.prototype.slice.call(arguments, 2);
      return { tag, props: props || {}, kids: kids.filter(function(k){ return k !== null && k !== undefined; }) };
    }
  };
  vm.createContext(ctx);
  vm.runInContext(fn('arvBadge'), ctx);
  return { node: ctx.arvBadge(x, 'consultings', function(){}), ctx };
}
// 그려진 나무에서 글자만 훑어 모은다
function textOf(node){
  if(node === null || node === undefined || typeof node === 'boolean') return '';
  if(typeof node !== 'object') return String(node);
  return (node.kids || []).map(textOf).join('');
}
function findX(node){
  if(!node || typeof node !== 'object') return null;
  if(node.props && node.props['data-arvx']) return node;
  for(const k of (node.kids || [])){ const hit = findX(k); if(hit) return hit; }
  return null;
}

/* ⚠ 복귀 판정은 arrivedFrom 이 「…관리」·「…사업」 으로 끝나는지로 가른다.
   계약에서 «나갈» 때는 arvStamp('계약', …) 이고(그래서 이관),
   계약으로 «돌아올» 때는 arvStamp('컨설팅관리', …) 처럼 화면 이름이 온다(그래서 복귀). */
const 이관 = { id:'c1', arrivedAt:new Date().toISOString(), arrivedFrom:'계약', arrivedNo:'계약-2026-114' };
const 복귀 = { id:'c2', arrivedAt:new Date().toISOString(), arrivedFrom:'컨설팅관리', arrivedNo:'현클-2026-018' };

/* ═══ ① 짧게 적는다 ═══ */
{
  const { node } = render(이관);
  const txt = textOf(node);
  t('★ 칸에 적는 글자는 「🆕 이관」 뿐이다', txt.replace('×', '').trim(), '🆕 이관');
  t('★ 어디서 왔는지를 칸에 늘어놓지 않는다', /계약$|계약에서/.test(txt), false);
  t('★ 번호도 칸에 늘어놓지 않는다', txt.indexOf('계약-2026-114') >= 0, false);
  // 스무 자짜리가 다시 기어들어오지 않게 길이로도 못 박는다(✕ 제외)
  t('★ 칸의 글자는 여덟 자를 넘지 않는다', txt.replace('×', '').trim().length <= 8, true);
}

/* ═══ ② 줄인 글자를 되찾을 길 — 말풍선 ═══ */
{
  const { node } = render(이관);
  const tip = String((node.props || {}).title || '');
  t('★ 말풍선에 어디서 왔는지가 있다', tip.indexOf('계약에서 이관') >= 0, true);
  t('★ 말풍선에 번호가 있다', tip.indexOf('계약-2026-114') >= 0, true);
  t('말풍선에 ✕ 가 무엇인지도 적는다', /✕/.test(tip), true);
}

/* ═══ ③ 지우는 길이 사라지지 않는다 ═══ */
{
  const pc = render(이관), ph = render(이관, { mobile: true });
  const xPc = findX(pc.node), xPh = findX(ph.node);
  t('★ ✕ 단추는 PC·폰 어디서나 «있다»', !!xPc && !!xPh, true);
  t('★ PC 에서는 평소 감춰 둔다 (자리를 안 쓴다)', xPc.props.style.width, '0px');
  t('★ 가리키면 펴는 손잡이가 달려 있다',
    typeof pc.node.props.onMouseEnter === 'function' && typeof pc.node.props.onMouseLeave === 'function', true);
  t('★ 폰에서는 처음부터 보인다 (마우스가 없어 가리킬 수가 없다)', xPh.props.style.width, '10px');
  t('★ 폰에서는 가리키기 손잡이를 안 단다', ph.node.props.onMouseEnter, null);
  // 누르면 실제로 지워야 한다 — 모양만 있고 안 지우면 표시가 영영 남는다
  xPc.props.onClick({ stopPropagation: function(){} });
  t('★ ✕ 를 누르면 표시를 지운다', pc.ctx.__cleared, true);
}

/* ═══ 복귀도 같은 규칙 ═══ */
{
  const { node } = render(복귀);
  const txt = textOf(node).replace('×', '').trim();
  t('복귀도 짧게 적는다', txt, '↩ 복귀');
  t('복귀 말풍선에도 어디서·번호가 있다',
    /컨설팅관리/.test(node.props.title) && /현클-2026-018/.test(node.props.title), true);
}

/* ═══ 안 바뀐 것 ═══ */
{
  t('세 화면이 같은 함수를 쓴다 (한 곳만 고치면 다 바뀐다)',
    (src.match(/arvBadge\(/g) || []).length >= 4, true);   // 선언 1 + 호출 3
  t('이틀 뒤 저절로 사라지는 것은 그대로', /var ARV_HOURS = 48;/.test(src), true);
  t('새로 온 줄이 맨 위로 오는 것도 그대로', /function arvSort\(a, b, base\)\{/.test(src), true);
}

console.log('\n  === ' + pass + ' 통과 / ' + fail + ' 실패 ===');
process.exit(fail ? 1 : 0);
