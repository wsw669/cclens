/**
 * CCLens VS Code extension — Claude Code 成本仪表盘 + 会话摘要浏览。
 */
import * as vscode from 'vscode';
import {DashboardProvider} from './dashboardProvider.js';
import {SummariesProvider} from './summariesProvider.js';
import {getDefaultProjectsDir} from './paths.js';
import {getSummariesDir} from './services/summaryStore.js';

export function activate(context: vscode.ExtensionContext): void {
	const dashboard = new DashboardProvider(context);
	const summaries = new SummariesProvider(context);

	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(DashboardProvider.viewType, dashboard, {
			webviewOptions: {retainContextWhenHidden: true},
		}),
		vscode.window.registerWebviewViewProvider(SummariesProvider.viewType, summaries, {
			webviewOptions: {retainContextWhenHidden: true},
		}),
		vscode.commands.registerCommand('cclens.openDashboard', () => {
			void vscode.commands.executeCommand(`${DashboardProvider.viewType}.focus`);
		}),
		vscode.commands.registerCommand('cclens.refresh', () => {
			void dashboard.refresh('manual');
		}),
	);

	// Auto-refresh: watch session logs (60s debounce) and summaries (5s).
	let sessionWatcher: vscode.FileSystemWatcher | undefined;
	let summaryWatcher: vscode.FileSystemWatcher | undefined;
	let sessionTimer: NodeJS.Timeout | undefined;
	let summaryTimer: NodeJS.Timeout | undefined;

	const setupWatchers = (): void => {
		sessionWatcher?.dispose();
		summaryWatcher?.dispose();
		const config = vscode.workspace.getConfiguration('cclens');
		const projectsDir =
			(config.get<string>('projectsDir') ?? '').trim() || getDefaultProjectsDir();

		sessionWatcher = vscode.workspace.createFileSystemWatcher(
			new vscode.RelativePattern(projectsDir, '**/*.jsonl'),
		);
		const scheduleSessionRefresh = (): void => {
			if (!config.get<boolean>('autoRefresh', true)) return;
			if (sessionTimer) clearTimeout(sessionTimer);
			sessionTimer = setTimeout(() => void dashboard.refresh('auto'), 60_000);
		};
		sessionWatcher.onDidChange(scheduleSessionRefresh);
		sessionWatcher.onDidCreate(scheduleSessionRefresh);
		sessionWatcher.onDidDelete(scheduleSessionRefresh);

		summaryWatcher = vscode.workspace.createFileSystemWatcher(
			new vscode.RelativePattern(getSummariesDir(), '**/*.md'),
		);
		const scheduleSummaryRefresh = (): void => {
			if (summaryTimer) clearTimeout(summaryTimer);
			summaryTimer = setTimeout(() => summaries.refresh(), 5_000);
		};
		summaryWatcher.onDidChange(scheduleSummaryRefresh);
		summaryWatcher.onDidCreate(scheduleSummaryRefresh);
		summaryWatcher.onDidDelete(scheduleSummaryRefresh);
	};
	setupWatchers();

	context.subscriptions.push(
		new vscode.Disposable(() => {
			sessionWatcher?.dispose();
			summaryWatcher?.dispose();
		}),
		vscode.workspace.onDidChangeConfiguration(event => {
			if (event.affectsConfiguration('cclens')) {
				setupWatchers();
				void dashboard.refresh('config');
				summaries.refresh();
			}
		}),
	);
}

export function deactivate(): void {}
