/**
 * States that the gates were bypassed because the viewer is an admin.
 *
 * Decision #15 made the bypass silent-by-default a defect rather than a
 * convenience: an admin who sees content cannot otherwise tell a working gate
 * from a broken one, which makes the whole feature untestable by the people who
 * author it. The server has always returned `adminBypass`; nothing rendered it.
 *
 * Deliberately one modest line, not a banner — the admin is here to read the
 * lesson, not to be told about their own permissions.
 *
 * Presentational and hookless (see Global Constraints).
 */
export const AdminPreviewNote = () => (
  <p className="text-xs text-tertiary">Admin preview &mdash; gates bypassed</p>
);
