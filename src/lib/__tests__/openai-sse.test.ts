// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { toOpenAIChatCompletionStream } from '#/lib/openai-sse';

async function* yieldAll(parts: string[]) {
  for (const p of parts) yield p;
}

async function read(stream: ReadableStream<Uint8Array>) {
  const raw = await new Response(stream).text();
  const events = raw.split('\n\n').filter(Boolean);
  const data = events
    .filter((e) => e.startsWith('data: '))
    .map((e) => e.slice(6));
  const chunks = data.filter((d) => d !== '[DONE]').map((d) => JSON.parse(d));
  return {
    raw,
    done: data.at(-1) === '[DONE]',
    text: chunks.map((c) => c.choices[0].delta.content ?? '').join(''),
    chunks,
  };
}

describe('toOpenAIChatCompletionStream', () => {
  it('emits chat.completion.chunk deltas, a stop chunk and [DONE]', async () => {
    const out = await read(
      toOpenAIChatCompletionStream(async () => yieldAll(['Hello', ' there']), {
        model: 'viper7',
        fallbackText: 'fallback',
      }),
    );
    expect(out.text).toBe('Hello there');
    expect(out.done).toBe(true);
    expect(out.chunks[0]).toMatchObject({
      object: 'chat.completion.chunk',
      model: 'viper7',
      choices: [
        {
          index: 0,
          delta: { role: 'assistant', content: 'Hello' },
          finish_reason: null,
        },
      ],
    });
    expect(out.chunks.at(-1)?.choices[0]).toMatchObject({
      delta: {},
      finish_reason: 'stop',
    });
  });

  it('speaks the fallback and reports the error when generation fails', async () => {
    const onError = vi.fn();
    const out = await read(
      toOpenAIChatCompletionStream(
        async () => {
          throw new Error('model down');
        },
        { model: 'viper7', fallbackText: 'Sorry, say again?', onError },
      ),
    );
    expect(out.text).toBe('Sorry, say again?');
    expect(out.done).toBe(true);
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'model down' }),
    );
  });

  it('speaks the fallback when the model produced no text', async () => {
    const out = await read(
      toOpenAIChatCompletionStream(async () => yieldAll(['', '']), {
        model: 'viper7',
        fallbackText: 'Sorry, say again?',
      }),
    );
    expect(out.text).toBe('Sorry, say again?');
  });

  it('aborted signal: no onError, no fallback', async () => {
    const controller = new AbortController();
    const onError = vi.fn();
    const stream = toOpenAIChatCompletionStream(
      async () => {
        controller.abort();
        throw new DOMException('aborted', 'AbortError');
      },
      {
        model: 'viper7',
        fallbackText: 'Sorry, say again?',
        signal: controller.signal,
        onError,
      },
    );
    const out = await read(stream);
    expect(onError).not.toHaveBeenCalled();
    expect(out.text).toBe('');
  });

  it('writes keepalive comments until the first token', async () => {
    vi.useFakeTimers();
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const stream = toOpenAIChatCompletionStream(
      async () => {
        await gate;
        return yieldAll(['Hi']);
      },
      { model: 'viper7', fallbackText: 'x', keepaliveMs: 1000 },
    );
    const reading = read(stream);
    await vi.advanceTimersByTimeAsync(2500);
    release();
    vi.useRealTimers();
    const out = await reading;
    expect(out.raw.match(/: keepalive/g)?.length).toBe(2);
    expect(out.text).toBe('Hi');
  });
});
