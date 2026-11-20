---
title: "Give Python code a file with Pyodide"
description: "Use Pyodide's in-memory filesystem to supply text to Python code that expects a file."
date: 2026-10-27T00:00:00+04:00
draft: true
author: ["Tejesh Vaish"]
tags: ["python", "webassembly"]
showToc: true
comments: false
---

If your browser assistant already has a selected file's text, pass it to Python. A callback that reads the original file lets Python ask the application to do that read with the application's permissions. Add the callback only when Python needs that host operation.

Pyodide's in-memory filesystem lets Python code keep using `open()` on a copy of those contents.

## Copy the contents into Pyodide

In the example, `open()` on a pathname from the machine running native Python raises `FileNotFoundError` in browser Pyodide. No file exists at that pathname in this Pyodide instance, and no host filesystem is mounted. The application can write the text it already has to `/marker.txt` instead.

This excerpt from the [example's worker](https://github.com/tridev-tej/technical-blog-examples/blob/8d347378e62a210fddb01e19bc9a3d1bf7e20408/pyodide/lab/worker.mjs) uses an initialized Pyodide instance. Here, `message.marker` is the text supplied by the application:

```javascript
function markerGrant(message) {
  pyodide.FS.writeFile("/marker.txt", message.marker);
  return pyodide.runPython("open('/marker.txt').read()");
}
```

`FS.writeFile` creates `/marker.txt` in [MEMFS, Pyodide's default in-memory filesystem](https://pyodide.org/en/314.0.7/usage/file-system.html). The next call reads that copy with Python's usual `open()`. It works because a file now exists at `/marker.txt`, not because permissions on the original host file changed.

Neither the missing path nor the successful read shows that Python is restricted to this file. The browser already receives the text as input. Python can also [import existing JavaScript globals through `js`](https://pyodide.org/en/314.0.7/usage/type-conversions.html#importing-javascript-objects-into-python); copying data does not remove those existing capabilities.

## What each file-read result means

The [companion example](https://github.com/tridev-tej/technical-blog-examples/tree/8d347378e62a210fddb01e19bc9a3d1bf7e20408/pyodide) compares native CPython, browser Pyodide, and Pydantic's Monty interpreter. Its fixed-code file-read results were recorded on 12 November 2026:

| Environment | Recorded operation | What the result means |
|---|---|---|
| Native CPython 3.13.14 | Both `marker_default` and `marker_grant` read the original host file. | The process already has access for this read. The second label does not grant new permission. |
| Browser Pyodide 314.0.7 | The native-host pathname is missing; reading the supplied copy succeeds. | Supply the text as a file; no host reader is needed for this input. |
| [Monty 1.3.0](https://raw.githubusercontent.com/pydantic/monty/v1.3.0/docs/security.md) | Direct `open()` fails; the supplied `read_marker()` callback reads the application-selected file. | The application has exposed a host operation. The callback reads with the host process's file permissions. |

## Try the file cases

The pinned [README](https://github.com/tridev-tej/technical-blog-examples/blob/8d347378e62a210fddb01e19bc9a3d1bf7e20408/pyodide/README.md) has setup and run instructions for Linux x86_64. Compare `marker_default` and `marker_grant` in the browser output: the first returns the caught `FileNotFoundError` name; the second returns the text after the application copies it into MEMFS.
