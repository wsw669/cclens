/**
 * Tests for the session summarizer: transcript extraction, JSON parsing and
 * markdown round-trip.
 */
import {describe, it, expect, beforeEach, afterEach} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
	extractTranscript,
	parseSummaryJson,
	renderSummaryMarkdown,
	parseSummaryMarkdown as internalParse,
	findLatestSessionFile,
} from './sessionSummarizer.js';

let tempDir: string;

beforeEach(() => {
	tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'summarizer-'));
});

afterEach(() => {
	fs.rmSync(tempDir, {recursive: true, force: true});
});

function writeSession(file: string, content: string): void {
	fs.writeFileSync(file, content, 'utf-8');
}

describe('extractTranscript', () => {
	it('extracts user and assistant text messages in order', async () => {
		const file = path.join(tempDir, 's.jsonl');
		writeSession(
			file,
			[
				JSON.stringify({
					type: 'user',
					message: {role: 'user', content: '帮我写一个函数'},
				}),
				JSON.stringify({
					type: 'assistant',
					message: {
						role: 'assistant',
						content: [{type: 'text', text: '好的，这是代码…'}],
					},
				}),
				JSON.stringify({type: 'queue-operation', operation: 'enqueue'}),
			].join('\n') + '\n',
		);

		const transcript = await extractTranscript(file);

		expect(transcript).toHaveLength(2);
		expect(transcript[0]).toEqual({role: 'user', text: '帮我写一个函数'});
		expect(transcript[1]?.role).toBe('assistant');
		expect(transcript[1]?.text).toContain('好的，这是代码');
	});

	it('skips malformed lines', async () => {
		const file = path.join(tempDir, 's.jsonl');
		writeSession(
			file,
			'not-json\n' +
				JSON.stringify({
					type: 'user',
					message: {role: 'user', content: '唯一一条'},
				}) +
				'\n',
		);

		const transcript = await extractTranscript(file);
		expect(transcript).toHaveLength(1);
	});
});

describe('parseSummaryJson', () => {
	it('parses raw JSON output', () => {
		const result = parseSummaryJson(
			'{"title":"写了个爬虫","whatWasDone":["a","b"],"keyDecisions":["c"],"nextSteps":[]}',
		);
		expect(result.title).toBe('写了个爬虫');
		expect(result.whatWasDone).toEqual(['a', 'b']);
		expect(result.keyDecisions).toEqual(['c']);
	});

	it('tolerates fenced code blocks', () => {
		const result = parseSummaryJson(
			'```json\n{"title":"t","whatWasDone":["x"],"keyDecisions":[],"nextSteps":[]}\n```',
		);
		expect(result.title).toBe('t');
		expect(result.whatWasDone).toEqual(['x']);
	});

	it('falls back to defaults on malformed input', () => {
		const result = parseSummaryJson('完全不是JSON');
		expect(result.title).toBe('Untitled session');
		expect(result.whatWasDone).toEqual([]);
	});
});

describe('markdown round-trip', () => {
	it('renders and parses back the same structure', () => {
		const summary = {
			sessionId: 'abc',
			project: 'proj',
			generatedAt: '2026-08-30T00:00:00.000Z',
			title: '测试会话',
			whatWasDone: ['完成了A', '修复了B'],
			keyDecisions: ['采用方案X'],
			nextSteps: ['写文档'],
			raw: '',
		};
		const markdown = renderSummaryMarkdown(summary);
		const parsed = internalParse(markdown, 'proj', 'abc');

		expect(parsed.title).toBe('测试会话');
		expect(parsed.whatWasDone).toEqual(['完成了A', '修复了B']);
		expect(parsed.keyDecisions).toEqual(['采用方案X']);
		expect(parsed.nextSteps).toEqual(['写文档']);
	});
});

describe('findLatestSessionFile', () => {
	it('returns the most recently modified JSONL above the size floor', () => {
		const dir = tempDir;
		const old = path.join(dir, 'old.jsonl');
		const small = path.join(dir, 'small.jsonl');
		const newest = path.join(dir, 'new.jsonl');
		writeSession(old, 'x'.repeat(50_000));
		writeSession(small, 'x'.repeat(100)); // below 20KB floor
		writeSession(newest, 'x'.repeat(50_000));

		const past = new Date(Date.now() - 60_000);
		fs.utimesSync(old, past, past);
		fs.utimesSync(newest, new Date(), new Date());

		expect(findLatestSessionFile(dir)).toBe(newest);
	});

	it('returns null for an empty or missing directory', () => {
		expect(findLatestSessionFile(path.join(tempDir, 'nope'))).toBeNull();
		expect(findLatestSessionFile(tempDir)).toBeNull();
	});
});
