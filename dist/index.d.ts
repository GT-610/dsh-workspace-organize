import { Context } from "@deepseek-ai/cordis";
//#region src/index.d.ts
/** Activation waits for the web carrier so the route registers on first boot. */
declare const inject: string[];
/**
 * Plugin apply: register the route and return its disposer.
 * @param ctx - Host Cordis context.
 * @returns route disposer.
 */
declare function apply(ctx: Context): (() => void) | undefined;
//#endregion
export { apply, inject };
//# sourceMappingURL=index.d.ts.map