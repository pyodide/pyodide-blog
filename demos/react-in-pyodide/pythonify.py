"""
This is an implementation of the pythonify function used in the react-in-pyodide demo.
"""
from functools import partial

import js
import pyodide

def jsobj(**kwargs):
    return js.Object.fromEntries(pyodide.to_js(kwargs))

def __to_camel_case(snake_str):
    components = snake_str.split("_")
    # We capitalize the first letter of each component except the first one
    # with the 'title' method and join them together.
    return components[0] + "".join(x.title() for x in components[1:])


def pythonify(component):
    """
    Makes a react component feel like you are calling a function
    """

    def aux(self, old_args, old_kwargs, *args, **kwargs):
        kwargs = {__to_camel_case(k): v for k, v in kwargs.items()}
        if old_args is None:
            old_args = []
        if old_kwargs is None:
            old_kwargs = {}

        old_args.extend(args)
        old_kwargs.update(kwargs)

        args = old_args
        kwargs = old_kwargs

        rc = js.React.createElement(component, jsobj(**kwargs), *args)
        rc.update = partial(aux.__get__(rc, rc.__class__), args, kwargs)

        return rc

    return partial(aux, component, None, None)
