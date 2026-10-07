/**
 * Adapts a text stream into OpenAI `chat.completion.chunk` server-sent
 * events — the format Tavus's custom-LLM client (OpenAI Python SDK, 10 s read
 * timeout) consumes.
 *
 * - `produce` runs inside the stream, so a failure before the first token
 *   still yields a spoken fallback instead of an HTTP error (Tavus would go
 *   silent).
 * - Until the first token, an SSE comment is written every `keepaliveMs` so a
 *   slow tool step can't trip the read timeout. Comments are ignored by SSE
 *   parsers.
 * - When `signal` aborts (Tavus cancelled a speculative request), nothing
 *   more is written and the error is not reported.
 */
export function toOpenAIChatCompletionStream(
  produce: () => Promise<AsyncIterable<string>>,
  options: {
    model: string;
    fallbackText: string;
    signal?: AbortSignal;
    keepaliveMs?: number;
    onError?: (err: unknown) => void;
  },
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let closed = false;
  let teardown: (closeController: boolean) => void = () => {
    closed = true;
  };

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const id = `chatcmpl-${crypto.randomUUID()}`;
      const created = Math.floor(Date.now() / 1000);
      const send = (s: string) => {
        if (!closed) controller.enqueue(encoder.encode(s));
      };
      const chunk = (
        delta: { role?: 'assistant'; content?: string },
        finishReason: 'stop' | null,
      ) =>
        send(
          `data: ${JSON.stringify({
            id,
            object: 'chat.completion.chunk',
            created,
            model: options.model,
            choices: [{ index: 0, delta, finish_reason: finishReason }],
          })}\n\n`,
        );

      let sentText = false;
      const emit = (content: string) => {
        chunk(sentText ? { content } : { role: 'assistant', content }, null);
        sentText = true;
      };
      const aborted = () => options.signal?.aborted === true;

      // Idempotent teardown: clears the keepalive, detaches the abort listener
      // and closes the controller at most once. A consumer cancel has already
      // closed the stream, so it must not call controller.close() again.
      const keepalive = setInterval(() => {
        if (!sentText) send(': keepalive\n\n');
      }, options.keepaliveMs ?? 2000);
      const onAbort = () => teardown(true);
      teardown = (closeController) => {
        clearInterval(keepalive);
        options.signal?.removeEventListener('abort', onAbort);
        if (closed) return;
        closed = true;
        if (!closeController) return;
        try {
          controller.close();
        } catch {
          // already closed or errored by the consumer
        }
      };

      if (aborted()) {
        teardown(true);
        return;
      }
      options.signal?.addEventListener('abort', onAbort, { once: true });

      try {
        const stream = await produce();
        for await (const text of stream) {
          if (aborted()) break;
          if (text) emit(text);
        }
      } catch (err) {
        if (!aborted()) options.onError?.(err);
      }

      if (!aborted()) {
        if (!sentText) emit(options.fallbackText);
        chunk({}, 'stop');
        send('data: [DONE]\n\n');
      }
      teardown(true);
    },
    cancel() {
      teardown(false);
    },
  });
}

export function openAISseResponse(
  stream: ReadableStream<Uint8Array>,
): Response {
  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    },
  });
}
