/** A cheap "is an AI key set" check that reads the environment every time and never builds the provider (safe to call while text is being routed). */
export const aiConfigured = (): boolean => Boolean(process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY);
