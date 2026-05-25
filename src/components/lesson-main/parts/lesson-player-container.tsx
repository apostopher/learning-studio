import { useAtom } from "jotai";
import { atom } from "jotai";
import { useCallback } from "react";
import { AnimatePresence } from "motion/react";
import { VideoPlayerContainer } from "#/components/video-player";
import { DebriefOverlay } from "#/components/video-player/parts/debrief-overlay";
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
  const isGenerating = useIsGenerating();
  const currentTest = useCurrentTest();
  const generateTest = useGenerateTest();
  const { data: material } = useLessonMaterial(lessonSlug);

  const onEnded = useCallback(() => {
    setVideoEnded(true);
  }, [setVideoEnded]);

  const onDebrief = useCallback(async () => {
    if (!material?.keyPoints?.length || !material?.text) return;
    await generateTest(lessonSlug, material.keyPoints, material.text);
  }, [generateTest, lessonSlug, material]);

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
