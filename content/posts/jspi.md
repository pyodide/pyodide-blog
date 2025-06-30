---
title: "JavaScript Promise Integration in Pyodide"
date: 2025-06-30
draft: true
tags: ["announcement"]
author: "Hood Chatham"
# author: ["Me", "You"] # multiple authors
showToc: true
TocOpen: false
draft: false
hidemeta: false
comments: false
description: "Solving the sync/async problem with a new web standard."
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

JavaScript Promise Integration (JSPI) is a new web standard that gives
us a way to work around this. It allows us to make a call that seems synchronous
from the perspective of Python but is actually asynchronous from the perspective of
JavaScript. In other words, you can have a blocking Python call without blocking the
JavaScript main thread. JSPI enables this by stack switching.

For Pyodide, this means that by using this technology we can finally implement
things like `time.sleep()`, `input()` or `requests.get()`.

JSPI became a finished stage 4 proposal on April 8,
2025. Chrome 137, released May 27th, 2025, [supports JSPI](https://developer.chrome.com/release-notes/137#javascript_promise_integration).
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

## When can we use `run_sync`?

`run_sync()` works only if the JavaScript runtime supports JSPI and
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

## Conclusion

JSPI finally lets us run synchronous Python code that
consumes asynchronous JavaScript APIs. Pyodide 0.27.7 fully supports JSPI in
Chrome 137, in Node 24 with the `--experimental-wasm-jspi` flag, and in Firefox with
the `javascript.options.wasm_js_promise_integration` flag. There will soon be a
version of Cloudflare Python workers that supports JSPI as well.
