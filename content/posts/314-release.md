---
title: "Pyodide 314.0 Release"
date: 2026-06-07
draft: false
tags: ["announcement"]
author: ["Gyeongjae Choi", "Hood Chatham", "Agriya Khetarpal"]
showToc: true
TocOpen: false
draft: false
hidemeta: false
comments: false
# canonicalURL: "https://canonical.url/to/page"
disableHLJS: true # to disable highlightjs
disableShare: false
hideSummary: false
searchHidden: true
ShowReadingTime: true
ShowBreadCrumbs: true
ShowPostNavLinks: true
cover:
    relative: false
    hidden: true
---

We are pleased to announce the Pyodide 314.0 release.

This release focuses on standardization and packaging, marking a significant milestone in the Python-in-the-browser ecosystem.

## PEP 783 is Accepted: What Does It Mean?

The acceptance of [PEP 783: Emscripten packaging](https://peps.python.org/pep-0783/) marks perhaps the most exciting change in the history of the Python-in-the-browser ecosystem. Pyodide maintainers—especially [@hoodmane](https://github.com/hoodmane)—have poured an immense amount of effort into this over a very long time. Achieving this long-standing goal will expand our ecosystem exponentially.

What does this mean in practice? You can now publish Python packages built for Pyodide (or any Python runtime compatible with [the PyEmscripten platform defined in PEP 783](https://pyodide.org/en/stable/development/abi.html)) directly to PyPI and install them at runtime.

Previously, the Pyodide maintainers had to maintain, build, and host over 300 packages ourselves. This created a significant burden on our maintainers and became a major bottleneck for the community, as every new package required manual review.

Moving forward, package maintainers can simply build and publish Pyodide wheels to PyPI, just as they do for native wheels on Linux, macOS, or Windows. By the time you are reading this, [cibuildwheel v4.0](https://cibuildwheel.pypa.io/) already supports building for the PyEmscripten 2025 and 2026 ABIs.

We've written a comprehensive guide on building and publishing Pyodide wheels to PyPI. You can find it [here](https://pyodide-build.readthedocs.io/en/latest/).

If you are a maintainer of a Rust-based Python package that uses PyO3 or maturin, there is also a good article written by Pydantic team that explains [how to build and publish PyEmscripten wheels](https://pydantic.dev/articles/emscripten-wheels-pydantic).

With PEP 783 now formally accepted, the platform tags now use the `pyemscripten_*` prefix: `pyemscripten_2025_0` for Python 3.13 (Pyodide 0.29.x) and `pyemscripten_2026_0` for Python 3.14 (Pyodide 314.x). If you build wheels for either of these versions, update your build configurations and `pyodide-build` version accordingly.

## New Versioning Scheme

You might be wondering: wasn't the last version 0.29, and now it's 314.0?

Yes, we're updating Pyodide's versioning scheme in alignment with these new packaging standards.

To fully standardize the packaging process under PEP 783, we wanted to stabilize platform compatibility for packages so they don't break with every Pyodide release. Therefore, we're transitioning to a Python-version-based versioning scheme. For example, Pyodide 314.x directly corresponds to Python 3.14.

Whenever we make binary-incompatible changes, they will now align strictly with upstream Python updates (typically once a year). This means you can safely use existing packages built for the same Python version across multiple Pyodide releases. We plan to release a new major Pyodide version annually, synchronized with Python updates.

This first release in the new scheme ships Python 3.14.2 and Emscripten 5.0.3.

See also: [Pyodide Issue #6084](https://github.com/pyodide/pyodide/issues/6084) for more context.

## Standard Library Changes

Originally, Pyodide "unvendored" several Python standard libraries, including `ssl`, `sqlite3`, and `lzma`.

This was done to reduce the Pyodide distribution size, enabling faster startup times while allowing users to install these packages after loading Pyodide when needed.

For example, if your application or package needed `sqlite3`, you would install it after loading Pyodide:

```js
await pyodide.loadPackage("sqlite3");
```

However, with Pyodide now supporting PEP 783, we've decided to restore these libraries to the standard library to provide a better user experience. This introduces a trade-off: while the initial download size increases, users no longer need to install these packages separately, creating a more seamless experience.

As part of this cleanup, the `pydecimal` and `test` packages have been removed from the distribution. The `fullstdlib` option in `loadPyodide()` is now deprecated and has no effect.

Since this release ships with Python 3.14, the new `compression.zstd` module is now available in Pyodide out of the box, providing native zstd compression and decompression support.

Additionally, we've decided to drop `OpenSSL` support from the standard library, which would have introduced a substantial size increase when vendored. This results in some breaking changes:

1. The `ssl` module no longer relies on OpenSSL. We've implemented a custom SSL implementation that provides basic features compatible with the standard library's `ssl` module, but without actual SSL/TLS support. Note that most of the `ssl` module's functionality didn't work even before this change because we didn't support socket operations in the browser.
2. The `hashlib` module no longer supports some cryptographic hash functions that were previously available through OpenSSL.

## Pyodide Is Now a Native ES Module

`pyodide.asm.js` has been renamed to `pyodide.asm.mjs` to properly reflect that it is an ES module. Most users will not need to change anything, since `loadPyodide()` handles this internally. However, if you reference the file directly, there are some breaking changes to be aware of:

- **Classic (non-module) workers** are no longer supported. You must use a module worker (`type: "module"`) instead.
- **Service workers** that statically imported `pyodide.asm.js` must now import `createPyodideModule` from `pyodide.asm.mjs` and pass the result as an argument to `loadPyodide`:

    ```js
    import createPyodideModule from "./pyodide.asm.mjs";
    import { loadPyodide } from "./pyodide.mjs";

    loadPyodide({ createPyodideModule }).then((pyodide) => { ... });
    ```

- **Bundlers**: Update any configuration that explicitly references `pyodide.asm.js` to use `pyodide.asm.mjs` instead.

## Experimental Support for Socket Operations in Node.js

We've added experimental support for socket operations in Node.js. This allows you to use the `socket` module in Pyodide when running in a Node.js environment, enabling TCP socket creation and communication, such as connecting to a remote database server.

This can be enabled by running `pyodide.useNodeSockFS()`:

```js
const pyodide = await loadPyodide();
await pyodide.useNodeSockFS();
```

On Node.js <= v24, you also need to pass `--experimental-wasm-stack-switching` to enable JSPI.

## JavaScript Interop Improvements

The JavaScript interop layer in Pyodide has been improved in a few ways. We list some of them here:

### `JsBigInt`: Proper `bigint` roundtripping

We've added `pyodide.ffi.JsBigInt`, a new `int` subtype that makes JavaScript's `bigint` type roundtrip correctly through Python. Before this, a `bigint` arriving in Python would be converted to an `int`, but converting it back to JavaScript would produce a `number`, which silently loses precision for values above 2^53. Python integers larger than 2^53 had the same problem. Now both cases produce a `JsBigInt`, which converts back to `bigint` on the JavaScript side. Since `JsBigInt` supports all the same operations as `int`, most existing code won't need any changes.

### JavaScript Resource Management and Python Context Managers

Pyodide now works with the [JavaScript/ECMAScript Explicit Resource Management proposal](https://github.com/tc39/proposal-explicit-resource-management) (`using` declarations) on both sides of the language boundary.

On the JavaScript side, `PyProxy` and `PyBufferView` now implement `[Symbol.dispose]`, so you can use `using` to make sure Python objects get cleaned up when they go out of scope:

```js
{
  using proxy = pyodide.runPython("some_object()");
  // proxy is destroyed automatically at end of block
}
```

On the Python side, if a JavaScript object has a `[Symbol.dispose]()` method, you can use its `JsProxy` as a context manager with `with`. The same goes for `[Symbol.asyncDispose]()` for async context managers:

```python
with js_object as x:
    ...  # x[Symbol.dispose]() is called on exit
```

### Better Array-like Support for `JsProxy`

Previously, only true JavaScript arrays (where `Array.isArray()` returns true) and a handful of known types like `HTMLCollection` and `NodeList` would get subscript support in their `JsProxy`. Now any JavaScript object that is iterable and has a `length` property is treated as array-like, so `proxy[i]` just works for a much broader set of objects.

On top of that, slice subscripting now works too:

```python
proxy[1:4]   # returns a new array-like from index 1 to 3
proxy[::2]   # every other element
```

## Acknowledgements

A big thank you to Python Steering Council members and the broader Python community for their support and feedback on PEP 783 and related standards.

Thanks to all the contributors who made this release possible:

Agriya Khetarpal, Amir Tadrisi, Andrej730, BOMIN LYU, Chanho
Lee, Christian Clauss, Copilot, Daniel Chambers, Darshan, Gyeongjae Choi,
Hanjeong Lee, Hood Chatham, hyoinandout, Juniper Tyree, kaif ansari, Maddy
Guthridge, MisterNox, Pepijn de Vos, Qiaochu Hu, Raj Kumar Gupta,
SATHVIK V SHETTY, Seungheon Lee, SongYoungUk, Victorien
