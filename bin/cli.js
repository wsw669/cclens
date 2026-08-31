#!/usr/bin/env node

// CCLens entry point: runs the compiled TypeScript CLI.
import('../dist/cli.js').catch(error => {
	console.error('Failed to start cclens:', error);
	process.exit(1);
});
