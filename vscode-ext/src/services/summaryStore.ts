/**
 * Summary store (VS Code extension edition): read session summaries that
 * the CCLens CLI persisted under ~/.config/cclens/summaries.
 *
 * Mirrors the reading side of src/services/sessionSummarizer.ts in the CLI
 * package. Generation stays in the CLI (it runs when a session exits); the
 * extension only lists and reads.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

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

export function getSummariesDir(): string {
	return path.join(os.homedir(), '.config', 'cclens', 'summaries');
}

function extractGeneratedAt(raw: string, fallbackIso: string): string {
	const match = raw.match(/^-\s*generated:\s*(\S+)\s*$/m);
	return match?.[1] ?? fallbackIso;
}

/**
 * Parse a persisted summary markdown file back into its structured form.
 * Unlike the CLI version, `generatedAt` is recovered from the markdown
 * header so lists can be sorted by generation time.
 */
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
		generatedAt: extractGeneratedAt(raw, ''),
		title,
		whatWasDone: listOf('What was done'),
		keyDecisions: listOf('Key decisions'),
		nextSteps: listOf('Next steps'),
		raw,
	};
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
					const summary = parseSummaryMarkdown(
						raw,
						project,
						path.basename(full, '.md'),
					);
					if (!summary.generatedAt) {
						// Older files without a generated header: use mtime.
						const stat = fs.statSync(full);
						summary.generatedAt = new Date(stat.mtimeMs).toISOString();
					}
					results.push(summary);
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
