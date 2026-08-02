import { useLibrary } from '#/data-hooks/use-library';
import { computeLibraryState } from './compute-library-state';
import { LibraryPage } from './library-page';

type LibraryPageContainerProps = { courseSlug: string };

export const LibraryPageContainer = ({
  courseSlug,
}: LibraryPageContainerProps) => {
  const { data, isLoading, isError } = useLibrary(courseSlug);

  return (
    <LibraryPage
      courseSlug={courseSlug}
      state={computeLibraryState({
        isLoading,
        isError,
        files: data?.files,
      })}
    />
  );
};
