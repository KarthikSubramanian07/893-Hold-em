---
title: "Privacy at 893 Hold'em"
description: "What 893 Hold'em stores and why: no accounts, no cookies, no analytics, a name and seal kept in your own browser, and table state kept on Cloudflare for six hours."
---

# Privacy

893 Hold'em has no accounts, no cookies, no ads, no analytics, and no third-party trackers. This page lists everything the game keeps, where, and for how long.

## In your browser

The game uses your browser's local storage, which never leaves your device unless noted:

- **Your name and seal** (`893.profile`), so you don't retype them. Your name is shown to the people at your table.
- **A random browser id** (`893.pid`), so that if your connection drops you get your own seat back. It is sent to the table server for that reason only.
- **Your stamps and chapters** (`893:matchbook`), the collection shown in the matchbook. Never sent anywhere.
- **Sound and first-visit settings**, such as whether sound is muted and whether you have seen the opening.
- **A practice night in progress** (session storage), so a reload picks up where you were. It is cleared when the night ends or the tab closes.

You can erase all of it at any time by clearing this site's data in your browser settings.

## On the table server

When you join a table, the game's server (a Cloudflare Durable Object) keeps that table's state: the seats, the names and seals players chose, the cards, and the night's progress. A table that nobody has used for six hours is deleted entirely.

## Hosting

The site and the table server run on Cloudflare, which processes standard request information such as IP addresses to deliver and protect the service, under [Cloudflare's privacy policy](https://www.cloudflare.com/privacypolicy/). The server keeps short-lived operational logs for debugging. Fonts and every other asset are served from this site; nothing is loaded from other domains.

## Children, changes, and questions

The game is a card game with a yakuza theme and no real money. It is not directed at children under 13 and does not knowingly collect anything from them. If this page changes, the change is recorded in the public repository's history. Questions are welcome via the [contact page](https://holdem893.pages.dev/contact).
