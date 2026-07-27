type SidebarErrorProps = {
  message?: string;
};

export const SidebarError = ({
  message = "Couldn't load the course",
}: SidebarErrorProps) => (
  <p
    role="alert"
    className="px-sidebar-row-inline py-sidebar-row-block text-sm text-secondary"
  >
    {message}
  </p>
);
