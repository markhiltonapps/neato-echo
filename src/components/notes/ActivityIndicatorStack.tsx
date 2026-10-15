import TranscriptionJobIndicator from "./TranscriptionJobIndicator";
import NoteEnhanceIndicator from "./NoteEnhanceIndicator";

interface ActivityIndicatorStackProps {
  onOpenNote: (noteId: number, folderId?: number | null) => void;
  // Hide the transcription card on the Upload view (it renders the job inline).
  suppressTranscription?: boolean;
  // The note open in the notes view, so the enhance card can hide for it.
  viewingNoteId?: number | null;
}

/**
 * Bottom-right stack of ambient background-work cards (upload transcription and
 * note enhancement), so long-running jobs stay visible from any tab. Each child
 * renders nothing when its work isn't active.
 */
export default function ActivityIndicatorStack({
  onOpenNote,
  suppressTranscription,
  viewingNoteId,
}: ActivityIndicatorStackProps) {
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-2">
      <NoteEnhanceIndicator onOpenNote={(id) => onOpenNote(id)} viewingNoteId={viewingNoteId} />
      <TranscriptionJobIndicator onOpenNote={onOpenNote} suppressed={suppressTranscription} />
    </div>
  );
}
