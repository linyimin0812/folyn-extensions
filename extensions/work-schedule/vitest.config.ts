import { defineConfig } from 'vitest/config';

// Tests render the page with a real React; the build aliases react to the host's window.React.
export default defineConfig({ test: { environment: 'jsdom', include: ['test/**/*.test.{ts,tsx}'] } });
