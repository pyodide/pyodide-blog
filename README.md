# Pyodide blog

[![Netlify Status](https://api.netlify.com/api/v1/badges/cb74649d-1eb9-4bee-83f1-ae45ae7c4eb7/deploy-status)](https://app.netlify.com/sites/pyodide-blog/deploys)

The contents of the Pyodide blog ([blog.pyodide.org](https://blog.pyodide.org))

## Build locally

To build locally clone this repository, and update submodules
```
cd pyodide-blog
git submodule update --init --recursive
```
then build the blog with Hugo,
```
hugo server -D
```

Note: the Linux Hugo executable is included in this repo. If you are on Linux,
change all `hugo` commands to `./hugo`. Otherwise if you are on a different OS,
you would need to [install
Hugo](https://gohugo.io/getting-started/installing/).

## Contributing

We accept guest posts. If you would like to propose a post,
 - please open an issue with a brief description.
 - Once the general post idea is approved, run,
   ```
   hugo new content/posts/<post-url>.md
   ```
   and open a PR with the contents of your post in markdown in that file.

Proposals from existing Pyodide contributors will be given preference.

## License

The source code for configuration files is distributed under MPL 2.0 license.
The blog post contents are shared under the [CC
BY](https://creativecommons.org/licenses/by/4.0/) license. In particular, if
you republish an adapted version of the content on other websites you must
credit the original source by linking to it.
