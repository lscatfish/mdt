/**
 * Seed one zero-tool anchor turn when the FIRST user message arrives.
 *
 * The anchor is PREPENDED ahead of the real message, so the first REAL model
 * request still carries an empty tool catalog (see zero-tool-bootstrap.mjs)
 * and follows the zero-injection "we" trajectory. Waiting for the first user
 * message — instead of anchoring at session creation — keeps the blank-session
 * window open, so the user can still switch presets before typing. Once the
 * anchor response is durable, the bootstrap exposes the full Standard catalog
 * and the real message proceeds with tools.
 */

/** Cordis plugin name used by loader diagnostics. */
export const name = 'anchor-turn'

/**
 * Default anchor text shown to the model in the synthetic first user turn.
 * An injected session-level reasoning contract: it rides the zero-tool first
 * request as a user message, then stays in history so the contract wording
 * reaches every later tool-bearing turn. The `<system-reminder>` tag mirrors
 * the format dsh-agent-instructions and the skill catalog use, which the
 * model follows most reliably; the contract names the exact forbidden forms
 * (`I`/`let me`) and the required openings (`we`/`let's`), and declares
 * session-long scope.
 */
export const ANCHOR_TEXT = [
  '<system-reminder>',
  'Session reasoning contract (applies to every turn, including tool turns, until the session ends):',
  'reason in first-person plural only — "we", "let\'s", "our".',
  'Never use first-person singular — "I", "let me", "my".',
  'Begin every analysis with "We need". This is the working mode of this session, not optional style.',
  '</system-reminder>',
].join('\n')

/** Only top-level fresh sessions (no prior user message) get the anchor turn. */
function isFreshTopLevel(agent) {
  if ((agent.session.header.delegationDepth ?? 0) > 0) return false
  return !agent.session.events.some((event) => event.type === 'user/message')
}

/** Register the first-message anchor injection. */
export function apply(ctx, config) {
  const text = typeof config.text === 'string' && config.text.length > 0
    ? config.text
    : ANCHOR_TEXT

  ctx.on('agent/inbox/inserted', ({ agent, message }) => {
    if (!isFreshTopLevel(agent)) return
    // Never re-anchor on plugin-sourced messages (including our own anchor).
    if (message.source?.kind === 'plugin') return
    agent.inbox.prepend('next-turn', {
      id: crypto.randomUUID(),
      role: 'user',
      content: [{ type: 'text', text }],
      source: {
        kind: 'plugin',
        plugin: 'anchor-turn',
        form: 'notice',
        summary: 'zero-tool anchor turn',
      },
    })
  })
}
