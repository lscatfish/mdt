/**
 * Zero-tool bootstrap — keep the FIRST top-level model request on an EMPTY
 * tool surface and free of auto-injected workspace/skill context, then expose
 * the full preset catalog (and the normal context injections) once the anchor
 * turn has produced its first durable assistant message.
 *
 * This is the extra test mode behind `zero-anchored-standard`: the anchor
 * plugin seeds a fixed user message and this filter strips the whole catalog,
 * so the first real request follows the zero-injection "we" trajectory. After
 * that assistant response is durable, every later request sees the full
 * Standard catalog.
 *
 * The same phase gate also strips AUTO-INJECTED context on request #1:
 * `suppressedContextSources` lists the `agent/pre-step` message sources the
 * filter removes while the session is unpromoted. The defaults are the two
 * automatic injections Standard adds over Minimal — the available-skills
 * reminder (`skill-catalog`) and the workspace instruction digest
 * (`agent-instructions`). User-initiated skill gestures are not filtered, and
 * both injections return unchanged after promotion. Set the list to [] to
 * disable the context filter while keeping the zero-tool bootstrap.
 *
 * Robustness:
 *  - Promotion decisions are memoized per session id for this process; the
 *    durable event scan runs once per session per process, then O(1).
 *  - Subagents and non-top-level agents always see the full catalog: their
 *    first request must be able to call tools.
 *  - A filter failure degrades to the full catalog / kept context with a
 *    one-time warning, so a bug can never brick a session or eat the user's
 *    context.
 *  - Invalid `suppressedContextSources` values fail at apply time, i.e. at
 *    preset mount, where they are visible and fixable.
 */

/** Cordis plugin name used by loader diagnostics. */
export const name = 'zero-tool-bootstrap'

/**
 * Deliberately NO inject list: the listeners only touch services at event
 * time. Applying without an inject — combined with this row being FIRST in
 * agent.cordis.yml — registers the plugin before dsh-agent-instructions and
 * dsh-tool-skill, and waterfall after-next transforms apply in reverse
 * registration order, so the first-request strip below is the LAST transform.
 * The pre-step listener additionally registers with `prepend: true` so the
 * strip stays the outermost transform even against host-plane listeners and
 * future row reordering.
 */
export const inject = []

/**
 * Context sources stripped from the first request by default. Both are
 * automatic `agent/pre-step` injections: the available-skills reminder
 * (`skill-catalog`) and the AGENTS.md/CLAUDE.md workspace digest
 * (`agent-instructions`). True Minimal mounts neither plugin.
 */
const DEFAULT_SUPPRESSED_SOURCES = ['skill-catalog', 'agent-instructions']

/**
 * Validate the suppressed context sources. Unlike tool lists, an explicitly
 * empty array is meaningful: it disables the context filter while keeping the
 * zero-tool bootstrap.
 */
function sourceList(value, field, fallback) {
  if (value === undefined) return new Set(fallback)
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || item.length === 0)) {
    throw new TypeError(`${name}: ${field} must be an array of non-empty strings`)
  }
  return new Set(value)
}

/** Register the per-session bootstrap filters. */
export function apply(ctx, config) {
  const suppressedSources = sourceList(config.suppressedContextSources, 'suppressedContextSources', DEFAULT_SUPPRESSED_SOURCES)

  /** Sessions already promoted in this process. Promotion is append-only, so a Set is sound. */
  const promoted = new Set()
  let warned = false
  const warnOnce = (message) => {
    if (warned) return
    warned = true
    try {
      ctx.logger.warn(message)
    } catch {
      // Logger unavailable — the guard exists only to avoid spamming.
    }
  }

  /**
   * Whether the session has reached the promoted (full-catalog) phase.
   * @param agent - the assembly context's agent, or undefined outside an agent.
   */
  const isPromoted = (agent) => {
    if (agent === undefined) return true
    const session = agent.session
    if (session === undefined) return true
    // Subagents keep their full catalog from their very first request.
    if ((session.header.delegationDepth ?? 0) > 0) return true
    if (promoted.has(session.id)) return true
    const hit = session.events.some((event) => event.type === 'assistant/message')
    if (hit) promoted.add(session.id)
    return hit
  }

  ctx.on('system-prompt/assemble', async (_assembly, context, next) => {
    // Downstream errors propagate untouched; only this filter's own logic is guarded.
    const assembled = await next()
    try {
      if (isPromoted(context.agent)) return assembled
      return { ...assembled, tools: [] }
    } catch (error) {
      // A filter bug must never brick a session: degrade to the full catalog.
      warnOnce(`${name}: bootstrap filter failed, exposing the full catalog: ${String((error && error.message) || error)}`)
      return assembled
    }
  })

  // Strip first-step injected reminders (skill catalog, AGENTS.md) during
  // bootstrap. Because this listener is the first registered (see the inject
  // note, the row order in agent.cordis.yml, and `prepend` below), the strip
  // is the final waterfall transform and actually removes what later
  // listeners inject.
  ctx.on('agent/pre-step', async ({ agent }, next) => {
    // Downstream errors propagate untouched; only this filter's own logic is guarded.
    const decision = await next()
    if (decision.kind === 'reject') return decision
    try {
      if (isPromoted(agent) || suppressedSources.size === 0) return decision
      if (!Array.isArray(decision.messages)) return decision
      const kept = decision.messages.filter((message) => {
        const kind = message?.source?.kind
        return typeof kind !== 'string' || !suppressedSources.has(kind)
      })
      return kept.length === decision.messages.length ? decision : { ...decision, messages: kept }
    } catch (error) {
      // A filter bug must never eat context: degrade to keeping every message.
      warnOnce(`${name}: pre-step context filter failed, keeping injected context: ${String((error && error.message) || error)}`)
      return decision
    }
  }, { prepend: true })
}
