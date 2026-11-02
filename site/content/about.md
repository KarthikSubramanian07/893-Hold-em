---
title: "About 893 Hold'em"
description: "Who makes 893 Hold'em, why it exists, and how it is built: an open-source co-op poker game made by Karthik Subramanian."
---

# About 893 Hold'em

893 Hold'em is a free, open-source cooperative poker game for 2 to 6 players, played in a web browser. It is made by Karthik Subramanian, an independent developer, and published under the MIT license at [github.com/KarthikSubramanian07/893-Hold-em](https://github.com/KarthikSubramanian07/893-Hold-em).

## The name

Read 8-9-3 as *ya-ku-za*: the worst hand in oicho-kabu, an old Japanese card game, because eight plus nine plus three makes twenty, which scores zero. The yakuza took the name for themselves. Everybody at this table starts with a bad hand; the point is to play it together.

## Why it exists

Most poker pits friends against each other. This one puts them on the same side. The crew can't talk about their cards, so the game is about reading each other's calls: a raise that says "I've got this", a teammate quietly folding a hand they can't carry. It is meant for game nights, remote friends, and anyone who likes poker but would rather win with people than against them.

## How it is made

- The rules engine, the hand evaluator, and the bots are written in Rust and compiled to WebAssembly, so the same code runs on the server and in the browser.
- Each table runs in its own Cloudflare Durable Object. A table is just a link; there are no accounts.
- The bar is drawn with three.js, and every sound is synthesized in the browser, with no recordings.
- The balance between take and heat was tuned by simulating thousands of nights.

There are no ads, no purchases, no analytics, and no tracking. See the [privacy page](https://holdem893.pages.dev/privacy) for exactly what the game stores, and the [contact page](https://holdem893.pages.dev/contact) to reach the maker.
