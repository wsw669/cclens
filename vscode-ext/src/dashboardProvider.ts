/**
 * Dashboard view: the cost dashboard webview in the CCLens sidebar.
 *
 * Data is computed by src/costWorker.ts in a worker thread so scanning
 * hundreds of MB of session logs never blocks the editor.
 */
import fs from 'node:fs';
import path from 'node:path';
import {Worker} from 'node:worker_threads';
import * as vscode from 'vscode';
import {buildWebviewHtml} from './webviewHtml.js';
import {loadPricing} from './services/modelPricing.js';
import {getDefaultProjectsDir} from './paths.js';
import type {DashboardPayload, WorkerResult} from './messages.js';

export class DashboardProvider implements vscode.WebviewViewProvider {
	public static readonly viewType = 'cclens.dashboard';

	private view: vscode.WebviewView | undefined;
	private running = false;
	private pending = false;

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
			'dashboard',
		);
		webviewView.webview.onDidReceiveMessage((message: {type?: string}) => {
			if (message?.type === 'refresh') {
				void this.refresh('manual');
			}
		});
		void this.refresh('initial');
	}

	/** Re-run the analysis; coalesces overlapping requests into one rerun. */
	public async refresh(
		_trigger: 'initial' | 'manual' | 'auto' | 'config',
	): Promise<void> {
		if (this.running) {
			this.pending = true;
			return;
		}
		this.running = true;
		this.post({type: 'analyzing'});
		try {
			const payload = await this.analyze();
			this.post({
				type: 'dashboard',
				payload,
				projectsDir: this.projectsDir(),
				analyzedAt: new Date().toISOString(),
			});
		} catch (error) {
			this.post({type: 'error', message: String(error)});
		} finally {
			this.running = false;
			if (this.pending) {
				this.pending = false;
				void this.refresh('auto');
			}
		}
	}

	private projectsDir(): string {
		const configured = vscode.workspace
			.getConfiguration('cclens')
			.get<string>('projectsDir');
		return (configured ?? '').trim() || getDefaultProjectsDir();
	}

	private analyze(): Promise<DashboardPayload> {
		return new Promise<DashboardPayload>((resolve, reject) => {
			const projectsDir = this.projectsDir();
			if (!fs.existsSync(projectsDir)) {
				reject(
					new Error(
						`找不到 Claude Code 会话数据目录：${projectsDir}\n请在设置中配置 cclens.projectsDir`,
					),
				);
				return;
			}
			const config = vscode.workspace.getConfiguration('cclens');
			const worker = new Worker(
				path.join(this.context.extensionPath, 'dist', 'costWorker.js'),
				{
					workerData: {
						projectsDir,
						pricing: loadPricing(),
						monthlyLimit: config.get<number>('monthlyBudget', 100),
						warnRatio: (config.get<number>('warnRatio', 80) ?? 80) / 100,
					},
				},
			);
			let settled = false;
			worker.once('message', (result: WorkerResult) => {
				settled = true;
				if (result.ok) {
					resolve(result.payload);
				} else {
					reject(new Error(result.message));
				}
				void worker.terminate();
			});
			worker.once('error', (error: Error) => {
				if (!settled) reject(error);
			});
			worker.once('exit', code => {
				if (!settled && code !== 0) {
					reject(new Error(`成本分析进程异常退出（code ${code}）`));
				}
			});
		});
	}

	private post(message: unknown): void {
		void this.view?.webview.postMessage(message);
	}
}
