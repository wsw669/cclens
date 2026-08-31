/* Temporary smoke test: run the bundled cost worker against real data. */
import os from 'node:os';
import path from 'node:path';
import {Worker} from 'node:worker_threads';

const worker = new Worker(path.resolve('dist/costWorker.js'), {
	workerData: {
		projectsDir: path.join(os.homedir(), '.claude', 'projects'),
		pricing: {
			default: {input: 2, output: 8, cacheRead: 0.5, cacheWrite: 2},
			'deepseek-v4-pro': {input: 2, output: 8, cacheRead: 0.5, cacheWrite: 2},
			'deepseek-v4-flash': {input: 0.5, output: 2, cacheRead: 0.1, cacheWrite: 0.5},
			'glm-5.3': {input: 1.5, output: 6, cacheRead: 0.3, cacheWrite: 1.5},
			'glm-5.3-flash': {input: 0.3, output: 1.2, cacheRead: 0.1, cacheWrite: 0.3},
			'claude-sonnet-5': {input: 21, output: 105, cacheRead: 2.1, cacheWrite: 26.25},
		},
		monthlyLimit: 100,
		warnRatio: 0.8,
	},
});

const started = Date.now();
worker.on('message', result => {
	const ms = Date.now() - started;
	if (!result.ok) {
		console.log('FAILED:', result.message);
		process.exit(1);
	}
	const p = result.payload;
	console.log(`analyzed in ${ms}ms`);
	console.log(`monthly=¥${p.monthly.toFixed(2)} total=¥${p.total.toFixed(2)} sessions=${p.sessionCount} messages=${p.parsedMessageCount}`);
	console.log(`budget: spent=¥${p.budget.spent.toFixed(2)} limit=¥${p.budget.limit} ratio=${(p.budget.ratio * 100).toFixed(0)}% level=${p.budget.level}`);
	console.log('models:');
	for (const m of p.byModel.slice(0, 5)) {
		console.log(`  ${m.model}: ¥${m.cost.toFixed(2)} (${m.messageCount} msgs)`);
	}
	console.log('projects:');
	for (const pr of p.byProject.slice(0, 5)) {
		console.log(`  ${pr.project}: ¥${pr.cost.toFixed(2)}`);
	}
	console.log('recent dates:');
	for (const d of p.byDate.slice(-5)) {
		console.log(`  ${d.date}: ¥${d.cost.toFixed(2)}`);
	}
	process.exit(0);
});
worker.on('error', error => {
	console.error('WORKER ERROR:', error);
	process.exit(1);
});
