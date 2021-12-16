---
title: "Pyodide Function Pointer Cast Removal"
date: 2021-12-06T20:27:27-08:00
draft: true
tags: ["internals"]
author: "Hood Chatham"
# author: ["Me", "You"] # multiple authors
showToc: true
TocOpen: false
draft: false
hidemeta: false
comments: false
description: "Why old versions of Pyodide had a low recursion limit and how version 0.19.0 supports a much higher one."
# canonicalURL: "https://canonical.url/to/page"
disableHLJS: true # to disable highlightjs
disableShare: false
hideSummary: false
searchHidden: true
ShowReadingTime: true
ShowBreadCrumbs: true
ShowPostNavLinks: true
cover:
    image: "<image path/url>" # image path/url
    alt: "<alt text>" # alt text
    caption: "<text>" # display caption under cover
    relative: false # when using page bundles set this to true
    hidden: true # only hide on current single page
---

In Pyodide v0.19, we can finally support a recursion depth of at least the
native default of 1000. Here's a graph by browser and Pyodide version:

{{< figure src="/recursion_depth.png" title="Default recusion depth by version" >}}

Note that this figure understates the magnitude of the improvements because in
all prior versions there were some code paths that would lead to fatal segmentation
faults before hitting the default recursion depth, whereas in version `0.19`, we
have plenty of extra stack space left over so we should never see fatal segmentation
faults in normal code.

## Some history

When I first started using Pyodide in summer 2020, my plan was to use it to
control the display of a niche type of mathematical charts. I hacked the Monaco
editor to make it behave like a repl, and then connected Jedi to Monaco
intellisense so that interactive documentation for my custom chart API could
appear right in the repl. This did not go as planned because of recursion
errors.

The following code reproduces the problem:
```py
import jedi
import numpy
jedi.Interpreter("numpy.in1d([1,2,3],[2]).", [globals()]).complete()
```

Run this in [Pyodide
0.16.1](https://pyodide-cdn2.iodide.io/v0.16.1/full/console.html) in Chrome and
you will see "RangeError: Maximum call stack size exceeded".

In Pyodide 0.16.1, the available stack space before a stack overflow is enough
for a call depth of 120 Python function calls. Jedi needs more than this.

## How much stack space are we working with?

Chromium sets the stack size to about 984 kilobytes. The source has the comment:
```C
// Slightly less than 1MB, since Windows' default stack size for
// the main execution thread is 1MB for both 32 and 64-bit.
```
Firefox manages to set the stack size several times higher, but for some reason a 
Python function call takes up about twice as much space on Firefox.

But 984 kilobytes is still a fair amount of space. Just what is happening that
Jedi manages to use that all in 120 Python call frames? That averages out to
over 8 kilobytes per call frame!

In my native Python,
```py
import sys; sys.setrecursionlimit(100_000)
def f(n): print(n); f(n+1)
f(0)
```
gets up to 20135 calls before the segmentation fault. In various Pyodide
versions we have the following results:
{{< figure src="/depth_to_stack_overflow.png" caption="How many simple Python calls it takes to cause a stack overflow by browser and Pyodide version" >}}

Note that setting the stack overflow anywhere near this high will lead to
segmentation faults because a lot of code paths use more stack space per Python
call (also, Python needs some stack space to raise a `RecursionError`).

Pyodide v0.18 has a hack that helps it _look_ much better on this particular
benchmark, but in practice it isn't much better than Pyodide v0.17. There are
still examples that cause segfaults using Jedi in Pyodide v0.18 at much lower
stack depths.

## The cause of the large stack usage: function pointer cast emulation!

The bad stack performance has to do with our ABI for calling function pointers.
In Pyodide v0.17, looking at the stack trace when we cause a stack overflow, we
see a bunch of units like:
```js
    at pyodide.asm.wasm:wasm-function[767]:0x1cb77c
    at _PyFunction_Vectorcall (pyodide.asm.wasm:wasm-function[768]:0x1cb878)
    at byn$fpcast-emu$_PyFunction_Vectorcall (pyodide.asm.wasm:wasm-function[14749]:0x7a3736)
    at pyodide.asm.wasm:wasm-function[2764]:0x2ac6ae
    at _PyEval_EvalFrameDefault (pyodide.asm.wasm:wasm-function[2758]:0x2a980f)
    at byn$fpcast-emu$_PyEval_EvalFrameDefault (pyodide.asm.wasm:wasm-function[15508]:0x7a61f3)
    at PyEval_EvalFrameEx (pyodide.asm.wasm:wasm-function[2757]:0x2a4693)
```

The functions `byn$fpcast-emu$_PyFunction_Vectorcall` and
`byn$fpcast-emu$_PyEval_EvalFrameDefault` emulate function pointer casts. (The
`byn$` prefix indicates that they were created in a binaryen pass, to avoid
confusion.) In other words, they are there to handle the case where we've called
`PyFunction_Vectorcall` or `PyEval_EvalFrameDefault` with the wrong number of
arguments. They also are slow and waste a huge amount of stack space.

### Why are there function pointer casts?

Many popular Python packages are written at least in part in C for performance
reasons. Python comes with several possible calling conventions to allow calling
a C function from Python. The most standard calling convention is `METH_VARARGS`
which allows a function to be invoked with zero or more positional arguments
which are passed as a tuple. No keyword arguments are allowed. It also has
`METH_NOARGS` for zero argument functions.

Surprisingly, a `METH_NOARGS` function is also supposed to take two arguments:
```C
static PyObject* 
my_noargs_function(PyObject *self, PyObject *_always_null){
    // Do something with self, _always_null is always null.
}
```

Many people writing Python C extensions write their `METH_NOARGS` functions
instead like this:
```C
static PyObject* 
my_noargs_function2(PyObject *self){
    // Do something
}
```

where `my_noargs_function2` has no second argument. They then cast
`my_noargs_function2` to a function of two arguments and the Python interpreter
calls it like `my_noargs_function2(self, NULL)`.

[Section 6.3.2.3, paragraph
8](http://www.open-std.org/JTC1/SC22/WG14/www/docs/n1256.pdf#page=60) of the C
standard reads:

> A pointer to a function of one type may be converted to a pointer to a
> function of another type and back again; the result shall compare equal to the
> original pointer. If a converted pointer is used to call a function whose type
> is not compatible with the pointed-to type, the behavior is undefined.

So writing `my_noargs_function2` invokes undefined behavior in the C
specification. However, most C compilers produce code for most targets that
works fine. Since most of the time Python packages are compiled in these cases,
package authors cast function pointers and move on with their lives. The
existing Python ecosystem is full of these casts all over the place.

### Function pointer casts don't work in Wasm

In x86, calling a function pointer is the same process as calling a static
function call. Arguments and a return address are pushed onto a stack, and a
jump is performed. The only difference is that in the case of a static function
call, the target of the jump is known at compile time, whereas in the case of a
dynamic call, it is determined by a variable.

In web assembly, a function pointer is an index into a table of functions. There
is a separate wasm instruction called `call_indirect` which takes an immediate
(compile-time determined) argument to indicate what the signature of the
function being called should be. The web assembly runtime checks that the
function being called has a signature which matches the asserted signature and
if it doesn't it throws an error.

So we call `my_noargs_function2` through a `call_indirect` instruction which
asserts that it takes two arguments. The wasm runtime checks and sees that in
fact, `my_noargs_function2` only expects one argument, and it crashes with an
"indirect call signature mismatch" error.

## Ways to fix the call signature mismatch errors

### 1. EMULATE_FUNCTION_POINTER_CASTS

The Emscripten compiler comes with a flag that makes it emulate function pointer
casting. This is what we have been using to resolve the troubles. However, it
comes with a high cost: it is slow, it uses up large amounts of stack space, and
it increases code size by a lot. Also, it makes calling a function pointer from
Javascript inconvenient, and in particular breaks dynamic linking and many
Emscripten ports which implement C libraries with Javascript code. I will
describe later how this works and why it imposes such large costs.

### 2. Just patch the packages

We could just go through and patch the Python C packages to fix their function
declarations. However, there is no easy way to detect these function pointer
casts (there's no compiler setting that can generate warnings about them). It is
also very tedious to locate the problematic code. The upstream packages are
generally happy to accept these patches but it takes time to review them and
they may not get backported as far as we need them (Pyodide is stuck on pretty
old versions of some packages). So it generates a high maintentance burden. This
solution isn't really workable for us.

### 3. Automate the patching

We can write code to analyze the `clang` abstract syntax tree, locate the bad
pointer casts, and either automatically rewrite the source. The idea here is
that we scan the AST for declarations that look like:

```C
PyMethodDef my_method_def = {
    "my_method", // the name
    (PyCFunction)my_method, // The C function pointer
    METH_NOARGS, // the calling convention
};
```

where `my_method` has a number of arguments different than 2. Then we locate the
definition of `my_method`, say it looks like:

```C
static PyObject*
my_method(PyObject* self){
    // ...
}
```
and we patch it to look like:
```C
static PyObject*
my_method(PyObject* self, PyObject *_ignored){
    // ...
}
```

We also patch each spot where `my_method` is called with one argument. We fix a
handful of other common problematic declarations as well. If problematic code
when the source is confusing (maybe the problem spans multiple files or occurs
in a macro expansion) then we just raise an error indicating the problem
location and someone can manually patch the source.

I wrote code to do this and it works, but there are a lot of weird edge cases to
take into account and the code is complex.

### 4. Trampolines

When calling from Js ==> Wasm, the calls behave like Javascript function calls:
if we give the wrong number of arguments, it's silently fixed for us. The bad
function calls only occur at a small number of call sites, so if we patch in a
trampoline to each of these call sites that calls a Javascript function that
calls back into wasm, we can fix the problems. This is the solution we are
currently using.

Explicitly, we make a trampoline:
```C
EM_JS( // EM_JS is a C macro which lets us declare a Javascript function to invoke from C.
PyObject*, 
method_call_trampoline, (
    PyCFunction func, // In Javascript, all arguments are Numbers.
    PyObject *self, 
    PyObject *args, 
    PyObject *kwargs
), {
    // function pointers are indexes into `wasmTable`.
    // look up the function we are supposed to call and then call it.    
    // We're calling from Javascript, so if the function actually takes 3 arguments
    // or only 1, in any case this call won't crash
    return wasmTable.get(func)(self, args, kwargs);
});
```

Then Python would actually call a `METH_NOARGS` function, the line of code
originally looks like this:
```C
PyObject *result = meth(args[0], NULL);
```
We replace it with:
```C
PyObject *result = method_call_trampoline(meth, args[0], NULL, NULL);
```
and this won't crash if `meth` expects a number of arguments different than two.

Similarly, the intepreter normally calls a function which supports `VARARGS` and
`KEYWORD_ARGS` as follows:
```C
PyObject *result = meth(args[0], argstuple, kwdict);
```
we replace this with:
```C
PyObject *result = method_call_trampoline(meth, args[0], argstuple, kwdict);
```

### 5. Better function pointer cast emulation

In the future, the best solution is to fix the drawbacks with
`EMULATE_FUNCTION_POINTER_CASTS`. Our currently-implemented solution 4 of using
trampolines requires there to be a very limited number of call sites, so that
the patch is manageable. In general, that could fail to be the case. Also, our
solution is dependent on being inside of a Javascript-based embedder. If in the
future, people want to run Python inside of other hosts, they would need to
rewrite the trampolines.

## Better function pointer cast emulation with an LLVM pass

My plan is to write an LLVM pass to implement function pointer cast emulation in
a way that has a negligible impact on speed, stack usage, and code size. The
solution will also impose no surprising difficulties for Javascript ==> Wasm
calls or for dynamic linking. It does change the ABI so it will require the
linked modules to be aware of this different ABI. We will also assume that (1)
most function pointers are called with the correct signature most of the time
and (2) only a small number of types of function are cast into the wrong
signature and called. Both of these assumptions are met in Python.

### How `EMULATE_FUNCTION_POINTER_CASTS` works

Emscripten implements `EMULATE_FUNCTION_POINTER_CASTS` in a binaryen pass.
Binaryen is the web assembly optimizer. It runs after the web assembly module is
completely linked. It's an all-or-nothing thing, we either have to pay a big
cost EVERYWHERE or every single function pointer must be called with the correct
signature always.

The way that `EMULATE_FUNCTION_POINTER_CASTS` works is that it walks through the
`wasmTable` which is used to make indirect calls and replaces each function with
a "thunk" which expects a fixed, much larger number of arguments. So what we see is
if `f` is a function:
```C
int f(float x, int y);
```
Then the call `res = f(x,y)` gets replaced with:
```C
u64 temp = f_adaptor(
    ConvertFloat32ToUint64(x),
    ConvertInt32ToUint64(y),
    0, ..., 0 // 59 zeros
);
res = ConvertUint64ToInt32(temp);
```
and `f_adaptor` looks like:
```C
uint_64 f_adaptor(uint_64 x1, ..., uint_64 x61){ 
    // Ignore x3, ..., x61 they are just there to keep us safe from being called
    // with too many arguments
    int res = f(ConvertU64ToFloat32(x1), ConvertU64ToInt32(x2));
    return ConvertInt32ToUint64(res);
}
```

The number 61 is the maximum number of arguments any function pointer is ever
called with anywhere in any of the Python ecosystem code.

This explains the drawbacks:

1. It takes up a lot of stack space because for every function pointer call we
have to call an extra adaptor which uses up ~ 8*61 = 488 bytes of stack space.

2. It's slow because a lot of time is spent converting between `uint_64` and
other data types.

3. It increases code size because every single function needs a corresponding
adaptor function.

4. It messes up calling from Javascript because when we do a function table
lookup we get the weird function which expects to receive 61 `uint_64`s rather
than the original arguments.

To fix calls from Javascript, we have to make a second table which maps
`f_adaptor_index ==> f_index`, and then instead of `wasmTable.get(func_ptr)` we
say `wasmTable.get(adaptorToOrigFunctionMap.get(func_ptr))`. All Javascript code
that calls into Wasm has to be adjusted in this way. When we used
`EMULATE_FUNCTION_POINTER_CASTS` we always got errors due to confusion between
pointers to the adaptors and the normal function pointers.

### How to do better

We make a list of function signatures that somewhere get cast and called with
the wrong arguments. This might look like:

1. `(void) -> i32`
2. `(i32) -> i32`
3. `(i32, i32) -> i32`

Then when we take a function pointer, if it's signature is on the list, we
encode the signature into the higher bits of the function pointer:

```C
int f_ptr = f;
f_ptr |= (signature(f) << FP_SIG_OFFSET);
```

so if `f` had type `PyObject* f(PyObject*, PyObject*)` we would put a 3 in at
offset `FP_SIG_OFFSET`. Then when we make a dynamic call, we check if the
function has the right signature:

```C
int f_sig = FP_GET_SIG(f_ptr);
// have to mask out signature bits before trying to call the function pointer.
f_ptr = FP_GET_ACTUAL_PTR(f_ptr); 
if(f_sig == expected_sig){
    res = f_ptr(x, y);
} else if(f_sig == UNKNOWN){
    // We're gonna crash here =(
    // TODO: can we log anything helpful?
    res = f_ptr(x, y);
} else {    
    // Call an appropriate trampoline which converts from the signature we have to
    // the signature we need
    res = trampolines[expected_sig][f_sig](x, y);
}
```
This is much better:

1. For the typical case where we call the function with the right number of
arguments, there is almost no cost (branch prediction should guess this case).

2. The effect on code size is much milder because we only need to include a few
trampolines. Careful consideration shows that we don't actually need a different
trampoline for each pair of signatures, in practice it could be linear in the
number of signatures we need casting support for.

3. For function pointers with a signature not in the casting support list, we
won't generate any of this code.

4. Calling code needs to know to mask out the signature bits before calling a
function pointer, but this is all it needs to know.

This strategy cannot be implemented as a Binaryen pass, because it is impossible
to tell when a function pointer is being taken in Binaryen. However, in llvm
bytecode there is a dedicated instruction for taking a function pointer and we
can visit these instructions in an llvm pass.
