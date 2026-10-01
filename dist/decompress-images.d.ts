import type { ExtensionContext, SessionEntry } from "@earendil-works/pi-coding-agent";
/** Pi image content block (pi-ai ImageContent). */
export interface ImageBlock {
    type: "image";
    data: string;
    mimeType: string;
}
export interface RestoredImage {
    /** Display label of the source message: its mNNNNN ref when known, else the raw id. */
    label: string;
    image: ImageBlock;
}
/** Inline budget for images returned as tool-result image blocks. Anything
 *  beyond goes to files the model can open with the read tool — a decompress
 *  must never push a request past the provider's image count / byte limits. */
export declare const MAX_INLINE_IMAGES = 8;
export declare const MAX_INLINE_IMAGE_BYTES: number;
/** Image blocks carried by a session entry (user / toolResult messages and
 *  content-array custom messages). Folding projects only text into the kernel,
 *  so these bytes survive solely in the append-only session log. */
export declare function imagesOfEntry(entry: unknown): ImageBlock[];
/** Resolve session entries by base id with the same fallbacks decompress uses
 *  for text: full tree (getEntry) → active branch → ancestor logs (#531) →
 *  fork-host live-ref aliases (#579). Order of the returned map follows `baseIds`. */
export declare function resolveEntriesByBaseId(baseIds: string[], ctx: ExtensionContext): Promise<Map<string, SessionEntry>>;
/** Collect restorable images for the given message ids (CoreMessage ids; the
 *  `#callId` suffix of split assistants is ignored — assistants carry no images). */
export declare function collectImages(messageIds: string[], ctx: ExtensionContext, refLabel: (rawId: string) => string): Promise<RestoredImage[]>;
export interface ImageDelivery {
    /** Text appended to the decompress result describing what was restored. */
    note: string;
    /** Image blocks to return in the tool result (inline delivery). */
    blocks: ImageBlock[];
}
/** Deliver restored images. `inline` returns up to the inline budget as image
 *  blocks (the model sees pixels again) and writes the rest to files; file mode
 *  writes every image to a file the read tool can open (keeps the default
 *  decompress cheap, matching its text behavior). */
export declare function deliverImages(images: RestoredImage[], mode: "inline" | "file", dir: string, prefix: string): Promise<ImageDelivery>;
