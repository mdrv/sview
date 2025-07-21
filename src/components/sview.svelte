<!--
@component
The main SView component

@example
```ts
<SView/>
```
-->

<script lang="ts">
	import { on } from 'svelte/events'
	import { base, componentTree, onGlobalClick, onNavigate } from './create.svelte'
	import { join } from './utils'
	import Recursive from './recursive.svelte'
	import { onMount } from 'svelte'

	type Props = { base?: string }
	let { base: basename }: Props = $props()

	if (basename) {
		base.name = (basename.startsWith('/') ? '' : '/') + basename
		const url = new URL(globalThis.location.href)
		if (!url.pathname.startsWith(base.name)) {
			url.pathname = join(base.name, url.pathname)
			history.replaceState(history.state || {}, '', url.href)
		}
	}

	$effect(() => {
		const off1 = on(globalThis, 'popstate', () => onNavigate())
		const off2 = on(globalThis, 'click', onGlobalClick)

		return () => {
			off1()
			off2()
		}
	})

	onMount(() => {
		onNavigate()
	})
</script>

<Recursive tree={componentTree.value} />
