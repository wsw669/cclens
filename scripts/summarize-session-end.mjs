#!/usr/bin/env node
/**
 * SessionEnd hook for Claude Code.
 *
 * Runs whenever a Claude Code session ends — CLI and VSCode alike — and
 * summarizes the finished session through cclens's summarization pipeline,
 * storing the result where the cclens CLI and VS Code extension read it:
 * ~/.config/cclens/summaries/<project>/<session-id>.md
 *
 * Claude Code pipes a JSON payload on stdin:
 *   { session_id, transcript_path, cwd, hook_event_name, ... }
 *
 * Registered in ~/.claude/settings.json:
 *   "hooks": { "SessionEnd": [{ "hooks": [{ "type": "command",
 *     "command": "node <repo>/scripts/summarize-session-end.mjs" }] }] }
 *
 * This script never fails loudly on purpose: a broken summary must not
 * interrupt the user's session shutdown. Problems are logged to the cclens
 * log file instead (~/.local/state/cclens/cclens.log).
 */
import fs from 'node:fs';
import path from 'node:path';
import {pathToClaudeProjectName} from '../dist/utils/claudeDir.js';
import {
	summarizeSession,
	getSummaryPath,
} from '../dist/services/sessionSummarizer.js';
import {logger} from '../dist/utils/logger.js';

// Same threshold as the CLI path: skip trivial sessions.
const MIN_TRANSCRIPT_BYTES = 20_000;

function readStdin() {
	return new Promise(resolve => {
		let data = '';
		let done = false;
		let timeout;
		const finish = () => {
			if (done) return;
			done = true;
			clearTimeout(timeout);
			process.stdin.removeAllListeners('data');
			resolve(data);
		};
		timeout = setTimeout(finish, 2000);
		process.stdin.on('data', chunk => {
			data += chunk;
		});
		process.stdin.on('end', finish);
	});
}

async function main() {
	const raw = await readStdin();
	if (!raw.trim()) {
		process.exitCode = 0; // Not invoked by Claude Code — nothing to do.
		return;
	}

	let payload;
	try {
		payload = JSON.parse(raw);
	} catch {
		logger.warn('summarize-session-end: invalid hook payload JSON');
		process.exitCode = 0;
		return;
	}

	const transcriptPath = payload.transcript_path;
	const sessionId = payload.session_id;
	const cwd = payload.cwd;
	if (!transcriptPath || !sessionId || !cwd) {
		logger.warn(
			'summarize-session-end: hook payload missing transcript_path/session_id/cwd',
		);
		process.exitCode = 0;
		return;
	}

	if (!fs.existsSync(transcriptPath)) {
		logger.warn(`summarize-session-end: transcript not found: ${transcriptPath}`);
		process.exitCode = 0;
		return;
	}
	if (fs.statSync(transcriptPath).size < MIN_TRANSCRIPT_BYTES) {
		logger.debug(
			`summarize-session-end: skipping tiny session (${transcriptPath})`,
		);
		process.exitCode = 0;
		return;
	}

	const project = pathToClaudeProjectName(cwd);

	// Dedupe: skip when this session was already summarized (e.g. by the
	// cclens CLI, which writes "<session-id>-<timestamp>.md").
	try {
		const projectDir = path.dirname(getSummaryPath(project, sessionId));
		const entries = fs.readdirSync(projectDir);
		const alreadySummarized = entries.some(
			name =>
				name === `${sessionId}.md` || name.startsWith(`${sessionId}-`),
		);
		if (alreadySummarized) {
			logger.debug(
				`summarize-session-end: already summarized (${sessionId})`,
			);
			process.exitCode = 0;
			return;
		}
	} catch {
		// Directory does not exist yet — first summary for this project.
	}

	try {
		await summarizeSession(transcriptPath, project, sessionId);
		logger.info(`summarize-session-end: summary saved for ${project}`);
	} catch (error) {
		logger.warn(
			`summarize-session-end: summary failed: ${String(error)}`,
		);
	}
	// Let pending handles drain before exiting — process.exit() on Windows
	// can race libuv teardown and print "UV_HANDLE_CLOSING" assertions.
	process.stdin.destroy();
	process.exitCode = 0;
}

void main();
