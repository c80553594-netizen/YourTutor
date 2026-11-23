export interface NdjsonLineResult {
  line: string;
  parsed?: unknown;
  parseError?: Error;
}

/**
 * Stateful line-delimited JSON (NDJSON) parser that handles arbitrary chunk boundaries,
 * CRLF/LF newlines, blank lines, and non-JSON diagnostic noise gracefully.
 */
export class NdjsonStreamParser {
  private buffer = '';

  push(chunk: string): NdjsonLineResult[] {
    this.buffer += chunk;
    const results: NdjsonLineResult[] = [];
    let newlineIndex = this.buffer.indexOf('\n');

    while (newlineIndex !== -1) {
      const rawLine = this.buffer.slice(0, newlineIndex).replace(/\r$/, '');
      this.buffer = this.buffer.slice(newlineIndex + 1);
      const trimmed = rawLine.trim();
      if (trimmed.length > 0) {
        results.push(this.parseLine(trimmed));
      }
      newlineIndex = this.buffer.indexOf('\n');
    }

    return results;
  }

  flush(): NdjsonLineResult[] {
    const trimmed = this.buffer.replace(/\r$/, '').trim();
    this.buffer = '';
    if (trimmed.length === 0) {
      return [];
    }
    return [this.parseLine(trimmed)];
  }

  private parseLine(line: string): NdjsonLineResult {
    try {
      return { line, parsed: JSON.parse(line) as unknown };
    } catch (err) {
      return {
        line,
        parseError: err instanceof Error ? err : new Error(String(err)),
      };
    }
  }
}
