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

  it('writes keepalive comments until the first token, then stops', async () => {
    vi.useFakeTimers();
    try {
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
      await vi.advanceTimersByTimeAsync(5000);
      const out = await reading;
      expect(out.raw.match(/: keepalive/g)?.length).toBe(2);
      expect(out.raw.lastIndexOf(': keepalive')).toBeLessThan(
        out.raw.indexOf('data: '),
      );
      expect(out.text).toBe('Hi');
    } finally {
      vi.useRealTimers();
    }
  });

  it('abort while produce() is pending closes promptly with no further writes', async () => {
    vi.useFakeTimers();
    try {
      const controller = new AbortController();
      const onError = vi.fn();
      const stream = toOpenAIChatCompletionStream(
        () => new Promise<never>(() => {}),
        {
          model: 'viper7',
          fallbackText: 'Sorry, say again?',
          signal: controller.signal,
          onError,
          keepaliveMs: 1000,
        },
      );
      const reading = read(stream);
      await vi.advanceTimersByTimeAsync(1500);
      controller.abort();
      await vi.advanceTimersByTimeAsync(5000);
      const out = await reading;
      expect(out.raw.match(/: keepalive/g)?.length).toBe(1);
      expect(out.text).toBe('');
      expect(out.done).toBe(false);
      expect(onError).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('an already-aborted signal closes without calling produce', async () => {
    const controller = new AbortController();
    controller.abort();
    const produce = vi.fn(async () => yieldAll(['x']));
    const out = await read(
      toOpenAIChatCompletionStream(produce, {
        model: 'viper7',
        fallbackText: 'f',
        signal: controller.signal,
      }),
    );
    expect(produce).not.toHaveBeenCalled();
    expect(out.raw).toBe('');
  });

  it('abort mid-iteration writes no more content, no stop and no [DONE]', async () => {
    const controller = new AbortController();
    const onError = vi.fn();
    async function* source() {
      yield 'one';
      controller.abort();
      yield 'two';
      yield 'three';
    }
    const out = await read(
      toOpenAIChatCompletionStream(async () => source(), {
        model: 'viper7',
        fallbackText: 'f',
        signal: controller.signal,
        onError,
      }),
    );
    expect(out.text).toBe('one');
    expect(out.done).toBe(false);
    expect(out.chunks.some((c) => c.choices[0].finish_reason === 'stop')).toBe(
      false,
    );
    expect(onError).not.toHaveBeenCalled();
  });

  it('consumer cancel mid-stream does not throw and stops keepalives', async () => {
    vi.useFakeTimers();
    try {
      const clear = vi.spyOn(globalThis, 'clearInterval');
      const onError = vi.fn();
      const stream = toOpenAIChatCompletionStream(
        () => new Promise<never>(() => {}),
        {
          model: 'viper7',
          fallbackText: 'f',
          onError,
          keepaliveMs: 1000,
        },
      );
      const reader = stream.getReader();
      await vi.advanceTimersByTimeAsync(1500);
      const first = await reader.read();
      expect(new TextDecoder().decode(first.value)).toBe(': keepalive\n\n');
      await expect(reader.cancel()).resolves.toBeUndefined();
      expect(clear).toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
      await vi.advanceTimersByTimeAsync(5000);
      expect(onError).not.toHaveBeenCalled();
      clear.mockRestore();
    } finally {
      vi.useRealTimers();
    }
  });
});
