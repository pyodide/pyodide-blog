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

This is fairly similar to the JS code above; this is thanks to `pyodide`'s extensive support for JS -> Python proxying. However, the big difference is that, since we are using Pyodide, it's now possible to use any standard built-in Python library anywhere in the app; we can even use the `pydata` ecosystem (`numpy`, `pandas`, `scikit-learn`, etc.)! 

Of course, we still need to actually load `pyodide.js` from the CDN, and then make the call to our script. The head will need to be updated:

```html
<head>
    <script src="https://unpkg.com/react@17/umd/react.production.min.js" crossorigin></script>
    <script src="https://unpkg.com/react-dom@17/umd/react-dom.production.min.js" crossorigin></script>
    <script src="https://cdn.jsdelivr.net/pyodide/v0.18.1/full/pyodide.js"></script>
</head>
```

and the Javascript will be replaced with this:
```js
async function main() {
    await loadPyodide({
        indexURL: "https://cdn.jsdelivr.net/pyodide/v0.18.1/full/"
    });

    pyodide.runPythonAsync(`
        # Your Python code goes here
    `);
}
main();
```

> The full demo can be found in `demos/react-in-pyodide/demo-2.html`.

# Working with React hooks

[React hooks](https://reactjs.org/docs/hooks-overview.html) are a collection of functions bundle with React that makes it easier to make your app more interactive. For example, a `useState` hook lets you create a variable that can be updated inside your app, as shown in this example from the docs:
```jsx
import React, { useState } from 'react';
function Example() {
  // Declare a new state variable, which we'll call "count"  
  const [count, setCount] = useState(0);
  return (
    <div>
      <p>You clicked {count} times</p>
      <button onClick={() => setCount(count + 1)}>
        Click me
      </button>
    </div>
  );
}
```

It's fairly straightforward to do the same thing in Python:

```python
import js
import pyodide

e = js.React.createElement

# helper function
def jsobj(**kwargs):
    return js.Object.fromEntries(pyodide.to_js(kwargs))

def App(props, children):
    count, set_count = js.React.useState(0)

    def handle_click(event):
        set_count(count + 1)

    return e(
        'div', None,
        e('p', None, f"You clicked {count} times"),
        e('button', jsobj(onClick=handle_click), 'Click me'),
    )

# Create a div to contain our component
dom_container = js.document.createElement('div')
js.document.body.appendChild(dom_container)

js.ReactDOM.render(e(App, None), dom_container)
```

> The full demo can be found in `demos/react-in-pyodide/demo-3.html`.

You can see that we are adding a `jsobj` helper function to convert the Python `dict` into a JS `Object`. This is because the second argument to `e` is a JS object representing the `props`, hence the need to convert `dict`s to `Object`s.

Note that `useState` is only one possible hook; there are many more. For a full list, see the [React hooks docs](https://reactjs.org/docs/hooks-reference.html). Note that, since we are calling those hooks through a proxy, it might be possible some capabilities will work out-of-the-box.

## Making components more pythonic

In Python, if you have the following signature:

```python
def func(*args, **kwargs):
    # ...
```

Then `args` and `kwargs` will be used as `list` and `dict` respectively, and you can pass in as many arguments as you want. 

Let's say we have a function `pythonify`, which, when called on a React component, will convert it into a Python function with the following signature:
```python
def MyComponent(*children, **props):
    # ...
```

So you can pass in as many children as you want, and any parameter-argument pairs as props. We'd want the object returned to have a method `update(*children, **props)` to add anything you originally omitted; this will modify the object in place. Finally, it'd be nice if we could use `snake_cases` instead of `camelCases`. Let's rewrite the previous `App` function with this more pythonic approach:

```python
# same imports and helper functions as before


def pythonify(component):
    # implementation omitted
    pass

div = pythonify('div')
p = pythonify('p')
button = pythonify('button')


@pythonify
def App(props, children):
    count, set_count = js.React.useState(0)

    def handle_click(event):
        set_count(count + 1)

    return div(
        p(f"You clicked {count} times"),
        button(on_click=handle_click).update('Click me'),
    )

# Create a div to contain our component
dom_container = js.document.createElement('div')
js.document.body.appendChild(dom_container)

js.ReactDOM.render(App(), dom_container)
```

How `pythonify` is implemented is not as important as the fact it is *possible*, and that you can use it to make your components more pythonic. 

> The implementation used in this post is fairly concise (~50 lines) but is convoluted. You can find it in `demos/react-in-pyodide/pythonify.py`. The full example is at `demos/react-in-pyodide/demo-4.html`.


# Incorporating MUI into Python

Being able to use pure React is nice, but most of the time you will need to use a third-party UI library like MUI. In terms of using it in HTML, all you need is to add a few more `<script>` tags to the head:

```html
<head>
    <meta charset="utf-8" />
    <script src="https://cdn.jsdelivr.net/pyodide/v0.18.0/full/pyodide.js"></script>
    <script src="https://unpkg.com/react@17/umd/react.production.min.js" crossorigin></script>
    <script src="https://unpkg.com/react-dom@17/umd/react-dom.production.min.js" crossorigin></script>
    <script src="https://unpkg.com/@material-ui/core@v4.12.3/umd/material-ui.production.min.js" crossorigin></script>
    <!-- Fonts to support Material Design -->
    <link rel="stylesheet" href="https://fonts.googleapis.com/css?family=Roboto:300,400,500,700&display=swap" />
    <!-- Icons to support Material Design -->
    <link rel="stylesheet" href="https://fonts.googleapis.com/icon?family=Material+Icons" />
</head>
```

With that, you can use MUI inside your Python app. 