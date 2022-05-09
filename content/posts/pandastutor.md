---
title: "Pandas Tutor: Using Pyodide to Teach Data Science at Scale"
date: 2022-05-06T08:00:00-07:00
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

**UNRELEASED DRAFT -- please release on Saturday, May 14 if possible and
update the `date' yaml header. Thanks!**

<img src="pandastutor-overview.png"/>

Hi, we're [Sam Lau](https://www.samlau.me/) and [Philip
Guo](https://pg.ucsd.edu/), and we teach data science classes at [UC San
Diego](https://ucsd.edu/). In this guest post we'll tell you about our
free educational tool, [Pandas Tutor](https://pandastutor.com/), that
helps students learn data science using the popular [pandas
library](https://pandas.pydata.org/). The above screenshot shows how you
can use it to write Python and pandas code in a web-based editor and see
visualizations of what your code does step-by-step.

After an overview of Pandas Tutor, we'll dive into a case study
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

If you ran this exact same code in our [Pandas
Tutor](https://pandastutor.com/) tool, it will show you exactly what's
going on step-by-step as your code selects, sorts, groups, and
calculates the group medians:

<img src="pandastutor-intro-animated.gif"/>

[Try this example live
here](https://pandastutor.com/vis.html#trace=example-code/py_dogs.json).

Instructors can use Pandas Tutor to aid their teaching, and students can
use it to understand and debug their homework assignments.


## Why did we port Pandas Tutor to Pyodide?

The original version of Pandas Tutor ran the user's code on our Linux
server by spinning up a new Docker container for every request. It main
limitation was slowness -- from the time a user hits the 'Run' button,
it takes up to 5 seconds for the server to run their code, produce a
step-by-step execution trace, and send it over the network to their
browser. And when there's a lot of concurrent users the latency may be
up to 10 seconds, or the server might crash due to too many Docker
containers. This can be a frustrating user experience when an instructor
is lecturing or when hundreds of students are using the tool at the same
time to visualize in-class code examples.

Beyond user experience, this server-based setup was also a pain for us
to maintain since we had to carefully configure our Linux and
Docker setups to handle ever-increasing scale. Remember, we're
university instructors, **not** professional software developers or
DevOps staff! That means we don't have the know-how or institutional
resources required to maintain a production-scale server deployment
setup.

That's why we were thrilled when we discovered
[Pyodide](https://pyodide.org/) since it could help us overcome all
these limitations. Specifically, now that we ported Pandas Tutor over to
use Pyodide:

- Users see their visualizations **instantly** since all their code runs
  in-browser. No more waiting 5-10 seconds for server-side execution and
  network data transfer. A major source of server slowdown was starting
  up a new Python interpreter and loading all dependencies like pandas
  and numpy *every time a user runs a piece of code*. With Pyodide this
  startup happens only once per browser session, not every execution.
- Related to above, zero-latency means we don't even need a 'Run' button
  anymore! Pandas Tutor continually live-runs the user's code as they
  edit so they always see the most up-to-date visualizations.
- We also no longer need to maintain a complex server-side Linux and
  Docker setup. Rather, we can serve the app as a JavaScript bundle on a
  static hosting service or CDN.
- It also becomes easier to secure our server since we're no longer
  running untrusted user-written code on it.
- Finally, Pandas Tutor now scales effortlessly no matter how many
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
original server-based setup, even as first-time Pyodide users. We barely
had to change our code at all.


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
await pyodide.runPythonAsync(`
import micropip
await micropip.install('https://pandastutor.com/build/pandastutor-1.0-py3-none-any.whl')
`);
```

This approach also has the nice side-effect of pinning all the
dependency versions for better API stability. The only dependency we
didn't bundle was pandas because that requires WASM-compiled code. But
fortunately Pyodide comes with pandas
[built-in](https://pyodide.org/en/stable/usage/packages-in-pyodide.html)!


### Step 2: create a new Pyodide entry point

The only modification we had to make to the Pandas Tutor codebase was
adding a new `pyodide_main.py` file as the entry point for Pyodide:

```py
# simplified contents of pandas_tutor/pyodide_main.py
from .main import run_user_code
import js # to interface with pyodide
def run_code_from_js():
    return run_user_code(js.globalUserCode)
```

This entry point uses the `js` module to access JavaScript global
variables. On the JavaScript end of our web frontend code, we created a
corresponding function that takes the user's code to run (`userCode`)
and calls the `run_code_from_js()` Python function:

```js
function runPyodidePandastutor(userCode) {
  window.globalUserCode = userCode; // pass function argument as a global variable
  const result = pyodide.runPython('pandas_tutor.pyodide_main.run_code_from_js()');
  window.globalUserCode = undefined; // null this out afterward to prevent leakage
  return result;
}
```

We couldn't figure out a more elegant way to pass arguments from
JavaScript to Python functions, so we used a `globalUserCode` variable
as a hack that seems to work for now.


### Step 3: import the Pandas Tutor module in JavaScript

Our final setup step was adding a line of code to our frontend
JavaScript to import the Pandas Tutor module:

```js
pyodide.runPython('import pandas_tutor.pyodide_main');
```

This is a synchronous call that imports `pandas_tutor` and all
dependencies when the web app first loads. This line takes 3-5 seconds
to finish since dependencies (including pandas) must be loaded.
Unfortunately, browser caching can't speed things up here since even if
all the files are cached locally, Pyodide still needs to run the import
and initialization code at page load time.

One feature addition that might speed up this process is if Pyodide
could somehow *serialize a binary memory snapshot* taken right after
everything gets initialized. Then the user's browser can directly load
that snapshot on the first page visit and cache it for future visits.
(But maybe that snapshot would be too big to download efficiently, so
nevermind!)


### Bonus: other fine-tuning and ongoing work

- [Graceful
  degradation](https://developer.mozilla.org/en-US/docs/Glossary/Graceful_degradation):
  To continue supporting older browsers, our code detects if there are
  any problems loading the Pyodide version of Pandas Tutor and, if so,
  automatically reverts back to the original server-side version. Also,
  [loadPyodide](https://pyodide.org/en/stable/usage/api/js-api.html#globalThis.loadPyodide)
  crashes on some older mobile devices (presumably with [limited
  memory](https://github.com/pyodide/pyodide/issues/533)?) and we can't
  seem to catch the exception to recover; so we disable it by default on
  mobile and add a toggle to let the user explicitly enable it. (This is
  also nice since it prevents the page from preemptively downloading
  large amounts of data on users' mobile phone plans.)
- Auto-importer: We want users to be able to import any package when
  writing their code in Pandas Tutor. But Pyodide's
  [loadPackagesFromImports](https://pyodide.org/en/stable/usage/api/js-api.html#pyodide.loadPackagesFromImports)
  works only on packages that come with Pyodide. To give users more
  flexibility, we wrote an auto-importer that automatically calls
  `micropip.install()` whenever the user's code tries to `import` an
  unknown package. These package wheels get downloaded from PyPI
  on-demand and cached in the browser. (Note that this works only if the
  package name on PyPI matches the name in the `import` statement, but
  this is often true.)
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
  (potentially-large) downloads.
- Start-up speed: *[work-in-progress]* Even if all packages are cached,
  it still takes a few seconds to initialize Pandas Tutor at page load
  time. We plan to profile our code and might try using
  [pyc-wheel](https://pypi.org/project/pyc-wheel/) to compile `*.py` in
  our wheel into `*.pyc` files.


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
Learning Data Science* by Xiong Zhang and Philip Guo: [download
PDF](https://pg.ucsd.edu/publications/DSjs-turn-any-webpage-into-data-science-IDE_UIST-2017.pdf))

Next, we can take this idea even further ... wouldn't it be cool if the
official [pandas API
docs](https://pandas.pydata.org/docs/reference/index.html) were
runnable? With this bookmarklet, we can inject Pandas Tutor + Pyodide
into any API docs to automatically parse its code examples, visualize
them, and let students edit that code live to explore different parameter
values:

<img src="pandastutor-api-docs.jpg"/>

We can also do the same with Stack Overflow or other help forum sites
because they often have self-contained code examples that can be
directly visualized:

<img src="pandastutor-stackoverflow.jpg"/>

This is just the beginning of our journey with Pyodide. Stay tuned for
more in the coming months as we use it to build tools to teach data
science at scale!

-- [Sam](https://www.samlau.me/) and [Philip](https://pg.ucsd.edu/)
