---
title: "Pyodide 314.0 Alpha Release and Packaging Updates"
date: 2026-03-20
draft: false
tags: ["announcement"]
author: ["Gyeongjae Choi", "Hood Chatham", "Agriya Khetarpal"] # multiple authors
showToc: true
TocOpen: false
draft: false
hidemeta: false
comments: false
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

We are pleased to announce that the Pyodide 314.0 release is just around the corner.

There are several updates happening within the Python and Pyodide ecosystem right now. When the stable 314.0 version drops, we will publish a release post detailing all the new features as always. In the meantime, this blog post will focus specifically on what is changing under the hood regarding packaging and versioning.

## PEP 783 is Accepted: What Does It Mean?

The acceptance of [PEP 783: Emscripten packaging](https://peps.python.org/pep-0783/) marks perhaps the most exciting change in the history of the Python-in-the-browser ecosystem. Pyodide maintainers—especially [@hoodmane](https://github.com/hoodmane)—have poured an immense amount of effort into this over a very long time. Achieving this long-standing goal will expand our ecosystem exponentially.

What exactly does this mean? You can now publish Python packages built for Pyodide (or any Python runtime compatible with the PyEmscripten platform defined in PEP 783) directly to PyPI and install them at runtime.

Before this change, the Pyodide maintainers had to maintain, build, and host over 300 packages ourselves. This was a massive burden on our maintainers and a major bottleneck for the community, as every new package required our manual review.

Moving forward, package maintainers can simply build and publish Pyodide wheels to PyPI, just as they do for native wheels on Linux, macOS, or Windows.

We will be providing comprehensive documentation on building packages with our toolchain soon. Until then, please refer to the [existing Pyodide documentation](https://pyodide.org/en/stable/development/building-packages.html) on cross-compiling packages.

## Wasn't the last version 0.29, and now it is 314.0?

Yes, we are updating Pyodide's versioning scheme, and it is aligned with these new packaging standards.

To fully standardize the packaging process under PEP 783, we needed to stabilize the platform compatibility for packages so they don't break with every minor Pyodide release. Therefore, we are transitioning to a Python-version-based versioning scheme. For example, Pyodide 314.x directly corresponds to Python 3.14.

Whenever we make binary-incompatible changes, they will now align strictly with upstream Python updates (typically once a year). This means you are safe to use existing packages built for the same Python version across multiple Pyodide releases. We plan to release a new major Pyodide version annually, in sync with the Python update.

See also: [Pyodide Issue #6084](https://github.com/pyodide/pyodide/issues/6084) for more context.

## What Does This Alpha Release Mean?

We are putting out this alpha release to encourage package maintainers and early adopters to start building and publishing packages against it. Just like a CPython alpha release, we want to give the community time to test, prepare, and upload wheels before the stable version hits.

Unlike CPython alpha releases, this does not mean a complete freeze on feature breaking changes. Pyodide is a fast-growing project, and we will still make necessary adjustments to the API if needed.

However, this alpha release acts as a strict guarantee on ABI stability for packages. We are NOT making any further ABI breaking changes regarding package builds. Any packages you build using this 314.0 alpha release will work seamlessly with any future Pyodide 314.X versions.