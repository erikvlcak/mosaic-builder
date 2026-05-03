import type { Dispatch } from "react";
import type { Annotation } from "../../model/annotations";
import type { FigureAction } from "../../model/figure-actions";
import type { FieldCommit } from "../../hooks/useFieldCommit";
import { TextAnnoForm } from "./TextAnnoForm";

// Stubs for the not-yet-written forms; Task 8 fills these in.
function ArrowAnnoForm(_p: {
  anno: Extract<Annotation, { kind: "arrow" }>;
  dispatch: Dispatch<FigureAction>;
  commit: FieldCommit;
}): JSX.Element {
  return <em>Arrow form coming in Task 8</em>;
}
function BoxAnnoForm(_p: {
  anno: Extract<Annotation, { kind: "box" }>;
  dispatch: Dispatch<FigureAction>;
  commit: FieldCommit;
}): JSX.Element {
  return <em>Box form coming in Task 8</em>;
}
function ScalebarAnnoForm(_p: {
  anno: Extract<Annotation, { kind: "scalebar" }>;
  dispatch: Dispatch<FigureAction>;
  commit: FieldCommit;
}): JSX.Element {
  return <em>Scale-bar form coming in Task 8</em>;
}

interface Props {
  anno: Annotation;
  dispatch: Dispatch<FigureAction>;
  commit: FieldCommit;
}

export function AnnotationPropertiesForm({
  anno,
  dispatch,
  commit,
}: Props): JSX.Element {
  switch (anno.kind) {
    case "text":
      return <TextAnnoForm anno={anno} dispatch={dispatch} commit={commit} />;
    case "arrow":
      return <ArrowAnnoForm anno={anno} dispatch={dispatch} commit={commit} />;
    case "box":
      return <BoxAnnoForm anno={anno} dispatch={dispatch} commit={commit} />;
    case "scalebar":
      return (
        <ScalebarAnnoForm anno={anno} dispatch={dispatch} commit={commit} />
      );
  }
}
