/* 파이어베이스 사용액 — 포털에만, 관리자에게만
   대표 지시 2026-08-17: 「푸른 통합시스템 로그인 될 경우 포털에서 보는 게 좋겠다.
   그리고 금액사용은 관리자만 볼 수 있고 나머지는 안 보는 게 좋겠다」.

   ★ 지키려는 것 둘
     1) 이알피에 옛 표시가 되살아나지 않는다 (자리가 둘이 되면 한쪽만 고쳐진다)
     2) 관리자가 아니면 아예 안 그린다 — 금액이 「₩—」로도 새지 않는다
   모양·색·문구는 못 박지 않는다. 언제든 바뀔 수 있는 것들이다. */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const R = path.join(__dirname, '..');
const enter = fs.readFileSync(path.join(R, 'enter.html'), 'utf8').replace(/\r\n/g, '\n');
const erp   = fs.readFileSync(path.join(R, 'pu-erp.html'), 'utf8').replace(/\r\n/g, '\n');

let pass = 0, fail = 0;
const t = (name, got, want) => {
  const G = JSON.stringify(got), W = JSON.stringify(want);
  if(G === W) pass++;
  else { fail++; console.log('FAIL ' + name + '\n  got  = ' + G + '\n  want = ' + W); }
};

/* ═══ 1. 이알피에서는 완전히 빠졌다 ═══ */
t('★ 이알피에 BillingBar 가 남아 있지 않다', /BillingBar/.test(erp), false);
t('★ 이알피에 BILL_TONE 이 남아 있지 않다', /BILL_TONE/.test(erp), false);
t('★ 이알피는 사용액을 더 이상 읽지 않는다', /PuBilling/.test(erp), false);

/* ═══ 2. 포털에 있다 ═══ */
t('포털이 pu-billing.js 를 읽어들인다', /<script src="js\/pu-billing\.js\?v=\d+"><\/script>/.test(enter), true);
t('머리줄에 사용액 칸이 있다', /id="billChip"/.test(enter), true);
t('자세히 보기 팝업이 있다', /id="billModal"/.test(enter), true);
t('칸을 누르면 팝업이 열린다', /\$\('billChip'\)\.addEventListener\('click', billOpen\)/.test(enter), true);

/* ═══ 3. ★ 관리자만 — 판정 로직을 실제로 돌려 본다 ═══ */
{
  const c = vm.createContext({});
  const m = enter.match(/function billIsAdmin\(role\)\{[^}]*\}/);
  t('billIsAdmin 을 찾을 수 있다', !!m, true);
  if(m){
    vm.runInContext(m[0], c);
    t('★ 대표(admin)는 본다', c.billIsAdmin('admin'), true);
    t('★ 위임관리자(admin-delegate)도 본다', c.billIsAdmin('admin-delegate'), true);
    t('★ 일반 직원(member)은 못 본다', c.billIsAdmin('member'), false);
    t('★ 역할이 없으면 못 본다', c.billIsAdmin(undefined), false);
    t('★ 비슷한 이름에 속지 않는다', c.billIsAdmin('administrator'), false);
  }
}

/* ═══ 4. ★ 관리자가 아니면 구독 자체를 시작하지 않는다 ═══
   화면만 감추고 값은 받아 오면, 개발자도구로 들여다볼 수 있다.
   billStart 는 관리자가 아니면 watch 를 부르기 전에 되돌아 나가야 한다. */
{
  const m = enter.match(/function billStart\(role\)\{[\s\S]*?\n  \}/);
  t('billStart 를 찾을 수 있다', !!m, true);
  if(m){
    const body = m[0];
    const guard = body.indexOf('if(!billIsAdmin(role)');
    const watch = body.indexOf('PuBilling.watch');
    t('★ 관리자 확인이 구독보다 먼저다', guard >= 0 && watch > guard, true);
    t('★ 관리자가 아니면 그 자리에서 되돌아 나간다', /if\(!billIsAdmin\(role\)[^)]*\)\s*return;/.test(body), true);
  }
}

/* ═══ 5. 값이 없으면 아무것도 안 그린다 ═══
   「₩—」 같은 자리를 남기면 고장인지 준비 중인지 알 수 없다. */
t('★ 값이 없으면 칸을 숨긴다', /if\(!s\.has\)\{[^}]*display = 'none'/.test(enter), true);

console.log('\n  === ' + pass + ' 통과 / ' + fail + ' 실패 ===');
process.exit(fail ? 1 : 0);
