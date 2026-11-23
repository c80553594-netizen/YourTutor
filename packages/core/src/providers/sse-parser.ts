export interface SseFrame {
  event?: string;
  id?: string;
  data: string;
}

/**
 * Spec-compliant Server-Sent Events (SSE) parser for Fetch ReadableStream<Uint8Array>.
 * Handles arbitrary chunk boundaries, CRLF/LF line endings, multi-line data fields,
 * and AbortSignal cancellation.
 */
export async function* parseSseStream(
  body: ReadableStream<Uint8Array>,
  signal?: AbortSignal
): AsyncIterable<SseFrame> {
  const reader = body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let currentEvent: string | undefined;
  let currentId: string | undefined;
  let dataLines: string[] = [];

  const flushFrame = (): SseFrame | null => {
    if (dataLines.length === 0) {
      currentEvent = undefined;
      currentId = undefined;
      return null;
    }
    const frame: SseFrame = {
      event: currentEvent,
      id: currentId,
      data: dataLines.join('\n'),
    };
    currentEvent = undefined;
    currentId = undefined;
    dataLines = [];
    return frame;
  };

  try {
    while (true) {
      if (signal?.aborted) {
        return;
      }
      const { value, done } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });

      let newlineIdx = buffer.indexOf('\n');
      while (newlineIdx !== -1) {
        const line = buffer.slice(0, newlineIdx).replace(/\r$/, '');
        buffer = buffer.slice(newlineIdx + 1);

        if (line === '') {
          const frame = flushFrame();
          if (frame) {
            yield frame;
          }
        } else if (!line.startsWith(':')) {
          const colonIdx = line.indexOf(':');
          const field = colonIdx === -1 ? line : line.slice(0, colonIdx);
          let fieldValue = colonIdx === -1 ? '' : line.slice(colonIdx + 1);
          if (fieldValue.startsWith(' ')) {
            fieldValue = fieldValue.slice(1);
          }

          if (field === 'event') {
            currentEvent = fieldValue;
          } else if (field === 'id') {
            currentId = fieldValue;
          } else if (field === 'data') {
            dataLines.push(fieldValue);
          }
        }

        newlineIdx = buffer.indexOf('\n');
      }
    }

    // Flush trailing decoder bytes and any un-terminated final frame
    buffer += decoder.decode();
    if (buffer.trim().length > 0) {
      const trailingLines = buffer.split(/\r?\n/);
      for (const line of trailingLines) {
        if (line.startsWith('data:')) {
          const v = line.slice(5);
          dataLines.push(v.startsWith(' ') ? v.slice(1) : v);
        } else if (line.startsWith('event:')) {
          const v = line.slice(6);
          currentEvent = v.startsWith(' ') ? v.slice(1) : v;
        }
      }
    }
    const lastFrame = flushFrame();
    if (lastFrame) {
      yield lastFrame;
    }
  } finally {
    reader.releaseLock();
  }
}
