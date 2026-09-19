// Minimal escape-first markdown renderer for AI chat output. Covers the
// subset LLMs actually emit: fenced code, inline code, bold/italic, headings,
// lists, links, blockquotes, hr. All input is HTML-escaped before any tags
// are generated, so the output is safe for innerHTML/dangerouslySetInnerHTML.
// ponytail: no tables/nesting — if real GFM fidelity is ever needed, swap in
// marked+DOMPurify behind this same function signature.

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ESC[c]);

function inline(s: string): string {
  let out = esc(s);
  out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  out = out.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  return out;
}

export function renderMarkdown(src: string): string {
  const lines = src.replace(/\r\n?/g, '\n').split('\n');
  const html: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === '') { i++; continue; }

    if (/^```/.test(line)) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
      i++;
      html.push(`<pre><code>${esc(buf.join('\n'))}</code></pre>`);
      continue;
    }

    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      const lv = h[1].length;
      html.push(`<h${lv}>${inline(h[2])}</h${lv}>`);
      i++;
      continue;
    }

    if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) { html.push('<hr />'); i++; continue; }

    if (/^>/.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^>/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, ''));
      html.push(`<blockquote>${inline(buf.join(' '))}</blockquote>`);
      continue;
    }

    const li = line.match(/^\s*(?:[-*+]|\d+\.)\s+(.*)$/);
    if (li) {
      const ordered = /^\s*\d+\./.test(line);
      const buf: string[] = [];
      while (i < lines.length) {
        const m = lines[i].match(/^\s*(?:[-*+]|\d+\.)\s+(.*)$/);
        if (!m) break;
        buf.push(`<li>${inline(m[1])}</li>`);
        i++;
      }
      html.push(ordered ? `<ol>${buf.join('')}</ol>` : `<ul>${buf.join('')}</ul>`);
      continue;
    }

    const buf: string[] = [];
    while (
      i < lines.length && lines[i].trim() !== '' && !/^(```|#{1,4}\s|>| {0,3}(?:[-*+]|\d+\.)\s)/.test(lines[i])
    ) {
      buf.push(lines[i++]);
    }
    html.push(`<p>${inline(buf.join(' '))}</p>`);
  }

  return html.join('\n');
}
