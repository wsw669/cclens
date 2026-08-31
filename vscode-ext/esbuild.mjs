/**
 * Bundle the extension host code and the cost-analysis worker with esbuild.
 * `vscode` is provided by the extension host and stays external; the worker
 * entry bundles the shared analysis services.
 */
import esbuild from 'esbuild';

await esbuild.build({
	entryPoints: ['src/extension.ts', 'src/costWorker.ts'],
	bundle: true,
	outdir: 'dist',
	external: ['vscode'],
	format: 'cjs',
	platform: 'node',
	target: 'node18',
	sourcemap: true,
	logLevel: 'info',
});
