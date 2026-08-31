/**
 * Session summarizer: turn a finished AI coding session into a structured,
 * reusable markdown summary (what was done / key decisions / next steps).
 *
 * Summaries are stored under ~/.config/cclens/summaries/<project>/<id>.md
 * and surfaced when a session is resumed, so long conversations stop being
 * lost context and become project assets.
 *
 * The LLM call uses any OpenAI-compatible endpoint configured via env:
 *   CCLENS_LLM_BASE_URL (default: https://api.deepseek.com/anthropic)
 *   CCLENS_LLM_API_KEY
 *   CCLENS_LLM_MODEL   (default: deepseek-v4-pro)
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import readline from 'node:readline';
import {logger} from '../utils/logger.js';
import {pathToClaudeProjectName} from '../utils/claudeDir.js';

export interface SessionSummary {
	sessionId: string;
	project: string;
	generatedAt: string;
	title: string;
	whatWasDone: string[];
	keyDecisions: string[];
	nextSteps: string[];
	raw: string;
}

interface LlmConfig {
	baseUrl: string;
	apiKey: string;
	model: string;
}

const SUMMARY_PROMPT = `You are summarizing a finished AI coding session. Read the conversation and produce a structured summary in JSON with this exact shape:
{
  "title": "short title under 40 chars describing the session",
  "whatWasDone": ["3-6 bullet points of concrete work completed"],
  "keyDecisions": ["1-4 important decisions or findings, empty array if none"],
  "nextSteps": ["1-3 suggested next steps, empty array if none"]
}
Rules: write in the language the session was mostly conducted in; be specific and factual; no markdown, raw JSON only.`;

export function getSummariesDir(): string {
	return path.join(
		os.homedir(),
		'.config',
		'cclens',
		'summaries',
	);
}

export function getSummaryPath(project: string, sessionId: string): string {
	const safe = project.replace(/[<>:"/\\|?*]/g, '_');
	return path.join(getSummariesDir(), safe, `${sessionId}.md`);
}

/** Load LLM config from environment, with sensible defaults for CN users. */
export function loadLlmConfig(): LlmConfig {
	return {
		baseUrl: process.env['CCLENS_LLM_BASE_URL'] ?? 'https://api.deepseek.com/anthropic',
		apiKey: process.env['CCLENS_LLM_API_KEY'] ?? '',
		model: process.env['CCLENS_LLM_MODEL'] ?? 'deepseek-v4-pro',
	};
}

interface JsonlMessage {
	type?: string;
	message?: {
		role?: string;
		content?: unknown;
	};
}

/** Extract a condensed transcript (role + text) from a session JSONL. */
export function extractTranscript(
	filePath: string,
	maxMessages = 60,
): Promise<{role: string; text: string}[]> {
	const stream = fs.createReadStream(filePath, {encoding: 'utf-8'});
	const rl = readline.createInterface({input: stream, crlfDelay: Infinity});
	const messages: {role: string; text: string}[] = [];

	return new Promise<{role: string; text: string}[]>(resolve => {
		rl.on('line', line => {
			if (!line) return;
			let entry: JsonlMessage;
			try {
				entry = JSON.parse(line) as JsonlMessage;
			} catch {
				return;
			}
			if (entry.type !== 'user' && entry.type !== 'assistant') return;
			const content = entry.message?.content;
			const text = extractText(content);
			if (!text) return;
			if (messages.length >= maxMessages) {
				// Keep only the most recent messages — the summary should
				// reflect the end of the session, not its beginning.
				messages.shift();
			}
			messages.push({role: entry.type, text: text.slice(0, 1500)});
		});
		rl.on('close', () => resolve(messages));
	});
}

/** Flatten string-typed content blocks from a Claude-format message. */
function extractText(content: unknown): string {
	if (typeof content === 'string') return content;
	if (!Array.isArray(content)) return '';
	const parts: string[] = [];
	for (const block of content) {
		if (
			typeof block === 'object' &&
			block !== null &&
			'type' in block &&
			(block.type === 'text' || block.type === 'tool_result')
		) {
			const text = (block as {text?: string; content?: unknown}).text;
			if (typeof text === 'string') {
				parts.push(text);
			} else if (typeof (block as {content?: unknown}).content === 'string') {
				parts.push((block as {content: string}).content);
			}
		}
	}
	return parts.join('\n');
}

/** Call an OpenAI-compatible chat endpoint and return the text reply. */
export async function callLlm(
	config: LlmConfig,
	prompt: string,
	transcript: {role: string; text: string}[],
): Promise<string> {
	if (!config.apiKey) {
		throw new Error(
			'CCLENS_LLM_API_KEY is not set — cannot generate summaries',
		);
	}
	const messages = [
		{role: 'system', content: SUMMARY_PROMPT},
		{
			role: 'user',
			content:
				'Session transcript (truncated to the last messages):\n\n' +
				transcript
					.map(m => `${m.role.toUpperCase()}: ${m.text}`)
					.join('\n\n'),
		},
		{role: 'user', content: prompt || 'Summarize this session now.'},
	];

	// Anthropic-compatible endpoint (e.g. DeepSeek's /anthropic route).
	const endpoint = config.baseUrl.endsWith('/messages')
		? config.baseUrl
		: `${config.baseUrl.replace(/\/$/, '')}/messages`;
	const response = await fetch(endpoint, {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			'x-api-key': config.apiKey,
			'anthropic-version': '2023-06-01',
		},
		body: JSON.stringify({
			model: config.model,
			// Thinking models (e.g. DeepSeek flash) emit a reasoning block
			// before the answer; 1024 tokens is not enough for reasoning
			// plus the JSON summary, so give the model headroom.
			max_tokens: 4096,
			messages,
		}),
	});
	if (!response.ok) {
		const body = await response.text().catch(() => '');
		throw new Error(`LLM API ${response.status}: ${body.slice(0, 300)}`);
	}
	const data = (await response.json()) as {content?: unknown};
	const text = extractText(data.content);
	return text;
}

/** Parse the LLM's JSON summary, tolerating fenced code blocks. */
export function parseSummaryJson(raw: string): Omit<SessionSummary, 'raw' | 'sessionId' | 'project' | 'generatedAt'> {
	const cleaned = raw
		.replace(/```json/gi, '')
		.replace(/```/g, '')
		.trim();
	const start = cleaned.indexOf('{');
	const end = cleaned.lastIndexOf('}');
	if (start < 0 || end <= start) {
		logger.warn('Summary output was not JSON — using defaults');
		return {
			title: 'Untitled session',
			whatWasDone: [],
			keyDecisions: [],
			nextSteps: [],
		};
	}
	const json = cleaned.slice(start, end + 1);
	let parsed: {
		title?: string;
		whatWasDone?: string[];
		keyDecisions?: string[];
		nextSteps?: string[];
	};
	try {
		parsed = JSON.parse(json) as typeof parsed;
	} catch (error) {
		logger.warn(`Summary JSON parse failed: ${String(error)}`);
		return {
			title: 'Untitled session',
			whatWasDone: [],
			keyDecisions: [],
			nextSteps: [],
		};
	}
	return {
		title: parsed.title || 'Untitled session',
		whatWasDone: parsed.whatWasDone || [],
		keyDecisions: parsed.keyDecisions || [],
		nextSteps: parsed.nextSteps || [],
	};
}

/**
 * Generate a summary for one session file, persist it as markdown and
 * return the structured result.
 */
export async function summarizeSession(
	sessionFilePath: string,
	project: string,
	sessionId: string,
): Promise<SessionSummary> {
	const config = loadLlmConfig();
	const transcript = await extractTranscript(sessionFilePath);
	if (transcript.length === 0) {
		throw new Error('Session file has no readable messages');
	}
	logger.info(`Summarizing ${sessionId}: ${transcript.length} messages`);
	const raw = await callLlm(config, '', transcript);
	const structured = parseSummaryJson(raw);

	const summary: SessionSummary = {
		sessionId,
		project,
		generatedAt: new Date().toISOString(),
		title: structured.title,
		whatWasDone: structured.whatWasDone,
		keyDecisions: structured.keyDecisions,
		nextSteps: structured.nextSteps,
		raw,
	};

	const filePath = getSummaryPath(project, sessionId);
	fs.mkdirSync(path.dirname(filePath), {recursive: true});
	fs.writeFileSync(filePath, renderSummaryMarkdown(summary), 'utf-8');
	return summary;
}

/** Render a summary as human-readable markdown. */
export function renderSummaryMarkdown(summary: SessionSummary): string {
	const lines: string[] = [
		`# ${summary.title}`,
		'',
		`- session: ${summary.sessionId}`,
		`- generated: ${summary.generatedAt}`,
		'',
		'## What was done',
		...summary.whatWasDone.map(item => `- ${item}`),
		'',
	];
	if (summary.keyDecisions.length > 0) {
		lines.push('## Key decisions', ...summary.keyDecisions.map(item => `- ${item}`), '');
	}
	if (summary.nextSteps.length > 0) {
		lines.push('## Next steps', ...summary.nextSteps.map(item => `- ${item}`), '');
	}
	return lines.join('\n');
}

/**
 * Find the most recently modified session JSONL in a project directory.
 * cclens session ids are synthetic, so we match the finished conversation
 * by modification time instead of id.
 */
export function findLatestSessionFile(projectDir: string): string | null {
	let entries: fs.Dirent[];
	try {
		entries = fs.readdirSync(projectDir, {withFileTypes: true});
	} catch {
		return null;
	}
	let latest: {path: string; mtimeMs: number} | null = null;
	for (const entry of entries) {
		if (!entry.isFile() || !entry.name.endsWith('.jsonl')) continue;
		const full = path.join(projectDir, entry.name);
		try {
			const stat = fs.statSync(full);
			// Skip tiny files — nothing meaningful to summarize.
			if (stat.size < 20_000) continue;
			if (!latest || stat.mtimeMs > latest.mtimeMs) {
				latest = {path: full, mtimeMs: stat.mtimeMs};
			}
		} catch {
			continue;
		}
	}
	return latest?.path ?? null;
}

/**
 * Fire-and-forget entry point called when a session exits. Summarizes the
 * latest conversation of the session's project and stores it in the
 * summaries directory. Returns null when there is nothing to summarize.
 */
export async function summarizeFinishedSession(session: {
	id: string;
	worktreePath: string;
}): Promise<SessionSummary | null> {
	const projectName = pathToClaudeProjectName(session.worktreePath);
	const projectDir = path.join(
		os.homedir(),
		'.claude',
		'projects',
		projectName,
	);
	const latest = findLatestSessionFile(projectDir);
	if (!latest) {
		logger.debug(`No summary candidate in ${projectDir}`);
		return null;
	}
	// Timestamp-suffixed file keeps a history of summaries per project.
	const stampedId = `${session.id}-${Date.now()}`;
	const summary = await summarizeSession(latest, projectName, stampedId);
	logger.info(`Summary saved for ${projectName}`);
	return summary;
}

/** Load a persisted summary, or null when it does not exist. */
export function loadSummary(
	project: string,
	sessionId: string,
): SessionSummary | null {
	const filePath = getSummaryPath(project, sessionId);
	try {
		const raw = fs.readFileSync(filePath, 'utf-8');
		return parseSummaryMarkdown(raw, project, sessionId);
	} catch {
		return null;
	}
}

/** List all persisted summaries, newest first. */
export function listSummaries(): SessionSummary[] {
	const dir = getSummariesDir();
	const results: SessionSummary[] = [];
	const collect = (current: string, project: string): void => {
		let entries: fs.Dirent[];
		try {
			entries = fs.readdirSync(current, {withFileTypes: true});
		} catch {
			return;
		}
		for (const entry of entries) {
			const full = path.join(current, entry.name);
			if (entry.isDirectory()) {
				collect(full, entry.name);
			} else if (entry.isFile() && entry.name.endsWith('.md')) {
				try {
					const raw = fs.readFileSync(full, 'utf-8');
					results.push(
						parseSummaryMarkdown(raw, project, path.basename(full, '.md')),
					);
				} catch {
					continue;
				}
			}
		}
	};
	collect(dir, '');
	results.sort((a, b) => b.generatedAt.localeCompare(a.generatedAt));
	return results;
}

export function parseSummaryMarkdown(
	raw: string,
	project: string,
	sessionId: string,
): SessionSummary {
	const sections = raw.split('\n## ');
	const firstLine = sections[0]?.split('\n')[0] ?? '';
	const title = firstLine.replace(/^# /, '').trim() || 'Untitled session';
	const listOf = (heading: string): string[] => {
		const section = sections.find(s => s.startsWith(heading));
		if (!section) return [];
		return section
			.split('\n')
			.filter(line => line.startsWith('- '))
			.map(line => line.slice(2));
	};
	return {
		sessionId,
		project,
		generatedAt: '',
		title,
		whatWasDone: listOf('What was done'),
		keyDecisions: listOf('Key decisions'),
		nextSteps: listOf('Next steps'),
		raw,
	};
}
