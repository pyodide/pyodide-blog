---
title: "JavaScript Promise Integration and the sync/async problem in Pyodide"
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
async task is completed. There was no way to do this in Pyodide.

JavaScript Promise integration (JSPI) is a new WebAssembly standard that gives
us a way to work around this. It allows us to make a call that seems synchronous
from the perspective of C but is actually asynchronous from the perspective of
JavaScript. In other words, you can have a blocking C call without blocking the
JavaScript main thread. JSPI enables this by stack switching.

For Pyodide, this means that by using this technology we can finally implement
things like `time.sleep()`, `input()` or `requests.get()`.

JavaScript Promise integration became a stage 4 finished proposal on April 8,
2025. Chrome 137, released May 27th, 2025, [supports JavaScript Promise
Integration](https://developer.chrome.com/release-notes/137#javascript_promise_integration).
This will make Pyodide quite a lot more useful.

In this blog post, I will first give an explanation of how Pyodide's stack
switching API works. In followup posts I will discuss some of the technical
details of the implementation.

Thanks to Antonio Cuni, Guy Bedford, and Gyeongjae Choi for feedback on drafts.
Thanks also to my current employer Cloudflare and my former employer Anaconda
for paying me to work on this.

## Pyodide's stack switching API

Pyodide defines a Python function `run_sync` which suspends the C stack until
the given awaitable is completed. This solves the sync/async problem.

For example, suppose you have Python code that makes an HTTP request using the
builtin `urllib` library and you want to use it in Pyodide. The code might look
like this:

```py
import urllib.request

def make_http_request(url):
    with urllib.request.urlopen(url) as response:
        return response.read().decode('utf-8')

def do_something_with_request(url):
    result = make_http_request(url)
    do_something_with(result)
```

The native implementation of `urllib` requires low-level socket operations which
are not available in the browser. To make `urllib` work in Pyodide, we need to
implement it based on the `fetch` browser API. However, `fetch` is asynchronous
which means we cannot directly use it in a synchronous Python function.

```py
from js import fetch

async def async_http_request(url):
    resp = await fetch(url)
    return await resp.text()

# Problem: we need to make this function async
async def do_something_with_request(url):
    result = await async_http_request(url)
    do_something_with(result)
```

This is the typical sync/async problem: when you introduce an asynchronous API
call, you need to change the code all the way up the call stack to be
asynchronous as well.

Pyodide's `run_sync` function helps with this. It allows us to call asynchronous
functions synchronously from Python code.

```py
from pyodide.ffi import run_sync
from js import fetch

async def async_http_request(url):
    resp = await fetch(url)
    return await resp.text()

def make_http_request(url):
    # make_http_request is a synchronous function that will block until the async function completes
    return run_sync(async_http_request(url))

# Use make_http_request in a non-async function 🎉
def do_something_with_request(url):
    result = make_http_request(url)
    do_something_with(result)
```

Here, `run_sync` wraps the awaitable and allows returning the result
synchronously. This helps avoid changing the entire codebase to be asynchronous
when porting synchronous Python code to Pyodide.

This `run_sync` function is integrated in the Pyodide's event loop since Pyodide
version 0.27.7. If your browser supports JSPI, both `asyncio.run()` and
`event_loop.run_until_complete()` will use stack switching to run the async
task.

The builtin `urllib` library still does not work in Pyodide but `urllib3`
supports Pyodide and will use stack switching if it is possible thanks to 
[work contributed by Joe Marshall](https://github.com/urllib3/urllib3/pull/3427).
This also means we fully support `requests` since it is a dependency of
`urllib3`.

### When can we use `run_sync`?

`run_sync()` works only if the JavaScript runtime supports stack switching and
Javascript code calls into Python in an asynchronous way. If a `Promise` or
other thenable is returned, stack switching will be enabled. If the function is
synchronous, it will be disabled. Specifically, stack switching is enabled when:
1. we call `pyodide.runPythonAsync()`,
2. we call an asynchronous Python function, or
3. we call a synchronous Python function with `callPromising()`.

Stack switching is disabled when:
1. we call `pyodide.runPython()` or
2. we call a synchronous Python function directly.

It is possible to query whether or not stack switching is enabled with
`pyodide.ffi.can_run_sync()`.

For example, if you call `do_something_with_request()` from JavaScript without
using `callPromising()`:

```js
do_something_with_request = pyodide.globals.get("do_something_with_request");
do_something_with_request("https://example.com");
```

It will raise:

```py
RuntimeError: Cannot stack switch because the Python entrypoint was a synchronous
              function. Use pyFunc.callPromising() to fix.
```

You need to call it like
```js
do_something_with_request.callPromising("https://example.com")
```

This returns a Javascript promise, even though a synchronous Python function would
ordinarily return the value directly.

Executing Python code that uses `run_sync()` requires using
`pyodide.runPythonAsync()` instead of `pyodide.runPython()`:

```js
pyodide.runPython("run_sync(asyncio.sleep(1))"); // RuntimeError: Cannot stack switch ...
pyodide.runPythonAsync("run_sync(asyncio.sleep(1))"); // Works fine
```


## Using JSPI directly

All of these examples are designed to work with NodeJS 24. Node must be started
with `--experimental-wasm-jspi` since Node 24 was released from a
version of v8 just before the feature gate was removed.

We'll start with a basic example of the JSPI API. The full example is
[here](https://github.com/hoodmane/jspi-blog-examples/tree/main/2-basic-example).

Suppose we have an async JavaScript function:
```js
async function awaitFakeFetch(x) {
    console.log("JS: fetching (fake)...");
    await sleep(1000); // simulate a slow "fetch" request
    console.log("JS: fetched (fake)");
    return x + 1;
}
```
which we want to call from WebAssembly. From C's perspective, `awaitFakeFetch()`
will return an `int`. We use it in the following C function:
```C
// in our real code, we would be running a Python function here
WASM_EXPORT("fakePyFunc")
void fakePyFunc(int x) {
    logString("About to call fakeFetch");
    int res = awaitFakeFetch(x);
    logString("Got result:");
    logInt(res);
}
```
We can't use libc functions like `printf` because we are compiling to target
`wasm32-unknown-unknown` which comes with no libc implementation. Instead we use
this custom `logString()` function which we will define in JavaScript.

We compile and link this C file with clang with
```sh
clang -I../include -target wasm32-unknown-unknown -Wl,--no-entry -nostdlib -O2 \
    basic.c -o basic.wasm
```
The build script is
[here](https://github.com/hoodmane/jspi-blog-examples/blob/main/2-basic-example/build.sh).
To instantiate the WebAssembly module, we need JavaScript definitions for the
imports `sleep`, `logInt` and `logString`.

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
To make `awaitFakeFetch()` into a suspending import, we wrap it with
`new WebAssembly.Suspending()`.
```js
const imports = {
  env: {
    logInt,
    logString,
    awaitFakeFetch: new WebAssembly.Suspending(awaitFakeFetch),
  },
};

export const { instance } = await WebAssembly.instantiate(
  readFileSync("basic.wasm"),
  imports,
);
const HEAP = new Uint8Array(instance.exports.memory.buffer);
```
To call `fakePyFunc()`, we need to wrap the export in `WebAssembly.Promising()`:
```js
export const fakePyFunc = WebAssembly.promising(
  instance.exports.fakePyFunc,
);
```
And now we call `fakePyFunc(3)` and it will log:
```
JS: Calling pythonFunction(3)
C: About to call awaitFakeFetch
JS: fetching (fake)...
<pauses for 1000 ms>
JS: fetched (fake)
C: Got result:
C: 4
```

## A separate function to suspend

We can separate the function that blocks from the original promise-returning
function. This lets us schedule multiple promises from C and only later block
for them.

Suppose now we have two async operations say `asyncHttpRequest()` and
`asyncDbQuery()`. They will return promises. In C, the return type will be
`__externref_t` which is an opaque reference to a JavaScript object. The only
operations allowed on them are assignment and calling functions. Attempting to
add them, dereference them, take their address, use them as struct fields or
pass them as arguments to a varargs function all will result in compile errors.
The only thing we can do with these `__externref_t` promises is call
`awaitInt()` to suspend for the integers they resolve to.
```C
WASM_EXPORT("pythonFunction")
void pythonFunction(int x) {
    logString("Call asyncFakeHttpRequest");
    __externref_t promiseHttpRequest = asyncFakeHttpRequest(x);
    logString("Call asyncFakeDbQuery");
    __externref_t promiseDbQuery = asyncFakeDbQuery(x);
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
async function asyncFakeHttpRequest(x) {
    // Actually just sleep lol
    await sleep(500);
    return x + 1;
}
async function asyncFakeDbQuery(x) {
    // Actually just sleep lol
    await sleep(1000);
    return x * x;
}
```
Only `awaitInt` needs to be a `Suspending` import, the async functions just
return promises (represented as `__externref_t` in C).
```js
const imports = {
    env: {
        logInt,
        logString,
        asyncFakeHttpRequest,
        asyncFakeDbQuery,
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
written into a second stack located in the WebAssembly linear memory.
The stack pointer is a mutable global variable which is not thread safe. For
example, consider the following C code:
```C
// Escape is a no-op function to ensure that stack space is actually allocated.
// Without this, clang will optimize out stack operations.
void escape(void* x);
void sleep(int);

void allocateOnStackAndSleep(void) {
    int x[] = {7};
    // Force the compiler to store x on the linear memory stack
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

This happens because `emcc` implements the C stack using a combination of the
native WebAssembly stack (managed by the WebAssembly VM) and a shadow stack in
linear memory (which the WebAssembly VM knows nothing about). When doing stack
switching, the WebAssembly VM only handles the native stack. Unless we handle
the shadow stack ourselves, it will go out of sync.

These other two functions look as follows:
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
Escape is a no-op:
```js
function escape(x) { }
```
As usual we have to define our imports, compile and instantiate the WebAssembly
module. `sleep()` is our only suspending import. We need to wrap
`allocateOnStackAndSleep()` and `victim()` in `Webassembly.promising()` since they
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

## Conclusion

JavaScript promise integration finally lets us run synchronous Python code that
consumes asynchronous JavaScript APIs. Pyodide 0.27.7 fully supports JSPI in
Chrome 137, in Node 24 with the `--experimental-wasm-jspi` flag, in Firefox with
the `javascript.options.wasm_js_promise_integration` flag. There will soon be a
version of Cloudflare Python workers that supports JSPI as well.

Using JSPI as a WebAssembly developer is unfortunately quite hard and there is
still limited toolchain support for it. The WebAssembly native stack is
automatically switched but separate work must be done to keep the linear memory
stack in sync. Using an appropriate data structure we can do this efficiently.
It will also only work with C code that is itself thread safe.

Another major difficulty that arises in using JSPI is that we cannot stack
switch through JavaScript stack frames. I will write a second blog post on this
topic describing this problem and how we deal with it in Pyodide.
