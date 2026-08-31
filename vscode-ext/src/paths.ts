import os from 'node:os';
import path from 'node:path';

/** Default Claude Code session data directory (~/.claude/projects). */
export function getDefaultProjectsDir(): string {
	return path.join(os.homedir(), '.claude', 'projects');
}
