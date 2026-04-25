import { motion } from "motion/react";
import { X } from "lucide-react";
import type { UpdateAnnouncement } from "../../lib/updater";

type UpdateChangelogOverlayProps = {
  announcement: UpdateAnnouncement;
  onClose: () => void;
};

export function UpdateChangelogOverlay({ announcement, onClose }: UpdateChangelogOverlayProps) {
  return (
    <motion.div
      animate={{ opacity: 1 }}
      aria-labelledby="update-changelog-title"
      aria-modal="true"
      className="update-changelog"
      exit={{ opacity: 0 }}
      initial={{ opacity: 0 }}
      role="dialog"
    >
      <motion.section animate={{ scale: 1, y: 0 }} className="update-changelog__panel" initial={{ scale: 0.96, y: 12 }}>
        <header className="update-changelog__header">
          <div>
            <p>Version v{announcement.version}</p>
            <h2 id="update-changelog-title">SecureLocker updated</h2>
          </div>
          <button aria-label="Close changelog" onClick={onClose} type="button">
            <X aria-hidden="true" />
          </button>
        </header>

        <div className="update-changelog__body">
          <ul>
            {announcement.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </div>

        <footer className="update-changelog__footer">
          <button className="update-changelog__action" onClick={onClose} type="button">
            Close
          </button>
        </footer>
      </motion.section>
    </motion.div>
  );
}
