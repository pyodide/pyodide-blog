---
title: "Marimo"
date: 2024-03-28T14:57:24-07:00
draft: true
tags: ["announcement"]
# author: "Me"
author: ["Akshay Agrawal", "Myles Scolnick"] # multiple authors
showToc: true
TocOpen: false
draft: false
hidemeta: false
comments: false
description: "A reactive Python notebook that runs entirely in the browser."
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

# marimo: a reactive Python notebook that runs entirely in the browser


We’re [Akshay Agrawal](https://akshayagrawal.com) and [Myles
Scolnick](https://mylesscolnick.com/), and we’re the developers of
[marimo](https://github.com/marimo-team/marimo), an open-source reactive
notebook for Python that’s reproducible (no hidden state!), stored as Python
files (easily versioned with git!), executable as a script, and deployable as
interactive web apps.

In this post we’ll describe how we ported marimo to [run entirely in the
browser](https://marimo.app/l/c7h6pz) using Pyodide, making Python-based
development available to everyone, for free.

As a preview, here’s our tutorial notebook _running in your browser_:

<iframe
  src="https://marimo.app/l/c7h6pz?embed=true"
  width="800"
  height="600"
></iframe>


## What is marimo?

marimo is an open-source reactive notebook for Python, built from the ground up to solve [well-known problems with traditional notebooks](https://docs.marimo.io/faq.html#faq-problems), including reproducibility, interactivity, maintainability, and shareability. 


**A reactive notebook with no hidden state.**
In marimo, a notebook’s code, outputs, and program state are always consistent.
Run a cell and marimo **reacts** by automatically running the cells that
reference its declared variables. Delete a cell and marimo scrubs its variables
from program memory, eliminating hidden state. Try this for yourself!

<iframe
  src="https://marimo.app/l/9bnuyz?embed=true"
  width="800"
  height="300"
></iframe>



Our reactive runtime is based on static analysis, so it’s performant. If you’re
worried about accidentally triggering expensive computations, you can disable
specific cells from auto-running.

**UI elements are automatically synchronized with Python.**
marimo comes with [UI
elements](https://docs.marimo.io/api/inputs/index.html) like sliders, a
dataframe transformer, and interactive plots. Interact with an element and the
cells that use it are automatically re-run with its latest value. Reactivity
makes these UI elements more useful and ergonomic than Jupyter’s ipywidgets.

<iframe
  src="https://marimo.app/l/p9l3ay?embed=true"
  width="800"
  height="400"
></iframe>


**Deploy as an app, run as a script.**
Every marimo notebook can served as an interactive web app (with outputs
concatenated and code hidden). Additionally, marimo notebooks can be run as
scripts from the command line, with cells executed in a topologically sorted
order. For example, here's a simple educational app:

<iframe
  src="https://marimo.app/l/e9wii1?mode=read&embed=true"
  width="800"
  height="800"
></iframe>


**Use cases.** marimo can be used in many ways. It can be used as a next-gen
replacement for Jupyter notebooks, allowing you to explore data very rapidly —
change code or interact with a UI element, and see outputs change instantly —
and run experiments in an environment that prevents bugs before they happen. It
can also be used to make powerful interactive apps, dashboards, and internal
tools.

**A Pyodide-powered playground.**
All the embedded marimo notebooks you've seen in this blog post are powered by
our Pyodide-marimo playground: you can try marimo in your browser, *without
installing marimo or even Python*, by navigating to
[https://marimo.new](https://marimo.new).

If you want to use marimo locally, get started with

```bash
pip install marimo && marimo tutorial intro
```

at your command line.


## Using Pyodide to make marimo accessible to everyone

**Why Pyodide?**
Pyodide excites us because it has the potential to make computing accessible to
everyone: while not everyone has the ability to install Python, almost everyone
has access to a web browser. It also makes it much easier to share live
computational documents or notebooks (no server required!). For these reasons,
we decided to port marimo to work with Pyodide.

**The Pyodide-marimo playground.**
[Our playground](https://marimo.new) makes it extremely easy for anyone in the
world to tinker with marimo notebooks. With just one click, playground
notebooks can be shared with others, and conversely every local notebook can be
shared via our playground.

Here are some use cases that our Pyodide-powered notebooks enable:

- Rapidly experiment with code and models, without having to install Python or any packages
- Author blog posts, tutorials, and educational materials
- Embed interactive notebooks in library documentation or other static web pages
- Build tools, like a data labeler, embedding visualizer, model comparison tool, or anything else you can imagine
- Create and share bug reproductions

When you take a moment to think about all this, it’s really quite *magical* ✨.
Thanks to Pyodide, you can use any pure Python package, as well as a number of
packages for scientific computing, including Pandas, NumPy, SciPy, matplotlib,
and scikit-learn, entirely in the sandbox of your web browser --- _without
installing Python on your machine and without paying for infrastructure_. Plus,
because everything runs in the browser, Pyodide can make marimo notebooks feel
snappier -- code changes and UI interactions never need to wait for a
round-trip to a remote server.

**Examples.** We’ve created a few example notebooks to jumpstart your imagination. There’s one that [trains a tiny neural network](https://marimo.app/l/xpd4te), another that visualizes [Bayes’ Theorem](https://marimo.app/l/odhwnq), and another that plots attractors of [dynamical systems](https://marimo.app/l/c7h6pz). One of our community members even created a [QR code generator](https://vxlabs.com/2024/03/02/contact-qrcode-generator-with-marimo-and-wasm/).

**Learn more**. Learn more on how to use the marimo playground, including how
to include marimo notebooks in static HTML pages, [at our
docs](https://docs.marimo.io/guides/wasm.html).

**History.** Pyodide was originally developed to enable a browser-based
scientific notebook called
[Iodide](https://hacks.mozilla.org/2019/03/iodide-an-experimental-tool-for-scientific-communicatiodide-for-scientific-communication-exploration-on-the-web/).
While Iodide is no longer developed, its developers’ vision has been an
inspiration to us, and we’re extremely grateful that it ushered Pyodide into
existence.

## Implementation: porting marimo to Pyodide

Porting marimo to work with Pyodide was straightforward, a testament to the
latter's robustness and its thorough documentation. 

marimo's original implementation has three main parts:

1. a frontend
2. a server
3. a backend (or "runtime") with a kernel that runs Python code

All that was required were
minimal changes to the marimo frontend and runtime, and replacing the server
with a lightweight bridge (split across the frontend and runtime).

### Frontend

**Web worker.**
We [run Pyodide in a web worker](https://pyodide.org/en/stable/usage/webworker.html) to avoid blocking the main browser thread. XXX

**Filesystem.** Emscripten XXX

**Interrupts.**

To support interruption of Python code, we simply followed the [Pyodide documentation](https://pyodide.org/en/stable/usage/keyboard-interrupts.html) on using its `SharedArrayBuffer`-based mechanism; this worked seamlessly.

### Runtime

We were able to reuse our Python runtime in its entirety, save for a small few changes; it more or less “just worked”. 

**Top-level await.** In Pyodide, packages are installed using the micropip module’s `install` method, which is a coroutine function that must be awaited. In order to support this, we needed to support using top-level `await` in marimo notebooks; however, top-level await is by default invalid Python syntax, even though it has its uses in interactive computing. Thankfully, Python standard library lets you opt-in to top-level await [via a flag to its built-in compile method](https://docs.python.org/3/library/functions.html). After enabling this language feature, we simply had to wrap the marimo kernel in an `asyncio` event loop.

**Asyncio-based runner**. In our original kernel implementation, marimo receives control commands such as “run cell”, “update UI element value”, and so on via a multiprocessing queue, which it pulls from in synchronous `while True` loop. This was a non-starter for Pyodide, because we couldn’t block the worker thread. So we created a new control loop based on asyncio specifically for when marimo is run under Pyodide.

**Synchronous IO.** To get print statements to show up synchronously in the frontend, we parametrized marimo’s kernel with a message callback, replacing its default stream implementations to use this callback. The frontend supplies the kernel with this callback and forwards messages to the main browser thread, making sure that print statements show up synchronously while code is running.

**Patching incompatible modules.** Pyodide is largely incompatible with multi-threading and multi-processing, which our original kernel implementation makes use of, especially for IO. For example, we use multiprocessing queues to pass information around; we got around this by building an abstract queue class, parametrizing our kernel with it, and using `asyncio.Queue` objects when running under Pyodide. Similarly, our original implementation makes use of the shared memory module to communicate between the server and backend; this is entirely unnecessary (and unsupported) when running under Pyodide, so we simply disable this feature when [Pyodide is being used](https://pyodide.org/en/stable/usage/faq.html#how-to-detect-that-code-is-run-with-pyodide).

## What’s next?

We believe that Pyodide, combined with marimo, holds enormous potential for making computing more accessible. With Pyodide …

- anyone can create and share live notebooks, without having to pay for infrastructure
- students can get started with Python instantly, without having to set up a development environment
- library developers can embed interactive coding environments in documentation — we’ve done this throughout our own [API docs]([https://docs.marimo.io/api/inputs/slider.html](https://docs.marimo.io/api/inputs/slider.html))
- authors can publish interactive blog posts and [computational tools]([https://vxlabs.com/2024/03/02/contact-qrcode-generator-with-marimo-and-wasm/](https://vxlabs.com/2024/03/02/contact-qrcode-generator-with-marimo-and-wasm/)) as part of static web pages

**We want to hear from you.** We have ideas on how to make Pyodide notebooks more useful — *e.g.*, we’d like to make it easier to work with auxiliary code and data files, and to save multiple notebooks at our playground. We’re also interested in helping the Pyodide team support more packages. Most of all, though, we’d like to learn what would be most useful to you. Don’t hesitate to reach out to us at contact@marimo.io.
