const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const version = {
  sha: process.env.PU_RELEASE_SHA || 'local',
  shortSha: (process.env.PU_RELEASE_SHA || 'local').slice(0, 8),
  runId: process.env.PU_RELEASE_RUN || '',
  deployedAt: new Date().toISOString()
};

fs.writeFileSync(path.join(root, 'version.json'), `${JSON.stringify(version, null, 2)}\n`, 'utf8');
console.log(`Prepared version ${version.shortSha} at ${version.deployedAt}`);

/* ── 화면에도 «지금 판」을 찍어 둔다 (대표 보고 2026-08-17
     "피시에서는 업데이트되었는데 폰에서는 안 된다") ──
   왜 필요한가 — 예전에는 「내가 지금 무슨 판을 돌리고 있나」를 sessionStorage 로만
   알았다. 그런데 **새 탭은 sessionStorage 가 비어 있다.** 그때 pu-version.js 는
   서버가 말하는 판을 그대로 「내 판」으로 적어 버렸다. 그래서 폰 브라우저가
   **캐시에 있던 옛 화면**을 내줘도 단추는 「최신」이라고 말했다 — 옛 코드를
   돌리면서 최신이라고 적힌 화면이 그것이다.
   이제 배포할 때 파일 안에 판을 찍어 두면, 화면은 자기가 무슨 판인지 **스스로**
   안다. 서버 판과 다르면 캐시가 옛것을 준 것이므로 갈아탈 수 있다.
   ⚠ 저장소 파일이 아니라 **러너에 받아둔 사본**을 고친다(배포 직전 단계). */
const META = (sha) => `<meta name="pu-release" content="${sha}">`;
const stamped = [];
for (const name of fs.readdirSync(root)) {
  if (!name.endsWith('.html')) continue;
  const file = path.join(root, name);
  if (!fs.statSync(file).isFile()) continue;
  let html = fs.readFileSync(file, 'utf8');
  if (/<meta name="pu-release"/.test(html)) {
    html = html.replace(/<meta name="pu-release"[^>]*>/, META(version.sha));
  } else if (/<head[^>]*>/i.test(html)) {
    html = html.replace(/<head[^>]*>/i, (m) => `${m}\n${META(version.sha)}`);
  } else {
    continue;   // head 가 없는 파일은 건드리지 않는다
  }
  fs.writeFileSync(file, html, 'utf8');
  stamped.push(name);
}
console.log(`Stamped pu-release into ${stamped.length} page(s)`);
