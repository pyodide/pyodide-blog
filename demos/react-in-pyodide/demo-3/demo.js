async function main() {
    const pyodide = await loadPyodide({
        indexURL: "https://cdn.jsdelivr.net/pyodide/v0.18.1/full/"
    });

    pyodide.runPythonAsync(`
        import js
        import pyodide

        e = js.React.createElement

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
    `);
}
main();
