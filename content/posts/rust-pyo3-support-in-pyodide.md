---
title: "Rust/PyO3 Support in Pyodide"
date: 2022-06-23T08:18:44-07:00
author: "Hood Chatham"
# author: ["Me", "You"] # multiple authors
showToc: true
TocOpen: false
draft: false
hidemeta: false
comments: false
description: "Getting the pyca/cryptography package to run in Pyodide"
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


We are happy to announce that the next version of Pyodide will ship with the
newest version of the Cryptography package, including its Rust extension module.
The Cryptography package was one of the first major packages that included a
Rust extension module. Python binary extensions in Rust for new projects have
been gaining popularity lately. The Cryptography package has been one of the
most often requested packages in the Pyodide issue tracker so it is a priority
for us to support it.

See [this talk by the Cryptography
maintainers](https://www.youtube.com/watch?v=z_Eiy2W0APU) for an interesting
discussion of their reasons for using Rust and the problems in the ecosystem
that needed to be fixed before they could use it.

We want to build the Rust extension module for our WebAssembly-based
distribution. Rust has good support for the <code
class="pkg">wasm32-unknown-unknown</code> target and has popular tools like
<code class="pkg">wasm-bindgen</code>. However, <code
class="pkg">wasm32-unknown-unknown</code> uses a custom "wasm ABI" [which is not
compatible with C/C++
code](https://github.com/rustwasm/team/issues/291#issuecomment-644946504l). To
use Rust in a project that also includes C/C++ code we need to use the <code
class="pkg">wasm32-unknown-emscripten</code> target. Unfortunately, the <code
class="pkg">wasm32-unknown-emscripten</code> target does not work all that well,
due to limited development resources and difficulties coordinating between the
Emscripten and Rust projects.


In this blog post I will give a technical description of many of the challenges I
ran into in the process of building Rust extension modules for Pyodide and their solutions.


<style>
.post-content.post-content code {
  font-size: 70%;
}

code.pkg {
  background: white;
  padding: 0px;
  margin: 0px;
}
</style>

### Acknowledgements

Thanks to the Cryptography team for making this necessary and for their
technical advice. Thanks to the <code class="pkg">chrono</code> maintainers and
the Rust team for reviewing and merging patches to improve Emscripten support.
Thanks to the PyO3 team for their help and enthusiasm and for adding Emscripten
tests to their continuous integration. Special thanks to the Emscripten team,
particularly Sam Clegg, for their technical advice, for merging patches, and for
reviewing our changes to the Rust Emscripten target.


## Getting started

We start by using the Pyodide build system to build the Cryptography package.
The build succeeds but the Rust extension is built for the native x64_linux
platform -- attempting to load the wheel fails with the error:
```
Failed to load dynlib _rust.abi3.so. 
We probably just tried to load a linux .so file or something.
```
We instruct Cargo to build for the Emscripten target by setting the
`CARGO_BUILD_TARGET` environment variable to `wasm32-unknown-emscripten`. Of
course, this fails.


## Errors in time crates

The Cryptography package depends on a crate called <code
class="pkg">chrono</code>. The <code class="pkg">chrono</code> crate explicitly
supports <code class="pkg">wasm32-unknown-emscripten</code> but had a small
mistake which caused a compile error on the Emscripten target. This bug in <code
class="pkg">chrono</code> [has been
fixed](https://github.com/chronotope/chrono/pull/593/files#diff-db4000d9e8bf29c6719984245eeefdf7e0a9b4e525f37ac8c5d6a918d4dc3005),
though the fix has not been released. This was the only compile error, once
<code class="pkg">chrono</code> was patched the entire Cryptography package
compiled. Getting it to link and load correctly was much harder.

Later on, we saw the load-time error 
```
bad export type for `_emscripten_get_now`: undefined
```
PyO3 v0.15 depends on the <code class="pkg">instant</code> crate via the <code
class="pkg">parking_lot</code> crate. The <code class="pkg">instant</code> crate
tries to explicitly support Emscripten but it mispells `emscripten_get_now` as
`_emscripten_get_now` which leads to linker errors. We have to patch <code
class="pkg">instant</code> and use a Cargo dependency override. The <code
class="pkg">instant</code> crate does not seem to be maintained anymore so [my
find-and-replace patch](https://github.com/sebcrozet/instant/pull/47) has not
been accepted. Luckily <code class="pkg">parking_lot</code> v0.12 does not use
<code class="pkg">instant</code> anymore. Unfortunately, PyO3 v0.15 has a
version pin on <code class="pkg">parking_lot</code> v0.11 and PyO3 v0.16 dropped
support for Python 3.6 which Cryptography still supports. So Cryptography pins
PyO3 to v0.15 and depends on <code class="pkg">instant</code> and we need a
patch.


## `lib.rmeta` and `--whole-archive`

When attempting to build a dynamic Rust library with Emscripten, we see the
linker error [`error: unknown file type:
lib.rmeta`](https://github.com/rust-lang/rust/issues/80775).

This error occurs because the `--whole-archive` option is present when linking.
According to the GNU linker manual:
```quote
For each archive mentioned on the command line after the --whole-archive option,
include every object file in the archive in the link, rather than searching the
archive for the required object files.  This is normally used to turn an archive
file into a shared library
```
In particular, `--whole-archive` requires every file in the library to be an
object file. [Rust libraries contain an extra metadata file called
`lib.rmeta`](https://rustc-dev-guide.rust-lang.org/backend/libs-and-metadata.html#rlib)
hence the error message.

Emscripten has two ways of generating a dynamic library: 

* `-sSIDE_MODULE=1` exports all symbols by wrapping the linker arguments with
  `--whole-archive`
* `-sSIDE_MODULE=2` exports an explicit list of symbols 

Building with `-sSIDE_MODULE=2` is much better for code size because symbols
that are not exported can be inlined or eliminated as dead code during link-time
optimization. But to use `-sSIDE_MODULE=2` we need to calculate the symbols to
export somehow.

Using `-sSIDE_MODULE=2` solves the `lib.rmeta` error because `--whole-archive`
is not passed to the linker. Conveniently, Rust is good at calculating which
symbols should be exported: public symbols with the `#[no_mangle]` attribute are
exported, other symbols are not. [It automatically passes this information on to
the linker.](https://github.com/rust-lang/rust/blob/master/compiler/rustc_codegen_ssa/src/back/link.rs#L1882).
In the case of a PyO3 module, the only exported symbol is the
`PyInit__my_module` function that Python invokes when loading a native module.

[We are working on linking Python C/C++ extension modules with `-sSIDE_MODULE=2`
too](https://github.com/pyodide/pyodide/pull/2712). To do this we need to
calculate the symbols to export with the Pyodide build system.


## Misencoded object files and LLVM version conflicts

Once the `lib.rmeta` problem was resolved, the second linker error I encountered
was that `compiler_builtins-<...>-cgu1.rcgu.o` had encoding errors. The solution
to this was... I waited a few months, and the error went away.

I believe the problem was that the Emscripten linker uses a different version of
LLVM than the Rust compiler and the object file format was slightly different in
the two LLVM versions. According to this theory, the problem went away because
Rust updated LLVM. We're still using a different LLVM versions to compile and to
link, so we just cross our fingers and hope it won't break.

LLVM version compatibility is one of the biggest concerns for Pyodide's Rust
support. Emscripten uses tip of tree LLVM and Rust uses stable LLVM. If the
object file format is different in these two different versions of LLVM, there
will be trouble. The Emscripten developers recommend picking the version of
Emscripten that uses the latest stable LLVM when linking Rust. This is not ideal
for us because this version of Emscripten is generally quite old and our choice
of Emscripten version is constrained in other ways. In addition, we prefer to
get the bug fixes and improvements from the newest version of Emscripten if we
can. 

Another option would be to use a different version of Emscripten to link Rust
modules than for the rest of our build. However, the LLVM object file format is
more stable than the Emscripten shared library format so this would be worse
than our current approach.

## Unable to find library `-lc-debug`

The next linker error is
```
Unable to find library `-lc-debug`
```
For some reason when Rust tries to link libc into Emscripten dynamic libraries,
Emscripten raises an error. Rust also used to link everything in debug mode even
if compiled with the `--release` flag, hence `-lc-debug`, but [this has been
fixed](https://github.com/rust-lang/rust/pull/97928).

Attempting to link `libc` into an Emscripten dynamic library causes an error.
The dynamic library should use the libc that is linked into the main module. By
generously sprinkling `compiler/rustc_codegen_ssa/src/back/link.rs` with
`println!` statements I determined that `-lc` was added by the function
[`add_upstream_native_libraries`](https://github.com/rust-lang/rust/blob/master/compiler/rustc_codegen_ssa/src/back/link.rs#L2568).
Conveniently the call to `add_upstream_native_libraries` can be turned off by
setting the undocumented linker flag `-Zlink_native_libraries=off`. [Apparently
this flag is also useful for targeting windows
98.](https://seri.tools/blog/compiling-rust-for-legacy-windows/#get-unicows-properly-working)
The author of that article also located it by adding print statements into the
Rust linker.

Hopefully we can add Rust support to build Emscripten dynamic librarires
directly. I have some work in that direction [in this pull request](https://github.com/rust-lang/rust/pull/98358).


## Position independent code and -Zbuild-std

The next linking error we hit is a very large number of errors like:
```
relocation R_WASM_TABLE_INDEX_SLEB cannot be used against symbol `rust_begin_unwind`;
recompile with -fPIC
```

Rust by default uses [`relocation_model=static`](https://doc.rust-lang.org/rustc/codegen-options/index.html#relocation-model) for the Emscripten target, though
[hopefully that will change soon](https://github.com/rust-lang/rust/pull/98149).
We can override this with `RUSTFLAGS=-C relocation-model=pic`, but we run into
problems when we try to link the standard library because it has not been built
as position independent code. With nightly Rust, we can use `-Zbuild-std` to
build a position-independent standard library and link it. For reasons I
completely do not understand, this is not currently necessary for
Cryptography: we don't pass `-Zbuild-std` but it works anyways. Building other
Rust crates as Emscripten dynamic libraries still requires `-Zbuild-std`.
_‾\\\_(ツ)\_/‾_

## Cannot find file `_rust.abi3.so`

After fixing all the preceding linker errors, linking succeeds but
`setuptools-rust` fails to create a wheel because it expects the result to be a
file called `_rust.abi3.so` but it is actually called `_rust.abi3.wasm`. [This
has been fixed in
`setuptools-rust`](https://github.com/PyO3/setuptools-rust/pull/242/files),
though the situation still isn't perfect.

Rust doesn't have a setting to specify the file extension of the final output,
which is unfortunate. The file extension is part of the target spec and can be
located with:
```sh
$ rustc -Z unstable-options --print target-spec-json --target wasm32-unknown-emscripten \
  | jq '.["dll-suffix"]'
".wasm"
```
`setuptools-rust` hard codes the file extension for each target, but ideally it
could ask `rustc` for this information. Using `target-spec-json` to work out the
file extension is not ideal because it is unstable. There is talk about
stabilizing it but [they are considering "add[ing] a header to the output of
`--print target-spec-json` that makes it invalid JSON and warns people not to
depend on the output
format"](https://github.com/rust-lang/rust/issues/38338#issuecomment-1059295493).


## Error handling, 64 bit integers, and dynamic linking
After fixing the file extension confusion, the build system successfully
generates the Cryptography wheel. But when we try to load wheel, the following
error is raised:
```js
TypeError: Cannot read properties of undefined (reading 'call')
    at Object.dynCallLegacy
```
This error is due to a bug in the interaction of Emscripten's support for
C++/Rust error handling, 64 bit integers, and dynamic linking. The problem is
not specific to Rust, it could occur in a C++ library as well.

The WebAssembly virtual machine supports exception handling, but [it was only
implemented in Safari in version 15.2 which came out in December
2021](https://developer.apple.com/documentation/safari-release-notes/safari-15_2-release-notes#WebAssembly).
Emscripten has a hack to support stack unwinding in browsers without WebAssembly
exception handling support. When a C++ error should be thrown, the WebAssembly
code calls a JavaScript function which throws a JavaScript error. Emscripten
routes function calls inside of C++ `try` blocks through a JavaScript
trampoline. This trampoline calls the original WebAssembly function pointer
inside of a JavaScript `try` block. 

This means that all arguments to the function make a round trip through
JavaScript. Everything in WebAssembly is a number, so this should be simple.
However, JavaScript numbers are all 64 bit floats and 64 bit integers cannot be
represented as 64 bit floats. JavaScript has `BigInt` for this, but not all
browsers support `BigInt`. Browsers without `BigInt` cannot directly invoke
WebAssembly functions that take or return 64 bit integers from JavaScript. All
64 bit integer arguments have to be turned into a pair of 32 bit integers by a
"legalizer" trampoline function. On the other side, a WebAssembly `dynCall`
legalizer wrapper is generated that takes a function pointer, converts the
appropriate pairs of 32 bit integers into 64 bit integers, and makes the onwards
call.

These `dynCall` functions are only generated for code in the main WebAssembly
executable, not for code in dynamically linked libraries. If a function called
inside of a C++ `try` block has a different signature from all functions called
in try blocks in the main executable, we see the error above.

It would be possible to generate extra `dynCall` wrappers for dynamic libraries,
either by including them in the dynamic library or by generating them at load
time. However, Emscripten does not currently support this.

Our solution for this is to use `-sWASM_BIGINT` which avoids the need for
`dynCall` legalizer wrappers by using `BigInt`. This also leads to a speed
improvement and a reduction in code size. We don't need to support any browsers
without `BigInt`. However, `-sWASM_BIGINT` requires both `BigInt` and
`BigInt64Array`. Safari has supported `BigInt` since v14 but [it has only
supported `BigInt64Array` since
v15.0](https://developer.apple.com/documentation/safari-release-notes/safari-15-release-notes#JavaScript).
We do not want to drop Safari v14 support yet so we wrote [a polyfill for
`BigInt64Array`](https://github.com/emscripten-core/emscripten/pull/17103/files).


## Conclusion

Getting Rust working with Pyodide has been a lot of work. Our build process is
still hacky, but as more patches are merged into Rust we will be able to remove
our workarounds. The community members who maintain Rust, Emscripten, and PyO3
have been super helpful with this.

We have added Emscripten tests to the PyO3 continuous integration system so we
are hopeful that we are headed towards a sustainable ecosystem. The work we did
is not specific to the Cryptography package so my expectation is that building
the next Rust package will be much easier.

> **About the author**
>
> Hood Chatham is an NSF Postdoctoral fellow in Mathematics at UCLA in the field
> of homotopy theory. He is a maintainer of Pyodide. Coincidentally, he taught a
> mathematical cryptography class in the Spring of 2022.
