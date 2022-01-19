async function main() {
    const pyodide = await loadPyodide({
        indexURL: "https://cdn.jsdelivr.net/pyodide/v0.18.1/full/"
    });

    pyodide.runPythonAsync(`
        import js
        import pyodide

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
    `);
}
main();
