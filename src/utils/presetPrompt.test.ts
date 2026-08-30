import {describe, expect, it} from 'vitest';
import {
	preparePresetLaunch,
	describePromptInjection,
	getPromptInjectionMethod,
} from './presetPrompt.js';

describe('presetPrompt', () => {
	it('uses the final argument for claude presets', () => {
		expect(
			preparePresetLaunch(
				{command: 'claude', args: [], detectionStrategy: 'claude'},
				'write tests',
			),
		).toEqual({
			args: ['--teammate-mode', 'in-process', 'write tests'],
			method: 'final-arg',
		});
	});

	it('returns final-arg method for claude strategy', () => {
		expect(
			getPromptInjectionMethod({
				command: 'claude',
				detectionStrategy: 'claude',
			}),
		).toBe('final-arg');
	});

	describe('describePromptInjection', () => {
		it('describes final-arg for claude', () => {
			expect(
				describePromptInjection({
					command: 'claude',
					detectionStrategy: 'claude',
				}),
			).toContain('final command argument');
		});
	});
});
