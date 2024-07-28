---
title: "Visual Low/No Code Data Preparation and Analysis Web App Built with Pyodide and React"
date: 2024-07-27T01:39:18-04:00
draft: true
tags: ["announcement", "guest post"]
author: "Raul Andrial"
# author: ["Me", "You"] # multiple authors
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
cover:
    # image: "<image path/url>" # image path/url
    # alt: "<alt text>" # alt text
    # caption: "<text>" # display caption under cover
    relative: false # when using page bundles set this to true
    hidden: true # only hide on current single page
---

Hello, my name is [Raul Andrial](https://randr000.github.io/portfolio-resume/tech) and I am a software engineer located in Miami, FL, USA. I created a proof of concept web app with Pyodide that allows users to use the pandas library without needing to code but can use code if they want to. The app uses a drag and drop interface. I also included functionality for plotting with matplotlib and linear regression using scikit-learn.

You can read more about it [here](https://github.com/randr000/react_Pyodide_data_prep).

You can test it out [here](https://randr000.github.io/react_pyodide_data_prep/).

## Pyodide Context Provider

The Pyodide instance is loaded and stored in its own context using React's [Context API](https://react.dev/reference/react/createContext). In order for any component to run Python code it must be a child of the PyodideContextProvider component.

```jsx
import React, { useEffect, useRef, useState } from 'react';
import { loadPyodide } from 'Pyodide/Pyodide.js';

export const PyodideContext = React.createContext(null);

export const PyodideContextProvider = ({children, toLoadPyodide=true}) => {

    const [isPyodideLoaded, setIsPyodideLoaded] = useState(!toLoadPyodide);
    const PyodideRef = useRef(null);

    useEffect(() => {
        toLoadPyodide &&
        (async function () {
            PyodideRef.current = await loadPyodide({
                indexURL : "https://cdn.jsdelivr.net/pyodide/v0.21.3/full/"
            });

            // Load Python packages
            PyodideRef.current.loadPackage(['pandas', 'numpy', 'matplotlib', 'scikit-learn', 'cloudpickle']);
    
            setIsPyodideLoaded(true);
            return PyodideRef.current.runPythonAsync('2 * 3');
            
        })().then(res => res === 6 ? console.log("Pyodide has loaded") : console.log("Something wrong appears to have happended when loading Pyodide"));

    }, [PyodideRef]);
    
    return (
        <PyodideContext.Provider value={{Pyodide: PyodideRef.current, isPyodideLoaded}}>
            {
                isPyodideLoaded ?
                children :
                <div className="d-flex align-items-center justify-content-center" style={{height: "100vh"}}>
                    <p className="text-center fs-1 fw-bold">Pyodide is Loading<span data-testid="Pyodide-loading-spinner" className="spinner-border" role="status"></span></p>
                </div>
            }
            
        </PyodideContext.Provider>
    );
};
```

The custom hook useGetContexts can be used in order to run Python code in any child component of the PyodideContextProvider component.

```jsx
const {Pyodide, isPyodideLoaded} = useGetContexts();
```
-- Pyodide: The current instance of Pyodide.
<br/>
-- isPyodideLoaded: A boolean value that can be used to check if Pyodide has been loaded.

## Defining Python Functions

The way I run the Python code is by defining Python functions within a javascript template literal string. Below is an example of a function that adds two numbers.

```js
const addTwoNums = `

def addTwoNums(x, y):
    return x + y`;

export default addTwoNums;
```
## Running Python Code
In order to run Python code, I import a previously defined function and use the useGetContexts hook to reference the current Pyodide instance. I then call the runPython method to load the Python function and call globals.get to call the Python function. This usually happens within a useEffect hook. Below is an example using the addTwoNums function defined above.

```jsx
import addTwoNums from '../../Python_code_js_modules/addTwoNums';
import useGetContexts from '../../custom-hooks/useGetContexts';

const AddTwoNumsComp = () => {
    const {Pyodide, isPyodideLoaded} = useGetContexts();

    /* Begin component logic */

    // Load Python function
    Pyodide.runPython(addTwoNums);
    // Call Python function
    Pyodide.globals.get('addTwoNums')(2, 3);

    /* End component logic */

    return (
        <>
            /* Render Component */
        </>;
    );
};
```

## Pain Points

- **Lack of documentation for working with React:** React is one of the most popular front-end libaries at the time this artical was written. However, there was very little documentation on how to get Pyodide working with React and very few examples. Also, the [react-py](https://github.com/elilambnz/react-py/issues/67) library does not currently support returning values from the Python scope which is what I needed for this project.

- **Testing:** It was not possible to test individual components using the React Testing Library since Pyodide needed to be loaded.

- **Large Datasets:** The app is really slow with large datasets. Though, this could be because of how I manage the app state and not entirely an issue with Pyodide.

## Pyodide Pros

- **Python in the Browser:** I liked being able to run Python code directly in the browser instead of having to set up a Python backend on a remote server and make API calls.

- **Python Libraries:** Pyodide allowed me to import other Python libraries, such as Pandas and Matplotlib, instead of just using the Python Standard Library.

- **Python and JS Interoperability:** I was able to use either Python or JavaScript when one language would have been a better choice than the other and have them interact mostly seamlessly.

## Pyodide Cons

- **Load Times:** While not terrible, Pyodide does take around 5 seconds to load when the home page is visited.

- **Debugging:** Debugging the Python code, while certainly doable, was not always straighforward.

## Data Components

### Uploading Files

![Upload](upload.gif)

### Downloading Files

![Download](download.gif)
<br/>
![File Download](file-download.gif)

### Filtering Columns

![Filter Columns](filter_columns.gif)

### Filtering Rows

![Filter Rows](filter_rows.gif)

### Merging Data (Join and Union)

![Join](join.gif)

<br/>

![Union](union.gif)

### Custom Python Script

![Script](script-1.gif)

<br/>

![Script Error](script-error.gif)

### Plotting Script (matplotlib)

![Plotting Script 1](plotting-script-1.gif)

<br/>

![Plotting Script 2](plotting-script-2.gif)

<br/>

![Plotting Script Error](plotting-script-error.gif)

### Linear Regression

![Linear Regression](linear-regression.gif)

<br/>
<br/>

Users also have the ability to download the current state of the app and re-upload it at a later time to continue where
they left off.

### Downloading State
![Download State](download-state.gif)

### Uploading State
![Upload Pipeline](upload-pipeline.gif)

<br/>
<br/>

## Conclusion

It was exciting to see the potential of Pyodide while building this app. An app like this can help analysts and domain experts, who may not be proficient in programming, to build data pipelines. Since all the code is run in the browser, they also would not need to worry about installing any software or configuring a Python backend.

-- [Raul Andrial](https://randr000.github.io/portfolio-resume/tech)
