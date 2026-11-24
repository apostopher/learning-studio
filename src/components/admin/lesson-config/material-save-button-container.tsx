import { useIsMutating } from '@tanstack/react-query';
import { useAtomValue } from 'jotai';
import {
  lessonMaterialDirtyAtomFamily,
  lessonVersionDraftAtomFamily,
  noLessonVersionDraftAtom,
} from '#/atoms/admin';
import { dataKeys } from '#/data-hooks/keys';
import { lessonMaterialFormId } from './material-form-id';
import { MaterialSaveButton } from './material-save-button';
import { isVersionDirty } from './use-version-gate';

/**
 * The lesson dialog's Save button.
 *
 * It does not own the mutations — `MaterialSectionContainer` does, inside the
 * panel, and the button reaches that form through its id. What it needs from
 * them is only whether one is in flight, which `useIsMutating` reads off the
 * mutation KEY the save hooks register — so two components can agree on
 * "saving" without threading state between panel and sidebar. Whether the
 * form is dirty comes the same way, through a per-lesson atom the panel
 * writes, and so does the typed version.
 */
export const MaterialSaveButtonContainer = ({
  lessonId,
  version,
  fullWidth = false,
}: {
  lessonId: number;
  /** The lesson's version, where the dialog has a Version field; else null. */
  version: string | null;
  /** See `MaterialSaveButton`. */
  fullWidth?: boolean;
}) => {
  const saving = useIsMutating({
    mutationKey: dataKeys.lessonSave(lessonId),
  });
  const isMaterialDirty = useAtomValue(lessonMaterialDirtyAtomFamily(lessonId));
  const draft = useAtomValue(
    version === null
      ? noLessonVersionDraftAtom
      : lessonVersionDraftAtomFamily(lessonId),
  );
  const isDirty =
    isMaterialDirty || (version !== null && isVersionDirty(draft, version));
  return (
    <MaterialSaveButton
      formId={lessonMaterialFormId(lessonId)}
      isSaving={saving > 0}
      isDirty={isDirty}
      fullWidth={fullWidth}
    />
  );
};
