import type { ToolDefinition, ToolResult } from "./ToolRegistry";
import { resolveFolderId } from "./utils";
import { syncService } from "../SyncService.js";

// Dedicated "move a recording/note into a folder" tool. update_note can also move via its
// optional `folder`, but a purpose-built tool triggers far more reliably for phrasings like
// "move the Ali Zahir recording into Developers" — especially on smaller local models — and
// matches the mobile app's explicit move-to-folder behavior. The folder is auto-created when
// it doesn't exist, and resolution stays within the note's own space so a move never crosses
// spaces. Find the note id with search_notes first when it isn't already in context.
export const moveNoteTool: ToolDefinition = {
  name: "move_note",
  description:
    "Move a note or recording into a folder. Call list_folders first and reuse an existing folder whenever one is a reasonable fit (tolerant of case/plurals/typos); only pass a new name when nothing fits — it is created automatically. Use the note ID from context if provided; otherwise call search_notes first to find it by name.",
  parameters: {
    type: "object",
    properties: {
      id: {
        type: "number",
        description: "The ID of the note/recording to move",
      },
      folder: {
        type: "string",
        description: "Folder name to move the note into. Created automatically if it does not exist.",
      },
    },
    required: ["id", "folder"],
    additionalProperties: false,
  },
  readOnly: false,

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const id = args.id as number;
    const folderName = args.folder as string | undefined;

    if (!folderName || !folderName.trim()) {
      return { success: false, data: null, displayText: "A folder name is required to move the note" };
    }

    try {
      const note = await window.electronAPI.getNote(id);
      if (!note) {
        return { success: false, data: null, displayText: `Note with ID ${id} not found` };
      }

      // Resolve within the note's own space so a move by name never drags it across spaces.
      const resolved = await resolveFolderId(folderName, { createIfMissing: true }, note.space_id);
      if (resolved.error) {
        return { success: false, data: null, displayText: resolved.error };
      }

      const result = await window.electronAPI.updateNote(id, { folder_id: resolved.folderId });
      if (!result.success) {
        return { success: false, data: null, displayText: "Failed to move note" };
      }

      syncService.debouncedPush("note", id);

      const where = resolved.created ? `new folder "${folderName}"` : `"${folderName}"`;
      return {
        success: true,
        data: { id, folder_id: resolved.folderId, folderCreated: resolved.created },
        displayText: `Moved "${note.title || "note"}" to ${where}`,
      };
    } catch (error) {
      return {
        success: false,
        data: null,
        displayText: `Failed to move note: ${(error as Error).message}`,
      };
    }
  },
};
