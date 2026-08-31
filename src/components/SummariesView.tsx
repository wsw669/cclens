/**
 * Summaries view: browse session summaries auto-generated when AI sessions
 * exit, and read the details of any past conversation.
 *
 * Added on top of cclens so finished sessions become reusable assets.
 */
import React, {useEffect, useState} from 'react';
import {Box, Text, useInput, useApp} from 'ink';
import SelectInput from 'ink-select-input';
import {
	listSummaries,
	type SessionSummary,
} from '../services/sessionSummarizer.js';
import {logger} from '../utils/logger.js';

interface SummariesViewProps {
	onBack: () => void;
}

const SummariesView: React.FC<SummariesViewProps> = ({onBack}) => {
	const {exit} = useApp();
	const [summaries, setSummaries] = useState<SessionSummary[]>([]);
	const [selected, setSelected] = useState<SessionSummary | null>(null);

	useEffect(() => {
		try {
			setSummaries(listSummaries());
		} catch (error) {
			logger.error(`Failed to list summaries: ${String(error)}`);
			setSummaries([]);
		}
	}, []);

	useInput((input, key) => {
		if (key.escape) {
			if (selected) {
				setSelected(null);
			} else {
				onBack();
			}
		} else if (input === 'q' && !selected) {
			onBack();
		} else if (key.ctrl && input === 'c') {
			exit();
		}
	});

	if (selected) {
		return (
			<Box flexDirection="column">
				<Text bold color="green">
					📝 {selected.title}
				</Text>
				<Text dimColor>
					{selected.project || 'unknown'} · {selected.sessionId}
				</Text>
				<Box marginTop={1} flexDirection="column">
					<Text bold>What was done</Text>
					{selected.whatWasDone.length > 0 ? (
						selected.whatWasDone.map((item, i) => (
							<Text key={i}> • {item}</Text>
						))
					) : (
						<Text dimColor> (none recorded)</Text>
					)}
					<Box marginTop={1}>
						<Text bold>Key decisions</Text>
					</Box>
					{selected.keyDecisions.length > 0 ? (
						selected.keyDecisions.map((item, i) => (
							<Text key={i}> • {item}</Text>
						))
					) : (
						<Text dimColor> (none recorded)</Text>
					)}
					<Box marginTop={1}>
						<Text bold>Next steps</Text>
					</Box>
					{selected.nextSteps.length > 0 ? (
						selected.nextSteps.map((item, i) => <Text key={i}> • {item}</Text>)
					) : (
						<Text dimColor> (none recorded)</Text>
					)}
				</Box>
				<Box marginTop={1}>
					<Text dimColor>Esc back · Ctrl+C quit</Text>
				</Box>
			</Box>
		);
	}

	if (summaries.length === 0) {
		return (
			<Box flexDirection="column">
				<Text bold color="green">
					📝 Session Summaries
				</Text>
				<Box marginY={1}>
					<Text dimColor>
						No summaries yet. They are generated automatically when a session
						exits (requires CCLENS_LLM_API_KEY).
					</Text>
				</Box>
				<Text dimColor>Esc/Q back</Text>
			</Box>
		);
	}

	const items = summaries.map(summary => ({
		label: `${summary.project || 'unknown'} — ${summary.title}`,
		value: summary.sessionId,
	}));

	return (
		<Box flexDirection="column">
			<Text bold color="green">
				📝 Session Summaries ({summaries.length})
			</Text>
			<Box marginY={1}>
				<SelectInput
					items={items}
					onSelect={item => {
						const found = summaries.find(s => s.sessionId === item.value);
						if (found) setSelected(found);
					}}
				/>
			</Box>
			<Text dimColor>Esc/Q back · Ctrl+C quit</Text>
		</Box>
	);
};

export default SummariesView;
