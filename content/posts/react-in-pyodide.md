---
title: "React in Pyodide"
date: 2021-12-13T16:34:44-05:00
draft: true
tags: ["announcement"]
author: "Xing Han Lu"
# author: ["Me", "You"] # multiple authors
showToc: true
TocOpen: false
draft: false
hidemeta: false
comments: false
description: "Desc Text."
# canonicalURL: "https://canonical.url/to/page"
disableHLJS: true # to disable highlightjs
disableShare: false
hideSummary: false
searchHidden: true
ShowReadingTime: true
ShowBreadCrumbs: true
ShowPostNavLinks: true
cover:
    image: "<image path/url>" # image path/url
    alt: "<alt text>" # alt text
    caption: "<text>" # display caption under cover
    relative: false # when using page bundles set this to true
    hidden: true # only hide on current single page
---

From web server to end-to-end Data pipelines, Python has become an ubiquitous tool for building all sorts of programs and software. With powerful built-in libraries and an incredible number of third-party libraries, the Python ecosystem makes it easy to quickly get your project started. In fact, building user interfaces (UIs) is not an exception: [PyQT](https://pypi.org/project/PyQt5/) allows you to create cross-platform desktop applications, whereas libraries like [Dash](https://github.com/plotly/dash) allows you to create full-fledged web applications (including the UI) within a single Python script. 

In parallel, the popularity of the JavaScript language for building web UIs resulted in the creation of specialized frameworks like [React](https://reactjs.org/) and [Vue.js](https://vuejs.org/), as well as many associated component libraries like [React Bootstrap](https://react-bootstrap.github.io/) and [MUI](https://mui.com/) (formerly known as React Material-UI) to facilitate the creation of consistent and complex UIs for browsers. Moreover, if you wish to extend of those components or create your own, you would have to use JavaScript, which is a separate language you will need to learn. 

Fortunately, it turns out that Pyodide has many capabilities that makes it possible to directly use React and MUI inside Python, without any JavaScript needed. This is what we will explore in this post.

## Building a React "hello world" example

Let's see how you would build a simple React "hello world" example in Python. You could use [`create-react-app`](https://github.com/facebook/create-react-app) to generate a template app. Then, inside the `App.js` file, you would write something like this:

```jsx
import React from 'react';

const App = (props) => {
    return (
        <div>
            <h1>Hello, world!</h1>
            <p>This is my first React app.</p>
        </div>
    );
};

export App;
```

Notice that although it is JavaScript, it also uses tags similar to HTML (this is called JSX), and exports the component `App` so it will be rendered later. However, if you wanted to avoid using NPM and having to run a node server, it's possible to do everything within HTML (i.e. inside your `index.html` file). First, you would need to import certain libraries in the head (doing so will avoid having to call `import React from 'react'` later):

```html
<head>
    <script src="https://unpkg.com/react@17/umd/react.production.min.js" crossorigin></script>
    <script src="https://unpkg.com/react-dom@17/umd/react-dom.production.min.js" crossorigin></script>
</head>
```

Then, you would add a script in the body where you will create and render your component:
```html
<body>
    <script type="text/javascript">
        // Your JS code goes here
    </script>
</body>
```

If you decide not to use JSX, you can instead use `React.createElement` (we will assign it to a shorthand variable `e`). Furthermore, you will also need to handle the rendering with `ReactDOM.render`. Here's your JS code:

```js
const e = React.createElement;

const App = (props) => {
    return e(
        'div', null,
        e('h1', null, 'Hello World'),
        e('p', null, 'This is my first React app.'),
    );
};

// Create the div to render into.
const domContainer = document.createElement('div');
document.body.appendChild(domContainer);

ReactDOM.render(e(App), domContainer);
```

Putting everything together:

```html
<!DOCTYPE html>
<html>

<head>
    <script src="https://unpkg.com/react@17/umd/react.production.min.js" crossorigin></script>
    <script src="https://unpkg.com/react-dom@17/umd/react-dom.production.min.js" crossorigin></script>
</head>

<body>
    <script type="text/javascript">
        const e = React.createElement;

        const App = (props) => {
            return e(
                'div', null,
                e('h1', null, 'Hello World'),
                e('p', null, 'This is my first React app.'),
            );
        };

        // Create the div to render into.
        const domContainer = document.createElement('div');
        document.body.appendChild(domContainer);

        ReactDOM.render(e(App), domContainer);
    </script>
</body>

</html>
```

> The full demo can be found in `demos/react-in-pyodide/demo-1.html`.

## Rewriting this in Python

Let's now see what this would look like in Python. Let's ignore the JS part for a second; we will use the Pyodide API to proxy the JS call into Python code. If you are not familiar with that, you can check out the [doc page](https://pyodide.org/en/stable/usage/type-conversions.html#proxying-from-javascript-into-python) on the subject. Recall that `js` comes from the Pyodide API and `react` and `react-dom` were imported as `<script>` in HTML. Now, let's see what the Python code would look like:

```python
import js

e = js.React.createElement

def App(props, children):
    return e(
        'div', None,
        e('h1', None, 'Hello World'),
        e('p', None, 'This is my first React app.'),
    )

# Create a div to contain our component
dom_container = js.document.createElement('div')
js.document.body.appendChild(dom_container)

js.ReactDOM.render(e(App, None), dom_container)
```

This is fairly similar to the JS code above, but the big difference is that, since we using Pyodide, it's now possible to use any standard built-in Python library anywhere in the app; we can even use the `pydata` ecosystem (`numpy`, `pandas`, `scikit-learn`, etc.)! 

Of course, we still need to actually load `pyodide.js` from the CDN, and then make the call to our script. The head will need to be updated:

```html
<head>
    <script src="https://unpkg.com/react@17/umd/react.production.min.js" crossorigin></script>
    <script src="https://unpkg.com/react-dom@17/umd/react-dom.production.min.js" crossorigin></script>
    <script src="https://cdn.jsdelivr.net/pyodide/v0.17.0/full/pyodide.js"></script>
</head>
```

and the Javascript will be replaced with this:
```js
async function main() {
    await loadPyodide({
        indexURL: "https://cdn.jsdelivr.net/pyodide/v0.17.0/full/"
    });

    pyodide.runPythonAsync(`
        # Your Python code goes here
    `);
}
main();
```

> The full demo can be found in `demos/react-in-pyodide/demo-2.html`.

# React hooks

