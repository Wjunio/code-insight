import ts from 'typescript';
import type { Template } from '../analyzers/rules/rule-types';

/** Map cooked literal characters back to TS offsets, including escapes and CRLF. */
export function inlineTemplate(node: ts.StringLiteralLike, file: string): Template {
  const sourceText = node.getSourceFile().text;
  const start = node.getStart() + 1;
  const raw = sourceText.slice(start, node.getEnd() - 1);
  const sourceOffsets: number[] = [];
  for (let i = 0; i < raw.length;) {
    const offset = start + i;
    if (raw[i] === '\\') {
      const escape = /^\\(?:\r\n|[\r\n]|u\{[\da-fA-F]+\}|u[\da-fA-F]{4}|x[\da-fA-F]{2}|[\s\S])/.exec(raw.slice(i))?.[0] ?? '\\';
      const scanner = ts.createScanner(ts.ScriptTarget.Latest, false, ts.LanguageVariant.Standard, `"${escape}"`);
      scanner.scan();
      for (let j = 0; j < scanner.getTokenValue().length; j++) sourceOffsets.push(offset);
      i += escape.length;
    } else {
      sourceOffsets.push(offset);
      i += raw[i] === '\r' && raw[i + 1] === '\n' ? 2 : 1;
    }
  }
  return { file, content: node.text, sourceText, sourceOffsets };
}
