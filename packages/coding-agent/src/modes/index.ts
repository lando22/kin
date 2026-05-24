/**
 * Public run-mode barrel.
 *
 * Modes are thin hosts around AgentSession: interactive owns the TUI, print owns
 * one-shot CLI output, and RPC owns the programmatic command/event protocol.
 */

export { InteractiveMode, type InteractiveModeOptions } from "./interactive/interactive-mode.ts";
export { type PrintModeOptions, runPrintMode } from "./print-mode.ts";
export { type ModelInfo, RpcClient, type RpcClientOptions, type RpcEventListener } from "./rpc/rpc-client.ts";
export { runRpcMode } from "./rpc/rpc-mode.ts";
export type { RpcCommand, RpcResponse, RpcSessionState } from "./rpc/rpc-types.ts";
