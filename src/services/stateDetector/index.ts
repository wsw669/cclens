import {StateDetectionStrategy} from '../../types/index.js';
import {StateDetector} from './types.js';
import {ClaudeStateDetector} from './claude.js';

export function createStateDetector(
	strategy: StateDetectionStrategy = 'claude',
): StateDetector {
	// Only Claude Code is supported: this fork is focused on the Claude Code
	// experience. The switch is kept for forward compatibility.
	switch (strategy) {
		case 'claude':
			return new ClaudeStateDetector();
		default:
			return new ClaudeStateDetector();
	}
}
