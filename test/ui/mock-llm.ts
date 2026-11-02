// A scripted OpenAI-compatible server for the UI tests. Answers are fixed so
// the tests can assert on them; /__control switches on failures and delays,
// and /__calls says what the app asked for.

import http from 'node:http';

const PORT = Number(process.env.MOCK_LLM_PORT ?? 5199);

export const OPENER = 'いらっしゃいませ！{何|なに}を{飲|の}みますか？';
export const SECOND = 'はい、{大|おお}きいサイズと{小|ちい}さいサイズ、どちらにしますか？';

type Kind = 'chat' | 'rewrite' | 'breakdown' | 'feedback';
let calls: { kind: Kind; turns: number }[] = [];
let control = { fail: false, delayMs: 0 };

const completion = (content: string) => ({ choices: [{ message: { role: 'assistant', content } }] });

function answer(kind: Kind, body: any): unknown {
  if (kind === 'breakdown') {
    return completion(
      JSON.stringify({
        lines: [
          { japanese: 'いらっしゃいませ！', translation: 'Welcome!', explanation: 'A set phrase shops use to greet customers.', words: [{ text: 'いらっしゃいませ', reading: 'いらっしゃいませ', meaning: 'welcome' }] },
          {
            japanese: '{何|なに}を{飲|の}みますか？',
            translation: 'What will you drink?',
            explanation: 'を marks the object; か makes it a question.',
            words: [
              { text: '{何|なに}', reading: 'なに', meaning: 'what' },
              { text: 'を', reading: 'を', meaning: 'object marker' },
            ],
          },
        ],
      }),
    );
  }
  if (kind === 'feedback') {
    return completion(
      JSON.stringify({
        meaning: 'A coffee, please.',
        verdict: 'minor',
        corrected: 'コーヒーをお{願|ねが}いします。',
        summary: 'Nice try! Use を for what you are ordering.',
        lines: [{ original: 'コーヒーがおねがいします。', originalTranslation: 'Coffee does a request.', corrected: 'コーヒーをお{願|ねが}いします。', translation: 'A coffee, please.', explanation: 'With お願いします the thing you ask for takes を.', ok: false }],
      }),
    );
  }
  if (kind === 'rewrite') return completion(String(body.messages.at(-1).content).split('\n\n').pop() ?? '');
  const turns = body.messages.length - 1;
  return completion(turns <= 1 ? OPENER : SECOND);
}

http
  .createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', async () => {
      const send = (status: number, value: unknown) => {
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(value));
      };
      const url = req.url ?? '';
      if (url === '/__control') {
        control = { ...control, ...JSON.parse(raw || '{}') };
        return send(200, control);
      }
      if (url === '/__reset') {
        calls = [];
        control = { fail: false, delayMs: 0 };
        return send(200, {});
      }
      if (url === '/__calls') return send(200, calls);
      if (url.endsWith('/models')) return send(200, { data: [{ id: 'mock-small' }, { id: 'mock-large' }] });
      if (!url.endsWith('/chat/completions')) return send(404, { error: 'not found' });

      const body = JSON.parse(raw || '{}');
      const schema = JSON.stringify(body.response_format ?? '');
      const system = String(body.messages?.[0]?.content ?? '');
      const kind: Kind = schema.includes('verdict') ? 'feedback' : schema.includes('lines') ? 'breakdown' : system.startsWith('You edit Japanese') ? 'rewrite' : 'chat';
      calls.push({ kind, turns: body.messages.length - 1 });
      if (control.delayMs) await new Promise((r) => setTimeout(r, control.delayMs));
      if (control.fail) return send(500, { error: 'mock model is down' });
      send(200, answer(kind, body));
    });
  })
  .listen(PORT, '127.0.0.1', () => console.log(`mock LLM on http://127.0.0.1:${PORT}`));
