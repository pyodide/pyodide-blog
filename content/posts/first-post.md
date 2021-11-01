---
title: "First Post"
date: 2021-11-01T09:57:38+01:00
draft: true
tags: ["announcement"]
# author: "Me"
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
#editPost:
#    URL: "https://github.com/<path_to_repo>/content"
#    Text: "Suggest Changes" # edit text
#    appendFilePath: true # to append file path to Edit link
---

The content of the blog post. Some arbitrary content to illustrate the rendering.

## What is Pyodide

Pyodide may be used in any context where you want to run Python inside a web browser.

Pyodide brings the Python 3.9 runtime to the browser via WebAssembly, along with the Python scientific stack including NumPy, Pandas, Matplotlib, SciPy, and scikit-learn. The packages directory lists over 75 packages which are currently available. In addition it's possible to install pure Python wheels from PyPi.

Pyodide provides transparent conversion of objects between JavaScript and Python. When used inside a browser, Python has full access to the Web APIs.

## Complete example

```html
<!DOCTYPE html>
<html>
  <head>
      <script src="https://cdn.jsdelivr.net/pyodide/v0.18.1/full/pyodide.js"></script>
  </head>
  <body>
    Pyodide test page <br>
    Open your browser console to see Pyodide output
    <script type="text/javascript">
      async function main(){
        let pyodide = await loadPyodide({
          indexURL : "https://cdn.jsdelivr.net/pyodide/v0.18.1/full/"
        });
        console.log(pyodide.runPython(`
            import sys
            sys.version
        `));
        console.log(pyodide.runPython("print(1 + 2)"));
      }
      main();
    </script>
  </body>
</html>
```
