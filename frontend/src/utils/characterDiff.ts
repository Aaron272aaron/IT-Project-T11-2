import { diffChars, type Change } from "diff";

type DiffPart = { value: string; changed: boolean };
export type CharacterDiffLine = {
  prefix: string;
  heading: boolean;
  parts: DiffPart[];
};

// Keep line layout intact while colouring only changed characters on each side.
function sideLines(changes: Change[], added: boolean): DiffPart[][] {
  const rows: DiffPart[][] = [[]];
  for (const change of changes) {
    if (added ? change.removed : change.added) continue;
    change.value.split("\n").forEach((value, index) => {
      if (index) rows.push([]);
      if (value)
        rows[rows.length - 1].push({
          value,
          changed: !!(change.added || change.removed),
        });
    });
  }
  return rows;
}

export function characterDiffLines(patch: string[]): CharacterDiffLine[] {
  const result: CharacterDiffLine[] = [];
  for (let index = 0; index < patch.length;) {
    const line = patch[index];
    const heading = /^(--- |\+\+\+ |@@)/.test(line);
    if (heading || !/^[+-]/.test(line)) {
      result.push({
        prefix: "",
        heading,
        parts: [{ value: line, changed: false }],
      });
      index++;
      continue;
    }
    const removed: string[] = [];
    const added: string[] = [];
    const order: boolean[] = [];
    while (
      index < patch.length &&
      /^[+-]/.test(patch[index]) &&
      !/^(--- |\+\+\+ )/.test(patch[index])
    ) {
      const addition = patch[index][0] === "+";
      order.push(addition);
      (addition ? added : removed).push(patch[index].slice(1));
      index++;
    }
    const changes = diffChars(removed.join("\n"), added.join("\n"));
    const oldRows = sideLines(changes, false);
    const newRows = sideLines(changes, true);
    let oldIndex = 0;
    let newIndex = 0;
    for (const addition of order) {
      result.push({
        prefix: addition ? "+" : "-",
        heading: false,
        parts: addition ? newRows[newIndex++] : oldRows[oldIndex++],
      });
    }
  }
  return result;
}
