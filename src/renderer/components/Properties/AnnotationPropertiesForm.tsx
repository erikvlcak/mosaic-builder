import type { Dispatch } from "react";
import type { Annotation } from "../../model/annotations";
import type { FigureAction } from "../../model/figure-actions";
import type { FieldCommit } from "../../hooks/useFieldCommit";
import { TextAnnoForm } from "./TextAnnoForm";
import { SymbolAnnoForm } from "./SymbolAnnoForm";
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
      return <SymbolAnnoForm anno={anno} dispatch={dispatch} commit={commit} />;
    case "box":
      return <BoxAnnoForm anno={anno} dispatch={dispatch} commit={commit} />;
    case "scalebar":
      return (
        <ScalebarAnnoForm anno={anno} dispatch={dispatch} commit={commit} />
      );
  }
}
