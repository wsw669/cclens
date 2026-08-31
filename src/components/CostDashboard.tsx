/**
 * Cost dashboard view: aggregates token usage and cost from AI coding agent
 * session logs and renders a breakdown by model, project and date, plus a
 * budget status line.
 *
 * Added on top of cclens to answer "where did my AI money go?".
 */
import React, {useEffect, useState} from 'react';
import {Box, Text, useInput, useApp} from 'ink';
import path from 'node:path';
import os from 'node:os';
import {
	analyzeCosts,
	type CostReport,
	type BudgetConfig,
	evaluateBudget,
	formatCny,
	formatTokens,
} from '../services/costAnalyzer.js';
import {loadPricing} from '../services/modelPricing.js';
import {logger} from '../utils/logger.js';

interface CostDashboardProps {
	onBack: () => void;
}

const DEFAULT_BUDGET: BudgetConfig = {
	monthlyLimit: 200,
	warnRatio: 0.8,
};

type LoadState =
	| {status: 'loading'}
	| {status: 'error'; message: string}
	| {status: 'ready'; report: CostReport};

const CostDashboard: React.FC<CostDashboardProps> = ({onBack}) => {
	const {exit} = useApp();
	const [state, setState] = useState<LoadState>({status: 'loading'});

	useEffect(() => {
		let cancelled = false;
		const run = async (): Promise<void> => {
			try {
				const pricing = loadPricing();
				const projectsDir = path.join(
					os.homedir(),
					'.claude',
					'projects',
				);
				const report = await analyzeCosts(projectsDir, pricing);
				if (!cancelled) {
					setState({status: 'ready', report});
				}
			} catch (error) {
				logger.error(`Cost dashboard failed: ${String(error)}`);
				if (!cancelled) {
					setState({
						status: 'error',
						message: error instanceof Error ? error.message : String(error),
					});
				}
			}
		};
		void run();
		return () => {
			cancelled = true;
		};
	}, []);

	useInput((input, key) => {
		if (key.escape || input === 'q' || input === 'b') {
			onBack();
		} else if (key.ctrl && input === 'c') {
			exit();
		}
	});

	if (state.status === 'loading') {
		return (
			<Box flexDirection="column">
				<Text bold color="green">
					Cost Dashboard
				</Text>
				<Text dimColor>Scanning AI session logs…</Text>
			</Box>
		);
	}

	if (state.status === 'error') {
		return (
			<Box flexDirection="column">
				<Text bold color="red">
					Failed to analyze costs
				</Text>
				<Text>{state.message}</Text>
				<Box marginTop={1}>
					<Text dimColor>Press Esc or Q to go back</Text>
				</Box>
			</Box>
		);
	}

	const {report} = state;
	const budget = evaluateBudget(report, DEFAULT_BUDGET);
	const budgetColor =
		budget.level === 'over' ? 'red' : budget.level === 'warn' ? 'yellow' : 'green';

	const modelRows = [...report.byModel.entries()].sort(
		(a, b) => b[1].cost - a[1].cost,
	);
	const projectRows = [...report.byProject.entries()].sort(
		(a, b) => b[1].usage.cost - a[1].usage.cost,
	);
	const dateRows = [...report.byDate.entries()]
		.sort((a, b) => b[0].localeCompare(a[0]))
		.slice(0, 7);

	return (
		<Box flexDirection="column">
			<Text bold color="green">
				💸 Cost Dashboard
			</Text>
			<Box marginY={1} flexDirection="column">
				<Text>
					<Text bold>Total cost: </Text>
					<Text bold color="cyan">
						{formatCny(report.total.cost)}
					</Text>
					<Text dimColor>
						{'  '}input {formatTokens(report.total.input)} / output{' '}
						{formatTokens(report.total.output)} / cache-read{' '}
						{formatTokens(report.total.cacheRead)}
					</Text>
				</Text>
				<Text>
					<Text dimColor>
						sessions {report.sessionCount} · messages{' '}
						{report.parsedMessageCount}
					</Text>
				</Text>
				<Text color={budgetColor}>
					Budget: {formatCny(budget.spent)} /{' '}
					{formatCny(budget.limit)} ({Math.round(budget.ratio * 100)}%)
					{budget.level === 'over'
						? ' — OVER BUDGET'
						: budget.level === 'warn'
							? ' — approaching limit'
							: ''}
				</Text>
			</Box>

			<Text bold underline>By model</Text>
			{modelRows.map(([model, agg]) => (
				<Text key={model}>
					<Text color="cyan">{model.padEnd(22)}</Text>
					<Text color="yellow">{formatCny(agg.cost).padEnd(12)}</Text>
					<Text dimColor>
						{formatTokens(agg.input).padEnd(9)} in ·{' '}
						{formatTokens(agg.output).padEnd(9)} out · {agg.messageCount} msgs
					</Text>
				</Text>
			))}

			<Box marginTop={1}>
				<Text bold underline>By project</Text>
			</Box>
			{projectRows.slice(0, 8).map(([project, agg]) => (
				<Text key={project}>
					<Text color="cyan">{project.padEnd(24)}</Text>
					<Text color="yellow">{formatCny(agg.usage.cost).padEnd(12)}</Text>
					<Text dimColor>{formatTokens(agg.usage.input)} in</Text>
				</Text>
			))}

			<Box marginTop={1}>
				<Text bold underline>By date (recent)</Text>
			</Box>
			{dateRows.map(([date, agg]) => (
				<Text key={date}>
					<Text color="cyan">{date.padEnd(14)}</Text>
					<Text color="yellow">{formatCny(agg.usage.cost).padEnd(12)}</Text>
					<Text dimColor>{formatTokens(agg.usage.input)} in</Text>
				</Text>
			))}

			<Box marginTop={1}>
				<Text dimColor>
					Esc/Q back · Ctrl+C quit · prices configurable in
					~/.config/cclens/pricing.json
				</Text>
			</Box>
		</Box>
	);
};

export default CostDashboard;
