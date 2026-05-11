export function applyPatch<TContext>(context: TContext, patch?: Partial<TContext>): TContext {
    if (!patch) return context
    return { ...context, ...patch }
}
