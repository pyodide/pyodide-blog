---
title: "Pytml: Python in Your HTML with a Single Script Tag"
date: 2026-10-07
draft: false
tags:
  - announcement
  - guest post
author:
  - ASWANTH
showToc: true
TocOpen: false
hidemeta: false
comments: false
description: "Writing interactive HTML pages with Python, powered by Pyodide."
disableHLJS: true
disableShare: false
hideSummary: false
searchHidden: false
ShowReadingTime: true
ShowBreadCrumbs: true
ShowPostNavLinks: true
---

I'm the creator of [Pytml](https://github.com/NodeX-AR/Pytml), an open-source project that lets you write Python directly inside HTML and execute it in the browser using Pyodide.

The idea is simple: add one script tag, write Python in a `<py>` block, and let Pyodide provide the Python runtime.

```html
<script src="https://pytml.vercel.app/pytml.js"></script>

<py>
print("Hello from Python!")
</py>
```

There is no Python server involved. The Python code runs in the browser.

I originally built Pytml to make the first step into interactive web programming easier for people who already know, or are learning, Python. Along the way, the project became an experiment in how a relatively small JavaScript layer can connect Python to the browser DOM.

In this post, I'll describe how Pytml works, why I chose Pyodide, some of the problems I encountered while building it, and where I want to take the project next.

## What is Pytml?

Pytml is a small JavaScript runtime for writing Python alongside HTML.

A normal webpage might use JavaScript to respond to a button:

```html
<button id="hello">Click me</button>
<p id="output"></p>

<script>
document.getElementById("hello").addEventListener("click", () => {
  document.getElementById("output").textContent = "Hello!";
});
</script>
```

With Pytml, the same interaction can be written in Python:

```html
<button id="hello">Click me</button>
<p id="output"></p>

<py>
def clicked(event):
    output.text = "Hello!"

hello.on("click", clicked)
</py>
```

Pytml automatically exposes DOM elements with valid IDs to Python. The `output` variable above refers to the `<p id="output">` element, while `hello` refers to the button.

The browser is still using normal HTML elements. Pytml is providing the bridge that allows Python code running through Pyodide to work with them.

## Why Python in HTML?

The motivation is mostly educational.

When someone wants to make a webpage interactive, there are several technologies involved at once: HTML for structure, CSS for presentation, JavaScript for behavior, DOM APIs for manipulating the page, and browser event APIs for interaction.

That's a lot to learn before a beginner can make a button do something.

Python is already familiar to many beginners, especially through programming and data-science education. I wanted to explore whether the same language could be used for simple browser interactions without requiring a Python backend.

Pytml doesn't try to replace JavaScript. Instead, it provides another way to build small interactive pages.

For example, a counter can keep its state in Python:

```html
<p id="output">count = 0</p>

<py1>

count = 0

<btn1>Add</btn1>
<btn2>Reset</btn2>

def add_one(event):
    global count
    count += 1
    output.text = f"count = {count}"

def reset(event):
    global count
    count = 0
    output.text = "count = 0"

btn1.on("click", add_one)
btn2.on("click", reset)

</py1>
```

The Python program owns the state, while the HTML elements provide the interface.

## Why Pyodide?

Pytml would be a very different project without Pyodide.

I did not want to implement a Python interpreter, compile Python to JavaScript, or create a server that receives Python code and sends the results back to the browser.

Pyodide already provides a Python runtime compiled to WebAssembly, along with JavaScript interoperability.

That means Pytml can concentrate on the layer between Python and HTML.

The architecture is roughly:

```text
HTML document
     |
     v
Pytml JavaScript runtime
     |
     +---- finds Python blocks
     |
     +---- creates inline UI elements
     |
     +---- prepares the Python environment
     |
     v
Pyodide
     |
     v
Python + Pytml DOM API
     |
     v
Browser DOM
```

This separation is important.

Pyodide handles Python execution and the Python/JavaScript boundary. Pytml handles the HTML authoring experience and exposes browser functionality through a small Python API.

## Running Python blocks

Pytml 2.5 recognizes Python blocks such as:

```html
<py>
print("Hello")
</py>
```

and numbered blocks:

```html
<py1>
print("Program one")
</py1>

<py2>
print("Program two")
</py2>
```

The numbered tags are program identifiers rather than filenames.

This allows multiple blocks to share a program context:

```html
<py1>
count = 10
</py1>

<py1>
print(count)
</py1>
```

The second `py1` block can access the state created by the first one.

A different identifier represents another program:

```html
<py2>
message = "This belongs to program two"
</py2>
```

Pytml also supports Python source files through the `src` attribute and supports `script[type="text/python"]` blocks.

## Preprocessing HTML and Python

One of the first implementation problems was that HTML and Python are two different languages.

Pytml's `<py>` blocks can contain Pytml-specific UI declarations such as:

```html
<py1>

<btn1>1</btn1>
<btn2>2</btn2>

def clicked(event):
    ...

</py1>
```

`<btn1>` isn't Python syntax, so it cannot simply be passed to Python's parser.

Instead, Pytml performs a lightweight preprocessing pass.

It walks through the contents of the Python block and separates text nodes from the supported inline UI elements.

The text nodes are preserved as Python source.

The UI declarations are converted into actual DOM elements.

For example:

```html
<btn1>1</btn1>
```

becomes approximately:

```html
<button id="btn1">1</button>
```

The generated element is inserted into the page and the original Pytml element is removed from the Python source.

Pytml 2.5 currently recognizes numbered:

- `<btnN>`
- `<inputN>`
- `<txtN>`

elements.

This was deliberately implemented as a small preprocessing layer rather than as a new Python syntax or a complete compiler.

Python indentation is preserved while the block is processed, so normal Python formatting can remain normal Python formatting.

## Binding the DOM to Python

Once Pyodide has started, Pytml installs a Python module named `pytml` into the Pyodide environment.

One of the first things the runtime does before executing a Python block is bind DOM elements with IDs into that block's Python namespace.

Conceptually:

```html
<button id="hello">Hello</button>
<p id="output"></p>
```

becomes available to Python as:

```python
hello
output
```

The runtime creates an `Element` wrapper around the underlying JavaScript DOM object.

The wrapper provides properties such as:

```python
output.text = "Hello"

input_box.value = "Python"

button.disabled = True
```

It also exposes operations such as:

```python
button.click()

button.add_class("active")
button.remove_class("active")

button.focus()
button.blur()

element.scroll_to(0, 100)
```

There is also an explicit API for selecting elements:

```python
from pytml import get, query, query_all

button = get("hello")
```

The important part is that the Python object is only a wrapper. The actual element remains a normal browser DOM object.

## Events

Reading and changing the DOM is useful, but interactive applications also need events.

Pytml exposes event listeners through:

```python
button.on("click", handler)
```

For example:

```python
def clicked(event):
    output.text = "Clicked!"

button.on("click", clicked)
```

The JavaScript runtime creates a Pyodide proxy around the Python callback and registers it as a normal DOM event listener.

When the browser event occurs, Pytml converts the event into a Python-friendly dictionary-like object.

For example:

```python
def changed(event):
    print(event["value"])
    print(event["type"])
    print(event["x"])
    print(event["y"])

input_box.on("input", changed)
```

The event object includes common browser information such as coordinates, keyboard information, pointer information, input values, checkbox state, scrolling values, and modifier keys.

It also provides event-control methods:

```python
event.prevent_default()
event.stop_propagation()
event.stop_immediate_propagation()
```

One subtle problem here is lifecycle management.

A Python callback passed to JavaScript cannot simply disappear after the Python function returns. Pyodide's `create_proxy` is used to keep a callable JavaScript representation of the Python function.

Pytml therefore keeps track of registered callback proxies.

The `.on()` method also returns a function that can remove the listener:

```python
remove = button.on("click", clicked)

# Later:
remove()
```

That cleanup becomes important for pages that dynamically attach and remove event handlers.

## Python's `input()`

Another interesting browser mismatch is Python's built-in `input()`.

In a normal terminal:

```python
name = input("What is your name? ")
```

blocks until the user enters a value.

A browser doesn't work that way. Blocking the JavaScript thread while waiting for an HTML input would freeze the page.

Pytml therefore replaces Python's `input()` with an asynchronous browser implementation.

When Python calls:

```python
name = input("What is your name? ")
```

Pytml displays an input control in the page.

Internally, the runtime transforms calls to `input()` using Python's AST machinery so that the browser interaction can be awaited.

This allows familiar Python code to work without blocking the browser.

It's a good example of one of the differences between running Python in a terminal and running Python inside a browser.

## Output and errors

Pytml also redirects Python's standard output.

When Python executes:

```python
print("Hello")
```

the output is passed back through the JavaScript runtime and displayed by Pytml.

This makes small examples behave more like ordinary Python programs.

Errors are similarly captured and reported through the Pytml output system.

There is still room for improvement here. Since Python code originates inside an HTML document, source mapping and error locations can become less straightforward than they are in a normal `.py` file.

Improving that debugging experience is one of the areas I would like to work on further.

## Loading Pyodide

The biggest unavoidable challenge is startup time.

A Python runtime compiled to WebAssembly is considerably larger than a small JavaScript library.

Pytml therefore starts preparing Pyodide as early as possible.

The runtime establishes the connection to the Pyodide CDN and preloads the WebAssembly file while the rest of the page is loading.

The page also has a boot state.

While Pyodide is starting, interactive controls are visible but temporarily inert, and Pytml displays:

```text
Loading Python…
```

Once Pyodide and the Pytml Python runtime are ready, the boot state is removed and the Python programs are executed.

This is not an attempt to hide the cost of Pyodide. The runtime still has to download and initialize.

The goal is instead to make the loading state explicit and start the work as early as possible.

## Packages

Another benefit of using Pyodide is that Pytml can use the package infrastructure provided by the Pyodide environment.

Pytml exposes `micropip` through its Python runtime:

```python
import micropip

await micropip.install("numpy")

import numpy as np

print(np.mean([1, 2, 3]))
```

The repository includes examples using NumPy, pandas, and matplotlib.

This means Pytml is not limited to toy browser interactions. Python code can also make use of the scientific Python ecosystem where the required package is available in the Pyodide environment.

The package support is really another example of why Pytml is built on Pyodide rather than attempting to create its own browser Python environment.

## Beyond buttons

Once the DOM bridge existed, it became natural to expose more browser functionality.

Pytml's runtime currently includes helpers for things such as:

- mouse, pointer, touch, keyboard, and scroll events
- timers
- clipboard operations
- browser storage
- downloads
- fullscreen
- canvas
- audio and video
- gamepads
- touch joysticks

For example, a page can create a joystick and receive its movement in Python:

```html
<div id="stick"></div>
<pre id="state"></pre>

<py1>
from pytml import joystick

stick = joystick("stick")

def move(event):
    state.text = (
        f"x={event['joystick_x']:.2f} "
        f"y={event['joystick_y']:.2f} "
        f"magnitude={event['magnitude']:.2f}"
    )

stick.on("joystickmove", move)
</py1>
```

The joystick itself is implemented using browser pointer events. Pytml turns those interactions into a Python event containing values such as `x`, `y`, `magnitude`, `angle`, and whether the joystick is active.

This is where the project became more interesting to me than the original "Python inside HTML" experiment. Once there is a Python-to-DOM bridge, browser capabilities can be exposed incrementally without requiring a separate abstraction for every kind of application.

## A calculator as a test case

A calculator became one of the useful examples for testing the Pytml model.

The page contains an ordinary HTML display:

```html
<div id="display">0</div>
```

and the controls can be declared directly in the Python block:

```html
<btn1>1</btn1>
<btn2>2</btn2>
<btn3>3</btn3>
<btn4>+</btn4>
```

The Python program holds the state:

```python
num1 = ""
operator = ""

def number(n):
    global num1
    num1 += str(n)
    display.text = num1
```

and connects the browser events:

```python
btn1.on("click", lambda e: number(1))
btn2.on("click", lambda e: number(2))
btn3.on("click", lambda e: number(3))
```

The calculator isn't technically complicated. That's the point.

It tests several pieces of Pytml at once:

- inline UI preprocessing
- DOM ID binding
- Python state
- event callbacks
- DOM updates
- normal Python functions and variables

If those pieces work together, a small interactive page can remain mostly ordinary Python.

## What was difficult?

The most difficult part of Pytml hasn't been executing Python.

Pyodide already solves that problem.

The difficult part is making Python running inside a browser feel natural without pretending the browser is a terminal.

### HTML and Python have different rules

HTML is tree-structured and whitespace-insensitive.

Python is indentation-sensitive.

A preprocessing layer therefore has to be careful not to accidentally change Python whitespace while walking through HTML nodes.

The current Pytml implementation preserves text nodes while extracting its supported UI declarations.

### JavaScript is event-driven

Python examples often assume sequential execution.

Browser applications are event-driven.

Pytml has to translate between these models through callbacks, proxies, asynchronous functions, and browser events.

### The DOM is not Python

A browser DOM element is a JavaScript object.

Giving it a Python-friendly interface requires wrappers for properties, methods, events, and browser-specific behavior.

The `Element` class is intentionally a relatively thin wrapper. I would rather expose the browser's capabilities than create an entirely separate UI framework.

### Startup matters

Pyodide provides a powerful runtime, but that power comes with download and initialization costs.

For Pytml, this means startup behavior is part of the user experience rather than merely an implementation detail.

This is why the current runtime begins loading Pyodide early and provides a visible boot state.

## Pytml and other Python-in-the-browser projects

Pytml is part of a larger ecosystem made possible by Pyodide.

Projects such as PyScript and marimo demonstrate other ways of bringing Python to the browser.

The projects have different goals.

Pytml focuses on the relationship between ordinary HTML and Python.

The page remains an HTML document, and Pytml provides the runtime needed to execute Python and connect it to the DOM.

That makes Pytml particularly useful for experimenting with small interactive pages where the author wants to stay close to HTML while using Python for behavior.

## What Pyodide allowed me to avoid building

The most important architectural decision in Pytml was deciding what *not* to build.

Pytml does not implement its own Python interpreter.

It does not compile Python into JavaScript.

It does not run Python on a remote server.

It does not implement its own package ecosystem.

Instead, Pytml relies on Pyodide for:

- Python execution
- the WebAssembly runtime
- Python/JavaScript interoperability
- the Python environment
- access to the Pyodide package ecosystem

Pytml can therefore remain relatively small.

Its job is to connect three things:

```text
HTML
  ↕
Pytml runtime
  ↕
Python / Pyodide
```

That division of responsibility is what makes the project practical.

## What I learned

Building Pytml changed how I think about Python in the browser.

At first, the interesting question seemed to be:

> Can Python be written directly in HTML?

Pyodide makes the answer relatively straightforward.

The more interesting question became:

> What is the smallest bridge needed to make browser APIs feel natural from Python?

That led to the current `Element`, `Event`, DOM-binding, and callback APIs.

It also highlighted the importance of keeping the abstraction small. If every browser feature is hidden behind a completely new Python framework, the user has to learn the framework instead of learning the web platform.

Pytml works better when the abstraction stays close to the DOM.

## What's next?

Pytml 2.5 is intentionally a lightweight runtime and preprocessing layer.

The current implementation supports inline `<py>` and numbered `<pyN>` programs, DOM bindings, inline UI declarations, events, browser helpers, and Pyodide packages.

There is a larger compiler/document-processing direction I am considering for Pytml 3.0.

Some of the areas I would like to explore include:

- better source mapping and debugging
- more complete browser API coverage
- improving startup and caching behavior
- richer development tooling
- larger application support
- a more complete Pytml compiler

The goal isn't to turn Pytml into another large web framework.

I want to keep exploring how far a small Python/HTML bridge can go.

## Try Pytml

You can try Pytml by adding a single script tag:

```html
<script src="https://pytml.vercel.app/pytml.js"></script>
```

Then write Python directly in your HTML:

```html
<py>
print("Hello from Pytml!")
</py>
```

The project repository contains examples for counters, calculators, multiple Python programs, browser controls, NumPy, pandas, matplotlib, and touch joysticks.

The project is open source on GitHub:

https://github.com/NodeX-AR/Pytml

You can also try the live demos:

https://pytml.js.org/

## Conclusion

Pytml started as a small experiment in putting Python closer to HTML.

Pyodide made the experiment practical by providing the Python runtime and JavaScript interoperability. Pytml can then focus on the layer that connects Python to the HTML document.

There are still plenty of problems to solve, especially around startup time, debugging, browser API coverage, and eventually building a more complete compiler.

But the basic idea works:

a static HTML document can contain Python, execute it locally in the browser, interact with normal DOM elements, and use Python packages — without running a Python server.

That is what makes Pyodide particularly exciting to me. It doesn't just put Python in the browser; it makes it possible to experiment with new ways of building for the web.
