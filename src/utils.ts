import type { Component, Snippet } from 'svelte'
import Dummy from './components/dummy.svelte'

/**
 * Only serves as syntactic meaning to component props
 */
type BaseProps = {}

/**
 * The content of lazily-imported component
 */
export type LazyViewComponent<Props extends BaseProps = BaseProps> =
	() => Promise<{
		// default: Component<Props>
		[key: string]: Component<Props>
	}>

/**
 * Either usual full component or lazily-imported component
 */
export type ViewComponent<Props extends BaseProps = any> =
	| Component<Props>
	| LazyViewComponent<Props>
/**
 * Layout component = View component with children
 */
export type LayoutComponent =
	| ViewComponent<{ children: Snippet }>
	| [ViewComponent, { submodule?: string }]

export type Location = {
	pathname: string
	search: string
	state: any
	hash: string
}

/**
 * Useful to check current page status
 */
export function updatedLocation(): Location {
	return {
		pathname: globalThis.location.pathname,
		search: globalThis.location.search,
		state: history.state,
		hash: globalThis.location.hash,
	}
}

/**
 * Check whether the view component is fully or lazily imported (by regex)
 */
export function isLazyImport(input: unknown): input is LazyViewComponent {
	return (
		typeof input === 'function' &&
		!!/\(\)\s?=>\s?import\(.*\)/.test(String(input))
	)
}

/**
 * Resolve multiple view components (fully + lazily imported)
 */
export function resolveViewComponents(
	input: (
		| ViewComponent
		| [ViewComponent, { submodule?: string; params?: string[] }]
	)[],
): Promise<
	(Component | [Component, { submodule?: string; params?: string[] }])[]
> {
	return Promise.all(input.map((c) => resolveViewComponent(c)))
}

/**
 * Resolve a single view component (fully / lazily imported)
 */
export function resolveViewComponent(
	input:
		| ViewComponent
		| [ViewComponent, { submodule?: string; params?: string[] }],
): Promise<Component | [Component, { submodule?: string; params?: string[] }]> {
	return new Promise((resolve) => {
		if (typeof input === 'function' && isLazyImport(input)) {
			Promise.resolve(input()).then((module) => {
				resolve(module.default)
			})
		} else if (Array.isArray(input)) {
			if (isLazyImport(input[0])) {
				Promise.resolve(input[0]()).then((module) => {
					resolve([module[input[1].submodule ?? 'default'], input[1]])
				})
			} else resolve([input[0], input[1]])
		} else {
			resolve(input)
		}
	})
}

/**
 * Simply replaces URL slugs with values from params
 */
export function constructPath(
	path: string,
	params: Record<string, string>,
): string {
	if (!params) return path

	let result = path
	for (const key in params) {
		result = result.replace(`:${key}`, params[key])
	}
	return result
}

/**
 * Joins multiple paths together, ensuring that there are no double slashes
 */
export function join(...parts: string[]): string {
	let result = ''
	for (let part of parts) {
		if (!part.startsWith('/')) {
			result += '/'
		}
		if (part.endsWith('/')) {
			part = part.slice(0, -1)
		}
		result += part
	}
	return result
}

/**
 * Uses absolute equality
 */
export const isActive: ((
	pathname: string,
	params: Record<string, string>,
) => boolean) & {
	/**
	 * Uses just a prefix part
	 */
	startsWith: (pathname: string, params: Record<string, string>) => boolean
} = Object.assign(
	(pathname: string, params: Record<string, string>): boolean => {
		return compare((a, b) => a === b, pathname, params)
	},
	{
		startsWith: (pathname: string, params: Record<string, string>): boolean => {
			return compare((a, b) => a.startsWith(b), pathname, params)
		},
	},
)

/**
 * Checks if the current pathname matches the given pathname.
 */
function compare(
	compareFn: (arg0: string, arg1: string) => boolean,
	pathname: string,
	params: Record<string, string>,
): boolean {
	if (!pathname.includes(':')) {
		return compareFn(location.pathname, pathname)
	}

	if (params) {
		return compareFn(location.pathname, constructPath(pathname, params))
	}

	const pathParts = pathname.split('/').slice(1)
	const viewParts = location.pathname.split('/').slice(1)
	for (const [index, pathPart] of pathParts.entries()) {
		const viewPart = viewParts[index]
		if (viewPart!.startsWith(':')) {
			continue
		}
		return compareFn(pathPart, viewPart!)
	}
	return false
}

// H: Type must be fixed.
export type ComponentTree = {
	value: {
		a: { C: Component<any>; key: number; params?: Record<string, string> }[]
		b: { C: Component<any>; key: number; params?: Record<string, string> }[]
		eq: number
	}
}

/**
 * `load` property may actually return a list of loadable images (elements)
 * `setLoading` and `removeLoading`: yeah, we need those
 */
// type Transitions = {
// 	a: {
// 		in?: () => Promise<void>
// 		out?: () => Promise<void>
// 		load?: () => Promise<void>
// 		showLoading?: () => Promise<void>
// 		hideLoading?: () => Promise<void>
// 	}[]
// 	b: {
// 		in?: () => Promise<void>
// 		out?: () => Promise<void>
// 		load?: () => Promise<void>
// 		showLoading?: () => Promise<void>
// 		hideLoading?: () => Promise<void>
// 	}[]
// }

/**
 * Functions to call befrore and after loading a view
 */
export type Hooks = {
	/**
	 * Before next component tree is resolved.
	 *
	 * You can throw a `navigate` call to redirect to another view.
	 *
	 * ```js
	 * async beforeLoad() {
	 *   await ...
	 *   throw navigate('/home');
	 * }
	 * ```
	 */
	beforeLoad?(obj: { match?: ViewComponent }): void | Promise<void>
	/**
	 * After resolved, but not displayed yet.
	 *
	 * ```js
	 * async duringLoad({componentTree, transitions}) {
	 *   let equality = 0,
	 *     max = Math.min(tree.a?.length ?? 0, tree.b?.length ?? 0)
	 *   while (equality < max && tree.a?.[equality] === tree.b?.[equality])
	 *     equality++
	 *   const loads = (transitions['b'].slice(equality, tree.b.length).filter(x => x?.load))
	 *   console.log(loads)
	 *   if (loads.length) await Promise.all(loads.map(x => x.load()))
	 * }
	 * ```
	 */
	duringLoad?(obj: {
		cycle: 'a' | 'b' | 'ab' | 'ba'
		componentTree: ComponentTree['value']
		mountedComponents: any
		filepathTree: { a?: string[]; b?: string[] }
		keys: { in: string[]; out: string[] }
	}): void | Promise<void>
	/** How to render the next tree (while phasing out previous tree) */
	duringRender?(obj: {
		cycle: 'a' | 'b' | 'ab' | 'ba'
		componentTree: ComponentTree['value']
		mountedComponents: any
		filepathTree: { a?: string[]; b?: string[] }
		keys: { in: string[]; out: string[] }
	}): void | Promise<void>
	/** A function that will be called after the view is loaded and displayed. */
	afterRender?(obj: {
		cycle: 'a' | 'b' | 'ab' | 'ba'
		componentTree: ComponentTree['value']
		mountedComponents: any
		filepathTree: { a?: string[]; b?: string[] }
		keys: { in: string[]; out: string[] }
	}): void
}

/**
 * H: How about loading/transition component?
 */
export type Views = {
	[_: `/${string}`]:
		| ViewComponent
		| [ViewComponent, { submodule?: string; params?: string[] }]
		| Views
	[_: `*${string}` | `(*${string})`]:
		| ViewComponent
		| [ViewComponent, { submodule?: string; params?: string[] }]
		| undefined
	/**
	 * A layout for specific views
	 */
	layout?: LayoutComponent
	/**
	 * A view can have specific hooks
	 */
	hooks?: Hooks
}

type StripNonViews<T extends Views> = {
	[K in keyof T as K extends `*${string}`
		? never
		: K extends `(*${string})`
			? never
			: K extends 'layout'
				? never
				: K extends 'hooks'
					? never
					: K]: T[K] extends Views ? StripNonViews<T[K]> : T[K]
}

type RecursiveKeys<T extends Views, Prefix extends string = ''> = {
	[K in keyof T]: K extends string
		? T[K] extends Views
			? RecursiveKeys<T[K], `${Prefix}${K}`>
			: `${Prefix}${K}`
		: never
}[keyof T]

type RemoveLastSlash<T extends string> = T extends '/'
	? T
	: T extends `${infer R}/`
		? R
		: T

type RemoveParenthesis<T extends string> =
	T extends `${infer A}(${infer B})${infer C}`
		? RemoveParenthesis<`${A}${B}${C}`>
		: T

export type Path<T extends Views> = RemoveParenthesis<
	RemoveLastSlash<RecursiveKeys<StripNonViews<T>>>
>

type ExtractParams<T extends string> =
	T extends `${string}:${infer Param}/${infer Rest}`
		? Param | ExtractParams<`/${Rest}`>
		: T extends `${string}(:${infer Param})`
			? Param
			: T extends `${string}:${infer Param}`
				? Param
				: T extends `${string}(*${infer Param})`
					? Param
					: T extends `${string}*${infer Param}`
						? Param extends ''
							? never
							: Param
						: never

export type PathParams<T extends string> = ExtractParams<T> extends never
	? never
	: Record<ExtractParams<T>, string>

export type ConstructPathArgs<T extends string> = PathParams<T> extends never
	? [T]
	: [T, PathParams<T>]

type NavigateArgs<T extends string> =
	| (PathParams<T> extends never
			? [T] | [T, NavigateOptions]
			: [T, NavigateOptions & { params: PathParams<T> }])
	| [number]

export type IsActiveArgs<T extends string> = PathParams<T> extends never
	? [T]
	: [T] | [T, PathParams<T>]

export type AllParams<T extends Views> = Partial<
	Record<ExtractParams<RecursiveKeys<T>>, string>
>

export type SViewApi<T extends Views> = {
	/**
	 * Construct a path while ensuring type safety.
	 *
	 * ```js
	 * p('/users');
	 * // With parameters
	 * p('/users/:id', { id: 1 });
	 * ```
	 *
	 * @param view The view to navigate to.
	 * @param params The parameters to replace in the view.
	 */
	p<U extends Path<T>>(...args: ConstructPathArgs<U>): string
	/**
	 * Navigate programatically to a view.
	 *
	 * ```js
	 * navigate('/users');
	 * // With parameters
	 * navigate('/users/:id', {
	 * 	params: {
	 * 		id: 1,
	 * 	},
	 * });
	 * // Back and forward
	 * navigate(-1);
	 * navigate(2);
	 * ```
	 *
	 * @param view The view to navigate to.
	 * @param options The navigation options.
	 */
	navigate<U extends Path<T>>(...args: NavigateArgs<U>): void

	/**
	 * Will return `true` if the given path is active.
	 *
	 * Can be used with params to check the exact path, or without to check for any params in the
	 * path.
	 *
	 * @param path The view to check.
	 * @param params The optional parameters to replace in the view.
	 */
	isActive: {
		<U extends Path<T>>(...args: IsActiveArgs<U>): boolean
		startsWith<U extends Path<T>>(...args: IsActiveArgs<U>): boolean
	}
	/**
	 * H: ...
	 */
	view: {
		/**
		 * An object containing the parameters of the current view.
		 *
		 * For example, given the view `/posts/:slug/comments/:commentId` and the URL
		 * `http://localhost:5173/posts/hello-world/comments/123`, the `params` object would be `{ slug:
		 * 'hello-world', commentId: '123' }`.
		 */
		params: AllParams<T>
		/** The reactive pathname of the URL. */
		pathname: Path<T>
		/** The reactive query string part of the URL. */
		search: string
		/** The reactive history state that can be passed to the `navigate` function. */
		state: unknown
		/** The reactive hash part of the URL. */
		hash: string
		// /** Check whether navigation is in loading state */
		// isLoading: boolean
		// /** Check whether onNavigate is complete */
		// hasRendered: boolean
	}
}

export type NavigateOptions = {
	// loading?: string
	hash?: string
	replace?: boolean
	scrollToTop?: ScrollBehavior | false
	search?: string
	state?: string
	/**
	 * Skip DOM manipulation via SView
	 */
	bypass?: boolean
	hooks?: boolean
}

/**
 * @internal
 * i: To get Svelte component file paths (from web browser!)
 */
const filename: symbol = Object.getOwnPropertySymbols(Dummy).find(
	(s) => s.description === 'filename',
)!

/**
 * @internal
 * i: To get Svelte component file paths (from web browser!)
 */
// @ts-ignore
export const componentToString: (c: Component) => string = (c) => c[filename]

/**
 * H: ???
 */
export function getViewPaths(views: Views): string[] {
	const paths: string[] = []
	for (const [key, value] of Object.entries(views)) {
		if (typeof value === 'object' && !Array.isArray(value)) {
			paths.push(
				...getViewPaths(value).map((path) => {
					if (path === '*') {
						return key + '/*'
					}
					if (path === '/') {
						return key
					}
					return key + path
				}),
			)
		} else {
			paths.push(key)
		}
	}
	return paths
}

/**
 * H: ???
 */
export function validateViews(views: Views): void {
	const paths = getViewPaths(views)
	const wildcardPaths = paths.filter((path) => path.endsWith('*'))
	for (const wildcardPath of wildcardPaths) {
		const parentPath = wildcardPath.slice(0, -1)
		const dynamicPath = paths.find(
			(p) =>
				p !== '/' &&
				!p.endsWith('*') &&
				p.startsWith(parentPath === '' ? '/:' : parentPath) &&
				p.match(/:[^/]*$/g), // Match dynamic paths without slashes after the colon
		)
		if (dynamicPath) {
			console.warn(
				`SView warning: Wildcard view \`${wildcardPath}\` should not be at the same level as dynamic view \`${dynamicPath}\`.`,
			)
		}
	}
}

/**
 * H: ???
 */
export function matchView(
	pathname: string,
	views: Views,
): {
	match: ViewComponent | undefined
	layouts: LayoutComponent[]
	hooks: Hooks[]
	params: Record<string, string>
	breakFromLayouts: boolean
} {
	// Remove trailing slash
	if (pathname.length > 1 && pathname.endsWith('/')) {
		pathname = pathname.slice(0, -1)
	}
	const pathParts = pathname.split('/').slice(1)
	const allViews = sortViews(Object.keys(views))

	let match: ViewComponent | undefined

	let layouts: LayoutComponent[] = []

	let hooks: Hooks[] = []

	let params: Record<string, string> = {}

	let breakFromLayouts = false

	outer: for (const view of allViews) {
		const viewParts = view.split('/')
		if (viewParts[0] === '') viewParts.shift()

		for (let [index, viewPart] of viewParts.entries()) {
			breakFromLayouts = viewPart.startsWith('(') && viewPart.endsWith(')')
			if (breakFromLayouts) {
				viewPart = viewPart.slice(1, -1)
			}

			const pathPart = pathParts[index]
			if (viewPart.startsWith(':')) {
				params[viewPart.slice(1)] = pathPart
			} else if (viewPart.startsWith('*')) {
				const param = viewPart.slice(1)
				if (param) {
					params[param] = pathParts.slice(index).join('/')
				}
				if (breakFromLayouts) {
					viewPart = `(${viewPart})`
				} else if ('layout' in views && views.layout) {
					layouts.push(views.layout)
				}
				const resolvedPath = ((index ? '/' : '') +
					viewParts.join('/')) as keyof Views
				match = views[resolvedPath] as ViewComponent
				break outer
			} else if (viewPart !== pathPart) {
				break
			}

			if (index !== viewParts.length - 1) {
				continue
			}

			const viewMatch = views[
				('/' + viewParts.join('/')) as keyof Views
			] as ViewComponent

			if (!breakFromLayouts && 'layout' in views && views.layout) {
				layouts.push(views.layout)
			}

			if ('hooks' in views && views.hooks) {
				hooks.push(views.hooks)
			}

			// W: EXPERIMENTAL: Accepts array
			if (typeof viewMatch === 'function' || Array.isArray(viewMatch)) {
				if (viewParts.length === pathParts.length) {
					match = viewMatch
					break outer
				}
				continue
			}

			const nestedPathname = '/' + pathParts.slice(index + 1).join('/')
			const result = matchView(nestedPathname, viewMatch)
			if (result) {
				match = result.match
				params = { ...params, ...result.params }
				hooks.push(...result.hooks)
				if (result.breakFromLayouts) {
					layouts = []
				} else {
					layouts.push(...result.layouts)
				}
			}
			break outer
		}
	}

	return { match, layouts, hooks, params, breakFromLayouts }
}

/**
 * H: ???
 */
export function sortViews(views: string[]): string[] {
	return views.toSorted(
		(a: string, b: string) => getViewPriority(a) - getViewPriority(b),
	)
}

/**
 * H: ???
 */
function getViewPriority(view: string): number {
	if (view === '' || view === '/') return 1
	if (view.startsWith('*')) return 4
	if (view.includes(':')) return 3
	return 2
}

/**
 * H: Only for preloadOnHover apparently?
 */
const linkSet = new Set()

/**
 * H: ???
 */
export function preloadOnHover(views: Views): void {
	const observer = new MutationObserver(() => {
		const links = document.querySelectorAll('a[data-preload]')
		for (const link of links) {
			if (linkSet.has(link)) continue
			linkSet.add(link)

			link.addEventListener('mouseenter', function callback() {
				link.removeEventListener('mouseenter', callback)
				const href = link.getAttribute('href')
				if (!href) return
				const { match, layouts } = matchView(href, views)
				resolveViewComponents(match ? [...layouts, match] : layouts)
			})
		}
	})

	observer.observe(document.body, {
		subtree: true,
		childList: true,
	})
}

export type CalculateTree = (args: {
	prev: ComponentTree['value']
	next: (Component | [Component, { submodule?: string; params?: string[] }])[]
	cycle: 'ab' | 'ba'
	params: Record<string, string>
}) => ComponentTree['value']

import { mountedComponents } from './create.svelte'

/**
 * H: BUGGY!
 * H: Not counting params, sadly.
 */
export const calculateTree: CalculateTree = ({ prev, next, cycle, params }) => {
	let [afterCycle, beforeCycle] = cycle.split('') as unknown as ('a' | 'b')[]
	// console.log(beforeCycle, afterCycle)
	let keys = prev[beforeCycle]?.map((item) => item.key) ?? []
	const t = {
		[beforeCycle]: prev[beforeCycle],
		[afterCycle]: next.map((item, idx) => {
			if (Array.isArray(item)) {
				return {
					C: item[0],
					key: keys[idx] ?? 0,
					params:
						'params' in item[1] &&
						Object.fromEntries(
							item[1].params.map((param) => [param, params[param]]),
						),
				}
			}
			return {
				C: item,
				key: keys[idx] ?? 0,
			}
		}),
		eq: -1,
	} as ComponentTree['value']

	const max = Math.min(t.a.length, t.b.length)
	let i = -1
	// console.log("T", t)
	while (++i < max) {
		// console.log(max, i)
		// H: Also check params!
		if (
			t[beforeCycle][i].C !== t[afterCycle][i].C ||
			t[beforeCycle][i].params !== t[afterCycle][i].params
		) {
			t[afterCycle][i].key++
			i++
			break
		}
		t.eq = i
	}
	i--
	while (++i < t[afterCycle].length) {
		// console.log(i)
		t[afterCycle][i].key++
	}
	// initialize mountedComponents
	t[afterCycle].forEach(({ key }, idx) => {
		mountedComponents[`${idx} ${key}`] = {}
	})

	// console.log("KEYS & EQUALITY", keys, max, t)
	return t
}

import { SvelteURLSearchParams } from 'svelte/reactivity'

/**
 * H: ???
 */
export type SearchParams =
	| URLSearchParams
	| {
			append: (
				name: string,
				value: string,
				options?: { replace?: boolean },
			) => void
			delete: (
				name: string,
				value?: string,
				options?: { replace?: boolean },
			) => void
			set: (
				name: string,
				value: string,
				options?: { replace?: boolean },
			) => void
			sort: (options?: { replace?: boolean }) => void
	  }

/**
 * H: ???
 */
let searchParams = new SvelteURLSearchParams(globalThis.location.search)

/**
 * H: ???
 */
const shell: SearchParams = {
	append(name, value, options) {
		searchParams.append(name, value)
		updateUrlSearchParams(options)
	},
	delete(name, value, options) {
		searchParams.delete(name, value)
		updateUrlSearchParams(options)
	},
	entries() {
		return searchParams.entries()
	},
	forEach(...args) {
		return searchParams.forEach(...args)
	},
	get(...args) {
		return searchParams.get(...args)
	},
	getAll(...args) {
		return searchParams.getAll(...args)
	},
	has(...args) {
		return searchParams.has(...args)
	},
	keys() {
		return searchParams.keys()
	},
	set(name, value, options) {
		searchParams.set(name, value)
		updateUrlSearchParams(options)
	},
	sort(options) {
		searchParams.sort()
		updateUrlSearchParams(options)
	},
	toString() {
		return searchParams.toString()
	},
	values() {
		return searchParams.values()
	},
	get size() {
		return searchParams.size
	},
	[Symbol.iterator]() {
		return searchParams[Symbol.iterator]()
	},
}

export { shell as searchParams }

/**
 * H: ???
 */
export function syncSearchParams(): void {
	const newSearchParams = new URLSearchParams(globalThis.location.search)
	if (searchParams.toString() === newSearchParams.toString()) {
		return
	}
	searchParams = new SvelteURLSearchParams()
	for (const [key, value] of newSearchParams.entries()) {
		searchParams.append(key, value)
	}
}

/**
 * H: ???
 */
function updateUrlSearchParams(options?: { replace?: boolean }) {
	let url = globalThis.location.origin + globalThis.location.pathname
	if (searchParams.size > 0) {
		url += '?' + searchParams.toString()
	}
	globalThis.history[options?.replace ? 'replaceState' : 'pushState'](
		{},
		'',
		url,
	)
}
