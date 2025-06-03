---
title: "WebAssembly stack switching and the sync async problem"
date: 2025-05-13T13:33:51-04:00
draft: true
tags: ["announcement"]
# author: "Me"
# author: ["Me", "You"] # multiple authors
showToc: true
TocOpen: false
draft: false
hidemeta: false
comments: false
description: "Desc Text."
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

Writing Python code in the browser, we constantly run into what I call the
sync/async problem. Namely, most Python code and most libc functions are
synchronous, but most JavaScript APIs are asynchronous. For example, `urllib`
offers a synchronous API to make a request, but in JavaScript, the normal way to
make a request is with the `fetch` API which is asynchronous. Python also has
APIs like `event_loop.run_until_complete()` which are supposed to block until an
async task is completed. There was simply no way to do this.

JavaScript Promise integration is a new WebAssembly standard that gives us a way
to work around this. It allows us to make a call that seems synchronous from
the perspective of C but is actually asynchronous from the perspective of
Python.

JavaScript Promise integration became a stage 4 finished proposal on April 8,
2025. Chrome 137, released May 27th, 2025, [supports JavaScript Promise
Integration](https://developer.chrome.com/release-notes/137#javascript_promise_integration).
This will make Pyodide quite a lot more useful.

Thanks to Antonio Cuni for helpful feedback.

## Pyodide's stack switching API

The function `run_sync` stack switches for the resolution of any Python
awaitable. For example:
```py
from pyodide.ffi import run_sync
from js import fetch

async def async_http_request(url):
    resp = await fetch(url)
    return await resp.text()

def await_async_http_request(url):
    # Suspend for async_http_request to complete
    return run_sync(async_http_request(url))
```
If we call `await_async_http_request()` from JavaScript normally like
`await_async_http_request("https://example.com")`, it will raise an error. In
order to suspend for a promise, we must make a "promising" call into Python, and
the result will itself be a promise. However, for API compatibility, calling a
synchronous Python function cannot return a promise. If we want to enable stack
switching, we need to call it like
`await_async_http_request.callPromising("https://example.com")`. This returns a
promise. See the full example
[here](https://github.com/hoodmane/jspi-blog-examples/blob/main/1-pyodide-api/pyodide_example.mjs).

## Using JSPI directly

We'll start with a basic example of the JSPI API. The full example is
[here](https://github.com/hoodmane/jspi-blog-examples/tree/main/2-basic-example)

Suppose we have an async JavaScript function:
```js
async function awaitAsyncHttpRequest(x) {
    // Actually just sleep lol
    console.log("JS: sleeping");
    await sleep(1000);
    console.log("JS: slept");
    return x + 1;
}
```
which we want to call from WebAssembly. From C's perspective, `awaitAsyncHttpRequest()`
will return an `int`. We use it in the following C function:
```C
// This doesn't actually have anything to do with Python, but it would in our
// application to the Pyodide code base.
WASM_EXPORT("pythonFunction")
void pythonFunction(int x) {
    logString("About to call awaitAsyncHttpRequest");
    int res = awaitAsyncHttpRequest(x);
    logString("Got result:");
    logInt(res);
}
```
We compile and link this C file with clang. We compile with
```sh
clang -I../include -target wasm32-unknown-unknown -Wl,--no-entry -nostdlib -O2 \
    basic.c -o basic.wasm
```
The build script is
[here](https://github.com/hoodmane/jspi-blog-examples/blob/main/2-basic-example/build.sh).
To instantiate the WebAssembly module, we need JavaScript definitions for the
imports `sleep`, `logInt` and `logString`:
```js
function logInt(x) {
    console.log("C:", x);
}
function logString(ptr) {
    let endPtr = ptr;
    // Locate null byte
    while (HEAP[endPtr]) {
        endPtr ++;
    }
    console.log("C:", new TextDecoder().decode(HEAP.slice(ptr, endPtr)));
}
function sleep(ms) {
    return new Promise(res => setTimeout(res, ms));
}
```
And we need to make an `imports` object and instantiate the WebAssembly module.
To make `awaitAsyncHttpRequest()` into a suspending import, we wrap it with 
`new WebAssembly.Suspending()`.
```js
const imports = {
  env: {
    logInt,
    logString,
    awaitAsyncHttpRequest: new WebAssembly.Suspending(awaitAsyncHttpRequest),
  },
};

export const { instance } = await WebAssembly.instantiate(
  readFileSync("basic.wasm"),
  imports,
);
const HEAP = new Uint8Array(instance.exports.memory.buffer);
```
To call `pythonFunction()`, we need to wrap the export in `WebAssembly.Promising()`:
```js
export const pythonFunction = WebAssembly.promising(
  instance.exports.pythonFunction,
);
```
And now we call `pythonFunction(3)` and it will log:
```
C: About to call awaitAsyncHttpRequest
JS: sleeping
<pauses for 1000 ms>
JS: slept
C: Got result:
C: 4
```

## A separate function to suspend

We can separate the function that blocks from the original promise-returning
function. This lets us schedule multiple promises from C and only later block
for them.

So now `asyncHttpRequest()` and `asyncDbQuery()` will return promises. In C,
they have type `__externref_t` which is an opaque reference to a JavaScript
object. The only operations allowed on them are assignment and calling
functions. Attempting to add them, dereference them, take their address, use
them as struct fields or pass them as arguments to a varargs function all will
result in compile errors. The only thing we can do with these `__externref_t`
promises is call `awaitInt()` to suspend for the integers they resolve to.
```C
WASM_EXPORT("pythonFunction")
void pythonFunction(int x) {
    logString("Call asyncHttpRequest");
    __externref_t promiseHttpRequest = asyncHttpRequest(x);
    logString("Call asyncDbQuery");
    __externref_t promiseDbQuery = asyncDbQuery(x);
    logString("Suspending for promiseHttpRequest");
    int res1 = awaitInt(promiseHttpRequest);
    logString("-- got res1:");
    logInt(res1);

    logString("Suspending for promiseDbQuery");
    int res2 = awaitInt(promiseDbQuery);
    logString("Got res2:");
    logInt(res2);
}
```
Our JavaScript imports are then:
```js
function awaitInt(x) {
    // This is just the identity function...
    // We need it so we can wrap it with WebAssembly.Suspending
    return x;
}
async function asyncHttpRequest(x) {
    // Actually just sleep lol
    await sleep(500);
    return x + 1;
}
async function asyncDbQuery(x) {
    // Actually just sleep lol
    await sleep(1000);
    return x * x;
}
```
Only `awaitInt` needs to be a `Suspending` import, the async fucntions just
return promises.
```js
const imports = {
    env: {
        logInt,
        logString,
        asyncHttpRequest,
        asyncDbQuery,
        awaitInt: new WebAssembly.Suspending(awaitInt),
    }
}
```
We need the same boilerplate as before to instantiate the WebAssembly module and
wrap `pythonFunction` with `WebAssembly.promising`. And now we can call
`pythonFunction(4)` and it will log:
```
C: Call asyncHttpRequest
JS: asyncHttpRequest: sleeping
C: Call asyncDbQuery
JS: asyncDbQuery: sleeping
C: Suspending for promiseHttpRequest
JS: asyncDbQuery: slept
JS: asyncHttpRequest: slept
C: -- got res1:
C: 5
C: Suspending for promiseDbQuery
C: Got res2:
C: 16
```

To handle more general promises that don't necessarily resolve to an `int`, we
could use an `awaitExternRef()` function where the return value is an
`__externref_t`. Then we could use a separate `externRefToInt()` function to
convert the result to an integer.

This example is
[here](https://github.com/hoodmane/jspi-blog-examples/tree/main/3-separate-await).

## Troubles with reentrancy

JSPI handles switching the native call stack. But the native callstack is opaque
in WebAssembly, so if a pointer is taken to a variable, that variable has to be
written into a stack which is located in the WebAssembly linear memory. The
stack pointer is a mutable global variable which is not thread safe. For
example, consider the following C code:
```C
// Escape is a no-op function to ensure that stack space is actually allocated.
// Without this, clang will optimize out stack operations.
void escape(void* x);
void sleep(int);

void allocateOnStackAndSleep(void) {
    int x[] = {7};
    // Force the compiler to put x on the stack
    escape(x);
    sleep(0);
}
```
The function `allocateOnStackAndSleep()` will be compiled to code that looks
like the following in the WebAssembly text format:
```wat
(func $allocateOnStackAndSleep (type 0)
  (local i32)
  ;; int x[] = {7};
  ;; allocate 16 bytes on the stack
  ;; we only need 4 but the stack pointer must always be aligned to 16
  global.get 0 ;; __stack_pointer
  i32.const 16 
  i32.sub
  local.tee 0 ;; stores the current stack pointer into local 0
  global.set 0 ;; and into __stack_pointer
  ;; initialize the list with the 7
  local.get 0
  i32.const 7
  i32.store
  ;; escape(x);
  local.get 0
  call 0
  ;; sleep(0);
  i32.const 0
  call 1
  ;; restore stack pointer
  local.get 0
  i32.const 16
  i32.add
  global.set 0)
```
If `sleep()` stack switches, then we could call another `victim()` function that
allocates its own variables on the stack. If `victim()` __also__ stack switches,
then `allocateOnStackAndSleep()` will exit and reset the stack pointer,
deallocating stack space that `victim()` is still using. Calling a third
`overwritesVictimsStack()` function that allocates on the stack after
`allocateOnStackAndSleep()` exits and before `victim()` resumes would then
overwrite victim's stack space.

Explicitly these other two functions can look as follows:
```C
WASM_EXPORT("overwritesVictimsStack")
void overwritesVictimsStack(void) {
    char x[] = "this is a long string and it will write over a lot of other stuff!";
    escape(x);
}

WASM_EXPORT("victim")
void victim() {
    char x[] = "victim's important string";
    escape(x);
    logStrStr("victim1", x);
    sleep(500);
    // This next line will print a different value!
    logStrStr("victim2", x);
}
```
Sleep has the traditional JavaScript definition:
```js
function sleep(ms) {
    return new Promise(res => setTimeout(res, ms));
}
```
Escape is a no-op:
```js
function escape(x) { }
```
As usual we have to define our imports, compile and instantiate the WebAssembly
module. `sleep()` is our only suspending import. We need to wrap
`allocateOnStackAndSleep` and `victim` in `Webassembly.promising()` since they
stack switch:
```js
const allocateOnStackAndSleep = WebAssembly.promising(
  instance.exports.allocateOnStackAndSleep,
);
const victim = WebAssembly.promising(instance.exports.victim);
const overwritesVictimsStack = instance.exports.overwritesVictimsStack;
```
Last, we need to call the functions in the appropriate order:

```js
// allocates 16 bytes on stack
const pResetStack = allocateOnStackAndSleep();
// allocates more data on stack below `allocateOnStackAndSleep()`.
const pVictim = victim();
// Resets stack pointer
await pResetStack;
overwritesVictimsStack();
await pVictim
```
Running this prints:
```
victim1 my important string
victim2 l write over a lot of other stuff!
```

This example is
[here](https://github.com/hoodmane/jspi-blog-examples/tree/main/4-reentrancy-trouble).

## The simplest fix for reentrancy

We can fix the problem by redefining `sleep()` to save the region of stack that
the sleeping thread cares about and restore it when we are done sleeping. We
need to record the top of the stack when each thread enters:
```js
let stackTop;
function promisingExport(func) {
    const promisingFunc = WebAssembly.promising(func);
    return async function(...args) {
        stackTop = stackPointer.value;
        return await promisingFunc(...args);
    } 
}

const allocateOnStackAndSleep = promisingExport(
  instance.exports.allocateOnStackAndSleep,
);
const victim = promisingExport(instance.exports.victim);
```
Then when a thread sleeps we can save the stack pointer and the range of stack
that we care about. When the thread is restored, we can restore all this.
```js
async function sleep(ms) {
    // Save
    const curStackTop = stackTop;
    const curStackBottom = stackPointer.value;
    const savedMemory = HEAP.slice(curStackBottom, curStackTop);
    // Suspend
    await new Promise(res => setTimeout(res, ms));
    // Restore the stack
    HEAP.subarray(curStackBottom, curStackTop).set(savedMemory);
    stackPointer.value = curStackBottom;
    stackTop = curStackTop;
}
```
In a more general case, we would run this code around `awaitInt()` or
`awaitExternRef()`.

This example is here:
[here](https://github.com/hoodmane/jspi-blog-examples/tree/main/5-reentrancy-simple-fix).

This code isn't very optimal, because we eagerly copy the stack. If no other
task writes over this stack space while we are suspended, then we don't need to
copy it. The most efficient way to do this is to make an object that records the
range that our thread cares about and an optional buffer with just the data that
has actually been overwritten. When a thread is restored, it will check if some
other thread cares about the stack range it is overwriting and if so save that
data. The code that handles this is substantially more complicated so I won't
explain it here, but you can find it
[here](https://github.com/hoodmane/jspi-blog-examples/blob/main/6-reentrancy-full-fix/stack_state.mjs)

