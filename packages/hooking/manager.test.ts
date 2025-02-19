import { hookManager } from "./manager";
import { HookType } from "./hook";

/* eslint @typescript-eslint/no-empty-function: 0 */
/* eslint @typescript-eslint/ban-types: 0 */

describe("Hooks manager", () => {
	describe("Matching hooks", () => {
		it("should be valid when having a single REPLACE hook", () => {
			hookManager.clearHooks();
			registerHook(HookType.Replace, "foo", "pkg", false);
			const matches = hookManager.matchingHooks("foo", "path/lib/pkg");
			expect(matches.hasReplaceHooks()).toBeTruthy();
			expect(matches.hasBeforeHooks()).toBeFalsy();
			expect(matches.hasAfterHooks()).toBeFalsy();
		});
		it("should be valid when having a single REPLACE hook with hooks for other functions", () => {
			hookManager.clearHooks();
			registerHook(HookType.Replace, "foo", "pkg", false);
			registerHook(HookType.Replace, "foo", "otherPackage", false);
			registerHook(HookType.Replace, "bar", "pkg", false);
			const matches = hookManager.matchingHooks("foo", "path/lib/pkg");
			expect(matches.hasReplaceHooks()).toBeTruthy();
			expect(matches.hasBeforeHooks()).toBeFalsy();
			expect(matches.hasAfterHooks()).toBeFalsy();
		});
		it("should be valid when having a multiple BEFORE/AFTER hooks (sync)", () => {
			hookManager.clearHooks();
			registerHook(HookType.Before, "foo", "pkg", false);
			registerHook(HookType.Before, "foo", "pkg", false);
			registerHook(HookType.After, "foo", "pkg", false);
			registerHook(HookType.After, "foo", "pkg", false);
			registerHook(HookType.After, "foo", "pkg", false);
			registerHook(HookType.Replace, "bar", "pkg", false);
			const matches = hookManager.matchingHooks("foo", "path/lib/pkg");
			expect(matches.hasReplaceHooks()).toBeFalsy();
			expect(matches.hasBeforeHooks()).toBeTruthy();
			expect(matches.beforeHooks.length).toEqual(2);
			expect(matches.hasAfterHooks()).toBeTruthy();
			expect(matches.afterHooks.length).toEqual(3);
		});
		it("should be valid when having a multiple BEFORE/AFTER hooks (async)", () => {
			hookManager.clearHooks();
			registerHook(HookType.Before, "foo", "pkg", false);
			registerHook(HookType.Before, "foo", "pkg", false);
			registerHook(HookType.Before, "foo", "pkg", false);
			registerHook(HookType.After, "foo", "pkg", true);
			registerHook(HookType.After, "foo", "pkg", true);
			registerHook(HookType.Replace, "bar", "pkg", false);
			const matches = hookManager.matchingHooks("foo", "path/lib/pkg");
			expect(matches.hasReplaceHooks()).toBeFalsy();
			expect(matches.hasBeforeHooks()).toBeTruthy();
			expect(matches.beforeHooks.length).toEqual(3);
			expect(matches.hasAfterHooks()).toBeTruthy();
			expect(matches.afterHooks.length).toEqual(2);
		});
		it("should be invalid when mixing sync and async AFTER hooks", () => {
			hookManager.clearHooks();
			registerHook(HookType.Before, "foo", "pkg", false);
			registerHook(HookType.After, "foo", "pkg", false);
			registerHook(HookType.After, "foo", "pkg", false);
			registerHook(HookType.After, "foo", "pkg", true);
			registerHook(HookType.Replace, "bar", "pkg", false);
			expect(() => hookManager.matchingHooks("foo", "path/lib/pkg")).toThrow(
				"For a given target function, AFTER hooks have to be either all sync or all async."
			);
		});
		it("should be invalid when having a more than one REPLACE hook", () => {
			hookManager.clearHooks();
			registerHook(HookType.Replace, "foo", "pkg", false);
			registerHook(HookType.Replace, "foo", "pkg", false);
			expect(() => hookManager.matchingHooks("foo", "path/lib/pkg")).toThrow(
				"For a given target function, one REPLACE hook can be configured. Found: 2"
			);
		});
		it("should be invalid when mixing REPLACE hooks with BEFORE hooks", () => {
			hookManager.clearHooks();
			registerHook(HookType.Replace, "foo", "pkg", false);
			registerHook(HookType.Before, "foo", "pkg", false);
			expect(() => hookManager.matchingHooks("foo", "path/lib/pkg")).toThrow(
				"For a given target function, REPLACE hooks cannot be mixed up with BEFORE/AFTER hooks. Found 1 REPLACE hooks and 1 BEFORE/AFTER hooks"
			);
		});
		it("should be invalid when mixing REPLACE hooks with AFTER hooks", () => {
			hookManager.clearHooks();
			registerHook(HookType.Replace, "foo", "pkg", false);
			registerHook(HookType.After, "foo", "pkg", false);
			expect(() => hookManager.matchingHooks("foo", "path/lib/pkg")).toThrow(
				"For a given target function, REPLACE hooks cannot be mixed up with BEFORE/AFTER hooks. Found 1 REPLACE hooks and 1 BEFORE/AFTER hooks"
			);
		});
	});
});

function registerHook(
	hookType: HookType,
	target: string,
	pkg: string,
	isAsync: boolean
) {
	switch (hookType) {
		case HookType.Before:
			hookManager.registerHook(HookType.Before, target, pkg, isAsync, () => {});
			break;
		case HookType.Replace:
			hookManager.registerHook(
				HookType.Replace,
				target,
				pkg,
				isAsync,
				() => {}
			);
			break;
		case HookType.After:
			hookManager.registerHook(HookType.After, target, pkg, isAsync, () => {});
	}
}
