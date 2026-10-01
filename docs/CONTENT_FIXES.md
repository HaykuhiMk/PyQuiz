# Content fixes for the production questions

The questions to fix in the admin panel, by id, with what is wrong and what to change. They come
from the real-data audit of 2026-10-01 (`pyquiz_realcopy`, an exact copy of production after the
conversion), including the 10 from the "Before reopening the site" checklist in
`docs/DEPLOY_RUNBOOK.md`. Number references (#2, #54, …) are the reviewed topic proposals'
numbers; ids are what the admin panel shows.

**How to fix a question:** in **Manage Questions**, paste the id into **Find by id** and open it.
- **Options and answer:** the answer must be exactly one of the options, so change both together.
  Options must all be different.
- **Tags:** none of these questions has misconception tags, so no tag can be lost.
- **Checking afterwards:** export the questions (content only) to a JSON file in `tmp/` and run
  `cd backend && npm run verify-questions -- --file <that file>`. Only the questions still open
  in this list should be reported.

## The rule for answers

**The answer is everything the program shows when run:** its printed output in order, followed by
the error if one is raised (owner's decision). For "output, then error" there is one exact format:

```
<output> Error: <detail>
```

- **`<output>`** is everything printed before the error, written on one line (whitespace collapsed
  to single spaces, as all answers are). If nothing was printed, leave it out together with its
  space; that gives the existing `Error: <message>` convention.
- **`<detail>`** is the exception's message, exactly as Python 3.9 and 3.14 print it. Use the
  exception's **type name** instead (e.g. `StopIteration`, `TypeError`) when the message is
  empty, or when it differs between Python versions; the site promises answers that hold on 3.9
  and every newer version.
- **A wrong option must not equal the output printed before the error**: that's the option a
  learner who ignores the error would pick.

`npm run verify-questions` checks all of this. A snippet that raises **without printing anything**
may also keep the older error answers (`Error`, or one naming the exception type). They stay valid.

## 1. Before reopening the site (from the checklist)

| Id | Problem | Change |
|---|---|---|
| `67e2f3bff5addb214fc6a82d` | The option `'Box Magic'` appears twice (18 options). The admin form refuses to save the question until every option is different. The answer (`Box3D Magic`) is unaffected. | Replace one `'Box Magic'` with a different wrong option. |
| `67dd83578e2ddadc28e387f6` (#2) | Wrong answer: the code prints `foo` and then `main`, but the answer is `main`, and no option is `foo main`. | Add the option `foo main` and make it the answer (or change the code so it prints only `main`). |
| `67e2ba44f5addb214fc6a7ed` (#54) | The answer contains a memory address (`<generator object at 0x100> 1 [ ]`). A real run prints `<generator object foo at 0x…> 1 []` with a different address every time, so no fixed answer can match. It also writes `[ ]` for `[]`. | Change the question so its output is deterministic, e.g. print `type(g).__name__` instead of the generator itself. |
| `67e2dbc0f5addb214fc6a7fc` (#61) | The answer quotes `TypeError: what() takes 0 positional arguments but 1 was given.` Since Python 3.10 the message says `Test.what()`, so the answer is wrong on 3.10+. | The message differs between versions, so by the rule: `Error: TypeError` (as an option and the answer). |
| `67e2df32f5addb214fc6a806` (#66) | The answer quotes `SyntaxError: non-default argument follows default argument`. Since Python 3.12 the message is `parameter without a default follows parameter with a default`. | By the rule: `Error: SyntaxError`. |
| `67e04c89be7a85e233ca8163` (#21) | The answer writes `[ (1, 2) ] [ 'Python', (1, 2) ] [ (1, 2), (1, 2) ]`; Python prints `[(1, 2)] ['Python', (1, 2)] [(1, 2), (1, 2)]`. | Use Python's spacing in the answer (and in options written the same way). |
| `67e0595cbe7a85e233ca816a` (#24) | The answer writes `[1, 3, 5, 13] \| [ ]`; Python prints `[1, 3, 5, 13] \| []`. The explanation is also incomplete (see section 3). | `[1, 3, 5, 13] \| []` |
| `67e05cb0be7a85e233ca8170` (#27) | The answer writes `<class 'filter'> \| [ ]`; Python prints `<class 'filter'> \| []`. The explanation is also wrong (see section 3). | `<class 'filter'> \| []` |
| `67e04ad8be7a85e233ca815d` (#18) | The answer `Name: name Age: age` drops the ` \| ` the code prints. | `Name: name \| Age: age` |
| `67e05bfebe7a85e233ca816e` (#26) | The answer drops the trailing ` \|` the code prints. | `[25, 10] \| [36, 12] \| [49, 14] \|` |

## 2. Ambiguous answers: what the rule says they become

| Id | Now | Under the rule |
|---|---|---|
| `67e2b4aef5addb214fc6a7e1` (#48) | Prints `after f` (the `finally` block), then raises `NameError: name 'f' is not defined`. The answer is `Error`, and `after f` is also an option. | **Answer:** `after f Error: name 'f' is not defined` (the message is the same on 3.9 and 3.14). **Option:** replace `after f` with a different wrong option. |
| `67e2d9c2f5addb214fc6a7f8` | Prints `Before 1 After`, then raises `StopIteration` (no message). The answer is `Before 1 After StopIteration`, and `Before 1 After` is also an option. | **Answer:** `Before 1 After Error: StopIteration` (no message, so the type name). **Option:** replace `Before 1 After` with a different wrong option. |

The extended verifier checked all 145 questions against the rule. These two are the only ones that
print something and then raise, so there are no other violations. The seed questions have none.

## 3. Explanations that are wrong or misleading (the answers are correct)

| Id | What's wrong |
|---|---|
| `67e2e007f5addb214fc6a80a` (#68) | Says the increment "affects the class attribute globally". It doesn't: `self.attr1 += 1` creates an **instance** attribute on `test`, and the class attribute stays 12, which is why `test2` also prints 12 (output `12 12`). |
| `67e2e816f5addb214fc6a817` (#74) | Copied from the previous question: it talks about `set_width(12)`, `set_height(11)`, `get_width()` and "the output is 12". None of that is in this question, whose answer is `Box2D`. Needs a new explanation. |
| `67e50716f5addb214fc6a847` (#96) | Says "p2 is None". It isn't: `self.counter += 1` only creates instance attributes, so `Person.counter` stays 0 and all three instances are created (`p2 is None` is `False`). The printed `1` is `p.counter`. |
| `67e2f133f5addb214fc6a827` (#82) | Blames the constructors of `Box2D` and `Box3D`. The real error is `TypeError: Cannot create a consistent method resolution order (MRO) for bases Box, Box2D, Box3D`, raised when the class `MagicBox` is **defined**, before any constructor runs. |
| `67e2f0c3f5addb214fc6a825` (#81) | Calls `super().super()` "not valid syntax" and says it "results in a TypeError". It's valid syntax; it raises `AttributeError: 'super' object has no attribute 'super'` when `Box3D.__init__` runs. |
| `67e05cb0be7a85e233ca8170` (#27) | Says the first filter gives `[3, 9]`. 3 isn't in `seq`; the first filter gives `[9]`. The second filter then finds nothing, and the output is `<class 'filter'> \| []`. Also on the list in section 1. |
| `67e04a20be7a85e233ca815b` (#17) | Says "the global variable x is never explicitly assigned a value". The code assigns `x = " "`. The real cause, which the explanation also gives, is `globals()['foo'] = 25` rebinding `foo` to an int, so `foo()` raises `TypeError: 'int' object is not callable`. |
| `67e0595cbe7a85e233ca816a` (#24) | Leaves out why the second result is empty: `list(result)` already consumed the first `filter`, so the second `filter` runs over an exhausted iterator. (The answer is the same either way.) Also on the list in section 1. |
| `67e2d7def5addb214fc6a7f0` (#55) | "The next value in the sequence after 6 is 9, so 12 is printed" is confusing. The `for` loop already took 9 from the generator (and broke because 9 ≥ 7), so `next(x)` returns 12. |

## 4. Low priority

| Id | Problem | Change |
|---|---|---|
| `67e171bdf5addb214fc6a7d3` (#43) | `return 2` inside `finally` makes Python 3.14 print `SyntaxWarning: 'return' in a 'finally' block`. The output (`2`) and the answer are unchanged. | If possible, rewrite it to show the same behaviour without `return` in `finally`; low priority. |
