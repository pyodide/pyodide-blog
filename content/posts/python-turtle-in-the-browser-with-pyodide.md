---
title: "Running Python Turtle in the Browser with Pyodide"
date: 2026-01-01
author: "Aaqid Masoodi"
showToc: true
TocOpen: false
hidemeta: false
comments: false
---
# Running Python Turtle in the Browser

Hi, I’m Aaqid Masoodi. I hold a Master’s degree in Computing and Artificial Intelligence from Dublin City University and I’m the creator of CodeScapes, a browser-based code editor designed for educational use.

CodeScapes is built to help students and teachers get started with programming instantly, with zero setup. No installations, no environment issues, no “it works on my machine” problems. You open the browser and start learning.

The core philosophy behind CodeScapes is simple but non-negotiable:
code written in the browser should run unmodified on the desktop. This preserves pedagogical integrity and respects established teaching practices, instead of forcing students into hacky, broken patterns that only work in the browser.

This post explores how I built a complete turtle graphics implementation using Pyodide, allowing unmodified desktop Python code to run directly in the browser while keeping the learning experience authentic, transferable and aligned with how Python is actually taught.

---

*The video below demonstrates some of CodeScapes' Python capabilities, including turtle graphics. Note: The AI coding assistant (Scapper) shown is an early beta version. it has since been significantly improved with features like apply_diff for surgical edits instead of regenerating entire files.*

{{< youtube 5Uor8WaKBmM >}}

<br>

Python's turtle module is often the first visual programming experience for learners. It's immediate, intuitive and deeply satisfying. You write code, a little arrow draws on screen.

But running turtle in the browser has always been compromised.

The original turtle module is built on Tkinter, Python's standard GUI toolkit. Tkinter doesn't exist in the browser, there's no underlying Tk/Tcl runtime, no native window system, no event loop that integrates with the browser's execution model. This forces browser-based Python environments to reimplement turtle from scratch.

Existing implementations like [Basthon](https://basthon.fr/), [Trinket](https://trinket.io/) and [Skulpt-based environments](https://skulpt.org/) provide *subsets* of the turtle API. They work for simple demos: draw a square, make a spiral. But try anything interactive like keyboard-controlled games, mouse-driven drawing, real-time animations and the experience falls apart.

- mainloop() doesn't block, so event-driven programs exit immediately
- onkeypress() handlers never fire, or fire inconsistently
- tracer(0) and update() don't prevent flickering
- input() hangs indefinitely or crashes
- Complex fills render incorrectly
- Multiple turtles interfere with each other

The result is that learners can't use code from textbooks, tutorials or AI assistants without significant modifications. The "just paste and run" experience that makes turtle so approachable on desktop disappears.

**We set out to build an implementation where unmodified desktop turtle code runs correctly in the browser.**

---

## Demonstration: What Actually Works

Before diving into architecture, let's establish what "works" means in practice. These are real programs running in the browser, unchanged from their desktop versions.

### Interactive Games

**Pong**: Two-player game with keyboard controls (`W/S` and `Arrow keys`), ball physics, paddle collision detection and live scoring.


[View Project](https://www.codescapes.io/community/scape/f10bced9-f2e3-4c50-ab9c-38023c70cb5d)
<br>
![GIF: Pong Game Build with Turtle Graphics Running in the Browser](https://i.imgur.com/KqG1EZP.gif)




**Brick Breaker**: Paddle-controlled ball bouncing through destructible bricks. Requires [onkeypress()], collision detection, and [tracer(0)/update()] for smooth animation.

[View Project](https://www.codescapes.io/community/scape/3182ac71-8787-4530-80f7-4c61ba4ce0c8)
<br>
![GIF: Brick Breaker showing brick destruction and score updates](https://i.imgur.com/1kpaGdB.gif)


Both games use the standard game loop pattern:

1. Disable automatic screen updates with tracer(0)
2. Process input events
3. Update game state
4. Redraw everything
5. Call update() to display the frame
6. Sleep briefly to control framerate
7. Repeat forever via `while True`

This pattern requires blocking operations, event handling and flicker-free rendering, all of which fail in browser-based Python environments like Skulpt, Brython, and previous Pyodide turtle implementations.

---

### Generative Art and Visualization

**Animated Spirograph**: A spiral that rotates continuously in real-time.


[View Project](https://www.codescapes.io/community/scape/71622718-fe46-4c80-a27c-d172585ce6c0)
<br>
![GIF: Rotating spiral animation at 60 FPS](https://i.imgur.com/NpxBMbA.gif)

GIF only shows 15 fps, view original project at https://www.codescapes.io/view/71622718-fe46-4c80-a27c-d172585ce6c0

**Pattern Playlist**: Distinct geometric patterns (spirographs, mandalas, kaleidoscopes) cycling automatically with one-second intervals.

[View Project](https://www.codescapes.io/community/scape/3c269c6c-ab15-4f5a-966b-3f00b5c868e0)
<br>
![GIF: Multiple patterns transitioning](https://i.imgur.com/G6Y5npu.gif)

These demonstrate sustained animation loops with `time.sleep()` for pacing. This is another operation that typically breaks in Pyodide without special handling.

---

### Interactive 3D Graphics

**3D Spiral with Mouse Control**: A golden spiral rendered in 3D space. Click and drag to rotate the view around the Y-axis.

[View Project](https://www.codescapes.io/community/scape/b2b0676d-4ec5-46b4-9cab-6da707740b90)
<br>
![GIF: 3D spiral responding to mouse drag input](https://i.imgur.com/ebR3uww.gif)


This example combines:
- onscreenclick() for press detection
- onrelease() for release detection  
- ondrag() for continuous position updates
- Real-time 3D projection mathematics
- 30 FPS render loop with timing control

The full mouse event API working correctly is rare in browser implementations.

---

### Multi-File Applications

**Live Weather Dashboard**: A three-file application that prompts for a city name, fetches weather data from an API and displays results using turtle graphics as the UI layer.

[View Project](https://www.codescapes.io/community/scape/8fab103d-8278-4b83-9005-ab22bba95b9c)
<br>
![GIF: Weather app workflow: input city, fetch data, display results](https://i.imgur.com/N97Djyp.gif)


This demonstrates:
- Python's input() function working correctly
- HTTP requests via the `requests` library (supported natively in recent Pyodide versions)
- Multi-module imports across separate files
- Turtle used for UI rather than just drawing

The virtual filesystem, package ecosystem and blocking input all functioning together.

### Slow Drawing Examples

|                                                                                                |                                                                                                |
| ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| ![Neon Vortex](https://i.imgur.com/QVbghjC.gif)                                                | ![Glow Rosette](https://i.imgur.com/OxGes8L.gif)                                               |
| [View Project](https://www.codescapes.io/community/scape/b2c4bcb3-e284-43b1-a924-b1c724f6ec39) | [View Project](https://www.codescapes.io/community/scape/a44431fe-42da-4456-8fcd-f1a0e3e3799d) |
| ![Skulpt Example](https://i.imgur.com/EFViUgh.gif)                                             | ![Spiral Multi Color](https://i.imgur.com/oZrxo3g.gif)                                         |
| [View Project](https://www.codescapes.io/community/scape/396cfcb6-aa0a-4229-864f-23be2c6b6e36) | [View Project](https://www.codescapes.io/community/scape/41afe444-22f3-4598-adca-7f048d046e1d) |


These examples show how complex geometric patterns are constructed incrementally. This makes algorithmic thinking, motion and drawing logic easy to observe in real time.

- Controlled, time-stepped execution of Turtle Graphics commands
- Deterministic rendering of complex geometric patterns
- Visualization of algorithm flow through incremental drawing
- Turtle as a real-time rendering and teaching tool rather than a simple drawing API

---

## Why Browser Turtle Is Architecturally Difficult

Understanding why existing implementations struggle requires examining the fundamental mismatch between Python's execution model and the browser's.

### Python's Assumptions

The CPython turtle module was built for Tkinter, a desktop GUI toolkit. It assumes:

1. **Single-threaded blocking execution**: The Python interpreter runs on the main thread. [mainloop()] blocks that thread forever, yielding control to Tk's event loop.

2. **Synchronous input**: [input()] halts program execution until the user presses Enter. The thread simply waits.

3. **Direct canvas access**: Drawing commands immediately modify the Tk canvas. There's no message passing or thread coordination.

4. **Cooperative timing**: `time.sleep()` blocks the thread for a duration. Other threads (if any) continue, but Python code pauses.

### The Browser's Reality

Browsers enforce a fundamentally different model:

1. **Non-blocking main thread**: The main thread runs the JavaScript event loop. Blocking it freezes the entire page,no rendering, no input, no network responses. Browsers actively prevent this.

2. **No synchronous input API**: There's no browser primitive that blocks JavaScript until user input arrives. `prompt()` exists but can't be accessed from Web Workers.

3. **Isolated rendering context**: Web Workers (where Pyodide runs for non-blocking execution) cannot directly access the DOM or Canvas. Communication requires message passing.

4. **Sleep blocks everything**: In a Worker, `time.sleep()` blocks the entire Worker thread. That's acceptable, but during that time no messages can be processed.

### The Transpilation Approach and Its Limits

Projects like Skulpt and Brython take the transpilation approach converting Python source code to JavaScript. This avoids the threading problem entirely by running Python "natively" in JS.

However, transpilation introduces semantic differences:

- **No true blocking**: Generators and async/await can simulate pausing, but `while True: mainloop()` patterns don't translate cleanly
- **Limited standard library**: Only reimplemented modules are available
- **Behavioral divergence**: Edge cases differ from CPython because it's a different implementation

### Pyodide: Real CPython, New Challenges

Pyodide compiles the actual CPython interpreter to WebAssembly. This means:

- Complete standard library compatibility
- Identical semantics to desktop Python
- Access to the package ecosystem

But it inherits CPython's threading assumptions. The interpreter runs in a Web Worker (to avoid blocking the main thread), which introduces a coordination problem: **Python execution is isolated from the DOM**.

---

## System Architecture

Our implementation bridges Python's synchronous world with the browser's asynchronous reality through a message-passing protocol between two runtime contexts.

### High-Level Component Diagram

![PNG: Pyodide Turtle Graphics in Browser High-Level Component Diagram](https://i.imgur.com/owzeHTB.png)

### Component Responsibilities

**turtle_shim.py (Web Worker)**

A near complete reimplementation of Python's turtle API i.e 1,400+ lines covering the turtle module interface. Each method:

1. Updates local state (position, heading, pen properties)
2. Emits a command message to the main thread
3. Optionally blocks to wait for animation timing or event polling

The shim tracks *all* turtle state locally. This is critical for correctness: operations like position(), heading(), and distance() return immediately from local state without round-tripping to the renderer.

**TurtleCanvas.tsx (Main Thread)**

A React component that:

1. Receives command messages from the Worker
2. Maintains rendering state (active turtles, ink history, stamps)
3. Draws to hidden back buffers
4. Swaps buffers to the display canvas on `UPDATE` commands
5. Captures user input events
6. Queues events for Python to poll

**Service Worker**

A browser Service Worker provides the event queue infrastructure:

1. Intercepts special fetch URLs (`/_turtle_events`, `/_turtle_push_event`)
2. Maintains an in-memory event queue
3. Returns queued events when polled, then clears the queue
4. Holds long-poll connections for blocking input() support

---

## The Command Protocol

Communication between Python and the renderer uses a JSON message protocol. Understanding this protocol illuminates how the system maintains correctness.

### Message Structure

Every message follows the envelope format:

```
{
  type: "TURTLE_CMD",
  payload: {
    cmd: "COMMAND_NAME",
    id: <turtle_id>,
    ...command-specific fields
  }
}
```

The `id` field identifies which turtle the command affects. This enables multiple independent turtles.

### Command Categories

**Initialization Commands**

| Command  | Purpose                                          |
| -------- | ------------------------------------------------ |
| `INIT`   | Reset canvas, set dimensions, clear all state    |
| `SETUP`  | Resize canvas dimensions                         |
| `CREATE` | Instantiate a new turtle with initial properties |

**Motion Commands**

| Command  | Fields                                             | Notes                      |
| -------- | -------------------------------------------------- | -------------------------- |
| `MOVE`   | `x, y, pen_down, color, width`                     | Draws line if pen is down  |
| `ROTATE` | `heading`                                          | Updates turtle orientation |
| `CIRCLE` | `radius, extent, steps, color, filling, fillcolor` | Arc or full circle         |

**State Commands**

| Command                   | Purpose                                |
| ------------------------- | -------------------------------------- |
| `PEN_UPDATE`              | Change pen color, fill color, or width |
| `UPDATE_TURTLE`           | Change shape, stretch factors, speed   |
| `SHOW` / `HIDE`           | Toggle turtle visibility               |
| `BEGIN_FILL` / `END_FILL` | Polygon fill boundary markers          |

**Rendering Control**

| Command           | Purpose                                               |
| ----------------- | ----------------------------------------------------- |
| `UPDATE`          | Swap back buffer to display (the "present" operation) |
| `SET_AUTO_UPDATE` | Enable/disable automatic buffer swaps                 |
| `CLEAR`           | Clear a specific turtle's drawings                    |
| `CLEAR_SCREEN`    | Reset entire canvas                                   |

### State Synchronization Strategy

A critical design decision: **Python owns the authoritative state; TypeScript owns the rendered representation.**

When you call `t.forward(100)`:

1. Python calculates the new position using its local `(x, y)` and `heading`
2. Python updates its internal state
3. Python sends `MOVE` with the new absolute position
4. TypeScript draws a line from the turtle's previous rendered position to the new position
5. TypeScript updates its turtle position record

This means Python never asks "where am I?" over the message channel. All state queries resolve locally. Only state *changes* cross the boundary.

---

## Double-Buffered Rendering Pipeline

Flicker-free animation requires that users never see intermediate rendering states. We achieve this through classic double buffering, adapted for the browser canvas API.

### The Flicker Problem

Consider a typical game loop:

1. Clear the screen
2. Draw 50 game objects
3. Show the result
4. Repeat

With single-buffer rendering, the "clear" operation is immediately visible. Users see a flash of empty canvas before the objects appear. At 60 FPS, this manifests as visual noise or strobing.

### Buffer Architecture

We maintain four canvases:

![PNG: Pyodide Turtle Buffer Architecture](https://i.imgur.com/xuRkwt6.png)

**Background Buffer**: Solid color or image. Rarely changes. Repainted only on bgcolor() or bgpic() calls.

**Ink Buffer**: All pen strokes, fills, dots, and text. Accumulated over time. Cleared only by clear() on individual turtles.

**Sprite Buffer**: Current turtle positions and stamps. Redrawn frequently as turtles move.

### The Swap Operation

When Python calls `screen.update()`:

1. Clear the sprite buffer
2. Redraw all stamps (permanent turtle imprints)
3. Redraw all visible turtles at current positions
4. Clear the display canvas
5. Composite: `display.drawImage(background, 0, 0)`
6. Composite: `display.drawImage(ink, 0, 0)`
7. Composite: `display.drawImage(sprites, 0, 0)`

Steps 4-7 happen in a single JavaScript execution frame. The user sees only the final composited result.

### Drawing History for Persistence

The ink buffer presents a challenge: when clearing a single turtle's drawings (via `t.clear()`), we must preserve other turtles' drawings.

We maintain a **draw history**, a per-turtle record of all primitives (lines, arcs, dots, fills, text) rendered to the ink buffer. On `CLEAR`:

1. Delete the target turtle's history
2. Clear the ink buffer entirely
3. Replay all remaining turtles' histories

This replay operation is invisible because it targets the hidden buffer. Users see only the `UPDATE` result.

---

## Event System Design

Handling keyboard and mouse input in a Worker environment requires solving the blocking problem without freezing the main thread.

### The Sync XHR Pattern

Web Workers cannot receive DOM events directly. Our solution uses synchronous XMLHttpRequest, deprecated for main-thread use but available in Workers,combined with Service Worker interception.

**Event Flow:**

```
1. User presses "W" key
         │
         ▼
2. Main thread keydown handler fires
         │
         ▼
3. Handler calls fetch("/_turtle_push_event", {method: "POST", body: eventData})
         │
         ▼
4. Service Worker intercepts request, pushes to in-memory queue, returns 200
         │
         ▼
5. (Later) Python's _poll_events() issues sync XHR GET to /_turtle_events
         │
         ▼
6. Service Worker returns queue contents as JSON, clears queue
         │
         ▼
7. Python dispatches to registered handlers (screen._key_handlers["w"]())
         │
         ▼
8. Handler executes (e.g., paddle.sety(paddle.ycor() + 20))
```

### Blocking with Non-Blocking Components

The critical insight: **the Worker thread blocks on sync XHR, but the main thread and Service Worker remain responsive.**

During mainloop():

1. Python enters an infinite loop
2. Each iteration: poll events, handle them, sleep briefly
3. The `sleep()` blocks the Worker but that's fine, nothing else runs there
4. The sync XHR to `/_turtle_events` blocks briefly until the SW responds
5. Events captured during the sleep are queued and returned on next poll

The main thread continues: rendering frames, capturing new events, handling Service Worker messages.

### Mouse Event Handling

Mouse events are more complex than keyboard events because they involve geometry.

**Click Detection:**

1. Main thread receives click at canvas coordinates (cx, cy)
2. Convert to turtle world coordinates using current transform
3. Hit-test against visible turtles (check distance to each turtle's position)
4. If hit: include turtle ID in event payload
5. Push to queue with `{type: "click", x: wx, y: wy, id: turtleId}`
6. Python dispatches to turtle's onclick handler or screen's onscreenclick handler

**Drag Support:**

1. Track `mousedown` to set drag target
2. On `mousemove` while button held, emit `{type: "drag", x, y, id: dragTarget}`
3. On `mouseup`, emit `{type: "mouseup", x, y, id}`

This enables ondrag() for interactive manipulation, critical for the 3D rotation example.

### Key Mapping

Browser key names differ from Tkinter's expectations. We maintain a mapping:

| Browser Key  | Turtle Key |
| ------------ | ---------- |
| `ArrowUp`    | `Up`       |
| `ArrowDown`  | `Down`     |
| `ArrowLeft`  | `Left`     |
| `ArrowRight` | `Right`    |
| `Enter`      | `Return`   |
| ` ` (space)  | `space`    |

Python code using onkeypress(handler, "Up") works unchanged.

---

## Coordinate System and Transforms

Turtle graphics use a Cartesian coordinate system centered at the origin. Browser canvases use a top-left origin with Y increasing downward. Correct coordinate transformation is essential.

### Standard Turtle Coordinates

- Origin (0, 0) is canvas center
- Positive X extends right
- Positive Y extends up
- Heading 0° points right (east)
- Angles increase counter-clockwise

### Canvas Coordinates

- Origin (0, 0) is top-left corner
- Positive X extends right
- Positive Y extends down

### Transform Functions

For a canvas of dimensions (width, height):

```
toCanvasX(turtleX) = (width / 2) + turtleX
toCanvasY(turtleY) = (height / 2) - turtleY  // Note: subtraction
```

The inverse:

```
toWorldX(canvasX) = canvasX - (width / 2)
toWorldY(canvasY) = (height / 2) - canvasY
```

### Custom Coordinate Systems

setworldcoordinates(llx, lly, urx, ury) allows users to define arbitrary coordinate systems. We store these bounds and modify the transform:

```
toCanvasX(turtleX) = ((turtleX - llx) / (urx - llx)) * width
toCanvasY(turtleY) = height - ((turtleY - lly) / (ury - lly)) * height
```

This enables educational scenarios like plotting data with meaningful axes.

---

## Animation and Timing Control

Turtle's animation model has two layers: speed() controls individual turtle animation, and tracer() controls screen update frequency.

### Speed Setting

speed(n) where `n` is 0-10:

- speed(0): Instantaneous, no animation
- speed(1): Slowest
- speed(10): Fast (but still animated)

For animated movement:

1. Calculate total distance or rotation
2. Divide into steps based on speed setting
3. For each step: update position, emit command, sleep briefly, poll events
4. The sleep duration is derived from speed: `delay_ms = max(1, 16 - speed)`

**Critical:** Event polling occurs during animation. This means keyboard handlers fire even while the turtle is moving, enabling responsive game controls.

### Tracer Setting

tracer(n) controls automatic screen updates:

- tracer(0): Disable automatic updates; only update() swaps buffers
- tracer(1); Update after every command (default)
- tracer(n) for n > 1: Update every n commands

Game loops use tracer(0) to batch all drawing into a single frame, eliminating flicker and maximizing performance.

When tracer(0) is set:

1. Commands still execute and modify back buffers
2. No automatic swaps occur
3. User explicitly calls update() to present
4. This pattern enables: clear, draw 100 objects, present, as one atomic visual change

---

## Fill Algorithm

Filled shapes require tracking the path the turtle travels between begin_fill() and end_fill().

### Path Tracking

When begin_fill() is called:

1. Python sets `_filling = True` on the turtle
2. Python sends `BEGIN_FILL` command
3. TypeScript initializes a path array for that turtle with the current position

For each subsequent `MOVE`:

1. If filling is active for that turtle, append the new position to the path
2. Draw the line segment as usual

On end_fill():

1. Python sets `_filling = False`
2. Python sends `END_FILL` with the fill color
3. TypeScript closes the path and fills:
   - If path has > 2 points: `ctx.beginPath()`, move/line to each point, `closePath()`, fill(), `stroke()`
4. Clear the path array

### Handling Arcs in Fills

circle() complicates fills because it's not a straight line. We decompose arcs into a series of points along the circumference, adding each to the fill path. The visual result is a smooth filled arc.

---

## Integration with Pyodide Ecosystem

Our turtle implementation leverages Pyodide's broader capabilities.

### Virtual Filesystem

Pyodide provides an in-memory POSIX filesystem. We use this for:

- **Multi-file projects**: Import custom modules from sibling files
- **Asset loading**: bgpic("background.png") loads from virtual FS
- **Saving drawings**: `screen.save("output.png")` writes PNG to virtual FS, triggering UI file explorer update

### Package Support

Through Pyodide's micropip:

- **requests**: HTTP in turtle programs (weather app example), supported natively in recent Pyodide versions
- **Standard library**: `math`, `random`, time, `json` all work as expected

### Input Patching

Pyodide allows patching built-in functions. We replace `builtins.input` with a blocking implementation:

1. Post `INPUT_REQUEST` message to main thread
2. Issue sync XHR to `/_wait_input?id=uuid`
3. Service Worker holds connection open (long-polling)
4. Main thread shows input UI, user types, submit calls `/_submit_input`
5. Service Worker resolves the held request with user's value
6. Sync XHR returns in Worker, input() returns the value

---

## Compatibility Coverage

### Fully Implemented

**Motion:** forward, `fd`, back, `bk`, `backward`, goto, `setpos`, `setposition`, setx, sety, setheading, seth, home, circle, teleport

**Position/Heading:** position, pos, xcor, ycor, heading, towards, distance

**Pen Control:** pendown, pd, down, penup, pu, up, pensize, width, isdown

**Color:** color, pencolor, fillcolor

**Fill:** begin_fill, end_fill, filling

**Drawing:** dot, stamp, clearstamp, clearstamps, write, clear

**Turtle State:** shape, shapesize, `turtlesize`, resizemode, showturtle, st, hideturtle, ht, isvisible

**Speed:** speed

**Screen Control:** bgcolor, bgpic, screensize, setworldcoordinates, tracer, update, delay, listen

**Events:** onkey, onkeypress, onkeyrelease, onclick, onscreenclick, onrelease, ondrag, ontimer

**Control Flow:** mainloop, done, bye, exitonclick

**Input:** textinput, numinput

**Multiple Turtles:** Turtle() class, clone()

**Screen Singleton:** Screen(), getscreen()

**Alias Classes:** `RawTurtle`, `RawPen`, `Pen`


---

## Performance Characteristics

### Message Throughput

For tracer(0) scenarios, we can sustain thousands of commands per second. The limiting factor is typically JavaScript execution time for rendering, not message passing.

### Memory Usage

The draw history consumes memory proportional to total primitives rendered. For typical educational uses (thousands of lines), this is negligible. Long-running generative art might accumulate significant history; clear() releases per-turtle history.

### Rendering Performance

Canvas 2D operations are GPU-accelerated in modern browsers. The three-layer compositing in `swapBuffers()` uses `drawImage()` which is highly optimized.

---

## Packaging and Distribution

We're currently preparing two standalone packages:

### pyodide-turtle (PyPI)

A Python package installable via micropip:

```
await micropip.install('pyodide-turtle')
import pyodide_turtle as turtle
```

Drop-in replacement for the standard turtle module in any Pyodide environment.

### @codescapes/turtle-canvas (npm)

A React component for the rendering side. Developers building their own Pyodide applications can integrate turtle graphics without reimplementing the renderer.

---

## Try Turtle Graphics in Browser

**CodeScapes**: [codescapes.io](https://codescapes.io)  
Create a Python project and start drawing immediately.

---

## Acknowledgments

This project builds on [Pyodide](https://pyodide.org)'s extraordinary work bringing CPython to WebAssembly. Without Pyodide providing a real Python runtime in the browser, bridging to turtle would be impossible.

Thanks to the creators of Pyodide for the invitation to contribute this post.

---

*Aaqid Masoodi*  
*Creator, CodeScapes*  
*MSc Computing and Artificial Intelligence (Dublin City University)*  
*January 2026*