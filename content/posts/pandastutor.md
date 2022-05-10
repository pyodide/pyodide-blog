---
title: "Pandas Tutor: Using Pyodide to Teach Data Science at Scale"
date: 2022-05-10T08:00:00-07:00
summary: "Pandas Tutor is a data science education tool that visualizes how pandas code transforms dataframes. In this guest post we discuss how we ported it to run 100% in-browser with Pyodide."
draft: true
tags: ["announcement", "guest post", "education"]
# author: "Me"
author: ["Sam Lau", "Philip Guo"] # multiple authors
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
---

<img src="pandastutor-overview.png"/>

Hi, we're [Sam Lau](https://www.samlau.me/) and [Philip
Guo](https://pg.ucsd.edu/), and we teach data science classes at [UC San
Diego](https://ucsd.edu/). In this guest post we'll tell you about our
free educational tool, [Pandas Tutor](https://pandastutor.com/), that
helps students learn data science using the popular [pandas
library](https://pandas.pydata.org/). The above screenshot shows how you
can use it to write Python and pandas code in a web-based editor and see
visualizations of what your code does step-by-step.

After giving an overview of Pandas Tutor, we'll dive into a case study
of how we ported it to Pyodide and why we feel that **Pyodide is amazing
for educational use cases** like ours.


## What is Pandas Tutor?

[Pandas](https://pandas.pydata.org/) is now an industry-standard tool
for data science, but as teachers we've seen firsthand how it can be
hard for students to learn due to its [complex
API](https://pandas.pydata.org/docs/reference/index.html). For example,
this code selects, sorts, and groups values from a `dogs` dataset to
produce a summary table. But if you run this code in a Jupyter notebook,
all you see is the end result:

<img src="pandastutor-dogs.png" style="width: 70%;"/>

Wait, what exactly did pandas do to turn the `dogs` dataset into this
output summary table? It's not at all clear from what you see above.

If you ran this same code in our [Pandas
Tutor](https://pandastutor.com/) tool, it will show you what's
going on step-by-step as your code selects, sorts, groups, and
calculates the group medians:

<img src="pandastutor-intro-animated.gif"/>

[Try this example live
here](https://pandastutor.com/vis.html#trace=example-code/py_dogs.json).

Instructors can use Pandas Tutor to aid their teaching, and students can
use it to understand and debug their homework assignments.


## Why did we port Pandas Tutor to Pyodide?

The original version of Pandas Tutor ran the user's code on our Linux
server by spinning up a new Docker container for every code execution request. It main
limitation was slowness -- from the time a user hits the 'Run' button,
it takes up to 5 seconds for the server to run their code, produce a
step-by-step execution trace, and send it over the network to their
browser. When there's a lot of concurrent users the latency may be
up to 10 seconds, or the server might crash due to too many Docker
containers. This can be a frustrating user experience when an instructor
is lecturing or when hundreds of students are using the tool at the same
time to visualize in-class code examples.

Beyond user experience, this server-based setup was also a pain for us
to maintain since we had to carefully configure Linux and
Docker to handle ever-increasing scale. Remember, we're
university instructors, **not** professional software developers or
DevOps staff. That means we don't have the know-how or institutional
resources required to maintain a production-scale server deployment
setup.

That's why we were thrilled when we discovered
[Pyodide](https://pyodide.org/) since it could help us overcome all
these limitations. Specifically, now that we ported Pandas Tutor over to
use Pyodide:

- Users see their visualizations **instantly** since all their code runs
  in-browser (after an initial Pyodide startup time). No more waiting
  5-10 seconds for server-side sandboxed execution and network data
  transfer every time they attempt to run a piece of code.
- Related to above, zero-latency means we don't even need a 'Run' button
  anymore! Pandas Tutor continually live-runs the user's code as they
  edit so that they always see the most up-to-date visualizations.
- We no longer need to maintain a complex server-side Linux and
  Docker setup. Rather, we can serve the app as a JavaScript bundle on a
  static hosting service or CDN.
- It also becomes easier to secure our server since we're no longer
  running untrusted user-written code on it.
- Pandas Tutor now scales effortlessly no matter how many
  concurrent users are on the site ... if there are 500+ students in a
  large lecture hall using it at the same time, no problem! After all,
  everyone is running Python code inside their laptop's browser due to
  the magic of Pyodide. This kind of scale was impossible with our
  server-based setup.

In sum, we feel that Pyodide is tremendously powerful for scalable
educational use cases like ours since it allows anyone with a web
browser to quickly try Python and its huge ecosystem of packages without
any installation or system maintenance.


## How did we port it and what issues did we face?

It was remarkably pleasant to port Pandas Tutor over to Pyodide from our
original server-based setup. With some help from Pyodide core developer
[Roman Yurchak](https://github.com/rth) we found a way to do it without
changing our Pandas Tutor codebase at all.


### Step 1: create a self-contained Pandas Tutor wheel

The recommended way to load custom Python code into Pyodide is [by using
a
wheel](https://pyodide.org/en/stable/usage/loading-custom-python-code.html),
so we first created a wheel to package up the Pandas Tutor backend
code. That was straightforward since it's pure-Python and doesn't
require any WASM code compilation.

However, we ran into our first issue right away: Since Pandas Tutor has
almost a dozen package dependencies, we originally thought we could use
`micropip` to install them all, as the [Pyodide documentation
recommends](https://pyodide.org/en/stable/usage/loading-packages.html).
Unfortunately, some packages couldn't be installed with `micropip` since
they didn't have wheels available on PyPI (e.g.,
`micropip.install('docopt')` doesn't work). Our solution was to bundle
(i.e., inline) all dependencies into a self-contained Pandas
Tutor wheel so that our web frontend code needs only one call to
`micropip` instead of almost a dozen separate calls:

```js
const micropip = pyodide.pyimport("micropip");
await micropip.install("https://pandastutor.com/build/pandastutor-1.0-py3-none-any.whl");
```

This approach also has the nice side-effect of pinning all the
dependency versions for better API stability. The only dependency we
didn't bundle was pandas because that requires WASM-compiled code. But
fortunately Pyodide comes with pandas
[built-in](https://pyodide.org/en/stable/usage/packages-in-pyodide.html)!


### Step 2: import the Pandas Tutor module in JavaScript

We added one line to our frontend JavaScript to import `main.py` from
Pandas Tutor when the page loads (after the wheel gets installed from
Step 1):

```js
const pandastutor_py = pyodide.pyimport("pandas_tutor.main");
```

This is a synchronous call that imports `pandas_tutor` and all
dependencies when the web app first loads, so it takes 3-5 seconds
to finish since pandas and other libraries must be loaded.
Unfortunately, browser caching can't speed things up here since even if
all files were cached locally, Pyodide still needs to run the import
and initialization code.

One feature addition that might speed this up is if Pyodide
could *serialize a binary memory snapshot* taken right after
everything gets initialized. Then the user's browser can directly load
that snapshot on the first page visit and cache it for future visits.
(But maybe that snapshot would be too big to load efficiently.
[Related GitHub
Issues](https://github.com/pyodide/pyodide/issues?q=is%3Aissue+is%3Aopen+sort%3Aupdated-desc+size+label%3A%22size+%26+load+time+optimization%22).)


### Step 3: call Pandas Tutor backend code from JavaScript

Now we can call the Pandas Tutor backend from our frontend JavaScript
with just one line:

```js
// 1) frontend grabs userCode from the user's in-browser code editor
// 2) run the user's code to produce an execution trace ...
      const executionTrace = pandastutor_py.run_user_code(userCode);  
// 3) frontend process executionTrace to produce step-by-step visualizations
```

This line runs the user's code in Pyodide using the Pandas Tutor backend,
which analyzes it to produce an execution trace that the frontend uses
to render step-by-step visualizations. The coolest thing about this line
of code is that it seamlessly calls a Python function directly from JavaScript.

Before we ported to Pyodide, this process involved
an HTTP request to the server, which spun up a new Docker
container, ran the Pandas Tutor backend within there, and transferred
the resulting JSON execution trace over the internet to the user's
browser. There were multiple points of possible failure, and robust
exception handling was a pain to implement. Now everything happens with
a single function call in-browser, and exception handling is just a
JavaScript `try...catch`!


### Bonus: other fine-tuning and ongoing work

- [Graceful
  degradation](https://developer.mozilla.org/en-US/docs/Glossary/Graceful_degradation):
  To continue supporting older browsers, our frontend code detects if there are
  any problems loading the Pyodide version of Pandas Tutor and, if so,
  automatically reverts back to the original server-side version. Also,
  [loadPyodide](https://pyodide.org/en/stable/usage/api/js-api.html#globalThis.loadPyodide)
  crashes on some older mobile devices (presumably due to [limited
  memory](https://github.com/pyodide/pyodide/issues/533)) and we can't
  seem to catch the exception to recover; so we disable it by default on
  mobile and add a toggle to let the user explicitly enable it. (This is
  also considerate since it prevents the page from preemptively downloading
  large amounts of data on users' mobile phone plans.)
- Auto-importer: We want users to be able to import any package when
  writing their code in Pandas Tutor. But Pyodide's
  [loadPackagesFromImports](https://pyodide.org/en/stable/usage/api/js-api.html#pyodide.loadPackagesFromImports)
  works only on packages that come with Pyodide. To give users more
  flexibility, we wrote an auto-importer that automatically calls
  `micropip.install()` whenever the user's code tries to `import` an
  unknown package. These package wheels get downloaded from PyPI
  on-demand and cached in the browser. (Note that this works only if the
  package name on PyPI matches the name in the `import` statement.)
- Preloading: As soon as the user visits the
  [pandastutor.com](https://pandastutor.com/) landing page, it starts
  downloading Pyodide and selected packages (e.g., pandas, numpy) in the
  background. That way, by the time the user goes to the [visualizer
  page](https://pandastutor.com/vis.html), these
  packages may already have been cached in their browser, so they can
  start working right away. (Thanks to Michael Kennedy from the [Talk
  Python
  podcast](https://talkpython.fm/episodes/show/358/understanding-pandas-visually-with-pandastutor)
  for this suggestion!)
- Caching file downloads: *[work-in-progress]* Some pandas code uses
  functions like
  [read_csv](https://pandas.pydata.org/docs/reference/api/pandas.read_csv.html)
  or
  [read_html](https://pandas.pydata.org/docs/reference/api/pandas.read_html.html)
  to download data files from the web. It would be great to cache those
  files locally in-browser so that when the user re-runs that code in
  the future, Pandas Tutor doesn't need to repeat the same
  (potentially-large) downloads. (The browser may already cache
  Pyodide-issued `fetch` requests, but using the
  [Pyodide/Emscripten filesystem
  API](https://pyodide.org/en/latest/usage/file-system.html) may give us
  finer-grained control over file caching.)
- Start-up speed: *[work-in-progress]* Even if all packages are cached,
  it still takes a few seconds to initialize Pandas Tutor at page load
  time. We plan to profile our code and might try using
  [pyc-wheel](https://pypi.org/project/pyc-wheel/) to compile `*.py` in
  our wheel into `*.pyc` files
  ([related GitHub
Issues](https://github.com/pyodide/pyodide/issues?q=is%3Aissue+is%3Aopen+sort%3Aupdated-desc+size+label%3A%22size+%26+load+time+optimization%22)).


## The future: Pandas Tutor + Pyodide everywhere!

Pyodide is really exciting for us since it opens the door to **embedding
Pandas Tutor into any existing website** so that anyone can learn data
science within the context of their favorite websites without installing
anything.

To achieve this, we're building a
[bookmarklet](https://en.wikipedia.org/wiki/Bookmarklet) that injects
Pandas Tutor + Pyodide into **any webpage** to add an inline code editor
that can access its DOM. This will allow students to write Python code
to, say, parse HTML tables using
[BeautifulSoup](https://www.crummy.com/software/BeautifulSoup/), clean
up that raw data, and plot it. Here's a mock-up screenshot of injecting
Pandas Tutor (in the dashed red box) into a Wikipedia page to explore
and plot country populations for a social studies class:

<img src="pandastutor-wiki.png"/>

(This idea originally came from the 2017 research paper, *DS.js: Turn
Any Webpage into an Example-Centric Live Programming Environment for
Learning Data Science*, by Xiong Zhang and Philip Guo. [Download
PDF](https://pg.ucsd.edu/publications/DSjs-turn-any-webpage-into-data-science-IDE_UIST-2017.pdf))

Next, we can take this idea even further ... wouldn't it be cool if the
official [pandas API
docs](https://pandas.pydata.org/docs/reference/index.html) were
runnable? With this bookmarklet, we can inject Pandas Tutor + Pyodide
into any API docs to automatically parse its code examples, visualize
them, and let visitors edit that code live to explore different parameter
values:

<img src="pandastutor-api-docs.jpg"/>

We can also do the same with Stack Overflow or other help forum sites
because they often have self-contained code examples that can be
directly visualized:

<img src="pandastutor-stackoverflow.jpg"/>

That's all for now, but this is just the beginning of our journey with
Pyodide. Stay tuned for more in the coming months as we use it to build
tools to teach data science at scale!

-- [Sam](https://www.samlau.me/) and [Philip](https://pg.ucsd.edu/)
