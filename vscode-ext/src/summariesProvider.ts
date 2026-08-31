/**
 * Summaries view: browse session summaries persisted by the CCLens CLI.
 * Reading is synchronous and cheap, so no worker is needed here.
 */
import * as vscode from 'vscode';
import {buildWebviewHtml} from './webviewHtml.js';
import {getSummariesDir, listSummaries} from './services/summaryStore.js';

export class SummariesProvider implements vscode.WebviewViewProvider {
	public static readonly viewType = 'cclens.summaries';

	private view: vscode.WebviewView | undefined;

	constructor(private readonly context: vscode.ExtensionContext) {}

	public resolveWebviewView(webviewView: vscode.WebviewView): void {
		this.view = webviewView;
		webviewView.webview.options = {
			enableScripts: true,
			localResourceRoots: [
				vscode.Uri.joinPath(this.context.extensionUri, 'media'),
			],
		};
		webviewView.webview.html = buildWebviewHtml(
			webviewView.webview,
			this.context.extensionUri,
			'summaries',
		);
		webviewView.webview.onDidReceiveMessage((message: {type?: string}) => {
			if (message?.type === 'listSummaries') {
				this.sendSummaries();
			} else if (message?.type === 'openSummariesDir') {
				void vscode.env.openExternal(vscode.Uri.file(getSummariesDir()));
			}
		});
		this.sendSummaries();
	}

	public refresh(): void {
		if (this.view) {
			this.sendSummaries();
		}
	}

	private sendSummaries(): void {
		this.view?.webview.postMessage({
			type: 'summaries',
			items: listSummaries(),
			dir: getSummariesDir(),
		});
	}
}
