# Pyodide blog

[![Netlify Status](https://api.netlify.com/api/v1/badges/cb74649d-1eb9-4bee-83f1-ae45ae7c4eb7/deploy-status)](https://app.netlify.com/sites/pyodide-blog/deploys)

The contents of the Pyodide blog ([blog.pyodide.org](https://blog.pyodide.org))

## Build locally

To build locally, install Hugo, clone this repository, and update the theme submodule:

```bash
cd pyodide-blog
git submodule update --init --recursive
```
then build the blog with Hugo:

```bash
hugo server -D
```

To install Hugo on you platform, please view the [installation instructions](https://gohugo.io/getting-started/installing/)
for your platform.

## Contributing

We accept guest posts. If you would like to propose a post,
- please open an issue with a brief description.
- Once the general post idea is approved, run:

  ```bash
  hugo new content/posts/<post-url>.md
  ```

  and open a PR with the contents of your post in a Markdown file.

Proposals from existing Pyodide contributors will be given preference.

## License

The source code for configuration files is distributed under MPL 2.0 license.
The blog post contents are shared under the [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)
license. In particular, if you aim to republish an adapted version of the
content on other websites, you must credit the original source by linking
to it, which should comply with their license and our license, and other
requirements that apply.
