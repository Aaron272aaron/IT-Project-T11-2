"""Run trusted function cases against code inside the isolated container."""
import os
from pathlib import Path
import pytest
import yaml
from evaluate import evaluate, AnswerFormatError

spec = yaml.safe_load(Path(os.environ['CASES']).read_text())

def display_value(value):
    return repr(value)[:4000]

@pytest.mark.parametrize('case', spec['cases'], ids=lambda c: c['name'])
def test_case(case, record_property):
    try:
        source = Path('/submission/submission.py').read_text(encoding='utf-8')
        actual, passed = evaluate(source, spec, case)
        record_property('actual', display_value(actual))
        assert passed
    except SyntaxError as error:
        record_property('error_kind', 'syntax_error')
        record_property('error_detail', f'{error.msg} (line {error.lineno})')
        raise
    except AnswerFormatError as error:
        record_property('error_kind', 'answer_format')
        record_property('error_detail', str(error))
        raise
    except AttributeError as error:
        record_property('error_kind', 'missing_function' if str(error).startswith("module 'student_submission'") else 'runtime_error')
        record_property('error_detail', str(error)[:500])
        raise
    except AssertionError:
        record_property('error_kind', 'wrong_output')
        record_property('error_detail', 'This check did not match the reference. Review the original answer and rubric before marking.')
        raise
    except Exception as error:
        record_property('error_kind', 'runtime_error')
        record_property('error_detail', f'{type(error).__name__}: {str(error)[:500]}')
        raise
