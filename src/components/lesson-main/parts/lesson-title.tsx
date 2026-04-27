type LessonTitleProps = {
  name: string;
};

export const LessonTitle = ({ name }: LessonTitleProps) => (
  <h1 className="lesson-title">{name}</h1>
);
