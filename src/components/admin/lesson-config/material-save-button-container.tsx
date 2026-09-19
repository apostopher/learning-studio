import { useIsMutating } from '@tanstack/react-query';
import { useAtomValue } from 'jotai';
import { lessonMaterialDirtyAtomFamily } from '#/atoms/admin';
import { dataKeys } from '#/data-hooks/keys';
import { lessonMaterialFormId } from './material-form-id';
import { MaterialSaveButton } from './material-save-button';

/**
 * The sidebar's Save button for a lesson's material.
 *
 * It does not own the mutation — `MaterialSectionContainer` does, inside the
 * panel, and the button reaches that form through its id. What it needs from
 * the mutation is only whether one is in flight, which `useIsMutating` reads
 * off the mutation KEY the save hook registers — so two components can agree
 * on "saving" without threading state between panel and sidebar. Whether the
 * form is dirty comes the same way, through a per-lesson atom the panel writes.
 */
export const MaterialSaveButtonContainer = ({
  lessonId,
  fullWidth = false,
}: {
  lessonId: number;
  /** See `MaterialSaveButton`. */
  fullWidth?: boolean;
}) => {
  const saving = useIsMutating({
    mutationKey: dataKeys.lessonMaterialSave(lessonId),
  });
  const isDirty = useAtomValue(lessonMaterialDirtyAtomFamily(lessonId));
  return (
    <MaterialSaveButton
      formId={lessonMaterialFormId(lessonId)}
      isSaving={saving > 0}
      isDirty={isDirty}
      fullWidth={fullWidth}
    />
  );
};
