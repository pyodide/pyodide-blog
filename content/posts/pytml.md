---
title: "Pytml: Python in Your HTML with a Single Script Tag"
date: 2026-10-17
draft: false
tags:
  - announcement
  - guest post
author:
  - ASWANTH
showToc: true
TocOpen: false
hidemeta: false
description: "Writing interactive HTML pages with Python, powered by Pyodide."
disableHLJS: true
disableShare: false
hideSummary: false
searchHidden: false
ShowReadingTime: true
ShowBreadCrumbs: true
ShowPostNavLinks: true
---

I'm the creator of Pytml, an open-source JavaScript library that lets you write Python directly inside HTML and execute it in the browser using Pyodide.

The idea is simple: add one script tag, write Python in a `<py>` block, and let Pyodide provide the Python runtime.

```html
<script src="https://pytml.vercel.app/pytml.js"></script>

<py>
print("Hello from Python!")
</py>
```

There is no Python server involved. The Python code runs in the browser.

I originally built Pytml to make the first step into interactive web programming easier for people who already know, or are learning, Python. Along the way, the project became an experiment in how a relatively small JavaScript layer can connect Python to the browser DOM.

In this post, I'll describe how Pytml works, why I chose Pyodide, some of the problems I encountered while building it, how it compares with other Python web tools, and where I want to take the project next.

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
<btn1>Add</btn1>
<btn2>Reset</btn2>

count = 0

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

### How Pytml differs from other Python web tools

There are already several ways to build applications with Python without writing traditional JavaScript.

Projects such as Streamlit, Panel, Gradio, and Anvil provide higher-level abstractions for building applications with Python. Their architectures and deployment models are different, and some of them can also use browser-side Python in certain configurations.

Pytml takes a different approach.

Instead of primarily providing a Python API that describes an entire interface, Pytml starts with an HTML document and provides a bridge from Python to that document.

That means the author can still think in terms of HTML:

```html
<button id="hello">Hello</button>
<p id="output"></p>
```

while using Python for the behavior:

```python
def clicked(event):
    output.text = "Hello!"

hello.on("click", clicked)
```

The trade-off is intentional.

A higher-level framework can hide HTML and browser details and provide a more Pythonic programming model. Pytml does almost the opposite: it keeps the HTML visible and tries to make the connection between Python and the browser obvious.

This makes Pytml useful for small interactive pages, experiments, and for people who want to stay close to HTML while using Python for behavior.

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

This allows multiple blocks to share a Python program context:

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

This is useful when a page contains multiple independent pieces of Python.

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

becomes a real button:

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

This was one of the places where I had to be careful: HTML is not sensitive to indentation in the same way Python is. A preprocessing step that accidentally changed Python whitespace could turn valid Python into invalid Python.

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

This is an intentional design choice. I don't want every browser capability to become a completely separate Pytml abstraction. Where possible, the Python API should stay close to the underlying web platform.

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

When the browser event occurs, Pytml converts the event into a Python-friendly object.

For example:

```python
def changed(event):
    print(event["value"])
    print(event["type"])
    print(event["x"])
    print(event["y"])

input_box.on("input", changed)
```

The event object exposes browser information such as coordinates, keyboard information, pointer information, input values, checkbox state, scrolling values, and modifier keys.

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

Pytml therefore provides a browser-compatible implementation of `input()`.

When Python calls:

```python
name = input("What is your name? ")
```

Pytml displays an input control in the page.

Internally, the runtime transforms calls to `input()` using Python's AST machinery so that the browser interaction can be awaited.

At a high level, the process is:

1. Pytml parses the Python source into an abstract syntax tree.
2. It identifies calls to `input()`.
3. Those calls are transformed into the asynchronous Pytml input path.
4. The browser displays an input control and waits for the user without blocking the page.
5. The resulting value is returned to the Python program.

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

Since Python code originates inside an HTML document, source mapping and error locations can be less straightforward than they are in a normal `.py` file.

Improving that debugging experience is one of the areas I would like to work on further.

## Loading Pyodide

The biggest unavoidable challenge is startup time.

A Python runtime compiled to WebAssembly is considerably larger than a small JavaScript library.

Pytml therefore starts preparing Pyodide as early as possible.

The runtime establishes the connection to the Pyodide CDN and begins loading the WebAssembly runtime while the rest of the page is loading.

The page also has a boot state.

While Pyodide is starting, interactive controls are temporarily inert and Pytml displays:

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

Packages available in the Pyodide environment can be used from Pytml, including common scientific packages such as NumPy, pandas, and Matplotlib.

You can see the package examples and other runnable examples in the project's [examples directory](https://github.com/NodeX-AR/Pytml/tree/main/examples).

The [live demos](https://pytml.js.org/demo.html) provide another way to see the browser-side examples without setting up a development environment.

This is another reason I chose to build Pytml on Pyodide rather than attempting to create a separate browser Python environment.

## Beyond buttons

Once the DOM bridge existed, it became natural to expose more browser functionality.

Pytml's runtime includes helpers for things such as:

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

The joystick turns browser interaction into a Python event containing values such as its X and Y position, magnitude, angle, and active state.

The [joystick example in the Pytml examples](https://github.com/NodeX-AR/Pytml/tree/main/examples) is a useful place to see this kind of browser interaction in context.

This was one of the points where the project became more interesting to me than the original "Python inside HTML" experiment.

Once there is a Python-to-DOM bridge, browser capabilities can be exposed incrementally without requiring a separate abstraction for every kind of application.

## A tiny joystick game

A calculator was useful for testing the basic Pytml model, but it doesn't show why browser interaction becomes interesting once Python can receive richer input.

A small game is a better example.

The idea is simple: move a player around a small board using a joystick and reach the goal.

The board itself is just a normal HTML `<pre>` element. Python keeps track of the player's position and updates the element when the joystick moves.

```html
<div id="stick"></div>
<pre id="board"></pre>

<py1>
from pytml import joystick

width = 11
height = 7

player_x = 1
player_y = 1

goal_x = width - 2
goal_y = height - 2

won = False

def draw():
    rows = []

    for y in range(height):
        row = ""

        for x in range(width):
            if x == player_x and y == player_y:
                row += "@ "
            elif x == goal_x and y == goal_y:
                row += "* "
            elif x == 0 or x == width - 1 or y == 0 or y == height - 1:
                row += "# "
            else:
                row += ". "

        rows.append(row)

    board.text = "\n".join(rows)

stick = joystick("stick")

def move(event):
    global player_x, player_y, won

    if won:
        return

    x = event["joystick_x"]
    y = event["joystick_y"]

    if abs(x) < 0.25 and abs(y) < 0.25:
        return

    if abs(x) > abs(y):
        player_x += 1 if x > 0 else -1
    else:
        player_y += 1 if y > 0 else -1

    player_x = max(1, min(width - 2, player_x))
    player_y = max(1, min(height - 2, player_y))

    if player_x == goal_x and player_y == goal_y:
        won = True
        board.text = "You win!"
        return

    draw()

stick.on("joystickmove", move)

draw()
</py1>
```

The game is deliberately small.

`@` represents the player, `*` represents the goal, and `#` represents the border.

The interesting part isn't the game itself. It is the path from the browser to Python:

```text
touch joystick
      ↓
browser pointer events
      ↓
Pytml joystick event
      ↓
Python callback
      ↓
Python game state
      ↓
DOM update
```

There is no game engine involved. Python owns the state and the game rules, while Pytml connects the browser input to the Python program and lets the program update an ordinary HTML element.

That is the kind of interaction I wanted Pytml to make approachable.

You can explore more working examples in the [Pytml examples directory](https://github.com/NodeX-AR/Pytml/tree/main/examples), or try the [live Pytml demos](https://pytml.js.org/demo.html).

## What was difficult?

The most difficult part of Pytml hasn't been executing Python.

Pyodide already solves that problem.

The difficult part is making Python running inside a browser feel natural without pretending the browser is a terminal.

### HTML and Python have different rules

HTML is tree-structured and whitespace-insensitive.

Python is indentation-sensitive.

A preprocessing layer therefore has to be careful not to accidentally change Python whitespace while walking through HTML nodes.

The current Pytml implementation preserves text nodes while extracting its supported UI declarations.

This sounds small, but it is an important part of making the syntax feel natural. A beginner writing normal Python shouldn't have to think about how an HTML parser might alter their indentation.

### JavaScript is event-driven

Python examples often assume sequential execution.

Browser applications are event-driven.

Pytml has to translate between these models through callbacks, proxies, asynchronous functions, and browser events.

The `input()` implementation is one example. Instead of blocking like terminal input, the browser interaction has to yield while the user interacts with the page.

Event callbacks are another. A Python function has to remain callable from JavaScript after the Python code that registered it has finished executing.

### The DOM is not Python

A browser DOM element is a JavaScript object.

Giving it a Python-friendly interface requires wrappers for properties, methods, events, and browser-specific behavior.

The `Element` class is intentionally a relatively thin wrapper. I would rather expose the browser's capabilities than create an entirely separate UI framework.

This is also why Pytml keeps ordinary HTML elements rather than replacing them with completely new Python-only components.

### Main-thread DOM access

There is another architectural limitation worth making explicit.

The browser DOM is not directly available from a Web Worker.

Pytml's current DOM bridge therefore works around the normal browser DOM rather than providing a worker-to-DOM messaging architecture.

Pyodide itself can be used in different execution arrangements, but moving the Pytml DOM layer into a worker would require a separate communication layer between the worker and the main thread.

That isn't something Pytml currently provides.

### Startup matters

Pyodide provides a powerful runtime, but that power comes with download and initialization costs.

For Pytml, this means startup behavior is part of the user experience rather than merely an implementation detail.

This is why the current runtime begins loading Pyodide early and provides a visible boot state.

## Pytml and other Python-in-the-browser projects

Pytml is part of a larger ecosystem made possible by Pyodide.

Projects such as PyScript and marimo demonstrate other approaches to running Python in web environments.

There are also Python application frameworks such as Streamlit, Panel, Gradio, and Anvil that solve a different part of the problem by providing higher-level ways to build applications with Python.

The important distinction is the authoring model.

Pytml focuses on the relationship between ordinary HTML and Python.

The page remains an HTML document, and Pytml provides the runtime needed to execute Python and connect it to the DOM.

A framework that generates or manages most of the interface for you can be a better fit for a larger application. Pytml is intentionally closer to the page itself.

I wanted the following to remain possible:

```html
<button id="hello">Hello</button>
<p id="output"></p>
```

with the behavior written as:

```python
def clicked(event):
    output.text = "Hello!"

hello.on("click", clicked)
```

The goal is not to hide the web platform. It is to make it possible to use Python while still seeing the web platform underneath.

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

That led to the current DOM, event, input, and browser-helper APIs.

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

If you want to see the project before writing your own page, start with the [Pytml live demos](https://pytml.js.org/demo.html). For the implementation behind those examples, the [examples directory](https://github.com/NodeX-AR/Pytml/tree/main/examples) contains the project's example pages.

The [Pytml repository](https://github.com/NodeX-AR/Pytml) contains the runtime, examples, tests, and documentation.

## Conclusion

Pytml started as a small experiment in putting Python closer to HTML.

Pyodide made the experiment practical by providing the Python runtime and JavaScript interoperability. Pytml can then focus on the layer that connects Python to the HTML document.

There are still plenty of problems to solve, especially around startup time, debugging, browser API coverage, and eventually building a more complete compiler.

But the basic idea works:

a static HTML document can contain Python, execute it locally in the browser, interact with normal DOM elements, and use Python packages — without running a Python server.

That is what makes Pyodide particularly exciting to me. It doesn't just put Python in the browser; it makes it possible to experiment with new ways of building for the web.
