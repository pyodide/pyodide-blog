# Pyodide blog

The contents of the Pyodide blog

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
change all `hugo` commands by `./hugo`. Otherwise if you are on a different OS,
you would need to [install
Hugo](https://gohugo.io/getting-started/installing/).

## Contributing

We accept guest post for interesting Pyodide use cases.

If you would like to propose a post,
 - please open an issue with a brief description.
 - Once the general post idea is approved, run,
   ```
   hugo new posts/<post-url>.md
   ```
   and open a PR with the contents of your post in markdown in that file.

Proposals from existing Pyodide contributors will be given preference.

## License

The source code for confuguration files is distributed under MPL 2.0 license.
The blog post contents are shared under the [CC
BY](https://creativecommons.org/licenses/by/4.0/) license. In particular, if
you republish an adapted version of the content on other websites you must
credit the original source by linking to it.
