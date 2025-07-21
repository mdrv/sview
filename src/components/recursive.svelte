<script lang="ts">
	import { type Component } from 'svelte'
	import Recursive from './recursive.svelte'
	import type { ComponentTree } from './utils'
	import { cycle, mountedComponents } from './create.svelte'

	type Props = {
		tree: ComponentTree['value']
		depth?: number
	}
	const { tree, depth = 0 }: Props = $props()

	const firstComponents = $derived(
		tree.a.length === 0 && tree.b.length === 0
			? []
			: depth <= tree.eq
				? [{ ...tree[cycle.value.slice(0, 1) as 'a' | 'b'][0], ab: 'a' }]
				: cycle.value
						.split('')
						.map((ab) => ({ ab, obj: tree[ab as 'a' | 'b'][0] }))
						.filter(
							//H: forgot the unique part
							(x: { ab: string; obj: { C: Component; key: number; params?: Record<string, string> } }, idx, arr) =>
								!!x.obj && arr.findIndex((item) => item.obj === x.obj) === idx,
						)
						.map((x: { ab: string; obj: { C: Component; key: number; params?: Record<string, string> } }) => ({
							ab: x.ab,
							C: x.obj.C,
							key: x.obj.key,
							params: x.obj.params,
						})),
	) as { ab: 'a' | 'b'; C: Component; key: number; params?: Record<string, string> }[]

	const restTree = $derived({
		a: tree.a?.slice(1),
		b: tree.b?.slice(1),
		eq: tree.eq,
	})
</script>

<svelte:boundary onerror={(e) => console.error(depth, e)}>
	{#each firstComponents as { C, ab, key, params } (`${key} ${JSON.stringify(params)}`)}
		<!-- H: BUG with bind:this on Svelte components -->
		<!-- l: https://github.com/sveltejs/svelte/issues/9764 -->
		<!-- H: Will create a new issue myself -->
		<!-- l: https://github.com/sveltejs/svelte/issues/10026 -->
		<!-- <C bind:C={mountedComponents[`${depth} ${key}`]}> -->
		<!-- <C bind:C={mountedComponents[`${depth} ${key}`]} transition={cycle.value.slice(0, 1) === ab ? 'in' : 'out'}> -->
		<C bind:C={mountedComponents[`${depth} ${key}`]}>
			<!-- <p>{depth} {key}</p> -->
			{#if restTree.a?.length > 0 || restTree.b?.length > 0}
				<Recursive
					tree={depth <= tree.eq ? restTree : { [ab]: restTree[ab], [ab === 'a' ? 'b' : 'a']: [], eq: tree.eq }}
					depth={depth + 1}
				/>
			{/if}
		</C>
	{/each}
</svelte:boundary>
