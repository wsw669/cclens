/**
 * Shared webview shell for the dashboard and summaries panels.
 * All styling lives in media/style.css, all client logic in media/main.js;
 * the shell only differs by panel mode.
 */
import * as vscode from 'vscode';

export function buildWebviewHtml(
	webview: vscode.Webview,
	extensionUri: vscode.Uri,
	mode: 'dashboard' | 'summaries',
): string {
	const styleUri = webview.asWebviewUri(
		vscode.Uri.joinPath(extensionUri, 'media', 'style.css'),
	);
	const scriptUri = webview.asWebviewUri(
		vscode.Uri.joinPath(extensionUri, 'media', 'main.js'),
	);
	// Strict CSP: only local resources, no remote scripts.
	const csp = [
		"default-src 'none'",
		`img-src ${webview.cspSource} https:`,
		`style-src ${webview.cspSource} 'unsafe-inline'`,
		`script-src ${webview.cspSource}`,
	].join('; ');

	const viewTitle = mode === 'dashboard' ? '成本仪表盘' : '会话摘要';

	return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="stylesheet" href="${styleUri}">
<title>CCLens</title>
</head>
<body data-mode="${mode}">
<header class="topbar">
	<div class="brand">
		<svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true">
			<rect x="3.5" y="12.5" width="4" height="8" rx="1.2" fill="currentColor"/>
			<rect x="10" y="6" width="4" height="14.5" rx="1.2" fill="currentColor"/>
			<rect x="16.5" y="9.5" width="4" height="11" rx="1.2" fill="currentColor"/>
		</svg>
		<span>CCLens</span>
	</div>
	<button id="refresh" class="btn" title="刷新">⟳ 刷新</button>
</header>
<div class="view-title">${viewTitle}</div>
<div id="content"></div>
<script src="${scriptUri}"></script>
</body>
</html>`;
}
