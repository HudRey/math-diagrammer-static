import type { ModeProducer } from "./index";
import { diagram2dProducer } from "./diagram2d";
import { graphProducer } from "./graph";
import { scene3dProducer } from "./scene3d";

export const PRODUCERS: ModeProducer[] = [diagram2dProducer, graphProducer, scene3dProducer];
