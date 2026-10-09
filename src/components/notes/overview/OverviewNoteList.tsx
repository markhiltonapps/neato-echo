import { useMemo } from "react";
import { FileText, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import MemberAvatar from "../../MemberAvatar";
import { NoteOriginIcon } from "../NoteOriginIcon";
import { formatRelativeTime } from "../../../utils/dateFormatting";
import { useSpaceRoster } from "../../../hooks/useSpaceRoster";
import { useAuth } from "../../../hooks/useAuth";
import type { NoteItem, SpaceItem } from "../../../types/electron";

interface OverviewNoteListProps {
  notes: NoteItem[];
  space: SpaceItem;
  onOpenNote: (noteId: number) => void;
  onNewNote: () => void;
  onAddExisting?: () => void;
}

export function OverviewNoteList({
  notes,
  space,
  onOpenNote,
  onNewNote,
  onAddExisting,
}: OverviewNoteListProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const isTeamSpace = space.kind === "team";
  const roster = useSpaceRoster(isTeamSpace ? space.cloud_space_id : null);

  // Newest-first, no date sub-headers — matches the folder/newest-first grouping used by
  // the sidebar tree and the mobile list, so all three read identically.
  const sorted = useMemo(() => {
    const ts = (n: NoteItem) => new Date(n.created_at || n.updated_at || 0).getTime();
    return [...notes].sort((a, b) => ts(b) - ts(a));
  }, [notes]);

  if (notes.length === 0) {
    return (
      <div className="flex flex-col items-center py-8">
        <p className="text-xs text-foreground/40 dark:text-foreground/30 mb-3">
          {t("notes.overview.list.empty")}
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={onNewNote}
            className="flex items-center gap-1.5 px-4 h-7 rounded-md bg-primary/8 dark:bg-primary/10 border border-primary/12 dark:border-primary/15 text-xs font-medium text-primary/70 hover:bg-primary/12 hover:text-primary hover:border-primary/20 transition-colors"
          >
            <Plus size={11} />
            {t("notes.empty.createNote")}
          </button>
          {onAddExisting && (
            <button
              onClick={onAddExisting}
              className="flex items-center gap-1.5 px-4 h-7 rounded-md border border-foreground/8 dark:border-white/8 text-xs text-foreground/40 hover:text-foreground/60 hover:border-foreground/15 hover:bg-foreground/3 dark:hover:bg-white/3 transition-colors"
            >
              {t("notes.addToFolder.addExisting")}
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="pb-6 pt-2">
      {sorted.map((note) => {
        const authorId = isTeamSpace ? note.updated_by_user_id : null;
        const member = authorId ? roster?.get(authorId) : undefined;
        const isSelf = authorId != null && authorId === user?.id;
        const authorName = isSelf
          ? t("notes.overview.author.you")
          : (member?.name ?? member?.email ?? null);
        return (
          <button
            key={note.id}
            onClick={() => onOpenNote(note.id)}
            className="w-full flex items-center gap-3 px-2 py-2 -mx-2 rounded-md text-left hover:bg-foreground/4 dark:hover:bg-white/4 transition-colors duration-150 focus:outline-none focus-visible:ring-1 focus-visible:ring-ring/30"
          >
            <FileText size={14} className="text-foreground/30 dark:text-foreground/20 shrink-0" />
            <span className="text-[13px] text-foreground/85 truncate flex-1">
              {note.title || t("notes.list.untitled")}
            </span>
            {authorName && (
              <span className="flex items-center gap-1.5 shrink-0">
                <MemberAvatar
                  name={member?.name ?? authorName}
                  email={member?.email ?? ""}
                  image={member?.image}
                  size="sm"
                />
                <span className="text-[11px] text-foreground/40 max-w-28 truncate">
                  {authorName}
                </span>
              </span>
            )}
            {(note.note_type === "meeting" ||
              note.note_type === "upload" ||
              note.audio_duration_seconds != null) && (
              <NoteOriginIcon
                origin={note.origin}
                className="text-foreground/25 dark:text-foreground/20"
              />
            )}
            <span className="text-[11px] text-foreground/35 dark:text-foreground/25 shrink-0 tabular-nums">
              {formatRelativeTime(note.updated_at, t)}
            </span>
          </button>
        );
      })}
    </div>
  );
}
