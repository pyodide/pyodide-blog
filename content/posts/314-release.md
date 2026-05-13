---
title: "Pyodide 314.0 Release"
date: 2026-05-13
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

What does this mean in practice? You can now publish Python packages built for Pyodide (or any Python runtime compatible with the PyEmscripten platform defined in PEP 783) directly to PyPI and install them at runtime.

Previously, the Pyodide maintainers had to maintain, build, and host over 300 packages ourselves. This created a significant burden on our maintainers and became a major bottleneck for the community, as every new package required manual review.

Moving forward, package maintainers can simply build and publish Pyodide wheels to PyPI, just as they do for native wheels on Linux, macOS, or Windows.

We've written a comprehensive guide on building and publishing Pyodide wheels to PyPI. You can find it [here](https://pyodide-build.readthedocs.io/en/latest/).

## New Versioning Scheme

You might be wondering: wasn't the last version 0.29, and now it's 314.0?

Yes, we're updating Pyodide's versioning scheme in alignment with these new packaging standards.

To fully standardize the packaging process under PEP 783, we wanted to stabilize platform compatibility for packages so they don't break with every Pyodide release. Therefore, we're transitioning to a Python-version-based versioning scheme. For example, Pyodide 314.x directly corresponds to Python 3.14.

Whenever we make binary-incompatible changes, they will now align strictly with upstream Python updates (typically once a year). This means you can safely use existing packages built for the same Python version across multiple Pyodide releases. We plan to release a new major Pyodide version annually, synchronized with Python updates.

See also: [Pyodide Issue #6084](https://github.com/pyodide/pyodide/issues/6084) for more context.

## Standard Library Changes

Originally, Pyodide "unvendored" several Python standard libraries, including `ssl`, `sqlite3`, and `lzma`.

This was done to reduce the Pyodide distribution size, enabling faster startup times while allowing users to install these packages after loading Pyodide when needed.

For example, if your application or package needed `sqlite3`, you would install it after loading Pyodide:

```js
await pyodide.loadPackage("sqlite3");
```

However, with Pyodide now supporting PEP 783, we've decided to restore these libraries to the standard library to provide a better user experience. This introduces a trade-off: while the initial download size increases, users no longer need to install these packages separately, creating a more seamless experience.

Additionally, we've decided to drop `OpenSSL` support from the standard library, which would have introduced a substantial size increase when vendored. This results in some breaking changes:

1. The `ssl` module no longer relies on OpenSSL. We've implemented a custom SSL implementation that provides basic features compatible with the standard library's `ssl` module, but without actual SSL/TLS support. Note that most of the `ssl` module's functionality didn't work even before this change because we didn't support socket operations in the browser.
2. The `hashlib` module no longer supports some cryptographic hash functions that were previously available through OpenSSL.

## Experimental Support for Socket Operations in Node.js

We've added experimental support for socket operations in Node.js. This allows you to use the `socket` module in Pyodide when running in a Node.js environment, enabling TCP socket creation and communication, such as connecting to a remote database server.

This can be enabled by running `pyodide.useNodeSockFS()`:

```js
const pyodide = await loadPyodide();
await pyodide.useNodeSockFS();
```

You also need to enable JSPI by passing `--experimental-wasm-stack-switching` when running Node.js <= v24.

## Acknowledgements

Thanks to all the contributors who made this release possible:

UPDATE ME
