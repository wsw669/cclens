/**
 * Model pricing table (CNY per million tokens).
 *
 * Prices are user-overridable via ~/.config/cclens/pricing.json:
 *   { "deepseek-v4-pro": { "input": 2, "output": 8, "cacheRead": 0.5, "cacheWrite": 2 } }
 *
 * Default values are best-effort estimates as of 2026-08 and may drift with
 * vendor price changes. Unknown models fall back to the `default` entry.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {logger} from '../utils/logger.js';

/** Fallback price used when a model has no matching entry. */
export const FALLBACK_PRICE: ModelPrice = {
	input: 2,
	output: 8,
	cacheRead: 0.5,
	cacheWrite: 2,
};

export interface ModelPrice {
	/** CNY per 1M input tokens */
	input: number;
	/** CNY per 1M output tokens */
	output: number;
	/** CNY per 1M cached input tokens (cache read) */
	cacheRead: number;
	/** CNY per 1M cache-creation input tokens */
	cacheWrite: number;
}

/** Full pricing table keyed by model name. */
export type ModelPricingTable = Record<string, ModelPrice>;

export const DEFAULT_PRICING: Record<string, ModelPrice> = {
	default: {input: 2, output: 8, cacheRead: 0.5, cacheWrite: 2},
	'deepseek-v4-pro': {input: 2, output: 8, cacheRead: 0.5, cacheWrite: 2},
	'deepseek-v4-flash': {input: 0.5, output: 2, cacheRead: 0.1, cacheWrite: 0.5},
	'glm-5.3': {input: 1.5, output: 6, cacheRead: 0.3, cacheWrite: 1.5},
	'glm-5.3-flash': {input: 0.3, output: 1.2, cacheRead: 0.1, cacheWrite: 0.3},
	'glm-5v-turbo': {input: 2, output: 8, cacheRead: 0.5, cacheWrite: 2},
	'kimi-k2': {input: 2, output: 8, cacheRead: 0.5, cacheWrite: 2},
	'qwen-max': {input: 2, output: 6, cacheRead: 0.5, cacheWrite: 2},
	'claude-sonnet-5': {
		input: 21,
		output: 105,
		cacheRead: 2.1,
		cacheWrite: 26.25,
	},
	'claude-opus-5': {
		input: 105,
		output: 525,
		cacheRead: 10.5,
		cacheWrite: 131.25,
	},
	'claude-haiku-4-5-20251001': {
		input: 7,
		output: 35,
		cacheRead: 0.7,
		cacheWrite: 8.75,
	},
};

export function getPricingConfigPath(): string {
	return path.join(os.homedir(), '.config', 'cclens', 'pricing.json');
}

/**
 * Load pricing table, merged over defaults. A missing or invalid file is
 * ignored so the cost dashboard keeps working with built-in defaults.
 */
export function loadPricing(): Record<string, ModelPrice> {
	const merged: Record<string, ModelPrice> = {...DEFAULT_PRICING};
	try {
		const raw = fs.readFileSync(getPricingConfigPath(), 'utf-8');
		const user: Record<string, ModelPrice> = JSON.parse(raw);
		for (const [model, price] of Object.entries(user)) {
			merged[model] = {...merged[model], ...price};
		}
		logger.info(
			`Loaded user pricing overrides for ${Object.keys(user).length} model(s)`,
		);
	} catch (error) {
		// ENOENT (first run) or malformed JSON — fall back to defaults silently.
		logger.debug(`No user pricing config: ${String(error)}`);
	}
	return merged;
}

/**
 * Resolve a price entry for a model name. Model names from session logs may
 * carry suffixes like `[1M]`; strip them before matching. Prefix matching
 * covers vendor model families (e.g. `deepseek-v4-pro-...`).
 */
export function resolveModelPrice(
	pricing: ModelPricingTable,
	model: string,
): ModelPrice {
	const fallback: ModelPrice = pricing['default'] ?? FALLBACK_PRICE;
	if (!model || model === '<synthetic>') {
		return fallback;
	}
	const normalized = model.replace(/\[.*?\]/g, '').trim();
	const exact = pricing[normalized];
	if (exact) {
		return exact;
	}
	for (const key of Object.keys(pricing)) {
		if (key !== 'default' && normalized.startsWith(key)) {
			return pricing[key] ?? fallback;
		}
	}
	logger.debug(`No price entry for model "${model}", using default`);
	return fallback;
}
