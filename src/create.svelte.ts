import { tick } from 'svelte'

import type { ComponentTree, Location, SVWApi, Views, NavigateOptions } from './utils'
import {
	join,
	updatedLocation,
	componentToString,
	calculateTree,
	validateViews,
	matchView,
	resolveViewComponents,
	preloadOnHover,
	constructPath,
	isActive,
	syncSearchParams,
} from './utils'

// GLOBAL VARIABLES
let views: Views
export let componentTree: ComponentTree = $state({
	value: { a: [], b: [], eq: 0 },
})
export let cycle: { value: 'a' | 'ba' | 'b' | 'ab' } = $state({ value: 'a' })
export let params: { value: Record<string, string> } = $state({ value: {} })
export let phase: {
	value: 'idle' | 'beforeLoad' | 'duringLoad' | 'duringRender' | 'afterRender'
} = $state({ value: 'idle' })
export let location: Location = $state(updatedLocation())
let isRendering = $state(false)
let navigationIndex = 0
let pendingNavigationIndex = 0
export const base: { name?: string } = {
	name: undefined,
}
export const mountedComponents: Record<string, any> = $state<
	Record<string, any>
>({})

/**
 * @internal
 * i: For debugging purposes
 */
const filepathTree: { a?: string[]; b?: string[] } = $derived({
	a: componentTree.value.a?.map((c) => componentToString(c.C)),
	b: componentTree.value.b?.map((c) => componentToString(c.C)),
})

// H: might be too performance-heavy (since mountedComponents are not cleaned)
// const mountedComponentsKeys: string[] = $derived(
//     Object.entries(mountedComponents).filter(([k, v]) => {
//         if (!v || Object.entries(v).length === 0) return false
//         return true
//     }).map(([k]) => k)
// )

export const getCompKeys: { in: string[]; out: string[] } = (
	tree: ComponentTree['value'],
	cycle: string,
) => {
	const [afterCycle, beforeCycle] = cycle.split('') as ('a' | 'b')[]
	const keys: { in: string[]; out: string[] } = { in: [], out: [] }

	if (afterCycle)
		for (let i = tree.eq + 1; i < tree[afterCycle].length; i++)
			keys.in.push(`${i} ${tree[afterCycle][i]!.key}`)

	if (beforeCycle)
		for (let i = tree.eq + 1; i < tree[beforeCycle].length; i++)
			keys.out.push(`${i} ${tree[beforeCycle][i]!.key}`)

	return keys
}

/**
 * Setup a new view instance with the given views.
 *
 * @example
 * ```js
 * export const { navigate, view } = createView({
 *   views: {
 *     '/': Home,
 *     '/about': About,
 *     ...
 *   },
 * });
 * ```
 */
export const createView: SVWApi = <T extends Views>(r: { views: T }) => {
	views = r.views

	if (
		import.meta.env.DEV &&
		!import.meta.env.SSR &&
		typeof window !== 'undefined'
	) {
		validateViews(views)
	}

	preloadOnHover(views)

	return {
		p: constructPath,
		C: componentTree,
		MC: mountedComponents,
		navigate,
		isActive,
		phase,
		// H: Due to dependency to Anime.js, this is disabled.
		// tAction: createTAction(phase),
		view: {
			get params() {
				return params.value
			},
			get pathname() {
				return location.pathname
			},
			get search() {
				return location.search
			},
			get state() {
				return location.state
			},
			get hash() {
				return location.hash
			},
			get phase() {
				return phase.value
			},
		},
	}
}

/**
 * Navigate programatically to a view.
 *
 * @example
 *
 * ```js
 * navigate('/users');
 * navigate('/users/:id', {
 * 	params: {
 * 		id: 1,
 * 	},
 * });
 * navigate(-1);
 * navigate(2);
 * ```
 */
function navigate(path: string | number, options: NavigateOptions = {}) {
	if (typeof path === 'number') {
		globalThis.history.go(path)
		return
	}
	// console.log('navigate')
	// console.log(componentTree, mountedComponents, path)

	onNavigate(path, options)
}

function cleanMountedComponents() {
	let toclean = Object.entries(mountedComponents)
		.filter(([k, value]) => {
			let [depth, key] = k.split(' ')
			if (
				key <
				Math.min(
					componentTree.value.a[depth]?.key ?? Infinity,
					componentTree.value.b[depth]?.key ?? Infinity,
				)
			)
				return true
			return false
		})
		.map(([k]) => k)
	toclean.forEach((x) => delete mountedComponents[x])
}

let firstBoot = $state(true)
export async function onNavigate(path?: string, options: NavigateOptions = {}): void {
	// i: Prevent HMR from triggering the algorithm (while still allowing back/forward navigation)
	// __(path, location.pathname, globalThis.location.pathname)
	if (!path && location.pathname === globalThis.location.pathname) {
		if (firstBoot) firstBoot = false
		else return
	}

	if (!views || Object.keys(views).length === 0)
		throw 'SVW is empty. You need to populate it.'
	if (isRendering) throw 'Rendering is still in process'
	// if (firstPage && views.layout) {
	//     try {
	//         // console.log(views)
	//         componentTree.value.a = await resolveViewComponents([views.layout])
	//         // console.log(componentTree)
	//         firstPage = false
	//     } catch (err) {
	//         console.error(err)
	//     }
	// }

	if (cycle.value === 'ba' || cycle.value === 'ab') return
	const prevCycle = cycle.value
	const nextCycle = prevCycle === 'a' ? 'ba' : 'ab'

	navigationIndex++
	const currentNavigationIndex = navigationIndex

	let matchPath = path || globalThis.location.pathname
	if (base.name && matchPath.startsWith(base.name)) {
		matchPath = matchPath.slice(base.name.length) || '/'
	}
	const {
		match,
		layouts,
		hooks,
		params: newParams,
	} = matchView(matchPath, views)

	const bypass = options.bypass
	if (!bypass) {
		phase.value = 'beforeLoad'
		await tick()
		for (const { beforeLoad } of hooks) {
			try {
				pendingNavigationIndex = currentNavigationIndex
				await beforeLoad?.({ match, params: newParams })
			} catch (err) {
				// log.error(err)
				phase.value = 'idle'
				return
			}
		}

		const fromBeforeLoadHook = new Error().stack?.includes('beforeLoad')

		// log.log(navigationIndex, currentNavigationIndex, pendingNavigationIndex, fromBeforeLoadHook)
		if (
			navigationIndex !== currentNavigationIndex ||
			(fromBeforeLoadHook &&
				pendingNavigationIndex + 1 !== currentNavigationIndex)
		) {
			// log.error('beforeLoad cancelled')
			phase.value = 'idle'
			return
		}

		const viewComponents = await resolveViewComponents(
			match ? [...layouts, match] : layouts,
		)

		// while (mountedComponents.length < viewComponents.length) {
		//     mountedComponents[`${mountedComponents.length}`] = {}
		// }
		const prevComponentTree = componentTree.value
		componentTree.value = calculateTree({
			prev: componentTree.value,
			next: viewComponents,
			cycle: nextCycle,
			params: newParams,
		})
		cycle.value = nextCycle

		const revertLoading = () => {
			cycle.value = prevCycle
			componentTree.value = prevComponentTree
		}

		phase.value = 'duringLoad'
		await tick()
		// H: Probably have to choose one.
		for (const { duringLoad } of hooks) {
			try {
				pendingNavigationIndex = currentNavigationIndex
				await duringLoad?.({
					cycle: cycle.value,
					componentTree: componentTree.value,
					filepathTree,
					mountedComponents,
					keys: getCompKeys(componentTree.value, cycle.value),
				})
			} catch (err) {
				// log.error(err)
				revertLoading()
				phase.value = 'idle'
				return
			}
		}

		const fromDuringLoadHook = new Error().stack?.includes('duringLoad')

		if (
			navigationIndex !== currentNavigationIndex ||
			(fromDuringLoadHook &&
				pendingNavigationIndex + 1 !== currentNavigationIndex)
		) {
			// log.error('duringLoad cancelled')
			revertLoading()
			phase.value = 'idle'
			return
		}
	}

	if (path) {
		if (options.search) path += options.search
		if (options.hash) path += options.hash
		const historyMethod = options.replace ? 'replaceState' : 'pushState'
		const to = base.name ? join(base.name, path) : path
		globalThis.history[historyMethod](options.state || {}, '', to)
	}

	params.value = newParams || {}
	syncSearchParams()
	Object.assign(location, updatedLocation())

	if (options.scrollToTop !== false) {
		window.scrollTo({ top: 0, left: 0, behavior: options.scrollToTop })
	}

	if (!bypass) {
		phase.value = 'duringRender'
		await tick()
		// H: Probably have to choose one.
		for (const { duringRender } of hooks) {
			try {
				// pendingNavigationIndex = currentNavigationIndex
				await duringRender?.({
					cycle: cycle.value,
					componentTree: componentTree.value,
					filepathTree,
					mountedComponents,
					keys: getCompKeys(componentTree.value, cycle.value),
				})
			} catch (err) {
				// log.error(err)
			}
		}
		cycle.value = cycle.value === 'ba' ? 'b' : 'a'

		phase.value = 'afterRender'
		await tick()
		for (const { afterRender } of hooks) {
			try {
				// pendingNavigationIndex = currentNavigationIndex
				afterRender?.({
					cycle: cycle.value,
					componentTree: componentTree.value,
					filepathTree,
					mountedComponents,
					keys: getCompKeys(componentTree.value, cycle.value),
				})
			} catch (err) {
				// log.error(err)
			}
		}
	}

	phase.value = 'idle'
	cleanMountedComponents()

	return
}

/**
 * H: Global anchor element modifier (MPA → SPA)
 */
export function onGlobalClick(event: Event): void {
	if (!(event.target instanceof HTMLElement)) return
	const anchor = event.target.closest('a')
	if (!anchor) return

	if (anchor.hasAttribute('target') || anchor.hasAttribute('download')) return

	const url = new URL(anchor.href)
	const currentOrigin = globalThis.location.origin
	if (url.origin !== currentOrigin) return

	event.preventDefault()
	const { replace, state, scrollToTop } = anchor.dataset
	onNavigate(url.pathname, {
		replace: replace === '' || replace === 'true',
		search: url.search,
		state,
		hash: url.hash,
		scrollToTop:
			scrollToTop === 'false' ? false : (scrollToTop as ScrollBehavior),
	})
}

/**
 * A Svelte action that will add a class to the anchor if its `href` matches the current view.
 *
 * @remarks
 * It can have an optional `className` parameter to specify the class to add, otherwise it will default to `is-active`.
 *
 * @example
 * ```svelte
 * <a href="/about" use:isActiveLink={{ className: 'active-link' }}>
 * ```
 */
export const isActiveLink: Action<
	HTMLAnchorElement,
	{ className?: string; startsWith?: boolean } | undefined
> = (node, { className = 'is-active', startsWith = false } = {}) => {
	if (node.tagName !== 'A') {
		throw new Error('isActiveLink can only be used on <a> elements')
	}

	$effect(() => {
		const pathname = new URL(node.href).pathname
		if (
			startsWith
				? location.pathname.startsWith(pathname)
				: location.pathname === pathname
		) {
			node.classList.add(className)
		} else {
			node.classList.remove(className)
		}
	})
}
