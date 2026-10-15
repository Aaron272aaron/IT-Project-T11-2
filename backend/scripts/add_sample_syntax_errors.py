"""Build a deterministic syntax-heavy fixture from the preserved original CSV."""
import ast
import csv
import json
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'data/samples/sample-exam-2000-students-original.csv'
OUTPUT = ROOT / 'sample-exam-2000-students.csv'


def break_syntax(code, variant):
    lines = code.splitlines()
    if variant == 0:
        lines[0] = lines[0].rstrip().removesuffix(':')
    elif variant == 1:
        lines[0] = lines[0].replace('):', ':', 1)
    elif variant == 2:
        lines[1] = lines[1].lstrip()
    elif variant == 3:
        lines[0] = lines[0].replace('):', ')):', 1)
    else:
        lines[0] = lines[0].replace('def ', 'def ', 1).replace('(', '[', 1)
    result = '\n'.join(lines)
    try:
        ast.parse(result)
    except SyntaxError:
        return result
    raise AssertionError('Mutation must produce a syntax error')


def main():
    with SOURCE.open(encoding='utf-8-sig', newline='') as handle:
        rows = list(csv.reader(handle))
    counts = Counter()
    labels = ['missing colon', 'missing closing parenthesis', 'missing indentation', 'extra parenthesis', 'wrong function bracket']
    for question in ('3081194', '3081195', '3081196'):
        col = next(i for i, header in enumerate(rows[0]) if header.startswith(question + ':'))
        valid = []
        for row in rows[1:]:
            try:
                ast.parse(row[col])
                if row[col].strip() and row[col] not in valid:
                    valid.append(row[col])
            except SyntaxError:
                pass
        assert valid
        for index, row in enumerate(rows[1:]):
            # Seven of each ten answers get one deliberate, repairable defect.
            if index % 10 < 7:
                try:
                    ast.parse(row[col])
                    base = row[col] if row[col].strip() else valid[index % len(valid)]
                except SyntaxError:
                    base = valid[index % len(valid)]
                variant = (index // 10 + index % 10) % len(labels)
                row[col] = break_syntax(base, variant)
                counts[labels[variant]] += 1
    with OUTPUT.open('w', encoding='utf-8-sig', newline='') as handle:
        csv.writer(handle).writerows(rows)
    print(json.dumps({'students': len(rows)-1, 'new_syntax_errors': dict(counts), 'size_bytes': OUTPUT.stat().st_size}, indent=2))

if __name__ == '__main__':
    main()
