import type { ModeProducer } from "./index";

export const scene3dProducer: ModeProducer = {
  mode: "scene3d",
  label: "3D (Coming soon)",
  placeholder: "Example: Draw a rectangular prism with length 8, width 5, height 3. Label edges.",
  example: "Draw a rectangular prism with length 8, width 5, height 3. Label length, width, height. Show hidden edges dashed.",
  async produce() {
    throw new Error("3D mode not implemented yet.");
  },
};
