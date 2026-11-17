// Every gait the cat can run, behind one interface for the rig and the page.
import * as gallop from './gait.js';
import { headNeckPose } from './head-neck.js';
import { tailPose } from './tail.js';
import * as walk from './walk.js';

export const GAITS = {
  gallop: { ...gallop, headNeckPose, tailPose,
    // Key poses: phase and the interface text key for each.
    keyframes: [[0.029, 'key1'], [0.28, 'key2'], [0.50, 'key3'], [0.72, 'key4']] },
  walk: { ...walk,
    keyframes: [[0, 'walk1'], [0.25, 'walk2'], [0.5, 'walk3'], [0.75, 'walk4']] },
};
