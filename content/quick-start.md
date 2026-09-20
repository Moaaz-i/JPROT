---
title: Quick start
description: Run JPROT and create a working site in about five minutes — no experience needed.
order: 1
nav: Start here
---

**You will learn:** how to turn a plain folder into a real website, how to
preview it in your browser, and how to make your first change.

> [!NOTE]
> **No experience needed.** You do not have to know HTML, CSS, or JavaScript.
> You write normal text files (called **Markdown**) and JPROT turns them into a
> website for you. You will learn what Markdown is below.

## What JPROT does (the big picture)

A website is just a bunch of pages. In JPROT you:

1. **Write pages** as simple text files in the `content/` folder.
2. **Run one command** to open a preview in your browser.
3. When you are happy, **publish** the site so the whole world can see it.

There is no "build" step and nothing to install besides Node.js. Save a file,
refresh your browser, and your change is already there.

## 1. Check you have Node.js

JPROT needs **Node.js 18 or newer**. Open your terminal (the black window where
you type commands) and run:

```bash
node --version
```

If it prints something like `v20.11.1` or `v22.x.x`, you are ready. Anything
starting with `v18` or higher works.

> [!TIP]
> Do not have Node.js? Download the "LTS" version from
> <https://nodejs.org> and install it, then try this step again.
> If `node` is not the recognized here on Windows, try restarting the terminal.

## 2. Create your (empty) site folder

Make a new empty folder — this will be your whole website. Then go inside it:

```bash
mkdir my-site
cd my-site
```

The **`mkdir`** command = "make directory" (create a folder).
The **`cd`** command = "change directory" (go into it).

## 3. Ask JPROT to build a starter site

From inside your empty folder, run:

```bash
npx jprot init --portfolio
```

The `--portfolio` part tells JPROT: "create a portfolio site" (use `--docs` for
a documentation site, or `--resume` for a CV-style site).

What you should see:

```text
✔ Site scaffolded into the current folder.
   Run `jprot` to preview, `jprot new post "My First Post"` to add content.
```

Your folder now contains everything a website needs: a settings file
(`jprot.config.js`), a `content/` folder with a few starter pages, and a
`theme/` folder for styling. You do not need to open any of them yet.

> [!NOTE]
> The word **scaffold** just means "create a ready-made starting point".
> If a file already exists, JPROT never overwrites it, so re-running this
> command is always safe.

## 4. Preview your site

Now start the little preview server:

```bash
npm start
```

Then open your browser and go to: **<http://127.0.0.1:4114>**

You should see a homepage with your name, a tagline, and some sample projects.
Leave this command running while you work — you will stop it later with
`Ctrl+C` (hold `Ctrl` and press `C`).

## 5. Make your first change (this is the fun part)

With the server still running, create a new file in the `content/` folder
called `hello.md`, and copy this into it:

```markdown
---
title: Hello
description: My very first JPROT page.
---

# Hello

This page is alive!
```

1. **Save** the file (`Ctrl+S`).
2. Go back to your browser.
3. Open: **<http://127.0.0.1:4114/hello>**

That is your first page. **No build step, no refresh server, nothing else** —
save, open, done.

> [!TIP]
> The lines between the two `---` at the top are called **frontmatter**.
> They are the page's settings: the `title` appears in the browser tab and in
> menus, and the `description` is shown by search engines. Everything below the
> second `---` is the page's content.

Anything in `content/` becomes a page, and every sub-folder becomes part of the
address. For example:

- `content/about.md` → `/about`
- `content/blog/first-post.md` → `/blog/first-post`

### What if something goes wrong?

| Problem | What to do |
|---|---|
| `Port already in use` | Close the other program, or run `jprot 5000` |
| I can't see my new page | Check you saved the file and typed the URL correctly |
| The page shows a 404 | You probably typed the address wrong — it matches the file path |
| I don't know how to stop the server | Press `Ctrl+C` in the terminal |

## What next?

You now have a working site with one custom page. Good places to go from here:

1. **[Create your first site](getting-started.md)** — understand what all the
   starter files do, and how to add posts, projects, and pages fast.
2. **[Write your first page](content.md)** — learn Markdown, frontmatter,
   headings, links, images, and special "component" blocks.
3. **[Publish your site](deploy.md)** — put it online for free with GitHub
   Pages or any other host.

## Words you'll see a lot (mini glossary)

| Word | What it means |
|---|---|
| **Markdown** | A simple way to write text with formatting (headings, bold, links) using `#` and `*` — instead of HTML |
| **Frontmatter** | The settings block in dashes at the top of a page file |
| **Static site** | A website made of ready-made HTML files — fast, secure, and cheap to host |
| **Export** | Converting your site into a folder of files ready to publish |
| **Watcher** | A feature that notices your file changes and refreshes things for you |
| **Shortcode** | A small reusable block like `:::Quote` you can drop inside a page |
| **Port** | The number in a web address after the colon (`4114`) that finds the local preview |