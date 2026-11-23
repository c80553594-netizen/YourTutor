import { describe, expect, it } from 'vitest';
import { NdjsonStreamParser } from '../ndjson-parser.js';
import { parseSseStream } from '../sse-parser.js';
import { extractJsonCandidate } from '../structured-output.js';

function streamFromChunks(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
}

describe('NdjsonStreamParser', () => {
  it('handles chunks split mid-line, CRLF endings, blank lines, and non-JSON noise', () => {
    const parser = new NdjsonStreamParser();
    const out1 = parser.push('{"type":"text_del');
    expect(out1).toHaveLength(0);

    const out2 = parser.push('ta","text":"hello"}\r\n\nnot-json-warning\n{"type":"done"}');
    expect(out2).toHaveLength(2);
    expect(out2[0]?.parsed).toEqual({ type: 'text_delta', text: 'hello' });
    expect(out2[1]?.parseError).toBeInstanceOf(Error);
    expect(out2[1]?.line).toBe('not-json-warning');

    const flushed = parser.flush();
    expect(flushed).toHaveLength(1);
    expect(flushed[0]?.parsed).toEqual({ type: 'done' });
  });
});

describe('parseSseStream', () => {
  it('parses chunked SSE frames including event names, comments, and multi-line data', async () => {
    const stream = streamFromChunks([
      ': keepalive comment\n\n',
      'event: content_block_delta\ndata: {"type":"text",',
      '"val":"A"}\n\ndata: line1\ndata: line2\r\n\r\n',
      'data: [DONE]',
    ]);

    const frames = [];
    for await (const frame of parseSseStream(stream)) {
      frames.push(frame);
    }

    expect(frames).toEqual([
      { event: 'content_block_delta', id: undefined, data: '{"type":"text","val":"A"}' },
      { event: undefined, id: undefined, data: 'line1\nline2' },
      { event: undefined, id: undefined, data: '[DONE]' },
    ]);
  });
});

describe('extractJsonCandidate', () => {
  it('extracts JSON from markdown fences or surrounding prose', () => {
    expect(extractJsonCandidate('Here is the JSON:\n```json\n{"a": 1}\n```\nDone.')).toBe(
      '{"a": 1}'
    );
    expect(extractJsonCandidate('Prefix {"nested":{"msg":"a}b"}} suffix')).toBe(
      '{"nested":{"msg":"a}b"}}'
    );
  });
});
