---
title: "Pyodide's error handling system"
date: 2024-04-03T13:35:15+02:00
draft: true
tags: ["internals"]
author: "Hood Chatham"
showToc: true
TocOpen: false
draft: false
hidemeta: false
comments: false
description: "A deep dive into how Pyodide's foreign function interface handles errors"
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

# Pyodide's error handling system

Pyodide has a complex error handling system. We must manage the following:

1. Detect and signal non recoverable errors
2. Convert JavaScript errors into Python errors and vice versa
3. Handle round trip exceptions as gracefully as possible
4. Render uncaught C++ exceptions and Rust panics into helpful fatal errors
5. Handle weird JavaScript and C++ objects thrown as errors

This post is a detailed explanation of the most interesting steps.

## Calls from C into JavaScript

We want to make C APIs that use the normal CPython calling convention but are
implemented via JavaScript. There are two ways that standard Python functions
signal errors:

* If the return type is a pointer, signal an error by returning `NULL` and
  setting the error flag.

* If the return type is an integer, signal an error by returning `-1` and
  setting the error flag.

Emscripten exposes a macro called `EM_JS` to define C functions from JavaScript.
For example, here's a silly way to sum the squares of three numbers:

```C
EM_JS(int, sum_of_squares, (int a, int b, int c), {
    return [a, b, c].map((x) => x*x).reduce((x,y) => x + y);
})
```

To make this handle errors, we wrap the function in a try/catch block, set the
error flag, and return `-1`:
```C
EM_JS(int, sum_of_squares, (int a, int b, int c), {
  try {
    return [a, b, c].map((x) => x*x).reduce((x,y) => x + y);
  } catch (e) {
    setPythonErrorFromJsError(e);
    return -1;
  }
})
```
We want to do this for every single JavaScript function, so we define some
helper macros. We need one macro that returns `-1` to signal an error and a
separate macro that returns `0` (`NULL`) to signal an error.
```C
#define EM_JS_NUM(ret, func_name, args, body...)                               \
  EM_JS(ret, func_name, args, {                                                \
    try    /* intentionally no braces, body already has them */                \
      body /* <== body of func */                                              \
    catch (e) {                                                                \
      setPythonErrorFromJsError(e);                                            \
      return -1;                                                               \
    }                                                                          \
  })
```
This works quite well, but it has one problem: When you use `EM_JS` directly,
the body of the function is not macro expanded but when we use `EM_JS_NUM` it
will be. In most ways this is helpful, but `stdbool.h` includes:
```C
#define true 1
#define false 0
```
and making these replacements breaks some JavaScript code. We need a version of
these macros that works equally well in both C and JavaScript. Since `!!1`
evaluates to `true` in JavaScript and `1` in C, the following definitions work
quite well for this:

```C
#undef true
#undef false

#define true !!1
#define false !!0
```

## Implementing `setPythonErrorFromJsError`

We can call C functions from JavaScript with an extra leading `_`. A simplified
implementation of `setPythonErrorFromJsError`:

```javascript
function setPythonErrorFromJsError(e) {
    // Omitted:
    // First handle weird cases: e not an instance of an Error subclass
    if (e instanceof PythonError) {
      // special handling for the case when it came from Python originally
    }
    // wrap error into a JsProxy (which is a Python object)
    const errPtr = _JsProxy_create(e);
    // Set the error flag
    _set_error(errPtr);
    // Release the refcount we own on the error object
    _Py_DecRef(errPtr);

    // Omitted:
    // Add JavaScript stack frames to Python traceback
}
```
The function `_set_error` is a helper function that sets the Python error flag.
We need to use `Py_TYPE` which is a macro that doesn't work in JavaScript so we
need to call back into C for this:
```C
void set_error(PyObject* err)
{
  PyErr_SetObject((PyObject*)Py_TYPE(err), err);
}
```

## Calls from JavaScript into Python

When we call from JavaScript into C, we use the following pattern:
```js
function pyObjectSize(pyObjPtr) {
  let result;
  try {
    result = _PyObject_Size(pyObjPtr);
  } catch (e) {
    // Bad exit, our runtime state may be corrupted.
    fatal_error(e);
  }
  if (result === -1) {
    // PyObject_Size returns -1 to signal that an error occurred. Convert the error
    // to a JavaScript error and throw it.
    _pythonexc2js();
  }
  return result;
}
```

The `fatal_error` branch is hit because something threw a JavaScript error into
our webassembly code that was not caught by our `EM_JS` error handling. 

## Handling fatal errors

There are a few common possibilities for why we see a fatal error:

1. A `RangeError` due to dereferencing a very large or negative pointer
2. `null function or indirect call signature mismatch` due to calling an invalid
   function pointer or a valid function pointer with the wrong number or types
   of arguments or return values.
3. `longjmp` with no corresponding `setjmp`
4. An uncaught C++ exception
5. A Rust panic that wasn't paired with a `catch_unwind` (PyO3 for instance will
   turn Rust panics into a Python `PanicException`).

In the `fatal_error` function, we try to figure out which case we're in as best
as we can and tell the user as much as possible about the failure so we can
debug. Altogether, this is the most complex error handling function. It is not
possible in every case to reconstruct what happened, but having a high quality
guess can be a life saver.

## Implementing `pythonexc2js` 

In the case of a JavaScript error raised into Python, we use the `JsProxy`
itself act as the Python error object, so that the `JsException` we raise holds
a strong reference to the JavaScript exception. We don't do this when a Python
error is raised into JavaScript because a Python error holds strong references
to frame objects containing all of the locals of all the functions that it
unwound through. If we pass a strong reference to it directly out into
JavaScript, we risk holding all of these variables alive for a long time. Python
itself is careful to avoid reference loops involving exception objects, for
instance it deletes the variable bound to the exception object at the end of the
`except` block.

Instead, we set `sys.last_exc` to point to the current object and we format the
exception into a string and create a new JavaScript error holding this. 

We also give the JavaScript error the pointer to the Python error, but we don't
hold a reference count, and instead treat this as a sort of weak reference. If
the error is not caught in JavaScript and propagates back into Python frames, we
check if the pointer we are holding agrees with the exception found in
`sys.last_exc` and in this case we restore the original exception. If they are
different for some reason, we end up with a double wrapped exception.

Conversely, if an error is thrown from JavaScript into Python and propogates
back out to JavaScript, we always use a double wrapped exception because the
traceback will be much better in this case. JavaScript does not have any
flexible way to inject foreign frames into tracebacks.

Other than the handling of Python errors making a round trip, `pythonexc2js` is
much simpler than `fatal_error` or `setPythonErrorFromJsError` because Python
only allows `BaseException` subclasses to be thrown unlike JavaScript and C++
which let people throw anything.


## How a `JsProxy` of an error inherits from `BaseException`

In order to set the Python error flag to a Python object, the Python object must
inherit from `BaseException` (otherwise Python will raise a
`SystemError("exception is not a BaseException subclass")`).

We dynamically choose the a subclass of `BaseJsProxy` to use for a `JsProxy` by
looking at its attributes. If the object looks like an Error, we want the
corresponding `JsProxy` class to inherit from both `BaseException` and
`BaseJsProxy`. Python allows multiple inheritance, but there is a restriction on
multiple inheritance works for native C classes in order to avoid object layout
conflicts. We define a class in C as follows:

```C
typedef struct
{
  // PyObject_HEAD inserts struct fields for the reference count, the type,
  // possibly other stuff
  PyObject_HEAD 
  char my_c_field;
  // Whatever other fields I need
} MyObject;

static PyTypeObject MyObjectType = {
    .tp_name = "MyObject",
    .tp_basicsize = sizeof(MyObject),
    // other object protocols
};

int
on_module_init() {
    int status = PyType_Ready(&MyObjectType);
    // status is 0 if type is correctly defined, -1 if there is a problem
}
```
If we want to multiply inherit from two classes, Python needs to ensure that
their C fields agree. If the second class used the byte after `PyObject_HEAD`
for a different purpose, then methods from the two classes would overwrite each
others' state. 

To ensure that the C fields have no layout conflicts, Python requires the
following conditions:

1. Every class must have a unique ancestor with the largest `tp_base`. Call this
   ancestor the _solid base_ of the class.
2. To multiply inherit from a list of classes `Base1`, `Base2`, ..., `Basen`
   there must be a class `B` in the list with the property that the solid base
   of `B` is a subclass of the solid base of every class in the list.

We wish to inherit from both `BaseException` and `BaseJsProxy`. The solid base of
`BaseException` is `BaseException`, and the solid base of `JsProxy` is `BaseJsProxy`
but neither `BaseException` nor `BaseJsProxy` is a subclass of the other. So we're
in trouble.

The first problem we need to solve is the actual layout conflicts. We do this by
reserving space for the `BaseException` fields in our struct layout:

```C
struct ExceptionFields
{
  PyObject* args;
  PyObject* notes;
  // ... there are more of them
};

typedef struct
{
  PyObject_HEAD
  union {
    struct ExceptionFields ef;
    // If the object is not an Exception we can use this space for other stuff.
    ...
  } union_fields;
  // shared fields that are needed by every variant
  ...
} BaseJsProxy;
```
Now we want to make sure that we've actually laid out the fields correctly, so
that we get compilation errors rather than segfaults when switching to a new
Python version that has altered the layout. We use `_Static_assert` for this.
We check that we have the correct total size:
```C
_Static_assert(
    sizeof(PyObject) + sizeof(struct ExceptionFields) 
        == sizeof(PyBaseExceptionObject),
    "size conflict between BaseJsProxy and PyExc_BaseException"
);
```
And that each field has the correct offset:
```C
_Static_assert(                                                              
    offsetof(BaseJsProxy, union_fields) + offsetof(struct ExceptionFields, args) 
        == offsetof(PyBaseExceptionObject, args),       
    "layout conflict between BaseJsProxy and PyExc_BaseException");
```
Now we know that our `BaseJsProxy` layout matches the layout of `BaseException` and
it's valid to multiply inherit. However, Python does not know this. In order to
construct the subclass, we lie to Python about the subclasses of `BaseJsProxy`:
```C
// We want our base classes to be BaseJsProxy and Exception
bases = PyTuple_Pack(2, &BaseJsProxyType, PyExc_Exception);
PyObject* save_mro = BaseJsProxyType.tp_mro;
// Tell Python that BaseJsProxy is a subclass of BaseException to convince the
// class layout conflict detection logic to accept it
BaseJsProxyType.tp_mro = PyTuple_Pack(1, PyExc_BaseException);
// create our JsException type
JsExceptionType = PyType_FromSpecWithBases(&spec, bases);
// Put the mro back before anyone notices!
Py_CLEAR(BaseJsProxyType.tp_mro);
BaseJsProxyType.tp_mro = save_mro;
```

## Conclusion

??? What should we say here?
