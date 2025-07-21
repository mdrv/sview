import { defineConfig } from 'tsdown'

export default defineConfig({
	dts: true,
	entry: ['src/**/!(*.test).ts'],
	copy: ['src/components'],
	// @remarks `minify` still in alpha
	// https://tsdown.dev/options/minification
	minify: {
		// compress: true,
		// mangle: true,
		removeWhitespace: true,
	},
	outDir: 'dist',
	outputOptions: {
		preserveModulesRoot: 'src',
	},
	platform: 'browser',
	unbundle: true,
	external: [/\.svelte$/],
})
