---
title: "CodeJo. Code in your browser, right now. Powered by Pyodide!"
date: 2026-09-22
tags: ["guest post", "education"]
author: "Lee Harr"
showToc: true
TocOpen: false
draft: false
hidemeta: false
comments: false
description: null
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

# Introduction. What is CodeJo?
- the vision
- the current state
- the near future

---

## the vision

When I first encountered Pyodide --a python interpreter running  entirely inside of a browser window -- I immediately saw the promise and the prospects for making the power of python more readily accessible.

I've been creating software to bring programming -- coding -- to students for more than 25 years, and the biggest obstacle has always been getting things set up for new people to get started. There are languages and libraries to install, environment variables to set, new applications to learn your way around, and all that before you can even try writing a few lines of code and see if it's something that you enjoy.

That was frustrating for me, because I remember when my family got our first computer: An Apple ][. I think we got one game when we got the computer (*Castle Wolfenstein*), but we also got a couple of books on programming in BASIC. There was nothing that needed to be set up or installed, you just turned the computer on and you were programming. It was awesome!

That is the vision for CodeJo. Computers are way more ubiqitous these days -- and way more complicated, and way more capable -- but someone who is just trying to decide if they might enjoy writing some code doesn't need a whole lot of hoops to jump through before they can even getting started.

<img src="https://a.fsdn.com/con/app/proj/codejo/screenshots/CodeJo0-669bc3f8.png" style="width: 70%; margin: auto;"/>

Now they don't need to. They can simply point their browser at [https://codejo.pages.dev/](https://codejo.pages.dev/ "CodeJo") and start programming!

---

## the current state

### Building Blocks
- [pyodide](https://pyodide.org/en/stable/)
- [codemirror 5](https://codemirror.net/5/)
- [jquery terminal](https://terminal.jcubic.pl/)
- browsers (take your pick!)
- [html5 canvas](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/canvas)
- [web audio api](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)
- [fabric js](https://www.fabricjs.com/) (and others!)

CodeJo is built on a strong foundation of free and open source code and open standards. Pyodide was just the final block that made this vision a real possibility.

Codemirror provides the editor block, a huge step up from writing (and numbering!) code line by line in the Apple ][ terminal. Jquery-terminal enables the interactive interpreter area, giving live access to the Python interpreter and the code objects living inside it. And we can't forget the browser itself and the html, css, and ECMAScript standards that make it possible to write code that can run reliably on anyone's computer, no matter what make, model, or operating system.

CodeJo is working now, with several different display canvases available: The Grid Canvas is a programmable array of pixels with a variable grid pitch; The Fabric Canvas wraps the [FabricJS](https://www.fabricjs.com/) Javascript graphics library; The Web Canvas is a more barebones html5 webcanvas interface; and the Document Canvas utilizes html Document objects.

---

## the near future

Although CodeJo is working now, there is still plenty of work to be done. New canvas types could be added; Lessons for beginners and developing coders can be written to take advantage of the democratizing power of the system; Coding challenges could be added to spark users into pushing the bounds of their own skills and of the system itself; and whole new paradigms could be devloped, like server-side components, canvas sharing, async-mode coding, and other advanced features.

The introductory CodeJo experience should always be available: Browse to the website, maybe watch a video or read through a few pages of tutorial or API documentation, and start programming. Beyond that, with the power of the web -- and of Python, using the awesome platform provided by Pyodide -- the possibilities are endless!

---
---

# Challenges Encountered
- interrupting running code
- the speed problem
- race conditions
- code security

---

## interrupting running code

Pyodide provides a mechanism for interrupting long-running code, in much the same manner that pressing Ctrl-C in a terminal running Python will stop code execution with a `KeyboardInterrupt`. There are a few hoops to jump through in order to get the interrupts working -- proper `http` server headers to enable the use of a `SharedArrayBuffer` -- but once it's all set up it does work.

However, the interrupt so enabled is necessary, but not quite sufficient, for a stable and responsive system. CodeJo employs several additional elements to ensure that when the user wants their code to stop running, control is returned to them as quickly as possible.

* **A secondary signal.** The interrupt buffer used to signal the python interpreter is not reliable for use as a signal to any other code. The interpreter stops and immediately resets that buffer. So CodeJo sets TWO buffers, one to signal the python interpreter itself, and one that is used internally by CodeJo and is only reset after control has been returned to the user.

* **Ignore additional output.** Especially if code is doing a lot of output -- either to the console or otherwise -- there may be a large backlog of output that was built up before the interrupt was requested. CodeJo uses the additional, internal, interrupt signal to stop processing program output and return control to the user quickly.

* **Interruptible sleep.** When the interpeter sleeps (using `time.sleep`) it is not interruptible. Long sleeps are unusual, but when they occur (even and especially if by accident -- *"Oh, that's seconds? I thought it was milliseconds!"*) the user still needs to be able to stop the sleep immediately. CodeJo monkey-patches `time.sleep` to break up long sleeps into a series of short sleeps, checking for interrupts continually along the way.

Using these strategies, CodeJo provides the most reactive and interactive Python terminal available on the web.

---

## the speed problem

CodeJo is not fast. Depending on the hardware it's running on, and the specific browser being used, speed ranges anywhere from "Pretty Good" to "All But Unusuable."

On Chrome, and on a fairly modern system, the speed of the system is pretty good. To test the speed on your own setup, see the several speedtests available:

[test-grd speedtest()](https://codejo.pages.dev?load=test-grd&call=speedtest)

[test-grd speedtest2()](https://codejo.pages.dev?load=test-grd&call=speedtest2)

On my main, desktop system, Chrome gets over 21000tps on speedtest() and takes just over 2 seconds for speedtest2()

Using Firefox on the same system, speedtest() gets <15000tps and speedtest2() takes more than 23 seconds.

On my ancient Chromebook, speedtest() only gets about 1100tps and speedtest2() takes almost 30 seconds -- and that's with a screen about half the area of the desktop system!


[test-web speedtest3()](https://codejo.pages.dev?load=test-web&call=speedtest3)

On Chrome I get about 0.3 seconds. On Firefox, it's more than 3 seconds!

On the old Chromebook, more than 5 seconds.


[test-fab speedtest4()](https://codejo.pages.dev?load=test-fab&call=speedtest4)

On Chrome I get just over 5 seconds and on Firefox closer to 8 seconds.

On the old Chromebook, more than 37 seconds.


These speed tests (all except for the original `test-grd speedtest`) test synchronized writing and reading to and from the canvas. (Checking the canvas for which color is currently showing at a particular location, which is probably not the best way to do what you're trying to do!) There is going to be a speed penalty for getting all of that synchronization correct, but in all cases the most expensive part is the canvas read.

Even at the slower speeds (and even at the slowest speed) the system is still usable, it's just much less useful than it is on a more powerful computer. The good news is that computers continue to get faster every year, so CodeJo will continue to get better as people acquire better computers.

There is also room for optimization. On the Grid Canvas, caching is now available so that `canvas.colorat` requests can be answered entirely on the worker side without needing to actually cross over and read the canvas color directly. The result is at least a 2-to-3-times speedup, with even larger gains possible on slower systems.

---

## race conditions

The CodeJo runtime consists of two "sides" working cooperatively. The "main" side handles the normal user interactions -- button clicks and key presses -- while the "worker" side is where Python -- Pyodide -- runs, isolating it from the outside world. The two sides communicate using the standard JavaScript `postMessage` and `onmessage` channels, with the main side sending user code across to the worker side, worker code requesting actions (like drawing to the HTML canvas, creating and manipulating objects that are handled by JavaScript modules, or instantiating elements on the HTML DOM), and the main code completing those requests.

All this together means that careful consideration needs to be used in synchronizing the actions of the two sides. There was a long-standing bug in CodeJo where certain conditions (intermittent and difficult to reproduce!) would cause the system to become unresponsive. It was almost never a data-loss bug -- user code is always saved before anything is actually executed -- but it was annoying having to reload the page, and in a long-running application it could have required re-running code and re-generating output from the beginning.

The bug was caused by a failure of imagination. I was convinced that a certain series of steps (worker-side and main-side) could not possibly occur out of order. They were occurring out of order, throwing an error, and leaving the system in an inconsistent state.

That particular bug has now been squashed (by serializing those actions and ensuring that they occur in the proper order) and similar bugs have been mitigated by striving to leave the system in a known state even after an error has occurred.

---

## code security

I will be 100% open here and admit that this is a mostly unexplored challenge. I believe that as long as the user is only running their own code (and the included example code) there is no issue. Smarter hackers than I will no doubt have different ideas.

Two attack modes are obvious:

* **Code shared by other CodeJo users.** There is currently no direct way to load a user-generated CodeJo project file, but such capability is planned. Even if the only attack vector is *"Copy and paste this code into a new CodeJo project!"* attacks made possible by sharing code need to be examined. Before making it easy to share code, the current system should be examined to find all possible ways that malicious code *could* be run on the system, and the extent to which malicious code could negatively affect a user's system.

* **Code delivered by Content Delivery Network (CDN).** CodeJo has moved as much upstream code usage to CDN as possible. The advantages of upstreaming all that code are clear. We have also seen attacks on upstream networks that could easily (and often undetectably) modify popular libraries used by thousands if not millions of users. *[What is the most popular JS library served by CDN?]* Until now, most attacks have targeted coders by poisoning their local copies of libraries; an attack on the user side could be devastating.

---
---

# And In Conclusion.
- who's writing code?
- what about ai?
- your next os!

---

## who's writing code?

Writing code is like solving an incredible puzzle where the "solution" is "whatever you want to build." When I first started programming, that was what I did with the computer: I wrote code. There were games you could buy, of course, but far more interesting for me was sitting down, typing some lines of text, and seeing what I could make the computer do.

Is that the way that everyone is going to work with computers? Of course not! Most people will continue to use ready-made applications: get on their socials, paint, write, play games, watch and edit video, scroll endless and eternal feeds.

To help enlighten those who may wish to appreciate the possibilities presented by writing code, an accessible system is essential. CodeJo can be that system.

---

## what about ai?

I have a bad feeling that people are going to start telling kids, *"Don't learn to code. AI will do that for you."* But ask yourself: Would you tell your kid, *"Don't learn to read, AI is going to do that;"* or *"Don't learn to play a musical instrument, AI can do it better"*?

Unfortunately, it seems like maybe this sort of thing is already happening: Teachers are using AI to create assignments; Students are using AI to complete the assignments; Teachers are also using AI to grade the assignments. We may as well cut the humans out of the learning loop altogether!

CodeJo is for people who want to learn to code, just because they want to know how computers work. And just like learning foreign languages, and music, and math, and cooking, and crafts, and conversation, and all sorts of other skills are good for developing human minds, learning to write computer code can offer another way of looking at the world. If nothing else, the strict logic imposed by programming digital computers is like playing in a scientific sandbox where propositions can be tested to the very limits of 0 and 1.

In a few years, we'll probably be glad we have at least a few people who still understand, so that we'll have a chance at shutting off all the AIs!

---

## your next os!

Computer operating systems continue to change: from simple switches and lamps; to text commands and text output; to windows, icons, mouse, and pointer; to touchscreens; and even voice interaction. There is a reason why, even 50-plus years on, computer afficionados so often return to text. An operating system that provides a first-class text interface is one that most readily allows users to understand, modify, customize, and eventually build the next "killer app."

Imagine a computer that boots straight into a browser running something like CodeJo. All of the usual applications could be available, but if you were interested in "opening up the box," the code would be right there for you to play with.

Save. Modify. Run. Experiment.

Some code will always be on "the other side," just like there was machine code back in the old Apple ][ days, but that is another puzzle for interested puzzlers to solve. Once you've got python in your system, it's pythons all the way down!

---
---

`EIQIE QXNYV LYAKD TDYYO UVQTG`
