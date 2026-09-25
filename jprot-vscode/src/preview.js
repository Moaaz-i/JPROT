"use strict";

const vscode = require("vscode");

/**
 * Side-by-side live preview. A webview view embeds the JPROT dev server in an
 * <iframe> (frame-src is restricted to localhost in the CSP). The page inside
 * the iframe keeps its own origin, so the webview talks to it only by
 * re-navigating the iframe — no script injection into the site itself.
 */
class JprotPreviewProvider {
  constructor() {
    /** @type {vscode.WebviewView | undefined} */
    this._view = undefined;
    /** @type {string} */
    this._currentUrl = "";
    /** @type {{ onStart: () => void, onOpen: () => void, onRefresh: () => void }} */
    this._handlers = { onStart() {}, onOpen() {}, onRefresh() {} };
  }

  setHandlers(handlers) {
    this._handlers = { ...this._handlers, ...handlers };
  }

  /** @param {vscode.WebviewView} view */
  resolveWebviewView(view) {
    this._view = view;
    view.webview.options = { enableScripts: true, localResourceRoots: [] };
    view.webview.html = this._html();
    view.webview.onDidReceiveMessage((message) => {
      if (message.type === "start") this._handlers.onStart();
      else if (message.type === "open") this._handlers.onOpen();
      else if (message.type === "refresh") this._handlers.onRefresh();
    });
    if (this._currentUrl) this.navigate(this._currentUrl);
  }

  /** Point the preview at a page (or the current page, cache-busted for refresh). */
  navigate(url) {
    this._currentUrl = url;
    if (this._view) {
      this._view.webview.postMessage({ type: "navigate", url });
    }
  }

  refresh() {
    if (!this._currentUrl) return;
    // The server ignores query strings (it routes on pathname), so a timestamp
    // query re-fetches the freshly rendered page without any cross-origin hacks.
    const base = this._currentUrl.split("?")[0];
    this.navigate(`${base}?t=${Date.now()}`);
  }

  setStatus(text, options = {}) {
    if (this._view) {
      this._view.webview.postMessage({ type: "state", text, ...options });
    }
  }

  dispose() {
    this._view = undefined;
  }

  _html() {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data: https:; frame-src http://127.0.0.1:* http://localhost:*;">
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: var(--vscode-font-family); height: 100vh; display: flex; flex-direction: column; overflow: hidden; }
  .toolbar {
    display: flex; align-items: center; gap: 6px;
    padding: 6px 10px; border-bottom: 1px solid var(--vscode-panel-border, rgba(128,128,128,.35));
    background: var(--vscode-editorWidget-background, transparent); flex: 0 0 auto;
  }
  .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--vscode-testing-iconFailed, #f14c4c); flex: none; }
  .dot.running { background: var(--vscode-testing-iconPassed, #2ea043); }
  .url { flex: 1; font-size: 11px; opacity: .85; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .toolbar button {
    border: 1px solid var(--vscode-button-border, transparent); background: var(--vscode-button-secondaryBackground, rgba(128,128,128,.2));
    color: var(--vscode-button-secondaryForeground, inherit); border-radius: 4px; width: 24px; height: 22px;
    cursor: pointer; font-size: 13px; line-height: 1; flex: none;
  }
  .toolbar button:hover { background: var(--vscode-button-secondaryHoverBackground, rgba(128,128,128,.35)); }
  .screen { flex: 1; position: relative; min-height: 0; }
  iframe { width: 100%; height: 100%; border: 0; background: #fff; }
  .empty {
    position: absolute; inset: 0; display: none; flex-direction: column; align-items: center; justify-content: center;
    gap: 10px; text-align: center; padding: 24px; color: var(--vscode-descriptionForeground, #888);
  }
  .empty.visible { display: flex; }
  .empty svg { width: 56px; height: 56px; opacity: .7; }
  .empty h3 { font-weight: 600; color: var(--vscode-foreground, #ddd); font-size: 14px; }
  .empty p { font-size: 12px; line-height: 1.5; max-width: 320px; }
  .empty button.primary {
    margin-top: 6px; padding: 6px 14px; border: 0; border-radius: 5px; cursor: pointer;
    background: var(--vscode-buttonBackground, #0e639c); color: var(--vscode-buttonForeground, #fff); font-size: 12px; font-weight: 600;
  }
  .empty button.primary:hover { background: var(--vscode-buttonHoverBackground, #1177bb); }
</style>
</head>
<body>
  <div class="toolbar">
    <span class="dot" id="dot"></span>
    <span class="url" id="url">JPROT preview</span>
    <button id="refresh" title="Refresh preview">⟳</button>
    <button id="open" title="Open in browser">↗</button>
  </div>
  <div class="screen">
    <div class="empty visible" id="empty">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
        <path d="M9 3H7.5A2.5 2.5 0 0 0 5 5.5v3.2c0 1-.4 1.6-1 1.9v.8c.6.3 1 .9 1 1.9v3.2A2.5 2.5 0 0 0 7.5 19H9"/>
        <path d="M15 3h1.5A2.5 2.5 0 0 1 19 5.5v3.2c0 1 .4 1.6 1 1.9v.8c-.6.3-1 .9-1 1.9v3.2A2.5 2.5 0 0 1 16.5 19H15"/>
        <circle cx="12" cy="12" r="2.2"/>
      </svg>
      <h3>JPROT live preview</h3>
      <p id="empty-text">Start the dev server to render your site side-by-side. Edits are hot — save a Markdown file and the preview re-renders instantly.</p>
      <button class="primary" id="start">Start dev server</button>
    </div>
    <iframe id="frame" hidden title="JPROT preview"></iframe>
  </div>
<script>
  (function () {
    var vscode = acquireVsCodeApi();
    var dot = document.getElementById('dot');
    var urlEl = document.getElementById('url');
    var empty = document.getElementById('empty');
    var frame = document.getElementById('frame');
    var emptyText = document.getElementById('empty-text');

    function post(type) { vscode.postMessage({ type: type }); }
    document.getElementById('start').addEventListener('click', function () { post('start'); });
    document.getElementById('refresh').addEventListener('click', function () { post('refresh'); });
    document.getElementById('open').addEventListener('click', function () { post('open'); });

    window.addEventListener('message', function (event) {
      var msg = event.data;
      if (msg.type === 'navigate') {
        empty.classList.remove('visible');
        frame.hidden = false;
        dot.classList.add('running');
        urlEl.textContent = msg.url;
        frame.src = msg.url;
      } else if (msg.type === 'state') {
        urlEl.textContent = msg.text || urlEl.textContent;
        if (msg.running) dot.classList.add('running');
        else if (msg.running === false) dot.classList.remove('running');
        if (msg.empty) {
          emptyText.textContent = msg.text || emptyText.textContent;
          empty.classList.add('visible');
          frame.hidden = true;
          frame.removeAttribute('src');
        }
      }
    });
    var saved = vscode.getState();
    if (saved && saved.url) frame.src = saved.url;
  })();
</script>
</body>
</html>`;
  }
}

module.exports = { JprotPreviewProvider };