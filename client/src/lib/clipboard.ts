import { toast } from '../components/Toast'

/**
 * Copy text to the clipboard, awaiting the write so a rejection is handled
 * instead of swallowed. `navigator.clipboard.writeText` rejects in insecure
 * contexts or when permission is denied — callers that don't await it show a
 * false "Copied" state and leak an unhandled rejection. This surfaces a toast
 * + console.error on failure and returns whether the copy actually succeeded,
 * so callers gate their "Copied" feedback on the result.
 */
export async function writeToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch (err) {
    console.error('[clipboard] copy failed:', err instanceof Error ? err.message : err)
    toast('error', 'Copy failed — clipboard access was blocked')
    return false
  }
}
