// 건의 진행상황 + 피드백 루프 (박재원 건의 2026-08-12)
//  ① 건의한 사람이 내 건의의 접수/검토중/완료 를 직접 본다
//  ② 완료 팝업에서 「해결됐어요 / 아직 안 됐어요」 를 바로 답한다
//  ③ 미해결이면 상세 피드백이 «재요청 건의» 로 다시 접수된다 (원본과 이어진다)
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'enter.html'), 'utf8');

let pass = 0, fail = 0;
function ok(name, cond, hint){
  if(cond){ pass++; console.log('  PASS ' + name); }
  else { fail++; console.log('  FAIL ' + name + (hint ? ' — ' + hint : '')); }
}

console.log('\n[① 내 건의 진행상황 — 건의한 사람이 직접 본다]');
ok('건의를 내면 내 진행함에도 적는다 (접수 상태로)',
   /sgResolvedUidPath\(SG\.uid\)\+'\/'\+ref\.key\)\.set\(\{\s*title: rec\.title, cat: rec\.cat, status: 'new', at: rec\.createdAt, seen: true/.test(src));
ok('일반 사용자 홈에 「내 건의 진행상황」 이 뜬다', /📋 내 건의 진행상황/.test(src));
ok('상태 칩(접수·검토중·완료)을 보여준다', /var st = SG_STATUS\[it\.status\] \|\| SG_STATUS\.done;/.test(src));
ok('답변이 달린 건은 펼쳐 볼 수 있다', /'답변 보기'/.test(src) && /'답변 접기'/.test(src));
ok('본인 진행함만 읽는다 — 남의 건의는 여전히 안 보인다',
   /sgViewMemberHome[\s\S]{0,2600}?sgLoadOwnResolved\(\)/.test(src));

console.log('\n[② 관리자가 상태를 바꾸면 건의자에게 반영된다]');
ok('어떤 상태든 진행함에 반영한다 (검토중 포함)',
   /rref\.update\(\{ title:s\.title\|\|'', reply:reply, replyImages:replyImages,[\s\S]{0,120}?status:newStatus/.test(src));
ok('완료 취소해도 지우지 않고 상태만 되돌린다', !/rref\.remove\(\)\.catch/.test(src));
ok('완료일 때만 팝업 대상(seen:false)이 된다', /seen:\(newStatus !== 'done'\)/.test(src));
ok('본인이 남긴 확인 기록을 덮지 않는다 (set 이 아니라 update)',
   !/rref\.set\(\{ title:s\.title/.test(src));

console.log('\n[③ 완료 팝업 — 해결됐는지 바로 묻는다]');
ok('완료 상태만 팝업에 올린다 (검토중 변화는 팝업 아님)',
   /if\(!v\.seen && \(v\.status\|\|'done'\)==='done'\)\{ v\._id=id; items\.push\(v\); \}/.test(src));
ok('「해결됐어요」 단추가 있다', /✅ 해결됐어요/.test(src));
ok('「아직 안 됐어요」 단추가 있다', /🙅 아직 안 됐어요/.test(src));
ok('해결 확인이 기록된다', /resolvedOk:true, resolvedAt:Date\.now\(\)/.test(src));
ok('미해결이면 상세 피드백을 적게 한다', /어떤 부분이 해결되지 않았는지 자세히 적어주세요/.test(src));
ok('피드백이 비면 보내지 못한다', /alert\('어떤 부분이 해결되지 않았는지 적어주세요\.'\)/.test(src));
ok('닫기는 「나중에 확인」 — 답 안 한 건은 다음 로그인에 다시 묻는다',
   /sgDoneOk'\)\.textContent = '나중에 확인'/.test(src));

console.log('\n[④ 재요청 — 피드백이 새 건의로 접수되고 원본과 이어진다]');
ok('재요청 제목에 ↩ 가 붙는다', /'↩ 재요청: '\+\(it\.title\|\|''\)/.test(src));
ok('원본과 relatedId 로 이어진다', /relatedId:it\._id/.test(src));
ok('제목 길이 제한(200자)을 지킨다', /\.slice\(0,200\)/.test(src));
ok('메타 미러도 함께 적어 관리자 배지·알림이 그대로 간다',
   /SG_META_PRIVATE_PATH\+'\/'\+ref\.key\)\.set\(\{ author:rec\.author/.test(src));
ok('미해결 회신이 원본 기록에 남는다', /resolvedOk:false, feedback:txt\.slice\(0,2000\), feedbackAt/.test(src));

console.log('\n[⑤ 관리자 쪽 — 재요청과 확인 상태가 보인다]');
ok('상세에 재요청 배너가 뜬다', /↩ <b>재요청<\/b> — 건의자가 처리 결과를 「미해결」로 회신한 건입니다/.test(src));
ok('원본 건의로 건너뛸 수 있다', /sgViewDetail\(s\.relatedId\)/.test(src));
ok('건의자가 해결을 확인하면 상세에 보인다', /✅ 건의자가 해결을 확인했습니다/.test(src));
ok('미해결 회신과 피드백 내용이 상세에 보인다', /🙅 건의자가 미해결로 회신했습니다/.test(src));
ok('목록에도 ↩ 재요청 이 보인다', /var reReq = s\.relatedId \?[\s\S]{0,80}?↩ 재요청/.test(src));

console.log('\n[⑥ 배지 — 완료 알림만 센다]');
ok('접수·검토중 상태 변화는 배지에 안 센다',
   /if\(!v\.seen && \(v\.status\|\|'done'\)==='done'\) n\+\+;/.test(src));

console.log('\n[⑦ 규칙을 건드리지 않았다 — 콘솔 규칙이 진짜이므로]');
{
  const rules = fs.readFileSync(path.join(__dirname, '..', 'docs', 'firebase-rules-3순위-포털권한.json'), 'utf8');
  const j = JSON.parse(rules);
  const sg = j.rules.suggestions_private.$id;
  ok('상태는 여전히 new|ing|done 세 가지', /\^\(new\|ing\|done\)\$/.test(sg.status['.validate']));
  ok('필수 칸 목록이 그대로다 (relatedId 는 추가 칸이라 규칙 변경 불필요)',
     sg['.validate'].indexOf("'cat','title','content','author','authorEmail','authorUid','status','createdAt'") >= 0);
  const rp = j.rules.suggestions_resolved_private.$uid;
  ok('본인 진행함은 본인이 읽고 쓴다 (그래서 규칙 변경이 필요 없다)',
     rp['.read'].indexOf('auth.uid === $uid') >= 0 && rp['.write'].indexOf('auth.uid === $uid') >= 0);
}

console.log('\n  === ' + pass + ' 통과 / ' + fail + ' 실패 ===\n');
process.exit(fail ? 1 : 0);
