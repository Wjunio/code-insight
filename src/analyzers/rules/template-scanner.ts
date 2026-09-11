export interface HtmlAttribute { name: string; value: string | null }
export interface HtmlElement { name: string; attributes: HtmlAttribute[]; offset: number }

/** Lexical template scanner. Attribute values are consumed as a whole, never as markup. */
export function* scanElements(content: string): Generator<HtmlElement> {
  const tokens = /<!--[\s\S]*?(?:-->|$)|\{\{[\s\S]*?\}\}|<([a-z][\w:.-]*)(?=[\s/>])((?:[^>"']|"[^"]*"|'[^']*')*)>/gi;
  for (let match = tokens.exec(content); match; match = tokens.exec(content)) {
    if (!match[1]) continue;
    const name = match[1].toLowerCase();
    const attributes: HtmlAttribute[] = [];
    const attrPattern = /([^\s=<>"'/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
    for (const attr of (match[2] ?? '').replace(/\/\s*$/, '').matchAll(attrPattern)) {
      if (attr[1]) attributes.push({ name: attr[1], value: attr[2] ?? attr[3] ?? attr[4] ?? null });
    }
    yield { name, attributes, offset: match.index };
    if (['script', 'style', 'textarea', 'title'].includes(name) && !/\/\s*>$/.test(match[0])) {
      const end = new RegExp(`</${name}\\s*>`, 'gi');
      end.lastIndex = tokens.lastIndex;
      const closing = end.exec(content);
      if (!closing) return;
      tokens.lastIndex = end.lastIndex;
    }
  }
}
