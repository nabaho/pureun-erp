/* pu-form-auto.js — 서식을 «준비 없이» 채운다.
   ------------------------------------------------------------------
   대표 지시 2026-08-30: 「이렇게 만드는것 너무 불편하다 아주 쉽게 방법을
   찾을것 아니면 의미가 없다」.

   맞는 말이다. 앞서 만든 방식은 서식마다 사람이 {{토큰}}을 심어야 했다 —
   서식이 수천 종인데 그 준비를 누가 하나. 그러면 결국 안 쓰인다.

   그런데 정부·공단 서식은 «칸 이름이 표준»이다.
   「업체명」 「사업자등록번호」 「소재지」 「전화번호」 — 서식이 달라도 같은 말을 쓴다.
   그래서 준비를 없앤다: 앱이 이름표를 읽고 스스로 값을 넣는다.

   ⚠ 헷갈리는 자리는 «비워 두고 말한다». 「성명」 하나만 있는 칸은 사용자인지
     근로자인지 알 수 없다 — 지어 넣으면 잘못된 서류가 접수처로 간다.
   ------------------------------------------------------------------ */
(function (global) {
  'use strict';

  var Fill = (typeof require === 'function' && typeof module !== 'undefined')
    ? require('./pu-form-fill.js') : global.PuFormFill;

  /* 이름표 사전 — 왼쪽이 서식에 적힌 말, 오른쪽이 푸른 토큰 이름.
     ⚠ 새 서식에서 못 알아본 이름표가 나오면 여기에 «한 줄만» 더하면 된다.
       그 한 줄이 그때부터 모든 서식에 듣는다. */
  var 사전 = [
    { 토큰: '{{회사명}}',     말: ['업체명', '사업장명', '사업체명', '회사명', '상호', '사업장명칭', '기관명', '사업장의명칭'] },
    { 토큰: '{{사업자번호}}', 말: ['사업자등록번호', '사업자번호', '사업자등록증번호'] },
    { 토큰: '{{대표자}}',     말: ['대표자', '대표자명', '대표이사', '사용자성명', '사업주성명', '대표자성명'],
      곁말: ['성명'], 곁조건: ['사용자', '사업주', '대표', 'employer'] },
    { 토큰: '{{주소}}',       말: ['소재지', '사업장소재지', '사업장주소', '주소'] },
    { 토큰: '{{대표전화}}',   말: ['전화번호', '대표전화', '연락처', '전화'] },
    { 토큰: '{{업태}}',       말: ['업태'] },
    { 토큰: '{{종목}}',       말: ['종목'] },
    { 토큰: '{{국민연금관리번호}}', 말: ['국민연금관리번호', '연금관리번호'] },
    { 토큰: '{{건강보험번호}}',     말: ['건강보험관리번호', '건강보험번호'] },
    { 토큰: '{{고용보험번호}}',     말: ['고용보험관리번호', '고용보험번호'] }
  ];

  /* ⚠ 이 말이 함께 있으면 «사용자 쪽이 아니다» — 근로자·본국·피보험자 칸이다.
     여기서 잘못 넣으면 근로자 자리에 회사 정보가 찍힌다. */
  var 남의칸 = ['근로자', '피보험자', '본국', '신청인', '수급자', '가입자', 'employee', '외국인'];

  /* 영문·기호·공백을 털어 «말만» 남긴다 */
  function 다듬기(s) {
    return String(s || '').replace(/[A-Za-z0-9()（）[\]{}<>./,:;·\-\s ]/g, '');
  }
  function 소문자(s) { return String(s || '').toLowerCase(); }

  /* 이 칸이 무슨 자리인가 — 모르면 null (지어내지 않는다) */
  function 무슨자리(text) {
    var 말 = 다듬기(text);
    if (!말 || 말.length > 30) return null;
    var 원문 = 소문자(text);
    for (var i = 0; i < 남의칸.length; i++) {
      if (말.indexOf(남의칸[i]) >= 0 || 원문.indexOf(남의칸[i]) >= 0) return null;
    }
    for (var j = 0; j < 사전.length; j++) {
      var 항 = 사전[j];
      for (var k = 0; k < 항.말.length; k++) {
        if (말.indexOf(항.말[k]) >= 0) return 항.토큰;
      }
      /* 「성명」처럼 혼자서는 애매한 말 — 곁에 사용자·employer 가 있을 때만 받는다 */
      if (항.곁말) {
        for (var m = 0; m < 항.곁말.length; m++) {
          if (말.indexOf(항.곁말[m]) < 0) continue;
          for (var n = 0; n < 항.곁조건.length; n++) {
            if (말.indexOf(항.곁조건[n]) >= 0 || 원문.indexOf(항.곁조건[n]) >= 0) return 항.토큰;
          }
        }
      }
    }
    return null;
  }

  var TC_RE = /<hp:tc\b[^>]*>[\s\S]*?<\/hp:tc>/g;
  var P_ONE = /<hp:p\b[\s\S]*?<\/hp:p>/;

  function 칸글자(tc) {
    var out = '';
    tc.replace(/<hp:t(?:\s[^>]*)?>([\s\S]*?)<\/hp:t>/g, function (all, inner) { out += inner; return all; });
    return out.replace(/<[^>]+>/g, '')
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  }
  function 칸자리(tc) {
    var m = /<hp:cellAddr colAddr="(\d+)" rowAddr="(\d+)"/.exec(tc);
    return m ? { col: +m[1], row: +m[2] } : null;
  }

  /* 서식을 훑어 «어디에 무엇을 넣을지» 를 정한다 (값은 아직 안 넣는다) */
  function 자리찾기(xml) {
    var 칸들 = [];
    var m;
    TC_RE.lastIndex = 0;
    while ((m = TC_RE.exec(xml))) {
      var at = 칸자리(m[0]);
      if (at) 칸들.push({ at: m.index, all: m[0], row: at.row, col: at.col, text: 칸글자(m[0]) });
    }
    var 계획 = [];
    칸들.forEach(function (c, i) {
      var 토큰 = 무슨자리(c.text);
      if (!토큰) return;
      /* 같은 줄 «바로 오른쪽» 칸이 비어 있으면 거기에 넣는다(이름표와 값이 갈린 서식) */
      var 오른쪽 = null;
      if (칸들[i + 1] && 칸들[i + 1].row === c.row) 오른쪽 = 칸들[i + 1];
      if (오른쪽 && !다듬기(오른쪽.text) && !String(오른쪽.text).trim()) {
        계획.push({ 토큰: 토큰, 칸: 오른쪽, 이름표: c.text.trim(), 방식: '옆칸' });
      } else {
        계획.push({ 토큰: 토큰, 칸: c, 이름표: c.text.trim(), 방식: '이어쓰기' });
      }
    });
    /* 같은 칸에 두 번 쓰지 않는다 — 먼저 잡은 것이 이긴다 */
    var 본것 = {}, 걸러낸 = [];
    계획.forEach(function (p) {
      if (본것[p.칸.at]) return;
      본것[p.칸.at] = 1;
      걸러낸.push(p);
    });
    return 걸러낸;
  }

  /* 실제로 값을 넣는다. values 는 {'{{회사명}}':'…'} 꼴. */
  function 채우기(xml, values) {
    var 계획 = 자리찾기(xml);
    var 채운것 = [], 빈것 = [];
    /* 뒤에서부터 넣어야 앞 칸의 위치(at)가 안 밀린다 */
    var 정렬 = 계획.slice().sort(function (a, b) { return b.칸.at - a.칸.at; });
    var out = xml;
    정렬.forEach(function (p) {
      var 값 = values ? values[p.토큰] : null;
      if (값 == null || 값 === '') { 빈것.push({ 이름표: p.이름표, 토큰: p.토큰 }); return; }
      var 칸 = p.칸.all;
      var 문단 = P_ONE.exec(칸);
      if (!문단) { 빈것.push({ 이름표: p.이름표, 토큰: p.토큰 }); return; }
      var 새문단 = Fill.fillParagraph(문단[0], function (t) {
        return p.방식 === '옆칸' ? String(값) : (t + '   ' + 값);
      });
      if (새문단 === 문단[0]) { 빈것.push({ 이름표: p.이름표, 토큰: p.토큰 }); return; }
      var 새칸 = 칸.slice(0, 문단.index) + 새문단 + 칸.slice(문단.index + 문단[0].length);
      out = out.slice(0, p.칸.at) + 새칸 + out.slice(p.칸.at + 칸.length);
      채운것.push({ 이름표: p.이름표, 토큰: p.토큰, 방식: p.방식 });
    });
    return { xml: out, 채운것: 채운것.reverse(), 빈것: 빈것.reverse() };
  }

  /* 서식을 열어 «무엇을 알아봤는지» 미리 보여 준다 */
  function 미리보기(xml) {
    return 자리찾기(xml).map(function (p) {
      return { 이름표: p.이름표, 토큰: p.토큰, 방식: p.방식 };
    });
  }

  var api = { 채우기: 채우기, 미리보기: 미리보기, 자리찾기: 자리찾기, 무슨자리: 무슨자리, 사전: 사전 };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.PuFormAuto = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
