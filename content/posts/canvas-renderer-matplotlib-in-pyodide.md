---
title: "HTML5 <canvas> based renderer for matplotlib in Pyodide"
date: 2021-12-05T14:20:37+05:30
draft: true
tags: ["announcement"]
author: "Madhur Tandon"
# author: ["Me", "You"] # multiple authors
showToc: true
TocOpen: false
draft: false
hidemeta: false
comments: false
# description: "Desc Text."
# canonicalURL: "https://canonical.url/to/page"
disableHLJS: true # to disable highlightjs
disableShare: false
hideSummary: false
searchHidden: true
ShowReadingTime: true
ShowBreadCrumbs: true
ShowPostNavLinks: true
# cover:
#     image: "<image path/url>" # image path/url
#     alt: "<alt text>" # alt text
#     caption: "<text>" # display caption under cover
#     relative: false # when using page bundles set this to true
#     hidden: true # only hide on current single page
---

Pyodide compiles the Python Scientific Stack to WebAssembly (WASM) using Emscripten and was created by Michael Droettboom at Mozilla to be used within [Iodide](https://github.com/iodide-project/iodide). As of 2021, Pyodide now exists as an independent open source project.

Bringing the scientific stack means adding support for the 5 most essential data science libraries --
[numpy](https://numpy.org/), [pandas](https://pandas.pydata.org/), [matplotlib](https://matplotlib.org/), [scikit-learn](https://scikit-learn.org/), and [scipy](https://scipy.org/)

### **Motivation**

Supporting the above libraries requires packaging all of them, along with their dependencies. Unfortunately, browsers have limited memory, and if packages were to use it all, it would be hard to make some space for datasets.

To make an effort in this direction -- we aimed to reduce the size of the matplotlib library.

The [matplotlib](https://github.com/matplotlib/matplotlib) library has a component known as a renderer -- it's the renderer which defines the logic of how pixels get populated on the screen. The default renderer used by the matplotlib library is the [Agg](http://agg.sourceforge.net/antigrain.com/) renderer, which is a bunch of complicated C++ files. Currently, the version of matplotlib that is shipped with pyodide compiles the Agg renderer into WebAssembly. It’s the Agg renderer that draws the plot and an image of that plot is pasted (by extracting the underlying buffer data) onto the web document inside a canvas.

The Web already has some technologies to render graphics such as the *\<canvas\>* element and WebGL. Writing a new backend renderer based on these would enable us to reduce the size and memory footprint of the final build and possibly use GPU acceleration along with giving us the ability to use locally installed fonts with web fonts. In a Google Summer of Code project for 2019, we experimented with rendering graphics directly from matplotlib using the Canvas API.

### **Implementing the new Renderer**

The matplotlib library has a layered structure ([Scripting Layer, Artist Layer, Backend Layer](https://www.aosabook.org/en/matplotlib.html)) and implementing a new renderer requires tinkering with the Backend layer -- which is the lowest in the stack. 

In essence, it requires us to re-implement some functions that define how primitive stuff is rendered:

- [draw_path](https://github.com/matplotlib/matplotlib/blob/9221a556d9f819b8d4c26f4fc2eca32ca67c3607/lib/matplotlib/backend_bases.py#L166): for drawing lines, curves (both quadratic and bezier), etc.\
             [when *plt.plot()*, or *plt.scatter()* is called, etc.]
- [draw_image](https://github.com/matplotlib/matplotlib/blob/9221a556d9f819b8d4c26f4fc2eca32ca67c3607/lib/matplotlib/backend_bases.py#L457): for rendering images [when *plt.imshow()* is called, etc.]
- [draw_text](https://github.com/matplotlib/matplotlib/blob/9221a556d9f819b8d4c26f4fc2eca32ca67c3607/lib/matplotlib/backend_bases.py#L512): for drawing headings, axis markings, etc. along with mathematical text
- [draw_markers](https://github.com/matplotlib/matplotlib/blob/9221a556d9f819b8d4c26f4fc2eca32ca67c3607/lib/matplotlib/backend_bases.py#L173): for drawing axis ticks\
and others...

In addition to the above, styles and various properties such as *join-style*, *cap-style*, *line-width*, *dashes*, etc also need to be set.

Recall that [Pyodide](https://hacks.mozilla.org/2019/04/pyodide-bringing-the-scientific-python-stack-to-the-browser/) supports seamless data sharing with JavaScript and also gives the user the whole DOM available on the Python side. This essentially enables us to call functions of the *\<canvas\>* element inside a python script -- the one that defines the new backend.

Thus, a simple *plt.plot()* invocation boils down to a *draw_path()* invocation for the backend which further calls the functions of the *\<canvas\>* element (responsible for actual rendering) -- all inside Python!

### **Challenges**

1. **Rendering Text**:

The matplotlib library provides functionality for looking up fonts that it ships with. Unfortunately, these fonts are not accessible to the web browser to draw onto a canvas. We need to provide a way to load custom fonts that the browser can use.
Thus, a simple assignment like the one below doesn’t work. 

```
from js import document
canvas_element = document.getElementById("canvas")
ctx = canvas_element.getContext("2d")
ctx.font = “30px cmr10”
```

The [cmr10](https://github.com/matplotlib/matplotlib/blob/main/lib/matplotlib/mpl-data/fonts/ttf/cmr10.ttf) font is available inside matplotlib’s virtual file system but is not accessible to the browser and thus, the *\<canvas\>* element cannot use it and falls back to using a default placeholder font.

This problem is solved using [Web Fonts](https://developer.mozilla.org/en-US/docs/Web/API/FontFace) which allows us to dynamically load fonts with JavaScript and make it available to the browser. Once the *“correct”* font is loaded, we can request matplotlib to redraw the plot with the correct font. Again, all of this can be done inside Python since Pyodide can interact with browser APIs and other JavaScript libraries at a very fine level.

However, as easy as it sounds, keeping track of when the font is loaded (so as to request a redraw) is not so trivial. The FontFace API is asynchronous and relies on the network -- making things harder due to the following problems:

-  matplotlib can call *draw_text()* multiple times in a single drawing 
    instance -- each of them requesting the *“correct”* font to be loaded. It’s 
    possible that a previous request for dynamically loading the correct 
    font isn’t completed yet (still fetching from the network), and a new 
    request has been made at that time. This creates the problem of
    multiple font loading due to queued and concurrent invocations of the      
    FontFace API and affects performance.

-  Drawing a plot from the matplotlib library leads to calling 
    *“draw_text()”* which leads us to using the FontFace API to dynamically
    load the font which leads us to requesting a redraw which further calls
    *“draw_text()”* and leads us to calling the FontFace API again which
    then requests the redraw again...\
    \
    In short, it’s an infinite loop of\
    `load font →  redraw →  load font →  redraw → ....`

The above problems are similar but have a subtle difference amongst them. The
first problem occurs for a single draw event (due to multiple *“draw_text”*
invocations in that draw event), while the second problem leads to multiple
never-ending redraws.

Fortunately, both of these can be fixed using a global set which keeps track of
what fonts have already been loaded into the browser’s environment. This way, 
we only load fonts that are not present in this set.

![font](https://user-images.githubusercontent.com/20173739/144758203-7b8f4f16-dfd7-44e2-9bae-04811bcedecf.gif)

2. **Rendering Images and Transparent Pixels**:

There are two functions in the *\<canvas\>* element which enable us to render images. 
These are *putImageData()* and *drawImage()*.

Images are essentially represented as multi-dimensional arrays and can be manipulated
by the Numpy library on the Python side. The *\<canvas\>* element however needs the [ImageData](https://developer.mozilla.org/en-US/docs/Web/API/ImageData) object.

Pyodide enables conversion of data types to and fro from JavaScript. Specifically, a
bytes object in Python can be implicitly converted to a [Uint8ClampedArray](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Uint8ClampedArray) in JavaScript which is exactly what we require to create an ImageData object.

Thus, a conversion from Numpy array to a raw bytes representation when interpreted as a Uint8ClampedArray in JavaScript can be used to render the ImageData object.

The functions *putImageData()* and *drawImage()* can now be used. Both have different use-cases, but for our purpose we use them in tandem with something known as an In-memory canvas.

An In-memory canvas is a normal *\<canvas\>* element which is used for off-screen rendering which is about rendering content somewhere, but the screen. That *“somewhere”* means the memory. Thus, we render graphics to the memory.

To achieve this, we create a *\<canvas\>* element, but we do not link it to the DOM and thus its content won’t be visualized onto the screen.

Once we have rendered something to the off-screen canvas, it’s content can be used in another canvas element (which will NOT be off-screen and will be linked to the DOM).

To make this possible — the function [putImageData()](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/putImageData) is used for off-screen rendering. This is used to put an ImageData object into an off-screen canvas. Once that is done, the on-screen canvas can now use the [drawImage()](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/drawImage) function — to copy the contents of the off-screen canvas and render that stuff to the screen.

While the long process of rendering to off-screen and then transferring its data to on-screen using *drawImage()* seems like overkill, it helps us avoid 2 potential issues:

- The function *putImageData()* is not state-aware i.e. the image-data which is pasted doesn’t care about transformations. Thus, even if the canvas is transformed using operations such as rotate(), scale(), translate(), setTransform(). The resulting image would appear the same as if the canvas was not transformed at all.

- The function *putImageData()* doesn’t care what is beneath it. If for some reason, the ImageData object contains some transparent pixels, and the canvas already has a red background, the transparent pixels will replace the red pixels which is not what we usually expect. We usually expect transparent pixels to blend with the background i.e. the pixels remain red at positions where pixels of the incoming ImageData object are transparent. But, this is not what happens, the previous pixels are simply over-written.

### **Results**

With the above major issues fixed, the new backend is ready. Here are some sample plots (taken from the matplotlib gallery) that are rendered using the new canvas based backend.

![results](https://user-images.githubusercontent.com/20173739/144758542-c2a60150-dfb4-467e-96d0-db0403e68ec3.png)

### **How Fast is it?**

Using the Canvas API to draw the plots live introduces a performance penalty. We assume this is due to iterating over all of the points on a curve in Python, since loops in Python are known to be slow. Further, loading dynamic fonts over the network can take some time. However, Rendering Images is as fast as before. Below are the benchmarks for the new Canvas based renderer compared to the default Agg renderer for 5 sample plots in both firefox and chrome.

![metrics](https://user-images.githubusercontent.com/20173739/144758630-4ea4bcc4-c591-4e3a-abc9-306f1022c3b6.png)

In essence, the new renderer is about 2 to 2.5x slower but that’s the price one pays for reducing the size.

### **Potential Optimizations**

To overcome the above slowdown due to the rendering loop in Python, one solution is to rewrite this time-critical piece in JavaScript. This can be possible using the Function construct in JavaScript. The Function construct would essentially allow us to create JavaScript functions inside a python module capable of accepting and working with pythonic arguments.

![snippet](https://user-images.githubusercontent.com/20173739/145672072-ef2f6bd2-7f37-436a-bbac-a324ccecc4cc.png)

The above snippet defines a JavaScript function *_path_helper* which accepts Pythonic arguments and also supports calling of pythonic object’s methods inside it -- *path.iter_segments()*. The work related to this was attempted here: https://github.com/pyodide/pyodide/pull/510

### **Conclusion**

It’s been really gratifying to see all of the cool things that have been created with Pyodide in the short time since its public launch.  However, there’s still lots to do to turn this experimental proof-of-concept into a professional tool for everyday data science work. If you’re interested in helping us build that future, come find us on gitter, github and our mailing list.

---

Huge thanks to Michael Droettboom, Roman Yurchak, Sylvain Corlay and the whole Iodide team (Brendan Colloran, Hamilton Ulmer, William Lachance and others), for making this happen!
