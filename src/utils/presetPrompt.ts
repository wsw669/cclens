import type {CommandPreset} from '../types/index.js';
import {injectTeammateMode} from './commandArgs.js';

export type PromptInjectionMethod = 'final-arg' | 'flag' | 'stdin';

export interface PreparedPresetLaunch {
	args: string[];
	stdinPayload?: string;
	method: PromptInjectionMethod;
}

/**
 * Prompt flag configuration per detectionStrategy.
 * Only Claude Code is supported in this fork; the map is kept so future
 * strategies can be added without restructuring.
 */
const PROMPT_FLAG: Partial<
	Record<NonNullable<CommandPreset['detectionStrategy']>, string>
> = {};

const DEFAULT_DETECTION_STRATEGY: NonNullable<
	CommandPreset['detectionStrategy']
> = 'claude';

export const getPromptInjectionMethod = (
	preset: Pick<CommandPreset, 'command' | 'detectionStrategy'>,
): PromptInjectionMethod => {
	const strategy = preset.detectionStrategy ?? DEFAULT_DETECTION_STRATEGY;

	if (PROMPT_FLAG[strategy]) {
		return 'flag';
	}

	if (strategy === 'claude') {
		return 'final-arg';
	}

	return 'stdin';
};

export const getPromptFlag = (
	preset: Pick<CommandPreset, 'command' | 'detectionStrategy'>,
): string | undefined => {
	if (preset.detectionStrategy) {
		return PROMPT_FLAG[preset.detectionStrategy];
	}

	return undefined;
};

export const describePromptInjection = (
	preset: Pick<CommandPreset, 'command' | 'detectionStrategy'>,
): string => {
	const method = getPromptInjectionMethod(preset);
	if (method === 'flag') {
		const flag = getPromptFlag(preset) || '--prompt';
		return `The prompt will be passed as a command flag: \`${flag} "<your prompt>"\`.`;
	}

	if (method === 'final-arg') {
		return 'The prompt will be passed as the final command argument.';
	}

	return 'The prompt will be sent via standard input after the session command starts.';
};

export const preparePresetLaunch = (
	preset: Pick<CommandPreset, 'command' | 'args' | 'detectionStrategy'>,
	prompt?: string,
): PreparedPresetLaunch => {
	const baseArgs = injectTeammateMode(
		preset.command,
		preset.args || [],
		preset.detectionStrategy,
	);

	if (!prompt) {
		return {
			args: baseArgs,
			method: getPromptInjectionMethod(preset),
		};
	}

	switch (getPromptInjectionMethod(preset)) {
		case 'flag':
			return {
				args: [...baseArgs, getPromptFlag(preset) || '--prompt', prompt],
				method: 'flag',
			};
		case 'stdin':
			return {
				args: baseArgs,
				method: 'stdin',
				stdinPayload: `${prompt}\r`,
			};
		case 'final-arg':
			return {
				args: [...baseArgs, prompt],
				method: 'final-arg',
			};
	}
};
