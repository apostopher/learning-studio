/**
 * The DOM id of a lesson's material `<form>`, shared by the form and the
 * Save button that lives outside it — pinned to the bottom of the config
 * modal's sidebar so it stays in view however far the material scrolls.
 * A button submits a form it is not inside through the `form` attribute,
 * which needs exactly this id on both sides.
 */
export const lessonMaterialFormId = (lessonId: number) =>
  `lesson-material-form-${lessonId}`;
