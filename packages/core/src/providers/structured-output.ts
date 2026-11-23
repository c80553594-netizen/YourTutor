import { type z } from 'zod';
import {
  type ChatMessage,
  ProviderError,
  type StructuredRequest,
  type StructuredResult,
  type TokenUsage,
  type TutorProvider,
} from './types.js';

/**
 * Extracts a JSON object or array string from raw LLM output, tolerating
 * markdown ```json fences and explanatory prefix/suffix text.
 */
export function extractJsonCandidate(rawText: string): string {
  const trimmed = rawText.trim();

  // 1. Prefer explicit fenced JSON block if present
  const fenceRegex = /```(?:json)?\s*([\s\S]*?)```/i;
  const fencedMatch = fenceRegex.exec(trimmed);
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }

  // 2. If already looks like JSON, return directly
  if (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  ) {
    return trimmed;
  }

  // 3. Scan for balanced JSON object/array boundary
  const firstObj = trimmed.indexOf('{');
  const firstArr = trimmed.indexOf('[');
  let start = -1;
  let openChar = '{';
  let closeChar = '}';

  if (firstObj !== -1 && (firstArr === -1 || firstObj < firstArr)) {
    start = firstObj;
  } else if (firstArr !== -1) {
    start = firstArr;
    openChar = '[';
    closeChar = ']';
  }

  if (start === -1) {
    return trimmed;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
    } else if (ch === openChar) {
      depth++;
    } else if (ch === closeChar) {
      depth--;
      if (depth === 0) {
        return trimmed.slice(start, i + 1);
      }
    }
  }

  return trimmed.slice(start);
}

async function collectStreamText(
  provider: TutorProvider,
  request: StructuredRequest<z.ZodTypeAny>,
  messages: ChatMessage[],
  systemPrompt: string
): Promise<{ text: string; usage?: TokenUsage }> {
  let text = '';
  let usage: TokenUsage | undefined;

  for await (const event of provider.streamChat({
    ...request,
    messages,
    systemPrompt,
  })) {
    if (event.type === 'text_delta') {
      text += event.text;
    } else if (event.type === 'usage') {
      usage = event.usage;
    } else if (event.type === 'error') {
      throw new ProviderError(event.error);
    }
  }

  return { text, usage };
}

/**
 * Shared structured-output execution engine with Zod validation and automatic
 * repair retries when the model emits malformed JSON or schema violations.
 */
export async function runStructuredWithRepair<TSchema extends z.ZodTypeAny>(
  provider: TutorProvider,
  request: StructuredRequest<TSchema>
): Promise<StructuredResult<z.infer<TSchema>>> {
  const maxRepairAttempts = Math.max(0, request.maxRepairAttempts ?? 2);
  const schemaLabel = request.schemaName ?? 'StructuredOutput';
  const jsonInstruction = [
    request.systemPrompt ?? '',
    `[STRICT OUTPUT CONTRACT — ${schemaLabel}]`,
    request.schemaDescription ? `Description: ${request.schemaDescription}` : '',
    'You MUST respond with ONLY a single valid JSON object (no markdown fences, no commentary outside JSON).',
  ]
    .filter((s) => s.length > 0)
    .join('\n\n');

  const conversation: ChatMessage[] = [...request.messages];
  let lastRawText = '';
  let lastErrorSummary = 'Unknown validation failure';
  let lastUsage: TokenUsage | undefined;

  for (let attempt = 1; attempt <= maxRepairAttempts + 1; attempt++) {
    if (request.signal?.aborted) {
      throw new ProviderError({
        code: 'ABORTED',
        message: 'Structured generation aborted by caller.',
      });
    }

    const { text, usage } = await collectStreamText(
      provider,
      request,
      conversation,
      jsonInstruction
    );
    lastRawText = text;
    if (usage) {
      lastUsage = usage;
    }

    const candidate = extractJsonCandidate(text);
    let parsedJson: unknown;

    try {
      parsedJson = JSON.parse(candidate) as unknown;
    } catch (err) {
      lastErrorSummary = `JSON syntax error: ${err instanceof Error ? err.message : String(err)}`;
      if (attempt <= maxRepairAttempts) {
        conversation.push(
          { role: 'assistant', content: text },
          {
            role: 'user',
            content: `Your previous response could not be parsed as valid JSON (${lastErrorSummary}). Output ONLY the corrected valid JSON matching the required schema.`,
          }
        );
        continue;
      }
      break;
    }

    const validated = request.schema.safeParse(parsedJson);
    if (validated.success) {
      return {
        data: validated.data as z.infer<TSchema>,
        rawText: text,
        attempts: attempt,
        usage: lastUsage,
      };
    }

    const issueList = validated.error.issues
      .map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`)
      .join('; ');
    lastErrorSummary = `Zod schema validation failed: ${issueList}`;

    if (attempt <= maxRepairAttempts) {
      conversation.push(
        { role: 'assistant', content: text },
        {
          role: 'user',
          content: `Your JSON failed schema validation (${lastErrorSummary}). Fix every listed field and return ONLY the valid JSON object.`,
        }
      );
    }
  }

  throw new ProviderError({
    code: 'SCHEMA_VALIDATION_ERROR',
    message: `Failed to produce valid structured output for ${schemaLabel} after ${maxRepairAttempts + 1} attempts: ${lastErrorSummary}`,
    stderr: lastRawText.slice(0, 1000),
    retryable: false,
  });
}
