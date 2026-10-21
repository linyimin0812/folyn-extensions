import { useLayoutEffect, useRef } from 'react';

/** Receives sanitized HTML only. Patch the existing DOM rather than replacing
 * innerHTML on each stream delta, preserving loaded images and unchanged text. */
export function StableHtml({ html }: { html: string }) {
    const ref = useRef<HTMLDivElement>(null);
    useLayoutEffect(() => {
        const root = ref.current;
        if (!root) return;
        const template = root.ownerDocument.createElement('template');
        template.innerHTML = html;
        // Keep native table layout for full-width columns; only the wrapper scrolls.
        template.content.querySelectorAll('table').forEach(table => {
            if (table.parentElement?.classList.contains('table-scroll')) return;
            const wrapper = root.ownerDocument.createElement('div');
            wrapper.className = 'table-scroll';
            table.before(wrapper); wrapper.append(table);
        });
        const images = new Map<string, HTMLImageElement[]>();
        root.querySelectorAll('img').forEach(image => {
            const key = image.getAttribute('src') || '';
            images.set(key, [...(images.get(key) || []), image]);
        });
        const compatible = (a: Node, b: Node) => a.nodeType === b.nodeType &&
            (a.nodeType !== Node.ELEMENT_NODE || (a as Element).tagName === (b as Element).tagName && (a as Element).namespaceURI === (b as Element).namespaceURI);
        const patch = (parent: Node, desired: Node) => {
            let cursor = parent.firstChild;
            for (const next of [...desired.childNodes]) {
                let current: Node | undefined;
                if (next.nodeType === Node.ELEMENT_NODE && (next as Element).tagName === 'IMG') {
                    current = images.get((next as Element).getAttribute('src') || '')?.shift();
                } else {
                    for (let candidate = cursor; candidate; candidate = candidate.nextSibling) {
                        if (compatible(candidate, next)) { current = candidate; break; }
                    }
                }
                current ||= next.cloneNode(false);
                if (current !== cursor) parent.insertBefore(current, cursor);
                if (current.nodeType === Node.ELEMENT_NODE) {
                    const element = current as Element, target = next as Element;
                    for (const attr of [...element.attributes]) {
                        if (!target.hasAttributeNS(attr.namespaceURI, attr.localName)) element.removeAttributeNS(attr.namespaceURI, attr.localName);
                    }
                    for (const attr of [...target.attributes]) {
                        if (element.getAttributeNS(attr.namespaceURI, attr.localName) !== attr.value)
                            element.setAttributeNS(attr.namespaceURI, attr.name, attr.value);
                    }
                    patch(current, next);
                } else if (current.nodeValue !== next.nodeValue) current.nodeValue = next.nodeValue;
                cursor = current.nextSibling;
            }
            while (cursor) {
                const next = cursor.nextSibling;
                parent.removeChild(cursor); cursor = next;
            }
        };
        patch(root, template.content);
    }, [html]);
    return <div ref={ref}/>;
}
