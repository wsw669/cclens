/**
 * Plain-object payloads exchanged between the extension host and the cost
 * analysis worker (structured clone requires no Map/class instances).
 */

export interface ModelSlice {
	model: string;
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
	cost: number;
	messageCount: number;
}

export interface ProjectSlice {
	project: string;
	cost: number;
	input: number;
	output: number;
	messageCount: number;
}

export interface DateSlice {
	date: string;
	cost: number;
}

export interface UsageTotals {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
}

export interface BudgetStatus {
	spent: number;
	limit: number;
	ratio: number;
	level: 'ok' | 'warn' | 'over';
}

export interface DashboardPayload {
	monthly: number;
	total: number;
	sessionCount: number;
	parsedMessageCount: number;
	usage: UsageTotals;
	byModel: ModelSlice[];
	byProject: ProjectSlice[];
	byDate: DateSlice[];
	budget: BudgetStatus;
}

export type WorkerResult =
	| {ok: true; payload: DashboardPayload}
	| {ok: false; message: string};
