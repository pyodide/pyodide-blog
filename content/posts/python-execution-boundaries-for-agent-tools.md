---
title: "Python runtimes for agent tools"
date: 2026-10-27T00:00:00+04:00
draft: true
author: ["Tejesh Vaish"]
tags: ["python", "webassembly"]
showToc: true
comments: false
---

For an analyst assistant running in a browser, I'd start with Pyodide if compatible packages can analyze the data the application supplies. Work that needs host-native libraries or OS integration points toward native CPython. Monty is worth considering when the calculation fits its supported Python and the application can mediate the host work.

The recorded cases start with the same calculation in browser Pyodide, a native CPython child and Monty. All three receive `[2, 3, 5]` and return `{"count": 3, "sum": 10}`. The complete expression in `lab/task.py` is:

```python
{
    "count": len(values),
    "sum": sum(values)
}
```

A deterministic caller runs these fixed benign cases, without an assistant or language model. The [complete source](https://github.com/tridev-tej/technical-blog-examples/tree/686143f355958964e6ca9eaf4342823abf7f50f6/pyodide) and [README](https://github.com/tridev-tej/technical-blog-examples/blob/686143f355958964e6ca9eaf4342823abf7f50f6/pyodide/README.md) include setup and exact settings.

## Check the operation the analysis needs

For analysis that needs NumPy, the browser case records version 2.4.6 loading and summing the same values to 10. Native CPython and Monty weren't tested with NumPy.

Pyodide runs CPython compiled for WebAssembly. The [FAQ](https://pyodide.org/en/stable/usage/faq.html) distinguishes pure-Python wheels from C, Fortran and Rust extensions that need compatible Pyodide builds. A host-native wheel can't replace a browser build. The [Rust/PyO3 post](https://blog.pyodide.org/posts/rust-pyo3-support-in-pyodide/) explains the target and linking constraints; the [314 release](https://blog.pyodide.org/posts/314-release/) describes the PyEmscripten package platform.

Check the package operation after import. The FAQ documents restrictions on starting threads, multiprocessing and subprocesses; importing those modules or reading general system information doesn't establish that they can launch work. Native CPython uses the host package ecosystem, subject to interpreter, OS and binary compatibility. Host-native dependencies and executable launch weren't tested here.

With Monty, first check that the calculation fits its supported Python. This stateful interpreter can share state across successive code submissions, called feeds, within a session. The host chooses which operations the guest can request. Monty's [1.3.0 security document](https://raw.githubusercontent.com/pydantic/monty/v1.3.0/docs/security.md) specifies no guest FFI or native-code dependencies. A callback or exposed host module can use a host package; that work runs on the host and doesn't add native-extension support to the guest.

## Supply the data the calculation may read

To check file access, the cases use a synthetic marker with known text. The caller can therefore check the reply independently. Native CPython reads the marker at its host pathname with inherited process permissions and no configured OS filesystem sandbox. Both `marker_default` and `marker_grant` perform that ordinary read; the second adds no grant or restriction.

Give the browser the same host pathname and its recorded reply is:

```json
{
  "status": "result",
  "value": "FileNotFoundError"
}
```

The adapter catches the missing-file exception and returns `"FileNotFoundError"` as a string. The controller accepts that string as this case's expected successful result. It shows that the marker isn't in the browser filesystem; it doesn't demonstrate a denied host read.

Monty reports an error because the guest hasn't been given the read operation:

```json
{
  "status": "error",
  "phase": "feed_run",
  "wrapper_type": "MontyRuntimeError",
  "error_type": "PermissionError"
}
```

Both excerpts show selected fields: Monty's error is built-in `PermissionError` wrapped by `MontyRuntimeError` at `feed_run`. To make these reads succeed, supply bytes to browser Pyodide or expose a host-mediated operation to Monty. The pathname alone supplies neither.

![Interfaces used by the three lab environments](/images/python-execution-authority.svg)

Conceptual interfaces in this lab, not general sandbox guarantees. Deliberately exposed JavaScript and host callbacks grant authority as described below.

In the browser, copying the marker to Pyodide's default in-memory [MEMFS filesystem](https://pyodide.org/en/stable/usage/file-system.html) makes it readable by Python. The bridge case gets the same text from a JavaScript property. These two complete worker functions show both routes; the surrounding module initializes Pyodide:

```javascript
function markerGrant(message) {
  pyodide.FS.writeFile(
    "/marker.txt",
    message.marker
  );
  return pyodide.runPython(
    "open('/marker.txt').read()"
  );
}

function bridge(message) {
  globalThis.labMarker =
    message.marker;
  return pyodide.runPython(
    `from js import labMarker
str(labMarker)`
  );
}
```

Use the MEMFS copy when Python needs file contents; it doesn't mount a host directory or make the file persistent. Choosing the bridge gives Python access to the worker's existing JavaScript environment: imports from `js` look up `globalThis`, as the [314.0.7 interop guide](https://pyodide.org/en/314.0.7/usage/type-conversions.html) explains. Adding `labMarker` leaves other globals reachable, and a custom Python globals dictionary is a namespace, not a security boundary. The bridge case tests one property read; the page DOM, credentials, network services and host files remain untested.

With Monty's zero-argument `read_marker()` callback, the host chooses the path and reads with host-process permissions. Accepting a pathname would give that choice to the guest and broaden the callback's authority. This host work remains outside the interpreter; the default denial establishes no OS sandbox around the worker.

The [mcp-run-python maintainers](https://raw.githubusercontent.com/pydantic/mcp-run-python/main/README.md) cite safety and latency concerns in retiring their tool. [langchain-sandbox](https://raw.githubusercontent.com/langchain-ai/langchain-sandbox/main/README.md) separately says it is unmaintained and advises against production use. Each notice concerns its own tool; neither establishes a universal verdict on Pyodide.

## Decide which reply may update the application

Native CPython sends JSON over pipes, Pyodide sends worker messages, and Monty returns a feed result after any host calls. Whichever route delivers it, a fixture reply must belong to an active request: both validators require a matching run ID, exact envelope and value keys, and the literal answer `count: 3, sum: 10`. The literal gives the caller an independent arithmetic oracle. Re-evaluating the task expression to derive the expectation could repeat the same mistake.

Matching keys and values can still admit the wrong shape. JavaScript arrays can own named `count` and `sum` properties that survive `structuredClone`, so the browser validator rejects arrays in both the envelope and its value. The Python validator for native CPython and Monty requires exact dictionaries and integer types.

Acceptance must end with the request. The browser reader removes its listeners after one reply or a timeout, so a late answer can't satisfy a later call. These checks establish the accepted result for this fixture; they don't prove arbitrary model answers correct.

## Budget the whole request

The caller needs a deadline from acquiring inputs to accepting a reply. Budget setup and host work within that interval; a timeout around Python alone won't cover them.

In the browser case, fetching the fixture and consuming its JSON body share an abort deadline. A separate budget covers worker/Pyodide readiness, followed by case time, including NumPy loading. These clocks are defined in `lab/main.mjs`; the [worker guide](https://pyodide.org/en/stable/usage/webworker.html) explains initialization and messages.

On Linux, the total deadline must also cover work before readiness timing begins. The supervisor creates the child and writes and closes its input before starting the readiness budget, then starts the output budget after readiness. Creation and input sit outside both. This gap comes from the source; no startup hang was reproduced. The [subprocess documentation](https://docs.python.org/3.13/library/subprocess.html#subprocess.Popen.communicate) also distinguishes creation from timed communication.

Monty's feed clock excludes fed-source compilation and pauses during host suspension. Each feed gets a fresh allowance, so the caller must bound total session lifetime and give host operations deadlines and a cancellation policy. When the session ends, cancel outstanding host work too. The marker callback doesn't test a slow service. Browser, native and Monty clocks cover different work, so their results can't rank speed.

## Account for memory separately

The lab configures no per-run memory cap for browser Pyodide or native CPython and leaves Monty's `max_memory` unset. These cases therefore don't test a memory limit.

If the application needs a memory bound, account for what a guest limit leaves out. Monty's [1.3.0 security guidance](https://raw.githubusercontent.com/pydantic/monty/v1.3.0/docs/security.md) defines its budget as requested allocator bytes, not process RSS. Other allocation routes and host callback allocations stay outside that count and need separate accounting.

## Stop execution before replacement

Stop the old execution before starting the next request. In these cases, cleanup follows different timeout mechanisms: the browser and native loops reach outer timeouts, while Monty's required loop result is `MontyRuntimeError` wrapping built-in `TimeoutError` at `feed_run`. An outer timeout wouldn't establish that the feed limit fired.

Browser termination [aborts execution and discards queued tasks](https://html.spec.whatwg.org/multipage/workers.html#terminate-a-worker). The Linux supervisor cleans its owned group for these benign children; processes that change group or session fall outside that cleanup. Neither mechanism promises hard real-time scheduling or adversarial containment.

A fresh worker, child or Monty session runs the fixture successfully after each loop. That demonstrates replacement, not interrupted-state survival, rollback or undoing completed host effects. Discard a Monty session after a time or memory limit, even in a pool.

## What the recorded runs cover

The selected versions are native CPython 3.13.14, Pyodide 314.0.7 reporting Python 3.14.2, and [pydantic-monty](https://pypi.org/project/pydantic-monty/1.3.0/), `pydantic-monty-client` and `pydantic-monty-runtime` at 1.3.0. The comparison covers five native cases, five Monty cases and seven browser cases.

The Linux cases were repeated with this source in an existing environment. Browser results come from the earlier run of the unchanged browser code, including the corrected validator and ten separate shape controls. Installation from scratch hasn't been tested.

Before choosing for the analyst, run the most demanding package operation with data supplied through the intended interface and follow it through to an accepted reply. If later calculations depend on earlier state, specify how the application will rebuild it after disposal. Make that recovery plan part of the choice before relying on a long-lived worker or session.
