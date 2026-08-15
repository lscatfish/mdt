/**
 * Reasoning-contract section — register the injected contract as the FIRST
 * system-prompt section (order -200, ahead of the harness identity at -100),
 * so the contract opens the prompt while every other Standard section
 * (harness identity, checkout path, GUI description, tool guidance) stays
 * intact.
 *
 * The contract previously lived inside the persona text behind `complete:
 * true`, which shrank the whole system prompt to the persona alone. A
 * dedicated section ordered below the identity keeps the full Standard
 * prompt and still puts the contract first.
 */

/** Cordis plugin name used by loader diagnostics. */
export const name = 'contract-section'

/** The prompt registry this row contributes to. */
export const inject = ['systemPrompt']

/**
 * Default contract text shown when config.text is absent: the variant-B
 * contract, which forbids only the hesitant executor form and leaves first
 * person free.
 */
export const DEFAULT_CONTRACT = [
  '<system-reminder>',
  'Session reasoning contract (applies to every turn, including tool turns, until the session ends):',
  'reason in first-person singular ("I", "I\'ll", "I\'m", "I\'ve", "I should", "I need") or first-person plural ("we", "let\'s") — both are fine.',
  'Never open a sentence with "let me" — say "I\'ll" or "I" instead.',
  'Begin every analysis with a direct first-person statement. This is the working mode of this session, not optional style.',
  '</system-reminder>',
].join('\n')

/** Register the contract section ahead of the harness identity. */
export function apply(ctx, config) {
  const text = typeof config.text === 'string' && config.text.length > 0
    ? config.text
    : DEFAULT_CONTRACT

  ctx.effect(() => ctx.systemPrompt.section({
    name: 'preset:reasoning-contract',
    order: -200,
    text,
  }), 'contract-section.section()')
}
