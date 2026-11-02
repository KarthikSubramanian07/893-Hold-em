// The rules engine for the browser, fetched on first use. Both imports are
// dynamic so the glue and the .wasm file stay out of every bundle until a
// practice table actually opens.
import type { EngineModule } from './local';

let loading: Promise<EngineModule> | null = null;

export function loadEngine(): Promise<EngineModule> {
  loading ??= (async () => {
    const [glue, wasm] = await Promise.all([
      import('../../../crates/wasm/pkg/hachi_wasm.js'),
      import('../../../crates/wasm/pkg/hachi_wasm_bg.wasm?url'),
    ]);
    await glue.default({ module_or_path: wasm.default });
    const mod: EngineModule = {
      create: (code, seed) => new glue.Table(code, seed),
      load: (saved) => glue.Table.load(saved),
    };
    return mod;
  })().catch((err: unknown) => {
    loading = null; // Let the next attempt try the network again.
    throw err;
  });
  return loading;
}
