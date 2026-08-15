# AI 프록시 만들기

푸른이알피 **AI 요약**, **도우미(대화)**, 업무관리 **AI 초안·인터뷰·지식 뽑기** —
이 다섯 가지는 모두 「AI 프록시 주소」 하나를 씁니다. 그 주소가 없으면 전부 안 됩니다.

---

## 왜 프록시가 필요한가

Claude 를 쓰려면 **유료 키**가 있어야 합니다. 그런데 이 키를 브라우저 화면에 두면
**누구나 개발자도구로 꺼내 볼 수 있습니다.** 우리 저장소는 공개라 코드에 적어 두는 것도 안 됩니다.

그래서 **키는 서버에 두고, 브라우저는 그 서버에만 말을 거는** 구조입니다.

```
브라우저(우리 앱)  ──▶  프록시(내 서버, 키를 여기 둠)  ──▶  Claude
    키 없음                    키 있음
```

이 문서는 그 「프록시」를 **Cloudflare Workers** 로 만드는 방법입니다.
공짜 한도(하루 10만 건)로 충분하고, 서버를 따로 사거나 관리할 필요가 없습니다.

---

## 준비물 두 가지

| | 어디서 | 비용 |
|---|---|---|
| Anthropic API 키 | console.anthropic.com → API Keys | **유료** (쓴 만큼) |
| Cloudflare 계정 | dash.cloudflare.com | 무료 |

⚠ Anthropic 키는 **결제 수단을 등록해야** 발급됩니다. 아래 「돈이 새지 않게」를 꼭 읽어 주세요.

---

## 1단계 — Worker 만들기

1. Cloudflare 로그인 → 왼쪽 **Workers & Pages** → **Create** → **Start with Hello World!** → **Deploy**
2. 만들어진 Worker 에서 **Edit code** 를 누르고, 안에 있는 내용을 **전부 지우고** 아래를 붙여넣습니다
3. **Deploy** 를 누릅니다

```js
// 푸른통합시스템 AI 프록시
// 유료 키를 브라우저에 두지 않기 위한 통로.
// 앱이 보내는 모양과 기대하는 답은 docs/AI-프록시-만들기.md 에 적혀 있다.

// 이 주소에서 오는 요청만 받는다. 우리 앱 주소를 적는다.
const ALLOW = [
  'https://nabaho.github.io',
  // 'http://localhost:8080',   // 내 컴퓨터에서 시험할 때만 잠깐 열기
];

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowed = ALLOW.includes(origin);

    const cors = {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
      'Vary': 'Origin',
    };

    // 브라우저가 본 요청 전에 먼저 물어보는 것(예비요청)
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: allowed ? cors : {} });
    }
    if (!allowed) {
      return reply({ error: { message: '허용되지 않은 곳에서의 요청입니다' } }, 403, {});
    }
    if (request.method !== 'POST') {
      return reply({ error: { message: 'POST 만 받습니다' } }, 405, cors);
    }

    let body;
    try {
      body = await request.json();
    } catch (e) {
      return reply({ error: { message: '본문을 읽지 못했습니다' } }, 400, cors);
    }

    let r, data;
    try {
      r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': env.ANTHROPIC_API_KEY,     // ← 2단계에서 넣는 비밀값
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: body.model,
          // 앱이 보내는 값을 그대로 쓰되 위쪽만 막는다 (한 번에 너무 크게 쓰지 않도록)
          max_tokens: Math.min(Number(body.max_tokens) || 1000, 8000),
          system: body.system || '',
          messages: body.messages || [],
        }),
      });
      data = await r.json();
    } catch (e) {
      return reply({ error: { message: 'AI 서버에 닿지 못했습니다' } }, 502, cors);
    }

    if (!r.ok) {
      const msg = (data && data.error && data.error.message) || ('HTTP ' + r.status);
      return reply({ error: { message: msg } }, r.status, cors);
    }
    // 받은 그대로 돌려준다 — 앱이 content[] 모양을 읽는다
    return reply(data, 200, cors);
  },
};

function reply(obj, status, headers) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: Object.assign({ 'Content-Type': 'application/json' }, headers),
  });
}
```

---

## 2단계 — 키를 비밀값으로 넣기

Worker 화면에서 **Settings → Variables and Secrets → Add**

| 칸 | 넣을 값 |
|---|---|
| Type | **Secret** (Text 아님 — Secret 이라야 나중에 안 보입니다) |
| Name | `ANTHROPIC_API_KEY` |
| Value | Anthropic 에서 받은 키 (`sk-ant-…`) |

**Save** 하고 **Deploy** 를 다시 누릅니다.

⚠ 이름을 **정확히** `ANTHROPIC_API_KEY` 로 적어야 합니다. 위 코드가 그 이름으로 찾습니다.

---

## 3단계 — 주소를 앱에 넣기

Worker 화면 위에 `https://이름.계정.workers.dev` 같은 주소가 있습니다. 그걸 복사해서:

```
시작 화면(포털)  →  왼쪽 아래 [⚙ 설정]  →  「AI 프록시 주소」  →  붙여넣고 저장
```

⚠ [⚙ 설정] 은 **대표님께만** 보입니다.
한 번 넣으면 `data/app_config` 에 저장돼 **모든 직원의 모든 앱**이 함께 씁니다.

---

## 4단계 — 되는지 확인

푸른이알피 오른쪽 아래 **도우미**에게 아무거나 물어보는 것이 제일 빠릅니다.

| 나온 것 | 뜻 | 할 일 |
|---|---|---|
| 답이 나옴 | 됨 | 끝 |
| `AI 프록시 주소가 없습니다…` | 3단계가 안 됨 | 주소를 다시 저장, 새로고침 |
| `연결 오류가…` | 주소가 틀렸거나 Worker 가 안 떠 있음 | 주소 확인, Deploy 다시 |
| `허용되지 않은 곳에서의 요청입니다` | `ALLOW` 에 우리 주소가 없음 | 1단계 `ALLOW` 확인 |
| `authentication_error` / `invalid x-api-key` | 키가 틀림 | 2단계 다시 |
| `credit balance is too low` | 잔액 없음 | Anthropic 에서 충전 |
| `⏱ …초 동안 답이 오지 않았습니다` | 늦음 | 다시 눌러 보기 |

---

## ⚠ 돈이 새지 않게 — 꼭 하세요

**이 프록시는 열쇠가 없습니다.** 앱이 아무 증표도 보내지 않기 때문에, 위 코드의
`ALLOW`(어디서 왔나) 검사가 유일한 방어선입니다.

그런데 「어디서 왔나」는 **브라우저만 정직하게 붙입니다.** 프로그램으로 부르면 얼마든지
꾸며댈 수 있습니다. 즉 **주소가 새어 나가면 남이 우리 키로 돈을 쓸 수 있습니다.**

그래서 두 가지를 함께 하십시오.

1. **Anthropic 콘솔에서 한 달 상한을 겁니다** — Settings → Limits.
   이것이 진짜 안전장치입니다. 최악의 경우에도 그 금액에서 멈춥니다.
2. **Worker 주소를 아무 데나 적지 않습니다.** 포털 ⚙ 설정에만 넣으면 됩니다.

> 제대로 잠그려면 앱과 프록시가 **약속한 증표**를 주고받아야 하는데,
> 그건 앱 코드를 고쳐야 하는 일입니다. 필요하시면 그때 따로 만듭니다.

---

## 앱이 보내는 것 / 기대하는 답

다른 방식(직접 만든 서버 등)으로 만들 때 맞춰야 하는 규격입니다.

**보내는 것** — `POST`, `Content-Type: application/json`, 증표 없음

```json
{
  "model": "claude-sonnet-4-20250514",
  "max_tokens": 1000,
  "system": "…",
  "messages": [{ "role": "user", "content": "…" }]
}
```

- 모델: 푸른이알피는 `claude-sonnet-4-20250514`,
  업무관리는 `claude-opus-5` 를 먼저 쓰고 실패하면 `claude-sonnet-4-20250514` 로 다시 겁니다.
  **프록시가 모델을 제한하면 업무관리는 알아서 다음 모델로 넘어갑니다.**
- `max_tokens`: 800(요약) · 1000(도우미) · 8000(업무관리)

**기대하는 답** — 셋 중 아무 모양이나 됩니다

```json
{ "content": [{ "type": "text", "text": "…" }] }   // Anthropic 원형 (위 코드가 이것)
{ "reply": "…" }
{ "text":  "…" }
```

**실패했을 때** — 이 모양이라야 사람에게 까닭이 보입니다

```json
{ "error": { "message": "왜 실패했는지" } }
```

**시간 제한**: 앱이 45초(푸른이알피)·60초(업무관리)에 스스로 끊습니다.
프록시가 그보다 오래 붙들고 있어도 화면은 풀립니다.

---

## 관련 문서

- `docs/firebase-rules-읽어보세요.md` — 실시간DB 규칙 (콘솔이 원본)
