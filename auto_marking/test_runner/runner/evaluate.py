"""Trusted case adapters. Executable submissions run only in the Docker runner."""
import ast
import copy
import re
import textwrap


class AnswerFormatError(ValueError):
    pass


TYPE_NAMES = {"integer": "int", "int": "int", "float": "float", "string": "str", "str": "str", "list": "list", "set": "set", "tuple": "tuple", "dictionary": "dict", "dict": "dict", "boolean": "bool", "bool": "bool", "nonetype": "NoneType"}


def parse_answer(source):
    """Read literal outputs and optional type annotations without executing them."""
    value_text = source.strip().translate(str.maketrans({"‘": "'", "’": "'", "“": '"', "”": '"'}))
    declared = None
    # A trailing type is recognized only outside an otherwise complete literal.
    match = re.fullmatch(r"(.+?)(?:\s*,\s*|\s+)(integer|int|float|string|str|list|set|tuple|dictionary|dict|boolean|bool|NoneType)", value_text, re.I | re.S)
    if match:
        try:
            ast.literal_eval(match[1])
        except (ValueError, SyntaxError):
            pass
        else:
            value_text, declared = match[1], TYPE_NAMES[match[2].lower()]
    try:
        value = ast.literal_eval(value_text)
        inferred = type(value).__name__
    except (ValueError, SyntaxError):
        # An unquoted string may supply value evidence; its type stays ambiguous.
        value, inferred = value_text, None
    return value, inferred, declared


def same_value(actual, expected):
    if isinstance(actual, bool) or isinstance(expected, bool):
        return type(actual) is type(expected) and actual == expected
    return actual == expected


def same_types(actual, expected):
    if type(actual) is not type(expected):
        return False
    if isinstance(expected, (list, tuple)):
        return len(actual) == len(expected) and all(same_types(a, b) for a, b in zip(actual, expected))
    if isinstance(expected, dict):
        return len(actual) == len(expected) and all(any(same_types(ak, ek) and ak == ek and same_types(av, ev) for ak, av in actual.items()) for ek, ev in expected.items())
    if isinstance(expected, set):
        return len(actual) == len(expected) and all(any(same_types(a, e) and a == e for a in actual) for e in expected)
    return True


def literal_evidence(source, case):
    value, inferred, declared = parse_answer(source)
    expected = ast.literal_eval(case["expected_literal"])
    if case["check"] == "type":
        matches = inferred is not None and same_types(value, expected) and (declared is None or declared == type(expected).__name__)
        actual = inferred or "Type unclear: the answer is not an unambiguous literal"
        if declared:
            actual += f" (declared {declared})"
        return actual, matches
    return value, same_value(value, expected)


COMPLETION = """def larger_than_previous(nums, query):
    {A}
    index = 0
    for i in range(len(nums)):
        {B}
            has_query = True
            {C}
            break
    is_larger_than_previous = True
    {D}
        if nums[j] > query:
            is_larger_than_previous = False
    {E}
"""
LINES = {"A": "has_query = False", "B": "if query == nums[i]:", "C": "index = i", "D": "for j in range(index):", "E": "return has_query and is_larger_than_previous"}


def assigned_names(source):
    """Plain variable names assigned at top level, in source order."""
    names = []
    for node in ast.parse(source).body:
        if isinstance(node, ast.Assign):
            targets = node.targets
        elif isinstance(node, (ast.AnnAssign, ast.AugAssign)):
            targets = [node.target]
        else:
            continue
        names += [target.id for target in targets if isinstance(target, ast.Name)]
    return names


def one_assignment(source, target):
    """Return (passed, detail) so a different variable name is reported, not hidden."""
    tree = ast.parse(source)
    if len(tree.body) != 1 or not isinstance(tree.body[0], (ast.Assign, ast.AnnAssign)):
        return False, "Not exactly one assignment statement"
    node = tree.body[0]
    targets = node.targets if isinstance(node, ast.Assign) else [node.target]
    if len(targets) != 1 or not isinstance(targets[0], ast.Name):
        return False, "Assignment must target a single variable name"
    if targets[0].id != target:
        return False, f"One assignment, but to {targets[0].id!r} instead of {target!r}"
    return True, True


def assignment_value(source, namespace, target, context_names):
    """Single assignment questions: use the expected name, else the student's one new variable."""
    names = assigned_names(source)
    if target in names:
        return namespace[target]
    fresh = list(dict.fromkeys(name for name in names if name not in context_names))
    candidates = fresh or list(dict.fromkeys(names))
    if len(candidates) == 1:
        return namespace[candidates[0]]
    found = f"; found {', '.join(candidates)}" if candidates else ""
    raise AnswerFormatError(f"Expected an assignment to {target}{found}.")


def match_prefix(query, words, *, fixed):
    if fixed:
        found = [word for word in words if word.lower().startswith(query.lower())]
        return found or None
    # Isolate the two further bugs after fixing the slicing bug from Q27.
    if words:
        found = [word for word in words if query == word[:len(query)].lower()]
        return found
    return None


def evaluate(source, spec, case):
    """Return (displayed actual value, pass/fail) for one trusted case."""
    mode = spec.get("mode", "function")
    if mode == "literal-answer":
        return literal_evidence(source, case)
    if mode == "text-answer":
        value, _, _ = parse_answer(source)
        actual = str(value) if type(value) in (str, int) else source.strip()
        return actual, actual == case["expected"]
    if mode == "counterexample":
        tree = ast.parse(source.strip(), mode="eval").body
        if not isinstance(tree, ast.Call) or not isinstance(tree.func, ast.Name) or tree.func.id != "match_prefix" or len(tree.args) != 2 or tree.keywords:
            raise AnswerFormatError("Enter one match_prefix(query, words) call with literal arguments; review prose manually.")
        query, words = (ast.literal_eval(node) for node in tree.args)
        if not isinstance(query, str) or not isinstance(words, list) or not all(isinstance(word, str) for word in words):
            raise AnswerFormatError("The example must supply a string query and a list of strings.")
        actual = match_prefix(query, words, fixed=False)
        correct = match_prefix(query, words, fixed=True)
        detail = f"After the Q27 slicing fix: {actual!r}; required result: {correct!r}"
        return detail, actual != correct
    namespace = copy.deepcopy(case.get("context", {}))
    namespace.update({key: ast.literal_eval(value) for key, value in case.get("context_literals", {}).items()})
    namespace["__name__"] = "student_submission"
    if mode == "assignment" and case.get("check") == "structure":
        passed, detail = one_assignment(source, spec["target"])
        if not passed:
            return detail, False
        actual = detail
    else:
        executable = source
        if mode == "completion":
            line = textwrap.dedent(source).strip()
            if len(line.splitlines()) != 1:
                raise AnswerFormatError("Enter the single missing code line; surrounding indentation is supplied by the question.")
            executable = COMPLETION.format(**{**LINES, spec["slot"]: line})
        context_names = set(namespace)
        exec(compile(executable, "<student-answer>", "exec"), namespace)
        if mode == "assignment":
            actual = assignment_value(source, namespace, spec["target"], context_names)
        else:
            function = namespace.get(spec["entry"])
            if not callable(function):
                raise AttributeError(f"module 'student_submission' has no attribute {spec['entry']!r}")
            actual = function(*copy.deepcopy(case["args"]))
    if "accepted" in case:
        return actual, type(actual) is str and actual in case["accepted"]
    expected = ast.literal_eval(case["expected_literal"]) if "expected_literal" in case else case["expected"]
    return actual, same_value(actual, expected) and (not spec.get("strict_types") or same_types(actual, expected))
