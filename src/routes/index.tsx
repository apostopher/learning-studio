import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "../components/app-shell";
import { appTitle } from "../styles/theme.generated";
import { useCourseDetails } from "#/hooks/data/use-course-details";

export const Route = createFileRoute("/")({ component: App });

function App() {
  const { data: courseDetails } = useCourseDetails("3d-airmanship");
  console.log(courseDetails);
  return (
    <AppShell
      header={<div className="flex items-center gap-3 h-full ps-4 pe-4"></div>}
      aside={<nav aria-label="Primary" className="p-3"></nav>}
      main={null}
      footer={
        <div className="flex items-center justify-between h-full ps-4 pe-4 text-gray-11 text-sm">
          <span>© {appTitle}</span>
        </div>
      }
    />
  );
}
