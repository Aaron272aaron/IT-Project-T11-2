// PDF text has visual lines rather than Word paragraphs. Preserve rubric markers
// and bullet boundaries while joining wrapped continuations on the same page.
type TextItem = {
  str: string;
  hasEOL: boolean;
  height: number;
  transform: number[];
};
export function pdfRubricParagraphs(items: unknown[]): string[] {
  const lines: { text: string; y: number; height: number }[] = [];
  let text = "",
    y = 0,
    height = 0;
  const flush = () => {
    if (text.trim()) lines.push({ text: text.trim(), y, height });
    text = "";
    height = 0;
  };
  for (const raw of items) {
    if (!raw || typeof raw !== "object" || !("str" in raw)) continue;
    const item = raw as TextItem;
    if (item.str.trim()) {
      if (!text.trim()) y = item.transform[5];
      height = Math.max(height, item.height);
      text += item.str + " ";
    }
    if (item.hasEOL) flush();
  }
  flush();
  const paragraphs: string[] = [];
  const marker =
    /^(?:\+\s*\d|[•●▪\uf0b7]|(?:Q|Question\s+)\d|Part\s+\d|Rubric\s*:|Marks\b|Solution\b)/i;
  for (let i = 0; i < lines.length; i++) {
    const current = lines[i],
      previous = lines[i - 1];
    const wrapped =
      previous &&
      previous.y > current.y &&
      previous.y - current.y <=
        Math.max(previous.height, current.height) * 1.65;
    const heading =
      previous && /(?:[:：]$|^Marks for each)/i.test(previous.text);
    if (wrapped && !marker.test(current.text) && !heading && paragraphs.length)
      paragraphs[paragraphs.length - 1] += " " + current.text;
    else paragraphs.push(current.text);
  }
  return paragraphs;
}
