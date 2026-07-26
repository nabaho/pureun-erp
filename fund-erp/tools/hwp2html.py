# -*- coding: utf-8 -*-
"""HWP 5.0 → HTML 변환 (문단 + 표 격자 복원)
   레코드 트리: TABLE(77) 아래 LIST_HEADER(72)마다 셀 좌표(col,row,colspan,rowspan),
   그 안의 PARA_TEXT(67)가 셀 내용. 레벨(level)로 표 안/밖을 구분한다."""
import io, sys, os, zlib, struct, json, html
import olefile
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

T_PARA_HEADER = 66
T_PARA_TEXT   = 67
T_CTRL_HEADER = 71
T_LIST_HEADER = 72
T_TABLE       = 77

def records(data):
    i = 0
    while i < len(data) - 3:
        rec = struct.unpack_from('<I', data, i)[0]
        tag = rec & 0x3FF
        level = (rec >> 10) & 0x3FF
        size = (rec >> 20) & 0xFFF
        i += 4
        if size == 0xFFF:
            size = struct.unpack_from('<I', data, i)[0]; i += 4
        yield tag, level, data[i:i+size]
        i += size

def clean_text(payload):
    """PARA_TEXT 디코드 + 인라인 컨트롤 문자 제거"""
    s = payload.decode('utf-16-le', errors='ignore')
    out = []
    skip = 0
    for ch in s:
        if skip: skip -= 1; continue
        c = ord(ch)
        if c in (13, 10): out.append('\n')
        elif c == 9: out.append('\t')
        elif c < 32:
            # 확장 컨트롤(표/그림 등)은 8바이트=4문자 추가 점유
            if c in (1,2,3,11,12,14,15,16,17,18,21,22,23): skip = 7
            continue
        else: out.append(ch)
    return ''.join(out).strip()

def convert(path):
    f = olefile.OleFileIO(path)
    hdr = f.openstream('FileHeader').read()
    comp = bool(hdr[36] & 1)
    secs = sorted([d for d in f.listdir() if d[0] == 'BodyText'], key=lambda x: x[1])
    blocks = []          # 최종 블록 목록: ('p', text) | ('table', grid)
    for s in secs:
        data = f.openstream(s).read()
        if comp:
            try: data = zlib.decompress(data, -15)
            except Exception: continue
        tstack = []      # 열려있는 표 [{'rows','cols','cells':[..],'level':n}]
        cur_cell = None
        for tag, level, pay in records(data):
            # 표 종료: 표보다 얕은 레벨의 레코드가 나오면 닫는다
            # (LIST_HEADER·PARA_HEADER는 표와 같은 레벨이라 '<=' 쓰면 즉시 닫혀버림)
            # 단, 새 TABLE이 같은 레벨로 오면 앞 표를 먼저 닫아야 순서가 뒤집히지 않음
            while tstack:
                top = tstack[-1]['level']
                shut = (level <= top) if tag == T_TABLE else (level < top)
                if not shut: break
                fr = tstack.pop()
                # 중첩 표는 부모 셀 안으로 되돌려 넣는다(형제로 빼면 순서가 뒤집힘)
                if fr.get('pcell') is not None: fr['pcell']['text'].append(('table', fr))
                else: blocks.append(('table', fr))
                cur_cell = fr.get('pcell')
            if tag == T_TABLE and len(pay) >= 8:
                nR, nC = struct.unpack_from('<HH', pay, 4)
                tstack.append({'rows': nR, 'cols': nC, 'cells': [], 'level': level,
                               'pcell': cur_cell})   # 자신을 품은 부모 셀
                cur_cell = None
            elif tag == T_LIST_HEADER and tstack and len(pay) >= 24:
                # nParas(4) property(4) col(2) row(2) colspan(2) rowspan(2) width(4) height(4)
                col, row, cs, rs = struct.unpack_from('<HHHH', pay, 8)
                w, h = struct.unpack_from('<II', pay, 16)
                cur_cell = {'col': col, 'row': row, 'cs': max(1, cs), 'rs': max(1, rs),
                            'w': w, 'h': h, 'text': []}
                tstack[-1]['cells'].append(cur_cell)
            elif tag == T_PARA_TEXT:
                t = clean_text(pay)
                if not t: continue
                if tstack and cur_cell is not None: cur_cell['text'].append(t)
                elif not tstack: blocks.append(('p', t))
        while tstack:
            fr = tstack.pop()
            if fr.get('pcell') is not None: fr['pcell']['text'].append(('table', fr))
            else: blocks.append(('table', fr))
    f.close()
    return blocks

def esc(t): return html.escape(t).replace('\n', '<br>')

def cell_html(cell):
    """셀 내용 = 문자열 + 중첩 표가 섞인 목록"""
    parts = []
    for item in cell['text']:
        if isinstance(item, tuple) and item[0] == 'table':
            parts.append(render_table(item[1]))
        else:
            s = str(item).strip()
            if s: parts.append(esc(s))
    return ''.join(parts) if any(isinstance(x, tuple) for x in cell['text']) else '<br>'.join(parts)

def render_table(v):
    # 1x1 표(제목 감싼 글상자/레이아웃용)는 내용만 펼침
    if v['rows'] == 1 and v['cols'] == 1:
        return ''.join('<p>' + cell_html(c) + '</p>' for c in v['cells'] if cell_html(c))
    rows, cols = v['rows'], v['cols']
    return _grid_html(v, rows, cols)

def to_html(blocks):
    out = []
    for kind, v in blocks:
        if kind == 'p':
            t = v.strip()
            if not t: continue
            out.append('<p>' + esc(t) + '</p>')
        else:
            out.append(render_table(v))
    return '\n'.join(out)

def _grid_html(v, rows, cols):
    out = []
    if True:
        if True:
            grid = {}
            for c in v['cells']:
                grid[(c['row'], c['col'])] = c
            # ── 실제 칸 너비 복원: span=1 셀의 width(HWPUNIT)로 열 폭 산출 ──
            colw = [0] * cols
            for c in v['cells']:
                if c['cs'] == 1 and c['col'] < cols and c.get('w'):
                    colw[c['col']] = max(colw[c['col']], c['w'])
            # span 셀만 있는 열은 병합폭을 남은 열에 균등 배분
            for c in v['cells']:
                if c['cs'] > 1 and c.get('w'):
                    idx = [c['col'] + k for k in range(c['cs']) if c['col'] + k < cols]
                    known = sum(colw[k] for k in idx if colw[k])
                    blanks = [k for k in idx if not colw[k]]
                    if blanks and c['w'] > known:
                        share = (c['w'] - known) / len(blanks)
                        for k in blanks: colw[k] = share
            total = sum(colw)
            cg = ''
            if total > 0:
                cg = '<colgroup>' + ''.join(
                    '<col style="width:%.3f%%">' % (w / total * 100 if w else 100.0 / cols)
                    for w in colw) + '</colgroup>'
            covered = set()
            trs = []
            for r in range(rows):
                tds = []
                for c in range(cols):
                    if (r, c) in covered: continue
                    cell = grid.get((r, c))
                    if cell is None:
                        tds.append('<td></td>'); continue
                    for rr in range(cell['rs']):
                        for cc in range(cell['cs']):
                            if rr or cc: covered.add((r+rr, c+cc))
                    attr = ''
                    if cell['cs'] > 1: attr += ' colspan="%d"' % cell['cs']
                    if cell['rs'] > 1: attr += ' rowspan="%d"' % cell['rs']
                    tds.append('<td%s>%s</td>' % (attr, cell_html(cell)))
                if tds: trs.append('<tr>' + ''.join(tds) + '</tr>')
            out.append('<table>' + cg + ''.join(trs) + '</table>')
    return '\n'.join(out)

if __name__ == '__main__':
    for p in sys.argv[1:]:
        blocks = convert(p)
        nt = sum(1 for k, _ in blocks if k == 'table')
        np_ = sum(1 for k, _ in blocks if k == 'p')
        print('=' * 70)
        print(os.path.basename(p), '→ 문단 %d, 표 %d' % (np_, nt))
        print('=' * 70)
        print(to_html(blocks)[:3000])
