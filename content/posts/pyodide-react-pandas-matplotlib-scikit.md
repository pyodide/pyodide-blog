---
title: "Visual Low/No Code Data Preparation and Analysis Web App Built with Pyodide and React"
date: 2024-06-19T01:39:18-04:00
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

You can read more about it [here](https://github.com/randr000/react_pyodide_data_prep).

You can test it out [here](https://randr000.github.io/react_pyodide_data_prep/).

### Implementation Details



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

It was exciting to see the potential of Pyodide while building this app. An app like this can help analysts and domain experts, who may not be proficient in programming, to build data pipelines. Since all the code is run in the browser, they also would not need to worry about installing any software or configuring a python backend.

-- [Raul Andrial](https://randr000.github.io/portfolio-resume/tech)