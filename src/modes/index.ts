import type { DiagramSpec } from "../renderDiagram";

export type Mode = "diagram2d" | "graph" | "scene3d";

export type ModeProducer = {
  mode: Mode;
  label: string;
  placeholder: string;
  example: string;
  // returns a DiagramSpec without caring *how* it was created
  produce: (args: {
    description: string;
    canvasWidth: number;
    canvasHeight: number;
    // token-enabled producer can use fetch via callback
    fetchDiagram?: (description: string) => Promise<DiagramSpec>;
  }) => Promise<DiagramSpec>;
};
