export function extractTaggedBlocks(buffer: string, tag: string) {
  const openRe = new RegExp(`<${tag}\\b[^>]*>`, 'i');
  const closeRe = new RegExp(`</${tag}>`, 'i');
  const results: string[] = [];
  let openMatch = buffer.match(openRe);

  while (openMatch && openMatch.index !== undefined) {
    const start = openMatch.index;
    const openLen = openMatch[0].length;
    const afterOpen = start + openLen;
    const closeMatch = buffer.slice(afterOpen).match(closeRe);

    if (!closeMatch || closeMatch.index === undefined) break;

    const end = afterOpen + closeMatch.index;
    const content = buffer.slice(afterOpen, end).trim();

    if (content) results.push(content);

    const closeLen = closeMatch[0].length;
    buffer = buffer.slice(0, start) + buffer.slice(end + closeLen);
    openMatch = buffer.match(openRe);
  }

  return { results, buffer };
}
