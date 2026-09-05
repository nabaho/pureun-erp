/* 업체관리 표 열 간격 — 번호와 업체명 사이의 불필요한 빈 폭을 막는다. */
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..');
const erp=fs.readFileSync(path.join(root,'pu-erp.html'),'utf8');

function layout(){
  const from=erp.indexOf('var COMPANY_TABLE_WIDTHS = '),to=erp.indexOf('function CompanyManagement',from);
  const context={};vm.createContext(context);
  new vm.Script(erp.slice(from,to)).runInContext(context);
  return context;
}
function widths(){return layout().COMPANY_TABLE_WIDTHS;}

test('업체관리 두 표는 모든 열의 폭을 자료 의미에 맞춰 지정한다',()=>{
  const w=widths();
  assert.equal(w.suboffice.length,18,'사무대행 표의 열마다 폭이 있어야 한다');
  assert.equal(w.full.length,27,'전체 업체 표의 열마다 폭이 있어야 한다');
  assert.match(erp,/coTableColgroup\(statusTab === 'suboffice' \? 'suboffice' : 'full'\)/);
  assert.match(erp,/width:coTableWidth\(statusTab === 'suboffice' \? 'suboffice' : 'full',coHideIdx\)\+'px'/);
  assert.match(erp,/tableLayout:'fixed'/);
});

test('번호는 글자에 꼭 맞게, 바로 뒤 업체명은 읽을 수 있는 폭으로 둔다',()=>{
  const w=widths();
  [w.suboffice,w.full].forEach((cols)=>{
    assert.equal(cols[2],76,'번호 열은 자문-10193 글자와 좌우 여백에 꼭 맞춘다'); // 검사고정-허용: 사용자 지정 열 폭
    assert.ok(cols[3]>=200,'업체명 열은 한 줄을 읽을 폭을 둔다');
  });
});

test('번호 셀의 최소·최대 폭도 잠가 브라우저가 빈 공간을 다시 만들지 못한다',()=>{
  const css=fs.readFileSync(path.join(root,'css','pu-erp.css'),'utf8');
  assert.equal((erp.match(/className:'co-number-col'/g)||[]).length,4);
  assert.match(css,/th\.co-number-col,[\s\S]*td\.co-number-col[\s\S]*width: 76px !important;[\s\S]*min-width: 76px !important;[\s\S]*max-width: 76px !important;/); // 검사고정-허용: 사용자 지정 열 폭
});

test('나머지 주요 정보 열도 자동 확장하지 않고 용도별 폭을 쓴다',()=>{
  const w=widths().full;
  assert.ok(w[7]<=100,'사업자번호 열이 불필요하게 늘어나지 않는다');
  assert.ok(w[8]<w[9],'종목은 업태보다 조금 넓다');
  assert.ok(w[15]>=180,'주소는 다른 짧은 열보다 넓게 둔다');
  assert.ok(Math.max(...w.slice(4))<=200,'정보 열 하나가 과도한 빈 폭을 차지하지 않는다');
});

test('감춘 열은 colgroup 폭도 함께 감춰 빈 간격을 남기지 않는다',()=>{
  assert.match(erp,/\.co-table col:nth-child\('\+idx\+'\),\.co-table td:nth-child/);
  const c=layout(),all=c.COMPANY_TABLE_WIDTHS.full.reduce((a,b)=>a+b,0);
  assert.equal(c.coTableWidth('full',[]),all);
  assert.equal(c.coTableWidth('full',[3]),all-c.COMPANY_TABLE_WIDTHS.full[2],
    '번호를 감추면 번호 폭도 표 전체 폭에서 빠져야 한다');
});

test('스타일 캐시를 올려 운영 화면에 즉시 반영한다',()=>{
  assert.match(erp,/css\/pu-erp\.css\?v=\d+/);
});

test('고정 업체명의 left 좌표는 실제 앞 세 열의 합계이며 옛 260px 좌표가 없다',()=>{
  const css=fs.readFileSync(path.join(root,'css','pu-erp.css'),'utf8');
  assert.doesNotMatch(css,/\.dt\.co-full th:nth-child\(4\)[^\n]*left:260px/);
  assert.match(css,/\.dt\.co-table th:nth-child\(4\)[^\n]*left:140px/); // 검사고정-허용: 32+32+76 실제 앞열 합계
  assert.match(css,/\.dt\.co-table\.co-no-hidden th:nth-child\(4\)[^\n]*left:64px/); // 검사고정-허용: 번호 숨김 시 32+32
  assert.match(erp,/coHideIdx\.indexOf\(CO_NO_COL_IDX\)>=0 \? ' co-no-hidden'/);
});

test('업체관리 고정 열 규칙이 다른 데이터 표에 잘못 적용되지 않는다',()=>{
  const css=fs.readFileSync(path.join(root,'css','pu-erp.css'),'utf8');
  assert.doesNotMatch(css,/\.dt th:nth-child\([1-4]\), \.dt td:nth-child/);
  assert.match(css,/\.dt\.co-table th:nth-child\(1\), \.dt\.co-table td:nth-child\(1\)/);
});
