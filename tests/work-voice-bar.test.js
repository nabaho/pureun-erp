/* 「말로 기록」 2단 — 한 번 녹음해 여러 건으로 가르기 (2026-09-02)
 *
 * 글자만 보지 않는다. 화면 파일에서 함수를 떼어 **실제로 돌려** 본다 —
 * 갈라 담기·손으로 고친 값 지키기·건너뛰기가 규칙대로 되는지.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'work.html'), 'utf8').replace(/\r\n/g, '\n');

function noComments(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}
function body(name) {
  const i = SRC.indexOf('function ' + name + '(');
  assert.ok(i >= 0, name + ' 이 없다');
  let d = 0, j = i;
  for (; ; j++) {
    if (SRC[j] === '{') d++;
    else if (SRC[j] === '}') { d--; if (!d) { j++; break; } }
  }
  return SRC.slice(i, j);
}

/* 화면 파일의 함수를 떼어 돌릴 수 있게 «주변»만 흉내낸다 */
function stage() {
  const ITEMS = {
    A: { company: '가나다산업', title: '취업규칙 개정', status: '진행중' },
    B: { company: '천성가축약품', title: '부당해고 구제신청', status: '진행중' },
    C: { company: '나래테크', title: '임금체불 진정', status: '대기응답' },
  };
  const pre = `
    var VO={id:'',rec:null,chunks:[],sec:0,tick:null,blob:null,url:'',res:null,list:null,busy:false,err:''};
    var VO_BAR='*bar', VO_MAX_SEC=45*60;
    var STATUSES=[['진행중'],['대기응답'],['검토'],['대기'],['보류']];
    var items=${JSON.stringify(ITEMS)};
    var _DOM={}, SAVED=[], PATCHED=[], TOASTS=[], PAINTS=0;
    function $(id){ return _DOM[id]||null; }
    function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}
    function todayStr(){ return '2026-09-02'; }
    function itemName(it){ return String((it&&it.title)||''); }
    function myOpen(){ return Object.keys(items).map(function(k){
      var o=Object.assign({},items[k]); o._id=k; return o; }); }
    function voFmt(n){ n=Math.max(0,Math.round(n)); return Math.floor(n/60)+':'+('0'+(n%60)).slice(-2); }
    function voMB(b){ return (b/1048576).toFixed(1)+'MB'; }
    function toast(m,k){ TOASTS.push({m:m,k:k||'ok'}); }
    function addLog(id,t,d,k){ SAVED.push({id:id,t:t,d:d,k:k}); return Promise.resolve(true); }
    function patchItem(id,o){ PATCHED.push({id:id,o:o}); return Promise.resolve(true); }
    function route(){}
    function voReset(){ VO={id:'',rec:null,chunks:[],sec:0,tick:null,blob:null,url:'',
      res:null,list:null,busy:false,err:''}; }
    function qvPaint(){ PAINTS++; }
  `;
  const fns = ['qvListHTML', 'qvStGap', 'qvHarvest', 'qvPick', 'qvSave'].map(body).join('\n');
  return new Function(pre + fns + `
    return {get VO(){return VO}, set VO(v){VO=v}, DOM:_DOM,
      qvListHTML:qvListHTML, qvStGap:qvStGap, qvHarvest:qvHarvest, qvPick:qvPick, qvSave:qvSave,
      get SAVED(){return SAVED}, get PATCHED(){return PATCHED}, get TOASTS(){return TOASTS}};
  `)();
}
/* 세 곳을 말했고 그중 하나는 내 업무 목록에 없다 */
function threeRows() {
  return [
    { _id: 'A', who: '가나다', done: '개정안 검토', next: { text: '공고문 발송', date: '2026-09-09' }, status: '', stOn: false },
    { _id: 'B', who: '천성', done: '이유서 제출', next: { text: '', date: '' }, status: '검토', stOn: true },
    { _id: '', who: '동원산업', done: '전화 상담', next: { text: '', date: '' }, status: '', stOn: false },
  ];
}

test('바에서 말로 기록을 열 수 있다 — 손잡이가 달려 있다', () => {
  const src = noComments(SRC);
  assert.match(src, /id="qvpop"/, '판 자리가 없다');
  /* ⚠ 그냥 qvStart 를 찾으면 판 «안»의 [다시 녹음] 이 걸려서 통과한다 —
     바에 달린 그 손잡이를 봐야 한다. */
  assert.match(src, /class="k mic"\s+onclick="qvStart\(\)"/,
    '빠른 기록 바에 여는 손잡이가 없다 — 판을 만들어 놓고 들어갈 문이 없는 셈이다');
});

test('업무를 이름이 아니라 «목록 번호»로 맞춘다', () => {
  const t = noComments(body('qvTidy'));
  /* 이름을 글자로 맞추면 「가나다」와 「가나다산업」이 갈라지고,
     줄임말이 섞이면 조용히 엉뚱한 업무에 기록이 붙는다. */
  assert.match(t, /\bpool\[\s*k\s*-\s*1\s*\]|\bpool\[[^\]]*-\s*1\s*\]/,
    '번호로 목록을 짚는 곳이 없다 — 이름으로 맞추고 있다');
  assert.match(t, /var\s+pool\s*=\s*myOpen\(\)/,
    '물어보는 그 순간의 목록을 붙들지 않는다 — 목록이 바뀌면 번호가 어긋난다');
});

test('업무를 못 찾은 줄은 저장하지 않고, 몇 건인지 알린다', () => {
  const M = stage();
  M.VO.id = '*bar'; M.VO.list = threeRows();
  const h = M.qvListHTML();
  assert.match(h, /1건은 업무를 못 찾았습니다/, '못 찾은 건수를 안 알린다 — 조용히 빠지면 안 된다');
  assert.strictEqual((h.match(/class="qvr none"/g) || []).length, 1, '못 찾은 줄이 눈에 안 띈다');
  assert.match(h, /💾 2건 저장/, '저장 단추가 «이어진 건수»를 세지 않는다');
});

test('줄마다 업무를 바꿀 수 있다 — AI 가 맞춘 줄도 마찬가지', () => {
  const M = stage();
  M.VO.id = '*bar'; M.VO.list = threeRows();
  const h = M.qvListHTML();
  /* ⚠ <select 를 세면 «감춰 둔» 칸도 걸려서 통과한다 —
     손댈 수 있는 칸인지(qvPick 이 걸린 칸인지)를 센다. */
  assert.strictEqual((h.match(/onchange="qvPick\(/g) || []).length, 3,
    '줄마다 «손댈 수 있는» 업무 칸이 있어야 한다 — AI 가 맞춘 줄도 바꿀 수 있어야 한다');
});

test('업무를 골라 주면 옆 줄에 손으로 쳐 둔 글이 살아남는다', () => {
  const M = stage();
  M.VO.id = '*bar'; M.VO.list = threeRows();
  M.DOM['qv-done-0'] = { value: '  사람이 고친 글  ' };
  M.DOM['qv-next-0'] = { value: '공고문 보내기' };
  M.DOM['qv-date-0'] = { value: '2026-09-11' };
  M.qvPick(2, 'C');
  assert.strictEqual(M.VO.list[2]._id, 'C', '고른 업무가 안 들어갔다');
  assert.strictEqual(M.VO.list[0].done, '사람이 고친 글',
    '다시 그리기 전에 값을 안 걷었다 — 고른 순간 옆 칸의 글이 사라진다');
  assert.strictEqual(M.VO.list[0].next.date, '2026-09-11', '고친 날짜가 사라졌다');
});

test('상태는 체크를 켠 줄만 바뀐다 — AI 혼자 못 바꾼다', async () => {
  const M = stage();
  M.VO.id = '*bar';
  const rows = threeRows();
  rows[2]._id = 'C';                       // 사람이 골라 줬다
  M.VO.list = rows;
  M.DOM['qv-done-2'] = { value: '상담 정리' };
  M.DOM['qv-st-1'] = { checked: false };   // 사람이 체크를 껐다
  M.qvSave();
  await new Promise(r => setTimeout(r, 20));
  const withStatus = M.PATCHED.filter(p => p.o.status);
  assert.strictEqual(withStatus.length, 0,
    '체크를 껐는데 상태가 바뀌었다 — 말 한마디로 업무 상태가 넘어간다');
});

test('저장은 고른 줄만 하고, 건너뛴 건수를 알려 준다', async () => {
  const M = stage();
  M.VO.id = '*bar'; M.VO.list = threeRows();   // 셋 중 하나는 업무가 없다
  M.qvSave();
  await new Promise(r => setTimeout(r, 20));
  assert.deepStrictEqual(M.SAVED.map(x => x.id), ['A', 'B'], '못 고른 줄까지 저장했다');
  assert.ok(M.SAVED.every(x => x.k === 'vo'), '기록에 말로 기록 표시가 안 붙는다');
  const msg = M.TOASTS.map(t => t.m).join(' ');
  assert.match(msg, /2건 저장됨/, '몇 건 저장됐는지 안 알린다');
  assert.match(msg, /1건은 건너뜀/,
    '건너뛴 것을 안 알린다 — 「말했는데 안 들어갔다」가 된다');
});

test('판을 보이게 할 때 «빈값»을 주지 않는다 — CSS 의 none 이 이긴다', () => {
  /* 이 한 글자 때문에 빠른 기록 바의 추천 목록이 여태 한 번도 뜨지 않았다.
     CSS 에 display:none 이 박힌 자리는 인라인을 «지우는» 것으로 안 보인다. */
  const css = [...SRC.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m => m[1]).join('\n');
  /* 두 판 모두 CSS 가 감추고 있다 — 그러면 «보이게 하는 함수»에 빈값이 있으면 안 된다.
     ⚠ 거리로 찾으면 못 잡는다(함수가 400자를 넘는다). 함수 몸통 안을 본다. */
  for (const [id, fn] of [['qsug', 'qbSug'], ['qvpop', 'qvPaint']]) {
    if (!new RegExp('#' + id + '\\s*\\{[^}]*display\\s*:\\s*none').test(css)) continue;
    const b = noComments(body(fn));
    assert.doesNotMatch(b, /style\.display\s*=\s*''/,
      fn + ' 이 #' + id + ' 을 빈값으로 보이려 한다 — CSS 의 display:none 이 이겨서 안 보인다'
      + ' (이 한 글자 때문에 추천 목록이 여태 안 떴다)');
    assert.match(b, /style\.display\s*=\s*'(block|flex)'/,
      fn + ' 이 #' + id + ' 을 실제 값으로 보이지 않는다');
  }
});

test('서랍과 바가 동시에 녹음하지 않는다', () => {
  const g = noComments(body('voBusyElsewhere'));
  assert.match(g, /VO\.rec/, '이미 녹음 중인지 안 본다');
  assert.match(g, /VO\.res|VO\.list/, '정리해 둔 초안이 있는지 안 본다');
  const st = noComments(body('voStart'));
  assert.match(st, /voBusyElsewhere/,
    '녹음을 시작할 때 막이를 안 지난다 — 열려 있던 초안이 조용히 사라진다');
});

test('바에서 닫으면 판이 아주 사라진다 — 빈 판이 바를 가리지 않는다', () => {
  const d = noComments(body('voDiscard'));
  assert.match(d, /VO_BAR/, '바와 서랍을 가리지 않는다');
  assert.match(d, /qvPaint\(\)/, '바 쪽을 다시 그리지 않는다');
});
