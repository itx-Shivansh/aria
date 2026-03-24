# ARIA Repository Guidance

- Keep renderer UI state in React components and route privileged actions through preload.
- Add any new main-process IPC channels in `src/main.js` and expose typed wrappers in `src/preload.js`.
- Keep agent modules focused and deterministic; route model traffic through `src/api/aiRouter.js`.
- Store durable app state in `src/agent/memoryStore.js`.