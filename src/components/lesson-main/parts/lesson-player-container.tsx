import { useAtom, useSetAtom } from "jotai";
import { atom } from "jotai";
import { useCallback } from "react";
import { AnimatePresence } from "motion/react";
import { VideoPlayerContainer } from "#/components/video-player";
import { DebriefOverlay } from "#/components/video-player/parts/debrief-overlay";
import { lessonMaterialRef } from "#/components/lesson-material/lesson-material-wrapper";
import { activeTabAtom } from "#/atoms/lesson-ai-test";
import { useLessonMaterial } from "#/hooks/data/use-lesson-material";
import {
  useGenerateTest,
  useIsGenerating,
  useCurrentTest,
} from "#/hooks/data/use-lesson-ai-test";
import type { VideoFetchState } from "../types";

const videoEndedAtom = atom(false);

type LessonPlayerContainerProps = {
  videoState: Extract<VideoFetchState, { status: "ready" }>;
  lessonSlug: string;
};

export const LessonPlayerContainer = ({
  videoState,
  lessonSlug,
}: LessonPlayerContainerProps) => {
  const [videoEnded, setVideoEnded] = useAtom(videoEndedAtom);
  const setActiveTab = useSetAtom(activeTabAtom);
  const isGenerating = useIsGenerating();
  const currentTest = useCurrentTest();
  const generateTest = useGenerateTest();
  const { data: material } = useLessonMaterial(lessonSlug);

  const onEnded = useCallback(() => {
    setVideoEnded(true);
  }, [setVideoEnded]);

  const onDebrief = useCallback(async () => {
    if (!material?.keyPoints?.length || !material?.text) return;
    const test = await generateTest(lessonSlug, material.keyPoints, material.text);
    if (test) {
      setActiveTab("quiz");
      queueMicrotask(() => {
        lessonMaterialRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      });
    }
  }, [generateTest, lessonSlug, material, setActiveTab]);

  const showDebrief = videoEnded && !currentTest;

  return (
    <VideoPlayerContainer
      src={videoState.src}
      poster={videoState.poster}
      tracks={videoState.tracks}
      onEnded={onEnded}
      overlay={
        <AnimatePresence>
          {showDebrief ? (
            <DebriefOverlay loading={isGenerating} onDebrief={onDebrief} />
          ) : null}
        </AnimatePresence>
      }
    />
  );
};
