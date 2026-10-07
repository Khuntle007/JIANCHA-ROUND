// Background jobs live in a Node-only module (see instrumentation-node.ts).
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./instrumentation-node');
  }
}
