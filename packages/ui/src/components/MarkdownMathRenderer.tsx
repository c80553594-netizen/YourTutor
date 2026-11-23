import katex from 'katex';
import React, { useMemo } from 'react';

interface MarkdownMathRendererProps {
  content: string;
  className?: string;
}

function renderLatex(expr: string, displayMode: boolean): string {
  try {
    return katex.renderToString(expr.trim(), {
      displayMode,
      throwOnError: false,
      strict: false,
    });
  } catch {
    return expr;
  }
}

function renderInlineSegments(text: string): React.ReactNode[] {
  // Matches inline math ($...$ or \(...\)), bold (**...**), inline code (`...`), and YourTutor markers
  const pattern =
    /(\$\$[\s\S]+?\$\$|\\\([\s\S]+?\\\)|\$[^$\n]+?\$|\*\*[^*\n]+?\*\*|`[^`\n]+?`|【🎯[^】]+】|【✅[^】]+】|【⚠️[^】]+】)/g;

  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let keyIdx = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    const token = match[0];
    keyIdx++;

    if (token.startsWith('$$') && token.endsWith('$$')) {
      const html = renderLatex(token.slice(2, -2), true);
      nodes.push(
        <div
          key={`dm-${keyIdx}`}
          className="yt-math-block my-2"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      );
    } else if (token.startsWith('\\(') && token.endsWith('\\)')) {
      const html = renderLatex(token.slice(2, -2), false);
      nodes.push(
        <span
          key={`im-${keyIdx}`}
          className="yt-math-inline"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      );
    } else if (token.startsWith('$') && token.endsWith('$')) {
      const html = renderLatex(token.slice(1, -1), false);
      nodes.push(
        <span
          key={`im2-${keyIdx}`}
          className="yt-math-inline"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      );
    } else if (token.startsWith('**') && token.endsWith('**')) {
      nodes.push(
        <strong key={`b-${keyIdx}`} className="font-semibold">
          {token.slice(2, -2)}
        </strong>
      );
    } else if (token.startsWith('`') && token.endsWith('`')) {
      nodes.push(
        <code
          key={`c-${keyIdx}`}
          className="rounded px-1.5 py-0.5 text-[0.85em]"
          style={{
            backgroundColor: 'var(--yt-bg-elevated)',
            fontFamily: 'var(--yt-font-mono)',
          }}
        >
          {token.slice(1, -1)}
        </code>
      );
    } else if (token.startsWith('【🎯')) {
      nodes.push(
        <span
          key={`m-${keyIdx}`}
          className="inline-block rounded px-1.5 py-0.5 text-xs font-semibold"
          style={{ backgroundColor: 'var(--yt-accent-soft)', color: 'var(--yt-accent)' }}
        >
          {token}
        </span>
      );
    } else if (token.startsWith('【✅')) {
      nodes.push(
        <span
          key={`m-${keyIdx}`}
          className="inline-block rounded px-1.5 py-0.5 text-xs font-semibold"
          style={{
            backgroundColor: 'var(--yt-mastery-mastered-bg)',
            color: 'var(--yt-mastery-mastered)',
          }}
        >
          {token}
        </span>
      );
    } else if (token.startsWith('【⚠️')) {
      nodes.push(
        <span
          key={`m-${keyIdx}`}
          className="inline-block rounded px-1.5 py-0.5 text-xs font-semibold"
          style={{
            backgroundColor: 'var(--yt-mastery-weak-bg)',
            color: 'var(--yt-mastery-weak)',
          }}
        >
          {token}
        </span>
      );
    } else {
      nodes.push(token);
    }

    lastIndex = match.index + token.length;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}

type BlockNode =
  | { type: 'code'; lang: string; code: string }
  | { type: 'math'; expr: string }
  | { type: 'table'; headers: string[]; rows: string[][] }
  | { type: 'heading'; level: number; text: string }
  | { type: 'list'; items: string[]; ordered: boolean }
  | { type: 'paragraph'; text: string };

function parseBlocks(markdown: string): BlockNode[] {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const blocks: BlockNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i] ?? '';
    const trimmed = line.trim();

    if (trimmed === '') {
      i++;
      continue;
    }

    // Fenced code block
    if (trimmed.startsWith('```')) {
      const lang = trimmed.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !(lines[i] ?? '').trim().startsWith('```')) {
        codeLines.push(lines[i] ?? '');
        i++;
      }
      i++; // skip closing fence
      blocks.push({ type: 'code', lang, code: codeLines.join('\n') });
      continue;
    }

    // Display math block ($$...$$ or \[...\])
    if (trimmed.startsWith('$$')) {
      if (trimmed.length > 4 && trimmed.endsWith('$$')) {
        blocks.push({ type: 'math', expr: trimmed.slice(2, -2) });
        i++;
        continue;
      }
      const exprLines: string[] = [trimmed.slice(2)];
      i++;
      while (i < lines.length) {
        const current = lines[i] ?? '';
        if (current.trim().endsWith('$$')) {
          exprLines.push(current.trim().slice(0, -2));
          i++;
          break;
        }
        exprLines.push(current);
        i++;
      }
      blocks.push({ type: 'math', expr: exprLines.join('\n') });
      continue;
    }

    // Markdown table
    if (trimmed.startsWith('|') && i + 1 < lines.length && /^\|?[\s:|-]+\|?$/.test((lines[i + 1] ?? '').trim())) {
      const parseRow = (rowLine: string) =>
        rowLine
          .trim()
          .replace(/^\|/, '')
          .replace(/\|$/, '')
          .split('|')
          .map((cell) => cell.trim());

      const headers = parseRow(trimmed);
      i += 2; // skip header and separator
      const rows: string[][] = [];
      while (i < lines.length && (lines[i] ?? '').trim().startsWith('|')) {
        rows.push(parseRow(lines[i] ?? ''));
        i++;
      }
      blocks.push({ type: 'table', headers, rows });
      continue;
    }

    // Heading
    const headingMatch = /^(#{1,4})\s+(.+)$/.exec(trimmed);
    if (headingMatch?.[1] && headingMatch[2]) {
      blocks.push({ type: 'heading', level: headingMatch[1].length, text: headingMatch[2] });
      i++;
      continue;
    }

    // Unordered / ordered list
    if (/^[-*•]\s+/.test(trimmed) || /^\d+\.\s+/.test(trimmed)) {
      const ordered = /^\d+\.\s+/.test(trimmed);
      const items: string[] = [];
      while (i < lines.length) {
        const current = (lines[i] ?? '').trim();
        if (ordered && /^\d+\.\s+/.test(current)) {
          items.push(current.replace(/^\d+\.\s+/, ''));
          i++;
        } else if (!ordered && /^[-*•]\s+/.test(current)) {
          items.push(current.replace(/^[-*•]\s+/, ''));
          i++;
        } else {
          break;
        }
      }
      blocks.push({ type: 'list', items, ordered });
      continue;
    }

    // Paragraph
    const paraLines: string[] = [line];
    i++;
    while (i < lines.length) {
      const next = (lines[i] ?? '').trim();
      if (
        next === '' ||
        next.startsWith('```') ||
        next.startsWith('$$') ||
        next.startsWith('#') ||
        next.startsWith('|') ||
        /^[-*•]\s+/.test(next) ||
        /^\d+\.\s+/.test(next)
      ) {
        break;
      }
      paraLines.push(lines[i] ?? '');
      i++;
    }
    blocks.push({ type: 'paragraph', text: paraLines.join('\n') });
  }

  return blocks;
}

/**
 * Renders exam lectures, tables, code blocks, YourTutor cue badges, and KaTeX formulas
 * with horizontal scroll guards so long equations never break narrow Android screens.
 */
export function MarkdownMathRenderer({
  content,
  className = '',
}: MarkdownMathRendererProps): React.ReactElement {
  const blocks = useMemo(() => parseBlocks(content), [content]);

  return (
    <div className={`yt-prose space-y-2.5 text-sm leading-relaxed break-words ${className}`}>
      {blocks.map((block, idx) => {
        if (block.type === 'heading') {
          const sizeCls =
            block.level === 1
              ? 'text-base font-bold'
              : block.level === 2
                ? 'text-[15px] font-bold'
                : 'text-sm font-semibold';
          return (
            <div key={idx} className={`${sizeCls} pt-1`}>
              {renderInlineSegments(block.text)}
            </div>
          );
        }

        if (block.type === 'math') {
          return (
            <div
              key={idx}
              className="yt-math-block rounded-lg border px-3 py-2"
              style={{
                backgroundColor: 'var(--yt-bg-elevated)',
                borderColor: 'var(--yt-border)',
              }}
              dangerouslySetInnerHTML={{ __html: renderLatex(block.expr, true) }}
            />
          );
        }

        if (block.type === 'code') {
          return (
            <div
              key={idx}
              className="overflow-x-auto rounded-lg border"
              style={{
                backgroundColor: 'var(--yt-bg-elevated)',
                borderColor: 'var(--yt-border)',
              }}
            >
              {block.lang && (
                <div
                  className="border-b px-3 py-1 text-[11px] font-medium uppercase tracking-wide"
                  style={{ borderColor: 'var(--yt-border)', color: 'var(--yt-text-muted)' }}
                >
                  {block.lang}
                </div>
              )}
              <pre
                className="m-0 overflow-x-auto p-3 text-xs leading-5"
                style={{ fontFamily: 'var(--yt-font-mono)' }}
              >
                <code>{block.code}</code>
              </pre>
            </div>
          );
        }

        if (block.type === 'table') {
          return (
            <div key={idx} className="overflow-x-auto">
              <table>
                <thead>
                  <tr>
                    {block.headers.map((h, hIdx) => (
                      <th key={hIdx}>{renderInlineSegments(h)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {block.rows.map((row, rIdx) => (
                    <tr key={rIdx}>
                      {row.map((cell, cIdx) => (
                        <td key={cIdx}>{renderInlineSegments(cell)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }

        if (block.type === 'list') {
          const ListTag = block.ordered ? 'ol' : 'ul';
          return (
            <ListTag
              key={idx}
              className={`space-y-1 pl-5 ${block.ordered ? 'list-decimal' : 'list-disc'}`}
            >
              {block.items.map((item, iIdx) => (
                <li key={iIdx}>{renderInlineSegments(item)}</li>
              ))}
            </ListTag>
          );
        }

        return (
          <p key={idx} className="whitespace-pre-wrap">
            {renderInlineSegments(block.text)}
          </p>
        );
      })}
    </div>
  );
}
