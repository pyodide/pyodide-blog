---
title: "Function Pointer Cast Handling in Pyodide"
date: 2021-12-21
draft: true
tags: ["internals"]
author: "Hood Chatham"
# author: ["Me", "You"] # multiple authors
showToc: true
TocOpen: false
draft: false
hidemeta: false
comments: false
description: "Why previous versions of Pyodide had a low recursion limit and how the upcoming version 0.19 supports a much higher one."
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

In the upcoming release of Pyodide version 0.19, we finally support the Python default
recursion limit of 1000. We also attain a speed boost of somewhere between 10 and
20 percent. The code size was reduced by 25% from 12 megabytes to 9.1 megabytes.
These gains came from [this pull
request](https://github.com/pyodide/pyodide/pull/2019) which changed the way we
handle function pointer casts.

Here is a plot showing the improvements in recursion depth:

<figure style="text-align: center; margin-top: -20pt; margin-bottom: 5pt;" >
<h4 style="color: black; position: relative; top:40pt;">Recursion limit and depth to segmentation fault</h4>
  <img src="recursion_depth.svg" style="z-index:-10; position: relative;"  />
  <figcaption>
  <p>Tested with Chrome version 96 and Firefox version 93</p>
  </figcaption>

</figure>

The "limit" bars show how we set the default recursion limit. The "segfault"
bars show how many calls it takes to cause a segmentation fault with the
following code:

```py
import sys; sys.setrecursionlimit(100_000)
def f(n):
    print(n)
    f(n+1)
f(0)
```

Different Python stack frames can take widely variable amounts of stack space, so
this benchmark is not perfect, but it gives a rough estimate of how much
recursion we can support.

In prior versions of Pyodide there were code paths with many big stack frames
that caused segmentation faults before hitting the recursion limit. In upcoming
version 0.19, we have plenty of extra stack space left over so hopefully we
won't see any stack overflows.

### Acknowledgements

We would like to thank [Joe Marshall](http://www.cs.nott.ac.uk/~pszjm2/) for his
valuable contributions in this area. We would also like to thank the Emscripten
team, who are unfailingly helpful. Without Emscripten, Pyodide could not exist.

## Some history

When I first started using Pyodide in summer 2020, my plan was to use it to
display certain niche mathematical charts. I hacked the Monaco editor to make it
behave like a REPL, and then connected Jedi to Monaco intellisense so that
interactive documentation for my custom chart API could appear in the REPL as
the user typed. This did not go as planned because of recursion errors. The
following code reproduces the problem:

```py
import jedi
import numpy
jedi.Interpreter("numpy.in1d([1,2,3],[2]).", [globals()]).complete()
```

Run this in [Pyodide
v0.16](https://pyodide-cdn2.iodide.io/v0.16.1/full/console.html) in Chrome and
you will see "RangeError: Maximum call stack size exceeded". In Pyodide v0.16,
there is only enough stack space for a call depth of 120. Jedi needs more than
this.

## How much stack space are we working with?

[In Chromium, the stack is 984 kilobytes.](https://chromium.googlesource.com/v8/v8/+/d2b4292ca73dd2c70d007fcb7ac423c3d2095329/src/common/globals.h#88)
In Firefox, the stack size is several times larger. However, for some reason
Python function calls takes up significanly more space in Firefox. Firefox still
comes out ahead overall, but the difference isn't as large as it looks like it
would be based on stack size alone.

In any case, 984 kilobytes is a significant amount of space. Just what is
happening that Jedi uses that much space in 120 Python call frames? That is an
average of more than 8 kilobytes per call frame!

## The cause of the large stack usage: function pointer cast emulation!

The poor stack performance has to do with the ABI for calling function pointers.
When there is a stack overflow in Pyodide v0.17, we will see a long repeating
sequence consisting of the following call frames:

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
`byn$fpcast-emu$_PyEval_EvalFrameDefault` emulate function pointer casts. In
other words, they are there to handle the case where we've called
`PyFunction_Vectorcall` or `PyEval_EvalFrameDefault` with the wrong number of
arguments. They also are slow and waste a huge amount of stack space. (The
`byn$` prefix indicates that these functions don't come from a function in the
source code, but were instead generated by a code transformation on the finished
web assembly binary by a tool called Binaryen.)

### Why are there function pointer casts?

Many popular Python packages are written partially in C for performance reasons.
Python comes with several possible conventions for calling a C function from
Python. For example, a typical calling convention is `METH_VARARGS` which allows
a function to be invoked with zero or more positional arguments which are passed
as a tuple. No keyword arguments are allowed. The C function must be declared to
take two arguments: a `self` argument which will be the Python function object
and an `args` argument which is the tuple of arguments:

```C
static PyObject*
my_varargs_function(PyObject *self, PyObject *args_tuple){
   // Unpack args_tuple, then do stuff
}
```

A second common calling convention is `METH_NOARGS` which is for zero argument
functions. Surprisingly, the `METH_NOARGS` C function is still supposed to take
two arguments:

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
specification. However, C compilers for native targets produce code that works
fine. Since the code works, package authors cast function pointers and move on
with their lives. These casts are all over the place in the existing Python
ecosystem.

### Function pointer casts don't work in WebAssembly

In x86, making a dynamic call (in other words, calling a function pointer) is
the same process as making a static call. Arguments and a return address are
pushed onto a stack, and a jump is performed. The only difference is that in the
case of a static function call, the target of the jump is known at compile time,
whereas in the case of a dynamic call, it is determined by a variable.

In WebAssembly, there are two distinct instructions `call` for static calls and
`call_indirect` for dynamic calls. The `call_indirect` instruction takes a
compile-time determined argument (an immediate) that indicates the expected
signature of the function pointer being called. Before actually executing the
call, the WebAssembly runtime checks that the signature of the function pointer
matches the asserted signature and if it doesn't it throws an error.

So we call `my_noargs_function2` through a `call_indirect` instruction which
asserts that it takes two arguments. The WebAssembly runtime checks and sees
that in fact, `my_noargs_function2` only expects one argument, and it crashes
with an "indirect call signature mismatch" error.

## Ways to fix the call signature mismatch errors

### 1. EMULATE_FUNCTION_POINTER_CASTS

The Emscripten compiler comes with a flag that makes it emulate function pointer
casting. This is what we have been using to resolve the troubles. However, it
comes with a high cost: it is slow, it uses up large amounts of stack space, and
it increases code size by a lot. Also, it makes calling a function pointer from
Javascript inconvenient, and in particular breaks dynamic linking and many
Emscripten ports which implement C libraries with Javascript code. In upstream
Emscripten, EMULATE_FUNCTION_POINTER_CASTS doesn't work with dynamic linking at
all. It was only due to complicated patches contributed by Joe Marshall that we
were able to use it.

I will describe later how EMULATE_FUNCTION_POINTER_CASTS works and why it
imposes such large costs.

### 2. Just patch the packages

We could just go through and patch the Python C packages to fix their function
declarations. However, there is no easy way to detect these function pointer
casts (there's no compiler setting that can generate warnings about them). It is
also tedious to locate the problematic code. The packages are generally happy to
accept these patches but it takes time to review them. Without any automated
tool to detect the problem, there are likely to be regressions. Overall, this
solution would generate too large a maintenance burden for us to handle.

### 3. Automate the patching

We can write code to analyze the clang abstract syntax tree, locate the bad
pointer casts, and either automatically rewrite the source or raise an error if
the problem is too hard to fix. The idea here is that we scan the AST for
declarations that look like:

```C
PyMethodDef my_method_def = {
    "my_method", // the name
    (PyCFunction)my_method, // The C function pointer
    METH_NOARGS, // the calling convention
};
```

where `my_method` has a number of arguments different than 2. Then we locate the
definition of `my_method`:

```C
static PyObject*
my_method(PyObject* self){
    // ...
}
```

and we patch in a second argument:

```C
static PyObject*
my_method(PyObject* self, PyObject *_ignored){
    // ...
}
```

We also must patch each spot where `my_method` is called to add a second `NULL`
argument. We fix a handful of other common problematic declarations as well. If
the problem spans multiple files or occurs inside of a macro expansion then we
just raise an error indicating the problem location and someone can manually
patch the source.

I have mostly-working code to do this, but there are a lot of weird edge cases
to take into account and the code is complex.

### 4. Trampolines

When calling from Javascript into WebAssembly, the calls behave like Javascript
function calls: if we give the wrong number of arguments, it works anyways.
Excess arguments are ignored and missing arguments are filled in with 0. The bad
function calls only occur at a small number of call sites, so if we patch in a
trampoline at each of these call sites that calls a Javascript function that
calls back into WebAssembly, we can fix the problems. This is the solution we
are currently using.

Explicitly, we make a trampoline:

```C
// EM_JS is a C macro which lets us declare a Javascript function
// which we can invoke from C.
EM_JS(
PyObject*,
method_call_trampoline, (
    PyCFunction func, // In Javascript, all arguments are Numbers.
    PyObject *self,
    PyObject *args,
    PyObject *kwargs
), {
    // function pointers are indexes into `wasmTable`.
    // look up the function we are supposed to call and then call it.
    // We're calling from Javascript, so if the function actually takes three
    // arguments or only one, in any case this call won't crash
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

Similarly, the interpreter normally calls a function which supports `VARARGS`
and `KEYWORD_ARGS` as follows:

```C
PyObject *result = meth(args[0], argstuple, kwdict);
```

we replace this with:

```C
PyObject *result = method_call_trampoline(meth, args[0], argstuple, kwdict);
```

### 5. Better compiler support for function pointer casts

Another possible solution is fixing the drawbacks with the compiler-supported
`EMULATE_FUNCTION_POINTER_CASTS`. Our currently-implemented solution 4 of using
trampolines requires there to be a limited number of call sites, so that
the patch is manageable. In other code bases, that could fail to be the case.
Compiler-generated function pointer cast emulation could be faster and more
flexible.

## Better compiler support for function pointer casts using an LLVM pass

It is possible to LLVM pass to implement compiler-generated function pointer
cast emulation in a way that has a negligible impact on speed, stack usage, and
code size. The solution will also impose no surprising difficulties for calls
from Javascript into WebAssembly or for dynamic linking. It does change the ABI
so it requires the linked modules to be aware of this different ABI. We also
assume that (1) most function pointers are called with the correct signature
most of the time and (2) only a small number of types of function are cast into
the wrong signature and called. Both of these assumptions are met in Python.

### How `EMULATE_FUNCTION_POINTER_CASTS` works

Emscripten implements `EMULATE_FUNCTION_POINTER_CASTS` in a Binaryen pass.
Binaryen is an optimizer for completely linked WebAssembly modules. The way that
`EMULATE_FUNCTION_POINTER_CASTS` works is that Binaryen walks through the
`wasmTable` which is used to make indirect calls and replaces each function with
an adaptor which expects a fixed, much larger number of arguments. The argument
list can be padded with zeroes at the end to ensure that it is always called
with the same number of arguments.

So if `f` is a function:

```C
int f(float x, int y);
```

Then the `EMULATE_FUNCTION_POINTER_CASTS` pass replaces a call `res = f(x,y)`
with:

```C
uint_64 temp = f_adaptor(
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
called with anywhere in any of the Python ecosystem code (probably this happens
in blas or lapack).

This explains the drawbacks:

1. It takes up a lot of stack space because for every function pointer call we
   have to call an extra adaptor which uses up ~ 8\*61 = 488 bytes of stack
   space.

2. It's slow because a lot of time is spent converting between `uint_64` and
   other data types.

3. It increases code size because every single function needs a corresponding
   adaptor function.

4. It messes up calling from Javascript because when we do a function table
   lookup we get the weird function which expects to receive 61 `uint_64`s
   rather than the original arguments.

To fix calls from Javascript, we have to make a second table which maps from
`f_adaptor_index` to `f_index`, and then instead of `wasmTable.get(func_ptr)` we
say `wasmTable.get(adaptorToOrigFunctionMap.get(func_ptr))`. All Javascript code
that calls into WebAssembly has to be adjusted in this way. When we used
`EMULATE_FUNCTION_POINTER_CASTS` we always got errors due to confusion between
pointers to the adaptors and the normal function pointers.

### How to do better

We make a list of function signatures that somewhere get cast and called with
the wrong arguments. This might look like:

1. `(void) -> i32`
2. `(i32) -> i32`
3. `(i32, i32) -> i32`

Then when we take a function pointer, if its signature is on the list, we
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
} else if(f_sig == FP_SIG_UNKNOWN){
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
   arguments, there is almost no cost (branch prediction should guess this
   case).

2. The effect on code size is much milder because we only need to include a few
   trampolines. Careful consideration shows that we don't actually need a
   different trampoline for each pair of signatures, in practice it could be
   linear in the number of signatures we need casting support for.

3. For function pointers with a signature not in the casting support list, we
   won't generate any of this code.

4. Calling code needs to know to mask out the signature bits before calling a
   function pointer, but this is all it needs to know.

This strategy cannot be implemented as a Binaryen pass, because it is impossible
to tell when a function pointer is being taken in Binaryen. However, in llvm
bytecode there is a dedicated instruction for taking a function pointer and we
can visit these instructions in an llvm pass and add extra instructions to set
the signature bits.

## Conclusion

Function pointer casting is unusual in most code bases but quite common in
Python code. Because function pointer casting works in native code but crashes
in WebAssembly, we need to find some way to handle it. In general, a lot of the
work of porting software deals with fixing small incompatibilities that break
the code when used in a new environment.

There are many different possible approaches to handling function pointer casts.
I would group them into three main categories: patch the packages (i.e., patch
the functions we are calling), patch the Python interpreter (i.e., patch the
call sites), or patch the compiler. In our case patching the call sites with
Javascript trampolines was the best approach. Patching the compiler is the most
general approach, but the existing solution that Emscripten offers has very
serious drawbacks. In future work, we may implement a better compiler-based
solution using custom llvm passes to store extra signature data in function
pointers.

Pyodide runs into similar function signature problems at link time: for example, we
have a hard time building scipy because it defines functions with a return value
of `int` but then links them with other files that declare them as returning
`void`. This forces us to write complicated patches which are difficult to
maintain. Using llvm passes or other compiler-based solutions to solve some of
these problems would allow us to reduce the number of patches which should make
it easier to keep up with updates.
