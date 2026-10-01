# Runs every question's code snippet with the Python interpreter running this
# script, and compares the real output with the stored answer. Called by
# scripts/verifyQuestions.js (`npm run verify-questions`) once per available
# Python version; prints one JSON object with the results.
#
# Usage: python3 verify_questions.py <questions.json> <work dir>
#
# Each snippet runs in its own subprocess, in its own empty working folder
# (some snippets write files), with a timeout. This EXECUTES the snippets:
# run it only on trusted question data, such as the seed file.
#
# Comparison rules (the same ones the stored answers are written to):
#   - Output is compared with whitespace collapsed, because answers write
#     multi-line output on one line ("P J C" for three printed lines).
#   - If the snippet raises, the answer must be an error option: a generic
#     "Error"/"Type error", or one naming the exception type or quoting its
#     message.
#   - Another option that also equals the real output is reported too, since
#     it makes the question ambiguous.
# Must stay compatible with the minimum Python version (3.9).
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile

# Per snippet; PYQUIZ_SNIPPET_TIMEOUT overrides it (the tests use a short one).
TIMEOUT_SECONDS = int(os.environ.get('PYQUIZ_SNIPPET_TIMEOUT', '10'))
GENERIC_ERRORS = {'error', 'type error'}

# Runs one snippet; reports an uncaught exception on stderr as JSON, because
# a snippet may redirect sys.stdout.
HARNESS = r'''
import json, sys
try:
    exec(compile(sys.argv[1], "<question>", "exec"), {"__name__": "__main__"})
except Exception as e:
    try:
        sys.stdout.flush()
    except Exception:
        pass
    sys.__stderr__.write("\n__PYQUIZ_EXCEPTION__" + json.dumps({"type": type(e).__name__, "message": str(e)}) + "\n")
'''


def norm(text):
    return re.sub(r'\s+', ' ', text).strip()


def run_snippet(code, work_dir):
    folder = tempfile.mkdtemp(dir=work_dir)
    try:
        proc = subprocess.run(
            [sys.executable, '-c', HARNESS, code],
            cwd=folder, capture_output=True, text=True, timeout=TIMEOUT_SECONDS,
        )
    except subprocess.TimeoutExpired:
        return None, None, 'timed out after %d s' % TIMEOUT_SECONDS
    finally:
        shutil.rmtree(folder, ignore_errors=True)
    exc = None
    marker = '__PYQUIZ_EXCEPTION__'
    if marker in proc.stderr:
        exc = json.loads(proc.stderr.split(marker, 1)[1].strip().splitlines()[0])
    elif proc.returncode != 0:
        return None, None, 'exited with code %d: %s' % (proc.returncode, proc.stderr.strip()[-300:])
    return proc.stdout, exc, None


def error_answer_matches(answer, exc):
    a = answer.strip()
    if a.lower() in GENERIC_ERRORS:
        return True
    if exc['type'] in a:
        return True
    if exc['type'].replace('Error', ' error').strip().lower() == a.lower():
        return True
    quoted = norm(a).rstrip('.')
    return bool(quoted) and quoted in exc['message']


def check(question, work_dir):
    code = question.get('code') or ''
    answer = question['answer']
    if not code.strip():
        return {'ok': True, 'skipped': 'no code'}
    stdout, exc, problem = run_snippet(code, work_dir)
    if problem:
        return {'ok': False, 'reason': problem}
    if exc:
        actual = '%s: %s' % (exc['type'], exc['message'])
        if norm(stdout):
            actual = norm(stdout) + ' | then ' + actual
        if error_answer_matches(answer, exc):
            return {'ok': True}
        return {'ok': False, 'reason': 'raised an error, but the answer is not an error option',
                'expected': answer, 'actual': actual}
    actual = norm(stdout)
    others = [o for o in question['options'] if o != answer and norm(o) == actual]
    if norm(answer) != actual:
        return {'ok': False, 'reason': 'output differs from the answer', 'expected': answer, 'actual': actual,
                'matchingOptions': others}
    if others:
        return {'ok': False, 'reason': 'another option also equals the output', 'expected': answer,
                'actual': actual, 'matchingOptions': others}
    return {'ok': True}


def main():
    questions = json.load(open(sys.argv[1], encoding='utf-8'))
    work_dir = sys.argv[2]
    os.makedirs(work_dir, exist_ok=True)
    results = []
    for index, question in enumerate(questions, 1):
        result = check(question, work_dir)
        result.update({'index': index, 'question': question.get('question', ''), 'code': question.get('code', '')})
        results.append(result)
    print(json.dumps({'version': sys.version.split()[0], 'results': results}))


if __name__ == '__main__':
    main()
