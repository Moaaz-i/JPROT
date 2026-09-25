"use strict";

const vscode = require("vscode");
const path = require("path");
const { JprotPreviewProvider } = require("./preview");
const {
  findFreePort,
  findCli,
  contentDirFor,
  startServer,
} = require("./jprotServer");
const { contentPathToUrl } = require("./urls");

const VIEW_ID = "jprotPreview";

/** @param {number} ms @returns {(...a: unknown[]) => void} */
function debounce(ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => args[args.length - 1](), ms);
  };
}

/** @param {import("vscode").ExtensionContext} context */
function activate(context) {
  const workspace = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

  /** @type {{ url: string, child: import("child_process").ChildProcess, stopping: boolean, contentDir: string } | undefined} */
  let server;
  const provider = new JprotPreviewProvider();

  const statusBar = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100,
  );
  statusBar.name = "JPROT";
  const hasJprot = Boolean(workspace && findCli(workspace));

  function currentPageUrl() {
    if (!server) return null;
    const editor = vscode.window.activeTextEditor;
    if (editor && editor.document.uri.scheme === "file") {
      try {
        const url = contentPathToUrl(server.contentDir, editor.document.uri.fsPath);
        if (url) return server.url + url;
      } catch {
        /* not a content file */
      }
    }
    return server.url + "/";
  }

  function refreshPreview() {
    if (server) provider.refresh();
  }

  function renderStatus() {
    if (server) {
      statusBar.text = `$(play-circle) JPROT ${server.url.replace(/^https?:\/\//, "")}`;
      statusBar.tooltip = "JPROT dev server is running — click to open the current page in your browser.";
      statusBar.command = "jprot-vscode.openInBrowser";
    } else {
      statusBar.text = "$(circle-slash) JPROT";
      statusBar.tooltip = "JPROT dev server is stopped — click to start it.";
      statusBar.command = "jprot-vscode.startServer";
    }
    if (server || hasJprot) statusBar.show();
    else statusBar.hide();
  }

  async function setServerState(running, url) {
    await vscode.commands.executeCommand("setContext", "jprot.isServerRunning", running);
    if (running) {
      provider.setStatus(url, { running: true });
    } else {
      provider.setStatus("Dev server stopped. Save is still tracked — start it again to preview.", {
        running: false,
        empty: true,
      });
    }
    renderStatus();
  }

  async function startServerCommand() {
    if (server) return;
    if (!workspace) {
      vscode.window.showErrorMessage(
        "JPROT: open a folder first (a JPROT project with a content/ directory).",
      );
      return;
    }
    if (!findCli(workspace)) {
      vscode.window.showErrorMessage(
        "JPROT: jprot is not installed in this workspace. Run `npm install -D jprot`, or open a JPROT repository checkout.",
      );
      return;
    }
    const contentDir = contentDirFor(workspace);
    const port = await findFreePort();
    const config = vscode.workspace.getConfiguration("jprotVscode");
    const prod = config.get("prod", false);

    const result = startServer({
      workspace,
      port,
      prod,
      onReady: async (url) => {
        server = { url, child: result.child, stopping: false, contentDir };
        await setServerState(true, url);
        const page = currentPageUrl();
        if (page) provider.navigate(page);
        vscode.window.setStatusBarMessage(
          `JPROT dev server running at ${url}`,
          4000,
        );
      },
      onExit: async (code) => {
        if (!server || server.stopping) return;
        server = undefined;
        await setServerState(false);
        if (code !== 0) {
          vscode.window.showErrorMessage(
            `JPROT dev server exited unexpectedly (code ${code}).`,
          );
        }
      },
    });

    if (result.error) {
      vscode.window.showErrorMessage(`JPROT: ${result.error}`);
      return;
    }
  }

  async function stopServerCommand() {
    if (!server) return;
    server.stopping = true;
    server.child.kill();
    server = undefined;
    await setServerState(false);
  }

  async function openInBrowserCommand() {
    const page = currentPageUrl() || (server && server.url) || null;
    if (!page) {
      vscode.window.showErrorMessage("JPROT: start the dev server first.");
      return;
    }
    await vscode.env.openExternal(vscode.Uri.parse(page));
  }

  provider.setHandlers({
    onStart: () => startServerCommand(),
    onOpen: () => openInBrowserCommand(),
    onRefresh: () => refreshPreview(),
  });

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(VIEW_ID, provider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("jprot-vscode.startServer", startServerCommand),
    vscode.commands.registerCommand("jprot-vscode.stopServer", stopServerCommand),
    vscode.commands.registerCommand("jprot-vscode.openInBrowser", openInBrowserCommand),
    vscode.commands.registerCommand("jprot-vscode.refreshPreview", refreshPreview),
  );

  const config = vscode.workspace.getConfiguration("jprotVscode");
  const autoRefresh = debounce(400);

  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(() => {
      if (config.get("autoRefresh", true) && server) autoRefresh(refreshPreview);
    }),
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (!editor || editor.document.uri.scheme !== "file" || !server) return;
      const file = editor.document.uri.fsPath;
      if (!editor.document.fileName.endsWith(".md")) return;
      try {
        const pageUrl = contentPathToUrl(server.contentDir, file);
        if (pageUrl) provider.navigate(server.url + pageUrl);
      } catch {
        /* not a content file */
      }
    }),
  );

  context.subscriptions.push(statusBar, provider, {
    dispose: () => {
      if (server) {
        server.stopping = true;
        server.child.kill();
      }
    },
  });

  if (workspace && config.get("autoStart", true)) {
    if (findCli(workspace)) startServerCommand();
  }

  renderStatus();
}

function deactivate() {
  /* server is stopped via the disposable above */
}

module.exports = { activate, deactivate };