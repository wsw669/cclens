/**
 * Tests for the cost analyzer: JSONL parsing, aggregation, pricing and budget.
 */
import {describe, it, expect, beforeEach, afterEach} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
	analyzeCosts,
	evaluateBudget,
	formatCny,
	formatTokens,
	decodeProjectName,
} from './costAnalyzer.js';
import {DEFAULT_PRICING} from './modelPricing.js';

let tempDir: string;

beforeEach(() => {
	tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cost-analyzer-'));
});

afterEach(() => {
	fs.rmSync(tempDir, {recursive: true, force: true});
});

function writeSession(projectDir: string, file: string, content: string): void {
	fs.mkdirSync(projectDir, {recursive: true});
	fs.writeFileSync(path.join(projectDir, file), content, 'utf-8');
}

function assistantLine(model: string, usage: object): string {
	return (
		JSON.stringify({
			type: 'assistant',
			timestamp: '2026-08-29T10:00:00.000Z',
			message: {model, usage},
		}) + '\n'
	);
}

describe('analyzeCosts', () => {
	it('parses assistant usage and aggregates by model', async () => {
		writeSession(
			path.join(tempDir, 'proj-a'),
			's1.jsonl',
			assistantLine('deepseek-v4-pro', {
				input_tokens: 1_000_000,
				output_tokens: 500_000,
				cache_read_input_tokens: 2_000_000,
				cache_creation_input_tokens: 0,
			}) +
				assistantLine('glm-5.3', {
					input_tokens: 100_000,
					output_tokens: 10_000,
					cache_read_input_tokens: 0,
					cache_creation_input_tokens: 0,
				}),
		);

		const report = await analyzeCosts(tempDir, DEFAULT_PRICING);

		expect(report.sessionCount).toBe(1);
		expect(report.parsedMessageCount).toBe(2);

		const deepseek = report.byModel.get('deepseek-v4-pro');
		expect(deepseek?.input).toBe(1_000_000);
		expect(deepseek?.output).toBe(500_000);
		// 1M in * 2 + 0.5M out * 8 + 2M cache * 0.5 = 2 + 4 + 1 = 7 CNY
		expect(deepseek?.cost).toBeCloseTo(7, 5);

		const glm = report.byModel.get('glm-5.3');
		// 100K * 1.5/1M + 10K * 6/1M = 0.15 + 0.06 = 0.21 CNY
		expect(glm?.cost).toBeCloseTo(0.21, 5);

		expect(report.total.cost).toBeCloseTo(7.21, 5);
	});

	it('aggregates per project and per date', async () => {
		writeSession(
			path.join(tempDir, 'proj-a'),
			's1.jsonl',
			assistantLine('glm-5.3', {
				input_tokens: 100_000,
				output_tokens: 0,
				cache_read_input_tokens: 0,
				cache_creation_input_tokens: 0,
			}),
		);
		writeSession(
			path.join(tempDir, 'proj-b'),
			's2.jsonl',
			assistantLine('glm-5.3', {
				input_tokens: 200_000,
				output_tokens: 0,
				cache_read_input_tokens: 0,
				cache_creation_input_tokens: 0,
			}),
		);

		const report = await analyzeCosts(tempDir, DEFAULT_PRICING);

		expect(report.sessionCount).toBe(2);
		expect(report.byProject.get('proj-a')?.usage.input).toBe(100_000);
		expect(report.byProject.get('proj-b')?.usage.input).toBe(200_000);
		const dateAgg = report.byDate.get('2026-08-29');
		expect(dateAgg?.usage.input).toBe(300_000);
	});

	it('skips malformed lines and zero-usage entries', async () => {
		writeSession(
			path.join(tempDir, 'proj-a'),
			's1.jsonl',
			'not-json\n' +
				assistantLine('glm-5.3', {input_tokens: 0, output_tokens: 0}) +
				assistantLine('glm-5.3', {input_tokens: 100, output_tokens: 0}),
		);

		const report = await analyzeCosts(tempDir, DEFAULT_PRICING);

		expect(report.parsedMessageCount).toBe(1);
		expect(report.total.input).toBe(100);
	});

	it('handles unknown models with the default price', async () => {
		writeSession(
			path.join(tempDir, 'proj-a'),
			's1.jsonl',
			assistantLine('mystery-model-2026', {
				input_tokens: 1_000_000,
				output_tokens: 0,
				cache_read_input_tokens: 0,
				cache_creation_input_tokens: 0,
			}),
		);

		const report = await analyzeCosts(tempDir, DEFAULT_PRICING);

		// default price input = 2 CNY / 1M
		expect(report.total.cost).toBeCloseTo(2, 5);
	});
});

describe('evaluateBudget', () => {
	const report = {
		total: {input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 50, messageCount: 1},
		byModel: new Map(),
		byProject: new Map(),
		byDate: new Map(),
		sessionCount: 1,
		parsedMessageCount: 1,
		unpricedModelCount: 0,
	};

	it('flags ok / warn / over levels', () => {
		expect(evaluateBudget(report, {monthlyLimit: 200, warnRatio: 0.8}).level).toBe('ok');
		expect(evaluateBudget(report, {monthlyLimit: 60, warnRatio: 0.8}).level).toBe('warn');
		expect(evaluateBudget(report, {monthlyLimit: 40, warnRatio: 0.8}).level).toBe('over');
	});
});

describe('format helpers', () => {
	it('formats CNY amounts', () => {
		expect(formatCny(0.123)).toBe('¥0.123');
		expect(formatCny(7.2)).toBe('¥7.20');
		expect(formatCny(118.2)).toBe('¥118.2');
	});

	it('formats token counts compactly', () => {
		expect(formatTokens(500)).toBe('500');
		expect(formatTokens(12_000)).toBe('12.0K');
		expect(formatTokens(2_000_000)).toBe('2.0M');
	});
});

describe('decodeProjectName', () => {
	it('decodes Claude-encoded drive-letter project names', () => {
		expect(decodeProjectName('C--Users-wsw')).toBe('wsw');
		expect(decodeProjectName('C--WINDOWS-system32')).toBe('system32');
	});

	it('passes through plain directory names unchanged', () => {
		expect(decodeProjectName('proj-a')).toBe('proj-a');
		expect(decodeProjectName('home-user-projects-demo')).toBe(
			'home-user-projects-demo',
		);
	});
});
