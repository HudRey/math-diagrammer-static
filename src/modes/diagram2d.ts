import type { ModeProducer } from "./index";

export const diagram2dProducer: ModeProducer = {
  mode: "diagram2d",
  label: "2D Diagram",
  placeholder:
    "Example: Draw a rectangle for a perimeter problem. Label top = 12 cm, left = 7 cm, right = 7 cm, bottom = x cm.",
  example:
    "Draw a rectangle for a perimeter problem. Label top = 12 cm, left = 7 cm, right = 7 cm, bottom = x cm.",
  async produce({ description, fetchDiagram }) {
    if (!fetchDiagram) throw new Error("fetchDiagram() not provided for diagram2d mode.");
    return await fetchDiagram(description);
  },
};
