/**
 * Cost analysis worker: scans Claude Code session logs in a worker thread
 * so a big scan (hundreds of MB) never blocks the extension host and the
 * editor UI.
 */
import {parentPort, workerData} from 'node:worker_threads';
import {analyzeCosts, type CostReport} from './services/costAnalyzer.js';
import type {ModelPricingTable} from './services/modelPricing.js';
import type {
	BudgetStatus,
	DashboardPayload,
	DateSlice,
	ModelSlice,
	ProjectSlice,
	WorkerResult,
} from './messages.js';

interface WorkerInput {
	projectsDir: string;
	pricing: ModelPricingTable;
	monthlyLimit: number;
	warnRatio: number;
}

function serializeReport(report: CostReport): {
	byModel: ModelSlice[];
	byProject: ProjectSlice[];
	byDate: DateSlice[];
} {
	const byModel: ModelSlice[] = [...report.byModel.entries()].map(
		([model, agg]) => ({
			model,
			input: agg.input,
			output: agg.output,
			cacheRead: agg.cacheRead,
			cacheWrite: agg.cacheWrite,
			cost: agg.cost,
			messageCount: agg.messageCount,
		}),
	);
	byModel.sort((a, b) => b.cost - a.cost);

	const byProject: ProjectSlice[] = [...report.byProject.entries()].map(
		([project, agg]) => ({
			project,
			cost: agg.usage.cost,
			input: agg.usage.input,
			output: agg.usage.output,
			messageCount: agg.usage.messageCount,
		}),
	);
	byProject.sort((a, b) => b.cost - a.cost);

	const byDate: DateSlice[] = [...report.byDate.entries()]
		.map(([date, agg]) => ({date, cost: agg.usage.cost}))
		.sort((a, b) => a.date.localeCompare(b.date));

	return {byModel, byProject, byDate};
}

async function run(): Promise<void> {
	const input = workerData as WorkerInput;
	const report = await analyzeCosts(input.projectsDir, input.pricing);

	const now = new Date();
	const monthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
	const monthly = [...report.byDate.entries()]
		.filter(([date]) => date.startsWith(monthPrefix))
		.reduce((sum, [, agg]) => sum + agg.usage.cost, 0);

	// Same semantics as evaluateBudget() in the CLI package.
	const ratio = input.monthlyLimit > 0 ? monthly / input.monthlyLimit : 0;
	const level: BudgetStatus['level'] =
		ratio >= 1 ? 'over' : ratio >= input.warnRatio ? 'warn' : 'ok';

	const payload: DashboardPayload = {
		monthly,
		total: report.total.cost,
		sessionCount: report.sessionCount,
		parsedMessageCount: report.parsedMessageCount,
		usage: {
			input: report.total.input,
			output: report.total.output,
			cacheRead: report.total.cacheRead,
			cacheWrite: report.total.cacheWrite,
		},
		...serializeReport(report),
		budget: {spent: monthly, limit: input.monthlyLimit, ratio, level},
	};
	const result: WorkerResult = {ok: true, payload};
	parentPort?.postMessage(result);
}

run().catch((error: unknown) => {
	const result: WorkerResult = {ok: false, message: String(error)};
	parentPort?.postMessage(result);
});
