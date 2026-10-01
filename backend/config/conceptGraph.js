// The concept graph: topics as nodes, prerequisite edges between them, and
// the misconceptions that belong to each topic (docs/CONCEPT_GRAPH.md, Stage 1
// approved, Stage 2 implemented here). This module is the single definition;
// docs/CONCEPT_GRAPH.md explains every node, edge and misconception, with a
// verified code example for each misconception.
//
// - Nodes are topic ids from config/topicTaxonomy.js: every topic in TOPICS
//   (questions may use them) plus PLANNED_TOPICS (in the graph, not yet
//   accepted on questions). Display names live only in topicTaxonomy.js.
// - An edge { from, to } means `from` must come first: a learner should
//   understand it before `to`. Every edge is a plain prerequisite; a topic
//   with several incoming edges needs all of them. The graph is acyclic
//   (tests/conceptGraph.test.js).
// - A misconception id is `<topic id>.<wrong belief>`. It belongs to the one
//   topic whose correct mental model fixes it. Like topic ids, a misconception
//   id never changes once questions or answer events store it.
//   A misconception that is a confusion between two concepts covers both
//   directions and its id ends in `-confusion`; which direction an option
//   shows is captured by that option's feedback text.
//
// Served read-only by GET /api/v1/concept-graph. Misconception data is
// recorded on answer events; it is not shown to learners yet (feedback could
// reveal the correct answer).

// One sentence per topic on what it covers.
const NODES = [
  { id: 'mutability', description: 'How names bind to objects: assignment creates references, not copies; mutation vs rebinding; aliasing, including arguments passed to functions, repeated references (`[[0] * 2] * 2`) and shallow copies; `is` (identity) vs `==` (equality); which types are mutable.' },
  { id: 'loops', description: '`if`/`for`/`while`, `break`/`continue`, the loop `else` clause, `range`, and the order in which statements run.' },
  { id: 'dicts', description: 'Creating, reading and updating dicts: key lookup and missing keys, iteration (keys, `.values()`, `.items()`), views, and which keys count as the same key.' },
  { id: 'types', description: 'Built-in types and converting between them (`int()`, `float()`, `str()`, `bool()`), truthiness, and which operations are defined across types.' },
  { id: 'strings', description: 'String immutability, indexing, and methods that return new strings (`upper`, `strip`, `split`, `replace`, …).' },
  { id: 'functions', description: 'Defining and calling functions: parameters, defaults, return values (including the implicit `None`), and common built-ins (`len`, `sorted`, `zip`, `enumerate`, `print`, …).' },
  { id: 'sets', description: 'Set literals and `set()`, uniqueness, membership, set operations, and that sets are unordered and unindexed.' },
  { id: 'lists', description: 'Creating and changing lists: `append`/`extend`/`insert`/`remove`, in-place methods that return `None`, list repetition and nesting.' },
  { id: 'slicing', description: 'Positive and negative indices, `start:stop:step` slices, out-of-range behaviour, and slicing making a new object. Slicing works on every sequence type: lists, strings and tuples.' },
  { id: 'tuples', description: 'Tuple syntax (the comma makes the tuple), packing and unpacking, and immutability of the container, not its contents.' },
  { id: 'numbers', description: '`int`/`float` arithmetic: `/` vs `//` vs `%`, floor division with negatives, float precision, `round`, ``/`pow`.' },
  { id: 'classes', description: 'Defining and instantiating a single class: `self` and method binding, `__init__`/`__new__`, instance vs class attributes and the lookup fallback between them, default object equality.' },
  { id: 'inheritance', description: 'Subclassing, overriding and polymorphism, `super()`, constructor chaining, multiple inheritance and the method resolution order.' },
  { id: 'scope', description: 'How names are resolved: local vs global, LEGB, `global`/`nonlocal`, shadowing, `UnboundLocalError`, closures, comprehension scope, and the absence of a scope for `for` loops.' },
  { id: 'generators', description: '`yield`, generator expressions, `iter`/`next`, lazy evaluation (including `map`/`filter`/`zip`), exhaustion and `StopIteration`.' },
  { id: 'exceptions', description: '`try`/`except`/`else`/`finally` control flow, `raise`, `assert`, the order `except` clauses are matched in, and what happens after an exception is handled or left uncaught.' },
];

const EDGES = [
  { from: 'lists', to: 'mutability', reason: 'Aliasing and in-place mutation can only be demonstrated with a mutable container, and lists are the first one learners meet.' },
  { from: 'lists', to: 'slicing', reason: 'Slicing is defined on sequences, so a learner needs one sequence type first. Slicing applies equally to strings and tuples; the edge comes from `lists` because it is the first sequence learners usually meet and the one they slice most. It stands for "one sequence type first", not "lists specifically".' },
  { from: 'mutability', to: 'tuples', reason: '"Tuples are immutable" only makes sense once the mutable/immutable distinction exists; the classic trap is a tuple that holds a mutable list.' },
  { from: 'mutability', to: 'sets', reason: 'Set members must be hashable, which is a consequence of immutability.' },
  { from: 'mutability', to: 'dicts', reason: 'Dict keys must be hashable, and dict values are references that can be aliased.' },
  { from: 'numbers', to: 'types', reason: 'Converting between `int`, `float` and `bool` presupposes knowing how those numeric types behave.' },
  { from: 'strings', to: 'types', reason: "Most conversions go between strings and numbers (`int('3')`, `str(3)`), which presupposes strings." },
  { from: 'functions', to: 'scope', reason: 'Local scopes are created by function calls, so scope rules are about names inside functions.' },
  { from: 'functions', to: 'classes', reason: 'Methods are functions whose first parameter is bound to the instance.' },
  { from: 'mutability', to: 'classes', reason: 'Whether state is shared or per instance depends on mutating a shared class attribute vs rebinding an instance attribute.' },
  { from: 'classes', to: 'inheritance', reason: 'Subclassing, overriding and `super()` all extend single-class behaviour.' },
  { from: 'loops', to: 'generators', reason: 'Generators are consumed through the iteration protocol that `for` loops use.' },
  { from: 'functions', to: 'generators', reason: 'A generator function is a function containing `yield`; calling it returns an iterator instead of running the body.' },
  { from: 'functions', to: 'exceptions', reason: 'Exceptions propagate up the stack of function calls; `finally` and `return` interact inside functions.' },
];

// belief: the wrong belief. correctModel: the mental model that fixes it.
const MISCONCEPTIONS = [
  {
    id: 'mutability.assignment-copies',
    topic: 'mutability',
    belief: '`b = a` makes a copy.',
    correctModel: 'Assignment binds another name to the same object. Copy explicitly (`a.copy()`, `list(a)`, `a[:]`).',
  },
  {
    id: 'mutability.identity-equality-confusion',
    topic: 'mutability',
    belief: 'Confusion, both directions: `is` and `==` are interchangeable, so `is` compares values, or `==` compares identity.',
    correctModel: '`is` tests identity (the same object); `==` tests equality of value. Equal values can be different objects.',
  },
  {
    id: 'mutability.augmented-assignment-rebinds',
    topic: 'mutability',
    belief: '`b += [2]` makes a new list, like `b = b + [2]`.',
    correctModel: 'For mutable types, `+=` mutates in place (`__iadd__`), so every alias sees it.',
  },
  {
    id: 'mutability.rebinding-mutates',
    topic: 'mutability',
    belief: 'Assigning a new value to a name changes the object other names refer to.',
    correctModel: '`b = …` rebinds only `b`; the object `a` refers to is untouched.',
  },
  {
    id: 'mutability.arguments-are-copied',
    topic: 'mutability',
    belief: 'Passing a list to a function gives it a copy.',
    correctModel: 'Arguments are passed as references to the same objects; mutation inside is visible outside.',
  },
  {
    id: 'mutability.multiplication-copies-rows',
    topic: 'mutability',
    belief: '`[[0] * 2] * 2` makes two independent rows.',
    correctModel: '`*` repeats references to the same inner list; build rows with a comprehension.',
  },
  {
    id: 'mutability.slice-copy-is-deep',
    topic: 'mutability',
    belief: '`a[:]` copies nested objects too.',
    correctModel: 'A slice is a shallow copy: a new outer list sharing the same inner objects.',
  },
  {
    id: 'loops.remove-while-iterating',
    topic: 'loops',
    belief: 'Removing items while looping over a list still visits every item.',
    correctModel: 'The loop walks indices; removing shifts later items left, so the next one is skipped. Iterate over a copy or build a new list.',
  },
  {
    id: 'loops.range-includes-stop',
    topic: 'loops',
    belief: '`range(1, 5)` includes 5.',
    correctModel: '`range` stops *before* `stop`.',
  },
  {
    id: 'loops.else-runs-after-break',
    topic: 'loops',
    belief: "A loop's `else` runs when the loop exits via `break` (or always).",
    correctModel: 'The loop `else` runs only when the loop finishes without `break`.',
  },
  {
    id: 'dicts.iteration-yields-pairs',
    topic: 'dicts',
    belief: '`for x in d` yields key/value pairs.',
    correctModel: 'Iterating a dict yields its keys; use `.items()` for pairs.',
  },
  {
    id: 'dicts.missing-key-returns-none',
    topic: 'dicts',
    belief: '`d[key]` returns `None` for a missing key.',
    correctModel: 'Indexing a missing key raises `KeyError`; `.get()` returns a default.',
  },
  {
    id: 'dicts.keys-view-is-list',
    topic: 'dicts',
    belief: '`d.keys()` is a list and can be indexed.',
    correctModel: '`.keys()` returns a view; convert with `list(...)` to index it.',
  },
  {
    id: 'dicts.equal-keys-are-distinct',
    topic: 'dicts',
    belief: '`1`, `1.0` and `True` are three different keys.',
    correctModel: 'Keys that are equal and hash equally are the same key: the first key object is kept, and the last value wins.',
  },
  {
    id: 'types.bool-of-false-string',
    topic: 'types',
    belief: "`bool('False')` is `False`.",
    correctModel: '`bool()` of a string tests emptiness, not content: any non-empty string is truthy.',
  },
  {
    id: 'types.int-parses-float-string',
    topic: 'types',
    belief: '`int()` accepts any numeric-looking string.',
    correctModel: '`int()` parses integer literals from strings; convert with `int(float(s))` if needed.',
  },
  {
    id: 'types.int-rounds',
    topic: 'types',
    belief: '`int()` rounds to the nearest integer.',
    correctModel: '`int()` truncates toward zero; use `round()` to round.',
  },
  {
    id: 'types.implicit-str-number-coercion',
    topic: 'types',
    belief: 'Python converts between strings and numbers automatically when you combine them.',
    correctModel: "Python doesn't coerce between `str` and numbers; convert explicitly.",
  },
  {
    id: 'strings.methods-modify-in-place',
    topic: 'strings',
    belief: 'String methods change the string.',
    correctModel: 'Strings are immutable; methods return a new string that must be assigned.',
  },
  {
    id: 'strings.item-assignment',
    topic: 'strings',
    belief: 'You can change one character with `s[i] = …`.',
    correctModel: "Build a new string (`'b' + s[1:]`, `replace`, …).",
  },
  {
    id: 'strings.strip-removeprefix-confusion',
    topic: 'strings',
    belief:
      "Confusion, both directions: `strip` and `removeprefix`/`removesuffix` do the same job, so `strip('an')` removes the substring `'an'`, or `removeprefix('~')` removes every leading `'~'`.",
    correctModel:
      '`strip(chars)` removes any of the given characters, repeatedly, from both ends; `removeprefix`/`removesuffix` remove one exact substring, once.',
  },
  {
    id: 'strings.split-space-equals-split',
    topic: 'strings',
    belief: "`split(' ')` behaves like `split()`.",
    correctModel: "`split()` with no argument splits on runs of whitespace; `split(' ')` splits on every single space.",
  },
  {
    id: 'functions.default-argument-fresh',
    topic: 'functions',
    belief: 'A default value like `bucket=[]` is created fresh on every call.',
    correctModel: 'Defaults are evaluated once, when the function is defined; use `None` and create the list inside.',
  },
  {
    id: 'functions.print-returns-value',
    topic: 'functions',
    belief: '`print` returns what it printed.',
    correctModel: '`print` writes to output and returns `None`.',
  },
  {
    id: 'functions.implicit-return-last-value',
    topic: 'functions',
    belief: 'A function returns the value of its last expression.',
    correctModel: 'Without `return`, a function returns `None`.',
  },
  {
    id: 'sets.empty-braces-make-set',
    topic: 'sets',
    belief: '`{}` is an empty set.',
    correctModel: '`{}` is an empty dict; an empty set is `set()`.',
  },
  {
    id: 'sets.indexable',
    topic: 'sets',
    belief: 'Sets can be indexed like lists.',
    correctModel: 'Sets are unordered collections without positions.',
  },
  {
    id: 'sets.add-returns-set',
    topic: 'sets',
    belief: '`s.add(x)` returns the updated set.',
    correctModel: '`add` mutates in place and returns `None`.',
  },
  {
    id: 'lists.in-place-method-returns-list',
    topic: 'lists',
    belief: 'An in-place list method such as `sort()` or `append()` returns the changed list.',
    correctModel: 'In-place methods change the list and return `None`; `sorted(nums)` returns a new list.',
  },
  {
    id: 'lists.append-extends',
    topic: 'lists',
    belief: '`append([3, 4])` adds two items.',
    correctModel: '`append` adds one object (here, a list); `extend` adds each item.',
  },
  {
    id: 'lists.assignment-extends',
    topic: 'lists',
    belief: 'Assigning past the end grows the list.',
    correctModel: 'Indices must exist; use `append`/`extend`/`insert` to grow a list.',
  },
  {
    id: 'slicing.stop-inclusive',
    topic: 'slicing',
    belief: 'A slice includes the `stop` index.',
    correctModel: 'Slices are half-open: `start` included, `stop` excluded.',
  },
  {
    id: 'slicing.out-of-range-raises',
    topic: 'slicing',
    belief: 'Slicing beyond the end raises an error, like indexing.',
    correctModel: 'Slice bounds are clipped to the sequence; single indices must exist.',
  },
  {
    id: 'tuples.parentheses-make-tuple',
    topic: 'tuples',
    belief: 'Parentheses create a tuple.',
    correctModel: 'The comma makes the tuple; parentheses only group.',
  },
  {
    id: 'tuples.contents-immutable',
    topic: 'tuples',
    belief: "A tuple's contents can never change.",
    correctModel: "The tuple can't be rebound slot by slot, but mutable objects inside it can still change.",
  },
  {
    id: 'tuples.failed-augmented-assignment-changes-nothing',
    topic: 'tuples',
    belief: 'If `t[0] += [2]` raises an error, nothing changed.',
    correctModel: '`+=` first mutates the list in place, then fails to assign back into the tuple, so the error comes after the change.',
  },
  {
    id: 'numbers.slash-is-integer-division',
    topic: 'numbers',
    belief: '`7 / 2` is `3`.',
    correctModel: 'In Python 3, `/` is true division and always gives a float; `//` is floor division.',
  },
  {
    id: 'numbers.floor-division-truncates',
    topic: 'numbers',
    belief: '`-7 // 2` is `-3`.',
    correctModel: '`//` rounds down (toward negative infinity), not toward zero.',
  },
  {
    id: 'numbers.floats-are-exact',
    topic: 'numbers',
    belief: '`0.1 + 0.2 == 0.3`.',
    correctModel: "Binary floats can't represent most decimals exactly; compare with a tolerance (`math.isclose`).",
  },
  {
    id: 'numbers.round-half-up',
    topic: 'numbers',
    belief: '`round(2.5)` is `3`.',
    correctModel: '`round` uses round-half-to-even ("banker\'s rounding").',
  },
  {
    id: 'classes.class-attribute-per-instance',
    topic: 'classes',
    belief: 'A list defined in the class body is separate for each instance.',
    correctModel: 'Class attributes are one object shared by all instances; create per-instance state in `__init__`.',
  },
  {
    id: 'classes.augmented-assignment-updates-class',
    topic: 'classes',
    belief: '`obj.n += 1` updates the class attribute `n`.',
    correctModel: 'It reads the class value, then creates an instance attribute that shadows it.',
  },
  {
    id: 'classes.self-is-optional',
    topic: 'classes',
    belief: "Methods don't need a `self` parameter.",
    correctModel: 'Calling a method on an instance passes the instance as the first argument.',
  },
  {
    id: 'classes.equality-compares-attributes',
    topic: 'classes',
    belief: 'Two instances with the same attributes are `==`.',
    correctModel: 'By default `==` falls back to identity; define `__eq__` for value equality.',
  },
  {
    id: 'inheritance.parent-init-runs-automatically',
    topic: 'inheritance',
    belief: "A subclass `__init__` automatically runs the parent's `__init__`.",
    correctModel: 'Overriding `__init__` replaces it; call `super().__init__()` explicitly.',
  },
  {
    id: 'inheritance.super-means-parent-class',
    topic: 'inheritance',
    belief: '`super()` always calls the direct parent class.',
    correctModel: "`super()` calls the next class in the instance's MRO, which can be a sibling (`C`), not the parent (`A`).",
  },
  {
    id: 'inheritance.mro-depth-first',
    topic: 'inheritance',
    belief: 'The method resolution order is depth-first (`D, B, A, C`).',
    correctModel: 'Python uses the C3 linearization: a class always comes before its bases, and the base order is kept.',
  },
  {
    id: 'scope.assignment-reads-global-first',
    topic: 'scope',
    belief: 'A function can read a global and assign it later in the same function.',
    correctModel: 'Any assignment in a function makes the name local for the whole function body; use `global` to assign the global.',
  },
  {
    id: 'scope.mutation-needs-global',
    topic: 'scope',
    belief: '`global` is needed to change a global list.',
    correctModel: '`global` is only needed to rebind a name; mutating the object it refers to needs no declaration.',
  },
  {
    id: 'scope.closures-capture-values',
    topic: 'scope',
    belief: "A lambda remembers the loop variable's value at creation.",
    correctModel: 'Closures capture the variable, looked up when called (late binding); bind with a default (`lambda i=i: i`).',
  },
  {
    id: 'scope.comprehension-variable-leaks',
    topic: 'scope',
    belief: "A comprehension's loop variable is still defined afterwards.",
    correctModel: 'In Python 3, comprehensions have their own scope (unlike a `for` loop).',
  },
  {
    id: 'scope.loop-variable-discarded',
    topic: 'scope',
    belief: 'The loop variable disappears after the loop.',
    correctModel: "A `for` loop doesn't create a scope; the variable keeps its last value.",
  },
  {
    id: 'generators.reusable',
    topic: 'generators',
    belief: 'A generator can be iterated more than once.',
    correctModel: 'Generators are single-use iterators; once exhausted they yield nothing.',
  },
  {
    id: 'generators.call-runs-body',
    topic: 'generators',
    belief: 'Calling a generator function runs its body.',
    correctModel: 'Calling it only creates the generator; the body runs lazily on `next()`.',
  },
  {
    id: 'generators.map-returns-list',
    topic: 'generators',
    belief: '`map`/`filter`/`zip` return lists.',
    correctModel: 'In Python 3 they return lazy iterators; wrap in `list(...)` to materialize.',
  },
  {
    id: 'exceptions.return-skips-finally',
    topic: 'exceptions',
    belief: '`return` inside `try` skips `finally`.',
    correctModel: '`finally` always runs on the way out, even on `return`.',
  },
  {
    id: 'exceptions.most-specific-handler-wins',
    topic: 'exceptions',
    belief: 'The most specific matching `except` clause is chosen.',
    correctModel: 'Clauses are tried in order; the first match wins, so put specific handlers first.',
  },
  {
    id: 'exceptions.else-always-runs',
    topic: 'exceptions',
    belief: "A `try` statement's `else` block always runs.",
    correctModel: '`else` runs only if the `try` block raised nothing.',
  },
  {
    id: 'exceptions.caught-exception-keeps-propagating',
    topic: 'exceptions',
    belief: "An error still stops the program even after it's caught.",
    correctModel: 'A handled exception is finished; execution continues after the `try` statement.',
  },
];

const MISCONCEPTION_IDS = MISCONCEPTIONS.map((misconception) => misconception.id);

module.exports = { NODES, EDGES, MISCONCEPTIONS, MISCONCEPTION_IDS };
