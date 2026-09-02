/* 증명서 — 한 화면에 다 보이기(나안) · PDF 메일 보내기
   지키려는 것:
   1) 왼쪽 입력 / 오른쪽 문서. 문서를 «아래»로 되돌리면 직인 자리가 화면 밖으로 나간다.
   2) 배율은 scrollHeight 를 «배율로 나누지 않고» 쓴다.
      (나눴다가 잴 때마다 작아져 바닥 0.3 까지 굴러떨어진 적이 있다 — 브라우저 시험으로 잡음)
   3) 찍기 전에 줄이기를 풀고, 끝나면 되돌린다. 안 풀면 흐린 PDF 가 나간다.
   4) 첨부는 base64 «알맹이»만 보낸다. data: 앞머리를 붙여 보내면 서버가 깨진 파일을 만든다.
   5) 보낸 것도 발급 이력에 남는다. */
const fs = require('fs');
const path = require('path');
const { cutFn } = require('./cut-fn');

const root = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'pu-erp.html'), 'utf8').split('\r\n').join('\n');

/* 중괄호 짝을 세어 함수를 «통째로» 뽑는다 — 글자 수로 자르면 함수 끝에 못 닿는다 */
const cert = cutFn(src, 'function Certificate()');
const log  = cutFn(src, 'function CertLog()');

let fail = 0, total = 0;
function ok(name, cond, hint) {
  total++;
  if (cond) { console.log('ok   ' + name); return; }
  fail++;
  console.log('FAIL ' + name + (hint ? '\n     → ' + hint : ''));
}

// ── ① 자리 ──
ok('왼쪽 입력 300px · 오른쪽 문서',
  /gridTemplateColumns:'300px 1fr'/.test(cert),
  '문서를 아래로 되돌리면 직인 자리가 화면 밖으로 나간다');
ok('발급 이력은 두 칸 «밖»(아래)에 있다',
  /\n\s*\/\/ ── 아래: 발급 이력 \(접이식\) ──\n\s*h\(CertLog, null\)/.test(cert),
  '이력이 오른쪽 칸으로 돌아가면 문서 자리가 다시 좁아진다');
ok('담당자는 접혀 있고 눌러서 편다',
  /!contactOpen && h\('div'/.test(cert) && /contactOpen && h\('div'/.test(cert),
  '좁은 칸에 이름·직위·연락처 셋을 늘 펴 두면 모두 잘린다');

// ── ② 배율 셈 ──
ok('제 높이를 배율로 «나누지» 않는다',
  /var natural = doc\.scrollHeight;/.test(cert) && !/doc\.scrollHeight \/ /.test(cert),
  'transform 은 scrollHeight 를 안 바꾼다 — 나누면 배율이 바닥까지 굴러떨어진다');
ok('남은 높이·폭에 맞춰 배율을 정한다',
  /roomH \/ natural/.test(cert) && /roomW \/ naturalW/.test(cert) && /Math\.max\(0\.3/.test(cert),
  '화면 높이·폭을 안 재면 「한 화면에 다 보기」가 성립하지 않는다 — A4 실제 크기(210mm)로 고정한 뒤로는 폭도 넘칠 수 있다');
ok('바깥 상자가 «줄인 뒤» 높이를 차지한다',
  /Math\.round\(certDocH \* certZoom\)/.test(cert),
  '안 잡아 주면 문서 아래에 줄인 만큼 빈 자리가 남는다');
ok('화면 크기가 바뀌면 다시 잰다',
  /addEventListener\('resize'/.test(cert) && /removeEventListener\('resize'/.test(cert),
  '치우지 않으면 화면을 옮겨 다닐 때마다 재는 일이 쌓인다');

// ── ③ PDF ──
ok('PDF 도구는 «보낼 때» 내려받는다',
  /certLoadOnce\(H2C_URL/.test(cert) && /createElement\('script'\)/.test(cert),
  '처음부터 싣게 되돌리면 증명서를 안 쓰는 사람도 매번 기다린다');
ok('도구를 못 가져오면 인쇄 길을 알려 준다',
  /인쇄\/PDF 로 저장해 보내 주세요/.test(cert),
  '인터넷이 막혔을 때 아무 말 없이 실패하면 안 된다');
ok('찍기 전에 줄이기를 푼다',
  /box\.style\.transform = 'none'/.test(cert),
  '줄인 채로 찍으면 흐린 PDF 가 나간다');
ok('찍은 뒤 반드시 되돌린다(실패해도)',
  (cert.match(/restore\(\);/g) || []).length >= 2,
  '되돌리지 않으면 화면이 원래 크기로 굳어 밖으로 삐져나온다');
ok('여러 장이면 나눠 담는다',
  /Math\.ceil\(full \/ room\)/.test(cert),
  '한 장에 우겨 넣으면 아랫부분이 잘린다');

// ── ④ 보내기 ──
ok('첨부는 data: 앞머리를 뗀 알맹이만',
  /uri\.slice\(uri\.indexOf\(','\) \+ 1\)/.test(cert),
  '앞머리째 보내면 서버가 열리지 않는 파일을 만든다');
ok('첨부 이름은 종류_이름_날짜.pdf',
  /filename: kindLabel \+ '_' \+ u\.name \+ '_' \+ issueDate \+ '\.pdf'/.test(cert),
  '이름이 같으면 받는 쪽에서 뒤섞인다');
ok('로그인 증표가 붙는 창구로 보낸다',
  /postMail\(CERT_MAIL_FN_URL/.test(cert),
  'fetch 로 바로 부르면 증표가 안 붙어 401 이 된다');
ok('받는 주소를 확인하고 보낸다',
  /\[\^@\\s\]\+@\[\^@\\s\]\+/.test(cert),
  '빈 주소로 부르면 서버까지 갔다가 실패한다');
ok('보내는 동안 단추가 잠긴다',
  /disabled: !!mailBusy/.test(cert),
  '두 번 눌리면 같은 메일이 두 번 간다');
ok('본문의 <, & 는 글자로 바꿔 보낸다',
  /replace\(\/&\/g, '&amp;'\)/.test(cert) && /replace\(\/<\/g, '&lt;'\)/.test(cert),
  '그대로 보내면 본문이 태그로 읽혀 깨진다');

// ── ⑤ A4 실제 크기 (대표 지시 2026-09-02: 「A4 형태양식으로 재직증명서 만들어라」) ──
// 미리보기가 실제 종이 비율(210×297mm)로 안 보여, 화면에 뜬 문서가 진짜 A4처럼
// 안 보인다는 지적. mm 단위는 화면·인쇄가 같은 잣대(1mm=96/25.4px)라 값을 못
// 박아도(210mm) 어긋나지 않는다 — 그래서 여기서는 그 «값»(A4 실치수) 자체를 지킨다.
ok('미리보기 문서 폭이 A4 210mm 이다',
  /width:'210mm'/.test(cert),
  '폭이 고정 안 되면 창 너비에 따라 문서가 늘었다 줄었다 해 A4처럼 안 보인다');
ok('미리보기 문서 높이가 A4 297mm 이상이다',
  /minHeight:'297mm'/.test(cert),
  '높이가 짧으면 내용이 적을 때 정사각형에 가까워져 A4 비율이 깨진다');
ok('안쪽 여백이 인쇄 여백(25mm 20mm)과 같다',
  /padding:'25mm 20mm'/.test(cert),
  '화면 여백과 인쇄 여백이 다르면 미리보기와 실제 출력의 줄바꿈 위치가 달라진다');
ok('문서가 가운데 정렬된다',
  /margin:'0 auto'/.test(cert),
  '가운데로 안 모이면 화면이 넓을 때 문서가 왼쪽에 붙어 종이처럼 안 보인다');
ok('인쇄 팝업은 A4 폭(700px 고정 아님)을 그대로 채운다',
  /\.cert-doc \{ width: 100%; margin: 0 auto; \}/.test(cert),
  '700px 는 A4(170mm 안쪽) 보다 넓어 인쇄가 살짝 잘릴 수 있었다');

// ── ⑥ 이력 ──
ok('보낸 것도 발급 이력에 남는다',
  /saveLog\('mail'\)/.test(cert),
  '누구에게 나갔는지 남지 않으면 증명서 관리가 안 된다');
ok('이력 화면에 「메일」이 보인다',
  /mail:'📧 메일'/.test(log),
  "방법이 'mail' 인데 표에 이름이 없으면 날것이 그대로 보인다");
ok('내려받는 표에도 「메일」이 적힌다',
  /r\.method==='mail' \? '메일'/.test(log),
  "표에서 메일 발급분이 「다운로드」로 잘못 적힌다");

console.log('\n  === ' + (total - fail) + ' 통과 / ' + fail + ' 실패 ===');
process.exit(fail ? 1 : 0);
