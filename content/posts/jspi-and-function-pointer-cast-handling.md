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

[In the last post](content/posts/jspi-with-C-runtime), I demonstrated how to use
JSPI in a simple program written for the `wasm32-unknown-unknown` platform. Of
course, `wasm32-unknown-unknown` does not support the libc standard library, so
it does not work for real-world code. Emscripten provides the
`wasm32-unknown-emscripten` target which does support these features.

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

If there are any JavaScript calls in between the call into WebAssembly
`fakePyFunc` and the call out to JavaScript `awaitFakeFetch`, the call to
`awaitFakeFetch()` will fail. Before JSPI existed, features in the C runtime
could be implemented using JavaScript frames and it would not make any
observable difference to the behavior of the program. Now it does.

In Pyodide, JavaScript frames are used for:

* Handling function pointer casts
* C++ exceptions and Rust panics
* libffi/ctypes
* Resolution of late-binding symbols from dynamic libraries

To make JSPI work with these features, there are two possible approaches: either
we can somehow replace the JavaScript frame with equivalent WebAssembly
functionality, or we can make the JavaScript frame cooperate with the stack
switching. In practice, both of these approaches are quite challenging to
implement. In this post, we'll focus on replacing the function pointer cast
handling JS call with WebAssembly.

## Function pointer casts

I wrote [a blog post](content/posts/function-pointer-cast-handling.md) about
this problem in 2021. Python extensions often declare functions with one
signature, cast them to a different signature with more arguments, and call them
with extra arguments. This is undefined behavior according to the C standard, but works in practice with most major compilers and architectures.

However, WebAssembly is more strict and `call_indirect` instruction which calls a
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
the signature of a function before calling it. We can use this to cast the
function to the right signature before making the call. Here is an example wat
module

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
<span style="display:flex"><span class="p">(</span><span class="k">module</span></span>
<span style="display:flex"><span>  <span class="p">(</span><span class="k">type</span> <span class="nv">$zero_args</span> <span class="p">(</span><span class="k">func</span> <span class="p">(</span><span class="k">result</span> <span class="kt">i32</span><span class="p">)))</span></span></span>
<span style="display:flex"><span>  <span class="p">(</span><span class="k">type</span> <span class="nv">$one_args</span> <span class="p">(</span><span class="k">func</span> <span class="p">(</span><span class="k">param</span> <span class="kt">i32</span><span class="p">)</span> <span class="p">(</span><span class="k">result</span> <span class="kt">i32</span><span class="p">)))</span>
  <span class="p">(</span><span class="k">type</span> <span class="nv">$two_args</span> <span class="p">(</span><span class="k">func</span> <span class="p">(</span><span class="k">param</span> <span class="kt">i32</span> <span class="kt">i32</span><span class="p">)</span> <span class="p">(</span><span class="k">result</span> <span class="kt">i32</span><span class="p">)))</span>
  <span></span>
  <span class="p">(</span><span class="k">import</span> <span class="s2">&quot;env&quot;</span> <span class="s2">&quot;__indirect_function_table&quot;</span> <span class="p">(</span><span class="k">table</span> <span class="nv">$functable</span> <span class="mi">1</span> <span class="k">funcref</span><span class="p">))</span>
  <span></span>
  <span class="p">(</span><span class="k">func</span> <span class="p">(</span><span class="k">export</span> <span class="s2">&quot;countArgs&quot;</span><span class="p">)</span> <span class="p">(</span><span class="k">param</span> <span class="nv">$funcptr</span> <span class="kt">i32</span><span class="p">)</span> <span class="p">(</span><span class="k">result</span> <span class="kt">i32</span><span class="p">)</span>
        <span class="p">(</span><span class="k">local</span> <span class="nv">$funcref</span> <span class="k">funcref</span><span class="p">)</span>
    <span class="c1">;; Convert function pointer to function reference using table.get, store the</span>
    <span class="c1">;; result into $funcref local</span>
    <span class="nb">local.get</span> <span class="nv">$funcptr</span>
    <span class="nb">table.get</span> <span class="nv">$functable</span>
    <span class="nb">local.tee</span> <span class="nv">$funcref</span>
    <span class="c1"></span>
    <span class="c1">;; Two args?</span>
    <span class="nb">ref.test</span> <span class="p">(</span><span class="k">ref</span> <span class="nv">$two_args</span><span class="p">)</span>
    <span class="k">if</span>
      <span class="nb">i32.const</span> <span class="mi">2</span>
      <span class="nb">return</span>
    <span class="k">end</span>
    <span class="nb">local.get</span> <span class="nv">$funcref</span>
    <span class="c1"></span>
    <span class="c1">;; One arg?</span>
    <span class="nb">ref.test</span> <span class="p">(</span><span class="k">ref</span> <span class="nv">$one_args</span><span class="p">)</span>
    <span class="k">if</span>
      <span class="nb">i32.const</span> <span class="mi">1</span>
      <span class="nb">return</span>
    <span class="k">end</span>
    <span class="nb">local.get</span> <span class="nv">$funcref</span>
    <span class="c1"></span>
    <span class="c1">;; Zero arg?</span>
    <span class="nb">ref.test</span> <span class="p">(</span><span class="k">ref</span> <span class="nv">$zero_args</span><span class="p">)</span>
    <span class="k">if</span>
      <span class="nb">i32.const</span> <span class="mi">0</span>
      <span class="nb">return</span>
    <span class="k">end</span>
    <span class="c1"></span>
    <span class="c1">;; It takes more than two args, or uses a non-i32 type.</span>
    <span class="nb">i32.const</span> <span class="mi">-1</span>
    <span class="nb">return</span>
  <span class="p">)</span>
<span class="p">)</span>
  </code></pre>
</div>

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
We can use `wasm-as` (WebAssembly Assemble) to convert the wat to wasm and use
`wasm-merge` to merge `countArgs.wasm` with the compiled C code. `wasm-as` and
`wasm-merge` are part of binaryen. See the full build script here:
[here](https://github.com/hoodmane/jspi-blog-examples/tree/main/9-wat-count-args/build.sh).
(As an aside, we use `wasm-merge` instead of the normal approach of assembling
to an object file and then linking the object file with `wasm-ld` because we can
only use an instruction in an object file if llvm knows how to generate
relocations for the instruction. I have now taught llvm how to generate
relocations for `ref.test`, but it didn't know how to do this when I started.)

This approach to handling function pointer casts uses the `ref.test` instruction
which was added as part of the garbage collection feature (wasm-gc) which has
only been supported in Safari since December of 2024. Furthermore, on iOS using
wasm-gc causes crashes. However, we do know that every runtime that supports
JSPI also supports wasm-gc, so we can use wasm-gc if we can and otherwise fall
back to using a JavaScript trampoline.

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

## Conclusion

In the future, `__builtin_wasm_test_function_pointer_signature()` should make
dealing with function pointer casting cleaner and faster. It will also allow
handing function pointer casts in wasi and wasm32-unknown-unknown whenever the
runtime supports wasm-gc, whereas previously it was not possible. It currently
requires a very recent version of Emscripten, or a development version of clang
and a quite recent web browser / node version, so it will still be a while
before it can be adopted everywhere.

All of this fixes just one of the many sources of JavaScript frames that cause
trouble when using JSPI. This problem we solved by replacing functionality
implemented using JavaScript with WebAssembly. Next time I'll discuss the
approach of making a JavaScript frame cooperate with JSPI and the difficulties
that occur with that approach.

