/** Split presentation only: preserve source wording, decimals, units and notation. */
export function notePoints(text: string): string[] {
  if (/```|\$\$|\\\[/.test(text)) return text.trim() ? [text.trim()] : [];
  const blocks = text.split(/\r?\n/).map(s => s.trim().replace(/^[-•]\s+/, "")).filter(Boolean);
  return blocks.flatMap(block => {
    // Formula blocks and Markdown remain intact for the math renderer.
    if (/[`$]|\\[([]/.test(block)) return [block];
    const result: string[] = [];
    let start = 0, depth = 0;
    for (let i = 0; i < block.length; i++) {
      if ("([{".includes(block[i])) depth++;
      if (")]}".includes(block[i])) depth = Math.max(0, depth - 1);
      if (depth || !/[.!?;]/.test(block[i]) || !/\s/.test(block[i+1] || "")) continue;
      const prefix = block.slice(start, i+1);
      if (/(?:\b(?:e\.g|i\.e|Mr|Dr|Prof|Fig|Eq|No|vs|etc)|\b[A-Z])\.$/i.test(prefix)) continue;
      // Only sentence/statement boundaries, never numeric decimal points.
      result.push(prefix.trim()); start = i+1;
    }
    const remainder = block.slice(start).trim();
    if (remainder) result.push(remainder);
    return result;
  });
}
