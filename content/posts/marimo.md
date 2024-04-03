---
title: "marimo: a reactive Python notebook that runs in the browser"
date: 2024-03-28T14:57:24-07:00
draft: true
tags: ["announcement", "guest post"]
# author: "Me"
author: ["Akshay Agrawal", "Myles Scolnick"] # multiple authors
showToc: true
TocOpen: false
draft: false
hidemeta: false
comments: false
description: "Bringing a whole new meaning to \"serverless\"."
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


We’re [Akshay Agrawal](https://akshayagrawal.com) and [Myles
Scolnick](https://mylesscolnick.com/), and we’re the developers of
[marimo](https://github.com/marimo-team/marimo), an open-source reactive
notebook for Python. In this post, we'll describe how we ported marimo to work via
Pyodide, and why we're incredibly excited about the potential of Pyodide
to make computing more accessible.

## What is marimo?

marimo is an open-source reactive notebook for Python built from the ground up
to solve [well-known problems with traditional
notebooks](https://docs.marimo.io/faq.html#faq-problems), including
reproducibility, interactivity, maintainability, and shareability.


**A reactive notebook with no hidden state.**
In marimo, a notebook’s code, outputs, and program state are always consistent.
Run a cell and marimo _reacts_ by automatically running the cells that
reference its declared variables. Delete a cell and marimo scrubs its variables
from program memory, eliminating hidden state. Try this for yourself!

<iframe
  src="https://marimo.app/l/9bnuyz?embed=true"
  width="800"
  height="300"
  style="max-width: 800px"
></iframe>



Our reactive runtime is based on static analysis, so it’s performant. If you’re
worried about accidentally triggering expensive computations, you can disable
specific cells from auto-running.

**UI elements are automatically synchronized with Python.**
marimo comes with [UI
elements](https://docs.marimo.io/api/inputs/index.html) like sliders, a
dataframe transformer, and interactive plots. Interact with an element and the
cells that use it are automatically re-run with its latest value. Reactivity
makes these UI elements more useful and ergonomic than Jupyter’s IPyWidgets.

<iframe
  src="https://marimo.app/l/p9l3ay?embed=true"
  width="800"
  height="400"
  style="max-width: 800px"
></iframe>


**Deploy as an app, run as a script.**
Every marimo notebook can be served as an interactive read-only web app (with outputs
concatenated and code hidden). Additionally, marimo notebooks can be run as
scripts from the command line, with cells executed in a topologically sorted
order. For example, here's a simple educational app:

<iframe
  src="https://marimo.app/l/e9wii1?mode=read&embed=true"
  width="800"
  height="800"
></iframe>


**Use cases.** marimo can be used in many ways. It can be used as a next-gen
replacement for Jupyter notebooks, allowing you to explore data rapidly —
change code or interact with a UI element, and see outputs change instantly —
and run experiments in an environment that prevents bugs before they happen. It
can also be used to make powerful apps, dashboards, and internal
tools.

**A Pyodide-powered playground.**
All the embedded marimo notebooks you've seen in this blog post are powered by
our Pyodide-marimo playground: you can try marimo in your browser by navigating
to [https://marimo.new](https://marimo.new).

If you want to use marimo locally, get started with

```bash
pip install marimo && marimo tutorial intro
```

at your command line.


## Using Pyodide to make marimo accessible to everyone

We decided to port marimo to Pyodide for three main reasons:

- to make scientific computing accessible to everyone by eliminating the need to
  install and manage Python;
- to make it easy to share executable notebooks via a url by eliminating
  the financial and technical burden of deploying backend infrastructure; and
- to provide a snappy development experience by eliminating
  network requests to a remote Python runner.

Our motivation for combining marimo with Pyodide echoes the vision articulated
by the developers of [Iodide](https://hacks.mozilla.org/2019/03/iodide-an-experimental-tool-for-scientific-communicatiodide-for-scientific-communication-exploration-on-the-web/), the experimental in-browser notebook for which
Pyodide was originally created. While Iodide is no longer developed, we’re
extremely grateful that it ushered Pyodide into existence.

**The Pyodide-marimo playground.**
We have developed a [Pyodide-powered marimo playground](https://marimo.new)
that makes it extremely easy for anyone in the world to tinker with marimo
notebooks. With just one click, playground notebooks can be shared with others,
and conversely every local notebook can be shared via our playground.

Here are some use cases that our Pyodide-powered notebooks enable:

- Rapidly experiment with code and models.
- Author blog posts, tutorials, and educational materials.
- Embed interactive notebooks in library documentation or other static web pages.
- Build and share tools like data labelers, embedding visualizers, model
  comparison tools, or anything else you can imagine.
- Create and share bug reproductions.

You can learn more about the playground, including how
to embed marimo notebooks in static HTML pages, [at our
docs](https://docs.marimo.io/guides/wasm.html).

We’ve created a few example
notebooks to jump-start your imagination. There’s one that [trains a tiny
neural network](https://marimo.app/l/xpd4te), another that visualizes [Bayes’
Theorem](https://marimo.app/l/odhwnq), and another that plots attractors of
[dynamical systems](https://marimo.app/l/c7h6pz). One of our community members
even created a [QR code
generator](https://vxlabs.com/2024/03/02/contact-qrcode-generator-with-marimo-and-wasm/).

When you take a moment to think about all this, it’s really quite *magical* ✨.
Thanks to Pyodide, you can use any pure Python package, as well as a number of
packages for scientific computing, including Pandas, NumPy, SciPy, matplotlib,
and scikit-learn, entirely in the sandbox of your web browser --- _without
installing Python on your machine and without paying for infrastructure_.

## Implementation: Porting marimo to Pyodide

Porting marimo to work with Pyodide was relatively straightforward, a testament to the
latter's robustness and thorough documentation.

marimo's original implementation has three main parts:

1. a Python codebase implementing a kernel that runs Python code;
2. a TypeScript codebase that issues control commands for the Python kernel;
3. a server that connects the TypeScript and Python codebases.

All that was required were minimal changes to our TypeScript and Python
codebases, and replacing the server with a lightweight bridge.

### TypeScript

marimo uses the same TypeScript build when running with Pyodide or native Python.
This helps maintain consistency between the two experiences and avoid feature
drift. The code path splits based on feature flags; when running under Pyodide,
we download the marimo wheel from PyPI and initialize a single-threaded,
Pyodide-compatible marimo kernel. Passing only a filename and a message
callback function, we initialize the kernel as an async, never-ending Python
process.

We interact with this kernel through a lightweight RPC bridge that sends requests to
the kernel and receives responses through the callback passed. This allows for
an asynchronous-like feel to the execution. To support interruption of Python
code, we simply followed the [Pyodide
documentation](https://pyodide.org/en/stable/usage/keyboard-interrupts.html) on
using its `SharedArrayBuffer`-based mechanism.

For performance, we cache our assets and [run Pyodide in a web
worker](https://pyodide.org/en/stable/usage/webworker.html) to avoid blocking
the main browser thread. This creates some extra complexity with type-safety
and mimicking blocking RPCs.

We heavily leverage the Emscripten filesystem. Code is passed from the URL hash
(for ease of sharing), to the main frame, to the worker, and finally to the
Emscripten filesystem. Emscripten supports many filesystem implementations such
as IndexDB which we use to persist the user's files. We are working on our own
implementation of the Emscripten filesystem built on top of any S3-compatible
bucket. This means you'll be able to list, read, and write files from your S3
bucket just by interacting with ”os” filesystem all in Python.

In order to make the experience smooth in any browser environment, we do our
best to auto-install packages. Whenever a cell is run, we try to install it
through Pyodide or otherwise fallback to micropip.

### Python

Similar to our TypeScript codebase, our Python codebase uses the same
implementation for Pyodide and native Python. We introduced just a few branches based
on [whether the kernel is running under
Pyodide](https://pyodide.org/en/stable/usage/faq.html#how-to-detect-that-code-is-run-with-pyodide),
since some Python features, such as shared memory, threading, and
multiprocessing, are not yet available in Pyodide. As one example, we replaced
multiprocessing queues with `asyncio` queues.

We added a new entrypoint for creating the marimo kernel when running under
Pyodide, which receives messages from the RPC bridge in an asynchronous
control loop. This entrypoint also sets up stream objects (e.g., for standard
output) to use the message callback provided to it by the frontend.

In order to support package installation with micropip, we had to modify the
kernel implementation to support top-level `await`. Typically, it is a syntax
error to use `await` outside a function, but `micropip.install` is an
async function and must be awaited. So we [configured code
compilation](https://docs.python.org/3/library/functions.html#compile) to allow
top-level await, and wrapped the marimo kernel in an `asyncio` event loop. As a
bonus, this change made it possible to use top-level `await` when running
via native Python, a feature that had been requested by our users for some time.

## What’s next?

We believe that marimo used with Pyodide holds enormous potential for making computing more accessible:

- Anyone can create and share live notebooks, without having to pay for infrastructure.
- Students can get started with Python instantly, without having to set up a development environment.
- Library developers can embed reactive coding environments and demos in documentation — we’ve done this throughout our own [API docs]([https://docs.marimo.io/api/inputs/slider.html](https://docs.marimo.io/api/inputs/slider.html)).
- Authors can publish interactive blog posts and [computational tools]([https://vxlabs.com/2024/03/02/contact-qrcode-generator-with-marimo-and-wasm/](https://vxlabs.com/2024/03/02/contact-qrcode-generator-with-marimo-and-wasm/)) as part of static web pages.

We have ideas on how to make Pyodide-powered
marimo notebooks more useful — e.g., we’d like to make it easier to work with
auxiliary code and data files, and to save multiple notebooks at our
playground. We’re also interested in helping the Pyodide team support more
packages.

Most of all, though, we’d like to learn what _you_ want: come chat with us
in our [Discord](https://discord.gg/JE7nhX6mD8) or
[Github](https://github.com/marimo-team/marimo), or send us an email at
contact@marimo.io.
