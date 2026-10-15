"""Build reviewed sample-exam suites, references and the shared coverage catalog."""
import hashlib
import json
from pathlib import Path

from backend.paths import PROJECT_ROOT as ROOT, MARKING_DIR


def case(name, expected, **fields):
    return {"name": name, "expected": expected, "marks": 0, **fields}


def literal_cases(value):
    import ast
    return [case("answer_value", value, check="value", expected_literal=value, input="Submitted answer value"),
            case("answer_type", type(ast.literal_eval(value)).__name__, check="type", expected_literal=value, input="Submitted answer type (including list element types)")]


def completion_cases():
    inputs = [([1, 3, 5], 5, True), ([4, 1, 3], 3, False), ([5, 1, 3], 5, True), ([1, 3, 5], 2, False), ([7], 7, True), ([7], 2, False), ([-5, -2, -3], -3, False), ([2, 6, 4], 4, False)]
    return [case(f"completion_{index + 1}", expected, args=[nums, query]) for index, (nums, query, expected) in enumerate(inputs)]


def optimal_words(board, values):
    """Enumerate orthogonal paths; accept tied words without choosing one spelling."""
    paths = []
    for r, row in enumerate(board):
        for c, char in enumerate(row):
            for dr, dc in ((0, 1), (0, -1), (1, 0), (-1, 0)):
                r1, c1 = r + dr, c + dc
                if not (0 <= r1 < len(board) and 0 <= c1 < len(row)):
                    continue
                for er, ec in ((0, 1), (0, -1), (1, 0), (-1, 0)):
                    r2, c2 = r1 + er, c1 + ec
                    if 0 <= r2 < len(board) and 0 <= c2 < len(row):
                        word = char + board[r1][c1] + board[r2][c2]
                        paths.append((sum(values[ch] for ch in word), word, (r2, c2) != (r, c)))
    best = max(score for score, _, _ in paths)
    # Do not create a test that depends on the unstated tile-reuse policy.
    assert best == max(score for score, _, distinct in paths if distinct)
    accepted = {word for score, word, _ in paths if score == best}
    return best, sorted(accepted)


def build():
    sample = json.loads((ROOT / "frontend/public/demo/sample-exam.json").read_text())
    questions = [q for q in sample["answers"]["preview"]["questions"] if not q["instruction"]]
    expected_ids = [str(n) for n in range(3081158, 3081201) if n not in {3081167, 3081172, 3081177, 3081183, 3081193, 3081197}]
    if [q["id"] for q in questions] != expected_ids:
        raise ValueError("The sample question IDs/order changed. Review the authored test mapping before rebuilding.")
    for filename, expected_hash in sample["sourceHashes"].items():
        if hashlib.sha256((ROOT / "data/samples" / filename).read_bytes()).hexdigest() != expected_hash:
            raise ValueError(f"Source file changed: {filename}. Review the authored test cases before rebuilding.")
    config, reference = {}, {}
    expressions = ["5", "'Pyho'", "[20, 30]", "{3}", "'HELLO WORLD'", "[1, 2, 1, 2, 1, 2]", "11.0", "'0b10101'", "[1, 2, 0, 1]"]
    for n, value in enumerate(expressions, 1):
        config[n] = {"mode": "literal-answer", "cases": literal_cases(value)}
        reference[n] = value
    assignments = {
        10: ("has_zero", "has_zero = any(x == 0 for x in values)", "values", [([], False), ([0], True), ([1, 2, 3], False), ([1, 0, 2], True), ([-2, 0, -1, 0], True), ([-4, -2], False)]),
        11: ("t", "t = s.replace(' ', '-')", "s", [("", ""), ("hello world", "hello-world"), (" a  b ", "-a--b-"), ("a\tb\nc", "a\tb\nc"), ("a\u00a0b", "a\u00a0b"), ("already-hyphenated", "already-hyphenated")]),
        12: ("swapped", "swapped = {v: k for k, v in data.items()}", "data", [({}, {}), ({"a": 1}, {1: "a"}), ({"a": 1, "b": 2}, {1: "a", 2: "b"}), ({1: "a", 2: "b"}, {"a": 1, "b": 2}), ({"left": -2, "right": 0}, {-2: "left", 0: "right"}), ({"a": (1, 2), "b": (3, 4)}, {(1, 2): "a", (3, 4): "b"})]),
        13: ("secure_pw", "secure_pw = ''.join('*' if c.lower() in 'aeiou' else c for c in password)", "password", [("", ""), ("aeiou", "*****"), ("AEIOU", "*****"), ("PaSsW0rd!", "P*SsW0rd!"), ("rhythm 123", "rhythm 123"), ("Hello World", "H*ll* W*rld"), ("éY", "éY")]),
    }
    for n, (target, code, variable, inputs) in assignments.items():
        cases = [case("one_assignment_statement", True, check="structure", input=f"One assignment to {target}")]
        cases.extend(case(f"assignment_{i + 1}", repr(expected), expected_literal=repr(expected), context_literals={variable: repr(value)}, input=f"{variable} = {value!r}") for i, (value, expected) in enumerate(inputs))
        config[n] = {"mode": "assignment", "target": target, "strict_types": True, "cases": cases}
        reference[n] = code
    lines = ["has_query = False", "if query == nums[i]:", "index = i", "for j in range(index):", "return has_query and is_larger_than_previous"]
    for n, slot, line in zip(range(18, 23), "ABCDE", lines):
        config[n] = {"mode": "completion", "slot": slot, "entry": "larger_than_previous", "strict_types": True, "cases": completion_cases()}
        reference[n] = line
    for n, value in ((23, "[]"), (24, "['application']"), (25, "[]"), (26, "['beginning']")):
        config[n] = {"mode": "literal-answer", "cases": literal_cases(value)}
        reference[n] = value
    config[28] = {"mode": "counterexample", "cases": [case("reveals_a_further_bug", "Different actual and required outputs after the Q27 slicing fix", input="Your example call, with the slicing error already repaired")]}
    reference[28] = "match_prefix('App', ['app'])"
    existing = json.loads((MARKING_DIR / "questions/canvas-3081194/cases.yaml").read_text())
    config[32] = {key: value for key, value in existing.items() if key not in {"question_key", "title"}}
    config[32]["mode"] = "function"
    reference[32] = "def similarity(board, char):\n    return sum(row.count(char) for row in board)\n"
    boards33 = [
        ("provided_unique_winner", [["A", "B", "C"], ["D", "E", "F"], ["A", "B", "B"]], "B"),
        ("provided_alphabetical_tie", [["A", "B", "C"]] * 3, "A"),
        ("tie_not_first_seen", [["Z", "A"], ["A", "Z"]], "A"),
        ("all_same_letter", [["Q", "Q"], ["Q", "Q"]], "Q"),
        ("winner_in_last_row", [["A", "B", "C"], ["D", "E", "F"], ["Z", "Z", "Z"]], "Z"),
        ("three_way_tie", [["C", "B", "A"], ["A", "C", "B"]], "A"),
        ("rectangular_board", [["M", "N", "N", "N"], ["M", "M", "M", "N"]], "M"),
    ]
    config[33] = {"mode": "function", "entry": "most_common_letter", "strict_types": True, "cases": [case(name, expected, args=[board]) for name, board, expected in boards33]}
    reference[33] = "from collections import Counter\ndef most_common_letter(board):\n    counts = Counter(c for row in board for c in row)\n    return min(counts, key=lambda c: (-counts[c], c))\n"
    boards34 = [
        ("provided_AAA", [["A", "B", "C"]] * 3, {"A": 7, "B": 1, "C": 5}),
        ("provided_CCC", [["A", "B", "B"], ["B", "B", "B"], ["C", "C", "C"]], {"A": 7, "B": 1, "C": 5}),
        ("smallest_board_ties", [["A", "B"], ["B", "A"]], {"A": 1, "B": 1}),
        ("diagonal_is_not_a_neighbour", [["Z", "A", "Z"], ["A", "Z", "A"], ["Z", "A", "Z"]], {"Z": 9, "A": 1}),
        ("all_same_letter", [["Q", "Q"], ["Q", "Q"]], {"Q": 4}),
        ("rectangular_edges", [["A", "A", "A", "B"], ["B", "B", "B", "B"]], {"A": 8, "B": 1}),
        ("letter_values_not_alphabetical", [["Z", "Z", "Z"], ["A", "A", "A"]], {"Z": 1, "A": 9}),
    ]
    cases34 = []
    for name, board, values in boards34:
        score, accepted = optimal_words(board, values)
        cases34.append(case(name, f"Any legal three-letter word scoring {score}", args=[board, values], accepted=accepted))
    config[34] = {"mode": "function", "entry": "best_word", "strict_types": True, "cases": cases34}
    reference[34] = '''def best_word(board, values):
    paths = []
    for r, row in enumerate(board):
        for c, char in enumerate(row):
            for dr, dc in ((0, 1), (0, -1), (1, 0), (-1, 0)):
                r1, c1 = r + dr, c + dc
                if not (0 <= r1 < len(board) and 0 <= c1 < len(row)):
                    continue
                for er, ec in ((0, 1), (0, -1), (1, 0), (-1, 0)):
                    r2, c2 = r1 + er, c1 + ec
                    if 0 <= r2 < len(board) and 0 <= c2 < len(row):
                        word = char + board[r1][c1] + board[r2][c2]
                        paths.append((sum(values[x] for x in word), word))
    return max(paths)[1]
'''
    config[36] = {"mode": "text-answer", "cases": [case("recursive_output", "1010", input="The returned string from my_func(4)")]}
    reference[36] = "'1010'"
    manual = {
        **{n: ("The supplied CSV omits the choices and the rubric supplies no option answer key. Review the original Canvas result; do not infer a key from student answers.", ["Confirm selected options against the original Canvas question/key.", "Keep the original source score separate from confirmed marks."]) for n in range(14, 18)},
        27: ("The answer identifies an original line and a replacement, often in prose. Compare both with the rubric; a code-only runner cannot assess that explanation fairly.", ["Identify word_prefix = word[:len(query)-1].", "Check a replacement that retains the full prefix, such as word[:len(query)].", "Review alternative fixes and partial credit manually."]),
        29: ("This trace depends on the student's own Q28 example. The runner must not assume a fixed call or ignore the required type/explanation.", ["Read this student's Q28 call.", "Verify the actual value and type, then the intended value and type.", "Account for the slicing bug when tracing the original function."]),
        30: ("Either remaining error can be fixed, depending on Q28–29. A prose line-and-replacement answer needs contextual review.", ["For query case: compare query.lower() with the lowercased prefix.", "For absent matches: return None instead of an empty list.", "Check that the named line and full replacement agree with the student's earlier answer."]),
        31: ("This asks for the other error in one sentence, depending on the student's earlier choices. No deterministic code test can assess the explanation.", ["Identify the remaining case-sensitivity or no-match-return bug.", "Confirm it was not the same bug already addressed in Q28–30."]),
        35: ("This explanation and relevant hiring example require human rubric judgment. Keyword presence is not evidence of a correct argument.", ["Explain how historical/training-data bias can carry into recommendations.", "Evaluate the relevance and accuracy of the hiring-domain example."]),
        37: ("The suitability and explanation of Monte Carlo simulation require human rubric judgment; multiple examples can be valid.", ["Identify a suitable problem.", "Explain the role of randomness or uncertainty.", "Describe repeated random sampling over many trials and interpretation of results."]),
    }
    catalog = []
    references = MARKING_DIR / "reference_answers"
    references.mkdir(exist_ok=True)
    for n, question in enumerate(questions, 1):
        qid = question["id"]
        entry = {"questionKey": f"canvas:{qid}", "questionNumber": n, "questionType": sample["questionTypes"][qid], "title": f"Q{n}", "automated": n in config}
        if n in config:
            suite = {"question_key": entry["questionKey"], "title": f"Q{n} · {entry['questionType']}", "source": "Supplied sample CSV question and DOCX marking guide; see sample-test-coverage.md", **config[n]}
            directory = MARKING_DIR / "questions" / f"canvas-{qid}"
            directory.mkdir(exist_ok=True)
            (directory / "cases.yaml").write_text(json.dumps(suite, ensure_ascii=False, indent=2) + "\n")
            (references / f"canvas-{qid}.py").write_text(reference[n] + "\n")
            entry.update(caseCount=len(suite["cases"]), mode=suite["mode"], note="Automated checks provide evidence only; confirm the final rubric mark yourself.")
            if n == 4:
                entry["note"] += " The CSV omits the operator; the DOCX specifies set intersection (&)."
            if 18 <= n <= 22:
                entry["note"] += " Your line is inserted into the supplied function, with the other four lines completed."
            if n == 28:
                entry["note"] += " Enter a literal match_prefix(...) call. This check isolates the two remaining bugs after the Q27 slicing fix."
            if n == 34:
                entry["note"] += " Orthogonal neighbours only; any optimal tied word is accepted. These cases do not enforce a tile-reuse policy; the highest score is the same with or without reuse."
        else:
            reason, checklist = manual[n]
            entry.update(caseCount=0, mode="manual", note=reason, checklist=checklist)
        catalog.append(entry)
    source = ROOT / "data/samples/final-2025s1-marking-rubric (guide) to be updated.docx"
    output = {"schemaVersion": 1, "rubricSha256": hashlib.sha256(source.read_bytes()).hexdigest(), "questions": catalog}
    (MARKING_DIR / "questions/sample-exam.json").write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n")
    print(f"Configured {len(config)} automated question suites ({sum(len(c['cases']) for c in config.values())} checks), {len(manual)} human-review entries.")


if __name__ == "__main__":
    build()
