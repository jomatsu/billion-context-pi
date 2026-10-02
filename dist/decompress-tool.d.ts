import { Type } from "typebox";
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import type { AcpRuntime } from "./runtime.js";
import { type ToolPromptOverrides } from "./surface.js";
declare const DecompressParams: Type.TObject<{
    blockId: Type.TString;
    full: Type.TOptional<Type.TBoolean>;
    toFile: Type.TOptional<Type.TString>;
    inline: Type.TOptional<Type.TBoolean>;
}>;
export declare function makeDecompressTool(runtime: AcpRuntime, overrides?: ToolPromptOverrides): ToolDefinition<typeof DecompressParams>;
/** Resolve an mNNNNN message ref (as shown in acp tags / compress image
 *  notes) to its raw id. Refs are never recycled and the kernel widens the
 *  ref space rather than capping it, so any digit count is accepted. */
export declare function resolveMRef(arg: string, byRef?: Record<string, string>): string | undefined;
export {};
