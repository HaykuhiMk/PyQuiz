# Content fixes for the production questions

**Status (2026-10-01): approved, and applied by script, not by hand.**
- The exact changes for all 20 questions (current and new values) are in
  `backend/database/contentFixes.json`, and `backend/scripts/applyContentFixes.js` applies them.
  `docs/DEPLOY_RUNBOOK.md`, "Before reopening the site", has the steps.
- They were reviewed as a proposal and approved, except #43, where the code and answer stay (see
  section 4).
- Rehearsed on a local copy of production: all 145 questions pass `npm run verify-questions` on
  Python 3.9 and 3.14.

**Second round (v2.1 QA, 2026-10-01): proposed, NOT approved yet.** 39 more questions in two
files, each applied with `applyContentFixes.js --fixes <file>`:
- `backend/database/contentFixes2.json`: the **13 to fix before reopening**;
- `backend/database/contentFixes3.json`: the other 26.

See section 6.

The sections below are the list as found, kept for the record. The approved values are in the
data file.

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
| `67e171bdf5addb214fc6a7d3` (#43) | `return 2` inside `finally` makes Python 3.14 print `SyntaxWarning: 'return' in a 'finally' block`. The output (`2`) and the answer are unchanged. | **Owner's decision:** keep the code and the answer (the question teaches that a `return` in `finally` overrides the earlier one), and add one sentence to the explanation saying that Python 3.14 warns about it, because the behaviour is easy to misread. The verifier accepts it: the warning goes to stderr. |

## 5. For the later misconception tagging of production-only questions

- `67e2f3bff5addb214fc6a82d` (Box Magic): the new wrong option `Box2D Box3D Magic` is a candidate
  for an `inheritance` misconception about `super()`. It's what a learner gets who thinks
  `super(Box2D, self)` starts at Box2D itself rather than at the class after it in the MRO. That's
  close to `inheritance.super-means-parent-class`; decide when the 98 production-only questions
  get their tag proposals.

## 6. Second round: the v2.1 QA content findings (proposed, not approved)

**Source:** the content findings C-01 to C-37 of the v2.1 QA. They were found on `pyquiz_qa`, an
exact local copy of production after the first round.

**Status:** proposed. Nothing has been applied to production or to any database that is kept.

**The data:** two files in the first round's format, each approved and applied on its own. No
question is in both, so they can be applied in either order.

| File | Questions | What |
|---|---|---|
| `backend/database/contentFixes2.json` | 13 | **To fix before reopening:** the 5 majors (C-01, C-02, C-03, C-05, C-06) and every "answer stands out by its format" item (C-03, C-09, C-13 to C-19). |
| `backend/database/contentFixes3.json` | 26 | The rest: wording and error naming (C-04, C-07, C-08, C-10 to C-12), difficulty labels (C-20 to C-27), typos and weak distractors (C-28 to C-37). |

`tmp/content-fixes2-review.md` (not committed) shows the 13 of `contentFixes2.json` side by side,
for review.

For each question a file gives:
- **`expect`:** the current value of each field it changes, read from the copy, so the values left
  by the first round;
- **`set`:** the new value.

There is one entry per question. A question with several findings has them all in one entry: C-05
and C-23 are both on `67e2ec29…`. Since C-05 is a major, that entry is in `contentFixes2.json`,
together with its difficulty change (C-23). The other C-23 question, `67e2eb67…`, is in
`contentFixes3.json`.

**Applying:** `applyContentFixes.js --fixes contentFixes2.json` (or `contentFixes3.json`), with the
same safety rules as the first round:
- `--uri` only, the target printed first, dry run by default, and the database name typed on
  `--apply`;
- it refuses everything if any question isn't in the expected state;
- it refuses if a change would drop a misconception tag;
- every write is guarded by the expected values, and every fixed question must pass the validators
  afterwards.

**Order:** the first round must already be applied (on production it is). The second round expects
its results: 6 questions are in both rounds.

**Afterwards, round 1's dry run reports 2 "unexpected" questions.** These are #26 and #61, whose
options `contentFixes2.json` changes again (C-15 and C-16). That's expected. It only means the
content has moved on from round 1, and the script refuses rather than writes. To check a database
after the second round, run the dry runs of `contentFixes2.json` and `contentFixes3.json`.

**Checked:**
- **Verifier:** all 39 changed questions pass `npm run verify-questions --require-checked` on
  Python 3.9.6 and 3.14.7.
- **Rehearsal:** on a throwaway restore of `pyquiz-with-content-fixes.gz`, `contentFixes2.json`
  was applied (13 of 13) and then `contentFixes3.json` (26 of 26). After each step, all **145**
  questions pass on both versions.
- **Tags:** none is lost (39 tag entries throughout).
- **A second run** of either file changes nothing.
- **The rehearsal copy** was dropped.

**Before reopening: 13 questions,** the whole of `contentFixes2.json`. They are marked **Yes**
below.

**Seed questions:** 3 entries are seed questions (C-09, C-13, C-14: ids `67c45ba3…`), all in
`contentFixes2.json`. When that file is approved, the same change goes into
`backend/database/questions.json` in the same commit. Otherwise `scripts/syncSeedQuestions.js`
would put the old text back in local and dev databases (production isn't affected). Not done yet.
`contentFixes3.json` touches no seed question.

**Corrections to the QA report:**
- **C-08** (`67e2d8e1…`): its answer `StopIteration: 25` is one of the rule's older forms (it
  names the exception and quotes its message), which stays valid for a snippet that prints nothing.
  So only its explanation changes.
- **C-09:** the verifier accepts its old answer for the same reason. The change is about the
  giveaway: it makes the answer and one distractor share the `Error:` form.

**Proposals to review:** every new option and explanation was written for this proposal. The
values are in the JSON; the table summarizes them.

| Id | Finding | Before reopening (file) | Fields that change | Why |
|---|---|---|---|---|
| `67e2e08bf5addb214fc6a80c` | C-01 | **Yes** (`contentFixes2.json`) | explanation | The explanation says test2 prints 12; the code never prints test2. The output 12 13 is test.access() and then test's own attribute. |
| `67e06074be7a85e233ca817d` | C-02 | **Yes** (`contentFixes2.json`) | explanation | The explanation contradicts itself ("x.append(0) is called. This appends None"). |
| `67e17403f5addb214fc6a7db` | C-03 | **Yes** (`contentFixes2.json`) | options | Two defensible answers ("Error" and "Error: X too small"), and the answer was the only option with an Error: prefix. |
| `67e2ec29f5addb214fc6a81f` | C-05, C-23 | **Yes** (`contentFixes2.json`) | explanation, difficulty | Wrong reasoning: Box2D's constructor never runs at all, because Box3D's bare super() calls nothing. Difficulty made consistent with the same question 67e2eb67… (medium). |
| `67e2d958f5addb214fc6a7f6` | C-06 | **Yes** (`contentFixes2.json`) | explanation | The explanation says calling next(foo()) again would reach return 25; each foo() creates a new generator. |
| `67c45ba322943ce7acd24d22` | C-09 (seed) | **Yes** (`contentFixes2.json`) | options, answer | The answer had no Error: prefix and was the only option quoting an error message. |
| `67c45ba322943ce7acd24d10` | C-13 (seed) | **Yes** (`contentFixes2.json`) | options | Only the answer was a bracketed list. |
| `67c45ba322943ce7acd24d28` | C-14 (seed) | **Yes** (`contentFixes2.json`) | options | Only the answer had " \| " separators. The two tagged options are kept. |
| `67e05bfebe7a85e233ca816e` | C-15 | **Yes** (`contentFixes2.json`) | options | Only the answer had " \| ", and it was much longer than every other option. |
| `67e2dbc0f5addb214fc6a7fc` | C-16 | **Yes** (`contentFixes2.json`) | options | The answer was the only Error: option. |
| `67e2dd0df5addb214fc6a7fe` | C-17 | **Yes** (`contentFixes2.json`) | options | The answer was the only error option and much longer than every other option. |
| `67e05a6dbe7a85e233ca816c` | C-18 | **Yes** (`contentFixes2.json`) | options | The answer was the only tuple-shaped option. |
| `67e06143be7a85e233ca817f` | C-19 | **Yes** (`contentFixes2.json`) | options | The distractors used curly quotes; only the answer used straight ones. |
| `67e2b6def5addb214fc6a7e5` | C-04 | no (`contentFixes3.json`) | code, options, answer, explanation | The code printed the word "Error", which collides with the "Error" option meaning the program raises. It now prints "Caught". |
| `67e2e978f5addb214fc6a819` | C-07 | no (`contentFixes3.json`) | explanation | The explanation called a bare super() "incomplete syntax"; it is valid and only creates an unused proxy. |
| `67e2d8e1f5addb214fc6a7f4` | C-08 | no (`contentFixes3.json`) | explanation | The explanation said foo() "is executed and immediately returns"; calling foo() only creates the generator. (The answer form "StopIteration: 25" is one of the rule's older forms, valid for a snippet that prints nothing, so it stays.) |
| `67e038e335e5165a41bbb396` | C-10 | no (`contentFixes3.json`) | explanation | The explanation quoted Python 3.9's UnboundLocalError message; newer versions word it differently. |
| `67e03cef35e5165a41bbb3a2` | C-11 | no (`contentFixes3.json`) | explanation | "Python raises an error" was vague: it is a SyntaxError at compile time, so nothing is printed. |
| `67e04c00be7a85e233ca8161` | C-12 | no (`contentFixes3.json`) | explanation | The explanation did not name the error. |
| `67e50716f5addb214fc6a847` | C-20 | no (`contentFixes3.json`) | difficulty | Combines __new__, class versus instance attributes and += shadowing. |
| `67e5066ef5addb214fc6a845` | C-21 | no (`contentFixes3.json`) | difficulty | Its own explanation calls it more advanced than basic instantiation. |
| `67e50530f5addb214fc6a843` | C-22 | no (`contentFixes3.json`) | difficulty | __new__ returning None, so __init__ never runs. |
| `67e2eb67f5addb214fc6a81d` | C-23 | no (`contentFixes3.json`) | difficulty | Same concept and answer as 67e2ec29… (hard); both medium. |
| `67e50836f5addb214fc6a849` | C-24 | no (`contentFixes3.json`) | difficulty | Plain method overriding and a list comprehension. |
| `67e4f65ef5addb214fc6a836` | C-25 | no (`contentFixes3.json`) | difficulty | One overridden method called through a function. |
| `67e2e4faf5addb214fc6a814` | C-26 | no (`contentFixes3.json`) | difficulty | Name mangling of __width across classes with this/self. |
| `67dd83578e2ddadc28e387f6` | C-27 | no (`contentFixes3.json`) | difficulty | A function rebinding its own name and setting __name__. |
| `67e19688f5addb214fc6a7de` | C-28 | no (`contentFixes3.json`) | options | Missing space in an option. |
| `67e2de4bf5addb214fc6a802` | C-29 | no (`contentFixes3.json`) | code | The code had "t. print_all()" (a space after the dot). |
| `67e2de92f5addb214fc6a804` | C-29 | no (`contentFixes3.json`) | code | The code had "t. print_all()" (a space after the dot). |
| `67e2df32f5addb214fc6a806` | C-29 | no (`contentFixes3.json`) | code | The code had "t. print_all()" (a space after the dot). |
| `67e05ec6be7a85e233ca8177` | C-30 | no (`contentFixes3.json`) | options | Distractors used "Jade", which is not in the code. |
| `67e04a20be7a85e233ca815b` | C-31 | no (`contentFixes3.json`) | options | An option contained a comment. |
| `67e04b86be7a85e233ca815f` | C-32 | no (`contentFixes3.json`) | options | Option "s \| [ ]" was not a plausible output. |
| `67e06209be7a85e233ca8181` | C-33 | no (`contentFixes3.json`) | options | Throwaway options ("[ ]", "' '", "Random element", "[0, '', None, [ ]]"); 15 options. |
| `67e2dddaf5addb214fc6a800` | C-34 | no (`contentFixes3.json`) | options | Options "a", "b", "Test" were not plausible outputs. |
| `67e04d9ebe7a85e233ca8165` | C-35 | no (`contentFixes3.json`) | options | Options "1234", "2468", "2345" had nothing to do with the code. |
| `67e2b912f5addb214fc6a7e9` | C-36 | no (`contentFixes3.json`) | options | Three almost identical generator-address options. |
| `67e508aaf5addb214fc6a84b` | C-37 | no (`contentFixes3.json`) | options | "An error due to improper inheritance" and "None of the above" overlapped with "Error". |
