[![npm version](https://badge.fury.io/js/wikiparser-node.svg)](https://www.npmjs.com/package/wikiparser-node)
[![CodeQL](https://github.com/bhsd-harry/wikiparser-node/actions/workflows/codeql.yml/badge.svg)](https://github.com/bhsd-harry/wikiparser-node/actions/workflows/codeql.yml)
[![CI](https://github.com/bhsd-harry/wikiparser-node/actions/workflows/node.js.yml/badge.svg)](https://github.com/bhsd-harry/wikiparser-node/actions/workflows/node.js.yml)
[![Codacy Badge](https://app.codacy.com/project/badge/Grade/a2fbe7641031451baca2947ae6d7891f)](https://app.codacy.com/gh/bhsd-harry/wikiparser-node/dashboard)

# Introduction

[WikiParser-Node](https://github.com/bhsd-harry/wikiparser-node) is an offline [Wikitext](https://www.mediawiki.org/wiki/Wikitext) parser developed by Bhsd for the [Node.js](https://nodejs.org/) environment. It can parse almost all wiki syntax and generate an [Abstract Syntax Tree (AST)](https://en.wikipedia.org/wiki/Abstract_syntax_tree) ([Try it online](https://bhsd-harry.github.io/wikiparser-node/#editor)). It also allows for easy querying and modification of the AST, and returns the modified wikitext.

Although WikiParser-Node is not originally designed to convert Wikitext to HTML, it provides a limited capability to do so. [This repository](https://bhsd-harry.github.io/wikiparser-website/) contains a list of example HTML pages rendered using WikiParser-Node.

Parser customization is done in [`src/parser.ts`](./src/parser.ts).
