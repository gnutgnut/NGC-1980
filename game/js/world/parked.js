// ngc/wheeledgame: which of the WORLD's parked garden cars (layout.js garden(): { t: 'car', x, z, yaw, paint }) are real,
// drivable 1980 cars rather than part of the chunk's merged geometry. Decided by a position hash (no rng draws, so the
// towns generate exactly as before, on every thread): chunkgen.js leaves these out and units/wheeled/motorpool.js parks
// a real Land Rover / Hilux / Beetle / Lada there when the player comes near.
import { hash2 } from './rng.js';
export const isDrivableCar = it => it.t === 'car' && hash2(Math.round(it.x * 2), Math.round(it.z * 2), 4417) < 0.5;
// which of the four for this spot (0 landrover, 1 hilux, 2 beetle, 3 lada) and a paint index
export const drivableCarKind = it => Math.floor(hash2(Math.round(it.x * 2), Math.round(it.z * 2), 4421) * 4);
export const drivableCarPaint = it => Math.floor(hash2(Math.round(it.x * 2), Math.round(it.z * 2), 4423) * 6);
