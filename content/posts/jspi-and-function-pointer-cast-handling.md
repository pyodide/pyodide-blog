---
title: "JSPI and function pointer cast handling"
date: 2025-08-14
draft: true
tags: []
author: "Hood Chatham"
# author: ["Me", "You"] # multiple authors
showToc: true
TocOpen: false
draft: false
hidemeta: false
comments: false
description: ""
# canonicalURL: "https://canonical.url/to/page"
disableHLJS: true # to disable highlightjs
disableShare: false
hideSummary: false
searchHidden: true
ShowReadingTime: true
ShowBreadCrumbs: true
ShowPostNavLinks: true
cover:
    # image: "<image path/url>" # image path/url
    # alt: "<alt text>" # alt text
    # caption: "<text>" # display caption under cover
    relative: false # when using page bundles set this to true
    hidden: true # only hide on current single page
---

In the last post, I demonstrated how to use JSPI in a simple program written for
the `wasm32-unknown-unknown` platform. Of course, `wasm32-unknown-unknown` does
not support the libc standard library, so it does not work for real-world code.
Emscripten provides the `wasm32-unknown-emscripten` target which does support
these features.

The main additional problem that comes up when integrating with Emscripten is
the problem of JavaScript frames. Recall from the last post that to use
JavaScript Promise Integration, we wrap an async JavaScript function that we
want to use from C in `new WebAssembly.Suspending()` and we wrap the export in
`WebAssembly.promising()`:

```js
const imports = {
  env: {
    awaitFakeFetch: new WebAssembly.Suspending(awaitFakeFetch),
    // ... other imports
  },
};

export const { instance } = await WebAssembly.instantiate(
  readFileSync("myModule.wasm"),
  imports,
);
export const fakePyFunc = WebAssembly.promising(instance.exports.fakePyFunc);
```

If there are any JavaScript calls in betwen the call into WebAssembly
`fakePyFunc` and the call out to JavaScript `awaitFakeFetch`, the call to
`awaitFakeFetch()` will fail. Before JSPI existed, features in the C runtime
could be implemented using JavaScript frames and it would not make any
observable difference to the behavior of the program. Now it does.

JavaScript trampolines are used for:

* Handling function pointer casts
* C++ exceptions and Rust panics
* libffi/ctypes
* Dynamic loading of late-binding symbols

To fix the failure, there are two possible approaches: either we can somehow
replace the JavaScript frame with equivalent WebAssembly functionality, or we
can make the JavaScript frame cooperate with the stack switching. In practice,
both of these approaches are quite challanging to implement. In this post, we'll
focus on replacing the function pointer cast handling JS call with WebAssembly.

## Function pointer casts

I wrote [a blog post](content/posts/function-pointer-cast-handling.md) about
this problem in 2021. Python extensions often declare functions with one
signature, cast them to a different signature with more arguments, and call them
with extra arguments. The WebAssembly `call_indirect` function which calls a
function pointer traps if the function pointer does not have the expected type.
For example suppose we have code like this:
```C
typedef int (*F)(int, int);

int handler0(int x, int y) {
  logString("Handler 0 fetch x");
  int resx = awaitFakeFetch(x);
  logString("      ... fetch y");
  int resy = awaitFakeFetch(y);
  return x * y;
}

int handler1(int x) {
  logString("Handler 1 fetch x");
  int res = awaitFakeFetch(x);
  return res * res;
}

F handlers[] = {(F)handler0, (F)handler1 };

WASM_EXPORT("fakePyFunc")
void fakePyFunc(int func_index, int x, int y) {
  int res = handlers[func_index](x, y);
  logString("Got result:");
  logInt(res);
}
```
When we call `fakePyFunc()` with `func_index` set to `0` it works, but when set
to `1`, we get a crash:
```js
RuntimeError: null function or function signature mismatch
```
See the complete example
[here](https://github.com/hoodmane/jspi-blog-examples/tree/main/7-fpcast).

Calls from JavaScript into WebAssembly ignore extra arguments, so we had been
dealing with this situation before by adding a JavaScript trampoline:
```js
const imports = {
  env: {
    ...
    fpcastTrampoline(fptr, x, y) {
      return functionPointerTable.get(fptr)(x, y);
    },
    ...
  },
};
```
and then in C invoking the handler as follows:
```C
  fpcastTrampoline(handlers[func_index], x, y);
```
This fixes the function pointer casts but when we attempt to stack switch it
raises:
```js
SuspendError: trying to suspend JS frames
```
See the complete example
[here](https://github.com/hoodmane/jspi-blog-examples/tree/main/8-js-frame).

## Handling function pointer casts without JavaScript

Luckily, `wasm-gc` has added a `ref.test` instruction which can be used to check
the signature of a function before calling it. We can use this to count how many
arguments the function was actually defined with and cast it to the right
signature before making the call. Here is an example wat module

```wat
(module
  (type $zero_args (func (result i32)))
  (type $one_args (func (param i32) (result i32)))
  (type $two_args (func (param i32 i32) (result i32)))
  (import "env" "__indirect_function_table" (table $functable 1 funcref))
  (func (export "countArgs") (param $funcptr i32) (result i32)
        (local $funcref funcref)
    local.get $funcptr
    table.get $functable
    local.tee $funcref
    ref.test (ref $two_args)
    if
      i32.const 2
      return
    end
    local.get $funcref
    ref.test (ref $one_args)
    if
      i32.const 1
      return
    end
    local.get $funcref
    ref.test (ref $zero_args)
    if
      i32.const 0
      return
    end
    i32.const -1
    return
  )
)
```
Now we can use this as follows:
```C
typedef int (*F)(int, int);
typedef int (*F1)(int);
typedef int (*F0)(void);

WASM_IMPORT("countArgs")
int countArgs(F func);

int callHandler(F f, int x, int y) {
  int nargs = countArgs(f);
  switch (nargs) {
    case 2:  
      logString("Two arguments");
      return func(x, y);
    case 1:
      logString("One argument");
      return ((F1)func)(x);
    case 0:
      logString("Zero arguments");
      return ((F0)func)();
    default:
      logString("Bad handler");
      return -1;
  }
}

WASM_EXPORT("fakePyFunc")
void fakePyFunc(int func_index, int x, int y) {
  int res = callHandler(handlers[func_index], x, y);

  logString("Got result:");
  logInt(res);
}
```
We can use `wasm-as` to convert the wat to wasm and use `wasm-merge` to merge
`countArgs.wasm` with the compiled C code. `wasm-as` and `wasm-merge` are part
of binaryen. See the full build script here:
[here](https://github.com/hoodmane/jspi-blog-examples/tree/main/9-wat-count-args/build.sh).

This approach to handling function pointer casts has the disadvantage that it
requires wasm-gc which has only been supported in Safari since December of 2024.
Furthermore, on iOS using wasm-gc causes crashes. However, we do know that every
runtime that supports JSPI also supports wasm-gc, so we can use wasm-gc if we
can and otherwise fall back to using a JavaScript trampoline.

You can see the current code used to handle function pointer casts in the Python
interpreter
[here](https://github.com/python/cpython/blob/v3.14.0rc2/Python/emscripten_trampoline.c).


### A new clang intrinsic 

I added [a new clang intrinsic called
`__builtin_wasm_test_function_pointer_signature`](https://github.com/llvm/llvm-project/pull/150201)
so that we can test the runtime signature of a function pointer from C. Using
this, we can get rid of the `.wat` file and our `callHandler()` function looks
like:
```C
int callHandler(F f, int x, int y) {
  if (__builtin_wasm_test_function_pointer_signature(f)) {
    logString("Two arguments");
    return f(x, y);
  }
  if (__builtin_wasm_test_function_pointer_signature((F1)f)) {
    logString("One argument");
    return ((F1)f)(x);
  }
  if (__builtin_wasm_test_function_pointer_signature((F0)f)) {
    logString("Zero arguments");
    return ((F0)f)();
  }
  logString("Bad handler");
  return -1;
}
```

[Here's a pull request that updates Python to use the new
intrinsic.](https://github.com/python/cpython/pull/137470)

In the future, this should make dealing with these problems much cleaner.

