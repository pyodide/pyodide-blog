---
title: "Integrating JSPI with the WebAssembly C runtime"
date: 2025-07-03
draft: true
tags: []
author: "Hood Chatham"
# author: ["Me", "You"] # multiple authors
showToc: true
TocOpen: false
draft: false
hidemeta: false
comments: false
description: "Using JSPI with C code compiled to the wasm32-unknown-unknown target"
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


In my last post, I described the sync/async problem and explained that the new
JavaScript Promise Integration (JSPI) web standard allows us to solve it. I also
described the new Pyodide APIs which use JSPI to block for the resolution of
awaitables.

This post is focused on implementation details for a C program (e.g., CPython)
wanting to use JSPI. In this post, we will focus on C programs written for the
`wasm32-unknown-unknown` target. Such programs cannot use libc or most other C
libraries and so are very limited. In the next post, I will discuss the
additional problems that one needs to solve in order to use JSPI with the
`wasm32-unknown-emscripten` target (where in particular we may use libc).

Thanks to Antonio Cuni, Guy Bedford, and Gyeongjae Choi for feedback on drafts.
Thanks also to my current employer Cloudflare and my former employer Anaconda
for paying me to work on this.


## Using JSPI in a simple C program

All of these examples are designed to work with NodeJS 24. Node must be started
with `--experimental-wasm-jspi`. (Unfortunately, Node 24 was released just
before the JSPI feature gate was removed from v8.)

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
will return an `int`. We use it in the following C function. In Pyodide, the
function might use Python's C API to call a synchronous Python function that
wants to do async I/O further down the stack.
```C
WASM_EXPORT("fakePyFunc")
void fakePyFunc(int x) {
  logString("About to call awaitFakeFetch");
  int res = awaitFakeFetch(x);
  logString("Got result:");
  logInt(res);
}
```
We can't use libc functions like `printf` because we are compiling to the
`wasm32-unknown-unknown` target. Instead we use custom `logString()` and
`logInt()` functions which we will need to define in JavaScript.

We compile and link this C file with clang with
```sh
clang -I../include -target wasm32-unknown-unknown -Wl,--no-entry -nostdlib -O2 \
    basic.c -o basic.wasm
```
To instantiate the WebAssembly module, we need JavaScript definitions for the
imports `logInt` and `logString` and `awaitFakeFetch()`.

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
```
And we need to make an `imports` object and instantiate the WebAssembly module.
To make `awaitFakeFetch()` into a suspending import, we wrap it with
`WebAssembly.Suspending()`.
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
C: About to call awaitFakeFetch
JS: fetching (fake)...
<pauses for 1000 ms>
JS: fetched (fake)
C: Got result:
C: 4
```
If you have Node v24 and clang, you can try it out for yourself by cloning
http://github.com/hoodmane/jspi-blog-examples/, cding into the `2-basic-example`
directory, and running:
```sh
./build.sh
./basic.mjs
```
All the other examples can be run in the same way.


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
WASM_EXPORT("fakePyFunc")
void fakePyFunc(int x) {
  logString("Call fakeAsyncHttpRequest");
  __externref_t promiseHttpRequest = fakeAsyncHttpRequest(x);
  logString("Call fakeAsyncDbQuery");
  __externref_t promiseDbQuery = fakeAsyncDbQuery(x);

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
function awaitInt(promise) {
  // This is just the identity function...
  // We need it so we can wrap it with WebAssembly.Suspending
  return promise;
}

async function fakeAsyncHttpRequest(x) {
  console.log("JS: fakeAsyncHttpRequest: sleeping");
  await sleep(1000);
  console.log("JS: fakeAsyncHttpRequest: slept");
  return x + 1;
}

async function fakeAsyncDbQuery(x) {
  console.log("JS: fakeAsyncDbQuery: sleeping");
  await sleep(2000);
  console.log("JS: fakeAsyncDbQuery: slept");
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
    fakeAsyncHttpRequest,
    fakeAsyncDbQuery,
    awaitInt: new WebAssembly.Suspending(awaitInt),
  },
};
```
We need the same boilerplate as before to instantiate the WebAssembly module and
wrap `fakePyFunc()` with `WebAssembly.promising()`. And now we can call
`fakePyFunc(4)` and it will log:
```
C: Call fakeAsyncHttpRequest
JS: fakeAsyncHttpRequest: sleeping
C: Call fakeAsyncDbQuery
JS: fakeAsyncDbQuery: sleeping
C: Suspending for promiseHttpRequest
JS: fakeAsyncHttpRequest: slept
C: -- got res1:
C: 5
C: Suspending for promiseDbQuery
JS: fakeAsyncDbQuery: slept
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

JSPI handles switching the native WebAssembly call stack. However, the native
WebAssembly stack is opaque -- it is not possible to create pointers to data
stored on it.

For this reason, Clang implements the C stack using a combination of the native
WebAssembly stack and a "spill stack" in linear memory which the WebAssembly VM
knows nothing about. Since the spill stack is in WebAssembly linear memory, it
is addressable. Any value that we need to take a pointer to will go in the spill
stack. JSPI only handles switching the native WebAssembly stack. Unless we
handle the spill stack ourselves, it will go out of sync. 

For example, consider the following C code:
```C
WASM_IMPORT("sleep")
void sleep(int);

// Escape is a no-op function to ensure that spill stack space is actually
// allocated. Without this, clang will optimize out stack operations.
WASM_IMPORT("escape")
void escape(void* x);

WASM_EXPORT("allocateOnStackAndSleep")
void allocateOnStackAndSleep() {
  // Allocate 4 bytes on stack. (The stack is always required to be aligned to
  // 16 bytes so we'll bump the stack pointer by 16.)
  int x[] = {7};
  // Force the compiler to store x on the spill stack
  escape(x);
  // Let victim allocate its stack space
  sleep(0);
  // Now we will reset the stack pointer in the epilogue
}
```
The function `allocateOnStackAndSleep()` will be compiled to code that looks
like the following in the WebAssembly text format:


<style>
pre { line-height: 125%; }
td.linenos .normal { color: inherit; background-color: transparent; padding-left: 5px; padding-right: 5px; }
span.linenos { color: inherit; background-color: transparent; padding-left: 5px; padding-right: 5px; }
td.linenos .special { color: #000000; background-color: #ffffc0; padding-left: 5px; padding-right: 5px; }
span.linenos.special { color: #000000; background-color: #ffffc0; padding-left: 5px; padding-right: 5px; }

.pygments {
  font-size: .78em;
}

.highlight .hll { background-color: #49483e }
.highlight  { background: #272822; color: #f8f8f2 }
.highlight .c { color: #75715e } /* Comment */
.highlight .err { color: #960050; background-color: #1e0010 } /* Error */
.highlight .k { color: #66d9ef } /* Keyword */
.highlight .l { color: #ae81ff } /* Literal */
.highlight .n { color: #f8f8f2 } /* Name */
.highlight .o { color: #f92672 } /* Operator */
.highlight .p { color: #f8f8f2 } /* Punctuation */
.highlight .ch { color: #75715e } /* Comment.Hashbang */
.highlight .cm { color: #75715e } /* Comment.Multiline */
.highlight .cp { color: #75715e } /* Comment.Preproc */
.highlight .cpf { color: #75715e } /* Comment.PreprocFile */
.highlight .c1 { color: #75715e } /* Comment.Single */
.highlight .cs { color: #75715e } /* Comment.Special */
.highlight .gd { color: #f92672 } /* Generic.Deleted */
.highlight .ge { font-style: italic } /* Generic.Emph */
.highlight .gi { color: #a6e22e } /* Generic.Inserted */
.highlight .gs { font-weight: bold } /* Generic.Strong */
.highlight .gu { color: #75715e } /* Generic.Subheading */
.highlight .kc { color: #66d9ef } /* Keyword.Constant */
.highlight .kd { color: #66d9ef } /* Keyword.Declaration */
.highlight .kn { color: #f92672 } /* Keyword.Namespace */
.highlight .kp { color: #66d9ef } /* Keyword.Pseudo */
.highlight .kr { color: #66d9ef } /* Keyword.Reserved */
.highlight .kt { color: #66d9ef } /* Keyword.Type */
.highlight .ld { color: #e6db74 } /* Literal.Date */
.highlight .m { color: #ae81ff } /* Literal.Number */
.highlight .s { color: #e6db74 } /* Literal.String */
.highlight .na { color: #a6e22e } /* Name.Attribute */
.highlight .nb { color: #f8f8f2 } /* Name.Builtin */
.highlight .nc { color: #a6e22e } /* Name.Class */
.highlight .no { color: #66d9ef } /* Name.Constant */
.highlight .nd { color: #a6e22e } /* Name.Decorator */
.highlight .ni { color: #f8f8f2 } /* Name.Entity */
.highlight .ne { color: #a6e22e } /* Name.Exception */
.highlight .nf { color: #a6e22e } /* Name.Function */
.highlight .nl { color: #f8f8f2 } /* Name.Label */
.highlight .nn { color: #f8f8f2 } /* Name.Namespace */
.highlight .nx { color: #a6e22e } /* Name.Other */
.highlight .py { color: #f8f8f2 } /* Name.Property */
.highlight .nt { color: #f92672 } /* Name.Tag */
.highlight .nfunc { color: #a6e22e } /* Name.Function */
.highlight .nv { color: #f8f8f2 } /* Name.Variable */
.highlight .ow { color: #f92672 } /* Operator.Word */
.highlight .w { color: #f8f8f2 } /* Text.Whitespace */
.highlight .mb { color: #ae81ff } /* Literal.Number.Bin */
.highlight .mf { color: #ae81ff } /* Literal.Number.Float */
.highlight .mh { color: #ae81ff } /* Literal.Number.Hex */
.highlight .mi { color: #ae81ff } /* Literal.Number.Integer */
.highlight .mo { color: #ae81ff } /* Literal.Number.Oct */
.highlight .sa { color: #e6db74 } /* Literal.String.Affix */
.highlight .sb { color: #e6db74 } /* Literal.String.Backtick */
.highlight .sc { color: #e6db74 } /* Literal.String.Char */
.highlight .dl { color: #e6db74 } /* Literal.String.Delimiter */
.highlight .sd { color: #e6db74 } /* Literal.String.Doc */
.highlight .s2 { color: #e6db74 } /* Literal.String.Double */
.highlight .se { color: #ae81ff } /* Literal.String.Escape */
.highlight .sh { color: #e6db74 } /* Literal.String.Heredoc */
.highlight .si { color: #e6db74 } /* Literal.String.Interpol */
.highlight .sx { color: #e6db74 } /* Literal.String.Other */
.highlight .sr { color: #e6db74 } /* Literal.String.Regex */
.highlight .s1 { color: #e6db74 } /* Literal.String.Single */
.highlight .ss { color: #e6db74 } /* Literal.String.Symbol */
.highlight .bp { color: #f8f8f2 } /* Name.Builtin.Pseudo */
.highlight .fm { color: #a6e22e } /* Name.Function.Magic */
.highlight .vc { color: #f8f8f2 } /* Name.Variable.Class */
.highlight .vg { color: #f8f8f2 } /* Name.Variable.Global */
.highlight .vi { color: #f8f8f2 } /* Name.Variable.Instance */
.highlight .vm { color: #f8f8f2 } /* Name.Variable.Magic */
.highlight .il { color: #ae81ff } /* Literal.Number.Integer.Long */
</style>


<div class="highlight">
<pre tabindex="0" style="color:#f8f8f2;background-color:#272822;-moz-tab-size:4;-o-tab-size:4;tab-size:4">
<code>
  <span style="display:flex"><span><span class="p">(</span><span class="k">func</span> <span class="nfunc">$allocateOnStackAndSleep</span></span></span>
  <span style="display:flex"><span>  <span class="p">(</span><span class="k">local</span> <span class="nv">$x</span> <span class="kt">i32</span><span class="p">)</span></span></span>
  <span style="display:flex"><span>  <span class="c1">;; int x[] = {7};</span></span></span>
  <span style="display:flex"><span>  <span class="c1">;; allocate 16 bytes on the stack</span></span></span>
  <span style="display:flex"><span>  <span class="c1">;; we only need 4 but the stack pointer must always be aligned to 16</span></span></span>
  <span style="display:flex"><span>  <span class="nb">global.get</span> <span class="nv">$__stack_pointer</span></span></span>
  <span style="display:flex"><span>  <span class="nb">i32.const</span> <span class="mi">16</span></span></span>
  <span style="display:flex"><span>  <span class="nb">i32.sub</span></span></span>
  <span style="display:flex"><span>  <span class="c1">;; store the current stack pointer into x and __stack_pointer</span></span></span>
  <span style="display:flex"><span>  <span class="nb">local.tee</span> <span class="nv">$x</span></span></span>
  <span style="display:flex"><span>  <span class="nb">global.set</span> <span class="nv">$__stack_pointer</span></span></span>
  <span style="display:flex"><span>  <span class="c1">;; initialize the list: x[0] = 7</span></span></span>
  <span style="display:flex"><span>  <span class="nb">local.get</span> <span class="nv">$x</span></span></span>
  <span style="display:flex"><span>  <span class="nb">i32.const</span> <span class="mi">7</span></span></span>
  <span style="display:flex"><span>  <span class="nb">i32.store</span> <span class="k">offset</span><span class="o">=</span><span class="mi">0</span></span></span>
  <span style="display:flex"><span>  <span class="c1">;; Call escape(x);</span></span></span>
  <span style="display:flex"><span>  <span class="nb">local.get</span> <span class="nv">$x</span></span></span>
  <span style="display:flex"><span>  <span class="nb">call</span> <span class="nfunc">$escape</span></span></span>
  <span style="display:flex"><span>  <span class="c1">;; Call sleep(0);</span></span></span>
  <span style="display:flex"><span>  <span class="nb">i32.const</span> <span class="mi">0</span></span></span>
  <span style="display:flex"><span>  <span class="nb">call</span> <span class="nfunc">$sleep</span></span></span>
  <span style="display:flex"><span>  <span class="c1">;; Epilogue: restore stack pointer</span></span></span>
  <span style="display:flex"><span>  <span class="nb">local.get</span> <span class="nv">$x</span></span></span>
  <span style="display:flex"><span>  <span class="nb">i32.const</span> <span class="mi">16</span></span></span>
  <span style="display:flex"><span>  <span class="nb">i32.add</span></span></span>
  <span style="display:flex"><span>  <span class="nb">global.set</span> <span class="nv">$__stack_pointer</span></span></span>
  <span style="display:flex"><span><span class="p">)</span></span></span>
  </code></pre>
</div>


If `sleep()` stack switches, then we could call another `victim()` function that
allocates its own variables on the stack. If `victim()` __also__ stack switches,
then `allocateOnStackAndSleep()` will exit and reset the stack pointer,
deallocating stack space that `victim()` is still using. Calling a third
`overwritesVictimsStack()` function that allocates on the stack after
`allocateOnStackAndSleep()` exits and before `victim()` resumes would then
overwrite `victim()`'s stack space.

The `victim()` function looks as follows:
```C
WASM_EXPORT("victim")
void victim() {
  // Allocate our string on stack below the 16 bytes allocated by
  // `sleepsToResetStackPointer()`
  char x[] = "victim's important string";
  escape(x);
  logStrStr("victim1", x);
  // While we're sleeping, `allocateOnStackAndSleep()` exits and sets the
  // stack pointer above us. Then `overwritesVictimsStack()` writes over our
  // stack space.
  sleep(500);
  // This next line will print a different value!
  logStrStr("victim2", x);
}
```

All `overwritesVictimsStack()` needs to do is write data to the stack:
```C
WASM_EXPORT("overwritesVictimsStack")
void overwritesVictimsStack(void) {
  char x[] = "this is a long string and it will write over lots of other stuff!";
  escape(x);
}
```

Escape is a no-op:
```js
// Does nothing, just forces variables to be allocated on stack
function escape(ptr) { }
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
victim2 l write over lots of other stuff!
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
```
We use this to wrap the exports that stack switch:
```js
const allocateOnStackAndSleep = promisingExport(
  instance.exports.allocateOnStackAndSleep,
);
const victim = promisingExport(instance.exports.victim);
```
When a thread sleeps we save the stack pointer and the range of stack that we
care about. When the thread is restored, we can restore all this. The new
`sleep()` function looks as follows:
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

This code isn't efficient because we eagerly copy the stack. If no other task
writes over this stack space while we are suspended, then we don't need to copy
it. The most efficient way to do this is to make an object that records the
range that our thread cares about and a buffer with just the data that has
actually been overwritten. When a thread is restored<!--  -->, it will evict the
data of any other threads that care about the stack range and restore any of its
own data that has been evicted. The code that handles this is a bit more
complicated so I won't explain it here, but you can find a complete working
example here:
[here](https://github.com/hoodmane/jspi-blog-examples/blob/main/6-reentrancy-full-fix/stack_state.mjs)

## Conclusion

Using JSPI as a WebAssembly developer is unfortunately quite hard and there is
still limited toolchain support for it. The WebAssembly native stack is
automatically switched but separate work must be done to keep the linear memory
stack in sync. Using an appropriate data structure we can do this efficiently.
It will also only work with C code that is itself thread safe.

There are substantial further difficulties in integrating JSPI into a real
program that uses libc. I will discuss them in my next post.

Despite all these implementation difficulties, the capabilities that JSPI
enables are so powerful that it is worth the effort.
