/* 한글 자료 글 고치기 (js/pu-hwp-edit.js)
   엔진은 7MB WASM 이라 검사에서 못 띄운다. 대신 **겉모습만 같은 가짜 문서**를
   만들어 넣는다 — 우리 코드가 엔진을 어떻게 부르는지가 검사할 것이다. */
const test = require('node:test');
const assert = require('node:assert');
const E = require('../js/pu-hwp-edit.js');

/* 가짜 한글 문서.
   body: 구역마다 본문 줄 글자들. tables: {'구역-줄': {rowCount,colCount,cells:[[줄,...]]}} */
function fakeDoc(spec) {
  const body = spec.body || [[]];
  const tables = spec.tables || {};
  const calls = [];
  const key = (s, p) => s + '-' + p;
  return {
    calls: calls,
    getSectionCount: () => body.length,
    getParagraphCount: (s) => body[s].length,
    getParagraphLength: (s, p) => body[s][p].length,
    getTextRange: (s, p, off, n) => body[s][p].substr(off, n),
    replaceText: (s, p, off, len, txt) => {
      calls.push(['replaceText', s, p, off, len, txt]);
      body[s][p] = body[s][p].slice(0, off) + txt + body[s][p].slice(off + len);
    },
    getTableDimensions: (s, p, ctrl) => {
      const t = tables[key(s, p)];
      if (!t || t.ctrl !== ctrl) throw new Error('표가 아닙니다');
      return JSON.stringify({ rowCount: t.rowCount, colCount: t.colCount, cellCount: t.cells.length });
    },
    getCellParagraphCount: (s, p, ctrl, c) => tables[key(s, p)].cells[c].length,
    getCellParagraphLength: (s, p, ctrl, c, cp) => tables[key(s, p)].cells[c][cp].length,
    getTextInCell: (s, p, ctrl, c, cp, off, n) => tables[key(s, p)].cells[c][cp].substr(off, n),
    deleteTextInCell: (s, p, ctrl, c, cp, off, n) => {
      calls.push(['deleteTextInCell', c, cp, off, n]);
      const arr = tables[key(s, p)].cells[c];
      arr[cp] = arr[cp].slice(0, off) + arr[cp].slice(off + n);
    },
    insertTextInCell: (s, p, ctrl, c, cp, off, txt) => {
      calls.push(['insertTextInCell', c, cp, off, txt]);
      const arr = tables[key(s, p)].cells[c];
      arr[cp] = arr[cp].slice(0, off) + txt + arr[cp].slice(off);
    },
    exportHwp: () => new Uint8Array([1, 2, 3]),
    exportHwpx: () => new Uint8Array([9, 9])
  };
}

test('본문 줄에 1 부터 번호가 붙는다', () => {
  const doc = fakeDoc({ body: [['제 안 서', '1. 목적', '2. 기간']] });
  const rows = E.readRows(doc);
  assert.deepEqual(rows.map(r => [r.no, r.text]),
    [[1, '제 안 서'], [2, '1. 목적'], [3, '2. 기간']]);
});

test('빈 본문 줄은 번호를 차지하지 않는다', () => {
  /* 문서에는 줄 간격용 빈 줄이 많다. 번호만 늘어나면 찾기가 어려워진다. */
  const doc = fakeDoc({ body: [['머리말', '', '   ', '본문']] });
  assert.deepEqual(E.readRows(doc).map(r => r.text), ['머리말', '본문']);
});

test('여러 구역을 순서대로 잇는다', () => {
  const doc = fakeDoc({ body: [['앞구역'], ['뒷구역']] });
  const rows = E.readRows(doc);
  assert.deepEqual(rows.map(r => [r.sec, r.text]), [[0, '앞구역'], [1, '뒷구역']]);
});

test('표 칸의 글도 번호에 들어가고, 그 줄 바로 뒤에 온다', () => {
  const doc = fakeDoc({
    body: [['계약서', '', '아래와 같이']],
    tables: { '0-1': { ctrl: 0, rowCount: 2, colCount: 2, cells: [['구분'], ['내용'], ['보수'], ['월 50만원']] } }
  });
  const rows = E.readRows(doc);
  assert.deepEqual(rows.map(r => r.text),
    ['계약서', '구분', '내용', '보수', '월 50만원', '아래와 같이']);
  assert.equal(rows[1].kind, 'cell');
  assert.deepEqual(rows[4].rc, { row: 2, col: 2 }, '2행 2열이라고 알려 준다');
});

test('표의 빈 칸은 남긴다 — 채워 넣을 자리다', () => {
  /* 계약서의 「갑」 자리처럼 비워 둔 칸이 목록에 없으면 채워 넣을 길이 없다. */
  const doc = fakeDoc({
    body: [['']],
    tables: { '0-0': { ctrl: 0, rowCount: 1, colCount: 2, cells: [['갑'], ['']] } }
  });
  const rows = E.readRows(doc);
  assert.equal(rows.length, 2);
  assert.equal(rows[1].text, '');
});

test('표가 첫 번째가 아니어도 찾는다 (그림이 앞에 끼어도)', () => {
  const doc = fakeDoc({
    body: [['그림 있는 줄']],
    tables: { '0-0': { ctrl: 2, rowCount: 1, colCount: 1, cells: [['표 안'] ] } }
  });
  assert.deepEqual(E.readRows(doc).map(r => r.text), ['그림 있는 줄', '표 안']);
});

test('안 고친 줄은 건드리지 않는다', () => {
  const doc = fakeDoc({ body: [['첫 줄', '둘째 줄']] });
  const rows = E.readRows(doc);
  const ch = E.changedRows(rows, ['첫 줄', '둘째 줄']);
  assert.equal(ch.length, 0);
  E.applyRows(doc, ch);
  assert.equal(doc.calls.length, 0, '엔진을 아예 부르지 않는다');
});

test('고친 줄만 문서에 들어간다', () => {
  const doc = fakeDoc({ body: [['제 안 서', '1. 목적: 임금', '2. 기간']] });
  const rows = E.readRows(doc);
  const ch = E.changedRows(rows, ['제 안 서', '1. 목적: 임금체계 개편', '2. 기간']);
  assert.equal(ch.length, 1);
  const res = E.applyRows(doc, ch);
  assert.deepEqual(res, { ok: 1, failed: [] });
  assert.deepEqual(doc.calls, [['replaceText', 0, 1, 0, '1. 목적: 임금'.length, '1. 목적: 임금체계 개편']]);
});

test('표 칸은 지우고 넣는다 — 바꾸기가 따로 없다', () => {
  const doc = fakeDoc({
    body: [['']],
    tables: { '0-0': { ctrl: 0, rowCount: 1, colCount: 2, cells: [['보수'], ['월 50만원']] } }
  });
  const rows = E.readRows(doc);
  const ch = E.changedRows(rows, ['보수', '월 70만원']);
  E.applyRows(doc, ch);
  assert.deepEqual(doc.calls, [
    ['deleteTextInCell', 1, 0, 0, '월 50만원'.length],
    ['insertTextInCell', 1, 0, 0, '월 70만원']
  ]);
});

test('빈 칸을 채울 때는 지우기를 건너뛴다', () => {
  const doc = fakeDoc({
    body: [['']],
    tables: { '0-0': { ctrl: 0, rowCount: 1, colCount: 1, cells: [['']] } }
  });
  const ch = E.changedRows(E.readRows(doc), ['푸른노무법인']);
  E.applyRows(doc, ch);
  assert.deepEqual(doc.calls, [['insertTextInCell', 0, 0, 0, '푸른노무법인']]);
});

test('칸을 비우면 지우기만 한다', () => {
  const doc = fakeDoc({ body: [['']], tables: { '0-0': { ctrl: 0, rowCount: 1, colCount: 1, cells: [['지울 글']] } } });
  const ch = E.changedRows(E.readRows(doc), ['']);
  E.applyRows(doc, ch);
  assert.deepEqual(doc.calls, [['deleteTextInCell', 0, 0, 0, '지울 글'.length]]);
});

test('줄바꿈을 치면 칸(공백)으로 바뀐다 — 줄 수가 달라지면 안 된다', () => {
  const doc = fakeDoc({ body: [['한 줄']] });
  const ch = E.changedRows(E.readRows(doc), ['앞\n뒤']);
  assert.equal(ch[0].next, '앞 뒤');
  assert.equal(E.clean('가\r\n나'), '가 나');
});

test('한 줄이 실패해도 나머지는 들어가고, 실패한 번호를 알려 준다', () => {
  /* 조용히 넘기면 「저장했다는데 안 바뀌었다」가 된다. */
  const doc = fakeDoc({ body: [['가', '나']] });
  const real = doc.replaceText;
  doc.replaceText = (s, p, off, len, txt) => { if (p === 0) throw new Error('잠긴 줄'); real(s, p, off, len, txt); };
  const res = E.applyRows(doc, E.changedRows(E.readRows(doc), ['가1', '나1']));
  assert.equal(res.ok, 1);
  assert.deepEqual(res.failed, [{ no: 1, why: '잠긴 줄' }]);
});

test('올라온 형식 그대로 저장한다', () => {
  const doc = fakeDoc({ body: [['가']] });
  assert.equal(E.extOf('제안서.hwpx'), 'hwpx');
  assert.equal(E.extOf('제안서.hwp'), 'hwp');
  assert.equal(E.extOf('제안서.HWPX'), 'hwpx', '대문자도 같다');
  assert.deepEqual(Array.from(E.exportBytes(doc, 'a.hwpx')), [9, 9]);
  assert.deepEqual(Array.from(E.exportBytes(doc, 'a.hwp')), [1, 2, 3]);
});

test('내려받을 이름에 (수정) 을 붙이되 겹쳐 붙이지 않는다', () => {
  assert.equal(E.editedName('자문계약서.hwpx'), '자문계약서(수정).hwpx');
  assert.equal(E.editedName('자문계약서(수정).hwpx'), '자문계약서(수정).hwpx');
  assert.equal(E.editedName('점.있는.이름.hwp'), '점.있는.이름(수정).hwp');
});

test('문서가 비어 있어도 터지지 않는다', () => {
  assert.deepEqual(E.readRows(fakeDoc({ body: [[]] })), []);
  assert.deepEqual(E.changedRows([], []), []);
  assert.deepEqual(E.applyRows(fakeDoc({ body: [[]] }), []), { ok: 0, failed: [] });
});

test('엔진이 글을 못 주는 줄은 건너뛴다', () => {
  /* 그림만 있는 줄에서 getTextRange 가 던지는 일이 있다 — 목록 전체가 멈추면 안 된다. */
  const doc = fakeDoc({ body: [['가', '나']] });
  doc.getTextRange = (s, p) => { if (p === 0) throw new Error('글이 없습니다'); return '나'; };
  assert.deepEqual(E.readRows(doc).map(r => r.text), ['나']);
});
