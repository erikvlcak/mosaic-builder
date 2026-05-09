import type { Dispatch } from "react";
import type { Annotation } from "../../model/annotations";
import type { FigureAction } from "../../model/figure-actions";
import type { FieldCommit } from "../../hooks/useFieldCommit";
import { TextAnnoForm } from "./TextAnnoForm";
import { BoxAnnoForm } from "./BoxAnnoForm";
import { ScalebarAnnoForm } from "./ScalebarAnnoForm";

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
    case "symbol":
      // TODO(Task 10): SymbolAnnoForm — gallery + color/size/rotation/stroke.
      return <>(symbol form coming in Task 10)</>;
    case "box":
      return <BoxAnnoForm anno={anno} dispatch={dispatch} commit={commit} />;
    case "scalebar":
      return (
        <ScalebarAnnoForm anno={anno} dispatch={dispatch} commit={commit} />
      );
  }
}
