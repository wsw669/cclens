/**
 * Cost analyzer: parse AI coding agent session logs (JSONL) and aggregate
 * token usage / cost by model, project and date.
 *
 * Data source: ~/.claude/projects/<project>/<session>.jsonl
 * Each assistant message carries `message.usage` with input/output and cache
 * read/write token counts plus `message.model`.
 *
 * Files can be hundreds of MB, so parsing streams line by line and aggregates
 * on the fly — no full-file buffering.
 */
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import {logger} from '../utils/logger.js';
import {
	type ModelPrice,
	resolveModelPrice,
	type ModelPricingTable,
} from './modelPricing.js';

export interface TokenUsage {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
}

export interface ModelAggregate extends TokenUsage {
	cost: number;
	messageCount: number;
}

export interface ProjectAggregate {
	project: string;
	usage: ModelAggregate;
	byModel: Map<string, ModelAggregate>;
}

export interface DateAggregate {
	date: string;
	usage: ModelAggregate;
}

export interface CostReport {
	total: ModelAggregate;
	byModel: Map<string, ModelAggregate>;
	byProject: Map<string, ProjectAggregate>;
	byDate: Map<string, DateAggregate>;
	sessionCount: number;
	parsedMessageCount: number;
	unpricedModelCount: number;
}

export interface BudgetConfig {
	/** Monthly budget in CNY */
	monthlyLimit: number;
	/** Alert when current spending reaches this ratio (0-1) */
	warnRatio: number;
}

export interface BudgetStatus {
	spent: number;
	limit: number;
	ratio: number;
	level: 'ok' | 'warn' | 'over';
}

/** Usage fields inside an assistant message entry. */
interface AssistantUsageEntry {
	input_tokens?: number;
	output_tokens?: number;
	cache_read_input_tokens?: number;
	cache_creation_input_tokens?: number;
}

interface AssistantMessageEntry {
	type: string;
	timestamp?: string;
	sessionId?: string;
	message?: {
		model?: string;
		usage?: AssistantUsageEntry;
	};
}

const EMPTY_USAGE: TokenUsage = {input: 0, output: 0, cacheRead: 0, cacheWrite: 0};

export function emptyModelAggregate(): ModelAggregate {
	return {input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, messageCount: 0};
}

/** Locate all session JSONL files under the Claude projects directory. */
export function findSessionFiles(projectsDir: string): string[] {
	const files: string[] = [];
	const collect = (dir: string): void => {
		let entries: fs.Dirent[];
		try {
			entries = fs.readdirSync(dir, {withFileTypes: true});
		} catch {
			return; // unreadable directory — skip
		}
		for (const entry of entries) {
			const full = path.join(dir, entry.name);
			if (entry.isDirectory()) {
				collect(full);
			} else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
				files.push(full);
			}
		}
	};
	collect(projectsDir);
	return files;
}

/**
 * Derive a human-friendly project name from the encoded project directory.
 *
 * Claude encodes drive-letter paths like "C:\Users\wsw" as "C--Users-wsw".
 * The original path is not recoverable unambiguously, so show the last
 * segment of the encoded path. Non-encoded names pass through unchanged.
 */
export function decodeProjectName(projectDir: string): string {
	const name = path.basename(projectDir);
	if (/^[A-Za-z]--/.test(name)) {
		const segments = name.split('-').filter(segment => segment.length > 0);
		return segments[segments.length - 1] || name;
	}
	return name;
}

function toTokenUsage(entry: AssistantUsageEntry): TokenUsage {
	return {
		input: entry.input_tokens ?? 0,
		output: entry.output_tokens ?? 0,
		cacheRead: entry.cache_read_input_tokens ?? 0,
		cacheWrite: entry.cache_creation_input_tokens ?? 0,
	};
}

function addInto(target: ModelAggregate, usage: TokenUsage): void {
	target.input += usage.input;
	target.output += usage.output;
	target.cacheRead += usage.cacheRead;
	target.cacheWrite += usage.cacheWrite;
	target.messageCount += 1;
}

function computeCost(
	usage: TokenUsage,
	price: ModelPrice,
): number {
	return (
		(usage.input * price.input) / 1_000_000 +
		(usage.output * price.output) / 1_000_000 +
		(usage.cacheRead * price.cacheRead) / 1_000_000 +
		(usage.cacheWrite * price.cacheWrite) / 1_000_000
	);
}

/**
 * Parse one session JSONL and fold it into the report aggregate.
 * Returns the number of assistant messages with real usage data.
 */
async function parseSessionFile(
	file: string,
	projectName: string,
	pricing: ModelPricingTable,
	report: CostReport,
): Promise<number> {
	const stream = fs.createReadStream(file, {encoding: 'utf-8'});
	const rl = readline.createInterface({input: stream, crlfDelay: Infinity});
	let parsed = 0;

	for await (const line of rl) {
		if (!line) continue;
		let entry: AssistantMessageEntry;
		try {
			entry = JSON.parse(line) as AssistantMessageEntry;
		} catch {
			continue; // truncated or malformed line — skip
		}
		if (entry.type !== 'assistant') continue;
		const usageEntry = entry.message?.usage;
		if (!usageEntry) continue;
		if (!usageEntry.input_tokens && !usageEntry.output_tokens) continue;

		const model = entry.message?.model || 'unknown';
		const usage = toTokenUsage(usageEntry);
		const price = resolveModelPrice(pricing, model);

		// Global totals
		addInto(report.total, usage);
		report.total.cost += computeCost(usage, price);
		report.parsedMessageCount += 1;
		parsed += 1;

		// Per-model
		let modelAgg = report.byModel.get(model);
		if (!modelAgg) {
			modelAgg = emptyModelAggregate();
			report.byModel.set(model, modelAgg);
		}
		addInto(modelAgg, usage);
		modelAgg.cost += computeCost(usage, price);

		// Per-project
		let projectAgg = report.byProject.get(projectName);
		if (!projectAgg) {
			projectAgg = {
				project: projectName,
				usage: emptyModelAggregate(),
				byModel: new Map(),
			};
			report.byProject.set(projectName, projectAgg);
		}
		addInto(projectAgg.usage, usage);
		projectAgg.usage.cost += computeCost(usage, price);
		let projectModelAgg = projectAgg.byModel.get(model);
		if (!projectModelAgg) {
			projectModelAgg = emptyModelAggregate();
			projectAgg.byModel.set(model, projectModelAgg);
		}
		addInto(projectModelAgg, usage);
		projectModelAgg.cost += computeCost(usage, price);

		// Per-date
		const date = entry.timestamp ? entry.timestamp.slice(0, 10) : 'unknown';
		let dateAgg = report.byDate.get(date);
		if (!dateAgg) {
			dateAgg = {date, usage: emptyModelAggregate()};
			report.byDate.set(date, dateAgg);
		}
		addInto(dateAgg.usage, usage);
		dateAgg.usage.cost += computeCost(usage, price);
	}

	return parsed;
}

/**
 * Build a full cost report by scanning every session file under projectsDir.
 */
export async function analyzeCosts(
	projectsDir: string,
	pricing: ModelPricingTable,
): Promise<CostReport> {
	const report: CostReport = {
		total: emptyModelAggregate(),
		byModel: new Map(),
		byProject: new Map(),
		byDate: new Map(),
		sessionCount: 0,
		parsedMessageCount: 0,
		unpricedModelCount: 0,
	};

	const files = findSessionFiles(projectsDir);
	report.sessionCount = files.length;
	logger.info(`Cost analysis: scanning ${files.length} session files`);

	for (const file of files) {
		const projectName = decodeProjectName(path.dirname(file));
		const parsed = await parseSessionFile(file, projectName, pricing, report);
		if (parsed > 0) {
			logger.debug(`  ${path.basename(file)}: ${parsed} messages`);
		}
	}

	return report;
}

/** Evaluate budget status from a report and budget config. */
export function evaluateBudget(
	report: CostReport,
	config: BudgetConfig,
): BudgetStatus {
	const spent = report.total.cost;
	const ratio = config.monthlyLimit > 0 ? spent / config.monthlyLimit : 0;
	const level: BudgetStatus['level'] =
		ratio >= 1 ? 'over' : ratio >= config.warnRatio ? 'warn' : 'ok';
	return {spent, limit: config.monthlyLimit, ratio, level};
}

/** Format CNY amount for display. */
export function formatCny(amount: number): string {
	if (amount < 1) {
		return `¥${amount.toFixed(3)}`;
	}
	if (amount < 100) {
		return `¥${amount.toFixed(2)}`;
	}
	return `¥${amount.toFixed(1)}`;
}

/** Format large token counts compactly (e.g. 1.2M). */
export function formatTokens(tokens: number): string {
	if (tokens >= 1_000_000) {
		return `${(tokens / 1_000_000).toFixed(1)}M`;
	}
	if (tokens >= 1_000) {
		return `${(tokens / 1_000).toFixed(1)}K`;
	}
	return String(tokens);
}
