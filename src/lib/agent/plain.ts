/** The chat shows plain text, so model output must never carry markdown symbols (#, **, backticks, "- " lists). Keeps the structure, drops the noise. */
export function plainText(s: string): string {
  return s
    .replace(/\r/g, "")
    .replace(/<\/?(?:reply|invoke|parameter|function_calls?|antml:[a-z_]+|thinking|answer|response|output)\b[^>]*>/gi, "") // tool-call tags must never reach the screen
    .replace(/^\s{0,3}#{1,6}\s*(.+?)\s*#*\s*$/gm, "$1")             // ### Heading -> Heading
    .replace(/\*\*(.+?)\*\*/gs, "$1").replace(/__(.+?)__/gs, "$1")   // bold
    .replace(/(^|[^\w*])\*(?!\s)([^*\n]+?)\*(?!\w)/g, "$1$2")          // *italic*
    .replace(/`{1,3}([^`]+?)`{1,3}/gs, "$1")                           // code
    .replace(/^\s*[-*+]\s+/gm, "• ")                                    // bullets
    .replace(/^\s{2,}•/gm, "  •")
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, "$1")                // [text](url) -> text: where an answer came from is never shown
    .replace(/\s*\(\s*(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s()]*)?\s*\(?\s*https?:[^)]*\)+/gi, "")   // (site.com (https://...))
    .replace(/\s*\((?:[a-z0-9-]+\.)+(?:com|org|net|gov|edu|io|co|us|app)(?:\/[^)\s]*)?\)/gi, "")   // (zillow.com)
    .replace(/\s*\(?https?:\/\/[^\s)]+\)?/g, "")                                // bare links
    .replace(/\s*\(\s*\)/g, "")
    .replace(/^\s*(?:sources?|citations?|references?)\s*:.*$/gim, "")
    .replace(/[ \t]+([.,;:!?])/g, "$1")
    .replace(/^\s*[-_*]{3,}\s*$/gm, "")                                // rules
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
