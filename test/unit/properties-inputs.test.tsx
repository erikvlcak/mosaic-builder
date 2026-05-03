// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { useState } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NumberField } from "../../src/renderer/components/Properties/inputs/NumberField";
import { TextField } from "../../src/renderer/components/Properties/inputs/TextField";
import { ColorField } from "../../src/renderer/components/Properties/inputs/ColorField";
import { SelectField } from "../../src/renderer/components/Properties/inputs/SelectField";
import { CornerField } from "../../src/renderer/components/Properties/inputs/CornerField";

// NOTE on test mechanisms:
//   - userEvent.type/click/selectOptions: preferred where supported.
//   - fireEvent.change: used for NumberField (jsdom doesn't support selection
//     APIs on <input type="number">, so userEvent.clear+type misbehaves) and for
//     ColorField (the regex rejects every intermediate keystroke, so per-character
//     typing never advances the controlled `value`). In both cases fireEvent.change
//     sets the DOM value directly, which is what a paste/instant-set would do.

describe("NumberField", () => {
  it("clamps within [min,max] and calls onChange with parsed number", () => {
    const onChange = vi.fn();
    render(<NumberField label="Size" value={10} min={1} max={20} onChange={onChange} />);
    const input = screen.getByLabelText("Size") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "15" } });
    expect(onChange).toHaveBeenLastCalledWith(15);
    fireEvent.change(input, { target: { value: "999" } });
    expect(onChange).toHaveBeenLastCalledWith(20);
  });

  it("ignores non-numeric input (does not call onChange with NaN)", () => {
    const onChange = vi.fn();
    render(<NumberField label="X" value={5} onChange={onChange} />);
    const input = screen.getByLabelText("X") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "abc" } });
    fireEvent.change(input, { target: { value: "" } });
    for (const c of onChange.mock.calls) expect(Number.isNaN(c[0])).toBe(false);
  });
});

function ControlledText({ onChange }: { onChange: (s: string) => void }): JSX.Element {
  const [v, setV] = useState("");
  return (
    <TextField
      label="Caption"
      value={v}
      onChange={(s) => { setV(s); onChange(s); }}
    />
  );
}

describe("TextField", () => {
  it("emits each typed character via onChange", async () => {
    const onChange = vi.fn();
    render(<ControlledText onChange={onChange} />);
    const input = screen.getByLabelText("Caption");
    await userEvent.type(input, "hi");
    expect(onChange).toHaveBeenCalledWith("h");
    expect(onChange).toHaveBeenCalledWith("hi");
  });
});

describe("ColorField", () => {
  it("rejects invalid hex from the text input", () => {
    const onChange = vi.fn();
    render(<ColorField label="C" value="#FF0000" onChange={onChange} />);
    const text = screen.getByLabelText("C hex") as HTMLInputElement;
    fireEvent.change(text, { target: { value: "not-a-color" } });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.change(text, { target: { value: "#00FF00" } });
    expect(onChange).toHaveBeenLastCalledWith("#00FF00");
  });
});

describe("SelectField", () => {
  it("emits the chosen value", async () => {
    const onChange = vi.fn();
    render(
      <SelectField label="Fit" value="contain"
        options={[
          { value: "contain", label: "Contain" },
          { value: "cover", label: "Cover" },
        ] as const}
        onChange={onChange} />,
    );
    await userEvent.selectOptions(screen.getByLabelText("Fit"), "cover");
    expect(onChange).toHaveBeenLastCalledWith("cover");
  });
});

describe("CornerField", () => {
  it("emits the picked corner", async () => {
    const onChange = vi.fn();
    render(<CornerField label="Corner" value="tl" onChange={onChange} />);
    await userEvent.click(screen.getByLabelText("Bottom-right"));
    expect(onChange).toHaveBeenLastCalledWith("br");
  });
});
